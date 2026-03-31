// ===== ドイツ軍AI シナリオ2: カーンの逆襲 =====
// 方針:
// 1. 突破（西端col<=1で離脱）→ 最高得点
// 2. より西に位置する → 高得点
// 3. 近い敵に移動・攻撃 → 高得点
// 4. 混乱ユニットはLOS外の遮蔽地形で回復 → 高得点
// 5. 同種ユニット同士でスタック → 高得点
// 6. 敵LOSを避けて迂回移動 → 高得点
// 7. 高確率なら突撃も併用

// ===== Q学習統合 =====

// 状態エンコード（ブラウザ版）
function pgEncodeState(side) {
  const alive = testUnits.filter(u => u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader');
  const ger = alive.filter(u => u.side === 'german');
  const all = alive.filter(u => u.side === 'allied');
  const turnBin = Math.min(6, G.turn);
  const avgCol = ger.length > 0 ? ger.reduce((s, u) => s + u.col, 0) / ger.length : 30;
  const advanceBin = Math.min(5, Math.floor((30 - avgCol) / 5));
  const total = ger.length + all.length;
  const ratio = total > 0 ? ger.length / total : 0.5;
  const ratioBin = ratio < 0.3 ? 0 : ratio < 0.5 ? 1 : ratio < 0.7 ? 2 : 3;
  const bt = G.breakthroughCount || 0;
  const btBin = bt < 1 ? 0 : bt < 3 ? 1 : bt < 5 ? 2 : 3;
  const sideUnits = side === 'german' ? ger : all;
  const disrupted = sideUnits.filter(u => u.status === 'd' || u.status === 'dd').length;
  const dRatio = sideUnits.length > 0 ? disrupted / sideUnits.length : 0;
  const dBin = dRatio < 0.2 ? 0 : dRatio < 0.5 ? 1 : 2;
  const inCover = sideUnits.filter(u => {
    const t = getHexTerrain(u.hexId);
    return t === 'f' || t === 'w' || t === 't' || t === 'c';
  }).length;
  const cRatio = sideUnits.length > 0 ? inCover / sideUnits.length : 0;
  const cBin = cRatio < 0.3 ? 0 : cRatio < 0.6 ? 1 : 2;
  return `${turnBin}_${advanceBin}_${ratioBin}_${btBin}_${dBin}_${cBin}`;
}

// Q値からベスト行動を選択
function pgPickBestAction(qTable, state, actions) {
  if (!qTable || !qTable[state]) return actions[0]; // フォールバック
  let bestId = 0, bestQ = -Infinity;
  for (const act of actions) {
    const q = (qTable[state][act.id] || 0);
    if (q > bestQ) { bestQ = q; bestId = act.id; }
  }
  return actions.find(a => a.id === bestId) || actions[0];
}

// 現在の重み（毎ターン更新）
let _pgWeightsGerman = null;
let _pgWeightsAllied = null;

// ターン開始時にQ値から重みを選択
function pgUpdateWeights() {
  if (typeof PG_PRETRAINED === 'undefined') return;
  if (PG_PRETRAINED.german && PG_PRETRAINED.german.qTable) {
    const state = pgEncodeState('german');
    _pgWeightsGerman = pgPickBestAction(PG_PRETRAINED.german.qTable, state, PG_PRETRAINED.german.actions);
  }
  if (PG_PRETRAINED.allied && PG_PRETRAINED.allied.qTable) {
    const state = pgEncodeState('allied');
    _pgWeightsAllied = pgPickBestAction(PG_PRETRAINED.allied.qTable, state, PG_PRETRAINED.allied.actions);
  }
}

// ===== ユーティリティ =====

// 敵ユニットの射程内かつLOSが通るか
function geAI_isInEnemyFireZone(col, row) {
  return testUnits.some(e =>
    e.side === 'allied' && e.status !== 'eliminated' &&
    e.type !== 'dummy' && e.type !== 'leader' &&
    (e.range || 0) > 0 &&
    hexDistance(e.col, e.row, col, row) <= (e.range || 1) &&
    hexDistance(e.col, e.row, col, row) > 0 &&
    hasLOS(e.col, e.row, col, row)
  );
}

// 敵射程内のユニット数と合計火力を取得
function geAI_getEnemyThreat(col, row) {
  let count = 0;
  let totalFP = 0;
  testUnits.forEach(e => {
    if (e.side !== 'allied' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
    const dist = hexDistance(e.col, e.row, col, row);
    if (dist > 0 && dist <= (e.range || 1) && hasLOS(e.col, e.row, col, row)) {
      count++;
      totalFP += (e.fpAT || 0);
    }
  });
  return { count, totalFP };
}

// 遮蔽地形か（林・森・町・市街地）
function geAI_isCoverTerrain(col, row) {
  const hexId = toHexId(col, row);
  const t = getHexTerrain(hexId);
  return t === 'f' || t === 'w' || t === 't' || t === 'c';
}

// 最も近い敵ユニットまでの距離
function geAI_nearestEnemyDist(col, row) {
  let minDist = Infinity;
  testUnits.forEach(e => {
    if (e.side !== 'allied' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
    const d = hexDistance(e.col, e.row, col, row);
    if (d > 0 && d < minDist) minDist = d;
  });
  return minDist;
}

// 最も近い装甲敵（戦車・装甲車）までの距離（歩兵は除外）
function geAI_nearestArmoredEnemyDist(col, row) {
  let minDist = Infinity;
  testUnits.forEach(e => {
    if (e.side !== 'allied' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
    if (e.type !== 'T' && e.type !== 'AC' && e.type !== 'AT') return; // 戦車・装甲車・対戦車砲のみ
    const d = hexDistance(e.col, e.row, col, row);
    if (d > 0 && d < minDist) minDist = d;
  });
  return minDist;
}

// 隣接する敵ユニットを取得
function geAI_getAdjacentEnemies(col, row) {
  return testUnits.filter(e =>
    e.side === 'allied' && e.status !== 'eliminated' &&
    e.type !== 'dummy' && e.type !== 'leader' &&
    hexDistance(e.col, e.row, col, row) === 1
  );
}

// ===== 移動先評価 =====

// 味方ユニット（自分以外）がいるヘクスか
function geAI_hasFriendlyStack(hexId, stack) {
  return testUnits.some(u =>
    u.hexId === hexId && u.side === 'german' && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' && !stack.includes(u)
  );
}

// 味方ユニット数を取得（自分以外）
function geAI_friendlyCountAt(hexId, stack) {
  return testUnits.filter(u =>
    u.hexId === hexId && u.side === 'german' && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' && !stack.includes(u)
  ).length;
}

// 現在地より前進方向に正常な敵がいるか（取りこぼしチェック）
function geAI_hasUnclearedEnemyBehind(curCol, destCol, curRow, destRow) {
  if (typeof S3_BREAKTHROUGH_COL !== 'undefined') {
    // シナリオ3: 突破目標(1610)への距離で判定
    const curDist = hexDistance(curCol, curRow || 0, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
    const destDist = hexDistance(destCol, destRow || 0, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
    if (destDist >= curDist) return false;
    return testUnits.some(e =>
      e.side === 'allied' && e.status !== 'eliminated' &&
      e.type !== 'dummy' && e.type !== 'leader' &&
      (e.status === 'ok' || e.status === 'd') &&
      hexDistance(e.col, e.row, curCol, curRow || 0) <= 3
    );
  }
  // シナリオ2: 西進
  if (destCol >= curCol) return false;
  return testUnits.some(e =>
    e.side === 'allied' && e.status !== 'eliminated' &&
    e.type !== 'dummy' && e.type !== 'leader' &&
    (e.status === 'ok' || e.status === 'd') &&
    e.col > destCol && e.col <= curCol + 2
  );
}

// 射程内の正常な敵を取得（先制射撃用）
function geAI_getEnemiesInRange(col, row, range) {
  return testUnits.filter(e =>
    e.side === 'allied' && e.status !== 'eliminated' &&
    e.type !== 'dummy' && e.type !== 'leader' &&
    e.status === 'ok' &&
    hexDistance(e.col, e.row, col, row) > 0 &&
    hexDistance(e.col, e.row, col, row) <= range &&
    hasLOS(e.col, e.row, col, row)
  );
}

// 隣接ヘクスのスコアを計算
function geAI_evaluateNeighbor(stack, col, row, isDisrupted) {
  let score = 0;
  const curCol = stack[0].col;
  const hexId = toHexId(col, row);

  if (isDisrupted) {
    // === 混乱ユニット: 遮蔽地形への退避を最優先 ===
    // 平地にいると迫撃砲の餌食になる
    const inLOS = geAI_isInEnemyFireZone(col, row);
    const isCover = geAI_isCoverTerrain(col, row);

    // 敵に隣接していたら回復不可 → 最低スコア
    const adjEnemy = geAI_getAdjacentEnemies(col, row);
    if (adjEnemy.length > 0) return -100;

    // 平地でLOS内は最悪（迫撃砲に狙われる）
    if (inLOS && !isCover) return -80;

    // 遮蔽地形を強く優先
    if (!inLOS && isCover) score += 80;   // 最高: LOS外+遮蔽（確実に回復可）
    else if (isCover) score += 60;         // 遮蔽あり（LOS内でも回復可）
    else if (!inLOS) score += 30;          // LOS外だが平地（迫撃砲に弱い）

    // 味方がいるヘクスへの合流ボーナス
    const friendlyCount = geAI_friendlyCountAt(hexId, stack);
    const aliveCount = stack.filter(u => u.status !== 'eliminated').length;
    if (friendlyCount > 0 && friendlyCount + aliveCount <= 4) {
      score += 20;
    }

    // 敵から離れるボーナス
    const enemyDist = geAI_nearestEnemyDist(col, row);
    score += Math.min(enemyDist, 5) * 3;

    return score;
  }

  // === 正常ユニット ===
  const QW = _pgWeightsGerman || { westPriority:10, enemyApproach:20, losAvoidance:15, coverBonus:5, assaultThreshold:3.0 };

  // ★ 射撃済みのユニットは敵射程外に退却（撃ったら引く）
  const hasFired = stack.some(u => u.firedThisTurn || u._counterFired);
  if (hasFired) {
    // 敵の最大射程を取得
    let maxEnemyRange = 0;
    testUnits.forEach(e => {
      if (e.side !== 'allied' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
      if ((e.range || 0) > maxEnemyRange) maxEnemyRange = e.range;
    });
    const nearDist = geAI_nearestEnemyDist(col, row);
    if (nearDist > maxEnemyRange) {
      score += 40; // 敵射程外 → 安全、ここに退く
    } else {
      score -= 20; // まだ敵射程内 → 危険
    }
    // 味方と一緒にいるボーナス
    const aliveCount = stack.filter(u => u.status !== 'eliminated').length;
    const friendlyCount = geAI_friendlyCountAt(hexId, stack);
    if (friendlyCount > 0 && friendlyCount + aliveCount <= 4) score += 20;
    // スタック制限
    const allExisting = testUnits.filter(u =>
      u.hexId === hexId && u.status !== 'eliminated' &&
      !STACK_EXEMPT_TYPES.includes(u.type) && !stack.includes(u)
    ).length;
    if (allExisting + aliveCount > 4) return -9999;
    return score;
  }

  // 1. 突破可能なら最優先
  const btHexId = toHexId(col, row);
  if (typeof S3_BREAKTHROUGH_HEXES !== 'undefined' && S3_BREAKTHROUGH_HEXES.includes(btHexId)) return 1000;
  if (typeof S3_BREAKTHROUGH_HEXES === 'undefined' && col <= 1 && row >= 1 && row <= 9) return 1000;

  // スタックの最大射程
  const myRange = Math.max(...stack.map(u => u.range || 1));

  // 最も近い正常な敵とその脅威を評価
  let nearestEnemy = null, nearestEnemyDist = Infinity;
  let nearestEnemyFP = 0; // 最寄り敵ヘクスの合計火力
  testUnits.forEach(e => {
    if (e.side !== 'allied' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
    const d = hexDistance(e.col, e.row, col, row);
    if (d > 0 && d < nearestEnemyDist) {
      nearestEnemyDist = d;
      nearestEnemy = e;
    }
  });
  const enemyRange = nearestEnemy ? (nearestEnemy.range || 0) : 0;

  // 最寄り敵ヘクスの脅威度（合計火力 + ユニット数）
  let enemyThreatFP = 0, enemyThreatCount = 0;
  if (nearestEnemy) {
    const eHexId = nearestEnemy.hexId || toHexId(nearestEnemy.col, nearestEnemy.row);
    testUnits.forEach(e => {
      if (e.side !== 'allied' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
      if ((e.hexId || toHexId(e.col, e.row)) === eHexId && (e.status === 'ok' || e.status === 'd')) {
        enemyThreatFP += (e.fpAT || 0) + (e.fpSoft || 0);
        enemyThreatCount++;
      }
    });
  }

  // 偵察車両: 自分より射程の長い敵の射程に入らない
  const isRecon = stack.some(u => u.unitName && u.unitName.startsWith('Sd Kfz'));
  if (isRecon && nearestEnemy && nearestEnemyDist <= (nearestEnemy.range || 0) && (nearestEnemy.range || 0) > myRange) {
    score -= 60; // 射程で負ける敵の射程内は危険
  }

  // 2. 前進スコア（控えめ: 敵を排除してから前進）
  if (typeof s3_advanceScore === 'function') {
    score += s3_advanceScore(col, row) * (QW.westPriority * 0.5); // 歩兵は慎重に
  } else {
    score += (30 - col) * QW.westPriority;
  }

  // D/DD状態の敵がいるヘクスに隣接 → 突撃チャンス（大ボーナス）
  if (nearestEnemy && nearestEnemyDist === 1) {
    const weakEnemies = geAI_getAdjacentEnemies(col, row).filter(e =>
      e.status === 'd' || e.status === 'dd'
    );
    if (weakEnemies.length > 0) {
      score += 60; // 弱った敵に隣接 → 突撃で仕留める
    }
  }

  // 敵がいる町・市街地に隣接 → 攻撃目標として高スコア
  if (nearestEnemy && nearestEnemyDist <= 2) {
    const enemyHexId = nearestEnemy.hexId || toHexId(nearestEnemy.col, nearestEnemy.row);
    const enemyTerrain = FACILITY_MAP ? FACILITY_MAP[enemyHexId] : null;
    if (enemyTerrain === 't' || enemyTerrain === 'c') {
      score += 40; // 町・市街地の敵を優先攻撃
    }
  }

  // 正常な敵に対する脅威評価
  const isHighThreat = enemyThreatFP >= 10 && enemyThreatCount >= 2;

  if (nearestEnemyDist <= 2) {
    if (isHighThreat) {
      score -= 40; // 正常な高脅威の近くは危険（砲撃で弱らせてから）
    } else if (nearestEnemy && nearestEnemy.status === 'ok') {
      score -= 15; // 正常な敵には慎重に
    }
  } else if (nearestEnemyDist >= 3 && nearestEnemyDist <= myRange) {
    // 射程内で撃てる距離 → 良い位置
    score += 20;
    if (geAI_isCoverTerrain(col, row)) score += 15; // 遮蔽地形なら更に良い
  }

  // 3. 射程内に撃てる敵がいる → ボーナス
  const enemiesInMyRange = geAI_getEnemiesInRange(col, row, myRange);
  if (enemiesInMyRange.length > 0) {
    const safeTargets = enemiesInMyRange.filter(e => (e.range || 0) < hexDistance(e.col, e.row, col, row));
    if (safeTargets.length > 0) score += 20; // 安全に撃てる敵
    else score += 5;
  }

  // 4. 敵の脅威が多すぎる場所は避ける
  const threat = geAI_getEnemyThreat(col, row);
  if (threat.totalFP >= 12) {
    score -= 30; // 集中砲火を浴びる位置
  }

  // 5. 遮蔽地形ボーナス（歩兵は地形を利用すべき）
  if (geAI_isCoverTerrain(col, row)) {
    score += 10;
  }

  // 6. 味方とのスタック（合流して火力集中）
  const aliveCount = stack.filter(u => u.status !== 'eliminated').length;
  const friendlyCount = geAI_friendlyCountAt(hexId, stack);
  if (friendlyCount > 0 && friendlyCount + aliveCount <= 4) {
    score += 35; // 味方合流を強く推奨（集中攻撃・突撃のため）
  }

  // 7. 敵を迂回しない: 付近の敵を取りこぼして先に進まない
  if (geAI_hasUnclearedEnemyBehind(curCol, col, stack[0].row, row)) {
    score -= 60; // 強いペナルティ（迂回禁止）
  }

  // スタック制限超過は不可
  const allExisting = testUnits.filter(u =>
    u.hexId === hexId && u.status !== 'eliminated' &&
    !STACK_EXEMPT_TYPES.includes(u.type) && !stack.includes(u)
  ).length;
  if (allExisting + aliveCount > 4) return -9999;

  return score;
}

// BFSで全到達可能ヘクスを探索し、最高スコアの目的地へのパスを返す
function geAI_findBestPath(stack, mp) {
  const startCol = stack[0].col;
  const startRow = stack[0].row;
  const startKey = startCol + ',' + startRow;

  const isDisrupted = stack.some(u =>
    (u.status === 'd' || u.status === 'dd') && u.status !== 'eliminated'
  );

  // BFSで全到達可能ヘクスを探索
  const visited = {}; // key -> { cost, prev }
  visited[startKey] = { cost: 0, prev: null, col: startCol, row: startRow };
  const queue = [{ col: startCol, row: startRow, cost: 0 }];

  while (queue.length > 0) {
    // 最小コスト優先
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();
    const nbs = getHexNeighbors(cur.col, cur.row);

    nbs.forEach(n => {
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) return;

      // マップ外地形チェック
      const nHexId = toHexId(n.col, n.row);
      const terrain = getHexTerrain(nHexId);
      if (terrain === 'x' || terrain === 'lake') return;

      // 敵占有ヘクスは通過不可
      const enemySide = stack[0].side === 'german' ? 'allied' : 'german';
      const hasEnemy = testUnits.some(u =>
        u.hexId === nHexId && u.side === enemySide &&
        u.status !== 'eliminated' && u.type !== 'dummy'
      );
      if (hasEnemy) return;

      const mc = getMoveCost(stack[0], cur.col, cur.row, n.col, n.row, 'combat');
      if (mc.cost === Infinity) return;

      const totalCost = cur.cost + mc.cost;
      if (totalCost > mp) return;

      const key = n.col + ',' + n.row;
      if (visited[key] && visited[key].cost <= totalCost) return;

      visited[key] = { cost: totalCost, prev: cur.col + ',' + cur.row, col: n.col, row: n.row };
      queue.push({ col: n.col, row: n.row, cost: totalCost });
    });
  }

  // 全到達可能ヘクスからベストスコアの目的地を選択
  let bestKey = null;
  let bestScore = -Infinity;

  for (const [key, info] of Object.entries(visited)) {
    if (key === startKey) continue; // 現在地は除外
    const score = geAI_evaluateNeighbor(stack, info.col, info.row, isDisrupted);
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  if (!bestKey) return null;

  // パスを復元（目的地から起点へ遡る）
  const path = [];
  let k = bestKey;
  while (k && k !== startKey) {
    const info = visited[k];
    path.unshift({ col: info.col, row: info.row });
    k = info.prev;
  }

  return path; // [{col, row}, ...] 移動先の配列
}

// ===== 突撃判定 =====

// 突撃すべきかを判定（高確率で勝てる場合のみ）
function geAI_shouldAssault(stack, enemyHexId) {
  const aliveStack = stack.filter(u => u.status !== 'eliminated' && u.status !== 'dd');
  if (aliveStack.length === 0) return false;

  // 敵スタック
  const enemies = testUnits.filter(u =>
    u.hexId === enemyHexId && u.side === 'allied' &&
    u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader'
  );
  if (enemies.length === 0) return false;

  // 攻撃力合計
  let atkPower = 0;
  aliveStack.forEach(u => { atkPower += (u.closeAtk || u.assAtk || 0); });

  // DD部隊は戦闘参加不可（13-3-(3)）、全員DDなら自動壊滅 → 必ず突撃
  const activeEnemies = enemies.filter(u => u.status === 'ok' || u.status === 'd');
  if (activeEnemies.length === 0) return true; // 全員DD → 自動勝利

  // 防御力合計（OK/Dのみ）
  let defPower = 0;
  activeEnemies.forEach(u => { defPower += (u.closeDef || u.assDef || 0); });

  // 地形修正（防御側の地形）
  const terrain = getHexTerrain(enemyHexId);
  const tmod = TERRAIN_MODIFIERS[terrain];
  if (tmod && tmod.assault) defPower -= tmod.assault;

  if (defPower <= 0) defPower = 1;

  // 比率3:1以上で突撃
  const ratio = atkPower / defPower;
  return ratio >= 3.0;
}

// ===== スタック分割（同種ユニットでまとめる） =====

// ドイツ軍ユニットを同種ごとにスタック分割
function geAI_groupStacks(units) {
  // まずヘクスごとにグループ化
  const hexGroups = {};
  units.forEach(u => {
    if (u.status === 'eliminated' || u.type === 'dummy' || u.type === 'leader') return;
    if (u.col < 0 || u.col >= MAP_CONFIG.cols) return;
    if (!hexGroups[u.hexId]) hexGroups[u.hexId] = [];
    hexGroups[u.hexId].push(u);
  });

  const stacks = [];
  for (const [hexId, units] of Object.entries(hexGroups)) {
    // 偵察車両（Sd Kfz）は単独スタック
    const recon = units.filter(u => u.unitName && u.unitName.startsWith('Sd Kfz'));
    const main = units.filter(u => !u.unitName || !u.unitName.startsWith('Sd Kfz'));

    // 主力は集団で移動（4ユニットずつに分割）
    for (let i = 0; i < main.length; i += 4) {
      stacks.push(main.slice(i, i + 4));
    }
    // 偵察は個別
    for (let i = 0; i < recon.length; i += 4) {
      stacks.push(recon.slice(i, i + 4));
    }
  }

  return stacks;
}

// ===== メインAI移動ループ =====
// canFire: true=先攻（射撃可能）、false=後攻（移動のみ）
async function geAI_moveAllStacks(canFire) {
  const _moveDelay = (ms) => new Promise(r => setTimeout(r, ms || 1500));

  const germanUnits = testUnits.filter(u =>
    u.side === 'german' && u.status !== 'eliminated' &&
    u.type !== 'AT' && u.type !== 'A' && u.type !== 'dummy' && u.type !== 'leader'
  );

  const stacks = geAI_groupStacks(germanUnits);

  // 混乱スタックを先に処理（退避優先）
  stacks.sort((a, b) => {
    const aDisrupted = a.some(u => u.status === 'd' || u.status === 'dd');
    const bDisrupted = b.some(u => u.status === 'd' || u.status === 'dd');
    if (aDisrupted && !bDisrupted) return -1;
    if (!aDisrupted && bDisrupted) return 1;
    return 0;
  });

  for (const stack of stacks) {
    let aliveStack = stack.filter(u => u.status !== 'eliminated');
    if (aliveStack.length === 0) continue;

    // DD状態のユニットは移動不可 → スタックから除外
    const movableStack = aliveStack.filter(u => u.status !== 'dd');
    if (movableStack.length === 0) continue;

    const minMove = Math.min(...movableStack.map(u => u.move != null ? u.move : 1));
    if (minMove <= 0) continue;
    let mp = minMove;
    let hasMoved = false;
    const trail = [{ col: movableStack[0].col, row: movableStack[0].row }];

    while (mp > 0) {
      const best = geAI_getBestNeighbor(movableStack, mp);
      if (!best) break;

      const hexId = toHexId(best.col, best.row);
      const mc = getMoveCost(movableStack[0], movableStack[0].col, movableStack[0].row, best.col, best.row, 'combat');
      if (mc.cost === Infinity) break;

      mp -= mc.cost;

      // 最初の移動時にダミー除去 & フラグセット
      if (!hasMoved) {
        onUnitAction(movableStack[0], movableStack);
        movableStack.forEach(u => { u.moveComplete = true; });
        hasMoved = true;
      }

      const prevHexId = movableStack[0].hexId;

      // スタック全体を移動
      movableStack.forEach(u => {
        if (u.status === 'eliminated') return;
        u.col = best.col; u.row = best.row;
        const center = getHexCenter(u.col, u.row);
        u.x = center.x; u.y = center.y;
        u.hexId = hexId;
      });
      trail.push({ col: best.col, row: best.row });

      // 元ヘクスのダミークリーンアップ
      if (prevHexId !== hexId) {
        cleanupOrphanDummies(prevHexId, 'german');
      }
      // 視認によるダミー除去
      movableStack.forEach(u => { if (u.status !== 'eliminated') checkDummyVisibility(u); });

      // ===== ストップ射撃 → 反撃 =====
      const livingStack = movableStack.filter(u => u.status !== 'eliminated');
      if (livingStack.length === 0) break;

      // 防御側の射程内＋LOS通るユニット（砲兵・指揮官・D/DD除外）
      const stopShooters = testUnits.filter(e =>
        e.side === 'allied' && e.status === 'ok' &&
        e.type !== 'dummy' && e.type !== 'A' && e.type !== 'leader' &&
        (e.fpAT > 0 || e.fpSoft > 0)
      ).filter(e => {
        const dist = hexDistance(e.col, e.row, best.col, best.row);
        if (dist <= 0 || dist > (e.range || 1)) return false;
        return hasLOS(e.col, e.row, best.col, best.row);
      });

      if (stopShooters.length > 0) {
        // 各防御ユニットがストップ射撃
        const sortedTargets = [...livingStack].sort((a, b) => (a.def || 5) - (b.def || 5));
        const firedThisStep = new Set();
        stopShooters.forEach(e => {
          if (e.status === 'eliminated') return;
          if (firedThisStep.has(e.id || e.name)) return;
          const target = sortedTargets.find(t => t.status !== 'eliminated');
          if (target) {
            // aiSingleFireはhub.html内で定義 — ここでは直接射撃を使う
            const isArmored = target.type === 'T' || target.type === 'AC';
            const fp = isArmored ? (e.fpAT || 0) : (e.fpSoft || 0);
            if (fp > 0) {
              const roll = Math.floor(Math.random() * 10);
              const fpIdx = getFPColumnIndex(fp);
              const dmg = FIRE_COMBAT_TABLE[String(roll)] ? FIRE_COMBAT_TABLE[String(roll)][fpIdx] : 0;
              const def = target.def || 5;
              if (dmg === 'E' || (typeof dmg === 'number' && dmg >= def + 3)) {
                target.status = 'eliminated';
                addLog('stop', `ストップ射撃: ${e.name} (fp${fp}) → ${target.name}: 壊滅 (ダイス${roll})`);
              } else if (typeof dmg === 'number' && dmg >= def + 2) {
                target.status = target.status === 'd' ? 'eliminated' : 'dd';
                addLog('stop', `ストップ射撃: ${e.name} (fp${fp}) → ${target.name}: DD (ダイス${roll})`);
              } else if (typeof dmg === 'number' && dmg >= def) {
                target.status = target.status === 'dd' ? 'eliminated' : (target.status === 'd' ? 'dd' : 'd');
                addLog('stop', `ストップ射撃: ${e.name} (fp${fp}) → ${target.name}: D (ダイス${roll})`);
              } else {
                addLog('stop', `ストップ射撃: ${e.name} (fp${fp}) → ${target.name}: 効果なし (ダイス${roll})`);
              }
            }
            firedThisStep.add(e.id || e.name);
          }
        });

        // 反撃: スタック合算で最弱敵に集中砲火（D/DD・砲兵・指揮官除外）
        const counterShooters = livingStack.filter(u => u.status === 'ok' && u.type !== 'A' && u.type !== 'leader');
        if (counterShooters.length > 0 && canFire) {
          const counterTargets = [...stopShooters].filter(e => e.status !== 'eliminated')
            .sort((a, b) => (a.def || 5) - (b.def || 5));

          if (counterTargets.length > 0) {
            const target = counterTargets[0];
            const isArmored = target.type === 'T' || target.type === 'AC';
            let totalFP = 0;
            const firingUnits = [];
            counterShooters.forEach(u => {
              const dist = hexDistance(u.col, u.row, target.col, target.row);
              if (dist > 0 && dist <= (u.range || 1) && hasLOS(u.col, u.row, target.col, target.row)) {
                totalFP += isArmored ? (u.fpAT || 0) : (u.fpSoft || 0);
                firingUnits.push(u);
              }
            });
            if (totalFP > 0) {
              const roll = Math.floor(Math.random() * 10);
              const fpIdx = getFPColumnIndex(totalFP);
              const dmg = FIRE_COMBAT_TABLE[String(roll)] ? FIRE_COMBAT_TABLE[String(roll)][fpIdx] : 0;
              const def = target.def || 5;
              const nameStr = firingUnits.length > 2
                ? firingUnits[0].name + '他' + (firingUnits.length - 1)
                : firingUnits.map(u => u.name).join('+');
              if (dmg === 'E' || (typeof dmg === 'number' && dmg >= def + 3)) {
                target.status = 'eliminated';
                addLog('counter', `反撃: ${nameStr} (fp${totalFP}) → ${target.name}: 壊滅 (ダイス${roll})`);
              } else if (typeof dmg === 'number' && dmg >= def + 2) {
                target.status = target.status === 'd' ? 'eliminated' : 'dd';
                addLog('counter', `反撃: ${nameStr} (fp${totalFP}) → ${target.name}: DD (ダイス${roll})`);
              } else if (typeof dmg === 'number' && dmg >= def) {
                target.status = target.status === 'dd' ? 'eliminated' : (target.status === 'd' ? 'dd' : 'd');
                addLog('counter', `反撃: ${nameStr} (fp${totalFP}) → ${target.name}: D (ダイス${roll})`);
              } else {
                addLog('counter', `反撃: ${nameStr} (fp${totalFP}) → ${target.name}: 効果なし (ダイス${roll})`);
              }
              firingUnits.forEach(u => { u._counterFired = true; });
            }
          }
        }

        // D/DDユニットをスタックから離脱
        const damaged = movableStack.filter(u => u.status === 'd' || u.status === 'dd');
        if (damaged.length > 0) {
          movableStack = movableStack.filter(u => u.status === 'ok');
          damaged.forEach(u => {
            addLog('move', `${u.name} (${u.status.toUpperCase()}) スタックから離脱`);
          });
        }
        if (movableStack.every(u => u.status === 'eliminated') || movableStack.length === 0) break;
      }
    }

    // 突破判定（シナリオ対応）
    movableStack.forEach(u => {
      if (u.side !== 'german' || u.status === 'eliminated') return;
      const uHex = toHexId(u.col, u.row);
      let breached = false;
      if (typeof S3_BREAKTHROUGH_HEXES !== 'undefined') {
        breached = S3_BREAKTHROUGH_HEXES.includes(uHex);
      } else {
        breached = u.col <= 1;
      }
      if (breached) {
        u.status = 'eliminated';
        G.breakthroughCount++;
        addLog('breakthrough', `★ ${u.name} 突破!`);
      }
    });

    // 移動軌跡表示
    if (trail.length > 1) {
      drawMap();
      await _moveDelay();
    }
  }
}

// ===== 突撃フェイズ =====
function geAI_autoAssault() {
  const germanUnits = testUnits.filter(u =>
    u.side === 'german' && u.status !== 'eliminated' && u.status !== 'dd' &&
    u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'AT' && u.type !== 'A'
  );

  // ヘクスごとにグループ化
  const hexGroups = {};
  germanUnits.forEach(u => {
    if (!hexGroups[u.hexId]) hexGroups[u.hexId] = [];
    hexGroups[u.hexId].push(u);
  });

  for (const [hexId, stack] of Object.entries(hexGroups)) {
    const aliveStack = stack.filter(u => u.status !== 'eliminated' && u.status !== 'dd');
    if (aliveStack.length === 0) continue;

    // 隣接する敵ヘクスを探す
    const pos = fromHexId(hexId);
    const nbs = getHexNeighbors(pos.col, pos.row);

    for (const n of nbs) {
      const enemyHexId = toHexId(n.col, n.row);
      if (geAI_shouldAssault(aliveStack, enemyHexId)) {
        // 突撃実行
        const r = executeAssault(aliveStack, enemyHexId);
        if (!r || r.error || r.dummyOnly || r.surrender) break;

        // 攻撃側損害適用
        applyAssaultAtkDamage(r);
        // 防御側損害適用
        applyAssaultDefDamage(r);

        // 防御側が全滅 → 攻撃側が前進
        const defRemain = testUnits.filter(u =>
          u.hexId === enemyHexId && u.side === r.defenderSide &&
          u.status !== 'eliminated'
        );
        if (defRemain.length === 0) {
          // 攻撃側を敵ヘクスに移動
          const atkAlive = aliveStack.filter(u => u.status !== 'eliminated');
          atkAlive.forEach(u => {
            const c = getHexCenter(n.col, n.row);
            u.col = n.col; u.row = n.row;
            u.x = c.x; u.y = c.y;
            u.hexId = enemyHexId;
          });
          addLog('assault', `ドイツAI: ${atkAlive.map(u=>u.name).join('+')} が ${enemyHexId} に前進`);
        }
        break; // 1スタック1回のみ突撃
      }
    }
  }
}

console.log('ai_german_s2.js loaded');
