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

// ========== CRT期待値計算（ダイス3固定）==========
function mcExpectedCombat(atkPower, defPower, support, isForest, defRetreatCount) {
  const differential = atkPower - defPower + support - (isForest ? 1 : 0);
  const result = lookupCRT(differential, 3);
  let atkLoss = 0, defLoss = 0;
  if (result === 'DE') { defLoss = 1.0; }
  else if (result === 'DD') { defLoss = defRetreatCount === 0 ? 1.0 : 0.5; }
  else if (result === 'DR') { defLoss = defRetreatCount === 0 ? 1.0 : 0.2; }
  else if (result === 'EX') { atkLoss = 0.5; defLoss = 1.0; }
  else if (result === 'AR') { atkLoss = 0.5; }
  // NE: 両方0
  return { atkLoss, defLoss };
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
    for (const n1 of getNeighborIds(gu.hexId)) {
      const t1 = TERRAIN_MAP[n1];
      if (!t1 || t1 === 'x') continue;
      if (alliedHexes.has(n1)) continue;
      // 装甲は道路なし森に入れない
      if (t1 === 'f' && !hasRoadBetween(gu.hexId, n1)) continue;
      reachSet.add(n1);
      if (alliedZOC.has(n1)) continue;
      for (const n2 of getNeighborIds(n1)) {
        const t2 = TERRAIN_MAP[n2];
        if (!t2 || t2 === 'x') continue;
        if (alliedHexes.has(n2)) continue;
        if (t2 === 'f' && !hasRoadBetween(n1, n2)) continue;
        reachSet.add(n2);
        if (alliedZOC.has(n2)) continue;
        for (const n3 of getNeighborIds(n2)) {
          const t3 = TERRAIN_MAP[n3];
          if (!t3 || t3 === 'x') continue;
          if (alliedHexes.has(n3)) continue;
          if (t3 === 'f' && !hasRoadBetween(n2, n3)) continue;
          reachSet.add(n3);
        }
      }
    }
  }
  return reachSet;
}

// ========== ドイツMC移動計画 ==========
// 全ユニットの全移動先の全組み合わせをシミュレーションし、最良の配置を採用

// 仮盤面で戦闘をダイス3固定で解決し、盤面スコアを返す
function mcSimCombatsAndScore(simUnits) {
  // 隣接する敵を見つけて戦闘を仮解決
  const germanAlive = simUnits.filter(u => u.side === 'german' && !u.eliminated && !u.exited);
  const alliedAlive = simUnits.filter(u => u.side === 'allied' && !u.eliminated && !u.exited);
  const fought = new Set(); // 処理済み防御hex

  for (const gu of germanAlive) {
    for (const nid of getNeighborIds(gu.hexId)) {
      if (fought.has(nid)) continue;
      const defenders = alliedAlive.filter(u => u.hexId === nid && !u._simElim);
      if (defenders.length === 0) continue;
      fought.add(nid);

      // この防御hexに隣接する全ドイツユニットで攻撃
      const attackers = germanAlive.filter(a =>
        !a._simElim && getNeighborIds(a.hexId).includes(nid)
      );
      if (attackers.length === 0) continue;

      const atkPower = attackers.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
      const defPower = defenders.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);

      // 支援計算
      let support = 0;
      const facility = FACILITY_MAP && FACILITY_MAP[nid];
      if (facility !== 'c') {
        for (const adjId of getNeighborIds(nid)) {
          support += simUnits.filter(u =>
            u.hexId === adjId && u.side === 'german' && !u._simElim
            && !attackers.some(a => a.id === u.id)
          ).length;
        }
      }

      const isForest = TERRAIN_MAP[nid] === 'f';
      let diff = atkPower - defPower;
      let modDie = 3 + support;
      let result = lookupCRT(diff, modDie);
      if (isForest) {
        const FOREST_SHIFT = { DE:'EX', EX:'DD', DD:'DR', DR:'NE', NE:'AR', AR:'AR' };
        result = FOREST_SHIFT[result] || result;
      }

      // 退路チェック（包囲判定）
      let defRetreatCount = 6;
      for (const d of defenders) {
        // 仮盤面での退路: 簡易判定（隣接6hexから敵ZOCなしのhex数）
        let retreats = 0;
        for (const rn of getNeighborIds(d.hexId)) {
          const t = TERRAIN_MAP[rn];
          if (!t || t === 'x') continue;
          if (simUnits.some(u => u.hexId === rn && u.side === 'german' && !u._simElim)) continue;
          const hasZOC = getNeighborIds(rn).some(zn =>
            simUnits.some(u => u.hexId === zn && u.side === 'german' && !u._simElim)
          );
          if (!hasZOC) retreats++;
        }
        if (retreats < defRetreatCount) defRetreatCount = retreats;
      }

      // 結果を仮適用
      if (result === 'DE') {
        defenders.forEach(u => { u._simElim = true; });
      } else if (result === 'DD' || result === 'DR') {
        if (defRetreatCount === 0) {
          defenders.forEach(u => { u._simElim = true; }); // 退路なし=壊滅
        }
        // 退路ありなら退却（位置変更は省略、混乱フラグのみ）
        if (result === 'DD') defenders.forEach(u => { u._simFlipped = true; });
      } else if (result === 'EX') {
        attackers[0]._simElim = true;
        defenders[0]._simElim = true;
      } else if (result === 'AR') {
        // 攻撃側退却（省略）
      }
    }
  }

  // 盤面スコア計算
  let score = 0;
  const cityHexes = mcGetCityHexes();

  for (const u of simUnits) {
    if (u._simElim) {
      // 敵壊滅 = +30、味方壊滅 = -30
      score += u.side === 'allied' ? 30 : -30;
      continue;
    }
    if (u.side !== 'german' || u.eliminated || u.exited) continue;

    const col = parseInt(u.hexId.substring(0, 2));
    // 西進ボーナス
    score += (20 - col) * 2;
    // 都市占領
    for (const ch of cityHexes) {
      if (u.hexId === ch) score += 20;
      else if (hexDist(u.hexId, ch) === 1) score += 5;
    }
    // NW突破hex接近
    const nwHexes = getNWExitHexes();
    if (nwHexes.includes(u.hexId) && isMechanized(u)) score += 40;
  }

  // 敵の混乱
  for (const u of simUnits) {
    if (u.side === 'allied' && u._simFlipped && !u._simElim) score += 10;
  }

  return score;
}

