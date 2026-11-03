// wsm_boarding.js — WSM 接舷・白兵戦処理
// 絡み判定 / 鉤縄判定 / 白兵戦解決
// 前提: chartsdata.js (FOULING_TABLES, CREW_MELEE_STRENGTH, MELEE_RESOLUTION)

// ============================================================
// 絡み判定 (Fouling): 1d6 で 1〜3 なら絡む（絡みの表）
// ============================================================
function rollFouling(shipA, shipB, wind) {
  const r = rollD6();
  const success = r <= 3;
  return { success, roll: r, total: r, log: [`1d6=${r} (${success ? '絡み成立' : '絡まず'})`] };
}

// ============================================================
// 絡み解除 (Unfouling)
// ============================================================
function rollUnfouling(ship, wind, unfoulingAttemptsThisTurn) {
  const log = [];
  // 1d6: 1-2 成功、3-6 失敗
  const r = 1 + Math.floor(Math.random() * 6);
  const success = r <= 2;
  log.push(`1d6=${r} (${success ? '解除成功' : '絡み継続'})`);
  return { success, roll: r, total: r, log };
}

// ============================================================
// 鉤縄判定 (Grappling) — 1d6: 1-3で成立
// ============================================================
function rollGrappling(attacker, target, opts) {
  const log = [];
  if (attacker && target && attacker.side === target.side) {
    return { success: true, auto: true, roll: 0, total: 0, log: ['友軍同士: 自動成立'] };
  }
  // 鉤縄の表の注: 片方が移動フェイズに動かなかったら出目 -1、両方なら -2
  const still = (attacker?.stoppedLastMove ? 1 : 0) + (target?.stoppedLastMove ? 1 : 0);
  const r = rollD6();
  const total = r - still;
  const success = total <= 3;
  log.push(`1d6=${r}${still ? ` -${still}(止まっていた艦)=${total}` : ''} (${success ? '鉤縄成立(1-3)' : '失敗'})`);
  return { success, roll: r, total, log };
}

// ============================================================
// 鉤縄解除 (Ungrappling) — 1d6: 1-2で解除成功
// ============================================================
function rollUngrappling(ship, target, opts) {
  const log = [];
  if (ship.side === target.side) {
    return { success: true, auto: true, log: ['友軍同士: 自動解除'] };
  }
  const r = rollD6();
  const success = r <= 2;
  log.push(`1d6=${r} (${success ? '解除成功(1-2)' : '失敗'})`);
  return { success, roll: r, total: r, log };
}

// ============================================================
// 白兵戦強度計算 (Crew Melee Strength)
// ============================================================
// CREW_MELEE_STRENGTH: { elite:{obp,dbp_raked,dbp}, ... }
// crewSections: OBP/DBP に割り当てる乗員セクション数
// partyType: 'obp' | 'dbp' | 'dbp_raked'
function computeMeleeStrength(ship, crewSections, partyType) {
  if (!ship || !CREW_MELEE_STRENGTH) return 0;
  const q = ship.crewQuality || 'average';
  const entry = CREW_MELEE_STRENGTH[q];
  if (!entry) return 0;
  const perSection = entry[partyType] || 0;
  return perSection * crewSections;
}

// ============================================================
// 白兵戦解決 (Melee Resolution)
// 両軍の合計強度を計算 → 1d6でMELEE_RESOLUTION参照 → 相手に損害
// ============================================================
// partyA, partyB: { ship, sections, partyType }
// 乗員セクションを損失（能1=index 0 から消去）
function applyCrewLossSection(ship, n) {
  if (!ship.crew || !Array.isArray(ship.crew.abilities) || n <= 0) return;
  let removed = 0;
  for (let i = 0; i < ship.crew.abilities.length && removed < n; i++) {
    while (removed < n && ship.crew.abilities[i] > 0) {
      ship.crew.abilities[i]--;
      removed++;
    }
  }
  if (removed > 0 && typeof state !== 'undefined' && state) {
    state.damageSeqCounter = (state.damageSeqCounter || 0) + 1;
    ship.damageSeq = state.damageSeqCounter;
  }
}
