// アップフロント: アクションのメニュー（プレイヤーの操作）
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== アクションメニュー =====
function playerCanStartAction() {
  return state.phase === 'play' && state.currentTurn === 'player' &&
    !state.radioResolving && !state.resolvingPlayerDiscards && !deckAttackInProgress() && !settleDeckTimeLimit();
}

state.fireSource = null; // {side:'player'|'ai', idx:int}
state.fireTarget = null;

const ACTIONS_NEED_SOURCE = ['banzai','ordnance','afv-smoke','radio','radio-repair','fire','mortar','move','flank','encircle','recover','voluntary-panic','snipe','terrain','wire-remove','mine-remove','guard','repair','infiltrate','cc','crew','reorder','exchange','demo','transfer','scout','flare','trench','snipercheck','receive','groupshift','weapon','uninfiltrate'];
const ACTIONS_NEED_TARGET = ['banzai','ordnance','afv-smoke','radio','fire','mortar','snipe','terrain','infiltrate','flank','encircle','transfer','scout','flare'];

document.querySelectorAll('.action-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled || state.radioResolving) return;
    // 捨て札・終了・確定ボタンは専用リスナーで処理するのでスキップ
    if (!btn.dataset.act || !playerCanStartAction()) return;
    const act = btn.dataset.act;
    if (state.selectedAction === 'fire' && (state.selectedHand.size || state.fireSource || state.fireTarget)) {
      ufReportLog('cancel', '射撃の選択を解除（カードと行動は未消費）', 'player');
    }
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
    updateConfirmBtn();
    updateDecideBtn();
  });
});

document.getElementById('btn-discard').addEventListener('click', () => {
  if (!playerCanStartAction()) return;
  if (state.selectedHand.size === 0) return;
  if (window.DISCARD_RULES) window.DISCARD_RULES.execute();
});

document.getElementById('btn-end-turn').addEventListener('click', async () => {
  if (!playerCanStartAction()) return;
  // §4.6 相手が直前のターンに何もしていなければ、アクションか捨て札をしなければならない
  const _playerDid = (window.DISCARD_RULES && window.DISCARD_RULES.didAnything())
    || (state.actedGroups && state.actedGroups.size > 0);
  if (state.aiIdleLastTurn && !_playerDid && state.playerHand.length > 0) {
    alert('相手が前のターンに何もしなかったため、このターンはアクションか捨て札をしてください（§4.6）');
    return;
  }
  state.playerIdleLastTurn = !_playerDid;
  const refill = document.getElementById('end-turn-refill');
  const draw = refill.value === '' ? true : Number(refill.value);
  refill.value = '';
  await resolvePlayerDiscardAttacks();
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  state.selectedAction = null;
  state.selectedHand.clear();
  state.fireSource = null;
  state.fireTarget = null;
  document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
  if (window.DISCARD_RULES) window.DISCARD_RULES.resetTurn();
  endPlayerTurn(draw);
  updateConfirmBtn();
  updateDecideBtn();
});

// §4.3・§14.5 複数の捨て札攻撃は、結果を見る前に札と目標を確定する。
function queuePlayerDiscardAttack(kind, card, index) {
  window.DISCARD_RULES.consume(1);
  (state.playerDiscardPlan ||= []).push({ kind, card, index });
}

function playerDiscardTargetEligible(entry, group) {
  if (!group || group.eliminated) return false;
  if (entry.kind === 'snipe') return attackTargetsOf(group).some(sniperTargetEligible);
  const R = window.INFANTRY_RULES;
  const type = entry.card.terrain.type;
  if (!_groupAlive(group) && !group.forming) return false;
  if (!jungleTerrainAllowed(group, entry.card, 'ai') || !enemyTerrainDiscardAllowed(group, type)) return false;
  if (type === 'WIRE') return !wireBlockReason(group);
  return (topIgnoringSmoke(group)?.terrain?.type === 'MOVEMENT' || group.forming) &&
    R.canPlaceTerrainOnMarsh(group) && R.canPlaceTerrainOnGully(group) && R.canPlaceTerrainOnStream(group);
}

async function resolvePlayerDiscardAttacks() {
  const plan = state.playerDiscardPlan;
  if (!plan?.length) return;
  state.playerDiscardPlan = [];
  state.resolvingPlayerDiscards = true;
  try {
    const groups = state.groups.ai;
    for (const entry of plan) {
      if (state.phase !== 'play' || settleDeckTimeLimit()) break;
      let index = entry.index;
      if (groups[index]?.eliminated) {
        const eligible = groups.map((group, i) => playerDiscardTargetEligible(entry, group) ? i : -1)
          .filter(i => i >= 0);
        if (eligible.length) {
          const names = eligible.map((i, n) => `${n + 1}: GROUP ${groups[i].name}`);
          const answer = prompt([radioText('元の目標が全滅しました。新しい目標を選んでください。0で捨て札。',
            'The original target was eliminated. Choose a new target, or enter 0 to discard.'), ...names].join('\n'), '0');
          index = eligible[Number(answer) - 1];
        }
      }
      const group = groups[index];
      if (!playerDiscardTargetEligible(entry, group)) {
        pushTerrainToDiscard(entry.card);
        continue;
      }
      if (entry.kind === 'snipe') {
        await withDeckAttack(() => resolvePlayerSniper(entry.card, group));
      } else {
        resolvePlayerEnemyTerrain(entry.card, group, index);
      }
    }
  } finally {
    state.resolvingPlayerDiscards = false;
  }
}

async function resolvePlayerSniper(card, group) {
  const soldier = drawSniperTarget(group);
  if (!soldier) { pushTerrainToDiscard(card); return; }
  const judge = ccDrawCard('player');
  if (!judge) { pushTerrainToDiscard(card); return; }
  noteSurpriseAttack('player', 'ai');
  showJudgeCard(judge);
  const shot = resolveSniperShot(card, soldier, group, 'ai', judge);
  state.playerSnipeRncThisTurn = shot.rnc;
  noteSniperCheck(group, shot.rnc);
  pushTerrainToDiscard(card);
  await showFireResultOverlay(`狙撃 → ${shot.name} (KIA:${shot.snipeKia} / PIN:${shot.snipePin})`, [shot]);
  cleanupEliminatedGroups();
  renderField('player'); renderField('ai'); renderHands();
}

