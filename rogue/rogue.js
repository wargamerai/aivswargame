// Rogue 5.4 の表と計算式をもとに JavaScript で作り直したもの
(function () {
'use strict';
const $ = id => document.getElementById(id);
const W = 80, H = 22;
const rnd = n => (n <= 0 ? 0 : Math.floor(Math.random() * n));
const roll = (n, s) => { let t = 0; for (let i = 0; i < n; i++) t += 1 + rnd(s); return t; };

let lang = 'ja';
try {
  const q = new URLSearchParams(location.search).get('lang');
  const l = (q === 'ja' || q === 'en') ? q : localStorage.getItem('rogueLang');
  if (l === 'ja' || l === 'en') lang = l;
  else if (!/^ja/i.test(navigator.language || 'ja')) lang = 'en';
} catch (e) { /* 保存できなくても動く */ }
function T(k, p) {
  let s = window.ROGUE_TEXT[lang][k];
  if (s === undefined) return k;
  if (p) for (const n in p) s = s.split('{' + n + '}').join(p[n]);
  return s;
}
const NM = window.ROGUE_NAMES;

// ===== 元のゲームの表（extern.c） =====
const MON = {
  A: ['aquator', 0, 'M', 20, 5, 2, '0x0/0x0'], B: ['bat', 0, 'F', 1, 1, 3, '1x2'], C: ['centaur', 15, '', 17, 4, 4, '1x2/1x5/1x5'], D: ['dragon', 100, 'M', 5000, 10, -1, '1x8/1x8/3x10'],
  E: ['emu', 0, 'M', 2, 1, 7, '1x2'], F: ['venus flytrap', 0, 'M', 80, 8, 3, '0x0'], G: ['griffin', 20, 'MFR', 2000, 13, 2, '4x3/3x5'], H: ['hobgoblin', 0, 'M', 3, 1, 5, '1x8'],
  I: ['ice monster', 0, '', 5, 1, 9, '0x0'], J: ['jabberwock', 70, '', 3000, 15, 6, '2x12/2x4'], K: ['kestrel', 0, 'MF', 1, 1, 7, '1x4'], L: ['leprechaun', 0, '', 10, 3, 8, '1x1'],
  M: ['medusa', 40, 'M', 200, 8, 2, '3x4/3x4/2x5'], N: ['nymph', 100, '', 37, 3, 9, '0x0'], O: ['orc', 15, 'G', 5, 1, 6, '1x8'], P: ['phantom', 0, 'I', 120, 8, 3, '4x4'],
  Q: ['quagga', 0, 'M', 15, 3, 3, '1x5/1x5'], R: ['rattlesnake', 0, 'M', 9, 2, 3, '1x6'], S: ['snake', 0, 'M', 2, 1, 5, '1x3'], T: ['troll', 50, 'RM', 120, 6, 4, '1x8/1x8/2x6'],
  U: ['black unicorn', 0, 'M', 190, 7, -2, '1x9/1x9/2x9'], V: ['vampire', 20, 'RM', 350, 8, 1, '1x10'], W: ['wraith', 0, '', 55, 5, 4, '1x6'], X: ['xeroc', 30, '', 100, 7, 7, '4x4'],
  Y: ['yeti', 30, '', 50, 4, 6, '1x6/1x6'], Z: ['zombie', 0, 'M', 6, 2, 8, '1x8'],
};
const LVL_MONS = 'KEBSHIROZLCQANYFTWPXUMVGJD';
const WAND_MONS = 'KEBSH ROZ CQA YFTW XUMVGJ ';
const THINGS = [['potion', 26], ['scroll', 36], ['food', 16], ['weapon', 7], ['armor', 7], ['ring', 4], ['stick', 4]];
const POTIONS = [['confusion', 7], ['hallucination', 8], ['poison', 8], ['gain strength', 13], ['see invisible', 3], ['healing', 13], ['monster detection', 6], ['magic detection', 6], ['raise level', 2], ['extra healing', 5], ['haste self', 5], ['restore strength', 13], ['blindness', 5], ['levitation', 6]];
const SCROLLS = [['monster confusion', 7], ['magic mapping', 4], ['hold monster', 2], ['sleep', 3], ['enchant armor', 7], ['identify potion', 10], ['identify scroll', 10], ['identify weapon', 6], ['identify armor', 7], ['identify ring, wand or staff', 10], ['scare monster', 3], ['food detection', 2], ['teleportation', 5], ['enchant weapon', 8], ['create monster', 4], ['remove curse', 7], ['aggravate monsters', 3], ['protect armor', 2]];
const RINGS = [['protection', 9], ['add strength', 9], ['sustain strength', 5], ['searching', 10], ['see invisible', 10], ['adornment', 1], ['aggravate monster', 10], ['dexterity', 8], ['increase damage', 8], ['regeneration', 4], ['slow digestion', 9], ['teleportation', 5], ['stealth', 7], ['maintain armor', 5]];
const STICKS = [['light', 12], ['invisibility', 6], ['lightning', 3], ['fire', 3], ['cold', 3], ['polymorph', 15], ['magic missile', 10], ['haste monster', 10], ['slow monster', 11], ['drain life', 9], ['nothing', 1], ['teleport away', 6], ['teleport to', 6], ['cancellation', 5]];
const WEAPONS = [['mace', 11], ['long sword', 11], ['short bow', 12], ['arrow', 12], ['dagger', 8], ['two handed sword', 10], ['dart', 12], ['shuriken', 12], ['spear', 12]];
const WDMG = { mace: ['2x4', '1x3'], 'long sword': ['3x4', '1x2'], 'short bow': ['1x1', '1x1'], arrow: ['1x1', '2x3'], dagger: ['1x6', '1x4'], 'two handed sword': ['4x4', '1x2'], dart: ['1x1', '1x3'], shuriken: ['1x2', '2x4'], spear: ['2x3', '1x6'] };
const STACKED = { arrow: 1, dart: 1, shuriken: 1, dagger: 1 };
const ARMORS = [['leather armor', 20], ['ring mail', 15], ['studded leather armor', 15], ['scale mail', 13], ['chain mail', 12], ['splint mail', 10], ['banded mail', 10], ['plate mail', 5]];
const ACLASS = { 'leather armor': 8, 'ring mail': 7, 'studded leather armor': 7, 'scale mail': 6, 'chain mail': 5, 'splint mail': 4, 'banded mail': 4, 'plate mail': 3 };
const E_LEVELS = [10, 20, 40, 80, 160, 320, 640, 1300, 2600, 5200, 13000, 26000, 50000, 100000, 250000, 500000, 750000, 1000000, 1250000, 1500000];
const SYM = { potion: '!', scroll: '?', food: ':', weapon: ')', armor: ']', ring: '=', stick: '/', amulet: ',', gold: '*' };
const DIR = { h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1] };
const AMULET_LEVEL = 26;
const HUNGER = 300, WEAK = 150, FAINT = 50, FOOD_MAX = 2000;

function pick(tbl) {
  let n = rnd(tbl.reduce((t, r) => t + r[1], 0));
  for (const r of tbl) { n -= r[1]; if (n < 0) return r[0]; }
  return tbl[0][0];
}

// ===== ゲームの状態 =====
let P, L, mode, msgQueue, curMsg, pendingFn, overlay, itemNames, known, runDir, gameOver;

function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function newGame() {
  const colors = shuffle(NM.colors), stones = shuffle(NM.stones), woods = shuffle(NM.woods);
  itemNames = { potion: {}, scroll: {}, ring: {}, stick: {} };
  known = { potion: {}, scroll: {}, ring: {}, stick: {} };
  POTIONS.forEach((p, i) => { itemNames.potion[p[0]] = colors[i % colors.length]; });
  SCROLLS.forEach(s => {
    let t = '';
    for (let i = 0, n = 2 + rnd(2); i < n; i++) { for (let j = 0, m = 1 + rnd(2); j < m; j++) t += NM.syl[rnd(NM.syl.length)]; t += ' '; }
    itemNames.scroll[s[0]] = t.trim();
  });
  RINGS.forEach((r, i) => { itemNames.ring[r[0]] = stones[i % stones.length]; });
  STICKS.forEach((r, i) => { itemNames.stick[r[0]] = woods[i % woods.length]; });
  P = { x: 0, y: 0, hp: 12, maxhp: 12, str: 16, maxstr: 16, lvl: 1, exp: 0, gold: 0, pack: [], weapon: null, armor: null, rings: [null, null],
    food: 1300, depth: 1, maxDepth: 1, hasAmulet: false, turn: 0, blind: 0, conf: 0, haste: 0, hall: 0, lev: 0, seeInv: 0, sleep: 0, held: null, bear: 0, glow: false, quiet: 0 };
  const mace = { type: 'weapon', which: 'mace', count: 1, hplus: 1, dplus: 1, known: true };
  const bow = { type: 'weapon', which: 'short bow', count: 1, hplus: 1, dplus: 0, known: true };
  const arrows = { type: 'weapon', which: 'arrow', count: 25 + rnd(15), hplus: 0, dplus: 0, known: true };
  const armor = { type: 'armor', which: 'ring mail', count: 1, ac: ACLASS['ring mail'] - 1, known: true };
  const food = { type: 'food', which: 'ration', count: 1 };
  [food, mace, bow, arrows, armor].forEach(i => P.pack.push(i));
  P.weapon = mace;
  P.armor = armor;
  msgQueue = []; curMsg = ''; mode = 'play'; pendingFn = null; overlay = null; runDir = null; gameOver = false;
  newLevel();
  msg(T('welcome'));
  draw();
}

// ===== 階の生成（3×3に部屋を置いて通路でつなぐ） =====
function newLevel() {
  const t = [], seen = [], mark = [];
  for (let y = 0; y < H; y++) { t.push(new Array(W).fill(' ')); seen.push(new Array(W).fill(false)); mark.push(new Array(W).fill(0)); }
  L = { t, seen, mark, rooms: [], items: [], mons: [], traps: {} };
  const bx = Math.floor(W / 3), by = Math.floor(H / 3);
  const gone = new Set();
  for (let i = 0, n = rnd(4); i < n; i++) gone.add(rnd(9));
  for (let i = 0; i < 9; i++) {
    const cx = i % 3 * bx + 1, cy = Math.floor(i / 3) * by;
    if (gone.has(i)) {
      const x = cx + 2 + rnd(bx - 5), y = cy + 2 + rnd(by - 4);
      L.rooms.push({ gone: true, x, y, w: 1, h: 1, dark: true });
      continue;
    }
    const w = 4 + rnd(bx - 6), h = 4 + rnd(by - 5);
    const x = cx + rnd(bx - w - 1), y = cy + 1 + rnd(by - h - 1);
    const dark = rnd(10) < P.depth - 1;
    L.rooms.push({ gone: false, x, y, w, h, dark });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      t[yy][xx] = (yy === y || yy === y + h - 1) ? '-' : (xx === x || xx === x + w - 1) ? '|' : '.';
    }
  }
  connectRooms();
  // 階段と置くもの
  const stair = roomFloor();
  t[stair[1]][stair[0]] = '%';
  L.stairs = stair;
  const nt = rnd(Math.min(10, Math.floor(P.depth / 4) + 2));
  for (let i = 0; i < nt && P.depth > 1; i++) {
    const p = emptyFloor();
    if (p) L.traps[p[0] + ',' + p[1]] = { kind: ['door', 'arrow', 'sleep', 'bear', 'tele', 'dart', 'rust'][rnd(7)], found: false };
  }
  L.rooms.forEach(r => {
    if (r.gone) return;
    if (rnd(100) < 50 && (!P.hasAmulet) && P.depth >= P.maxDepth) {
      const p = spotIn(r);
      if (p) L.items.push({ type: 'gold', x: p[0], y: p[1], count: rnd(50 + 10 * P.depth) + 2 });
    }
    if (rnd(100) < 25) { const p = spotIn(r); if (p) spawnMon(randMon(false), p[0], p[1]); }
  });
  for (let i = 0; i < 9; i++) {
    if (rnd(100) < 36) {
      const p = emptyFloor();
      if (p) { const it = makeItem(); it.x = p[0]; it.y = p[1]; L.items.push(it); }
    }
  }
  if (P.depth === AMULET_LEVEL && !P.hasAmulet) {
    const p = emptyFloor();
    L.items.push({ type: 'amulet', which: 'amulet', count: 1, x: p[0], y: p[1] });
  }
  const s = emptyFloor();
  P.x = s[0]; P.y = s[1];
  P.held = null; P.bear = 0;
  updateSeen();
}