// ========== ドイツ軍の思考（地区別） ==========
// 1手ごとに:
//   1. 戦車（装甲のペア）を北 → 中央 → 南の順に。まだ動いていない戦車がいる地区の戦車だけで
//      行き先の組み合わせを試し（1組あたり上位の行き先に絞る。4組以上いれば最も左の3組）、最良の配置で最初に動く戦車を動かす
//      - 地区: 北=1SS・12SS、中央=Lehr、南=2Pz・116Pz。増援の装甲は北か中央の近いほう
//      - ターン2から、連合が St. Vith を持っていれば、中央の戦車に St. Vith 攻略の点を足す
//        （北の戦車は、このターンに St. Vith の隣まで来られるときだけ）
//   2. 戦車が動き終わったら歩兵。どんどん左（西）へ進み、ほかのドイツ軍と1〜2ヘクス空けて並ぶ形を好む
//      表の連合軍の隣は避け、裏返った連合軍に有利なら隣接してつつく
//   3. なければパス
const DE_AREA_INIT = {
  de_1ss_1:'north', de_1ss_2:'north', de_12ss_1:'north', de_12ss_2:'north',
  de_lehr_1:'center', de_lehr_2:'center',
  de_2pz_1:'south', de_2pz_2:'south', de_116_1:'south', de_116_2:'south'
};
const DE_AREA_NAME = { north:'北', center:'中央', south:'南' };
const DE_AREA_ROW = { north: 5.5, center: 10 }; // 増援の振り分けの目安（初期配置の行）
const DE_ST_VITH_BONUS = 15;

function deArea(u) {
  if (DE_AREA_INIT[u.id]) return DE_AREA_INIT[u.id];
  if (!u._deArea) {
    // 増援: 北か中央の近いほう
    const r = parseHexId(u.hexId).row;
    u._deArea = Math.abs(r - DE_AREA_ROW.north) <= Math.abs(r - DE_AREA_ROW.center) ? 'north' : 'center';
    if (u.mechPair) { const p = G.units.find(x => x.id === u.mechPair); if (p) p._deArea = u._deArea; }
  }
  return u._deArea;
}
function deAlive(u) { return !u.eliminated && !u.exited && u.hexId && u.hexId.length === 4; }
function deMovable(u) { return u.side === 'german' && deAlive(u) && !u.acted && !u.flipped; }
function deStVithHeld() { return getUnitsAt(ST_VITH).some(u => u.side === 'allied'); }
function deStackOk(unit, hid) {
  return getUnitsAt(hid).filter(u => u.side === 'german' && u.id !== unit.id && u.id !== unit.mechPair).length === 0;
}
// St. Vith 攻略の点（ターン2から、連合が St. Vith を持っているとき）
function deStVithBonus(area, hid, canReachAdj) {
  if (G.turn < 2 || !deStVithHeld()) return 0;
  if (area !== 'center' && !(area === 'north' && canReachAdj)) return 0;
  const d = hexDist(hid, ST_VITH);
  return d === 1 ? DE_ST_VITH_BONUS : d === 2 ? 4 : 0;
}

function mcGermanMCPlan() {
  const savedDbg = window.dbg;
  window.dbg = () => {}; // 仮の計算が多いので、計算中のデバッグ出力は止める
  try { return deThink(); }
  finally { window.dbg = savedDbg; }
}

