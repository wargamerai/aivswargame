// bulge_mcts.js — 静的評価AI（ドクトリンベース、プレイアウト廃止）
'use strict';

const MC = { SIMS: 0 }; // 互換用（未使用）

// ========== 死守都市 ==========
const HOLD_CITIES = ['1508', '1114']; // ST.VITH, BASTOGNE
const BASTOGNE = '1114';
const ST_VITH = '1508';

// 強制都市移動の定義: { unitId, targetHex, condition }
const FORCED_CITY_MARCH = [
  { id: 'us_82',   target: BASTOGNE }
];

// 死守都市にいる歩兵は移動禁止（DRによる退却は別処理なので影響しない）
function mustHoldCity(unit) {
  if (unit.side !== 'allied') return false;
  if (isMechanized(unit)) return false; // 歩兵のみ対象
  return HOLD_CITIES.includes(unit.hexId);
}

// 強制都市移動対象か（未到達で未行動）
// 1歩兵はサンビットに味方がいなければ強制
function mustMarchToCity(unit) {
  const entry = FORCED_CITY_MARCH.find(e => e.id === unit.id);
  if (!entry) return null;
  if (unit.hexId === entry.target) return null; // 既に到達済み
  return entry.target;
}

// 82空挺互換（既存参照用）
function mustMarchToBastogne(unit) {
  return mustMarchToCity(unit) !== null;
}

// 死守都市にいるか（攻撃禁止判定用）
function isHoldingCity(unit) {
  const entry = FORCED_CITY_MARCH.find(e => e.id === unit.id);
  if (!entry) return false;
  return unit.hexId === entry.target;
}

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
  const FOREST_SHIFT = { DE:'EX', EX:'DD', DD:'DR', DR:'NE', NE:'AR', AR:'AR' };

  let atkLoss = 0, defLoss = 0;
  for (let die = 1; die <= 6; die++) {
    const modDie = die + support;
    let result = lookupCRT(diff, modDie);
    // 森林結果修正: 1段階防御側有利にシフト
    if (isForest) result = FOREST_SHIFT[result] || result;
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
  const candidates = [{ hex: unit.hexId, label: 'パス' }];
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
  return reachSet;
}

// ========== ドイツMC移動計画 ==========
// 全ユニットの移動順序×配置を総当たりシミュレーションし、最良パターンを採用
function mcGermanMCPlan() {
  // 毎回現在の盤面で全未行動ユニットを一括シミュレーション → 最善の1体を返す
  const movableUnits = G.units.filter(u =>
    u.side === 'german' && !u.acted && !u.flipped && !u.eliminated && !u.exited
    && !mustHoldCity(u)
  );
  if (movableUnits.length === 0) return null;

  // mechPairは1つにまとめる（スタック移動）
  const seen = new Set();
  const uniqueUnits = [];
  for (const u of movableUnits) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    if (u.mechPair) seen.add(u.mechPair);
    uniqueUnits.push(u);
  }

  // 各ユニットの移動候補を事前計算
  const candidatesMap = new Map();
  for (const unit of uniqueUnits) {
    const reachable = calcReachable(unit);
    const candidates = [unit.hexId]; // 待機も候補
    for (const [hid] of reachable) {
      candidates.push(hid);
    }
    candidatesMap.set(unit.id, candidates);
  }

  const SIMS = 300;
  let bestPlan = null;
  let bestScore = -Infinity;

  for (let sim = 0; sim < SIMS; sim++) {
    const simUnits = mcCloneUnits();
    const plan = [];

    // ユニット順序をシャッフル（順序の探索）
    const shuffled = [...uniqueUnits].sort(() => Math.random() - 0.5);

    for (const origUnit of shuffled) {
      const simUnit = simUnits.find(u => u.id === origUnit.id);
      if (!simUnit || simUnit.eliminated || simUnit.exited) continue;

      const candidates = candidatesMap.get(origUnit.id);
      if (!candidates || candidates.length === 0) continue;

      // スタック制限を考慮した有効候補
      const valid = candidates.filter(hid => {
        if (hid === simUnit.hexId) return true;
        const dest = simUnits.filter(u =>
          u.hexId === hid && u.side === 'german' && !u.eliminated && !u.exited
          && u.id !== simUnit.id && (!simUnit.mechPair || u.id !== simUnit.mechPair)
        );
        return dest.length === 0;
      });
      if (valid.length === 0) continue;

      // スコア計算して上位からランダム選択
      const scored = valid.map(h => ({
        hex: h,
        score: mcDoctrineScore(h, origUnit, simUnits)
      }));
      scored.sort((a, b) => b.score - a.score);

      const topN = Math.min(Math.max(2, Math.ceil(scored.length * 0.3)), 5);
      const pick = scored[Math.floor(Math.random() * topN)];

      // シミュレーション内で移動
      const fromHex = simUnit.hexId;
      simUnit.hexId = pick.hex;
      if (origUnit.mechPair) {
        const pair = simUnits.find(u => u.id === origUnit.mechPair);
        if (pair && pair.hexId === fromHex) pair.hexId = pick.hex;
      }

      plan.push({ unitId: origUnit.id, hex: pick.hex });
    }

    // 全ユニット配置後の盤面評価
    const score = evalGermanMCBoard(simUnits);
    if (score > bestScore) {
      bestScore = score;
      bestPlan = plan;
    }
  }

  if (!bestPlan || bestPlan.length === 0) return null;

  // ベストプランの先頭（移動するユニット）を返す
  // 待機（現在地と同じ）ユニットはスキップ
  for (const p of bestPlan) {
    const unit = G.units.find(u => u.id === p.unitId);
    if (unit && p.hex !== unit.hexId && !unit.acted && !unit.eliminated && !unit.exited) {
      dbg('MC-PLAN', `シミュレーション${SIMS}回 残${uniqueUnits.length}体 bestScore:${bestScore.toFixed(1)} → ${unit.name} ${dispHex(unit.hexId)}→${dispHex(p.hex)}`);
      return { unit, hex: p.hex };
    }
  }

  return null;
}

