// Movement orders and review are shared by the two movement phases.
let pgAIReview = null;
let pgOrderRun = null;
let pgOrderDraft = null;
let pgOrderHex = null;
let pgManualOrderPhase = null;

function pgRenderManualMovement(side) {
  const phase = `${G.turn}:${G.phase}`;
  if (pgManualOrderPhase === phase || G.gameMode === 'aivai') {
    renderMoveFirePhase();
    return;
  }
  pgManualOrderPhase = phase;
  pgMovementOrders(side, renderMoveFirePhase);
}

function pgOnMap(unit) {
  return unit && !['eliminated', 'resupply'].includes(unit.status) &&
    unit.col >= 0 && unit.col < MAP_CONFIG.cols && unit.row >= 0 && unit.row < MAP_CONFIG.rows &&
    (!unit.reinforcement || unit.reinforcement.deployed);
}

function pgCanReceiveOrder(unit) {
  return pgOnMap(unit) && unit.move > 0 && !STACK_EXEMPT_TYPES.includes(unit.type);
}

function pgEnemyAt(side, hex) {
  return testUnits.some(unit => pgOnMap(unit) && unit.side !== side &&
    unit.type !== 'dummy' && unit.hexId === hex);
}

function pgReconcileOrders() {
  for (const unit of testUnits) {
    const order = unit.pgMovementOrder;
    if (!order) continue;
    if (!pgOnMap(unit) || pgEnemyAt(unit.side, order.target)) {
      delete unit.pgMovementOrder;
      addLog('move', `${unit.name}：死守・移動予約を解除（${order.target}）`);
    } else if (order.type === 'reserve' && unit.hexId === order.target) {
      delete unit.pgMovementOrder;
      addLog('move', `${unit.name}：移動予約完了（${order.target}）`);
    }
  }
}

function pgCanEnter(unitsToMove, hex) {
  if (pgEnemyAt(unitsToMove[0].side, hex)) return false;
  const ids = new Set(unitsToMove.map(unit => unit.id));
  const count = testUnits.filter(unit => unit.hexId === hex && pgOnMap(unit) &&
    !STACK_EXEMPT_TYPES.includes(unit.type) && !ids.has(unit.id)).length;
  return count + unitsToMove.filter(unit => !STACK_EXEMPT_TYPES.includes(unit.type)).length <= STACK_LIMIT &&
    unitsToMove.every(unit => canStackWithOrg(unit, hex));
}

function pgMovementOrders(side, done) {
  const candidates = testUnits.filter(unit => unit.side === side && unit.pgMovementOrder);
  pgReconcileOrders();
  if (!candidates.length) { done(); return; }
  pgOrderRun = {candidates, done};
  pgContinueOrders();
}

function pgContinueOrders() {
  if (!pgOrderRun) return;
  pgReconcileOrders();
  for (let unit; (unit = pgOrderRun.candidates.shift());) {
    const order = unit.pgMovementOrder;
    if (!order || !pgCanReceiveOrder(unit) || unit.hexId === order.target ||
        unit.status === 'dd' || unit.moveComplete || unit.firedThisTurn || unit._counterFired) continue;

    const target = fromHexId(order.target);
    const formation = unit.marchMode ? 'march' : 'combat';
    const group = pgMoveGroup(unit);
    const options = calculateMovableHexes(unit, formation, false, group);
    let destination = options[`${target.col},${target.row}`] ? target : null;
    if (!destination) {
      const route = bfsShortestPath(unit, unit.col, unit.row, target.col, target.row,
        formation, group, true).path;
      destination = route.findLast(pos => options[`${pos.col},${pos.row}`]);
    }
    if (!destination) continue;
    startMove(unit, true);
    if (moveState.movingUnit !== unit) continue;
    unit.pgOrderedMoveTurn = G.turn;
    moveToHex(destination.col, destination.row);
    if (!moveState.stopFirePending) confirmMove();
    return;
  }
  const {done} = pgOrderRun;
  pgOrderRun = null;
  done();
}

function pgMoveGroup(unit) {
  return [unit, ...testUnits.filter(other => other !== unit && pgOnMap(other) &&
    other.hexId === unit.hexId && other.side === unit.side && other.type === 'leader')];
}

