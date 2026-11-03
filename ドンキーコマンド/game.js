// ドンキーコマンド 本体（キャラクターメイクからゲーム終了まで1ページで動く）
(function () {
'use strict';
const $ = id => document.getElementById(id);
const d6 = () => 1 + Math.floor(Math.random() * 6);
const d2 = () => d6() + d6();
const d3x6 = () => d6() + d6() + d6();
let lang = 'ja';
try {
  const l = localStorage.getItem('donkeyLang');
  if (l === 'ja' || l === 'en') lang = l;
  else if (!/^ja/i.test(navigator.language || 'ja')) lang = 'en';
} catch (e) { /* 保存できなくても動く */ }

function T(k, p) {
  let s = window.DC_TEXT[lang][k];
  if (s === undefined) return k;
  if (p) for (const n in p) s = s.split('{' + n + '}').join(p[n]);
  return s;
}

// ===== ルールのデータ =====
const SIZE = 15, MID = 7;
const GUNS = {
  SMG: { w: 2, hit: 10, ammo: 4 },
  AR: { w: 4, hit: 9, ammo: 1, autoHit: 11, autoAmmo: 3 },
  P: { w: 1, hit: 8, ammo: 2 },
  ATR: { w: 7, hit: 12, ammo: 9 },
  BIGK: { w: 6 },
};
const SMALL = ['G', 'N', 'LSMG', 'LAR', 'LP', 'LATR'];  // ベルトか背のうに入る（5個で重さ1）
const PACK = { EP: 0.2, K: 1, U: 1, B: 1 };             // 背のうだけ
const BONUS = { 2: 'knifeThrow', 3: 'knifeThrow', 4: 'karate', 5: 'grenade', 6: 'smg', 7: 'pistol', 8: 'ar', 9: 'reload', 10: 'flee', 11: 'suggest', 12: 'suggest' };
const ROOMS = { 2: 'EH', 3: 'CP', 4: 'RC', 5: 'GP', 6: 'AS', 7: 'TP', 8: 'PP', 9: 'LR', 10: 'ER', 11: 'LS', 12: 'CC' };
const MISSION = { CP: 'blast', RC: 'steal', GP: 'steal', LR: 'blast', ER: 'blast', LS: 'blast' };
const SPECIAL = { CP: 10, RC: 6, LR: 6 };
const COUNTER = [0, 1, 1, 1, 2, 2, 3, 4];
// 難易度。mult: 能力の倍率 / enemy: 敵がいる目の上限 / extra: 敵の人数の追加 / panic: この目以上の敵は撃たない / ap: 運動ポイントの補正 / heal: 部屋での回復
const DIFFICULTY = {
  easy: { mult: 1.5, enemy: 3, extra: 0, panic: 5, ap: 0, heal: 1 },
  normal: { mult: 1.2, enemy: 3, extra: 0, panic: 5, ap: 0, heal: 1 },
  hard: { mult: 1, enemy: 3, extra: 0, panic: 5, ap: 0, heal: 1 },      // 元のルールどおり
  veryhard: { mult: 0.8, enemy: 3, extra: 0, panic: 5, ap: 0, heal: 1 },
};
let diffKey = 'normal';
const DF = () => DIFFICULTY[diffKey];
const beltMax = () => Math.round(10 * DF().mult);   // 持てる量も難易度に合わせる
const DIRS = { n: [0, -1, 's'], s: [0, 1, 'n'], e: [1, 0, 'w'], w: [-1, 0, 'e'] };

// ===== キャラクター =====
let ch = null;        // 能力
let G = null;         // ゲーム
let zoom = 56;

function rollCharacter() {
  const M = v => Math.round(v * DF().mult);
  const r = { luck: M(d3x6()), know: M(d3x6()), reac: M(d3x6()), acc: M(d3x6()) };
  ch = {
    end: M(d3x6()), str: M(d3x6()), raw: r,
    luck: Math.ceil(r.luck / 3), know: Math.ceil(r.know / 3), reac: Math.ceil(r.reac / 3), acc: Math.ceil(r.acc / 3),
    skills: [], bonusRolled: 0,
    pick: { SMG: 0, AR: 0, P: 0, ATR: 0, belt: { G: 0, N: 0, LSMG: 0, LAR: 0, LP: 0, LATR: 0 }, ruck: { G: 0, N: 0, LSMG: 0, LAR: 0, LP: 0, LATR: 0 }, EP: 0, K: 0, U: 0, B: 0, main: '' },
  };
  grantBonus();
}
// 反応と正確性のダイスの合計が 20、25、30…でボーナス能力
function grantBonus() {
  const sum = ch.raw.reac + ch.raw.acc;
  const n = sum < 20 ? 0 : 1 + Math.floor((sum - 20) / 5);
  const got = [];
  while (ch.bonusRolled < n) {
    ch.bonusRolled++;
    const s = BONUS[d2()];
    if (ch.skills.indexOf(s) < 0) { ch.skills.push(s); got.push(s); }
  }
  return got;
}
const has = s => ch.skills.indexOf(s) >= 0;
const skillNames = () => ch.skills.map(s => T('sk_' + s)).join(', ');

function pickWeight() {
  const p = ch.pick;
  let w = 0;
  ['SMG', 'AR', 'P', 'ATR'].forEach(g => { w += GUNS[g].w * p[g]; });
  SMALL.forEach(s => { w += 0.2 * (p.belt[s] + p.ruck[s]); });
  Object.keys(PACK).forEach(s => { w += PACK[s] * p[s]; });
  return Math.round(w * 10) / 10;
}
const pickBelt = () => ch.pick.P + SMALL.reduce((t, s) => t + ch.pick.belt[s], 0);
const pickGuns = () => ch.pick.SMG + ch.pick.AR + ch.pick.ATR;

// ===== 準備画面 =====
function drawSetup() {
  document.documentElement.lang = lang;
  document.title = T('title');
  $('sTitle').textContent = T('title');
  $('sSub').textContent = T('sub');
  $('toTop').textContent = T('backTop');
  $('btnRules1').textContent = T('rules');
  $('h0').textContent = T('h0');
  $('diffBtns').innerHTML = '';
  ['easy', 'normal', 'hard', 'veryhard'].forEach(d => {
    const b = document.createElement('button');
    b.textContent = T('diff_' + d);
    b.dataset.diff = d;
    if (d === diffKey) b.className = 'on';
    b.onclick = () => { diffKey = d; if (ch) rollCharacter(); drawSetup(); };
    $('diffBtns').appendChild(b);
  });
  $('diffDesc').textContent = T('diffd_' + diffKey);
  $('h1').textContent = T('h1');
  $('h2').textContent = T('h2');
  $('btnRoll').textContent = ch ? T('reroll') : T('roll');
  $('btnStart').textContent = T('start');
  $('lMain').textContent = T('lMain');
  $('btnAuto').textContent = T('auto');
  $('autoNote').textContent = T('autoNote');
  $('lang_ja').disabled = lang === 'ja';
  $('lang_en').disabled = lang === 'en';
  if (!ch) { $('abil').innerHTML = ''; return; }
  let h = '<table class="stat">';
  ['end', 'str', 'luck', 'know', 'reac', 'acc'].forEach(a => {
    h += '<tr><th>' + T('ab_' + a) + '</th><td><b>' + ch[a] + '</b></td><td class="dim">' + T('abd_' + a) + '</td></tr>';
  });
  h += '</table><div style="margin-top:4px">' + T('bonusSum', { n: ch.raw.reac + ch.raw.acc }) + '</div>';
  h += '<div class="good">' + (ch.skills.length ? T('bonusGot', { s: skillNames() }) : T('noBonus')) + '</div>';
  $('abil').innerHTML = h;
  $('pEquip').classList.remove('hide');
  $('pStart').classList.remove('hide');
  drawEquipPick();
}

function ctl(id, n) {
  return '<span class="eqCtl"><button data-e="' + id + '" data-v="-1">−</button><span class="num">' + n + '</span><button data-e="' + id + '" data-v="1">＋</button></span>';
}
function drawEquipPick() {
  const p = ch.pick;
  $('eqInfo').textContent = T('eqInfo', { w: pickWeight(), max: ch.str, b: pickBelt(), bm: beltMax(), g: pickGuns() });
  let h = '';
  ['SMG', 'AR', 'P', 'ATR'].forEach(g => {
    const info = g === 'AR' ? '9/11, 1/3' : GUNS[g].hit + ', ' + (g === 'ATR' ? 'A' : GUNS[g].ammo);
    h += '<div class="eqRow gGun"><span>' + T('it_' + g) + ' <span class="dim">w' + GUNS[g].w + ' / ' + info + '</span></span>' + ctl('gun:' + g, p[g]) + '</div>';
  });
  SMALL.forEach(s => {
    h += '<div class="eqRow gSmall"><span>' + T('it_' + s) + ' <span class="dim">w0.2</span></span><span>' + T('belt') + ' ' + ctl('belt:' + s, p.belt[s]) + ' ' + T('ruck') + ' ' + ctl('ruck:' + s, p.ruck[s]) + '</span></div>';
  });
  Object.keys(PACK).forEach(s => {
    const note = T('itd_' + s);
    h += '<div class="eqRow gPack"><span>' + T('it_' + s) + ' <span class="dim">w' + PACK[s] + (note !== 'itd_' + s ? ' / ' + note : '') + '</span></span><span>' + T('ruck') + ' ' + ctl('pack:' + s, p[s]) + '</span></div>';
  });
  $('eqList').innerHTML = h;
  $('eqList').querySelectorAll('button[data-e]').forEach(b => { b.onclick = () => changePick(b.dataset.e, +b.dataset.v); });
  const guns = ['SMG', 'AR', 'ATR'].filter(g => p[g] > 0);
  if (guns.indexOf(p.main) < 0) p.main = guns[0] || '';
  $('mainSel').innerHTML = guns.length
    ? guns.map(g => '<option value="' + g + '"' + (g === p.main ? ' selected' : '') + '>' + T('it_' + g) + '</option>').join('')
    : '<option value="">' + T('none') + '</option>';
  $('mainSel').onchange = () => { p.main = $('mainSel').value; };
  const errs = [];
  if (pickWeight() > ch.str) errs.push(T('errWeight'));
  if (pickBelt() > beltMax()) errs.push(T('errBelt', { n: beltMax() }));
  if (pickGuns() > 3) errs.push(T('errGuns'));
  $('startErr').textContent = errs.join(' / ');
  $('btnStart').disabled = errs.length > 0;
}
// おまかせ装備: 能力とスキルから選ぶ。重さとベルトの上限の中で、大事なものから順に入れる
function autoEquip() {
  const empty = { G: 0, N: 0, LSMG: 0, LAR: 0, LP: 0, LATR: 0 };
  ch.pick = { SMG: 0, AR: 0, P: 0, ATR: 0, belt: Object.assign({}, empty), ruck: Object.assign({}, empty), EP: 0, K: 0, U: 0, B: 0, main: '' };
  const p = ch.pick;
  const gun = has('ar') ? 'AR' : has('smg') ? 'SMG' : (ch.str >= 12 && ch.acc >= 3) ? 'AR' : 'SMG';
  const ammo = 'L' + gun;
  const add = fn => {
    const undo = JSON.stringify(p);
    fn();
    if (pickWeight() > ch.str || pickBelt() > beltMax()) { Object.assign(p, JSON.parse(undo)); return false; }
    return true;
  };
  const belt = (k, n) => { for (let i = 0; i < n; i++) if (!add(() => { p.belt[k]++; })) break; };
  const pack = (k, n) => { for (let i = 0; i < n; i++) if (!add(() => { p[k]++; })) break; };
  if (!add(() => { p[gun]++; })) add(() => { p.P++; });
  p.main = p[gun] ? gun : '';
  belt(p[gun] ? ammo : 'LP', 2);
  pack('EP', 2);
  pack('K', 1);
  if (!p.P && (has('pistol') || ch.str >= 8)) add(() => { p.P++; });
  if (p.P) belt('LP', 1);
  belt('G', has('grenade') ? 3 : 2);
  belt('N', has('knifeThrow') ? 3 : 1);
  if (p[gun]) belt(ammo, 2);
  pack('EP', 2);
}
function changePick(id, v) {
  const [k, n] = id.split(':');
  const p = ch.pick;
  if (k === 'gun') p[n] = Math.max(0, p[n] + v);
  else if (k === 'belt') p.belt[n] = Math.max(0, p.belt[n] + v);
  else if (k === 'ruck') p.ruck[n] = Math.max(0, p.ruck[n] + v);
  else p[n] = Math.max(0, p[n] + v);
  drawEquipPick();
}

// ===== ゲーム開始 =====
function startGame() {
  const p = ch.pick;
  const inv = { hand: null, shoulder: [], pistols: [], belt: Object.assign({}, p.belt), ruck: Object.assign({}, p.ruck), EP: p.EP, K: p.K, U: p.U, B: p.B, dropped: [] };
  ['SMG', 'AR', 'ATR'].forEach(g => { for (let i = 0; i < p[g]; i++) inv.shoulder.push({ t: g, ok: true }); });
  for (let i = 0; i < p.P; i++) inv.pistols.push({ t: 'P', ok: true });
  const mi = inv.shoulder.findIndex(w => w.t === p.main);
  if (mi >= 0) inv.hand = inv.shoulder.splice(mi, 1)[0];
  G = {
    turn: 1, x: MID, y: MID, px: MID, py: MID, cells: {}, edges: {}, inv, wounds: 0, vp: 0, stolenVp: 0, kills: 0, lvDone: 0,
    msgs: [], vis: {}, phase: 'move', viaDoor: false, trip: false, monitor: false, combat: null, over: null,
  };
  const c = cell(MID, MID);
  c.seen = true; c.room = 'EH'; c.start = true;
  ['n', 's', 'e', 'w'].forEach(s => setEdge(MID, MID, s, 'door'));
  G.vis = visibleSet();
  msg('m_start');
  G.phase = 'move';
  $('setup').classList.add('hide');
  $('game').classList.remove('hide');
  drawGame();
}

// ===== 地図 =====
const ck = (x, y) => x + ',' + y;
function cell(x, y) {
  const k = ck(x, y);
  if (!G.cells[k]) G.cells[k] = { x, y, enemies: 0, seen: false, room: null, done: false, medUsed: false, armoryUsed: false };
  return G.cells[k];
}
function edgeKey(x, y, s) {
  if (s === 'n') return 'h' + x + ',' + y;
  if (s === 's') return 'h' + x + ',' + (y + 1);
  if (s === 'w') return 'v' + x + ',' + y;
  return 'v' + (x + 1) + ',' + y;
}
function getEdge(x, y, s) {
  const nx = x + DIRS[s][0], ny = y + DIRS[s][1];
  if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) return 'wall';
  return G.edges[edgeKey(x, y, s)] || null;
}
function setEdge(x, y, s, v) { G.edges[edgeKey(x, y, s)] = v; }
function rollEdges(x, y) {
  ['n', 'e', 's', 'w'].forEach(s => {
    if (getEdge(x, y, s)) return;
    const r = d6();
    setEdge(x, y, s, r <= 2 ? 'wall' : r <= 4 ? 'door' : 'hall');
  });
}
function ensureExit(x, y) {
  // 飛ばされた先が四方とも壁だと出られないので、ドアを1つ作る
  const open = ['n', 'e', 's', 'w'].filter(s => getEdge(x, y, s) !== 'wall');
  if (open.length) return;
  const inside = ['n', 'e', 's', 'w'].filter(s => {
    const nx = x + DIRS[s][0], ny = y + DIRS[s][1];
    return nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE;
  });
  setEdge(x, y, inside[0], 'door');
}
function visibleSet() {
  const v = {};
  v[ck(G.x, G.y)] = 1;
  ['n', 'e', 's', 'w'].forEach(s => {
    if (getEdge(G.x, G.y, s) === 'hall') v[ck(G.x + DIRS[s][0], G.y + DIRS[s][1])] = 1;
  });
  return v;
}

// ===== 能力の補正 =====
function excess() { return Math.max(0, G.wounds - Math.floor(ch.end / 2)); }
const reac = () => Math.max(0, ch.reac - Math.floor(excess() / 3));
const acc = () => Math.max(0, ch.acc - Math.floor(excess() / 3));
const str = () => Math.max(0, ch.str - excess());

function msg(k, p) { G.msgs.push(T(k, p)); }
function wound(n) {
  G.wounds += n;
  if (G.wounds >= ch.end) { G.over = 'captured'; return true; }
  return false;
}

// ===== ターン =====
function move(dirKey) {
  if (G.over || G.phase === 'combat') return;
  const e = getEdge(G.x, G.y, dirKey);
  if (e === 'wall') { G.msgs = [T('m_wall')]; drawGame(); return; }
  G.msgs = [];
  G.turn++;
  const d = DIRS[dirKey];
  const door = e === 'door';
  G.px = G.x; G.py = G.y;
  G.x += d[0]; G.y += d[1];
  G.viaDoor = door;
  msg('m_moved', { dir: T({ n: 'cell_n', s: 'cell_s', e: 'cell_e', w: 'cell_w' }[dirKey]) });
  if (door) {
    msg('m_door');
    accident();
    if (G.over) { finish(); return; }
  }
  arrive();
}

function accident() {
  const a = d6();
  if (a < ch.luck) { msg('m_acc0', { d: a, l: ch.luck }); return; }
  const n = d2();
  let t;
  if (n === 2 || n === 12) {
    const w = Math.max(0, d2() - ch.luck);
    t = T('a_laser', { n: w });
    wound(w);
  } else if (n === 3 || n === 11) { t = T('a_trip'); G.trip = true; }
  else if (n === 4 || n === 10) { t = T('a_tv'); G.monitor = true; }
  else if (n === 5 || n === 9) {
    t = T('a_sneeze');
    if (G.inv.hand) { G.inv.dropped.push(G.inv.hand); G.inv.hand = null; }
  } else t = T('a_hic');
  msg('m_acc', { d: a, n, t });
}

function arrive() {
  // 壁チェック
  rollEdges(G.x, G.y);
  const c = cell(G.x, G.y);
  c.seen = true;
  const nv = visibleSet();
  Object.keys(nv).forEach(k => {
    if (k === ck(G.x, G.y)) return;
    const [x, y] = k.split(',').map(Number);
    rollEdges(x, y);
    cell(x, y).seen = true;
  });
  // 部屋チェック
  const isRoom = ['n', 'e', 's', 'w'].every(s => getEdge(G.x, G.y, s) !== 'hall');
  if (isRoom && !c.room) c.room = ROOMS[d2()];
  if (c.room) msg('m_room', { r: T('r_' + c.room) });
  // 敵チェック（前のターンに見えていなかったマスだけ）
  const old = G.vis;
  G.vis = nv;
  let any = false;
  const label = k => {
    const [x, y] = k.split(',').map(Number);
    if (x === G.x && y === G.y) return T('cell_here');
    if (x > G.x) return T('cell_e');
    if (x < G.x) return T('cell_w');
    return y < G.y ? T('cell_n') : T('cell_s');
  };
  Object.keys(nv).sort(k => (k === ck(G.x, G.y) ? -1 : 1)).forEach(k => {
    const q = G.cells[k];
    q.enemies = 0;
    const here = k === ck(G.x, G.y);
    const forced = here && G.monitor;
    if (old[k] && !forced) return;
    if (forced || d6() <= DF().enemy) {
      q.enemies = q.room === 'PP' ? 10 : Math.max(1, d6() + DF().extra);
      any = true;
      msg('m_enemy', { x: label(k), n: q.enemies });
    }
  });
  G.monitor = false;
  if (any) startCombat();
  else { msg('m_noEnemy'); enterAdjust(); }
  drawGame();
}

function enterAdjust() {
  G.phase = 'adjust';
  const c = cell(G.x, G.y);
  if (c.room && c.room !== 'CC' && G.wounds > 0) { G.wounds = Math.max(0, G.wounds - DF().heal); msg('m_heal'); }
  // 能力アップ: 敵10人ごとに判定
  while (Math.floor(G.kills / 10) > G.lvDone) {
    G.lvDone++;
    const r = d6();
    msg('m_lvChk', { d: r });
    if (r <= 2) levelUp();
  }
}
function levelUp() {
  const a = ['end', 'str', 'luck', 'know', 'reac', 'acc'][d6() - 1];
  if (a === 'end' || a === 'str') ch[a]++;
  else { ch.raw[a]++; ch[a] = Math.ceil(ch.raw[a] / 3); }
  msg('m_lvUp', { a: T('ab_' + a), n: ch[a] });
  grantBonus().forEach(s => msg('m_newSk', { s: T('sk_' + s) }));
}

// ===== 部屋の任務 =====
function doMission() {
  const c = cell(G.x, G.y);
  const m = MISSION[c.room];
  if (!m || c.done) return;
  if (m === 'blast') {
    if (G.inv.EP <= 0) return;
    G.inv.EP--;
  } else if (G.inv.K <= 0) return;
  c.done = true;
  const r = d6();
  if (r <= ch.know) {
    msg('m_mOk', { d: r, k: ch.know });
    G.vp += r;
    if (m === 'steal') G.stolenVp += r;
    if (d6() === 1) specialBonus(c.room);
  } else {
    msg('m_mNg', { d: r, k: ch.know });
    if (c.room === 'GP') {
      msg('m_gp');
      G.px = G.x; G.py = G.y;
      G.y = Math.min(SIZE - 1, G.y + 4);
      G.viaDoor = false;
      rollEdges(G.x, G.y);
      ensureExit(G.x, G.y);
      accident();
      if (G.over) { finish(); return; }
      arrive();
      return;
    }
  }
  drawGame();
}
function specialBonus(room) {
  if (room === 'LS') {
    G.vp += 20;
    if (G.inv.hand) G.inv.shoulder.push(G.inv.hand);
    G.inv.hand = { t: 'BIGK', ok: true };
    while (G.inv.shoulder.length > 2) G.inv.dropped.push(G.inv.shoulder.pop());
    msg('m_bigk');
  } else if (SPECIAL[room]) {
    G.vp += SPECIAL[room];
    if (room === 'RC') G.stolenVp += SPECIAL[room];
    msg('m_sb', { v: SPECIAL[room] });
  }
}
function doMedical() {
  const c = cell(G.x, G.y);
  if (c.room !== 'CC' || c.medUsed) return;
  c.medUsed = true;
  const n = d2();
  const before = G.wounds;
  G.wounds = Math.max(0, G.wounds - n);
  msg('m_healed', { n: before - G.wounds });
  drawGame();
}

// ===== 戦闘 =====
function enemies() {
  return Object.keys(G.vis).map(k => G.cells[k]).filter(c => c && c.enemies > 0);
}
const totalEnemies = () => enemies().reduce((t, c) => t + c.enemies, 0);
const hereCell = () => cell(G.x, G.y);
function cbMsg(k, p) { G.combat.msgs.push(T(k, p)); }

function startCombat() {
  G.phase = 'combat';
  G.combat = { round: 0, ap: 0, fresh: true, prone: false, msgs: [], pick: null };
  newRound();
}
function newRound() {
  const C = G.combat;
  C.round++;
  C.fresh = true;
  C.pick = null;
  if (G.trip) {
    G.trip = false;
    C.ap = ch.luck;
    cbMsg('c_ap_trip', { r: C.ap });
  } else {
    const r = d2();
    C.ap = Math.max(0, r + reac() + DF().ap);
    cbMsg('c_ap', { r: C.ap, d: r, e: reac() + DF().ap });
  }
  drawCombat();
}

function costOf(base, skill) { return Math.max(0, base - (skill && has(skill) ? 1 : 0)); }

function actionList() {
  const C = G.combat, I = G.inv, h = I.hand;
  const same = hereCell().enemies > 0;
  const fresh7 = C.fresh && C.ap >= 7;
  const room = hereCell().room;
  const emptyWithAmmo = [].concat(h ? [h] : [], I.pistols).some(w => !w.ok && w.t !== 'BIGK' && I.belt['L' + w.t] > 0);
  const list = [];
  const add = (id, cost, ok, P, tgt) => list.push({ id, cost, ok, P, tgt });
  if (h && (h.t === 'SMG' || h.t === 'AR')) add('auto', costOf(5, h.t === 'SMG' ? 'smg' : 'ar'), h.ok, true, 'cell');
  if (h && h.t === 'AR') add('single', costOf(2, 'ar'), h.ok, true, 'cell');
  if (I.pistols.length) add('pistol', costOf(4, 'pistol'), I.pistols.some(w => w.ok), true, 'cell');
  if (I.belt.G > 0) add('grenade', costOf(6, 'grenade'), room !== 'AS', true, C.prone ? 'here' : 'cell');
  if (I.belt.N > 0) add('knife', 6, same, false, 'here');
  if (I.belt.N > 0 && has('knifeThrow')) add('throw', 3, true, false, 'cell');
  add('melee', 'all', same && fresh7, false, 'here');
  if (h && h.t === 'ATR') add('atr', 'all', fresh7 && C.prone && h.ok, true, null);
  if (h && h.t === 'BIGK') add('bigk', 8, true, true, null);
  if (has('karate')) add('karate', 4, same, false, 'here');
  add('reload', costOf(3, 'reload'), emptyWithAmmo, false, null);
  add('swap', 4, I.shoulder.length > 0, false, 'swap');
  if (!C.prone) add('prone', 3, true, false, null);
  else add('stand', 5, true, true, null);
  if (has('suggest')) add('surr', 'all', fresh7, false, null);
  if (G.viaDoor) add('flee', 'all', fresh7, false, null);
  return list;
}
function canDo(a) {
  const C = G.combat;
  if (!a.ok) return false;
  if (C.prone && !a.P) return false;
  if (a.cost === 'all') return C.ap >= 7 && C.fresh;
  return C.ap >= a.cost;
}

function clickAction(a) {
  const C = G.combat;
  if (a.tgt === 'cell') { C.pick = a; drawCombat(); return; }
  if (a.tgt === 'swap') { C.pick = a; drawCombat(); return; }
  runAction(a, hereCell());
}
function spend(a) {
  const C = G.combat;
  if (a.cost === 'all') C.ap = 0;
  else C.ap -= a.cost;
  C.fresh = false;
  C.pick = null;
}
function downOne(c) { if (c.enemies > 0) { c.enemies--; G.kills++; } }

function magCheck(w, ammoNum) {
  const r = d6();
  if (r <= ammoNum) { w.ok = false; cbMsg('c_empty', { w: T('it_' + w.t), d: r }); }
}
function shoot(w, c, need, ammo, name, count) {
  let n = count === 'all' ? c.enemies : 1;
  const a = acc();
  while (n-- > 0 && c.enemies > 0) {
    const r = d2();
    const tot = r + a;
    const res = tot >= need ? T('c_hit') : T('c_miss');
    cbMsg('c_shot', { w: name, d: r, a, t: tot, n: need, res });
    if (tot >= need) downOne(c);
  }
  magCheck(w, ammo);
}

function runAction(a, c) {
  const I = G.inv, h = I.hand, C = G.combat;
  spend(a);
  if (a.id === 'auto') {
    if (h.t === 'AR') shoot(h, c, GUNS.AR.autoHit, GUNS.AR.autoAmmo, T('ac_auto'), 'all');
    else shoot(h, c, GUNS.SMG.hit, GUNS.SMG.ammo, T('ac_auto'), 'all');
  } else if (a.id === 'single') {
    shoot(h, c, GUNS.AR.hit, GUNS.AR.ammo, T('ac_single'), 1);
  } else if (a.id === 'pistol') {
    const w = I.pistols.find(p => p.ok);
    shoot(w, c, GUNS.P.hit, GUNS.P.ammo, T('ac_pistol'), 1);
  } else if (a.id === 'grenade') {
    const r = d2(), A = acc();
    const n = Math.floor((r + ch.luck + A) / 4);
    I.belt.G--;
    let down = 0;
    for (let i = 0; i < n; i++) if (c.enemies > 0) { downOne(c); down++; }
    cbMsg('c_nade', { d: r, l: ch.luck, a: A, n: down });
  } else if (a.id === 'knife') {
    const r = d6(), A = acc() + (has('knifeThrow') ? 1 : 0);
    const t = r + A;
    cbMsg('c_knife', { d: r, a: A, t, res: t >= 7 ? T('c_hit') : T('c_miss') });
    if (t >= 7) downOne(c);
    if (r <= 2) { I.belt.N--; cbMsg('c_kdrop', { d: r }); }
  } else if (a.id === 'throw') {
    const r = d6();
    I.belt.N--;
    cbMsg('c_throw', { d: r, res: r <= 4 ? T('c_hit') : T('c_miss') });
    if (r <= 4) downOne(c);
  } else if (a.id === 'melee') {
    const r = d6(), S = str(), t = r + S;
    cbMsg('c_melee', { d: r, s: S, t, res: t >= 16 ? T('c_hit') : T('c_miss') });
    if (t >= 16) downOne(c);
  } else if (a.id === 'atr') {
    enemies().forEach(q => { let n = q.enemies; while (n-- > 0) {
      const r = d2(), A = acc(), t = r + A;
      cbMsg('c_shot', { w: T('ac_atr'), d: r, a: A, t, n: GUNS.ATR.hit, res: t >= GUNS.ATR.hit ? T('c_hit') : T('c_miss') });
      if (t >= GUNS.ATR.hit) downOne(q);
    } });
    h.ok = false;
  } else if (a.id === 'bigk') {
    enemies().forEach(q => { let n = q.enemies; while (n-- > 0) {
      const r = d6();
      cbMsg('c_big', { d: r, res: r <= 5 ? T('c_hit') : T('c_miss') });
      if (r <= 5) downOne(q);
    } });
  } else if (a.id === 'karate') {
    const r = d6();
    cbMsg('c_kar', { d: r, res: r <= 4 ? T('c_hit') : T('c_miss') });
    if (r <= 4) downOne(c);
  } else if (a.id === 'reload') {
    const w = [].concat(h ? [h] : [], I.pistols).find(q => !q.ok && q.t !== 'BIGK' && I.belt['L' + q.t] > 0);
    I.belt['L' + w.t]--;
    w.ok = true;
    cbMsg('c_reload', { w: T('it_' + w.t) });
  } else if (a.id === 'prone') {
    C.prone = true;
    cbMsg('c_prone');
  } else if (a.id === 'stand') {
    C.prone = false;
    cbMsg('c_stand');
  } else if (a.id === 'surr') {
    const r = d6();
    cbMsg('c_surr', { d: r, res: r <= 4 ? T('c_surrOk') : T('c_surrNg') });
    if (r <= 4) enemies().forEach(q => { while (q.enemies > 0) downOne(q); });
  } else if (a.id === 'flee') {
    const r = d2(), L = ch.luck + (has('flee') ? 1 : 0), t = r + L;
    const ok = t >= 12;
    cbMsg('c_flee', { d: r, l: L, t, res: ok ? T('c_ok') : T('c_ng') });
    if (ok) { fleeSuccess(); return; }
    // 失敗したらこのラウンドの反撃へ
    endRound();
    return;
  }
  afterAct();
}
function runSwap(i) {
  const I = G.inv, a = G.combat.pick;
  spend(a);
  const w = I.shoulder.splice(i, 1)[0];
  if (I.hand) I.dropped.push(I.hand);
  I.hand = w;
  cbMsg('c_swap', { w: T('it_' + w.t) });
  afterAct();
}
function afterAct() {
  if (totalEnemies() <= 0) { winCombat(); return; }
  drawCombat();
}
function winCombat() {
  G.msgs.push(T('c_win'));
  closeCombat();
  enterAdjust();
  drawGame();
}
function closeCombat() {
  G.combat = null;
  $('combat').classList.add('hide');
}
function fleeSuccess() {
  Object.keys(G.cells).forEach(k => { G.cells[k].enemies = 0; });
  closeCombat();
  G.msgs.push(T('m_flee'));
  const px = G.px, py = G.py;
  G.px = G.x; G.py = G.y;
  G.x = px; G.y = py;
  G.viaDoor = false;
  accident();
  if (G.over) { finish(); return; }
  G.vis = {};                // 元のマスへ戻ったので敵の判定をやり直す
  arrive();
}
function endRound() {
  const C = G.combat;
  let shot = 0, panic = 0, n = 0;
  enemies().forEach(q => {
    const same = q.x === G.x && q.y === G.y;
    for (let i = 0; i < q.enemies; i++) {
      if (d6() >= DF().panic) { panic++; continue; }
      shot++;
      const v = Math.min(7, Math.max(0, d6() + (C.prone ? -1 : 0) + (same ? 1 : 0)));
      n += COUNTER[v];
    }
  });
  cbMsg('c_cnt', { a: shot, p: panic, n });
  if (wound(n)) {
    cbMsg('c_ko');
    closeCombat();
    finish();
    return;
  }
  newRound();
}

// ===== 戦闘の窓 =====
function silhouettes(n) {
  const one = n > 6 ? 'width="10" height="19"' : 'width="14" height="26"';
  let h = '';
  for (let i = 0; i < n; i++) h += '<svg ' + one + ' viewBox="0 0 14 26"><circle cx="7" cy="5" r="4.5"/><path d="M1 26 v-11 q6 -5 12 0 v11z"/></svg>';
  return h;
}
function drawCombat() {
  const C = G.combat;
  if (!C) return;
  $('combat').classList.remove('hide');
  $('cbTitle').textContent = T('cb_title');
  $('cbInfo').textContent = T('cb_round', { r: C.round, n: totalEnemies() });
  $('apLab').textContent = T('apLab') + ':';
  $('ap').textContent = C.ap;
  $('cbStat').textContent = T('cb_st', { w: G.wounds, e: ch.end, p: T(C.prone ? 'prone' : 'standing') });
  // マスの配置
  const pos = { 'x0,-1': 1, 'x-1,0': 3, 'x0,0': 4, 'x1,0': 5, 'x0,1': 7 };
  const grid = new Array(9).fill(null);
  Object.keys(G.vis).forEach(k => {
    const q = G.cells[k];
    if (!q) return;
    const i = pos['x' + (q.x - G.x) + ',' + (q.y - G.y)];
    if (i !== undefined) grid[i] = q;
  });
  const box = $('cbCells');
  box.innerHTML = '';
  const dirName = i => ({ 1: 'cell_n', 3: 'cell_w', 4: 'cell_here', 5: 'cell_e', 7: 'cell_s' }[i]);
  grid.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'cbCell';
    if (dirName(i) && q) {
      d.innerHTML = T(dirName(i)) + (q.enemies > 0
        ? '<div class="sil">' + silhouettes(q.enemies) + '</div><b>' + T('cb_men', { n: q.enemies }) + '</b>'
        : '<b>' + (i === 4 ? '★' : '-') + '</b>');
      if (q.enemies > 0) d.className += ' has';
      if (i === 4) d.className += ' me';
      const pickable = C.pick && C.pick.tgt === 'cell' && q.enemies > 0;
      if (pickable) {
        d.className += ' pick';
        d.onclick = () => runAction(C.pick, q);
      }
    } else {
      d.style.visibility = 'hidden';
    }
    box.appendChild(d);
  });
  $('cbPrompt').textContent = C.pick ? (C.pick.tgt === 'cell' ? T('cb_pick') : '') : '';
  const acts = $('cbActs');
  acts.innerHTML = '';
  if (C.pick && C.pick.tgt === 'swap') {
    G.inv.shoulder.forEach((w, i) => {
      const b = document.createElement('button');
      b.textContent = T('it_' + w.t);
      b.onclick = () => runSwap(i);
      acts.appendChild(b);
    });
  }
  if (C.pick) {
    const b = document.createElement('button');
    b.textContent = T('cancel');
    b.onclick = () => { C.pick = null; drawCombat(); };
    acts.appendChild(b);
  } else {
    actionList().forEach(a => {
      const b = document.createElement('button');
      const cost = a.cost === 'all' ? T('all') + '(7~)' : a.cost;
      b.textContent = T('ac_' + a.id) + ' [' + cost + ']' + (a.P ? ' P' : '');
      b.disabled = !canDo(a);
      b.dataset.act = a.id;
      b.onclick = () => clickAction(a);
      acts.appendChild(b);
    });
    const e = document.createElement('button');
    e.textContent = T('endRound');
    e.className = 'warn';
    e.id = 'btnEndRound';
    e.onclick = endRound;
    acts.appendChild(e);
  }
  const m = $('cbMsgs');
  m.innerHTML = C.msgs.map(s => '<div>' + s + '</div>').join('');
  m.scrollTop = m.scrollHeight;
  drawGame();
}

