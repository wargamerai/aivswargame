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
  // === 風上・風下（1で敵の真上の風上6ヘクス分）: 正は風上を取る、負は風下を取る ===
  weatherGauge: 0,
  // === aiAmmoDecide ===
  // ammoMode: current=今の判断 / round=球弾のみ / hull=球弾と近距離の二重弾 / rig=鎖弾で足を止める / crew=隣接はぶどう弾 / mixed=足の速さと損害で使い分け
  ammoMode: 'current',
  rigSailTargetThreshold: 0.3,
  ammoCloseRange: 3,
  ammoLongRange: 10,
  ammoDoubleHullPct: 0.3,
  ammoGrapeCrewMin: 8,
  // === 英軍(jp) 接舷回避 ===
  jpAvoidAdjacentEnemy: true,
  // === 戦い方（砲撃側 / 白兵戦側）: 毎ターン、残っている砲・乗員と質で相手と比べて決める ===
  gunKeepMin: 2,        // 砲撃側が保つ距離（球形弾が船体に当たるのは5ヘクスまで。隣は鉤縄をかけられる）
  gunKeepMax: 5,
  gunKeepBonus: 1000,
  gunAdjacentScore: 200,
  gunFarDecayPerHex: 100,
  gunBroadsideBonus: 500,
  gunRakeBonus: 400,
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

// ===== 戦い方を決める（ユーザーの指示 2026-11-06）=====
// 砲撃の比 = (自分の残りの舷側砲＋カロネード × 質) ÷ (相手の同じもの)
// 白兵戦の比 = (自分の残りの乗員 × 質) ÷ (相手の同じもの)
// 白兵戦の比のほうが大きければ白兵戦側（近づいて鉤縄、帆を撃つ）、そうでなければ砲撃側（2〜5ヘクスを保って船体を撃つ、鉤縄は外す）
const AI_Q_ORDER = { elite:5, crack:4, average:3, green:2, poor:1 };
function aiGunStr(s) {
  const g = s.broadsideGuns || {}, c = s.carronades || {};
  const n = (g.L?.remain || 0) + (g.R?.remain || 0) + (c.L?.remain || 0) + (c.R?.remain || 0);
  return n * (AI_Q_ORDER[s.crewQuality || 'average'] || 3);
}
function aiMeleeStr(s) {
  const n = (s.crew?.abilities || []).reduce((a, v) => a + (v || 0), 0);
  return n * (AI_Q_ORDER[s.crewQuality || 'average'] || 3);
}
function aiDecideMode(ship, target) {
  if (!target) return 'gun';
  const gunRatio = (aiGunStr(ship) + 0.5) / (aiGunStr(target) + 0.5);
  const meleeRatio = (aiMeleeStr(ship) + 0.5) / (aiMeleeStr(target) + 0.5);
  return meleeRatio > gunRatio ? 'melee' : 'gun';
}
function aiTargetOf(ship, state) {
  if (ship.aiTargetName) {
    const t = [...state.jpFleet, ...state.usFleet].find(x => x.name === ship.aiTargetName && x.side !== ship.side && x.status === 'ok' && x.col >= 0);
    if (t) return t;
  }
  return aiSelectTarget(ship, state);
}
function aiUpdateMode(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const target = aiSelectTarget(ship, state);
  ship.aiTargetName = target ? target.name : null;
  const mode = aiDecideMode(ship, target);
  if (ship.aiMode !== mode && typeof addLog === 'function') addLog(`${ship.name}: 戦い方 → ${mode === 'melee' ? '白兵戦（近づいて鉤縄）' : '砲撃（距離を取る）'}${target ? `（相手 ${target.name}）` : ''}`);
  ship.aiMode = mode;
}
function aiModeOf(ship) { return ship.aiMode || (ship.side === 'us' ? 'melee' : 'gun'); }

