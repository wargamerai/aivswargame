// uf_afv.js — AFV（§25・§27〜§29）とシナリオE（ユーザーの指示 2026-11-04）
// AFV は「1枚で1グループの兵士」として作り、ふつうの射撃・移動の処理に乗せる。
// 裏面の内部番号は表面に100を足す。従来のセーブ用番号はそのまま使う。
//   KIA・パニックの値は届かない数字にして、撃破は装甲への攻撃（§28.4）か白兵戦（§28.8）だけにする
(function (global) {
  'use strict';
  const DEFS = {
    ger: {
      // シナリオカードEの #30 SPW 251/1（ゲームの中の番号は他の国と同じ 31 のまま）
      name: 'SPW 251/1', pt: 202, ot: true,
      ce: { ovr: 3, ceVal: 9, morale: 5, fp: [8, 9, 10, 11, 12, 13], hit: null, bog: '4c', bogW: '7w', armor: { is: 0, k: 1 }, flank: { is: -1, k: 0 } },
      bu: { ovr: 3, fp: [8, 9, 10, 11, 12, 13], hit: null, bog: '4c', bogW: '7w', armor: { is: 0, k: 1 }, flank: { is: -1, k: 0 } },
      effect: null, x: 'X6',
    },
    rus: {
      name: 'M5 Halftrack', pt: 137, ot: true,
      ce: { ovr: 3, ceVal: 9, morale: 5, fp: [7, 8, 9, 10, 11, 12], hit: null, bog: '4c', bogW: '7w', armor: { is: -1, k: 0 }, flank: { i: -2, s: -1, k: 0 } },
      bu: { ovr: 3, fp: [7, 8, 9, 10, 11, 12], hit: null, bog: '4c', bogW: '7w', armor: { is: -1, k: 0 }, flank: { i: -2, s: -1, k: 0 } },
      effect: null, x: 'X6',
    },
    us: {
      name: 'M3 Halftrack', pt: 141, ot: true,
      ce: { ovr: 3, ceVal: 9, morale: 4, fp: [7, 8, 9, 10, 11, 12], hit: null, bog: '4c', bogW: '7w', armor: { is: -1, k: 0 }, flank: { i: -2, s: -1, k: 0 } },
      bu: { ovr: 3, fp: [7, 8, 9, 10, 11, 12], hit: null, bog: '4c', bogW: '7w', armor: { is: -1, k: 0 }, flank: { i: -2, s: -1, k: 0 } },
      effect: null, x: 'X6',
    },
  };
  const modelByFaction = Object.fromEntries(Object.entries(DEFS).map(([faction, model]) =>
    [faction, new Map([[31, { ...model, number: 31, image: faction === 'ger' ? 30 : 31 }]])]));
  const additional = typeof UF_VEHICLES_BY_FACTION === 'undefined' ? {} : UF_VEHICLES_BY_FACTION;
  for (const [faction, vehicles] of Object.entries(additional)) {
    const models = modelByFaction[faction] ||= new Map();
    for (const vehicle of vehicles) {
      // Ger 31 は従来のセーブでは SPW 251/1。実カード31の SdKfz 231 を別IDにする。
      const number = faction === 'ger' && vehicle.image === 31 ? 1031 : vehicle.image;
      models.set(number, { ...vehicle, number });
    }
  }
  const stats = global.__afvStats = { fire: 0, overrun: 0, overrunKills: 0, gun: 0, gunHits: 0, boxed: 0, killed: 0, buttoned: 0, ck: 0, bog: 0, cc: 0 };

  const factionByPrefix = { Ger:'ger', US:'us', Rus:'rus', russian:'rus', Brit:'uk', Jap:'jpn' };
  function factionOfCard(c) { return factionByPrefix[String(c?.id || '').split(/[ _]/, 1)[0]]; }
  function numOf(c) { const m = String(c && c.id).match(/(\d+)\s*$/); return m ? +m[1] : 0; }
  function defOf(c) {
    const models = modelByFaction[factionOfCard(c)];
    const num = numOf(c);
    return models?.get(num) || models?.get(num - 100);
  }
  function isAfvCard(c) { return Boolean(defOf(c)); }
  function isButtoned(c) { const model = defOf(c); return !!model && numOf(c) === model.number + 100; }
  function isAfvGroup(g) { return !!g?.cards?.some(isAfvCard); }
  function afvCard(g) { return g?.cards?.find(isAfvCard); }
  function sideOf(c) { const d = defOf(c); return isButtoned(c) ? d.bu : d.ce; }
  function gunProfile(c) {
    const model = defOf(c);
    if (!model) return null;
    const side = sideOf(c);
    if (side.flame) return { kind:'afvFlame', name:model.name + ' 火炎放射器', flame:side.flame, commanderLost:ckMod(c) };
    if (!model.effect) return null;
    return { kind:'afv', name:model.name + ' 主砲', armor:model.effect.box, infantry:model.effect.infantry,
      range:side.hit, fixedGun:model.fixedGun, commanderLost:ckMod(c) };
  }
  function ckMod(c) { return (c && c._ck) || 0; }
  function mainArmamentUnavailable(card) {
    return Boolean(card._mainGunMalfunctioned || card._gunGone);
  }

  // ===== 兵士の表に AFV を足す =====
  function inject() {
    const soldiers = global.SOLDIER_CARDS;
    if (!soldiers) return;
    for (const [faction, models] of Object.entries(modelByFaction)) {
      const list = soldiers[faction];
      if (!list) continue;
      const fac = global.FACTIONS[faction];
      const prefix = faction === 'rus' ? 'Rus' : fac.prefix;
      const image = (model, suffix) => encodeURI(`${fac.dir}/${prefix} ${model.image}${suffix}.gif`);
      const printed = new Map(list.map(definition => [definition.cardNumber ?? definition.num, definition]));
      for (const model of models.values()) {
        const index = list.findIndex(def => def.num === model.number);
        if (index >= 0 && list[index].afv) continue;
        const mk = (side, buttoned) => ({
          num: model.number + (buttoned ? 100 : 0), cardNumber: model.image, afvButtoned: buttoned,
          rank: 'AFV', name: model.name + (buttoned ? '（閉鎖）' : ''), ccvFront: '0/0',
          leader: '', weaponCat: 'AFV', xVal: model.mgMalfunction || 'X6', weaponName: 'MG',
          range: side.fp.map(String), rangeData: side.fp.map(value => ({ main: value })),
          needsCrew: false, morale: buttoned ? '' : String(side.morale),
          pt: String(model.pt), kiaFront: '99', panic: '99', ccvBack: '0/0',
          kiaBack: '99', rncRoute: '', imgFront: image(model, buttoned ? 'b' : 'f'),
          imgBack: image(model, 'b'), noteBack: printed.get(model.image)?.noteBack || '', afv: true,
        });
        if (index >= 0) list[index] = mk(model.ce, false);
        else list.push(mk(model.ce, false));
        if (!model.ot || model.number === 31) list.push(mk(model.bu, true));
      }
    }
  }

  // ===== シナリオE =====
  const E = {
    id: 'E', name: '機甲偵察', description: '攻撃側に装甲車が1両つく。距離4で、ピン状態でない4枚が身を隠せる地形に入れば勝ち。時間切れは防御側の勝ち。',
    asymmetric: true, attackerRole: 'player',
    factions: {
      // images/シナリオ/Scenario E.gif のとおり（31 はその国の車両）
      ger: { soldierList: [1, 2, 4, 5, 6, 7, 8, 9, 31] },
      us: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 31] },
      rus: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 31] },
    },
    defenderFactions: {
      ger: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      us: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      rus: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    },
    onlyFactions: ['ger', 'rus', 'us'], // ドイツ・ソ連・アメリカだけ（ユーザーの指示 2026-11-04）
    firstPlayer: 'attacker', deckCycles: 3, handLimits: { ger: 5, us: 6, rus: 4, jpn: 4, uk: 5 }, initialTerrain: null,
    victory: { type: 'reachAndHold', minSoldiers: 4, maxRelativeRange: 4, requireProtectiveTerrain: true, requireNotInfiltrated: true },
    treatAsPlain: ['PILLBOX', 'MINEFIELD'],
    deckRemovals: [{ type: 'BUILDINGS', count: 4, trigger: 'firstDiscard' }],
  };

  // AFV を1枚で1グループにする（§28.11）。グループは4つまで
  function splitAfv(groups) {
    let found = null;
    for (const g of groups) { const c = afvCard(g); if (c) { found = { g, c }; break; } }
    if (!found || found.g.cards.length === 1) return groups;
    found.g.cards = found.g.cards.filter(x => x !== found.c);
    const a = Object.assign({}, found.g, { name: 'T', cards: [found.c], terrain: [], actions: [], crewPairs: {} });
    const out = groups.filter(g => g.cards.length > 0);
    out.push(a);
    while (out.length > 4) { const inf = out.filter(g => !isAfvGroup(g)).sort((x, y) => x.cards.length - y.cards.length); inf[1].cards = inf[1].cards.concat(inf[0].cards); out.splice(out.indexOf(inf[0]), 1); }
    return out;
  }

  // ===== 使い勝手の小道具 =====
  const R = () => global.INFANTRY_RULES;
  const rncOf = j => { const a = parseInt((j.terrain && j.terrain.range) || '0', 10) || 0; return { abs: a, red: j.terrain.rncColor === '赤', v: j.terrain.rncColor === '赤' ? -a : a }; };
  const log = t => { try { if (global.ufEvent) global.ufEvent('sys', t); } catch (e) {} };
  function draw() { return typeof ccDrawCard === 'function' ? ccDrawCard(state.currentTurn) : null; }
  function inFreqList(freq, n) {
    if (!freq) return false; const m = String(freq).split('-').map(Number);
    return m.length === 1 ? n === m[0] : (n >= m[0] && n <= m[1]);
  }
  function shiftFreq(freq, by) { // §25.6
    const order = ['3', '2', '1', '0', '0-1', '0-2', '0-3', '0-4', '0-5', '0-6'];
    const i = order.indexOf(freq); if (i < 0) return freq; return order[Math.max(0, Math.min(order.length - 1, i + by))];
  }
  const isMoving = g => (g.terrain || []).some(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  const hasSidewaysMove = group => group.terrain.some(card =>
    card?.terrain?.type === 'MOVEMENT' && card._moveMode === 'lateral');
  function isHullDown(g, firer, flanking = false) { // §28.9
    if (flanking) return false;
    const terrain = g?.terrain?.findLast(card => card &&
      !['SMOKE', 'WIRE', 'TRENCH'].includes(card.terrain?.type))?.terrain?.type;
    return terrain === 'WALL' || (terrain === 'HILL' && R().currentTerrainType(firer) !== 'HILL');
  }
  function kill(g, c, why) { R().killSoldier(c); stats.killed++; log(`AFV ${defOf(c).name} 撃破（${why}）`); if (typeof cleanupEliminatedGroups === 'function') cleanupEliminatedGroups(); }
  function stopVehicleMovement(group) {
    // §28.441 移動2枚なら1枚目を、移動中の丘・障壁なら地形カードを裏返す。
    const stack = group.terrain || [];
    const moves = stack.filter(card => card.terrain?.type === 'MOVEMENT');
    if (moves.length) {
      const isOverlay = card => ['SMOKE', 'WIRE'].includes(card.terrain?.type);
      const base = stack.findLast(card => card.terrain?.type !== 'MOVEMENT' && !isOverlay(card));
      const flip = moves.at(-2) || (['HILL', 'WALL'].includes(base?.terrain?.type) ? base : null);
      group.terrain = stack.flatMap(card => {
        if (card === flip) return [placedOpenGround(card)];
        if (isOverlay(card) || (moves.length === 1 && card.terrain?.type !== 'MOVEMENT')) return [card];
        pushTerrainToDiscard(card);
        return [];
      });
    }
    delete group._overrunTargets;
    breakFlanksOn(group);
  }
  function immobilize(g, c) {
    if (g._immob) return stun(g, c);
    g._immob = true;
    stopVehicleMovement(g);
    log(`AFV ${defOf(c).name} 移動不能`);
  }
  function stun(g, c) {
    c.pinned = true;
    toButton(c, true);
    stopVehicleMovement(g);
    g._afvRally = 0;
    g._stun = (g._stun || 0) + 1;
    log(`AFV ${defOf(c).name} スタン`);
    if (g._stun >= 3) kill(g, c, 'スタン3回');
  }
  function setHatch(c, closed, silent = false) {
    const model = defOf(c);
    if (!model || model.ot || isButtoned(c) === closed) return;
    if (closed) loseAcquisitionForCards([c]);
    const face = model.number + (closed ? 100 : 0);
    c.num = face;
    c.id = c.id.replace(/\d+\s*$/, String(face));
    const def = R().lookupSoldier(c, factionOfCard(c));
    c.img = def.imgFront;
    c.imgBack = def.imgBack;
    if (closed) stats.buttoned++;
    if (!silent) log(`AFV ${model.name} ハッチを${closed ? '閉じた' : '開いた'}`);
  }
  function toButton(c, silent) { setHatch(c, true, silent); }

  function applySniperHit(card, commanderKilled, useHero = true) {
    const side = _sideOfCard(card);
    if (useHero && !commanderKilled && !R().isPinned(card) && side &&
        (side === 'player' || defOf(card).ot) &&
        _useHeroFromHand(side, `ヒーローカードで ${defOf(card).name} のピン・閉鎖を防ぎますか？`)) return 'NONE';
    if (commanderKilled) {
      card._ck = ckMod(card) + 1;
      stats.ck++;
      log(`AFV ${defOf(card).name} 車長戦死`);
    }
    loseAcquisitionForCards([card]);
    if (!defOf(card).ot) {
      toButton(card);
      return commanderKilled ? 'COMMANDER_KILLED' : 'BUTTONED';
    }
    if (ckMod(card) >= 3) {
      R().killSoldier(card);
      stats.killed++;
      return 'KIA';
    }
    card.pinned = true;
    return commanderKilled ? 'COMMANDER_KILLED' : 'PIN';
  }
  function applyExposedCrewHit(card, strength) {
    const face = sideOf(card);
    if (isButtoned(card) || R().isPinned(card) || !R().isAlive(card) ||
        !Number.isFinite(face.morale) || strength < face.morale) return 'NONE';
    return applySniperHit(card, strength >= face.ceVal);
  }

  // 装甲への攻撃（§28.4）。final=最終の攻撃の強さ
  function armorResult(g, c, final, flank, hullDown) {
    const s = sideOf(c), A = flank ? s.flank : s.armor;
    if (final >= A.k) { kill(g, c, `強さ${final}`); return 'KILL'; }
    if (A.is != null && final === A.is) {
      const j = draw();
      if (j?.terrain.rncColor === '赤' && !hullDown) { immobilize(g, c); return 'IMMOB'; }
      stun(g, c);
      return 'STUN';
    }
    if (A.i != null && final === A.i) {
      if (hullDown || g._immob) { stun(g, c); return 'STUN'; }
      immobilize(g, c);
      return 'IMMOB';
    }
    if (A.s != null && final === A.s) { stun(g, c); return 'STUN'; }
    return 'NONE';
  }
  function adjacentArmorSupport(group, infantryProtectsVehicle = false) {
    const slot = _groupSideIdx(group);
    if (!slot || (!infantryProtectsVehicle && isAfvGroup(group))) return false;
    return [-1, 1].some(offset => {
      const adjacent = state.groups[slot.side][slot.idx + offset];
      if (!adjacent || adjacent.eliminated || adjacent.distance !== group.distance) return false;
      if (infantryProtectsVehicle) return adjacent.cards.some(card => R().isAlive(card) &&
        !isAfvCard(card) && !infantryGunProfile(card, slot.side));
      return isAfvGroup(adjacent) && R().isAlive(afvCard(adjacent));
    });
  }

  // §28.7 オープントップには、距離5の歩兵に固有の対装甲火力 1 がある。射撃カードが使えれば、同じカードで装甲にもう一度
  function boxedAfterFire(src, tgt, need, strength, firingGroup = src) {
    if (isAfvGroup(src)) stats.fire++;
    if (!isAfvGroup(tgt) || !src || isAfvGroup(src)) return;
    const c = afvCard(tgt); if (!defOf(c).ot || !R().isAlive(c)) return;
    const source = _groupSideIdx(src);
    const target = _groupSideIdx(tgt);
    if (!source || !target) return;
    const rr = R().relativeRangeBetweenGroups(src, tgt, {
      sameOpposing: source.idx === target.idx, adjacent: Math.abs(source.idx - target.idx) === 1
    });
    if (rr !== 5) return;
    const faction = getFactionKey(state[source.side]);
    const isFlame = card => /^火炎放射器/.test(R().lookupSoldier(card, faction)?.weaponCat || '');
    const moving = isMovingIgnoringOverlays(src);
    let flamePower = 0;
    let boxedPower = 0;
    for (const card of firingGroup.cards) {
      if (!R().isAlive(card) || R().isPinned(card) || (card.transfer && !firingGroup.transferFire?.has(card)) || card._noFire ||
          infantryGunProfile(card, source.side)) continue;
      if (isFlame(card) && !card.malfunctioned && !card.destroyed && !card.flameDiscarded) {
        flamePower += R().calcGroupFirepower({ ...firingGroup, cards: [card] }, faction, rr, { moving });
      } else boxedPower++;
    }
    boxedPower += flamePower;
    if (!boxedPower || (need || 0) > boxedPower) return;
    const terrain = flamePower
      ? tgt.terrain.filter(card => ['SMOKE', 'WIRE'].includes(card.terrain?.type)) : tgt.terrain;
    const tem = R().calcTerrainMod(terrain, false, {
      isFlank: source.idx !== target.idx, encircled: Boolean(tgt.encircled), ignoreMovement: true
    });
    const flanking = isFlankFire(source.side, source.idx, target.idx);
    const hullDown = isHullDown(tgt, src, flanking);
    const friendly = adjacentArmorSupport(tgt, true) ? 1 : 0;
    const finalFP = (strength || 0) + (hullDown ? 0 : tem) - friendly;
    const judge = draw();
    if (!judge) return;
    const rn = rncOf(judge);
    const sum = finalFP + rn.v;
    stats.boxed++;
    const result = armorResult(tgt, c, sum, false, hullDown);
    showJudgeCard(judge);
    return { name: defOf(c).name + radioText('（装甲）', ' (armor)'), rnc: rn.v,
      rncColor: rn.red ? '赤' : '黒', result: result === 'KILL' ? 'KIA' : result, finalFP, sum };
  }
  // ===== オーバーラン（§29）=====
  function canOverrun(g) {
    if (!isAfvGroup(g) || g.eliminated || g.pendingShift || g._immob || g._bog || g._stun) return false;
    const rules = R();
    if (rules.isInStream(g) && !rules.hasCrossedStream(g) ||
        rules.hasTerrainType(g, 'MINEFIELD') || rules.hasTerrainType(g, 'WIRE')) return false;
    const card = afvCard(g);
    const face = sideOf(card);
    const canUseMachineGun = !card.malfunctioned && !card.destroyed && face.fp.some(Boolean);
    const canUseFlame = face.flame && !mainArmamentUnavailable(card);
    return face.ovr > 0 && R().isAlive(card) && !R().isPinned(card) &&
      Boolean(canUseMachineGun || canUseFlame);
  }
  function overrunTargets(g, gi, enemySide) {
    const out = [];
    (state.groups[enemySide] || []).forEach((t, ti) => {
      if (!t || t.eliminated || isAfvGroup(t) || Math.abs(ti - gi) > 1) return;
      if (R().relativeRange(g.distance, t.distance) !== 5) return;
      if (!isTargetVisibleForPlayer(g, ti, enemySide)) return;
      if (state.scenario?.jungleMode && R().currentTerrainType(t) === 'WOODS' &&
          t.terrain.some(card => card.terrain?.denseJungle)) return;
      if (R().isInMarsh(t) || R().hasTerrainType(t, 'MINEFIELD') || R().currentTerrainType(t) === 'PILLBOX') return;
      if (!t.cards.some(x => R().isAlive(x))) return;
      out.push({ t, ti });
    });
    return out;
  }

  /** §29.2 側面移動でオーバーランする場合は、隣接グループの側面を指定できる。 */
  function chooseOverrunFlank(side, source, overrunTarget, card) {
    if (card.terrain.sub !== '側面') return null;
    const enemies = state.groups[_enemySide(side)];
    const choices = [source - 1, source + 1].filter(index =>
      enemies[index] && !hasPillbox(enemies[index]) && !cardFlankBlockReason(side, source, index));
    if (!choices.length) return null;
    if (side === 'ai') return choices.includes(overrunTarget) ? overrunTarget : choices[0];
    const options = choices.map((index, i) => `${i + 1}: GROUP ${enemies[index].name}`);
    const answer = prompt(radioText('あわせて側面を取る敵を選んでください。0で側面を取らずに進みます。',
      'Choose a group to flank as part of the overrun. Enter 0 to overrun only.') + '\n' + options.join('\n'), '0');
    return choices[Number(answer) - 1] ?? null;
  }
  // §31 自作シナリオは antiTankMines[faction] に所持者の兵士番号を指定できる。
  function hasMagneticMine(card, side) {
    const faction = getFactionKey(state[side]);
    return (faction === 'ger' || faction === 'rus') && !card._magneticMineSpent &&
      carriesScenarioSecondary(card, faction, 'antiTankMines');
  }

  function tryMagneticMineAgainstOverrun(man, defendingSide, vehicleGroup, vehicle, attackRoll) {
    const rules = R();
    if (!attackRoll.red || !rules.isAlive(man) || !hasMagneticMine(man, defendingSide)) return null;
    const name = rules.lookupSoldier(man, getFactionKey(state[defendingSide]))?.name || man.id;
    if (rules.isPinned(man)) {
      if (!_useHeroFromHand(defendingSide, radioText(
        `${name} をヒーローで回復させ、対戦車磁気地雷で反撃しますか？`,
        `Use a Hero to rally ${name} and counterattack with an ATMM?`))) return null;
      rules.unpinSoldier(man);
      man.heroRecovery = true;
    } else if (defendingSide === 'player' && !confirm(radioText(
      `${name} は対戦車磁気地雷で反撃しますか？`, `Counterattack with ${name}’s ATMM?`))) {
      return null;
    }
    const judge = draw();
    if (!judge || rncOf(judge).red) return null;
    const column = isButtoned(vehicle) ? '2b' : defOf(vehicle).ot ? '5o' : '4c';
    if (judge.terrain.diceColor?.[column] !== '赤') return null;
    const rpc = judge.terrain.dice?.['0r'];
    if (rpc === '' || rpc == null || !/^\d$/.test(String(rpc))) return null;
    const value = Number(rpc);
    man._magneticMineSpent = true;
    if (value === 0 || value >= 6) {
      kill(vehicleGroup, vehicle, '対戦車磁気地雷');
      return 'KIA';
    }
    immobilize(vehicleGroup, vehicle);
    return 'IMMOB';
  }

  function overrunStrength(card) {
    const face = sideOf(card);
    const degraded = mainArmamentUnavailable(card) || card.malfunctioned || card.destroyed;
    return Math.floor(Math.max(0, face.ovr - ckMod(card)) / (degraded ? (face.flame ? 4 : 2) : 1));
  }

  async function overrun(g, t, moveCard, tgtKey, side, flank) {
    return withDeckAttack(() => overrunInProgress(g, t, moveCard, tgtKey, side, flank));
  }

  async function overrunInProgress(g, t, moveCard, tgtKey, side, flank) {
    const c = afvCard(g), s = sideOf(c), dd = defOf(c), Rr = R();
    const defendingSide = side === 'player' ? 'ai' : 'player';
    const ground = Rr.currentTerrainType(t);
    const wire = Rr.hasTerrainType(t, 'WIRE');
    const risky = ['BRUSH','BUILDINGS','WALL','WOODS'].includes(ground) || Rr.hasTerrainType(t, 'SMOKE');
    const bogRisk = wire || ['GULLY','WOODS','STREAM'].includes(ground);
    const useFlame = Boolean(s.flame && !mainArmamentUnavailable(c));
    const terrainModifiers = useFlame ? [] : Rr.getTerrainModBreakdown(t.terrain, false);
    const tem = terrainModifiers.reduce((sum, item) => sum + item.mod, 0);
    const trenchModifier = terrainModifiers.find(item => item.type === 'TRENCH')?.mod;
    moveCard._moveMode = 'lateral';
    pushTerrainWithFaction(g, moveCard);
    // §29.43 強度や隠蔽より先にスタックを判定する。鉄条網にはカードのw列を使う。
    if (g._bog || (bogRisk && !state.scenario?.jungleMode && checkBog(g, c, wire))) {
      return { results: [], bogged: true };
    }
    const j = draw();
    if (!j) return { results: [], final: 0 };
    const rn = rncOf(j);
    const strength = overrunStrength(c) + rn.abs;
    const conceal = canUseConcealment(t) ?
      (defendingSide === 'player' ? await askPlayerConcealment() : aiUseConcealment()) : [];
    const concealMod = getConcealMod(conceal, defendingSide);
    const support = Number(adjacentArmorSupport(t));
    const final = strength + tem + jungleFireMod() - support + concealMod;
    markFiredAt(g, t);
    stats.overrun++;
    const defenders = attackTargetsOf(t).filter(Rr.isAlive);
    const hero = defendingSide === 'player'
      ? defenders.find(man => !infantryGunProfile(man, defendingSide) &&
          _useHeroFromHand(defendingSide, `ヒーローカードで ${Rr.lookupSoldier(man, tgtKey)?.name || man.id} をオーバーランから守りますか？`))
      : defenders.find(man => Rr.isPinned(man) && !infantryGunProfile(man, defendingSide) &&
          _useHeroFromHand(defendingSide));
    if (hero) Rr.unpinSoldier(hero);
    const results = [];
    for (const man of defenders) {
      if (!Rr.isAlive(man)) continue;
      const jj = draw(); if (!jj) break;
      const r2 = rncOf(jj), rpc = parseInt(jj.terrain.dice && jj.terrain.dice['0r'], 10) || 0;
      const def = Rr.lookupSoldier(man, tgtKey), was = Rr.isPinned(man);
      const signed = r2.v - Number(man === hero);
      if (risky && !was) { // §29.41-.42
        if (signed <= -6) { immobilize(g, c); break; }
        if (dd.ot && signed === -5) { kill(g, c, 'オーバーラン'); break; }
      }
      const gunSupportCorrection = infantryGunProfile(man, defendingSide) ? support : 0;
      const adjustment = personnelDefenseAdjustment(man, defendingSide, trenchModifier, concealMod) + gunSupportCorrection;
      const moraleMod = commissarModOf(t, man) - Rr.weaponMoralePenalty(man, def);
      const panicMod = moraleMod - Number(Boolean(t.encircled && was));
      const res = Rr.resolveFireOnSoldier(final + adjustment, signed, def, was, rpc,
        moraleMod, panicMod, 0, Rr.rpc7wOf(jj));
      res.result = berserkFireResult(res, t, man, def, defendingSide, rpc);
      if (r2.red && (useFlame ? r2.abs >= 5 : r2.abs === 6)) {
        if (useFlame) c._mainGunMalfunctioned = true;
        else c.malfunctioned = true;
      }
      if (res.result === 'WOUND') { res.result = typeof applyWound === 'function' ? applyWound(man) : 'NONE'; }
      if (res.result === 'KIA' || res.result === 'PANIC_KIA') { Rr.killSoldier(man); stats.overrunKills++; }
      else if (res.result === 'PANIC_ROUT') { Rr.routSoldier(man); stats.overrunKills++; }
      else if (res.result === 'PIN') res.result = applyPersonnelPin(man);
      results.push({ name: def ? def.name : man.id, result: res.result, rnc: signed });
      const counter = tryMagneticMineAgainstOverrun(man, defendingSide, g, c, r2);
      if (counter) {
        results.push({ name: defOf(c).name + '（対戦車磁気地雷）', result: counter });
        break;
      }
    }
    if (Rr.isAlive(c) && !g._immob && !g._bog) {
      const targets = g._overrunTargets ||= [];
      if (!targets.includes(t)) targets.push(t);
      const source = state.groups[side].indexOf(g);
      if (flank != null && g.terrain.includes(moveCard) && !cardFlankBlockReason(side, source, flank)) {
        g.flankingTarget = flank;
        g.flankCard = moveCard;
      }
    }
    if (typeof cleanupEliminatedGroups === 'function') cleanupEliminatedGroups();
    log(`オーバーラン 強さ${final} ${results.map(r => r.name + ':' + r.result).join(' ')}`);
    return { results, final };
  }
  // ===== スタック（§28.53）=====
  function checkBog(g, c, wire = false) {
    const s = sideOf(c), col = wire ? s.bogW : s.bog;
    const j = draw(); if (!j || !j.terrain.diceColor) return false;
    if (j.terrain.diceColor[col] === '赤') {
      g._bog = true;
      stopVehicleMovement(g);
      stats.bog++;
      log(`AFV ${defOf(c).name} スタック`);
      return true;
    }
    return false;
  }
  function closeCombatColumn(card) {
    return isButtoned(card) || R().isPinned(card) ? 2 : defOf(card).ot ? 5 : 4;
  }

  function canAttackVehicleInCloseCombat(card, side) {
    const faction = getFactionKey(state[side]);
    return R().isAlive(card) && (!R().isPinned(card) || card.berserk) && !card.transfer && !isAfvCard(card) &&
      !infantryGunProfile(card, side) && (hasPrimaryWeapon(card, faction) || card.demoCharge ||
        hasMagneticMine(card, side) || carriesScenarioSecondary(card, faction, 'panzerfaustHolders'));
  }

  async function resolveVehicleCloseCombat(source, target, side, berserkAttacker = null) {
    return withDeckAttack(() => resolveVehicleCloseCombatInProgress(source, target, side, berserkAttacker));
  }

  async function resolveVehicleCloseCombatInProgress(source, target, side, berserkAttacker) {
    const c = afvCard(target), model = defOf(c);
    if (!model || !R().isAlive(c)) return [];
    const slot = _groupSideIdx(target);
    if (!slot) return [];
    const attackers = berserkAttacker ? [berserkAttacker] : source.cards.filter(card => card.infiltrating && card.infiltratedThisTurn &&
      card.infiltratedGroupSide === slot.side && card.infiltratedGroupIdx === slot.idx);
    const troops = [...attackers];
    const results = [];
    const turn = state.turnCount || 0;
    if (target._vehicleCc?.turn !== turn) target._vehicleCc = { turn, attacks: 0 };
    while (troops.length && R().isAlive(c)) {
      const nameOf = card => R().lookupSoldier(card, getFactionKey(state[side]))?.name || card.id;
      let index = 0;
      if (side === 'player' && troops.length > 1) {
        const selected = prompt('先に攻撃する兵士を選んでください。\n' +
          troops.map((card, i) => `${i + 1}: ${nameOf(card)}`).join('\n'), '1');
        index = Number(selected) - 1;
        if (!troops[index]) index = 0;
      }
      const [attacker] = troops.splice(index, 1);
      if (!canAttackVehicleInCloseCombat(attacker, side)) continue;
      const drawn = draw();
      if (!drawn) break;
      const judge = rncOf(drawn);
      const terrain = R().currentTerrainType(target);
      const terrainBonus = terrain === 'BUILDINGS' ? 3 :
        ['WOODS','WALL','GULLY'].includes(terrain) ? 2 : Number(terrain === 'BRUSH');
      const infantrySupport = [-1, 1].filter(offset => {
        const group = state.groups[slot.side][slot.idx + offset];
        return group && group.distance === target.distance && group.cards.some(card =>
          R().isAlive(card) && !R().isPinned(card) && !isAfvCard(card) && !infantryGunProfile(card, slot.side));
      }).length;
      const closed = isButtoned(c);
      const smoke = state.isNight ? 0 : target.terrain.filter(card => card.terrain?.type === 'SMOKE').length;
      const hatch = closed ? 1 : R().isPinned(c) ? 0 : -1;
      let strength = judge.v + target._vehicleCc.attacks + terrainBonus + smoke - 2 * infantrySupport +
        2 * ckMod(c) + hatch + (target._immob || target._bog ? 2 : 0) + (model.ot ? 3 : 0);
      target._vehicleCc.attacks++;
      if (getFactionKey(state[side]) === 'jpn') strength++;
      if (R().isWoundActive(attacker)) strength -= 2;
      if (attacker.berserk) strength -= 3;
      if (hasMagneticMine(attacker, side) &&
          (side === 'ai' || confirm(`${nameOf(attacker)} の対戦車磁気地雷を使いますか？`))) {
        strength += 4;
        attacker._magneticMineSpent = true;
      } else if (attacker.demoCharge && (side === 'ai' || confirm(`${nameOf(attacker)} の爆薬を使いますか？`))) {
        strength += 4;
        attacker.demoCharge = false;
      }
      if (attacker._ccRetryHeroTurn === turn || ((side === 'player' || (strength >= 3 && strength < 7)) &&
          _useHeroFromHand(side, `${nameOf(attacker)} の対車両白兵戦にヒーローカードを使いますか？`))) strength++;
      stats.cc++;
      let result = 'NONE';
      if (strength >= 7) { kill(target, c, '白兵戦'); result = 'KIA'; }
      else if (strength === 6) { immobilize(target, c); result = 'IMMOB'; }
      else if (strength <= 0) { R().killSoldier(attacker); result = 'ATTACKER_KIA'; }
      attacker.berserk = false;
      clearSoldierAfterVehicleCombat(attacker);
      results.push({ name: nameOf(attacker), finalFP: strength - judge.v,
        rnc: judge.v, rncColor: judge.red ? '赤' : '黒', sum: strength, result, card: drawn });
    }
    for (const card of attackers) clearSoldierAfterVehicleCombat(card);
    if (results.length) await showFireResultOverlay(`対車両白兵戦 — ${source.name} → ${target.name}`,
      results, results.map(result => result.card));
    cleanupEliminatedGroups();
    return results;
  }

  function clearSoldierAfterVehicleCombat(card) {
    if (card.infiltrating) global.CC_ACTION.clearSoldierInfiltration(card);
    card.infiltratedThisTurn = false;
  }
  // ===== AI の判断 =====
  function canTryUnbog(group) {
    const card = afvCard(group);
    return Boolean(group?._bog && !group._stun && !group.eliminated && R().isAlive(card) && !R().isPinned(card));
  }

  /** §28.53 移動カードを捨てて判定する。地形スタックに移動カードは置かない。 */
  function tryUnbog(group, movement, side) {
    pushTerrainToDiscard(movement);
    const judge = ccDrawCard(side);
    const success = judge?.terrain.rncColor === '黒';
    if (success) group._bog = false;
    return { success, judge };
  }

  async function aiTryUnbog() {
    const acted = state.aiActedGroups || new Set();
    const gi = state.groups.ai.findIndex((g, i) =>
      !acted.has(i) && !state.aiFiredGroups?.has(i) && canTryUnbog(g));
    if (gi < 0) return false;
    const mi = aiActionCardIndex('MOVEMENT'); if (mi < 0) return false;
    const g = state.groups.ai[gi];
    const { success, judge } = tryUnbog(g, state.aiHand.splice(mi, 1)[0], 'ai');
    state.aiHandCount = state.aiHand.length;
    acted.add(gi);
    if (typeof renderField === 'function') { renderField('ai'); renderHands && renderHands(); }
    if (typeof showAIAction === 'function') {
      await showAIAction(success ? 'AI: スタック脱出成功' : 'AI: スタック脱出失敗', judge, gi);
    }
    return true;
  }
  async function aiTryGun() {
    return typeof aiUseOrdnance === 'function' &&
      await aiUseOrdnance(plan => isAfvCard(plan.card));
  }
  // 重み: オーバーランの価値。研究用に差し替えられる
  const POL = global.AFV_POLICY = Object.assign({ overrunMinMen: 2, overrunMaxTem: 0, advance: 'normal' }, global.AFV_POLICY || {});
  async function aiTryOverrun() {
    const mi = aiActionCardIndex('MOVEMENT'); if (mi < 0) return false;
    const acted = state.aiActedGroups || new Set(), fired = state.aiFiredGroups || new Set();
    const key = (typeof getFactionKey === 'function') ? getFactionKey(state.player) : 'us';
    for (let gi = 0; gi < state.groups.ai.length; gi++) {
      const g = state.groups.ai[gi];
      if (acted.has(gi) || fired.has(gi) || !canOverrun(g)) continue;
      let c = overrunTargets(g, gi, 'player').map(x => ({ ...x, men: x.t.cards.filter(m => R().isAlive(m)).length, tem: R().calcTerrainMod(x.t.terrain, false, {}) || 0 }));
      if (global.__inChart) {
        // チャート（2026-11-08 ユーザーの指示: ルールどおり）: 人数・地形で止めない。相手は当たりやすい方（1人あたりのピン以上の見込み）、同じなら人数の多い方
        const ovr = overrunStrength(afvCard(g));
        const ABS = [43, 37, 28, 22, 16, 10, 6], SG = { '-6': 3, '-5': 5, '-4': 8, '-3': 11, '-2': 14, '-1': 19, '0': 43, '1': 18, '2': 14, '3': 11, '4': 8, '5': 5, '6': 3 };
        const pGE = need => Object.keys(SG).reduce((t, k) => t + (+k >= need ? SG[k] : 0), 0) / 162;
        const prob = x => { const mv = isMoving(x.t) ? 1 : 0; const men = x.t.cards.filter(m => R().isAlive(m)); if (!men.length) return 0;
          return men.reduce((t, m) => { const d = R().lookupSoldier(m, key) || {}; const th = R().isPinned(m) ? (parseInt(d.panic, 10) || 99) : (parseInt(d.morale, 10) || 99);
            return t + ABS.reduce((u, n, a) => u + (n / 162) * pGE(th - (ovr + a + x.tem + mv)), 0); }, 0) / men.length; };
        c = c.map(x => ({ ...x, p: prob(x) })).sort((p, q) => (q.p - p.p) || (q.men - p.men));
      } else c = c.filter(x => x.men >= POL.overrunMinMen && x.tem >= -POL.overrunMaxTem - 1).sort((p, q) => (q.men + q.tem) - (p.men + p.tem));
      if (!c.length) continue;
      const mv = state.aiHand.splice(mi, 1)[0]; state.aiHandCount = state.aiHand.length;
      const flank = chooseOverrunFlank('ai', gi, c[0].ti, mv);
      await overrun(g, c[0].t, mv, key, 'ai', flank);
      acted.add(gi);
      if (typeof renderField === 'function') { renderField('ai'); renderField('player'); }
      if (typeof showAIAction === 'function') await showAIAction('AI: オーバーラン', null, gi);
      return true;
    }
    return false;
  }
  async function aiTryAfvRally() { return false; }
  function canHeroOpenHatch(group) {
    const card = afvCard(group);
    return Boolean(card && R().isAlive(card) && isButtoned(card) && !group._stun && !ckMod(card));
  }

  // §28.42/28.45 スタン除去とピン解除には別々の回復値が必要。
  global.afvRallyCredit = function (g, rallyCard) {
    const c = afvCard(g);
    if (!c || !R().isAlive(c)) return null;
    const type = rallyCard?.terrain?.type;
    const name = defOf(c).name;
    if (type === 'HERO' && canHeroOpenHatch(g) && !R().isPinned(c)) {
      setHatch(c, false);
      return { rallied: true, name, message: `${name} のハッチを開きました。` };
    }
    if (!R().isPinned(c) && !g._stun) return null;
    const value = type === 'RALLY ALL' ? 9 : type === 'HERO' ? 1 :
      Number(/^RALLY (\d+)$/.exec(type || '')?.[1]);
    if (!value) return null;
    const total = (g._afvRally || 0) + value;
    const before = g._stun || 0;
    if (before && total >= 3) {
      const reduction = Math.min(before, Math.floor(total / 3));
      g._stun = before - reduction;
      g._afvRally = 0;
      if (g._stun) return { rallied: false, total, name, message: `${name} はスタン3まで回復しました。` };
      if (defOf(c).ot && total < before * 3 + 3) {
        return { rallied: false, total, name, message: `${name} のスタンは解除され、ピン状態が残っています。` };
      }
    }
    const rallied = !g._stun && total >= 3;
    g._afvRally = rallied ? 0 : total;
    if (rallied) R().unpinSoldier(c);
    const message = rallied ? `${name} が回復しました。` :
      `${name} に回復を積みました（${g._afvRally}/3）。`;
    return { rallied, total, name, message };
  };
  async function aiTryCCAfv() {
    for (const [gi, source] of state.groups.ai.entries()) {
      if (!source || source.eliminated || state.aiActedGroups?.has(gi) || state.aiFiredGroups?.has(gi)) continue;
      const targetIndex = state.groups.player.findIndex((target, ti) => target && !target.eliminated &&
        isAfvGroup(target) && aiCanTargetRecognized(gi, ti) &&
        global.CC_ACTION.canAttemptInfiltration(source, target, 'ai').ok);
      if (targetIndex < 0) continue;
      const result = await global.CC_ACTION.aiExecuteInfiltration(source, gi, state.groups.player[targetIndex],
        'player', targetIndex, ccDrawCard, getFactionKey(state.ai));
      if (!result.actionUsed) continue;
      (state.aiActedGroups ||= new Set()).add(gi);
      state.aiHandCount = state.aiHand.length;
      renderField('ai'); renderField('player'); renderHands();
      return true;
    }
    return false;
  }
  // ===== 人が動かす時の操作 =====
  function humanPanel() {
    let el = document.getElementById('afvPanel');
    if (!state || !state.scenario || state.phase !== 'play' || state.currentTurn !== 'player') { if (el) el.style.display = 'none'; return; }
    const gs = state.groups.player || [];
    const vehicles = gs.flatMap((group, index) => isAfvGroup(group) && !group.eliminated ? [index] : []);
    const gi = vehicles.includes(state.playerAfvGroup) ? state.playerAfvGroup : (vehicles[0] ?? -1);
    state.playerAfvGroup = gi;
    const enemyAfv = (state.groups.ai || []).findIndex(g => isAfvGroup(g) && !g.eliminated);
    if (gi < 0 && enemyAfv < 0) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'afvPanel';
      el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:900;background:#1b1f14;border:1px solid #887;padding:6px 8px;color:#eee;font-size:13px;border-radius:4px';
      document.body.appendChild(el);
    }
    el.style.display = '';
    const c = gi >= 0 ? afvCard(gs[gi]) : null;
    const picker = vehicles.length < 2 ? '' : `<label>操作する車両
      <select aria-label="操作する車両" onchange="state.playerAfvGroup=Number(this.value);AFV.humanPanel()">
      ${vehicles.map(i => `<option value="${i}" ${i === gi ? 'selected' : ''}>${gs[i].name} ${defOf(afvCard(gs[i])).name}</option>`).join('')}
      </select></label><br>`;
    const status = c ? [
      isButtoned(c) ? '閉鎖' : '乗員露出',
      gs[gi]._immob && '移動不能',
      gs[gi]._bog && 'スタック',
      gs[gi]._stun && 'スタン',
      c._ck && '車長戦死',
    ].filter(Boolean).map(label => `<span>${label}</span>`).join(' · ') : '';
    const buttons = (c ? `<b>${defOf(c).name}</b> ${status}<br>
      ${sideOf(c).ovr ? '<button onclick="AFV.uiOverrun()">オーバーラン</button> ' : ''}
      ${gunProfile(c) ? '<button onclick="AFV.uiGun()">主砲・火炎放射</button> ' : ''}
      ${canTryUnbog(gs[gi]) ? '<button onclick="AFV.uiUnbog()">スタック脱出</button> ' : ''}
      ${!defOf(c).ot && !R().isPinned(c) && (!isButtoned(c) ||
        (canHeroOpenHatch(gs[gi]) && state.playerHand.some(card => card.terrain?.type === 'HERO')))
        ? `<button onclick="AFV.uiButton()">${isButtoned(c) ? 'ヒーローでハッチを開く' : 'ハッチを閉じる'}</button> ` : ''}` : '')
      + (enemyAfv >= 0 ? '<button onclick="AFV.uiCC()">AFV へ肉薄</button>' : '');
    const content = picker + buttons;
    if (el._afvContent !== content) {
      el.innerHTML = content;
      el._afvContent = content;
    }
  }
  function uiAfterAction() { if (typeof renderField === 'function') { renderField('player'); renderField('ai'); } if (typeof renderHands === 'function') renderHands(); humanPanel(); }
  function playerAfvActionAvailable(index) {
    return playerCanStartAction() && !state.actedGroups?.has(index) && global.DISCARD_RULES.canStillAct();
  }
  const AFVAPI = {
    async uiOverrun() {
      const gs = state.groups.player, gi = state.playerAfvGroup, g = gs[gi];
      if (!g || !playerAfvActionAvailable(gi) || !canOverrun(g)) return alert('今はオーバーランできません');
      const mi = handActionCardIndex('player', 'MOVEMENT'); if (mi < 0) return alert('手札に移動カードがありません');
      const list = overrunTargets(g, gi, 'ai'); if (!list.length) return alert('距離5で隣か正面に敵の歩兵がいません');
      const i = list.length === 1 ? 0 : (parseInt(prompt(list.map((x, k) => `${k + 1}: ${x.t.name}`).join('\n'), '1'), 10) || 1) - 1;
      if (!list[i]) return;
      const flank = chooseOverrunFlank('player', gi, list[i].ti, state.playerHand[mi]);
      const mv = state.playerHand.splice(mi, 1)[0];
      radioActionUsed('player', gi);
      const r = await overrun(g, list[i].t, mv, getFactionKey(state.ai), 'player', flank);
      if (!r) return;
      alert(r.bogged ? 'スタックした！' : `オーバーラン（強さ${r.final}）\n` + r.results.map(x => `${x.name}: ${x.result}`).join('\n'));
      uiAfterAction();
    },
    uiGun() {
      document.getElementById('btn-ordnance').click();
    },
    uiUnbog() {
      const index = state.playerAfvGroup;
      const g = state.groups.player[index];
      if (!canTryUnbog(g) || !playerAfvActionAvailable(index)) return;
      const mi = handActionCardIndex('player', 'MOVEMENT');
      if (mi < 0) return alert('手札に移動カードがありません');
      radioActionUsed('player', index);
      const { success, judge } = tryUnbog(g, state.playerHand.splice(mi, 1)[0], 'player');
      if (judge) showJudgeCard(judge);
      alert(success ? '脱出した' : 'まだ動けない');
      uiAfterAction();
    },
    uiButton() {
      const index = state.playerAfvGroup;
      const group = state.groups.player[index];
      const c = afvCard(group);
      if (!c || R().isPinned(c)) return;
      if (isButtoned(c)) {
        if (!canHeroOpenHatch(group) ||
            !_useHeroFromHand('player', 'ヒーローカードでハッチを開きますか？')) return;
        setHatch(c, false);
      } else {
        if (!playerAfvActionAvailable(index)) return;
        setHatch(c, true);
        radioActionUsed('player', index);
      }
      uiAfterAction();
    },
    async uiCC() {
      const options = state.groups.player.flatMap((source, index) =>
        !source || !playerAfvActionAvailable(index) || source.eliminated ? [] :
          state.groups.ai.flatMap((target, targetIndex) =>
            target && !target.eliminated && isAfvGroup(target) && isTargetVisibleForPlayer(source, targetIndex, 'ai') &&
              global.CC_ACTION.canAttemptInfiltration(source, target, 'player').ok
              ? [{ source, index, target, targetIndex }] : []));
      if (!options.length) return alert('正面または隣の車両に侵入できるグループがありません。');
      let option = options[0];
      if (options.length > 1) {
        const answer = prompt('攻撃側と対象の組を選んでください。\n' +
          options.map(({ source, target }, i) => `${i + 1}: ${source.name} → ${target.name}`).join('\n'), '1');
        option = options[Number(answer) - 1];
        if (!option) return;
      }
      const { source, index, target, targetIndex } = option;
      const result = await global.CC_ACTION.executeInfiltration(source, target, 'ai', targetIndex,
        ccDrawCard, getFactionKey(state.player), { singleTarget: true });
      if (!result.actionUsed) return;
      radioActionUsed('player', index);
      uiAfterAction();
    },
  };
  // ===== 本体への差し込み =====
  function wire() {
    inject();
    if (global.SCENARIOS && !global.SCENARIOS.E) global.SCENARIOS.E = E;
    // 研究用: 防御側にも AFV をつける
    if (global.UF_BOTH_AFV) { ['ger', 'us', 'rus'].forEach(f => { E.defenderFactions[f].soldierList = E.factions[f].soldierList; }); }
    // AFV の前進の方針（研究用に差し替えられる）
    if (typeof global.aiGroupWantsAdvance === 'function' && !global.aiGroupWantsAdvance._afv) {
      const o = global.aiGroupWantsAdvance;
      global.aiGroupWantsAdvance = function (g, i) {
        if (isAfvGroup(g)) {
          if (POL.advance === 'rush') return true;
          if (POL.advance === 'mid') { const closest = Math.max(...(state.groups.player || []).filter(t => t && !t.eliminated).map(t => R().relativeRange(g.distance, t.distance))); return closest < 3; }
        }
        return o(g, i);
      };
      global.aiGroupWantsAdvance._afv = true;
    }
    const SH = global.SCENARIO_HELPERS;
    if (SH && SH.buildAIGroupsSmart && !SH._afvWrapped) {
      const o = SH.buildAIGroupsSmart; SH._afvWrapped = true;
      SH.buildAIGroupsSmart = function (sc, f, role, st) { const g = o(sc, f, role, st); if (!sc || (sc.id !== 'E' && !sc.victoryPreset)) return g; inject(); return splitAfv(g); };
    }
    const Rr = R();
    if (Rr && !Rr._afvWrapped) {
      Rr._afvWrapped = true;
      const oRes = Rr.resolveFireOnSoldier, oPin = Rr.pinSoldier;
      Rr.resolveFireOnSoldier = function (finalFP, rnc, soldier) {
        const r = oRes.apply(this, arguments);
        if (soldier?.afv) {
          const faction = global.getFactionKey(state.currentTurn === 'player' ? state.ai : state.player);
          const model = modelByFaction[faction]?.get(soldier.num);
          Rr._afvCE = (finalFP | 0) + (rnc | 0) >= (model?.ce.ceVal ?? 9);
        }
        return r;
      };
      Rr.pinSoldier = function (card) {
        if (isAfvCard(card)) {
          const commanderKilled = !!Rr._afvCE;
          Rr._afvCE = false;
          return applySniperHit(card, commanderKilled);
        }
        return oPin.apply(this, arguments);
      };
    }
    if (typeof global.pushTerrainWithFaction === 'function' && !global.pushTerrainWithFaction._afv) {
      const o = global.pushTerrainWithFaction;
      global.pushTerrainWithFaction = function (g, card) {
        if (isAfvGroup(g)) {
          const ty = card && card.terrain && card.terrain.type, c = afvCard(g);
          if (ty === 'MARSH' && !g._marshOk) { pushTerrainToDiscard(card); return; } // §28.5 湿地には入らない
          // §13.35 AFV に鉄条網: ただちにスタックの判定。結果に関係なく鉄条網は捨て札（AFV の射撃に影響しない）
          if (c && ty === 'WIRE') {
            clearOutgoingFlanks(g);
            checkBog(g, c, true);
            pushTerrainToDiscard(card);
            return;
          }
          const r = o(g, card);
          if (c && (state.scenario?.jungleMode ? ty === 'MOVEMENT' : ['GULLY', 'WOODS', 'STREAM'].includes(ty))) {
            checkBog(g, c);
          }
          return r;
        }
        return o(g, card);
      };
      global.pushTerrainWithFaction._afv = true;
    }
    if (global.CARD_SCORE && global.CARD_SCORE.wire) global.CARD_SCORE.wire();
  }
  function radioCritical(group, card, red, value, hullDown = false) {
    if (!isAfvCard(card) || red) return null;
    if (value === 5 && defOf(card).ot) { kill(group, card, '砲撃の直撃'); return 'KIA'; }
    if (value === 6) {
      if (hullDown || group._immob) { stun(group, card); return 'STUN'; }
      immobilize(group, card);
      return 'IMMOB';
    }
    return null;
  }
  function applyMinefieldHit(group, card, signedRoll, wireMod) {
    const flank = sideOf(card).flank;
    const threshold = flank.i ?? flank.is ?? Infinity;
    const total = 1 + signedRoll + wireMod;
    if (total < threshold) return 'NONE';
    const wasImmobile = group._immob;
    immobilize(group, card);
    return wasImmobile ? 'STUN' : 'IMMOB';
  }
  function applyOrdnanceHit(target, sourceGroup, strength, side, source, targetIndex, options = {}) {
    const card = afvCard(target);
    const flanking = !options.ignoreCrossFire && isFlankFire(side, source, targetIndex);
    const hullDown = isHullDown(target, sourceGroup, flanking);
    const terrain = target.terrain.filter(entry => entry.terrain?.type !== 'SMOKE');
    const terrainModifier = hullDown || options.ignoreTerrain || options.againstCrew ? 0 : R().calcTerrainMod(terrain, false, {
      isFlank: source !== targetIndex, encircled: Boolean(target.encircled), ignoreMovement: true
    });
    const flank = flanking || !options.ignoreCrossFire &&
      (hasSidewaysMove(target) || target._bog || target._immob);
    const final = strength + terrainModifier;
    const result = options.againstCrew ? applyExposedCrewHit(card, final) : armorResult(target, card, final, flank, hullDown);
    return { name: defOf(card).name, result: result === 'KILL' ? 'KIA' : result, terrainModifier };
  }
  global.AFV = Object.assign({ applyMinefieldHit, adjacentArmorSupport, applyExposedCrewHit, mainArmamentUnavailable,
    canHeroOpenHatch, closeCombatColumn, canAttackVehicleInCloseCombat, resolveVehicleCloseCombat, applyOrdnanceHit, isHullDown, radioCritical, hasMagneticMine, isAfvCard, isAfvGroup, afvCard, isButtoned, applySniperHit, wire, boxedAfterFire, aiTryGun, aiTryOverrun, aiTryCCAfv, aiTryUnbog, canTryUnbog, tryUnbog, canOverrun, humanPanel, stats, defOf, gunProfile, registerCards: inject, E, splitAfv }, AFVAPI);
  wire();
  // シナリオEは公開した（ユーザーの指示 2026-11-06）。以前の scenarioE=1 の制限は外した
  setInterval(() => { try { if (global.document && global.state) humanPanel(); } catch (e) {} }, 800);
})(typeof window !== 'undefined' ? window : this);
