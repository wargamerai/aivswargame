// captain.js — 艦長の性格（ユーザーの指示 2026-11-03）
// ゲーム開始の時に艦ごとに密かに決まる。戦闘の最後の報告にだけ出す
//   慎重さ: 距離・魚雷を撃つ距離・離脱する損害・砲撃を控える損害に効く
//   目標の好み: 砲撃の目標の選び方に効く
// 戦闘開始時に hub が決める state.captainSeed と艦名から計算するので、画面を移っても同じ性格になる
const CAPTAIN_TEMPER_JP = { cautious: '慎重', normal: '普通', aggressive: '攻撃的' };
const CAPTAIN_TARGET_JP = { focus: '集中型', spread: '分散型', sure: '確実型', big: '大物狙い' };

function captainHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function captainOf(ship) {
  const seed = (typeof state !== 'undefined' && state && state.captainSeed) || 1;
  const a = captainHash(seed + ':t:' + ship.name) % 100;
  const b = captainHash(seed + ':g:' + ship.name) % 4;
  return {
    temper: a < 25 ? 'cautious' : a < 75 ? 'normal' : 'aggressive', // 25% / 50% / 25%
    target: ['focus', 'spread', 'sure', 'big'][b],                  // 各25%
  };
}
// 受ける損害をどれだけ気にするか（ユーザーの指示 2026-11-04）。戦艦・重巡 0.25〜1、駆逐艦・軽巡 0〜0.5
// 範囲を3つに分け、慎重は重い方、普通は中、攻撃的は軽い方から選ぶ。移動では旗艦の艦長の値を使う
function captainRisk(ship) {
  const seed = (typeof state !== 'undefined' && state && state.captainSeed) || 1;
  const heavy = ['BB', 'OBB', 'CA'].includes(ship.type);
  const low = heavy ? 0.25 : 0, high = heavy ? 1 : 0.5;
  const t = captainOf(ship).temper, band = t === 'aggressive' ? 0 : t === 'normal' ? 1 : 2;
  const pick = (captainHash(seed + ':r:' + ship.name) % 1000) / 1000;
  return low + (high - low) * (band + pick) / 3;
}
function captainDamageRate(s) {
  const cap = (s.capG || 0) + (s.capM || 0);
  return cap > 0 ? ((s.dmgG || 0) + (s.dmgM || 0)) / cap : 0;
}
// 自動離脱（ユーザーの指示 2026-11-06）: 砲撃不能はどの性格でも。損害は 慎重=50% / 普通=60% / 攻撃的=70% を超えたら
// 艦長ごとに ±10% ずれる（艦名から決めるので、ゲームの間は変わらない）
function captainWithdrawLine(s) {
  const seed = (typeof state !== 'undefined' && state && state.captainSeed) || 1;
  const base = { cautious: 0.5, normal: 0.6, aggressive: 0.7 }[captainOf(s).temper] || 0.6;
  const shift = ((captainHash(seed + ':w:' + s.name) % 2001) / 1000 - 1) * 0.1;
  return base + shift;
}
function captainShouldWithdraw(s) {
  if (s.cannotFire) return true;
  return captainDamageRate(s) > captainWithdrawLine(s);
}
function captainEnemies(ship) {
  const list = ship.side === 'jp' ? (state.usFleet || []) : (state.jpFleet || []);
  return list.filter(e => e.status !== 'sunk' && e.col >= 0);
}
// 相手の視認の外で、まだ位置を知られていないか
function captainIsHidden(s) {
  if (s.revealed || s.firedGun1 || s.onFire || s.radarDetected) return false;
  const spot = state.spotRange || 0;
  return captainEnemies(s).every(e => hexDist(s.col, s.row, e.col, e.row) > spot);
}
// AI が砲撃・雷撃を控えるか
function captainHoldsFire(s) {
  if (s.withdrawing) return true;
  const t = captainOf(s).temper;
  if (t === 'normal' && (s.status === 'medium' || s.status === 'heavy')) return true;
  if (t === 'cautious' && (s.status === 'medium' || s.status === 'heavy')) return true;
  if (t === 'cautious' && s.status === 'light' && captainIsHidden(s)) return true;
  // 視認の外の日本艦は、発砲して位置を知らせない（米軍のレーダー射撃はこの限りでない）
  if (s.side === 'jp' && captainIsHidden(s) && (state.combatTurn || 1) < 9) return true;
  return false;
}
// 魚雷を撃つ距離: 日本軍4・米軍3。慎重は+1、攻撃的は-1。9ターン目以降は制限なし
function captainTorpDist(s) {
  if ((state.combatTurn || 1) >= 9) return 12;
  const t = captainOf(s).temper;
  const base = s.side === 'jp' ? 4 : 3;
  return Math.max(1, base + (t === 'cautious' ? 1 : t === 'aggressive' ? -1 : 0));
}
function captainLineBlocked(a, b) {
  const dist = hexDist(a.col, a.row, b.col, b.row);
  if (dist <= 1) return false;
  const fa = toAxial(a.col, a.row), ta = toAxial(b.col, b.row);
  const all = [...(state.jpFleet || []), ...(state.usFleet || [])].filter(x => x !== a && x !== b && x.status !== 'sunk' && x.col >= 0);
  for (let i = 1; i < dist; i++) {
    const q = fa.q + (ta.q - fa.q) * i / dist, r = fa.r + (ta.r - fa.r) * i / dist;
    if (all.some(x => { const o = toAxial(x.col, x.row); return Math.abs(o.q - q) < 0.5 && Math.abs(o.r - r) < 0.5; })) return true;
  }
  return false;
}
// 第一砲撃で砲撃を控えて、雷撃に回すか（雷撃できるのは先攻だけ。第一砲撃で撃つと雷撃できない）
function captainWantsTorpedo(s) {
  if (state.initiative !== s.side) return false;
  if (!s.torpedo || s.torpedo === '-' || s.torpedoFired || s.cannotTorpedo) return false;
  const max = captainTorpDist(s), spot = state.spotRange || 0;
  const fa = toAxial(s.col, s.row);
  return captainEnemies(s).some(t => {
    const d = hexDist(s.col, s.row, t.col, t.row);
    if (d > max || (d > spot && !t.onFire)) return false;
    const ta = toAxial(t.col, t.row);
    if (!isBroadside(s.dir, ta.q - fa.q, ta.r - fa.r, -(ta.q - fa.q) - (ta.r - fa.r))) return false;
    return !captainLineBlocked(s, t);
  });
}
// 砲撃の目標の選び方（小さいほど優先）
function captainTargetScore(firer, t, d, assigned, dmgRate, arcPenalty) {
  switch (captainOf(firer).target) {
    case 'focus': return d - assigned * 4 - dmgRate * 20 + arcPenalty;                                   // 味方が撃った敵・傷ついた敵
    case 'spread': return d + assigned * 8 + dmgRate * 10 + arcPenalty;                                  // まだ撃っていない敵
    case 'sure': return d + assigned * 2 + ((t.atk || 0) > (firer.atk || 0) ? 8 : 0) + arcPenalty;       // 格下で近い敵
    default: return d * 0.5 + assigned * 2 - (t.vp || 1) * 6 + arcPenalty;                               // 得点の高い艦
  }
}
// 保ちたい距離: 格上は離れ、格下には近づく。ただし魚雷のある相手には近づきすぎない（命中率の表から）
function captainWantedRange(ship, enemy, sr) {
  let min, max;
  const myAtk = ship.atk || 0, foeAtk = enemy.atk || 0;
  const foeTorp = enemy.torpedo && enemy.torpedo !== '-' && !enemy.torpedoFired;
  if (ship.side === 'jp' && ship.type === 'DD') { min = 4; max = 5; }   // 日本の駆逐艦は雷撃のために突撃
  else if (foeAtk > myAtk) { min = 11; max = 13; }                       // 格上
  else if (foeAtk === myAtk) { min = 8; max = 10; }                      // 同格
  else if (foeTorp) { min = 8; max = 9; }                                // 格下で魚雷あり
  else { min = 5; max = 6; }                                             // 格下で魚雷なし
  const t = captainOf(ship).temper, shift = t === 'cautious' ? 2 : t === 'aggressive' ? -2 : 0;
  min = Math.max(1, min + shift); max = Math.max(min + 1, max + shift);
  return { min, max };
}
// 接触後の AI の進む方向。艦は後ろへは進めないので、向きで距離を調整する
function captainMoveDir(lead, enemies, sr, currentDir, perpTo, preContact) {
  if (preContact || (lead.type === 'DD' && lead.torpedoFired)) return currentDir;
  let foe = null, dist = 999;
  for (const e of enemies) {
    if (e.status === 'sunk' || e.col < 0) continue;
    const d = hexDist(lead.col, lead.row, e.col, e.row);
    if (d < dist) { dist = d; foe = e; }
  }
  if (!foe) return currentDir;
  const r = captainWantedRange(lead, foe, sr);
  if (dist > r.max + 4) return currentDir;  // まだ遠い間は、今までの接近の動き
  if (dist > r.max) return bestDirToward(lead.col, lead.row, foe.col, foe.row);
  if (dist < r.min) return bestDirAway(lead.col, lead.row, foe.col, foe.row);
  return perpTo(foe);
}