function pgStartAIReview(side, run) {
  if (pgAIReview) return;
  const review = {side, stage: 'orders', origins: new Map(), returned: new Set(), combat: new Set()};
  pgAIReview = review;
  resetDirectFireState();
  directFireState.activeSide = side;
  directFireState.defenderSide = side === 'allied' ? 'german' : 'allied';
  const showReview = () => new Promise(resolve => {
    review.stage = 'review';
    review.shown = true;
    for (const [unit, origin] of review.origins) {
      if (pgOnMap(unit) && unit.hexId !== origin.hexId) unit.moveComplete = true;
    }
    review.finish = resolve;
    pgOrderHex = null;
    window._aiMoveTrails = [];
    renderMoveFirePhase();
    drawMap();
  });
  pgMovementOrders(side, async () => {
    review.stage = 'ai';
    document.getElementById('phaseContent').textContent = 'AIが移動を処理しています。';
    for (const unit of testUnits) {
      if (unit.side === side && pgOnMap(unit) && unit.move > 0) {
        const {col, row, x, y, hexId, status, moveComplete, marchMode, cautious} = unit;
        review.origins.set(unit, {col, row, x, y, hexId, status, moveComplete, marchMode, cautious});
      }
    }
    try {
      await run(showReview);
    } catch (error) {
      addLog('ai', `AI移動を中断：${error.message}`);
      if (!review.shown) await showReview();
    }
    pgAIReview = null;
    nextPhase();
  });
}

function pgNoteAICombat(shooters, target) {
  if (pgAIReview?.stage !== 'ai') return;
  for (const unit of [...shooters, target]) pgAIReview.combat.add(unit);
}

function pgReviewOrigin(unit) {
  const review = pgAIReview;
  if (review?.stage !== 'review' || !pgOnMap(unit)) return null;
  const origin = review.origins.get(unit);
  return origin && origin.hexId !== unit.hexId && !review.returned.has(unit) ? origin : null;
}

function pgCanReturn(unit, origin) {
  return pgCanReceiveOrder(unit) && origin && unit.status === origin.status && unit.status !== 'dd' &&
    !unit.firedThisTurn && !unit._counterFired && !pgAIReview.combat.has(unit) &&
    pgCanEnter([unit], origin.hexId);
}

function pgReturnAIUnit(unit) {
  const origin = pgReviewOrigin(unit);
  if (!pgCanReturn(unit, origin)) return;
  const from = unit.hexId;
  Object.assign(unit, origin);
  directFireState.movedUnits.delete(unit.id || unit.name);
  pgAIReview.returned.add(unit);
  cleanupOrphanDummies(from, unit.side);
  pgOrderHex = unit.hexId;
  addLog('move', `${unit.name}：AI移動を取り消し、${unit.hexId} に戻しました。`);
  renderMoveFirePhase();
  drawMap();
}

function pgFinishAIReview() {
  if (pgAIReview?.stage !== 'review' || moveState.movingUnit || pgOrderDraft) return;
  pgAIReview.stage = 'ai';
  pgReconcileOrders();
  document.getElementById('phaseContent').textContent = 'フェイズの残りを処理しています。';
  pgAIReview.finish();
}

function pgSelectOrderHex(col, row) {
  if (!pgOrderDraft) return false;
  const hex = toHexId(col, row);
  const terrain = TERRAIN_MODIFIERS[getHexTerrain(hex)];
  const {unit, type} = pgOrderDraft;
  if (!terrain || terrain.move === -1 || pgEnemyAt(unit.side, hex) ||
      (type === 'reserve' && unit.hexId === hex)) {
    addLog('move', 'このヘクスは命令の目的地に指定できません。');
    return true;
  }
  pgOrderDraft.target = hex;
  renderMoveFirePhase();
  drawMap();
  return true;
}

