// ai_sc1.js — シナリオ1「赤軍の反抗」専用AI
// GE 4両(Pz III/J×2, Pz IV/H×2) vs SU 10両(KV-1C×2, T34/76×5, SU-76×3)
// 勝利条件: 先に50%撃破
//
// ソ連戦術: 森(col4-6,row8-12)の中にひたすら隠れる
//   → ドイツが森に隣接 or 迂回して射界を取るまで一切動かない・撃たない
//   → 敵が来たら一斉に突撃して数で押しつぶす → 終わったら森に戻る
// ドイツ戦術: 森・丘を利用して接近 → 有利な距離で攻撃

// ============================================================
//  定数
// ============================================================
// ソ連集結地点: Map Aの森ヘクス（ここに隠れる）
var SC1_RALLY_HEXES = [
  [4,8],[4,9],[5,9],[5,10],[5,11],[5,12],[6,9],[6,10],[6,11],[6,12]
];

// ============================================================
//  ユーティリティ
// ============================================================
function sc1_isRallyHex(col, row) {
  return SC1_RALLY_HEXES.some(function(h) { return h[0] === col && h[1] === row; });
}
// 最寄りの森ヘクスまでの距離
function sc1_distToRally(col, row) {
  var minD = Infinity;
  for (var i = 0; i < SC1_RALLY_HEXES.length; i++) {
    var d = hexDist(col, row, SC1_RALLY_HEXES[i][0], SC1_RALLY_HEXES[i][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

// ドイツが射界に入ったか判定
// 条件: ゴールヘクスにいるソ連ユニットからドイツにLOSが通る
function sc1_isGermanFlanking() {
  var enemies = state.units.filter(function(u) {
    return u.side === 'ge' && u.status !== 'destroyed' && u.col >= 1;
  });
  var allies = state.units.filter(function(u) {
    return u.side !== 'ge' && u.status !== 'destroyed' && u.col >= 1;
  });
  for (var ai = 0; ai < allies.length; ai++) {
    var a = allies[ai];
    // ドイツが2ヘクス以内に接近したら発動
    for (var ei = 0; ei < enemies.length; ei++) {
      var e = enemies[ei];
      if (hexDist(a.col, a.row, e.col, e.row) <= 2) return true;
    }
    if (!sc1_isGoalHex(a.col, a.row)) continue;
    for (var ei = 0; ei < enemies.length; ei++) {
      var e = enemies[ei];
      if (hasLOS(a.col, a.row, e.col, e.row)) return true;
    }
  }
  return false;
}

// ============================================================
//  準備射撃判定 (phase_gun.html用)
// ============================================================
function aiCalcPrepFireFlags() {
  var enemies = state.units.filter(function(e) {
    return e.side !== activeSide && e.status !== 'destroyed' && e.col >= 1;
  });
  if (enemies.length === 0) return;

  // ソ連: ドイツが迂回してくるまで一切撃たない
  var suPassive = (activeSide !== 'ge') && !sc1_isGermanFlanking();

  for (var fi = 0; fi < firers.length; fi++) {
    var firer = state.units[firers[fi]];
    var fDb = UNIT_DB[firer.name];
    if (!fDb || firer.status === 'destroyed') continue;

    // ソ連待ち伏せモード: 射撃しない
    if (suPassive) {
      firer._prepFireRecommended = false;
      continue;
    }

    var curFt = FIRE_TABLE[firer.name];

    // 現在地から各敵への最良effHit（LOS＋射界＋地形修正込み）
    var bestCurEffHit = 0;
    for (var ei = 0; ei < enemies.length; ei++) {
      var en = enemies[ei];
      if (!hasLOS(firer.col, firer.row, en.col, en.row)) continue;
      if (fDb.turret === 'fixed' && typeof canFireAt === 'function') {
        if (!canFireAt(firer, en)) continue;
      }
      var dist = hexDist(firer.col, firer.row, en.col, en.row);
      var dk = distKey(dist);
      if (!curFt || dk < 0 || !curFt[dk]) continue;
      var enDb = UNIT_DB[en.name];
      var eTerrain = state.terrain ? (state.terrain[en.col + ',' + en.row] || 'plain') : 'plain';
      var eMod = 0;
      if (eTerrain === 'forest') eMod += HIT_MODIFIERS.forest;
      if (eTerrain === 'building') eMod += HIT_MODIFIERS.building;
      eMod += countBocage(firer.col, firer.row, en.col, en.row);
      if (enDb && enDb.small) eMod += HIT_MODIFIERS.smallTarget;
      var effHit = curFt[dk][1] - eMod;
      if (effHit > bestCurEffHit) bestCurEffHit = effHit;
    }

    if (bestCurEffHit >= 7) {
      firer._prepFireRecommended = true;
      continue;
    }

    firer._prepFireRecommended = false;
  }
}

// ============================================================
//  目標選択 (phase_gun.html用)
// ============================================================
function aiFindBestTarget(firerIdx) {
  var firer = state.units[firerIdx];
  var fDb = UNIT_DB[firer.name];
  var bestScore = -Infinity, bestIdx = -1;
  var bestMode = 'he';

  for (var ti2 = 0; ti2 < targets.length; ti2++) {
    var ti = targets[ti2];
    var target = state.units[ti];
    if (target.status === 'destroyed' || target.col < 1) continue;

    var dist = hexDist(firer.col, firer.row, target.col, target.row);
    var tDb = UNIT_DB[target.name];

    if (!hasLOS(firer.col, firer.row, target.col, target.row)) continue;

    // 準備射撃: フラグチェック
    var remainTurns = (state.maxTurns || 99) - (state.turn || 1);
    if (!isAdvanceFire && remainTurns > 2 && target.status !== 'immobilized') {
      if (!firer._prepFireRecommended) continue;
    }

    // 前進射撃: 低撃破率は撃たない（弾切れ防止）
    if (isAdvanceFire && fDb.type !== 'infantry' && target.status !== 'immobilized') {
      var estKill_af = 0;
      var di_af = distKey(dist);
      if (di_af >= 0 && FIRE_TABLE[firer.name] && FIRE_TABLE[firer.name][di_af]) {
        var rawHit = FIRE_TABLE[firer.name][di_af][1];
        var afMod = HIT_MODIFIERS.advanceFire[fDb.nation] || 2;
        var tTerrain_af = state.terrain ? (state.terrain[target.col + ',' + target.row] || 'plain') : 'plain';
        if (tTerrain_af === 'forest') afMod += HIT_MODIFIERS.forest;
        if (tTerrain_af === 'building') afMod += HIT_MODIFIERS.building;
        var bc_af = countBocage(firer.col, firer.row, target.col, target.row);
        if (bc_af > 0) afMod += bc_af * HIT_MODIFIERS.bocage;
        if (tDb.small) afMod += HIT_MODIFIERS.smallTarget;
        var effHit_af = rawHit - afMod;
        var hitProb_af = effHit_af >= 12 ? 1 : effHit_af <= 1 ? 0 : (DICE_2D6_CUM[effHit_af] || 0);

        if (tDb.type === 'infantry' || tDb.type === 'atgun') {
          var kp = fDb.antiInf >= 12 ? 1 : fDb.antiInf <= 1 ? 0 : (DICE_2D6_CUM[fDb.antiInf] || 0);
          estKill_af = hitProb_af * kp;
        } else {
          var pen_af = FIRE_TABLE[firer.name][di_af][0];
          var frontHit_af = isHittingFrontArmor(firer, target);
          var armor_af = tDb.armor - (frontHit_af !== false ? 0 : 2);
          var penDiff_af = pen_af - Math.max(0, armor_af);
          var dKey_af = String(Math.max(-3, Math.min(3, penDiff_af)));
          var dt_af = DESTRUCTION_TABLE[dKey_af];
          estKill_af = hitProb_af * ((dt_af.destroyed[1] - dt_af.destroyed[0] + 1) / 11);
        }
      }
      if (estKill_af < 0.30) continue;
    }

    // 歩兵射撃
    if (fDb.type === 'infantry') {
      if (tDb.type === 'tank' || tDb.type === 'apc') {
        var table_i = INF_VS_TANK[fDb.nation];
        if (!table_i || table_i[dist] === undefined) continue;
        var score_i = table_i[dist] - dist;
        if (score_i > bestScore) { bestScore = score_i; bestIdx = ti; bestMode = 'he'; }
      } else {
        var key_i = fDb.nation + '_inf';
        var table_i2 = ANTI_INF_TABLE[key_i];
        if (!table_i2 || table_i2[dist] === undefined) continue;
        var score_i2 = table_i2[dist] - dist;
        if (score_i2 > bestScore) { bestScore = score_i2; bestIdx = ti; bestMode = 'he'; }
      }
      continue;
    }

    // 対歩兵
    if (tDb.type === 'infantry' || tDb.type === 'atgun') {
      if (!canFireAt(firer, target)) continue;
      var hasMG = !fDb.noMG;
      var mgTable = ANTI_INF_TABLE.tankMG;
      if (hasMG && mgTable && mgTable[dist] !== undefined) {
        var mgScore = mgTable[dist] - dist + 5;
        if (mgScore > bestScore) { bestScore = mgScore; bestIdx = ti; bestMode = 'mg'; }
      }
      if (dist > 0) {
        var di_inf = distKey(dist);
        if (di_inf >= 0 && FIRE_TABLE[firer.name] && FIRE_TABLE[firer.name][di_inf]) {
          var heScore = fDb.antiInf - dist + 3;
          if (heScore > bestScore) { bestScore = heScore; bestIdx = ti; bestMode = 'he'; }
        }
      } else if (!hasMG) {
        continue;
      }
      continue;
    }

    // 戦車/砲の射撃評価
    var di = distKey(dist);
    if (di < 0 || !FIRE_TABLE[firer.name]) continue;
    var ft = FIRE_TABLE[firer.name][di];
    if (!ft) continue;

    if (!canFireAt(firer, target)) continue;

    var frontHit = isHittingFrontArmor(firer, target);
    var chance = calcKillChance(firer.name, target.name, dist, frontHit);

    var score = chance.kill * 100;
    if (target.status === 'immobilized') score += 20;
    score -= dist;
    var enChance = calcKillChance(target.name, firer.name, dist, true);
    if (enChance.kill > 0.1) score += 15;

    if (score > bestScore) { bestScore = score; bestIdx = ti; bestMode = 'he'; }
  }

  return { idx: bestIdx, mode: bestMode };
}

// ============================================================
//  位置比較
// ============================================================
function isBetter(a, b) {
  if (!b) return true;
  if (!a) return false;
  if (a.advantage > b.advantage) return true;
  if (a.advantage < b.advantage) return false;
  if (a.effHit > b.effHit) return true;
  if (a.effHit < b.effHit) return false;
  if ((a.terrainBonus || 0) > (b.terrainBonus || 0)) return true;
  if ((a.terrainBonus || 0) < (b.terrainBonus || 0)) return false;
  if (a.fixedArcBonus > b.fixedArcBonus) return true;
  if (a.fixedArcBonus < b.fixedArcBonus) return false;
  if (a.dist < b.dist) return true;
  return false;
}

// ============================================================
//  ヘクス評価 (phase_move.html用)
// ============================================================
function aiEvalPosition(u, db, col, row, enemies, bestDist) {
  var nearestDist = Infinity, primaryEnemy = null;
  for (var i = 0; i < enemies.length; i++) {
    var d = hexDist(col, row, enemies[i].col, enemies[i].row);
    if (d < nearestDist) { nearestDist = d; primaryEnemy = enemies[i]; }
  }
  if (!primaryEnemy) return null;

  var dd = nearestDist;
  var peDb = UNIT_DB[primaryEnemy.name];

  var myTerrain = state.terrain ? state.terrain[col + ',' + row] : null;
  var myTerrainMod = 0;
  if (myTerrain === 'forest' || myTerrain === 'building') myTerrainMod += 2;
  if (db.small) myTerrainMod += 1;

  var bestAdvantage = -Infinity;
  var bestEffHit = 0;

  for (var ei = 0; ei < enemies.length; ei++) {
    var en = enemies[ei];
    if (!hasLOS(col, row, en.col, en.row)) continue;

    if (db.turret === 'fixed' && typeof isInFixedArcMove === 'function') {
      if (!isInFixedArcMove(u, en.col, en.row)) continue;
    }

    var ed = hexDist(col, row, en.col, en.row);
    var edk = distKey(ed);
    var myFt2 = FIRE_TABLE[u.name];
    if (!myFt2 || edk < 0 || !myFt2[edk]) continue;
    var enDb2 = UNIT_DB[en.name];
    if (!enDb2) continue;

    var myPen = myFt2[edk][0];
    var enArmor = enDb2.armor || 0;
    var myPenDiff = Math.max(-3, Math.min(3, myPen - enArmor));

    var enemyCanShoot = hasLOS(en.col, en.row, col, row);
    if (enemyCanShoot && enDb2.turret === 'fixed' && typeof isInFixedArcMove === 'function') {
      if (!isInFixedArcMove(en, col, row)) enemyCanShoot = false;
    }

    var enPenDiff = -3;
    if (enemyCanShoot) {
      if (enDb2.type === 'infantry') {
        var atTbl = INF_VS_TANK[enDb2.nation || ''];
        if (atTbl && atTbl[ed] !== undefined) enPenDiff = 0;
      } else {
        var enFt = FIRE_TABLE[en.name];
        if (enFt && edk >= 0 && enFt[edk]) {
          var enPen = enFt[edk][0];
          var myArmor = db.armor || 0;
          enPenDiff = Math.max(-3, Math.min(3, enPen - myArmor));
        }
      }
    }

    var advantage = myPenDiff - enPenDiff;
    if (advantage > bestAdvantage) bestAdvantage = advantage;

    var enTerrain2 = state.terrain ? state.terrain[en.col + ',' + en.row] : null;
    var tMod = 0;
    if (enTerrain2 === 'forest' || enTerrain2 === 'building') tMod += 2;
    if (enDb2.small) tMod += 1;
    tMod += countBocage(col, row, en.col, en.row);
    var eff = myFt2[edk][1] - tMod;
    if (eff > bestEffHit) bestEffHit = eff;
  }

  var fixedArcBonus = 0;
  if (peDb && peDb.turret === 'fixed' && typeof isInFixedArcMove === 'function') {
    if (!isInFixedArcMove(primaryEnemy, col, row)) fixedArcBonus = 1;
  }

  var terrainBonus = 0;
  if (myTerrain === 'forest' || myTerrain === 'building') {
    terrainBonus = (db.armor <= 3) ? 2 : 1;
  }

  return {
    advantage: bestAdvantage > -Infinity ? bestAdvantage : -99,
    effHit: bestEffHit,
    sc5Score: 0,
    fixedArcBonus: fixedArcBonus,
    terrainBonus: terrainBonus,
    dist: dd
  };
}

// ============================================================
//  ソ連: 強制的に森の左4ヘクスへ移動してスタック
// ============================================================
// 目標ヘクス: 5ヘクスに各2体ずつ強制割り当て
var SC1_GOAL_HEXES = [[5,12],[5,11],[5,10],[4,9],[4,10]];

// ソ連ユニットのインデックスからゴールヘクスを取得（2体ずつ）
function sc1_getGoalHex(u) {
  var suUnits = state.units.filter(function(e) {
    return e.side !== 'ge' && e.status !== 'destroyed';
  });
  var idx = -1;
  for (var i = 0; i < suUnits.length; i++) {
    if (suUnits[i] === u) { idx = i; break; }
  }
  if (idx < 0) idx = 0;
  var hexIdx = Math.floor(idx / 2);
  if (hexIdx >= SC1_GOAL_HEXES.length) hexIdx = SC1_GOAL_HEXES.length - 1;
  return SC1_GOAL_HEXES[hexIdx];
}

function sc1_isGoalHex(col, row) {
  return SC1_GOAL_HEXES.some(function(h) { return h[0] === col && h[1] === row; });
}

function sc1_moveToForest(u, db, callback) {
  var goal = sc1_getGoalHex(u);
  // 既にゴールにいる → 動くな
  if (u.col === goal[0] && u.row === goal[1]) {
    console.log('[AI-sc1] ' + u.name + ' 待機 (' + u.col + ',' + u.row + ')');
    callback();
    return;
  }

  var visited = aiGetReachableHexes(u, db);
  var startKey = u.col + ',' + u.row;

  // ゴールに直接入れるか
  var goalKey = goal[0] + ',' + goal[1];
  if (visited[goalKey]) {
    console.log('[AI-sc1] ' + u.name + ' → ' + goalKey);
    var path = aiGetPath(visited, goalKey);
    if (path.length > 0) { aiFollowPath(u, db, path, callback); return; }
  }

  // ゴールに最も近いヘクスへ
  var bestKey = null;
  var bestDist = hexDist(u.col, u.row, goal[0], goal[1]);
  for (var key in visited) {
    if (key === startKey) continue;
    var v = visited[key];
    var d = hexDist(v.col, v.row, goal[0], goal[1]);
    if (d < bestDist) {
      bestKey = key; bestDist = d;
    }
  }

  if (!bestKey) {
    console.log('[AI-sc1] ' + u.name + ' 移動先なし');
    callback();
    return;
  }

  console.log('[AI-sc1] ' + u.name + ' → ' + bestKey);
  var path = aiGetPath(visited, bestKey);
  if (path.length === 0) { callback(); return; }
  aiFollowPath(u, db, path, callback);
}

// ============================================================
//  ソ連: 突撃（数で押しつぶす）
// ============================================================
function sc1_rushEnemy(u, db, callback) {
  var enemies = state.units.filter(function(e) {
    return e.side !== u.side && e.status !== 'destroyed' && e.col >= 1;
  });
  if (enemies.length === 0) { callback(); return; }

  var visited = aiGetReachableHexes(u, db);
  var startKey = u.col + ',' + u.row;
  var currentEval = aiEvalPosition(u, db, u.col, u.row, enemies, 1);

  var bestHexKey = null;
  var bestEval = currentEval;

  for (var key in visited) {
    if (key === startKey) continue;
    var v = visited[key];
    var ev = aiEvalPosition(u, db, v.col, v.row, enemies, 1);
    if (ev === null) continue;

    if (isBetter(ev, bestEval)) {
      bestEval = ev;
      bestHexKey = key;
    }
  }

  if (!bestHexKey) {
    console.log('[AI-sc1] ' + u.name + ' rush: 停止');
    callback();
    return;
  }

  console.log('[AI-sc1] ' + u.name + ' rush → ' + bestHexKey);
  var path = aiGetPath(visited, bestHexKey);
  if (path.length === 0) { callback(); return; }
  aiFollowPath(u, db, path, callback);
}

// ============================================================
//  ドイツ: 遮蔽物を利用して接近、有利な距離で攻撃
// ============================================================
function sc1_geMovement(u, db, callback) {
  var enemies = state.units.filter(function(e) {
    return e.side !== u.side && e.status !== 'destroyed' && e.col >= 1;
  });
  if (enemies.length === 0) { callback(); return; }

  var enemy = aiNearestEnemy(u);
  if (!enemy) { callback(); return; }
  var eDb = UNIT_DB[enemy.name];

  var bestDist = 3, bestValue = -Infinity;
  for (var dd = 1; dd <= 12; dd++) {
    var my = calcKillChance(u.name, enemy.name, dd, true);
    var en = eDb ? calcKillChance(enemy.name, u.name, dd, true) : { kill: 0 };
    var value = my.kill - en.kill;
    if (value > bestValue) { bestValue = value; bestDist = dd; }
  }

  var visited = aiGetReachableHexes(u, db);
  var startKey = u.col + ',' + u.row;
  var currentEval = aiEvalPosition(u, db, u.col, u.row, enemies, bestDist);

  var bestHexKey = null;
  var bestEval = currentEval;
  var groupLimit = state._aiGroupAdvanceLimit || 1;

  for (var key in visited) {
    if (key === startKey) continue;
    var v = visited[key];

    var dToEnemy = hexDist(v.col, v.row, enemy.col, enemy.row);
    if (dToEnemy < groupLimit) continue;

    var ev = aiEvalPosition(u, db, v.col, v.row, enemies, bestDist);
    if (ev === null) continue;

    if (isBetter(ev, bestEval)) {
      bestEval = ev;
      bestHexKey = key;
    }
  }

  if (!bestHexKey) {
    console.log('[AI-sc1] ' + u.name + '(GE) 停止');
    callback();
    return;
  }

  console.log('[AI-sc1] ' + u.name + '(GE) → ' + bestHexKey + ' adv=' + bestEval.advantage);
  var path = aiGetPath(visited, bestHexKey);
  if (path.length === 0) { callback(); return; }
  aiFollowPath(u, db, path, callback);
}

// ============================================================
//  移動判断メイン (phase_move.html用)
// ============================================================
function aiDoMovement(u, db, callback) {
  if (u.side === 'ge') {
    // ドイツはbase aiDoMovementを使用（LOS探索移動含む）
    _baseAiDoMovement(u, db, callback);
    return;
  }

  // === ソ連 ===
  var flanking = sc1_isGermanFlanking();

  if (!flanking) {
    // パッシブ: ひたすら森の中に隠れて待つ
    sc1_moveToForest(u, db, callback);
  } else {
    // アクティブ: 一斉突撃
    sc1_rushEnemy(u, db, callback);
  }
}

// ============================================================
//  配置計画 (phase_move.html用)
//  ソ連: 森に近い行(row 8-12)から侵入
//  ドイツ: デフォルト
// ============================================================
function aiPlanPlacement(u, db, reservedHexes) {
  var maxCol = state.mapMaxCol || 25;
  var maxRow = state.mapMaxRow || 16;
  var edge = u.enterEdge;
  if (!edge) return null;

  var isSoviet = (u.side !== 'ge');
  var goal = isSoviet ? sc1_getGoalHex(u) : null;

  var candidates = [];
  for (var r = 1; r <= maxRow; r++) {
    var c;
    if (edge === 'left') c = 1;
    else if (edge === 'right') c = maxCol;
    else if (edge === 'top') { c = r; r = 1; }
    else if (edge === 'bottom') { c = r; r = maxRow; }
    else continue;

    if (edge === 'left') c = 1;
    if (edge === 'right') c = maxCol;

    // ドイツのみスタック/予約チェック
    if (!isSoviet) {
      if (typeof checkStacking === 'function' && !checkStacking(c, r, u)) continue;
      var reserved = false;
      for (var ri = 0; ri < reservedHexes.length; ri++) {
        if (reservedHexes[ri].col === c && reservedHexes[ri].row === r) { reserved = true; break; }
      }
      if (reserved) continue;
    }

    var score = 0;

    if (isSoviet) {
      // ソ連: ゴールヘクスに最短の侵入ヘクスを選ぶ
      score = -hexDist(c, r, goal[0], goal[1]);
    } else {
      var enemies = state.units.filter(function(e) {
        return e.side !== u.side && e.status !== 'destroyed' && e.col >= 1;
      });
      if (enemies.length > 0) {
        var minD = Infinity;
        for (var ei = 0; ei < enemies.length; ei++) {
          var d = hexDist(c, r, enemies[ei].col, enemies[ei].row);
          if (d < minD) minD = d;
        }
        score = -minD;
      }
      var terrain = state.terrain ? state.terrain[c + ',' + r] : null;
      if (terrain === 'forest' || terrain === 'slope') score += 5;
    }

    candidates.push({ col: c, row: r, score: score });
  }

  if (candidates.length === 0) return null;
  candidates.sort(function(a, b) { return b.score - a.score; });
  return candidates[0];
}

console.log('[AI] ai_sc1.js loaded — シナリオ1専用AI（ソ連森隠れ待ち伏せ/ドイツ遮蔽接近）');
