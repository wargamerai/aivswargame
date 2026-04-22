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
  // axial座標で角度算出
  const fromA = offsetToAxial(fromCol, fromRow);
  const toA = offsetToAxial(toCol, toRow);
  const dq = toA.q - fromA.q;
  const dr = toA.r - fromA.r;
  // 6方位ベクトル（axial）
  const dirVecs = {
    9: [+1, -1], 6: [+1, 0], 3: [0, +1], 1: [-1, +1], 4: [-1, 0], 7: [0, -1]
  };
  // 一番内積が大きい方位
  let best = 9, bestScore = -Infinity;
  const len = Math.sqrt(dq*dq + dr*dr) || 1;
  for (const [d, [vq, vr]] of Object.entries(dirVecs)) {
    const vlen = Math.sqrt(vq*vq + vr*vr);
    const score = (dq*vq + dr*vr) / (len * vlen);
    if (score > bestScore) { bestScore = score; best = parseInt(d); }
  }
  return best;
}

// 射界判定: firer から target が どのarcにあるか
function getArcToTarget(firer, target) {
  // firerが占有する2ヘクスのうち、targetに最も近い側から見る
  const tCenter = avgPos(target);
  const fBow = { col: firer.col, row: firer.row };
  const fStern = getSternHex(firer);
  // どちらのヘクスからの距離で判定するか（両方の和が小さい側）
  // → 簡略: bowヘクスからの方位を基準
  const bear = bearingToHex(fBow.col, fBow.row, tCenter.col, tCenter.row);
  const fIdx = dirToIdx(firer.dir);  // 艦首
  const bIdx = dirToIdx(bear);
  if (fIdx < 0 || bIdx < 0) return 'none';

  // 相対方位（艦首基準で時計回りに何度ずれているか）
  let rel = (bIdx - fIdx + 6) % 6;
  // rel: 0=艦首前方, 1=右舷前(CW60°), 2=右舷後(CW120°), 3=艦尾真後ろ, 4=左舷後(CCW120°), 5=左舷前(CCW60°)
  if (rel === 0) return 'bow';
  if (rel === 3) return 'stern';
  if (rel === 1 || rel === 2) return 'stbd';
  if (rel === 4 || rel === 5) return 'port';
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
// セル値: "X (Y)" — n=通常, r=Rake（縦射）時のHit Table番号
// WSM 16.1.1.1: Rake時は括弧内の値を使用
const HDT_TABLE = [
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

function lookupHDT(numGuns, rangeHex, raking) {
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
      return raking ? cell.r : cell.n;
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
// opts: { ammo, rake }  — ammoは弾種による修正、rakeは艦尾縦射+1
// ============================================================
function calcGunneryModifiers(firer, target, opts) {
  opts = opts || {};
  const mods = [];
  let total = 0;
  // 艦尾縦射: +1 （艦首縦射はボーナスなし）
  if (opts.rake === 'stern_rake') { mods.push({label:'艦尾縦射+1', v:+1}); total += 1; }
  // 乗員品質
  const cq = firer.crewQuality || 'average';
  const cqMod = { elite: +1, crack: +1, average: 0, green: 0, poor: -1 }[cq] || 0;
  if (cqMod !== 0) { mods.push({label:`${cq}${cqMod>0?'+':''}${cqMod}`, v:cqMod}); total += cqMod; }
  // 乗員セクション損失（被弾舷側で1セクション以上損失していれば-1）
  const sideKey = opts.arc === 'port' ? 'L' : (opts.arc === 'stbd' ? 'R' : null);
  if (sideKey && firer.crew?.[sideKey]) {
    const lost = (firer.crew[sideKey].max || 0) - (firer.crew[sideKey].remain || 0);
    if (lost > 0) { mods.push({label:`乗員損失-1`, v:-1}); total += -1; }
  }
  // 初段斉射（まだ一度も発射していない舷側）
  if (opts.arc === 'port' || opts.arc === 'stbd') {
    const firedFlag = opts.arc === 'port' ? 'everFiredLeft' : 'everFiredRight';
    if (!firer[firedFlag]) { mods.push({label:'初段+1', v:+1}); total += 1; }
  }
  // 捕獲艦艇（鹵獲艦は-1）
  if (firer.captured) { mods.push({label:'捕獲艦-1', v:-1}); total += -1; }
  // 12.4.5: 拿捕要員運用艦は-2テーブル
  if (firer.prizeCrewFiringPenalty) { mods.push({label:`拿捕${firer.prizeCrewFiringPenalty}`, v:firer.prizeCrewFiringPenalty}); total += firer.prizeCrewFiringPenalty; }
  // 弾種修正（簡略: 一律値）
  const ammoMod = { grape: +1, chain: -1, double: -1, round: 0, carronade: 0 }[opts.ammo || 'round'] || 0;
  if (ammoMod !== 0) { mods.push({label:`${opts.ammo}${ammoMod>0?'+':''}${ammoMod}`, v:ammoMod}); total += ammoMod; }
  // 投錨中: +1
  if (firer.anchored) { mods.push({label:'錨泊+1', v:+1}); total += +1; }
  // 全帆展開: -1
  if (firer.sailState === 'full') { mods.push({label:'全帆-1', v:-1}); total += -1; }
  // 火薬少量(low powder): -1
  if (firer.lowPowder) { mods.push({label:'装薬減-1', v:-1}); total += -1; }
  // 火災中目標（ボーナスではないが、ルール外追加）
  if (target.onFire) { mods.push({label:'火災-1', v:-1}); total += -1; }
  // クリティカル: 指揮所被弾
  if (firer.critHitMod) { mods.push({label:`指揮所${firer.critHitMod>0?'+':''}${firer.critHitMod}`, v:firer.critHitMod}); total += firer.critHitMod; }
  return { total, mods };
}

// ============================================================
// 砲撃解決（メインエントリ）
// ============================================================
// firer, target: ship オブジェクト
// arc: 'port' | 'stbd' | 'bow' | 'stern' （撃つ舷）
// ammo: 'round' | 'chain' | 'double' | 'grape' | 'carronade'
// aimAt: 'hull' | 'rigging' （省略時は自動、距離6+は強制rigging）
function resolveGunnery(firer, target, arc, ammo, aimAt) {
  ammo = ammo || 'round';
  const log = [];
  const fAvg = avgPos(firer);
  const range = hexDist(fAvg.col, fAvg.row, target.col, target.row);

  // 白兵戦中は砲撃不可
  if (firer._inMelee || (firer.grappledWith||[]).includes(target.name) && (firer.meleeActive || target.meleeActive)) {
    log.push('白兵戦中: 砲撃不可');
    return { hit: false, log, miss: 'melee' };
  }
  if (target._inMelee) {
    log.push('目標白兵戦中: 砲撃不可');
    return { hit: false, log, miss: 'melee' };
  }

  // 鎖弾: イギリス艦は使用不可
  if (ammo === 'chain') {
    const nat = (firer.nation || firer.side || '').toLowerCase();
    if (nat === 'uk' || nat === 'britain' || nat === 'british' || nat === 'gb') {
      log.push('鎖弾: イギリス艦は使用不可');
      return { hit: false, log, miss: 'not_allowed' };
    }
  }

  // 弾種射程チェック
  const ammoKeyMap = { round: 'ROUND_SHOT', chain: 'CHAIN_SHOT', double: 'DOUBLE_SHOT', grape: 'GRAPE_SHOT', carronade: 'CARRONADE' };
  const maxR = MUNITION_RANGE?.[ammoKeyMap[ammo] || 'ROUND_SHOT'] || 10;
  if (range > maxR) {
    log.push(`射程外: ${range}hex > ${maxR}`);
    return { hit: false, log, miss: 'range' };
  }

  // 砲数算出（舷側別、Rakeの場合は艦首/艦尾の砲）
  let numGuns = 0;
  if (arc === 'port' || arc === 'stbd') {
    const side = arc === 'port' ? 'L' : 'R';
    numGuns = (firer.crew?.[side]?.remain || 0);
    // カロネード加算
    if (ammo === 'carronade') {
      numGuns = firer.carronades?.[side]?.remain || 0;
    }
    // 既に発射済み（未装填）ならば不可
    const dirtyFlag = side === 'L' ? 'firedLeftDirty' : 'firedRightDirty';
    if (firer[dirtyFlag]) {
      log.push(`${side}舷: 装填未了（再装填には装填フェイズ要）`);
      return { hit: false, log, miss: 'unloaded' };
    }
  } else if (arc === 'bow' || arc === 'stern') {
    // 艦首/艦尾砲（舷側の半分相当として簡略）
    const sec = arc === 'bow' ? Math.max(firer.crew?.L?.remain||0, firer.crew?.R?.remain||0) : 0;
    numGuns = Math.floor(sec / 2);
  }
  if (numGuns <= 0) { log.push('発砲可能砲なし'); return { hit: false, log, miss: 'no_guns' }; }

  // Rake判定（HDTでは括弧値を参照）
  const rake = isRaking(firer, target);
  if (rake) log.push(`Rake判定: ${rake === 'bow_rake' ? '艦首縦射' : '艦尾縦射'}`);

  // HDT → Hit Table番号（Rake時は括弧値）
  const tableNum = lookupHDT(numGuns, range, !!rake);
  if (tableNum === null) { log.push('HDT射程外'); return { hit: false, log, miss: 'range' }; }
  log.push(`HDT: 砲${numGuns}門 × ${range}hex${rake?' (Rake)':''} → Hit Table #${tableNum}`);

  // 修正子
  const mc = calcGunneryModifiers(firer, target, { ammo, rake, arc });
  if (mc.mods.length) log.push('修正: ' + mc.mods.map(m => m.label).join(' '));

  // 最終Hit Table値
  const finalTable = tableNum + mc.total;
  log.push(`最終Hit Table = ${tableNum} + (${mc.total}) = ${finalTable}`);

  // マイナスはハズレ
  if (finalTable < 0) {
    log.push('最終値マイナス → 外れ');
    return { hit: false, log, miss: 'modifier', table: finalTable, range, rake };
  }

  // 損害対象決定: 距離6+は強制rigging、それ以外は指定 or 弾種既定
  let dmgType = aimAt;
  if (range >= 6) {
    dmgType = 'rigging';
    if (aimAt === 'hull') log.push('距離6+: 船体狙い不可、帆へ強制');
  } else if (!dmgType) {
    dmgType = (ammo === 'chain') ? 'rigging' : 'hull';
  }

  // ぶどう弾: Hit Table判定をせず、最終値=クルー損失
  if (ammo === 'grape') {
    const crewLost = Math.max(0, finalTable);
    log.push(`ぶどう弾: 命中判定なし、クルー損失=${crewLost}`);
    const damages = [{ type: 'C', n: crewLost }];
    return { hit: crewLost > 0, log, code: `${crewLost}C`, damages, table: finalTable, range, rake, ammo };
  }

  // 10超過分の別途判定
  const primaryTable = Math.min(10, finalTable);
  const overflow = finalTable - 10;
  const die = rollD6();
  const code = lookupHitTable(primaryTable, die, dmgType);
  log.push(`1d6=${die}, Table#${primaryTable}(${dmgType}) → "${code}"`);

  let damages = parseDamageCode(code);
  // Rake時 (R) extras を有効化、非Rakeでは無効
  damages.forEach(d => { if (d.extra) d.apply = !!rake; });

  // 10超過分: 超過値を第2射として別途判定（同じ対象・同じdmgType）
  let overflowCode = null;
  let overflowDie = null;
  if (overflow > 0) {
    const over = Math.min(10, overflow);
    overflowDie = rollD6();
    overflowCode = lookupHitTable(over, overflowDie, dmgType);
    log.push(`10超過分: Table#${over} 1d6=${overflowDie} → "${overflowCode}"`);
    const extraDamages = parseDamageCode(overflowCode);
    extraDamages.forEach(d => { if (d.extra) d.apply = !!rake; });
    damages = damages.concat(extraDamages);
  }

  // 鎖弾: H/Gコードは外れ扱い
  if (ammo === 'chain') {
    const before = damages.length;
    damages = damages.filter(d => d.type !== 'H' && d.type !== 'G');
    if (damages.length < before) log.push(`鎖弾: H/G ${before - damages.length}件を除外`);
  }

  return { hit: damages.length > 0, log, code, damages, table: primaryTable, overflow, overflowCode, die, overflowDie, range, rake, ammo, aimAt: dmgType };
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
        if (target.rigging) {
          // 最大番号(R)から消去 — 簡略: 残量が一番多いセクションから
          const sections = ['L','C','R'];
          const n = d.n || 1;
          for (let k = 0; k < n; k++) {
            const sortedSections = sections.filter(s => target.rigging[s].remain > 0)
              .sort((a,b) => target.rigging[b].remain - target.rigging[a].remain);
            if (sortedSections.length === 0) break;
            target.rigging[sortedSections[0]].remain--;
          }
          applied.push(`索具-${n}`);
        }
        break;
      case 'C':
        if (target.crew) {
          // 最小番号から消去 — 攻撃舷側（fromArcの反対 = 被弾側）
          const targetSide = (fromArc === 'port' || fromArc === 'stbd')
            ? (fromArc === 'port' ? 'R' : 'L')  // 自分のportは相手のstbdに撃つ
            : 'L';
          const n = d.n || 1;
          if (target.crew[targetSide].remain > 0) {
            target.crew[targetSide].remain = Math.max(0, target.crew[targetSide].remain - n);
            applied.push(`乗員${targetSide}-${n}`);
          }
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
