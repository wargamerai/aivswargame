// bulge_mcts.js — 静的評価AI（ドクトリンベース、プレイアウト廃止）
'use strict';

const MC = { SIMS: 0 }; // 互換用（未使用）

// ========== VP都市リスト ==========
function mcGetCityHexes() {
  const cities = [];
  if (!FACILITY_MAP) return cities;
  for (const [hid, fac] of Object.entries(FACILITY_MAP)) {
    if (fac === 'c') cities.push(hid);
  }
  return cities;
}

// ========== 戦力比較: 連合攻勢モード判定 ==========
function mcIsAlliedOffensive(units) {
  const germanReady = units.filter(u => u.side === 'german' && !u.eliminated && !u.exited && !u.flipped).length;
  const alliedReady = units.filter(u => u.side === 'allied' && !u.eliminated && !u.exited && !u.flipped).length;
  return alliedReady >= germanReady;
}

// ========== 道路交差点・チョークポイント ==========
function mcRoadValue(hid) {
  const roads = ROAD_MAP && ROAD_MAP[hid];
  if (!roads || roads.length === 0) return 0;
  let v = roads.length;
  if (TERRAIN_MAP[hid] === 'f') v += 2; // 森林道路 = チョークポイント
  return v;
}

// ========== 退却先カウント（高速版）==========
function mcCountRetreats(units, unit) {
  let count = 0;
  for (const nid of getNeighborIds(unit.hexId)) {
    const t = TERRAIN_MAP[nid];
    if (!t || t === 'x') continue;
    if (units.some(u => u.hexId === nid && u.side !== unit.side && !u.eliminated && !u.exited)) continue;
    let blocked = false;
    for (const adj of getNeighborIds(nid)) {
      if (!units.some(e => e.hexId === adj && e.side !== unit.side && !e.eliminated && !e.exited)) continue;
      const covered = getNeighborIds(adj).some(fn =>
        units.some(f => f.hexId === fn && f.side === unit.side && f.id !== unit.id && !f.eliminated && !f.exited)
      );
      if (!covered) { blocked = true; break; }
    }
    if (!blocked) count++;
  }
  return count;
}

// ========== 盤面コピー ==========
function mcCloneUnits() {
  return G.units.map(u => Object.assign({}, u));
}

// ========== ドイツ脅威マップ: 各hexへのドイツ到達可能性 ==========
function mcGermanThreatMap(units) {
  const threat = {};
  const germanAlive = units.filter(u => u.side === 'german' && !u.eliminated && !u.exited && !u.flipped);
  for (const gu of germanAlive) {
    // 簡易: 距離2以内のhexに脅威マーク（移動力6 ≈ 平地2-3hex）
    const visited = new Set();
    const queue = [[gu.hexId, 0]];
    visited.add(gu.hexId);
    while (queue.length > 0) {
      const [hid, dist] = queue.shift();
      if (dist > 2) continue;
      if (!threat[hid]) threat[hid] = 0;
      threat[hid] += (3 - dist); // 近いほど高脅威
      for (const nid of getNeighborIds(hid)) {
        if (visited.has(nid)) continue;
        const t = TERRAIN_MAP[nid];
        if (!t || t === 'x') continue;
        visited.add(nid);
        queue.push([nid, dist + 1]);
      }
    }
  }
  return threat;
}

