// ===== ai_core.js — tanks+ 共通AI基本ロジック =====
// レイヤー1: 勝利条件判断 → 目標設定
// レイヤー2: 戦力比較 → 正面勝負 or 接近戦術
// シナリオ別AIからオーバーライド可能

'use strict';

// ============================================================
//  レイヤー1: 勝利条件に基づく目標判断
// ============================================================

// シナリオのvictoryTypeを取得
function mcGetVictoryType(side) {
  if (!state || !state.scenarioId) return 'destroy';
  var sc = SCENARIOS.find(function(s) { return s.id === state.scenarioId; });
  if (!sc || !sc.victoryType) return 'destroy';
  return sc.victoryType[side] || 'destroy';
}

// ============================================================
//  レイヤー2: ヘクス評価 — 命中率・破壊率ベースのポイント計算
// ============================================================

// --- 指定ヘクスでの自分→最寄り敵の撃破率を計算 ---
// terrainMod, 射界, LOS, 歩兵AT すべて考慮
function mcCalcMyKill(u, db, col, row, target) {
  var peDb = UNIT_DB[target.name];
  var dist = hexDist(col, row, target.col, target.row);
  if (!hasLOS(col, row, target.col, target.row)) return 0;
  // 固定砲塔の射界チェック
  if (db.turret === 'fixed') {
    if (typeof isInFixedArcMove === 'function' && !isInFixedArcMove(u, target.col, target.row)) return 0;
  }
  // 敵の地形修正
  var eTerrain = state.terrain ? (state.terrain[target.col + ',' + target.row] || '') : '';
  var eTerrainMod = 0;
  if (eTerrain === 'forest' || eTerrain === 'building') eTerrainMod += 2;
  if (peDb && peDb.small) eTerrainMod += 1;
  if (typeof countBocage === 'function') eTerrainMod += countBocage(col, row, target.col, target.row);

  var myKill = calcKillChance(u.name, target.name, dist, true, eTerrainMod).kill;

  // 歩兵AT（歩兵→戦車）
  if (db.type === 'infantry' && peDb && peDb.type === 'tank') {
    var atTable = INF_VS_TANK[db.nation || ''];
    if (atTable && atTable[dist] !== undefined) {
      var hitNum = atTable[dist];
      var atKill = hitNum >= 12 ? 1 : hitNum <= 1 ? 0 : (DICE_2D6_CUM[hitNum] || 0);
      if (atKill > myKill) myKill = atKill;
    }
  }
  return myKill;
}

// --- 指定ヘクスでの全敵→自分の最大撃破率 ---
function mcCalcMaxEnemyKill(u, db, col, row, enemies) {
  var myTerrain = state.terrain ? (state.terrain[col + ',' + row] || '') : '';
  var myTerrainMod = 0;
  if (myTerrain === 'forest' || myTerrain === 'building') myTerrainMod += 2;
  if (db.small) myTerrainMod += 1;

  var maxEnKill = 0;
  for (var i = 0; i < enemies.length; i++) {
    var enemy = enemies[i];
    var eDb = UNIT_DB[enemy.name];
    if (!eDb) continue;
    var ed = hexDist(col, row, enemy.col, enemy.row);
    if (ed < 1 || ed > 30) continue;
    if (!hasLOS(enemy.col, enemy.row, col, row)) continue;

    var tMod = myTerrainMod;
    if (typeof countBocage === 'function') tMod += countBocage(enemy.col, enemy.row, col, row);

    var enKill = 0;
    // 固定砲塔の射界チェック
    if (eDb.turret === 'fixed') {
      if (typeof isInFixedArcMove === 'function' && isInFixedArcMove(enemy, col, row)) {
        enKill = calcKillChance(enemy.name, u.name, ed, true, tMod).kill;
      }
    } else {
      enKill = calcKillChance(enemy.name, u.name, ed, true, tMod).kill;
    }
    // 歩兵AT（敵歩兵→自分が戦車）
    if (eDb.type === 'infantry' && db.type === 'tank') {
      var atTable = INF_VS_TANK[eDb.nation || ''];
      if (atTable && atTable[ed] !== undefined) {
        var hitNum = atTable[ed];
        var atKill = hitNum >= 12 ? 1 : hitNum <= 1 ? 0 : (DICE_2D6_CUM[hitNum] || 0);
        if (atKill > enKill) enKill = atKill;
      }
    }
    if (enKill > maxEnKill) maxEnKill = enKill;
  }
  return maxEnKill;
}

