// Movement orders and review are shared by the two movement phases.
let pgAIReview = null;
let pgOrderRun = null;
let pgOrderDraft = null;
let pgOrderHex = null;
let pgOrderUnit = null;
const pgManualMoves = new Map();
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
    pgOrderUnit = null;
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
    origins: new Map(moving.filter(pgCanReceiveOrder).map(unit => {
      const {col, row, x, y, hexId, moveComplete, status} = unit;
      return [unit, {col, row, x, y, hexId, moveComplete, status}];
    })),
    dummies: testUnits.filter(unit => unit.type === 'dummy' && pgOnMap(unit)),
    orphaned: new Set(),
    blocked: false,
  };
}

function pgRecordConfirmedMove(ms) {
  const record = ms.pgMoveRecord;
  if (!record || ms.path.length < 2) return;
  const group = {trail: ms.path, units: new Set()};
  const revealed = record.dummies.some(dummy => dummy.status === 'eliminated' && !record.orphaned.has(dummy));
  for (const [unit, origin] of record.origins) {
    if (!pgOnMap(unit) || unit.hexId === origin.hexId || !unit.moveComplete) continue;
    group.units.add(unit);
    pgManualMoves.set(unit, {
      origin, destination: unit.hexId, group,
      blocked: record.blocked || revealed,
      dummies: record.dummies.filter(d => record.orphaned.has(d) && d.hexId === origin.hexId && d.side === unit.side),
    });
  }
}

function pgReturnRecord(unit) {
  if (!pgCanReceiveOrder(unit)) return null;
  if (pgAIReview?.stage === 'review') {
    const origin = pgAIReview.origins.get(unit);
    if (!origin || origin.hexId === unit.hexId || pgAIReview.returned.has(unit)) return null;
    return {origin, blocked: pgAIReview.combat.has(unit)};
  }
  const record = pgManualMoves.get(unit);
  return unit.moveComplete && record?.destination === unit.hexId ? record : null;
}

function pgCanReturn(unit, record) {
  const uid = unit.id || unit.name;
  return record && !record.blocked && !moveState.movingUnit && !pgOrderDraft && unit.status === record.origin.status &&
    unit.status !== 'dd' && !unit.firedThisTurn && !unit._counterFired &&
    !directFireState.firedUnits.has(uid) && !directFireState.counterFiredUnits.has(uid) &&
    pgCanEnter([unit], record.origin.hexId);
}

function pgReturnUnit(unit) {
  if (unit !== pgOrderUnit || unit.side !== directFireState.activeSide) return;
  const record = pgReturnRecord(unit);
  if (!pgCanReturn(unit, record)) return;
  const from = unit.hexId;
  const {origin, group, dummies} = record;
  const uid = unit.id || unit.name;
  const originEmpty = !testUnits.some(other => pgOnMap(other) && other.hexId === origin.hexId);
  Object.assign(unit, origin);
  directFireState.movedUnits.delete(uid);
  pgManualMoves.delete(unit);
  if (group) {
    group.units.delete(unit);
    if (!group.units.size) _completedMoveTrails = _completedMoveTrails.filter(trail => trail !== group.trail);
    if (originEmpty) dummies.forEach(dummy => { dummy.status = 'ok'; });
  }
  if (pgAIReview?.stage === 'review') pgAIReview.returned.add(unit);
  else {
    directFireState.atkHexId = unit.hexId;
    directFireState.atkAdjacentHexes = [unit.hexId];
    checkState.atk.clear();
    if (unit.status === 'ok') checkState.atk.add(uid);
    updateFireRange();
  }
  cleanupOrphanDummies(from, unit.side);
  pgOrderHex = unit.hexId;
  addLog('move', `${unit.name}：移動を取り消し、${unit.hexId} に戻しました。`);
  renderMoveFirePhase();
  drawMap();
}

function pgHumanChoosesRearStopFire(movingSide) {
  return pgAIReview?.stage === 'ai' && G.gameMode === 'pvai' &&
    PHASES[G.phase]?.id === 'defMove' && movingSide !== G.playerSide;
}

