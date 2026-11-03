// wsm_ai.js — 帆船ゲームAI（陣営別パラメーター対応）
// 前提: hub.html の hexDist, hexNeighbor, getArcToTarget, maxMoveForAttitude 等が読み込み済み

// ============================================================
// AI調整パラメーター集約（UIから書き換え可能・陣営別）
// jp(英軍) と us(連合軍) で別々の設定を保持。
// ============================================================
const AI_PARAMS_DEFAULT = {
  // === 先読み ===
  lookahead: 2,
  lookaheadCurrentWeight: 0.4,
  lookaheadNextWeight: 0.6,
  lookaheadTopK: 20,
  // === 索敵・選定 ===
  searchRadius: 10,
  selectDistCoef: 2,
  selectWeaknessWeight: 30,
  selectUpwindPenalty: 50,
  // === scoreEnd 共通 ===
  rakeBonus: 250,
  rakedPenalty: 200,
  rakeAvoidBonus: 200,
  enemyTipAdjacentBonus: 100,
  // === scoreEnd (us 側=連合軍 / 接舷重視) ===
  boardingScores: [800, 500, 250],
  boardingContinuousCoef: 80,
  // === scoreEnd (jp 側=英軍 / 砲撃重視) ===
  jpStayDistance: 10,
  jpStayBonus: 1000,
  jpFarBaseBonus: 1500,
  jpFarDecayPerHex: 50,
  jpBroadsideFarBonus: 500,
  // === scoreEnd (近距離 ≤5 共通) ===
  bowFarBonus: 50, sideFarBonus: 20, otherFarPenalty: 30,
  broadsideNearBonus: 80, bowNearBonus: 20,
  sternNearPenalty: 40, otherNearPenalty: 60,
  enemyBroadsidePenalty: 80,
  // === aiFireDecide ===
  fireBroadsideBonus: 50,
  // === aiBoardDecide ===
  boardGrappleRatio: 1.1,
  boardUngrappleRatio: 0.9,
  // === aiAnchorDecide ===
  anchorMinDist: 4,
  anchorMaxDist: 7,
  // === aiSailDecide ===
  sailFullDistOver: 6,
  sailBattleDistUnder: 4,
  // === aiAmmoDecide ===
  rigSailTargetThreshold: 0.3,
  ammoCloseRange: 3,
  ammoLongRange: 10,
  ammoDoubleHullPct: 0.3,
  ammoGrapeCrewMin: 8,
  // === 英軍(jp) 接舷回避 ===
  jpAvoidAdjacentEnemy: true,
  // === ランダム要素 ===
  scoreEndRandomness: 0.1,
  selectTargetRandomness: 0.1,
  fireDecideRandomness: 0.1,
  boardingRatioJitter: 0.05,
};

// 実行時パラメーター: 陣営別に保持
let AI_PARAMS_BY_SIDE = (() => {
  const loadOne = (key) => {
    try {
      if (typeof localStorage !== 'undefined') {
        const s = localStorage.getItem(key);
        if (s) return Object.assign({}, AI_PARAMS_DEFAULT, JSON.parse(s));
      }
    } catch(e) { console.warn('AI_PARAMS load failed:', key, e); }
    return Object.assign({}, AI_PARAMS_DEFAULT);
  };
  const obj = { jp: loadOne('wsmAiParams_jp'), us: loadOne('wsmAiParams_us') };
  // 旧キー(陣営なし)があれば両側に反映 (後方互換)
  try {
    if (typeof localStorage !== 'undefined') {
      const old = localStorage.getItem('wsmAiParams');
      if (old) {
        const o = JSON.parse(old);
        Object.assign(obj.jp, o);
        Object.assign(obj.us, o);
      }
    }
  } catch(e) {}
  return obj;
})();

function paramsFor(ship) {
  return AI_PARAMS_BY_SIDE[ship && ship.side === 'us' ? 'us' : 'jp'];
}

// score にランダムノイズを乗算
function aiJitter(score, r) {
  if (!r) return score;
  return score * (1 + (Math.random() - 0.5) * 2 * r);
}

function aiBearing(fromCol, fromRow, toCol, toRow) {
  const dirs = [8, 9, 3, 2, 1, 7];
  let best = null;
  for (const d of dirs) {
    const n = hexNeighbor(fromCol, fromRow, d);
    if (!n) continue;
    const dist = hexDist(n.col, n.row, toCol, toRow);
    if (!best || dist < best.dist) best = { dir: d, dist };
  }
  return best ? best.dir : 2;
}

