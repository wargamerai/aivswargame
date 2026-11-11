// 独ソ電撃戦 ルールエンジン（画面なしでも動く。ブラウザと node の両方で使う）
// ルール: /Users/baron/Desktop/独ソ電撃戦ルール.txt と、その不明点へのユーザーの回答（2026-11-01）
(function (root) {
  'use strict';

  // ===== 表 =====
  const TERRAIN_COST = { p: 1, w: 2, f: 3, r: 2, m: 2 };          // 平地1 林2 森3 荒地2 湿地2（湖は移動不可）
  const TERRAIN_MULT = { p: 1, w: 2, f: 3, r: 2, m: 2 };          // 防御側の戦闘力の倍率
  const FAC_MULT = { t: 2, c: 2, bc: 3 };                         // 街・都市×2、大都市×3
  const CITY_POINTS = { c: 2, bc: 5 };                            // 都市2点、大都市5点
  const KILL_POINTS = { tank: 3, mot: 2, inf: 1 };                // ドイツ軍の壊滅 → ソ連の得点
  const BREAK_POINTS = { tank: 3, mot: 2 };                       // 突破 → ドイツの得点（歩兵は突破できない）
  const TYPE_NAME = { inf: '歩兵', cav: '騎兵', tank: '戦車', mot: '自動車化歩兵' };
  const SIDE_NAME = { ger: 'ドイツ', sov: 'ソ連' };
  // 戦闘結果表（1d6）。2対1 は DR が1つ多かったので1つ除いた
  const CRT = {
    '1:3': ['AE', 'AE', 'AR', 'AR', 'AR', 'AR'],
    '1:2': ['C', 'AR', 'AR', 'AR', 'AR', 'EX'],
    '1:1': ['C', 'C', 'AR', 'AR', 'DR', 'EX'],
    '2:1': ['C', 'C', 'AR', 'DR', 'DR', 'EX'],
    '3:1': ['C', 'C', 'DR', 'DR', 'DR', 'EX'],
    '4:1': ['C', 'DR', 'DR', 'DR', 'DR', 'EX'],
    '5:1': ['DR', 'DR', 'DR', 'DR', 'DE', 'DE'],
    '6:1': ['DR', 'DR', 'DR', 'DE', 'DE', 'DE'],
  };
  const ODDS_COLS = [['1:3', 1 / 3], ['1:2', 1 / 2], ['1:1', 1], ['2:1', 2], ['3:1', 3], ['4:1', 4], ['5:1', 5], ['6:1', 6]];
  const RESULT_NAME = { AE: '攻撃側全滅', AR: '攻撃側退却', DR: '防御側退却', DE: '防御側壊滅', EX: '相打ち', C: '効果なし' };
  // ソ連の裏の内訳（全59個。数を数えて推測されないよう多めにあり、余りは使わない）
  const SOV_MIX = {
    inf: { 4: 4, 3: 6, 2: 10, 1: 10, 0: 2 },
    cav: { 3: 1, 2: 1, 1: 2, 0: 1 },
    tank: { 9: 1, 8: 2, 7: 3, 6: 3, 5: 5, 4: 3, 3: 2, 2: 1, 1: 1, 0: 1 },
  };
  const SOV_MOVE = { inf: 3, cav: 7, tank: 8 };
  // ソ連の配置（増援1〜5は地図のタグ、都市は「ドイツの登場ヘクスから4ヘクス以上離れた都市」に2個ずつ）
  const SOV_SETUP = [
    { key: 'reinforce_5', label: 'ソ連第11軍', units: { inf: 2, tank: 1 } },
    { key: 'reinforce_4', label: 'ソ連第3軍', units: { inf: 6, tank: 3 } },
    { key: 'reinforce_3', label: 'ソ連第10軍', units: { inf: 6, tank: 3 } },
    { key: 'reinforce_2', label: 'ソ連第4軍', units: { inf: 4, tank: 3 } },
    { key: 'reinforce_1', label: '増援1', units: { inf: 4, tank: 3 } },
    { key: 'city', label: '都市', units: { inf: 4, tank: 6, cav: 2 } },
  ];
  // ソ連の増援（燃料集積所から）: 5・6ターン騎兵1、7・8ターン歩兵1
  const SOV_REINF = { 5: 'cav', 6: 'cav', 7: 'inf', 8: 'inf' };
  // ドイツの配置（地図のタグのヘクスに直接置く）
  const GER_SETUP = [
    { key: 'reinforce_sw', label: 'ドイツ第3装甲集団', units: { tank: 4, mot: 3, inf: 4 } },
    { key: 'reinforce_s', label: 'ドイツ第9軍', units: { inf: 8 } },
    { key: 'reinforce_nw', label: 'ドイツ第4軍', units: { inf: 12 } },
    { key: 'reinforce_n', label: 'ドイツ第2装甲集団', units: { tank: 5, mot: 3, inf: 6 } },
  ];
  const STACK_MAX = 2;
  const LAST_TURN = 8;
  const WEST_ROAD_COL = 7; // 突破の「地図左」: 道路の西の端（列7以下の道路ヘクス）

  // ===== 地図 =====
  function buildMap(md) {
    const G = md.GRID_PARAMS, COLS = G.cols, ROWS = G.rows;
    const id = (c, r) => String(c + 1).padStart(2, '0') + String(r + 1).padStart(2, '0');
    const parse = h => ({ c: +h.slice(0, 2) - 1, r: +h.slice(2) - 1 });
    const inBounds = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
    // pointy-top、奇数行が右にずれる（エディタと同じ）
    function neighbors(h) {
      const { c, r } = parse(h);
      const d = (r % 2 === 0)
        ? [[c, r - 1], [c + 1, r], [c, r + 1], [c - 1, r + 1], [c - 1, r], [c - 1, r - 1]]
        : [[c + 1, r - 1], [c + 1, r], [c + 1, r + 1], [c, r + 1], [c - 1, r], [c, r - 1]];
      return d.filter(([a, b]) => inBounds(a, b)).map(([a, b]) => id(a, b));
    }
    const cube = h => { const { c, r } = parse(h); const x = c - (r - (r & 1)) / 2; return { x, z: r, y: -x - r }; };
    function dist(a, b) { const A = cube(a), B = cube(b); return Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z)); }
    const terrainOf = h => md.TERRAIN_MAP[h] || 'p';
    // 遊べる範囲: マップ外(x)の枠の内側（大都市1227から塗りつぶし）
    const playable = new Set();
    const start = Object.keys(md.FACILITY_MAP).find(h => md.FACILITY_MAP[h] === 'bc') || '1227';
    const st = [start];
    playable.add(start);
    while (st.length) {
      const h = st.pop();
      for (const n of neighbors(h)) if (!playable.has(n) && terrainOf(n) !== 'x') { playable.add(n); st.push(n); }
    }
    const roads = {};
    for (const [h, v] of Object.entries(md.ROAD_MAP || {})) roads[h] = new Set((Array.isArray(v) ? v : [v]).map(Number));
    const rivers = new Set();
    for (const p of (md.RIVER_MAP || [])) if ((p[2] || 'river') !== 'erase') rivers.add([p[0], p[1]].sort().join('-'));
    const tags = {};
    for (const [h, t] of Object.entries(md.TAG_MAP || {})) (tags[t] = tags[t] || []).push(h);
    const hexes = [...playable].sort();
    const center = h => {
      const { c, r } = parse(h), s = G.hexSize, w = Math.sqrt(3) * s;
      return { x: G.offsetX + c * w + w / 2 + (r % 2 === 1 ? w / 2 : 0), y: G.offsetY + r * s * 1.5 + s };
    };
    return {
      G, hexes, id, parse, neighbors, dist, center, playable,
      terrain: terrainOf,
      facility: h => md.FACILITY_MAP[h] || '',
      tag: h => (md.TAG_MAP || {})[h] || '',
      tags,
      passable: h => playable.has(h) && terrainOf(h) !== 'lake' && terrainOf(h) !== 'x',
      river: (a, b) => rivers.has([a, b].sort().join('-')),
      road: (a, b) => { const A = roads[a], B = roads[b]; if (!A || !B) return false; for (const x of A) if (B.has(x)) return true; return false; },
      hasRoad: h => !!roads[h],
      roadHexes: Object.keys(roads),
    };
  }

  // ===== ゲーム =====
  class Game {
    constructor(md, images, opts) {
      opts = opts || {};
      this.map = buildMap(md);
      this.images = images;
      this.rng = opts.rng || Math.random;
      this.turn = 1;
      this.phase = 'setup_sov';
      this.units = [];
      this.control = {};          // 都市・大都市 → 'sov' | 'ger'（一度もドイツに支配されていない都市はソ連）
      this.breakScore = 0;
      this.log = [];
      this.listeners = [];
      this.declared = [];         // 戦闘の組み合わせ
      this.pending = null;        // 判定中の戦闘の処理待ち（退却・前進の選択）
      this.combatQueue = null;
      for (const h of this.map.hexes) if (CITY_POINTS[this.map.facility(h)]) this.control[h] = 'sov';
      this.gerEntryHexes = GER_SETUP.flatMap(a => this.map.tags[a.key] || []);
      this.sovAreasMissing = SOV_SETUP.filter(a => a.key !== 'city' && !(this.map.tags[a.key] || []).length).map(a => a.label);
      this._makeUnits();
    }

    on(fn) { this.listeners.push(fn); }
    emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch (e) { /* 画面側のエラーは進行を止めない */ } } }
    addLog(text, kind) { const e = { turn: this.turn, phase: this.phase, text, kind: kind || 'info' }; this.log.push(e); this.emit({ type: 'log', entry: e }); }
    roll() { return 1 + Math.floor(this.rng() * 6); }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

    _makeUnits() {
      let n = 0;
      // ドイツ: 10-10 は画像が7枚なので使い回す
      const gerImgs = this.images.ger;
      const byType = t => gerImgs.filter(u => u.type === t);
      for (const area of GER_SETUP) {
        for (const [t, cnt] of Object.entries(area.units)) {
          for (let i = 0; i < cnt; i++) {
            const list = byType(t);
            const used = this.units.filter(u => u.side === 'ger' && u.type === t).length;
            const im = list[used % list.length];
            this.units.push({ id: 'g' + (++n), side: 'ger', type: t, str: im.str, mov: im.mov, img: im.img, label: (im.num ? im.num + ' ' : '') + (im.corps || ''), area: area.key, hex: null, alive: true, revealed: true });
          }
        }
      }
      // ソ連: 内訳59個から種類ごとに裏を見ずに引く（余りは使わない）
      this.sovPool = {};
      for (const [t, mix] of Object.entries(SOV_MIX)) {
        const arr = [];
        for (const [s, c] of Object.entries(mix)) for (let i = 0; i < c; i++) arr.push(+s);
        this.sovPool[t] = this.shuffle(arr);
      }
      const imgUse = {};
      const sovBackImg = (t, s) => {
        const list = (this.images.sovImages[t] || {})[s];
        if (!list || !list.length) return null; // 画像がない（騎兵2-7）
        const k = t + s; imgUse[k] = (imgUse[k] || 0);
        return list[imgUse[k]++ % list.length].img;
      };
      this._sovBackImg = sovBackImg;
      for (const area of SOV_SETUP) {
        for (const [t, cnt] of Object.entries(area.units)) for (let i = 0; i < cnt; i++) this.units.push(this._newSov(t, area.key, ++n));
      }
      this.sovReinf = {};
      for (const [turn, t] of Object.entries(SOV_REINF)) this.sovReinf[turn] = this._newSov(t, 'reinf', ++n);
      this.sovReinf = Object.fromEntries(Object.entries(this.sovReinf).map(([k, u]) => { this.units.push(u); return [k, u.id]; }));
    }
    _newSov(t, area, n) {
      const s = this.sovPool[t].pop();
      return { id: 's' + n, side: 'sov', type: t, str: s, mov: SOV_MOVE[t], img: this.images.sovFront[t], backImg: this._sovBackImg(t, s), area, hex: null, alive: true, revealed: false };
    }

    // ===== 参照 =====
    unit(id) { return this.units.find(u => u.id === id); }
    unitsAt(h) { return this.units.filter(u => u.alive && u.hex === h); }
    sideUnits(side) { return this.units.filter(u => u.alive && u.side === side); }
    onMap(side) { return this.units.filter(u => u.alive && u.hex && (!side || u.side === side)); }
    enemyOf(side) { return side === 'ger' ? 'sov' : 'ger'; }
    enemyAt(h, side) { return this.units.some(u => u.alive && u.hex === h && u.side !== side); }
    friendCount(h, side) { return this.units.filter(u => u.alive && u.hex === h && u.side === side).length; }
    adjEnemy(h, side) { return this.map.neighbors(h).some(n => this.enemyAt(n, side)); }
    activeSide() { return this.phase.startsWith('sov') || this.phase === 'setup_sov' ? 'sov' : (this.phase === 'over' ? null : 'ger'); }
    knownStr(u) { return (u.side === 'ger' || u.revealed) ? u.str : null; }
    // 相手から見た（または自分でも分からない）ソ連の推定戦闘力: まだ見えていない駒の種類ごとの平均
    estStr(u) {
      if (u.side === 'ger' || u.revealed) return u.str;
      const mix = SOV_MIX[u.type];
      let tot = 0, cnt = 0;
      for (const [s, c] of Object.entries(mix)) { tot += (+s) * c; cnt += c; }
      for (const v of this.units) if (v.side === 'sov' && v.type === u.type && v.revealed) { tot -= v.str; cnt -= 1; }
      return cnt > 0 ? tot / cnt : 0;
    }
    unitName(u) {
      const s = (u.side === 'ger' || u.revealed) ? `${u.str}-${u.mov}` : `U-${u.mov}`;
      return `${SIDE_NAME[u.side]}${TYPE_NAME[u.type]}(${s})`;
    }

    // ===== 配置 =====
    setupAreas(side) {
      const defs = side === 'ger' ? GER_SETUP : SOV_SETUP;
      return defs.map(a => ({ key: a.key, label: a.label, hexes: this.areaHexes(a.key), units: this.units.filter(u => u.side === side && u.area === a.key) }));
    }
    // 都市の配置先: ドイツの登場ヘクスから4ヘクス以上離れた都市・大都市
    cityHexes() { return this.map.hexes.filter(h => CITY_POINTS[this.map.facility(h)] && Math.min(...this.gerEntryHexes.map(g => this.map.dist(h, g))) >= 4); }
    areaHexes(key) {
      this._areaCache = this._areaCache || {};
      if (this._areaCache[key]) return this._areaCache[key];
      let r;
      if (key === 'city') r = this.cityHexes();
      else {
        const t = this.map.tags[key] || [];
        if (t.length) r = t.filter(h => this.map.passable(h));
        // 増援1〜5の場所が地図データにまだない間の仮: ドイツの登場ヘクスから4ヘクス以上離れたヘクス（都市を除く）
        else r = this.map.hexes.filter(h => this.map.passable(h) && !CITY_POINTS[this.map.facility(h)] && Math.min(...this.gerEntryHexes.map(g => this.map.dist(h, g))) >= 4);
      }
      return (this._areaCache[key] = r);
    }
    canPlace(u, h) {
      if (!(this.phase === 'setup_' + u.side) || !u.alive) return false;
      if (!this.areaHexes(u.area).includes(h)) return false;
      if (this.enemyAt(h, u.side)) return false;
      return this.units.filter(v => v.alive && v.hex === h && v.side === u.side && v !== u).length < STACK_MAX;
    }
    place(u, h) { if (!this.canPlace(u, h)) return false; u.hex = h; this.emit({ type: 'change' }); return true; }
    unplace(u) { if (this.phase !== 'setup_' + u.side) return false; u.hex = null; this.emit({ type: 'change' }); return true; }
    setupUnits(side) { return this.units.filter(u => u.side === side && u.area !== 'reinf'); }
    setupDone(side) { return this.setupUnits(side).every(u => u.hex); }
    // ===== 戦線の穴 =====
    // 前線の帯 = ソ連の増援2〜5の場所。帯の西（ドイツ側）と東（ソ連の後方）を分ける
    frontRegions() {
      if (this._front) return this._front;
      const band = new Set(['reinforce_2', 'reinforce_3', 'reinforce_4', 'reinforce_5'].flatMap(k => this.map.tags[k] || []));
      const west = new Set(), st = [];
      for (const h of this.gerEntryHexes) if (!band.has(h)) { west.add(h); st.push(h); }
      while (st.length) { const h = st.pop(); for (const n of this.map.neighbors(h)) if (this.map.passable(n) && !band.has(n) && !west.has(n)) { west.add(n); st.push(n); } }
      const east = new Set(this.map.hexes.filter(h => this.map.passable(h) && !band.has(h) && !west.has(h)));
      return (this._front = { band, west, east });
    }
    // ドイツ側から、ソ連のいない・ソ連に隣接しないヘクスだけを通って後方へ抜けられる道（穴）を探す
    frontHole() {
      const { west, east } = this.frontRegions();
      const sov = new Set(this.units.filter(u => u.alive && u.side === 'sov' && u.hex).map(u => u.hex));
      const zoc = h => sov.has(h) || this.map.neighbors(h).some(n => sov.has(n));
      const prev = new Map(), q = [];
      for (const h of west) if (!sov.has(h)) { prev.set(h, null); q.push(h); }
      for (let i = 0; i < q.length; i++) {
        const h = q[i];
        if (east.has(h)) { const path = []; for (let x = h; x; x = prev.get(x)) path.unshift(x); return path.filter(x => !west.has(x)); }
        for (const n of this.map.neighbors(h)) if (!prev.has(n) && this.map.passable(n) && !zoc(n)) { prev.set(n, h); q.push(n); }
      }
      return null;
    }
    finishSetup(side) {
      if (this.phase !== 'setup_' + side || !this.setupDone(side)) return false;
      // 戦線の穴は AI が作らないようにする。人間の配置は画面で注意を出すだけ（止めない）
      if (side === 'sov') { this.phase = 'setup_ger'; this.addLog('ソ連の配置が終わりました。ドイツが配置します'); }
      else {
        this.sovInitialAdjacentInfantry = new Set(this.onMap('sov')
          .filter(u => u.type === 'inf' && this.adjEnemy(u.hex, 'sov')).map(u => u.id));
        this.addLog('ドイツの配置が終わりました');
        this._startTurn();
      }
      this.emit({ type: 'phase' });
      return true;
    }

    // ===== 手番 =====
    _startTurn() {
      // 1ターン目はソ連の移動と戦闘がなく、ドイツの手番から始まる
      if (this.turn === 1) this._enterPhase('ger_move'); else this._enterPhase('sov_move');
    }
    _enterPhase(p) {
      this.phase = p;
      this.declared = [];
      this.pending = null;
      this.combatQueue = null;
      this.moveState = {};
      this.undoStack = [];
      if (p === 'sov_move' || p === 'ger_move') {
        const side = p.slice(0, 3);
        for (const u of this.onMap(side)) this.moveState[u.id] = { mp: u.mov, moved: false, stopped: false, start: u.hex, group: null };
        if (p === 'sov_move') this._sovReinforce();
      }
      this.addLog(`ターン${this.turn} ${PHASE_NAME[p]}`, 'phase');
      this.emit({ type: 'phase' });
    }
    _sovReinforce() {
      const uid = this.sovReinf[this.turn];
      if (!uid) return;
      const u = this.unit(uid);
      const depots = (this.map.tags.fuel || []).filter(h => !this.enemyAt(h, 'sov'));
      if (!depots.length) { this.addLog('ソ連の増援: 燃料集積所がドイツに占領されているため登場できません'); u.alive = false; u.notUsed = true; return; }
      depots.sort((a, b) => this.friendCount(a, 'sov') - this.friendCount(b, 'sov'));
      u.hex = depots[0];
      this.moveState[u.id] = { mp: u.mov, moved: false, stopped: false, start: u.hex, group: null };
      this.addLog(`ソ連の増援: ${TYPE_NAME[u.type]}が燃料集積所（${u.hex}）に登場`);
    }
    endPhase() {
      if (this.phase === 'sov_move' || this.phase === 'ger_move') {
        const side = this.phase.slice(0, 3);
        const over = this.overStacked(side);
        if (over.length) return { ok: false, reason: `ヘクス ${over.join(', ')} に${STACK_MAX + 1}個以上重なっています（移動の終了時は${STACK_MAX}個まで）` };
        if (side === 'ger') this._checkBreakthrough();
        this._enterPhase(side + '_combat');
        return { ok: true };
      }
      if (this.phase === 'sov_combat' || this.phase === 'ger_combat') {
        if (this.combatQueue && (this.combatQueue.length || this.pending)) return { ok: false, reason: '戦闘の判定が終わっていません' };
        if (this.declared.length && !this.combatQueue) return { ok: false, reason: '宣言した戦闘を判定してください' };
        if (this.phase === 'sov_combat') this._enterPhase('ger_move');
        else if (this.turn >= LAST_TURN) this._gameOver();
        else { this.turn++; this._enterPhase('sov_move'); }
        return { ok: true };
      }
      return { ok: false, reason: 'このフェイズは終了できません' };
    }
    overStacked(side) {
      const cnt = {};
      for (const u of this.onMap(side)) cnt[u.hex] = (cnt[u.hex] || 0) + 1;
      return Object.keys(cnt).filter(h => cnt[h] > STACK_MAX);
    }

    // ===== 移動 =====
    // 敵に隣接したら移動終了。隣接ヘクスから隣接ヘクスへの直接移動は禁止。一度離れて再び隣接するのは可
    moveCost(a, b) {
      if (!this.map.passable(b)) return Infinity;
      if (this.map.road(a, b)) return 1; // 道路に沿えば地形・河川に関係なく1
      return (TERRAIN_COST[this.map.terrain(b)] || 1) + (this.map.river(a, b) ? 1 : 0);
    }
    reachable(u) { return this.reachableGroup([u]); }
    // スタックでまとめて動く時は、残り移動力のいちばん少ない駒に合わせる
    reachableGroup(units) {
      const out = new Map();
      if (!units.length) return out;
      const u = units[0];
      if (!units.every(v => this.canMove(v) && v.hex === u.hex)) return out;
      const ms = { mp: Math.min(...units.map(v => this.moveState[v.id].mp)) };
      const side = u.side, start = u.hex;
      // 第1ターンは他の味方軍の配置エリアへ入れない。
      // 自分のエリアから出て国境を越える移動は通常どおり可能。
      const ownAreas = side === 'ger' && this.turn === 1
        ? units.map(v => new Set(this.areaHexes(v.area))) : [];
      const friendlyAreas = ownAreas.length ? new Set(this.gerEntryHexes) : null;
      const best = new Map([[start, 0]]);
      const prev = new Map();
      const q = [[0, start]];
      while (q.length) {
        q.sort((a, b) => a[0] - b[0]);
        const [cost, h] = q.shift();
        if (cost > best.get(h)) continue;
        const adjH = this.adjEnemy(h, side);
        if (h !== start && adjH) continue; // 敵に隣接したヘクスでは止まる
        for (const n of this.map.neighbors(h)) {
          if (friendlyAreas?.has(n) && ownAreas.some(area => !area.has(n))) continue;
          if (this.enemyAt(n, side)) continue;
          const c = cost + this.moveCost(h, n);
          if (c > ms.mp) continue;
          if (adjH && this.adjEnemy(n, side)) continue; // 隣接→隣接は禁止
          if (!best.has(n) || c < best.get(n)) { best.set(n, c); prev.set(n, h); q.push([c, n]); }
        }
      }
      for (const [h, c] of best) if (h !== start) {
        const path = [h]; let p = h;
        while (prev.get(p) && prev.get(p) !== start) { p = prev.get(p); path.unshift(p); }
        out.set(h, { cost: c, path });
      }
      return out;
    }
    revisionTargets(u) {
      const original = this.moveState?.[u.id];
      if (this.phase !== 'sov_move' || u.side !== 'sov' || !u.alive || !original?.start) return new Map();
      const current = u.hex;
      const from = original.start;
      u.hex = from;
      this.moveState[u.id] = { ...original, mp: u.mov, stopped: false };
      try {
        const targets = this.reachable(u);
        targets.set(from, { cost: 0, path: [] });
        for (const hex of targets.keys()) {
          const others = this.friendCount(hex, u.side) - Number(hex === from);
          if (others >= STACK_MAX || this.enemyAt(hex, u.side)) targets.delete(hex);
        }
        return targets;
      } finally {
        u.hex = current;
        this.moveState[u.id] = original;
      }
    }
    canMove(u) { const ms = this.moveState && this.moveState[u.id]; return !!(ms && u.alive && u.hex && !ms.stopped && ms.mp > 0 && this.phase === u.side + '_move'); }
    moveUnit(u, h) { return this.moveGroup([u], h); }
    // 移動開始の時に同じヘクスにいる駒（またはいっしょに動いてきた駒）は、まとめて動ける
    stackMates(u) {
      const ms = this.moveState && this.moveState[u.id];
      if (!ms || !this.canMove(u)) return [];
      return this.unitsAt(u.hex).filter(v => v !== u && v.side === u.side && this.canMove(v) && (() => {
        const m2 = this.moveState[v.id];
        return (!ms.moved && !m2.moved && ms.start === u.hex && m2.start === u.hex) || (ms.group && ms.group === m2.group);
      })());
    }
    // ===== 移動の取り消し（同じ移動フェイズの中だけ） =====
    _snap() {
      this.undoStack = this.undoStack || [];
      this.undoStack.push({
        units: this.units.map(u => ({ id: u.id, hex: u.hex, alive: u.alive, revealed: u.revealed, broke: u.broke })),
        ms: JSON.parse(JSON.stringify(this.moveState)), control: Object.assign({}, this.control),
        logLen: this.log.length, breakScore: this.breakScore, grp: this._grp,
      });
    }
    canUndo() { return !!(this.undoStack && this.undoStack.length) && (this.phase === 'ger_move' || this.phase === 'sov_move'); }
    undo() {
      if (!this.canUndo()) return false;
      const s = this.undoStack.pop();
      for (const x of s.units) { const u = this.unit(x.id); u.hex = x.hex; u.alive = x.alive; u.revealed = x.revealed; u.broke = x.broke; }
      this.moveState = s.ms; this.control = s.control; this.log.length = s.logLen; this.breakScore = s.breakScore; this._grp = s.grp;
      this.emit({ type: 'undo' });
      return true;
    }
    moveGroup(units, h) {
      if (!units.length || !units.every(v => this.canMove(v))) return false;
      if (units.length > 1 && !units.slice(1).every(v => this.stackMates(units[0]).includes(v))) return false;
      const r = this.reachableGroup(units).get(h);
      if (!r) return false;
      this._snap();
      const gid = 'm' + (this._grp = (this._grp || 0) + 1);
      for (const u of units) {
        const ms = this.moveState[u.id];
        const from = u.hex;
        for (const p of r.path) this._pass(u, p);
        u.hex = h;
        ms.mp -= r.cost; ms.moved = true; ms.group = gid;
        if (this.adjEnemy(h, u.side)) ms.stopped = true;
        this.emit({ type: 'move', unit: u.id, from, to: h, path: r.path });
      }
      return true;
    }
    // 通過した都市は、最後に通過した側の支配
    _pass(u, h) {
      if (this.control[h] && this.control[h] !== u.side) {
        this.control[h] = u.side;
        this.addLog(`${SIDE_NAME[u.side]}が${FAC_NAME[this.map.facility(h)]}（${h}）を支配`, 'control');
      }
    }

    // ===== オーバーラン（ドイツのみ。移動の途中で敵に隣接し、10倍以上なら除去して移動を続ける）
    defMult(h, attackerHexes) {
      let m = Math.max(TERRAIN_MULT[this.map.terrain(h)] || 1, FAC_MULT[this.map.facility(h)] || 1);
      if (attackerHexes && attackerHexes.length && attackerHexes.every(a => this.map.river(a, h))) m = Math.max(m, 2); // 全て川越しなら×2（複合しない、有利な方だけ）
      return m;
    }
    // オーバーランする駒: 移動開始の時にスタックしていて、いっしょに動いてきた駒は合わせてできる
    overrunGroup(u) {
      const ms = this.moveState && this.moveState[u.id];
      if (!ms || !u.hex) return [];
      // まだ動いていない駒は、同じヘクスのまだ動いていない駒と合わせる
      if (!ms.moved) return this.unitsAt(u.hex).filter(v => v.side === u.side && this.moveState[v.id] && !this.moveState[v.id].moved);
      return this.unitsAt(u.hex).filter(v => v.side === u.side && this.moveState[v.id] && this.moveState[v.id].moved && this.moveState[v.id].group === ms.group);
    }
    overrunStrength(u) { return this.overrunGroup(u).reduce((t, v) => t + v.str, 0); }
    overrunTargets(u) {
      if (u.side !== 'ger' || this.phase !== 'ger_move') return [];
      const ms = this.moveState[u.id];
      if (!ms || !u.hex) return [];
      const att = this.overrunStrength(u);
      const out = [];
      for (const n of this.map.neighbors(u.hex)) {
        const def = this.unitsAt(n).filter(v => v.side === 'sov');
        if (!def.length) continue;
        if (def.some(v => !v.revealed)) continue; // 戦闘力が分からないソ連にはできない
        const d = def.reduce((s, v) => s + v.str, 0) * this.defMult(n, [u.hex]);
        if (att >= 10 * d) out.push(n);
      }
      return out;
    }
    overrun(u, h) {
      if (!this.overrunTargets(u).includes(h)) return false;
      const def = this.unitsAt(h).filter(v => v.side === 'sov');
      if (!def.length) return false;
      this._snap();
      for (const v of def) this._kill(v, 'オーバーラン');
      const grp = this.overrunGroup(u);
      this.addLog(`オーバーラン: ${grp.map(v => this.unitName(v)).join('と')}（戦闘力${grp.reduce((t, v) => t + v.str, 0)}）が ${h} の ${def.length}個を除去`, 'combat');
      if (!this.adjEnemy(u.hex, u.side)) for (const v of grp) this.moveState[v.id].stopped = false;
      this.emit({ type: 'change' });
      return true;
    }

    // ===== 突破（ドイツの戦車・自動車化歩兵が燃料集積所へ。道路で地図左へ繋がり、その道路に敵がいない・隣接していない）
    breakthroughPathOK(depot) {
      const ok = h => !this.enemyAt(h, 'ger') && !this.adjEnemy(h, 'ger');
      if (!this.map.hasRoad(depot)) return false;
      const seen = new Set([depot]), st = [depot];
      while (st.length) {
        const h = st.pop();
        if (this.map.parse(h).c + 1 <= WEST_ROAD_COL) return true;
        for (const n of this.map.neighbors(h)) if (!seen.has(n) && this.map.road(h, n) && ok(n)) { seen.add(n); st.push(n); }
      }
      return false;
    }
    _checkBreakthrough() {
      for (const h of (this.map.tags.fuel || [])) {
        for (const u of this.unitsAt(h).filter(v => v.side === 'ger' && BREAK_POINTS[v.type] && !v.broke)) {
          if (!this.breakthroughPathOK(h)) { this.addLog(`突破の条件（地図左への道路）が満たされていません（${h}）`); continue; }
          u.broke = true; this.breakScore += BREAK_POINTS[u.type];
          this.addLog(`突破: ${this.unitName(u)} が燃料集積所（${h}）へ ＋${BREAK_POINTS[u.type]}点`, 'score');
        }
      }
    }

    // ===== 戦闘 =====
    combatSide() { return this.phase === 'sov_combat' ? 'sov' : this.phase === 'ger_combat' ? 'ger' : null; }
    attackedHexes() { return new Set(this.declared.map(d => d.hex)); }
    usedAttackers() { return new Set(this.declared.flatMap(d => d.attackers)); }
    canDeclare(attIds, h) {
      const side = this.combatSide();
      if (!side || this.combatQueue) return false;
      if (!attIds.length || !this.unitsAt(h).some(v => v.side !== side)) return false;
      if (new Set(attIds).size !== attIds.length) return false;
      const existing = this.declared.find(d => d.hex === h);
      if (existing && attIds.every(id => existing.attackers.includes(id))) return false;
      const used = new Set(this.declared.filter(d => d !== existing).flatMap(d => d.attackers));
      return attIds.every(id => { const u = this.unit(id); return u && u.alive && u.side === side && u.hex && !used.has(id) && this.map.neighbors(u.hex).includes(h); });
    }
    declare(attIds, h) {
      if (!this.canDeclare(attIds, h)) return false;
      const existing = this.declared.find(d => d.hex === h);
      if (existing) existing.attackers = [...new Set([...existing.attackers, ...attIds])];
      else this.declared.push({ attackers: attIds.slice(), hex: h });
      this.emit({ type: 'change' });
      return true;
    }
    undeclare(i) { if (this.combatQueue) return false; this.declared.splice(i, 1); this.emit({ type: 'change' }); return true; }
    oddsOf(att, def) {
      if (def <= 0) return att > 0 ? '7:1' : '1:1';
      const r = att / def;
      if (r >= 7) return '7:1';
      if (r < 1 / 3) return '1:4';
      let col = '1:3';
      for (const [k, v] of ODDS_COLS) if (r >= v - 1e-9) col = k;
      return col;
    }
    // 宣言時の見込み（見えていないソ連は推定値）
    previewOdds(attIds, h, est) {
      const side = this.unit(attIds[0]).side;
      const atk = attIds.map(id => this.unit(id));
      const str = u => est ? this.estStr(u) : (this.knownStr(u) == null ? null : this.knownStr(u));
      let att = 0, def = 0, unknown = false;
      for (const u of atk) { const s = str(u); if (s == null) unknown = true; else att += s; }
      for (const v of this.unitsAt(h).filter(v => v.side !== side)) { const s = str(v); if (s == null) unknown = true; else def += s; }
      const mult = this.defMult(h, [...new Set(atk.map(u => u.hex))]);
      return { att, def: def * mult, mult, unknown, odds: unknown ? null : this.oddsOf(att, def * mult) };
    }
    // 組み合わせを全部宣言したら判定を始める。ここでソ連の裏が判明する
    startResolve() {
      if (this.combatQueue || !this.combatSide()) return false;
      const side = this.combatSide();
      for (const d of this.declared) {
        const all = [...d.attackers.map(id => this.unit(id)), ...this.unitsAt(d.hex).filter(v => v.side !== side)];
        for (const u of all) if (u.side === 'sov' && !u.revealed) { u.revealed = true; this.emit({ type: 'reveal', unit: u.id }); }
      }
      if (this.declared.length) this.addLog(`戦闘の組み合わせ ${this.declared.length}件。ソ連の戦闘力が判明`, 'combat');
      // 戦闘力0の駒は、表にした時点で除去（ユーザーの指示 2026-11-03）
      for (const u of this.units) if (u.alive && u.hex && u.side === 'sov' && u.revealed && u.str === 0) this._kill(u, '戦闘力0');
      this.combatQueue = this.declared.map((d, i) => i);
      this.emit({ type: 'change' });
      return true;
    }
    // 次に判定する戦闘の中身（サイコロを振る前に画面に出す用）
    peekNext() {
      if (!this.combatQueue || this.pending || !this.combatQueue.length) return null;
      const i = this.combatQueue[0], d = this.declared[i], side = this.combatSide();
      const atk = d.attackers.map(id => this.unit(id)).filter(u => u.alive && u.hex);
      const def = this.unitsAt(d.hex).filter(v => v.side !== side);
      const no = this.declared.length - this.combatQueue.length + 1;
      if (!atk.length || !def.length) return { hex: d.hex, skip: true, no, total: this.declared.length };
      const mult = this.defMult(d.hex, [...new Set(atk.map(u => u.hex))]);
      const att = atk.reduce((s, u) => s + u.str, 0), dfn = def.reduce((s, u) => s + u.str, 0) * mult;
      return { hex: d.hex, attackers: atk.map(u => u.id), defenders: def.map(u => u.id), att, def: dfn, mult, odds: this.oddsOf(att, dfn), side, no, total: this.declared.length };
    }
    // 次の戦闘を判定。結果に退却・前進の選択が残る時は pending に入る
    resolveNext() {
      if (!this.combatQueue || this.pending) return null;
      if (!this.combatQueue.length) return null;
      const i = this.combatQueue.shift();
      const d = this.declared[i];
      const side = this.combatSide();
      const atk = d.attackers.map(id => this.unit(id)).filter(u => u.alive && u.hex);
      const def = this.unitsAt(d.hex).filter(v => v.side !== side);
      if (!atk.length || !def.length) { this.addLog(`戦闘（${d.hex}）: 相手がいないため取りやめ`); this.emit({ type: 'change' }); return { skipped: true, hex: d.hex }; }
      const mult = this.defMult(d.hex, [...new Set(atk.map(u => u.hex))]);
      const att = atk.reduce((s, u) => s + u.str, 0);
      const dfn = def.reduce((s, u) => s + u.str, 0) * mult;
      const odds = this.oddsOf(att, dfn);
      const die = this.roll();
      const res = odds === '7:1' ? 'DE' : odds === '1:4' ? 'AE' : CRT[odds][die - 1];
      const r = { hex: d.hex, attackers: atk.map(u => u.id), defenders: def.map(u => u.id), att, def: dfn, mult, odds, die, result: res, side };
      this.addLog(`戦闘 ${d.hex}: 攻撃${att} 対 防御${dfn}（×${mult}）→ ${odds.replace(':', '対')}、ダイス${die} → ${res}（${RESULT_NAME[res]}）`, 'combat');
      this.pending = { r, retreat: [], advance: null };
      if (res === 'AE') for (const u of atk) this._kill(u, '攻撃側全滅');
      else if (res === 'AR') this.pending.retreat = atk.map(u => ({ unit: u.id, dist: 1 }));
      else if (res === 'DR') { this.pending.retreat = def.map(u => ({ unit: u.id, dist: 2 })); this.pending.advanceAfter = true; }
      else if (res === 'DE') { for (const u of def) this._kill(u, '防御側壊滅'); this.pending.advanceAfter = true; }
      else if (res === 'EX') {
        // 戦力の少ない側が全滅し、その数字以上のユニットを相手側が除去（同じ時は防御側を少ない側とする）
        // 比べるのは駒に書いてある戦闘力の合計（地形の倍率はかけない）
        const defRaw = def.reduce((s, u) => s + u.str, 0);
        const attSmaller = att < defRaw;
        const small = attSmaller ? atk : def, big = attSmaller ? def : atk, n = attSmaller ? att : defRaw;
        this.addLog(`相打ち: 駒の戦闘力 攻撃${att} 対 防御${defRaw} → ${attSmaller ? '攻撃側' : '防御側'}が全滅し、${attSmaller ? '防御側' : '攻撃側'}は${n}以上を除去`, 'combat');
        for (const u of small) this._kill(u, '相打ち');
        this._loseAtLeast(big, n);
        if (!attSmaller && atk.some(u => u.alive)) this.pending.advanceAfter = true;
      }
      this._afterResult();
      this.emit({ type: 'combat', result: r });
      return r;
    }
    _loseAtLeast(units, n) {
      // 印刷された戦闘力の合計が n 以上になる最小の組み合わせ（足りなければ全部）
      const alive = units.filter(u => u.alive);
      if (n <= 0) return;
      let best = null;
      const k = alive.length;
      for (let mask = 1; mask < (1 << k); mask++) {
        const pick = alive.filter((_, i) => mask & (1 << i));
        const s = pick.reduce((t, u) => t + u.str, 0);
        if (s < n) continue;
        const val = pick.reduce((t, u) => t + u.str * 10 + (KILL_POINTS[u.type] || 0), 0);
        if (!best || s < best.s || (s === best.s && val < best.val)) best = { pick, s, val };
      }
      for (const u of (best ? best.pick : alive)) this._kill(u, '相打ち');
    }
    _afterResult() {
      const p = this.pending;
      p.retreat = p.retreat.filter(x => this.unit(x.unit).alive);
      if (!p.retreat.length && p.advanceAfter && !p.advance) {
        const atk = p.r.attackers.map(id => this.unit(id)).filter(u => u.alive && u.hex);
        if (atk.length && !this.unitsAt(p.r.hex).length) p.advance = { hex: p.r.hex, units: atk.map(u => u.id) };
        p.advanceAfter = false; // 前進の機会は1回だけ
      }
      if (!p.retreat.length && !p.advance) this.pending = null;
    }
    // 退却: 敵のヘクスや敵に隣接するヘクスには入れない。なければ壊滅
    retreatOptions(uid) {
      const u = this.unit(uid);
      const x = this.pending && this.pending.retreat.find(t => t.unit === uid);
      if (!u || !x) return [];
      const side = u.side;
      const okStep = h => this.map.passable(h) && !this.enemyAt(h, side) && !this.adjEnemy(h, side);
      let frontier = [u.hex];
      const seen = new Set([u.hex]);
      for (let s = 0; s < x.dist; s++) {
        const next = [];
        for (const h of frontier) for (const n of this.map.neighbors(h)) if (!seen.has(n) && okStep(n)) { seen.add(n); next.push(n); }
        frontier = next;
      }
      return frontier.filter(h => this.map.dist(h, u.hex) === x.dist && this.friendCount(h, side) < STACK_MAX);
    }
    retreatPath(uid, to) {
      const u = this.unit(uid);
      if (this.map.dist(u.hex, to) === 1) return [to];
      const mid = this.map.neighbors(u.hex).find(n => this.map.neighbors(n).includes(to) && this.map.passable(n) && !this.enemyAt(n, u.side) && !this.adjEnemy(n, u.side));
      return mid ? [mid, to] : [to];
    }
    applyRetreat(uid, to) {
      const p = this.pending;
      if (!p) return false;
      const idx = p.retreat.findIndex(t => t.unit === uid);
      if (idx < 0) return false;
      const u = this.unit(uid);
      const opts = this.retreatOptions(uid);
      if (!opts.length) { this._kill(u, '退却できず壊滅'); }
      else {
        if (!opts.includes(to)) return false;
        const from = u.hex;
        const path = this.retreatPath(uid, to);
        for (const h of path) this._pass(u, h);
        u.hex = to;
        this.addLog(`${this.unitName(u)} が ${from} から ${to} へ退却`);
        this.emit({ type: 'move', unit: uid, from, to, path });
      }
      p.retreat.splice(idx, 1);
      this._afterResult();
      this.emit({ type: 'change' });
      return true;
    }
    // 戦闘後前進: 必ず相手のいたヘクスに入る。移動力8以上はそこからさらに1ヘクス（敵の隣接は気にしない）
    advanceExtraOptions(uid) {
      const u = this.unit(uid), p = this.pending;
      if (!u || !p || !p.advance || u.mov < 8) return [];
      return this.map.neighbors(p.advance.hex).filter(h => this.map.passable(h) && !this.enemyAt(h, u.side) && this.friendCount(h, u.side) < STACK_MAX);
    }
    // 1ヘクスずつ前進する。1歩目は必ず相手のいたヘクス、移動力8以上の駒は2歩目にそこから隣の1ヘクス
    advanceState(uid) { const p = this.pending; return (p && p.advance && p.advance.done && p.advance.done[uid]) || null; }
    advanceTargets(uid) {
      const p = this.pending, u = this.unit(uid);
      if (!p || !p.advance || !u || !u.alive || !p.advance.units.includes(uid)) return [];
      const H = p.advance.hex, st = this.advanceState(uid);
      if (!st) return this.friendCount(H, u.side) < STACK_MAX ? [H] : [];
      if (st === 'in' && u.mov >= 8 && u.hex === H) return this.advanceExtraOptions(uid);
      return [];
    }
    advanceStep(uid, hex) {
      if (!this.advanceTargets(uid).includes(hex)) return false;
      const p = this.pending, u = this.unit(uid);
      p.advance.done = p.advance.done || {};
      const from = u.hex;
      this._pass(u, hex);
      u.hex = hex;
      p.advance.done[uid] = p.advance.done[uid] ? 'extra' : 'in';
      this.addLog(`戦闘後前進: ${this.unitName(u)} が ${hex} へ`);
      this.emit({ type: 'move', unit: uid, from, to: hex, path: [hex] });
      return true;
    }
    endAdvance() {
      const p = this.pending;
      if (!p || !p.advance) return false;
      p.advance = null;
      this._afterResult();
      this.emit({ type: 'change' });
      return true;
    }
    applyAdvance(moves) {
      // moves: [{unit, extra?}]（空なら前進しない）。AI 用にまとめて行う
      const p = this.pending;
      if (!p || !p.advance) return false;
      const H = p.advance.hex;
      for (const m of (moves || [])) {
        if (!this.advanceStep(m.unit, H)) continue;
        if (m.extra) this.advanceStep(m.unit, m.extra);
      }
      return this.endAdvance();
    }
    combatFinished() { return !!this.combatQueue && !this.combatQueue.length && !this.pending; }

    _kill(u, why) {
      if (!u.alive) return;
      u.alive = false;
      u.killedTurn = this.turn;
      const pts = u.side === 'ger' ? KILL_POINTS[u.type] : 0;
      this.addLog(`${this.unitName(u)}（${u.hex}）が除去されました（${why}）${pts ? ` ソ連＋${pts}点` : ''}`, 'loss');
      this.emit({ type: 'kill', unit: u.id, hex: u.hex });
    }

    // ===== 得点 =====
    // 都市の得点: ソ連が支配する都市はソ連の得点。ドイツが支配する都市は、道路で西（地図左）につながっている時だけドイツの得点
    // （つながりの条件は突破と同じ: 道路上にソ連がいない・隣接していない）。つながっていなければどちらの得点にもならない
    cityScore(h) {
      const s = this.control[h], pts = CITY_POINTS[this.map.facility(h)] || 0;
      if (s === 'sov') return { side: 'sov', pts };
      if (s === 'ger') return this.breakthroughPathOK(h) ? { side: 'ger', pts } : { side: null, pts: 0, cut: true };
      return { side: null, pts: 0 };
    }
    scores() {
      let gerCities = 0, sovCities = 0;
      const cut = [];
      for (const h of Object.keys(this.control)) {
        const c = this.cityScore(h);
        if (c.side === 'ger') gerCities += c.pts; else if (c.side === 'sov') sovCities += c.pts;
        if (c.cut) cut.push(h);
      }
      const kills = this.units.filter(u => u.side === 'ger' && !u.alive).reduce((t, u) => t + KILL_POINTS[u.type], 0);
      return { ger: gerCities + this.breakScore, gerCities, gerBreak: this.breakScore, sov: sovCities + kills, sovCities, sovKills: kills, cutCities: cut };
    }
    _gameOver() {
      this.phase = 'over';
      const s = this.scores();
      this.winner = s.ger > s.sov ? 'ger' : s.sov > s.ger ? 'sov' : 'draw';
      this.addLog(`ゲーム終了: ドイツ ${s.ger}点（都市${s.gerCities}＋突破${s.gerBreak}） 対 ソ連 ${s.sov}点（都市${s.sovCities}＋壊滅${s.sovKills}） → ${this.winner === 'draw' ? '引き分け' : SIDE_NAME[this.winner] + 'の勝ち'}`, 'score');
      this.emit({ type: 'phase' });
    }
  }
  const PHASE_NAME = { setup_sov: 'ソ連の配置', setup_ger: 'ドイツの配置', sov_move: 'ソ連の移動', sov_combat: 'ソ連の戦闘', ger_move: 'ドイツの移動', ger_combat: 'ドイツの戦闘', over: '終了' };
  const FAC_NAME = { t: '街', c: '都市', bc: '大都市' };

  const DOKUSO = { Game, buildMap, CRT, TERRAIN_COST, TERRAIN_MULT, FAC_MULT, CITY_POINTS, KILL_POINTS, BREAK_POINTS, TYPE_NAME, SIDE_NAME, PHASE_NAME, FAC_NAME, RESULT_NAME, SOV_MIX, SOV_SETUP, GER_SETUP, STACK_MAX, LAST_TURN };
  if (typeof module !== 'undefined') module.exports = DOKUSO;
  root.DOKUSO = DOKUSO;
})(typeof window !== 'undefined' ? window : globalThis);