// ========== 局所静的評価: あるhexに移動した場合のスコア ==========
function mcEvalPosition(hid, unit, units) {
  let score = 0;
  const side = unit.side;
  const { col, row } = parseHexId(hid);
  const isCity = FACILITY_MAP && FACILITY_MAP[hid] === 'c';
  const isTown = FACILITY_MAP && FACILITY_MAP[hid] === 't';
  const terrain = TERRAIN_MAP[hid];
  const roads = ROAD_MAP && ROAD_MAP[hid];
  const isRoad = roads && roads.length > 0;
  const alliedOffensive = mcIsAlliedOffensive(units);

  const enemySide = side === 'german' ? 'allied' : 'german';
  const friendlies = units.filter(u => u.side === side && !u.eliminated && !u.exited);
  const enemies = units.filter(u => u.side === enemySide && !u.eliminated && !u.exited);

  // 隣接敵/味方
  const adjEnemyHexes = getNeighborIds(hid).filter(nid =>
    enemies.some(e => e.hexId === nid)
  );
  const adjFriendHexes = getNeighborIds(hid).filter(nid =>
    friendlies.some(f => f.id !== unit.id && f.hexId === nid)
  );
  const adjEnemyPower = adjEnemyHexes.reduce((s, nid) => {
    return s + enemies.filter(e => e.hexId === nid).reduce((es, e) => es + (e.flipped ? e.def : e.atk), 0);
  }, 0);
  const myPower = unit.flipped ? unit.def : unit.atk;

  // 仮想退却先
  const tempUnit = Object.assign({}, unit, { hexId: hid });
  const retreatCount = mcCountRetreats(units, tempUnit);

  if (side === 'german') {
    // === ドイツ軍 ===
    // 西進
    score += (20 - col) * 3;
    // 都市占領
    if (isCity) score += 25;
    if (isTown) score += 10;
    // NW突破hex
    const nwHexes = getNWExitHexes();
    if (nwHexes.includes(hid) && isMechanized(unit)) score += 40;
    else if (nwHexes.length > 0 && isMechanized(unit)) {
      const minDist = Math.min(...nwHexes.map(nh => hexDist(hid, nh)));
      score += Math.max(0, 20 - minDist * 3);
    }
    // 道路利用
    if (isRoad) score += 3;
    // 包囲価値: 敵の退却先を塞ぐ
    for (const enemyHex of adjEnemyHexes) {
      const enemy = enemies.find(e => e.hexId === enemyHex);
      if (enemy) {
        const eRetreats = mcCountRetreats(units, enemy);
        score += (6 - eRetreats) * 5; // 退却先0 = +30
        if (eRetreats === 0) score += 20; // 包囲壊滅ボーナス
        score += 5; // ピン価値（味方のZOC迂回を可能に）
      }
    }
    // 自分の安全（退却先）
    if (retreatCount === 0) score -= 10;
    // 森林に機械化は入らない（道路なし）
    if (terrain === 'f' && isMechanized(unit) && !isRoad) score -= 80;

  } else {
    // === 連合軍 ===
    if (alliedOffensive) {
      // 攻勢モード: ドイツ占領都市への集中攻撃
      const cityHexes = mcGetCityHexes();
      for (const ch of cityHexes) {
        if (enemies.some(e => e.hexId === ch)) {
          const dist = hexDist(hid, ch);
          score += Math.max(0, 20 - dist * 4);
        }
      }
      // 包囲壊滅チャンス最優先
      for (const enemyHex of adjEnemyHexes) {
        const enemy = enemies.find(e => e.hexId === enemyHex);
        if (enemy) {
          const eRetreats = mcCountRetreats(units, enemy);
          if (eRetreats === 0) score += 40; // 包囲壊滅
          else if (eRetreats === 1) score += 15;
        }
      }
      // 味方連携
      score += adjFriendHexes.length * 3;
    } else {
      // 防御モード

      // 1. 都市前方防御（最重要: 都市の東側で守る）
      const cityHexes = mcGetCityHexes();
      for (const ch of cityHexes) {
        const cc = parseInt(ch.substring(0, 2)) - 1;
        const dist = hexDist(hid, ch);
        if (dist === 1 && col > cc) score += 20; // 都市の直前
        else if (dist === 1) score += 10; // 都市の隣
        else if (dist === 2 && col >= cc) score += 6;
      }

      // 2. 都市そのもの（最終防衛線）
      if (isCity) score += 15;

      // 3. 道路チョークポイント
      score += mcRoadValue(hid) * 5;

      // 4. 味方連携（ZOC戦線構築）
      score += adjFriendHexes.length * 6;
      // ZOC重複: 味方2hex離れでもZOCが繋がる
      for (const nid of getNeighborIds(hid)) {
        if (getNeighborIds(nid).some(adj =>
          friendlies.some(f => f.id !== unit.id && f.hexId === adj)
        )) score += 2;
      }

      // 5. 退路確保（包囲されない）
      score += retreatCount * 3;
      if (retreatCount === 0) score -= 50; // 退路なし = 壊滅リスク
      if (retreatCount === 1) score -= 15;

      // 6. 敵圧力回避（劣勢時は敵から離れる）
      if (adjEnemyPower > myPower * 1.5) score -= 20;
      if (adjEnemyPower > 0 && adjEnemyPower <= myPower) score += 5; // 互角なら守れる

      // 7. ドイツ脅威マップ: ドイツが来そうな場所に先回り
      // （重い計算なのでquickScoreでは省略、pickMoveで使う）
    }

    // 森林に機械化は入らない（道路なし）
    if (terrain === 'f' && isMechanized(unit) && !isRoad) score -= 80;
  }

  return score;
}

