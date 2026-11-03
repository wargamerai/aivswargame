// スタートリック 画面の処理
(function () {
'use strict';
const ST = window.StarTrick;
const $ = id => document.getElementById(id);
const C = { lang: 'ja', mode: 'classic', diff: 'normal' };
try {
  const l = localStorage.getItem('trickLang');
  if (l === 'ja' || l === 'en') C.lang = l;
  else if (!/^ja/i.test(navigator.language || 'ja')) C.lang = 'en';
} catch (e) { /* 保存できなくても動く */ }

let G = null;           // ゲーム
let LOG = [];           // 結果欄の内容（言語を切り替えられるようキーで持つ）
let pending = null;     // 昔のまんまモードの入力待ち
let view = { srs: null, gal: false, lrs: null };   // 昔のまんまモードで最後に命令した表示
let helpPage = 0;
let form = null;        // 親切モードの入力欄
let target = null;      // 初心者モードの目標
let inGame = false;

function T(k, p) {
  let s = window.TRICK_TEXT[C.lang][k];
  if (s === undefined) return k;
  if (p) for (const n in p) {
    const v = n === 'd' && window.TRICK_TEXT[C.lang]['dev_' + p[n]] ? window.TRICK_TEXT[C.lang]['dev_' + p[n]] : p[n];
    s = s.split('{' + n + '}').join(v);
  }
  return s;
}
const fmt = c => (Math.round(c * 100) / 100).toString();
const isClassic = () => C.mode === 'classic';
const isBeginner = () => C.mode === 'beginner';

// ===== ブラウザの戻るを無効にする =====
history.pushState({ trick: 1 }, '', location.href);
window.addEventListener('popstate', () => { history.pushState({ trick: 1 }, '', location.href); });
window.addEventListener('beforeunload', e => {
  if (inGame && G && !G.over) { e.preventDefault(); e.returnValue = ''; }
});

// ===== ズーム =====
let zoom = 1;
try { const z = +localStorage.getItem('trickZoom'); if (z >= 0.7 && z <= 2) zoom = z; } catch (e) { /* 無視 */ }
function applyZoom() {
  const g = $('game');
  g.style.zoom = zoom;
  g.style.height = (100 / zoom) + 'vh';
  try { localStorage.setItem('trickZoom', String(zoom)); } catch (e) { /* 無視 */ }
}
$('zoomIn').onclick = () => { zoom = Math.min(2, Math.round((zoom + 0.1) * 10) / 10); applyZoom(); $('cmd').focus(); };
$('zoomOut').onclick = () => { zoom = Math.max(0.7, Math.round((zoom - 0.1) * 10) / 10); applyZoom(); $('cmd').focus(); };
applyZoom();

// ===== タイトル =====
function drawTitle() {
  document.documentElement.lang = C.lang;
  document.title = T('title');
  $('tTitle').textContent = T('title');
  $('tSub').textContent = T('subtitle');
  $('lLang').textContent = T('langLabel');
  $('lMode').textContent = T('modeLabel');
  $('lDiff').textContent = T('diffLabel');
  $('btnStart').textContent = T('start');
  $('toTop').textContent = T('backTop');
  $('lang_ja').classList.toggle('on', C.lang === 'ja');
  $('lang_en').classList.toggle('on', C.lang === 'en');
  $('modeBtns').innerHTML = '';
  ['classic', 'kind', 'beginner'].forEach(m => {
    const b = document.createElement('button');
    b.textContent = T('mode_' + m);
    b.className = C.mode === m ? 'on' : '';
    b.style.marginRight = '4px';
    b.onclick = () => { C.mode = m; drawTitle(); };
    $('modeBtns').appendChild(b);
  });
  $('modeDesc').textContent = T('mode_' + C.mode + '_d');
  $('diffBtns').innerHTML = '';
  ['easy', 'normal', 'hard', 'veryhard'].forEach(d => {
    const b = document.createElement('button');
    b.textContent = T('diff_' + d);
    b.className = C.diff === d ? 'on' : '';
    b.style.marginRight = '4px';
    b.onclick = () => { C.diff = d; drawTitle(); };
    $('diffBtns').appendChild(b);
  });
  const P = ST.DIFFICULTY[C.diff];
  $('diffDesc').textContent = T('diffInfo', { k: P.k, b: P.b, d: String(P.days) });
}
function setLang(l) {
  C.lang = l;
  try { localStorage.setItem('trickLang', l); } catch (e) { /* 無視 */ }
  drawTitle();
  if (inGame) drawGame();
}
$('lang_ja').onclick = () => setLang('ja');
$('lang_en').onclick = () => setLang('en');

// ===== 冒頭の文字送り =====
let crawlTimer = null;
function startCrawl() {
  $('title').classList.add('hide');
  $('crawl').classList.remove('hide');
  $('crawlSkip').textContent = T('skip');
  const txt = $('crawlText');
  txt.style.animation = 'none';
  void txt.offsetWidth;
  txt.style.animation = '';
  crawlTimer = setTimeout(endCrawl, 26500);
  window.addEventListener('keydown', crawlKey);
}
function crawlKey(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') endCrawl(); }
function endCrawl() {
  if ($('crawl').classList.contains('hide')) return;
  clearTimeout(crawlTimer);
  window.removeEventListener('keydown', crawlKey);
  $('crawl').classList.add('hide');
  newGame();
}
$('crawl').onclick = endCrawl;
$('btnStart').onclick = startCrawl;

// ===== ゲーム開始 =====
function newGame() {
  G = new ST.Game({ difficulty: C.diff });
  LOG = [];
  pending = null;
  form = null;
  target = null;
  inGame = true;
  view = { srs: snapshotSrs(), gal: false, lrs: null };
  $('game').classList.remove('hide');
  $('endBar').classList.add('hide');
  $('side').classList.toggle('hide', isClassic());
  flush();
  drawGame();
  $('cmd').focus();
}
$('btnAgain').onclick = () => { $('title').classList.remove('hide'); $('game').classList.add('hide'); inGame = false; drawTitle(); };

function snapshotSrs() {
  if (!G.srsAvailable()) return null;
  return { rows: G.sector.map(r => r.slice()) };
}

function flush() {
  G.drain().forEach(m => LOG.push({ m }));
  if (isClassic() || true) view.srs = (isClassic() ? view.srs : snapshotSrs());
}

// ===== 描画 =====
function logLine(kind, text) { LOG.push({ kind, text }); }

function drawLog() {
  const el = $('log');
  el.innerHTML = '';
  LOG.forEach(e => {
    const d = document.createElement('div');
    if (e.m) {
      d.textContent = T(e.m.k, e.m.p);
      if (e.m.k.indexOf('end_') === 0 || e.m.k === 'torBase') d.className = 'bad';
    } else if (e.key) {
      d.textContent = T(e.key, e.p);
    } else {
      d.textContent = e.text;
      if (e.kind === 'ech') d.className = 'ech';
    }
    el.appendChild(d);
  });
  el.scrollTop = el.scrollHeight;
}

function cellText(c) {
  if (c === 'E') return '<span class="e">&lt;*&gt;</span>';
  if (c === 'K') return '<span class="k">+K+</span>';
  if (c === 'B') return '<span class="b">&gt;!&lt;</span>';
  if (c === '*') return ' * ';
  return ' . ';
}

function pathCells() {
  // 初心者モードで、選んだ目標までの通り道を返す
  if (!isBeginner() || !form || !target || !target.sector) return { path: [], block: null };
  const c = ST.courseTo(target.x - G.sx, target.y - G.sy);
  if (c == null) return { path: [], block: null };
  const p = G.torpedoPath(c);
  const stop = p.cells.findIndex(q => q[0] === target.x && q[1] === target.y);
  const cells = stop >= 0 ? p.cells.slice(0, stop + 1) : p.cells;
  const last = cells[cells.length - 1];
  const hit = p.hit && last && p.x === last[0] && p.y === last[1] && !(form.cmd === 'tor' && p.hit === 'K');
  return { path: cells, block: hit ? last : null };
}

function drawSrs() {
  const el = $('srs');
  const data = isClassic() ? view.srs : snapshotSrs();
  if (!data) {
    el.innerHTML = '<pre>' + T(isClassic() ? 'notScanned' : 'srsDown', { c: 'SRS' }) + '</pre>';
    return;
  }
  const pc = pathCells();
  const pk = new Set(pc.path.map(q => q[0] + ',' + q[1]));
  let h = '<table class="' + (isClassic() ? '' : 'clickable') + '"><tr><td class="h"></td>';
  for (let x = 1; x <= 8; x++) h += '<td class="h">' + x + '</td>';
  h += '</tr>';
  data.rows.forEach((row, y) => {
    h += '<tr><td class="h">' + (y + 1) + '&nbsp;</td>';
    row.forEach((c, x) => {
      let cls = 'c';
      if (pk.has(x + ',' + y)) cls += ' path';
      if (pc.block && pc.block[0] === x && pc.block[1] === y) cls += ' block';
      if (target && target.sector && target.x === x && target.y === y) cls += ' tgt';
      h += '<td class="' + cls + '" data-sx="' + x + '" data-sy="' + y + '">' + cellText(c) + '</td>';
    });
    h += '</tr>';
  });
  el.innerHTML = h + '</table>';
  if (!isClassic()) {
    el.querySelectorAll('td.c').forEach(td => {
      td.onclick = () => pickSector(+td.dataset.sx, +td.dataset.sy);
    });
  }
}

function drawGal() {
  const el = $('gal');
  if (isClassic() && !view.gal) {
    el.innerHTML = '<pre>' + T('notScanned', { c: 'COM 0' }) + '</pre>';
    return;
  }
  const n = G.size;
  let h = '<table class="' + (isClassic() ? '' : 'clickable') + '"><tr><td class="h"></td>';
  for (let x = 1; x <= n; x++) h += '<td class="h">' + x + '</td>';
  h += '</tr>';
  for (let y = 0; y < n; y++) {
    h += '<tr><td class="h">' + (y + 1) + '&nbsp;</td>';
    for (let x = 0; x < n; x++) {
      const known = G.known[y][x];
      const cur = x === G.qx && y === G.qy;
      let txt = '***', cls = 'q';
      if (known) {
        const q = G.gal[y][x];
        txt = '' + q.k + q.b + q.s;
        if (q.k > 0) txt = '<span class="k">' + q.k + '</span>' + q.b + q.s;
        else if (q.b > 0) txt = q.k + '<span class="b">' + q.b + '</span>' + q.s;
      } else cls += ' unk';
      if (cur) cls += ' cur';
      if (target && !target.sector && target.qx === x && target.qy === y) cls += ' tgt';
      h += '<td class="' + cls + '" data-qx="' + x + '" data-qy="' + y + '">' + (cur ? '[' + txt + ']' : txt) + '</td>';
    }
    h += '</tr>';
  }
  el.innerHTML = h + '</table>';
  if (!isClassic()) {
    el.querySelectorAll('td.q').forEach(td => {
      td.onclick = () => pickQuadrant(+td.dataset.qx, +td.dataset.qy);
    });
  }
}

function drawStatus() {
  const cond = G.condition();
  const rows = [
    ['st_date', G.date.toFixed(1)],
    ['st_left', Math.max(0, G.daysLeft()).toFixed(1)],
    ['st_cond', T('cond_' + cond), cond === 'red' ? 'red' : cond === 'yellow' ? 'yel' : ''],
    ['st_quad', (G.qx + 1) + ',' + (G.qy + 1)],
    ['st_sect', (G.sx + 1) + ',' + (G.sy + 1)],
    ['st_energy', Math.floor(G.energy)],
    ['st_shield', Math.max(0, Math.floor(G.shields)), G.shields <= 200 && G.live().length ? 'red' : ''],
    ['st_torp', G.torps],
    ['st_klingon', G.totalK],
    ['st_base', G.totalB],
  ];
  $('status').innerHTML = rows.map(r => '<div>' + T(r[0]) + ': <span class="v ' + (r[2] || '') + '">' + r[1] + '</span></div>').join('');
}

function drawHelp() {
  const tabs = T('help_tabs');
  $('helpTabs').innerHTML = '';
  tabs.forEach((t, i) => {
    const b = document.createElement('button');
    b.textContent = t;
    b.className = i === helpPage ? 'on' : '';
    b.onclick = () => { helpPage = i; drawHelp(); $('cmd').focus(); };
    $('helpTabs').appendChild(b);
  });
  $('helpBody').textContent = T('help_pages')[helpPage];
}

function drawGame() {
  document.title = T('title');
  $('hSrs').textContent = T('shortMap');
  $('hStatus').textContent = T('status');
  $('hGal').textContent = T('galaxyMap');
  $('hHelp').textContent = T('help');
  $('legend').textContent = T('legend');
  $('legendG').textContent = T('legendG');
  $('btnAgain').textContent = T('newGame');
  $('prompt').textContent = pending ? T(pending.prompt) : T('prompt');
  drawSrs();
  drawGal();
  drawStatus();
  drawHelp();
  drawLog();
  if (!isClassic()) drawSide();
  if (G.over) {
    $('endBar').classList.remove('hide');
    $('inputline').classList.add('hide');
  } else {
    $('inputline').classList.remove('hide');
  }
}

// ===== コマンドの実行 =====
function afterAction() {
  const qWas = view._q;
  flush();
  if (isClassic()) {
    // 移動の後の短距離スキャンは当時のゲームと同じく自動で出る
    if (G.srsAvailable()) view.srs = snapshotSrs();
  }
  view._q = G.qx + ',' + G.qy;
  if (qWas !== view._q) target = null;
  drawGame();
  if (!G.over) $('cmd').focus();
}

function doNav(c, w) { G.nav(c, w); form = null; target = null; afterAction(); }
function doTor(c) { G.torpedo(c); form = null; target = null; afterAction(); }
function doPha(x) { G.phaser(x); form = null; afterAction(); }
function doShe(x) { G.setShields(x); form = null; afterAction(); }

function doSrs() {
  if (G.srsAvailable()) view.srs = snapshotSrs();
  else logLine('', T('srsDown'));
  afterAction();
}
function doLrs() {
  const rows = G.lrs();
  if (rows) {
    rows.forEach(r => logLine('', ': ' + r.map(v => v === null ? '***' : String(v).padStart(3, '0')).join(' : ') + ' :'));
    view.lrs = rows;
  }
  afterAction();
}
function doDam() {
  if (G.broken('dam')) logLine('', T('damDown'));
  else ST.DEVICES.forEach(d => {
    const v = G.damage[d];
    const dn = T('dev_' + d);
    logLine('', dn.padEnd(C.lang === 'ja' ? 10 : 22, C.lang === 'ja' ? '　' : ' ') + (v < 0 ? T('dam_bad', { n: (-v).toFixed(1) }) : T('dam_ok')));
  });
  afterAction();
}
function doCom(n, a) {
  if (G.broken('com')) { logLine('', T('comDown')); afterAction(); return; }
  if (n === 0) {
    view.gal = true;
  } else if (n === 1) {
    logLine('', T('com1_text', { k: G.totalK, b: G.totalB, d: Math.max(0, G.daysLeft()).toFixed(1), e: Math.floor(G.energy), t: G.torps }));
  } else if (n === 2) {
    const live = G.live();
    if (!live.length) logLine('', T('com2_none'));
    live.forEach(k => {
      logLine('', T('com2_row', { x: k.x + 1, y: k.y + 1, c: fmt(ST.courseTo(k.x - G.sx, k.y - G.sy)), d: Math.max(Math.abs(k.x - G.sx), Math.abs(k.y - G.sy)) }));
    });
  } else if (n === 3) {
    let any = false;
    for (let y = 0; y < G.size; y++) for (let x = 0; x < G.size; x++) {
      if (!G.known[y][x] || !G.gal[y][x].b) continue;
      any = true;
      if (x === G.qx && y === G.qy) {
        for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) if (G.sector[sy][sx] === 'B') {
          logLine('', T('com3_row', { x: sx + 1, y: sy + 1, c: fmt(ST.courseTo(sx - G.sx, sy - G.sy)), d: Math.max(Math.abs(sx - G.sx), Math.abs(sy - G.sy)) }));
        }
      } else {
        const q = quadCourse(x, y);
        logLine('', T('com3_rowQ', { x: x + 1, y: y + 1, c: fmt(q.c), w: fmt(q.w) }));
      }
    }
    if (!any) logLine('', T('com3_none'));
  } else if (n === 4 && a && a.length >= 4) {
    const dx = a[2] - a[0], dy = a[3] - a[1];
    const c = ST.courseTo(dx, dy);
    if (c == null) logLine('', T('badAmount'));
    else logLine('', T('com4_row', { c: fmt(c), w: fmt(Math.max(Math.abs(dx), Math.abs(dy))) }));
  } else {
    logLine('', T('badAmount'));
  }
  afterAction();
}

function quadCourse(x, y) {
  // 目標クワドラントの中央付近へ行くコースとワープ
  const dx = x * 8 + 3 - (G.qx * 8 + G.sx), dy = y * 8 + 3 - (G.qy * 8 + G.sy);
  return { c: ST.courseTo(dx, dy) || 1, w: Math.min(8, Math.max(Math.abs(dx), Math.abs(dy)) / 8) };
}

// ===== 文字入力 =====
const LANG_ALIASES = { '?': 'HELP' };
// ワープの入力。2m と打つと 2 マス分になる
function parseWarp(s) {
  s = String(s).toUpperCase();
  return /M$/.test(s) ? parseFloat(s) / 8 : parseFloat(s);
}
function processLine(line) {
  const raw = line.trim();
  logLine('ech', (pending ? T(pending.prompt) : T('prompt')) + ' ' + raw);
  if (G.over) { LOG.push({ key: 'needGame' }); drawGame(); return; }
  if (pending) {
    const fn = pending.fn;
    pending = null;
    fn(raw.split(/[\s,]+/).filter(s => s.length));
    drawGame();
    return;
  }
  const parts = raw.toUpperCase().split(/[\s,]+/).filter(s => s.length);
  if (!parts.length) { drawGame(); return; }
  const cmd = LANG_ALIASES[parts[0]] || parts[0];
  const a = parts.slice(1).map(parseFloat);
  switch (cmd) {
    case 'NAV':
      if (a.length >= 2) doNav(a[0], parseWarp(parts[2]));
      else if (a.length === 1) ask('p_warp', v => doNav(a[0], parseWarp(v[0])));
      else ask('p_course', v => {
        const c = parseFloat(v[0]);
        if (v.length >= 2) doNav(c, parseWarp(v[1]));
        else ask('p_warp', w => doNav(c, parseWarp(w[0])));
      });
      break;
    case 'M':   // M コース マス数
      if (a.length >= 2) doNav(a[0], a[1] / 8);
      else if (a.length === 1) ask('p_sectors', v => doNav(a[0], parseFloat(v[0]) / 8));
      else ask('p_course', v => {
        const c = parseFloat(v[0]);
        if (v.length >= 2) doNav(c, parseFloat(v[1]) / 8);
        else ask('p_sectors', w => doNav(c, parseFloat(w[0]) / 8));
      });
      break;
    case 'TOR':
      if (a.length) doTor(a[0]); else ask('p_course', v => doTor(parseFloat(v[0])));
      break;
    case 'PHA':
      if (a.length) doPha(a[0]); else ask('p_energy', v => doPha(parseFloat(v[0])));
      break;
    case 'SHE':
      if (a.length) doShe(a[0]); else ask('p_shield', v => doShe(parseFloat(v[0])));
      break;
    case 'SRS': doSrs(); break;
    case 'LRS': doLrs(); break;
    case 'DAM': doDam(); break;
    case 'COM':
      if (a.length) {
        if (a[0] === 4 && a.length < 5) ask('p_com4', v => doCom(4, v.map(parseFloat)));
        else doCom(a[0], a.slice(1));
      } else {
        logLine('', '0: ' + T('com0') + '  1: ' + T('com1') + '  2: ' + T('com2') + '  3: ' + T('com3') + '  4: ' + T('com4'));
        ask('p_com', v => {
          const n = parseInt(v[0], 10);
          if (n === 4) ask('p_com4', w => doCom(4, w.map(parseFloat)));
          else doCom(n);
        });
      }
      break;
    case 'XXX': G.finish('quit'); afterAction(); break;
    case 'HELP': LOG.push({ key: 'help_list' }); helpPage = 3; drawGame(); break;
    default: LOG.push({ key: 'badCommand', p: { c: parts[0] } }); drawGame();
  }
}
function ask(prompt, fn) { pending = { prompt, fn }; drawGame(); }
$('cmd').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const v = $('cmd').value;
  $('cmd').value = '';
  processLine(v);
});