// ===== 画面 =====
function drawMap() {
  const Z = zoom, total = SIZE * Z;
  let s = '<svg width="' + total + '" height="' + total + '" style="display:block;background:#0d0e0f">';
  const edgeSvg = (x, y, side) => {
    const v = getEdge(x, y, side);
    if (!v) return '';
    const X = x * Z, Y = y * Z;
    const seg = { n: [X, Y, X + Z, Y], s: [X, Y + Z, X + Z, Y + Z], w: [X, Y, X, Y + Z], e: [X + Z, Y, X + Z, Y + Z] }[side];
    if (v === 'wall') return '<line x1="' + seg[0] + '" y1="' + seg[1] + '" x2="' + seg[2] + '" y2="' + seg[3] + '" stroke="#bbb" stroke-width="' + Math.max(3, Z * 0.07) + '"/>';
    if (v === 'hall') return '<line x1="' + seg[0] + '" y1="' + seg[1] + '" x2="' + seg[2] + '" y2="' + seg[3] + '" stroke="#68a" stroke-width="1" stroke-dasharray="3 3"/>';
    const t = Math.max(5, Z * 0.14), w = Z * 0.44;
    let dx, dy, dw, dh;
    if (side === 'n' || side === 's') { dx = (seg[0] + seg[2]) / 2 - w / 2; dy = seg[1] - t / 2; dw = w; dh = t; }
    else { dx = seg[0] - t / 2; dy = (seg[1] + seg[3]) / 2 - w / 2; dw = t; dh = w; }
    return '<line x1="' + seg[0] + '" y1="' + seg[1] + '" x2="' + seg[2] + '" y2="' + seg[3] + '" stroke="#bbb" stroke-width="' + Math.max(2, Z * 0.05) + '"/>'
      + '<rect x="' + dx + '" y="' + dy + '" width="' + dw + '" height="' + dh + '" fill="#a86432" stroke="#5a3a18"/>';
  };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const c = G.cells[ck(x, y)];
    const X = x * Z, Y = y * Z;
    const here = x === G.x && y === G.y;
    const vis = G.vis[ck(x, y)];
    const fill = here ? '#6a4a28' : vis ? '#39414a' : c && c.seen ? '#272b30' : '#111';
    s += '<rect x="' + X + '" y="' + Y + '" width="' + Z + '" height="' + Z + '" fill="' + fill + '" stroke="#000" stroke-width="0.5"/>';
    if (c && c.room) {
      const name = T('r_' + c.room);
      const fs = Math.max(8, Z * 0.16);
      s += '<text x="' + (X + Z / 2) + '" y="' + (Y + fs + 3) + '" text-anchor="middle" font-size="' + fs + '" fill="#fc8">' + name.slice(0, lang === 'ja' ? 5 : 8) + '</text>';
      if (c.done) s += '<text x="' + (X + Z - 4) + '" y="' + (Y + Z - 4) + '" text-anchor="end" font-size="' + (fs * 1.1) + '" fill="#7c7">✓</text>';
    }
    if (c && c.enemies > 0) {
      // 敵はマスの中央に、人型と人数で大きく出す
      const hx = X + Z * 0.34, hy = Y + Z * 0.36, r = Z * 0.1;
      s += '<circle cx="' + hx + '" cy="' + hy + '" r="' + r + '" fill="#ff5a5a"/>'
        + '<path d="M' + (hx - Z * 0.15) + ' ' + (Y + Z * 0.8) + ' v' + (-Z * 0.22) + ' q' + (Z * 0.15) + ' ' + (-Z * 0.14) + ' ' + (Z * 0.3) + ' 0 v' + (Z * 0.22) + 'z" fill="#ff5a5a"/>'
        + '<text x="' + (X + Z * 0.7) + '" y="' + (Y + Z * 0.68) + '" text-anchor="middle" font-size="' + (Z * 0.46) + '" font-weight="bold" fill="#fff" stroke="#900" stroke-width="1" paint-order="stroke">' + c.enemies + '</text>';
    }
    if (here) {
      const withE = c && c.enemies > 0;
      s += '<text x="' + (X + (withE ? Z * 0.14 : Z * 0.5)) + '" y="' + (Y + (withE ? Z * 0.96 : Z * 0.7)) + '" text-anchor="middle" font-size="' + (Z * (withE ? 0.26 : 0.46)) + '" fill="#fff">★</text>';
    }
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const c = G.cells[ck(x, y)];
    if (c && c.seen) { s += edgeSvg(x, y, 'n') + edgeSvg(x, y, 'w') + edgeSvg(x, y, 'e') + edgeSvg(x, y, 's'); }
  }
  $('map').innerHTML = s + '</svg>';
}