// ========== CRT期待値計算（確定的）==========
function mcExpectedCombat(atkPower, defPower, support, isForest, defRetreatCount) {
  const diff = atkPower - defPower;
  const forestMod = isForest ? 1 : 0;

  let atkLoss = 0, defLoss = 0;
  for (let die = 1; die <= 6; die++) {
    const modDie = die + support - forestMod;
    const result = lookupCRT(diff, modDie);
    switch (result) {
      case 'DE': defLoss += 1.0; break;
      case 'EX': defLoss += 0.5; atkLoss += 0.5; break;
      case 'DD': defLoss += 0.2; break;
      case 'DR':
        if (defRetreatCount === 0) defLoss += 1.0; // 退却先なし=壊滅
        else defLoss += 0.1;
        break;
      case 'AR': atkLoss += 0.3; break;
      case 'NE': break;
    }
  }
  return { atkLoss: atkLoss / 6, defLoss: defLoss / 6 };
}

// ========== 移動判断: 全候補を静的評価 ==========
function mcPickMove(unit, reachable) {
  const side = unit.side;
  const candidates = [{ hex: unit.hexId, label: '待機' }];
  for (const [hid] of reachable) {
    candidates.push({ hex: hid });
  }

  // 脅威マップ（連合防御時のみ）
  let threatMap = null;
  if (side === 'allied' && !mcIsAlliedOffensive(G.units)) {
    threatMap = mcGermanThreatMap(G.units);
  }

  let bestHex = unit.hexId;
  let bestScore = -Infinity;

  for (const cand of candidates) {
    // 仮想移動
    const simUnits = mcCloneUnits();
    const simUnit = simUnits.find(u => u.id === unit.id);
    if (simUnit) simUnit.hexId = cand.hex;
    if (unit.mechPair) {
      const simPair = simUnits.find(u => u.id === unit.mechPair);
      if (simPair && simPair.hexId === unit.hexId) simPair.hexId = cand.hex;
    }

    // 基本スコア
    let score = mcEvalPosition(cand.hex, unit, simUnits);

    // 連合防御: 脅威マップを使って「ドイツが来そうな場所を塞ぐ」
    if (threatMap && side === 'allied') {
      const threat = threatMap[cand.hex] || 0;
      if (threat > 0) score += threat * 3; // ドイツの進撃路上にいる = ブロック価値
    }

    // 相手の応答を考慮: この移動後、隣接敵がどう動けるか
    const enemySide = side === 'german' ? 'allied' : 'german';
    const adjEnemies = getNeighborIds(cand.hex).filter(nid =>
      simUnits.some(u => u.hexId === nid && u.side === enemySide && !u.eliminated && !u.exited)
    );

    if (side === 'allied' && !mcIsAlliedOffensive(G.units)) {
      // 防御時: 敵隣接は避ける（攻撃を誘発）
      if (adjEnemies.length > 0) {
        const adjPower = adjEnemies.reduce((s, nid) => {
          return s + simUnits.filter(u => u.hexId === nid && u.side === 'german' && !u.eliminated).reduce((es, u) => es + (u.flipped ? u.def : u.atk), 0);
        }, 0);
        const myP = unit.flipped ? unit.def : unit.atk;
        if (adjPower > myP) score -= 25; // 不利な戦闘に巻き込まれる
      }
    }

    cand.score = score;
    if (score > bestScore) {
      bestScore = score;
      bestHex = cand.hex;
    }
  }

  // 連合防御: 最善候補が現在位置より悪いなら動かない
  if (side === 'allied' && !mcIsAlliedOffensive(G.units)) {
    const stayScore = candidates.find(c => c.hex === unit.hexId)?.score || 0;
    if (bestScore <= stayScore + 3) bestHex = unit.hexId; // 微差なら動かない
  }

  const top3 = candidates.sort((a, b) => b.score - a.score).slice(0, 3);
  console.log(`[AI] ${unit.name} (${side}) ${dispHex(unit.hexId)} → ${top3.map(c => `${dispHex(c.hex)}=${c.score.toFixed(0)}`).join(' ')} → ${dispHex(bestHex)}`);
  addLog('move', `[AI] ${unit.name}: ${dispHex(bestHex)}を選択 (score=${bestScore.toFixed(0)})`);
  return bestHex;
}