function dig(x, y, ch) { if (L.t[y][x] === ' ') L.t[y][x] = ch; }
function makeDoor(r, x, y) {
  if (r.gone) { dig(x, y, '#'); return; }
  L.t[y][x] = (rnd(10) + 1 < P.depth && rnd(5) === 0) ? 'S' : '+';
}
function connectRooms() {
  // 隣接する部屋で全体をつなぎ、いくつか追加の通路を足す
  const adj = i => {
    const a = [];
    if (i % 3 > 0) a.push(i - 1);
    if (i % 3 < 2) a.push(i + 1);
    if (i > 2) a.push(i - 3);
    if (i < 6) a.push(i + 3);
    return a;
  };
  const inTree = new Set([rnd(9)]);
  const done = {};
  const link = (a, b) => { const k = Math.min(a, b) + '-' + Math.max(a, b); if (done[k]) return; done[k] = 1; tunnel(Math.min(a, b), Math.max(a, b)); };
  while (inTree.size < 9) {
    const from = [...inTree][rnd(inTree.size)];
    const cand = adj(from).filter(n => !inTree.has(n));
    if (!cand.length) continue;
    const to = cand[rnd(cand.length)];
    link(from, to);
    inTree.add(to);
  }
  for (let i = 0, n = rnd(5); i < n; i++) {
    const a = rnd(9), c = adj(a);
    link(a, c[rnd(c.length)]);
  }
}
function tunnel(a, b) {
  const A = L.rooms[a], B = L.rooms[b];
  const horiz = b === a + 1;
  let sx, sy, ex, ey;
  if (horiz) {
    sx = A.gone ? A.x : A.x + A.w - 1; sy = A.gone ? A.y : A.y + 1 + rnd(A.h - 2);
    ex = B.gone ? B.x : B.x; ey = B.gone ? B.y : B.y + 1 + rnd(B.h - 2);
  } else {
    sx = A.gone ? A.x : A.x + 1 + rnd(A.w - 2); sy = A.gone ? A.y : A.y + A.h - 1;
    ex = B.gone ? B.x : B.x + 1 + rnd(B.w - 2); ey = B.gone ? B.y : B.y;
  }
  makeDoor(A, sx, sy);
  makeDoor(B, ex, ey);
  let x = sx, y = sy;
  if (horiz) {
    const turn = sx + 1 + rnd(Math.max(1, ex - sx - 1));
    while (x < turn) { x++; dig(x, y, '#'); }
    while (y !== ey) { y += ey > y ? 1 : -1; dig(x, y, '#'); }
    while (x < ex - 1) { x++; dig(x, y, '#'); }
  } else {
    const turn = sy + 1 + rnd(Math.max(1, ey - sy - 1));
    while (y < turn) { y++; dig(x, y, '#'); }
    while (x !== ex) { x += ex > x ? 1 : -1; dig(x, y, '#'); }
    while (y < ey - 1) { y++; dig(x, y, '#'); }
  }
}
function realRooms() { return L.rooms.filter(r => !r.gone); }
function spotIn(r) {
  for (let i = 0; i < 30; i++) {
    const x = r.x + 1 + rnd(r.w - 2), y = r.y + 1 + rnd(r.h - 2);
    if (L.t[y][x] === '.' && !itemAt(x, y) && !monAt(x, y) && !L.traps[x + ',' + y]) return [x, y];
  }
  return null;
}
function roomFloor() {
  const rs = realRooms();
  for (;;) { const p = spotIn(rs[rnd(rs.length)]); if (p) return p; }
}
function emptyFloor() {
  const rs = realRooms();
  for (let i = 0; i < 100; i++) { const p = spotIn(rs[rnd(rs.length)]); if (p && !(P.x === p[0] && P.y === p[1])) return p; }
  return roomFloor();
}
function roomAt(x, y) {
  return L.rooms.find(r => !r.gone && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || null;
}
const itemAt = (x, y) => L.items.find(i => i.x === x && i.y === y);
const monAt = (x, y) => L.mons.find(m => m.x === x && m.y === y);
function passable(x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return false;
  return '.+#%'.indexOf(L.t[y][x]) >= 0;
}
function canStep(x0, y0, x1, y1) {
  if (!passable(x1, y1)) return false;
  if (x0 !== x1 && y0 !== y1) {
    // 扉は斜めに通れず、角も抜けられない
    if (L.t[y0][x0] === '+' || L.t[y1][x1] === '+') return false;
    if (!passable(x0, y1) || !passable(x1, y0)) return false;
  }
  return true;
}

// ===== アイテム =====
function makeItem() {
  const type = (P.noFood > 3) ? 'food' : pick(THINGS);
  P.noFood = type === 'food' ? 0 : (P.noFood || 0) + 1;
  if (type === 'potion') return { type, which: pick(POTIONS), count: 1 };
  if (type === 'scroll') return { type, which: pick(SCROLLS), count: 1 };
  if (type === 'food') return { type, which: rnd(10) ? 'ration' : 'fruit', count: 1 };
  if (type === 'weapon') {
    const which = pick(WEAPONS);
    const it = { type, which, count: 1, hplus: 0, dplus: 0 };
    const r = rnd(100);
    if (r < 10) { it.cursed = true; it.hplus -= rnd(3) + 1; } else if (r < 15) it.hplus += rnd(3) + 1;
    if (which === 'dagger') it.count = rnd(4) + 2;
    else if (STACKED[which]) it.count = rnd(8) + 8;
    return it;
  }
  if (type === 'armor') {
    const which = pick(ARMORS);
    const it = { type, which, count: 1, ac: ACLASS[which] };
    const r = rnd(100);
    if (r < 20) { it.cursed = true; it.ac += rnd(3) + 1; } else if (r < 28) it.ac -= rnd(3) + 1;
    return it;
  }
  if (type === 'ring') {
    const which = pick(RINGS);
    const it = { type, which, count: 1, plus: 0 };
    if (['protection', 'add strength', 'dexterity', 'increase damage'].indexOf(which) >= 0) {
      it.plus = rnd(3);
      if (it.plus === 0) { it.plus = -1; it.cursed = true; }
    }
    if (which === 'aggravate monster' || which === 'teleportation') it.cursed = true;
    return it;
  }
  const which = pick(STICKS);
  return { type: 'stick', which, count: 1, charges: which === 'light' ? rnd(10) + 10 : rnd(5) + 3 };
}

function itemName(it) {
  const ja = lang === 'ja';
  const cnt = it.count > 1 ? it.count + ' ' : (ja ? '' : 'a ');
  const trans = (tbl, k) => (ja ? tbl[k] : k);
  const pair = v => (ja ? v[1] : v[0]);
  if (it.type === 'amulet') return T('amulet');
  if (it.type === 'food') {
    const n = it.which === 'fruit' ? T('fruit') : (ja ? '食料' : 'food ration' + (it.count > 1 ? 's' : ''));
    return it.count > 1 ? it.count + ' ' + n : (ja ? n : 'some ' + n);
  }
  if (it.type === 'potion') {
    if (known.potion[it.which]) return ja ? trans(NM.potion, it.which) + 'の薬' + (it.count > 1 ? ' ' + it.count + '本' : '') : cnt + 'potion' + (it.count > 1 ? 's' : '') + ' of ' + it.which;
    const c = pair(itemNames.potion[it.which]);
    return ja ? c + 'の薬' + (it.count > 1 ? ' ' + it.count + '本' : '') : cnt + c + ' potion' + (it.count > 1 ? 's' : '');
  }
  if (it.type === 'scroll') {
    if (known.scroll[it.which]) return ja ? trans(NM.scroll, it.which) + 'の巻物' + (it.count > 1 ? ' ' + it.count + '枚' : '') : cnt + 'scroll' + (it.count > 1 ? 's' : '') + ' of ' + it.which;
    const c = itemNames.scroll[it.which];
    return ja ? '「' + c + '」の巻物' + (it.count > 1 ? ' ' + it.count + '枚' : '') : cnt + 'scroll' + (it.count > 1 ? 's' : '') + ' titled "' + c + '"';
  }
  if (it.type === 'ring') {
    const plus = it.plus && it.known ? (it.plus > 0 ? '+' : '') + it.plus + ' ' : '';
    if (known.ring[it.which]) return ja ? plus + trans(NM.ring, it.which) + 'の指輪' : 'a ' + plus + 'ring of ' + it.which;
    const c = pair(itemNames.ring[it.which]);
    return ja ? c + 'の指輪' : 'a ' + c + ' ring';
  }
  if (it.type === 'stick') {
    if (known.stick[it.which]) return ja ? trans(NM.stick, it.which) + 'の杖' + (it.known ? ' [' + it.charges + ']' : '') : 'a staff of ' + it.which + (it.known ? ' [' + it.charges + ']' : '');
    const c = pair(itemNames.stick[it.which]);
    return ja ? c + 'の杖' : 'a ' + c + ' staff';
  }
  if (it.type === 'weapon') {
    const n = trans(NM.weapon, it.which);
    const pl = it.known ? (it.hplus >= 0 ? '+' : '') + it.hplus + ',' + (it.dplus >= 0 ? '+' : '') + it.dplus + ' ' : '';
    if (ja) return pl + n + (it.count > 1 ? ' ' + it.count + '本' : '');
    return cnt + pl + n + (it.count > 1 ? 's' : '');
  }
  if (it.type === 'armor') {
    const n = trans(NM.armor, it.which);
    const pl = it.known ? (ACLASS[it.which] - it.ac >= 0 ? '+' : '') + (ACLASS[it.which] - it.ac) + ' ' : '';
    const ac = it.known ? ' [' + (10 - it.ac) + ']' : '';
    return ja ? pl + n + ac : pl + n + ac;
  }
  return it.type;
}
const monName = m => {
  const n = m.name;
  return lang === 'ja' ? (NM.monsters[n] || n) : n;
};

function addToPack(it) {
  if (it.type === 'amulet') { P.hasAmulet = true; }
  const stack = P.pack.find(p => p.type === it.type && p.which === it.which && (it.type === 'potion' || it.type === 'scroll' || it.type === 'food' || (it.type === 'weapon' && STACKED[it.which] && p.hplus === it.hplus && p.dplus === it.dplus)));
  if (stack) { stack.count += it.count; return stack; }
  if (P.pack.length >= 23) return null;
  delete it.x; delete it.y;
  P.pack.push(it);
  return it;
}
const letter = i => String.fromCharCode(97 + i);

// ===== 能力の計算 =====
const ringVal = name => P.rings.filter(r => r && r.which === name).reduce((t, r) => t + (r.plus || 0), 0);
const hasRing = name => P.rings.some(r => r && r.which === name);
const curStr = () => P.str + ringVal('add strength');
function strPlus(s) { return s < 8 ? s - 7 : s <= 16 ? 0 : s <= 30 ? 1 : 3; }
function addDam(s) { return s < 8 ? s - 7 : s <= 15 ? 0 : s === 16 ? 1 : s === 17 ? 1 : s === 18 ? 2 : s <= 20 ? 3 : s <= 30 ? 5 : 6; }
function playerAC() { return (P.armor ? P.armor.ac : 10) - ringVal('protection'); }
const armDisplay = () => 10 - playerAC();
function monsterSwing(m) { const need = (20 - m.lvl) - playerAC(); return rnd(20) + 1 >= need; }
function playerSwing(m, hplus) { const need = (20 - P.lvl) - m.ac; return rnd(20) + 1 + hplus >= need; }
function rollDmg(str) {
  let t = 0;
  str.split('/').forEach(d => { const [n, s] = d.split('x').map(Number); if (n > 0 && s > 0) t += roll(n, s); });
  return t;
}

// ===== 怪物 =====
function randMon(wander) {
  const list = wander ? WAND_MONS : LVL_MONS;
  for (;;) {
    let d = P.depth + rnd(10) - 6;
    if (d < 0) d = rnd(5);
    if (d > 25) d = rnd(5) + 21;
    const c = list[d];
    if (c && c !== ' ') return c;
  }
}
function spawnMon(ch, x, y, awake) {
  const M = MON[ch];
  const extra = Math.max(0, P.depth - AMULET_LEVEL);
  const lvl = M[4] + extra;
  const m = { ch, name: M[0], carry: M[1], flags: M[2], exp: M[3], lvl, ac: M[5] - extra, dmg: M[6], x, y, hp: roll(lvl, 8), awake: !!awake, slow: false, haste: false, held: 0, cancel: false, flee: 0, fung: 0, invis: M[2].indexOf('I') >= 0, confused: 0 };
  m.maxhp = m.hp;
  if (ch === 'X') m.disguise = '!?]=/):*'[rnd(8)];
  if (rnd(100) < m.carry) { m.loot = makeItem(); }
  L.mons.push(m);
  return m;
}
function wanderMon() {
  const r = realRooms();
  for (let i = 0; i < 20; i++) {
    const p = spotIn(r[rnd(r.length)]);
    if (p && !canSee(p[0], p[1])) { spawnMon(randMon(true), p[0], p[1], true); return; }
  }
}
function expAdd(m) {
  let mod = m.lvl === 1 ? Math.floor(m.maxhp / 8) : Math.floor(m.maxhp / 6);
  if (m.lvl > 9) mod *= 20;
  else if (m.lvl > 6) mod *= 4;
  return mod + m.exp;
}
function checkLevel() {
  let n = 0;
  while (n < E_LEVELS.length && P.exp >= E_LEVELS[n]) n++;
  n++;
  if (n > P.lvl) {
    const add = roll(n - P.lvl, 10);
    P.maxhp += add;
    P.hp += add;
    P.lvl = n;
    msg(T('levelUp', { n }));
  }
}
function killMon(m) {
  L.mons = L.mons.filter(q => q !== m);
  if (P.held === m) P.held = null;
  P.exp += expAdd(m);
  checkLevel();
  if (m.loot) {
    const it = m.loot;
    if (!itemAt(m.x, m.y) && L.t[m.y][m.x] === '.') { it.x = m.x; it.y = m.y; L.items.push(it); }
  }
  if (m.ch === 'L' && !itemAt(m.x, m.y)) L.items.push({ type: 'gold', x: m.x, y: m.y, count: rnd(50 + 10 * P.depth) * 2 + 2 });
}

// ===== 視界 =====
function canSee(x, y) {
  if (P.blind > 0) return false;
  if (Math.abs(x - P.x) <= 1 && Math.abs(y - P.y) <= 1) return true;
  const r = roomAt(P.x, P.y);
  if (!r || r.dark) return false;
  return !!roomAt(x, y) && roomAt(x, y) === r;
}
function monVisible(m) {
  if (m.invis && P.seeInv <= 0 && !hasRing('see invisible')) return false;
  return canSee(m.x, m.y);
}
function updateSeen() {
  if (P.blind > 0) return;
  const r = roomAt(P.x, P.y);
  if (r && !r.dark) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) L.seen[y][x] = true;
  }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = P.x + dx, y = P.y + dy;
    if (x >= 0 && x < W && y >= 0 && y < H) L.seen[y][x] = true;
  }
}

