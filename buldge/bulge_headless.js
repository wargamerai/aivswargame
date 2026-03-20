#!/usr/bin/env node
// bulge_headless.js — Node.js用 バルジの戦い 高速対局エンジン
// 使い方: node bulge_headless.js [対局数] [--mc]
'use strict';

// ========== データ読み込み ==========
// mapdata.js, bulge_units.js を直接evalで読み込む
const fs = require('fs');
const path = require('path');
const dir = __dirname;

// グローバルに定義（ブラウザ版と同じ変数名）
// evalではなくvmでグローバルスコープに展開
const vm = require('vm');
vm.runInThisContext(fs.readFileSync(path.join(dir, 'mapdata.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(dir, 'bulge_units.js'), 'utf8'));

const COLS = MAP_CONFIG.cols;
const ROWS = MAP_CONFIG.rows;

// ========== ダミー関数（UI依存を除去）==========
function dbg() {} // デバッグ出力無効
function addLog() {}
function updateUI() {}
function draw() {}
function updateRightPanel() {}
function panToHex() {}
function showFlash() {}
function expireMovePath(u) { delete u.movePath; delete u._movePathExpiry; }

// ========== ゲーム状態 ==========
let G;

function initGame(useMC) {
  G = {
    turn: 1, maxTurn: 6,
    phase: 'reinforce', opPhase: 'select',
    activeSide: 'german',
    germanDone: false, alliedDone: false,
    units: [], selectedUnit: null, reachable: null, attackTargets: null,
    combat: { defHex:null, attackers:[], defenders:[], result:null, retreatingUnits:[], advanceEligible:[] },
    vpGerman: 0, vpAllied: 0,
    mode: 'watch', log: [], undoStack: [],
    britishDeployedTurn: 0, useMC: useMC,
    passCount: 0, _reinforcedTurns: [],
  };
  // ユニット初期化
  for (const u of INITIAL_SETUP.german) {
    G.units.push(Object.assign({}, u, { side:'german', acted:false, flipped:false, eliminated:false, exited:false }));
  }
  for (const u of INITIAL_SETUP.allied) {
    G.units.push(Object.assign({}, u, { side:'allied', acted:false, flipped:false, eliminated:false, exited:false }));
  }
  global.G = G; // MCファイルからアクセスできるよう更新
}

// ========== Hex関数 ==========
function hexId(col, row) {
  return String(col + 1).padStart(2, '0') + String(row + 1).padStart(2, '0');
}
function dispHex(id) {
  if (!id || id === 'eliminated' || id === 'exited') return id || '';
  const cc = parseInt(id.substring(0, 2));
  const rr = id.substring(2, 4);
  return rr + String(22 - cc).padStart(2, '0');
}
function parseHexId(id) {
  return { col: parseInt(id.substring(0, 2)) - 1, row: parseInt(id.substring(2, 4)) - 1 };
}
function getNeighbors(col, row) {
  const even = row % 2 === 0;
  if (even) return [[col,row-1],[col+1,row],[col,row+1],[col-1,row+1],[col-1,row],[col-1,row-1]];
  else return [[col+1,row-1],[col+1,row],[col+1,row+1],[col,row+1],[col-1,row],[col,row-1]];
}
function getNeighborIds(hid) {
  const { col, row } = parseHexId(hid);
  return getNeighbors(col, row)
    .filter(([c, r]) => c >= 0 && c < COLS && r >= 0 && r < ROWS)
    .map(([c, r]) => hexId(c, r));
}
function hexDist(id1, id2) {
  const a = parseHexId(id1), b = parseHexId(id2);
  const ax = a.col - (a.row - (a.row & 1)) / 2, az = a.row, ay = -ax - az;
  const bx = b.col - (b.row - (b.row & 1)) / 2, bz = b.row, by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}
function getUnitsAt(hexId) {
  return G.units.filter(u => u.hexId === hexId && !u.eliminated && !u.exited);
}
function isMechanized(unit) {
  return unit.type === 'panzer' || unit.type === 'panzergrenadier';
}
function isStacked(unit) {
  if (!unit.mechPair || unit._unstacked) return false;
  const pair = G.units.find(u => u.id === unit.mechPair);
  if (!pair || pair.eliminated || pair._unstacked) return false;
  return unit.hexId === pair.hexId;
}
function isAISide() { return true; } // headlessでは常にAI

// ========== 移動コスト ==========
function getMoveCost(fromId, toId, unit) {
  const terrain = TERRAIN_MAP[toId] || 'p';
  if (terrain === 'x') return Infinity;
  const fromRoutes = ROAD_MAP[fromId] || [];
  const toRoutes = ROAD_MAP[toId] || [];
  const sharedRoad = fromRoutes.some(r => toRoutes.includes(r));
  let riverCross = false;
  if (RIVER_MAP) {
    for (const [a, b] of RIVER_MAP) {
      if ((a === fromId && b === toId) || (a === toId && b === fromId)) { riverCross = true; break; }
    }
  }
  let cost;
  if (sharedRoad) {
    cost = unit.side === 'allied' ? 1/3 : 1;
    if (terrain === 'f' && !isMechanized(unit) && unit.side === 'allied') cost = 1;
  } else {
    switch (terrain) {
      case 'p': cost = 1; break;
      case 'r': cost = 3; break;
      case 'f': cost = 3; break;
      default: cost = 1;
    }
  }
  if (riverCross && !sharedRoad) cost += 2;
  return cost;
}

// ========== 移動計算 ==========
function calcReachable(unit) {
  const start = unit.hexId;
  const maxMP = 6;
  const dist = new Map();
  const prev = new Map();
  const pq = [[0, start]];
  dist.set(start, 0);
  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [cost, hid] = pq.shift();
    if (cost > dist.get(hid)) continue;
    if (hid !== start) {
      const hasActiveEnemyZOC = getNeighborIds(hid).some(adj => {
        const enemies = getUnitsAt(adj).filter(e => e.side !== unit.side);
        if (enemies.length === 0) return false;
        const covers = getNeighborIds(adj).filter(fn =>
          getUnitsAt(fn).some(f => f.side === unit.side && f.id !== unit.id)
        );
        return covers.length === 0;
      });
      if (hasActiveEnemyZOC) continue;
    }
    for (const nid of getNeighborIds(hid)) {
      const terrain = TERRAIN_MAP[nid];
      if (!terrain || terrain === 'x') continue;
      if (getUnitsAt(nid).some(u => u.side !== unit.side)) continue;
      const mc = getMoveCost(hid, nid, unit);
      const nc = cost + mc;
      if (nc <= maxMP && (!dist.has(nid) || nc < dist.get(nid))) {
        dist.set(nid, nc);
        prev.set(nid, hid);
        pq.push([nc, nid]);
      }
    }
  }
  dist.delete(start);
  const result = new Map();
  for (const [hid, cost] of dist) {
    const friendly = getUnitsAt(hid).filter(u => u.side === unit.side);
    if (friendly.length > 0) {
      if (!unit.mechPair) continue;
      if (friendly.length >= 2) continue;
      if (friendly[0].id !== unit.mechPair) continue;
    }
    const p = []; let cur = hid;
    while (cur && cur !== start) { p.unshift(cur); cur = prev.get(cur); }
    result.set(hid, { cost, path: p });
  }
  return result;
}

// ========== 退却先 ==========
function getRetreatHexes(unit) {
  const result = [];
  const visited = new Set([unit.hexId]);
  const queue = [unit.hexId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const nid of getNeighborIds(cur)) {
      if (visited.has(nid)) continue;
      visited.add(nid);
      const t = TERRAIN_MAP[nid];
      if (!t || t === 'x') continue;
      if (getUnitsAt(nid).some(u => u.side !== unit.side)) continue;
      const inZOC = getNeighborIds(nid).some(adj =>
        getUnitsAt(adj).some(e => e.side !== unit.side && !e.eliminated)
      );
      if (inZOC) continue;
      const friendly = getUnitsAt(nid).filter(u => u.side === unit.side);
      if (friendly.length === 0 || (unit.mechPair && friendly.length < 2 && friendly[0].id === unit.mechPair)) {
        result.push(nid);
      } else {
        queue.push(nid);
      }
    }
  }
  return result;
}

// ========== 戦闘 ==========
function resetCombat() {
  G.combat = { defHex:null, attackers:[], defenders:[], result:null, retreatingUnits:[], advanceEligible:[] };
}
function eliminateUnit(unit) {
  unit.eliminated = true;
  unit.hexId = 'eliminated';
}

function executeCombatSync() {
  const cb = G.combat;
  if (!cb.defHex || cb.attackers.length === 0) return;
  const attackers = cb.attackers.map(id => G.units.find(u => u.id === id)).filter(Boolean);
  const defenders = cb.defenders;
  const defHexId = cb.defHex;
  const atkPower = attackers.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
  const defPower = defenders.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
  const diff = atkPower - defPower;
  const facility = FACILITY_MAP && FACILITY_MAP[defHexId];
  let support = 0;
  if (facility !== 'c') {
    for (const nid of getNeighborIds(defHexId)) {
      const friendly = getUnitsAt(nid).filter(u => u.side === G.activeSide && !cb.attackers.includes(u.id));
      support += friendly.length;
    }
  }
  const terrain = TERRAIN_MAP[defHexId];
  const forestMod = terrain === 'f' ? 1 : 0;
  const die = Math.floor(Math.random() * 6) + 1;
  const modDie = die + support - forestMod;
  const result = lookupCRT(diff, modDie);
  cb.result = result;
  applyCombatSync(result, attackers, defenders, defHexId);
}

function applyCombatSync(result, attackers, defenders, defHexId) {
  const cb = G.combat;
  switch (result) {
    case 'AR':
      for (const u of attackers) doRetreat(u);
      break;
    case 'NE': break;
    case 'DR':
      for (const u of defenders) doRetreat(u);
      doAdvanceSync(attackers, defHexId, defenders);
      break;
    case 'DD':
      for (const u of defenders) { u.flipped = true; doRetreat(u); }
      doAdvanceSync(attackers, defHexId, defenders);
      break;
    case 'EX':
      eliminateUnit(attackers[0]);
      eliminateUnit(defenders[0]);
      if (defenders.filter(u => !u.eliminated).length === 0) {
        doAdvanceSync(attackers.filter(u => !u.eliminated), defHexId, defenders);
      }
      break;
    case 'DE':
      for (const u of defenders) eliminateUnit(u);
      doAdvanceSync(attackers, defHexId, defenders);
      break;
  }
  // クリーンアップ
  for (const u of attackers) { if (!u.eliminated) { u.flipped = true; delete u.mustAttack; } }
  resetCombat();
  G.attackTargets = null;
}

function doRetreat(unit) {
  if (unit.eliminated) return;
  const valid = getRetreatHexes(unit);
  if (valid.length > 0) {
    // スコアリングで退却先選択
    let best = valid[0], bestScore = -Infinity;
    for (const h of valid) {
      let score = 0;
      const { col } = parseHexId(h);
      const adjToH = getNeighborIds(h);
      // ZOC連結: 味方の2hex先にいる → ZOC壁形成
      for (const nid of adjToH) {
        if (getNeighborIds(nid).some(adj =>
          G.units.some(f => f.hexId === adj && f.side === unit.side && f.id !== unit.id && !f.eliminated && !f.exited)
        )) score += 5;
      }
      // 味方隣接
      const adjFriend = adjToH.filter(nid =>
        G.units.some(f => f.hexId === nid && f.side === unit.side && f.id !== unit.id && !f.eliminated && !f.exited)
      ).length;
      score += adjFriend * 3;
      // 道路交差点
      const roads = ROAD_MAP && ROAD_MAP[h];
      if (roads && roads.length > 0) score += roads.length * 3;
      if (TERRAIN_MAP[h] === 'f' && roads && roads.length > 0) score += 4;
      // 都市
      if (FACILITY_MAP && FACILITY_MAP[h] === 'c') score += 6;
      // 後方
      score += col * 0.5;
      // 敵から離れる
      const adjEnemy = adjToH.filter(nid =>
        G.units.some(e => e.hexId === nid && e.side !== unit.side && !e.eliminated && !e.exited)
      ).length;
      score -= adjEnemy * 4;
      if (score > bestScore) { bestScore = score; best = h; }
    }
    unit.hexId = best;
  } else {
    eliminateUnit(unit);
  }
}

function doAdvanceSync(attackers, defHex, defenders) {
  if (getUnitsAt(defHex).filter(u => !u.eliminated).length > 0) return;
  for (const u of attackers) {
    if (u.eliminated) continue;
    const t = TERRAIN_MAP[defHex];
    if (t === 'f' && isMechanized(u)) {
      const fromRoads = ROAD_MAP[u.hexId] || [];
      const toRoads = ROAD_MAP[defHex] || [];
      if (!fromRoads.some(r => toRoads.includes(r))) continue;
    }
    u.hexId = defHex;
    break; // 1ユニットのみ前進
  }
}

// ========== NW突破 ==========
function getNWExitHexes() {
  const hexes = [];
  if (typeof TAG_MAP !== 'undefined') {
    for (const [hid, t] of Object.entries(TAG_MAP)) {
      if (t === 'reinforce_nw') hexes.push(hid);
    }
  }
  return hexes;
}
function canExitNW(unit) {
  if (!unit || unit.side !== 'german' || !isMechanized(unit)) return false;
  if (unit.eliminated || unit.exited || unit.acted) return false;
  return getNWExitHexes().includes(unit.hexId);
}
function exitUnitNW(id) {
  const unit = G.units.find(u => u.id === id);
  if (!unit) return;
  unit.exited = true;
  unit._exitedNW = true;
  unit.acted = true;
  unit.hexId = 'exited';
}

// ========== VP計算 ==========
function calcVP() {
  G.vpGerman = 0; G.vpAllied = 0;
  if (FACILITY_MAP) {
    for (const [hid, fac] of Object.entries(FACILITY_MAP)) {
      if (fac !== 'c') continue;
      if (getUnitsAt(hid).some(u => u.side === 'german')) G.vpGerman++;
      else G.vpAllied++;
    }
  }
  G.vpGerman += G.units.filter(u => u.side === 'german' && u.exited && u._exitedNW).length;
}

// ========== 増援 ==========
function getValidEntryHexes(unit) {
  if (!unit.entryTag) return [];
  const valid = [];
  for (const [hid, t] of Object.entries(TAG_MAP)) {
    if (t === unit.entryTag) {
      const occ = getUnitsAt(hid);
      if (occ.length === 0) valid.push(hid);
      else if (unit.mechPair && occ.length < 2 && occ[0].id === unit.mechPair) valid.push(hid);
    }
  }
  return valid;
}

function placeReinforcements() {
  if (!G._reinforcedTurns) G._reinforcedTurns = [];
  if (G._reinforcedTurns.includes(G.turn)) return;
  G._reinforcedTurns.push(G.turn);
  const reinforcements = REINFORCEMENTS[G.turn];
  if (!reinforcements || reinforcements.length === 0) return;
  for (const rUnit of reinforcements) {
    if (rUnit.nation === 'uk' && G.britishDeployedTurn === 0) continue;
    const u = Object.assign({}, rUnit, { acted:false, flipped:false, eliminated:false, exited:false });
    if (!u.entryTag && u.hexId) {
      G.units.push(u);
    } else if (u.entryTag) {
      const valid = getValidEntryHexes(u);
      if (valid.length > 0) {
        u.hexId = valid[0];
        G.units.push(u);
      }
    }
  }
}

// ========== 回復 ==========
function doRecovery() {
  // 連合軍: 全回復
  for (const u of G.units) {
    if (u.side === 'allied' && u.flipped && !u.eliminated) u.flipped = false;
  }
  // ドイツ軍
  const deFlipped = G.units.filter(u => u.side === 'german' && u.flipped && !u.eliminated);
  const hasFuel = getUnitsAt('1304').some(f => f.side === 'german');
  const fuelBonus = hasFuel ? 2 : 0;
  if (G.turn <= 2) {
    deFlipped.forEach(u => u.flipped = false);
  } else if (G.turn <= 4) {
    const max = (G.turn === 3 ? 12 : 10) + fuelBonus;
    let count = 0;
    for (const u of deFlipped) {
      if (count >= max) break;
      u.flipped = false;
      count++;
    }
  } else {
    for (const u of deFlipped) {
      const die = Math.floor(Math.random() * 6) + 1;
      const mechBonus = isMechanized(u) ? fuelBonus : 0;
      if (die + 4 + mechBonus >= 7) u.flipped = false;
    }
  }
}

// ========== MC読み込み ==========
// MCファイルがheadlessの関数を参照できるようglobalに公開
global.G = G;
global.parseHexId = parseHexId;
global.getNeighborIds = getNeighborIds;
global.getUnitsAt = getUnitsAt;
global.hexDist = hexDist;
global.isMechanized = isMechanized;
global.dispHex = dispHex;
global.addLog = addLog;
global.lookupCRT = lookupCRT;
global.TERRAIN_MAP = TERRAIN_MAP;
global.FACILITY_MAP = FACILITY_MAP;
global.ROAD_MAP = ROAD_MAP;
global.getNWExitHexes = getNWExitHexes;
vm.runInThisContext(fs.readFileSync(path.join(dir, 'bulge_mcts.js'), 'utf8'));

// ========== AI移動先選択（ヒューリスティック）==========
function aiPickMoveTarget(unit, reachable) {
  const side = unit.side;
  let bestHex = null, bestScore = -Infinity;
  for (const [hid, info] of reachable) {
    let score = 0;
    const { col } = parseHexId(hid);
    const isCity = FACILITY_MAP && FACILITY_MAP[hid] === 'c';
    const isRoad = ROAD_MAP && ROAD_MAP[hid] && ROAD_MAP[hid].length > 0;
    if (side === 'german') {
      score -= col * 3;
      if (isCity) score += 20;
      const nwHexes = getNWExitHexes();
      if (nwHexes.length > 0 && isMechanized(unit)) {
        const minDist = Math.min(...nwHexes.map(nh => hexDist(hid, nh)));
        score -= minDist * 2;
        if (nwHexes.includes(hid)) score += 30;
      }
      if (isRoad) score += 2;
    } else {
      if (isCity) score += 25;
      const adjEnemies = getNeighborIds(hid).reduce((s, nid) => {
        return s + getUnitsAt(nid).filter(e => e.side !== side).reduce((es, e) => es + (e.flipped ? e.def : e.atk), 0);
      }, 0);
      const myPower = unit.flipped ? unit.def : unit.atk;
      if (adjEnemies > myPower * 2) {
        score += col * 2;
      } else {
        const cityHexes = [];
        if (FACILITY_MAP) {
          for (const [fhid, fac] of Object.entries(FACILITY_MAP)) {
            if (fac === 'c') cityHexes.push(fhid);
          }
        }
        if (cityHexes.length > 0) {
          score -= Math.min(...cityHexes.map(ch => hexDist(hid, ch))) * 2;
        }
      }
    }
    const terrain = TERRAIN_MAP[hid];
    if (terrain === 'f' && isMechanized(unit) && !isRoad) score -= 50;
    const adjEnemyCount = getNeighborIds(hid).filter(nid =>
      getUnitsAt(nid).some(e => e.side !== side)
    ).length;
    if (side === 'german') score += adjEnemyCount * 2;
    if (score > bestScore) { bestScore = score; bestHex = hid; }
  }
  return bestHex;
}

// ========== 全体スキャン評価: 盤面全体のスコア（ドイツ視点） ==========
function evalGlobalBoard(units) {
  let score = 0;
  const germanAlive = units.filter(u => u.side === 'german' && !u.eliminated && !u.exited);
  const alliedAlive = units.filter(u => u.side === 'allied' && !u.eliminated && !u.exited);

  // 都市支配
  if (FACILITY_MAP) {
    for (const [hid, fac] of Object.entries(FACILITY_MAP)) {
      if (fac !== 'c') continue;
      if (germanAlive.some(u => u.hexId === hid)) score += 10;
      else if (alliedAlive.some(u => u.hexId === hid)) score -= 8;
      else score += 2;
    }
  }

  // 部隊
  for (const u of units) {
    if (u.eliminated) { score += u.side === 'allied' ? 6 : -7; continue; }
    if (u.exited) { if (u._exitedNW) score += 5; continue; }
    const power = u.flipped ? u.def : u.atk;
    if (u.side === 'german') {
      score += power * 0.5;
      const col = parseInt(u.hexId.substring(0, 2)) - 1;
      score += (20 - col) * 0.4;
    } else {
      score -= power * 0.6;
      // 包囲度
      const retreats = mcCountRetreats(units, u);
      if (retreats === 0) score += 12;
      else if (retreats === 1) score += 5;
    }
  }

  // 連合戦線: 味方隣接でZOC壁
  for (const au of alliedAlive) {
    const adjFriends = getNeighborIds(au.hexId).filter(nid =>
      alliedAlive.some(f => f.id !== au.id && f.hexId === nid)
    ).length;
    score -= adjFriends * 1.5; // 戦線が繋がっている = ドイツ不利
    // 道路ブロック
    const rv = mcRoadValue(au.hexId);
    if (rv > 0) score -= rv * 1.2;
    // 敵隣接ペナルティ: 連合が敵に隣接 = 包囲・攻撃リスク（ドイツ有利）
    const adjEnemy = getNeighborIds(au.hexId).filter(nid =>
      germanAlive.some(gu => gu.hexId === nid)
    ).length;
    if (adjEnemy > 0) {
      const retreats = mcCountRetreats(units, au);
      score += adjEnemy * 3; // 敵隣接 = ドイツ有利
      if (retreats <= 1) score += 8; // 退路なし = さらにドイツ有利
    }
  }

  // ドイツ包囲圧力: ドイツが連合に隣接してZOCで囲んでいる
  for (const gu of germanAlive) {
    const adjAllied = getNeighborIds(gu.hexId).filter(nid =>
      alliedAlive.some(au => au.hexId === nid)
    ).length;
    if (adjAllied > 0) score += adjAllied * 2;
  }

  return score;
}

// ========== 同期AI: 全ユニット×全候補をスキャンして最善の1手を実行 ==========
function aiPlayOneUnit(side) {
  G.activeSide = side;
  const enemySide = side === 'german' ? 'allied' : 'german';

  const units = G.units.filter(u =>
    u.side === side && !u.acted && !u.flipped && !u.eliminated && !u.exited
  );
  if (units.length === 0) return false;

  // === 連合軍: 自発的パス ===
  if (side === 'allied') {
    const germanRemaining = G.units.filter(u =>
      u.side === 'german' && !u.acted && !u.flipped && !u.eliminated && !u.exited
    ).length;
    if (germanRemaining > 0) {
      // 緊急チェック: 包囲危機 or 都市直接脅威
      let urgent = false;
      for (const u of units) {
        const adjEnemy = getNeighborIds(u.hexId).some(nid =>
          getUnitsAt(nid).some(e => e.side === 'german')
        );
        if (adjEnemy) {
          const retreats = getRetreatHexes ? getRetreatHexes(u).length : 3;
          if (retreats <= 1) { urgent = true; break; }
        }
        if (FACILITY_MAP && FACILITY_MAP[u.hexId] === 'c' && adjEnemy) {
          urgent = true; break;
        }
      }
      if (!urgent && germanRemaining > units.length) {
        return false; // パスして待つ
      }
    }
  }

  // NW突破（ドイツ）
  if (side === 'german') {
    for (const u of units) {
      if (canExitNW(u)) { exitUnitNW(u.id); return true; }
    }
  }

  // === 全体スキャン: 現在の盤面スコア ===
  const sign = side === 'german' ? 1 : -1; // ドイツ=最大化、連合=最小化
  const baseScore = evalGlobalBoard(G.units);

  // === 全ユニット×全候補hexをスキャン ===
  let bestUnit = null, bestHex = null, bestDelta = -Infinity;

  for (const unit of units) {
    const reachable = calcReachable(unit);
    // 待機も候補
    const candidates = [unit.hexId];
    for (const [hid] of reachable) candidates.push(hid);

    for (const hid of candidates) {
      // スタック制限チェック
      if (hid !== unit.hexId) {
        const dest = getUnitsAt(hid).filter(u => u.side === unit.side);
        if (dest.length > 0 && !(unit.mechPair && dest.length < 2 && dest[0].id === unit.mechPair)) continue;
      }

      // 仮想移動して盤面評価
      const savedHex = unit.hexId;
      const stacked = isStacked(unit);
      const pair = stacked ? G.units.find(u => u.id === unit.mechPair) : null;
      const savedPairHex = pair ? pair.hexId : null;

      unit.hexId = hid;
      if (stacked && pair) pair.hexId = hid;

      const newScore = evalGlobalBoard(G.units);
      const delta = (newScore - baseScore) * sign; // 正=自軍有利に改善

      // 連合防御: 敵隣接への移動はペナルティ（攻撃誘発リスク）
      let penalty = 0;
      if (side === 'allied' && !mcIsAlliedOffensive(G.units)) {
        const adjEnemy = getNeighborIds(hid).some(nid =>
          getUnitsAt(nid).some(e => e.side === 'german')
        );
        if (adjEnemy && hid !== savedHex) penalty = 8; // 新たに敵隣接に入る
      }

      // 局所ボーナス（全体評価に反映されにくい要素を補完）
      let localBonus = 0;
      if (G.useMC) localBonus = mcEvalPosition(hid, unit, G.units) * 0.1;

      const totalDelta = delta - penalty + localBonus;

      if (totalDelta > bestDelta) {
        bestDelta = totalDelta;
        bestUnit = unit;
        bestHex = hid;
      }

      // 元に戻す
      unit.hexId = savedHex;
      if (pair) pair.hexId = savedPairHex;
    }
  }

  if (!bestUnit) return false;

  // === 最善手を実行 ===
  const unit = bestUnit;
  if (bestHex === unit.hexId) {
    // 待機が最善
    unit.acted = true; unit.flipped = true;
    return true;
  }

  const stacked = isStacked(unit);
  const pair = stacked ? G.units.find(u => u.id === unit.mechPair) : null;
  unit.hexId = bestHex;
  unit.acted = true;
  if (stacked && pair && !pair.acted) {
    pair.hexId = bestHex;
    pair.acted = true;
  }

  // 隣接敵 → 攻撃判定
  const adjEnemy = getNeighborIds(bestHex).some(nid =>
    getUnitsAt(nid).some(u => u.side !== side)
  );
  if (adjEnemy) {
    const enemyHexes = new Set();
    const actedUnits = G.units.filter(u =>
      u.side === side && u.acted && !u.eliminated && !u.exited && !u.flipped && !u._aiAttacked
    );
    for (const au of actedUnits) {
      for (const nid of getNeighborIds(au.hexId)) {
        if (getUnitsAt(nid).some(e => e.side === enemySide)) enemyHexes.add(nid);
      }
    }
    let bestAttack = null, bestDiff = -Infinity;
    for (const defHex of enemyHexes) {
      const defenders = getUnitsAt(defHex).filter(u => u.side === enemySide);
      const defPower = defenders.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
      const adjF = [];
      for (const nid of getNeighborIds(defHex)) {
        adjF.push(...getUnitsAt(nid).filter(u =>
          u.side === side && u.acted && !u.eliminated && !u.exited && !u.flipped && !u._aiAttacked
        ));
      }
      const atkPower = adjF.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
      const d = atkPower - defPower;
      if (atkPower >= defPower && d > bestDiff) {
        bestDiff = d;
        bestAttack = { defHex, attackers: adjF.map(u => u.id), defenders };
      }
    }
    if (bestAttack) {
      if (G.useMC) {
        const atkUnits = bestAttack.attackers.map(id => G.units.find(u => u.id === id)).filter(Boolean);
        if (!mcDecideAttack(atkUnits, bestAttack.defenders, bestAttack.defHex)) {
          unit.flipped = true; if (stacked && pair) pair.flipped = true;
          return true;
        }
      }
      for (const uid of bestAttack.attackers) {
        const u = G.units.find(x => x.id === uid);
        if (u) u._aiAttacked = true;
      }
      resetCombat();
      G.combat.defHex = bestAttack.defHex;
      G.combat.defenders = bestAttack.defenders;
      G.combat.attackers = bestAttack.attackers;
      executeCombatSync();
    } else {
      unit.flipped = true;
      if (stacked && pair) pair.flipped = true;
    }
  } else {
    unit.flipped = true;
    if (stacked && pair) pair.flipped = true;
  }
  return true;
}

// ========== 1ゲーム実行（1ユニットずつ交互） ==========
function playOneGame(useMC) {
  initGame(useMC);

  for (let turn = 1; turn <= G.maxTurn; turn++) {
    G.turn = turn;
    G.phase = 'reinforce';

    // 英軍投入（ターン5）
    if (turn >= 5 && G.britishDeployedTurn === 0) {
      G.britishDeployedTurn = turn;
    }

    // 増援
    placeReinforcements();

    // 回復
    doRecovery();

    // 作戦フェーズ: 1ユニットずつ交互
    G.phase = 'operation';
    G.units.forEach(u => {
      u.acted = false; u.flipped = false;
      delete u.mustAttack; delete u.movePath;
      delete u._movePathExpiry; delete u._lastMovedAt;
      delete u._unstacked; delete u._aiAttacked;
    });

    let currentSide = 'german';
    let passCount = 0;
    let maxOps = 200; // 無限ループ防止

    while (passCount < 2 && maxOps-- > 0) {
      const didSomething = aiPlayOneUnit(currentSide);
      if (!didSomething) {
        passCount++;
      } else {
        passCount = 0;
      }
      // サイド交代
      currentSide = currentSide === 'german' ? 'allied' : 'german';
    }
  }

  calcVP();

  // 統計
  const stats = {
    vpGerman: G.vpGerman,
    vpAllied: G.vpAllied,
    winner: G.vpGerman > G.vpAllied ? 'german' : G.vpGerman < G.vpAllied ? 'allied' : 'draw',
    germanElim: G.units.filter(u => u.side === 'german' && u.eliminated).length,
    alliedElim: G.units.filter(u => u.side === 'allied' && u.eliminated).length,
    germanExited: G.units.filter(u => u.side === 'german' && u.exited).length,
  };
  return stats;
}

// ========== メイン ==========
const args = process.argv.slice(2);
const numGames = parseInt(args.find(a => !a.startsWith('-')) || '100');
const useMC = args.includes('--mc');
const simsArg = args.find(a => a.startsWith('--sims='));
if (simsArg && typeof MC !== 'undefined') MC.SIMS = parseInt(simsArg.split('=')[1]) || 30;

console.log(`=== バルジの戦い AI対局 ===`);
console.log(`対局数: ${numGames}, MC: ${useMC ? 'ON' : 'OFF'}${useMC ? ' (sims=' + MC.SIMS + ')' : ''}`);
console.log('');

let germanWins = 0, alliedWins = 0, draws = 0;
let totalGermanElim = 0, totalAlliedElim = 0, totalGermanVP = 0, totalAlliedVP = 0;
let totalExited = 0;

const startTime = Date.now();

for (let i = 0; i < numGames; i++) {
  const stats = playOneGame(useMC);
  if (stats.winner === 'german') germanWins++;
  else if (stats.winner === 'allied') alliedWins++;
  else draws++;
  totalGermanElim += stats.germanElim;
  totalAlliedElim += stats.alliedElim;
  totalGermanVP += stats.vpGerman;
  totalAlliedVP += stats.vpAllied;
  totalExited += stats.germanExited;

  if ((i + 1) % 10 === 0) {
    process.stdout.write(`\r  ${i + 1}/${numGames} 局完了...`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\r                                `);
console.log(`=== 結果 (${elapsed}秒) ===`);
console.log(`ドイツ勝利: ${germanWins} (${(germanWins/numGames*100).toFixed(1)}%)`);
console.log(`連合勝利:   ${alliedWins} (${(alliedWins/numGames*100).toFixed(1)}%)`);
console.log(`引き分け:   ${draws}`);
console.log('');
console.log(`平均VP — ドイツ: ${(totalGermanVP/numGames).toFixed(1)}, 連合: ${(totalAlliedVP/numGames).toFixed(1)}`);
console.log(`平均壊滅 — ドイツ: ${(totalGermanElim/numGames).toFixed(1)}, 連合: ${(totalAlliedElim/numGames).toFixed(1)}`);
console.log(`平均NW突破: ${(totalExited/numGames).toFixed(1)}`);
