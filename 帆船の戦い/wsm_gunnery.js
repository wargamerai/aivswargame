// wsm_gunnery.js — WSM 砲撃処理（射界・Rake・HDT→Hit Table）
// 前提: hub.html の hexNeighbor, getSternHex, hexDist, DIR_OPPOSITE 等
// MUNITION_RANGE は hittables.js で定義済み

// ============================================================
// 射界（Arc）判定 — 2ヘクス艦の5分割
// ============================================================
// 艦首方向(ship.dir)を基準に:
//   bow = 艦首方向 (rake潜在対象が艦首前方)
//   stern = 艦尾方向 (rake潜在対象が艦尾後方)
//   port = 左舷（艦首から見て左、CCW 60°〜120°側）
//   stbd = 右舷（艦首から見て右、CW 60°〜120°側）
//   none = 死角（射界外）

// numpad方位を時計回りindex化: 9=NE(0), 6=E(1), 3=SE(2), 1=SW(3), 4=W(4), 7=NW(5)
// flat-top 時計回り N→NE→SE→S→SW→NW (numpad)
const DIR_CW_ORDER = [8, 9, 3, 2, 1, 7];

function dirToIdx(d) { return DIR_CW_ORDER.indexOf(d); }
function idxToDir(i) { return DIR_CW_ORDER[((i % 6) + 6) % 6]; }

