// uf_ai3.js — 手札を回す AI（ユーザーの指示 2026-11-05）。「やることは単純。結局手札をいかにまわすかだ。基本は近づいてうつ」
//   グループごとの段階: 火力が基準（fireAt）未満=近づく / 基準以上=撃つ / 相対距離5=白兵戦。基準は対戦で決めた（10より4が強い）
//   手札が揃っていなければ捨てて入れ替え、揃ったら行動する。夜間・守備・シナリオE はこれまでの AI のまま
(function (global) {
  'use strict';
  const P = global.UF_AI3_P = Object.assign({ fireAt: 4, fireReady: 1, moveNeedsTerrain: false, keepValue: 3, minDiscard: 2, fireAlways: true, misc: true, trench: false }, global.UF_AI3_P || {});
  const GOOD = ['WOODS', 'BUILDINGS', 'BRUSH', 'HILL', 'WALL', 'GULLY'];
  const HARASS = ['WIRE', 'STREAM', 'MARSH', 'MINEFIELD'];
  const oldTurn = global.aiTurn, oldWants = global.aiGroupWantsAdvance;
  const log = global.__ai3Log = {};

  function sideOn() {
    const s = global.UF_AI3_SIDE;
    if (s === undefined) return true; // 通常の対戦はこの AI。対戦の検証の時だけ sim/run.js が側を指定する
    const sw = !!(global.__sim && global.__sim.swapped);
    return s === 'both' || (s === 'p1' && sw) || (s === 'p2' && !sw);
  }
  function applies() {
    const st = global.state;
    if (!sideOn() || st.isNight) return false;
    if (st.scenario && st.scenario.id === 'E') return false;
    return !(st.groups.ai || []).some(g => g && g._role === 'hold');
  }
  const R = () => global.INFANTRY_RULES;
  const alive = g => g && !g.eliminated && g.cards.some(c => R().isAlive(c));
  const type = c => (c && c.terrain && String(c.terrain.type)) || '';
  const isFire = c => type(c).indexOf('FIRE') === 0;
  const needOf = c => { const m = (c.terrain.sub || '').match(/FP(.)/); return global.circledToNum((m && m[1]) || ''); };
  const isCower = c => { const SH = global.SCENARIO_HELPERS; return !!(SH && SH.isCardDisabledAsTerrain && SH.isCardDisabledAsTerrain(global.state.scenario, c, global.state.aiRole === 'attacker')); };
  const isSniper = c => { const m = (c && c.terrain && c.terrain.modifier) || ''; return m.indexOf('KIA') >= 0 || m.indexOf('PIN') >= 0; };

  /** グループの段階: close=相対距離5 / fire=火力が基準以上 / move=近づく */
  function stageOf(g, i) {
    const r = R(), key = global.getFactionKey(global.state.ai);
    const { closest } = global.aiGroupFireNow(g, i);
    const fp = r.calcGroupFirepower(g, key, closest, { moving: false, crewMap: global.buildCrewMapFromPairs(g) });
    return { stage: closest >= 5 ? 'close' : fp >= P.fireAt ? 'fire' : 'move', closest, fp };
  }
  function stages() {
    return (global.state.groups.ai || []).map((g, i) => (alive(g) ? Object.assign({ i, g }, stageOf(g, i)) : null)).filter(Boolean);
  }
  function value(c, ss) {
    const ty = type(c), r = R();
    if (isCower(c)) return 0;
    if (ty === 'HERO') return 6;
    const hasFire = ss.some(s => s.stage === 'fire' || s.stage === 'close'), hasMove = ss.some(s => s.stage === 'move');
    if (isFire(c)) {
      const maxFP = Math.max(0, ...ss.map(s => s.fp));
      if (needOf(c) > maxFP) return 0;
      const strength = parseInt(ty.replace('FIRE ', ''), 10) || 1;
      return (hasFire ? 3 : 1) + Math.min(3, strength / 2);
    }
    if (ty === 'MOVEMENT') {
      const stuck = ss.some(s => r.hasTerrainType(s.g, 'WIRE') || r.hasTerrainType(s.g, 'MINEFIELD') || (r.isInStream(s.g) && !r.hasCrossedStream(s.g)));
      return hasMove || stuck ? 4 : 0.5;
    }
    if (ty.indexOf('RALLY') === 0) return ss.some(s => s.g.cards.some(k => r.isAlive(k) && r.isPinned(k))) ? 4 : 0.5;
    if (ty === 'CONCEALED') return hasFire ? 3 : 2;
    if (GOOD.indexOf(ty) >= 0) return hasMove || ss.some(s => global.aiIsGroupMoving(s.g)) ? 3 : 1;
    if (HARASS.indexOf(ty) >= 0) return 3;
    if (ty === 'SMOKE') return 1.5;
    if (isSniper(c)) return 0.3;
    return 1;
  }
  function fireCardsUsable(ss) {
    const hero = global.state.aiHand.some(c => type(c) === 'HERO');
    return global.state.aiHand.filter(isFire).filter(c => ss.some(s => s.stage !== 'move' && needOf(c) <= s.fp + (hero ? 2 : 0))).length;
  }
  function canAdvance(s) {
    const r = R();
    if (s.stage !== 'move' || !global.aiGroupWantsAdvance(s.g, s.i)) return false;
    return !s.g.cards.some(c => r.isPinned(c)) && !r.hasTerrainType(s.g, 'WIRE');
  }
  function ready(ss) {
    const hand = global.state.aiHand;
    const fire = fireCardsUsable(ss) >= P.fireReady;
    const hasM = hand.some(c => type(c) === 'MOVEMENT');
    const hasT = hand.some(c => GOOD.indexOf(type(c)) >= 0 && !isCower(c));
    const move = hasM && ss.some(canAdvance) && (!P.moveNeedsTerrain || hasT || hand.filter(c => type(c) === 'MOVEMENT').length >= 2);
    return { fire, move };
  }
  function record(key, ss, acted, discards) {
    const hand = global.state.aiHand;
    const main = ss.some(s => s.stage === 'close') ? 'close' : ss.some(s => s.stage === 'fire') ? 'fire' : 'move';
    const score = hand.reduce((t, c) => t + value(c, ss), 0);
    (log[key] = log[key] || []).push([global.state.turnCount || 0, main, Math.round(score * 10) / 10, acted ? 1 : 0, discards, hand.length]);
  }

  async function turn3() {
    const st = global.state, key = global.getFactionKey(st.ai);
    st.aiActedGroups = new Set(); st.aiFiredGroups = new Set();
    st.aiActedThisTurn = false; st.aiActionCount = 0; st.aiDiscardedThisTurn = 0; st.aiDumpedThisTurn = false;
    global.checkWoundEndurance();
    await global.aiEnterReinforcements();
    await global.aiUseRadio();
    await global.aiUseOrdnance();
    const S = {
      ownTerrain: async () => (await global.aiTryPlaceOwnTerrain()) || (await global.aiTryPlaceOwnPlain()),
      rally: global.aiTryRally, fireMoving: global.aiTryFireMovingEnemy, mortar: global.aiTryMortar,
      mine: async () => (await global.aiTryMineRemove()) || (await global.aiTryMineLateral()),
      cross: global.aiTryCrossStream, wire: global.aiTryRemoveWire, repair: global.aiTryRepair, crew: global.aiTryCrewSetup,
      weapon: global.aiTryPickupWeapon, receive: global.aiTryReceiveTransfer, loner: global.aiTryTransferLoner,
      cc: async () => await global.aiTryBanzai() || global.aiTryCC(), infiltrate: global.aiTryInfiltrate, ccRetreat: global.aiTryRetreatFromCC, uninfiltrate: global.aiTryUninfiltrate,
      flameFire: global.aiTryFlameFire, demoInfil: () => global.aiTryInfiltrate({ demoOnly: true }),
      fireAny: global.aiTryFireAny, flank: global.aiTryFlankEncircle, smoke: global.aiTryPlaceOwnSmoke, move: global.aiTryMove, trench: global.aiTryTrench,
      guard: global.aiTryGuardChange, heroWound: global.aiTryHeroWound, shift: global.aiTryGroupShift,
    };
    const run = async keys => {
      let n = 0, safety = 30;
      outer: while (st.phase === 'play' && safety-- > 0 && global.partisanActionRoom('ai')) {
        for (const k of keys) {
          const previousActions = st.aiActionCount;
          const r = await S[k]();
          if (!r) continue;
          n++;
          if ((k === 'rally' || k === 'heroWound') && r === 'hero') continue outer;
          if (k === 'move' && key === 'jpn') continue outer;
          if (st.aiActionCount === previousActions) global.markAIAction();
          continue outer;
        }
        break;
      }
      return n;
    };
    await global.aiTrySniperCheck();
    if (!global.aiVehicleGullyAvailable() || key === 'ger') {
      // まず、札の揃い具合に関係なくやること
      await run(['weapon', 'receive', 'loner', 'ccRetreat', 'uninfiltrate', 'flameFire', 'demoInfil', 'heroWound', 'cc', 'infiltrate', 'rally', 'cross', 'wire', 'mine', 'fireMoving', 'ownTerrain']);
      const ss = stages(), rd = ready(ss);
      // 撃てるなら撃ち、動ける札が揃っていれば動く。どちらもできなければ、このターンは捨てて手札を入れ替える
      const anyFireStage = ss.some(x => x.stage !== 'move');
      const keys = [];
      if (anyFireStage || P.fireAlways) keys.push('flank', 'mortar', 'fireAny');
      if (rd.move || key === 'jpn') keys.push('smoke', 'shift', 'move');
      keys.push('ownTerrain');
      if (P.misc) keys.push('guard', 'repair', 'crew');
      await run(keys);
      if (!st.aiActedThisTurn && key === 'ger') await run(['move']);
      if (st.aiActedThisTurn && P.trench) await run(['trench']);
    }
    if (st.phase !== 'play') return;
    st.aiDiscardTurn = !st.aiActedThisTurn;
    // 捨て札: 足止めの地形 → 狙撃 → 手札の整理
    while (global.aiRemainingDiscard() > 0 && await global.aiTryPlaceBadTerrain()) { /* 置ける限り */ }
    while (global.aiRemainingDiscard() > 0 && await global.aiTrySnipe()) { st.aiSnipedThisTurn = true; }
    let discards = 0;
    if (key === 'jpn') {
      for (let i = st.aiHand.length - 1; i >= 0; i--) if (isCower(st.aiHand[i]) && !global.aiProtectRally(i, key)) { global.pushTerrainToDiscard(st.aiHand.splice(i, 1)[0]); discards++; }
    }
    const ss2 = stages(), dumped = [];
    while (global.aiRemainingDiscard() - dumped.length > 0 && st.aiHand.length > 0) {
      let bi = -1, bv = Infinity;
      st.aiHand.forEach((c, i) => {
        if (global.aiProtectRally(i, key)) return;
        const v = value(c, ss2);
        if (v < bv) { bv = v; bi = i; }
      });
      if (bi < 0) break;
      // 行動しなかったターンは必ず入れ替える（手札を回す）。あとは残したい札まで捨てない
      if (bv >= P.keepValue && dumped.length >= P.minDiscard) break;
      if (type(st.aiHand[bi]) === 'HERO') break;
      const c = st.aiHand.splice(bi, 1)[0];
      global.pushTerrainToDiscard(c); dumped.push(c); st.aiDumpedThisTurn = true;
    }
    discards += dumped.length;
    st.aiHandCount = st.aiHand.length;
    global.renderHands();
    if (dumped.length) await global.showAIAction('AI: 捨て札 ' + dumped.length + '枚', dumped);
    try { record(key, ss2, st.aiActedThisTurn, discards); } catch (e) { /* 記録だけ */ }
    global.endAITurn();
  }

  global.aiGroupWantsAdvance = function (g, i) {
    if (!applies()) return oldWants(g, i);
    if (g._role === 'hold') return false;
    if (global.aiStrikeNeedsPillbox(g, i)) return true;
    const s = stageOf(g, i);
    if (s.stage === 'close') return false;
    if (global.aiGroupHasUsableFlame(g) || global.aiGroupHasDemo(g)) return true;
    return s.stage === 'move';
  };
  global.aiTurn = async function () {
    const st = global.state;
    if (st.phase !== 'play' || st.currentTurn !== 'ai') return;
    if (!R() || !applies()) return oldTurn();
    return turn3();
  };
  global.AI3 = { stageOf, stages, value, ready, P };
})(typeof window !== 'undefined' ? window : this);