// ========== 攻撃判断: CRT期待値ベース ==========
function mcDecideAttack(attackers, defenders, defHexId) {
  const side = G.activeSide;
  const atkPower = attackers.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
  const defPower = defenders.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);

  // 支援計算
  let support = 0;
  const facility = FACILITY_MAP && FACILITY_MAP[defHexId];
  if (facility !== 'c') {
    for (const nid of getNeighborIds(defHexId)) {
      support += getUnitsAt(nid).filter(u =>
        u.side === side && !attackers.some(a => a.id === u.id)
      ).length;
    }
  }

  const isForest = TERRAIN_MAP[defHexId] === 'f';
  const defRetreatCount = defenders.reduce((min, d) => {
    const r = mcCountRetreats(G.units, d);
    return r < min ? r : min;
  }, 6);

  const { atkLoss, defLoss } = mcExpectedCombat(atkPower, defPower, support, isForest, defRetreatCount);

  const alliedOffensive = mcIsAlliedOffensive(G.units);

  let shouldAttack;
  if (side === 'german') {
    // ドイツ: 期待防御損失が攻撃損失を上回れば攻撃
    // 包囲壊滅なら必ず攻撃
    if (defRetreatCount === 0) shouldAttack = true;
    else shouldAttack = defLoss > atkLoss * 1.2;
  } else {
    if (alliedOffensive) {
      // 攻勢: 包囲壊滅なら必ず攻撃、そうでなければ有利な時だけ
      if (defRetreatCount === 0) shouldAttack = true;
      else shouldAttack = defLoss > atkLoss * 1.5;
    } else {
      // 防御: 基本攻撃しない。包囲壊滅チャンスのみ
      shouldAttack = defRetreatCount === 0 && defLoss > atkLoss;
    }
  }

  console.log(`[AI] ATTACK? ${dispHex(defHexId)} atk=${atkPower} def=${defPower} sup=${support} forest=${isForest?1:0} retreat=${defRetreatCount} E[atkLoss]=${atkLoss.toFixed(2)} E[defLoss]=${defLoss.toFixed(2)} → ${shouldAttack ? '攻撃' : '見送り'}`);
  addLog('combat', `[AI] ${dispHex(defHexId)}攻撃${shouldAttack ? '実行' : '見送り'} (E[損]=${atkLoss.toFixed(2)}/${defLoss.toFixed(2)})`);
  return shouldAttack;
}

// ========== ドイツ到達可能hex数（軽量版: BFS 2段でZOC考慮） ==========
function mcCalcGermanReach() {
  const germanAlive = G.units.filter(u => u.side === 'german' && !u.eliminated && !u.exited && isMechanized(u));
  const alliedAlive = G.units.filter(u => u.side === 'allied' && !u.eliminated && !u.exited);
  const alliedHexes = new Set(alliedAlive.map(u => u.hexId));
  // 連合ZOCがかかっているhex（味方カバーなし）
  const alliedZOC = new Set();
  for (const au of alliedAlive) {
    for (const nid of getNeighborIds(au.hexId)) {
      const t = TERRAIN_MAP[nid];
      if (!t || t === 'x') continue;
      if (alliedHexes.has(nid)) continue;
      // この敵ZOCがドイツ味方にカバーされているか
      const covered = getNeighborIds(au.hexId).some(fn =>
        germanAlive.some(gu => gu.hexId === fn)
      );
      if (!covered) alliedZOC.add(nid);
    }
  }
  // ドイツユニットからBFS 3段（2ターン移動力12 ≈ 平地3-4hex）
  const reachSet = new Set();
  for (const gu of germanAlive) {
    reachSet.add(gu.hexId);
    const guRoads = ROAD_MAP[gu.hexId] || [];
    for (const n1 of getNeighborIds(gu.hexId)) {
      const t1 = TERRAIN_MAP[n1];
      if (!t1 || t1 === 'x') continue;
      if (alliedHexes.has(n1)) continue;
      // 装甲は道路なし森に入れない
      if (t1 === 'f') {
        const n1Roads = ROAD_MAP[n1] || [];
        if (!guRoads.some(r => n1Roads.includes(r))) continue;
      }
      reachSet.add(n1);
      if (alliedZOC.has(n1)) continue;
      const n1Roads = ROAD_MAP[n1] || [];
      for (const n2 of getNeighborIds(n1)) {
        const t2 = TERRAIN_MAP[n2];
        if (!t2 || t2 === 'x') continue;
        if (alliedHexes.has(n2)) continue;
        if (t2 === 'f' && !n1Roads.some(r => (ROAD_MAP[n2]||[]).includes(r))) continue;
        reachSet.add(n2);
        if (alliedZOC.has(n2)) continue;
        const n2Roads = ROAD_MAP[n2] || [];
        for (const n3 of getNeighborIds(n2)) {
          const t3 = TERRAIN_MAP[n3];
          if (!t3 || t3 === 'x') continue;
          if (alliedHexes.has(n3)) continue;
          if (t3 === 'f' && !n2Roads.some(r => (ROAD_MAP[n3]||[]).includes(r))) continue;
          reachSet.add(n3);
        }
      }
    }
  }
  return reachSet.size;
}

