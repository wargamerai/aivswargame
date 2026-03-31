// ===== AI配置 モンテカルロシミュレーション =====
// イギリス軍初期配置の最適化
// パターンA: スタック単位（歩兵2+砲兵2を同じヘクス）
// パターンB: 分離（歩兵と砲兵を別ヘクス）
// 各1000回、ダミーは味方ユニットの上に配置

// 配置可能エリア: col 0～25 (hexId 0101～2610), row 0～9
function getDeployableHexes() {
  const hexes = [];
  for (let c = 0; c <= 25; c++) {
    for (let r = 0; r <= 9; r++) {
      const hexId = toHexId(c, r);
      const terrain = getHexTerrain(hexId);
      // 湖は配置不可
      if (terrain === 'lake') continue;
      hexes.push({ col: c, row: r, hexId, terrain });
    }
  }
  return hexes;
}

// 地形の防御価値スコア（シミュレーション用の簡易評価）
function terrainDefenseValue(terrain) {
  switch(terrain) {
    case 'w': return 2;  // 林: 射撃-2
    case 'f': return 3;  // 森林: 射撃-3
    case 't': return 2;  // 町: 射撃-2
    case 'c': return 3;  // 市街地: 射撃-3
    case 'r': return 1;  // 荒地: 射撃-1
    default: return 0;   // 平地
  }
}

// ===== 簡易戦闘シミュレーション =====
// ゲーム全体を簡易的にシミュレーションして勝敗を返す

// 入口から移動力10の到達可能ヘクスを計算
function getReachableHexes(entryHexId, maxMP) {
  const entry = fromHexId(entryHexId);
  const reachable = [];
  for (let c = 0; c < 31; c++) {
    for (let r = 0; r < 10; r++) {
      const d = simHexDist(entry.col, entry.row, c, r);
      if (d <= maxMP && d > 0) {
        const hexId = toHexId(c, r);
        const terrain = getHexTerrain(hexId);
        if (terrain !== 'lake') {
          reachable.push({ col: c, row: r, hexId, terrain });
        }
      }
    }
  }
  return reachable;
}

function simCreateUnits(placement, reinfPositions) {
  // イギリス初期配置
  const units = [];
  placement.allied.forEach(p => {
    units.push({
      ...p, side:'allied', status:'ok', hexId: toHexId(p.col, p.row),
      id: p.name + '_' + p.col + '_' + p.row,
      hasDummy: p.hasDummy || false,
    });
  });

  // ドイツ援軍（第1ターン、3106から）
  const geEntry = fromHexId('3106');
  const geUnits = [
    { name:'PzIVH', type:'T', range:5, fpAT:6, fpSoft:4, def:6, closeAtk:5, closeDef:4, move:9, morale:6, count:8 },
    { name:'STGIII', type:'T', range:5, fpAT:6, fpSoft:3, def:6, closeAtk:4, closeDef:3, move:10, morale:6, count:2 },
    { name:'SdKfz1', type:'AC', range:4, fpAT:2, fpSoft:2, def:3, closeAtk:4, closeDef:3, move:12, morale:6, count:3 },
  ];
  geUnits.forEach(gu => {
    for (let i = 0; i < gu.count; i++) {
      units.push({
        name: gu.name + '-' + i, type: gu.type, side:'german', status:'ok',
        col: geEntry.col, row: geEntry.row, hexId:'3106',
        range: gu.range, fpAT: gu.fpAT, fpSoft: gu.fpSoft,
        def: gu.def, closeAtk: gu.closeAtk, closeDef: gu.closeDef,
        move: gu.move, morale: gu.morale,
        id: 'ge_' + gu.name + '_' + i,
        hasDummy: false,
      });
    }
  });

  // イギリス援軍（第1ターン）3スタックに分散配置
  const reinfDefs = [
    { name:'M4', type:'T', range:4, fpAT:4, fpSoft:4, def:5, closeAtk:5, closeDef:3, move:10, morale:5, count:4 },
    { name:'M4', type:'T', range:4, fpAT:4, fpSoft:4, def:5, closeAtk:5, closeDef:3, move:10, morale:5, count:4 },
    { name:'A27', type:'T', range:4, fpAT:4, fpSoft:4, def:5, closeAtk:4, closeDef:4, move:8, morale:5, count:4 },
  ];

  reinfDefs.forEach((rd, si) => {
    const pos = reinfPositions && reinfPositions[si] ? reinfPositions[si] : fromHexId('0610');
    for (let i = 0; i < rd.count; i++) {
      units.push({
        name: rd.name + '-R' + si + '-' + i, type: rd.type, side:'allied', status:'ok',
        col: pos.col, row: pos.row, hexId: toHexId(pos.col, pos.row),
        range: rd.range, fpAT: rd.fpAT, fpSoft: rd.fpSoft,
        def: rd.def, closeAtk: rd.closeAtk, closeDef: rd.closeDef,
        move: rd.move, morale: rd.morale,
        id: 'uk_' + rd.name + '_R' + si + '_' + i,
        hasDummy: false,
        _settled: true, _dummyCount: 0,
      });
    }
  });

  return units;
}

// 簡易ヘクス距離
function simHexDist(c1, r1, c2, r2) {
  // cube座標変換
  function toCube(col, row) {
    const x = col;
    const z = row - (col - (col & 1)) / 2;
    const y = -x - z;
    return { x, y, z };
  }
  const a = toCube(c1, r1), b = toCube(c2, r2);
  return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y), Math.abs(a.z-b.z));
}

// 簡易射撃判定（単体）
function simFire(attacker, target) {
  simFireCombined([attacker], target);
}

// 合算射撃判定（複数ユニットで1目標を撃つ）
function simFireCombined(attackers, target) {
  if (target.status === 'eliminated') return;
  const validShooters = attackers.filter(a => a.status === 'ok');
  if (validShooters.length === 0) return;

  // 射程チェック（最初のシューター基準）
  const dist = simHexDist(validShooters[0].col, validShooters[0].row, target.col, target.row);
  if (dist <= 0) return;

  // 火力合算
  const isArmored = target.type === 'T' || target.type === 'AC';
  let totalFP = 0;
  validShooters.forEach(a => {
    const d = simHexDist(a.col, a.row, target.col, target.row);
    if (d <= a.range && d > 0) {
      totalFP += isArmored ? a.fpAT : a.fpSoft;
    }
  });
  if (totalFP <= 0) return;

  const terrain = getHexTerrain(toHexId(target.col, target.row));
  const mod = TERRAIN_MODIFIERS[terrain] ? TERRAIN_MODIFIERS[terrain].fire : 0;

  const roll = Math.floor(Math.random() * 10);
  const modRoll = roll + mod;
  const combat = getFireCombatResult(totalFP, modRoll);
  const dmg = resolveDamage(combat.damageLevel, target.def || 0);

  if (dmg === 'd') {
    if (target.status === 'ok') target.status = 'd';
    else if (target.status === 'd') target.status = 'dd';
    else target.status = 'eliminated';
  } else if (dmg === 'dd') {
    if (target.status === 'ok') target.status = 'dd';
    else target.status = 'eliminated';
  } else if (dmg === 'eliminated') {
    target.status = 'eliminated';
  }
}