// 艦Aから艦B（または座標）への方位（最寄りの6方位）
function bearingToHex(fromCol, fromRow, toCol, toRow) {
  // 各 numpad 方位について hexNeighbor を取って、目標までの距離が最小の方位を返す
  const dirs = [8, 9, 3, 2, 1, 7];
  let best = 9, bestDist = Infinity;
  for (const d of dirs) {
    const n = (typeof hexNeighbor === 'function') ? hexNeighbor(fromCol, fromRow, d) : null;
    if (!n) continue;
    const dist = (typeof hexDist === 'function') ? hexDist(n.col, n.row, toCol, toRow) : Math.hypot(n.col - toCol, n.row - toRow);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

// 射界判定: firer から target が どのarcにあるか
// ARC_TEMPLATE を唯一の真実源とする。field 1/2/3 = 舷側砲可 → port/stbd。他は 'none'。
function getArcToTarget(firer, target) {
  if (typeof getArcFieldInfo !== 'function') return 'none';
  const fStern = (typeof getSternHex === 'function') ? getSternHex(firer) : null;
  const tStern = (target && target.dir != null && typeof getSternHex === 'function') ? getSternHex(target) : null;

  const firerHexes = [{ col: firer.col, row: firer.row, dir: firer.dir }];
  if (fStern) firerHexes.push({ col: fStern.col, row: fStern.row, dir: firer.dir });
  const targetHexes = [{ col: target.col, row: target.row }];
  if (tStern) targetHexes.push({ col: tStern.col, row: tStern.row });

  for (const fh of firerHexes) {
    for (const th of targetHexes) {
      const info = getArcFieldInfo(fh, th);
      if (typeof debugLog === 'function') {
        debugLog(`[getArcToTarget] firer@(${fh.col},${fh.row})dir${fh.dir} → target@(${th.col},${th.row}) field=${info.field} side=${info.side||'-'}`);
      }
      if (BOW_GUN_ARCS.includes(info.field) || STERN_GUN_ARCS.includes(info.field)) {
        return info.side;
      }
    }
  }
  return 'none';
}

// 艦の中心点（簡易: bowとsternの平均）
function avgPos(ship) {
  const stern = getSternHex(ship);
  if (!stern) return { col: ship.col, row: ship.row };
  return {
    col: Math.round((ship.col + stern.col) / 2),
    row: Math.round((ship.row + stern.row) / 2)
  };
}

// ============================================================
// Rake 判定 — 目標の艦首/艦尾から正面に攻撃が当たる場合
// ============================================================
function isRaking(firer, target) {
  // firerからtargetへの方位
  const fAvg = avgPos(firer);
  const bear = bearingToHex(fAvg.col, fAvg.row, target.col, target.row);
  // targetの艦首方向と一致 → bow rake
  // targetの艦尾方向と一致 → stern rake
  if (bear === target.dir) return 'bow_rake';        // targetの艦首側
  if (bear === DIR_OPPOSITE[target.dir]) return 'stern_rake'; // targetの艦尾側
  return null;
}

// ============================================================
// HDT — Hit Determination Table
// 砲数 × 射程 → Hit Table番号
// ============================================================
// 行（砲数）: 1-3 / 4-6 / 7-9 / 10-12 / 13-15 / 16-18 / 19-21 / 22-24 / 25+
// 列（射程hex）: 1 / 2 / 3 / 4 / 5,6 / 7-10
// セル値: "X (Y)" — Y は縦射(rake)時
const HDT_TABLE = [
  // [numGunsRange, [r1, r2, r3, r4, r5_6, r7_10]]
  // 各セルは {normal, rake}
  { guns: [1,3],    table: [{n:1,r:2},  {n:0,r:1},  {n:-1,r:0}, {n:-2,r:-1},{n:-3,r:-2},{n:-4,r:-3}] },
  { guns: [4,6],    table: [{n:1,r:2},  {n:1,r:2},  {n:0,r:1},  {n:-1,r:0}, {n:-2,r:-1},{n:-3,r:-2}] },
  { guns: [7,9],    table: [{n:2,r:3},  {n:1,r:2},  {n:0,r:1},  {n:-1,r:0}, {n:-2,r:-1},{n:-3,r:-2}] },
  { guns: [10,12],  table: [{n:2,r:4},  {n:2,r:3},  {n:1,r:2},  {n:0,r:1},  {n:-1,r:0}, {n:-2,r:-1}] },
  { guns: [13,15],  table: [{n:3,r:5},  {n:2,r:4},  {n:1,r:3},  {n:0,r:2},  {n:-1,r:1}, {n:-2,r:0}] },
  { guns: [16,18],  table: [{n:3,r:6},  {n:3,r:5},  {n:2,r:4},  {n:1,r:3},  {n:0,r:2},  {n:-1,r:1}] },
  { guns: [19,21],  table: [{n:4,r:7},  {n:3,r:6},  {n:2,r:5},  {n:1,r:4},  {n:0,r:3},  {n:-1,r:2}] },
  { guns: [22,24],  table: [{n:4,r:8},  {n:4,r:7},  {n:3,r:6},  {n:2,r:5},  {n:1,r:4},  {n:0,r:3}] },
  { guns: [25,99],  table: [{n:5,r:9},  {n:4,r:8},  {n:3,r:7},  {n:2,r:6},  {n:1,r:5},  {n:0,r:4}] },
];

function lookupHDT(numGuns, rangeHex, isRake) {
  // 射程→列index
  let colIdx;
  if (rangeHex <= 1) colIdx = 0;
  else if (rangeHex === 2) colIdx = 1;
  else if (rangeHex === 3) colIdx = 2;
  else if (rangeHex === 4) colIdx = 3;
  else if (rangeHex <= 6) colIdx = 4;
  else if (rangeHex <= 10) colIdx = 5;
  else return null;  // 射程外

  // 砲数→行
  for (const row of HDT_TABLE) {
    if (numGuns >= row.guns[0] && numGuns <= row.guns[1]) {
      const cell = row.table[colIdx];
      return isRake ? cell.r : cell.n;
    }
  }
  return 0;
}

// ============================================================
// Hit Table 参照（hittables.js の HIT_TABLES を使用）
// ============================================================
// Hit Table番号 + 1d6 + 損害種(hull/rigging) → 損害コード文字列
// 例: "H-G" → 船体1+砲1、"2H-G*" → 船体2+砲1+クリティカル
function lookupHitTable(tableNum, die, damageType) {
  if (tableNum < 0) tableNum = 0;
  if (tableNum > 10) tableNum = 10;
  const tbl = HIT_TABLES?.[String(tableNum)];
  if (!tbl) return '0';
  const arr = damageType === 'rigging' ? tbl.rigging : tbl.hull;
  const idx = Math.max(1, Math.min(6, die)) - 1;
  return arr[idx] || '0';
}

// 損害コード解析: "2H-G*" → [{type:'H',n:2},{type:'G',n:1},{type:'crit'}]
function parseDamageCode(code) {
  if (!code || code === '0' || code === '-') return [];
  const result = [];
  let s = String(code).trim();
  // "(R)" や "(2R)" の括弧部分は別途扱い（Full Sail/Rake時の追加）
  const extras = [];
  s = s.replace(/\(([^)]+)\)/g, (_, m) => { extras.push(m); return ''; });
  // クリティカル "*"
  const hasCrit = s.includes('*');
  s = s.replace(/\*/g, '');
  // ハイフン区切りで損害ごと
  const parts = s.split('-').map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(\d*)([HGRC])$/);
    if (m) {
      const n = m[1] ? parseInt(m[1]) : 1;
      result.push({ type: m[2], n });
    }
  }
  if (hasCrit) result.push({ type: 'crit' });
  // extras（括弧内）も解析して付加情報として
  for (const e of extras) {
    const em = e.trim().match(/^(\d*)([HGRC])$/);
    if (em) {
      const n = em[1] ? parseInt(em[1]) : 1;
      result.push({ type: em[2], n, extra: true });  // extra=Full Sail/Rake時のみ
    }
  }
  return result;
}