// ===== 親切モードと初心者モード =====
const CMDS = ['nav', 'srs', 'lrs', 'pha', 'tor', 'she', 'dam', 'com', 'xxx'];

function advice() {
  if (!isBeginner() || G.over) return '';
  const live = G.live();
  const total = G.energy + G.shields;
  if (live.length && !G.docked) {
    const est = volley();
    if (G.shields < est * 1.5) return T('adv_shield');
    return T('adv_attack');
  }
  if ((total < 1000 || G.torps <= 2) && !G.docked) return T('adv_refuel');
  // 周囲に未調査があれば LRS を勧める
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = G.qx + dx, y = G.qy + dy;
    if (x >= 0 && x < G.size && y >= 0 && y < G.size && !G.known[y][x] && !G.broken('lrs')) return T('adv_lrs');
  }
  for (let y = 0; y < G.size; y++) for (let x = 0; x < G.size; x++) {
    if (G.known[y][x] && G.gal[y][x].k > 0) return T('adv_go');
  }
  return T('adv_explore');
}
function volley() {
  return Math.ceil(G.live().reduce((t, k) => t + k.e / G.dist(k) * 3, 0));
}

function drawSide() {
  $('advice').textContent = advice();
  const box = $('cmdBtns');
  box.innerHTML = '';
  CMDS.forEach(c => {
    const b = document.createElement('button');
    b.textContent = T('cmd_' + c);
    if (form && form.cmd === c) b.className = 'on';
    b.disabled = !!G.over;
    b.onclick = () => clickCmd(c);
    box.appendChild(b);
  });
  drawForm();
}

