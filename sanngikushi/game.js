'use strict';

const ThreeKingdoms = ((data) => {
  const { areas, factions, leaders, cards, extras, caoLeaders, setupSlots, capitals,
    mainRoads, minorRoads, initialCards, combatTables } = data;
  const factionIds = Object.keys(factions);
  const areaIds = Object.keys(areas);
  const leaderIds = Object.keys(leaders);
  const opponents = faction => faction === 'cao' ? factionIds.slice(1) : ['cao'];
  const other = (road, from) => road.includes(from) ? road.find(id => id !== from) : null;
  const notes = (s, text) => {
    s.log.push(text);
    if (s.log.length > 240) s.log.shift();
    s.events.push(text);
  };
  const areaName = id => areas[id].name;
  const label = id => leaders[id].name;
  const baseName = id => factions[id].name;
  const present = (s, id, faction) => leaderIds.filter(key =>
    s.location[key] === id && (!faction || leaders[key].faction === faction));
  const troops = (s, id, faction) => s.board[id].troops[faction] || 0;
  const count = (s, id, faction) => troops(s, id, faction) + present(s, id, faction).length;
  const factionList = (s, id) => factionIds.filter(faction => count(s, id, faction) > 0);
  const hostile = (s, id, faction) => opponents(faction).some(enemy => count(s, id, enemy));
  const controlCount = s => areaIds.filter(id => s.board[id].owner === 'cao').length;
  const alive = (s, id) => s.location[id] !== 'out';

  function shuffle(items, rng) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  const validSetup = setup => Array.isArray(setup) && setup.length === setupSlots.length &&
    new Set(setup).size === setup.length && setup.every(id => caoLeaders.includes(id));

  function create(setup, options = {}, rng = Math.random) {
    if (!validSetup(setup)) throw new Error('曹操軍の将軍5人を、重複なしで配置してください。');
    const s = {
      version: 1,
      options: { captureOnly: !!options.captureOnly, leaderDeath: !!options.leaderDeath,
        fastBattle: !!options.fastBattle },
      board: Object.fromEntries(Object.values(areas).map(a => [a.id,
        { owner: a.faction, troops: { [a.faction]: a.troops } }])),
      pool: Object.fromEntries(factionIds.map(id => [id, factions[id].total])),
      location: Object.fromEntries(leaderIds.map(id => [id, leaders[id].start])),
      track: Object.fromEntries(factionIds.filter(id => factions[id].track).map(id => [id, 0])),
      dead: [], removedCards: [], kongming: 0, reserve: 3,
      deck: shuffle(initialCards, rng), discard: [], last: null, previous: null,
      round: 1, turn: 0, draws: 0, phase: 'ready', end: null,
      log: [], events: [], queue: [], touches: [], route: [], active: null, battle: null,
    };
    for (const a of Object.values(areas)) s.pool[a.faction] -= a.troops;
    s.pool.liu -= s.reserve;
    setup.forEach((id, i) => { s.location[id] = setupSlots[i]; });
    notes(s, '初期配置を確定しました。最初の天命札は任意で選べます。');
    return s;
  }

  function mark(s, area, faction) { s.touches.push({ area, faction }); }

  function join(s, faction) {
    if (s.dead.includes(faction) || s.track[faction] === factions[faction].track) return;
    s.track[faction] = factions[faction].track;
    notes(s, `${baseName(faction)}が参戦。`);
    const added = extras[faction] || [];
    s.discard.push(...added);
    if (added.length) notes(s, `${added.map(id => cards[id].name).join('・')}を捨て札に追加。`);
  }

  function deployZhu(s) {
    if (s.location.zhu !== 'track') return;
    s.location.zhu = s.location.liu;
    notes(s, s.location.zhu ? `諸葛亮が${areaName(s.location.zhu)}に登場。` : '諸葛亮を劉備軍の補充プールに配置。');
  }

  function defeat(s, invasion = false) {
    if (s.location.cao === null || s.location.cao === 'out') s.end = '曹操がマップから除去されました。';
    else if (!s.options.captureOnly && (invasion || hostile(s, 'xu', 'cao'))) s.end = '反曹操側が許都に進入しました。';
    else if (s.options.captureOnly && s.board.xu.owner !== 'cao') s.end = '反曹操側が許都を支配しました。';
    return !!s.end;
  }

  function finish(s) {
    for (const { area, faction } of s.touches) {
      const current = s.board[area].owner;
      if (current === faction || count(s, area, current) || !count(s, area, faction)) continue;
      s.board[area].owner = faction;
      notes(s, `${areaName(area)}の支配が${baseName(faction)}に移りました。`);
    }
    for (const faction of Object.keys(s.track)) {
      const invaded = areaIds.some(id => areas[id].faction === faction && hostile(s, id, faction));
      if (invaded) join(s, faction);
    }
    if (s.board.jing.owner === 'cao') deployZhu(s);
    s.won = !defeat(s) && controlCount(s) === areaIds.length;
    if (s.won) s.end = '全エリアを支配しました。';
    s.active = null;
    s.battle = null;
    s.phase = 'result';
  }

  function draw(s, firstChoice) {
    if (s.phase !== 'ready' || s.end || !s.deck.length) return false;
    const i = s.turn === 0 && s.deck.includes(firstChoice) ? s.deck.indexOf(firstChoice) : 0;
    [s.last] = s.deck.splice(i, 1);
    s.turn++;
    s.draws++;
    s.events = [];
    s.touches = [];
    s.route = [];
    s.queue = [];
    s.phase = 'reveal';
    notes(s, `天命札「${cards[s.last].name}」を引きました。`);
    return true;
  }

  function play(s, rng = Math.random) {
    if (s.phase !== 'reveal') return false;
    (s.usedCards ??= usedCards(s)).push(s.last);
    s.queue.push({ type: 'card', card: s.last, repeated: false });
    advance(s, rng);
    return true;
  }

  function usedCards(s) {
    const count = s.draws - Number(s.phase === 'reveal');
    if (count <= 0) return [];
    if (s.usedCards) return s.usedCards.slice(-count);
    const byName = new Map(Object.values(cards).map(card => [card.name, card.id]));
    const used = s.log.flatMap(line => {
      const id = byName.get(/^天命札「(.+)」を引きました。$/.exec(line)?.[1]);
      return id ? [id] : [];
    });
    if (s.phase === 'reveal') used.pop();
    return used.slice(-count);
  }

  function extinction(s, faction) {
    const baseTaken = faction === 'shao'
      ? capitals.every(id => s.board[id].owner === 'cao')
      : s.board[factions[faction].base].owner === 'cao';
    if (s.location[faction] !== null || !baseTaken) return false;
    s.dead.push(faction);
    s.location[faction] = 'out';
    s.pool[faction] = 0;
    const banned = [faction, ...(extras[faction] || [])];
    s.removedCards.push(...banned);
    s.deck = s.deck.filter(id => !banned.includes(id));
    s.discard = s.discard.filter(id => !banned.includes(id));
    if (faction === 'liu' && !areas[s.location.zhu]) s.location.zhu = 'out';
    notes(s, `${baseName(faction)}が滅亡。対象の天命札と補充プールの駒を除外。`);
    if (['biao', 'sun'].includes(faction)) join(s, 'liu');
    if (s.dead.includes('biao') && s.dead.includes('sun') && s.reserve) {
      if (!s.dead.includes('liu')) s.pool.liu += s.reserve;
      notes(s, '劉備軍の予備3駒を処理しました。');
      s.reserve = 0;
    }
    return true;
  }

  function cardOrder(s, { card, repeated }) {
    if (card === 'emperor') {
      s.discard.push(card);
      if (s.draws === 1 || !s.previous) {
        notes(s, '直前の天命札がないため、献帝の効果はありません。');
      } else {
        notes(s, `献帝により「${cards[s.previous].name}」を再処理。`);
        s.queue.unshift({ type: 'card', card: s.previous, repeated: true },
          { type: 'disband' }, { type: 'shuffle' });
      }
      return;
    }
    const faction = card === 'zhou' ? 'sun' : ['guan', 'zhang', 'zhu'].includes(card) ? 'liu'
      : caoLeaders.includes(card) ? 'cao' : card;
    if (s.dead.includes(faction) || (faction !== 'cao' && extinction(s, faction))) return;
    if (!repeated) {
      s.discard.push(card);
      s.previous = card;
    }
    if (faction === 'cao') {
      if (s.options.leaderDeath && s.draws === 1 && card !== 'cao' && s.location[card] === null) {
        s.location[card] = 'out';
        s.removedCards.push(card);
        s.discard = s.discard.filter(id => id !== card);
        s.previous = null;
        notes(s, `${label(card)}が死亡。将軍駒と天命札を除外。`);
        return;
      }
      const choices = (card === 'cao' ? caoLeaders : [card]).filter(id => alive(s, id));
      if (!choices.length) return;
      s.active = { card, choices, leader: choices[0] };
      s.phase = 'action';
      return;
    }
    if (factions[faction].track && s.track[faction] < factions[faction].track) {
      if (card === faction) {
        const next = s.track[faction] + 1;
        notes(s, `${baseName(faction)}の参戦マーカー：${s.track[faction]} → ${next}。`);
        if (next === factions[faction].track) join(s, faction);
        else s.track[faction] = next;
        return;
      } else return;
    }
    if (card === 'zhu') {
      if (s.location.zhu === 'track') {
        s.kongming++;
        notes(s, `孔明出蘆：${s.kongming}／6。`);
        if (s.kongming >= 6) deployZhu(s);
      } else if (areas[s.location.zhu]) {
        notes(s, '天下三分之計。反曹操側の将軍を順番に処理します。');
        s.queue.unshift({ type: 'threeOrder', remaining: opponents('cao').filter(id => !s.dead.includes(id)) });
      }
      return;
    }
    const mods = card === 'zhou' ? { valor: 3, intel: 2 } :
      card === 'guan' ? { valor: 5 } : card === 'zhang' ? { valor: 4 } : {};
    s.queue.unshift({ type: 'enemy', leader: faction, mods });
  }

  const distance = { xu: 0 };
  const frontier = ['xu'];
  while (frontier.length) {
    const from = frontier.shift();
    for (const road of mainRoads) {
      const id = other(road, from);
      if (id && !(id in distance)) { distance[id] = distance[from] + 1; frontier.push(id); }
    }
  }

  function paths(s, leader, ai = false) {
    const from = s.location[leader];
    if (!areas[from]) return {};
    const faction = leaders[leader].faction;
    const visited = {};
    const allowedMinor = !ai && faction === 'cao' && s.board[from].owner === 'cao';
    const enemyArea = id => hostile(s, id, faction) || (ai && s.board[id].owner === 'cao');
    const visit = (route, usedMinor) => {
      const at = route.at(-1);
      if (route.length > 1 && (route.length === 3 || enemyArea(at))) return;
      for (const [roads, minor] of [[mainRoads, false], [minorRoads, true]]) {
        if (minor && !allowedMinor) continue;
        for (const road of roads) {
          const to = other(road, at);
          if (!to || route.includes(to)) continue;
          if (ai && distance[to] >= distance[at]) continue;
          if (ai && route.length === 2 && enemyArea(to)) continue;
          if (route.length === 1 && hostile(s, from, faction) && hostile(s, to, faction)) continue;
          if ((minor || usedMinor) && ![...route, to].every(id => s.board[id].owner === 'cao')) continue;
          const next = [...route, to];
          if (!visited[to] || next.length < visited[to].length) visited[to] = next;
          visit(next, usedMinor || minor);
        }
      }
    };
    visit([from], false);
    return visited;
  }

  function canMarch(s, leader, amount, extra = null) {
    const from = s.location[leader];
    if (!areas[from] || !Number.isInteger(amount) || amount < 0) return false;
    const faction = leaders[leader].faction;
    if (amount > troops(s, from, faction)) return false;
    if (extra && (extra === leader || !present(s, from, faction).includes(extra))) return false;
    if (faction === 'cao' && amount + Number(!!extra) > 10) return false;
    const stay = count(s, from, faction) - 1 - Number(!!extra) - amount;
    const friendly = faction === 'cao' ? ['cao'] : opponents('cao');
    if (stay < 0 || stay + friendly.filter(id => id !== faction).reduce((n, id) => n + count(s, from, id), 0) < 1) return false;
    const native = areas[from].faction;
    if (friendly.includes(native) && count(s, from, native) &&
        (native === faction ? stay : count(s, from, native)) < 1) return false;
    if (leader === 'liu' && s.location.zhu === from && extra !== 'zhu') return false;
    return true;
  }

  function transfer(s, leader, amount, extra, route) {
    const from = route[0], to = route.at(-1), faction = leaders[leader].faction;
    s.board[from].troops[faction] = troops(s, from, faction) - amount;
    s.board[to].troops[faction] = troops(s, to, faction) + amount;
    s.location[leader] = to;
    if (extra) s.location[extra] = to;
    s.route = route;
    s.movement = { leader, troops: amount, leaders: [leader, ...(extra ? [extra] : [])] };
    if (faction === 'cao' && s.log.length === 240) s.movement.priorLogEntry = s.log[0];
    s.phase = 'movement';
    mark(s, to, faction);
    notes(s, `${label(leader)}${extra ? `・${label(extra)}` : ''}が${route.map(areaName).join(' → ')}へ行軍（軍勢${amount}駒）。`);
  }

  function deployBase(s, faction, rng) {
    const base = factions[faction].base;
    if (s.board[base].owner === 'cao' && faction === 'shao') {
      const eligible = capitals.slice(1).filter(id => s.board[id].owner !== 'cao');
      return eligible[Math.floor(rng() * eligible.length)] || null;
    }
    return s.board[base].owner && !opponents(faction).includes(s.board[base].owner) ? base : null;
  }

  function reinforce(s, leader, limit, rng) {
    const faction = leaders[leader].faction;
    if (!alive(s, leader) || limit < 1) return 0;
    const destination = s.location[leader] || deployBase(s, faction, rng);
    if (!destination) return 0;
    let placed = 0;
    if (s.location[leader] === null) { s.location[leader] = destination; placed++; }
    if (faction === 'liu' && s.location.zhu === null && placed < limit) {
      s.location.zhu = destination;
      placed++;
    }
    const amount = Math.min(s.pool[faction], limit - placed);
    s.pool[faction] -= amount;
    s.board[destination].troops[faction] = troops(s, destination, faction) + amount;
    if (placed + amount) {
      mark(s, destination, faction);
      notes(s, `${label(leader)}が${areaName(destination)}に${placed + amount}駒を補充。`);
    }
    return placed + amount;
  }

  const canReinforce = (s, leader) => !!(s.location[leader]
    ? s.pool[leaders[leader].faction] > 0
    : s.location[leader] === null && s.board.xu.owner === 'cao');

  function enemy(s, { leader, mods, three = false }, rng) {
    const from = s.location[leader];
    const cap = three ? 2 : leader === 'shao' ? capitals.filter(id => s.board[id].owner !== 'cao').length : 2;
    if (three && reinforce(s, leader, 2, rng)) return;
    s.queue.unshift({ type: 'reinforce', leader, limit: cap });
    if (!areas[from]) return;
    if (hostile(s, from, leader)) {
      startBattle(s, leader, mods, null, rng);
      return;
    }
    const extra = leader === 'liu' && s.location.zhu === from ? 'zhu' : null;
    const available = troops(s, from, leader);
    const amount = [available, available - 1].find(n => canMarch(s, leader, n, extra));
    const route = Object.values(paths(s, leader, true))
      .sort((a, b) => distance[a.at(-1)] - distance[b.at(-1)])[0];
    if (route && amount !== undefined) transfer(s, leader, amount, extra, route);
    else notes(s, `${label(leader)}は行軍できません。`);
  }

  function advance(s, rng) {
    while (s.queue.length && !s.end) {
      const job = s.queue.shift();
      s.phase = 'running';
      if (job.type === 'card') cardOrder(s, job);
      if (job.type === 'enemy') enemy(s, job, rng);
      if (job.type === 'reinforce' && !reinforce(s, job.leader, job.limit, rng)) {
        notes(s, `${label(job.leader)}は補充できません。`);
      }
      if (job.type === 'threeOrder') {
        if (job.remaining.length) { s.order = job.remaining; s.phase = 'order'; }
      }
      if (job.type === 'disband') s.phase = 'disband';
      if (job.type === 'shuffle') {
        s.deck = shuffle([...s.deck, ...s.discard], rng);
        s.discard = [];
        s.usedCards = [];
        s.round++;
        s.draws = 0;
        s.previous = null;
        notes(s, `山札を切り直しました。第${s.round}巡。`);
      }
      if (s.phase !== 'running') return;
    }
    finish(s);
  }

  const special = (card, leader) => card === leader ? {
    ...(leader === 'cao' ? { valor: 2, intel: 2 } : {}),
    ...(leader === 'dun' ? { bonus: 1 } : {}),
    ...(leader === 'hong' ? { protect: 1 } : {}),
  } : {};

  function command(s, type, leader, rng = Math.random) {
    if (s.phase !== 'action' || !s.active.choices.includes(leader)) return false;
    if (!['march', 'battle', 'reinforce', 'pass'].includes(type)) return false;
    const from = s.location[leader], card = s.active.card;
    if (type === 'march' && !Object.keys(paths(s, leader)).length) return false;
    if (type === 'battle' && (!areas[from] || !hostile(s, from, 'cao'))) return false;
    if (type === 'reinforce' && !canReinforce(s, leader)) return false;
    s.active.leader = leader;
    if (type === 'march') s.phase = 'march';
    if (type === 'battle') startBattle(s, leader, special(card, leader), null, rng);
    if (type === 'reinforce') {
      reinforce(s, leader, card === 'ren' ? 3 : 2, rng);
      advance(s, rng);
    }
    if (type === 'pass') { notes(s, `${label(leader)}は行動しません。`); advance(s, rng); }
    return true;
  }

  function march(s, target, amount, extra) {
    if (s.phase !== 'march') return false;
    const { leader } = s.active;
    const route = paths(s, leader)[target];
    if (!route || !canMarch(s, leader, amount, extra)) return false;
    transfer(s, leader, amount, extra, route);
    return true;
  }

  function confirmMovement(s, rng = Math.random) {
    if (s.phase !== 'movement') return false;
    const movement = s.movement;
    const target = s.route.at(-1);
    const faction = leaders[movement.leader].faction;
    s.movement = null;
    if (target === 'xu' && faction !== 'cao') defeat(s, true);
    if (faction === 'cao' && s.active?.card === 'yuan' && hostile(s, target, 'cao')) {
      s.active.moved = { troops: movement.troops, leaders: movement.leaders };
      s.phase = 'followup';
    } else advance(s, rng);
    return true;
  }

  function canCancelMovement(s) {
    return s.phase === 'movement' && s.active?.leader === s.movement?.leader &&
      leaders[s.movement?.leader]?.faction === 'cao';
  }

  function cancelMovement(s) {
    if (!canCancelMovement(s)) return false;
    const { troops: amount, leaders: movingLeaders, priorLogEntry } = s.movement;
    const from = s.route[0], to = s.route.at(-1);
    s.board[from].troops.cao = troops(s, from, 'cao') + amount;
    s.board[to].troops.cao = troops(s, to, 'cao') - amount;
    for (const id of movingLeaders) s.location[id] = from;
    s.touches.pop();
    s.events.pop();
    s.log.pop();
    if (priorLogEntry !== undefined) s.log.unshift(priorLogEntry);
    s.route = [];
    s.movement = null;
    s.phase = 'march';
    return true;
  }

  function followup(s, fight, rng = Math.random) {
    if (s.phase !== 'followup') return false;
    if (fight) startBattle(s, s.active.leader, {}, s.active.moved, rng);
    else advance(s, rng);
    return true;
  }

  function disband(s, area, amount) {
    if (s.phase !== 'disband' || !areas[area] || !Number.isInteger(amount) ||
        amount < 1 || amount > troops(s, area, 'cao')) return false;
    s.board[area].troops.cao -= amount;
    s.pool.cao += amount;
    notes(s, `${areaName(area)}の曹操軍勢駒${amount}駒を解散。`);
    return true;
  }

  function disbandLeader(s, id) {
    if (s.phase !== 'disband' || !caoLeaders.includes(id) || !areas[s.location[id]]) return false;
    notes(s, `${areaName(s.location[id])}の${label(id)}を解散。`);
    s.location[id] = null;
    return true;
  }

  function order(s, id, rng = Math.random) {
    if (s.phase !== 'order' || !s.order.includes(id)) return false;
    s.queue.unshift({ type: 'enemy', leader: id, mods: {}, three: true },
      { type: 'threeOrder', remaining: s.order.filter(other => other !== id) });
    s.order = [];
    advance(s, rng);
    return true;
  }

  function value(s, id, field, b) {
    if (id === b.leader && b.mods[field] !== undefined) return b.mods[field];
    if (id === 'liu' && field === 'intel' && s.location.zhu === b.area) return 3;
    return leaders[id][field];
  }

  function force(s, b, faction) {
    const limited = b.moved && faction === b.faction;
    const people = present(s, b.area, faction).filter(id => !limited || b.moved.leaders.includes(id));
    const soldiers = limited ? Math.min(troops(s, b.area, faction), b.moved.troops) : troops(s, b.area, faction);
    const generals = people.filter(id => id !== 'zhu');
    const ranked = generals.sort((a, bId) => value(s, bId, 'intel', b) - value(s, a, 'intel', b) ||
      value(s, bId, 'valor', b) - value(s, a, 'valor', b));
    const attacker = faction === b.faction;
    const leading = attacker ? (people.includes(b.leader) ? b.leader : null) : ranked[0];
    const areaSupport = !attacker && s.board[b.area].owner === faction;
    return { faction, people, soldiers, size: people.length + soldiers, leading,
      intel: Math.max(leading ? value(s, leading, 'intel', b) : 0, areaSupport ? 1 : 0),
      valor: leading ? value(s, leading, 'valor', b) : areaSupport ? 2 : 0 };
  }

  function tableHits(valor, amount, sum) {
    const bounds = valor === 2 ? [1, 2, 3, 4, 5, 7, 9, 11, 13, 15, 17, 19, 23, 27, Infinity]
      : [1, 2, 3, 4, 5, 7, 9, Infinity];
    return Number(combatTables[valor][sum - 2].split(' ')[bounds.findIndex(n => n >= amount)]);
  }

  function battleLineup(s) {
    const b = s.battle;
    return b.order.map(side => side.map(id => force(s, b, id)));
  }

  function startBattle(s, leader, mods, moved, rng) {
    const area = s.location[leader], faction = leaders[leader].faction;
    const defenders = opponents(faction).filter(id => count(s, area, id));
    const b = { area, leader, faction, mods, moved, defenders, strike: 0, report: null, losses: 0 };
    const attacker = force(s, b, faction);
    const defenderIntel = Math.max(...defenders.map(id => force(s, b, id).intel), 0);
    b.order = attacker.intel > defenderIntel ? [[faction], defenders] : [defenders, [faction]];
    s.battle = b;
    mark(s, area, faction);
    notes(s, `${areaName(area)}で戦闘。${b.order[0].map(baseName).join('・')}が先攻（知略 ${attacker.intel} 対 ${defenderIntel}）。`);
    rollStrike(s, rng);
  }

  function rollStrike(s, rng) {
    const b = s.battle;
    const attack = b.order[b.strike].map(id => force(s, b, id)).filter(unit => unit.size);
    const target = b.order[1 - b.strike].map(id => force(s, b, id)).filter(unit => unit.size);
    if (!attack.length || !target.length) {
      s.battle = null;
      advance(s, rng);
      return;
    }
    const groups = attack.map(unit => {
      const { faction, size, valor, leading } = unit;
      const table = s.options.fastBattle && !!combatTables[valor];
      const rolls = Array.from({ length: valor ? (table ? 2 : size) : 0 }, () => Math.floor(rng() * 6) + 1);
      const hits = table ? tableHits(valor, size, rolls[0] + rolls[1]) : rolls.filter(die => die <= valor).length;
      return { faction, size, valor, leading, rolls, hits, table };
    });
    const bonus = attack.some(unit => unit.faction === b.faction) ? b.mods.bonus || 0 : 0;
    const protect = target.some(unit => unit.faction === b.faction) ? b.mods.protect || 0 : 0;
    const inflicted = Math.max(0, groups.reduce((n, unit) => n + unit.hits, 0) + bonus - protect);
    b.losses = Math.min(inflicted, target.reduce((n, unit) => n + unit.size, 0));
    b.report = { groups, target: target.map(unit => unit.faction), inflicted, bonus, protect, removed: [] };
    notes(s, `${attack.map(unit => baseName(unit.faction)).join('・')}の攻撃：${inflicted}損害。`);
    s.phase = 'battle';
  }

  function lossChoices(s) {
    if (s.phase !== 'battle' || !s.battle.losses) return [];
    const b = s.battle;
    const units = b.report.target.map(id => force(s, b, id)).filter(unit => unit.size);
    const native = areas[b.area].faction;
    const otherUnits = units.some(unit => unit.faction !== native);
    return units.flatMap(unit => {
      const { faction, size, soldiers, people } = unit;
      if (native === faction && size === 1 && otherUnits) return [];
      if (soldiers > 0) return [{ id: faction, type: 'troop', name: `${baseName(faction)}の軍勢駒` }];
      if (people.includes('zhu')) return [{ id: 'zhu', type: 'leader', name: label('zhu') }];
      return people.map(id => ({ id, type: 'leader', name: label(id) }));
    });
  }

  function lose(s, id, type) {
    const chosen = lossChoices(s).find(item => item.id === id && item.type === type);
    if (!chosen) return false;
    const b = s.battle;
    if (type === 'troop') {
      s.board[b.area].troops[id]--;
      if (b.moved && id === b.faction) b.moved.troops--;
      if (!s.dead.includes(id)) s.pool[id]++;
    } else s.location[id] = s.dead.includes(leaders[id].faction) ? 'out' : null;
    b.losses--;
    b.report.removed.push(chosen.name);
    notes(s, `${chosen.name}を1駒除去。`);
    defeat(s);
    return true;
  }

  function nextStrike(s, rng = Math.random) {
    if (s.phase !== 'battle' || (s.battle.losses && !s.end)) return false;
    if (s.battle.strike === 0 && !s.end) { s.battle.strike++; rollStrike(s, rng); }
    else { s.battle = null; advance(s, rng); }
    return true;
  }

  function resolveLosses(s) {
    while (s.phase === 'battle' && s.battle.losses && !s.end) {
      const choices = lossChoices(s);
      const choice = choices.find(item => item.type === 'troop') ||
        choices.find(item => item.id !== 'cao') || choices[0];
      if (!choice) break;
      lose(s, choice.id, choice.type);
    }
  }

  function done(s, rng = Math.random) {
    if (s.phase === 'disband') { advance(s, rng); return true; }
    if (s.phase !== 'result') return false;
    s.phase = s.end ? 'ended' : 'ready';
    if (!s.end && !s.deck.length && s.discard.length) {
      s.deck = shuffle(s.discard, rng);
      s.discard = [];
      s.usedCards = [];
      s.round++;
      s.draws = 0;
      s.previous = null;
      notes(s, `山札が尽きたため、捨て札を切り直しました。第${s.round}巡。`);
    }
    return true;
  }

  return { create, validSetup, draw, play, command, march, confirmMovement, canCancelMovement, cancelMovement, followup, order, disband, disbandLeader,
    done, paths, canMarch, canReinforce, troops, present, count, factionList, hostile, controlCount,
    lossChoices, lose, resolveLosses, nextStrike, tableHits, battleLineup, usedCards };
})(typeof module === 'undefined' ? Campaign : require('./data.js'));

if (typeof module !== 'undefined') module.exports = ThreeKingdoms;