function drawGame() {
  if (!G) return;
  document.title = T('title');
  $('turnLab').textContent = T('diff_' + diffKey) + '  ' + T('turn', { t: G.turn, v: G.vp, k: G.kills });
  $('legend').textContent = T('legend');
  $('langBtn').textContent = T('langOther');
  $('btnRules2').textContent = T('rules');
  $('hMove').textContent = T('hMove');
  $('hPhase').textContent = T('hPhase');
  $('hMsgs').textContent = T('hMsgs');
  $('hStat').textContent = T('hStat');
  $('hEq').textContent = T('hEq');
  [['mvN', 'north', 'n'], ['mvS', 'south', 's'], ['mvE', 'east', 'e'], ['mvW', 'west', 'w']].forEach(v => {
    const b = $(v[0]);
    b.textContent = T(v[1]);
    b.disabled = !!G.over || !!G.combat || getEdge(G.x, G.y, v[2]) === 'wall';
  });
  const c = cell(G.x, G.y);
  $('phaseText').textContent = (c.room ? T('inRoom', { r: T('r_' + c.room), d: T('rd_' + c.room) }) : T('inHall')) + '\n';
  const box = $('adjust');
  box.innerHTML = '';
  const addBtn = (txt, fn, ok, cls) => {
    const b = document.createElement('button');
    b.textContent = txt; b.onclick = fn; b.disabled = !ok; if (cls) b.className = cls;
    box.appendChild(b);
  };
  if (!G.over && !G.combat) {
    const m = c.room && MISSION[c.room];
    if (m && !c.done) {
      const ok = m === 'blast' ? G.inv.EP > 0 : G.inv.K > 0;
      addBtn(T('btnMission', { m: T('mi_' + m) }) + (ok ? '' : ' (' + T(m === 'blast' ? 'noEP' : 'noKit') + ')'), doMission, ok, 'go');
    }
    if (c.room === 'CC' && !c.medUsed) addBtn(T('btnMed'), doMedical, true, 'go');
    if (c.room === 'AS' && !c.armoryUsed) addBtn(T('btnArmory'), () => { c.armoryUsed = true; openEquip(true); }, true, 'go');
    addBtn(T('btnEquip'), () => openEquip(false), true);
    if (c.room === 'EH' && G.turn > 1) addBtn(T('btnExit'), () => { G.over = 'escaped'; finish(); }, true, 'warn');
  }
  $('msgs').innerHTML = G.msgs.map(s => '<div>' + s + '</div>').join('');
  $('stat').innerHTML = '<table class="stat"><tr><th>' + T('wounds') + '</th><td>' + G.wounds + ' / ' + ch.end + '</td><th>' + T('ab_str') + '</th><td>' + str() + '</td></tr>'
    + '<tr><th>' + T('ab_reac') + '</th><td>' + reac() + '</td><th>' + T('ab_acc') + '</th><td>' + acc() + '</td></tr>'
    + '<tr><th>' + T('ab_luck') + '</th><td>' + ch.luck + '</td><th>' + T('ab_know') + '</th><td>' + ch.know + '</td></tr></table>'
    + (ch.skills.length ? '<div class="dim">' + T('bonusGot', { s: skillNames() }) + '</div>' : '');
  $('eqNow').innerHTML = equipText();
  drawMap();
  document.querySelector('#mapWrap').scrollLeft = Math.max(0, (G.x + 0.5) * zoom - $('mapWrap').clientWidth / 2);
  document.querySelector('#mapWrap').scrollTop = Math.max(0, (G.y + 0.5) * zoom - $('mapWrap').clientHeight / 2);
}