function clickCmd(c) {
  logCommandEcho(c);
  target = null;
  if (c === 'srs') { form = null; doSrs(); return; }
  if (c === 'lrs') { form = null; doLrs(); return; }
  if (c === 'dam') { form = null; doDam(); return; }
  if (c === 'xxx') { form = null; G.finish('quit'); afterAction(); return; }
  if (c === 'nav') form = { cmd: 'nav', course: 1, warp: 1 };
  if (c === 'tor') form = { cmd: 'tor', course: 1 };
  if (c === 'pha') form = { cmd: 'pha', amount: Math.min(Math.floor(G.energy), isBeginner() ? phaserNeed() : 500) };
  if (c === 'she') form = { cmd: 'she', amount: Math.max(0, Math.floor(G.shields)) };
  if (c === 'com') form = { cmd: 'com' };
  drawGame();
}
function logCommandEcho() { /* 親切モードでは実行した時だけ結果を出す */ }

function phaserNeed() {
  const live = G.live();
  if (!live.length) return 100;
  return Math.ceil(live.reduce((t, k) => t + k.e * G.dist(k) * 0.5 * live.length, 0) * 1.1);
}

function dialHtml() {
  // 画面の向きと同じ並び
  const lay = [4, 3, 2, 5, 0, 1, 6, 7, 8];
  return '<div id="dial">' + lay.map(n => n === 0 ? '<span>&lt;*&gt;</span>' : '<button data-c="' + n + '" class="' + (form && Math.floor(form.course) === n ? 'on' : '') + '">' + n + '</button>').join('') + '</div>';
}

