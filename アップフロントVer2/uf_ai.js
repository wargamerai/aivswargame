// アップフロント: AI・§38 夜間の観測・山札クリック
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== 簡易 AI (優先順位ベース) =====
//   0. (最優先) 移動中の敵がいたら射撃
//   1. 鉄条網が自グループにあれば除去 (移動カード使用)
//   2. 地形+移動の両方を手札に持っていたら移動
//   3. ピン状態の兵士がいたら回復
//   4. 射撃 (任意の標的)
//   5. 不利な地形カードを相手に配置
//   それでも何もできなければ捨て札

let _aiActionQueue = Promise.resolve();
let _lastActingGroupIdx = null;
function showAIAction(text, cards, groupIdx, fireSummary) {
  try { ufReportLog('ai', text, 'ai'); } catch (e) {}
  // グループが切り替わったら中継オーバーレイを挟む（カード非表示・テキストのみ）
  if (groupIdx != null && groupIdx !== _lastActingGroupIdx) {
    const grp = state.groups.ai[groupIdx];
    const grpName = grp ? grp.name : `GROUP ${groupIdx+1}`;
    const sep = _aiActionQueue.then(() => _showAIActionImpl(`次のグループ → ${grpName}`, null));
    _aiActionQueue = sep.catch(() => {});
  }
  _lastActingGroupIdx = (groupIdx != null) ? groupIdx : _lastActingGroupIdx;
  const next = _aiActionQueue.then(() => _showAIActionImpl(text, cards, fireSummary));
  _aiActionQueue = next.catch(() => {});
  return next;
}
function _showAIActionImpl(text, cards, fireSummary) {
  return new Promise(resolve => {
    // 手番オーバーレイが消えてから表示
    const turnOv = document.getElementById('turn-overlay');
    if (turnOv) turnOv.style.opacity = '0';
    let ov = document.getElementById('ai-action-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'ai-action-overlay';
      document.body.appendChild(ov);
    }
    ov.style.cssText = 'position:fixed;top:15%;left:50%;transform:translate(-50%,0);z-index:3500;background:rgba(180,30,30,0.92);color:#fff;padding:16px 28px;border-radius:8px;border:2px solid #f66;pointer-events:auto;transition:opacity 0.4s;display:flex;flex-direction:column;align-items:center;';
    ov.innerHTML = '';
    const label = document.createElement('div');
    label.textContent = '▶ ' + text;
    label.style.cssText = 'font-size:30px;font-weight:bold;margin-bottom:12px;text-shadow:0 2px 4px rgba(0,0,0,0.7);';
    ov.appendChild(label);
    const cardList = Array.isArray(cards) ? cards : (cards ? [cards] : []);
    const valid = cardList.filter(c => c && c.img);
    if (fireSummary) {
      ov.style.width = 'max-content';
      ov.style.maxWidth = 'calc(100vw - 24px)';
      ov.style.maxHeight = '80vh';
      ov.style.overflowY = 'auto';
      ov.style.boxSizing = 'border-box';
      ov.appendChild(buildFireStrengthPreview(valid, fireSummary, true));
    } else if (valid.length > 0) {
      const row = document.createElement('div');
      const stacked = valid.length >= 4;
      row.style.cssText = stacked
        ? 'display:flex;justify-content:center;max-width:90vw;'
        : 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;max-width:90vw;';
      valid.forEach((c, idx) => {
        const img = document.createElement('img');
        img.src = c.img;
        img.style.cssText = stacked
          ? `height:260px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.5);margin-left:${idx === 0 ? 0 : -120}px;`
          : 'height:260px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
        row.appendChild(img);
      });
      ov.appendChild(row);
    }
    const btn = document.createElement('button');
    btn.textContent = '確認';
    btn.style.cssText = 'margin-top:14px;padding:10px 30px;font-size:20px;font-weight:bold;background:#fff;color:#b00;border:2px solid #fff;border-radius:6px;cursor:pointer;';
    btn.onclick = () => {
      ov.style.opacity = '0';
      ov.style.pointerEvents = 'none';
      clearTimeout(ov._timer);
      // トランジション完了を待ってから display:none にして resolve
      // (次のアクション表示と重ならないように)
      setTimeout(() => {
        ov.style.display = 'none';
        resolve();
      }, 450);
    };
    ov.appendChild(btn);
    ov.style.display = 'flex';
    ov.style.opacity = '1';
    clearTimeout(ov._timer);
  });
}

// §20 AI白兵戦: 侵入済みの兵士がいればCC実行
async function aiTryCC() {
  const CC = window.CC_ACTION;
  const R = window.INFANTRY_RULES;
  if (!CC || !R) return false;
  const aiKey = getFactionKey(state.ai);
  const acted = state.aiActedGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const grp = state.groups.ai[gi];
    if (window.AFV && window.AFV.isAfvGroup(grp)) continue;
    // トーチカ持ちグループは侵入禁止
    if (hasPillbox(grp)) continue;
    if (aiFlameShouldFire(grp, gi)) continue;
    const targets = CC.closeCombatTargets(grp).filter(({ soldiers, group, side }) => {
      if (!window.__inChart) return aiCCRankOK(grp, soldiers, group).ok;
      const faction = getFactionKey(state[side]);
      const value = (card, key, owner) => CC.getCCV(card, R.lookupSoldier(card, key) || {}, { group: owner });
      const attacker = Math.max(...soldiers.map(card => value(card, aiKey, grp)));
      return group.cards.some(card => R.isAlive(card) && value(card, faction, group) <= attacker);
    });
    if (!targets.length) continue;
    await showAIAction('AI: 白兵戦', null, gi);
    const result = await CC.aiExecuteCC(grp, gi, ccDrawCard, aiKey, targets);
    if (!result.actionUsed) continue;
    cleanupEliminatedGroups();
    renderField('player'); renderField('ai');
    renderHands();
    updateDeckCounts();
    acted.add(gi);
    return true;
  }
  return false;
}

// §20 AI侵入: 距離5の敵グループに対し侵入試行
async function aiTryInfiltrate(opts) {
  const demoOnly = !!(opts && opts.demoOnly);
  const CC = window.CC_ACTION;
  const R = window.INFANTRY_RULES;
  if (!CC || !R) return false;
  const aiKey = getFactionKey(state.ai);
  const acted = state.aiActedGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const src = state.groups.ai[gi];
    if (window.AFV && window.AFV.isAfvGroup(src)) continue; // §28.8 AFV は侵入しない
    // トーチカ持ちグループは侵入禁止
    if (hasPillbox(src)) continue;
    // ピン状態でない生存兵士が必要
    if (!src.cards.some(c => R.isAlive(c) && !R.isPinned(c))) continue;
    // 侵入兵になる兵（ピン状態でない・監視役でない・負傷していない）で白兵戦をしないランクなら、侵入しない（侵入解除と同じ基準）
    const _would = src.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.infiltrating
      && !(c.prisoners && c.prisoners.length) && !R.isWoundActive(c));
    const _demoHere = _would.some(c => c.demoCharge);
    if (demoOnly && !_demoHere) continue;
    // 火炎放射器は相対距離5なら射撃を優先（射撃カードがなければ手札を入れ替えて待つ）。爆薬も一緒にいて射撃カードがなければ、爆薬で侵入する
    const _hasFireCard = state.aiHand.some(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0);
    if (aiFlameShouldFire(src, gi) && !(_demoHere && !_hasFireCard)) continue;
    if (!window.__inChart && !_demoHere && !aiCCRankOK(src, _would).ok) continue; // 爆薬の兵がいれば止めない（火力8の攻撃）
    // チャート（2026-11-08 ユーザーの決め）: 相手のグループに、自分の一番強い兵（CCV）と同じか弱い兵が1人でもいれば侵入する。爆薬の兵がいれば止めない
    const _ccvOf = (c, key, grp) => CC.getCCV ? CC.getCCV(c, R.lookupSoldier(c, key) || {}, { group: grp }) : 0;
    const _myBest = _would.length ? Math.max(..._would.map(c => _ccvOf(c, aiKey, src))) : -Infinity;
    // 爆薬はトーチカを先に狙う（§23.5 侵入して爆薬を使える）
    const _tis = state.groups.player.map((_, x) => x).sort((a, b) => (_demoHere ? (hasPillbox(state.groups.player[b]) - hasPillbox(state.groups.player[a])) : 0) || (a - b));
    for (const ti of _tis) {
      const tgt = state.groups.player[ti];
      if (!tgt.cards.some(c => R.isAlive(c))) continue;
      if (opts && opts.noAfv && window.AFV && window.AFV.isAfvGroup(tgt)) continue; // チャート: 対人への侵入（AFV のグループは肉薄の行で）
      if (window.__inChart) { if (!_demoHere) { const _pkI = getFactionKey(state.player); const _weak = tgt.cards.filter(c => R.isAlive(c)).map(c => _ccvOf(c, _pkI, tgt)); if (!_weak.length || Math.min(..._weak) > _myBest) continue; } }
      else if (!_demoHere && !aiCCRankOK(src, _would, tgt).ok) continue; // 相手の白兵戦の値と比べて不利なら侵入しない
      if (!aiCanTargetRecognized(gi, ti)) continue; // 夜間: 未認知は侵入不可
      const chk = CC.canAttemptInfiltration(src, tgt, 'ai');
      if (!chk.ok) continue;
      if (window.__inChart && window.__infLog) { let _o = null; try { _o = aiCCRankOK(src, _would, tgt).ok; } catch (e) {} const _pkL = getFactionKey(state.player); window.__infLog.push({ nat: aiKey, scn: state.scenario && state.scenario.id, src: src.name, tgt: tgt.name, myBest: _myBest, tgtMin: Math.min(...tgt.cards.filter(c => R.isAlive(c)).map(c => _ccvOf(c, _pkL, tgt))), demo: _demoHere, oldOK: _o, turn: state.turnCount }); }
      await showAIAction('AI: 侵入', null, gi);
      const res = await CC.aiExecuteInfiltration(src, gi, tgt, 'player', ti, ccDrawCard, aiKey);
      // §21 侵入に成功した爆薬の兵は、そのターンのうちに爆薬を使う（敵が 2人以上の時）
      const _demo = src.cards.find(c => c.demoCharge && c.infiltrating && c.infiltratedThisTurn && R.isAlive(c)
        && c.infiltratedGroupSide === 'player' && c.infiltratedGroupIdx === ti);
      if (_demo && tgt.cards.filter(c => R.isAlive(c)).length >= 2 && CC.executeDemoCharge) {
        await showAIAction('AI: 爆薬', null, gi);
        await CC.executeDemoCharge(_demo, src, 'ai', tgt, 'player', ti, ccDrawCard, aiKey, getFactionKey(state.player));
        cleanupEliminatedGroups();
      }
      state.aiHandCount = (state.aiHand || []).length;
      renderField('player'); renderField('ai');
      renderHands();
      updateDeckCounts();
      acted.add(gi);
      return true;
    }
  }
  return false;
}

async function aiTurn() {
  if (state.phase !== 'play' || state.currentTurn !== 'ai' || settleDeckTimeLimit()) return;
  const R = window.INFANTRY_RULES;
  if (!R) return endAITurn();

  // 1グループ1アクション制限のためのトラッキング
  state.aiActedGroups = new Set();
  // 射撃済みグループ (射撃後は他アクション不可、射撃のみ継続可)
  state.aiFiredGroups = new Set();
  // 行動有無トラッキング（捨て札ルール用）
  state.aiActedThisTurn = false;
  state.aiActionCount = 0;
  state.aiEntrenchments = 0;
  // §7.3 相手への地形配置で使った捨て札の枚数
  state.aiDiscardedThisTurn = 0;
  state.aiDumpedThisTurn = false;
  checkWoundEndurance(); // §33.7 AI のターンの開始時
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  await runBerserkAtTurnStart('ai');
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  if (await aiCheckRandomReinforcements()) return endAITurn();
  if (!await aiEnterRandomReinforcements()) await aiEnterReinforcements();
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  // AI の作戦を最初の手番で表示する
  {
    const _stg = ((state.groups.ai || []).find(g => g && g._strategy) || {})._strategy;
    const _names = (window.SCENARIO_HELPERS && window.SCENARIO_HELPERS.AI_STRATEGY_NAMES) || {};
    const _shown = (state.groups.ai || []).some(g => g && g._strategyShown);
    if (false && _stg && !_shown) { // 作戦はゲームの間は見せない（興ざめするため）。終わった後のレポートには残す
      (state.groups.ai || []).forEach(g => { if (g) g._strategyShown = true; }); // 並びが作り直されても 1回だけ
      const _roles = (state.groups.ai || []).filter(g => g && g._role).map(g => `${g.name}=${{ fire: '火力', maneuver: '機動', assault: '突撃', support: '支援', hold: '守備' }[g._role]}`).join(' ');
      await showAIAction(`AI作戦: ${_names[_stg] || _stg}${_roles ? '（' + _roles + '）' : ''}`, null);
    }
  }
  // グループ切替中継表示用: ターン開始時にリセット
  _lastActingGroupIdx = null;
  const aiKeyT = getFactionKey(state.ai);
  const style = state.aiStyle || 'bal';

  // ===== ターンの型を決める（§4.3/§7.3: 米・ソ・日・英は捨て札をするとアクションできない） =====
  // 足止めの地形（鉄条網・河川・湿地・地雷原）が置けるなら、それがこのゲームの肝なので捨て札のターンにする。
  // ただし攻撃的な性格は、撃てる射撃があればアクションのターンを選ぶ。ドイツはアクションのあと捨て札1枚。
  let discardTurn = false;
  if (aiKeyT !== 'ger' && aiHarassAvailable()) {
    discardTurn = aiVehicleGullyAvailable() || !(style === 'aggr' && aiHasFireOption());
    // 夜間: 近づく途中か、射撃カードが貯まって撃てるなら、捨て札のターンにしない（ユーザーの指示 2026-11-03）
    if (state.isNight && (aiNightFireReady() || aiNightWantsMove())) discardTurn = false;
  }
  // 夜間に射撃に専念する段階で、射撃カードが貯まっていなければ、捨て札のターンにして手札を入れ替える（ユーザーの指示 2026-11-03）
  if (aiKeyT !== 'ger' && aiNightFocusFire() && !aiNightFireReady()) {
    const _Rn = window.INFANTRY_RULES;
    const _lit = (state.groups.player || []).some(g => g && !g.eliminated && isGroupFlared(g));
    const _pin = (state.groups.ai || []).some(g => g && !g.eliminated && g.cards.some(c => _Rn.isAlive(c) && _Rn.isPinned(c)));
    if (!_lit && !_pin) discardTurn = true;
  }
  state.aiDiscardTurn = discardTurn;
  if (!discardTurn && state.phase === 'play') {
    await aiUseRadio();
    if (state.phase === 'play') await aiUseOrdnance();
  }
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  const firedSmoke = !discardTurn && await aiTryAfvSmoke();
  if (!discardTurn && !firedSmoke && window.__chartAI && (window.__chartNat === 'all' || aiKeyT === (window.__chartNat || 'us'))) {
    await chartTurn(aiKeyT);
    return endAITurn();
  }

  if (!discardTurn && !firedSmoke) {
    // §14.4 直前のプレイヤーターンに狙撃されていれば、狙撃兵チェックを1回試みる（1アクション）
    await aiTrySniperCheck();
    // 性格で行動の優先順を変える
    const S = {
      ownTerrain: async () => (await aiTryPlaceOwnTerrain()) || (await aiTryPlaceOwnPlain()),
      rally: aiTryRally, fireMoving: aiTryFireMovingEnemy, mortar: aiTryMortar,
      mine: async () => (await aiTryMineRemove()) || (await aiTryMineLateral()),
      cross: aiTryCrossStream, wire: aiTryRemoveWire, repair: aiTryRepair, crew: aiTryCrewSetup,
      weapon: aiTryPickupWeapon, receive: aiTryReceiveTransfer, loner: aiTryTransferLoner,
      scout: aiTryScout, flare: aiTryFlare, fireLit: aiTryFireLit, cc: async () => await aiTryBanzai() || aiTryCC(), infiltrate: aiTryInfiltrate, ccRetreat: aiTryRetreatFromCC,
      flameFire: aiTryFlameFire, demoInfil: () => aiTryInfiltrate({ demoOnly: true }),
      afvOverrun: async () => window.AFV ? window.AFV.aiTryOverrun() : false, afvGun: async () => window.AFV ? window.AFV.aiTryGun() : false, afvCC: async () => window.AFV ? window.AFV.aiTryCCAfv() : false,
      fireAny: aiTryFireAny, flank: aiTryFlankEncircle, smoke: aiTryPlaceOwnSmoke, move: aiTryMove, trench: aiTryTrench,
      guard: aiTryGuardChange, heroWound: aiTryHeroWound, shift: aiTryGroupShift, uninfiltrate: aiTryUninfiltrate,
      streamExit: aiTryStreamExit,
    };
    const ORDER = {
      // 攻撃的: 白兵戦・侵入・射撃・前進を先に
      aggr: ['weapon', 'receive', 'loner', 'ccRetreat', 'uninfiltrate', 'cc', 'infiltrate', 'heroWound', 'flank', 'fireMoving', 'mortar', 'fireAny', 'smoke',
             'mine', 'cross', 'wire', 'shift', 'move', 'ownTerrain', 'rally', 'guard', 'repair', 'crew', 'scout', 'flare', 'trench'],
      // バランス: 従来の順
      bal:  ['weapon', 'receive', 'loner', 'ccRetreat', 'ownTerrain', 'rally', 'heroWound', 'flank', 'fireMoving', 'mortar', 'mine', 'cross', 'wire',
             'guard', 'repair', 'crew', 'scout', 'flare', 'uninfiltrate', 'cc', 'infiltrate', 'fireAny', 'smoke', 'shift', 'move', 'trench'],
      // 防御的: 地形・回復・射撃を先に、前進は最後
      def:  ['weapon', 'receive', 'loner', 'ccRetreat', 'ownTerrain', 'rally', 'heroWound', 'flank', 'fireMoving', 'mortar', 'fireAny', 'smoke', 'guard', 'repair',
             'crew', 'mine', 'cross', 'wire', 'scout', 'flare', 'uninfiltrate', 'cc', 'infiltrate', 'trench', 'shift', 'move'],
    }[style] || [];
    // シナリオC の防御側（守備）: 回復・射撃を最優先。前進・側方移送・侵入・側面・包囲はしない（隠蔽は撃たれた時に使う）
    const _holdAll = (state.groups.ai || []).some(g => g && g._role === 'hold');
    const ORDER_USE = _holdAll
      ? ['ccRetreat', 'rally', 'heroWound', 'fireMoving', 'mortar', 'fireAny', 'weapon', 'receive', 'repair', 'crew', 'ownTerrain', 'smoke',
         'wire', 'mine', 'cross', 'guard', 'scout', 'flare', 'trench']
      : ORDER;
    // 夜間（ユーザーの指示 2026-11-03）: 見つけたら照明弾で照らし、照らした敵を全グループで撃つ。
    //   順番: 照明弾 → 照らされた敵を射撃 → 見つけている敵を射撃 → 前進 → 索敵
    //   攻撃的な性格は、白兵戦・侵入をこれより先に行う（昼と同じ）
    //   （ユーザーの指示 2026-11-04）分隊長が索敵 → 照明弾 → 火力グループが射撃 → 移動グループが前進
    //   夜戦は移動を優先: 遠くから半減した射撃をするより、先に近づく（ユーザーの指示 2026-11-04）
    const NIGHT_FIRST = ['flare', 'fireLit', 'move', 'scout', 'fireAny'];
    let orderNow = (state.scenario && state.scenario.id === 'E') ? ['afvOverrun', 'afvGun', 'afvCC', ...ORDER_USE] : ORDER_USE; // §28 AFV を先に動かす
    if (state.isNight) {
      const rest = ORDER_USE.filter(k => NIGHT_FIRST.indexOf(k) < 0);
      const atInf = style === 'aggr' ? rest.indexOf('infiltrate') : -1;
      const at = (atInf >= 0 ? atInf : rest.indexOf('ccRetreat')) + 1;
      orderNow = [...rest.slice(0, at), ...NIGHT_FIRST, ...rest.slice(at)];
    }
    // 火炎放射器は射撃、爆薬は侵入を何より優先する（全部の国。ユーザーの指示 2026-11-04）
    {
      const _at = orderNow.indexOf('ccRetreat') + 1;
      orderNow = [...orderNow.slice(0, _at), 'flameFire', 'demoInfil', ...orderNow.slice(_at)];
    }
    // 渡河したグループは、何より先に河川から出す（地形カード → 平地 → 移動カード。ユーザーの指示 2026-11-07）
    {
      const _at = orderNow.indexOf('ccRetreat') + 1;
      orderNow = [...orderNow.slice(0, _at), 'streamExit', ...orderNow.slice(_at)];
    }
    let safety = 30;
    outer: while (state.phase === 'play' && safety-- > 0 && partisanActionRoom('ai')) {
      for (const key of orderNow) {
        if (state.phase !== 'play' || settleDeckTimeLimit()) return;
        const previousActions = state.aiActionCount;
        const r = await S[key]();
        if (!r) continue;
        if (r === 'detected') continue outer; // §38.2 索敵は失敗した時だけアクションになる
        // §10.4 ヒーローでの回復はアクションにしない。§45 日本軍の移動もアクションにしない
        if ((key === 'rally' || key === 'heroWound') && r === 'hero') continue outer;
        if (key === 'move' && aiKeyT === 'jpn') continue outer;
        if (state.aiActionCount === previousActions) markAIAction();
        continue outer;
      }
      break;
    }
  }

  // §4.3・§14.5 攻撃と通常の捨て札を決めてから攻撃を解決する。
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  const attackDiscards = planAiDiscardAttacks();
  const cowerCards = [];
  const aiKey = getFactionKey(state.ai);
  if (aiKey === 'jpn') {
    for (let i = state.aiHand.length - 1; i >= 0; i--) {
      if (handCardIsCower(state.aiHand[i], 'ai')) cowerCards.push(state.aiHand.splice(i, 1)[0]);
    }
  }
  const dumpedCards = [];
  const count = Math.min(state.aiHand.length, aiRemainingDiscard());
  const pickDiscard = aiDiscardChooser();
  for (let i = 0; i < count; i++) {
    const pick = pickDiscard();
    if (pick.idx < 0 || (aiNightFocusFire() && !pick.junk)) break;
    dumpedCards.push(state.aiHand.splice(pick.idx, 1)[0]);
  }
  state.aiHandCount = state.aiHand.length;
  await resolveAiDiscardAttacks(attackDiscards);
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  [...cowerCards, ...dumpedCards].forEach(card => {
    pushTerrainToDiscard(card);
    window.DISCARD_RULES.revealVolksDiscard('ai', card);
  });
  if (dumpedCards.length || cowerCards.length) state.aiDumpedThisTurn = true;
  renderHands();
  if (cowerCards.length) await showAIAction('AI: cower 捨て札 ' + cowerCards.length + '枚', cowerCards);
  if (dumpedCards.length) await showAIAction('AI: 捨て札 ' + dumpedCards.length + '枚', dumpedCards);
  return endAITurn();
}

function aiIsGroupMoving(g) {
  return isMovingIgnoringOverlays(g);
}

/** 夜間に AI(side='ai') がターゲットを射撃/侵入/CC してよいか判定 */
function aiCanTargetRecognized(srcGrpIdx, tgtGrpIdx) {
  if (!state.isNight) return true; // 夜間以外は不要
  const src = state.groups.ai[srcGrpIdx];
  const tgt = state.groups.player[tgtGrpIdx];
  if (!src || !tgt) return false;
  // 認知済み
  if (src.recognizedTargets && src.recognizedTargets.indexOf(tgtGrpIdx) >= 0) return true;
  // 照明弾で照らされていれば認知扱い
  if (isGroupFlared(tgt)) return true;
  return false;
}

function aiRallyValue(card) {
  const type = handRallyFace(card, 'ai')?.type || '';
  if (type === 'RALLY ALL') return 99;
  return Number(/^RALLY (\d+)$/.exec(type)?.[1]) || 0;
}

function aiProtectRally(index, faction = getFactionKey(state.ai)) {
  const value = aiRallyValue(state.aiHand[index]);
  if (!value || state.aiHand.some((card, i) => i !== index && aiRallyValue(card))) return false;
  if (faction !== 'rus' && faction !== 'jpn') return true;
  const R = window.INFANTRY_RULES;
  return state.groups.ai.some((group, i) => {
    if (!group || group.eliminated || state.aiActedGroups?.has(i) ||
        state.aiFiredGroups?.has(i)) return false;
    const top = group.terrain?.at(-1);
    if (top?.terrain?.type === 'MOVEMENT' && top._moveMode !== 'lateral') return false;
    const pinned = group.cards.filter(card => R.isAlive(card) && R.isPinned(card));
    if (!pinned.length) return false;
    if (window.AFV?.isAfvGroup(group)) return value + (group._afvRally || 0) >= 3;
    return ['fire', 'support', 'assault'].includes(group._role) ||
      pinned.some(card => R.lookupSoldier(card, faction)?.leader) || pinned.length >= 2;
  });
}