function gunLabel(w) { return T('it_' + w.t) + (w.ok ? '' : ' (' + T('empty') + ')'); }
function equipText() {
  const I = G.inv;
  const rows = [];
  rows.push('<b>' + T('onHand') + ':</b> ' + (I.hand ? gunLabel(I.hand) : T('none')));
  if (I.shoulder.length) rows.push('<b>' + T('onShoulder') + ':</b> ' + I.shoulder.map(gunLabel).join(', '));
  const list = o => SMALL.filter(s => o[s] > 0).map(s => T('it_' + s) + '×' + o[s]);
  const belt = I.pistols.map(gunLabel).concat(list(I.belt));
  if (belt.length) rows.push('<b>' + T('onBelt') + ':</b> ' + belt.join(', '));
  const ruck = list(I.ruck);
  ['EP', 'K', 'U', 'B'].forEach(s => { if (I[s] > 0) ruck.push(T('it_' + s) + '×' + I[s]); });
  if (ruck.length) rows.push('<b>' + T('onRuck') + ':</b> ' + ruck.join(', '));
  if (I.dropped.length) rows.push('<b>' + T('dropped') + ':</b> ' + I.dropped.map(gunLabel).join(', '));
  return rows.map(r => '<div>' + r + '</div>').join('');
}

// ===== 装備の変更（窓） =====
function invWeight() {
  const I = G.inv;
  let w = 0;
  [].concat(I.hand ? [I.hand] : [], I.shoulder, I.pistols).forEach(g => { w += GUNS[g.t].w; });
  SMALL.forEach(s => { w += 0.2 * (I.belt[s] + I.ruck[s]); });
  Object.keys(PACK).forEach(s => { w += PACK[s] * I[s]; });
  return Math.round(w * 10) / 10;
}
const beltCount = () => G.inv.pistols.length + SMALL.reduce((t, s) => t + G.inv.belt[s], 0);

