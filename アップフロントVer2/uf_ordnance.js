// §30/§34 対戦車兵器と歩兵砲。
'use strict';

function infantryGunProfile(card, side) {
  const faction = getFactionKey(state[side]);
  const number = card.num;
  return state.scenario?.infantryGuns?.[faction]?.[number] ||
    getSoldierDef(faction, number)?.infantryGun || null;
}

function registerOrdnanceCards() {
  if (typeof UF_GUNS_BY_FACTION === 'undefined') return;
  for (const [faction, guns] of Object.entries(UF_GUNS_BY_FACTION)) {
    const list = SOLDIER_CARDS[faction];
    const fac = FACTIONS[faction];
    const prefix = faction === 'rus' ? 'russian' : fac.prefix;
    for (const gun of guns) {
      const index = list.findIndex(def => def.num === gun.number);
      if (index >= 0 && list[index].infantryGun) {
        list[index].isInfantryGun = true;
        continue;
      }
      const definition = {
        num: gun.number, rank: '歩兵砲', name: gun.name, leader: '', weaponCat: '歩兵砲',
        weaponName: gun.name, xVal: gun.xVal, ccvFront: gun.ccvFront, ccvBack: gun.ccvBack,
        morale: gun.morale, kiaFront: gun.kiaFront, kiaBack: gun.kiaBack, panic: gun.panic,
        pt: String(gun.pt), range: Array(6).fill('0'), rangeData: Array.from({ length:6 }, () => ({main:0})),
        needsCrew: false, rncRoute: gun.rncRoute || '0r RNC > 6', gunshieldDefense: gun.boxedDefense,
        imgFront: encPath(`${fac.dir}/${prefix} ${gun.number}f.gif`),
        imgBack: encPath(`${fac.dir}/${prefix} ${gun.number}b.gif`),
        isInfantryGun: true, infantryGun: gun, noteBack: list[index]?.noteBack || '',
      };
      if (index >= 0) list[index] = definition;
      else list.push(definition);
    }
  }
}
registerOrdnanceCards();

function groupHasInfantryGun(group, side) {
  return !!group?.cards?.some(c => window.INFANTRY_RULES.isAlive(c) && infantryGunProfile(c,side));
}

function infantryGunMovement(group) {
  let base = 'PLAIN';
  let moves = [];
  for (const card of group.terrain) {
    const type = card.terrain?.type;
    if (['WIRE','SMOKE','TRENCH'].includes(type)) continue;
    if (type === 'MOVEMENT') moves.push(card);
    else { base = type; moves = []; }
  }
  return { base, moves };
}

function groupCanEntrench(group, side) {
  const rules = window.INFANTRY_RULES;
  return group.cards.some(c => rules.isAlive(c) && !c.transfer && !infantryGunProfile(c, side) && !window.AFV?.isAfvCard(c));
}

function ignoresConcealment(card, side) {
  return Boolean(card._infantryGunUsed && infantryGunProfile(card, side));
}

/** §17.83・§34.5・§36.2 共通の地形修正に対する個人ごとの補正。 */
function personnelDefenseAdjustment(card, side, trenchModifier = 0, concealMod = 0) {
  const R = window.INFANTRY_RULES;
  const noTrench = card.transfer || card.infiltrating || R.isPinned(card) || infantryGunProfile(card, side);
  return (card.transfer ? 2 : 0) - (noTrench ? trenchModifier : 0) -
    (ignoresConcealment(card, side) ? concealMod : 0);
}

function infantryGunFirstLateral(group, side) {
  if (!groupHasInfantryGun(group,side)) return false;
  const { base, moves } = infantryGunMovement(group);
  return base !== 'PLAIN' && !moves.length;
}

function terrainEntryForbidden(group, type, side) {
  if (!['MARSH','PILLBOX','TRENCH'].includes(type)) return false;
  return window.AFV?.isAfvGroup(group) || groupHasInfantryGun(group, side);
}

function infantryGunCanEnter(group,type,side,own=true) {
  if (!groupHasInfantryGun(group,side) || ['WIRE','SMOKE'].includes(type)) return true;
  if (['MARSH','PILLBOX','TRENCH'].includes(type)) return false;
  if (!own) return true;
  const { base, moves } = infantryGunMovement(group);
  return (base === 'PLAIN' && type !== 'HILL') ||
    (moves.length >= 2 && moves[0]._moveMode === 'lateral');
}

function loseInfantryGunCrew(card, side) {
  if (!infantryGunProfile(card,side)) return false;
  card._infantryGunCrewLost = (card._infantryGunCrewLost || 0) + 1;
  return card._infantryGunCrewLost < 3;
}