/** AI の捨て札で次に捨てるカードを選ぶ関数を作る（手札・盤面の状態はこの時点のもので計算する）。
 *  戻り値の関数 pick() は { idx, junk }。junk=true は「捨てたいカード」（非機能・狙撃・使えない射撃・距離5の後の移動・
 *  ピン状態の兵がいない時の回復・今の状態（撃てる／まだ撃てない）で残さないカード）、false は残したいカードしかない時 */
function aiDiscardChooser() {
  const aiKey = getFactionKey(state.ai);
  const goodTerrainTypes = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','GULLY'];
  const hasMovingGroup = state.groups.ai.some(g => {
    if (!g.terrain || g.terrain.length === 0) return false;
    const top = g.terrain[g.terrain.length - 1];
    return top && top.terrain && top.terrain.type === 'MOVEMENT';
  });
  // 利用可能な最大火力 (各 AI グループ × 各敵グループ ペアでの fp の最大値)
  const R_d = window.INFANTRY_RULES;
  const hasHero = state.aiHand.some(c => c && c.terrain && c.terrain.type === 'HERO');
  let maxPossibleFP = 0;
  if (R_d) {
    state.groups.ai.forEach(src => {
      if (src.eliminated) return;
      state.groups.player.forEach(tgt => {
        if (tgt.eliminated) return;
        const dist = R_d.relativeRange(src.distance, tgt.distance);
        const crewMap = buildCrewMapFromPairs(src);
        let fp = R_d.calcGroupFirepower(src, aiKey, dist, { moving: false, crewMap });
        // HERO があれば最高火力ボーナス分を加算
        if (hasHero) fp += aiCalcGroupMaxFP(src, aiKey, dist);
        if (fp > maxPossibleFP) maxPossibleFP = fp;
      });
    });
  }
  // FIRE カード: 必要火力 > 最大可能火力 → 使えない
  const isUselessFire = (c) => {
    if (!c || !c.terrain || !c.terrain.type) return false;
    if (c.terrain.type.indexOf('FIRE') !== 0) return false;
    const m = (c.terrain.sub || '').match(/FP(.)/);
    const need = circledToNum((m && m[1]) || '');
    return need > maxPossibleFP;
  };
  const findLowestRally = () => {
    let bestIdx = -1, bestVal = Infinity;
    state.aiHand.forEach((card, i) => {
      const value = aiRallyValue(card);
      if (value && value < bestVal && !aiProtectRally(i, aiKey)) {
        bestVal = value;
        bestIdx = i;
      }
    });
    return bestIdx;
  };
  // CONCEALED: 隠蔽値 (modifier) の低い順
  const getConcealVal = (c) => {
    const t = handActionFace(c, 'CONCEALED', 'ai');
    if (!t) return Infinity;
    // modifier は "-1", "-2", "-3" 等。絶対値が低いほど能力低
    const m = (t.modifier || '').replace(/[*⊙\/]/g, '').match(/-?\d+/);
    return m ? Math.abs(parseInt(m[0], 10)) : Infinity;
  };
  const findLowestConceal = () => {
    let bestIdx = -1, bestVal = Infinity;
    state.aiHand.forEach((c, i) => {
      const v = getConcealVal(c);
      if (v !== Infinity && v < bestVal) { bestVal = v; bestIdx = i; }
    });
    return bestIdx;
  };
  // 味方に不利な地形カード (敵用)
  const isAllyBadTerrain = (c) => {
    const t = c && c.terrain && c.terrain.type;
    return t === 'WIRE' || t === 'STREAM' || t === 'MARSH' || t === 'MINEFIELD';
  };
  const isHero = (c) => c && c.terrain && c.terrain.type === 'HERO';
  const isSniper = (c) => {
    if (!c || !c.terrain) return false;
    const m = c.terrain.modifier || '';
    return m.indexOf('KIA') >= 0 || m.indexOf('PIN') >= 0;
  };
  // 生き残っている AI のグループがすべて、敵のどれかと相対距離5（白兵戦の距離）にいるか
  const allAtRange5 = (() => {
    if (!R_d) return false;
    const alive = g => g && !g.eliminated && g.cards.some(c => R_d.isAlive(c));
    const mine = state.groups.ai.map((g, i) => ({ g, i })).filter(x => alive(x.g));
    if (!mine.length) return false;
    if (mine.some(x => R_d.hasTerrainType(x.g, 'WIRE') || R_d.hasTerrainType(x.g, 'MINEFIELD')
      || (R_d.isInStream(x.g) && !R_d.hasCrossedStream(x.g)))) return false;
    return mine.every(x => state.groups.player.some((e, ti) => {
      if (!alive(e)) return false;
      const base = R_d.relativeRange(x.g.distance, e.distance);
      const rr = Math.abs(x.i - ti) > 1 ? Math.max(0, base - 1) : base;
      return rr >= 5;
    }));
  })();
  const isCower = c => handCardIsCower(c, 'ai');
  // 「撃てる状態」か: 手札の射撃カードのどれかを、今の距離で使えるか（機関銃の有無などは火力の計算に入っている）。
  //   射撃カードが手札にない時は、山札の射撃カードの必要な火力の中央の値に、今の最大の火力が届くかで決める
  const isFire = c => !!(c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0);
  const isConceal = c => Boolean(handActionFace(c, 'CONCEALED', 'ai'));
  const isMove = c => Boolean(handActionFace(c, 'MOVEMENT', 'ai'));
  const isTerrainCard = c => !!(c && c.terrain && (goodTerrainTypes.indexOf(c.terrain.type) >= 0 || isAllyBadTerrain(c)));
  const canFireNow = (() => {
    // 相対距離が遠い（3未満）間は、移動と地形を揃える。近くなったら射撃（ユーザーの指示 2026-11-04）
    if (R_d && !state.groups.ai.some(g => g && g._role === 'hold')) {
      let _maxRR = 0;
      state.groups.ai.forEach((g, i) => { if (g && !g.eliminated && g.cards.some(c => R_d.isAlive(c))) _maxRR = Math.max(_maxRR, aiGroupFireNow(g, i).closest); });
      if (_maxRR < 3) return false;
    }
    const fires = state.aiHand.filter(isFire);
    if (fires.length) return fires.some(c => !isUselessFire(c));
    const needs = (typeof TERRAIN_CARDS !== 'undefined' ? TERRAIN_CARDS : [])
      .filter(t => String(t.type).indexOf('FIRE') === 0)
      .map(t => { const m = (t.sub || '').match(/FP(.)/); return circledToNum((m && m[1]) || ''); })
      .filter(n => n > 0).sort((x, y) => x - y);
    const median = needs.length ? needs[Math.floor(needs.length / 2)] : 3;
    if (state.isNight) return true; // 夜間は射撃カードを溜める（ユーザーの指示 2026-11-03）
    return maxPossibleFP >= median;
  })();
  // 鉄条網・地雷原・未渡河の河川にいるグループがあれば、移動カードは要る
  //   前進したいグループ（移動グループ）がある間も、移動カードは残す
  const needMoveCards = !!R_d && state.groups.ai.some((g, i) => g && !g.eliminated && g.cards.some(c => R_d.isAlive(c))
    && (R_d.hasTerrainType(g, 'WIRE') || R_d.hasTerrainType(g, 'MINEFIELD') || R_d.isInStream(g) || aiGroupWantsAdvance(g, i))); // 渡河したあとも河川から出るまで残す（2026-11-07）
  // 残すカード: 撃てる状態=射撃・隠蔽、まだ撃てない状態=移動・地形
  const _hold = state.groups.ai.some(g => g && g._role === 'hold');
  // 夜間に近づいている途中は、移動カードも残す（ユーザーの指示 2026-11-03）
  const nightNeedMove = !!state.isNight && aiNightWantsMove(true);
  const nightFocus = aiNightFocusFire(); // 射撃に専念する段階は、射撃カードと英雄だけ残して入れ替える
  const keep = c => nightFocus ? (isHero(c) || aiFireCardEffectiveAny(c)) : isHero(c) || (_hold && isConceal(c)) || (nightNeedMove && isMove(c)) || (needMoveCards && isMove(c)) || (canFireNow ? (isFire(c) || isConceal(c)) : (isMove(c) || isTerrainCard(c)));
  return function pick() {
    const findDiscard = test => state.aiHand.findIndex((card, i) =>
      window.DISCARD_RULES.discardCardAllowed(card, 'ai') && !aiProtectRally(i, aiKey) && test(card));
    let dumpIdx = -1;
    // 優先0: 非機能 (cower) カード
    dumpIdx = findDiscard(isCower);
    // 優先0.5: 狙撃カード（結果のばらつきが大きいので早めに捨てる）
    if (dumpIdx < 0) dumpIdx = findDiscard(isSniper);
    // 優先1: 使えない火力の射撃カード（必要な火力を、どのグループでも出せない）
    if (dumpIdx < 0) dumpIdx = findDiscard(isUselessFire);
    // 優先1.5: 全グループが相対距離5に着いた後の移動カード（鉄条網・地雷原・未渡河の河川にいるグループがあれば残す）
    if (dumpIdx < 0 && allAtRange5 && !needMoveCards) dumpIdx = findDiscard(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
    // 優先2: 残す必要のない RALLY（回復能力の低い順）
    if (dumpIdx < 0) dumpIdx = findLowestRally();
    if (canFireNow) {
      // 撃てる状態: 射撃・隠蔽を残し、移動（要らなければ）・地形から捨てる
      if (dumpIdx < 0 && !needMoveCards && !nightNeedMove) dumpIdx = findDiscard(isMove);
      if (dumpIdx < 0) dumpIdx = findDiscard(isAllyBadTerrain);
      if (dumpIdx < 0) dumpIdx = findDiscard(c => c && c.terrain && goodTerrainTypes.indexOf(c.terrain.type) >= 0);
    } else {
      // まだ撃てない状態: 移動・地形を残し、隠蔽（隠蔽値低い順）から捨てる（守備の時は隠蔽を残す）
      if (dumpIdx < 0 && !_hold) dumpIdx = findLowestConceal();
      if (dumpIdx < 0) dumpIdx = findDiscard(isAllyBadTerrain);
      // 移動中グループがあるなら、有利地形・移動・英雄以外
      if (dumpIdx < 0 && hasMovingGroup) dumpIdx = findDiscard(c => !keep(c));
    }
    // 既定: 残すカード（と英雄）以外を先頭から
    if (dumpIdx < 0) dumpIdx = findDiscard(c => !keep(c));
    if (dumpIdx >= 0) return { idx: dumpIdx, junk: true };
    // 次: 英雄以外を先頭から
    if (dumpIdx < 0) dumpIdx = findDiscard(c => !isHero(c));
    // 最後: 英雄カードしか残っていない時だけ
    if (dumpIdx < 0) dumpIdx = findDiscard(() => true);
    return { idx: dumpIdx, junk: false };
  };
}
/** 塹壕を掘ってよい手札か（全部の国。ユーザーの指示 2026-11-04）: 手札を揃えるのが優先
 *  遠い（相対距離3未満）: 移動カードと使える地形カードの両方がある／近い: 今の火力で撃てる射撃カードが3枚ある */
function aiHandReadyForTrench(g, i) {
  const R = window.INFANTRY_RULES;
  const SH = window.SCENARIO_HELPERS;
  const aiKey = getFactionKey(state.ai);
  const closest = aiGroupFireNow(g, i).closest;
  if (closest < 3) {
    const good = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','GULLY'];
    return state.aiHand.some(c => handActionFace(c, 'MOVEMENT', 'ai'))
      && state.aiHand.some(c => c && c.terrain && good.indexOf(c.terrain.type) >= 0 && !(SH && SH.isCardDisabledAsTerrain(state.scenario, c, state.aiRole === 'attacker')));
  }
  const fp = R.calcGroupFirepower(g, aiKey, closest, { moving: false, crewMap: buildCrewMapFromPairs(g) });
  return state.aiHand.filter(c => {
    if (!c || !c.terrain || String(c.terrain.type).indexOf('FIRE') !== 0) return false;
    const m = (c.terrain.sub || '').match(/FP(.)/);
    const need = circledToNum((m && m[1]) || '');
    return need > 0 && need <= fp;
  }).length >= 3;
}

async function aiTryTrench() {
  const faction = getFactionKey(state.ai);
  if (!window.__inChart && faction !== 'ger' && faction !== 'rus' &&
      state.aiHand.length > 0 && aiDiscardChooser()().junk) return false;
  if (faction === 'rus' && state.aiDiscardedThisTurn > 0 &&
      (state.aiHand.length === 0 || aiRemainingDiscard() < 1)) return false;
  const acted = (state.aiActedGroups ||= new Set());
  for (const [index, group] of state.groups.ai.entries()) {
    if (acted.has(index) || state.aiFiredGroups?.has(index) || !entrenchAllowed(group, 'ai') ||
        !aiHandReadyForTrench(group, index)) continue;
    const judge = ccDrawCard('ai');
    if (!judge) return false;
    const number = Number(judge.terrain.range);
    showJudgeCard(judge);
    if (number === 0) placeEntrenchment(group);
    if (faction === 'rus') state.aiEntrenchments = (state.aiEntrenchments || 0) + 1;
    acted.add(index);
    markAIAction();
    await showAIAction(number === 0 ? `AI: 塹壕構築成功 → GROUP ${group.name}` :
      `AI: 塹壕構築失敗（RNC ${number}）→ GROUP ${group.name}`, null, index);
    renderField('ai');
    return true;
  }
  return false;
}

// ===== §38 夜間の観測 =====
/** 照明弾に照らされているか */
function groupFlaredUntil(group) {
  if (!group || group.eliminated) return null;
  const slot = _groupSideIdx(group);
  if (!slot) return null;
  const turn = state.turnCount || 0;
  let until = group.flaredUntilTurn >= turn ? group.flaredUntilTurn : null; // 旧セーブの残り時間
  const R = window.INFANTRY_RULES;
  for (const shell of state.starshells || []) {
    if (shell.until < turn) continue;
    const groups = state.groups[shell.side];
    const target = shell.target || groups?.[shell.index];
    const activeTarget = _groupAlive(target) && groups?.includes(target);
    const index = activeTarget ? groups.indexOf(target) : shell.index;
    const distance = activeTarget ? target.distance : shell.distance;
    const offset = Math.abs(slot.idx - index);
    const lit = slot.side === shell.side ?
      offset <= 1 && group.distance === distance :
      R.relativeRangeBetweenGroups(group, { distance }, {
        sameOpposing: offset === 0, adjacent: offset === 1
      }) === 5;
    if (lit) until = Math.max(until ?? shell.until, shell.until);
  }
  return until;
}
function isGroupFlared(group) {
  return groupFlaredUntil(group) != null;
}
/** §38.3 射撃の記録（観測の修正用）: 撃ったグループと、撃たれたグループのターン番号を残す */
function markFiredAt(srcGrp, tgtGrp) {
  const t = state.turnCount || 0;
  if (srcGrp) srcGrp._firedTurn = t;
  if (tgtGrp) {
    tgtGrp._firedUponTurn = t;
  }
  if (srcGrp && tgtGrp) loseAfvAcquisitionOnFire(srcGrp, tgtGrp);
  if (state.surprise && srcGrp && tgtGrp) {
    const defender = state.surprise.defender;
    const attacker = defender === 'player' ? 'ai' : 'player';
    const defendingGroups = state.groups[defender];
    if (defendingGroups.includes(tgtGrp)) noteSurpriseAttack(attacker, defender);
    else if (defendingGroups.includes(srcGrp)) noteSurpriseAttack(defender, attacker);
  }
}
/** §38.3 観測の判定値: 現在の相対射程 + 修正。
 *  1) 目標の移動カード1枚ごと +1  3) このターンにすでに射撃を受けた +1  4) 直前の自分のターンに射撃した +1
 *  2) AFVを観測 +1  5) 観測側が閉鎖AFV −1。 */
function observationRange(srcGrp, tgtGrp) {
  const R = window.INFANTRY_RULES;
  // 現在の相対射程: 射撃と同じく、隣のさらに横（位置が2つ以上ずれ）の相手は −1（0未満にはしない）
  const source = _groupSideIdx(srcGrp), target = _groupSideIdx(tgtGrp);
  const rr = R.relativeRangeBetweenGroups(srcGrp, tgtGrp, source && target ? {
    sameOpposing: source.idx === target.idx, adjacent: Math.abs(source.idx - target.idx) === 1
  } : null);
  const t = state.turnCount || 0;
  const lines = [];
  let mods = 0;
  const moveCount = (tgtGrp.terrain || []).filter(c => c && c.terrain && c.terrain.type === 'MOVEMENT').length;
  if (moveCount) { mods += moveCount; lines.push(`移動カード ${moveCount}枚 +${moveCount}`); }
  if (window.AFV?.isAfvGroup(tgtGrp)) { mods++; lines.push('観測対象が装甲車両 +1'); }
  if (window.AFV?.isButtoned(window.AFV.afvCard(srcGrp))) { mods--; lines.push('観測側のハッチ閉鎖 −1'); }
  if (tgtGrp._firedUponTurn === t) { mods += 1; lines.push('このターンに射撃を受けた +1'); }
  if (tgtGrp._firedTurn === t - 1) { mods += 1; lines.push('直前のターンに射撃した +1'); }
  return { rr: rr, mods: mods, total: rr + mods, lines: lines };
}
/** §38.3 RNC が観測に成功するか。相対射程0は「1」を引かなければならない */
function observationSuccess(rnc, total) {
  return total <= 0 ? rnc === 1 : rnc < total;
}
/** §38.2 涸れ谷の内外を観測できるのは射程5、迫撃砲の観測、または丘と涸れ谷の間。 */
function gullyObservationAllowed(srcGrp, tgtGrp, facKey, range = observationRange(srcGrp, tgtGrp).rr) {
  const R = window.INFANTRY_RULES;
  const fromGully = R.isInGully(srcGrp);
  const intoGully = R.isInGully(tgtGrp);
  if ((!fromGully && !intoGully) || range === 5) return true;
  if (fromGully && R.currentTerrainType(tgtGrp) === 'HILL' ||
      intoGully && R.currentTerrainType(srcGrp) === 'HILL') return true;
  const M = window.MORTAR_RULES;
  return Boolean(M && !isMovingIgnoringOverlays(srcGrp) && M.canFire(srcGrp, tgtGrp).ok &&
    M.getMortarShooters(srcGrp, facKey).some(({ card, def, idx }) => !card.infiltrating &&
      ordnanceFrequency(def.range?.[range], def.needsCrew && !M.hasAssistant(srcGrp, idx))));
}

function nightObserverAvailable(group) {
  const R = window.INFANTRY_RULES;
  return Boolean(group && !group.eliminated && !group._stun && group.cards.some(card =>
    R.isAlive(card) && !R.isPinned(card) && !card.transfer && !card.infiltrating));
}
/** §38.51: 照明弾はグループではなく、照準を付けた位置と距離チットに留まる。 */
function applyStarshell(flareSide, targetIndex) {
  const side = _enemySide(flareSide);
  const target = state.groups[side][targetIndex];
  const turn = state.turnCount || 0;
  state.starshells = (state.starshells || []).filter(shell => shell.until >= turn);
  state.starshells.push({ side, index: targetIndex, distance: target.distance, target, until: turn + 3 });
}

// §5.51 火力用の0への丸めは後退の可否に使わない。
function retreatRangeAllowed(group, side, newDistance) {
  const enemies = state.groups[_enemySide(side)].map((enemy, index) => ({ enemy, index }))
    .filter(({ enemy }) => _groupAlive(enemy));
  if (!enemies.length) return !state.isNight;
  return enemies.some(({ enemy, index }) => {
    const sum = newDistance + (enemy.distance || 0);
    if (sum < 0 || sum > 10) return false;
    return !state.isNight || group.recognizedTargets?.includes(index) || isGroupFlared(enemy);
  });
}

/** §38.7 夜間は、後退の条件を満たす敵を観測している必要がある。 */
function nightRetreatAllowed(group, side, newDistance) {
  return !state.isNight || retreatRangeAllowed(group, side, newDistance);
}

/** 夜間に前進を終える位置か: 火力10に届いたら性格で分かれる（ユーザーの指示 2026-11-03）
 *  攻撃的=距離5まで前進して白兵戦を目指す / バランス・防御的=止まって射撃に専念する。火力が届かなくても距離5で終わり */
function aiNightInPlace(g, i) {
  const R = window.INFANTRY_RULES;
  const aiKey = getFactionKey(state.ai);
  let closest = 0, best = 0;
  (state.groups.player || []).forEach((e, j) => {
    if (!e || e.eliminated || !e.cards.some(c => R.isAlive(c))) return;
    const base = R.relativeRange(g.distance, e.distance);
    const rr = Math.abs(i - j) > 1 ? Math.max(0, base - 1) : base;
    if (rr > closest) closest = rr;
    best = Math.max(best, R.calcGroupFirepower(g, aiKey, rr, { moving: false, crewMap: buildCrewMapFromPairs(g) }));
  });
  if (g._role === 'hold') return true;
  if (aiStrikeNeedsPillbox(g, i)) return false;
  if (closest >= 5) return true;
  if (aiGroupHasUsableFlame(g) || aiGroupHasDemo(g) || g._role === 'maneuver') return false; // 移動グループは相対距離5まで
  if (g._role === 'fire') return closest >= 3; // 火力グループは相対距離3まで近づいて撃つ（ユーザーの指示 2026-11-04）
  return (state.aiStyle || 'bal') !== 'aggr' && best >= 10;
}
/** 夜間: 射撃に専念する段階か（攻撃的でない性格で、全グループが前進を終えた） */
function aiNightFocusFire() {
  const R = window.INFANTRY_RULES;
  if (!state.isNight || (state.aiStyle || 'bal') === 'aggr') return false;
  return (state.groups.ai || []).every((g, i) => !g || g.eliminated || !g.cards.some(c => R.isAlive(c)) || aiNightInPlace(g, i));
}
/** 夜間: まだ近づきたいグループがあるか。anyHand=true なら手札の移動カードの有無を問わない */
function aiNightWantsMove(anyHand) {
  const R = window.INFANTRY_RULES;
  if (!anyHand && !state.aiHand.some(c => handActionFace(c, 'MOVEMENT', 'ai'))) return false;
  return (state.groups.ai || []).some((g, i) => g && !g.eliminated && g.cards.some(c => R.isAlive(c)) && !aiNightInPlace(g, i));
}
/** この射撃カードが、照らした敵に効果があるか（必要な火力に届き、地形を引いても射撃力が残る） */
function aiFireCardEffectiveAt(c, ti) {
  const R = window.INFANTRY_RULES;
  const aiKey = getFactionKey(state.ai);
  const tgt = state.groups.player[ti];
  if (!tgt || tgt.eliminated || !tgt.cards.some(x => R.isAlive(x))) return false;
  if (!c || !c.terrain || String(c.terrain.type).indexOf('FIRE') !== 0) return false;
  const m = (c.terrain.sub || '').match(/FP(.)/);
  const need = circledToNum((m && m[1]) || '');
  if (!(need > 0)) return false;
  const jpOpts = { japanBuildings: isJapanInGame() };
  const japanMod = isJapanInGame() ? -1 : 0;
  const raw = parseInt(c.terrain.type.replace('FIRE ', ''), 10) || 0;
  return state.groups.ai.some((src, si) => {
    if (!src || src.eliminated || !src.cards.some(x => R.isAlive(x))) return false;
    const rel = pillboxRelation('ai', si, ti);
    if (rel === 'blocked') return false;
    const base = R.relativeRange(src.distance, tgt.distance);
    const dist = Math.abs(si - ti) <= 1 ? base : Math.max(0, base - 1);
    if ((R.isInGully(src) && dist !== 5) || (R.isInGully(tgt) && !R.canFireAtGully(src, dist, {}))) return false;
    const moving = isMovingIgnoringOverlays(src);
    const fp = R.calcGroupFirepower(src, aiKey, dist, { moving, crewMap: buildCrewMapFromPairs(src) });
    if (fp < infantryFireNeed(aiKey, src, need)) return false;
    let str = halvedFireStrength(raw, moving, false); // 照らせば夜間の半減はない（§38.52）
    if (rel === 'half') str = Math.floor(str / 2);
    const _dt = aiFlameDefTerrain(src, tgt, dist);
    const atk = R.calcTerrainMod(src.terrain, true, Object.assign({}, jpOpts, { otherStack: _dt }));
    const def = R.calcTerrainMod(_dt, false, { ...jpOpts, isFlank: si !== ti,
      otherStack: src.terrain, encircled: !!tgt.encircled, attackRange: dist });
    return str + atk + def + japanMod > 0;
  });
}
/** 手札の射撃カードのうち、照らした敵に効果がある枚数 */
function aiEffectiveFireCount(ti) {
  return state.aiHand.filter(c => aiFireCardEffectiveAt(c, ti)).length;
}
/** どれかの敵に効果がある射撃カードか */
function aiFireCardEffectiveAny(c) {
  return (state.groups.player || []).some((_, ti) => aiFireCardEffectiveAt(c, ti));
}
/** 夜間: 射撃カードが2枚貯まり、効果のある敵がいるか */
function aiNightFireReady() {
  return (state.groups.player || []).some((_, ti) => aiEffectiveFireCount(ti) >= 2);
}
/** ピン状態でない分隊長がいるか（§38.5 照明弾を使える） */
function groupHasUnpinnedSquadLeader(g, faction) {
  const R = window.INFANTRY_RULES;
  return !!g && !g.eliminated && !g._stun && g.cards.some(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c.transfer || c.infiltrating || window.AFV?.isAfvCard(c)) return false;
    const def = R.lookupSoldier(c, faction);
    return def && def.leader === '分隊長';
  });
}
/** 夜間: 照明弾で照らされている敵を撃つ（§38.52 索敵不要・射撃力の半減なし） */
async function aiTryFireLit() {
  if (!state.isNight) return false;
  const lit = state.groups.player.map((g, i) => (g && !g.eliminated && isGroupFlared(g)) ? i : -1).filter(i => i >= 0);
  if (!lit.length) return false;
  return await aiFireAt(lit);
}