function openEquip(armory) {
  $('dialog').classList.remove('hide');
  $('dlgTitle').textContent = T(armory ? 'dlgArmory' : 'dlgEquip');
  $('dlgClose').textContent = T('close');
  $('dlgClose').onclick = () => { $('dialog').classList.add('hide'); drawGame(); };
  const I = G.inv;
  const body = $('dlgBody');
  const draw = () => {
    body.innerHTML = '<div>' + T('eqInfo', { w: invWeight(), max: str(), b: beltCount(), bm: beltMax(), g: (I.hand ? 1 : 0) + I.shoulder.length }) + '</div>';
    const row = (txt, btns) => {
      const d = document.createElement('div');
      d.className = 'eqRow';
      const s = document.createElement('span');
      s.textContent = txt;
      const r = document.createElement('span');
      btns.forEach(([t, fn, ok]) => {
        const b = document.createElement('button');
        b.textContent = t; b.disabled = ok === false;
        b.onclick = () => { fn(); draw(); };
        r.appendChild(b);
      });
      d.appendChild(s); d.appendChild(r);
      body.appendChild(d);
    };
    const canWeigh = w => invWeight() + w <= str() + 0.001;
    if (I.hand) row(T('onHand') + ': ' + gunLabel(I.hand), [
      [T('toShoulder'), () => { I.shoulder.push(I.hand); I.hand = null; }, I.shoulder.length < 2],
      [T('discard'), () => { I.hand = null; }],
    ]);
    I.shoulder.forEach((g, i) => row(T('onShoulder') + ': ' + gunLabel(g), [
      [T('takeHand'), () => { const h = I.hand; I.hand = I.shoulder.splice(i, 1)[0]; if (h) I.shoulder.push(h); }],
      [T('discard'), () => { I.shoulder.splice(i, 1); }],
    ]));
    I.pistols.forEach((g, i) => row(T('onBelt') + ': ' + gunLabel(g), [[T('discard'), () => { I.pistols.splice(i, 1); }]]));
    I.dropped.forEach((g, i) => row(T('dropped') + ': ' + gunLabel(g), [[T('pickUp'), () => {
      const w = I.dropped.splice(i, 1)[0];
      if (w.t === 'P') I.pistols.push(w);
      else if (!I.hand) I.hand = w;
      else I.shoulder.push(w);
    }, canWeigh(GUNS[g.t].w) && (g.t === 'P' ? beltCount() < beltMax() : (!I.hand || I.shoulder.length < 2))]]));
    SMALL.forEach(s => {
      if (I.belt[s] + I.ruck[s] === 0 && !armory) return;
      const btns = [
        [T('toBelt'), () => { I.ruck[s]--; I.belt[s]++; }, I.ruck[s] > 0 && beltCount() < beltMax()],
        [T('toRuck'), () => { I.belt[s]--; I.ruck[s]++; }, I.belt[s] > 0],
        [T('discard'), () => { if (I.ruck[s] > 0) I.ruck[s]--; else I.belt[s]--; }, I.belt[s] + I.ruck[s] > 0],
      ];
      if (armory) btns.unshift([T('take'), () => { I.ruck[s]++; }, canWeigh(0.2)]);
      row(T('it_' + s) + '  ' + T('belt') + I.belt[s] + ' / ' + T('ruck') + I.ruck[s], btns);
    });
    Object.keys(PACK).forEach(s => {
      if (I[s] === 0 && !armory) return;
      const btns = [[T('discard'), () => { I[s]--; }, I[s] > 0]];
      if (armory && s !== 'U' && s !== 'B') btns.unshift([T('take'), () => { I[s]++; }, canWeigh(PACK[s])]);
      row(T('it_' + s) + ' ×' + I[s], btns);
    });
    if (armory) ['SMG', 'AR', 'P', 'ATR'].forEach(t => row(T('it_' + t), [[T('take'), () => {
      const w = { t, ok: true };
      if (t === 'P') I.pistols.push(w);
      else if (!I.hand) I.hand = w;
      else I.shoulder.push(w);
    }, canWeigh(GUNS[t].w) && (t === 'P' ? beltCount() < beltMax() : (!I.hand || I.shoulder.length < 2))]]));
  };
  draw();
}