function tryRallyInfantryGun(group, side, rallyCard) {
  const R = window.INFANTRY_RULES;
  const type = rallyCard.terrain.type;
  if (type === 'RALLY ALL') return null; // 全回復は混成グループの他の兵にも適用する。
  const gun = group.cards.find(c => infantryGunProfile(c, side) && R.isAlive(c) && R.isPinned(c));
  if (!gun) return null;
  if (side === 'player' && group.cards.some(c => c !== gun && R.isAlive(c) && R.isPinned(c)) &&
      !confirm(radioText('歩兵砲の回復に使いますか？', 'Use this card to rally the infantry gun?'))) return null;
  const value = type === 'HERO' ? 1 : Number(type.slice('RALLY '.length)) || 0;
  if (!value) return null;
  return rallyInfantryGun(gun, value);
}

function rallyInfantryGun(gun, value) {
  const R = window.INFANTRY_RULES;
  const total = (gun._infantryGunRally || 0) + value;
  gun._infantryGunRally = total >= 3 ? 0 : total;
  if (total >= 3) R.unpinSoldier(gun);
  return total >= 3 ? radioText('歩兵砲が回復しました。','Infantry gun rallied.') :
    radioText(`歩兵砲の回復 ${total}/3`,`Infantry gun rally ${total}/3`);
}

function ordnanceWeapons(card, side) {
  const faction = getFactionKey(state[side]);
  const def = window.INFANTRY_RULES.lookupSoldier(card, faction);
  const name = def?.weaponCat || '';
  const data = state.scenario?.ordnanceProfiles?.[faction]?.[card.num];
  const ig = infantryGunProfile(card, side);
  const weapons = [];
  for (const gun of window.AFV?.gunProfiles(card) || []) weapons.push({ ...gun, def });
  if (/^火炎放射器/.test(name) && !card.flameDiscarded) weapons.push({ kind:'flame', def });
  if (window.INFANTRY_RULES.isArtillery(name)) weapons.push({ kind:'mortar', def });
  if (/^対戦車ライフル/.test(name)) weapons.push({ kind:'atr', def });
  if (/^バズーカ/.test(name)) {
    const values = name.match(/(\d+)\s*\/\s*(\d+)/);
    if (values || data) weapons.push({ kind:'rocket', def, armor: Number(values?.[2]), infantry:Number(values?.[1]), ...data });
  }
  if (/^パンツァーシュレック/.test(name)) weapons.push({ kind:'rocket', def, armor:4, infantry:3, ...data });
  if (/^PIAT/i.test(name)) weapons.push({ kind:'piat', def, armor:2, infantry:2, ...data });
  if (ig && def) weapons.push({ kind:'ig', def, ...ig });
  if (carriesScenarioSecondary(card, faction, 'panzerfaustHolders')) {
    weapons.push({ kind:'faust', def, armor:5, range:[null,null,null,'0','0-1','0-2'] });
  }
  return weapons;
}

function ordnanceFrequency(text, withoutCrew) {
  const match = /^(\d)(?:-(\d))?(?:\[(\d)(?:-(\d))?\])?/.exec(String(text || '').trim());
  if (!match || (withoutCrew && match[3] == null)) return null;
  if (withoutCrew) return [Number(match[3]), Number(match[4] ?? match[3])];
  return [Number(match[1]), Number(match[2] ?? match[1])];
}

function ordnanceCrewBracket(weapon, group, card) {
  const R = window.INFANTRY_RULES;
  if (weapon.kind !== 'rocket' && !(weapon.kind === 'atr' && weapon.def?.needsCrew)) return false;
  const pair = group.crewPairs?.[card.num];
  const assistant = group.cards.some(c => c.num === pair && R.isAlive(c) && !R.isPinned(c) && !c.transfer);
  const harsh = R.isInMarsh(group) || R.hasTerrainType(group, 'WIRE') || R.isInStream(group);
  if (harsh && !assistant) return null;
  return harsh || !assistant;
}

function ordnanceMalfunction(judge, plan) {
  const { weapon, own, shooter, usesBracket } = plan;
  if (weapon.kind === 'mortar') return checkMortarMalfunction(judge, own, shooter);
  const { red, number } = ordnanceRNC(judge);
  const threshold = weapon.malfunctionAt ?? { rocket: 4, piat: 3, ig: 5 }[weapon.kind] ?? 6;
  return weapon.kind !== 'faust' && red && number >= threshold - Number(Boolean(usesBracket));
}

