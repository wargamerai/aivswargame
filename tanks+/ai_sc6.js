// ai_sc6.js — シナリオ6「プロポロフカ」軽量AI
// 最適化: 盤面スキャンは1ターン1回だけ。結果を全ユニットで共有。

var _sc6_cache = { turn: -1, side: '', goals: null };

// 盤面スキャン（1ターン1回だけ実行）
// 各敵ユニットへの「狙いやすさ」を計算し、目標リストを作る
function sc6_buildGoals(mySide) {
  var enemies = state.units.filter(function(e) {
    return e.side !== mySide && e.status !== 'destroyed' && e.col >= 1;
  });
  if (enemies.length === 0) return [];

  // 敵ユニットそのものを目標に。スコア=装甲の低さ（倒しやすい順）
  var goals = [];
  for (var i = 0; i < enemies.length; i++) {
    var en = enemies[i];
    var eDb = UNIT_DB[en.name];
    var armor = eDb ? eDb.armor : 0;
    var score = 10 - armor; // 装甲低い＝狙いやすい
    if (en.status === 'immobilized') score += 5;
    goals.push({ col: en.col, row: en.row, score: score, target: en });
  }
  goals.sort(function(a, b) { return b.score - a.score; });
  return goals;
}

function sc6_getGoals(mySide) {
  var turn = state.turn || 1;
  if (_sc6_cache.turn === turn && _sc6_cache.side === mySide && _sc6_cache.goals) {
    return _sc6_cache.goals;
  }
  _sc6_cache.turn = turn;
  _sc6_cache.side = mySide;
  _sc6_cache.goals = sc6_buildGoals(mySide);
  return _sc6_cache.goals;
}

