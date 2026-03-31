// ===== Blackboard + 戦術評価（シナリオ3以降） =====
// Blackboard: ターン毎の共有分析状態
// 移動先スコアは複数の「成分」を足し合わせる（Q学習は expertWeights で成分倍率を切替）

// ============================================================
// Q学習統合（pgEncodeState / pgPickBestAction / pgUpdateWeights）
// ============================================================

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

function pgPickBestAction(qTable, state, actions) {
  if (!qTable || !qTable[state]) return actions[0];
  let bestId = 0, bestQ = -Infinity;
  for (const act of actions) {
    const q = (qTable[state][act.id] || 0);
    if (q > bestQ) { bestQ = q; bestId = act.id; }
  }
  return actions.find(a => a.id === bestId) || actions[0];
}

let _pgWeightsGerman = null;
let _pgWeightsAllied = null;

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
  // Expert重みをControllerに反映
  if (_pgWeightsGerman && _pgWeightsGerman.expertWeights) {
    AI_CONTROLLER.setWeights('german', _pgWeightsGerman);
  }
  if (_pgWeightsAllied && _pgWeightsAllied.expertWeights) {
    AI_CONTROLLER.setWeights('allied', _pgWeightsAllied);
  }
}

// ============================================================
// Blackboard: ターン毎の共有分析状態
// ============================================================

class Blackboard {
  constructor(side) {
    this.side = side;
    this.enemySide = side === 'german' ? 'allied' : 'german';
    this.friendlyUnits = [];
    this.enemyUnits = [];
    this.disruptedFriendly = [];
    this.threatMap = {};       // hexId → {count, totalFP, maxRange}
    this.coverMap = {};        // hexId → boolean
    this.frontLine = { germanAvgCol: 15, germanMinCol: 30, alliedAvgCol: 15 };
    this.forceRatio = { german: 0, allied: 0, ratio: 0.5 };
    this.disruptionRatio = 0;
    this.coverRatio = 0;
    this.breakthroughCount = 0;
    this.maxEnemyRange = 1;
  }

  analyze() {
    const alive = testUnits.filter(u =>
      u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader'
    );
    this.friendlyUnits = alive.filter(u => u.side === this.side);
    this.enemyUnits = alive.filter(u => u.side === this.enemySide);
    this.disruptedFriendly = this.friendlyUnits.filter(u => u.status === 'd' || u.status === 'dd');

    // 兵力比
    const total = this.friendlyUnits.length + this.enemyUnits.length;
    this.forceRatio = {
      german: alive.filter(u => u.side === 'german').length,
      allied: alive.filter(u => u.side === 'allied').length,
      ratio: total > 0 ? this.friendlyUnits.length / total : 0.5
    };

    // 混乱率
    this.disruptionRatio = this.friendlyUnits.length > 0
      ? this.disruptedFriendly.length / this.friendlyUnits.length : 0;

    // 遮蔽率
    const inCover = this.friendlyUnits.filter(u => this._isCover(u.hexId)).length;
    this.coverRatio = this.friendlyUnits.length > 0 ? inCover / this.friendlyUnits.length : 0;

    // 前線
    const ger = alive.filter(u => u.side === 'german');
    const all = alive.filter(u => u.side === 'allied');
    this.frontLine = {
      germanAvgCol: ger.length > 0 ? ger.reduce((s, u) => s + u.col, 0) / ger.length : 30,
      germanMinCol: ger.length > 0 ? Math.min(...ger.map(u => u.col)) : 30,
      alliedAvgCol: all.length > 0 ? all.reduce((s, u) => s + u.col, 0) / all.length : 0
    };

    // 突破数
    this.breakthroughCount = G.breakthroughCount || 0;

    // 敵最大射程
    this.maxEnemyRange = 1;
    this.enemyUnits.forEach(u => {
      if ((u.range || 0) > this.maxEnemyRange) this.maxEnemyRange = u.range;
    });

    // threatMap構築（全ヘクスに対する敵の射撃脅威）
    // 負荷軽減: 敵ユニット起点で射程内ヘクスに書き込み
    this.threatMap = {};
    this.enemyUnits.forEach(e => {
      if ((e.range || 0) <= 0) return;
      const range = e.range || 1;
      for (let dc = -range; dc <= range; dc++) {
        for (let dr = -range; dr <= range; dr++) {
          const tc = e.col + dc;
          const tr = e.row + dr;
          if (tc < 0 || tc >= MAP_CONFIG.cols || tr < 0 || tr >= MAP_CONFIG.rows) continue;
          const dist = hexDistance(e.col, e.row, tc, tr);
          if (dist <= 0 || dist > range) continue;
          if (!hasLOS(e.col, e.row, tc, tr)) continue;
          const hid = toHexId(tc, tr);
          if (!this.threatMap[hid]) this.threatMap[hid] = { count: 0, totalFP: 0, maxRange: 0 };
          this.threatMap[hid].count++;
          this.threatMap[hid].totalFP += (e.fpAT || 0);
          if (range > this.threatMap[hid].maxRange) this.threatMap[hid].maxRange = range;
        }
      }
    });
  }

  _isCover(hexId) {
    if (this.coverMap[hexId] !== undefined) return this.coverMap[hexId];
    const t = getHexTerrain(hexId);
    const v = (t === 'f' || t === 'w' || t === 't' || t === 'c');
    this.coverMap[hexId] = v;
    return v;
  }

  // --- ユーティリティ ---

  isInEnemyFireZone(col, row) {
    const hid = toHexId(col, row);
    const t = this.threatMap[hid];
    return t ? t.count > 0 : false;
  }

  isCoverTerrain(col, row) {
    return this._isCover(toHexId(col, row));
  }

  getEnemyThreat(col, row) {
    const hid = toHexId(col, row);
    return this.threatMap[hid] || { count: 0, totalFP: 0, maxRange: 0 };
  }

  nearestEnemyDist(col, row) {
    let minDist = Infinity;
    this.enemyUnits.forEach(e => {
      const d = hexDistance(e.col, e.row, col, row);
      if (d > 0 && d < minDist) minDist = d;
    });
    return minDist;
  }

  nearestArmoredEnemyDist(col, row) {
    let minDist = Infinity;
    this.enemyUnits.forEach(e => {
      if (e.type !== 'T' && e.type !== 'AC' && e.type !== 'AT') return;
      const d = hexDistance(e.col, e.row, col, row);
      if (d > 0 && d < minDist) minDist = d;
    });
    return minDist;
  }

  getAdjacentEnemies(col, row) {
    return this.enemyUnits.filter(e => hexDistance(e.col, e.row, col, row) === 1);
  }

  getEnemiesInRange(col, row, range) {
    return this.enemyUnits.filter(e => {
      if (e.status !== 'ok') return false;
      const d = hexDistance(e.col, e.row, col, row);
      return d > 0 && d <= range && hasLOS(e.col, e.row, col, row);
    });
  }

  getFriendlyCountAt(hexId, stack) {
    return testUnits.filter(u =>
      u.hexId === hexId && u.side === this.side && u.status !== 'eliminated' &&
      u.type !== 'dummy' && u.type !== 'leader' && !stack.includes(u)
    ).length;
  }

