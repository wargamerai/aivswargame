// コルベット・コマンド — ゲームの進行（文字の選択肢で遊ぶ）
'use strict';

// ===================== 状態と保存 =====================
let S = null;                       // ゲームの状態（これを保存する）
const SAVE_KEY = 'cc_save_v1';
class GameOver extends Error { constructor(why) { super(why); this.why = why; } }

function saveLocal() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function loadLocal() { try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

// ===================== ダイス =====================
const rnd = n => 1 + Math.floor(Math.random() * n);
const d6 = () => rnd(6);
const d3 = () => Math.ceil(d6() / 2);
const d66 = () => d6() * 10 + d6();
const sum = a => a.reduce((x, y) => x + y, 0);
const pick = a => a[Math.floor(Math.random() * a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// d66 は 6進法（11〜66）。修整を足す時は 6進法で数える（5.1 注意）
function d66Add(v, mod) {
  let i = (Math.floor(v / 10) - 1) * 6 + (v % 10 - 1) + mod;
  i = Math.max(0, Math.min(35, i));
  return (Math.floor(i / 6) + 1) * 10 + (i % 6) + 1;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ===================== 日付 =====================
const MONTH_LEN = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function monthNum(dt) { dt = dt || S.date; return dt.y * 12 + dt.m; }
function dateBefore(y, m, d) { const t = S.date; return t.y * 10000 + t.m * 100 + t.d < y * 10000 + m * 100 + d; }
function fmtDate(dt) { dt = dt || S.date; const d = Math.floor(dt.d); return L(`${dt.y}年${dt.m}月${d}日${dt.d - d >= 0.5 ? '（半日）' : ''}`, `${ST_fill(I18N_X('date', '{d} {M} {y}'), { d, M: I18N_X('months', MONTH_EN)[dt.m], y: dt.y, m: dt.m })}${dt.d - d >= 0.5 ? L('', I18N_X('halfDay', ' (half day)')) : ''}`); }
function advanceDays(n) {
  S.date.d += n;
  while (S.date.d >= MONTH_LEN[S.date.m] + 1) { S.date.d -= MONTH_LEN[S.date.m]; S.date.m++; if (S.date.m > 12) { S.date.m = 1; S.date.y++; } }
}
const from1942June = () => monthNum() >= 1942 * 12 + 6;

// ===================== 画面 =====================
const $ = id => document.getElementById(id);
const UI = {
  log(html, cls) {
    const line = { h: html, c: cls || '' };
    if (S) { (S.logLines || (S.logLines = [])).push(line); if (S.logLines.length > 600) S.logLines.splice(0, S.logLines.length - 600); }
    UI.addLine(line);
  },
  addLine(line) {
    const el = document.createElement('div');
    el.className = 'ln ' + line.c;
    el.innerHTML = line.h;
    $('log').appendChild(el);
    $('log').scrollTop = $('log').scrollHeight;
  },
  head(t) { UI.log(t, 'head'); },
  dice(t) { UI.log(t, 'dice'); },
  story(t) { if (t) UI.log(t, 'story'); },
  storyHid(t) { if (t) UI.log(t, 'story badev'); },   // 伏せるイベントの物語（伏せている間は出さない）
  big(t, kind) { UI.log(t, 'big ' + (kind || '')); },
  good(t) { UI.log(t, 'good'); },
  bad(t) { UI.log(t, 'bad'); },
  // 選択肢を出して、選ばれた値を返す。options: [{label, value, hint}]
  choose(prompt, options) {
    renderStatus();
    return new Promise(resolve => {
      const box = $('choices');
      box.innerHTML = '';
      if (prompt) { const p = document.createElement('div'); p.className = 'prompt'; p.innerHTML = prompt; box.appendChild(p); }
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.innerHTML = `<span class="k">${i + 1}</span> ${o.label}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}`;
        b.onclick = () => { box.innerHTML = ''; window.__choose = null; if (prompt) UI.log(`<span class="you">▶ ${o.label.replace(/<[^>]+>/g, '')}</span>`); resolve(o.value); };
        box.appendChild(b);
      });
      window.__choose = i => { const btn = box.querySelectorAll('button')[i]; if (btn) btn.click(); };
      $('log').scrollTop = $('log').scrollHeight;
    });
  },
  // 文字を入力してもらう（艦長の名前など）
  ask(prompt, placeholder) {
    renderStatus();
    return new Promise(resolve => {
      const box = $('choices');
      box.innerHTML = L(`<div class="prompt">${prompt}</div><div class="askrow"><input id="askInput" type="text" maxlength="24" placeholder="${placeholder || ''}"><button id="askOk">決定</button></div>`, `<div class="prompt">${prompt}</div><div class="askrow"><input id="askInput" type="text" maxlength="24" placeholder="${placeholder || ''}"><button id="askOk">OK</button></div>`);
      const inp = $('askInput');
      const done = () => { const v = inp.value.trim(); box.innerHTML = ''; UI.log(L(`<span class="you">▶ ${v ? v.replace(/</g, '&lt;') : '（名乗らない）'}</span>`, `<span class="you">▶ ${v ? v.replace(/</g, '&lt;') : '(no name given)'}</span>`)); resolve(v); };
      $('askOk').onclick = done;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      setTimeout(() => inp.focus(), 0);
    });
  },
  // 判定の前で必ず止める（1手ずつの設定に関係なく）
  async wait(label) { renderStatus(); await UI.choose('', [{ label: label || L('▶ 次へ', '▶ Next'), value: 1 }]); },
  // 1手ずつ止める（設定で切れる）
  async next(label) {
    if (!S.settings.step) { renderStatus(); return; }
    await UI.choose('', [{ label: label || L('▶ 次へ', '▶ Next'), value: 1 }]);
  },
};
document.addEventListener('keydown', e => {
  if (!window.__choose || e.target.tagName === 'INPUT') return;
  if (/^[1-9]$/.test(e.key)) { window.__choose(+e.key - 1); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' ') { const bs = $('choices').querySelectorAll('button'); if (bs.length === 1) { window.__choose(0); e.preventDefault(); } }
});

// 物語で報告している時は部下の言葉、そうでなければ説明の言葉を使う
const storyOn = () => !S || !S.settings || S.settings.story !== false;
const say = (plain, kind, v) => (storyOn() ? story(kind, v) : plain);

// ===================== 航海日誌 =====================
// 航海中の出来事を書き留める（任務が終わったら記録用紙 Form 33A 風のページにする）
function J(text, note, time) {
  const M = S.mission;
  if (!M) return;
  (M.journal || (M.journal = [])).push({ date: fmtDate(), time: time || (M.ub && M.ub.time) || '', text, note: note || '' });
}

// ===================== コルベット =====================
function newShipSkills() {
  // 3.1 6つの区画に 1d6、【6】ならスキル2、それ以外はスキル1
  const sk = {}; const rolls = [];
  ['gun4', 'aa', 'dc', 'asdic', 'watch', 'engine'].forEach(k => { const r = d6(); rolls.push(`${SECTION_NAME[k]}${r}`); sk[k] = r === 6 ? 2 : 1; });
  sk.radar = 1; sk.hfdf = 1;
  UI.dice(L(`乗員スキルの決定（1d6、6ならスキル2）: ${rolls.join('・')}`, `Crew skills (1d6, a 6 gives skill 2): ${rolls.join(' · ')}`));
  return sk;
}
function newShip(name, equipped) {
  return { name, skills: newShipSkills(), equipped: Object.assign({ radar: false, hh: false, hfdf: false }, equipped || {}),
    diff: {}, perm: {}, dmg: {}, hull: 0, dcLeft: 25, hhLeft: 15, trained: {}, dcKill: false, sick: null };
}
const SH = () => S.ship;
const skill = k => (k === 'hh' ? SH().skills.dc : SH().skills[k]) || 1;
const secDiff = k => (SH().diff[k] || 0) + (SH().perm[k] || 0);
const engineDamaged = () => !!SH().dmg.engine;
function hasSection(k) { return ['radar', 'hh', 'hfdf'].indexOf(k) < 0 || SH().equipped[k]; }

// ===================== 判定（A/P）=====================
// 成功で true。opt.sec: 練度向上の記録に使う区画。opt.mine: プレイヤー側の判定（失敗したら振り直しを聞く）。opt.theirs: 敵側の判定（成功したら振り直しを聞く）
// オプション「ダイスを自分で振る」: 判定の前に「ダイスを振る」ボタンを出し、押したら振る
async function roll(what) {
  if (!S || !S.settings || !S.settings.rollDice) return;
  await UI.choose('', [{ label: L(`🎲 ダイスを振る（${what}）`, `🎲 Roll the dice (${what})`), value: 1 }]);
}
async function check(label, A, P, opt) {
  opt = opt || {};
  A = clamp(A, 1, 10); P = clamp(P, 1, 10);
  const need = AP_TABLE[P - 1][A - 1];
  await roll(label);
  let r = d66(), ok = r <= need;
  if (!opt.quiet) UI.dice(L(`${label}: A${A}／P${P} → ${need}以下で成功　d66＝${r} → ${ok ? '<b>成功</b>' : '失敗'}`, `${label}: A${A}/P${P} → success on ${need} or less　d66=${r} → ${ok ? '<b>success</b>' : 'failure'}`));
  const bad = opt.theirs ? ok : !ok;
  if (bad && (opt.mine || opt.theirs)) {
    if (await offerReroll(label)) { await roll(label + L('（振り直し）', ' (re-roll)')); r = d66(); ok = r <= need; if (!opt.quiet) UI.dice(L(`（振り直し）${label}: d66＝${r} → ${ok ? '<b>成功</b>' : '失敗'}`, `(re-roll) ${label}: d66=${r} → ${ok ? '<b>success</b>' : 'failure'}`)); }
  }
  if (ok && opt.sec) SH().trained[opt.sec] = true;
  return ok;
}
// 幸運（14.1）・ラム酒（14.14）で振り直すか
async function offerReroll(label) {
  const T = S.mission.tokens;
  const seen = T.seen || (T.seen = {});
  const opts = [];
  if (T.luck) opts.push({ label: seen.luck ? L('「幸運」で振り直す', 'Re-roll with "Luck"') : L('「幸運」で振り直す（ランダム・イベントで得ていた幸運 14.1）', 'Re-roll with "Luck" (the luck gained from a random event, 14.1)'), value: 'luck' });
  if (T.rum && S.mission.weather === 0) opts.push({ label: seen.rum ? L('「ラム酒」で振り直す', 'Re-roll with "Rum"') : L('「ラム酒」で振り直す（天候が回復した。約束のラム酒で士気が上がる 14.14）', 'Re-roll with "Rum" (the weather has cleared; the promised rum lifts morale, 14.14)'), value: 'rum' });
  if (!opts.length) return false;
  opts.forEach(o => { seen[o.value] = true; });
  opts.push({ label: L('そのまま', 'Keep it'), value: null });
  const v = await UI.choose(L(`${label} の結果を振り直しますか？`, `Re-roll the result of ${label}?`), opts);
  if (!v) return false;
  T[v] = 0;
  return true;
}

// ===================== 地図と移動 =====================
const key = (r, c) => `${r},${c}`;
function cellAt(k) { if (PORT_POS[k]) return { port: k, r: PORT_POS[k][0], c: PORT_POS[k][1] }; const [r, c] = k.split(',').map(Number); return { r, c, t: MAP_ROWS[r] && MAP_ROWS[r][c] }; }
function sectorOf(k) {
  if (k === 'HX' || k === 'SC') return 'C';
  if (k === 'ON') return 'W';
  const t = cellAt(k).t;
  if (t === 'A20') return from1942June() ? 'C' : 'A';
  if (t === 'A30') return from1942June() ? 'W' : 'A';
  return t;
}
function routeOf() { const M = S.mission; return WA_ROUTES[M.orders][M.convoy.speed].map(([r, c]) => key(r, c)); }
function isWaRouteCell(k) { if (PORT_POS[k]) return false; const t = cellAt(k).t; return t === 'W'; }
function freeCell(r, c) {
  const t = MAP_ROWS[r] && MAP_ROWS[r][c];
  if (!t || t === 'HX' || t === 'SC' || t === 'ON' || t === 'W') return false;
  return true;
}
// 隣のマス（高速は縦横斜め、低速は縦横）。ウェスタン・アプローチは割り当て航路だけ
function neighbors(k) {
  const M = S.mission, fast = M.convoy.speed === 'fast';
  const route = routeOf();
  const out = [];
  const dirs = fast ? [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]] : [[-1,0],[1,0],[0,-1],[0,1]];
  if (k === 'ON') { out.push(route[route.length - 1]); return out; }
  const ri = route.indexOf(k);
  const cell = cellAt(k);
  if (ri >= 0) {
    out.push(ri + 1 < route.length ? route[ri + 1] : 'ON');
    if (ri > 0) out.push(route[ri - 1]);
    else dirs.forEach(([dr, dc]) => { const r = cell.r + dr, c = cell.c + dc; if (freeCell(r, c)) out.push(key(r, c)); });
    return out;
  }
  dirs.forEach(([dr, dc]) => {
    const r = cell.r + dr, c = cell.c + dc;
    const t = MAP_ROWS[r] && MAP_ROWS[r][c];
    if (!t) return;
    if (t === 'HX' || t === 'SC') out.push(t);
    else if (t === 'W') { if (key(r, c) === route[0]) out.push(key(r, c)); }
    else if (t !== 'ON') out.push(key(r, c));
  });
  return out;
}
// 目的地までのマス数（経路の長さ）。目的地以外の港は通れない
function distances() {
  const M = S.mission, dest = M.convoy.to;
  const dist = { [dest]: 0 }, q = [dest];
  while (q.length) {
    const k = q.shift();
    neighbors(k).forEach(n => {
      if (dist[n] != null) return;
      if (PORT_POS[n] && n !== M.convoy.from && n !== dest) return;
      if (!neighbors(n).includes(k)) return;
      dist[n] = dist[k] + 1; q.push(n);
    });
  }
  return dist;
}
function placeName(k) {
  if (PORT_POS[k]) return PORT_NAME[k];
  const c = cellAt(k);
  return L(`${SECTOR_NAME[sectorOf(k)]}（${'ABCD'[c.r]}${c.c}）`, `${SECTOR_NAME[sectorOf(k)]} (${'ABCD'[c.r]}${c.c})`);
}

// ===================== 任務の準備（3.0 / 11.5）=====================
function eqDate(k) { return EQUIP_DATE[k] + (S.camp.equipShift || 0); }
async function missionSetup() {
  const C = S.camp;
  C.missionNo++;
  UI.head(L(`━━━━ 任務 ${C.missionNo}：${fmtDate()} ━━━━`, `━━━━ Mission ${C.missionNo}: ${fmtDate()} ━━━━`));
  // 新しい装備（11.3）: 使える年月を過ぎていて、遅れていなければ装備する
  ['radar', 'hh', 'hfdf'].forEach(k => {
    if (SH().equipped[k] || monthNum() < eqDate(k)) return;
    if (C.equipDelayed[k]) { UI.bad(L(`${SECTION_NAME[k]}の装備が遅れています（11.3）`, `The ${SECTION_NAME[k]} fit is delayed (11.3)`)); return; }
    SH().equipped[k] = true;
    if (k === 'radar' || k === 'hfdf') SH().skills[k] = 1;
    UI.good(L(`${SECTION_NAME[k]}を装備しました${k === 'hh' ? '（爆雷の乗員が使う）' : '（乗員スキル1）'}`, `${SECTION_NAME[k]} fitted${k === 'hh' ? ' (worked by the depth charge crew)' : ' (crew skill 1)'}`));
  });
  // 船団（3.5）
  if (!C.convoyPool.length) C.convoyPool = CONVOY_UNITS.map(u => u.id);
  const uid = C.convoyPool.splice(Math.floor(Math.random() * C.convoyPool.length), 1)[0];
  const unit = CONVOY_UNITS.find(u => u.id === uid);
  let from, to;
  if (C.port === 'ON') { from = 'ON'; to = unit.canada; }
  else {
    if (C.port && C.port !== unit.canada) UI.log(L(`船団の出発港は${PORT_NAME[unit.canada]}です。${PORT_NAME[C.port]}から移動しました（11.5）`, `The convoy sails from ${PORT_NAME[unit.canada]}. Moved from ${PORT_NAME[C.port]} (11.5)`));
    from = unit.canada; to = 'ON';
  }
  const base = { 1941: 30, 1942: 40, 1943: 50 }[S.date.y] || 50;
  await roll(L('船団の規模', 'convoy size'));
  const rolls = Array.from({ length: 8 }, () => d6() - 1);
  const size = base + sum(rolls);
  const orders = pick(['NC', 'CC', 'SC']);
  S.mission = {
    convoy: { speed: unit.speed, from, to, unit: uid }, pos: from, size, sunk: 0, stragglers: 0, tonnage: 0, reduce: 0,
    orders, weather: 0, events: {}, revealed: {}, ubPool: [], rePool: [], tokens: { luck: 0, rum: 0, skilled: 0 },
    flags: {}, turn: 0, start: Object.assign({}, S.date), ub: null, kills: [],
  };
  const M = S.mission;
  UI.log(L(`船団: <b>${unit.speed === 'fast' ? '高速' : '低速'}船団</b>（${PORT_NAME[from]} → ${PORT_NAME[to]}）`, `Convoy: <b>${unit.speed === 'fast' ? 'Fast' : 'Slow'} convoy</b> (${PORT_NAME[from]} → ${PORT_NAME[to]})`));
  UI.dice(L(`船団の規模（${S.date.y}年: ${base} ＋ (1d6−1)×8）: ${rolls.join('・')} → <b>${size}隻</b>`, `Convoy size (${S.date.y}: ${base} + (1d6−1)×8): ${rolls.join(' · ')} → <b>${size} ships</b>`));
  UI.log(L(`命令書: <b>${WA_ROUTES[orders].name}（${orders}）</b>（ウェスタン・アプローチではこの航路を通る）`, `Orders: <b>${WA_ROUTES[orders].name} (${orders})</b> (the route through the Western Approaches)`));
  // 天候（3.7）: d66、10〜3月 +2、6〜8月 −2（6進法）
  const mm = S.date.m, mod = (mm >= 10 || mm <= 3) ? 2 : (mm >= 6 && mm <= 8) ? -2 : 0;
  await roll(L('天候', 'weather'));
  const raw = d66(), w = d66Add(raw, mod);
  M.weather = w <= 23 ? 0 : w <= 36 ? 1 : w <= 53 ? 2 : 3;
  UI.dice(L(`天候（d66${mod ? (mod > 0 ? '＋2' : '−2') : ''}）: ${raw}${mod ? '→' + w : ''} → <b>${WEATHER[M.weather]}</b>`, `Weather (d66${mod ? (mod > 0 ? '+2' : '−2') : ''}): ${raw}${mod ? '→' + w : ''} → <b>${WEATHER[M.weather]}</b>`));
  // イベント・マーカー（3.3）
  const cells = { C: [], A: [], W: [] };
  MAP_ROWS.forEach((row, r) => row.forEach((t, c) => { if (!t || PORT_POS[t]) return; const k = key(r, c); cells[sectorOf(k)].push(k); }));
  Object.keys(cells).forEach(sec => {
    const mix = EVENT_MIX[sec];
    const bag = shuffle([].concat(Array(mix.RE).fill('RE'), Array(mix.UB).fill('UB'), Array(mix.NE).fill('NE')));
    shuffle(cells[sec]).forEach((k, i) => { M.events[k] = bag[i] || 'NE'; });
  });
  // U ボート（3.4）: VII 型 13 と、IX 型からランダムに 2
  M.ubPool = UBOATS.filter(u => u.type === 7).map(u => u.id).concat(shuffle(UBOATS.filter(u => u.type === 9).map(u => u.id)).slice(0, 2));
  // ランダム・イベント（14.0）: 20 個。空襲のマーカーがリバプールに置かれていれば、それは除く
  M.rePool = Array.from({ length: 20 }, (_, i) => i + 1).filter(n => !(n === 10 && C.airRaid));
  // 爆雷・ヘッジホッグ（3.2）
  SH().dcLeft = 25; SH().hhLeft = SH().equipped.hh ? 15 : 0;
  UI.log(L(`爆雷 25発${SH().equipped.hh ? '・ヘッジホッグ 15発' : ''}を積みました。`, `Loaded 25 depth charges${SH().equipped.hh ? ' and 15 Hedgehog bombs' : ''}.`));
  const dep = story('depart', { port: PORT_NAME[from], speed: unit.speed === 'fast' ? L('高速', 'fast') : L('低速', 'slow'), size, weather: ST_weather(M.weather) });
  UI.story(dep);
  J(dep, L(`${unit.speed === 'fast' ? '高速' : '低速'}船団 ${size}隻・命令書 ${WA_ROUTES[orders].name}・天候 ${WEATHER[M.weather]}`, `${unit.speed === 'fast' ? 'Fast' : 'Slow'} convoy of ${size} ships · orders ${WA_ROUTES[orders].name} · weather ${WEATHER[M.weather]}`), L('出港', 'Sailed'));
  await UI.next(storyOn() ? L(`${story('departAsk')}　▶ 「出港せよ」`, `${story('departAsk')}　▶ "Take her out."`) : L('▶ 出港する', '▶ Put to sea'));
}

// ===================== 1ターン（4.0）=====================
async function playTurn() {
  const M = S.mission;
  M.turn++;
  UI.head(L(`── ターン ${M.turn}：${fmtDate()}　${placeName(M.pos)}　天候 ${WEATHER[M.weather]} ──`, `── Turn ${M.turn}: ${fmtDate()}　${placeName(M.pos)}　weather ${WEATHER[M.weather]} ──`));
  // 1. 移動
  const dist = distances();
  const here = dist[M.pos];
  const opts = neighbors(M.pos).filter(n => dist[n] === here - 1 && (!PORT_POS[n] || n === M.convoy.to));
  const short = n => (PORT_POS[n] ? PORT_NAME[n] : (c => `${'ABCD'[c.r]}${c.c}`)(cellAt(n)));
  const choices = opts.map(n => ({ label: storyOn() ? L(`「${short(n)}へ向かえ」　${placeName(n)}`, `"Make for ${short(n)}."　${placeName(n)}`) : placeName(n), value: n, hint: n === M.convoy.to ? L('目的地', 'destination') : (M.revealed[n] ? L(`判明: ${evName(M.events[n])}`, `known: ${evName(M.events[n])}`) : L(`目的地まで${dist[n]}`, `${dist[n]} to the destination`)) }));
  // 上の地図にも、行き先のマスに選択肢の番号を出す
  M.moveOpts = opts;
  let to;
  try { to = choices.length === 1 && !S.settings.step ? opts[0] : await UI.choose(say(L(`移動するマスを選んでください（目的地まであと${here}マス）`, `Choose the square to move to (${here} squares to the destination)`), 'navAsk', { dest: PORT_NAME[M.convoy.to], n: here }), choices); }
  finally { M.moveOpts = null; }
  const prevSector = sectorOf(M.pos);
  M.pos = to;
  const days = (M.convoy.speed === 'fast' ? 1 : 1.5) + (M.weather === 3 ? 0.5 : 0);
  advanceDays(days);
  const rep = [];   // このターンの部下の報告（まとめて1つの段落にする）
  M.turnReport = rep;
  UI.log(L(`${placeName(to)}へ移動（${days}日）→ ${fmtDate()}`, `Moved to ${placeName(to)} (${days} days) → ${fmtDate()}`), 'routine');
  if (!PORT_POS[to]) { J(L(`${placeName(to)}へ進む。`, `Proceeded to ${placeName(to)}.`), L(`天候 ${WEATHER[M.weather]}`, `weather ${WEATHER[M.weather]}`)); rep.push(story('moveDone', { place: placeName(to), days: days === 1 ? L('1日', 'one day') : days === 1.5 ? L('1日半', 'a day and a half') : days + L('日', ' days'), date: fmtDate() })); }
  if (to === M.convoy.to) {
    UI.good(L(`<b>${PORT_NAME[to]}に到着しました。</b>`, `<b>Arrived at ${PORT_NAME[to]}.</b>`));
    // 入港の文は損害の大きさで変わる（喪失トン数の区切りは勝利点と同じ）
    const tier = M.sunk === 0 ? 'Safe' : M.tonnage < 25000 ? 'Good' : M.tonnage < 50000 ? 'Mixed' : 'Bad';
    const arr = story('arrive' + tier, { port: PORT_NAME[to], size: M.size });
    UI.big(arr, tier === 'Bad' ? 'bad' : tier === 'Mixed' ? '' : 'good');
    UI.story(story('arrive' + tier + 'Crew'));
    J(arr, L(`入港・船団 ${M.size}隻（落伍 ${M.stragglers}）`, `In port · convoy ${M.size} ships (stragglers ${M.stragglers})`), L('入港', 'In port'));
    M.turnReport = null;
    if (to === 'ON' && S.camp.airRaid) await airRaid();
    return 'arrived';
  }
  // 2. 天候（新しいセクターに入った時だけ 7.1）
  const sec = sectorOf(to);
  if (sec !== prevSector) {
    await roll(L('天候の変化', 'weather change'));
    const a = d6(), b = d6();
    const old = M.weather;
    if (a > b) M.weather = Math.max(0, M.weather - 1); else if (a < b) M.weather = Math.min(3, M.weather + 1);
    UI.dice(L(`${SECTOR_NAME[sec]}に入った。天候の変化（1d6を2回）: ${a}・${b} → ${M.weather === old ? '変わらず' : WEATHER[old] + ' → '} <b>${WEATHER[M.weather]}</b>`, `Entered ${SECTOR_NAME[sec]}. Weather change (1d6 twice): ${a} · ${b} → ${M.weather === old ? 'no change' : WEATHER[old] + ' → '} <b>${WEATHER[M.weather]}</b>`));
    const sx = story('sector.' + sec) + (M.weather > old ? story('weatherWorse') : M.weather < old ? story('weatherBetter') : '') + ST_weather(M.weather) + L('。', '.');
    flushReport();
    UI.story(sx);
    J(sx, L(`${SECTOR_NAME[sec]}に入る・天候 ${WEATHER[M.weather]}`, `Entered ${SECTOR_NAME[sec]} · weather ${WEATHER[M.weather]}`));
  }
  // 霧／雪の衝突判定（7.3）
  // 海域と天候で変わる乗員の会話（マスに入るたびに、少しずつ違う話が出る）
  if (!PORT_POS[to]) {
    if (Math.random() < 0.7) rep.push(story('talk' + sectorOf(to)));
    if (Math.random() < 0.35) rep.push(story('talkSky' + M.weather));
  }
  if (M.weather === 2) await collisionCheck();
  // 3. 機械的な故障（8.0）
  await breakdownCheck();
  // 4. イベント
  let ev = M.events[to] || 'NE';
  M.revealed[to] = true;
  UI.log(L(`イベント・マーカー: <b>${evName(ev)}</b>`, `Event marker: <b>${evName(ev)}</b>`), 'routine');
  if (ev === 'UB') {
    if (M.weather === 3) { UI.log(L('暴風雨のため U ボートは攻撃できない（イベントなし 7.2）', 'The storm keeps the U-boats from attacking (no event, 7.2)'), 'routine'); rep.push(story('stormNoUb')); flushReport(); }
    else { flushReport(); UI.story(story('ubRadio')); await UI.wait(storyOn() ? L('「総員、配置につけ！」', '"Action stations!"') : L('▶ U ボートの襲撃を判定する', '▶ Resolve the U-boat attack')); await uboatEvent({}); }
  } else if (ev === 'RE') { flushReport(); UI.story(story('reIntro')); await UI.wait(storyOn() ? L('「何が起きた？」', '"What\'s happened?"') : L('▶ ランダム・イベントを判定する', '▶ Resolve the random event')); await randomEvent(); }
  else {
    rep.push(story('lookoutOk'));
    flushReport();
    if (Math.random() < 0.3) { const q = story('quiet'); UI.story(q); J(q); }
  }
  M.turnReport = null;
  // 5. ターン終了（修理 10.0）
  await repairPhase();
  await UI.next();
  return 'go';
}
function evName(e) { return { NE: L('イベントなし', 'No event'), UB: L('Uボート!', 'U-boat!'), RE: L('ランダム・イベント', 'Random event') }[e] || e; }

async function collisionCheck() {
  flushReport();
  UI.story(story('fogWatch'));
  await roll(L('霧／雪の衝突', 'fog/snow collision'));
  let r = d66();
  UI.log(L(`霧／雪の衝突判定 d66＝${r}`, `Fog/snow collision check d66=${r}`), 'dice routine');
  if ((r <= 12 || r >= 65) && SH().equipped.radar) {
    const v = await UI.choose(L('レーダーで衝突判定を1回振り直せます（7.3）', 'The radar lets you re-roll the collision check once (7.3)'), [{ label: L('振り直す', 'Re-roll'), value: 1 }, { label: L('そのまま', 'Keep it'), value: 0 }]);
    if (v) { await roll(L('衝突（振り直し）', 'collision (re-roll)')); r = d66(); UI.dice(L(`（振り直し）d66＝${r}`, `(re-roll) d66=${r}`)); }
  }
  if (r <= 12) { UI.story(story('fogBad2')); addStragglers(2); UI.bad(L('船団内の2隻が衝突、落伍しました。', 'Two ships in the convoy collided and fell out as stragglers.')); J(L('霧の中で船団内の2隻が衝突、落伍した。', 'Two ships in the convoy collided in the fog and fell out.'), L('落伍 2隻', '2 stragglers')); }
  else if (r >= 65) {
    addStragglers(1);
    UI.story(story('fogBad1'));
    UI.bad(L('コルベットが船団の1隻と衝突！ 1隻が落伍し、コルベットの1区画が損傷しました。', 'The corvette collided with a ship of the convoy! One ship straggles and one section of the corvette is damaged.'));
    J(L('霧の中、本艦が船団の1隻と衝突した。', 'In the fog, we collided with a ship of the convoy.'), L('落伍 1隻・本艦損傷', '1 straggler · own ship damaged'));
    await UI.wait(storyOn() ? L('「被害を調べろ！」', '"Find out what\'s hit!"') : L('▶ 損傷区画を判定する', '▶ Resolve the damaged section'));
    await sectionDamage(1);
  } else { UI.log(L('衝突は発生しませんでした。', 'No collision.'), 'routine'); UI.story(story('fogOk')); }
}
// たまっている部下の報告を1つの段落にして出す
function flushReport() {
  const M = S.mission;
  if (!M || !M.turnReport || !M.turnReport.length) return;
  UI.story(M.turnReport.join('　'));
  M.turnReport.splice(0); // 同じ入れ物を空にする（あとの報告もここに入る）
}
function addStragglers(n) { const M = S.mission; n = Math.min(n, M.size); M.size -= n; M.stragglers += n; }

async function breakdownCheck() {
  await roll(L('機械的な故障', 'mechanical breakdown'));
  const r = d66();
  const fail = r <= 12 || (r <= 14 && S.mission.weather === 3);
  UI.log(L(`機械的な故障の判定 d66＝${r} → ${fail ? '<b>故障発生</b>' : '故障なし'}`, `Mechanical breakdown check d66=${r} → ${fail ? '<b>breakdown</b>' : 'no breakdown'}`), fail ? 'dice' : 'dice routine');
  if (!fail && S.mission.turnReport) S.mission.turnReport.push(story('engineOk'));
  if (fail) { flushReport(); const n = d3(); UI.story(story('breakdown')); J(L('機関の故障が発生。', 'Engine breakdown.'), L(`損傷区画判定 ${n}回`, `${n} damage roll(s)`)); UI.bad(L(`故障！ ${n}回 損傷区画判定を行います（8.0）`, `Breakdown! ${n} damage location roll(s) (8.0)`)); await UI.wait(storyOn() ? L('「被害を調べろ！」', '"Find out what\'s hit!"') : L('▶ 損傷区画を判定する', '▶ Resolve the damaged section')); await sectionDamage(n); }
}

// 損傷区画判定（9.5.3 表B）を n 回
async function sectionDamage(n) {
  for (let i = 0; i < n; i++) {
    await roll(L('損傷区画', 'damage location'));
    const r = d6();
    let k = ['watch', 'asdic', 'aa', 'gun4', 'dc', 'engine'][r - 1], extra = '';
    if (k === 'asdic' && (SH().equipped.radar || SH().equipped.hfdf)) {
      const s = d6();
      if (SH().equipped.hfdf && SH().equipped.radar) k = s <= 2 ? 'asdic' : s <= 4 ? 'radar' : 'hfdf';
      else if (SH().equipped.radar) k = s <= 3 ? 'asdic' : 'radar';
      else k = s <= 3 ? 'asdic' : 'hfdf';
      extra = `→1d6＝${s}`;
    }
    if (k === 'dc' && SH().equipped.hh) { const s = d6(); k = s <= 3 ? 'dc' : 'hh'; extra = `→1d6＝${s}`; }
    const add = d3();
    const again = !!SH().dmg[k];
    SH().dmg[k] = true;
    SH().diff[k] = (SH().diff[k] || 0) + add;
    UI.bad(L(`損傷区画（1d6＝${r}${extra}）: <b>${SECTION_NAME[k]}</b>${again ? '（再び）' : ''}に損害、困難修整 +${add}（計 +${secDiff(k)}）`, `Damage location (1d6=${r}${extra}): <b>${SECTION_NAME[k]}</b>${again ? ' (again)' : ''} damaged, difficulty +${add} (total +${secDiff(k)})`));
    J(L(`${SECTION_NAME[k]}に損害。`, `${SECTION_NAME[k]} damaged.`), L(`困難 +${secDiff(k)}`, `difficulty +${secDiff(k)}`));
  }
}

// 修理（10.0）: 困難修整のある区画ごとに1回、機関の乗員が修理。機関から先に直す
async function repairPhase() {
  const ks = Object.keys(SH().diff).filter(k => SH().diff[k] > 0).sort((a, b) => (a === 'engine' ? -1 : b === 'engine' ? 1 : 0));
  if (!ks.length) return;
  flushReport();
  await UI.wait(storyOn() ? L('「機関長、修理にかかれ」', '"Chief, get on with the repairs."') : L('▶ 修理を判定する', '▶ Resolve the repairs'));
  UI.log(L('<b>修理</b>（機関の乗員が、困難修整のある区画を1つずつ直す 10.0）', '<b>Repairs</b> (the engine crew fix one difficulty marker per section, 10.0)'), 'routine');
  let n = 0;
  for (const k of ks) {
    const p = d3() + (n > 0 ? (SH().diff.engine || 0) + (SH().perm.engine || 0) : 0);
    const ok = await check(L(`${SECTION_NAME[k]}の修理`, `${SECTION_NAME[k]} repair`), skill('engine'), p, { sec: 'engine' });
    if (ok) { SH().diff[k]--; UI.log(L(`${SECTION_NAME[k]}の困難修整を1つ取り除いた（残り +${secDiff(k)}）`, `Removed one difficulty marker from the ${SECTION_NAME[k]} (left +${secDiff(k)})`), 'good routine'); }
    UI.story(story(ok ? 'repairOk' : 'repairNg', { sec: SECTION_NAME[k] }));
    n++;
  }
}

// ===================== U ボートとの戦闘（9.0）=====================
function drawUboat() {
  const M = S.mission;
  if (!M.ubPool.length) { UI.log(L('U ボート・プールが空です。', 'The U-boat pool is empty.')); return null; }
  const id = M.ubPool.splice(Math.floor(Math.random() * M.ubPool.length), 1)[0];
  const d = UBOATS.find(u => u.id === id);
  return Object.assign({}, d, { attacksLeft: d.type === 7 ? 3 : 4, damage: 0, rng: null, orig: null, surfaced: false, contact: false, sieg: false, hhUsed: false });
}
const ubName = ub => L(`U ボート${ub.type === 7 ? 'VII' : 'IX'}型（${ub.id}・攻撃${ub.atk}／回避${ub.eva}）`, `Type ${ub.type === 7 ? 'VII' : 'IX'} U-boat (${ub.id} · attack ${ub.atk} / evasion ${ub.eva})`);
const evaEff = ub => ub.eva + (ub.sieg && !ub.surfaced ? 1 : 0);   // 13.1 ジークリンデ: 潜航中の回避値 +1
// 9.2 攻撃距離（天候で決まる）。攻撃しない時は null
function attackRange(ub) {
  const w = S.mission.weather;
  if (w === 3) return null;
  if (ub.range === 'C') return 'C';
  if (ub.range === 'LMC') return w === 0 ? 'L' : w === 1 ? 'M' : 'C';
  if (ub.range === 'LM') return w === 0 ? 'L' : w === 1 ? 'M' : null;
  return w === 2 ? 'C' : 'M'; // MC
}
const closer = r => (r === 'L' ? 'M' : 'C');
function farther(r, n) { const order = ['C', 'M', 'L', 'OUT']; return order[Math.min(3, order.indexOf(r) + n)]; }
const falkeBonus = () => (monthNum() >= 1943 * 12 + 3 && monthNum() < 1943 * 12 + 5 ? 2 : 0); // 13.4 / 13.5

// イベント・マーカーの「Uボート!」と、それに準ずる U ボートの攻撃
async function uboatEvent(opts) {
  const ub = drawUboat();
  if (!ub) return;
  await engage(ub, opts || {});
}

// U ボート1隻との交戦。opts: noWolf（群狼なし）, reinforce（来援）, catchup（14.8）, cryptic（14.15）
async function engage(ub, opts) {
  const M = S.mission;
  ub.rng = ub.orig = attackRange(ub);
  // 天候で襲撃しなかった時は、見出しも「細かい処理」にする（オプションで隠せる）
  const quiet = ub.rng ? '' : ' routine';
  UI.log(L(`◆ ${ubName(ub)}　艦長: ${RANGE_CHAR[ub.range]}`, `◆ ${ubName(ub)}　commander: ${RANGE_CHAR[ub.range]}`), 'head ubinfo' + quiet);
  UI.log(L('◆ U ボートが船団に迫る！', '◆ A U-boat closes on the convoy!'), 'head ubinfo-alt' + quiet);
  if (!ub.rng) {
    UI.log(L(`天候（${WEATHER[M.weather]}）のため、この U ボートは襲撃しなかった（9.2）`, `Because of the weather (${WEATHER[M.weather]}), this U-boat did not attack (9.2)`), 'routine');
    UI.story(M.weather === 2
      ? ST_pick([L('見張り長「霧の向こうで何かが動いた気がしましたが……見失いました」', 'Chief Lookout: "I thought something moved out there in the fog, sir... lost it."'), L('霧が深すぎる。U ボートもこちらを見つけられなかったのだろう。それきり何も起きなかった。', 'The fog is too thick. The U-boat could not find us either, it seems. Nothing more happened.')])
      : ST_pick([L('……それきり何も起きなかった。U ボートは手を出さずに去ったらしい。', '...Nothing more happened. The U-boat seems to have slipped away without striking.'), L('見張り長「気配が消えました。こちらの守りを見て、諦めたのかもしれません」', 'Chief Lookout: "It\'s gone quiet, sir. Maybe they took one look at us and thought better of it."')]));
    M.ubPool.push(ub.id); return 'none';
  }
  UI.log(L(`攻撃距離: <b>${RANGE_NAME[ub.rng]}</b>`, `Attack range: <b>${RANGE_NAME[ub.rng]}</b>`), 'routine');
  if (monthNum() >= 1942 * 12 + 6) { const r = d6(); if (r >= 5) { ub.sieg = true; UI.log(L(`ジークリンデ搭載（1d6＝${r}）: 潜航中の回避値 +1（13.1）`, `Fitted with Sieglinde (1d6=${r}): evasion +1 while submerged (13.1)`), 'bad ubinfo'); } }
  M.ub = ub;
  // この交戦に付く特別な効果（14.13・14.20）
  const help = { sunderland: !!M.flags.sunderland, escort: !!M.flags.escort, payback: !!M.flags.payback, ease: opts.cryptic ? 1 : 0 };
  M.flags.sunderland = M.flags.escort = M.flags.payback = false;
  if (opts.catchup) { help.payback = true; help.forceAll = true; }
  try {
    let phase = '9.5';
    if (opts.cryptic) { ub.damage = 2; ub.attacksLeft = 0; phase = '9.6'; UI.log(L('この U ボートは既に2損害を受け、魚雷を撃ち尽くしている（14.15）', 'This U-boat has already taken 2 damage and has fired all its torpedoes (14.15)')); }
    else if (opts.catchup) {
      ub.surfaced = true;
      UI.log(L('浮上中の U ボートが落伍船を砲撃している！ 4インチ砲で2回射撃する（14.8）', 'A surfaced U-boat is shelling the stragglers! The 4-inch gun fires twice (14.8)'));
      const dmg = await gunfire(ub, 2, 0);
      if (dmg >= 3) { const r = await damageOutcome(ub, dmg, 'gun'); if (r !== 'continue') return r; }
      ub.surfaced = false; UI.log(L('U ボートは潜航した。', 'The U-boat dived.'), 'routine');
    } else {
      // 9.3 発見（昼夜・浮上／潜航）
      await roll(L('U ボートの状態（昼夜・浮上／潜航）', 'U-boat status (day/night · surfaced/submerged)'));
      const a = d6(), b = d6(), t = a + b;
      const night = t <= 7;
      ub.surfaced = (t >= 4 && t <= 7) || t >= 11;
      if (ub.rng === 'C' && M.weather !== 2 && ub.surfaced) { ub.surfaced = false; UI.dice(L(`U ボートの状態 2d6＝${t}: ${night ? '夜間' : '昼間'}・浮上中 → 近距離なので潜航中（9.3）`, `U-boat status 2d6=${t}: ${night ? 'night' : 'day'} · surfaced → at close range, so submerged (9.3)`)); }
      else UI.dice(L(`U ボートの状態 2d6＝${t}: <b>${night ? '夜間' : '昼間'}・${ub.surfaced ? '浮上中' : '潜航中'}</b>`, `U-boat status 2d6=${t}: <b>${night ? 'night' : 'day'} · ${ub.surfaced ? 'surfaced' : 'submerged'}</b>`));
      ub.night = night;
      // 同じ日の前の襲撃より後の時刻にする
      ub.time = clockTime(night);
      const ap = story('ubApproach', { time: ub.time }) + (ub.surfaced ? story(night ? 'ubSurfacedNight' : 'ubSurfacedDay') : story('ubSubmerged'));
      UI.story(ap);
      J(ap.replace(/^[^。]*。/, ''), L(`U ボートの襲撃（${night ? '夜間' : '昼間'}・${RANGE_NAME[ub.rng]}・${ub.surfaced ? '浮上中' : '潜航中'}）`, `U-boat attack (${night ? 'night' : 'day'} · ${RANGE_NAME[ub.rng]} · ${ub.surfaced ? 'surfaced' : 'submerged'})`));
      await UI.wait();
      if (ub.surfaced) {
        const found = await spotSurfaced(ub, help);
        if (found) {
          const n4 = 2, nAA = ub.rng === 'L' ? 0 : 3;
          UI.log(L(`<b>浮上中の U ボートを発見！</b> 4インチ砲${n4}回${nAA ? '・対空砲' + nAA + '回' : ''}で射撃（9.4.3）`, `<b>Surfaced U-boat sighted!</b> Firing the 4-inch gun ${n4} times${nAA ? ' and the AA gun ' + nAA + ' times' : ''} (9.4.3)`));
          const dmg = await gunfire(ub, n4, nAA);
          if (dmg >= 3) { const r = await damageOutcome(ub, dmg, 'gun'); if (r !== 'continue') return r; }
          ub.surfaced = false;
          UI.log(L('U ボートは急速潜航した（9.4.4）', 'The U-boat crash-dived (9.4.4)'), 'routine');
          UI.story(story('crashDive'));
        } else {
          UI.log(L('浮上中の U ボートを発見できなかった。U ボートは浮上したまま1回攻撃する。', 'The surfaced U-boat was not sighted. It attacks once while still on the surface.'), 'routine');
          await uboatAttack(ub, help);
          ub.surfaced = false;
          UI.log(L('U ボートは潜航した。', 'The U-boat dived.'), 'routine');
          phase = '9.6';
        }
      }
    }
    // 9.5 ⇄ 9.6 の繰り返し
    let guard = 80;
    while (guard-- > 0) {
      if (phase === '9.5') {
        if (ub.attacksLeft > 0) await uboatAttack(ub, help);
        phase = '9.6';
        continue;
      }
      // 9.6 コルベットの攻撃
      if (help.escort) { help.escort = false; const r = await escortHelp(ub); if (r !== 'continue') return r; }
      // 爆雷もヘッジホッグも残っていなければ、4インチ砲で撃てる時（浮上中）を除いて、探知も接近もせず先へ進む（ユーザーの指示 2026-11-03）
      if (SH().dcLeft <= 0 && !(SH().equipped.hh && SH().hhLeft > 0) && !ub.surfaced) {
        UI.bad(L('爆雷が残っていない！ U ボートを追わず、船団の護衛に戻る。', 'No depth charges left! Breaking off the hunt and returning to the convoy.'));
        if (ub.attacksLeft <= 0) ub.rng = 'L'; // 攻撃が残っていなければ、そのまま戦闘海域から去る
        phase = await lostContact(ub, opts);
        if (phase === 'end') return 'withdrew';
        continue;
      }
      const det = await asdicDetect(ub, help);
      if (det) {
        if (help.sunderland && S.mission.weather !== 2) {
          const ok = await check(L('サンダーランド機の対潜攻撃', 'Sunderland anti-submarine attack'), 1, evaEff(ub));
          if (ok) { UI.good(L('サンダーランド機が U ボートを撃沈した！ 勝利は分け合いとなる（14.13）', 'The Sunderland sank the U-boat! The victory is shared (14.13)')); return await killUboat(ub, 'shared'); }
        }
        if (ub.rng !== 'C') { ub.rng = closer(ub.rng); UI.log(L(`U ボートを探知。距離を詰める → <b>${RANGE_NAME[ub.rng]}</b>`, `U-boat detected. Closing the range → <b>${RANGE_NAME[ub.rng]}</b>`), 'routine'); UI.story(story('closeIn')); await UI.next(); phase = '9.5'; continue; }
        // 近距離: 爆雷攻撃。ヘッジホッグを積んでいれば、弾（15発）が残っている限り、どちらで攻撃するか選べる
        let useHH = false;
        if (SH().equipped.hh && SH().hhLeft > 0) {
          useHH = SH().dcLeft <= 0 ? true : await UI.choose(say(L('近距離で U ボートを探知。どちらで攻撃しますか？', 'U-boat detected at close range. Which weapon?'), 'hhAsk'), [
            { label: storyOn() ? L(`「ヘッジホッグ、撃て！」（残り${SH().hhLeft}発）`, `"Hedgehog, fire!" (${SH().hhLeft} left)`) : L(`ヘッジホッグ（残り${SH().hhLeft}発）`, `Hedgehog (${SH().hhLeft} left)`), value: true, hint: L('同時2損害で撃沈確実・1損害で撃沈。外れても接触を保つ', '2 hits at once: certain kill · 1 hit: sunk. Contact is kept even on a miss') },
            { label: storyOn() ? L(`「爆雷戦用意！」（残り${SH().dcLeft}発）`, `"Stand by depth charges!" (${SH().dcLeft} left)`) : L(`爆雷（残り${SH().dcLeft}発）`, `Depth charges (${SH().dcLeft} left)`), value: false, hint: L('同時4損害で撃沈確実・3損害で撃沈。ASDIC の接触が途切れる', '4 hits at once: certain kill · 3 hits: sunk. ASDIC contact is broken') }]);
        }
        if (useHH) {
          const r = await depthCharge(ub, 'hh', opts);
          if (r === null) {} else if (r !== 'continue') return r;
          else {
            // ヘッジホッグの後も接触を保つ: 近距離 +1・探知済み +3 で探知し、成功すれば爆雷攻撃（任意 13.2）
            const d2 = await asdicDetect(ub, help, true);
            if (!d2) { ub.contact = false; phase = await lostContact(ub, opts); if (phase === 'end') return 'withdrew'; continue; }
            const use = SH().dcLeft > 0 ? await UI.choose(say(L('続けて爆雷攻撃を行いますか？（ASDIC の接触が途切れます 13.2）', 'Follow up with a depth charge attack? (ASDIC contact will be broken, 13.2)'), 'hhMore') + (storyOn() ? L('（爆雷を落とすと ASDIC の接触が途切れる 13.2）', ' (dropping depth charges breaks ASDIC contact, 13.2)') : ''), [{ label: storyOn() ? L('「爆雷、投下せよ！」', '"Drop depth charges!"') : L('爆雷攻撃する', 'Depth charge attack'), value: 1 }, { label: storyOn() ? L('「待て。接触を保て」', '"Hold it. Keep contact."') : L('しない（探知を続ける）', 'No (keep searching)'), value: 0 }]) : 0;
            if (!use) continue;
          }
        }
        if (SH().dcLeft <= 0) { UI.bad(L('爆雷が残っていない！', 'No depth charges left!')); phase = await lostContact(ub, opts); if (phase === 'end') return 'withdrew'; continue; }
        const r = await depthCharge(ub, 'dc', opts);
        if (r === 'hold') continue; // 0発（温存）: 外れと同じく 9.6.1 に戻る。接触は保ったまま（次の探知に +3）
        ub.contact = false; // 爆雷攻撃で ASDIC の接触は途切れる
        if (r !== 'continue') return r;
        await UI.next();
        continue; // 9.6.1 に戻る（近距離のまま）
      }
      phase = await lostContact(ub, opts);
      if (phase === 'end') return 'withdrew';
    }
    UI.log(L('（交戦が長引いたので打ち切りました）', '(The engagement dragged on too long and was broken off)'));
    return 'withdrew';
  } finally {
    M.ub = null;
    renderStatus();
  }
}

// 9.4 浮上中の U ボートの発見（レーダー・HF-DF の探知、監視による発見）
async function spotSurfaced(ub, help) {
  const M = S.mission;
  let bonus = 0;
  if (SH().equipped.radar && await check(L('レーダー探知', 'Radar detection'), skill('radar'), ub.eva + secDiff('radar'), { sec: 'radar', mine: true })) bonus += 2;
  if (SH().equipped.hfdf && await check(L('HF-DF 探知', 'HF/DF detection'), skill('hfdf'), ub.eva + secDiff('hfdf'), { sec: 'hfdf', mine: true })) bonus += 2;
  const A = skill('watch') + (ub.rng === 'C' ? 1 : 0) + bonus + help.ease;
  const P = ub.eva + (ub.night ? 3 : 0) + (ub.rng === 'L' ? 3 : ub.rng === 'M' ? 2 : 0) + (M.weather === 1 ? 2 : M.weather === 2 ? 3 : 0) + secDiff('watch');
  const ok = await check(L('監視による浮上 U ボートの発見', 'Lookouts spotting the surfaced U-boat'), A, P, { sec: 'watch', mine: true });
  UI.story(story(ok ? 'spotOk' : 'spotNg'));
  return ok;
}

// 9.4.3 射撃。損害の合計を返す
// 射撃: 1発ごとに「打ち方よーい」で止め、艦長の号令で撃つ。判定の数字は出さず、撃ったことと結果を文章で見せる
const gunLine = (kind, k) => story(`gun.${kind}.${k}`);
async function gunfire(ub, n4, nAA) {
  let dmg = 0;
  UI.story(story('gunStart'));
  const one = async (k, name, label, A, P, sec, dice) => {
    UI.story(gunLine('ready', k));
    await UI.choose('', [{ label: L('撃て！', 'Fire!'), value: 1 }]);   // 自動進行の設定でも、ここは必ず止める
    UI.story(gunLine('fire', k));
    let h = 0;
    if (await check(label, A, P, { sec, mine: true, quiet: true })) {
      h = hitDamage(name, A, ub, dice, true);   // 損害の判定は見せない
      UI.story(gunLine('hit', k));
    } else UI.story(gunLine('miss', k));
    return h;
  };
  for (let i = 1; i <= n4; i++) {
    const P = ub.eva + (ub.rng === 'L' ? 3 : ub.rng === 'M' ? 2 : 0) + secDiff('gun4');
    dmg += await one('g', L('4インチ砲', '4-inch gun'), L(`4インチ砲 射撃${i}`, `4-inch gun, shot ${i}`), skill('gun4'), P, 'gun4', 3);
  }
  for (let i = 1; i <= nAA; i++) {
    const P = ub.eva + (ub.rng === 'M' ? 3 : 0) + secDiff('aa');
    dmg += await one('a', L('対空砲', 'AA gun'), L(`対空砲 射撃${i}`, `AA gun, burst ${i}`), skill('aa'), P, 'aa', 2);
  }
  ub.damage += dmg;
  UI.log(L('射撃を終えた。U ボートの損害は分からない。', 'Ceased firing. The damage to the U-boat is unknown.'));
  return dmg;
}
// 命中1の損害判定: 目標値 1d6、スキルが回避値以下なら 1・6 は失敗。n 回振って目標値と同じ目ごとに1損害
function hitDamage(name, sk, ub, n, quiet) {
  const target = d6();
  if (sk <= evaEff(ub) && (target === 1 || target === 6)) { if (!quiet) UI.dice(L(`${name}の損害判定: 目標値 ${target} → スキルが回避値以下なので外れ`, `${name} damage roll: target ${target} → miss, skill not above evasion`)); return 0; }
  const rs = Array.from({ length: n }, d6);
  const h = rs.filter(x => x === target).length;
  if (!quiet) UI.dice(L(`${name}の損害判定: 目標値 ${target}、1d6×${n}＝${rs.join('・')} → 損害 ${h}`, `${name} damage roll: target ${target}, 1d6×${n}=${rs.join(' · ')} → damage ${h}`));
  return h;
}

// 9.5 U ボートの攻撃（1回）
async function uboatAttack(ub, help) {
  const M = S.mission;
  ub.attacksLeft--;
  let toCorvette = false;
  if (help.payback) { toCorvette = true; if (!help.forceAll) help.payback = false; UI.log(L('U ボートはプレイヤーのコルベットを狙う！（14.20/14.8）', 'The U-boat goes for the player\'s corvette! (14.20/14.8)')); }
  else { await roll(L('U ボートの攻撃目標', 'U-boat target')); const r = d66(); toCorvette = r <= 12; UI.dice(L(`U ボートの攻撃目標 d66＝${r} → <b>${toCorvette ? 'コルベット' : '船団内の1隻'}</b>${S.settings.hideEnemy ? '' : `（残り攻撃 ${ub.attacksLeft}回）`}`, `U-boat target d66=${r} → <b>${toCorvette ? 'the corvette' : 'a ship of the convoy'}</b>${S.settings.hideEnemy ? '' : L('', ` (${ub.attacksLeft} attacks left)`)}`)); }
  if (toCorvette) { await torpedo(ub.rng, {}); return; }
  const A = ub.atk + (ub.rng === 'C' ? 1 : 0) + falkeBonus();
  const P = 1 + (ub.rng === 'L' ? 1 : 0);
  const hit = await check(L(`U ボートの雷撃（${RANGE_NAME[ub.rng]}）${falkeBonus() ? '（G7e Falke +2）' : ''}`, `U-boat torpedo attack (${RANGE_NAME[ub.rng]})${falkeBonus() ? ' (G7e Falke +2)' : ''}`), A, P, { theirs: true });
  if (hit) { await roll(L('喪失トン数', 'tonnage lost')); shipSunk('U ボートの雷撃'); } else { UI.log(L('魚雷は外れた。', 'The torpedo missed.'), 'routine'); UI.story(story('ubMiss')); if (Math.random() < 0.6) UI.story(story('ubMissTalk')); }
  await UI.next();
}
// 物語の時刻: 同じ日の前の出来事より後の時刻にする
function clockTime(night) {
  const M = S.mission, today = fmtDate();
  if (M.clockDate !== today) M.clockWrap = 0;
  let t = ST_time(night, M.clockDate === today ? M.clockHour : null);
  if (t.startsWith(L('翌', 'Next day, '))) { M.clockWrap = (M.clockWrap || 0) + 1; t = t.slice(1); }   // 日をまたいだ回数
  const pre = ['', L('翌', 'Next day, '), L('翌々', 'Two days later, ')][Math.min(2, M.clockWrap || 0)] + ((M.clockWrap || 0) > 2 ? L(`(${M.clockWrap}日後)`, `(${M.clockWrap} days later) `) : '');
  M.clockDate = today; M.clockHour = ST_lastHour;
  return pre + t;
}
// 輸送船1隻の沈没と喪失トン数（9.5.1）
function shipSunk(why) {
  const M = S.mission;
  const t = tonnage();
  M.size = Math.max(0, M.size - 1); M.sunk++; M.tonnage += t.t;
  const ship = ST_shipName(t.kind);
  UI.log(L(`${why}: 輸送船1隻が沈没 — ${t.desc} <b>${t.t.toLocaleString()}トン</b>（喪失 計${M.tonnage.toLocaleString()}トン）`, `${TK(why)}: one merchant ship sunk — ${t.desc} <b>${t.t.toLocaleString()} tons</b> (total lost ${M.tonnage.toLocaleString()} tons)`), 'bad routine');
  if (why === 'U ボートの雷撃') { UI.story(story('shipHit', { time: clockTime(M.ub ? M.ub.night : Math.random() < 0.6), ship })); if (Math.random() < 0.5) UI.story(story('shipHitTalk', { ship })); }
  else if (why === '空襲') UI.story(L(`急降下してきた爆撃機の爆弾が、${ship}を直撃した——`, `A diving bomber's bomb struck ${ship} squarely——`));
  else UI.story(L(`落伍していた${ship}の消息は、二度と届かなかった——`, `Of the straggling ${ship}, no word was ever heard again——`));
  UI.big(L(`${ship} 沈没　${t.t.toLocaleString()}トン　（船団の喪失 計${M.tonnage.toLocaleString()}トン・残り${M.size}隻）`, `${ship} sunk　${t.t.toLocaleString()} tons　(convoy losses ${M.tonnage.toLocaleString()} tons · ${M.size} ships left)`), 'bad');
  J(L(`${ship}、${why === 'U ボートの雷撃' ? '被雷して沈没' : why === '空襲' ? '爆撃を受けて沈没' : '落伍の後、消息を絶つ'}。`, `${ship}: ${why === 'U ボートの雷撃' ? L('', 'torpedoed and sunk') : why === '空襲' ? L('', 'bombed and sunk') : L('', 'straggled and was never heard from again')}.`), L(`喪失 ${t.t.toLocaleString()}トン（計 ${M.tonnage.toLocaleString()}トン）`, `lost ${t.t.toLocaleString()} tons (total ${M.tonnage.toLocaleString()} tons)`));
}
function tonnage() {
  const a = d6(), b = d6();
  if (a !== b) return { t: 6000 + a * 1000 - b * 1000, desc: `6,000＋${a}×1,000−${b}×1,000 ＝`, kind: '' };
  const kinds = ['', '弾薬運搬船', 'タンカー', 'タンカー', 'タンカー', 'タンカー', '救難船'];
  if (a === 6) return { t: 1700, desc: L(`ぞろ目 6・重要船「救難船」`, `doubles 6 · key ship "${TK('救難船')}"`), kind: '救難船' };
  const x = d6() + d6(), add = [0, 0, 0, 1, 2, 3][a - 1];
  return { t: (x + add) * 1000, desc: L(`ぞろ目 ${a}・重要船「${kinds[a]}」(2d6${add ? '+' + add : ''}＝${x + add})×1,000 ＝`, `doubles ${a} · key ship "${TK(kinds[a])}" (2d6${add ? '+' + add : ''}=${x + add})×1,000 =`), kind: kinds[a] };
}

// 9.5.2 コルベットへの雷撃。start: 魚雷の発射距離
async function torpedo(start, opt) {
  const M = S.mission;
  UI.bad(L(`<b>魚雷がコルベットに向かってくる！</b>（${RANGE_NAME[start]}から）`, `<b>Torpedo heading for the corvette!</b> (from ${RANGE_NAME[start]})`));
  UI.story(story('torpedoIn'));
  const order = ['L', 'M', 'C'];
  let found = 0, evBonus = 0;
  for (let i = order.indexOf(start); i < 3; i++) {
    const r = order[i];
    M.torp = r; renderStatus();
    const close = r === 'C';
    const pMod = (start === 'L' ? 1 : 0) + (M.weather === 1 ? 1 : 0) + (M.weather === 2 && start === 'C' ? 1 : 0);
    let ok = await check(L(`監視による魚雷発見（${RANGE_NAME[r]}）`, `Lookouts spot the torpedo (${RANGE_NAME[r]})`), skill('watch') + (M.weather === 0 ? 1 : 0) + (close && M.weather !== 2 ? 1 : 0) + found, 4 + pMod + secDiff('watch'), { sec: 'watch', mine: true });
    if (!ok) ok = await check(L(`ASDIC による魚雷発見（${RANGE_NAME[r]}）`, `ASDIC picks up the torpedo (${RANGE_NAME[r]})`), skill('asdic') + (close ? 1 : 0) + found, 3 + pMod + secDiff('asdic'), { sec: 'asdic', mine: true });
    if (ok) { found++; evBonus = Math.min(3, evBonus + 1); UI.story(story('torpedoSeen')); }
  }
  const P = 4 + SH().hull + (engineDamaged() ? 1 : 0);
  M.torp = 'C'; renderStatus();
  const ev = await check(L('魚雷の回避', 'Torpedo evasion'), 4 + evBonus, P, { mine: true });
  M.torp = null;
  if (ev) { UI.good(L('魚雷を回避した！', 'Torpedo evaded!')); UI.big(story('evadeOk'), 'good'); UI.story(story('evadeTalk')); J(L('本艦に向かう魚雷を回避。', 'Evaded a torpedo aimed at us.'), L('雷撃回避', 'torpedo evaded')); await UI.next(); return; }
  UI.bad(L('<b>魚雷が命中！</b>', '<b>Torpedo hit!</b>'));
  UI.big(story('hit'), 'bad');
  J(L('本艦、被雷。', 'We have been torpedoed.'), L('被雷', 'torpedoed'));
  await torpedoHit();
  await UI.next();
}
// 9.5.3 表A コルベット被雷損害
async function torpedoHit() {
  await roll(L('被雷の損害', 'torpedo damage'));
  const r = d6(), h = d3(), n = r <= 3 ? 0 : r - 3;
  UI.dice(L(`被雷損害 1d6＝${r}: 船体損害 1d3＝${h}${n ? `＋${n}区画損害` : ''}`, `Torpedo damage 1d6=${r}: hull damage 1d3=${h}${n ? L('', ` + ${n} section(s) damaged`) : ''}`));
  SH().hull += h;
  if (SH().hull >= 3) { SH().hull = 3; await corvetteLost(); return; }
  if (n) await sectionDamage(n);
}
// 12.3 乗艦の沈没
async function corvetteLost() {
  UI.bad(L(`<b>${SH().name}は沈没した……</b>（船体損害3 12.3）`, `<b>${SH().name} has sunk...</b> (hull damage 3, 12.3)`));
  UI.big(L(`${SH().name}は、冷たい北大西洋の波間に消えていった——`, `${SH().name} slipped beneath the cold waves of the North Atlantic——`), 'bad');
  J(L(`${SH().name}、沈没。`, `${SH().name} sunk.`), L('乗艦喪失', 'ship lost'));
  S.camp.shipsLost.push({ name: SH().name, date: fmtDate(), year: yearIndex(S.mission.start) });
  const v = await UI.choose(L('乗艦が沈没しました。どうしますか？', 'Your ship has sunk. What will you do?'), [
    { label: L('船団内の別のコルベットの指揮を執り、続ける', 'Take command of another corvette in the convoy and carry on'), value: 1, hint: L('1隻沈むごとに勝利レベルが1下がる', 'Each ship lost lowers the victory level by one') },
    { label: L('ここで終える', 'End here'), value: 0 }]);
  if (!v) throw new GameOver('sunk');
  const names = SHIP_NAMES.filter(n => n !== SH().name && !S.camp.shipsLost.some(x => x.name === n));
  const name = await UI.choose(L('新しい乗艦の艦名を選んでください', 'Choose the name of your new ship'), shuffle(names.slice()).slice(0, 6).map(n => ({ label: n, value: n })));
  const eq = Object.assign({}, SH().equipped);
  S.ship = newShip(name, eq);
  if (!eq.hh) SH().hhLeft = 0;
  UI.good(L(`${S.captain ? S.captain + '艦長は' : ''}${name}に移り、指揮を続ける。`, `${S.captain ? 'Captain ' + S.captain + ' moves' : 'You move'} to ${name} and carries on the fight.`));
}

// 9.6.1 ASDIC による探知
async function asdicDetect(ub, help, afterHH) {
  const A = skill('asdic') + (ub.rng === 'C' ? 1 : 0) + (ub.contact || afterHH ? 3 : 0) + (help.ease || 0);
  const P = evaEff(ub) + (ub.rng === 'L' ? 1 : 0) + secDiff('asdic');
  const ok = await check(L(`ASDIC による探知（${RANGE_NAME[ub.rng]}${ub.contact || afterHH ? '・接触中 +3' : ''}）`, `ASDIC search (${RANGE_NAME[ub.rng]}${ub.contact || afterHH ? ' · in contact +3' : ''})`), A, P, { sec: 'asdic', mine: true });
  ub.contact = ok;
  const yd = { C: 600 + 100 * Math.floor(Math.random() * 4), M: 1200 + 200 * Math.floor(Math.random() * 4), L: 2500 + 250 * Math.floor(Math.random() * 4) }[ub.rng];
  UI.story(story(ok ? 'asdicOk' : 'asdicNg', { brg: ST_brg(), yd: yd ? yd.toLocaleString() : '' }));
  return ok;
}
// 9.6.2 探知できなかった時。次のフェイズ（'9.5' / '9.6' / 'end'）を返す
async function lostContact(ub, opts) {
  ub.contact = false;
  if (ub.attacksLeft > 0) { ub.rng = ub.orig; UI.log(L(`U ボートを見失った。U ボートは${RANGE_NAME[ub.rng]}に戻り、再び攻撃してくる（9.6.2）`, `Lost the U-boat. It returns to ${RANGE_NAME[ub.rng]} range and attacks again (9.6.2)`), 'routine'); await UI.next(); return '9.5'; }
  const n = engineDamaged() ? 2 : 1;
  ub.rng = farther(ub.rng, n);
  if (ub.rng !== 'OUT') { UI.log(L(`U ボートは遠ざかる → <b>${RANGE_NAME[ub.rng]}</b>${n === 2 ? '（機関損傷で2段階）' : ''}`, `The U-boat draws away → <b>${RANGE_NAME[ub.rng]}</b>${n === 2 ? ' (two steps, engine damaged)' : ''}`), 'routine'); UI.story(story('ubAway')); return '9.6'; }
  UI.log(L('<b>U ボートは戦闘海域から撤退した。</b>', '<b>The U-boat has withdrawn from the battle area.</b>'), 'routine');
  UI.story(story('ubGone'));
  J(L('U ボートは戦闘海域から去った。', 'The U-boat left the battle area.'), L(`U ボート撤退${ub.damage ? '（損害 ' + ub.damage + '）' : ''}`, `U-boat withdrew${ub.damage ? ' (damage ' + ub.damage + ')' : ''}`));
  S.mission.ubPool.push(ub.id);
  if (!opts.noWolf && !opts.reinforce && !opts.cryptic && !S.mission.flags.noWolfpack) await wolfpack(ub);
  return 'end';
}
// 群狼戦術（9.6.2）: 1d6 − U ボートの損害 ＋ 洋上補給（14.17）
async function wolfpack(ub) {
  if (S.mission.flags.refuel) UI.bad(L('護衛艦の1隻が洋上補給で離れているため、群狼が集まりやすい（群狼戦術表 +1・14.17）', 'One escort is away refuelling, so the wolfpack gathers more easily (wolfpack table +1, 14.17)'));
  await roll(L('群狼戦術', 'wolfpack'));
  const r = d6(), mod = -ub.damage + (S.mission.flags.refuel ? 1 : 0), t = r + mod;
  const n = t <= 2 ? 0 : t === 3 ? 1 : t <= 5 ? 2 : 3;
  UI.dice(L(`群狼戦術 1d6＝${r}${mod ? (mod > 0 ? '＋' : '') + mod : ''} → ${n ? `<b>${n}隻が来援！</b>` : '来援せず'}`, `Wolfpack 1d6=${r}${mod ? (mod > 0 ? '+' : '') + mod : ''} → ${n ? L('', `<b>${n} more U-boat(s) arrive!</b>`) : 'none arrive'}`));
  if (n) { UI.big(story('wolf'), 'bad'); J(L('群狼が集結しつつある。', 'A wolfpack is gathering.'), L(`U ボート ${n}隻来援`, `${n} U-boat(s) arrive`)); }
  await UI.next();
  for (let i = 0; i < n; i++) {
    const ub2 = drawUboat();
    if (!ub2) break;
    UI.log(L(`来援 ${i + 1}隻目`, `arrival ${i + 1}`));
    await engage(ub2, { reinforce: true });
  }
}

// 9.6.4 爆雷攻撃（weapon='dc'）／13.2 ヘッジホッグ（'hh'）。結果: 'continue' か、撃沈などの結果
async function depthCharge(ub, weapon, opts, over) {
  over = over || {};
  const isHH = weapon === 'hh';
  const name = isHH ? L('ヘッジホッグ', 'Hedgehog') : L('爆雷', 'Depth charge');
  const ammoKey = isHH ? 'hhLeft' : 'dcLeft';
  let n = 4;
  if (!over.free) {
    const left = SH()[ammoKey];
    if (left <= 0) return null;
    const mx = Math.min(4, left);
    n = await UI.choose(storyOn() ? L(`${isHH ? '水雷長「ヘッジホッグ、何発撃ちますか！」' : story('dcAsk')}（残り${left}発・1発がダイス1個）`, `${isHH ? 'Torpedo officer: "How many Hedgehog bombs, sir?"' : story('dcAsk')} (${left} left · one die per charge)`) : L(`${name}攻撃: ダイスを何個振りますか？（同じ数だけ${name}を使う。残り${left}）`, `${name} attack: how many dice? (uses the same number of ${name}s, ${left} left)`),
      Array.from({ length: mx }, (_, i) => ({ label: storyOn() ? L(`「${mx - i}発、${isHH ? '撃て' : '投下せよ'}！」`, `"${mx - i}, ${isHH ? L('', 'fire') : L('', 'drop')}!"`) : L(`${mx - i}個`, `${mx - i}`), value: mx - i }))
        .concat(isHH ? [] : [{ label: storyOn() ? L('「待て。投下するな」（0発・温存）', '"Hold it. Don\'t drop." (0 · keep them)') : L('0個（投下しない・温存）', '0 (don\'t drop · keep them)'), value: 0, hint: L('外れと同じ扱い。爆発音がないので ASDIC の接触は保たれる', 'Treated as a miss. No explosions, so ASDIC contact is kept') }]));
    if (n === 0) {
      UI.log(L('爆雷を投下しなかった（温存）。外れと同じ扱いで続ける。爆発音がないので ASDIC の接触は保たれる', 'No depth charges dropped (kept). Treated as a miss. No explosions, so ASDIC contact is kept'), 'routine');
      UI.story(ST_pick([L('水雷長「投下待て！」——艦尾の爆雷が、レールの上で止まった。ASDIC の音だけが規則正しく響く。', 'Torpedo officer: "Hold the drop!"——The charges stop on the stern rails. Only the ASDIC keeps its steady rhythm.'), L('「まだだ。落とすな」——爆雷は温存した。ピーン……という音が、敵の位置をつかんだまま離さない。', '"Not yet. Don\'t drop."——The charges are held back. The ping keeps its grip on the enemy\'s position.')]));
      return 'hold';
    }
    SH()[ammoKey] -= n;
  }
  UI.story(story(isHH ? 'hh' : 'dc'));
  const sk = over.skill != null ? over.skill : skill('dc');
  const evaCmp = (over.eva != null ? over.eva : evaEff(ub)) + (over.free ? 0 : secDiff(weapon));
  await roll(L(`${name}の命中`, `${name} hits`));
  const target = d6();
  let hits = 0;
  if (sk <= evaCmp && (target === 1 || target === 6)) UI.dice(L(`${name}攻撃: 目標値 ${target} → スキル${sk}が回避値${evaCmp}以下なので失敗`, `${name} attack: target ${target} → fails, skill ${sk} not above evasion ${evaCmp}`));
  else {
    let rs = Array.from({ length: n }, d6);
    UI.dice(L(`${name}攻撃: 目標値 ${target}、1d6×${n}＝${rs.join('・')}`, `${name} attack: target ${target}, 1d6×${n}=${rs.join(' · ')}`));
    if (!over.free && S.mission.tokens.skilled && rs.some(x => x !== target)) {
      (S.mission.tokens.seen || (S.mission.tokens.seen = {})).skilled = true;
      const v = await UI.choose(L('「巧みな操艦」（ランダム・イベントで得ていた）で、外れたダイスを2個まで振り直しますか？（14.16）', 'Use "Skilled Shiphandling" (from a random event) to re-roll up to 2 missed dice? (14.16)'), [{ label: L('振り直す', 'Re-roll'), value: 1 }, { label: L('そのまま', 'Keep it'), value: 0 }]);
      if (v) { S.mission.tokens.skilled = 0; let k = 0; rs = rs.map(x => (x !== target && k++ < 2) ? d6() : x); UI.dice(L(`（振り直し）${rs.join('・')}`, `(re-roll) ${rs.join(' · ')}`)); }
    }
    hits = rs.filter(x => x === target).length;
  }
  ub.damage += hits;
  UI.log(L(`${name}の損害: <b>${hits}</b>（U ボートの損害 計${ub.damage}）`, `${name} damage: <b>${hits}</b> (U-boat damage total ${ub.damage})`), 'ubdmg');
  UI.log(L(`${name}攻撃を終えた。結果は分からない。`, `${name} attack over. The result is unknown.`), 'ubdmg-alt');
  const res = await damageOutcome(ub, hits, weapon, opts);
  if (res === 'continue' && S.settings.hideEnemy) UI.story(story('dcUnknown'));
  return res;
}
// 損害の結果（9.6.4 / 13.2 / 14.15）
async function damageOutcome(ub, hits, weapon, opts) {
  opts = opts || {};
  if (opts.cryptic && ub.damage >= 3) { UI.good(L('U ボートは浮上し、乗員は脱出して自沈した（14.15）', 'The U-boat surfaced; the crew abandoned and scuttled her (14.15)')); return await killUboat(ub, 'certain'); }
  if (weapon === 'hh') {
    if (hits >= 2) return await killUboat(ub, 'certain');
    if (hits === 1) return await killUboat(ub, 'sunk');
  } else {
    if (hits >= 4) return await killUboat(ub, 'certain');
    if (hits === 3) return await killUboat(ub, 'sunk');
  }
  if (ub.damage >= 4) return await killUboat(ub, 'destroyed');
  return 'continue';
}
async function killUboat(ub, kind) {
  const M = S.mission;
  const txt = { certain: L('撃沈確実', 'certain kill'), sunk: L('撃沈', 'sunk'), destroyed: L('撃破', 'destroyed'), shared: L('撃沈（共同）', 'sunk (shared)') }[kind];
  if (kind !== 'shared') UI.story(story(ub.surfaced ? 'kill.leadGun' : 'kill.lead'));
  UI.big(story('kill.' + kind), 'good');
  UI.story(story(kind === 'certain' && Math.random() < 0.5 ? 'kill.cheerCertain' : 'kill.cheer'));
  UI.good(L(`★ <b>${ubName(ub)}を${txt}！</b>`, `★ <b>${ubName(ub)}: ${txt}!</b>`));
  J(L(`U ボート（${ub.type === 7 ? 'VII' : 'IX'}型 ${ub.id}）を${txt}。`, `U-boat (Type ${ub.type === 7 ? 'VII' : 'IX'} ${ub.id}): ${txt}.`), `★ ${txt}`);
  if (kind === 'certain') UI.good(L('U ボートは浮上し、乗組員は艦を放棄した。艦長に殊勲十字章が与えられる。', 'The U-boat surfaced and her crew abandoned ship. The captain is awarded the Distinguished Service Cross.'));
  if (kind === 'sunk') UI.good(L('燃料を流出させた U ボートは撤退した。艦長に柏葉敢闘章（公式報告に名前が載る）。', 'The U-boat, trailing fuel, withdrew. The captain is Mentioned in Despatches.'));
  if (kind === 'destroyed') UI.good(L('港の士官食堂で、悪くない祝宴が開かれるだろう。', 'There will be a decent celebration in the wardroom ashore.'));
  const rec = { id: ub.id, kind, date: fmtDate(), ship: SH().name };
  S.camp.kills.push(rec); M.kills.push(rec);
  if (kind !== 'shared') SH().dcKill = true;
  if (kind === 'certain') {
    S.camp.medals.push(L(`${fmtDate()} 殊勲十字章（${ub.id} 撃沈確実）`, `${fmtDate()} DSC (${ub.id} certain kill)`));
    await enigma();
  }
  if (kind === 'sunk') S.camp.medals.push(L(`${fmtDate()} 柏葉敢闘章（${ub.id} 撃沈）`, `${fmtDate()} Mentioned in Despatches (${ub.id} sunk)`));
  await UI.next();
  return kind;
}
// エニグマと暗号表の回収（9.6.4）
async function enigma() {
  const secs = ['watch', 'asdic', 'gun4', 'aa', 'dc', 'engine'].concat(['radar', 'hfdf'].filter(k => SH().equipped[k]));
  const k = await UI.choose(say(L('放棄された U ボートからエニグマと暗号表の回収を試みますか？ 回収班を出す区画を選んでください', 'Try to recover the Enigma and code books from the abandoned U-boat? Choose the section to send the boarding party from'), 'enigmaAsk'), secs.map(s => ({ label: SECTION_NAME[s], value: s })).concat([{ label: L('回収を試みない', 'Don\'t try'), value: null }]));
  if (!k) return;
  await roll(L('エニグマの回収', 'Enigma recovery'));
  const r = d66();
  if (r === 11) { SH().perm[k] = (SH().perm[k] || 0) + 1; UI.bad(L(`d66＝${r}: U ボートは回収班を道連れに沈没した。${SECTION_NAME[k]}にこの航海の間 困難+1`, `d66=${r}: The U-boat sank, taking the boarding party with her. ${SECTION_NAME[k]} difficulty +1 for the rest of the voyage`)); }
  else if (r === 66) { UI.good(L(`d66＝${r}: <b>エニグマと暗号表の回収に成功！</b> ヴィクトリア十字章を推薦されるが、機密保持のため国王から殊勲十字章が授与される`, `d66=${r}: <b>Enigma and code books recovered!</b> Recommended for the Victoria Cross, but for secrecy the King awards the DSC instead`)); S.camp.medals.push(L(`${fmtDate()} 殊勲十字章（エニグマ回収）`, `${fmtDate()} DSC (Enigma recovery)`)); }
  else UI.log(L(`d66＝${r}: 回収は失敗したが、罰則はない。`, `d66=${r}: The recovery failed, but there is no penalty.`));
}
// 14.13 エア・ギャップ: 別の護衛艦が ASDIC 探知と爆雷攻撃を2回行う（護衛艦のスキルは1とする）
async function escortHelp(ub) {
  UI.log(L('<b>別の護衛艦が手助けに来た！</b>（14.13）', '<b>Another escort comes to help!</b> (14.13)'));
  for (let i = 1; i <= 2; i++) {
    const ok = await check(L(`護衛艦の ASDIC 探知 ${i}`, `Escort's ASDIC search ${i}`), 1 + (ub.rng === 'C' ? 1 : 0), evaEff(ub) + (ub.rng === 'L' ? 1 : 0));
    if (!ok) continue;
    const r = await depthCharge(ub, 'dc', {}, { free: true, skill: 1 });
    if (r !== 'continue') return r;
  }
  return 'continue';
}

// ===================== ランダム・イベント（14.0）=====================
function drawRE() {
  const M = S.mission;
  if (!M.rePool.length) return null;
  return M.rePool.splice(Math.floor(Math.random() * M.rePool.length), 1)[0];
}
const backRE = n => S.mission.rePool.push(n);
async function randomEvent() {
  const M = S.mission;
  const n = drawRE();
  if (!n) { UI.log(L('ランダム・イベントのプールが空です。', 'The random event pool is empty.')); return; }
  const sec = sectorOf(M.pos), w = M.weather;
  // 不利なイベント（空襲・借りは返す・洋上補給の失敗）は、オプションで伏せられる（効果が出た時に分かる）
  const H = L(`◇ ランダム・イベント ${n}「${RE_NAME[n]}」`, `◇ Random event ${n}: "${RE_NAME[n]}"`);
  J(L(`ランダム・イベント「${RE_NAME[n]}」。`, `Random event "${RE_NAME[n]}".`), L('イベント', 'event'));
  const headBad = () => { UI.log(H, 'head badev'); UI.log(L('◇ ランダム・イベント（内容は伏せられている）', '◇ Random event (contents hidden)'), 'head badev-alt'); };
  if ([1, 10, 13, 14, 16, 17, 20].indexOf(n) < 0) UI.head(H);
  else if ([1, 13, 16].indexOf(n) >= 0) headBad();
  const none = msg => { UI.log(L(`${msg ? msg + '　' : ''}イベントなし。マーカーはプールに戻す。`, `${msg ? msg + ': ' : ''}no event. The marker goes back into the pool.`)); backRE(n); };
  switch (n) {
    case 1: M.tokens.luck = 1; UI.storyHid(L('副長「艦長、今日はどうも運が向いている気がしますな」', 'First Lieutenant: "Captain, I\'ve a feeling our luck is in today."')); UI.log(L('幸運に恵まれた。目的地に着くまでに1回、判定のダイスを振り直せる（14.1）', 'Fortune smiles on you. Once before reaching the destination, you may re-roll a check (14.1)'), 'good badev'); break;
    case 2: { // 生存者発見
      if (w >= 2) return none(L('霧／雪・暴風雨のため', 'Because of fog/snow or storm'));
      UI.log(L('小艇に乗った漂流者を発見し、救助に向かう。', 'Survivors spotted in a small boat; going to their rescue.'));
      UI.story(L('見張り長「右舷前方に小艇！ 人が乗っています！」——艦を寄せ、縄梯子を下ろす。', 'Chief Lookout: "Small boat fine on the starboard bow! There are people in it!"——We close and lower the scrambling nets.'));
      await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
      const r = d66(); UI.dice(`d66＝${r}`);
      if (r === 11 || r === 66) { UI.story(L('救助のさなか、聴音員が叫んだ。「魚雷音！ 近い！」', 'In the middle of the rescue the hydrophone operator shouts: "Torpedo! Close!"')); UI.bad(L('U ボートが近距離からコルベットを雷撃！', 'A U-boat torpedoes the corvette at close range!')); await torpedo('C', {}); }
      else { UI.good(L('漂流者を救助した。', 'The survivors were rescued.')); UI.story(L('凍えた生存者たちが毛布にくるまれ、熱い紅茶を手にしている。「ありがとう……ありがとう……」', 'The frozen survivors sit wrapped in blankets, mugs of hot tea in their hands. "Thank you... thank you..."')); J(L('漂流者を救助。', 'Survivors rescued.'), L('生存者救助', 'survivors rescued')); }
      break;
    }
    case 3: { // 油膜発見
      if (w === 3) return none(L('暴風雨のため', 'Because of the storm'));
      UI.story(L('見張り「海面に油膜！ かなり広がっています」', 'Lookout: "Oil slick on the water! A big one!"'));
      await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
      const r = d6(); UI.dice(L(`海面に油膜。1d6＝${r}`, `Oil slick on the water. 1d6=${r}`));
      if (r <= 3) { UI.log(L('何も発見できない。', 'Nothing found.')); UI.story(L('しばらく周辺を捜索したが、何も見つからなかった。', 'We searched the area for a while but found nothing.')); backRE(n); }
      else if (r <= 5) {
        if (!M.stragglers) return none(L('落伍船がいないので', 'No stragglers, so'));
        M.stragglers--; M.size++; UI.good(L('落伍船1隻を発見、船団に合流させた。', 'Found a straggler and brought her back to the convoy.')); UI.story(L('油膜の先に、はぐれた商船がいた。信号灯で呼びかけ、船団へ連れ戻す。', 'Beyond the slick lay a lost merchantman. We hailed her by signal lamp and led her back to the convoy.')); J(L('落伍船1隻を発見し、船団に戻す。', 'Found a straggler and returned her to the convoy.'), L('落伍船 合流', 'straggler rejoins')); backRE(n);
      } else {
        UI.story(L('聴音員「油膜の下に反応……傷ついた U ボートです！」', 'Hydrophone operator: "Contact under the slick... it\'s a damaged U-boat!"'));
        UI.log(L('損傷した U ボート（潜航中・回避値3・既に2損害）から燃料が漏れていた。攻撃を開始する。', 'A damaged U-boat (submerged · evasion 3 · already 2 damage) is leaking fuel. Attacking.'));
        const ub = { id: L('損傷Uボート', 'damaged U-boat'), type: 7, range: 'C', atk: 0, eva: 3, attacksLeft: 0, damage: 2, rng: 'C', surfaced: false, contact: false, sieg: false, hhUsed: true };
        M.ub = ub;
        if (await asdicDetect(ub, { ease: 0 })) {
          if (SH().dcLeft > 0) { const res = await depthCharge(ub, 'dc', {}); if (res === 'continue') UI.log(L('U ボートは接触を断った。', 'The U-boat broke contact.')); }
        } else UI.log(L('探知できなかった。U ボートは接触を断った。', 'No contact. The U-boat broke away.'));
        M.ub = null; backRE(n);
      }
      break;
    }
    case 4: // 機雷／ソナーに感
      if (sec === 'W') {
        UI.story(L('見張り長「前方に浮遊機雷！ ゆっくり船団に近づいています！」——「対空砲、撃ち方用意！」', 'Chief Lookout: "Floating mine ahead! Drifting slowly towards the convoy!"——"AA gun, stand by!"'));
        UI.log(L('浮遊する機雷がゆっくり船団に近づいている！ 対空砲で爆破を試みる（14.4.1）', 'A floating mine drifts slowly towards the convoy! Trying to explode it with the AA gun (14.4.1)'));
        await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
        for (const r of ['L', 'M', 'C']) {
          if (await check(L(`対空砲で機雷を爆破（${RANGE_NAME[r]}）`, `Exploding the mine with the AA gun (${RANGE_NAME[r]})`), skill('aa'), 4 + secDiff('aa'), { sec: 'aa', mine: true })) { UI.good(L('機雷を爆破した。', 'The mine was exploded.')); UI.story(L('対空砲が吠え、機雷は水柱とともに砕け散った。', 'The AA gun barks, and the mine bursts in a column of water.')); J(L('浮遊機雷を対空砲で爆破。', 'Exploded a floating mine with the AA gun.'), L('機雷処分', 'mine destroyed')); backRE(n); return; }
        }
        UI.story(L('当たらない！ 機雷はもう目の前だ——「取舵いっぱい！」', 'Missed! The mine is right ahead——"Hard a-port!"'));
        if (await check(L('機雷の回避', 'Mine evasion'), 4, 4, { mine: true })) { UI.good(L('機雷を回避した。', 'Avoided the mine.')); UI.story(L('艦はぎりぎりで機雷をかわした。誰かが大きく息を吐いた。', 'The ship slides past the mine with feet to spare. Someone lets out a long breath.')); }
        else { UI.bad(L('<b>機雷に接触！</b>', '<b>Struck the mine!</b>')); UI.big(L('轟音。機雷が艦腹で炸裂した！', 'A roar. The mine bursts against our side!'), 'bad'); J(L('浮遊機雷に接触。', 'Struck a floating mine.'), L('触雷', 'mined')); await torpedoHit(); }
        backRE(n);
      } else {
        if (w === 3) return none(L('暴風雨のため', 'Because of the storm'));
        UI.story(L('聴音員「ASDIC に反応！ 何かいます！」', 'Hydrophone operator: "ASDIC contact! Something\'s there!"'));
        await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
        const r = d6(); UI.dice(L(`ソナーに感あり（14.4.2）。1d6＝${r}`, `Sonar contact (14.4.2). 1d6=${r}`));
        if (r <= 3) { UI.log(L('鯨だった。', 'It was a whale.')); UI.story(L('……鯨だった。巨大な影が悠々と船団の下をくぐっていく。', '...a whale. A huge shadow glides unhurried beneath the convoy.')); backRE(n); }
        else if (r <= 5) { UI.log(L('水中漂流物だった。', 'It was underwater wreckage.')); UI.story(L('……沈んだ船の残骸だった。誰も口をきかなかった。', '...the wreck of a sunken ship. Nobody said a word.')); backRE(n); }
        else { UI.story(L('「本物です！ U ボートです！」', '"It\'s real! A U-boat!"')); UI.bad(L('U ボート発見！', 'U-boat found!')); await uboatEvent({ noWolf: true }); }
      }
      break;
    case 5: { // 落水
      const r = d6(); const k = r <= 2 ? 'watch' : r === 3 ? 'aa' : r <= 5 ? 'gun4' : 'dc';
      SH().perm[k] = (SH().perm[k] || 0) + 1;
      UI.story(L(`「人が落ちた！」——荒れた海に、もう乗員の姿は見えない。${SECTION_NAME[k]}の部署に穴が空いた。`, `"Man overboard!"——In the heavy sea there is no sign of him. The ${SECTION_NAME[k]} crew is a man short.`));
      UI.bad(L(`乗員が海に落ちて行方不明に（1d6＝${r}）。この任務中、${SECTION_NAME[k]}に修理できない困難+1`, `A crewman was lost overboard (1d6=${r}). For this mission the ${SECTION_NAME[k]} has an unrepairable difficulty +1`));
      J(L(`乗員1名、落水して行方不明。`, `One man lost overboard.`), L(`${SECTION_NAME[k]} 困難+1`, `${SECTION_NAME[k]} difficulty +1`));
      break;
    }
    case 6: { // 潜望鏡発見
      if (w === 3) return none(L('暴風雨のため', 'Because of the storm'));
      UI.story(L(`通信長「船団司令より。中央の船が潜望鏡らしきものを発見！」　${S.captain ? S.captain + '艦長' : '艦長'}は調査を命じた。`, `Telegraphist: "From the convoy commodore. A ship in the centre reports a periscope!"　${S.captain ? 'Captain ' + S.captain : 'The captain'} orders a search.`));
      await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
      const r = d6(); UI.dice(L(`中央の船が潜望鏡を発見との連絡。調査する 1d6＝${r}`, `A ship in the centre reports a periscope. Investigating, 1d6=${r}`));
      if (r <= 3) { UI.log(L('何も見つからない。', 'Nothing found.')); UI.story(L('付近を捜索したが、何も見つからない。見間違いだったのだろうか。', 'We searched the area and found nothing. A false sighting, perhaps.')); backRE(n); }
      else if (r <= 5) { UI.log(L('誰かが海に落としたモップだった。', 'It was a mop someone had dropped overboard.')); UI.story(L('……波間に浮かんでいたのは、誰かが海に落としたモップだった。艦橋に乾いた笑いが広がる。', '...bobbing in the waves was a mop somebody had dropped over the side. A dry laugh spreads across the bridge.')); backRE(n); }
      else { UI.story(L('見張り長「潜望鏡です！ 本物です！」', 'Chief Lookout: "Periscope! It\'s real!"')); UI.bad(L('U ボート発見！', 'U-boat found!')); await uboatEvent({ noWolf: true }); }
      break;
    }
    case 7: // 氷山
      if (sec === 'C') { const dd = (M.convoy.speed === 'fast' ? 1 : 1.5) + (w === 3 ? 0.5 : 0); advanceDays(dd); UI.story(L('見張り「前方に氷山！」——巨大な白い壁が霧の中から現れた。船団は大きく迂回せざるを得ない。', 'Lookout: "Iceberg ahead!"——A huge white wall looms out of the fog. The convoy has to make a wide detour.')); UI.bad(L(`氷山を迂回するため${dd}日を浪費した → ${fmtDate()}`, `Detouring round the icebergs cost ${dd} day(s) → ${fmtDate()}`)); J(L('氷山を迂回。', 'Detoured round icebergs.'), L(`${dd}日を浪費`, `${dd} day(s) lost`)); backRE(n); }
      else if (sec === 'A') { UI.story(L('見張りが帆を張った小艇を発見する。艇内で6人が身を寄せ合っているが反応がない。艦を横付けすると、全員が死んでからしばらく経っていることがわかった……（ゲームには影響なし）', 'The lookouts spot a small boat under sail. Six people huddle together inside, but none of them moves. Coming alongside, we find they have all been dead for some time... (no effect on the game)')); }
      else {
        UI.story(L('通信長「司令部より。アンソン機が付近に墜落、乗員を捜索せよ」', 'Telegraphist: "From HQ. An Anson has come down nearby; search for the crew."'));
        UI.log(L('墜落したアブロ・アンソン機の乗員の捜索を命じられた（14.7）', 'Ordered to search for the crew of a downed Avro Anson (14.7)'));
        await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
        let ok = false;
        for (const [r, a, p] of [['L', 0, 1], ['M', 0, 0], ['C', 1, 0]]) {
          if (await check(L(`捜索（${RANGE_NAME[r]}）`, `Search (${RANGE_NAME[r]})`), skill('watch') + a, 3 + p + secDiff('watch'), { sec: 'watch', mine: true })) { ok = true; break; }
        }
        if (ok) { S.camp.equipShift -= 1; UI.story(L('波間の救命筏に、手を振る人影！ 引き上げてみると、新兵器を開発する科学者——「ボフィン」だった。', 'A figure waving from a life raft! We haul him aboard: a scientist who develops new weapons——a "boffin".')); UI.good(L('ボフィン（科学者）の救出に成功！ 新兵器の装備が1カ月早まる。', 'The boffin is rescued! New equipment arrives one month earlier.')); J(L('墜落機の乗員（科学者）を救出。', 'Rescued the crew of the downed aircraft (a scientist).'), L('新兵器 1カ月早まる', 'new equipment one month earlier')); }
        else { S.camp.equipShift += 1; UI.story(L('日が暮れるまで捜したが、筏は見つからなかった。', 'We searched until dark but never found the raft.')); UI.bad(L('救出失敗。技術的な後退で、新兵器の装備が1カ月遅れる。', 'The rescue failed. A technical setback delays new equipment by one month.')); J(L('墜落機の乗員を発見できず。', 'Could not find the crew of the downed aircraft.'), L('新兵器 1カ月遅れる', 'new equipment one month later')); }
      }
      break;
    case 8: { // キャッチアップ
      if (w === 3) { UI.log(L('暴風雨なので、別のマーカーを引き直す。', 'It is a storm, so draw another marker.')); backRE(n); return await randomEvent(); }
      UI.story(L('通信長「司令部より、船団後方で落伍した3隻を支援せよ」——現場に急行すると、砲声が聞こえる。浮上した U ボートが商船を砲撃している！', 'Telegraphist: "From HQ: support the three stragglers astern of the convoy."——Racing to the scene, we hear gunfire. A surfaced U-boat is shelling a merchantman!'));
      UI.log(L('落伍した3隻の支援を命じられた。現場に向かうと、浮上中の U ボートが1隻を砲撃中だった！', 'Ordered to support three stragglers. On arrival, a surfaced U-boat is shelling one of them!'));
      await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
      const ub = drawUboat();
      if (!ub) break;
      const res = await engage(ub, { catchup: true });
      if (res === 'none') backRE(n);
      break;
    }
    case 9: { // 海軍本部からの情報
      const c = cellAt(M.pos);
      const adj = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = c.r + dr, cc = c.c + dc, t = MAP_ROWS[r] && MAP_ROWS[r][cc];
        if (!t || PORT_POS[t]) continue;
        const k = key(r, cc);
        if (!M.revealed[k]) adj.push(k);
      }
      if (!adj.length) { UI.log(L('隣のマスのマーカーは全部わかっている。', 'All the markers in the adjacent squares are already known.')); break; }
      UI.story(L('通信長「海軍本部より緊急電。船団の進路上に群狼が待ち伏せしている模様！」', 'Telegraphist: "Most urgent from the Admiralty. A wolfpack lies in wait on the convoy\'s route!"'));
      const k = await UI.choose(storyOn() ? L('航海長「どの海域を確かめますか、艦長」', 'Navigator: "Which area shall we check, sir?"') : L('群狼の待ち伏せの情報。隣のマスのマーカーを1つ表にします。どこを調べますか？', 'Intelligence on a wolfpack ambush. Reveal one marker in an adjacent square. Which one?'), adj.map(x => ({ label: storyOn() ? L(`「${placeName(x)}を確かめろ」`, `"Check ${placeName(x)}."`) : placeName(x), value: x })));
      M.revealed[k] = true;
      UI.good(L(`${placeName(k)}のマーカーは「<b>${evName(M.events[k])}</b>」`, `The marker in ${placeName(k)} is "<b>${evName(M.events[k])}</b>"`));
      UI.story(M.events[k] === 'UB' ? L(`通信長「${placeName(k)}……います。U ボートの発信が集中しています」`, `Telegraphist: "${placeName(k)}... they're there. U-boat transmissions are concentrated there."`) : M.events[k] === 'RE' ? L(`通信長「${placeName(k)}……何かがありそうですが、よく分かりません」`, `Telegraphist: "${placeName(k)}... there may be something, sir, but I can't be sure."`) : L(`通信長「${placeName(k)}は、静かなものです」`, `Telegraphist: "${placeName(k)} is quiet."`));
      break;
    }
    case 10: headBad(); S.camp.airRaid = true; UI.storyHid(L('通信長「リバプール方面で、ドイツ軍機の活動が活発になっているとの情報です」', 'Telegraphist: "Reports say German air activity is increasing around Liverpool."')); UI.log(L('次に船団がリバプールへ着いた直後に、ドイツ軍の空襲を受ける（マーカーをリバプールに置く）', 'The next time the convoy reaches Liverpool, it will be bombed on arrival (place the marker on Liverpool)'), 'bad badev'); break;
    case 11: // 敵機／ミルヒ・クー
      if (sec === 'W') { const dd = (M.convoy.speed === 'fast' ? 1 : 1.5) + (w === 3 ? 0.5 : 0); advanceDays(dd); UI.story(L('見張り長「上空に大型機！ FW200 コンドルです！」——コンドルは対空砲の届かない高さで、ゆっくりと船団の周りを旋回している……', 'Chief Lookout: "Large aircraft overhead! An FW 200 Condor!"——The Condor circles the convoy slowly, well beyond the reach of the AA gun...')); UI.bad(L(`FW200 が船団を発見して引き返した。群狼を呼んだかもしれない。警戒しながら進むため${dd}日を浪費 → ${fmtDate()}`, `The FW 200 spotted the convoy and turned away. It may have called the wolfpack. Proceeding with caution costs ${dd} day(s) → ${fmtDate()}`)); }
      else {
        UI.story(L('見張り「水平線に艦影——潜水艦が2隻、並んでいます！」 補給中のミルヒ・クーだ。慌てて潜航した跡に、ゴムボートが取り残されている。', 'Lookout: "Ships on the horizon——two submarines side by side!" A Milch Cow, refuelling. Where they crash-dived, a rubber dinghy is left drifting.'));
        UI.log(L('洋上で U ボートに補給中のミルヒ・クーを発見！ 位置が特定された。回避値1の U ボートに爆雷攻撃を1回行う（14.11）', 'A Milch Cow refuelling U-boats at sea! Her position is fixed. One depth charge attack against an evasion-1 U-boat (14.11)'));
        await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
        const ub = { id: L('ミルヒ・クー', 'Milch Cow'), type: 7, range: 'C', atk: 0, eva: 1, attacksLeft: 0, damage: 0, rng: 'C', surfaced: false };
        if (SH().dcLeft > 0) {
          const res = await depthCharge(ub, 'dc', {});
          if (res === 'certain' || res === 'sunk') { M.flags.noWolfpack = true; UI.story(L('爆雷の衝撃のあと、海面に重油が湧き上がった！', 'After the depth charges, heavy oil wells up to the surface!')); UI.good(L('U ボートは補給困難となり、この任務の間 群狼戦術を使えない。', 'Resupply is disrupted: the U-boats cannot use wolfpack tactics for the rest of this mission.')); }
        }
      }
      break;
    case 12: { // 救助要請
      if (w === 3) return none(L('暴風雨のため', 'Because of the storm'));
      UI.story(L('見張り「前方に損傷した商船！ 救助を求める信号を出しています！」——機関長たちが乗り移った。', 'Lookout: "Damaged merchantman ahead! She\'s signalling for help!"——The Chief and his men go across.'));
      UI.log(L('前の船団の落伍船と遭遇。損傷していて修理が必要だ。', 'We meet a straggler from an earlier convoy. She is damaged and needs repairs.'));
      await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
      if (await check(L('落伍船の修理', 'Repairing the straggler'), skill('engine'), 2 + secDiff('engine'), { sec: 'engine', mine: true })) {
        const t = (d6() + 6) * 1000; M.reduce += t; UI.story(L('半日がかりの修理の末、商船の機関が息を吹き返した。汽笛が礼を言うように鳴った。', 'After half a day\'s work, the merchantman\'s engine coughs back to life. Her whistle sounds, as if to say thank you.')); UI.good(L(`修理成功。この任務の喪失トン数が ${t.toLocaleString()}トン軽減される。`, `Repaired. This mission's lost tonnage is reduced by ${t.toLocaleString()} tons.`)); J(L('前の船団の落伍船を修理し、救う。', 'Repaired and saved a straggler from an earlier convoy.'), L(`喪失 ${t.toLocaleString()}トン軽減`, `lost tonnage reduced by ${t.toLocaleString()} tons`));
      } else { UI.log(L('修理できなかった（罰則なし）。', 'Could not repair her (no penalty).')); UI.story(L('手は尽くしたが、商船の機関は直らなかった。', 'We did all we could, but her engine would not run.')); }
      break;
    }
    case 13: // たゆまぬ努力
      if (sec === 'A') { M.flags.escort = true; UI.storyHid(L('通信長「僚艦より。手が空いたので、こちらの支援に回るそうです」', 'Telegraphist: "From another escort: she\'s free and is coming to support us."')); UI.log(L('次に U ボートが攻撃する時、別の護衛艦が手助けしてくれる（ASDIC 探知・爆雷攻撃を2回）。', 'The next time a U-boat attacks, another escort will help (ASDIC search and depth charge attack, twice).'), 'good badev'); }
      else { M.flags.sunderland = true; UI.storyHid(L('通信長「沿岸航空隊より。サンダーランド機が船団の上空を哨戒するとのことです」', 'Telegraphist: "From Coastal Command: a Sunderland will patrol over the convoy."')); UI.log(L('次に U ボートが攻撃する時、サンダーランド機が対潜攻撃を行う（霧／雪では不可）。', 'The next time a U-boat attacks, a Sunderland makes an anti-submarine attack (not in fog/snow).'), 'good badev'); }
      break;
    case 14: // 酒保開け
      if (w === 0) { UI.head(H); return none(L('好天なので', 'The weather is fair, so')); }
      headBad(); M.tokens.rum = 1; UI.storyHid(L('副長「艦長、乗員たちがだいぶ参っています」——「天気が回復したら、ラム酒を出すと伝えろ」', 'First Lieutenant: "Captain, the men are pretty worn down."——"Tell them there\'ll be rum when the weather clears."')); UI.log(L('天候が回復したら乗員にラム酒を振る舞うと約束した。好天の時に1回、判定のダイスを振り直せる。', 'You promised the crew a tot of rum when the weather clears. In fair weather, you may re-roll a check once.'), 'good badev');
      break;
    case 15: { // 暗号通信
      UI.story(L('聴音員「微弱な反応……潜望鏡深度の U ボートです！ 通信を送ろうとしているようです！」', 'Hydrophone operator: "Faint contact... a U-boat at periscope depth! She seems to be trying to transmit!"'));
      UI.log(L('損傷した U ボートが重要な通信を送るため、潜望鏡深度まで浮上した！', 'A damaged U-boat has come up to periscope depth to send an important signal!'));
      await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
      const ub = drawUboat();
      if (!ub) break;
      const res = await engage(ub, { cryptic: true, noWolf: true });
      if (res === 'none') backRE(n);
      break;
    }
    case 16: M.tokens.skilled = 1; UI.storyHid(L('航海長「この艦の癖が、ようやく掴めてきましたよ」', 'Navigator: "I\'m finally getting the feel of how she handles, sir."')); UI.log(L('「巧みな操艦」: 爆雷攻撃の時に1回、外れたダイスを2個まで振り直せる。', '"Skilled Shiphandling": once in a depth charge attack, re-roll up to 2 missed dice.'), 'good badev'); break;
    case 17: { // 洋上補給
      const dist = distances()[M.pos];
      const r = d6();
      if (r >= dist) { UI.head(H); UI.dice(L(`護衛艦の1隻の燃料が乏しい。目的地まで${dist}マス、1d6＝${r}`, `One of the escorts is short of fuel. ${dist} squares to the destination, 1d6=${r}`)); UI.good(L('洋上補給なしで目的地に着ける。', 'She can reach the destination without refuelling at sea.')); UI.story(L('機関長「燃料はぎりぎり持ちます。目的地までは大丈夫でしょう」', 'Chief Engineer: "The fuel will just about last, sir. We\'ll make it."')); backRE(n); }
      else { headBad(); UI.log(L(`護衛艦の1隻の燃料が乏しい。目的地まで${dist}マス、1d6＝${r}`, `One of the escorts is short of fuel. ${dist} squares to the destination, 1d6=${r}`), 'dice badev'); M.flags.refuel = true; UI.storyHid(L('僚艦より発光信号「燃料ガ尽キル。タンカーカラ補給ヲ受ケニ離レル」', 'Signal lamp from another escort: "FUEL RUNNING OUT. LEAVING TO REFUEL FROM TANKER."')); UI.log(L('護衛艦の1隻が洋上補給のため船団から離れた。以後、群狼戦術表に +1。', 'One escort has left the convoy to refuel at sea. From now on, +1 on the wolfpack table.'), 'bad badev'); }
      break;
    }
    case 18: { // 急病人
      await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
      const r = d66(); UI.dice(`d66＝${r}`);
      if (r === 11 || r === 66) {
        const s = d6(); let k = ['watch', 'asdic', 'aa', 'gun4', 'dc', 'engine'][s - 1];
        if (!SH().sick) { SH().sick = { k, orig: SH().skills[k] }; SH().skills[k] = 1; }
        UI.story(L(`軍医「艦長、${SECTION_NAME[k]}の士官が高熱で倒れました。治療できる船に移さないと……」`, `Surgeon: "Captain, the ${SECTION_NAME[k]} officer has gone down with a high fever. He needs to go to a ship that can treat him..."`));
        UI.bad(L(`主要士官が病気に（1d6＝${s}）。${SECTION_NAME[k]}の乗員はこの任務の間スキル1（次の任務で復帰）`, `A key officer falls ill (1d6=${s}). The ${SECTION_NAME[k]} crew is skill 1 for this mission (back next mission)`));
        J(L(`${SECTION_NAME[k]}の士官が病に倒れ、移送。`, `The ${SECTION_NAME[k]} officer fell ill and was transferred.`), L(`${SECTION_NAME[k]} スキル1`, `${SECTION_NAME[k]} skill 1`));
      } else { UI.log(L('乗員は元気だ。', 'The crew is in good health.')); UI.story(L('軍医「熱を出した者が一人いましたが、もう大丈夫です」', 'Surgeon: "One man ran a temperature, sir, but he\'s fine now."')); }
      break;
    }
    case 19: { // 火災発生
      await UI.wait(); // 内容を読めるよう、結果を出す前に止まる（ユーザーの指示 2026-11-03）
      const r = d66(); UI.dice(`d66＝${r}`);
      if (r === 11 || r === 66) {
        const k = d3(); UI.big(L('見張り長「船団の中央で火災！ 炎が夜空を照らしています！」——これでは、U ボートに位置を教えているようなものだ。', 'Chief Lookout: "Fire in the middle of the convoy! The flames are lighting up the night sky!"——We might as well be showing the U-boats where we are.'), 'bad'); UI.bad(L(`船団内の1隻で火災発生！ 気づいた群狼 ${k}隻が1隻ずつ攻撃してくる。`, `A ship in the convoy is on fire! ${k} U-boat(s) of the wolfpack notice and attack one at a time.`)); J(L('船団内の1隻で火災。群狼が集まる。', 'Fire aboard a ship in the convoy. The wolfpack gathers.'), L(`U ボート ${k}隻`, `${k} U-boat(s)`));
        for (let i = 0; i < k; i++) await uboatEvent({ noWolf: true });
      } else { UI.log(L('火災は起きなかった。', 'No fire broke out.')); UI.story(L('どこかの船でボヤ騒ぎがあったが、すぐに消し止められた。', 'There was a small fire on one of the ships, but it was put out at once.')); }
      break;
    }
    case 20: headBad(); M.flags.payback = true; UI.storyHid(L('通信長「傍受した敵の無電に……本艦の名前が出てきました」', 'Telegraphist: "In the enemy signals we intercepted... our ship\'s name came up, sir."')); UI.log(L('「借りは返す」: 次に U ボートが攻撃する時、自動的にこのコルベットを狙ってくる。', '"Payback": the next time a U-boat attacks, it automatically targets this corvette.'), 'bad badev'); break;
  }
}