// --- 最寄りの敵を返す ---
function mcNearestEnemy(u, enemies) {
  var best = null, bestDist = Infinity;
  for (var i = 0; i < enemies.length; i++) {
    var d = hexDist(u.col, u.row, enemies[i].col, enemies[i].row);
    if (d < bestDist) { bestDist = d; best = enemies[i]; }
  }
  return best;
}

// --- ヘクス評価: 撃破率差分をポイント化 ---
// 戻り値: { score, myKill, enKill, dist, terrain }
function mcEvalHex(u, db, col, row, enemies) {
  // 最寄りの敵
  var nearestDist = Infinity, nearestEnemy = null;
  for (var i = 0; i < enemies.length; i++) {
    var d = hexDist(col, row, enemies[i].col, enemies[i].row);
    if (d < nearestDist) { nearestDist = d; nearestEnemy = enemies[i]; }
  }
  if (!nearestEnemy) return null;

  var myKill = mcCalcMyKill(u, db, col, row, nearestEnemy);
  var enKill = mcCalcMaxEnemyKill(u, db, col, row, enemies);

  // 基本スコア: 自分の撃破率 - 敵の撃破率
  var score = myKill - enKill;

  return {
    score: score,
    myKill: myKill,
    enKill: enKill,
    dist: nearestDist
  };
}

// ============================================================
//  準備射撃 vs 前進射撃 の判断
// ============================================================

// 前進射撃ペナルティ込みの撃破率を計算
function mcCalcAdvanceFireKill(u, db, col, row, target) {
  var peDb = UNIT_DB[target.name];
  var dist = hexDist(col, row, target.col, target.row);
  if (!hasLOS(col, row, target.col, target.row)) return 0;
  if (db.turret === 'fixed') {
    if (typeof isInFixedArcMove === 'function' && !isInFixedArcMove(u, target.col, target.row)) return 0;
  }

  var di = distKey(dist);
  if (di < 0) return 0;
  var ft = FIRE_TABLE[u.name];
  if (!ft || !ft[di]) return 0;

  // 命中修正: 前進射撃 + 地形 + ボカージュ + 小型
  var afMod = 0;
  if (db.type === 'infantry') {
    afMod += HIT_MODIFIERS.advanceFire.infantry || 1;
  } else {
    afMod += HIT_MODIFIERS.advanceFire[db.nation] || 2;
  }
  var eTerrain = state.terrain ? (state.terrain[target.col + ',' + target.row] || '') : '';
  if (eTerrain === 'forest') afMod += HIT_MODIFIERS.forest;
  if (eTerrain === 'building') afMod += HIT_MODIFIERS.building;
  if (typeof countBocage === 'function') afMod += countBocage(col, row, target.col, target.row);
  if (peDb && peDb.small) afMod += HIT_MODIFIERS.smallTarget;

  var rawHit = ft[di][1];
  var effHit = rawHit - afMod;
  var hitProb = effHit >= 12 ? 1 : effHit <= 1 ? 0 : (DICE_2D6_CUM[effHit] || 0);
  if (hitProb <= 0) return 0;

  // 歩兵・対戦車砲への射撃
  if (peDb && (peDb.type === 'infantry' || peDb.type === 'atgun')) {
    var kp = db.antiInf >= 12 ? 1 : db.antiInf <= 1 ? 0 : (DICE_2D6_CUM[db.antiInf] || 0);
    return hitProb * kp;
  }

  // 戦車への射撃: 貫通→撃破判定
  var pen = ft[di][0];
  var armor = (peDb ? peDb.armor : 0) - 0; // 正面装甲
  var penDiff = pen - Math.max(0, armor);
  var dKey = String(Math.max(-3, Math.min(3, penDiff)));
  var dt = DESTRUCTION_TABLE[dKey];
  var destroyProb = DICE_2D6_CUM[dt.destroyed[1]] || 0;
  return hitProb * destroyProb;
}

