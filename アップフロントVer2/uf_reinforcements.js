// §35 シナリオ側の reinforcements[faction] に afterCycles と soldiers を定義する。
'use strict';

function reinforcementPlan(side) {
  const faction = getFactionKey(state[side]);
  const rule = state.scenario?.reinforcements?.[faction];
  if (!rule || state.reinforcementsUsed?.[side] || !rule.soldiers?.length ||
      (state.terrainDeck?.cycle ?? 0) < rule.afterCycles) return null;
  const occupied = new Set(state.groups[side].flatMap(g => g?.cards.map(c => c.num) || []));
  if (state.groups[side][reinforcementSlot('E')]?.cards.length ||
      new Set(rule.soldiers).size !== rule.soldiers.length ||
      rule.soldiers.some(num => occupied.has(num) || !getSoldierDef(faction, num)) ||
      partisanFormationError(state.scenario, faction, [...occupied, ...rule.soldiers])) return null;
  return { faction, rule };
}

function reinforcementOptions(side) {
  if (state.phase !== 'play' || state.currentTurn !== side || state.radioResolving ||
      deckAttackInProgress() || state.terrainDeck?.timeLimitReached ||
      !partisanActionRoom(side) || afvSmokeActionUsed(side)) return null;
  const plan = reinforcementPlan(side);
  if (!plan) return null;
  const discards = window.DISCARD_RULES;
  if (side === 'player' ? !discards.canStillAct() :
      (state.aiDiscardedThisTurn || 0) > discards.turnLimit(plan.faction, (state.aiActionCount || 0) + 1)) return null;

  const hand = state[side + 'Hand'];
  const moves = hand.filter(card => handActionFace(card, 'MOVEMENT', side));
  if (!moves.length) return null;
  const hasActed = side === 'player'
    ? window.DISCARD_RULES.didAnything() || state.actedGroups?.size ||
      state.groups.player.some(g => g?.firedFPThisTurn > 0)
    : state.aiActedThisTurn || state.aiActedGroups?.size || state.aiFiredGroups?.size ||
      state.aiDiscardedThisTurn || state.aiDumpedThisTurn;
  const concealment = hasActed ? [] : hand.filter(card => handActionFace(card, 'CONCEALED', side));
  const definitions = plan.rule.soldiers.map(num => getSoldierDef(plan.faction, num));
  const hasVehicle = definitions.some(def => def?.afv);
  const hasInfantryGun = definitions.some(def => def?.infantryGun ||
    state.scenario?.infantryGuns?.[plan.faction]?.[def?.num]);
  const terrain = concealment.length
    ? hand.filter(card => ['WOODS', 'BUILDINGS', 'HILL', 'BRUSH', 'WALL', 'GULLY', 'STREAM', 'MARSH'].includes(card.terrain?.type) &&
      !window.SCENARIO_HELPERS.isCardDisabledAsTerrain(state.scenario, card, state[side+'Role'] === 'attacker') &&
      !(hasVehicle && card.terrain.denseJungle) &&
      !(card.terrain.type === 'MARSH' && (hasVehicle || hasInfantryGun)))
    : [];
  return { ...plan, hand, moves, concealment, terrain, hasVehicle };
}

function reinforcementMaxDistance(side) {
  const start = (state.reinforcementStart ||= {});
  if (start[side]?.turn !== (state.turnCount || 0)) {
    const distance = Math.max(0, ...state.groups[side].map(g =>
      g && !g.eliminated && g.cards.some(window.INFANTRY_RULES.isAlive) ? (g.distance || 0) : 0));
    start[side] = { turn: state.turnCount || 0, distance };
  }
  return start[side].distance;
}

function reinforcementEntryRange(side, move, options) {
  return options.hasVehicle || handActionFace(move, 'MOVEMENT', side)?.sub !== '側面'
    ? 0 : reinforcementMaxDistance(side);
}