function ordnancePlans(side, source, targetIndex, continuing = false) {
  const own = state.groups[side][source];
  const enemySide = _enemySide(side);
  const target = state.groups[enemySide][targetIndex];
  const R = window.INFANTRY_RULES;
  const acts = side === 'player' ? state.actedGroups : state.aiActedGroups;
  if (state.phase !== 'play' || state.currentTurn !== side || !own || !target ||
      own.eliminated || target.eliminated || own._stun) return [];
  const moving = !own._immob && !own._bog && isMovingIgnoringOverlays(own);
  const inStream = R.isInStream(own);
  if (!continuing && (acts?.has(source) || own.firedFPThisTurn > 0 || !partisanActionRoom(side) ||
      (side === 'player' && !window.DISCARD_RULES.canStillAct()) ||
      (side === 'ai' && (state.aiFiredGroups?.has(source) ||
        (state.aiDiscardedThisTurn > window.DISCARD_RULES.turnLimit(getFactionKey(state.ai), (state.aiActionCount || 0) + 1)))))) return [];
  if (!ordnanceTargets(target, own).some(R.isAlive) || (state.isNight &&
      !(side === 'ai' ? aiCanTargetRecognized(source, targetIndex) : isTargetVisibleForPlayer(own, targetIndex, enemySide)))) return [];
  if (pillboxRelation(side, source, targetIndex) === 'blocked') return [];
  const targetArmored = window.AFV.isAfvGroup(target);
  const targetHasInfantryGun = groupHasInfantryGun(target, enemySide);
  const distance = R.relativeRangeBetweenGroups(own, target, {
    sameOpposing: source === targetIndex, adjacent: Math.abs(source - targetIndex) === 1
  });
  const lineOfSight = R.gullyFireAllowed(own, target, distance);
  return own.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.transfer && !c.infiltrating)
    .flatMap(card => ordnanceWeapons(card, side).flatMap(weapon => {
      const vehicleWeapon = weapon.kind === 'afv' || weapon.kind === 'afvFlame';
      if (vehicleWeapon ? window.AFV.mainArmamentUnavailable(card, weapon) :
          weapon.kind !== 'faust' && (card.malfunctioned || card.destroyed)) return [];
      if (moving && ((!vehicleWeapon && weapon.kind !== 'flame') || weapon.fixedGun)) return [];
      if (weapon.hullGun && window.AFV.isHullDown(own, target, isFlankFire(enemySide, targetIndex, source))) return [];
      if (weapon.kind === 'mortar') {
        const M = window.MORTAR_RULES;
        if (weapon.def.range?.[distance]?.startsWith('NA') || !M.canFire(own, target).ok) return [];
        const idx = own.cards.indexOf(card);
        const range = ordnanceFrequency(weapon.def.range?.[distance],
          weapon.def.needsCrew && !M.hasAssistant(own, idx));
        if (!range) return [];
        const effect = M.getMortarFP(weapon.def, distance);
        return [{ own, target, side, enemySide, source, targetIndex, card, weapon,
          shooter: { idx, card, def: weapon.def }, range, effect, distance }];
      }
      if (!lineOfSight) return [];
      if (inStream && weapon.kind === 'ig') return [];
      if (weapon.kind === 'afvFlame' || weapon.kind === 'flame') {
        if (weapon.kind === 'flame' && !targetArmored) return [];
        const solo = { ...own, cards: [card] };
        const firepower = weapon.flame?.[distance] ??
          R.calcGroupFirepower(solo, getFactionKey(state[side]), distance, { moving });
        return firepower > 0 ? [{ own, target, side, enemySide, source, targetIndex, card, weapon,
          distance, firepower }] : [];
      }
      if (!targetArmored && (weapon.kind === 'faust' || (weapon.kind === 'atr' && !targetHasInfantryGun))) return [];
      if (weapon.kind === 'ig' && R.isInMarsh(own)) return [];
      const raw = (weapon.range || weapon.def?.range)?.[distance];
      const usesBracket = ordnanceCrewBracket(weapon, own, card);
      if (usesBracket === null) return [];
      const range = ordnanceFrequency(raw, usesBracket);
      const effect = weapon.kind === 'atr' ? 0 : targetArmored ? weapon.armor : weapon.infantry;
      if (!range || !Number.isFinite(effect)) return [];
      const plan = { own, target, side, enemySide, source, targetIndex, card, weapon, range, effect, distance, usesBracket };
      const vehicle = targetArmored && window.AFV.afvCard(target);
      const canTargetCrew = vehicle && !window.AFV.isButtoned(vehicle) && !R.isPinned(vehicle) &&
        Number.isFinite(weapon.infantry) && !['atr','faust'].includes(weapon.kind);
      return canTargetCrew ? [plan, { ...plan, effect: weapon.infantry, againstCrew:true }] : [plan];
    }));
}

const isOrdnanceFireCard = card => /^FIRE\b/.test(card?.terrain?.type || '');

function ordnanceRNC(card) {
  const number = Number(card?.terrain?.range) || 0;
  return { number, red: card?.terrain?.rncColor === '赤' };
}

// §25.6 0–N は上限を動かす。0から命中率が下がる場合は1、2…の単独判定になる。
function shiftOrdnanceHitRange(range, modifier) {
  const [low, high] = range;
  if (low === 0 || low === high) {
    const rank = (low === 0 ? high : -low) + modifier;
    return rank < 0 ? [-rank, -rank] : [0, rank];
  }
  return [low, high + modifier];
}

