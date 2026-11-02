// アップフロント: アクションのメニュー（プレイヤーの操作）
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== アクションメニュー =====
state.fireSource = null; // {side:'player'|'ai', idx:int}
state.fireTarget = null;

const ACTIONS_NEED_SOURCE = ['fire','mortar','move','flank','encircle','recover','snipe','terrain','wire-remove','mine-remove','guard','repair','infiltrate','cc','crew','demo','transfer','scout','flare','trench','snipercheck','receive','groupshift','weapon','uninfiltrate'];
const ACTIONS_NEED_TARGET = ['fire','mortar','snipe','terrain','infiltrate','flank','encircle','transfer','scout','flare'];

document.querySelectorAll('.action-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    // 捨て札・終了・確定ボタンは専用リスナーで処理するのでスキップ
    if (!btn.dataset.act) return;
    const act = btn.dataset.act;
    if (state.selectedAction === act) {
      state.selectedAction = null;
    } else {
      state.selectedAction = act;
    }
    state.selectedHand.clear();
    state.fireSource = null;
    state.fireTarget = null;
    document.querySelectorAll('.action-btn').forEach(b => b.classList.toggle('active', b.dataset.act === state.selectedAction));
    renderField('player'); renderField('ai');
    renderHands();
    updateDecideBtn();
  });
});

document.getElementById('btn-discard').addEventListener('click', () => {
  if (state.phase !== 'play' || state.currentTurn !== 'player') return;
  if (state.selectedHand.size === 0) return;
  if (window.DISCARD_RULES) window.DISCARD_RULES.execute();
});

document.getElementById('btn-end-turn').addEventListener('click', () => {
  if (state.phase !== 'play' || state.currentTurn !== 'player') return;
  // §4.6 相手が直前のターンに何もしていなければ、アクションか捨て札をしなければならない
  const _playerDid = (window.DISCARD_RULES && window.DISCARD_RULES.didAnything())
    || (state.actedGroups && state.actedGroups.size > 0);
  if (state.aiIdleLastTurn && !_playerDid && state.playerHand.length > 0) {
    alert('相手が前のターンに何もしなかったため、このターンはアクションか捨て札をしてください（§4.6）');
    return;
  }
  state.playerIdleLastTurn = !_playerDid;
  state.selectedAction = null;
  state.selectedHand.clear();
  state.fireSource = null;
  state.fireTarget = null;
  document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
  if (window.DISCARD_RULES) window.DISCARD_RULES.resetTurn();
  endPlayerTurn();
});

function onGroupClickActionPhase(side, idx) {
  if (!state.selectedAction) return;
  const needsSource = ACTIONS_NEED_SOURCE.indexOf(state.selectedAction) >= 0;
  const needsTarget = ACTIONS_NEED_TARGET.indexOf(state.selectedAction) >= 0;
  // 全滅グループは選択不可
  const grp = state.groups[side] && state.groups[side][idx];
  if (grp && grp.eliminated) {
    alert('全滅したグループは選択できません');
    return;
  }
  // §14.2 狙撃: 敵グループの枠を押せば目標グループに決まる（兵士は RPC）
  if (state.selectedAction === 'snipe' && side === 'ai') {
    state.sniperTarget = { side, grpIdx: idx };
    state.fireTarget = { side, idx };
    renderField('player'); renderField('ai');
    updateConfirmBtn();
    return;
  }
  // アクション済みグループはソースに選べない（回復はヒーローならアクションではないので、確定時に判定）
  if (side === 'player' && needsSource && state.selectedAction !== 'recover' && state.actedGroups && state.actedGroups.has(idx)) {
    alert('このグループは今ターン既にアクション済みです');
    return;
  }
  // 個人移送: src/tgt とも自軍 (player) 側
  if (state.selectedAction === 'transfer' && side === 'player') {
    if (!state.fireSource) {
      state.fireSource = { side, idx };
    } else if (state.fireSource.idx !== idx) {
      state.fireTarget = { side, idx };
    } else {
      // 同じグループを再クリック → src 解除
      state.fireSource = null;
      state.fireTarget = null;
    }
  } else if (side === 'player' && needsSource) {
    state.fireSource = { side, idx };
  } else if (side === 'ai' && needsTarget) {
    state.fireTarget = { side, idx };
  } else if (side === 'player' && !needsTarget) {
    state.fireSource = { side, idx };
  }
  renderField('player'); renderField('ai');
  updateConfirmBtn();
  updateDecideBtn();
}

state.sniperTarget = null; // {side, grpIdx}（兵士は §14.2 RPC で決める）

/** 侵入・白兵戦で引く RNC/RPC: 引いたカードは捨て札の山へ（風なら煙幕除去）。カード自体は判定にそのまま使える */
function ccDrawCard() {
  const c = drawTerrainCard();
  if (c) { checkBreezeRemoveSmoke(c); pushTerrainToDiscard(c); }
  return c;
}

/** §14.6 RPC: グループの生存兵士の人数の列（1〜0r）の数字で、目標の兵士（左からの位置）を決める */
function pickByRPC(rpcCard, group) {
  const R = window.INFANTRY_RULES;
  if (!R || !rpcCard || !group) return null;
  const alive = group.cards.filter(c => R.isAlive(c));
  if (alive.length === 0) return null;
  const keys = ['1','2b','3','4c','5o','6','7w','8','9','0r'];
  const key = keys[Math.max(0, Math.min(9, alive.length - 1))];
  let pos = parseInt((rpcCard.terrain && rpcCard.terrain.dice && rpcCard.terrain.dice[key]) || '1', 10) || 1;
  pos = Math.max(1, Math.min(alive.length, pos));
  return alive[pos - 1];
}

/** §14.3/§6.531 狙撃でピン状態の兵士がパニック: 狙撃のRNCの0rの数字がパニック値以下ならKIA、より大きければ潰走 */
function resolveSniperPanic(soldier, def, judge) {
  const R = window.INFANTRY_RULES;
  const rpc0r = parseInt((judge && judge.terrain && judge.terrain.dice && judge.terrain.dice['0r']) || '0', 10) || 0;
  const panicVal = def ? (parseInt(def.panic, 10) || 0) : 0;
  if (rpc0r <= panicVal) { if (R) R.killSoldier(soldier); return 'PANIC_KIA'; }
  if (R) R.routSoldier(soldier);
  return 'PANIC_ROUT';
}

function updateConfirmBtn() {
  const btn = document.getElementById('btn-confirm');
  const act = state.selectedAction;
  if (!act) { btn.disabled = true; return; }
  if (act === 'move') {
    btn.disabled = !(state.selectedHand.size > 0 && state.fireSource);
    return;
  }
  if (act === 'terrain') {
    btn.disabled = !(state.selectedHand.size > 0 && (state.fireSource || state.fireTarget));
    return;
  }
  if (act === 'flank') {
    btn.disabled = !(state.selectedHand.size > 0 && state.fireSource && state.fireTarget);
    return;
  }
  if (act === 'scout') {
    btn.disabled = !(state.fireSource && state.fireTarget);
    return;
  }
  if (act === 'crew') {
    btn.disabled = !state.fireSource;
    return;
  }
  if (act === 'trench') {
    btn.disabled = !state.fireSource;
    return;
  }
  if (act === 'flare') {
    btn.disabled = !(state.fireSource && state.fireTarget);
    return;
  }
  if (act === 'recover') {
    btn.disabled = !(state.selectedHand.size > 0 && state.fireSource);
    return;
  }
  if (act === 'wire-remove') {
    btn.disabled = !(state.selectedHand.size > 0 && state.fireSource);
    return;
  }
  if (act === 'mine-remove') {
    btn.disabled = !state.fireSource; // §24.5 移動カードは使わない
    return;
  }
  if (act === 'guard') {
    // §32.2 捕虜のいるグループだけ
    const g = state.fireSource && state.fireSource.side === 'player' && state.groups.player[state.fireSource.idx];
    btn.disabled = !(g && g.cards.some(c => c.prisoners && c.prisoners.length));
    return;
  }
  if (act === 'snipercheck') {
    btn.disabled = !state.fireSource;
    return;
  }
  if (act === 'repair') {
    btn.disabled = !state.fireSource;
    return;
  }
  if (act === 'snipe') {
    btn.disabled = !(state.selectedHand.size > 0 && state.sniperTarget);
    return;
  }
  if (act === 'discard') {
    const rem = window.DISCARD_RULES ? window.DISCARD_RULES.getRemainingDiscard() : Infinity;
    const can = rem > 0;
    btn.disabled = !(state.selectedHand.size > 0 && can);
    return;
  }
  if (act === 'infiltrate') {
    if (!state.fireSource || !state.fireTarget) { btn.disabled = true; return; }
    const src = state.groups.player[state.fireSource.idx];
    const tgt = state.groups.ai[state.fireTarget.idx];
    if (!src || !tgt || !window.CC_ACTION) { btn.disabled = true; return; }
    const chk = window.CC_ACTION.canAttemptInfiltration(src, tgt, 'player');
    btn.disabled = !chk.ok;
    return;
  }
  if (act === 'cc') {
    if (!state.fireSource) { btn.disabled = true; return; }
    const src = state.groups.player[state.fireSource.idx];
    if (!src || !window.CC_ACTION) { btn.disabled = true; return; }
    const chk = window.CC_ACTION.canAttemptCC(src);
    btn.disabled = !chk.ok;
    return;
  }
  if (act === 'demo') {
    if (!state.fireSource) { btn.disabled = true; return; }
    const src = state.groups.player[state.fireSource.idx];
    const R = window.INFANTRY_RULES;
    if (!src || !R) { btn.disabled = true; return; }
    // 爆薬保有 + 侵入中 + 侵入したターン + 生存 の兵士がいるか
    const hasDemo = src.cards.some(c => c && c.demoCharge && c.infiltrating && c.infiltratedThisTurn && R.isAlive(c));
    btn.disabled = !hasDemo;
    return;
  }
  if (act === 'transfer') {
    // 送り出すグループと移動カードがあれば押せる（移送先・兵士・条件は確定時に選んで確かめる §17.8）
    btn.disabled = !(state.fireSource && [...state.selectedHand].some(i => { const c = state.playerHand[i]; return c && c.terrain && c.terrain.type === 'MOVEMENT'; }));
    return;
  }
  if (act === 'receive') {
    btn.disabled = !state.fireSource;
    return;
  }
  if (act === 'weapon') {
    btn.disabled = !state.fireSource;
    return;
  }
  if (act === 'uninfiltrate') {
    btn.disabled = !state.fireSource;
    return;
  }
  if (act === 'groupshift') {
    btn.disabled = !(state.fireSource && [...state.selectedHand].some(i => { const c = state.playerHand[i]; return c && c.terrain && c.terrain.type === 'MOVEMENT'; }));
    return;
  }
  btn.disabled = true;
}
window.updateConfirmBtn = updateConfirmBtn;