async function aiTryFlare() {
  if (!state.isNight) return false;
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const acted = state.aiActedGroups || new Set();
  const aiKey = getFactionKey(state.ai);
  // 手札に FIRE カードが 2 枚以上（照らしたあとに撃つため）
  const fireCards = state.aiHand.filter(c => c && c.terrain && c.terrain.type && c.terrain.type.indexOf('FIRE') === 0);
  if (fireCards.length < (window.__inChart ? 1 : 2)) return false; // チャートでは1枚でも（2026-11-08 ユーザーの決め）
  for (let si = 0; si < state.groups.ai.length; si++) {
    if (acted.has(si)) continue;
    if (state.aiFiredGroups && state.aiFiredGroups.has(si)) continue; // §38.5 唯一の行動
    const src = state.groups.ai[si];
    if (!groupHasUnpinnedSquadLeader(src, aiKey)) continue;
    const recognizedList = src.recognizedTargets || [];
    for (const ti of recognizedList) {
      const tgt = state.groups.player[ti];
      if (!tgt || tgt.eliminated) continue;
      const { rr: dist } = observationRange(src, tgt);
      if (dist < 1 || dist > 5) continue;
      if (isGroupFlared(tgt)) continue;
      if (window.__inChart) {
        if (!(await aiHasShotAfterScouting(ti, { exceptGroup: si, assumeLit: true }))) continue;
      }
      else if (aiEffectiveFireCount(ti) < 2) continue; // 照らしても効果のある射撃を2回できないなら使わない
      applyStarshell('ai', ti); // §38.51
      acted.add(si);
      renderField('player'); renderField('ai');
      await showAIAction(`AI: 照明弾 → あなたの GROUP ${tgt.name} と周辺（索敵不要・夜間半減なし）`, null, si);
      return true;
    }
  }
  return false;
}

// 地形カード RNC 出現枚数（0〜6）— 索敵成功確率算出用
const _RNC_COUNTS = [39, 45, 50, 61, 46, 51, 8];
const _RNC_TOTAL = 300;
function _calcScoutSuccessProb(threshold) {
  if (threshold <= 0) return 0;
  let count = 0;
  for (let i = 0; i < threshold && i < _RNC_COUNTS.length; i++) {
    count += _RNC_COUNTS[i];
  }
  return count / _RNC_TOTAL;
}

// 索敵が成功した後、または照明弾が当たった後の射撃を実際の射撃条件で確認する。
async function aiHasShotAfterScouting(ti, options = {}) {
  if (!state.aiHand.some(c => c && c.terrain && String(c.terrain.type).startsWith('FIRE'))) return false;
  if (await aiFireAt([ti], { ...options, preview: true })) return true;
  const R = window.INFANTRY_RULES;
  const M = window.MORTAR_RULES;
  if (!M) return false;
  const tgt = state.groups.player[ti];
  const aiKey = getFactionKey(state.ai);
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let si = 0; si < state.groups.ai.length; si++) {
    if ((options.onlyGroup != null && si !== options.onlyGroup) || si === options.exceptGroup) continue;
    if (acted.has(si) || fired.has(si)) continue;
    const src = state.groups.ai[si];
    if (!src || src.eliminated || src.cards.some(R.isPinned) || M.isMoving(src)) continue;
    const [shooter] = M.getMortarShooters(src, aiKey);
    if (!shooter) continue;
    const acquired = isAcquiredBy(src, ti, shooter.card);
    const fireCheck = M.canFire(src, tgt, { acquired });
    if (!fireCheck.ok) continue;
    const distance = R.relativeRangeBetweenGroups(src, tgt, {
      sameOpposing: si === ti,
      adjacent: Math.abs(si - ti) === 1,
    });
    const hit = M.calcHitCeiling(shooter, distance, src, {
      pinpoint: acquired, smokePenalty: fireCheck.smokePenalty, targetSmoke: M.hasSmoke(tgt),
      night: state.isNight && !options.assumeLit && !isGroupFlared(tgt),
      guard: !!shooter.card.prisoners?.length,
      wounded: R.isWoundActive(shooter.card),
    });
    if (!hit.na && hit.ceiling >= 0) return true;
  }
  return false;
}
async function aiTryScout() {
  if (!state.isNight) return false;
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  // 手札に「打てる」FIRE カードがある場合のみ索敵
  const _fireCardsScout = state.aiHand.filter(c => c && c.terrain && c.terrain.type && c.terrain.type.indexOf('FIRE') === 0);
  // 攻撃的な性格は、距離5なら射撃カードがなくても侵入のために索敵する（ユーザーの指示 2026-11-03）
  //   爆薬のグループも、相対距離5なら同じ（夜間は認知しないと侵入できない）。撃つ気がなければ索敵しない（ユーザーの指示 2026-11-04）
  const _aggrStyle = !window.__inChart && (state.aiStyle || 'bal') === 'aggr'; // チャートでは性格を使わない
  const _demoAt5 = state.groups.ai.some((g, i) => g && !g.eliminated && aiGroupHasDemo(g) && aiGroupFireNow(g, i).closest >= 5);
  const _aggrScout = _aggrStyle || _demoAt5;
  if (_fireCardsScout.length === 0 && !_aggrScout) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  const aiKey = getFactionKey(state.ai);
  // 候補を集めて、最も近い敵を選ぶ
  let bestSi = -1, bestTi = -1, bestDist = Infinity, bestThreshold = 0;
  for (let si = 0; si < state.groups.ai.length; si++) {
    if (acted.has(si) || fired.has(si)) continue;
    const src = state.groups.ai[si];
    if (!nightObserverAvailable(src)) continue;
    if (src.cards.some(c => R.isPinned(c))) continue;
    if (src._observeTriedTurn === (state.turnCount || 0)) continue; // §38.2 1ターンに敵グループ1つだけ
    // まだ近づく途中は索敵しない。ただし分隊長のいるグループは索敵する（索敵→照明弾→射撃。ユーザーの指示 2026-11-04）
    if (!window.__inChart && !aiNightInPlace(src, si) && !groupHasUnpinnedSquadLeader(src, aiKey)) continue; // チャートでは使わない
    for (let ti = 0; ti < state.groups.player.length; ti++) {
      const tgt = state.groups.player[ti];
      if (!tgt || tgt.eliminated) continue;
      if (!tgt.cards.some(c => R.isAlive(c))) continue;
      if (src.recognizedTargets && src.recognizedTargets.indexOf(ti) >= 0) continue;
      if (isGroupFlared(tgt)) continue;
      const { rr: dist, total: threshold } = observationRange(src, tgt);
      if (!gullyObservationAllowed(src, tgt, aiKey, dist)) continue;
      const canInfiltrate = dist === 5 && Math.abs(si - ti) <= 1
        && (aiGroupHasDemo(src) || (_aggrStyle && !aiGroupHasUsableFlame(src)))
        && window.CC_ACTION && window.CC_ACTION.canAttemptInfiltration(src, tgt, 'ai').ok;
      if (!canInfiltrate && !(await aiHasShotAfterScouting(ti, { onlyGroup: si }))) {
        const canLaunchFlare = dist >= 1 && dist <= 5 && groupHasUnpinnedSquadLeader(src, aiKey)
          && (window.__inChart || aiEffectiveFireCount(ti) >= 2);
        if (!canLaunchFlare || !(await aiHasShotAfterScouting(ti, { exceptGroup: si, assumeLit: true }))) continue;
      }
      const successProb = threshold <= 0 ? _RNC_COUNTS[1] / _RNC_TOTAL : _calcScoutSuccessProb(threshold);
      if (successProb <= 0.4) continue;
      if (dist < bestDist) {
        bestDist = dist; bestSi = si; bestTi = ti; bestThreshold = threshold;
      }
    }
  }
  if (bestSi < 0) return false;
  // 索敵実行
  const src = state.groups.ai[bestSi];
  const tgt = state.groups.player[bestTi];
  const judge = drawRandomReinforcementRnc('ai');
  if (!judge) return false;
  src._observeTriedTurn = state.turnCount || 0;
  const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
  const success = observationSuccess(rncAbs, bestThreshold);
  showJudgeCard(judge);
  pushTerrainToDiscard(judge);
  if (success) {
    if (!src.recognizedTargets) src.recognizedTargets = [];
    if (src.recognizedTargets.indexOf(bestTi) < 0) src.recognizedTargets.push(bestTi);
    renderField('player'); renderField('ai');
    await showAIAction(`AI: 索敵成功 → あなたの GROUP ${tgt.name} を敵 GROUP ${src.name} が発見（夜間半減あり）`, null, bestSi);
    return 'detected'; // §38.2 成功はアクションにならない
  } else {
    await showAIAction(`AI: 索敵失敗 → GROUP ${tgt.name}`, null, bestSi);
    acted.add(bestSi);
  }
  renderField('player'); renderField('ai');
  return true;
}

function aiTryMortar() {
  const R = window.INFANTRY_RULES;
  const key = getFactionKey(state.player);
  const targetPower = plan => R.calcGroupFirepower(plan.target, key, plan.distance,
    { crewMap: buildCrewMapFromPairs(plan.target) });
  return aiUseOrdnance(plan => plan.weapon.kind === 'mortar', (a, b) => {
    if (window.__inChart) {
      const profileA = ordnanceHitProfile(a, 0);
      const profileB = ordnanceHitProfile(b, 0);
      const frequency = profile => profile.range[0] > 0 ? -profile.range[0] : profile.range[1];
      return frequency(profileB) - frequency(profileA) || targetPower(b) - targetPower(a) || a.targetIndex - b.targetIndex;
    }
    return a.source - b.source || a.targetIndex - b.targetIndex;
  });
}

async function aiTryFireMovingEnemy() {
  const movingIdxs = state.groups.player
    .map((g, i) => aiIsGroupMoving(g) ? i : -1)
    .filter(i => i >= 0);
  if (movingIdxs.length === 0) return false;
  return await aiFireAt(movingIdxs);
}

async function aiTryFireAny() {
  const all = state.groups.player.map((_, i) => i);
  return await aiFireAt(all);
}

// 夜間用: aiFireAt 内で各 src/tgt 組合せに対し認知チェックする
function aiFireAtTargetVisible(srcGrpIdx, tgtGrpIdx) {
  return aiCanTargetRecognized(srcGrpIdx, tgtGrpIdx);
}

/** §12.1 射撃カードの射撃力: 移動中は他の修正に先だって½（端数切り捨て）。
 *  §38.4 夜間は½（端数切り捨て）。§38.41 移動射撃なら2回½（2回目の前に切り捨て） */
function halvedFireStrength(raw, moving, night) {
  let s = moving ? Math.floor(raw / 2) : raw;
  if (night) s = Math.floor(s / 2);
  return s;
}

/** §12.1 例外: 必要な火力をすべて火炎放射器だけで与える射撃カードは、移動中でも半減しない */
function flameCoversNeed(group, factionKey, distance, needed) {
  const R = window.INFANTRY_RULES;
  if (!R || !group || !(needed > 0)) return false;
  const ft = group.cards.filter(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c.malfunctioned || c.destroyed || c.flameDiscarded || c._noFire) return false;
    const d = R.lookupSoldier(c, factionKey);
    return d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0;
  });
  if (ft.length === 0) return false;
  const tmp = { ...group, cards: ft };
  const fp = R.calcGroupFirepower(tmp, factionKey, distance, { moving: true, crewMap: buildCrewMapFromPairs(tmp) });
  return fp >= needed;
}

/** §10.45 ヒーローをその兵士に使った時に増えるグループ火力（2倍/3倍、機関銃は()内、迫撃砲は0） */
function heroGainForSoldier(group, card, factionKey, distance, opts) {
  const R = window.INFANTRY_RULES;
  if (!R || !card) return 0;
  const before = R.calcGroupFirepower(group, factionKey, distance, opts || {});
  const prev = card._heroEnhanced;
  card._heroEnhanced = prev ? 2 : 1;
  const after = R.calcGroupFirepower(group, factionKey, distance, opts || {});
  card._heroEnhanced = prev;
  return Math.max(0, after - before);
}

/** §10.45 ヒーローで火力が上がる兵士の候補 [{card, gain}]（増加の大きい順） */
function heroCandidates(group, factionKey, distance, opts) {
  const R = window.INFANTRY_RULES;
  if (!R) return [];
  return group.cards
    .filter(c => R.isAlive(c) && !R.isPinned(c) && !c.malfunctioned && !c.destroyed)
    .filter(c => { const d = R.lookupSoldier(c, factionKey); return !(d && d.afv); }) // §10.41・§10.45 ヒーローは AFV に使えない
    .map(c => ({ card: c, gain: heroGainForSoldier(group, c, factionKey, distance, opts) }))
    .filter(x => x.gain > 0)
    .sort((a, b) => b.gain - a.gain);
}

// AI 用: ヒーローで増やせる最大のグループ火力 (HERO ボーナス計算)
function aiCalcGroupMaxFP(group, factionKey, distance) {
  const crewMap = group.crewPairs ? buildCrewMapFromPairs(group) : {};
  const moving = isMovingIgnoringOverlays(group);
  const cands = heroCandidates(group, factionKey, distance, { moving, crewMap });
  return cands.length ? cands[0].gain : 0;
}

async function aiFireAt(targetIdxList, opts) {
  const flameOnly = !!(opts && opts.flameOnly);
  const preview = !!(opts && opts.preview);
  const onlyGroup = opts?.onlyGroup;
  const R = window.INFANTRY_RULES;
  const aiKey = getFactionKey(state.ai);
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  // FIRE カードを必要火力 (need) の昇順にソート
  const fireCardList = state.aiHand
    .map((c, i) => {
      if (!c || !c.terrain || !c.terrain.type || c.terrain.type.indexOf('FIRE') !== 0) return null;
      const m = (c.terrain.sub || '').match(/FP(.)/);
      const need = circledToNum((m && m[1]) || '');
      return { fi: i, need };
    })
    .filter(x => x && x.need > 0)
    .sort((a, b) => a.need - b.need);
  if (fireCardList.length === 0) return false;
  // HERO カードの index
  const heroIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'HERO');

  let best = null;
  const _cands = []; // 撃てる組み合わせを全部集めて、あとで一番効率のよいものを選ぶ
  // 必要火力の低い順に各 FIRE カードを試す
  for (const fc of fireCardList) {
    const fi = fc.fi;
    const card = state.aiHand[fi];
    for (let si = 0; si < state.groups.ai.length; si++) {
      // §6.6 1グループは1ターンに1回しか射撃できない
      if (acted.has(si) || fired.has(si)) continue;
      if (onlyGroup != null && si !== onlyGroup) continue;
      if (preview && si === opts.exceptGroup) continue;
      const src = state.groups.ai[si];
      if (!src || src.eliminated) continue;
      for (const ti of targetIdxList) {
        const tgt = state.groups.player[ti];
        if (!tgt) continue;
        if (tgt.cards.every(c => !R.isAlive(c))) continue;
        if (!preview && !aiCanTargetRecognized(si, ti)) continue; // 夜間: 未認知は射撃不可
        const adjacent = Math.abs(si - ti) <= 1;
        const baseDist = R.relativeRange(src.distance, tgt.distance);
        const dist = adjacent ? baseDist : Math.max(0, baseDist - 1);
        if ((R.isInGully(src) && dist !== 5) || (R.isInGully(tgt) && !R.canFireAtGully(src, dist, {}))) continue;
        const _pbRelAI = pillboxRelation('ai', si, ti); // §23.7
        if (_pbRelAI === 'blocked') continue;
        const crewMap = buildCrewMapFromPairs(src);
        const srcMoving = isMovingIgnoringOverlays(src);
        const eliteBlackFire = aiKey === 'us' && isEditorEliteFaction(aiKey) && card.terrain.rncColor === '黒';
        const fireOpts = { moving: srcMoving, crewMap, eliteBlackFire };
        const infiltration = window.CC_ACTION?.calcInfiltrationFPBonus(src, 'player', ti, aiKey, dist) || 0;
        let fp = R.calcGroupFirepower(src, aiKey, dist, fireOpts) + infiltration;
        const need = infantryFireNeed(aiKey, src, fc.need);
        // §17.4 側面射撃: 兵士火力を2倍（カード使用判定用）
        // §17.3 通常側面射撃・§17.612 包囲下も含む。火炎放射器は倍にしない
        const isFlankPre = !tgt.eliminated && isFlankFire('ai', si, ti);
        if (isFlankPre) fp = flankDoubledFP(src, aiKey, dist, fp, fireOpts);
        let transfers = [];
        let firingGroup = src;
        if (fp < need || (flameOnly && !aiGroupHasUsableFlame(src))) {
          transfers = transferFireCandidates(src, 'ai', si, dist, eliteBlackFire);
          if (transfers.length) {
            firingGroup = fireGroupWithTransfers(src, transfers);
            fp = R.calcGroupFirepower(firingGroup, aiKey, dist, fireOpts) + infiltration;
            if (isFlankPre) fp = flankDoubledFP(firingGroup, aiKey, dist, fp, fireOpts);
          }
        }
        const _flameCand = dist === 5 && aiGroupHasUsableFlame(firingGroup);
        if (flameOnly && !_flameCand) continue;
        if (fp <= 0) continue;
        const heroBonus = heroIdx >= 0 ? aiCalcGroupMaxFP(firingGroup, aiKey, dist) : 0;
        const rawBase = parseInt(card.terrain.type.replace('FIRE ', ''), 10) || 0;
        let adjBase = rawBase;
        const _tgtFlaredJudge = isGroupFlared(tgt);
        const _effNightJudge = state.isNight && !_tgtFlaredJudge && !(preview && opts.assumeLit);
        // §12.1 移動中は½（端数切り捨て）。火炎放射器だけで必要火力を満たすカードは例外
        const flameProvidesAll = flameCoversNeed(firingGroup, aiKey, dist, need);
        const movingFire = (srcMoving || transfers.length > 0) && !flameProvidesAll;
        adjBase = halvedFireStrength(rawBase, movingFire, _effNightJudge);
        if (_pbRelAI === 'half') adjBase = Math.floor(adjBase / 2); // §23.7
        const jpOpts = { japanBuildings: isJapanInGame() };
        const _dt = aiFlameDefTerrain(firingGroup, tgt, dist); // §22.1
        const atkMod = R.calcTerrainMod(src.terrain, true, Object.assign({}, jpOpts, { otherStack: _dt }));
        const _isFlankFromAdjacent = si !== ti;
        const defMod = R.calcTerrainMod(_dt, false, { ...jpOpts, isFlank: _isFlankFromAdjacent,
          otherStack: src.terrain, encircled: !!tgt.encircled, attackRange: dist });
        const gullyMod = 0; // calcTerrainMod が CSV から既に算出
        const marshDefMod = 0; // 同上
        const japanRuleMod = infantryTerrainFireMod(flameProvidesAll);
        const baseExp = adjBase + atkMod + defMod + gullyMod + marshDefMod + japanRuleMod;
        let useHero = false;
        let effectiveFP = fp;
        if (fp >= need && baseExp > 0) {
          useHero = false;
        } else if (heroIdx >= 0 && (fp + heroBonus) >= need && (baseExp + heroBonus) > 0) {
          useHero = true;
          effectiveFP = fp + heroBonus;
        } else {
          continue; // 射撃不可（最終火力0は無意味）
        }
        // ターン累積 FP チェック: 既使用 + need ≤ effectiveFP でなければ射撃不可
        const _turnedFPAi = src.firedFPThisTurn || 0;
        if (_turnedFPAi + need > effectiveFP) continue;
        _cands.push({ si, ti, fi, need, printedNeed: fc.need, fp: effectiveFP, dist, card, useHero, heroIdx, heroBonus, transfers,
          _mods: baseExp - adjBase, _moving: movingFire, _night: _effNightJudge, _half: _pbRelAI === 'half',
          _alive: tgt.cards.filter(c => R.isAlive(c)).length, _tgtMoving: aiIsGroupMoving(tgt), _defMod: defMod, _turned: _turnedFPAi, eliteBlackFire, _flame: _flameCand, _pill: hasPillbox(tgt) });
      }
    }
  }
  // 効率のよい射撃: 撃てる組み合わせの中から「最終の攻撃の値の見込み × 相手の人数」が一番大きいものを選ぶ
  //   （人数の多いグループには 1回の射撃で全員に判定が入る）。見込みは、手札の残りの射撃カードを足せるだけ足した値。
  //   見込みが 3未満の弱い射撃はしない（射撃カードをためて、まとめて強く撃つ。攻撃の値 3〜4 で効果は半分くらい）。
  //   例外: 平地を移動中の相手には見込み 2以上で撃つ（機会が短い）／手札が射撃カードだけで、もうためられない時は撃つ
  const _rawOf = fi => parseInt(state.aiHand[fi].terrain.type.replace('FIRE ', ''), 10) || 0;
  const _handFullOfFire = fireCardList.length >= state.aiHand.length;
  _cands.forEach(c => {
    const source = state.groups.ai[c.si];
    let needSum = c.printedNeed, rawSum = _rawOf(c.fi);
    fireCardList.filter(x => x.fi !== c.fi).map(x => ({ need: x.need, raw: _rawOf(x.fi) })).sort((a, b) => b.raw - a.raw)
      .forEach(x => { if (c._turned + infantryFireNeed(aiKey, source, needSum + x.need) <= c.fp) {
        needSum += x.need; rawSum += x.raw;
      } });
    let adj = halvedFireStrength(rawSum, c._moving, c._night);
    if (c._half) adj = Math.floor(adj / 2);
    c._est = adj + c._mods;
    c._score = c._est * c._alive;
    if (flameOnly && c._pill) c._score += 1000; // 火炎放射器はトーチカを先に狙う（§22.1 トーチカの修正が効かない）
  });
  const _okFire0 = c => (opts && opts.anyFire) || c._flame || c._est >= 3 || (c._tgtMoving && c._defMod >= 0 && c._est >= 2) || (_handFullOfFire && c._est >= 1);
  // チャート（2026-11-08 ユーザーの決め）: 1でも撃つ。機関銃（軽・中）を持つグループだけ、故障が怖いので
  //   「撃つ値 − 相手の一番当たりやすい兵のモラル（ピン状態はパニック値）」が −2 以上（トーチカ相手は −3 以上）。昼も夜も同じ。隠蔽は考えない
  //   撃つ相手の順番: ピン状態の兵がいる敵 → 近い敵 → 火力の高い敵
  const _pk = getFactionKey(state.player);
  const _hasMG = g => g.cards.some(c => { if (!R.isAlive(c) || c.malfunctioned || c.destroyed) return false; const d = R.lookupSoldier(c, aiKey); return !!(d && d.weaponCat && /^(軽機関銃|中機関銃)/.test(d.weaponCat)); });
  const _minMor = g => { const v = g.cards.filter(c => R.isAlive(c)).map(c => { const d = R.lookupSoldier(c, _pk); if (!d) return 99; return R.isPinned(c) ? (parseInt(d.panic, 10) || 99) : (parseInt(d.morale, 10) || 99); }); return v.length ? Math.min(...v) : 99; };
  const _okFire = c => {
    if (!window.__inChart) return _okFire0(c);
    if ((opts && opts.anyFire) || c._flame) return true;
    if (c._est <= 0) return false;
    if (!_hasMG(state.groups.ai[c.si])) return true;
    return c._est - _minMor(state.groups.player[c.ti]) >= (c._pill ? -3 : -2);
  };
  const preferTerrain = aiKey !== 'ger' && !flameOnly && aiRemainingDiscard() > 0 &&
    aiFindHarassPlay(['STREAM', 'MARSH']);
  const takeShot = c => _okFire(c) && (!preferTerrain || c._est > 3 || c._flame ||
    (c._tgtMoving && c._defMod >= 0 && c._est >= 2 &&
      state.groups.player[c.ti].cards.some(card => R.isAlive(card) && R.isPinned(card))));
  if (preview) return _cands.some(takeShot);
  const _tgtKey = c => { const t = state.groups.player[c.ti]; const pin = t.cards.some(x => R.isAlive(x) && R.isPinned(x)) ? 1 : 0; let tfp = 0; try { tfp = R.calcGroupFirepower(t, _pk, c.dist, { moving: false, crewMap: buildCrewMapFromPairs(t) }); } catch (e) {} return { pin, dist: c.dist, tfp }; };
  const _sortC = window.__inChart
    ? (a, b) => { const x = _tgtKey(a), y = _tgtKey(b); return (flameOnly ? ((b._pill ? 1 : 0) - (a._pill ? 1 : 0)) : 0) || (y.pin - x.pin) || (x.dist - y.dist) || (y.tfp - x.tfp) || (b._score - a._score); }
    : (a, b) => b._score - a._score;
  best = _cands.filter(takeShot).sort(_sortC)[0] || null;
  if (best && window.__inChart && window.__fireLog) { const g = state.groups.ai[best.si], t = state.groups.player[best.ti]; window.__fireLog.push({ nat: aiKey, scn: state.scenario && state.scenario.id, night: !!state.isNight, src: g.name, tgt: t.name, mg: _hasMG(g), est: best._est, minMor: _minMor(t), pill: !!best._pill, oldOK: _okFire0(best), dist: best.dist, n: _cands.filter(_okFire).length, turn: state.turnCount }); }
  if (!best) return false;
  // §10.45 ヒーローの火力2倍: 使うと射撃の値の合計が 2以上増えるなら使う（ピン状態の兵がいるグループでは回復に取っておく）
  if (!best.useHero && heroIdx >= 0) {
    const _hs = state.groups.ai[best.si];
    if (_hs && !_hs.cards.some(c => R.isAlive(c) && R.isPinned(c))) {
      const _turned = _hs.firedFPThisTurn || 0;
      const _raw = x => parseInt(state.aiHand[x.fi].terrain.type.replace('FIRE ', ''), 10) || 0;
      const _sumAt = cap => {
        let needSum = best.printedNeed, rawSum = _raw(best);
        fireCardList.filter(x => x.fi !== best.fi).map(x => ({ need: x.need, raw: _raw(x) })).sort((a, b) => b.raw - a.raw)
          .forEach(x => { if (_turned + infantryFireNeed(aiKey, _hs, needSum + x.need) <= cap) {
            needSum += x.need; rawSum += x.raw;
          } });
        return rawSum;
      };
      const _hb = aiCalcGroupMaxFP(fireGroupWithTransfers(_hs, best.transfers), aiKey, best.dist);
      if (_hb > 0 && _sumAt(best.fp + _hb) - _sumAt(best.fp) >= 2) {
        best.useHero = true; best.heroIdx = heroIdx; best.heroBonus = _hb; best.fp += _hb;
      }
    }
  }
  // 追加 FIRE カードは印刷された必要火力で判定する。
  // 射撃力降順でグリーディに加算 (火力最大化)
  const _bestSrcGroup = state.groups.ai[best.si];
  const _turnedFPBest = (_bestSrcGroup && _bestSrcGroup.firedFPThisTurn) || 0;
  const _primaryRawBase = parseInt(best.card.terrain.type.replace('FIRE ', ''), 10) || 0;
  let _curNeed = best.printedNeed;
  const _usedFi = new Set([best.fi]);
  const _extraCandidates = fireCardList
    .filter(x => !_usedFi.has(x.fi))
    .map(x => {
      const c = state.aiHand[x.fi];
      const rb = parseInt(c.terrain.type.replace('FIRE ', ''), 10) || 0;
      return { fi: x.fi, card: c, rawBase: rb, need: x.need };
    })
    .sort((a, b) => b.rawBase - a.rawBase);
  best.extras = [];
  for (const ex of _extraCandidates) {
    if (best.eliteBlackFire && ex.card.terrain.rncColor !== '黒') continue;
    if (_turnedFPBest + infantryFireNeed(aiKey, _bestSrcGroup, _curNeed + ex.need) > best.fp) continue;
    best.extras.push(ex);
    _usedFi.add(ex.fi);
    _curNeed += ex.need;
  }
  best.totalNeed = infantryFireNeed(aiKey, _bestSrcGroup, _curNeed); // 累積加算用
  // ===== DEBUG LOG =====
  try {
    const _extraDesc = best.extras.length > 0
      ? ' extras=['+best.extras.map(e => e.card.terrain.type).join(',')+'] rawSum='+_curRawSum+' needSum='+_curNeed
      : '';
    console.log('[FIRE-AI selected] si='+best.si+' ti='+best.ti
      +' card="'+best.card.terrain.type+'" range='+best.card.terrain.range+' sub="'+best.card.terrain.sub+'"'
      +' need='+best.need+' fp='+best.fp+' dist='+best.dist+' score='+best.score+_extraDesc);
  } catch(e){}
  // =====================
  // 射撃はアクション数に数えない（カードがあれば何度でも撃てる）
  // ただし射撃したグループは他のアクション不可
  fired.add(best.si);
  return await aiPerformFire(best);
}

