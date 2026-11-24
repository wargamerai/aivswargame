// Scenario A challenge: assemble the defending force only when the battle starts.
const UF_CHALLENGE = (() => {
  const equipmentPrices = { demo: 50, panzerfaustHolders: 25, antiTankMines: 7 };
  const radioPrices = { ger: 42, us: 50, rus: 22 };
  const samplesPerFaction = 64;

  // Annual availability transcribed from the vehicle cards. A single
  // number gives the starting year; a pair includes the last year.
  const vehicleYears = {
    ger: {
      32: [1941, 1942], 33: [1942, 1945], 34: [1944], 35: [1944], 36: [1942],
      37: [1941, 1943], 38: [1942], 39: [1940, 1943], 40: [1942], 41: [1943, 1945],
      42: [1943, 1945], 43: [1941, 1942], 44: [1942, 1945], 45: [1944],
    },
    rus: {
      31: [1943, 1945], 32: [1941, 1942], 33: [1941, 1942], 34: [1941], 35: [1944],
      36: [1941, 1942], 37: [1941], 38: [1943], 39: [1944], 40: [1941, 1943], 41: [1941],
    },
    us: {
      32: [1943, 1945], 33: [1942], 34: [1943], 35: [1943], 36: [1944], 37: [1945],
      38: [1944], 39: [1943, 1945], 40: [1944, 1945], 41: [1942],
    },
    ita: { 33: [1940], 34: [1942], 35: [1941] },
  };

  function availableInYear(def, year, faction) {
    if (!year) return true;
    const printed = /(?:登場|利用可能|AVAILABLE)\s*[：:]?\s*((?:\d{1,2}\/)?\d{4}(?:年(?:\d{1,2}月)?)?\s*(?:[-–—〜～]\s*(?:\d{1,2}\/)?\d{4})?)/i
      .exec(def?.noteBack || '');
    const notes = printed?.[1].match(/\d{4}/g)?.map(Number);
    const vehicle = def?.afv && vehicleYears[faction]?.[def.cardNumber ?? def.num];
    const [from, until] = vehicle || notes || [];
    return from == null || (year >= from && (until == null || year <= until));
  }

  function uniqueSoldiers(numbers) {
    const copies = new Map();
    return numbers.map(number => {
      const count = copies.get(number) || 0;
      copies.set(number, count + 1);
      return number + count * CHALLENGE_CARD_STRIDE;
    });
  }

  function equipmentPrice(kind, faction) {
    if (kind !== 'radioHolders') return equipmentPrices[kind];
    if (typeof desertRadioCost === 'function' && ['ita', 'fra'].includes(faction)) {
      return desertRadioCost(faction, 'regular', 5);
    }
    return radioPrices[faction];
  }

  function points(faction, numbers, equipment = []) {
    return numbers.reduce((total, num) => total + Number(getSoldierDef(faction, num)?.pt), 0) +
      equipment.reduce((total, kind) => total + equipmentPrice(kind, faction), 0);
  }

  function budget(playerPoints, multiplier) {
    return Math.floor(playerPoints * Math.round(multiplier * 10) / 10);
  }

  function playableCards(faction, year) {
    return SOLDIER_CARDS[faction].filter(def =>
      (def.weaponCat !== 'AFV' || (def.afv && !def.afvButtoned)) &&
      (!def.weaponCat.startsWith('対戦車砲') || def.infantryGun) &&
      Number.isFinite(Number(def.pt)) && Number(def.pt) > 0 && availableInYear(def, year, faction));
  }

  function fits(infantry, vehicles) {
    const { GROUP_MAX, MAX_GROUPS_INITIAL } = window.INFANTRY_RULES;
    return vehicles + Math.ceil(infantry / GROUP_MAX) <= MAX_GROUPS_INITIAL;
  }

  function validFormation(faction, numbers) {
    const defs = numbers.map(num => getSoldierDef(faction, num));
    const ground = defs.filter(def => !def.afv);
    return defs.length > 0 && (ground.length !== 1 || canFormSoloGroup(ground[0])) &&
      fits(ground.length, defs.length - ground.length);
  }

  function armorThreat(faction, numbers) {
    const vehicles = numbers.map(num => getSoldierDef(faction, num)).filter(def => def.afv)
      .map(def => AFV.defOf(makeCardWithMeta(faction, def.num))).filter(Boolean);
    if (!vehicles.length) return { armor: 0, infantry: numbers.length, closed: false, flank: 0 };
    const closed = vehicles.filter(model => !model.ot);
    // A machine gun can suppress exposed crews. Against a closed turret, seek a
    // weapon that can at least stun the toughest vehicle from the flank.
    const flank = Math.max(0, ...closed.map(({ ce }) => Math.min(...Object.values(ce.flank || ce.armor))));
    return { armor: vehicles.length, infantry: numbers.length - vehicles.length, closed: closed.length > 0, flank };
  }

  function candidate(faction, def) {
    const type = def.weaponCat;
    const rocket = /^バズーカ\s*\d+\s*\/\s*(\d+)/.exec(type);
    const vehicleGun = def.afv ? AFV.gunProfile(makeCardWithMeta(faction, def.num)) : null;
    let power = null;
    if (vehicleGun?.kind === 'afv') power = vehicleGun.armor + 5;
    else if (def.infantryGun) power = def.infantryGun.armor + 5;
    else if (rocket) power = Number(rocket[1]) + 3;
    else if (/^パンツァーシュレック/.test(type)) power = 7;
    else if (/^PIAT/i.test(type)) power = 5;
    else if (/^対戦車ライフル/.test(type)) power = 5;
    const machineGun = /[重中]機関銃/.test(type);
    const dedicatedAntiTank = /^(バズーカ|パンツァーシュレック|PIAT|対戦車ライフル)/i.test(type);
    return { def, cost: Number(def.pt), power, machineGun, dedicatedAntiTank, leader: isLeaderSoldier(def) };
  }

  function counters(cards, faction, threat) {
    if (!threat.armor) return [];
    const options = cards.filter(card => (card.power !== null && card.power >= threat.flank) ||
      (!threat.closed && card.machineGun)).map(card => ({ card, equipment: [] }));
    if (faction === 'ger' && threat.flank <= 7) {
      cards.filter(({ def }) => secondaryWeaponEligible({ num: def.num }, faction))
        .forEach(card => options.push({ card, equipment: ['panzerfaustHolders'] }));
    }
    return options;
  }

  function choose(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function draft(faction, cards, counterOptions, limit, threat) {
    const affordableCounters = counterOptions.filter(({ card, equipment }) =>
      card.cost + (equipment.length ? equipmentPrices.panzerfaustHolders : 0) <= limit);
    if (threat.armor && !affordableCounters.length) return null;
    const seed = choose(affordableCounters);
    const equipment = seed?.equipment || [];
    const selected = seed ? [seed.card] : [];
    let infantry = Number(Boolean(seed && !seed.card.def.afv));
    let vehicles = Number(Boolean(seed?.card.def.afv));
    let spent = (seed?.card.cost || 0) + (equipment.length ? equipmentPrices.panzerfaustHolders : 0);
    const pool = cards.filter(card => card !== seed?.card);
    const infantryFirst = Math.random() < 0.75;
    while (pool.length && spent < limit) {
      const remaining = limit - spent;
      const available = pool.filter(({ cost, def }) => cost <= remaining &&
        fits(infantry + Number(!def.afv), vehicles + Number(Boolean(def.afv))));
      if (!available.length) break;
      const loneInfantry = infantry === 1 && !canFormSoloGroup(selected.find(card => !card.def.afv).def);
      const preferInfantry = loneInfantry || (infantryFirst && infantry < 5);
      let choices = preferInfantry ? available.filter(card => !card.def.afv) : available;
      if (!choices.length) choices = available;
      const wantLeader = infantry > 0 && !selected.some(card => card.leader);
      const wantFireSupport = threat.infantry >= 4 && infantry >= 2 && !selected.some(card => card.machineGun);
      const enoughCounters = selected.filter(card => card.power !== null && card.power >= threat.flank).length +
        Number(equipment.length > 0);
      const wantAnotherCounter = threat.armor >= 2 && enoughCounters < threat.armor;
      const useful = choices.filter(card => (wantLeader && card.leader) || (wantFireSupport && card.machineGun) ||
        (wantAnotherCounter && card.power !== null && card.power >= threat.flank));
      const pick = useful.length && Math.random() < 0.45 ? choose(useful) :
        Math.random() < 0.5 ? choose(choices) :
          choices.reduce((best, card) => card.cost > best.cost ? card : best);
      selected.push(pick);
      pool.splice(pool.indexOf(pick), 1);
      spent += pick.cost;
      if (pick.def.afv) vehicles++;
      else infantry++;
    }
    const soldiers = selected.map(({ def }) => def.num);
    return validFormation(faction, soldiers) ? { faction, soldiers, equipment, spent } : null;
  }

  function opponents(playerFaction, soldiers, limit, year) {
    const threat = armorThreat(playerFaction, soldiers);
    const drafts = [];
    for (const faction of Object.keys(FACTIONS)) {
      if (faction === playerFaction) continue;
      const cards = playableCards(faction, year).map(def => candidate(faction, def))
        .filter(card => threat.armor || !card.dedicatedAntiTank);
      const options = counters(cards, faction, threat);
      for (let i = 0; i < samplesPerFaction; i++) {
        const force = draft(faction, cards, options, limit, threat);
        if (force) drafts.push(force);
      }
    }
    if (!drafts.length) return null;
    const best = Math.max(...drafts.map(draft => draft.spent));
    const tolerance = Math.max(1, Math.floor(best * 0.01));
    return choose(drafts.filter(draft => draft.spent >= best - tolerance));
  }

  return { availableInYear, budget, equipmentPrice, opponents, playableCards, points, uniqueSoldiers, validFormation };
})();