function drawForm() {
  const el = $('form');
  const hp = $('helper');
  hp.innerHTML = '';
  if (!form) { el.innerHTML = ''; return; }
  if (form.cmd === 'nav') {
    el.innerHTML = '<label>' + T('course') + ' <input type="number" id="fC" min="1" max="8.99" step="0.01" value="' + fmt(form.course) + '"></label>' + dialHtml()
      + '<label>' + T('warp') + ' <input type="number" id="fW" min="0.125" max="8" step="0.125" value="' + fmt(form.warp) + '"></label>'
      + '<input type="range" id="fWr" min="0.125" max="8" step="0.125" value="' + form.warp + '">'
      + '<div id="warpBtns">' + [1, 2, 3, 4, 5, 6, 7].map(n => '<button data-w="' + (n / 8) + '" style="padding:1px 5px;margin:1px">' + T('sectorsBtn', { n }) + '</button>').join('')
      + [1, 2, 3, 4, 6, 8].map(n => '<button data-w="' + n + '" style="padding:1px 5px;margin:1px">W' + n + '</button>').join('') + '</div>'
      + '<div id="formInfo"></div><button id="fRun">' + T('run') + '</button> <button id="fCan">' + T('cancel') + '</button>';
    bindDial();
    const upd = () => {
      const w = parseFloat($('fW').value) || 0;
      const n = Math.round(w * 8);
      $('formInfo').textContent = T('warpInfo', { n, e: n + 10, t: w >= 1 ? 1 : (Math.floor(w * 10) * 0.1).toFixed(1) });
    };
    $('fC').oninput = () => { form.course = parseFloat($('fC').value) || 1; };
    $('fW').oninput = () => { form.warp = parseFloat($('fW').value) || 0; $('fWr').value = form.warp; upd(); };
    $('fWr').oninput = () => { form.warp = parseFloat($('fWr').value); $('fW').value = form.warp; upd(); };
    $('warpBtns').querySelectorAll('button').forEach(b => {
      b.onclick = () => { form.warp = +b.dataset.w; $('fW').value = form.warp; $('fWr').value = form.warp; upd(); };
    });
    upd();
    $('fRun').onclick = () => doNav(parseFloat($('fC').value), parseFloat($('fW').value));
    $('fCan').onclick = () => { form = null; target = null; drawGame(); };
    if (isBeginner()) helperNav(hp);
  } else if (form.cmd === 'tor') {
    el.innerHTML = '<label>' + T('course') + ' <input type="number" id="fC" min="1" max="8.99" step="0.01" value="' + fmt(form.course) + '"></label>' + dialHtml()
      + '<button id="fRun">' + T('run') + '</button> <button id="fCan">' + T('cancel') + '</button>';
    bindDial();
    $('fC').oninput = () => { form.course = parseFloat($('fC').value) || 1; };
    $('fRun').onclick = () => doTor(parseFloat($('fC').value));
    $('fCan').onclick = () => { form = null; target = null; drawGame(); };
    if (isBeginner()) helperTor(hp);
  } else if (form.cmd === 'pha' || form.cmd === 'she') {
    const max = form.cmd === 'pha' ? Math.floor(G.energy) : Math.floor(G.energy + Math.max(0, G.shields));
    el.innerHTML = '<label>' + T(form.cmd === 'pha' ? 'energy' : 'cmd_she') + ' <input type="number" id="fA" min="0" max="' + max + '" step="10" value="' + form.amount + '"></label>'
      + '<input type="range" id="fAr" min="0" max="' + max + '" step="10" value="' + form.amount + '">'
      + '<div style="margin-top:4px"><button id="fRun">' + T('run') + '</button> <button id="fCan">' + T('cancel') + '</button></div>';
    $('fA').oninput = () => { form.amount = parseFloat($('fA').value) || 0; $('fAr').value = form.amount; };
    $('fAr').oninput = () => { form.amount = parseFloat($('fAr').value); $('fA').value = form.amount; };
    $('fRun').onclick = () => (form.cmd === 'pha' ? doPha : doShe)(parseFloat($('fA').value));
    $('fCan').onclick = () => { form = null; drawGame(); };
    if (isBeginner()) helperAmount(hp);
  } else if (form.cmd === 'com') {
    el.innerHTML = [0, 1, 2, 3].map(n => '<button data-com="' + n + '" style="margin:0 3px 3px 0">' + n + ': ' + T('com' + n) + '</button>').join('')
      + '<div><button id="fCan">' + T('cancel') + '</button></div>';
    el.querySelectorAll('[data-com]').forEach(b => { b.onclick = () => { form = null; doCom(+b.dataset.com); }; });
    $('fCan').onclick = () => { form = null; drawGame(); };
  }
}

