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
  };

  let actedThisTurn = false;
  let discardedThisTurn = 0;

  function getFactionKey() {
    const factions = global.FACTIONS;
    const player = global.state && global.state.player;
    if (!factions || !player) return null;
    return Object.keys(factions).find(function (k) { return factions[k] === player; });
  }

  function getMaxDiscard() {
    const key = getFactionKey();
    if (!key || !DISCARD_LIMITS[key]) return 0;
    const limits = DISCARD_LIMITS[key];
    return actedThisTurn ? limits.withAction : limits.withoutAction;
  }

  function execute() {
    const s = global.state;
    if (!s || s.phase !== 'play' || s.currentTurn !== 'player') return;
    if (s.selectedHand.size === 0) return;

    const max = getMaxDiscard();
    const remaining = max - discardedThisTurn;
    if (remaining <= 0) {
      alert('このターンの捨て札上限に達しています');
      return;
    }

    const indices = Array.from(s.selectedHand).sort(function (a, b) { return b - a; });
    const count = Math.min(indices.length, remaining);
    for (let i = 0; i < count; i++) {
      s.playerHand.splice(indices[i], 1);
      discardedThisTurn++;
    }
    if (count < indices.length) {
      alert('国籍ルールにより' + count + '枚のみ捨て札しました');
    }

    s.selectedHand.clear();
    s.selectedAction = null;
    s.fireSource = null;
    s.fireTarget = null;
    document.querySelectorAll('.action-btn').forEach(function (b) { b.classList.remove('active'); });
    if (global.renderHands) global.renderHands();
    if (global.updateConfirmBtn) global.updateConfirmBtn();
    if (global.updateDecideBtn) global.updateDecideBtn();
  }

  function markActed() { actedThisTurn = true; }
  function resetTurn() { actedThisTurn = false; discardedThisTurn = 0; }

  global.DISCARD_RULES = {
    execute: execute,
    markActed: markActed,
    resetTurn: resetTurn,
    getMaxDiscard: getMaxDiscard,
  };
})(typeof window !== 'undefined' ? window : this);