// 地形の移動コスト
function simMoveCost(terrain, unitType) {
  switch(terrain) {
    case 'p': return 1;
    case 'w': return unitType === 'T' ? 4 : 2; // 林
    case 'f': return unitType === 'T' ? Infinity : 3; // 森林（戦車進入不可）
    case 'r': return unitType === 'T' ? 4 : 2; // 荒地
    case 't': return 1; // 町
    case 'c': return 1; // 市街地
    case 'lake': return Infinity;
    default: return 1;
  }
}

// 簡易LOS判定（射撃元→目標の直線上に林/森/町/市街地があれば遮蔽）
function simHasLOS(c1, r1, c2, r2) {
  if (c1 === c2 && r1 === r2) return true;
  const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1), 1) * 2;
  const seen = new Set();
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const mc = c1 + (c2 - c1) * t;
    const mr = r1 + (r2 - r1) * t;
    const nc = Math.round(mc), nr = Math.round(mr);
    const key = `${nc},${nr}`;
    if (seen.has(key) || (nc === c1 && nr === r1) || (nc === c2 && nr === r2)) continue;
    seen.add(key);
    if (nc < 0 || nc >= 31 || nr < 0 || nr >= 10) continue;
    const terrain = getHexTerrain(toHexId(nc, nr));
    if (terrain === 'w' || terrain === 'f' || terrain === 't' || terrain === 'c') return false;
  }
  return true;
}

