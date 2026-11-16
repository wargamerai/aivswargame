// Movement orders and review are shared by the two movement phases.
let pgAIReview = null;
let pgOrderRun = null;
let pgOrderDraft = null;
let pgOrderHex = null;
let pgOrderUnit = null;
const pgManualMoves = new Map();
const pgManualMoveHistory = [];
let pgAIMovePreview = null;
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
    pgAIMovePreview = null;
    review.shown = true;
    for (const [unit, origin] of review.origins) {
      if (pgOnMap(unit) && unit.hexId !== origin.hexId) unit.moveComplete = true;
    }
    review.finish = resolve;
    pgOrderHex = null;
    pgOrderUnit = null;
    window._aiMoveTrails = [];
    renderMoveFirePhase();
    drawMap();
  });
  pgMovementOrders(side, async () => {
    review.stage = 'ai';
    document.getElementById('phaseContent').textContent = 'AIが移動中…';
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

function pgNoteMovementCombat(shooters, target) {
  for (const unit of [...shooters, target]) {
    if (pgAIReview?.stage === 'ai') pgAIReview.combat.add(unit);
    const record = pgManualMoves.get(unit);
    if (record) record.blocked = true;
  }
}

function pgStartManualMoveRecord(ms) {
  if (G.gameMode === 'aivai' || pgAIReview?.stage === 'ai' || pgOrderRun) return;
  const moving = ms._stackMoving || [ms.movingUnit];
  ms.pgMoveRecord = {
    origins: new Map(moving.filter(pgOnMap).map(unit => {
      const {col, row, x, y, hexId, moveComplete, status} = unit;
      return [unit, {
        col, row, x, y, hexId, moveComplete, status,
        marchMode: unit.marchMode, move: unit.move, closeAtk: unit.closeAtk, closeDef: unit.closeDef,
        _towed: unit._towed, _origMove: unit._origMove, _origCloseAtk: unit._origCloseAtk, _origCloseDef: unit._origCloseDef,
        wasMoved: directFireState.movedUnits.has(unit.id || unit.name),
      }];
    })),
    dummies: testUnits.filter(unit => unit.type === 'dummy' && pgOnMap(unit)),
    orphaned: new Set(),
    blocked: false,
  };
}

function pgRecordConfirmedMove(ms) {
  const record = ms.pgMoveRecord;
  if (!record) return;
  const group = {trail: ms.path, records: new Map()};
  const revealed = record.dummies.some(dummy => dummy.status === 'eliminated' && !record.orphaned.has(dummy));
  for (const [unit, origin] of record.origins) {
    if (unit.hexId === origin.hexId && unit.moveComplete === origin.moveComplete && unit.status === origin.status) continue;
    const entry = {
      origin, destination: unit.hexId, group,
      blocked: record.blocked || revealed,
      dummies: record.dummies.filter(d => record.orphaned.has(d) && d.hexId === origin.hexId && d.side === unit.side),
    };
    group.records.set(unit, entry);
    pgManualMoves.set(unit, entry);
  }
  if (group.records.size) pgManualMoveHistory.push(group);
}

function pgReturnRecord(unit) {
  if (!pgOnMap(unit)) return null;
  if (pgAIReview?.stage === 'review') {
    const origin = pgAIReview.origins.get(unit);
    if (!origin || origin.hexId === unit.hexId || pgAIReview.returned.has(unit)) return null;
    return {origin, blocked: pgAIReview.combat.has(unit)};
  }
  const record = pgManualMoves.get(unit);
  return unit.moveComplete && record?.destination === unit.hexId ? record : null;
}

function pgCanReturn(unit, record, returning = [unit]) {
  const uid = unit.id || unit.name;
  return record && !record.blocked && !moveState.movingUnit && !pgOrderDraft && unit.status === record.origin.status &&
    unit.status !== 'dd' && !unit.firedThisTurn && !unit._counterFired &&
    !directFireState.firedUnits.has(uid) && !directFireState.counterFiredUnits.has(uid) &&
    (unit.hexId === record.origin.hexId || pgCanEnter(returning, record.origin.hexId));
}

function pgReturnEntries(units) {
  if (!units.length) return null;
  const entries = units.map(unit => ({unit, record: pgReturnRecord(unit)}));
  const byOrigin = new Map();
  for (const {unit, record} of entries) {
    if (!record || unit.side !== directFireState.activeSide) return null;
    const hex = record.origin.hexId;
    if (!byOrigin.has(hex)) byOrigin.set(hex, []);
    byOrigin.get(hex).push(unit);
  }
  return entries.every(({unit, record}) => pgCanReturn(unit, record, byOrigin.get(record.origin.hexId))) ? entries : null;
}

function pgReturnMovement(entries) {
  if (!entries) return;
  const departures = new Map();
  const recoverDummies = new Set();
  for (const {unit, record} of entries) {
    const {origin, group, dummies} = record;
    const uid = unit.id || unit.name;
    if (unit.hexId !== origin.hexId) {
      departures.set(unit.hexId, unit.side);
      if (dummies?.length && !testUnits.some(other => pgOnMap(other) && other.hexId === origin.hexId)) {
        dummies.forEach(dummy => recoverDummies.add(dummy));
      }
    }
    const {wasMoved, ...restoredUnit} = origin;
    Object.assign(unit, restoredUnit);
    if (wasMoved) directFireState.movedUnits.add(uid);
    else directFireState.movedUnits.delete(uid);
    pgManualMoves.delete(unit);
    if (group) {
      group.records.delete(unit);
      if (!group.records.size) _completedMoveTrails = _completedMoveTrails.filter(trail => trail !== group.trail);
      const earlier = pgManualMoveHistory.findLast(move => move.records.has(unit))?.records.get(unit);
      if (earlier) pgManualMoves.set(unit, earlier);
    }
    if (pgAIReview?.stage === 'review') pgAIReview.returned.add(unit);
    addLog('move', `${unit.name}：移動を取り消し、${unit.hexId} に戻しました。`);
  }
  recoverDummies.forEach(dummy => { dummy.status = 'ok'; });
  for (const [hex, side] of departures) cleanupOrphanDummies(hex, side);
  const unit = entries.find(entry => pgCanReceiveOrder(entry.unit))?.unit || entries[0].unit;
  pgOrderUnit = unit;
  pgOrderHex = unit.hexId;
  if (pgAIReview?.stage !== 'review') {
    directFireState.atkHexId = unit.hexId;
    directFireState.atkAdjacentHexes = [unit.hexId];
    checkState.atk.clear();
    for (const entry of entries) {
      const moved = entry.unit;
      if (pgCanReceiveOrder(moved) && moved.status === 'ok' && moved.hexId === unit.hexId) checkState.atk.add(moved.id || moved.name);
    }
    updateFireRange();
  }
  renderMoveFirePhase();
  drawMap();
}

function pgUndoLastManualMove() {
  if (pgAIReview) return;
  const last = pgManualMoveHistory.findLast(group => group.records.size);
  pgReturnMovement(pgReturnEntries(last ? [...last.records.keys()] : []));
}

function pgReviewAIReactions(movingSide) {
  return pgAIReview?.stage === 'ai' && G.gameMode === 'pvai' && movingSide !== G.playerSide;
}

function pgAskReaction(title, detail, groups, accept, decline, revise = null) {
  return new Promise(resolve => {
    const panel = document.createElement('section');
    panel.className = 'pg-stop-choice';
    const state = document.createElement('strong');
    state.textContent = 'AIの移動を一時停止';
    const prompt = document.createElement('div');
    prompt.textContent = `${title} · ${detail}`;
    panel.append(state, prompt);
    const choices = groups.map(shooters => {
      const label = document.createElement('label');
      label.className = 'pg-stop-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      const units = document.createElement('span');
      units.className = 'pg-reaction-units';
      units.append(shooters[0].hexId, ...shooters.map(pgUnitLabel));
      label.append(input, units);
      panel.append(label);
      return {input, shooters};
    });
    const controls = document.createElement('div');
    controls.className = 'phase-btn-row';
    const add = (name, cssClass, value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = cssClass;
      button.textContent = name;
      button.onclick = () => {
        document.getElementById('phaseContent').textContent = 'AIが移動中…';
        resolve(value());
      };
      controls.append(button);
      return button;
    };
    const shoot = add(accept, 'dice-btn', () => choices.filter(choice => choice.input.checked).map(choice => choice.shooters));
    add(decline, 'btn-sm', () => []);
    if (revise) add('移動を修正', 'btn-sm', () => revise);
    panel.onchange = () => { shoot.disabled = !choices.some(choice => choice.input.checked); };
    panel.append(controls);
    document.getElementById('phaseContent').replaceChildren(panel);
    drawMap();
  });
}

function pgChooseAIMoveCorrection(moving, proposed, mp, formation) {
  const lead = moving[0];
  const choices = new Map();
  for (const pos of getHexNeighbors(lead.col, lead.row)) {
    if (pos.col < 0 || pos.row < 0 || pos.col >= MAP_CONFIG.cols || pos.row >= MAP_CONFIG.rows) continue;
    if (!pgCanEnter(moving, toHexId(pos.col, pos.row))) continue;
    const cost = getMoveCost(lead, lead.col, lead.row, pos.col, pos.row, formation).cost;
    if (Number.isFinite(cost) && cost <= mp) choices.set(`${pos.col},${pos.row}`, pos);
  }
  return new Promise(resolve => {
    const panel = document.createElement('section');
    panel.className = 'pg-stop-choice';
    const text = document.createElement('div');
    text.textContent = 'AIの移動を一時停止 · 青枠のヘクスを選ぶか、現在地で止めます。';
    panel.append(text);
    const choose = pos => {
      pgAIMovePreview = null;
      document.getElementById('phaseContent').textContent = 'AIが移動中…';
      resolve(pos);
    };
    for (const [label, pos] of [['現在地で止める', null], ['修正を取りやめる', undefined]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-sm';
      button.textContent = label;
      button.onclick = () => choose(pos);
      panel.append(button);
    }
    pgAIMovePreview = {destination: proposed, choices, choose};
    document.getElementById('phaseContent').replaceChildren(panel);
    drawMap();
  });
}

function pgStopFirePower(shooter, target) {
  return ['T', 'AC'].includes(target.type) ? shooter.fpAT : shooter.fpSoft;
}

async function pgReviewAIMoveStep(moving, proposed, mp, formation) {
  const units = moving.filter(pgOnMap);
  if (!units.length || !pgCanEnter(units, toHexId(proposed.col, proposed.row))) {
    return {destination: proposed, fire: [], changed: false};
  }
  const targets = units.filter(unit => !STACK_EXEMPT_TYPES.includes(unit.type));
  const revise = Symbol('revise');
  let destination = proposed;
  while (destination) {
    const changed = destination.col !== proposed.col || destination.row !== proposed.row;
    const stacks = new Map();
    for (const unit of checkStopFireAt(destination.col, destination.row, units[0].side)) {
      if (unit.side !== G.playerSide || unit.reconDone || !targets.some(target => pgStopFirePower(unit, target) > 0)) continue;
      if (!stacks.has(unit.hexId)) stacks.set(unit.hexId, []);
      stacks.get(unit.hexId).push(unit);
    }
    if (!stacks.size) return {destination, fire: [], changed};
    pgAIMovePreview = {destination};
    const hex = toHexId(destination.col, destination.row);
    const fire = await pgAskReaction('ストップ射撃', `AIの移動予定先 ${hex}`, [...stacks.values()],
      '射撃する', '射撃せず移動続行', revise);
    pgAIMovePreview = null;
    if (fire !== revise) return {destination, fire, changed};
    const replacement = await pgChooseAIMoveCorrection(units, destination, mp, formation);
    if (replacement !== undefined) destination = replacement;
  }
  return {destination: null, fire: [], changed: true};
}

function pgPickAIMoveCorrection(col, row) {
  const preview = pgAIMovePreview;
  if (!preview?.choices) return false;
  const pos = preview.choices.get(`${col},${row}`);
  if (pos) preview.choose(pos);
  return true;
}

async function pgResolveAIStopFire(moving, fire) {
  if (!fire.length) return false;
  const targets = () => moving.filter(unit => pgOnMap(unit) && !STACK_EXEMPT_TYPES.includes(unit.type));

  const rows = [];
  const fired = new Set();
  const recordShot = (label, shooters, target, counter = false) => {
    const result = executeDirectFire(shooters, target, counter);
    if (result.error) return;
    const effect = result.newStatus === 'eliminated' ? 'elim' : result.damage;
    rows.push({
      label: `${label} · ${target.name}`, roll: result.roll,
      detail: `${shooters.map(unit => unit.name).join('＋')} · FP${result.totalFP}`,
      resultText: {elim: '壊滅', dd: 'DD', d: 'D', none: '効果なし'}[effect] || '効果なし',
      resultClass: `hit-${effect}`,
    });
    addLog(counter ? 'counter' : 'stop', `${label}：${shooters.map(unit => unit.name).join('＋')} → ${target.name}`);
    if (!counter) shooters.forEach(unit => fired.add(unit));
  };
  for (const chosen of fire) {
    const shots = isSurpriseAttack(chosen[0].hexId, chosen[0].side) ? 2 : 1;
    for (let shot = 0; shot < shots; shot++) {
      const available = chosen.filter(unit => unit.status === 'ok' && !unit.outOfAmmo);
      const target = targets().find(unit => available.some(shooter => pgStopFirePower(shooter, unit) > 0));
      if (!target) break;
      recordShot(shots === 2 ? `サプライズ ${shot + 1}回目` : 'ストップ射撃',
        available.filter(shooter => pgStopFirePower(shooter, target) > 0), target);
    }
  }
  if (!rows.length) return false;
  const site = moving[0].hexId;
  drawMap();
  await new Promise(resolve => showDiceOverlay('ストップ射撃', site, rows, resolve));

  const counterTarget = [...fired].find(unit => pgOnMap(unit) &&
    targets().some(shooter => canStationaryCounter(shooter, unit)));
  if (counterTarget) {
    const eligible = targets().filter(unit => canStationaryCounter(unit, counterTarget));
    const choice = await pgAskReaction('反撃', `目標 ${counterTarget.hexId} · ${counterTarget.name}`,
      [eligible], '反撃する', '反撃しない');
    if (choice.length) {
      rows.length = 0;
      recordShot('反撃', choice[0], counterTarget, true);
      if (rows.length) {
        drawMap();
        await new Promise(resolve => showDiceOverlay('反撃', site, rows, resolve));
      }
    }
  }
  return true;
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

function pgMovementPanel(showPicker = true) {
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
    node.onclick = action;
    return parent.appendChild(node);
  };
  const redraw = () => { renderMoveFirePhase(); drawMap(); };
  if (!pgAIReview && !pgOrderDraft) {
    const last = pgManualMoveHistory.findLast(group => group.records.size);
    button(section, '味方の移動を一手戻す', pgUndoLastManualMove, !pgReturnEntries(last ? [...last.records.keys()] : []));
  }
  if (review) {
    const status = document.createElement('strong');
    status.className = 'pg-ai-move-complete';
    status.textContent = 'AIの移動完了';
    section.append(status);
    text(section, '戻した駒は移動し直すか、予約・死守を設定できます。');
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
  const activeSide = review?.side ?? directFireState.activeSide;
  const units = testUnits.filter(unit => pgCanReceiveOrder(unit) &&
    unit.side === activeSide && unit.hexId === selectedHex);
  if (review && !units.length) text(section, '修正する駒を地図で選べます。');
  const selected = units.includes(pgOrderUnit) ? pgOrderUnit : showPicker && units.length === 1 ? units[0] : null;
  if (showPicker && units.length > 1) {
    const picker = document.createElement('div');
    picker.className = 'pg-order-picker';
    for (const unit of units) {
      const pick = button(picker, '', () => { pgOrderUnit = unit; redraw(); });
      pick.append(pgUnitLabel(unit));
      pick.setAttribute('aria-pressed', String(unit === selected));
      pick.classList.toggle('is-selected', unit === selected);
    }
    section.append(picker);
  }
  if (selected) {
    const unit = selected;
    const record = pgReturnRecord(unit);
    const order = unit.pgMovementOrder;
    const status = order ? (order.type === 'hold' ? '死守先 ' : '予約先 ') + order.target : '';
    const holding = order?.type === 'hold' && order.target === unit.hexId;
    if (showPicker && units.length === 1) section.append(pgUnitLabel(unit));
    if (showPicker && pgUnitHasFired(unit)) {
      const fired = document.createElement('span');
      fired.className = 'pg-action-state pg-fired';
      fired.textContent = '射撃済';
      section.append(fired);
    }
    text(section, [!showPicker && unit.name, record && record.origin.hexId !== unit.hexId ? `${record.origin.hexId} → ${unit.hexId}` : unit.hexId, holding ? '死守中' : status].filter(Boolean).join(' · '));
    if (record) {
      const allowed = pgCanReturn(unit, record);
      button(section, '移動前のヘクスに戻す', () => pgReturnMovement(pgReturnEntries([unit])), !allowed);
      if (!allowed) text(section, '戦闘・偵察済み、または元のヘクスに配置できません。');
    }
    if (review?.returned.has(unit) && !order && !unit.moveComplete)
      button(section, '移動し直す', () => startMove(unit));
    for (const [type, label] of [['reserve', '移動予約'], ['hold', '死守命令']]) {
      button(section, label, () => { pgOrderDraft = {unit, type, target: null}; redraw(); });
    }
    if (order) button(section, '命令を解除', () => { delete unit.pgMovementOrder; redraw(); });
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