function ordnanceHitProfile(plan, conceal, hero = false, defendingCard = null) {
  const R = window.INFANTRY_RULES;
  const { own, target, side, source, targetIndex, weapon, card } = plan;
  const night = state.isNight;
  const flanking = isFlankFire(side, source, targetIndex);
  const move = !target._immob && !target._bog && isMovingIgnoringOverlays(target);
  const afv = window.AFV;
  const targetHasGun = defendingCard ? infantryGunProfile(defendingCard, plan.enemySide) :
    target.cards.some(card => infantryGunProfile(card, plan.enemySide));
  const targetIsVehicle = defendingCard ? afv.isAfvCard(defendingCard) : afv.isAfvGroup(target);
  const hullDown = weapon.kind !== 'mortar' && (targetIsVehicle || targetHasGun) &&
    afv.isHullDown(target, own, targetIsVehicle && flanking);
  const firingOnMove = weapon.kind === 'afv' && !own._immob && !own._bog && isMovingIgnoringOverlays(own);
  let modifier = Number(hero) - conceal - Number(Boolean(card.prisoners?.length)) - Number(R.isWoundActive(card));
  if (!night) {
    modifier -= [...own.terrain, ...target.terrain].filter(entry => entry.terrain?.type === 'SMOKE').length;
  }
  if (['ig', 'afv', 'mortar'].includes(weapon.kind) &&
      isAcquiredBy(own, targetIndex, card)) modifier++;
  if (weapon.kind === 'afv') {
    modifier += weapon.hitModifier || 0;
    modifier -= weapon.commanderLost || 0;
    if (firingOnMove && (move || hullDown)) modifier--;
    if (weapon.fixedGun && move) modifier--;
    if (weapon.fixedGun && (own._bog || own._immob)) modifier -= 2;
  }
  if (R.hasTerrainType(own, 'WIRE')) modifier--;
  if ((R.isInMarsh(own) || R.isInStream(own)) && weapon.kind === 'faust') modifier--;
  if (weapon.kind === 'ig') modifier -= card._infantryGunCrewLost || 0;
  if (night && !isGroupFlared(target)) {
    modifier--;
  }
  if (weapon.kind === 'atr' && flanking) modifier++;
  return { range: shiftOrdnanceHitRange(plan.range, modifier), blackOnly: move || hullDown || firingOnMove };
}

function ordnanceHitAllowed(profile, judge) {
  if (!judge) return false;
  const { number, red } = ordnanceRNC(judge);
  const [low, high] = profile.range;
  return number >= low && number <= Math.min(6, high) && !(red && profile.blackOnly);
}

function ordnanceHighGroundBonus(own, target) {
  const R = window.INFANTRY_RULES;
  return Number(R.currentTerrainType(own) === 'HILL' &&
    !['HILL', 'PILLBOX'].includes(R.currentTerrainType(target)));
}

function ordnanceHitStrength(weapon, effect, distance, vehicleTarget, profile, hitNumber) {
  // §25.4・§30.6: 対AFVの歩兵砲・車載砲と対戦車ライフルには相対距離を加える。
  if (weapon.kind === 'atr' || (vehicleTarget && ['ig', 'afv'].includes(weapon.kind))) return effect + distance;
  // §25.43: 黒0で命中できない場合、命中判定の数字は効果に加えない。
  return effect + (ordnanceHitAllowed(profile, { terrain: { range: '0', rncColor: '黒' } }) ? hitNumber : 0);
}

function ordnanceName(plan) {
  const { weapon } = plan;
  const name = weapon.kind === 'faust' ? radioText('パンツァーファウスト', 'Panzerfaust')
    : weapon.name || weapon.def?.weaponName || weapon.def?.name;
  let mode = '';
  if (plan.againstCrew) mode = radioText('（乗員狙い）', ' (exposed crew)');
  else if (window.AFV.isAfvGroup(plan.target)) mode = radioText('（装甲狙い）', ' (armor)');
  return '#' + (weapon.def?.cardNumber ?? plan.card.num) + ' ' + (name || radioText('砲兵器', 'Ordnance')) + mode;
}

function canUseOrdnanceFireCard(plan, card) {
  return isOrdnanceFireCard(card) && (!plan.firepower ||
    (card.fp ?? circledToNum((card.terrain.sub || '').match(/FP(.)/)?.[1] || '')) <= plan.firepower);
}

function sameOrdnance(a, b) {
  return a.card === b.card && a.weapon.kind === b.weapon.kind &&
    Boolean(a.weapon.hullGun) === Boolean(b.weapon.hullGun) && a.againstCrew === b.againstCrew;
}