// 14.10 空襲（リバプールに着いた直後）
async function airRaid() {
  const M = S.mission;
  S.camp.airRaid = false;
  await roll(L('空襲', 'air raid'));
  let planes = d6();
  UI.bad(L(`<b>ドイツ軍の空襲！</b> 1d6＝${planes}機`, `<b>German air raid!</b> 1d6=${planes} aircraft`));
  J(L(`リバプール沖でドイツ軍機 ${planes}機の空襲を受ける。`, `Off Liverpool, an air raid by ${planes} German aircraft.`), L('空襲', 'Air raid'));
  if (await check(L('対空戦闘', 'AA fire'), skill('aa'), 3 + secDiff('aa'), { sec: 'aa', mine: true })) { planes--; UI.good(L(`1機を撃墜した（残り${planes}機）`, `Shot down one aircraft (${planes} left)`)); }
  const target = d6();
  const rs = Array.from({ length: planes }, d6);
  const h = rs.filter(x => x === target).length;
  UI.dice(L(`爆撃: 目標値 ${target}、1d6×${planes}＝${rs.join('・') || '-'} → ${h}隻沈没`, `Bombing: target ${target}, 1d6×${planes}=${rs.join(' · ') || '-'} → ${h} ship(s) sunk`));
  for (let i = 0; i < h; i++) shipSunk('空襲');
}

