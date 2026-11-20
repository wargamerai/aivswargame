/* 捨て札処理 (discard.js)
 * §4.3 国籍別ルール:
 *   ドイツ: アクション有無に関わらず 1枚
 *   アメリカ: アクション無しのターンに 2枚まで
 *   ソ連: アクション無しのターンに 何枚でも
 */
(function (global) {
  'use strict';

  const DISCARD_LIMITS = {
    ger: { withAction: 1, withoutAction: 1 },
    us:  { withAction: 0, withoutAction: 2 },
    rus: { withAction: 0, withoutAction: Infinity },
    jpn: { withAction: 0, withoutAction: 2 },     // §45.1 Line/2nd Line: 未行動時2枚 (精鋭は1行動時2枚)
    uk:  { withAction: 0, withoutAction: 2 },     // §44.1 Line: 未行動時2枚（アクション後は不可、独のみ唯一同時可）
    ita: { withAction: 0, withoutAction: 2 },
    fra: { withAction: 0, withoutAction: 1 },
  };

  let actionCount = 0;
  let discardedThisTurn = 0;
  let entrenchments = 0;
  let freeDiscards = 0;
  let volksCowerDiscarded = false;

  function getFactionKey() {
    const factions = global.FACTIONS;
    const player = global.state && global.state.player;
    if (!factions || !player) return null;
    return Object.keys(factions).find(function (k) { return factions[k] === player; });
  }

  function turnLimit(key, actions) {
    const troopType = global.troopTypeOf?.(key);
    if (troopType === 'conscripts') return actions === 0 ? 2 : 0;
    if (troopType === 'green') return actions === 0 ? 1 : 0;
    if (troopType === 'blackshirts') return Number(actions === 0);
    if (troopType === 'legionnaires') return Number(actions <= 1);
    if (global.isEditorEliteFaction?.(key)) {
      if (key === 'ger' || key === 'rus' || key === 'jpn') return actions <= 1 ? 2 : 0;
      if (key === 'us' || key === 'uk') return actions === 0 ? 2 : Number(actions === 1);
    }
    const unitType = global.state?.britishUnitType ?? global.state?.scenario?.britishUnitType;
    if (key === 'uk' && unitType === 'airborne') return actions === 0 ? 2 : Number(actions === 1);
    if (key === 'uk' && unitType === 'home-guard') return Number(actions === 0);
    const limits = DISCARD_LIMITS[key];
    return limits ? (actions ? limits.withAction : limits.withoutAction) : 0;
  }

  function getMaxDiscard() {
    const limit = turnLimit(getFactionKey(), actionCount);
    if (entrenchments === 0) return limit;
    return limit === Infinity ? discardedThisTurn + Math.max(0, global.state.playerHand.length - entrenchments) :
      Math.max(0, limit - entrenchments);
  }

  // §45.12 日本軍の非機能カードは、通常の捨て札枠を使わない。
  function isFreeDiscard(card) {
    return getFactionKey() === 'jpn' && global.handCardIsCower(card, 'player');
  }

  function discardCardAllowed(card, side) {
    if (!card) return false;
    const faction = side === 'player' ? getFactionKey() : global.getFactionKey(global.state.ai);
    if (global.troopTypeOf?.(faction) !== 'volksgrenadiers') return true;
    const acted = side === 'player' ? actionCount : global.state.aiActionCount || global.state.aiActedThisTurn;
    return !acted || !global.handCardIsCower(card, side);
  }

  function revealVolksDiscard(side, card) {
    const faction = global.getFactionKey(global.state[side]);
    if (global.troopTypeOf?.(faction) !== 'volksgrenadiers') return;
    global.ufReportLog?.(side, `§39.5 捨て札公開 — ${card.id || card.terrain?.type}`, side);
  }

  function execute() {
    const s = global.state;
    if (!s || s.phase !== 'play' || s.currentTurn !== 'player') return;
    if (s.selectedHand.size === 0) return;

    const sel = Array.from(s.selectedHand);
    let remaining = getRemainingDiscard();
    const indices = sel.sort((a, b) => b - a);
    let count = 0;
    for (const index of indices) {
      const card = s.playerHand[index];
      if (!discardCardAllowed(card, 'player')) continue;
      const free = isFreeDiscard(card);
      if (!free && remaining <= 0) continue;
      if (global.troopTypeOf?.(getFactionKey()) === 'volksgrenadiers' && global.handCardIsCower(card, 'player')) {
        volksCowerDiscarded = true;
      }
      s.playerHand.splice(index, 1);
      global.pushTerrainToDiscard(card);
      revealVolksDiscard('player', card);
      if (free) freeDiscards++;
      else { discardedThisTurn++; remaining--; }
      count++;
    }
    if (!count) {
      alert('このターンに残っている捨て札はありません');
      return;
    }
    if (count < indices.length) alert('国籍ルールにより' + count + '枚のみ捨て札しました');

    s.selectedHand.clear();
    s.selectedAction = null;
    s.fireSource = null;
    s.fireTarget = null;
    document.querySelectorAll('.action-btn').forEach(function (b) { b.classList.remove('active'); });
    if (global.renderHands) global.renderHands();
    if (global.updateConfirmBtn) global.updateConfirmBtn();
    if (global.updateDecideBtn) global.updateDecideBtn();
  }

  function markActed() { actionCount++; }
  function markEntrenchment() {
    if (getFactionKey() === 'rus') entrenchments++;
    else markActed();
  }
  function canEntrench() {
    if (getFactionKey() !== 'rus') return canStillAct();
    if (global.afvSmokeActionUsed?.('player')) return false;
    if (discardedThisTurn === 0) return true;
    const limit = turnLimit('rus', actionCount);
    return limit === Infinity ? global.state.playerHand.length > entrenchments :
      discardedThisTurn <= limit - entrenchments - 1;
  }
  /** §7.3 捨て札の代わりに相手へ地形を置いた: 捨て札1枚分を使う */
  function consume(n) { discardedThisTurn += (n || 1); }
  /** §4.3/§14.1 このターンの捨て札（狙撃・相手への地形配置を含む）の後でもアクションできるか
   *  （米・ソ・日・英は捨て札をしたターンにアクション不可、独は1枚までなら可） */
  function canStillAct(actions = 1) {
    if (global.afvSmokeActionUsed?.('player') || volksCowerDiscarded) return false;
    const key = getFactionKey();
    if (!key || !DISCARD_LIMITS[key]) return true;
    return discardedThisTurn <= Math.max(0, turnLimit(key, actionCount + actions) - entrenchments);
  }
  /** §4.6 このターンにアクションか捨て札をしたか */
  function didAnything() { return actionCount + discardedThisTurn + entrenchments + freeDiscards > 0; }
  function resetTurn() {
    actionCount = 0;
    discardedThisTurn = 0;
    entrenchments = 0;
    freeDiscards = 0;
    volksCowerDiscarded = false;
  }

  /** このターンまだ捨てられる枚数（米: 未行動で最大2／行動後0、ソ: 未行動は無制限／行動後0） */
  function getRemainingDiscard() {
    const max = getMaxDiscard();
    if (max === Infinity) return Infinity;
    return Math.max(0, max - discardedThisTurn);
  }

  /** 途中セーブ・ロード用: このターンの行動・捨て札の状態 */
  function getState() { return { actedThisTurn: actionCount + entrenchments > 0, actionCount, discardedThisTurn, entrenchments, freeDiscards, volksCowerDiscarded }; }
  function setState(st) {
    actionCount = st?.actionCount ?? Number(Boolean(st?.actedThisTurn));
    discardedThisTurn = st?.discardedThisTurn || 0;
    entrenchments = st?.entrenchments || 0;
    freeDiscards = st?.freeDiscards || 0;
    volksCowerDiscarded = Boolean(st?.volksCowerDiscarded);
  }

  global.DISCARD_RULES = {
    getState: getState,
    setState: setState,
    execute: execute,
    isFreeDiscard: isFreeDiscard,
    discardCardAllowed: discardCardAllowed,
    revealVolksDiscard: revealVolksDiscard,
    markActed: markActed,
    markEntrenchment: markEntrenchment,
    canEntrench: canEntrench,
    consume: consume,
    didAnything: didAnything,
    canStillAct: canStillAct,
    resetTurn: resetTurn,
    getMaxDiscard: getMaxDiscard,
    turnLimit: turnLimit,
    getRemainingDiscard: getRemainingDiscard,
  };
})(typeof window !== 'undefined' ? window : this);
