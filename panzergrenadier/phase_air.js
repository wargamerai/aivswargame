// ===== 航空攻撃 (phase_air.js) =====
// 依存: G, testUnits, getHexTerrain, getTerrainFireMod, getHexNeighbors,
//   getFireCombatResult, resolveDamage, applyDamage, dummyMap, removeAllDummies,
//   checkLeaderCasualty, checkLeaderOnStackEliminated, addLog, FACILITY_MAP, toHexId

// ===== 航空攻撃 (ルール10) =====

// --- 戦闘爆撃機発見表 (10-2-(4)) ---
const DISCOVERY_TABLE = {
  'p': 8,    // 平地: 1-8で発見
  'r': 6,    // 荒地: 1-6
  't': 3,    // 町: 1-3
  'w': 1,    // 林: 1
  'f': 1,    // 森: 1
  'c': 1,    // 市街地: 1
};

// 航空攻撃状態管理
let airState = {
  heavyBombers: [],       // [{id, fp, uses, usedCount, targetHexId}]
  fighterBombers: [],     // [{id, name, side, fp, uses, usedCount, usedThisTurn}]
  heavyBomberTargets: {}, // 重爆目標記録: {hexId: true}
};

// シナリオから航空攻撃を初期化
function initAirSupport(scenario) {
  airState.heavyBombers = (scenario.heavyBombers || []).map((hb, i) => ({
    id: 'hb_' + i,
    fp: hb.fp,
    uses: hb.uses || 1,     // シナリオ指定の使用回数
    usedCount: 0,            // 使用済み回数
    targetHexId: null,
  }));
  airState.fighterBombers = (scenario.fighterBombers || []).map((fb, i) => ({
    id: 'fb_' + i,
    name: fb.name || `戦闘爆撃機${i + 1}`,
    side: fb.side || 'allied',
    fp: fb.fp,
    uses: fb.uses || 1,     // シナリオ指定の使用回数（全ゲーム通算）
    usedCount: 0,            // 使用済み回数（全ゲーム通算）
    usedThisTurn: false,     // このターンで使用済みか（帰投判定用）
  }));
  airState.heavyBomberTargets = {};
}

// --- 重爆 (10-1) ---

// 重爆の目標ヘクスを設定（ゲーム開始前）
function setHeavyBomberTarget(bomberId, hexId) {
  const hb = airState.heavyBombers.find(b => b.id === bomberId);
  if (!hb) return { ok: false, msg: '重爆が見つからない' };
  if (hb.usedCount >= hb.uses) return { ok: false, msg: `この重爆は使用回数上限(${hb.uses}回)に達した` };
  // 同一ヘクスに2つ以上使用不可 (10-1-(4))
  const alreadyTargeted = airState.heavyBombers.some(b => b.id !== bomberId && b.targetHexId === hexId);
  if (alreadyTargeted) return { ok: false, msg: '同一ヘクスに2つ以上の重爆は使用できない' };
  hb.targetHexId = hexId;
  return { ok: true };
}