// ===== 表示 =====
function msg(s) { if (s) msgQueue.push(s); }
function pumpMsg() {
  if (!msgQueue.length) return false;
  let line = msgQueue.shift();
  while (msgQueue.length && (line + '. ' + msgQueue[0]).length < (lang === 'ja' ? 56 : 68)) line += (lang === 'ja' ? '。' : '. ') + msgQueue.shift();
  curMsg = line + (msgQueue.length ? ' ' + T('more') : '');
  return msgQueue.length > 0;
}
function draw() {
  if (overlay) {
    $('msg').textContent = '';
    $('scr').textContent = overlay;
    return;
  }
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = new Array(W).fill(' ');
    for (let x = 0; x < W; x++) {
      if (!L.seen[y][x]) continue;
      let c = L.t[y][x];
      if (c === 'S') c = (x > 0 && L.t[y][x - 1] !== ' ' && L.t[y][x - 1] === '-') || (x < W - 1 && L.t[y][x + 1] === '-') ? '-' : '|';
      row[x] = c;
    }
    rows.push(row);
  }
  Object.keys(L.traps).forEach(k => {
    const t = L.traps[k];
    if (!t.found) return;
    const [x, y] = k.split(',').map(Number);
    if (L.seen[y][x]) rows[y][x] = '^';
  });
  L.items.forEach(it => {
    if (L.seen[it.y][it.x] || it.detected) rows[it.y][it.x] = SYM[it.type] || '?';
  });
  L.mons.forEach(m => {
    if (monVisible(m) || m.detected) {
      let c = m.ch;
      if (P.hall > 0) c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[rnd(26)];
      if (m.disguise) c = m.disguise;
      rows[m.y][m.x] = c;
    }
  });
  rows[P.y][P.x] = '@';
  const stat = T('status', { l: P.depth, g: P.gold, h: P.hp, m: P.maxhp, s: curStr(), ms: P.maxstr, a: armDisplay(), e: P.lvl, x: P.exp })
    + (P.food <= FAINT ? '  ' + T('faint') : P.food <= WEAK ? '  ' + T('weak') : P.food <= HUNGER ? '  ' + T('hungry') : '');
  $('msg').textContent = curMsg;
  $('scr').textContent = rows.map(r => r.join('')).join('\n') + '\n' + stat;
}