function aiPerformFire(plan) {
  return withDeckAttack(() => aiPerformFireInProgress(plan));
}

function aiPerformFireInProgress(plan) {
 return new Promise(_aiFireResolve => {
  const R = window.INFANTRY_RULES;
  const playerKey = getFactionKey(state.player);
  const src = state.groups.ai[plan.si];
  const tgt = state.groups.player[plan.ti];
  const transfers = plan.transfers || [];
  const firingGroup = fireGroupWithTransfers(src, transfers);

  const jpOpts = { japanBuildings: isJapanInGame() };
  const _isFlankFromAdjacent = plan.si !== plan.ti;
  const _flameDt = aiFlameDefTerrain(firingGroup, tgt, plan.dist); // §22.1 火炎放射器の攻撃は防御側の地形の修正を受けない
  const _defOpts = { ...jpOpts, isFlank: _isFlankFromAdjacent, otherStack: src.terrain,
    encircled: !!tgt.encircled, attackRange: plan.dist };
  const _atkOptsA = Object.assign({}, jpOpts, { otherStack: _flameDt });
  const atkBreakdown = R.getTerrainModBreakdown ? R.getTerrainModBreakdown(src.terrain, true, _atkOptsA) : [];
  const defBreakdown = R.getTerrainModBreakdown ? R.getTerrainModBreakdown(_flameDt, false, _defOpts) : [];
  const atkMod = R.calcTerrainMod(src.terrain, true, _atkOptsA);
  const defMod = R.calcTerrainMod(_flameDt, false, _defOpts);
  // 射撃力 = プライマリ + 追加 FIRE カード（合計射撃力は plan.fp 以下が保証済み）
  const _primRaw = parseInt(plan.card.terrain.type.replace('FIRE ', ''), 10) || 0;
  const _extrasRaw = (plan.extras || []).reduce((s, ex) => s + (ex.rawBase || 0), 0);
  const ambush = partisanCanAmbush('ai',src,tgt)
    ? state.aiHand.find(c => c?.terrain?.type === 'CONCEALED' && getConcealMod([c]) < 0) : null;
  const rawBaseStrength = _primRaw + _extrasRaw + (ambush ? Math.abs(getConcealMod([ambush])) : 0);
  // §12.1/§6.4 横移動も移動中。火炎放射器だけで必要火力を満たすカードは半減しない
  const _planNeed = plan.totalNeed != null ? plan.totalNeed : plan.need;
  const flameProvidesAll = flameCoversNeed(firingGroup, getFactionKey(state.ai), plan.dist, _planNeed);
  const srcMoving = (isMovingIgnoringOverlays(src) || transfers.length > 0) && !flameProvidesAll;
  // 移動は½（端数切り捨て）、夜間は別に½。ターゲットが照らされていれば夜間効果スキップ
  const _tgtFlaredAI = isGroupFlared(tgt);
  const _effNight = state.isNight && !_tgtFlaredAI;
  const strengthAfterMove = halvedFireStrength(rawBaseStrength, srcMoving, false);
  const strengthAfterNight = halvedFireStrength(strengthAfterMove, false, _effNight);
  const pillboxHalf = pillboxRelation('ai', plan.si, plan.ti) === 'half';
  const baseStrength = pillboxHalf ? Math.floor(strengthAfterNight / 2) : strengthAfterNight; // §23.7
  const strengthMods = [];
  if (srcMoving) strengthMods.push(`移動半減 -${rawBaseStrength - strengthAfterMove}`);
  if (_effNight) strengthMods.push(`夜間半減 -${strengthAfterMove - strengthAfterNight}`);
  if (state.isNight && _tgtFlaredAI) strengthMods.push('照明弾で照らされている ・ 夜間半減なし');
  if (pillboxHalf) strengthMods.push(`トーチカとの射撃半減 -${strengthAfterNight - baseStrength}`);
  const japanRuleMod = infantryTerrainFireMod(flameProvidesAll);
  const mods = strengthMods.slice();
  atkBreakdown.forEach(x => {
    const label = x.type === 'MOVEMENT' ? '攻撃側移動カード' : `攻撃側 ${x.type}`;
    mods.push(`${label} ${_sgn(x.mod)}`);
  });
  defBreakdown.forEach(x => {
    const label = x.type === 'MOVEMENT' ? '防御側移動カード' : `防御側 ${x.type}`;
    mods.push(`${label} ${_sgn(x.mod)}`);
  });
  if (japanRuleMod) mods.push(`${state.scenario?.jungleMode ? 'ジャングル' : '日本ルール'} ${_sgn(japanRuleMod)}`);
  const armorSupport = Number(window.AFV?.adjacentArmorSupport(tgt) || 0);
  const unConcealedStrength = baseStrength + atkMod + defMod + japanRuleMod - armorSupport;
  const smokeChange = trackFireSmoke(src, tgt);
  const fireCards = [plan.card, ...(plan.extras || []).map(ex => ex.card), ambush].filter(Boolean);
  const heroCard = plan.useHero ? state.aiHand[plan.heroIdx] : null;

  // §10.4 攻撃の解決前にヒーローでピン状態の兵士を回復できる → その後、隠蔽カード選択（§9.5 トーチカは不可）
  setIncomingAttack({
    si: plan.si, ti: plan.ti,
    title: `敵の GROUP ${src.name} が あなたの GROUP ${tgt.name} を射撃します`,
    cards: fireCards,
    fireSummary: { raw: rawBaseStrength, mods, total: unConcealedStrength },
    lines: [`距離 ${plan.dist}`, '隠蔽カードを使うと、その数字だけ火力が下がります'],
  });
  askPlayerHeroRally(tgt).then(() => canUseConcealment(tgt) ? askPlayerConcealment() : []).then(async concealCards => {
    clearIncomingAttack();
    const concealMod = getConcealMod(concealCards, 'player');
    const gullyMod = 0; // calcTerrainMod が CSV から既に算出
    const marshDefMod = 0; // 同上
    // §20.51 AI侵入兵の火力2倍は calcInfiltrationFPBonus で加算済み。コラムシフトは無し。
    const aiInfShift = 0;
    // §17.4 側面射撃: 手動設定フラグ参照。§17.612 包囲下は自動で側面射撃扱い
    // 火力倍化は兵士火力（calcGroupFirepower）側で適用済み。基礎射撃力は変えない
    const isFlankFireNow = !tgt.eliminated && isFlankFire('ai', plan.si, plan.ti);
    // HERO 使用時のボーナス
    let heroBonus = 0;
    if (plan.useHero && plan.heroIdx != null && plan.heroIdx >= 0) {
      if (heroCard && heroCard.terrain && heroCard.terrain.type === 'HERO') {
        heroBonus = aiCalcGroupMaxFP(firingGroup, getFactionKey(state.ai), plan.dist);
        // §10.45 英雄効果: ターン中、火力が一番増える兵士1名を2倍（2枚目なら3倍）
        const _crewMapAi = buildCrewMapFromPairs(firingGroup);
        const _heroCandsAi = heroCandidates(firingGroup, getFactionKey(state.ai), plan.dist,
          { moving: isMovingIgnoringOverlays(src), crewMap: _crewMapAi });
        if (_heroCandsAi.length > 0) {
          const _pickedAi = _heroCandsAi[0].card;
          _pickedAi._heroEnhanced = _pickedAi._heroEnhanced ? 2 : 1;
        }
        // HERO カードを手札から除去して捨て札へ
        state.aiHand.splice(state.aiHand.indexOf(heroCard), 1);
        pushTerrainToDiscard(heroCard);
      }
    }
    // §10.45 英雄カード：必要火力の判定にのみ加算（基礎火力は変えない）
    const baseFP = unConcealedStrength + concealMod + gullyMod + marshDefMod + aiInfShift;
    const defenders = attackTargetsOf(tgt).filter(R.isAlive);
    const trenchModifier = defBreakdown.find(item => item.type === 'TRENCH')?.mod || 0;
    const strengthAgainst = card => {
      const vehicle = window.AFV?.isAfvCard(card);
      const gunSupportCorrection = infantryGunProfile(card, 'player') ? armorSupport : 0;
      return baseFP + smokeChange(!vehicle) + gunSupportCorrection +
        personnelDefenseAdjustment(card, 'player', vehicle ? 0 : trenchModifier, concealMod) - (vehicle ? defMod : 0);
    };
    // §6.5 隠蔽で全員への射撃力がゼロ以下なら放棄する。続行する場合は敵全員を判定する。
    const resolveAttack = concealMod >= 0 || defenders.some(card => strengthAgainst(card) > 0);
    if (resolveAttack) markFiredAt(src, tgt); // §38.3 観測の修正用
    // ===== DEBUG LOG =====
    try {
      console.log('[FIRE-AI exec] card="'+plan.card.terrain.type+'" range='+plan.card.terrain.range+' sub="'+plan.card.terrain.sub+'"'
        +' src.idx='+plan.si+' src.dist='+src.distance
        +' tgt.idx='+plan.ti+' tgt.dist='+tgt.distance+' plan.dist='+plan.dist
        +' baseStrength='+baseStrength+' isFlankFire='+isFlankFireNow
        +' atkMod='+atkMod+' defMod='+defMod+' concealMod='+concealMod
        +' gullyMod='+gullyMod+' marshDefMod='+marshDefMod+' aiInfShift='+aiInfShift
        +' baseFP='+baseFP);
    } catch(e){}
    // =====================
    let malfuncMod = 0;

    const results = [];
    // プライマリ + 追加 FIRE カードを全て手札から除去し捨て札へ
    for (const card of fireCards) {
      const index = state.aiHand.indexOf(card);
      if (index < 0) continue;
      state.aiHand.splice(index, 1);
      pushTerrainToDiscard(card);
    }
    markTransferFire(transfers);
    state.aiHandCount = state.aiHand.length;
    let lastJudge = null;
    state._malfStopAttack = false;
    for (const card of resolveAttack ? defenders : []) {
      if (state._malfStopAttack) break; // §19.11 残りの防御側の攻撃は解決しない
      if (!R.isAlive(card)) continue;
      const vehicle = window.AFV?.isAfvCard(card);
      const finalFP = strengthAgainst(card) + malfuncMod;
      const judge = drawRandomReinforcementRnc('ai');
      if (!judge) continue;
      lastJudge = judge;
      const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
      const isRed = judge.terrain && judge.terrain.rncColor === '赤';
      const rnc = isRed ? -rncAbs : rncAbs;
      const rpc0r = parseInt((judge.terrain && judge.terrain.dice && judge.terrain.dice['0r']) || '0', 10) || 0;
      const def = R.lookupSoldier(card, playerKey);
      const wasPinned = R.isPinned(card);
      const commissarMod = commissarModOf(tgt, card);
      const malfMoraleMod = -R.weaponMoralePenalty(card, def);
      // §17.613 包囲下のピン兵士はパニック値-1
      const encircleMod = (tgt && tgt.encircled && wasPinned) ? -1 : 0;
      const moraleMod = commissarMod + malfMoraleMod;
      const panicMod = moraleMod + encircleMod;
      const r = vehicle ? { result: window.AFV.applyExposedCrewHit(card, finalFP + rnc) } :
        R.resolveFireOnSoldier(finalFP, rnc, def, wasPinned, rpc0r, moraleMod,
          panicMod, 0, R.rpc7wOf(judge), isFlankFireNow);
      let actualResult2 = berserkFireResult(r, tgt, card, def, 'player', rpc0r);
      if (actualResult2 === 'WOUND') actualResult2 = applyWound(card);
      if (actualResult2 === 'KIA' || actualResult2 === 'PANIC_KIA') R.killSoldier(card);
      else if (actualResult2 === 'PANIC_ROUT') R.routSoldier(card);
      else if (actualResult2 === 'PIN') actualResult2 = applyPersonnelPin(card);
      // §20.53 ピン/KIA/潰走 → 侵入状態解除
      if (actualResult2 !== 'NONE' && actualResult2 !== 'BERSERK' && actualResult2 !== 'WOUND' && card.infiltrating && window.CC_ACTION) {
        window.CC_ACTION.clearSoldierInfiltration(card);
      }
      if ((actualResult2 === 'KIA' || actualResult2 === 'PANIC_KIA' || actualResult2 === 'PANIC_ROUT') && def && def.leader && def.leader === '分隊長') {
        applySLDamagePenalty('player');
      }
      const { morale, kia } = vehicle ? {} :
        R.fireDefenseValues(def, wasPinned, wasPinned ? panicMod : moraleMod, 0, isFlankFireNow);
      const tgtFlag = (state.player && state.player.flag) ? state.player.flag + ' ' : '';
      results.push({ name: tgtFlag + (def ? def.name : card.id), result: actualResult2, rnc, rncColor: isRed ? '赤' : '黒', finalFP, sum: finalFP + rnc, morale, kia, wasPinned });
      // ===== DEBUG LOG =====
      try {
        console.log('[FIRE-AI hit] target='+(def?def.name:card.id)
          +' judge.type="'+(judge.terrain&&judge.terrain.type)+'"'
          +' rncAbs='+rncAbs+' rncColor='+(isRed?'赤':'黒')+' rnc='+rnc
          +' finalFP='+finalFP+' combatResult='+(finalFP+rnc)
          +' wasPinned='+wasPinned+' morale='+morale+' kia='+kia
          +' result='+actualResult2);
      } catch(e){}
      // =====================
      const aiKey = getFactionKey(state.ai);
      malfuncMod += checkMalfunction(judge, firingGroup, aiKey, plan.dist, baseFP + malfuncMod);
      checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
    }
    if (lastJudge) showJudgeCard(lastJudge);

    if (concealMod) mods.push(`隠蔽 ${_sgn(concealMod)}`);
    if (!resolveAttack) {
      renderHands();
      await showAIAction(`AI: 射撃取り消し ${src.name}→${tgt.name}`, fireCards, plan.si,
        { raw: rawBaseStrength, mods, total: baseFP });
      _aiFireResolve(true);
      return;
    }
    // ターン累積 FP を加算 (このグループの今ターン射撃合計に追加)
    src.firedFPThisTurn = (src.firedFPThisTurn || 0) + (plan.totalNeed != null ? plan.totalNeed : plan.need);
    if (!state._malfStopAttack) {
      const boxed = window.AFV?.boxedAfterFire(src, tgt, _planNeed, baseFP - defMod + malfuncMod + smokeChange(false), firingGroup);
      if (boxed) results.push(boxed);
      results.push(...infantryGunBoxedFire(firingGroup, tgt, 'player', plan.dist, fireCards,
        baseFP + malfuncMod + armorSupport, concealMod, isFlankFireNow, trenchModifier, smokeChange));
    }
    if (window.CC_ACTION) window.CC_ACTION.clearInfiltration(src, 'fire'); // §20.531 射撃に参加した侵入兵は侵入状態を失う

    const varies = results.some(result => result.finalFP !== baseFP);
    const title = `AI射撃 ${src.name}→${tgt.name} 距離${plan.dist} 基礎射撃力${rawBaseStrength}<br/>修正項目:<br/>${mods.length ? mods.join('<br/>') : 'なし'}<br/>→ 最終火力${baseFP}${varies ? '<br/>兵士ごとの修正は判定結果に表示' : ''}`;
    await showAIAction(`AI: 射撃 ${src.name}→${tgt.name}`, fireCards, plan.si,
      { raw: rawBaseStrength, mods, total: baseFP, varies });
    showFireResultOverlay(title, results, fireCards).then(() => {
      cleanupEliminatedGroups();
      renderField('player'); renderField('ai');
      renderHands();
      // AI射撃完了 → Promise を解決
      setTimeout(() => _aiFireResolve(true), 1500);
    });
  });
 });
}

function aiPerformFireDone() {
  // 互換維持用 (現在は aiPerformFire 内の resolve で処理)
}

async function aiTryRemoveWire() {
  const R = window.INFANTRY_RULES;
  const moveIdx = aiActionCardIndex('MOVEMENT');
  if (moveIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    const wireIdx = (g.terrain || []).findIndex(c => c.terrain && c.terrain.type === 'WIRE');
    if (wireIdx < 0) continue;
    // §13.34 ピン状態がいると除去不可
    if (g.cards.some(c => R.isPinned(c))) continue;
    const wire = g.terrain.splice(wireIdx, 1)[0];
    discardUnclaimedWeapons(g);
    abandonUnsupportedHeavyWeapons(g);
    breakFlanksOn(g); // §17.43 鉄条網の除去も移動カードを使ったことになる
    if (wire) pushTerrainToDiscard(wire);
    const moveCard = state.aiHand[moveIdx];
    state.aiHand.splice(moveIdx, 1);
    if (moveCard) pushTerrainToDiscard(moveCard);
    triggerMinefieldRNCCheck(g, 'ai'); // §24.4 鉄条網の除去でも地雷原の RNC 判定
    state.aiHandCount = state.aiHand.length;
    renderField('ai'); renderHands();
    await showAIAction('AI: 鉄条網除去', moveCard, gi);
    acted.add(gi);
    return true;
  }
  return false;
}

// §8.53 渡河に成功して河川の中で移動中のグループを、河川から出す（ユーザーの指示 2026-11-07）
//   地形カードがあれば置く（地形に入る）。なければ平地として使えるカード。それもなければ移動カードでもう1枚進む
async function aiTryStreamExit() {
  const R = window.INFANTRY_RULES;
  if (!R || !R.isInStream || !R.hasCrossedStream) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || acted.has(gi) || fired.has(gi)) continue;
    if (!R.isInStream(g) || !R.hasCrossedStream(g)) continue;
    if (g.cards.some(c => R.isPinned(c))) continue;
    if (await aiTryPlaceOwnTerrain(gi)) return true;
    if (await aiTryPlaceOwnPlain(gi)) return true;
    return await aiTryMove(); // 移動カードでもう1枚進む（aiTryMove は河川のグループを先に選ぶ）
  }
  return false;
}

async function aiTryCrossStream() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const moveIdx = aiActionCardIndex('MOVEMENT');
  if (moveIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  // 河川内で未渡河のグループを探す
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || g._bog || g._immob || g._stun || !R.isInStream(g) || R.hasCrossedStream(g)) continue;
    if (g.cards.some(c => R.isPinned(c))) continue;
    const card = state.aiHand[moveIdx];
    state.aiHand.splice(moveIdx, 1);
    const { result, judge } = attemptStreamMovement(g, 'ai', card);
    const status = {
      positioned: '歩兵砲を渡河位置に移動',
      forded: '渡河成功',
      failed: '渡河失敗'
    }[result];
    state.aiHandCount = state.aiHand.length;
    renderField('ai'); renderHands();
    await showAIAction('AI: ' + status, judge ? [card, judge] : card, gi);
    acted.add(gi);
    return true;
  }
  return false;
}

// #12 側面攻撃 / 包囲のための側面移動
async function aiTryFlankEncircle() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();

  // 側面: sub="側面" の MOVEMENT カードがあれば隣接敵に横向き配置
  const flankIdx = aiActionCardIndex('MOVEMENT', face => face.sub === '側面');
  if (flankIdx >= 0) {
    for (let si = 0; si < state.groups.ai.length; si++) {
      if (acted.has(si) || fired.has(si)) continue;
      const src = state.groups.ai[si];
      if (hasPillbox(src)) continue; // トーチカ持ちグループは移動不可
      if (src.cards.some(c => R.isPinned(c))) continue;
      for (let ti = 0; ti < state.groups.player.length; ti++) {
        const tgt = state.groups.player[ti];
        if (!tgt || tgt.eliminated) continue;
        if (Math.abs(si - ti) !== 1) continue; // 隣接
        if (cardFlankBlockReason('ai', si, ti)) continue; // §17.2
        if (isFlankFire('ai', si, ti)) continue; // すでに側面射撃できる（通常側面射撃・包囲）なら不要
        const dist = R.relativeRange(src.distance, tgt.distance);
        if (window.__inChart ? dist < 3 : dist > 4) continue; // チャート: 側面射撃は相対距離3以上（2026-11-08 ユーザーの決め）
        // 距離での火力が0以下なら意味なしスキップ
        const aiKey = getFactionKey(state.ai);
        const crewMap = buildCrewMapFromPairs(src);
        const fp = R.calcGroupFirepower(src, aiKey, dist, { moving: false, crewMap });
        if (fp <= 0) continue;
        // 側面射撃（兵士の火力×2）で、今より強い射撃カードが使えるようになる時だけ側面射撃をする
        //   （今は撃てないが撃てるようになる、も含む）。小さいグループの火力不足を補う
        const fires = state.aiHand.filter(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0).map(c => {
          const m = (c.terrain.sub || '').match(/FP(.)/);
          return { need: circledToNum((m && m[1]) || ''), str: parseInt(c.terrain.type.replace('FIRE ', ''), 10) || 0 };
        }).filter(x => x.need > 0);
        const bestStr = cap => fires.filter(x => x.need <= cap).reduce((m, x) => Math.max(m, x.str), 0);
        if (!window.__inChart && bestStr(fp * 2) <= bestStr(fp)) continue; // チャートでは使わない
        const card = state.aiHand[flankIdx];
        state.aiHand.splice(flankIdx, 1);
        const { result, judge } = playFlankMovement('ai', si, ti, card);
        state.aiHandCount = state.aiHand.length;
        renderField('ai'); renderHands();
        const status = {
          flanked: `側面射撃 → GROUP ${tgt.name}`,
          positioned: '歩兵砲を渡河位置に移動',
          failed: '渡河失敗'
        }[result];
        await showAIAction('AI: ' + status, judge ? [card, judge] : card, si);
        acted.add(si);
        return true;
      }
    }
  }

  // §17.6 包囲: 敵隣接グループの背後にいる自グループが、移動カードを横向きに置いて包囲
  const moveIdx = aiActionCardIndex('MOVEMENT');
  if (moveIdx >= 0) {
    for (let si = 0; si < state.groups.ai.length; si++) {
      if (acted.has(si) || fired.has(si)) continue;
      const src = state.groups.ai[si];
      if (hasPillbox(src)) continue; // トーチカ持ちグループは移動不可
      if (src.cards.some(c => R.isPinned(c))) continue;
      if (window.__inChart) { const _f = state.groups.player[si]; if (_f && !_f.eliminated && _f.cards.some(c => R.isAlive(c))) continue; } // チャート: 包囲は正面に敵がいない時だけ（2026-11-08 ユーザーの決め）
      for (const ti of [si - 1, si + 1]) {
        const target = state.groups.player[ti];
        if (!target || hasPillbox(target)) continue;
        if (encircleBlockReason('ai', si, ti)) continue;
        const card = state.aiHand[moveIdx];
        card._moveMode = 'lateral';
        pushTerrainWithFaction(src, card);
        applyEncircle('ai', si, ti);
        state.aiHand.splice(moveIdx, 1);
        state.aiHandCount = state.aiHand.length;
        renderField('ai'); renderField('player'); renderHands();
        await showAIAction(`AI: 包囲 → GROUP ${target.name}`, card, si);
        acted.add(si);
        return true;
      }
    }
  }

  return false;
}

