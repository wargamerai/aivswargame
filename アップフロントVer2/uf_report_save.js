// アップフロント: 対戦レポート・途中セーブとロード
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== 対戦レポート（ゲームの流れを記録し、終わったら保存できる） =====
const UF_REPORT = { events: [], counts: { player: {}, ai: {} }, snaps: [], ev: [] };
const UF_TERR_NAME = { WOODS: '森林', BUILDINGS: '建物', HILL: '丘', GULLY: '涸れ谷', WALL: '壁', BRUSH: '繁み', STREAM: '河川', MARSH: '湿地',
  SMOKE: '煙幕', WIRE: '鉄条網', MINEFIELD: '地雷原', PILLBOX: 'トーチカ', PLAIN: '平地', TRENCH: '塹壕', MOVEMENT: '移動' };
function _ufSideOfGroup(g) { for (const sd of ['player', 'ai']) { const i = (state.groups[sd] || []).indexOf(g); if (i >= 0) return { side: sd, idx: i }; } return null; }
/** 大まかな出来事（盤面の図の下に出す時系列）。side は誰の出来事か */
function ufEvent(side, text) {
  if (typeof state === 'undefined' || !state || (state.phase !== 'play' && state.phase !== 'gameover')) return;
  UF_REPORT.ev.push({ t: state.turnCount || 0, side: side || state.currentTurn || '', text: String(text) });
}
/** 盤面のスナップショット: 各グループの位置・距離チット・地形・兵の状態 */
function ufSnapshot(label, side) {
  const R = window.INFANTRY_RULES;
  if (!R || !state.groups) return;
  const g = sd => {
    const fk = getFactionKey(sd === 'player' ? state.player : state.ai);
    return (state.groups[sd] || []).map((grp, i) => {
      if (!grp) return null;
      const terr = [];
      let moving = false;
      (grp.terrain || []).forEach(t => { const ty = t && t.terrain && t.terrain.type; if (!ty) return; if (ty === 'MOVEMENT') moving = true; else if (UF_TERR_NAME[ty] && terr.indexOf(UF_TERR_NAME[ty]) < 0) terr.push(UF_TERR_NAME[ty]); });
      const top = grp.terrain && grp.terrain.length ? grp.terrain[grp.terrain.length - 1] : null;
      if (!(top && top.terrain && top.terrain.type === 'MOVEMENT')) moving = false;
      return {
        i, n: grp.name, d: grp.distance || 0, e: !!grp.eliminated, terr, moving,
        s: grp.cards.map(c => {
          const d = R.lookupSoldier(c, fk);
          const st = c.captured ? 'pris' : c.killed ? 'kia' : c.routed ? 'rout' : (R.isPinned(c) ? 'pin' : 'ok');
          return { n: d ? d.name : c.id, st, w: !!c.wounded && !c.killed && !c.routed, inf: !!c.infiltrating };
        })
      };
    });
  };
  UF_REPORT.snaps.push({ t: state.turnCount || 0, label, side: side || '', p: g('player'), a: g('ai') });
}
window.ufEvent = ufEvent;
function _ufStrip(t) { return String(t == null ? '' : t).replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
/** 出来事を 1つ記録する。kind: ai（AIの行動）/ player（プレイヤーの行動）/ fire（射撃の結果）/ cc（白兵戦の結果）/ msg（メッセージ） */
function ufReportLog(kind, text, side) {
  if (typeof state === 'undefined' || !state || (state.phase !== 'play' && state.phase !== 'gameover')) return;
  const t = _ufStrip(text);
  if (!t) return;
  UF_REPORT.events.push({ turn: state.turnCount || 0, side: side || state.currentTurn || '', kind, text: t });
  if (kind === 'ai' || kind === 'player') {
    const k = kind === 'ai' ? (t.replace(/^AI:\s*/, '').split(/[ —（(→:：]/)[0] || '?') : t.replace(/^行動:\s*/, '');
    const c = UF_REPORT.counts[kind === 'ai' ? 'ai' : 'player'];
    c[k] = (c[k] || 0) + 1;
  }
  if (state.phase === 'gameover' && !state._ufEndText && kind === 'msg') state._ufEndText = t;
}
window.ufReportLog = ufReportLog;
function ufReportReset() { UF_REPORT.events = []; UF_REPORT.counts = { player: {}, ai: {} }; UF_REPORT.snaps = []; UF_REPORT.ev = []; }
/** 射撃の結果を記録する（詳しい記録と、大まかな出来事） */
function ufLogFire(title, results) {
  const t = _ufStrip(title);
  ufReportLog('fire', t + ' → ' + (results || []).map(r => `${r.name}: ${resultLabel(r.result)}`).join('、'));
  const m = t.match(/(AI射撃|射撃|迫撃砲)\s*(\S+?)→(\S+?)\s/);
  const cnt = {}; (results || []).forEach(r => { const k = (r.result === 'KIA' || r.result === 'PANIC_KIA') ? '戦死' : r.result === 'PANIC_ROUT' ? '敗走' : r.result === 'PIN' ? 'ピン' : r.result === 'WOUND' ? '負傷' : r.result === 'BERSERK' ? '狂暴' : null; if (k) cnt[k] = (cnt[k] || 0) + 1; });
  const eff = Object.keys(cnt).map(k => k + cnt[k]).join('・') || '効果なし';
  const side = state.currentTurn;
  if (m) ufEvent(side, `GROUP ${m[2]} が 敵の GROUP ${m[3]} を${m[1] === '迫撃砲' ? '迫撃砲で' : ''}射撃 → ${eff}`);
}
window.ufLogFire = ufLogFire;
// メッセージ（alert）も記録する（日本語の元の文で記録。英語表示の時は lang.js が表示だけ訳す）
(function () {
  const orig = window.alert;
  window.alert = function (msg) { try { ufReportLog('msg', msg); } catch (e) {} return orig.apply(this, arguments); };
})();

/** 両軍の損害の内訳 */
function _ufCasualties(side) {
  const R = window.INFANTRY_RULES;
  const out = { total: 0, alive: 0, kia: 0, rout: 0, prisoner: 0, wounded: 0 };
  (state.groups[side] || []).forEach(g => g && g.cards.forEach(c => {
    out.total++;
    if (c.captured) out.prisoner++;
    else if (c.killed) out.kia++;
    else if (c.routed) out.rout++;
    else { out.alive++; if (c.wounded) out.wounded++; }
  }));
  return out;
}
function ufBuildReportHtml() {
  const en = (typeof LANG !== 'undefined' && LANG === 'en' && typeof langTranslate === 'function');
  const L = t => en ? langTranslate(String(t)) : String(t);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sc = state.scenario;
  const names = (window.SCENARIO_HELPERS && window.SCENARIO_HELPERS.AI_STRATEGY_NAMES) || {};
  const aiStg = ((state.groups.ai || []).find(g => g && g._strategy) || {})._strategy;
  const STY = { aggr: '攻撃的', bal: 'バランス', def: '防御的' };
  const cP = _ufCasualties('player'), cA = _ufCasualties('ai');
  const vpP = typeof calcVictoryPoints === 'function' ? calcVictoryPoints('player') : '-';
  const vpA = typeof calcVictoryPoints === 'function' ? calcVictoryPoints('ai') : '-';
  const row = (k, a, b) => `<tr><th>${esc(L(k))}</th><td>${esc(L(a))}</td><td>${esc(L(b))}</td></tr>`;
  const cnt = c => Object.keys(c).sort((x, y) => c[y] - c[x]).map(k => `${L(k)} ${c[k]}`).join(' / ') || '-';
  // 手番ごとにまとめる
  const byTurn = new Map();
  UF_REPORT.events.forEach(e => { if (!byTurn.has(e.turn)) byTurn.set(e.turn, []); byTurn.get(e.turn).push(e); });
  const AVA = !!window.__ufAiVsAi; // AI 同士の対戦のレポート（画面なしの対戦で作る）
  const ME = AVA ? L(state.player.name) : L('自軍'), EN = AVA ? L(state.ai.name) : L('敵');
  const KIND = { ai: AVA ? EN : 'AI', player: ME, fire: L('射撃'), cc: L('白兵戦'), msg: '' };
  const turns = [...byTurn.keys()].sort((a, b) => a - b).map(t => {
    const evs = byTurn.get(t);
    const who = evs[0] && evs[0].side === 'ai' ? (AVA ? EN : L('敵') + ' (' + L(state.ai.name) + ')') : (AVA ? ME : L('自軍') + ' (' + L(state.player.name) + ')');
    return `<details${t === [...byTurn.keys()].pop() ? ' open' : ''}><summary>${esc(L('手番'))} ${t + 1}: ${esc(who)}</summary><ul>` +
      evs.map(e => `<li class="k-${e.kind}">${KIND[e.kind] ? '<b>' + esc(KIND[e.kind]) + '</b> ' : ''}${esc(L(e.text))}</li>`).join('') + '</ul></details>';
  }).join('');
  const result = state._ufEndText || '';
  return `<!doctype html>
<html lang="${en ? 'en' : 'ja'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Up Front ${esc(L('対戦レポート'))}</title>
<style>
:root{ --bg:#f6f7f9; --card:#fff; --fg:#1d2330; --mute:#667085; --line:#d9dee7; --ai:#b42318; --me:#1f5fbf; }
@media (prefers-color-scheme: dark){ :root{ --bg:#14171d; --card:#1d222b; --fg:#e6e9ef; --mute:#98a2b3; --line:#2f3642; --ai:#ff7a6e; --me:#6ea8ff; } }
*{ box-sizing:border-box; } body{ margin:0; background:var(--bg); color:var(--fg); font:14px/1.6 -apple-system,"Helvetica Neue",Arial,"Hiragino Sans",sans-serif; }
.wrap{ max-width:900px; margin:0 auto; padding:16px; } h1{ font-size:20px; margin:0 0 4px; } h2{ font-size:16px; margin:20px 0 8px; }
.card{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 12px; overflow-x:auto; }
table{ border-collapse:collapse; width:100%; } th,td{ border-bottom:1px solid var(--line); padding:5px 6px; text-align:left; vertical-align:top; }
th{ white-space:nowrap; color:var(--mute); font-weight:normal; } .res{ font-size:16px; font-weight:bold; margin:6px 0; }
details{ border-bottom:1px solid var(--line); padding:4px 0; } summary{ cursor:pointer; font-weight:bold; }
ul{ margin:4px 0 6px; padding-left:20px; } li{ margin:2px 0; } .k-ai b{ color:var(--ai); } .k-player b{ color:var(--me); } .k-msg{ color:var(--mute); }
.nav{ display:flex; align-items:center; gap:8px; margin:4px 0 10px; } .nav button{ padding:4px 12px; flex:none; width:7em; } #nLbl{ margin-left:6px; }
.grid{ display:grid; gap:6px; } .gbox{ border:2px solid var(--line); border-radius:6px; padding:4px 6px; min-height:40px; font-size:12px; min-width:0; overflow-wrap:anywhere; }
.gbox.ai{ border-color:var(--ai); } .gbox.me{ border-color:var(--me); } .gbox.empty{ border-style:dashed; opacity:.4; } .gbox.gone{ opacity:.5; }
.gh{ font-weight:bold; } .dist{ float:right; font-weight:normal; color:var(--mute); } .terr{ color:var(--mute); font-size:11px; }
.gbox ul{ list-style:none; padding:0; margin:2px 0 0; } .rr{ text-align:center; font-size:12px; color:var(--mute); padding:2px 0; }
.row.lbl{ font-weight:bold; margin:4px 0; } .st-ok{ } .st-pin{ color:#c49000; font-weight:bold; } .st-w{ color:#c25e00; } .st-kia{ color:#d10000; text-decoration:line-through; }
.st-rout{ color:#888; text-decoration:line-through; } .st-pris{ color:#7a2fc0; text-decoration:line-through; } .legend span{ margin-right:10px; font-size:12px; }
ul.ev li.ai{ color:var(--ai); } ul.ev li.player{ color:var(--me); }
</style></head><body><div class="wrap">
<!--META ${JSON.stringify({ v: 1, aiVsAi: AVA, date: new Date().toISOString(), scenario: sc ? sc.id : '', scenarioName: sc ? sc.name : '',
  p1: state.player.name, p2: state.ai.name, result: state._ufEndText || '', turns: state.turnCount || 0, vp: [vpP, vpA],
  loss: [cP.kia + cP.rout + cP.prisoner, cA.kia + cA.rout + cA.prisoner] }).replace(/--/g, '\\u002d\\u002d')}-->
<h1>Up Front ${esc(L('対戦レポート'))}${AVA ? '（AI 対 AI）' : ''}</h1>
<h2>${esc(L('盤面と出来事'))}</h2>
<div class="card"><div class="nav"><button id="bPrev">◀ ${esc(L('前へ'))}</button><button id="bNext">${esc(L('次へ'))} ▶</button><span id="nLbl"></span></div>
<div id="board"></div><div id="evs"></div>
<div class="legend">${['ok:無事', 'pin:ピン', 'w:負傷', 'kia:戦死', 'rout:敗走', 'pris:捕虜'].map(x => { const [k, v] = x.split(':'); return `<span class="st-${k}">${esc(L(v))}</span>`; }).join(' ')}</div></div>
<h2>${esc(L('結果'))}</h2>
<div class="card"><div class="res">${esc(L(result))}</div>
<table>
${row('シナリオ', sc ? `${sc.id}: ${sc.name}` : '-', state.isNight ? '夜間' : '昼間')}
<tr><th></th><td><b>${esc(ME)}</b></td><td><b>${esc(EN)}${AVA ? '' : ' (AI)'}</b></td></tr>
${row('国', state.player.name, state.ai.name)}
${row('役割', state.playerRole === 'attacker' ? '攻撃側' : state.playerRole === 'defender' ? '防御側' : '-', state.aiRole === 'attacker' ? '攻撃側' : state.aiRole === 'defender' ? '防御側' : '-')}
${row('AIの性格・作戦', AVA ? `${STY[state._playerStyle] || '-'} / ${names[((state.groups.player || []).find(g => g && g._strategy) || {})._strategy] || '-'}` : '-', `${STY[state.aiStyle] || '-'} / ${names[aiStg] || '-'}`)}
${row('勝利点', vpP, vpA)}
${row('兵の数', cP.total, cA.total)}
${row('戦死', cP.kia, cA.kia)}
${row('敗走', cP.rout, cA.rout)}
${row('捕虜になった', cP.prisoner, cA.prisoner)}
${row('生存（うち負傷）', `${cP.alive}（${cP.wounded}）`, `${cA.alive}（${cA.wounded}）`)}
${row('手番の数', state.turnCount || 0, '')}
</table></div>
<h2>${esc(L('行動の回数'))}</h2>
<div class="card"><table>${row(ME, cnt(UF_REPORT.counts.player), '')}${row(AVA ? EN : '敵 (AI)', cnt(UF_REPORT.counts.ai), '')}</table></div>
<details><summary>${esc(L('詳しい記録'))}</summary><div class="card">${turns || '-'}</div></details>
<script>
const SN = ${JSON.stringify(UF_REPORT.snaps.map(sn => ({ ...sn, label: L(sn.label), p: sn.p.map(g => g && { ...g, terr: g.terr.map(L), s: g.s }), a: sn.a.map(g => g && { ...g, terr: g.terr.map(L), s: g.s }) }))).replace(/</g, '\\u003c')};
const EV = ${JSON.stringify(UF_REPORT.ev.map(e => ({ ...e, text: L(e.text) }))).replace(/</g, '\\u003c')};
const NM = ${JSON.stringify({ p: L(state.player.name), a: L(state.ai.name), me: ME, en: EN, turn: L('手番'), rr: L('相対距離'), dist: L('距離'), mv: L('移動中'), gone: L('消滅'), none: L('なし'), inf: L('侵入') })};
let k = SN.length - 1;
const esc2 = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function rr(a, b){ let s = (a|0) + (b|0); if (s > 5) s = 10 - s; return Math.max(0, s); }
function box(g, who){
  if (!g) return '<div class="gbox empty"></div>';
  const st = g.s.map(x => '<li class="st-' + (x.w && (x.st === 'ok' || x.st === 'pin') ? 'w' : x.st) + '">' + esc2(x.n) + (x.st === 'pin' ? ' (PIN)' : '') + (x.inf ? ' [' + NM.inf + ']' : '') + '</li>').join('');
  return '<div class="gbox ' + who + (g.e ? ' gone' : '') + '"><div class="gh">GROUP ' + esc2(g.n) + ' <span class="dist">' + NM.dist + ' ' + g.d + '</span></div>'
    + '<div class="terr">' + esc2((g.terr.length ? g.terr.join('・') : NM.none) + (g.moving ? ' / ' + NM.mv : '')) + (g.e ? ' / ' + NM.gone : '') + '</div><ul>' + st + '</ul></div>';
}
function render(){
  const sn = SN[k];
  document.getElementById('nLbl').textContent = (sn.t >= 0 ? NM.turn + ' ' + (sn.t + 1) + '　' : '') + sn.label + '（' + (k + 1) + '/' + SN.length + '）';
  const n = Math.max(sn.p.length, sn.a.length, 1);
  let h = '<div class="row lbl">' + NM.en + '（' + esc2(NM.a) + '）</div><div class="grid" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">';
  for (let i = 0; i < n; i++) h += box(sn.a[i], 'ai');
  for (let i = 0; i < n; i++) { const a = sn.a[i], p = sn.p[i]; h += '<div class="rr">' + (a && p && !a.e && !p.e ? NM.rr + ' ' + rr(a.d, p.d) : '') + '</div>'; }
  for (let i = 0; i < n; i++) h += box(sn.p[i], 'me');
  h += '</div><div class="row lbl">' + NM.me + '（' + esc2(NM.p) + '）</div>';
  document.getElementById('board').innerHTML = h;
  const prevT = k > 0 ? SN[k - 1].t : -1;
  const evs = k === 0 ? [] : EV.filter(e => e.t > prevT && e.t <= sn.t); // 前の盤面より後で、この盤面まで
  document.getElementById('evs').innerHTML = evs.length ? '<ul class="ev">' + evs.map(e => '<li class="' + e.side + '">' + (e.side === 'ai' ? NM.en : NM.me) + '：' + esc2(e.text) + '</li>').join('') + '</ul>' : '';
  document.getElementById('bPrev').disabled = k <= 0; document.getElementById('bNext').disabled = k >= SN.length - 1;
}
document.getElementById('bPrev').onclick = () => { if (k > 0) { k--; render(); } };
document.getElementById('bNext').onclick = () => { if (k < SN.length - 1) { k++; render(); } };
k = 0; if (SN.length) render();
<\/script>
</div></body></html>`;
}
function ufSaveReport() {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const name = `upfront_report_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.html`;
  const blob = new Blob([ufBuildReportHtml()], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
/** ゲーム終了の画面（結果と「レポートを保存」） */
function ufShowGameOver() {
  if (window.__HEADLESS) return;
  let el = document.getElementById('ufGameOver');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ufGameOver';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:2950;';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div style="background:#2a2a2a;border:2px solid #aaa;border-radius:8px;padding:18px 22px;min-width:320px;max-width:90vw;text-align:center;color:#eee;">
    <div style="font-size:18px;font-weight:bold;color:#ffeb3b;margin-bottom:8px;">ゲーム終了</div>
    <div style="margin:8px 0 12px;">${_ufStrip(state._ufEndText || '')}</div>
    <div style="font-size:12px;color:#ccc;margin-bottom:12px;">勝敗・損害・行動の回数・手番ごとの出来事のレポートを、このパソコンに保存できます。</div>
    <button class="action-btn" style="width:auto;height:auto;padding:6px 16px;font-size:14px;background:#2266cc;" onclick="ufSaveReport()">レポートを保存</button>
    <button class="action-btn" style="width:auto;height:auto;padding:6px 16px;font-size:14px;margin-left:8px;" onclick="document.getElementById('ufGameOver').remove()">閉じる</button>
  </div>`;
}
/** 投了: 負けを認めてゲームを終わる（AIの勝ち）。ここまでのレポートを保存できる */
// ===== 途中セーブ・ロード（ファイルに書き出し、ファイルから読み込む） =====
// 自分の手番の間（アクションの途中でないとき）にセーブできる。
// 同じ物を指している所（手札・グループ・カードなど）はそのつながりのまま保存し、
// 国・シナリオ・地形カード表・兵士カード表は名前で保存して、読み込み時に元の物を指し直す。
const UF_SAVE_VERSION = 1;
// セーブ・ロードの知らせは対戦レポートに残さない（alert は対戦レポートに記録されるため、記録した分を戻す）
function ufSaveAlert(msg) {
  const ev = UF_REPORT.events, n = ev ? ev.length : 0;
  alert(msg);
  if (UF_REPORT.events === ev && ev) ev.length = n;
}
function ufSaveExtRefs() {
  const m = new Map();
  Object.keys(FACTIONS).forEach(k => m.set(FACTIONS[k], 'F:' + k));
  const sc = window.SCENARIOS || {};
  Object.keys(sc).forEach(k => { if (sc[k] && typeof sc[k] === 'object') m.set(sc[k], 'S:' + k); });
  TERRAIN_CARDS.forEach((c, i) => { if (c && typeof c === 'object') m.set(c, 'T:' + i); });
  Object.keys(SOLDIER_CARDS).forEach(f => (SOLDIER_CARDS[f] || []).forEach((c, i) => { if (c && typeof c === 'object') m.set(c, 'P:' + f + ':' + i); }));
  return m;
}
function ufSaveResolveExt(key) {
  const p = key.split(':');
  if (p[0] === 'F') return FACTIONS[p[1]];
  if (p[0] === 'S') return (window.SCENARIOS || {})[p[1]];
  if (p[0] === 'T') return TERRAIN_CARDS[+p[1]];
  if (p[0] === 'P') return (SOLDIER_CARDS[p[1]] || [])[+p[2]];
  return null;
}
function ufSaveEncode(root) {
  const ext = ufSaveExtRefs(), ids = new Map();
  let n = 0;
  const enc = v => {
    if (typeof v === 'function' || typeof v === 'symbol') return undefined;
    if (typeof v === 'number' && !isFinite(v)) return { $num: String(v) };
    if (v === null || typeof v !== 'object') return v;
    if (ext.has(v)) return { $ext: ext.get(v) };
    if (typeof Node !== 'undefined' && v instanceof Node) return null;
    if (ids.has(v)) return { $ref: ids.get(v) };
    const id = n++; ids.set(v, id);
    if (Array.isArray(v)) return { $id: id, $arr: v.map(x => { const e = enc(x); return e === undefined ? null : e; }) };
    if (v instanceof Set) return { $id: id, $set: [...v].map(enc) };
    if (v instanceof Map) return { $id: id, $map: [...v].map(([k, x]) => [enc(k), enc(x)]) };
    const o = {};
    Object.keys(v).forEach(k => { const e = enc(v[k]); if (e !== undefined) o[k] = e; });
    return { $id: id, $obj: o };
  };
  return enc(root);
}
function ufSaveDecode(d) {
  const objs = [];
  const dec = v => {
    if (v === null || typeof v !== 'object') return v;
    if ('$num' in v) return Number(v.$num);
    if ('$ext' in v) return ufSaveResolveExt(v.$ext);
    if ('$ref' in v) return objs[v.$ref];
    if ('$arr' in v) { const a = []; objs[v.$id] = a; v.$arr.forEach(x => a.push(dec(x))); return a; }
    if ('$set' in v) { const s = new Set(); objs[v.$id] = s; v.$set.forEach(x => s.add(dec(x))); return s; }
    if ('$map' in v) { const m = new Map(); objs[v.$id] = m; v.$map.forEach(([k, x]) => m.set(dec(k), dec(x))); return m; }
    const o = {}; objs[v.$id] = o;
    Object.keys(v.$obj).forEach(k => { o[k] = dec(v.$obj[k]); });
    return o;
  };
  return dec(d);
}
// アクションの途中（選んだ行動・射撃元・目標などが残っている）か
function ufActionInProgress() {
  return !!(state.selectedAction || state.fireSource || state.fireTarget || state.sniperTarget || state.woundCheckPending);
}
function ufSaveBlockedReason() {
  if (!state.player || state.phase !== 'play' || state.currentTurn !== 'player') return '自分の手番の間だけセーブできます';
  if (ufActionInProgress()) return 'アクションの途中ではセーブできません。アクションを終えるか取り消してからセーブしてください';
  return null;
}
function ufBuildSaveData() {
  return {
    game: 'up-front', version: UF_SAVE_VERSION, savedAt: new Date().toISOString(),
    data: ufSaveEncode({
      state, report: UF_REPORT,
      discard: (window.DISCARD_RULES && window.DISCARD_RULES.getState) ? window.DISCARD_RULES.getState() : null,
    }),
  };
}
function ufSaveGame() {
  const why = ufSaveBlockedReason();
  if (why) { ufSaveAlert(why); return; }
  const blob = new Blob([JSON.stringify(ufBuildSaveData())], { type: 'application/json' });
  const d = new Date(), p = x => String(x).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `upfront_save_${getFactionKey(state.player)}_${(state.scenario && state.scenario.id) || ''}_T${(state.turnCount || 0) + 1}_${ts}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function ufPickLoad() {
  // 相手の手番やアクションの途中に読み込むと、進行中の処理と食い違うので止める
  if (state.player && state.phase !== 'gameover') {
    if (state.phase !== 'play' || state.currentTurn !== 'player') { ufSaveAlert('自分の手番の間だけロードできます'); return; }
    if (ufActionInProgress()) { ufSaveAlert('アクションの途中ではロードできません。アクションを終えるか取り消してからロードしてください'); return; }
  }
  const inp = document.getElementById('uf-load-file');
  inp.value = '';
  inp.click();
}
function ufLoadFromFile(inp) {
  const f = inp.files && inp.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    let saved;
    try { saved = JSON.parse(reader.result); } catch (e) { ufSaveAlert('セーブファイルを読み込めませんでした'); return; }
    if (!saved || saved.game !== 'up-front' || !saved.data) { ufSaveAlert('アップフロントのセーブファイルではありません'); return; }
    ufApplySaveData(saved);
  };
  reader.readAsText(f);
}
function ufApplySaveData(saved) {
  const all = ufSaveDecode(saved.data);
  // state・レポートは同じ物を使い続ける（他のファイルから参照されているため中身だけ入れ替える）
  Object.keys(state).forEach(k => { delete state[k]; });
  Object.assign(state, all.state);
  Object.keys(UF_REPORT).forEach(k => { delete UF_REPORT[k]; });
  Object.assign(UF_REPORT, all.report);
  if (window.DISCARD_RULES && window.DISCARD_RULES.setState) window.DISCARD_RULES.setState(all.discard);
  // 選択中の物は持ち越さない
  state.selectedAction = null;
  state.selectedHand = new Set();
  state.fireSource = null;
  state.fireTarget = null;
  state.sniperTarget = null;
  state.terrainSelected = null;
  _lastActingGroupIdx = null;
  // 画面をゲーム画面にして描き直す
  document.getElementById('faction-select').style.display = 'none';
  ['setup-screen', 'campaign-screen', 'phase-banner'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
  const go = document.getElementById('ufGameOver'); if (go) go.remove();
  document.getElementById('game').classList.add('active');
  document.getElementById('player-name').textContent = state.player.flag + ' ' + state.player.name;
  document.getElementById('ai-name').textContent     = state.ai.flag + ' ' + state.ai.name;
  document.getElementById('player-hand-max').textContent  = state.player.handMax;
  document.getElementById('player-hand-draw').textContent = state.player.handDraw;
  document.getElementById('ai-hand-max').textContent      = state.ai.handMax;
  document.getElementById('ai-hand-draw').textContent     = state.ai.handDraw;
  document.querySelectorAll('.action-btn').forEach(b => { b.classList.remove('active'); b.disabled = false; });
  updateCommissarMarker('player');
  updateCommissarMarker('ai');
  renderField('player');
  renderField('ai');
  renderHands();
  updateDeckCounts();
  updateConfirmBtn();
  ufSaveAlert('ロードしました');
  if (state.phase === 'gameover') ufShowGameOver();
}

function ufResign() {
  if (state.phase === 'gameover') { ufShowGameOver(); return; }
  if (state.phase !== 'play') return;
  if (!confirm('投了しますか？（AI の勝ちとしてゲームを終わり、ここまでのレポートを保存できます）')) return;
  state.phase = 'gameover';
  state._ufEndText = `${state.player.name} の投了（手番 ${(state.turnCount || 0) + 1}）— ${state.ai.name} の勝利`;
  if (typeof endCampaignScenario === 'function') endCampaignScenario('ai');
  state._ufReportShown = true;
  try { ufSnapshot('終了時（投了）', ''); } catch (e) {}
  ufShowGameOver();
}

function startGameWithSetup() {
  state.campaignEnded = false; // 新シナリオ開始: 終了フラグリセット
  ufReportReset(); state._ufEndText = ''; state._ufReportShown = false; // 対戦レポートの記録を空に
  state.isCampaign = !!setupState.fromCampaign; // キャンペーン編成から始めた時だけ true
  const playerFaction = setupState.faction;
  const scenario = setupState.scenario;
  state.player = FACTIONS[playerFaction];
  const others = Object.keys(FACTIONS).filter(k => k !== playerFaction);
  // 敵の陣営: キャンペーンで決めた国、それ以外（通常の対戦）は自分以外の国からランダム
  // シナリオの国の制限（シナリオE）
  { const _only = setupState.scenario && setupState.scenario.onlyFactions; if (_only) { const _keep = others.filter(f => _only.indexOf(f) >= 0); others.length = 0; _keep.forEach(f => others.push(f)); } }
  const aiKey = (setupState.aiFactionOverride && others.indexOf(setupState.aiFactionOverride) >= 0)
    ? setupState.aiFactionOverride : others[Math.floor(Math.random() * others.length)];
  state.ai = FACTIONS[aiKey];
  setupState.aiFactionOverride = null;
  state.scenario = scenario;
  // 時間帯選択（昼/夜）
  const _todPick = document.getElementById('time-of-day-pick');
  state.isNight = !!(_todPick && _todPick.value === 'night');
  // 非対称シナリオの先攻選択を保存
  if (scenario && scenario.asymmetric) {
    const fpPick = document.getElementById('first-player-pick');
    state.firstSideOverride = (fpPick && fpPick.value) ? fpPick.value : 'player';
  } else {
    state.firstSideOverride = null;
  }

  const NAMES = ['A','B','C','D'];
  state.groups.player = setupState.groups
    .map((nums, gi) => ({
      name: NAMES[gi],
      cards: nums.map(num => {
        const card = makeCardWithMeta(playerFaction, num);
        const key = `${gi}:${num}`;
        if (setupState.demoHolders && setupState.demoHolders.has(key)) {
          card.demoCharge = true;
        }
        return card;
      }),
      distance: 0,
      terrain: [],
      actions: [],
      _faction: playerFaction,
      crewPairs: extractGroupCrewPairs(gi),
    }))
    .filter(g => g.cards.length > 0);
  // §42 キャンペーン: 記録にある能力値（モラル・パニック・KIA・CCV）を戦闘で使う
  if (state.isCampaign) applyCampaignStats(playerFaction);
  // AIの性格をゲーム開始時にくじで決める（ソ連・日本は攻撃的、ドイツはバランス、米・英は防御的が出やすい）
  state.aiStyle = drawAIStyle(aiKey);

  // AI は賢い編成 (リーダー分散 + クルー指定)
  // 非対称シナリオでは、プレイヤーの役割と逆の役割を AI に割当
  const aiRole = setupState.role === 'attacker' ? 'defender' : (setupState.role === 'defender' ? 'attacker' : undefined);
  state.groups.ai = (window.SCENARIO_HELPERS && scenario)
    ? window.SCENARIO_HELPERS.buildAIGroupsSmart(scenario, aiKey, aiRole, state.aiStyle)
    : [];
  state.playerRole = setupState.role || null;
  state.aiRole = aiRole || null;
  // シナリオC 守備側: Bグループは最大3名にリバランス（機関銃を優先的にBに残す）
  if (scenario && scenario.id === 'C' && aiRole === 'defender') {
    const bGroup = state.groups.ai.find(g => g.name === 'B');
    if (bGroup) {
      const R = window.INFANTRY_RULES;
      const isMG = (card) => {
        const def = R && R.lookupSoldier ? R.lookupSoldier(card, aiKey) : null;
        return !!(def && def.weaponCat && def.weaponCat.indexOf('機関銃') >= 0);
      };
      // AI 全グループから機関銃を集める
      const allCards = [];
      state.groups.ai.forEach(g => { g.cards.forEach(c => allCards.push({ card: c, srcGroup: g })); });
      const mgCards = allCards.filter(x => isMG(x.card));
      // Bグループに機関銃を最大3まで集める
      const bMGCount = bGroup.cards.filter(c => isMG(c)).length;
      const needMore = Math.max(0, Math.min(3, mgCards.length) - bMGCount);
      if (needMore > 0) {
        // 他グループにいる機関銃を Bグループに移す
        const externalMGs = mgCards.filter(x => x.srcGroup !== bGroup).slice(0, needMore);
        externalMGs.forEach(x => {
          const idx = x.srcGroup.cards.indexOf(x.card);
          if (idx >= 0) x.srcGroup.cards.splice(idx, 1);
          bGroup.cards.push(x.card);
        });
      }
      // Bグループが3名超なら、機関銃以外を優先して他グループへ移す
      while (bGroup.cards.length > 3) {
        const otherGroups = state.groups.ai.filter(g => g.name !== 'B');
        if (otherGroups.length === 0) break;
        const nonMGIdx = bGroup.cards.findIndex(c => !isMG(c));
        const removeIdx = nonMGIdx >= 0 ? nonMGIdx : (bGroup.cards.length - 1);
        const removed = bGroup.cards.splice(removeIdx, 1)[0];
        // 一番少ない他グループへ
        otherGroups.sort((a, b) => a.cards.length - b.cards.length);
        otherGroups[0].cards.push(removed);
      }
      // §23.3 トーチカを占拠できない兵器の兵士は、他グループの兵士と入れ替える
      const forb = c => { const d = R && R.lookupSoldier ? R.lookupSoldier(c, aiKey) : null; return !!(d && pillboxForbiddenWeapon(d.weaponCat)); };
      bGroup.cards.slice().forEach(c => {
        if (!forb(c)) return;
        const other = state.groups.ai.find(g => g.name !== 'B' && g.cards.some(x => !forb(x)));
        if (!other) return;
        const swapIdx = other.cards.findIndex(x => !forb(x));
        const swapCard = other.cards.splice(swapIdx, 1)[0];
        bGroup.cards.splice(bGroup.cards.indexOf(c), 1, swapCard);
        other.cards.push(c);
      });
      // リバランスで兵士が移動したので crewPairs を全クリア → initAICrewPairs で再設定
      state.groups.ai.forEach(g => { g.crewPairs = {}; });
    }
  }
  // AI 初期クルー設定 (needsCrew 全兵士にアシスタント自動割当)
  initAICrewPairs();

  // 爆薬の割当
  if (scenario && scenario.id === 'C') {
    // シナリオC: 爆薬は攻撃側のBグループに1つのみ（防御側は無し）
    // プレイヤー側: setup-screen で爆薬保有兵士を指定済みなら尊重、未指定ならBグループ先頭にフォールバック
    if (state.playerRole === 'attacker') {
      const hasUserDemo = state.groups.player.some(g => g.cards.some(c => c.demoCharge));
      if (!hasUserDemo) {
        const bGroup = state.groups.player.find(g => g.name === 'B');
        if (bGroup && bGroup.cards.length > 0) bGroup.cards[0].demoCharge = true;
      }
    } else {
      // プレイヤーが防御側の場合、誤って付与された demoCharge をクリア
      state.groups.player.forEach(g => g.cards.forEach(c => { delete c.demoCharge; }));
    }
    // AI 側: 攻撃側ならBグループ先頭にのみ付与（setup-screen なし）
    state.groups.ai.forEach(g => g.cards.forEach(c => { delete c.demoCharge; }));
    if (aiRole === 'attacker') {
      aiGiveDemoCharge(aiKey);
    }
  } else if (scenario && scenario.id === 'B') {
    // シナリオB: 爆薬は 1つ（ルールの部隊表）
    state.groups.ai.forEach(g => g.cards.forEach(c => { delete c.demoCharge; }));
    aiGiveDemoCharge(aiKey);
  }

  // 初期兵士数を記録（敗北判定用）
  state.initialSoldierCount = {
    player: state.groups.player.reduce((s, g) => s + g.cards.length, 0),
    ai: state.groups.ai.reduce((s, g) => s + g.cards.length, 0),
  };

  state.playerHand = [];
  state.aiHand = [];
  state.aiHandCount = state.ai.handMax;
  if (TERRAIN_CARDS.length > 0) {
    initTerrainDeck();
    for (let i = 0; i < state.player.handMax; i++) {
      const c = drawTerrainCard();
      if (c) state.playerHand.push(c);
    }
    for (let i = 0; i < state.ai.handMax; i++) {
      const c = drawTerrainCard();
      if (c) state.aiHand.push(c);
    }
    // シナリオC: 防御側のグループBにトーチカを初期配置（§C.1）
    if (scenario && scenario.initialTerrain && scenario.initialTerrain.defender) {
      const defenderSide = state.playerRole === 'defender' ? 'player' : 'ai';
      scenario.initialTerrain.defender.forEach(item => {
        const grp = state.groups[defenderSide].find(g => g.name === item.groupName);
        if (!grp || !state.terrainDeck) return;
        const d = state.terrainDeck;
        const tIdx = d.draw.findIndex(ti => TERRAIN_CARDS[ti] && TERRAIN_CARDS[ti].type === item.type);
        if (tIdx >= 0) {
          const ti = d.draw.splice(tIdx, 1)[0];
          grp.terrain.push(makeTerrainHandCard(ti));
        }
      });
    }
  }

  document.getElementById('faction-select').style.display = 'none';
  document.getElementById('game').classList.add('active');
  document.getElementById('player-name').textContent = state.player.flag + ' ' + state.player.name;
  document.getElementById('ai-name').textContent     = state.ai.flag + ' ' + state.ai.name;
  document.getElementById('player-hand-max').textContent  = state.player.handMax;
  document.getElementById('player-hand-draw').textContent = state.player.handDraw;
  document.getElementById('ai-hand-max').textContent      = state.ai.handMax;
  document.getElementById('ai-hand-draw').textContent     = state.ai.handDraw;
  renderField('player');
  renderField('ai');
  renderHands();

  // §3.6 開始時の地形交互配置フェーズ
  startTerrainPlacementPhase();
}

function makeCardWithMeta(factionKey, num) {
  const fac = FACTIONS[factionKey];
  let prefix = fac.prefix;
  if (factionKey === 'rus') prefix = num <= 30 ? 'russian' : 'Rus';
  return {
    id: `${prefix} ${num}`,
    num,
    img:     encPath(`${fac.dir}/${prefix} ${num}f.gif`),
    imgBack: encPath(`${fac.dir}/${prefix} ${num}b.gif`),
  };
}

// セットアップのcrewPairs (グループ:番号 形式) からこのグループ分だけ抽出
/** AI の爆薬: 移動グループ（火炎放射器のいないほうを優先）の、持てる兵（§21.1）のうち士気の一番高い兵に渡す */
function aiGiveDemoCharge(aiKey) {
  const R = window.INFANTRY_RULES;
  const isFlame = c => { const d = R.lookupSoldier(c, aiKey); return !!(d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0); };
  const man = state.groups.ai.filter(g => g._role === 'maneuver' || g._role === 'assault');
  const order = man.filter(g => !g.cards.some(isFlame)).concat(man.filter(g => g.cards.some(isFlame)), state.groups.ai);
  const morale = c => { const d = R.lookupSoldier(c, aiKey); return d ? (parseInt(d.morale, 10) || 0) : 0; };
  const isLd = c => { const d = R.lookupSoldier(c, aiKey); return !!(d && d.leader && d.leader.trim()); };
  for (const g of order) {
    const list = g.cards.filter(c => demoEligible(c, aiKey)).sort((a, b) => (isLd(a) - isLd(b)) || (morale(b) - morale(a)));
    if (list.length) { list[0].demoCharge = true; return; }
  }
}

function extractGroupCrewPairs(groupIdx) {
  const out = {}; // ownerNum → assistantNum
  Object.keys(setupState.crewPairs).forEach(k => {
    const [g, n] = k.split(':').map(Number);
    if (g !== groupIdx) return;
    const v = setupState.crewPairs[k];
    const [ag, an] = v.split(':').map(Number);
    if (ag !== groupIdx) return;
    out[n] = an;
  });
  return out;
}

/** AI 全グループに対し、needsCrew 兵士全員にアシスタントを自動割当する（初期化用） */
function initAICrewPairs() {
  const R = window.INFANTRY_RULES;
  if (!R || !state.groups || !state.groups.ai) return;
  const aiKey = getFactionKey(state.ai);
  if (!aiKey) return;
  state.groups.ai.forEach(grp => {
    if (!grp || grp.eliminated) return;
    if (!grp.crewPairs) grp.crewPairs = {};
    grp.cards.forEach(card => {
      if (!R.isAlive(card)) return;
      const def = R.lookupSoldier(card, aiKey);
      if (!def || !def.needsCrew) return;
      if (grp.crewPairs[card.num] != null) return;
      const usedNums = new Set(Object.values(grp.crewPairs));
      // 非クルー兵器の兵士をアシスタントに（リーダーも可、buildAIGroupsSmart と統一）
      const candidate = grp.cards.find(c2 => {
        if (c2 === card) return false;
        if (!R.isAlive(c2)) return false;
        if (c2.num != null && usedNums.has(c2.num)) return false;
        const d2 = R.lookupSoldier(c2, aiKey);
        if (!d2) return false;
        if (d2.needsCrew) return false;
        return true;
      });
      if (candidate && candidate.num != null) {
        grp.crewPairs[card.num] = candidate.num;
      }
    });
  });
}

function startGame(playerFaction) {
  state.campaignEnded = false; // 新シナリオ開始: 終了フラグリセット
  ufReportReset(); state._ufEndText = ''; state._ufReportShown = false; // 対戦レポートの記録を空に
  state.player = FACTIONS[playerFaction];
  const others = Object.keys(FACTIONS).filter(k => k !== playerFaction);
  state.ai = FACTIONS[others[0]];

  // 選択中のシナリオから初期グループを生成
  const scenarioId = (document.getElementById('scenario-pick') || {}).value || 'A';
  const scenario = (window.SCENARIOS || {})[scenarioId];
  state.scenario = scenario || null;
  // 時間帯選択（昼/夜）
  const _todPick2 = document.getElementById('time-of-day-pick');
  state.isNight = !!(_todPick2 && _todPick2.value === 'night');

  if (scenario && window.SCENARIO_HELPERS) {
    state.groups.player = window.SCENARIO_HELPERS.buildInitialGroups(scenario, playerFaction);
    state.groups.ai     = window.SCENARIO_HELPERS.buildInitialGroups(scenario, others[0]);
  } else {
    state.groups.player = INITIAL_GROUP_NAMES.map(n => ({ name: n, cards: [], distance: 0, terrain: [], actions: [], _faction: playerFaction }));
    state.groups.ai     = INITIAL_GROUP_NAMES.map(n => ({ name: n, cards: [], distance: 0, terrain: [], actions: [], _faction: others[0] }));
  }

  state.initialSoldierCount = {
    player: state.groups.player.reduce((s, g) => s + g.cards.length, 0),
    ai: state.groups.ai.reduce((s, g) => s + g.cards.length, 0),
  };

  // AI 初期クルー設定
  initAICrewPairs();

  // 手札 (地形/アクションデッキから)
  state.playerHand = [];
  state.aiHandCount = state.ai.handMax;
  // CSV読込待ちの場合もあるので、可能ならいくつか引いておく
  if (TERRAIN_CARDS.length > 0) {
    initTerrainDeck();
    for (let i = 0; i < state.player.handMax; i++) {
      const c = drawTerrainCard();
      if (c) state.playerHand.push(c);
    }
  }

  document.getElementById('faction-select').style.display = 'none';
  document.getElementById('game').classList.add('active');

  document.getElementById('player-name').textContent = state.player.flag + ' ' + state.player.name;
  document.getElementById('ai-name').textContent     = state.ai.flag + ' ' + state.ai.name;
  document.getElementById('player-hand-max').textContent  = state.player.handMax;
  document.getElementById('player-hand-draw').textContent = state.player.handDraw;
  document.getElementById('ai-hand-max').textContent      = state.ai.handMax;
  document.getElementById('ai-hand-draw').textContent     = state.ai.handDraw;

  renderField('player');
  renderField('ai');
  renderHands();
}

// 丸数字 → 数値 (①〜⑳)
function circledToNum(ch) {
  if (!ch) return 0;
  const code = ch.charCodeAt(0);
  if (code >= 0x2460 && code <= 0x2473) return code - 0x2460 + 1;
  const n = parseInt(ch, 10);
  return isNaN(n) ? 0 : n;
}
// "FP①" などから FP 値を抽出
function extractFP(sub) {
  if (!sub) return 0;
  const m = sub.match(/FP(.)/);
  return m ? circledToNum(m[1]) : 0;
}

function makeTerrainHandCard(terrainIndex) {
  const t = TERRAIN_CARDS[terrainIndex];
  if (!t) return null;
  return {
    id: `AD ${t.num}`,
    img: t.img,
    imgBack: t.imgBack,
    terrain: t,
    terrainIndex,
    fp: extractFP(t.sub),
  };
}

function drawTerrainCard() {
  if (TERRAIN_CARDS.length === 0) return null;
  ensureTerrainDeck();
  const d = state.terrainDeck;
  if (!d || d.gameOver) return null;
  const lim = getScenarioDeckCycles();
  if (d.draw.length === 0) {
    if (d.discard.length === 0) return null;
    if (d.cycle >= lim) {
      // §16.3 最後の山札が攻撃解決の途中でなくなった時は、捨て札をもう一度混ぜて今の攻撃を最後まで解決し、
      // それが終わった時点でゲーム終了（今の一連の処理が終わってから終了処理を行う）
      if (d.finalExtension) { showTerrainDeckGameOver(); return null; }
      d.finalExtension = true;
      d.draw = shuffleTerrainIndices(d.discard.slice());
      d.discard = [];
      updateDeckCounts();
      setTimeout(() => { if (!state.terrainDeck.gameOver) showTerrainDeckGameOver(); }, 0);
      const tiX = d.draw.shift();
      updateDeckCounts();
      return makeTerrainHandCard(tiX);
    }
    d.draw = shuffleTerrainIndices(d.discard.slice());
    d.discard = [];
    d.cycle++;
    state.woundCheckPending = true; // §33.7 新しいデッキの最初のターンの開始時に負傷兵の耐久判定
    updateDeckCounts();
  }
  const ti = d.draw.shift();
  updateDeckCounts();
  return makeTerrainHandCard(ti);
}

function makeCard(faction, num) {
  return {
    id: `${faction.prefix} ${num}`,
    img:     encPath(`${faction.dir}/${faction.prefix} ${num}f.gif`),
    imgBack: encPath(`${faction.dir}/${faction.prefix} ${num}b.gif`),
  };
}