// ===== 1ターンの経過 =====
function endTurn() {
  // 加速中は2回に1回だけ世界が動く
  P.turn++;
  if (P.haste > 0 && P.turn % 2 === 0) { updateSeen(); return; }
  monstersAct();
  if (gameOver) return;
  daemons();
  if (gameOver) return;
  updateSeen();
  // 眠り、凍りの間は操作なしでターンが進む
  let guard = 0;
  while (P.sleep > 0 && !gameOver && guard++ < 50) {
    P.sleep--;
    monstersAct();
    if (!gameOver) daemons();
  }
  updateSeen();
}

function daemons() {
  if (P.blind > 0 && --P.blind === 0) msg(T('blindEnd'));
  if (P.conf > 0 && --P.conf === 0) msg(T('confEnd'));
  if (P.haste > 0 && --P.haste === 0) msg(T('hasteEnd'));
  if (P.lev > 0 && --P.lev === 0) msg(T('levEnd'));
  if (P.hall > 0 && --P.hall === 0) msg(T('hallEnd'));
  if (P.seeInv > 0) P.seeInv--;
  if (P.bear > 0) P.bear--;
  // 回復（doctor）
  P.quiet++;
  if (P.lvl < 8) {
    if (P.quiet + (hasRing('regeneration') ? 1 : 0) * 2 >= 21 - P.lvl * 2) { P.hp = Math.min(P.maxhp, P.hp + 1); P.quiet = 0; }
  } else if (P.quiet >= 3) {
    P.hp = Math.min(P.maxhp, P.hp + rnd(P.lvl - 7) + 1);
    P.quiet = 0;
  }
  // 空腹
  const before = P.food;
  let eat = 1;
  P.rings.forEach(r => { if (r) eat += (r.which === 'slow digestion' ? 0 : 0.2); });
  if (hasRing('slow digestion') && P.turn % 2 === 0) eat = 0;
  P.food -= eat;
  if (before > HUNGER && P.food <= HUNGER) msg(T('hungryMsg'));
  else if (before > WEAK && P.food <= WEAK) msg(T('weakMsg'));
  if (P.food <= FAINT && P.food > 0 && rnd(5) === 0) { msg(T('faintMsg')); P.sleep += rnd(8) + 4; }
  if (P.food <= 0) { die(T('hunger')); return; }
  // うろつく怪物
  if (rnd(70) === 0 && L.mons.length < 25) wanderMon();
  // 指輪
  if (hasRing('teleportation') && rnd(50) === 0) teleportPlayer();
  if (hasRing('searching')) search(true);
  if (hasRing('aggravate monster')) L.mons.forEach(m => { m.awake = true; });
}

function dist2(ax, ay, bx, by) { return (ax - bx) * (ax - bx) + (ay - by) * (ay - by); }

function monstersAct() {
  for (const m of L.mons.slice()) {
    if (gameOver) return;
    if (L.mons.indexOf(m) < 0) continue;
    if (m.held > 0) { m.held--; continue; }
    if (m.slow && P.turn % 2) continue;
    const moves = m.haste ? 2 : 1;
    for (let i = 0; i < moves && !gameOver && L.mons.indexOf(m) >= 0; i++) monsterMove(m);
  }
}
function wakeCheck(m) {
  if (m.awake) return;
  const same = roomAt(m.x, m.y) && roomAt(m.x, m.y) === roomAt(P.x, P.y);
  const near = dist2(m.x, m.y, P.x, P.y) <= 2;
  if (!same && !near) return;
  if (hasRing('stealth') && !near) return;
  // 凶暴な怪物だけが部屋に入った時点で起きる
  if (m.flags.indexOf('M') >= 0 ? rnd(3) !== 0 : near && rnd(3) === 0) m.awake = true;
}
function bfsStep(m) {
  // 元のゲームの追跡に近い形で、プレイヤーへの最短の一歩を探す
  const prev = new Map();
  const start = m.x + ',' + m.y;
  const q = [[P.x, P.y]];
  const seen = new Set([P.x + ',' + P.y]);
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    if (x + ',' + y === start) break;
    for (const k in DIR) {
      const nx = x + DIR[k][0], ny = y + DIR[k][1], key = nx + ',' + ny;
      if (seen.has(key) || !canStep(x, y, nx, ny)) continue;
      seen.add(key);
      prev.set(key, [x, y]);
      q.push([nx, ny]);
    }
  }
  return prev.get(start) || null;
}
function monsterMove(m) {
  wakeCheck(m);
  if (!m.awake) return;
  if (m.ch === 'F') {
    if (dist2(m.x, m.y, P.x, P.y) <= 2) monAttack(m);
    return;
  }
  if (m.flee > 0) {
    m.flee--;
    let best = null, bd = -1;
    for (const k in DIR) {
      const nx = m.x + DIR[k][0], ny = m.y + DIR[k][1];
      if (!canStep(m.x, m.y, nx, ny) || monAt(nx, ny) || (nx === P.x && ny === P.y)) continue;
      const d = dist2(nx, ny, P.x, P.y);
      if (d > bd) { bd = d; best = [nx, ny]; }
    }
    if (best) { m.x = best[0]; m.y = best[1]; }
    return;
  }
  // コウモリはふらふら飛ぶ
  const erratic = m.ch === 'B' ? rnd(2) === 0 : (m.confused > 0);
  if (m.confused > 0) m.confused--;
  // ドラゴンの炎
  if (m.ch === 'D' && !m.cancel && dist2(m.x, m.y, P.x, P.y) <= 36 && canSee(m.x, m.y) && inLine(m) && rnd(5) === 0) {
    msg(T('breath', { m: monName(m) }));
    hurt(roll(6, 6), monName(m));
    return;
  }
  if (!erratic && dist2(m.x, m.y, P.x, P.y) <= 2 && canStep(m.x, m.y, P.x, P.y)) {
    monAttack(m);
    return;
  }
  let to = null;
  if (erratic) {
    const opts = Object.keys(DIR).map(k => [m.x + DIR[k][0], m.y + DIR[k][1]]).filter(p => canStep(m.x, m.y, p[0], p[1]));
    if (opts.length) to = opts[rnd(opts.length)];
    if (to && to[0] === P.x && to[1] === P.y) { monAttack(m); return; }
  } else {
    to = bfsStep(m);
  }
  if (!to) return;
  if (to[0] === P.x && to[1] === P.y) { monAttack(m); return; }
  if (monAt(to[0], to[1])) return;
  // 恐怖の巻物の上には乗れない
  const sc = itemAt(to[0], to[1]);
  if (sc && sc.type === 'scroll' && sc.which === 'scare monster') return;
  m.x = to[0]; m.y = to[1];
  if (m.disguise && dist2(m.x, m.y, P.x, P.y) <= 2) m.disguise = null;
  if (m.ch === 'M' && !m.cancel && monVisible(m) && P.conf <= 0 && rnd(3) === 0) {
    P.conf = rnd(20) + 10;
    msg(T('confuse', { m: monName(m) }));
  }
}
function inLine(m) {
  const dx = P.x - m.x, dy = P.y - m.y;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}