// §25.2 同じ目標への射撃カードを一度に出し、兵器ごとに命中と効果を判定する。
async function resolveOrdnance(plans, fireCards, confirmPlayer = true) {
  if (state.radioResolving || !plans.length || plans.length !== fireCards.length) return false;
  const { side, source, targetIndex } = plans[0];
  const hand = state[side + 'Hand'];
  const available = ordnancePlans(side, source, targetIndex);
  if (new Set(plans.map(p => p.card)).size !== plans.length ||
      new Set(fireCards).size !== fireCards.length ||
      plans.some(p => p.side !== side || p.source !== source || p.targetIndex !== targetIndex ||
        !available.some(candidate => sameOrdnance(candidate, p))) ||
      fireCards.some((card, i) => !hand.includes(card) || !canUseOrdnanceFireCard(plans[i], card))) return false;
  state.radioResolving = true;
  try {
    return await withDeckAttack(async () => {
      radioActionUsed(side, source);
      for (const card of fireCards) {
        hand.splice(hand.indexOf(card), 1);
        pushTerrainToDiscard(card);
      }
      if (side === 'ai') state.aiHandCount = hand.length;
      for (const [i, selected] of plans.entries()) {
        if (state.phase !== 'play') break;
        const plan = (i === 0 ? available : ordnancePlans(side, source, targetIndex, true))
          .find(candidate => sameOrdnance(candidate, selected));
        if (!plan) continue;
        if (!await fireOrdnanceShot(plan, fireCards[i], side === 'player' && confirmPlayer)) break;
      }
      return true;
    });
  } finally {
    state.radioResolving = false;
  }
}

