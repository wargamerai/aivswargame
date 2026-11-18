// §40 シナリオの radioHolders[国籍] に、無線機を持つ兵士の番号を定義する。
'use strict';

function radioText(ja, en) { return LANG === 'ja' ? ja : en; }

function radioHolders(side) {
  const faction = getFactionKey(state[side]);
  const holders = state.scenario?.radioHolders?.[faction];
  return Array.isArray(holders) ? holders : [];
}

function isRadioCard(card, side) {
  const terrain = card?.terrain;
  if (!terrain || !/RADIO|無線機/i.test(terrain.sub || '') ||
      !String(terrain.type).startsWith('RALLY') ||
      window.SCENARIO_HELPERS.isCardDisabledAsTerrain(state.scenario, card, state[side+'Role'] === 'attacker')) return false;
  const faction = getFactionKey(state[side]);
  const mark = { ger:'独', rus:'ソ', us:'米', jpn:'日', uk:'英' }[faction];
  return !terrain.leftFactions?.length || terrain.leftFactions.includes(mark);
}

function radioOperator(side, index, broken=false) {
  const group = state.groups[side][index];
  const R = window.INFANTRY_RULES;
  if (state.phase !== 'play' || state.currentTurn !== side || !group || group.eliminated) return null;
  const acted = side === 'player' ? state.actedGroups : state.aiActedGroups;
  if (acted?.has(index) || group.firedFPThisTurn > 0 ||
      (side === 'ai' && (state.aiFiredGroups?.has(index) ||
        (state.aiDiscardedThisTurn > window.DISCARD_RULES.turnLimit(getFactionKey(state.ai), (state.aiActionCount || 0) + 1)))) ||
      (side === 'player' && !window.DISCARD_RULES.canStillAct())) return null;
  const faction = getFactionKey(state[side]);
  const ready = c => R.isAlive(c) && !R.isPinned(c) && !c.infiltrating && !c.transfer;
  const hasLeader = group.cards.some(c => {
    if (!ready(c)) return false;
    const d = R.lookupSoldier(c, faction);
    return d && (d.leader === '分隊長' || d.leader === '副分隊長' || d.rank === '政治委員');
  });
  if (!broken && !hasLeader) return null;
  if (broken && (isMovingIgnoringOverlays(group) || R.isInStream(group) || R.isInMarsh(group))) return null;
  const holders = radioHolders(side);
  return group.cards.find(c => holders.includes(c.num) && !c._radioRemoved &&
    Boolean(c._radioBroken) === broken && ready(c)) || null;
}

function radioTarget(side, index) {
  const group = state.groups[_enemySide(side)][index];
  return group && !group.eliminated && attackTargetsOf(group).some(window.INFANTRY_RULES.isAlive) ? group : null;
}

function radioActionUsed(side, index) {
  if (side === 'player') {
    window.DISCARD_RULES.markActed();
    (state.actedGroups ||= new Set()).add(index);
  } else {
    markAIAction();
    (state.aiActedGroups ||= new Set()).add(index);
    state.aiHandCount = state.aiHand.length;
  }
}

function resolveSupportHits(target, targetSide, base=5, radio=false, ordnance=false) {
  const R = window.INFANTRY_RULES;
  const faction = getFactionKey(state[targetSide]);
  const terrain = radio ? target.terrain.filter(card => card.terrain?.type !== 'WOODS') : target.terrain;
  const strength = base + R.calcTerrainMod(terrain, false, { japanBuildings: isJapanInGame() });
  return attackTargetsOf(target).filter(R.isAlive).flatMap(card => {
    const draw = ccDrawCard();
    const def = R.lookupSoldier(card, faction);
    if (!draw || !def) return [];
    const red = draw.terrain.rncColor === '赤';
    const value = Number(draw.terrain.range) || 0;
    const rnc = red ? -value : value;
    const pinned = R.isPinned(card);
    const leadership = hasCommissar(target) ? 1 : 0;
    const moraleMod = leadership - Number(card.malfunctioned || card.destroyed || false);
    const panicMod = moraleMod - Number(Boolean(target.encircled && pinned));
    let result = radio ? window.AFV?.radioCritical(target, card, red, value) : null;
    const finalFP = strength + transitFireBonus(card) + infantryGunDefense(target, card, targetSide);
    const resolution = R.resolveFireOnSoldier(finalFP, rnc, def, pinned,
      Number(draw.terrain.dice?.['0r']) || 0, moraleMod, panicMod, 0, R.rpc7wOf(draw), ordnance);
    if (!result) {
      result = resolution.result;
      if (result === 'WOUND') result = def.afv ? 'NONE' : applyWound(card);
      if (result === 'KIA' || result === 'PANIC_KIA') R.killSoldier(card);
      else if (result === 'PANIC_ROUT') R.routSoldier(card);
      else if (result === 'PIN') R.pinSoldier(card);
      if (result !== 'NONE' && def.leader === '分隊長') applySLDamagePenalty(targetSide);
    }
    return [{
      name: def.name || card.id, rnc, rncColor: red ? '赤' : '黒', result, finalFP,
      sum: finalFP + rnc, morale: Number(pinned ? def.panic : def.morale) || 0,
      kia: Number(pinned ? def.kiaBack : def.kiaFront) || 0, wasPinned: pinned
    }];
  });
}

