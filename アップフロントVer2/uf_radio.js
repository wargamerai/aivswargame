// §40 シナリオの radioHolders[国籍] に、無線機を持つ兵士の番号を定義する。
'use strict';

function radioText(ja, en) { return LANG === 'ja' ? ja : langX(en); }

function desertRadioCost(faction, troop, strength) {
  const base = { ita: 22, fra: 42 }[faction] || 0;
  const halfPrice = faction === 'ita' ? troop !== 'bersaglieri' : troop === 'reservists';
  return (strength - 4) * base / (halfPrice ? 2 : 1);
}

function radioHolders(side) {
  const faction = getFactionKey(state[side]);
  const R = window.INFANTRY_RULES;
  return (state.groups[side] || []).flatMap(group => (group?.cards || [])
    .filter(card => R.isAlive(card) && secondaryWeaponOn(card, faction)?.kind === 'radioHolders')
    .map(card => card.num));
}

function isRadioCard(card, side) {
  const faction = getFactionKey(state[side]);
  const borrowed = faction === 'ita' || faction === 'fra';
  const terrain = borrowed ? TERRAIN_CARDS[card?.terrainIndex] || card?.terrain : card?.terrain;
  if (!terrain || !/RADIO|無線機/i.test(terrain.sub || '') ||
      !String(terrain.type).startsWith('RALLY') ||
      window.SCENARIO_HELPERS.isCardDisabledAsTerrain(state.scenario, { ...card, terrain },
        state[side+'Role'] === 'attacker')) return false;
  const mark = { ger:'独', rus:'ソ', us:'米', jpn:'日', uk:'英', ita:'ソ', fra:'独' }[faction];
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
  return group.cards.find(c => ready(c) && !isCrewAssistant(group, c) &&
    carriesScenarioSecondary(c, faction, 'radioHolders') && Boolean(c._radioBroken) === broken) || null;
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

function ordnanceTargets(target, source) {
  const origin = source ? _groupSideIdx(source) : null;
  return attackTargetsOf(target).filter(card => !origin || !card.infiltrating ||
    card.infiltratedGroupSide !== origin.side || card.infiltratedGroupIdx !== origin.idx);
}

function resolveSupportHits(target, targetSide, base=5, radio=false, ordnance=false, flame=false, source=null, hitStrengths=null, mortar=false, concealMod=0) {
  const R = window.INFANTRY_RULES;
  const faction = getFactionKey(state[targetSide]);
  const terrain = target.terrain.filter(card => {
    const type = card.terrain?.type;
    if (flame) return type === 'SMOKE' || type === 'WIRE';
    return !((radio || mortar) && type === 'WOODS') && !(ordnance && type === 'SMOKE');
  });
  const support = Number(window.AFV?.adjacentArmorSupport(target) || 0);
  const firingSlot = source && _groupSideIdx(source);
  const targetSlot = _groupSideIdx(target);
  const attackRange = firingSlot && targetSlot ? R.relativeRangeBetweenGroups(source, target, {
    sameOpposing: firingSlot.idx === targetSlot.idx,
    adjacent: Math.abs(firingSlot.idx - targetSlot.idx) === 1
  }) : null;
  const terrainOpts = {
    japanBuildings: isJapanInGame(),
    isFlank: radio || mortar || Boolean(firingSlot && targetSlot && firingSlot.idx !== targetSlot.idx),
    encircled: Boolean(target.encircled), attackRange, isMortar: mortar, otherStack: source?.terrain
  };
  const terrainMod = (flame ? 0 : jungleFireMod()) + R.calcTerrainMod(terrain, false, terrainOpts);
  const trench = R.getTerrainModBreakdown(terrain, false, terrainOpts).find(item => item.type === 'TRENCH');
  return ordnanceTargets(target, source).filter(card => R.isAlive(card) && (!hitStrengths || hitStrengths.has(card))).flatMap(card => {
    const draw = ccDrawCard(state.currentTurn);
    const def = R.lookupSoldier(card, faction);
    if (!draw || !def) return [];
    const red = draw.terrain.rncColor === '赤';
    const value = Number(draw.terrain.range) || 0;
    const rnc = red ? -value : value;
    const pinned = R.isPinned(card);
    const leadership = commissarModOf(target, card);
    const moraleMod = leadership - R.weaponMoralePenalty(card, def);
    const panicMod = moraleMod - Number(Boolean(target.encircled && pinned));
    let result = radio ? window.AFV?.radioCritical(target, card, red, value) : null;
    const hullDown = ordnance && source && infantryGunProfile(card, targetSide) &&
      window.AFV.isHullDown(target, source);
    const hit = hitStrengths?.get(card) ?? base;
    const infantrySupport = infantryGunProfile(card, targetSide) ? 0 : support;
    const adjusted = def.afv ? hit : hit - infantrySupport + (hullDown ? jungleFireMod() : terrainMod);
    const finalFP = adjusted + personnelDefenseAdjustment(card, targetSide, hullDown || def.afv ? 0 : trench?.mod, concealMod);
    if (!result && def.afv) result = window.AFV.applyExposedCrewHit(card, finalFP + rnc);
    if (!result) {
      const rpc = Number(draw.terrain.dice?.['0r']) || 0;
      const resolution = R.resolveFireOnSoldier(finalFP, rnc, def, pinned,
        rpc, moraleMod, panicMod, 0, R.rpc7wOf(draw), ordnance || radio);
      result = berserkFireResult(resolution, target, card, def, targetSide, rpc);
      if (result === 'WOUND') result = applyWound(card);
      if (result === 'KIA' || result === 'PANIC_KIA') R.killSoldier(card);
      else if (result === 'PANIC_ROUT') R.routSoldier(card);
      else if (result === 'PIN') result = applyPersonnelPin(card);
      if (result !== 'NONE' && def.leader === '分隊長') applySLDamagePenalty(targetSide);
    }
    const defense = def.afv ? {} : R.fireDefenseValues(def, pinned, pinned ? panicMod : moraleMod, 0, ordnance || radio);
    return [{
      name: def.name || card.id, rnc, rncColor: red ? '赤' : '黒', result, finalFP,
      sum: finalFP + rnc, ...defense, wasPinned: pinned
    }];
  });
}

async function resolveRadioMission(side, source, targetIndex, card) {
  return withDeckAttack(() => resolveRadioMissionInProgress(side, source, targetIndex, card));
}

async function resolveRadioMissionInProgress(side, source, targetIndex, card) {
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
    if (defender === 'player') {
      await showAIAction(title, card, source);
      await askPlayerHeroRally(target);
    }
    const conceal = canUseConcealment(target)
      ? (defender === 'player' ? await askPlayerConcealment() : aiUseConcealment()) : [];
    const penalty = Math.max(0, -getConcealMod(conceal, defender));
    const draw = ccDrawCard(state.currentTurn);
    const red = draw?.terrain.rncColor === '赤';
    const value = Number(draw?.terrain.range) || 0;
    if (red && value >= 5) operator._radioBroken = true;
    const success = draw && !red && value >= penalty;
    const status = !draw ? radioText('判定カードなし', 'No resolution card') :
      radioText(red ? '赤' : '黒', red ? 'Red ' : 'Black ') + value + ' · ' +
      (operator._radioBroken ? radioText('無線機故障', 'Radio malfunction') :
        success ? radioText('砲撃成立', 'Fire mission accepted') : radioText('砲撃不成立', 'Fire mission denied'));
    if (success) italianSurrenderAttacked(target);
    const strength = state.scenario?.radioStrength?.[getFactionKey(state[side])] ?? 5;
    const results = success ? resolveSupportHits(target, defender, strength, true) : [];
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
  return withDeckAttack(() => repairRadioInProgress(side, index)) || null;
}

function repairRadioInProgress(side, index) {
  const operator = radioOperator(side, index, true);
  if (!operator) return null;
  const faction = getFactionKey(state[side]);
  const entry = getRepairEntry(faction, '無線機');
  if (!entry) return null;
  const R = window.INFANTRY_RULES;
  radioActionUsed(side, index);
  const wound = R.isWoundActive(operator) ? ccDrawCard(state.currentTurn) : null;
  if (wound?.terrain?.rncColor === '赤') return radioText('負傷で無線機の修理不可', 'Wounded: unable to repair the radio');
  const draw = ccDrawCard(state.currentTurn);
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
