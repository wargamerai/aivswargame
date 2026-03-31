// recovery_expert.js — 回復フェイズExpert
// 混乱ユニットの回復を最大化するための判断
//
// ゲームルール:
//   - 敵隣接 → 回復試行不可
//   - 遮蔽なし＋敵LOS内 → 回復試行不可
//   - ダイス0 → 悪化（D→DD, DD→壊滅）
//   - ダイス ≤ 有効士気 → 回復（DD→D, D→ok）
//   - 有効士気 = 基本士気 + 遮蔽かつ敵LOS外(+1) + モラル指揮官隣接(+1)
//
// 混乱ユニットの行動原則:
//   1. 敵に隣接されない位置へ退避（敵の次ターン移動範囲外）
//   2. オーバーランされない位置へ退避（敵戦車の移動経路上を避ける）
//   3. 上記が無理なら、味方の正常(ok)部隊とスタック
//   4. 遮蔽地形に入る（回復の前提条件 + 士気ボーナス）
//   5. 敵LOS外に移動する（遮蔽なしだと回復不可 + 士気ボーナス）
//   6. モラル指揮官の近くにスタックする（士気+1）
//   7. 離脱路がある位置にいる（退路を確保）
//
// 指揮官は:
//   - モラル能力がある指揮官は後方の混乱部隊の近くに移動する
//   - 混乱部隊とスタックする

