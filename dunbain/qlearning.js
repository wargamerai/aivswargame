/**
 * ダンバイン Qテーブル学習（状態: シナリオ・陣営・位置関係・距離・向き合わせ・オーラ・パワー・射撃連続不可・現位置で格闘/射撃可否・前回攻撃結果）
 * 行動: 突撃 / 格闘 / 射撃（AI計画時）
 * localStorage: dunbain_qtable_v3
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'dunbain_qtable_v3';
  var GAMMA = 0.92;
  var DEFAULT_EPSILON = 0.12;
  /** プレイ時の探索率（ブレンド方策用・学習時より低めでもよい） */
  var DEFAULT_PLAY_EPSILON = 0.07;

  var table = {};
  var totalVisits = 0;
  var loaded = false;

  function recountTotalVisits() {
    var t = 0;
    for (var s in table) {
      if (!Object.prototype.hasOwnProperty.call(table, s)) continue;
      var row = table[s];
      for (var a in row) {
        if (Object.prototype.hasOwnProperty.call(row, a) && row[a] && row[a].n) t += row[a].n;
      }
    }
    totalVisits = t;
  }

  function load() {
    if (loaded) return;
    loaded = true;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.table && typeof o.table === 'object') table = o.table;
        if (o && typeof o.totalVisits === 'number' && o.totalVisits >= 0) totalVisits = o.totalVisits;
        else recountTotalVisits();
      }
    } catch (e) {
      table = {};
      totalVisits = 0;
    }
  }

  function save() {
    recountTotalVisits();
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          v: 3,
          updatedAt: new Date().toISOString(),
          totalVisits: totalVisits,
          table: table,
        })
      );
    } catch (e) { /* quota */ }
  }

  function getEpsilon() {
    var v = parseFloat(localStorage.getItem('dunbain_ql_epsilon') || '');
    if (!isFinite(v) || v < 0 || v > 1) return DEFAULT_EPSILON;
    return v;
  }

  function getPlayEpsilon() {
    var v = parseFloat(localStorage.getItem('dunbain_ql_play_epsilon') || '');
    if (!isFinite(v) || v < 0 || v > 1) return DEFAULT_PLAY_EPSILON;
    return v;
  }

  /** Qの更新（観戦・明示ON・キャンペーンで qlLearnPlayerSide 時は人間操作側も） */
  function isEnabled() {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('dunbain_ql') === '0') return false;
    if (typeof global.spectatorMode !== 'undefined' && global.spectatorMode) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('dunbain_ql') === '1') return true;
    if (global.scenario && global.scenario.qlLearnPlayerSide) return true;
    return false;
  }

  function skipQlForUnit(unit) {
    if (!unit) return true;
    if (typeof global.isPlayerUnit !== 'function') return false;
    if (!global.isPlayerUnit(unit)) return false;
    return !(global.scenario && global.scenario.qlLearnPlayerSide);
  }

  /**
   * 保存済みQを対戦AIに反映するか（学習の有無と独立。既定ON）
   * localStorage dunbain_ql_blend === '0' で無効
   */
  function isBlendEnabled() {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('dunbain_ql_blend') === '0') return false;
    return true;
  }

  function stateActionVisitsSum(stateKey, legalActions) {
    var t = 0;
    for (var i = 0; i < legalActions.length; i++) {
      t += getCell(stateKey, legalActions[i]).n || 0;
    }
    return t;
  }

  /**
   * データが少ないほどヒューリスティック優先、蓄積に応じてQを徐々に効かせる（0〜1）
   */
  function computeTrust(stateKey, legalActions) {
    load();
    var sN = stateActionVisitsSum(stateKey, legalActions);
    var stateTrust = 1 - Math.exp(-sN / 5.5);
    var gN = totalVisits || 0;
    var globalTrust = 1 - Math.exp(-gN / 90);
    return Math.min(1, stateTrust * 0.72 + globalTrust * 0.28);
  }

  function pickActionGreedy(stateKey, legalActions) {
    if (!legalActions || !legalActions.length) return null;
    var bestA = legalActions[0];
    var bestQ = getCell(stateKey, bestA).q;
    for (var i = 1; i < legalActions.length; i++) {
      var a = legalActions[i];
      var q = getCell(stateKey, a).q;
      if (q > bestQ) {
        bestQ = q;
        bestA = a;
      } else if (q === bestQ && Math.random() < 0.5) {
        bestA = a;
      }
    }
    return bestA;
  }

  /**
   * @param {string} heuristicAction 従来AIの選択（必ず legalActions に含まれること）
   */
  function pickActionBlended(stateKey, legalActions, heuristicAction, playEpsilon) {
    load();
    if (!legalActions || !legalActions.length) return null;
    if (playEpsilon == null) playEpsilon = getPlayEpsilon();
    if (Math.random() < playEpsilon) {
      return legalActions[Math.floor(Math.random() * legalActions.length)];
    }
    var trust = computeTrust(stateKey, legalActions);
    if (Math.random() > trust) return heuristicAction;
    return pickActionGreedy(stateKey, legalActions);
  }

  function aspectCode(enemy, unit) {
    if (!enemy || enemy.dir == null || typeof enemy.dir !== 'number' || !unit) return 'u';
    if (typeof global.getAttackDirection !== 'function') return 'u';
    var s = global.getAttackDirection(enemy, unit);
    if (s === '正面') return 'F';
    if (s === '右側面') return 'R';
    if (s === '左側面') return 'L';
    if (s === '後面') return 'B';
    return 'u';
  }

  function distanceBucket(d) {
    if (d <= 1) return 0;
    if (d <= 3) return 1;
    if (d <= 5) return 2;
    return 3;
  }

  /** 自機の向きが敵方向と何ステップずれているか（0=最良） */
  function facingBucket(unit, ex, ey) {
    if (!unit || typeof global.bestFaceDirToward !== 'function' || typeof global.hexDistance !== 'function') return 0;
    if (global.hexDistance(unit.x, unit.y, ex, ey) === 0) return 0;
    var ideal = global.bestFaceDirToward(unit.x, unit.y, ex, ey);
    var d = unit.dir;
    var cw = (ideal - d + 6) % 6;
    var ccw = (d - ideal + 6) % 6;
    var steps = Math.min(cw, ccw);
    if (steps <= 1) return steps;
    return 2;
  }

  /**
   * 現在マス・現在向きでの状態（計画直前）
   * @param {object} unit
   * @param {object|null} focusEnemy 主要参照敵（nearest または射撃・格闘の焦点）
   */
  function encodeState(unit, focusEnemy) {
    var sid = global.scenario && global.scenario.id ? global.scenario.id : 'na';
    var asp = 'u';
    var distB = 0;
    var fb = 0;
    if (focusEnemy) {
      asp = aspectCode(focusEnemy, unit);
      distB = distanceBucket(global.hexDistance(unit.x, unit.y, focusEnemy.x, focusEnemy.y));
      fb = facingBucket(unit, focusEnemy.x, focusEnemy.y);
    }
    var auraB = Math.min(3, Math.floor((unit.currentAura || 0) / 3));
    var pow = String(unit.effectivePower || 'e').toLowerCase().charAt(0);
    var rb = unit.previousDeclaredAction === '射撃' ? 1 : 0;
    var canM = 0;
    var canS = 0;
    if (global.units && typeof global.aiCanMeleeFromPosition === 'function' && typeof global.aiCanRangedHitFrom === 'function') {
      var g0 = Object.assign({}, unit);
      for (var i = 0; i < global.units.length; i++) {
        var e = global.units[i];
        if (!e || e.team === unit.team || e.status !== 'alive') continue;
        if (global.aiCanMeleeFromPosition(g0, e)) {
          canM = 1;
          break;
        }
      }
      for (var j = 0; j < global.units.length; j++) {
        var e2 = global.units[j];
        if (!e2 || e2.team === unit.team || e2.status !== 'alive') continue;
        if (global.aiCanRangedHitFrom(g0, e2)) {
          canS = 1;
          break;
        }
      }
    }
    var last = unit._qlLastOutcome || 'n';
    return (
      sid +
      '|' +
      unit.team +
      '|' +
      asp +
      '|d' +
      distB +
      '|f' +
      fb +
      '|a' +
      auraB +
      '|p' +
      pow +
      '|rb' +
      rb +
      '|m' +
      canM +
      '|s' +
      canS +
      '|o' +
      last
    );
  }

  function getCell(s, a) {
    if (!table[s]) table[s] = {};
    if (!table[s][a]) table[s][a] = { q: 0, n: 0 };
    return table[s][a];
  }

  function maxQState(s, legalActions) {
    if (!legalActions || !legalActions.length) return 0;
    var best = -Infinity;
    for (var i = 0; i < legalActions.length; i++) {
      var c = getCell(s, legalActions[i]);
      if (c.q > best) best = c.q;
    }
    return best === -Infinity ? 0 : best;
  }

  function pickAction(stateKey, legalActions, epsilon) {
    if (!legalActions || !legalActions.length) return null;
    if (Math.random() < epsilon) return legalActions[Math.floor(Math.random() * legalActions.length)];
    var bestA = legalActions[0];
    var bestQ = getCell(stateKey, bestA).q;
    for (var i = 1; i < legalActions.length; i++) {
      var a = legalActions[i];
      var q = getCell(stateKey, a).q;
      if (q > bestQ) {
        bestQ = q;
        bestA = a;
      }
    }
    return bestA;
  }

  function updateQ(stateKey, action, reward, nextStateKey, nextLegalActions, terminal) {
    load();
    var cell = getCell(stateKey, action);
    cell.n += 1;
    totalVisits += 1;
    var alpha = 1 / (1 + cell.n);
    var maxNext = terminal ? 0 : maxQState(nextStateKey, nextLegalActions);
    var td = reward + GAMMA * maxNext - cell.q;
    cell.q += alpha * td;
    save();
  }

  function nearestEnemyFor(unit) {
    if (!global.units || typeof global.hexDistance !== 'function') return null;
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < global.units.length; i++) {
      var e = global.units[i];
      if (!e || e.team === unit.team || e.status !== 'alive') continue;
      var d = global.hexDistance(unit.x, unit.y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** 前ターンの計画に対する更新（今ターン計画直前の位置・オーラで次状態を符号化） */
  function onAiPlanStart(unit, legalActionNames) {
    load();
    if (!isEnabled()) {
      delete unit._qlPending;
      unit._qlRewardAccum = 0;
      return;
    }
    if (skipQlForUnit(unit)) return;
    var pend = unit._qlPending;
    if (pend && pend.s && pend.a) {
      var sNext = encodeState(unit, nearestEnemyFor(unit));
      updateQ(pend.s, pend.a, unit._qlRewardAccum || 0, sNext, legalActionNames, false);
    }
    unit._qlRewardAccum = 0;
    unit._qlPending = null;
  }

  function setPending(unit, stateKey, action) {
    unit._qlPending = { s: stateKey, a: action };
  }

  function addReward(unit, delta) {
    if (!unit) return;
    unit._qlRewardAccum = (unit._qlRewardAccum || 0) + delta;
  }

  function registerCombatOutcome(attacker, target, dmgResult) {
    if (!isEnabled() || !attacker || skipQlForUnit(attacker)) return;
    if (dmgResult === 'n') {
      attacker._qlLastOutcome = 'z';
      addReward(attacker, 0.15);
      return;
    }
    if (dmgResult === 'e') {
      attacker._qlLastOutcome = 'k';
      addReward(attacker, 18);
      return;
    }
    var dmg = parseInt(dmgResult, 10) || 0;
    if (dmg > 0) {
      attacker._qlLastOutcome = 'd';
      addReward(attacker, 1.2 * dmg);
    }
  }

  function registerMiss(attacker) {
    if (!isEnabled() || !attacker || skipQlForUnit(attacker)) return;
    attacker._qlLastOutcome = 'm';
    addReward(attacker, -0.35);
  }

  function registerNoShot(attacker) {
    if (!isEnabled() || !attacker || skipQlForUnit(attacker)) return;
    addReward(attacker, -0.08);
  }

  function terminalUpdates(winnerTeam) {
    load();
    if (!isEnabled() || !global.units) return;
    for (var i = 0; i < global.units.length; i++) {
      var u = global.units[i];
      if (!u || skipQlForUnit(u)) continue;
      var pend = u._qlPending;
      if (!pend || !pend.s || !pend.a) continue;
      var r = (u._qlRewardAccum || 0) + (winnerTeam && u.team === winnerTeam ? 42 : winnerTeam ? -42 : 0);
      var cell = getCell(pend.s, pend.a);
      cell.n += 1;
      totalVisits += 1;
      var alpha = 1 / (1 + cell.n);
      cell.q += alpha * (r - cell.q);
      u._qlPending = null;
      u._qlRewardAccum = 0;
    }
    save();
  }

  function resetUnitLearningScratch(unit) {
    delete unit._qlPending;
    delete unit._qlRewardAccum;
    delete unit._qlLastOutcome;
  }

  global.DunbainQL = {
    STORAGE_KEY: STORAGE_KEY,
    isEnabled: isEnabled,
    isLearningEnabled: isEnabled,
    isBlendEnabled: isBlendEnabled,
    getEpsilon: getEpsilon,
    getPlayEpsilon: getPlayEpsilon,
    encodeState: encodeState,
    pickAction: pickAction,
    pickActionBlended: pickActionBlended,
    computeTrust: computeTrust,
    getTotalVisits: function () {
      load();
      recountTotalVisits();
      return totalVisits;
    },
    onAiPlanStart: onAiPlanStart,
    setPending: setPending,
    registerCombatOutcome: registerCombatOutcome,
    registerMiss: registerMiss,
    registerNoShot: registerNoShot,
    terminalUpdates: terminalUpdates,
    resetUnitLearningScratch: resetUnitLearningScratch,
    load: load,
    save: save,
    _getTableSize: function () {
      load();
      var n = 0;
      for (var s in table) if (Object.prototype.hasOwnProperty.call(table, s)) n += Object.keys(table[s]).length;
      return n;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