function hurt(n, by) {
  P.hp -= n;
  P.quiet = 0;
  if (P.hp <= 0) die(by);
}
function monAttack(m) {
  m.disguise = null;
  if (P.bear > 0) { /* 罠にかかっていても攻撃は受ける */ }
  // 足元の恐怖の巻物
  const under = itemAt(P.x, P.y);
  if (under && under.type === 'scroll' && under.which === 'scare monster') { m.flee = 5; return; }
  if (!monsterSwing(m)) {
    msg(T('missYou', { m: monName(m) }));
    return;
  }
  let dmg = rollDmg(m.dmg);
  if (m.ch === 'F') { m.fung = (m.fung || 0) + 1; dmg = m.fung; }
  msg(T('hitYou', { m: monName(m) }));
  hurt(dmg, monName(m));
  if (gameOver || m.cancel) return;
  specialHit(m);
}
function specialHit(m) {
  switch (m.ch) {
    case 'A':
      if (!P.armor) break;
      if (hasRing('maintain armor') || P.armor.protected) msg(T('rustSafe'));
      else if (P.armor.ac < 9) { P.armor.ac++; msg(T('rust')); }
      break;
    case 'I':
      if (rnd(3) === 0) { P.sleep += rnd(5) + 2; msg(T('frozen', { m: monName(m) })); }
      break;
    case 'R':
      if (rnd(5) === 0) {
        if (hasRing('sustain strength')) msg(T('strSafe'));
        else { P.str = Math.max(3, P.str - 1); msg(T('str')); }
      }
      break;
    case 'W':
      if (rnd(100) < 15) {
        if (P.lvl > 1) {
          P.lvl--;
          P.exp = P.lvl > 1 ? E_LEVELS[P.lvl - 2] : 0;
          const lose = roll(1, 10);
          P.maxhp = Math.max(1, P.maxhp - lose);
          P.hp = Math.max(1, Math.min(P.hp, P.maxhp));
          msg(T('drain'));
        }
      }
      break;
    case 'V':
      if (rnd(100) < 30) {
        P.maxhp = Math.max(1, P.maxhp - 1 - rnd(3));
        P.hp = Math.min(P.hp, P.maxhp);
        msg(T('drain'));
      }
      break;
    case 'L':
      if (P.gold > 0) {
        P.gold = Math.max(0, P.gold - (rnd(50 + 10 * P.depth) + 10));
        msg(T('stolen'));
        L.mons = L.mons.filter(q => q !== m);
      }
      break;
    case 'N': {
      const opts = P.pack.filter(i => i !== P.weapon && i !== P.armor && P.rings.indexOf(i) < 0 && i.type !== 'amulet');
      if (opts.length) {
        const it = opts[rnd(opts.length)];
        msg(T('nymph', { i: itemName(it) }));
        if (it.count > 1 && it.type !== 'weapon') it.count--;
        else P.pack.splice(P.pack.indexOf(it), 1);
        L.mons = L.mons.filter(q => q !== m);
      }
      break;
    }
    case 'F':
      if (P.held !== m) { P.held = m; msg(T('held', { m: monName(m) })); }
      break;
    default:
  }
}

function die(by) {
  if (gameOver) return;
  gameOver = true;
  P.hp = Math.min(P.hp, 0);
  const center = (s, w) => {
    const pad = Math.max(0, Math.floor((w - s.length) / 2));
    return ' '.repeat(pad) + s;
  };
  const w = 22;
  const lines = [
    '', '', '',
    '                  __________',
    '                 /          \\',
    '                /    REST    \\',
    '               /      IN      \\',
    '              /     PEACE      \\',
    '             /                  \\',
  ];
  [lang === 'ja' ? T('rip') : '', T('ripKilled', { m: by }), T('ripOn', { l: P.depth }), T('ripGold', { g: P.gold })].forEach(s => {
    if (s) lines.push('             |' + center(s, w).padEnd(lang === 'ja' ? 14 : 20) + '|');
  });
  lines.push('             |                    |');
  lines.push('            *|     *  *  *        |*');
  lines.push('    ________)/\\\\_//(\\/(/\\)/\\//\\/|_)_______');
  lines.push('');
  lines.push('    ' + T('again'));
  overlay = lines.join('\n');
  mode = 'dead';
}

// ===== プレイヤーの行動 =====
function teleportPlayer() {
  const p = emptyFloor();
  P.x = p[0]; P.y = p[1];
  P.held = null; P.bear = 0;
  updateSeen();
}
function search(quiet) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = P.x + dx, y = P.y + dy;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    if (L.t[y][x] === 'S' && rnd(5) === 0) {
      L.t[y][x] = '+';
      L.seen[y][x] = true;
      msg(T('foundDoor'));
    }
    const tr = L.traps[x + ',' + y];
    if (tr && !tr.found && rnd(4) === 0) tr.found = true;
  }
  if (!quiet) P.quiet += 0;
}
function pickup() {
  const it = itemAt(P.x, P.y);
  if (!it) return;
  if (it.type === 'gold') {
    P.gold += it.count;
    msg(T('gold', { n: it.count }));
    L.items.splice(L.items.indexOf(it), 1);
    return;
  }
  if (P.lev > 0) { msg(T('seeHere', { i: itemName(it) })); return; }
  // 恐怖の巻物は拾うと塵になる（5.4と同じく2回目）
  if (it.type === 'scroll' && it.which === 'scare monster' && it.touched) {
    L.items.splice(L.items.indexOf(it), 1);
    msg(T('s_scare'));
    return;
  }
  if (it.type === 'scroll' && it.which === 'scare monster') it.touched = true;
  L.items.splice(L.items.indexOf(it), 1);
  const res = addToPack(it);
  if (res) msg(T('got', { i: itemName(res), k: letter(P.pack.indexOf(res)) }));
  else {
    it.x = P.x; it.y = P.y;
    L.items.push(it);
    msg(T('packFull'));
  }
}
function trapAt() {
  if (P.lev > 0) return;
  const t = L.traps[P.x + ',' + P.y];
  if (!t) return;
  t.found = true;
  switch (t.kind) {
    case 'door':
      msg(T('trap_door'));
      P.depth++;
      P.maxDepth = Math.max(P.maxDepth, P.depth);
      newLevel();
      break;
    case 'arrow':
      if (rnd(20) + 1 >= (20 - P.lvl - 1) - playerAC()) { msg(T('trap_arrow')); hurt(roll(1, 6), T('trap')); } else msg(T('trap_arrowMiss'));
      break;
    case 'sleep': P.sleep += rnd(5) + 4; msg(T('trap_sleep')); break;
    case 'bear': P.bear = rnd(3) + 2; msg(T('trap_bear')); break;
    case 'tele': msg(T('trap_tele')); teleportPlayer(); break;
    case 'dart':
      if (rnd(20) + 1 >= (20 - P.lvl + 1) - playerAC()) {
        msg(T('trap_dart'));
        hurt(roll(1, 4), T('trap'));
        if (!gameOver && !hasRing('sustain strength')) P.str = Math.max(3, P.str - 1);
      } else msg(T('trap_dartMiss'));
      break;
    case 'rust':
      msg(T('trap_rust'));
      if (P.armor && !hasRing('maintain armor') && !P.armor.protected && P.armor.ac < 9) { P.armor.ac++; msg(T('rust')); }
      break;
    default:
  }
}
function attack(m) {
  m.awake = true;
  m.disguise = null;
  const w = P.weapon;
  const hplus = (w ? w.hplus : 0) + ringVal('dexterity') + strPlus(curStr());
  if (playerSwing(m, hplus)) {
    let dmg = (w ? rollDmg(WDMG[w.which][0]) + w.dplus : roll(1, 4)) + ringVal('increase damage') + addDam(curStr());
    dmg = Math.max(1, dmg);
    m.hp -= dmg;
    if (P.glow) { P.glow = false; m.confused = rnd(20) + 5; }
    if (m.hp <= 0) { msg(T('youKill', { m: monName(m) })); killMon(m); } else msg(T('youHit', { m: monName(m) }));
  } else msg(T('youMiss', { m: monName(m) }));
}
function tryMove(dx, dy) {
  if (P.conf > 0 && rnd(5) !== 0) {
    const ks = Object.keys(DIR), d = DIR[ks[rnd(8)]];
    dx = d[0]; dy = d[1];
  }
  const nx = P.x + dx, ny = P.y + dy;
  const m = monAt(nx, ny);
  if (m && canStep(P.x, P.y, nx, ny)) { attack(m); return 'acted'; }
  if (P.held) { msg(T('stuckMsg')); return 'acted'; }
  if (P.bear > 0) { msg(T('trap_bear')); return 'acted'; }
  if (!canStep(P.x, P.y, nx, ny)) return 'blocked';
  P.x = nx; P.y = ny;
  const depth = P.depth;
  pickup();
  trapAt();
  if (P.depth !== depth) return 'level';
  return 'moved';
}

function usable(types) {
  return P.pack.map((it, i) => ({ it, i })).filter(o => types.indexOf(o.it.type) >= 0);
}
function chooseItem(types, verb, fn) {
  const list = usable(types);
  if (!list.length) { msg(T('noItem')); pumpMsg(); draw(); return; }
  mode = 'choose';
  pendingFn = { types, verb, fn };
  showList(types);
  overlay = T('prompt', { v: T(verb) }) + '\n' + overlay.split('\n').slice(1).join('\n');
  draw();
}
function showList(types) {
  const list = types ? usable(types) : P.pack.map((it, i) => ({ it, i }));
  const lines = [T('invTitle'), ''];
  list.forEach(o => {
    let s = letter(o.i) + ') ' + itemName(o.it);
    if (o.it === P.weapon) s += ' (' + T('inHand') + ')';
    if (o.it === P.armor) s += ' (' + T('onBody') + ')';
    if (P.rings[0] === o.it) s += ' (' + T('leftHand') + ')';
    if (P.rings[1] === o.it) s += ' (' + T('rightHand') + ')';
    lines.push(s);
  });
  if (!list.length) lines.push(T('invEmpty'));
  overlay = lines.join('\n');
}
function consume(it) {
  if (it.count > 1) it.count--;
  else {
    P.pack.splice(P.pack.indexOf(it), 1);
    if (P.weapon === it) P.weapon = null;
  }
}

