// パットンズ・ベスト — 画面
'use strict';
const $ = id => document.getElementById(id);
const E = ENGINE;
const LOGS = [];
var VIEW = 'map';      // map / battle
var SEL = null;        // 地図で選んだ区域
var ADV = false;       // 前進射撃
var ORD = null;        // 今のラウンドの命令
let lastDebrief = null;
// 判定は一度にまとめない。ルールの処理を先に終えて、セリフと盤面を止まりながら順に見せる（ユーザーの指示 2026-11-04）
function flash(c) { const el = document.body; el.classList.remove('hit', 'warnf'); void el.offsetWidth; el.classList.add(c); }
var ALLLOG = [], DAYSTART = 0;
// 判定の記録は画面に出さず、別に残す。ブラウザにも保存する
var JUDGELOG = (() => { try { return JSON.parse(localStorage.getItem('pb_judge') || '[]'); } catch (e) { return []; } })();
function keepJudge() { try { if (JUDGELOG.length > 60000) JUDGELOG = JUDGELOG.slice(-60000); localStorage.setItem('pb_judge', JSON.stringify(JUDGELOG)); } catch (e) {} }
function showLine(t, c) { if (c === 'judge') { JUDGELOG.push(t); return; } if (c === 'date' || c === 'head' || c === 'evening') JUDGELOG.push(t); if (c === 'bad') flash('hit'); ALLLOG.push({ t, c }); if (c === 'date') DAYSTART = ALLLOG.length - 1; const d = document.createElement('div'); d.textContent = t; if (c) d.className = c; const el = $('log'); el.insertBefore(d, $('lb') || $('lbplay') || null); while (el.childNodes.length > 5000) el.removeChild(el.firstChild); el.scrollTop = el.scrollHeight; }
// ログの中に出す操作（続ける、弾薬、夕方の報告など。ユーザーの指示 2026-11-04）
function inlineBox(html) { const old = $('lb'); if (old) old.remove(); const d = document.createElement('div'); d.id = 'lb'; d.className = 'logbox'; d.innerHTML = html; const el = $('log'); el.insertBefore(d, $('lbplay') || null); el.scrollTop = el.scrollHeight; }
function renderPlayBtn() { const old = $('lbplay'); if (old) old.remove(); if (!PLAY) return; const d = document.createElement('div'); d.id = 'lbplay'; d.className = 'logbox'; d.innerHTML = `<button class="go" onclick="stepPlay()">${esc(PLAY.label || L('続ける', 'Go on'))}</button>`; const el = $('log'); el.appendChild(d); el.scrollTop = el.scrollHeight; }
var BUF = null, PLAY = null, AUTO = false;
E.setLogger((t, c) => { if (BUF) BUF.push({ t, c }); else showLine(t, c); });
E.setPause(label => { if (BUF) BUF.push({ pause: label, snap: JSON.stringify(E.G) }); });
function play(fn, then) {
  BUF = [];
  const r = fn();
  const events = BUF, real = E.G;
  BUF = null;
  PLAY = { events, i: 0, real, r, then };
  stepPlay();
}
// 既読のログは暗くする。ボタンを押した時に、それまでの行を既読にする（ユーザーの指示 2026-11-04）
function markRead() { document.querySelectorAll('#log > div:not(.read):not(.logbox)').forEach(d => d.classList.add('read')); }
function stepPlay() {
  const P = PLAY; if (!P) return;
  markRead();
  while (P.i < P.events.length) {
    const e = P.events[P.i++];
    if (e.pause) {
      E.G = JSON.parse(e.snap); P.label = e.pause;
      if (E.G.phase === 'battle' && E.G.bb) VIEW = 'battle';
      render();
      if (AUTO) { setTimeout(stepPlay, 500); }
      return;
    }
    showLine(e.t, e.c);
  }
  E.G = P.real; PLAY = null;
  P.then(P.r);
}
document.addEventListener('keydown', ev => { if ((ev.key === ' ' || ev.key === 'Enter') && PLAY && !$('lb') && $('over').style.display === 'none') { ev.preventDefault(); stepPlay(); } });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ===== 文字の大きさとログ =====
var FS = (() => { try { return +localStorage.getItem('pb_fs') || 17; } catch (e) { return 17; } })();
function applyFs() { document.documentElement.style.setProperty('--fs', FS + 'px'); }
function zoom(k) { FS = Math.max(12, Math.min(28, FS + k * 2)); try { localStorage.setItem('pb_fs', FS); } catch (e) {} applyFs(); }
function saveLog() { const t = ALLLOG.map(x => x.t).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.download = `pattons_best_log_${E.G ? E.G.days : 0}.txt`; a.click(); }
applyFs();
var JUDGE_ON = true;
function setJudgeOn(v) { JUDGE_ON = v; E.setJudge(v); }
function judgeBox() {
  keepJudge();
  $('over').style.display = 'flex';
  $('over').innerHTML = `<div class="box"><h2>${L('判定の記録', 'Dice record')}</h2><p class="small">${L(`全${JUDGELOG.length}行。新しいものが下です。`, `${JUDGELOG.length} lines, newest at the bottom.`)}</p><div id="jlist" style="max-height:60vh;overflow:auto;font-family:ui-monospace,Menlo,monospace;font-size:.82em;white-space:pre-wrap">${JUDGELOG.slice(-3000).map(esc).join('\n')}</div><p><button class="go" onclick="closeOver()">${L('閉じる', 'Close')}</button> <button onclick="saveJudge()">${L('ファイルに保存', 'Save to file')}</button> <button onclick="if(confirm('${L('記録を消しますか？', 'Clear the record?')}')){JUDGELOG=[];keepJudge();closeOver()}">${L('記録を消す', 'Clear')}</button></p></div>`;
  const j = $('jlist'); j.scrollTop = j.scrollHeight;
}
function saveJudge() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JUDGELOG.join('\n')], { type: 'text/plain' })); a.download = 'pattons_best_dice.txt'; a.click(); }
function renderLogHead() { $('logh').innerHTML = `<b>${L('戦闘ログ', 'Battle log')}</b> <button onclick="saveLog()">${L('ログ保存', 'Save log')}</button> <button onclick="judgeBox()">${L('判定の記録', 'Dice record')}</button> <button onclick="saveAllReports()">${L('レポート一式', 'All reports')}</button> <label class="small"><input type="checkbox" ${AUTO ? 'checked' : ''} onchange="AUTO=this.checked;if(AUTO)stepPlay()"> ${L('自動で進める', 'Auto')}</label>`; } // 自動で進めるは、ログの見出しへ（ユーザーの指示 2026-11-08）
// ===== 開始の画面 =====
function startScreen() {
  const has = (() => { try { return !!localStorage.getItem('pb_save'); } catch (e) { return false; } })();
  $('over').style.display = 'flex';
  $('over').innerHTML = `<div class="box">
  <h2>Patton's Best</h2>
  <p>${L('言語', 'Language')}: <button onclick="setLang('ja')" ${LANG === 'ja' ? 'class="go"' : ''}>日本語</button> <button onclick="setLang('en')" ${LANG === 'en' ? 'class="go"' : ''}>English</button></p>
  <p>${L('1944年7月、ノルマンディー。あなたは第4機甲師団のシャーマン戦車の車長です。パットン将軍の「最良の部隊」とともに、フランスからバストーニュ、そしてライン川の向こうまで、終戦までの9か月を戦い抜いてください。',
    'July 1944, Normandy. You command a Sherman tank in the 4th Armored Division. With George Patton\'s best, fight from France through Bastogne and across the Rhine — nine months, until the war ends.')}</p>
  <p>${L('一人用のキャンペーンです。出撃のたびに乗員は腕を上げ、戦車は新しい型に代わっていきます。ルールを知らなくても、乗員に命令を出すだけで遊べます。乗員も車長も、死ねば戻ってきません。',
    'A solo campaign. Your crew grows with each day of combat, and better tanks arrive as the war goes on. You need not know the rules: just give orders to your crew. But the dead do not come back.')}</p>
  <p style="color:var(--mute);font-size:.9em">${L('原作: Patton\'s Best（Avalon Hill, 1987）のルールをもとに作りました。', 'Based on the rules of Patton\'s Best (Avalon Hill, 1987).')}</p>
  <p>${L('あなたの名前', 'Your name')}: <input id="fName" value="${L('スミス', 'Smith')}" size="12"> ${L('戦車の名前', 'Tank name')}: <input id="fTank" value="${L('ロージー', 'Rosie')}" size="12"></p>
  <p><button class="go" onclick="newGame()">${L('出撃する', 'Roll out')}</button> ${has ? `<button onclick="loadGame()">${L('続きから', 'Continue')}</button>` : ''}</p></div>`;
}
function newGame() {
  E.newCampaign({ name: $('fName').value || 'Smith', tank: $('fTank').value || 'Rosie' });
  $('over').style.display = 'none';
  const g = E.G;
  setJudgeOn(JUDGE_ON); logIntro();
  render();
}
function logIntro() {
  const g = E.G, say = showLine;
  say(L(`1944年7月27日、サン・ロー西方。M4シャーマン「${g.tankName}」の車長 ${g.crew.C.name} 軍曹、着任。`, `July 27, 1944, west of St. Lo. Sgt. ${g.crew.C.name} takes command of M4 Sherman "${g.tankName}".`), 'head');
  say(L(`砲手${g.crew.G.name}（腕前${g.crew.G.rating}）、装填手${g.crew.L.name}（${g.crew.L.rating}）、操縦手${g.crew.D.name}（${g.crew.D.rating}）、副操縦手${g.crew.A.name}（${g.crew.A.rating}）。`, `Gunner ${g.crew.G.name} (${g.crew.G.rating}), loader ${g.crew.L.name} (${g.crew.L.rating}), driver ${g.crew.D.name} (${g.crew.D.rating}), assistant ${g.crew.A.name} (${g.crew.A.rating}).`));
}
function save() { try { const g = E.G; if (!g || g.day) return; localStorage.setItem('pb_save', JSON.stringify(g)); } catch (e) {} }
function loadGame() { try { const g = JSON.parse(localStorage.getItem('pb_save')); E.G = g; g.phase = g.over ? 'over' : 'calendar'; g.day = null; g.bb = null; $('over').style.display = 'none'; render(); } catch (e) { startScreen(); } }

