// アップフロント 画面なし AI 対 AI 対戦
//   使い方: node sim/run.js [局数] [シナリオ] [国1] [国2]
//   例:     node sim/run.js 10 A rus ger
//   国を省くと毎局くじで決める（ger/us/rus/jpn/uk）。シナリオを省くと A。
//   両軍とも index.html の AI（aiTurn）で動かす。プレイヤー側の手番は両軍のデータを入れ替えて AI に指させる。
//   report: 対局ごとに AI 対 AI の対戦レポートを reports/ai_NNN.html に保存し、一覧のページも作り直す
//           例: node sim/run.js 3 A ger rus report
//   index:  対戦せずに、一覧のページ（reports/index.html）だけ作り直す。例: node sim/run.js index
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '../../海の戦い/sim/node_modules/jsdom'));

const FLAGS = ['report', 'index', 'night'];
const ARGS = process.argv.slice(2).filter(a => FLAGS.indexOf(a) < 0);
const REPORT = process.argv.includes('report');
const NIGHT = process.argv.includes('night'); // night: 夜間で対戦する。例: node sim/run.js 20 A ger jpn night
const N = parseInt(ARGS[0] || '5', 10);
const SCN = ARGS[1] || 'A';
const FAC1 = ARGS[2] || null;
const FAC2 = ARGS[3] || null;
const REPORT_DIR = path.join(__dirname, '../reports');
const FACS = ['ger', 'us', 'rus', 'jpn', 'uk'];
const MAX_HALF_TURNS = 400;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function playOne(gameNo) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e && (e.stack || e.message || e)).split('\n').slice(0, 3).join(' | ')));
  const alerts = [];
  const dom = await JSDOM.fromFile(path.join(__dirname, '../index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    url: 'file://' + path.join(__dirname, '../index.html') + '?lang=ja',
    beforeParse(w) {
      w.__HEADLESS = true;
      if (process.env.UF_TRAITS) w.AI_FACTION_TRAITS = JSON.parse(process.env.UF_TRAITS);
      if (process.env.UF_WEIGHTS) w.UF_CARD_WEIGHTS = JSON.parse(process.env.UF_WEIGHTS);
      if (process.env.UF_VALUE_FACTION) w.UF_VALUE_FACTION = process.env.UF_VALUE_FACTION;
      if (process.env.UF_BOTH_AFV) w.UF_BOTH_AFV = true;
      if (process.env.UF_AFV_POLICY) w.AFV_POLICY = JSON.parse(process.env.UF_AFV_POLICY);
      w.alert = m => { alerts.push(String(m)); };
      w.confirm = () => false;  // 確認は「いいえ」（捕獲しない・参加させない等）
      w.prompt = () => null;
      const st = w.setTimeout.bind(w);
      w.setTimeout = (f, ms, ...a) => st(f, 0, ...a);
      try { w.localStorage.setItem('ufLang', 'ja'); } catch (e) {}
    },
  });
  const w = dom.window;
  await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });
  await sleep(50);

  // ---- 画面の操作を待つ処理を差し替え ----
  w.eval(`
    window.__acts = {};
    window.showAIAction = async (t) => { const k = String(t).replace(/^AI: /, '').split(/[ →]/)[0]; window.__acts[k] = (window.__acts[k] || 0) + 1; };
    window._showAIActionImpl = async () => {};
    window.showFireResultOverlay = async () => {};
    window.showJudgeCard = () => {};
    // 相手の手番中のプレイヤー側の判断は AI と同じ考え方で自動
    window.askPlayerConcealment = async () => {
      const i = state.playerHand.findIndex(c => c && c.terrain && c.terrain.type === 'CONCEALED');
      if (i < 0) return [];
      const c = state.playerHand.splice(i, 1)[0]; pushTerrainToDiscard(c); return [c];
    };
    window.askPlayerHeroRally = async (g) => {
      const R = window.INFANTRY_RULES;
      const hi = state.playerHand.findIndex(c => c && c.terrain && c.terrain.type === 'HERO');
      const p = g && g.cards.find(c => R.isAlive(c) && R.isPinned(c));
      if (hi < 0 || !p) return;
      pushTerrainToDiscard(state.playerHand.splice(hi, 1)[0]); R.unpinSoldier(p);
    };
    // 置かれた地形は受け入れる（拒否はしない）
    window.askTerrainRefusal = async (grp, terrainCard) => {
      const tType = terrainCard.terrain && terrainCard.terrain.type;
      const isOverlay = tType === 'SMOKE' || tType === 'WIRE';
      if (!isOverlay) {
        removeSmokeFromGroup(grp, 'player', '地形カードを配置');
        while (grp.terrain.length > 0) pushTerrainToDiscard(grp.terrain.pop());
      }
      pushTerrainWithFaction(grp, terrainCard);
      if (tType === 'MINEFIELD') triggerMinefieldAttack(grp, terrainCard, 'player');
      return 'accept';
    };
    window.__sim = { result: null, swapped: false, running: false };
    window.endCampaignScenario = function (winner) {
      if (window.__sim.result) return;
      const real = window.__sim.swapped ? (winner === 'player' ? 'ai' : 'player') : winner;
      window.__sim.result = { winner: real };
    };
    const _origAiTurn = aiTurn;
    window.__runAI = async () => {
      if (window.__sim.running) return;
      window.__sim.running = true;
      try { await _origAiTurn(); } finally { window.__sim.running = false; }
    };
    window.aiTurn = window.__runAI;
    if (${REPORT}) {
      // 対戦レポート用: AI の行動と射撃の結果も記録し、両軍を入れ替えている間（国1の手番）の記録は国1の側として付け直す
      window.showAIAction = async (m) => { try { const me = window.__sim && window.__sim.swapped; ufReportLog(me ? 'player' : 'ai', m, me ? 'player' : 'ai'); } catch (e) {} };
      window.showFireResultOverlay = async (title, results) => { try { ufLogFire(title, results); } catch (e) {} };
      const os = ufSnapshot, oe = ufEvent;
      window.ufSnapshot = function (label, side) {
        const sw = window.__sim && window.__sim.swapped;
        os(sw ? label.replace('敵の手番の終わり', '自軍の手番の終わり') : label, sw ? 'player' : side);
        if (sw) { const sn = UF_REPORT.snaps[UF_REPORT.snaps.length - 1]; const t = sn.p; sn.p = sn.a; sn.a = t; }
      };
      window.ufEvent = function (side, text) {
        const sw = window.__sim && window.__sim.swapped;
        oe(sw ? (side === 'ai' ? 'player' : side === 'player' ? 'ai' : side) : side, text);
      };
    }
  `);

  // ---- 両軍のデータを入れ替える ----
  w.eval(`
    window.__swap = function () {
      const st = state;
      const sw = (a, b) => { const t = st[a]; st[a] = st[b]; st[b] = t; };
      const swk = (o) => { if (o) { const t = o.player; o.player = o.ai; o.ai = t; } };
      const flip = s => s === 'player' ? 'ai' : (s === 'ai' ? 'player' : s);
      sw('player', 'ai'); swk(st.groups);
      sw('playerHand', 'aiHand'); st.aiHandCount = st.aiHand.length;
      sw('playerRole', 'aiRole'); sw('aiStyle', '_playerStyle');
      sw('aiIdleLastTurn', 'playerIdleLastTurn');
      sw('aiSnipeCheckRnc', 'playerSnipeCheckRnc'); sw('aiSnipeRncThisTurn', 'playerSnipeRncThisTurn');
      sw('aiSniperDisabled', 'playerSniperDisabled'); sw('actedGroups', 'aiActedGroups');
      swk(st.slCardAtLastEnd); swk(st.slDamagePenalty); swk(st.terrainDone); swk(st.initialSoldierCount);
      st.currentTurn = flip(st.currentTurn);
      if (st.terrainTurn) st.terrainTurn = flip(st.terrainTurn);
      if (st.firstSideOverride) st.firstSideOverride = flip(st.firstSideOverride);
      ['player', 'ai'].forEach(sd => (st.groups[sd] || []).forEach(g => {
        if (!g) return;
        if (g.pinpointedBy) g.pinpointedBy.side = flip(g.pinpointedBy.side);
        if (g.encircledBy) g.encircledBy.side = flip(g.encircledBy.side);
        if (g._behindPillbox) g._behindPillbox = g._behindPillbox.replace(/^(player|ai)/, m => flip(m));
        (g.weaponPool || []).forEach(x => { x.fromSide = flip(x.fromSide); });
        g.cards.forEach(c => {
          if (c.infiltratedGroupSide) c.infiltratedGroupSide = flip(c.infiltratedGroupSide);
          if (c._dropSide) c._dropSide = flip(c._dropSide);
        });
      }));
      window.__sim.swapped = !window.__sim.swapped;
    };
  `);

  // ---- ゲームの準備 ----
  const f1 = FAC1 || FACS[Math.floor(Math.random() * FACS.length)];
  let f2 = FAC2 || FACS[Math.floor(Math.random() * FACS.length)];
  if (f2 === f1) f2 = FACS.filter(f => f !== f1)[Math.floor(Math.random() * 4)];
  w.eval(`
    (function () {
      const sc = window.SCENARIOS['${SCN}'];
      const role = sc && sc.asymmetric ? (${JSON.stringify(process.env.UF_ROLE || '')} || (Math.random() < 0.5 ? 'attacker' : 'defender')) : null;
      // 国1 も AI と同じく、先に性格をくじで決めてから作戦を選んでグループを作る
      const style1 = drawAIStyle('${f1}');
      const pg = window.SCENARIO_HELPERS.buildAIGroupsSmart(sc, '${f1}', role, style1);
      setupState.faction = '${f1}';
      setupState.scenario = sc;
      setupState.groups = [0, 1, 2, 3].map(i => (pg[i] ? pg[i].cards.map(c => c.num) : []));
      setupState.crewPairs = {};
      setupState.role = role;
      setupState.fromCampaign = false;
      setupState.aiFactionOverride = '${f2}';
      const fp = document.getElementById('first-player-pick'); if (fp) fp.value = Math.random() < 0.5 ? 'player' : 'ai';
      const tod = document.getElementById('time-of-day-pick'); if (tod) tod.value = '${NIGHT ? 'night' : 'day'}';
      startGameWithSetup();
      // プレイヤー側（国1）にも AI と同じクルー割当と性格のくじ
      // 作戦と役割（_strategy / _role）は、カード番号の受け渡しで消えるので付け直す
      (state.groups.player || []).forEach((g, i) => { if (g && pg[i]) { g._strategy = pg[i]._strategy; g._role = pg[i]._role; } });
      __swap(); initAICrewPairs(); state.aiStyle = ${process.env.UF_STYLE1 ? JSON.stringify(process.env.UF_STYLE1) : 'style1'}; __swap();
      ${process.env.UF_STYLE2 ? 'state.aiStyle = ' + JSON.stringify(process.env.UF_STYLE2) + ';' : ''}
    })();
  `);
  const st = () => w.state;

  // ---- 開始時の地形配置 ----
  let guard = 200;
  while (st().phase === 'terrainPlacement' && guard-- > 0) {
    if (st().terrainTurn === 'ai') w.aiPlaceTerrain();
    else { w.__swap(); w.aiPlaceTerrain(); w.__swap(); }
    await sleep(0);
  }

  // ---- 対戦 ----
  let half = 0;
  while (st().phase === 'play' && !w.__sim.result && half < MAX_HALF_TURNS) {
    while (w.__sim.running) await sleep(0);
    if (st().phase !== 'play' || w.__sim.result) break;
    if (st().currentTurn === 'ai') {
      await w.__runAI();
    } else {
      w.__swap();
      await w.__runAI();
      w.__swap();
    }
    half++;
    await sleep(0);
  }
  if (w.__sim.swapped) w.__swap();

  // ---- 結果 ----
  const R = w.INFANTRY_RULES;
  const loss = side => {
    let kia = 0, rout = 0, alive = 0;
    (st().groups[side] || []).forEach(g => g && g.cards.forEach(c => { if (c.killed) kia++; else if (c.routed) rout++; else alive++; }));
    return { kia, rout, alive };
  };
  const res = w.__sim.result;
  const endAlerts = alerts.filter(a => /勝利|引き分け|時間切れ/.test(a));
  const endAlert = endAlerts[0] || ''; // 最初に出た勝敗の表示（ゲームを終わらせたもの）
  const out = {
    game: gameNo, scenario: SCN,
    p1: `${f1}(${st()._playerStyle || '-'})`, p2: `${f2}(${st().aiStyle || '-'})`,
    winner: res ? (res.winner === 'player' ? f1 : f2) : (/引き分け/.test(endAlert) ? '引き分け' : (half >= MAX_HALF_TURNS ? '打ち切り' : '不明')),
    halfTurns: half, deckCycle: st().terrainDeck ? st().terrainDeck.cycle : '-',
    loss1: loss('player'), loss2: loss('ai'),
    end: endAlert.replace(/\s+/g, ' ').slice(0, 80),
    endCount: endAlerts.length,
    phase: st().phase,
    acts: w.__acts,
    afv: w.__afvStats, score: w.__cardScore,
    errors: [...new Set(errors)].slice(0, 3),
  };
  if (REPORT) {
    try {
      // 国名の手番の表示を「国1／国2の手番の終わり」に、終了時の盤面を足してからレポートを作る
      w.eval(`window.__ufAiVsAi = true;
        UF_REPORT.snaps.forEach(sn => { sn.label = sn.label.replace('自軍の手番の終わり', state.player.name + ' の手番の終わり').replace('敵の手番の終わり', state.ai.name + ' の手番の終わり'); });
        if (!state._ufEndText) state._ufEndText = ${JSON.stringify(endAlert.replace(/\s+/g, ' '))};
        if (!UF_REPORT.snaps.length || UF_REPORT.snaps[UF_REPORT.snaps.length - 1].label.indexOf('終了') < 0) ufSnapshot('終了時', '');`);
      const html = w.eval('ufBuildReportHtml()');
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      const nums = fs.readdirSync(REPORT_DIR).map(f => (f.match(/^ai_(\d+)\.html$/) || [])[1]).filter(Boolean).map(Number);
      const file = path.join(REPORT_DIR, 'ai_' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0') + '.html');
      fs.writeFileSync(file, html);
      out.report = path.basename(file);
    } catch (e) { out.reportError = String(e && e.message || e); }
  }
  w.close();
  return out;
}

