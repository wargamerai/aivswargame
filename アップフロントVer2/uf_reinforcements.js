// §35 シナリオ側の reinforcements[faction] に afterCycles と soldiers を定義する。
'use strict';

function reinforcementPlan(side) {
  const faction = getFactionKey(state[side]);
  const rule = state.scenario?.reinforcements?.[faction];
  if (!rule || state.reinforcementsUsed?.[side] || !rule.soldiers?.length ||
      (state.terrainDeck?.cycle ?? 0) < rule.afterCycles) return null;
  const occupied = new Set(state.groups[side].flatMap(g => g?.cards.map(c => c.num) || []));
  if (state.groups[side][4]?.cards.length ||
      new Set(rule.soldiers).size !== rule.soldiers.length ||
      rule.soldiers.some(num => occupied.has(num) || !getSoldierDef(faction, num)) ||
      partisanFormationError(state.scenario, faction, [...occupied, ...rule.soldiers])) return null;
  return { faction, rule };
}

function reinforcementOptions(side) {
  const plan = reinforcementPlan(side);
  if (!plan || state.phase !== 'play' || state.currentTurn !== side) return null;
  const hand = state[side + 'Hand'];
  const moves = hand.filter(card => card.terrain?.type === 'MOVEMENT');
  if (!moves.length || (side === 'player' && !window.DISCARD_RULES.canStillAct())) return null;
  const hasActed = side === 'player'
    ? window.DISCARD_RULES.didAnything() || state.actedGroups?.size ||
      state.groups.player.some(g => g?.firedFPThisTurn > 0)
    : state.aiActedThisTurn || state.aiActedGroups?.size || state.aiFiredGroups?.size ||
      state.aiDiscardedThisTurn || state.aiDumpedThisTurn;
  const concealment = hasActed ? [] : hand.filter(card => card.terrain?.type === 'CONCEALED');
  const terrain = concealment.length
    ? hand.filter(card => ['WOODS', 'BUILDINGS', 'HILL', 'BRUSH', 'WALL', 'GULLY'].includes(card.terrain?.type) &&
      !window.SCENARIO_HELPERS.isCardDisabledAsTerrain(state.scenario, card, state[side+'Role'] === 'attacker'))
    : [];
  return { ...plan, hand, moves, concealment, terrain };
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

function enterReinforcements(side, move, distance, concealed, terrain) {
  const opts = reinforcementOptions(side);
  if (!opts?.moves.includes(move) || !Number.isInteger(distance) || distance < 0 ||
      distance > (move.terrain.sub === '側面' ? reinforcementMaxDistance(side) : 0) ||
      Boolean(concealed) !== Boolean(terrain) ||
      (terrain && (!opts.terrain.includes(terrain) || !opts.concealment.includes(concealed)))) return false;
  const group = name => ({ name, cards: [], distance: 0, terrain: [], actions: [], _faction: opts.faction, crewPairs: {} });
  const groups = state.groups[side];
  while (groups.length < 4) groups.push(group('ABCD'[groups.length]));
  const entry = group('E');
  entry.cards = opts.rule.soldiers.map(num => makeCardWithMeta(opts.faction, num));
  entry.distance = distance;
  groups[4] = entry;
  (state.reinforcementsUsed ||= {})[side] = true;
  for (const card of terrain ? [move, concealed, terrain] : [move]) {
    opts.hand.splice(opts.hand.indexOf(card), 1);
    if (card !== terrain) pushTerrainToDiscard(card);
  }
  if (terrain) pushTerrainWithFaction(entry, terrain);
  else entry.terrain.push(makeDummyPlain());
  if (side === 'player') {
    window.DISCARD_RULES.markActed();
    (state.actedGroups ||= new Set()).add(4);
  } else {
    markAIAction();
    state.aiActedGroups.add(4);
    state.aiHandCount = state.aiHand.length;
  }
  ufReportLog(side, '増援: GROUP E', side);
  renderField(side);
  updateDeckCounts();
  return true;
}

function chooseReinforcementCard(cards, promptText) {
  const list = cards.map((c, i) => (i + 1) + '. ' + c.terrain.type +
    (c.terrain.sub ? ' · ' + c.terrain.sub : ''));
  const result = prompt([promptText, ...list].join('\n'), '1');
  return result?.trim() ? cards[Number(result) - 1] : undefined;
}

function playerReinforcements() {
  const opts = reinforcementOptions('player');
  if (!opts) return;
  const en = LANG !== 'ja';
  const move = chooseReinforcementCard(opts.moves, en ? 'Choose a Movement card.' : '移動カードを選んでください。');
  if (!move) return;
  let distance = 0;
  if (move.terrain.sub === '側面') {
    const max = reinforcementMaxDistance('player');
    const answer = prompt(en ? `Entry range chit (0–${max})` : `登場する距離チット（0〜${max}）`, '0');
    if (!answer?.trim()) return;
    distance = Number(answer);
  }
  let conceal, terrain;
  if (opts.terrain.length && confirm(en
    ? 'Enter with terrain and end the turn? This uses a Concealed card and a Terrain card.'
    : '隠蔽カードと地形カードも使って登場し、この手番を終了しますか？')) {
    conceal = chooseReinforcementCard(opts.concealment, en ? 'Choose a Concealed card.' : '隠蔽カードを選んでください。');
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
  const move = opts.moves.find(c => c.terrain.sub === '側面') || opts.moves[0];
  const distance = move.terrain.sub === '側面' ? reinforcementMaxDistance('ai') : 0;
  if (!enterReinforcements('ai', move, distance)) return false;
  await showAIAction('AI: 増援 → GROUP E', null, 4);
  return true;
}