function deThink() {
  const movable = G.units.filter(deMovable);
  if (!movable.length) return null;

  // ===== 1. 戦車（地区別） =====
  const seen = new Set();
  const stacks = [];
  for (const u of movable) {
    if (!isMechanized(u) || seen.has(u.id)) continue;
    seen.add(u.id);
    const pair = isStacked(u) ? movable.find(p => p.id === u.mechPair) : null;
    if (pair) seen.add(pair.id);
    stacks.push({ unit: u, pair, area: deArea(u) });
  }
  for (const area of ['north', 'center', 'south']) {
    // 4組以上いるときは、最も左（前）にいる3組だけで組み合わせを試す（残りは次の手番以降）
    const st = stacks.filter(x => x.area === area)
      .sort((p, q) => parseHexId(p.unit.hexId).col - parseHexId(q.unit.hexId).col).slice(0, 3);
    if (!st.length) continue;
    const plan = dePlanArea(area, st);
    if (plan) {
      addLog('move', `[AI判断] 戦車（${DE_AREA_NAME[area]}）: ${plan.st.unit.name} を ${dispHex(plan.hex)} へ${plan.note}`);
      return { unit: plan.st.unit, hex: plan.hex, unstack: false };
    }
  }

  // ===== 2. 歩兵 =====
  const inf = movable.filter(u => !isMechanized(u));
  let best = null;
  for (const u of inf) {
    const fromCol = parseHexId(u.hexId).col;
    const mates = G.units.filter(g => g.side === 'german' && g.id !== u.id && deAlive(g));
    for (const [hid, info] of calcReachable(u)) {
      if (hid === u.hexId || !deStackOk(u, hid)) continue;
      const col = parseHexId(hid).col;
      let s = (fromCol - col) * 3; // 左へ
      // 戦線の形: ほかのドイツ軍と1〜2ヘクス空け（距離2〜3）で並ぶ
      s += Math.min(3, mates.filter(g => { const d = hexDist(g.hexId, hid); return d === 2 || d === 3; }).length) * 2;
      if (FACILITY_MAP[hid] === 'c' && !getUnitsAt(hid).length) s += 20;
      // 連合軍の隣: 表の敵は避ける。裏返った敵に有利ならつつく
      const adjAllies = getNeighborIds(hid).flatMap(n => getUnitsAt(n).filter(e => e.side === 'allied'));
      let note = '';
      if (adjAllies.length) {
        const faceUp = adjAllies.some(e => !e.flipped);
        const defP = adjAllies.reduce((t, e) => t + (e.flipped ? e.def : e.atk), 0);
        if (faceUp) s -= 20;
        else if (u.atk - defP >= 2) { s += 10; note = '（裏返った連合軍をつつく）'; }
        else s -= 20;
      }
      s -= info.path.length * 0.05;
      if (s > 0 && (!best || s > best.s)) best = { u, hid, s, note };
    }
  }
  if (best) {
    addLog('move', `[AI判断] 歩兵: ${best.u.name} を ${dispHex(best.hid)} へ（左へ進む）${best.note}`);
    return { unit: best.u, hex: best.hid, unstack: false };
  }
  addLog('move', '[AI判断] ドイツ軍: 動かす手なし → パス');
  return null;
}

// 1つの地区の戦車の組み合わせを試し、最初に動かす戦車と行き先を返す（全員その場なら null）
function dePlanArea(area, stacks) {
  // 1組あたりの行き先の数（地区の戦車は最大3組なので、組み合わせは最大1,331通り）
  const n = stacks.length;
  const K = n <= 2 ? 12 : 10;
  const nwHexes = new Set(getNWExitHexes());
  const opts = stacks.map(st => {
    const reach = calcReachable(st.unit);
    const canAdj = [...reach.keys()].some(h => hexDist(h, ST_VITH) === 1);
    st.canReachStVith = canAdj;
    const fromCol = parseHexId(st.unit.hexId).col;
    const cands = [];
    for (const hid of reach.keys()) {
      if (hid === st.unit.hexId || !deStackOk(st.unit, hid)) continue;
      const col = parseHexId(hid).col;
      let s = (fromCol - col) * 4; // 左へ
      if (FACILITY_MAP[hid] === 'c') s += 10;
      if (nwHexes.has(hid)) s += 20;
      s += deStVithBonus(area, hid, canAdj);
      cands.push({ hid, s });
    }
    cands.sort((a, b) => b.s - a.s);
    return [st.unit.hexId, ...cands.slice(0, K).map(c => c.hid)]; // 先頭は「動かない」
  });

  let bestScore = -Infinity, bestA = null;
  const a = new Array(n);
  const search = depth => {
    if (depth === n) {
      if (new Set(a).size < n) return; // 同じヘクスに2組は入れない
      const sim = mcCloneUnits();
      stacks.forEach((st, i) => {
        for (const u of [st.unit, st.pair].filter(Boolean)) { const su = sim.find(x => x.id === u.id); if (su) su.hexId = a[i]; }
      });
      let score = mcSimCombatsAndScore(sim);
      stacks.forEach((st, i) => { score += deStVithBonus(area, a[i], st.canReachStVith); });
      if (score > bestScore) { bestScore = score; bestA = a.slice(); }
      return;
    }
    for (const h of opts[depth]) { a[depth] = h; search(depth + 1); }
  };
  search(0);
  if (!bestA) return null;
  const i = stacks.findIndex((st, k) => bestA[k] !== st.unit.hexId);
  if (i < 0) return null;
  const st = stacks[i];
  const sv = deStVithBonus(area, bestA[i], st.canReachStVith) > 0 ? '（St. Vith 攻略）' : '';
  return { st, hex: bestA[i], note: sv };
}