// 次に装填する弾（両舷）
function aiPlanAmmo(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const target = aiTargetOf(ship, state);
  if (!target) return;
  const d = hexDist(ship.col, ship.row, target.col, target.row);
  ship.plannedShot = ship.plannedShot || { L:'round', R:'round' };
  const a = aiAmmoDecide(ship, target, d);
  ship.plannedShot.L = a; ship.plannedShot.R = a;
}

// 風上の度合い: 目標から見て風上なら正、風下なら負（-1〜1）
function aiWeatherGauge(col, row, target, state) {
  const wind = state && state.wind;
  if (!wind || typeof hexNeighbor !== 'function' || typeof DIR_OPPOSITE === 'undefined') return 0;
  const walk = (dir) => {
    let c = target.col, r = target.row;
    for (let i = 0; i < 3; i++) {
      const n = hexNeighbor(c, r, dir);
      if (!n) break;
      c = n.col; r = n.row;
    }
    return { c, r };
  };
  const up = walk(DIR_OPPOSITE[wind.direction]);   // 風はこの向きへ吹いていく。反対が風上
  const down = walk(wind.direction);
  return (hexDist(col, row, down.c, down.r) - hexDist(col, row, up.c, up.r)) / 6;
}

function aiAmmoDecide(ship, target, dist) {
  const P = paramsFor(ship);
  if (P.ammoMode && P.ammoMode !== 'current') {
    const canChain = ship.nation !== 'GB' && dist <= 3;
    const crew = (target.crew?.abilities || []).reduce((a, v) => a + (v || 0), 0);
    const hullPct = target.hull ? target.hull.remain / target.hull.max : 1;
    const rigSec = target.rigging?.sections || [];
    const rigMax = target.rigging?.sectionsMax || [];
    const rigPct = rigSec.reduce((a, v) => a + (v || 0), 0) / Math.max(1, rigMax.reduce((a, v) => a + (v || 0), 0));
    if (P.ammoMode === 'round') return 'round';
    if (P.ammoMode === 'hull') return dist <= 1 ? 'double' : 'round';
    if (P.ammoMode === 'rig') return (canChain && rigPct > 0) ? 'chain' : (dist <= 1 ? 'double' : 'round');
    if (P.ammoMode === 'crew') return dist <= 1 ? 'grape' : 'round';
    if (P.ammoMode === 'mixed') {
      if (dist <= 1) return (crew >= P.ammoGrapeCrewMin && hullPct > 0.5) ? 'grape' : 'double';
      if (canChain && rigPct > 0.5 && hullPct > 0.5) return 'chain';
      return 'round';
    }
  }
  const qOrder = { elite:5, crack:4, average:3, green:2, poor:1 };
  const grappled = (ship.grappledWith && ship.grappledWith.includes(target.name))
                || (target.grappledWith && target.grappledWith.includes(ship.name));
  if (ship.aiMode) {
    const anyGrapple = grappled || (ship.grappledWith || []).length > 0;
    if (ship.aiMode === 'gun') return anyGrapple ? 'double' : 'round'; // 二重弾は射程1。離れられないときだけ
    // 白兵戦側: 隣はぶどう弾、3ヘクス以内は鎖弾（イギリスは撃てない）、ほかは球形弾で帆を狙う
    if (dist <= 1 || anyGrapple) return 'grape';
    const rs = target.rigging?.sections || [], rm = target.rigging?.sectionsMax || [];
    const rigPct = rs.reduce((t, v) => t + (v || 0), 0) / Math.max(1, rm.reduce((t, v) => t + (v || 0), 0));
    if (dist <= 3 && ship.nation !== 'GB' && rigPct >= P.rigSailTargetThreshold) return 'chain';
    return 'round';
  }
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
  const gaugeScore = P.weatherGauge ? P.weatherGauge * 300 * aiWeatherGauge(col, row, target, state) : 0;
  let score;
  if (ship && ship.aiMode === 'gun') {
    // 砲撃側: 2〜5ヘクスを保ち、舷側を向け、縦射を狙う。縦射される位置は避ける
    if (dist >= P.gunKeepMin && dist <= P.gunKeepMax) score = P.gunKeepBonus;
    else if (dist < P.gunKeepMin) score = P.gunAdjacentScore;
    else score = Math.max(0, P.gunKeepBonus - (dist - P.gunKeepMax) * P.gunFarDecayPerHex);
    if (typeof getArcToTarget === 'function') {
      const _arcSide = getArcToTarget({ col, row, dir }, target);
      if (_arcSide === 'port' || _arcSide === 'stbd') score += P.gunBroadsideBonus;
    }
    if (dist <= P.searchRadius && typeof isRaking === 'function') {
      const rakeMe = isRaking({ col, row, dir }, target);
      if (rakeMe === 'bow_rake' || rakeMe === 'stern_rake') score += P.gunRakeBonus;
      const _rakeBy = isRaking(target, { col, row, dir });
      if (_rakeBy !== 'bow_rake' && _rakeBy !== 'stern_rake') score += P.rakeAvoidBonus;
    }
    return aiJitter(score + gaugeScore, P.scoreEndRandomness);
  }
  if (ship && (ship.aiMode === 'melee' || (!ship.aiMode && ship.side === 'us'))) {
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
    return aiJitter(score + gaugeScore, P.scoreEndRandomness);
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
  return aiJitter(score + gaugeScore, P.scoreEndRandomness);
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
        const newStern = hexNeighbor(st.col, st.row, DIR_OPPOSITE[newDir]);
        if (newStern && (!inMap(newStern.col, newStern.row) || blocked.has(`${newStern.col},${newStern.row}`))) continue; // 艦尾が他の艦や地図の外に振れる旋回はしない
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
  const target = aiTargetOf(ship, state);
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
  if (ship.aiMode ? ship.aiMode === 'gun' : (ship.side === 'jp' && P.jpAvoidAdjacentEnemy)) {
    const enemies = (ship.side === 'jp' ? state.usFleet : state.jpFleet).filter(e => e.status === 'ok' && e.col >= 0);
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
  if (ship.aiMode) {
    const myCrewN = (ship.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
    const grappledNow = (ship.grappledWith || []).length > 0;
    if (ship.aiMode === 'melee') {
      ship.wantGrapple = !grappledNow; // 鉤縄フェイズは移動のあと。隣に並んだ相手には必ずかける
      ship.wantUngrapple = false;
      ship.obpAssigned = grappledNow ? Math.max(1, Math.floor(myCrewN / 2)) : 0;
      ship.dbpAssigned = grappledNow ? myCrewN - ship.obpAssigned : 0;
    } else {
      // 砲撃側: 接舷隊は出さない。半分を防御隊にして、残りで砲を撃つ
      ship.wantGrapple = false;
      ship.wantUngrapple = grappledNow;
      ship.obpAssigned = 0;
      ship.dbpAssigned = grappledNow ? Math.ceil(myCrewN / 2) : 0;
    }
    return;
  }
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
  const _noAnchor = typeof SCENARIOS !== 'undefined' && SCENARIOS[state.scenarioNo]?.noAnchor;
  if (_noAnchor || ship.aiMode === 'melee') { ship.anchored = false; return; }
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
    aiUpdateMode(s, state);
    aiAnchorDecide(s, state);
    if (!s.anchored) aiPlotMoves(s, state);
    aiSailDecide(s, state);
    aiBoardDecide(s, state);
    aiPlanAmmo(s, state);
  }
}
// AI対AI のときの jp 側（同じ決め方。錨はこれまでどおり使わない）
function aiRunJp(state) {
  for (const s of state.jpFleet) {
    aiUpdateMode(s, state);
    aiPlotMoves(s, state);
    aiSailDecide(s, state);
    aiBoardDecide(s, state);
    aiPlanAmmo(s, state);
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
  window.aiRunJp = aiRunJp;
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