// 重爆を実行
function executeHeavyBomber(bomberId) {
  const hb = airState.heavyBombers.find(b => b.id === bomberId);
  if (!hb || !hb.targetHexId || hb.usedCount >= hb.uses) return null;

  const results = [];
  const centerHex = hb.targetHexId;
  const centerCol = parseInt(centerHex.substring(0, 2)) - 1;
  const centerRow = parseInt(centerHex.substring(2, 4)) - 1;

  // 陣地チェック（中心ヘクス）
  const centerFort = testUnits.find(u =>
    (u.hexId || toHexId(u.col, u.row)) === centerHex && u.type === 'fortification' && u.status !== 'eliminated'
  );
  let centerFortBlocks = false;
  if (centerFort) {
    const fortRoll = Math.floor(Math.random() * 10);
    if (fortRoll >= 4) { if (typeof downgradeFort === 'function') downgradeFort(centerFort); else centerFort.status = 'eliminated'; }
    else if (fortRoll === 3) { if (centerFort.status === 'ok') centerFort.status = 'dd'; else { if (typeof downgradeFort === 'function') downgradeFort(centerFort); else centerFort.status = 'eliminated'; } }
    else if (fortRoll >= 1) { if (centerFort.status === 'ok') centerFort.status = 'd'; else if (centerFort.status === 'd') centerFort.status = 'dd'; else { if (typeof downgradeFort === 'function') downgradeFort(centerFort); else centerFort.status = 'eliminated'; } }
    const fl = centerFort.status === 'eliminated' ? '破壊' : 'D/DD';
    addLog('air', `重爆→陣地判定(${centerHex}): D10:${fortRoll} → ${fl}`);
    if (centerFort.status !== 'eliminated') centerFortBlocks = true;
  }

  // 中心ヘクス: フルFP
  const centerTargets = testUnits.filter(u => {
    const hid = toHexId(u.col, u.row);
    return hid === centerHex && u.status !== 'eliminated' && u.type !== 'fortification';
  });
  if (!centerFortBlocks) centerTargets.forEach(u => {
    const fp = (u.type === 'T' || u.type === 'AC') ? hb.fp : hb.fp; // 対装甲/非装甲は同じFPの場合が多い
    const terrainMod = getTerrainFireMod(centerHex);
    const dice = Math.floor(Math.random() * 10);
    const modDice = dice + terrainMod;
    const fpIdx = getFPColumnIndex(fp);
    const dmgLevel = getFireCombatResult(fpIdx, modDice);
    const dmgResult = resolveDamage(dmgLevel, u.def);
    results.push({ unit: u, hex: centerHex, fp, dice, modDice, dmgLevel, dmgResult, center: true });
    applyDamage(u, dmgResult);
  });

  // 周囲6ヘクス: 火力½ (10-1-(3))
  const neighbors = getHexNeighbors(centerCol, centerRow);
  neighbors.forEach(n => {
    const nHexId = toHexId(n.col, n.row);
    const halfFP = Math.max(1, Math.floor(hb.fp / 2));
    // 周囲ヘクスの陣地チェック
    const nFort = testUnits.find(u =>
      (u.hexId || toHexId(u.col, u.row)) === nHexId && u.type === 'fortification' && u.status !== 'eliminated'
    );
    let nFortBlocks = false;
    if (nFort) {
      const fRoll = Math.floor(Math.random() * 10);
      if (fRoll >= 4) { if (typeof downgradeFort === 'function') downgradeFort(nFort); else nFort.status = 'eliminated'; }
      else if (fRoll === 3) { if (nFort.status === 'ok') nFort.status = 'dd'; else { if (typeof downgradeFort === 'function') downgradeFort(nFort); else nFort.status = 'eliminated'; } }
      else if (fRoll >= 1) { if (nFort.status === 'ok') nFort.status = 'd'; else if (nFort.status === 'd') nFort.status = 'dd'; else { if (typeof downgradeFort === 'function') downgradeFort(nFort); else nFort.status = 'eliminated'; } }
      addLog('air', `重爆→陣地判定(${nHexId}): D10:${fRoll} → ${nFort.status === 'eliminated' ? '破壊' : 'D/DD'}`);
      if (nFort.status !== 'eliminated') nFortBlocks = true;
    }
    const nTargets = testUnits.filter(u => {
      const hid = toHexId(u.col, u.row);
      return hid === nHexId && u.status !== 'eliminated' && u.type !== 'fortification';
    });
    if (!nFortBlocks) nTargets.forEach(u => {
      const terrainMod = getTerrainFireMod(nHexId);
      const dice = Math.floor(Math.random() * 10);
      const modDice = dice + terrainMod;
      const fpIdx = getFPColumnIndex(halfFP);
      const dmgLevel = getFireCombatResult(fpIdx, modDice);
      const dmgResult = resolveDamage(dmgLevel, u.def);
      results.push({ unit: u, hex: nHexId, fp: halfFP, dice, modDice, dmgLevel, dmgResult, center: false });
      applyDamage(u, dmgResult);
    });
  });

  // I.P.マーカー設置 (10-1-(5))
  // TODO: I.P.マーカーの管理システムと連携
  airState.heavyBomberTargets[centerHex] = true;

  hb.usedCount++;
  addLog('air', `重爆: ${centerHex} (FP${hb.fp}, ${hb.usedCount}/${hb.uses}回使用) → ${results.length}ユニットに判定`);
  return results;
}

// --- 戦闘爆撃機 (10-2) ---

