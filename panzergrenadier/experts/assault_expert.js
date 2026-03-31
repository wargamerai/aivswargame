// assault_expert.js — 突撃フェイズExpert
//
// ゲームルール:
//   - 近接攻撃力(closeAtk) vs 近接防御力(closeDef) の比率で結果判定
//   - 攻撃側D/DDは即壊滅(13-3-(1))
//   - 防御側Dはモラルチェック → 失敗でDD → 戦闘不参加
//   - 防御側全員DDなら自動壊滅(13-3-(3))
//   - 地形修正あり（防御側有利）
//   - 工兵修正あり
//   - A能力指揮官: 攻撃側+1/防御側-1
//   - R能力指揮官: 隣接からも指揮可能 → 複数ヘクスから共同突撃
//
// AI判断基準:
//   - 基本5:1以上でしかける
//   - A能力指揮官を有効活用（スタックさせて+1修正）
//   - R能力指揮官がいれば複数ヘクスから共同突撃
//   - 混乱(D)部隊は突撃に参加すると壊滅するのでカウントしない
//   - 防御側のD部隊もモラルチェック失敗でDD→戦闘不参加になるのでカウントしない

var AssaultExpert = (function() {
  'use strict';

  // 攻撃側の有効近接攻撃力を計算（ok部隊のみ、D/DDは壊滅するので除外）
  function calcEffectiveAtkPower(stack) {
    var power = 0;
    for (var i = 0; i < stack.length; i++) {
      var u = stack[i];
      if (u.status !== 'ok') continue; // D/DDは突撃参加で壊滅
      if (u.type === 'dummy' || u.type === 'leader') continue;
      power += u.closeAtk || 0;
    }
    return power;
  }

  // 防御側の有効近接防御力を計算（ok部隊のみ、D部隊はモラルチェック失敗でDD→不参加の可能性が高い）
  function calcEffectiveDefPower(enemies, enemyHexId) {
    var power = 0;
    for (var i = 0; i < enemies.length; i++) {
      var u = enemies[i];
      if (u.status === 'dd' || u.status === 'eliminated') continue; // DD=戦闘不参加
      if (u.status === 'd') continue; // D=モラルチェック失敗でDDになる可能性が高い→カウントしない
      if (u.type === 'dummy' || u.type === 'leader') continue;
      power += u.closeDef || 0;
    }

    // 地形修正
    var terrain = getHexTerrain(enemyHexId);
    var tmod = typeof TERRAIN_MODIFIERS !== 'undefined' && TERRAIN_MODIFIERS[terrain] ?
               TERRAIN_MODIFIERS[terrain].assault || 0 : 0;
    // 地形修正は防御側有利（負の値 = 防御側にダイス修正）なので防御力として扱う
    // ただし実際はダイス修正。大まかに1修正≈防御力2として換算
    // ここでは比率判定だけなので地形修正は考慮しない（別途evaluateで使う）

    return power;
  }

  // A能力指揮官がスタックまたは隣接にいるか
  function hasAssaultLeader(hexId, side) {
    // 同一ヘクスの指揮官
    var leader = testUnits.find(function(u) {
      return u.hexId === hexId && u.type === 'leader' && u.side === side &&
             u.status !== 'eliminated' &&
             u.abilities && u.abilities.indexOf('A') >= 0;
    });
    if (leader) return { leader: leader, sameHex: true };

    // R能力+A能力の隣接指揮官
    var pos = fromHexId(hexId);
    var neighbors = getHexNeighbors(pos.col, pos.row);
    for (var i = 0; i < neighbors.length; i++) {
      var nHex = toHexId(neighbors[i].col, neighbors[i].row);
      var nLeader = testUnits.find(function(u) {
        return u.hexId === nHex && u.type === 'leader' && u.side === side &&
               u.status !== 'eliminated' &&
               u.abilities && u.abilities.indexOf('A') >= 0 &&
               u.abilities.indexOf('R') >= 0;
      });
      if (nLeader) return { leader: nLeader, sameHex: false };
    }
    return null;
  }

  // R能力指揮官がいるか（共同突撃の調整役）
  function hasRangedLeader(side) {
    return testUnits.some(function(u) {
      return u.type === 'leader' && u.side === side && u.status !== 'eliminated' &&
             u.abilities && u.abilities.indexOf('R') >= 0;
    });
  }

  // 突撃すべきか判定
  // 条件: 有効攻撃力/有効防御力 >= 5.0
  //        防御側全員DD → 常に突撃
  //        A指揮官ボーナスを加味
  function shouldAssault(stack, enemyHexId, side) {
    var enemySide = side === 'german' ? 'allied' : 'german';

    var enemies = testUnits.filter(function(u) {
      return u.hexId === enemyHexId && u.side === enemySide &&
             u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader';
    });
    if (enemies.length === 0) return { assault: false, reason: '敵なし' };

    // 防御側の有効戦力チェック（ok部隊のみ）
    var activeEnemies = enemies.filter(function(u) {
      return u.status === 'ok';
    });
    if (activeEnemies.length === 0) {
      // 全員D/DD → D部隊はモラルチェック失敗でDD→全滅の可能性が高い
      return { assault: true, reason: '防御側に正常部隊なし（自動壊滅の可能性大）', ratio: Infinity };
    }

    var atkPower = calcEffectiveAtkPower(stack);
    if (atkPower <= 0) return { assault: false, reason: '攻撃力なし' };

    var defPower = calcEffectiveDefPower(enemies, enemyHexId);
    if (defPower <= 0) {
      return { assault: true, reason: '防御力0', ratio: Infinity };
    }

    var ratio = atkPower / defPower;

    // A指揮官ボーナス（ダイス+1相当）
    var atkLeaderInfo = hasAssaultLeader(stack[0].hexId, side);
    var hasALeader = !!atkLeaderInfo;

    // 地形修正
    var terrain = getHexTerrain(enemyHexId);
    var terrainMod = typeof TERRAIN_MODIFIERS !== 'undefined' && TERRAIN_MODIFIERS[terrain] ?
                     TERRAIN_MODIFIERS[terrain].assault || 0 : 0;

    // 基本5:1以上
    var threshold = 5.0;

    // A指揮官がいれば+1修正分、やや低い比率でもOK（4:1まで許容）
    if (hasALeader) threshold = 4.0;

    // 町/市街地は地形修正がきつい → より高い比率が必要
    if (terrainMod <= -2) threshold += 1.0;

    if (ratio >= threshold) {
      return {
        assault: true,
        reason: '比率' + ratio.toFixed(1) + ':1 (閾値' + threshold + ':1' +
                (hasALeader ? ', A指揮官あり' : '') + ')',
        ratio: ratio,
        hasALeader: hasALeader
      };
    }

    return {
      assault: false,
      reason: '比率' + ratio.toFixed(1) + ':1 < 閾値' + threshold + ':1',
      ratio: ratio
    };
  }

  // 共同突撃: R指揮官がいる場合、複数ヘクスから同一目標に突撃
  // 隣接する複数の味方スタックの攻撃力を合算して判定
  function evaluateCoordinatedAssault(enemyHexId, side, board) {
    var enemySide = side === 'german' ? 'allied' : 'german';

    var enemies = testUnits.filter(function(u) {
      return u.hexId === enemyHexId && u.side === enemySide &&
             u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader';
    });
    if (enemies.length === 0) return null;

    var ePos = fromHexId(enemyHexId);
    var neighbors = getHexNeighbors(ePos.col, ePos.row);

    // 隣接する味方スタックを収集
    var adjacentStacks = [];
    var totalAtkPower = 0;

    for (var i = 0; i < neighbors.length; i++) {
      var nHex = toHexId(neighbors[i].col, neighbors[i].row);
      var friendlies = testUnits.filter(function(u) {
        return u.hexId === nHex && u.side === side && u.status === 'ok' &&
               u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'A' && u.type !== 'AT';
      });
      if (friendlies.length > 0) {
        var stackPower = 0;
        friendlies.forEach(function(u) { stackPower += u.closeAtk || 0; });
        adjacentStacks.push({
          hexId: nHex,
          units: friendlies,
          power: stackPower
        });
        totalAtkPower += stackPower;
      }
    }

    if (adjacentStacks.length < 2) return null; // 共同突撃は2スタック以上

    var defPower = calcEffectiveDefPower(enemies, enemyHexId);
    if (defPower <= 0) defPower = 1;
    var ratio = totalAtkPower / defPower;

    // R指揮官チェック
    var rLeader = null;
    testUnits.forEach(function(u) {
      if (u.type === 'leader' && u.side === side && u.status !== 'eliminated' &&
          u.abilities && u.abilities.indexOf('R') >= 0) {
        // 敵ヘクスから距離2以内にいるか
        var dist = hexDistance(u.col, u.row, ePos.col, ePos.row);
        if (dist <= 2) rLeader = u;
      }
    });

    if (!rLeader) return null; // R指揮官なしでは共同突撃不可

    // A能力もあれば+1修正
    var hasA = rLeader.abilities && rLeader.abilities.indexOf('A') >= 0;
    var threshold = hasA ? 4.0 : 5.0;

    return {
      targetHex: enemyHexId,
      enemies: enemies,
      adjacentStacks: adjacentStacks,
      totalAtkPower: totalAtkPower,
      defPower: defPower,
      ratio: ratio,
      rLeader: rLeader,
      hasABonus: hasA,
      shouldAssault: ratio >= threshold,
      reason: '共同突撃: ' + adjacentStacks.length + 'スタック, ' +
              '攻' + totalAtkPower + ' vs 防' + defPower + ' = ' + ratio.toFixed(1) + ':1' +
              (hasA ? ' (A指揮官+1)' : '') +
              ' R指揮官: ' + rLeader.name
    };
  }

  // メイン分析: 突撃判断を生成
  // 戻り: {
  //   assaults: [{stack, enemyHexId, ratio, reason}],
  //   coordinatedAssaults: [{targetHex, adjacentStacks, rLeader, ratio, reason}]
  // }
  function analyze(side, board) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var assaults = [];
    var coordinatedAssaults = [];

    // ヘクスごとにスタックを収集
    var hexGroups = {};
    testUnits.forEach(function(u) {
      if (u.side !== side || u.status === 'eliminated') return;
      if (u.type === 'dummy' || u.type === 'leader' || u.type === 'AT' || u.type === 'A') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      if (!hexGroups[hid]) hexGroups[hid] = [];
      hexGroups[hid].push(u);
    });

    // R指揮官がいれば共同突撃をまず検討
    if (hasRangedLeader(side)) {
      // 敵ヘクスを収集
      var enemyHexes = {};
      testUnits.forEach(function(u) {
        if (u.side !== enemySide || u.status === 'eliminated' ||
            u.type === 'dummy' || u.type === 'leader') return;
        var hid = u.hexId || toHexId(u.col, u.row);
        enemyHexes[hid] = true;
      });

      for (var eHex in enemyHexes) {
        var coordResult = evaluateCoordinatedAssault(eHex, side, board);
        if (coordResult && coordResult.shouldAssault) {
          coordinatedAssaults.push(coordResult);
        }
      }
    }

    // 共同突撃に参加しないスタックで通常突撃を検討
    var coordinatedUnits = {};
    coordinatedAssaults.forEach(function(ca) {
      ca.adjacentStacks.forEach(function(s) {
        s.units.forEach(function(u) {
          coordinatedUnits[u.name || u.id] = true;
        });
      });
    });

    for (var hid in hexGroups) {
      var stack = hexGroups[hid].filter(function(u) {
        return !coordinatedUnits[u.name || u.id];
      });
      if (stack.length === 0) continue;

      var pos = fromHexId(hid);
      var neighbors = getHexNeighbors(pos.col, pos.row);

      for (var i = 0; i < neighbors.length; i++) {
        var enemyHexId = toHexId(neighbors[i].col, neighbors[i].row);
        var result = shouldAssault(stack, enemyHexId, side);
        if (result.assault) {
          assaults.push({
            stack: stack,
            stackHex: hid,
            enemyHexId: enemyHexId,
            ratio: result.ratio,
            hasALeader: result.hasALeader,
            reason: result.reason
          });
          break; // 1スタック1回のみ
        }
      }
    }

    return {
      assaults: assaults,
      coordinatedAssaults: coordinatedAssaults
    };
  }

  return {
    calcEffectiveAtkPower: calcEffectiveAtkPower,
    calcEffectiveDefPower: calcEffectiveDefPower,
    hasAssaultLeader: hasAssaultLeader,
    hasRangedLeader: hasRangedLeader,
    shouldAssault: shouldAssault,
    evaluateCoordinatedAssault: evaluateCoordinatedAssault,
    analyze: analyze
  };
})();

if (typeof module !== 'undefined') module.exports = AssaultExpert;
