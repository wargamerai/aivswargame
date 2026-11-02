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
function showAIAction(text, cards, groupIdx) {
  try { ufReportLog('ai', text, 'ai'); } catch (e) {}
  // グループが切り替わったら中継オーバーレイを挟む（カード非表示・テキストのみ）
  if (groupIdx != null && groupIdx !== _lastActingGroupIdx) {
    const grp = state.groups.ai[groupIdx];
    const grpName = grp ? grp.name : `GROUP ${groupIdx+1}`;
    const sep = _aiActionQueue.then(() => _showAIActionImpl(`次のグループ → ${grpName}`, null));
    _aiActionQueue = sep.catch(() => {});
  }
  _lastActingGroupIdx = (groupIdx != null) ? groupIdx : _lastActingGroupIdx;
  const next = _aiActionQueue.then(() => _showAIActionImpl(text, cards));
  _aiActionQueue = next.catch(() => {});
  return next;
}
function _showAIActionImpl(text, cards) {
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
    if (valid.length > 0) {
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
    // トーチカ持ちグループは侵入禁止
    if (hasPillbox(grp)) continue;
    const inf = CC.getInfiltratingFromGroup(grp);
    if (inf.length === 0) continue;
    if (!CC.canAttemptCC(grp).ok) continue; // §20.55 侵入先が相対距離5より下がっている など
    if (aiFlameShouldFire(grp, gi)) continue; // 火炎放射器で撃てるなら白兵戦より射撃を優先
    { const _t = inf[0] && state.groups[inf[0].infiltratedGroupSide] && state.groups[inf[0].infiltratedGroupSide][inf[0].infiltratedGroupIdx];
      if (_t && !inf.some(c => c.demoCharge) && !aiCCRankOK(grp, inf, _t).ok) continue; } // 相手と比べて不利なら白兵戦をしない
    await showAIAction('AI: 白兵戦', null, gi);
    await CC.aiExecuteCC(grp, gi, ccDrawCard, aiKey);
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
async function aiTryInfiltrate() {
  const CC = window.CC_ACTION;
  const R = window.INFANTRY_RULES;
  if (!CC || !R) return false;
  const aiKey = getFactionKey(state.ai);
  const acted = state.aiActedGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const src = state.groups.ai[gi];
    // トーチカ持ちグループは侵入禁止
    if (hasPillbox(src)) continue;
    // ピン状態でない生存兵士が必要
    if (!src.cards.some(c => R.isAlive(c) && !R.isPinned(c))) continue;
    // 侵入兵になる兵（ピン状態でない・監視役でない・負傷していない）で白兵戦をしないランクなら、侵入しない（侵入解除と同じ基準）
    const _would = src.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.infiltrating
      && !(c.prisoners && c.prisoners.length) && !R.isWoundActive(c));
    if (aiFlameShouldFire(src, gi)) continue; // 火炎放射器で撃てるなら侵入しない（射撃を優先）
    const _demoHere = _would.some(c => c.demoCharge);
    if (!_demoHere && !aiCCRankOK(src, _would).ok) continue; // 爆薬の兵がいれば止めない（火力8の攻撃）
    for (let ti = 0; ti < state.groups.player.length; ti++) {
      const tgt = state.groups.player[ti];
      if (!tgt.cards.some(c => R.isAlive(c))) continue;
      if (!_demoHere && !aiCCRankOK(src, _would, tgt).ok) continue; // 相手の白兵戦の値と比べて不利なら侵入しない
      if (!aiCanTargetRecognized(gi, ti)) continue; // 夜間: 未認知は侵入不可
      const chk = CC.canAttemptInfiltration(src, tgt, 'ai');
      if (!chk.ok) continue;
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
  if (state.phase !== 'play' || state.currentTurn !== 'ai') return;
  const R = window.INFANTRY_RULES;
  if (!R) { endAITurn(); return; }

  // 1グループ1アクション制限のためのトラッキング
  state.aiActedGroups = new Set();
  // 射撃済みグループ (射撃後は他アクション不可、射撃のみ継続可)
  state.aiFiredGroups = new Set();
  // 行動有無トラッキング（捨て札ルール用）
  state.aiActedThisTurn = false;
  // §7.3 相手への地形配置で使った捨て札の枚数
  state.aiDiscardedThisTurn = 0;
  state.aiDumpedThisTurn = false;
  checkWoundEndurance(); // §33.7 AI のターンの開始時
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
    discardTurn = !(style === 'aggr' && aiHasFireOption());
  }
  state.aiDiscardTurn = discardTurn;

  if (!discardTurn) {
    // §14.4 直前のプレイヤーターンに狙撃されていれば、狙撃兵チェックを1回試みる（1アクション）
    await aiTrySniperCheck();
    // 性格で行動の優先順を変える
    const S = {
      ownTerrain: async () => (await aiTryPlaceOwnTerrain()) || (await aiTryPlaceOwnPlain()),
      rally: aiTryRally, fireMoving: aiTryFireMovingEnemy, mortar: aiTryMortar,
      mine: async () => (await aiTryMineRemove()) || (await aiTryMineLateral()),
      cross: aiTryCrossStream, wire: aiTryRemoveWire, repair: aiTryRepair, crew: aiTryCrewSetup,
      weapon: aiTryPickupWeapon, receive: aiTryReceiveTransfer, loner: aiTryTransferLoner,
      scout: aiTryScout, flare: aiTryFlare, cc: aiTryCC, infiltrate: aiTryInfiltrate, ccRetreat: aiTryRetreatFromCC,
      fireAny: aiTryFireAny, flank: aiTryFlankEncircle, smoke: aiTryPlaceOwnSmoke, move: aiTryMove, trench: aiTryTrench,
      guard: aiTryGuardChange, heroWound: aiTryHeroWound, shift: aiTryGroupShift, uninfiltrate: aiTryUninfiltrate,
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
    let safety = 30;
    outer: while (safety-- > 0) {
      for (const key of ORDER_USE) {
        const r = await S[key]();
        if (!r) continue;
        // §10.4 ヒーローでの回復はアクションにしない。§45 日本軍の移動もアクションにしない
        if ((key === 'rally' || key === 'heroWound') && r === 'hero') continue outer;
        if (key === 'move' && aiKeyT === 'jpn') continue outer;
        state.aiActedThisTurn = true;
        continue outer;
      }
      break;
    }
  }

  // ===== 捨て札（§4.3）: 1) 足止めの地形を置けるだけ置く 2) 狙撃できれば狙撃 3) 残りで手札の整理 =====
  while (aiRemainingDiscard() > 0 && await aiTryPlaceBadTerrain()) { /* 置ける限り続ける */ }
  while (aiRemainingDiscard() > 0 && await aiTrySnipe()) { state.aiSnipedThisTurn = true; }

  // 捨て札（国籍ルール: ドイツ=常に1枚、米/ソ/日/英=未行動時のみ）
  if (state.aiHand.length > 0) {
    const aiKey = getFactionKey(state.ai);
    const SH = window.SCENARIO_HELPERS;
    // §45.12 日本軍: 非機能(cower)カードは制限なく捨て札可能
    if (aiKey === 'jpn' && SH && SH.isCardDisabledAsTerrain) {
      const cowerCards = [];
      for (let i = state.aiHand.length - 1; i >= 0; i--) {
        const c = state.aiHand[i];
        if (c && SH.isCardDisabledAsTerrain(state.scenario, c, state.aiRole === 'attacker')) {
          state.aiHand.splice(i, 1);
          pushTerrainToDiscard(c);
          cowerCards.push(c);
        }
      }
      if (cowerCards.length > 0) {
        state.aiHandCount = state.aiHand.length;
        renderHands();
        await showAIAction('AI: cower 捨て札 ' + cowerCards.length + '枚', cowerCards);
      }
    }
    const DISCARD_LIMITS = {
      ger: { withAction: 1, withoutAction: 1 },
      us:  { withAction: 0, withoutAction: 2 },
      rus: { withAction: 0, withoutAction: Infinity },
      jpn: { withAction: 0, withoutAction: 2 },
      uk:  { withAction: 0, withoutAction: 2 },
    };
    const limits = DISCARD_LIMITS[aiKey] || { withAction: 0, withoutAction: 1 };
    // §7.3 相手への地形配置で使った分を差し引く
    const max = Math.max(0, (state.aiActedThisTurn ? limits.withAction : limits.withoutAction) - (state.aiDiscardedThisTurn || 0));
    if (max > 0 && state.aiHand.length > 0) {
      const count = Math.min(state.aiHand.length, max === Infinity ? state.aiHand.length : max);
      const pickDiscard = aiDiscardChooser(); // 捨てるカードの選び方（aiDiscardChooser）
      const dumpedCards = [];
      for (let i = 0; i < count; i++) {
        const dumpIdx = pickDiscard().idx;
        const dumped = state.aiHand.splice(dumpIdx, 1)[0];
        if (dumped) { pushTerrainToDiscard(dumped); dumpedCards.push(dumped); state.aiDumpedThisTurn = true; }
      }
      state.aiHandCount = state.aiHand.length;
      renderHands();
      await showAIAction('AI: 捨て札 ' + count + '枚', dumpedCards);
    }
  }
  endAITurn();
}

function aiIsGroupMoving(g) {
  if (!g.terrain || g.terrain.length === 0) return false;
  const last = g.terrain[g.terrain.length - 1];
  return !!(last && last.terrain && last.terrain.type === 'MOVEMENT');
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
  if (tgt.flaredUntilTurn && tgt.flaredUntilTurn >= (state.turnCount || 0)) return true;
  return false;
}

/** AI の捨て札で次に捨てるカードを選ぶ関数を作る（手札・盤面の状態はこの時点のもので計算する）。
 *  戻り値の関数 pick() は { idx, junk }。junk=true は「捨てたいカード」（非機能・狙撃・使えない射撃・距離5の後の移動・
 *  ピン状態の兵がいない時の回復・今の状態（撃てる／まだ撃てない）で残さないカード）、false は残したいカードしかない時 */
function aiDiscardChooser() {
  const aiKey = getFactionKey(state.ai);
  const SH = window.SCENARIO_HELPERS;
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
  // RALLY: ピン兵士が居なければ使えない
  const hasPinned = state.groups.ai.some(g => g.cards.some(c => R_d && R_d.isPinned && R_d.isPinned(c) && R_d.isAlive(c)));
  // RALLY 値を取得 (低い順に捨てる用)
  const getRallyVal = (c) => {
    const t = c && c.terrain && c.terrain.type;
    if (!t || t.indexOf('RALLY') !== 0) return Infinity;
    if (t === 'RALLY ALL') return 99;
    const n = parseInt(t.replace('RALLY ', ''), 10);
    return isNaN(n) ? Infinity : n;
  };
  const findLowestRally = () => {
    if (hasPinned) return -1;
    let bestIdx = -1, bestVal = Infinity;
    state.aiHand.forEach((c, i) => {
      const v = getRallyVal(c);
      if (v !== Infinity && v < bestVal) { bestVal = v; bestIdx = i; }
    });
    return bestIdx;
  };
  // CONCEALED: 隠蔽値 (modifier) の低い順
  const getConcealVal = (c) => {
    const t = c && c.terrain;
    if (!t || t.type !== 'CONCEALED') return Infinity;
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
  const isCower = (c) => SH && SH.isCardDisabledAsTerrain && SH.isCardDisabledAsTerrain(state.scenario, c, state.aiRole === 'attacker');
  // 「撃てる状態」か: 手札の射撃カードのどれかを、今の距離で使えるか（機関銃の有無などは火力の計算に入っている）。
  //   射撃カードが手札にない時は、山札の射撃カードの必要な火力の中央の値に、今の最大の火力が届くかで決める
  const isFire = c => !!(c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0);
  const isConceal = c => !!(c && c.terrain && c.terrain.type === 'CONCEALED');
  const isMove = c => !!(c && c.terrain && c.terrain.type === 'MOVEMENT');
  const isTerrainCard = c => !!(c && c.terrain && (goodTerrainTypes.indexOf(c.terrain.type) >= 0 || isAllyBadTerrain(c)));
  const canFireNow = (() => {
    const fires = state.aiHand.filter(isFire);
    if (fires.length) return fires.some(c => !isUselessFire(c));
    const needs = (typeof TERRAIN_CARDS !== 'undefined' ? TERRAIN_CARDS : [])
      .filter(t => String(t.type).indexOf('FIRE') === 0)
      .map(t => { const m = (t.sub || '').match(/FP(.)/); return circledToNum((m && m[1]) || ''); })
      .filter(n => n > 0).sort((x, y) => x - y);
    const median = needs.length ? needs[Math.floor(needs.length / 2)] : 3;
    return maxPossibleFP >= median;
  })();
  // 鉄条網・地雷原・未渡河の河川にいるグループがあれば、移動カードは要る
  const needMoveCards = !!R_d && state.groups.ai.some(g => g && !g.eliminated && g.cards.some(c => R_d.isAlive(c))
    && (R_d.hasTerrainType(g, 'WIRE') || R_d.hasTerrainType(g, 'MINEFIELD') || (R_d.isInStream(g) && !R_d.hasCrossedStream(g))));
  // 残すカード: 撃てる状態=射撃・隠蔽、まだ撃てない状態=移動・地形
  const _hold = state.groups.ai.some(g => g && g._role === 'hold');
  const keep = c => isHero(c) || (_hold && isConceal(c)) || (canFireNow ? (isFire(c) || isConceal(c)) : (isMove(c) || isTerrainCard(c)));
  return function pick() {
    let dumpIdx = -1;
    // 優先0: 非機能 (cower) カード
    dumpIdx = state.aiHand.findIndex(isCower);
    // 優先0.5: 狙撃カード（結果のばらつきが大きいので早めに捨てる）
    if (dumpIdx < 0) dumpIdx = state.aiHand.findIndex(isSniper);
    // 優先1: 使えない火力の射撃カード（必要な火力を、どのグループでも出せない）
    if (dumpIdx < 0) dumpIdx = state.aiHand.findIndex(isUselessFire);
    // 優先1.5: 全グループが相対距離5に着いた後の移動カード（鉄条網・地雷原・未渡河の河川にいるグループがあれば残す）
    if (dumpIdx < 0 && allAtRange5) dumpIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
    // 優先2: ピンが居ない時の RALLY (回復能力低い順)
    if (dumpIdx < 0) dumpIdx = findLowestRally();
    if (canFireNow) {
      // 撃てる状態: 射撃・隠蔽を残し、移動（要らなければ）・地形から捨てる
      if (dumpIdx < 0 && !needMoveCards) dumpIdx = state.aiHand.findIndex(isMove);
      if (dumpIdx < 0) dumpIdx = state.aiHand.findIndex(isAllyBadTerrain);
      if (dumpIdx < 0) dumpIdx = state.aiHand.findIndex(c => c && c.terrain && goodTerrainTypes.indexOf(c.terrain.type) >= 0);
    } else {
      // まだ撃てない状態: 移動・地形を残し、隠蔽（隠蔽値低い順）から捨てる（守備の時は隠蔽を残す）
      if (dumpIdx < 0 && !_hold) dumpIdx = findLowestConceal();
      if (dumpIdx < 0) dumpIdx = state.aiHand.findIndex(isAllyBadTerrain);
      // 移動中グループがあるなら、有利地形・移動・英雄以外
      if (dumpIdx < 0 && hasMovingGroup) dumpIdx = state.aiHand.findIndex(c => !keep(c));
    }
    // 既定: 残すカード（と英雄）以外を先頭から
    if (dumpIdx < 0) dumpIdx = state.aiHand.findIndex(c => !keep(c));
    if (dumpIdx >= 0) return { idx: dumpIdx, junk: true };
    // 次: 英雄以外を先頭から
    if (dumpIdx < 0) dumpIdx = state.aiHand.findIndex(c => !isHero(c));
    // 最後: 英雄カードしか残っていない時だけ
    if (dumpIdx < 0) dumpIdx = 0;
    return { idx: dumpIdx, junk: false };
  };
}
async function aiTryTrench() {
  // 塹壕はアクション: ドイツ以外は、アクションをしたターンには捨て札ができず、手札が入れ替わらない。
  //   捨てたいカードがある時は塹壕を掘らずに、そのターンは捨て札をして手札を入れ替える
  if (getFactionKey(state.ai) !== 'ger' && state.aiHand.length > 0 && aiDiscardChooser()().junk) return false;
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  const allowed = ['PLAIN','WOODS','HILL','BRUSH'];
  for (let si = 0; si < state.groups.ai.length; si++) {
    if (acted.has(si) || fired.has(si)) continue;
    const src = state.groups.ai[si];
    if (!src || src.eliminated) continue;
    if (src.cards.some(c => R.isPinned(c))) continue;
    // 既に塹壕がある場合はスキップ
    if ((src.terrain || []).some(c => c && c._isTrench)) continue;
    // 煙幕・鉄条網を無視した最上地形を判定
    let _baseTopAi = null;
    for (let i = (src.terrain || []).length - 1; i >= 0; i--) {
      const t = src.terrain[i];
      if (t && t.terrain && (t.terrain.type === 'SMOKE' || t.terrain.type === 'WIRE')) continue;
      _baseTopAi = t; break;
    }
    const topType = _baseTopAi && _baseTopAi.terrain ? _baseTopAi.terrain.type : null;
    if (!topType || allowed.indexOf(topType) < 0) continue;
    // 判定
    const judge = drawTerrainCard();
    if (!judge) return false;
    const rncVal = parseInt(judge.terrain.range, 10) || 0;
    showJudgeCard(judge);
    pushTerrainToDiscard(judge);
    if (rncVal === 0) {
      const trenchCard = {
        terrain: { type: 'TRENCH', modifier: '/-1', range: '0', rncColor: '黒', dice: {} },
        _isTrench: true
      };
      pushTerrainWithFaction(src, trenchCard);
      await showAIAction(`AI: 塹壕構築成功 → GROUP ${src.name}`, null, si);
    } else {
      await showAIAction(`AI: 塹壕構築失敗 (RNC=${rncVal}) → GROUP ${src.name}`, null, si);
    }
    acted.add(si);
    renderField('ai');
    return true;
  }
  return false;
}

// ===== §38 夜間の観測 =====
/** 照明弾に照らされているか */
function isGroupFlared(g) {
  return !!(g && g.flaredUntilTurn && g.flaredUntilTurn >= (state.turnCount || 0));
}
/** §38.3 射撃の記録（観測の修正用）: 撃ったグループと、撃たれたグループのターン番号を残す */
function markFiredAt(srcGrp, tgtGrp) {
  const t = state.turnCount || 0;
  if (srcGrp) srcGrp._firedTurn = t;
  if (tgtGrp) tgtGrp._firedUponTurn = t;
}
/** §38.3 観測の判定値: 現在の相対射程 + 修正。
 *  1) 目標の移動カード1枚ごと +1  3) このターンにすでに射撃を受けた +1  4) 直前の自分のターンに射撃した +1
 *  （2 AFV は未対応）。戻り値 { rr, mods, lines } */
function observationRange(srcGrp, tgtGrp) {
  const R = window.INFANTRY_RULES;
  // 現在の相対射程: 射撃と同じく、隣のさらに横（位置が2つ以上ずれ）の相手は −1（0未満にはしない）
  const _idxOf = g => { for (const sd of ['player', 'ai']) { const i = (state.groups[sd] || []).indexOf(g); if (i >= 0) return i; } return -1; };
  const _si = _idxOf(srcGrp), _ti = _idxOf(tgtGrp);
  const _baseRR = R.relativeRange(srcGrp.distance, tgtGrp.distance);
  const rr = (_si >= 0 && _ti >= 0 && Math.abs(_si - _ti) > 1) ? Math.max(0, _baseRR - 1) : _baseRR;
  const t = state.turnCount || 0;
  const lines = [];
  let mods = 0;
  const moveCount = (tgtGrp.terrain || []).filter(c => c && c.terrain && c.terrain.type === 'MOVEMENT').length;
  if (moveCount) { mods += moveCount; lines.push(`移動カード ${moveCount}枚 +${moveCount}`); }
  if (tgtGrp._firedUponTurn === t) { mods += 1; lines.push('このターンに射撃を受けた +1'); }
  if (tgtGrp._firedTurn === t - 1) { mods += 1; lines.push('直前のターンに射撃した +1'); }
  return { rr: rr, mods: mods, total: rr + mods, lines: lines };
}
/** §38.3 RNC が観測に成功するか。相対射程0は「1」を引かなければならない */
function observationSuccess(rnc, total) {
  return total <= 0 ? rnc === 1 : rnc < total;
}
/** §38.2 ガリーにいるグループの観測: 相対射程5・迫撃砲のため・丘にいる目標のときだけ */
function gullyObservationAllowed(srcGrp, tgtGrp, facKey) {
  const R = window.INFANTRY_RULES;
  const M = window.MORTAR_RULES;
  if (!(R.isInGully && R.isInGully(srcGrp))) return true;
  const isDist5 = R.relativeRange(srcGrp.distance, tgtGrp.distance) >= 5;
  const hasMortar = !!(M && M.getMortarShooters && M.getMortarShooters(srcGrp, facKey).length > 0);
  const tgtOnHill = !!(M && M.isOnHill && M.isOnHill(tgtGrp));
  return isDist5 || hasMortar || tgtOnHill;
}
/** §38.51 照明弾で照らす: 目標、目標から相対射程5の敵（照明弾を置いた側）のグループ、目標と同じ射程チットの隣の味方 */
function applyStarshell(flareSide, tgtIdx) {
  const R = window.INFANTRY_RULES;
  const tSide = flareSide === 'player' ? 'ai' : 'player';
  const tgt = state.groups[tSide][tgtIdx];
  // §38.5 照明弾1のチットは照らされた側のターンの終わりに裏返し、照らされた側の次のターンの後に取り除く
  const until = (state.turnCount || 0) + 3;
  tgt.flaredUntilTurn = until;
  (state.groups[flareSide] || []).forEach(g => {
    if (!g || g.eliminated) return;
    if (R.relativeRange(tgt.distance, g.distance) === 5) g.flaredUntilTurn = until;
  });
  (state.groups[tSide] || []).forEach((g, gi) => {
    if (!g || g.eliminated || gi === tgtIdx) return;
    if (Math.abs(gi - tgtIdx) === 1 && g.distance === tgt.distance) g.flaredUntilTurn = until;
  });
}

/** §38.7 グループが後退（Retrograde）で移動中か（最上の移動カードが後退。煙幕・鉄条網は飛ばす） */
function isRetrograding(g) {
  const t = (g && g.terrain) || [];
  for (let i = t.length - 1; i >= 0; i--) {
    const ty = t[i] && t[i].terrain && t[i].terrain.type;
    if (ty === 'SMOKE' || ty === 'WIRE') continue;
    return ty === 'MOVEMENT' && t[i]._moveMode === 'retreat';
  }
  return false;
}
/** §38.7 夜間、後退中の相手グループに狙撃・地形カードの配置（地雷原を含む）をするには、
 *  そのグループを観測している（自分の側のどれかのグループが観測に成功している）か、照明弾に照らされている必要がある */
function retrogradeObservationOk(actSide, tgtGrp, tgtIdx) {
  if (!state.isNight || !isRetrograding(tgtGrp) || isGroupFlared(tgtGrp)) return true;
  return (state.groups[actSide] || []).some(g => g && !g.eliminated && (g.recognizedTargets || []).indexOf(tgtIdx) >= 0);
}

async function aiTryFlare() {
  if (!state.isNight) return false;
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const acted = state.aiActedGroups || new Set();
  const aiKey = getFactionKey(state.ai);
  // 手札に FIRE カードが 2 枚以上
  const fireCards = state.aiHand.filter(c => c && c.terrain && c.terrain.type && c.terrain.type.indexOf('FIRE') === 0);
  if (fireCards.length < 2) return false;
  // B グループ (idx=1) が認知済み敵に通常射撃可能か
  const B = state.groups.ai[1];
  if (!B || B.eliminated) return false;
  const Brec = B.recognizedTargets || [];
  let bCanFire = false;
  for (const tiB of Brec) {
    const tgtB = state.groups.player[tiB];
    if (!tgtB || tgtB.eliminated) continue;
    const adjB = Math.abs(1 - tiB) <= 1;
    const baseDB = R.relativeRange(B.distance, tgtB.distance);
    const distB = adjB ? baseDB : Math.max(0, baseDB - 1);
    const crewMapB = buildCrewMapFromPairs(B);
    const fpB = R.calcGroupFirepower(B, aiKey, distB, { moving: false, crewMap: crewMapB });
    for (const fc of fireCards) {
      const m = (fc.terrain.sub || '').match(/FP(.)/);
      const need = circledToNum((m && m[1]) || '');
      if (need > 0 && fpB >= need) { bCanFire = true; break; }
    }
    if (bCanFire) break;
  }
  if (!bCanFire) return false;
  for (let si = 0; si < state.groups.ai.length; si++) {
    if (acted.has(si)) continue;
    if (state.aiFiredGroups && state.aiFiredGroups.has(si)) continue; // §38.5 唯一の行動
    const src = state.groups.ai[si];
    if (!src || src.eliminated) continue;
    // ピンでないSLがいるか
    const hasUnpinnedSL = src.cards.some(c => {
      if (!R.isAlive(c) || R.isPinned(c)) return false;
      const def = R.lookupSoldier(c, aiKey);
      return def && def.leader === '分隊長';
    });
    if (!hasUnpinnedSL) continue;
    const recognizedList = src.recognizedTargets || [];
    for (const ti of recognizedList) {
      const tgt = state.groups.player[ti];
      if (!tgt || tgt.eliminated) continue;
      const dist = R.relativeRange(src.distance, tgt.distance);
      if (dist < 1 || dist > 5) continue;
      if (isGroupFlared(tgt)) continue;
      await showAIAction(`AI: 照明弾 → GROUP ${tgt.name}`, null, si);
      applyStarshell('ai', ti); // §38.51
      acted.add(si);
      renderField('player'); renderField('ai');
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

async function aiTryScout() {
  if (!state.isNight) return false;
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  // 手札に「打てる」FIRE カードがある場合のみ索敵
  const _fireCardsScout = state.aiHand.filter(c => c && c.terrain && c.terrain.type && c.terrain.type.indexOf('FIRE') === 0);
  if (_fireCardsScout.length === 0) return false;
  const _aiKeyScout = getFactionKey(state.ai);
  let _canFireAny = false;
  for (let _si = 0; _si < state.groups.ai.length && !_canFireAny; _si++) {
    const _src = state.groups.ai[_si];
    if (!_src || _src.eliminated) continue;
    for (let _ti = 0; _ti < state.groups.player.length && !_canFireAny; _ti++) {
      const _tgt = state.groups.player[_ti];
      if (!_tgt || _tgt.eliminated) continue;
      if (!_tgt.cards.some(c => R.isAlive(c))) continue;
      const _adj = Math.abs(_si - _ti) <= 1;
      const _bd = R.relativeRange(_src.distance, _tgt.distance);
      const _d = _adj ? _bd : Math.max(0, _bd - 1);
      const _cm = buildCrewMapFromPairs(_src);
      const _fp = R.calcGroupFirepower(_src, _aiKeyScout, _d, { moving: false, crewMap: _cm });
      for (const _fc of _fireCardsScout) {
        const _m = (_fc.terrain.sub || '').match(/FP(.)/);
        const _need = circledToNum((_m && _m[1]) || '');
        if (_need > 0 && _fp >= _need) { _canFireAny = true; break; }
      }
    }
  }
  if (!_canFireAny) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  const aiKey = getFactionKey(state.ai);
  // 候補を集めて、最も近い敵を選ぶ
  let bestSi = -1, bestTi = -1, bestDist = Infinity, bestThreshold = 0;
  for (let si = 0; si < state.groups.ai.length; si++) {
    if (acted.has(si) || fired.has(si)) continue;
    const src = state.groups.ai[si];
    if (!src || src.eliminated) continue;
    if (src.cards.some(c => R.isPinned(c))) continue;
    if (src._observeTriedTurn === (state.turnCount || 0)) continue; // §38.2 1ターンに敵グループ1つだけ
    for (let ti = 0; ti < state.groups.player.length; ti++) {
      const tgt = state.groups.player[ti];
      if (!tgt || tgt.eliminated) continue;
      if (!tgt.cards.some(c => R.isAlive(c))) continue;
      if (src.recognizedTargets && src.recognizedTargets.indexOf(ti) >= 0) continue;
      if (tgt.flaredUntilTurn && tgt.flaredUntilTurn >= (state.turnCount || 0)) continue;
      const dist = R.relativeRange(src.distance, tgt.distance);
      if (!gullyObservationAllowed(src, tgt, aiKey)) continue; // §38.2
      const threshold = observationRange(src, tgt).total; // §38.3
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
  const judge = drawTerrainCard();
  if (!judge) return false;
  src._observeTriedTurn = state.turnCount || 0;
  const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
  const success = observationSuccess(rncAbs, bestThreshold);
  showJudgeCard(judge);
  pushTerrainToDiscard(judge);
  if (success) {
    if (!src.recognizedTargets) src.recognizedTargets = [];
    if (src.recognizedTargets.indexOf(bestTi) < 0) src.recognizedTargets.push(bestTi);
    await showAIAction(`AI: 索敵成功 → GROUP ${tgt.name}`, null, bestSi);
  } else {
    await showAIAction(`AI: 索敵失敗 → GROUP ${tgt.name}`, null, bestSi);
    acted.add(bestSi);
  }
  renderField('player'); renderField('ai');
  return true;
}

async function aiTryMortar() {
  const R = window.INFANTRY_RULES;
  const M = window.MORTAR_RULES;
  if (!R || !M) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  const aiKey = getFactionKey(state.ai);
  const playerKey = getFactionKey(state.player);
  const fireIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type && c.terrain.type.indexOf('FIRE') === 0);
  if (fireIdx < 0) return false;

  for (let si = 0; si < state.groups.ai.length; si++) {
    if (acted.has(si) || fired.has(si)) continue;
    const src = state.groups.ai[si];
    if (!src || src.eliminated) continue;
    if (src.cards.some(c => R.isPinned(c))) continue;
    if (M.isMoving(src)) continue; // §12.12 移動中は迫撃砲を撃てない
    const shooters = M.getMortarShooters(src, aiKey);
    if (shooters.length === 0) continue;

    for (let ti = 0; ti < state.groups.player.length; ti++) {
      const tgt = state.groups.player[ti];
      if (!tgt || tgt.eliminated) continue;
      if (!tgt.cards.some(c => R.isAlive(c))) continue;
      if (!aiCanTargetRecognized(si, ti)) continue; // 夜間: 未認知は射撃不可

      const adjacent = Math.abs(si - ti) <= 1;
      const baseDistance = R.relativeRange(src.distance, tgt.distance);
      const distance = adjacent ? baseDistance : Math.max(0, baseDistance - 1);

      const shooter = shooters[0];
      updateAcquisitions();
      const acquired = isAcquiredBy(src, ti, shooter.card);
      const fireCheck = M.canFire(src, tgt, { acquired: acquired });
      if (!fireCheck.ok) continue;

      const baseInfo = M.calcHitCeiling(shooter, distance, src, {});
      if (baseInfo.na) continue;

      await showAIAction(`AI: 迫撃砲射撃 → GROUP ${tgt.name}`, null, si);

      const fireCard = state.aiHand[fireIdx];
      state.aiHand.splice(fireIdx, 1);
      pushTerrainToDiscard(fireCard);

      // §9.1 プレイヤーも迫撃砲の命中頻度を隠ぺいカードで下げられる（1枚で1ランク、§9.5 トーチカは不可）
      setIncomingAttack({ si, ti, cards: [fireCard],
        title: `敵の GROUP ${src.name} が迫撃砲で あなたの GROUP ${tgt.name} を撃ちます`,
        lines: [`距離 ${distance}`, '隠蔽カード1枚で命中の数字が1ランク下がります']});
      await askPlayerHeroRally(tgt); // §10.4 解決前にヒーローで回復
      const _pConceal = canUseConcealment(tgt) ? await askPlayerConcealment() : [];
      clearIncomingAttack();
      const conceals = _pConceal.length;
      const pinpoint = acquired;
      const smokePenalty = fireCheck.smokePenalty;
      const targetSmoke = M.hasSmoke(tgt); // §27.12
      const night = state.isNight && !isGroupFlared(tgt); // §38.4/§38.52

      // §8.9 撃つ側の壁による命中ランク修正は無し（壁は撃たれる側の火力 -1）
      const hitInfo = M.calcHitCeiling(shooter, distance, src, {
        conceals, pinpoint, smokePenalty, targetSmoke, night,
        guard: !!(shooter.card.prisoners && shooter.card.prisoners.length), // §32.21
        wounded: R.isWoundActive(shooter.card) // §33.2
      });
      const ceiling = hitInfo.ceiling;

      const judge = drawTerrainCard();
      if (!judge) {
        state.aiHandCount = state.aiHand.length;
        return false;
      }
      const rnc = M.readRNC(judge);
      const moving = M.isMoving(src) || M.isMoving(tgt);
      let isHit = (rnc.num <= ceiling);
      if (moving && rnc.isRed) isHit = false;

      showJudgeCard(judge);
      const mortarBaseFP = M.getMortarFP(shooter.def, distance, aiKey);
      checkMortarMalfunction(judge, src, shooter); // §19.5 迫撃砲は命中判定のRNCで迫撃砲だけが故障の対象
      checkBreezeRemoveSmoke(judge);
      pushTerrainToDiscard(judge);

      // §27.1 捕捉（命中・外れに関係なく。別グループを撃ったら前の捕捉は失う）
      applyMortarAcquisition('ai', si, ti, shooter.card);
      markFiredAt(src, tgt); // §38.3 観測の修正用

      if (isHit) {
        // §8.9 障壁にいる防御グループへの迫撃砲は火力 -1（包囲下は除く）
        const finalFP = Math.max(0, M.getMortarFP(shooter.def, distance, aiKey) - (M.isOnWall(tgt) && !tgt.encircled ? 1 : 0));
        const malfuncMod = 0;
        const _targets = attackTargetsOf(tgt); // §17.8 移送中の兵士も目標
        for (let i = 0; i < _targets.length; i++) {
          const card = _targets[i];
          if (!R.isAlive(card)) continue;
          const dj = drawTerrainCard();
          if (!dj) continue;
          const drnc = M.readRNC(dj);
          const drncSigned = drnc.isRed ? -drnc.num : drnc.num;
          const rpc0r = parseInt((dj.terrain && dj.terrain.dice && dj.terrain.dice['0r']) || '0', 10) || 0;
          const def = R.lookupSoldier(card, playerKey);
          const wasPinned = R.isPinned(card);
          const commissarMod = (typeof hasCommissar === 'function' && hasCommissar(tgt)) ? 1 : 0;
          const encircleMod = (tgt && tgt.encircled && wasPinned) ? -1 : 0;
          const r = R.resolveFireOnSoldier(finalFP + malfuncMod + transitFireBonus(card), drncSigned, def, wasPinned, rpc0r, commissarMod + ((card.malfunctioned || card.destroyed) ? -1 : 0), commissarMod + encircleMod + ((card.malfunctioned || card.destroyed) ? -1 : 0), 0, R.rpc7wOf(dj)); // §19.4 故障兵器 -1
          if (r.result === 'WOUND') r.result = applyWound(card); // §33.1
          const actualResult = r.result;
          if (actualResult === 'KIA' || actualResult === 'PANIC_KIA') R.killSoldier(card);
          else if (actualResult === 'PANIC_ROUT') R.routSoldier(card);
          else if (actualResult === 'PIN') R.pinSoldier(card);
          if (actualResult !== 'NONE' && def && def.leader === '分隊長') {
            if (typeof applySLDamagePenalty === 'function') applySLDamagePenalty('player');
          }
          showJudgeCard(dj);
          checkBreezeRemoveSmoke(dj);
          pushTerrainToDiscard(dj);
        }
        cleanupEliminatedGroups();
      }

      acted.add(si);
      fired.add(si);
      state.aiHandCount = state.aiHand.length;
      renderField('player'); renderField('ai');
      renderHands();
      updateDeckCounts();
      return true;
    }
  }
  return false;
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
    if (!R.isAlive(c) || R.isPinned(c) || c.malfunctioned || c.destroyed || c._noFire) return false;
    const d = R.lookupSoldier(c, factionKey);
    return d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0;
  });
  if (ft.length === 0) return false;
  const tmp = { cards: ft, terrain: group.terrain, crewPairs: group.crewPairs };
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
    .map(c => ({ card: c, gain: heroGainForSoldier(group, c, factionKey, distance, opts) }))
    .filter(x => x.gain > 0)
    .sort((a, b) => b.gain - a.gain);
}

// AI 用: ヒーローで増やせる最大のグループ火力 (HERO ボーナス計算)
function aiCalcGroupMaxFP(group, factionKey, distance) {
  const crewMap = group.crewPairs ? buildCrewMapFromPairs(group) : {};
  const top = group.terrain && group.terrain.length > 0 ? group.terrain[group.terrain.length - 1] : null;
  const moving = !!(top && top.terrain && top.terrain.type === 'MOVEMENT');
  const cands = heroCandidates(group, factionKey, distance, { moving, crewMap });
  return cands.length ? cands[0].gain : 0;
}

async function aiFireAt(targetIdxList) {
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
    const need = fc.need;
    const card = state.aiHand[fi];
    for (let si = 0; si < state.groups.ai.length; si++) {
      // §6.6 1グループは1ターンに1回しか射撃できない
      if (acted.has(si) || fired.has(si)) continue;
      const src = state.groups.ai[si];
      if (R.isInGully(src)) continue;
      for (const ti of targetIdxList) {
        const tgt = state.groups.player[ti];
        if (!tgt) continue;
        if (tgt.cards.every(c => !R.isAlive(c))) continue;
        if (!aiCanTargetRecognized(si, ti)) continue; // 夜間: 未認知は射撃不可
        const adjacent = Math.abs(si - ti) <= 1;
        const baseDist = R.relativeRange(src.distance, tgt.distance);
        const dist = adjacent ? baseDist : Math.max(0, baseDist - 1);
        if (R.isInGully(tgt) && !R.canFireAtGully(src, dist, {})) continue;
        const _pbRelAI = pillboxRelation('ai', si, ti); // §23.7
        if (_pbRelAI === 'blocked') continue;
        const crewMap = buildCrewMapFromPairs(src);
        const srcTop = src.terrain && src.terrain.length > 0 ? src.terrain[src.terrain.length - 1] : null;
        const srcMoving = !!(srcTop && srcTop.terrain && srcTop.terrain.type === 'MOVEMENT');
        let fp = R.calcGroupFirepower(src, aiKey, dist, { moving: srcMoving, crewMap });
        if (window.CC_ACTION) fp += window.CC_ACTION.calcInfiltrationFPBonus(src, 'player', ti, aiKey, dist);
        if (aiKey === 'uk') fp += 1;
        // §17.4 側面射撃: 兵士火力を2倍（カード使用判定用）
        // §17.3 通常側面射撃・§17.612 包囲下も含む。火炎放射器は倍にしない
        const isFlankPre = !tgt.eliminated && isFlankFire('ai', si, ti);
        if (isFlankPre) fp = flankDoubledFP(src, aiKey, dist, fp, { moving: srcMoving, crewMap });
        if (fp <= 0) continue;
        const heroBonus = heroIdx >= 0 ? aiCalcGroupMaxFP(src, aiKey, dist) : 0;
        const rawBase = parseInt(card.terrain.type.replace('FIRE ', ''), 10) || 0;
        let adjBase = rawBase;
        const _tgtFlaredJudge = !!(tgt && tgt.flaredUntilTurn && tgt.flaredUntilTurn >= (state.turnCount || 0));
        const _effNightJudge = state.isNight && !_tgtFlaredJudge;
        // §12.1 移動中は½（端数切り捨て）。火炎放射器だけで必要火力を満たすカードは例外
        adjBase = halvedFireStrength(rawBase, srcMoving && !flameCoversNeed(src, aiKey, dist, need), _effNightJudge);
        if (_pbRelAI === 'half') adjBase = Math.floor(adjBase / 2); // §23.7
        const jpOpts = { japanBuildings: isJapanInGame() };
        const atkMod = R.calcTerrainMod(src.terrain, true, Object.assign({}, jpOpts, { otherStack: tgt.terrain }));
        const _isFlankFromAdjacent = si !== ti;
        const defMod = R.calcTerrainMod(tgt.terrain, false, Object.assign({}, jpOpts, { isFlank: _isFlankFromAdjacent, otherStack: src.terrain, encircled: !!tgt.encircled }));
        const gullyMod = 0; // calcTerrainMod が CSV から既に算出
        const marshDefMod = 0; // 同上
        const japanRuleMod = isJapanInGame() ? -1 : 0;
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
        _cands.push({ si, ti, fi, need, fp: effectiveFP, dist, card, useHero, heroIdx, heroBonus,
          _mods: baseExp - adjBase, _moving: srcMoving && !flameCoversNeed(src, aiKey, dist, need), _night: _effNightJudge, _half: _pbRelAI === 'half',
          _alive: tgt.cards.filter(c => R.isAlive(c)).length, _tgtMoving: aiIsGroupMoving(tgt), _defMod: defMod, _turned: _turnedFPAi });
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
    let needSum = c.need, rawSum = _rawOf(c.fi);
    fireCardList.filter(x => x.fi !== c.fi).map(x => ({ need: x.need, raw: _rawOf(x.fi) })).sort((a, b) => b.raw - a.raw)
      .forEach(x => { if (c._turned + needSum + x.need <= c.fp && rawSum + x.raw <= c.fp) { needSum += x.need; rawSum += x.raw; } });
    let adj = halvedFireStrength(rawSum, c._moving, c._night);
    if (c._half) adj = Math.floor(adj / 2);
    c._est = adj + c._mods;
    c._score = c._est * c._alive;
  });
  const _okFire = c => c._est >= 3 || (c._tgtMoving && c._defMod >= 0 && c._est >= 2) || (_handFullOfFire && c._est >= 1);
  best = _cands.filter(_okFire).sort((a, b) => b._score - a._score)[0] || null;
  if (!best) return false;
  // §10.45 ヒーローの火力2倍: 使うと射撃の値の合計が 2以上増えるなら使う（ピン状態の兵がいるグループでは回復に取っておく）
  if (!best.useHero && heroIdx >= 0) {
    const _hs = state.groups.ai[best.si];
    if (_hs && !_hs.cards.some(c => R.isAlive(c) && R.isPinned(c))) {
      const _turned = _hs.firedFPThisTurn || 0;
      const _raw = x => parseInt(state.aiHand[x.fi].terrain.type.replace('FIRE ', ''), 10) || 0;
      const _sumAt = cap => {
        let needSum = best.need, rawSum = _raw(best);
        fireCardList.filter(x => x.fi !== best.fi).map(x => ({ need: x.need, raw: _raw(x) })).sort((a, b) => b.raw - a.raw)
          .forEach(x => { if (_turned + needSum + x.need <= cap && rawSum + x.raw <= cap) { needSum += x.need; rawSum += x.raw; } });
        return rawSum;
      };
      const _hb = aiCalcGroupMaxFP(_hs, aiKey, best.dist);
      if (_hb > 0 && _sumAt(best.fp + _hb) - _sumAt(best.fp) >= 2) {
        best.useHero = true; best.heroIdx = heroIdx; best.heroBonus = _hb; best.fp += _hb;
      }
    }
  }
  // 追加 FIRE カード: ターン累積を考慮し (turnedFP + need合計 ≤ effective fp) かつ (射撃力合計 ≤ effective fp)
  // 射撃力降順でグリーディに加算 (火力最大化)
  const _bestSrcGroup = state.groups.ai[best.si];
  const _turnedFPBest = (_bestSrcGroup && _bestSrcGroup.firedFPThisTurn) || 0;
  const _primaryRawBase = parseInt(best.card.terrain.type.replace('FIRE ', ''), 10) || 0;
  let _curNeed = best.need;
  let _curRawSum = _primaryRawBase;
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
    if (_turnedFPBest + _curNeed + ex.need > best.fp) continue;
    if (_curRawSum + ex.rawBase > best.fp) continue;
    best.extras.push(ex);
    _usedFi.add(ex.fi);
    _curNeed += ex.need;
    _curRawSum += ex.rawBase;
  }
  best.totalNeed = _curNeed; // 累積加算用
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
 return new Promise(_aiFireResolve => {
  const R = window.INFANTRY_RULES;
  const playerKey = getFactionKey(state.player);
  const src = state.groups.ai[plan.si];
  const tgt = state.groups.player[plan.ti];
  markFiredAt(src, tgt); // §38.3 観測の修正用

  const jpOpts = { japanBuildings: isJapanInGame() };
  const _isFlankFromAdjacent = plan.si !== plan.ti;
  const _defOpts = Object.assign({}, jpOpts, { isFlank: _isFlankFromAdjacent, otherStack: src.terrain, encircled: !!tgt.encircled });
  const _atkOptsA = Object.assign({}, jpOpts, { otherStack: tgt.terrain });
  const atkBreakdown = R.getTerrainModBreakdown ? R.getTerrainModBreakdown(src.terrain, true, _atkOptsA) : [];
  const defBreakdown = R.getTerrainModBreakdown ? R.getTerrainModBreakdown(tgt.terrain, false, _defOpts) : [];
  const atkMod = R.calcTerrainMod(src.terrain, true, _atkOptsA);
  const defMod = R.calcTerrainMod(tgt.terrain, false, _defOpts);
  // 射撃力 = プライマリ + 追加 FIRE カード（合計射撃力は plan.fp 以下が保証済み）
  const _primRaw = parseInt(plan.card.terrain.type.replace('FIRE ', ''), 10) || 0;
  const _extrasRaw = (plan.extras || []).reduce((s, ex) => s + (ex.rawBase || 0), 0);
  const rawBaseStrength = _primRaw + _extrasRaw;
  // §12.1 移動射撃: 兵士火力は calcGroupFirepower 内で半減（基礎判定火力は半減しない）
  const srcTop = src.terrain && src.terrain.length > 0 ? src.terrain[src.terrain.length - 1] : null;
  // §12.1/§6.4 横移動も移動中。火炎放射器だけで必要火力を満たすカードは半減しない
  const _planNeed = plan.totalNeed != null ? plan.totalNeed : plan.need;
  const srcMoving = !!(srcTop && srcTop.terrain && srcTop.terrain.type === 'MOVEMENT')
    && !flameCoversNeed(src, getFactionKey(state.ai), plan.dist, _planNeed);
  // 移動は½（端数切り捨て）、夜間は別に½。ターゲットが照らされていれば夜間効果スキップ
  const _tgtFlaredAI = !!(tgt && tgt.flaredUntilTurn && tgt.flaredUntilTurn >= (state.turnCount || 0));
  const _effNight = state.isNight && !_tgtFlaredAI;
  let baseStrength = halvedFireStrength(rawBaseStrength, srcMoving, _effNight);
  if (pillboxRelation('ai', plan.si, plan.ti) === 'half') baseStrength = Math.floor(baseStrength / 2); // §23.7

  // §10.4 攻撃の解決前にヒーローでピン状態の兵士を回復できる → その後、隠蔽カード選択（§9.5 トーチカは不可）
  {
    const _jpMod = isJapanInGame() ? -1 : 0;
    const _total = baseStrength + atkMod + defMod + _jpMod;
    const _lines = [`攻撃の火力 ${_total}（射撃カード ${baseStrength}・攻撃側の地形 ${_sgn(atkMod)}・防御側の地形 ${_sgn(defMod)}${_jpMod ? '・日本軍 -1' : ''}）`];
    if (baseStrength !== rawBaseStrength) _lines.push(`射撃カードの火力 ${rawBaseStrength} は、移動中・夜間のため ${baseStrength}`);
    _lines.push(`距離 ${plan.dist}`);
    _lines.push('隠蔽カードを使うと、その数字だけ火力が下がります');
    setIncomingAttack({ si: plan.si, ti: plan.ti, lines: _lines,
      cards: [plan.card].concat((plan.extras || []).map(ex => ex.card)),
      title: `敵の GROUP ${src.name} が あなたの GROUP ${tgt.name} を射撃します` });
  }
  askPlayerHeroRally(tgt).then(() => canUseConcealment(tgt) ? askPlayerConcealment() : []).then(async concealCards => {
    clearIncomingAttack();
    const concealMod = getConcealMod(concealCards);
    const gullyMod = 0; // calcTerrainMod が CSV から既に算出
    const marshDefMod = 0; // 同上
    // §20.51 AI侵入兵の火力2倍は calcInfiltrationFPBonus で加算済み。コラムシフトは無し。
    const aiInfShift = 0;
    // §17.4 側面射撃: 手動設定フラグ参照。§17.612 包囲下は自動で側面射撃扱い
    // 火力倍化は兵士火力（calcGroupFirepower）側で適用済み。基礎射撃力は変えない
    const isFlankFireNow = !tgt.eliminated && isFlankFire('ai', plan.si, plan.ti);
    const japanRuleMod = isJapanInGame() ? -1 : 0;
    // HERO 使用時のボーナス
    let heroBonus = 0;
    if (plan.useHero && plan.heroIdx != null && plan.heroIdx >= 0) {
      const heroCard = state.aiHand[plan.heroIdx];
      if (heroCard && heroCard.terrain && heroCard.terrain.type === 'HERO') {
        heroBonus = aiCalcGroupMaxFP(src, getFactionKey(state.ai), plan.dist);
        // §10.45 英雄効果: ターン中、火力が一番増える兵士1名を2倍（2枚目なら3倍）
        const _crewMapAi = src.crewPairs ? buildCrewMapFromPairs(src) : {};
        const _topAi = src.terrain && src.terrain.length > 0 ? src.terrain[src.terrain.length - 1] : null;
        const _movAi = !!(_topAi && _topAi.terrain && _topAi.terrain.type === 'MOVEMENT');
        const _heroCandsAi = heroCandidates(src, getFactionKey(state.ai), plan.dist, { moving: _movAi, crewMap: _crewMapAi });
        if (_heroCandsAi.length > 0) {
          const _pickedAi = _heroCandsAi[0].card;
          _pickedAi._heroEnhanced = _pickedAi._heroEnhanced ? 2 : 1;
        }
        // HERO カードを手札から除去して捨て札へ
        state.aiHand.splice(plan.heroIdx, 1);
        pushTerrainToDiscard(heroCard);
      }
    }
    // §10.45 英雄カード：必要火力の判定にのみ加算（基礎火力は変えない）
    let baseFP = baseStrength + atkMod + defMod + concealMod + gullyMod + marshDefMod + aiInfShift + japanRuleMod;
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
    let lastJudge = null;
    let finalFP = 0;
    const _targets = attackTargetsOf(tgt); // §17.8 移送中の兵士も目標
    state._malfStopAttack = false;
    for (let ci = 0; ci < _targets.length; ci++) {
      if (state._malfStopAttack) break; // §19.11 残りの防御側の攻撃は解決しない
      const card = _targets[ci];
      if (!R.isAlive(card)) continue;
      finalFP = baseFP + malfuncMod + transitFireBonus(card); // §17.8 移送中 +2
      const judge = drawTerrainCard();
      if (!judge) continue;
      lastJudge = judge;
      const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
      const isRed = judge.terrain && judge.terrain.rncColor === '赤';
      const rnc = isRed ? -rncAbs : rncAbs;
      const rpc0r = parseInt((judge.terrain && judge.terrain.dice && judge.terrain.dice['0r']) || '0', 10) || 0;
      const def = R.lookupSoldier(card, playerKey);
      const wasPinned = R.isPinned(card);
      const commissarMod = hasCommissar(tgt) ? 1 : 0;
      const malfMoraleMod = (card.malfunctioned || card.destroyed) ? -1 : 0;
      // §17.613 包囲下のピン兵士はパニック値-1
      const encircleMod = (tgt && tgt.encircled && wasPinned) ? -1 : 0;
      // 火炎放射器を保持中の兵士は kia -1 (戦死しやすい)
      const flameKiaMod = (def && def.weaponCat && def.weaponCat.indexOf('火炎放射器') === 0 && !card.malfunctioned && !card.flameDiscarded) ? -1 : 0;
      const r = R.resolveFireOnSoldier(finalFP, rnc, def, wasPinned, rpc0r, commissarMod + malfMoraleMod, commissarMod + encircleMod + malfMoraleMod, flameKiaMod, R.rpc7wOf(judge));
      if (r.result === 'WOUND') r.result = applyWound(card); // §33.1
      // §20.9 狂暴兵チェック（プレイヤー側ソ連兵がPANIC_KIA）
      let actualResult2 = r.result;
      if (r.result === 'PANIC_KIA' && def && window.CC_ACTION) {
        const playerFacKey = getFactionKey(state.player);
        const enemyGroups = state.groups.ai || [];
        const atDist5 = enemyGroups.some(eg => R.relativeRange(tgt.distance, eg.distance) === 5);
        if (window.CC_ACTION.checkBerserkEligibility(card, def, rpc0r, playerFacKey, atDist5 ? 5 : 0)) {
          card.berserk = true;
          actualResult2 = 'BERSERK';
          // §24.7 地雷原にいる兵が狂戦士になったら排除される
          if (R.hasTerrainType(tgt, 'MINEFIELD')) { card.berserk = false; actualResult2 = 'KIA'; }
        }
      }
      if (r.result === 'PANIC_KIA' && card.berserk && actualResult2 !== 'BERSERK') {
        actualResult2 = 'PANIC_KIA';
      }
      if (actualResult2 === 'KIA' || actualResult2 === 'PANIC_KIA') R.killSoldier(card);
      else if (actualResult2 === 'PANIC_ROUT') R.routSoldier(card);
      else if (actualResult2 === 'PIN') R.pinSoldier(card);
      // §20.53 ピン/KIA/潰走 → 侵入状態解除
      if (actualResult2 !== 'NONE' && actualResult2 !== 'BERSERK' && actualResult2 !== 'WOUND' && card.infiltrating && window.CC_ACTION) {
        window.CC_ACTION.clearSoldierInfiltration(card);
      }
      if ((actualResult2 === 'KIA' || actualResult2 === 'PANIC_KIA' || actualResult2 === 'PANIC_ROUT') && def && def.leader && def.leader === '分隊長') {
        applySLDamagePenalty('player');
      }
      const morale = def ? (wasPinned ? parseInt(def.panic,10)||0 : parseInt(def.morale,10)||0) : 0;
      const kia = def ? (wasPinned ? parseInt(def.kiaBack,10)||0 : parseInt(def.kiaFront,10)||0) : 0;
      const tgtFlag = (state.player && state.player.flag) ? state.player.flag + ' ' : '';
      results.push({ name: tgtFlag + (def ? def.name : card.id), result: r.result, rnc, rncColor: isRed ? '赤' : '黒', finalFP, sum: finalFP + rnc, morale, kia, wasPinned });
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
      malfuncMod += checkMalfunction(judge, src, aiKey, plan.dist, baseFP + malfuncMod);
      checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
    }
    if (lastJudge) showJudgeCard(lastJudge);

    // プライマリ + 追加 FIRE カードを全て手札から除去し捨て札へ
    const fireCard = state.aiHand[plan.fi];
    const _extrasCards = (plan.extras || []).map(ex => ex.card);
    const _removeIdxs = [plan.fi, ...((plan.extras || []).map(ex => ex.fi))].sort((a, b) => b - a);
    _removeIdxs.forEach(i => { if (i >= 0) state.aiHand.splice(i, 1); });
    if (fireCard) pushTerrainToDiscard(fireCard);
    _extrasCards.forEach(c => { if (c) pushTerrainToDiscard(c); });
    state.aiHandCount = state.aiHand.length;
    // ターン累積 FP を加算 (このグループの今ターン射撃合計に追加)
    src.firedFPThisTurn = (src.firedFPThisTurn || 0) + (plan.totalNeed != null ? plan.totalNeed : plan.need);

    const mods = [];
    if (srcMoving && rawBaseStrength !== baseStrength) mods.push(`移動半減 -${rawBaseStrength - baseStrength}`);
    if (isFlankFireNow) mods.push('側面射撃(兵士火力×2)');
    atkBreakdown.forEach(x => {
      const label = x.type === 'MOVEMENT' ? '攻撃側移動カード' : `攻撃側 ${x.type}`;
      mods.push(`${label} ${x.mod>=0?'+':''}${x.mod}`);
    });
    defBreakdown.forEach(x => {
      const label = x.type === 'MOVEMENT' ? '防御側移動カード' : `防御側 ${x.type}`;
      mods.push(`${label} ${x.mod>=0?'+':''}${x.mod}`);
    });
    if (concealMod) mods.push(`隠蔽${concealMod>=0?'+':''}${concealMod}`);
    if (malfuncMod) mods.push(`故障${malfuncMod>=0?'+':''}${malfuncMod}`);
    if (gullyMod) mods.push(`涸れ谷${gullyMod>=0?'+':''}${gullyMod}`);
    if (marshDefMod) mods.push(`湿地防御${marshDefMod>=0?'+':''}${marshDefMod}`);
    if (aiInfShift) mods.push(`AI侵入シフト${aiInfShift>=0?'+':''}${aiInfShift}`);
    if (japanRuleMod) mods.push(`日本ルール ${japanRuleMod>=0?'+':''}${japanRuleMod}`);
    const title = `AI射撃 ${src.name}→${tgt.name} 距離${plan.dist} 基礎射撃力${rawBaseStrength}<br/>修正項目:<br/>${mods.length ? mods.join('<br/>') : 'なし'}<br/>→ 最終火力${finalFP}`;
    await showAIAction(`AI: 射撃 ${src.name}→${tgt.name}`, fireCard, plan.si);
    const _allFireCards = [fireCard, ..._extrasCards].filter(c => c);
    showFireResultOverlay(title, results, _allFireCards).then(() => {
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
  const moveIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
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

async function aiTryCrossStream() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const moveIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  if (moveIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  // 河川内で未渡河のグループを探す
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    if (!R.isInStream(g)) continue;
    if (R.hasCrossedStream(g)) continue;
    if (g.cards.some(c => R.isPinned(c))) continue;
    const card = state.aiHand[moveIdx];
    state.aiHand.splice(moveIdx, 1);
    if (R.isFordCard(card)) {
      card._moveMode = 'lateral';
      pushTerrainWithFaction(g, card);
      state.aiHandCount = state.aiHand.length;
      renderField('ai'); renderHands();
      await showAIAction('AI: 渡河成功（渡河カード）', card, gi);
    } else {
      const judge = drawTerrainCard();
      if (judge) { checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
      const isBlack = !(judge && judge.terrain && judge.terrain.rncColor === '赤');
      if (isBlack) {
        card._moveMode = 'lateral';
        pushTerrainWithFaction(g, card);
        state.aiHandCount = state.aiHand.length;
        renderField('ai'); renderHands();
        await showAIAction('AI: 渡河成功（RNC 黒）', [card, judge], gi);
      } else {
        pushTerrainToDiscard(card);
        breakFlanksOn(g); // §17.43 不成功の渡河も移動カードを使ったことになる
        state.aiHandCount = state.aiHand.length;
        renderField('ai'); renderHands();
        await showAIAction('AI: 渡河失敗（RNC 赤）', [card, judge], gi);
      }
    }
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
  const flankIdx = state.aiHand.findIndex(c =>
    c && c.terrain && c.terrain.type === 'MOVEMENT' && c.terrain.sub === '側面');
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
        if (dist > 4) continue;
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
        if (bestStr(fp * 2) <= bestStr(fp)) continue;
        const card = state.aiHand[flankIdx];
        card._moveMode = 'lateral';
        pushTerrainWithFaction(src, card);
        src.flankingTarget = ti;
        src.flankCard = card; // §17.41
        state.aiHand.splice(flankIdx, 1);
        state.aiHandCount = state.aiHand.length;
        renderField('ai'); renderHands();
        await showAIAction(`AI: 側面射撃 → GROUP ${tgt.name}`, card, si);
        acted.add(si);
        return true;
      }
    }
  }

  // §17.6 包囲: 敵隣接グループの背後にいる自グループが、移動カードを横向きに置いて包囲
  const moveIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  if (moveIdx >= 0) {
    for (let si = 0; si < state.groups.ai.length; si++) {
      if (acted.has(si) || fired.has(si)) continue;
      const src = state.groups.ai[si];
      if (hasPillbox(src)) continue; // トーチカ持ちグループは移動不可
      if (src.cards.some(c => R.isPinned(c))) continue;
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
    const mod = R.calcTerrainMod(e.terrain || [], false, { isFlank: i !== j, otherStack: g.terrain, encircled: !!e.encircled });
    if (fp + mod > best) best = fp + mod;
  });
  return { eff: best, closest };
}
/** グループに使える火炎放射器（生存・ピン状態でない・故障していない）があるか */
function aiGroupHasUsableFlame(g) {
  const R = window.INFANTRY_RULES;
  const aiKey = getFactionKey(state.ai);
  return g.cards.some(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c.malfunctioned || c.destroyed || c.flameDiscarded) return false;
    const d = R.lookupSoldier(c, aiKey);
    return !!(d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0);
  });
}

/** 火炎放射器の攻撃を優先する場面か: 使える火炎放射器を持つグループが、相対距離5の敵を手札の射撃カードで撃てる時。
 *  この時は侵入・白兵戦より射撃（火炎放射器の火力 12）を選ぶ（白兵戦よりはるかに安全で効果的） */
function aiFlameShouldFire(g, gi) {
  const R = window.INFANTRY_RULES;
  if (!g || !aiGroupHasUsableFlame(g)) return false;
  const aiKey = getFactionKey(state.ai);
  const needs = state.aiHand.filter(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0)
    .map(c => { const m = (c.terrain.sub || '').match(/FP(.)/); return circledToNum((m && m[1]) || ''); }).filter(n => n > 0);
  if (!needs.length) return false;
  const top = g.terrain && g.terrain.length ? g.terrain[g.terrain.length - 1] : null;
  const moving = !!(top && top.terrain && top.terrain.type === 'MOVEMENT');
  return (state.groups.player || []).some((e, j) => {
    if (!e || e.eliminated || !e.cards.some(c => R.isAlive(c)) || !aiCanTargetRecognized(gi, j)) return false;
    const base = R.relativeRange(g.distance, e.distance);
    const rr = Math.abs(gi - j) > 1 ? Math.max(0, base - 1) : base;
    if (rr !== 5) return false;
    const fp = R.calcGroupFirepower(g, aiKey, rr, { moving, crewMap: buildCrewMapFromPairs(g) });
    return needs.some(n => n <= fp);
  });
}

/** AI の性格で、このグループが前進したいか（3未満は必ず、防御的=3以上で止まる、バランス=6未満、攻撃的=相対距離5まで）。
 *  作戦の役割: 火力のグループは撃てる所（3以上）で止まる。機動・突撃のグループは相対距離5まで前進する */
function aiGroupWantsAdvance(g, i) {
  const { eff, closest } = aiGroupFireNow(g, i);
  if (closest >= 5) return false;
  if (g._role === 'hold') return false; // 守備（シナリオC の防御側）: 前に出ない
  // 使える火炎放射器（相対距離5でだけ火力がある）を持つグループは、性格・役割に関係なく相対距離5まで前進する
  if (aiGroupHasUsableFlame(g)) return true;
  if (g._role === 'fire') return eff < 3;
  if (g._role === 'maneuver' || g._role === 'assault') return true;
  const style = state.aiStyle || 'bal';
  return eff < 3 || (style === 'bal' && eff < 6) || style === 'aggr';
}

async function aiTryMove() {
  const R = window.INFANTRY_RULES;
  const moveIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  if (moveIdx < 0) return false;
  // シナリオC: 手札に地形カード(防御的または煙幕/鉄条網)が無ければ移動しない
  if (state.scenario && state.scenario.id === 'C') {
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
    if (acted.has(i) || fired.has(i)) return true;
    if (g.cards.some(c => R.isPinned(c))) return true;
    // §13.34 鉄条網があるグループは移動できない（除去は aiTryRemoveWire）
    if (R.hasTerrainType && R.hasTerrainType(g, 'WIRE')) return true;
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
  // 2. 湿地/涸れ谷の1枚目: 横移動強制（移動カード0枚の場合のみ）
  if (bestIdx < 0) {
    for (let i = 0; i < state.groups.ai.length; i++) {
      if (isSkipped(i)) continue;
      const g = state.groups.ai[i];
      if (R.isInStream(g)) continue;
      const inMarshFirst = R.isInMarsh && R.isInMarsh(g) && R.marshMoveCount && R.marshMoveCount(g) === 0;
      const inGullyFirst = R.isInGully && R.isInGully(g) && R.gullyMoveCount && R.gullyMoveCount(g) === 0;
      if (inMarshFirst || inGullyFirst) {
        bestIdx = i; moveMode = 'lateral'; break;
      }
    }
  }
  // (側面射撃/包囲のための移動は #12 で処理)
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
      // 湿地/涸れ谷で移動カード0枚（=1枚目）のグループは前進不可（横移動強制）
      if (R.isInMarsh && R.isInMarsh(g) && R.marshMoveCount && R.marshMoveCount(g) === 0) continue;
      if (R.isInGully && R.isInGully(g) && R.gullyMoveCount && R.gullyMoveCount(g) === 0) continue;
      const opposing = state.groups.player[i];
      if (opposing && R.isBlocked && R.isBlocked(g, opposing)) continue;
      const { eff, closest } = fireNow(g, i);
      if (closest >= 5) continue; // 相対距離5（白兵戦の距離）より先へは進まない
      if (aiCCThreat(i, false)) continue; // 侵入されていて白兵戦が不利なら、白兵戦の距離へ戻らない（§20.55）
      if (!aiGroupWantsAdvance(g, i)) continue; // 性格と作戦の役割で決める
      const alive = g.cards.filter(c => R.isAlive(c)).length;
      if (eff < bestEff || (eff === bestEff && alive > bestSize)) { bestEff = eff; bestSize = alive; bestIdx = i; }
    }
    if (bestIdx >= 0) moveMode = 'advance';
  }
  if (bestIdx < 0) return false;
  const grp = state.groups.ai[bestIdx];
  const moveCard = state.aiHand[moveIdx];
  const inEscapeTerrain = !!(R.hasTerrainType && (R.hasTerrainType(grp, 'MARSH') || R.hasTerrainType(grp, 'GULLY')));
  if (moveMode === 'lateral') {
    moveCard._moveMode = 'lateral';
  } else {
    grp.distance += 1;
    moveCard._moveMode = 'advance';
  }
  pushTerrainWithFaction(grp, moveCard);
  state.aiHand.splice(moveIdx, 1);
  state.aiHandCount = state.aiHand.length;
  renderField('ai'); renderHands();
  await showAIAction(inEscapeTerrain ? 'AI: 横移動（脱出）' : 'AI: 移動', moveCard, bestIdx);
  acted.add(bestIdx);
  return true;
}

// 地雷原内のグループに横移動カードを置く（脱出開始）
async function aiTryMineLateral() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const moveIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  if (moveIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || fired.has(gi)) continue;
    const g = state.groups.ai[gi];
    if (!g.terrain.some(c => c && c.terrain && c.terrain.type === 'MINEFIELD')) continue;
    if (g.cards.some(c => R.isPinned(c))) continue;
    const moveCard = state.aiHand[moveIdx];
    moveCard._moveMode = 'lateral';
    pushTerrainWithFaction(g, moveCard);
    triggerMinefieldRNCCheck(g, 'ai'); // §24.4 移動カードを置いたら RNC 判定
    state.aiHand.splice(moveIdx, 1);
    state.aiHandCount = state.aiHand.length;
    renderField('ai'); renderHands();
    await showAIAction('AI: 横移動（地雷原脱出）', moveCard, gi);
    acted.add(gi);
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

async function aiTryPlaceOwnTerrain() {
  const R = window.INFANTRY_RULES;
  const SH = window.SCENARIO_HELPERS;
  const goodTerrain = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','GULLY'];
  const tIdx = state.aiHand.findIndex(c =>
    c && c.terrain && goodTerrain.indexOf(c.terrain.type) >= 0
    && !(SH && SH.isCardDisabledAsTerrain(state.scenario, c, state.aiRole === 'attacker')));
  if (tIdx < 0) return false;

  const acted = state.aiActedGroups || new Set();
  let targetGi = -1;
  // 最上が MOVEMENT のグループに地形を置く
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    if (g.terrain.length === 0) continue;
    const top = topIgnoringSmoke(g); // §13.23 移動カード上の煙幕は妨げにならない
    if (!top || !top.terrain || top.terrain.type !== 'MOVEMENT') continue;
    // §8.22/8.42/8.5 涸れ谷・湿地・河川は移動2枚必要
    if (R.canPlaceTerrainOnMarsh && !R.canPlaceTerrainOnMarsh(g)) continue;
    if (R.canPlaceTerrainOnGully && !R.canPlaceTerrainOnGully(g)) continue;
    if (R.canPlaceTerrainOnStream && !R.canPlaceTerrainOnStream(g)) continue;
    targetGi = gi; break;
  }
  if (targetGi < 0) return false;

  const grp = state.groups.ai[targetGi];
  // 下のカードを全て捨て札
  removeSmokeFromGroup(grp, 'ai', '地形カードを配置'); // §13.241
  while (grp.terrain.length > 0) {
    pushTerrainToDiscard(grp.terrain.pop());
  }
  const placedCard = state.aiHand[tIdx];
  pushTerrainWithFaction(grp, placedCard);
  state.aiHand.splice(tIdx, 1);
  state.aiHandCount = state.aiHand.length;
  renderField('ai'); renderHands();
  await showAIAction('AI: 地形配置', placedCard, targetGi);
  { const _n = releaseInfiltrationOnRetreat(grp, 'ai', 'terrain'); // §20.53 相対距離4で地形カード
    if (_n) await showAIAction(`AI: GROUP ${grp.name} が相対距離4で地形カードを置いたので、侵入兵 ${_n}名は侵入状態でなくなりました（§20.53）`, null, targetGi); }
  acted.add(targetGi);
  return true;
}

// 地形以外の手札（移動・射撃カード以外）を平地として移動中の自グループに置く（§13.5 煙幕・鉄条網は残す）
async function aiTryPlaceOwnPlain() {
  const R = window.INFANTRY_RULES;
  const pIdx = state.aiHand.findIndex(c => isPlainUseCard(c)
    && c.terrain.type !== 'MOVEMENT' && String(c.terrain.type).indexOf('FIRE') !== 0);
  if (pIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  let targetGi = -1;
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || !isMovingIgnoringOverlays(g)) continue;
    if (R.canPlaceTerrainOnMarsh && !R.canPlaceTerrainOnMarsh(g)) continue;
    if (R.canPlaceTerrainOnGully && !R.canPlaceTerrainOnGully(g)) continue;
    if (R.canPlaceTerrainOnStream && !R.canPlaceTerrainOnStream(g)) continue;
    // 地雷原: 横移動2枚が無ければ脱出できないので置かない
    if (g.terrain.some(c => c && c.terrain && c.terrain.type === 'MINEFIELD')
        && g.terrain.filter(c => c && c.terrain && c.terrain.type === 'MOVEMENT' && c._moveMode === 'lateral').length < 2) continue;
    targetGi = gi; break;
  }
  if (targetGi < 0) return false;
  const grp = state.groups.ai[targetGi];
  const card = state.aiHand[pIdx];
  state.aiHand.splice(pIdx, 1);
  state.aiHandCount = state.aiHand.length;
  const escape = processMinefieldEscape(grp, 'ai');
  if (!escape.ok) {
    pushTerrainToDiscard(card);
    renderField('ai'); renderHands();
    await showAIAction('AI: 平地配置（地雷原から脱出できず）', card, targetGi);
    acted.add(targetGi);
    return true;
  }
  placePlainOnGroup(grp, card);
  renderField('ai'); renderHands();
  await showAIAction('AI: 平地として配置', card, targetGi);
  { const _n = releaseInfiltrationOnRetreat(grp, 'ai', 'terrain'); // §20.53 相対距離4で地形カード
    if (_n) await showAIAction(`AI: GROUP ${grp.name} が相対距離4で地形カードを置いたので、侵入兵 ${_n}名は侵入状態でなくなりました（§20.53）`, null, targetGi); }
  acted.add(targetGi);
  return true;
}

// 自グループに煙幕を重ねる
async function aiTryPlaceOwnSmoke() {
  const SH = window.SCENARIO_HELPERS;
  const sIdx = state.aiHand.findIndex(c =>
    c && c.terrain && c.terrain.type === 'SMOKE'
    && !(SH && SH.isCardDisabledAsTerrain(state.scenario, c, state.aiRole === 'attacker')));
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
    const guards = g.cards.filter(c => c.prisoners && c.prisoners.length && R.isAlive(c));
    if (!guards.length) continue;
    const important = c => { const d = R.lookupSoldier(c, aiKey) || {}; return !!d.leader || !!d.needsCrew; };
    if (!guards.some(important)) continue;
    const cands = g.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !isCrewAssistant(g, c) && !important(c) && guards.indexOf(c) < 0);
    if (!cands.length) continue;
    const ccv = c => { const d = R.lookupSoldier(c, aiKey) || {}; return parseInt(String(d.ccvFront || '0'), 10) || 0; };
    const ng = cands.slice().sort((a, b) => ccv(a) - ccv(b))[0];
    const all = [];
    guards.forEach(x => { all.push(...x.prisoners); x.prisoners = []; });
    ng.prisoners = all;
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
  if (!state.aiHand.some(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0)) return false;
  const aiKey = getFactionKey(state.ai);
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (state.aiActedGroups && state.aiActedGroups.has(gi)) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated) continue;
    if (g.cards.some(c => R.isAlive(c) && R.isPinned(c))) continue; // 回復を優先
    const canFire = (state.groups.player || []).some((e, ti) => e && !e.eliminated && e.cards.some(c => R.isAlive(c)) && aiCanTargetRecognized(gi, ti));
    if (!canFire) continue;
    const w = g.cards.find(c => R.isAlive(c) && !R.isPinned(c) && R.isWoundActive(c) && _maxPrintedFP(R.lookupSoldier(c, aiKey)) >= 2);
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
  const mi = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  if (mi < 0) return false;
  const enemyNear = idx => [idx - 1, idx, idx + 1].some(j => {
    const e = (state.groups.player || [])[j];
    return e && !e.eliminated && e.cards.some(c => R.isAlive(c));
  });
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (_aiActed(gi)) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || g.forming || g.pendingShift) continue;
    if (!g.cards.some(c => R.isAlive(c))) continue;
    if (g.cards.some(c => R.isAlive(c) && R.isPinned(c))) continue;
    if (R.hasTerrainType(g, 'WIRE') || R.isInStream(g)) continue;
    if (hasPillbox(g) || g._role === 'hold') continue; // トーチカのグループ・守備のグループは動かさない（動かすとトーチカを放棄することになる）
    if (g.cards.some(c => c.infiltrating)) continue;
    if (enemyNear(gi)) continue;
    const dest = shiftDestinations('ai', gi).find(j => enemyNear(j));
    if (dest == null) continue;
    const card = state.aiHand.splice(mi, 1)[0];
    state.aiHandCount = state.aiHand.length;
    card._moveMode = 'lateral';
    pushTerrainWithFaction(g, card);
    g.pendingShift = { toIdx: dest, card, partnerIdx: null, ready: !!R.isInMarsh(g) }; // §17.7 湿地は移動カード1枚で成立
    _aiMarkActed(gi);
    renderField('ai'); renderHands();
    await showAIAction(`AI: グループ側方移送 — GROUP ${g.name} → ${GROUP_LETTERS[dest]} の位置へ（§17.7）`, card, gi);
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

/** §20.53 侵入されたグループが下がった時の侵入の終わり: 侵入兵のグループとの相対距離が 3以下になる、
 *  または相対距離 4で自分に地形カードを置くと、そのグループに入っている敵の侵入兵は侵入状態でなくなる。
 *  side = 侵入されたグループの側、reason = 'move' | 'terrain'。戻り値: 侵入状態でなくなった人数 */
function releaseInfiltrationOnRetreat(grp, side, reason) {
  const R = window.INFANTRY_RULES, CC = window.CC_ACTION;
  if (!grp || !R || !CC || !state.groups[side]) return 0;
  const idx = state.groups[side].indexOf(grp);
  if (idx < 0) return 0;
  const enemySide = side === 'player' ? 'ai' : 'player';
  let n = 0;
  (state.groups[enemySide] || []).forEach(eg => {
    if (!eg || !eg.cards) return;
    const rr = R.relativeRange(eg.distance, grp.distance);
    if (!(rr <= 3 || (reason === 'terrain' && rr === 4))) return;
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
  const moveIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  if (moveIdx < 0) return false;
  const card = state.aiHand[moveIdx];
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || fired.has(gi)) continue;
    const g = state.groups.ai[gi];
    if (!g || g.eliminated) continue;
    if (!aiCCThreat(gi, true)) continue;
    // プレイヤーの後退と同じ制限: ピン状態の兵がいる・鉄条網・地雷原・トーチカ・河川/涸れ谷/湿地の1枚目・移送中は後退しない
    if (g.cards.some(c => R.isAlive(c) && R.isPinned(c))) continue;
    if (R.hasTerrainType && (R.hasTerrainType(g, 'WIRE') || R.hasTerrainType(g, 'MINEFIELD') || R.hasTerrainType(g, 'PILLBOX'))) continue;
    if ((R.isInStream && R.isInStream(g) && R.streamMoveCount && R.streamMoveCount(g) === 0)
      || (R.isInGully && R.isInGully(g) && R.gullyMoveCount && R.gullyMoveCount(g) === 0)
      || (R.isInMarsh && R.isInMarsh(g) && R.marshMoveCount && R.marshMoveCount(g) === 0)) continue;
    if (typeof groupInTransfer === 'function' && groupInTransfer('ai', gi)) continue;
    // §5.51 一番近い敵との相対距離が 0より小さくなる後退は不可。距離チットがマイナスになるのは赤の RNC の移動カードだけ
    const newDist = g.distance - 1;
    const enemies = (state.groups.player || []).filter(e => e && !e.eliminated);
    if (enemies.length && Math.min(...enemies.map(e => newDist + (e.distance || 0))) < 0) continue;
    if (newDist < 0 && !(card.terrain && card.terrain.rncColor === '赤')) continue;
    g.distance = newDist;
    card._moveMode = 'retreat';
    pushTerrainWithFaction(g, card);
    state.aiHand.splice(moveIdx, 1);
    state.aiHandCount = state.aiHand.length;
    CC.clearInfiltration(g, 'move'); // §20.53 移動カードを使ったグループの侵入兵は侵入状態でなくなる
    renderField('ai'); renderField('player'); renderHands();
    await showAIAction(`AI: 後退 — GROUP ${g.name}（白兵戦を避ける・§20.55）`, card, gi);
    const n = releaseInfiltrationOnRetreat(g, 'ai', 'move');
    if (n) await showAIAction(`AI: GROUP ${g.name} が相対距離3まで下がったので、侵入兵 ${n}名は侵入状態でなくなりました（§20.53）`, null, gi);
    acted.add(gi);
    return true;
  }
  return false;
}

/** §20.56 AI の侵入解除: 侵入兵の CCV の平均をランク（低 4以下 / 中 5〜7 / 高 8以上）にして、
 *  AI の性格で白兵戦をするランクを決める。防御的=高のみ、バランス=中と高、攻撃的=すべて（解かない）。
 *  白兵戦をしないランクなら侵入を解く（1アクション） */
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
    for (const [, list] of byTgt) {
      // ランク（性格）と、侵入先の兵の CCV との差で、白兵戦をするか決める（aiCCRankOK と同じ基準）
      const _t = state.groups[list[0].infiltratedGroupSide] && state.groups[list[0].infiltratedGroupSide][list[0].infiltratedGroupIdx];
      const chk = aiCCRankOK(g, list, _t);
      const avg = chk.avg, rank = chk.rank;
      if (chk.ok) continue; // 白兵戦をする
      list.forEach(c => CC.clearSoldierInfiltration(c));
      _aiMarkActed(gi);
      renderField('ai'); renderField('player');
      await showAIAction(`AI: 侵入解除 — GROUP ${g.name} の侵入兵 ${list.length}名（CCV 平均 ${Math.round(avg * 10) / 10}・${RANK_NAME[rank]}・§20.56）`, null, gi);
      return true;
    }
  }
  return false;
}