function aiSelectTarget(ship, state) {
  const P = paramsFor(ship);
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet)
    .filter(e => e.status === 'ok' && !e.sunk && e.col >= 0 && (!e.enterTurn || state.turn >= e.enterTurn));
  if (enemies.length === 0) return null;
  // 白兵戦支援
  const _allies = ship.side === 'us' ? state.usFleet : state.jpFleet;
  for (const _a of _allies) {
    if (!_a || _a === ship || _a.col < 0 || _a.status !== 'ok') continue;
    if (!_a.grappledWith?.length) continue;
    const _dA = hexDist(ship.col, ship.row, _a.col, _a.row);
    if (_dA > 3) continue;
    for (const _enName of _a.grappledWith) {
      const _e = enemies.find(x => x.name === _enName);
      if (_e) return _e;
    }
  }
  const nearby = enemies.filter(e => hexDist(ship.col, ship.row, e.col, e.row) <= P.searchRadius);
  if (nearby.length === 0) {
    let nearest = null;
    for (const e of enemies) {
      const d = hexDist(ship.col, ship.row, e.col, e.row);
      if (!nearest || d < nearest.d) nearest = { e, d };
    }
    return nearest ? nearest.e : null;
  }
  const wind = state.wind;
  let best = null;
  for (const e of nearby) {
    const d = hexDist(ship.col, ship.row, e.col, e.row);
    const bear = aiBearing(ship.col, ship.row, e.col, e.row);
    const mpToBear = (typeof maxMoveForAttitude === 'function')
      ? maxMoveForAttitude({ ...ship, dir: bear }, wind) : 4;
    const hullPct = e.hull ? (e.hull.remain / e.hull.max) : 1;
    const crewRem = (e.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
    const crewMax = Math.max(1, (e.crew?.abilitiesMax||[]).reduce((a,v) => a + (v||0), 0));
    const crewPct = crewMax > 0 ? crewRem / crewMax : 1;
    const weakness = 2 - hullPct - crewPct;
    let score = -d * P.selectDistCoef + weakness * P.selectWeaknessWeight;
    if (mpToBear <= 0) score -= P.selectUpwindPenalty;
    score = aiJitter(score, P.selectTargetRandomness);
    if (!best || score > best.score) best = { e, d, score };
  }
  return best ? best.e : null;
}