// ============================================================
//  メイン判断: 移動範囲総当たりで最適行動を決定
// ============================================================

// ============================================================
//  強敵モード: 全敵に対してMC比較、最も効率よく破壊できる敵を優先
//  盤面全体スキャンで効率よく敵を倒せるルートを探す
// ============================================================

// 戻り値: { action: 'prepFire'|'move', targetHex, mapGoal, score, targetEnemy }
function mcDecideAction(u, db, enemies, reachable) {
  if (!enemies || enemies.length === 0) return { action: 'prepFire', score: 0 };

  // --- 準備射撃で撃破見込みがあるかチェック ---
  var bestPrepKill = 0;
  var bestPrepTarget = null;
  for (var ei = 0; ei < enemies.length; ei++) {
    var en = enemies[ei];
    var myKill = mcCalcMyKill(u, db, u.col, u.row, en);
    if (myKill > bestPrepKill) { bestPrepKill = myKill; bestPrepTarget = en; }
  }

  // 準備射撃で撃てる相手がいなければ移動モード（比較しない）
  if (bestPrepKill <= 0) {
    console.log('[MC] ' + u.name + ' 準備射撃不可 → 移動モード');
  }

  // --- 全敵に対して盤面スキャン: 各敵ごとに最善ヘクスを求める ---
  var maxCol = state.mapMaxCol || 25;
  var maxRow = state.mapMaxRow || 16;
  var bestTarget = null;
  var bestGoal = null;
  var bestGoalAdv = -Infinity;

  for (var ti = 0; ti < enemies.length; ti++) {
    var target = enemies[ti];
    // この敵に対して盤面全体で最善のヘクスを探す
    for (var c = 1; c <= maxCol; c++) {
      for (var r = 1; r <= maxRow; r++) {
        if (!hasLOS(c, r, target.col, target.row)) continue;
        var ed = hexDist(c, r, target.col, target.row);
        var enDb = UNIT_DB[target.name];
        if (!enDb) continue;

        // 自分の撃破率
        var myK = 0;
        var inArc = !(db.turret === 'fixed' && typeof isInFixedArcMove === 'function' && !isInFixedArcMove(u, target.col, target.row));
        if (inArc) {
          var eTerrain = state.terrain ? (state.terrain[target.col + ',' + target.row] || '') : '';
          var eMod = (eTerrain === 'forest' || eTerrain === 'building') ? 2 : 0;
          myK = calcKillChance(u.name, target.name, ed, true, eMod).kill;
        }
        if (myK > bestGoalAdv) {
          bestGoalAdv = myK;
          bestGoal = { col: c, row: r };
          bestTarget = target;
        }
      }
    }
  }

  console.log('[MC] ' + u.name + ' 強敵: prepKill=' + bestPrepKill.toFixed(3) +
    ' bestGoal=' + (bestGoal ? bestGoal.col + ',' + bestGoal.row : 'なし') +
    ' goalAdv=' + (bestGoalAdv === -Infinity ? '-Inf' : bestGoalAdv.toFixed(3)) +
    ' target=' + (bestTarget ? bestTarget.name : 'なし'));

  // --- 準備射撃で撃てるなら、現在位置が最善か確認 ---
  if (bestPrepKill > 0 && bestGoal) {
    if (bestPrepKill >= bestGoalAdv) {
      console.log('[MC] ' + u.name + ' 現在位置が最善 → 準備射撃');
      return { action: 'prepFire', score: bestPrepKill, targetEnemy: bestPrepTarget };
    }
  }

  // --- 到達可能ヘクスからbestGoalに最も近いヘクスを選ぶ ---
  if (bestGoal) {
    var startKey = u.col + ',' + u.row;
    var bestKey = null;
    var bestDist = hexDist(u.col, u.row, bestGoal.col, bestGoal.row);

    for (var key in reachable) {
      if (key === startKey) continue;
      var v = reachable[key];
      var blocked = state.units.some(function(o) {
        return o !== u && o.status !== 'destroyed' && o.col === v.col && o.row === v.row && o.col >= 1;
      });
      if (blocked) continue;
      var gd = hexDist(v.col, v.row, bestGoal.col, bestGoal.row);
      if (gd < bestDist) { bestDist = gd; bestKey = key; }
    }

    if (bestKey) {
      console.log('[MC] ' + u.name + ' → ' + bestKey + ' 目標(' + bestGoal.col + ',' + bestGoal.row + ')へ');
      return { action: 'move', targetHex: bestKey, mapGoal: bestGoal, score: bestGoalAdv, targetEnemy: bestTarget };
    }
  }

  // --- LOSヘクスがない → 最寄り敵に直接接近 ---
  var nearestEnemy = mcNearestEnemy(u, enemies);
  if (nearestEnemy) {
    var startKey2 = u.col + ',' + u.row;
    var closestKey = null;
    var closestDist = hexDist(u.col, u.row, nearestEnemy.col, nearestEnemy.row);
    for (var key2 in reachable) {
      if (key2 === startKey2) continue;
      var v2 = reachable[key2];
      var blocked2 = state.units.some(function(o) {
        return o !== u && o.status !== 'destroyed' && o.col === v2.col && o.row === v2.row && o.col >= 1;
      });
      if (blocked2) continue;
      var d2 = hexDist(v2.col, v2.row, nearestEnemy.col, nearestEnemy.row);
      if (d2 < closestDist) { closestKey = key2; closestDist = d2; }
    }
    if (closestKey) {
      return { action: 'move', targetHex: closestKey, score: 0 };
    }
  }

  return { action: 'prepFire', score: bestPrepKill || 0 };
}