async function resolveRadioMission(side, source, targetIndex, card) {
  if (state.radioResolving) return false;
  const operator = radioOperator(side, source);
  const target = radioTarget(side, targetIndex);
  const hand = state[side + 'Hand'];
  if (!operator || !target || !hand.includes(card) || !isRadioCard(card, side)) return false;
  const defender = _enemySide(side);
  const title = radioText('無線支援 → GROUP ', 'Artillery mission → GROUP ') + target.name;
  state.radioResolving = true;
  try {
    hand.splice(hand.indexOf(card), 1);
    pushTerrainToDiscard(card);
    radioActionUsed(side, source);
    if (defender === 'player') await showAIAction(title, card, source);
    const conceal = canUseConcealment(target)
      ? (defender === 'player' ? await askPlayerConcealment() : aiUseConcealment()) : [];
    const penalty = Math.min(3, Math.abs(parseInt(conceal[0]?.terrain?.modifier, 10) || 0));
    const draw = ccDrawCard();
    const red = draw?.terrain.rncColor === '赤';
    const value = Number(draw?.terrain.range) || 0;
    if (red && value >= 5) operator._radioBroken = true;
    const success = draw && !red && value >= penalty;
    const status = !draw ? radioText('判定カードなし', 'No resolution card') :
      radioText(red ? '赤' : '黒', red ? 'Red ' : 'Black ') + value + ' · ' +
      (operator._radioBroken ? radioText('無線機故障', 'Radio malfunction') :
        success ? radioText('砲撃成立', 'Fire mission accepted') : radioText('砲撃不成立', 'Fire mission denied'));
    const results = success ? resolveSupportHits(target, defender, 5, true) : [];
    ufReportLog(side, title + ' · ' + status, side);
    await showFireResultOverlay(title + ' · ' + status, results, [card, ...conceal, draw].filter(Boolean));
    cleanupEliminatedGroups();
    renderField('player'); renderField('ai'); renderHands(); updateDeckCounts();
    return true;
  } finally {
    state.radioResolving = false;
  }
}

function repairRadio(side, index) {
  const operator = radioOperator(side, index, true);
  if (!operator) return null;
  const faction = getFactionKey(state[side]);
  const entry = getRepairEntry(faction, '無線機');
  if (!entry) return null;
  const R = window.INFANTRY_RULES;
  radioActionUsed(side, index);
  const wound = R.isWoundActive(operator) ? ccDrawCard() : null;
  if (wound?.terrain?.rncColor === '赤') return radioText('負傷で無線機の修理不可', 'Wounded: unable to repair the radio');
  const draw = ccDrawCard();
  if (!draw) return radioText('無線機の修理判定なし', 'No radio repair roll');
  showJudgeCard(draw);
  const color = draw.terrain.rncColor, value = Number(draw.terrain.range) || 0;
  if (matchesRange(parseRepairRange(entry.destroy), color, value)) {
    operator._radioBroken = false;
    operator._radioRemoved = true;
    return radioText('無線機は除去されました', 'Radio removed');
  }
  if (matchesRange(parseRepairRange(entry.repair), color, value)) {
    operator._radioBroken = false;
    return radioText('無線機の修理成功', 'Radio repaired');
  }
  return radioText('無線機の修理失敗', 'Radio repair failed');
}

async function aiUseRadio() {
  if (!radioHolders('ai').length) return;
  const R = window.INFANTRY_RULES;
  const card = state.aiHand.find(c => isRadioCard(c, 'ai'));
  const source = state.groups.ai.findIndex((group, i) => radioOperator('ai', i));
  const targets = state.groups.player.map((group, i) => ({ i, size: group?.cards.filter(R.isAlive).length || 0 }))
    .filter(({ i }) => radioTarget('ai', i)).sort((a,b) => b.size - a.size);
  if (card && source >= 0 && targets.length) await resolveRadioMission('ai', source, targets[0].i, card);
  const repair = state.groups.ai.findIndex((group, i) => radioOperator('ai', i, true));
  if (repair >= 0) {
    const result = repairRadio('ai', repair);
    if (result) await showAIAction('AI: ' + result, null, repair);
  }
}

function updateRadioControls() {
  const show = radioHolders('player').length > 0;
  for (const [id, ja, en] of [['btn-radio','無線支援','Call artillery'], ['btn-radio-repair','無線機修理','Repair radio']]) {
    const button = document.getElementById(id);
    button.hidden = !show;
    button.textContent = radioText(ja, en);
  }
}
