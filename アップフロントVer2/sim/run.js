// アップフロント 画面なし AI 対 AI 対戦
//   使い方: node sim/run.js [局数] [シナリオ] [国1] [国2]
//   例:     node sim/run.js 10 A rus ger
//   国を省くと毎局くじで決める（ger/us/rus/jpn/uk）。シナリオを省くと A。
//   両軍とも index.html の AI（aiTurn）で動かす。プレイヤー側の手番は両軍のデータを入れ替えて AI に指させる。
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '../../海の戦い/sim/node_modules/jsdom'));

const N = parseInt(process.argv[2] || '5', 10);
const SCN = process.argv[3] || 'A';
const FAC1 = process.argv[4] || null;
const FAC2 = process.argv[5] || null;
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
    window.showAIAction = async () => {};
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
      const role = sc && sc.asymmetric ? (Math.random() < 0.5 ? 'attacker' : 'defender') : null;
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
      const tod = document.getElementById('time-of-day-pick'); if (tod) tod.value = 'day';
      startGameWithSetup();
      // プレイヤー側（国1）にも AI と同じクルー割当と性格のくじ
      // 作戦と役割（_strategy / _role）は、カード番号の受け渡しで消えるので付け直す
      (state.groups.player || []).forEach((g, i) => { if (g && pg[i]) { g._strategy = pg[i]._strategy; g._role = pg[i]._role; } });
      __swap(); initAICrewPairs(); state.aiStyle = style1; __swap();
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
    errors: [...new Set(errors)].slice(0, 3),
  };
  w.close();
  return out;
}

(async () => {
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
})();
