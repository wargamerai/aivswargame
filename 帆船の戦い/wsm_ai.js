// wsm_ai.js — 帆船ゲームAI（2ターン先読み + 風制約考慮）
// 前提: hub.html の hexDist, hexNeighbor, getArcToTarget, maxMoveForAttitude 等が読み込み済み

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

// 目標選択: 風制約下で到達可能かつ、最も早く撃破できる敵を選ぶ
// 候補スコア: -距離*2 - 敵の残体力（弱い敵優先） + 風制約ペナルティ
function aiSelectTarget(ship, state) {
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet)
    .filter(e => e.status === 'ok' && !e.sunk && e.col >= 0);
  if (enemies.length === 0) return null;
  const wind = state.wind;

  let best = null;
  for (const e of enemies) {
    const d = hexDist(ship.col, ship.row, e.col, e.row);
    // 風による到達性: 敵への方位が逆風(d=3)なら困難
    const bear = aiBearing(ship.col, ship.row, e.col, e.row);
    const mpToBear = (typeof maxMoveForAttitude === 'function')
      ? maxMoveForAttitude({ ...ship, dir: bear }, wind) : 4;
    // 弱さ: 船体残率 + クルー残率
    const hullPct = e.hull ? (e.hull.remain / e.hull.max) : 1;
    const crewRem = (e.crew?.L?.remain||0) + (e.crew?.R?.remain||0);
    const crewMax = (e.crew?.L?.max||1) + (e.crew?.R?.max||1);
    const crewPct = crewMax > 0 ? crewRem / crewMax : 1;
    const weakness = 2 - hullPct - crewPct;  // 0〜2、大きいほど弱い
    // スコア: 距離近 + 弱い + 到達性あり
    let score = -d * 2 + weakness * 30;
    if (mpToBear <= 0) score -= 50;  // 完全逆風の敵は候補から外す
    if (!best || score > best.score) best = { e, d, score };
  }
  return best ? best.e : null;
}

// 弾種選択: 距離・目標状態により最適弾を選ぶ
// 距離1: 大乗員目標→grape、船体薄→double、その他round
// 距離2-5: round (or chain if rigging狙い)
// 距離6+: chain（ルール11.2.5 で帆強制）
function aiAmmoDecide(ship, target, dist) {
  if (dist > 10) return 'round';
  if (dist >= 6) return 'chain';  // 帆狙い強制
  if (dist <= 1) {
    const crewRem = (target.crew?.L?.remain||0) + (target.crew?.R?.remain||0);
    const hullPct = target.hull ? target.hull.remain / target.hull.max : 1;
    if (crewRem >= 8) return 'grape';  // 多数乗員にはグレープ
    if (hullPct < 0.5) return 'double';  // 船体薄いならダブルで仕留め
    return 'round';
  }
  return 'round';
}

// 位置評価: 距離 + 射界 + 被縦射回避
function scoreEnd(col, row, dir, target) {
  const dist = hexDist(col, row, target.col, target.row);
  let score = -dist * 100;
  if (dist <= 1) score += 500;
  if (dist <= 5 && typeof getArcToTarget === 'function') {
    const arc = getArcToTarget({ col, row, dir }, target);
    if (arc === 'port' || arc === 'stbd') score += 80;
    else if (arc === 'bow') score += 20;
    else if (arc === 'stern') score -= 40;
    else score -= 60;
    const eArc = getArcToTarget(target, { col, row, dir });
    if (eArc === 'bow' || eArc === 'stern') score -= 40;
  }
  return score;
}

// 1ターン分のプロット列挙（DFS）
// 戻り値: [{ moves, col, row, dir, score }]
function enumeratePlots(ship, state, target) {
  const wind = state.wind;
  const order = [8, 9, 3, 2, 1, 7];
  const initialMp = (typeof maxMoveForAttitude === 'function') ? maxMoveForAttitude(ship, wind) : 4;
  const mpFor = (d) => (typeof maxMoveForAttitude === 'function')
    ? maxMoveForAttitude({ ...ship, dir: d }, wind) : 4;

  const leaves = [];
  function dfs(col, row, dir, remaining, turnedThisHex, moves, depth) {
    if (depth > 15) return;
    // 葉: もう動けない、または停止候補
    if (remaining <= 0) {
      leaves.push({ moves: moves.slice(), col, row, dir });
      return;
    }
    let branched = false;
    // 前進
    const fwdMp = mpFor(dir);
    const fwd = hexNeighbor(col, row, dir);
    if (fwd && fwdMp > 0) {
      moves.push('5');
      dfs(fwd.col, fwd.row, dir, remaining - 1, false, moves, depth + 1);
      moves.pop();
      branched = true;
    }
    // 転舵
    if (!turnedThisHex) {
      const iNow = order.indexOf(dir);
      for (const delta of [1, 5]) {
        const newDir = order[(iNow + delta) % 6];
        const newMp = mpFor(newDir);
        if (newMp <= 0) continue;
        const newRemaining = Math.min(remaining - 1, newMp);
        if (newRemaining < 0) continue;
        moves.push(String(newDir));
        dfs(col, row, newDir, newRemaining, true, moves, depth + 1);
        moves.pop();
        branched = true;
      }
    }
    if (!branched) leaves.push({ moves: moves.slice(), col, row, dir });
  }
  dfs(ship.col, ship.row, ship.dir, initialMp, false, [], 0);
  return leaves;
}