// 元のcalcHexAdvを取り込み: 各ヘクスでの myKill - enKill（固定砲塔の射界考慮）
function mcCalcHexAdv(u, db, c, r, enemies) {
  var best = -Infinity;
  for (var ei = 0; ei < enemies.length; ei++) {
    var en = enemies[ei];
    if (!hasLOS(c, r, en.col, en.row)) continue;
    var ed = hexDist(c, r, en.col, en.row);
    var enDb2 = UNIT_DB[en.name];
    if (!enDb2) continue;
    // 自分が固定砲塔で射界外なら撃てない
    var myKill = 0;
    var myInArc = !(db.turret === 'fixed' && typeof isInFixedArcMove === 'function' && !isInFixedArcMove(u, en.col, en.row));
    if (myInArc) {
      var enTerrain = state.terrain ? (state.terrain[en.col + ',' + en.row] || '') : '';
      var enMod = (enTerrain === 'forest' || enTerrain === 'building') ? 2 : 0;
      myKill = calcKillChance(u.name, en.name, ed, true, enMod).kill;
    }
    // 敵が固定砲塔で射界外ならこちらは撃たれない
    var enKill = 0;
    var enInArc = !(enDb2.turret === 'fixed' && typeof isInFixedArcMove === 'function' && !isInFixedArcMove(en, c, r));
    if (enInArc) {
      var myTerrain = state.terrain ? (state.terrain[c + ',' + r] || '') : '';
      var myMod = (myTerrain === 'forest' || myTerrain === 'building') ? 2 : 0;
      enKill = calcKillChance(en.name, u.name, ed, true, myMod).kill;
    }
    var adv = myKill - enKill;
    if (adv > best) best = adv;
  }
  return best;
}

