// ai_sc6.js — シナリオ6「プロポロフカ」軽量AI
// 移動・侵入配置のみ上書き。射撃は phase_gun.html の本体（命中7・_prepFire準備射撃・前進30%等）をそのまま使う。
// 盤面スキャンは1ターン1回だけ。結果を全ユニットで共有。

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

  // スコアが伸びない場合でも、ゴールへ距離が縮まるマスがあれば必ずそこへ
  if (!bestKey || bestScore <= 0) {
    var bestD = goalDist;
    var fallbackKey = null;
    for (var key2 in visited) {
      if (key2 === startKey) continue;
      var v2 = visited[key2];
      var d2 = hexDist(v2.col, v2.row, goal.col, goal.row);
      if (d2 < bestD) {
        bestD = d2;
        fallbackKey = key2;
      }
    }
    if (fallbackKey) bestKey = fallbackKey;
    else { callback(); return; }
  }

  var path = aiGetPath(visited, bestKey);
  if (path.length === 0) { callback(); return; }
  aiFollowPath(u, db, path, callback);
}

// ============================================================
//  配置: sc6 独軍は (col1, row enterHexRows) の縦帯からランダム（スタック上限は phase_move と同様）
//  その他の辺は従来どおり中央寄せ
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

  // プロポロフカ独軍初期侵入: 列1×行1〜16 の縦帯で一様ランダム
  if (u.side === 'ge' && edge === 'left' && u.enterHexRows) {
    var validGe = [];
    for (var rg = minRow; rg <= maxR; rg++) {
      var cg = 1;
      if (typeof checkStacking === 'function' && !checkStacking(cg, rg, u)) continue;
      var reservedCount = 0;
      for (var ri = 0; ri < reservedHexes.length; ri++) {
        if (reservedHexes[ri].col === cg && reservedHexes[ri].row === rg) reservedCount++;
      }
      if (db.type === 'tank' || db.type === 'apc') {
        var existingTanks = 0;
        for (var ti = 0; ti < state.units.length; ti++) {
          var tu = state.units[ti];
          if (tu === u || tu.side !== u.side || tu.status === 'destroyed') continue;
          if (tu.col !== cg || tu.row !== rg) continue;
          var tuDb = UNIT_DB[tu.name];
          if (tuDb && (tuDb.type === 'tank' || tuDb.type === 'apc')) existingTanks++;
        }
        if (existingTanks + reservedCount >= 2) continue;
      }
      if (db.type === 'infantry') {
        var existingInf = 0;
        for (var ii = 0; ii < state.units.length; ii++) {
          var iu = state.units[ii];
          if (iu === u || iu.side !== u.side || iu.status === 'destroyed') continue;
          if (iu.col !== cg || iu.row !== rg) continue;
          var iuDb = UNIT_DB[iu.name];
          if (iuDb && iuDb.type === 'infantry') existingInf++;
        }
        if (existingInf + reservedCount >= 4) continue;
      }
      if (typeof getTerrainCost === 'function') {
        var costGe = getTerrainCost(cg, rg, undefined, undefined, u.name);
        if (u.remainMove < costGe) continue;
      }
      validGe.push({ col: cg, row: rg });
    }
    if (validGe.length === 0) return null;
    return validGe[Math.floor(Math.random() * validGe.length)];
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
    for (var rj = 0; rj < reservedHexes.length; rj++) {
      if (reservedHexes[rj].col === c && reservedHexes[rj].row === r) { reserved = true; break; }
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

console.log('[AI] ai_sc6.js loaded — プロポロフカ（移動・配置のみ。射撃は本体）');
