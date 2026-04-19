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

    // §45.12 日本軍: 相手に見せたcower/非機能カードは行動/捨て札制限に影響せず自由に捨て札可能
    const key = getFactionKey();
    const SH = global.SCENARIO_HELPERS;
    const sel = Array.from(s.selectedHand);
    const allCower = (key === 'jpn' && SH && SH.isCardDisabledAsTerrain) && sel.every(i => {
      const c = s.playerHand[i];
      return c && SH.isCardDisabledAsTerrain(s.scenario, c);
    });

    const max = getMaxDiscard();
    const remaining = max === Infinity ? Infinity : (max - discardedThisTurn);
    if (!allCower && remaining <= 0) {
      alert(actedThisTurn
        ? 'アクション後は捨て札できません（米・ソ §4.3）'
        : 'このターンの捨て札上限に達しています');
      return;
    }

    const indices = sel.sort(function (a, b) { return b - a; });
    const count = allCower ? indices.length : Math.min(indices.length, remaining);
    for (let i = 0; i < count; i++) {
      const idx = indices[i];
      const card = s.playerHand[idx];
      if (!card) continue;
      s.playerHand.splice(idx, 1);
      if (global.pushTerrainToDiscard) global.pushTerrainToDiscard(card);
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

  /** このターンまだ捨てられる枚数（米: 未行動で最大2／行動後0、ソ: 未行動は無制限／行動後0） */
  function getRemainingDiscard() {
    const max = getMaxDiscard();
    if (max === Infinity) return Infinity;
    return Math.max(0, max - discardedThisTurn);
  }

  global.DISCARD_RULES = {
    execute: execute,
    markActed: markActed,
    resetTurn: resetTurn,
    getMaxDiscard: getMaxDiscard,
    getRemainingDiscard: getRemainingDiscard,
  };
})(typeof window !== 'undefined' ? window : this);