/** AI グループの「今撃てる火力」: 今の距離のグループの火力＋相手の地形の修正（一番撃ちやすい敵で）と、一番近い敵との相対距離 */
function aiGroupFireNow(g, i) {
  const R = window.INFANTRY_RULES;
  const aiKey = getFactionKey(state.ai);
  const aliveG = x => x && !x.eliminated && x.cards.some(c => R.isAlive(c));
  let best = -Infinity, closest = 0;
  (state.groups.player || []).forEach((e, j) => {
    if (!aliveG(e)) return;
    const base = R.relativeRange(g.distance, e.distance);
    const rr = Math.abs(i - j) > 1 ? Math.max(0, base - 1) : base;
    if (rr > closest) closest = rr;
    const fp = R.calcGroupFirepower(g, aiKey, rr, { moving: false, crewMap: buildCrewMapFromPairs(g) });
    const mod = R.calcTerrainMod(e.terrain || [], false, { isFlank: i !== j,
      otherStack: g.terrain, encircled: !!e.encircled, attackRange: rr });
    if (fp + mod > best) best = fp + mod;
  });
  return { eff: best, closest };
}
/** グループに使える火炎放射器（生存・ピン状態でない・故障していない）があるか */
function aiGroupHasUsableFlame(g) {
  const R = window.INFANTRY_RULES;
  const aiKey = getFactionKey(state.ai);
  return g.cards.some(c => {
    if (!R.isAlive(c) || R.isPinned(c) || (c.transfer && !g.transferFire?.has(c)) ||
        c.malfunctioned || c.destroyed || c.flameDiscarded) return false;
    const d = R.lookupSoldier(c, aiKey);
    return !!(d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0);
  });
}

/** グループに使える爆薬（ピン状態でない生存兵が持つ）があるか */
function aiGroupHasDemo(g) {
  const R = window.INFANTRY_RULES;
  return !!g && g.cards.some(c => c.demoCharge && R.isAlive(c) && !R.isPinned(c) && !c.transfer);
}
/** §22.1 火炎放射器を含む攻撃（相対距離5）では、防御側の地形の修正を除いた地形を返す（煙幕・鉄条網・隠蔽は残る） */
function aiFlameDefTerrain(src, tgt, dist) {
  if (dist !== 5 || !aiGroupHasUsableFlame(src)) return tgt.terrain;
  const natural = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','GULLY','MARSH','STREAM','PILLBOX','TRENCH'];
  return (tgt.terrain || []).filter(c => !(c && c.terrain && natural.indexOf(c.terrain.type) >= 0));
}
/** 火炎放射器・爆薬のグループが、正面か隣のトーチカまでまだ相対距離5に届いていないか（§23.7 合計5までは撃てる） */
function aiStrikeNeedsPillbox(g, i) {
  const R = window.INFANTRY_RULES;
  if (!g || !(aiGroupHasUsableFlame(g) || aiGroupHasDemo(g))) return false;
  return (state.groups.player || []).some((e, j) => e && !e.eliminated && Math.abs(i - j) <= 1 && hasPillbox(e) && e.cards.some(c => R.isAlive(c))
    && ((g.distance || 0) + (e.distance || 0)) < 5);
}
/** 火炎放射器を最優先で撃つ（全部の国。ユーザーの指示 2026-11-04） */
async function aiTryFlameFire() {
  return await aiFireAt(state.groups.player.map((_, i) => i), { flameOnly: true });
}

/** 火炎放射器の攻撃を優先する場面か: 使える火炎放射器を持つグループが、相対距離5で認知している敵がいる時。
 *  この時は侵入・白兵戦より射撃を選ぶ。射撃カードがなければ、手札を入れ替えて待つ（ユーザーの指示 2026-11-04） */
function aiFlameShouldFire(g, gi) {
  const R = window.INFANTRY_RULES;
  if (!g || !aiGroupHasUsableFlame(g)) return false;
  const aiKey = getFactionKey(state.ai);
  return (state.groups.player || []).some((e, j) => {
    if (!e || e.eliminated || !e.cards.some(c => R.isAlive(c)) || !aiCanTargetRecognized(gi, j)) return false;
    const base = R.relativeRange(g.distance, e.distance);
    const rr = Math.abs(gi - j) > 1 ? Math.max(0, base - 1) : base;
    return rr === 5;
  });
}

/** AI の性格で、このグループが前進したいか（3未満は必ず、防御的=3以上で止まる、バランス=6未満、攻撃的=相対距離5まで）。
 *  作戦の役割: 火力のグループは撃てる所（3以上）で止まる。機動・突撃のグループは相対距離5まで前進する */
function aiGroupWantsAdvance(g, i) {
  const { eff, closest } = aiGroupFireNow(g, i);
  if (g._role === 'hold') return false; // 守備（シナリオC の防御側）: 前に出ない
  if (aiStrikeNeedsPillbox(g, i)) return true; // 火炎放射器・爆薬はトーチカの相対距離5まで
  if (closest >= 5) return false;
  // 使える火炎放射器（相対距離5でだけ火力がある）・爆薬を持つグループは、性格・役割に関係なく相対距離5まで前進する
  if (aiGroupHasUsableFlame(g) || aiGroupHasDemo(g)) return true;
  if (state.isNight) return !aiNightInPlace(g, i); // 夜間の前進（ユーザーの指示 2026-11-03）
  if (g._role === 'fire') return eff < 3;
  // 国の個性: 前進を止める火力（AI_FACTION_TRAITS）
  const _advT = (window.AI_FACTION_TRAITS || {})[getFactionKey(state.ai)];
  if (_advT && _advT.stopAtEff != null && (g._role !== 'maneuver' && g._role !== 'assault')) return eff < _advT.stopAtEff;
  if (g._role === 'maneuver' || g._role === 'assault') return true;
  const style = state.aiStyle || 'bal';
  return eff < 3 || (style === 'bal' && eff < 6) || style === 'aggr';
}

async function aiTryMove(opts) {
  const R = window.INFANTRY_RULES;
  const moveIdx = aiActionCardIndex('MOVEMENT');
  if (moveIdx < 0) return false;
  // シナリオC: 手札に地形カード(防御的または煙幕/鉄条網)が無ければ移動しない
  //   夜戦は移動を優先するので、この条件を外す（ユーザーの指示 2026-11-04）
  if (!window.__inChart && state.scenario && state.scenario.id === 'C' && !state.isNight && !(opts && opts.noTerrainNeed)) {
    const hasUsableTerrain = state.aiHand.some(c => {
      if (!c || !c.terrain) return false;
      const t = c.terrain.type;
      return ['WOODS','BUILDINGS','BRUSH','HILL','WALL','SMOKE','WIRE'].indexOf(t) >= 0;
    });
    if (!hasUsableTerrain) return false;
  }

  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  const isSkipped = (i) => {
    const g = state.groups.ai[i];
    if (!_groupAlive(g)) return true;
    if (acted.has(i) || fired.has(i)) return true;
    if (opts && opts.only && !opts.only.has(i)) return true;
    if (g.cards.some(c => R.isPinned(c))) return true;
    if (g._immob || g._bog || g._stun) return true; // §28 AFV の移動不能・スタック・スタン
    // §13.34 鉄条網があるグループは移動できない（除去は aiTryRemoveWire）
    if (R.hasTerrainType && R.hasTerrainType(g, 'WIRE')) return true;
    // §24.4 地雷原の横移動は判定を行う専用の経路で処理する。
    if (R.hasTerrainType(g, 'MINEFIELD')) return true;
    if (state.scenario && state.scenario.id === 'C'
        && R.hasTerrainType && R.hasTerrainType(g, 'PILLBOX')) return true;
    return false;
  };

  let bestIdx = -1;
  let moveMode = 'advance';
  // 1. 川を渡る (河川内で未渡河のグループ)
  for (let i = 0; i < state.groups.ai.length; i++) {
    if (isSkipped(i)) continue;
    const g = state.groups.ai[i];
    if (R.isInStream(g) && !R.hasCrossedStream(g)) { bestIdx = i; moveMode = 'lateral'; break; }
  }
  // 1b. 渡河したグループは、もう1枚移動カードを出して河川から進む（§8.53。ユーザーの指示 2026-11-07）
  if (bestIdx < 0) {
    for (let i = 0; i < state.groups.ai.length; i++) {
      if (isSkipped(i)) continue;
      const g = state.groups.ai[i];
      if (R.isInStream(g) && R.hasCrossedStream(g)) {
        bestIdx = i;
        moveMode = R.isBlocked(g, state.groups.player[i]) ? 'lateral' : 'advance';
        break;
      }
    }
  }
  // 2. 湿地の1枚目: 横移動強制（移動カード0枚の場合のみ）
  if (bestIdx < 0) {
    for (let i = 0; i < state.groups.ai.length; i++) {
      if (isSkipped(i)) continue;
      const g = state.groups.ai[i];
      if (R.isInStream(g)) continue;
      const inMarshFirst = R.isInMarsh && R.isInMarsh(g) && R.marshMoveCount && R.marshMoveCount(g) === 0;
      if (inMarshFirst) {
        bestIdx = i; moveMode = 'lateral'; break;
      }
    }
  }
  // 待機の表: 次に置ける地形があるグループだけ、地形を変えるための横移動を始める。
  if (bestIdx < 0 && opts && opts.lateral) {
    for (let i = 0; i < state.groups.ai.length; i++) {
      if (isSkipped(i)) continue;
      const g = state.groups.ai[i];
      if (isMovingIgnoringOverlays(g)) continue;
      if (!state.aiHand.some(c => aiCanUseOwnTerrain(c)
        && aiOwnTerrainPreference(c.terrain.type, g, i) >= 0)) continue;
      bestIdx = i;
      moveMode = 'lateral';
      break;
    }
    if (bestIdx < 0) return false;
  }
  // (側面射撃/包囲のための移動は #12 で処理)
  // 3c. チャートの前進（2026-11-08 ユーザーの指示で古い判断を外す）
  //   止まるのは、正面に敵がいれば相対距離5（isBlocked）、正面に敵がいなければ相対距離6（包囲のため）
  //   動けるグループからくじで選ぶ。重みは 移動グループ50・射撃グループ30・AFV 20（ユーザーの決め）。突撃=移動、支援=射撃
  if (bestIdx < 0 && window.__inChart) {
    const W = g => (window.AFV && window.AFV.isAfvGroup(g)) ? 20 : (g._role === 'fire' || g._role === 'support') ? 30 : (g._role === 'maneuver' || g._role === 'assault') ? 50 : 30;
    const cand = [];
    for (let i = 0; i < state.groups.ai.length; i++) {
      if (isSkipped(i)) continue;
      const g = state.groups.ai[i];
      if (R.isInStream(g) && !R.hasCrossedStream(g)) continue;
      if (R.isInMarsh && R.isInMarsh(g) && R.marshMoveCount && R.marshMoveCount(g) === 0) continue;
      const opp = state.groups.player[i];
      const front = opp && !opp.eliminated && opp.cards.some(c => R.isAlive(c));
      if (front && R.isBlocked && R.isBlocked(g, opp)) continue;
      const es = (state.groups.player || []).filter(e => e && !e.eliminated && e.cards.some(c => R.isAlive(c)));
      const closest = es.length ? Math.min(...es.map(e => R.relativeRange(g.distance, e.distance))) : 0;
      if (!front && closest >= 6) continue;
      cand.push({ i, w: W(g) });
    }
    if (!cand.length) return false;
    let r = Math.random() * cand.reduce((t, x) => t + x.w, 0);
    bestIdx = cand[cand.length - 1].i;
    for (const x of cand) { if ((r -= x.w) < 0) { bestIdx = x.i; break; } }
    moveMode = 'advance';
    if (window.__moveLog) { const g = state.groups.ai[bestIdx]; let oldOK = null, eff = null; try { oldOK = aiGroupWantsAdvance(g, bestIdx); eff = aiGroupFireNow(g, bestIdx).eff; } catch (e) {} window.__moveLog.push({ nat: getFactionKey(state.ai), scn: state.scenario && state.scenario.id, g: g.name, role: g._role || null, afv: !!(window.AFV && window.AFV.isAfvGroup(g)), n: cand.length, rr: Math.min(...(state.groups.player || []).filter(e => e && !e.eliminated).map(e => R.relativeRange(g.distance, e.distance))), oldOK, eff, turn: state.turnCount }); }
  }
  // 3. 前進: 「今撃てる火力」（今の距離のグループの火力＋相手の地形の修正）で決める
  //   共通: 3未満なら必ず前進（効果が半分くらいのランク 3〜4 まで）
  //   防御的: 3以上で止まる / バランス: 6以上（効果が期待できる）まで / 攻撃的: 相対距離5まで
  //   前進するのは、今撃てる火力が一番低いグループ（同じなら人数の多いグループ）
  if (bestIdx < 0) {
    const styleM = state.aiStyle || 'bal';
    const fireNow = (g, i) => aiGroupFireNow(g, i);
    let bestEff = Infinity, bestSize = -1;
    for (let i = 0; i < state.groups.ai.length; i++) {
      if (isSkipped(i)) continue;
      const g = state.groups.ai[i];
      // 河川は未渡河なら除外
      if (R.isInStream(g) && !R.hasCrossedStream(g)) continue;
      // 湿地で移動カード0枚（=1枚目）のグループは前進不可（横移動強制）
      if (R.isInMarsh && R.isInMarsh(g) && R.marshMoveCount && R.marshMoveCount(g) === 0) continue;
      const opposing = state.groups.player[i];
      if (opposing && R.isBlocked && R.isBlocked(g, opposing)) continue;
      const { eff, closest } = fireNow(g, i);
      if (closest >= 5 && !g._overrunTargets?.includes(opposing) && !aiStrikeNeedsPillbox(g, i)) continue; // 相対距離5（白兵戦の距離）より先へは進まない
      if (aiCCThreat(i, false)) continue; // 侵入されていて白兵戦が不利なら、白兵戦の距離へ戻らない（§20.55）
      if (!aiGroupWantsAdvance(g, i)) continue; // 性格と作戦の役割で決める
      const alive = g.cards.filter(c => R.isAlive(c)).length;
      // 夜戦は相対距離が一番遠いグループから前進する（火力グループだけ取り残さない。ユーザーの指示 2026-11-04）
      const _effM = state.isNight ? closest : eff;
      if (_effM < bestEff || (_effM === bestEff && alive > bestSize)) { bestEff = _effM; bestSize = alive; bestIdx = i; }
    }
    if (bestIdx >= 0) moveMode = 'advance';
  }
  if (bestIdx < 0) return false;
  const grp = state.groups.ai[bestIdx];
  if (R.isInStream(grp) && !R.hasCrossedStream(grp)) return aiTryCrossStream();
  if (grp.pendingShift || transferLocksRange('ai', bestIdx) || requiresLateralMovement(grp, 'ai')) moveMode = 'lateral';
  const moveCard = state.aiHand[moveIdx];
  const inEscapeTerrain = !!(R.hasTerrainType && (R.hasTerrainType(grp, 'MARSH') || R.hasTerrainType(grp, 'GULLY')));
  if (moveMode === 'lateral') {
    moveCard._moveMode = 'lateral';
  } else {
    grp.distance += 1;
    moveCard._moveMode = 'advance';
  }
  pushTerrainWithFaction(grp, moveCard);
  if (moveMode === 'advance') releaseInfiltrationOnRetreat(grp, 'ai', 'move');
  state.aiHand.splice(moveIdx, 1);
  state.aiHandCount = state.aiHand.length;
  renderField('ai'); renderHands();
  await showAIAction(inEscapeTerrain && moveMode === 'lateral' ? 'AI: 横移動（脱出）' : 'AI: 移動', moveCard, bestIdx);
  acted.add(bestIdx);
  return true;
}

// 地雷原内のグループに横移動カードを置く（脱出開始）
async function aiTryMineLateral() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const moveIdx = aiActionCardIndex('MOVEMENT');
  if (moveIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || fired.has(gi)) continue;
    const g = state.groups.ai[gi];
    if (!_groupAlive(g) || g._immob || g._bog || g._stun || R.hasTerrainType(g, 'WIRE') ||
        !R.hasTerrainType(g, 'MINEFIELD') || g.cards.some(R.isPinned)) continue;
    const moveCard = state.aiHand[moveIdx];
    moveCard._moveMode = 'lateral';
    pushTerrainWithFaction(g, moveCard);
    state.aiHand.splice(moveIdx, 1);
    acted.add(gi);
    triggerMinefieldRNCCheck(g, 'ai'); // §24.4 移動カードを置いたら RNC 判定
    state.aiHandCount = state.aiHand.length;
    renderField('ai'); renderHands();
    await showAIAction('AI: 横移動（地雷原脱出）', moveCard, gi);
    return true;
  }
  return false;
}

// 地雷原排除: §24.5 移動カードは使わない。ピン無し兵士 1 人 + 判定カード
async function aiTryMineRemove() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const acted = state.aiActedGroups || new Set();
  const aiKey = getFactionKey(state.ai);
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const grp = state.groups.ai[gi];
    const mineIdx = (grp.terrain || []).findIndex(c => c && c.terrain && c.terrain.type === 'MINEFIELD');
    if (mineIdx < 0) continue;
    // ピン無し生存兵士
    const candidates = grp.cards.filter(c => R.isAlive(c) && !R.isPinned(c));
    if (candidates.length === 0) continue;
    // リーダー以外を優先（リーダー消耗を避ける）
    candidates.sort((a, b) => {
      const da = R.lookupSoldier(a, aiKey);
      const db = R.lookupSoldier(b, aiKey);
      const la = da && da.leader ? 1 : 0;
      const lb = db && db.leader ? 1 : 0;
      return la - lb;
    });
    const target = candidates[0];
    const def = R.lookupSoldier(target, aiKey);
    const mineCard = grp.terrain[mineIdx];
    const thresholds = getMinefieldThresholds(mineCard);
    const judgeCard = drawTerrainCard();
    if (!judgeCard) {
      renderField('ai');
      acted.add(gi);
      return true;
    }
    const rncAbs = parseInt((judgeCard.terrain && judgeCard.terrain.range) || '0', 10) || 0;
    const isRed = judgeCard.terrain && judgeCard.terrain.rncColor === '赤';
    showJudgeCard(judgeCard);
    checkBreezeRemoveSmoke(judgeCard);
    pushTerrainToDiscard(judgeCard);
    let msg = `AI 地雷原排除: ${def ? def.name : target.id} (${isRed?'赤':'黒'}${rncAbs})\n`;
    if (!isRed && rncAbs >= thresholds.removeY) {
      // §24.5 成功: 地雷原カードを裏返して平地にする
      grp.terrain[mineIdx] = flipMinefieldToPlain(mineCard);
      if (!state.deckRemoved) state.deckRemoved = {};
      state.deckRemoved.MINEFIELD = (state.deckRemoved.MINEFIELD || 0) + 1;
      msg += `→ 除去成功（黒 RNC ≧ ${thresholds.removeY}）。地雷原は裏返して平地になった。`;
    } else if (isRed && rncAbs > thresholds.removeZ) {
      // §24.5 赤5・赤6: その兵が §24.31 の地雷原攻撃を受ける
      const line = _minefieldAttackSoldier(grp, mineCard, 'ai', target, 'abs');
      msg += `→ 排除失敗（赤 RNC > ${thresholds.removeZ}）。§24.31 地雷原攻撃\n${line || ''}`;
    } else {
      msg += '→ 排除失敗（条件不一致）';
    }
    state.aiHandCount = state.aiHand.length;
    cleanupEliminatedGroups();
    renderField('ai'); renderHands();
    await showAIAction(msg, [judgeCard], gi);
    acted.add(gi);
    return true;
  }
  return false;
}

function aiTerrainRange(g, gi, opposingSide) {
  const R = window.INFANTRY_RULES;
  return (state.groups[opposingSide] || []).reduce((closest, enemy, ei) => {
    if (!enemy || enemy.eliminated || !enemy.cards.some(R.isAlive)) return closest;
    return Math.max(closest, R.relativeRangeBetweenGroups(g, enemy, {
      sameOpposing: gi === ei, adjacent: Math.abs(gi - ei) === 1,
    }));
  }, 0); // 相対距離は数値が大きいほど近い
}

function aiFiringGroup(g, factionKey) {
  if (g._role === 'fire' || g._role === 'support') return true;
  const R = window.INFANTRY_RULES;
  return g.cards.some(c => {
    if (!R.isAlive(c) || c.destroyed) return false;
    const def = R.lookupSoldier(c, factionKey);
    return !!(def && /軽機関銃|中機関銃|迫撃砲|歩兵砲/.test(def.weaponCat));
  });
}

function aiGullyApproach(g, gi) {
  return (g._role === 'maneuver' || g._role === 'assault')
    && !(window.AFV && window.AFV.isAfvGroup(g))
    && aiTerrainRange(g, gi, 'player') <= 1;
}

// 1: 用途に合う地形、0: 通常の評価、-1: 味方への配置を見送る地形。
function aiOwnTerrainPreference(type, g, gi) {
  if (type !== 'GULLY' && type !== 'HILL') return 0;
  const afv = window.AFV && window.AFV.isAfvGroup(g);
  const fire = aiFiringGroup(g, getFactionKey(state.ai));
  if (type === 'HILL') return (fire || afv) ? 1 : 0;
  if (afv || aiTerrainRange(g, gi, 'player') >= 4) return -1;
  if (aiGullyApproach(g, gi)) return 1;
  return fire ? -1 : 0;
}

function aiEnemyGullyTarget(g, gi) {
  const R = window.INFANTRY_RULES;
  return !(window.AFV && window.AFV.isAfvGroup(g))
    && !R.isInGully(g) && aiTerrainRange(g, gi, 'ai') < 5
    && aiFiringGroup(g, getFactionKey(state.player));
}

function aiCanUseOwnTerrain(c) {
  const SH = window.SCENARIO_HELPERS;
  const goodTerrain = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','GULLY'];
  if (c?.terrain?.type === 'GULLY' && aiRemainingDiscard() > 0 &&
      aiHarassTargets('GULLY').some(i => window.AFV?.isAfvGroup(state.groups.player[i]) &&
        !state.groups.player[i]._bog)) return false;
  return c && c.terrain && goodTerrain.includes(c.terrain.type)
    && !(SH && SH.isCardDisabledAsTerrain(state.scenario, c, state.aiRole === 'attacker'));
}