document.getElementById('btn-confirm').addEventListener('click', () => {
  const btn = document.getElementById('btn-confirm');
  if (btn.disabled) return;
  const act = state.selectedAction;
  let playerDidRuleAction = false;
  try { const _b = document.querySelector('.action-btn[data-act="' + act + '"]'); ufReportLog('player', '行動: ' + (_b ? _b.textContent : act), 'player'); } catch (e) {}
  // §4.3/§14.1 捨て札（狙撃・相手への地形配置を含む）をしたターンは、国籍によってはアクションできない
  {
    const _tTarget = state.fireSource || state.fireTarget;
    const _selCard = state.playerHand[[...state.selectedHand][0]];
    const _notAction = act === 'discard' || act === 'snipe'
      || (act === 'terrain' && _tTarget && _tTarget.side === 'ai')
      || (act === 'recover' && _selCard && _selCard.terrain && _selCard.terrain.type === 'HERO')
      || (act === 'move' && getFactionKey(state.player) === 'jpn'); // §45 日本軍の移動はアクションに数えない
    if (!_notAction && window.DISCARD_RULES && window.DISCARD_RULES.canStillAct && !window.DISCARD_RULES.canStillAct()) {
      alert('このターンは捨て札（狙撃・相手への地形配置を含む）をしたため、アクションはできません（§4.3・§14.1）');
      return;
    }
  }

  if (act === 'move') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!card || !state.fireSource) return;
    const grp = state.groups.player[state.fireSource.idx];
    const R = window.INFANTRY_RULES;
    if (R && grp.cards.some(c => R.isPinned(c))) {
      alert('PIN状態の兵士がいるグループは移動できません');
      return;
    }
    // §13.34 鉄条網の上に移動カードは置けない（移動カードは鉄条網の除去に使う）
    if (grp.terrain.some(c => c && c.terrain && c.terrain.type === 'WIRE')) {
      alert('鉄条網があるグループは移動できません（移動カードで鉄条網を除去してください）');
      return;
    }
    // 地雷原内では移動カードは強制的に横向き(lateral)
    const inMineGroup = grp.terrain.some(c => c && c.terrain && c.terrain.type === 'MINEFIELD');
    if (inMineGroup) {
      card._moveMode = 'lateral';
      pushTerrainWithFaction(grp, card);
      state.playerHand.splice(cardIdx, 1);
      // §24.4 地雷原の上に移動カードを置いたら RNC を引く（赤で2行目の数字より大きければもう1人攻撃）
      triggerMinefieldRNCCheck(grp, 'player');
      // 日本軍以外: 移動はアクションとしてカウント
      const facKey = getFactionKey(state.player);
      if (facKey !== 'jpn' && window.DISCARD_RULES) window.DISCARD_RULES.markActed();
      if (!state.actedGroups) state.actedGroups = new Set();
      if (state.fireSource) state.actedGroups.add(state.fireSource.idx);
      if (window.CC_ACTION) window.CC_ACTION.clearInfiltration(grp, 'move');
      state.selectedAction = null;
      state.selectedHand.clear();
      state.fireSource = null;
      state.fireTarget = null;
      document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('btn-confirm').disabled = true;
      renderField('player'); renderField('ai');
      renderHands();
      updateDecideBtn();
      return;
    }
    showMoveDirectionModal(grp, card, cardIdx);
    return;
  }

  if (act === 'crew') {
    if (!state.fireSource) return;
    const grp = state.groups.player[state.fireSource.idx];
    const R = window.INFANTRY_RULES;
    if (!R) return;
    // §11 クルー指定はカードを押して選ぶ画面で行う（決定した時だけ1アクション）
    const srcIdx = state.fireSource.idx;
    openCrewModal(grp, () => {
      if (window.DISCARD_RULES) window.DISCARD_RULES.markActed();
      if (!state.actedGroups) state.actedGroups = new Set();
      state.actedGroups.add(srcIdx);
    });
    state.selectedAction = null;
    state.selectedHand.clear();
    state.fireSource = null;
    state.fireTarget = null;
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
    btn.disabled = true;
    renderField('player'); renderHands(); updateDecideBtn();
    return;
  }

  if (act === 'flank') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!card || !state.fireSource || !state.fireTarget) return;
    if (!card.terrain || card.terrain.type !== 'MOVEMENT') { alert('移動カードを選択してください'); return; }
    const srcGrp = state.groups.player[state.fireSource.idx];
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    const R = window.INFANTRY_RULES;
    if (!R) return;
    // §17.1 側面にまわり込めるのは「側面移動」カード（移動カードのうち「側面」と書かれたもの）だけ
    if (card.terrain.sub !== '側面') { alert('側面射撃には「側面移動」カード（FLANK）が必要です（§17.1）'); return; }
    if (hasPillbox(tgtGrp)) { alert('トーチカ持ちグループには側面射撃できません'); return; }
    const _fWhy = cardFlankBlockReason('player', state.fireSource.idx, state.fireTarget.idx);
    if (_fWhy) { alert(_fWhy); return; }
    state.playerHand.splice(cardIdx, 1);
    card._moveMode = 'lateral';
    pushTerrainWithFaction(srcGrp, card);
    srcGrp.flankingTarget = state.fireTarget.idx;
    srcGrp.flankCard = card; // §17.41 この側面移動カードが最後のカードである間だけ有効
    alert(`側面射撃成立: GROUP ${srcGrp.name} → GROUP ${tgtGrp.name}`);
    playerDidRuleAction = true;
  }

  if (act === 'flare') {
    if (!state.fireSource || !state.fireTarget) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    const R = window.INFANTRY_RULES;
    if (!R || !srcGrp || !tgtGrp) return;

    // 認知した敵対象
    const isRecognized = srcGrp.recognizedTargets && srcGrp.recognizedTargets.indexOf(state.fireTarget.idx) >= 0;
    if (!isRecognized) { alert('認知した敵にのみ照明弾を打てます'); return; }

    // 相対距離1-5
    const dist = R.relativeRange(srcGrp.distance, tgtGrp.distance);
    if (dist < 1 || dist > 5) { alert('相対距離1〜5 の敵に照明弾を打てます'); return; }

    // ピンでないSL
    const aiKey = getFactionKey(state.player);
    const hasUnpinnedSL = srcGrp.cards.some(c => {
      if (!R.isAlive(c) || R.isPinned(c)) return false;
      const def = R.lookupSoldier(c, aiKey);
      return def && def.leader === '分隊長';
    });
    if (!hasUnpinnedSL) { alert('ピンでない分隊長がグループにいる必要があります'); return; }

    // §38.5 照明弾はそのグループのそのターン唯一の行動
    if (state.actedGroups && state.actedGroups.has(state.fireSource.idx)) {
      alert('照明弾は、このターンにほかの行動をしていないグループだけが置けます（§38.5）'); return;
    }
    // 既に照らされているグループには使えない
    if (isGroupFlared(tgtGrp)) {
      alert('そのグループは既に照らされています'); return;
    }

    // §38.51 効果範囲: 目標＋目標から相対射程5の味方グループ＋目標と同じ射程チットの隣
    applyStarshell('player', state.fireTarget.idx);

    alert(`照明弾発射: GROUP ${tgtGrp.name} とその周辺を、相手の次のターンの終わりまで照らします`);
    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(state.fireSource.idx);
    playerDidRuleAction = true;
    renderField('player'); renderField('ai');
  }

  if (act === 'trench') {
    if (!state.fireSource) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const R = window.INFANTRY_RULES;
    if (!R || !srcGrp) return;
    // ピン兵士がいるグループは塹壕作成不可
    if (srcGrp.cards.some(c => R.isPinned(c))) {
      alert('ピン状態の兵士がいるグループでは塹壕を作れません'); return;
    }
    // 配置可能地形チェック: 煙幕・鉄条網を無視した最上地形が PLAIN/WOODS/HILL/BRUSH
    const allowed = ['PLAIN','WOODS','HILL','BRUSH'];
    let _baseTop = null;
    for (let i = (srcGrp.terrain || []).length - 1; i >= 0; i--) {
      const t = srcGrp.terrain[i];
      if (t && t.terrain && (t.terrain.type === 'SMOKE' || t.terrain.type === 'WIRE')) continue;
      _baseTop = t; break;
    }
    const topType = _baseTop && _baseTop.terrain ? _baseTop.terrain.type : null;
    if (!topType || allowed.indexOf(topType) < 0) {
      alert('塹壕は平地・森・丘・ブッシュにのみ作成可能です'); return;
    }
    // 判定: RNC=0 で成功
    const judge = drawTerrainCard();
    if (!judge) return;
    const rncVal = parseInt(judge.terrain.range, 10) || 0;
    showJudgeCard(judge);
    pushTerrainToDiscard(judge);
    if (rncVal === 0) {
      // 塹壕カードを地形スタックに追加
      const trenchCard = {
        terrain: { type: 'TRENCH', modifier: '/-1', range: '0', rncColor: '黒', dice: {} },
        _isTrench: true
      };
      pushTerrainWithFaction(srcGrp, trenchCard);
      alert(`塹壕構築成功 (RNC=0)`);
    } else {
      alert(`塹壕構築失敗 (RNC=${rncVal})`);
    }
    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(state.fireSource.idx);
    playerDidRuleAction = true;
    renderField('player');
    return;
  }

  if (act === 'scout') {
    if (!state.fireSource || !state.fireTarget) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    const R = window.INFANTRY_RULES;
    if (!R || !srcGrp || !tgtGrp) return;

    // §38.2 各グループが観測を試みられるのは、1ターンに敵グループ1つだけ
    if (srcGrp._observeTriedTurn === (state.turnCount || 0)) {
      alert('このグループはこのターン、すでに観測を試みています（観測できる敵グループは1つだけ §38.2）');
      return;
    }
    // §38.2 涸れ谷からの観測: 相対射程5 / 迫撃砲のため / 丘にいる目標 のみ可
    if (!gullyObservationAllowed(srcGrp, tgtGrp, getFactionKey(state.player))) {
      alert('涸れ谷からは「相対射程5」「迫撃砲のため」「丘にいる目標」にのみ観測できます（§38.2）');
      return;
    }

    // §38.3 判定: RNC（色無関係）< 現在の相対射程＋修正（相対射程0は「1」を引く）
    const judge = drawTerrainCard();
    if (!judge) { alert('地形デッキがありません'); return; }
    srcGrp._observeTriedTurn = state.turnCount || 0;
    const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
    const ob = observationRange(srcGrp, tgtGrp);
    const threshold = ob.total;
    const success = observationSuccess(rncAbs, threshold);

    showJudgeCard(judge);
    pushTerrainToDiscard(judge);

    if (success) {
      if (!srcGrp.recognizedTargets) srcGrp.recognizedTargets = [];
      if (srcGrp.recognizedTargets.indexOf(state.fireTarget.idx) < 0) {
        srcGrp.recognizedTargets.push(state.fireTarget.idx);
      }
      alert(`索敵成功 (RNC ${rncAbs}${threshold <= 0 ? ' = 1' : ' < ' + threshold}) — アクション消費なし`);
      // アクションカウントしない
    } else {
      alert(`索敵失敗 (RNC ${rncAbs}${threshold <= 0 ? ' ≠ 1' : ' >= ' + threshold}) — アクション消費`);
      if (!state.actedGroups) state.actedGroups = new Set();
      state.actedGroups.add(state.fireSource.idx);
      playerDidRuleAction = true;
    }
    renderField('player'); renderField('ai');
  }

  if (act === 'encircle') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!card || !state.fireSource || !state.fireTarget) return;
    if (!card.terrain || card.terrain.type !== 'MOVEMENT') { alert('移動カードを選択してください'); return; }
    const srcGrp = state.groups.player[state.fireSource.idx];
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    const R = window.INFANTRY_RULES;
    if (!R) return;
    if (hasPillbox(tgtGrp)) { alert('トーチカ持ちグループは包囲できません'); return; }
    // §17.6 敵隣接グループの背後にいるグループが、横向きの移動カードで包囲する（前方は目標の真正面の味方グループ）
    const _eWhy = encircleBlockReason('player', state.fireSource.idx, state.fireTarget.idx);
    if (_eWhy) { alert(_eWhy); return; }
    state.playerHand.splice(cardIdx, 1);
    card._moveMode = 'lateral';
    pushTerrainWithFaction(srcGrp, card);
    applyEncircle('player', state.fireSource.idx, state.fireTarget.idx);
    alert(`包囲成立: GROUP ${tgtGrp.name} を包囲（後方 GROUP ${srcGrp.name}・前方 GROUP ${state.groups.player[state.fireTarget.idx].name}）`);
    playerDidRuleAction = true;
  }

  if (act === 'terrain') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!card) return;
    // 地形以外のカードは平地として自分の移動中のグループに置く（§13.5 煙幕・鉄条網は残す）
    if (isPlainUseCard(card)) {
      const pTarget = state.fireSource || state.fireTarget;
      if (!pTarget) return;
      if (pTarget.side !== 'player') { alert('平地は自分のグループに置いてください'); return; }
      const pGrp = state.groups.player[pTarget.idx];
      if (!isMovingIgnoringOverlays(pGrp) && !pGrp.forming) { alert('移動中（最上が移動カード）のグループにのみ平地を置けます'); return; }
      const R_p = window.INFANTRY_RULES;
      if (R_p && !R_p.canPlaceTerrainOnMarsh(pGrp)) { alert('湿地に地形カードを置くには移動カード2枚が必要です'); return; }
      if (R_p && R_p.canPlaceTerrainOnGully && !R_p.canPlaceTerrainOnGully(pGrp)) { alert('涸れ谷に地形カードを置くには移動カードが必要です'); return; }
      if (R_p && R_p.canPlaceTerrainOnStream && !R_p.canPlaceTerrainOnStream(pGrp)) { alert('河川に地形カードを置くには渡河成功＋移動カード合計2枚が必要です'); return; }
      const escapeP = processMinefieldEscape(pGrp, 'player');
      state.playerHand.splice(cardIdx, 1);
      if (!escapeP.ok) {
        alert(escapeP.reason);
        pushTerrainToDiscard(card);
        playerDidRuleAction = true;
        return;
      }
      placePlainOnGroup(pGrp, card);
      playerDidRuleAction = true;
      { const _n = releaseInfiltrationOnRetreat(pGrp, 'player', 'terrain'); // §20.53 相対距離4で地形カード
        if (_n) setTimeout(() => alert(`GROUP ${pGrp.name} が相対距離4で地形カードを置いたので、敵の侵入兵 ${_n}名は侵入状態でなくなりました（§20.53）`), 50); }
    } else {
    const target = state.fireSource || state.fireTarget;
    if (!target) return;
    const grp = state.groups[target.side][target.idx];
    const R = window.INFANTRY_RULES;
    // 移動中（最上が MOVEMENT）でないグループには地形カードを置けない（煙幕/鉄条網除く）
    const _placeTtype = card.terrain && card.terrain.type;
    const _placeOverlay = _placeTtype === 'SMOKE' || _placeTtype === 'WIRE';
    const _placeTop = topIgnoringSmoke(grp); // §13.23 移動カード上の煙幕は妨げにならない
    const _placeTopType = _placeTop && _placeTop.terrain && _placeTop.terrain.type;
    if (!_placeOverlay && _placeTopType !== 'MOVEMENT' && !grp.forming) { // §17.92 設立中のグループは地形カードで設立完了
      alert('移動中（最上が移動カード）のグループにのみ地形を配置できます');
      return;
    }
    // §13.3 鉄条網は相手グループにのみ置ける。湿地（移動2枚前）・トーチカ・渡河成功前の河川には置けない
    if (_placeTtype === 'WIRE') {
      if (target.side === 'player') { alert('鉄条網は相手のグループにのみ置けます'); return; }
      const _wWhy = wireBlockReason(grp);
      if (_wWhy) { alert(_wWhy); return; }
    }
    // §13.2 煙幕は自軍グループにのみ置ける
    if (_placeTtype === 'SMOKE' && target.side !== 'player') {
      alert('煙幕は自分のグループにのみ置けます');
      return;
    }
    // §13.2 自軍グループへの煙幕: 指揮官のいるグループのみ・湿地不可・風のターン不可・グループの1アクション
    const _ownSmoke = _placeTtype === 'SMOKE' && target.side === 'player';
    if (_ownSmoke) {
      if (state.actedGroups && state.actedGroups.has(target.idx)) {
        alert('このグループは今ターン既にアクション済みです');
        return;
      }
      const _why = smokeBlockReason(grp, 'player');
      if (_why) { alert(_why); return; }
      if (!state.actedGroups) state.actedGroups = new Set();
      state.actedGroups.add(target.idx);
    }
    // 煙幕・鉄条網（人工地形）は涸れ谷/湿地/河川のチェック対象外で自由に配置可能
    const _isArtificial = _placeTtype === 'SMOKE' || _placeTtype === 'WIRE';
    if (R && !_isArtificial && !R.canPlaceTerrainOnMarsh(grp)) {
      alert('湿地に地形カードを置くには移動カード2枚が必要です');
      return;
    }
    if (R && !_isArtificial && R.canPlaceTerrainOnGully && !R.canPlaceTerrainOnGully(grp)) {
      alert('涸れ谷に地形カードを置くには移動カードが必要です');
      return;
    }
    if (R && !_isArtificial && R.canPlaceTerrainOnStream && !R.canPlaceTerrainOnStream(grp)) {
      alert('河川に地形カードを置くには渡河成功＋移動カード合計2枚が必要です');
      return;
    }
    // §38.7 夜間、後退中の相手に地形カードを置くには、そのグループの観測が必要
    if (target.side === 'ai' && !retrogradeObservationOk('player', grp, target.idx)) {
      alert('夜間に後退中の相手グループに地形カードを置くには、そのグループを観測している必要があります（§38.7）');
      return;
    }
    // §7.3 相手への地形配置は捨て札の代わり（国籍による捨て札の枚数制限を受ける。アクションではない）
    if (target.side === 'ai' && window.DISCARD_RULES && window.DISCARD_RULES.getRemainingDiscard() <= 0) {
      alert('捨て札の枚数制限により、このターンは相手に地形を置けません（§7.3・§4.3）');
      return;
    }
    state.playerHand.splice(cardIdx, 1);
    // AI側グループに置く場合: AIが拒否するか自動判定
    if (target.side === 'ai') {
      if (window.DISCARD_RULES) window.DISCARD_RULES.consume(1);
      const isStream = card.terrain && card.terrain.type === 'STREAM';
      const isWire = card.terrain && card.terrain.type === 'WIRE';
      const isMinefield = card.terrain && card.terrain.type === 'MINEFIELD';
      const isSmoke = card.terrain && card.terrain.type === 'SMOKE';
      const lastMove = findLastMovement(grp);
      // §8.5 河川/煙幕/鉄条網/地雷原は拒否不可。他は移動カードがあれば50%の確率で拒否
      if (!isStream && !isWire && !isMinefield && !isSmoke && lastMove && Math.random() < 0.5) {
        if (lastMove.mode === 'advance') {
          grp.distance -= 1;
          if (lastMove.card) lastMove.card._moveMode = 'lateral';
        } else if (lastMove.mode === 'retreat') {
          grp.distance += 1;
          if (lastMove.card) lastMove.card._moveMode = 'lateral';
        }
        if (lastMove.mode === 'lateral') {
          grp.terrain.splice(lastMove.idx, 1);
          pushTerrainToDiscard(lastMove.card);
        }
        pushTerrainToDiscard(card);
        // §13.241 煙幕上に置かれた地形を拒否しても煙幕は取り去られる
        removeSmokeFromGroup(grp, 'ai', '地形カードを拒否');
        breakFlanksOn(grp); // §17.42 拒否しても側面射撃は終わる
        alert('AI: 地形カードを拒否しました（横移動モードに変更）');
        // §7.3 捨て札扱いなのでアクションにはしない
        // 以降のリセット処理へ
      } else {
        // §7.34 受け入れ: 下のカードを全て捨て札（煙幕/鉄条網は重ねるだけ）
        const tType1 = card.terrain && card.terrain.type;
        const isOverlay1 = tType1 === 'SMOKE' || tType1 === 'WIRE';
        if (!isOverlay1) {
          removeSmokeFromGroup(grp, 'ai', '地形カードを配置'); // §13.241
          while (grp.terrain.length > 0) {
            pushTerrainToDiscard(grp.terrain.pop());
          }
        }
        pushTerrainWithFaction(grp, card);
        // 地雷原配置時の即座攻撃
        if (tType1 === 'MINEFIELD') {
          triggerMinefieldAttack(grp, card, 'ai');
        }
        // §7.3 捨て札扱いなのでアクションにはしない
      }
    } else {
      // §7.34 新しい地形に入る: 下のカードを全て捨て札（煙幕/鉄条網は重ねるだけ）
      const tType2 = card.terrain && card.terrain.type;
      const isOverlay2 = tType2 === 'SMOKE' || tType2 === 'WIRE';
      if (!isOverlay2) {
        // 地雷原脱出判定（自グループの新地形カードで脱出）
        const escape = processMinefieldEscape(grp, 'player');
        if (!escape.ok) {
          alert(escape.reason);
          pushTerrainToDiscard(card);
          playerDidRuleAction = true;
          return;
        }
        removeSmokeFromGroup(grp, 'player', '地形カードを配置'); // §13.241
        while (grp.terrain.length > 0) {
          pushTerrainToDiscard(grp.terrain.pop());
        }
      }
      pushTerrainWithFaction(grp, card);
      // 地形配置で側面状態解除
      grp.flankingTarget = null;
      playerDidRuleAction = true;
      if (!isOverlay2) { const _n = releaseInfiltrationOnRetreat(grp, 'player', 'terrain'); // §20.53 相対距離4で地形カード
        if (_n) setTimeout(() => alert(`GROUP ${grp.name} が相対距離4で地形カードを置いたので、敵の侵入兵 ${_n}名は侵入状態でなくなりました（§20.53）`), 50); }
    }
    } // 平地以外の地形カード
  }

  if (act === 'wire-remove') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!card || !state.fireSource) return;
    // §13.33 鉄条網の除去には移動カードを使う
    if (!card.terrain || card.terrain.type !== 'MOVEMENT') { alert('鉄条網の除去には移動カードを選択してください'); return; }
    const grp = state.groups.player[state.fireSource.idx];
    const wireIdx = (grp.terrain || []).findIndex(c => c.terrain && c.terrain.type === 'WIRE');
    if (wireIdx < 0) { alert('このグループに鉄条網がありません'); return; }
    // §13.6 鉄条網の除去はグループの1アクション（2枚あれば1ターンに1枚ずつ）
    if (state.actedGroups && state.actedGroups.has(state.fireSource.idx)) { alert('このグループは今ターン既にアクション済みです'); return; }
    const R = window.INFANTRY_RULES;
    if (R && grp.cards.some(c => R.isPinned(c))) { alert('PIN状態の兵士がいると鉄条網を除去できません'); return; }
    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(state.fireSource.idx);
    const wire = grp.terrain.splice(wireIdx, 1)[0];
    breakFlanksOn(grp); // §17.43 鉄条網の除去も移動カードを使ったことになる
    pushTerrainToDiscard(wire);
    state.playerHand.splice(cardIdx, 1);
    pushTerrainToDiscard(card);
    // 地雷原: 鉄条網除去で移動カード使用 → RNC判定
    triggerMinefieldRNCCheck(grp, 'player');
    playerDidRuleAction = true;
  }

  if (act === 'guard') {
    // §32.2 監視役の交代: 新しい監視役がピン状態でなければ、そのグループのそのターン唯一の行動として交代できる
    if (!state.fireSource || state.fireSource.side !== 'player') return;
    const gi = state.fireSource.idx;
    const grp = state.groups.player[gi];
    const R = window.INFANTRY_RULES;
    if (!R || !grp) return;
    const guards = grp.cards.filter(c => c.prisoners && c.prisoners.length);
    if (!guards.length) { alert('このグループには捕虜がいません'); return; }
    if (state.actedGroups && state.actedGroups.has(gi)) { alert('監視役の交代は、このターンにほかの行動をしていないグループだけができます（§32.2）'); return; }
    const facKey = getFactionKey(state.player);
    const cands = grp.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !isCrewAssistant(grp, c)
      && !(guards.length === 1 && guards[0] === c));
    if (!cands.length) { alert('新しい監視役にできる兵士がいません（ピン状態・補助乗員は不可）'); return; }
    const list = cands.map((c, i) => { const d = R.lookupSoldier(c, facKey); return `${i + 1}: #${c.num} ${d ? d.name : c.id}`; }).join('\n');
    const sel = parseInt(prompt(`新しい監視役を選択（番号）:\n${list}`), 10) - 1;
    if (isNaN(sel) || sel < 0 || sel >= cands.length) return;
    const ng = cands[sel];
    const all = [];
    guards.forEach(g => { all.push(...g.prisoners); g.prisoners = []; });
    ng.prisoners = all;
    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(gi);
    playerDidRuleAction = true;
  }

  if (act === 'mine-remove') {
    // §24.5 移動カードを使わずに、ピンされていない兵1人が試みる
    if (!state.fireSource) return;
    const grp = state.groups.player[state.fireSource.idx];
    const mineIdx = (grp.terrain || []).findIndex(c => c.terrain && c.terrain.type === 'MINEFIELD');
    if (mineIdx < 0) { alert('このグループに地雷原がありません'); return; }
    const R = window.INFANTRY_RULES;
    if (!R) return;
    // ピンしていない兵士1人を選択
    const candidates = grp.cards.filter(c => R.isAlive(c) && !R.isPinned(c));
    if (candidates.length === 0) { alert('地雷原排除を試みる兵士がいません（全員ピン/戦死）'); return; }
    const playerKey = getFactionKey(state.player);
    const list = candidates.map((c, i) => {
      const def = R.lookupSoldier(c, playerKey);
      return `${i+1}: #${c.num} ${def ? def.name : c.id}`;
    }).join('\n');
    const sel = prompt(`地雷原排除を試みる兵士を選択（番号）:\n${list}`);
    const selIdx = parseInt(sel, 10) - 1;
    if (isNaN(selIdx) || selIdx < 0 || selIdx >= candidates.length) { alert('キャンセル'); return; }
    const target = candidates[selIdx];
    const def = R.lookupSoldier(target, playerKey);
    const mineCard = grp.terrain[mineIdx];
    const thresholds = getMinefieldThresholds(mineCard);
    // 判定カード
    const judgeCard = drawTerrainCard();
    if (!judgeCard) return;
    const rncAbs = parseInt((judgeCard.terrain && judgeCard.terrain.range) || '0', 10) || 0;
    const isRed = judgeCard.terrain && judgeCard.terrain.rncColor === '赤';
    showJudgeCard(judgeCard);
    pushTerrainToDiscard(judgeCard);
    let msg = `${def ? def.name : target.id} の地雷原排除判定: ${isRed?'赤':'黒'}${rncAbs}\n`;
    if (!isRed && rncAbs >= thresholds.removeY) {
      // 除去成功: ゲームから完全除外
      // §24.5 成功: 地雷原カードを裏返して平地にする
      grp.terrain[mineIdx] = flipMinefieldToPlain(mineCard);
      if (!state.deckRemoved) state.deckRemoved = {};
      state.deckRemoved.MINEFIELD = (state.deckRemoved.MINEFIELD || 0) + 1;
      msg += `→ 除去成功（黒 RNC ≧ ${thresholds.removeY}）。地雷原は裏返して平地になった。`;
      alert(msg);
    } else if (isRed && rncAbs > thresholds.removeZ) {
      // §24.5 赤5・赤6: その兵が §24.31 の地雷原攻撃を受ける（RNC の数字を色に関係なく攻撃力に足す）
      const line = _minefieldAttackSoldier(grp, mineCard, 'player', target, 'abs');
      msg += `→ 排除失敗（赤 RNC > ${thresholds.removeZ}）。§24.31 地雷原攻撃\n${line || ''}`;
      alert(msg);
    } else {
      msg += `→ 排除失敗（条件不一致）。地雷原はそのまま。`;
      alert(msg);
    }
    renderField('player');
    playerDidRuleAction = true;
  }

  if (act === 'repair') {
    if (!state.fireSource) return;
    const grp = state.groups.player[state.fireSource.idx];
    const R = window.INFANTRY_RULES;
    if (!R) return;
    // PIN不可、移動中不可
    const lastT = grp.terrain.length > 0 ? grp.terrain[grp.terrain.length - 1] : null;
    const isMoving = lastT && lastT.terrain && lastT.terrain.type === 'MOVEMENT';
    if (isMoving) { alert('移動中は修理できません'); return; }
    if (isMovingIgnoringOverlays(grp)) { alert('移動中のグループの兵士は修理できません（§19.3）'); return; }
    if (R.isInMarsh(grp)) { alert('湿地内では修理できません'); return; }
    if (R.isInStream(grp)) { alert('河川内では修理できません'); return; }
    // 故障兵士を探す
    const playerKey = getFactionKey(state.player);
    const broken = grp.cards.map((c, i) => (c.malfunctioned && R.isAlive(c) && !R.isPinned(c)) ? i : -1).filter(i => i >= 0);
    if (broken.length === 0) { alert('修理可能な故障武器がありません'); return; }
    // 最初の故障兵士を修理対象
    const ci = broken[0];
    const card = grp.cards[ci];
    const def = R.lookupSoldier(card, playerKey);
    const name = def ? def.name : card.id;
    const entry = def ? getRepairEntry(playerKey, def.weaponCat) : null;
    if (!entry) { alert('この武器の修理データがありません'); return; }
    // §33.4 負傷兵は修理の前に黒の RNC が必要。赤ならこのターンは修理できず、行動は使う
    let _woundBlocked = false;
    if (R.isWoundActive(card)) {
      const wj = drawTerrainCard();
      if (wj) { showJudgeCard(wj); checkBreezeRemoveSmoke(wj); pushTerrainToDiscard(wj); }
      if (!wj || (wj.terrain && wj.terrain.rncColor === '赤')) {
        alert(`負傷兵 ${name} は修理を試みられませんでした（赤の RNC §33.4）`);
        _woundBlocked = true;
      }
    }
    if (!_woundBlocked) {
    // RNCを引く
    const judge = drawTerrainCard();
    if (!judge) return;
    showJudgeCard(judge);
    checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
    const rncVal = parseInt(judge.terrain.range, 10) || 0;
    const rncColor = judge.terrain.rncColor === '赤' ? '赤' : '黒';
    const repairR = parseRepairRange(entry.repair);
    const destroyR = parseRepairRange(entry.destroy);
    if (matchesRange(destroyR, rncColor, rncVal)) {
      card.malfunctioned = false;
      card.destroyed = true;
      alert(`武器破壊: ${name} — ${rncColor}${rncVal}`);
    } else if (matchesRange(repairR, rncColor, rncVal)) {
      card.malfunctioned = false;
      alert(`修理成功: ${name} — ${rncColor}${rncVal}`);
    } else {
      alert(`修理失敗: ${name} — ${rncColor}${rncVal}`);
    }
    }
    playerDidRuleAction = true;
  }

  if (act === 'discard') {
    if (window.DISCARD_RULES) window.DISCARD_RULES.execute();
  }

  if (act === 'recover') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!card || !state.fireSource) return;
    const grp = state.groups.player[state.fireSource.idx];
    const R = window.INFANTRY_RULES;
    if (!R) return;
    // §33.9 ヒーローカード: 負傷兵の負傷の効果（§33.2〜§33.7）を、このプレイヤーターンの間止められる
    let _heroOnWound = null;
    if (card.terrain.type === 'HERO') {
      const _w = grp.cards.filter(c => R.isAlive(c) && c.wounded && R.isWoundActive(c));
      if (_w.length) {
        const fk = getFactionKey(state.player);
        const list = _w.map((c, i) => { const d = R.lookupSoldier(c, fk); return `${i + 1}: #${c.num} ${d ? d.name : c.id} の負傷の効果を止める`; }).join('\n');
        const a = prompt(`ヒーローカードの使い方を番号で選んでください（§33.9）:\n0: ピン状態の兵士の回復に使う\n${list}`, '0');
        if (a == null) return;
        const k = parseInt(a, 10);
        if (k >= 1 && k <= _w.length) _heroOnWound = _w[k - 1];
      }
    }
    if (_heroOnWound) {
      _heroOnWound.woundSuspendedTurn = state.turnCount || 0;
      state.playerHand.splice(cardIdx, 1);
      pushTerrainToDiscard(card);
      alert('ヒーローカード: このプレイヤーターンの間、負傷の効果を止めます（§33.9）');
      playerDidRuleAction = false; // §10.4 ヒーローはアクションに数えない
    } else {
    // RALLY X → X人回復、RALLY ALL → 全員回復、HERO → 1人回復
    const pinnedIdx = grp.cards.map((c, i) => (R.isPinned(c) && R.isAlive(c)) ? i : -1).filter(i => i >= 0);
    let rallyVal = 0;
    if (card.terrain.type === 'RALLY ALL') {
      rallyVal = pinnedIdx.length;
    } else if (card.terrain.type === 'HERO') {
      rallyVal = 1;
    } else {
      rallyVal = parseInt(card.terrain.type.replace('RALLY ', ''), 10) || 0;
    }
    if (pinnedIdx.length === 0) { alert('このグループにPIN状態の兵士がいません'); return; }
    const playerKey = getFactionKey(state.player);
    const isHeroCard = card.terrain.type === 'HERO';
    // §10.2 回復カードはグループの1アクション。§10.4 ヒーローはアクションに数えない
    if (!isHeroCard && state.actedGroups && state.actedGroups.has(state.fireSource.idx)) {
      alert('このグループは今ターン既にアクション済みです');
      return;
    }
    if (rallyVal >= pinnedIdx.length) {
      // 全員回復
      const names = pinnedIdx.map(i => { const d = R.lookupSoldier(grp.cards[i], playerKey); return d ? d.name : grp.cards[i].id; });
      pinnedIdx.forEach(i => {
        R.unpinSoldier(grp.cards[i]);
        if (isHeroCard) grp.cards[i].heroRecovery = true; // §42.43
      });
      alert(`回復(${rallyVal}): ${names.join(', ')} が回復しました`);
    } else {
      // 回復対象を選択させる（簡易: 先頭から回復値分）
      // TODO: 選択UI
      const targets = pinnedIdx.slice(0, rallyVal);
      const names = targets.map(i => { const d = R.lookupSoldier(grp.cards[i], playerKey); return d ? d.name : grp.cards[i].id; });
      targets.forEach(i => {
        R.unpinSoldier(grp.cards[i]);
        if (isHeroCard) grp.cards[i].heroRecovery = true; // §42.43
      });
      alert(`回復(${rallyVal}): ${names.join(', ')} が回復しました`);
    }
    // §10.23 全回復: 条件を満たせば、もう1つのグループのピン状態の兵士も全員回復（そのグループも1アクション）
    if (card.terrain.type === 'RALLY ALL') {
      const srcIdx = state.fireSource.idx;
      const second = rallyAllPartnerCandidates('player', srcIdx);
      for (const gi of second) {
        const g2 = state.groups.player[gi];
        if (!confirm(`全回復: GROUP ${g2.name} のピン状態の兵士も回復しますか？（GROUP ${g2.name} も1アクションを使います）`)) continue;
        const names2 = [];
        g2.cards.forEach(c => {
          if (R.isPinned(c) && R.isAlive(c)) {
            R.unpinSoldier(c);
            const d = R.lookupSoldier(c, playerKey);
            names2.push(d ? d.name : c.id);
          }
        });
        if (!state.actedGroups) state.actedGroups = new Set();
        state.actedGroups.add(gi);
        alert(`全回復: GROUP ${g2.name} の ${names2.join(', ')} が回復しました`);
        break;
      }
    }
    state.playerHand.splice(cardIdx, 1);
    pushTerrainToDiscard(card);
    // §10.4 ヒーローでの回復はアクションに数えない
    playerDidRuleAction = !isHeroCard;
    }
  }

  if (act === 'snipe') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!card || !state.sniperTarget) return;
    // 攻撃側保有時は SNIPER を機能無効化（シナリオC: treatAsPlainAttacker）
    const sc = state.scenario;
    if (sc && sc.treatAsPlainAttacker && state.playerRole === 'attacker'
        && sc.treatAsPlainAttacker.indexOf('SNIPER') >= 0) {
      alert('攻撃側は狙撃カードを使用できません');
      return;
    }
    // §14.4 狙撃兵チェックで発見された後は、狙撃カードは非機能
    if (state.playerSniperDisabled) { alert('狙撃兵は発見・除去されたため、狙撃カードは使えません（§14.4）'); return; }
    // §14.1 狙撃は捨て札の代わり（国籍による捨て札の枚数制限を受ける。アクションではない）
    if (window.DISCARD_RULES && window.DISCARD_RULES.getRemainingDiscard() <= 0) {
      alert('捨て札の枚数制限により、このターンは狙撃できません（§14.1・§4.3）');
      return;
    }
    const tgt = state.sniperTarget;
    const grp = state.groups[tgt.side][tgt.grpIdx];
    // §38.7 夜間、後退中の相手を狙撃するには、そのグループの観測が必要
    if (!retrogradeObservationOk(tgt.side === 'ai' ? 'player' : 'ai', grp, tgt.grpIdx)) {
      alert('夜間に後退中の相手グループを狙撃するには、そのグループを観測している必要があります（§38.7）');
      return;
    }
    // §14.2 目標の兵士は RPC で決める
    const rpcCard = drawTerrainCard();
    if (!rpcCard) return;
    showJudgeCard(rpcCard);
    checkBreezeRemoveSmoke(rpcCard); pushTerrainToDiscard(rpcCard);
    const soldier = pickByRPC(rpcCard, grp);
    if (!soldier) return;
    if (window.DISCARD_RULES) window.DISCARD_RULES.consume(1);
    const judge = drawTerrainCard();
    showJudgeCard(judge);
    if (judge) { checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
    const rnc = parseInt((judge && judge.terrain && judge.terrain.range) || '0', 10) || 0;
    const sniperDef = card.terrain;
    const R = window.INFANTRY_RULES;
    const enemyKey = getFactionKey(state.ai);
    const def = R ? R.lookupSoldier(soldier, enemyKey) : null;
    const wasPinned = R ? R.isPinned(soldier) : false;
    // KIA/PIN範囲パース
    let kiaRange = [], pinRange = [];
    if (sniperDef && sniperDef.modifier) {
      const mk = sniperDef.modifier.match(/KIA[:\s]*([0-9\-]+)/);
      const mp = sniperDef.modifier.match(/PIN[:\s]*([0-9\-]+)/);
      kiaRange = mk ? mk[1].split('-').map(Number) : [];
      pinRange = mp ? mp[1].split('-').map(Number) : [];
    }
    let result = 'MISS';
    if (kiaRange.length === 2 && rnc >= kiaRange[0] && rnc <= kiaRange[1]) result = 'KIA';
    else if (kiaRange.length === 1 && rnc === kiaRange[0]) result = 'KIA';
    else if (pinRange.length === 2 && rnc >= pinRange[0] && rnc <= pinRange[1]) result = 'PIN';
    else if (pinRange.length === 1 && rnc === pinRange[0]) result = 'PIN';
    if (result === 'KIA') { if (R) R.killSoldier(soldier); }
    else if (result === 'PIN') {
      // §14.3 すでにピン状態ならパニック → §6.531 潰走チェック（RNCの0rの数字がパニック値以下ならKIA、より大きければ潰走）
      if (wasPinned) result = resolveSniperPanic(soldier, def, judge);
      else { if (R) R.pinSoldier(soldier); }
    }
    // §14.4 次のAIターンの狙撃兵チェック用に、狙撃のRNCを記録
    state.playerSnipeRncThisTurn = rnc;
    // §20.53 狙撃によるピン/KIA → 侵入状態解除
    if (result !== 'MISS' && soldier.infiltrating && window.CC_ACTION) {
      window.CC_ACTION.clearSoldierInfiltration(soldier);
    }
    const tgtFac = tgt.side === 'player' ? state.player : state.ai;
    const tgtFlag = (tgtFac && tgtFac.flag) ? tgtFac.flag + ' ' : '';
    const name = tgtFlag + (def ? def.name : soldier.id);
    const kiaStr = kiaRange.length ? kiaRange.join('-') : '—';
    const pinStr = pinRange.length ? pinRange.join('-') : '—';
    const snipeResults = [{ name, rnc, rncColor: '黒', result, finalFP: null, sum: rnc, morale: null, kia: null, wasPinned, snipeKia: kiaStr, snipePin: pinStr }];
    const title = `狙撃 → ${name} (KIA:${kiaStr} / PIN:${pinStr})`;
    showFireResultOverlay(title, snipeResults).then(() => {
      cleanupEliminatedGroups();
      renderField('player'); renderField('ai');
      renderHands();
    });
    state.playerHand.splice(cardIdx, 1);
    pushTerrainToDiscard(card);
    // §14.1 狙撃は捨て札扱いなのでアクションにはしない
  }
  // ===== §20.56 侵入状態の解除 =====
  if (act === 'uninfiltrate') {
    if (!state.fireSource) return;
    const R = window.INFANTRY_RULES;
    const gi = state.fireSource.idx;
    const g = state.groups.player[gi];
    if (state.actedGroups && state.actedGroups.has(gi)) { alert('このグループは今ターン既にアクション済みです'); return; }
    const infs = g.cards.filter(c => c.infiltrating && R.isAlive(c));
    if (infs.length === 0) { alert('このグループに侵入兵はいません'); return; }
    const fk = getFactionKey(state.player);
    const lst = infs.map((c, k) => { const d = R.lookupSoldier(c, fk); return `${k + 1}: ${d ? d.name : c.id}`; }).join('\n');
    const ans = prompt(`侵入状態を解く兵士の番号を入力してください（スペース区切り、空欄なら全員）\n${lst}`, '');
    if (ans == null) return;
    let picks = ans.split(/[\s,]+/).map(x => parseInt(x, 10) - 1).filter(k => k >= 0 && k < infs.length);
    if (picks.length === 0) picks = infs.map((_, k) => k);
    picks.forEach(k => { if (window.CC_ACTION) window.CC_ACTION.clearSoldierInfiltration(infs[k]); });
    alert(`§20.56 ${picks.length}名の侵入状態を解きました`);
    playerDidRuleAction = true;
  }

  // ===== §18.2 兵器の所有 =====
  if (act === 'weapon') {
    if (!state.fireSource) return;
    const R = window.INFANTRY_RULES;
    const gi = state.fireSource.idx;
    const g = state.groups.player[gi];
    const fk = getFactionKey(state.player);
    if (state.actedGroups && state.actedGroups.has(gi)) { alert('このグループは今ターン既にアクション済みです'); return; }
    // 自分のグループの兵器チット＋§20.57 侵入兵は侵入先のグループの兵器チットも
    const opts = (g.weaponPool || []).map(w => ({ w, pool: g.weaponPool, where: g, infOnly: false }));
    const seen = new Set();
    g.cards.forEach(c => {
      if (!c.infiltrating || !R.isAlive(c) || c.infiltratedGroupSide == null) return;
      const key = c.infiltratedGroupSide + ':' + c.infiltratedGroupIdx;
      if (seen.has(key)) return; seen.add(key);
      const eg = (state.groups[c.infiltratedGroupSide] || [])[c.infiltratedGroupIdx];
      (eg && eg.weaponPool || []).forEach(w => opts.push({ w, pool: eg.weaponPool, where: eg, infOnly: true, key }));
    });
    if (opts.length === 0) { alert('このグループ（と侵入先）に拾える兵器はありません'); return; }
    const wl = opts.map((o, k) => `${k + 1}: ${o.w.weaponName || o.w.weaponCat}（${o.w.weaponCat}${o.w.needsCrew ? '・クルー兵器' : ''}）${o.infOnly ? '［侵入先 GROUP ' + o.where.name + '・侵入兵のみ］' : ''}`).join('\n');
    const a1 = prompt(`拾う兵器を番号で選んでください\n${wl}`, '1');
    if (a1 == null) return;
    const opt = opts[parseInt(a1, 10) - 1];
    if (!opt) { alert('番号が正しくありません'); return; }
    const w = opt.w;
    const pool = opt.pool;
    const nameOf = c => { const d = R.lookupSoldier(c, fk); return d ? d.name : c.id; };
    // §18.22 クルー兵器: 元の助手がピン状態でなければ、助手しか所有できない（RNCなしで自動）
    const asst = (!opt.infOnly && w.needsCrew && w.assistantNum != null)
      ? g.cards.find(c => c.num === w.assistantNum && R.isAlive(c) && !R.isPinned(c) && !c.transfer) : null;
    let soldier = null, auto = false;
    if (asst) {
      if (!confirm(`クルー兵器は元の助手 ${nameOf(asst)} だけが所有できます（RNCなしで自動 §18.22）。所有させますか？`)) return;
      soldier = asst; auto = true;
    } else {
      const cands = (opt.infOnly
        ? g.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && c.infiltrating && (c.infiltratedGroupSide + ':' + c.infiltratedGroupIdx) === opt.key)
        : g.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.transfer && !c.infiltrating))
        .filter(c => !w.isDemo || demoEligible(c, fk)); // 爆薬は §21.1・§33.6 で持てる兵士だけ
      if (cands.length === 0) { alert(w.isDemo ? '爆薬を持てる兵士がいません（§21.1 小銃・突撃銃・カービン・BAR・短機関銃か非武装で、爆薬を持っていない兵士。負傷兵は主兵器と両方は持てない §33.6）' : '兵器を拾えるピン状態でない兵士がいません'); return; }
      const sl = cands.map((c, k) => `${k + 1}: ${nameOf(c)}`).join('\n');
      const a2 = prompt(`兵器を拾う兵士を番号で選んでください\n${sl}`, '1');
      if (a2 == null) return;
      soldier = cands[parseInt(a2, 10) - 1];
      if (!soldier) { alert('番号が正しくありません'); return; }
    }
    let ok = auto;
    if (!auto) {
      // §18.2 黒の RNC で成功、赤なら失敗（アクションは使う）
      const judge = drawTerrainCard();
      if (judge) { showJudgeCard(judge); checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
      ok = !!judge && !(judge.terrain && judge.terrain.rncColor === '赤');
    }
    if (ok && w.isDemo) {
      // 爆薬（副次兵器）は主兵器と交換しない
      pool.splice(pool.indexOf(w), 1);
      soldier.demoCharge = true;
      alert(`§18.2 ${nameOf(soldier)} が 爆薬 を所有しました（黒のRNC）`);
    } else if (ok) {
      // §18.21 持っていた兵器と交換（持っていた兵器は兵器チットとしてグループに残る）
      const old = weaponOfCard(soldier, fk);
      pool.splice(pool.indexOf(w), 1);
      if (old) pool.push(Object.assign({ fromNum: soldier.num, assistantNum: null, fromSide: 'player' }, old));
      const { fromNum, assistantNum, fromSide, ...weapon } = w;
      soldier.acquiredWeapon = weapon;
      // 助手だった兵士はクルーをやめる（§18.22）。自分が組んでいたクルーも解く
      if (g.crewPairs) Object.keys(g.crewPairs).forEach(o => {
        if (Number(o) === soldier.num || Number(g.crewPairs[o]) === soldier.num) delete g.crewPairs[o];
      });
      alert(`§18.2 ${nameOf(soldier)} が ${w.weaponName || w.weaponCat} を所有しました${auto ? '（助手の自動所有）' : '（黒のRNC）'}`);
    } else {
      alert('§18.2 赤のRNC — 兵器の所有に失敗しました（アクションは使いました）');
    }
    playerDidRuleAction = true;
  }

  // ===== §17.8 移送の受け取り =====
  if (act === 'receive') {
    if (!state.fireSource) return;
    const toIdx = state.fireSource.idx;
    const dst = state.groups.player[toIdx];
    if (state.actedGroups && state.actedGroups.has(toIdx)) { alert('このグループは今ターン既にアクション済みです'); return; }
    if (dst && dst.forming) { alert('設立中のグループは、地形カードを置くと設立が完了して兵士が入ります（§17.92）'); return; }
    const n = receiveTransfers('player', toIdx);
    if (n === 0) { alert('受け取れる移送中の兵士がいません（移送を始めたターンには受け取れません §17.8）'); return; }
    alert(`§17.8 GROUP ${dst.name} が ${n}名を受け取りました`);
    playerDidRuleAction = true;
  }

  // ===== §17.7 グループ側方移送 =====
  if (act === 'groupshift') {
    if (!state.fireSource) return;
    const R = window.INFANTRY_RULES;
    const fromIdx = state.fireSource.idx;
    const g = state.groups.player[fromIdx];
    const canShift = (gg, gi) => {
      if (!gg || gg.eliminated) return 'グループがありません';
      if (state.actedGroups && state.actedGroups.has(gi)) return `GROUP ${gg.name} は今ターン既にアクション済みです`;
      if (gg.cards.some(c => R.isPinned(c) && R.isAlive(c))) return `GROUP ${gg.name} にピン状態の兵士がいるため移動カードを置けません`;
      if (R.hasTerrainType(gg, 'WIRE')) return `GROUP ${gg.name} は鉄条網があるため移動できません`;
      if (R.isInStream(gg)) return `河川にいる GROUP ${gg.name} はグループ側方移送できません（§17.7）`;
      if (gg.cards.some(c => c.infiltrating)) return `敵グループに侵入している GROUP ${gg.name} はグループ側方移送できません（§17.7）`;
      if (gg.pendingShift) return `GROUP ${gg.name} はすでにグループ側方移送の途中です`;
      return null;
    };
    const why0 = canShift(g, fromIdx);
    if (why0) { alert(why0); return; }
    const moveIdxs = [...state.selectedHand].filter(i => { const c = state.playerHand[i]; return c && c.terrain && c.terrain.type === 'MOVEMENT'; });
    // 移る先: 隣の空いた位置／隣の自軍グループ（入れ替え）
    const opts = shiftDestinations('player', fromIdx).map(j => ({ idx: j, swap: false }));
    [fromIdx - 1, fromIdx + 1].forEach(j => {
      const o = state.groups.player[j];
      if (j >= 0 && j <= 3 && o && !o.eliminated && o.cards.length > 0 && !o.forming) opts.push({ idx: j, swap: true });
    });
    if (opts.length === 0) { alert('移れる隣の位置がありません（§17.7）'); return; }
    const lst = opts.map((o, k) => `${k + 1}: GROUP ${GROUP_LETTERS[o.idx]}${o.swap ? ' と入れ替わる（両方が横移動。移動カード2枚・うち1枚は側面移動カード）' : '（空いた位置）'}`).join('\n');
    const ans = prompt(`グループ側方移送の先を番号で選んでください\n${lst}`, '1');
    if (ans == null) return;
    const o = opts[parseInt(ans, 10) - 1];
    if (!o) { alert('番号が正しくありません'); return; }
    const place = (gg, card, toIdx, partnerIdx) => {
      card._moveMode = 'lateral';
      pushTerrainWithFaction(gg, card);
      // §17.7 湿地にいるグループは移動カード1枚で名称を変えられる
      gg.pendingShift = { toIdx, card, partnerIdx, ready: !!R.isInMarsh(gg) };
    };
    if (!o.swap) {
      const ci = moveIdxs[0];
      const card = state.playerHand[ci];
      state.playerHand.splice(ci, 1);
      place(g, card, o.idx, null);
      alert(g.pendingShift.ready
        ? `§17.7 湿地のため、移動カード1枚で GROUP ${GROUP_LETTERS[o.idx]} への側方移送が成立します`
        : `§17.7 GROUP ${GROUP_LETTERS[o.idx]} へ側方移送を宣言しました。この横向きの移動カードの上に地形カードが置かれて認められると成立します`);
    } else {
      const partner = state.groups.player[o.idx];
      const why1 = canShift(partner, o.idx);
      if (why1) { alert(why1); return; }
      if (moveIdxs.length < 2) { alert('入れ替えには移動カードが2枚必要です（うち1枚は側面移動カード §17.7）'); return; }
      const flankI = moveIdxs.find(i => state.playerHand[i].terrain.sub === '側面');
      if (flankI == null) { alert('入れ替えには側面移動カードが1枚必要です（§17.7）'); return; }
      const otherI = moveIdxs.find(i => i !== flankI);
      const cFlank = state.playerHand[flankI], cOther = state.playerHand[otherI];
      [flankI, otherI].sort((x, y) => y - x).forEach(i => state.playerHand.splice(i, 1));
      place(g, cOther, o.idx, o.idx);
      place(partner, cFlank, fromIdx, fromIdx);
      if (!state.actedGroups) state.actedGroups = new Set();
      state.actedGroups.add(o.idx); // 相手のグループも1アクション
      alert(`§17.7 GROUP ${g.name} と GROUP ${partner.name} の入れ替えを宣言しました。両方の横向きの移動カードの上に地形カードが置かれて認められると成立します`);
    }
    playerDidRuleAction = true;
  }

  // ===== §14.4 狙撃兵チェック =====
  if (act === 'snipercheck') {
    if (!state.fireSource) return;
    if (state.aiSniperDisabled) { alert('相手の狙撃兵はすでに除去されています'); return; }
    if (state.aiSnipeCheckRnc == null) { alert('直前の相手ターンに狙撃を受けていないため、狙撃兵チェックはできません（§14.4）'); return; }
    if (state.actedGroups && state.actedGroups.has(state.fireSource.idx)) { alert('このグループは今ターン既にアクション済みです'); return; }
    const grp = state.groups.player[state.fireSource.idx];
    const R = window.INFANTRY_RULES;
    if (!R || !grp.cards.some(c => R.isAlive(c) && !R.isPinned(c))) { alert('ピン状態でない兵士がいないグループは狙撃兵チェックができません'); return; }
    const judge = drawTerrainCard();
    if (!judge) return;
    showJudgeCard(judge);
    checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
    const num = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
    const isBlack = !(judge.terrain && judge.terrain.rncColor === '赤');
    // 黒で、狙撃に使われたRNC（色は無関係）より大きければ成功
    if (isBlack && num > state.aiSnipeCheckRnc) {
      state.aiSniperDisabled = true;
      alert(`狙撃兵チェック成功: 黒${num} > ${state.aiSnipeCheckRnc}。相手の狙撃カードは以後使えません`);
    } else {
      alert(`狙撃兵チェック失敗: ${isBlack ? '黒' : '赤'}${num}（狙撃のRNC ${state.aiSnipeCheckRnc} より大きい黒が必要）`);
    }
    playerDidRuleAction = true;
  }

  // ===== 侵入 (§20) =====
  if (act === 'infiltrate') {
    if (!state.fireSource || !state.fireTarget || !window.CC_ACTION) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    // 夜間: 認知 or 照射 されていないターゲットには侵入不可
    if (!isTargetVisibleForPlayer(srcGrp, state.fireTarget.idx, 'ai')) {
      alert('夜間: 認知されていない敵には侵入できません');
      return;
    }
    const facKey = getFactionKey(state.player) || 'us';
    const srcIdx = state.fireSource.idx;
    (async () => {
      const res = await window.CC_ACTION.executeInfiltration(
        srcGrp, tgtGrp, 'ai', state.fireTarget.idx, ccDrawCard, facKey
      );
      if (res.actionUsed) {
        if (window.DISCARD_RULES) window.DISCARD_RULES.markActed();
        if (!state.actedGroups) state.actedGroups = new Set();
        state.actedGroups.add(srcIdx);
      }
      state.selectedAction = null;
      state.selectedHand.clear();
      state.fireSource = null;
      state.fireTarget = null;
      document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
      renderField('player'); renderField('ai');
      renderHands();
      updateDeckCounts();
      updateDecideBtn();
    })();
    return;
  }

  // ===== 白兵戦 (§20) =====
  if (act === 'cc') {
    if (!state.fireSource || !window.CC_ACTION) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const facKey = getFactionKey(state.player) || 'us';
    const srcIdx = state.fireSource.idx;
    (async () => {
      const res = await window.CC_ACTION.executeCC(
        srcGrp, srcIdx, ccDrawCard, facKey
      );
      if (res.actionUsed) {
        if (window.DISCARD_RULES) window.DISCARD_RULES.markActed();
        if (!state.actedGroups) state.actedGroups = new Set();
        state.actedGroups.add(srcIdx);
      }
      state.selectedAction = null;
      state.selectedHand.clear();
      state.fireSource = null;
      state.fireTarget = null;
      document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
      cleanupEliminatedGroups();
      renderField('player'); renderField('ai');
      renderHands();
      updateDeckCounts();
      updateDecideBtn();
    })();
    return;
  }

  if (act === 'transfer') {
    if (!state.fireSource) return;
    const R = window.INFANTRY_RULES;
    const fromIdx = state.fireSource.idx;
    const srcGrp = state.groups.player[fromIdx];
    if (!R || !srcGrp) return;
    const playerKey = getFactionKey(state.player);
    // §17.8 移送する兵士1名につき移動カード1枚
    const moveIdxs = [...state.selectedHand].filter(i => { const c = state.playerHand[i]; return c && c.terrain && c.terrain.type === 'MOVEMENT'; });
    if (moveIdxs.length === 0) { alert('移動カードを選んでください（移送する兵士1名につき1枚）'); return; }
    // 移送先: 選んだ隣の自軍グループ、なければ候補から選ぶ（空いた位置なら新グループ §17.91）
    const dests = transferDestinations('player', fromIdx);
    let dest = null;
    if (state.fireTarget && state.fireTarget.side === 'player') dest = dests.find(d => d.idx === state.fireTarget.idx) || null;
    if (!dest) {
      if (dests.length === 0) { alert('移送できる隣のグループ・空いた位置がありません'); return; }
      const lst = dests.map((d, k) => `${k + 1}: GROUP ${GROUP_LETTERS[d.idx]}${d.isNew ? '（空いた位置に新しいグループを作る・2名以上）' : ''}`).join('\n');
      const a = prompt(`移送先を番号で選んでください\n${lst}`, '1');
      if (a == null) return;
      dest = dests[parseInt(a, 10) - 1];
      if (!dest) { alert('番号が正しくありません'); return; }
    }
    // 兵士を選ぶ（移動カードの枚数まで）
    const cands = srcGrp.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.infiltrating && !c.transfer);
    if (cands.length === 0) { alert('移送できる兵士がいません'); return; }
    const lst2 = cands.map((c, k) => { const d = R.lookupSoldier(c, playerKey); return `${k + 1}: ${d ? d.name : c.id}`; }).join('\n');
    const a2 = prompt(`移送する兵士を番号で選んでください（スペース区切り、${moveIdxs.length}名まで）\n${lst2}`, '1');
    if (a2 == null) return;
    const picks = [...new Set(a2.split(/[\s,]+/).map(x => parseInt(x, 10) - 1).filter(k => k >= 0 && k < cands.length))];
    if (picks.length === 0) { alert('兵士が選ばれていません'); return; }
    if (picks.length > moveIdxs.length) { alert(`移動カードが足りません（兵士 ${picks.length} 名に移動カード ${picks.length} 枚が必要）`); return; }
    const soldiers = picks.map(k => cands[k]);
    const why = transferBlockReason('player', fromIdx, dest, soldiers);
    if (why) { alert(why); return; }
    startTransfer('player', fromIdx, dest, soldiers);
    // 使った移動カード（兵士の人数分）を捨て札
    moveIdxs.slice(0, soldiers.length).sort((x, y) => y - x).forEach(i => {
      const mc = state.playerHand.splice(i, 1)[0];
      if (mc) pushTerrainToDiscard(mc);
    });
    alert(dest.isNew
      ? `§17.9 GROUP ${GROUP_LETTERS[dest.idx]} を設立中（${soldiers.length}名 移送中）。新グループに地形カードを置くと設立が完了します`
      : `§17.8 ${soldiers.length}名を GROUP ${GROUP_LETTERS[dest.idx]} へ移送中。次のターン以降、「移送受け取り」で受け取れます`);
    if (window.DISCARD_RULES) window.DISCARD_RULES.markActed();
    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(state.fireSource.idx);
    state.selectedAction = null;
    state.selectedHand.clear();
    state.fireSource = null;
    state.fireTarget = null;
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
    cleanupEliminatedGroups();
    renderField('player'); renderField('ai');
    renderHands();
    updateDecideBtn();
    return;
  }

  if (act === 'demo') {
    if (!state.fireSource || !window.CC_ACTION) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const facKey = getFactionKey(state.player) || 'us';
    const R = window.INFANTRY_RULES;
    if (!R) return;
    // 爆薬保有 + 侵入中 + 侵入したターンの兵士を探す
    const demoCard = srcGrp.cards.find(c => c && c.demoCharge && c.infiltrating && c.infiltratedThisTurn && R.isAlive(c));
    if (!demoCard) {
      alert('爆薬を使用できる兵士がいません（爆薬保有・侵入したターンの兵士のみ）');
      return;
    }
    const tgtSide = demoCard.infiltratedGroupSide;
    const tgtIdx = demoCard.infiltratedGroupIdx;
    const tgtGroup = state.groups[tgtSide] && state.groups[tgtSide][tgtIdx];
    if (!tgtGroup) { alert('侵入先のグループが特定できません'); return; }
    const tgtFacKey = getFactionKey(tgtSide === 'player' ? state.player : state.ai) || 'us';
    const srcIdx = state.fireSource.idx;
    (async () => {
      await window.CC_ACTION.executeDemoCharge(demoCard, srcGrp, 'player', tgtGroup, tgtSide, tgtIdx, ccDrawCard, facKey, tgtFacKey);
      if (window.DISCARD_RULES) window.DISCARD_RULES.markActed();
      if (!state.actedGroups) state.actedGroups = new Set();
      state.actedGroups.add(srcIdx);
      state.selectedAction = null;
      state.selectedHand.clear();
      state.fireSource = null;
      state.fireTarget = null;
      document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
      cleanupEliminatedGroups();
      renderField('player'); renderField('ai');
      renderHands();
      updateDeckCounts();
      updateDecideBtn();
    })();
    return;
  }

  state.sniperTarget = null;

  if (playerDidRuleAction && window.DISCARD_RULES) window.DISCARD_RULES.markActed();
  if (playerDidRuleAction && state.fireSource) {
    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(state.fireSource.idx);
  }

  // リセット
  state.selectedAction = null;
  state.selectedHand.clear();
  state.fireSource = null;
  state.fireTarget = null;
  document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
  btn.disabled = true;
  renderField('player'); renderField('ai');
  renderHands();
  updateDecideBtn();
});

