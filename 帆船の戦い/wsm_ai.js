// wsm_ai.js — 帆船ゲーム簡易AIロジック
// 前提: hub.html の hexDist, hexNeighbor, computeAttitude, resolveGunnery 等が読み込み済み

// --- ベアリング計算: col/row から最も近い方位を返す ---
function aiBearing(fromCol, fromRow, toCol, toRow) {
  // numpad 6方位のうち、最も合うものを返す
  const dirs = [8, 9, 3, 2, 1, 7];
  let best = null;
  for (const d of dirs) {
    const n = hexNeighbor(fromCol, fromRow, d);
    if (!n) continue;
    const dist = Math.hypot(n.col - toCol, n.row - toRow);
    if (!best || dist < best.dist) best = { dir: d, dist };
  }
  return best ? best.dir : fromRow;
}

// --- 移動プロット: 最近い敵に向けて ---
function aiPlotMoves(ship, state) {
  if (!ship || ship.status !== 'ok') return;
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok' && !e.sunk);
  if (enemies.length === 0) return;
  // 最近い敵
  let target = null;
  for (const e of enemies) {
    const d = hexDist(ship.col, ship.row, e.col, e.row);
    if (!target || d < target.d) target = { e, d };
  }
  if (!target) return;
  const bear = aiBearing(ship.col, ship.row, target.e.col, target.e.row);
  const moves = [];
  if (bear !== ship.dir) {
    // 回頭コスト1で転舵
    const order = [8, 9, 3, 2, 1, 7];
    const iNow = order.indexOf(ship.dir);
    const iBear = order.indexOf(bear);
    const delta = ((iBear - iNow + 6) % 6);
    const cw = delta <= 3;
    const steps = Math.min(ship.turningAbility || 2, cw ? delta : 6 - delta);
    for (let i = 0; i < steps; i++) moves.push(cw ? 'R' : 'L');
  }
  // 残り移動力で前進
  moves.push('1');
  ship.plottedMoves = moves;
  ship.plotDone = true;
}

// --- 射撃判断: 射程内の敵に砲撃 ---
function aiFireDecide(ship, state) {
  if (!ship || ship.status !== 'ok') return null;
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok' && !e.sunk);
  let best = null;
  for (const e of enemies) {
    const d = hexDist(ship.col, ship.row, e.col, e.row);
    if (d > 10) continue;
    // 舷の簡易判定: 近い敵の相対方位で port/stbd
    let arc = 'port';
    if (typeof determineArc === 'function') {
      arc = determineArc(ship, e);
      if (arc === 'none') continue;
    }
    const score = (10 - d) + (arc === 'bow' || arc === 'stern' ? 2 : 0);
    if (!best || score > best.score) best = { target: e, arc, score };
  }
  return best;
}

// --- 帆切替判断: 敵との距離に応じて ---
function aiSailDecide(ship, state) {
  if (!ship) return;
  const enemies = (ship.side === 'us' ? state.jpFleet : state.usFleet).filter(e => e.status === 'ok');
  let minDist = 99;
  for (const e of enemies) minDist = Math.min(minDist, hexDist(ship.col, ship.row, e.col, e.row));
  // 遠距離は全帆、近距離は戦闘帆
  if (minDist > 6 && ship.sailState !== 'full') ship.pendingSailMode = 'full';
  else if (minDist <= 4 && ship.sailState !== 'battle') ship.pendingSailMode = 'battle';
}

// --- 全AIターン: us側全艦を自動処理 ---
function aiRunAll(state) {
  for (const s of state.usFleet) {
    aiPlotMoves(s, state);
    aiSailDecide(s, state);
  }
}

if (typeof window !== 'undefined') {
  window.aiPlotMoves = aiPlotMoves;
  window.aiFireDecide = aiFireDecide;
  window.aiSailDecide = aiSailDecide;
  window.aiRunAll = aiRunAll;
  window.aiBearing = aiBearing;
}