// 戦闘後前進MC判定: 後続の到達可能ヘクス数＋攻撃可能敵数＋戦闘支援＋歩兵攻撃による道開け
function mcEvalAdvanceScore(advancingUnit) {
  const side = advancingUnit.side;
  const enemySide = side === 'german' ? 'allied' : 'german';
  let totalScore = 0;

  const remaining = G.units.filter(u =>
    u.side === side && u.id !== advancingUnit.id &&
    !u.acted && !u.eliminated && !u.exited
  );
  const remainingInf = remaining.filter(u => !isMechanized(u));
  const remainingArmor = remaining.filter(u => isMechanized(u));

  const enemies = G.units.filter(u => u.side === enemySide && !u.eliminated && !u.exited);
  const enemyPositions = new Set(enemies.map(u => u.hexId));

  for (const u of remaining) {
    const reached = calcReachable(u);
    totalScore += reached.size;

    for (const [hid] of reached) {
      const adjEnemies = getNeighborIds(hid).filter(nid => enemyPositions.has(nid));
      totalScore += adjEnemies.length;
    }
  }

  // 戦闘支援+2: 装甲が敵に隣接したまま留まれば歩兵の攻撃を支援できる
  if (isMechanized(advancingUnit)) {
    for (const nid of getNeighborIds(advancingUnit.hexId)) {
      if (!enemyPositions.has(nid)) continue;

      // この敵に歩兵が攻撃可能か
      const infCanAttack = remainingInf.some(u => {
        const reached = calcReachable(u);
        for (const [hid] of reached) {
          if (getNeighborIds(hid).includes(nid)) return true;
        }
        return false;
      });
      if (infCanAttack) {
        // 支援+2の価値
        totalScore += 2;

        // 歩兵がDRで敵を後退させたら後方の戦車が動けるようになる
        // 敵が後退した場合の後続戦車の到達可能ヘクス増加を見積もる
        const enemy = enemies.find(e => e.hexId === nid);
        if (enemy) {
          const retreats = getRetreatHexes(enemy);
          if (retreats.length > 0) {
            // 敵が消えた場合、そのZOCが解除され後続戦車の経路が開く
            const savedHex = enemy.hexId;
            enemy.hexId = retreats[0]; // 仮退却
            let armorMobility = 0;
            for (const a of remainingArmor) {
              const reached = calcReachable(a);
              armorMobility += reached.size;
            }
            enemy.hexId = savedHex; // 元に戻す

            // 現状の戦車機動力
            let armorMobilityNow = 0;
            for (const a of remainingArmor) {
              const reached = calcReachable(a);
              armorMobilityNow += reached.size;
            }

            // 差分がプラスなら道が開く価値
            totalScore += Math.max(0, armorMobility - armorMobilityNow);
          }
        }
      }
    }
  }

  // 包囲チェック: 前進によりZOCが変わり敵の退路が0になるか
  for (const enemy of enemies) {
    const retreats = getRetreatHexes(enemy);
    if (retreats.length === 0) totalScore += 25; // 包囲状態
  }

  return totalScore;
}