// ドクトリンスコア（個別hex評価、シミュレーション内で使用）
function mcDoctrineScore(hid, unit, simUnits) {
  let score = 0;
  const { col, row } = parseHexId(hid);
  const mech = isMechanized(unit);

  // === 西進（全ユニット共通、控えめ）===
  score += (20 - col) * 2;

  // === ターン1: サンビット攻略最優先 ===
  if (G.turn === 1) {
    if (mech) {
      // 装甲はサンビットに集中
      const dist = hexDist(hid, ST_VITH);
      score += Math.max(0, 15 - dist) * 4;
    } else {
      // 歩兵もサンビット方面を支援
      const dist = hexDist(hid, ST_VITH);
      score += Math.max(0, 10 - dist) * 2;
    }
  }

  // === ターン2以降: 装甲はNW（左上）集中 ===
  if (G.turn >= 2 && mech) {
    // バストーニュ方面: 1スタックは行くべき、それ以上はペナルティ
    const mechNearBast = simUnits.filter(u =>
      u.side === 'german' && isMechanized(u) && !u.eliminated && !u.exited
      && u.id !== unit.id && hexDist(u.hexId, BASTOGNE) <= 2
    );
    if (hid === BASTOGNE || hexDist(hid, BASTOGNE) <= 2) {
      if (mechNearBast.length === 0) {
        // まだ誰もバストーニュ方面にいない → 最初の1スタックに加点
        const dist = hexDist(hid, BASTOGNE);
        score += Math.max(0, 10 - dist) * 4;
      } else if (mechNearBast.length >= 2) {
        score -= 30;
      }
    }
    // NW方向（col小=西、row小=北）を優遇
    score += (20 - col) * 3;
    score += (18 - row) * 2;
  }

  // === ターン2以降: 歩兵は戦線構築 ===
  if (G.turn >= 2 && !mech) {
    // 味方隣接で戦線連結
    const adjFriend = getNeighborIds(hid).filter(nid =>
      simUnits.some(u => u.hexId === nid && u.side === 'german' && u.id !== unit.id && !u.eliminated && !u.exited)
    );
    score += adjFriend.length * 5;
    // ZOC連結（2hex離れの味方）
    for (const nid of getNeighborIds(hid)) {
      if (getNeighborIds(nid).some(n2 =>
        simUnits.some(u => u.hexId === n2 && u.side === 'german' && u.id !== unit.id && !u.eliminated && !u.exited)
      )) score += 2;
    }
  }

  // === 燃料集積所確保 ===
  if (TAG_MAP && TAG_MAP[hid] === 'fuel') score += 15;

  // === 包囲価値（敵の退路を塞ぐ）===
  for (const nid of getNeighborIds(hid)) {
    const enemy = simUnits.find(u => u.hexId === nid && u.side === 'allied' && !u.eliminated && !u.exited);
    if (enemy) {
      const retreats = mcCountRetreats(simUnits, enemy);
      score += (6 - retreats) * 5;
      if (retreats === 0) score += 25; // 包囲壊滅ボーナス
    }
  }

  // === 都市・町 ===
  if (FACILITY_MAP && FACILITY_MAP[hid] === 'c') score += 20;
  if (FACILITY_MAP && FACILITY_MAP[hid] === 't') score += 8;

  // === 道路 ===
  if (ROAD_MAP && ROAD_MAP[hid] && ROAD_MAP[hid].length > 0) score += 3;

  // === 安全性（退路）===
  const tempUnit = Object.assign({}, unit, { hexId: hid });
  const retreatCount = mcCountRetreats(simUnits, tempUnit);
  if (retreatCount === 0) score -= 15;

  // === 森林に装甲は入らない（道路なし）===
  if (TERRAIN_MAP[hid] === 'f' && mech && !(ROAD_MAP && ROAD_MAP[hid] && ROAD_MAP[hid].length > 0)) score -= 80;

  return score;
}