// ===================== 任務の終わり（11.0）=====================
function yearIndex(dt) { return (dt.y * 12 + dt.m) < 1942 * 12 + 6 ? 1 : 2; }
async function missionEnd() {
  const M = S.mission, C = S.camp;
  const arrival = fmtDate();
  const medals0 = C.medals.length;
  UI.head(L(`━━━━ 任務 ${C.missionNo} の終わり：${PORT_NAME[M.convoy.to]}入港 ━━━━`, `━━━━ End of mission ${C.missionNo}: arrived at ${PORT_NAME[M.convoy.to]} ━━━━`));
  // 11.1 落伍船の運命
  const strag = M.stragglers;
  if (strag > 0) await roll(L('落伍船の運命', 'fate of the stragglers'));
  for (let i = 0; i < strag; i++) {
    const r = d6();
    if (r <= 5) { UI.dice(L(`落伍船 ${i + 1}: 1d6＝${r}`, `Straggler ${i + 1}: 1d6=${r}`)); shipSunk('落伍船の沈没'); }
    else { M.size++; UI.dice(L(`落伍船 ${i + 1}: 1d6＝${r} → 遅れて入港した`, `Straggler ${i + 1}: 1d6=${r} → reached port late`)); }
  }
  M.stragglers = 0;
  if (M.reduce) { const before = M.tonnage; M.tonnage = Math.max(0, M.tonnage - M.reduce); UI.good(L(`救助要請で修理した落伍船の分 ${M.reduce.toLocaleString()}トンを軽減（${before.toLocaleString()} → ${M.tonnage.toLocaleString()}）`, `The straggler repaired after the call for assistance reduces the loss by ${M.reduce.toLocaleString()} tons (${before.toLocaleString()} → ${M.tonnage.toLocaleString()})`)); }
  // 11.2 勝利点
  const vp = vpForTonnage(M.tonnage);
  const yi = yearIndex(M.start);
  C.yearVP[yi] = (C.yearVP[yi] || 0) + vp;
  C.missions.push({ no: C.missionNo, start: fmtDate(M.start), end: fmtDate(), from: M.convoy.from, to: M.convoy.to, speed: M.convoy.speed, size0: M.size + M.sunk, sunk: M.sunk, tonnage: M.tonnage, vp, kills: M.kills.length, ship: SH().name, year: yi });
  UI.log(L(`<b>この任務の結果</b>: 沈没 ${M.sunk}隻・喪失 <b>${M.tonnage.toLocaleString()}トン</b> → 勝利点 <b>${vp > 0 ? '+' : ''}${vp} VP</b>（${yi}年目の合計 ${C.yearVP[yi]} VP）`, `<b>Mission result</b>: ${M.sunk} ship(s) sunk · <b>${M.tonnage.toLocaleString()} tons</b> lost → <b>${vp > 0 ? '+' : ''}${vp} VP</b> (year ${yi} total ${C.yearVP[yi]} VP)`));
  if (M.kills.length) UI.good(L(`U ボート ${M.kills.length}隻を仕留めた。`, `Accounted for ${M.kills.length} U-boat(s).`));
  // 航海日誌（Form 33A 風）を作っておく
  C.lastLog = { name: L(`航海日誌_任務${C.missionNo}_${M.start.y}-${M.start.m}`, `logbook_mission${C.missionNo}_${M.start.y}-${M.start.m}`), html: logbookHtml(M, arrival, vp, C.medals.slice(medals0)) };
  await UI.next();
  // 11.4 乗員の練度向上（3任務ごと）
  if (C.missionNo % 3 === 0) {
    UI.log(L('<b>乗員の練度向上の判定</b>（3任務ごと 11.4）', '<b>Crew training check</b> (every 3 missions, 11.4)'));
    await roll(L('乗員の練度向上', 'crew training'));
    const ks = ['gun4', 'aa', 'asdic', 'watch', 'engine', 'radar', 'hfdf', 'dc'];
    ks.forEach(k => {
      if (!hasSection(k)) return;
      const ok = k === 'dc' ? SH().dcKill : SH().trained[k];
      if (!ok) return;
      const base = SH().sick && SH().sick.k === k ? SH().sick.orig : SH().skills[k];
      if (base >= 6) return;
      const r = d6();
      if (r <= 6 - base) { if (SH().sick && SH().sick.k === k) SH().sick.orig++; else SH().skills[k]++; UI.good(L(`${SECTION_NAME[k]}: 1d6＝${r} → スキル ${base + 1} に上がった`, `${SECTION_NAME[k]}: 1d6=${r} → skill rises to ${base + 1}`)); }
      else UI.dice(L(`${SECTION_NAME[k]}: 1d6＝${r} → 変わらず`, `${SECTION_NAME[k]}: 1d6=${r} → no change`));
    });
    SH().trained = {}; SH().dcKill = false;
  }
  // 11.5 港に滞在する日数
  const marks = Object.keys(SH().dmg).length + SH().hull;
  await roll(L('港に滞在する日数', 'days in port'));
  const stay = d6() + marks;
  advanceDays(stay);
  UI.log(L(`港に${stay}日滞在して修理した（1d6＋損害マーカー${marks}）→ ${fmtDate()}`, `${stay} days in port for repairs (1d6 + ${marks} damage marker(s)) → ${fmtDate()}`));
  SH().dmg = {}; SH().diff = {}; SH().perm = {}; SH().hull = 0;
  if (SH().sick) { SH().skills[SH().sick.k] = SH().sick.orig; SH().sick = null; }
  C.port = M.convoy.to;
  // 11.3 装備の遅れ（次の任務で装備される区画）
  if (['radar', 'hh', 'hfdf'].some(k => !SH().equipped[k] && monthNum() >= eqDate(k))) await roll(L('装備の追加', 'new equipment'));
  ['radar', 'hh', 'hfdf'].forEach(k => {
    if (SH().equipped[k] || monthNum() < eqDate(k)) return;
    const a = d6(), b = d6(), v = (a + b - 2) * 2;
    C.equipDelayed[k] = M.sunk >= v;
    UI.dice(L(`${SECTION_NAME[k]}の装備判定: (2d6−2)×2＝(${a}+${b}−2)×2＝${v}、この任務で失った船 ${M.sunk}隻 → ${C.equipDelayed[k] ? '<b>遅れる</b>' : '次の任務で装備'}`, `${SECTION_NAME[k]} fit check: (2d6−2)×2=(${a}+${b}−2)×2=${v}, ships lost this mission ${M.sunk} → ${C.equipDelayed[k] ? '<b>delayed</b>' : 'fitted next mission'}`));
  });
  S.mission = null;
  // 終わりの判定
  if (S.mode === '1m') { S.phase = 'campaignEnd'; autoFiles(); return; }
  const endY = S.mode === '1y' ? 1942 : 1943;
  if (S.date.y > endY || (S.date.y === endY && S.date.m > 5)) { S.phase = 'campaignEnd'; autoFiles(); return; }
  S.phase = 'missionSetup';
  autoFiles();
  await UI.next(storyOn() ? L(`${story('nextMission')}　▶ 次の任務へ`, `${story('nextMission')}　▶ Next mission`) : L('▶ 次の任務へ', '▶ Next mission'));
}
// 航海ごとに、セーブファイルと航海日誌を自動でダウンロードする（オプションで切れる）
function autoFiles() {
  if (S.settings.autoFile === false) return;
  saveLocal();
  try {
    saveFile(L(`corvette_command_任務${S.camp.missionNo}`, `corvette_command_mission${S.camp.missionNo}`));
    downloadLog();
    UI.log(L(`航海が終わったので、セーブファイルと航海日誌をダウンロードしました（Load で続きから遊べます）。`, `The voyage is over, so the save file and the logbook were downloaded (use Load to continue).`), 'good');
  } catch (e) {
    // ダウンロードできなくても、ゲームは続ける（ブラウザの中の自動保存は済んでいる）
    UI.bad(L('ファイルのダウンロードに失敗しました。ブラウザの中には保存してあります。', 'The file download failed. The game is still saved in the browser.'));
  }
}
function downloadLog() {
  const L = S && S.camp && S.camp.lastLog;
  if (!L) { alert(L('まだ終わった航海がありません', 'No voyage has been completed yet')); return; }
  const blob = new Blob([L.html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = L.name + '.html'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 航海日誌のページ（ルールブックの記録用紙 OPERATIONS RECORD BOOK Form 33A 風）
function logbookHtml(M, arrival, vp, medals) {
  const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const strip = t => esc(String(t).replace(/<[^>]+>/g, ''));
  const rows = (M.journal || []).map(e => `<tr><td class="d">${esc(e.date)}</td><td class="t">${esc(e.time)}</td><td>${strip(e.text)}</td><td class="n">${strip(e.note)}</td></tr>`).join('');
  const size0 = M.size + M.sunk;
  const kills = M.kills.map(k => L(`${k.id}（${{ certain: '撃沈確実', sunk: '撃沈', destroyed: '撃破', shared: '共同撃沈' }[k.kind]}）`, `${k.id} (${L('', { certain: 'certain kill', sunk: 'sunk', destroyed: 'destroyed', shared: 'shared kill' }[k.kind])})`)).join(L('、', ', ')) || L('なし', 'none');
  return L(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>航海日誌 ${esc(SH().name)} 任務${S.camp.missionNo}</title>
<style>
body{margin:0;background:#cfc6b0;font:15px/1.7 'Hiragino Mincho ProN','Yu Mincho','Courier New',serif;color:#2a2418}
.page{max-width:900px;margin:20px auto;background:#f4ecd8;padding:28px 34px;box-shadow:0 4px 18px rgba(0,0,0,.35);border:1px solid #b9ad8f}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px double #6b5d3e;padding-bottom:6px}
h1{font-size:22px;letter-spacing:3px;margin:0}.form{font-size:13px}
.sub{text-align:center;margin:8px 0 14px;letter-spacing:2px}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:14px}
.fields div{border-bottom:1px dotted #8a7b5a}.fields b{display:inline-block;min-width:7em;color:#5a4a2a}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #8a7b5a;padding:4px 6px;vertical-align:top}
th{background:#e6dcc0}td.d{white-space:nowrap;width:9em}td.t{white-space:nowrap;width:5.5em}td.n{width:13em;color:#5a3a1a}
.res{margin-top:16px;border:2px solid #6b5d3e;padding:10px 14px}.res b{color:#5a3a1a}
.sign{margin-top:18px;text-align:right}
@media(max-width:600px){.page{margin:8px;padding:16px}.fields{grid-template-columns:1fr}td.n{width:auto}}
</style></head><body><div class="page">
<div class="top"><h1>OPERATIONS RECORD BOOK</h1><div class="form">Form 33A　PAGE NO. ${S.camp.missionNo}</div></div>
<div class="sub">DETAIL OF WORK CARRIED OUT　船団護衛任務記録用紙</div>
<div class="fields">
<div><b>出発港</b>${esc(PORT_NAME[M.convoy.from])}</div><div><b>到着港</b>${esc(PORT_NAME[M.convoy.to])}</div>
<div><b>出発年月日</b>${esc(fmtDate(M.start))}</div><div><b>到着年月日</b>${esc(arrival)}</div>
<div><b>船団</b>${M.convoy.speed === 'fast' ? '高速' : '低速'}船団 ${size0}隻</div><div><b>割り当て航路</b>${esc(WA_ROUTES[M.orders].name)}</div>
<div><b>記録者</b>${esc(S.captain || '')}艦長（艦名: ${esc(SH().name)}）</div><div><b>任務</b>第${S.camp.missionNo}次</div>
</div>
<table><tr><th>日付</th><th>時間</th><th>報告事項</th><th>特記事項</th></tr>${rows}</table>
<div class="res"><b>任務の結果</b><br>
輸送船の喪失 ${M.sunk}隻・喪失トン数 <b>${M.tonnage.toLocaleString()}トン</b>・到着 ${M.size}隻<br>
撃沈した U ボート: ${esc(kills)}<br>
勝利点 <b>${vp > 0 ? '+' : ''}${vp} VP</b>${medals.length ? '<br>受章: ' + esc(medals.join('／')) : ''}</div>
<div class="sign">${esc(arrival)}　${esc(SH().name)} 艦長　${esc(S.captain || '')}</div>
</div></body></html>`, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Logbook ${esc(SH().name)} mission ${S.camp.missionNo}</title>
<style>
body{margin:0;background:#cfc6b0;font:15px/1.7 Georgia,'Times New Roman','Courier New',serif;color:#2a2418}
.page{max-width:900px;margin:20px auto;background:#f4ecd8;padding:28px 34px;box-shadow:0 4px 18px rgba(0,0,0,.35);border:1px solid #b9ad8f}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px double #6b5d3e;padding-bottom:6px}
h1{font-size:22px;letter-spacing:3px;margin:0}.form{font-size:13px}
.sub{text-align:center;margin:8px 0 14px;letter-spacing:2px}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:14px}
.fields div{border-bottom:1px dotted #8a7b5a}.fields b{display:inline-block;min-width:9em;color:#5a4a2a}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #8a7b5a;padding:4px 6px;vertical-align:top}
th{background:#e6dcc0}td.d{white-space:nowrap;width:9em}td.t{white-space:nowrap;width:6.5em}td.n{width:13em;color:#5a3a1a}
.res{margin-top:16px;border:2px solid #6b5d3e;padding:10px 14px}.res b{color:#5a3a1a}
.sign{margin-top:18px;text-align:right}
@media(max-width:600px){.page{margin:8px;padding:16px}.fields{grid-template-columns:1fr}td.n{width:auto}}
</style></head><body><div class="page">
<div class="top"><h1>OPERATIONS RECORD BOOK</h1><div class="form">Form 33A　PAGE NO. ${S.camp.missionNo}</div></div>
<div class="sub">DETAIL OF WORK CARRIED OUT　CONVOY ESCORT</div>
<div class="fields">
<div><b>From</b>${esc(PORT_NAME[M.convoy.from])}</div><div><b>To</b>${esc(PORT_NAME[M.convoy.to])}</div>
<div><b>Sailed</b>${esc(fmtDate(M.start))}</div><div><b>Arrived</b>${esc(arrival)}</div>
<div><b>Convoy</b>${M.convoy.speed === 'fast' ? 'Fast' : 'Slow'} convoy, ${size0} ships</div><div><b>Route</b>${esc(WA_ROUTES[M.orders].name)}</div>
<div><b>Recorded by</b>Captain ${esc(S.captain || '')} (${esc(SH().name)})</div><div><b>Mission</b>No. ${S.camp.missionNo}</div>
</div>
<table><tr><th>Date</th><th>Time</th><th>Summary of events</th><th>Remarks</th></tr>${rows}</table>
<div class="res"><b>Result of the mission</b><br>
Merchant ships lost ${M.sunk} · tonnage lost <b>${M.tonnage.toLocaleString()} tons</b> · arrived ${M.size} ships<br>
U-boats sunk: ${esc(kills)}<br>
Victory points <b>${vp > 0 ? '+' : ''}${vp} VP</b>${medals.length ? '<br>Awards: ' + esc(medals.join(' / ')) : ''}</div>
<div class="sign">${esc(arrival)}　Captain ${esc(S.captain || '')}, ${esc(SH().name)}</div>
</div></body></html>`);
}

// ===================== ゲームの終わり（12.0）=====================
async function campaignEnd(why) {
  const C = S.camp;
  S.phase = 'over';
  UI.head(L('━━━━ 戦いの終わり ━━━━', '━━━━ The war\'s end ━━━━'));
  if (S.mode === '1m') {
    const m = C.missions[C.missions.length - 1];
    if (m) UI.log(L(`1回の任務: 喪失 ${m.tonnage.toLocaleString()}トン → ${m.tonnage < 50000 ? '<b>プレイヤーの勝利</b>（5万トン未満 12.1）' : '<b>プレイヤーの敗北</b>（5万トン以上）'}`, `Single mission: ${m.tonnage.toLocaleString()} tons lost → ${m.tonnage < 50000 ? '<b>player victory</b> (under 50,000 tons, 12.1)' : '<b>player defeat</b> (50,000 tons or more)'}`));
  } else {
    const years = S.mode === '1y' ? [1] : [1, 2];
    years.forEach(y => {
      const vp = C.yearVP[y] || 0;
      const lost = C.shipsLost.filter(x => x.year === y).length;
      let li = VICTORY_LEVELS.indexOf(victoryLevel(vp)) - lost;
      li = Math.max(0, li);
      UI.log(L(`${y}年目（${y === 1 ? '1941年6月〜1942年5月' : '1942年6月〜1943年5月'}）: 合計 <b>${vp} VP</b>${lost ? `・乗艦の沈没 ${lost}隻（勝利レベル −${lost}）` : ''} → <b>${VICTORY_LEVELS[li]}</b>`, `Year ${y} (${y === 1 ? 'June 1941 – May 1942' : 'June 1942 – May 1943'}): total <b>${vp} VP</b>${lost ? L('', ` · ${lost} ship(s) of yours sunk (victory level −${lost})`) : ''} → <b>${VICTORY_LEVELS[li]}</b>`));
    });
  }
  UI.log(L(`任務 ${C.missions.length}回・U ボート ${C.kills.length}隻（${C.kills.map(k => k.id + ' ' + { certain: '撃沈確実', sunk: '撃沈', destroyed: '撃破', shared: '共同撃沈' }[k.kind]).join('、') || 'なし'}）`, `${C.missions.length} mission(s) · ${C.kills.length} U-boat(s) (${C.kills.map(k => k.id + ' ' + L('', { certain: 'certain kill', sunk: 'sunk', destroyed: 'destroyed', shared: 'shared kill' }[k.kind])).join(', ') || 'none'})`));
  if (C.medals.length) UI.good(L('受章: ', 'Awards: ') + C.medals.join(' ／ '));
  if (why === 'sunk') UI.bad(L('乗艦の沈没で、ここで終えました。', 'Your ship was sunk; the game ends here.'));
  else if (S.mode === '2y') {
    const v = await UI.choose(L(`${SH().name}は1943年5月31日まで生き残った。その後の運命を見ますか？（15.4）`, `${SH().name} survived until 31 May 1943. Do you want to see what became of her? (15.4)`), [{ label: L('見る', 'Show me'), value: 1 }, { label: L('見ない', 'No thanks'), value: 0 }]);
    if (v) await epilogue();
  }
  saveLocal();
  await UI.choose(L('おつかれさまでした。', 'Well done.'), [{ label: L('新しいゲームを始める', 'Start a new game'), value: 1 }]);
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}
// 15.4 コルベットのその後
async function epilogue() {
  const total = ['gun4', 'aa', 'dc', 'asdic', 'watch', 'engine', 'radar', 'hfdf'].filter(hasSection).reduce((t, k) => t + SH().skills[k], 0);
  const vpAll = (S.camp.yearVP[1] || 0) + (S.camp.yearVP[2] || 0);
  const d36 = () => d6() * d6();
  let alive = true;
  UI.log(L(`総合スキル ${total}`, `Overall skill ${total}`));
  const yearRun = async (y, table) => {
    const r = d6(); const area = table[r];
    const x = d36();
    UI.dice(L(`${y}年: 1d6＝${r} → <b>${area}</b>`, `${y}: 1d6=${r} → <b>${TK(area)}</b>`));
    if (area === '地中海' || area === 'イギリス海峡') {
      UI.dice(`1d36＝${x}`);
      if ((area === '地中海' && x === 36) || (area === 'イギリス海峡' && (x === 30 || x === 36))) { UI.bad(L('コルベットは戦没した。', 'The corvette was lost in action.')); return false; }
      if (x <= total) UI.good(L(`${area === '地中海' ? 'ハスキー作戦' : 'ネプチューン作戦'}に参加、功績をあげた（+1 VP）`, `Took part in ${area === '地中海' ? 'Operation Husky' : 'Operation Neptune'} with distinction (+1 VP)`));
      if (x <= total / 2) UI.good(L('U ボートを1隻撃沈した。', 'Sank one U-boat.'));
    } else if (area === '近海') {
      UI.dice(`1d36＝${x}`);
      if (x === 36) { UI.bad(L('コルベットは戦没した。', 'The corvette was lost in action.')); return false; }
      if (x <= SH().skills.dc) UI.good(L('U ボートを1隻撃沈した。', 'Sank one U-boat.'));
    } else if (area === '北極海') {
      UI.dice(`1d36＝${x}`);
      if (x === 30 || x === 36) { UI.bad(L('コルベットは戦没した。', 'The corvette was lost in action.')); return false; }
      if (x <= total / 2) UI.good(L('U ボートを1隻撃沈した。', 'Sank one U-boat.'));
    } else UI.log(L('オーバーホールのため、主立った戦果はなかった。', 'Under overhaul, so no notable successes.'));
    return true;
  };
  alive = await yearRun(1943, { 1: '地中海', 2: '地中海', 3: '近海', 4: '近海', 5: '北極海', 6: 'オーバーホール' });
  if (alive) alive = await yearRun(1944, { 1: '近海', 2: 'イギリス海峡', 3: 'イギリス海峡', 4: 'イギリス海峡', 5: '北極海', 6: 'オーバーホール' });
  if (!alive) return;
  let mod = 0, year = 1945;
  for (let guard = 0; guard < 20; guard++) {
    const r = Math.min(6, d6() + mod);
    UI.dice(L(`${year}年: 1d6${mod ? '+' + mod : ''}＝${r}`, `${year}: 1d6${mod ? '+' + mod : ''}=${r}`));
    if (r === 1) {
      const x = d36(); UI.dice(L(`護衛任務 1d36＝${x}`, `Escort duty 1d36=${x}`));
      if (x === 25 || x === 30 || x === 36) { UI.bad(L('最後の護衛任務で戦没した。', 'Lost in action on her last escort duty.')); return; }
      if (x <= SH().skills.dc) UI.good(L('U ボートを1隻撃沈した。', 'Sank one U-boat.'));
      mod += 1;
    } else if (r === 2) { UI.log(L('イギリス連邦または同盟国に譲渡され、軍艦として運用された。', 'Transferred to a Commonwealth or Allied navy and served on as a warship.')); mod += 2; }
    else if (r === 3) { UI.log(L('民間に払い下げられ、おそらく捕鯨船として使われた。', 'Sold into civilian hands, probably to serve as a whale catcher.')); mod += 2; }
    else {
      const x = d36(); UI.dice(L(`解体 1d36＝${x}（合計 VP ${vpAll}）`, `Scrapping 1d36=${x} (total VP ${vpAll})`));
      if (x <= vpAll) UI.good(L(`<b>${SH().name}は記念館として保存された！</b>`, `<b>${SH().name} has been preserved as a memorial!</b>`)); else UI.log(L(`長年活躍した${SH().name}も、ついにスクラップにされた。`, `After long years of service, ${SH().name} was finally broken up for scrap.`));
      return;
    }
    year += 5;
  }
}

// ===================== ステータス（上半分）=====================
function renderStatus() {
  const el = $('status');
  if (!S || !S.ship) { el.innerHTML = L('<div class="title">コルベット・コマンド</div>', '<div class="title">Corvette Command</div>'); return; }
  const sh = S.ship, M = S.mission, C = S.camp;
  // 能力は小さな札にして横に並べる（文字を大きくしても上の画面に収まるように）
  const chips = ['watch', 'asdic', 'radar', 'hfdf', 'gun4', 'aa', 'dc', 'hh', 'engine'].map(k => {
    const avail = hasSection(k);
    const sk = k === 'hh' ? L('(爆雷)', '(DC)') : sh.skills[k];
    const df = secDiff(k);
    const short = { watch: L('監視', 'Lookout'), asdic: 'ASDIC', radar: L('レーダー', 'Radar'), hfdf: 'HF-DF', gun4: L('4inch砲', '4in gun'), aa: L('対空砲', 'AA gun'), dc: L('爆雷', 'DC'), hh: L('ヘッジホッグ', 'Hedgehog'), engine: L('機関', 'Engine') }[k];
    return L(`<span class="chip ${avail ? '' : 'na'}" title="${SECTION_NAME[k]}">${short} ${avail ? `<b>${sk}</b>` + (sh.sick && sh.sick.k === k ? '<small>病</small>' : '') : '未'}${df ? ` <span class="df">困+${df}</span>` : ''}${sh.dmg[k] ? '<span class="dm">損</span>' : ''}${sh.trained[k] || (k === 'dc' && sh.dcKill) ? '<span class="tr">◎</span>' : ''}</span>`, `<span class="chip ${avail ? '' : 'na'}" title="${SECTION_NAME[k]}">${short} ${avail ? `<b>${sk}</b>` + (sh.sick && sh.sick.k === k ? '<small>sick</small>' : '') : 'n/a'}${df ? L('', ` <span class="df">diff+${df}</span>`) : ''}${sh.dmg[k] ? '<span class="dm">dmg</span>' : ''}${sh.trained[k] || (k === 'dc' && sh.dcKill) ? '<span class="tr">◎</span>' : ''}</span>`);
  }).join('');
  const hull = [0, 1, 2].map(i => `<span class="hb ${i < sh.hull ? 'on' : ''}"></span>`).join('');
  let h = L(`<div class="col ship"><div class="title">${sh.name}${S.captain ? `<small class="cap">　艦長 ${S.captain}</small>` : ''}</div>
    <div class="chips">${chips}</div>
    <div class="shipline">船体 ${hull}　爆雷 <b>${sh.dcLeft}</b>${sh.equipped.hh ? `　ヘッジホッグ <b>${sh.hhLeft}</b>` : ''}</div></div>`, `<div class="col ship"><div class="title">${sh.name}${S.captain ? `<small class="cap">　${ST_fill(I18N_X('captName', 'Captain {n}'), { n: S.captain })}</small>` : ''}</div>
    <div class="chips">${chips}</div>
    <div class="shipline">Hull ${hull}　DCs <b>${sh.dcLeft}</b>${sh.equipped.hh ? L('', `　Hedgehog <b>${sh.hhLeft}</b>`) : ''}</div></div>`);
  h += L(`<div class="col info"><div><b>${fmtDate()}</b>　任務 ${C.missionNo}</div>`, `<div class="col info"><div><b>${fmtDate()}</b>　Mission ${C.missionNo}</div>`);
  if (M) {
    h += L(`<div>${M.convoy.speed === 'fast' ? '高速' : '低速'}船団 ${PORT_NAME[M.convoy.from]} → ${PORT_NAME[M.convoy.to]}　命令: ${WA_ROUTES[M.orders].name}</div>
      <div>位置: ${placeName(M.pos)}　天候: <b>${WEATHER[M.weather]}</b></div>
      <div>船団 <b>${M.size}</b>隻　沈没 ${M.sunk}　落伍 ${M.stragglers}</div>
      <div>喪失 <b>${M.tonnage.toLocaleString()}</b>トン（このままなら ${vpForTonnage(Math.max(0, M.tonnage - M.reduce)) > 0 ? '+' : ''}${vpForTonnage(Math.max(0, M.tonnage - M.reduce))} VP）</div>`, `<div>${M.convoy.speed === 'fast' ? 'Fast' : 'Slow'} convoy ${PORT_NAME[M.convoy.from]} → ${PORT_NAME[M.convoy.to]}　Orders: ${WA_ROUTES[M.orders].name}</div>
      <div>Position: ${placeName(M.pos)}　Weather: <b>${WEATHER[M.weather]}</b></div>
      <div>Convoy <b>${M.size}</b> ships　sunk ${M.sunk}　stragglers ${M.stragglers}</div>
      <div>Lost <b>${M.tonnage.toLocaleString()}</b> tons (as it stands: ${vpForTonnage(Math.max(0, M.tonnage - M.reduce)) > 0 ? '+' : ''}${vpForTonnage(Math.max(0, M.tonnage - M.reduce))} VP)</div>`);
    const hb = S.settings.hideBad;
    const sn = M.tokens.seen || {};
    const tk = [M.tokens.luck && (!hb || sn.luck) ? L('幸運', 'Luck') : '', M.tokens.rum && (!hb || sn.rum) ? L('ラム酒', 'Rum') : '', M.tokens.skilled && (!hb || sn.skilled) ? L('巧みな操艦', 'Skilled shiphandling') : '', M.flags.payback && !hb ? L('借りは返す', 'Payback') : '', M.flags.sunderland && !hb ? L('サンダーランド', 'Sunderland') : '', M.flags.escort && !hb ? L('援護の護衛艦', 'Escort support') : '', M.flags.refuel && !hb ? L('洋上補給(群狼+1)', 'Refuelling (wolfpack +1)') : '', M.flags.noWolfpack ? L('群狼なし', 'No wolfpack') : '', S.camp.airRaid && !hb ? L('空襲予告', 'Air raid warning') : ''].filter(Boolean);
    if (tk.length) h += L(`<div class="tok">${tk.join('・')}</div>`, `<div class="tok">${tk.join(' · ')}</div>`);
    h += mapHtml();
    if (!M.ub) h += rangeHtml();
  }
  h += L(`<div class="vp">勝利点: 1年目 ${C.yearVP[1] || 0}${S.mode === '2y' ? '／2年目 ' + (C.yearVP[2] || 0) : ''}　U ボート撃沈 ${C.kills.length}</div></div>`, `<div class="vp">VP: year 1 ${C.yearVP[1] || 0}${S.mode === '2y' ? L('', ' / year 2 ') + (C.yearVP[2] || 0) : ''}　U-boats sunk ${C.kills.length}</div></div>`);
  if (M && M.ub) {
    const ub = M.ub;
    const hide = S.settings.hideEnemy;
    h += L(`<div class="col ub"><div class="title">U ボート</div>${hide ? '<div>正体不明</div>' : `<div>${ub.type === 7 ? 'VII' : 'IX'}型 ${ub.id}</div><div>攻撃 ${ub.atk}／回避 ${ub.eva}${ub.sieg ? '<small>（ジークリンデ）</small>' : ''}</div>`}
      <div>距離 <b>${ub.rng ? RANGE_NAME[ub.rng] || ub.rng : '-'}</b>　${ub.surfaced ? '浮上中' : '潜航中'}</div>${hide ? '' : `<div>損害 <b>${ub.damage}</b>　残り攻撃 ${ub.attacksLeft}</div>`}${ub.contact ? '<div class="good">ASDIC 接触中</div>' : ''}${rangeHtml()}</div>`, `<div class="col ub"><div class="title">U-boat</div>${hide ? '<div>Identity unknown</div>' : L('', `<div>Type ${ub.type === 7 ? 'VII' : 'IX'} ${ub.id}</div><div>Attack ${ub.atk} / Evasion ${ub.eva}${ub.sieg ? '<small> (Sieglinde)</small>' : ''}</div>`)}
      <div>Range <b>${ub.rng ? RANGE_NAME[ub.rng] || ub.rng : '-'}</b>　${ub.surfaced ? 'surfaced' : 'submerged'}</div>${hide ? '' : L('', `<div>Damage <b>${ub.damage}</b>　attacks left ${ub.attacksLeft}</div>`)}${ub.contact ? '<div class="good">ASDIC contact</div>' : ''}${rangeHtml()}</div>`);
  }
  el.innerHTML = h;
}
// コルベットと U ボート（と魚雷）の距離の図。交戦中だけ出す
function rangeHtml() {
  const M = S.mission, ub = M.ub, tp = M.torp;
  if (!ub && !tp) return '';
  const cells = [['C', L('近距離', 'Close')], ['M', L('中距離', 'Medium')], ['L', L('長距離', 'Long')], ['OUT', L('圏外', 'Out')]];
  const rule = {
    C: L('ASDIC +1・爆雷/ヘッジホッグ可・雷撃 A+1', 'ASDIC +1 · depth charges/Hedgehog · torpedo A+1'),
    M: L('射撃 P+2（対空砲 P+3）・発見 P+2', 'gunfire P+2 (AA P+3) · spotting P+2'),
    L: L('射撃 P+3（対空砲 不可）・発見 P+3・ASDIC P+1・雷撃 P+1', 'gunfire P+3 (no AA) · spotting P+3 · ASDIC P+1 · torpedo P+1'),
    OUT: L('撤退（群狼の判定）', 'withdraws (wolfpack check)'),
  };
  let h = L('<div class="rng"><span class="rc corv">コルベット</span>', '<div class="rng"><span class="rc corv">Corvette</span>');
  cells.forEach(([k, nm]) => {
    const isUb = ub && ub.rng === k, isOrig = ub && ub.orig === k && ub.rng !== k, isTp = tp && tp === k;
    h += L(`<span class="rc${isUb ? ' ubh' : ''}${isTp ? ' tph' : ''}"><small>${nm}</small>${isUb ? `<b>U${ub.surfaced ? '▲' : '▼'}</b>` : ''}${isTp ? '<b>→魚雷</b>' : ''}${isOrig ? '<i>攻撃位置</i>' : ''}</span>`, `<span class="rc${isUb ? ' ubh' : ''}${isTp ? ' tph' : ''}"><small>${nm}</small>${isUb ? `<b>U${ub.surfaced ? '▲' : '▼'}</b>` : ''}${isTp ? '<b>→torpedo</b>' : ''}${isOrig ? '<i>attack pos.</i>' : ''}</span>`);
  });
  h += '</div>';
  const now = tp || (ub && ub.rng);
  if (now && rule[now]) h += L(`<div class="rrule">${RANGE_NAME[now] || '圏外'}: ${rule[now]}${ub ? `　${ub.surfaced ? '▲浮上中' : '▼潜航中'}` : ''}</div>`, `<div class="rrule">${RANGE_NAME[now] || 'Out of range'}: ${rule[now]}${ub ? `　${ub.surfaced ? L('', '▲surfaced') : L('', '▼submerged')}` : ''}</div>`);
  return h;
}
function mapHtml() {
  const M = S.mission;
  const route = routeOf();
  let h = '<div class="map">';
  MAP_ROWS.forEach((row, r) => {
    h += '<div class="mr">';
    row.forEach((t, c) => {
      const k = key(r, c);
      let cls = 'mc', txt = '';
      const pk = PORT_POS[t] ? t : k;
      const oi = M.moveOpts ? M.moveOpts.indexOf(pk) : -1;
      if (!t) cls += ' none';
      else if (PORT_POS[t]) { cls += ' port'; txt = t; if (M.pos === t) cls += ' here'; if (M.convoy.to === t) cls += ' dest'; }
      else {
        cls += ' s' + sectorOf(k);
        if (route.includes(k)) cls += ' route';
        if (M.pos === k) { cls += ' here'; txt = '◆'; }
        else if (M.revealed[k]) txt = { NE: L('・', ' · '), UB: 'U', RE: 'R' }[M.events[k]];
      }
      // 移動の選択肢: 番号を出し、クリックでも選べる
      if (oi >= 0) { cls += ' opt'; txt = String(oi + 1); }
      const co = t && !PORT_POS[t] ? `<small class="co">${'ABCD'[r]}${c}</small>` : '';
      h += `<span class="${cls}"${oi >= 0 ? ` onclick="window.__choose && window.__choose(${oi})" title="${oi + 1}: ${placeName(pk)}"` : ''}>${co}<b>${txt}</b></span>`;
    });
    h += '</div>';
  });
  return h + '</div>';
}

// ===================== 始め方 =====================
async function newGame() {
  S = { version: 1, phase: 'new', settings: { step: true, hideDice: true, hideEnemy: true, hideBad: true, autoFile: true, hideRoutine: true, story: true }, logLines: [] };
  $('log').innerHTML = '';
  UI.head(L('コルベット・コマンド　北大西洋船団護送作戦 1941-1943', 'Corvette Command: North Atlantic Convoy Escort 1941-1943'));
  // 最初の画面: 言語の選択とゲームの説明。次にオプションを決めてからゲームを始める
  const langBtns = LANGS.map(([c, n]) => `<button class="langbtn${c === LANG ? ' on' : ''}" onclick="setLang('${c}')">${n}</button>`).join('');
  UI.big(`<div class="langrow">${langBtns}</div>`);
  [L('ひとりで遊ぶソロプレイ用のキャンペーンゲームです。あなたはフラワー級コルベットの艦長として、大西洋を渡る船団を U ボートから護衛します。', 'This is a solo campaign game. You are the captain of a Flower-class corvette, escorting convoys across the Atlantic and protecting them from U-boats.'),
   L('長い航海を重ねるうちに、乗員は腕を上げ、新しい技術も届きます。そうして、より無事な航海ができるようになっていきます。', 'Over many voyages, your crew grows more skilled and new technology arrives, so your voyages become safer as you go.'),
   L('RPG 風に仕上げたので、ルールや知識がなくても楽しめます。', 'I gave it the feel of an RPG, so you can enjoy it without knowing the rules or the history.'),
   L('長い二年間の、航海の連続を楽しんでいただければ幸いです。', 'I hope you enjoy two long years of voyage after voyage.'),
   L('無料での公開を快諾してくれたゲームデザイナーの Alan と、許諾してくれたボンサイ・ゲームズ社に感謝します。', 'My thanks to the game\'s designer, Alan, who gladly agreed to its free release, and to Bonsai Games, who gave their permission.'),
  ].forEach(t => UI.story(t));
  await UI.choose('', [{ label: L('▶ 次へ', '▶ Next'), value: 1 }]);
  await new Promise(resolve => openOptions(resolve));
  saveLocal();
  UI.story(L('あなたはフラワー級コルベットの艦長として、大西洋を渡る船団を U ボートから護衛する。', 'You are the captain of a Flower-class corvette, escorting convoys across the Atlantic against the U-boats.'));
  const mode = await UI.choose(L('遊び方を選んでください', 'Choose how to play'), [
    { label: L('2年間（1941年6月〜1943年5月）', 'Two years (June 1941 – May 1943)'), value: '2y', hint: L('任務を続け、1年ごとに勝利点で勝敗', 'Carry on mission after mission; each year is won or lost on victory points') },
    { label: L('1年間（1941年6月〜1942年5月）', 'One year (June 1941 – May 1942)'), value: '1y' },
    { label: L('1回だけの任務', 'A single mission'), value: '1m', hint: L('喪失5万トン未満で勝ち', 'Win by losing less than 50,000 tons') }]);
  S.mode = mode;
  S.date = { y: 1941, m: 6, d: 1 };
  if (mode === '1m') {
    const y = await UI.choose(L('任務の年を選んでください', 'Choose the year of the mission'), [1941, 1942, 1943].map(v => ({ label: v + L('年', ''), value: v })));
    const ms = y === 1941 ? [6, 7, 8, 9, 10, 11, 12] : y === 1943 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const m = await UI.choose(L('任務の月を選んでください', 'Choose the month of the mission'), ms.map(v => ({ label: v + L('月', ''), value: v })));
    S.date = { y, m, d: 1 };
  }
  const cap = await UI.ask(L('あなた（艦長）の名前を入力してください。部下はこの名前で呼びかけてきます（空のままなら「艦長」）', 'Enter your name, Captain. Your officers will address you by it (leave it blank for just "Captain")'), L('例: ハミルトン', 'e.g. Hamilton'));
  S.captain = cap.replace(/[<>&"]/g, '');
  const nm = await UI.choose(L('乗艦の艦名を選んでください（15.0）', 'Choose the name of your ship (15.0)'), [{ label: L('くじで決める', 'Draw lots'), value: '' }].concat(SHIP_NAMES.map(n => ({ label: n, value: n }))));
  const name = nm || pick(SHIP_NAMES);
  const port = await UI.choose(L('最初の任務の出発港を選んでください（3.5）', 'Choose the port for the first mission (3.5)'), [{ label: L('カナダ（ハリファックスかセント・ジョンズ）', 'Canada (Halifax or St. John\'s)'), value: 'C' }, { label: L('リバプール', 'Liverpool'), value: 'ON' }]);
  S.camp = { missionNo: 0, port: port === 'ON' ? 'ON' : null, convoyPool: [], yearVP: {}, missions: [], kills: [], medals: [], shipsLost: [], equipDelayed: {}, equipShift: 0, airRaid: false };
  S.ship = newShip(name);
  // 1回だけの任務で、もう使える時期なら装備する
  if (mode === '1m') ['radar', 'hh', 'hfdf'].forEach(k => { if (monthNum() >= EQUIP_DATE[k]) { S.ship.equipped[k] = true; } });
  UI.good(L(`${S.captain ? S.captain + 'は、' : ''}${name}の艦長に着任した。`, `${S.captain ? 'Captain ' + S.captain + ' takes' : 'You take'} command of ${name}.`));
  S.phase = 'missionSetup';
}

async function runGame() {
  try {
    for (;;) {
      saveLocal();
      renderStatus();
      if (S.phase === 'new') await newGame();
      else if (S.phase === 'missionSetup') { await missionSetup(); S.phase = 'turn'; }
      else if (S.phase === 'turn') { const r = await playTurn(); if (r === 'arrived') S.phase = 'missionEnd'; }
      else if (S.phase === 'missionEnd') await missionEnd();
      else if (S.phase === 'campaignEnd') { await campaignEnd(); return; }
      else return;
    }
  } catch (e) {
    if (e instanceof GameOver) { S.phase = 'campaignEnd'; await campaignEnd(e.why); return; }
    console.error(e);
    UI.bad(L('エラーが起きました: ', 'An error occurred: ') + (e && e.message));
    throw e;
  }
}

// ===================== セーブ・ロード（ファイル）=====================
function saveFile(nm) {
  if (!S) return;
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (typeof nm === 'string' ? nm : `corvette_command_${S.date ? S.date.y + '-' + S.date.m + '-' + Math.floor(S.date.d) : 'new'}`) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function loadFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    f.text().then(t => {
      try { const s = JSON.parse(t); if (!s || !s.version) throw new Error(); localStorage.setItem(SAVE_KEY, JSON.stringify(s)); location.reload(); }
      catch (e) { alert(L('コルベット・コマンドのセーブファイルではありません', 'This is not a Corvette Command save file')); }
    });
  };
  inp.click();
}
function restart() { if (confirm(L('今のゲームを消して、最初から始めますか？', 'Delete the current game and start over?'))) { localStorage.removeItem(SAVE_KEY); location.reload(); } }
// オプション（判定の数字・U ボートへの損害・不利なイベントを隠す）
const OPTIONS = [
  ['rollDice', L('ダイスを自分で振る', 'Roll the dice yourself'), L('判定のたびに「🎲 ダイスを振る」ボタンが出て、押すと振る（押す回数がかなり増える）', 'A "🎲 Roll the dice" button appears for each check; press it to roll (many more clicks)')],
  ['hideDice', L('判定の数字を隠す', 'Hide the dice'), L('青い行（A/P・出目）を出さず、結果の文だけにする', 'Don\'t show the blue lines (A/P and rolls), just the results')],
  ['hideEnemy', L('U ボートの情報を隠す', 'Hide U-boat information'), L('型・攻撃値・回避値・艦長の性格・与えた損害・残りの攻撃回数を隠す。撃沈・撃破した時に正体が分かる（判定の数字も隠すと、回避値も分からなくなる）', 'Hide the type, attack, evasion, commander\'s character, damage dealt and attacks left. You learn who she was when you sink or destroy her (with the dice hidden too, even the evasion stays unknown)')],
  ['hideBad', L('あとで効くイベントを伏せる', 'Hide delayed events'), L('空襲・借りは返す・洋上補給・サンダーランド機・援護の護衛艦は効果が出るまで、幸運・ラム酒・巧みな操艦は使える時が来るまで、内容を伏せる', 'Air raid, Payback, Refuelling, Sunderland and Escort support stay hidden until they take effect; Luck, Rum and Skilled shiphandling until they can be used')],
  ['autoFile', L('航海ごとにファイルを保存', 'Save files after each voyage'), L('航海が終わるたびに、セーブファイルと航海日誌を自動でダウンロードする', 'Download the save file and the logbook automatically after every voyage')],
  ['hideRoutine', L('細かい処理の行を隠す', 'Hide routine lines'), L('移動・故障なし・イベントなし・衝突なし・距離の変化・魚雷の外れ・修理など、物語の文で分かる行を隠す（大事な結果は隠さない）', 'Hide moves, no breakdown, no event, no collision, range changes, torpedo misses, repairs and other lines the story already tells (important results stay)')],
  ['story', L('物語で報告', 'Story mode'), L('小説風の文と部下のセリフだけで報告する（判定や結果の行は出さない。数字は上のステータスで分かる）', 'Report only in narrative and the officers\' words (no check or result lines; the numbers are in the status panel above)')],
];
function applySettings() {
  if (!S || !S.settings) return;
  document.body.classList.toggle('hide-dice', !!S.settings.hideDice);
  document.body.classList.toggle('hide-enemy', !!S.settings.hideEnemy);
  document.body.classList.toggle('hide-bad', !!S.settings.hideBad);
  document.body.classList.toggle('story-mode', S.settings.story !== false);
  document.body.classList.toggle('hide-routine', !!S.settings.hideRoutine);
}
// onStart を渡すと、閉じるボタンが「ゲームスタート」になる（最初の設定の時）
function openOptions(onStart) {
  if (!S) return;
  let ov = $('optOverlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'optOverlay'; document.body.appendChild(ov); }
  ov.innerHTML = L(`<div class="optbox"><div class="title">オプション</div>${OPTIONS.map(([k, n, d]) => `<label><input type="checkbox" data-k="${k}" ${((k === 'story' || k === 'autoFile') ? S.settings[k] !== false : S.settings[k]) ? 'checked' : ''}> <b>${n}</b><br><small>${d}</small></label>`).join('')}<small>オフに戻すと、隠していた行も見えるようになります。</small><button onclick="document.getElementById('optOverlay').style.display='none'">閉じる</button></div>`, `<div class="optbox"><div class="title">Options</div>${OPTIONS.map(([k, n, d]) => `<label><input type="checkbox" data-k="${k}" ${((k === 'story' || k === 'autoFile') ? S.settings[k] !== false : S.settings[k]) ? 'checked' : ''}> <b>${n}</b><br><small>${d}</small></label>`).join('')}<small>Turning an option off shows the hidden lines again.</small><button onclick="document.getElementById('optOverlay').style.display='none'">Close</button></div>`);
  ov.querySelectorAll('input').forEach(i => i.onchange = () => { S.settings[i.dataset.k] = i.checked; applySettings(); renderStatus(); saveLocal(); });
  if (typeof onStart === 'function') {
    const b = ov.querySelector('.optbox button');
    b.textContent = L('▶ ゲームスタート', '▶ Start the game');
    b.onclick = () => { ov.style.display = 'none'; onStart(); };
  }
  ov.style.display = 'flex';
}
// 文字の大きさ（12〜26px）。この人のブラウザに覚えておく
function fontSize(d) {
  let fs = 15;
  try { fs = +localStorage.getItem('cc_fs') || 15; } catch (e) {}
  if (d) fs = Math.max(12, Math.min(26, fs + d));
  document.documentElement.style.setProperty('--fs', fs + 'px');
  try { localStorage.setItem('cc_fs', String(fs)); } catch (e) {}
}
// 上（ステータス）と下（文字）の境目をつまんで動かす。高さはこの人のブラウザに覚えておく
function initSplit() {
  const bar = $('split'), top = $('status');
  if (!bar || !top) return;
  const set = px => {
    const h = window.innerHeight;
    px = Math.max(h * 0.12, Math.min(h * 0.85, px));
    document.documentElement.style.setProperty('--top', Math.round(px) + 'px');
    try { localStorage.setItem('cc_top', String(Math.round(px / h * 1000) / 1000)); } catch (e) {}
  };
  let ratio = 0;
  try { ratio = +localStorage.getItem('cc_top') || 0; } catch (e) {}
  if (ratio) document.documentElement.style.setProperty('--top', Math.round(ratio * window.innerHeight) + 'px');
  let dragging = false;
  const move = e => { if (!dragging) return; const y = e.touches ? e.touches[0].clientY : e.clientY; set(y - top.getBoundingClientRect().top); e.preventDefault(); };
  const end = () => { dragging = false; document.body.classList.remove('dragging'); };
  bar.addEventListener('mousedown', e => { dragging = true; document.body.classList.add('dragging'); e.preventDefault(); });
  bar.addEventListener('touchstart', e => { dragging = true; e.preventDefault(); }, { passive: false });
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
  bar.addEventListener('dblclick', () => { document.documentElement.style.removeProperty('--top'); try { localStorage.removeItem('cc_top'); } catch (e) {} });
}
function toggleStep() { if (!S) return; S.settings.step = !S.settings.step; $('stepBtn').textContent = S.settings.step ? L('1手ずつ: ON', 'Step by step: ON') : L('1手ずつ: OFF', 'Step by step: OFF'); saveLocal(); }

window.addEventListener('DOMContentLoaded', () => {
  const saved = loadLocal();
  if (saved && saved.phase && saved.phase !== 'over') {
    S = saved;
    (S.logLines || []).forEach(l => UI.addLine(l));
    // ターンの途中で閉じた時は、そのターンの始めからやり直す（保存はターンの区切りでしている）
    UI.log(L('— 保存したところから続けます —', '— Continuing from the saved game —'), 'head');
  }
  if (S) $('stepBtn').textContent = S.settings.step ? L('1手ずつ: ON', 'Step by step: ON') : L('1手ずつ: OFF', 'Step by step: OFF');
  if (!S) S = { version: 1, phase: 'new', settings: { step: true, hideDice: true, hideEnemy: true, hideBad: true, autoFile: true, hideRoutine: true, story: true }, logLines: [] };
  applySettings();
  fontSize(0);
  initSplit();
  runGame();
});