async function fireOrdnanceShot(plan, fireCard, confirmJudgement = false) {
  const { side, source, targetIndex, target, enemySide, weapon } = plan;
  const title = ordnanceName(plan) + ' → GROUP ' + target.name;
  if (side === 'ai') {
    await showAIAction(title, fireCard, source);
    await askPlayerHeroRally(target, ordnanceTargets(target, plan.own));
  }
  if (weapon.kind === 'afvFlame' || weapon.kind === 'flame') {
    markFiredAt(plan.own, target);
    const R = window.INFANTRY_RULES;
    const conceal = canUseConcealment(target) ?
      (side === 'ai' ? await askPlayerConcealment() : aiUseConcealment()) : [];
    const raw = Number(fireCard.terrain.type.match(/\d+$/)?.[0]) || 0;
    const cardsStrength = halvedFireStrength(raw, false, state.isNight && !isGroupFlared(target));
    const pillboxStrength = pillboxRelation(side, source, targetIndex) === 'half' ?
      Math.floor(cardsStrength / 2) : cardsStrength;
    const attackerMod = R.calcTerrainMod(plan.own.terrain, true, { otherStack: target.terrain });
    const concealMod = getConcealMod(conceal, enemySide);
    const strength = pillboxStrength + attackerMod + concealMod + infantryTerrainFireMod(true) - (weapon.commanderLost || 0);
    const results = [];
    if (window.AFV.isAfvGroup(target)) {
      const cover = target.terrain.filter(card => ['SMOKE','WIRE'].includes(card.terrain?.type));
      const finalFP = strength + R.calcTerrainMod(cover, false);
      const extra = ccDrawCard(side);
      if (extra) {
        const roll = ordnanceRNC(extra);
        const rnc = roll.red ? -roll.number : roll.number;
        const hit = window.AFV.applyOrdnanceHit(target, plan.own, finalFP + rnc, side,
          source, targetIndex, { ignoreTerrain: true, ignoreCrossFire: true });
        results.push({ ...hit, rnc, sum: finalFP + rnc, rncColor: roll.red ? '赤' : '黒', finalFP });
      }
    } else {
      results.push(...resolveSupportHits(target, enemySide, strength, false, false, true, plan.own, null, false, concealMod));
    }
    if (results.some(result => result.rncColor === '赤' && result.rnc <= -5)) {
      if (weapon.kind === 'afvFlame') plan.card._mainGunMalfunctioned = true;
      else plan.card.malfunctioned = true;
    }
    await showFireResultOverlay(title, results, [fireCard, ...conceal]);
    cleanupEliminatedGroups(); renderField('player'); renderField('ai'); renderHands(); updateDeckCounts();
    return true;
  }
  const conceal = canUseConcealment(target, true) ?
    (side === 'ai' ? await askPlayerConcealment() : aiUseConcealment()) : [];
  const concealment = Math.abs(getConcealMod(conceal, enemySide));
  const hero = ['rocket','atr','piat','faust'].includes(weapon.kind) &&
    _useHeroFromHand(side, radioText('ヒーローカードでこの対戦車兵器の命中頻度を1上げますか？',
      'Use a Hero card to improve this weapon’s To Hit frequency by one?'));
  const profile = ordnanceHitProfile(plan, concealment, hero);
  if (confirmJudgement) {
    const [low, high] = profile.range;
    const threshold = `${low === high ? low : low + '–' + high}${profile.blackOnly ? '（黒のみ）' : ''}`;
    if (!confirm(radioText(`命中 ${threshold}。射撃を判定しますか？ 中止しても出した射撃カードと行動は消費します。`,
      `To Hit: ${threshold}. Resolve the shot? The Fire cards played and the action are spent even if you cancel.`))) return false;
  }
  if (weapon.kind === 'afv') window.AFV.stats.gun++;
  if (weapon.kind === 'faust') plan.card._panzerfaustSpent = true;
  if (weapon.kind === 'ig') plan.card._infantryGunUsed = true;
  markFiredAt(plan.own, target);
  const canAcquire = !window.MORTAR_RULES.hasSmoke(plan.own) && !window.MORTAR_RULES.hasSmoke(target);
  const vehicleTarget = window.AFV.isAfvGroup(target);
  // §13.243: この命中判定では、判定カードが風でも射撃開始時の煙幕を使う。
  const targetProfiles = vehicleTarget ? [] : ordnanceTargets(target, plan.own)
    .filter(card => window.INFANTRY_RULES.isAlive(card) &&
      (weapon.kind !== 'atr' || infantryGunProfile(card, enemySide)))
    .map(card => [card, ordnanceHitProfile(plan, ignoresConcealment(card, enemySide) ? 0 : concealment, hero, card)]);
  const judge = ccDrawCard(side);
  const rnc = ordnanceRNC(judge);
  const mortar = weapon.kind === 'mortar';
  const malfunction = ordnanceMalfunction(judge, plan);
  if (malfunction) {
    if (weapon.kind === 'afv') plan.card[weapon.hullGun ? '_hullGunMalfunctioned' : '_mainGunMalfunctioned'] = true;
    else plan.card.malfunctioned = true;
  }
  const hits = malfunction ? [] : targetProfiles.filter(([, hitProfile]) => ordnanceHitAllowed(hitProfile, judge));
  const accepted = !malfunction && (vehicleTarget ? ordnanceHitAllowed(profile, judge) : hits.length > 0);
  if (malfunction) loseAcquisitionForCards([plan.card]);
  else if (judge && ['ig', 'afv', 'mortar'].includes(weapon.kind)) {
    applyGunAcquisition(side, source, targetIndex, plan.card, canAcquire);
  }
  const results = [];
  if (accepted) {
    if (weapon.kind === 'afv') window.AFV.stats.gunHits++;
    const baseEffect = hitProfile =>
      ordnanceHitStrength(weapon, plan.effect, plan.distance, vehicleTarget, hitProfile, rnc.number);
    const elevation = ordnanceHighGroundBonus(plan.own, target);
    const strength = baseEffect(profile) + elevation + (vehicleTarget ? jungleFireMod() : 0);
    if (vehicleTarget) {
      const extra = ccDrawCard(side);
      if (extra) {
        const roll = ordnanceRNC(extra);
        const signed = roll.red ? -roll.number : roll.number;
        const outcome = mortar ?
          mortarVehicleOutcome(target, strength + signed, roll, rnc,
            window.AFV.isHullDown(target, plan.own, isFlankFire(side, source, targetIndex))) :
          window.AFV.applyOrdnanceHit(target, plan.own, strength + signed, side, source, targetIndex,
            { againstCrew: plan.againstCrew });
        const finalFP = strength + outcome.terrainModifier;
        results.push({ name:outcome.name, rnc:signed, sum:finalFP+signed,
          rncColor: roll.red ? '赤' : '黒', finalFP, result:outcome.result });
      }
    } else {
      const strengths = new Map(hits.map(([card, hitProfile]) => [card, baseEffect(hitProfile) + elevation]));
      results.push(...resolveSupportHits(target, enemySide, strength, false, true, false, plan.own, strengths, mortar));
    }
  }
  const status = malfunction ? radioText('故障','Malfunction') : accepted ? radioText('命中','Hit') : radioText('外れ','Miss');
  ufReportLog(side, title + ' · ' + status, side);
  const color = rnc.red ? '赤' : '黒';
  const hitLabel = radioText(`命中判定（山札 ${color}${rnc.number}）`,
    `To hit (draw pile · ${rnc.red ? 'red' : 'black'} ${rnc.number})`);
  const cardLabels = [
    hitLabel,
    ...conceal.map(() => radioText('隠蔽（守備側の手札）', 'Concealment (defender’s hand)')),
  ];
  await showFireResultOverlay(title + ' · ' + status, results, [judge, ...conceal], cardLabels);
  cleanupEliminatedGroups(); renderField('player'); renderField('ai'); renderHands(); updateDeckCounts();
  return true;
}

function mortarVehicleOutcome(target, strength, damageDraw, hitDraw, hullDown = false) {
  const afv = window.AFV;
  const card = afv.afvCard(target);
  const critical = !hitDraw.red && afv.radioCritical(target, card, damageDraw.red, damageDraw.number, hullDown);
  return { name: afv.defOf(card).name, result: critical || afv.applyExposedCrewHit(card, strength), terrainModifier: 0 };
}