// ===== 上の帯 =====
function renderBar() {
  const g = E.G, d = g.day, t = E.tank();
  const c = g.calIdx < PB.CAL.length ? PB.CAL[g.calIdx] : null;
  const date = d ? `${d.c.year}/${d.c.mon}/${d.c.day}` : (c && c.mon ? `${c.year}/${c.mon}/${c.day}` : L('再編', 'Refit'));
  const w = d ? weatherStr(d.w) : '';
  $('bar').innerHTML = `<b>Patton's Best</b><span>${date}</span>${d ? `<span>${clockStr(d.time)} / ${L('日没', 'sunset')} ${clockStr(d.set)}</span><span>${w}</span><span class="s">${{ A: L('進撃', 'Advance'), B: L('戦闘', 'Battle'), C: L('反撃阻止', 'Counterattack') }[d.sc]}・${L('抵抗', 'resist.')} ${{ L: L('軽', 'L'), M: L('中', 'M'), H: L('重', 'H') }[d.res]}</span>` : ''}
    <span class="s">${g.tankName}（${t.model}）</span><span>${['軍曹', '二等軍曹', '少尉', '中尉', '大尉'].map((x, i) => [x, ['Sgt.', 'S/Sgt.', '2Lt.', '1Lt.', 'Capt.'][i]])[g.rank][LANG === 'en' ? 1 : 0]} ${esc(g.crew.C.name)}</span><span class="s">${L('戦車の累計', 'Tank total')} ${g.totalVP}VP</span>${g.medals.length ? `<span class="s">🎖${g.medals.length}</span>` : ''}
    <span style="margin-left:auto"><button onclick="zoom(-1)" title="${L('文字を小さく', 'Smaller text')}">A−</button> <button onclick="zoom(1)" title="${L('文字を大きく', 'Larger text')}">A＋</button> <button onclick="helpBox()">${L('遊び方', 'Help')}</button></span>`;
}
const weatherStr = w => { const a = []; if (w.fog) a.push(L('霧', 'Fog')); if (w.fall) a.push(L('降雪', 'Snow')); if (w.deep) a.push(L('深雪', 'Deep snow')); else if (w.ground) a.push(L('積雪', 'Ground snow')); if (w.mud) a.push(L('泥濘', 'Mud')); if (w.rain) a.push(L('雨', 'Rain')); if (w.overcast) a.push(L('曇り', 'Overcast')); return a.join('・') || L('晴れ', 'Clear'); };
const clockStr = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function renderTabs() {
  const g = E.G;
  $('tabs').innerHTML = `<button class="${VIEW === 'map' ? 'on' : ''}" onclick="VIEW='map';render()">${L('地図', 'Map')}</button>
  <button class="${VIEW === 'battle' ? 'on' : ''}" onclick="VIEW='battle';render()">${L('戦場', 'Battlefield')}</button>
  <span style="color:var(--mute);font-size:.9em;margin-left:8px">${VIEW === 'map' ? L('進む区域を選びます', 'Choose where to go') : (g.bb && g.phase === 'battle' ? L(`第${g.bb.round}ラウンド。敵を押すと主砲の目標になります`, `Round ${g.bb.round}. Click an enemy to target it`) : '')}</span>`;
}
// ===== 地図 =====
function renderMap() {
  const g = E.G, d = g.day;
  if (!d || !d.map || d.map.cur == null) { $('board').innerHTML = `<svg viewBox="0 0 1296 1400"><image href="img/map.jpg" width="1296" height="1400"/></svg>`; return; }
  const m = d.map, cur = m.areas[d.advFrom != null ? d.advFrom : m.cur], near = g.phase === 'move' ? (d.advChoice || E.neighbors(cur).map(a => a.id)) : [];
  let h = `<image href="img/map.jpg" width="1296" height="1400"/>`;
  for (const i of near) { const a = m.areas[i]; h += `<line x1="${cur.x}" y1="${cur.y}" x2="${a.x}" y2="${a.y}" stroke="#ffe27a" stroke-width="3" stroke-dasharray="10 8" opacity=".85"/>`; }
  for (const a of m.areas) {
    const isN = near.includes(a.id), isS = SEL === a.id, isX = a.id === m.exit;
    const txt = a.res ? { L: L('軽', 'L'), M: L('中', 'M'), H: L('重', 'H') }[a.res] : '';
    // 偵察した区域は、抵抗の色の太い枠と真ん中の大きな文字で示す（ユーザーの指示 2026-11-06）
    const rc = a.res ? { L: '#fff4a8', M: '#ffb25a', H: '#ff6a4a' }[a.res] : null, scout = rc && !a.us;
    h += `<g ${isN ? `style="cursor:pointer" onclick="SEL=${a.id};render()"` : ''}>
      ${scout ? `<circle cx="${a.x}" cy="${a.y}" r="${(isN ? 44 : 34) + 9}" fill="none" stroke="${rc}" stroke-width="10" stroke-opacity=".95"/>` : ''}
      ${isX ? `<circle cx="${a.x}" cy="${a.y}" r="${(isN ? 44 : 34) + (scout ? 22 : 10)}" fill="none" stroke="#ff2a1a" stroke-width="12"/>` : ''}<!-- 目標の区域は太い赤の縁（ユーザーの指示 2026-11-10） -->
      <circle cx="${a.x}" cy="${a.y}" r="${isN ? 44 : 34}" fill="${a.us ? 'rgba(40,90,200,.55)' : isN ? 'rgba(255,226,122,.28)' : scout ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.01)'}" stroke="${isS ? '#fff' : isX ? '#ff4a3a' : isN ? '#ffe27a' : 'none'}" stroke-width="${isS ? 8 : 5}" ${isX ? 'stroke-dasharray="14 8"' : ''}/>
      ${scout ? `<text x="${a.x}" y="${a.y + 17}" text-anchor="middle" fill="${rc}" stroke="#000" stroke-width="1.5" font-size="50" font-weight="bold">${txt}</text>` : txt ? `<text x="${a.x + 26}" y="${a.y - 18}" fill="${rc}" stroke="#000" stroke-width="1" font-size="34" font-weight="bold">${txt}</text>` : ''}
      ${a.us ? `<text x="${a.x}" y="${a.y + 44}" text-anchor="middle" fill="#fff" stroke="#000" stroke-width=".8" font-size="26" font-weight="bold">US</text>` : ''}
      ${a.art ? `<text x="${a.x - 44}" y="${a.y + 40}" font-size="30">💥</text>` : ''}${a.air ? `<text x="${a.x + 16}" y="${a.y + 40}" font-size="30">✈️</text>` : ''}
      ${a.left && a.left.length ? `<text x="${a.x - 12}" y="${a.y - 24}" font-size="30" fill="#ff5a4a" font-weight="bold">!</text>` : ''}</g>`;
  }
  h += `<g transform="translate(${cur.x},${cur.y})"><circle r="28" fill="#1d3a6b" stroke="#fff" stroke-width="4"/><text y="11" text-anchor="middle" fill="#fff" font-size="30">★</text></g>`;
  $('board').innerHTML = `<svg viewBox="0 0 1296 1400" preserveAspectRatio="xMidYMid meet">${h}</svg>`;
}
// ===== 戦場（battle.jpg の上に置く）=====
const BCX = 694, BCY = 787, BW = 1400, BH = Math.round(1400 * 1744 / 1945);
const SEC_ANG = i => -90 + 60 * i;
const SEC_R = [[230, 400, 570], [230, 410, 575], [205, 370, 520], [140, 272, 390], [205, 370, 520], [230, 410, 575]]; // セクターごとの 近/中/遠 の半径（盤の形に合わせる）
function bbPos(i, r, off) { const a = (SEC_ANG(i) + off) * Math.PI / 180, k = SEC_R[i][r]; return [BCX + k * Math.cos(a), BCY + k * Math.sin(a)]; }
const UNIT_IMG = new Set(['PzIV', 'PzV', 'PzVIe', 'PzVIb', 'StuG', 'MarderII', 'MarderIII', 'JgdIV', 'Jgd38', 'SPW', 'PSW', 'TRUCK', 'LW', 'MG', '50L', '75L', '88LL', 'TANK_B', 'SPG_B', 'AT_B', 'hidden']);
function renderBattle() {
  const g = E.G, b = g.bb;
  let h = `<image href="img/battle.jpg" width="${BW}" height="${BH}"/>`;
  if (!b) { $('board').innerHTML = `<svg viewBox="0 0 ${BW} ${BH}">${h}</svg>`; return; }
  PB.SECTORS.forEach((s, i) => {
    if (b.us[s]) { const [x, y] = bbPos(i, 0, 0); h += `<image href="img/us_control.png" x="${x - 34}" y="${y - 130}" width="68" height="68" data-uimg="img/us_control.png" data-uname="${esc(L('味方が押さえているセクター', 'Sector held by friendly forces'))}"><title>${L('味方が押さえているセクター', 'Sector held by friendly forces')}</title></image>`; } // ゲームの US Control のマーカー（ユーザーの指示 2026-11-08）
    // 煙はゲームの煙のマーカーの絵で大きく出す（数が多いほど x2・x3。消えかけは薄い面。ユーザーの指示 2026-11-08）
    for (let r = 0; r < 3; r++) { const v = b.smoke[`${s}:${r}`] || 0, n = Math.min(3, Math.ceil(v / 2)); if (n) { const [x, y] = bbPos(i, r, 0); h += `<image href="img/s/${n}${v % 2 ? 'f' : ''}.png" x="${x - 75}" y="${y - 75}" width="150" height="150" opacity=".92" data-uimg="img/s/${n}${v % 2 ? 'f' : ''}.png" data-uname="${esc(L('煙', 'Smoke'))} ${n}"><title>${L('煙', 'Smoke')} ${n}</title></image>`; } }
  });
  if (b.smokeOnTank) { const v = b.smokeOnTank, n = Math.min(3, Math.ceil(v / 2)); h += `<image href="img/s/${n}${v % 2 ? 'f' : ''}.png" x="${BCX + 40}" y="${BCY - 150}" width="110" height="110" opacity=".92"><title>${L('自車に煙', 'Smoke on tank')}</title></image>`; }
  // 自分の戦車は前の絵のまま（駒の絵だと砲身が見づらい。ユーザーの指示 2026-11-08）
  h += `<g transform="translate(${BCX},${BCY}) rotate(${60 * b.facing})"><rect x="-26" y="-40" width="52" height="76" rx="6" fill="${b.hull ? '#3f6e32' : '#5c6b35'}" stroke="#111" stroke-width="3"/><polygon points="0,-58 -13,-40 13,-40" fill="#111"/></g>`;
  h += `<g transform="translate(${BCX},${BCY}) rotate(${60 * b.turret})"><circle r="19" fill="#39431f" stroke="#111" stroke-width="3"/><rect x="-4" y="-64" width="8" height="52" fill="#111"/></g>`;
  // 敵の動き（ユーザーの指示 2026-11-08）: 元の場所に薄い駒を残し、今の場所へ白い矢印。
  //   地図の外へ出た敵は、外へ向かう矢印と「地図の外へ」。撃破された敵は、薄い駒に×。今のラウンドは濃く、1つ前は薄く
  h += `<defs><marker id="arw" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#fff" stroke="#000" stroke-width="1.2"/></marker></defs>`;
  const P = (s0, r0) => bbPos(PB.SECTORS.indexOf(s0), r0, 0);
  // 矢印の先が行き先の駒に隠れないように、駒の手前（80）で止める。矢じりは大きめ
  const line = (x1, y1, x2, y2, op, short) => { const dx = x2 - x1, dy = y2 - y1, k = Math.hypot(dx, dy) || 1, cut = short === false ? 0 : Math.min(80, k * .45); x2 -= dx / k * cut; y2 -= dy / k * cut;
    return `<g opacity="${op}" style="pointer-events:none"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="16" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="9" stroke-linecap="round" marker-end="url(#arw)"/></g>`; };
  const ghost = (g0, x, y, op) => {
    const key = g0.identified === false ? g0.cls + '_B' : (g0.type || g0.shown);
    if (key && UNIT_IMG.has(key)) return `<g opacity="${op}" style="pointer-events:none"><rect x="${x - 44}" y="${y - 44}" width="88" height="88" rx="6" fill="#000"/><image href="img/u/${key}.png" x="${x - 40}" y="${y - 40}" width="80" height="80"/></g>`;
    return `<g opacity="${op}" style="pointer-events:none"><rect x="${x - 60}" y="${y - 32}" width="120" height="64" rx="8" fill="#3d3d33" stroke="#111" stroke-width="3"/><text x="${x}" y="${y + 11}" text-anchor="middle" fill="#fff" font-size="32" font-weight="bold">?${g0.id}</text></g>`;
  };
  const goneMark = (gg, op) => {
    const [x, y] = P(gg.s, gg.r); let t = ghost(gg, x, y, op * .55);
    if (gg.how === 'out') { const dx = x - BCX, dy = y - BCY, k = Math.hypot(dx, dy) || 1; const x2 = x + dx / k * 230, y2 = y + dy / k * 230;
      t += line(x, y, x2, y2, op, false) + `<text x="${x2}" y="${y2 + 50}" text-anchor="middle" font-size="30" font-weight="bold" fill="#fff" stroke="#000" stroke-width="2" opacity="${op}" style="pointer-events:none">${L('地図の外へ', 'off the map')}</text>`; }
    else t += `<text x="${x}" y="${y + 34}" text-anchor="middle" font-size="110" font-weight="bold" fill="#fff" stroke="#000" stroke-width="4" opacity="${op}" style="pointer-events:none">×</text>`;
    return t;
  };
  (b.prevTrails || []).forEach(t => { const [x1, y1] = P(t.s1, t.r1), [x2, y2] = P(t.s2, t.r2); h += ghost(t.u || {}, x1, y1, .18) + line(x1, y1, x2, y2, .35); });
  (b.prevGone || []).forEach(gg => { h += goneMark(gg, .4); });
  b.units.forEach(u => { const f = u._from; if (!f || (f.s === u.sector && f.r === u.range)) return; const [x1, y1] = P(f.s, f.r), [x2, y2] = P(u.sector, u.range); h += ghost(u, x1, y1, .4) + line(x1, y1, x2, y2, .95); });
  (b.gone || []).forEach(gg => { h += goneMark(gg, .95); });
  const groups = {};
  b.units.forEach(u => { (groups[`${u.sector}:${u.range}`] = groups[`${u.sector}:${u.range}`] || []).push(u); });
  const sel = ORD && ORD.G && ORD.G.target;
  for (const k of Object.keys(groups)) {
    const [s, r] = k.split(':'), i = PB.SECTORS.indexOf(s), rr = +r;
    groups[k].forEach((u, j) => {
      const n = groups[k].length, off = (j - (n - 1) / 2) * (rr === 0 ? 38 : rr === 1 ? 25 : 18);
      const [x, y] = bbPos(i, rr, off);
      const seen = u.spot === 'spotted', hid = u.spot === 'hidden';
      const col = hid ? '#555' : seen ? (u.identified === false ? '#b25a2e' : '#962c20') : '#3d3d33';
      const name = u.identified === false ? { TANK: L('戦車?', 'Tank?'), SPG: L('自走砲?', 'SPG?'), AT: L('対戦車砲?', 'AT gun?') }[u.cls] : { PzIV: L('IV号', 'Pz IV'), PzV: L('パンター', 'Panther'), PzVIe: L('ティーガー', 'Tiger'), PzVIb: L('王虎', 'K.Tiger'), StuG: 'StuG', MarderII: 'Marder II', MarderIII: 'Marder III', JgdIV: 'JgdPz IV', Jgd38: 'Hetzer', SPW: 'SPW', PSW: 'PSW', TRUCK: L('トラック', 'Truck'), LW: L('歩兵', 'Inf'), MG: 'MG', '50L': '5cm AT', '75L': '7.5cm AT', '88LL': '8.8cm AT' }[u.type || u.shown];
      const face = ['LW', 'MG', 'AT'].includes(u.cls) ? '' : [L('正面', 'front'), L('側面', 'side'), L('背面', 'rear')][u.facing];
      const ter = { hull: L('隠', 'HD'), woods: L('森', 'wds'), building: L('建', 'bld'), fort: L('陣', 'fort'), open: '' }[u.terr] || '';
      // 敵はすべてゲームの駒の絵で出す（ボードゲームと同じ。種類が分からない間は仮の駒）。見つけた敵には「Spotted」、隠れた敵には「Hidden」のマーカー（ユーザーの指示 2026-11-08）
      // 駒はいつも出す（ルール 17.15: 未発見でも駒は盤にある。種類が分からない間は仮の駒）。見え方は枠の色で分ける（ユーザーの指示 2026-11-08）
      //   黒=未発見、灰の点線=隠れ（動くまで探せない）、緑=発見。選んだ目標は黄色、照準を合わせた敵は赤
      const img = u.identified === false ? (u.cls + '_B') : (u.type || u.shown);
      const bd = sel === u.id ? '#ffd84a' : (b.acq && b.acq.id === u.id ? '#e8312a' : seen ? '#2ecc40' : hid ? '#9a9a9a' : '#000'), sub = `${face} ${ter}${u.moving ? L(' 動', ' mv') : ''}`.trim();
      // 敵の向き: 絵の上が車両の前。正面=こちらの戦車へ、側面=90度、背面=反対へ（歩兵・機関銃班・対戦車砲は回さない）
      const rot = ['LW', 'MG', 'AT'].includes(u.cls) ? 0 : Math.atan2(BCX - x, -(BCY - (y - 12))) * 180 / Math.PI + [0, 90, 180][u.facing || 0];
      const terr = ['woods', 'building', 'fort', 'hull'].includes(u.terr) ? u.terr : null;
      if (terr) h += `<image href="img/u/t_${terr}.png" x="${x - 74}" y="${y - 44}" width="104" height="104" style="pointer-events:none"/>`;
      h += `<g style="cursor:pointer" onclick="pickTarget(${u.id})" ${terr ? `data-uimg2="img/u/t_${terr}.png" data-uname2="${esc(ter)}"` : ''} data-uimg="img/u/${UNIT_IMG.has(img) ? img : 'hidden'}.png" data-uname="${esc(name || '')} — ${seen ? L('発見', 'spotted') : hid ? L('隠れている（動くまで探せない）', 'hidden (cannot be spotted until it moves)') : L('未発見', 'not spotted')}"><g transform="rotate(${rot.toFixed(1)} ${x} ${y - 12})"><rect x="${x - 56}" y="${y - 68}" width="112" height="112" rx="6" fill="#000" stroke="${bd}" stroke-width="${sel === u.id ? 12 : 9}" ${hid && sel !== u.id ? 'stroke-dasharray="16 10"' : ''}/><image href="img/u/${UNIT_IMG.has(img) ? img : 'hidden'}.png" x="${x - 50}" y="${y - 62}" width="100" height="100" opacity="${hid ? .6 : 1}"><title>${esc(name || '')}</title></image></g>`
        // 地形のマーカーは、駒の下に重ねて置く（駒の左下から少しはみ出す）。マウスを乗せると、駒と地形の両方を大きく出す（ユーザーの指示 2026-11-08）
        + `${b.enemyAcq && b.enemyAcq[u.id] ? `<rect x="${x - 98}" y="${y - 90}" width="70" height="36" rx="4" fill="#d80000"/><text x="${x - 63}" y="${y - 63}" text-anchor="middle" fill="#fff" font-size="28" font-weight="bold">${L('照準', 'AIM')}</text>` : ''}</g>`;
    });
  }
  $('board').innerHTML = `<svg viewBox="0 0 ${BW} ${BH}" preserveAspectRatio="xMidYMid meet">${h}</svg>`;
}
function pickTarget(id) {
  const g = E.G, b = g.bb; if (PLAY || !b || g.phase !== 'battle') return;
  const u = b.units.find(x => x.id === id); if (!u) return;
  if (u.spot !== 'spotted') return;
  ensureOrders();
  const inTurret = PB.SECTORS[b.turret] === u.sector;
  ORD.G = { act: inTurret ? 'fire' : 'rotfire', target: id, mode: 'direct' }; POP = 'G';
  const vehicle = !['LW', 'MG', 'AT', 'TRUCK'].includes(u.cls);
  const want = vehicle ? (g.day.ammo.AP > 0 ? 'AP' : 'HE') : (g.day.ammo.HE > 0 ? 'HE' : 'AP');
  if (b.load !== want && g.day.ammo[want] > 0) { ORD.L = { act: 'change', ammo: want }; ORD.reload = want; } else { ORD.reload = want; }
  render();
}
function ensureOrders() {
  const b = E.G.bb;
  if (!ORD || ORD.round !== b.round) ORD = { round: b.round, C: { act: b.hatch.C ? 'dirfire' : 'none' }, G: { act: 'none' }, L: { act: 'load' }, D: { act: 'stop' }, A: { act: 'none' }, hatch: Object.assign({}, b.hatch), reload: b.reload, useRack: false };
  return ORD;
}
// ===== 地図の下: 戦車 =====
// カードの情報をボタンで組み直したもの（ユーザーの指示 2026-11-04）
const POSN = () => ({ C: L('車長', 'Commander'), G: L('砲手', 'Gunner'), L: L('装填手', 'Loader'), D: L('操縦手', 'Driver'), A: L('副操縦手', 'Asst. driver') });
function crewOptions(p, t) {
  const m = E.G.crew[p], g = E.G, O = {
    C: [['none', L('索敵', 'Spot')], ['dirmove', L('操縦を指示', 'Direct driver')], ['dirfire', L('射撃を指揮', 'Direct fire')], ['aa', L('.50機銃', '.50 cal')], ['sub', L('短機関銃', 'Sub MG')], ['grenade', L('発煙手榴弾', 'Smoke grenade')], ['repairaa', L('.50機銃の修理', 'Repair .50')]],
    G: [['none', L('待機・索敵', 'Spot')], ['fire', L('主砲を撃つ', 'Fire main gun')], ['rotfire', L('砲塔を回して撃つ', 'Rotate & fire')], ['rotate', L('砲塔を回す', 'Rotate turret')], ['coax', L('同軸機銃', 'Coax MG')], ['repair', L('主砲の修理を手伝う', 'Assist repair')], ['grenade', L('発煙手榴弾', 'Smoke grenade')]],
    L: [['load', L('装填', 'Load')], ['change', L('弾を替える', 'Change load')], ['restock', L('弾架に補充', 'Restock rack')], ['repairmain', L('主砲の修理', 'Repair main')], ['repaircoax', L('同軸機銃の修理', 'Repair coax')]],
    D: [['stop', L('停止', 'Stop')], ['fwd', L('前進', 'Forward')], ['fwdHD', L('前進して車体隠蔽', 'Forward to hull down')], ['rev', L('後退', 'Reverse')], ['revHD', L('後退して車体隠蔽', 'Reverse to hull down')], ['pivot', L('車体の向きを変える', 'Pivot')]],
    A: [['none', L('索敵', 'Spot')], ['bow', L('車体機銃', 'Bow MG')], ['pass', L('弾を手渡す', 'Pass ammo')], ['repairbow', L('車体機銃の修理', 'Repair bow')]],
  }[p].slice();
  if (p === 'L') { if (t.mortar) O.push(['mortar', L('発煙弾を撃つ', 'Smoke mortar')]); if (t.turret !== 'A') O.push(['sub', L('短機関銃', 'Sub MG')]); if (t.loaderAA) O.push(['aa', L('.50機銃', '.50 cal')], ['repairaa', L('.50機銃の修理', 'Repair .50')]); }
  if (p === 'A' && ['C', 'G', 'L', 'D'].some(q => g.crew[q].status !== 'ok')) O.push(['swap', L('負傷者の席へ移る', 'Move to an empty post')]);
  if (m.periscope === false && g.day && g.day.periscopes > 0) O.push(['periscope', L('ペリスコープ交換', 'Replace periscope')]);
  return O;
}
// 故障・破損で使えない命令は押せなくする（ユーザーの指示 2026-11-06）
function ordBlocked(k) {
  const d = E.G.day; if (!d) return '';
  const j = d.jam, br = d.broken;
  if (k === 'fire' || k === 'rotfire') return br.main ? L('主砲破損', 'gun broken') : j.main ? L('主砲故障', 'gun jammed') : br.sight ? L('照準器破損', 'sight broken') : '';
  if (['coax', 'bow', 'aa', 'sub'].includes(k)) return br[k] ? L('破損', 'broken') : j[k] ? L('故障中', 'jammed') : '';
  return '';
}
// 故障を直す命令は、故障している間だけ目立たせて先頭に出す
const FIX_OF = { repairaa: 'aa', repairmain: 'main', repair: 'main', repaircoax: 'coax', repairbow: 'bow' };
const needFix = k => { const d = E.G.day; return !!(d && FIX_OF[k] && d.jam[FIX_OF[k]]); };
// 命令の説明（数字はエンジンの計算から。命中などは 2D をこの数字以下で出す確率なので、−10 は 10% 下がる）
function cmdTip(p, k) {
  const g = E.G, t = E.tank(), R = q => g.crew[q].rating, d = g.day;
  const up = (s, n) => `<span class="g">${s} +${n}%</span>`, dn = (s, n) => `<span class="r">${s} −${n}%</span>`;
  const mgMods = () => [L('射手の腕前', 'shooter rating') + ` +${R(p)}%`, L('撃てるのは歩兵・機関銃・トラック・対戦車砲だけ', 'only infantry, MGs, trucks and AT guns'), dn(L('自車が走行中', 'you are moving'), 10), dn(L('目標が森', 'target in woods'), 10), dn(L('対戦車砲・建物', 'AT gun or building'), 15), dn(L('陣地', 'fortification'), 20), L('煙1つごとに命中が半分', 'each smoke halves the chance'), L('2D 98以上で故障', 'jams on 98+')];
  const fix = w => { const r = w === 'main' ? R('L') + (p === 'G' ? 0 : 0) : R(p); return [L(`修理できる: ${20 + r}%(2D − 腕前 ≤ 20)`, `Repair: ${20 + r}%`), L(`直らず破損: 約${Math.max(3, 10 - r)}%。破損すると今日はもう使えない`, `Breaks for good: about ${Math.max(3, 10 - r)}%`), d && d.jam[w] ? '<span class="r">' + L('今、故障している', 'Jammed now') + '</span>' : L('今は故障していない(押しても何も起きない)', 'Not jammed now (nothing happens)')]; };
  const smoke = [L('自分の戦車に煙を出す(手榴弾の残り', 'Puts smoke on your tank (grenades left ') + (d ? d.grenades : 0) + ')', L('煙1つごとに、敵の射撃も自分の射撃も命中が半分', 'Each smoke halves enemy and your own fire')];
  const move = [L('敵との距離や位置が変わる(白ダイス)', 'Range and position to the enemy change (white die)'), up(L('走行中: 敵の自車への命中', 'Moving: enemy fire at you'), 20).replace('+', '−').replace('class="g"', 'class="g"'), dn(L('走行中: 自分の主砲', 'Moving: your main gun'), 25) + (g.gyro ? '' : L('(ジャイロ訓練なしでは撃てない)', ' (cannot fire without gyro)')), dn(L('走行中: 機銃', 'Moving: MGs'), 10), L('パンツァーファウストに狙われやすいが、当たりにくい', 'Panzerfausts attack more often but hit less'), L(`事故: 修正後98-99で履帯切断、100でスタック(操縦手の腕前${R('D')}で有利、ハッチ閉 +5、地面がぬかるむと +3〜+9)`, `Mishap: 98-99 thrown track, 100 bogged (driver rating ${R('D')} helps, hatch shut +5, bad ground +3 to +9)`)];
  const T = {
    C: {
      none: [L('敵を探す。ハッチ開なら全方向。閉なら、展望塔があれば全方向、なければ「見る方向」のセクターだけ', 'Spot. Hatch open: all around. Shut: all around with a cupola, else only the sector you look at')],
      dirmove: [L(`操縦手の移動の事故の判定を、車長の腕前${R('C')}だけ有利にする`, `Driver mishap roll improved by your rating ${R('C')}`), L('ハッチ閉: 展望塔があれば半分、なければ効果なし', 'Hatch shut: half with a cupola, none without'), L('スタックからの脱出も、ハッチ開なら有利になる', 'Also helps to unbog with the hatch open')],
      dirfire: [up(L('主砲の命中', 'Main gun to-hit'), R('C')), L('ハッチ開なら、新しい目標への最初の一発の −10% がなくなる', 'Hatch open: removes the −10% for the first shot at a new target'), up(L('同軸・車体機銃で目標を直接撃つとき', 'Coax/bow MG at a target'), R('C'))],
      aa: [L('ハッチ開が必要', 'Hatch must be open'), L('全セクターへ撃てる', 'Can fire into any sector'), dn(L('前進射撃(区画へ撃つ)', 'Advancing fire (zone)'), 10), up(L('動いている歩兵', 'Moving infantry'), 15)].concat(mgMods()),
      sub: [L('ハッチ開が必要。近距離だけ', 'Hatch must be open. Close range only'), up(L('前進射撃(区画へ撃つ)', 'Advancing fire (zone)'), 10), up(L('動いている歩兵', 'Moving infantry'), 5)].concat(mgMods()),
      grenade: smoke,
      repairaa: fix('aa'),
    },
    G: {
      none: [L('撃たずに、砲塔が向いているセクターを見る', 'Do not fire; watch the sector the turret faces')],
      fire: [L('砲塔が向いているセクターの目標だけ', 'Only targets in the turret sector'), up(L('砲手の腕前', 'Gunner rating'), R('G')), dn(L('新しい目標への最初の一発', 'First shot at a new target'), 10) + L('(車長がハッチ開で射撃指揮なら無し)', ' (not with commander directing, hatch open)'), up(L('同じ目標の2発目', 'Same target, 2nd shot'), '5/10/15') + L('(近/中/遠)', ' (C/M/L)'), up(L('3発目から', '3rd shot on'), '10/20/30'), dn(L('動いている車両', 'Moving vehicle'), '20/25/25'), dn(L('自車が走行中・旋回した', 'You moved or pivoted'), 25), dn(L('目標が森', 'Target in woods'), '5/10/15'), L('大きい戦車は当たりやすく、小さい車両は当たりにくい', 'Large tanks are easier, small vehicles harder'), L('煙1つごとに命中が半分', 'Each smoke halves the chance'), L('撃つ間は索敵しない。2D 98以上で主砲故障', 'No spotting while firing. Jams on 98+')],
      rotfire: [L('砲塔を目標へ回してから撃つ', 'Traverse to the target, then fire'), dn(L('回すセクター1つごとに', 'Per sector turned'), 10), L('照準が外れる(同じ目標を続けて撃つ有利がなくなる)', 'Loses the aim on the previous target'), L('ほかの修正は「主砲を撃つ」と同じ', 'Other modifiers as Fire main gun')],
      rotate: [L('砲塔を選んだセクターへ回す。撃たない', 'Turn the turret; no firing'), L('照準が外れる', 'Loses the aim on the previous target')],
      coax: [L('砲塔が向いているセクターだけ', 'Turret sector only'), dn(L('前進射撃(区画へ撃つ)', 'Advancing fire (zone)'), 10), up(L('動いている歩兵', 'Moving infantry'), 15)].concat(mgMods()),
      repair: [L(`装填手の「主砲の修理」に、砲手の腕前${R('G')}を足す`, `Adds gunner rating ${R('G')} to the loader's repair`), L('手伝う間は索敵しない', 'No spotting while helping'), d && d.jam.main ? '<span class="r">' + L('今、主砲が故障している', 'Main gun jammed now') + '</span>' : L('今は故障していない', 'Not jammed now')],
      grenade: smoke,
    },
    L: {
      load: [L('装填に専念する。この命令の時だけ索敵もできる(主砲を撃ったラウンドは除く)', 'Concentrate on loading; can also spot (not in a round the main gun fired)')],
      change: [L('込めてある弾を、選んだ弾に替える', 'Swap the loaded round for the one you choose')],
      restock: [L('即応弾架を残っている弾で埋める', 'Refill the ready rack'), L('即応弾架から取ると、続けて撃てる確率 +10%', 'Firing from the ready rack: +10% rate of fire')],
      repairmain: (() => { const r = R('L') + (ORD && ORD.G && ORD.G.act === 'repair' && g.crew.G.status === 'ok' ? R('G') : 0); return [L(`修理できる: ${20 + r}%(装填手の腕前${R('L')}${r > R('L') ? ` + 砲手${R('G')}` : ''})`, `Repair: ${20 + r}%`), L('砲手が「主砲の修理を手伝う」と腕前が足される', 'Gunner can assist and add his rating'), L(`直らず破損: 約${Math.max(3, 10 - r)}%`, `Breaks for good: about ${Math.max(3, 10 - r)}%`), d && d.jam.main ? '<span class="r">' + L('今、主砲が故障している', 'Main gun jammed now') + '</span>' : L('今は故障していない', 'Not jammed now')]; })(),
      repaircoax: fix('coax'),
      repairaa: fix('aa'),
      mortar: [L('砲塔が向いているセクターの近距離に煙を出す', 'Smoke at close range in the turret sector'), L('煙1つごとに、敵の射撃も自分の射撃も命中が半分', 'Each smoke halves enemy and your own fire')],
      sub: [L('ハッチ開が必要。近距離だけ', 'Hatch must be open. Close range only'), up(L('前進射撃(区画へ撃つ)', 'Advancing fire (zone)'), 10)].concat(mgMods()),
      aa: [L('ハッチ開が必要', 'Hatch must be open'), dn(L('前進射撃(区画へ撃つ)', 'Advancing fire (zone)'), 10)].concat(mgMods()),
    },
    D: {
      stop: [L('動かない。走行中の修正がつかない', 'Stay put; no moving modifiers')],
      fwd: move,
      fwdHD: [L(`前進と同じ。さらに事故の判定が修正後20以下なら車体隠蔽(約${Math.max(0, 20 + R('D'))}%)`, `As Forward; hull down on 20 or less (about ${Math.max(0, 20 + R('D'))}%)`), L('車体隠蔽: 敵弾の命中箇所が6-10なら外れ(半分を防ぐ)。パンツァーファウストも同じ。車体機銃は撃てない', 'Hull down: hits on location 6-10 miss (half). Same for Panzerfausts. Bow MG cannot fire')].concat(move),
      rev: move,
      revHD: [L(`後退と同じ。さらに事故の判定が修正後10以下なら車体隠蔽(約${Math.max(0, 10 + R('D'))}%)`, `As Reverse; hull down on 10 or less (about ${Math.max(0, 10 + R('D'))}%)`), L('車体隠蔽: 敵弾の命中箇所が6-10なら外れ(半分を防ぐ)。パンツァーファウストも同じ。車体機銃は撃てない', 'Hull down: hits on location 6-10 miss (half). Same for Panzerfausts. Bow MG cannot fire')].concat(move),
      pivot: [L('車体を選んだセクターへ向ける', 'Turn the hull to the chosen sector'), L('車体隠蔽が外れる', 'Lose hull down'), dn(L('このラウンドの主砲の命中', 'Main gun this round'), 25), g.gyro ? '' : L('照準が外れる(ジャイロ訓練なし)', 'Loses the aim (no gyro)')].filter(Boolean),
    },
    A: {
      none: [L('敵を探す。ハッチ閉なら車体の正面だけ、開なら真後ろ以外', 'Spot. Hatch shut: hull front only; open: all but the rear')],
      bow: [L('車体が向いているセクターだけ。車体隠蔽中は撃てない', 'Hull front sector only. Not while hull down'), dn(L('前進射撃(区画へ撃つ)', 'Advancing fire (zone)'), 10), up(L('動いている歩兵', 'Moving infantry'), 10)].concat(mgMods()),
      pass: [up(L('続けて撃てる確率(即応弾架を使わない時)', 'Rate of fire (not using the ready rack)'), R('A'))],
      repairbow: fix('bow'),
      swap: [L('負傷者の席へ移る。丸1ラウンドかかる', 'Move to a wounded man\'s post; takes a full round'), L('操縦手以外の席では腕前が半分', 'Half rating except at the driver\'s post')],
    },
  };
  let lines = (T[p] && T[p][k]) || null;
  if (k === 'periscope') lines = [L(`予備のペリスコープと交換する(残り${d ? d.periscopes : 0})`, `Replace with a spare (left ${d ? d.periscopes : 0})`), L('壊れたままだと、ハッチ閉では索敵できない', 'Without one you cannot spot with the hatch shut')];
  if (!lines) return '';
  const name = (crewOptions(p, t).find(o => o[0] === k) || [])[1] || '';
  const blk = ordBlocked(k);
  return `<b>${name}</b>${blk ? ` <span class="r">(${blk}: ${L('使えない', 'unavailable')})</span>` : ''}<br>` + lines.map(s => '・' + s).join('<br>');
}
function placeCtip(ev) {
  const tp = $('ctip'), r = tp.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
  tp.style.left = Math.max(8, x) + 'px'; tp.style.top = Math.max(8, y) + 'px';
}
document.addEventListener('mouseover', ev => {
  const tp = $('ctip'); if (!tp) return;
  const el = ev.target.closest && ev.target.closest('[data-tip]');
  const s = el ? cmdTip(...el.dataset.tip.split(':')) : '';
  if (!s) { tp.style.display = 'none'; return; }
  tp.innerHTML = s; tp.style.display = 'block'; placeCtip(ev);
});
document.addEventListener('mousemove', ev => { const tp = $('ctip'); if (tp && tp.style.display === 'block') placeCtip(ev); });
document.addEventListener('click', () => { const tp = $('ctip'); if (tp) tp.style.display = 'none'; });
// 戦闘地図の駒や印にマウスを乗せると、絵を大きく出す（ユーザーの指示 2026-11-08）
document.addEventListener('mouseover', ev => { const tp = $('utip'); if (!tp) return; const el = ev.target.closest && ev.target.closest('[data-uimg]'); if (!el) { tp.style.display = 'none'; return; }
  tp.innerHTML = `<img src="${el.dataset.uimg}" alt="">${el.dataset.uname || ''}` + (el.dataset.uimg2 ? `<img src="${el.dataset.uimg2}" alt="" style="width:110px;height:110px;margin-top:6px">${el.dataset.uname2 || ''}` : ''); tp.style.display = 'block'; placeUtip(ev); });