function enterReinforcements(side, move, distance, concealed, terrain) {
  const opts = reinforcementOptions(side);
  if (!opts?.moves.includes(move) || !Number.isInteger(distance) || distance < 0 ||
      distance > reinforcementEntryRange(side, move, opts) ||
      Boolean(concealed) !== Boolean(terrain) ||
      (terrain && (move === concealed || !opts.terrain.includes(terrain) || !opts.concealment.includes(concealed)))) return false;
  useHandActionFace(move, handActionFace(move, 'MOVEMENT', side));
  if (concealed) useHandActionFace(concealed, handActionFace(concealed, 'CONCEALED', side));
  const groups = state.groups[side];
  const slot = reinforcementSlot('E');
  while (groups.length < slot) groups.push(makeReinforcementGroup(groupSlotName(groups.length), opts.faction));
  const entry = makeReinforcementGroup('E', opts.faction);
  entry.cards = opts.rule.soldiers.map(num => makeCardWithMeta(opts.faction, num));
  entry.distance = distance;
  groups[slot] = entry;
  (state.reinforcementsUsed ||= {})[side] = true;
  state.initialSoldierCount[side] += entry.cards.length;
  for (const card of terrain ? [move, concealed, terrain] : [move]) {
    opts.hand.splice(opts.hand.indexOf(card), 1);
    if (card !== terrain) pushTerrainToDiscard(card);
  }
  if (terrain) pushTerrainWithFaction(entry, terrain);
  else entry.terrain.push(makeDummyPlain());
  if (side === 'player') {
    window.DISCARD_RULES.markActed();
    (state.actedGroups ||= new Set()).add(slot);
  } else {
    markAIAction();
    (state.aiActedGroups ||= new Set()).add(slot);
    state.aiHandCount = state.aiHand.length;
  }
  ufReportLog(side, '増援: GROUP E', side);
  renderField(side);
  updateDeckCounts();
  return true;
}

function chooseReinforcementCard(cards, promptText, type) {
  const list = cards.map((card, i) => {
    const face = type ? handActionFace(card, type, 'player') : card.terrain;
    return (i + 1) + '. ' + face.type + (face.sub ? ' · ' + face.sub : '');
  });
  const result = prompt([promptText, ...list].join('\n'), '1');
  return result?.trim() ? cards[Number(result) - 1] : undefined;
}

function playerReinforcements() {
  const opts = reinforcementOptions('player');
  if (!opts) return;
  const en = LANG !== 'ja';
  const move = chooseReinforcementCard(opts.moves, en ? 'Choose a Movement card.' : '移動カードを選んでください。', 'MOVEMENT');
  if (!move) return;
  let distance = 0;
  const max = reinforcementEntryRange('player', move, opts);
  if (max > 0) {
    const answer = prompt(en ? `Entry range chit (0–${max})` : `登場する距離チット（0〜${max}）`, '0');
    if (!answer?.trim()) return;
    distance = Number(answer);
  }
  let conceal, terrain;
  const concealment = opts.concealment.filter(card => card !== move);
  if (opts.terrain.length && concealment.length && confirm(en
    ? 'Enter with terrain and end the turn? This uses a Concealed card and a Terrain card.'
    : '隠蔽カードと地形カードも使って登場し、この手番を終了しますか？')) {
    conceal = chooseReinforcementCard(concealment, en ? 'Choose a Concealed card.' : '隠蔽カードを選んでください。', 'CONCEALED');
    if (!conceal) return;
    terrain = chooseReinforcementCard(opts.terrain, en ? 'Choose a Terrain card.' : '地形カードを選んでください。');
    if (!terrain) return;
  }
  if (!enterReinforcements('player', move, distance, conceal, terrain)) return;
  state.selectedHand.clear();
  state.selectedAction = state.fireSource = state.fireTarget = state.sniperTarget = null;
  document.querySelectorAll('.action-btn.active').forEach(button => button.classList.remove('active'));
  renderHands();
  updateDecideBtn();
  if (terrain) document.getElementById('btn-end-turn').click();
}

function updateReinforcementButton() {
  const button = document.getElementById('btn-reinforcements');
  button.hidden = !state.scenario?.reinforcements?.[getFactionKey(state.player)];
  if (!button.hidden && state.phase === 'play' && state.currentTurn === 'player') reinforcementMaxDistance('player');
  button.disabled = !reinforcementOptions('player');
  button.textContent = LANG === 'ja' ? '増援' : 'Reinforcements';
}