// ============================================================
// 砲撃修正子計算
// ============================================================
function calcGunneryModifiers(firer, target, opts) {
  const mods = [];
  let total = 0;
  // 全帆展開（Full Sail）射撃ペナルティ
  if (firer.sailState === 'full') { mods.push({label:'全帆-1', v:-1}); total += -1; }
  // 火災中目標
  if (target.onFire) { mods.push({label:'火災-1', v:-1}); total += -1; }
  // 投錨中
  if (firer.anchored) { mods.push({label:'錨泊+1', v:+1}); total += +1; }
  // 乗員品質
  const cq = firer.crewQuality || 'average';
  const cqMod = { elite: +2, crack: +1, average: 0, green: -1, poor: -2 }[cq] || 0;
  if (cqMod !== 0) { mods.push({label:`${cq}${cqMod>0?'+':''}${cqMod}`, v:cqMod}); total += cqMod; }
  // クリティカル: 指揮所被弾（後フェイズで実装）
  if (firer.critHitMod) { mods.push({label:`指揮所${firer.critHitMod>0?'+':''}${firer.critHitMod}`, v:firer.critHitMod}); total += firer.critHitMod; }
  return { total, mods };
}

// ============================================================
// 砲撃解決（メインエントリ）
// ============================================================
// firer, target: ship オブジェクト
// arc: 'port' | 'stbd' | 'bow' | 'stern' （撃つ舷）
// ammo: 'round' | 'chain' | 'double' | 'grape' | 'canister'
// dmgType: 'hull' | 'rigging' （省略時は弾種から自動決定）
function resolveGunnery(firer, target, arc, ammo, dmgType) {
  ammo = ammo || 'round';
  const log = [];
  // 射程: 両艦の bow/stern ヘクスの最短距離
  const fHexes = [{col:firer.col,row:firer.row}];
  const fStern = getSternHex(firer); if (fStern) fHexes.push(fStern);
  const tHexes2 = [{col:target.col,row:target.row}];
  const tStern2 = getSternHex(target); if (tStern2) tHexes2.push(tStern2);
  let range = Infinity;
  for (const f of fHexes) for (const t of tHexes2) {
    const d = hexDist(f.col, f.row, t.col, t.row);
    if (d < range) range = d;
  }

  // 弾種射程チェック
  const maxR = MUNITION_RANGE?.[ammo.toUpperCase() === 'ROUND' ? 'ROUND_SHOT' : ammo.toUpperCase() + '_SHOT'] || 10;
  if (range > maxR) {
    log.push(`射程外: ${range}hex > ${maxR}`);
    return { hit: false, log };
  }

  // 砲数算出: 舷側のみ。field番号で fore/aft/全舷 を選択
  let numGuns = 0;
  let firingPortion = 'full';  // full | fore | aft
  if (arc === 'port' || arc === 'stbd') {
    const side = arc === 'port' ? 'L' : 'R';
    const gunData = firer.broadsideGuns?.[side];
    // 目標の field を判定して fore/aft を選択
    let field = 0;
    if (typeof getArcFieldNumber === 'function') {
      const tStern = (typeof getSternHex === 'function') ? getSternHex(target) : null;
      const tHexes = [{ col: target.col, row: target.row }];
      if (tStern) tHexes.push(tStern);
      for (const h of tHexes) {
        const f = getArcFieldNumber(firer, h);
        if (f >= 1 && f <= 3) { field = f; break; }
        if (f !== 0 && field === 0) field = f;
      }
    }
    if (field === 5) {
      numGuns = gunData?.foreRemain || 0;
      firingPortion = 'fore';
    } else if (field === 4) {
      numGuns = gunData?.aftRemain || 0;
      firingPortion = 'aft';
    } else {
      // field 1/2/3: 全舷
      numGuns = gunData?.remain || 0;
      firingPortion = 'full';
    }
    // カロネード: 射程2hex以内なら同舷カロネードを加算（射界は通常砲と同一）
    let carronadesAdded = 0;
    if (range <= 2) {
      carronadesAdded = firer.carronades?.[side]?.remain || 0;
      numGuns += carronadesAdded;
    }
    log.push(`砲数: ${side}舷 field=${field} ${firingPortion} = ${numGuns}門${carronadesAdded ? ` (うちカロネード${carronadesAdded})` : ''}`);
  }
  if (numGuns <= 0) { log.push('発砲可能砲なし'); return { hit: false, log }; }

  // Rake判定（HDT参照前）
  const rake = isRaking(firer, target);
  if (rake) log.push(`Rake判定: ${rake === 'bow_rake' ? '艦首縦射' : '艦尾縦射'}`);

  // HDT → Hit Table番号（縦射時は rake 値を使用）
  const fullSail = firer.sailState === 'full';
  const tableNum = lookupHDT(numGuns, range, !!rake);
  if (tableNum === null) { log.push('HDT射程外'); return { hit: false, log }; }
  log.push(`HDT: 砲${numGuns}門 × ${range}hex${rake?' (縦射)':''} → Hit Table #${tableNum}`);

  // 修正子
  const mc = calcGunneryModifiers(firer, target);
  if (mc.mods.length) log.push('修正: ' + mc.mods.map(m => m.label).join(' '));

  // 最終Hit Table値（マイナスはハズレ）
  const finalTable = tableNum + mc.total;
  log.push(`最終Hit Table = ${tableNum} + (${mc.total}) = ${finalTable}`);
  if (finalTable < 0) {
    log.push('最終値マイナス → 外れ');
    return { hit: false, log, miss: 'modifier', table: finalTable, range, rake };
  }

  if (!dmgType) dmgType = (ammo === 'chain') ? 'rigging' : 'hull';
  const adjustedTable = Math.min(10, finalTable);
  let die, code, damages;
  if (ammo === 'grape') {
    // ぶどう弾: ダイスなし、命中No.の値だけ乗員損失
    die = null;
    code = `${adjustedTable}C`;
    damages = [{ type: 'C', n: adjustedTable }];
    log.push(`ぶどう弾: Table#${adjustedTable} → 乗員 ${adjustedTable} セクション損失`);
  } else {
    die = rollD6();
    code = lookupHitTable(adjustedTable, die, dmgType);
    log.push(`1d6=${die}, Table#${adjustedTable}(${dmgType}) → "${code}"`);
    damages = parseDamageCode(code);
  }
  // Rake時 (R) extras を有効化
  if (rake) {
    damages.forEach(d => { if (d.extra) d.apply = true; });
    // 縦射ボーナス（クリティカル10R で索具2倍など）はクリティカル表側で
  } else {
    // 非Rakeの場合は extras (FullSail追加) のみ全帆時
    if (!fullSail) damages.forEach(d => { if (d.extra) d.apply = false; });
  }

  return { hit: true, log, code, damages, table: adjustedTable, die, range, rake };
}

