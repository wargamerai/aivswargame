// wsm_boarding.js — WSM 接舷・白兵戦処理
// 絡み判定 / 鉤縄判定 / 白兵戦解決
// 前提: chartsdata.js (FOULING_TABLES, CREW_MELEE_STRENGTH, MELEE_RESOLUTION)

// ============================================================
// 絡み判定 (Fouling)
// 2艦が隣接していて、2d6 + 修正子 ≥ 10 で絡み成立
// ============================================================
function rollFouling(shipA, shipB, wind) {
  const log = [];
  const r = roll2D6();
  let mod = 0;

  function crewMod(ship, isMe) {
    const q = ship.crewQuality || 'average';
    if (q === 'crack')   { mod += isMe ? -1 : -1; log.push(`${ship.name}熟練-1`); }
    else if (q === 'elite'){ mod += isMe ? -2 : -2; log.push(`${ship.name}精鋭-2`); }
    else if (q === 'green'){ mod += isMe ? +1 : +1; log.push(`${ship.name}新兵+1`); }
    else if (q === 'poor') { mod += isMe ? +2 : +2; log.push(`${ship.name}最低+2`); }
  }
  crewMod(shipA, true);
  crewMod(shipB, false);
  if (shipA.side === shipB.side) { mod -= 1; log.push('友軍同士-1'); }
  // 宣言移動力3以上: 実装省略（プロット未実装のため）
  if (shipA.sailState === 'full') { mod -= 1; log.push(`${shipA.name}全帆-1`); }
  if (shipB.sailState === 'full') { mod -= 1; log.push(`${shipB.name}全帆-1`); }
  if (wind?.velocity === 6) { mod -= 2; log.push('風速6: -2'); }

  const total = r + mod;
  const success = r === 12 || total >= 10;  // 12は常に絡み
  log.unshift(`2d6=${r} +修正${mod} = ${total} (${success ? '絡み成立' : '絡まず'})`);
  return { success, roll: r, total, log };
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
// 鉤縄判定 (Grappling)
// ============================================================
function rollGrappling(attacker, target, opts) {
  const log = [];
  const r = roll2D6();
  let mod = 0;
  // 乗員品質差（攻撃側視点）
  const qOrder = { poor:0, green:1, average:2, crack:3, elite:4 };
  const qa = qOrder[attacker.crewQuality || 'average'] ?? 2;
  const qt = qOrder[target.crewQuality || 'average'] ?? 2;
  const diff = qa - qt;
  if (diff !== 0) { mod += diff; log.push(`品質差${diff > 0 ? '+' : ''}${diff}`); }
  if (attacker.crewQuality === 'elite') { mod += 2; log.push('精鋭+2'); }
  if (attacker.side === target.side) { mod += 4; log.push('友軍+4'); }
  if (!(opts?.meleeInProgress)) { mod += 1; log.push('白兵戦未進行+1'); }
  if (target.stopped || opts?.targetMotionless) { mod += 1; log.push('停止相手+1'); }
  if (opts?.windVelocity === 1) { mod += 1; log.push('風速1: +1'); }
  if (opts?.meleeInProgress) { mod -= 6; log.push('白兵戦中-6'); }

  const total = r + mod;
  const success = r === 12 || total >= 10;
  log.unshift(`2d6=${r} +修正${mod} = ${total} (${success ? '鉤縄成立' : '失敗'})`);
  return { success, roll: r, total, log };
}

// ============================================================
// 鉤縄解除 (Ungrappling)
// ============================================================
function rollUngrappling(ship, target, opts) {
  const log = [];
  // 友軍同士なら自動成功
  if (ship.side === target.side) {
    return { success: true, auto: true, log: ['友軍同士: 自動解除'] };
  }
  const r = roll2D6();
  let mod = 0;
  if (ship.crewQuality === 'crack') { mod += 1; log.push('熟練+1'); }
  if (ship.crewQuality === 'elite') { mod += 2; log.push('精鋭+2'); }
  if (opts?.windVelocity === 6) { mod += 1; log.push('風速6: +1'); }
  if (opts?.windVelocity === 5) { mod -= 1; log.push('風速5: -1'); }
  if (opts?.targetMoveNoted && opts.targetMoveNoted > 1) {
    const d = -(opts.targetMoveNoted - 1);
    mod += d; log.push(`相手移動宣言${d}`);
  }
  const total = r + mod;
  const success = r === 12 || total >= 10;
  log.unshift(`2d6=${r} +修正${mod} = ${total} (${success ? '解除成功' : '失敗'})`);
  return { success, roll: r, total, log };
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
// 白兵戦解決 (Melee Resolution) - 12.3
// 12.3.3: 3ラウンド/ターン、決着しなければ翌ターン継続
// partyA, partyB: { ship, sections, partyType: 'obp'|'dbp'|'dbp_raked' }
// ============================================================
function resolveMelee(partyA, partyB) {
  const log = [];
  let winner = null;
  let rounds = 0;

  for (let round = 1; round <= 3; round++) {
    // 強度が0なら終了
    const sA = (partyA.ship.crew?.L?.remain||0) + (partyA.ship.crew?.R?.remain||0);
    const sB = (partyB.ship.crew?.L?.remain||0) + (partyB.ship.crew?.R?.remain||0);
    if (sA <= 0 || sB <= 0) break;
    rounds = round;
    log.push(`━ ラウンド${round} ━`);
    const strengthA = computeMeleeStrength(partyA.ship, partyA.sections, partyA.partyType);
    const strengthB = computeMeleeStrength(partyB.ship, partyB.sections, partyB.partyType);
    log.push(`${partyA.ship.name}強度=${strengthA}, ${partyB.ship.name}強度=${strengthB}`);

    const dmgToB = rollDamageMelee(strengthA);
    const dmgToA = rollDamageMelee(strengthB);
    log.push(`${partyA.ship.name}→${partyB.ship.name}: 1d6=${dmgToB.die}(${dmgToB.band}) 損害${dmgToB.damage}セクション`);
    log.push(`${partyB.ship.name}→${partyA.ship.name}: 1d6=${dmgToA.die}(${dmgToA.band}) 損害${dmgToA.damage}セクション`);

    // 12.3.2: 最下位乗員セクションから消去
    applyCrewLossSection(partyB.ship, dmgToB.damage);
    applyCrewLossSection(partyA.ship, dmgToA.damage);

    // 12.3.3: 3倍差で勝敗確定
    const postA = computeMeleeStrength(partyA.ship, partyA.sections, partyA.partyType);
    const postB = computeMeleeStrength(partyB.ship, partyB.sections, partyB.partyType);
    if (postA >= postB * 3 && postB > 0) { winner = partyA.ship; break; }
    if (postB >= postA * 3 && postA > 0) { winner = partyB.ship; break; }
    if (postA > 0 && postB === 0) { winner = partyA.ship; break; }
    if (postB > 0 && postA === 0) { winner = partyB.ship; break; }
  }

  if (winner) {
    const loser = winner === partyA.ship ? partyB.ship : partyA.ship;
    capturePrize(winner, loser, log);
  } else {
    // 決着せず: 翌ターン継続フラグ
    partyA.ship._meleeContinuing = true;
    partyB.ship._meleeContinuing = true;
    log.push('🔁 3ラウンド決着せず → 次ターン継続');
  }

  return { winner, rounds, log };
}

// 1d6でMELEE_RESOLUTION参照
function rollDamageMelee(ownStrength) {
  const die = rollD6();
  const bands = ['1-10','11-20','21-30','31-40','41-50','51-60','61-70','71-80','81+'];
  let bandIdx;
  if (ownStrength >= 81) bandIdx = 8;
  else bandIdx = Math.min(7, Math.floor((ownStrength - 1) / 10));
  const dieBand = die <= 2 ? '1-2' : die <= 4 ? '3-4' : '5-6';
  const row = (typeof MELEE_RESOLUTION !== 'undefined') ? MELEE_RESOLUTION.find(r => r.die === dieBand) : null;
  const dmg = row ? (row[bands[bandIdx]] || 0) : 0;
  return { die, band: bands[bandIdx], damage: dmg };
}

// ============================================================
// 捕獲処理 12.4
// ============================================================
function capturePrize(winner, loser, log) {
  loser.status = 'struck';
  loser.capturedBy = winner.side;
  // 12.4.10: 拿捕艦は拿捕要員の品質を採用
  loser.originalCrewQuality = loser.crewQuality;
  loser.crewQuality = winner.crewQuality;
  // 拿捕要員記録: winner側から一定数を拿捕要員として配置（簡略: 勝者OBPの半分）
  const prizeCount = Math.max(1, Math.floor(((winner.crew?.L?.remain||0) + (winner.crew?.R?.remain||0)) / 4));
  loser.prizeCrew = {
    fromShip: winner.name,
    side: winner.side,
    quality: winner.crewQuality,
    sections: prizeCount,
  };
  loser.prisoners = ((loser.crew?.L?.remain||0) + (loser.crew?.R?.remain||0));
  // 12.4.5: 拿捕艦の砲撃は-2テーブル
  loser.prizeCrewFiringPenalty = -2;
  log.push(`🏴 ${loser.name} 拿捕成立（${winner.name}の白兵戦勝利、拿捕要員${prizeCount}・捕虜${loser.prisoners}）`);
}

// ============================================================
// 12.4.9: 拿捕要員と捕虜の比率チェック（1:6）
// 下回ると捕虜が蜂起、艦が元の所有者に戻る
// ============================================================
function checkPrizeCrewRatio(ship, log) {
  if (!ship.prizeCrew || ship.prisoners == null) return;
  if (ship.prizeCrew.sections <= 0 || ship.prisoners / ship.prizeCrew.sections > 6) {
    log.push(`⚠️ ${ship.name}: 捕虜比率崩壊（${ship.prisoners}/${ship.prizeCrew.sections}）→ 元所有者へ復帰`);
    ship.capturedBy = null;
    ship.crewQuality = ship.originalCrewQuality || ship.crewQuality;
    delete ship.prizeCrew;
    delete ship.prisoners;
    delete ship.prizeCrewFiringPenalty;
    delete ship.originalCrewQuality;
    ship.status = 'ok';  // 元所有者が復活
  }
}

// 乗員セクションを損失（最小番号セクションから）
function applyCrewLossSection(ship, n) {
  if (!ship.crew || n <= 0) return;
  // L/R 交互に均等消去
  for (let i = 0; i < n; i++) {
    const l = ship.crew.L?.remain || 0;
    const r = ship.crew.R?.remain || 0;
    if (l === 0 && r === 0) break;
    // 多い側から減らす
    if (l >= r) ship.crew.L.remain--;
    else ship.crew.R.remain--;
  }
}

// ============================================================
// 白兵戦コーディネータ
// 艦A・艦Bが鉤縄で接舷中、両者が乗員セクションをOBP/DBPに割り当てて白兵戦
// ============================================================
function initiateBoardingCombat(shipA, shipB, assignA, assignB, wsmCtx) {
  const log = [];
  log.push(`🗡 白兵戦: ${shipA.name}(${shipA.crewQuality}) vs ${shipB.name}(${shipB.crewQuality})`);

  // 鉤縄成立チェック
  const grapplingA = (shipA.grappledWith || []).includes(shipB.name);
  if (!grapplingA) {
    log.push('⚠ 鉤縄未成立、白兵戦不可');
    return { success: false, log };
  }

  // OBP/DBP 編成
  const partyA = { ship: shipA, sections: assignA.obp || 0, partyType: 'obp' };
  const partyB = { ship: shipB, sections: assignB.dbp || 0, partyType: wsmCtx?.bRaked ? 'dbp_raked' : 'dbp' };

  const result = resolveMelee(partyA, partyB);
  result.log.forEach(l => log.push(l));
  return { success: true, log, result };
}