  // 前進方向に未掃討の敵がいるか
  hasUnclearedEnemyBehind(curCol, destCol, curRow, destRow) {
    if (typeof S3_BREAKTHROUGH_COL !== 'undefined') {
      const curDist = hexDistance(curCol, curRow || 0, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
      const destDist = hexDistance(destCol, destRow || 0, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
      if (destDist >= curDist) return false;
      return this.enemyUnits.some(e =>
        (e.status === 'ok' || e.status === 'd') &&
        hexDistance(e.col, e.row, curCol, curRow || 0) <= 3
      );
    }
    if (destCol >= curCol) return false;
    return this.enemyUnits.some(e =>
      (e.status === 'ok' || e.status === 'd') &&
      e.col > destCol && e.col <= curCol + 2
    );
  }

  // ドイツ軍先頭位置群を取得
  getGermanFrontPositions() {
    return testUnits.filter(u =>
      u.side === 'german' && u.status !== 'eliminated' &&
      u.type !== 'dummy' && u.type !== 'leader' &&
      u.col >= 0 && u.col < MAP_CONFIG.cols
    ).map(u => ({ col: u.col, row: u.row }));
  }

  // 最寄り敵のオブジェクト+距離
  getNearestEnemy(col, row) {
    let best = null, bestDist = Infinity;
    this.enemyUnits.forEach(e => {
      const d = hexDistance(e.col, e.row, col, row);
      if (d > 0 && d < bestDist) { bestDist = d; best = e; }
    });
    return { enemy: best, dist: bestDist };
  }
}

// ============================================================
// 陣営パラメータ
// ============================================================

const SIDE_PARAMS = {
  german: {
    role: 'attacker',
    breakthroughGoal: true,
    breakthroughCheck(col, row) {
      const hexId = toHexId(col, row);
      if (typeof S3_BREAKTHROUGH_HEXES !== 'undefined') return S3_BREAKTHROUGH_HEXES.includes(hexId);
      return col <= 1 && row >= 1 && row <= 9;
    },
    advanceScore(col, row) {
      if (typeof s3_advanceScore === 'function') return s3_advanceScore(col, row);
      return 30 - col;
    },
    pathfinding: 'bfs',
    stackMergeBonus: 35,
    antiBypassPenalty: -60,
    disruptedCoverBonus: 80,
    disruptedCoverLOS: 60,
    disruptedNoLOS: 30,
    shotAndScootSafe: 40,
    shotAndScootDanger: -20,
    reconPrefix: 'Sd Kfz',
    excludeMoveFire: ['AT', 'A'],  // 移動射撃フェイズで除外するtype
    fireStrategy: 'concentrate',   // デフォルト射撃方針
  },
  allied: {
    role: 'defender',
    breakthroughGoal: false,
    blockingScore(col, row, board) {
      if (G.turn < 3) return 0;
      const germanPositions = board.getGermanFrontPositions();
      if (germanPositions.length === 0) return 0;
      const germanMaxRange = board.maxEnemyRange;
      let bestScore = -100;

      if (typeof S3_BREAKTHROUGH_COL !== 'undefined') {
        for (const gp of germanPositions) {
          const dist = hexDistance(col, row, gp.col, gp.row);
          const gpDistToBT = hexDistance(gp.col, gp.row, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
          const myDistToBT = hexDistance(col, row, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
          if (myDistToBT < gpDistToBT) {
            const outsideRange = dist > germanMaxRange;
            const rangeBonus = outsideRange ? 10 : -5;
            const posScore = (dist >= 2 && dist <= 5) ? 8 : Math.max(0, 5 - Math.abs(dist - 3));
            const score = rangeBonus + posScore;
            if (score > bestScore) bestScore = score;
          } else {
            const chaseScore = Math.max(0, 15 - dist * 2);
            if (chaseScore > bestScore) bestScore = chaseScore;
          }
        }
        return bestScore;
      }

      // シナリオ2フォールバック
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
          let chaseScore = rowScore + Math.max(0, 15 - (col - gp.col) * 2);
          if (dist > germanMaxRange) chaseScore += 5;
          if (chaseScore > bestScore) bestScore = chaseScore;
        }
      }
      return bestScore;
    },
    pathfinding: 'greedy',
    stackMergeBonus: 15,
    antiBypassPenalty: 0,
    disruptedCoverBonus: 50,
    disruptedCoverLOS: 30,
    disruptedNoLOS: 40,
    shotAndScootSafe: 0,
    shotAndScootDanger: 0,
    reconPrefix: null,
    excludeMoveFire: [],
    fireStrategy: 'spread_30pct',
  }
};

// ============================================================
// 移動評価の各成分（旧 Expert クラスを関数化）
// ============================================================

function scoreBreakthroughMove(board, stack, col, row, params, weight, qw) {
  if (!qw) qw = {};
  let score = 0;

  if (params.breakthroughGoal) {
    if (params.breakthroughCheck(col, row)) return 1000;

    const aggression = qw.breakthroughAggression || 10;
    const isInfantry = stack.every(u => u.type === 'I' || u.type === 'MG' || u.type === 'HMG');
    if (isInfantry) {
      score += params.advanceScore(col, row) * (aggression * 0.5);
    } else {
      score += params.advanceScore(col, row) * aggression;
    }

    if (board.hasUnclearedEnemyBehind(stack[0].col, col, stack[0].row, row)) {
      score += params.antiBypassPenalty;
    }
  } else {
    score += params.blockingScore(col, row, board);
  }

  return score * weight;
}

// --- 2. FireExpert: 射撃位置・射撃割当 ---
class FireExpert extends Expert {
  constructor() { super('fire'); }

  evaluateMove(board, stack, col, row, params, weight) {
    let score = 0;
    const myRange = Math.max(...stack.map(u => u.range || 1));
    const { enemy: nearestEnemy, dist: nearestEnemyDist } = board.getNearestEnemy(col, row);
    const enemyRange = nearestEnemy ? (nearestEnemy.range || 0) : 0;

    if (params.role === 'attacker') {
      // 射程内で撃てる距離 → 良い位置
      if (nearestEnemyDist >= 3 && nearestEnemyDist <= myRange) {
        score += 20;
        if (board.isCoverTerrain(col, row)) score += 15;
      }
      // 射程内に撃てる敵がいる
      const enemiesInRange = board.getEnemiesInRange(col, row, myRange);
      if (enemiesInRange.length > 0) {
        const safeTargets = enemiesInRange.filter(e => (e.range || 0) < hexDistance(e.col, e.row, col, row));
        score += safeTargets.length > 0 ? 20 : 5;
      }
    } else {
      // 防御側: 射撃可能かつ安全な位置
      if (nearestEnemyDist >= 1 && nearestEnemyDist <= myRange) {
        score += 10;
        if (nearestEnemyDist > enemyRange) score += 20; // 一方的に撃てる
      }
      // 敵射程内だが自分の射程外 → 危険
      if (nearestEnemyDist <= enemyRange && nearestEnemyDist > myRange) {
        score -= 50;
      }
      // 敵射程外 → 安全
      if (nearestEnemyDist > enemyRange) {
        score += 15;
      }
    }

    return score * weight;
  }

  // 射撃ターゲット割当
  evaluateFire(board, shooterHex, shooters, params, weight) {
    const maxRange = Math.max(...shooters.map(s => s.range || 1));
    const effectiveRange = Math.min(maxRange, G.visionRange || 12);

    const enemies = board.enemyUnits.filter(t => {
      if (t.status === 'eliminated') return false;
      const dist = hexDistance(shooters[0].col, shooters[0].row, t.col, t.row);
      if (dist <= 0 || dist > effectiveRange) return false;
      return hasLOS(shooters[0].col, shooters[0].row, t.col, t.row);
    });
    if (enemies.length === 0) return [];

    if (params.fireStrategy === 'spread_30pct') {
      return this._spreadFire(shooters, enemies);
    } else {
      return this._concentrateFire(shooters, enemies);
    }
  }

  _spreadFire(shooters, enemies) {
    const assignments = [];
    const usedShooters = new Set();
    const sortedEnemies = [...enemies].sort((a, b) => (a.def || 0) - (b.def || 0));

    for (const target of sortedEnemies) {
      const available = shooters.filter(s =>
        !usedShooters.has(s.id || s.name) && s.status !== 'eliminated' && !s.firedThisTurn
      );
      if (available.length === 0) break;

      const isArmored = target.type === 'T' || target.type === 'AC';
      let assigned = [], totalFP = 0;

      for (const s of available) {
        const dist = hexDistance(s.col, s.row, target.col, target.row);
        if (dist <= 0 || dist > (s.range || 1)) continue;
        if (!hasLOS(s.col, s.row, target.col, target.row)) continue;
        const fp = isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
        if (fp <= 0) continue;
        assigned.push(s);
        totalFP += fp;
        const prob = this._calcDamageProb(totalFP, target.def || 0);
        if (prob >= 0.3) break;
      }
      if (assigned.length > 0) {
        const prob = this._calcDamageProb(totalFP, target.def || 0);
        if (prob >= 0.3) {
          assignments.push({ shooters: assigned, target, totalFP });
          assigned.forEach(s => usedShooters.add(s.id || s.name));
        }
      }
    }
    return assignments;
  }

  _concentrateFire(shooters, enemies) {
    // 最弱の敵に全火力集中
    const QW = _pgWeightsGerman || {};
    const focusTarget = QW.focusTarget || 'nearest';
    let sortedEnemies;
    if (focusTarget === 'weakest') {
      sortedEnemies = [...enemies].sort((a, b) => (a.def || 0) - (b.def || 0));
    } else if (focusTarget === 'spread') {
      sortedEnemies = [...enemies].sort((a, b) => (a.def || 0) - (b.def || 0));
    } else {
      // nearest
      const sc = shooters[0].col, sr = shooters[0].row;
      sortedEnemies = [...enemies].sort((a, b) =>
        hexDistance(a.col, a.row, sc, sr) - hexDistance(b.col, b.row, sc, sr)
      );
    }

    const assignments = [];
    const usedShooters = new Set();

    for (const target of sortedEnemies) {
      const available = shooters.filter(s =>
        !usedShooters.has(s.id || s.name) && s.status !== 'eliminated' && !s.firedThisTurn
      );
      if (available.length === 0) break;

      const isArmored = target.type === 'T' || target.type === 'AC';
      const assigned = [];
      let totalFP = 0;

      for (const s of available) {
        const dist = hexDistance(s.col, s.row, target.col, target.row);
        if (dist <= 0 || dist > (s.range || 1)) continue;
        if (!hasLOS(s.col, s.row, target.col, target.row)) continue;
        const fp = isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
        if (fp <= 0) continue;
        assigned.push(s);
        totalFP += fp;
      }

      if (assigned.length > 0 && totalFP > 0) {
        assignments.push({ shooters: assigned, target, totalFP });
        assigned.forEach(s => usedShooters.add(s.id || s.name));
        if (focusTarget !== 'spread') break; // 集中の場合は1目標のみ
      }
    }
    return assignments;
  }

  _calcDamageProb(fp, def) {
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
}

// --- 3. AssaultExpert: 白兵戦判断 ---
class AssaultExpert extends Expert {
  constructor() { super('assault'); }

  evaluateMove(board, stack, col, row, params, weight) {
    let score = 0;
    const adjEnemies = board.getAdjacentEnemies(col, row);

    if (params.role === 'attacker') {
      // 混乱敵に隣接 → 回復阻止+突撃チャンス
      const disruptedEnemies = adjEnemies.filter(e => e.status === 'd' || e.status === 'dd');
      if (disruptedEnemies.length > 0) score += 60;

      // 包囲位置: 敵の退路を塞ぐ
      for (const e of adjEnemies) {
        const eHex = e.hexId || toHexId(e.col, e.row);
        const eNeighbors = getHexNeighbors(e.col, e.row);
        let escapeRoutes = 0;
        for (const n of eNeighbors) {
          if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
          const nHex = toHexId(n.col, n.row);
          const hasFriendly = testUnits.some(u =>
            u.hexId === nHex && u.side === board.side &&
            u.status !== 'eliminated' && u.type !== 'dummy'
          );
          if (!hasFriendly) escapeRoutes++;
        }
        // 退路が少ないほど包囲に近い → ボーナス
        if (escapeRoutes <= 2) score += 30;
        else if (escapeRoutes <= 3) score += 15;
      }
    }

    return score * weight;
  }

  evaluateAssault(board, stack, enemyHexId, params, weight) {
    // ok部隊のみカウント（D/DDは突撃参加で壊滅）
    const aliveStack = stack.filter(u => u.status === 'ok');
    if (aliveStack.length === 0) return false;

    const enemies = testUnits.filter(u =>
      u.hexId === enemyHexId && u.side === board.enemySide &&
      u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader'
    );
    if (enemies.length === 0) return false;

    let atkPower = 0;
    aliveStack.forEach(u => { atkPower += (u.closeAtk || u.assAtk || 0); });

    // 防御側: ok部隊のみカウント（D部隊はモラルチェック失敗でDD→不参加の可能性が高い）
    const activeEnemies = enemies.filter(u => u.status === 'ok');
    if (activeEnemies.length === 0) return true; // 全員D/DD → 自動壊滅の可能性大

    let defPower = 0;
    activeEnemies.forEach(u => { defPower += (u.closeDef || u.assDef || 0); });

    if (defPower <= 0) defPower = 1;

    const ratio = atkPower / defPower;

    // A指揮官チェック
    let hasALeader = false;
    const hexId = stack[0].hexId || toHexId(stack[0].col, stack[0].row);
    // 同一ヘクス
    const sameHexLeader = testUnits.find(u =>
      u.hexId === hexId && u.type === 'leader' && u.side === board.side &&
      u.status !== 'eliminated' && u.abilities && u.abilities.indexOf('A') >= 0
    );
    if (sameHexLeader) hasALeader = true;
    // R+A能力の隣接指揮官
    if (!hasALeader) {
      const pos = fromHexId(hexId);
      const nbs = getHexNeighbors(pos.col, pos.row);
      for (const n of nbs) {
        const nHex = toHexId(n.col, n.row);
        const nLeader = testUnits.find(u =>
          u.hexId === nHex && u.type === 'leader' && u.side === board.side &&
          u.status !== 'eliminated' &&
          u.abilities && u.abilities.indexOf('A') >= 0 && u.abilities.indexOf('R') >= 0
        );
        if (nLeader) { hasALeader = true; break; }
      }
    }

    // 地形修正: 町/市街地はより高い比率が必要
    const terrain = getHexTerrain(enemyHexId);
    const tmod = typeof TERRAIN_MODIFIERS !== 'undefined' && TERRAIN_MODIFIERS[terrain] ?
                 TERRAIN_MODIFIERS[terrain].assault || 0 : 0;
    let threshold = 5.0;
    if (hasALeader) threshold = 4.0; // A指揮官で+1修正
    if (tmod <= -2) threshold += 1.0; // 町/市街地

    // R指揮官による共同突撃: 隣接する他の味方スタックの攻撃力も加算
    let coordAtkPower = atkPower;
    const rLeader = testUnits.find(u =>
      u.type === 'leader' && u.side === board.side && u.status !== 'eliminated' &&
      u.abilities && u.abilities.indexOf('R') >= 0 &&
      hexDistance(u.col, u.row, fromHexId(enemyHexId).col, fromHexId(enemyHexId).row) <= 2
    );
    if (rLeader) {
      const ePos = fromHexId(enemyHexId);
      const eNeighbors = getHexNeighbors(ePos.col, ePos.row);
      for (const n of eNeighbors) {
        const nHex = toHexId(n.col, n.row);
        if (nHex === hexId) continue; // 自分のヘクスは除外
        testUnits.forEach(u => {
          if (u.hexId === nHex && u.side === board.side && u.status === 'ok' &&
              u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'A' && u.type !== 'AT') {
            coordAtkPower += u.closeAtk || 0;
          }
        });
      }
      // 共同突撃の比率で判定
      if (coordAtkPower / defPower >= threshold) return true;
    }

    return ratio >= threshold;
  }
}

// --- 4. RecoveryExpert: 混乱ユニットの退避・回復 ---
class RecoveryExpert extends Expert {
  constructor() { super('recovery'); }

  evaluateMove(board, stack, col, row, params, weight) {
    const isDisrupted = stack.some(u => u.status === 'd' || u.status === 'dd');
    if (!isDisrupted) return 0;

    let score = 0;
    const inLOS = board.isInEnemyFireZone(col, row);
    const isCover = board.isCoverTerrain(col, row);
    const hexId = toHexId(col, row);

    // 敵に隣接 → 回復不可
    const adjEnemy = board.getAdjacentEnemies(col, row);
    if (adjEnemy.length > 0) return -100 * weight;

    // LOS+平地 → 回復不可
    if (inLOS && !isCover) return -80 * weight;

    // === 安全性判定（敵に隣接されない・オーバーランされない） ===
    // 敵が次ターンに隣接可能か
    let canBeReached = false;
    for (const e of board.enemyUnits) {
      if (e.status === 'eliminated' || e.status === 'dd') continue;
      const dist = hexDistance(e.col, e.row, col, row);
      const moveRange = e.move || 4;
      if (dist <= moveRange) { canBeReached = true; break; }
    }

    // 敵装甲にオーバーランされる危険
    let canBeOverrun = false;
    for (const e of board.enemyUnits) {
      if (e.status !== 'ok') continue;
      const isArmor = e.type === 'T' || e.type === 'AC' || e.type === 'TD' ||
                       e.type === 'SPG' || e.type === 'SPA' || e.type === 'HT';
      if (!isArmor) continue;
      const dist = hexDistance(e.col, e.row, col, row);
      const moveRange = e.move || 6;
      if (dist <= Math.max(1, moveRange - 2)) { canBeOverrun = true; break; }
    }

    // 安全な位置は高スコア
    if (!canBeReached && !canBeOverrun) score += 40;
    else if (!canBeOverrun) score += 20;

    // 安全でないなら味方の正常部隊とスタック
    if (canBeReached || canBeOverrun) {
      const hasOkFriendly = testUnits.some(u =>
        u.hexId === hexId && u.side === board.side &&
        u.status === 'ok' && !stack.includes(u) &&
        u.type !== 'dummy' && u.type !== 'leader'
      );
      if (hasOkFriendly) score += 30;
    }

    // 遮蔽+LOS外が最高（回復条件）
    if (!inLOS && isCover) score += 25;
    else if (isCover) score += 15;
    else if (!inLOS) score += 10;

    // モラル指揮官の近く → 士気+1
    const nearMoraleLeader = testUnits.some(l => {
      if (l.type !== 'leader' || l.side !== board.side) return false;
      if (l.status === 'eliminated') return false;
      const lDist = hexDistance(l.col, l.row, col, row);
      if (lDist > 1) return false;
      return l.abilities && l.abilities.indexOf('M') >= 0;
    });
    if (nearMoraleLeader) score += 15;

    // 離脱路チェック
    const neighbors = getHexNeighbors(col, row);
    let escapeRoutes = 0;
    for (const n of neighbors) {
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
      const nHex = toHexId(n.col, n.row);
      const nTerrain = getHexTerrain(nHex);
      if (nTerrain === 'x' || nTerrain === 'lake') continue;
      const nHasEnemy = testUnits.some(e =>
        e.hexId === nHex && e.side !== board.side &&
        e.status !== 'eliminated' && e.type !== 'dummy'
      );
      if (!nHasEnemy) escapeRoutes++;
    }
    score += Math.min(escapeRoutes, 3) * 3;

    // 敵から離れる
    const enemyDist = board.nearestEnemyDist(col, row);
    score += Math.min(enemyDist, 5) * 3;

    return score * weight;
  }
}

// --- 5. StackingExpert: 合流・分散・指揮官スタック ---
class StackingExpert extends Expert {
  constructor() { super('stacking'); }

  evaluateMove(board, stack, col, row, params, weight) {
    let score = 0;
    const hexId = toHexId(col, row);
    const aliveCount = stack.filter(u => u.status !== 'eliminated').length;
    const friendlyCount = board.getFriendlyCountAt(hexId, stack);

    // スタック上限チェック
    const allExisting = testUnits.filter(u =>
      u.hexId === hexId && u.status !== 'eliminated' &&
      !STACK_EXEMPT_TYPES.includes(u.type) && !stack.includes(u)
    ).length;
    if (allExisting + aliveCount > 4) return -9999;

    // 味方合流ボーナス
    if (friendlyCount > 0 && friendlyCount + aliveCount <= 4) {
      score += params.stackMergeBonus;
    }

    // F/A指揮官とのスタック: 射撃/突撃ボーナスが得られる
    const hasLeaderFA = testUnits.some(u =>
      u.hexId === hexId && u.type === 'leader' && u.side === board.side &&
      u.status !== 'eliminated' && u.abilities &&
      (u.abilities.indexOf('F') >= 0 || u.abilities.indexOf('A') >= 0)
    );
    if (hasLeaderFA) score += 20;

    // 指揮官がスタック内にいる場合、戦力の高いヘクスへ移動したい
    const isLeader = stack.some(u => u.type === 'leader');
    if (isLeader) {
      // このヘクスの味方戦力
      let hexFP = 0;
      testUnits.forEach(u => {
        if (u.hexId === hexId && u.side === board.side && u.status === 'ok' &&
            u.type !== 'dummy' && u.type !== 'leader' && !stack.includes(u)) {
          hexFP += (u.fpAT || 0) + (u.fpSoft || 0);
        }
      });
      score += Math.min(hexFP, 30); // 戦力高いスタックに合流
    }

    return score * weight;
  }
}

// --- 6. ReconExpert: 偵察・ダミー剥がし・視認範囲・砲兵観測 ---
class ReconExpert extends Expert {
  constructor() { super('recon'); }

  evaluateMove(board, stack, col, row, params, weight) {
    // 偵察ユニット判定
    const isRecon = stack.some(u =>
      u.type === 'I' || u.type === 'AC' ||
      (u.unitName && (u.unitName.indexOf('Sd Kfz') >= 0 || u.unitName.indexOf('Scout') >= 0))
    );
    if (!isRecon) return 0;

    let score = 0;
    const visionRange = (typeof G !== 'undefined' && G.visionRange) || 12;

    // この位置から視認できる敵ヘクス数
    let visibleEnemyHexes = 0;
    let strippableDummies = 0;
    let newSpotted = 0;
    const seen = {};
    const dummySeen = {};

    testUnits.forEach(u => {
      if (u.side === board.side) return;
      if (u.status === 'eliminated') return;
      const hid = u.hexId || toHexId(u.col, u.row);

      const dist = hexDistance(col, row, u.col, u.row);
      if (dist <= 0 || dist > visionRange) return;
      if (!hasLOS(col, row, u.col, u.row)) return;

      if (u.type === 'dummy' && !dummySeen[hid]) {
        dummySeen[hid] = true;
        const terrain = getHexTerrain(hid);
        if (terrain === 'p' || terrain === 'r') strippableDummies++;
      } else if (u.type !== 'dummy' && u.type !== 'leader' && !seen[hid]) {
        seen[hid] = true;
        visibleEnemyHexes++;
        // 味方が誰も視認していない敵 → 新規観測（砲兵射撃用）
        try {
          if (typeof isTargetSpottedByFriendly === 'function' && !isTargetSpottedByFriendly(hid, board.side)) {
            newSpotted++;
          }
        } catch(e) { /* calculateVisionRange未定義等の場合はスキップ */ }
      }
    });

    // 新規観測（砲兵射撃可能にする）
    score += newSpotted * 8;
    // ダミー除去
    score += strippableDummies * 5;
    // 視認数
    score += visibleEnemyHexes * 3;

    // 射程で負ける敵の射程内は危険
    const myRange = Math.max(...stack.map(u => u.range || 1));
    const { enemy: nearestEnemy, dist: nearestEnemyDist } = board.getNearestEnemy(col, row);
    if (nearestEnemy && nearestEnemyDist <= (nearestEnemy.range || 0) && (nearestEnemy.range || 0) > myRange) {
      score -= 40;
    }

    return score * weight;
  }
}

// --- 7. ThreatExpert: 脅威回避・ストップ射撃回避・遮蔽地形優先 ---
class ThreatExpert extends Expert {
  constructor() { super('threat'); }

  evaluateMove(board, stack, col, row, params, weight) {
    let score = 0;

    // 複数スタックからのストップ射撃をうける移動はさける（指示あり）
    const enemySide = board.enemySide;
    let stopSourceHexes = {};
    testUnits.forEach(e => {
      if (e.side !== enemySide || e.status === 'eliminated') return;
      if (e.type === 'dummy' || e.type === 'leader') return;
      if ((e.fpAT || 0) + (e.fpSoft || 0) <= 0) return;
      const dist = hexDistance(e.col, e.row, col, row);
      if (dist > 0 && dist <= (e.range || 1) && hasLOS(e.col, e.row, col, row)) {
        const eHex = e.hexId || toHexId(e.col, e.row);
        stopSourceHexes[eHex] = true;
      }
    });
    const stopSourceCount = Object.keys(stopSourceHexes).length;

    if (stopSourceCount >= 2) score -= 60;

    return score * weight;
  }
}

// ============================================================
// AIController: Expert統合
// ============================================================

class AIController {
  constructor() {
    this.experts = [
      new BreakthroughExpert(),
      new FireExpert(),
      new AssaultExpert(),
      new RecoveryExpert(),
      new StackingExpert(),
      new ReconExpert(),
      new ThreatExpert()
    ];
    this.weights = { german: null, allied: null };
    this.boards = { german: null, allied: null };
  }

  setWeights(side, qAction) {
    this.weights[side] = qAction;
  }

  buildBoard(side) {
    const board = new Blackboard(side);
    board.analyze();
    this.boards[side] = board;
    return board;
  }

  getBoard(side) {
    if (!this.boards[side]) return this.buildBoard(side);
    return this.boards[side];
  }

  // ヘクス評価（全Expert合算）
  evaluateHex(side, stack, col, row) {
    const board = this.getBoard(side);
    const params = SIDE_PARAMS[side];
    const qw = this.weights[side] || {};
    const ew = qw.expertWeights || {};

    const isDisrupted = stack.some(u => u.status === 'd' || u.status === 'dd');
    const hasFired = stack.some(u => u.firedThisTurn || u._counterFired);

    // 射撃済みユニット: ThreatExpert + StackingExpertのみ
    if (hasFired && !isDisrupted) {
      let score = 0;
      score += this.experts.find(e => e.name === 'threat').evaluateMove(board, stack, col, row, params, ew.threat || 1.0);
      score += this.experts.find(e => e.name === 'stacking').evaluateMove(board, stack, col, row, params, ew.stacking || 1.0);
      return score;
    }

    // 混乱ユニット: RecoveryExpert + StackingExpertのみ
    if (isDisrupted) {
      let score = 0;
      score += this.experts.find(e => e.name === 'recovery').evaluateMove(board, stack, col, row, params, ew.recovery || 1.0);
      score += this.experts.find(e => e.name === 'stacking').evaluateMove(board, stack, col, row, params, ew.stacking || 1.0);
      return score;
    }

    // 正常ユニット: 全Expert合算
    let totalScore = 0;
    const _dbg = {};
    for (const expert of this.experts) {
      if (expert.name === 'recovery') continue; // 正常時は不要
      const w = ew[expert.name] || 1.0;
      const s = expert.evaluateMove(board, stack, col, row, params, w);
      _dbg[expert.name] = s;
      totalScore += s;
    }
    _dbg.total = totalScore;
    // デバッグ: BFSのベスト候補選択時にログ出力用に保存
    if (!this._lastEvalDebug) this._lastEvalDebug = {};
    this._lastEvalDebug[toHexId(col, row)] = _dbg;
    return totalScore;
  }

  // 射撃割当
  allocateFire(side, shooterHex, shooters) {
    const board = this.getBoard(side);
    const params = SIDE_PARAMS[side];
    const qw = this.weights[side] || {};
    const fireExpert = this.experts.find(e => e.name === 'fire');
    return fireExpert.evaluateFire(board, shooterHex, shooters, params, qw.expertWeights?.fire || 1.0);
  }

  // 突撃判定
  shouldAssault(side, stack, enemyHexId) {
    const board = this.getBoard(side);
    const params = SIDE_PARAMS[side];
    const qw = this.weights[side] || {};
    const assaultExpert = this.experts.find(e => e.name === 'assault');
    return assaultExpert.evaluateAssault(board, stack, enemyHexId, params, qw.expertWeights?.assault || 1.0);
  }
}

// グローバルインスタンス
const AI_CONTROLLER = new AIController();

// ============================================================
// 統合移動ループ（両軍共用）
// ============================================================

async function aiMoveAllStacks(side, canFire) {
  const _moveDelay = (ms) => new Promise(r => setTimeout(r, ms || 1500));
  const params = SIDE_PARAMS[side];
  const enemySide = side === 'german' ? 'allied' : 'german';

  // Blackboard構築
  AI_CONTROLLER.buildBoard(side);
  // 敵のBlackboardも構築（ストップ射撃の反撃評価用）
  AI_CONTROLLER.buildBoard(enemySide);

  // 自軍ユニット抽出
  const myUnits = testUnits.filter(u =>
    u.side === side && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'fortification' && u.type !== 'ip' &&
    !params.excludeMoveFire.includes(u.type) &&
    u.col >= 0 && u.col < MAP_CONFIG.cols
  );

  // スタック化
  const stacks = _groupStacks(myUnits, params);

  // ソート優先: 1.登場ヘクス(スタックオーバー)を最優先で分散 2.混乱スタック
  stacks.sort((a, b) => {
    const aHex = toHexId(a[0].col, a[0].row);
    const bHex = toHexId(b[0].col, b[0].row);
    const aOver = getStackCount(aHex) > 4;
    const bOver = getStackCount(bHex) > 4;
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    const aD = a.some(u => u.status === 'd' || u.status === 'dd');
    const bD = b.some(u => u.status === 'd' || u.status === 'dd');
    if (aD && !bD) return -1;
    if (!aD && bD) return 1;
    return 0;
  });

  for (const stack of stacks) {
    let movableStack = stack.filter(u => u.status !== 'eliminated' && u.status !== 'dd');
    if (movableStack.length === 0) continue;

    const minMove = Math.min(...movableStack.map(u => u.move != null ? u.move : 1));
    if (minMove <= 0) continue;
    let mp = minMove;
    let hasMoved = false;
    const trail = [{ col: movableStack[0].col, row: movableStack[0].row }];

    if (params.pathfinding === 'bfs') {
      // BFS全探索: 最良ヘクスへのパスを求めて1歩ずつ移動
      let path = _findBestPathBFS(side, movableStack, mp);

      // スタックオーバー時: BFSで移動先が見つからなくても強制的に隣接空きヘクスへ分散
      if ((!path || path.length === 0) && getStackCount(toHexId(movableStack[0].col, movableStack[0].row)) > 4) {
        const forced = _findForcedDisperse(movableStack, side);
        if (forced) path = [forced];
      }

      if (path && path.length > 0) {
        for (const step of path) {
          const hexId = toHexId(step.col, step.row);
          const mc = getMoveCost(movableStack[0], movableStack[0].col, movableStack[0].row, step.col, step.row, 'combat');
          if (mc.cost === Infinity) break;
          if (mp < mc.cost) break;
          mp -= mc.cost;

          if (!hasMoved) {
            onUnitAction(movableStack[0], movableStack);
            movableStack.forEach(u => { u.moveComplete = true; });
            hasMoved = true;
          }

          const prevHexId = movableStack[0].hexId;
          _moveStackTo(movableStack, step.col, step.row, hexId);
          trail.push({ col: step.col, row: step.row });

          if (prevHexId !== hexId) cleanupOrphanDummies(prevHexId, side);
          movableStack.forEach(u => { if (u.status !== 'eliminated') checkDummyVisibility(u); });

          // ストップ射撃処理
          const result = _handleStopFire(movableStack, step, side, canFire);
          movableStack = result.stack;
          if (movableStack.length === 0 || movableStack.every(u => u.status === 'eliminated')) break;
        }
      }
    } else {
      // Greedy: 1歩ずつ最良隣接ヘクスを選択
      while (mp > 0) {
        let best = _getBestNeighborGreedy(side, movableStack, mp);
        // スタックオーバー時: 強制分散
        if (!best && getStackCount(toHexId(movableStack[0].col, movableStack[0].row)) > 4) {
          best = _findForcedDisperse(movableStack, side);
        }
        if (!best) break;

        const hexId = toHexId(best.col, best.row);
        const mc = getMoveCost(movableStack[0], movableStack[0].col, movableStack[0].row, best.col, best.row, 'combat');
        if (mc.cost === Infinity) break;
        if (mp < mc.cost) break;
        mp -= mc.cost;

        if (!hasMoved) {
          onUnitAction(movableStack[0], movableStack);
          movableStack.forEach(u => { u.moveComplete = true; });
          hasMoved = true;
        }

        const prevHexId = movableStack[0].hexId;
        _moveStackTo(movableStack, best.col, best.row, hexId);
        trail.push({ col: best.col, row: best.row });

        if (prevHexId !== hexId) cleanupOrphanDummies(prevHexId, side);
        movableStack.forEach(u => { if (u.status !== 'eliminated') checkDummyVisibility(u); });

        // ストップ射撃
        const result = _handleStopFire(movableStack, best, side, canFire);
        movableStack = result.stack;
        if (movableStack.length === 0 || movableStack.every(u => u.status === 'eliminated')) break;
      }
    }

    // 突破判定（攻撃側のみ）
    if (side === 'german') {
      movableStack.forEach(u => {
        if (u.status === 'eliminated') return;
        if (SIDE_PARAMS.german.breakthroughCheck(u.col, u.row)) {
          u.status = 'eliminated';
          G.breakthroughCount++;
          addLog('breakthrough', `★ ${u.name} 突破!`);
        }
      });
    }

    if (trail.length > 1) {
      drawMap();
      await _moveDelay();
    }
  }
}

// --- 内部ヘルパー ---

function _groupStacks(units, params) {
  const hexGroups = {};
  units.forEach(u => {
    if (!hexGroups[u.hexId]) hexGroups[u.hexId] = [];
    hexGroups[u.hexId].push(u);
  });

  const stacks = [];
  for (const [hexId, hUnits] of Object.entries(hexGroups)) {
    if (params.reconPrefix) {
      const recon = hUnits.filter(u => u.unitName && u.unitName.startsWith(params.reconPrefix));
      const main = hUnits.filter(u => !u.unitName || !u.unitName.startsWith(params.reconPrefix));
      for (let i = 0; i < main.length; i += 4) stacks.push(main.slice(i, i + 4));
      for (let i = 0; i < recon.length; i += 4) stacks.push(recon.slice(i, i + 4));
    } else {
      for (let i = 0; i < hUnits.length; i += 4) stacks.push(hUnits.slice(i, i + 4));
    }
  }
  return stacks;
}

// スタックオーバー時の強制分散: 隣接でスタック制限を超えない空きヘクスを探す
function _findForcedDisperse(stack, side) {
  const col = stack[0].col, row = stack[0].row;
  const enemySide = side === 'german' ? 'allied' : 'german';
  const movingCount = stack.filter(u => u.status !== 'eliminated' && !STACK_EXEMPT_TYPES.includes(u.type)).length;
  const neighbors = getHexNeighbors(col, row);
  let best = null, bestScore = -Infinity;

  for (const n of neighbors) {
    if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
    const nHexId = toHexId(n.col, n.row);
    const terrain = getHexTerrain(nHexId);
    if (terrain === 'x' || terrain === 'lake') continue;

    const hasEnemy = testUnits.some(u =>
      u.hexId === nHexId && u.side === enemySide &&
      u.status !== 'eliminated' && u.type !== 'dummy'
    );
    if (hasEnemy) continue;

    const mc = getMoveCost(stack[0], col, row, n.col, n.row, 'combat');
    if (mc.cost === Infinity) continue;

    const existing = testUnits.filter(u =>
      u.hexId === nHexId && u.status !== 'eliminated' &&
      !STACK_EXEMPT_TYPES.includes(u.type) && !stack.includes(u)
    ).length;
    if (existing + movingCount > 4) continue;

    // 簡易スコア: 空いてるヘクスならOK、前進方向を優先
    let score = 0;
    if (SIDE_PARAMS[side].advanceScore) score = SIDE_PARAMS[side].advanceScore(n.col, n.row);
    if (score > bestScore) { bestScore = score; best = { col: n.col, row: n.row }; }
  }
  return best;
}

function _moveStackTo(stack, col, row, hexId) {
  stack.forEach(u => {
    if (u.status === 'eliminated') return;
    u.col = col; u.row = row;
    const center = getHexCenter(col, row);
    u.x = center.x; u.y = center.y;
    u.hexId = hexId;
  });
}

function _findBestPathBFS(side, stack, mp) {
  const startCol = stack[0].col;
  const startRow = stack[0].row;
  const startKey = startCol + ',' + startRow;
  const isDisrupted = stack.some(u => (u.status === 'd' || u.status === 'dd') && u.status !== 'eliminated');
  const enemySide = side === 'german' ? 'allied' : 'german';

  const visited = {};
  visited[startKey] = { cost: 0, prev: null, col: startCol, row: startRow };
  const queue = [{ col: startCol, row: startRow, cost: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();
    const nbs = getHexNeighbors(cur.col, cur.row);

    nbs.forEach(n => {
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) return;
      const nHexId = toHexId(n.col, n.row);
      const terrain = getHexTerrain(nHexId);
      if (terrain === 'x' || terrain === 'lake') return;

      const hasEnemy = testUnits.some(u =>
        u.hexId === nHexId && u.side === enemySide &&
        u.status !== 'eliminated' && u.type !== 'dummy'
      );
      if (hasEnemy) return;

      const mc = getMoveCost(stack[0], cur.col, cur.row, n.col, n.row, 'combat');
      if (mc.cost === Infinity) return;
      const totalCost = cur.cost + mc.cost;
      if (totalCost > mp) return;

      // スタック上限チェック: 移動先に既にいるユニット数+移動中ユニット数 > 4なら不可
      const movingCount = stack.filter(u => u.status !== 'eliminated' && !STACK_EXEMPT_TYPES.includes(u.type)).length;
      const existingAtHex = testUnits.filter(u =>
        u.hexId === nHexId && u.status !== 'eliminated' &&
        !STACK_EXEMPT_TYPES.includes(u.type) && !stack.includes(u)
      ).length;
      if (existingAtHex + movingCount > 4) return;

      const key = n.col + ',' + n.row;
      if (visited[key] && visited[key].cost <= totalCost) return;
      visited[key] = { cost: totalCost, prev: cur.col + ',' + cur.row, col: n.col, row: n.row };
      queue.push({ col: n.col, row: n.row, cost: totalCost });
    });
  }

  AI_CONTROLLER._lastEvalDebug = {};
  let bestKey = null, bestScore = -Infinity;
  const _allScores = {};
  for (const [key, info] of Object.entries(visited)) {
    if (key === startKey) continue;
    const score = AI_CONTROLLER.evaluateHex(side, stack, info.col, info.row);
    _allScores[toHexId(info.col, info.row)] = score;
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }

  // 現在位置のスコアと比較
  const stayScore = AI_CONTROLLER.evaluateHex(side, stack, startCol, startRow);

  // デバッグログ: スタック名、出発地、候補上位5、各Expert別スコア
  const unitNames = stack.map(u => u.name).join(',');
  const startHex = toHexId(startCol, startRow);
  const sorted = Object.entries(_allScores).sort((a,b) => b[1] - a[1]).slice(0, 5);
  const bestHexId = bestKey ? toHexId(visited[bestKey].col, visited[bestKey].row) : 'なし';
  const dbgBest = AI_CONTROLLER._lastEvalDebug[bestHexId] || {};
  console.log(`[AI-BFS] ${unitNames} at ${startHex} → best:${bestHexId}(${bestScore.toFixed(0)}) stay:(${stayScore.toFixed(0)})`);
  console.log(`  Expert: bt=${(dbgBest.breakthrough||0).toFixed(0)} fire=${(dbgBest.fire||0).toFixed(0)} assault=${(dbgBest.assault||0).toFixed(0)} threat=${(dbgBest.threat||0).toFixed(0)} stack=${(dbgBest.stacking||0).toFixed(0)} recon=${(dbgBest.recon||0).toFixed(0)}`);
  console.log(`  Top5: ${sorted.map(([h,s]) => h+'='+s.toFixed(0)).join(', ')}`);

  if (stayScore >= bestScore) return null;

  if (!bestKey) return null;

  const path = [];
  let k = bestKey;
  while (k && k !== startKey) {
    const info = visited[k];
    path.unshift({ col: info.col, row: info.row });
    k = info.prev;
  }
  return path;
}

function _getBestNeighborGreedy(side, stack, mp) {
  const curCol = stack[0].col;
  const curRow = stack[0].row;
  const nbs = getHexNeighbors(curCol, curRow);
  const enemySide = side === 'german' ? 'allied' : 'german';

  let bestHex = null, bestScore = -Infinity;

  nbs.forEach(n => {
    if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) return;
    const nHexId = toHexId(n.col, n.row);
    const nTerrain = getHexTerrain(nHexId);
    if (nTerrain === 'x' || nTerrain === 'lake') return;

    const hasEnemy = testUnits.some(u =>
      u.hexId === nHexId && u.side === enemySide &&
      u.status !== 'eliminated' && u.type !== 'dummy'
    );
    if (hasEnemy) return;

    const mc = getMoveCost(stack[0], curCol, curRow, n.col, n.row, 'combat');
    if (mc.cost === Infinity || mp < mc.cost) return;

    const score = AI_CONTROLLER.evaluateHex(side, stack, n.col, n.row);
    if (score > bestScore) { bestScore = score; bestHex = n; }
  });

  // 現在位置と比較
  const stayScore = AI_CONTROLLER.evaluateHex(side, stack, curCol, curRow);

  // デバッグログ
  const unitNames = stack.map(u => u.name).join(',');
  const curHex = toHexId(curCol, curRow);
  const bestHexId = bestHex ? toHexId(bestHex.col, bestHex.row) : 'なし';
  const dbgBest = bestHex ? (AI_CONTROLLER._lastEvalDebug || {})[bestHexId] || {} : {};
  console.log(`[AI-Greedy] ${unitNames} at ${curHex} → best:${bestHexId}(${bestScore.toFixed(0)}) stay:(${stayScore.toFixed(0)})`);
  if (bestHex) console.log(`  Expert: bt=${(dbgBest.breakthrough||0).toFixed(0)} fire=${(dbgBest.fire||0).toFixed(0)} assault=${(dbgBest.assault||0).toFixed(0)} threat=${(dbgBest.threat||0).toFixed(0)} stack=${(dbgBest.stacking||0).toFixed(0)} recon=${(dbgBest.recon||0).toFixed(0)}`);

  if (stayScore >= bestScore) return null;

  return bestHex;
}

function _handleStopFire(movableStack, dest, side, canFire) {
  const enemySide = side === 'german' ? 'allied' : 'german';
  const livingStack = movableStack.filter(u => u.status !== 'eliminated');
  if (livingStack.length === 0) return { stack: [] };

  const stopShooters = testUnits.filter(e =>
    e.side === enemySide && e.status === 'ok' &&
    e.type !== 'dummy' && e.type !== 'A' && e.type !== 'leader' &&
    (e.fpAT > 0 || e.fpSoft > 0)
  ).filter(e => {
    const dist = hexDistance(e.col, e.row, dest.col, dest.row);
    if (dist <= 0 || dist > (e.range || 1)) return false;
    return hasLOS(e.col, e.row, dest.col, dest.row);
  });

  if (stopShooters.length > 0) {
    // ストップ射撃
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

    // 反撃
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

    // D/DDユニット離脱
    const damaged = movableStack.filter(u => u.status === 'd' || u.status === 'dd');
    if (damaged.length > 0) {
      movableStack = movableStack.filter(u => u.status === 'ok');
      damaged.forEach(u => {
        addLog('move', `${u.name} (${u.status.toUpperCase()}) スタックから離脱`);
      });
    }
  }

  return { stack: movableStack };
}

// ============================================================
// 統合射撃フェイズ
// ============================================================

async function aiFirePhase(side) {
  const _fireDelay = () => new Promise(r => setTimeout(r, 1200));

  AI_CONTROLLER.buildBoard(side);

  const shooterHexes = {};
  testUnits.filter(u =>
    u.side === side && u.status === 'ok' &&
    !u.firedThisTurn && !u._counterFired && u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'A'
  ).forEach(u => {
    if (!shooterHexes[u.hexId]) shooterHexes[u.hexId] = [];
    shooterHexes[u.hexId].push(u);
  });

  for (const [hexId, shooters] of Object.entries(shooterHexes)) {
    if (shooters.length === 0) continue;

    const assignments = AI_CONTROLLER.allocateFire(side, hexId, shooters);
    if (assignments.length === 0) continue;

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

// ============================================================
// 統合突撃フェイズ
// ============================================================

function aiAutoAssault(side) {
  const params = SIDE_PARAMS[side];
  const enemySide = side === 'german' ? 'allied' : 'german';

  AI_CONTROLLER.buildBoard(side);

  const myUnits = testUnits.filter(u =>
    u.side === side && u.status !== 'eliminated' && u.status !== 'dd' &&
    u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'AT' && u.type !== 'A'
  );

  const hexGroups = {};
  myUnits.forEach(u => {
    if (!hexGroups[u.hexId]) hexGroups[u.hexId] = [];
    hexGroups[u.hexId].push(u);
  });

  for (const [hexId, stack] of Object.entries(hexGroups)) {
    const aliveStack = stack.filter(u => u.status !== 'eliminated' && u.status !== 'dd');
    if (aliveStack.length === 0) continue;

    const pos = fromHexId(hexId);
    const nbs = getHexNeighbors(pos.col, pos.row);

    for (const n of nbs) {
      const enemyHexId = toHexId(n.col, n.row);
      if (AI_CONTROLLER.shouldAssault(side, aliveStack, enemyHexId)) {
        const r = executeAssault(aliveStack, enemyHexId);
        if (!r || r.error || r.dummyOnly || r.surrender) break;

        applyAssaultAtkDamage(r);
        applyAssaultDefDamage(r);

        const defRemain = testUnits.filter(u =>
          u.hexId === enemyHexId && u.side === enemySide && u.status !== 'eliminated'
        );
        if (defRemain.length === 0) {
          const atkAlive = aliveStack.filter(u => u.status !== 'eliminated');
          atkAlive.forEach(u => {
            const c = getHexCenter(n.col, n.row);
            u.col = n.col; u.row = n.row;
            u.x = c.x; u.y = c.y;
            u.hexId = enemyHexId;
          });
          const sideLabel = side === 'german' ? 'ドイツ' : '連合';
          addLog('assault', `${sideLabel}AI: ${atkAlive.map(u=>u.name).join('+')} が ${enemyHexId} に前進`);
        }
        break;
      }
    }
  }
}

// ============================================================
// 互換shim関数（既存コードからの呼び出しをサポート）
// ============================================================

// ドイツ軍
function geAI_evaluateNeighbor(stack, col, row, isDisrupted) {
  return AI_CONTROLLER.evaluateHex('german', stack, col, row);
}

function geAI_findBestPath(stack, mp) {
  AI_CONTROLLER.buildBoard('german');
  return _findBestPathBFS('german', stack, mp);
}

function geAI_shouldAssault(stack, enemyHexId) {
  return AI_CONTROLLER.shouldAssault('german', stack, enemyHexId);
}

function geAI_moveAllStacks(canFire) {
  return aiMoveAllStacks('german', canFire);
}

function geAI_autoAssault() {
  return aiAutoAssault('german');
}

function geAI_groupStacks(units) {
  return _groupStacks(units, SIDE_PARAMS.german);
}

// 連合軍
function ukAI_evaluateNeighbor(stack, col, row, isDisrupted) {
  return AI_CONTROLLER.evaluateHex('allied', stack, col, row);
}

function ukAI_getBestNeighbor(stack, mp) {
  AI_CONTROLLER.buildBoard('allied');
  return _getBestNeighborGreedy('allied', stack, mp);
}

function ukAI_moveAllStacks(canFire) {
  return aiMoveAllStacks('allied', canFire);
}

function ukAI_firePhase() {
  return aiFirePhase('allied');
}

function ukAI_assignFireTargets(shooterHex, shooters) {
  AI_CONTROLLER.buildBoard('allied');
  return AI_CONTROLLER.allocateFire('allied', shooterHex, shooters);
}

// ユーティリティshim
function geAI_isInEnemyFireZone(col, row) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.isInEnemyFireZone(col, row) : false;
}
function geAI_getEnemyThreat(col, row) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.getEnemyThreat(col, row) : { count: 0, totalFP: 0, maxRange: 0 };
}
function geAI_isCoverTerrain(col, row) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.isCoverTerrain(col, row) : false;
}
function geAI_nearestEnemyDist(col, row) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.nearestEnemyDist(col, row) : Infinity;
}
function geAI_nearestArmoredEnemyDist(col, row) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.nearestArmoredEnemyDist(col, row) : Infinity;
}
function geAI_getAdjacentEnemies(col, row) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.getAdjacentEnemies(col, row) : [];
}
function geAI_getEnemiesInRange(col, row, range) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.getEnemiesInRange(col, row, range) : [];
}
function geAI_hasFriendlyStack(hexId, stack) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.getFriendlyCountAt(hexId, stack) > 0 : false;
}
function geAI_friendlyCountAt(hexId, stack) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.getFriendlyCountAt(hexId, stack) : 0;
}
function geAI_hasUnclearedEnemyBehind(curCol, destCol, curRow, destRow) {
  const board = AI_CONTROLLER.getBoard('german');
  return board ? board.hasUnclearedEnemyBehind(curCol, destCol, curRow, destRow) : false;
}