function pgMovementPanel() {
  const section = document.createElement('section');
  section.className = 'phase-info';
  const review = pgAIReview?.stage === 'review' ? pgAIReview : null;
  const text = (parent, content) => {
    const line = document.createElement('div');
    line.textContent = content;
    parent.append(line);
  };
  const button = (parent, label, action, disabled = false) => {
    const node = document.createElement('button');
    node.className = 'btn-sm';
    node.type = 'button';
    node.textContent = label;
    node.disabled = disabled;
    node.addEventListener('click', action);
    parent.append(node);
  };
  const redraw = () => { renderMoveFirePhase(); drawMap(); };
  if (review) {
    text(section, 'AI移動の確認。戻した駒は移動し直すか、予約・死守を設定できます。');
    button(section, '確認を終えて進む', pgFinishAIReview, Boolean(pgOrderDraft));
  }
  if (pgOrderDraft) {
    const {unit, type, target} = pgOrderDraft;
    text(section, `${unit.name} · ${type === 'hold' ? '死守命令' : '移動予約'} · ${target ?? '地図で目的地を選択'}`);
    button(section, '命令を確定', () => {
      unit.pgMovementOrder = {type, target};
      pgOrderDraft = null;
      addLog('move', `${unit.name}：${target} に${type === 'hold' ? '死守命令' : '移動予約'}を設定。`);
      if (unit.side === directFireState.activeSide) pgMovementOrders(unit.side, redraw);
      else redraw();
    }, !target);
    button(section, '選択を取り消す', () => { pgOrderDraft = null; redraw(); });
    return section;
  }

  const selectedHex = pgOrderHex || directFireState.atkHexId;
  const units = testUnits.filter(unit => pgCanReceiveOrder(unit) &&
    (review ? unit.side === review.side && (pgReviewOrigin(unit) || unit.hexId === selectedHex) :
      unit.side === directFireState.activeSide && unit.hexId === selectedHex))
    .sort((a, b) => Number(b.hexId === selectedHex) - Number(a.hexId === selectedHex));
  if (review && !units.length) text(section, '修正する駒を地図で選べます。');
  for (const unit of units) {
    const row = document.createElement('div');
    const origin = pgReviewOrigin(unit);
    const order = unit.pgMovementOrder;
    const status = order ? (order.type === 'hold' ? '死守先 ' : '予約先 ') + order.target : '';
    const holding = order?.type === 'hold' && order.target === unit.hexId;
    text(row, [unit.name, origin ? `${origin.hexId} → ${unit.hexId}` : unit.hexId, holding ? '死守中' : status].filter(Boolean).join(' · '));
    if (origin) {
      const allowed = pgCanReturn(unit, origin);
      button(row, '移動前のヘクスに戻す', () => pgReturnAIUnit(unit), !allowed);
      if (!allowed) text(row, '戦闘済み、または元のヘクスに配置できません。');
    }
    if (review?.returned.has(unit) && !order && !unit.moveComplete)
      button(row, '移動し直す', () => startMove(unit));
    for (const [type, label] of [['reserve', '移動予約'], ['hold', '死守命令']]) {
      button(row, label, () => { pgOrderDraft = {unit, type, target: null}; redraw(); });
    }
    if (order) button(row, '命令を解除', () => { delete unit.pgMovementOrder; redraw(); });
    section.append(row);
  }
  return section;
}

function pgDrawMovementOrders(ctx) {
  const draft = pgOrderDraft;
  for (const unit of testUnits) {
    if (!pgOnMap(unit) || (G.gameMode === 'online' && unit.side !== G.playerSide)) continue;
    const target = draft?.unit === unit && draft.target ? draft.target : unit.pgMovementOrder?.target;
    if (!target) continue;
    const destination = fromHexId(target);
    const end = getHexCenter(destination.col, destination.row);
    const angle = Math.atan2(end.y - unit.y, end.x - unit.x);
    ctx.save();
    ctx.strokeStyle = '#943ed1';
    ctx.lineWidth = 3;
    if (unit.hexId === target) {
      ctx.beginPath();
      ctx.arc(end.x, end.y, 18, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(end.x - 11 * Math.cos(angle - .45), end.y - 11 * Math.sin(angle - .45));
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(end.x - 11 * Math.cos(angle + .45), end.y - 11 * Math.sin(angle + .45));
      ctx.stroke();
    }
    ctx.restore();
  }
}
