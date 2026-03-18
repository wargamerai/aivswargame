// ai_sc2.js — シナリオ2「エレファント」専用AI
// GE: Ferdinand×3 突破、SU: 待ち伏せ
// 3パターン: center(中央突破), left(左下限定侵入), right(右下限定侵入)

// シナリオ開始時にランダムでパターン決定（1回だけ）
var _sc2_pattern = ['center', 'left', 'right'][Math.floor(Math.random() * 3)];
console.log('[AI-sc2] パターン決定: ' + _sc2_pattern);

// ============================================================
//  配置計画 (phase_move.html用)
// ============================================================
function aiPlanPlacement(u, db, reservedHexes) {
  var maxCol = state.mapMaxCol || 25;
  var maxRow = state.mapMaxRow || 16;
  var edge = u.enterEdge;
  if (!edge) return null;
  if (u.side !== 'ge') return null;

  // パターンに応じた候補列の範囲
  var colMin, colMax;
  if (_sc2_pattern === 'left') {
    colMin = 1;
    colMax = Math.floor(maxCol / 3);
  } else if (_sc2_pattern === 'right') {
    colMin = Math.ceil(maxCol * 2 / 3);
    colMax = maxCol;
  } else {
    colMin = 1;
    colMax = maxCol;
  }

  // bottom侵入の候補ヘクス
  var candidates = [];
  for (var c = colMin; c <= colMax; c++) {
    candidates.push({ col: c, row: maxRow });
  }

  // スタック・予約チェック
  var valid = [];
  for (var i = 0; i < candidates.length; i++) {
    var h = candidates[i];
    if (typeof checkStacking === 'function' && !checkStacking(h.col, h.row, u)) continue;
    var reservedCount = 0;
    for (var ri = 0; ri < reservedHexes.length; ri++) {
      if (reservedHexes[ri].col === h.col && reservedHexes[ri].row === h.row) reservedCount++;
    }
    if (reservedCount >= 2) continue;
    valid.push(h);
  }
  if (valid.length === 0) return null;

  // ソ連ユニットの位置を取得
  var enemies = state.units.filter(function(e) {
    return e.side !== 'ge' && e.status !== 'destroyed' && e.col >= 1;
  });

  if (enemies.length === 0) {
    var centerCol = Math.round((colMin + colMax) / 2);
    var best = valid[0];
    for (var i = 1; i < valid.length; i++) {
      if (Math.abs(valid[i].col - centerCol) < Math.abs(best.col - centerCol)) {
        best = valid[i];
      }
    }
    return best;
  }

  // 中央パターン: ソ連から遠く、分散時は中間を好む
  if (_sc2_pattern === 'center') {
    var minEnemyCol = Infinity, maxEnemyCol = 0;
    for (var i = 0; i < enemies.length; i++) {
      var ec = enemies[i].col;
      if (ec < minEnemyCol) minEnemyCol = ec;
      if (ec > maxEnemyCol) maxEnemyCol = ec;
    }

    var scored = [];
    for (var i = 0; i < valid.length; i++) {
      var h = valid[i];
      var minDist = Infinity;
      for (var ei = 0; ei < enemies.length; ei++) {
        var d = hexDist(h.col, h.row, enemies[ei].col, enemies[ei].row);
        if (d < minDist) minDist = d;
      }
      var spread = maxEnemyCol - minEnemyCol;
      var gapBonus = 0;
      if (spread >= 8) {
        var midCol = (minEnemyCol + maxEnemyCol) / 2;
        gapBonus = -Math.abs(h.col - midCol) * 0.5;
      }
      scored.push({ h: h, score: minDist + gapBonus });
    }
    scored.sort(function(a, b) { return b.score - a.score; });
    return scored[0].h;
  }

  // 左・右パターン: ソ連からなるべく遠い位置
  var scored = [];
  for (var i = 0; i < valid.length; i++) {
    var h = valid[i];
    var minDist = Infinity;
    for (var ei = 0; ei < enemies.length; ei++) {
      var d = hexDist(h.col, h.row, enemies[ei].col, enemies[ei].row);
      if (d < minDist) minDist = d;
    }
    scored.push({ h: h, score: minDist });
  }
  scored.sort(function(a, b) { return b.score - a.score; });
  return scored[0].h;
}