async function aiTryPlaceOwnTerrain(onlyGi) {
  const R = window.INFANTRY_RULES;

  const acted = state.aiActedGroups || new Set();
  const targets = [];
  // 最上が MOVEMENT のグループに地形を置く
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (onlyGi != null && gi !== onlyGi) continue;
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || !g.cards.some(R.isAlive)) continue;
    if (g.terrain.length === 0) continue;
    const top = topIgnoringSmoke(g); // §13.23 移動カード上の煙幕は妨げにならない
    if (!top || !top.terrain || top.terrain.type !== 'MOVEMENT') continue;
    // §8.22 涸れ谷は移動1枚、§8.42 湿地は2枚。§8.53 河川は渡河に成功していればよい
    if (R.canPlaceTerrainOnMarsh && !R.canPlaceTerrainOnMarsh(g)) continue;
    if (R.canPlaceTerrainOnGully && !R.canPlaceTerrainOnGully(g)) continue;
    if (R.canPlaceTerrainOnStream && !R.canPlaceTerrainOnStream(g)) continue;
    targets.push(gi);
  }
  if (!targets.length) return false;
  let best = null;
  for (const [idx, c] of state.aiHand.entries()) {
    if (!aiCanUseOwnTerrain(c)) continue;
    const cover = window.__inChart ? -(R.calcTerrainMod([c], false, {}) || 0) : 0;
    for (const gi of targets) {
      if (!infantryGunCanEnter(state.groups.ai[gi],c.terrain.type,'ai') ||
          !jungleTerrainAllowed(state.groups.ai[gi], c, 'ai')) continue;
      const preference = aiOwnTerrainPreference(c.terrain.type, state.groups.ai[gi], gi);
      if (preference < 0) continue;
      if (!best || preference > best.preference || (preference === best.preference && cover > best.cover)) {
        best = { idx, gi, preference, cover };
      }
    }
  }
  if (!best) return false;
  const { idx: tIdx, gi: targetGi } = best;

  const grp = state.groups.ai[targetGi];
  const placedCard = state.aiHand[tIdx];
  const inMinefield = R.hasTerrainType(grp, 'MINEFIELD');
  const place = () => {
    if (inMinefield && !processMinefieldEscape(grp, 'ai').ok) return false;
    state.aiHand.splice(tIdx, 1);
    acted.add(targetGi);
    if (!_groupAlive(grp)) {
      pushTerrainToDiscard(placedCard);
      cleanupEliminatedGroups();
      return true;
    }
    removeSmokeFromGroup(grp, 'ai', '地形カードを配置'); // §13.241
    while (grp.terrain.length > 0) pushTerrainToDiscard(grp.terrain.pop());
    pushTerrainWithFaction(grp, placedCard);
    return true;
  };
  if (!(inMinefield ? withDeckAttack(place) : place())) return false;
  state.aiHandCount = state.aiHand.length;
  renderField('ai'); renderHands();
  if (!_groupAlive(grp)) return true;
  await showAIAction('AI: 地形配置', placedCard, targetGi);
  { const _n = releaseInfiltrationOnRetreat(grp, 'ai', 'terrain'); // §20.53 相対距離4で地形カード
    if (_n) await showAIAction(`AI: GROUP ${grp.name} が相対距離4で地形カードを置いたので、侵入兵 ${_n}名は侵入状態でなくなりました（§20.53）`, null, targetGi); }
  return true;
}

// 地形以外の手札（移動・射撃カード以外）を平地として移動中の自グループに置く（§13.5 煙幕・鉄条網は残す）
async function aiTryPlaceOwnPlain(onlyGi) {
  const pIdx = state.aiHand.findIndex(c => isPlainUseCard(c, 'ai')
    && c.terrain.type !== 'MOVEMENT' && String(c.terrain.type).indexOf('FIRE') !== 0);
  if (pIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  let targetGi = -1;
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (onlyGi != null && gi !== onlyGi) continue;
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    if (!isMovingIgnoringOverlays(g) || openGroundBlockReason(g, 'ai')) continue;
    targetGi = gi; break;
  }
  if (targetGi < 0) return false;
  const grp = state.groups.ai[targetGi];
  const card = state.aiHand[pIdx];
  state.aiHand.splice(pIdx, 1);
  state.aiHandCount = state.aiHand.length;
  placePlainOnGroup(grp, card);
  renderField('ai'); renderHands();
  await showAIAction('AI: 平地として配置',
    { img: encPath('upfrontimages/地形カード/AD Back.gif') }, targetGi);
  { const _n = releaseInfiltrationOnRetreat(grp, 'ai', 'terrain'); // §20.53 相対距離4で地形カード
    if (_n) await showAIAction(`AI: GROUP ${grp.name} が相対距離4で地形カードを置いたので、侵入兵 ${_n}名は侵入状態でなくなりました（§20.53）`, null, targetGi); }
  acted.add(targetGi);
  return true;
}

// 自グループに煙幕を重ねる
async function aiTryPlaceOwnSmoke() {
  const sIdx = aiActionCardIndex('SMOKE', (face, card) => isTerrainHandCard({ ...card, terrain: face }, 'ai'));
  if (sIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  let targetGi = -1;
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    // §13.1 煙幕は地形・移動カードの上、地形なしのグループにも置ける
    const top = g.terrain && g.terrain.length > 0 ? g.terrain[g.terrain.length - 1] : null;
    const topType = top && top.terrain && top.terrain.type;
    // 既に煙幕が乗っているグループは除外
    if (topType === 'SMOKE') continue;
    // §13.2 指揮官のいるグループのみ・湿地不可・風のターン不可
    if (smokeBlockReason(g, 'ai')) continue;
    // AI方針: 相対距離3〜4（侵入の準備・撃ち合いの守り）で使う。5では相手にも侵入されやすくなるので使わない
    const Rs = window.INFANTRY_RULES;
    const near = (state.groups.player || []).reduce((m, e, ei) => {
      if (!e || e.eliminated || !e.cards.some(c => Rs.isAlive(c)) || Math.abs(ei - gi) > 1) return m;
      return Math.min(m, Rs.relativeRange(g.distance, e.distance));
    }, 99);
    if (near >= 3 && near <= 4) { targetGi = gi; break; }
    // 前進の隠れ蓑: これから前進したいグループで、正面か隣に敵がいて（撃たれる）、まだ煙幕がなく、動ける時は、先に煙幕を張る
    //   煙幕は上に移動カードが 2枚のるまで残る（§13.242）ので、2回の前進を守れる
    const hasSmokeNow = (g.terrain || []).some(c => c && c.terrain && c.terrain.type === 'SMOKE');
    const canMoveNext = !g.cards.some(c => Rs.isAlive(c) && Rs.isPinned(c)) && !Rs.hasTerrainType(g, 'WIRE');
    if (near <= 4 && !hasSmokeNow && canMoveNext && aiGroupWantsAdvance(g, gi)) { targetGi = gi; break; }
  }
  if (targetGi < 0) return false;
  const grp = state.groups.ai[targetGi];
  const card = state.aiHand[sIdx];
  pushTerrainWithFaction(grp, card);
  state.aiHand.splice(sIdx, 1);
  state.aiHandCount = state.aiHand.length;
  renderField('ai'); renderHands();
  await showAIAction('AI: 煙幕配置 (自軍)', card, targetGi);
  acted.add(targetGi);
  return true;
}

// ===== AI: 昨日足したルールの行動（§32.2 監視役交代・§33.9 ヒーローで負傷の効果を止める・§17.7 側方移送・§20.56 侵入解除） =====
function _aiActed(gi) {
  return (state.aiActedGroups && state.aiActedGroups.has(gi)) || (state.aiFiredGroups && state.aiFiredGroups.has(gi));
}
function _aiMarkActed(gi) {
  if (!state.aiActedGroups) state.aiActedGroups = new Set();
  state.aiActedGroups.add(gi);
}
/** 兵士の印刷の火力の一番大きい値（どの距離でも） */
function _maxPrintedFP(def) {
  if (!def || !def.rangeData) return 0;
  return Math.max(0, ...def.rangeData.map(rd => (rd && !rd.na) ? (rd.main || 0) : 0));
}

/** §32.2 AI の監視役交代: 今の監視役が分隊長かクルー兵器の持ち主で、ピン状態でない「どちらでもない兵」がいれば交代（1アクション） */
async function aiTryGuardChange() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const aiKey = getFactionKey(state.ai);
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (_aiActed(gi)) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated) continue;
    const guards = prisonerGuardsAvailableToChange(g);
    if (!guards.length) continue;
    const important = c => { const d = R.lookupSoldier(c, aiKey) || {}; return !!d.leader || !!d.needsCrew; };
    if (!guards.some(important)) continue;
    const cands = guardCandidates(g, 'ai').filter(c => !R.isPinned(c) && !isCrewAssistant(g, c) && !important(c) && !guards.includes(c));
    if (!cands.length) continue;
    const ccv = c => { const d = R.lookupSoldier(c, aiKey) || {}; return parseInt(String(d.ccvFront || '0'), 10) || 0; };
    const ng = cands.slice().sort((a, b) => ccv(a) - ccv(b))[0];
    changePrisonerGuard(g, guards, ng);
    _aiMarkActed(gi);
    const d = R.lookupSoldier(ng, aiKey);
    renderField('ai');
    await showAIAction(`AI: 監視役交代 — GROUP ${g.name} の新しい監視役は ${d ? d.name : ng.id}（§32.2）`, null, gi);
    return true;
  }
  return false;
}

/** §33.9 AI: ヒーローカードで負傷の効果をこのターン止める（アクションではない → 'hero' を返す）。
 *  射撃できる敵がいるグループに、印刷の火力 2以上の負傷兵がいる時。同じグループにピン状態の兵がいれば回復を優先して使わない */
async function aiTryHeroWound() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const hi = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'HERO');
  if (hi < 0) return false;
  if (!window.__inChart && !state.aiHand.some(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0)) return false; // チャートでは使わない
  const aiKey = getFactionKey(state.ai);
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (state.aiActedGroups && state.aiActedGroups.has(gi)) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated) continue;
    if (!window.__inChart && g.cards.some(c => R.isAlive(c) && R.isPinned(c))) continue; // 回復を優先（チャートでは使わない）
    const canFire = (state.groups.player || []).some((e, ti) => e && !e.eliminated && e.cards.some(c => R.isAlive(c)) && aiCanTargetRecognized(gi, ti));
    if (!canFire && !window.__inChart) continue; // チャートでは使わない
    const w = g.cards.find(c => R.isAlive(c) && !R.isPinned(c) && R.isWoundActive(c) && (window.__inChart || _maxPrintedFP(R.lookupSoldier(c, aiKey)) >= 2)); // チャートでは火力に関係なく（2026-11-08 ユーザーの決め）
    if (!w) continue;
    w.woundSuspendedTurn = state.turnCount || 0;
    const hero = state.aiHand.splice(hi, 1)[0];
    pushTerrainToDiscard(hero);
    state.aiHandCount = state.aiHand.length;
    const d = R.lookupSoldier(w, aiKey);
    renderField('ai'); renderHands();
    await showAIAction(`AI: ヒーローカードで ${d ? d.name : w.id} の負傷の効果を止める（§33.9）`, hero, gi);
    return 'hero';
  }
  return false;
}

/** §17.7 AI のグループ側方移送: 空いた隣の位置へ移るだけ（入れ替えはしない）。
 *  今の位置の正面と隣に敵がいないが、移った先なら正面か隣に敵がいる時（1アクション・横向きの移動カード） */
async function aiTryGroupShift() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const mi = aiActionCardIndex('MOVEMENT');
  if (mi < 0) return false;
  const enemyNear = idx => [idx - 1, idx, idx + 1].some(j => {
    const e = (state.groups.player || [])[j];
    return e && !e.eliminated && e.cards.some(c => R.isAlive(c));
  });
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (groupShiftBlockReason('ai', gi)) continue;
    const g = state.groups.ai[gi];
    if (hasPillbox(g) || (!window.__inChart && g._role === 'hold') || enemyNear(gi)) continue;
    const dest = shiftDestinations('ai', gi).find(j => enemyNear(j));
    if (dest == null) continue;
    const card = state.aiHand.splice(mi, 1)[0];
    state.aiHandCount = state.aiHand.length;
    const started = startGroupShift(g, 'ai', card, dest);
    _aiMarkActed(gi);
    renderField('ai'); renderHands();
    await showAIAction(started ? `AI: グループ側方移送 — GROUP ${g.name} → ${groupSlotName(dest)}（§17.7）`
      : `AI: GROUP ${g.name} の側方移送は渡河失敗で中止（§17.7）`, card, gi);
    return true;
  }
  return false;
}

/** AI がこの兵たちで白兵戦をするか: CCV の平均のランク（低 4以下 / 中 5〜7 / 高 8以上）と性格・作戦の役割で決める。
 *  攻撃的・突撃のグループ=すべて、バランス=中と高、防御的=高のみ。戻り値 { ok, avg, rank } */
function aiCCRankOK(g, list, tgt) {
  const R = window.INFANTRY_RULES, CC = window.CC_ACTION;
  const aiKey = getFactionKey(state.ai);
  if (!list.length || !CC || !CC.getCCV) return { ok: false, avg: 0, rank: 0 };
  const avg = list.reduce((sum, c) => sum + CC.getCCV(c, R.lookupSoldier(c, aiKey) || {}, { group: g }), 0) / list.length;
  const rank = avg <= 4 ? 1 : avg <= 7 ? 2 : 3;
  const style = state.aiStyle || 'bal';
  const rankOk = (style === 'aggr' || g._role === 'assault') ? true : rank >= (style === 'def' ? 3 : 2);
  // 相手（侵入先のグループ）の兵の CCV の平均と比べる。差（自分−相手）がこれ未満なら白兵戦をしない
  //   攻撃的 -2 / バランス 0 / 防御的 +1。突撃のグループは -1（性格の方が緩ければそちら）
  if (!tgt) return { ok: rankOk, avg, rank };
  const defAvg = groupCCVAvg(tgt, 'player');
  if (defAvg == null) return { ok: rankOk, avg, rank };
  const margin = avg - defAvg;
  let minMargin = { aggr: -2, bal: 0, def: 1 }[style];
  // 国の個性: 白兵戦への踏み切り（AI_FACTION_TRAITS）
  const _trait = (window.AI_FACTION_TRAITS || {})[aiKey];
  if (_trait && _trait.ccMargin != null && minMargin != null) minMargin += _trait.ccMargin;
  if (minMargin == null) minMargin = 0;
  if (g._role === 'assault') minMargin = Math.min(minMargin, -1);
  return { ok: rankOk && margin >= minMargin, avg, rank, defAvg, margin };
}

/** グループの生きている兵の CCV の平均（side はそのグループの側）。兵がいなければ null */
function groupCCVAvg(grp, side) {
  const R = window.INFANTRY_RULES, CC = window.CC_ACTION;
  if (!grp || !grp.cards || !R || !CC || !CC.getCCV) return null;
  const key = getFactionKey(side === 'player' ? state.player : state.ai);
  const alive = grp.cards.filter(c => R.isAlive(c));
  if (!alive.length) return null;
  return alive.reduce((s, c) => s + CC.getCCV(c, R.lookupSoldier(c, key) || {}, { group: grp }), 0) / alive.length;
}

/** §20.53 侵入されたグループが移動2枚で相対距離3になるか、相対距離4で地形を置くと侵入が終わる。
 *  side = 侵入されたグループの側、reason = 'move' | 'terrain'。戻り値: 侵入状態でなくなった人数 */
function releaseInfiltrationOnRetreat(grp, side, reason) {
  const R = window.INFANTRY_RULES, CC = window.CC_ACTION;
  if (!grp || !R || !CC || !state.groups[side]) return 0;
  const idx = state.groups[side].indexOf(grp);
  if (idx < 0) return 0;
  if (reason === 'move') {
    const placed = grp.terrain.filter(card => card?.terrain &&
      !['SMOKE', 'WIRE'].includes(card.terrain.type));
    const last = placed.at(-1);
    if (last?.terrain.type !== 'MOVEMENT' || last._moveMode === 'lateral' ||
        placed.at(-2)?.terrain.type !== 'MOVEMENT') return 0;
  }
  const enemySide = side === 'player' ? 'ai' : 'player';
  let n = 0;
  (state.groups[enemySide] || []).forEach((eg, enemyIndex) => {
    if (!eg || !eg.cards) return;
    const rr = R.relativeRangeBetweenGroups(eg, grp, {
      sameOpposing: enemyIndex === idx, adjacent: Math.abs(enemyIndex - idx) === 1
    });
    if (rr !== (reason === 'terrain' ? 4 : 3)) return;
    eg.cards.forEach(c => {
      if (c.infiltrating && c.infiltratedGroupSide === side && c.infiltratedGroupIdx === idx) { CC.clearSoldierInfiltration(c); n++; }
    });
  });
  if (n) { renderField('player'); renderField('ai'); }
  return n;
}

/** AI のグループ gi にプレイヤーの侵入兵が入っていて、白兵戦が不利か。
 *  不利の目安: 侵入兵の CCV の平均 − こちらの CCV の平均 が 防御的 0 / バランス +1 / 攻撃的 +3 以上（突撃のグループは +2）。
 *  needRange5: 今、白兵戦を受ける距離（相対距離5）にいる時だけ true にする */
/** チャートの17行目（2026-11-08 ユーザーの決め）: 後退するか。
 *  侵入された: こちらの全員が、侵入している敵の一番強い CCV より弱い時（侵入元が相対距離5の時だけ）。侵入した敵が爆薬を持てば強さに関係なく
 *  相対距離5に、使える火炎放射器を持つ敵のグループがいる時も後退 */
function chartRetreatThreat(gi) {
  const R = window.INFANTRY_RULES, CC = window.CC_ACTION;
  const g = state.groups.ai[gi];
  if (!g || g.eliminated || !R || !CC || !CC.getCCV) return false;
  const pKey = getFactionKey(state.player), aKey = getFactionKey(state.ai);
  let best = -Infinity, demo = false, any = false;
  (state.groups.player || []).forEach(pg => {
    if (!pg || !pg.cards || pg.eliminated) return;
    const ins = pg.cards.filter(c => c.infiltrating && c.infiltratedGroupSide === 'ai' && c.infiltratedGroupIdx === gi && R.isAlive(c));
    if (!ins.length || R.relativeRange(pg.distance, g.distance) < 5) return;
    any = true;
    ins.forEach(c => { best = Math.max(best, CC.getCCV(c, R.lookupSoldier(c, pKey) || {}, { group: pg })); if (c.demoCharge) demo = true; });
  });
  if (any && demo) return true;
  if (any) { const mine = g.cards.filter(c => R.isAlive(c)).map(c => CC.getCCV(c, R.lookupSoldier(c, aKey) || {}, { group: g })); if (mine.length && Math.max(...mine) < best) return true; }
  return (state.groups.player || []).some((pg, j) => {
    if (!pg || pg.eliminated) return false;
    const base = R.relativeRange(pg.distance, g.distance); const rr = Math.abs(gi - j) > 1 ? Math.max(0, base - 1) : base;
    if (rr !== 5) return false;
    return pg.cards.some(c => { if (!R.isAlive(c) || c.malfunctioned || c.destroyed || c.flameDiscarded) return false; const d = R.lookupSoldier(c, pKey); return !!(d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0); });
  });
}
function aiCCThreat(gi, needRange5) {
  const R = window.INFANTRY_RULES, CC = window.CC_ACTION;
  const g = state.groups.ai[gi];
  if (!g || g.eliminated || !R || !CC || !CC.getCCV) return false;
  const pKey = getFactionKey(state.player);
  let sum = 0, n = 0, inRange5 = false;
  (state.groups.player || []).forEach(pg => {
    if (!pg || !pg.cards) return;
    const ins = pg.cards.filter(c => c.infiltrating && c.infiltratedGroupSide === 'ai' && c.infiltratedGroupIdx === gi && R.isAlive(c));
    if (!ins.length) return;
    if (R.relativeRange(pg.distance, g.distance) >= 5) inRange5 = true;
    ins.forEach(c => { sum += CC.getCCV(c, R.lookupSoldier(c, pKey) || {}, { group: pg }); n++; });
  });
  if (!n) return false;
  if (needRange5 && !inRange5) return false;
  const mine = groupCCVAvg(g, 'ai');
  if (mine == null) return false;
  const style = state.aiStyle || 'bal';
  let lim = { def: 0, bal: 1, aggr: 3 }[style];
  if (lim == null) lim = 1;
  if (g._role === 'assault') lim = Math.min(lim, 2);
  return (sum / n) - mine >= lim;
}

/** §20.55 AI の後退: 侵入されて白兵戦が不利なら、移動カードで1つ後退する（相対距離が5より小さくなれば白兵戦を受けない）。
 *  さらに相対距離3まで下がるか、相対距離4で地形カードを置けば、侵入そのものが終わる（§20.53） */
async function aiTryRetreatFromCC() {
  const R = window.INFANTRY_RULES, CC = window.CC_ACTION;
  if (!R || !CC) return false;
  const moveIdx = aiActionCardIndex('MOVEMENT');
  if (moveIdx < 0) return false;
  const card = state.aiHand[moveIdx];
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || fired.has(gi)) continue;
    const g = state.groups.ai[gi];
    if (!_groupAlive(g) || g._immob || g._bog || g._stun) continue;
    if (window.__inChart ? !chartRetreatThreat(gi) : !aiCCThreat(gi, true)) continue;
    // プレイヤーの後退と同じ制限: ピン状態の兵がいる・鉄条網・地雷原・トーチカ・河川/湿地の1枚目・移送中は後退しない
    if (g.cards.some(c => R.isAlive(c) && R.isPinned(c))) continue;
    if (R.hasTerrainType(g, 'WIRE') || R.hasTerrainType(g, 'PILLBOX') || requiresLateralMovement(g, 'ai')) continue;
    if (g.pendingShift || transferLocksRange('ai', gi)) continue;
    // §5.51 一番近い敵との相対距離が 0より小さくなる後退は不可。距離チットがマイナスになるのは赤の RNC の移動カードだけ
    const newDist = g.distance - 1;
    if (!retreatRangeAllowed(g, 'ai', newDist)) continue;
    if (newDist < 0 && !(card.terrain && card.terrain.rncColor === '赤')) continue;
    g.distance = newDist;
    card._moveMode = 'retreat';
    pushTerrainWithFaction(g, card);
    state.aiHand.splice(moveIdx, 1);
    state.aiHandCount = state.aiHand.length;
    renderField('ai'); renderField('player'); renderHands();
    await showAIAction(`AI: 後退 — GROUP ${g.name}（白兵戦を避ける・§20.55）`, card, gi);
    const n = releaseInfiltrationOnRetreat(g, 'ai', 'move');
    if (n) await showAIAction(`AI: GROUP ${g.name} が相対距離3まで下がったので、侵入兵 ${n}名は侵入状態でなくなりました（§20.53）`, null, gi);
    acted.add(gi);
    return true;
  }
  return false;
}

/** 白兵戦が不利なら侵入先への射撃を試し、撃てなければ侵入を解く（§20.56）。 */
async function aiTryUninfiltrate() {
  const R = window.INFANTRY_RULES;
  const CC = window.CC_ACTION;
  if (!R || !CC || !CC.getCCV) return false;
  const aiKey = getFactionKey(state.ai);
  const RANK_NAME = ['', '低', '中', '高'];
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (_aiActed(gi)) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated) continue;
    const infs = g.cards.filter(c => c.infiltrating && R.isAlive(c));
    if (!infs.length) continue;
    const byTgt = new Map();
    infs.forEach(c => { const k = c.infiltratedGroupSide + ':' + c.infiltratedGroupIdx; if (!byTgt.has(k)) byTgt.set(k, []); byTgt.get(k).push(c); });
    const fireTargets = [];
    let firstUnfavorable = null;
    for (const [, list] of byTgt) {
      // ランク（性格）と、侵入先の兵の CCV との差で、白兵戦をするか決める（aiCCRankOK と同じ基準）
      const _t = state.groups[list[0].infiltratedGroupSide] && state.groups[list[0].infiltratedGroupSide][list[0].infiltratedGroupIdx];
      const chk = aiCCRankOK(g, list, _t);
      const avg = chk.avg, rank = chk.rank;
      if (window.__inChart) { // チャート（2026-11-08 ユーザーの決め）: 侵入先の全員が、侵入している兵の一番強い CCV より強いときだけ、侵入をやめる
        if (!_t) continue; const _pkU = getFactionKey(state.player); const _ccvU = (c, key, gg) => CC.getCCV(c, R.lookupSoldier(c, key) || {}, { group: gg });
        const _my = Math.max(...list.map(c => _ccvU(c, aiKey, g))); const _keyT = list[0].infiltratedGroupSide === 'ai' ? aiKey : _pkU;
        const _w = _t.cards.filter(c => R.isAlive(c)).map(c => _ccvU(c, _keyT, _t)); if (!_w.length || Math.min(..._w) <= _my) continue;
      } else if (chk.ok) continue; // 白兵戦をする
      if (!firstUnfavorable) firstUnfavorable = { list, avg, rank };
      if (_t && list[0].infiltratedGroupSide === 'player') fireTargets.push(list[0].infiltratedGroupIdx);
    }
    if (!firstUnfavorable) continue;
    if (fireTargets.length && await aiFireAt(fireTargets, { onlyGroup: gi, anyFire: true })) return true;

    const { list, avg, rank } = firstUnfavorable;
    CC.clearSoldierInfiltration(list[0]);
    _aiMarkActed(gi);
    renderField('ai'); renderField('player');
    await showAIAction(`AI: 侵入解除 — GROUP ${g.name} の侵入兵1名（CCV 平均 ${Math.round(avg * 10) / 10}・${RANK_NAME[rank]}・§20.56）`, null, gi);
    return true;
  }
  return false;
}