// ドクトリン込み盤面評価（モンテカルロ最終評価用）
function evalGermanMCBoard(simUnits) {
  let score = 0;
  const germanAlive = simUnits.filter(u => u.side === 'german' && !u.eliminated && !u.exited);
  const alliedAlive = simUnits.filter(u => u.side === 'allied' && !u.eliminated && !u.exited);
  const germanMech = germanAlive.filter(u => isMechanized(u));
  const germanInf = germanAlive.filter(u => !isMechanized(u));

  // === 1. 装甲集中度（近いほど高スコア）===
  if (germanMech.length >= 2) {
    let totalDist = 0, pairs = 0;
    for (let i = 0; i < germanMech.length; i++) {
      for (let j = i + 1; j < germanMech.length; j++) {
        totalDist += hexDist(germanMech[i].hexId, germanMech[j].hexId);
        pairs++;
      }
    }
    const avgDist = totalDist / pairs;
    score += Math.max(0, 10 - avgDist) * 3;
  }

  // === 2. ターン別目標への接近 ===
  if (G.turn === 1) {
    // サンビット攻略
    for (const u of germanMech) {
      score += Math.max(0, 15 - hexDist(u.hexId, ST_VITH)) * 3;
    }
  } else {
    // NW方向への進出
    for (const u of germanMech) {
      const { col, row } = parseHexId(u.hexId);
      score += (20 - col) * 2;
      score += (18 - row) * 1;
    }
  }

  // === 3. 包囲評価 ===
  for (const au of alliedAlive) {
    const retreats = mcCountRetreats(simUnits, au);
    if (retreats === 0) score += 20;
    else if (retreats === 1) score += 10;
    else if (retreats === 2) score += 4;
  }

  // === 4. 歩兵戦線連結（ターン2以降）===
  if (G.turn >= 2) {
    for (const u of germanInf) {
      const adjFriend = getNeighborIds(u.hexId).filter(nid =>
        germanAlive.some(f => f.hexId === nid && f.id !== u.id)
      );
      score += adjFriend.length * 3;
    }
  }

  // === 5. 燃料集積所・都市確保 ===
  for (const u of germanAlive) {
    if (TAG_MAP && TAG_MAP[u.hexId] === 'fuel') score += 10;
    if (FACILITY_MAP && FACILITY_MAP[u.hexId] === 'c') score += 15;
    if (FACILITY_MAP && FACILITY_MAP[u.hexId] === 't') score += 5;
  }

  // === 6. バストーニュ装甲制限 ===
  const mechAtBastogne = germanMech.filter(u =>
    u.hexId === BASTOGNE || hexDist(u.hexId, BASTOGNE) <= 2
  );
  if (mechAtBastogne.length > 2) score -= 20;

  // === 7. 壊滅ペナルティ ===
  for (const u of simUnits) {
    if (u.eliminated) {
      score += u.side === 'allied' ? 5 : -8;
    }
  }

  return score;
}

