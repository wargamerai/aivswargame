// support_expert.js — 支援射撃フェイズExpert
// 盤上砲兵・盤外砲兵の目標選定
//
// ゲームルール:
//   - 盤上砲兵(type='A'): 間接射撃、同一/隣接ヘクスの砲兵のみ協同可能(9-1-(5))
//   - 盤外砲兵: シナリオ定義、使用回数制限、combinable同士のみ合算(9-2-(5))
//   - 盤上と盤外は協同不可(9-2-(6))
//   - 目標ヘクス内の全敵ユニットに判定
//   - 地形修正あり（遮蔽地形は防御側に有利）
//   - 陣地があれば先に陣地判定、陣地が残ればユニット無傷
//
// AIの判断:
//   - どの敵ヘクスを目標にするか
//   - 砲兵をどうグループ化するか
//   - 盤外砲兵をいつ使うか（使用回数が限られる）

var SupportExpert = (function() {
  'use strict';

  // 敵ヘクスごとの価値を評価
  // 多くのユニットが集中しているヘクス、脅威度が高いユニットがいるヘクスを優先
  function evaluateTargetHex(hexId, side, board) {
    var enemySide = side === 'german' ? 'allied' : 'german';
    var enemies = testUnits.filter(function(u) {
      return (u.hexId || toHexId(u.col, u.row)) === hexId &&
             u.side === enemySide && u.status !== 'eliminated' &&
             u.type !== 'leader' && u.type !== 'dummy';
    });

    if (enemies.length === 0) return null;

    // 陣地チェック: 陣地があると砲撃効果が減る
    var hasFort = testUnits.some(function(u) {
      return (u.hexId || toHexId(u.col, u.row)) === hexId &&
             u.type === 'fortification' && u.status !== 'eliminated';
    });

    // 地形修正（遮蔽地形は砲撃が当たりにくい）
    var terrain = getHexTerrain(hexId);
    var terrainMod = typeof getTerrainFireMod === 'function' ? getTerrainFireMod(hexId) : 0;

    // 敵の総合脅威度
    var totalFP = 0;
    var totalDef = 0;
    var hasArmor = false;
    var disruptedCount = 0;
    var okCount = 0;

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      totalFP += (e.fpSoft || 0) + (e.fpAT || 0);
      totalDef += e.def || 0;
      if (e.type === 'T' || e.type === 'AC' || e.type === 'TD' ||
          e.type === 'SPG' || e.type === 'SPA' || e.type === 'HT') {
        hasArmor = true;
      }
      if (e.status === 'd' || e.status === 'dd') disruptedCount++;
      if (e.status === 'ok') okCount++;
    }

    return {
      hexId: hexId,
      enemies: enemies,
      enemyCount: enemies.length,
      totalFP: totalFP,
      totalDef: totalDef,
      hasArmor: hasArmor,
      hasFort: hasFort,
      terrainMod: terrainMod,
      terrain: terrain,
      disruptedCount: disruptedCount,
      okCount: okCount
    };
  }

  // 利用可能な盤上砲兵を取得
  function getAvailableArtillery(side) {
    return testUnits.filter(function(u) {
      return u.type === 'A' && u.side === side &&
             u.status !== 'eliminated' && !u.firedThisTurn;
    });
  }

  // 利用可能な盤外砲兵を取得
  function getAvailableOffBoard(side) {
    if (typeof SCENARIO_OFF_BOARD === 'undefined') return [];
    return SCENARIO_OFF_BOARD.filter(function(ob) {
      return ob.side === side && ob.usedCount < ob.uses;
    });
  }

  // 砲兵グループを作る（同一/隣接ヘクスの砲兵を協同）
  function groupArtillery(artillery) {
    if (artillery.length === 0) return [];

    var groups = [];
    var used = {};

    for (var i = 0; i < artillery.length; i++) {
      if (used[artillery[i].name]) continue;

      var group = [artillery[i]];
      used[artillery[i].name] = true;

      // 隣接する砲兵を探してグループに追加
      for (var j = i + 1; j < artillery.length; j++) {
        if (used[artillery[j].name]) continue;
        var dist = hexDistance(artillery[i].col, artillery[i].row,
                               artillery[j].col, artillery[j].row);
        if (dist <= 1) {
          group.push(artillery[j]);
          used[artillery[j].name] = true;
        }
      }
      groups.push(group);
    }
    return groups;
  }

  // 盤外砲兵グループを作る（combinable同士のみ合算）
  function groupOffBoard(offBoards) {
    if (offBoards.length === 0) return [];

    var combinable = offBoards.filter(function(ob) { return ob.combinable; });
    var nonCombinable = offBoards.filter(function(ob) { return !ob.combinable; });

    var groups = [];

    // 合算可能なものは1グループ
    if (combinable.length > 0) {
      groups.push({ type: 'offBoard', units: combinable });
    }

    // 合算不可はそれぞれ単独
    for (var i = 0; i < nonCombinable.length; i++) {
      groups.push({ type: 'offBoard', units: [nonCombinable[i]] });
    }

    return groups;
  }

  // 砲兵グループの合計火力を計算
  function getGroupFP(group, isArmored) {
    var fp = 0;
    for (var i = 0; i < group.length; i++) {
      var u = group[i];
      if (u.fp !== undefined) {
        // 盤外砲兵
        fp += u.fp || 0;
      } else {
        // 盤上砲兵
        fp += isArmored ? (u.spAT || u.fpAT || 0) : (u.spSoft || u.fpSoft || 0);
      }
    }
    return fp;
  }

  // 目標選定の前提: 確率的に有利であること（火力と地形修正から期待ダメージを計算）
  // 前提を満たした上での優先順位:
  //   1. 敵迫撃砲（間接射撃で反撃できない砲兵を潰す）
  //   2. 射程の長いユニット（遠距離から撃たれる脅威を排除）
  //   3. 4ユニットスタック（1回の砲撃で最大効果）
  function selectTargets(side, board, availableFP) {
    var enemySide = side === 'german' ? 'allied' : 'german';

    // 全敵ヘクスを収集
    var enemyHexes = {};
    testUnits.forEach(function(u) {
      if (u.side !== enemySide || u.status === 'eliminated' ||
          u.type === 'leader' || u.type === 'dummy') return;
      var hid = u.hexId || toHexId(u.col, u.row);
      enemyHexes[hid] = true;
    });

    // 各ヘクスを評価
    var targets = [];
    for (var hid in enemyHexes) {
      var eval_ = evaluateTargetHex(hid, side, board);
      if (eval_) {
        // 確率的に有利か判定: 火力と地形修正から期待値を計算
        // 戦闘表で火力が地形修正後にダメージを与えられるか
        eval_.favorable = isFavorable(availableFP || 0, eval_.terrainMod, eval_.totalDef, eval_.enemyCount);

        // 迫撃砲（砲兵 type='A'）が含まれるか
        eval_.hasMortar = eval_.enemies.some(function(e) {
          return e.type === 'A';
        });

        // 最大射程
        eval_.maxRange = 0;
        for (var i = 0; i < eval_.enemies.length; i++) {
          var r = eval_.enemies[i].range || 0;
          if (r > eval_.maxRange) eval_.maxRange = r;
        }

        targets.push(eval_);
      }
    }

    // 確率的に不利な目標を除外（陣地ありで火力不足等）
    var favorableTargets = targets.filter(function(t) { return t.favorable; });
    // 有利な目標がなければ全目標を残す（何もしないより撃つ）
    if (favorableTargets.length > 0) targets = favorableTargets;

    // ソート: 迫撃砲 > 射程長い > 4ユニットスタック
    targets.sort(function(a, b) {
      // 迫撃砲を最優先
      if (a.hasMortar && !b.hasMortar) return -1;
      if (!a.hasMortar && b.hasMortar) return 1;
      // 射程が長いユニットを優先
      if (a.maxRange !== b.maxRange) return b.maxRange - a.maxRange;
      // ユニット数が多いヘクスを優先（4スタック）
      if (a.enemyCount !== b.enemyCount) return b.enemyCount - a.enemyCount;
      // 陣地なしを優先
      if (!a.hasFort && b.hasFort) return -1;
      if (a.hasFort && !b.hasFort) return 1;
      // 地形修正が小さいヘクスを優先（当たりやすい）
      return a.terrainMod - b.terrainMod;
    });

    return targets;
  }

  // 確率的に有利かどうか判定
  // 火力が地形修正を考慮しても効果を期待できるか
  function isFavorable(fp, terrainMod, totalDef, enemyCount) {
    if (fp <= 0) return false;
    // 陣地がある場合は別途判定されるのでここでは火力vs防御だけ見る
    // 戦闘表の仕組み: ダイス(0-9) + terrainMod でダメージレベルを決定
    // 大まかな目安: fp >= totalDef/enemyCount なら1体あたりに効果あり
    // 地形修正が大きい（防御有利）と命中率が下がる
    var effectiveChance = 10 - Math.max(0, terrainMod); // 地形修正分だけ有効ダイス目が減る
    // 火力が低すぎる場合は不利
    if (fp < 2 && effectiveChance < 5) return false;
    // 最低限50%以上の確率でダメージを期待
    return effectiveChance >= 5;
  }

  // メイン分析: 砲兵の射撃割り当てを生成
  // 戻り: {
  //   assignments: [{group, target, groupFP, reason}],
  //   offBoardAssignments: [{group, target, groupFP, reason}],
  //   holdOffBoard: boolean (盤外砲兵を温存するか)
  // }
  function analyze(side, board) {
    var artillery = getAvailableArtillery(side);
    var offBoards = getAvailableOffBoard(side);

    // 利用可能な最大火力を計算（目標選定の確率判定に使う）
    var maxFP = 0;
    artillery.forEach(function(u) { maxFP += (u.spSoft || u.fpSoft || 0); });
    offBoards.forEach(function(ob) { maxFP += ob.fp || 0; });

    var targets = selectTargets(side, board, maxFP);

    if (targets.length === 0) {
      return { assignments: [], offBoardAssignments: [], holdOffBoard: true };
    }

    var assignments = [];

    // 盤上砲兵のグループ化と割り当て
    var artGroups = groupArtillery(artillery);
    var targetIdx = 0;

    for (var i = 0; i < artGroups.length; i++) {
      if (targetIdx >= targets.length) break;
      var target = targets[targetIdx];

      // 射程チェック: グループ内の全砲兵が目標に届くか
      var inRange = artGroups[i].every(function(u) {
        var dist = hexDistance(u.col, u.row,
                               fromHexId(target.hexId).col, fromHexId(target.hexId).row);
        return dist <= (u.range || 1);
      });

      if (!inRange) continue;

      var fp = getGroupFP(artGroups[i], target.hasArmor);
      assignments.push({
        group: artGroups[i],
        target: target,
        groupFP: fp,
        reason: target.okCount + '個正常ユニット, FP' + target.totalFP + '脅威'
      });
      targetIdx++;
    }

    // 盤外砲兵の判断
    // 温存条件: 序盤（ターン1-2）で高価値目標がない場合
    var offBoardAssignments = [];
    var holdOffBoard = false;

    if (offBoards.length > 0) {
      // 高価値目標があるか判定
      var highValueTarget = targets.find(function(t) {
        return t.okCount >= 2 && !t.hasFort;
      });

      if (!highValueTarget && G.turn <= 2) {
        // 序盤で高価値目標がなければ温存
        holdOffBoard = true;
      } else {
        var obGroups = groupOffBoard(offBoards);
        var obTargetIdx = 0;
        // 盤上砲兵が割り当てられなかった目標から選ぶ
        for (var j = 0; j < obGroups.length; j++) {
          // 未割り当ての最優先目標を探す
          var obTarget = null;
          for (var k = 0; k < targets.length; k++) {
            var alreadyAssigned = assignments.some(function(a) {
              return a.target.hexId === targets[k].hexId;
            });
            if (!alreadyAssigned || targets[k].okCount >= 2) {
              obTarget = targets[k];
              break;
            }
          }
          if (!obTarget) obTarget = targets[0]; // 最優先目標に重複投入

          var obFP = getGroupFP(obGroups[j].units, obTarget.hasArmor);
          offBoardAssignments.push({
            group: obGroups[j].units,
            target: obTarget,
            groupFP: obFP,
            reason: (holdOffBoard ? '温存推奨だが' : '') +
                    obTarget.okCount + '個正常ユニット, ' +
                    (obTarget.hasFort ? '陣地あり注意' : '陣地なし')
          });
        }
      }
    }

    return {
      assignments: assignments,
      offBoardAssignments: offBoardAssignments,
      holdOffBoard: holdOffBoard
    };
  }

  return {
    evaluateTargetHex: evaluateTargetHex,
    getAvailableArtillery: getAvailableArtillery,
    getAvailableOffBoard: getAvailableOffBoard,
    groupArtillery: groupArtillery,
    groupOffBoard: groupOffBoard,
    selectTargets: selectTargets,
    analyze: analyze
  };
})();

if (typeof module !== 'undefined') module.exports = SupportExpert;
