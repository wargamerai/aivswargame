// ai_sc2.js — シナリオ2「エレファント」専用AI
// GE: Ferdinand×3 突破、SU: 待ち伏せ
// ドイツ配置: ソ連からなるべく遠く、左右にいれば真ん中に
//   フェルディナンド3両を左向き・上向き・右向きに分けて配置

// ============================================================
//  配置計画 (phase_move.html用)
//  ドイツ(Ferdinand): ソ連から最も遠い位置、3両の向きを左右に分散
// ============================================================
function aiPlanPlacement(u, db, reservedHexes) {
  var maxCol = state.mapMaxCol || 25;
  var maxRow = state.mapMaxRow || 16;
  var edge = u.enterEdge;
  if (!edge) return null; // free配置(ソ連)はデフォルト処理

  // ドイツ以外はデフォルト処理（ベース関数を呼ぶ）
  if (u.side !== 'ge') return null;

  // bottom侵入の候補ヘクス
  var candidates = [];
  for (var c = 1; c <= maxCol; c++) {
    candidates.push({ col: c, row: maxRow });
  }

  // スタック・予約チェック
  var valid = [];
  for (var i = 0; i < candidates.length; i++) {
    var h = candidates[i];
    if (typeof checkStacking === 'function' && !checkStacking(h.col, h.row, u)) continue;
    // 予約済みチェック
    var reservedCount = 0;
    for (var ri = 0; ri < reservedHexes.length; ri++) {
      if (reservedHexes[ri].col === h.col && reservedHexes[ri].row === h.row) reservedCount++;
    }
    if (reservedCount >= 2) continue; // 戦車は2両までスタック
    valid.push(h);
  }
  if (valid.length === 0) return null;

  // ソ連ユニットの位置を取得
  var enemies = state.units.filter(function(e) {
    return e.side !== 'ge' && e.status !== 'destroyed' && e.col >= 1;
  });

  if (enemies.length === 0) {
    // 敵なし → 中央付近
    var centerCol = Math.round(maxCol / 2);
    var best = valid[0];
    for (var i = 1; i < valid.length; i++) {
      if (Math.abs(valid[i].col - centerCol) < Math.abs(best.col - centerCol)) {
        best = valid[i];
      }
    }
    _sc2_assignDir(u, reservedHexes, maxCol);
    return best;
  }

  // ソ連の分布を分析
  var minEnemyCol = Infinity, maxEnemyCol = 0;
  var sumCol = 0;
  for (var i = 0; i < enemies.length; i++) {
    var ec = enemies[i].col;
    if (ec < minEnemyCol) minEnemyCol = ec;
    if (ec > maxEnemyCol) maxEnemyCol = ec;
    sumCol += ec;
  }
  var avgEnemyCol = sumCol / enemies.length;

  // 各候補ヘクスのスコア: ソ連から遠いほど高い
  var scored = [];
  for (var i = 0; i < valid.length; i++) {
    var h = valid[i];
    var minDist = Infinity;
    for (var ei = 0; ei < enemies.length; ei++) {
      var d = hexDist(h.col, h.row, enemies[ei].col, enemies[ei].row);
      if (d < minDist) minDist = d;
    }
    // ソ連が左右に分散している場合、その中間を好む
    var spread = maxEnemyCol - minEnemyCol;
    var gapBonus = 0;
    if (spread >= 8) {
      // 左右に分かれている → 中間地点に近いほどボーナス
      var midCol = (minEnemyCol + maxEnemyCol) / 2;
      gapBonus = -Math.abs(h.col - midCol) * 0.5;
    }
    scored.push({ h: h, dist: minDist, bonus: gapBonus, score: minDist + gapBonus });
  }

  // スコア順にソート（高い＝遠い方が良い）
  scored.sort(function(a, b) { return b.score - a.score; });

  // 最良候補を選択
  var pick = scored[0].h;

  // 向きを割り当て
  _sc2_assignDir(u, reservedHexes, maxCol);

  return pick;
}

// フェルディナンド3両の向きを分散配置
// handlePlacementでdir=0が上書きされるため、_sc2dirに保存しaiDoMovementで適用
function _sc2_assignDir(u, reservedHexes, maxCol) {
  var geReserved = 0;
  for (var i = 0; i < reservedHexes.length; i++) {
    geReserved++;
  }

  // 0両目=右斜め上(dir=0), 1両目=左斜め上(dir=2), 2両目=正面(dir=1)
  if (geReserved === 0) {
    u._sc2dir = 0;
  } else if (geReserved === 1) {
    u._sc2dir = 2;
  } else {
    u._sc2dir = 1;
  }
}

// ============================================================
//  移動判断メイン (phase_move.html用)
//  ドイツ: 初回のみ向き割り当て、以降は突破AI
// ============================================================
function aiDoMovement(u, db, callback) {
  if (u.side === 'ge') {
    // フェーズ間で_sc2dirが消失するため、GE生存ユニットのインデックスで向きを割り当て
    // 1両目=NE(dir=0), 2両目=NW(dir=2), 3両目=N(dir=1)
    if (u.justEntered) {
      var dirs = [0, 2, 1];
      var geAlive = state.units.filter(function(e) {
        return e.side === 'ge' && e.status !== 'destroyed';
      });
      var myIdx = 0;
      for (var i = 0; i < geAlive.length; i++) {
        if (geAlive[i] === u) { myIdx = i; break; }
      }
      u.dir = dirs[myIdx % dirs.length];
      console.log('[AI-sc2] ' + u.name + ' 向き割当 dir=' + u.dir + ' (idx=' + myIdx + ')');
    }
    // 突破AIで前進
    _baseAiDoMovement(u, db, callback);
    return;
  }

  // ソ連: デフォルトAI
  _baseAiDoMovement(u, db, callback);
}

console.log('[AI] ai_sc2.js loaded — シナリオ2専用AI（フェルディナンド配置最適化）');
