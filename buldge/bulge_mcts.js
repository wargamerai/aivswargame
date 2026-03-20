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
