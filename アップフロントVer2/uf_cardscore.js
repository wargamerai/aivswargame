// uf_cardscore.js — カードさばきの点数（ユーザーの指示 2026-11-04）
// いいカードに点をつけ、手番の終わりの手札の合計を、ゲームを通じて累計する。
// 捨て札やアクションで手札を回すほど、累計は積み上がる。勝敗との関係を調べ、捨てるカードの選び方にも使える
(function (global) {
  'use strict';
  const DEF = { fireLow: 1, fireMid: 2, fireHigh: 4, move: 2, rally: 1.5, hero: 5, conceal: 2, goodTerrain: 2, harass: 3, smoke: 1.5, sniper: 0.5, cower: 0, moveNeed: 2, rallyNeed: 2, fireUseless: 0, moveAt5: 0.2, rallyIdle: 0.5 };
  const V = global.UF_CARD_WEIGHTS = Object.assign({}, DEF, global.UF_CARD_WEIGHTS || {});
  const S = global.__cardScore = {};
  const cnt = k => S[k] || (S[k] = { sum: 0, turns: 0, actions: 0, discards: 0, handSize: 0 });
  function strengthOf(t) { const m = String(t.type).match(/FIRE\s*(\d+)/) || String(t.sub || '').match(/FP(\d)/); if (m) return +m[1]; return parseInt(t.range, 10) || 1; }
  function value(card, ctx) {
    const t = card && card.terrain; if (!t) return 0;
    const ty = String(t.type);
    if (ctx && ctx.isCower && ctx.isCower(card)) return V.cower;
    if (ty.indexOf('FIRE') === 0) {
      const m = String(t.sub || '').match(/FP(.)/), need = m && global.circledToNum ? global.circledToNum(m[1]) : (parseInt(t.range, 10) || 1);
      if (ctx && ctx.maxFP != null && need > ctx.maxFP) return V.fireUseless;
      const s = strengthOf(t); return s >= 4 ? V.fireHigh : s >= 2 ? V.fireMid : V.fireLow;
    }
    if (ty === 'MOVEMENT') return ctx && ctx.at5 && !ctx.needMove ? V.moveAt5 : V.move + (ctx && ctx.needMove ? V.moveNeed : 0);
    if (ty.indexOf('RALLY') === 0) return ctx && ctx.pinned ? V.rally + V.rallyNeed : V.rallyIdle;
    if (ty === 'HERO') return V.hero;
    if (ty === 'CONCEALED') return V.conceal;
    if (['WOODS', 'BUILDINGS', 'BRUSH', 'HILL', 'WALL', 'GULLY'].indexOf(ty) >= 0) return V.goodTerrain;
    if (['WIRE', 'STREAM', 'MARSH', 'MINEFIELD'].indexOf(ty) >= 0) return V.harass;
    if (ty === 'SMOKE') return V.smoke;
    return V.sniper;
  }
  function ctxNow() {
    const R = global.INFANTRY_RULES;
    const gs = (global.state.groups.ai || []).filter(g => g && !g.eliminated);
    // 今の局面で本当に使えるか（使えないカードは点が低い）
    let maxFP = 0, at5 = gs.length > 0;
    try {
      const k = global.getFactionKey(global.state.ai);
      gs.forEach(src => { let any5 = false; (global.state.groups.player || []).forEach(t => { if (!t || t.eliminated) return; const d = R.relativeRange(src.distance, t.distance); if (d >= 5) any5 = true; maxFP = Math.max(maxFP, R.calcGroupFirepower(src, k, d, { moving: false, crewMap: global.buildCrewMapFromPairs(src) })); }); if (!any5) at5 = false; });
    } catch (e) { maxFP = 99; }
    return { maxFP, at5, pinned: !!R && gs.some(g => g.cards.some(c => R.isPinned(c))), needMove: !!R && gs.some(g => R.hasTerrainType && (R.hasTerrainType(g, 'WIRE') || R.hasTerrainType(g, 'MINEFIELD'))), isCower: c => { const SH = global.SCENARIO_HELPERS; return SH && SH.isCardDisabledAsTerrain && SH.isCardDisabledAsTerrain(global.state.scenario, c, global.state.aiRole === 'attacker'); } };
  }
  function wire() {
    if (typeof global.endAITurn === 'function' && !global.endAITurn._cs) {
      const o = global.endAITurn;
      global.endAITurn = function () {
        try {
          const f = global.getFactionKey(global.state.ai), c = cnt(f), ctx = ctxNow();
          c.sum += global.state.aiHand.reduce((t, k) => t + value(k, ctx), 0); c.turns++; c.handSize += global.state.aiHand.length;
          if (global.state.aiActedThisTurn) c.actions++; if (global.state.aiDumpedThisTurn) c.discards++;
        } catch (e) {}
        return o.apply(this, arguments);
      };
      global.endAITurn._cs = true;
    }
    // 点数の低いカードから捨てる（実験用: UF_VALUE_FACTION の国だけ）
    if (typeof global.aiDiscardChooser === 'function' && !global.aiDiscardChooser._cs) {
      const o = global.aiDiscardChooser;
      global.aiDiscardChooser = function () {
        const pick0 = o();
        if (!global.UF_VALUE_FACTION || global.getFactionKey(global.state.ai) !== global.UF_VALUE_FACTION) return pick0;
        return function () {
          const ctx = ctxNow(); let bi = -1, bv = 1e9;
          global.state.aiHand.forEach((c, i) => { const v = value(c, ctx); if (v < bv) { bv = v; bi = i; } });
          return { idx: bi, junk: bv < V.hero };
        };
      };
      global.aiDiscardChooser._cs = true;
    }
  }
  global.CARD_SCORE = { value, wire, DEF };
  wire();
})(typeof window !== 'undefined' ? window : this);