function bindDial() {
  $('dial').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      form.course = +b.dataset.c;
      target = null;
      drawGame();
    };
  });
}

function helperNav(hp) {
  let h = T('bg_nav');
  if (target && target.sector) {
    const c = form.course;
    const d = Math.max(Math.abs(target.x - G.sx), Math.abs(target.y - G.sy));
    h += '\n\n' + T('bg_target', { x: target.x + 1, y: target.y + 1, c: fmt(c), d });
    const p = pathCells();
    if (p.block) {
      const b = G.sector[p.block[1]][p.block[0]];
      h += '\n' + T('bg_path_block', { x: p.block[0] + 1, y: p.block[1] + 1, t: T(b === '*' ? 'star' : b === 'B' ? 'base' : 'klingon') });
    } else {
      h += '\n' + T('bg_path_ok');
    }
  } else if (target) {
    h += '\n\n' + T('bg_targetQ', { x: target.qx + 1, y: target.qy + 1, c: fmt(form.course), w: fmt(form.warp) });
  }
  hp.textContent = h;
}

function helperTor(hp) {
  hp.textContent = T('bg_tor');
  G.live().forEach(k => {
    const c = ST.courseTo(k.x - G.sx, k.y - G.sy);
    if (c == null) return;
    const p = G.torpedoPath(c);
    const ok = p.hit === 'K' && p.x === k.x && p.y === k.y;
    const s = ok ? T('bg_tor_ok') : T('bg_tor_block', { t: T(p.hit === '*' ? 'star' : p.hit === 'B' ? 'base' : p.hit === 'K' ? 'klingon' : 'star') });
    const d = document.createElement('div');
    d.className = 'row2';
    const sp = document.createElement('span');
    sp.textContent = T('bg_tor_row', { x: k.x + 1, y: k.y + 1, c: fmt(c), s });
    const b = document.createElement('button');
    b.textContent = T('bg_fire');
    b.onclick = () => doTor(c);
    d.appendChild(sp);
    d.appendChild(b);
    hp.appendChild(d);
  });
}