document.addEventListener('mousemove', ev => { const tp = $('utip'); if (tp && tp.style.display === 'block') placeUtip(ev); });
function placeUtip(ev) { const tp = $('utip'), w = tp.offsetWidth, hh = tp.offsetHeight; let x = ev.clientX + 18, y = ev.clientY + 18; if (x + w > innerWidth - 8) x = ev.clientX - w - 18; if (y + hh > innerHeight - 8) y = innerHeight - hh - 8; tp.style.left = Math.max(8, x) + 'px'; tp.style.top = Math.max(8, y) + 'px'; }
// 戦闘地図の縮小版（ユーザーの指示 2026-11-06）: 区画かセクターを押して選ぶ
function miniMap(title, mode, isOn, onClick, canUse) {
  const b = E.G.bb;
  let h = `<image href="img/battle.jpg" width="${BW}" height="${BH}"/>`;
  { const cnt = {}; b.units.forEach(u => { const k = u.sector + ':' + u.range, j = cnt[k] = (cnt[k] || 0) + 1; const [x, y] = bbPos(sectorIdx(u.sector), u.range, (j - 1) * 14 - 7);
    h += `<circle cx="${x}" cy="${y}" r="26" fill="#e8705a" stroke="#000" stroke-width="3"/><text x="${x}" y="${y + 11}" text-anchor="middle" font-size="30" font-weight="bold" fill="#000" style="pointer-events:none">${u.spot === 'spotted' ? '!' : u.id}</text>`; }); }
  if (mode === 'zone') PB.SECTORS.forEach((s, i) => [0, 1, 2].forEach(r => {
    const [x, y] = bbPos(i, r, 0), on = isOn(s, r), ok = canUse(s, r);
    h += `<circle cx="${x}" cy="${y}" r="44" fill="${on ? 'rgba(255,255,255,.4)' : ok ? 'rgba(255,226,122,.22)' : 'rgba(0,0,0,.55)'}" stroke="${on ? '#fff' : ok ? '#ffe27a' : '#555'}" stroke-width="${on ? 12 : 5}" ${ok ? `style="cursor:pointer" onclick="${onClick(s, r)}"` : ''}/>`;
  }));
  // 前進射撃の地図にもセクター名を出す（「中」の丸の上。押すのは丸のまま。ユーザーの指示 2026-11-07）
  if (mode === 'zone') PB.SECTORS.forEach((s, i) => {
    const [x, y] = bbPos(i, 1, 0);
    h += `<text x="${x}" y="${y + 16}" text-anchor="middle" font-size="46" font-weight="bold" fill="#fff" stroke="#000" stroke-width="2" style="pointer-events:none">${PB.SECTOR_NAME[s]}</text>`;
  });
  else PB.SECTORS.forEach((s, i) => {
    const [x, y] = bbPos(i, 1, 0), on = isOn(i);
    h += `<g style="cursor:pointer" onclick="${onClick(i)}"><circle cx="${x}" cy="${y}" r="78" fill="${on ? 'rgba(255,255,255,.4)' : 'rgba(255,226,122,.22)'}" stroke="${on ? '#fff' : '#ffe27a'}" stroke-width="${on ? 12 : 5}"/><text x="${x}" y="${y + 18}" text-anchor="middle" font-size="54" font-weight="bold" fill="#fff" stroke="#000" stroke-width="2">${PB.SECTOR_NAME[s]}</text></g>`;
  });
  h += `<g transform="translate(${BCX},${BCY}) rotate(${60 * b.facing})"><rect x="-26" y="-40" width="52" height="76" rx="6" fill="#5c6b35" stroke="#111" stroke-width="3"/></g><g transform="translate(${BCX},${BCY}) rotate(${60 * b.turret})"><circle r="19" fill="#39431f" stroke="#111" stroke-width="3"/><rect x="-4" y="-64" width="8" height="52" fill="#111"/></g>`;
  return `<div class="mini">${title}<svg viewBox="0 0 ${BW} ${BH}">${h}</svg></div>`;
}
// 前進射撃で撃てる区画（エンジンと同じ判定）
function zoneOk(kind, s, r) {
  const b = E.G.bb, w = E.G.day.w;
  if ((w.fog || w.fall) && r > 0) return false;
  if (PB.MG[kind][r] < 0) return false;
  if (kind === 'coax') return s === PB.SECTORS[b.turret];
  if (kind === 'bow') return !b.hull && sectorIdx(s) === b.facing;
  return true;
}
// 見つけていない敵の呼び名（地図と目標の一覧で同じ番号。ユーザーの指示 2026-11-08）
const unTag = u => (u.spot === 'hidden' ? L('隠蔽', 'Hidden ') : L('未確認', 'Unknown ')) + u.id;
const zoneWho = (s, r) => E.G.bb.units.filter(u => u.sector === s && u.range === r).map(u => u.spot === 'spotted' ? uName(u) : unTag(u)).join('・');
const sectorOpts = cur => PB.SECTORS.map((s, i) => `<option value="${i}" ${cur === i ? 'selected' : ''}>${L('セクター', 'Sector ')}${PB.SECTOR_NAME[s]}</option>`).join('');
function targetSelect(p) {
  const b = E.G.bb, mgAct = ['coax', 'bow', 'aa', 'sub'].includes(ORD[p].act);
  // 機関銃は、撃てる向き・距離の敵だけを出す（同軸=砲塔の向き、車体=車体の向き。ユーザーの指示 2026-11-08）
  const tg = b.units.filter(u => u.spot === 'spotted' && (!mgAct || zoneOk(ORD[p].act, u.sector, u.range)));
  let o = `<option value="">${L('目標を選ぶ', 'choose target')}</option>` + tg.map(u => `<option value="${u.id}" ${ORD[p].target === u.id ? 'selected' : ''}>${esc(uName(u))} ${PB.SECTOR_NAME[u.sector]}/${[L('近', 'C'), L('中', 'M'), L('遠', 'L')][u.range]}</option>`).join('');
  if (['coax', 'bow', 'aa', 'sub'].includes(ORD[p].act)) {
    o += `<optgroup label="${L('前進射撃（ゾーンへ撃つ）', 'Advancing fire (zone)')}">`;
    PB.SECTORS.forEach(s => [0, 1, 2].forEach(r => { if (!zoneOk(ORD[p].act, s, r)) return; const v = `z:${s}:${r}`, who = zoneWho(s, r); o += `<option value="${v}" ${ORD[p].target === v ? 'selected' : ''}>${PB.SECTOR_NAME[s]}/${[L('近', 'C'), L('中', 'M'), L('遠', 'L')][r]}${who ? ' — ' + esc(who) : ''}</option>`; }));
    o += `</optgroup>`;
  }
  return `<select onchange="setTarget('${p}',this.value)">${o}</select>`;
}
// 普段は地図の下に高さを固定して置き、命令を選ぶ時だけ浮かせる（ユーザーの指示 2026-11-04）
var POP = null;
const ACT_NAME = (p, t) => { const o = crewOptions(p, t).find(x => x[0] === ORD[p].act); return o ? o[1] : ''; };
function renderTank() {
  const g = E.G, d = g.day, b = g.bb, t = E.tank();
  const ammo = d ? d.ammo : null;
  const battle = g.phase === 'battle' && b && !PLAY;
  const prep = (g.phase === 'move' || g.phase === 'ca') && b && !PLAY;
  if (battle) ensureOrders(); else POP = null;
  let h = `<div class="thead"><b>${esc(g.tankName)}</b> #${g.tankId} ${t.model} ${t.gun}mm ${L('装甲', 'armor')}${t.armor}${t.wet ? ' ' + L('湿式', 'wet') : ''}${g.hvss ? ' HVSS' : ''}${g.gyro ? ' ' + L('ジャイロ', 'gyro') : ''}${t.cupola ? ' ' + L('展望塔', 'cupola') : ''}</div>`;
  h += `<div class="crewgrid">`;
  for (const p of ['C', 'G', 'L', 'D', 'A']) {
    const m = g.crew[p];
    const st = { ok: '', uncon: L('気絶', 'unconscious'), kia: L('戦死', 'KIA'), out: L('負傷', 'wounded'), home: L('本国送還', 'sent home') }[m.status] || '';
    const hasHatch = p !== 'G' && (p !== 'L' || t.loaderHatch);
    const on = hasHatch && b ? (battle ? ORD.hatch[p] : b.hatch[p]) : false;
    const can = battle && !st;
    h += `<div class="cc ${st ? 'hurt' : ''} ${POP === p ? 'sel' : ''} ${can ? 'click' : ''}" ${can ? `onclick="POP=POP==='${p}'?null:'${p}';render()"` : ''}><div class="cct"><b>${POSN()[p]}</b> <span class="rt">${m.rating}</span> ${esc(m.name)}${can && crewOptions(p, t).some(o => needFix(o[0])) ? `<span class="fixb" title="${L('修理できる', 'Can repair')}">!</span>` : ''}</div>`;
    h += `<div class="ccact ${st ? 'bad' : ''}">${st || (battle ? esc(ACT_NAME(p, t)) : '')}${m.periscope === false ? ` <span class="bad">${L('鏡破損', 'no scope')}</span>` : ''}</div>`;
    if (hasHatch && b && (battle || prep)) h += `<button class="hbtn ${on ? 'open' : ''}" onclick="event.stopPropagation();toggleHatch('${p}')">${L('ハッチ', 'Hatch')} ${on ? L('開', 'open') : L('閉', 'shut')}</button>`;
    h += `</div>`;
  }
  h += `</div>`;
  if (d) {
    const rack = d.rack || {};
    const rackTxt = ['HE', 'AP', 'WP', 'HCBI', 'HVAP'].filter(a => rack[a] > 0).map(a => `${a}${rack[a]}`).join(' ') || L('空', 'empty');
    h += `<div class="chips tammo"><span class="chip ${b && b.load ? 'good' : 'bad'}">${L('装填', 'Loaded')}: ${(b && b.load) || L('なし', 'none')}</span>`;
    if (battle) h += `<button class="${POP === 'AM' ? 'on' : ''}" onclick="POP=POP==='AM'?null:'AM';render()">${L('次弾', 'Next')} ${ORD.reload || ''}${ORD.useRack ? ' ' + L('弾架', 'rack') : ''}</button>`;
    if (prep) h += `<button class="${POP === 'PR' ? 'on' : ''}" onclick="POP=POP==='PR'?null:'PR';render()">${L('戦闘前の準備', 'Prepare')}</button>`;
    h += `<span class="chip">${L('弾架', 'Rack')} ${rackTxt}</span>` + ['HE', 'AP', 'WP', 'HCBI', 'HVAP'].filter(a => ammo[a] > 0 || a === 'HE' || a === 'AP').map(a => `<span class="chip">${a} ${ammo[a]}</span>`).join('');
    h += `<span class="chip">${L('煙弾', 'Smk')} ${d.smokeBomb}</span><span class="chip">${L('手榴弾', 'Gren')} ${d.grenades}</span><span class="chip">${L('鏡', 'Scp')} ${d.periscopes}</span>`;
    const flags = [];
    if (b) { if (b.moving) flags.push([L('走行中', 'Moving')]); if (b.hull) flags.push([L('車体隠蔽', 'Hull down'), 'good']); if (b.thrown) flags.push([L('履帯切断', 'Thrown track'), 'bad']); if (b.bogged) flags.push([L('スタック', 'Bogged'), 'bad']); if (b.smokeOnTank) flags.push([L('自車に煙', 'Smoke on tank')]); }
    if (d.jam.main) flags.push([L('主砲故障', 'Main gun jam'), 'bad']); if (d.broken.main) flags.push([L('主砲破損', 'Main gun broken'), 'bad']); if (d.broken.sight) flags.push([L('照準器破損', 'Sight broken'), 'bad']); if (d.jam.coax) flags.push([L('同軸故障', 'Coax jam'), 'bad']); if (d.jam.bow) flags.push([L('車体機銃故障', 'Bow jam'), 'bad']); if (d.jam.aa) flags.push([L('.50故障', '.50 jam'), 'bad']); if (d.broken.aa) flags.push([L('.50破損', '.50 broken'), 'bad']);
    if (d.lead) flags.push([L('先頭車', 'Lead tank'), 'bad']);
    h += flags.map(f => `<span class="chip ${f[1] || ''}">${f[0]}</span>`).join('');
    h += `<span class="chip">VP ${d.vpTank}/${d.vpFriend}/${d.vpArea}${d.vpLost ? ` -${d.vpLost}` : ''}</span><span class="chip bad">${L('僚車', 'Tanks')}-${d.tanksLost} ${L('分隊', 'Sqd')}-${d.squadsLost}</span></div>`;
  }
  $('tank').innerHTML = h;
  renderPop(battle, prep, t, b, ammo);
}
function renderPop(battle, prep, t, b, ammo) {
  const el = $('pop'), g = E.G;
  if (!POP || !(battle || prep)) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const close = `<button class="popx" onclick="POP=null;render()">×</button>`;
  const avail = ['HE', 'AP', 'WP', 'HCBI', 'HVAP'].filter(a => ammo[a] > 0);
  let h = '';
  if (POP === 'AM' && battle) {
    h = `${close}<h3>${L('次に込める弾', 'Next round')}</h3><div class="opts big">${avail.map(a => `<button class="${ORD.reload === a ? 'on' : ''}" onclick="ORD.reload='${a}';render()">${a} ${ammo[a]}</button>`).join('')}</div><div class="opts big"><button class="${ORD.useRack ? 'on' : ''}" onclick="ORD.useRack=!ORD.useRack;render()">${L('即応弾架から取る(発射速度が上がる)', 'From the ready rack')}</button></div>`;
  } else if (POP === 'PR' && prep) {
    h = `${close}<h3>${L('戦闘前の準備', 'Prepare for battle')}</h3><div>${L('込める弾', 'Gun load')}</div><div class="opts big">${avail.map(a => `<button class="${b.load === a ? 'on' : ''}" onclick="setPrepLoad('${a}')">${a}</button>`).join('')}</div><label>${L('車体の向き', 'Facing')} <select onchange="E.G.bb.facing=+this.value;render()">${sectorOpts(b.facing)}</select></label> <label>${L('砲塔の向き', 'Turret')} <select onchange="E.G.bb.turret=+this.value;render()">${sectorOpts(b.turret)}</select></label><div class="minis">${miniMap(L('車体の向き', 'Facing'), 'sec', i => i === b.facing, i => `E.G.bb.facing=${i};render()`)}${miniMap(L('砲塔の向き', 'Turret'), 'sec', i => i === b.turret, i => `E.G.bb.turret=${i};render()`)}</div>`;
  } else if (battle && g.crew[POP]) {
    const p = POP, m = g.crew[p], act = ORD[p].act;
    h = `${close}<h3>${POSN()[p]} ${esc(m.name)} (${L('腕前', 'rating')}${m.rating})</h3>` + (p === 'G' || p === 'L' ? `<div class="chips" style="margin:0 0 6px"><span class="chip ${b.load ? 'good' : 'bad'}">${L('装填中の弾', 'Loaded')}: ${b.load || L('なし', 'none')}</span></div>` : '') + `<div class="opts big">`; // 砲手と装填手の窓に、いま込めている弾を出す（ユーザーの指示 2026-11-10）
    const all = crewOptions(p, t);
    for (const o of all.filter(o => needFix(o[0])).concat(all.filter(o => !needFix(o[0])))) {
      const blk = ordBlocked(o[0]), fx = needFix(o[0]);
      h += `<button class="${act === o[0] ? 'on' : ''} ${fx ? 'fix' : ''}" ${blk ? 'disabled' : ''} data-tip="${p}:${o[0]}" onclick="pickOrd('${p}','${o[0]}')">${fx ? '⚠ ' + L('故障中→', 'Jammed → ') : ''}${o[1]}${blk ? `(${blk})` : ''}</button>`;
    }
    h += `</div>`;
    if ((act === 'rotate' && p === 'G') || (p === 'D' && act === 'pivot')) { const cur = p === 'G' ? (ORD.G.to != null ? ORD.G.to : b.turret) : (ORD.D.to != null ? ORD.D.to : b.facing); h += `<div class="popx2" style="display:flex;align-items:center;gap:10px"><button onclick="setTo('${p}',${(cur + 5) % 6})">◀ ${L('左へ', 'Left')}</button><b style="min-width:3.5em;text-align:center;font-size:1.2em">${PB.SECTOR_NAME[PB.SECTORS[cur]]}</b><button onclick="setTo('${p}',${(cur + 1) % 6})">${L('右へ', 'Right')} ▶</button></div>`; } // 地図は出さず、左右で1セクターずつ回す（ユーザーの指示 2026-11-10）
    if (['fire', 'rotfire', 'coax', 'bow', 'aa', 'sub'].includes(act)) {
      h += `<div class="popx2">${L('目標', 'Target')} ${targetSelect(p)}</div>`;
      if (['coax', 'bow', 'aa', 'sub'].includes(act)) h += `<div class="minis">${miniMap(L('前進射撃: 撃つ区画を押す(灰色は撃てない)', 'Advancing fire: click a zone (grey = cannot)'), 'zone', (s, r) => ORD[p].target === `z:${s}:${r}`, (s, r) => `setTarget('${p}','z:${s}:${r}')`, (s, r) => zoneOk(act, s, r))}</div>`;
      if (p === 'G' && typeof ORD.G.target === 'number') {
        const u = b.units.find(x => x.id === ORD.G.target);
        if (u && !['LW', 'MG', 'AT'].includes(u.cls)) h += `<label><input type="checkbox" ${ORD.G.track ? 'checked' : ''} onchange="ORD.G.track=this.checked;render()"> ${L('履帯を狙う', 'Aim for track')}</label>`;
        if (u && b.load) { const hh = E.hitChance(u, b.load, b.load === 'WP' || b.load === 'HCBI' ? 'area' : 'direct', { cmdDirect: ORD.C.act === 'dirfire', track: !!ORD.G.track, rotated: ORD.G.act === 'rotfire' ? rotCount(b, u) : 0, moving: ['fwd', 'fwdHD', 'rev', 'revHD'].includes(ORD.D.act), pivoted: ORD.D.act === 'pivot' }); h += ` <span class="acc">${L('命中の見込み', 'To hit')} ${hh.chance != null ? hh.chance + '%' : '—'}</span>`; }
      }
    }
    if (p === 'L' && act === 'change') { if (!ORD.L.ammo) ORD.L.ammo = avail[0]; h += `<div class="opts big">${avail.map(a => `<button class="${ORD.L.ammo === a ? 'on' : ''}" onclick="setAmmoCh('${a}');render()">${a}</button>`).join('')}</div>`; }
    if (p === 'A' && act === 'swap') { const list = ['C', 'G', 'L', 'D'].filter(q => g.crew[q].status !== 'ok'); if (!ORD.A.to) ORD.A.to = list[0]; h += `<div class="opts big">${list.map(q => `<button class="${ORD.A.to === q ? 'on' : ''}" onclick="ORD.A.to='${q}';render()">${POSN()[q]}</button>`).join('')}</div>`; }
    const looksAt = q => { const key = q === 'L' ? 'loaderLook' : 'cmdLook', cur = PB.SECTORS.indexOf(b[key] || PB.SECTORS[b.turret]); return `<div class="popx2">${L('見る方向', 'Looks')} <select onchange="E.G.bb.${key}=PB.SECTORS[+this.value];render()">${sectorOpts(cur)}</select></div><div class="minis">${miniMap('', 'sec', i => i === cur, i => `E.G.bb.${key}=PB.SECTORS[${i}];render()`)}</div>`; };
    if (p === 'L' && !ORD.hatch.L) h += looksAt('L');
    if (p === 'C' && !ORD.hatch.C && !t.cupola) h += looksAt('C');
  } else { POP = null; el.style.display = 'none'; return; }
  // 下に「決定」ボタン（右上の × まで行かなくても閉じられる。ユーザーの指示 2026-11-07）
  h += `<div style="text-align:right;margin-top:8px"><button class="go" style="min-width:8em" onclick="POP=null;render()">${L('決定', 'OK')}</button></div>`;
  el.innerHTML = h; el.style.display = 'block';
}
// 追加の選択がいらない命令は、押したら閉じる
function pickOrd(p, v) { setOrd(p, v); const more = ['fire', 'rotfire', 'coax', 'bow', 'aa', 'sub', 'rotate', 'pivot', 'change', 'swap'].includes(v); if (!more) { POP = null; render(); } }
function setPrepLoad(a) { E.G.bb.load = a; E.G.bb.reload = a; render(); }
const rotCount = (b, u) => { const dd = Math.abs(PB.SECTORS.indexOf(u.sector) - b.turret); return Math.min(dd, 6 - dd); };
const uName = u => u.identified === false ? ({ TANK: L('未確認の戦車', 'Unid. tank'), SPG: L('未確認の自走砲', 'Unid. SPG'), AT: L('未確認の対戦車砲', 'Unid. AT gun') }[u.cls]) : (d => d ? L(d.name, d.en) : u.cls)(PB.UNIT[u.type || u.shown]);
function setOrd(p, v) { ensureOrders(); ORD[p] = Object.assign({}, ORD[p], { act: v }); if (p === 'G' && v === 'fire') { const b = E.G.bb; const pick0 = b.units.find(u => u.spot === 'spotted' && PB.SECTORS[b.turret] === u.sector); if (pick0 && !ORD.G.target) ORD.G.target = pick0.id; } render(); }
function setTo(p, v) { ORD[p].to = +v; render(); }
function setTarget(p, v) { ORD[p].target = v && v.startsWith('z:') ? v : (+v || null); render(); }
function setAmmoCh(v) { ORD.L.ammo = v; }
function toggleHatch(p) { const g = E.G; if (g.phase === 'battle') { ensureOrders(); ORD.hatch[p] = !ORD.hatch[p]; } else g.bb.hatch[p] = !g.bb.hatch[p]; render(); }
// ===== 下の操作 =====
function renderOps() {
  const g = E.G; let h = '';
  if (PLAY) { $('ops').innerHTML = `<span class="small wide">${L('ログの中のボタンで進めます', 'Use the button in the log')}</span>`; renderPlayBtn(); return; }
  renderPlayBtn();
  if (g.phase === 'calendar' || g.phase === 'debrief') {
    h = `<button class="go" onclick="doNext()">${L('次の日へ', 'Next day')}</button><button onclick="doNextCombat()">${L('出撃日まで進む', 'Advance to next combat')}</button>`;
  } else if (g.phase === 'move') {
    const d = g.day, m = d.map, cur = m.areas[m.cur];
    const nearOk = SEL != null && (d.advChoice ? d.advChoice.includes(SEL) : E.neighbors(cur).some(a => a.id === SEL));
    const left = d.set - d.time;
    h = `<span class="small wide">${L(`日没まで${left}分`, `${left} min to sunset`)}${nearOk ? '' : L('。隣の区域を押してください', '. Click an adjacent area')}</span>
    <label><input type="checkbox" ${ADV ? 'checked' : ''} onchange="ADV=this.checked"> ${L('前進射撃', 'Advancing fire')}</label>
    <button class="go" ${nearOk ? '' : 'disabled'} onclick="doEnter()">${L('進入', 'Enter')}${nearOk ? `（${d.advChoice ? 0 : E.enterTime(cur, m.areas[SEL])}${L('分', 'm')}）` : ''}</button>
    <button ${nearOk ? '' : 'disabled'} onclick="doOp('check')">${d.freeCheck ? L('偵察 無料', 'Scout free') : L('偵察 15分', 'Scout 15m')}</button>
    <button ${nearOk ? '' : 'disabled'} onclick="doOp('art')">${L('砲兵 15分', 'Artillery 15m')}</button>
    <button ${nearOk ? '' : 'disabled'} onclick="doOp('air')">${L('航空 30分', 'Air strike 30m')}</button>
    <button onclick="doOp('res')">${L('補給 60分', 'Resupply 60m')}</button>
    <button onclick="doEndDay()">${L('今日はここまで', 'End the day')}</button>`;
  } else if (g.phase === 'ca') {
    h = `<span class="small wide">${L('陣地で敵を待つ（車体隠蔽）', 'Waiting hull down for the enemy')}</span><button class="go" onclick="doCa()">${L('15分待つ', 'Wait 15 min')}</button> <button onclick="doOp('res')">${L('補給 60分', 'Resupply 60m')}</button>`;
  } else if (g.phase === 'battle') {
    h = `<span class="small wide">${L('敵を押すと主砲の目標と弾が自動で入ります', 'Click an enemy: target and ammo are set for you')}</span><button class="go wide" onclick="doRound()">${L('「かかれ！」（命令を実行）', '"Go!" (execute orders)')}</button>`;
  } else if (g.phase === 'over') { h = ''; }
  $('ops').innerHTML = h;
}
function afterAct(r) {
  SEL = null; ADV = false; ORD = null;
  const g = E.G;
  if (g.phase === 'battle') VIEW = 'battle';
  else if (g.phase === 'move') VIEW = 'map';
  if (r && r.debrief) showDebrief(r.debrief);
  if (g.phase === 'over' || g.over) showOver();
  if (g.phase === 'debrief') { const keep = g.day; g.day = null; g.bb = null; g.phase = 'calendar'; void keep; save(); }
  render();
}
function doNext() { play(() => E.nextDay(), r => { if (r && r.combat) VIEW = 'map'; if (r && r.refit) refitBox(r.refit); if (r && r.over) showOver(); afterAct(r); if (r && r.combat) loadBox(); }); }
function doNextCombat() { play(() => { let r; let k = 0; do { r = E.nextDay(); if ((r && r.refit) || E.G.over) break; } while (r && r.skipped && ++k < 300); return r; }, r => { if (r && r.refit) refitBox(r.refit); if (E.G.over) showOver(); afterAct(r); if (r && r.combat) loadBox(); }); }
function doEnter() {
  const s = SEL, a = ADV, noTime = !!E.G.day.advChoice;
  if (a) return advBox(s, noTime);
  play(() => E.opEnter(s, false, null, noTime), afterAct);
}
// 22.12 前進射撃のマーカーを置く（地図の上で置く。ユーザーの指示 2026-11-08）
//   区画の丸を押すと1個置く（重ねて置ける）。右クリックで1個減らす。置けない区画は灰色
var ADVZ = null, ADVLOG = [], ADVN = 0, ADVARG = null;
const ADV_OK = ['45:0', '45:1', '45:2', '68:0', '68:1', '910:0', '910:1', '910:2'];
function advBox(s, noTime) {
  ADVN = E.advMarkers(); ADVARG = [s, noTime]; ADVLOG = [];
  ADVZ = {};
  // 最初の置き方: セクター4-5・6-8・9-10 の近距離に2個ずつ（今までと同じ）
  ['45:0', '68:0', '910:0'].forEach(k => { let left = ADVN - advSum(); if (left > 0) { ADVZ[k] = Math.min(2, left); } });
  advDraw();
}
function advSum() { return Object.values(ADVZ || {}).reduce((t, v) => t + v, 0); }
function advAdd(k, d) {
  if (d > 0 && advSum() >= ADVN) return;
  if (d < 0 && !(ADVZ[k] > 0)) return;
  ADVZ[k] = (ADVZ[k] || 0) + d; if (!ADVZ[k]) delete ADVZ[k];
  if (d > 0) ADVLOG.push(k);
  advDraw();
}
function advUndo() { const k = ADVLOG.pop(); if (k && ADVZ[k]) { ADVZ[k]--; if (!ADVZ[k]) delete ADVZ[k]; } advDraw(); }
function advClear() { ADVZ = {}; ADVLOG = []; advDraw(); }
function advDraw() {
  let h = `<image href="img/battle.jpg" width="${BW}" height="${BH}"/>`;
  PB.SECTORS.forEach((sec, i) => [0, 1, 2].forEach(r => {
    const k = sec + ':' + r, ok = ADV_OK.includes(k), n = ADVZ[k] || 0, [x, y] = bbPos(i, r, 0);
    h += `<g ${ok ? `style="cursor:pointer" onclick="advAdd('${k}',1)" oncontextmenu="event.preventDefault();advAdd('${k}',-1)"` : ''}><circle cx="${x}" cy="${y}" r="44" fill="${n ? 'rgba(255,255,255,.45)' : ok ? 'rgba(255,226,122,.22)' : 'rgba(0,0,0,.55)'}" stroke="${n ? '#fff' : ok ? '#ffe27a' : '#555'}" stroke-width="${n ? 12 : 5}"/>`
      + (n ? `<text x="${x}" y="${y + 20}" text-anchor="middle" font-size="58" font-weight="bold" fill="#c00" stroke="#fff" stroke-width="3" style="pointer-events:none">${n}</text>` : '') + '</g>';
  }));
  PB.SECTORS.forEach((sec, i) => { const [x, y] = bbPos(i, 2, 0); h += `<text x="${x}" y="${y - 52}" text-anchor="middle" font-size="44" font-weight="bold" fill="#fff" stroke="#000" stroke-width="2" style="pointer-events:none">${PB.SECTOR_NAME[sec]}</text>`; });
  h += `<g transform="translate(${BCX},${BCY})"><rect x="-26" y="-40" width="52" height="76" rx="6" fill="#5c6b35" stroke="#111" stroke-width="3"/><circle r="19" fill="#39431f" stroke="#111" stroke-width="3"/></g>`;
  const left = ADVN - advSum();
  inlineBox(`<h2>${L('前進射撃のマーカー', 'Advancing fire markers')}</h2>
  <p>${L(`地図の丸を押すと、そこにマーカーを1個置きます（同じ丸に重ねて置けます）。右クリックで1個減らします。灰色の丸には置けません。内側から近・中・遠です。`, `Click a circle on the map to place one marker there (you may stack them). Right-click to remove one. Grey circles cannot be used. From the inside: close, medium, long.`)}</p>
  <p><b>${L(`残り ${left} 個`, `${left} left`)}</b>（${L(`全部で ${ADVN} 個`, `${ADVN} in all`)}）</p>
  <div class="mini"><svg viewBox="0 0 ${BW} ${BH}" style="width:min(480px,90vw)">${h}</svg></div>
  <p><button onclick="advUndo()">${L('1個戻す', 'Undo one')}</button> <button onclick="advClear()">${L('全部やり直す', 'Clear all')}</button></p>
  <p><button class="go" onclick="advGo()">${L('進入する', 'Enter')}</button> <button onclick="closeOver()">${L('戻る', 'Back')}</button></p>`);
}
function advGo() {
  const [s, noTime] = ADVARG; const z = Object.assign({}, ADVZ);
  closeOver();
  play(() => E.opEnter(s, true, z, noTime), afterAct);
}
// 4.26 朝の弾薬の積み方
function loadBox() {
  const g = E.G, d = g.day, t = E.tank();
  const req = d.extra;
  inlineBox(`<h2>${L('弾薬を積む', 'Load ammo')}</h2>
  <p>${L(`標準 ${t.rounds}発`, `Normal load ${t.rounds}`)}${req ? L(`、追加を命じられた分 ${req}発`, `, ordered extra ${req}`) : ''}。${L('任意で30発まで追加できます（爆発しやすくなり、湿式弾庫の利点も失います）。', 'You may add up to 30 more (raises explosion risk and loses wet stowage).')}</p>
  <div class="grid"><label>${L('任意の追加', 'Extra')} <input id="lV" type="number" min="0" max="30" value="0" oninput="loadCalc()" style="width:4em"></label>
  <label>AP <input id="lA" type="number" min="0" value="${d.ammo.AP}" oninput="loadCalc()" style="width:4em"></label>
  ${t.gun === 75 ? `<label>WP <input id="lW" type="number" min="0" value="${d.ammo.WP}" oninput="loadCalc()" style="width:4em"></label>` : ''}
  <span id="lH"></span></div>
  ${t.gun === 75 ? `<p style="color:var(--mute)">HCBI ${d.ammo.HCBI}${L('発（今日手に入った分）', ' (issued today)')}</p>` : `<p style="color:var(--mute)">HVAP ${d.ammo.HVAP}${L('発（今日手に入った分）', ' (issued today)')}</p>`}
  <h3>${L('即応弾架', 'Ready rack')} (${L('最大', 'max')} ${t.rack})</h3><div class="grid">${['HE', 'AP'].concat(t.gun === 75 ? ['WP', 'HCBI'] : ['HVAP']).map(k => `<label>${k} <input class="lR" data-k="${k}" type="number" min="0" max="${t.rack}" value="${d.rack[k] || 0}" style="width:3.5em"></label>`).join('')}</div>
  <p style="color:var(--mute);font-size:.9em">${L('目安（ルールのヒント）: 75mmはHE60%、AP30%、煙10%。弾架は半分以上AP、煙1〜2発。76mmはHE60%、AP40%、弾架はAP75%。', 'Rule hints: 75mm HE 60%, AP 30%, smoke 10%; rack at least half AP, 1-2 smoke. 76mm HE 60%, AP 40%; rack 75% AP.')}</p>
  <p><button class="go" onclick="loadGo()">${L('これで出撃', 'Roll out')}</button></p>`);
  loadCalc();
}
function loadCalc() { const d = E.G.day, t = E.tank(); const tot = t.rounds + (d.extraReq != null ? d.extraReq : d.extra) + (+$('lV').value || 0); const he = tot - (+$('lA').value || 0) - ($('lW') ? +$('lW').value || 0 : 0); $('lH').textContent = `HE ${he}${L('発', '')} (${L('出撃前に', 'minus')} ${d.heSpent}${L('発使用', ' used')})`; }
function loadGo() {
  const rack = {}; document.querySelectorAll('.lR').forEach(i => { rack[i.dataset.k] = +i.value || 0; });
  E.setLoad({ vol: +$('lV').value || 0, ap: +$('lA').value || 0, wp: $('lW') ? +$('lW').value || 0 : 0, rack });
  closeOver();
}
// 偵察・砲兵・航空のあとも、まだ移動の場面でその区域が隣なら選んだままにする（すぐ「進入」を押せる。ユーザーの指示 2026-11-07）
function doOp(k) {
  const s = SEL;
  play(() => { if (k === 'check') return E.opCheck(s); if (k === 'art') return E.opArt(s); if (k === 'air') return E.opAir(s); return E.opResupply(); }, r => {
    afterAct(r);
    const g = E.G;
    if (k === 'res' || s == null || g.phase !== 'move' || !g.day || !g.day.map) return;
    const d = g.day, cur = d.map.areas[d.map.cur];
    if (d.advChoice ? d.advChoice.includes(s) : E.neighbors(cur).some(a => a.id === s)) { SEL = s; render(); }
  });
}
function doEndDay() { if (!confirm(L('今日の作戦を切り上げますか？', 'End today\'s operation?'))) return; play(() => E.debrief(), afterAct); }
function doCa() { play(() => E.caTick(), afterAct); }
function doRound() { POP = null; const o = ORD || {}; play(() => E.resolveRound(o), afterAct); }
// 24.0 乗員の腕前の合計が35以上なら型を選べる
function tankChoice() { const g = E.G; const sum = ['C', 'G', 'L', 'D', 'A'].reduce((a, p) => a + g.crew[p].rating, 0); if (sum < 35) return ''; return `<select onchange="if(this.value){E.replaceTank(+this.value);closeOver()}"><option value="">${L('型を選ぶ', 'Choose a model')}</option>${Object.keys(PB.TANKS).map(i => `<option value="${i}">#${i} ${PB.TANKS[i].model} ${PB.TANKS[i].turret}</option>`).join('')}</select>`; }
function refitBox(days) {
  inlineBox(`<h2>${L('再編', 'Refit')} — ${days}${L('日', ' days')}</h2><p>${L('師団は後方で補充と訓練に入りました。', 'The Division is out of the line for replacements and training.')}</p><p>${L(`今の戦車: ${E.tank().model}。新しい戦車を申請できます（必ず良い型が来るとは限りません）。`, `Current tank: ${E.tank().model}. You may request a new tank (no promises).`)}</p><p><button onclick="E.replaceTank();closeOver()">${L('新しい戦車を申請', 'Request a new tank')}</button> ${tankChoice()} <button class="go" onclick="closeOver()">${L('今の戦車のまま', 'Keep this tank')}</button></p>`);
}
function closeOver() { const lb = $('lb'); if (lb) lb.remove(); $('over').style.display = 'none'; render(); }
// ===== レポート（After Action Report の形）=====
var REPORTS = [];
// レポートは「やった、やられた」だけ。敵の細かい動きは入れない（ユーザーの指示 2026-11-04）
const REPORT_SKIP = /物陰に隠れ|gone to ground|近くへ動いた|moves in close|戦場から退いた|withdraws from the field|押し出された|pushed out|かすめた|narrowly misses/;
function reportHtml(R) {
  const rankJ = ['軍曹', '二等軍曹', '少尉', '中尉', '大尉'], rankE = ['Sergeant', 'Staff Sergeant', '2nd Lieutenant', '1st Lieutenant', 'Captain'];
  const posN = POSN();
  const count = (o, keys) => keys.reduce((n, k) => n + (o[k] || 0), 0);
  const rows = [[L('歩兵火器、機関銃', 'Light weapons, MG'), 1, ['LW', 'MG']], [L('トラック', 'Truck'), 1, ['TRUCK']], ['SPW, PSW', 2, ['SPW', 'PSW']], [L('自走砲', 'SP gun'), 6, ['StuG', 'MarderII', 'MarderIII', 'JgdIV', 'Jgd38']], [L('IV号', 'Pz IV'), 7, ['PzIV']], [L('V号パンター', 'Pz V'), 9, ['PzV']], [L('VI号', 'Pz VI'), 12, ['PzVIe', 'PzVIb']], [L('対戦車砲', 'AT gun'), 4, ['50L', '75L', '88LL']]];
  const fm = m => clockStr(m);
  let cells = '';
  for (let h = 5; h < 20; h++) { cells += `<tr><th>${String(h).padStart(2, '0')}00</th>`; for (let q = 0; q < 4; q++) { const m = h * 60 + q * 15; const off = m < R.rise || m >= R.set; const pre = !off && m < R.start; const used = !off && m >= R.start && m < R.end; cells += `<td class="${off ? 'off' : pre ? 'pre' : used ? 'used' : ''}"></td>`; } cells += `</tr>`; }
  const log = R.log.filter(x => !REPORT_SKIP.test(x.t)).map(x => `<div class="${x.c || ''}">${esc(x.t)}</div>`).join('');
  return `<section class="aar"><h1>After Action Report</h1>
  <table class="top"><tr><td><b>${L('日付', 'Date')}</b> ${esc(R.date)}<br><b>${L('戦車の名前', 'Tank name')}</b> ${esc(R.tankName)}<br><b>${L('戦車の型', 'Tank model')}</b> #${R.tankId} ${esc(R.model)}<br><b>${L('シナリオ', 'Situation')}</b> ${{ A: L('進撃', 'Advance'), B: L('会戦', 'Battle'), C: L('反撃', 'Counterattack') }[R.sc]} / ${L('抵抗', 'resistance')} ${R.res}<br><b>${L('天候', 'Weather')}</b> ${esc(R.weather)}</td>
  <td><table class="grid"><tr><th>${L('乗員', 'Crew')}</th><th>${L('階級', 'Rank')}</th><th>${L('名前', 'Name')}</th><th>${L('腕前', 'Rating')}</th><th></th></tr>${R.crew.map((m, i) => `<tr><td>${posN[m.pos]}</td><td>${m.pos === 'C' ? L(rankJ[R.rank], rankE[R.rank]) : m.pos === 'G' ? L('伍長', 'Cpl.') : L('二等兵', 'Pvt.')}</td><td>${esc(m.name)}</td><td>${m.rating}</td><td>${m.status === 'ok' ? '' : { kia: L('戦死', 'KIA'), out: L('負傷', 'wounded'), home: L('送還', 'sent home'), uncon: L('気絶', 'unconscious') }[m.status]}</td></tr>`).join('')}</table></td></tr></table>
  <div class="cols"><div><h2>${L('時間', 'Time')}</h2><table class="time">${cells}</table><p class="small">${L('灰=日の出前・日没後、斜線=開始前、黒=使った時間', 'Grey=dark, hatched=before start, black=used')}<br>${L('開始', 'Start')} ${fm(R.start)} / ${L('終了', 'End')} ${fm(R.end)}</p></div>
  <div><h2>${L('弾薬(残り)', 'Ammo left')}</h2><table class="grid"><tr><td>${L('発煙弾', 'Smoke bombs')}</td><td>${R.smokeBomb}</td></tr><tr><td>${L('発煙手榴弾', 'Smoke grenades')}</td><td>${R.grenades}</td></tr><tr><td>${L('ペリスコープ', 'Periscopes')}</td><td>${R.periscopes}</td></tr>${['HE', 'AP', 'WP', 'HCBI', 'HVAP'].map(k => `<tr><td>${k}</td><td>${R.ammo[k] || 0}</td></tr>`).join('')}</table></div>
  <div><h2>${L('勝利点', 'Victory points')}</h2><table class="grid"><tr><th></th><th>${L('自分の戦車', 'Your tank')}</th><th>${L('味方', 'Friendly')}</th></tr>${rows.map(r => `<tr><td>${r[0]} (${r[1]})</td><td>${count(R.ko, r[2]) || ''}</td><td>${count(R.fko, r[2]) || ''}</td></tr>`).join('')}<tr><td>${L('要塞', 'Fortified')} (+2)</td><td>${R.fortT || ''}</td><td>${R.fortF || ''}</td></tr>
  <tr><td>${L('確保した区域', 'Areas captured')} (1)</td><td colspan="2">${R.areas || ''}</td></tr><tr><td>${L('確保した出口', 'Exit captured')} (10)</td><td colspan="2">${R.exits || ''}</td></tr><tr><td>${L('失った区域', 'Areas lost')} (1)</td><td colspan="2">${R.lostN || ''}</td></tr><tr><td>${L('失った出口', 'Exits lost')} (10)</td><td colspan="2">${R.lostEx || ''}</td></tr><tr><td>${L('僚車の損失', 'Tanks lost')} (-5)</td><td colspan="2">${R.tanksLost || ''}</td></tr><tr><td>${L('分隊の損失', 'Squads lost')} (-3)</td><td colspan="2">${R.squadsLost || ''}</td></tr></table>
  <h2>${L('合計', 'Totals')} (×${R.mult.join(' / ×')})</h2><table class="grid"><tr><td>${L('自分の戦車', 'Your tank')}</td><td>${R.your}</td></tr><tr><td>${L('味方', 'Friendly')}</td><td>${R.fr}</td></tr><tr><td>${L('地域', 'Territory')}</td><td>${R.terr}</td></tr><tr><th>${L('合計', 'Total')}</th><th>${R.total} — ${R.total > 0 && !R.koed ? L('勝ち', 'Win') : L('負け', 'Loss')}</th></tr></table></div></div>
  <p><b>${L('一日の終わり', 'Day ended')}</b>: ${fm(R.end)}${R.broken ? ' ' + L('故障', 'breakdown') : ''}${R.koed ? ' ' + L('撃破された', 'knocked out') : ''}${R.lead ? ' / ' + L('先頭車', 'lead tank') : ''} &nbsp; <b>${L('勲章', 'Decorations')}</b>: ${R.medal ? esc(R.medal) : '-'} &nbsp; ${R.promoted ? `<b>${L('昇進', 'Promoted')}</b> &nbsp; ` : ''}<b>${L('戦車の累計', 'Tank total')}</b>: ${R.totalVP}VP</p>
  <h2>${L('戦闘ログ', 'Battle log')}</h2><div class="dlog">${log}</div></section>`;
}
const REPORT_CSS = `body{font:14px/1.5 'Helvetica Neue',Arial,'Hiragino Sans',sans-serif;color:#111;background:#fff;max-width:980px;margin:0 auto;padding:16px}h1{font-size:30px;text-align:center;margin:4px 0}h2{font-size:15px;margin:10px 0 3px;border-bottom:2px solid #111}table{border-collapse:collapse}.grid td,.grid th{border:1px solid #111;padding:2px 7px;text-align:left}.top{width:100%}.top>tbody>tr>td{vertical-align:top;padding-right:16px}.cols{display:grid;grid-template-columns:auto auto 1fr;gap:18px}.time td,.time th{border:1px solid #111;width:18px;height:15px;font-size:11px;font-weight:normal;padding:0 3px}.time .off{background:#aaa}.time .pre{background:repeating-linear-gradient(45deg,#fff,#fff 3px,#888 3px,#888 5px)}.time .used{background:#222}.small{font-size:12px;color:#444}.dlog div{margin:1px 0}.dlog .judge{color:#666;font-family:ui-monospace,Menlo,monospace;font-size:12px}.dlog .bad{color:#b00;font-weight:bold}.dlog .good{color:#070}.dlog .head{font-weight:bold;margin-top:8px;border-top:1px solid #999;padding-top:3px}.dlog .date,.dlog .evening{font-weight:bold;background:#eee;padding:2px 4px}section{page-break-after:always;margin-bottom:30px}@media(max-width:700px){.cols{grid-template-columns:1fr}}`;
function downloadHtml(name, body) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`<!doctype html><html lang="${LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Patton's Best Report</title><style>${REPORT_CSS}</style></head><body>${body}</body></html>`], { type: 'text/html' })); a.download = name; a.click(); }
function saveReport(i) { const R = REPORTS[i]; if (R) downloadHtml(`pattons_best_report_${R.date.replace(/\//g, '-')}.html`, reportHtml(R)); }
function saveLastReport() { saveReport(REPORTS.length - 1); }
function saveAllReports() { if (!REPORTS.length) return alert(L('まだレポートがありません', 'No reports yet')); downloadHtml('pattons_best_campaign.html', REPORTS.map(reportHtml).join('')); }
function showDebrief(r) {
  keepJudge();
  if (r.report) REPORTS.push(Object.assign(r.report, { log: ALLLOG.slice(DAYSTART) }));
  const g = E.G;
  inlineBox(`<h2>${r.ko ? L('戦車を失った', 'Tank lost') : L('夕方の報告', 'Evening report')}</h2>
  <p>${L('戦車の戦果', 'Your tank')}: ${r.your} / ${L('味方', 'Friendly forces')}: ${r.fr} / ${L('地域', 'Territory')}: ${r.terr}</p><p><b>${L('合計', 'Total')} ${r.total} VP — ${r.total > 0 && !r.ko ? L('今日は勝った', 'A victory today') : L('今日は負けた', 'A defeat today')}</b></p>
  ${r.ko ? `<p>${L(`新しい戦車: #${g.tankId} ${E.tank().model}`, `New tank: #${g.tankId} ${E.tank().model}`)} ${tankChoice()}</p>` : ''}${r.promoted ? `<p style="color:var(--good)">${L('昇進した！', 'Promoted!')}</p>` : ''}${r.medal ? `<p style="color:var(--good)">🎖 ${r.medal}</p>` : ''}
  ${g.medals.length ? `<p style="color:var(--mute);font-size:.9em">${L('勲章', 'Medals')}: ${g.medals.join('、')}</p>` : ''}
  <p><button class="go" onclick="closeOver()">${L('続ける', 'Continue')}</button> <button onclick="saveLastReport()">${L('レポートを保存', 'Save report')}</button></p>`);
}
function showOver() {
  const g = E.G, o = g.over; if (!o) return;
  const kills = Object.keys(g.kills).map(k => `${L((PB.UNIT[k] || {}).name || k, (PB.UNIT[k] || {}).en || k)} ×${g.kills[k]}`).join('、') || L('なし', 'none');
  inlineBox(`<h2>${o.win ? L('終戦', 'War\'s end') : L('戦いの終わり', 'The end')}</h2><p>${o.why}</p><p>${L(`出撃 ${g.days}日、戦闘 ${g.battles}回、累計 ${g.totalVP}VP`, `${g.days} days in action, ${g.battles} battles, ${g.totalVP} VP`)}</p><p>${L('撃破', 'Kills')}: ${esc(kills)}</p>${g.medals.length ? `<p>${L('勲章', 'Medals')}: ${g.medals.join('、')}</p>` : ''}
  <p>${o.canContinue ? `<button class="go" onclick="E.continueAsReplacement();closeOver();save()">${L('次の車長として続ける', 'Continue as the replacement')}</button> ` : ''}<button onclick="saveLastReport()">${L('最後のレポート', 'Last report')}</button> <button onclick="saveAllReports()">${L('レポート一式', 'All reports')}</button> <button onclick="try{localStorage.removeItem('pb_save')}catch(e){};location.reload()">${L('最初から', 'New campaign')}</button></p>`);
}
function helpBox() {
  $('over').style.display = 'flex';
  $('over').innerHTML = `<div class="box"><h2>${L('遊び方', 'How to play')}</h2>
  <p>${L('<b>地図</b>: 隣の区域を押して、進入・偵察・砲兵・航空支援を選びます。赤い点線の区域が今日の目標です。A=農場、B=畑、C=村、D=森。C と A は敵が出やすいです。', '<b>Map</b>: click an adjacent area, then choose Enter, Scout, Artillery or Air strike. The red dashed area is today\'s objective. A=farm, B=fields, C=village, D=woods.')}</p>
  <p>${L('<b>戦場</b>: 真ん中が自分の戦車です。敵は6つのセクターと3つの距離にいます。「?」はまだ見つけていない敵です。見つけた敵を押すと、砲手の目標と弾の種類が自動で入ります。戦車・自走砲には徹甲弾（AP）、歩兵には榴弾（HE）が基本です。', '<b>Battlefield</b>: your tank is in the center. Enemies occupy six sectors at three ranges. "?" means not yet spotted. Click a spotted enemy to set the gunner\'s target and ammo. AP for vehicles, HE for infantry.')}</p>
  <p>${L('<b>戦車</b>: 地図の下に乗員5人の命令のボタンがあります。ハッチの開閉もここです。朝は弾薬の積み方を選びます。', '<b>Tank</b>: order buttons for the five crew are below the map, with hatch toggles. Each morning you choose your ammo load.')}</p>
  <p>${L('<b>コツ</b>: 敵戦車の正面は硬く、側面や背面は柔らかいです。車体隠蔽に入ると弾が当たりにくくなります。ハッチを開けると見つけやすくなりますが、車長が撃たれる危険も増えます。煙は撃たれにくくしますが、自分も撃ちにくくなります。', '<b>Tips</b>: enemy tank fronts are hard; sides and rears are soft. Hull down is safer. Open hatches see better but expose the crew. Smoke hides you, and blocks your aim too.')}</p>
  
  <p><button class="go" onclick="closeOver()">${L('閉じる', 'Close')}</button></p></div>`;
}
function render() {
  const g = E.G; if (!g) return;
  renderBar(); renderTabs(); renderLogHead();
  if (VIEW === 'battle') renderBattle(); else renderMap();
  renderTank(); renderOps();
}
startScreen();
