// wsm_movement.js — WSM 移動関連の計算
// 風相対角による移動力（戦闘帆/帆走）＋ Wind Effects Table の風速修正子
// Attitude割当: A=後ろ斜め(d=1), B=真後ろ(d=0), C=斜前(d=2), D=正面(d=3)

// 艦の dir と風向（numpad）の相対角を算出 (0=直後/B, 1=後斜め/A, 2=斜前/C, 3=正面/D)
function getRelativeWindAngle(shipDir, windDir) {
  const order = [8, 9, 3, 2, 1, 7];  // 時計回り: N,NE,SE,S,SW,NW
  const a = order.indexOf(shipDir);
  const b = order.indexOf(windDir);
  if (a < 0 || b < 0) return 0;
  let diff = Math.abs(a - b);
  if (diff > 3) diff = 6 - diff;
  return diff;
}

// d -> Attitude文字 (A=後斜/d=1, B=真後/d=0, C=斜前/d=2, D=正面/d=3)
function dToAttitude(d) {
  return ['B','A','C','D'][d] || 'A';
}

function computeAttitude(ship, wind) {
  if (!ship || !wind) return 'A';
  if (ship.sailBroken) return 'D';
  return dToAttitude(getRelativeWindAngle(ship.dir, wind.direction));
}
const ATTITUDE_JP = { 'A':'後斜', 'B':'追風', 'C':'斜前', 'D':'正面' };

// Wind Effects Table
// WIND_EFFECTS[velocity][classGroup][A/B/C/D]
// classGroup: 1=N1, 2=N2, 3=N3&4, 4=N5&6
const WIND_EFFECTS = {
  1: { 1:{A:-3,B:-2,C:-2,D:0}, 2:{A:-3,B:-2,C:-1,D:0}, 3:{A:-3,B:-2,C:-1,D:0}, 4:{A:-2,B:-1,C:0,D:0} },
  2: { 1:{A:-1,B:-1,C:-1,D:0}, 2:{A:-1,B:-1,C:0,D:0},  3:{A:-1,B:0,C:0,D:0},  4:{A:-1,B:0,C:0,D:0}   },
  3: { 1:{A:0,B:0,C:0,D:0},    2:{A:0,B:0,C:0,D:0},    3:{A:0,B:0,C:0,D:0},    4:{A:0,B:0,C:0,D:0}    },
  4: { 1:{A:0,B:0,C:0,D:0},    2:{A:-1,B:0,C:0,D:0},   3:{A:-1,B:-1,C:0,D:0},   4:{A:-2,B:-2,C:-1,D:0} },
  5: { 1:{A:-1,B:0,C:0,D:0},   2:{A:-1,B:-1,C:0,D:0},  3:{A:-1,B:-1,C:-1,D:0},  4:{A:-3,B:-2,C:-2,D:0} },
  6: { 1:{A:-2,B:-1,C:-1,D:0}, 2:{A:-3,B:-2,C:-1,D:0}, 3:{A:-3,B:-2,C:-1,D:0},  4:{A:-3,B:-3,C:-2,D:0} },
};

function classGroup(classNum) {
  if (classNum === 1) return 1;
  if (classNum === 2) return 2;
  if (classNum === 3 || classNum === 4) return 3;
  return 4; // 5, 6
}

function getWindModifier(ship, wind) {
  const v = wind.velocity;
  if (!v || v < 1 || v > 6) return 0;
  const cg = classGroup(ship.classNum || 3);
  const att = computeAttitude(ship, wind);
  return WIND_EFFECTS[v]?.[cg]?.[att] ?? 0;
}

// 帆状態の有効化：トーナメント由来の降格処理は除外
function effectiveSailState(ship, wind) {
  return ship.sailState || 'battle';
}

// 最大移動力（基本MP＋Wind Effects修正、下限0）
function maxMoveForAttitude(ship, wind) {
  if (!ship || !wind) return 0;
  if (ship.sailBroken) return 0;
  if (wind.velocity === 0) return 0;   // Becalmed
  if (wind.velocity === 7) return 0;   // Hurricane

  const sail = effectiveSailState(ship, wind);
  if (sail === 'furled') return 0;

  const d = getRelativeWindAngle(ship.dir, wind.direction);
  const bs = ship.battleSailSpeed || 3;
  const fs = ship.fullSailSpeed || 5;

  let base;
  if (sail === 'full') {
    if (d === 3) return 0;           // 正面=D
    else if (d === 2) base = 2;      // 斜前=C (固定2)
    else if (d === 1) base = fs;     // 後斜め=A (fs)
    else base = Math.max(0, fs - 1); // 真後ろ=B (fs-1)
  } else {
    if (d === 3) return 0;
    else if (d === 2) base = 1;      // 斜前=C (固定1)
    else if (d === 1) base = bs;     // 後斜め=A (bs)
    else base = Math.max(0, bs - 1); // 真後ろ=B (bs-1)
  }

  const mod = getWindModifier(ship, wind);
  return Math.max(0, base + mod);
}

function turnCost(fromDir, toDir) {
  const order = [8, 9, 3, 2, 1, 7];
  const a = order.indexOf(fromDir), b = order.indexOf(toDir);
  if (a < 0 || b < 0) return 0;
  let d = Math.abs(a - b);
  if (d > 3) d = 6 - d;
  return d;
}

function rotate60(dir, cw) {
  const order = [8, 9, 3, 2, 1, 7];
  const i = order.indexOf(dir);
  if (i < 0) return dir;
  return order[(i + (cw ? 1 : -1) + 6) % 6];
}

function getMoveSummary(ship, wind) {
  if (!ship || !wind) return '';
  const att = computeAttitude(ship, wind);
  const mv = maxMoveForAttitude(ship, wind);
  return `${ATTITUDE_JP[att] || att} / 移動${mv}`;
}