async function aiEnterReinforcements() {
  const opts = reinforcementOptions('ai');
  if (!opts) return false;
  const move = opts.moves.find(card => handActionFace(card, 'MOVEMENT', 'ai')?.sub === '側面') || opts.moves[0];
  const distance = reinforcementEntryRange('ai', move, opts);
  if (!enterReinforcements('ai', move, distance)) return false;
  await showAIAction('AI: 増援 → GROUP E', null, reinforcementSlot('E'));
  return true;
}

// §48 ランダム増援。数字は編成カードに印刷された番号。0は狙撃兵、*は任意の兵士。
const RANDOM_REINFORCEMENT_TABLE = {
  ger: [[8, 9], [9, 10, 24], [10, 19, 24, '*'], [8, 24, 26, 27, '*'], [30], [39]],
  rus: [[24, 25], [21, 22, 23], [20, 21, 22, '*'], [19, 23, 24, 25, '*'], [31], [34]],
  us: [[11, 12], [17, 20, 21], [20, 25, 26, '*'], [20, 21, 22, 23, '*'], [31], [34]],
  uk: [[8, 9], [10, 22, 24], [8, 22, 25, '*'], [8, 22, 24, 25, '*'], [34], [35]],
  jpn: [[11, 12], [4, 13, 25], [15, 18, 25, '*'], [15, 20, 25, 26, '*'], [37], [34]],
};

function reinforcementSlot(name) {
  return state.scenario?.randomDefenderReinforcements ? RANDOM_REINFORCEMENT_SLOTS.indexOf(name) : 4;
}

function makeReinforcementGroup(name, faction) {
  return { name, cards: [], distance: 0, terrain: [], actions: [], _faction: faction, crewPairs: {} };
}

function prepareRandomReinforcementSlots() {
  if (!state.scenario?.randomDefenderReinforcements) return;
  for (const side of ['player', 'ai']) {
    const groups = state.groups[side];
    if (groups[0]?.name === 'Z') continue;
    const faction = getFactionKey(state[side]);
    state.groups[side] = RANDOM_REINFORCEMENT_SLOTS.map(name => groups.find(g => g.name === name) ||
      { ...makeReinforcementGroup(name, faction), eliminated: true });
  }
  state.randomReinforcements ||= {
    checks: {}, waiting: [], obtained: 0, starting: state.initialSoldierCount.ai,
    reserved: state.groups.ai.flatMap(group => group.cards.map(card => card.num)),
    losses: [], sniperReady: [],
  };
}

function offerRandomReinforcementCheck() {
  const rule = state.randomReinforcements;
  if (!state.scenario?.randomDefenderReinforcements || !rule || state.phase !== 'play' ||
      rule.obtained >= Math.ceil(rule.starting / 2)) return;
  const turn = (state.turnCount || 0) + (state.currentTurn === 'ai' ? 2 : 1);
  rule.checks[turn] = (rule.checks[turn] || 0) + 1;
}

function noteRandomReinforcementRnc(card, side = state.currentTurn) {
  if (side === 'player' && card?.terrain?.rncColor === '黒' && Number(card.terrain.range) === 6) {
    offerRandomReinforcementCheck();
  }
  return card;
}

function drawRandomReinforcementRnc(side = state.currentTurn) {
  return noteRandomReinforcementRnc(drawTerrainCard(), side);
}

function pickRandomReinforcementCards(roll) {
  const rule = state.randomReinforcements;
  const faction = getFactionKey(state.ai);
  const unavailable = new Set([...rule.reserved, ...(state.scenario.reinforcements?.[faction]?.soldiers || [])]);
  const cards = SOLDIER_CARDS[faction].filter(card => !card.afvButtoned);
  const available = card => !unavailable.has(card.num);
  const points = card => Number(card.pt) || 0;
  const best = candidates => candidates.sort((a, b) => points(b) - points(a) || Number(b.morale) - Number(a.morale))[0];
  const picked = [];
  for (const number of RANDOM_REINFORCEMENT_TABLE[faction]?.[roll - 1] || []) {
    const permitted = cards.filter(available).filter(card =>
      !partisanFormationError(state.scenario, faction, [...rule.reserved, ...picked, card.num]));
    let choice;
    if (number === '*') {
      choice = best(permitted.filter(card => !card.afv && !card.infantryGun && !card.weaponCat.startsWith('中機関銃')));
    } else {
      const printed = cards.find(card => (card.cardNumber ?? card.num) === number);
      if (!printed) continue;
      const substitutes = permitted.filter(card => points(card) <= points(printed));
      choice = permitted.find(card => card.num === printed.num) ||
        best(substitutes.filter(card => card.weaponCat === printed.weaponCat)) ||
        best(substitutes.filter(card => !card.afv && !card.infantryGun));
    }
    if (!choice) continue;
    picked.push(choice.num);
    unavailable.add(choice.num);
  }
  return picked;
}

