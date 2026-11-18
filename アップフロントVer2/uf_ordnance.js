// §30/§34 対戦車兵器と歩兵砲。
'use strict';

function infantryGunProfile(card, side) {
  return state.scenario?.infantryGuns?.[getFactionKey(state[side])]?.[card.num] || null;
}

function groupHasInfantryGun(group, side) {
  return !!group?.cards?.some(c => infantryGunProfile(c,side) && window.INFANTRY_RULES.isAlive(c));
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
  return group.cards.some(c => rules.isAlive(c) && !infantryGunProfile(c, side) && !window.AFV?.isAfvCard(c));
}

function infantryGunDefense(group, card, side, concealMod = 0) {
  if (!infantryGunProfile(card, side)) return 0;
  const trench = group.terrain.some(t => t._isTrench);
  return Number(trench) - (card._infantryGunUsed ? concealMod : 0);
}

function infantryGunFirstLateral(group, side) {
  if (!groupHasInfantryGun(group,side)) return false;
  const { base, moves } = infantryGunMovement(group);
  return base !== 'PLAIN' && !moves.length;
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
  if (/^対戦車ライフル/.test(name)) weapons.push({ kind:'atr', def });
  if (/^バズーカ/.test(name)) {
    const values = name.match(/(\d+)\s*\/\s*(\d+)/);
    if (values || data) weapons.push({ kind:'rocket', def, armor: Number(values?.[2]), infantry:Number(values?.[1]), ...data });
  }
  if (/^パンツァーシュレック/.test(name)) weapons.push({ kind:'rocket', def, armor:4, infantry:3, ...data });
  if (/^PIAT/i.test(name)) weapons.push({ kind:'piat', def, armor:2, infantry:2, ...data });
  if (ig && def) weapons.push({ kind:'ig', def, ...ig });
  if (faction === 'ger' && !card._panzerfaustSpent && !card.demoCharge &&
      state.scenario?.panzerfaustHolders?.[faction]?.includes(card.num)) {
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

function ordnancePlans(side, source, targetIndex, continuing = false) {
  const own = state.groups[side][source];
  const enemySide = _enemySide(side);
  const target = state.groups[enemySide][targetIndex];
  const R = window.INFANTRY_RULES;
  const acts = side === 'player' ? state.actedGroups : state.aiActedGroups;
  if (state.phase !== 'play' || state.currentTurn !== side || !own || !target ||
      own.eliminated || target.eliminated || isMovingIgnoringOverlays(own) || R.isInStream(own)) return [];
  if (!continuing && (acts?.has(source) || own.firedFPThisTurn > 0 || !partisanActionRoom(side) ||
      (side === 'player' && !window.DISCARD_RULES.canStillAct()) ||
      (side === 'ai' && (state.aiFiredGroups?.has(source) ||
        (state.aiDiscardedThisTurn > window.DISCARD_RULES.turnLimit(getFactionKey(state.ai), (state.aiActionCount || 0) + 1)))))) return [];
  if (!attackTargetsOf(target).some(R.isAlive) || (state.isNight &&
      !(side === 'ai' ? aiCanTargetRecognized(source, targetIndex) : isTargetVisibleForPlayer(own, targetIndex, enemySide)))) return [];
  const targetArmored = window.AFV.isAfvGroup(target);
  const distance = R.relativeRange(own.distance, target.distance);
  if ((R.isInGully(own) && distance !== 5) ||
      (R.isInGully(target) && !R.canFireAtGully(own,distance,{}))) return [];
  return own.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.transfer && !c.infiltrating)
    .flatMap(card => ordnanceWeapons(card, side).flatMap(weapon => {
      if (weapon.kind !== 'faust' && (card.malfunctioned || card.destroyed)) return [];
      if (!targetArmored && (weapon.kind === 'faust' || weapon.kind === 'atr')) return [];
      if (weapon.kind === 'ig' && R.isInMarsh(own)) return [];
      const raw = (weapon.range || weapon.def?.range)?.[distance];
      const crewed = weapon.kind === 'rocket' || (weapon.kind === 'atr' && weapon.def?.needsCrew);
      const pair = own.crewPairs?.[card.num];
      const assistant = own.cards.find(c => c.num === pair && R.isAlive(c) && !R.isPinned(c) && !c.transfer);
      const withoutCrew = crewed && !assistant;
      const harsh = R.isInMarsh(own) || R.hasTerrainType(own,'WIRE');
      if (harsh && crewed && withoutCrew) return [];
      const range = ordnanceFrequency(raw, crewed && (withoutCrew || harsh));
      const effect = weapon.kind === 'atr' ? 0 : targetArmored ? weapon.armor : weapon.infantry;
      if (!range || !Number.isFinite(effect)) return [];
      return [{ own, target, side, enemySide, source, targetIndex, card, weapon, range, effect, distance, withoutCrew }];
    }));
}

const isOrdnanceFireCard = card => /^FIRE\b/.test(card?.terrain?.type || '');

function ordnanceRNC(card) {
  const number = Number(card?.terrain?.range) || 0;
  return { number, red: card?.terrain?.rncColor === '赤' };
}

function ordnanceHitAllowed(plan, judge, conceal) {
  if (!judge) return false;
  const { number, red } = ordnanceRNC(judge);
  const R = window.INFANTRY_RULES;
  const { own, target, side, source, targetIndex, weapon } = plan;
  let high = plan.range[1];
  let low = plan.range[0];
  const move = isMovingIgnoringOverlays(target);
  const afv = window.AFV;
  const hullDown = afv.isAfvGroup(target) && afv.isHullDown(target, own);
  if (weapon.kind === 'atr' && isFlankFire(side, source, targetIndex)) low = Math.max(0, low - 1);
  if (R.hasTerrainType(own,'WIRE') && weapon.kind !== 'rocket') high--;
  if (R.isInMarsh(own) && weapon.kind === 'faust') high--;
  if (weapon.kind === 'ig') high -= plan.card._infantryGunCrewLost || 0;
  if (weapon.kind === 'ig' && state.isNight && !isGroupFlared(target)) high--;
  if (conceal) { high -= conceal; low = Math.min(low, high); }
  return high >= 0 && number >= low && number <= Math.min(6, high) && !(red && (move || hullDown));
}

function ordnanceName(plan) {
  const { weapon } = plan;
  const name = weapon.kind === 'faust' ? radioText('パンツァーファウスト', 'Panzerfaust')
    : weapon.name || weapon.def?.weaponName || weapon.def?.name;
  return '#' + plan.card.num + ' ' + (name || radioText('砲兵器', 'Ordnance'));
}

function sameOrdnance(a, b) {
  return a.card === b.card && a.weapon.kind === b.weapon.kind;
}

// §25.2 同じ目標への射撃を一つの行動として宣言し、兵器・射撃カード・判定は一回ずつ使う。
async function resolveOrdnance(plans, fireCards) {
  if (state.radioResolving || !plans.length || plans.length !== fireCards.length) return false;
  const { side, source, targetIndex } = plans[0];
  const hand = state[side + 'Hand'];
  const available = ordnancePlans(side, source, targetIndex);
  if (new Set(plans.map(p => p.card)).size !== plans.length ||
      new Set(fireCards).size !== fireCards.length ||
      plans.some(p => p.side !== side || p.source !== source || p.targetIndex !== targetIndex ||
        !available.some(candidate => sameOrdnance(candidate, p))) ||
      fireCards.some(card => !hand.includes(card) || !isOrdnanceFireCard(card))) return false;
  state.radioResolving = true;
  try {
    radioActionUsed(side, source);
    for (const [i, selected] of plans.entries()) {
      const plan = (i === 0 ? available : ordnancePlans(side, source, targetIndex, true))
        .find(candidate => sameOrdnance(candidate, selected));
      const fireCard = fireCards[i];
      if (!plan || !hand.includes(fireCard)) break;
      hand.splice(hand.indexOf(fireCard), 1);
      pushTerrainToDiscard(fireCard);
      if (side === 'ai') state.aiHandCount = hand.length;
      if (!await fireOrdnanceShot(plan, fireCard)) break; // §25.3 外れた時点で攻撃終了
    }
    return true;
  } finally {
    state.radioResolving = false;
  }
}

async function fireOrdnanceShot(plan, fireCard) {
  const { side, source, targetIndex, target, enemySide, weapon } = plan;
  if (weapon.kind === 'faust') plan.card._panzerfaustSpent = true;
  if (weapon.kind === 'ig') plan.card._infantryGunUsed = true;
  markFiredAt(plan.own, target);
  const title = ordnanceName(plan) + ' → GROUP ' + target.name;
  if (side === 'ai') await showAIAction(title,fireCard,source);
  const conceal = canUseConcealment(target) && !target.cards.some(c =>
    infantryGunProfile(c,enemySide) && c._infantryGunUsed)
    ? (side === 'ai' ? await askPlayerConcealment() : aiUseConcealment()) : [];
  const judge = ccDrawCard();
  const rnc = ordnanceRNC(judge);
  const malfunction = weapon.kind !== 'faust' && rnc.red &&
    (weapon.kind === 'rocket' ? rnc.number >= (plan.withoutCrew ? 3 : 4) :
      weapon.kind === 'piat' ? rnc.number >= 3 : weapon.kind === 'ig' ? rnc.number >= 5 : rnc.number === 6);
  if (malfunction) plan.card.malfunctioned = true;
  const concealment = Math.abs(getConcealMod(conceal, enemySide));
  const accepted = !malfunction && ordnanceHitAllowed(plan, judge, concealment);
  const results = [];
  if (accepted) {
    const useRange = weapon.kind === 'atr' || (weapon.kind === 'ig' && window.AFV.isAfvGroup(target));
    const zero = { terrain: { range: '0', rncColor: '黒' } };
    const hitBonus = ordnanceHitAllowed(plan, zero, concealment) ? rnc.number : 0;
    const strength = plan.effect + (useRange ? plan.distance : hitBonus);
    if (window.AFV.isAfvGroup(target)) {
      const extra = ccDrawCard();
      if (extra) {
        const roll = ordnanceRNC(extra);
        const signed = roll.red ? -roll.number : roll.number;
        const armor = window.AFV.applyOrdnanceHit(target,plan.own,strength+signed,side,source,targetIndex);
        results.push({ name: armor.name, rnc:signed, sum:strength+signed,
          rncColor: roll.red ? '赤' : '黒', finalFP:strength, result:armor.result });
      }
    } else results.push(...resolveSupportHits(target, enemySide, strength, false, true));
  }
  const status = malfunction ? radioText('故障','Malfunction') : accepted ? radioText('命中','Hit') : radioText('外れ','Miss');
  ufReportLog(side, title + ' · ' + status, side);
  await showFireResultOverlay(title + ' · ' + status, results, [fireCard,...conceal,judge].filter(Boolean));
  cleanupEliminatedGroups(); renderField('player'); renderField('ai'); renderHands(); updateDeckCounts();
  return accepted;
}

async function aiUseOrdnance() {
  if (!hasOrdnance('ai')) return;
  const fireCards = state.aiHand.filter(isOrdnanceFireCard);
  if (!fireCards.length) return;
  const plans = state.groups.ai.flatMap((group,i) =>
    state.groups.player.flatMap((target,j) => ordnancePlans('ai',i,j)));
  plans.sort((a,b) => Number(window.AFV.isAfvGroup(b.target))-Number(window.AFV.isAfvGroup(a.target)) ||
    b.range[1]-a.range[1] || b.effect-a.effect);
  const first = plans[0];
  if (!first) return;
  const sameTarget = plans.filter(p => p.source === first.source && p.targetIndex === first.targetIndex);
  const salvo = sameTarget.filter((p, i) => sameTarget.findIndex(q => q.card === p.card) === i).slice(0, fireCards.length);
  await resolveOrdnance(salvo, fireCards.slice(0, salvo.length));
}

// §34.4 / 28.7 通常射撃に使ったカードで、相対距離5の歩兵砲の防盾も判定する。
function infantryGunBoxedFire(source, target, side, distance, fireCards, baseFP, concealMod, flank) {
  if (distance !== 5 || !groupHasInfantryGun(target, side)) return [];
  const R = window.INFANTRY_RULES;
  const sourceSide = _enemySide(side);
  const enemyFaction = getFactionKey(state[side]);
  const printedNeed = fireCards.filter(isOrdnanceFireCard).reduce((sum, c) =>
    sum + circledToNum((c.terrain.sub || '').match(/FP(.)/)?.[1] || ''), 0);
  const needed = infantryFireNeed(getFactionKey(state[sourceSide]), source, printedNeed);
  const men = source.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.transfer && !c._noFire &&
    !infantryGunProfile(c, sourceSide) && !window.AFV.isAfvCard(c)).length;
  if (!men || needed > men * (flank ? 2 : 1)) return [];

  return target.cards.filter(c => R.isAlive(c) && infantryGunProfile(c, side)).flatMap(card => {
    const def = R.lookupSoldier(card, enemyFaction);
    const judge = def && ccDrawCard();
    if (!judge) return [];
    const { number, red } = ordnanceRNC(judge);
    const pinned = R.isPinned(card);
    const rnc = red ? -number : number;
    const finalFP = baseFP + infantryGunDefense(target, card, side, concealMod);
    const boxed = { ...def, ...def.gunshieldDefense };
    const moraleMod = Number(hasCommissar(target)) - Number(Boolean(card.malfunctioned || card.destroyed));
    const panicMod = moraleMod - Number(Boolean(target.encircled && pinned));
    const rpc = Number(judge.terrain.dice?.['0r']) || 0;
    const { result } = R.resolveFireOnSoldier(finalFP, rnc, boxed, pinned, rpc, moraleMod, panicMod);
    if (result === 'KIA' || result === 'PANIC_KIA') R.killSoldier(card);
    else if (result === 'PANIC_ROUT') R.routSoldier(card);
    else if (result === 'PIN') R.pinSoldier(card);
    const name = def.name + radioText('（防盾）', ' (gun shield)');
    const morale = (Number(pinned ? boxed.panic : boxed.morale) || 0) + (pinned ? panicMod : moraleMod);
    const kia = Number(pinned ? boxed.kiaBack : boxed.kiaFront) || 0;
    return [{ name, rnc, rncColor: red ? '赤' : '黒', result, finalFP, sum: finalFP + rnc, morale, kia, wasPinned: pinned }];
  });
}

function hasOrdnance(side) {
  return !!state.scenario && state.groups[side]?.some(g =>
    g && !g.eliminated && g.cards.some(c => window.INFANTRY_RULES.isAlive(c) && ordnanceWeapons(c,side).length));
}

function updateOrdnanceControls() {
  const button = document.getElementById('btn-ordnance');
  button.hidden = !state.scenario || !hasOrdnance('player');
  button.textContent = radioText('砲兵器射撃', 'Ordnance fire');
}