function quaff(it) {
  known.potion[it.which] = true;
  const nm = it.which;
  consume(it);
  switch (nm) {
    case 'confusion': P.conf = rnd(20) + 20; msg(T('p_conf')); break;
    case 'hallucination': P.hall = rnd(200) + 200; msg(T('p_hall')); break;
    case 'poison':
      if (hasRing('sustain strength')) msg(T('strSafe'));
      else { P.str = Math.max(3, P.str - (rnd(3) + 1)); msg(T('p_poison')); }
      break;
    case 'gain strength': P.str++; P.maxstr = Math.max(P.maxstr, P.str); msg(T('p_str')); break;
    case 'see invisible': P.seeInv = 300; msg(T('p_see')); break;
    case 'healing':
      P.hp += roll(P.lvl, 4);
      if (P.hp > P.maxhp) { P.maxhp++; P.hp = P.maxhp; }
      if (P.blind > 0) P.blind = 1;
      msg(T('p_heal'));
      break;
    case 'monster detection':
      if (L.mons.length) { L.mons.forEach(m => { m.detected = true; }); msg(T('p_mdet')); } else msg(T('p_mdetNo'));
      break;
    case 'magic detection':
      if (L.items.some(i => i.type !== 'gold' && i.type !== 'food')) {
        L.items.forEach(i => { if (i.type !== 'gold' && i.type !== 'food') i.detected = true; });
        msg(T('p_odet'));
      } else msg(T('p_mdetNo'));
      break;
    case 'raise level':
      P.exp = P.lvl <= E_LEVELS.length ? E_LEVELS[P.lvl - 1] : P.exp;
      checkLevel();
      msg(T('p_raise'));
      break;
    case 'extra healing':
      P.hp += roll(P.lvl, 8);
      if (P.hp > P.maxhp) { P.maxhp += P.hp > P.maxhp + 5 ? 2 : 1; P.hp = P.maxhp; }
      if (P.blind > 0) P.blind = 1;
      msg(T('p_xheal'));
      break;
    case 'haste self': P.haste = rnd(10) + 15; msg(T('p_haste')); break;
    case 'restore strength': P.str = Math.max(P.str, P.maxstr); msg(T('p_restore')); break;
    case 'blindness': P.blind = rnd(100) + 200; msg(T('p_blind')); break;
    case 'levitation': P.lev = rnd(30) + 40; msg(T('p_lev')); break;
    default:
  }
}
function identify(types, it) {
  if (!it) return;
  if (known[it.type]) known[it.type][it.which] = true;
  it.known = true;
  msg(itemName(it));
}
function readScroll(it) {
  if (P.blind > 0) { msg(T('blindNoRead')); return false; }
  known.scroll[it.which] = true;
  const nm = it.which;
  consume(it);
  const idPick = types => {
    const list = usable(types);
    if (!list.length) { msg(T('s_id')); return; }
    const first = list.find(o => !(known[o.it.type] && known[o.it.type][o.it.which] && o.it.known));
    identify(types, (first || list[0]).it);
  };
  switch (nm) {
    case 'monster confusion': P.glow = true; msg(T('s_conf')); break;
    case 'magic mapping':
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L.t[y][x] !== ' ') {
        if (L.t[y][x] === 'S') L.t[y][x] = '+';
        L.seen[y][x] = true;
      }
      msg(T('s_map'));
      break;
    case 'hold monster':
      L.mons.forEach(m => { if (dist2(m.x, m.y, P.x, P.y) <= 8) { m.held = rnd(10) + 10; m.awake = true; } });
      msg(T('s_hold'));
      break;
    case 'sleep': P.sleep += rnd(5) + 4; msg(T('s_sleep')); break;
    case 'enchant armor':
      if (P.armor) { P.armor.ac--; P.armor.cursed = false; msg(T('s_earm')); } else msg(T('s_noArm'));
      break;
    case 'identify potion': idPick(['potion']); break;
    case 'identify scroll': idPick(['scroll']); break;
    case 'identify weapon': idPick(['weapon']); break;
    case 'identify armor': idPick(['armor']); break;
    case 'identify ring, wand or staff': idPick(['ring', 'stick']); break;
    case 'scare monster':
      L.mons.forEach(m => { if (canSee(m.x, m.y)) { m.flee = 20; m.awake = true; } });
      msg(T('s_scare'));
      break;
    case 'food detection':
      if (L.items.some(i => i.type === 'food')) { L.items.forEach(i => { if (i.type === 'food') i.detected = true; }); msg(T('s_food')); } else msg(T('s_foodNo'));
      break;
    case 'teleportation': teleportPlayer(); msg(T('s_tele')); break;
    case 'enchant weapon':
      if (P.weapon) {
        if (rnd(2)) P.weapon.hplus++; else P.weapon.dplus++;
        P.weapon.cursed = false;
        msg(T('s_eweap'));
      } else msg(T('s_noWeap'));
      break;
    case 'create monster': {
      const cand = [];
      for (const k in DIR) {
        const x = P.x + DIR[k][0], y = P.y + DIR[k][1];
        if (passable(x, y) && !monAt(x, y)) cand.push([x, y]);
      }
      if (cand.length) { const c = cand[rnd(cand.length)]; spawnMon(randMon(false), c[0], c[1], true); }
      msg(T('s_create'));
      break;
    }
    case 'remove curse':
      [P.weapon, P.armor, P.rings[0], P.rings[1]].forEach(i => { if (i) i.cursed = false; });
      msg(T('s_curse'));
      break;
    case 'aggravate monsters': L.mons.forEach(m => { m.awake = true; }); msg(T('s_agg')); break;
    case 'protect armor':
      if (P.armor) { P.armor.protected = true; msg(T('s_prot')); } else msg(T('s_noArm'));
      break;
    default:
  }
  return true;
}
function eat(it) {
  const fruit = it.which === 'fruit';
  consume(it);
  P.food = Math.min(FOOD_MAX, Math.max(P.food, 0) + 1100 + rnd(400));
  if (fruit) msg(T('yum', { f: T('fruit') }));
  else msg(rnd(100) > 70 ? T('yuk') : T('yum', { f: lang === 'ja' ? '食料' : 'food' }));
}
function wield(it) {
  if (P.weapon && P.weapon.cursed) { msg(T('cursed')); return false; }
  P.weapon = it;
  msg(T('wielding', { i: itemName(it) }));
  return true;
}
function wear(it) {
  if (P.armor) { msg(T('alreadyArmor')); return false; }
  P.armor = it;
  it.known = true;
  msg(T('wearing', { i: itemName(it) }));
  P.sleep += 2;
  return true;
}
function putOn(it) {
  if (P.rings.indexOf(it) >= 0) return false;
  const slot = P.rings[0] ? (P.rings[1] ? -1 : 1) : 0;
  if (slot < 0) { msg(T('twoRings')); return false; }
  P.rings[slot] = it;
  if (it.which === 'add strength' || it.which === 'protection' || it.which === 'dexterity' || it.which === 'increase damage' || it.which === 'see invisible' || it.which === 'aggravate monster') {
    known.ring[it.which] = true;
    it.known = true;
  }
  msg(T('ringOn', { i: itemName(it) }));
  return true;
}
function dropItem(it) {
  if (it === P.armor) { msg(T('alreadyArmor')); return false; }
  if (it === P.weapon && it.cursed) { msg(T('cursed')); return false; }
  if (P.rings.indexOf(it) >= 0) { msg(T('cursed')); return false; }
  if (itemAt(P.x, P.y) || L.t[P.y][P.x] !== '.') { msg(T('noRoom')); return false; }
  if (it.type === 'amulet') P.hasAmulet = false;
  const piece = Object.assign({}, it);
  piece.x = P.x; piece.y = P.y;
  if (it.count > 1 && it.type !== 'weapon') { piece.count = 1; it.count--; } else {
    P.pack.splice(P.pack.indexOf(it), 1);
    if (P.weapon === it) P.weapon = null;
  }
  L.items.push(piece);
  msg(T('dropped', { i: itemName(piece) }));
  return true;
}

