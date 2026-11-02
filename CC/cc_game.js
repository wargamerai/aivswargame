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
function fmtDate(dt) { dt = dt || S.date; const d = Math.floor(dt.d); return `${dt.y}年${dt.m}月${d}日${dt.d - d >= 0.5 ? '（半日）' : ''}`; }
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
      box.innerHTML = `<div class="prompt">${prompt}</div><div class="askrow"><input id="askInput" type="text" maxlength="24" placeholder="${placeholder || ''}"><button id="askOk">決定</button></div>`;
      const inp = $('askInput');
      const done = () => { const v = inp.value.trim(); box.innerHTML = ''; UI.log(`<span class="you">▶ ${v ? v.replace(/</g, '&lt;') : '（名乗らない）'}</span>`); resolve(v); };
      $('askOk').onclick = done;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      setTimeout(() => inp.focus(), 0);
    });
  },
  // 判定の前で必ず止める（1手ずつの設定に関係なく）
  async wait(label) { renderStatus(); await UI.choose('', [{ label: label || '▶ 次へ', value: 1 }]); },
  // 1手ずつ止める（設定で切れる）
  async next(label) {
    if (!S.settings.step) { renderStatus(); return; }
    await UI.choose('', [{ label: label || '▶ 次へ', value: 1 }]);
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
  UI.dice(`乗員スキルの決定（1d6、6ならスキル2）: ${rolls.join('・')}`);
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
async function check(label, A, P, opt) {
  opt = opt || {};
  A = clamp(A, 1, 10); P = clamp(P, 1, 10);
  const need = AP_TABLE[P - 1][A - 1];
  let r = d66(), ok = r <= need;
  UI.dice(`${label}: A${A}／P${P} → ${need}以下で成功　d66＝${r} → ${ok ? '<b>成功</b>' : '失敗'}`);
  const bad = opt.theirs ? ok : !ok;
  if (bad && (opt.mine || opt.theirs)) {
    if (await offerReroll(label)) { r = d66(); ok = r <= need; UI.dice(`（振り直し）${label}: d66＝${r} → ${ok ? '<b>成功</b>' : '失敗'}`); }
  }
  if (ok && opt.sec) SH().trained[opt.sec] = true;
  return ok;
}
// 幸運（14.1）・ラム酒（14.14）で振り直すか
async function offerReroll(label) {
  const T = S.mission.tokens;
  const seen = T.seen || (T.seen = {});
  const opts = [];
  if (T.luck) opts.push({ label: seen.luck ? '「幸運」で振り直す' : '「幸運」で振り直す（ランダム・イベントで得ていた幸運 14.1）', value: 'luck' });
  if (T.rum && S.mission.weather === 0) opts.push({ label: seen.rum ? '「ラム酒」で振り直す' : '「ラム酒」で振り直す（天候が回復した。約束のラム酒で士気が上がる 14.14）', value: 'rum' });
  if (!opts.length) return false;
  opts.forEach(o => { seen[o.value] = true; });
  opts.push({ label: 'そのまま', value: null });
  const v = await UI.choose(`${label} の結果を振り直しますか？`, opts);
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
  return `${SECTOR_NAME[sectorOf(k)]}（${'ABCD'[c.r]}${c.c}）`;
}

// ===================== 任務の準備（3.0 / 11.5）=====================
function eqDate(k) { return EQUIP_DATE[k] + (S.camp.equipShift || 0); }
async function missionSetup() {
  const C = S.camp;
  C.missionNo++;
  UI.head(`━━━━ 任務 ${C.missionNo}：${fmtDate()} ━━━━`);
  // 新しい装備（11.3）: 使える年月を過ぎていて、遅れていなければ装備する
  ['radar', 'hh', 'hfdf'].forEach(k => {
    if (SH().equipped[k] || monthNum() < eqDate(k)) return;
    if (C.equipDelayed[k]) { UI.bad(`${SECTION_NAME[k]}の装備が遅れています（11.3）`); return; }
    SH().equipped[k] = true;
    if (k === 'radar' || k === 'hfdf') SH().skills[k] = 1;
    UI.good(`${SECTION_NAME[k]}を装備しました${k === 'hh' ? '（爆雷の乗員が使う）' : '（乗員スキル1）'}`);
  });
  // 船団（3.5）
  if (!C.convoyPool.length) C.convoyPool = CONVOY_UNITS.map(u => u.id);
  const uid = C.convoyPool.splice(Math.floor(Math.random() * C.convoyPool.length), 1)[0];
  const unit = CONVOY_UNITS.find(u => u.id === uid);
  let from, to;
  if (C.port === 'ON') { from = 'ON'; to = unit.canada; }
  else {
    if (C.port && C.port !== unit.canada) UI.log(`船団の出発港は${PORT_NAME[unit.canada]}です。${PORT_NAME[C.port]}から移動しました（11.5）`);
    from = unit.canada; to = 'ON';
  }
  const base = { 1941: 30, 1942: 40, 1943: 50 }[S.date.y] || 50;
  const rolls = Array.from({ length: 8 }, () => d6() - 1);
  const size = base + sum(rolls);
  const orders = pick(['NC', 'CC', 'SC']);
  S.mission = {
    convoy: { speed: unit.speed, from, to, unit: uid }, pos: from, size, sunk: 0, stragglers: 0, tonnage: 0, reduce: 0,
    orders, weather: 0, events: {}, revealed: {}, ubPool: [], rePool: [], tokens: { luck: 0, rum: 0, skilled: 0 },
    flags: {}, turn: 0, start: Object.assign({}, S.date), ub: null, kills: [],
  };
  const M = S.mission;
  UI.log(`船団: <b>${unit.speed === 'fast' ? '高速' : '低速'}船団</b>（${PORT_NAME[from]} → ${PORT_NAME[to]}）`);
  UI.dice(`船団の規模（${S.date.y}年: ${base} ＋ (1d6−1)×8）: ${rolls.join('・')} → <b>${size}隻</b>`);
  UI.log(`命令書: <b>${WA_ROUTES[orders].name}（${orders}）</b>（ウェスタン・アプローチではこの航路を通る）`);
  // 天候（3.7）: d66、10〜3月 +2、6〜8月 −2（6進法）
  const mm = S.date.m, mod = (mm >= 10 || mm <= 3) ? 2 : (mm >= 6 && mm <= 8) ? -2 : 0;
  const raw = d66(), w = d66Add(raw, mod);
  M.weather = w <= 23 ? 0 : w <= 36 ? 1 : w <= 53 ? 2 : 3;
  UI.dice(`天候（d66${mod ? (mod > 0 ? '＋2' : '−2') : ''}）: ${raw}${mod ? '→' + w : ''} → <b>${WEATHER[M.weather]}</b>`);
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
  UI.log(`爆雷 25発${SH().equipped.hh ? '・ヘッジホッグ 15発' : ''}を積みました。`);
  const dep = story('depart', { port: PORT_NAME[from], speed: unit.speed === 'fast' ? '高速' : '低速', size, weather: ST_weather(M.weather) });
  UI.story(dep);
  J(dep, `${unit.speed === 'fast' ? '高速' : '低速'}船団 ${size}隻・命令書 ${WA_ROUTES[orders].name}・天候 ${WEATHER[M.weather]}`, '出港');
  await UI.next(storyOn() ? `${story('departAsk')}　▶ 「出港せよ」` : '▶ 出港する');
}

// ===================== 1ターン（4.0）=====================
async function playTurn() {
  const M = S.mission;
  M.turn++;
  UI.head(`── ターン ${M.turn}：${fmtDate()}　${placeName(M.pos)}　天候 ${WEATHER[M.weather]} ──`);
  // 1. 移動
  const dist = distances();
  const here = dist[M.pos];
  const opts = neighbors(M.pos).filter(n => dist[n] === here - 1 && (!PORT_POS[n] || n === M.convoy.to));
  const short = n => (PORT_POS[n] ? PORT_NAME[n] : (c => `${'ABCD'[c.r]}${c.c}`)(cellAt(n)));
  const choices = opts.map(n => ({ label: storyOn() ? `「${short(n)}へ向かえ」　${placeName(n)}` : placeName(n), value: n, hint: n === M.convoy.to ? '目的地' : (M.revealed[n] ? `判明: ${evName(M.events[n])}` : `目的地まで${dist[n]}`) }));
  // 上の地図にも、行き先のマスに選択肢の番号を出す
  M.moveOpts = opts;
  let to;
  try { to = choices.length === 1 && !S.settings.step ? opts[0] : await UI.choose(say(`移動するマスを選んでください（目的地まであと${here}マス）`, 'navAsk', { dest: PORT_NAME[M.convoy.to], n: here }), choices); }
  finally { M.moveOpts = null; }
  const prevSector = sectorOf(M.pos);
  M.pos = to;
  const days = (M.convoy.speed === 'fast' ? 1 : 1.5) + (M.weather === 3 ? 0.5 : 0);
  advanceDays(days);
  const rep = [];   // このターンの部下の報告（まとめて1つの段落にする）
  M.turnReport = rep;
  UI.log(`${placeName(to)}へ移動（${days}日）→ ${fmtDate()}`, 'routine');
  if (!PORT_POS[to]) { J(`${placeName(to)}へ進む。`, `天候 ${WEATHER[M.weather]}`); rep.push(story('moveDone', { place: placeName(to), days: days === 1 ? '1日' : days === 1.5 ? '1日半' : days + '日', date: fmtDate() })); }
  if (to === M.convoy.to) {
    UI.good(`<b>${PORT_NAME[to]}に到着しました。</b>`);
    const arr = story('arrive', { port: PORT_NAME[to] });
    UI.big(arr, 'good');
    J(arr, `入港・船団 ${M.size}隻（落伍 ${M.stragglers}）`, '入港');
    M.turnReport = null;
    if (to === 'ON' && S.camp.airRaid) await airRaid();
    return 'arrived';
  }
  // 2. 天候（新しいセクターに入った時だけ 7.1）
  const sec = sectorOf(to);
  if (sec !== prevSector) {
    const a = d6(), b = d6();
    const old = M.weather;
    if (a > b) M.weather = Math.max(0, M.weather - 1); else if (a < b) M.weather = Math.min(3, M.weather + 1);
    UI.dice(`${SECTOR_NAME[sec]}に入った。天候の変化（1d6を2回）: ${a}・${b} → ${M.weather === old ? '変わらず' : WEATHER[old] + ' → '} <b>${WEATHER[M.weather]}</b>`);
    const sx = story('sector.' + sec) + (M.weather > old ? story('weatherWorse') : M.weather < old ? story('weatherBetter') : '') + ST_weather(M.weather) + '。';
    flushReport();
    UI.story(sx);
    J(sx, `${SECTOR_NAME[sec]}に入る・天候 ${WEATHER[M.weather]}`);
  }
  // 霧／雪の衝突判定（7.3）
  if (M.weather === 2) await collisionCheck();
  // 3. 機械的な故障（8.0）
  await breakdownCheck();
  // 4. イベント
  let ev = M.events[to] || 'NE';
  M.revealed[to] = true;
  UI.log(`イベント・マーカー: <b>${evName(ev)}</b>`, 'routine');
  if (ev === 'UB') {
    if (M.weather === 3) { UI.log('暴風雨のため U ボートは攻撃できない（イベントなし 7.2）', 'routine'); rep.push(story('stormNoUb')); flushReport(); }
    else { flushReport(); UI.story(story('ubRadio')); await UI.wait(storyOn() ? '「総員、配置につけ！」' : '▶ U ボートの襲撃を判定する'); await uboatEvent({}); }
  } else if (ev === 'RE') { flushReport(); UI.story(story('reIntro')); await UI.wait(storyOn() ? '「何が起きた？」' : '▶ ランダム・イベントを判定する'); await randomEvent(); }
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
function evName(e) { return { NE: 'イベントなし', UB: 'Uボート!', RE: 'ランダム・イベント' }[e] || e; }

async function collisionCheck() {
  flushReport();
  UI.story(story('fogWatch'));
  let r = d66();
  UI.log(`霧／雪の衝突判定 d66＝${r}`, 'dice routine');
  if ((r <= 12 || r >= 65) && SH().equipped.radar) {
    const v = await UI.choose('レーダーで衝突判定を1回振り直せます（7.3）', [{ label: '振り直す', value: 1 }, { label: 'そのまま', value: 0 }]);
    if (v) { r = d66(); UI.dice(`（振り直し）d66＝${r}`); }
  }
  if (r <= 12) { UI.story(story('fogBad2')); addStragglers(2); UI.bad('船団内の2隻が衝突、落伍しました。'); J('霧の中で船団内の2隻が衝突、落伍した。', '落伍 2隻'); }
  else if (r >= 65) {
    addStragglers(1);
    UI.story(story('fogBad1'));
    UI.bad('コルベットが船団の1隻と衝突！ 1隻が落伍し、コルベットの1区画が損傷しました。');
    J('霧の中、本艦が船団の1隻と衝突した。', '落伍 1隻・本艦損傷');
    await UI.wait(storyOn() ? '「被害を調べろ！」' : '▶ 損傷区画を判定する');
    await sectionDamage(1);
  } else { UI.log('衝突は発生しませんでした。', 'routine'); UI.story(story('fogOk')); }
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
  const r = d66();
  const fail = r <= 12 || (r <= 14 && S.mission.weather === 3);
  UI.log(`機械的な故障の判定 d66＝${r} → ${fail ? '<b>故障発生</b>' : '故障なし'}`, fail ? 'dice' : 'dice routine');
  if (!fail && S.mission.turnReport) S.mission.turnReport.push(story('engineOk'));
  if (fail) { flushReport(); const n = d3(); UI.story(story('breakdown')); J('機関の故障が発生。', `損傷区画判定 ${n}回`); UI.bad(`故障！ ${n}回 損傷区画判定を行います（8.0）`); await UI.wait(storyOn() ? '「被害を調べろ！」' : '▶ 損傷区画を判定する'); await sectionDamage(n); }
}

// 損傷区画判定（9.5.3 表B）を n 回
async function sectionDamage(n) {
  for (let i = 0; i < n; i++) {
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
    UI.bad(`損傷区画（1d6＝${r}${extra}）: <b>${SECTION_NAME[k]}</b>${again ? '（再び）' : ''}に損害、困難修整 +${add}（計 +${secDiff(k)}）`);
    J(`${SECTION_NAME[k]}に損害。`, `困難 +${secDiff(k)}`);
  }
}

// 修理（10.0）: 困難修整のある区画ごとに1回、機関の乗員が修理。機関から先に直す
async function repairPhase() {
  const ks = Object.keys(SH().diff).filter(k => SH().diff[k] > 0).sort((a, b) => (a === 'engine' ? -1 : b === 'engine' ? 1 : 0));
  if (!ks.length) return;
  flushReport();
  await UI.wait(storyOn() ? '「機関長、修理にかかれ」' : '▶ 修理を判定する');
  UI.log('<b>修理</b>（機関の乗員が、困難修整のある区画を1つずつ直す 10.0）', 'routine');
  let n = 0;
  for (const k of ks) {
    const p = d3() + (n > 0 ? (SH().diff.engine || 0) + (SH().perm.engine || 0) : 0);
    const ok = await check(`${SECTION_NAME[k]}の修理`, skill('engine'), p, { sec: 'engine' });
    if (ok) { SH().diff[k]--; UI.log(`${SECTION_NAME[k]}の困難修整を1つ取り除いた（残り +${secDiff(k)}）`, 'good routine'); }
    UI.story(story(ok ? 'repairOk' : 'repairNg', { sec: SECTION_NAME[k] }));
    n++;
  }
}

// ===================== U ボートとの戦闘（9.0）=====================
function drawUboat() {
  const M = S.mission;
  if (!M.ubPool.length) { UI.log('U ボート・プールが空です。'); return null; }
  const id = M.ubPool.splice(Math.floor(Math.random() * M.ubPool.length), 1)[0];
  const d = UBOATS.find(u => u.id === id);
  return Object.assign({}, d, { attacksLeft: d.type === 7 ? 3 : 4, damage: 0, rng: null, orig: null, surfaced: false, contact: false, sieg: false, hhUsed: false });
}
const ubName = ub => `U ボート${ub.type === 7 ? 'VII' : 'IX'}型（${ub.id}・攻撃${ub.atk}／回避${ub.eva}）`;
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
  UI.log(`◆ ${ubName(ub)}　艦長: ${RANGE_CHAR[ub.range]}`, 'head ubinfo' + quiet);
  UI.log('◆ U ボートが船団に迫る！', 'head ubinfo-alt' + quiet);
  if (!ub.rng) {
    UI.log(`天候（${WEATHER[M.weather]}）のため、この U ボートは襲撃しなかった（9.2）`, 'routine');
    UI.story(M.weather === 2
      ? ST_pick(['見張り長「霧の向こうで何かが動いた気がしましたが……見失いました」', '霧が深すぎる。U ボートもこちらを見つけられなかったのだろう。それきり何も起きなかった。'])
      : ST_pick(['……それきり何も起きなかった。U ボートは手を出さずに去ったらしい。', '見張り長「気配が消えました。こちらの守りを見て、諦めたのかもしれません」']));
    M.ubPool.push(ub.id); return 'none';
  }
  UI.log(`攻撃距離: <b>${RANGE_NAME[ub.rng]}</b>`, 'routine');
  if (monthNum() >= 1942 * 12 + 6) { const r = d6(); if (r >= 5) { ub.sieg = true; UI.log(`ジークリンデ搭載（1d6＝${r}）: 潜航中の回避値 +1（13.1）`, 'bad ubinfo'); } }
  M.ub = ub;
  // この交戦に付く特別な効果（14.13・14.20）
  const help = { sunderland: !!M.flags.sunderland, escort: !!M.flags.escort, payback: !!M.flags.payback, ease: opts.cryptic ? 1 : 0 };
  M.flags.sunderland = M.flags.escort = M.flags.payback = false;
  if (opts.catchup) { help.payback = true; help.forceAll = true; }
  try {
    let phase = '9.5';
    if (opts.cryptic) { ub.damage = 2; ub.attacksLeft = 0; phase = '9.6'; UI.log('この U ボートは既に2損害を受け、魚雷を撃ち尽くしている（14.15）'); }
    else if (opts.catchup) {
      ub.surfaced = true;
      UI.log('浮上中の U ボートが落伍船を砲撃している！ 4インチ砲で2回射撃する（14.8）');
      const dmg = await gunfire(ub, 2, 0);
      if (dmg >= 3) { const r = await damageOutcome(ub, dmg, 'gun'); if (r !== 'continue') return r; }
      ub.surfaced = false; UI.log('U ボートは潜航した。', 'routine');
    } else {
      // 9.3 発見（昼夜・浮上／潜航）
      const a = d6(), b = d6(), t = a + b;
      const night = t <= 7;
      ub.surfaced = (t >= 4 && t <= 7) || t >= 11;
      if (ub.rng === 'C' && M.weather !== 2 && ub.surfaced) { ub.surfaced = false; UI.dice(`U ボートの状態 2d6＝${t}: ${night ? '夜間' : '昼間'}・浮上中 → 近距離なので潜航中（9.3）`); }
      else UI.dice(`U ボートの状態 2d6＝${t}: <b>${night ? '夜間' : '昼間'}・${ub.surfaced ? '浮上中' : '潜航中'}</b>`);
      ub.night = night;
      // 同じ日の前の襲撃より後の時刻にする
      ub.time = clockTime(night);
      const ap = story('ubApproach', { time: ub.time }) + (ub.surfaced ? story(night ? 'ubSurfacedNight' : 'ubSurfacedDay') : story('ubSubmerged'));
      UI.story(ap);
      J(ap.replace(/^[^。]*。/, ''), `U ボートの襲撃（${night ? '夜間' : '昼間'}・${RANGE_NAME[ub.rng]}・${ub.surfaced ? '浮上中' : '潜航中'}）`);
      await UI.wait();
      if (ub.surfaced) {
        const found = await spotSurfaced(ub, help);
        if (found) {
          const n4 = 2, nAA = ub.rng === 'L' ? 0 : 3;
          UI.log(`<b>浮上中の U ボートを発見！</b> 4インチ砲${n4}回${nAA ? '・対空砲' + nAA + '回' : ''}で射撃（9.4.3）`);
          const dmg = await gunfire(ub, n4, nAA);
          if (dmg >= 3) { const r = await damageOutcome(ub, dmg, 'gun'); if (r !== 'continue') return r; }
          ub.surfaced = false;
          UI.log(`U ボートは急速潜航した（損害${dmg}・9.4.4）`, 'ubdmg');
          UI.log('U ボートは急速潜航した（9.4.4）', 'ubdmg-alt routine');
          UI.story(story('crashDive'));
        } else {
          UI.log('浮上中の U ボートを発見できなかった。U ボートは浮上したまま1回攻撃する。', 'routine');
          await uboatAttack(ub, help);
          ub.surfaced = false;
          UI.log('U ボートは潜航した。', 'routine');
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
      const det = await asdicDetect(ub, help);
      if (det) {
        if (help.sunderland && S.mission.weather !== 2) {
          const ok = await check('サンダーランド機の対潜攻撃', 1, evaEff(ub));
          if (ok) { UI.good('サンダーランド機が U ボートを撃沈した！ 勝利は分け合いとなる（14.13）'); return await killUboat(ub, 'shared'); }
        }
        if (ub.rng !== 'C') { ub.rng = closer(ub.rng); UI.log(`U ボートを探知。距離を詰める → <b>${RANGE_NAME[ub.rng]}</b>`, 'routine'); UI.story(story('closeIn')); await UI.next(); phase = '9.5'; continue; }
        // 近距離: 爆雷攻撃。ヘッジホッグを積んでいれば、弾（15発）が残っている限り、どちらで攻撃するか選べる
        let useHH = false;
        if (SH().equipped.hh && SH().hhLeft > 0) {
          useHH = SH().dcLeft <= 0 ? true : await UI.choose(say('近距離で U ボートを探知。どちらで攻撃しますか？', 'hhAsk'), [
            { label: storyOn() ? `「ヘッジホッグ、撃て！」（残り${SH().hhLeft}発）` : `ヘッジホッグ（残り${SH().hhLeft}発）`, value: true, hint: '同時2損害で撃沈確実・1損害で撃沈。外れても接触を保つ' },
            { label: storyOn() ? `「爆雷戦用意！」（残り${SH().dcLeft}発）` : `爆雷（残り${SH().dcLeft}発）`, value: false, hint: '同時4損害で撃沈確実・3損害で撃沈。ASDIC の接触が途切れる' }]);
        }
        if (useHH) {
          const r = await depthCharge(ub, 'hh', opts);
          if (r === null) {} else if (r !== 'continue') return r;
          else {
            // ヘッジホッグの後も接触を保つ: 近距離 +1・探知済み +3 で探知し、成功すれば爆雷攻撃（任意 13.2）
            const d2 = await asdicDetect(ub, help, true);
            if (!d2) { ub.contact = false; phase = await lostContact(ub, opts); if (phase === 'end') return 'withdrew'; continue; }
            const use = SH().dcLeft > 0 ? await UI.choose(say('続けて爆雷攻撃を行いますか？（ASDIC の接触が途切れます 13.2）', 'hhMore') + (storyOn() ? '（爆雷を落とすと ASDIC の接触が途切れる 13.2）' : ''), [{ label: storyOn() ? '「爆雷、投下せよ！」' : '爆雷攻撃する', value: 1 }, { label: storyOn() ? '「待て。接触を保て」' : 'しない（探知を続ける）', value: 0 }]) : 0;
            if (!use) continue;
          }
        }
        if (SH().dcLeft <= 0) { UI.bad('爆雷が残っていない！'); phase = await lostContact(ub, opts); if (phase === 'end') return 'withdrew'; continue; }
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
    UI.log('（交戦が長引いたので打ち切りました）');
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
  if (SH().equipped.radar && await check('レーダー探知', skill('radar'), ub.eva + secDiff('radar'), { sec: 'radar', mine: true })) bonus += 2;
  if (SH().equipped.hfdf && await check('HF-DF 探知', skill('hfdf'), ub.eva + secDiff('hfdf'), { sec: 'hfdf', mine: true })) bonus += 2;
  const A = skill('watch') + (ub.rng === 'C' ? 1 : 0) + bonus + help.ease;
  const P = ub.eva + (ub.night ? 3 : 0) + (ub.rng === 'L' ? 3 : ub.rng === 'M' ? 2 : 0) + (M.weather === 1 ? 2 : M.weather === 2 ? 3 : 0) + secDiff('watch');
  const ok = await check('監視による浮上 U ボートの発見', A, P, { sec: 'watch', mine: true });
  UI.story(story(ok ? 'spotOk' : 'spotNg'));
  return ok;
}

// 9.4.3 射撃。損害の合計を返す
async function gunfire(ub, n4, nAA) {
  let dmg = 0;
  UI.story(story('gunStart'));
  for (let i = 1; i <= n4; i++) {
    const P = ub.eva + (ub.rng === 'L' ? 3 : ub.rng === 'M' ? 2 : 0) + secDiff('gun4');
    if (await check(`4インチ砲 射撃${i}`, skill('gun4'), P, { sec: 'gun4', mine: true })) dmg += hitDamage('4インチ砲', skill('gun4'), ub, 3);
  }
  for (let i = 1; i <= nAA; i++) {
    const P = ub.eva + (ub.rng === 'M' ? 3 : 0) + secDiff('aa');
    if (await check(`対空砲 射撃${i}`, skill('aa'), P, { sec: 'aa', mine: true })) dmg += hitDamage('対空砲', skill('aa'), ub, 2);
  }
  ub.damage += dmg;
  UI.log(`射撃による損害: <b>${dmg}</b>（U ボートの損害 計${ub.damage}）`, 'ubdmg');
  UI.log('射撃を終えた。U ボートの損害は分からない。', 'ubdmg-alt');
  return dmg;
}
// 命中1の損害判定: 目標値 1d6、スキルが回避値以下なら 1・6 は失敗。n 回振って目標値と同じ目ごとに1損害
function hitDamage(name, sk, ub, n) {
  const target = d6();
  if (sk <= evaEff(ub) && (target === 1 || target === 6)) { UI.dice(`${name}の損害判定: 目標値 ${target} → スキルが回避値以下なので外れ`); return 0; }
  const rs = Array.from({ length: n }, d6);
  const h = rs.filter(x => x === target).length;
  UI.dice(`${name}の損害判定: 目標値 ${target}、1d6×${n}＝${rs.join('・')} → 損害 ${h}`);
  return h;
}

// 9.5 U ボートの攻撃（1回）
async function uboatAttack(ub, help) {
  const M = S.mission;
  ub.attacksLeft--;
  let toCorvette = false;
  if (help.payback) { toCorvette = true; if (!help.forceAll) help.payback = false; UI.log('U ボートはプレイヤーのコルベットを狙う！（14.20/14.8）'); }
  else { const r = d66(); toCorvette = r <= 12; UI.dice(`U ボートの攻撃目標 d66＝${r} → <b>${toCorvette ? 'コルベット' : '船団内の1隻'}</b>${S.settings.hideEnemy ? '' : `（残り攻撃 ${ub.attacksLeft}回）`}`); }
  if (toCorvette) { await torpedo(ub.rng, {}); return; }
  const A = ub.atk + (ub.rng === 'C' ? 1 : 0) + falkeBonus();
  const P = 1 + (ub.rng === 'L' ? 1 : 0);
  const hit = await check(`U ボートの雷撃（${RANGE_NAME[ub.rng]}）${falkeBonus() ? '（G7e Falke +2）' : ''}`, A, P, { theirs: true });
  if (hit) shipSunk('U ボートの雷撃'); else { UI.log('魚雷は外れた。', 'routine'); UI.story(story('ubMiss')); }
  await UI.next();
}
// 物語の時刻: 同じ日の前の出来事より後の時刻にする
function clockTime(night) {
  const M = S.mission, today = fmtDate();
  if (M.clockDate !== today) M.clockWrap = 0;
  let t = ST_time(night, M.clockDate === today ? M.clockHour : null);
  if (t.startsWith('翌')) { M.clockWrap = (M.clockWrap || 0) + 1; t = t.slice(1); }   // 日をまたいだ回数
  const pre = ['', '翌', '翌々'][Math.min(2, M.clockWrap || 0)] + ((M.clockWrap || 0) > 2 ? `(${M.clockWrap}日後)` : '');
  M.clockDate = today; M.clockHour = ST_lastHour;
  return pre + t;
}
// 輸送船1隻の沈没と喪失トン数（9.5.1）
function shipSunk(why) {
  const M = S.mission;
  const t = tonnage();
  M.size = Math.max(0, M.size - 1); M.sunk++; M.tonnage += t.t;
  const ship = ST_shipName(t.kind);
  UI.log(`${why}: 輸送船1隻が沈没 — ${t.desc} <b>${t.t.toLocaleString()}トン</b>（喪失 計${M.tonnage.toLocaleString()}トン）`, 'bad routine');
  if (why === 'U ボートの雷撃') UI.story(story('shipHit', { time: clockTime(M.ub ? M.ub.night : Math.random() < 0.6), ship }));
  else if (why === '空襲') UI.story(`急降下してきた爆撃機の爆弾が、${ship}を直撃した——`);
  else UI.story(`落伍していた${ship}の消息は、二度と届かなかった——`);
  UI.big(`${ship} 沈没　${t.t.toLocaleString()}トン　（船団の喪失 計${M.tonnage.toLocaleString()}トン・残り${M.size}隻）`, 'bad');
  J(`${ship}、${why === 'U ボートの雷撃' ? '被雷して沈没' : why === '空襲' ? '爆撃を受けて沈没' : '落伍の後、消息を絶つ'}。`, `喪失 ${t.t.toLocaleString()}トン（計 ${M.tonnage.toLocaleString()}トン）`);
}
function tonnage() {
  const a = d6(), b = d6();
  if (a !== b) return { t: 6000 + a * 1000 - b * 1000, desc: `6,000＋${a}×1,000−${b}×1,000 ＝`, kind: '' };
  const kinds = ['', '弾薬運搬船', 'タンカー', 'タンカー', 'タンカー', 'タンカー', '救難船'];
  if (a === 6) return { t: 1700, desc: `ぞろ目 6・重要船「救難船」`, kind: '救難船' };
  const x = d6() + d6(), add = [0, 0, 0, 1, 2, 3][a - 1];
  return { t: (x + add) * 1000, desc: `ぞろ目 ${a}・重要船「${kinds[a]}」(2d6${add ? '+' + add : ''}＝${x + add})×1,000 ＝`, kind: kinds[a] };
}

// 9.5.2 コルベットへの雷撃。start: 魚雷の発射距離
async function torpedo(start, opt) {
  const M = S.mission;
  UI.bad(`<b>魚雷がコルベットに向かってくる！</b>（${RANGE_NAME[start]}から）`);
  UI.story(story('torpedoIn'));
  const order = ['L', 'M', 'C'];
  let found = 0, evBonus = 0;
  for (let i = order.indexOf(start); i < 3; i++) {
    const r = order[i];
    M.torp = r; renderStatus();
    const close = r === 'C';
    const pMod = (start === 'L' ? 1 : 0) + (M.weather === 1 ? 1 : 0) + (M.weather === 2 && start === 'C' ? 1 : 0);
    let ok = await check(`監視による魚雷発見（${RANGE_NAME[r]}）`, skill('watch') + (M.weather === 0 ? 1 : 0) + (close && M.weather !== 2 ? 1 : 0) + found, 4 + pMod + secDiff('watch'), { sec: 'watch', mine: true });
    if (!ok) ok = await check(`ASDIC による魚雷発見（${RANGE_NAME[r]}）`, skill('asdic') + (close ? 1 : 0) + found, 3 + pMod + secDiff('asdic'), { sec: 'asdic', mine: true });
    if (ok) { found++; evBonus = Math.min(3, evBonus + 1); UI.story(story('torpedoSeen')); }
  }
  const P = 4 + SH().hull + (engineDamaged() ? 1 : 0);
  M.torp = 'C'; renderStatus();
  const ev = await check('魚雷の回避', 4 + evBonus, P, { mine: true });
  M.torp = null;
  if (ev) { UI.good('魚雷を回避した！'); UI.big(story('evadeOk'), 'good'); J('本艦に向かう魚雷を回避。', '雷撃回避'); await UI.next(); return; }
  UI.bad('<b>魚雷が命中！</b>');
  UI.big(story('hit'), 'bad');
  J('本艦、被雷。', '被雷');
  await torpedoHit();
  await UI.next();
}
// 9.5.3 表A コルベット被雷損害
async function torpedoHit() {
  const r = d6(), h = d3(), n = r <= 3 ? 0 : r - 3;
  UI.dice(`被雷損害 1d6＝${r}: 船体損害 1d3＝${h}${n ? `＋${n}区画損害` : ''}`);
  SH().hull += h;
  if (SH().hull >= 3) { SH().hull = 3; await corvetteLost(); return; }
  if (n) await sectionDamage(n);
}
// 12.3 乗艦の沈没
async function corvetteLost() {
  UI.bad(`<b>${SH().name}は沈没した……</b>（船体損害3 12.3）`);
  UI.big(`${SH().name}は、冷たい北大西洋の波間に消えていった——`, 'bad');
  J(`${SH().name}、沈没。`, '乗艦喪失');
  S.camp.shipsLost.push({ name: SH().name, date: fmtDate(), year: yearIndex(S.mission.start) });
  const v = await UI.choose('乗艦が沈没しました。どうしますか？', [
    { label: '船団内の別のコルベットの指揮を執り、続ける', value: 1, hint: '1隻沈むごとに勝利レベルが1下がる' },
    { label: 'ここで終える', value: 0 }]);
  if (!v) throw new GameOver('sunk');
  const names = SHIP_NAMES.filter(n => n !== SH().name && !S.camp.shipsLost.some(x => x.name === n));
  const name = await UI.choose('新しい乗艦の艦名を選んでください', shuffle(names.slice()).slice(0, 6).map(n => ({ label: n, value: n })));
  const eq = Object.assign({}, SH().equipped);
  S.ship = newShip(name, eq);
  if (!eq.hh) SH().hhLeft = 0;
  UI.good(`${S.captain ? S.captain + '艦長は' : ''}${name}に移り、指揮を続ける。`);
}

// 9.6.1 ASDIC による探知
async function asdicDetect(ub, help, afterHH) {
  const A = skill('asdic') + (ub.rng === 'C' ? 1 : 0) + (ub.contact || afterHH ? 3 : 0) + (help.ease || 0);
  const P = evaEff(ub) + (ub.rng === 'L' ? 1 : 0) + secDiff('asdic');
  const ok = await check(`ASDIC による探知（${RANGE_NAME[ub.rng]}${ub.contact || afterHH ? '・接触中 +3' : ''}）`, A, P, { sec: 'asdic', mine: true });
  ub.contact = ok;
  const yd = { C: 600 + 100 * Math.floor(Math.random() * 4), M: 1200 + 200 * Math.floor(Math.random() * 4), L: 2500 + 250 * Math.floor(Math.random() * 4) }[ub.rng];
  UI.story(story(ok ? 'asdicOk' : 'asdicNg', { brg: ST_brg(), yd: yd ? yd.toLocaleString() : '' }));
  return ok;
}
// 9.6.2 探知できなかった時。次のフェイズ（'9.5' / '9.6' / 'end'）を返す
async function lostContact(ub, opts) {
  ub.contact = false;
  if (ub.attacksLeft > 0) { ub.rng = ub.orig; UI.log(`U ボートを見失った。U ボートは${RANGE_NAME[ub.rng]}に戻り、再び攻撃してくる（9.6.2）`, 'routine'); await UI.next(); return '9.5'; }
  const n = engineDamaged() ? 2 : 1;
  ub.rng = farther(ub.rng, n);
  if (ub.rng !== 'OUT') { UI.log(`U ボートは遠ざかる → <b>${RANGE_NAME[ub.rng]}</b>${n === 2 ? '（機関損傷で2段階）' : ''}`, 'routine'); UI.story(story('ubAway')); return '9.6'; }
  UI.log('<b>U ボートは戦闘海域から撤退した。</b>', 'routine');
  UI.story(story('ubGone'));
  J('U ボートは戦闘海域から去った。', `U ボート撤退${ub.damage ? '（損害 ' + ub.damage + '）' : ''}`);
  S.mission.ubPool.push(ub.id);
  if (!opts.noWolf && !opts.reinforce && !opts.cryptic && !S.mission.flags.noWolfpack) await wolfpack(ub);
  return 'end';
}
// 群狼戦術（9.6.2）: 1d6 − U ボートの損害 ＋ 洋上補給（14.17）
async function wolfpack(ub) {
  if (S.mission.flags.refuel) UI.bad('護衛艦の1隻が洋上補給で離れているため、群狼が集まりやすい（群狼戦術表 +1・14.17）');
  const r = d6(), mod = -ub.damage + (S.mission.flags.refuel ? 1 : 0), t = r + mod;
  const n = t <= 2 ? 0 : t === 3 ? 1 : t <= 5 ? 2 : 3;
  UI.dice(`群狼戦術 1d6＝${r}${mod ? (mod > 0 ? '＋' : '') + mod : ''} → ${n ? `<b>${n}隻が来援！</b>` : '来援せず'}`);
  if (n) { UI.big(story('wolf'), 'bad'); J('群狼が集結しつつある。', `U ボート ${n}隻来援`); }
  await UI.next();
  for (let i = 0; i < n; i++) {
    const ub2 = drawUboat();
    if (!ub2) break;
    UI.log(`来援 ${i + 1}隻目`);
    await engage(ub2, { reinforce: true });
  }
}

// 9.6.4 爆雷攻撃（weapon='dc'）／13.2 ヘッジホッグ（'hh'）。結果: 'continue' か、撃沈などの結果
async function depthCharge(ub, weapon, opts, over) {
  over = over || {};
  const isHH = weapon === 'hh';
  const name = isHH ? 'ヘッジホッグ' : '爆雷';
  const ammoKey = isHH ? 'hhLeft' : 'dcLeft';
  let n = 4;
  if (!over.free) {
    const left = SH()[ammoKey];
    if (left <= 0) return null;
    const mx = Math.min(4, left);
    n = await UI.choose(storyOn() ? `${isHH ? '水雷長「ヘッジホッグ、何発撃ちますか！」' : story('dcAsk')}（残り${left}発・1発がダイス1個）` : `${name}攻撃: ダイスを何個振りますか？（同じ数だけ${name}を使う。残り${left}）`,
      Array.from({ length: mx }, (_, i) => ({ label: storyOn() ? `「${mx - i}発、${isHH ? '撃て' : '投下せよ'}！」` : `${mx - i}個`, value: mx - i }))
        .concat(isHH ? [] : [{ label: storyOn() ? '「待て。投下するな」（0発・温存）' : '0個（投下しない・温存）', value: 0, hint: '外れと同じ扱い。爆発音がないので ASDIC の接触は保たれる' }]));
    if (n === 0) {
      UI.log('爆雷を投下しなかった（温存）。外れと同じ扱いで続ける。爆発音がないので ASDIC の接触は保たれる', 'routine');
      UI.story(ST_pick(['水雷長「投下待て！」——艦尾の爆雷が、レールの上で止まった。ASDIC の音だけが規則正しく響く。', '「まだだ。落とすな」——爆雷は温存した。ピーン……という音が、敵の位置をつかんだまま離さない。']));
      return 'hold';
    }
    SH()[ammoKey] -= n;
  }
  UI.story(story(isHH ? 'hh' : 'dc'));
  const sk = over.skill != null ? over.skill : skill('dc');
  const evaCmp = (over.eva != null ? over.eva : evaEff(ub)) + (over.free ? 0 : secDiff(weapon));
  const target = d6();
  let hits = 0;
  if (sk <= evaCmp && (target === 1 || target === 6)) UI.dice(`${name}攻撃: 目標値 ${target} → スキル${sk}が回避値${evaCmp}以下なので失敗`);
  else {
    let rs = Array.from({ length: n }, d6);
    UI.dice(`${name}攻撃: 目標値 ${target}、1d6×${n}＝${rs.join('・')}`);
    if (!over.free && S.mission.tokens.skilled && rs.some(x => x !== target)) {
      (S.mission.tokens.seen || (S.mission.tokens.seen = {})).skilled = true;
      const v = await UI.choose('「巧みな操艦」（ランダム・イベントで得ていた）で、外れたダイスを2個まで振り直しますか？（14.16）', [{ label: '振り直す', value: 1 }, { label: 'そのまま', value: 0 }]);
      if (v) { S.mission.tokens.skilled = 0; let k = 0; rs = rs.map(x => (x !== target && k++ < 2) ? d6() : x); UI.dice(`（振り直し）${rs.join('・')}`); }
    }
    hits = rs.filter(x => x === target).length;
  }
  ub.damage += hits;
  UI.log(`${name}の損害: <b>${hits}</b>（U ボートの損害 計${ub.damage}）`, 'ubdmg');
  UI.log(`${name}攻撃を終えた。結果は分からない。`, 'ubdmg-alt');
  const res = await damageOutcome(ub, hits, weapon, opts);
  if (res === 'continue' && S.settings.hideEnemy) UI.story(story('dcUnknown'));
  return res;
}
// 損害の結果（9.6.4 / 13.2 / 14.15）
async function damageOutcome(ub, hits, weapon, opts) {
  opts = opts || {};
  if (opts.cryptic && ub.damage >= 3) { UI.good('U ボートは浮上し、乗員は脱出して自沈した（14.15）'); return await killUboat(ub, 'certain'); }
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
  const txt = { certain: '撃沈確実', sunk: '撃沈', destroyed: '撃破', shared: '撃沈（共同）' }[kind];
  if (kind !== 'shared') UI.story(story(ub.surfaced ? 'kill.leadGun' : 'kill.lead'));
  UI.big(story('kill.' + kind), 'good');
  UI.story(story(kind === 'certain' && Math.random() < 0.5 ? 'kill.cheerCertain' : 'kill.cheer'));
  UI.good(`★ <b>${ubName(ub)}を${txt}！</b>`);
  J(`U ボート（${ub.type === 7 ? 'VII' : 'IX'}型 ${ub.id}）を${txt}。`, `★ ${txt}`);
  if (kind === 'certain') UI.good('U ボートは浮上し、乗組員は艦を放棄した。艦長に殊勲十字章が与えられる。');
  if (kind === 'sunk') UI.good('燃料を流出させた U ボートは撤退した。艦長に柏葉敢闘章（公式報告に名前が載る）。');
  if (kind === 'destroyed') UI.good('港の士官食堂で、悪くない祝宴が開かれるだろう。');
  const rec = { id: ub.id, kind, date: fmtDate(), ship: SH().name };
  S.camp.kills.push(rec); M.kills.push(rec);
  if (kind !== 'shared') SH().dcKill = true;
  if (kind === 'certain') {
    S.camp.medals.push(`${fmtDate()} 殊勲十字章（${ub.id} 撃沈確実）`);
    await enigma();
  }
  if (kind === 'sunk') S.camp.medals.push(`${fmtDate()} 柏葉敢闘章（${ub.id} 撃沈）`);
  await UI.next();
  return kind;
}
// エニグマと暗号表の回収（9.6.4）
async function enigma() {
  const secs = ['watch', 'asdic', 'gun4', 'aa', 'dc', 'engine'].concat(['radar', 'hfdf'].filter(k => SH().equipped[k]));
  const k = await UI.choose(say('放棄された U ボートからエニグマと暗号表の回収を試みますか？ 回収班を出す区画を選んでください', 'enigmaAsk'), secs.map(s => ({ label: SECTION_NAME[s], value: s })).concat([{ label: '回収を試みない', value: null }]));
  if (!k) return;
  const r = d66();
  if (r === 11) { SH().perm[k] = (SH().perm[k] || 0) + 1; UI.bad(`d66＝${r}: U ボートは回収班を道連れに沈没した。${SECTION_NAME[k]}にこの航海の間 困難+1`); }
  else if (r === 66) { UI.good(`d66＝${r}: <b>エニグマと暗号表の回収に成功！</b> ヴィクトリア十字章を推薦されるが、機密保持のため国王から殊勲十字章が授与される`); S.camp.medals.push(`${fmtDate()} 殊勲十字章（エニグマ回収）`); }
  else UI.log(`d66＝${r}: 回収は失敗したが、罰則はない。`);
}
// 14.13 エア・ギャップ: 別の護衛艦が ASDIC 探知と爆雷攻撃を2回行う（護衛艦のスキルは1とする）
async function escortHelp(ub) {
  UI.log('<b>別の護衛艦が手助けに来た！</b>（14.13）');
  for (let i = 1; i <= 2; i++) {
    const ok = await check(`護衛艦の ASDIC 探知 ${i}`, 1 + (ub.rng === 'C' ? 1 : 0), evaEff(ub) + (ub.rng === 'L' ? 1 : 0));
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
  if (!n) { UI.log('ランダム・イベントのプールが空です。'); return; }
  const sec = sectorOf(M.pos), w = M.weather;
  // 不利なイベント（空襲・借りは返す・洋上補給の失敗）は、オプションで伏せられる（効果が出た時に分かる）
  const H = `◇ ランダム・イベント ${n}「${RE_NAME[n]}」`;
  J(`ランダム・イベント「${RE_NAME[n]}」。`, 'イベント');
  const headBad = () => { UI.log(H, 'head badev'); UI.log('◇ ランダム・イベント（内容は伏せられている）', 'head badev-alt'); };
  if ([1, 10, 13, 14, 16, 17, 20].indexOf(n) < 0) UI.head(H);
  else if ([1, 13, 16].indexOf(n) >= 0) headBad();
  const none = msg => { UI.log(`${msg ? msg + '　' : ''}イベントなし。マーカーはプールに戻す。`); backRE(n); };
  switch (n) {
    case 1: M.tokens.luck = 1; UI.storyHid('副長「艦長、今日はどうも運が向いている気がしますな」'); UI.log('幸運に恵まれた。目的地に着くまでに1回、判定のダイスを振り直せる（14.1）', 'good badev'); break;
    case 2: { // 生存者発見
      if (w >= 2) return none('霧／雪・暴風雨のため');
      UI.log('小艇に乗った漂流者を発見し、救助に向かう。');
      UI.story('見張り長「右舷前方に小艇！ 人が乗っています！」——艦を寄せ、縄梯子を下ろす。');
      const r = d66(); UI.dice(`d66＝${r}`);
      if (r === 11 || r === 66) { UI.story('救助のさなか、聴音員が叫んだ。「魚雷音！ 近い！」'); UI.bad('U ボートが近距離からコルベットを雷撃！'); await torpedo('C', {}); }
      else { UI.good('漂流者を救助した。'); UI.story('凍えた生存者たちが毛布にくるまれ、熱い紅茶を手にしている。「ありがとう……ありがとう……」'); J('漂流者を救助。', '生存者救助'); }
      break;
    }
    case 3: { // 油膜発見
      if (w === 3) return none('暴風雨のため');
      UI.story('見張り「海面に油膜！ かなり広がっています」');
      const r = d6(); UI.dice(`海面に油膜。1d6＝${r}`);
      if (r <= 3) { UI.log('何も発見できない。'); UI.story('しばらく周辺を捜索したが、何も見つからなかった。'); backRE(n); }
      else if (r <= 5) {
        if (!M.stragglers) return none('落伍船がいないので');
        M.stragglers--; M.size++; UI.good('落伍船1隻を発見、船団に合流させた。'); UI.story('油膜の先に、はぐれた商船がいた。信号灯で呼びかけ、船団へ連れ戻す。'); J('落伍船1隻を発見し、船団に戻す。', '落伍船 合流'); backRE(n);
      } else {
        UI.story('聴音員「油膜の下に反応……傷ついた U ボートです！」');
        UI.log('損傷した U ボート（潜航中・回避値3・既に2損害）から燃料が漏れていた。攻撃を開始する。');
        const ub = { id: '損傷Uボート', type: 7, range: 'C', atk: 0, eva: 3, attacksLeft: 0, damage: 2, rng: 'C', surfaced: false, contact: false, sieg: false, hhUsed: true };
        M.ub = ub;
        if (await asdicDetect(ub, { ease: 0 })) {
          if (SH().dcLeft > 0) { const res = await depthCharge(ub, 'dc', {}); if (res === 'continue') UI.log('U ボートは接触を断った。'); }
        } else UI.log('探知できなかった。U ボートは接触を断った。');
        M.ub = null; backRE(n);
      }
      break;
    }
    case 4: // 機雷／ソナーに感
      if (sec === 'W') {
        UI.story('見張り長「前方に浮遊機雷！ ゆっくり船団に近づいています！」——「対空砲、撃ち方用意！」');
        UI.log('浮遊する機雷がゆっくり船団に近づいている！ 対空砲で爆破を試みる（14.4.1）');
        for (const r of ['L', 'M', 'C']) {
          if (await check(`対空砲で機雷を爆破（${RANGE_NAME[r]}）`, skill('aa'), 4 + secDiff('aa'), { sec: 'aa', mine: true })) { UI.good('機雷を爆破した。'); UI.story('対空砲が吠え、機雷は水柱とともに砕け散った。'); J('浮遊機雷を対空砲で爆破。', '機雷処分'); backRE(n); return; }
        }
        UI.story('当たらない！ 機雷はもう目の前だ——「取舵いっぱい！」');
        if (await check('機雷の回避', 4, 4, { mine: true })) { UI.good('機雷を回避した。'); UI.story('艦はぎりぎりで機雷をかわした。誰かが大きく息を吐いた。'); }
        else { UI.bad('<b>機雷に接触！</b>'); UI.big('轟音。機雷が艦腹で炸裂した！', 'bad'); J('浮遊機雷に接触。', '触雷'); await torpedoHit(); }
        backRE(n);
      } else {
        if (w === 3) return none('暴風雨のため');
        UI.story('聴音員「ASDIC に反応！ 何かいます！」');
        const r = d6(); UI.dice(`ソナーに感あり（14.4.2）。1d6＝${r}`);
        if (r <= 3) { UI.log('鯨だった。'); UI.story('……鯨だった。巨大な影が悠々と船団の下をくぐっていく。'); backRE(n); }
        else if (r <= 5) { UI.log('水中漂流物だった。'); UI.story('……沈んだ船の残骸だった。誰も口をきかなかった。'); backRE(n); }
        else { UI.story('「本物です！ U ボートです！」'); UI.bad('U ボート発見！'); await uboatEvent({ noWolf: true }); }
      }
      break;
    case 5: { // 落水
      const r = d6(); const k = r <= 2 ? 'watch' : r === 3 ? 'aa' : r <= 5 ? 'gun4' : 'dc';
      SH().perm[k] = (SH().perm[k] || 0) + 1;
      UI.story(`「人が落ちた！」——荒れた海に、もう乗員の姿は見えない。${SECTION_NAME[k]}の部署に穴が空いた。`);
      UI.bad(`乗員が海に落ちて行方不明に（1d6＝${r}）。この任務中、${SECTION_NAME[k]}に修理できない困難+1`);
      J(`乗員1名、落水して行方不明。`, `${SECTION_NAME[k]} 困難+1`);
      break;
    }
    case 6: { // 潜望鏡発見
      if (w === 3) return none('暴風雨のため');
      UI.story(`通信長「船団司令より。中央の船が潜望鏡らしきものを発見！」　${S.captain ? S.captain + '艦長' : '艦長'}は調査を命じた。`);
      const r = d6(); UI.dice(`中央の船が潜望鏡を発見との連絡。調査する 1d6＝${r}`);
      if (r <= 3) { UI.log('何も見つからない。'); UI.story('付近を捜索したが、何も見つからない。見間違いだったのだろうか。'); backRE(n); }
      else if (r <= 5) { UI.log('誰かが海に落としたモップだった。'); UI.story('……波間に浮かんでいたのは、誰かが海に落としたモップだった。艦橋に乾いた笑いが広がる。'); backRE(n); }
      else { UI.story('見張り長「潜望鏡です！ 本物です！」'); UI.bad('U ボート発見！'); await uboatEvent({ noWolf: true }); }
      break;
    }
    case 7: // 氷山
      if (sec === 'C') { const dd = (M.convoy.speed === 'fast' ? 1 : 1.5) + (w === 3 ? 0.5 : 0); advanceDays(dd); UI.story('見張り「前方に氷山！」——巨大な白い壁が霧の中から現れた。船団は大きく迂回せざるを得ない。'); UI.bad(`氷山を迂回するため${dd}日を浪費した → ${fmtDate()}`); J('氷山を迂回。', `${dd}日を浪費`); backRE(n); }
      else if (sec === 'A') { UI.story('見張りが帆を張った小艇を発見する。艇内で6人が身を寄せ合っているが反応がない。艦を横付けすると、全員が死んでからしばらく経っていることがわかった……（ゲームには影響なし）'); }
      else {
        UI.story('通信長「司令部より。アンソン機が付近に墜落、乗員を捜索せよ」');
        UI.log('墜落したアブロ・アンソン機の乗員の捜索を命じられた（14.7）');
        let ok = false;
        for (const [r, a, p] of [['L', 0, 1], ['M', 0, 0], ['C', 1, 0]]) {
          if (await check(`捜索（${RANGE_NAME[r]}）`, skill('watch') + a, 3 + p + secDiff('watch'), { sec: 'watch', mine: true })) { ok = true; break; }
        }
        if (ok) { S.camp.equipShift -= 1; UI.story('波間の救命筏に、手を振る人影！ 引き上げてみると、新兵器を開発する科学者——「ボフィン」だった。'); UI.good('ボフィン（科学者）の救出に成功！ 新兵器の装備が1カ月早まる。'); J('墜落機の乗員（科学者）を救出。', '新兵器 1カ月早まる'); }
        else { S.camp.equipShift += 1; UI.story('日が暮れるまで捜したが、筏は見つからなかった。'); UI.bad('救出失敗。技術的な後退で、新兵器の装備が1カ月遅れる。'); J('墜落機の乗員を発見できず。', '新兵器 1カ月遅れる'); }
      }
      break;
    case 8: { // キャッチアップ
      if (w === 3) { UI.log('暴風雨なので、別のマーカーを引き直す。'); backRE(n); return await randomEvent(); }
      UI.story('通信長「司令部より、船団後方で落伍した3隻を支援せよ」——現場に急行すると、砲声が聞こえる。浮上した U ボートが商船を砲撃している！');
      UI.log('落伍した3隻の支援を命じられた。現場に向かうと、浮上中の U ボートが1隻を砲撃中だった！');
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
      if (!adj.length) { UI.log('隣のマスのマーカーは全部わかっている。'); break; }
      UI.story('通信長「海軍本部より緊急電。船団の進路上に群狼が待ち伏せしている模様！」');
      const k = await UI.choose(storyOn() ? '航海長「どの海域を確かめますか、艦長」' : '群狼の待ち伏せの情報。隣のマスのマーカーを1つ表にします。どこを調べますか？', adj.map(x => ({ label: storyOn() ? `「${placeName(x)}を確かめろ」` : placeName(x), value: x })));
      M.revealed[k] = true;
      UI.good(`${placeName(k)}のマーカーは「<b>${evName(M.events[k])}</b>」`);
      UI.story(M.events[k] === 'UB' ? `通信長「${placeName(k)}……います。U ボートの発信が集中しています」` : M.events[k] === 'RE' ? `通信長「${placeName(k)}……何かがありそうですが、よく分かりません」` : `通信長「${placeName(k)}は、静かなものです」`);
      break;
    }
    case 10: headBad(); S.camp.airRaid = true; UI.storyHid('通信長「リバプール方面で、ドイツ軍機の活動が活発になっているとの情報です」'); UI.log('次に船団がリバプールへ着いた直後に、ドイツ軍の空襲を受ける（マーカーをリバプールに置く）', 'bad badev'); break;
    case 11: // 敵機／ミルヒ・クー
      if (sec === 'W') { const dd = (M.convoy.speed === 'fast' ? 1 : 1.5) + (w === 3 ? 0.5 : 0); advanceDays(dd); UI.story('見張り長「上空に大型機！ FW200 コンドルです！」——コンドルは対空砲の届かない高さで、ゆっくりと船団の周りを旋回している……'); UI.bad(`FW200 が船団を発見して引き返した。群狼を呼んだかもしれない。警戒しながら進むため${dd}日を浪費 → ${fmtDate()}`); }
      else {
        UI.story('見張り「水平線に艦影——潜水艦が2隻、並んでいます！」 補給中のミルヒ・クーだ。慌てて潜航した跡に、ゴムボートが取り残されている。');
        UI.log('洋上で U ボートに補給中のミルヒ・クーを発見！ 位置が特定された。回避値1の U ボートに爆雷攻撃を1回行う（14.11）');
        const ub = { id: 'ミルヒ・クー', type: 7, range: 'C', atk: 0, eva: 1, attacksLeft: 0, damage: 0, rng: 'C', surfaced: false };
        if (SH().dcLeft > 0) {
          const res = await depthCharge(ub, 'dc', {});
          if (res === 'certain' || res === 'sunk') { M.flags.noWolfpack = true; UI.story('爆雷の衝撃のあと、海面に重油が湧き上がった！'); UI.good('U ボートは補給困難となり、この任務の間 群狼戦術を使えない。'); }
        }
      }
      break;
    case 12: { // 救助要請
      if (w === 3) return none('暴風雨のため');
      UI.story('見張り「前方に損傷した商船！ 救助を求める信号を出しています！」——機関長たちが乗り移った。');
      UI.log('前の船団の落伍船と遭遇。損傷していて修理が必要だ。');
      if (await check('落伍船の修理', skill('engine'), 2 + secDiff('engine'), { sec: 'engine', mine: true })) {
        const t = (d6() + 6) * 1000; M.reduce += t; UI.story('半日がかりの修理の末、商船の機関が息を吹き返した。汽笛が礼を言うように鳴った。'); UI.good(`修理成功。この任務の喪失トン数が ${t.toLocaleString()}トン軽減される。`); J('前の船団の落伍船を修理し、救う。', `喪失 ${t.toLocaleString()}トン軽減`);
      } else { UI.log('修理できなかった（罰則なし）。'); UI.story('手は尽くしたが、商船の機関は直らなかった。'); }
      break;
    }
    case 13: // たゆまぬ努力
      if (sec === 'A') { M.flags.escort = true; UI.storyHid('通信長「僚艦より。手が空いたので、こちらの支援に回るそうです」'); UI.log('次に U ボートが攻撃する時、別の護衛艦が手助けしてくれる（ASDIC 探知・爆雷攻撃を2回）。', 'good badev'); }
      else { M.flags.sunderland = true; UI.storyHid('通信長「沿岸航空隊より。サンダーランド機が船団の上空を哨戒するとのことです」'); UI.log('次に U ボートが攻撃する時、サンダーランド機が対潜攻撃を行う（霧／雪では不可）。', 'good badev'); }
      break;
    case 14: // 酒保開け
      if (w === 0) { UI.head(H); return none('好天なので'); }
      headBad(); M.tokens.rum = 1; UI.storyHid('副長「艦長、乗員たちがだいぶ参っています」——「天気が回復したら、ラム酒を出すと伝えろ」'); UI.log('天候が回復したら乗員にラム酒を振る舞うと約束した。好天の時に1回、判定のダイスを振り直せる。', 'good badev');
      break;
    case 15: { // 暗号通信
      UI.story('聴音員「微弱な反応……潜望鏡深度の U ボートです！ 通信を送ろうとしているようです！」');
      UI.log('損傷した U ボートが重要な通信を送るため、潜望鏡深度まで浮上した！');
      const ub = drawUboat();
      if (!ub) break;
      const res = await engage(ub, { cryptic: true, noWolf: true });
      if (res === 'none') backRE(n);
      break;
    }
    case 16: M.tokens.skilled = 1; UI.storyHid('航海長「この艦の癖が、ようやく掴めてきましたよ」'); UI.log('「巧みな操艦」: 爆雷攻撃の時に1回、外れたダイスを2個まで振り直せる。', 'good badev'); break;
    case 17: { // 洋上補給
      const dist = distances()[M.pos];
      const r = d6();
      if (r >= dist) { UI.head(H); UI.dice(`護衛艦の1隻の燃料が乏しい。目的地まで${dist}マス、1d6＝${r}`); UI.good('洋上補給なしで目的地に着ける。'); UI.story('機関長「燃料はぎりぎり持ちます。目的地までは大丈夫でしょう」'); backRE(n); }
      else { headBad(); UI.log(`護衛艦の1隻の燃料が乏しい。目的地まで${dist}マス、1d6＝${r}`, 'dice badev'); M.flags.refuel = true; UI.storyHid('僚艦より発光信号「燃料ガ尽キル。タンカーカラ補給ヲ受ケニ離レル」'); UI.log('護衛艦の1隻が洋上補給のため船団から離れた。以後、群狼戦術表に +1。', 'bad badev'); }
      break;
    }
    case 18: { // 急病人
      const r = d66(); UI.dice(`d66＝${r}`);
      if (r === 11 || r === 66) {
        const s = d6(); let k = ['watch', 'asdic', 'aa', 'gun4', 'dc', 'engine'][s - 1];
        if (!SH().sick) { SH().sick = { k, orig: SH().skills[k] }; SH().skills[k] = 1; }
        UI.story(`軍医「艦長、${SECTION_NAME[k]}の士官が高熱で倒れました。治療できる船に移さないと……」`);
        UI.bad(`主要士官が病気に（1d6＝${s}）。${SECTION_NAME[k]}の乗員はこの任務の間スキル1（次の任務で復帰）`);
        J(`${SECTION_NAME[k]}の士官が病に倒れ、移送。`, `${SECTION_NAME[k]} スキル1`);
      } else { UI.log('乗員は元気だ。'); UI.story('軍医「熱を出した者が一人いましたが、もう大丈夫です」'); }
      break;
    }
    case 19: { // 火災発生
      const r = d66(); UI.dice(`d66＝${r}`);
      if (r === 11 || r === 66) {
        const k = d3(); UI.big('見張り長「船団の中央で火災！ 炎が夜空を照らしています！」——これでは、U ボートに位置を教えているようなものだ。', 'bad'); UI.bad(`船団内の1隻で火災発生！ 気づいた群狼 ${k}隻が1隻ずつ攻撃してくる。`); J('船団内の1隻で火災。群狼が集まる。', `U ボート ${k}隻`);
        for (let i = 0; i < k; i++) await uboatEvent({ noWolf: true });
      } else { UI.log('火災は起きなかった。'); UI.story('どこかの船でボヤ騒ぎがあったが、すぐに消し止められた。'); }
      break;
    }
    case 20: headBad(); M.flags.payback = true; UI.storyHid('通信長「傍受した敵の無電に……本艦の名前が出てきました」'); UI.log('「借りは返す」: 次に U ボートが攻撃する時、自動的にこのコルベットを狙ってくる。', 'bad badev'); break;
  }
}

// 14.10 空襲（リバプールに着いた直後）
async function airRaid() {
  const M = S.mission;
  S.camp.airRaid = false;
  let planes = d6();
  UI.bad(`<b>ドイツ軍の空襲！</b> 1d6＝${planes}機`);
  J(`リバプール沖でドイツ軍機 ${planes}機の空襲を受ける。`, '空襲');
  if (await check('対空戦闘', skill('aa'), 3 + secDiff('aa'), { sec: 'aa', mine: true })) { planes--; UI.good(`1機を撃墜した（残り${planes}機）`); }
  const target = d6();
  const rs = Array.from({ length: planes }, d6);
  const h = rs.filter(x => x === target).length;
  UI.dice(`爆撃: 目標値 ${target}、1d6×${planes}＝${rs.join('・') || '-'} → ${h}隻沈没`);
  for (let i = 0; i < h; i++) shipSunk('空襲');
}

// ===================== 任務の終わり（11.0）=====================
function yearIndex(dt) { return (dt.y * 12 + dt.m) < 1942 * 12 + 6 ? 1 : 2; }
async function missionEnd() {
  const M = S.mission, C = S.camp;
  const arrival = fmtDate();
  const medals0 = C.medals.length;
  UI.head(`━━━━ 任務 ${C.missionNo} の終わり：${PORT_NAME[M.convoy.to]}入港 ━━━━`);
  // 11.1 落伍船の運命
  const strag = M.stragglers;
  for (let i = 0; i < strag; i++) {
    const r = d6();
    if (r <= 5) { UI.dice(`落伍船 ${i + 1}: 1d6＝${r}`); shipSunk('落伍船の沈没'); }
    else { M.size++; UI.dice(`落伍船 ${i + 1}: 1d6＝${r} → 遅れて入港した`); }
  }
  M.stragglers = 0;
  if (M.reduce) { const before = M.tonnage; M.tonnage = Math.max(0, M.tonnage - M.reduce); UI.good(`救助要請で修理した落伍船の分 ${M.reduce.toLocaleString()}トンを軽減（${before.toLocaleString()} → ${M.tonnage.toLocaleString()}）`); }
  // 11.2 勝利点
  const vp = vpForTonnage(M.tonnage);
  const yi = yearIndex(M.start);
  C.yearVP[yi] = (C.yearVP[yi] || 0) + vp;
  C.missions.push({ no: C.missionNo, start: fmtDate(M.start), end: fmtDate(), from: M.convoy.from, to: M.convoy.to, speed: M.convoy.speed, size0: M.size + M.sunk, sunk: M.sunk, tonnage: M.tonnage, vp, kills: M.kills.length, ship: SH().name, year: yi });
  UI.log(`<b>この任務の結果</b>: 沈没 ${M.sunk}隻・喪失 <b>${M.tonnage.toLocaleString()}トン</b> → 勝利点 <b>${vp > 0 ? '+' : ''}${vp} VP</b>（${yi}年目の合計 ${C.yearVP[yi]} VP）`);
  if (M.kills.length) UI.good(`U ボート ${M.kills.length}隻を仕留めた。`);
  // 航海日誌（Form 33A 風）を作っておく
  C.lastLog = { name: `航海日誌_任務${C.missionNo}_${M.start.y}-${M.start.m}`, html: logbookHtml(M, arrival, vp, C.medals.slice(medals0)) };
  await UI.next();
  // 11.4 乗員の練度向上（3任務ごと）
  if (C.missionNo % 3 === 0) {
    UI.log('<b>乗員の練度向上の判定</b>（3任務ごと 11.4）');
    const ks = ['gun4', 'aa', 'asdic', 'watch', 'engine', 'radar', 'hfdf', 'dc'];
    ks.forEach(k => {
      if (!hasSection(k)) return;
      const ok = k === 'dc' ? SH().dcKill : SH().trained[k];
      if (!ok) return;
      const base = SH().sick && SH().sick.k === k ? SH().sick.orig : SH().skills[k];
      if (base >= 6) return;
      const r = d6();
      if (r <= 6 - base) { if (SH().sick && SH().sick.k === k) SH().sick.orig++; else SH().skills[k]++; UI.good(`${SECTION_NAME[k]}: 1d6＝${r} → スキル ${base + 1} に上がった`); }
      else UI.dice(`${SECTION_NAME[k]}: 1d6＝${r} → 変わらず`);
    });
    SH().trained = {}; SH().dcKill = false;
  }
  // 11.5 港に滞在する日数
  const marks = Object.keys(SH().dmg).length + SH().hull;
  const stay = d6() + marks;
  advanceDays(stay);
  UI.log(`港に${stay}日滞在して修理した（1d6＋損害マーカー${marks}）→ ${fmtDate()}`);
  SH().dmg = {}; SH().diff = {}; SH().perm = {}; SH().hull = 0;
  if (SH().sick) { SH().skills[SH().sick.k] = SH().sick.orig; SH().sick = null; }
  C.port = M.convoy.to;
  // 11.3 装備の遅れ（次の任務で装備される区画）
  ['radar', 'hh', 'hfdf'].forEach(k => {
    if (SH().equipped[k] || monthNum() < eqDate(k)) return;
    const a = d6(), b = d6(), v = (a + b - 2) * 2;
    C.equipDelayed[k] = M.sunk >= v;
    UI.dice(`${SECTION_NAME[k]}の装備判定: (2d6−2)×2＝(${a}+${b}−2)×2＝${v}、この任務で失った船 ${M.sunk}隻 → ${C.equipDelayed[k] ? '<b>遅れる</b>' : '次の任務で装備'}`);
  });
  S.mission = null;
  // 終わりの判定
  if (S.mode === '1m') { S.phase = 'campaignEnd'; autoFiles(); return; }
  const endY = S.mode === '1y' ? 1942 : 1943;
  if (S.date.y > endY || (S.date.y === endY && S.date.m > 5)) { S.phase = 'campaignEnd'; autoFiles(); return; }
  S.phase = 'missionSetup';
  autoFiles();
  await UI.next(storyOn() ? `${story('nextMission')}　▶ 次の任務へ` : '▶ 次の任務へ');
}
// 航海ごとに、セーブファイルと航海日誌を自動でダウンロードする（オプションで切れる）
function autoFiles() {
  if (S.settings.autoFile === false) return;
  saveLocal();
  try {
    saveFile(`corvette_command_任務${S.camp.missionNo}`);
    downloadLog();
    UI.log(`航海が終わったので、セーブファイルと航海日誌をダウンロードしました（Load で続きから遊べます）。`, 'good');
  } catch (e) {
    // ダウンロードできなくても、ゲームは続ける（ブラウザの中の自動保存は済んでいる）
    UI.bad('ファイルのダウンロードに失敗しました。ブラウザの中には保存してあります。');
  }
}
function downloadLog() {
  const L = S && S.camp && S.camp.lastLog;
  if (!L) { alert('まだ終わった航海がありません'); return; }
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
  const kills = M.kills.map(k => `${k.id}（${{ certain: '撃沈確実', sunk: '撃沈', destroyed: '撃破', shared: '共同撃沈' }[k.kind]}）`).join('、') || 'なし';
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>航海日誌 ${esc(SH().name)} 任務${S.camp.missionNo}</title>
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
</div></body></html>`;
}

// ===================== ゲームの終わり（12.0）=====================
async function campaignEnd(why) {
  const C = S.camp;
  S.phase = 'over';
  UI.head('━━━━ 戦いの終わり ━━━━');
  if (S.mode === '1m') {
    const m = C.missions[C.missions.length - 1];
    if (m) UI.log(`1回の任務: 喪失 ${m.tonnage.toLocaleString()}トン → ${m.tonnage < 50000 ? '<b>プレイヤーの勝利</b>（5万トン未満 12.1）' : '<b>プレイヤーの敗北</b>（5万トン以上）'}`);
  } else {
    const years = S.mode === '1y' ? [1] : [1, 2];
    years.forEach(y => {
      const vp = C.yearVP[y] || 0;
      const lost = C.shipsLost.filter(x => x.year === y).length;
      let li = VICTORY_LEVELS.indexOf(victoryLevel(vp)) - lost;
      li = Math.max(0, li);
      UI.log(`${y}年目（${y === 1 ? '1941年6月〜1942年5月' : '1942年6月〜1943年5月'}）: 合計 <b>${vp} VP</b>${lost ? `・乗艦の沈没 ${lost}隻（勝利レベル −${lost}）` : ''} → <b>${VICTORY_LEVELS[li]}</b>`);
    });
  }
  UI.log(`任務 ${C.missions.length}回・U ボート ${C.kills.length}隻（${C.kills.map(k => k.id + ' ' + { certain: '撃沈確実', sunk: '撃沈', destroyed: '撃破', shared: '共同撃沈' }[k.kind]).join('、') || 'なし'}）`);
  if (C.medals.length) UI.good('受章: ' + C.medals.join(' ／ '));
  if (why === 'sunk') UI.bad('乗艦の沈没で、ここで終えました。');
  else if (S.mode === '2y') {
    const v = await UI.choose(`${SH().name}は1943年5月31日まで生き残った。その後の運命を見ますか？（15.4）`, [{ label: '見る', value: 1 }, { label: '見ない', value: 0 }]);
    if (v) await epilogue();
  }
  saveLocal();
  await UI.choose('おつかれさまでした。', [{ label: '新しいゲームを始める', value: 1 }]);
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}
// 15.4 コルベットのその後
async function epilogue() {
  const total = ['gun4', 'aa', 'dc', 'asdic', 'watch', 'engine', 'radar', 'hfdf'].filter(hasSection).reduce((t, k) => t + SH().skills[k], 0);
  const vpAll = (S.camp.yearVP[1] || 0) + (S.camp.yearVP[2] || 0);
  const d36 = () => d6() * d6();
  let alive = true;
  UI.log(`総合スキル ${total}`);
  const yearRun = async (y, table) => {
    const r = d6(); const area = table[r];
    const x = d36();
    UI.dice(`${y}年: 1d6＝${r} → <b>${area}</b>`);
    if (area === '地中海' || area === 'イギリス海峡') {
      UI.dice(`1d36＝${x}`);
      if ((area === '地中海' && x === 36) || (area === 'イギリス海峡' && (x === 30 || x === 36))) { UI.bad('コルベットは戦没した。'); return false; }
      if (x <= total) UI.good(`${area === '地中海' ? 'ハスキー作戦' : 'ネプチューン作戦'}に参加、功績をあげた（+1 VP）`);
      if (x <= total / 2) UI.good('U ボートを1隻撃沈した。');
    } else if (area === '近海') {
      UI.dice(`1d36＝${x}`);
      if (x === 36) { UI.bad('コルベットは戦没した。'); return false; }
      if (x <= SH().skills.dc) UI.good('U ボートを1隻撃沈した。');
    } else if (area === '北極海') {
      UI.dice(`1d36＝${x}`);
      if (x === 30 || x === 36) { UI.bad('コルベットは戦没した。'); return false; }
      if (x <= total / 2) UI.good('U ボートを1隻撃沈した。');
    } else UI.log('オーバーホールのため、主立った戦果はなかった。');
    return true;
  };
  alive = await yearRun(1943, { 1: '地中海', 2: '地中海', 3: '近海', 4: '近海', 5: '北極海', 6: 'オーバーホール' });
  if (alive) alive = await yearRun(1944, { 1: '近海', 2: 'イギリス海峡', 3: 'イギリス海峡', 4: 'イギリス海峡', 5: '北極海', 6: 'オーバーホール' });
  if (!alive) return;
  let mod = 0, year = 1945;
  for (let guard = 0; guard < 20; guard++) {
    const r = Math.min(6, d6() + mod);
    UI.dice(`${year}年: 1d6${mod ? '+' + mod : ''}＝${r}`);
    if (r === 1) {
      const x = d36(); UI.dice(`護衛任務 1d36＝${x}`);
      if (x === 25 || x === 30 || x === 36) { UI.bad('最後の護衛任務で戦没した。'); return; }
      if (x <= SH().skills.dc) UI.good('U ボートを1隻撃沈した。');
      mod += 1;
    } else if (r === 2) { UI.log('イギリス連邦または同盟国に譲渡され、軍艦として運用された。'); mod += 2; }
    else if (r === 3) { UI.log('民間に払い下げられ、おそらく捕鯨船として使われた。'); mod += 2; }
    else {
      const x = d36(); UI.dice(`解体 1d36＝${x}（合計 VP ${vpAll}）`);
      if (x <= vpAll) UI.good(`<b>${SH().name}は記念館として保存された！</b>`); else UI.log(`長年活躍した${SH().name}も、ついにスクラップにされた。`);
      return;
    }
    year += 5;
  }
}

// ===================== ステータス（上半分）=====================
function renderStatus() {
  const el = $('status');
  if (!S || !S.ship) { el.innerHTML = '<div class="title">コルベット・コマンド</div>'; return; }
  const sh = S.ship, M = S.mission, C = S.camp;
  // 能力は小さな札にして横に並べる（文字を大きくしても上の画面に収まるように）
  const chips = ['watch', 'asdic', 'radar', 'hfdf', 'gun4', 'aa', 'dc', 'hh', 'engine'].map(k => {
    const avail = hasSection(k);
    const sk = k === 'hh' ? '(爆雷)' : sh.skills[k];
    const df = secDiff(k);
    const short = { watch: '監視', asdic: 'ASDIC', radar: 'レーダー', hfdf: 'HF-DF', gun4: '4inch砲', aa: '対空砲', dc: '爆雷', hh: 'ヘッジホッグ', engine: '機関' }[k];
    return `<span class="chip ${avail ? '' : 'na'}" title="${SECTION_NAME[k]}">${short} ${avail ? `<b>${sk}</b>` + (sh.sick && sh.sick.k === k ? '<small>病</small>' : '') : '未'}${df ? ` <span class="df">困+${df}</span>` : ''}${sh.dmg[k] ? '<span class="dm">損</span>' : ''}${sh.trained[k] || (k === 'dc' && sh.dcKill) ? '<span class="tr">◎</span>' : ''}</span>`;
  }).join('');
  const hull = [0, 1, 2].map(i => `<span class="hb ${i < sh.hull ? 'on' : ''}"></span>`).join('');
  let h = `<div class="col ship"><div class="title">${sh.name}${S.captain ? `<small class="cap">　艦長 ${S.captain}</small>` : ''}</div>
    <div class="chips">${chips}</div>
    <div class="shipline">船体 ${hull}　爆雷 <b>${sh.dcLeft}</b>${sh.equipped.hh ? `　ヘッジホッグ <b>${sh.hhLeft}</b>` : ''}</div></div>`;
  h += `<div class="col info"><div><b>${fmtDate()}</b>　任務 ${C.missionNo}</div>`;
  if (M) {
    h += `<div>${M.convoy.speed === 'fast' ? '高速' : '低速'}船団 ${PORT_NAME[M.convoy.from]} → ${PORT_NAME[M.convoy.to]}　命令: ${WA_ROUTES[M.orders].name}</div>
      <div>位置: ${placeName(M.pos)}　天候: <b>${WEATHER[M.weather]}</b></div>
      <div>船団 <b>${M.size}</b>隻　沈没 ${M.sunk}　落伍 ${M.stragglers}</div>
      <div>喪失 <b>${M.tonnage.toLocaleString()}</b>トン（このままなら ${vpForTonnage(Math.max(0, M.tonnage - M.reduce)) > 0 ? '+' : ''}${vpForTonnage(Math.max(0, M.tonnage - M.reduce))} VP）</div>`;
    const hb = S.settings.hideBad;
    const sn = M.tokens.seen || {};
    const tk = [M.tokens.luck && (!hb || sn.luck) ? '幸運' : '', M.tokens.rum && (!hb || sn.rum) ? 'ラム酒' : '', M.tokens.skilled && (!hb || sn.skilled) ? '巧みな操艦' : '', M.flags.payback && !hb ? '借りは返す' : '', M.flags.sunderland && !hb ? 'サンダーランド' : '', M.flags.escort && !hb ? '援護の護衛艦' : '', M.flags.refuel && !hb ? '洋上補給(群狼+1)' : '', M.flags.noWolfpack ? '群狼なし' : '', S.camp.airRaid && !hb ? '空襲予告' : ''].filter(Boolean);
    if (tk.length) h += `<div class="tok">${tk.join('・')}</div>`;
    h += mapHtml();
    if (!M.ub) h += rangeHtml();
  }
  h += `<div class="vp">勝利点: 1年目 ${C.yearVP[1] || 0}${S.mode === '2y' ? '／2年目 ' + (C.yearVP[2] || 0) : ''}　U ボート撃沈 ${C.kills.length}</div></div>`;
  if (M && M.ub) {
    const ub = M.ub;
    const hide = S.settings.hideEnemy;
    h += `<div class="col ub"><div class="title">U ボート</div>${hide ? '<div>正体不明</div>' : `<div>${ub.type === 7 ? 'VII' : 'IX'}型 ${ub.id}</div><div>攻撃 ${ub.atk}／回避 ${ub.eva}${ub.sieg ? '<small>（ジークリンデ）</small>' : ''}</div>`}
      <div>距離 <b>${ub.rng ? RANGE_NAME[ub.rng] || ub.rng : '-'}</b>　${ub.surfaced ? '浮上中' : '潜航中'}</div>${hide ? '' : `<div>損害 <b>${ub.damage}</b>　残り攻撃 ${ub.attacksLeft}</div>`}${ub.contact ? '<div class="good">ASDIC 接触中</div>' : ''}${rangeHtml()}</div>`;
  }
  el.innerHTML = h;
}
// コルベットと U ボート（と魚雷）の距離の図。交戦中だけ出す
function rangeHtml() {
  const M = S.mission, ub = M.ub, tp = M.torp;
  if (!ub && !tp) return '';
  const cells = [['C', '近距離'], ['M', '中距離'], ['L', '長距離'], ['OUT', '圏外']];
  const rule = {
    C: 'ASDIC +1・爆雷/ヘッジホッグ可・雷撃 A+1',
    M: '射撃 P+2（対空砲 P+3）・発見 P+2',
    L: '射撃 P+3（対空砲 不可）・発見 P+3・ASDIC P+1・雷撃 P+1',
    OUT: '撤退（群狼の判定）',
  };
  let h = '<div class="rng"><span class="rc corv">コルベット</span>';
  cells.forEach(([k, nm]) => {
    const isUb = ub && ub.rng === k, isOrig = ub && ub.orig === k && ub.rng !== k, isTp = tp && tp === k;
    h += `<span class="rc${isUb ? ' ubh' : ''}${isTp ? ' tph' : ''}"><small>${nm}</small>${isUb ? `<b>U${ub.surfaced ? '▲' : '▼'}</b>` : ''}${isTp ? '<b>→魚雷</b>' : ''}${isOrig ? '<i>攻撃位置</i>' : ''}</span>`;
  });
  h += '</div>';
  const now = tp || (ub && ub.rng);
  if (now && rule[now]) h += `<div class="rrule">${RANGE_NAME[now] || '圏外'}: ${rule[now]}${ub ? `　${ub.surfaced ? '▲浮上中' : '▼潜航中'}` : ''}</div>`;
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
        else if (M.revealed[k]) txt = { NE: '・', UB: 'U', RE: 'R' }[M.events[k]];
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
  UI.head('コルベット・コマンド　北大西洋船団護送作戦 1941-1943');
  UI.log('あなたはフラワー級コルベットの艦長として、大西洋を渡る船団を U ボートから護衛する。');
  const mode = await UI.choose('遊び方を選んでください', [
    { label: '2年間（1941年6月〜1943年5月）', value: '2y', hint: '任務を続け、1年ごとに勝利点で勝敗' },
    { label: '1年間（1941年6月〜1942年5月）', value: '1y' },
    { label: '1回だけの任務', value: '1m', hint: '喪失5万トン未満で勝ち' }]);
  S.mode = mode;
  S.date = { y: 1941, m: 6, d: 1 };
  if (mode === '1m') {
    const y = await UI.choose('任務の年を選んでください', [1941, 1942, 1943].map(v => ({ label: v + '年', value: v })));
    const ms = y === 1941 ? [6, 7, 8, 9, 10, 11, 12] : y === 1943 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const m = await UI.choose('任務の月を選んでください', ms.map(v => ({ label: v + '月', value: v })));
    S.date = { y, m, d: 1 };
  }
  const cap = await UI.ask('あなた（艦長）の名前を入力してください。部下はこの名前で呼びかけてきます（空のままなら「艦長」）', '例: ハミルトン');
  S.captain = cap.replace(/[<>&"]/g, '');
  const nm = await UI.choose('乗艦の艦名を選んでください（15.0）', [{ label: 'くじで決める', value: '' }].concat(SHIP_NAMES.map(n => ({ label: n, value: n }))));
  const name = nm || pick(SHIP_NAMES);
  const port = await UI.choose('最初の任務の出発港を選んでください（3.5）', [{ label: 'カナダ（ハリファックスかセント・ジョンズ）', value: 'C' }, { label: 'リバプール', value: 'ON' }]);
  S.camp = { missionNo: 0, port: port === 'ON' ? 'ON' : null, convoyPool: [], yearVP: {}, missions: [], kills: [], medals: [], shipsLost: [], equipDelayed: {}, equipShift: 0, airRaid: false };
  S.ship = newShip(name);
  // 1回だけの任務で、もう使える時期なら装備する
  if (mode === '1m') ['radar', 'hh', 'hfdf'].forEach(k => { if (monthNum() >= EQUIP_DATE[k]) { S.ship.equipped[k] = true; } });
  UI.good(`${S.captain ? S.captain + 'は、' : ''}${name}の艦長に着任した。`);
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
    UI.bad('エラーが起きました: ' + (e && e.message));
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
      catch (e) { alert('コルベット・コマンドのセーブファイルではありません'); }
    });
  };
  inp.click();
}
function restart() { if (confirm('今のゲームを消して、最初から始めますか？')) { localStorage.removeItem(SAVE_KEY); location.reload(); } }
// オプション（判定の数字・U ボートへの損害・不利なイベントを隠す）
const OPTIONS = [
  ['hideDice', '判定の数字を隠す', '青い行（A/P・出目）を出さず、結果の文だけにする'],
  ['hideEnemy', 'U ボートの情報を隠す', '型・攻撃値・回避値・艦長の性格・与えた損害・残りの攻撃回数を隠す。撃沈・撃破した時に正体が分かる（判定の数字も隠すと、回避値も分からなくなる）'],
  ['hideBad', 'あとで効くイベントを伏せる', '空襲・借りは返す・洋上補給・サンダーランド機・援護の護衛艦は効果が出るまで、幸運・ラム酒・巧みな操艦は使える時が来るまで、内容を伏せる'],
  ['autoFile', '航海ごとにファイルを保存', '航海が終わるたびに、セーブファイルと航海日誌を自動でダウンロードする'],
  ['hideRoutine', '細かい処理の行を隠す', '移動・故障なし・イベントなし・衝突なし・距離の変化・魚雷の外れ・修理など、物語の文で分かる行を隠す（大事な結果は隠さない）'],
  ['story', '物語で報告', '小説風の文と部下のセリフだけで報告する（判定や結果の行は出さない。数字は上のステータスで分かる）'],
];
function applySettings() {
  if (!S || !S.settings) return;
  document.body.classList.toggle('hide-dice', !!S.settings.hideDice);
  document.body.classList.toggle('hide-enemy', !!S.settings.hideEnemy);
  document.body.classList.toggle('hide-bad', !!S.settings.hideBad);
  document.body.classList.toggle('story-mode', S.settings.story !== false);
  document.body.classList.toggle('hide-routine', !!S.settings.hideRoutine);
}
function openOptions() {
  if (!S) return;
  let ov = $('optOverlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'optOverlay'; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="optbox"><div class="title">オプション</div>${OPTIONS.map(([k, n, d]) => `<label><input type="checkbox" data-k="${k}" ${((k === 'story' || k === 'autoFile') ? S.settings[k] !== false : S.settings[k]) ? 'checked' : ''}> <b>${n}</b><br><small>${d}</small></label>`).join('')}<small>オフに戻すと、隠していた行も見えるようになります。</small><button onclick="document.getElementById('optOverlay').style.display='none'">閉じる</button></div>`;
  ov.querySelectorAll('input').forEach(i => i.onchange = () => { S.settings[i.dataset.k] = i.checked; applySettings(); renderStatus(); saveLocal(); });
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
function toggleStep() { if (!S) return; S.settings.step = !S.settings.step; $('stepBtn').textContent = S.settings.step ? '1手ずつ: ON' : '1手ずつ: OFF'; saveLocal(); }

window.addEventListener('DOMContentLoaded', () => {
  const saved = loadLocal();
  if (saved && saved.phase && saved.phase !== 'over') {
    S = saved;
    (S.logLines || []).forEach(l => UI.addLine(l));
    // ターンの途中で閉じた時は、そのターンの始めからやり直す（保存はターンの区切りでしている）
    UI.log('— 保存したところから続けます —', 'head');
  }
  if (S) $('stepBtn').textContent = S.settings.step ? '1手ずつ: ON' : '1手ずつ: OFF';
  if (!S) S = { version: 1, phase: 'new', settings: { step: true, hideDice: true, hideEnemy: true, hideBad: true, autoFile: true, hideRoutine: true, story: true }, logLines: [] };
  applySettings();
  fontSize(0);
  initSplit();
  runGame();
});