async function aiTryRally() {
  const R = window.INFANTRY_RULES;
  // RALLYまたはHEROカードを探す
  const rallyIdx = state.aiHand.findIndex(c =>
    c && c.terrain && c.terrain.type && (c.terrain.type.indexOf('RALLY') === 0 || c.terrain.type === 'HERO'));
  if (rallyIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    if (acted.has(gi) || (state.aiFiredGroups && state.aiFiredGroups.has(gi))) continue;
    const g = state.groups.ai[gi];
    // 移動中（terrain 最上が MOVEMENT で lateral ではない）は回復不可
    const gTop = g.terrain && g.terrain.length > 0 ? g.terrain[g.terrain.length - 1] : null;
    const gMoving = !!(gTop && gTop.terrain && gTop.terrain.type === 'MOVEMENT' && gTop._moveMode !== 'lateral');
    if (gMoving) continue;
    const pinnedIdx = g.cards.map((c, i) => (R.isPinned(c) && R.isAlive(c)) ? i : -1).filter(i => i >= 0);
    if (pinnedIdx.length === 0) continue;
    const rallyCard = state.aiHand[rallyIdx];
    // RALLY値を取得
    let rallyVal = 0;
    if (rallyCard.terrain.type === 'RALLY ALL') {
      rallyVal = pinnedIdx.length;
    } else if (rallyCard.terrain.type === 'HERO') {
      rallyVal = 1;
    } else {
      rallyVal = parseInt(rallyCard.terrain.type.replace('RALLY ', ''), 10) || 0;
    }
    // RALLY値分だけ回復（足りれば全員）
    const count = Math.min(rallyVal, pinnedIdx.length);
    for (let k = 0; k < count; k++) {
      R.unpinSoldier(g.cards[pinnedIdx[k]]);
    }
    // §10.23 全回復: 条件がそろっていれば、もう1つのグループも一緒に全員回復（狙いはしない）
    if (rallyCard.terrain.type === 'RALLY ALL') {
      const partner = rallyAllPartnerCandidates('ai', gi)[0];
      if (partner != null) {
        state.groups.ai[partner].cards.forEach(c => { if (R.isPinned(c) && R.isAlive(c)) R.unpinSoldier(c); });
        acted.add(partner);
      }
    }
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
    let updated = false;
    grp.cards.forEach(card => {
      if (!R.isAlive(card)) return;
      const def = R.lookupSoldier(card, aiKey);
      if (!def || !def.needsCrew) return;
      // 既存アシスタントが生存・非ピンなら問題なし
      const curAssistNum = grp.crewPairs[card.num];
      if (curAssistNum != null) {
        const cur = grp.cards.find(c => c.num === curAssistNum);
        if (cur && R.isAlive(cur) && !R.isPinned(cur)) return;
      }
      // 新しいアシスタント候補を探す
      const usedNums = new Set(Object.values(grp.crewPairs));
      const candidate = grp.cards.find(c2 => {
        if (c2 === card) return false;
        if (!R.isAlive(c2) || R.isPinned(c2)) return false;
        if (usedNums.has(c2.num)) return false;
        const d2 = R.lookupSoldier(c2, aiKey);
        if (!d2) return false;
        if (d2.needsCrew) return false; // 別のクルー兵器でないこと
        if (d2.leader) return false; // リーダー以外
        return true;
      });
      if (candidate) {
        grp.crewPairs[card.num] = candidate.num;
        updated = true;
      }
    });
    if (updated) {
      renderField('ai');
      await showAIAction(`AI: クルー設定 (GROUP ${grp.name})`, null, gi);
      acted.add(gi);
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
    if (R.isInMarsh && R.isInMarsh(grp)) continue;
    if (R.isInStream && R.isInStream(grp)) continue;
    if (isMovingIgnoringOverlays(grp)) continue; // §19.3 移動中は修理できない
    // 移動中（最上がMOVEMENT）はNG
    const top = grp.terrain && grp.terrain.length > 0 ? grp.terrain[grp.terrain.length - 1] : null;
    if (top && top.terrain && top.terrain.type === 'MOVEMENT') continue;
    const broken = grp.cards.filter(c => c.malfunctioned && R.isAlive(c));
    if (broken.length === 0) continue;
    const card = broken[0];
    const def = R.lookupSoldier(card, aiKey);
    if (!def) continue;
    // §33.4 負傷兵は修理の前に黒の RNC が必要。赤ならこのターンは修理できず、行動は使う
    if (R.isWoundActive(card)) {
      const wj = drawTerrainCard();
      showJudgeCard(wj);
      if (wj) { checkBreezeRemoveSmoke(wj); pushTerrainToDiscard(wj); }
      if (!wj || (wj.terrain && wj.terrain.rncColor === '赤')) {
        await showAIAction(`AI: 負傷兵 ${def.name} は修理を試みられない（赤の RNC）`, wj, gi);
        renderField('ai');
        acted.add(gi);
        return true;
      }
    }
    const judge = drawTerrainCard();
    showJudgeCard(judge);
    if (judge) { checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
    const isBlack = !(judge && judge.terrain && judge.terrain.rncColor === '赤');
    if (isBlack) {
      card.malfunctioned = false;
      await showAIAction(`AI: 修理成功 ${def.name}`, judge, gi);
    } else {
      await showAIAction(`AI: 修理失敗 ${def.name}`, judge, gi);
    }
    renderField('ai');
    acted.add(gi);
    return true;
  }
  return false;
}

/** §14.4 AI の狙撃兵チェック: 直前のプレイヤーターンに狙撃された時、ピンでない兵士のいるグループの1アクションで行う
 *  （火力の一番低いグループを使う） */
async function aiTrySniperCheck() {
  const sniperRnc = state.playerSnipeCheckRnc;
  state.playerSnipeCheckRnc = null;
  if (sniperRnc == null || state.playerSniperDisabled) return false;
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const aiKey = getFactionKey(state.ai);
  let gi = -1, bestFP = Infinity;
  state.groups.ai.forEach((g, i) => {
    if (!g || g.eliminated || !g.cards.some(c => R.isAlive(c) && !R.isPinned(c))) return;
    const fp = R.calcGroupFirepower(g, aiKey, 0, { crewMap: buildCrewMapFromPairs(g) });
    if (fp < bestFP) { bestFP = fp; gi = i; }
  });
  if (gi < 0) return false;
  const judge = drawTerrainCard();
  if (!judge) return false;
  showJudgeCard(judge);
  checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
  const num = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
  const isBlack = !(judge.terrain && judge.terrain.rncColor === '赤');
  const ok = isBlack && num > sniperRnc;
  if (ok) state.playerSniperDisabled = true;
  (state.aiActedGroups || (state.aiActedGroups = new Set())).add(gi);
  state.aiActedThisTurn = true;
  await showAIAction(`AI: 狙撃兵チェック ${ok ? '成功' : '失敗'}（${isBlack ? '黒' : '赤'}${num} / 狙撃のRNC ${sniperRnc}）${ok ? ' — あなたの狙撃カードは以後使えません' : ''}`, judge, gi);
  return true;
}

async function aiTrySnipe() {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  // 攻撃側保有時は SNIPER を機能無効化（シナリオC: treatAsPlainAttacker）
  const sc = state.scenario;
  if (sc && sc.treatAsPlainAttacker && state.aiRole === 'attacker'
      && sc.treatAsPlainAttacker.indexOf('SNIPER') >= 0) {
    return false;
  }
  const snipeIdx = state.aiHand.findIndex(c => {
    if (!c || !c.terrain) return false;
    const m = c.terrain.modifier || '';
    return m.indexOf('KIA') >= 0 || m.indexOf('PIN') >= 0;
  });
  if (snipeIdx < 0) return false;
  // §14.4 狙撃兵チェックで発見された後は、狙撃カードは非機能
  if (state.aiSniperDisabled) return false;
  // §14.1 狙撃は捨て札の代わり: 国籍による捨て札の残り枚数が必要
  if (aiRemainingDiscard() <= 0) return false;
  const card = state.aiHand[snipeIdx];
  const playerKey = getFactionKey(state.player);
  // 目標グループ: 分隊長のいるグループのうち人数の少ないもの（分隊長に当たりやすい）。いなければ生存兵のいる最初のグループ
  let tgtGrpIdx = -1, bestAlive = Infinity;
  state.groups.player.forEach((g, gi) => {
    if (!g || g.eliminated) return;
    if (!retrogradeObservationOk('ai', g, gi)) return; // §38.7
    const alive = g.cards.filter(c => R.isAlive(c));
    const hasSL = alive.some(c => { const d = R.lookupSoldier(c, playerKey); return d && d.leader === '分隊長'; });
    if (hasSL && alive.length < bestAlive) { bestAlive = alive.length; tgtGrpIdx = gi; }
  });
  if (tgtGrpIdx < 0) tgtGrpIdx = state.groups.player.findIndex((g, gi) => g && !g.eliminated && g.cards.some(c => R.isAlive(c)) && retrogradeObservationOk('ai', g, gi)); // §38.7
  if (tgtGrpIdx < 0) return false;
  const grp = state.groups.player[tgtGrpIdx];
  // §14.2 撃たれる兵士は RPC で決める
  const rpcCard = drawTerrainCard();
  if (!rpcCard) return false;
  showJudgeCard(rpcCard);
  checkBreezeRemoveSmoke(rpcCard); pushTerrainToDiscard(rpcCard);
  const soldier = pickByRPC(rpcCard, grp);
  if (!soldier) return false;
  state.aiDiscardedThisTurn = (state.aiDiscardedThisTurn || 0) + 1; // §14.1 捨て札1枚分
  const judge = drawTerrainCard();
  showJudgeCard(judge);
  if (judge) { checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
  const rnc = parseInt((judge && judge.terrain && judge.terrain.range) || '0', 10) || 0;
  const def = R.lookupSoldier(soldier, playerKey);
  const wasPinned = R.isPinned(soldier);
  let kiaRange = [], pinRange = [];
  if (card.terrain.modifier) {
    const mk = card.terrain.modifier.match(/KIA[:\s]*([0-9\-]+)/);
    const mp = card.terrain.modifier.match(/PIN[:\s]*([0-9\-]+)/);
    kiaRange = mk ? mk[1].split('-').map(Number) : [];
    pinRange = mp ? mp[1].split('-').map(Number) : [];
  }
  let result = 'MISS';
  if (kiaRange.length === 2 && rnc >= kiaRange[0] && rnc <= kiaRange[1]) result = 'KIA';
  else if (kiaRange.length === 1 && rnc === kiaRange[0]) result = 'KIA';
  else if (pinRange.length === 2 && rnc >= pinRange[0] && rnc <= pinRange[1]) result = 'PIN';
  else if (pinRange.length === 1 && rnc === pinRange[0]) result = 'PIN';
  if (result === 'KIA') R.killSoldier(soldier);
  else if (result === 'PIN') {
    // §14.3 すでにピン状態ならパニック → §6.531 潰走チェック
    if (wasPinned) result = resolveSniperPanic(soldier, def, judge);
    else R.pinSoldier(soldier);
  }
  // §14.4 次のプレイヤーターンの狙撃兵チェック用に、狙撃のRNCを記録
  state.aiSnipeRncThisTurn = rnc;
  state.aiHand.splice(snipeIdx, 1);
  pushTerrainToDiscard(card);
  state.aiHandCount = state.aiHand.length;
  const tgtFlag = (state.player && state.player.flag) ? state.player.flag + ' ' : '';
  const name = tgtFlag + (def ? def.name : soldier.id);
  const kiaStr = kiaRange.length ? kiaRange.join('-') : '—';
  const pinStr = pinRange.length ? pinRange.join('-') : '—';
  const snipeResults = [{ name, rnc, rncColor: '黒', result, finalFP: null, sum: rnc, morale: null, kia: null, wasPinned, snipeKia: kiaStr, snipePin: pinStr }];
  const title = `AI狙撃 → ${name} (KIA:${kiaStr} / PIN:${pinStr})`;
  await showAIAction(`AI: 狙撃 → ${name}`, card);
  await showFireResultOverlay(title, snipeResults);
  cleanupEliminatedGroups();
  renderField('player'); renderField('ai');
  renderHands();
  updateDeckCounts();
  return true;
}

/** §4.3 AI の捨て札の残り枚数（§7.3 相手への地形配置もこれを使う） */
function aiRemainingDiscard() {
  const lim = {
    ger: { withAction: 1, withoutAction: 1 },
    us:  { withAction: 0, withoutAction: 2 },
    rus: { withAction: 0, withoutAction: Infinity },
    jpn: { withAction: 0, withoutAction: 2 },
    uk:  { withAction: 0, withoutAction: 2 },
  }[getFactionKey(state.ai)] || { withAction: 0, withoutAction: 1 };
  const max = state.aiActedThisTurn ? lim.withAction : lim.withoutAction;
  return max === Infinity ? Infinity : Math.max(0, max - (state.aiDiscardedThisTurn || 0));
}

/** 足止めの地形（§7.3/§13.3/§24.3）を置ける相手グループの候補（よい順）。
 *  鉄条網は移動中でなくても置ける（湿地・トーチカ・渡河前の河川は不可）。河川・湿地・地雷原は移動中の相手だけ。
 *  よい順: 前進している（距離チットが大きい）→ 移動中 → 人数が多い */
function aiHarassTargets(terrainType) {
  const R = window.INFANTRY_RULES;
  const groups = state.groups.player || [];
  const alive = g => g && !g.eliminated && g.cards.some(c => R.isAlive(c));
  const moving = g => { const top = topIgnoringSmoke(g); return !!(top && top.terrain && top.terrain.type === 'MOVEMENT'); };
  const out = [];
  groups.forEach((g, i) => {
    if (!alive(g)) return;
    if (!retrogradeObservationOk('ai', g, i)) return; // §38.7 夜間、後退中の相手には観測が必要
    if (terrainType === 'WIRE') {
      if (wireBlockReason(g)) return;
    } else {
      if (!moving(g)) return;
      if (R.canPlaceTerrainOnMarsh && !R.canPlaceTerrainOnMarsh(g)) return;
      if (R.canPlaceTerrainOnGully && !R.canPlaceTerrainOnGully(g)) return;
      if (R.canPlaceTerrainOnStream && !R.canPlaceTerrainOnStream(g)) return;
    }
    out.push(i);
  });
  return out.sort((a, b) => {
    const A = groups[a], B = groups[b];
    return ((B.distance || 0) - (A.distance || 0))
      || ((moving(B) ? 1 : 0) - (moving(A) ? 1 : 0))
      || (B.cards.filter(c => R.isAlive(c)).length - A.cards.filter(c => R.isAlive(c)).length);
  });
}
const AI_HARASS_TYPES = ['WIRE', 'STREAM', 'MARSH', 'MINEFIELD'];
/** 手札で、置ける相手がいる足止めの地形カード { idx, gi } */
function aiFindHarassPlay() {
  const SH = window.SCENARIO_HELPERS;
  for (let i = 0; i < state.aiHand.length; i++) {
    const c = state.aiHand[i];
    if (!c || !c.terrain || AI_HARASS_TYPES.indexOf(c.terrain.type) < 0) continue;
    if (SH && SH.isCardDisabledAsTerrain(state.scenario, c, state.aiRole === 'attacker')) continue; // §シナリオ C: 攻撃側の地雷原は非機能
    const t = aiHarassTargets(c.terrain.type);
    if (t.length) return { idx: i, gi: t[0] };
  }
  return null;
}
/** 足止めの地形を置ける場面か（ターンの型を決める材料） */
function aiHarassAvailable() { return !!aiFindHarassPlay(); }
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
      return fp >= need;
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
    const pool = (g.weaponPool || []).filter(x => !x.isDemo); // 爆薬（副次兵器）は AI は拾わない
    if (!pool.length) continue;
    const w = pool.slice().sort((a, b) => fpSum(b) - fpSum(a))[0];
    let soldier = null, auto = false;
    if (w.needsCrew && w.assistantNum != null) {
      soldier = g.cards.find(c => c.num === w.assistantNum && R.isAlive(c) && !R.isPinned(c) && !c.transfer) || null;
      auto = !!soldier;
    }
    if (!soldier) {
      const cands = g.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.transfer && !c.infiltrating);
      if (!cands.length) continue;
      // いま持っている兵器の弱い兵士が拾う（兵器が壊れている兵士は火力 0 として比べる）
      const curFP = c => (c.destroyed ? 0 : fpSum(weaponOfCard(c, aiKey)));
      soldier = cands.sort((a, b) => curFP(a) - curFP(b))[0];
      // 今の兵器より強い時だけ拾う（同じ兵器どうしの交換を繰り返さない）
      if (fpSum(w) <= curFP(soldier)) continue;
    }
    let ok = auto, judge = null;
    if (!auto) {
      judge = drawTerrainCard();
      if (judge) { showJudgeCard(judge); checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
      ok = !!judge && !(judge.terrain && judge.terrain.rncColor === '赤');
    }
    const d = R.lookupSoldier(soldier, aiKey);
    if (ok) {
      const old = weaponOfCard(soldier, aiKey);
      g.weaponPool.splice(g.weaponPool.indexOf(w), 1); // 本物の置き場から取る（pool は爆薬を除いた写し）
      if (old) g.weaponPool.push(Object.assign({ fromNum: soldier.num, assistantNum: null, fromSide: 'ai' }, old));
      const { fromNum, assistantNum, fromSide, ...weapon } = w;
      soldier.acquiredWeapon = weapon;
      if (g.crewPairs) Object.keys(g.crewPairs).forEach(o => {
        if (Number(o) === soldier.num || Number(g.crewPairs[o]) === soldier.num) delete g.crewPairs[o];
      });
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
  const mvIdx = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  if (mvIdx < 0) return false;
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || g.forming || acted.has(gi) || fired.has(gi)) continue;
    const alive = g.cards.filter(c => R.isAlive(c));
    if (alive.length !== 1) continue;
    const soldier = alive[0];
    if (R.isPinned(soldier) || soldier.infiltrating || soldier.transfer) continue;
    const dest = transferDestinations('ai', gi).filter(d => !d.isNew).find(d => !transferBlockReason('ai', gi, d, [soldier]));
    if (!dest) continue;
    startTransfer('ai', gi, dest, [soldier]);
    const mc = state.aiHand.splice(mvIdx, 1)[0];
    if (mc) pushTerrainToDiscard(mc);
    state.aiHandCount = state.aiHand.length;
    acted.add(gi);
    renderField('ai'); renderHands();
    const d = R.lookupSoldier(soldier, getFactionKey(state.ai));
    await showAIAction(`AI: 個人移送 — ${d ? d.name : soldier.id} を GROUP ${GROUP_LETTERS[dest.idx]} へ`, mc, gi);
    return true;
  }
  return false;
}

/** §17.8 AI: 移送してきた兵士を受け取る（受け取るグループの1アクション。移送を始めたターンは不可） */
async function aiTryReceiveTransfer() {
  const acted = state.aiActedGroups || new Set();
  const fired = state.aiFiredGroups || new Set();
  for (let gi = 0; gi < state.groups.ai.length; gi++) {
    const g = state.groups.ai[gi];
    if (!g || g.eliminated || g.forming || acted.has(gi) || fired.has(gi)) continue;
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
async function aiTryPlaceBadTerrain() {
  if (aiRemainingDiscard() <= 0) return false;
  const play = aiFindHarassPlay();
  if (!play) return false;
  const groups = state.groups.player;
  const terrainCard = state.aiHand[play.idx];
  state.aiHand.splice(play.idx, 1);
  state.aiHandCount = state.aiHand.length;
  state.aiDiscardedThisTurn = (state.aiDiscardedThisTurn || 0) + 1; // §7.3 捨て札1枚分
  await showAIAction('AI: 地形配置 → GROUP ' + groups[play.gi].name, terrainCard);
  // §7.32 プレイヤーに拒否の選択肢を出す（河川・地雷原・鉄条網は拒否できない）
  await askTerrainRefusal(groups[play.gi], terrainCard);
  renderField('player'); renderField('ai');
  renderHands();
  return true;
}

function tryAdvanceTerrainPhase() {
  // 両者が完了/配置不可なら終了
  const pHas = state.playerHand.some(isTerrainHandCard) && !state.terrainDone.player;
  const aHas = state.aiHand.some(isTerrainHandCard) && !state.terrainDone.ai;
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
  if (!group) return false;
  const cardType = card && card.terrain && card.terrain.type;
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
  const card = state.aiHand.find(isTerrainHandCard);
  if (!card) { state.terrainDone.ai = true; tryAdvanceTerrainPhase(); return; }
  // 防御に有利な地形 → 自軍に配置
  const goodForSelf = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','SMOKE','GULLY'];
  // 相手に不利な地形 → 相手に配置
  const badForEnemy = ['WIRE','STREAM','MARSH'];
  // 人工地形（初期配置では使えない、ゲーム中は既存地形の上にのみ）
  const artificial = ['SMOKE','WIRE','MINEFIELD'];
  const type = card.terrain && card.terrain.type;

  let targetSide, groups;
  if (badForEnemy.indexOf(type) >= 0) {
    targetSide = 'player';
    groups = state.groups.player;
  } else {
    targetSide = 'ai';
    groups = state.groups.ai;
  }
  if (!groups || groups.length === 0) { state.terrainDone.ai = true; tryAdvanceTerrainPhase(); return; }

  // 置ける地形カード（人工地形・地雷原は初期配置では使えない §3.6）を順に試し、
  // まだ地形のない（仮の平地だけの）グループに置けたら終わり。どれも置けなければ配置完了
  const usable = state.aiHand.filter(c => isTerrainHandCard(c) && artificial.indexOf(c.terrain.type) < 0);
  for (const c of usable) {
    const side = badForEnemy.indexOf(c.terrain.type) >= 0 ? 'player' : 'ai';
    const gs = state.groups[side] || [];
    const cands = gs.map((g, i) => i).filter(i => {
      const g = gs[i];
      return g && !g.eliminated && !(g.terrain || []).some(x => !isDummyPlain(x));
    }).sort(() => Math.random() - 0.5);
    for (const gi of cands) {
      if (placeTerrainOnGroup(side, gi, c, 'ai')) { tryAdvanceTerrainPhase(); return; }
    }
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

// ===== 山札クリックで手札補充 =====
document.getElementById('deck-draw').addEventListener('click', () => {
  if (TERRAIN_CARDS.length === 0) { alert('地形デッキ未読込'); return; }
  const need = state.player.handMax - state.playerHand.length;
  if (need <= 0) return;
  for (let i = 0; i < need; i++) {
    const c = drawTerrainCard();
    if (c) state.playerHand.push(c);
  }
  renderHands();
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
