// sc4_sim.js — SC4「フューリー」ヘッドレスシミュレーション
// Tiger I ×1 vs M4A3 ×4 (マップA)
// Node.js用、描画なし高速対戦

const fs = require('fs');

// --- scenarios.jsからデータ読み込み ---
const scenarioSrc = fs.readFileSync(__dirname + '/scenarios.js', 'utf8');
eval(scenarioSrc.replace(/\bconst /g, 'var ').replace(/\blet /g, 'var '));

// --- 定数 ---
const MAP_MAX_COL = 25;
const MAP_MAX_ROW = 16;
const HEX_SIZE = 103.4;
const HEX_H = HEX_SIZE * Math.sqrt(3);
const OX = 99.5;
const OY = 88.5;
const TERRAIN = MAP_TERRAIN.A;

// --- ヘックスユーティリティ ---
function hexCenter(col, row) {
  const x = OX + (col - 1) * HEX_SIZE * 1.5;
  const y = OY + (row - 1) * HEX_H + ((col % 2 === 0) ? HEX_H / 2 : 0);
  return { x, y };
}

function hexDist(c1, r1, c2, r2) {
  function toCube(col, row) {
    const x = col - 1;
    const z = row - 1 - Math.floor((col - 1) / 2);
    const y = -x - z;
    return { x, y, z };
  }
  const a = toCube(c1, r1);
  const b = toCube(c2, r2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

function hexNeighbor(col, row, dir) {
  const even = (col % 2 === 0);
  const neighbors = even ?
    [[1,0],[0,-1],[-1,0],[-1,1],[0,1],[1,1]] :
    [[1,-1],[0,-1],[-1,-1],[-1,0],[0,1],[1,0]];
  const d = neighbors[dir];
  if (!d) return null;
  const nc = col + d[0];
  const nr = row + d[1];
  if (nc < 1 || nr < 1 || nc > MAP_MAX_COL || nr > MAP_MAX_ROW) return null;
  return { col: nc, row: nr };
}

function getRotateCost(currentDir, targetDir) {
  const diff = ((targetDir - currentDir) % 6 + 6) % 6;
  return Math.min(diff, 6 - diff);
}

function getTerrainCost(col, row, fromCol, fromRow) {
  const key = `${col},${row}`;
  const t = TERRAIN[key];
  if (t === 'slope' && fromCol !== undefined) {
    const fromT = TERRAIN[`${fromCol},${fromRow}`];
    if (fromT === 'slope') return 1;
  }
  return TERRAIN_COST[t] || 1;
}

// --- LOS (簡略版: 森/建物でブロック) ---
function isBlockingTerrain(col, row) {
  const t = TERRAIN[`${col},${row}`];
  return t === 'forest' || t === 'building' || t === 'slope';
}

function pixelToHex(px, py) {
  let bestCol = 1, bestRow = 1, bestD = Infinity;
  const approxCol = Math.round((px - OX) / (HEX_SIZE * 1.5)) + 1;
  const approxRow = Math.round((py - OY) / HEX_H) + 1;
  for (let c = approxCol - 2; c <= approxCol + 2; c++) {
    for (let r = approxRow - 2; r <= approxRow + 2; r++) {
      if (c < 1 || r < 1 || c > MAP_MAX_COL || r > MAP_MAX_ROW) continue;
      const h = hexCenter(c, r);
      const d = (px - h.x) ** 2 + (py - h.y) ** 2;
      if (d < bestD) { bestD = d; bestCol = c; bestRow = r; }
    }
  }
  return { col: bestCol, row: bestRow };
}

function hasLOS(c1, r1, c2, r2) {
  const dist = hexDist(c1, r1, c2, r2);
  if (dist <= 1) return true;
  const h1 = hexCenter(c1, r1);
  const h2 = hexCenter(c2, r2);
  const steps = Math.max(dist * 4, 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const mx = h1.x + (h2.x - h1.x) * t;
    const my = h1.y + (h2.y - h1.y) * t;
    const mid = pixelToHex(mx, my);
    if (mid.col === c1 && mid.row === r1) continue;
    if (mid.col === c2 && mid.row === r2) continue;
    if (isBlockingTerrain(mid.col, mid.row)) return false;
  }
  return true;
}

// --- 移動BFS ---
function getReachableHexes(u, db, units) {
  const startKey = `${u.col},${u.row}`;
  const visited = {};
  visited[startKey] = { col: u.col, row: u.row, cost: 0, prevKey: null, dir: u.dir };
  const queue = [{ key: startKey, cost: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();
    const cv = visited[cur.key];
    if (cur.cost > cv.cost) continue;

    for (let d = 0; d < 6; d++) {
      const n = hexNeighbor(cv.col, cv.row, d);
      if (!n) continue;
      const rotateCost = getRotateCost(cv.dir, d);
      const terrainCost = getTerrainCost(n.col, n.row, cv.col, cv.row);
      const diff = ((d - cv.dir) % 6 + 6) % 6;
      const backwardExtra = (Math.min(diff, 6 - diff) >= 2) ? 1 : 0;
      const moveCost = rotateCost + terrainCost + backwardExtra;
      const totalCost = cv.cost + moveCost;
      if (totalCost > u.remainMove) continue;

      // スタックチェック（同じ位置に味方がいるか）
      const nKey = `${n.col},${n.row}`;
      const blocked = units.some(o => o !== u && o.status !== 'destroyed' && o.col === n.col && o.row === n.row && o.col >= 1);
      if (blocked) continue;

      if (visited[nKey] && visited[nKey].cost <= totalCost) continue;
      visited[nKey] = { col: n.col, row: n.row, cost: totalCost, prevKey: cur.key, dir: d };
      queue.push({ key: nKey, cost: totalCost });
    }
  }
  return visited;
}

function getPath(visited, targetKey) {
  const path = [];
  let key = targetKey;
  while (key && visited[key] && visited[key].prevKey !== null) {
    path.unshift({ col: visited[key].col, row: visited[key].row, dir: visited[key].dir });
    key = visited[key].prevKey;
  }
  return path;
}

// --- 戦闘判定 ---
function rollDice() {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}

function resolveShot(shooter, target, dist, isDefensiveFire) {
  const sDb = UNIT_DB[shooter.name];
  const tDb = UNIT_DB[target.name];
  if (!sDb || !tDb) return 'miss';

  const di = distKey(dist);
  if (di < 0) return 'miss';
  const ft = FIRE_TABLE[shooter.name];
  if (!ft || !ft[di]) return 'miss';

  const pen = ft[di][0];
  let hitNum = ft[di][1];

  // 修正
  const tTerrain = TERRAIN[`${target.col},${target.row}`];
  if (tTerrain === 'forest' || tTerrain === 'building') hitNum -= 2;
  if (tDb.small) hitNum -= 1;
  if (isDefensiveFire) hitNum -= 1;

  // 命中判定
  const hitRoll = rollDice();
  if (hitRoll > hitNum) return 'miss';

  // 貫通判定
  const armor = tDb.armor;
  const penDiff = pen - armor;
  const destRoll = rollDice();
  const result = getDestructionResult(penDiff, destRoll);
  return result; // 'destroyed', 'immobilized', 'noEffect'
}

// --- ゲーム状態 ---
function createGameState() {
  // Tiger: 右端から侵入、M4A3: 左端から侵入
  // ランダム配置
  const tigerRow = Math.floor(Math.random() * 12) + 3; // 3-14
  const m4Rows = [];
  for (let i = 0; i < 4; i++) {
    let r;
    do {
      r = Math.floor(Math.random() * 14) + 2; // 2-15
    } while (m4Rows.includes(r));
    m4Rows.push(r);
  }

  const units = [
    { name: 'Tiger I', side: 'ge', col: MAP_MAX_COL, row: tigerRow, dir: 3, status: 'ok', remainMove: 3, fired: false },
    { name: 'M4A3', side: 'us', col: 1, row: m4Rows[0], dir: 0, status: 'ok', remainMove: 4, fired: false },
    { name: 'M4A3', side: 'us', col: 1, row: m4Rows[1], dir: 0, status: 'ok', remainMove: 4, fired: false },
    { name: 'M4A3', side: 'us', col: 1, row: m4Rows[2], dir: 0, status: 'ok', remainMove: 4, fired: false },
    { name: 'M4A3', side: 'us', col: 1, row: m4Rows[3], dir: 0, status: 'ok', remainMove: 4, fired: false },
  ];

  return { units, turn: 1, maxTurns: 20, initPos: { tigerRow, m4Rows: [...m4Rows] } };
}

// --- AI判断: 行動候補の生成 ---
function getTigerActions(gs, weights) {
  const tiger = gs.units[0];
  if (tiger.status === 'destroyed' || tiger.status === 'immobilized') return [];

  const db = UNIT_DB[tiger.name];
  const reachable = getReachableHexes(tiger, db, gs.units);
  const enemies = gs.units.filter(u => u.side === 'us' && u.status !== 'destroyed' && u.col >= 1);
  const actions = [];

  // 各到達可能ヘクス × 各方向
  for (const key in reachable) {
    const hex = reachable[key];
    for (let faceDir = 0; faceDir < 6; faceDir++) {
      const score = evalTigerPosition(hex.col, hex.row, faceDir, tiger, enemies, weights, gs);
      actions.push({ col: hex.col, row: hex.row, moveDir: hex.dir, faceDir, path: getPath(reachable, key), score });
    }
  }

  // スコア順ソート
  actions.sort((a, b) => b.score - a.score);
  return actions;
}

// --- Tiger評価関数（学習対象の重み付き） ---
function evalTigerPosition(col, row, faceDir, tiger, enemies, w, gs) {
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

    const los = hasLOS(col, row, en.col, en.row);
    if (los) {
      // Tigerの攻撃力
      const kc = calcKillChance(tiger.name, en.name, d, true, 0);
      totalKillChance += kc.kill;
      if (kc.kill > 0.3) killableCount++;
      canShoot++;

      // 敵の脅威
      const tc = calcKillChance(en.name, tiger.name, d, true, 0);
      totalThreat += tc.kill;
      canBeShot++;
    }
  }

  // 地形ボーナス
  const myTerrain = TERRAIN[`${col},${row}`];
  const terrainCover = (myTerrain === 'forest' || myTerrain === 'building') ? 1 : 0;

  // 背面/側面露出チェック
  let flankThreat = 0;
  for (const en of alive) {
    if (!hasLOS(col, row, en.col, en.row)) continue;
    const h1 = hexCenter(col, row);
    const h2 = hexCenter(en.col, en.row);
    const enemyAngle = Math.atan2(-(h2.y - h1.y), h2.x - h1.x);
    const faceAngle = Math.atan2(
      -(hexCenter(hexNeighbor(col, row, faceDir)?.col || col, hexNeighbor(col, row, faceDir)?.row || row).y - h1.y),
      hexCenter(hexNeighbor(col, row, faceDir)?.col || col, hexNeighbor(col, row, faceDir)?.row || row).x - h1.x
    );
    let diff = Math.abs(enemyAngle - faceAngle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > Math.PI * 2 / 3) flankThreat++;
  }

  // 端に寄りすぎない
  const edgePenalty = (col <= 2 || col >= MAP_MAX_COL - 1 || row <= 1 || row >= MAP_MAX_ROW) ? 1 : 0;

  // 重み付きスコア
  score += w.killChance * totalKillChance;     // 撃破チャンス
  score += w.canShoot * canShoot;              // 射撃可能数
  score += w.threat * totalThreat * canBeShot;  // 脅威×射程内敵数（マイナス）
  score += w.canBeShot * canBeShot;            // 被射撃数（マイナス）
  score += w.distance * minDist;               // 最短距離
  score += w.terrainCover * terrainCover;      // 地形防御
  score += w.flankThreat * flankThreat;        // 側面脅威（マイナス）
  score += w.killable * killableCount;         // 高確率撃破数
  score += w.edgePenalty * edgePenalty;         // 端ペナルティ
  score += w.aliveEnemies * alive.length;      // 残敵数

  return score;
}

// --- M4A3 AI（基本: 距離を詰めつつ包囲） ---
function m4aiAction(gs, m4idx) {
  const m4 = gs.units[m4idx];
  if (m4.status === 'destroyed' || m4.status === 'immobilized') return null;

  const db = UNIT_DB[m4.name];
  const tiger = gs.units[0];

  // Tiger破壊済み → 右端へ突破を目指す
  if (tiger.status === 'destroyed') {
    const reachable = getReachableHexes(m4, db, gs.units);
    let bestKey = null, bestCol = -1;
    for (const key in reachable) {
      const hex = reachable[key];
      if (hex.col > bestCol) { bestCol = hex.col; bestKey = key; }
    }
    if (!bestKey) return null;
    const target = reachable[bestKey];
    return { col: target.col, row: target.row, dir: 0, path: getPath(reachable, bestKey) };
  }

  const reachable = getReachableHexes(m4, db, gs.units);
  const tigerDist = hexDist(m4.col, m4.row, tiger.col, tiger.row);

  // 最善ヘクス: LOSがあり、適度な距離（3-6）で側面/背面を狙う
  let bestKey = null;
  let bestScore = -Infinity;

  for (const key in reachable) {
    const hex = reachable[key];
    const d = hexDist(hex.col, hex.row, tiger.col, tiger.row);
    const los = hasLOS(hex.col, hex.row, tiger.col, tiger.row);

    let score = 0;
    if (los) {
      const kc = calcKillChance(m4.name, tiger.name, d, true, 0);
      score += kc.kill * 10;
      // 距離ボーナス（3-6が理想）
      if (d >= 3 && d <= 6) score += 2;
      else if (d >= 1 && d <= 2) score += 1;
    }
    // 接近ボーナス
    score -= d * 0.1;
    // 突破ボーナス: 右方向への進行を評価
    score += hex.col * 0.05;
    // 地形ボーナス
    const t = TERRAIN[`${hex.col},${hex.row}`];
    if (t === 'forest' || t === 'building') score += 1;
    // Tigerの背面を狙う
    const h1 = hexCenter(hex.col, hex.row);
    const h2 = hexCenter(tiger.col, tiger.row);
    const attackAngle = Math.atan2(-(h2.y - h1.y), h2.x - h1.x);
    const tigerFace = hexCenter(
      hexNeighbor(tiger.col, tiger.row, tiger.dir)?.col || tiger.col,
      hexNeighbor(tiger.col, tiger.row, tiger.dir)?.row || tiger.row
    );
    const tigerFaceAngle = Math.atan2(-(tigerFace.y - h2.y), tigerFace.x - h2.x);
    let angleDiff = Math.abs(attackAngle - tigerFaceAngle);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    if (angleDiff > Math.PI / 2) score += 3; // 側面/背面ボーナス

    if (score > bestScore) { bestScore = score; bestKey = key; }
  }

  if (!bestKey) return null;
  const target = reachable[bestKey];
  // 向き: Tigerの方を向く
  const h1 = hexCenter(target.col, target.row);
  const h2 = hexCenter(tiger.col, tiger.row);
  const angle = Math.atan2(-(h2.y - h1.y), h2.x - h1.x);
  // 角度からdir
  const dirs = [0, Math.PI/3, 2*Math.PI/3, Math.PI, -2*Math.PI/3, -Math.PI/3];
  let bestDir = 0, bestDirDiff = Infinity;
  for (let i = 0; i < 6; i++) {
    let dd = Math.abs(angle - dirs[i]);
    if (dd > Math.PI) dd = Math.PI * 2 - dd;
    if (dd < bestDirDiff) { bestDirDiff = dd; bestDir = i; }
  }

  return { col: target.col, row: target.row, dir: bestDir, path: getPath(reachable, bestKey) };
}

// --- 防御射撃 ---
function processDefensiveFire(movingUnit, gs) {
  const enemies = gs.units.filter(u => u.side !== movingUnit.side && u.status !== 'destroyed' && u.col >= 1);
  for (const en of enemies) {
    if (en.fired) continue;
    const d = hexDist(en.col, en.row, movingUnit.col, movingUnit.row);
    if (!hasLOS(en.col, en.row, movingUnit.col, movingUnit.row)) continue;
    const di = distKey(d);
    if (di < 0) continue;
    if (!FIRE_TABLE[en.name] || !FIRE_TABLE[en.name][di]) continue;

    const result = resolveShot(en, movingUnit, d, true);
    en.fired = true; // 防御射撃は1回
    if (result === 'destroyed') {
      movingUnit.status = 'destroyed';
      return 'destroyed';
    }
    if (result === 'immobilized') {
      movingUnit.status = 'immobilized';
      movingUnit.remainMove = 0;
      return 'immobilized';
    }
  }
  return 'ok';
}

// --- 射撃フェーズ ---
function processGunPhase(gs, side) {
  const shooters = gs.units.filter(u => u.side === side && u.status !== 'destroyed' && u.col >= 1 && !u.fired);
  const enemies = gs.units.filter(u => u.side !== side && u.status !== 'destroyed' && u.col >= 1);

  for (const s of shooters) {
    if (enemies.filter(e => e.status !== 'destroyed').length === 0) break;

    let bestTarget = null;
    let bestKill = 0;

    for (const en of enemies) {
      if (en.status === 'destroyed') continue;
      const d = hexDist(s.col, s.row, en.col, en.row);
      if (!hasLOS(s.col, s.row, en.col, en.row)) continue;
      const kc = calcKillChance(s.name, en.name, d, true, 0);
      if (kc.kill > bestKill) { bestKill = kc.kill; bestTarget = en; }
    }

    if (bestTarget) {
      const d = hexDist(s.col, s.row, bestTarget.col, bestTarget.row);
      const result = resolveShot(s, bestTarget, d, false);
      s.fired = true;
      if (result === 'destroyed') bestTarget.status = 'destroyed';
      else if (result === 'immobilized') {
        bestTarget.status = 'immobilized';
        bestTarget.remainMove = 0;
      }
    }
  }
}

// --- 1ゲーム実行 ---
function runGame(weights) {
  const gs = createGameState();
  let result = { winner: null, turns: 0, tigerKills: 0, tigerSurvived: false, initPos: gs.initPos };

  for (let turn = 1; turn <= gs.maxTurns; turn++) {
    gs.turn = turn;

    // リセット
    gs.units.forEach(u => {
      if (u.status !== 'destroyed') {
        const db = UNIT_DB[u.name];
        u.remainMove = (u.status === 'immobilized') ? 0 : db.move;
        u.fired = false;
      }
    });

    // --- ドイツ移動フェーズ ---
    const tiger = gs.units[0];
    if (tiger.status !== 'destroyed') {
      const actions = getTigerActions(gs, weights);
      if (actions.length > 0) {
        const best = actions[0];
        // パスに沿って移動（防御射撃あり）
        for (const step of best.path) {
          tiger.col = step.col;
          tiger.row = step.row;
          tiger.dir = step.dir;
          const dfResult = processDefensiveFire(tiger, gs);
          if (dfResult === 'destroyed' || dfResult === 'immobilized') break;
        }
        if (tiger.status === 'ok') {
          tiger.dir = best.faceDir;
        }
      }
    }

    // --- アメリカ移動フェーズ ---
    for (let i = 1; i <= 4; i++) {
      const m4 = gs.units[i];
      if (m4.status === 'destroyed' || m4.status === 'immobilized' || m4.status === 'escaped') continue;
      const action = m4aiAction(gs, i);
      if (action) {
        for (const step of action.path) {
          m4.col = step.col;
          m4.row = step.row;
          m4.dir = step.dir;
          const dfResult = processDefensiveFire(m4, gs);
          if (dfResult === 'destroyed' || dfResult === 'immobilized') break;
          // 突破判定: 右端到達で脱出
          if (m4.col === MAP_MAX_COL && m4.status === 'ok') {
            m4.status = 'escaped';
            m4.col = -99;
            m4.row = -99;
            break;
          }
        }
        if (m4.status === 'ok') {
          m4.dir = action.dir;
        }
      }
    }

    // M4が1体でも脱出 → アメリカ勝利
    const escaped = gs.units.filter(u => u.side === 'us' && u.status === 'escaped').length;
    if (escaped >= 1) {
      const m4Alive = gs.units.filter(u => u.side === 'us' && u.status !== 'destroyed' && u.status !== 'escaped').length;
      result.winner = 'us';
      result.turns = turn;
      result.tigerKills = 4 - m4Alive - escaped;
      result.tigerSurvived = gs.units[0].status !== 'destroyed';
      result.usEscaped = escaped;
      return result;
    }

    // 防御射撃フラグリセット
    gs.units.forEach(u => u.fired = false);

    // --- ドイツ砲撃フェーズ ---
    processGunPhase(gs, 'ge');

    // --- アメリカ砲撃フェーズ ---
    processGunPhase(gs, 'us');

    // --- 勝敗判定 ---
    const tigerAlive = gs.units[0].status !== 'destroyed';
    const m4Alive = gs.units.filter(u => u.side === 'us' && u.status !== 'destroyed' && u.status !== 'escaped').length;

    if (!tigerAlive) {
      result.winner = 'us';
      result.turns = turn;
      result.tigerKills = 4 - m4Alive;
      result.tigerSurvived = false;
      return result;
    }
    if (m4Alive === 0) {
      result.winner = 'ge';
      result.turns = turn;
      result.tigerKills = 4;
      result.tigerSurvived = true;
      return result;
    }
  }

  // タイムアウト: Tiger生存で残り敵が少ない方が有利
  const m4Alive = gs.units.filter(u => u.side === 'us' && u.status !== 'destroyed' && u.status !== 'escaped').length;
  result.winner = m4Alive <= 1 ? 'ge' : 'us';
  result.turns = gs.maxTurns;
  result.tigerKills = 4 - m4Alive;
  result.tigerSurvived = gs.units[0].status !== 'destroyed';
  return result;
}

// --- エクスポート ---
module.exports = {
  runGame, hexDist, hexNeighbor, hasLOS, hexCenter,
  MAP_MAX_COL, MAP_MAX_ROW, TERRAIN,
  evalTigerPosition, getTigerActions, createGameState
};