// SU-76: 最寄り敵に接近（シナリオ2限定）
function _sc2_su76Approach(u, db, callback) {
  if (u.remainMove <= 0 || u.status !== 'ok') { callback(); return; }

  var enemies = state.units.filter(function(e) {
    return e.side !== u.side && e.status !== 'destroyed' && e.col >= 1;
  });
  if (enemies.length === 0) { callback(); return; }

  // 最寄り敵
  var nearest = null, nearestDist = Infinity;
  for (var i = 0; i < enemies.length; i++) {
    var d = hexDist(u.col, u.row, enemies[i].col, enemies[i].row);
    if (d < nearestDist) { nearestDist = d; nearest = enemies[i]; }
  }
  if (!nearest) { callback(); return; }

  var visited = aiGetReachableHexes(u, db);
  var startKey = u.col + ',' + u.row;
  var bestKey = null, bestDist = nearestDist;

  for (var key in visited) {
    if (key === startKey) continue;
    var v = visited[key];
    var gd = hexDist(v.col, v.row, nearest.col, nearest.row);
    if (gd < bestDist) { bestDist = gd; bestKey = key; }
  }

  if (bestKey) {
    console.log('[AI-sc2] SU-76 → ' + bestKey + ' 敵(' + nearest.col + ',' + nearest.row + ')へ接近');
    var path = aiGetPath(visited, bestKey);
    if (path.length > 0) { aiFollowPath(u, db, path, callback); return; }
  }

  callback();
}

// ============================================================
//  移動判断メイン (phase_move.html用)
//  パターンで分岐: center→突破、left/right→即停止
// ============================================================
function aiDoMovement(u, db, callback) {
  if (u.side !== 'ge') {
    // SU-76: 最寄り敵になるべく近づく
    if (u.name === 'SU-76') {
      _sc2_su76Approach(u, db, callback);
      return;
    }
    _baseAiDoMovement(u, db, callback);
    return;
  }

  if (_sc2_pattern === 'left' || _sc2_pattern === 'right') {
    console.log('[AI-sc2] ' + u.name + ' パターン=' + _sc2_pattern + ' → 即停止');
    callback();
    return;
  }

  // 中央パターン
  _sc2_breakthroughMove(u, db, callback);
}

// 中央パターン: 最寄り敵へ接近（射撃優先、敵がいなければ北へ）
function _sc2_breakthroughMove(u, db, callback) {
  if (u.remainMove <= 0 || u.status !== 'ok') { callback(); return; }

  // 射撃優先: 射界内にLOSのある敵がいれば停止
  var enemies = state.units.filter(function(e) { return e.side !== u.side && e.status !== 'destroyed' && e.col >= 1; });
  for (var ei = 0; ei < enemies.length; ei++) {
    var en = enemies[ei];
    if (!hasLOS(u.col, u.row, en.col, en.row)) continue;
    if (db.turret === 'fixed' && typeof isInFixedArcMove === 'function') {
      if (!isInFixedArcMove(u, en.col, en.row)) continue;
    }
    console.log('[AI-sc2] ' + u.name + ' 射撃優先 → 停止 (' + u.col + ',' + u.row + ')');
    callback();
    return;
  }

  // 最寄り敵を探す
  var nearest = null, nearestDist = Infinity;
  for (var i = 0; i < enemies.length; i++) {
    var d = hexDist(u.col, u.row, enemies[i].col, enemies[i].row);
    if (d < nearestDist) { nearestDist = d; nearest = enemies[i]; }
  }

  // 敵に向かって移動（BFS）
  var visited = aiGetReachableHexes(u, db);
  var startKey = u.col + ',' + u.row;
  var bestKey = null;

  if (nearest) {
    var bestGoalDist = nearestDist;
    for (var key in visited) {
      if (key === startKey) continue;
      var v = visited[key];
      var gd = hexDist(v.col, v.row, nearest.col, nearest.row);
      if (gd < bestGoalDist) { bestGoalDist = gd; bestKey = key; }
    }
  }

  // 敵がいない or 近づけない → 北へ
  if (!bestKey) {
    var bestRowDist = 0;
    for (var key in visited) {
      if (key === startKey) continue;
      var v = visited[key];
      var rowGain = u.row - v.row;
      if (rowGain > bestRowDist) { bestRowDist = rowGain; bestKey = key; }
    }
  }

  if (bestKey) {
    console.log('[AI-sc2] ' + u.name + ' → ' + bestKey + (nearest ? ' 敵接近' : ' 北進'));
    var path = aiGetPath(visited, bestKey);
    if (path.length > 0) { aiFollowPath(u, db, path, callback); return; }
  }

  callback();
}

console.log('[AI] ai_sc2.js loaded — シナリオ2専用AI（3パターン分岐）');