// ===== 対戦レポートの一覧のページ（reports/index.html） =====
function buildIndexHtml() {
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const files = (() => { try { return fs.readdirSync(REPORT_DIR); } catch (e) { return []; } })();
  const meta = f => { try { const m = fs.readFileSync(path.join(REPORT_DIR, f), 'utf8').match(/<!--META (.*?)-->/); return m ? JSON.parse(m[1]) : null; } catch (e) { return null; } };
  const rowOf = (f, label) => { const m = meta(f) || {};
    return `<tr><td><a href="${encodeURIComponent(f)}">${esc(label)}</a></td><td>${esc(m.scenario ? m.scenario + ': ' + (m.scenarioName || '') : '')}</td><td>${esc(m.p1 && m.p2 ? m.p1 + ' vs ' + m.p2 : '')}</td><td>${esc(m.result || '')}</td></tr>`; };
  // ドイツ軍のキャンペーン（プレイヤー対 AI の一覧とは分ける）
  const CAMPAIGN_GER = ['upfront_report_20261103_0659.html', 'upfront_report_20261104_1500.html'];
  const campaign = CAMPAIGN_GER.filter(f => files.indexOf(f) >= 0).map((f, i) => rowOf(f, `Game ${i + 1}`).replace(/(<td>[A-E]: [^<]*)(<\/td>)/, '$1（夜間）$2')); // 2戦とも夜戦
  const player = files.filter(f => /^upfront_report_\d{8}_\d{4}\.html$/.test(f) && CAMPAIGN_GER.indexOf(f) < 0).sort().reverse()
    .map(f => { const d = f.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.html$/); return rowOf(f, d ? `${d[1]}-${d[2]}-${d[3]}` : f); });
  const ai = files.filter(f => /^ai_\d+\.html$/.test(f)).sort().reverse().map(f => rowOf(f, 'Game ' + parseInt(f.match(/\d+/)[0], 10)));
  const table = rows => rows.length ? `<table><tr><th>Date / Game</th><th>Scenario</th><th>Nations</th><th>Result</th></tr>${rows.join('')}</table>` : '<div class="empty">No games yet.</div>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Up Front Reports</title>
