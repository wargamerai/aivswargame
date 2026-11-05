// Monty's Melancholy: rules engine. The game runs as a generator that yields prompts.
(function (root) {
  const DATA = (typeof MM_DATA !== 'undefined') ? MM_DATA : require('./mm_data.js');
  const AREA = DATA.areas;
  const UNIT = DATA.units;
  const DIR = DATA.dir;
  const EDGE = {};
  const add = (a, b, v) => { (EDGE[a] = EDGE[a] || {})[b] = v; };
  for (const [a, b, k] of DATA.edges) { const e = { k, road: false, trunk: false, corps: false }; add(a, b, e); add(b, a, e); }
  for (const [a, b, t] of DATA.roads) { const e = EDGE[a][b]; e.road = true; e.trunk = !!t; }
  for (const [a, b] of DATA.corps) EDGE[a][b].corps = true;
  const onMapIds = Object.keys(AREA);
  const TRUNK_ORDER = ['Rommel', 'Bergeijk', 'Valkenswaard', 'Eindhoven', 'Son', 'StOdenrode', 'Veghel', 'Uden', 'Grave', 'Wijchen', 'Nijmegen', 'Elst', 'Arnhem'];
  // road distance to the nearest trunk area
  const TDIST = {};
  (function () {
    const q = [];
    for (const id of onMapIds) if (AREA[id].trunk) { TDIST[id] = 0; q.push(id); }
    while (q.length) {
      const a = q.shift();
      for (const b in EDGE[a]) if (EDGE[a][b].road && TDIST[b] === undefined) { TDIST[b] = TDIST[a] + 1; q.push(b); }
    }
  })();
  const hasRoad = a => Object.values(EDGE[a]).some(e => e.road);
  const CORPS = { Gd: 'XXX', Br: 'XXX', 43: 'XXX', '8A': 'XXX', 11: 'VIII', 3: 'VIII', 50: 'XII', '1A': 'AB', 82: 'AB', 101: 'AB', Pol: 'AB' };
  const HQ_NAME = { '1A': 'HQ 1st', 82: 'HQ 82', 101: 'HQ 101', Pol: 'HQ Pol' };
  const SRC = { XXX: 'Rommel', VIII: 'Peer', XII: 'Mol' };
  const DIVNAME = { '1A': '英第1空挺', 82: '米第82空挺', 101: '米第101空挺', Pol: 'ポーランド空挺', Gd: '英近衛機甲', Br: '軍団直属', 43: '英第43師団', '8A': '第8機甲旅団', 11: '英第11機甲', 3: '英第3師団', 50: '英第50師団' };

  function rng(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function newGame(seed) {
    const R = rng(seed);
    const d6 = () => 1 + Math.floor(R() * 6);
    const pick = arr => arr.splice(Math.floor(R() * arr.length), 1)[0];
    const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

    const S = {
      seed, u: [], ctrl: {}, deck: [], prev: null, cur: null, cycle: 1, cards: 0,
      arnhemHeld: false, finalDeck: false, over: null, log: [], moves: [], rolls: [], battle: null,
    };
    const L = (t, c) => S.log.push({ t, c: c || '' });
    for (const id of onMapIds) S.ctrl[id] = 'G';
    for (const u of UNIT) {
      const st = { id: u.id, loc: null, back: false, mark: false };
      const p = u.place;
      if (u.side === 'G') {
        if (p.startsWith('cup')) st.loc = 'cupG';
        else if (p[0] === 'T' && /^T\d[NE]$/.test(p)) st.loc = 'T' + p[1];
        else { st.loc = p.replace('*', ''); st.mark = p.endsWith('*'); }
      } else {
        if (p === 'cup') st.loc = 'cupA';
        else if (p === 'VIII') st.loc = 'Peer';
        else if (p === 'XII') st.loc = 'Mol';
        else st.loc = 'setup';
      }
      S.u.push(st);
    }
    const here = (a, side) => S.u.filter(x => x.loc === a && UNIT[x.id].side === side);
    const enemyOf = s => s === 'A' ? 'G' : 'A';
    const enemyHere = (a, side) => here(a, enemyOf(side)).length > 0;
    const enemyArea = (a, side) => enemyHere(a, side) || S.ctrl[a] !== side;
    const onMap = st => st.loc && AREA[st.loc];
    const hq = div => S.u.find(x => UNIT[x.id].name === HQ_NAME[div]);
    const nm = a => AREA[a] ? AREA[a].name : a;
    const un = st => UNIT[st.id].name;

    function updateControl() {
      const hadArnhem = S.ctrl.Arnhem === 'A';
      for (const id of onMapIds) {
        if (AREA[id].off) continue;
        const a = here(id, 'A').length, g = here(id, 'G').length;
        if (a && !g) S.ctrl[id] = 'A';
        else if (!a) S.ctrl[id] = 'G';
      }
      if (hadArnhem && S.ctrl.Arnhem === 'G') end('lose', 'ARNHEMがドイツ軍の支配下に戻った。');
    }
    function end(r, why) { if (!S.over) { S.over = { r, why }; L((r === 'win' ? '勝利: ' : '敗北: ') + why, r === 'win' ? 'good' : 'bad'); } }

    // ---- supply ----
    function supplyAreas(div) {
      const corps = CORPS[div];
      let src;
      if (corps === 'AB') {
        const h = hq(div);
        if (!h || !onMap(h)) return new Set();
        src = h.loc;
      } else src = SRC[corps];
      const out = new Set([src]);
      if (S.ctrl[src] !== 'A') return out;
      const conn = new Set([src]); const q = [src];
      while (q.length) {
        const a = q.shift();
        for (const b in EDGE[a]) {
          if (!EDGE[a][b].road || AREA[b].off || conn.has(b)) continue;
          out.add(b);
          if (S.ctrl[b] === 'A') { conn.add(b); q.push(b); }
        }
      }
      for (const a of conn) for (const b in EDGE[a]) if (!AREA[b].off) out.add(b);
      return out;
    }
    function supplied(id) {
      const st = S.u[id]; const u = UNIT[id];
      if (u.side !== 'A' || !onMap(st)) return false;
      return supplyAreas(u.div).has(st.loc);
    }

    // ---- movement ----
    function stepInfo(id, a, b, viaRoad) {
      const u = UNIT[id]; const side = u.side;
      const e = EDGE[a] && EDGE[a][b];
      if (!e) return null;
      if (side === 'A' && (e.corps || AREA[b].off)) return null;
      if (viaRoad && !e.road) return null;
      if (!viaRoad && side === 'A' && enemyHere(a, side) && enemyHere(b, side)) return null;
      let cost;
      if (viaRoad && e.trunk && S.ctrl[a] === side && S.ctrl[b] === side && !enemyHere(a, side) && !enemyHere(b, side)) cost = 0.5;
      else cost = 1 + (enemyArea(b, side) ? 1 : 0) + (enemyArea(a, side) ? 1 : 0);
      let cross = false, needBridge = false;
      if (e.k !== 'P') {
        const ownA = S.ctrl[a] === side, ownB = S.ctrl[b] === side;
        if (viaRoad && ownA && ownB) { /* normal */ }
        else {
          if (!ownA && !ownB) return null;
          if (e.k === 'M') {
            if (!viaRoad) return null;
            if (enemyHere(a, side) && enemyHere(b, side)) return null;
          }
          if (u.back === null) return null;
          cross = true;
          if (!u.white) {
            if (side !== 'A' || !viaRoad) return null;
            const br = S.u.find(x => UNIT[x.id].bridge);
            if (!br || br.loc !== a) return null;
            needBridge = true;
          }
        }
      }
      return { cost, cross, needBridge };
    }
    function legalMoves(id) {
      const st = S.u[id]; const u = UNIT[id];
      const out = {};
      if (st.back || !u.m || !onMap(st)) return out;
      const start = st.loc;
      const best = { [start]: 0 };
      const q = [start];
      while (q.length) {
        const a = q.shift();
        for (const b in EDGE[a]) {
          if (!EDGE[a][b].road) continue;
          const info = stepInfo(id, a, b, true);
          if (!info) continue;
          if (info.cross && a !== start) continue;
          const c = best[a] + info.cost;
          if (c > u.m) continue;
          if (info.cross) {
            if (!out[b] || out[b].cost > c) out[b] = { cost: c, cross: true, needBridge: info.needBridge };
            continue;
          }
          if (best[b] === undefined || best[b] > c) {
            best[b] = c; q.push(b);
            out[b] = { cost: c, cross: false, needBridge: false };
          }
        }
      }
      delete out[start];
      // leaving the road: one step only
      for (const b in EDGE[start]) {
        if (out[b]) continue;
        const info = stepInfo(id, start, b, false);
        if (!info || info.cost > u.m) continue;
        out[b] = { cost: info.cost, cross: info.cross, needBridge: false, off: true };
      }
      return out;
    }
    function germanNext(a, letter) {
      if (DIR[a] && DIR[a][letter]) return DIR[a][letter];
      let best = [], bd = 1e9;
      for (const b in EDGE[a]) {
        if (!EDGE[a][b].road || AREA[b].off) continue;
        const d = TDIST[b];
        if (d === undefined) continue;
        if (d < bd) { bd = d; best = [b]; } else if (d === bd) best.push(b);
      }
      return best.length ? best[Math.floor(R() * best.length)] : null;
    }
    function germanPath(id, letter) {
      const u = UNIT[id]; const st = S.u[id];
      let a = st.loc, mp = u.m, cross = false;
      const path = [a];
      if (AREA[a].trunk || st.mark) return { path, cross };
      if (!hasRoad(a)) {
        if (enemyHere(a, 'G')) return { path, cross };
        const b = DIR[a] && DIR[a][letter];
        if (!b) return { path, cross };
        const info = stepInfo(id, a, b, false);
        if (info && info.cost <= mp) { path.push(b); cross = info.cross; }
        return { path, cross };
      }
      while (!AREA[a].trunk) {
        const b = germanNext(a, letter);
        if (!b) break;
        const info = stepInfo(id, a, b, true);
        if (!info) break;
        if (info.cross && path.length > 1) break;
        if (info.cost > mp) break;
        mp -= info.cost; a = b; path.push(b);
        if (info.cross) { cross = true; break; }
      }
      return { path, cross };
    }

    // ---- damage ----
    const curDef = st => st.back ? UNIT[st.id].back : UNIT[st.id].d;
    function ladder(st) { // thresholds [{p,what}]
      const u = UNIT[st.id]; const out = [];
      let p = 0;
      const backPart = () => {
        const b = u.back;
        if (b === 0) out.push({ p: p + 1, w: 'remove' });
        else if (b === 1) { out.push({ p: p + 1, w: 'retreat' }); out.push({ p: p + 2, w: 'remove' }); }
        else { out.push({ p: p + 2, w: 'retreat' }); out.push({ p: p + 3, w: 'remove' }); }
      };
      if (st.back) { backPart(); return out; }
      if (u.d === 0 || u.back === null) { out.push({ p: Math.max(1, u.d), w: 'remove' }); return out; }
      p = u.d; out.push({ p, w: 'flip' }); backPart();
      return out;
    }
    function effect(st, p) { let r = null; for (const s of ladder(st)) if (s.p <= p) r = s.w; return r; }
    function capacity(st) { const l = ladder(st); return l[l.length - 1].p; }
    function waste(st, p) { let last = 0; for (const s of ladder(st)) if (s.p <= p) last = s.p; return p - last; }
    const HARM = { flip: 2, retreat: 3, remove: 12 };
    function harm(st, p) {
      const e = effect(st, p);
      if (!e) return 0;
      const u = UNIT[st.id];
      return HARM[e] * (u.hq ? 6 : u.tank ? 1.5 : 1);
    }
    function bestAlloc(victims, hits, sign) {
      // sign>0: minimise harm (own units); sign<0: maximise harm (enemy units)
      const maxD = Math.max(...victims.map(curDef));
      const cap = victims.reduce((n, v) => n + capacity(v), 0);
      const total = Math.min(hits, cap);
      let best = null;
      for (const first of victims.filter(v => curDef(v) === maxD)) {
        let dp = new Map([[0, { w: 0, h: 0, a: {} }]]);
        for (const v of victims) {
          const nx = new Map();
          const lo = v === first ? 1 : 0;
          for (const [t, val] of dp) {
            for (let p = lo; p <= capacity(v) && t + p <= total; p++) {
              const w = val.w + waste(v, p), h = val.h + sign * harm(v, p);
              const key = t + p; const cur = nx.get(key);
              if (!cur || w < cur.w || (w === cur.w && h < cur.h)) nx.set(key, { w, h, a: p ? { ...val.a, [v.id]: p } : val.a });
            }
          }
          dp = nx;
        }
        const r = dp.get(total);
        if (r && (!best || r.w < best.w || (r.w === best.w && r.h < best.h))) best = r;
      }
      return best ? { alloc: best.a, waste: best.w, total } : { alloc: {}, waste: 0, total: 0 };
    }
    // a random legal allocation: favors neither side
    function randomAlloc(victims, total) {
      const out = {};
      const maxD = Math.max(...victims.map(curDef));
      const top = victims.filter(v => curDef(v) === maxD);
      for (let n = 0; n < total; n++) {
        const pool = n === 0 ? top : victims.filter(v => (out[v.id] || 0) < capacity(v));
        const v = pool[Math.floor(R() * pool.length)];
        out[v.id] = (out[v.id] || 0) + 1;
      }
      return out;
    }
    function validateAlloc(victims, hits, alloc, side) {
      const auto = bestAlloc(victims, hits, side === 'A' ? 1 : -1);
      let sum = 0, w = 0;
      for (const v of victims) {
        const p = alloc[v.id] || 0;
        if (p > capacity(v)) return '除去に必要な数を超えている。';
        sum += p; w += waste(v, p);
      }
      if (sum !== auto.total) return `損害を ${auto.total} ポイントすべて割り当てる。`;
      const maxD = Math.max(...victims.map(curDef));
      if (!victims.some(v => curDef(v) === maxD && (alloc[v.id] || 0) > 0)) return '最初の1ポイントは防御力が最も高い駒に割り当てる。';
      if (side === 'A' && w > auto.waste) return '無効になる損害が出ないように割り当てる。';
      return null;
    }
    // true when no legal allocation of these hits can change any unit (9.0(4)(1): first point goes to the highest defense)
    function noEffectPossible(victims, hits) {
      const maxD = Math.max(...victims.map(curDef));
      return victims.every(v => ladder(v)[0].p > (curDef(v) === maxD ? hits : hits - 1));
    }
    function retreatOptions(st) {
      const u = UNIT[st.id]; const side = u.side; const a = st.loc;
      const tiers = [[], [], []];
      for (const b in EDGE[a]) {
        const e = EDGE[a][b];
        if (side === 'A' && (AREA[b].off || e.corps)) continue;
        if (S.ctrl[b] !== side || enemyHere(b, side)) continue;
        if (e.k === 'M') continue;
        if (e.k === 'R' && !e.road) continue;
        if (e.road && e.k === 'P') tiers[0].push(b);
        else if (e.road) tiers[1].push(b);
        else tiers[2].push(b);
      }
      return tiers.find(t => t.length) || [];
    }

    function* resolveAttack(side, area, attackers) {
      const foe = enemyOf(side);
      const victims = here(area, foe);
      if (!victims.length) return;
      const defCity = AREA[area].city && S.ctrl[area] === foe;
      let hits = 0, n = 0; const rolls = [];
      for (const st of attackers) {
        if (st.loc !== area) continue;
        let a = UNIT[st.id].a;
        if (!a || st.back) continue;
        if (defCity && a > 2) a -= 1;
        const r = d6(); n++;
        const hit = r <= a;
        rolls.push({ id: st.id, a, r, hit });
        if (hit) hits++;
      }
      if (!n) return;
      S.rolls.push({ card: S.cards, area, side, rolls });
      L(`${nm(area)}: ${side === 'A' ? '連合軍' : 'ドイツ軍'}${n}駒が攻撃、損害${hits}。`, side === 'A' ? 'ally' : 'ger');
      const B = S.battle = { n: S.rolls.length, area, side, city: defCity, rolls, hits, total: 0, victims: victims.map(v => v.id), alloc: {}, result: {} };
      if (!hits) { yield { kind: 'battle', area }; S.battle = null; return; }
      if (noEffectPossible(victims, hits)) {
        B.noEffect = true;
        L('　損害は効果なし。');
        yield { kind: 'battle', area, noEffect: true };
        S.battle = null;
        return;
      }
      const auto = bestAlloc(victims, hits, foe === 'A' ? 1 : -1);
      B.total = auto.total;
      let alloc = null, msg = null;
      while (true) {
        const ans = yield { kind: 'battle', area, autoAlloc: auto.alloc, msg };
        if (ans && ans.auto) { alloc = foe === 'A' ? auto.alloc : randomAlloc(victims, auto.total); break; }
        msg = validateAlloc(victims, hits, (ans && ans.alloc) || {}, foe);
        if (!msg) { alloc = ans.alloc; break; }
      }
      B.alloc = alloc;
      const retreats = [];
      const parts = [];
      for (const v of victims) {
        const p = alloc[v.id] || 0;
        if (!p) continue;
        const e = effect(v, p);
        if (!e) { parts.push(`${un(v)} 効果なし`); B.result[v.id] = '効果なし'; continue; }
        if (e === 'remove') { v.loc = 'dead'; v.mark = false; parts.push(`${un(v)} 除去`); B.result[v.id] = '除去'; continue; }
        if (e === 'flip') { v.back = true; parts.push(`${un(v)} 消耗`); B.result[v.id] = '消耗'; continue; }
        v.back = true; v.mark = false; retreats.push(v); B.result[v.id] = '退却';
      }
      if (parts.length) L('　' + parts.join('、') + '。');
      for (const v of retreats) {
        const opts = retreatOptions(v);
        if (!opts.length) { v.loc = 'dead'; B.result[v.id] = '退却できず除去'; L(`　${un(v)} 退却できず除去。`, 'bad'); continue; }
        let to = opts[0];
        if (opts.length > 1) {
          while (true) {
            const ans = yield { kind: 'retreat', unit: v.id, options: opts, area };
            if (ans && ans.auto) break;
            if (ans && opts.includes(ans.area)) { to = ans.area; break; }
          }
        }
        S.moves.push({ from: v.loc, to, side: foe, retreat: true });
        v.loc = to;
        B.result[v.id] = '退却→' + nm(to);
        L(`　${un(v)} → ${nm(to)}へ退却。`);
      }
      yield { kind: 'battleEnd', area };
      S.battle = null;
    }
    function* runAttacks(side, groups) {
      const left = Object.keys(groups).filter(a => groups[a].length);
      while (left.length) {
        const live = left.filter(a => here(a, enemyOf(side)).length && groups[a].some(st => st.loc === a && UNIT[st.id].a && !st.back));
        if (!live.length) break;
        let a = live[0];
        if (live.length > 1) {
          const ans = yield { kind: 'order', areas: live };
          if (ans && live.includes(ans.area)) a = ans.area;
        }
        left.splice(left.indexOf(a), 1);
        yield* resolveAttack(side, a, groups[a]);
      }
    }

    // ---- judgement ----
    const judge = () => S.prev || S.cur;

    // ---- events ----
    function* germanAct(units, label) {
      const letter = judge().l || 'A';
      S.moves = [];
      if (!units.length) { L(`${label}: 動く駒はない。`, 'ger'); return; }
      yield { kind: 'gstart', label, units: units.map(x => x.id), letter };
      const groups = {}; const recover = [];
      let moved = 0, attackers = 0;
      const plan = [];
      for (const st of units) {
        const u = UNIT[st.id];
        const a = st.loc;
        if (st.back) { recover.push(st); continue; }
        if (st.mark) { if (enemyHere(a, 'G')) (groups[a] = groups[a] || []).push(st); continue; }
        const enemy = enemyHere(a, 'G');
        if (enemy) {
          let attack = true;
          if (!AREA[a].trunk && hasRoad(a) && DIR[a] && DIR[a][letter] && !enemyHere(DIR[a][letter], 'G')) {
            const p = germanPath(st.id, letter);
            if (p.path.length > 1) { plan.push({ st, p }); attack = false; }
          }
          if (attack) (groups[a] = groups[a] || []).push(st);
          continue;
        }
        const p = germanPath(st.id, letter);
        if (p.path.length > 1) plan.push({ st, p });
      }
      for (const { st, p } of plan) {
        const from = st.loc, to = p.path[p.path.length - 1];
        if (p.cross) st.back = true;
        st.loc = to; moved++;
        S.moves.push({ from, to, side: 'G', path: p.path });
        if (UNIT[st.id].tank && !p.cross && enemyHere(to, 'G')) (groups[to] = groups[to] || []).push(st);
      }
      attackers = Object.values(groups).reduce((n, g) => n + g.length, 0);
      L(`${label}: 移動${moved}、攻撃${attackers}、回復${recover.length}(方向 ${letter})。`, 'ger');
      yield* runAttacks('G', groups);
      for (const st of recover) if (st.loc !== 'dead') st.back = false;
    }
    function advanceTrack(div) {
      const us = S.u.filter(x => UNIT[x.id].div === div && /^T\d$/.test(x.loc));
      if (!us.length) { L(`トラック: ${div} は全部登場ずみ。`); return []; }
      const num = judge().n;
      const entered = [];
      for (const st of us) {
        const k = +st.loc[1] - 1;
        if (k > 0) st.loc = 'T' + k;
        else {
          const sec = UNIT[st.id].place.slice(-1);
          st.loc = sec + num; entered.push(st);
          S.moves.push({ from: 'TRACK', to: st.loc, side: 'G' }); // 増援トラックから盤外エリアへの矢印
        }
      }
      if (entered.length) {
        L(`トラック: ${entered.map(un).join('、')} が ${entered[0].loc} に登場。`, 'ger');
      } else L(`トラック: ${div} が1列進む。`, 'ger');
      return entered.map(x => x.id);
    }
    function germanReinforce() {
      const n = judge().c, num = judge().n;
      const cup = S.u.filter(x => x.loc === 'cupG');
      const got = [], ids = [];
      for (let i = 0; i < n && cup.length; i++) {
        const st = pick(cup);
        const sec = UNIT[st.id].place.slice(3);
        st.loc = sec + num; got.push(`${un(st)}→${st.loc}`); ids.push(st.id);
      }
      L(got.length ? `ドイツ軍増援(${n}): ${got.join('、')}。` : 'ドイツ軍増援: カップは空。', 'ger');
      return ids;
    }
    function alliedReinforce() {
      const n = 1 + judge().c;
      const cup = S.u.filter(x => x.loc === 'cupA');
      const got = [], ids = [];
      for (let i = 0; i < n && cup.length; i++) {
        const st = pick(cup); const u = UNIT[st.id];
        ids.push(st.id);
        const corps = CORPS[u.div];
        if (u.div === 'Pol') {
          const h = hq('Pol');
          if (u.hq || !onMap(h) && h.loc !== 'dead') { st.loc = 'box'; if (u.hq) S.polBoxCard = S.cards; got.push(`${u.name}→待機ボックス`); continue; }
          if (h.loc === 'dead') { st.loc = 'dead'; got.push(`${u.name} 失われた`); continue; }
        }
        if (corps === 'AB') {
          const h = hq(u.div);
          if (h.loc === 'dead' || !onMap(h)) { st.loc = 'dead'; got.push(`${u.name} 失われた`); continue; }
          st.loc = h.loc;
          if (enemyHere(h.loc, 'A') && u.back !== null) st.back = true;
          got.push(`${u.name}→${nm(h.loc)}`);
        } else { st.loc = 'Rommel'; got.push(`${u.name}→Rommel`); }
      }
      L(got.length ? `連合軍増援(${n}): ${got.join('、')}。` : '連合軍増援: カップは空。', 'ally');
      return ids.filter(i => S.u[i].loc !== 'dead');
    }
    function airborneBack() {
      return S.u.filter(x => onMap(x) && x.back && CORPS[UNIT[x.id].div] === 'AB');
    }
    function* eventAct(ev) {
      const val = ev.val + judge().c;
      S.moves = [];
      L(`行動値 ${ev.val}+${judge().c}=${val}。`, 'ally');
      const acted = new Set();
      let left = val, first = true;
      while (left > 0 && !S.over) {
        // control only changes when the card ends, so supply stays as it was
        const elig = S.u.filter(x => ev.divs.includes(UNIT[x.id].div) && onMap(x) && !acted.has(x.id) && supplied(x.id)).map(x => x.id);
        if (!elig.length) { if (first) L('行動できる駒がない。'); return; }
        first = false;
        let orders = null; let msg = null;
        while (true) {
          const ans = yield { kind: 'alloc', val: left, total: val, elig, msg };
          const err = checkOrders(ans.orders || [], left, elig);
          if (!err) { orders = ans.orders || []; break; }
          msg = err;
        }
        if (!orders.length) return;
        for (const o of orders) { left -= orderCost(o); acted.add(o.id); }
        const groups = {}; const recover = [];
        for (const o of orders) {
          const st = S.u[o.id];
          if (o.act === 'recover') { recover.push(st); continue; }
          if (o.act === 'attack') { (groups[st.loc] = groups[st.loc] || []).push(st); continue; }
        }
        const moves = orders.filter(o => o.act === 'move' || o.act === 'moveattack').map(o => ({ o, info: legalMoves(o.id)[o.to] }));
        for (const { o, info } of moves) {
          const st = S.u[o.id];
          S.moves.push({ from: st.loc, to: o.to, side: 'A' });
          st.loc = o.to;
          if (info.cross) st.back = true;
          if (o.act === 'moveattack') (groups[o.to] = groups[o.to] || []).push(st);
        }
        if (moves.length) L(`移動 ${moves.length}駒。`, 'ally');
        yield* runAttacks('A', groups);
        for (const st of recover) if (st.loc !== 'dead') st.back = false;
        if (recover.length) L(`回復 ${recover.length}駒。`, 'ally');
        if (left > 0) L(`残りの行動値 ${left}。`, 'ally');
      }
    }
    function orderCost(o) {
      if (o.act === 'move') { const i = legalMoves(o.id)[o.to]; return i && i.needBridge ? 2 : 1; }
      return 1;
    }
    function checkOrders(orders, val, elig) {
      const seen = new Set(); let used = 0;
      for (const o of orders) {
        if (seen.has(o.id)) return '同じ駒に2回割り当てている。';
        seen.add(o.id);
        if (!elig.includes(o.id)) return `${UNIT[o.id].name} は行動できない。`;
        const st = S.u[o.id]; const u = UNIT[o.id];
        if (o.act === 'recover') { if (!st.back) return `${u.name} は消耗していない。`; }
        else if (st.back) return `${u.name} は回復しかできない。`;
        else if (o.act === 'attack') { if (!u.a || !enemyHere(st.loc, 'A')) return `${u.name} は攻撃できない。`; }
        else if (o.act === 'move' || o.act === 'moveattack') {
          const i = legalMoves(o.id)[o.to];
          if (!i) return `${u.name} は ${nm(o.to)} へ移動できない。`;
          if (o.act === 'moveattack' && (!u.tank || i.cross)) return `${u.name} は移動・攻撃できない。`;
        } else return '不明な命令。';
        used += orderCost(o);
      }
      if (used > val) return `行動値を超えている(${used}/${val})。`;
      return null;
    }
    function* eventAir() {
      const cands = airborneBack();
      if (!cands.length) return;
      const ans = yield { kind: 'air', cands: cands.map(x => x.id), max: 3 };
      const ids = (ans && ans.ids || []).filter(i => cands.some(c => c.id === i)).slice(0, 3);
      ids.forEach(i => { S.u[i].back = false; });
      if (ids.length) L(`航空補給: ${ids.map(i => UNIT[i].name).join('、')} を回復。`, 'ally');
    }
    function* eventDrop() {
      const h = hq('Pol');
      if (h.loc !== 'box') return;
      if (S.polBoxCard === S.cards) return; // 司令部が待機ボックスに入った札では降下できない。次の増援カードから
      const legal = onMapIds.filter(a => !AREA[a].off && !enemyHere(a, 'A'));
      const ans = yield { kind: 'drop', legal };
      if (!ans || !legal.includes(ans.area)) { L('降下作戦は見送り。'); return; }
      const box = S.u.filter(x => x.loc === 'box');
      box.forEach(x => { x.loc = ans.area; });
      L(`降下作戦: ポーランド旅団 ${box.length}駒が ${nm(ans.area)} に降下。`, 'ally');
      yield { kind: 'rein', label: '降下作戦', units: box.map(x => x.id) };
    }

    // ---- setup ----
    function within2(from) {
      const out = new Set([from]);
      let f = [from];
      for (let i = 0; i < 2; i++) {
        const nx = [];
        for (const a of f) for (const b in EDGE[a]) {
          if (AREA[b].off || EDGE[a][b].k === 'M' || out.has(b)) continue;
          out.add(b); nx.push(b);
        }
        f = nx;
      }
      return out;
    }
    function* setupXXX() {
      let rest = S.u.filter(x => x.loc === 'setup' && UNIT[x.id].place === 'XXX');
      while (rest.length) {
        const ans = yield { kind: 'setup', title: '第30軍団の配置', hint: 'RommelかBergeijkを選ぶ。Rommelに誰もいないと補給が切れる', units: rest.map(x => x.id), legal: ['Rommel', 'Bergeijk'] };
        if (ans.auto) {
          rest.forEach(x => { x.loc = UNIT[x.id].name === '5CG/32' ? 'Rommel' : 'Bergeijk'; });
          rest = []; break;
        }
        (ans.ids || []).forEach(i => { const st = S.u[i]; if (st.loc === 'setup' && ['Rommel', 'Bergeijk'].includes(ans.area)) st.loc = ans.area; });
        rest = rest.filter(x => x.loc === 'setup');
      }
    }
    function* setupDiv(div, target, label) {
      const h = hq(div);
      const hqLegal = Object.keys(EDGE[target]).filter(a => !AREA[a].off && !enemyHere(a, 'A'));
      const AUTO = { '1A': ['Wolfheze', 'Arnhem'], 82: ['Groesbeek', 'Nijmegen'], 101: ['Uden', 'Veghel'] };
      const ans = yield { kind: 'setup', title: `${label} 司令部`, hint: `${nm(target)} の隣で敵のいないエリアを選ぶ`, units: [h.id], legal: hqLegal, hq: true };
      const hqArea = ans.auto ? AUTO[div][0] : (hqLegal.includes(ans.area) ? ans.area : hqLegal[0]);
      h.loc = hqArea;
      const rangeAreas = within2(hqArea);
      const placed = new Set([hqArea]);
      const enemyAreas = () => [...placed].filter(a => enemyHere(a, 'A'));
      let rest = S.u.filter(x => x.loc === 'setup' && UNIT[x.id].div === div);
      if (ans.auto) {
        const tgt = AUTO[div][1];
        rest.forEach(x => { x.loc = UNIT[x.id].at ? hqArea : tgt; });
        rest = [];
        placed.add(tgt);
      }
      while (rest.length) {
        const legal = [...rangeAreas].filter(a => {
          if (placed.has(a)) return true;
          if (placed.size >= 3) return false;
          if (enemyHere(a, 'A') && enemyAreas().length >= 1) return false;
          return true;
        });
        const a2 = yield { kind: 'setup', title: `${label} の配置`, hint: '司令部から2エリア以内、合計3エリアまで。敵のいるエリアは1つまで', units: rest.map(x => x.id), legal, divSetup: true };
        if (a2.auto) {
          const tgt = legal.find(a => enemyHere(a, 'A')) || hqArea;
          rest.forEach(x => { x.loc = UNIT[x.id].at ? hqArea : tgt; });
          placed.add(tgt);
          rest = [];
          break;
        }
        if (legal.includes(a2.area)) {
          for (const i of a2.ids || []) {
            const st = S.u[i];
            if (UNIT[i].at && enemyHere(a2.area, 'A')) continue;
            if (st.loc === 'setup') st.loc = a2.area;
          }
          if (S.u.some(x => x.loc === a2.area && UNIT[x.id].div === div)) placed.add(a2.area);
        }
        rest = rest.filter(x => x.loc === 'setup');
      }
      for (const a of placed) {
        if (enemyHere(a, 'A')) {
          const atk = here(a, 'A').filter(x => UNIT[x.id].div === div);
          yield* resolveAttack('A', a, atk);
        }
      }
    }

    // ---- main ----
    function checkWin() {
      if (S.over) return;
      const xxx = here('Arnhem', 'A').some(x => CORPS[UNIT[x.id].div] === 'XXX');
      if (!xxx) return;
      for (let i = 0; i < TRUNK_ORDER.length - 1; i++) if (S.ctrl[TRUNK_ORDER[i]] !== 'A') return;
      end('win', '幹線道路がARNHEMまでつながり、第30軍団がARNHEMに入った。');
    }
    function reinforcementsLeft() {
      return S.u.some(x => x.loc === 'cupA' || x.loc === 'cupG' || /^T\d$/.test(x.loc));
    }
    function* play() {
      L('連合軍の配置から始める。', 'sys');
      yield* setupXXX();
      yield* setupDiv('1A', 'Arnhem', '英第1空挺');
      yield* setupDiv('82', 'Nijmegen', '米第82空挺');
      yield* setupDiv('101', 'Veghel', '米第101空挺');
      updateControl();
      S.arnhemHeld = S.ctrl.Arnhem === 'A';
      S.deck = shuffle(DATA.deck.map(c => c.id));
      L('ゲーム開始。', 'card');
      yield { kind: 'gamestart' };
      while (!S.over) {
        if (!S.deck.length) { S.deck = shuffle(DATA.deck.map(c => c.id)); S.prev = null; S.cycle++; }
        const id = S.deck.pop();
        S.cur = DATA.deck.find(c => c.id === id);
        S.jcard = S.prev;
        S.cards++;
        L(`【${S.cur.name}】`, 'card');
        if (id === 'bridge' && S.finalDeck) { end('lose', '増援が出尽くしたあと、次の「橋はまだ遠い」が引かれた。'); break; }
        let reshuffled = false;
        S.moves = [];
        for (const ev of S.cur.ev) {
          if (ev.t === 'act') yield* eventAct(ev);
          else if (ev.t === 'gdiv') yield* germanAct(S.u.filter(x => UNIT[x.id].side === 'G' && UNIT[x.id].div === ev.div && onMap(x)), ev.div + '師団');
          else if (ev.t === 'gsec') {
            const lbl = { N: '北部戦区', E: '東部戦区', W: '西部戦区' }[ev.sec];
            yield* germanAct(S.u.filter(x => UNIT[x.id].side === 'G' && onMap(x) && AREA[x.loc].sec.includes(ev.sec)), lbl);
          } else if (ev.t === 'track') {
            const ids = advanceTrack(ev.div);
            if (ids.length) yield { kind: 'rein', label: 'トラックから登場', units: ids };
          } else if (ev.t === 'grein') {
            const ids = germanReinforce();
            if (ids.length) yield { kind: 'rein', label: 'ドイツ軍増援', units: ids };
          } else if (ev.t === 'arein') {
            const ids = alliedReinforce();
            if (ids.length) yield { kind: 'rein', label: '連合軍増援', units: ids };
          }
          else if (ev.t === 'air') yield* eventAir();
          else if (ev.t === 'drop') yield* eventDrop();
          else if (ev.t === 'reshuffle') {
            if (!reinforcementsLeft()) S.finalDeck = true;
            S.deck = shuffle(DATA.deck.map(c => c.id));
            S.prev = null; S.cycle++; reshuffled = true;
            L(`山札を作り直した(${S.cycle}回目)。${S.finalDeck ? '増援は出尽くした。次の「橋はまだ遠い」で終わる。' : ''}`, 'sys');
          }
          if (S.over) break;
        }
        updateControl();
        checkWin();
        if (S.over) break;
        if (!reshuffled) S.prev = S.cur;
        yield { kind: 'next' };
      }
      return S.over;
    }

    const gen = play();
    const G = {
      S, DATA, AREA, UNIT, EDGE, DIR, TDIST, DIVNAME, answers: [], prompt: null,
      validateAlloc, randomAlloc, noEffectPossible, legalMoves, supplied, supplyAreas, enemyHere, here, effect, ladder, capacity, curDef, waste, bestAlloc, stepInfo, germanPath, retreatOptions, orderCost, checkOrders, onMap,
      step(ans) {
        if (ans !== undefined) G.answers.push(ans);
        const r = gen.next(ans);
        G.prompt = r.done ? null : r.value;
        return G.prompt;
      },
    };
    G.step();
    G.answers.length = 0;
    return G;
  }
  // restores a game by replaying its answers
  function restore(seed, answers) {
    const g = newGame(seed);
    for (const a of answers) g.step(a);
    return g;
  }
  const api = { newGame, restore, DATA };
  if (typeof module !== 'undefined') module.exports = api;
  root.MM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