async function aiUseOrdnance(acceptPlan = () => true, comparePlans) {
  if (!hasOrdnance('ai')) return;
  const fireCards = state.aiHand.filter(isOrdnanceFireCard);
  if (!fireCards.length) return;
  const plans = state.groups.ai.flatMap((group,i) =>
    state.groups.player.flatMap((target,j) => ordnancePlans('ai',i,j)))
    .filter(plan => acceptPlan(plan) && fireCards.some(card => canUseOrdnanceFireCard(plan, card)));
  plans.sort(comparePlans || ((a,b) => Number(window.AFV.isAfvGroup(b.target))-Number(window.AFV.isAfvGroup(a.target)) ||
    (b.range?.[1] ?? b.distance) - (a.range?.[1] ?? a.distance) ||
    (b.effect ?? b.firepower) - (a.effect ?? a.firepower)));
  const first = plans[0];
  if (!first) return;
  const sameTarget = plans.filter(p => p.source === first.source && p.targetIndex === first.targetIndex);
  const salvo = [];
  const shots = [];
  for (const plan of sameTarget) {
    if (salvo.some(shot => shot.card === plan.card)) continue;
    const fire = fireCards.find(card => !shots.includes(card) && canUseOrdnanceFireCard(plan, card));
    if (!fire) continue;
    salvo.push(plan);
    shots.push(fire);
  }
  return await resolveOrdnance(salvo, shots);
}

// §34.4 / 28.7 通常射撃に使ったカードで、相対距離5の歩兵砲の防盾も判定する。
function infantryGunBoxedFire(source, target, side, distance, fireCards, baseFP, concealMod, flank, trenchModifier, smokeChange = () => 0) {
  if (distance !== 5 || !groupHasInfantryGun(target, side)) return [];
  const R = window.INFANTRY_RULES;
  const sourceSide = _enemySide(side);
  const enemyFaction = getFactionKey(state[side]);
  const printedNeed = fireCards.filter(isOrdnanceFireCard).reduce((sum, c) =>
    sum + circledToNum((c.terrain.sub || '').match(/FP(.)/)?.[1] || ''), 0);
  const needed = infantryFireNeed(getFactionKey(state[sourceSide]), source, printedNeed);
  const men = source.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && (!c.transfer || source.transferFire?.has(c)) && !c._noFire &&
    !infantryGunProfile(c, sourceSide) && !window.AFV.isAfvCard(c)).length;
  if (!men || needed > men * (flank ? 2 : 1)) return [];

  return target.cards.filter(c => R.isAlive(c) && infantryGunProfile(c, side)).flatMap(card => {
    const def = R.lookupSoldier(card, enemyFaction);
    const finalFP = baseFP + smokeChange() + personnelDefenseAdjustment(card, side, trenchModifier, concealMod);
    const judge = def && ccDrawCard(sourceSide);
    if (!judge) return [];
    const { number, red } = ordnanceRNC(judge);
    const pinned = R.isPinned(card);
    const rnc = red ? -number : number;
    const boxed = { ...def, ...def.gunshieldDefense };
    const moraleMod = commissarModOf(target, card) - R.weaponMoralePenalty(card, def);
    const panicMod = moraleMod - Number(Boolean(target.encircled && pinned));
    const rpc = Number(judge.terrain.dice?.['0r']) || 0;
    let { result } = R.resolveFireOnSoldier(finalFP, rnc, boxed, pinned, rpc, moraleMod, panicMod);
    if (result === 'KIA' || result === 'PANIC_KIA') R.killSoldier(card);
    else if (result === 'PANIC_ROUT') R.routSoldier(card);
    else if (result === 'PIN') result = applyPersonnelPin(card);
    const name = def.name + radioText('（防盾）', ' (gun shield)');
    const morale = (Number(pinned ? boxed.panic : boxed.morale) || 0) + (pinned ? panicMod : moraleMod);
    const kia = Number(pinned ? boxed.kiaBack : boxed.kiaFront) || 0;
    return [{ name, rnc, rncColor: red ? '赤' : '黒', result, finalFP, sum: finalFP + rnc, morale, kia, wasPinned: pinned }];
  });
}

// §25.8 米独英の対装甲効果4以上の車両は、その手番の唯一の行動として煙幕を撃てる。
function afvSmokeShooter(group, side) {
  const faction = getFactionKey(state[side]);
  const afv = window.AFV;
  const R = window.INFANTRY_RULES;
  if (!['ger','us','uk'].includes(faction) || !group || group.eliminated || group._stun) return null;
  const card = afv.afvCard(group);
  const gun = card && afv.gunProfile(card);
  if (gun?.kind !== 'afv' || !(gun.armor >= 4) || !R.isAlive(card) ||
      R.isPinned(card) || afv.mainArmamentUnavailable(card)) return null;
  if (gun.fixedGun && !group._immob && !group._bog && isMovingIgnoringOverlays(group)) return null;
  return card;
}

function afvSmokeActionUsed(side) {
  return state.afvSmokeAction?.side === side && state.afvSmokeAction.turn === (state.turnCount || 0);
}