var RecoveryExpert = (function() {
  'use strict';

  // ヘクスが回復可能な条件を満たすか判定
  // 戻り: { canRecover, effectiveMorale, reasons[] }
  function canRecoverAt(unit, col, row, board) {
    var reasons = [];
    var hexId = toHexId(col, row);

    // 敵隣接チェック
    var adjEnemy = board.getAdjacentEnemies(col, row);
    if (adjEnemy.length > 0) {
      return { canRecover: false, effectiveMorale: 0, reasons: ['敵隣接'] };
    }

    // 遮蔽+LOSチェック
    var inCover = board.isCoverTerrain(col, row);
    var inLOS = board.isInEnemyFireZone(col, row);

    if (!inCover && inLOS) {
      return { canRecover: false, effectiveMorale: 0, reasons: ['遮蔽なし＋敵LOS内'] };
    }

    // 有効士気計算
    var baseMorale = unit.morale || 5;
    var effectiveMorale = baseMorale;

    if (inCover && !inLOS) {
      effectiveMorale += 1;
      reasons.push('遮蔽+LOS外: +1');
    }

    // 指揮官隣接チェック
    var nearMoraleLeader = testUnits.some(function(l) {
      if (l.type !== 'leader' || l.side !== board.side) return false;
      if (l.status === 'eliminated') return false;
      // モラル能力があるか（'M'能力）
      if (typeof getActiveLeaderForUnit === 'function') {
        // ヘクスが同じか隣接かで判定
        var lDist = hexDistance(l.col, l.row, col, row);
        if (lDist > 1) return false;
        // 能力チェックは簡略化: leaderAbilityに'M'を含むか
        return l.leaderAbility && l.leaderAbility.indexOf('M') >= 0;
      }
      return false;
    });

    if (nearMoraleLeader) {
      effectiveMorale += 1;
      reasons.push('指揮官モラル: +1');
    }

    // 回復確率: ダイス(1-9) <= effectiveMorale (0は悪化)
    var chance = Math.min(9, Math.max(0, effectiveMorale)) / 10;

    reasons.push('回復確率: ' + (chance * 100).toFixed(0) + '%');

    return {
      canRecover: true,
      effectiveMorale: effectiveMorale,
      chance: chance,
      inCover: inCover,
      inLOS: inLOS,
      nearMoraleLeader: nearMoraleLeader,
      reasons: reasons
    };
  }

  // 敵が次ターンにこのヘクスに隣接可能か判定
  // 敵の移動力で到達できる範囲+1ヘクスをチェック
  function canEnemyReachAdjacent(col, row, board) {
    for (var i = 0; i < board.enemyUnits.length; i++) {
      var e = board.enemyUnits[i];
      if (e.status === 'eliminated' || e.status === 'dd') continue;
      var dist = hexDistance(e.col, e.row, col, row);
      var moveRange = e.move || 4;
      // 敵がmoveRange以内にいれば、次ターンに隣接される可能性あり
      if (dist <= moveRange) return true;
    }
    return false;
  }

  // 敵戦車にオーバーランされる危険があるか判定
  // オーバーラン条件: 戦闘隊形の正常ユニット、隣接、移動コスト+2MP
  function canBeOverrun(col, row, board) {
    for (var i = 0; i < board.enemyUnits.length; i++) {
      var e = board.enemyUnits[i];
      if (e.status !== 'ok') continue;
      // 装甲車両のみオーバーラン可能と想定
      var isArmor = e.type === 'tank' || e.type === 'AC' || e.type === 'TD' ||
                    e.type === 'SPG' || e.type === 'SPA' || e.type === 'HT';
      if (!isArmor) continue;
      var dist = hexDistance(e.col, e.row, col, row);
      var moveRange = e.move || 6;
      // 移動範囲内（移動コスト+2でオーバーラン）→ 大まかに移動力-2の範囲
      if (dist <= Math.max(1, moveRange - 2)) return true;
    }
    return false;
  }

  // このヘクスに正常(ok)な味方部隊がいるか
  function hasOkFriendlyAt(hexId, side, excludeUnit) {
    return testUnits.some(function(u) {
      return u.hexId === hexId && u.side === side &&
             u.status === 'ok' && u !== excludeUnit &&
             u.type !== 'dummy' && u.type !== 'leader';
    });
  }

  // 混乱ユニットの最適退避先を探す
  // 条件優先順:
  //   1. 敵に隣接されない（敵移動範囲外）
  //   2. オーバーランされない（敵戦車の到達範囲外）
  //   3. 上記が無理なら、味方の正常部隊とスタック
  //   4. 回復可能（敵非隣接、遮蔽orLOS外）
  //   5. 有効士気が最大（遮蔽+LOS外+指揮官）
  //   6. 離脱路がある
  //   7. 敵から遠い
  function findBestRetreatHex(board, unit) {
    var neighbors = getHexNeighbors(unit.col, unit.row);
    var candidates = [];

    for (var i = 0; i < neighbors.length; i++) {
      var n = neighbors[i];
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;

      var hexId = toHexId(n.col, n.row);
      var terrain = getHexTerrain(hexId);
      if (terrain === 'x' || terrain === 'lake') continue;

      // 敵ヘクス不可
      var hasEnemy = testUnits.some(function(e) {
        return e.hexId === hexId && e.side === board.enemySide &&
               e.status !== 'eliminated' && e.type !== 'dummy';
      });
      if (hasEnemy) continue;

      // スタック上限
      var stackCount = testUnits.filter(function(u) {
        return u.hexId === hexId && u.status !== 'eliminated' &&
               !STACK_EXEMPT_TYPES.includes(u.type) && u !== unit;
      }).length;
      if (stackCount >= 4) continue;

      // 移動コスト確認
      var mc = getMoveCost(unit, unit.col, unit.row, n.col, n.row, 'combat');
      if (mc.cost === Infinity) continue;

      var eval_ = canRecoverAt(unit, n.col, n.row, board);

      // 安全性判定
      var safeFromAdjacent = !canEnemyReachAdjacent(n.col, n.row, board);
      var safeFromOverrun = !canBeOverrun(n.col, n.row, board);
      var hasOkFriendly = hasOkFriendlyAt(hexId, board.side, unit);

      // 離脱路チェック
      var escapeRoutes = 0;
      var nn = getHexNeighbors(n.col, n.row);
      for (var j = 0; j < nn.length; j++) {
        var nn2 = nn[j];
        if (nn2.col < 0 || nn2.col >= MAP_CONFIG.cols || nn2.row < 0 || nn2.row >= MAP_CONFIG.rows) continue;
        var nnHex = toHexId(nn2.col, nn2.row);
        var nnTerrain = getHexTerrain(nnHex);
        if (nnTerrain === 'x' || nnTerrain === 'lake') continue;
        var nnHasEnemy = testUnits.some(function(e) {
          return e.hexId === nnHex && e.side === board.enemySide &&
                 e.status !== 'eliminated' && e.type !== 'dummy';
        });
        if (!nnHasEnemy) escapeRoutes++;
      }

      var enemyDist = board.nearestEnemyDist(n.col, n.row);

      candidates.push({
        col: n.col,
        row: n.row,
        hexId: hexId,
        canRecover: eval_.canRecover,
        effectiveMorale: eval_.effectiveMorale || 0,
        chance: eval_.chance || 0,
        inCover: eval_.inCover || false,
        inLOS: eval_.inLOS || false,
        nearMoraleLeader: eval_.nearMoraleLeader || false,
        safeFromAdjacent: safeFromAdjacent,
        safeFromOverrun: safeFromOverrun,
        hasOkFriendly: hasOkFriendly,
        escapeRoutes: escapeRoutes,
        enemyDist: enemyDist,
        moveCost: mc.cost
      });
    }

    // ソート優先順:
    // 1. 敵に隣接されない
    // 2. オーバーランされない
    // 3. 上記が無理なら味方正常部隊とスタック
    // 4. 回復可能
    // 5. 有効士気高い
    // 6. 離脱路多い
    // 7. 敵から遠い
    candidates.sort(function(a, b) {
      // 安全性が最優先
      if (a.safeFromAdjacent && !b.safeFromAdjacent) return -1;
      if (!a.safeFromAdjacent && b.safeFromAdjacent) return 1;
      if (a.safeFromOverrun && !b.safeFromOverrun) return -1;
      if (!a.safeFromOverrun && b.safeFromOverrun) return 1;
      // 安全でないなら味方正常部隊とスタック
      if (!a.safeFromAdjacent || !a.safeFromOverrun) {
        if (a.hasOkFriendly && !b.hasOkFriendly) return -1;
        if (!a.hasOkFriendly && b.hasOkFriendly) return 1;
      }
      // 回復条件
      if (a.canRecover && !b.canRecover) return -1;
      if (!a.canRecover && b.canRecover) return 1;
      if (a.effectiveMorale !== b.effectiveMorale) return b.effectiveMorale - a.effectiveMorale;
      if (a.escapeRoutes !== b.escapeRoutes) return b.escapeRoutes - a.escapeRoutes;
      return b.enemyDist - a.enemyDist;
    });

    return candidates.length > 0 ? candidates[0] : null;
  }

  // モラル指揮官の最適移動先を探す
  // 混乱部隊がいる場所、またはその近くの遮蔽地形
  function findLeaderDestination(board, leader) {
    // モラル能力チェック
    if (!leader.leaderAbility || leader.leaderAbility.indexOf('M') < 0) {
      return null; // モラル能力なし
    }

    // 混乱部隊の位置を収集
    var disruptedPositions = [];
    for (var i = 0; i < board.disruptedFriendly.length; i++) {
      var u = board.disruptedFriendly[i];
      if (u.status === 'eliminated') continue;
      disruptedPositions.push({ col: u.col, row: u.row, hexId: u.hexId });
    }

    if (disruptedPositions.length === 0) return null;

    // 指揮官の移動範囲内で、混乱部隊に隣接できるヘクス
    var neighbors = getHexNeighbors(leader.col, leader.row);
    var candidates = [];

    // 現在位置も候補
    var currentDisrupted = board.disruptedFriendly.filter(function(u) {
      return hexDistance(u.col, u.row, leader.col, leader.row) <= 1 && u.status !== 'eliminated';
    });
    if (currentDisrupted.length > 0) {
      candidates.push({
        col: leader.col, row: leader.row,
        disruptedNearby: currentDisrupted.length,
        stay: true
      });
    }

    for (var i = 0; i < neighbors.length; i++) {
      var n = neighbors[i];
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;

      var hexId = toHexId(n.col, n.row);
      var terrain = getHexTerrain(hexId);
      if (terrain === 'x' || terrain === 'lake') continue;

      var hasEnemy = testUnits.some(function(e) {
        return e.hexId === hexId && e.side === board.enemySide &&
               e.status !== 'eliminated' && e.type !== 'dummy';
      });
      if (hasEnemy) continue;

      // このヘクスから隣接する混乱部隊の数
      var nearbyDisrupted = 0;
      for (var j = 0; j < disruptedPositions.length; j++) {
        var dp = disruptedPositions[j];
        if (hexDistance(n.col, n.row, dp.col, dp.row) <= 1) nearbyDisrupted++;
      }

      if (nearbyDisrupted > 0) {
        var inLOS = board.isInEnemyFireZone(n.col, n.row);
        candidates.push({
          col: n.col, row: n.row,
          disruptedNearby: nearbyDisrupted,
          inLOS: inLOS,
          stay: false
        });
      }
    }

    // 混乱部隊が多い位置優先、LOS外優先
    candidates.sort(function(a, b) {
      if (a.disruptedNearby !== b.disruptedNearby) return b.disruptedNearby - a.disruptedNearby;
      if (a.inLOS && !b.inLOS) return 1;
      if (!a.inLOS && b.inLOS) return -1;
      return 0;
    });

    return candidates.length > 0 ? candidates[0] : null;
  }

  // メイン分析: 全混乱ユニットと指揮官の行動指示を生成
  // 戻り: {
  //   disrupted: [{unit, action:'retreat'|'stay', destination, reason}],
  //   leaders: [{leader, action:'move'|'stay', destination, reason}]
  // }
  function analyze(board) {
    var disruptedOrders = [];
    var leaderOrders = [];

    // 混乱ユニットの分析
    for (var i = 0; i < board.disruptedFriendly.length; i++) {
      var u = board.disruptedFriendly[i];
      if (u.status === 'eliminated') continue;

      var currentEval = canRecoverAt(u, u.col, u.row, board);

      if (currentEval.canRecover && currentEval.inCover && !currentEval.inLOS) {
        // 現在位置が最良 → 動かない
        disruptedOrders.push({
          unit: u,
          action: 'stay',
          destination: null,
          currentChance: currentEval.chance,
          reason: '現在位置で回復可能（' + currentEval.reasons.join(', ') + '）'
        });
      } else {
        // 退避先を探す
        var retreat = findBestRetreatHex(board, u);
        if (retreat && retreat.canRecover &&
            (retreat.effectiveMorale > (currentEval.effectiveMorale || 0) || !currentEval.canRecover)) {
          disruptedOrders.push({
            unit: u,
            action: 'retreat',
            destination: retreat,
            currentChance: currentEval.chance || 0,
            newChance: retreat.chance,
            reason: !currentEval.canRecover
              ? '現在位置で回復不可 → 退避'
              : '退避先の方が回復条件が良い'
          });
        } else if (currentEval.canRecover) {
          disruptedOrders.push({
            unit: u,
            action: 'stay',
            destination: null,
            currentChance: currentEval.chance,
            reason: '退避先が見つからない/現在位置で回復試行'
          });
        } else {
          // 回復不可、退避先もない
          disruptedOrders.push({
            unit: u,
            action: retreat ? 'retreat' : 'stay',
            destination: retreat,
            currentChance: 0,
            reason: '回復不可（' + (currentEval.reasons ? currentEval.reasons.join(', ') : '') + '）'
          });
        }
      }
    }

    // 指揮官の分析
    var leaders = testUnits.filter(function(u) {
      return u.type === 'leader' && u.side === board.side && u.status !== 'eliminated';
    });

    for (var i = 0; i < leaders.length; i++) {
      var leader = leaders[i];
      var dest = findLeaderDestination(board, leader);
      if (dest && !dest.stay) {
        leaderOrders.push({
          leader: leader,
          action: 'move',
          destination: dest,
          reason: '混乱部隊' + dest.disruptedNearby + '個に隣接可能'
        });
      } else if (dest && dest.stay) {
        leaderOrders.push({
          leader: leader,
          action: 'stay',
          destination: null,
          reason: '現在位置で混乱部隊' + dest.disruptedNearby + '個に隣接中'
        });
      }
    }

    return {
      disrupted: disruptedOrders,
      leaders: leaderOrders
    };
  }

  return {
    canRecoverAt: canRecoverAt,
    findBestRetreatHex: findBestRetreatHex,
    findLeaderDestination: findLeaderDestination,
    analyze: analyze
  };
})();

if (typeof module !== 'undefined') module.exports = RecoveryExpert;