// ========== 全体盤面評価（ドイツ視点、正=ドイツ有利）==========
function evalGlobalBoard(units) {
  let score = 0;
  const germanAlive = units.filter(u => u.side === 'german' && !u.eliminated && !u.exited);
  const alliedAlive = units.filter(u => u.side === 'allied' && !u.eliminated && !u.exited);

  // 都市VP（低め — 交差点のほうが重要）
  if (FACILITY_MAP) {
    for (const [hid, fac] of Object.entries(FACILITY_MAP)) {
      if (fac !== 'c') continue;
      if (germanAlive.some(u => u.hexId === hid)) score += 3;
      else if (alliedAlive.some(u => u.hexId === hid)) score -= 2;
      else score += 1;
    }
  }

  // 道路交差点の支配（都市より重要）
  for (const au of alliedAlive) {
    const roads = ROAD_MAP[au.hexId] || [];
    if (roads.length >= 2) score -= roads.length * 3; // 複数路線交差 = ドイツ不利
    else if (roads.length === 1) score -= 1;
  }
  for (const gu of germanAlive) {
    const roads = ROAD_MAP[gu.hexId] || [];
    if (roads.length >= 2) score += roads.length * 2;
  }

  // 部隊残存
  for (const u of units) {
    if (u.eliminated) { score += u.side === 'allied' ? 6 : -7; continue; }
    if (u.exited) { if (u._exitedNW) score += 5; continue; }
    const power = u.flipped ? u.def : u.atk;
    if (u.side === 'german') {
      score += power * 0.5;
      const col = parseInt(u.hexId.substring(0, 2)) - 1;
      score += (20 - col) * 0.4;
    } else {
      score -= power * 0.6;
      // 包囲度（退路なし=壊滅リスク）
      const retreats = mcCountRetreats(units, u);
      if (retreats === 0) score += 12;
      else if (retreats === 1) score += 5;
    }
  }

  // ドイツ到達可能hex数（多い=ドイツ有利、連合がブロックしていない）
  const germanReach = mcCalcGermanReach();
  score += germanReach * 0.5;

  // 装甲が道路なし森にいる = 閉じ込めリスク（ドイツ不利）
  for (const gu of germanAlive) {
    if (isMechanized(gu)) {
      const t = TERRAIN_MAP[gu.hexId];
      if (t === 'f') {
        const roads = ROAD_MAP[gu.hexId] || [];
        // 隣接hexへの道路接続を確認
        const canEscape = getNeighborIds(gu.hexId).some(nid => {
          const nRoads = ROAD_MAP[nid] || [];
          return roads.some(r => nRoads.includes(r));
        });
        if (!canEscape) score -= 8; // 完全に閉じ込め
        else if (roads.length === 0) score -= 4; // 道路なし森
      }
    }
  }

  // ZOC無効化: ドイツが連合に隣接 → その連合のZOCが無効化され戦線に穴
  for (const au of alliedAlive) {
    const adjGerman = getNeighborIds(au.hexId).filter(nid =>
      germanAlive.some(gu => gu.hexId === nid)
    ).length;
    if (adjGerman > 0) score += adjGerman * 6; // ZOC無効化+戦闘支援 = ドイツ大有利
  }

  return score;
}