async function aiTryRally() {
  const R = window.INFANTRY_RULES;
  // RALLYまたはHEROカードを探す
  const rallyIdx = state.aiHand.findIndex(card => {
    const face = handRallyFace(card, 'ai');
    return face && surpriseCanRally('ai', { terrain: face }) && useHandActionFace(card, face);
  });
  if (rallyIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated) continue;
    const pinnedIdx = g.cards.map((c, i) => (R.isPinned(c) && R.isAlive(c)) ? i : -1).filter(i => i >= 0);
    const rallyCard = state.aiHand[rallyIdx];
    if (pinnedIdx.length === 0 && !(rallyCard.terrain.type === 'HERO' &&
        window.AFV?.canHeroOpenHatch(g))) continue;
    if (rallyCard.terrain.type === 'RALLY ALL') {
      const groupsRallied = rallyAllWithPartner('ai', gi, rallyCard);
      if (!groupsRallied) continue;
      state.aiHand.splice(rallyIdx, 1);
      pushTerrainToDiscard(rallyCard);
      state.aiHandCount = state.aiHand.length;
      acted.add(gi);
      markAIAction(groupsRallied);
      renderField('ai'); renderHands();
      await showAIAction('AI: 全回復', rallyCard, gi);
      return true;
    }
    const previouslyPinned = surprisePinnedForRally('ai', rallyCard, g);
    const gunRally = tryRallyInfantryGun(g, 'ai', rallyCard);
    if (gunRally) {
      noteSurpriseRally(previouslyPinned);
      state.aiHand.splice(rallyIdx, 1);
      pushTerrainToDiscard(rallyCard);
      state.aiHandCount = state.aiHand.length;
      renderField('ai'); renderHands();
      await showAIAction('AI: ' + gunRally, rallyCard, gi);
      if (rallyCard.terrain.type === 'HERO') return 'hero';
      acted.add(gi);
      return true;
    }
    // §28.42 ピンの AFV は、回復の強さを合わせて3以上で回復する
    const afvR = typeof window.afvRallyCredit === 'function' ? window.afvRallyCredit(g, rallyCard) : null;
    if (afvR) {
      noteSurpriseRally(previouslyPinned);
      state.aiHand.splice(rallyIdx, 1);
      pushTerrainToDiscard(rallyCard);
      state.aiHandCount = state.aiHand.length;
      renderField('ai'); renderHands();
      await showAIAction('AI: ' + afvR.message, rallyCard, gi);
      if (rallyCard.terrain.type === 'HERO') return 'hero';
      acted.add(gi);
      return true;
    }
    // RALLY値を取得
    const rallyVal = rallyCard.terrain.type === 'HERO' ? 1 : parseInt(rallyCard.terrain.type.replace('RALLY ', ''), 10) || 0;
    // RALLY値分だけ回復（足りれば全員）
    const count = Math.min(rallyVal, pinnedIdx.length);
    for (let k = 0; k < count; k++) {
      R.unpinSoldier(g.cards[pinnedIdx[k]]);
    }
    noteSurpriseRally(previouslyPinned);
    state.aiHand.splice(rallyIdx, 1);
    if (rallyCard) pushTerrainToDiscard(rallyCard);
    state.aiHandCount = state.aiHand.length;
    renderField('ai'); renderHands();
    await showAIAction('AI: 回復', rallyCard, gi);
    // §10.4 ヒーローでの回復はアクションに数えない
    if (rallyCard && rallyCard.terrain && rallyCard.terrain.type === 'HERO') return 'hero';
    acted.add(gi);
    return true;
  }
  return false;
}

// クルー設定: クルー兵器持ちでアシスタント不在の場合、同グループ内から再割当
async function aiTryCrewSetup() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const aiKey = getFactionKey(state.ai);
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || fired.has(gi)) continue;
    const grp = state.groups.ai[gi];
    if (grp.eliminated) continue;
    if (!grp.crewPairs) grp.crewPairs = {};
    for (const card of grp.cards) {
      if (!R.isAlive(card) || R.isPinned(card) || card.transfer || card.infiltrating ||
          card.destroyed || isCrewAssistant(grp, card) || !R.lookupSoldier(card, aiKey)?.needsCrew) continue;
      const current = grp.cards.find(c => c.num === Number(grp.crewPairs[card.num]));
      if (R.isAlive(current)) continue; // 生存中の指定助手はピン状態でも解任できない。
      const candidate = grp.cards.find(c => c !== card && !isCrewAssistant(grp, c) &&
        canServeAsWeaponAssistant(c, aiKey) && !R.lookupSoldier(c, aiKey)?.leader);
      if (!candidate) continue;
      grp.crewPairs[card.num] = candidate.num;
      seatCrewAssistant(grp.cards, card, candidate);
      acted.add(gi);
      renderField('ai');
      await showAIAction(`AI: クルー設定 (GROUP ${grp.name})`, null, gi);
      return true;
    }
  }
  return false;
}

async function aiTryRepair() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const aiKey = getFactionKey(state.ai);
  const acted = state.aiActedGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const grp = state.groups.ai[gi];
    if (grp.eliminated) continue;
    const repair = repairOptions(grp, 'ai')[0];
    if (!repair) continue;
    const { card, def } = repair;
    // §19.3 AFV は地形や移動の状態に関係なく修理を試みられる。それ以外は移動中・湿地・河川では修理できない
    const isAfvRepair = !!def.afv;
    if (!isAfvRepair) {
      if (R.isInMarsh && R.isInMarsh(grp)) continue;
      if (R.isInStream && R.isInStream(grp)) continue;
      if (isMovingIgnoringOverlays(grp)) continue; // §19.3 移動中は修理できない
      // 移動中（最上がMOVEMENT）はNG
      const top = grp.terrain && grp.terrain.length > 0 ? grp.terrain[grp.terrain.length - 1] : null;
      if (top && top.terrain && top.terrain.type === 'MOVEMENT') continue;
    }
    // §33.4 負傷兵は修理の前に黒の RNC が必要。赤ならこのターンは修理できず、行動は使う
    if (R.isWoundActive(card)) {
      const wj = drawRandomReinforcementRnc('ai');
      showJudgeCard(wj);
      if (wj) { checkBreezeRemoveSmoke(wj); pushTerrainToDiscard(wj); }
      if (!wj || (wj.terrain && wj.terrain.rncColor === '赤')) {
        await showAIAction(`AI: 負傷兵 ${def.name} は修理を試みられない（赤の RNC）`, wj, gi);
        renderField('ai');
        acted.add(gi);
        return true;
      }
    }
    const judge = drawRandomReinforcementRnc('ai');
    showJudgeCard(judge);
    if (judge) { checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
    if (!judge) return false;
    await showAIAction('AI: ' + applyWeaponRepair(repair, judge), judge, gi);
    renderField('ai');
    acted.add(gi);
    return true;
  }
  return false;
}

/** §14.4 AI の狙撃兵チェック: 直前のプレイヤーターンに狙撃された時、ピンでない兵士のいるグループの1アクションで行う
 *  （火力の一番低いグループを使う） */
async function aiTrySniperCheck() {
  if (state.playerSniperDisabled) return false;
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const aiKey = getFactionKey(state.ai);
  let gi = -1, bestFP = Infinity;
  state.groups.ai.forEach((g, i) => {
    if (state.aiActedGroups?.has(i) || state.aiFiredGroups?.has(i) ||
        sniperCheckNumber(g, 'ai') == null) return;
    const fp = R.calcGroupFirepower(g, aiKey, 0, { crewMap: buildCrewMapFromPairs(g) });
    if (fp < bestFP) { bestFP = fp; gi = i; }
  });
  if (gi < 0) return false;
  const judge = drawRandomReinforcementRnc('ai');
  if (!judge) return false;
  showJudgeCard(judge);
  checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
  const roll = ordnanceRNC(judge);
  const group = state.groups.ai[gi];
  const sniperRnc = sniperCheckNumber(group, 'ai');
  delete group._sniperCheck;
  const outcome = resolveSniperCheck('player', sniperRnc, judge);
  const detail = outcome === 'disabled' ? ' — あなたの狙撃カードは以後使えません' :
    outcome === 'remaining' ? ' — あなたにはまだ狙撃兵がいます' : '';
  (state.aiActedGroups ||= new Set()).add(gi);
  markAIAction();
  await showAIAction(`AI: 狙撃兵チェック ${outcome === 'failed' ? '失敗' : '成功'}（${roll.red ? '赤' : '黒'}${roll.number} / 狙撃のRNC ${sniperRnc}）${detail}`, judge, gi);
  return true;
}

function aiSniperTargetIndex() {
  const R = window.INFANTRY_RULES;
  const playerKey = getFactionKey(state.player);
  // 目標グループ: 分隊長のいるグループのうち人数の少ないもの（分隊長に当たりやすい）。いなければ生存兵のいる最初のグループ
  let tgtGrpIdx = -1, bestAlive = Infinity;
  state.groups.player.forEach((g, gi) => {
    if (!g || g.eliminated) return;
    const alive = attackTargetsOf(g).filter(sniperTargetEligible);
    const hasSL = alive.some(c => { const d = R.lookupSoldier(c, playerKey); return d && d.leader === '分隊長'; });
    if (hasSL && alive.length < bestAlive) { bestAlive = alive.length; tgtGrpIdx = gi; }
  });
  // チャート（2026-11-08 ユーザーの決め）: 分隊長のグループがなければ、副分隊長のグループ（人数の少ない方）
  if (tgtGrpIdx < 0 && window.__inChart) {
    state.groups.player.forEach((g, gi) => {
      if (!g || g.eliminated) return;
        const alive = attackTargetsOf(g).filter(sniperTargetEligible);
      const hasASL = alive.some(c => { const d = R.lookupSoldier(c, playerKey); return d && d.leader === '副分隊長'; });
      if (hasASL && alive.length < bestAlive) { bestAlive = alive.length; tgtGrpIdx = gi; }
    });
  }
  if (tgtGrpIdx < 0) tgtGrpIdx = state.groups.player.findIndex((g, gi) => g && !g.eliminated && attackTargetsOf(g).some(sniperTargetEligible));
  return tgtGrpIdx;
}

async function aiTrySnipe(declaration = null) {
  return withDeckAttack(() => aiTrySnipeInProgress(declaration));
}

async function aiTrySnipeInProgress(declaration) {
  if (!surpriseCanSnipe('ai')) return false;
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const snipeIdx = declaration ? -1 : state.aiHand.findIndex(card => sniperCardPlayable(card, 'ai'));
  if (!declaration && (snipeIdx < 0 || aiRemainingDiscard() <= 0)) return false;
  const card = declaration?.card || state.aiHand[snipeIdx];
  let tgtGrpIdx = declaration?.index ?? aiSniperTargetIndex();
  if (declaration && state.groups.player[tgtGrpIdx]?.eliminated) tgtGrpIdx = aiSniperTargetIndex();
  if (tgtGrpIdx < 0) return false;
  const grp = state.groups.player[tgtGrpIdx];
  const snipers = 1 + (state.aiExtraSnipers || 0);
  const snipeResults = [];
  let lowestRnc = Infinity;
  // 狙撃兵全員の標的を同じグループに指定してから、1発ずつRPCとRNCを引く。
  for (let shot = 0; shot < snipers; shot++) {
    const soldier = drawSniperTarget(grp);
    if (!soldier) break;
    await askPlayerHeroRally(grp, [soldier]); // §10.42 狙撃結果を引く前に回復できる。
    const judge = ccDrawCard('ai');
    if (!judge) break;
    showJudgeCard(judge);
    const resolution = resolveSniperShot(card, soldier, grp, 'player', judge);
    lowestRnc = Math.min(lowestRnc, resolution.rnc);
    snipeResults.push(resolution);
  }
  if (!snipeResults.length) return false;
  noteSurpriseAttack('ai', 'player');
  state.aiSnipeRncThisTurn = state.aiSnipeRncThisTurn == null ? lowestRnc : Math.min(lowestRnc, state.aiSnipeRncThisTurn);
  noteSniperCheck(grp, lowestRnc);
  if (!declaration) {
    state.aiDiscardedThisTurn = (state.aiDiscardedThisTurn || 0) + 1;
    state.aiHand.splice(snipeIdx, 1);
  }
  pushTerrainToDiscard(card);
  state.aiHandCount = state.aiHand.length;
  const title = `AI: 狙撃 → GROUP ${grp.name}`;
  await showAIAction(title, card);
  await showFireResultOverlay(title, snipeResults);
  cleanupEliminatedGroups();
  renderField('player'); renderField('ai');
  renderHands();
  updateDeckCounts();
  return true;
}

/** §4.3 AI の捨て札の残り枚数（§7.3 相手への地形配置もこれを使う） */
function aiRemainingDiscard() {
  const actions = Math.max(state.aiActionCount || 0, Number(Boolean(state.aiActedThisTurn)));
  const faction = getFactionKey(state.ai);
  const trenches = faction === 'rus' ? (state.aiEntrenchments || 0) : 0;
  const max = window.DISCARD_RULES.turnLimit(faction, Math.max(0, actions - trenches));
  if (max === Infinity) return trenches ? Math.max(0, state.aiHand.length - trenches) : Infinity;
  return Math.max(0, max - trenches - (state.aiDiscardedThisTurn || 0));
}

/** 足止めの地形（§7.3/§13.3/§24.3）を置ける相手グループの候補（よい順）。
 *  鉄条網は移動中でなくても置ける（湿地・トーチカ・渡河前の河川は不可）。河川・湿地・地雷原は移動中の相手だけ。
 *  よい順: 前進している（距離チットが大きい）→ 移動中 → 人数が多い */
function aiHarassTargets(terrainType) {
  const R = window.INFANTRY_RULES;
  const groups = state.groups.player || [];
  const moving = g => isMovingIgnoringOverlays(g);
  const alive = g => g && !g.eliminated && g.cards.some(R.isAlive);
  const targets = groups.map((g, i) => ({ g, i })).filter(({ g, i }) => {
    if (!alive(g) || R.hasTerrainType(g, 'WIRE') || !enemyTerrainDiscardAllowed(g, terrainType)) return false;
    if (terrainType === 'WIRE') return !wireBlockReason(g);
    return moving(g) && (!R.canPlaceTerrainOnMarsh || R.canPlaceTerrainOnMarsh(g)) &&
      (!R.canPlaceTerrainOnGully || R.canPlaceTerrainOnGully(g)) &&
      (!R.canPlaceTerrainOnStream || R.canPlaceTerrainOnStream(g));
  });
  const playerKey = getFactionKey(state.player);
  const friends = state.groups.ai.filter(alive);
  const wireRank = ({ g, i }) => {
    if (cardFlankValid('player', i)) return 3;
    const armed = g.cards.filter(c => R.isAlive(c) && !R.isPinned(c));
    const lmg = armed.some(c => !c.malfunctioned && !c.destroyed &&
      /^軽機関銃/.test(weaponOfCard(c, playerKey)?.weaponCat || ''));
    if (moving(g) && armed.length &&
        (aiFiringGroup(g, playerKey) || armed.length >= 3 || window.AFV?.isAfvGroup(g))) return 2;
    if (lmg && friends.some(ally => moving(ally) || R.calcTerrainMod(ally.terrain, false) >= 0 ||
        ally.cards.some(c => R.isAlive(c) && R.isPinned(c)))) return 1;
    return 0;
  };
  return targets.sort((a, b) =>
    (terrainType === 'WIRE' ? wireRank(b) - wireRank(a) : 0) ||
    (Number(moving(b.g)) - Number(moving(a.g))) ||
    ((b.g.distance || 0) - (a.g.distance || 0)) ||
    (b.g.cards.filter(R.isAlive).length - a.g.cards.filter(R.isAlive).length)
  ).map(({ i }) => i);
}
const AI_HARASS_TYPES = ['WIRE', 'STREAM', 'MARSH', 'MINEFIELD', 'GULLY', 'BRUSH', 'WALL'];

function aiFindHarassPlay(types = AI_HARASS_TYPES, reserved = new Set(), blockedTargets = new Set()) {
  const SH = window.SCENARIO_HELPERS;
  const R = window.INFANTRY_RULES;
  const enemy = state.groups.player;
  const cardFor = type => state.aiHand.findIndex(c => c?.terrain?.type === type && !reserved.has(c) &&
    !SH?.isCardDisabledAsTerrain?.(state.scenario, c, state.aiRole === 'attacker'));
  const gully = types.includes('GULLY') ? cardFor('GULLY') : -1;
  if (gully >= 0) {
    const vehicle = aiHarassTargets('GULLY').find(i => !blockedTargets.has(i) && window.AFV?.isAfvGroup(enemy[i]) && !enemy[i]._bog);
    if (vehicle !== undefined) return { idx: gully, gi: vehicle };
  }
  for (const type of types) {
    const idx = type === 'GULLY' ? gully : cardFor(type);
    if (idx < 0) continue;
    const mildTerrain = type === 'BRUSH' || type === 'WALL';
    const gi = aiHarassTargets(type).find(i => {
      if (blockedTargets.has(i)) return false;
      if (mildTerrain) return !window.AFV?.isAfvGroup(enemy[i]);
      if (type !== 'GULLY') return true;
      return aiEnemyGullyTarget(enemy[i], i) && !state.groups.ai.some((g, j) => g && !g.eliminated &&
        g.cards.some(R.isAlive) && !g.cards.some(R.isPinned) && !R.isInGully(g) &&
        !R.hasTerrainType(g, 'WIRE') && aiGullyApproach(g, j));
    });
    if (gi !== undefined) return { idx, gi };
  }
  return null;
}
function aiVehicleGullyAvailable() {
  const play = aiFindHarassPlay(['GULLY']);
  return !!(play && window.AFV?.isAfvGroup(state.groups.player[play.gi]));
}
/** 足止めの地形を置ける場面か（ターンの型を決める材料） */
function aiHarassAvailable() { return !!aiFindHarassPlay(['WIRE', 'STREAM', 'MARSH', 'MINEFIELD', 'GULLY']); }
/** このターン撃てる射撃があるか（攻撃的な性格のターンの型の判断用） */
function aiHasFireOption() {
  const R = window.INFANTRY_RULES;
  const aiKey = getFactionKey(state.ai);
  const fires = state.aiHand.filter(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0)
    .map(c => { const m = (c.terrain.sub || '').match(/FP(.)/); return circledToNum((m && m[1]) || ''); })
    .filter(n => n > 0);
  if (!fires.length) return false;
  const need = Math.min(...fires);
  return (state.groups.ai || []).some((src, si) => {
    if (!src || src.eliminated) return false;
    return (state.groups.player || []).some((tgt, ti) => {
      if (!tgt || tgt.eliminated || !tgt.cards.some(c => R.isAlive(c))) return false;
      if (pillboxRelation('ai', si, ti) === 'blocked') return false;
      const base = R.relativeRange(src.distance, tgt.distance);
      const dist = Math.abs(si - ti) <= 1 ? base : Math.max(0, base - 1);
      const fp = R.calcGroupFirepower(src, aiKey, dist, { moving: isMovingIgnoringOverlays(src), crewMap: buildCrewMapFromPairs(src) });
      return fp >= infantryFireNeed(aiKey, src, need);
    });
  });
}

/** §18.2 AI: グループに落ちている兵器は必ず拾う（1アクション。元の助手がいればクルー兵器は助手が自動で §18.22） */
async function aiTryPickupWeapon() {
  const R = window.INFANTRY_RULES;
  const aiKey = getFactionKey(state.ai);
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  const fpSum = w => (w && w.rangeData ? w.rangeData.reduce((t, rd) => t + ((rd && !rd.na && rd.main) || 0), 0) : 0);
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || acted.has(gi) || fired.has(gi)) continue;
    const pool = (g.weaponPool || []).filter(x => !x.isDemo && !x.secondary);
    if (!pool.length) continue;
    const w = pool.slice().sort((a, b) => fpSum(b) - fpSum(a))[0];
    let soldier = null, auto = false;
    if (w.needsCrew && w.assistantNum != null) {
      soldier = g.cards.find(c => c.num === w.assistantNum && R.isAlive(c) && !R.isPinned(c) && !c.transfer) || null;
      auto = !!soldier;
    }
    if (!soldier) {
      const cands = g.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.transfer && !c.infiltrating &&
        !window.AFV.isAfvCard(c) && !infantryGunProfile(c, 'ai'));
      if (!cands.length) continue;
      // いま持っている兵器の弱い兵士が拾う（兵器が壊れている兵士は火力 0 として比べる）
      const curFP = c => (c.destroyed ? 0 : fpSum(weaponOfCard(c, aiKey)));
      soldier = cands.sort((a, b) => curFP(a) - curFP(b))[0];
      // 今の兵器より強い時だけ拾う（同じ兵器どうしの交換を繰り返さない）
      if (fpSum(w) <= curFP(soldier)) continue;
    }
    let ok = auto, judge = null;
    if (!auto) {
      judge = drawRandomReinforcementRnc('ai');
      if (judge) { showJudgeCard(judge); checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
      ok = !!judge && !(judge.terrain && judge.terrain.rncColor === '赤');
    }
    const d = R.lookupSoldier(soldier, aiKey);
    if (ok) {
      const old = weaponOfCard(soldier, aiKey);
      g.weaponPool.splice(g.weaponPool.indexOf(w), 1); // 本物の置き場から取る（pool は爆薬を除いた写し）
      if (old) g.weaponPool.push(Object.assign({ fromNum: soldier.num, assistantNum: null, fromSide: 'ai' }, old));
      installAcquiredWeapon(g, soldier, w);
      if (soldier.wounded) woundPortage(soldier);
    }
    acted.add(gi);
    renderField('ai');
    await showAIAction(`AI: 兵器を拾う — ${d ? d.name : soldier.id} → ${w.weaponName || w.weaponCat} ${ok ? '成功' : '失敗（赤のRNC）'}`, judge, gi);
    return true;
  }
  return false;
}

/** §17.8 AI: グループにただ1人になった兵士は、隣の同じ距離チットのグループへ個人移送する（移動カード1枚） */
async function aiTryTransferLoner() {
  const R = window.INFANTRY_RULES;
  const mvIdx = aiActionCardIndex('MOVEMENT');
  if (mvIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || g.forming || acted.has(gi) || fired.has(gi) || (window.AFV && window.AFV.isAfvGroup(g))) continue;
    const alive = g.cards.filter(c => R.isAlive(c));
    if (alive.length !== 1) continue;
    const soldier = alive[0];
    if (R.isPinned(soldier) || soldier.infiltrating || soldier.transfer) continue;
    const dest = transferDestinations('ai', gi).filter(d => !d.isNew).find(d => !transferBlockReason('ai', gi, d, [soldier]));
    if (!dest) continue;
    return await withDeckAttack(async () => {
      const mc = state.aiHand.splice(mvIdx, 1)[0];
      pushTerrainToDiscard(mc);
      const arrivals = troopsAbleToTransfer('ai', g, [soldier], [mc]);
      if (arrivals.length) startTransfer('ai', gi, dest, arrivals);
      state.aiHandCount = state.aiHand.length;
      acted.add(gi);
      renderField('ai'); renderHands();
      const name = R.lookupSoldier(soldier, getFactionKey(state.ai))?.name || soldier.id;
      const status = arrivals.length
        ? `AI: 個人移送 — ${name} を GROUP ${groupSlotName(dest.idx)} へ`
        : `AI: ${name} は渡河に失敗し、個人移送を開始できませんでした。`;
      await showAIAction(status, mc, gi);
      return true;
    });
  }
  return false;
}

/** §17.8 AI: 移送してきた兵士を受け取る（受け取るグループの1アクション。移送を始めたターンは不可） */
async function aiTryReceiveTransfer() {
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || g.forming || acted.has(gi) || fired.has(gi) || (window.AFV && window.AFV.isAfvGroup(g))) continue;
    if (!incomingTransit('ai', gi).some(c => c.transfer.startTurn < (state.turnCount || 0))) continue;
    const n = receiveTransfers('ai', gi);
    if (!n) continue;
    acted.add(gi);
    renderField('ai');
    await showAIAction(`AI: 移送の受け取り — GROUP ${g.name} が ${n}名を受け取り`, null, gi);
    return true;
  }
  return false;
}

/** §7.3 捨て札の代わりに、足止めの地形を相手に置く（置ける時は必ず置く） */
async function aiTryPlaceBadTerrain(declaration = null) {
  if (!declaration && aiRemainingDiscard() <= 0) return false;
  const play = declaration || aiFindHarassPlay();
  if (!play) return false;
  const groups = state.groups.player;
  const terrainCard = declaration?.card || state.aiHand[play.idx];
  const eligible = aiHarassTargets(terrainCard.terrain.type);
  let index = declaration?.index ?? play.gi;
  if (declaration && groups[index]?.eliminated) index = eligible[0];
  if (!eligible.includes(index) || !jungleTerrainAllowed(groups[index], terrainCard, 'player')) return false;
  recordEnemyTerrainDiscard(groups[index], terrainCard.terrain.type);
  if (!declaration) {
    state.aiHand.splice(play.idx, 1);
    state.aiDiscardedThisTurn = (state.aiDiscardedThisTurn || 0) + 1;
  }
  state.aiHandCount = state.aiHand.length;
  await showAIAction('AI: 地形配置 → GROUP ' + groups[index].name, terrainCard);
  if (!partisanTrap('ai', groups[index], terrainCard)) await askTerrainRefusal(groups[index], terrainCard);
  cleanupEliminatedGroups();
  renderField('player'); renderField('ai');
  renderHands();
  return true;
}