// 簡易移動（目標方向に1ヘクス移動、地形コスト消費、コストを返す）
function simMove(unit, targetCol, targetRow, allUnits) {
  const neighbors = [];
  const even = unit.col % 2 === 0;
  const dirs = even ?
    [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[0,1]] :
    [[0,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  dirs.forEach(d => {
    const nc = unit.col + d[0], nr = unit.row + d[1];
    if (nc < 0 || nc >= 31 || nr < 0 || nr >= 10) return;
    const hexId = toHexId(nc, nr);
    const terrain = getHexTerrain(hexId);
    const cost = simMoveCost(terrain, unit.type);
    if (cost === Infinity) return;
    neighbors.push({ col: nc, row: nr, cost });
  });

  if (neighbors.length === 0) return Infinity;

  // 目標に近づく＋コストが安いヘクスを選ぶ
  let best = null, bestScore = Infinity;
  neighbors.forEach(n => {
    const colDiff = Math.abs(n.col - targetCol) * 2;
    const rowDiff = Math.abs(n.row - targetRow);
    const score = colDiff + rowDiff + n.cost * 0.5;
    if (score < bestScore || (score === bestScore && n.col < (best ? best.col : 999))) {
      bestScore = score; best = n;
    }
  });

  if (best) {
    unit.col = best.col;
    unit.row = best.row;
    unit.hexId = toHexId(best.col, best.row);
    return best.cost;
  }
  return Infinity;
}

// 射程内の敵を防御力低い順（カモ優先）でソートして返す（LOS付き）
function simFindTargets(shooter, enemies) {
  const inRange = [];
  enemies.forEach(e => {
    if (e.status === 'eliminated') return;
    if (e.hasDummy) return; // ダミー付きは見えない
    const d = simHexDist(shooter.col, shooter.row, e.col, e.row);
    if (d <= shooter.range && d > 0) {
      if (simHasLOS(shooter.col, shooter.row, e.col, e.row)) {
        inRange.push({ unit: e, dist: d });
      }
    }
  });
  // 防御力低い順 → 同じなら近い順
  inRange.sort((a, b) => (a.unit.def - b.unit.def) || (a.dist - b.dist));
  return inRange.map(x => x.unit);
}

// 1ゲームシミュレーション（6ターン）
// ドイツ軍: 全速力で南端突破（実質4ターン）
// イギリス軍: 援軍は良い地形へ急行→座ってダミー増やしてサプライズ待ち
function simGame(placement, reinfPositions) {
  const units = simCreateUnits(placement, reinfPositions);
  let breakthroughCount = 0;

  // イギリス援軍の待ち伏せ位置候補（モンテカルロ結果から取得）
  const ambushCandidates = [];
  if (window._aiAmbushCandidates && window._aiAmbushCandidates.length > 0) {
    window._aiAmbushCandidates.forEach(h => ambushCandidates.push(h));
  } else {
    for (let c = 5; c <= 22; c++) {
      for (let r = 3; r <= 7; r++) {
        const hid = toHexId(c, r);
        const t = getHexTerrain(hid);
        if (t === 'w' || t === 't' || t === 'r' || t === 'f') {
          ambushCandidates.push({ col: c, row: r, hexId: hid, terrain: t });
        }
      }
    }
    if (ambushCandidates.length === 0) {
      for (let c = 5; c <= 20; c++) {
        ambushCandidates.push({ col: c, row: 5, hexId: toHexId(c, 5), terrain: 'p' });
      }
    }
  }

  // 各援軍にランダムな待ち伏せ位置を割り当て
  const reinfUnits = units.filter(u => u.side === 'allied' && u.name.includes('-R'));
  reinfUnits.forEach(u => {
    const pos = ambushCandidates[Math.floor(Math.random() * ambushCandidates.length)];
    u._ambushTarget = pos;
    u._settled = false; // 座ったか
    u._dummyCount = 0;
  });

  for (let turn = 1; turn <= 6; turn++) {
    const aliveGerman = units.filter(u => u.side === 'german' && u.status !== 'eliminated');
    const aliveAllied = units.filter(u => u.side === 'allied' && u.status !== 'eliminated');
    if (aliveGerman.length === 0) break;


    // 主導権判定（ターン1-4はドイツ、5-6は高確率でイギリス）
    const initiative = turn <= 4 ? 'german' : (Math.random() < 0.7 ? 'allied' : 'german');

    // === イギリス援軍の行動 ===
    // 座ってないなら移動、座ったら行動せずダミー増やす
    reinfUnits.forEach(u => {
      if (u.status === 'eliminated') return;
      if (!u._settled && u._ambushTarget) {
        // 目標地形に向かって全速移動
        const tgt = u._ambushTarget;
        const dist = simHexDist(u.col, u.row, tgt.col, tgt.row);
        if (dist <= 1) {
          // 到着→座る
          u.col = tgt.col;
          u.row = tgt.row;
          u.hexId = tgt.hexId;
          u._settled = true;
          u._dummyCount = 1;
          u.hasDummy = true;
        } else {
          const steps = u.move || 4;
          for (let s = 0; s < steps; s++) {
            if (simHexDist(u.col, u.row, tgt.col, tgt.row) <= 0) break;
            simMove(u, tgt.col, tgt.row, units);
          }
          // 移動完了で近くにいたら座る
          if (simHexDist(u.col, u.row, tgt.col, tgt.row) <= 1) {
            u.col = tgt.col; u.row = tgt.row; u.hexId = tgt.hexId;
            u._settled = true;
            u._dummyCount = 1;
            u.hasDummy = true;
          }
        }
      } else if (u._settled) {
        // 座ってる→行動せずダミー+1（最大4枚）
        if (u._dummyCount < 4) {
          u._dummyCount++;
          u.hasDummy = true;
        }
        // 射程内にドイツがいたらサプライズ射撃
        if (u.hasDummy && u.status === 'ok') {
          const targets = simFindTargets(u, aliveGerman);
          if (targets.length > 0) {
            // 同じヘクスにいる味方も合算してサプライズ射撃
            const sameHex = units.filter(r =>
              r.hexId === u.hexId && r.side === 'allied' && r.status === 'ok' && r.hasDummy && r !== u
            );
            const squad = [u, ...sameHex];
            // サプライズ・アタック1回目: 防御力最弱を狙う
            const t1 = targets[0];
            simFireCombined(squad, t1);
            // 2回目: 1台目が壊滅したら次の敵を狙う
            const targets2 = simFindTargets(u, aliveGerman.filter(g => g.status !== 'eliminated'));
            if (targets2.length > 0) {
              simFireCombined(squad, targets2[0]);
            }
            squad.forEach(s => { s.hasDummy = false; s._dummyCount = 0; });
          }
        }
      }
    });

    // === ヘクスごとにイギリスユニットをグループ化（射撃合算用） ===
    function getAlliedSquads() {
      const byHex = {};
      units.filter(u => u.side === 'allied' && u.status === 'ok').forEach(u => {
        if (!byHex[u.hexId]) byHex[u.hexId] = [];
        byHex[u.hexId].push(u);
      });
      return byHex;
    }

    // === 簡易突撃判定 ===
    function simAssault(atkUnits, defHexId) {
      const defs = units.filter(u => u.hexId === defHexId && u.side !== atkUnits[0].side && u.status !== 'eliminated');
      if (defs.length === 0) return;
      let atkPow = 0; atkUnits.forEach(u => { atkPow += u.closeAtk || 0; });
      let defPow = 0; defs.filter(u => u.status === 'ok').forEach(u => { defPow += u.closeDef || 0; });
      if (atkPow <= 0) return;
      const ratioIdx = getAssaultRatioIndex(atkPow, defPow);
      const roll = Math.floor(Math.random() * 10);
      const terrain = getHexTerrain(defHexId);
      const tMod = TERRAIN_MODIFIERS[terrain] ? TERRAIN_MODIFIERS[terrain].assault || 0 : 0;
      const modRoll = Math.max(-3, Math.min(12, roll + tMod));
      const row = ASSAULT_TABLE[String(modRoll)];
      const res = row ? parseAssaultResult(row[ratioIdx]) : { atkLoss:0, defLoss:0, de:false };
      if (res.de) { defs.forEach(d => { d.status = 'eliminated'; }); return; }
      // 防御側損害
      const defSorted = [...defs].sort((a,b) => (a.closeDef||0)-(b.closeDef||0));
      for (let i = 0; i < res.defLoss && i < defSorted.length; i++) defSorted[i].status = 'eliminated';
      // 攻撃側損害
      const atkSorted = [...atkUnits].sort((a,b) => (a.closeAtk||0)-(b.closeAtk||0));
      for (let i = 0; i < res.atkLoss && i < atkSorted.length; i++) atkSorted[i].status = 'eliminated';
    }

    if (initiative === 'german') {
      // === ドイツ先攻 ===

      // ドイツをスタック単位にグループ化
      const geByHex = {};
      aliveGerman.forEach(u => {
        if (u.status === 'eliminated') return;
        const key = u.hexId || toHexId(u.col, u.row);
        if (!geByHex[key]) geByHex[key] = [];
        geByHex[key].push(u);
      });

      // 各ドイツスタックが移動（地形コスト消費＋1ヘクスごとストップ射撃）
      Object.values(geByHex).forEach(stack => {
        const leader = stack[0];
        if (!leader || leader.status === 'eliminated') return;
        let mp = Math.min(...stack.map(u => u.move || 4));
        const targetRow = leader.row; // 同じrow維持

        while (mp > 0 && leader.col > 1) {
          const cost = simMove(leader, 1, targetRow, units);
          if (cost === Infinity) break;
          mp -= cost;
          // スタック全員を同じ位置に
          stack.forEach(u => {
            if (u !== leader && u.status !== 'eliminated') {
              u.col = leader.col; u.row = leader.row; u.hexId = leader.hexId;
            }
          });

          // ストップ射撃チェック: 射程内のイギリススタック
          const alliedSquadsHere = {};
          units.filter(u => u.side === 'allied' && u.status === 'ok').forEach(u => {
            const d = simHexDist(u.col, u.row, leader.col, leader.row);
            if (d > 0 && d <= u.range && simHasLOS(u.col, u.row, leader.col, leader.row)) {
              const key = u.hexId || toHexId(u.col, u.row);
              if (!alliedSquadsHere[key]) alliedSquadsHere[key] = [];
              alliedSquadsHere[key].push(u);
            }
          });

          // 各イギリススタックがストップ射撃
          Object.values(alliedSquadsHere).forEach(squad => {
            const okSquad = squad.filter(s => s.status === 'ok');
            if (okSquad.length === 0) return;
            // カモ優先（def低い順）
            const aliveStack = stack.filter(u => u.status !== 'eliminated');
            if (aliveStack.length === 0) return;
            const target = [...aliveStack].sort((a,b) => a.def - b.def)[0];

            // サプライズ判定
            const isSurprise = okSquad[0].hasDummy;
            const shots = isSurprise ? 2 : 1;
            for (let s = 0; s < shots; s++) {
              const t = stack.filter(u => u.status !== 'eliminated').sort((a,b) => a.def - b.def)[0];
              if (!t) break;
              simFireCombined(okSquad, t);
            }
            if (isSurprise) okSquad.forEach(s => { s.hasDummy = false; s._dummyCount = 0; });

            // ドイツ反撃（スタック合算、okのみ）
            const geOk = stack.filter(u => u.status === 'ok');
            if (geOk.length > 0) {
              const counterTarget = [...okSquad].filter(u => u.status !== 'eliminated')
                .sort((a,b) => a.def - b.def)[0];
              if (counterTarget && simHasLOS(geOk[0].col, geOk[0].row, counterTarget.col, counterTarget.row)) {
                simFireCombined(geOk, counterTarget);
              }
            }
          });

          if (stack.every(u => u.status === 'eliminated')) break;
          // D/DDはスタックから離脱（移動停止）
          stack.forEach(u => {
            if (u.status === 'd' || u.status === 'dd') u._moveComplete = true;
          });
        }
      });

      // ダミー除去判定
      units.filter(u => u.side === 'allied' && u.hasDummy && u.status !== 'eliminated').forEach(u => {
        const terrain = getHexTerrain(u.hexId || toHexId(u.col, u.row));
        if (terrain === 'p' || terrain === 'r') {
          const spotted = units.some(g =>
            g.side === 'german' && g.status !== 'eliminated' &&
            simHexDist(g.col, g.row, u.col, u.row) <= 12
          );
          if (spotted) { u.hasDummy = false; u._dummyCount = 0; }
        } else {
          const scouts = units.filter(s => s.side === 'german' && s.type === 'AC' && s.status !== 'eliminated');
          if (scouts.length > 0) {
            const canSpot = scouts.some(s => simHexDist(s.col, s.row, u.col, u.row) <= 12);
            if (canSpot && Math.floor(Math.random() * 10) <= 7) { u.hasDummy = false; u._dummyCount = 0; }
          }
        }
      });

      // ドイツ先制射撃（見えてる敵にスタック合算で撃つ）
      const geByHex2 = {};
      units.filter(u => u.side === 'german' && u.status === 'ok').forEach(u => {
        const key = u.hexId; if (!geByHex2[key]) geByHex2[key] = [];
        geByHex2[key].push(u);
      });
      Object.values(geByHex2).forEach(geStack => {
        const targets = simFindTargets(geStack[0], units.filter(u => u.side === 'allied' && u.status !== 'eliminated'));
        if (targets.length > 0) simFireCombined(geStack, targets[0]);
      });

      // イギリス戦車がオーバーラン（隣接ドイツに突入）
      const alliedTanks = units.filter(u => u.side === 'allied' && u.type === 'T' && u.status === 'ok');
      const processedHexes = new Set();
      alliedTanks.forEach(tank => {
        if (processedHexes.has(tank.hexId)) return;
        const geNearby = units.filter(g =>
          g.side === 'german' && g.status !== 'eliminated' &&
          simHexDist(tank.col, tank.row, g.col, g.row) === 1
        );
        if (geNearby.length > 0) {
          const sameHexTanks = alliedTanks.filter(t => t.hexId === tank.hexId && t.status === 'ok');
          simAssault(sameHexTanks, geNearby[0].hexId);
          processedHexes.add(tank.hexId);
        }
      });

    } else {
      // === イギリス先攻（ターン5-6）===

      // 1. イギリス全ユニット射撃（ヘクスごとに合算・カモ優先）
      const squads = getAlliedSquads();
      Object.values(squads).forEach(squad => {
        const targets = simFindTargets(squad[0], units.filter(u => u.side === 'german' && u.status !== 'eliminated'));
        if (targets.length > 0) {
          const t = targets[0];
          simFireCombined(squad, t);
          if (squad[0].hasDummy && t.status !== 'eliminated') {
            simFireCombined(squad, t);
            squad.forEach(s => { s.hasDummy = false; s._dummyCount = 0; });
          }
        }
      });

      // 2. イギリス移動（ドイツに向かって追撃）
      units.filter(u => u.side === 'allied' && u.status === 'ok' && (u.type === 'T' || u.type === 'AC')).forEach(u => {
        const geAlive = units.filter(g => g.side === 'german' && g.status !== 'eliminated');
        if (geAlive.length === 0) return;
        // 最も近いドイツに向かう
        let nearest = geAlive[0], nd = Infinity;
        geAlive.forEach(g => { const d = simHexDist(u.col, u.row, g.col, g.row); if (d < nd) { nd = d; nearest = g; } });
        const steps = Math.min(u.move || 4, 6);
        for (let s = 0; s < steps; s++) simMove(u, nearest.col, nearest.row, units);
      });

      // 3. イギリス戦車オーバーラン
      const alliedTanks = units.filter(u => u.side === 'allied' && u.type === 'T' && u.status === 'ok');
      alliedTanks.forEach(tank => {
        const geNearby = units.filter(g =>
          g.side === 'german' && g.status !== 'eliminated' &&
          simHexDist(tank.col, tank.row, g.col, g.row) === 1
        );
        if (geNearby.length > 0) {
          const sameHexTanks = alliedTanks.filter(t => t.hexId === tank.hexId && t.status === 'ok');
          simAssault(sameHexTanks, geNearby[0].hexId);
        }
      });

      // 4. 歩兵突撃（隣接ドイツへ）
      const alliedInf = units.filter(u => u.side === 'allied' && u.type === 'I' && u.status === 'ok');
      alliedInf.forEach(inf => {
        const geNearby = units.filter(g =>
          g.side === 'german' && g.status !== 'eliminated' &&
          simHexDist(inf.col, inf.row, g.col, g.row) === 1
        );
        if (geNearby.length > 0) {
          const sameHexInf = alliedInf.filter(i => i.hexId === inf.hexId && i.status === 'ok');
          simAssault(sameHexInf, geNearby[0].hexId);
        }
      });

      // 4.5 ダミー除去判定
      units.filter(u => u.side === 'allied' && u.hasDummy && u.status !== 'eliminated').forEach(u => {
        const terrain = getHexTerrain(u.hexId || toHexId(u.col, u.row));
        if (terrain === 'p' || terrain === 'r') {
          const spotted = units.some(g =>
            g.side === 'german' && g.status !== 'eliminated' &&
            simHexDist(g.col, g.row, u.col, u.row) <= 12
          );
          if (spotted) { u.hasDummy = false; u._dummyCount = 0; }
        } else {
          const scouts = units.filter(s => s.side === 'german' && s.type === 'AC' && s.status !== 'eliminated');
          if (scouts.length > 0) {
            const canSpot = scouts.some(s => simHexDist(s.col, s.row, u.col, u.row) <= 12);
            if (canSpot && Math.floor(Math.random() * 10) <= 7) { u.hasDummy = false; u._dummyCount = 0; }
          }
        }
      });

      // 5. ドイツは移動のみ
      units.filter(u => u.side === 'german' && u.status !== 'eliminated').forEach(u => {
        const steps = u.move || 4;
        for (let s = 0; s < steps; s++) {
          if (u.col <= 1) break;
          simMove(u, 1, u.row, units);
        }
      });
    }

    // 突破チェック: col <= 1 (02xx列) が南端
    units.forEach(u => {
      if (u.side === 'german' && u.status !== 'eliminated' && u.col <= 1) {
        breakthroughCount++;
        u.status = 'eliminated';
      }
    });
  }

  if (breakthroughCount >= 7) return 'german';
  if (breakthroughCount <= 5) return 'allied';
  return 'draw';
}

// ===== モンテカルロ実行 =====

function runMonteCarlo(iterations) {
  const deployable = getDeployableHexes();
  const candidates = deployable;

  // 援軍の到達可能範囲（入口0610/1610から移動力10以内）
  const reinfReach0610 = getReachableHexes('0610', 10);
  const reinfReach1610 = getReachableHexes('1610', 10);
  const allReinfHexes = [...reinfReach0610, ...reinfReach1610];
  // 重複除去
  const reinfHexMap = {};
  allReinfHexes.forEach(h => { reinfHexMap[h.hexId] = h; });
  const reinfCandidates = Object.values(reinfHexMap);

  const results = [];

  // パターンA: 初期配置（4ユニット同じヘクス）＋援軍3スタック
  const perHexA = Math.max(5, Math.floor(iterations / candidates.length));
  candidates.forEach(hex => {
    for (let i = 0; i < perHexA; i++) {
      const placement = { allied: [
        { name:'Para-0', type:'I', range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:6, col:hex.col, row:hex.row, hasDummy:true },
        { name:'Para-1', type:'I', range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:6, col:hex.col, row:hex.row, hasDummy:true },
        { name:'ATG-0', type:'AT', range:5, fpAT:5, fpSoft:3, def:1, closeAtk:0, closeDef:1, move:0, morale:5, col:hex.col, row:hex.row, hasDummy:true },
        { name:'ATG-1', type:'AT', range:5, fpAT:5, fpSoft:3, def:1, closeAtk:0, closeDef:1, move:0, morale:5, col:hex.col, row:hex.row, hasDummy:true },
      ]};
      // 援軍3スタックをランダム配置
      const rp = [];
      for (let s = 0; s < 3; s++) {
        const rh = reinfCandidates[Math.floor(Math.random() * reinfCandidates.length)];
        rp.push({ col: rh.col, row: rh.row });
      }
      const winner = simGame(placement, rp);
      const rpKey = rp.map(p => toHexId(p.col, p.row)).sort().join('/');
      results.push({ pattern:'A', hexId:hex.hexId, hex, winner, placement, reinfKey: rpKey, reinfPositions: rp });
    }
  });

  return results;
}

// 結果を集計してベスト10を返す
function analyzeResults(results) {
  // 配置パターンごとに勝率を集計
  const stats = {};
  results.forEach(r => {
    const key = r.pattern + ':' + r.hexId;
    if (!stats[key]) stats[key] = { pattern: r.pattern, hexId: r.hexId, placement: r.placement, wins: 0, draws: 0, losses: 0, total: 0 };
    stats[key].total++;
    if (r.winner === 'allied') stats[key].wins++;
    else if (r.winner === 'draw') stats[key].draws++;
    else stats[key].losses++;
  });

  // 勝率でソート
  const sorted = Object.values(stats)
    .map(s => ({ ...s, winRate: (s.wins + s.draws * 0.5) / s.total }))
    .sort((a, b) => b.winRate - a.winRate);

  return sorted.slice(0, 20);
}

// ===== モンテカルロ結果キャッシュ（シナリオ2用、100万回シミュレーション） =====
const AI_PLACEMENT_CACHE = {
  // イギリス初期配置ベスト20（Aパターン=スタック、リアルルール適用）
  best: [
    { pattern:'A', hexId:'0705', winRate:0.157 },  // 林 col:6 row:4
    { pattern:'A', hexId:'0904', winRate:0.105 },  // 林 col:8 row:3
    { pattern:'A', hexId:'0907', winRate:0.104 },  // col:8 row:6
    { pattern:'A', hexId:'0804', winRate:0.103 },  // 林 col:7 row:3
    { pattern:'A', hexId:'0908', winRate:0.095 },  // col:8 row:7
    { pattern:'A', hexId:'0607', winRate:0.094 },  // col:5 row:6
    { pattern:'A', hexId:'0906', winRate:0.083 },  // col:8 row:5
    { pattern:'A', hexId:'0905', winRate:0.082 },  // col:8 row:4
    { pattern:'A', hexId:'1204', winRate:0.082 },  // 林 col:11 row:3
    { pattern:'A', hexId:'0708', winRate:0.080 },  // col:6 row:7
    { pattern:'A', hexId:'0407', winRate:0.078 },  // col:3 row:6
    { pattern:'A', hexId:'0406', winRate:0.076 },  // col:3 row:5
    { pattern:'A', hexId:'0307', winRate:0.076 },  // col:2 row:6
    { pattern:'A', hexId:'0709', winRate:0.074 },  // col:6 row:8
    { pattern:'A', hexId:'0909', winRate:0.071 },  // col:8 row:8
    { pattern:'A', hexId:'0808', winRate:0.070 },  // col:7 row:7
    { pattern:'A', hexId:'0806', winRate:0.070 },  // col:7 row:5
    { pattern:'A', hexId:'0702', winRate:0.069 },  // 林 col:6 row:1
    { pattern:'A', hexId:'0807', winRate:0.067 },  // col:7 row:6
    { pattern:'A', hexId:'0903', winRate:0.066 },  // col:8 row:2
  ],
  // シャーマン潜伏候補（同上ベスト20）
  ambush: [
    { hexId:'0705', winRate:0.157 }, { hexId:'0904', winRate:0.105 },
    { hexId:'0907', winRate:0.104 }, { hexId:'0804', winRate:0.103 },
    { hexId:'0908', winRate:0.095 }, { hexId:'0607', winRate:0.094 },
    { hexId:'0906', winRate:0.083 }, { hexId:'0905', winRate:0.082 },
    { hexId:'1204', winRate:0.082 }, { hexId:'0708', winRate:0.080 },
    { hexId:'0407', winRate:0.078 }, { hexId:'0406', winRate:0.076 },
    { hexId:'0307', winRate:0.076 }, { hexId:'0709', winRate:0.074 },
    { hexId:'0909', winRate:0.071 }, { hexId:'0808', winRate:0.070 },
    { hexId:'0806', winRate:0.070 }, { hexId:'0702', winRate:0.069 },
    { hexId:'0807', winRate:0.067 }, { hexId:'0903', winRate:0.066 },
  ]
};

// シミュレーションON/OFF設定
let AI_RUN_SIMULATION = {
  alliedPlacement: false,  // イギリス配置: キャッシュ使用（100万回結果）
  germanRoute: false,      // ドイツルート: false=デフォルトルート、true=シミュレーション実行
};

// メイン: AI配置を決定
function runAIPlacement(callback) {
  let chosen;

  if (AI_RUN_SIMULATION.alliedPlacement) {
    // シミュレーション実行
    console.log('AI配置シミュレーション開始（1000000回）...');
    const startTime = Date.now();
    const results = runMonteCarlo(1000000);
    const best10 = analyzeResults(results);
    const elapsed = Date.now() - startTime;
    console.log(`シミュレーション完了: ${elapsed}ms, ${results.length}回`);
    best10.forEach((b, i) => {
      console.log(`  ${i+1}. ${b.pattern} ${b.hexId} 勝率${(b.winRate*100).toFixed(1)}% (${b.wins}勝${b.draws}分${b.losses}敗/${b.total}回)`);
    });

    window._aiAmbushCandidates = best10.map(b => {
      const pos = fromHexId(b.hexId);
      return { col: pos.col, row: pos.row, hexId: b.hexId, winRate: b.winRate };
    });

    const top5 = best10.slice(0, Math.min(5, best10.length));
    chosen = top5[Math.floor(Math.random() * top5.length)];
  } else {
    // シナリオ別の初期配置候補を使用（ai_scenario2.js等で定義）
    const INIT_CANDIDATES = (typeof INIT_PLACEMENT_CANDIDATES_S2 !== 'undefined')
      ? INIT_PLACEMENT_CANDIDATES_S2
      : [{ hexId: '1204', weight: 1 }];
    const totalW = INIT_CANDIDATES.reduce((s, c) => s + c.weight, 0);
    let initRoll = Math.random() * totalW;
    let pickHex = INIT_CANDIDATES[INIT_CANDIDATES.length - 1];
    for (const c of INIT_CANDIDATES) {
      initRoll -= c.weight;
      if (initRoll <= 0) { pickHex = c; break; }
    }
    console.log(`AI配置: 重み付きランダム配置 ${pickHex.hexId}`);
    const pick = { pattern: 'A', hexId: pickHex.hexId, winRate: 0.082 };

    // シャーマン潜伏候補を設定（hub.htmlで手動リストに上書きされる）
    const cache = AI_PLACEMENT_CACHE;
    window._aiAmbushCandidates = cache.ambush.map(h => {
      const pos = fromHexId(h.hexId);
      return { col: pos.col, row: pos.row, hexId: h.hexId, winRate: h.winRate };
    });

    // 選んだヘクスに配置データを生成
    const pos = fromHexId(pick.hexId);
    chosen = {
      pattern: pick.pattern,
      hexId: pick.hexId,
      winRate: pick.winRate,
      placement: {
        allied: [
          { col: pos.col, row: pos.row, name: 'Para', type: 'I', range: 1, fpAT: 0, fpSoft: 3, defense: 6, closeAtk: 3, closeDef: 6, move: 5, morale: 6, hasDummy: true },
          { col: pos.col, row: pos.row, name: 'Para', type: 'I', range: 1, fpAT: 0, fpSoft: 3, defense: 6, closeAtk: 3, closeDef: 6, move: 5, morale: 6, hasDummy: true },
          { col: pos.col, row: pos.row, name: '6lb ATG', type: 'AT', range: 5, fpAT: 5, fpSoft: 3, defense: 1, closeAtk: 0, closeDef: 1, move: 0, morale: 5, hasDummy: true },
          { col: pos.col, row: pos.row, name: '6lb ATG', type: 'AT', range: 5, fpAT: 5, fpSoft: 3, defense: 1, closeAtk: 0, closeDef: 1, move: 0, morale: 5, hasDummy: true },
        ]
      }
    };
    console.log(`選択: ${chosen.pattern} ${chosen.hexId}`);
  }

  if (callback) callback(chosen);
  return chosen;
}

// AI配置をシナリオに適用
function applyAIPlacement(chosen) {
  if (!chosen || !chosen.placement) return;

  // 既存のイギリス初期ユニットを削除
  for (let i = testUnits.length - 1; i >= 0; i--) {
    const u = testUnits[i];
    if (u.side === 'allied' && !u.reinforcement) {
      testUnits.splice(i, 1);
    }
  }

  // 新しい配置でユニット生成
  chosen.placement.allied.forEach((p, i) => {
    const center = getHexCenter(p.col, p.row);
    const hexId = toHexId(p.col, p.row);
    testUnits.push({
      ...p, col: p.col, row: p.row, x: center.x, y: center.y,
      hexId, status: 'ok', side: 'allied',
      id: 'ai_' + p.name + '_' + i,
      src: SCENARIO.getUnitImage(p.type === 'I' ? 'イギリス軍' : 'イギリス軍', p.type === 'I' ? 'Parachute' : '6lb ATG'),
      nation: 'イギリス軍',
      unitName: p.type === 'I' ? 'Parachute' : '6lb ATG',
    });
    // ダミーを配置
    if (p.hasDummy) {
      placeDummy(hexId, 'allied', 1);
    }
  });
  // 残りのダミー（5-4=1枚）をランダムなユニットの上に
  const alliedHexes = [...new Set(chosen.placement.allied.map(p => toHexId(p.col, p.row)))];
  if (alliedHexes.length > 0) {
    const rHex = alliedHexes[Math.floor(Math.random() * alliedHexes.length)];
    placeDummy(rHex, 'allied', 1);
  }

  addLog('init', `AI配置: パターン${chosen.pattern} ${chosen.hexId} (勝率${(chosen.winRate*100).toFixed(1)}%)`);
}

// ===== ドイツ軍AI: 移動先モンテカルロ =====
// 13台を最大4スタックに分割、各スタックの目標ヘクス(row)をランダムに決めて
// 突破率の高いルートを見つける

function simGameGerman(germanRoute, alliedPlacement) {
  // イギリスはベスト5からランダム配置
  const units = simCreateUnits(alliedPlacement);
  let breakthroughCount = 0;

  // ドイツのスタック分割と目標row設定
  const geUnits = units.filter(u => u.side === 'german');
  germanRoute.stacks.forEach((stack, si) => {
    stack.unitIndices.forEach(idx => {
      if (idx < geUnits.length) {
        geUnits[idx]._targetRow = stack.targetRow;
        geUnits[idx]._stackId = si;
      }
    });
  });

  // イギリス援軍の待ち伏せ設定
  const reinfUnits = units.filter(u => u.side === 'allied' && u.name.includes('-R'));
  const ambushCandidates = window._aiAmbushCandidates || [{ col: 15, row: 5, hexId: '1606' }];
  reinfUnits.forEach(u => {
    const pos = ambushCandidates[Math.floor(Math.random() * ambushCandidates.length)];
    u._ambushTarget = pos;
    u._settled = false;
    u._dummyCount = 0;
  });

  for (let turn = 1; turn <= 6; turn++) {
    const aliveGerman = units.filter(u => u.side === 'german' && u.status !== 'eliminated');
    const aliveAllied = units.filter(u => u.side === 'allied' && u.status !== 'eliminated');
    if (aliveGerman.length === 0) break;

    const initiative = turn <= 4 ? 'german' : (Math.random() < 0.7 ? 'allied' : 'german');

    // イギリス援軍行動（simGameと同じ）
    reinfUnits.forEach(u => {
      if (u.status === 'eliminated') return;
      if (!u._settled && u._ambushTarget) {
        const tgt = u._ambushTarget;
        const dist = simHexDist(u.col, u.row, tgt.col, tgt.row);
        if (dist <= 1) {
          u.col = tgt.col; u.row = tgt.row; u.hexId = tgt.hexId;
          u._settled = true; u._dummyCount = 1; u.hasDummy = true;
        } else {
          const steps = u.move || 4;
          for (let s = 0; s < steps; s++) {
            if (simHexDist(u.col, u.row, tgt.col, tgt.row) <= 0) break;
            simMove(u, tgt.col, tgt.row, units);
          }
          if (simHexDist(u.col, u.row, tgt.col, tgt.row) <= 1) {
            u.col = tgt.col; u.row = tgt.row; u.hexId = tgt.hexId;
            u._settled = true; u._dummyCount = 1; u.hasDummy = true;
          }
        }
      } else if (u._settled) {
        if (u._dummyCount < 4) { u._dummyCount++; u.hasDummy = true; }
        if (u.hasDummy && u.status === 'ok') {
          const targets = simFindTargets(u, aliveGerman);
          if (targets.length > 0) {
            const sameHex = units.filter(r =>
              r.hexId === u.hexId && r.side === 'allied' && r.status === 'ok' && r.hasDummy && r !== u
            );
            const squad = [u, ...sameHex];
            const t1 = targets[0];
            simFireCombined(squad, t1);
            const targets2 = simFindTargets(u, aliveGerman.filter(g => g.status !== 'eliminated'));
            if (targets2.length > 0) simFireCombined(squad, targets2[0]);
            squad.forEach(s => { s.hasDummy = false; s._dummyCount = 0; });
          }
        }
      }
    });

    // ダミー除去判定
    units.filter(u => u.side === 'allied' && u.hasDummy && u.status !== 'eliminated').forEach(u => {
      const terrain = getHexTerrain(u.hexId || toHexId(u.col, u.row));
      if (terrain === 'p' || terrain === 'r') {
        const spotted = units.some(g => g.side === 'german' && g.status !== 'eliminated' && simHexDist(g.col, g.row, u.col, u.row) <= 12);
        if (spotted) { u.hasDummy = false; u._dummyCount = 0; }
      } else {
        const scouts = units.filter(s => s.side === 'german' && s.type === 'AC' && s.status !== 'eliminated');
        if (scouts.length > 0) {
          const canSpot = scouts.some(s => simHexDist(s.col, s.row, u.col, u.row) <= 12);
          if (canSpot && Math.floor(Math.random() * 10) <= 7) { u.hasDummy = false; u._dummyCount = 0; }
        }
      }
    });

    if (initiative === 'german') {
      // ドイツ移動: 各ユニットが自分の目標rowに向かって左(col:1)へ全速
      aliveGerman.forEach(u => {
        if (u.status === 'eliminated') return;
        const targetRow = u._targetRow !== undefined ? u._targetRow : 5;
        const steps = u.move || 4;
        for (let s = 0; s < steps; s++) {
          if (u.col <= 1) break;
          simMove(u, 1, targetRow, units);
        }
      });

      // ドイツ射撃
      aliveGerman.forEach(u => {
        if (u.status !== 'ok') return;
        const vis = aliveAllied.filter(a => !a.hasDummy && a.status !== 'eliminated');
        for (const t of vis) {
          const d = simHexDist(u.col, u.row, t.col, t.row);
          if (d <= u.range && d > 0) { simFire(u, t); break; }
        }
      });

      // イギリスストップ射撃+反撃
      function doAlliedFire() {
        const byHex = {};
        units.filter(u => u.side === 'allied' && u.status === 'ok').forEach(u => {
          if (!byHex[u.hexId]) byHex[u.hexId] = [];
          byHex[u.hexId].push(u);
        });
        Object.values(byHex).forEach(squad => {
          const targets = simFindTargets(squad[0], units.filter(u => u.side === 'german' && u.status !== 'eliminated'));
          if (targets.length > 0) {
            simFireCombined(squad, targets[0]);
            if (squad[0].hasDummy && targets[0].status !== 'eliminated') {
              simFireCombined(squad, targets[0]);
              squad.forEach(s => { s.hasDummy = false; s._dummyCount = 0; });
            }
          }
        });
      }
      doAlliedFire(); // ストップ
      doAlliedFire(); // 反撃

      // イギリス戦車オーバーラン
      const alliedTanks = units.filter(u => u.side === 'allied' && u.type === 'T' && u.status === 'ok');
      alliedTanks.forEach(tank => {
        const geNearby = units.filter(g => g.side === 'german' && g.status !== 'eliminated' && simHexDist(tank.col, tank.row, g.col, g.row) === 1);
        if (geNearby.length > 0) {
          const sameHexTanks = alliedTanks.filter(t => t.hexId === tank.hexId && t.status === 'ok');
          // 簡易突撃
          let atkPow = 0; sameHexTanks.forEach(t => atkPow += t.closeAtk || 0);
          const defHex = geNearby[0].hexId;
          const defs = units.filter(d => d.hexId === defHex && d.side === 'german' && d.status !== 'eliminated');
          let defPow = 0; defs.forEach(d => defPow += d.closeDef || 0);
          if (atkPow > 0) {
            const ri = getAssaultRatioIndex(atkPow, defPow);
            const roll = Math.floor(Math.random() * 10);
            const row = ASSAULT_TABLE[String(Math.max(-3, Math.min(12, roll)))];
            if (row) {
              const res = parseAssaultResult(row[ri]);
              if (res.de) defs.forEach(d => d.status = 'eliminated');
              else {
                const ds = [...defs].sort((a,b) => (a.closeDef||0)-(b.closeDef||0));
                for (let i = 0; i < res.defLoss && i < ds.length; i++) ds[i].status = 'eliminated';
                const as = [...sameHexTanks].sort((a,b) => (a.closeAtk||0)-(b.closeAtk||0));
                for (let i = 0; i < res.atkLoss && i < as.length; i++) as[i].status = 'eliminated';
              }
            }
          }
        }
      });

    } else {
      // イギリス先攻
      const byHex = {};
      units.filter(u => u.side === 'allied' && u.status === 'ok').forEach(u => {
        if (!byHex[u.hexId]) byHex[u.hexId] = [];
        byHex[u.hexId].push(u);
      });
      Object.values(byHex).forEach(squad => {
        const targets = simFindTargets(squad[0], units.filter(u => u.side === 'german' && u.status !== 'eliminated'));
        if (targets.length > 0) {
          simFireCombined(squad, targets[0]);
          if (squad[0].hasDummy && targets[0].status !== 'eliminated') {
            simFireCombined(squad, targets[0]);
            squad.forEach(s => { s.hasDummy = false; s._dummyCount = 0; });
          }
        }
      });

      // イギリス追撃
      units.filter(u => u.side === 'allied' && u.status === 'ok' && u.type === 'T').forEach(u => {
        const ge = units.filter(g => g.side === 'german' && g.status !== 'eliminated');
        if (ge.length === 0) return;
        let near = ge[0], nd = Infinity;
        ge.forEach(g => { const d = simHexDist(u.col, u.row, g.col, g.row); if (d < nd) { nd = d; near = g; } });
        const steps = Math.min(u.move || 4, 6);
        for (let s = 0; s < steps; s++) simMove(u, near.col, near.row, units);
      });

      // ドイツ移動のみ
      aliveGerman.forEach(u => {
        if (u.status === 'eliminated') return;
        const targetRow = u._targetRow !== undefined ? u._targetRow : 5;
        const steps = u.move || 4;
        for (let s = 0; s < steps; s++) {
          if (u.col <= 1) break;
          simMove(u, 1, targetRow, units);
        }
      });
    }

    // 突破チェック
    units.forEach(u => {
      if (u.side === 'german' && u.status !== 'eliminated' && u.col <= 1) {
        breakthroughCount++;
        u.status = 'eliminated';
      }
    });
  }

  return breakthroughCount;
}

// ドイツ側モンテカルロ: ランダムなスタック分割+ルートで突破率を調べる
function runGermanMonteCarlo(iterations) {
  // イギリス配置はベスト5からランダム
  const alliedBest = window._aiAmbushCandidates || [];
  const alliedPlacements = [];
  // イギリスのベスト配置5パターンを用意
  const deployable = getDeployableHexes();
  const ukCandidates = alliedBest.length >= 5 ? alliedBest.slice(0, 5) : deployable.filter(h => h.col >= 0 && h.col <= 3);

  const results = {};

  for (let i = 0; i < iterations; i++) {
    // ランダムにスタック分割（1-4スタック）
    const numStacks = 1 + Math.floor(Math.random() * 4); // 1-4
    const stacks = [];
    const unitIndices = [];
    for (let j = 0; j < 13; j++) unitIndices.push(j);

    // ランダムに分配
    for (let s = 0; s < numStacks; s++) {
      stacks.push({ unitIndices: [], targetRow: Math.floor(Math.random() * 10) });
    }
    unitIndices.forEach(idx => {
      stacks[Math.floor(Math.random() * numStacks)].unitIndices.push(idx);
    });
    // 空スタック除去
    const validStacks = stacks.filter(s => s.unitIndices.length > 0);

    // ルートキー: 各スタックの目標rowをソートして結合
    const routeKey = validStacks.map(s => 'r' + s.targetRow + 'x' + s.unitIndices.length).sort().join('/');

    // イギリス配置はランダム
    const ukHex = ukCandidates[Math.floor(Math.random() * ukCandidates.length)];
    const placement = { allied: [
      { name:'Para-0', type:'I', range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:6, col:ukHex.col, row:ukHex.row, hasDummy:true },
      { name:'Para-1', type:'I', range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:6, col:ukHex.col, row:ukHex.row, hasDummy:true },
      { name:'ATG-0', type:'AT', range:5, fpAT:5, fpSoft:3, def:1, closeAtk:0, closeDef:1, move:0, morale:5, col:ukHex.col, row:ukHex.row, hasDummy:true },
      { name:'ATG-1', type:'AT', range:5, fpAT:5, fpSoft:3, def:1, closeAtk:0, closeDef:1, move:0, morale:5, col:ukHex.col, row:ukHex.row, hasDummy:true },
    ]};

    const bt = simGameGerman({ stacks: validStacks }, placement);

    if (!results[routeKey]) results[routeKey] = { route: validStacks, wins: 0, draws: 0, losses: 0, total: 0, totalBT: 0 };
    results[routeKey].total++;
    results[routeKey].totalBT += bt;
    if (bt >= 7) results[routeKey].wins++;
    else if (bt >= 6) results[routeKey].draws++;
    else results[routeKey].losses++;
  }

  // 突破率でソート
  const sorted = Object.entries(results)
    .map(([key, r]) => ({
      routeKey: key, ...r,
      winRate: (r.wins + r.draws * 0.5) / r.total,
      avgBT: r.totalBT / r.total,
    }))
    .filter(r => r.total >= 3) // 最低3回
    .sort((a, b) => b.winRate - a.winRate || b.avgBT - a.avgBT);

  return sorted.slice(0, 20);
}

function runGermanAI() {
  if (!AI_RUN_SIMULATION.germanRoute) {
    // シミュレーションOFF: 全員row:5を一直線（デフォルト）
    console.log('ドイツ軍AI: シミュレーションOFF、デフォルトルート使用');
    window._aiGermanRoute = { targetRow: 5, routeKey: 'r5_default' };
    return [];
  }

  console.log('ドイツ軍AI: 移動先モンテカルロ開始（100000回）...');
  const startTime = Date.now();
  const best = runGermanMonteCarlo(100000);
  const elapsed = Date.now() - startTime;
  console.log(`完了: ${elapsed}ms`);
  console.log('ドイツ軍ベスト20ルート:');
  best.forEach((b, i) => {
    console.log(`  ${i+1}. ${b.routeKey} 勝率${(b.winRate*100).toFixed(1)}% 平均突破${b.avgBT.toFixed(1)} (${b.wins}勝${b.draws}分${b.losses}敗/${b.total}回)`);
  });

  // ベスト5からランダム選択して保存
  const top5 = best.slice(0, Math.min(5, best.length));
  if (top5.length > 0) {
    const chosen = top5[Math.floor(Math.random() * top5.length)];
    window._aiGermanRoute = chosen;
    console.log(`ドイツ選択: ${chosen.routeKey} 勝率${(chosen.winRate*100).toFixed(1)}%`);
  }

  return best;
}