// ドクトリンスコア（個別hex評価、シミュレーション内で使用）
function mcDoctrineScore(hid, unit, simUnits) {
  let score = 0;
  const { col, row } = parseHexId(hid);
  const mech = isMechanized(unit);

  // === 西進（全ユニット共通、控えめ）===
  score += (20 - col) * 2;

  // === ターン1: 包囲壊滅優先 ===
  if (G.turn === 1) {
    const savedUnits = G.units;
    G.units = simUnits;
    for (const nid of getNeighborIds(hid)) {
      const enemy = simUnits.find(u => u.hexId === nid && u.side === 'allied' && !u.eliminated && !u.exited);
      if (!enemy) continue;
      score += 8; // 敵隣接
      const retreats = getRetreatHexes(enemy);
      score += (6 - retreats.length) * 5; // 退路が少ないほど高得点
      if (retreats.length === 0) score += 25; // 完全包囲
    }
    G.units = savedUnits;
  }

  // === ターン2: サンビット未占領なら装甲はサンビット攻略優先（2Pz除外）===
  const is2PzT2 = unit.id === 'de_2pz_1' || unit.id === 'de_2pz_2';
  if (G.turn === 2 && mech && !is2PzT2) {
    const stVithEnemy = simUnits.some(u => u.hexId === ST_VITH && u.side === 'allied' && !u.eliminated && !u.exited);
    if (stVithEnemy) {
      const dist = hexDist(hid, ST_VITH);
      score += Math.max(0, 15 - dist) * 5;
    }
  }

  // === ターン2以降: 装甲はNW（左上）集中（サンビット占領済みor3ターン以降）===
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
      // 不利な攻撃になる敵の隣は避ける（特に都市）
      const enemyDef = enemy.flipped ? enemy.def : enemy.atk;
      const myAtk = unit.flipped ? unit.def : unit.atk;
      const adjFriendAtk = simUnits.filter(u =>
        u.side === 'german' && u.id !== unit.id && !u.eliminated && !u.exited
        && getNeighborIds(nid).includes(u.hexId)
      ).reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
      const totalAtk = myAtk + adjFriendAtk;
      const isCity = FACILITY_MAP && FACILITY_MAP[nid] === 'c';
      if (isCity && totalAtk - enemyDef < 2) {
        // 都市への+2未満の攻撃は見送り
        score -= 30;
      } else {
        const retreats = mcCountRetreats(simUnits, enemy);
        score += (6 - retreats) * 10;
        if (retreats === 0) score += 50; // 包囲壊滅ボーナス
        // 戦闘後前進: DR確定で敵が退却/壊滅した場合、前進先がサンビットに近いか
        if (retreats === 0 || retreats > 0) {
          const advDist = hexDist(nid, ST_VITH);
          const curDist = hexDist(hid, ST_VITH);
          if (advDist < curDist) score += (curDist - advDist) * 10; // 前進でサンビットに近づく
        }
      }
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

// ========== 連合軍の思考 ==========
// 1手ごとに、上から順に当てはまる手を1つ選ぶ。何もなければパス（ドイツの動きを待つ）
//   1. 危険な状況への対応（待たない）
//      a. 都市を占領されそう: まだ動いていないドイツ軍が、連合のいない都市に入れる → 都市に入る／道をふさぐ
//      b. 道路で遥か後方まで届く: まだ動いていないドイツの装甲が、戦線の後方（4列以上奥）や北西の出口まで届く → 道をふさぐ
//      c. 味方が包囲されそう: 退路が1つ以下で、まだ動いていないドイツ軍が隣まで来られる → 逃げる
//   2. 第82空挺をバストーニュへ（安全なとき）
//   3. 戦線の維持: 北端と南端からZOCをつなぐ。動かすのは安全なユニットだけ
//      （安全 = まだ動いていないドイツ軍が、このターンにそのユニットの隣まで来られない）
//      間隔は1ヘクス空けが最良、2ヘクス空けまでは許す。道路のない森は装甲が通れないので壁とみなす
//      （近くにドイツ歩兵がいる森は除く）。余力があれば完全にふさぎ、間隔を詰める
//   4. 反撃: 得点で負けているときだけ、余剰のユニットでドイツ軍のいる都市を攻撃する
//   5. パス
// 増援の登場と第82空挺の移動も、この判断の中で行う（bulge.html 側で先に動かさない）
const AL_DEEP_COLS = 4;      // 戦線の後方とみなす奥行き（列）
const AL_FOREST_INF_DIST = 4; // この距離にドイツ歩兵がいる森は壁とみなさない

function alAlive(u) { return !u.eliminated && !u.exited && u.hexId && u.hexId.length === 4; }
function alFreshGermans() {
  return G.units.filter(u => u.side === 'german' && alAlive(u) && !u.acted && !u.flipped);
}
function alGermanReach(g) {
  const s = new Set(calcReachable(g).keys());
  s.add(g.hexId);
  return s;
}
// まだ動いていないドイツ軍が、このターンに隣まで来られるヘクス
function alAttackZone(reaches) {
  const z = new Set();
  for (const r of reaches.values()) {
    for (const h of r) { z.add(h); for (const n of getNeighborIds(h)) z.add(n); }
  }
  return z;
}
function alAdjGerman(hid) {
  return getNeighborIds(hid).some(n => getUnitsAt(n).some(e => e.side === 'german'));
}
function alStackOk(unit, hid) {
  const dest = getUnitsAt(hid).filter(u => u.side === unit.side && u.id !== unit.id && u.id !== unit.mechPair);
  return dest.length === 0;
}
// 動かせるユニット（盤上）と増援（登場ヘクスから）。機械化ペアは1つにまとめる
function alMovers(attackZone) {
  const movers = [];
  const seen = new Set();
  for (const u of G.units) {
    if (u.side !== 'allied' || !alAlive(u) || u.acted || u.flipped) continue;
    if (typeof mustHoldCity === 'function' && mustHoldCity(u)) continue;
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    const pair = isStacked(u) ? G.units.find(p => p.id === u.mechPair && !p.acted && !p.flipped) : null;
    if (pair) seen.add(pair.id);
    movers.push({ unit: u, pair, entry: null, safe: !attackZone.has(u.hexId) });
  }
  // 増援（まだ盤外）
  for (const ru of (G.reserves.allied || [])) {
    if (seen.has(ru.id)) continue;
    seen.add(ru.id);
    const pair = ru.mechPair ? G.reserves.allied.find(p => p.id === ru.mechPair) : null;
    if (pair) seen.add(pair.id);
    const entries = getValidEntryHexes(ru).filter(h => !alAdjGerman(h));
    if (!entries.length) continue;
    // 安全な登場ヘクスを優先
    entries.sort((a, b) => (attackZone.has(a) ? 1 : 0) - (attackZone.has(b) ? 1 : 0));
    movers.push({ unit: ru, pair, entry: entries[0], safe: !attackZone.has(entries[0]) });
  }
  return movers;
}
// 仮に置いて fn を実行し、元に戻す（増援は一時的に盤上へ出す）
function alWithAt(mover, hid, fn) {
  const list = [mover.unit, mover.pair].filter(Boolean);
  const saved = list.map(u => u.hexId);
  const added = [];
  for (const u of list) {
    if (mover.entry && !G.units.includes(u)) { G.units.push(u); added.push(u); }
    u.hexId = hid;
  }
  try { return fn(); }
  finally {
    list.forEach((u, i) => { u.hexId = saved[i]; });
    for (const u of added) { const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1); }
  }
}
// 行き先の候補（移動範囲）
function alDests(mover) {
  const from = mover.entry || mover.unit.hexId;
  const m = alWithAt(mover, from, () => calcReachable(mover.unit));
  const out = [];
  for (const [hid, info] of m) {
    if (hid === from) continue;
    if (!alStackOk(mover.unit, hid)) continue;
    out.push({ hid, len: info.path.length });
  }
  // 増援は登場ヘクスそのものにも置ける（登場して止まる）
  if (mover.entry && alStackOk(mover.unit, mover.entry)) out.push({ hid: mover.entry, len: 0, stay: true });
  return out;
}
// 決めた手を実行できる形にする（増援はここで盤上に出す）
function alCommit(mover, dest, reason) {
  if (mover.entry) {
    for (const u of [mover.unit, mover.pair].filter(Boolean)) {
      u.hexId = mover.entry;
      G.reserves.allied = G.reserves.allied.filter(r => r.id !== u.id);
      G.units.push(u);
      addLog('turn', `[AI] 増援登場: ${u.name} → ${dispHex(mover.entry)}`);
    }
  }
  addLog('move', `[AI判断] ${reason}`);
  if (dest.stay || dest.hid === mover.unit.hexId) {
    // 登場して止まる: 動かさずに手番を終える
    for (const u of [mover.unit, mover.pair].filter(Boolean)) { u.acted = true; u.flipped = true; }
    switchSide();
    return { handled: true };
  }
  return { unit: mover.unit, hex: dest.hid };
}