// ユニットに目標を割り当て（均等分散）
function sc6_assignGoal(u) {
  var goals = sc6_getGoals(u.side);
  if (goals.length === 0) return null;

  // 自分に最も近い目標を選ぶ（ただし装甲低い目標を少し優先）
  var best = null, bestScore = -Infinity;
  for (var i = 0; i < goals.length; i++) {
    var g = goals[i];
    var d = hexDist(u.col, u.row, g.col, g.row);
    var score = g.score - d * 0.5;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

// ============================================================
//  準備射撃: LOS通って命中数3以上の敵がいれば撃つ
// ============================================================
function aiCalcPrepFireFlags() {
  var enemies = state.units.filter(function(e) {
    return e.side !== activeSide && e.status !== 'destroyed' && e.col >= 1;
  });
  for (var fi = 0; fi < firers.length; fi++) {
    var firer = state.units[firers[fi]];
    if (!firer || firer.status === 'destroyed') { continue; }
    firer._prepFireRecommended = false;
    var curFt = FIRE_TABLE[firer.name];
    if (!curFt) continue;
    for (var ei = 0; ei < enemies.length; ei++) {
      var en = enemies[ei];
      if (!hasLOS(firer.col, firer.row, en.col, en.row)) continue;
      var dist = hexDist(firer.col, firer.row, en.col, en.row);
      var dk = distKey(dist);
      if (dk < 0 || !curFt[dk]) continue;
      var enDb = UNIT_DB[en.name];
      var tMod = 0;
      var tTerrain = state.terrain ? (state.terrain[en.col+','+en.row] || 'plain') : 'plain';
      if (tTerrain === 'forest') tMod += 2;
      if (tTerrain === 'building') tMod += 2;
      if (enDb && enDb.small) tMod += 1;
      if (curFt[dk][1] - tMod >= 3) {
        firer._prepFireRecommended = true;
        break;
      }
    }
  }
}

// ============================================================
//  目標選択: 近くて装甲の低い敵を優先
// ============================================================
function aiFindBestTarget(firerIdx) {
  var firer = state.units[firerIdx];
  var fDb = UNIT_DB[firer.name];
  var curFt = FIRE_TABLE[firer.name];
  var bestScore = -Infinity, bestIdx = -1;

  for (var ti2 = 0; ti2 < targets.length; ti2++) {
    var ti = targets[ti2];
    var target = state.units[ti];
    if (target.status === 'destroyed' || target.col < 1) continue;
    var dist = hexDist(firer.col, firer.row, target.col, target.row);
    if (dist > 30) continue;
    if (!hasLOS(firer.col, firer.row, target.col, target.row)) continue;
    if (fDb.turret === 'fixed' && typeof canFireAt === 'function') {
      if (!canFireAt(firer, target)) continue;
    }
    var tDb = UNIT_DB[target.name];

    // 歩兵射撃
    if (fDb.type === 'infantry') {
      if (tDb.type === 'tank' || tDb.type === 'apc') {
        var table_i = INF_VS_TANK[fDb.nation];
        if (!table_i || table_i[dist] === undefined) continue;
        if (table_i[dist] - dist > bestScore) { bestScore = table_i[dist] - dist; bestIdx = ti; }
      }
      continue;
    }

    // 対歩兵MG
    if (tDb.type === 'infantry' || tDb.type === 'atgun') {
      if (!canFireAt(firer, target)) continue;
      var mgTable = ANTI_INF_TABLE.tankMG;
      if (!fDb.noMG && mgTable && mgTable[dist] !== undefined) {
        var mgScore = mgTable[dist] - dist + 5;
        if (mgScore > bestScore) { bestScore = mgScore; bestIdx = ti; }
      }
      continue;
    }

    // 戦車射撃: 基本命中数2以下は除外
    var dk = distKey(dist);
    if (!curFt || dk < 0 || !curFt[dk]) continue;
    if (curFt[dk][1] <= 2) continue;
    if (!canFireAt(firer, target)) continue;
    var pen = curFt[dk][0];
    var armor = tDb.armor || 0;
    var frontHit = isHittingFrontArmor(firer, target);
    if (!frontHit) armor = Math.max(0, armor - 2);
    var score = (pen - armor) * 3 - dist;
    if (target.status === 'immobilized') score += 10;
    if (!frontHit) score += 5;
    if (score > bestScore) { bestScore = score; bestIdx = ti; }
  }

  return { idx: bestIdx, mode: 'he' };
}

// ============================================================
//  位置比較
// ============================================================
function isBetter(a, b) {
  if (!b) return true;
  if (!a) return false;
  return a.score > b.score;
}

// ============================================================
//  ヘクス評価（base AIから呼ばれた場合の保険）
// ============================================================
function aiEvalPosition(u, db, col, row, enemies, bestDist) {
  var minD = Infinity;
  for (var i = 0; i < enemies.length; i++) {
    var d = hexDist(col, row, enemies[i].col, enemies[i].row);
    if (d < minD) minD = d;
  }
  var terrain = state.terrain ? (state.terrain[col+','+row] || 'plain') : 'plain';
  var tBonus = 0;
  if (terrain === 'forest') tBonus = 3;
  else if (terrain === 'slope' || terrain === 'building') tBonus = 2;
  return { advantage: -minD, effHit: 0, sc5Score: 0, fixedArcBonus: 0, terrainBonus: tBonus, dist: minD, score: -minD + tBonus };
}

// ============================================================
//  移動: キャッシュ済み目標へ向かう。地形少し考慮。
// ============================================================
function aiDoMovement(u, db, callback) {
  var goal = sc6_assignGoal(u);
  if (!goal) { callback(); return; }

  var goalDist = hexDist(u.col, u.row, goal.col, goal.row);

  var visited = aiGetReachableHexes(u, db);
  var startKey = u.col + ',' + u.row;
  var bestKey = null, bestScore = -Infinity;

  for (var key in visited) {
    if (key === startKey) continue;
    var v = visited[key];
    var d = hexDist(v.col, v.row, goal.col, goal.row);
    var score = (goalDist - d) * 3; // 接近度
    var terrain = state.terrain ? (state.terrain[v.col+','+v.row] || 'plain') : 'plain';
    if (terrain === 'forest') score += 2;
    else if (terrain === 'slope' || terrain === 'building') score += 1;
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }

  if (!bestKey || bestScore <= 0) { callback(); return; }

  var path = aiGetPath(visited, bestKey);
  if (path.length === 0) { callback(); return; }
  aiFollowPath(u, db, path, callback);
}

// ============================================================
//  配置: enterHexRows範囲内で均等に散開
// ============================================================
function aiPlanPlacement(u, db, reservedHexes) {
  var maxCol = state.mapMaxCol || 25;
  var maxRow = state.mapMaxRow || 32;
  var edge = u.enterEdge;
  if (!edge) return null;

  var minRow = 1, maxR = maxRow;
  if (u.enterHexRows) {
    minRow = u.enterHexRows[0];
    maxR = u.enterHexRows[1];
  }

  var candidates = [];
  for (var r = minRow; r <= maxR; r++) {
    var c;
    if (edge === 'left') c = 1;
    else if (edge === 'right') c = maxCol;
    else if (edge === 'top') { c = r; r = 1; }
    else if (edge === 'bottom') { c = r; r = maxRow; }
    else continue;

    if (typeof checkStacking === 'function' && !checkStacking(c, r, u)) continue;
    var reserved = false;
    for (var ri = 0; ri < reservedHexes.length; ri++) {
      if (reservedHexes[ri].col === c && reservedHexes[ri].row === r) { reserved = true; break; }
    }
    if (reserved) continue;

    var midRow = (minRow + maxR) / 2;
    var score = -Math.abs(r - midRow) * 0.1;
    candidates.push({ col: c, row: r, score: score });
  }

  if (candidates.length === 0) return null;
  candidates.sort(function(a, b) { return b.score - a.score; });
  return candidates[0];
}

console.log('[AI] ai_sc6.js loaded — プロポロフカ軽量AI（共有スキャン方式）');