// ============================================================
//  戦力比較: 有利/不利の判定
// ============================================================

// 自軍 vs 敵軍の平均撃破率を比較
// 戻り値: 'advantage'（正面勝負有利）, 'disadvantage'（不利→接近戦術）
function mcAssessForceBalance(u, db, enemies) {
  if (!enemies || enemies.length === 0) return 'advantage';

  var nearestEnemy = mcNearestEnemy(u, enemies);
  if (!nearestEnemy) return 'advantage';

  // 各距離帯での撃破率差を比較
  var myBestKill = 0, enBestKill = 0;
  for (var d = 1; d <= 12; d++) {
    var eDb = UNIT_DB[nearestEnemy.name];
    var myChance = calcKillChance(u.name, nearestEnemy.name, d, true);
    var enChance = eDb ? calcKillChance(nearestEnemy.name, u.name, d, true) : { kill: 0 };
    if (myChance.kill > myBestKill) myBestKill = myChance.kill;
    if (enChance.kill > enBestKill) enBestKill = enChance.kill;
  }

  // 敵の最良撃破率が自分の2倍以上 → 不利
  if (enBestKill > myBestKill * 2 && enBestKill > 0.05) return 'disadvantage';
  return 'advantage';
}

// ============================================================
//  レイヤー2b: 接近戦術（不利側のロジック）
//  地形利用・射界回避・囮による接近
// ============================================================

// --- 敵の射界外かどうか判定 ---
// 固定砲塔の敵に対して射界の外にいるか
function mcIsOutsideEnemyArc(enemy, col, row) {
  var eDb = UNIT_DB[enemy.name];
  if (!eDb || eDb.turret !== 'fixed') return false; // 回転砲塔は射界制限なし
  if (typeof isInFixedArcMove === 'function') {
    return !isInFixedArcMove(enemy, col, row);
  }
  return false;
}

// --- 味方が敵のLOSを引きつけているか ---
// 敵が他の味方にLOSを持っている = この敵は囮に引きつけられている
function mcIsEnemyDistracted(enemy, u) {
  var allies = state.units.filter(function(a) {
    return a.side === u.side && a !== u && a.status !== 'destroyed' && a.col >= 1;
  });
  for (var i = 0; i < allies.length; i++) {
    if (hasLOS(enemy.col, enemy.row, allies[i].col, allies[i].row)) return true;
  }
  return false;
}

// ============================================================
//  弱者モード: 命中率50%以上・破壊率0以上のヘクスを目指す
//  盤面全体スキャンで攻撃を受けないルートを探す
// ============================================================

// 盤面スキャン: 命中率50%以上かつ破壊率>0になるヘクスを探す
function mcFindAttackHexes(u, db, enemies) {
  var maxCol = state.mapMaxCol || 25;
  var maxRow = state.mapMaxRow || 16;
  var results = [];

  for (var c = 1; c <= maxCol; c++) {
    for (var r = 1; r <= maxRow; r++) {
      for (var ei = 0; ei < enemies.length; ei++) {
        var en = enemies[ei];
        if (!hasLOS(c, r, en.col, en.row)) continue;
        var dist = hexDist(c, r, en.col, en.row);
        var di = distKey(dist);
        if (di < 0) continue;
        var ft = FIRE_TABLE[u.name];
        if (!ft || !ft[di]) continue;

        // 固定砲塔の射界チェック
        if (db.turret === 'fixed' && typeof isInFixedArcMove === 'function' && !isInFixedArcMove(u, en.col, en.row)) continue;

        // 命中率計算（地形修正込み）
        var eTerrain = state.terrain ? (state.terrain[en.col + ',' + en.row] || '') : '';
        var eMod = 0;
        if (eTerrain === 'forest' || eTerrain === 'building') eMod += 2;
        var enDb = UNIT_DB[en.name];
        if (enDb && enDb.small) eMod += 1;
        if (typeof countBocage === 'function') eMod += countBocage(c, r, en.col, en.row);
        var rawHit = ft[di][1];
        var effHit = rawHit - eMod;
        var hitProb = effHit >= 12 ? 1 : effHit <= 1 ? 0 : (DICE_2D6_CUM[effHit] || 0);

        // 命中率50%以上チェック
        if (hitProb < 0.5) continue;

        // 破壊率チェック: penDiff >= 0（貫通力が装甲以上）
        var pen = ft[di][0];
        var tArmor = enDb ? enDb.armor : 0;
        var penDiff = pen - tArmor;
        if (penDiff < 0) continue;

        var killChance = calcKillChance(u.name, en.name, dist, true, eMod);
        results.push({ col: c, row: r, target: en, hitProb: hitProb, kill: killChance.kill });
      }
    }
  }
  return results;
}

