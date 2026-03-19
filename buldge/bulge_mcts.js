// bulge_mcts.js — モンテカルロAI
'use strict';

const MC = {
  SIMS: 30,        // 候補あたりシミュレーション回数
  PLAYOUT_DEPTH: 8, // プレイアウトの手数（両軍合計）
};

// ========== 盤面コピー ==========
function mcCloneUnits() {
  return G.units.map(u => Object.assign({}, u));
}

// ========== 評価関数 ==========
// ドイツ視点スコア（正=ドイツ有利）。連合は符号反転して使う
function mcEvaluate(units) {
  let score = 0;

  // 都市支配
  if (FACILITY_MAP) {
    for (const [hid, fac] of Object.entries(FACILITY_MAP)) {
      if (fac !== 'c') continue;
      const hasGerman = units.some(u => u.side === 'german' && u.hexId === hid && !u.eliminated && !u.exited);
      const hasAllied = units.some(u => u.side === 'allied' && u.hexId === hid && !u.eliminated && !u.exited);
      if (hasGerman) score += 8;
      else if (hasAllied) score -= 5;
      else score += 2; // 空き都市はドイツ寄り（取りに行ける）
    }
  }

  // 部隊残存
  for (const u of units) {
    if (u.eliminated) {
      score += u.side === 'allied' ? 4 : -4;
      continue;
    }
    if (u.exited) continue;

    const power = u.flipped ? u.def : u.atk;
    if (u.side === 'german') {
      score += power * 0.5;
      // 西進度ボーナス（col小さい=西）
      const col = parseInt(u.hexId.substring(0, 2)) - 1;
      score += (20 - col) * 0.3;
    } else {
      score -= power * 0.5;
      // 退却先の少ないユニットはペナルティ（包囲されかけ）
      const retreatCount = mcCountRetreats(units, u);
      if (retreatCount === 0) score += 6; // 完全包囲
      else if (retreatCount === 1) score += 3; // ほぼ包囲
    }
  }

  return score;
}

// 簡易退却先カウント（高速版）
function mcCountRetreats(units, unit) {
  let count = 0;
  const nids = getNeighborIds(unit.hexId);
  for (const nid of nids) {
    const terrain = TERRAIN_MAP[nid];
    if (!terrain || terrain === 'x') continue;
    // 敵がいる
    if (units.some(u => u.hexId === nid && u.side !== unit.side && !u.eliminated && !u.exited)) continue;
    // 敵ZOC
    const inZOC = getNeighborIds(nid).some(adj =>
      units.some(e => e.hexId === adj && e.side !== unit.side && !e.eliminated && !e.exited)
    );
    if (inZOC) continue;
    count++;
  }
  return count;
}

// ========== シミュレーション ==========
// 簡易プレイアウト: units配列上で直接操作（コピー済み前提）
function mcPlayout(units, startSide) {
  let side = startSide;
  for (let step = 0; step < MC.PLAYOUT_DEPTH; step++) {
    const available = units.filter(u =>
      u.side === side && !u._simActed && !u.eliminated && !u.exited && !u.flipped
    );
    if (available.length === 0) {
      side = side === 'german' ? 'allied' : 'german';
      continue;
    }
    // ランダムにユニットを選択
    const unit = available[Math.floor(Math.random() * available.length)];
    unit._simActed = true;

    // ランダム移動先（簡易版: 隣接hexからランダム）
    const nids = getNeighborIds(unit.hexId).filter(nid => {
      const t = TERRAIN_MAP[nid];
      if (!t || t === 'x') return false;
      if (units.some(u => u.hexId === nid && u.side !== unit.side && !u.eliminated && !u.exited)) return false;
      return true;
    });
    if (nids.length > 0 && Math.random() < 0.7) {
      unit.hexId = nids[Math.floor(Math.random() * nids.length)];
    }

    // 隣接敵がいれば確率で戦闘
    const adjEnemies = getNeighborIds(unit.hexId).filter(nid =>
      units.some(u => u.hexId === nid && u.side !== unit.side && !u.eliminated && !u.exited)
    );
    if (adjEnemies.length > 0 && Math.random() < 0.3) {
      const defHex = adjEnemies[Math.floor(Math.random() * adjEnemies.length)];
      const defenders = units.filter(u => u.hexId === defHex && u.side !== unit.side && !u.eliminated);
      if (defenders.length > 0) {
        const atkPower = unit.flipped ? unit.def : unit.atk;
        const defPower = defenders.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
        const diff = atkPower - defPower;
        const die = Math.floor(Math.random() * 6) + 1;
        const result = lookupCRT(diff, die);
        // 簡易結果適用
        if (result === 'DE') defenders.forEach(u => u.eliminated = true);
        else if (result === 'EX') { defenders[0].eliminated = true; unit.eliminated = true; }
        else if (result === 'AR') unit.flipped = true;
        else if (result === 'DD') defenders.forEach(u => u.flipped = true);
      }
    }

    unit.flipped = true;
    side = side === 'german' ? 'allied' : 'german';
  }
  return mcEvaluate(units);
}