function resolvePlayerEnemyTerrain(card, grp, index) {
  recordEnemyTerrainDiscard(grp, card.terrain.type);
  const isStream = card.terrain && card.terrain.type === 'STREAM';
  const isWire = card.terrain && card.terrain.type === 'WIRE';
  const isMinefield = card.terrain && card.terrain.type === 'MINEFIELD';
  const isSmoke = card.terrain && card.terrain.type === 'SMOKE';
  const lastMove = findLastMovement(grp);
  const forcedMarsh = state.scenario?.jungleMode && card.terrain.type === 'MARSH';
  // §8.5 河川/煙幕/鉄条網/地雷原は拒否不可。他は移動カードがあれば50%の確率で拒否
  if (terrainEntryForbidden(grp, card.terrain.type, 'ai')) {
    refuseTerrainCard(grp, card, 'ai');
    alert(`AI は GROUP ${grp.name} が入れない地形を拒否しました。`);
  } else if (partisanTrap('player',grp,card)) {
    // §37.6 判定後に取り除き、地形は変えない。
  } else if (!isStream && !isWire && !isMinefield && !isSmoke && !forcedMarsh &&
      (grp.forming || (lastMove && (lastMove.mode === 'lateral' || !transferLocksRange('ai', index)))) &&
      Math.random() < 0.5) {
    const forming = grp.forming;
    refuseTerrainCard(grp, card, 'ai');
    alert(forming ? 'AI: 地形を拒否したため、移送兵は元のグループに戻りました。' : 'AI: 地形カードを拒否しました。');
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
  cleanupEliminatedGroups();
  renderField('player'); renderField('ai'); renderHands();
}

function onGroupClickActionPhase(side, idx) {
  if (!state.selectedAction || !playerCanStartAction()) return;
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
  const choosingTransferDestination = state.selectedAction === 'transfer' && state.fireSource && state.fireSource.idx !== idx;
  if (side === 'player' && needsSource && !['recover','voluntary-panic'].includes(state.selectedAction) &&
      !choosingTransferDestination && state.actedGroups?.has(idx)) {
    alert('このグループは今ターン既にアクション済みです');
    return;
  }
  if (state.selectedAction === 'afv-smoke') {
    if (state.fireSource) state.fireTarget = { side, idx };
    else if (side === 'player' && afvSmokeShooter(grp, side)) state.fireSource = { side, idx };
  } else if (state.selectedAction === 'transfer' && side === 'player') {
    // 個人移送: src/tgt とも自軍 (player) 側
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
function ccDrawCard(rncSide) {
  const c = rncSide ? drawRandomReinforcementRnc(rncSide) : drawTerrainCard();
  if (c) { checkBreezeRemoveSmoke(c); pushTerrainToDiscard(c); }
  return c;
}

/** §14.6 RPC: グループの生存兵士の人数の列（1〜0r）の数字で、目標の兵士（左からの位置）を決める */
function sniperTargetEligible(card) {
  const R = window.INFANTRY_RULES;
  if (!R.isAlive(card)) return false;
  const afv = window.AFV;
  if (!afv?.isAfvCard(card)) return true;
  if (afv.isButtoned(card)) return false;
  if (!R.isPinned(card)) return true;
  const side = _sideOfCard(card);
  return Boolean(side && getFactionKey(state[side]) === 'uk' &&
    /WASP|BREN CARRIER/i.test(afv.defOf(card)?.name || ''));
}

function drawSniperTarget(group) {
  const targets = attackTargetsOf(group).filter(sniperTargetEligible);
  if (targets.length < 2) return targets[0] || null;
  const card = ccDrawCard();
  if (!card) return null;
  showJudgeCard(card);
  return pickByRPC(card, { cards: targets });
}

function pickByRPC(rpcCard, group, eligible = window.INFANTRY_RULES.isAlive) {
  const R = window.INFANTRY_RULES;
  if (!R || !rpcCard || !group) return null;
  const alive = group.cards.filter(eligible);
  if (alive.length === 0) return null;
  const keys = ['1','2b','3','4c','5o','6','7w','8','9','0r'];
  const key = keys[Math.max(0, Math.min(9, alive.length - 1))];
  const roll = parseInt(rpcCard.terrain?.dice?.[key], 10);
  const pos = Math.max(1, Math.min(alive.length, key === '0r' && roll === 0 ? 10 : roll || 1));
  return alive[pos - 1];
}

/** §14.3 / §33.1: 狙撃の最小KIA値または敗走で、7wが印刷士気と等しい場合だけ負傷する。 */
function resolveSniperShot(card, soldier, group, side, judge) {
  italianSurrenderAttacked(group);
  const R = window.INFANTRY_RULES;
  const readRange = label => {
    const match = String(card.terrain.modifier || '').match(new RegExp(label + '[:\\s]*(\\d)(?:-(\\d))?'));
    return match ? [Number(match[1]), Number(match[2] ?? match[1])] : null;
  };
  const kia = readRange('KIA'), pin = readRange('PIN');
  const rnc = Number(judge.terrain.range) || 0;
  const applies = range => range && range[0] <= rnc && rnc <= range[1];
  let result = applies(kia) ? 'KIA' : applies(pin) ? 'PIN' : 'MISS';
  const faction = getFactionKey(state[side]);
  const def = R.lookupSoldier(soldier, faction);
  const wasPinned = R.isPinned(soldier);
  if (result !== 'MISS' && window.AFV.isAfvCard(soldier)) {
    result = window.AFV.applySniperHit(soldier, result === 'KIA');
  } else if (result !== 'MISS' && infantryGunProfile(soldier, side)) {
    if (result === 'KIA' && loseInfantryGunCrew(soldier, side)) {
      R.pinSoldier(soldier);
      result = 'PIN';
    } else if (result === 'KIA' || wasPinned) {
      R.killSoldier(soldier);
      result = 'KIA';
    } else R.pinSoldier(soldier);
  } else {
    if (result === 'PIN' && wasPinned) {
      const rpc = Number(judge.terrain.dice?.['0r']) || 0;
      result = rpc <= R.routThreshold(def) ? 'PANIC_KIA' : 'PANIC_ROUT';
      result = berserkFireResult({ result }, group, soldier, def, side, rpc);
    }
    const canWound = result === 'PANIC_ROUT' || (result === 'KIA' && rnc === kia[0]);
    if (canWound && R.rpc7wOf(judge) === Number(def?.printedMorale ?? def?.morale)) result = applyWound(soldier);
    if (result === 'KIA' || result === 'PANIC_KIA') R.killSoldier(soldier);
    else if (result === 'PANIC_ROUT') R.routSoldier(soldier);
    else if (result === 'PIN' && applyPersonnelPin(soldier) !== 'PIN') result = 'MISS';
  }
  if (result !== 'MISS' && result !== 'WOUND' && soldier.infiltrating) window.CC_ACTION.clearSoldierInfiltration(soldier);
  const flag = state[side].flag;
  const rangeLabel = range => !range ? '—' : range[0] === range[1] ? String(range[0]) : range.join('-');
  return { name: (flag ? flag + ' ' : '') + (def?.name || soldier.id), rnc,
    rncColor: judge.terrain.rncColor, result, finalFP: null, sum: rnc, morale: null, kia: null, wasPinned,
    snipeKia: rangeLabel(kia), snipePin: rangeLabel(pin) };
}

/** §10.3/§6.531 自発的パニックでは、カード裏面の潰走条件を使う（負傷判定なし）。 */
function resolveVoluntaryPanic(soldier, def, judge) {
  const R = window.INFANTRY_RULES;
  const rpc0r = parseInt((judge && judge.terrain && judge.terrain.dice && judge.terrain.dice['0r']) || '0', 10) || 0;
  if (rpc0r <= R.routThreshold(def)) {
    R.killSoldier(soldier);
    return 'PANIC_KIA';
  }
  R.routSoldier(soldier);
  return 'PANIC_ROUT';
}

function isRallyActionCard(card) {
  return /^(?:HERO|RALLY (?:ALL|[1-6]))$/.test(card?.terrain?.type || '');
}

function handRallyFace(card, side) {
  return handActionFaces(card, side).find(terrain => isRallyActionCard({ terrain }));
}

function playerGroupBeforeAction() {
  const source = state.fireSource;
  if (source?.side !== 'player' || state.actedGroups?.has(source.idx)) return null;
  const group = state.groups.player[source.idx];
  return group && !group.eliminated ? group : null;
}

function minefieldRemovalCandidates() {
  const group = playerGroupBeforeAction();
  const rules = window.INFANTRY_RULES;
  if (!group || !rules.hasTerrainType(group, 'MINEFIELD')) return [];
  return group.cards.filter(card => rules.isAlive(card) && !rules.isPinned(card));
}

function playerWeaponRepairs() {
  const group = playerGroupBeforeAction();
  if (!group) return [];
  const rules = window.INFANTRY_RULES;
  // §19.3 AFVは移動中や湿地・河川でも修理を試みられる。
  const restricted = isMovingIgnoringOverlays(group) || rules.isInMarsh(group) || rules.isInStream(group);
  return repairOptions(group, 'player').filter(repair => !restricted || repair.def.afv);
}

function updateConfirmBtn() {
  const btn = document.getElementById('btn-confirm');
  const openGround = document.getElementById('btn-place-open-ground');
  const act = state.selectedAction;
  const terrainCard = act === 'terrain' && state.selectedHand.size === 1
    ? state.playerHand[[...state.selectedHand][0]] : null;
  const defaultsToPlain = terrainCard && isPlainUseCard(terrainCard);
  const japaneseLabel = defaultsToPlain ? '平地として置く' : '確定';
  const label = LANG === 'ja' ? japaneseLabel : langTranslate(japaneseLabel);
  if (btn.textContent !== label) btn.textContent = label;
  openGround.hidden = true;
  const endTurn = document.getElementById('btn-end-turn');
  const pending = state.playerDiscardPlan?.length || 0;
  if (endTurn) {
    endTurn.title = pending ? radioText(`ターン終了時に宣言済みの${pending}枚を解決します。`,
      `Resolve ${pending} declared discards at the end of the turn.`) : '';
  }
  if (!act || !playerCanStartAction()) { btn.disabled = true; return; }
  if (act === 'banzai') {
    const [index] = state.selectedHand;
    btn.disabled = state.selectedHand.size !== 1 || state.playerHand[index]?.terrain?.type !== 'MOVEMENT' ||
      !banzaiOptions('player', state.fireSource?.idx, state.fireTarget?.idx).length;
    return;
  }
  if (act === 'afv-smoke') {
    const target = state.fireTarget;
    const [index] = state.selectedHand;
    btn.disabled = state.selectedHand.size !== 1 ||
      !canFireAfvSmoke('player', state.fireSource?.idx, target?.side, target?.idx, state.playerHand[index]);
    return;
  }
  if (act === 'ordnance') {
    const cards = [...state.selectedHand].map(i => state.playerHand[i]);
    const plans = ordnancePlans('player', state.fireSource?.idx, state.fireTarget?.idx);
    btn.disabled = !cards.length || !cards.every(isOrdnanceFireCard) ||
      cards.length > new Set(plans.map(p => p.card)).size;
    return;
  }
  if (act === 'radio' || act === 'radio-repair') {
    const repair = act === 'radio-repair';
    const source = state.fireSource?.idx;
    const selected = [...state.selectedHand];
    btn.disabled = !radioOperator('player', source, repair) ||
      (!repair && !(radioTarget('player', state.fireTarget?.idx) &&
        selected.length === 1 && isRadioCard(state.playerHand[selected[0]], 'player')));
    return;
  }
  if (act === 'move') {
    const _g = state.fireSource && state.groups.player[state.fireSource.idx];
    btn.disabled = !(state.selectedHand.size > 0 && state.fireSource) || !!(_g && (_g._immob || _g._bog || _g._stun)); // §28 AFV の移動不能・スタック・スタン
    return;
  }
  if (act === 'terrain') {
    const target = state.fireSource || state.fireTarget;
    const canPlacePlain = terrainCard && target?.side === 'player' && !state.actedGroups?.has(target.idx) &&
      !openGroundBlockReason(state.groups.player[target.idx], 'player') &&
      window.DISCARD_RULES.canStillAct() && partisanActionRoom('player');
    btn.disabled = !(terrainCard && target && (!defaultsToPlain || canPlacePlain));
    openGround.hidden = !canPlacePlain || defaultsToPlain;
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
  if (act === 'crew' || act === 'reorder') {
    const group = playerGroupBeforeAction();
    btn.disabled = !group || (act === 'reorder' && groupOrderCandidates(group, true).length < 2);
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
    const card = state.playerHand[[...state.selectedHand][0]];
    btn.disabled = !(isRallyActionCard(card) && state.fireSource && surpriseCanRally('player', card));
    return;
  }
  if (act === 'wire-remove') {
    btn.disabled = !(state.selectedHand.size > 0 && state.fireSource);
    return;
  }
  if (act === 'mine-remove') {
    btn.disabled = !minefieldRemovalCandidates().length;
    return;
  }
  if (act === 'voluntary-panic') {
    const group = state.groups.player[state.fireSource?.idx];
    btn.disabled = !voluntaryPanicCandidates(group, 'player').length;
    return;
  }
  if (act === 'guard') {
    // §32.2 捕虜のいるグループだけ
    const g = state.fireSource && state.fireSource.side === 'player' && state.groups.player[state.fireSource.idx];
    btn.disabled = !prisonerGuardsAvailableToChange(g).length;
    return;
  }
  if (act === 'snipercheck') {
    btn.disabled = !state.fireSource;
    return;
  }
  if (act === 'repair') {
    btn.disabled = !playerWeaponRepairs().length;
    return;
  }
  if (act === 'snipe') {
    const target = state.sniperTarget;
    const group = state.groups[target?.side]?.[target?.grpIdx];
    const [index] = state.selectedHand;
    btn.disabled = !(state.selectedHand.size === 1 && sniperCardPlayable(state.playerHand[index], 'player') &&
      group && attackTargetsOf(group).some(sniperTargetEligible) &&
      surpriseCanSnipe('player'));
    return;
  }
  if (act === 'discard') {
    const rules = window.DISCARD_RULES;
    const remaining = rules.getRemainingDiscard();
    btn.disabled = ![...state.selectedHand].some(index => {
      const card = state.playerHand[index];
      return rules.discardCardAllowed(card, 'player') && (remaining > 0 || rules.isFreeDiscard(card));
    });
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
  if (act === 'weapon' || act === 'exchange') {
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
  if (!playerCanStartAction()) return;
  if (['mine-remove', 'repair'].includes(state.selectedAction)) return withDeckAttack(confirmPlayerAction);
  return confirmPlayerAction();
});

document.getElementById('btn-place-open-ground').addEventListener('click', event => {
  if (event.currentTarget.hidden || !playerCanStartAction()) return;
  return confirmPlayerAction(true);
});

async function confirmPlayerAction(asOpenGround = false) {
  const btn = document.getElementById('btn-confirm');
  const act = state.selectedAction;
  if (state.radioResolving || (asOpenGround ? act !== 'terrain' : btn.disabled)) return;
  const select = state.fireSource || state.fireTarget;
  if (select?.side === 'player' && state.groups.player[select.idx]?.italianSurrender &&
      ['move','groupshift','flank','encircle','fire','ordnance','mortar','radio','terrain','recover','voluntary-panic','wire-remove'].includes(act)) {
    alert(radioText('降伏中のグループは行動できません（§50.41）。', 'This surrendered group cannot perform that action (§50.41).'));
    return;
  }
  let playerDidRuleAction = false;
  try { const _b = document.querySelector('.action-btn[data-act="' + act + '"]'); ufReportLog('player', '行動: ' + (_b ? _b.textContent : act), 'player'); } catch (e) {}
  // §4.3/§14.1 捨て札（狙撃・相手への地形配置を含む）をしたターンは、国籍によってはアクションできない
  {
    const _tTarget = state.fireSource || state.fireTarget;
    const _selCard = state.playerHand[[...state.selectedHand][0]];
    const _notAction = act === 'discard' || act === 'snipe' || act === 'voluntary-panic'
      || (act === 'terrain' && _tTarget && _tTarget.side === 'ai')
      || (act === 'recover' && _selCard && _selCard.terrain && _selCard.terrain.type === 'HERO')
      || (['move', 'groupshift'].includes(act) && getFactionKey(state.player) === 'jpn'); // §45 日本軍の移動はアクションに数えない
    if (!_notAction && !partisanActionRoom('player')) {
      alert(radioText('パルチザンの行動上限です。','The partisan action limit has been reached.'));
      return;
    }
    if (!_notAction && window.DISCARD_RULES &&
        !(act === 'trench' ? window.DISCARD_RULES.canEntrench() : window.DISCARD_RULES.canStillAct())) {
      alert('このターンは捨て札（狙撃・相手への地形配置を含む）をしたため、アクションはできません（§4.3・§14.1）');
      return;
    }
  }

  if (act === 'banzai') {
    const source = state.fireSource?.idx;
    const target = state.fireTarget?.idx;
    const candidates = banzaiOptions('player', source, target);
    if (!candidates.length) return;
    const R = window.INFANTRY_RULES;
    const names = candidates.map((c, i) => (i + 1) + ': ' + R.lookupSoldier(c, 'jpn').name);
    const answer = prompt([radioText('参加する兵士を1～2人選んでください（例 1,2）。',
      'Choose one or two soldiers (e.g. 1,2).'), ...names].join('\n'), '1');
    if (answer == null) return;
    const soldiers = answer.trim().split(/[,、，\s]+/).map(value => /^\d+$/.test(value) && candidates[Number(value) - 1]);
    if (soldiers.length > 2 || soldiers.some(c => !c) || new Set(soldiers).size !== soldiers.length) {
      alert(radioText('異なる兵士を1～2人選んでください。', 'Choose one or two different soldiers.'));
      return;
    }
    const [index] = state.selectedHand;
    if (!await executeBanzai('player', source, target, state.playerHand[index], soldiers)) return;
  }

  if (act === 'afv-smoke') {
    const target = state.fireTarget;
    const [index] = state.selectedHand;
    if (state.selectedHand.size !== 1 ||
        !fireAfvSmoke('player', state.fireSource?.idx, target?.side, target?.idx, state.playerHand[index])) return;
  }

  if (act === 'ordnance') {
    const cards = [...state.selectedHand].map(i => state.playerHand[i]);
    const plans = ordnancePlans('player', state.fireSource?.idx, state.fireTarget?.idx);
    if (!plans.length) return;
    let selected = plans.slice(0, 1);
    if (plans.length > 1) {
      const names = plans.map((p,i) => (i+1) + ': ' + ordnanceName(p));
      const instruction = cards.length === 1
        ? radioText('撃つ兵器の番号を入力してください。', 'Enter the number of the weapon to fire.')
        : radioText(`撃つ兵器を${cards.length}門、順に番号で選んでください（例 1,2）。`,
          `Enter ${cards.length} weapon numbers in firing order (e.g. 1,2).`);
      const choice = prompt([instruction, ...names].join('\n'), cards.length === 1 ? '1' : '');
      if (choice == null) return;
      selected = choice.trim().split(/[,、，\s]+/).map(num => /^\d+$/.test(num) && plans[Number(num) - 1]);
      if (selected.length !== cards.length || selected.some(p => !p) ||
          new Set(selected.map(p => p.card)).size !== selected.length) {
        alert(radioText('射撃カード1枚につき、異なる兵器を1門選んでください。',
          'Choose a different weapon for each Fire card.'));
        return;
      }
    }
    if (!await resolveOrdnance(selected, cards)) return;
  }

  if (act === 'radio') {
    const idx = [...state.selectedHand][0];
    if (!await resolveRadioMission('player', state.fireSource?.idx,
      state.fireTarget?.idx, state.playerHand[idx])) return;
  }
  if (act === 'radio-repair') {
    const result = repairRadio('player', state.fireSource?.idx);
    if (!result) return;
    alert(result);
  }

  if (act === 'move') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (card?.terrain?.type !== 'MOVEMENT' || !state.fireSource) return;
    const grp = state.groups.player[state.fireSource.idx];
    if (!grp || grp.eliminated || grp._immob || grp._bog || grp._stun || state.actedGroups?.has(state.fireSource.idx)) return;
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

  if (act === 'exchange') {
    if (!state.fireSource || state.actedGroups?.has(state.fireSource.idx)) return;
    const group = state.groups.player[state.fireSource.idx];
    if (!askWeaponExchange(group)) return;
    playerDidRuleAction = true;
  }

  if (act === 'reorder') {
    if (!state.fireSource || state.actedGroups?.has(state.fireSource.idx)) return;
    const group = state.groups.player[state.fireSource.idx];
    if (!askGroupOrder(group)) return;
    playerDidRuleAction = true;
  }

  if (act === 'crew') {
    const grp = playerGroupBeforeAction();
    if (!grp) return;
    const srcIdx = state.fireSource.idx;
    const turn = state.turnCount;
    const canDecide = () => playerCanStartAction() && state.turnCount === turn &&
      state.groups.player[srcIdx] === grp && !grp.eliminated && !state.actedGroups?.has(srcIdx) &&
      partisanActionRoom('player') && window.DISCARD_RULES.canStillAct();
    // §11.12–11.13 クルーの指定・解除は、確定したときにグループの唯一の行動を使う。
    openCrewModal(grp, canDecide, () => {
      askGroupOrder(grp, true);
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
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    const R = window.INFANTRY_RULES;
    if (!R) return;
    // §17.1 側面にまわり込めるのは「側面移動」カード（移動カードのうち「側面」と書かれたもの）だけ
    if (card.terrain.sub !== '側面') { alert('側面射撃には「側面移動」カード（FLANK）が必要です（§17.1）'); return; }
    if (hasPillbox(tgtGrp)) { alert('トーチカ持ちグループには側面射撃できません'); return; }
    const _fWhy = cardFlankBlockReason('player', state.fireSource.idx, state.fireTarget.idx);
    if (_fWhy) { alert(_fWhy); return; }
    state.playerHand.splice(cardIdx, 1);
    const { result, judge } = playFlankMovement('player', state.fireSource.idx, state.fireTarget.idx, card);
    if (judge) showJudgeCard(judge);
    alert({
      flanked: `側面射撃成立: GROUP ${tgtGrp.name}`,
      positioned: '歩兵砲を渡河位置に移動しました。次の手番に渡河を判定します。',
      failed: '渡河失敗 — 移動カードは捨て札'
    }[result]);
    playerDidRuleAction = true;
  }

  if (act === 'flare') {
    if (!state.isNight || !state.fireSource || !state.fireTarget) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    if (!_groupAlive(srcGrp) || !_groupAlive(tgtGrp)) return;

    // 認知した敵対象
    const isRecognized = srcGrp.recognizedTargets && srcGrp.recognizedTargets.indexOf(state.fireTarget.idx) >= 0;
    if (!isRecognized) { alert('認知した敵にのみ照明弾を打てます'); return; }

    // 相対距離1-5
    const { rr: dist } = observationRange(srcGrp, tgtGrp);
    if (dist < 1 || dist > 5) { alert('相対距離1〜5 の敵に照明弾を打てます'); return; }

    // ピンでないSL
    if (!groupHasUnpinnedSquadLeader(srcGrp, getFactionKey(state.player))) {
      alert('ピンでない分隊長がグループにいる必要があります');
      return;
    }

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

    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(state.fireSource.idx);
    playerDidRuleAction = true;
    renderField('player'); renderField('ai');
    alert(`照明弾発射: GROUP ${tgtGrp.name} と周辺（索敵不要・夜間半減なし）`);
  }

  if (act === 'trench') {
    if (!state.fireSource || state.actedGroups?.has(state.fireSource.idx) || !window.DISCARD_RULES.canEntrench()) return;
    const index = state.fireSource.idx;
    const group = state.groups.player[index];
    if (!entrenchAllowed(group, 'player')) {
      alert(radioText('塹壕は移動中・鉄条網・ピン状態の兵士・既存の塹壕がなく、平地・森・丘・繁みにいる歩兵が作れます。',
        'Infantry may entrench in open ground, woods, hills or brush when stationary, free of wire, and without pinned men or an existing trench.'));
      return;
    }
    const judge = ccDrawCard('player');
    if (!judge) return;
    const result = Number(judge.terrain.range);
    showJudgeCard(judge);
    if (result === 0) placeEntrenchment(group);
    alert(result === 0 ? '塹壕構築成功（RNC 0）' : `塹壕構築失敗（RNC ${result}）`);
    window.DISCARD_RULES.markEntrenchment();
    (state.actedGroups ||= new Set()).add(index);
  }

  if (act === 'scout') {
    if (!state.isNight || !state.fireSource || !state.fireTarget) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    if (!_groupAlive(tgtGrp) || state.actedGroups?.has(state.fireSource.idx)) return;
    if (!nightObserverAvailable(srcGrp)) {
      alert('観測できる兵士または車両がこのグループにいません');
      return;
    }
    if (isGroupFlared(tgtGrp)) { alert('そのグループは既に照らされています'); return; }

    // §38.2 各グループが観測を試みられるのは、1ターンに敵グループ1つだけ
    if (srcGrp._observeTriedTurn === (state.turnCount || 0)) {
      alert('このグループはこのターン、すでに観測を試みています（観測できる敵グループは1つだけ §38.2）');
      return;
    }
    const ob = observationRange(srcGrp, tgtGrp);
    if (!gullyObservationAllowed(srcGrp, tgtGrp, getFactionKey(state.player), ob.rr)) {
      alert('涸れ谷に出入りする視線で観測できるのは、相対射程5・迫撃砲の観測・丘と涸れ谷の間です（§38.2）');
      return;
    }

    // §38.3 判定: RNC（色無関係）< 現在の相対射程＋修正（相対射程0は「1」を引く）
    const judge = drawRandomReinforcementRnc('player');
    if (!judge) { alert('地形デッキがありません'); return; }
    srcGrp._observeTriedTurn = state.turnCount || 0;
    const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
    const threshold = ob.total;
    const success = observationSuccess(rncAbs, threshold);

    showJudgeCard(judge);
    pushTerrainToDiscard(judge);

    if (success) {
      if (!srcGrp.recognizedTargets) srcGrp.recognizedTargets = [];
      if (srcGrp.recognizedTargets.indexOf(state.fireTarget.idx) < 0) {
        srcGrp.recognizedTargets.push(state.fireTarget.idx);
      }
      alert(`索敵成功 (RNC ${rncAbs}${threshold <= 0 ? ' = 1' : ' < ' + threshold}) — アクション消費なし\nGROUP ${srcGrp.name} が GROUP ${tgtGrp.name} を発見。夜間半減あり。`);
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
    if (state.selectedHand.size !== 1) return;
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!card) return;
    // §8.1 手札のカードを裏向きにして平地にする（§13.5 煙幕・鉄条網は残す）。
    if (asOpenGround || isPlainUseCard(card)) {
      const pTarget = state.fireSource || state.fireTarget;
      if (!pTarget) return;
      if (pTarget.side !== 'player') { alert('平地は自分のグループに置いてください'); return; }
      if (state.actedGroups?.has(pTarget.idx)) { alert('このグループは今ターン既にアクション済みです'); return; }
      const pGrp = state.groups.player[pTarget.idx];
      const reason = openGroundBlockReason(pGrp, 'player');
      if (reason) { alert(reason); return; }
      state.playerHand.splice(cardIdx, 1);
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
    if (!jungleTerrainAllowed(grp, card, target.side)) {
      alert(radioText('このグループにその地形は置けません（ジャングル地形ルール）。', 'This group cannot enter that terrain under the jungle rules.'));
      return;
    }
    if (target.side === 'player' &&
        (terrainEntryForbidden(grp, _placeTtype, target.side) ||
          !infantryGunCanEnter(grp, _placeTtype, target.side))) {
      alert(radioText('このグループはその地形に入れません。','This group cannot enter that terrain.'));
      return;
    }
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
      alert('河川に地形カードを置くには、先に渡河を成功させる必要があります');
      return;
    }
    if (target.side === 'player' && _placeTtype === 'MINEFIELD') {
      alert(radioText('地雷原は敵の移動中グループに使います（§24.3）。',
        'Minefields are played on moving enemy groups (§24.3).'));
      return;
    }
    // §7.3 相手への地形配置は捨て札の代わり（国籍による捨て札の枚数制限を受ける。アクションではない）
    if (target.side === 'ai' && window.DISCARD_RULES && window.DISCARD_RULES.getRemainingDiscard() <= 0) {
      alert('捨て札の枚数制限により、このターンは相手に地形を置けません（§7.3・§4.3）');
      return;
    }
    if (target.side === 'ai' && (!enemyTerrainDiscardAllowed(grp, _placeTtype) ||
        (!['WIRE', 'MINEFIELD'].includes(_placeTtype) &&
          state.playerDiscardPlan?.some(entry => entry.kind === 'terrain' && entry.index === target.idx &&
            !['WIRE', 'MINEFIELD'].includes(entry.card.terrain.type))))) {
      alert('同じ敵グループには、この手番ですでに地形カードを出しています（§7.32）。');
      return;
    }
    state.playerHand.splice(cardIdx, 1);
    if (target.side === 'ai') {
      queuePlayerDiscardAttack('terrain', card, target.idx);
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
    discardUnclaimedWeapons(grp);
    abandonUnsupportedHeavyWeapons(grp);
    breakFlanksOn(grp); // §17.43 鉄条網の除去も移動カードを使ったことになる
    pushTerrainToDiscard(wire);
    state.playerHand.splice(cardIdx, 1);
    pushTerrainToDiscard(card);
    // 地雷原: 鉄条網除去で移動カード使用 → RNC判定
    triggerMinefieldRNCCheck(grp, 'player');
    playerDidRuleAction = true;
  }

  if (act === 'voluntary-panic') {
    const group = state.groups.player[state.fireSource?.idx];
    const candidates = voluntaryPanicCandidates(group, 'player');
    if (!candidates.length) return;
    const R = window.INFANTRY_RULES;
    const faction = getFactionKey(state.player);
    const names = candidates.map((card, index) =>
      `${index + 1}: ${R.lookupSoldier(card, faction)?.name || card.id}`);
    const answer = prompt([radioText('自発的にパニックさせる兵士を番号で選んでください。',
      'Choose a pinned soldier for voluntary panic.'), ...names].join('\n'), '1');
    const soldier = candidates[Number(answer) - 1];
    if (!soldier) return;
    const judge = ccDrawCard('player');
    if (!judge) return;
    showJudgeCard(judge);
    const definition = R.lookupSoldier(soldier, faction);
    const result = resolveVoluntaryPanic(soldier, definition, judge);
    alert(`${definition?.name || soldier.id}: ${resultLabel(result)}`);
    cleanupEliminatedGroups();
  }

  if (act === 'guard') {
    // §32.2 監視役の交代: 新しい監視役がピン状態でなければ、そのグループのそのターン唯一の行動として交代できる
    if (!state.fireSource || state.fireSource.side !== 'player') return;
    const gi = state.fireSource.idx;
    const grp = state.groups.player[gi];
    const R = window.INFANTRY_RULES;
    if (!R || !grp) return;
    const guards = prisonerGuardsAvailableToChange(grp);
    if (!guards.length) { alert('このグループに交代できる監視役がいません'); return; }
    if (state.actedGroups && state.actedGroups.has(gi)) { alert('監視役の交代は、このターンにほかの行動をしていないグループだけができます（§32.2）'); return; }
    const facKey = getFactionKey(state.player);
    const cands = guardCandidates(grp, 'player').filter(c => !R.isPinned(c) && !isCrewAssistant(grp, c)
      && !(guards.length === 1 && guards[0] === c));
    if (!cands.length) { alert('新しい監視役にできる兵士がいません（ピン状態・補助乗員は不可）'); return; }
    const list = cands.map((c, i) => { const d = R.lookupSoldier(c, facKey); return `${i + 1}: #${c.num} ${d ? d.name : c.id}`; }).join('\n');
    const sel = parseInt(prompt(`新しい監視役を選択（番号）:\n${list}`), 10) - 1;
    if (isNaN(sel) || sel < 0 || sel >= cands.length) return;
    const ng = cands[sel];
    changePrisonerGuard(grp, guards, ng);
    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(gi);
    playerDidRuleAction = true;
  }

  if (act === 'mine-remove') {
    // §24.5 地雷原排除はグループの唯一の行動。
    const candidates = minefieldRemovalCandidates();
    if (!candidates.length) return;
    const grp = state.groups.player[state.fireSource.idx];
    const mineIdx = grp.terrain.findIndex(c => c.terrain?.type === 'MINEFIELD');
    const R = window.INFANTRY_RULES;
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
    const judgeCard = drawRandomReinforcementRnc('player');
    if (!judgeCard) return;
    const rncAbs = parseInt((judgeCard.terrain && judgeCard.terrain.range) || '0', 10) || 0;
    const isRed = judgeCard.terrain && judgeCard.terrain.rncColor === '赤';
    showJudgeCard(judgeCard);
    checkBreezeRemoveSmoke(judgeCard); // §13.243 地雷原排除のRNCも風を発生させる。
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
      cleanupEliminatedGroups();
    } else {
      msg += `→ 排除失敗（条件不一致）。地雷原はそのまま。`;
      alert(msg);
    }
    renderField('player');
    playerDidRuleAction = true;
  }

  if (act === 'repair') {
    const R = window.INFANTRY_RULES;
    const options = playerWeaponRepairs();
    if (!options.length) return;
    let repair = options[0];
    if (options.length > 1) {
      const answer = prompt('修理する兵器を選んでください。\n' +
        options.map((option, i) => `${i + 1}: ${option.name}`).join('\n'), '1');
      repair = options[Number(answer) - 1];
      if (!repair) return;
    }
    const { card, name } = repair;
    // §33.4 負傷兵は修理の前に黒の RNC が必要。赤ならこのターンは修理できず、行動は使う
    let _woundBlocked = false;
    if (R.isWoundActive(card)) {
      const wj = drawRandomReinforcementRnc('player');
      if (wj) { showJudgeCard(wj); checkBreezeRemoveSmoke(wj); pushTerrainToDiscard(wj); }
      if (!wj || (wj.terrain && wj.terrain.rncColor === '赤')) {
        alert(`負傷兵 ${name} は修理を試みられませんでした（赤の RNC §33.4）`);
        _woundBlocked = true;
      }
    }
    if (!_woundBlocked) {
      const judge = drawRandomReinforcementRnc('player');
      if (!judge) return;
      showJudgeCard(judge);
      checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
      alert(applyWeaponRepair(repair, judge));
    }
    playerDidRuleAction = true;
  }

  if (act === 'discard') {
    if (window.DISCARD_RULES) window.DISCARD_RULES.execute();
  }

  if (act === 'recover') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!isRallyActionCard(card) || !state.fireSource) return;
    const grp = state.groups.player[state.fireSource.idx];
    const R = window.INFANTRY_RULES;
    if (!grp || grp.eliminated || !R) return;
    if (!surpriseCanRally('player', card)) return;
    if (card.terrain.type === 'RALLY ALL') {
      if (state.actedGroups?.has(state.fireSource.idx)) { alert('このグループは今ターン既にアクション済みです'); return; }
      const groupsRallied = rallyAllWithPartner('player', state.fireSource.idx, card);
      if (!groupsRallied) {
        alert('このグループにピン状態の兵士がいません');
        return;
      }
      if (groupsRallied === 2) window.DISCARD_RULES.markActed();
      state.playerHand.splice(cardIdx, 1);
      pushTerrainToDiscard(card);
      playerDidRuleAction = true;
    } else {
    const previouslyPinned = surprisePinnedForRally('player', card, grp);
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
    const gunRally = (card.terrain.type === 'HERO' || !state.actedGroups?.has(state.fireSource.idx))
      ? tryRallyInfantryGun(grp, 'player', card) : null;
    if (gunRally) {
      state.playerHand.splice(cardIdx, 1);
      pushTerrainToDiscard(card);
      if (card.terrain.type !== 'HERO') {
        window.DISCARD_RULES.markActed();
        (state.actedGroups ||= new Set()).add(state.fireSource.idx);
      }
      alert(gunRally);
    } else {
    // §28.42 ピンの AFV は、回復の強さを合わせて3以上で回復する
    const _afvR = (typeof window.afvRallyCredit === 'function' && !(state.actedGroups && state.actedGroups.has(state.fireSource.idx) && card.terrain.type !== 'HERO')) ? window.afvRallyCredit(grp, card) : null;
    if (_afvR) {
      alert(_afvR.message);
      state.playerHand.splice(cardIdx, 1);
      pushTerrainToDiscard(card);
      playerDidRuleAction = card.terrain.type !== 'HERO';
    } else {
    // RALLY X → X人回復、RALLY ALL → 全員回復、HERO → 1人回復
    const pinnedIdx = grp.cards.map((c, i) => (R.isPinned(c) && R.isAlive(c) &&
      !c.transfer && !infantryGunProfile(c, 'player')) ? i : -1).filter(i => i >= 0);
    const rallyVal = card.terrain.type === 'HERO' ? 1 : parseInt(card.terrain.type.replace('RALLY ', ''), 10) || 0;
    if (pinnedIdx.length === 0) { alert('このグループにPIN状態の兵士がいません'); return; }
    const playerKey = getFactionKey(state.player);
    const isHeroCard = card.terrain.type === 'HERO';
    // §10.2 回復カードはグループの1アクション。§10.4 ヒーローはアクションに数えない
    if (!isHeroCard && state.actedGroups && state.actedGroups.has(state.fireSource.idx)) {
      alert('このグループは今ターン既にアクション済みです');
      return;
    }
    let targets = pinnedIdx;
    if (rallyVal < pinnedIdx.length) {
      if (rallyVal <= 0) return;
      const names = pinnedIdx.map((i, n) => {
        const soldier = grp.cards[i];
        const name = R.lookupSoldier(soldier, playerKey)?.name || soldier.id;
        return `${n + 1}: #${soldier.num} ${name}`;
      });
      const instruction = LANG === 'ja'
        ? `回復する兵士を${rallyVal}人選んでください（番号を空白で区切る）`
        : `Choose ${rallyVal} to rally. Separate the numbers with spaces.`;
      const answer = prompt([instruction, ...names].join('\n'));
      if (answer === null || !answer.trim()) return;
      const chosen = answer.trim().split(/[\s,、]+/).map(Number);
      if (chosen.length !== rallyVal || new Set(chosen).size !== rallyVal ||
          chosen.some(n => !Number.isInteger(n) || n < 1 || n > pinnedIdx.length)) {
        alert(LANG === 'ja' ? `一覧から異なる番号を${rallyVal}個入力してください。` :
          `Enter ${rallyVal} different numbers from the list.`);
        return;
      }
      targets = chosen.map(n => pinnedIdx[n - 1]);
    }
    const names = targets.map(i => {
      const soldier = grp.cards[i];
      R.unpinSoldier(soldier);
      if (isHeroCard) soldier.heroRecovery = true; // §42.43
      return R.lookupSoldier(soldier, playerKey)?.name || soldier.id;
    });
    alert(`回復(${rallyVal}): ${names.join(', ')} が回復しました`);
    state.playerHand.splice(cardIdx, 1);
    pushTerrainToDiscard(card);
    // §10.4 ヒーローでの回復はアクションに数えない
    playerDidRuleAction = !isHeroCard;
    }
    }
    }
    noteSurpriseRally(previouslyPinned);
    }
  }

  if (act === 'snipe') {
    const cardIdx = [...state.selectedHand][0];
    const card = state.playerHand[cardIdx];
    if (!sniperCardPlayable(card, 'player') || !state.sniperTarget || !surpriseCanSnipe('player')) return;
    // §14.1 狙撃は捨て札の代わり（国籍による捨て札の枚数制限を受ける。アクションではない）
    if (window.DISCARD_RULES && window.DISCARD_RULES.getRemainingDiscard() <= 0) {
      alert('捨て札の枚数制限により、このターンは狙撃できません（§14.1・§4.3）');
      return;
    }
    const tgt = state.sniperTarget;
    const grp = state.groups[tgt.side][tgt.grpIdx];
    if (!grp) return;
    state.playerHand.splice(cardIdx, 1);
    queuePlayerDiscardAttack('snipe', card, tgt.grpIdx);
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
    const question = radioText('侵入を解除する兵士を1名選んでください（§20.56）。',
      'Choose one soldier to stop infiltrating (§20.56).');
    const ans = prompt(`${question}\n${lst}`, '1');
    if (ans == null) return;
    const card = /^\d+$/.test(ans.trim()) && infs[Number(ans) - 1];
    if (!card) return;
    window.CC_ACTION.clearSoldierInfiltration(card);
    const name = R.lookupSoldier(card, fk)?.name || card.id;
    alert(radioText(`${name} の侵入を解除しました。`, `${name} stopped infiltrating.`));
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
      (eg?.weaponPool || []).forEach(w => {
        if (w.needsCrew && w.assistantNum != null &&
            eg.cards.some(assistant => assistant.num === w.assistantNum && R.isAlive(assistant))) return;
        opts.push({ w, pool: eg.weaponPool, where: eg, infOnly: true, key });
      });
    });
    if (opts.length === 0) { alert('このグループ（と侵入先）に拾える兵器はありません'); return; }
    const wl = opts.map((o, k) => `${k + 1}: ${o.w.weaponName || o.w.weaponCat}（${o.w.weaponCat}${o.w.needsCrew ? '・クルー兵器' : ''}）${o.infOnly ? '［侵入先 GROUP ' + o.where.name + '・侵入兵のみ］' : ''}`).join('\n');
    const a1 = prompt(`拾う兵器を番号で選んでください\n${wl}`, '1');
    if (a1 == null) return;
    const opt = opts[parseInt(a1, 10) - 1];
    if (!opt) { alert('番号が正しくありません'); return; }
    const w = opt.w;
    const pool = opt.pool;
    const secondary = w.secondary || (w.isDemo ? { kind: 'demo' } : null);
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
        .filter(c => !window.AFV.isAfvCard(c) && !infantryGunProfile(c, 'player') &&
          (!secondary || demoEligible(c, fk))); // 爆薬は §21.1・§33.6 で持てる兵士だけ
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
      const judge = drawRandomReinforcementRnc('player');
      if (judge) { showJudgeCard(judge); checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
      ok = !!judge && !(judge.terrain && judge.terrain.rncColor === '赤');
    }
    if (ok && secondary) {
      pool.splice(pool.indexOf(w), 1);
      setSecondaryWeapon(soldier, secondary);
      alert(`§18.2 ${nameOf(soldier)} が ${secondaryWeaponLabel(secondary.kind)} を所有しました（黒のRNC）`);
    } else if (ok) {
      // §18.21 持っていた兵器と交換（持っていた兵器は兵器チットとしてグループに残る）
      const old = weaponOfCard(soldier, fk);
      pool.splice(pool.indexOf(w), 1);
      if (old) pool.push(Object.assign({ fromNum: soldier.num, assistantNum: null, fromSide: 'player' }, old));
      installAcquiredWeapon(g, soldier, w);
      if (soldier.wounded) woundPortage(soldier);
      alert(`§18.2 ${nameOf(soldier)} が ${w.weaponName || w.weaponCat} を所有しました${auto ? '（助手の自動所有）' : '（黒のRNC）'}`);
    } else {
      alert('§18.2 赤のRNC — 兵器の所有に失敗しました（アクションは使いました）');
    }
    if (ok) askGroupOrder(g, true);
    playerDidRuleAction = true;
  }

  // ===== §17.8 移送の受け取り =====
  if (act === 'receive') {
    if (!state.fireSource) return;
    const toIdx = state.fireSource.idx;
    const dst = state.groups.player[toIdx];
    if (state.actedGroups && state.actedGroups.has(toIdx)) { alert('このグループは今ターン既にアクション済みです'); return; }
    if (dst && dst.forming) { alert('設立中のグループは、地形カードを置くと設立が完了して兵士が入ります（§17.92）'); return; }
    const faction = getFactionKey(state.player);
    const name = card => window.INFANTRY_RULES.lookupSoldier(card, faction)?.name || card.id;
    const n = receiveTransfers('player', toIdx, (card, formation) => {
      const slots = formation.map((member, i) => `${i + 1}: ${name(member)}の前`);
      slots.push(`${formation.length + 1}: 最後尾`);
      const answer = prompt(`${name(card)}を入れる位置を選んでください。\n${slots.join('\n')}`, String(formation.length + 1));
      return answer?.trim() ? Number(answer) - 1 : null;
    });
    if (n === null) return;
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
    const why = groupShiftBlockReason('player', fromIdx);
    if (why) { alert(why); return; }
    const moveIdxs = [...state.selectedHand].filter(i => { const c = state.playerHand[i]; return c && c.terrain && c.terrain.type === 'MOVEMENT'; });
    // 移る先: 隣の空いた位置／隣の自軍グループ（入れ替え）
    const opts = shiftDestinations('player', fromIdx).map(j => ({ idx: j, swap: false }));
    [fromIdx - 1, fromIdx + 1].forEach(j => {
      const o = state.groups.player[j];
      if (isInitialGroupSlot(j) && o && !o.eliminated && o.cards.length > 0 && !o.forming) opts.push({ idx: j, swap: true });
    });
    if (opts.length === 0) { alert('移れる隣の位置がありません（§17.7）'); return; }
    const lst = opts.map((o, k) => `${k + 1}: GROUP ${groupSlotName(o.idx)}${o.swap ? ' と入れ替わる（両方が横移動。移動カード2枚）' : '（空いた位置）'}`).join('\n');
    const ans = prompt(`グループ側方移送の先を番号で選んでください\n${lst}`, '1');
    if (ans == null) return;
    const o = opts[parseInt(ans, 10) - 1];
    if (!o) { alert('番号が正しくありません'); return; }
    const countsAsAction = getFactionKey(state.player) !== 'jpn';
    if (!o.swap) {
      const [card] = state.playerHand.splice(moveIdxs[0], 1);
      const started = startGroupShift(g, 'player', card, o.idx);
      alert(started ? `§17.7 GROUP ${groupSlotName(o.idx)} へ側方移送を宣言しました。`
        : '渡河に失敗したため、側方移送は中止されました。');
    } else {
      const partner = state.groups.player[o.idx];
      const partnerWhy = groupShiftBlockReason('player', o.idx);
      if (partnerWhy) { alert(partnerWhy); return; }
      if ([g, partner].some(group => R.isInStream(group) && !R.hasCrossedStream(group))) {
        alert('渡河が済んでいないグループは、同時に入れ替われません（§17.7）。');
        return;
      }
      if (moveIdxs.length < 2) { alert('入れ替えには移動カードが2枚必要です（§17.7）'); return; }
      if (!partisanActionRoom('player', 2) || (countsAsAction && !window.DISCARD_RULES.canStillAct(2))) {
        alert('この手番に2グループ分の行動はできません。');
        return;
      }
      const [first, second] = moveIdxs;
      const firstCard = state.playerHand[first], secondCard = state.playerHand[second];
      [first, second].sort((x, y) => y - x).forEach(index => state.playerHand.splice(index, 1));
      startGroupShift(g, 'player', firstCard, o.idx, o.idx);
      startGroupShift(partner, 'player', secondCard, fromIdx, fromIdx);
      (state.actedGroups ||= new Set()).add(o.idx);
      if (countsAsAction) window.DISCARD_RULES.markActed();
      alert(`§17.7 GROUP ${g.name} と GROUP ${partner.name} の入れ替えを宣言しました。`);
    }
    (state.actedGroups ||= new Set()).add(fromIdx);
    playerDidRuleAction = countsAsAction;
  }

  // ===== §14.4 狙撃兵チェック =====
  if (act === 'snipercheck') {
    if (!state.fireSource) return;
    if (state.aiSniperDisabled) { alert('相手の狙撃兵はすでに除去されています'); return; }
    if (state.actedGroups?.has(state.fireSource.idx)) { alert('このグループは今ターン既にアクション済みです'); return; }
    const grp = state.groups.player[state.fireSource.idx];
    const sniperRoll = sniperCheckNumber(grp, 'player');
    if (sniperRoll == null) {
      alert('直前に狙撃を受け、武装した兵士・歩兵砲・乗員露出車両がピン状態でなく残っているグループを選んでください。');
      return;
    }
    const judge = drawRandomReinforcementRnc('player');
    if (!judge) return;
    showJudgeCard(judge);
    checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
    const roll = ordnanceRNC(judge);
    delete grp._sniperCheck;
    const outcome = resolveSniperCheck('ai', sniperRoll, judge);
    if (outcome === 'disabled') {
      alert(`狙撃兵チェック成功: 黒${roll.number} > ${sniperRoll}。相手の狙撃カードは以後使えません`);
    } else if (outcome === 'remaining') {
      alert(radioText('狙撃兵チェック成功。相手にはまだ狙撃兵がいます。', 'Sniper check successful. The enemy still has an active sniper.'));
    } else {
      alert(`狙撃兵チェック失敗: ${roll.red ? '赤' : '黒'}${roll.number}（狙撃のRNC ${sniperRoll} より大きい黒が必要）`);
    }
    playerDidRuleAction = true;
  }

  // ===== 侵入 (§20) =====
  if (act === 'infiltrate') {
    if (!state.fireSource || !state.fireTarget || !window.CC_ACTION) return;
    const srcGrp = state.groups.player[state.fireSource.idx];
    const tgtGrp = state.groups.ai[state.fireTarget.idx];
    const eligibility = window.CC_ACTION.canAttemptInfiltration(srcGrp, tgtGrp, 'player');
    if (!eligibility.ok) { alert(eligibility.error); return; }
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
    if (state.actedGroups?.has(fromIdx) || state.groups.player[fromIdx]?.firedFPThisTurn > 0) {
      alert('このグループはすでに行動したため、今ターンは個人移送できません。');
      return;
    }
    if (window.AFV && (window.AFV.isAfvGroup(state.groups.player[fromIdx]) || (state.fireTarget && window.AFV.isAfvGroup(state.groups.player[state.fireTarget.idx])))) { alert('AFV は他のグループと一緒になれません（§28.11）'); return; }
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
      const lst = dests.map((d, k) => `${k + 1}: GROUP ${groupSlotName(d.idx)}${d.isNew ? '（空いた位置に新しいグループを作る・2名以上）' : ''}`).join('\n');
      const a = prompt(`移送先を番号で選んでください\n${lst}`, '1');
      if (a == null) return;
      dest = dests[parseInt(a, 10) - 1];
      if (!dest) { alert('番号が正しくありません'); return; }
    }
    // 兵士を選ぶ（移動カードの枚数まで）
    const cands = srcGrp.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !c.infiltrating &&
      !c.transfer && !R.isDesignatedCrew(srcGrp, c));
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
    const attempted = withDeckAttack(() => {
      const usedIndices = moveIdxs.slice(0, soldiers.length);
      const usedCards = usedIndices.map(i => state.playerHand[i]);
      usedIndices.sort((a, b) => b - a).forEach(i => pushTerrainToDiscard(state.playerHand.splice(i, 1)[0]));
      const arrivals = troopsAbleToTransfer('player', srcGrp, soldiers, usedCards);
      if (arrivals.length) {
        startTransfer('player', fromIdx, dest, arrivals);
        const missed = soldiers.length - arrivals.length;
        const status = dest.isNew
          ? `GROUP ${groupSlotName(dest.idx)} を設立中（${arrivals.length}名）。地形カードを置くと設立が完了します。`
          : `${arrivals.length}名を GROUP ${groupSlotName(dest.idx)} へ移送中です。次のターン以降に受け取れます。`;
        alert(missed ? status + ` 渡河に失敗した ${missed}名は元のグループに残りました。` : status);
      } else {
        alert('渡河に失敗したため、移送は始まりませんでした。');
      }
      window.DISCARD_RULES?.markActed();
      (state.actedGroups ||= new Set()).add(fromIdx);
      return true;
    });
    if (!attempted) return;
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
    if (window.AFV?.isAfvGroup(tgtGroup)) { alert('車両に対する爆薬は白兵戦で使います（§28.81）'); return; }
    const tgtFacKey = getFactionKey(tgtSide === 'player' ? state.player : state.ai) || 'us';
    const srcIdx = state.fireSource.idx;
    (async () => {
      const result = await window.CC_ACTION.executeDemoCharge(demoCard, srcGrp, 'player', tgtGroup, tgtSide, tgtIdx, ccDrawCard, facKey, tgtFacKey);
      if (!result?.actionUsed) return;
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
  updateConfirmBtn();
  renderField('player'); renderField('ai');
  renderHands();
  updateDecideBtn();
}

// 判定ボタンは射撃のみ有効化（狙撃は確定ボタンで処理）
const ACTIONS_NEED_JUDGE = ['fire', 'mortar'];

function updateDecideBtn() {
  const slot = document.getElementById('judge-slot');
  if (!slot) return;
  const act = state.selectedAction;
  let ok = false;
  if (state.phase === 'play' && state.currentTurn === 'player' && ACTIONS_NEED_JUDGE.includes(act)) {
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
  slot.disabled = !ok;
}

document.getElementById('judge-slot').addEventListener('click', () => {
  const slot = document.getElementById('judge-slot');
  if (!slot.classList.contains('armed')) return;
  if (!playerCanStartAction()) return;
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