function openRules() {
  $('dialog').classList.remove('hide');
  $('dlgTitle').textContent = T('rulesTitle');
  $('dlgClose').textContent = T('close');
  $('dlgClose').onclick = () => { $('dialog').classList.add('hide'); };
  $('dlgBody').innerHTML = '';
  const d = document.createElement('div');
  d.style.whiteSpace = 'pre-wrap';
  d.textContent = T('rulesBody');
  $('dlgBody').appendChild(d);
}

function finish() {
  G.phase = 'end';
  $('combat').classList.add('hide');
  if (G.over === 'captured') G.vp -= G.stolenVp;
  drawGame();
  const v = Math.max(0, G.vp);
  const r = G.over !== 'escaped' ? 0 : v >= 40 ? 4 : v >= 25 ? 3 : v >= 12 ? 2 : v >= 1 ? 1 : 0;
  $('dialog').classList.remove('hide');
  $('dlgTitle').textContent = T('endTitle');
  $('dlgClose').textContent = T('again');
  $('dlgClose').onclick = () => {
    $('dialog').classList.add('hide');
    $('game').classList.add('hide');
    $('setup').classList.remove('hide');
    G = null;
    ch = null;
    $('pEquip').classList.add('hide');
    $('pStart').classList.add('hide');
    drawSetup();
  };
  $('dlgBody').innerHTML = '<p>' + T(G.over === 'captured' ? 'endCap' : 'endBack') + '</p><p>' + T('endScore', { v, k: G.kills, t: G.turn }) + '</p><p>' + T('rank', { r: T('rk_' + r) }) + '</p>';
}

