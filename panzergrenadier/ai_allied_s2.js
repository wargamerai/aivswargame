// ===== イギリス軍AI シナリオ2: カーンの逆襲 =====
// 方針:
// 1. ドイツ先頭部隊と地図西端の間に位置する（阻止線）
// 2. より遮蔽する地形へ移動
// 3. 混乱ユニットはLOS外の地形で回復優先
// 4. 30%以上の命中確率で広く浅く攻撃（火力分散）

// ===== ユーティリティ =====

// ドイツ軍の先頭位置を取得（突破目標に最も近いユニットのcol）
function ukAI_getGermanFrontCol() {
  if (typeof S3_BREAKTHROUGH_COL !== 'undefined') {
    // シナリオ3: 突破目標に最も近いドイツユニット
    let bestDist = Infinity, bestCol = 0;
    testUnits.forEach(u => {
      if (u.side === 'german' && u.status !== 'eliminated' &&
          u.type !== 'dummy' && u.type !== 'leader' &&
          u.col >= 0 && u.col < MAP_CONFIG.cols) {
        const d = hexDistance(u.col, u.row, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
        if (d < bestDist) { bestDist = d; bestCol = u.col; }
      }
    });
    return bestCol;
  }
  // シナリオ2: 最西端
  let minCol = MAP_CONFIG.cols;
  testUnits.forEach(u => {
    if (u.side === 'german' && u.status !== 'eliminated' &&
        u.type !== 'dummy' && u.type !== 'leader' &&
        u.col >= 0 && u.col < MAP_CONFIG.cols) {
      if (u.col < minCol) minCol = u.col;
    }
  });
  return minCol;
}

// ドイツ軍先頭部隊の位置（col,rowの重心）
function ukAI_getGermanFrontPositions() {
  const positions = [];
  testUnits.forEach(u => {
    if (u.side === 'german' && u.status !== 'eliminated' &&
        u.type !== 'dummy' && u.type !== 'leader' &&
        u.col >= 0 && u.col < MAP_CONFIG.cols) {
      positions.push({ col: u.col, row: u.row });
    }
  });
  return positions;
}

// 敵（ドイツ）の射程+LOS内か
function ukAI_isInEnemyFireZone(col, row) {
  return testUnits.some(e =>
    e.side === 'german' && e.status !== 'eliminated' &&
    e.type !== 'dummy' && e.type !== 'leader' &&
    (e.range || 0) > 0 &&
    hexDistance(e.col, e.row, col, row) <= (e.range || 1) &&
    hexDistance(e.col, e.row, col, row) > 0 &&
    hasLOS(e.col, e.row, col, row)
  );
}

// 遮蔽地形か（林・森・町・市街地）
function ukAI_isCoverTerrain(col, row) {
  const hexId = toHexId(col, row);
  const t = getHexTerrain(hexId);
  return t === 'f' || t === 'w' || t === 't' || t === 'c';
}

// 最も近いドイツユニットまでの距離
function ukAI_nearestEnemyDist(col, row) {
  let minDist = Infinity;
  testUnits.forEach(e => {
    if (e.side !== 'german' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
    const d = hexDistance(e.col, e.row, col, row);
    if (d > 0 && d < minDist) minDist = d;
  });
  return minDist;
}

// ===== 移動先評価 =====

// ドイツ軍の最大射程を取得
function ukAI_getMaxGermanRange() {
  let maxRange = 1;
  testUnits.forEach(u => {
    if (u.side === 'german' && u.status !== 'eliminated' &&
        u.type !== 'dummy' && u.type !== 'leader') {
      if ((u.range || 0) > maxRange) maxRange = u.range;
    }
  });
  return maxRange;
}

// 阻止位置としてのスコア: ドイツ部隊と突破目標の間に入る
function ukAI_blockingScore(col, row) {
  // 3ターン未満は既存配置を維持（移動しない）
  if (G.turn < 3) return 0;

  const germanPositions = ukAI_getGermanFrontPositions();
  if (germanPositions.length === 0) return 0;

  const germanMaxRange = ukAI_getMaxGermanRange();
  let bestScore = -100;

  if (typeof S3_BREAKTHROUGH_COL !== 'undefined') {
    // === シナリオ3: ドイツ軍と突破目標(1610)の間に位置する ===
    for (const gp of germanPositions) {
      const dist = hexDistance(col, row, gp.col, gp.row);
      const gpDistToBT = hexDistance(gp.col, gp.row, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
      const myDistToBT = hexDistance(col, row, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);

      // 突破目標とドイツの間にいる（自分の方が突破目標に近い）
      if (myDistToBT < gpDistToBT) {
        const outsideRange = dist > germanMaxRange;
        const rangeBonus = outsideRange ? 10 : -5;
        // 突破目標に近すぎず、ドイツにも近すぎない位置が理想
        const posScore = (dist >= 2 && dist <= 5) ? 8 : Math.max(0, 5 - Math.abs(dist - 3));
        const score = rangeBonus + posScore;
        if (score > bestScore) bestScore = score;
      } else {
        // ドイツの後方にいる → 追いかける
        const chaseScore = Math.max(0, 15 - dist * 2);
        if (chaseScore > bestScore) bestScore = chaseScore;
      }
    }
    return bestScore;
  }

  // === シナリオ2: ドイツ部隊の西側に入る ===
  const hasGermanEast = germanPositions.some(gp => gp.col > col);

  for (const gp of germanPositions) {
    const rowDiff = Math.abs(row - gp.row);
    const rowScore = Math.max(0, 10 - rowDiff * 3);
    const dist = hexDistance(col, row, gp.col, gp.row);

    if (col < gp.col) {
      const outsideRange = dist > germanMaxRange;
      const rangeBonus = outsideRange ? 10 : -5;
      const colDiff = gp.col - col;
      const posScore = (colDiff >= 1 && colDiff <= 4) ? 8 : Math.max(0, 5 - Math.abs(colDiff - 3));
      const score = rowScore + rangeBonus + posScore;
      if (score > bestScore) bestScore = score;
    } else if (!hasGermanEast) {
      const colDiff = col - gp.col;
      const chaseScore = rowScore + Math.max(0, 15 - colDiff * 2);
      const outsideRange = dist > germanMaxRange;
      if (outsideRange) chaseScore + 5;
      if (chaseScore > bestScore) bestScore = chaseScore;
    }
  }

  return bestScore;
}

// 隣接ヘクスの評価
function ukAI_evaluateNeighbor(stack, col, row, isDisrupted) {
  let score = 0;
  const hexId = toHexId(col, row);

  if (isDisrupted) {
    // === 混乱ユニット: 回復可能な位置を最優先 ===
    const inLOS = ukAI_isInEnemyFireZone(col, row);
    const isCover = ukAI_isCoverTerrain(col, row);

    // 敵に隣接していたら回復不可
    const adjEnemy = testUnits.some(e =>
      e.side === 'german' && e.status !== 'eliminated' && e.type !== 'dummy' &&
      hexDistance(e.col, e.row, col, row) === 1
    );
    if (adjEnemy) return -100;

    // LOS内の非遮蔽では回復不可
    if (inLOS && !isCover) return -50;

    // 回復可能な位置を優先
    if (!inLOS && isCover) score += 50;
    else if (!inLOS) score += 40;
    else if (isCover) score += 30;

    // 敵から離れるボーナス
    const enemyDist = ukAI_nearestEnemyDist(col, row);
    score += Math.min(enemyDist, 5) * 2;
    return score;
  }

  // === 正常ユニット ===
  const myRange = Math.max(...stack.map(u => u.range || 1));
  const aliveCount = stack.filter(u => u.status !== 'eliminated').length;

  // 最寄りの敵とその射程・脅威を取得
  let nearestEnemy = null, nearestEnemyDist = Infinity;
  testUnits.forEach(e => {
    if (e.side !== 'german' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
    const d = hexDistance(e.col, e.row, col, row);
    if (d > 0 && d < nearestEnemyDist) { nearestEnemyDist = d; nearestEnemy = e; }
  });
  const enemyMaxRange = nearestEnemy ? (nearestEnemy.range || 0) : 0;

  // ★ 敵の射程内だが自分の射程外 → 一方的に撃たれる、逃げるべき
  if (nearestEnemyDist <= enemyMaxRange && nearestEnemyDist > myRange) {
    score -= 50; // 危険: 撃ち返せない
  }

  // ★ 敵の射程外 → 安全（待ち伏せのチャンス）
  if (nearestEnemyDist > enemyMaxRange) {
    score += 15;
  }

  // 1. 阻止位置スコア（ドイツ先頭と西端の間）
  score += ukAI_blockingScore(col, row);

  // 2. 遮蔽地形ボーナス
  if (ukAI_isCoverTerrain(col, row)) {
    score += 12;
  }

  // 3. LOSが通らない位置はやや有利（待ち伏せ可能）
  if (!ukAI_isInEnemyFireZone(col, row)) {
    score += 5;
  }

  // 4. 自分の射程内で撃てる位置はボーナス
  if (nearestEnemyDist >= 1 && nearestEnemyDist <= myRange) {
    score += 10;
    // さらに敵の射程外なら最高（一方的に撃てる）
    if (nearestEnemyDist > enemyMaxRange) score += 20;
  }

  // 5. 味方スタックの穴埋め（味方が壊滅した位置に合流）
  const friendlyCount = testUnits.filter(u =>
    u.hexId === hexId && u.side === 'allied' && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' && !stack.includes(u)
  ).length;
  if (friendlyCount > 0 && friendlyCount + aliveCount <= 4) {
    score += 15; // 味方スタックに合流
  }

  // 6. スタック制限チェック
  const existing = testUnits.filter(u =>
    u.hexId === hexId && u.status !== 'eliminated' &&
    !STACK_EXEMPT_TYPES.includes(u.type) && !stack.includes(u)
  ).length;
  if (existing + aliveCount > 4) return -9999;

  return score;
}

// 最良隣接ヘクスを選択
function ukAI_getBestNeighbor(stack, mp) {
  const curCol = stack[0].col;
  const curRow = stack[0].row;
  const nbs = getHexNeighbors(curCol, curRow);

  const isDisrupted = stack.some(u =>
    (u.status === 'd' || u.status === 'dd') && u.status !== 'eliminated'
  );

  let bestHex = null;
  let bestScore = -Infinity;

  nbs.forEach(n => {
    if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) return;

    // 湖・マップ外は通過不可
    const nHexId = toHexId(n.col, n.row);
    const nTerrain = getHexTerrain(nHexId);
    if (nTerrain === 'x' || nTerrain === 'lake') return;

    // 敵占有ヘクスは通過不可
    const enemySide = stack[0].side === 'allied' ? 'german' : 'allied';
    const hasEnemy = testUnits.some(u =>
      u.hexId === nHexId && u.side === enemySide &&
      u.status !== 'eliminated' && u.type !== 'dummy'
    );
    if (hasEnemy) return;

    // 移動コストチェック
    const mc = getMoveCost(stack[0], curCol, curRow, n.col, n.row, 'combat');
    if (mc.cost === Infinity) return;
    if (mp < mc.cost) return;

    const score = ukAI_evaluateNeighbor(stack, n.col, n.row, isDisrupted);
    if (score > bestScore) { bestScore = score; bestHex = n; }
  });

  // 現在位置のスコアと比較（移動しない方が良い場合もある）
  const stayScore = ukAI_evaluateNeighbor(stack, curCol, curRow, isDisrupted);
  if (stayScore >= bestScore) return null; // 移動しない

  return bestHex;
}

// ===== 射撃AI: 広く浅く30%以上で攻撃 =====

// 射撃目標と射手の割り当てを決定
// 返値: [{ shooters: [unit], target: unit }]
function ukAI_assignFireTargets(shooterHex, shooters) {
  // 射程内の敵を収集
  const maxRange = Math.max(...shooters.map(s => s.range || 1));
  const effectiveRange = Math.min(maxRange, G.visionRange || 12);

  const enemies = testUnits.filter(t => {
    if (t.side !== 'german' || t.status === 'eliminated' || t.type === 'dummy' || t.type === 'leader') return false;
    const dist = hexDistance(shooters[0].col, shooters[0].row, t.col, t.row);
    if (dist <= 0 || dist > effectiveRange) return false;
    return hasLOS(shooters[0].col, shooters[0].row, t.col, t.row);
  });

  if (enemies.length === 0) return [];

  const assignments = [];
  const usedShooters = new Set();
  const attackedTargets = new Set();

  // 各敵に対して30%以上の命中確率を達成する最小人数を割り当て
  // 防御力が低い敵（倒しやすい）から順に処理
  const sortedEnemies = [...enemies].sort((a, b) => (a.def || 0) - (b.def || 0));

  for (const target of sortedEnemies) {
    if (attackedTargets.size >= enemies.length) break;

    const availableShooters = shooters.filter(s =>
      !usedShooters.has(s.id || s.name) &&
      s.status !== 'eliminated' && !s.firedThisTurn
    );
    if (availableShooters.length === 0) break;

    // この敵に対して射程内かつ30%以上の命中率を持つシューターを探す
    const isArmored = target.type === 'T' || target.type === 'AC';

    // まず1人で30%以上出せるか試す
    let assigned = [];
    let totalFP = 0;

    for (const s of availableShooters) {
      const dist = hexDistance(s.col, s.row, target.col, target.row);
      if (dist <= 0 || dist > (s.range || 1)) continue;
      if (!hasLOS(s.col, s.row, target.col, target.row)) continue;

      const fp = isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
      if (fp <= 0) continue;

      assigned.push(s);
      totalFP += fp;

      // 30%以上の命中確率を達成したかチェック
      const prob = ukAI_calcDamageProb(totalFP, target.def || 0);
      if (prob >= 0.3) break; // 十分な火力に到達
    }

    // 30%以上の確率がなければこの敵はスキップ
    if (assigned.length > 0) {
      const prob = ukAI_calcDamageProb(totalFP, target.def || 0);
      if (prob >= 0.3) {
        assignments.push({ shooters: assigned, target, totalFP });
        assigned.forEach(s => usedShooters.add(s.id || s.name));
        attackedTargets.add(target.id || target.name);
      }
    }
  }

  return assignments;
}

// 火力fpで防御defの敵にD以上を与える確率(0-1)
function ukAI_calcDamageProb(fp, def) {
  if (fp <= 0) return 0;
  const colIdx = getFPColumnIndex(fp);
  let hits = 0;
  for (let d = 0; d <= 9; d++) {
    const row = FIRE_COMBAT_TABLE[String(d)];
    if (!row) continue;
    const dmg = row[colIdx];
    if (dmg === 'E' || (typeof dmg === 'number' && dmg >= def)) hits++;
  }
  return hits / 10;
}

// ===== メイン移動ループ =====

async function ukAI_moveAllStacks(canFire) {
  const _moveDelay = (ms) => new Promise(r => setTimeout(r, ms || 1500));

  const alliedUnits = testUnits.filter(u =>
    u.side === 'allied' && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'fortification' && u.type !== 'ip' &&
    u.col >= 0 && u.col < MAP_CONFIG.cols
  );

  // ヘクスごとにスタック化（4ユニットずつ）
  const hexGroups = {};
  alliedUnits.forEach(u => {
    if (!hexGroups[u.hexId]) hexGroups[u.hexId] = [];
    hexGroups[u.hexId].push(u);
  });

  const stacks = [];
  for (const [hexId, units] of Object.entries(hexGroups)) {
    for (let i = 0; i < units.length; i += 4) {
      stacks.push(units.slice(i, i + 4));
    }
  }

  // 混乱スタックを先に処理
  stacks.sort((a, b) => {
    const aD = a.some(u => u.status === 'd' || u.status === 'dd');
    const bD = b.some(u => u.status === 'd' || u.status === 'dd');
    if (aD && !bD) return -1;
    if (!aD && bD) return 1;
    return 0;
  });

  for (const stack of stacks) {
    let movableStack = stack.filter(u => u.status !== 'eliminated' && u.status !== 'dd');
    if (movableStack.length === 0) continue;

    const minMove = Math.min(...movableStack.map(u => u.move || 0));
    if (minMove <= 0) continue; // AT砲等、移動力0はスキップ

    let mp = minMove;
    let hasMoved = false;
    const trail = [{ col: movableStack[0].col, row: movableStack[0].row }];

    while (mp > 0) {
      const best = ukAI_getBestNeighbor(movableStack, mp);
      if (!best) break; // 移動しない方が良い

      const hexId = toHexId(best.col, best.row);
      const mc = getMoveCost(movableStack[0], movableStack[0].col, movableStack[0].row, best.col, best.row, 'combat');
      if (mc.cost === Infinity) break;

      mp -= mc.cost;

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

      if (prevHexId !== hexId) {
        cleanupOrphanDummies(prevHexId, 'allied');
      }
      movableStack.forEach(u => { if (u.status !== 'eliminated') checkDummyVisibility(u); });

      // ストップ射撃チェック（ドイツ側から）
      const livingStack = movableStack.filter(u => u.status !== 'eliminated');
      if (livingStack.length === 0) break;

      const stopShooters = testUnits.filter(e =>
        e.side === 'german' && e.status === 'ok' &&
        e.type !== 'dummy' && e.type !== 'A' && e.type !== 'leader' &&
        (e.fpAT > 0 || e.fpSoft > 0)
      ).filter(e => {
        const dist = hexDistance(e.col, e.row, best.col, best.row);
        if (dist <= 0 || dist > (e.range || 1)) return false;
        return hasLOS(e.col, e.row, best.col, best.row);
      });

      if (stopShooters.length > 0) {
        // ストップ射撃処理
        const sortedTargets = [...livingStack].sort((a, b) => (a.def || 5) - (b.def || 5));
        const firedThisStep = new Set();
        stopShooters.forEach(e => {
          if (e.status === 'eliminated') return;
          if (firedThisStep.has(e.id || e.name)) return;
          const target = sortedTargets.find(t => t.status !== 'eliminated');
          if (target) {
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

        // 反撃（D/DD・砲兵・指揮官除外）
        const counterShooters = livingStack.filter(u => u.status === 'ok' && u.type !== 'A' && u.type !== 'leader');
        if (counterShooters.length > 0 && canFire) {
          const counterTargets = [...stopShooters].filter(e => e.status === 'ok')
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

        // D/DDユニット離脱
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

    if (trail.length > 1) {
      drawMap();
      await _moveDelay();
    }
  }
}

// ===== 射撃フェイズ: 広く浅く攻撃 =====
async function ukAI_firePhase() {
  const _fireDelay = () => new Promise(r => setTimeout(r, 1200));

  // ヘクスごとにイギリス射手をグループ化
  const shooterHexes = {};
  testUnits.filter(u =>
    u.side === 'allied' && u.status === 'ok' &&
    !u.firedThisTurn && !u._counterFired && u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'A'
  ).forEach(u => {
    if (!shooterHexes[u.hexId]) shooterHexes[u.hexId] = [];
    shooterHexes[u.hexId].push(u);
  });

  for (const [hexId, shooters] of Object.entries(shooterHexes)) {
    if (shooters.length === 0) continue;

    const assignments = ukAI_assignFireTargets(hexId, shooters);
    if (assignments.length === 0) continue;

    // 射撃行動 → ダミー除去
    onUnitAction(shooters[0], shooters);

    for (const { shooters: firingUnits, target, totalFP } of assignments) {
      if (target.status === 'eliminated') continue;

      const nameStr = firingUnits.length > 2
        ? firingUnits[0].name + '他' + (firingUnits.length - 1)
        : firingUnits.map(u => u.name).join('+');

      const roll = Math.floor(Math.random() * 10);
      const fpIdx = getFPColumnIndex(totalFP);
      const dmg = FIRE_COMBAT_TABLE[String(roll)] ? FIRE_COMBAT_TABLE[String(roll)][fpIdx] : 0;
      const def = target.def || 5;

      if (dmg === 'E' || (typeof dmg === 'number' && dmg >= def + 3)) {
        target.status = 'eliminated';
        addLog('fire', `射撃: ${nameStr} (fp${totalFP}) → ${target.name}: 壊滅 (ダイス${roll})`);
      } else if (typeof dmg === 'number' && dmg >= def + 2) {
        target.status = target.status === 'd' ? 'eliminated' : 'dd';
        addLog('fire', `射撃: ${nameStr} (fp${totalFP}) → ${target.name}: DD (ダイス${roll})`);
      } else if (typeof dmg === 'number' && dmg >= def) {
        target.status = target.status === 'dd' ? 'eliminated' : (target.status === 'd' ? 'dd' : 'd');
        addLog('fire', `射撃: ${nameStr} (fp${totalFP}) → ${target.name}: D (ダイス${roll})`);
      } else {
        addLog('fire', `射撃: ${nameStr} (fp${totalFP}) → ${target.name}: 効果なし (ダイス${roll})`);
      }

      firingUnits.forEach(u => { u.firedThisTurn = true; });
      drawMap();
      await _fireDelay();
    }
  }
}

console.log('ai_allied_s2.js loaded');
