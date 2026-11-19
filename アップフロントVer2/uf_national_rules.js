'use strict';

const BASIC_TROOP_TYPES = {
  rus: [['conscripts', '徴集兵', 'Conscripts'], ['guards', '親衛兵', 'Guards']],
  us: [['green', '新兵', 'Green troops'], ['paratroops', '空挺兵', 'Paratroops']],
  ger: [['volksgrenadiers', '国民擲弾兵', 'Volksgrenadiers'], ['ss', 'SS', 'SS']]
};

function troopTypeOf(faction) {
  const type = state.troopTypes?.[faction] ?? state.scenario?.troopTypes?.[faction];
  return BASIC_TROOP_TYPES[faction]?.some(([value]) => value === type) ? type : 'regular';
}

function isEditorEliteFaction(faction) {
  if (['guards', 'paratroops', 'ss'].includes(troopTypeOf(faction))) return true;
  if (!state.scenario?.eliteAttackers) return false;
  const attacker = state.playerRole === 'defender' ? 'ai' : 'player';
  return getFactionKey(state[attacker]) === faction;
}

function britishUnitType(value) {
  return value === 'airborne' || value === 'home-guard' ? value : 'line';
}

function usesBritishFireBonus(faction, group) {
  return faction === 'uk' && !window.AFV?.isAfvGroup(group);
}

function infantryFireNeed(faction, group, printedNeed) {
  return usesBritishFireBonus(faction, group) ? Math.max(1, printedNeed - 1) : printedNeed;
}

function markAIAction(count = 1) {
  state.aiActedThisTurn = true;
  state.aiActionCount = (state.aiActionCount || 0) + count;
}

function banzaiOptions(side, sourceIndex, targetIndex) {
  if (state.phase !== 'play' || state.currentTurn !== side || getFactionKey(state[side]) !== 'jpn') return [];
  const enemySide = _enemySide(side);
  const source = state.groups[side][sourceIndex];
  const target = state.groups[enemySide][targetIndex];
  const R = window.INFANTRY_RULES;
  const acted = side === 'player' ? state.actedGroups : state.aiActedGroups;
  if (!source || !target || source.eliminated || target.eliminated ||
      acted?.has(sourceIndex) || source.firedFPThisTurn > 0 ||
      (side === 'ai' && (state.aiFiredGroups?.has(sourceIndex) || state.aiDiscardedThisTurn > 0)) ||
      (side === 'player' && !window.DISCARD_RULES.canStillAct()) ||
      Math.abs(sourceIndex - targetIndex) > 1 || R.relativeRange(source.distance, target.distance) !== 5 ||
      window.AFV.isAfvGroup(source) || window.AFV.isAfvGroup(target) || groupHasInfantryGun(target, enemySide) ||
      hasPillbox(target) || hasPillbox(source) || pillboxRelation(side, sourceIndex, targetIndex) === 'blocked' ||
      !target.cards.some(R.isAlive)) return [];
  if (state.isNight && !(side === 'player'
    ? isTargetVisibleForPlayer(source, targetIndex, enemySide) : aiCanTargetRecognized(sourceIndex, targetIndex))) return [];
  if ((R.isInStream(source) && !R.hasCrossedStream(source)) ||
      R.isInMarsh(source) || R.hasTerrainType(source, 'WIRE') ||
      [source, target].some(g => R.hasTerrainType(g, 'MINEFIELD'))) return [];

  const ready = source.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.transfer && !c.infiltrating && !c.berserk);
  if (!ready.some(c => ['分隊長', '副分隊長'].includes(R.lookupSoldier(c, 'jpn')?.leader))) return [];
  return ready.filter(c => !c.prisoners?.length && !infantryGunProfile(c, side) && R.lookupSoldier(c, 'jpn'));
}

async function executeBanzai(side, sourceIndex, targetIndex, move, soldiers) {
  const candidates = banzaiOptions(side, sourceIndex, targetIndex);
  const hand = state[side + 'Hand'];
  if (state.radioResolving || !soldiers.length || soldiers.length > 2 ||
      new Set(soldiers).size !== soldiers.length || !soldiers.every(c => candidates.includes(c)) ||
      move?.terrain?.type !== 'MOVEMENT' || !hand.includes(move)) return false;
  const targetSide = _enemySide(side);
  const source = state.groups[side][sourceIndex];
  const target = state.groups[targetSide][targetIndex];
  const title = radioText('バンザイ突撃', 'Banzai Charge') + ' — ' + source.name + ' → ' + target.name;
  state.radioResolving = true;
  try {
    hand.splice(hand.indexOf(move), 1);
    pushTerrainToDiscard(move);
    radioActionUsed(side, sourceIndex);
    if (side === 'ai') await showAIAction(title, move, sourceIndex);
    await window.CC_ACTION.executeBanzaiCombat(source, side, target, targetSide, targetIndex, soldiers, ccDrawCard, title);
    ufReportLog(side, title, side);
    cleanupEliminatedGroups();
    return true;
  } finally {
    state.radioResolving = false;
    renderField('player'); renderField('ai'); renderHands(); updateDeckCounts();
  }
}

async function aiTryBanzai() {
  if (getFactionKey(state.ai) !== 'jpn') return false;
  const move = state.aiHand[aiActionCardIndex('MOVEMENT')];
  if (!move) return false;
  const R = window.INFANTRY_RULES;
  const CC = window.CC_ACTION;
  const defenders = state.groups.player;
  const opponent = getFactionKey(state.player);
  for (const [sourceIndex, group] of state.groups.ai.entries()) {
    for (const [targetIndex, target] of defenders.entries()) {
      const value = c => CC.getCCV(c, R.lookupSoldier(c, 'jpn'), {group}) - 1;
      const soldiers = banzaiOptions('ai', sourceIndex, targetIndex).sort((a,b) => value(b) - value(a)).slice(0,2);
      if (!soldiers.length) continue;
      const targetValues = target.cards.filter(R.isAlive).map(c => CC.getCCV(c, R.lookupSoldier(c, opponent) || {}, {group: target}));
      const average = values => values.reduce((sum,n) => sum + n, 0) / values.length;
      if (average(soldiers.map(value)) >= average(targetValues)) {
        return executeBanzai('ai', sourceIndex, targetIndex, move, soldiers);
      }
    }
  }
  return false;
}