// 経路の安全性評価: 敵から攻撃を受けないヘクスかどうか
function mcIsHexSafe(u, db, col, row, enemies) {
  // 地形カバーがあるか
  var terrain = state.terrain ? (state.terrain[col + ',' + row] || '') : '';
  var hasCover = (terrain === 'forest' || terrain === 'building');

  // 敵からLOSがあるか
  var exposed = false;
  for (var i = 0; i < enemies.length; i++) {
    var en = enemies[i];
    if (hasLOS(en.col, en.row, col, row)) {
      // 固定砲塔の射界外ならセーフ
      var eDb = UNIT_DB[en.name];
      if (eDb && eDb.turret === 'fixed' && typeof isInFixedArcMove === 'function' && !isInFixedArcMove(en, col, row)) {
        continue;
      }
      // 味方が囮としてLOSを引きつけているか
      if (mcIsEnemyDistracted(en, u)) continue;
      exposed = true;
      break;
    }
  }

  // 安全: LOS外、または地形カバーあり、または射界外
  return !exposed || hasCover;
}

// 弱者モードのメイン判断
// 戻り値: { action: 'move'|'stay', targetHex, score }
function mcDecideApproach(u, db, enemies, reachable) {
  if (!enemies || enemies.length === 0) return { action: 'stay', score: 0 };

  // 攻撃可能ヘクス（命中50%以上・破壊率>0）を探す
  var attackHexes = mcFindAttackHexes(u, db, enemies);
  console.log('[MC] ' + u.name + ' 弱者: 攻撃可能ヘクス=' + attackHexes.length + '箇所');

  if (attackHexes.length === 0) {
    // 攻撃可能ヘクスがない → 最寄り敵に接近（安全経路で）
    var nearestEnemy = mcNearestEnemy(u, enemies);
    if (!nearestEnemy) return { action: 'stay', score: 0 };

    var startKey = u.col + ',' + u.row;
    var bestKey = null;
    var bestDist = hexDist(u.col, u.row, nearestEnemy.col, nearestEnemy.row);
    for (var key in reachable) {
      if (key === startKey) continue;
      var rh = reachable[key];
      var blocked = state.units.some(function(o) {
        return o !== u && o.status !== 'destroyed' && o.col === rh.col && o.row === rh.row && o.col >= 1;
      });
      if (blocked) continue;
      // 安全経路を優先
      if (!mcIsHexSafe(u, db, rh.col, rh.row, enemies)) continue;
      var d = hexDist(rh.col, rh.row, nearestEnemy.col, nearestEnemy.row);
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    // 安全なヘクスがなければ安全条件を外して接近
    if (!bestKey) {
      for (var key2 in reachable) {
        if (key2 === startKey) continue;
        var rh2 = reachable[key2];
        var blocked2 = state.units.some(function(o) {
          return o !== u && o.status !== 'destroyed' && o.col === rh2.col && o.row === rh2.row && o.col >= 1;
        });
        if (blocked2) continue;
        var d2 = hexDist(rh2.col, rh2.row, nearestEnemy.col, nearestEnemy.row);
        if (d2 < bestDist) { bestDist = d2; bestKey = key2; }
      }
    }
    if (bestKey) {
      console.log('[MC] ' + u.name + ' 弱者: 最寄り敵へ安全接近 → ' + bestKey);
      return { action: 'move', targetHex: bestKey, score: 0 };
    }
    return { action: 'stay', score: 0 };
  }

  // --- 攻撃可能ヘクスに到達可能か ---
  var startKey3 = u.col + ',' + u.row;
  var bestReachKey = null;
  var bestReachKill = 0;

  // 直接到達可能な攻撃ヘクスを探す
  for (var ai = 0; ai < attackHexes.length; ai++) {
    var ah = attackHexes[ai];
    var ahKey = ah.col + ',' + ah.row;
    if (reachable[ahKey]) {
      var blocked3 = state.units.some(function(o) {
        return o !== u && o.status !== 'destroyed' && o.col === ah.col && o.row === ah.row && o.col >= 1;
      });
      if (blocked3) continue;
      if (ah.kill > bestReachKill) { bestReachKill = ah.kill; bestReachKey = ahKey; }
    }
  }

  if (bestReachKey) {
    console.log('[MC] ' + u.name + ' 弱者: 攻撃ヘクス到達可能 → ' + bestReachKey + ' kill=' + bestReachKill.toFixed(3));
    return { action: 'move', targetHex: bestReachKey, score: bestReachKill };
  }

  // --- 到達できない → 最寄りの攻撃ヘクスに安全経路で接近 ---
  var closestAttack = null;
  var closestAttackDist = Infinity;
  for (var ai2 = 0; ai2 < attackHexes.length; ai2++) {
    var ah2 = attackHexes[ai2];
    var ad = hexDist(u.col, u.row, ah2.col, ah2.row);
    if (ad < closestAttackDist) { closestAttackDist = ad; closestAttack = ah2; }
  }

  if (closestAttack) {
    var bestApproachKey = null;
    var bestApproachDist = closestAttackDist;
    for (var akey in reachable) {
      if (akey === startKey3) continue;
      var arh = reachable[akey];
      var blocked4 = state.units.some(function(o) {
        return o !== u && o.status !== 'destroyed' && o.col === arh.col && o.row === arh.row && o.col >= 1;
      });
      if (blocked4) continue;
      // 安全経路優先
      if (!mcIsHexSafe(u, db, arh.col, arh.row, enemies)) continue;
      var apd = hexDist(arh.col, arh.row, closestAttack.col, closestAttack.row);
      if (apd < bestApproachDist) { bestApproachDist = apd; bestApproachKey = akey; }
    }
    // 安全なヘクスがなければ条件を外す
    if (!bestApproachKey) {
      for (var akey2 in reachable) {
        if (akey2 === startKey3) continue;
        var arh2 = reachable[akey2];
        var blocked5 = state.units.some(function(o) {
          return o !== u && o.status !== 'destroyed' && o.col === arh2.col && o.row === arh2.row && o.col >= 1;
        });
        if (blocked5) continue;
        var apd2 = hexDist(arh2.col, arh2.row, closestAttack.col, closestAttack.row);
        if (apd2 < bestApproachDist) { bestApproachDist = apd2; bestApproachKey = akey2; }
      }
    }
    if (bestApproachKey) {
      console.log('[MC] ' + u.name + ' 弱者: 攻撃ヘクス(' + closestAttack.col + ',' + closestAttack.row + ')へ安全接近 → ' + bestApproachKey);
      return { action: 'move', targetHex: bestApproachKey, score: 0 };
    }
  }

  return { action: 'stay', score: 0 };
}

console.log('[AI] ai_core.js loaded');
