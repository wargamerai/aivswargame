// fire_calc.js — 射撃計算Expert
// ゲームの戦闘表(FIRE_COMBAT_TABLE)に基づいて、命中確率・期待損害を機械的に計算する
// 入力: 射手ユニット群、目標ユニット、距離、地形
// 出力: ダメージ確率（D/DD/E各確率）

var FireCalc = (function() {
  'use strict';

  // 戦闘表から確率を計算
  // fp: 合計火力, def: 目標防御力
  // 戻り: { pNothing, pD, pDD, pE } (各確率 0.0~1.0)
  function calcDamageProb(fp, def) {
    if (fp <= 0 || typeof FIRE_COMBAT_TABLE === 'undefined') {
      return { pNothing: 1, pD: 0, pDD: 0, pE: 0 };
    }
    var colIdx = getFPColumnIndex(fp);
    var nothing = 0, d = 0, dd = 0, e = 0;

    for (var roll = 0; roll <= 9; roll++) {
      var row = FIRE_COMBAT_TABLE[String(roll)];
      if (!row) { nothing++; continue; }
      var dmg = row[colIdx];
      if (dmg === 'E') {
        e++;
      } else if (typeof dmg === 'number') {
        if (dmg >= def + 3) e++;
        else if (dmg >= def + 2) dd++;
        else if (dmg >= def) d++;
        else nothing++;
      } else {
        nothing++;
      }
    }
    return {
      pNothing: nothing / 10,
      pD: d / 10,
      pDD: dd / 10,
      pE: e / 10
    };
  }

  // 射手群から目標への合計火力を計算
  // shooters: ユニット配列, target: ユニット, maxRange: 制限射程(省略可)
  function calcTotalFP(shooters, target) {
    var isArmored = (target.type === 'T' || target.type === 'AC');
    var totalFP = 0;

    for (var i = 0; i < shooters.length; i++) {
      var s = shooters[i];
      if (s.status === 'eliminated' || s.status === 'dd') continue;
      if (s.firedThisTurn || s._counterFired) continue;

      var dist = hexDistance(s.col, s.row, target.col, target.row);
      if (dist <= 0 || dist > (s.range || 1)) continue;
      if (!hasLOS(s.col, s.row, target.col, target.row)) continue;

      var fp = isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
      totalFP += fp;
    }
    return totalFP;
  }

  // 射手群から目標への射撃結果を予測
  // 戻り: { totalFP, def, prob: {pNothing, pD, pDD, pE}, canShoot: boolean }
  function evaluate(shooters, target) {
    var totalFP = calcTotalFP(shooters, target);
    var def = target.def || 5;

    if (totalFP <= 0) {
      return {
        totalFP: 0,
        def: def,
        prob: { pNothing: 1, pD: 0, pDD: 0, pE: 0 },
        canShoot: false
      };
    }

    return {
      totalFP: totalFP,
      def: def,
      prob: calcDamageProb(totalFP, def),
      canShoot: true
    };
  }

  // あるヘクスから射撃可能な敵一覧と各予測結果
  // units: 射手群(同一ヘクス), enemies: 敵ユニット全体
  // 戻り: [{target, totalFP, prob, priority}] (priority=期待損害降順)
  function findTargets(units, enemies) {
    var results = [];
    var checked = {}; // hexIdで重複排除

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.status === 'eliminated') continue;
      if (e.type === 'dummy' || e.type === 'leader') continue;

      var ehex = e.hexId || toHexId(e.col, e.row);
      if (checked[ehex]) continue;
      checked[ehex] = true;

      // 同一ヘクスの敵スタックから最も撃ちやすい目標を選択
      var eval_ = evaluate(units, e);
      if (!eval_.canShoot) continue;

      // 期待損害値 = pD*1 + pDD*2 + pE*3
      var expectedDamage = eval_.prob.pD * 1 + eval_.prob.pDD * 2 + eval_.prob.pE * 3;

      results.push({
        target: e,
        targetHex: ehex,
        totalFP: eval_.totalFP,
        prob: eval_.prob,
        expectedDamage: expectedDamage
      });
    }

    // 期待損害降順
    results.sort(function(a, b) { return b.expectedDamage - a.expectedDamage; });
    return results;
  }

  // 最適火力配分を計算
  // shooterGroups: [{hex, units}], enemies: 敵全体
  // 戻り: [{shooters, target, totalFP, prob}]
  function allocate(shooterGroups, enemies) {
    var assignments = [];
    var usedShooters = {};
    var targetedEnemies = {};

    // 各射手グループごとに最良ターゲットを見つける
    // まず全組み合わせの期待値を計算
    var candidates = [];
    for (var g = 0; g < shooterGroups.length; g++) {
      var group = shooterGroups[g];
      var targets = findTargets(group.units, enemies);
      for (var t = 0; t < targets.length; t++) {
        candidates.push({
          groupIdx: g,
          group: group,
          target: targets[t].target,
          targetHex: targets[t].targetHex,
          totalFP: targets[t].totalFP,
          prob: targets[t].prob,
          expectedDamage: targets[t].expectedDamage
        });
      }
    }

    // 期待損害降順でグリーディ割当
    candidates.sort(function(a, b) { return b.expectedDamage - a.expectedDamage; });

    for (var c = 0; c < candidates.length; c++) {
      var cand = candidates[c];
      if (usedShooters[cand.groupIdx]) continue;
      if (targetedEnemies[cand.targetHex]) continue;

      assignments.push({
        shooters: cand.group.units,
        target: cand.target,
        totalFP: cand.totalFP,
        prob: cand.prob
      });
      usedShooters[cand.groupIdx] = true;
      targetedEnemies[cand.targetHex] = true;
    }

    return assignments;
  }

  return {
    calcDamageProb: calcDamageProb,
    calcTotalFP: calcTotalFP,
    evaluate: evaluate,
    findTargets: findTargets,
    allocate: allocate
  };
})();

if (typeof module !== 'undefined') module.exports = FireCalc;
