'use strict';

const BulgeRules = (() => {
  const D = BulgeData;
  const enemy = side => side === 'german' ? 'allied' : 'german';
  const sideName = side => side === 'german' ? 'ドイツ軍' : '連合軍';
  const phases = ['supply','reentry','recovery','support','event','move','reinforce','reaction','attack','counter'];
  const phaseNames = {
    setup:'初期支援チット配置',
    supply:'補給ポイント取得', reentry:'除去ユニット再登場', recovery:'混乱ユニット回復',
    support:'支援チット取得', event:'イベント解決', move:'移動', reinforce:'増援登場',
    reaction:'対応移動', attack:'攻撃', counter:'反撃', resolve:'戦闘判定', advance:'戦闘後前進',
    highbeam:'増援の移動', over:'対局終了',
  };
  const map = new Map();
  const hexId = (col, row) => String(col).padStart(2, '0') + String(row).padStart(2, '0');
  for (let col = 1; col <= 30; col++) {
    const stagger = col % 2;
    for (let row = col <= 6 ? 4 - stagger : 1; row <= 21; row++) {
      map.set(hexId(col,row), { col, row, x:303.5 + 52.55*(col-1), y:42.5 + 60.71*(row-1) + 30.355*stagger });
    }
  }
  for (const hex of map.values()) {
    const { col, row } = hex;
    const upper = row - Number(col % 2 === 0);
    hex.neighbors = [
      hexId(col,row-1), hexId(col,row+1), hexId(col-1,upper), hexId(col-1,upper+1),
      hexId(col+1,upper), hexId(col+1,upper+1),
    ].filter(id => map.has(id));
  }
  const neighbors = id => map.get(id)?.neighbors ?? [];
  function distance(a,b) {
    const from=map.get(a), to=map.get(b);
    const dx=from.col-to.col;
    const dy=(from.row-Math.floor(from.col/2))-(to.row-Math.floor(to.col/2));
    return Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dx+dy));
  }
  const finalVictoryCities = ['1716','1803'];
  const city = hex => Boolean(D.cities[hex] || terrain[hex]?.includes('市街地'));
  // City hexes retain their normal terrain effects and ZOC even with a river.
  const riverTerrain = hex => Boolean(terrain[hex]?.includes('河川'));
  const river = hex => !city(hex) && riverTerrain(hex);
  const ridge = hex => Boolean(terrain[hex]?.includes('尾根'));
  const forest = hex => Boolean(terrain[hex]?.includes('森林'));
  const fort = hex => D.siegfried.includes(hex);
  const isRoad = (state, from, to) => !state.bridges[from] && !state.bridges[to] &&
    roads.has(from < to ? from+'-'+to : to+'-'+from);
  const roadLinks = () => [...roads].map(edge=>edge.split('-')).filter(([from,to])=>map.has(from)&&map.has(to));
  const offRoadForest = (state, from, to) => forest(to) && !isRoad(state,from,to);
  const terrainName = hex => [...(terrain[hex] ?? [city(hex)?'市街地':'平地']), ...(fort(hex)?['要塞']:[])].join('・');
  const source = (side, hex) => D.sources[side].includes(hex);
  const blockedHex = (side, hex) => side === 'german' && D.protectedSources.includes(hex);
  const onMap = (state, side) => state.units.filter(unit => unit.hex && (!side || unit.side === side));
  const unitById = (state,id) => state.units.find(unit => unit.id === id);
  const at = (state, hex) => state.units.filter(unit => unit.hex === hex);
  const chit = id => D.chits[id?.split(':')[0]];
  const chitImage = id => `assets/marker-${chit(id).image}.jpg`;
  const copy = value => structuredClone(value);
  function actor(state) {
    if (state.phase === 'over') return null;
    if (state.phase === 'resolve' || state.phase === 'advance') return state.combat.side;
    return ['reaction','counter'].includes(state.phase) ? enemy(state.turnSide) : state.turnSide;
  }
  function roll(state, max) {
    let n = state.seed >>> 0;
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    state.seed = n >>> 0;
    return Math.floor(state.seed / 4294967296 * max);
  }
  function log(state, text) {
    state.log.push({ turn: state.turn, text });
    if (state.log.length > 140) state.log.shift();
  }
  function take(state, side, id) {
    const cup = state.cups[side], index = cup.indexOf(id);
    if (index < 0) return null;
    return cup.splice(index,1)[0];
  }
  function returnChit(state, id) {
    if (chit(id)?.kind === 'dummy') return;
    const side = id.startsWith('g-') ? 'german' : 'allied';
    if (!state.cups[side].includes(id)) state.cups[side].push(id);
  }
  function dummyReserve(state, side) {
    const key = `${side[0]}-dummy`;
    const inUse = new Set([...state.units.flatMap(unit => unit.support), ...(state.captureHold ?? [])]);
    return Array.from({length: D.chits[key].count}, (_, index) => `${key}:${index + 1}`)
      .filter(id => !inUse.has(id));
  }
  function hasSupportInHand(state, side, id) {
    return (chit(id)?.kind === 'dummy' ? dummyReserve(state,side) : state.hand).includes(id);
  }
  function removableDummy(state, unit) {
    if (!['support','move','reaction'].includes(state.phase) || !unit?.hex || unit.side !== actor(state)) return;
    return unit.support.find(id => chit(id).kind === 'dummy');
  }
  function drop(state, unit, id) {
    if (!unit.support.includes(id)) return;
    unit.support = unit.support.filter(value => value !== id);
    unit.usedSupport = unit.usedSupport.filter(value => value !== id);
    if (unit.fortified === id) unit.fortified = null;
    returnChit(state,id);
  }
  function dropAll(state, unit) {
    for (const id of unit.support.slice()) drop(state,unit,id);
  }
  function moveControl(state, side, hex) {
    for (const unit of state.units) {
      if (unit.side === side || unit.movementOrder?.target !== hex) continue;
      delete unit.movementOrder;
      log(state, `${unit.name}：敵軍が ${hex} に進入したため、移動予約・死守命令を解除しました。`);
    }
    if (city(hex) || source('german',hex) || source('allied',hex)) state.control[hex] = side;
  }
  function unitZoc(unit) {
    if (!unit.hex || (river(unit.hex) && chit(unit.marker)?.event!=='cavalry')) return [];
    return neighbors(unit.hex);
  }
  function zoc(state, side) {
    return new Set(onMap(state,enemy(side)).flatMap(unitZoc));
  }
  function lines(state, side, forSupply = false) {
    const enemies = new Set(onMap(state,enemy(side)).map(u => u.hex));
    const enemyZoc = zoc(state,side);
    const seen = new Set(D.sources[side].filter(h => state.control[h] === side &&
      !enemies.has(h) && (forSupply || !state.bridges[h])));
    const supplyAdjacent = new Set();
    for (const h of seen) {
      if (enemyZoc.has(h) || state.bridges[h]) continue;
      for (const n of neighbors(h)) {
        if (enemies.has(n)) continue;
        if (forSupply) supplyAdjacent.add(n);
        if (isRoad(state,h,n) && (forSupply || !city(n) || state.control[n] === side)) seen.add(n);
      }
    }
    for (const h of supplyAdjacent) seen.add(h);
    return seen;
  }
  function placeMarker(state, card, side, hex) {
    const marker = {
      id: card, name: chit(card).label, side, hex, attack:1, defense:1, transport:0,
      movement:0, mechanized:false, group:null, support:[], usedSupport:[], fortified:null,
      disrupted:false, status:'map', marker:card,
    };
    const previous = unitById(state,card);
    if (previous) Object.assign(previous,marker);
    else state.units.push(marker);
    moveControl(state,side,hex);
  }
  function initialGermanAttackers(state, defenders) {
    const board={...state,phase:'move',turnSide:'german'};
    const attackOptions=new Map(defenders.map(unit=>[unit.hex,[]]));
    for (const unit of onMap(state,'german').filter(unit=>!unit.disrupted && !unit.marker)) {
      const positions=new Set([unit.hex]);
      for (const mode of ['normal','mechanized'])
        for (const hex of movementOptions(board,unit.id,{mode}).keys()) positions.add(hex);
      for (const [hex, attackers] of attackOptions) {
        const adjacent=neighbors(hex).filter(from=>positions.has(from));
        if (!adjacent.length) continue;
        attackers.push({
          strength:unit.attack,
          armor:unit.mechanized && adjacent.some(from=>!attackSupportRestricted({...unit,hex:from},hex,[],false)),
        });
      }
    }
    return attackOptions;
  }
  function autoAlliedSetup(state) {
    const units=onMap(state,'allied').filter(unit=>!unit.marker);
    const attackOptions=initialGermanAttackers(state,units);
    const attached=new Set(units.flatMap(unit=>unit.support));
    state.hand=state.hand.filter(id=>!attached.has(id));
    const strength=unit=>attackOptions.get(unit.hex).reduce((sum,enemy)=>sum+enemy.strength,0);
    const threatened=units.filter(unit=>strength(unit)>=2*unit.defense);
    for (const id of state.hand.slice()) {
      const card=chit(id);
      let candidates=threatened.length ? threatened : units;
      if (card.kind==='fort') candidates=units.filter(unit=>unit.id==='a135' || unit.id==='a61');
      const count=unit=>unit.support.filter(chip=>chit(chip).kind!=='dummy').length;
      if (card.kind!=='dummy') {
        const available=candidates.filter(unit=>count(unit)<3);
        if (available.length) candidates=available;
      }
      if (card.kind==='artillery') {
        const withoutArtillery=candidates.filter(unit=>!unit.support.some(chip=>chit(chip).kind==='artillery'));
        if (withoutArtillery.length) candidates=withoutArtillery;
      }
      const score=unit=>{
        const armor=attackOptions.get(unit.hex).some(enemy=>enemy.armor);
        const defended=count(unit);
        if (card.kind==='dummy') return strength(unit)*0.2-unit.support.length*2;
        const armorBonus=(card.at || card.kind==='fort') && armor ? 7 : 0;
        return Math.min(18,strength(unit))+armorBonus-defended*5;
      };
      const target=candidates.slice().sort((a,b)=>score(b)-score(a))[0];
      if (target) assignInitialSupport(state,target,id);
    }
  }
  function assignInitialSupport(state, unit, id) {
    unit.support.push(id);
    state.hand=state.hand.filter(chip=>chip!==id);
    state.setupOrders.push({unit:unit.id,chit:id});
    state.setupConfirmed=false;
  }
  const initialBridgeHex='2618';
  function setupPlacementRequired(state) {
    return state.hand.some(id=>chit(id).kind!=='dummy');
  }
  function correctInitialBridge(state) {
    if (state.turn!==1 || !['setup','move'].includes(state.phase)) return false;
    const oldHex=Object.keys(state.bridges).find(hex=>['1814','2415'].includes(hex) &&
      state.bridges[hex]==='a-bridge:1');
    const id=oldHex ? state.bridges[oldHex] : state.pendingSetupBridge;
    if (!id || state.bridges[initialBridgeHex]) return false;
    const board={...state, bridges:{...state.bridges}};
    if (oldHex) delete board.bridges[oldHex];
    if (!eventOptions(board,id).includes(initialBridgeHex)) return false;
    state.bridges={...board.bridges,[initialBridgeHex]:id};
    delete state.pendingSetupBridge;
    log(state,`橋梁爆破の初期位置を ${initialBridgeHex} に修正しました。`);
    return true;
  }
  const initialSupport = {
    allied: ['a-fort','a-destroyer','a-arty','a-arty','a-tank','a-tank',...Array(6).fill('a-dummy')],
    german: ['g-panther','g-panther','g-tiger','g-peiper','g-engineer',
      ...Array(3).fill('g-tank'),...Array(4).fill('g-arty'),...Array(6).fill('g-dummy')],
  };
  function startSetup(state, side) {
    state.turnSide=side;
    state.setupOrders=[];
    state.setupConfirmed=false;
    state.hand=initialSupport[side].map(key=>take(state,side,state.cups[side].find(id=>id.startsWith(key+':'))));
    log(state,`${sideName(side)}の初期支援チットを配置してください。`);
  }
  function create(seed = 11162026, mode = 'ai') {
    const state = {
      version:1, mode, revision:0, seed:(seed>>>0)||1, turn:1, turnSide:'german', phase:'setup',
      units:[], control:{}, cups:{german:[],allied:[]}, bridges:{}, depot:false,
      stock:{german:D.supply.german.map((_,i)=>i),allied:D.supply.allied.map((_,i)=>i)},
      groups:{german:0,allied:0}, supplyPoints:0, supplySelection:null, events:[],
      hand:[], captureHold:[], setupOrders:[], airSupply:null, reinforceGroups:[], highbeamUnits:[],
      flags:{monty:false, vt:false, nordwind:false, patton:false, highbeam:false, greif:0, groundedFrom:0, groundedUntil:0},
      trails:[], combat:null, lastBattle:null, winner:null, log:[],
    };
    for (const [h,{col,row}] of map) {
      if (city(h)) state.control[h] = col >= D.borderColumn[row-1] ? 'german' : 'allied';
    }
    for (const side of ['german','allied']) {
      for (const h of D.sources[side]) state.control[h] = side;
      for (const [front,back,name,placement,attack,transport,mechanized] of D.counters[side]) {
        const hex = map.has(placement) ? placement : null;
        state.units.push({
          id:`${side[0]}${front}`, name, side, hex, attack, defense:attack, transport,
          front:`assets/${side}-${front}.jpg`, back:back ? `assets/${side}-back-${back}.jpg` : null,
          movement:5, mechanized:Boolean(mechanized), group:hex ? null : placement,
          support:[], usedSupport:[], fortified:null, disrupted:false, status:hex ? 'map' : 'reserve',
        });
      }
      for (const [key,card] of Object.entries(D.chits)) {
        if (key.startsWith(side[0]+'-')) {
          for (let i=1;i<=card.count;i++) state.cups[side].push(`${key}:${i}`);
        }
      }
    }
    const bridge = state.cups.allied.find(id => id.startsWith('a-bridge:'));
    if (eventOptions(state,bridge).includes(initialBridgeHex)) {
      state.bridges[initialBridgeHex]=take(state,'allied',bridge);
      log(state,`橋梁爆破を ${initialBridgeHex} に配置しました。`);
    }
    const cavalry = state.cups.allied.find(id => id.startsWith('a-cavalry:'));
    const cavalryHex = eventOptions(state,cavalry).find(h => h === '2709') ?? eventOptions(state,cavalry)[0];
    if (cavalryHex) placeMarker(state,take(state,'allied',cavalry),'allied',cavalryHex);
    startSetup(state,'allied');
    autoAlliedSetup(state);
    // The default mode is used by the practice boards.
    if (mode!=='local') startSetup(state,'german');
    return state;
  }
  function moveChits(unit) {
    return unit.support.filter(id => chit(id)?.move);
  }
  function transportableSupport(unit) {
    return unit.support.filter(id => id !== unit.fortified);
  }
  function excessSupport(unit, support) {
    if (chit(support)?.move === 'carry') return [];
    const priority = id => {
      if (id === support) return Infinity;
      const card = chit(id);
      if (card.kind === 'dummy') return 0;
      if (card.kind === 'special') return 1;
      if (card.kind === 'ration') return unit.disrupted ? 9 : 3;
      return 3 + Number(card.kind === 'tank' || card.kind === 'artillery') +
        Number(card.kind === 'fort' || card.move === 'carry') * 2 +
        (card.shift ?? 0) + Number(Boolean(card.at)) + Number(Boolean(card.denyAT)) +
        (card.absorb ?? 0) + (card.inflict ?? 0) + (card.dieAdd ?? 0);
    };
    const carried = transportableSupport(unit);
    const excess = Math.max(0, carried.length - unit.transport);
    return carried.sort((a,b) => priority(a) - priority(b)).slice(0, excess);
  }
  function canOrderUnit(state, unit) {
    return actor(state)==='allied' && ['move', 'reaction', 'highbeam'].includes(state.phase) &&
      Boolean(unit?.side==='allied' && unit.hex && unit.movement && !unit.marker);
  }
  function canOrderDestination(state, unit, hex) {
    return map.has(hex) && !blockedHex(unit.side, hex) && state.control[hex] !== enemy(unit.side) &&
      !at(state, hex).some(occupant => occupant.side !== unit.side);
  }
  function movementOptions(state, id, options) {
    const unit = unitById(state, id);
    return unit?.side==='allied' && unit.movementOrder ? new Map() : movementRoutes(state, unit, options);
  }
  function movementRoutes(state, unit, { mode='normal', support=null, repairBridge=false } = {}) {
    const id = unit?.id;
    const side = actor(state);
    const out = new Map();
    if (!unit?.hex || unit.side !== side || unit.disrupted || !unit.movement ||
        !['move','reaction','highbeam'].includes(state.phase)) return out;
    if (state.phase === 'highbeam' && !state.highbeamUnits.includes(id)) return out;
    if (unit.group === 'RS' && !state.flags.monty) return out;
    if (state.phase === 'reaction' && side === 'allied' && state.flags.greif === state.turn) return out;
    if (!['normal','mechanized'].includes(mode) || (support && !moveChits(unit).includes(support))) return out;
    if (repairBridge && (!['move','reaction'].includes(state.phase) || mode!=='normal' ||
        chit(support)?.move!=='river')) return out;
    const effect = repairBridge ? null : chit(support)?.move;
    const zones = zoc(state,side);
    const ignoreZoc = effect === 'ignoreZoc';
    if (state.phase === 'reaction' && zones.has(unit.hex) && effect !== 'reaction') return out;
    const mechanized = mode === 'mechanized';
    if (mechanized && (!unit.mechanized || ['ignoreZoc','terrain'].includes(effect) ||
        !lines(state,side,true).has(unit.hex) || !neighbors(unit.hex).some(h=>isRoad(state,unit.hex,h)))) return out;
    const max = mechanized ? 10 : unit.movement;
    const enemies = new Set(onMap(state,enemy(side)).map(u=>u.hex));
    const stopOccupied = new Set(onMap(state,side).filter(u=>u.id!==id && !u.marker).map(u=>u.hex));
    const excess = excessSupport(unit,support);
    if (repairBridge && excess.includes(support)) return out;
    const start = { hex:unit.hex, path:[], cost:0, lost:false };
    const queue = [start], best = new Set([unit.hex+'|false']);
    for (const current of queue) {
      if (current.cost >= max) continue;
      for (const hex of neighbors(current.hex)) {
        if (hex === unit.hex || enemies.has(hex) || blockedHex(side,hex)) continue;
        const road = isRoad(state,current.hex,hex);
        if (mechanized && !road) continue;
        const inZone = !ignoreZoc && zones.has(hex);
        if (inZone && current.hex === unit.hex && zones.has(unit.hex)) continue;
        const terrainIgnored = road || effect === 'terrain';
        const loseSupport = !terrainIgnored && effect !== 'carry' && (forest(hex)||ridge(hex));
        const stopTerrain = Boolean(state.bridges[hex]) ||
          (!terrainIgnored && (ridge(hex) || (river(hex) && effect!=='river')));
        const lost = current.lost || loseSupport;
        const route = { hex, path:[...current.path,hex], cost:current.cost+1, lost, stopped:inZone||stopTerrain,
          mode,support,excess,repairBridge };
        if (!stopOccupied.has(hex) && (!repairBridge || (state.bridges[hex] && !lost))) {
          const old = out.get(hex);
          if (!old || (old.lost && !lost) || (old.lost === lost && route.cost<old.cost)) out.set(hex,route);
        }
        const key = hex+'|'+lost;
        if (!route.stopped && !best.has(key)) { best.add(key); queue.push(route); }
      }
    }
    return out;
  }
  function move(state, unit, route, reserved = false) {
    const from = unit.hex;
    const path = [from,...route.path];
    const forestEntries = path.slice(1).filter((hex,index)=>offRoadForest(state,path[index],hex));
    for (const h of route.path) moveControl(state,unit.side,h);
    unit.hex = route.hex;
    if (unit.fortified) drop(state,unit,unit.fortified);
    for (const id of route.excess) drop(state,unit,id);
    if (route.lost) dropAll(state,unit);
    else if (route.support && chit(route.support).discard) drop(state,unit,route.support);
    else if (route.support && !unit.usedSupport.includes(route.support)) unit.usedSupport.push(route.support);
    const trail = { id:unit.id, side:unit.side, path, forestEntries, cost:route.cost,
      lost:route.lost, excess:route.excess, mode:route.mode, repairBridge:route.repairBridge, reserved };
    state.trails.push(trail);
    return trail;
  }
  function reservedRoute(state, unit) {
    const {target} = unit.movementOrder;
    const routes = movementRoutes(state, unit);
    if (!routes.size) return null;
    if (routes.has(target)) return routes.get(target);

    // Estimate the remaining distance from each legal stop this turn.
    const enemies = new Set(onMap(state, enemy(unit.side)).map(other => other.hex));
    const zones = zoc(state, unit.side);
    const costs = new Map([[target, 0]]);
    const queue = [target];
    for (const hex of queue) {
      for (const from of neighbors(hex)) {
        if (costs.has(from) || enemies.has(from) || blockedHex(unit.side, from) ||
            (zones.has(from) && zones.has(hex))) continue;
        costs.set(from, costs.get(hex) + 1);
        queue.push(from);
      }
    }
    let best = null;
    let remaining = costs.get(unit.hex) ?? Infinity;
    for (const route of routes.values()) {
      const cost = costs.get(route.hex) ?? Infinity;
      if (cost < remaining || (best && cost === remaining && best.lost && !route.lost)) {
        best = route;
        remaining = cost;
      }
    }
    return best;
  }
  function followMovementOrders(state, used, pausedReservations) {
    if (state.phase !== 'move' || actor(state)!=='allied') return;
    for (const unit of onMap(state,'allied')) {
      const order = unit.movementOrder;
      if (!order) continue;
      if (!canOrderDestination(state, unit, order.target)) {
        delete unit.movementOrder;
        log(state, `${unit.name}：${order.target} が敵軍の支配下に入ったため、命令を解除しました。`);
        continue;
      }
      if (unit.hex === order.target || pausedReservations.has(unit.id)) continue;
      const route = reservedRoute(state, unit);
      if (!route) continue;
      move(state, unit, route, true);
      used.add(unit.id);
      if (unit.hex === order.target) {
        if (order.type === 'reserve') delete unit.movementOrder;
        log(state, `${unit.name} が ${order.target} に到着。${order.type === 'hold' ? '死守に入ります。' : '移動予約を完了しました。'}`);
      }
    }
  }
  function previewMoves(state, actions, pausedReservations = new Set()) {
    const preview = copy(state), valid = [], rejected = [], used = new Set();
    preview.trails = [];
    followMovementOrders(preview, used, pausedReservations);
    for (const action of actions) {
      const route = !used.has(action.unit) && movementOptions(preview, action.unit, action).get(action.to);
      if (!route) { rejected.push(action); continue; }
      move(preview, unitById(preview, action.unit), route);
      used.add(action.unit); valid.push(action);
    }
    return { state:preview, valid, rejected };
  }
  function canHoldCapturedSupport(state) {
    return state.phase==='support' && actor(state)==='german' &&
      state.events.some(id=>chit(id).event==='capture');
  }
  function captureTargets(state) {
    const supply=lines(state,'german',true);
    return onMap(state,'german').filter(unit=>!unit.marker && !supply.has(unit.hex));
  }
  function airGrounded(state) {
    return state.flags.groundedUntil>0 && state.turn>=state.flags.groundedFrom && state.turn<=state.flags.groundedUntil;
  }
  function eventOptions(state, id) {
    const event = chit(id)?.event;
    const alliedLine = () => [...lines(state,'allied')];
    const onRoad = h => neighbors(h).some(n=>isRoad(state,h,n));
    if (event === 'bridge') return alliedLine().filter(h => river(h) && onRoad(h));
    if (event === 'cavalry') return alliedLine().filter(h => onRoad(h) && !at(state,h).some(u=>u.side==='german'||u.marker));
    if (event === 'haite') return [...map.keys()].filter(h => !at(state,h).some(u=>u.side==='allied'||u.marker) && !source('allied',h));
    if (event === 'depot') return [D.depotHex];
    if (event === 'capture' && state.captureHold?.length) return captureTargets(state).map(unit=>unit.hex);
    if (event === 'fear') {
      const supply = lines(state,'allied',true);
      return onMap(state,'allied').filter(u => !u.marker && !city(u.hex) && !supply.has(u.hex)).map(u=>u.hex);
    }
    if (event === 'air') {
      if (airGrounded(state)) return [];
      const alliedHexes = new Set(onMap(state,'allied').map(unit=>unit.hex));
      return onMap(state,'german').filter(u => !u.marker && (city(u.hex)||neighbors(u.hex).some(h=>alliedHexes.has(h))) &&
        (!u.disrupted||u.support.length)).map(u=>u.hex);
    }
    return [];
  }
  function remove(state, unit) {
    dropAll(state,unit);
    unit.hex = null;
    delete unit.movementOrder;
    unit.status = unit.marker ? 'spent' : 'removed';
    unit.returnTurn = state.turn+2;
    if (unit.marker && unit.side === 'allied') returnChit(state,unit.marker);
  }
  function resolveEvent(state, id, target, effect) {
    const card = chit(id), event = card.event, options = eventOptions(state,id);
    if (options.length ? !options.includes(target) : target != null) return false;
    const unitAt = side => at(state,target).find(unit=>unit.side===side && !unit.marker);
    let outcome = target ? `${target} に配置しました。` : '有効な対象がなく、カップに戻しました。';
    switch (event) {
      case 'bridge':
        if (target) state.bridges[target] = id;
        break;
      case 'cavalry':
      case 'haite':
        if (target) placeMarker(state,id,event==='cavalry' ? 'allied' : 'german',target);
        break;
      case 'depot':
        state.depot = true;
        outcome = 'Spa（2005）に配置しました。ドイツ軍の支配中は補給ポイントが毎ターン3増えます。';
        break;
      case 'fear':
        if (target) {
          const unit = unitAt('allied');
          remove(state,unit);
          outcome = `${unit.name}（${target}）を除去しました。`;
        }
        break;
      case 'air':
        if (airGrounded(state)) outcome = 'ボーデンプラッテ作戦の効果中のため無効です。';
        if (target) {
          const unit = unitAt('german');
          const flak = unit.support.find(ch=>chit(ch).kind==='airDefense');
          if (flak) {
            if (!unit.usedSupport.includes(flak)) unit.usedSupport.push(flak);
            outcome = `${unit.name} の高射砲大隊が空軍支援を無効にしました。`;
          } else if (effect==='pile' || (effect==null && unit.disrupted)) {
            const count = unit.support.length;
            dropAll(state,unit);
            outcome = `${unit.name} の支援チット${count}枚をカップに戻しました。`;
          } else if (unit.disrupted) {
            outcome = `${unit.name} はすでに混乱しています。`;
          } else {
            unit.disrupted = true;
            outcome = `${unit.name} を混乱させました。`;
          }
        }
        break;
      case 'capture': {
        const held = state.captureHold ?? [];
        if (target) {
          const unit = unitAt('german');
          unit.support.push(...held);
          outcome = `${unit.name} に保留中の支援チット${held.length}枚を配属しました。`;
        } else if (held.length) {
          for (const chip of held) returnChit(state,chip);
          outcome = '対象部隊がいないため、保留した支援チットをカップに戻しました。';
        } else outcome = '保留した支援チットがありません。';
        state.captureHold=[];
        break;
      }
      case 'monty':
      case 'vt':
      case 'highbeam':
      case 'nordwind':
        state.flags[event] = true;
        outcome = D.chitGuide[id.split(':')[0]].effects[0];
        break;
      case 'patton':
        if (state.phase==='reinforce') {
          state.flags.patton = false;
          outcome = callReinforcementGroup(state,'allied');
          break;
        }
        state.flags.patton = true;
        outcome = state.flags.nordwind && D.supply.allied[state.supplySelection]?.[1]!=='normal'
          ? 'ノルトヴィント作戦の効果で、今回の繰り上げ増援は取り消されます。'
          : D.chitGuide['a-patton'].effects[0];
        break;
      case 'greif':
        state.flags.greif = state.turn;
        outcome = `第${state.turn}ターンの連合軍対応移動を止めます。`;
        break;
      case 'bodenplatte':
        state.flags.groundedFrom = state.turn + 1;
        state.flags.groundedUntil = state.turn + 2;
        outcome = `第${state.flags.groundedFrom}・${state.flags.groundedUntil}ターンの連合軍空軍支援を無効にします。`;
        break;
      default: return false;
    }
    if (['fear','air','capture'].includes(event) || (!target && ['bridge','cavalry'].includes(event))) returnChit(state,id);
    log(state,`${card.label}：${outcome}`);
    return true;
  }
  function drawChits(state, side, count, destination = null) {
    // Draw without replacement, even when a drawn event later returns to the cup.
    // Older saves can contain dummies returned to the cup.
    const cup = state.cups[side] = state.cups[side].filter(id => chit(id).kind !== 'dummy');
    const drawn = [];
    for (let i=0;i<count && cup.length;i++) {
      const id = cup.splice(roll(state,cup.length),1)[0];
      drawn.push(id);
    }
    for (const id of drawn) {
      if (chit(id).kind === 'event') {
        state.events.push(id);
        log(state,`${sideName(side)}がイベントチット「${chit(id).label}」を引きました。`);
      }
      else if (destination) destination.support.push(id);
      else state.hand.push(id);
    }
    return drawn;
  }
  function placements(state, id) {
    const unit = unitById(state,id), side=actor(state);
    if (!unit || unit.side!==side || unit.hex) return [];
    const reentry = state.phase==='reentry' && unit.status==='removed' && unit.returnTurn<=state.turn;
    const reinforcement = state.phase==='reinforce' && !state.events.length &&
      unit.status==='reserve' && state.reinforceGroups.includes(unit.group);
    if (!reentry && !reinforcement) return [];
    const connected = lines(state,side);
    return [...connected].filter(h => state.control[h]===side && !at(state,h).some(u=>!u.marker || u.side!==side) &&
      !blockedHex(side,h) && (unit.group==='RS' && reinforcement
        ? D.victoryCities.includes(h)
        : city(h) || (reinforcement && source(side,h))));
  }
  function eligiblePlacements(state) {
    return state.units.filter(unit => placements(state,unit.id).length);
  }
  function placeUnit(state, id, hex) {
    if (!placements(state,id).includes(hex)) return null;
    const unit=unitById(state,id);
    unit.hex=hex;
    unit.status='map';
    unit.disrupted=state.phase==='reentry';
    return unit;
  }
  function previewReinforcements(state, orders) {
    const board=copy(state), valid=[], rejected=[];
    for (const order of orders) {
      if (board.phase==='reinforce' && order && placeUnit(board,order.unit,order.hex)) valid.push(order);
      else rejected.push(order);
    }
    return {state:board,valid,rejected};
  }
  function supportTargets(state) {
    const side=actor(state), network=lines(state,side,true);
    return onMap(state,side).filter(u => !u.marker && (network.has(u.hex) ||
      (side==='allied' && city(u.hex) && (!state.airSupply || state.airSupply===u.id))));
  }
  function supportPlacementStatus(state) {
    const remaining=state.hand.filter(id=>chit(id).kind!=='dummy').length;
    const required=remaining>0 && (canHoldCapturedSupport(state) || supportTargets(state).length>0);
    return {remaining,required};
  }
  function alliedSupportTarget(state, id, targets) {
    if (!targets.length) return null;
    const card=chit(id);
    const germans=onMap(state,'german').filter(unit=>!unit.marker&&!unit.disrupted);
    const germanMove={...state,phase:'move',turnSide:'german'};
    const roadPressure=new Map();
    const tankReach=new Set();
    for (const unit of germans.filter(unit=>unit.mechanized)) {
      const reach=new Set();
      for (const route of movementOptions(germanMove,unit.id,{mode:'mechanized'}).values())
        for (const hex of neighbors(route.hex)) reach.add(hex);
      for (const hex of reach) roadPressure.set(hex,(roadPressure.get(hex) ?? 0)+1);
      if (card.kind==='fort') {
        for (const hex of [...reach,...neighbors(unit.hex)]) tankReach.add(hex);
        for (const route of movementOptions(germanMove,unit.id).values())
          for (const hex of neighbors(route.hex)) tankReach.add(hex);
      }
    }
    const roadDegree=hex=>neighbors(hex).filter(next=>isRoad(state,hex,next)).length;
    const important=hex=>finalVictoryCities.includes(hex) || D.victoryCities.includes(hex);
    const siteValue=hex=>Number(important(hex))*8+Number(city(hex))*3+Math.max(0,roadDegree(hex)-2)*3;
    const holding=hex=>siteValue(hex)+Number(ridge(hex))*2-Number(river(hex))*2;
    const threat=hex=>{
      const close=germans.reduce((sum,unit)=>sum+Math.max(0,4-distance(hex,unit.hex)),0);
      return Math.min(12,close)+(roadPressure.get(hex) ?? 0)*2;
    };
    if (card.kind==='fort') {
      const unfortified=targets.filter(unit=>!unit.support.some(chip=>chit(chip).kind==='fort'));
      const eligible=unfortified.length ? unfortified : targets;
      const exposed=eligible.filter(unit=>tankReach.has(unit.hex));
      const candidates=exposed.length ? exposed : eligible;
      const weights=candidates.map(({hex,support,transport})=>Math.max(1,
        5+Number(city(hex))*3+Number(important(hex))*3+Math.max(0,roadDegree(hex)-2)*3+
        Math.min(4,threat(hex))-Math.max(0,support.length+1-transport)*3));
      const seed=(Math.imul(state.seed,0x9e3779b1)^Math.imul(state.turn+state.revision,0x85ebca6b))>>>0;
      // Sample independently of the game's dice and draw sequence.
      let pick=roll({seed:seed||1},weights.reduce((sum,weight)=>sum+weight,0));
      return candidates.find((_,index)=>(pick-=weights[index])<0);
    }
    function mobilityValue(unit) {
      if (unit.disrupted || finalVictoryCities.includes(unit.hex)) return -8;
      const phase=card.move==='reaction' ? 'reaction' : 'move';
      const board={...state,phase,turnSide:phase==='reaction'?'german':'allied'};
      const candidate={...unit,support:[...unit.support,id]};
      const withCard={...board,units:board.units.map(current=>current.id===unit.id?candidate:current)};
      const ordinary=movementOptions(board,unit.id);
      const assisted=movementOptions(withCard,unit.id,{support:id});
      let benefit=0;
      for (const route of assisted.values()) {
        const base=ordinary.get(route.hex);
        if (!base || route.cost<base.cost || (base.lost && !route.lost)) {
          benefit=Math.max(benefit,siteValue(route.hex)+Math.min(5,threat(route.hex)));
        }
      }
      return benefit*3;
    }
    function score(unit) {
      const {hex,support}=unit;
      const danger=threat(hex);
      const capacity=Math.max(0,support.length+1-unit.transport);
      let value=holding(hex)+danger-capacity*9-support.length*2;
      if (id.startsWith('a-nuts:')) value+=hex==='1716'?120:important(hex)?65:city(hex)?16:0;
      if (card.kind==='artillery' || card.at) {
        value+=danger;
        if (card.at && ridge(hex)) value-=10;
        if (support.some(chip=>card.at?chit(chip).at:chit(chip).kind==='artillery')) value-=16;
      }
      if (card.kind==='ration') {
        if (unit.disrupted) value+=100;
        if (support.some(chip=>chit(chip).kind==='ration')) value-=110;
      }
      if (card.move) value=mobilityValue(unit)+danger*.4-capacity*9-support.length*2;
      if (card.kind==='dummy') value=danger-capacity*12-support.length*5;
      return value;
    }
    return targets.map(unit=>({unit,value:score(unit)})).sort((a,b)=>b.value-a.value)[0].unit;
  }
  function callReinforcementGroup(state, side) {
    const group = 'R'+(state.groups[side]+1);
    if (!state.units.some(unit=>unit.side===side && unit.group===group && unit.status==='reserve'))
      return '未登場の増援グループはありません。';
    if (side==='allied' && state.flags.nordwind) {
      state.flags.nordwind=false;
      return 'ノルトヴィント作戦により米軍増援の登場を延期します。';
    }
    state.groups[side]++;
    state.reinforceGroups.push(group);
    return `${group} の増援が登場します。`;
  }
  function gainReinforcements(state) {
    const side=state.turnSide;
    state.reinforceGroups=state.units.filter(u=>u.side===side&&u.status==='reserve'&&
      /^R\d$/.test(u.group)&&Number(u.group[1])<=state.groups[side]).map(u=>u.group);
    const selected=D.supply[side][state.supplySelection]?.[1];
    if (selected==='special') state.reinforceGroups.push('RS');
    if (selected==='normal') log(state,callReinforcementGroup(state,side));
    if (side==='allied' && state.flags.patton) {
      log(state,`パットンの救援：${callReinforcementGroup(state,side)}`);
      state.flags.patton=false;
    }
  }
  function upcomingAlliedReinforcements(state) {
    if (state.phase!=='move' || state.turnSide!=='allied' || state.turn===1) return null;
    const board=copy(state);
    board.phase='reinforce';
    gainReinforcements(board);
    return board.reinforceGroups.length ? board : null;
  }
  function begin(state, phase) {
    state.phase=phase;
    delete state.recoveryUndo;
    delete state.supportDraw;
    delete state.supportUndo;
    delete state.supportConfirmed;
    if (['move','reaction','highbeam'].includes(phase)) state.trails=[];
    if (phase==='support') {
      state.supportDraw=drawChits(state,actor(state),state.supplyPoints);
      state.supplyPoints=0;
    }
    if (phase==='reinforce') gainReinforcements(state);
    if (phase==='supply') {
      state.supplySelection=null;
      state.supplyPoints=0;
      state.airSupply=null;
      state.captureHold=[];
      state.reinforceGroups=[];
      state.highbeamUnits=[];
      state.hand=[];
      state.events=[];
    }
    log(state,`${sideName(actor(state))}の${phaseNames[phase]}フェイズ。`);
  }
  function germanCaptured(state) {
    return D.sources.german.filter(h=>state.control[h]==='allied').length;
  }
  function endGame(state, winner, reason) {
    state.phase='over'; state.winner=winner; state.combat=null;
    log(state,`${sideName(winner)}の勝利。${reason}`);
  }
  function checkGermanSuddenDeath(state) {
    const h=D.victoryCities.find(h=>state.control[h]==='german');
    if (h) endGame(state,'german',`${D.cities[h]}を占領しました。`);
    return Boolean(h);
  }
  function nextPhase(state, from = state.phase) {
    if (checkGermanSuddenDeath(state)) return;
    if (from === 'highbeam') { begin(state,'reaction'); return; }
    if (from === 'move' && state.turn===1) { begin(state,'reaction'); return; }
    if (from === 'reinforce' && state.highbeamUnits.length) { begin(state,'highbeam'); return; }
    if (from !== 'counter') { begin(state,phases[phases.indexOf(from)+1]); return; }
    if (state.turnSide==='allied') { state.turnSide='german'; begin(state,'supply'); return; }
    if (germanCaptured(state)>=6) { endGame(state,'allied','ドイツ軍補給源を6か所以上支配しました。'); return; }
    if (state.turn===10) {
      // Starting German cities and captured cities use the same control and connection checks.
      const cities=[...lines(state,'german')].filter(h=>city(h) && state.control[h]==='german').length;
      const goal=finalVictoryCities.find(h=>state.control[h]==='german');
      if (goal || cities>=20) endGame(state,'german',goal ? `${D.cities[goal]}を支配しました。` : `連絡線の通じる都市を${cities}か所支配しました。`);
      else endGame(state,'allied','最終ターンのドイツ軍勝利条件を阻止しました。');
      return;
    }
    state.turn++; state.turnSide='allied'; begin(state,'supply');
  }

  // Combat and commands use the same state on either player's screen.
  function canAttack(state, unit) {
    return Boolean(unit?.hex && !unit.disrupted && !unit.marker && unit.side===actor(state));
  }
  function battleCandidates(state, target) {
    if (!['attack','counter'].includes(state.phase) || !at(state,target).some(u=>u.side===enemy(actor(state)))) return [];
    return onMap(state,actor(state)).filter(u=>canAttack(state,u)&&neighbors(u.hex).includes(target));
  }
  function validateAttacks(state, attacks) {
    const ids = new Set(), targets = new Set();
    for (const entry of attacks) {
      if (targets.has(entry.target) || !Array.isArray(entry.attackers) || !entry.attackers.length) return false;
      const legal = new Set(battleCandidates(state,entry.target).map(u=>u.id));
      for (const id of entry.attackers) {
        if (!legal.has(id) || ids.has(id)) return false;
        ids.add(id);
      }
      targets.add(entry.target);
    }
    return true;
  }
  function ratioColumn(attack,defense) {
    if (attack>=defense) {
      const ratio=Math.floor(attack/defense);
      return ratio>=5 ? 5 : ratio>=3 ? 4 : ratio>=2 ? 3 : 2;
    }
    return Math.ceil(defense/attack)>=3 ? 0 : 1;
  }
  function battleInfo(state) {
    const current=state.combat?.queue[0];
    if (!current) return null;
    const attackers=current.attackers.map(id=>unitById(state,id)).filter(u=>canAttack(state,u));
    const defenders=at(state,current.target).filter(u=>u.side!==state.combat.side);
    const attack=attackers.reduce((sum,u)=>sum+u.attack,0);
    const defense=defenders.reduce((sum,u)=>sum+u.defense,0);
    return { target:current.target, attackers, defenders, attack, defense,
      number:state.combat.total-state.combat.queue.length+1, total:state.combat.total };
  }
  const isTankOrArtillery = id => ['tank','artillery'].includes(chit(id).kind);
  function possibleSupport(unit, defensive, restricted = false) {
    if (unit.marker) return [];
    const kinds=['tank','artillery','damage','engineer','dice','dummy'];
    if (defensive) kinds.push('fort');
    return unit.support.filter(id=>kinds.includes(chit(id).kind) && (!restricted || !isTankOrArtillery(id)));
  }
  function attackSupportRestricted(unit, target, cards, fortifiedDefense) {
    const support=cards.map(chit);
    const ignoresTerrain=support.some(card=>card.move==='terrain');
    const crossesRiver=ignoresTerrain || support.some(card=>card.move==='river');
    const breachesFort=support.some(card=>card.breakFort);
    const protectedFort=(unit.side==='allied' && fort(target)) || (fortifiedDefense && !breachesFort);
    return (river(unit.hex) && !crossesRiver) ||
      (!ignoresTerrain && (protectedFort || (ridge(target) && !ridge(unit.hex))));
  }
  function hasFortifiedDefense(defenders, choices) {
    return defenders.some(unit=>unit.fortified || (choices[unit.id] ?? []).some(id=>chit(id).kind==='fort'));
  }
  function defaultSupport(info) {
    if (!info) return {};
    const result={};
    for (const [units,defensive] of [[info.defenders,true],[info.attackers,false]]) {
      const fortifiedDefense=!defensive && hasFortifiedDefense(info.defenders,result);
      let usedArtillery=false;
      for (const u of units) {
        const available=possibleSupport(u,defensive).filter(id=>chit(id).kind!=='dummy');
        const priorities={fort:9,engineer:6,artillery:5,tank:4,damage:3,dice:2};
        const rank=id=>defensive && id.startsWith('a-nuts:') ? 10 : priorities[chit(id).kind];
        available.sort((a,b)=>rank(b)-rank(a));
        const selected=result[u.id]=[];
        for (const id of available) {
          if (selected.length===3) break;
          if (!defensive && isTankOrArtillery(id) &&
              attackSupportRestricted(u,info.target,selected,fortifiedDefense)) continue;
          if (chit(id).kind==='artillery') { if (usedArtillery) continue; usedArtillery=true; }
          selected.push(id);
        }
      }
    }
    return result;
  }
  function combatProfile(state, choices, atTargets = null) {
    const info=battleInfo(state);
    if (!info?.attackers.length || !info.defenders.length) return null;
    const group=(units,defensive)=>units.map(unit=>{
      const legal=possibleSupport(unit,defensive);
      const selected=choices[unit.id] ?? [];
      if (!Array.isArray(selected) || selected.length>3 || new Set(selected).size!==selected.length ||
          selected.some(id=>!legal.includes(id))) throw Error('支援チットの選択を確認してください。');
      return {unit, cards:selected.slice()};
    });
    const attack=group(info.attackers,false), defend=group(info.defenders,true);
    const cards=list=>list.flatMap(entry=>entry.cards.map(chit));
    const fortifiedDefense=hasFortifiedDefense(info.defenders,choices);
    for (const entry of attack) {
      entry.supportRestricted=attackSupportRestricted(entry.unit,info.target,entry.cards,fortifiedDefense);
      if (entry.supportRestricted) entry.cards=entry.cards.filter(id=>!isTankOrArtillery(id));
    }
    if ([attack,defend].some(group=>cards(group).filter(card=>card.kind==='artillery').length>1))
      throw Error('砲兵支援は片側につき1枚までです。');
    const denied=cards([...attack,...defend]).some(card=>card.denyAT);
    const shotDown=[];
    let atIndex=0, nextAT=null;
    function antiTank(from,to) {
      const shots=from.flatMap(entry=>entry.cards.filter(id=>chit(id).at && !(denied && entry.unit.side==='allied')));
      for (const _ of shots) {
        const candidates=to.flatMap(entry=>entry.cards.filter(id=>chit(id).kind==='tank').map(id=>({entry,id})))
          .sort((a,b)=>Number(chit(b.id).at)-Number(chit(a.id).at) || (chit(b.id).shift||0)-(chit(a.id).shift||0));
        if (!candidates.length) break;
        let target=candidates[0];
        if (atTargets && from[0].unit.side==='german') {
          if (atIndex===atTargets.length) {
            nextAT=candidates.map(({entry,id})=>({unit:entry.unit.id,id}));
            break;
          }
          target=candidates.find(({id})=>id===atTargets[atIndex++]);
          if (!target) throw Error('除去する戦車系チットを選んでください。');
        }
        target.entry.cards=target.entry.cards.filter(id=>id!==target.id);
        shotDown.push({unit:target.entry.unit,id:target.id});
      }
    }
    antiTank(defend,attack);
    if (!nextAT) antiTank(attack,defend);
    const shift=list=>cards(list).reduce((sum,c)=>sum+(c.shift||0),0);
    const base=ratioColumn(info.attack,info.defense);
    const col=Math.max(0,Math.min(5,base+shift(attack)-shift(defend)));
    const artyAttack=cards(attack).some(c=>c.kind==='artillery');
    const artyDefend=cards(defend).some(c=>c.kind==='artillery');
    const artillerySide=artyAttack===artyDefend ? null : (artyAttack ? attack[0].unit.side : defend[0].unit.side);
    return { ...info, attackGroup:attack, defendGroup:defend, base, col, shotDown, nextAT, artillerySide, deniedAT:denied,
      dieAdd:cards([...attack,...defend]).reduce((sum,c)=>sum+(c.dieAdd||0),0),
      vt:state.flags.vt&&(attack[0].unit.side==='allied'?artyAttack:artyDefend) };
  }
  function damageFor(result) {
    return { attacker:Number(/A(\d)/.exec(result)?.[1] || 0), defender:Number(/D(\d)/.exec(result)?.[1] || 0) };
  }
  function combatDamage(profile, result) {
    const {attackGroup,defendGroup,vt}=profile;
    const side=profile.attackers[0].side;
    const attackCards=attackGroup.flatMap(entry=>entry.cards.map(chit));
    const defendCards=defendGroup.flatMap(entry=>entry.cards.map(chit));
    const total=(cards,key)=>cards.reduce((sum,card)=>sum+(card[key]||0),0);
    const damage=damageFor(result);
    return {
      attackDamage:Math.max(0,damage.attacker-total(attackCards,'absorb')+total(defendCards,'inflict'))+
        Number(vt&&side==='german'),
      defendDamage:Math.max(0,damage.defender-total(defendCards,'absorb')+total(attackCards,'inflict'))+
        Number(vt&&side==='allied'),
    };
  }
  function decisiveAttack(profile, die) {
    const result=D.crt[Math.min(6,die+profile.dieAdd)-1][profile.col];
    const {attackDamage,defendDamage}=combatDamage(profile,result);
    const tanks=entry=>entry.cards.filter(id=>chit(id).kind==='tank').length;
    if (profile.attackGroup.some(entry=>attackDamage>tanks(entry))) return false;
    if (profile.defenders.filter(unit=>!unit.marker).length>1) return false;
    const steps=profile.defendGroup.reduce((sum,entry)=>{
      const unit=typeof entry.unit==='string' ? profile.defenders.find(defender=>defender.id===entry.unit) : entry.unit;
      return sum+(unit.marker || unit.disrupted ? 1 : 2)+tanks(entry);
    },0);
    return defendDamage>=steps;
  }
  function suggestedDie(profile) {
    if (!profile?.artillerySide) return null;
    const attacking=profile.artillerySide===profile.attackers[0].side;
    if (attacking && profile.artillerySide==='allied') {
      for (let die=1;die<=6;die++) if (decisiveAttack(profile,die)) return die;
    }
    let best=1, value=-Infinity;
    for (let die=1;die<=6;die++) {
      const result=damageFor(D.crt[Math.min(6,die+profile.dieAdd)-1][profile.col]);
      const score=(result.defender-result.attacker*profile.attackers.length)*(attacking?1:-1);
      if (score>value) { value=score; best=die; }
    }
    return best;
  }
  function applyDamage(state, entry, damage) {
    // Only tanks that took part in this battle can absorb damage.
    const unit=entry.unit, usedTanks=entry.cards.filter(id=>chit(id).kind==='tank' && unit.support.includes(id));
    const assignedDamage=damage;
    const absorbed=[];
    while (damage>0 && usedTanks.length) {
      const id=usedTanks.pop();
      absorbed.push(id);
      drop(state,unit,id); damage--;
    }
    let effect=null, returnedUnused=0;
    while (damage>0 && unit.hex) {
      if (unit.disrupted || unit.marker) {
        returnedUnused=unit.support.filter(id=>!entry.cards.includes(id)).length;
        remove(state,unit); effect='removed';
      } else { unit.disrupted=true; effect='disrupted'; }
      damage--;
    }
    return {unit:unit.id, damage:assignedDamage, absorbed, effect, returnedUnused};
  }
  function revealBattle(state, choices, atTargets = null) {
    const profile=combatProfile(state,choices,atTargets);
    if (!profile || profile.nextAT) return false;
    const {base,col,dieAdd,artillerySide,vt,deniedAT}=profile;
    const declared=group=>group.map(({unit,cards})=>({
      unit:unit.id, declared:choices[unit.id] ?? [], cards:cards.filter(id=>chit(id).kind!=='dummy'),
    }));
    const shotDown=profile.shotDown.map(({unit,id})=>({unit:unit.id,id}));
    const attackGroup=declared(profile.attackGroup), defendGroup=declared(profile.defendGroup);
    const dummies=[];
    for (const entry of [...attackGroup,...defendGroup]) {
      for (const id of entry.declared.filter(id=>chit(id).kind==='dummy')) dummies.push({unit:entry.unit,id});
    }
    for (const {unit,id} of [...shotDown,...dummies]) drop(state,unitById(state,unit),id);
    for (const entry of [...attackGroup,...defendGroup]) {
      const unit=unitById(state,entry.unit);
      for (const id of entry.cards) {
        if (chit(id).kind==='fort') unit.fortified=id;
        if (!unit.usedSupport.includes(id)) unit.usedSupport.push(id);
      }
    }
    delete state.combat.openSupport;
    state.combat.revealed={attackGroup,defendGroup,base,col,dieAdd,artillerySide,vt,deniedAT,shotDown,dummies};
    return true;
  }
  function rollRevealedBattle(state, chosenDie) {
    const {revealed, rolled}=state.combat;
    if (!revealed || rolled) return false;
    const {artillerySide,dieAdd,col}=revealed;
    const die=artillerySide
      ? (Number.isInteger(chosenDie) && chosenDie>=1 && chosenDie<=6
        ? chosenDie : suggestedDie({...battleInfo(state),...revealed}))
      : roll(state,6)+1;
    const adjusted=Math.min(6,die+dieAdd);
    state.combat.rolled={die,adjusted,result:D.crt[adjusted-1][col]};
    return true;
  }
  function applyBattleLosses(state, preferDefenderLoss = false) {
    const {revealed,rolled,lossesApplied}=state.combat;
    if (!rolled || lossesApplied) return false;
    const info=battleInfo(state);
    const {target}=info, {col,base,artillerySide,vt,shotDown}=revealed;
    const {die,adjusted,result}=rolled;
    const hydrate=group=>group.map(({unit,cards})=>({unit:unitById(state,unit),cards}));
    const attackGroup=hydrate(revealed.attackGroup), defendGroup=hydrate(revealed.defendGroup);
    const {attackDamage,defendDamage}=combatDamage({...info,attackGroup,defendGroup,vt},result);
    const outcomes=[];
    let remainingDefense=defendDamage;
    const stacked=defendGroup.find(e=>e.unit.marker);
    const defender=defendGroup.find(e=>!e.unit.marker) ?? defendGroup[0];
    if (stacked && stacked!==defender && remainingDefense>0) {
      const defenderCapacity = (defender.unit.disrupted ? 1 : 2) +
        defender.cards.filter(id=>chit(id).kind==='tank').length;
      if (!preferDefenderLoss || remainingDefense>defenderCapacity) {
        outcomes.push(applyDamage(state,stacked,1));
        remainingDefense--;
      }
    }
    for (const entry of attackGroup) {
      const hex=entry.unit.hex;
      outcomes.push(applyDamage(state,entry,attackDamage));
      if (!entry.unit.hex) {
        for (const marker of at(state,hex).filter(u=>u.marker&&u.side===entry.unit.side))
          outcomes.push(applyDamage(state,{unit:marker,cards:[]},1));
      }
    }
    outcomes.push(applyDamage(state,defender,remainingDefense));
    for (const entry of [...attackGroup,...defendGroup]) {
      for (const id of entry.cards) if (chit(id).discard) drop(state,entry.unit,id);
    }
    state.lastBattle={ target, die, adjusted, result, attackDamage, defendDamage, outcomes,
      support:[...revealed.attackGroup,...revealed.defendGroup], dummies:revealed.dummies,
      shotDown, base:D.crtColumns[base], odds:D.crtColumns[col], attack:info.attack, defense:info.defense,
      side:state.combat.side, artillerySide,
      attackers:info.attackers.map(u=>u.id), defenders:info.defenders.map(u=>u.id) };
    log(state,`${target} 戦闘比 ${D.crtColumns[col]}、出目 ${adjusted}、結果 ${result}。攻撃側 ${attackDamage}／防御側 ${defendDamage} 損害。`);
    state.combat.lossesApplied=true;
    return true;
  }
  function advanceCandidates(state) {
    const {target,attackers}=state.lastBattle;
    if (at(state,target).length || blockedHex(state.combat.side,target)) return [];
    return attackers.filter(id=>{
      const unit=unitById(state,id);
      return unit.hex&&!unit.disrupted&&!unit.movementOrder;
    });
  }
  function continueBattle(state) {
    if (!state.combat.lossesApplied) return false;
    const target=state.lastBattle.target;
    const advance=advanceCandidates(state);
    state.combat.queue.shift();
    delete state.combat.revealed;
    delete state.combat.rolled;
    delete state.combat.lossesApplied;
    if (advance.length) {
      state.combat.advance={ hex:target, ids:advance };
      state.phase='advance';
    } else finishBattle(state);
    return true;
  }
  function rollBattle(state, choices, chosenDie) {
    if (state.combat.openSupport) return false;
    if (state.combat.revealed) return rollRevealedBattle(state,chosenDie);
    const info=battleInfo(state);
    if (!info) return false;
    if (!info.attackers.length || !info.defenders.length) {
      state.combat.queue.shift();
      log(state,`${info.target}の戦闘は参加部隊がいないため終了。`);
      finishBattle(state);
      return true;
    }
    // Legacy callers must explicitly declare their support before a one-step roll.
    if (!choices) return false;
    return revealBattle(state,choices) && rollRevealedBattle(state,chosenDie) &&
      applyBattleLosses(state) && continueBattle(state);
  }
  function finishBattle(state) {
    if (state.combat.queue.length) { state.phase='resolve'; return; }
    const from=state.combat.from;
    state.combat=null;
    nextPhase(state,from);
  }

  // Commands are atomic. A rejected command never mutates the supplied state.
  function apply(state, command) {
    if (!command || command.side!==actor(state) || state.phase==='over' ||
        (command.revision!==undefined && command.revision!==state.revision)) return {ok:false, error:'手番または盤面が更新されました。'};
    const next=copy(state);
    try {
      if (!execute(next,command)) return {ok:false,error:'現在のフェイズではその操作ができません。'};
      if (state.phase==='support' && ['assign','hold-capture','release-capture','remove-dummy'].includes(command.type)) {
        const unit=unitById(state,command.unit);
        (next.supportUndo ??= []).push({
          hand:state.hand.slice(), captureHold:state.captureHold?.slice() ?? [], airSupply:state.airSupply ?? null,
          unit:unit && {id:unit.id, support:unit.support.slice(), usedSupport:unit.usedSupport.slice(), fortified:unit.fortified},
        });
        next.supportConfirmed=false;
      }
      next.revision++;
      return {ok:true,state:next};
    } catch (error) {
      return {ok:false,error:error.message};
    }
  }
  function execute(state, action) {
    const side=actor(state), phase=state.phase, unit=unitById(state,action.unit);
    switch (action.type) {
      case 'supply':
        if (phase!=='supply' || !state.stock[side].includes(action.index)) return false;
        state.stock[side]=state.stock[side].filter(i=>i!==action.index);
        state.supplySelection=action.index;
        state.supplyPoints=D.supply[side][action.index][0]+(side==='german'&&state.depot&&state.control[D.depotHex]==='german'?3:0);
        log(state,`${sideName(side)}が補給ポイント ${state.supplyPoints} を取得。`);
        nextPhase(state);
        return true;
      case 'place': {
        if (!placeUnit(state,action.unit,action.hex)) return false;
        if (phase==='reinforce' && source(side,unit.hex)) drawChits(state,side,unit.transport,unit);
        if (phase==='reinforce' && side==='allied' && state.flags.highbeam && unit.group!=='RS' &&
            (!state.highbeamUnits.length || unitById(state,state.highbeamUnits[0]).group===unit.group)) state.highbeamUnits.push(unit.id);
        log(state,`${unit.name} を ${unit.hex} に${phase==='reentry'?'再配置':'配置'}。`);
        return true;
      }
      case 'place-reinforcements': {
        const orders=action.placements;
        if (phase!=='reinforce' || !Array.isArray(orders) || !orders.length ||
            previewReinforcements(state,orders).rejected.length) return false;
        for (const order of orders) {
          if (!execute(state,{type:'place',unit:order.unit,hex:order.hex})) return false;
          if (state.events.length) break;
        }
        return true;
      }
      case 'recover':
        if (phase!=='recovery' || unit?.side!==side || !unit.hex || !unit.disrupted || state.supplyPoints<3) return false;
        unit.disrupted=false; state.supplyPoints-=3; return true;
      case 'recover-batch': {
        const ids=action.units;
        if (phase!=='recovery' || !Array.isArray(ids) || !ids.length ||
            new Set(ids).size!==ids.length || state.supplyPoints<ids.length*3) return false;
        const units=ids.map(id=>unitById(state,id));
        if (units.some(unit=>!unit?.hex || unit.side!==side || !unit.disrupted || unit.marker)) return false;
        for (const unit of units) {
          unit.disrupted=false;
          log(state,`${unit.name} が混乱から回復。`);
        }
        state.supplyPoints-=ids.length*3;
        state.recoveryUndo=[...(state.recoveryUndo ?? []),...ids];
        return true;
      }
      case 'undo-recovery': {
        if (phase!=='recovery' || !state.recoveryUndo?.length) return false;
        const restored=unitById(state,state.recoveryUndo.at(-1));
        if (!restored?.hex || restored.side!==side || restored.disrupted) return false;
        restored.disrupted=true;
        state.supplyPoints+=3;
        state.recoveryUndo.pop();
        log(state,`${restored.name} の回復を取り消しました。`);
        return true;
      }
      case 'assign': {
        if (phase==='setup') {
          if (!state.hand.includes(action.chit) || !unit?.hex || unit.marker || unit.side!==side) return false;
          assignInitialSupport(state,unit,action.chit);
          return true;
        }
        if (phase!=='support' || !hasSupportInHand(state,side,action.chit) || !supportTargets(state).includes(unit)) return false;
        if (side==='allied' && !lines(state,side,true).has(unit.hex)) state.airSupply=unit.id;
        unit.support.push(action.chit); state.hand=state.hand.filter(id=>id!==action.chit); return true;
      }
      case 'remove-dummy': {
        const id=removableDummy(state,unit);
        if (!id) return false;
        drop(state,unit,id);
        return true;
      }
      case 'auto-allied-setup':
        if (phase!=='setup' || side!=='allied' || !state.hand.length) return false;
        autoAlliedSetup(state);
        return true;
      case 'correct-initial-bridge':
        return correctInitialBridge(state);
      case 'undo-setup': {
        if (phase!=='setup' || !state.setupOrders.length) return false;
        const order=state.setupOrders.pop();
        if (order.unit) {
          const target=unitById(state,order.unit);
          target.support=target.support.filter(id=>id!==order.chit);
          state.hand.unshift(order.chit);
        }
        state.setupConfirmed=false;
        return true;
      }
      case 'confirm-setup':
        if (phase!=='setup' || state.setupConfirmed) return false;
        state.setupConfirmed=true;
        return true;
      case 'hold-capture': {
        if (!canHoldCapturedSupport(state) || !hasSupportInHand(state,side,action.chit)) return false;
        state.hand=state.hand.filter(id=>id!==action.chit);
        state.captureHold=[...(state.captureHold ?? []),action.chit];
        return true;
      }
      case 'release-capture': {
        if (!canHoldCapturedSupport(state) || !state.captureHold?.includes(action.chit)) return false;
        state.captureHold=state.captureHold.filter(id=>id!==action.chit);
        if (chit(action.chit).kind !== 'dummy') state.hand.push(action.chit);
        return true;
      }
      case 'confirm-support':
        if (phase!=='support') return false;
        if (state.supportConfirmed) return false;
        state.supportConfirmed=true;
        return true;
      case 'undo-support': {
        if (phase!=='support' || !state.supportUndo?.length) return false;
        const previous=state.supportUndo.pop();
        state.hand=previous.hand;
        state.captureHold=previous.captureHold;
        state.airSupply=previous.airSupply;
        if (previous.unit) Object.assign(unitById(state,previous.unit.id),previous.unit);
        state.supportConfirmed=false;
        return true;
      }
      case 'finish-setup':
        if (phase!=='setup' || !state.setupConfirmed || setupPlacementRequired(state)) return false;
        state.hand=[];
        if (side==='allied') {
          startSetup(state,'german');
          return true;
        }
        delete state.setupOrders;
        delete state.setupConfirmed;
        begin(state,'move');
        return true;
      case 'ration': {
        if (!['move','reaction','attack','counter'].includes(phase) || !unit?.hex || unit.side!==side ||
            !unit.disrupted || !unit.support.includes(action.chit) || chit(action.chit).kind!=='ration') return false;
        drop(state,unit,action.chit);
        unit.disrupted=false;
        log(state,`${unit.name} がKレーションで混乱から回復。`);
        return true;
      }
      case 'event':
        if (!['event','reinforce'].includes(phase) || !state.events.includes(action.chit)) return false;
        if (!resolveEvent(state,action.chit,action.hex,action.effect)) return false;
        state.events.splice(state.events.indexOf(action.chit),1); return true;
      case 'movement-order': {
        if (!canOrderUnit(state, unit)) return false;
        if (action.order === null) {
          if (!unit.movementOrder) return false;
          delete unit.movementOrder;
          log(state, `${unit.name} の移動予約・死守命令を解除しました。`);
          return true;
        }
        const {type, target} = action.order ?? {};
        if (!['reserve', 'hold'].includes(type) || !canOrderDestination(state, unit, target) ||
            (type === 'reserve' && target === unit.hex)) return false;
        unit.movementOrder = {type, target};
        const label = type === 'hold' ? '死守命令' : '移動予約';
        log(state, `${unit.name} に ${target} への${label}を設定しました。`);
        return true;
      }
      case 'moves': {
        if (!['move','reaction','highbeam'].includes(phase) || !Array.isArray(action.moves)) return false;
        const paused=action.pausedReservations ?? [];
        if (!Array.isArray(paused) || paused.some(id=>phase!=='move' ||
            unitById(state,id)?.side!==side || !unitById(state,id)?.movementOrder)) return false;
        const result=previewMoves(state,action.moves,new Set(paused));
        if (result.rejected.length) throw Error('移動案に実行できない移動があります。');
        Object.assign(state,result.state);
        for (const trail of state.trails) {
          const destination=trail.path.at(-1);
          const unit = unitById(state, trail.id);
          log(state,`${unit.name} ${trail.path[0]} → ${destination}`);
          if (trail.excess.length) {
            log(state, `${unit.name}：輸送力超過のため ${trail.excess.map(id => chit(id).label).join('、')} を返却。`);
          }
          if (trail.repairBridge) {
            returnChit(state,state.bridges[destination]);
            delete state.bridges[destination];
            log(state,`${destination} の橋梁を修復しました。`);
          }
        }
        if (phase==='highbeam') state.flags.highbeam=false;
        nextPhase(state); return true;
      }
      case 'attacks':
        if (!['attack','counter'].includes(phase) || !Array.isArray(action.attacks) || !validateAttacks(state,action.attacks)) return false;
        state.lastBattle=null;
        if (!action.attacks.length) nextPhase(state);
        else {
          state.combat={ side, from:phase, queue:copy(action.attacks), total:action.attacks.length, advance:null };
          state.phase='resolve';
        }
        return true;
      case 'prioritize-battle': {
        if (phase!=='resolve' || state.combat.revealed || state.combat.openSupport) return false;
        const index=state.combat.queue.findIndex(order=>order.target===action.target);
        if (index<0) return false;
        state.combat.queue.unshift(...state.combat.queue.splice(index,1));
        return true;
      }
      case 'reveal-battle': {
        if (phase!=='resolve' || state.combat.revealed || state.combat.openSupport) return false;
        const profile=combatProfile(state,action.support,[]);
        if (!profile) return false;
        if (!profile.nextAT) return revealBattle(state,action.support,[]);
        state.combat.openSupport={choices:action.support,targets:[]};
        return true;
      }
      case 'choose-at': {
        if (phase!=='resolve' || !state.combat.openSupport) return false;
        const {choices,targets}=state.combat.openSupport;
        const profile=combatProfile(state,choices,targets);
        if (!profile.nextAT?.some(target=>target.id===action.chit)) return false;
        targets.push(action.chit);
        if (combatProfile(state,choices,targets).nextAT) return true;
        return revealBattle(state,choices,targets);
      }
      case 'apply-battle-losses':
        return phase==='resolve' && applyBattleLosses(state,action.preferDefenderLoss===true);
      case 'continue-battle':
        return phase==='resolve' && continueBattle(state);
      case 'roll':
        return phase==='resolve' && rollBattle(state,action.support,action.die);
      case 'advance': {
        if (phase!=='advance' || (action.unit && (!state.combat.advance.ids.includes(action.unit) || unit?.movementOrder))) return false;
        if (action.unit) {
          unit.hex=state.combat.advance.hex; moveControl(state,side,unit.hex);
          log(state,`${unit.name} が ${unit.hex} へ戦闘後前進。`);
          if (checkGermanSuddenDeath(state)) return true;
        }
        state.combat.advance=null; finishBattle(state); return true;
      }
      case 'next':
        if (!['reentry','recovery','support','event','reinforce'].includes(phase)) return false;
        if ((phase==='reentry'||phase==='reinforce') && eligiblePlacements(state).length) return false;
        if (['event','reinforce'].includes(phase) && state.events.length) return false;
        if (phase==='support') {
          if (supportPlacementStatus(state).required) throw Error('支援チットをすべて配属してください。');
          if (!state.supportConfirmed) return false;
          for (const id of state.hand) returnChit(state,id);
          state.hand=[];
        }
        if (phase==='reinforce' && state.reinforceGroups.includes('RS')) {
          for (const u of state.units.filter(u=>u.group==='RS'&&u.status==='reserve')) u.status='spent';
        }
        nextPhase(state); return true;
      default:
        return false;
    }
  }
  return { create, apply, actor, enemy, sideName, phaseNames, map, neighbors, terrainName, city, river, riverTerrain, ridge, forest, unitZoc,
    onMap, at, unitById, chit, chitImage, source, lines, zoc, moveChits, transportableSupport, movementOptions, previewMoves, canOrderUnit, canOrderDestination, offRoadForest, roadLinks,
    placements, eligiblePlacements, previewReinforcements, upcomingAlliedReinforcements, supportTargets, supportPlacementStatus, alliedSupportTarget, dummyReserve, removableDummy, distance, finalVictoryCities,
    eventOptions, setupPlacementRequired, canHoldCapturedSupport, battleCandidates, validateAttacks,
    battleInfo, possibleSupport, defaultSupport, combatProfile, decisiveAttack, suggestedDie, damageFor, advanceCandidates, ratioColumn, germanCaptured };
})();