function ukAI_isInEnemyFireZone(col, row) {
  const board = AI_CONTROLLER.getBoard('allied');
  return board ? board.isInEnemyFireZone(col, row) : false;
}
function ukAI_isCoverTerrain(col, row) {
  const board = AI_CONTROLLER.getBoard('allied');
  return board ? board.isCoverTerrain(col, row) : false;
}
function ukAI_nearestEnemyDist(col, row) {
  const board = AI_CONTROLLER.getBoard('allied');
  return board ? board.nearestEnemyDist(col, row) : Infinity;
}
function ukAI_getGermanFrontCol() {
  if (typeof S3_BREAKTHROUGH_COL !== 'undefined') {
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
function ukAI_getGermanFrontPositions() {
  return testUnits.filter(u =>
    u.side === 'german' && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' &&
    u.col >= 0 && u.col < MAP_CONFIG.cols
  ).map(u => ({ col: u.col, row: u.row }));
}
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
function ukAI_blockingScore(col, row) {
  const board = AI_CONTROLLER.getBoard('allied');
  return SIDE_PARAMS.allied.blockingScore(col, row, board);
}
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

// geAI_getBestNeighbor shim（旧コードにあった欠落関数）
function geAI_getBestNeighbor(stack, mp) {
  AI_CONTROLLER.buildBoard('german');
  return _getBestNeighborGreedy('german', stack, mp);
}

console.log('ai_blackboard.js loaded (Blackboard + Experts)');
