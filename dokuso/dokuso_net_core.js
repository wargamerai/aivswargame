// Online authority. Pure game commands; no network or DOM dependency.
(function (root) {
  'use strict';
  const fields = ['turn', 'phase', 'units', 'control', 'breakScore', 'log', 'declared',
    'pending', 'combatQueue', 'moveState', 'undoStack', '_grp', 'winner', 'sovReinf'];
  const clone = value => JSON.parse(JSON.stringify(value));
  function actor(g) {
    return g.pending?.retreat.length ? g.unit(g.pending.retreat[0].unit).side : g.activeSide();
  }
  function random(g) {
    let x = g._onlineSeed >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    g._onlineSeed = x >>> 0;
    return g._onlineSeed / 4294967296;
  }
  function track(room) {
    const g = room.game;
    g.on(ev => {
      if (ev.type === 'phase') { room.trails = []; room.result = null; room.advanceUndo = []; }
      if (ev.type === 'undo') room.trails = room.trails.filter(t => t.seq <= g.undoStack.length);
      if (ev.type === 'move' && /_move$/.test(g.phase)) {
        const path = [ev.from, ...(ev.path || [ev.to])], seq = g.undoStack.length;
        const key = g.phase + '|' + path.join('-') + '|' + seq;
        const trail = room.trails.find(t => t.key === key);
        if (trail) trail.units.push(ev.unit);
        else room.trails.push({ key, side: g.activeSide(), path, seq, phase: g.phase, turn: g.turn, units: [ev.unit] });
      }
      if (ev.type === 'combat') { room.result = ev.result; room.advanceUndo = []; }
    });
    return room;
  }
  function create(D, md, images, seed) {
    const source = { _onlineSeed: (seed >>> 0) || 1 };
    const game = new D.Game(md, images, { rng: () => random(source) });
    game._onlineSeed = source._onlineSeed;
    game.rng = () => random(game);
    game.addLog('オンライン対戦を開始します。ソ連が先に配置します。', 'phase');
    return track({ game, trails: [], result: null, advanceUndo: [] });
  }
  function pack(room, visible) {
    const g = room.game;
    const state = Object.fromEntries(fields.filter(k => g[k] !== undefined).map(k => [k, g[k]]));
    state.sovInitialAdjacentInfantry = [...(g.sovInitialAdjacentInfantry || [])];
    if (visible) {
      state.units = g.units.map(u => u.revealed ? u : { ...u, str: null, backImg: null });
      state.undoStack = g.canUndo() ? [{}] : [];
    } else state.seed = g._onlineSeed;
    return JSON.stringify({ version: 1, state, trails: room.trails, result: room.result,
      advanceUndoCount: room.advanceUndo?.length || 0,
      ...(visible ? {} : { advanceUndo: room.advanceUndo || [] }) });
  }
  function unpack(D, md, images, json) {
    const data = JSON.parse(json);
    if (data.version !== 1 || !Object.hasOwn(D.PHASE_NAME, data.state.phase)) throw new Error('version');
    // Room snapshots are remote input. Keep text interpolated by the existing
    // board renderer from introducing markup or breaking quoted attributes.
    function check(value, depth = 0, key = '') {
      if (depth > 20) throw new Error('version');
      if (typeof value === 'string' && key !== 'text' && /[<>\"]/.test(value)) throw new Error('version');
      if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) check(v, depth + 1, k);
    }
    check(data);
    const game = new D.Game(md, images, { rng: () => 0.5 });
    for (const k of fields) if (Object.hasOwn(data.state, k)) game[k] = data.state[k];
    game.sovInitialAdjacentInfantry = new Set(data.state.sovInitialAdjacentInfantry || []);
    game.sovPool = {}; // A view must not retain the constructor's unrelated hidden pool.
    game._onlineSeed = data.state.seed;
    game.rng = () => random(game);
    return track({ game, trails: data.trails || [], result: data.result || null,
      advanceUndo: data.advanceUndo || [], advanceUndoCount: data.advanceUndoCount || 0 });
  }
  function perform(room, D, seat, name, a) {
    const g = room.game, side = g.activeSide();
    if (seat !== actor(g) || !Array.isArray(a) || a.length > 2 || g.phase === 'over') return false;
    if (g.pending?.retreat.length && name !== 'applyRetreat') return false;
    if (g.pending?.advance && !g.pending.retreat.length && !['advanceGroup', 'endAdvance', 'undo'].includes(name)) return false;
    const hex = h => typeof h === 'string' && /^\d{4}$/.test(h) && g.map.playable.has(h);
    const unit = id => typeof id === 'string' && g.unit(id);
    const ids = (list, max) => Array.isArray(list) && list.length > 0 && list.length <= max &&
      new Set(list).size === list.length && list.every(id => unit(id)?.side === side);
    const setup = g.phase === 'setup_' + side;
    const move = g.phase === side + '_move';
    const combat = g.phase === side + '_combat';
    switch (name) {
      case 'place': return setup && unit(a[0])?.side === side && unit(a[0]).area !== 'reinf' && hex(a[1]) && g.place(unit(a[0]), a[1]);
      case 'unplace': return setup && unit(a[0])?.side === side && unit(a[0]).area !== 'reinf' && g.unplace(unit(a[0]));
      case 'setupAuto': {
        // Deterministic placement uses only public information and the authority's RNG.
        if (!setup) return false;
        // Minsk is shared with reinforcement area 1; reserve city-only slots first.
        const ordered = g.setupUnits(side).slice().sort((a, b) => (b.area === 'city') - (a.area === 'city'));
        for (const u of ordered) if (!u.hex) {
          const options = g.areaHexes(u.area).filter(h => g.canPlace(u, h));
          if (options.length) g.place(u, options[Math.floor(g.rng() * options.length)]);
        }
        return true;
      }
      case 'setupClear': if (!setup) return false; for (const u of g.setupUnits(side)) g.unplace(u); return true;
      case 'finishSetup': return setup && g.finishSetup(side);
      case 'moveGroup': return move && ids(a[0], D.STACK_MAX) && hex(a[1]) && g.moveGroup(a[0].map(unit), a[1]);
      case 'overrun': return move && side === 'ger' && unit(a[0])?.side === side && hex(a[1]) && g.overrun(unit(a[0]), a[1]);
      case 'undo': {
        if (move) return g.undo();
        if (!g.pending?.advance || !room.advanceUndo?.length) return false;
        const snapshot = room.advanceUndo.pop();
        for (const [id, hex] of snapshot.units) g.unit(id).hex = hex;
        if (snapshot.done) g.pending.advance.done = snapshot.done;
        else delete g.pending.advance.done;
        g.control = snapshot.control; g.log.length = snapshot.logLen;
        g.emit({ type: 'change' });
        return true;
      }
      case 'endPhase': return (move || combat) && g.endPhase().ok;
      case 'declare': return combat && ids(a[0], 12) && hex(a[1]) && g.declare(a[0], a[1]);
      case 'undeclare': return combat && Number.isInteger(a[0]) && a[0] >= 0 && a[0] < g.declared.length && g.undeclare(a[0]);
      case 'startResolve': return combat && g.declared.length > 0 && g.startResolve();
      case 'resolveNext': return combat && !!g.resolveNext();
      case 'applyRetreat': return g.pending?.retreat[0]?.unit === a[0] &&
        (hex(a[1]) || (a[1] === null && !g.retreatOptions(a[0]).length)) && g.applyRetreat(a[0], a[1]);
      case 'advanceGroup': {
        if (!g.pending?.advance || !ids(a[0], D.STACK_MAX) || !hex(a[1])) return false;
        if (!a[0].some(id => g.advanceTargets(id).includes(a[1]))) return false;
        const snapshot = { units: g.pending.advance.units.map(id => [id, g.unit(id).hex]),
          done: g.pending.advance.done ? clone(g.pending.advance.done) : null,
          control: { ...g.control }, logLen: g.log.length };
        let moved = false;
        for (const id of a[0]) if (g.advanceStep(id, a[1])) moved = true;
        if (moved) (room.advanceUndo ||= []).push(snapshot);
        return moved;
      }
      case 'endAdvance': {
        if (!g.pending?.advance || !g.endAdvance()) return false;
        room.advanceUndo = []; return true;
      }
      default: return false;
    }
  }
  const api = { actor, create, pack, unpack, perform, clone };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DOKUSO_NET_CORE = api;
})(typeof window !== 'undefined' ? window : globalThis);