// 直線に飛ばして最初の怪物を返す
function ray(dx, dy, maxLen) {
  let x = P.x, y = P.y, last = [x, y];
  for (let i = 0; i < maxLen; i++) {
    const nx = x + dx, ny = y + dy;
    if (!passable(nx, ny)) break;
    x = nx; y = ny;
    last = [x, y];
    const m = monAt(x, y);
    if (m) return { m, x, y };
  }
  return { m: null, x: last[0], y: last[1] };
}
function throwItem(it, dx, dy) {
  if (it === P.armor || P.rings.indexOf(it) >= 0) { msg(T('cursed')); return false; }
  if (it === P.weapon && it.cursed) { msg(T('cursed')); return false; }
  const one = Object.assign({}, it, { count: 1 });
  if (it.count > 1) it.count--;
  else { P.pack.splice(P.pack.indexOf(it), 1); if (P.weapon === it) P.weapon = null; }
  const r = ray(dx, dy, 12);
  if (r.m) {
    const m = r.m;
    m.awake = true;
    m.disguise = null;
    let hplus = strPlus(curStr()) + ringVal('dexterity') + (one.hplus || 0);
    const isW = one.type === 'weapon';
    let dmgStr = isW ? WDMG[one.which][1] : '1x2';
    let mult = 1;
    if (isW && one.which === 'arrow' && P.weapon && P.weapon.which === 'short bow') { hplus += P.weapon.hplus; mult = 2; }
    else if (isW && one.which === 'arrow') { hplus -= 4; }
    if (playerSwing(m, hplus)) {
      const dmg = Math.max(1, rollDmg(dmgStr) * mult + (one.dplus || 0) + ringVal('increase damage'));
      m.hp -= dmg;
      if (m.hp <= 0) { msg(T('youKill', { m: monName(m) })); killMon(m); } else msg(T('thrownHit', { i: itemName(one), m: monName(m) }));
      return true;
    }
    msg(T('thrownMiss', { i: itemName(one), m: monName(m) }));
  }
  if (!itemAt(r.x, r.y) && L.t[r.y][r.x] === '.') { one.x = r.x; one.y = r.y; L.items.push(one); }
  return true;
}
function zap(it, dx, dy) {
  if (it.charges <= 0) { msg(T('z_noCharge')); return true; }
  it.charges--;
  known.stick[it.which] = true;
  const n = it.which;
  if (n === 'light') {
    const r = roomAt(P.x, P.y);
    if (r) { r.dark = false; updateSeen(); msg(T('z_lightRoom')); } else msg(T('z_light'));
    return true;
  }
  if (n === 'drain life') {
    const list = L.mons.filter(m => canSee(m.x, m.y));
    if (P.hp < 2 || !list.length) { msg(T('z_drainNo')); return true; }
    P.hp = Math.ceil(P.hp / 2);
    const dmg = Math.floor(P.hp / list.length);
    list.forEach(m => { m.hp -= dmg; m.awake = true; if (m.hp <= 0) { msg(T('youKill', { m: monName(m) })); killMon(m); } });
    msg(T('z_drain'));
    return true;
  }
  if (n === 'nothing') { msg(T('nothing')); return true; }
  const hit = ray(dx, dy, 20);
  const m = hit.m;
  if (['lightning', 'fire', 'cold', 'magic missile'].indexOf(n) >= 0) {
    const bolt = lang === 'ja' ? NM.stick[n] : n;
    if (!m) { msg(T('z_none')); return true; }
    m.awake = true;
    const dmg = n === 'magic missile' ? roll(1, 4) : roll(6, 6);
    const needRoll = n === 'magic missile' || playerSwing(m, 0);
    if (needRoll) {
      m.hp -= dmg;
      msg(T('z_bolt', { b: bolt, m: monName(m) }));
      if (m.hp <= 0) { msg(T('youKill', { m: monName(m) })); killMon(m); }
    } else msg(T('z_boltMiss', { b: bolt, m: monName(m) }));
    return true;
  }
  if (!m) { msg(T('nothing')); return true; }
  m.awake = true;
  m.disguise = null;
  switch (n) {
    case 'invisibility': m.invis = true; msg(T('z_invis', { m: monName(m) })); break;
    case 'polymorph': {
      const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[rnd(26)];
      const oldx = m.x, oldy = m.y;
      L.mons = L.mons.filter(q => q !== m);
      const nm = spawnMon(c, oldx, oldy, true);
      nm.disguise = null;
      msg(T('z_poly', { m: monName(m) }));
      break;
    }
    case 'haste monster': m.haste = true; m.slow = false; msg(T('z_haste', { m: monName(m) })); break;
    case 'slow monster': m.slow = true; m.haste = false; msg(T('z_slow', { m: monName(m) })); break;
    case 'teleport away': {
      const p = emptyFloor();
      m.x = p[0]; m.y = p[1];
      msg(T('z_tele', { m: monName(m) }));
      break;
    }
    case 'teleport to': {
      const cand = Object.keys(DIR).map(k => [P.x + DIR[k][0], P.y + DIR[k][1]]).filter(q => passable(q[0], q[1]) && !monAt(q[0], q[1]));
      if (cand.length) { m.x = cand[0][0]; m.y = cand[0][1]; }
      break;
    }
    case 'cancellation':
      m.cancel = true;
      m.invis = false;
      msg(T('z_cancel', { m: monName(m) }));
      break;
    default:
  }
  return true;
}

function goDown() {
  if (L.t[P.y][P.x] !== '%') { msg(T('noStairs')); return false; }
  P.depth++;
  P.maxDepth = Math.max(P.maxDepth, P.depth);
  newLevel();
  return true;
}
function goUp() {
  if (L.t[P.y][P.x] !== '%') { msg(T('noUp')); return false; }
  if (!P.hasAmulet) { msg(T('needAmulet')); return false; }
  P.depth--;
  if (P.depth <= 0) { win(); return true; }
  newLevel();
  return true;
}
function win() {
  gameOver = true;
  overlay = '\n\n\n    ' + T('win') + '\n\n    ' + T('winScore', { g: P.gold });
  mode = 'dead';
}

// ===== キー入力 =====
function acted() {
  endTurn();
  if (msgQueue.length && !gameOver) pumpMsg();
  draw();
}

function runStep(dx, dy) {
  // 走る: 何かが見えるか、通路が分かれたら止まる
  let guard = 80;
  const visibleCount = () => L.mons.filter(monVisible).length;
  const startMons = visibleCount();
  while (guard-- > 0) {
    const before = [P.x, P.y];
    const r = tryMove(dx, dy);
    if (r === 'blocked') { break; }
    if (r !== 'moved') { endTurn(); break; }
    endTurn();
    if (gameOver || msgQueue.length) break;
    if (visibleCount() > startMons) break;
    if (L.t[P.y][P.x] === '+' || L.t[P.y][P.x] === '%') break;
    if (itemAt(P.x + dx, P.y + dy)) { const nx = P.x + dx, ny = P.y + dy; if (passable(nx, ny)) continue; }
    const here = roomAt(P.x, P.y);
    if (!here) {
      // 通路では、曲がり角に沿って進む
      const opts = Object.keys(DIR).map(k => DIR[k]).filter(d => canStep(P.x, P.y, P.x + d[0], P.y + d[1]) && !(P.x + d[0] === before[0] && P.y + d[1] === before[1]));
      if (opts.length === 1) { dx = opts[0][0]; dy = opts[0][1]; } else if (opts.length !== 1 && !canStep(P.x, P.y, P.x + dx, P.y + dy)) break;
      if (opts.length > 2) break;
    } else if (!canStep(P.x, P.y, P.x + dx, P.y + dy)) break;
  }
  if (msgQueue.length && !gameOver) pumpMsg();
  draw();
}

function askDir(fn) {
  curMsg = T('dirPrompt');
  mode = 'dir';
  pendingFn = fn;
  draw();
}

// テンキー（数字キーも同じ）: 8 4 6 2 移動 / 7 下りる / 9 上がる / 1 拾う / 3 メニュー / 5 休む / 0 探す
const NUM_PLAY = { 8: 'k', 4: 'h', 6: 'l', 2: 'j', 7: '>', 9: '<', 5: '.', 0: 's' };
const NUM_DIR = { 1: 'b', 2: 'j', 3: 'n', 4: 'h', 6: 'l', 7: 'y', 8: 'k', 9: 'u' };
const NAV_NUM = { Home: 7, PageUp: 9, End: 1, PageDown: 3, Clear: 5, Insert: 0 };
const ARROW_DIR = { ArrowLeft: 'h', ArrowDown: 'j', ArrowUp: 'k', ArrowRight: 'l' };
const COMBO = { hk: 'y', kh: 'y', kl: 'u', lk: 'u', hj: 'b', jh: 'b', jl: 'n', lj: 'n' };
let pendArrow = null;
function flushArrow() {
  if (!pendArrow) return;
  const k = pendArrow.k;
  clearTimeout(pendArrow.t);
  pendArrow = null;
  handle(k);
}
function numKey(n) {
  if (mode === 'dead') return;
  if (overlay && mode !== 'menu' && mode !== 'choose') { handle(' '); return; }
  if (msgQueue.length) { handle(' '); return; }
  if (mode === 'menu') { menuKey(n); return; }
  if (mode === 'dir') { if (n === 0) handle('Escape'); else if (NUM_DIR[n]) handle(NUM_DIR[n]); return; }
  if (mode === 'choose') { if (n === 0) handle('Escape'); return; }
  if (mode === 'quit') { handle(n === 5 ? 'y' : 'n'); return; }
  if (n === 3) { openMenu(); return; }
  if (n === 1) { curMsg = ''; pickKey(); return; }
  handle(NUM_PLAY[n]);
}
function pickKey() {
  if (!itemAt(P.x, P.y)) { msg(T('nothingHere')); pumpMsg(); draw(); return; }
  const lev = P.lev;
  P.lev = 0;      // 自分で拾う時は浮いていても拾える
  pickup();
  P.lev = lev;
  acted();
}
function onKey(e) {
  const k0 = e.key;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock'].indexOf(k0) >= 0) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // テンキーは NumLock の状態によらず同じに動く
  const m = /^(?:Numpad|Digit)([0-9])$/.exec(e.code || '');
  if (m && !e.shiftKey) { e.preventDefault(); flushArrow(); numKey(+m[1]); return; }
  if (NAV_NUM[k0] !== undefined) { e.preventDefault(); flushArrow(); numKey(NAV_NUM[k0]); return; }
  if (ARROW_DIR[k0]) {
    e.preventDefault();
    if (mode === 'choose') return;
    if (mode === 'menu') { menuKey(k0 === 'ArrowUp' ? 8 : k0 === 'ArrowDown' ? 2 : k0 === 'ArrowRight' ? 3 : 0); return; }
    const a = ARROW_DIR[k0];
    if (e.shiftKey) { handle(a.toUpperCase()); return; }
    if (pendArrow) {
      const c = COMBO[pendArrow.k + a];
      if (c) { clearTimeout(pendArrow.t); pendArrow = null; handle(c); return; }
      flushArrow();
    }
    pendArrow = { k: a, t: setTimeout(flushArrow, 45) };
    return;
  }
  flushArrow();
  if (mode === 'menu') {
    if (k0 === 'Enter') { menuKey(5); return; }
    if (k0 === 'Escape') { menuKey(0); return; }
    return;
  }
  if (k0 === ' ' || k0 === '/') e.preventDefault();
  handle(k0);
}