// ===== 窓のドラッグ =====
function draggable(win, head) {
  let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
  head.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    on = true;
    const r = win.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    win.style.transform = 'none';
    win.style.left = ox + 'px';
    win.style.top = oy + 'px';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!on) return;
    win.style.left = (ox + e.clientX - sx) + 'px';
    win.style.top = (oy + e.clientY - sy) + 'px';
  });
  window.addEventListener('mouseup', () => { on = false; });
}
draggable($('combat'), $('cbHead'));
draggable($('dialog'), $('dlgHead'));

// ===== 操作の登録 =====
function setLang(l) {
  lang = l;
  try { localStorage.setItem('donkeyLang', l); } catch (e) { /* 無視 */ }
  drawSetup();
  if (G) { drawGame(); if (G.combat) drawCombat(); }
}
$('lang_ja').onclick = () => setLang('ja');
$('lang_en').onclick = () => setLang('en');
$('langBtn').onclick = () => setLang(lang === 'ja' ? 'en' : 'ja');
$('btnRoll').onclick = () => { rollCharacter(); drawSetup(); };
$('btnAuto').onclick = () => { autoEquip(); drawEquipPick(); };
$('btnStart').onclick = startGame;
$('btnRules1').onclick = openRules;
$('btnRules2').onclick = openRules;
$('btnZp').onclick = () => { zoom = Math.min(96, zoom + 8); drawGame(); };
$('btnZm').onclick = () => { zoom = Math.max(32, zoom - 8); drawGame(); };
$('mvN').onclick = () => move('n');
$('mvS').onclick = () => move('s');
$('mvE').onclick = () => move('e');
$('mvW').onclick = () => move('w');
window.addEventListener('keydown', e => {
  if (!G || G.over || G.combat) return;
  const k = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e' }[e.key];
  if (k && !$('dialog').classList.contains('hide')) return;
  if (k) { e.preventDefault(); move(k); }
});

// ===== ブラウザの戻るを無効にする =====
history.pushState({ dc: 1 }, '', location.href);
window.addEventListener('popstate', () => { history.pushState({ dc: 1 }, '', location.href); });
window.addEventListener('beforeunload', e => {
  if (G && !G.over) { e.preventDefault(); e.returnValue = ''; }
});

drawSetup();
window.__dc = { get G() { return G; }, get ch() { return ch; }, getEdge, cell };
})();
