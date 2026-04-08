#!/usr/bin/env node
// pg_headless.js — Node.js用 Panzergrenadier 高速対局エンジン
// 使い方: node pg_headless.js [対局数] [--verbose]
'use strict';

// ========== データ読み込み ==========
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = __dirname;

// ========== グローバル変数準備 ==========
let G;
let testUnits = [];
let units = [];
let SCENARIO;
const dummyMap = {};
let _completedMoveTrails = [];
let _aiMoveTrail = [];

// verbose モード
const _verbose = process.argv.includes('--verbose');

// ========== DOM スタブ ==========
global.document = {
  getElementById: () => ({
    innerHTML: '', textContent: '', style: {}, className: '',
    appendChild: () => {}, scrollTop: 0, scrollHeight: 0,
    classList: { add: () => {}, remove: () => {} },
    querySelectorAll: () => [],
    scrollIntoView: () => {},
  }),
  createElement: () => ({
    className: '', textContent: '', style: {},
    appendChild: () => {},
  }),
};
global.window = {
  _aiRecentLogs: [],
  _aiMoveTrails: [],
  _aiAmbushCandidates: [],
  _aiFireOK: () => {},
  _aiConfirmOK: () => {},
  location: { search: '' },
};
try { global.navigator = { clipboard: { writeText: () => Promise.resolve() } }; } catch(e) {}
global.alert = () => {};
global.confirm = () => true;
global.Image = function() { this.onload = null; this.src = ''; };
global.setTimeout = (fn) => { if (typeof fn === 'function') fn(); return 0; };
global.clearTimeout = () => {};
global.setInterval = () => 0;
global.clearInterval = () => {};

// ========== データファイル読み込み ==========
vm.runInThisContext(fs.readFileSync(path.join(dir, 'mapdata.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(dir, 'unitdata.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(dir, 'scenario2.js'), 'utf8'));

// ========== UIスタブ関数 ==========
function drawMap() {}
function updatePhaseBar() {}
function renderPhase() {}
function renderRecoveryPhase() {}
function renderMoveFirePhase() {}
function renderAssaultPhase() {}
function renderSupportPhase() {}
function renderInitiativePhase() {}
function closeDiceOverlay() {}
function closeFireOverlay() {}
function showFireOverlay() {}
function showDiceOverlay() {}
function showInitResult() {}
function loadUnitImages() {}
function panToHex() {}
function showFlash() {}
function updateFireRange() {}
function renderReinforcementPhase() {}
function finishReinforcementPhase() {}

// ========== ログ ==========
const _allLogs = [];
function addLog(type, msg) {
  const fullMsg = `[T${G ? G.turn : '?'} P${G ? G.phase : '?'}] ${msg}`;
  _allLogs.push(fullMsg);
  if (_verbose) console.log(fullMsg);
  if (!window._aiRecentLogs) window._aiRecentLogs = [];
  window._aiRecentLogs.push(msg);
}
function copyAllLogs() {}

// ========== ダミー画像 ==========
const DUMMY_IMAGES = {
  'イギリス軍': 'images/ge表1cut46000020.jpg',
  'アメリカ軍': 'images/us表03cut28000014.jpg',
  'ドイツ軍':   'images/ドイツcut47000021.jpg',
};

// ========== ヘクスID変換 ==========
function toHexId(col, row) {
  return String(col + 1).padStart(2, '0') + String(row + 1).padStart(2, '0');
}
function fromHexId(hexId) {
  return { col: parseInt(hexId.substring(0, 2)) - 1, row: parseInt(hexId.substring(2, 4)) - 1 };
}

// ========== ヘクス座標 ==========
function getHexCenter(col, row) {
  const size = MAP_CONFIG.hexSize;
  const ox = MAP_CONFIG.offsetX;
  const oy = MAP_CONFIG.offsetY;
  const w = size * 2;
  const h = Math.sqrt(3) * size;
  const x = ox + col * w * 0.75 + size;
  let y = oy + row * h + h / 2;
  if (col % 2 === 1) y += h / 2;
  return { x, y };
}

function getNearestHex(mx, my) {
  const size = MAP_CONFIG.hexSize;
  const ox = MAP_CONFIG.offsetX;
  const oy = MAP_CONFIG.offsetY;
  const w = size * 2;
  const h = Math.sqrt(3) * size;
  let bestCol = 0, bestRow = 0, bestDist = Infinity;
  for (let r = 0; r < MAP_CONFIG.rows; r++) {
    for (let c = 0; c < MAP_CONFIG.cols; c++) {
      const hx = ox + c * w * 0.75 + size;
      let hy = oy + r * h + h / 2;
      if (c % 2 === 1) hy += h / 2;
      const dx = mx - hx, dy = my - hy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; bestCol = c; bestRow = r; }
    }
  }
  return { col: bestCol, row: bestRow, dist: Math.sqrt(bestDist) };
}

// ========== 地形関数 ==========
function getHexTerrain(hexId) {
  const facility = FACILITY_MAP[hexId];
  if (facility) return facility;
  return TERRAIN_MAP[hexId] || 'x';
}

function getHexElevation(col, row) {
  const hid = toHexId(col, row);
  if (typeof ELEVATION_MAP !== 'undefined' && ELEVATION_MAP[hid]) {
    return ELEVATION_MAP[hid] - 1;
  }
  return 0;
}

// ========== LOS ==========
function isLOSBlocker(hexId) {
  const t = getHexTerrain(hexId);
  return t === 'f' || t === 'w' || t === 't' || t === 'c';
}

function getHexesOnLine(col1, row1, col2, row2) {
  const c1 = getHexCenter(col1, row1);
  const c2 = getHexCenter(col2, row2);
  const steps = Math.max(Math.abs(col2 - col1), Math.abs(row2 - row1), 1) * 3;
  const hexes = [];
  const seen = new Set();
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = c1.x + (c2.x - c1.x) * t;
    const py = c1.y + (c2.y - c1.y) * t;
    const nh = getNearestHex(px, py);
    const key = `${nh.col},${nh.row}`;
    if (seen.has(key) || (nh.col === col1 && nh.row === row1) || (nh.col === col2 && nh.row === row2)) continue;
    const hc = getHexCenter(nh.col, nh.row);
    const distToCenter = Math.sqrt((px - hc.x) ** 2 + (py - hc.y) ** 2);
    const threshold = MAP_CONFIG.hexSize * 0.75;
    nh._onBorder = distToCenter > threshold;
    nh._sampleX = px;
    nh._sampleY = py;
    seen.add(key);
    hexes.push(nh);
  }
  return hexes;
}

function getSlopeBonus(col, row) {
  const hid = toHexId(col, row);
  let bonus = 0;
  for (const [h1, h2, type] of RIVER_MAP) {
    if (type === 'slope1' || type === 'slope2' || type === 'cliff') {
      if (h1 === hid || h2 === hid) {
        const b = (type === 'slope2') ? 2 : 1;
        if (b > bonus) bonus = b;
      }
    }
  }
  return bonus;
}

function getTerrainBlockLevel(hexId) {
  const t = getHexTerrain(hexId);
  if (t === 'f' || t === 'w' || t === 't' || t === 'c') return 1;
  return 0;
}

function _distPointToLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / Math.sqrt(len2);
}

function _projectPointToLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: x1, y: y1 };
  const t = ((px - x1) * dx + (py - y1) * dy) / len2;
  return { x: x1 + t * dx, y: y1 + t * dy };
}

let _losX1 = 0, _losY1 = 0, _losX2 = 0, _losY2 = 0;

function checkSlopeCrossing(col1, row1, col2, row2) {
  const hexesOnLine = getHexesOnLine(col1, row1, col2, row2);
  const srcSight = 1 + getHexElevation(col1, row1);
  const tgtSight = 1 + getHexElevation(col2, row2);
  const fullPath = [{ col: col1, row: row1 }, ...hexesOnLine, { col: col2, row: row2 }];
  const slopeMap = {};
  for (const [h1, h2, type] of RIVER_MAP) {
    if (type !== 'slope1' && type !== 'slope2' && type !== 'cliff') continue;
    const key1 = `${h1}-${h2}`;
    const key2 = `${h2}-${h1}`;
    const level = (type === 'slope2') ? 2 : 1;
    slopeMap[key1] = level;
    slopeMap[key2] = level;
  }
  const _sc = getHexCenter(col1, row1);
  const _tc = getHexCenter(col2, row2);
  const slopeApothem = MAP_CONFIG.hexSize * 0.75;
  for (let i = 0; i < fullPath.length - 1; i++) {
    const cur = fullPath[i];
    const next = fullPath[i + 1];
    const curId = toHexId(cur.col, cur.row);
    const nextId = toHexId(next.col, next.row);
    const key = `${curId}-${nextId}`;
    const slopeLevel = slopeMap[key];
    if (slopeLevel) {
      const cc = getHexCenter(cur.col, cur.row);
      const nc = getHexCenter(next.col, next.row);
      const curDist = _distPointToLine(cc.x, cc.y, _sc.x, _sc.y, _tc.x, _tc.y);
      const nextDist = _distPointToLine(nc.x, nc.y, _sc.x, _sc.y, _tc.x, _tc.y);
      if (curDist > slopeApothem || nextDist > slopeApothem) continue;
      const srcId = toHexId(col1, row1);
      const tgtId = toHexId(col2, row2);
      if ((curId === srcId || nextId === srcId) && getHexElevation(col1, row1) >= slopeLevel) continue;
      if ((curId === tgtId || nextId === tgtId) && getHexElevation(col2, row2) >= slopeLevel) continue;
      if (srcSight > slopeLevel && tgtSight > slopeLevel) continue;
      if (srcSight > slopeLevel + 1 || tgtSight > slopeLevel + 1) continue;
      return false;
    }
  }
  return true;
}

function hasLOS(col1, row1, col2, row2) {
  if (col1 === col2 && row1 === row2) return true;
  const _s = getHexCenter(col1, row1);
  const _t = getHexCenter(col2, row2);
  _losX1 = _s.x; _losY1 = _s.y; _losX2 = _t.x; _losY2 = _t.y;
  if (!checkSlopeCrossing(col1, row1, col2, row2)) return false;
  const hexesOnLine = getHexesOnLine(col1, row1, col2, row2);
  const srcSight = 1 + getHexElevation(col1, row1);
  const tgtSight = 1 + getHexElevation(col2, row2);
  for (const h of hexesOnLine) {
    const hexId = toHexId(h.col, h.row);
    const hc = getHexCenter(h.col, h.row);
    const losDistToCenter = _distPointToLine(hc.x, hc.y, _losX1, _losY1, _losX2, _losY2);
    const apothem = MAP_CONFIG.hexSize * 0.75;
    if (losDistToCenter > apothem) {
      if (isLOSBlocker(hexId)) {
        const proj = _projectPointToLine(hc.x, hc.y, _losX1, _losY1, _losX2, _losY2);
        const rx = proj.x * 2 - hc.x;
        const ry = proj.y * 2 - hc.y;
        const otherHex = getNearestHex(rx, ry);
        if (otherHex.col !== h.col || otherHex.row !== h.row) {
          const otherId = toHexId(otherHex.col, otherHex.row);
          if (isLOSBlocker(otherId)) return false;
        }
      }
      continue;
    }
    if (isLOSBlocker(hexId)) {
      const blockLevel = getTerrainBlockLevel(hexId) + getHexElevation(h.col, h.row);
      if (srcSight > blockLevel && tgtSight > blockLevel) continue;
      return false;
    }
    const midElev = getHexElevation(h.col, h.row);
    if (midElev > 0) {
      const midSight = 1 + midElev;
      const lo = Math.min(srcSight, tgtSight);
      const hi = Math.max(srcSight, tgtSight);
      if (midSight > lo && midSight >= hi) return false;
    }
  }
  return true;
}

// ========== ヘクス隣接・距離 ==========
function getHexNeighbors(col, row) {
  const odd = col % 2 === 1;
  if (odd) {
    return [
      { col: col - 1, row: row     },
      { col: col - 1, row: row + 1 },
      { col: col,     row: row - 1 },
      { col: col,     row: row + 1 },
      { col: col + 1, row: row     },
      { col: col + 1, row: row + 1 },
    ].filter(n => n.col >= 0 && n.col < MAP_CONFIG.cols && n.row >= 0 && n.row < MAP_CONFIG.rows);
  } else {
    return [
      { col: col - 1, row: row - 1 },
      { col: col - 1, row: row     },
      { col: col,     row: row - 1 },
      { col: col,     row: row + 1 },
      { col: col + 1, row: row - 1 },
      { col: col + 1, row: row     },
    ].filter(n => n.col >= 0 && n.col < MAP_CONFIG.cols && n.row >= 0 && n.row < MAP_CONFIG.rows);
  }
}