// ========== 全体スキャン移動: 全ユニット×全候補を比較 ==========
// ブラウザ版aiDoMovementから呼ばれる。bestUnit+bestHexを返す
function mcGlobalScanMove(side) {
  const sign = side === 'german' ? 1 : -1;
  const units = G.units.filter(u =>
    u.side === side && !u.acted && !u.flipped && !u.eliminated && !u.exited
  );
  if (units.length === 0) return null;

  const baseScore = evalGlobalBoard(G.units);
  let bestUnit = null, bestHex = null, bestDelta = -Infinity;

  for (const unit of units) {
    const reachable = calcReachable(unit);
    const candidates = [unit.hexId];
    for (const [hid] of reachable) {
      // 連合防御: 候補を2hex以内に制限（全力後退禁止）
      if (side === 'allied' && !mcIsAlliedOffensive(G.units)) {
        if (hexDist(unit.hexId, hid) > 2) continue;
      }
      candidates.push(hid);
    }

    for (const hid of candidates) {
      if (hid !== unit.hexId) {
        const dest = getUnitsAt(hid).filter(u => u.side === unit.side);
        if (dest.length > 0 && !(unit.mechPair && dest.length < 2 && dest[0].id === unit.mechPair)) continue;
      }
      const savedHex = unit.hexId;
      const stacked = isStacked(unit);
      const pair = stacked ? G.units.find(u => u.id === unit.mechPair) : null;
      const savedPairHex = pair ? pair.hexId : null;

      unit.hexId = hid;
      if (stacked && pair) pair.hexId = hid;

      const newScore = evalGlobalBoard(G.units);
      let delta = (newScore - baseScore) * sign;

      // （敵隣接ペナルティ廃止: ドイツ到達hex数で自然判定）

      if (delta > bestDelta) {
        bestDelta = delta;
        bestUnit = unit;
        bestHex = hid;
      }

      unit.hexId = savedHex;
      if (pair) pair.hexId = savedPairHex;
    }
  }
  return bestUnit ? { unit: bestUnit, hex: bestHex, delta: bestDelta } : null;
}

// ========== 連合自発的パス判定 ==========
function mcShouldAlliedPass() {
  const germanRemaining = G.units.filter(u =>
    u.side === 'german' && !u.acted && !u.flipped && !u.eliminated && !u.exited
  ).length;
  const alliedUnits = G.units.filter(u =>
    u.side === 'allied' && !u.acted && !u.flipped && !u.eliminated && !u.exited
  );
  if (germanRemaining === 0 || alliedUnits.length === 0) return false;

  // 緊急: 包囲危機 or 都市脅威 or 西側に敵が接近
  const germanMech = G.units.filter(e => e.side === 'german' && !e.eliminated && !e.exited && isMechanized(e));
  for (const u of alliedUnits) {
    const unitCol = parseInt(u.hexId.substring(0, 2)) - 1;
    // 隣接敵チェック
    const adjEnemyHexes = getNeighborIds(u.hexId).filter(nid =>
      getUnitsAt(nid).some(e => e.side === 'german')
    );
    if (adjEnemyHexes.length > 0) {
      const retreats = typeof getRetreatHexes === 'function' ? getRetreatHexes(u).length : 3;
      if (retreats <= 2) return false; // 退路3未満
      const enemyOnWest = adjEnemyHexes.some(nid => {
        const ec = parseInt(nid.substring(0, 2)) - 1;
        return ec < unitCol;
      });
      if (enemyOnWest) return false; // 西側に回り込まれた
    }
    // 2hex以内に敵装甲が西側（左斜め上/左斜め下）にいる → 逃げる準備
    for (const gm of germanMech) {
      const dist = hexDist(u.hexId, gm.hexId);
      if (dist <= 2) {
        const gc = parseInt(gm.hexId.substring(0, 2)) - 1;
        if (gc <= unitCol) return false; // 敵装甲が同列か西にいる → 即動く
      }
    }
    // 都市に敵隣接
    if (FACILITY_MAP && FACILITY_MAP[u.hexId] === 'c' && adjEnemyHexes.length > 0) {
      return false;
    }
  }
  // ドイツ残り多い → パス
  if (germanRemaining > alliedUnits.length) return true;
  return false;
}