// ========== 全体盤面評価（ドイツ視点、正=ドイツ有利）==========
function evalGlobalBoard(units) {
  let score = 0;
  const germanAlive = units.filter(u => u.side === 'german' && !u.eliminated && !u.exited);
  const alliedAlive = units.filter(u => u.side === 'allied' && !u.eliminated && !u.exited);

  // === 評価1: ドイツ戦車到達可能hex数（戦線維持の指標）===
  const germanReachSet = mcCalcGermanReach();
  score += germanReachSet.size * 0.5;

  // === 評価2: 連合ユニットの包囲回避 ===
  for (const au of alliedAlive) {
    const retreats = mcCountRetreats(units, au);
    if (retreats === 0) score += 15;      // 完全包囲 = ドイツ大有利
    else if (retreats === 1) score += 8;   // ほぼ包囲
    else if (retreats === 2) score += 3;   // 危険
  }

  // === 評価3: ZOC戦線の連結度（穴があるとドイツ有利）===
  const alliedHexes = new Set(alliedAlive.map(u => u.hexId));
  // 各連合ユニットのZOCが隣の連合ユニットのZOCと繋がっているか
  for (const au of alliedAlive) {
    const myAdj = getNeighborIds(au.hexId);
    // 隣接する味方がいるか（ZOC連結チェック）
    let zocLinked = false;
    for (const nid of myAdj) {
      // 2hex先に味方 = ZOCが重なる = 戦線が繋がっている
      if (getNeighborIds(nid).some(n2 => alliedHexes.has(n2) && n2 !== au.hexId)) {
        zocLinked = true;
        break;
      }
      // 直接隣接の味方でもOK（密な戦線）
      if (alliedHexes.has(nid)) {
        zocLinked = true;
        break;
      }
    }
    if (!zocLinked) score += 6; // 孤立 = ドイツ有利（ZOCに穴）

    // ドイツ戦車リーチ内にいるのに孤立 = さらに危険
    if (!zocLinked && germanReachSet.has(au.hexId)) score += 4;
  }

  // === ドイツ側: 部隊残存・進出度（ドイツAI用）===
  for (const gu of germanAlive) {
    const power = gu.flipped ? gu.def : gu.atk;
    score += power * 0.5;
    const col = parseInt(gu.hexId.substring(0, 2)) - 1;
    score += (20 - col) * 0.4;
  }
  // 壊滅ペナルティ
  for (const u of units) {
    if (u.eliminated) { score += u.side === 'allied' ? 4 : -5; }
    if (u.exited && u._exitedNW) score += 5;
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
    // 死守都市の歩兵は動かさない
    if (mustHoldCity(unit)) continue;
    // バストーニュ強制移動中の82空挺はスキャン対象外（専用処理で移動）
    if (mustMarchToBastogne(unit)) continue;

    const reachable = calcReachable(unit);
    const candidates = [unit.hexId];
    for (const [hid] of reachable) {
      // （距離制限なし: evalGlobalBoardのドイツ到達hex数で自然に判定）
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

// ========== 連合軍ドクトリン移動 ==========

// ZOC戦線構築: 地図の端（上下）からZOC+ユニットが途切れなく連なる線を検出
function buildAlliedLine() {
  const alliedAlive = G.units.filter(u => u.side === 'allied' && !u.eliminated && !u.exited);
  const unitHexSet = new Set(alliedAlive.map(u => u.hexId));

  // 連合ユニットのZOC領域（ユニットhex + 敵のいない隣接hex）
  const zocSet = new Set();
  for (const u of alliedAlive) {
    zocSet.add(u.hexId);
    for (const nid of getNeighborIds(u.hexId)) {
      const enemyThere = G.units.some(e => e.hexId === nid && e.side === 'german' && !e.eliminated && !e.exited);
      if (!enemyThere) zocSet.add(nid);
    }
  }

  // BFS: 北端(row=0)からのZOC連結
  const northLine = new Set();
  const nq = [];
  for (let c = 0; c < COLS; c++) {
    const topHex = hexId(c, 0);
    if (zocSet.has(topHex)) { nq.push(topHex); northLine.add(topHex); }
  }
  while (nq.length > 0) {
    const hex = nq.shift();
    for (const nid of getNeighborIds(hex)) {
      if (zocSet.has(nid) && !northLine.has(nid)) {
        northLine.add(nid);
        nq.push(nid);
      }
    }
  }

  // BFS: 南端(row=ROWS-1)からのZOC連結
  const southLine = new Set();
  const sq = [];
  for (let c = 0; c < COLS; c++) {
    const botHex = hexId(c, ROWS - 1);
    if (zocSet.has(botHex)) { sq.push(botHex); southLine.add(botHex); }
  }
  while (sq.length > 0) {
    const hex = sq.shift();
    for (const nid of getNeighborIds(hex)) {
      if (zocSet.has(nid) && !southLine.has(nid)) {
        southLine.add(nid);
        sq.push(nid);
      }
    }
  }

  // 全体の戦線 = 北または南から到達可能
  const visited = new Set([...northLine, ...southLine]);

  // 戦線上のユニットを判定
  const onLine = new Set();
  for (const u of alliedAlive) {
    if (visited.has(u.hexId)) onLine.add(u.id);
  }

  // 余剰判定: このユニットを外しても戦線が繋がるなら必須ではない
  const essential = new Set(onLine);
  for (const uid of onLine) {
    const unit = alliedAlive.find(u => u.id === uid);
    if (!unit) continue;
    // このユニットを除いたZOCを再構築
    const testZoc = new Set();
    for (const u of alliedAlive) {
      if (u.id === uid) continue;
      testZoc.add(u.hexId);
      for (const nid of getNeighborIds(u.hexId)) {
        const enemyThere = G.units.some(e => e.hexId === nid && e.side === 'german' && !e.eliminated && !e.exited);
        if (!enemyThere) testZoc.add(nid);
      }
    }
    // BFSで戦線チェック
    const testVisited = new Set();
    const testQueue = [];
    for (let c = 0; c < COLS; c++) {
      const topHex = hexId(c, 0);
      const botHex = hexId(c, ROWS - 1);
      if (testZoc.has(topHex)) { testQueue.push(topHex); testVisited.add(topHex); }
      if (testZoc.has(botHex) && !testVisited.has(botHex)) { testQueue.push(botHex); testVisited.add(botHex); }
    }
    while (testQueue.length > 0) {
      const hex = testQueue.shift();
      for (const nid of getNeighborIds(hex)) {
        if (testZoc.has(nid) && !testVisited.has(nid)) {
          testVisited.add(nid);
          testQueue.push(nid);
        }
      }
    }
    // 他の戦線ユニットが全員まだ戦線上なら、このユニットは余剰
    let stillConnected = true;
    for (const otherId of onLine) {
      if (otherId === uid) continue;
      const other = alliedAlive.find(u => u.id === otherId);
      if (other && !testVisited.has(other.hexId)) {
        stillConnected = false;
        break;
      }
    }
    if (stillConnected) essential.delete(uid);
  }

  return { lineHexes: visited, onLine, essential, zocSet, unitHexSet, northLine, southLine };
}

// 表の敵に隣接しているかチェック
function hasAdjacentFaceUpEnemy(hid) {
  return getNeighborIds(hid).some(nid =>
    G.units.some(e => e.hexId === nid && e.side === 'german' && !e.eliminated && !e.exited && !e.flipped)
  );
}

// 道路hex上で戦線にいるか（動かしてはいけないユニット）
function isRoadGuard(unit, lineInfo) {
  if (!lineInfo.onLine.has(unit.id)) return false;
  const roads = ROAD_MAP && ROAD_MAP[unit.hexId];
  return roads && roads.length > 0;
}

// ドイツ到達hex数で移動の可否を判定
// 移動前の到達hexを基準に保持（ターン内で使い回す）
let _cachedGermanReachSize = null;
function getBaseGermanReach() {
  if (_cachedGermanReachSize === null) {
    _cachedGermanReachSize = mcCalcGermanReach().size;
  }
  return _cachedGermanReachSize;
}
function resetGermanReachCache() { _cachedGermanReachSize = null; }

// ユニットを仮移動してドイツ到達hexが増えるかチェック
// 許容増加量 = maxIncrease（デフォルト2）
function wouldIncreaseGermanReach(unit, destHex, maxIncrease) {
  if (maxIncrease === undefined) maxIncrease = 2;
  const baseReach = getBaseGermanReach();
  const savedHex = unit.hexId;
  unit.hexId = destHex;
  const newReach = mcCalcGermanReach().size;
  unit.hexId = savedHex;
  return newReach > baseReach + maxIncrease;
}

// サンビット装甲（9CC）か判定
function isStVithArmor(unit) {
  return unit.id === 'us_9cc_1' || unit.id === 'us_9cc_2';
}

// 9CC包囲判定: 退却先がなければ包囲されている
function is9CCSurrounded(unit) {
  if (!isStVithArmor(unit)) return false;
  for (const nid of getNeighborIds(unit.hexId)) {
    const t = TERRAIN_MAP[nid];
    if (!t || t === 'x') continue;
    // 敵がいるhexは退却不可
    if (G.units.some(e => e.hexId === nid && e.side === 'german' && !e.eliminated && !e.exited)) continue;
    // 味方で埋まっているhexも退却不可
    const friendlyStack = getUnitsAt(nid).filter(u => u.side === 'allied' && !u.eliminated && !u.exited);
    if (friendlyStack.length >= 2) continue;
    return false; // 退却先がある→包囲されていない
  }
  return true; // 退却先なし→包囲
}

// 1ターン目: 敵に隣接されているか判定
function isContactedByEnemy(unit) {
  return getNeighborIds(unit.hexId).some(nid =>
    G.units.some(e => e.hexId === nid && e.side === 'german' && !e.eliminated && !e.exited)
  );
}

// 味方ユニットの左・左上・左下（画面左=東=ドイツ攻撃方向）に敵がいるか
function hasEnemyOnLeft(unit) {
  const { col, row } = parseHexId(unit.hexId);
  const neighbors = getNeighbors(col, row);
  // index 5 = 左上, index 4 = 左, index 3 = 左下
  for (const idx of [3, 4, 5]) {
    const [nc, nr] = neighbors[idx];
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    const nid = hexId(nc, nr);
    if (G.units.some(e => e.hexId === nid && e.side === 'german' && !e.eliminated && !e.exited)) {
      return true;
    }
  }
  return false;
}

// 敵隣接チェック（裏表問わず全敵）
function hasAdjacentEnemy(hid) {
  return getNeighborIds(hid).some(nid =>
    G.units.some(e => e.hexId === nid && e.side === 'german' && !e.eliminated && !e.exited)
  );
}

// 穴埋め移動: 除去されたユニット位置の近辺道路hexへ非必須ユニットを移動
function findGapFillMove(movable, lineInfo) {
  if (!G.eliminatedAlliedHexes || G.eliminatedAlliedHexes.length === 0) return null;

  const nonEssential = movable.filter(u => !lineInfo.essential.has(u.id));
  if (nonEssential.length === 0) return null;

  // 除去hexとその隣接hexで道路上のものを候補に
  const targetHexes = new Set();
  for (const elimHex of G.eliminatedAlliedHexes) {
    if (ROAD_MAP && ROAD_MAP[elimHex]) targetHexes.add(elimHex);
    for (const nid of getNeighborIds(elimHex)) {
      if (ROAD_MAP && ROAD_MAP[nid]) targetHexes.add(nid);
    }
  }
  // 既にユニットがいるhexは除外
  for (const hid of [...targetHexes]) {
    if (G.units.some(u => u.hexId === hid && !u.eliminated && !u.exited)) {
      targetHexes.delete(hid);
    }
  }
  if (targetHexes.size === 0) return null;

  for (const unit of nonEssential) {
    const reachable = calcReachable(unit);
    let bestHex = null;
    let bestPathLen = Infinity;

    for (const [hid, info] of reachable) {
      if (hid === unit.hexId) continue;
      if (!targetHexes.has(hid)) continue;
      // ターン1-2: 敵隣接禁止
      if (G.turn <= 2 && hasAdjacentEnemy(hid)) continue;
      // スタック制限
      const dest = getUnitsAt(hid).filter(u => u.side === unit.side);
      if (dest.length > 0 && !(unit.mechPair && dest.length < 2 && dest[0].id === unit.mechPair)) continue;

      if (info.path.length < bestPathLen) {
        bestHex = hid;
        bestPathLen = info.path.length;
      }
    }

    if (bestHex) return { unit, hex: bestHex };
  }
  return null;
}

// 道路封鎖移動: バストーニュ・サンビットへの道路になるべく前方に配置
function findRoadBlockMove(movable, lineInfo) {
  const nonEssential = movable.filter(u => !lineInfo.essential.has(u.id));
  if (nonEssential.length === 0) return null;

  // バストーニュ(1114)ルート: 1,4,5  サンビット(1508)ルート: 2,3,4,5
  // バストーニュ優先
  const targets = [
    { city: BASTOGNE, routes: [1, 4, 5] },
    { city: ST_VITH, routes: [2, 3, 4, 5] }
  ];

  for (const target of targets) {
    const cityCol = parseInt(target.city.substring(0, 2));

    // ルート上で都市より東（内部col小=画面左=前方）の空き道路hex
    const roadHexes = [];
    for (const [hid, routes] of Object.entries(ROAD_MAP)) {
      if (!routes.some(r => target.routes.includes(r))) continue;
      const hCol = parseInt(hid.substring(0, 2));
      if (hCol >= cityCol) continue; // 都市と同じか西は対象外
      if (G.units.some(u => u.hexId === hid && !u.eliminated && !u.exited)) continue;
      if (hasAdjacentEnemy(hid)) continue; // ターン1なので敵隣接禁止
      roadHexes.push(hid);
    }

    // より東（内部col小=前方）を優先
    roadHexes.sort((a, b) => parseInt(a.substring(0, 2)) - parseInt(b.substring(0, 2)));

    for (const targetHex of roadHexes) {
      for (const unit of nonEssential) {
        const reachable = calcReachable(unit);
        if (!reachable.has(targetHex)) continue;
        // スタック制限
        const dest = getUnitsAt(targetHex).filter(u => u.side === unit.side);
        if (dest.length > 0 && !(unit.mechPair && dest.length < 2 && dest[0].id === unit.mechPair)) continue;
        return { unit, hex: targetHex };
      }
    }
  }
  return null;
}

// 連合軍ドクトリン移動メイン（シンプル版）
// ルール1: 基本パス
// ルール2: 左・左上・左下に敵 → 戦線維持しながら逃避
// ルール3: ユニット除去 → 非必須ユニットで近辺道路の穴埋め
// ルール4: 1ターン目+ドイツパス → 道路封鎖（バストーニュ優先）
// ルール5: 1-2ターンは敵隣接禁止
// ルール6: 82空挺→バストーニュ強制行軍（mustMarchToCityで処理済み）
// ルール7: 9CC移動・戦闘禁止（包囲時は逃避許可）
function mcAlliedDoctrineMove() {
  const units = G.units.filter(u =>
    u.side === 'allied' && !u.acted && !u.flipped && !u.eliminated && !u.exited
  );
  if (units.length === 0) return null;

  // 9CC包囲時の緊急逃避（他のフィルタより先に判定）
  for (const unit of units) {
    if (isStVithArmor(unit) && is9CCSurrounded(unit)) {
      const lineInfo = buildAlliedLine();
      const result = findEscapeHex(unit, lineInfo, false);
      if (result) return result;
    }
  }

  // 9CCは通常移動禁止
  const movable = units.filter(u => !mustHoldCity(u) && mustMarchToCity(u) === null && !isStVithArmor(u));

  const lineInfo = buildAlliedLine();

  // ルール9: 1ターン+ドイツパス → 9CCサンビット交代（敵非隣接が条件）
  if (G.turn === 1 && G.passCount >= 1) {
    const nineCCAtStV = units.filter(u => isStVithArmor(u) && u.hexId === ST_VITH);

    if (nineCCAtStV.length > 0 && !hasAdjacentEnemy(ST_VITH)) {
      // 9CCをサンビットから出す（unstackingで1ユニットずつ）
      const nineCCUnit = nineCCAtStV.find(u => !u.acted && !u.flipped);
      if (nineCCUnit) {
        const result = findLineBuildHex(nineCCUnit, lineInfo);
        if (result) return result;
      }
    }

    // 9CCが全員出た後 → サンビットに交代要員を送る
    const any9CCAtStV = G.units.some(u =>
      u.hexId === ST_VITH && isStVithArmor(u) && !u.eliminated && !u.exited
    );
    const anyAlliedAtStV = G.units.some(u =>
      u.hexId === ST_VITH && u.side === 'allied' && !isStVithArmor(u) && !u.eliminated && !u.exited
    );
    if (!any9CCAtStV && !anyAlliedAtStV) {
      // サンビットが空 → 到達可能なユニットを送る（最優先）
      for (const unit of movable) {
        if (unit.acted) continue;
        const reachable = calcReachable(unit);
        if (!reachable.has(ST_VITH)) continue;
        if (G.turn <= 2 && hasAdjacentEnemy(ST_VITH)) continue;
        return { unit, hex: ST_VITH };
      }
    }
  }

  if (movable.length === 0) return null;

  // ルール10: 1ターンにEX/DEが出たら14CCを左下2ヘクス(内部1809)へ移動（戦闘許可）
  if (G.turn === 1 && G._turn1CombatTriggered) {
    const unit14cc = movable.find(u => u.id === 'us_14cc');
    if (unit14cc) {
      const reachable = calcReachable(unit14cc);
      if (reachable.has('1809')) {
        const dest = getUnitsAt('1809').filter(u => u.side === 'allied');
        if (dest.length === 0 || (unit14cc.mechPair && dest.length < 2 && dest[0].id === unit14cc.mechPair)) {
          return { unit: unit14cc, hex: '1809' };
        }
      }
    }
  }

  // ルール2: 左・左上・左下に敵がいるユニットは逃避
  for (const unit of movable) {
    if (hasEnemyOnLeft(unit)) {
      const result = findEscapeHex(unit, lineInfo, false);
      if (result) return result;
    }
  }

  // ルール3: 除去されたユニットの穴埋め
  if (G.eliminatedAlliedHexes && G.eliminatedAlliedHexes.length > 0) {
    const result = findGapFillMove(movable, lineInfo);
    if (result) return result;
  }

  // ルール4: 1ターン目 + ドイツパス済み → 道路封鎖
  if (G.turn === 1 && G.passCount >= 1) {
    const result = findRoadBlockMove(movable, lineInfo);
    if (result) return result;
  }

  // ルール8: 1ターン目+ドイツパス → サンビット以外の動ける部隊は戦線構築
  if (G.turn === 1 && G.passCount >= 1) {
    const builders = movable.filter(u => u.hexId !== ST_VITH);
    for (const unit of builders) {
      const result = findLineBuildHex(unit, lineInfo);
      if (result) return result;
    }
  }

  // 増援ユニット + 2ターン目以降の4歩兵は戦線構築へ
  const reinforcements = movable.filter(u => u.entryTag || (G.turn >= 2 && u.id === 'us_4inf'));
  for (const unit of reinforcements) {
    const result = findLineBuildHex(unit, lineInfo);
    if (result) return result;
  }

  // デフォルトはパス
  return null;
}

// 逃避hex探索
// 最優先: 味方と隣接せず戦線を維持するhex（敵隣接は許容）
// 次点: 道路あり・地形ありを優先
function findEscapeHex(unit, lineInfo, noEast) {
  const reachable = calcReachable(unit);
  const currentHex = unit.hexId;
  const fromCol = parseInt(currentHex.substring(0, 2));

  const candidates = [];

  for (const [hid, info] of reachable) {
    if (hid === currentHex) continue;
    const toCol = parseInt(hid.substring(0, 2));
    if (noEast && toCol >= fromCol) continue;
    // スタック制限のみチェック（敵隣接は許容）
    const dest = getUnitsAt(hid).filter(u => u.side === unit.side);
    if (dest.length > 0 && !(unit.mechPair && dest.length < 2 && dest[0].id === unit.mechPair)) continue;

    // 味方に直接隣接しているか
    const adjFriendly = getNeighborIds(hid).some(nid =>
      G.units.some(u => u.hexId === nid && u.side === 'allied' && u.id !== unit.id && !u.eliminated && !u.exited)
    );

    // 戦線維持チェック: このhexに移動しても北南が繋がるか
    const savedHex = unit.hexId;
    unit.hexId = hid;
    const testLine = buildAlliedLine();
    let lineConnected = false;
    for (const hex of testLine.northLine) {
      if (testLine.southLine.has(hex)) { lineConnected = true; break; }
    }
    unit.hexId = savedHex;

    const roads = ROAD_MAP && ROAD_MAP[hid];
    const isRoad = roads && roads.length > 0;
    const terrain = TERRAIN_MAP[hid];

    candidates.push({
      hid, info,
      adjFriendly,
      lineConnected,
      isRoad,
      terrain,
      pathLen: info.path.length
    });
  }

  if (candidates.length === 0) return null;

  // ソート: 味方非隣接+戦線維持 > 戦線維持 > それ以外。同等なら道路・地形・最短パス
  candidates.sort((a, b) => {
    // 1. 味方非隣接+戦線維持が最優先
    const aTop = (!a.adjFriendly && a.lineConnected) ? 1 : 0;
    const bTop = (!b.adjFriendly && b.lineConnected) ? 1 : 0;
    if (aTop !== bTop) return bTop - aTop;
    // 2. 戦線維持
    if (a.lineConnected !== b.lineConnected) return a.lineConnected ? -1 : 1;
    // 3. 道路あり
    if (a.isRoad !== b.isRoad) return a.isRoad ? -1 : 1;
    // 4. 地形あり（森林）
    const aForest = a.terrain === 'f' ? 1 : 0;
    const bForest = b.terrain === 'f' ? 1 : 0;
    if (aForest !== bForest) return bForest - aForest;
    // 5. 最短パス
    return a.pathLen - b.pathLen;
  });

  return { unit, hex: candidates[0].hid };
}

// 戦線構築hex探索（穴埋め）
// 戦線に隣接するhexへ最短距離で移動
function findLineBuildHex(unit, lineInfo) {
  const reachable = calcReachable(unit);
  const currentHex = unit.hexId;

  // 戦線に必須のユニットは動かない（余剰なら移動可）
  if (lineInfo.essential.has(unit.id)) return null;

  let bestHex = null;
  let bestPathLen = Infinity;
  let bestScore = 0;

  for (const [hid, info] of reachable) {
    if (hid === currentHex) continue;
    // 敵隣接チェック: ターン1-2は全敵、ターン3+は表の敵のみ
    if (G.turn <= 2) {
      if (hasAdjacentEnemy(hid)) continue;
    } else {
      if (hasAdjacentFaceUpEnemy(hid)) continue;
    }
    // スタック制限
    const dest = getUnitsAt(hid).filter(u => u.side === unit.side);
    if (dest.length > 0 && !(unit.mechPair && dest.length < 2 && dest[0].id === unit.mechPair)) continue;

    // 既に戦線が通っているhexはスキップ（既存戦線に集まらない）
    if (lineInfo.lineHexes.has(hid)) continue;

    // 戦線構築スコア: 短い方の線を優先して均等に構築
    const neighbors = getNeighborIds(hid);
    const adjNorth = neighbors.filter(n => lineInfo.northLine.has(n)).length;
    const adjSouth = neighbors.filter(n => lineInfo.southLine.has(n)).length;
    // 短い方の線にボーナス（均等化）
    const northShorter = lineInfo.northLine.size <= lineInfo.southLine.size;
    const southShorter = lineInfo.southLine.size <= lineInfo.northLine.size;
    const northBonus = (adjNorth > 0 ? 2 : 0) * (northShorter ? 3 : 1);
    const southBonus = (adjSouth > 0 ? 2 : 0) * (southShorter ? 3 : 1);
    const edgeScore = northBonus + southBonus;
    const adjToLine = neighbors.filter(n => lineInfo.lineHexes.has(n)).length;
    const score = edgeScore * 10 + adjToLine;
    const pathLen = info.path.length;

    // スコア高い方を優先、同等なら最短パス
    if (!bestScore || score > bestScore || (score === bestScore && pathLen < bestPathLen)) {
      bestHex = hid; bestPathLen = pathLen; bestScore = score;
    }
  }

  if (bestHex) return { unit, hex: bestHex };
  return null;
}