function helperAmount(hp) {
  const pha = form.cmd === 'pha';
  const n = pha ? phaserNeed() : volley();
  const rec = pha ? n : n * 2;
  const msg = pha ? T('bg_pha', { n }) : T('bg_she', { n, r: rec });
  hp.textContent = msg;
  const b = document.createElement('button');
  b.textContent = T('bg_use') + ' (' + rec + ')';
  b.style.display = 'block';
  b.style.marginTop = '4px';
  b.onclick = () => {
    form.amount = Math.min(rec, Math.floor(pha ? G.energy : G.energy + Math.max(0, G.shields)));
    drawGame();
  };
  hp.appendChild(b);
}

function pickSector(x, y) {
  if (G.over) return;
  if (!form || (form.cmd !== 'nav' && form.cmd !== 'tor')) {
    if (!isBeginner()) return;
    form = { cmd: 'nav', course: 1, warp: 1 };
  }
  if (!isBeginner()) return;
  const c = ST.courseTo(x - G.sx, y - G.sy);
  if (c == null) return;
  target = { sector: true, x, y };
  form.course = Math.round(c * 1000) / 1000;
  if (form.cmd === 'nav') form.warp = Math.max(Math.abs(x - G.sx), Math.abs(y - G.sy)) / 8;
  drawGame();
}

function pickQuadrant(x, y) {
  if (G.over || !isBeginner()) return;
  if (x === G.qx && y === G.qy) return;
  form = { cmd: 'nav', course: 1, warp: 1 };
  const q = quadCourse(x, y);
  target = { sector: false, qx: x, qy: y };
  form.course = Math.round(q.c * 1000) / 1000;
  form.warp = q.w;
  drawGame();
}

drawTitle();
})();