// §4.3・§14.5 AIも全ての攻撃の札と目標を先に決定する。
function planAiDiscardAttacks() {
  const plan = [];
  const reserved = new Set();
  const terrainTargets = new Set();
  const limit = aiRemainingDiscard();
  while (plan.length < limit) {
    const play = aiFindHarassPlay(AI_HARASS_TYPES, reserved, terrainTargets);
    if (!play) break;
    const card = state.aiHand[play.idx];
    reserved.add(card);
    terrainTargets.add(play.gi);
    plan.push({ kind: 'terrain', card, index: play.gi });
  }
  if (surpriseCanSnipe('ai')) {
    const index = aiSniperTargetIndex();
    for (const card of state.aiHand) {
      if (index < 0 || plan.length >= limit) break;
      if (reserved.has(card) || !sniperCardPlayable(card, 'ai')) continue;
      reserved.add(card);
      plan.push({ kind: 'snipe', card, index });
    }
  }
  state.aiHand = state.aiHand.filter(card => !reserved.has(card));
  state.aiHandCount = state.aiHand.length;
  state.aiDiscardedThisTurn = (state.aiDiscardedThisTurn || 0) + plan.length;
  return plan;
}

async function resolveAiDiscardAttacks(plan) {
  for (const entry of plan) {
    if (state.phase !== 'play' || settleDeckTimeLimit()) break;
    const resolved = entry.kind === 'terrain' ? await aiTryPlaceBadTerrain(entry) : await aiTrySnipe(entry);
    if (!resolved) pushTerrainToDiscard(entry.card);
    else if (entry.kind === 'snipe') state.aiSnipedThisTurn = true;
  }
}

function tryAdvanceTerrainPhase() {
  // 両者が完了/配置不可なら終了
  const pHas = state.playerHand.some(c => isTerrainHandCard(c)) && !state.terrainDone.player;
  const aHas = state.aiHand.some(c => isTerrainHandCard(c, 'ai')) && !state.terrainDone.ai;
  if (!pHas && !aHas) { endTerrainPlacementPhase(); return; }
  // 手番交代 (相手にまだ置く余地があれば)
  if (state.terrainTurn === 'player') {
    state.terrainTurn = aHas ? 'ai' : 'player';
  } else {
    state.terrainTurn = pHas ? 'player' : 'ai';
  }
  state.terrainSelected = null;
  updatePhaseBanner();
  renderHands();
  if (state.terrainTurn === 'ai') setTimeout(aiPlaceTerrain, 600);
}

function placeTerrainOnGroup(side, groupIdx, card, fromHand /* 'player'|'ai' */) {
  const group = state.groups[side][groupIdx];
  if (!group || !jungleTerrainAllowed(group, card, side)) return false;
  if (state.scenario?.victoryPreset && !isTerrainHandCard(card, fromHand)) return false;
  if (state.phase === 'terrainPlacement' && state.scenario?.openingTrenches &&
      side !== fromHand && state[side + 'Role'] === 'defender' && groupCanEntrench(group, side)) {
    if (fromHand === 'player') alert(radioText('塹壕で開始する守備側グループに地形は置けません。',
      'Enemy terrain cannot be placed on this entrenched group during setup.'));
    return false;
  }
  const cardType = card && card.terrain && card.terrain.type;
  if (terrainEntryForbidden(group, cardType, side)) return false;
  // シナリオC: 守備側のBグループはトーチカ専用（他の地形カード配置不可）／トーチカはBグループ限定
  if (state.scenario && state.scenario.id === 'C') {
    const defenderSide = state.playerRole === 'defender' ? 'player' : 'ai';
    if (side === defenderSide && group.name === 'B' && cardType !== 'PILLBOX') {
      if (fromHand === 'player') alert('守備側のBグループはトーチカ専用です');
      return false;
    }
    if (cardType === 'PILLBOX' && group.name !== 'B') {
      if (fromHand === 'player') alert('トーチカはBグループにのみ配置できます');
      return false;
    }
  }
  // 初期配置では1グループに地形1枚まで
  if (state.phase === 'terrainPlacement' && group.terrain && group.terrain.some(c => !isDummyPlain(c))) {
    if (fromHand === 'player') alert('初期配置では1グループに地形1枚までです');
    return false;
  }
  const top = group.terrain && group.terrain.length > 0 ? group.terrain[group.terrain.length - 1] : null;
  const topType = top && top.terrain && top.terrain.type;
  // プレイ中: 移動中のグループにのみ地形カード配置可能（煙幕/鉄条網を除く）
  if (state.phase === 'play' && cardType !== 'SMOKE' && cardType !== 'WIRE') {
    if (topType !== 'MOVEMENT') {
      if (fromHand === 'player') alert('移動中のグループにのみ地形を配置できます');
      return false;
    }
  }
  // 煙幕/鉄条網は自然地形の上にのみ（移動中/空は不可）
  if (cardType === 'SMOKE' || cardType === 'WIRE') {
    const naturalTerrains = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','STREAM','MARSH','GULLY'];
    if (!topType || naturalTerrains.indexOf(topType) < 0) {
      if (fromHand === 'player') alert('煙幕/鉄条網は地形の上にのみ置けます（移動中は不可）');
      return false;
    }
  }
  // 仮の平地カードは置いた地形カードと入れ替える
  if (state.phase === 'terrainPlacement') group.terrain = group.terrain.filter(c => !isDummyPlain(c));
  pushTerrainWithFaction(group, card);
  // 手札から取り除く
  const hand = fromHand === 'player' ? state.playerHand : state.aiHand;
  const idx = hand.indexOf(card);
  if (idx >= 0) hand.splice(idx, 1);
  state.aiHandCount = state.aiHand.length;
  renderField(side);
  renderHands();
  return true;
}

function aiPlaceTerrain() {
  if (state.phase !== 'terrainPlacement' || state.terrainTurn !== 'ai') return;
  // 相手に不利な地形 → 相手に配置
  const badForEnemy = ['WIRE','STREAM','MARSH'];
  // 人工地形（初期配置では使えない、ゲーム中は既存地形の上にのみ）
  const artificial = ['SMOKE','WIRE','MINEFIELD'];
  const R = window.INFANTRY_RULES;
  const usable = state.aiHand.filter(c => isTerrainHandCard(c, 'ai') && artificial.indexOf(c.terrain.type) < 0);
  const plays = [];
  for (const c of usable) {
    const type = c.terrain.type;
    const sides = type === 'GULLY' ? ['ai', 'player'] : [badForEnemy.includes(type) ? 'player' : 'ai'];
    for (const side of sides) {
      const gs = state.groups[side] || [];
      const cands = gs.map((g, i) => i).filter(i => {
        const g = gs[i];
        return g && !g.eliminated && g.cards.some(R.isAlive) && !(g.terrain || []).some(x => !isDummyPlain(x));
      }).sort(() => Math.random() - 0.5);
      for (const gi of cands) {
        const g = gs[gi];
        const preference = side === 'ai' ? aiOwnTerrainPreference(type, g, gi) : 0;
        if (preference < 0) continue;
        const enemyGully = type === 'GULLY' && side === 'player';
        if (enemyGully && !aiEnemyGullyTarget(g, gi)) continue;
        plays.push({ side, gi, c, priority: preference * 2 + (enemyGully ? 1 : 0) });
      }
    }
  }
  // 丘・ガリーの優先先があれば先に置き、残りは手札順。
  plays.sort((a, b) => b.priority - a.priority);
  for (const { side, gi, c } of plays) {
    if (placeTerrainOnGroup(side, gi, c, 'ai')) { tryAdvanceTerrainPhase(); return; }
  }
  state.terrainDone.ai = true;
  tryAdvanceTerrainPhase();
}

function onPlayerHandClickTerrainPhase(idx) {
  const card = state.playerHand[idx];
  if (!isTerrainHandCard(card)) return;
  state.terrainSelected = (state.terrainSelected === idx) ? null : idx;
  renderHands();
  highlightTerrainTargets(state.terrainSelected != null);
}

function highlightTerrainTargets(on) {
  document.querySelectorAll('.main-group').forEach(g => g.classList.toggle('group-target-hint', !!on));
}

function onGroupClickTerrainPhase(side, groupIdx) {
  if (state.phase !== 'terrainPlacement' || state.terrainTurn !== 'player') return;
  if (state.terrainSelected == null) return;
  const card = state.playerHand[state.terrainSelected];
  if (!isTerrainHandCard(card)) return;
  placeTerrainOnGroup(side, groupIdx, card, 'player');
  highlightTerrainTargets(false);
  tryAdvanceTerrainPhase();
}

document.getElementById('phase-skip').addEventListener('click', () => {
  if (state.phase !== 'terrainPlacement') return;
  if (state.terrainTurn === 'player') {
    state.terrainDone.player = true;
  } else {
    state.terrainDone.ai = true;
  }
  state.terrainSelected = null;
  highlightTerrainTargets(false);
  tryAdvanceTerrainPhase();
});

// 非対称シナリオ選択時に先攻選択UIを表示（C/D共通）
(function () {
  const sp = document.getElementById('scenario-pick');
  const row = document.getElementById('first-player-row');
  if (!sp || !row) return;
  const update = () => {
    const sc = window.SCENARIOS && window.SCENARIOS[sp.value];
    row.style.display = (sc && sc.asymmetric) ? '' : 'none';
  };
  sp.addEventListener('change', update);
  update();
})();

// ===== コマンドチャートどおりの AI（ユーザーのチャート 2026-11-07）。行ごとに何回使われたかを数える =====
// 本番の設定（2026-11-08 ユーザーの指示で全部の国をチャートに入れ替え）。sim/run.js は自分で上書きする
if (window.__chartAI === undefined) Object.assign(window, { __chartAI: true, __chartNat: 'all', __fire1: true, __gerExtra: true, __nightMove: true, __pillboxFixed3: true, __splitA: { ger: 4, us: 4, rus: 4, jpn: 5, uk: 5 }, __defAdv: 'D', __cDefAdv: true });
function chartDefAdv() { return window.__defAdv === 'D' ? !!(state.scenario && state.scenario.id === 'D' && state.aiRole === 'defender') : !!window.__defAdv; }
async function chartTurn(nat) {
  const R = window.INFANTRY_RULES;
  window.__inChart = true;
  try { return await chartTurn0(nat); } finally { window.__inChart = false; }
}
async function chartTurn0(nat) {
  const R = window.INFANTRY_RULES;
  const C = window.__chartCount || (window.__chartCount = {});
  const inc = k => { C[k] = (C[k] || 0) + 1; };
  inc('手番');
  const alive = g => g && !g.eliminated && g.cards.some(c => R.isAlive(c));
  const mine = () => (state.groups.ai || []).map((g, i) => ({ g, i })).filter(x => alive(x.g));
  const enemies = () => (state.groups.player || []).filter(alive);
  const rangeOf = g => { const es = enemies(); return es.length ? Math.min(...es.map(e => (g.distance || 0) + (e.distance || 0))) : 0; };
  const hand = () => state.aiHand || [];
  const nMove = () => hand().filter(c => handActionFace(c, 'MOVEMENT', 'ai')).length;
  const nFire = () => hand().filter(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0).length;
  const hold = chartDefAdv() ? false : ((state.groups.ai || []).some(g => g && g._role === 'hold') || state.aiRole === 'defender');
  // 前の手番の終わりに移動中だったグループが、相手の手番のあとどうなったか
  const isMovingTop = g => { const t = g.terrain && g.terrain.length ? g.terrain[g.terrain.length - 1] : null; return !!(t && t.terrain && t.terrain.type === 'MOVEMENT'); };
  (state.groups.ai || []).forEach(g => {
    if (!g || !g._chartWasMoving) return;
    g._chartWasMoving = false;
    if (g.eliminated || !g.cards.some(c => R.isAlive(c))) inc('移動したグループ: 相手の手番で全滅');
    else if (isMovingTop(g)) inc('移動したグループ: 自分の手番の始めにまだ移動中');
    else inc('移動したグループ: 相手に地形を置かれた');
  });
  inc(hold ? '表:待機' : '表:前進');
  inc('手番の始めの手札 ' + hand().length + '枚（上限 ' + (state.ai && state.ai.handMax) + '）');
  const goodTerrain = () => hand().some(c => c && c.terrain && ['WOODS','BUILDINGS','BRUSH','HILL','WALL','GULLY'].indexOf(c.terrain.type) >= 0);
  const isHero = c => c && c.terrain && c.terrain.type === 'HERO';
  const discard = async (label) => {
    const keepMove = !hold && !goodTerrain(); // 前進で地形カードがない時は、移動カードは残して地形を引きに行く
    // 移動カードは1枚だけ残す（2枚目からは捨ててよい。ユーザーの指示 2026-11-07）
    const firstMove = hand().findIndex(c => handActionFace(c, 'MOVEMENT', 'ai'));
    const cand = hand().map((c, i) => ({ c, i })).filter(x => !isHero(x.c) && !(keepMove && x.i === firstMove));
    const n = Math.min(cand.length, aiRemainingDiscard());
    if (!n) return false;
    const pick = []; for (let k = 0; k < n; k++) { const j = Math.floor(Math.random() * cand.length); pick.push(cand.splice(j, 1)[0]); }
    pick.sort((a, b) => b.i - a.i).forEach(x => { const c = hand().splice(x.i, 1)[0]; pushTerrainToDiscard(c); });
    state.aiDumpedThisTurn = true;
    state.aiDiscardedThisTurn += n;
    state.aiHandCount = hand().length; renderHands();
    inc(label + `（${n}枚）`);
    await showAIAction('AI: 捨て札 ' + n + '枚', null);
    return true;
  };
  // --- アクション ---
  const nightOnly = f => async () => state.isNight ? f() : false;
  // 前進の表: 相手の前の手番に、こちらのどれかのグループが撃たれた（turnCount は手番ごとに1つ進む）
  const firedLast = () => mine().some(x => x.g._firedUponTurn != null && x.g._firedUponTurn === (state.turnCount || 0) - 1);
  // 前進の表: 移動中で相対距離3以下のグループのうち、モラル（生きている兵の平均）が一番高いグループ
  const keepMovingGroup = () => {
    const fk = getFactionKey(state.ai);
    const mor = g => { const a = g.cards.filter(c => R.isAlive(c)); return a.length ? a.reduce((t, c) => { const d = R.lookupSoldier(c, fk); return t + (d ? (parseInt(d.morale, 10) || 0) : 0); }, 0) / a.length : 0; };
    const cand = mine().filter(x => isMovingTop(x.g) && rangeOf(x.g) <= 3).sort((a, b) => mor(b.g) - mor(a.g));
    return cand.length ? cand[0].i : -1;
  };
  // C の守備（試し 2026-11-08）: 守りのある地形（修正がマイナス）にいない、トーチカでないグループ
  const protectiveNow = g => (R.calcTerrainMod(g.terrain || [], false, {}) || 0) < 0 && !isMovingTop(g);
  const cDefMovable = () => new Set(mine().filter(x => !hasPillbox(x.g) && !protectiveNow(x.g)).map(x => x.i));
  // 相対距離4になったグループ（トーチカでない）は後退する。移動カード1枚で距離チットを1つ戻す
  const chartCDefRetreat = async () => {
    const mi = aiActionCardIndex('MOVEMENT'); if (mi < 0) return false;
    const acted = state.aiActedGroups || new Set(), fired = state.aiFiredGroups || new Set();
    for (const x of mine()) {
      const g = x.g, gi = x.i;
      if (acted.has(gi) || fired.has(gi) || hasPillbox(g) || g.pendingShift || g._immob || g._bog || g._stun ||
          transferLocksRange('ai', gi)) continue;
      if (rangeOf(g) < 4) continue;
      if (g.cards.some(c => R.isAlive(c) && R.isPinned(c))) continue;
      if (R.hasTerrainType(g, 'WIRE') || R.isInStream(g) || requiresLateralMovement(g, 'ai')) continue;
      const card = hand()[mi]; const nd = g.distance - 1;
      if (!retreatRangeAllowed(g, 'ai', nd)) continue;
      if (nd < 0 && !(card.terrain && card.terrain.rncColor === '赤')) continue;
      g.distance = nd; card._moveMode = 'retreat'; pushTerrainWithFaction(g, card);
      state.aiHand.splice(mi, 1); state.aiHandCount = state.aiHand.length;
      releaseInfiltrationOnRetreat(g, 'ai', 'move');
      acted.add(gi); renderField('ai'); renderHands();
      await showAIAction(`AI: 後退 — GROUP ${g.name}（相対距離4・C の守備）`, card, gi);
      return true;
    }
    return false;
  };
  // 待機の表: 手札の地形のほうが、今の地形より修正がよいグループ（修正の向きは建物の修正の符号で決める）
  const betterTerrainGroups = () => {
    const GOOD = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','GULLY'];
    const cards = hand().filter(c => c && c.terrain && GOOD.indexOf(c.terrain.type) >= 0);
    const out = new Set(); if (!cards.length) return out;
    const sgn = Math.sign(R.calcTerrainMod([{ terrain: { type: 'BUILDINGS' } }], false, {}) || -1);
    const val = st => sgn * (R.calcTerrainMod(st, false, {}) || 0);
    const best = Math.max(...cards.map(c => val([c])));
    mine().forEach(x => { if (best > val(x.g.terrain || [])) out.add(x.i); });
    return out;
  };
  const ROW_ADV = [
    ['火炎放射器', [aiTryFlameFire]], // 2026-11-08 ユーザーの指示: 全部の行の中で一番先
    ['地雷原を抜ける', [aiTryMineLateral]],
    ['迫られたグループは後退', [aiTryRetreatFromCC]],
    ['地形+横移動のとき移動カード', [aiTryCrossStream, typeof aiTryStreamExit === 'function' ? aiTryStreamExit : async () => false]],
    ['移動中がいれば有利な地形を置く', [() => aiTryPlaceOwnTerrain(), async () => (window.__nightMove && state.isNight) ? aiTryPlaceOwnPlain() : false]],
    ['回復', [aiTryRally, aiTryHeroWound]],
    ['地雷原排除', [aiTryMineRemove]],
    ['兵器を拾う', [aiTryPickupWeapon]],
    ['クルー設定', [aiTryCrewSetup]],
    ['スタックの脱出', [async () => window.AFV && window.AFV.aiTryUnbog ? window.AFV.aiTryUnbog() : false]],
    ['侵入解除', [aiTryUninfiltrate]],
    ['AFVへの侵入→肉薄', [async () => window.AFV ? window.AFV.aiTryCCAfv() : false]],
    ['対人への侵入', [aiTryBanzai, () => aiTryInfiltrate({ noAfv: true }), () => aiTryInfiltrate({ demoOnly: true, noAfv: true }), aiTryCC]],
    ['煙幕(相対距離3以上)', [async () => mine().some(x => rangeOf(x.g) >= 3) ? aiTryPlaceOwnSmoke() : false]],
    ['敵が射撃した次のターン→地形なしで移動', [async () => firedLast() ? aiTryMove({ noTerrainNeed: true }) : false, async () => firedLast() && window.AFV ? window.AFV.aiTryOverrun() : false, async () => firedLast() ? aiTryFlankEncircle() : false]],
    ['移動+地形カード→移動', [async () => (goodTerrain() || (window.__nightMove && state.isNight)) ? aiTryMove() : false, async () => window.AFV ? window.AFV.aiTryOverrun() : false, aiTryFlankEncircle]],
    ['移動中→さらに移動/平地を置く', [async () => { const i = keepMovingGroup(); return i >= 0 ? aiTryMove({ only: new Set([i]), noTerrainNeed: true }) : false; }, () => aiTryPlaceOwnPlain()]],
    ['修理', [aiTryRepair]],
    ['夜:射撃/索敵/照明弾', [nightOnly(aiTryFireLit), nightOnly(aiTryFireAny), nightOnly(aiTryScout), nightOnly(aiTryFlare)]],
    ['相手が移動中なら撃つ', [aiTryFireMovingEnemy]],
    ['射撃カード2枚→射撃', [async () => nFire() >= (window.__fire1 ? 1 : 2) ? aiTryFireAny() : false]],
    ['大砲', [aiTryMortar, async () => window.AFV ? window.AFV.aiTryGun() : false]],
    ['鉄条網除去', [aiTryRemoveWire]],
    ['狙撃兵チェック', [aiTrySniperCheck]],
    ['個人移送/受け取り', [aiTryTransferLoner, aiTryReceiveTransfer]],
    ['側方移送', [aiTryGroupShift]],
    ['監視役交代', [aiTryGuardChange]],
    ['塹壕', [aiTryTrench]],
  ];
  const ROW_HOLD = [
    ['移動中がいれば有利な地形を置く', [() => aiTryPlaceOwnTerrain(), async () => state.isNight ? aiTryPlaceOwnPlain() : false]],
    ['塹壕', [aiTryTrench]],
    ['回復', [aiTryRally, aiTryHeroWound]],
    ['地雷原排除', [aiTryMineRemove]],
    ['兵器を拾う', [aiTryPickupWeapon]],
    ['クルー設定', [aiTryCrewSetup]],
    ['スタックの脱出', [async () => window.AFV && window.AFV.aiTryUnbog ? window.AFV.aiTryUnbog() : false]],
    ['侵入解除', [aiTryUninfiltrate]],
    ['AFVへの侵入→肉薄', [async () => window.AFV ? window.AFV.aiTryCCAfv() : false]], // チャートの待機24行目（2026-11-08 前進の表と同じ形に分けた）
    ['対人への侵入', [aiTryBanzai, () => aiTryInfiltrate({ noAfv: true }), () => aiTryInfiltrate({ demoOnly: true, noAfv: true }), aiTryCC]],
    /* チャートの待機25行目（2026-11-08 ユーザーが「今より」を外した）。C の守備（試し）: 守りのある地形にいるグループは動かない。相対距離4なら後退、そうでなければ前進 */ ['移動+効果のある地形→横移動', [async () => { if (window.__cDefAdv && state.scenario && state.scenario.id === 'C') { if (await chartCDefRetreat()) return true; const o = cDefMovable(); return (goodTerrain() && o.size) ? aiTryMove({ only: o }) : false; } return goodTerrain() ? aiTryMove({ lateral: true }) : false; }, async () => window.AFV ? window.AFV.aiTryOverrun() : false, aiTryFlankEncircle]],
    ['修理', [aiTryRepair]],
    ['夜:射撃/索敵/照明弾', [nightOnly(aiTryFireLit), nightOnly(aiTryFireAny), nightOnly(aiTryScout), nightOnly(aiTryFlare)]],
    ['相手が移動中なら撃つ', [aiTryFireMovingEnemy]],
    ['射撃カード1枚→射撃', [async () => nFire() >= 1 ? aiTryFireAny() : false]], // チャートの待機29行目（2026-11-08 ユーザーが1枚に変更）
    ['大砲', [aiTryMortar, async () => window.AFV ? window.AFV.aiTryGun() : false]],
    ['鉄条網除去', [aiTryRemoveWire]],
    ['狙撃兵チェック', [aiTrySniperCheck]],
    ['個人移送/受け取り', [aiTryTransferLoner, aiTryReceiveTransfer]],
    ['側方移送', [aiTryGroupShift]],
    ['監視役交代', [aiTryGuardChange]],
  ];
  const rows = hold ? ROW_HOLD : ROW_ADV;
  let acted = 0;
  for (let safety = 0; state.phase === 'play' && safety < 30; safety++) {
    let did = false;
    for (const [label, fns] of rows) {
      for (let k = 0; k < fns.length; k++) {
        if (state.phase !== 'play' || settleDeckTimeLimit()) return;
        let r = false;
        const previousActions = state.aiActionCount;
        try { r = await fns[k](); } catch (e) { inc('エラー:' + label); r = false; }
        if (r) {
          inc(`${label}#${k + 1}`);
          if (r !== 'detected' && r !== 'hero') {
            if (!(nat === 'jpn' && label.indexOf('移動') >= 0) && state.aiActionCount === previousActions) markAIAction();
            acted++;
          }
          did = true;
          break;
        }
      }
      if (did) break;
    }
    if (!did) break;
  }
  // テスト用（2026-11-08）: ドイツは、何もできなかった手番に、移動以外で手札が減るアクションを1つ試す（そのあと1枚捨てる）
  if (state.phase !== 'play') return;
  if (!acted && nat === 'ger' && window.__gerExtra) {
    const EXTRA = [['射撃(1枚でも)', () => aiFireAt(state.groups.player.map((_, i) => i), { anyFire: true })], ['火炎放射器', aiTryFlameFire], ['大砲', aiTryMortar], ['地形(移動中に)', () => aiTryPlaceOwnTerrain()], ['平地(移動中に)', () => aiTryPlaceOwnPlain()], ['煙幕', aiTryPlaceOwnSmoke], ['回復', aiTryRally], ['修理', aiTryRepair], ['塹壕', aiTryTrench]];
    for (const [label, fn] of EXTRA) {
      let r = false; try { r = await fn(); } catch (e) { inc('エラー:ドイツ追加:' + label); }
      if (r) { inc('ドイツ追加:' + label); state.aiActedThisTurn = true; acted++; break; }
    }
    if (!acted) inc('ドイツ追加:使えるカードなし');
  }
  (state.groups.ai || []).forEach(g => { if (g && !g.eliminated && isMovingTop(g)) { g._chartWasMoving = true; inc('手番の終わりに移動中のグループ'); } });
  // --- 何もできなかったら捨て札の手番（ドイツはアクションのあとも1枚） ---
  if (aiRemainingDiscard() > 0) {
    if (!state.aiActedThisTurn) inc('アクションなし→捨て札の手番');
    if (await aiTryPlaceBadTerrain()) inc('捨て札:足止めの地形');
    else if (await aiTrySnipe()) inc('捨て札:狙撃');
    else await discard(state.aiActedThisTurn ? '捨て札:アクション後' : '捨て札:要らないカード');
  }
}