function aiAmmoDecide(ship, target, dist) {
  const P = paramsFor(ship);
  const qOrder = { elite:5, crack:4, average:3, green:2, poor:1 };
  const grappled = (ship.grappledWith && ship.grappledWith.includes(target.name))
                || (target.grappledWith && target.grappledWith.includes(ship.name));
  if (grappled) {
    const myCrew = (ship.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
    const enCrew = (target.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
    const myStr = myCrew * (qOrder[ship.crewQuality||'average'] || 3);
    const enStr = enCrew * (qOrder[target.crewQuality||'average'] || 3);
    if (myStr < enStr) return 'grape';
  }
  if (dist > P.ammoLongRange) return 'round';
  if (ship.side === 'jp') {
    if (dist <= P.ammoCloseRange) return 'chain';
    return 'round';
  }
  const rigSec = target.rigging?.sections || [];
  const rigSecMax = target.rigging?.sectionsMax || [];
  const rigSum = rigSec.reduce((a,v)=>a+(v||0),0);
  const rigSumMax = Math.max(1, rigSecMax.reduce((a,v)=>a+(v||0),0));
  const rigPct = rigSum / rigSumMax;
  const sailTarget = rigPct >= P.rigSailTargetThreshold;
  if (sailTarget) {
    if (dist <= P.ammoCloseRange) return 'chain';
    return 'round';
  }
  if (dist <= 1) {
    const crewRem = (target.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
    const hullPct = target.hull ? target.hull.remain / target.hull.max : 1;
    if (crewRem >= P.ammoGrapeCrewMin) return 'grape';
    if (hullPct < 0.5) return 'double';
    return 'round';
  }
  if (dist >= 2) {
    const hullPct = target.hull ? target.hull.remain / target.hull.max : 1;
    if (hullPct <= P.ammoDoubleHullPct) return 'double';
    return 'round';
  }
  return 'round';
}

function scoreEnd(col, row, dir, target, ship, state) {
  const P = paramsFor(ship);
  const dist = hexDist(col, row, target.col, target.row);
  let score;
  if (ship && ship.side === 'us') {
    score = 0;
    const bs = P.boardingScores;
    if (dist <= 1) score += bs[0];
    if (dist <= 2) score += bs[1];
    if (dist <= 5) score += bs[2];
    score += Math.max(0, 50 - dist) * P.boardingContinuousCoef;
    if (dist <= P.searchRadius && typeof isRaking === 'function') {
      const _rakeBy = isRaking(target, { col, row, dir });
      if (_rakeBy !== 'bow_rake' && _rakeBy !== 'stern_rake') score += P.rakeAvoidBonus;
    }
  } else {
    let _distBonus;
    if (dist <= P.jpStayDistance) _distBonus = P.jpStayBonus;
    else _distBonus = Math.max(0, P.jpFarBaseBonus - (dist - P.jpStayDistance) * P.jpFarDecayPerHex);
    score = _distBonus;
    if (typeof getArcToTarget === 'function') {
      const _arcSide = getArcToTarget({ col, row, dir }, target);
      if (_arcSide === 'port' || _arcSide === 'stbd') score += P.jpBroadsideFarBonus;
    }
    if (dist <= P.searchRadius && typeof isRaking === 'function') {
      const _rakeBy = isRaking(target, { col, row, dir });
      if (_rakeBy !== 'bow_rake' && _rakeBy !== 'stern_rake') score += P.rakeAvoidBonus;
    }
    return aiJitter(score, P.scoreEndRandomness);
  }
  if (dist > 5 && typeof getArcToTarget === 'function') {
    const _arcFar = getArcToTarget({ col, row, dir }, target);
    if (_arcFar === 'bow') score += P.bowFarBonus;
    else if (_arcFar === 'port' || _arcFar === 'stbd') score += P.sideFarBonus;
    else score -= P.otherFarPenalty;
  }
  if (dist <= 5 && typeof getArcToTarget === 'function') {
    const arc = getArcToTarget({ col, row, dir }, target);
    if (arc === 'port' || arc === 'stbd') score += P.broadsideNearBonus;
    else if (arc === 'bow') score += P.bowNearBonus;
    else if (arc === 'stern') score -= P.sternNearPenalty;
    else score -= P.otherNearPenalty;
    const eArc = getArcToTarget(target, { col, row, dir });
    if (eArc === 'port' || eArc === 'stbd') score -= P.enemyBroadsidePenalty;
    if (typeof isRaking === 'function') {
      const rakeMe = isRaking({ col, row, dir }, target);
      if (rakeMe === 'bow_rake' || rakeMe === 'stern_rake') score += P.rakeBonus;
      const rakeTarget = isRaking(target, { col, row, dir });
      if (rakeTarget === 'bow_rake' || rakeTarget === 'stern_rake') score -= P.rakedPenalty;
    }
    if (typeof hexNeighbor === 'function' && typeof DIR_OPPOSITE !== 'undefined') {
      const bowHex = hexNeighbor(target.col, target.row, target.dir);
      const sternDirOpp = DIR_OPPOSITE[target.dir];
      const sternBehind = sternDirOpp ? hexNeighbor(target.col, target.row, sternDirOpp) : null;
      const dBow = bowHex ? hexDist(col, row, bowHex.col, bowHex.row) : 99;
      const dStern = sternBehind ? hexDist(col, row, sternBehind.col, sternBehind.row) : 99;
      if (Math.min(dBow, dStern) <= 1) score += P.enemyTipAdjacentBonus;
    }
  }
  return aiJitter(score, P.scoreEndRandomness);
}

function enumeratePlots(ship, state, target, blockedHexes) {
  const wind = state.wind;
  const order = [8, 9, 3, 2, 1, 7];
  const blocked = blockedHexes || new Set();
  const leaves = [];
  // 移動の決まりは wsm_movement.js の共通の計算を使う
  function dfs(st, moves, depth) {
    if (depth > 15) { leaves.push({ moves: moves.slice(), col: st.col, row: st.row, dir: st.dir }); return; }
    let branched = false;
    if (moveCanAdvance(st, ship, wind)) {
      const fwd = hexNeighbor(st.col, st.row, st.dir);
      const fwdStern = fwd ? hexNeighbor(fwd.col, fwd.row, DIR_OPPOSITE[st.dir]) : null;
      const bowOk = fwd && inMap(fwd.col, fwd.row);
      const sternOk = !fwdStern || inMap(fwdStern.col, fwdStern.row);
      if (bowOk && sternOk && !blocked.has(`${fwd.col},${fwd.row}`)) {
        const c = { ...st }; moveApplyAdvance(c, fwd.col, fwd.row);
        moves.push('5');
        dfs(c, moves, depth + 1);
        moves.pop();
        branched = true;
      }
    }
    if (moveCanTurn(st, ship, wind)) {
      const iNow = order.indexOf(st.dir);
      for (const delta of [1, 5]) {
        const newDir = order[(iNow + delta) % 6];
        const c = { ...st }; moveApplyTurn(c, ship, wind, newDir);
        moves.push(String(newDir));
        dfs(c, moves, depth + 1);
        moves.pop();
        branched = true;
      }
    }
    if (!branched) leaves.push({ moves: moves.slice(), col: st.col, row: st.row, dir: st.dir });
  }
  dfs(moveStateInit(ship, wind), [], 0);
  return leaves;
}

function aiPlotMoves(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const P = paramsFor(ship);
  if (ship.enterTurn && state.turn < ship.enterTurn) { ship.plottedMoves = []; ship.plotDone = true; return; }
  if (ship.grappledWith?.length > 0) { ship.plottedMoves = []; ship.plotDone = true; return; }
  const target = aiSelectTarget(ship, state);
  if (!target) { ship.plottedMoves = []; ship.plotDone = true; return; }
  const blockedHexes = new Set();
  const allShips = [...state.jpFleet, ...state.usFleet];
  for (const s of allShips) {
    if (s === ship || s.col < 0 || s.status === 'sunk' || s.status === 'exploded') continue;
    blockedHexes.add(`${s.col},${s.row}`);
    if (typeof getSternHex === 'function') {
      const st = getSternHex(s);
      if (st) blockedHexes.add(`${st.col},${st.row}`);
    }
  }
  let leaves = enumeratePlots(ship, state, target, blockedHexes);
  if (leaves.length === 0) { ship.plottedMoves = []; ship.plotDone = true; return; }
  if (ship.side === 'jp' && P.jpAvoidAdjacentEnemy) {
    const enemies = state.usFleet.filter(e => e.status === 'ok' && e.col >= 0);
    const filtered = leaves.filter(l => {
      for (const e of enemies) {
        if (hexDist(l.col, l.row, e.col, e.row) <= 1) return false;
      }
      return true;
    });
    if (filtered.length > 0) leaves = filtered;
  }
  leaves.forEach(l => { l.score1 = scoreEnd(l.col, l.row, l.dir, target, ship, state); });
  let best = null;
  if (P.lookahead >= 2) {
    leaves.sort((a, b) => b.score1 - a.score1);
    const top = leaves.slice(0, Math.max(1, P.lookaheadTopK));
    for (const leaf of top) {
      const mockShip = { ...ship, col: leaf.col, row: leaf.row, dir: leaf.dir };
      const next = enumeratePlots(mockShip, state, target, blockedHexes);
      let bestNext = leaf.score1;
      for (const n of next) {
        const s = scoreEnd(n.col, n.row, n.dir, target, ship, state);
        if (s > bestNext) bestNext = s;
      }
      const total = leaf.score1 * P.lookaheadCurrentWeight + bestNext * P.lookaheadNextWeight;
      if (!best || total > best._total) best = { ...leaf, _total: total };
    }
  } else {
    for (const leaf of leaves) {
      if (!best) { best = leaf; continue; }
      if (leaf.score1 > best.score1) { best = leaf; continue; }
      if (leaf.score1 === best.score1 && (leaf.moves||[]).length < (best.moves||[]).length) {
        best = leaf;
      }
    }
  }
  if (best && (best.moves||[]).length === 0) {
    const currentMp = (typeof maxMoveForAttitude === 'function') ? maxMoveForAttitude(ship, state.wind) : 0;
    if (currentMp === 0) {
      for (const leaf of leaves) {
        if ((leaf.moves||[]).length > 0) {
          const turnedMp = maxMoveForAttitude({...ship, dir: leaf.dir}, state.wind);
          if (turnedMp > 0) { best = leaf; break; }
        }
      }
    }
  }
  ship.plottedMoves = best ? best.moves : [];
  ship.plotDone = true;
}

// 射撃判断: 最寄り敵を狙う。同距離複数なら 舷射界+ジッター で選択
function aiFireDecide(ship, state) {
  if (!ship || ship.status !== 'ok') return null;
  const P = paramsFor(ship);
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok' && !e.sunk);
  const cand = [];
  for (const e of enemies) {
    const d = hexDist(ship.col, ship.row, e.col, e.row);
    if (d > P.searchRadius) continue;
    let arc = 'none';
    if (typeof getArcToTarget === 'function') arc = getArcToTarget(ship, e);
    if (arc === 'none' || arc === 'stern') continue;
    cand.push({ e, d, arc });
  }
  if (cand.length === 0) return null;
  let minD = Infinity;
  for (const c of cand) if (c.d < minD) minD = c.d;
  const nearest = cand.filter(c => c.d === minD);
  let best = null;
  for (const c of nearest) {
    const ammo = aiAmmoDecide(ship, c.e, c.d);
    const baseScore = ((c.arc === 'port' || c.arc === 'stbd') ? P.fireBroadsideBonus : 0);
    const score = aiJitter(baseScore, P.fireDecideRandomness);
    if (!best || score > best.score) best = { target: c.e, arc: c.arc, ammo, score };
  }
  return best;
}

function aiBoardDecide(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const P = paramsFor(ship);
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok');
  const qOrder = { elite:5, crack:4, average:3, green:2, poor:1 };
  const myQ = qOrder[ship.crewQuality||'average'] || 3;
  const myCrew = (ship.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
  const myStr = myCrew * myQ;
  if (ship.grappledWith && ship.grappledWith.length > 0) {
    let strongerAll = true;
    for (const name of ship.grappledWith) {
      const e = enemies.find(x => x.name === name);
      if (!e) continue;
      const enQ = qOrder[e.crewQuality||'average'] || 3;
      const enCrew = (e.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
      const enStr = enCrew * enQ;
      const jit = (Math.random() - 0.5) * 2 * (P.boardingRatioJitter || 0);
      if (myStr < enStr * (P.boardUngrappleRatio + jit)) strongerAll = false;
    }
    ship.wantUngrapple = !strongerAll;
    ship.wantGrapple = false;
    ship.obpAssigned = Math.max(1, Math.floor(myCrew / 2));
    ship.dbpAssigned = myCrew - ship.obpAssigned;
    return;
  }
  ship.wantGrapple = false;
  ship.wantUngrapple = false;
  ship.obpAssigned = 0;
  ship.dbpAssigned = 0;
  for (const e of enemies) {
    const d = hexDist(ship.col, ship.row, e.col, e.row);
    if (d > 1) continue;
    const enQ = qOrder[e.crewQuality||'average'] || 3;
    const enCrew = (e.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
    const enStr = enCrew * enQ;
    const jit = (Math.random() - 0.5) * 2 * (P.boardingRatioJitter || 0);
    if (myStr >= enStr * (P.boardGrappleRatio + jit)) {
      ship.wantGrapple = true;
      break;
    }
  }
}

function aiAnchorDecide(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const P = paramsFor(ship);
  const target = aiSelectTarget(ship, state);
  if (ship.anchored) {
    if (!target) { ship.anchored = false; return; }
    const d = hexDist(ship.col, ship.row, target.col, target.row);
    if (d < P.anchorMinDist || d > P.anchorMaxDist) { ship.anchored = false; return; }
    if (typeof getArcToTarget === 'function') {
      const arc = getArcToTarget(ship, target);
      if (arc !== 'port' && arc !== 'stbd') { ship.anchored = false; return; }
    }
    return;
  }
  if (!target) return;
  const d = hexDist(ship.col, ship.row, target.col, target.row);
  if (d < P.anchorMinDist || d > P.anchorMaxDist) return;
  if (typeof getArcToTarget !== 'function') return;
  const arc = getArcToTarget(ship, target);
  if (arc !== 'port' && arc !== 'stbd') return;
  const fwd = hexNeighbor(ship.col, ship.row, ship.dir);
  if (fwd) {
    const fwdArc = getArcToTarget({ col: fwd.col, row: fwd.row, dir: ship.dir }, target);
    if (fwdArc === 'port' || fwdArc === 'stbd') return;
  }
  ship.anchored = true;
  ship.plottedMoves = [];
}

function aiSailDecide(ship, state) {
  if (!ship) return;
  const P = paramsFor(ship);
  if (ship.anchored) { ship.pendingSailMode = 'furled'; return; }
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok');
  let minDist = 99;
  for (const e of enemies) minDist = Math.min(minDist, hexDist(ship.col, ship.row, e.col, e.row));
  if (minDist > P.sailFullDistOver && ship.sailState !== 'full') ship.pendingSailMode = 'full';
  else if (minDist <= P.sailBattleDistUnder && ship.sailState !== 'battle') ship.pendingSailMode = 'battle';
}

function aiRunAll(state) {
  for (const s of state.usFleet) {
    aiAnchorDecide(s, state);
    if (!s.anchored) aiPlotMoves(s, state);
    aiSailDecide(s, state);
    aiBoardDecide(s, state);
  }
}

// ============================================================
// AI_PARAMS 操作API（陣営別対応）
// ============================================================
// aiApplyParams(side, obj) — 'jp' or 'us' を指定して該当陣営のみ更新
// aiApplyParams(obj)       — 互換: 両陣営に同一設定を適用
function aiApplyParams(side, obj) {
  if (typeof side === 'object' && side !== null) { obj = side; side = null; }
  if (side === 'jp' || side === 'us') {
    AI_PARAMS_BY_SIDE[side] = Object.assign({}, AI_PARAMS_DEFAULT, obj || {});
    try { localStorage.setItem('wsmAiParams_'+side, JSON.stringify(AI_PARAMS_BY_SIDE[side])); } catch(e) {}
  } else {
    AI_PARAMS_BY_SIDE.jp = Object.assign({}, AI_PARAMS_DEFAULT, obj || {});
    AI_PARAMS_BY_SIDE.us = Object.assign({}, AI_PARAMS_DEFAULT, obj || {});
    try {
      localStorage.setItem('wsmAiParams_jp', JSON.stringify(AI_PARAMS_BY_SIDE.jp));
      localStorage.setItem('wsmAiParams_us', JSON.stringify(AI_PARAMS_BY_SIDE.us));
    } catch(e) {}
  }
}
function aiResetParams(side) {
  if (side === 'jp' || side === 'us') {
    AI_PARAMS_BY_SIDE[side] = Object.assign({}, AI_PARAMS_DEFAULT);
    try { localStorage.removeItem('wsmAiParams_'+side); } catch(e) {}
  } else {
    AI_PARAMS_BY_SIDE.jp = Object.assign({}, AI_PARAMS_DEFAULT);
    AI_PARAMS_BY_SIDE.us = Object.assign({}, AI_PARAMS_DEFAULT);
    try {
      localStorage.removeItem('wsmAiParams_jp');
      localStorage.removeItem('wsmAiParams_us');
    } catch(e) {}
  }
}
function aiGetParams(side) {
  if (side === 'jp' || side === 'us') return AI_PARAMS_BY_SIDE[side];
  return AI_PARAMS_BY_SIDE.jp;  // 互換: 引数なしは jp
}
function aiGetDefaultParams() { return AI_PARAMS_DEFAULT; }
function aiCopyParams(srcSide, dstSide) {
  if ((srcSide === 'jp' || srcSide === 'us') && (dstSide === 'jp' || dstSide === 'us') && srcSide !== dstSide) {
    AI_PARAMS_BY_SIDE[dstSide] = Object.assign({}, AI_PARAMS_BY_SIDE[srcSide]);
    try { localStorage.setItem('wsmAiParams_'+dstSide, JSON.stringify(AI_PARAMS_BY_SIDE[dstSide])); } catch(e) {}
  }
}

if (typeof window !== 'undefined') {
  window.aiPlotMoves = aiPlotMoves;
  window.aiFireDecide = aiFireDecide;
  window.aiSailDecide = aiSailDecide;
  window.aiBoardDecide = aiBoardDecide;
  window.aiAnchorDecide = aiAnchorDecide;
  window.aiAmmoDecide = aiAmmoDecide;
  window.aiSelectTarget = aiSelectTarget;
  window.aiRunAll = aiRunAll;
  window.aiBearing = aiBearing;
  window.AI_PARAMS_DEFAULT = AI_PARAMS_DEFAULT;
  window.AI_PARAMS_BY_SIDE = AI_PARAMS_BY_SIDE;
  window.aiApplyParams = aiApplyParams;
  window.aiResetParams = aiResetParams;
  window.aiGetParams = aiGetParams;
  window.aiGetDefaultParams = aiGetDefaultParams;
  window.aiCopyParams = aiCopyParams;
  Object.defineProperty(window, 'AI_PARAMS', {
    get(){ return AI_PARAMS_BY_SIDE.jp; },
    configurable: true
  });
}
