// bulge_mcts.js — 静的評価AI（ドクトリンベース、プレイアウト廃止）
'use strict';

const MC = { SIMS: 0 }; // 互換用（未使用）

// ========== 死守都市 ==========
const HOLD_CITIES = ['1508', '1114']; // ST.VITH, BASTOGNE
const BASTOGNE = '1114';
const ST_VITH = '1508';

// 強制都市移動の定義: { unitId, targetHex, condition }
const FORCED_CITY_MARCH = [
  { id: 'us_82',   target: BASTOGNE },
  { id: 'us_1inf', target: ST_VITH }
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
  // 1歩兵: サンビットに味方がいれば強制しない
  if (unit.id === 'us_1inf') {
    const stVithUnits = getUnitsAt(ST_VITH).filter(u => u.side === 'allied');
    if (stVithUnits.length > 0) return null;
  }
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
  return reachSet;
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

  // BFS: 地図の上端(row=0)・下端(row=ROWS-1)からzocSetを通じて到達可能なhexを探索
  const visited = new Set();
  const queue = [];
  for (let c = 0; c < COLS; c++) {
    const topHex = hexId(c, 0);
    const botHex = hexId(c, ROWS - 1);
    if (zocSet.has(topHex)) { queue.push(topHex); visited.add(topHex); }
    if (zocSet.has(botHex) && !visited.has(botHex)) { queue.push(botHex); visited.add(botHex); }
  }
  while (queue.length > 0) {
    const hex = queue.shift();
    for (const nid of getNeighborIds(hex)) {
      if (zocSet.has(nid) && !visited.has(nid)) {
        visited.add(nid);
        queue.push(nid);
      }
    }
  }

  // 戦線上のユニットを判定
  const onLine = new Set();
  for (const u of alliedAlive) {
    if (visited.has(u.hexId)) onLine.add(u.id);
  }

  return { lineHexes: visited, onLine, zocSet, unitHexSet };
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

// 1ターン目: 敵に隣接されているか判定
function isContactedByEnemy(unit) {
  return getNeighborIds(unit.hexId).some(nid =>
    G.units.some(e => e.hexId === nid && e.side === 'german' && !e.eliminated && !e.exited)
  );
}

// 1ターン目のサンビット装甲移動: スタック解除して西方へ後退のみ
function findStVithArmorMove(unit) {
  // ペアと同じhexにいなければ既にスタック解除済み→動かない
  const pair = G.units.find(u => u.id === unit.mechPair && !u.eliminated && !u.exited);
  if (!pair || pair.hexId !== unit.hexId) return null;

  const reachable = calcReachable(unit);
  const fromCol = parseInt(unit.hexId.substring(0, 2));
  let bestHex = null, bestScore = -Infinity;

  for (const [hid] of reachable) {
    if (hid === unit.hexId) continue;
    const toCol = parseInt(hid.substring(0, 2));
    // 東方向移動禁止（前に出ない）
    if (toCol >= fromCol) continue;
    // 表の敵に隣接禁止
    if (hasAdjacentFaceUpEnemy(hid)) continue;
    // スタック制限（移動先に味方がいない）
    const dest = getUnitsAt(hid).filter(u => u.side === 'allied' && u.id !== unit.id);
    if (dest.length > 0) continue;

    let score = 0;
    // より西へ行くほどボーナス（安全圏へ）
    score += (fromCol - toCol) * 5;
    // 道路hexボーナス
    const roads = ROAD_MAP && ROAD_MAP[hid];
    if (roads && roads.length > 0) score += roads.length * 3;
    // 退却先の多さ
    const tempUnit = Object.assign({}, unit, { hexId: hid });
    const retreats = mcCountRetreats(G.units, tempUnit);
    score += retreats * 4;

    if (score > bestScore) { bestScore = score; bestHex = hid; }
  }

  if (bestHex) return { unit, hex: bestHex };
  return null;
}

// 連合軍ドクトリン移動メイン
function mcAlliedDoctrineMove() {
  const units = G.units.filter(u =>
    u.side === 'allied' && !u.acted && !u.flipped && !u.eliminated && !u.exited
  );
  if (units.length === 0) return null;

  const movable = units.filter(u => !mustHoldCity(u) && mustMarchToCity(u) === null);
  if (movable.length === 0) return null;

  // === 1ターン目特殊ルール ===
  if (G.turn === 1) {
    // サンビット装甲: スタック解除して西方後退のみ
    for (const unit of movable) {
      if (isStVithArmor(unit)) {
        const result = findStVithArmorMove(unit);
        if (result) return result;
      }
    }
    // その他の連合軍: 敵に隣接されていなければ動けない
    const contacted = movable.filter(u => !isStVithArmor(u) && isContactedByEnemy(u));
    if (contacted.length === 0) return null; // 誰も接敵していない→全員パス

    // 接敵されたユニットのみ通常ドクトリンで処理
    const lineInfo = buildAlliedLine();
    resetGermanReachCache();
    for (const unit of contacted) {
      const retreats = mcCountRetreats(G.units, unit);
      if (retreats <= 1) {
        const result = findSafeHex(unit, lineInfo);
        if (result) return result;
      }
    }
    return null; // 接敵されているが安全な移動先がない→パス
  }

  // === 2ターン目以降: 通常ドクトリン ===
  const lineInfo = buildAlliedLine();
  resetGermanReachCache(); // ターン内キャッシュリセット

  // 優先1: 包囲されそう（退却先<=1）→ 逃げる（生存優先）
  for (const unit of movable) {
    const retreats = mcCountRetreats(G.units, unit);
    if (retreats <= 1) {
      const result = findSafeHex(unit, lineInfo);
      if (result) return result;
    }
  }

  // 優先2: 戦線上で表の敵に隣接 → 後退して新しい戦線を張る
  //   条件: 移動後にドイツ到達hex数が大幅に増えないこと
  for (const unit of movable) {
    if (!lineInfo.onLine.has(unit.id)) continue;
    if (!hasAdjacentFaceUpEnemy(unit.hexId)) continue;
    const result = findSafeHex(unit, lineInfo);
    if (result) return result;
  }

  // 優先3: 戦線から離れたユニット → 穴埋めに移動
  const disconnected = movable.filter(u => !lineInfo.onLine.has(u.id));
  if (disconnected.length > 0) {
    let bestResult = null, bestScore = -Infinity;
    for (const unit of disconnected) {
      const result = findGapFillHex(unit, lineInfo);
      if (result && result.score > bestScore) {
        bestScore = result.score;
        bestResult = { unit: result.unit, hex: result.hex };
      }
    }
    if (bestResult) return bestResult;
  }

  // 戦線上のユニット → 動かない（パス）
  return null;
}

// 安全なhexを探す（逃避用）
function findSafeHex(unit, lineInfo) {
  const reachable = calcReachable(unit);
  const fromCol = parseInt(unit.hexId.substring(0, 2));
  let bestHex = null, bestScore = -Infinity;

  for (const [hid] of reachable) {
    const toCol = parseInt(hid.substring(0, 2));
    // 東方向2ヘクス以上移動禁止
    if (toCol - fromCol >= 2) continue;
    // 表の敵に自分から隣接しない
    if (hasAdjacentFaceUpEnemy(hid)) continue;
    // スタック制限
    const dest = getUnitsAt(hid).filter(u => u.side === unit.side);
    if (dest.length > 0 && !(unit.mechPair && dest.length < 2 && dest[0].id === unit.mechPair)) continue;

    // ドイツ到達hex数チェック: 移動後に敵の進出範囲が広がるなら却下
    if (wouldIncreaseGermanReach(unit, hid, 2)) continue;

    let score = 0;

    // 退却先の多さ = 安全性
    const tempUnit = Object.assign({}, unit, { hexId: hid });
    const futureRetreats = mcCountRetreats(G.units, tempUnit);
    score += futureRetreats * 8;
    if (futureRetreats === 0) score -= 50;

    // 道路hex = 重要防衛拠点
    const roads = ROAD_MAP && ROAD_MAP[hid];
    if (roads && roads.length > 0) score += roads.length * 5;

    // ZOC連結: 味方の2hex先にいる = ZOC重複で壁
    let zocLink = 0;
    for (const nid of getNeighborIds(hid)) {
      if (getNeighborIds(nid).some(n2 => lineInfo.unitHexSet.has(n2) && n2 !== unit.hexId)) zocLink++;
    }
    score += zocLink * 6;

    // 味方直接隣接（密な戦線）
    const adjFriend = getNeighborIds(hid).filter(nid =>
      lineInfo.unitHexSet.has(nid) && nid !== unit.hexId
    ).length;
    score += adjFriend * 4;

    // 東に行くほど減点（前に出すぎない）
    score -= (toCol - fromCol) * 3;

    if (score > bestScore) { bestScore = score; bestHex = hid; }
  }

  if (bestHex && bestHex !== unit.hexId) return { unit, hex: bestHex };
  return null;
}

// 戦線の穴埋めhexを探す（戦線から離れたユニット用）
function findGapFillHex(unit, lineInfo) {
  const reachable = calcReachable(unit);
  const fromCol = parseInt(unit.hexId.substring(0, 2));
  let bestHex = null, bestScore = -Infinity;

  for (const [hid] of reachable) {
    const toCol = parseInt(hid.substring(0, 2));
    // 東方向2ヘクス以上移動禁止
    if (toCol - fromCol >= 2) continue;
    // 表の敵に自分から隣接しない
    if (hasAdjacentFaceUpEnemy(hid)) continue;
    // スタック制限
    const dest = getUnitsAt(hid).filter(u => u.side === unit.side);
    if (dest.length > 0 && !(unit.mechPair && dest.length < 2 && dest[0].id === unit.mechPair)) continue;

    // ドイツ到達hex数チェック: 移動後に敵の進出範囲が広がるなら却下
    if (wouldIncreaseGermanReach(unit, hid, 2)) continue;

    let score = 0;

    // ドイツ到達hexを減らすほど高評価
    const savedHex = unit.hexId;
    unit.hexId = hid;
    const newReach = mcCalcGermanReach().size;
    unit.hexId = savedHex;
    const reachDelta = getBaseGermanReach() - newReach;
    score += reachDelta * 5; // 敵の到達範囲を縮めるほどボーナス

    // 戦線に隣接する位置 = 穴埋め効果大
    const adjToLine = getNeighborIds(hid).filter(nid => lineInfo.lineHexes.has(nid)).length;
    score += adjToLine * 10;

    // 道路hex優先
    const roads = ROAD_MAP && ROAD_MAP[hid];
    if (roads && roads.length > 0) score += roads.length * 5;

    // ZOC連結
    let zocLink = 0;
    for (const nid of getNeighborIds(hid)) {
      if (getNeighborIds(nid).some(n2 => lineInfo.unitHexSet.has(n2) && n2 !== unit.hexId)) zocLink++;
    }
    score += zocLink * 6;

    // 安全性
    const tempUnit = Object.assign({}, unit, { hexId: hid });
    const futureRetreats = mcCountRetreats(G.units, tempUnit);
    score += futureRetreats * 3;
    if (futureRetreats === 0) score -= 50;

    // 東に行くほど減点
    score -= (toCol - fromCol) * 3;

    if (score > bestScore) { bestScore = score; bestHex = hid; }
  }

  if (bestHex && bestHex !== unit.hexId) return { unit, hex: bestHex, score: bestScore };
  return null;
}