async function aiCheckRandomReinforcements() {
  const rule = state.scenario?.randomDefenderReinforcements && state.randomReinforcements;
  if (!rule) return false;
  const turn = state.turnCount || 0;
  const due = rule.sniperReady.filter(available => available <= turn).length;
  if (due) {
    state.aiExtraSnipers = (state.aiExtraSnipers || 0) + due - Number(Boolean(state.aiSniperDisabled));
    if (state.aiSniperDisabled && state.partisanSniperChecks) state.partisanSniperChecks.ai = 0;
    state.aiSniperDisabled = false;
    rule.sniperReady = rule.sniperReady.filter(available => available > turn);
  }
  const checks = rule.checks[turn] || 0;
  delete rule.checks[turn];
  if (!checks || rule.obtained >= Math.ceil(rule.starting / 2)) return false;
  markAIAction();
  const arriving = [];
  for (let i = 0; i < checks; i++) {
    const card = drawTerrainCard();
    if (!card) break;
    pushTerrainToDiscard(card);
    const black = card.terrain.rncColor === '黒';
    if (black && Number(card.terrain.range) === 0) rule.sniperReady.push(turn + 2);
    else if (black) {
      const soldiers = pickRandomReinforcementCards(Number(card.terrain.range));
      rule.reserved.push(...soldiers);
      rule.obtained += soldiers.length;
      arriving.push(...soldiers);
    }
    await showAIAction(black ? 'AI: ランダム増援判定に成功' : 'AI: ランダム増援なし', card);
    if (state.phase !== 'play' || rule.obtained >= Math.ceil(rule.starting / 2)) break;
  }
  if (arriving.length) rule.waiting.push({ turn: turn + 2, soldiers: arriving });
  return true;
}

async function aiEnterRandomReinforcements() {
  const rule = state.scenario?.randomDefenderReinforcements && state.randomReinforcements;
  const pending = rule?.waiting[0];
  if (!pending || pending.turn > state.turnCount) return false;
  const faction = getFactionKey(state.ai);
  const groups = state.groups.ai;
  const move = state.aiHand[aiActionCardIndex('MOVEMENT', face =>
    groups[reinforcementSlot(face.rncColor === '赤' ? 'Z' : 'E')]?.eliminated)];
  if (!move) return false;
  const name = move.terrain.rncColor === '赤' ? 'Z' : 'E';
  const slot = reinforcementSlot(name);
  const entry = makeReinforcementGroup(name, faction);
  const vehicle = pending.soldiers.find(num => getSoldierDef(faction, num)?.afv);
  // 車両は単独で登場。複数の判定で歩兵も得た場合は次の空いた入口を待つ。
  const numbers = vehicle == null ? pending.soldiers.splice(0, 10) :
    pending.soldiers.splice(pending.soldiers.indexOf(vehicle), 1);
  entry.cards = numbers.map(num => makeCardWithMeta(faction, num));
  entry.distance = reinforcementEntryRange('ai', move, { hasVehicle: vehicle != null });
  if (!pending.soldiers.length) rule.waiting.shift();
  rule.losses.push(...groups[slot].cards);
  entry.terrain = [makeDummyPlain()];
  groups[slot] = entry;
  state.aiHand.splice(state.aiHand.indexOf(move), 1);
  pushTerrainToDiscard(move);
  state.aiHandCount = state.aiHand.length;
  markAIAction();
  (state.aiActedGroups ||= new Set()).add(slot);
  state.initialSoldierCount.ai += entry.cards.length;
  ufReportLog('ai', 'ランダム増援: GROUP ' + name, 'ai');
  renderField('ai');
  renderHands();
  await showAIAction('AI: ランダム増援 → GROUP ' + name, move, slot);
  return true;
}