// ---------- 戦線の評価 ----------
// 北端（row=0）と南端（row=ROWS-1）から、連合のユニットとZOC（と壁）がどこまでつながっているか
function alLineScore() {
  const allies = G.units.filter(u => u.side === 'allied' && alAlive(u));
  const germans = G.units.filter(u => u.side === 'german' && alAlive(u));
  const germanHex = new Set(germans.map(u => u.hexId));
  const germanInf = germans.filter(u => !isMechanized(u));
  const wall = new Set();
  for (const u of allies) {
    wall.add(u.hexId);
    for (const n of getNeighborIds(u.hexId)) if (!germanHex.has(n)) wall.add(n);
  }
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const h = hexId(c, r);
    const t = TERRAIN_MAP[h];
    if (!t || t === 'x') { wall.add(h); continue; }
    // 道路のない森: 装甲は通れない。近くにドイツ歩兵がいなければ壁とみなす
    if (t === 'f' && !(ROAD_MAP[h] && ROAD_MAP[h].length) && !germanHex.has(h)
        && !germanInf.some(g => hexDist(g.hexId, h) <= AL_FOREST_INF_DIST)) wall.add(h);
  }
  const bfs = row => {
    const seen = new Set(), q = [];
    for (let c = 0; c < COLS; c++) { const h = hexId(c, row); if (wall.has(h)) { seen.add(h); q.push(h); } }
    while (q.length) { const h = q.shift(); for (const n of getNeighborIds(h)) if (wall.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
    return seen;
  };
  const north = bfs(0), south = bfs(ROWS - 1);
  let complete = false;
  for (const h of north) if (south.has(h)) { complete = true; break; }
  let nMax = -1, sMin = ROWS;
  for (const h of north) nMax = Math.max(nMax, parseHexId(h).row);
  for (const h of south) sMin = Math.min(sMin, parseHexId(h).row);
  // 間隔: 戦線の前面（ドイツ軍から5ヘクス以内）のユニットどうしで、1ヘクス空け（距離2）の組を数える
  const frontAllies = allies.filter(u => germans.some(g => hexDist(g.hexId, u.hexId) <= 5));
  let tight = 0;
  for (let i = 0; i < frontAllies.length; i++) for (let j = i + 1; j < frontAllies.length; j++) {
    if (frontAllies[i].hexId !== frontAllies[j].hexId && hexDist(frontAllies[i].hexId, frontAllies[j].hexId) === 2) tight++;
  }
  const coverage = complete ? ROWS * 2 : (nMax + 1) + (ROWS - sMin);
  return { score: coverage * 10 + (complete ? 100 : 0) + tight, complete, nMax, sMin };
}

// 戦線の前面（各行の、近くの連合ユニットの最も東の列）
function alFrontCols() {
  const allies = G.units.filter(u => u.side === 'allied' && alAlive(u));
  const front = [];
  for (let r = 0; r < ROWS; r++) {
    let best = -1;
    for (const u of allies) { const p = parseHexId(u.hexId); if (Math.abs(p.row - r) <= 2) best = Math.max(best, p.col); }
    front.push(best);
  }
  const known = front.filter(c => c >= 0).sort((a, b) => a - b);
  const mid = known.length ? known[Math.floor(known.length / 2)] : COLS - 1;
  return front.map(c => c >= 0 ? c : mid);
}
function alDeepCount(reach, front, nw) {
  let n = 0;
  for (const h of reach) {
    const p = parseHexId(h);
    if (nw.has(h) || p.col <= front[p.row] - AL_DEEP_COLS) n++;
  }
  return n;
}

// ---------- 本体 ----------
function mcAlliedDoctrineMove() {
  const savedDbg = window.dbg;
  window.dbg = () => {}; // 仮の計算が多いので、計算中のデバッグ出力は止める
  try { return alThink(); }
  finally { window.dbg = savedDbg; }
}

function alThink() {
  const fresh = alFreshGermans();
  const reaches = new Map(fresh.map(g => [g.id, alGermanReach(g)]));
  const zone = alAttackZone(reaches);
  const movers = alMovers(zone);
  if (!movers.length) { addLog('move', '[AI判断] 動かせるユニットなし → パス'); return null; }
  const destCache = new Map();
  const dests = m => { if (!destCache.has(m)) destCache.set(m, alDests(m)); return destCache.get(m); };
  const lineInfo = buildAlliedLine();
  const isEssential = m => lineInfo.essential.has(m.unit.id);
  // 行き先の好み: 敵に隣接しない（攻撃が必須になる）、森・都市、近い
  const prefer = (m, d) => (alAdjGerman(d.hid) ? -50 : 0) + (TERRAIN_MAP[d.hid] === 'f' ? 2 : 0)
    + (FACILITY_MAP[d.hid] === 'c' ? 3 : 0) - d.len * 0.1 - (isEssential(m) ? 5 : 0);

  // ===== 1a. 都市を占領されそう =====
  const cities = mcGetCityHexes().sort((a, b) => (HOLD_CITIES.includes(b) ? 1 : 0) - (HOLD_CITIES.includes(a) ? 1 : 0));
  for (const c of cities) {
    if (getUnitsAt(c).length) continue; // 連合がいる、またはすでにドイツが占領
    const threats = fresh.filter(g => reaches.get(g.id).has(c));
    if (!threats.length) continue;
    const name = dispHex(c);
    // 都市に入る
    let best = null;
    for (const m of movers) for (const d of dests(m)) {
      if (d.hid !== c) continue;
      const s = prefer(m, d) + 20;
      if (!best || s > best.s) best = { m, d, s };
    }
    // 道をふさぐ（入れなくなるか）
    const cand = new Set();
    for (const g of threats) {
      const info = calcReachable(g).get(c);
      for (const h of (info ? info.path : [])) { cand.add(h); getNeighborIds(h).forEach(n => cand.add(n)); }
    }
    for (const m of movers) for (const d of dests(m)) {
      if (!cand.has(d.hid)) continue;
      const blocked = alWithAt(m, d.hid, () => threats.every(g => !calcReachable(g).has(c)));
      if (!blocked) continue;
      const s = prefer(m, d);
      if (!best || s > best.s) best = { m, d, s };
    }
    if (best) {
      const how = best.d.hid === c ? `${best.m.unit.name}で入る` : `${best.m.unit.name}で ${dispHex(best.d.hid)} をふさぐ`;
      return alCommit(best.m, best.d, `危険: 都市 ${name} を占領されそう（${threats.map(g => g.name).join(',')}）→ ${how}`);
    }
    addLog('move', `[AI判断] 都市 ${name} が危ないが、間に合うユニットがない`);
  }

  // ===== 1b. 道路で遥か後方まで届く =====
  {
    const front = alFrontCols();
    const nw = new Set(getNWExitHexes());
    let worst = null;
    for (const g of fresh) {
      if (!isMechanized(g)) continue;
      const n = alDeepCount(reaches.get(g.id), front, nw);
      if (n > 0 && (!worst || n > worst.n)) worst = { g, n };
    }
    if (worst) {
      const g = worst.g;
      const reachMap = calcReachable(g);
      const cand = new Set();
      for (const [h, info] of reachMap) {
        const p = parseHexId(h);
        if (!(nw.has(h) || p.col <= front[p.row] - AL_DEEP_COLS)) continue;
        for (const ph of info.path) { cand.add(ph); getNeighborIds(ph).forEach(n => cand.add(n)); }
      }
      let best = null;
      for (const m of movers) for (const d of dests(m)) {
        if (!cand.has(d.hid)) continue;
        const after = alWithAt(m, d.hid, () => alDeepCount(alGermanReach(g), front, nw));
        if (after >= worst.n) continue;
        const s = (worst.n - after) * 3 + prefer(m, d);
        if (!best || s > best.s) best = { m, d, s, after };
      }
      if (best) {
        return alCommit(best.m, best.d, `危険: ${g.name} が道路で後方まで届く（${worst.n}ヘクス→${best.after}）→ ${best.m.unit.name}で ${dispHex(best.d.hid)} をふさぐ`);
      }
      addLog('move', `[AI判断] ${g.name} が後方まで届くが、ふさげるユニットがない`);
    }
  }

  // ===== 1c. 味方が包囲されそう =====
  for (const m of movers) {
    if (m.entry) continue;
    const u = m.unit;
    if (getRetreatHexes(u).length > 1) continue;
    const near = fresh.some(g => getNeighborIds(u.hexId).some(n => reaches.get(g.id).has(n)));
    if (!near) continue;
    const esc = findEscapeHex(u, lineInfo, true);
    if (esc && esc.hex !== u.hexId) {
      return alCommit(m, { hid: esc.hex, len: 0 }, `危険: ${u.name} が包囲されそう（退路${getRetreatHexes(u).length}）→ ${dispHex(esc.hex)} へ逃げる`);
    }
  }

  // ===== 2. 第82空挺をバストーニュへ（安全なとき） =====
  {
    const m = movers.find(x => x.unit.id === 'us_82');
    if (m && m.safe && m.unit.hexId !== BASTOGNE && !getUnitsAt(BASTOGNE).length) {
      let best = null;
      for (const d of dests(m)) {
        if (alAdjGerman(d.hid)) continue;
        const s = -hexDist(d.hid, BASTOGNE) * 10 - d.len * 0.1;
        if (!best || s > best.s) best = { d, s };
      }
      if (best) return alCommit(m, best.d, `第82空挺をバストーニュへ → ${dispHex(best.d.hid)}`);
    }
  }

  // ===== 3. 戦線の維持（安全なユニットだけ） =====
  {
    const base = alLineScore();
    let best = null;
    for (const m of movers) {
      if (!m.safe) continue;
      for (const d of dests(m)) {
        if (alAdjGerman(d.hid)) continue; // 隣接すると攻撃が必須になる
        const ls = alWithAt(m, d.hid, () => alLineScore());
        const gain = ls.score - base.score;
        if (gain <= 0) continue;
        const s = gain + prefer(m, d) * 0.5;
        if (!best || s > best.s) best = { m, d, s, ls };
      }
    }
    if (best) {
      const what = best.ls.complete
        ? (base.complete ? '間隔を詰める' : '戦線を完全にふさぐ')
        : `北から${best.ls.nMax + 1}行・南から${ROWS - best.ls.sMin}行までつなぐ`;
      return alCommit(best.m, best.d, `戦線: ${best.m.unit.name} を ${dispHex(best.d.hid)} へ（${what}）`);
    }
  }

  // ===== 4. 反撃（得点で負けているとき） =====
  calcVP();
  if (G.vpAllied < G.vpGerman) {
    let best = null;
    for (const c of mcGetCityHexes()) {
      const defs = getUnitsAt(c).filter(e => e.side === 'german');
      if (!defs.length) continue;
      const defP = defs.reduce((s, e) => s + (e.flipped ? e.def : e.atk), 0);
      for (const m of movers) {
        if (isEssential(m)) continue;
        const atkP = [m.unit, m.pair].filter(Boolean).reduce((s, u) => s + u.atk, 0);
        if (atkP - defP < 2) continue; // 都市への攻撃は+2以上
        for (const d of dests(m)) {
          if (!getNeighborIds(d.hid).includes(c)) continue;
          // ほかのドイツ軍にも隣接すると、そちらを攻撃してしまうことがあるので避ける
          if (getNeighborIds(d.hid).some(n => n !== c && getUnitsAt(n).some(e => e.side === 'german'))) continue;
          const s = (atkP - defP) * 10 - d.len * 0.1;
          if (!best || s > best.s) best = { m, d, s, c, atkP, defP };
        }
      }
    }
    if (best) {
      return alCommit(best.m, best.d, `反撃: 得点で負けている（独${G.vpGerman} 連${G.vpAllied}）→ ${best.m.unit.name}で都市 ${dispHex(best.c)} を攻撃（${best.atkP}対${best.defP}）`);
    }
  }

  // ===== 5. パス =====
  const waiting = movers.filter(m => !m.safe).length;
  addLog('move', fresh.length
    ? `[AI判断] 待機: ドイツ軍の未行動 ${fresh.length}隊（危険な所の味方 ${waiting}隊は動かさない）→ パス`
    : '[AI判断] 動かす必要のあるユニットなし → パス');
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