function canFireAfvSmoke(side, sourceIndex, targetSide, targetIndex, smoke) {
  const R = window.INFANTRY_RULES;
  const group = state.groups[side]?.[sourceIndex];
  const target = state.groups[targetSide]?.[targetIndex];
  if (state.phase !== 'play' || state.currentTurn !== side || state.isNight ||
      !target || target.eliminated || !target.cards.some(R.isAlive) || R.isInMarsh(target) ||
      !afvSmokeShooter(group, side) || afvSmokeActionUsed(side) ||
      (state.breezeTurn != null && state.breezeTurn === (state.turnCount || 0)) ||
      smoke?.terrain?.type !== 'SMOKE' || !state[side + 'Hand'].includes(smoke) ||
      !isTerrainHandCard(smoke, side)) return false;
  if (side === 'player' ? (window.DISCARD_RULES.getState().actionCount ||
      state.actedGroups?.size || !window.DISCARD_RULES.canStillAct()) :
      (state.aiActedThisTurn || state.aiActionCount || state.aiActedGroups?.size || state.aiFiredGroups?.size ||
        (state.aiDiscardedThisTurn || 0) > window.DISCARD_RULES.turnLimit(getFactionKey(state.ai), 1))) return false;

  if (target === group) return true;
  if (targetSide !== side && pillboxRelation(side, sourceIndex, targetIndex) === 'blocked') return false;
  const base = targetSide === side ? Math.abs(group.distance - target.distance) :
    R.relativeRange(group.distance, target.distance);
  const distance = Math.max(0, base - Number(Math.abs(sourceIndex - targetIndex) > 1));
  return R.gullyFireAllowed(group, target, distance);
}

function fireAfvSmoke(side, sourceIndex, targetSide, targetIndex, smoke) {
  if (!canFireAfvSmoke(side, sourceIndex, targetSide, targetIndex, smoke)) return false;
  const group = state.groups[side][sourceIndex];
  const target = state.groups[targetSide][targetIndex];
  const hand = state[side + 'Hand'];
  hand.splice(hand.indexOf(smoke), 1);
  loseAfvAcquisitionOnFire(group, target);
  pushTerrainWithFaction(target, smoke);
  state.afvSmokeAction = { side, turn: state.turnCount || 0 };
  radioActionUsed(side, sourceIndex);
  ufReportLog(side, `戦車の煙幕射撃 — GROUP ${group.name} → GROUP ${target.name}`, side);
  return true;
}

async function aiTryAfvSmoke() {
  const smoke = state.aiHand[aiActionCardIndex('SMOKE', (face, card) =>
    isTerrainHandCard({ ...card, terrain: face }, 'ai'))];
  if (!smoke || state.aiActedThisTurn) return false;
  for (const [targetIndex, target] of state.groups.ai.entries()) {
    if (!target || window.MORTAR_RULES.hasSmoke(target) || target.cards.some(window.INFANTRY_RULES.isPinned)) continue;
    const threatened = state.groups.player.some((enemy, index) =>
      enemy && !enemy.eliminated && Math.abs(index - targetIndex) <= 1 &&
      window.INFANTRY_RULES.relativeRange(target.distance, enemy.distance) >= 3);
    if (!threatened) continue;
    const source = state.groups.ai.findIndex((_, index) => index !== targetIndex &&
      canFireAfvSmoke('ai', index, 'ai', targetIndex, smoke));
    if (source < 0 || !fireAfvSmoke('ai', source, 'ai', targetIndex, smoke)) continue;
    renderField('ai');
    renderHands();
    await showAIAction(`AI: 戦車の煙幕射撃 → GROUP ${target.name}`, smoke, source);
    return true;
  }
  return false;
}

function hasOrdnance(side) {
  return !!state.scenario && state.groups[side]?.some(g =>
    g && !g.eliminated && g.cards.some(c => window.INFANTRY_RULES.isAlive(c) && ordnanceWeapons(c,side).length));
}

function updateOrdnanceControls() {
  const button = document.getElementById('btn-ordnance');
  button.hidden = !state.scenario || !hasOrdnance('player');
  button.textContent = radioText('砲兵器射撃', 'Ordnance fire');
  button.title = radioText('主砲や大砲を撃つ。1門につき手札の射撃カード1枚。',
    'Fire a main gun or towed gun. Play one Fire card per gun.');
  const smoke = document.getElementById('btn-afv-smoke');
  smoke.hidden = !state.groups.player.some(group => afvSmokeShooter(group, 'player'));
  smoke.disabled = state.phase !== 'play' || state.currentTurn !== 'player' ||
    !window.DISCARD_RULES.canStillAct() || window.DISCARD_RULES.getState().actionCount > 0 || !!state.actedGroups?.size;
  smoke.textContent = radioText('戦車の煙幕射撃', 'AFV smoke fire');
  smoke.title = radioText('戦車、煙幕カード、煙幕を置くグループを選ぶ。この手番の行動は煙幕射撃のみ。',
    'Choose the vehicle, a Smoke card, and a group. This is the sole action of the turn.');
}