// ========== モンテカルロ移動判断 ==========
function mcPickMove(unit, reachable) {
  const side = unit.side;
  const sign = side === 'german' ? 1 : -1; // ドイツ=最大化、連合=最小化
  const candidates = [];

  // 候補: 移動しない + reachable上位（スコアリングで絞る）
  candidates.push({ hex: unit.hexId, label: '待機' });
  for (const [hid] of reachable) {
    candidates.push({ hex: hid });
  }
  // 候補が多すぎる場合は上位8に絞る
  if (candidates.length > 9) {
    // 簡易スコアで事前フィルタ
    candidates.sort((a, b) => {
      const sa = mcQuickScore(a.hex, unit);
      const sb = mcQuickScore(b.hex, unit);
      return (sb - sa) * sign;
    });
    candidates.length = 9;
  }

  console.log(`[MC] ${unit.name} (${side}) at ${dispHex(unit.hexId)} — ${candidates.length}候補`);

  let bestHex = unit.hexId;
  let bestScore = -Infinity * sign;

  for (const cand of candidates) {
    let totalScore = 0;
    for (let i = 0; i < MC.SIMS; i++) {
      const simUnits = mcCloneUnits();
      // この手を適用
      const simUnit = simUnits.find(u => u.id === unit.id);
      if (simUnit) {
        simUnit.hexId = cand.hex;
        simUnit._simActed = true;
        simUnit.flipped = true;
      }
      // プレイアウト
      const enemySide = side === 'german' ? 'allied' : 'german';
      const score = mcPlayout(simUnits, enemySide);
      totalScore += score;
    }
    const avgScore = totalScore / MC.SIMS;
    cand.score = avgScore;
    console.log(`[MC]   ${dispHex(cand.hex)}${cand.label ? '(' + cand.label + ')' : ''}: avg=${avgScore.toFixed(1)}`);

    if ((side === 'german' && avgScore > bestScore) ||
        (side === 'allied' && avgScore < bestScore)) {
      bestScore = avgScore;
      bestHex = cand.hex;
    }
  }

  console.log(`[MC]   → 選択: ${dispHex(bestHex)} (score=${bestScore.toFixed(1)})`);
  addLog('move', `[AI] ${unit.name}: ${dispHex(bestHex)}を選択 (MC=${bestScore.toFixed(1)})`);
  return bestHex;
}

// 簡易スコア（候補絞り込み用）
function mcQuickScore(hid, unit) {
  let score = 0;
  const { col } = parseHexId(hid);
  const isCity = FACILITY_MAP && FACILITY_MAP[hid] === 'c';

  if (unit.side === 'german') {
    score -= col * 3;
    if (isCity) score += 20;
  } else {
    if (isCity) score += 25;
    // 敵からの距離
    const adjEnemyPower = getNeighborIds(hid).reduce((s, nid) => {
      return s + getUnitsAt(nid).filter(e => e.side !== unit.side).reduce((es, e) => es + (e.flipped ? e.def : e.atk), 0);
    }, 0);
    const myPower = unit.flipped ? unit.def : unit.atk;
    if (adjEnemyPower > myPower * 2) score -= 10; // 危険
  }
  return score;
}

// ========== モンテカルロ攻撃判断 ==========
function mcDecideAttack(attackers, defenders, defHexId) {
  const side = G.activeSide;
  const sign = side === 'german' ? 1 : -1;

  // 攻撃する場合のスコア
  let atkTotalScore = 0;
  // 攻撃しない場合のスコア
  let noAtkTotalScore = 0;

  for (let i = 0; i < MC.SIMS; i++) {
    // 攻撃あり
    const simA = mcCloneUnits();
    const simAtk = attackers.map(u => simA.find(s => s.id === u.id)).filter(Boolean);
    const simDef = defenders.map(u => simA.find(s => s.id === u.id)).filter(Boolean);
    const atkPower = simAtk.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
    const defPower = simDef.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
    const diff = atkPower - defPower;
    const die = Math.floor(Math.random() * 6) + 1;
    const result = lookupCRT(diff, die);
    // 結果適用
    if (result === 'DE') simDef.forEach(u => u.eliminated = true);
    else if (result === 'EX') { if (simDef[0]) simDef[0].eliminated = true; if (simAtk[0]) simAtk[0].eliminated = true; }
    else if (result === 'DD') simDef.forEach(u => u.flipped = true);
    else if (result === 'AR') simAtk.forEach(u => u.flipped = true);
    const enemySide = side === 'german' ? 'allied' : 'german';
    atkTotalScore += mcPlayout(simA, enemySide);

    // 攻撃なし
    const simB = mcCloneUnits();
    noAtkTotalScore += mcPlayout(simB, enemySide);
  }

  const atkAvg = atkTotalScore / MC.SIMS;
  const noAtkAvg = noAtkTotalScore / MC.SIMS;
  const shouldAttack = (side === 'german') ? (atkAvg > noAtkAvg) : (atkAvg < noAtkAvg);

  console.log(`[MC] ATTACK? ${dispHex(defHexId)} atk_score=${atkAvg.toFixed(1)} no_atk=${noAtkAvg.toFixed(1)} → ${shouldAttack ? '攻撃' : '見送り'}`);
  addLog('combat', `[AI] ${dispHex(defHexId)}攻撃${shouldAttack ? '実行' : '見送り'} (atk=${atkAvg.toFixed(1)} / skip=${noAtkAvg.toFixed(1)})`);
  return shouldAttack;
}