// ============================================================
// 損害適用（基本のみ）
// ============================================================
// damages配列をtargetに適用
// Rigging: 最大番号セクションから消去
// Crew/Gun: 最小番号セクションから消去（攻撃舷側）
function applyDamage(target, damages, fromArc) {
  const applied = [];
  for (const d of damages) {
    if (d.extra && !d.apply) continue;
    switch (d.type) {
      case 'H':
        if (target.hull) {
          const n = d.n || 1;
          target.hull.remain = Math.max(0, target.hull.remain - n);
          applied.push(`船体-${n} (残${target.hull.remain})`);
          // 船体0で破壊判定
          if (target.hull.remain <= 0) target.status = 'destroyed_hull';
        }
        break;
      case 'R':
        if (Array.isArray(target.rigging?.sections)) {
          const n = d.n || 1;
          let removed = 0;
          for (let i = 0; i < target.rigging.sections.length && removed < n; i++) {
            while (removed < n && target.rigging.sections[i] > 0) {
              target.rigging.sections[i]--;
              removed++;
            }
          }
          applied.push(`索具-${removed}`);
        }
        break;
      case 'C':
        if (Array.isArray(target.crew?.abilities)) {
          const n = d.n || 1;
          let removed = 0;
          for (let i = 0; i < target.crew.abilities.length && removed < n; i++) {
            while (removed < n && target.crew.abilities[i] > 0) {
              target.crew.abilities[i]--;
              removed++;
            }
          }
          applied.push(`乗員-${removed}`);
        }
        break;
      case 'G':
        // 砲セクション（Hit Table番号を1段階下げる）
        if (target.gunHitTable) {
          const sides = ['s1','s2','s3','s4'];
          for (const s of sides) {
            if (target.gunHitTable[s] && target.gunHitTable[s] > 0) {
              target.gunHitTable[s]--;
              applied.push(`砲${s}-1`);
              break;
            }
          }
        }
        break;
      case 'crit':
        applied.push('クリティカル発動');
        target._pendingCrit = true;
        break;
    }
  }
  return applied;
}