// 2ターン先読み: 今ターン各葉から、次ターンの推定最良位置までシミュレート
function aiPlotMoves(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const target = aiSelectTarget(ship, state);
  if (!target) { ship.plottedMoves = []; ship.plotDone = true; return; }

  const wind = state.wind;
  const leaves = enumeratePlots(ship, state, target);
  if (leaves.length === 0) { ship.plottedMoves = []; ship.plotDone = true; return; }

  // 葉数が多すぎる場合、最良上位のみ2ターン展開（性能配慮）
  leaves.forEach(l => { l.score1 = scoreEnd(l.col, l.row, l.dir, target); });
  leaves.sort((a, b) => b.score1 - a.score1);
  const top = leaves.slice(0, 20);

  // 次ターン想定: 各葉位置・方位から、次ターンのプロットを簡易貪欲で生成
  // 敵は動かないと仮定（悲観評価）。実際は動くが、ここでは単純化
  let best = null;
  for (const leaf of top) {
    const mockShip = {
      ...ship,
      col: leaf.col, row: leaf.row, dir: leaf.dir,
      sailState: ship.sailState, sailBroken: ship.sailBroken,
    };
    // 次ターンの葉（1ターン分のみ探索）
    const next = enumeratePlots(mockShip, state, target);
    let bestNext = scoreEnd(leaf.col, leaf.row, leaf.dir, target);
    for (const n of next) {
      const s = scoreEnd(n.col, n.row, n.dir, target);
      if (s > bestNext) bestNext = s;
    }
    const total = leaf.score1 * 0.4 + bestNext * 0.6;  // 次ターンを重視
    if (!best || total > best.score) best = { moves: leaf.moves, score: total };
  }

  ship.plottedMoves = best ? best.moves : [];
  ship.plotDone = true;
}

// 射撃判断
function aiFireDecide(ship, state) {
  if (!ship || ship.status !== 'ok') return null;
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok' && !e.sunk);
  let best = null;
  for (const e of enemies) {
    const d = hexDist(ship.col, ship.row, e.col, e.row);
    if (d > 10) continue;
    let arc = 'none';
    if (typeof getArcToTarget === 'function') arc = getArcToTarget(ship, e);
    if (arc === 'none' || arc === 'stern') continue;
    const ammo = aiAmmoDecide(ship, e, d);
    const score = (10 - d) * 10 + (arc === 'port' || arc === 'stbd' ? 50 : 0);
    if (!best || score > best.score) best = { target: e, arc, ammo, score };
  }
  return best;
}

// 乗込判断
function aiBoardDecide(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok');
  const qOrder = { elite:5, crack:4, average:3, green:2, poor:1 };
  for (const e of enemies) {
    const d = hexDist(ship.col, ship.row, e.col, e.row);
    if (d > 1) continue;
    const myQ = qOrder[ship.crewQuality||'average'];
    const enQ = qOrder[e.crewQuality||'average'];
    const myCrew = (ship.crew?.L?.remain||0) + (ship.crew?.R?.remain||0);
    const enCrew = (e.crew?.L?.remain||0) + (e.crew?.R?.remain||0);
    if (myQ >= enQ && myCrew >= enCrew) {
      ship.obpAssigned = Math.max(1, Math.floor(myCrew / 2));
      ship.dbpAssigned = myCrew - ship.obpAssigned;
    } else {
      ship.dbpAssigned = myCrew;
      ship.obpAssigned = 0;
    }
    return;
  }
}

// 投錨判断: 射程内・好位置・遠距離目標で精度狙いが有利な場合
function aiAnchorDecide(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const target = aiSelectTarget(ship, state);

  // 投錨中は毎ターン抜錨条件をチェック
  if (ship.anchored) {
    if (!target) { ship.anchored = false; return; }
    const d = hexDist(ship.col, ship.row, target.col, target.row);
    // 距離が近すぎ/遠すぎ/射界失った→抜錨
    if (d < 3 || d > 8) { ship.anchored = false; return; }
    if (typeof getArcToTarget === 'function') {
      const arc = getArcToTarget(ship, target);
      if (arc !== 'port' && arc !== 'stbd') { ship.anchored = false; return; }
    }
    return;  // 投錨継続
  }

  if (!target) return;
  const d = hexDist(ship.col, ship.row, target.col, target.row);
  if (d < 3 || d > 8) return;  // 遠すぎ/近すぎは機動優先
  if (typeof getArcToTarget !== 'function') return;
  const arc = getArcToTarget(ship, target);
  // 舷側射界に目標が入っている & 前進では位置悪化するなら投錨
  if (arc !== 'port' && arc !== 'stbd') return;
  // 前進後の射界が悪化するか確認
  const fwd = hexNeighbor(ship.col, ship.row, ship.dir);
  if (fwd) {
    const fwdArc = getArcToTarget({ col: fwd.col, row: fwd.row, dir: ship.dir }, target);
    if (fwdArc === 'port' || fwdArc === 'stbd') return;  // 前進しても舷側維持、機動する
  }
  ship.anchored = true;
  ship.plottedMoves = [];
}

// 帆切替: 投錨時は畳、接近中は状況で切替
function aiSailDecide(ship, state) {
  if (!ship) return;
  if (ship.anchored) { ship.pendingSailMode = 'furled'; return; }
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok');
  let minDist = 99;
  for (const e of enemies) minDist = Math.min(minDist, hexDist(ship.col, ship.row, e.col, e.row));
  if (minDist > 6 && ship.sailState !== 'full') ship.pendingSailMode = 'full';
  else if (minDist <= 4 && ship.sailState !== 'battle') ship.pendingSailMode = 'battle';
}

function aiRunAll(state) {
  for (const s of state.usFleet) {
    aiAnchorDecide(s, state);  // 先に投錨判定
    if (!s.anchored) aiPlotMoves(s, state);
    aiSailDecide(s, state);
    aiBoardDecide(s, state);
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
}