// 判定ボタンは射撃のみ有効化（狙撃は確定ボタンで処理）
const ACTIONS_NEED_JUDGE = ['fire', 'mortar'];

function updateDecideBtn() {
  const slot = document.getElementById('judge-slot');
  if (!slot) return;
  const act = state.selectedAction;
  let ok = false;
  if (act && ACTIONS_NEED_JUDGE.indexOf(act) >= 0) {
    const needSrc = ACTIONS_NEED_SOURCE.indexOf(act) >= 0;
    const needTgt = ACTIONS_NEED_TARGET.indexOf(act) >= 0;
    const hasHand = state.selectedHand.size > 0;
    const hasSrc  = !!state.fireSource;
    const hasTgt  = !!state.fireTarget;
    ok = hasHand;
    if (needSrc) ok = ok && hasSrc;
    if (needTgt) ok = ok && hasTgt;
  }
  slot.classList.toggle('armed', ok);
}

document.getElementById('judge-slot').addEventListener('click', () => {
  const slot = document.getElementById('judge-slot');
  if (!slot.classList.contains('armed')) return;
  if (state.phase === 'play' && state.currentTurn !== 'player') return;
  const act = state.selectedAction;
  // §4.3/§14.1 捨て札をしたターンは、国籍によってはアクション（射撃）できない
  if ((act === 'fire' || act === 'mortar') && window.DISCARD_RULES && window.DISCARD_RULES.canStillAct && !window.DISCARD_RULES.canStillAct()) {
    alert('このターンは捨て札（狙撃・相手への地形配置を含む）をしたため、アクションはできません（§4.3・§14.1）');
    return;
  }
  if (act === 'fire') {
    resolveFireAction();
  } else if (act === 'mortar') {
    resolveMortarAction();
  } else {
    // 他のアクションは判定カードのみ表示 (中身は順次実装)
    const indices = [...state.selectedHand].sort((a,b) => b-a);
    indices.forEach(i => {
      const hc = state.playerHand[i];
      state.playerHand.splice(i, 1);
      if (hc) pushTerrainToDiscard(hc);
    });
    const judgeCard = drawTerrainCard();
    showJudgeCard(judgeCard);
    if (judgeCard) pushTerrainToDiscard(judgeCard);
  }
  // リセット
  state.selectedAction = null;
  state.selectedHand.clear();
  state.fireSource = null;
  state.fireTarget = null;
  document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
  renderField('player'); renderField('ai');
  renderHands();
  updateDecideBtn();
});

function showJudgeCard(card) {
  const result = document.getElementById('judge-result');
  result.innerHTML = '';
  if (!card) return;
  const img = document.createElement('img');
  img.src = card.img;
  img.onerror = () => { result.textContent = card.id; };
  result.appendChild(img);
}

function getFactionKey(facObj) {
  return Object.keys(FACTIONS).find(k => FACTIONS[k] === facObj);
}

// 日本軍がゲームに参加しているか（建物-3 / 全射撃-1 ルール用）
function isJapanInGame() {
  return (state && state.player && getFactionKey(state.player) === 'jpn') ||
         (state && state.ai     && getFactionKey(state.ai)     === 'jpn');
}