<script data-goatcounter="https://shigerusuzuki.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
<style>
:root{ --bg:#f6f7f9; --card:#fff; --fg:#1d2330; --mute:#667085; --line:#d9dee7; --link:#1f5fbf; }
@media (prefers-color-scheme: dark){ :root{ --bg:#14171d; --card:#1d222b; --fg:#e6e9ef; --mute:#98a2b3; --line:#2f3642; --link:#6ea8ff; } }
*{ box-sizing:border-box; }
body{ margin:0; background:var(--bg); color:var(--fg); font:14px/1.6 -apple-system,"Helvetica Neue",Arial,"Hiragino Sans",sans-serif; }
.wrap{ max-width:900px; margin:0 auto; padding:16px; }
h1{ font-size:20px; margin:0 0 12px; } h2{ font-size:16px; margin:20px 0 8px; }
.card{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 12px; overflow-x:auto; }
table{ border-collapse:collapse; width:100%; } td,th{ border-bottom:1px solid var(--line); padding:6px; text-align:left; white-space:nowrap; }
a{ color:var(--link); } .empty{ color:var(--mute); }
</style></head><body><div class="wrap">
<h1>Up Front: Reports</h1>
<h2>German Campaign</h2>
<div class="card">${table(campaign)}</div>
<h2>Player vs AI</h2>
<div class="card">${table(player)}</div>
<h2>AI vs AI</h2>
<div class="card">${table(ai)}</div>
</div></body></html>`;
}
function writeIndex() { fs.mkdirSync(REPORT_DIR, { recursive: true }); fs.writeFileSync(path.join(REPORT_DIR, 'index.html'), buildIndexHtml()); }

(async () => {
  if (process.argv.includes('index')) { writeIndex(); console.log('一覧: ' + path.join(REPORT_DIR, 'index.html')); return; }
  const rows = [];
  for (let i = 1; i <= N; i++) {
    let r;
    try { r = await playOne(i); } catch (e) { r = { game: i, crash: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') }; }
    rows.push(r);
    console.log(JSON.stringify(r));
  }
  const tally = {};
  rows.forEach(r => { const k = r.winner || 'crash'; tally[k] = (tally[k] || 0) + 1; });
  console.log('\n=== 集計 ===', JSON.stringify(tally));
  if (REPORT) { writeIndex(); console.log('一覧: ' + path.join(REPORT_DIR, 'index.html')); }
})();
