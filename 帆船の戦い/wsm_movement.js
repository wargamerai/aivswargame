// wsm_movement.js — WSM 移動関連の計算
// 風向態勢（Attitude）、移動力算出、転舵コスト
// 前提: hub.html の定数・ヘルパー（DIR_ANGLE, hexNeighbor, getSternHex 等）が読み込み済み

// --- 風向態勢 (Attitude) ---
// A = Stern to Wind（追い風）: 最速
// B = Beam to Wind（横風）
// C = Close-hauled（詰め開き）
// D = In Irons（逆風停止）: 動けない
// 艦首方向(ship.dir)と風の「吹いてくる方位」で相対角を出す
// WSM慣例: 風の「from」方位を基準にする → 風が9(NE)から吹く場合、逆向き6(E)側に流れる
// ここでは state.wind.direction は「風が向かう方位」として扱う
function getRelativeWindAngle(shipDir, windDir) {
  // 方位1-6をヘクス番号に変換（IJN numpad: 9,6,3,1,4,7）
  const dirIdx = { 9:0, 6:1, 3:2, 1:3, 4:4, 7:5 };
  const a = dirIdx[shipDir];
  const b = dirIdx[windDir];
  if (a === undefined || b === undefined) return 0;
  // 相対: 0=同方向（追い風受け）, 1=60°, 2=120°, 3=正面（向かい風）, 4=120°, 5=60°
  let diff = (a - b + 6) % 6;
  if (diff > 3) diff = 6 - diff;
  return diff;  // 0〜3
}

function computeAttitude(ship, wind) {
  if (!ship || !wind) return 'A';
  if (ship.sailBroken) return 'D';
  const d = getRelativeWindAngle(ship.dir, wind.direction);
  // d=0: 風が艦首から吹く(後から追い風) → A 追い風
  // d=1: 60°差 → A/B
  // d=2: 120°差（横風気味）→ B
  // d=3: 180°差（真正面に風）→ D 逆風停止
  if (d === 0) return 'A';       // 追い風
  if (d === 1) return 'A';       // 追い風寄り
  if (d === 2) return 'B';       // 横風
  if (d === 3) return 'D';       // 逆風停止
  return 'C';
}

// --- 最大移動力 ---
// WSM: 帆状態(furled/battle/full) × attitude × 風速 で決まる
// 簡略実装: class別 base speed × attitude × sail状態 × wind係数
function baseSpeed(ship) {
  // IJNフォールバック: ship.speedがあれば流用
  if (ship.speed && !ship.shipClass) return ship.speed;
  // §20.1 フルセイル時は full_sail_speed を使用（ship.fullSailSpeed または class default）
  if (ship.sailState === 'full') {
    if (ship.fullSailSpeed) return ship.fullSailSpeed;
    const clsF = ship.shipClass || ship.type;
    const full = {
      'SOL': 5, 'BB': 5, 'OBB': 5,
      'F': 6, 'CA': 6, 'CL': 6, 'CLAA': 6,
      'C': 6,
      'B': 7, 'S': 7, 'DD': 7,
    };
    return full[clsF] || 6;
  }
  const cls = ship.shipClass || ship.type;
  // WSMデフォルトのBattle Sail Speed
  const base = {
    'SOL': 3, 'BB': 3, 'OBB': 3,
    'F': 4, 'CA': 4, 'CL': 4, 'CLAA': 4,
    'C': 4,
    'B': 5, 'S': 5, 'DD': 5,
  };
  return base[cls] || 4;
}

function maxMoveForAttitude(ship, wind) {
  if (!ship || !wind) return 0;
  const attitude = computeAttitude(ship, wind);
  if (attitude === 'D') return 0;   // 逆風停止

  const base = baseSpeed(ship);
  const sail = ship.sailState || 'battle';
  const vel = wind.velocity || 3;

  // attitude係数
  const attCoef = { 'A': 1.0, 'B': 0.75, 'C': 0.5 }[attitude] || 0.5;
  // sail係数
  const sailCoef = { 'furled': 0.0, 'battle': 1.0, 'full': 1.0 }[sail] || 1.0;
  // wind velocity係数（1=微風〜6=疾風）
  // WSM: 風速1=低速, 3-4=標準, 6=危険
  const velCoef = [0, 0.5, 0.75, 1.0, 1.0, 1.1, 1.1][Math.min(6, Math.max(0, vel))];

  let mv = base * attCoef * sailCoef * velCoef;

  // 索具損傷ペナルティ
  if (ship.rigging) {
    const rigTotal = (ship.rigging.L?.max || 0) + (ship.rigging.C?.max || 0) + (ship.rigging.R?.max || 0);
    const rigRemain = (ship.rigging.L?.remain || 0) + (ship.rigging.C?.remain || 0) + (ship.rigging.R?.remain || 0);
    if (rigTotal > 0) {
      const ratio = rigRemain / rigTotal;
      if (ratio < 0.3) mv *= 0.3;
      else if (ratio < 0.5) mv *= 0.6;
      else if (ratio < 0.7) mv *= 0.8;
    }
  }

  return Math.floor(mv);
}

// --- 転舵コスト ---
// 60°転舵ごとに1移動ポイント消費
function turnCost(fromDir, toDir) {
  const dirIdx = { 9:0, 6:1, 3:2, 1:3, 4:4, 7:5 };
  const a = dirIdx[fromDir], b = dirIdx[toDir];
  if (a === undefined || b === undefined) return 0;
  let d = Math.abs(a - b);
  if (d > 3) d = 6 - d;
  return d;  // 0〜3（60°単位）
}

// 60°時計回り／反時計回り
function rotate60(dir, cw) {
  const order = [9, 6, 3, 1, 4, 7];  // 時計回り順
  const i = order.indexOf(dir);
  if (i < 0) return dir;
  return order[(i + (cw ? 1 : -1) + 6) % 6];
}

// --- Attitude表示用の日本語ラベル ---
const ATTITUDE_JP = { 'A': '追風', 'B': '横風', 'C': '詰開', 'D': '逆風停止' };

// --- デバッグ用: 艦の移動情報サマリ ---
function getMoveSummary(ship, wind) {
  if (!ship || !wind) return '';
  const att = computeAttitude(ship, wind);
  const mv = maxMoveForAttitude(ship, wind);
  return `${ATTITUDE_JP[att] || att} / 移動${mv}`;
}
