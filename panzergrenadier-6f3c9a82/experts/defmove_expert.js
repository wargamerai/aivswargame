// defmove_expert.js — 後攻移動フェイズExpert
//
// 防御側の再配置:
//   - 突破ヘクスと敵の間に位置する（阻止線）
//   - 敵から離れるよう移動する
//   - 混乱部隊は突破ヘクスと敵の間でより安全な遮蔽地形へ
//   - 敵に攻撃されない経路を優先する

var DefMoveExpert = (function() {
  'use strict';

  // 突破ヘクスの中心
  function getBreakthroughCenter() {
    if (typeof S3_BREAKTHROUGH_COL !== 'undefined') {
      return { col: S3_BREAKTHROUGH_COL, row: S3_BREAKTHROUGH_ROW };
    }
    return { col: 1, row: 5 };
  }

  // 敵の先頭位置（最も突破ヘクスに近い敵）
  function getEnemyFrontPosition(side) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var bt = getBreakthroughCenter();
    var bestDist = Infinity;
    var bestPos = null;

    testUnits.forEach(function(u) {
      if (u.side !== enemySide || u.status === 'eliminated' ||
          u.type === 'dummy' || u.type === 'leader') return;
      var dist = hexDistance(u.col, u.row, bt.col, bt.row);
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = { col: u.col, row: u.row };
      }
    });

    return bestPos || bt;
  }

  // このヘクスが突破ヘクスと敵先頭の間にあるか
  // 間 = 突破ヘクスよりも敵に近く、敵よりも突破ヘクスに近い
  function isBetweenBreakthroughAndEnemy(col, row, bt, enemyFront) {
    var distToBT = hexDistance(col, row, bt.col, bt.row);
    var distToEnemy = hexDistance(col, row, enemyFront.col, enemyFront.row);
    var enemyDistToBT = hexDistance(enemyFront.col, enemyFront.row, bt.col, bt.row);

    // 突破ヘクスと敵の間: 自分から突破ヘクスまでの距離 < 敵から突破ヘクスまでの距離
    // かつ自分から敵までの距離 > 0
    return distToBT < enemyDistToBT && distToEnemy > 0;
  }

  // 経路上で敵に攻撃されるヘクス数を数える
  function countThreatenedHexesOnPath(path, side) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var threatened = 0;

    for (var i = 0; i < path.length; i++) {
      var p = path[i];
      var isUnderFire = testUnits.some(function(e) {
        if (e.side !== enemySide || e.status === 'eliminated') return false;
        if (e.type === 'dummy' || e.type === 'leader') return false;
        if ((e.fpAT || 0) + (e.fpSoft || 0) <= 0) return false;
        var dist = hexDistance(e.col, e.row, p.col, p.row);
        return dist > 0 && dist <= (e.range || 1) && hasLOS(e.col, e.row, p.col, p.row);
      });
      if (isUnderFire) threatened++;
    }

    return threatened;
  }

  // 突破ヘクスへの道路上にあるか（道路を塞ぐ位置か）
  function isOnRoadToBreakthrough(col, row, bt) {
    var hexId = toHexId(col, row);
    // このヘクスが道路上にあるか
    if (typeof ROAD_MAP === 'undefined' || !ROAD_MAP) return false;
    if (!ROAD_MAP[hexId]) return false;
    // 突破ヘクスに向かう道路上か（大まかに: 突破ヘクスに近づく方向の道路）
    var distToBT = hexDistance(col, row, bt.col, bt.row);
    return distToBT <= 8; // 突破ヘクスから8ヘクス以内の道路
  }

  // この位置からLOSが通る敵ヘクス数を数える（広範囲LOS）
  function countLOSCoverage(col, row, side) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var visionRange = (typeof G !== 'undefined' && G.visionRange) || 12;
    var count = 0;
    var checkedHex = {};

    testUnits.forEach(function(u) {
      if (u.side !== enemySide || u.status === 'eliminated') return;
      if (u.type === 'dummy' || u.type === 'leader') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      if (checkedHex[hid]) return;
      checkedHex[hid] = true;

      var dist = hexDistance(col, row, u.col, u.row);
      if (dist > 0 && dist <= visionRange && hasLOS(col, row, u.col, u.row)) {
        count++;
      }
    });

    return count;
  }

  // 候補ヘクスの評価
  function evaluateDefPosition(col, row, unit, board, bt, enemyFront) {
    var side = board.side;
    var hexId = toHexId(col, row);

    // 突破ヘクスと敵の間にあるか
    var between = isBetweenBreakthroughAndEnemy(col, row, bt, enemyFront);

    // 敵からの距離
    var enemyDist = board.nearestEnemyDist(col, row);

    // 遮蔽地形か
    var inCover = board.isCoverTerrain(col, row);

    // 敵のLOS+射程内か
    var inEnemyFire = board.isInEnemyFireZone(col, row);

    // 敵隣接か
    var adjEnemy = board.getAdjacentEnemies(col, row);

    // 突破ヘクスまでの距離
    var distToBT = hexDistance(col, row, bt.col, bt.row);

    // 道路封鎖位置か
    var onRoad = isOnRoadToBreakthrough(col, row, bt);

    // LOSカバー範囲（見渡せる敵ヘクス数）
    var losCoverage = countLOSCoverage(col, row, side);

    return {
      col: col,
      row: row,
      hexId: hexId,
      between: between,
      enemyDist: enemyDist,
      inCover: inCover,
      inEnemyFire: inEnemyFire,
      adjEnemy: adjEnemy.length,
      distToBT: distToBT,
      onRoad: onRoad,
      losCoverage: losCoverage
    };
  }

  // BFSで移動範囲内の候補を列挙し、最良の防御位置を返す
  function findBestDefPosition(unit, board, mp, isDisrupted) {
    var side = board.side;
    var bt = getBreakthroughCenter();
    var enemyFront = getEnemyFrontPosition(side);
    var startCol = unit.col;
    var startRow = unit.row;
    var startHex = toHexId(startCol, startRow);

    // BFS
    var visited = {};
    visited[startHex] = { cost: 0, col: startCol, row: startRow, parent: null };
    var queue = [{ col: startCol, row: startRow, cost: 0 }];
    var reachable = [];

    while (queue.length > 0) {
      var current = queue.shift();
      var neighbors = getHexNeighbors(current.col, current.row);

      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;

        var nHex = toHexId(n.col, n.row);
        var terrain = getHexTerrain(nHex);
        if (terrain === 'x' || terrain === 'lake') continue;

        // 敵ヘクス不可
        var hasEnemy = testUnits.some(function(e) {
          return e.hexId === nHex && e.side !== side &&
                 e.status !== 'eliminated' && e.type !== 'dummy';
        });
        if (hasEnemy) continue;

        var mc = getMoveCost(unit, current.col, current.row, n.col, n.row, 'combat');
        if (mc.cost === Infinity) continue;

        var totalCost = current.cost + mc.cost;
        if (totalCost > mp) continue;

        // 敵に攻撃される経路は避ける（BFSのコストに加算）
        var underFire = testUnits.some(function(e) {
          if (e.side === side || e.status === 'eliminated') return false;
          if (e.type === 'dummy' || e.type === 'leader') return false;
          if ((e.fpAT || 0) + (e.fpSoft || 0) <= 0) return false;
          var dist = hexDistance(e.col, e.row, n.col, n.row);
          return dist > 0 && dist <= (e.range || 1) && hasLOS(e.col, e.row, n.col, n.row);
        });
        // 敵射程内のヘクスはコスト+2として扱う（安全経路を優先）
        var effectiveCost = totalCost + (underFire ? 2 : 0);

        if (!visited[nHex] || visited[nHex].cost > effectiveCost) {
          visited[nHex] = { cost: effectiveCost, col: n.col, row: n.row, parent: toHexId(current.col, current.row) };
          queue.push({ col: n.col, row: n.row, cost: totalCost }); // 実コストでキュー

          // スタック上限
          var stackCount = testUnits.filter(function(u) {
            return u.hexId === nHex && u.status !== 'eliminated' &&
                   !STACK_EXEMPT_TYPES.includes(u.type) && u !== unit;
          }).length;
          if (stackCount < 4) {
            reachable.push({ col: n.col, row: n.row, hexId: nHex });
          }
        }
      }
    }

    if (reachable.length === 0) return null;

    // 各候補を評価
    var candidates = [];
    for (var j = 0; j < reachable.length; j++) {
      var r = reachable[j];
      var eval_ = evaluateDefPosition(r.col, r.row, unit, board, bt, enemyFront);
      candidates.push(eval_);
    }

    if (isDisrupted) {
      // 混乱部隊: 突破ヘクスと敵の間 + 安全 + 遮蔽地形
      candidates.sort(function(a, b) {
        // 敵隣接は絶対回避
        if (a.adjEnemy === 0 && b.adjEnemy > 0) return -1;
        if (a.adjEnemy > 0 && b.adjEnemy === 0) return 1;
        // 敵射程外を優先
        if (!a.inEnemyFire && b.inEnemyFire) return -1;
        if (a.inEnemyFire && !b.inEnemyFire) return 1;
        // 遮蔽地形を優先
        if (a.inCover && !b.inCover) return -1;
        if (!a.inCover && b.inCover) return 1;
        // 突破ヘクスと敵の間にいることを優先
        if (a.between && !b.between) return -1;
        if (!a.between && b.between) return 1;
        // 敵から遠い方を優先
        return b.enemyDist - a.enemyDist;
      });
    } else {
      // 正常部隊: 道路封鎖 + 突破ヘクスと敵の間 + LOS広い + 敵から離れる
      candidates.sort(function(a, b) {
        // 敵隣接は回避
        if (a.adjEnemy === 0 && b.adjEnemy > 0) return -1;
        if (a.adjEnemy > 0 && b.adjEnemy === 0) return 1;
        // 突破ヘクスへの道路を塞ぐ位置を優先
        if (a.onRoad && !b.onRoad) return -1;
        if (!a.onRoad && b.onRoad) return 1;
        // 突破ヘクスと敵の間にいることを優先
        if (a.between && !b.between) return -1;
        if (!a.between && b.between) return 1;
        // より広範囲なLOSがとれる地形を優先
        if (a.losCoverage !== b.losCoverage) return b.losCoverage - a.losCoverage;
        // 敵から離れる
        if (a.enemyDist !== b.enemyDist) return b.enemyDist - a.enemyDist;
        // 遮蔽地形を優先
        if (a.inCover && !b.inCover) return -1;
        if (!a.inCover && b.inCover) return 1;
        // 敵射程外を優先
        if (!a.inEnemyFire && b.inEnemyFire) return -1;
        if (a.inEnemyFire && !b.inEnemyFire) return 1;
        return 0;
      });
    }

    // 現在位置より良い候補がなければ移動しない
    var currentEval = evaluateDefPosition(startCol, startRow, unit, board, bt, enemyFront);
    var best = candidates[0];

    if (isDisrupted) {
      // 混乱: 現在位置が安全なら動かない
      if (!currentEval.inEnemyFire && currentEval.inCover && currentEval.adjEnemy === 0) {
        return null;
      }
    } else {
      // 正常: 現在位置が間にあって敵から十分遠ければ動かない
      if (currentEval.between && currentEval.enemyDist >= 3 && currentEval.adjEnemy === 0) {
        return null;
      }
    }

    // パス構築
    var path = [];
    var cur = best.hexId;
    while (cur && cur !== startHex) {
      var v = visited[cur];
      if (!v) break;
      path.unshift({ col: v.col, row: v.row });
      cur = v.parent;
    }

    return {
      destination: best,
      path: path
    };
  }

  // メイン分析: 後攻移動の指示を生成
  // 戻り: {
  //   moves: [{unit, destination, path, reason}]
  // }
  function analyze(board) {
    var orders = [];
    var bt = getBreakthroughCenter();
    var enemyFront = getEnemyFrontPosition(board.side);

    var friendlyUnits = board.friendlyUnits || [];
    for (var i = 0; i < friendlyUnits.length; i++) {
      var u = friendlyUnits[i];
      if (u.status === 'eliminated') continue;
      if (u.type === 'dummy' || u.type === 'leader') continue;
      if (u.moveComplete) continue;

      var mp = u.move != null ? u.move : 0;
      if (mp <= 0) continue;

      var isDisrupted = u.status === 'd' || u.status === 'dd';

      var result = findBestDefPosition(u, board, mp, isDisrupted);
      if (!result) continue;

      var dest = result.destination;
      orders.push({
        unit: u,
        destination: dest,
        path: result.path,
        isDisrupted: isDisrupted,
        reason: isDisrupted
          ? '混乱退避: ' + (dest.inCover ? '遮蔽' : '開地') +
            (dest.inEnemyFire ? '/射程内' : '/射程外') +
            ' 敵距離' + dest.enemyDist
          : '阻止線移動: ' + (dest.between ? 'BT-敵間' : '間外') +
            (dest.onRoad ? ' 道路封鎖' : '') +
            ' LOS' + dest.losCoverage +
            ' 敵距離' + dest.enemyDist +
            (dest.inCover ? ' 遮蔽' : '')
      });
    }

    return {
      moves: orders
    };
  }

  return {
    getBreakthroughCenter: getBreakthroughCenter,
    getEnemyFrontPosition: getEnemyFrontPosition,
    isBetweenBreakthroughAndEnemy: isBetweenBreakthroughAndEnemy,
    isOnRoadToBreakthrough: isOnRoadToBreakthrough,
    countLOSCoverage: countLOSCoverage,
    evaluateDefPosition: evaluateDefPosition,
    findBestDefPosition: findBestDefPosition,
    analyze: analyze
  };
})();

if (typeof module !== 'undefined') module.exports = DefMoveExpert;
