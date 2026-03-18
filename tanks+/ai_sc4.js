// ai_sc4.js — シナリオ4「フューリー」専用AI
// GE: Tiger I×1 vs US: M4A3×4
// 学習済み重みによるTiger移動AI

(function() {
  // 学習済み重み（sc4_train.js 500世代, winRate=0.60）
  const W = {
    killChance: 0.06122602741833063,
    canShoot: 0.000050547060782386146,
    threat: -2.3869175308083523,
    canBeShot: -0.0811099084493853,
    distance: -0.006199703268995069,
    terrainCover: 0.11873763109907254,
    flankThreat: -0.22348325054863713,
    killable: 0.0007544334167694595,
    edgePenalty: -227.73361398844276,
    aliveEnemies: -0.4724024995597076
  };

  // Tiger評価関数（学習済み重み付き）
  function evalTigerPosition(col, row, faceDir, tiger, enemies) {
    let score = 0;
    const alive = enemies.filter(e => e.status !== 'destroyed');
    if (alive.length === 0) return 1000;

    let canShoot = 0;
    let canBeShot = 0;
    let totalKillChance = 0;
    let totalThreat = 0;
    let minDist = 99;
    let killableCount = 0;

    for (const en of alive) {
      const d = hexDist(col, row, en.col, en.row);
      if (d < minDist) minDist = d;

      if (hasLOS(col, row, en.col, en.row)) {
        // Tigerの攻撃力
        const enTerrain = state.terrain ? (state.terrain[en.col + ',' + en.row] || '') : '';
        const enMod = (enTerrain === 'forest' || enTerrain === 'building') ? 2 : 0;
        const kc = calcKillChance(tiger.name, en.name, d, true, enMod);
        totalKillChance += kc.kill;
        if (kc.kill > 0.3) killableCount++;
        canShoot++;

        // 敵の脅威
        const myTerrain = state.terrain ? (state.terrain[col + ',' + row] || '') : '';
        const myMod = (myTerrain === 'forest' || myTerrain === 'building') ? 2 : 0;
        const tc = calcKillChance(en.name, tiger.name, d, true, myMod);
        totalThreat += tc.kill;
        canBeShot++;
      }
    }

    // 地形ボーナス
    const myTerrain = state.terrain ? (state.terrain[col + ',' + row] || '') : '';
    const terrainCover = (myTerrain === 'forest' || myTerrain === 'building') ? 1 : 0;

    // 背面/側面露出チェック
    let flankThreat = 0;
    for (const en of alive) {
      if (!hasLOS(col, row, en.col, en.row)) continue;
      const h1 = hexCenter(col, row);
      const h2 = hexCenter(en.col, en.row);
      const enemyAngle = Math.atan2(-(h2.y - h1.y), h2.x - h1.x);
      const nb = hexNeighbor(col, row, faceDir);
      const faceCol = nb ? nb.col : col;
      const faceRow = nb ? nb.row : row;
      const hFace = hexCenter(faceCol, faceRow);
      const faceAngle = Math.atan2(-(hFace.y - h1.y), hFace.x - h1.x);
      let diff = Math.abs(enemyAngle - faceAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > Math.PI * 2 / 3) flankThreat++;
    }

    // 端ペナルティ
    const mc = (state && state.mapMaxCol) || 25;
    const mr = (state && state.mapMaxRow) || 16;
    const edgePenalty = (col <= 2 || col >= mc - 1 || row <= 1 || row >= mr) ? 1 : 0;

    // 重み付きスコア
    score += W.killChance * totalKillChance;
    score += W.canShoot * canShoot;
    score += W.threat * totalThreat;
    score += W.canBeShot * canBeShot;
    score += W.distance * minDist;
    score += W.terrainCover * terrainCover;
    score += W.flankThreat * flankThreat;
    score += W.killable * killableCount;
    score += W.edgePenalty * edgePenalty;
    score += W.aliveEnemies * alive.length;

    return score;
  }

  // aiDoMovementをオーバーライド: Tigerのみ学習済み評価、他はデフォルト
  aiDoMovement = function(u, db, callback) {
    // Tiger以外はデフォルトAI
    if (u.name !== 'Tiger I' || u.side !== 'ge') {
      _baseAiDoMovement(u, db, callback);
      return;
    }

    const enemies = state.units.filter(e =>
      e.side !== u.side && e.status !== 'destroyed' && e.col >= 1
    );
    if (enemies.length === 0) { callback(); return; }

    // BFS: 到達可能ヘクスを取得
    const visited = aiGetReachableHexes(u, db);
    const startKey = u.col + ',' + u.row;

    // 全到達可能ヘクス × 6方向を評価
    let bestKey = null;
    let bestDir = u.dir;
    let bestScore = evalTigerPosition(u.col, u.row, u.dir, u, enemies);
    console.log('[AI-SC4] Tiger現在位置スコア:', bestScore.toFixed(3));

    for (const key in visited) {
      const v = visited[key];
      for (let faceDir = 0; faceDir < 6; faceDir++) {
        const score = evalTigerPosition(v.col, v.row, faceDir, u, enemies);
        if (score > bestScore) {
          bestScore = score;
          bestKey = key;
          bestDir = faceDir;
        }
      }
    }

    if (bestKey && bestKey !== startKey) {
      console.log('[AI-SC4] Tiger →', bestKey, 'dir=' + bestDir, 'score=' + bestScore.toFixed(3));
      const path = aiGetPath(visited, bestKey);
      if (path.length > 0) {
        // 移動後に方向転換
        const targetDir = bestDir;
        const origCallback = callback;
        aiFollowPath(u, db, path, function() {
          // 移動完了後に最適方向へ向ける
          if (u.dir !== targetDir) {
            u.dir = targetDir;
            console.log('[AI-SC4] Tiger 方向転換 → dir=' + targetDir);
          }
          origCallback();
        });
        return;
      }
    }

    // 移動しないが方向転換はする
    if (bestDir !== u.dir) {
      u.dir = bestDir;
      console.log('[AI-SC4] Tiger 方向転換のみ → dir=' + bestDir);
    } else {
      console.log('[AI-SC4] Tiger 停止');
    }
    callback();
  };

  console.log('[AI] ai_sc4.js loaded — 学習済み重み(500世代, winRate=0.60)');
})();
