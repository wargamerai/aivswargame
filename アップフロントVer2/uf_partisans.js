// §37 自作シナリオが partisans: 'rus' を指定した場合だけ適用する。
'use strict';

function partisanFaction(faction, scenario = state.scenario) {
  return faction === 'rus' && scenario?.partisans === 'rus';
}

function partisanFormationError(scenario, faction, numbers) {
  if (!scenario || !partisanFaction(faction, scenario)) return null;
  let leaders = 0;
  for (const num of numbers) {
    const def = getSoldierDef(faction, num);
    if (def?.afv || num === 31 || num === 131 ||
        scenario.infantryGuns?.[faction]?.[num] || /^(対戦車砲|歩兵砲)/.test(def?.weaponCat || '')) {
      return radioText('パルチザンには装甲車両・歩兵砲を編成できません。',
        'Partisan forces cannot include armored vehicles or infantry guns.');
    }
    if (isLeaderSoldier(def) || def?.rank === '政治委員') leaders++;
  }
  return leaders > 1 ? radioText('パルチザンに編成できる指揮官は、増援も含めて1人までです。',
    'Partisan forces may include only one leader, including reinforcements.') : null;
}

function partisanStartingForcesError(scenario, faction, numbers) {
  return partisanFormationError(scenario, faction,
    [...numbers, ...(scenario?.reinforcements?.[faction]?.soldiers || [])]);
}

function partisanSide(side) {
  return partisanFaction(getFactionKey(state[side]));
}

function partisanActionRoom(side, actions = 1) {
  if (!partisanSide(side)) return true;
  const rules = window.INFANTRY_RULES;
  const aliveGroups = state.groups[side].filter(g => g && !g.eliminated && g.cards.some(rules.isAlive)).length;
  const acted = side === 'player' ? state.actedGroups : state.aiActedGroups;
  const fired = side === 'ai' ? state.aiFiredGroups : null;
  const spent = new Set([...(acted || []), ...(fired || [])]);
  return spent.size + actions <= Math.max(1, aliveGroups - 1);
}

function partisanSniperCheck(side) {
  if (!partisanSide(side)) return true;
  if (getFactionKey(state[_enemySide(side)]) !== 'ger') return false;
  const checks = (state.partisanSniperChecks ||= {});
  checks[side] = (checks[side] || 0) + 1;
  return checks[side] >= 2;
}

function partisanCanAmbush(side, source, target) {
  if (!partisanSide(side) || isMovingIgnoringOverlays(source)) return false;
  const rules = window.INFANTRY_RULES;
  const terrain = rules.currentTerrainType(source);
  return ['WOODS','BRUSH'].includes(terrain) &&
    [source,target].every(g => !g.cards.some(c => rules.isAlive(c) && rules.isPinned(c)));
}

function partisanTrap(side, target, card) {
  if (!partisanSide(side) || card.terrain?.type !== 'MINEFIELD' || !isMovingIgnoringOverlays(target)) return false;
  triggerMinefieldAttack(target, card, _enemySide(side));
  card._minefieldPlaced = true;
  updateDeckCounts();
  return true;
}