// ===== テンキーのメニュー =====
// 3 で次のメニューへ切り替え、8 と 2 で物を選び、5 で決定、0 で閉じる
const MENU = [
  { label: 'm_pack', types: null },
  { label: 'm_quaff', key: 'q', types: ['potion'] },
  { label: 'm_read', key: 'r', types: ['scroll'] },
  { label: 'm_eat', key: 'e', types: ['food'] },
  { label: 'm_wield', key: 'w', types: ['weapon'] },
  { label: 'm_wear', key: 'W', types: ['armor'] },
  { label: 'm_off', key: 'T' },
  { label: 'm_ring', key: 'P', types: ['ring'] },
  { label: 'm_ringOff', key: 'R' },
  { label: 'm_zap', key: 'z', types: ['stick'] },
  { label: 'm_throw', key: 't', types: 'all' },
  { label: 'm_drop', key: 'd', types: 'all' },
  { label: 'm_help', key: '?' },
  { label: 'm_quit', key: 'Q' },
];
const ALL_TYPES = ['potion', 'scroll', 'food', 'weapon', 'armor', 'ring', 'stick', 'amulet'];
let menuIdx = 0, menuCur = 0;
function menuList() {
  const t = MENU[menuIdx].types;
  if (t === undefined) return [];
  return usable(t === null || t === 'all' ? ALL_TYPES : t);
}
function drawMenu() {
  const m = MENU[menuIdx];
  const lines = [T(m.label) + '   ' + T('menuKeys'), ''];
  const list = menuList();
  list.forEach((o, i) => {
    let s = (i === menuCur && m.types !== null ? '> ' : '  ') + letter(o.i) + ') ' + itemName(o.it);
    if (o.it === P.weapon) s += ' (' + T('inHand') + ')';
    if (o.it === P.armor) s += ' (' + T('onBody') + ')';
    if (P.rings[0] === o.it) s += ' (' + T('leftHand') + ')';
    if (P.rings[1] === o.it) s += ' (' + T('rightHand') + ')';
    lines.push(s);
  });
  if (m.types !== undefined && !list.length) lines.push('  ' + T('noItem'));
  if (m.types === undefined) lines.push('  ' + T('menuRun'));
  overlay = lines.join('\n');
  draw();
}
function openMenu() {
  mode = 'menu';
  menuIdx = 0;
  menuCur = 0;
  drawMenu();
}
function closeMenu() { mode = 'play'; overlay = null; curMsg = ''; draw(); }
function menuKey(n) {
  const m = MENU[menuIdx], list = menuList();
  if (n === 0) { closeMenu(); return; }
  if (n === 3) { menuIdx = (menuIdx + 1) % MENU.length; menuCur = 0; drawMenu(); return; }
  if (n === 8) { if (list.length) menuCur = (menuCur + list.length - 1) % list.length; drawMenu(); return; }
  if (n === 2) { if (list.length) menuCur = (menuCur + 1) % list.length; drawMenu(); return; }
  if (n !== 5 || m.types === null) return;
  if (m.types === undefined) { closeMenu(); handle(m.key); return; }
  if (!list.length) return;
  const letterKey = letter(list[menuCur].i);
  closeMenu();
  handle(m.key);    // 通常の選択に入り
  handle(letterKey); // 選んだ物を渡す
}

function handle(key) {
  if (mode === 'dead') {
    if (key === 'Enter') newGame();
    return;
  }
  if (mode === 'menu') return;
  if (overlay && mode !== 'choose') {
    overlay = null;
    draw();
    return;
  }
  if (msgQueue.length && mode !== 'choose') {
    // --続く-- を読み進める
    pumpMsg();
    draw();
    return;
  }
  if (mode === 'quit') {
    if (key === 'y' || key === 'Y') { die(T('ripQuit')); draw(); return; }
    mode = 'play';
    curMsg = '';
    draw();
    return;
  }
  if (mode === 'dir') {
    const fn = pendingFn;
    mode = 'play';
    pendingFn = null;
    curMsg = '';
    const d = DIR[key] || null;
    if (key === 'Escape' || !d) { draw(); return; }
    if (fn(d[0], d[1])) acted();
    else { pumpMsg(); draw(); }
    return;
  }
  if (mode === 'choose') {
    if (key === 'Escape') { mode = 'play'; pendingFn = null; curMsg = ''; overlay = null; draw(); return; }
    const i = key.charCodeAt(0) - 97;
    const it = key.length === 1 ? P.pack[i] : null;
    if (!it || pendingFn.types.indexOf(it.type) < 0) return;
    const fn = pendingFn.fn;
    overlay = null;
    mode = 'play';
    pendingFn = null;
    curMsg = '';
    const res = fn(it);
    if (res === 'wait') return;
    if (res) acted();
    else { pumpMsg(); draw(); }
    return;
  }
  curMsg = '';
  if (DIR[key]) {
    const r = tryMove(DIR[key][0], DIR[key][1]);
    if (r === 'blocked') { draw(); return; }
    acted();
    return;
  }
  const lower = key.toLowerCase();
  if (key.length === 1 && key !== lower && DIR[lower]) { runStep(DIR[lower][0], DIR[lower][1]); return; }
  const ALL = ['potion', 'scroll', 'food', 'weapon', 'armor', 'ring', 'stick', 'amulet'];
  switch (key) {
    case '.': acted(); break;
    case 's': search(false); acted(); break;
    case '>': if (goDown()) acted(); else { pumpMsg(); draw(); } break;
    case '<': if (goUp()) { if (!gameOver) acted(); else draw(); } else { pumpMsg(); draw(); } break;
    case 'i': showList(null); draw(); break;
    case '?': overlay = T('help'); draw(); break;
    case 'q': chooseItem(['potion'], 'v_quaff', it => { quaff(it); return true; }); break;
    case 'r': chooseItem(['scroll'], 'v_read', it => readScroll(it)); break;
    case 'e': chooseItem(['food'], 'v_eat', it => { eat(it); return true; }); break;
    case 'w': chooseItem(['weapon'], 'v_wield', it => wield(it)); break;
    case 'W': chooseItem(['armor'], 'v_wear', it => wear(it)); break;
    case 'T':
      if (!P.armor) { msg(T('noArmor')); pumpMsg(); draw(); }
      else if (P.armor.cursed) { msg(T('cursed')); pumpMsg(); draw(); }
      else { msg(T('armorOff', { i: itemName(P.armor) })); P.armor = null; acted(); }
      break;
    case 'P': chooseItem(['ring'], 'v_put', it => putOn(it)); break;
    case 'R': {
      const worn = P.rings.filter(Boolean);
      if (!worn.length) { msg(T('noRing')); pumpMsg(); draw(); break; }
      const it = worn[worn.length - 1];
      if (it.cursed) { msg(T('cursed')); pumpMsg(); draw(); break; }
      P.rings[P.rings.indexOf(it)] = null;
      msg(T('ringOff', { i: itemName(it) }));
      acted();
      break;
    }
    case 'd': chooseItem(ALL, 'v_drop', it => dropItem(it)); break;
    case 't': chooseItem(ALL, 'v_throw', it => { askDir((dx, dy) => throwItem(it, dx, dy)); return 'wait'; }); break;
    case 'z': chooseItem(['stick'], 'v_zap', it => {
      if (it.which === 'light' || it.which === 'drain life' || it.which === 'nothing') return zap(it, 0, 0);
      askDir((dx, dy) => zap(it, dx, dy));
      return 'wait';
    }); break;
    case 'Q': curMsg = T('quit'); mode = 'quit'; draw(); break;
    default: draw();
  }
}

window.addEventListener('keydown', onKey);

// ===== 言語 =====
function drawChrome() {
  document.documentElement.lang = lang;
  $('lang_ja').classList.toggle('on', lang === 'ja');
  $('lang_en').classList.toggle('on', lang === 'en');
  $('hint').textContent = T('hint');
  $('btnHelp').textContent = T('btnHelp');
  $('sheet').textContent = T('sheet');
  $('toTop').textContent = T('top');
  $('toTop').setAttribute('href', lang === 'en' ? '../en/index.html' : '../index1.html');
}
function setLang(l) {
  lang = l;
  try { localStorage.setItem('rogueLang', l); } catch (e) { /* 無視 */ }
  drawChrome();
  if (!gameOver) draw();
  $('lang_' + l).blur();
}
// ズーム
let fontSize = 18;
try { const z = +localStorage.getItem('rogueZoom'); if (z >= 10 && z <= 40) fontSize = z; } catch (e) { /* 無視 */ }
function applyZoom() {
  document.documentElement.style.setProperty('--fs', fontSize + 'px');
  try { localStorage.setItem('rogueZoom', String(fontSize)); } catch (e) { /* 無視 */ }
}
$('zoomIn').onclick = () => { fontSize = Math.min(40, fontSize + 2); applyZoom(); $('zoomIn').blur(); };
$('zoomOut').onclick = () => { fontSize = Math.max(10, fontSize - 2); applyZoom(); $('zoomOut').blur(); };
applyZoom();
$('btnHelp').onclick = () => {
  $('btnHelp').blur();
  if (mode === 'dead') return;
  overlay = T('help');
  draw();
};
$('lang_ja').onclick = () => setLang('ja');
$('lang_en').onclick = () => setLang('en');

// ===== ブラウザの戻るを無効にする =====
history.pushState({ rogue: 1 }, '', location.href);
window.addEventListener('popstate', () => { history.pushState({ rogue: 1 }, '', location.href); });
window.addEventListener('beforeunload', e => {
  if (!gameOver && P && P.turn > 0) { e.preventDefault(); e.returnValue = ''; }
});

drawChrome();
newGame();

// テスト用
window.__rogue = { handle, get P() { return P; }, get L() { return L; }, get mode() { return mode; }, get over() { return gameOver; }, get queue() { return msgQueue; } };
})();