async function pgPlayerRearStopFire(moving, threats) {
  const lead = moving.find(unit => pgOnMap(unit) && !STACK_EXEMPT_TYPES.includes(unit.type));
  if (!lead) return false;
  const firepower = (shooter, target) => ['T', 'AC'].includes(target.type) ? shooter.fpAT : shooter.fpSoft;
  const targets = () => moving.filter(unit => pgOnMap(unit) && !STACK_EXEMPT_TYPES.includes(unit.type));
  const stacks = new Map();
  for (const unit of threats) {
    if (unit.side !== G.playerSide || unit.reconDone || !targets().some(target => firepower(unit, target) > 0)) continue;
    if (!stacks.has(unit.hexId)) stacks.set(unit.hexId, []);
    stacks.get(unit.hexId).push(unit);
  }
  if (!stacks.size) return false;

  const fire = await new Promise(resolve => {
    const panel = document.createElement('section');
    panel.className = 'pg-stop-choice';
    const title = document.createElement('strong');
    title.textContent = 'ストップ射撃';
    const detail = document.createElement('div');
    detail.textContent = `敵の移動先 ${lead.hexId}。射撃するスタックを選んでください。`;
    panel.append(title, detail);
    const choices = [];
    for (const [hex, shooters] of stacks) {
      const label = document.createElement('label');
      label.className = 'pg-stop-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      label.append(input, `${hex} · ${shooters.map(unit => unit.name).join('、')}`);
      choices.push({input, shooters});
      panel.append(label);
    }
    const controls = document.createElement('div');
    controls.className = 'phase-btn-row';
    const shoot = document.createElement('button');
    shoot.type = 'button';
    shoot.className = 'dice-btn';
    shoot.textContent = '射撃する';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'btn-sm';
    skip.textContent = '射撃せず移動続行';
    const choose = groups => {
      shoot.disabled = skip.disabled = true;
      document.getElementById('phaseContent').textContent = 'AIが移動を処理しています。';
      resolve(groups);
    };
    shoot.onclick = () => choose(choices.filter(choice => choice.input.checked).map(choice => choice.shooters));
    skip.onclick = () => choose([]);
    panel.onchange = () => { shoot.disabled = !choices.some(choice => choice.input.checked); };
    controls.append(shoot, skip);
    panel.append(controls);
    document.getElementById('phaseContent').replaceChildren(panel);
    drawMap();
  });
  if (!fire.length) return false;

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
      const target = targets().find(unit => available.some(shooter => firepower(shooter, unit) > 0));
      if (!target) break;
      recordShot(shots === 2 ? `サプライズ ${shot + 1}回目` : 'ストップ射撃',
        available.filter(shooter => firepower(shooter, target) > 0), target);
    }
  }
  const counterTarget = [...fired].find(unit => pgOnMap(unit) &&
    targets().some(shooter => canStationaryCounter(shooter, unit)));
  if (counterTarget) {
    recordShot('反撃', targets().filter(unit => canStationaryCounter(unit, counterTarget)), counterTarget, true);
  }
  if (!rows.length) return false;
  drawMap();
  await new Promise(resolve => showDiceOverlay('ストップ射撃', lead.hexId, rows, resolve));
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
    node.onclick = action;
    return parent.appendChild(node);
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
  const activeSide = review?.side ?? directFireState.activeSide;
  const units = testUnits.filter(unit => pgCanReceiveOrder(unit) &&
    unit.side === activeSide && unit.hexId === selectedHex);
  if (review && !units.length) text(section, '修正する駒を地図で選べます。');
  const selected = units.includes(pgOrderUnit) ? pgOrderUnit : units.length === 1 ? units[0] : null;
  if (units.length > 1) {
    const picker = document.createElement('div');
    picker.className = 'pg-order-picker';
    for (const unit of units) {
      const pick = button(picker, unit.name, () => { pgOrderUnit = unit; redraw(); });
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
    text(section, [unit.name, record ? `${record.origin.hexId} → ${unit.hexId}` : unit.hexId, holding ? '死守中' : status].filter(Boolean).join(' · '));
    if (record) {
      const allowed = pgCanReturn(unit, record);
      button(section, '移動前のヘクスに戻す', () => {
        pgOrderUnit = unit;
        pgReturnUnit(unit);
      }, !allowed);
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