function hexDistance(c1, r1, c2, r2) {
  function toCube(col, row) {
    const x = col;
    const z = row - (col - (col & 1)) / 2;
    const y = -x - z;
    return { x, y, z };
  }
  const a = toCube(c1, r1);
  const b = toCube(c2, r2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

// ========== スタッキング ==========
const STACK_LIMIT = 4;
const STACK_EXEMPT_TYPES = ['dummy', 'leader', 'fortification', 'ip'];

function getStackCount(hexId) {
  return testUnits.filter(u =>
    u.hexId === hexId &&
    u.status !== 'eliminated' &&
    !STACK_EXEMPT_TYPES.includes(u.type)
  ).length;
}

function isOverstacked(hexId) {
  return getStackCount(hexId) > STACK_LIMIT;
}

// ========== ダミーシステム ==========
function getDummyCount(hexId) {
  return testUnits.filter(u =>
    u.type === 'dummy' && u.hexId === hexId && u.status !== 'eliminated'
  ).length;
}

function removeDummy(hexId, count) {
  const dummies = testUnits.filter(u =>
    u.type === 'dummy' && u.hexId === hexId && u.status !== 'eliminated'
  );
  const toRemove = Math.min(dummies.length, count);
  for (let i = 0; i < toRemove; i++) {
    dummies[i].status = 'eliminated';
  }
  return toRemove;
}

function removeAllDummies(hexId) {
  const dummies = testUnits.filter(u =>
    u.type === 'dummy' && u.hexId === hexId && u.status !== 'eliminated'
  );
  dummies.forEach(d => { d.status = 'eliminated'; });
  return dummies.length;
}

function isDummyProtected(hexId) {
  if (getDummyCount(hexId) === 0) return false;
  const terrain = getHexTerrain(hexId);
  if (terrain === 'p' || terrain === 'r') return false;
  return true;
}

function checkDummyOnSpotted(hexId, spottingSide) {
  if (getDummyCount(hexId) === 0) return false;
  const dummies = testUnits.filter(u => u.type === 'dummy' && u.hexId === hexId && u.status !== 'eliminated');
  if (dummies.length === 0) return false;
  if (dummies[0].side === spottingSide) return false;
  const terrain = getHexTerrain(hexId);
  if (terrain === 'p' || terrain === 'r') {
    const removed = removeAllDummies(hexId);
    addLog('dummy', `ダミー除去: ${hexId} (平地/荒地で視認) ${removed}枚`);
    return true;
  }
  return false;
}

function checkDummyVisibility(movedUnit) {
  const side = movedUnit.side;
  const enemySide = side === 'german' ? 'allied' : 'german';
  const visionRange = G.visionPoints || 12;
  testUnits.forEach(u => {
    if (u.type !== 'dummy' || u.side === side || u.status === 'eliminated') return;
    const dist = hexDistance(movedUnit.col, movedUnit.row, u.col, u.row);
    if (dist > 0 && dist <= visionRange) {
      if (hasLOS(movedUnit.col, movedUnit.row, u.col, u.row)) {
        checkDummyOnSpotted(u.hexId, side);
      }
    }
  });
  const myHexId = toHexId(movedUnit.col, movedUnit.row);
  if (getDummyCount(myHexId) > 0) {
    const myDummies = testUnits.filter(u => u.type === 'dummy' && u.hexId === myHexId && u.status !== 'eliminated');
    if (myDummies.length > 0 && myDummies[0].side === side) {
      const terrain = getHexTerrain(myHexId);
      if (terrain === 'p' || terrain === 'r') {
        const spotted = testUnits.some(e =>
          e.side === enemySide && e.status !== 'eliminated' && e.type !== 'dummy' &&
          hexDistance(e.col, e.row, movedUnit.col, movedUnit.row) <= visionRange &&
          hasLOS(e.col, e.row, movedUnit.col, movedUnit.row)
        );
        if (spotted) {
          checkDummyOnSpotted(myHexId, enemySide);
        }
      }
    }
  }
}

function onUnitAction(unit, batchUnits) {
  if (!unit.hexId || unit.status === 'eliminated') return;
  const hexId = unit.hexId;
  if (getDummyCount(hexId) === 0) return;
  const sideDummies = testUnits.filter(u =>
    u.hexId === hexId && u.type === 'dummy' && u.side === unit.side && u.status !== 'eliminated'
  );
  if (sideDummies.length === 0) return;
  const hexMates = testUnits.filter(u =>
    u.hexId === hexId && u.side === unit.side && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader'
  );
  const batchSet = batchUnits ? new Set(batchUnits) : new Set([unit]);
  const unactedMates = hexMates.filter(u =>
    !batchSet.has(u) && !u.firedThisTurn && !u.moveComplete && !u.assaultedThisTurn
  );
  if (unactedMates.length > 0) {
    const toRemove = sideDummies.length - 1;
    if (toRemove > 0) {
      for (let i = 0; i < toRemove; i++) sideDummies[i].status = 'eliminated';
      addLog('dummy', `ダミー減少: ${hexId} ${unit.name}行動 (1枚残し)`);
    }
  } else {
    sideDummies.forEach(d => { d.status = 'eliminated'; });
    addLog('dummy', `ダミー全除去: ${hexId} 行動により発見`);
  }
}

function placeDummy(hexId, side, count, nation) {
  if (!count || count <= 0) return;
  if (!nation) {
    const mate = testUnits.find(u => u.hexId === hexId && u.side === side && u.nation);
    nation = mate ? mate.nation : (side === 'german' ? 'ドイツ軍' : 'イギリス軍');
  }
  const existing = getDummyCount(hexId);
  const toAdd = Math.min(count, 4 - existing);
  const pos = fromHexId(hexId);
  for (let i = 0; i < toAdd; i++) {
    const dummy = {
      type: 'dummy', side, status: 'ok', hexId,
      col: pos.col, row: pos.row,
      name: `ダミー-${hexId}-${Date.now()}-${i}`,
      id: `ダミー-${hexId}-${Date.now()}-${i}_gen`,
      range: 0, fpAT: 0, fpSoft: 0, def: 0, morale: 0,
      closeAtk: 0, closeDef: 0, move: 0,
      nation: nation,
      src: DUMMY_IMAGES[nation] || '',
    };
    const center = getHexCenter(pos.col, pos.row);
    dummy.x = center.x;
    dummy.y = center.y;
    testUnits.push(dummy);
  }
}

function cleanupOrphanDummies(hexId, side) {
  if (!hexId) return;
  const hasFriendly = testUnits.some(u =>
    u.hexId === hexId && u.side === side && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'fortification' && u.type !== 'ip'
  );
  if (!hasFriendly) {
    removeAllDummies(hexId);
  }
}

// ========== 指揮官システム ==========
const LEADER_ABILITY_POOL = {
  leader_a: [['A','M','R'], ['F','A','R'], ['F','M','R']],
  leader_b: [['F','R'], ['A','R'], ['M','R']],
  leader_c: [['F'], ['A'], ['M'], ['R'], ['R']],
};

function assignLeaderAbilities(unit) {
  if (unit.type !== 'leader') return;
  const rank = unit.leaderRank || 'leader_c';
  const pool = LEADER_ABILITY_POOL[rank];
  unit.abilities = pool[Math.floor(Math.random() * pool.length)];
}

function canCommandUnit(leader, target) {
  if (leader.type !== 'leader') return false;
  if (leader.status === 'eliminated') return false;
  if (target.type === 'leader' || target.type === 'dummy') return false;
  if (leader.side !== target.side) return false;
  const leaderNation = leader.nation || (leader.ss ? 'ss' : 'ge');
  const targetNation = target.nation || (target.ss ? 'ss' : 'ge');
  if (leader.side === 'german' && leaderNation !== targetNation) return false;
  return true;
}

function getLeaderInHex(hexId, side) {
  return testUnits.find(u =>
    u.hexId === hexId && u.type === 'leader' && u.side === side && u.status !== 'eliminated'
  );
}

function getActiveLeaderForUnit(unit, abilityType) {
  const leader = getLeaderInHex(unit.hexId, unit.side);
  if (leader && canCommandUnit(leader, unit)) {
    if (leader.abilities && leader.abilities.includes(abilityType)) return leader;
  }
  const pos = fromHexId(unit.hexId);
  const neighbors = getHexNeighbors(pos.col, pos.row);
  for (const n of neighbors) {
    const nHexId = toHexId(n.col, n.row);
    const nLeader = getLeaderInHex(nHexId, unit.side);
    if (nLeader && canCommandUnit(nLeader, unit)) {
      if (nLeader.abilities && nLeader.abilities.includes('R') && nLeader.abilities.includes(abilityType)) {
        return nLeader;
      }
    }
  }
  return null;
}

function hasLeaderMoraleBonus(unit) {
  const leader = getActiveLeaderForUnit(unit, 'M');
  return !!leader;
}

function checkLeaderCasualty(hexId, side) {
  const leader = getLeaderInHex(hexId, side);
  if (!leader) return null;
  const roll = Math.floor(Math.random() * 10);
  if (roll === 0) {
    leader.status = 'eliminated';
    addLog('init', `${leader.name} 負傷！（ダイス: ${roll}）→ 除去`);
    return { leader, roll, wounded: true };
  }
  return { leader, roll, wounded: false };
}

function findNearestFriendlyHex(srcHexId, side) {
  const srcPos = fromHexId(srcHexId);
  const srcCenter = getHexCenter(srcPos.col, srcPos.row);
  let bestHex = null, bestDist = Infinity;
  const seen = new Set();
  testUnits.forEach(u => {
    if (u.side !== side || u.type === 'leader' || u.type === 'dummy' ||
        u.status === 'eliminated' || u.hexId === srcHexId || !u.hexId || u.hexId === 'reinforcement') return;
    if (seen.has(u.hexId)) return;
    seen.add(u.hexId);
    const pos = fromHexId(u.hexId);
    const c = getHexCenter(pos.col, pos.row);
    const dist = (c.x - srcCenter.x) ** 2 + (c.y - srcCenter.y) ** 2;
    if (dist < bestDist) { bestDist = dist; bestHex = u.hexId; }
  });
  return bestHex;
}

function checkLeaderOnStackEliminated(hexId, side) {
  const leader = getLeaderInHex(hexId, side);
  if (!leader) return null;
  const aliveUnits = testUnits.filter(u =>
    u.hexId === hexId && u.side === side &&
    u.type !== 'leader' && u.type !== 'dummy' &&
    u.status !== 'eliminated'
  );
  if (aliveUnits.length > 0) return null;
  const roll = Math.floor(Math.random() * 10);
  if (roll <= 4) {
    leader.status = 'eliminated';
    addLog('init', `${leader.name}: 部隊壊滅（ダイス: ${roll}）→ 指揮官も除去`);
    return { leader, roll, eliminated: true };
  } else {
    const nearest = findNearestFriendlyHex(hexId, side);
    if (nearest) {
      leader.hexId = nearest;
      const pos = fromHexId(nearest);
      leader.col = pos.col;
      leader.row = pos.row;
      const center = getHexCenter(pos.col, pos.row);
      leader.x = center.x;
      leader.y = center.y;
      addLog('init', `${leader.name}: 部隊壊滅（ダイス: ${roll}）→ ${nearest}の味方へ合流`);
    } else {
      leader.hexId = 'reinforcement';
      addLog('init', `${leader.name}: 部隊壊滅（ダイス: ${roll}）→ 援軍と再登場`);
    }
    return { leader, roll, eliminated: false, movedTo: leader.hexId };
  }
}

// ========== 射撃戦闘結果表 ==========
const FP_COLUMNS = [1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,24,26,29,32,35,38,41,45,49,999];

function getFPColumnIndex(fp) {
  if (fp <= 0) return 0;
  for (let i = 0; i < FP_COLUMNS.length; i++) {
    if (fp <= FP_COLUMNS[i]) return i;
  }
  return FP_COLUMNS.length - 1;
}

const FIRE_COMBAT_TABLE = {
  '-3': [0,0,0,0,0,0,0,1,2,3,4,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12],
  '-2': [0,0,0,0,0,0,1,2,3,4,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13],
  '-1': [0,0,0,0,0,1,2,3,4,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],
   '0': [0,0,0,0,1,1,3,4,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14],
   '1': [0,0,0,1,1,2,4,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14],
   '2': [0,0,1,1,2,3,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15],
   '3': [0,0,1,2,3,4,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15],
   '4': [0,1,2,3,4,5,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99],
   '5': [1,2,3,3,5,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99,99],
   '6': [2,3,3,4,6,6,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99,99,99],
   '7': [3,4,4,5,6,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99,99,99,99],
   '8': [4,5,5,6,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99,99,99,99,99],
   '9': [4,5,6,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99,99,99,99,99,99],
  '10': [5,6,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99,99,99,99,99,99,99],
  '11': [6,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99,99,99,99,99,99,99,99],
  '12': [7,8,9,9,9,10,10,11,11,12,12,13,13,14,14,15,15,99,99,99,99,99,99,99,99,99],
};

function getFireCombatResult(fp, dieRoll) {
  const colIdx = getFPColumnIndex(fp);
  const clampedDie = Math.max(-3, Math.min(12, dieRoll));
  const row = FIRE_COMBAT_TABLE[String(clampedDie)];
  if (!row) return { damageLevel: 0, isElimination: false, ammoCheck: false };
  const val = row[colIdx];
  const isE = val === 99;
  const damageLevel = isE ? 99 : val;
  return { damageLevel, isElimination: isE, ammoCheck: false };
}

function resolveDamage(damageLevel, defenseLevel) {
  if (damageLevel === 99) return 'eliminated';
  const diff = damageLevel - defenseLevel;
  if (diff >= 3) return 'eliminated';
  if (diff === 2) return 'dd';
  if (diff >= 0) return 'd';
  return 'none';
}

// ========== 地形修正テーブル ==========
const TERRAIN_MODIFIERS = {
  'p':    { fire: 0,  assault: 0,  move: 1,   vision: 1 },
  'w':    { fire: -2, assault: -1, move: 2,   vision: 'block' },
  'f':    { fire: -3, assault: -2, move: 3,   vision: 'block' },
  'r':    { fire: -1, assault: -1, move: 2,   vision: 4 },
  't':    { fire: -2, assault: -1, move: 1,   vision: 'block' },
  'c':    { fire: -3, assault: -2, move: 1,   vision: 'block' },
  'lake': { fire: 0,  assault: 0,  move: -1,  vision: 1 },
  'river':{ fire: 0,  assault: -1, move: 1,   vision: 1 },
  'slope1':{ fire: 0, assault: -1, move: 1,   vision: 'block' },
  'cliff': { fire: 0, assault: -1, move: -1,  vision: 'block' },
  'road':  { fire: 0, assault: 0,  move: 0.5, vision: 1 },
  'bridge':{ fire: 0, assault: 0,  move: 0.5, vision: 1 },
  'ip':    { fire: -1,assault: -2, move: 0,   vision: 'block' },
  'fortification': { fire: 0, assault: -2, move: 0, vision: 'block' },
};

function getTerrainFireMod(hexId) {
  const t = getHexTerrain(hexId);
  const mod = TERRAIN_MODIFIERS[t];
  return mod ? mod.fire : 0;
}

// ========== グローバルヘルパー ==========
function isUnderEnemyThreat(col, row, side) {
  const enemySide = side === 'allied' ? 'german' : 'allied';
  return testUnits.some(e =>
    e.side === enemySide && e.status !== 'eliminated' &&
    e.type !== 'dummy' && e.type !== 'leader' &&
    hexDistance(e.col, e.row, col, row) <= (e.range || 1) &&
    hasLOS(e.col, e.row, col, row)
  );
}

function isCoverTerrain(hexId) {
  const t = getHexTerrain(hexId);
  return t === 'f' || t === 'w' || t === 't';
}

function avgDistFromEnemy(col, row) {
  const enemies = testUnits.filter(e => e.side === 'german' && e.status !== 'eliminated' && e.type !== 'dummy' && e.type !== 'leader');
  if (enemies.length === 0) return 99;
  return enemies.reduce((s, e) => s + hexDistance(e.col, e.row, col, row), 0) / enemies.length;
}

// ========== グローバル変数をglobalに公開 ==========
global.G = G;
global.testUnits = testUnits;
global.units = units;
global.SCENARIO = SCENARIO;
global.dummyMap = dummyMap;
global.MAP_CONFIG = MAP_CONFIG;
global.TERRAIN_MAP = TERRAIN_MAP;
global.FACILITY_MAP = FACILITY_MAP;
global.ELEVATION_MAP = typeof ELEVATION_MAP !== 'undefined' ? ELEVATION_MAP : {};
global.ROAD_MAP = typeof ROAD_MAP !== 'undefined' ? ROAD_MAP : {};
global.RIVER_MAP = typeof RIVER_MAP !== 'undefined' ? RIVER_MAP : [];
global.FIRE_COMBAT_TABLE = FIRE_COMBAT_TABLE;
global.FP_COLUMNS = FP_COLUMNS;
global.TERRAIN_MODIFIERS = TERRAIN_MODIFIERS;
global.STACK_EXEMPT_TYPES = STACK_EXEMPT_TYPES;
global.STACK_LIMIT = STACK_LIMIT;
global.DUMMY_IMAGES = DUMMY_IMAGES;
global.PHASES = [
  { id:'initiative', name:'イニシアチブ', short:'主導権' },
  { id:'recovery',   name:'回復',         short:'回復' },
  { id:'support',    name:'支援射撃',     short:'支援' },
  { id:'moveFire',   name:'先攻移動・射撃', short:'移動射撃' },
  { id:'assault',    name:'突撃',         short:'突撃' },
  { id:'defMove',    name:'後攻移動',     short:'後攻移動' },
  { id:'turnEnd',    name:'ターン終了',   short:'終了' },
];
const PHASES = global.PHASES;

// 関数をグローバルに公開
global.toHexId = toHexId;
global.fromHexId = fromHexId;
global.getHexCenter = getHexCenter;
global.getNearestHex = getNearestHex;
global.getHexTerrain = getHexTerrain;
global.getHexElevation = getHexElevation;
global.isLOSBlocker = isLOSBlocker;
global.getHexesOnLine = getHexesOnLine;
global.hasLOS = hasLOS;
global.getHexNeighbors = getHexNeighbors;
global.hexDistance = hexDistance;
global.getStackCount = getStackCount;
global.isOverstacked = isOverstacked;
global.getDummyCount = getDummyCount;
global.removeDummy = removeDummy;
global.removeAllDummies = removeAllDummies;
global.isDummyProtected = isDummyProtected;
global.checkDummyVisibility = checkDummyVisibility;
global.checkDummyOnSpotted = checkDummyOnSpotted;
global.onUnitAction = onUnitAction;
global.placeDummy = placeDummy;
global.cleanupOrphanDummies = cleanupOrphanDummies;
global.hasLeaderMoraleBonus = hasLeaderMoraleBonus;
global.checkLeaderCasualty = checkLeaderCasualty;
global.checkLeaderOnStackEliminated = checkLeaderOnStackEliminated;
global.getActiveLeaderForUnit = getActiveLeaderForUnit;
global.canCommandUnit = canCommandUnit;
global.getLeaderInHex = getLeaderInHex;
global.findNearestFriendlyHex = findNearestFriendlyHex;
global.assignLeaderAbilities = assignLeaderAbilities;
global.getFPColumnIndex = getFPColumnIndex;
global.getFireCombatResult = getFireCombatResult;
global.resolveDamage = resolveDamage;
global.getTerrainFireMod = getTerrainFireMod;
global.isUnderEnemyThreat = isUnderEnemyThreat;
global.isCoverTerrain = isCoverTerrain;
global.avgDistFromEnemy = avgDistFromEnemy;
global.addLog = addLog;
global.drawMap = drawMap;
global.updatePhaseBar = updatePhaseBar;
global.renderPhase = renderPhase;
global.renderRecoveryPhase = renderRecoveryPhase;
global.renderMoveFirePhase = renderMoveFirePhase;
global.renderAssaultPhase = renderAssaultPhase;
global.renderSupportPhase = renderSupportPhase;
global.renderInitiativePhase = renderInitiativePhase;
global.closeDiceOverlay = closeDiceOverlay;
global.closeFireOverlay = closeFireOverlay;
global.showFireOverlay = showFireOverlay;
global.showDiceOverlay = showDiceOverlay;
global.loadUnitImages = loadUnitImages;
global.panToHex = panToHex;
global.showFlash = showFlash;
global.updateFireRange = updateFireRange;
global.renderReinforcementPhase = renderReinforcementPhase;
global.finishReinforcementPhase = finishReinforcementPhase;
global._completedMoveTrails = _completedMoveTrails;
global._aiMoveTrail = _aiMoveTrail;
global.LEADER_ABILITY_POOL = LEADER_ABILITY_POOL;
global.copyAllLogs = copyAllLogs;

// ========== hub.html専用関数（外部JSファイルに含まれない） ==========

// BFS最短経路計算（移動コストベース、スタック制限考慮）
function bfsShortestPath(unit, startCol, startRow, targetCol, targetRow, formation, aliveUnits, checkStacking) {
    const startKey = `${startCol},${startRow}`;
    const targetKey = `${targetCol},${targetRow}`;
    if (startKey === targetKey) return { cost: 0, path: [] };

    const aliveCount = aliveUnits ? aliveUnits.filter(u => u.status !== 'eliminated').length : 4;
    const dist = {};
    const prev = {};
    dist[startKey] = 0;
    const queue = [{ col: startCol, row: startRow, cost: 0 }];

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const cur = queue.shift();
      const curKey = `${cur.col},${cur.row}`;
      if (cur.cost > (dist[curKey] || Infinity)) continue;
      if (curKey === targetKey) break;

      const nbs = getHexNeighbors(cur.col, cur.row);
      for (const n of nbs) {
        if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
        const nHid = toHexId(n.col, n.row);
        const enemySide = unit.side === 'german' ? 'allied' : 'german';
        const hasEnemyUnit = testUnits.some(eu =>
          eu.hexId === nHid && eu.side === enemySide &&
          eu.status !== 'eliminated' && eu.type !== 'dummy'
        );
        if (hasEnemyUnit) continue;
        const mc = getMoveCost(unit, cur.col, cur.row, n.col, n.row, formation);
        if (mc.cost === Infinity) continue;
        if (checkStacking) {
          const hid = toHexId(n.col, n.row);
          const existing = testUnits.filter(su =>
            su.hexId === hid && su.status !== 'eliminated' &&
            !STACK_EXEMPT_TYPES.includes(su.type) &&
            !(aliveUnits && aliveUnits.includes(su))
          ).length;
          if (existing + aliveCount > 4) continue;
        }
        const nKey = `${n.col},${n.row}`;
        const newCost = cur.cost + mc.cost;
        if (newCost < (dist[nKey] || Infinity)) {
          dist[nKey] = newCost;
          prev[nKey] = curKey;
          queue.push({ col: n.col, row: n.row, cost: newCost });
        }
      }
    }

    if (dist[targetKey] === undefined) return { cost: Infinity, path: [] };

    const path = [];
    let key = targetKey;
    while (key && key !== startKey) {
      const [c, r] = key.split(',').map(Number);
      path.unshift({ col: c, row: r });
      key = prev[key];
    }
    return { cost: dist[targetKey], path };
}
global.bfsShortestPath = bfsShortestPath;

// 車両ユニットかどうか判定
function isVehicle(unit) {
  return unit.type === 'T' || unit.type === 'AC';
}
global.isVehicle = isVehicle;

// applyDamage（hub.html内の簡易版）
function applyDamage(unit, dmgResult) {
  if (dmgResult === 'none') return;
  if (dmgResult === 'eliminated' || dmgResult === 'E') {
    unit.status = 'eliminated';
  } else if (dmgResult === 'dd') {
    if (unit.status === 'ok') unit.status = 'dd';
    else unit.status = 'eliminated';
  } else if (dmgResult === 'd') {
    if (unit.status === 'ok') unit.status = 'd';
    else if (unit.status === 'd') unit.status = 'dd';
    else if (unit.status === 'dd') unit.status = 'eliminated';
  }
}
global.applyDamage = applyDamage;

// 視認対象が味方から見えるか（盤外砲兵用）
function isTargetSpottedByFriendly(targetHexId, side) {
  const tPos = fromHexId(targetHexId);
  return testUnits.some(u =>
    u.side === side && u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader' &&
    hexDistance(u.col, u.row, tPos.col, tPos.row) <= (G.visionRange || 12) &&
    hasLOS(u.col, u.row, tPos.col, tPos.row)
  );
}
global.isTargetSpottedByFriendly = isTargetSpottedByFriendly;

// ========== シナリオ選択 ==========
// pg_train.jsからrequire前にglobal._presetHeadlessScenarioで指定可能
let _headlessScenarioId = global._presetHeadlessScenario || 2;
global.setHeadlessScenario = function(id) { _headlessScenarioId = id; };

SCENARIO = SCENARIO_2;
global.SCENARIO = SCENARIO;

// ========== 外部JSファイル読み込み ==========
// phase_recovery.js
vm.runInThisContext(fs.readFileSync(path.join(dir, 'phase_recovery.js'), 'utf8'));

// phase_support.js（applyDamageToUnit等）
vm.runInThisContext(fs.readFileSync(path.join(dir, 'phase_support.js'), 'utf8'));

// phase_initiative.js（INIT_CHART, resolveInitiative等）
vm.runInThisContext(fs.readFileSync(path.join(dir, 'phase_initiative.js'), 'utf8'));

// phase_air.js（resetAirSupport等）
vm.runInThisContext(fs.readFileSync(path.join(dir, 'phase_air.js'), 'utf8'));

// phase_movefire.js（executeDirectFire, getMoveCost, executeAssault等）
vm.runInThisContext(fs.readFileSync(path.join(dir, 'phase_movefire.js'), 'utf8'));

// Monkey-patch applyAssaultDefDamage to fix scoping bug (line 2803/2806 in phase_movefire.js)
{
  const _origApplyAssaultDefDamage = applyAssaultDefDamage;
  global.applyAssaultDefDamage = function(r) {
    try {
      return _origApplyAssaultDefDamage(r);
    } catch(e) {
      // The original function has a bug: it references targetHexId/defenderSide/resultStr
      // outside scope. Handle the DD elimination manually.
      const remainingActive = r.activeDef ? r.activeDef.filter(u => u.status === 'ok') : [];
      if (remainingActive.length === 0 && r.defDD && r.defDD.length > 0) {
        r.defDD.forEach(u => {
          if (u.status === 'dd') {
            u.status = 'eliminated';
            addLog('assault', `${u.name}: 防御側消滅によりDD壊滅`);
          }
        });
        if (r.targetHexId && r.defenderSide) {
          checkLeaderOnStackEliminated(r.targetHexId, r.defenderSide);
        }
      }
      return r;
    }
  };
  applyAssaultDefDamage = global.applyAssaultDefDamage;
}

// AI files読み込み
// _headlessScenarioIdが3の場合はS3用AIを読み込む（S2と衝突するconst回避）
if (_headlessScenarioId === 3) {
  vm.runInThisContext(fs.readFileSync(path.join(dir, 'scenario3.js'), 'utf8'));
  vm.runInThisContext(fs.readFileSync(path.join(dir, 'ai_scenario3.js'), 'utf8'));
  vm.runInThisContext(fs.readFileSync(path.join(dir, 'ai_blackboard.js'), 'utf8'));
} else {
  vm.runInThisContext(fs.readFileSync(path.join(dir, 'ai_scenario2.js'), 'utf8'));
  vm.runInThisContext(fs.readFileSync(path.join(dir, 'ai_german_s2.js'), 'utf8'));
  vm.runInThisContext(fs.readFileSync(path.join(dir, 'ai_allied_s2.js'), 'utf8'));
}
vm.runInThisContext(fs.readFileSync(path.join(dir, 'ai_placement.js'), 'utf8'));

// ========== ユニット生成 ==========
function buildUnitsFromScenario(scenario) {
  const defs = [];
  let idx = 0;
  scenario.initialUnits.forEach(u => {
    if (u.type === 'D') {
      const col = parseInt(u.hexId.substring(0,2)) - 1;
      const row = parseInt(u.hexId.substring(2,4)) - 1;
      for (let i = 0; i < u.count; i++) {
        idx++;
        defs.push({
          src: scenario.getUnitImage(u.nation, 'Dummy'),
          col, row, side: u.side, type: 'dummy', status: 'ok',
          name: `ダミー-${u.hexId}-${i}`,
          range: 0, fpAT: 0, fpSoft: 0, def: 0, morale: 0,
          closeAtk: 0, closeDef: 0, move: 0,
          nation: u.nation, unitName: 'Dummy',
        });
      }
      return;
    }
    for (let i = 0; i < u.count; i++) {
      idx++;
      const col = parseInt(u.hexId.substring(0,2)) - 1;
      const row = parseInt(u.hexId.substring(2,4)) - 1;
      defs.push({
        src: scenario.getUnitImage(u.nation, u.unitName),
        col, row, side: u.side, type: u.type, status: 'ok',
        name: `${u.unitName}${u.count > 1 ? '-' + i : ''}`,
        range: u.range || 0, fpAT: u.fpAT || 0, fpSoft: u.fpSoft || 0,
        def: u.def || 0, morale: u.morale || 5,
        closeAtk: u.closeAtk || 0, closeDef: u.closeDef || 0, move: u.move || 0,
        nation: u.nation, unitName: u.unitName,
      });
    }
  });
  return defs;
}

// 援軍を投入
function deployReinforcements(scenario, turn) {
  const reinforcements = scenario.reinforcements.filter(r => r.turn === turn);
  reinforcements.forEach(r => {
    const allNewUnits = [];
    r.units.forEach(u => {
      for (let i = 0; i < u.count; i++) {
        allNewUnits.push({
          src: scenario.getUnitImage(u.nation || (r.side === 'german' ? 'ドイツ軍' : 'イギリス軍'), u.unitName),
          side: r.side, type: u.type, status: 'ok',
          name: `${u.unitName}-R${turn}-${i}`,
          range: u.range || 0, fpAT: u.fpAT || 0, fpSoft: u.fpSoft || 0,
          def: u.def || 0, morale: u.morale || 5,
          closeAtk: u.closeAtk || 0, closeDef: u.closeDef || 0, move: u.move || 0,
          nation: u.nation, unitName: u.unitName,
        });
      }
    });

    const usedEntries = {};
    for (let i = 0; i < allNewUnits.length; i += 4) {
      const batch = allNewUnits.slice(i, i + 4);
      let targetDest = null;
      if (typeof _aiAssignedTargets !== 'undefined') {
        const firstName = batch[0].name || '';
        let stackKey = null;
        if (firstName.match(/^M4-R\d+-[0-3]$/)) stackKey = 'M4_0';
        else if (firstName.match(/^M4-R\d+-[4-7]$/)) stackKey = 'M4_1';
        else if (firstName.startsWith('A27-R')) stackKey = 'A27_0';
        else if (firstName.startsWith('A22-R') || firstName.startsWith('Infantry-R4-0') || firstName.startsWith('Infantry-R4-1')) {
          stackKey = 'R4_0';
        } else if (firstName.startsWith('Infantry-R4-2') || firstName.startsWith('Infantry-R4-3')) {
          stackKey = 'R4_1';
        }
        if (stackKey && _aiAssignedTargets[stackKey]) {
          targetDest = fromHexId(_aiAssignedTargets[stackKey]);
        }
      }
      let targetHexId = null;
      let bestDist = Infinity;
      for (const ehId of r.entryHexes) {
        const existing = testUnits.filter(su =>
          su.hexId === ehId && su.status !== 'eliminated' &&
          !STACK_EXEMPT_TYPES.includes(su.type)
        ).length + (usedEntries[ehId] || 0);
        if (existing + batch.length > 4) continue;
        if (targetDest) {
          const ePos = fromHexId(ehId);
          const dist = hexDistance(ePos.col, ePos.row, targetDest.col, targetDest.row);
          if (dist < bestDist) { bestDist = dist; targetHexId = ehId; }
        } else {
          targetHexId = ehId;
          break;
        }
      }
      if (!targetHexId) targetHexId = r.entryHexes[0];
      usedEntries[targetHexId] = (usedEntries[targetHexId] || 0) + batch.length;

      const pos = fromHexId(targetHexId);
      const center = getHexCenter(pos.col, pos.row);
      batch.forEach(u => {
        u.col = pos.col;
        u.row = pos.row;
        u.x = center.x;
        u.y = center.y;
        u.hexId = targetHexId;
        u.reinforcement = { deployed: true, entryHexes: r.entryHexes };
        u.moveComplete = true;
        u.id = u.name + '_' + testUnits.length;
        testUnits.push(u);
      });
    }
    addLog('turn', `援軍到着: ${r.side === 'german' ? 'ドイツ軍' : '連合軍'} (${r.units.map(u => u.unitName + 'x' + u.count).join(', ')})`);
  });
}

// ========== ゲーム初期化 ==========
function initGame() {
  if (_headlessScenarioId === 3 && typeof SCENARIO_3 !== 'undefined') {
    SCENARIO = SCENARIO_3;
  } else {
    SCENARIO = SCENARIO_2;
  }
  global.SCENARIO = SCENARIO;

  G = {
    turn: 1,
    maxTurn: SCENARIO.maxTurn,
    phase: 0,
    markerPos: SCENARIO.initiative.start,
    initiative: null,
    markerShift: SCENARIO.initiative.shift,
    diceRolled: false,
    visionRange: SCENARIO.visionRange,
    visionPoints: SCENARIO.visionRange,
    playerSide: 'watch',
    ammoCheck: SCENARIO.ammoCheck,
    breakthroughCount: 0,
    gameMode: 'aivai',
  };
  global.G = G;

  // ユニット生成
  const testUnitDefs = buildUnitsFromScenario(SCENARIO);
  testUnits = testUnitDefs.map((d, i) => {
    const center = getHexCenter(d.col, d.row);
    const hexId = (d.col >= 0 && d.row >= 0) ? toHexId(d.col, d.row) : 'reinforcement';
    return { ...d, x: center.x, y: center.y, hexId, id: d.name + '_' + i };
  });
  units = testUnits;
  global.testUnits = testUnits;
  global.units = units;

  // 初回援軍（ターン1）
  deployReinforcements(SCENARIO, 1);

  // directFireState初期化
  if (typeof resetDirectFireState === 'function') {
    G.initiative = SCENARIO.initiative.side;
    resetDirectFireState();
    G.initiative = null;
  }

  // 支援射撃初期化
  if (typeof initOffBoardArtillery === 'function') {
    initOffBoardArtillery();
  }
  if (typeof resetSupportState === 'function') {
    resetSupportState();
  }

  // AI目標割り当て
  if (typeof assignAmbushTargets === 'function') {
    assignAmbushTargets();
  }

  // recoveryResults初期化
  if (typeof recoveryResults !== 'undefined') {
    Object.keys(recoveryResults).forEach(k => delete recoveryResults[k]);
  }

  _allLogs.length = 0;
  addLog('turn', `===== ゲーム開始: ${SCENARIO.name} =====`);
}

// ========== イニシアチブ ==========
function rollInitiativeSync() {
  if (G.turn === 1 && SCENARIO.initiative.side) {
    G.initiative = SCENARIO.initiative.side;
    G.diceRolled = true;
    addLog('init', `第1ターン: ${G.initiative === 'german' ? 'ドイツ軍' : '連合軍'}がイニシアチブ（シナリオ指定）`);
    return;
  }
  const dieRoll = Math.floor(Math.random() * 10);
  const col = G.markerPos;
  const winner = INIT_CHART[dieRoll][col];
  G.initiative = winner === 'g' ? 'german' : 'allied';
  G.diceRolled = true;

  if (G.initiative === 'german') {
    G.markerPos = Math.max(0, G.markerPos - G.markerShift);
  } else {
    G.markerPos = Math.min(10, G.markerPos + G.markerShift);
  }

  // 天候変化
  const prevVision = G.visionRange;
  let weatherShift = 0;
  if (dieRoll === 0) weatherShift = -2;
  else if (dieRoll <= 2) weatherShift = -1;
  else if (dieRoll <= 6) weatherShift = 0;
  else if (dieRoll <= 8) weatherShift = +1;
  else weatherShift = +2;
  G.visionRange = Math.max(1, prevVision + weatherShift);
  G.visionPoints = G.visionRange;

  addLog('init', `ダイス: ${dieRoll} → ${G.initiative === 'german' ? 'ドイツ軍' : '連合軍'}がイニシアチブ獲得 (M${G.markerPos}) 視認${prevVision}→${G.visionRange}`);
}

// ========== AI回復（同期版） ==========
function aiAutoRecoverySync() {
  // 回復判定前にプロパティ計算
  testUnits.forEach(u => {
    if (u.status === 'eliminated' || u.type === 'dummy' || u.type === 'leader') return;
    const enemySide = u.side === 'german' ? 'allied' : 'german';
    u.adjacentEnemy = testUnits.some(e =>
      e.side === enemySide && e.status !== 'eliminated' && e.type !== 'dummy' &&
      hexDistance(e.col, e.row, u.col, u.row) === 1
    );
    u.inEnemyRange = testUnits.some(e =>
      e.side === enemySide && e.status !== 'eliminated' && e.type !== 'dummy' &&
      hexDistance(e.col, e.row, u.col, u.row) <= (e.range || 1) &&
      hasLOS(e.col, e.row, u.col, u.row)
    );
    const terrain = getHexTerrain(u.hexId);
    u.inCover = terrain === 'f' || terrain === 'w' || terrain === 't' || terrain === 'c';
  });

  testUnits.forEach(u => {
    if (u.status === 'd' || u.status === 'dd') {
      const enemySide = u.side === 'german' ? 'allied' : 'german';
      const adjacentEnemy = testUnits.some(e =>
        e.side === enemySide && e.status !== 'eliminated' && e.type !== 'dummy' &&
        hexDistance(e.col, e.row, u.col, u.row) === 1
      );
      if (adjacentEnemy) return;

      const terrain = getHexTerrain(u.hexId);
      const inCover = terrain === 'f' || terrain === 'w' || terrain === 't' || terrain === 'c';
      if (!inCover) {
        const inEnemyLOS = testUnits.some(e =>
          e.side === enemySide && e.status !== 'eliminated' && e.type !== 'dummy' &&
          hexDistance(e.col, e.row, u.col, u.row) <= (e.range || 1) &&
          hasLOS(e.col, e.row, u.col, u.row)
        );
        if (inEnemyLOS) return;
      }

      const roll = Math.floor(Math.random() * 10);
      // 有効モラル計算（遮蔽+1、指揮官+1）
      let effectiveMorale = u.morale || 5;
      if (!u.inEnemyRange && u.inCover) effectiveMorale += 1;
      if (hasLeaderMoraleBonus(u)) effectiveMorale += 1;

      if (roll === 0) {
        // 悪化判定
        const oldStatus = u.status;
        if (u.status === 'd') {
          u.status = 'dd';
          addLog('recovery', `${u.name} 悪化: ${oldStatus} → dd (ダイス${roll})`);
        } else if (u.status === 'dd') {
          u.status = 'eliminated';
          addLog('recovery', `${u.name} 壊滅: ${oldStatus} → eliminated (ダイス${roll})`);
        }
      } else if (roll <= effectiveMorale) {
        const oldStatus = u.status;
        u.status = u.status === 'dd' ? 'd' : 'ok';
        addLog('recovery', `${u.name} 回復: ${oldStatus} → ${u.status} (ダイス${roll}, ML${effectiveMorale})`);
      }
    }
  });
}

// ========== 射撃ヘルパー ==========
function aiFireAt(shooterNames, totalFP, target, isSurprise) {
  if (totalFP <= 0 || target.status === 'eliminated') return;
  const roll = Math.floor(Math.random() * 10);
  const fpIdx = getFPColumnIndex(totalFP);
  const dieKey = String(roll);
  const dmg = FIRE_COMBAT_TABLE[dieKey] ? FIRE_COMBAT_TABLE[dieKey][fpIdx] : 0;
  const def = target.def || 5;
  const prefix = isSurprise ? 'サプライズ: ' : '';

  if (dmg !== 'E' && dmg !== 99 && (typeof dmg === 'number' && dmg < def)) {
    addLog('fire', `${prefix}${shooterNames} (fp${totalFP}) → ${target.name}: 効果なし (ダイス${roll}, 損害${dmg}, 防御${def})`);
    return;
  }
  if (dmg === 'E' || dmg === 99 || (typeof dmg === 'number' && dmg >= def + 3)) {
    target.status = 'eliminated';
    addLog('fire', `${prefix}${shooterNames} (fp${totalFP}) → ${target.name}: 壊滅 (ダイス${roll}, 損害${dmg})`);
  } else if (typeof dmg === 'number' && dmg >= def + 2) {
    target.status = target.status === 'd' ? 'eliminated' : 'dd';
    addLog('fire', `${prefix}${shooterNames} (fp${totalFP}) → ${target.name}: DD (ダイス${roll})`);
  } else {
    target.status = target.status === 'dd' ? 'eliminated' : (target.status === 'd' ? 'dd' : 'd');
    addLog('fire', `${prefix}${shooterNames} (fp${totalFP}) → ${target.name}: D (ダイス${roll})`);
  }
}

function calcDamageProb(fp, def, terrainMod) {
  if (fp <= 0) return 0;
  const colIdx = getFPColumnIndex(fp);
  const mod = terrainMod || 0;
  let hits = 0;
  for (let d = 0; d <= 9; d++) {
    const modifiedRoll = d + mod;
    const row = FIRE_COMBAT_TABLE[String(modifiedRoll)];
    if (!row) continue;
    const dmg = row[colIdx];
    if (dmg === 99 || (typeof dmg === 'number' && dmg >= def)) hits++;
  }
  return hits / 10;
}

// ========== 移動・射撃（同期版） ==========
function aiAutoMoveFireSync() {
  const atkSide = G.initiative;
  const defSide = atkSide === 'german' ? 'allied' : 'german';

  // directFireState初期化
  if (typeof resetDirectFireState === 'function') resetDirectFireState();

  // ===== 先攻側をスタック単位でまとめる =====
  const hexUnitsMap = {};
  testUnits.filter(u => u.side === atkSide && u.status !== 'eliminated' && u.type !== 'dummy')
    .forEach(u => {
      if (u.type === 'AT' || u.type === 'A') return;
      if (u.col < 0 || u.col >= MAP_CONFIG.cols) return;
      if (!hexUnitsMap[u.hexId]) hexUnitsMap[u.hexId] = [];
      hexUnitsMap[u.hexId].push(u);
    });
  const atkStackList = [];
  for (const [hexId, uList] of Object.entries(hexUnitsMap)) {
    for (let i = 0; i < uList.length; i += 4) {
      atkStackList.push(uList.slice(i, i + 4));
    }
  }

  // ===== ドイツ先攻: 先制射撃（移動前に射程内の敵を混乱させる） =====
  if (atkSide === 'german') {
    const preFireHexes = {};
    testUnits.filter(u => u.side === 'german' && u.status !== 'eliminated' && !u.firedThisTurn && u.type !== 'dummy')
      .forEach(u => {
        if (!preFireHexes[u.hexId]) preFireHexes[u.hexId] = [];
        preFireHexes[u.hexId].push(u);
      });
    const preFireTargets = testUnits.filter(u => u.side === 'allied' && u.status !== 'eliminated' && u.type !== 'dummy');

    for (const [hexId, shooters] of Object.entries(preFireHexes)) {
      const maxRange = Math.max(...shooters.map(s => s.range || 1));
      const effectiveRange = Math.min(maxRange, G.visionRange || 12);
      const targets = preFireTargets.filter(t => {
        if (t.status !== 'ok') return false;
        if (t.type === 'I') return false;
        const dist = hexDistance(shooters[0].col, shooters[0].row, t.col, t.row);
        if (dist <= 0 || dist > effectiveRange) return false;
        return hasLOS(shooters[0].col, shooters[0].row, t.col, t.row);
      });
      if (targets.length === 0) continue;

      targets.sort((a, b) => (a.def || 5) - (b.def || 5));
      const target = targets[0];
      const isArmored = target.type === 'T' || target.type === 'AC';
      let totalFP = 0;
      const firingNames = [];
      shooters.forEach(s => {
        if (s.firedThisTurn) return;
        const dist = hexDistance(s.col, s.row, target.col, target.row);
        if (dist > 0 && dist <= (s.range || 1) && hasLOS(s.col, s.row, target.col, target.row)) {
          totalFP += isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
          firingNames.push(s.name);
          s.firedThisTurn = true;
        }
      });
      if (totalFP <= 0) continue;
      onUnitAction(shooters[0], shooters);
      const nameStr = firingNames.length > 2 ? firingNames[0] + '他' + (firingNames.length - 1) : firingNames.join('+');
      aiFireAt(nameStr, totalFP, target, false);
      addLog('fire', `先制射撃: ${nameStr} (fp${totalFP}) → ${target.name}`);
    }
  }

  // ===== スタック単位で移動（強いスタックから） =====
  atkStackList.sort((a, b) => {
    const fpA = a.reduce((s, u) => s + (u.status !== 'eliminated' ? (u.fpAT || 0) + (u.fpSoft || 0) : 0), 0);
    const fpB = b.reduce((s, u) => s + (u.status !== 'eliminated' ? (u.fpAT || 0) + (u.fpSoft || 0) : 0), 0);
    return fpB - fpA;
  });
  if (atkSide === 'german') {
    for (const stack of atkStackList) {
      let aliveStack = stack.filter(u => u.status !== 'eliminated');
      if (aliveStack.length === 0) continue;

      // === 1ユニットスタック: 偵察以外は味方合流を優先 ===
      if (aliveStack.length === 1) {
        const u0 = aliveStack[0];
        const isRecon = u0.unitName && u0.unitName.startsWith('Sd Kfz');
        if (!isRecon && u0.status === 'ok') {
          const soloMp = u0.move != null ? u0.move : 1;
          const soloPath = geAI_findBestPath(aliveStack, soloMp);
          if (!soloPath || soloPath.length === 0) continue;
          onUnitAction(u0, aliveStack);
          u0.moveComplete = true;
          const prevHexId = u0.hexId;
          let soloMpLeft = soloMp;
          for (const step of soloPath) {
            const mc = getMoveCost(u0, u0.col, u0.row, step.col, step.row, 'combat');
            if (mc.cost === Infinity || mc.cost > soloMpLeft) break;
            soloMpLeft -= mc.cost;
            u0.col = step.col; u0.row = step.row;
            const center = getHexCenter(step.col, step.row);
            u0.x = center.x; u0.y = center.y;
            u0.hexId = toHexId(step.col, step.row);
          }
          if (prevHexId !== u0.hexId) {
            cleanupOrphanDummies(prevHexId, 'german');
            checkDummyVisibility(u0);
            addLog('move', `${u0.name} 味方方向へ移動 → ${u0.hexId}`);
          }
          continue;
        }
      }

      const minMove = Math.min(...aliveStack.map(u => u.move != null ? u.move : 1));
      if (minMove <= 0) continue;
      let mp = minMove;
      let hasMoved = false;

      const aiPath = geAI_findBestPath(aliveStack, mp);
      let pathIdx = 0;

      while (mp > 0) {
        let best = null;
        if (aiPath && pathIdx < aiPath.length) {
          best = aiPath[pathIdx];
          pathIdx++;
        }
        if (!best) break;

        const hexId = toHexId(best.col, best.row);
        const mc = getMoveCost(aliveStack[0], aliveStack[0].col, aliveStack[0].row, best.col, best.row, 'combat');
        if (mc.cost === Infinity) break;
        const cost = mc.cost;

        // スタック制限チェック
        const existingAtDest = testUnits.filter(su =>
          su.hexId === hexId && su.status !== 'eliminated' &&
          !STACK_EXEMPT_TYPES.includes(su.type) && !aliveStack.includes(su)
        ).length;
        const movingCount = aliveStack.filter(u => u.status !== 'eliminated').length;
        if (existingAtDest + movingCount > 4) break;

        mp -= cost;

        if (!hasMoved) {
          onUnitAction(aliveStack[0], aliveStack);
          aliveStack.forEach(u => { u.moveComplete = true; });
          hasMoved = true;
        }

        const prevHexId = aliveStack[0].hexId;
        aliveStack.forEach(u => {
          if (u.status === 'eliminated') return;
          u.col = best.col; u.row = best.row;
          const center = getHexCenter(u.col, u.row);
          u.x = center.x; u.y = center.y;
          u.hexId = hexId;
        });

        if (prevHexId !== hexId) {
          cleanupOrphanDummies(prevHexId, aliveStack[0].side);
        }
        aliveStack.forEach(u => { if (u.status !== 'eliminated') checkDummyVisibility(u); });

        // ストップ射撃
        const livingStack = aliveStack.filter(u => u.status !== 'eliminated');
        if (livingStack.length === 0) break;

        const stopShooters = testUnits.filter(e =>
          e.side !== atkSide && e.status !== 'eliminated' &&
          e.type !== 'dummy' && (e.fpAT > 0 || e.fpSoft > 0)
        ).filter(e => {
          const dist = hexDistance(e.col, e.row, best.col, best.row);
          if (dist <= 0 || dist > (e.range || 1)) return false;
          return hasLOS(e.col, e.row, best.col, best.row);
        });

        if (stopShooters.length > 0) {
          const sortedTargets = [...livingStack].sort((a, b) => (a.def || 5) - (b.def || 5));
          const defSide = stopShooters[0].side;
          const policy = (defSide === 'german' ? global._qWeightsGerman : global._qWeightsAllied);
          const sfPolicy = policy && policy.stopFirePolicy ? policy.stopFirePolicy : 'spread';

          if (sfPolicy === 'concentrate') {
            // 合算：全射手で1目標に集中
            const target = sortedTargets.find(t => t.status !== 'eliminated');
            if (target) {
              const shootersInRange = stopShooters.filter(e => e.status !== 'eliminated');
              if (shootersInRange.length > 0) executeDirectFire(shootersInRange, target);
            }
          } else if (sfPolicy === 'split') {
            // 2+2分割：半数ずつ別目標
            const available = stopShooters.filter(e => e.status !== 'eliminated');
            const half = Math.ceil(available.length / 2);
            const group1 = available.slice(0, half);
            const group2 = available.slice(half);
            const target1 = sortedTargets.find(t => t.status !== 'eliminated');
            if (target1 && group1.length > 0) executeDirectFire(group1, target1);
            const target2 = sortedTargets.find(t => t.status !== 'eliminated' && t !== target1);
            if (target2 && group2.length > 0) executeDirectFire(group2, target2);
            else if (target1 && group2.length > 0 && target1.status !== 'eliminated') executeDirectFire(group2, target1);
          } else {
            // spread：個別射撃（従来通り）
            const firedThisStep = new Set();
            for (const e of stopShooters) {
              if (e.status === 'eliminated') continue;
              if (firedThisStep.has(e.id || e.name)) continue;
              const target = sortedTargets.find(t => t.status !== 'eliminated');
              if (target) {
                executeDirectFire([e], target);
                firedThisStep.add(e.id || e.name);
              }
            }
          }
          // 反撃
          const counterShooters = livingStack.filter(u => u.status !== 'eliminated');
          if (counterShooters.length > 0) {
            const counterTargets = [...stopShooters].filter(e => e.status !== 'eliminated')
              .sort((a, b) => (a.def || 5) - (b.def || 5));
            if (counterTargets.length > 0) {
              const target = counterTargets[0];
              const inRange = counterShooters.filter(u => {
                const dist = hexDistance(u.col, u.row, target.col, target.row);
                return dist > 0 && dist <= (u.range || 1) && hasLOS(u.col, u.row, target.col, target.row);
              });
              if (inRange.length > 0) {
                executeDirectFire(inRange, target);
                inRange.forEach(u => { u._counterFired = true; });
              }
            }
          }
        }

        // D/DDユニット離脱 → 残り移動力全部使ってLOS外+遮蔽へ退避
        const damaged = aliveStack.filter(u => u.status === 'd' || u.status === 'dd');
        if (damaged.length > 0) {
          aliveStack = aliveStack.filter(u => u.status === 'ok');
          damaged.forEach(u => {
            addLog('move', `${u.name} (${u.status.toUpperCase()}) スタックから離脱`);
          });
          if (mp > 0) {
            for (const ru of damaged) {
              if (ru.status === 'eliminated') continue;
              const retreatPath = geAI_findBestPath([ru], mp);
              if (retreatPath && retreatPath.length > 0) {
                const dest = retreatPath[retreatPath.length - 1];
                const rHexId = toHexId(dest.col, dest.row);
                ru.col = dest.col; ru.row = dest.row;
                const c = getHexCenter(dest.col, dest.row);
                ru.x = c.x; ru.y = c.y;
                ru.hexId = rHexId;
                addLog('move', `${ru.name} 退避移動 → ${rHexId}`);
              }
            }
          }
        }
        if (aliveStack.every(u => u.status === 'eliminated') || aliveStack.length === 0) break;
      }

      // 突破判定
      aliveStack.forEach(u => {
        if (u.side === 'german' && u.status !== 'eliminated' && u.col <= 1 && u.row >= 1 && u.row <= 9) {
          u.status = 'eliminated';
          G.breakthroughCount++;
          addLog('breakthrough', `★ ${u.name} 突破!`);
        }
      });
    }
  }

  // イギリス先攻時: ukAI_moveAllStacks（同期版）
  if (atkSide === 'allied') {
    ukAI_moveAllStacksSync(true);
  }

  // スタック超過チェック
  const hexGroups = {};
  testUnits.forEach(u => {
    if (u.status === 'eliminated' || STACK_EXEMPT_TYPES.includes(u.type)) return;
    if (u.side !== atkSide) return;
    if (!hexGroups[u.hexId]) hexGroups[u.hexId] = [];
    hexGroups[u.hexId].push(u);
  });
  for (const [hid, uList] of Object.entries(hexGroups)) {
    const totalInHex = testUnits.filter(su =>
      su.hexId === hid && su.status !== 'eliminated' && !STACK_EXEMPT_TYPES.includes(su.type)
    ).length;
    if (totalInHex > 4) {
      uList.forEach(u => {
        if (u.status !== 'dd' && u.status !== 'eliminated') {
          addLog('stack', `スタック超過(${hid}): ${u.name} → DD`);
          u.status = 'dd';
        }
      });
    }
  }

  // イギリス先攻時: ukAI_firePhase（同期版）
  if (atkSide === 'allied') {
    ukAI_firePhaseSync();
  }

  // ===== 先攻側射撃（反撃済みユニットは除外） =====
  const atkShooterHexes = {};
  testUnits.filter(u => u.side === atkSide && u.status !== 'eliminated' && !u.firedThisTurn && !u._counterFired && u.type !== 'dummy')
    .forEach(u => {
      if (!atkShooterHexes[u.hexId]) atkShooterHexes[u.hexId] = [];
      atkShooterHexes[u.hexId].push(u);
    });

  const realTargets = testUnits.filter(u => u.side === defSide && u.status !== 'eliminated' && u.type !== 'dummy');
  const _atkFiredAt = new Set();

  for (const [hexId, shooters] of Object.entries(atkShooterHexes)) {
    if (shooters.length === 0) continue;
    const maxRange = Math.max(...shooters.map(s => s.range || 1));
    const effectiveRange = Math.min(maxRange, G.visionRange || 12);
    const inRangeTargets = realTargets.filter(t => {
      if (t.status === 'eliminated') return false;
      const dist = hexDistance(shooters[0].col, shooters[0].row, t.col, t.row);
      if (dist <= 0 || dist > effectiveRange) return false;
      return hasLOS(shooters[0].col, shooters[0].row, t.col, t.row);
    });
    if (inRangeTargets.length === 0) continue;

    onUnitAction(shooters[0], shooters);
    const allInHex = testUnits.filter(u => u.hexId === hexId && u.status !== 'eliminated');
    const allHaveDummy = allInHex.every(u => u.type === 'dummy' || u.hasDummy);
    const isSurprise = allHaveDummy && allInHex.some(u => u.type === 'dummy');
    const shotCount = isSurprise ? 2 : 1;

    // 個別射撃判定
    const availableShooters = shooters.filter(s => !s.firedThisTurn);
    const okTargets = inRangeTargets.filter(t => t.status === 'ok' && !_atkFiredAt.has(t.id || t.name));
    let useIndividualFire = false;
    if (availableShooters.length >= 2 && okTargets.length >= 2) {
      let canDCount = 0;
      for (const s of availableShooters) {
        const sampleTarget = okTargets[0];
        const isArmored = sampleTarget.type === 'T' || sampleTarget.type === 'AC';
        const fp = isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
        const dist = hexDistance(s.col, s.row, sampleTarget.col, sampleTarget.row);
        const tMod = getTerrainFireMod(sampleTarget.hexId);
        const rangeMod = (dist === (s.range || 1)) ? -1 : 0;
        if (dist > 0 && dist <= (s.range || 1) && calcDamageProb(fp, sampleTarget.def || 5, tMod + rangeMod) >= 0.3) {
          canDCount++;
        }
      }
      if (canDCount >= 2) useIndividualFire = true;
    }

    if (useIndividualFire) {
      const targetPool = [...okTargets];
      for (const s of availableShooters) {
        if (s.firedThisTurn) continue;
        if (targetPool.length === 0) break;
        let bestT = null, bestScore = -Infinity;
        for (const t of targetPool) {
          if (t.status === 'eliminated') continue;
          const dist = hexDistance(s.col, s.row, t.col, t.row);
          const sEffRange = Math.min(s.range || 1, G.visionRange || 12);
          if (dist <= 0 || dist > sEffRange) continue;
          if (!hasLOS(s.col, s.row, t.col, t.row)) continue;
          const isArmored = t.type === 'T' || t.type === 'AC';
          const fp = isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
          const prob = calcDamageProb(fp, t.def || 0);
          let score = prob * 100;
          if (!_atkFiredAt.has(t.id || t.name)) score += 50;
          if (t.status === 'ok') score += 30;
          else if (t.status === 'd' || t.status === 'dd') score -= 40;
          // ドイツ軍: 敵の射程外から撃てる → 反撃されない、優先
          if (atkSide === 'german') {
            const tRange = t.range || 0;
            const tDist = hexDistance(s.col, s.row, t.col, t.row);
            if (tRange < tDist) score += 60;
          }
          if (score > bestScore) { bestScore = score; bestT = t; }
        }
        if (!bestT) continue;
        const isArmored = bestT.type === 'T' || bestT.type === 'AC';
        const fp = isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
        if (fp <= 0) continue;
        s.firedThisTurn = true;
        _atkFiredAt.add(bestT.id || bestT.name);
        const idx = targetPool.indexOf(bestT);
        if (idx >= 0) targetPool.splice(idx, 1);
        for (let shot = 0; shot < shotCount; shot++) {
          if (bestT.status === 'eliminated') break;
          aiFireAt(s.name, fp, bestT, isSurprise);
        }
      }
    } else {
      let bestTarget = null, bestScore = -Infinity;
      inRangeTargets.forEach(t => {
        if (t.status === 'eliminated') return;
        const tid = t.id || t.name;
        let score = 0;
        if (!_atkFiredAt.has(tid)) score += 100;
        if (t.status === 'ok') score += 50;
        else if (t.status === 'd' || t.status === 'dd') score -= 40;
        score -= (t.def || 0) * 5;
        const dist = hexDistance(shooters[0].col, shooters[0].row, t.col, t.row);
        score -= dist * 2;
        // ドイツ軍: 敵の射程外から撃てる → 反撃されない、優先
        if (atkSide === 'german') {
          const tRange = t.range || 0;
          if (tRange < dist) score += 60;
        }
        if (score > bestScore) { bestScore = score; bestTarget = t; }
      });
      if (!bestTarget) continue;
      _atkFiredAt.add(bestTarget.id || bestTarget.name);

      const isArmored = bestTarget.type === 'T' || bestTarget.type === 'AC';
      let totalFP = 0;
      const firingNames = [];
      shooters.forEach(s => {
        const dist = hexDistance(s.col, s.row, bestTarget.col, bestTarget.row);
        if (dist > 0 && dist <= (s.range || 1)) {
          totalFP += isArmored ? (s.fpAT || 0) : (s.fpSoft || 0);
          firingNames.push(s.name);
          s.firedThisTurn = true;
        }
      });
      if (totalFP <= 0) continue;
      const nameStr = firingNames.length > 2 ? firingNames[0] + '他' + (firingNames.length - 1) : firingNames.join('+');
      for (let shot = 0; shot < shotCount; shot++) {
        if (bestTarget.status === 'eliminated') break;
        aiFireAt(nameStr, totalFP, bestTarget, isSurprise);
      }
    }

    if (isSurprise) {
      allInHex.forEach(u => { u.hasDummy = false; });
      const dummies = testUnits.filter(u => u.hexId === hexId && u.type === 'dummy');
      dummies.forEach(d => { d.status = 'eliminated'; });
    }
  }

  // 後攻側はストップ射撃のみ（移動中に処理済み）— 別途の射撃フェイズなし
}

// ========== イギリスAI移動（同期版） ==========
function ukAI_moveAllStacksSync(canFire) {
  const alliedUnits = testUnits.filter(u =>
    u.side === 'allied' && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'fortification' && u.type !== 'ip' &&
    u.col >= 0 && u.col < MAP_CONFIG.cols
  );
  const hexGroupsUK = {};
  alliedUnits.forEach(u => {
    if (!hexGroupsUK[u.hexId]) hexGroupsUK[u.hexId] = [];
    hexGroupsUK[u.hexId].push(u);
  });
  const stacks = [];
  for (const [hid, uList] of Object.entries(hexGroupsUK)) {
    for (let i = 0; i < uList.length; i += 4) {
      stacks.push(uList.slice(i, i + 4));
    }
  }
  stacks.sort((a, b) => {
    const aD = a.some(u => u.status === 'd' || u.status === 'dd');
    const bD = b.some(u => u.status === 'd' || u.status === 'dd');
    if (aD && !bD) return -1;
    if (!aD && bD) return 1;
    return 0;
  });

  for (const stack of stacks) {
    let movableStack = stack.filter(u => u.status !== 'eliminated' && u.status !== 'dd');
    if (movableStack.length === 0) continue;
    const minMove = Math.min(...movableStack.map(u => u.move || 0));
    if (minMove <= 0) continue;
    let mp = minMove;
    let hasMoved = false;

    while (mp > 0) {
      const best = ukAI_getBestNeighbor(movableStack, mp);
      if (!best) break;
      const hexId = toHexId(best.col, best.row);
      const mc = getMoveCost(movableStack[0], movableStack[0].col, movableStack[0].row, best.col, best.row, 'combat');
      if (mc.cost === Infinity) break;
      mp -= mc.cost;
      if (!hasMoved) {
        onUnitAction(movableStack[0], movableStack);
        movableStack.forEach(u => { u.moveComplete = true; });
        hasMoved = true;
      }
      const prevHexId = movableStack[0].hexId;
      movableStack.forEach(u => {
        if (u.status === 'eliminated') return;
        u.col = best.col; u.row = best.row;
        const center = getHexCenter(u.col, u.row);
        u.x = center.x; u.y = center.y;
        u.hexId = hexId;
      });
      if (prevHexId !== hexId) {
        cleanupOrphanDummies(prevHexId, 'allied');
      }
      movableStack.forEach(u => { if (u.status !== 'eliminated') checkDummyVisibility(u); });

      const livingStack = movableStack.filter(u => u.status !== 'eliminated');
      if (livingStack.length === 0) break;

      // ストップ射撃
      const stopShooters = testUnits.filter(e =>
        e.side === 'german' && e.status !== 'eliminated' &&
        e.type !== 'dummy' && (e.fpAT > 0 || e.fpSoft > 0)
      ).filter(e => {
        const dist = hexDistance(e.col, e.row, best.col, best.row);
        if (dist <= 0 || dist > (e.range || 1)) return false;
        return hasLOS(e.col, e.row, best.col, best.row);
      });

      if (stopShooters.length > 0) {
        const sortedTargets = [...livingStack].sort((a, b) => (a.def || 5) - (b.def || 5));
        stopShooters.forEach(e => {
          if (e.status === 'eliminated') return;
          const target = sortedTargets.find(t => t.status !== 'eliminated');
          if (target) {
            const isArmored = target.type === 'T' || target.type === 'AC';
            const fp = isArmored ? (e.fpAT || 0) : (e.fpSoft || 0);
            if (fp > 0) {
              const roll = Math.floor(Math.random() * 10);
              const fpIdx = getFPColumnIndex(fp);
              const dmg = FIRE_COMBAT_TABLE[String(roll)] ? FIRE_COMBAT_TABLE[String(roll)][fpIdx] : 0;
              const def = target.def || 5;
              if (dmg === 99 || (typeof dmg === 'number' && dmg >= def + 3)) {
                target.status = 'eliminated';
                addLog('stop', `ストップ射撃: ${e.name} → ${target.name}: 壊滅`);
              } else if (typeof dmg === 'number' && dmg >= def + 2) {
                target.status = target.status === 'd' ? 'eliminated' : 'dd';
                addLog('stop', `ストップ射撃: ${e.name} → ${target.name}: DD`);
              } else if (typeof dmg === 'number' && dmg >= def) {
                target.status = target.status === 'dd' ? 'eliminated' : (target.status === 'd' ? 'dd' : 'd');
                addLog('stop', `ストップ射撃: ${e.name} → ${target.name}: D`);
              }
            }
          }
        });

        // 反撃
        const counterShooters = livingStack.filter(u => u.status !== 'eliminated');
        if (counterShooters.length > 0 && canFire) {
          const counterTargets = [...stopShooters].filter(e => e.status !== 'eliminated')
            .sort((a, b) => (a.def || 5) - (b.def || 5));
          if (counterTargets.length > 0) {
            const target = counterTargets[0];
            const isArmored = target.type === 'T' || target.type === 'AC';
            let totalFP = 0;
            counterShooters.forEach(u => {
              const dist = hexDistance(u.col, u.row, target.col, target.row);
              if (dist > 0 && dist <= (u.range || 1) && hasLOS(u.col, u.row, target.col, target.row)) {
                totalFP += isArmored ? (u.fpAT || 0) : (u.fpSoft || 0);
              }
            });
            if (totalFP > 0) {
              const roll = Math.floor(Math.random() * 10);
              const fpIdx = getFPColumnIndex(totalFP);
              const dmg = FIRE_COMBAT_TABLE[String(roll)] ? FIRE_COMBAT_TABLE[String(roll)][fpIdx] : 0;
              const def = target.def || 5;
              if (dmg === 99 || (typeof dmg === 'number' && dmg >= def + 3)) {
                target.status = 'eliminated';
              } else if (typeof dmg === 'number' && dmg >= def + 2) {
                target.status = target.status === 'd' ? 'eliminated' : 'dd';
              } else if (typeof dmg === 'number' && dmg >= def) {
                target.status = target.status === 'dd' ? 'eliminated' : (target.status === 'd' ? 'dd' : 'd');
              }
              counterShooters.forEach(u => { u._counterFired = true; });
            }
          }
        }

        const damaged = movableStack.filter(u => u.status === 'd' || u.status === 'dd');
        if (damaged.length > 0) {
          movableStack = movableStack.filter(u => u.status === 'ok');
        }
        if (movableStack.every(u => u.status === 'eliminated') || movableStack.length === 0) break;
      }
    }
  }
}

// ========== イギリスAI射撃（同期版） ==========
function ukAI_firePhaseSync() {
  const shooterHexes = {};
  testUnits.filter(u =>
    u.side === 'allied' && u.status !== 'eliminated' &&
    !u.firedThisTurn && !u._counterFired && u.type !== 'dummy' && u.type !== 'leader'
  ).forEach(u => {
    if (!shooterHexes[u.hexId]) shooterHexes[u.hexId] = [];
    shooterHexes[u.hexId].push(u);
  });

  for (const [hexId, shooters] of Object.entries(shooterHexes)) {
    if (shooters.length === 0) continue;
    if (typeof ukAI_assignFireTargets !== 'function') continue;
    const assignments = ukAI_assignFireTargets(hexId, shooters);
    if (assignments.length === 0) continue;
    onUnitAction(shooters[0], shooters);
    for (const { shooters: firingUnits, target, totalFP } of assignments) {
      if (target.status === 'eliminated') continue;
      const nameStr = firingUnits.length > 2
        ? firingUnits[0].name + '他' + (firingUnits.length - 1)
        : firingUnits.map(u => u.name).join('+');
      const roll = Math.floor(Math.random() * 10);
      const fpIdx = getFPColumnIndex(totalFP);
      const dmg = FIRE_COMBAT_TABLE[String(roll)] ? FIRE_COMBAT_TABLE[String(roll)][fpIdx] : 0;
      const def = target.def || 5;
      if (dmg === 99 || (typeof dmg === 'number' && dmg >= def + 3)) {
        target.status = 'eliminated';
        addLog('fire', `射撃: ${nameStr} (fp${totalFP}) → ${target.name}: 壊滅`);
      } else if (typeof dmg === 'number' && dmg >= def + 2) {
        target.status = target.status === 'd' ? 'eliminated' : 'dd';
        addLog('fire', `射撃: ${nameStr} (fp${totalFP}) → ${target.name}: DD`);
      } else if (typeof dmg === 'number' && dmg >= def) {
        target.status = target.status === 'dd' ? 'eliminated' : (target.status === 'd' ? 'dd' : 'd');
        addLog('fire', `射撃: ${nameStr} (fp${totalFP}) → ${target.name}: D`);
      } else {
        addLog('fire', `射撃: ${nameStr} (fp${totalFP}) → ${target.name}: 効果なし`);
      }
      firingUnits.forEach(u => { u.firedThisTurn = true; });
    }
  }
}

// ========== 突撃（同期版） ==========
function aiAutoAssaultSync() {
  if (G.initiative === 'german') {
    if (typeof geAI_autoAssault === 'function') {
      geAI_autoAssault();
    }
  }
  addLog('assault', 'AI: 突撃フェイズ（自動）');
}

// ========== 後攻移動（同期版） ==========
function aiAutoDefMoveSync() {
  const defSide = G.initiative === 'german' ? 'allied' : 'german';

  // 後攻側の未配置援軍をデプロイ
  const undeployedDef = testUnits.filter(u =>
    u.reinforcement && !u.reinforcement.deployed && u.side === defSide
  );
  undeployedDef.forEach(u => {
    if (u.reinforcement.entryHexes && u.reinforcement.entryHexes.length > 0) {
      const ehId = u.reinforcement.entryHexes[0];
      const pos = fromHexId(ehId);
      u.reinforcement.deployed = true;
      u.col = pos.col + 1; u.row = pos.row;
      const center = getHexCenter(u.col, u.row);
      u.x = center.x; u.y = center.y;
      u.hexId = toHexId(u.col, u.row);
      u._entryHexId = ehId;
    }
  });

  // マップ外→入口ヘクスに4台ずつ配置
  const offMapDef = testUnits.filter(u =>
    u.side === defSide && u.status !== 'eliminated' && u._entryHexId && u.col >= MAP_CONFIG.cols
  );
  const defEntryBatches = {};
  offMapDef.forEach(u => {
    if (!defEntryBatches[u._entryHexId]) defEntryBatches[u._entryHexId] = [];
    defEntryBatches[u._entryHexId].push(u);
  });
  for (const [ehId, eUnits] of Object.entries(defEntryBatches)) {
    const pos = fromHexId(ehId);
    for (let i = 0; i < eUnits.length; i += 4) {
      const batch = eUnits.slice(i, i + 4);
      batch.forEach(u => {
        u.col = pos.col; u.row = pos.row;
        const center = getHexCenter(u.col, u.row);
        u.x = center.x; u.y = center.y;
        u.hexId = ehId;
        delete u._entryHexId;
      });
    }
  }

  // ドイツが後攻の場合: 左へ突進
  if (defSide === 'german') {
    const geStacks = {};
    testUnits.filter(u => u.side === 'german' && u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'AT' && u.type !== 'A')
      .forEach(u => {
        if (!geStacks[u.hexId]) geStacks[u.hexId] = [];
        geStacks[u.hexId].push(u);
      });
    const geStackList = [];
    for (const [hid, uList] of Object.entries(geStacks)) {
      for (let i = 0; i < uList.length; i += 4) {
        geStackList.push(uList.slice(i, i + 4));
      }
    }
    for (const stack of geStackList) {
      const alive = stack.filter(u => u.status !== 'eliminated');
      if (alive.length === 0) continue;
      onUnitAction(alive[0], alive);
      const minMove = Math.min(...alive.map(u => u.move != null ? u.move : 1));
      let mp = minMove;
      const defAiPath = geAI_findBestPath(alive, mp);
      let defPathIdx = 0;
      while (mp > 0) {
        let best = null;
        if (defAiPath && defPathIdx < defAiPath.length) {
          best = defAiPath[defPathIdx];
          defPathIdx++;
        }
        if (!best) break;
        const hexId = toHexId(best.col, best.row);
        const mc = getMoveCost(alive[0], alive[0].col, alive[0].row, best.col, best.row, 'combat');
        if (mc.cost === Infinity) break;
        mp -= mc.cost;
        alive.forEach(u => {
          if (u.status === 'eliminated') return;
          u.col = best.col; u.row = best.row;
          const center = getHexCenter(u.col, u.row);
          u.x = center.x; u.y = center.y;
          u.hexId = hexId;
        });
        alive.forEach(u => { if (u.status !== 'eliminated') checkDummyVisibility(u); });
        if (alive.every(u => u.status === 'eliminated')) break;

        // ストップ射撃チェック（逃げる敵は最大射程でも撃つ）
        const defStopThreats = checkStopFireAt(best.col, best.row, alive[0].side);
        const filteredThreats = defStopThreats.filter(e => {
          if ((e.range || 1) >= 3) {
            const dist = hexDistance(e.col, e.row, best.col, best.row);
            if (dist === e.range && mp > 0) {
              const prevDist = hexDistance(e.col, e.row, alive[0].col, alive[0].row);
              if (dist < prevDist) return false; // 向かってくる → 控える
            }
          }
          return true;
        });
        if (filteredThreats.length > 0) {
          const defEnemyStacks = {};
          filteredThreats.forEach(e => {
            const eHex = e.hexId || toHexId(e.col, e.row);
            if (!defEnemyStacks[eHex]) defEnemyStacks[eHex] = [];
            defEnemyStacks[eHex].push(e);
          });
          for (const [eHex, eStack] of Object.entries(defEnemyStacks)) {
            const aliveE = eStack.filter(e => e.status === 'ok');
            if (aliveE.length === 0) continue;
            const sfSurprise = isSurpriseAttack(eHex, aliveE[0].side);
            const sfShotCount = sfSurprise ? 2 : 1;
            onUnitAction(aliveE[0], aliveE);
            const isArmored = alive[0].type === 'T' || alive[0].type === 'AC';
            let sfFP = 0;
            aliveE.forEach(e => { sfFP += isArmored ? (e.fpAT || 0) : (e.fpSoft || 0); });
            if (sfFP <= 0) continue;
            for (let sfShot = 0; sfShot < sfShotCount; sfShot++) {
              const sfTarget = alive.find(u => u.status !== 'eliminated' && u.type !== 'leader') || alive.find(u => u.status !== 'eliminated') || alive[0];
              if (!sfTarget || sfTarget.status === 'eliminated') break;
              executeDirectFire(aliveE, sfTarget);
            }
          }
          // 反撃
          const aliveAfter = alive.filter(u => u.status !== 'eliminated');
          if (aliveAfter.length > 0) {
            const counterTarget = defStopThreats.filter(e => e.status !== 'eliminated')
              .sort((a, b) => (a.def || 5) - (b.def || 5))[0];
            if (counterTarget) {
              const dist2 = hexDistance(aliveAfter[0].col, aliveAfter[0].row, counterTarget.col, counterTarget.row);
              if (dist2 > 0 && dist2 <= Math.max(...aliveAfter.map(u => u.range || 1))) {
                const isArmoredT = counterTarget.type === 'T' || counterTarget.type === 'AC';
                let crFP = 0;
                const crUnits = [];
                aliveAfter.forEach(u => {
                  const fp = isArmoredT ? (u.fpAT || 0) : (u.fpSoft || 0);
                  if (fp > 0 && dist2 <= (u.range || 1)) { crFP += fp; crUnits.push(u); }
                });
                if (crFP > 0) {
                  executeDirectFire(crUnits, counterTarget);
                }
              }
            }
          }
          if (alive.every(u => u.status === 'eliminated')) break;
          break;
        }
      }
      // 突破判定
      alive.forEach(u => {
        if (u.side === 'german' && u.status !== 'eliminated' && u.col <= 1 && u.row >= 1 && u.row <= 9) {
          u.status = 'eliminated';
          G.breakthroughCount++;
          addLog('breakthrough', `★ ${u.name} 突破!`);
        }
      });
    }
  }

  // イギリスが後攻の場合: aiMoveToward同期版で移動
  if (defSide === 'allied') {
    aiAutoDefMoveContinueSync();
  }
}

// ========== イギリス後攻移動（同期版） ==========
function aiMoveTowardSync(unitsToMove, targetCol, targetRow, isTank) {
  const alive = unitsToMove.filter(u => u.status !== 'eliminated');
  if (alive.length === 0) return;
  alive.forEach(u => { if (u.reinforcement) u.reinforcement.deployed = true; });
  const formation = alive[0].marchMode ? 'march' : 'combat';
  const minMove = Math.min(...alive.map(u => u.move != null ? u.move : 1));
  let mp = minMove;

  const bfs = bfsShortestPath(alive[0], alive[0].col, alive[0].row, targetCol, targetRow, formation, alive, false);
  const bfsPath = bfs.path;
  let pathIdx = 0;
  let stoppedByFire = false;

  while (mp > 0 && pathIdx < bfsPath.length) {
    const curCol = alive[0].col;
    const curRow = alive[0].row;
    if (curCol === targetCol && curRow === targetRow) break;

    const next = bfsPath[pathIdx];
    const mc = getMoveCost(alive[0], curCol, curRow, next.col, next.row, formation);
    if (mc.cost === Infinity) break;
    const isFirstStep = (pathIdx === 0 && !stoppedByFire);
    if (!isFirstStep && mp < mc.cost) break;

    const hid = toHexId(next.col, next.row);
    const existing = testUnits.filter(su =>
      su.hexId === hid && su.status !== 'eliminated' &&
      !STACK_EXEMPT_TYPES.includes(su.type) && !alive.includes(su)
    ).length;
    if (existing + alive.filter(u => u.status !== 'eliminated').length > 4) break;

    mp -= mc.cost;
    pathIdx++;
    alive.forEach(u => {
      if (u.status === 'eliminated') return;
      u.col = next.col; u.row = next.row;
      const center = getHexCenter(u.col, u.row);
      u.x = center.x; u.y = center.y;
      u.hexId = hid;
    });
    alive.forEach(u => { if (u.status !== 'eliminated') checkDummyVisibility(u); });
    if (alive.every(u => u.status === 'eliminated')) break;

    // ストップ射撃チェック（逃げる敵は最大射程でも撃つ）
    const threats = checkStopFireAt(next.col, next.row, alive[0].side);
    const filteredThreats = threats.filter(e => {
      if ((e.range || 1) >= 3) {
        const eDist = hexDistance(e.col, e.row, next.col, next.row);
        if (eDist === e.range && mp > 0) {
          const prevDist = hexDistance(e.col, e.row, alive[0].col, alive[0].row);
          if (eDist < prevDist) return false; // 向かってくる → 控える
          }
      }
      return true;
    });
    if (filteredThreats.length > 0) {
      const enemyStacks = {};
      filteredThreats.forEach(e => {
        const eHex = e.hexId || toHexId(e.col, e.row);
        if (!enemyStacks[eHex]) enemyStacks[eHex] = [];
        enemyStacks[eHex].push(e);
      });
      for (const [eHex, eStack] of Object.entries(enemyStacks)) {
        const aliveE = eStack.filter(e => e.status === 'ok');
        if (aliveE.length === 0) continue;
        const sfSurprise = isSurpriseAttack(eHex, aliveE[0].side);
        const sfShotCount = sfSurprise ? 2 : 1;
        onUnitAction(aliveE[0], aliveE);
        const isArmored = alive[0].type === 'T' || alive[0].type === 'AC';
        let sfFP = 0;
        aliveE.forEach(e => { sfFP += isArmored ? (e.fpAT || 0) : (e.fpSoft || 0); });
        if (sfFP <= 0) continue;
        for (let sfShot = 0; sfShot < sfShotCount; sfShot++) {
          const sfTarget = alive.find(u => u.status !== 'eliminated' && u.type !== 'leader') || alive.find(u => u.status !== 'eliminated') || alive[0];
          if (!sfTarget || sfTarget.status === 'eliminated') break;
          executeDirectFire(aliveE, sfTarget);
        }
      }
      // 反撃
      const aliveAfter = alive.filter(u => u.status !== 'eliminated');
      if (aliveAfter.length > 0) {
        const counterTarget = threats.filter(e => e.status !== 'eliminated')
          .sort((a, b) => (a.def || 5) - (b.def || 5))[0];
        if (counterTarget) {
          const dist2 = hexDistance(aliveAfter[0].col, aliveAfter[0].row, counterTarget.col, counterTarget.row);
          if (dist2 > 0 && dist2 <= Math.max(...aliveAfter.map(u => u.range || 1))) {
            const isArmoredT = counterTarget.type === 'T' || counterTarget.type === 'AC';
            let crFP = 0;
            const crUnits = [];
            aliveAfter.forEach(u => {
              const fp = isArmoredT ? (u.fpAT || 0) : (u.fpSoft || 0);
              if (fp > 0 && dist2 <= (u.range || 1)) { crFP += fp; crUnits.push(u); }
            });
            if (crFP > 0) {
              executeDirectFire(crUnits, counterTarget);
            }
          }
        }
      }
      if (alive.every(u => u.status === 'eliminated')) break;
      stoppedByFire = true;
      break;
    }
  }
  alive.forEach(u => { if (u.status !== 'eliminated') u.moveComplete = true; });
}

function aiAutoDefMoveContinueSync() {
  const alliedStacks = {};
  testUnits.filter(u =>
    u.side === 'allied' && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'fortification' && u.type !== 'ip' &&
    u.col >= 0 && u.col < MAP_CONFIG.cols
  ).forEach(u => {
    if (!alliedStacks[u.hexId]) alliedStacks[u.hexId] = [];
    alliedStacks[u.hexId].push(u);
  });

  const allBatches = [];
  for (const [hexId, stackUnits] of Object.entries(alliedStacks)) {
    for (let i = 0; i < stackUnits.length; i += 4) {
      const batch = stackUnits.slice(i, i + 4);
      const alive = batch.filter(u => u.status !== 'eliminated');
      if (alive.length === 0) continue;
      const firstName = alive[0].name || '';
      let sk = null;
      if (firstName.match(/^M4-R\d+-[0-3]$/)) sk = 'M4_0';
      else if (firstName.match(/^M4-R\d+-[4-7]$/)) sk = 'M4_1';
      else if (firstName.startsWith('A27-R')) sk = 'A27_0';
      else if (firstName.startsWith('A22-R') || firstName.startsWith('Infantry-R4-0') || firstName.startsWith('Infantry-R4-1')) sk = 'R4_0';
      else if (firstName.startsWith('Infantry-R4-2') || firstName.startsWith('Infantry-R4-3')) sk = 'R4_1';
      const tgtHex = sk ? _aiAssignedTargets[sk] : null;
      let dist = 0;
      if (tgtHex) {
        const tp = fromHexId(tgtHex);
        dist = hexDistance(alive[0].col, alive[0].row, tp.col, tp.row);
      }
      allBatches.push({ alive, dist });
    }
  }
  allBatches.sort((a, b) => b.dist - a.dist);

  for (const { alive } of allBatches) {
    if (alive.every(u => (u.move || 0) === 0)) continue;
    const hasDamaged = alive.some(u => u.status === 'd' || u.status === 'dd');
    const isTank = alive.some(u => u.type === 'T' || u.type === 'AC');

    if (hasDamaged) {
      // D/DD退避ロジック
      const curCol = alive[0].col, curRow = alive[0].row;
      let bestTarget = null, bestScore = -Infinity;
      const minMove = Math.min(...alive.map(u => u.move != null ? u.move : 1));
      const visited = {};
      const queue = [{ col: curCol, row: curRow, mp: minMove }];
      visited[`${curCol},${curRow}`] = true;
      while (queue.length > 0) {
        const cur = queue.shift();
        const nbs = getHexNeighbors(cur.col, cur.row);
        for (const n of nbs) {
          const key = `${n.col},${n.row}`;
          if (visited[key]) continue;
          const hid = toHexId(n.col, n.row);
          const terrain = getHexTerrain(hid);
          if (terrain === 'lake' || terrain === 'x') continue;
          if (isTank && terrain === 'f') continue;
          const hasEnemy = testUnits.some(eu =>
            eu.hexId === hid && eu.side === 'german' &&
            eu.status !== 'eliminated' && eu.type !== 'dummy'
          );
          if (hasEnemy) continue;
          let cost = 1;
          if (terrain === 'w' || terrain === 'r') cost = 2;
          else if (terrain === 'f') cost = 3;
          if (cur.mp < cost) continue;
          visited[key] = true;
          const existingCount = testUnits.filter(su =>
            su.hexId === hid && su.status !== 'eliminated' &&
            !STACK_EXEMPT_TYPES.includes(su.type) && !alive.includes(su)
          ).length;
          if (existingCount + alive.filter(u => u.status !== 'eliminated').length > 4) continue;
          const enemyDist = avgDistFromEnemy(n.col, n.row);
          const safe = !isUnderEnemyThreat(n.col, n.row, 'allied');
          const cover = isCoverTerrain(hid);
          let score = enemyDist * 2;
          if (safe) score += 20;
          if (cover) score += 15;
          if (safe && cover) score += 10;
          if (score > bestScore) {
            bestScore = score;
            bestTarget = { col: n.col, row: n.row };
          }
          queue.push({ col: n.col, row: n.row, mp: cur.mp - cost });
        }
      }
      if (bestTarget) {
        onUnitAction(alive[0], alive);
        aiMoveTowardSync(alive, bestTarget.col, bestTarget.row, isTank);
      }
    } else {
      // OK状態: 事前割り当て先への移動
      if (window._aiAmbushCandidates && window._aiAmbushCandidates.length > 0) {
        const firstName = alive[0].name || '';
        let stackKey = null;
        if (firstName.startsWith('M4-R1-')) {
          stackKey = parseInt(firstName.split('-')[2]) < 4 ? 'M4_0' : 'M4_1';
        } else if (firstName.startsWith('A27-R')) {
          stackKey = 'A27_0';
        } else if (firstName.startsWith('A22-R') || firstName.startsWith('Infantry-R4-0') || firstName.startsWith('Infantry-R4-1')) {
          stackKey = 'R4_0';
        } else if (firstName.startsWith('Infantry-R4-2') || firstName.startsWith('Infantry-R4-3')) {
          stackKey = 'R4_1';
        }

        if ((stackKey === 'R4_0' || stackKey === 'R4_1') && G.turn >= 4) {
          const forceTarget = stackKey === 'R4_0' ? { col: 1, row: 6 } : { col: 1, row: 5 };
          onUnitAction(alive[0], alive);
          aiMoveTowardSync(alive, forceTarget.col, forceTarget.row, isTank);
          continue;
        }

        const assignedHexId = stackKey ? _aiAssignedTargets[stackKey] : null;
        let bestCand = null;
        let alreadyThere = false;

        if (assignedHexId) {
          if (alive[0].hexId === assignedHexId) {
            alreadyThere = true;
          } else {
            const cand = window._aiAmbushCandidates.find(c => c.hexId === assignedHexId);
            if (cand) bestCand = cand;
          }
        }

        if (alreadyThere) {
          alive.forEach(u => {
            if (u.marchMode && u._aiAutoMarch) {
              if (u._towed) {
                u.closeAtk = u._origCloseAtk;
                u.closeDef = u._origCloseDef;
                u.move = u._origMove;
                u._towed = false;
              }
              u.marchMode = false;
              u._aiAutoMarch = false;
            }
          });
        }

        if (bestCand) {
          onUnitAction(alive[0], alive);
          aiMoveTowardSync(alive, bestCand.col, bestCand.row, isTank);
        }
      }
    }
  }
}

// ========== ターン進行 ==========
function advanceTurnSync() {
  G.turn++;
  _completedMoveTrails = [];
  if (G.turn > G.maxTurn) {
    addLog('turn', `===== ゲーム終了 =====`);
    addLog('turn', `突破ユニット数: ${G.breakthroughCount}`);
    if (G.breakthroughCount >= SCENARIO.victory.breakthroughTarget) {
      addLog('turn', 'ドイツ軍の勝利！');
    } else if (G.breakthroughCount >= SCENARIO.victory.drawThreshold) {
      addLog('turn', '引き分け');
    } else {
      addLog('turn', 'イギリス軍の勝利！');
    }
    return;
  }
  G.phase = 0;
  G.diceRolled = false;
  G.initiative = null;

  // 回復結果リセット
  if (typeof recoveryResults !== 'undefined') {
    Object.keys(recoveryResults).forEach(k => delete recoveryResults[k]);
  }
  // 支援射撃リセット
  if (typeof resetSupportState === 'function') resetSupportState();
  // 直接射撃リセット
  if (typeof resetDirectFireState === 'function') {
    G.initiative = 'german'; // 仮設定
    resetDirectFireState();
    G.initiative = null;
  }

  // ダミー再配置
  const dummyHexChecked = new Set();
  testUnits.forEach(u => {
    if (u.status === 'eliminated' || u.type === 'dummy' || u.type === 'leader' ||
        u.type === 'fortification' || u.type === 'ip') return;
    if (dummyHexChecked.has(u.hexId + '_' + u.side)) return;
    dummyHexChecked.add(u.hexId + '_' + u.side);

    const hexMates = testUnits.filter(m =>
      m.hexId === u.hexId && m.side === u.side && m.status !== 'eliminated' &&
      m.type !== 'dummy' && m.type !== 'leader'
    );
    if (hexMates.every(m => m.status === 'd' || m.status === 'dd')) return;
    if (hexMates.some(m => m.firedThisTurn || m.moveComplete || m.assaultedThisTurn || m._counterFired || (typeof recoveryResults !== 'undefined' && recoveryResults[m.id]))) return;

    const enemySide = u.side === 'german' ? 'allied' : 'german';
    const isVisible = testUnits.some(e =>
      e.side === enemySide && e.status !== 'eliminated' &&
      e.type !== 'dummy' && e.type !== 'leader' &&
      hexDistance(e.col, e.row, u.col, u.row) <= (G.visionRange || 12) &&
      hasLOS(e.col, e.row, u.col, u.row)
    );
    if (isVisible) return;

    const currentDummies = getDummyCount(u.hexId);
    if (currentDummies < 4) {
      placeDummy(u.hexId, u.side, 4 - currentDummies);
    }
  });

  // フラグリセット
  testUnits.forEach(u => {
    u.firedThisTurn = false;
    u.outOfAmmo = false;
    u.assaultedThisTurn = false;
    u.moveComplete = false;
    u._counterFiredThisTurn = false;
    u._counterFired = false;
  });

  // 航空支援リセット
  if (typeof resetAirSupport === 'function') resetAirSupport();

  // 援軍チェック
  deployReinforcements(SCENARIO, G.turn);

  addLog('turn', `===== ターン ${G.turn} 開始 =====`);
}

// ========== 1ゲーム実行 ==========
function playOneGame() {
  initGame();

  for (let turn = 1; turn <= G.maxTurn; turn++) {
    rollInitiativeSync();
    aiAutoRecoverySync();
    aiAutoMoveFireSync();
    aiAutoAssaultSync();
    aiAutoDefMoveSync();
    if (turn < G.maxTurn) {
      advanceTurnSync();
    }
  }

  // 最終結果
  const germanAlive = testUnits.filter(u => u.side === 'german' && u.status !== 'eliminated' && u.type !== 'dummy').length;
  const alliedAlive = testUnits.filter(u => u.side === 'allied' && u.status !== 'eliminated' && u.type !== 'dummy').length;
  let winner;
  if (G.breakthroughCount >= SCENARIO.victory.breakthroughTarget) {
    winner = 'german';
  } else if (G.breakthroughCount >= SCENARIO.victory.drawThreshold) {
    winner = 'draw';
  } else {
    winner = 'allied';
  }

  return {
    breakthroughCount: G.breakthroughCount,
    germanAlive,
    alliedAlive,
    winner,
  };
}

// ========== メインエントリ / モジュールエクスポート ==========
if (require.main === module) {
  // 直接実行時
  const numGames = parseInt(process.argv[2]) || 10;
  let germanWins = 0, alliedWins = 0, draws = 0;
  let totalBreakthrough = 0;

  console.log(`Panzergrenadier Headless Engine — ${numGames} games`);
  console.log(`Scenario: ${SCENARIO_2.name}`);
  console.log('---');

  for (let i = 0; i < numGames; i++) {
    const result = playOneGame();
    totalBreakthrough += result.breakthroughCount;
    if (result.winner === 'german') germanWins++;
    else if (result.winner === 'allied') alliedWins++;
    else draws++;

    if (_verbose || (i + 1) % 10 === 0) {
      console.log(`  Game ${i + 1}/${numGames}: BT=${result.breakthroughCount} GE=${result.germanAlive} UK=${result.alliedAlive} → ${result.winner}`);
    }
  }

  console.log('---');
  console.log(`Results (${numGames} games):`);
  console.log(`  German wins:  ${germanWins} (${(germanWins / numGames * 100).toFixed(1)}%)`);
  console.log(`  Allied wins:  ${alliedWins} (${(alliedWins / numGames * 100).toFixed(1)}%)`);
  console.log(`  Draws:        ${draws} (${(draws / numGames * 100).toFixed(1)}%)`);
  console.log(`  Avg breakthrough: ${(totalBreakthrough / numGames).toFixed(1)}`);
}

// require時はグローバル関数を公開（trainから使う）
global.initGame = initGame;
global.playOneGame = playOneGame;
global.rollInitiativeSync = rollInitiativeSync;
global.aiAutoRecovery = typeof aiAutoRecovery !== 'undefined' ? aiAutoRecovery : aiAutoRecoverySync;
global.aiAutoMoveFireSync = aiAutoMoveFireSync;
global.aiAutoAssaultSync = aiAutoAssaultSync;
global.aiAutoDefMoveSync = aiAutoDefMoveSync;
global.advanceTurnSync = advanceTurnSync;
