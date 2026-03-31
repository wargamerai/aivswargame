// movefire_expert.js — 移動射撃フェイズExpert
//
// 歩兵・偵察車両の前進偵察:
//   - 単独で深く移動し、多くの敵を視認する位置へ
//   - 平地/荒地のダミーを剥がす
//   - 盤外砲兵が撃てるように敵を観測する（isTargetSpottedByFriendly）
//   - ダミーを付けさせない（視認範囲内に留まる）
//   - ダミー付き敵に隣接してストップ射撃を誘発→ダミー除去
//
// 包囲移動:
//   - 町に立て篭もる敵には両側から包囲する形で隣接
//   - 退路を削ることで混乱した敵の退却先を減らす
//   - 突撃時に退却不可→壊滅を狙う
//
// 視認ルール:
//   - 視認範囲: G.visionRange（天候で変動）
//   - LOS + 視認範囲内の平地/荒地ダミーは自動除去
//   - 遮蔽地形(w/f/t/c)のダミーはLOS通っても除去されない
//   - 盤外砲兵は味方が目標を視認していないと撃てない

var MoveFireExpert = (function() {
  'use strict';

  // 突破ヘクスの中心（目標地点）
  // S2: col<=1, row 1-9 → 中心は col=1, row=5
  // S3: シナリオ定義による
  function getBreakthroughCenter() {
    if (typeof S3_BREAKTHROUGH_COL !== 'undefined') {
      return { col: S3_BREAKTHROUGH_COL, row: S3_BREAKTHROUGH_ROW };
    }
    return { col: 1, row: 5 };
  }

  // 敵が突破経路上にいるかどうかを判定
  // ユニットの現在位置から突破ヘクスまでの直線経路から、敵がどれだけ離れているか
  // 返り値: 経路からの距離（0=経路上、大きいほど離れている）
  function distanceFromBreakthroughPath(unitCol, unitRow, enemyCol, enemyRow) {
    var bt = getBreakthroughCenter();
    // ユニットから突破ヘクスへのベクトル方向に対して、敵がどれだけずれているか
    // 簡易計算: 敵が突破ヘクスとユニットの間のcolumn範囲にいるか
    var minCol = Math.min(unitCol, bt.col);
    var maxCol = Math.max(unitCol, bt.col);

    // 敵が経路のcol範囲内にいるか
    if (enemyCol >= minCol && enemyCol <= maxCol) {
      // row方向のずれ（経路の中心線からの距離）
      // ユニットから突破ヘクスへの直線上のrow位置を補間
      var totalColDist = maxCol - minCol;
      if (totalColDist === 0) return Math.abs(enemyRow - unitRow);
      var ratio = (enemyCol - unitCol) / (bt.col - unitCol);
      var expectedRow = unitRow + ratio * (bt.row - unitRow);
      return Math.abs(enemyRow - expectedRow);
    }

    // col範囲外 = 経路から離れている
    var colDist = enemyCol < minCol ? minCol - enemyCol : enemyCol - maxCol;
    return colDist + Math.abs(enemyRow - unitRow);
  }

  // このヘクスにストップ射撃できる敵スタック数を数える
  // 複数スタックから撃たれる移動は避けるべき
  function countStopFireSources(col, row, side) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var sourceHexes = {};

    testUnits.forEach(function(e) {
      if (e.side !== enemySide || e.status === 'eliminated') return;
      if (e.type === 'dummy' || e.type === 'leader') return;
      if ((e.fpAT || 0) + (e.fpSoft || 0) <= 0) return;
      var dist = hexDistance(e.col, e.row, col, row);
      if (dist > 0 && dist <= (e.range || 1) && hasLOS(e.col, e.row, col, row)) {
        var eHex = e.hexId || toHexId(e.col, e.row);
        sourceHexes[eHex] = true;
      }
    });

    return Object.keys(sourceHexes).length;
  }

  // この位置から視認できる敵ヘクス数を数える
  function countVisibleEnemyHexes(col, row, side) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var visionRange = G.visionRange || 12;
    var seen = {};

    testUnits.forEach(function(u) {
      if (u.side !== enemySide || u.status === 'eliminated') return;
      if (u.type === 'leader') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      if (seen[hid]) return;
      var dist = hexDistance(col, row, u.col, u.row);
      if (dist > 0 && dist <= visionRange && hasLOS(col, row, u.col, u.row)) {
        seen[hid] = true;
      }
    });

    return Object.keys(seen).length;
  }

  // この位置から剥がせるダミー数を数える
  // 平地/荒地のダミーのみ視認で除去可能
  function countStrippableDummies(col, row, side) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var visionRange = G.visionRange || 12;
    var count = 0;
    var checkedHex = {};

    testUnits.forEach(function(u) {
      if (u.type !== 'dummy' || u.side === side || u.status === 'eliminated') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      if (checkedHex[hid]) return;

      var dist = hexDistance(col, row, u.col, u.row);
      if (dist <= 0 || dist > visionRange) return;
      if (!hasLOS(col, row, u.col, u.row)) return;

      // 平地/荒地のみ除去可能
      var terrain = getHexTerrain(hid);
      if (terrain === 'p' || terrain === 'r') {
        count++;
        checkedHex[hid] = true;
      }
    });

    return count;
  }

  // この位置から盤外砲兵の観測対象になる敵ヘクス数
  // （現在味方が誰も視認していない敵を新たに観測できるか）
  function countNewSpottedTargets(col, row, side) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var visionRange = G.visionRange || 12;
    var count = 0;
    var checkedHex = {};

    testUnits.forEach(function(u) {
      if (u.side !== enemySide || u.status === 'eliminated' ||
          u.type === 'leader' || u.type === 'dummy') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      if (checkedHex[hid]) return;
      checkedHex[hid] = true;

      // この位置から視認できるか
      var dist = hexDistance(col, row, u.col, u.row);
      if (dist <= 0 || dist > visionRange) return;
      if (!hasLOS(col, row, u.col, u.row)) return;

      // 既に他の味方が視認しているかチェック
      var alreadySpotted = false;
      if (typeof isTargetSpottedByFriendly === 'function') {
        alreadySpotted = isTargetSpottedByFriendly(hid, side);
      }

      if (!alreadySpotted) count++;
    });

    return count;
  }

  // 偵察ユニットか判定
  function isScoutUnit(unit) {
    if (unit.type === 'I') return true; // 歩兵
    // 偵察車両（Sd Kfz等）
    if (unit.unitName && (
      unit.unitName.indexOf('Sd Kfz') >= 0 ||
      unit.unitName.indexOf('sdkfz') >= 0 ||
      unit.unitName.indexOf('Scout') >= 0 ||
      unit.unitName.indexOf('Recon') >= 0
    )) return true;
    // type判定
    if (unit.type === 'AC') return true; // 装甲車
    return false;
  }

  // 偵察移動先の評価
  // 戻り: { col, row, score, visibleEnemies, strippableDummies, newSpotted, reasons[] }
  function evaluateScoutPosition(col, row, unit, board) {
    var side = board.side;
    var reasons = [];

    // 視認できる敵ヘクス数
    var visibleEnemies = countVisibleEnemyHexes(col, row, side);
    reasons.push('視認敵' + visibleEnemies + 'ヘクス');

    // 剥がせるダミー数
    var strippableDummies = countStrippableDummies(col, row, side);
    if (strippableDummies > 0) reasons.push('ダミー除去' + strippableDummies);

    // 新規観測対象（砲兵射撃用）
    var newSpotted = countNewSpottedTargets(col, row, side);
    if (newSpotted > 0) reasons.push('新規観測' + newSpotted);

    // 生存性チェック
    var inCover = board.isCoverTerrain(col, row);
    var inLOS = board.isInEnemyFireZone(col, row);
    var enemyDist = board.nearestEnemyDist(col, row);

    // 敵隣接は危険（特に歩兵）
    var adjEnemy = board.getAdjacentEnemies(col, row);
    var safe = adjEnemy.length === 0;

    if (inCover) reasons.push('遮蔽あり');
    if (!inLOS) reasons.push('LOS外');
    if (!safe) reasons.push('敵隣接:危険');

    return {
      col: col,
      row: row,
      visibleEnemies: visibleEnemies,
      strippableDummies: strippableDummies,
      newSpotted: newSpotted,
      inCover: inCover,
      inLOS: inLOS,
      enemyDist: enemyDist,
      safe: safe,
      reasons: reasons
    };
  }

  // BFS探索で移動範囲内の全候補を評価し、最良の偵察位置を返す
  function findBestScoutPosition(unit, board, mp) {
    var side = board.side;
    var startCol = unit.col;
    var startRow = unit.row;
    var startHex = toHexId(startCol, startRow);

    // BFSで到達可能ヘクスを列挙
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

        // 敵ヘクスは通過不可
        var hasEnemy = testUnits.some(function(e) {
          return e.hexId === nHex && e.side !== side &&
                 e.status !== 'eliminated' && e.type !== 'dummy';
        });
        if (hasEnemy) continue;

        var mc = getMoveCost(unit, current.col, current.row, n.col, n.row, 'combat');
        if (mc.cost === Infinity) continue;

        var totalCost = current.cost + mc.cost;
        if (totalCost > mp) continue;

        // 複数スタックからストップ射撃を受けるヘクスは避ける
        var stopSources = countStopFireSources(n.col, n.row, side);
        if (stopSources >= 2) continue;

        if (!visited[nHex] || visited[nHex].cost > totalCost) {
          visited[nHex] = { cost: totalCost, col: n.col, row: n.row, parent: toHexId(current.col, current.row) };
          queue.push({ col: n.col, row: n.row, cost: totalCost });

          // スタック制限チェック
          var stackCount = testUnits.filter(function(u) {
            return u.hexId === nHex && u.status !== 'eliminated' &&
                   !STACK_EXEMPT_TYPES.includes(u.type) && u !== unit;
          }).length;
          if (stackCount < 4) {
            reachable.push({ col: n.col, row: n.row, hexId: nHex, cost: totalCost });
          }
        }
      }
    }

    if (reachable.length === 0) return null;

    // 各候補を評価
    var candidates = [];
    for (var j = 0; j < reachable.length; j++) {
      var r = reachable[j];
      var eval_ = evaluateScoutPosition(r.col, r.row, unit, board);
      eval_.hexId = r.hexId;
      eval_.moveCost = r.cost;
      candidates.push(eval_);
    }

    // ソート: 安全かつ視認数が最大
    candidates.sort(function(a, b) {
      // 敵隣接は避ける
      if (a.safe && !b.safe) return -1;
      if (!a.safe && b.safe) return 1;
      // 新規観測（砲兵射撃用）が多い方を優先
      if (a.newSpotted !== b.newSpotted) return b.newSpotted - a.newSpotted;
      // ダミー除去が多い方を優先
      if (a.strippableDummies !== b.strippableDummies) return b.strippableDummies - a.strippableDummies;
      // 視認できる敵ヘクスが多い方を優先
      if (a.visibleEnemies !== b.visibleEnemies) return b.visibleEnemies - a.visibleEnemies;
      // 移動終了は林・荒地・町を優先
      if (a.inCover && !b.inCover) return -1;
      if (!a.inCover && b.inCover) return 1;
      // LOS外を優先
      if (!a.inLOS && b.inLOS) return -1;
      if (a.inLOS && !b.inLOS) return 1;
      return 0;
    });

    // BFSのparent辿ってパスを構築
    var best = candidates[0];
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

  // ダミー付き敵ヘクスへの隣接偵察を評価
  // 条件:
  //   - 敵ヘクスにダミーが付いている
  //   - そのヘクスを味方が多数射程+LOSで捉えている
  //   - 偵察ユニットが単独で隣接 → ストップ射撃を誘発 → 敵のダミーが剥がれる
  //   - ストップ射撃を受けても、射撃した敵のダミーは除去される
  function findDummyProbeTargets(board, unit, mp) {
    var side = board.side;
    var enemySide = side === 'german' ? 'allied' : 'german';

    // ダミー付き敵ヘクスを収集
    var dummyHexes = {};
    testUnits.forEach(function(u) {
      if (u.type !== 'dummy' || u.side === side || u.status === 'eliminated') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      dummyHexes[hid] = true;
    });

    var candidates = [];

    for (var hid in dummyHexes) {
      var pos = fromHexId(hid);

      // このヘクスに実際の敵ユニットがいるか
      var enemiesHere = testUnits.filter(function(e) {
        return (e.hexId || toHexId(e.col, e.row)) === hid &&
               e.side === enemySide && e.status !== 'eliminated' &&
               e.type !== 'dummy' && e.type !== 'leader';
      });

      // 味方が何ユニットこのヘクスを射程+LOSで捉えているか
      var friendlyCovering = 0;
      testUnits.forEach(function(f) {
        if (f.side !== side || f.status === 'eliminated' || f.type === 'dummy' || f.type === 'leader') return;
        if ((f.fpAT || 0) + (f.fpSoft || 0) <= 0) return;
        var dist = hexDistance(f.col, f.row, pos.col, pos.row);
        if (dist > 0 && dist <= (f.range || 1) && hasLOS(f.col, f.row, pos.col, pos.row)) {
          friendlyCovering++;
        }
      });

      // 味方が多数捉えていない場合はスキップ
      if (friendlyCovering < 2) continue;

      // このヘクスに隣接できる移動先を探す
      var neighbors = getHexNeighbors(pos.col, pos.row);
      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
        var nHex = toHexId(n.col, n.row);
        var terrain = getHexTerrain(nHex);
        if (terrain === 'x' || terrain === 'lake') continue;

        // 敵がいるヘクスには入れない
        var hasEnemyAtN = testUnits.some(function(e) {
          return e.hexId === nHex && e.side === enemySide &&
                 e.status !== 'eliminated' && e.type !== 'dummy';
        });
        if (hasEnemyAtN) continue;

        // 移動可能か（BFS省略、直線距離で大まかに判定）
        var dist = hexDistance(unit.col, unit.row, n.col, n.row);
        if (dist > mp) continue; // 大まかなフィルタ

        candidates.push({
          targetDummyHex: hid,
          adjacentHex: { col: n.col, row: n.row, hexId: nHex },
          friendlyCovering: friendlyCovering,
          enemyCount: enemiesHere.length,
          inCover: board.isCoverTerrain(n.col, n.row)
        });
      }
    }

    // 味方カバー数が多い順 → 遮蔽地形優先
    candidates.sort(function(a, b) {
      if (a.friendlyCovering !== b.friendlyCovering) return b.friendlyCovering - a.friendlyCovering;
      if (a.inCover && !b.inCover) return -1;
      if (!a.inCover && b.inCover) return 1;
      return 0;
    });

    return candidates;
  }

  // メイン分析: 偵察ユニットの移動指示を生成
  // 戻り: {
  //   scouts: [{unit, destination, path, reason}],
  //   probes: [{unit, targetDummyHex, adjacentHex, friendlyCovering, reason}]
  // }
  function analyze(board) {
    var scoutOrders = [];
    var probeOrders = [];

    var friendlyUnits = board.friendlyUnits || [];
    for (var i = 0; i < friendlyUnits.length; i++) {
      var u = friendlyUnits[i];
      if (u.status === 'eliminated' || u.status === 'd' || u.status === 'dd') continue;
      if (!isScoutUnit(u)) continue;
      if (u.moveComplete || u.firedThisTurn) continue;

      var mp = u.move != null ? u.move : 1;
      if (mp <= 0) continue;

      // まずダミー付き敵への隣接偵察を検討
      var probes = findDummyProbeTargets(board, u, mp);
      if (probes.length > 0) {
        var probe = probes[0];
        probeOrders.push({
          unit: u,
          targetDummyHex: probe.targetDummyHex,
          adjacentHex: probe.adjacentHex,
          friendlyCovering: probe.friendlyCovering,
          reason: 'ダミー剥がし: ' + probe.targetDummyHex +
                  ' (味方' + probe.friendlyCovering + '個が射程内)'
        });
        continue; // このユニットは偵察隣接に割り当て
      }

      // 通常の偵察移動
      var result = findBestScoutPosition(u, board, mp);
      if (!result) continue;

      var dest = result.destination;
      var currentVisible = countVisibleEnemyHexes(u.col, u.row, board.side);
      var currentDummies = countStrippableDummies(u.col, u.row, board.side);

      if (dest.visibleEnemies > currentVisible ||
          dest.strippableDummies > currentDummies ||
          dest.newSpotted > 0) {
        scoutOrders.push({
          unit: u,
          destination: dest,
          path: result.path,
          reason: dest.reasons.join(', ')
        });
      }
    }

    return {
      scouts: scoutOrders,
      probes: probeOrders
    };
  }

  // ===== 包囲移動 =====
  // 町/遮蔽地形に立て篭もる敵に対し、両側から隣接して退路を塞ぐ
  // 混乱した敵の退却先を減らすことで壊滅を狙う

  // 敵ヘクスの退路数を計算（敵から見て退却可能な隣接ヘクス数）
  function countEnemyEscapeRoutes(enemyHexId, board) {
    var pos = fromHexId(enemyHexId);
    var neighbors = getHexNeighbors(pos.col, pos.row);
    var routes = 0;

    for (var i = 0; i < neighbors.length; i++) {
      var n = neighbors[i];
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
      var nHex = toHexId(n.col, n.row);
      var terrain = getHexTerrain(nHex);
      if (terrain === 'x' || terrain === 'lake') continue;

      // 味方（攻撃側）がいるヘクスは退路にならない
      var hasFriendly = testUnits.some(function(u) {
        return u.hexId === nHex && u.side === board.side &&
               u.status !== 'eliminated' && u.type !== 'dummy';
      });
      if (!hasFriendly) routes++;
    }

    return routes;
  }

  // 包囲対象の敵ヘクスを見つける
  // 条件: 遮蔽地形にいる敵で、まだ退路が残っている
  function findEncirclementTargets(board) {
    var side = board.side;
    var enemySide = side === 'german' ? 'allied' : 'german';
    var targets = [];

    // 敵ヘクスを収集
    var enemyHexes = {};
    testUnits.forEach(function(u) {
      if (u.side !== enemySide || u.status === 'eliminated' ||
          u.type === 'dummy' || u.type === 'leader') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      if (!enemyHexes[hid]) enemyHexes[hid] = [];
      enemyHexes[hid].push(u);
    });

    for (var hid in enemyHexes) {
      var terrain = getHexTerrain(hid);
      // 町/遮蔽地形に立て篭もる敵を優先
      var isDefensible = terrain === 't' || terrain === 'c' || terrain === 'f' || terrain === 'w';
      if (!isDefensible) continue;

      var escapeRoutes = countEnemyEscapeRoutes(hid, board);
      // 既に退路が少ない敵を優先（あと少しで包囲完了）
      if (escapeRoutes > 0 && escapeRoutes <= 4) {
        var ePos = fromHexId(hid);
        // 突破経路からの距離（経路上の敵を優先）
        var pathDist = 99;
        board.friendlyUnits.forEach(function(f) {
          var d = distanceFromBreakthroughPath(f.col, f.row, ePos.col, ePos.row);
          if (d < pathDist) pathDist = d;
        });
        // 迫撃砲の有無（脅威度高）
        var hasMortar = enemyHexes[hid].some(function(e) { return e.type === 'A'; });

        targets.push({
          hexId: hid,
          enemies: enemyHexes[hid],
          terrain: terrain,
          escapeRoutes: escapeRoutes,
          pathDist: pathDist,
          hasMortar: hasMortar
        });
      }
    }

    // ソート: 迫撃砲あり > 突破経路上 > 退路が少ない順
    targets.sort(function(a, b) {
      // 迫撃砲は脅威度が高いので優先
      if (a.hasMortar && !b.hasMortar) return -1;
      if (!a.hasMortar && b.hasMortar) return 1;
      // 突破経路上の敵を優先（経路から離れた敵は後回し）
      if (Math.abs(a.pathDist - b.pathDist) > 2) return a.pathDist - b.pathDist;
      // 退路が少ない順
      return a.escapeRoutes - b.escapeRoutes;
    });

    return targets;
  }

  // 包囲のために隣接すべきヘクスを選定
  // 退路を塞ぐ位置 = 敵の隣接ヘクスで、まだ味方がいない場所
  function findEncirclementPositions(targetHexId, board) {
    var side = board.side;
    var pos = fromHexId(targetHexId);
    var neighbors = getHexNeighbors(pos.col, pos.row);
    var positions = [];

    for (var i = 0; i < neighbors.length; i++) {
      var n = neighbors[i];
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
      var nHex = toHexId(n.col, n.row);
      var terrain = getHexTerrain(nHex);
      if (terrain === 'x' || terrain === 'lake') continue;

      // 既に味方がいるヘクスはスキップ（既に退路を塞いでいる）
      var hasFriendly = testUnits.some(function(u) {
        return u.hexId === nHex && u.side === side &&
               u.status !== 'eliminated' && u.type !== 'dummy';
      });
      if (hasFriendly) continue;

      // 敵がいるヘクスはスキップ
      var hasEnemy = testUnits.some(function(u) {
        return u.hexId === nHex && u.side !== side &&
               u.status !== 'eliminated' && u.type !== 'dummy';
      });
      if (hasEnemy) continue;

      // スタック上限
      var stackCount = testUnits.filter(function(u) {
        return u.hexId === nHex && u.status !== 'eliminated' &&
               !STACK_EXEMPT_TYPES.includes(u.type);
      }).length;
      if (stackCount >= 4) continue;

      positions.push({
        col: n.col,
        row: n.row,
        hexId: nHex,
        inCover: board.isCoverTerrain(n.col, n.row)
      });
    }

    return positions;
  }

  // 包囲移動の分析
  // 戻り: [{unit, targetEnemyHex, moveToHex, escapeRoutesBefore, reason}]
  function analyzeEncirclement(board) {
    var side = board.side;
    var orders = [];
    var targets = findEncirclementTargets(board);
    var assignedUnits = {};

    for (var t = 0; t < targets.length; t++) {
      var target = targets[t];
      var positions = findEncirclementPositions(target.hexId, board);
      if (positions.length === 0) continue;

      // 遮蔽地形の位置を優先（林・荒地・町で移動終了）
      positions.sort(function(a, b) {
        if (a.inCover && !b.inCover) return -1;
        if (!a.inCover && b.inCover) return 1;
        return 0;
      });

      // 各位置に移動可能な味方ユニットを探す
      for (var p = 0; p < positions.length; p++) {
        var pos = positions[p];

        // 最も近い未割り当ての非偵察・非砲兵の正常ユニットを探す
        var bestUnit = null;
        var bestDist = Infinity;

        testUnits.forEach(function(u) {
          if (u.side !== side || u.status !== 'ok') return;
          if (u.type === 'dummy' || u.type === 'leader' || u.type === 'A' || u.type === 'AT') return;
          if (u.moveComplete || u.firedThisTurn) return;
          if (assignedUnits[u.name || u.id]) return;

          var dist = hexDistance(u.col, u.row, pos.col, pos.row);
          var mp = u.move != null ? u.move : 1;
          // 移動力で到達可能か（大まかな判定）
          if (dist <= mp && dist < bestDist) {
            bestDist = dist;
            bestUnit = u;
          }
        });

        if (bestUnit) {
          assignedUnits[bestUnit.name || bestUnit.id] = true;
          orders.push({
            unit: bestUnit,
            targetEnemyHex: target.hexId,
            moveToHex: pos,
            escapeRoutesBefore: target.escapeRoutes,
            reason: target.hexId + 'の退路封鎖(' +
                    target.terrain + ', 残退路' + target.escapeRoutes + ')'
          });
        }
      }
    }

    return orders;
  }

  // ===== 先制射撃 =====
  // 味方の射程が敵より長い場合、敵の射程外から先制射撃する
  // 移動せずにその位置で射撃し、敵の反撃を受けない

  // 先制射撃の対象を見つける
  // 条件: 味方射程内＋LOS内の敵で、かつその敵の射程外にいる
  function findPreemptiveFireTargets(board) {
    var side = board.side;
    var enemySide = side === 'german' ? 'allied' : 'german';
    var orders = [];

    // 射撃可能な味方をヘクス単位でグループ化
    var shooterHexes = {};
    testUnits.forEach(function(u) {
      if (u.side !== side || u.status !== 'ok') return;
      if (u.type === 'dummy' || u.type === 'leader') return;
      if ((u.fpAT || 0) + (u.fpSoft || 0) <= 0) return;
      if (u.firedThisTurn) return;
      var hid = u.hexId || toHexId(u.col, u.row);
      if (!shooterHexes[hid]) shooterHexes[hid] = [];
      shooterHexes[hid].push(u);
    });

    for (var hid in shooterHexes) {
      var shooters = shooterHexes[hid];
      var maxRange = 0;
      shooters.forEach(function(s) { if ((s.range || 0) > maxRange) maxRange = s.range; });
      var effectiveRange = Math.min(maxRange, G.visionRange || 12);

      // 射程内の敵を探す
      var pos = fromHexId(hid);
      var targets = [];

      testUnits.forEach(function(e) {
        if (e.side !== enemySide || e.status !== 'ok') return;
        if (e.type === 'dummy' || e.type === 'leader') return;
        var dist = hexDistance(pos.col, pos.row, e.col, e.row);
        if (dist <= 0 || dist > effectiveRange) return;
        if (!hasLOS(pos.col, pos.row, e.col, e.row)) return;

        var enemyRange = e.range || 1;
        // 敵の射程外にいる = 先制射撃可能（反撃されない）
        if (dist > enemyRange) {
          targets.push({
            enemy: e,
            dist: dist,
            enemyRange: enemyRange,
            outOfEnemyRange: true
          });
        }
      });

      if (targets.length > 0) {
        // 射撃方針: 満遍なく広く損害を与える
        // ただし火力が著しく強い敵がいる場合は壊滅を目的とする

        // 味方の合計FP
        var myTotalFP = 0;
        shooters.forEach(function(s) { myTotalFP += (s.fpAT || 0) + (s.fpSoft || 0); });

        // 著しく強い敵を探す（味方合計FP以上の火力を持つ敵）
        var dangerousTarget = null;
        for (var ti = 0; ti < targets.length; ti++) {
          var eFP = (targets[ti].enemy.fpAT || 0) + (targets[ti].enemy.fpSoft || 0);
          if (eFP >= myTotalFP) {
            dangerousTarget = targets[ti];
            break;
          }
        }

        if (dangerousTarget) {
          // 著しく強い敵 → 集中射撃で壊滅を狙う
          orders.push({
            shooters: shooters,
            shooterHex: hid,
            target: dangerousTarget.enemy,
            dist: dangerousTarget.dist,
            firePolicy: 'concentrate',
            reason: '先制集中射撃: 高火力敵' + dangerousTarget.enemy.name +
                    ' (射程' + maxRange + ' vs 敵射程' + dangerousTarget.enemyRange + ')'
          });
        } else {
          // 通常: まだ撃たれていない敵を優先（広く損害を分散）
          // 他のshooterHexが既にターゲットにしている敵を避ける
          var alreadyTargeted = {};
          for (var oi = 0; oi < orders.length; oi++) {
            var tName = orders[oi].target.name || orders[oi].target.id;
            alreadyTargeted[tName] = true;
          }

          var untargeted = targets.filter(function(t) {
            return !alreadyTargeted[t.enemy.name || t.enemy.id];
          });
          var chosen = untargeted.length > 0 ? untargeted[0] : targets[0];

          orders.push({
            shooters: shooters,
            shooterHex: hid,
            target: chosen.enemy,
            dist: chosen.dist,
            firePolicy: 'spread',
            reason: '先制射撃(分散): 射程' + maxRange + ' vs 敵射程' +
                    chosen.enemyRange + ' (距離' + chosen.dist + ')'
          });
        }
      }
    }

    return orders;
  }

  // ===== ストップ射撃後の移動継続判断 =====
  // ストップ射撃を受けた後、さらに移動するかどうかを判断
  // 双方の戦力を比較し、効果が薄いときは移動しない
  //
  // 判断基準:
  //   - 移動側の残存戦力（FP合計・ユニット数）
  //   - 敵のストップ射撃戦力（次のヘクスでも撃てる敵のFP合計）
  //   - 移動を続けた場合の利益（目標到達、包囲完成等）
  //   - 移動を止めた場合の反撃力（現在位置から撃てる敵）
  function shouldContinueAfterStopFire(stack, nextCol, nextRow, board) {
    var side = board.side;
    var enemySide = side === 'german' ? 'allied' : 'german';

    // 移動側の残存戦力
    var myFP = 0;
    var myAlive = 0;
    for (var i = 0; i < stack.length; i++) {
      if (stack[i].status === 'eliminated') continue;
      myFP += (stack[i].fpAT || 0) + (stack[i].fpSoft || 0);
      myAlive++;
    }

    if (myAlive === 0) return false;

    // 次のヘクスでストップ射撃できる敵のFP合計
    var enemyStopFP = 0;
    var enemyStopCount = 0;
    testUnits.forEach(function(e) {
      if (e.side !== enemySide || e.status === 'eliminated') return;
      if (e.type === 'dummy' || e.type === 'leader') return;
      if ((e.fpAT || 0) + (e.fpSoft || 0) <= 0) return;
      var dist = hexDistance(e.col, e.row, nextCol, nextRow);
      if (dist > 0 && dist <= (e.range || 1) && hasLOS(e.col, e.row, nextCol, nextRow)) {
        enemyStopFP += (e.fpAT || 0) + (e.fpSoft || 0);
        enemyStopCount++;
      }
    });

    // 現在位置から撃てる敵（反撃力）
    var currentCol = stack[0].col;
    var currentRow = stack[0].row;
    var counterFP = 0;
    var counterTargets = 0;
    testUnits.forEach(function(e) {
      if (e.side !== enemySide || e.status === 'eliminated') return;
      if (e.type === 'dummy' || e.type === 'leader') return;
      var dist = hexDistance(currentCol, currentRow, e.col, e.row);
      var maxRange = Math.max.apply(null, stack.map(function(s) { return s.range || 1; }));
      if (dist > 0 && dist <= maxRange && hasLOS(currentCol, currentRow, e.col, e.row)) {
        counterTargets++;
      }
    });

    // 判断: 敵のストップ射撃力が味方戦力を大きく上回る場合は停止
    // 敵FP >= 味方FP × 1.5 なら効果が薄い → 停止
    if (enemyStopFP >= myFP * 1.5) return false;

    // 現在位置で既に反撃可能な敵がいるなら、わざわざリスクを冒して移動しない
    if (counterTargets > 0 && enemyStopFP > myFP) return false;

    // 味方が全員混乱なら停止
    var allDisrupted = stack.every(function(u) {
      return u.status === 'd' || u.status === 'dd' || u.status === 'eliminated';
    });
    if (allDisrupted) return false;

    return true;
  }

  // ===== オーバーラン判断 =====
  // DD（重混乱）や移動隊形の敵には積極的にオーバーランを仕掛ける
  // オーバーラン条件: 戦闘隊形の正常ユニット、隣接、移動コスト+2MP
  function findOverrunTargets(board) {
    var side = board.side;
    var enemySide = side === 'german' ? 'allied' : 'german';
    var orders = [];

    // 隣接するDD/移動隊形の敵を探す
    var friendlyUnits = board.friendlyUnits || [];
    for (var i = 0; i < friendlyUnits.length; i++) {
      var u = friendlyUnits[i];
      if (u.status !== 'ok') continue;
      if (u.type === 'dummy' || u.type === 'leader' || u.type === 'A' || u.type === 'AT') continue;
      if (u.moveComplete || u.marchMode) continue;
      // 装甲車両を優先（オーバーラン向き）
      var isArmor = u.type === 'T' || u.type === 'AC' || u.type === 'TD' ||
                    u.type === 'SPG' || u.type === 'SPA' || u.type === 'HT';

      var mp = u.move != null ? u.move : 1;
      if (mp < 3) continue; // 最低3MP必要（移動1+オーバーラン2）

      // 移動範囲内の敵を探す
      var neighbors = getHexNeighbors(u.col, u.row);
      for (var j = 0; j < neighbors.length; j++) {
        var n = neighbors[j];
        if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
        var nHex = toHexId(n.col, n.row);

        var enemies = testUnits.filter(function(e) {
          return (e.hexId || toHexId(e.col, e.row)) === nHex &&
                 e.side === enemySide && e.status !== 'eliminated' &&
                 e.type !== 'dummy' && e.type !== 'leader';
        });
        if (enemies.length === 0) continue;

        // DD or 移動隊形の敵がいるか
        var hasVulnerable = enemies.some(function(e) {
          return e.status === 'dd' || e.marchMode;
        });
        if (!hasVulnerable) continue;

        // 移動コスト+2チェック
        var mc = getMoveCost(u, u.col, u.row, n.col, n.row, 'combat');
        if (mc.cost === Infinity || mc.cost + 2 > mp) continue;

        orders.push({
          unit: u,
          targetHex: nHex,
          enemies: enemies,
          isArmor: isArmor,
          reason: 'オーバーラン: ' + enemies.map(function(e) { return e.name + '(' + e.status + ')'; }).join(',')
        });
      }
    }

    // 装甲車両を優先
    orders.sort(function(a, b) {
      if (a.isArmor && !b.isArmor) return -1;
      if (!a.isArmor && b.isArmor) return 1;
      return 0;
    });

    return orders;
  }

  // ===== 混乱敵への隣接 =====
  // 混乱(D/DD)している敵に可能な限り隣接する
  // 隣接することで回復を阻止し、退却先を減らす
  function findDisruptedEnemyApproach(board) {
    var side = board.side;
    var enemySide = side === 'german' ? 'allied' : 'german';
    var orders = [];
    var assignedUnits = {};

    // 混乱した敵を収集し、突破経路上を優先・迫撃砲は脅威度高
    var disruptedEnemies = [];
    testUnits.forEach(function(e) {
      if (e.side !== enemySide) return;
      if (e.status !== 'd' && e.status !== 'dd') return;
      if (e.type === 'dummy' || e.type === 'leader') return;
      var pathDist = 99;
      (board.friendlyUnits || []).forEach(function(f) {
        var d = distanceFromBreakthroughPath(f.col, f.row, e.col, e.row);
        if (d < pathDist) pathDist = d;
      });
      disruptedEnemies.push({ enemy: e, pathDist: pathDist, isMortar: e.type === 'A' });
    });

    // 迫撃砲優先 → 突破経路上優先
    disruptedEnemies.sort(function(a, b) {
      if (a.isMortar && !b.isMortar) return -1;
      if (!a.isMortar && b.isMortar) return 1;
      return a.pathDist - b.pathDist;
    });

    for (var d = 0; d < disruptedEnemies.length; d++) {
      var enemy = disruptedEnemies[d].enemy;
      var eHex = enemy.hexId || toHexId(enemy.col, enemy.row);

      // 既に味方が隣接しているかチェック
      var alreadyAdjacent = testUnits.some(function(f) {
        return f.side === side && f.status !== 'eliminated' && f.type !== 'dummy' &&
               hexDistance(f.col, f.row, enemy.col, enemy.row) === 1;
      });
      if (alreadyAdjacent) continue;

      // 隣接可能なヘクスを探す
      var neighbors = getHexNeighbors(enemy.col, enemy.row);
      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
        var nHex = toHexId(n.col, n.row);
        var terrain = getHexTerrain(nHex);
        if (terrain === 'x' || terrain === 'lake') continue;

        // 敵がいるヘクスは不可
        var hasEnemyHere = testUnits.some(function(e) {
          return e.hexId === nHex && e.side === enemySide &&
                 e.status !== 'eliminated' && e.type !== 'dummy';
        });
        if (hasEnemyHere) continue;

        // 複数スタックからストップ射撃を受けるヘクスは避ける
        var stopSources = countStopFireSources(n.col, n.row, side);
        if (stopSources >= 2) continue;

        // 最も近い未割り当ての正常ユニットを探す
        var bestUnit = null;
        var bestDist = Infinity;

        testUnits.forEach(function(f) {
          if (f.side !== side || f.status !== 'ok') return;
          if (f.type === 'dummy' || f.type === 'leader' || f.type === 'A' || f.type === 'AT') return;
          if (f.moveComplete || f.firedThisTurn) return;
          if (assignedUnits[f.name || f.id]) return;

          var dist = hexDistance(f.col, f.row, n.col, n.row);
          var mp = f.move != null ? f.move : 1;
          if (dist <= mp && dist < bestDist) {
            bestDist = dist;
            bestUnit = f;
          }
        });

        if (bestUnit) {
          assignedUnits[bestUnit.name || bestUnit.id] = true;
          orders.push({
            unit: bestUnit,
            targetEnemy: enemy,
            moveToHex: { col: n.col, row: n.row, hexId: nHex },
            reason: enemy.name + '(' + enemy.status.toUpperCase() + ')に隣接→回復阻止'
          });
          break; // この敵には1ユニット割り当てれば十分
        }
      }
    }

    return orders;
  }

  // ===== 指揮官の移動 =====
  // F能力（射撃ボーナス）/ A能力（突撃ボーナス）の指揮官:
  //   → 戦闘部隊と可能な限りスタックする
  // R能力（遠隔指揮）の指揮官:
  //   → 戦闘スタックと行動を共にし、最後に移動する
  //   → 隣接から指揮できるのでスタック必須ではないが、追従する
  function analyzeLeaderMovement(board) {
    var side = board.side;
    var orders = [];

    var leaders = testUnits.filter(function(u) {
      return u.type === 'leader' && u.side === side && u.status !== 'eliminated';
    });

    for (var i = 0; i < leaders.length; i++) {
      var leader = leaders[i];
      var abilities = leader.abilities || [];
      var hasF = abilities.indexOf('F') >= 0;
      var hasA = abilities.indexOf('A') >= 0;
      var hasR = abilities.indexOf('R') >= 0;

      if (!hasF && !hasA && !hasR) continue;

      // F/A指揮官: 最も戦力の高い味方スタックとスタックする
      if (hasF || hasA) {
        var bestHex = null;
        var bestFP = 0;

        // 現在のヘクスの味方戦力
        var currentFP = 0;
        testUnits.forEach(function(u) {
          if (u.hexId === leader.hexId && u.side === side && u.status === 'ok' &&
              u.type !== 'dummy' && u.type !== 'leader') {
            currentFP += (u.fpAT || 0) + (u.fpSoft || 0);
          }
        });

        // 隣接ヘクスでより戦力の高いスタックを探す
        var neighbors = getHexNeighbors(leader.col, leader.row);
        for (var j = 0; j < neighbors.length; j++) {
          var n = neighbors[j];
          if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
          var nHex = toHexId(n.col, n.row);

          // スタック上限チェック
          var stackCount = testUnits.filter(function(u) {
            return u.hexId === nHex && u.status !== 'eliminated' &&
                   !STACK_EXEMPT_TYPES.includes(u.type);
          }).length;
          if (stackCount >= 4) continue;

          // 敵がいるヘクスは不可
          var hasEnemy = testUnits.some(function(u) {
            return u.hexId === nHex && u.side !== side &&
                   u.status !== 'eliminated' && u.type !== 'dummy';
          });
          if (hasEnemy) continue;

          var hexFP = 0;
          testUnits.forEach(function(u) {
            if (u.hexId === nHex && u.side === side && u.status === 'ok' &&
                u.type !== 'dummy' && u.type !== 'leader') {
              hexFP += (u.fpAT || 0) + (u.fpSoft || 0);
            }
          });

          if (hexFP > bestFP) {
            bestFP = hexFP;
            bestHex = { col: n.col, row: n.row, hexId: nHex };
          }
        }

        if (bestHex && bestFP > currentFP) {
          var abilityStr = (hasF ? 'F' : '') + (hasA ? 'A' : '');
          orders.push({
            leader: leader,
            action: 'stack',
            destination: bestHex,
            moveOrder: 'normal',
            reason: abilityStr + '指揮官→FP' + bestFP + 'のスタックに合流'
          });
        } else {
          orders.push({
            leader: leader,
            action: 'stay',
            destination: null,
            moveOrder: 'normal',
            reason: '現在位置が最適'
          });
        }
      }

      // R指揮官: 最も戦力の高いスタックに追従、最後に移動
      if (hasR && !hasF && !hasA) {
        // 最も近い大きなスタックを探す
        var bestStack = null;
        var bestStackFP = 0;
        var bestStackDist = Infinity;

        var hexGroups = {};
        testUnits.forEach(function(u) {
          if (u.side !== side || u.status === 'eliminated' ||
              u.type === 'dummy' || u.type === 'leader') return;
          var hid = u.hexId || toHexId(u.col, u.row);
          if (!hexGroups[hid]) hexGroups[hid] = { fp: 0, col: u.col, row: u.row };
          hexGroups[hid].fp += (u.fpAT || 0) + (u.fpSoft || 0);
        });

        for (var hid in hexGroups) {
          var g = hexGroups[hid];
          var dist = hexDistance(leader.col, leader.row, g.col, g.row);
          var mp = leader.move != null ? leader.move : 1;
          // 移動範囲内+1（次ターンで追いつける範囲）
          if (dist <= mp + 1) {
            if (g.fp > bestStackFP || (g.fp === bestStackFP && dist < bestStackDist)) {
              bestStackFP = g.fp;
              bestStackDist = dist;
              bestStack = { col: g.col, row: g.row, hexId: hid };
            }
          }
        }

        if (bestStack) {
          orders.push({
            leader: leader,
            action: 'follow',
            destination: bestStack,
            moveOrder: 'last', // 最後に移動
            reason: 'R指揮官→FP' + bestStackFP + 'スタックに追従（最後に移動）'
          });
        }
      }
    }

    return orders;
  }

  // ===== 隊形変換・道路移動 =====
  // 移動隊形に変換して道路移動を使うべきケース:
  //   1. 移動隊形なら突破ヘクスに到達可能（戦闘隊形では不可）
  //   2. 移動力0の大砲が敵から著しく遠い → 牽引して前進
  // ただし敵の攻撃を受ける位置は避ける
  function analyzeMarchMode(board) {
    var side = board.side;
    var enemySide = side === 'german' ? 'allied' : 'german';
    var orders = [];
    var bt = getBreakthroughCenter();

    var friendlyUnits = board.friendlyUnits || [];
    for (var i = 0; i < friendlyUnits.length; i++) {
      var u = friendlyUnits[i];
      if (u.status !== 'ok') continue;
      if (u.moveComplete || u.firedThisTurn || u.marchMode) continue;
      if (u.type === 'dummy' || u.type === 'leader') continue;

      var mp = u.move != null ? u.move : 0;

      // ケース1: 突破可能性チェック
      // 移動隊形（道路0.5コスト）なら突破ヘクスに到達可能か
      if (side === 'german') {
        var distToBT = hexDistance(u.col, u.row, bt.col, bt.row);
        // 戦闘隊形では届かないが移動隊形なら届く可能性
        // 移動隊形の道路は0.5コスト、戦闘隊形は1コスト
        // 大まかに: 移動隊形のMP = mp * 2（道路のみなら）
        var marchMP = mp * 2;
        if (distToBT > mp && distToBT <= marchMP) {
          // 経路上に敵がいないか確認
          var pathSafe = !isPathUnderThreat(u.col, u.row, bt.col, bt.row, side);
          if (pathSafe) {
            orders.push({
              unit: u,
              action: 'march_to_breakthrough',
              reason: '移動隊形で突破可能（距離' + distToBT + ', 戦闘MP' + mp + ', 行軍MP~' + marchMP + '）'
            });
            continue;
          }
        }
      }

      // ケース2: 移動力0の大砲（type='A'やtype='AT'）が敵から遠い
      if (mp === 0 && (u.type === 'A' || u.type === 'AT')) {
        var nearestEnemy = board.nearestEnemyDist(u.col, u.row);
        var range = u.range || 1;
        // 敵が射程外で著しく遠い場合
        if (nearestEnemy > range + 3) {
          // 牽引して前進すべき → 安全な経路があるか
          var inEnemyLOS = board.isInEnemyFireZone(u.col, u.row);
          if (!inEnemyLOS) {
            orders.push({
              unit: u,
              action: 'tow_forward',
              reason: '牽引前進: 最寄敵距離' + nearestEnemy + ' > 射程' + range + '+3'
            });
          }
        }
      }
    }

    return orders;
  }

  // 経路上に敵の攻撃を受ける位置があるかチェック
  // startからgoalへの大まかな経路上で、敵のLOS+射程内のヘクスがあるか
  function isPathUnderThreat(startCol, startRow, goalCol, goalRow, side) {
    var enemySide = side === 'german' ? 'allied' : 'german';

    // startからgoalへ1ヘクスずつ近づく簡易経路
    var curCol = startCol;
    var curRow = startRow;
    var maxSteps = 20;

    for (var step = 0; step < maxSteps; step++) {
      if (curCol === goalCol && curRow === goalRow) break;

      // goalに向かって1ヘクス移動
      var dCol = goalCol - curCol;
      var dRow = goalRow - curRow;
      if (dCol !== 0) curCol += dCol > 0 ? 1 : -1;
      else if (dRow !== 0) curRow += dRow > 0 ? 1 : -1;

      // このヘクスが敵のLOS+射程内か
      var threatened = testUnits.some(function(e) {
        if (e.side !== enemySide || e.status === 'eliminated') return false;
        if (e.type === 'dummy' || e.type === 'leader') return false;
        if ((e.fpAT || 0) + (e.fpSoft || 0) <= 0) return false;
        var dist = hexDistance(e.col, e.row, curCol, curRow);
        return dist > 0 && dist <= (e.range || 1) && hasLOS(e.col, e.row, curCol, curRow);
      });

      if (threatened) return true;
    }

    return false;
  }

  // ===== R指揮官がいる場合の協同攻撃計画 =====
  // R指揮官は隣接から指揮できるので、複数スタックが隣接して同一目標を攻撃する
  // 先制射撃はこの協同攻撃を見越して使用する（目標を混乱させてから突撃）
  function planCoordinatedAttack(board) {
    var side = board.side;
    var enemySide = side === 'german' ? 'allied' : 'german';
    var plans = [];

    // R能力の指揮官がいるか
    var rLeaders = testUnits.filter(function(u) {
      return u.type === 'leader' && u.side === side && u.status !== 'eliminated' &&
             u.abilities && u.abilities.indexOf('R') >= 0;
    });
    if (rLeaders.length === 0) return plans;

    // 攻撃目標になりうる敵ヘクスを探す
    var enemyHexes = {};
    testUnits.forEach(function(u) {
      if (u.side !== enemySide || u.status === 'eliminated' ||
          u.type === 'dummy' || u.type === 'leader') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      if (!enemyHexes[hid]) enemyHexes[hid] = [];
      enemyHexes[hid].push(u);
    });

    for (var eHex in enemyHexes) {
      var enemies = enemyHexes[eHex];
      var ePos = fromHexId(eHex);

      // この敵に隣接可能な味方スタックを探す
      var adjacentFriendly = [];
      var approachable = []; // 移動で隣接可能な味方

      var eNeighbors = getHexNeighbors(ePos.col, ePos.row);

      for (var i = 0; i < eNeighbors.length; i++) {
        var n = eNeighbors[i];
        if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
        var nHex = toHexId(n.col, n.row);

        // 既にいる味方
        var friendlyHere = testUnits.filter(function(u) {
          return u.hexId === nHex && u.side === side && u.status === 'ok' &&
                 u.type !== 'dummy' && u.type !== 'leader';
        });
        if (friendlyHere.length > 0) {
          adjacentFriendly.push({ hexId: nHex, units: friendlyHere });
        }
      }

      // 2スタック以上隣接可能なら協同攻撃計画
      if (adjacentFriendly.length >= 2) {
        // R指揮官がこの敵の近く（距離2以内）にいるか
        var nearRLeader = rLeaders.find(function(l) {
          return hexDistance(l.col, l.row, ePos.col, ePos.row) <= 2;
        });

        if (nearRLeader) {
          // 先制射撃でこの敵を狙うべき
          plans.push({
            targetHex: eHex,
            enemies: enemies,
            adjacentStacks: adjacentFriendly,
            rLeader: nearRLeader,
            preemptiveTarget: true,
            reason: 'R指揮官' + nearRLeader.name + '指揮下の協同攻撃(' +
                    adjacentFriendly.length + 'スタック隣接)'
          });
        }
      }
    }

    return plans;
  }

  // ===== 統合分析 =====
  // 戻り: {
  //   preemptiveFire: [{shooters, target, reason}],  先制射撃
  //   overruns: [{unit, targetHex, enemies, reason}], オーバーラン
  //   disruptedApproach: [{unit, targetEnemy, moveToHex, reason}], 混乱敵への隣接
  //   scouts: [{unit, destination, path, reason}],    偵察移動
  //   probes: [{unit, targetDummyHex, adjacentHex, reason}], ダミー剥がし
  //   encirclement: [{unit, targetEnemyHex, moveToHex, reason}], 包囲移動
  //   leaderMovement: [{leader, action, destination, moveOrder, reason}], 指揮官移動
  //   coordinatedAttacks: [{targetHex, adjacentStacks, rLeader, reason}] 協同攻撃計画
  // }
  function analyzeAll(board) {
    var scoutResult = analyze(board);
    var encirclement = analyzeEncirclement(board);
    var preemptiveFire = findPreemptiveFireTargets(board);
    var overruns = findOverrunTargets(board);
    var disruptedApproach = findDisruptedEnemyApproach(board);
    var leaderMovement = analyzeLeaderMovement(board);
    var coordinatedAttacks = planCoordinatedAttack(board);
    var marchOrders = analyzeMarchMode(board);

    // 協同攻撃計画がある場合、先制射撃のターゲットを調整
    // 協同攻撃対象を先制射撃で混乱させてから突撃
    if (coordinatedAttacks.length > 0) {
      for (var c = 0; c < coordinatedAttacks.length; c++) {
        var plan = coordinatedAttacks[c];
        if (!plan.preemptiveTarget) continue;
        // この敵を先制射撃の対象として追加
        var alreadyTargeted = preemptiveFire.some(function(pf) {
          var tHex = pf.target.hexId || toHexId(pf.target.col, pf.target.row);
          return tHex === plan.targetHex;
        });
        if (!alreadyTargeted) {
          // 射程内の味方を探して先制射撃に追加
          var ePos = fromHexId(plan.targetHex);
          for (var s = 0; s < plan.adjacentStacks.length; s++) {
            var stack = plan.adjacentStacks[s];
            var shooters = stack.units.filter(function(u) {
              return !u.firedThisTurn && ((u.fpAT || 0) + (u.fpSoft || 0)) > 0;
            });
            if (shooters.length > 0) {
              preemptiveFire.push({
                shooters: shooters,
                shooterHex: stack.hexId,
                target: plan.enemies[0],
                dist: 1,
                reason: '協同攻撃準備射撃: ' + plan.reason
              });
              break; // 1スタック分の先制射撃で十分
            }
          }
        }
      }
    }

    return {
      preemptiveFire: preemptiveFire,
      overruns: overruns,
      disruptedApproach: disruptedApproach,
      scouts: scoutResult.scouts,
      probes: scoutResult.probes,
      encirclement: encirclement,
      leaderMovement: leaderMovement,
      coordinatedAttacks: coordinatedAttacks,
      marchOrders: marchOrders
    };
  }

  return {
    getBreakthroughCenter: getBreakthroughCenter,
    distanceFromBreakthroughPath: distanceFromBreakthroughPath,
    analyzeMarchMode: analyzeMarchMode,
    isPathUnderThreat: isPathUnderThreat,
    isScoutUnit: isScoutUnit,
    countStopFireSources: countStopFireSources,
    countVisibleEnemyHexes: countVisibleEnemyHexes,
    countStrippableDummies: countStrippableDummies,
    countNewSpottedTargets: countNewSpottedTargets,
    evaluateScoutPosition: evaluateScoutPosition,
    findBestScoutPosition: findBestScoutPosition,
    countEnemyEscapeRoutes: countEnemyEscapeRoutes,
    findEncirclementTargets: findEncirclementTargets,
    findEncirclementPositions: findEncirclementPositions,
    analyzeEncirclement: analyzeEncirclement,
    findPreemptiveFireTargets: findPreemptiveFireTargets,
    shouldContinueAfterStopFire: shouldContinueAfterStopFire,
    findOverrunTargets: findOverrunTargets,
    findDisruptedEnemyApproach: findDisruptedEnemyApproach,
    analyzeLeaderMovement: analyzeLeaderMovement,
    planCoordinatedAttack: planCoordinatedAttack,
    analyze: analyze,
    analyzeAll: analyzeAll
  };
})();

if (typeof module !== 'undefined') module.exports = MoveFireExpert;