// 戦闘爆撃機で視認済みユニットを攻撃
function fighterBomberAttack(fbId, targetUnit) {
  const fb = airState.fighterBombers.find(f => f.id === fbId);
  if (!fb) return { ok: false, msg: '戦闘爆撃機が見つからない' };
  if (fb.usedCount >= fb.uses) return { ok: false, msg: `この戦闘爆撃機は使用回数上限(${fb.uses}回)に達した` };
  if (fb.usedThisTurn) return { ok: false, msg: 'この戦闘爆撃機は今ターン帰投済み' };
  if (targetUnit.status === 'eliminated') return { ok: false, msg: '対象は壊滅済み' };

  const hexId = toHexId(targetUnit.col, targetUnit.row);

  // 陣地チェック
  const fort = testUnits.find(u =>
    (u.hexId || toHexId(u.col, u.row)) === hexId && u.type === 'fortification' && u.status !== 'eliminated'
  );
  if (fort) {
    const fortRoll = Math.floor(Math.random() * 10);
    if (fortRoll >= 4) { if (typeof downgradeFort === 'function') downgradeFort(fort); else fort.status = 'eliminated'; }
    else if (fortRoll === 3) { if (fort.status === 'ok') fort.status = 'dd'; else { if (typeof downgradeFort === 'function') downgradeFort(fort); else fort.status = 'eliminated'; } }
    else if (fortRoll >= 1) { if (fort.status === 'ok') fort.status = 'd'; else if (fort.status === 'd') fort.status = 'dd'; else { if (typeof downgradeFort === 'function') downgradeFort(fort); else fort.status = 'eliminated'; } }
    addLog('air', `戦闘爆撃機→陣地判定(${hexId}): D10:${fortRoll} → ${fort.status === 'eliminated' ? '破壊' : 'D/DD'}`);
    if (fort.status !== 'eliminated') {
      addLog('air', `陣地健在 → ユニットへの損害なし`);
      fb.usedCount++;
      fb.usedThisTurn = true;
      return { ok: true, dice: fortRoll, modDice: fortRoll, fp: fb.fp, dmgLevel: 0, dmgResult: 'none', fortBlocked: true };
    }
  }

  const terrainMod = getTerrainFireMod(hexId);
  const dice = Math.floor(Math.random() * 10);
  const modDice = dice + terrainMod;
  const fp = fb.fp;
  const fpIdx = getFPColumnIndex(fp);
  const dmgLevel = getFireCombatResult(fpIdx, modDice);
  const dmgResult = resolveDamage(dmgLevel, targetUnit.def);
  applyDamage(targetUnit, dmgResult);

  fb.usedCount++;
  fb.usedThisTurn = true; // 攻撃後は帰投 (10-2-(6))
  addLog('air', `戦闘爆撃機 ${fb.name}: ${targetUnit.name} (FP${fp}, ダイス${dice}${terrainMod >= 0 ? '+' : ''}${terrainMod}=${modDice}) → ${dmgResult} [${fb.usedCount}/${fb.uses}回使用]`);
  return { ok: true, dice, modDice, fp, dmgLevel, dmgResult };
}

// 戦闘爆撃機で未視認ユニットを発見→攻撃 (10-2-(4))
function fighterBomberDiscover(fbId, targetHexId) {
  const fb = airState.fighterBombers.find(f => f.id === fbId);
  if (!fb) return { ok: false, msg: '戦闘爆撃機が見つからない' };
  if (fb.usedCount >= fb.uses) return { ok: false, msg: `この戦闘爆撃機は使用回数上限(${fb.uses}回)に達した` };
  if (fb.usedThisTurn) return { ok: false, msg: 'この戦闘爆撃機は今ターン帰投済み' };

  const terrain = getHexTerrain(targetHexId);
  const threshold = DISCOVERY_TABLE[terrain] || 1;
  const dice = Math.floor(Math.random() * 10);
  const discovered = (dice + 1) <= threshold; // ダイス0=1, ダイス9=10

  if (!discovered) {
    fb.usedThisTurn = true; // 失敗→今ターン帰投 (10-2-(6))
    // 発見失敗は使用回数を消費しない（攻撃していないので）
    addLog('air', `戦闘爆撃機 ${fb.name}: ${targetHexId} 発見失敗 (ダイス${dice + 1}, 必要${threshold}以下) → 帰投`);
    return { ok: true, discovered: false, dice: dice + 1, threshold };
  }

  // 発見成功 → ダミー全除去
  if (dummyMap[targetHexId]) {
    addLog('air', `戦闘爆撃機発見: ${targetHexId} ダミー${dummyMap[targetHexId].count}枚除去`);
    delete dummyMap[targetHexId];
  }

  addLog('air', `戦闘爆撃機 ${fb.name}: ${targetHexId} 発見成功 (ダイス${dice + 1}, 必要${threshold}以下)`);
  return { ok: true, discovered: true, dice: dice + 1, threshold };
  // 発見後、fighterBomberAttack()で攻撃を実行する
}

// ターン終了時に戦闘爆撃機の使用済みフラグをリセット
function resetAirSupport() {
  // ターンごとの帰投フラグだけリセット（通算使用回数はそのまま）
  airState.fighterBombers.forEach(fb => { fb.usedThisTurn = false; });
}
