// bulge_mcts.js — モンテカルロAI（包囲・ZOC戦術対応）
'use strict';

const MC = {
  SIMS: 30,         // 候補あたりシミュレーション回数
  PLAYOUT_DEPTH: 8, // プレイアウトの手数（両軍合計）
};

// ========== 盤面コピー ==========
function mcCloneUnits() {
  return G.units.map(u => Object.assign({}, u));
}

// ========== 評価関数 ==========
// ドイツ視点スコア（正=ドイツ有利）。連合は符号反転して使う
function mcEvaluate(units) {
  let score = 0;

  // 都市支配
  if (FACILITY_MAP) {
    for (const [hid, fac] of Object.entries(FACILITY_MAP)) {
      if (fac !== 'c') continue;
      const hasGerman = units.some(u => u.side === 'german' && u.hexId === hid && !u.eliminated && !u.exited);
      const hasAllied = units.some(u => u.side === 'allied' && u.hexId === hid && !u.eliminated && !u.exited);
      if (hasGerman) score += 8;
      else if (hasAllied) score -= 5;
      else score += 2;
    }
  }

  // 部隊残存・位置評価
  const germanAlive = units.filter(u => u.side === 'german' && !u.eliminated && !u.exited);
  const alliedAlive = units.filter(u => u.side === 'allied' && !u.eliminated && !u.exited);

  for (const u of units) {
    if (u.eliminated) {
      score += u.side === 'allied' ? 5 : -5;
      continue;
    }
    if (u.exited) continue;

    const power = u.flipped ? u.def : u.atk;
    if (u.side === 'german') {
      score += power * 0.5;
      // 西進度ボーナス（col小さい=西）
      const col = parseInt(u.hexId.substring(0, 2)) - 1;
      score += (20 - col) * 0.3;
    } else {
      score -= power * 0.5;
      // 包囲度（退却先の少ないユニットほどドイツ有利）
      const retreatCount = mcCountRetreats(units, u);
      if (retreatCount === 0) score += 10;     // 完全包囲 → 壊滅確実
      else if (retreatCount === 1) score += 5;  // ほぼ包囲
      else if (retreatCount === 2) score += 2;  // 圧迫
    }
  }

  // ZOC圧力: ドイツユニットが連合ユニットの周囲にいるほど高評価
  for (const au of alliedAlive) {
    const neighbors = getNeighborIds(au.hexId);
    let zocHexes = 0;
    let friendlyCover = 0;
    for (const nid of neighbors) {
      const t = TERRAIN_MAP[nid];
      if (!t || t === 'x') continue;
      // このhexにドイツ軍がいる → 直接ZOC
      if (germanAlive.some(gu => gu.hexId === nid)) {
        zocHexes++;
      }
      // このhexの隣にドイツ軍がいる → ZOCが掛かっている
      else if (getNeighborIds(nid).some(adj =>
        germanAlive.some(gu => gu.hexId === adj)
      )) {
        zocHexes += 0.5;
      }
      // 連合味方がカバーしていれば多少安全
      if (alliedAlive.some(f => f.id !== au.id && f.hexId === nid)) {
        friendlyCover++;
      }
    }
    score += (zocHexes - friendlyCover * 0.3) * 1.5;
  }

  return score;
}

// 簡易退却先カウント（高速版）
// ルール4.2対応: 味方が隣接している敵のZOCは無効
function mcCountRetreats(units, unit) {
  let count = 0;
  const nids = getNeighborIds(unit.hexId);
  for (const nid of nids) {
    const terrain = TERRAIN_MAP[nid];
    if (!terrain || terrain === 'x') continue;
    // 敵がいる → 退却不可
    if (units.some(u => u.hexId === nid && u.side !== unit.side && !u.eliminated && !u.exited)) continue;
    // 敵ZOCチェック（味方カバーで無効化考慮）
    let blockedByZOC = false;
    const adjToNid = getNeighborIds(nid);
    for (const adj of adjToNid) {
      const hasEnemy = units.some(e => e.hexId === adj && e.side !== unit.side && !e.eliminated && !e.exited);
      if (!hasEnemy) continue;
      // この敵に味方が隣接していればZOC無効（移動ユニット自身は除外）
      const enemyCovered = getNeighborIds(adj).some(fn =>
        units.some(f => f.hexId === fn && f.side === unit.side && f.id !== unit.id && !f.eliminated && !f.exited)
      );
      if (!enemyCovered) {
        blockedByZOC = true;
        break;
      }
    }
    if (blockedByZOC) continue;
    count++;
  }
  return count;
}

// ========== シミュレーション ==========
// 戦術プレイアウト: ドイツは包囲志向、連合は退避志向
function mcPlayout(units, startSide) {
  let side = startSide;
  for (let step = 0; step < MC.PLAYOUT_DEPTH; step++) {
    const available = units.filter(u =>
      u.side === side && !u._simActed && !u.eliminated && !u.exited && !u.flipped
    );
    if (available.length === 0) {
      side = side === 'german' ? 'allied' : 'german';
      continue;
    }
    const unit = available[Math.floor(Math.random() * available.length)];
    unit._simActed = true;

    // 移動先候補（隣接hex）
    const nids = getNeighborIds(unit.hexId).filter(nid => {
      const t = TERRAIN_MAP[nid];
      if (!t || t === 'x') return false;
      // 敵がいるhexには移動不可
      if (units.some(u => u.hexId === nid && u.side !== unit.side && !u.eliminated && !u.exited)) return false;
      // スタック制限（同一hexに味方2ユニット以上いたら不可）
      const friendsAt = units.filter(u => u.hexId === nid && u.side === unit.side && !u.eliminated && !u.exited);
      if (friendsAt.length >= 2) return false;
      return true;
    });

    if (nids.length > 0 && Math.random() < 0.8) {
      if (unit.side === 'german') {
        // ドイツ: 敵に隣接するhexを優先（包囲のため）
        const adjToEnemy = nids.filter(nid =>
          getNeighborIds(nid).some(adj =>
            units.some(e => e.hexId === adj && e.side === 'allied' && !e.eliminated && !e.exited)
          )
        );
        // 70%で敵隣接hex、30%でランダム
        if (adjToEnemy.length > 0 && Math.random() < 0.7) {
          unit.hexId = adjToEnemy[Math.floor(Math.random() * adjToEnemy.length)];
        } else {
          // 西寄りのhexを優先
          nids.sort((a, b) => parseInt(a.substring(0, 2)) - parseInt(b.substring(0, 2)));
          unit.hexId = nids[Math.floor(Math.random() * Math.min(3, nids.length))];
        }
      } else {
        // 連合: 敵から離れるhexを優先（退避）、都市は守る
        const safest = nids.filter(nid => {
          const adjEnemyCount = getNeighborIds(nid).filter(adj =>
            units.some(e => e.hexId === adj && e.side === 'german' && !e.eliminated && !e.exited)
          ).length;
          return adjEnemyCount === 0;
        });
        const isOnCity = FACILITY_MAP && FACILITY_MAP[unit.hexId] === 'c';
        if (isOnCity && Math.random() < 0.6) {
          // 都市にいるなら動かない確率60%
        } else if (safest.length > 0) {
          unit.hexId = safest[Math.floor(Math.random() * safest.length)];
        } else {
          unit.hexId = nids[Math.floor(Math.random() * nids.length)];
        }
      }
    }

    // 隣接敵がいれば戦闘判定
    const adjEnemyHexes = getNeighborIds(unit.hexId).filter(nid =>
      units.some(u => u.hexId === nid && u.side !== unit.side && !u.eliminated && !u.exited)
    );
    if (adjEnemyHexes.length > 0) {
      // ドイツは積極的に攻撃（60%）、連合は消極的（20%）
      const atkChance = unit.side === 'german' ? 0.6 : 0.2;
      if (Math.random() < atkChance) {
        const defHex = adjEnemyHexes[Math.floor(Math.random() * adjEnemyHexes.length)];
        const defenders = units.filter(u => u.hexId === defHex && u.side !== unit.side && !u.eliminated);
        if (defenders.length > 0) {
          // 攻撃参加: 同hexの味方も参加
          const coAttackers = units.filter(u =>
            u.hexId === unit.hexId && u.side === unit.side && !u.eliminated && !u.exited
          );
          const atkPower = coAttackers.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
          const defPower = defenders.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);

          // 支援計算（防御hex隣接の攻撃非参加味方ユニット数）
          let support = 0;
          const facility = FACILITY_MAP && FACILITY_MAP[defHex];
          if (facility !== 'c') {
            for (const nid of getNeighborIds(defHex)) {
              const helpers = units.filter(u =>
                u.hexId === nid && u.side === unit.side && !u.eliminated && !u.exited &&
                u.hexId !== unit.hexId // 攻撃ユニットのhex以外
              );
              support += helpers.length;
            }
          }

          const diff = atkPower - defPower;
          const die = Math.floor(Math.random() * 6) + 1;
          const modDie = Math.max(1, Math.min(6, die + support));
          const result = lookupCRT(diff, modDie);

          if (result === 'DE') {
            defenders.forEach(u => u.eliminated = true);
          } else if (result === 'EX') {
            defenders[0].eliminated = true;
            coAttackers[0].eliminated = true;
          } else if (result === 'AR') {
            coAttackers.forEach(u => u.flipped = true);
          } else if (result === 'DD') {
            defenders.forEach(u => u.flipped = true);
          } else if (result === 'DR') {
            // 退却: 退却先がなければ壊滅
            for (const def of defenders) {
              const retreats = mcCountRetreats(units, def);
              if (retreats === 0) def.eliminated = true;
              else def.flipped = true;
            }
          }
        }
      }
    }

    unit.flipped = true;
    side = side === 'german' ? 'allied' : 'german';
  }
  return mcEvaluate(units);
}

// ========== モンテカルロ移動判断 ==========
function mcPickMove(unit, reachable) {
  const side = unit.side;
  const sign = side === 'german' ? 1 : -1;
  const candidates = [];

  // 候補: 待機 + reachable
  candidates.push({ hex: unit.hexId, label: '待機' });
  for (const [hid] of reachable) {
    candidates.push({ hex: hid });
  }
  // 候補が多い場合は上位8+待機に絞る
  if (candidates.length > 9) {
    candidates.sort((a, b) => {
      const sa = mcQuickScore(a.hex, unit);
      const sb = mcQuickScore(b.hex, unit);
      return (sb - sa) * sign;
    });
    candidates.length = 9;
  }

  console.log(`[MC] ${unit.name} (${side}) at ${dispHex(unit.hexId)} — ${candidates.length}候補`);

  let bestHex = unit.hexId;
  let bestScore = -Infinity * sign;

  for (const cand of candidates) {
    let totalScore = 0;
    for (let i = 0; i < MC.SIMS; i++) {
      const simUnits = mcCloneUnits();
      const simUnit = simUnits.find(u => u.id === unit.id);
      if (simUnit) {
        simUnit.hexId = cand.hex;
        simUnit._simActed = true;
        simUnit.flipped = true;
      }
      // スタック相方も一緒に移動（スタック解除しない場合）
      if (unit.mechPair) {
        const simPair = simUnits.find(u => u.id === unit.mechPair);
        if (simPair && !simPair._simActed) {
          simPair.hexId = cand.hex;
          simPair._simActed = true;
          simPair.flipped = true;
        }
      }
      const enemySide = side === 'german' ? 'allied' : 'german';
      const score = mcPlayout(simUnits, enemySide);
      totalScore += score;
    }
    const avgScore = totalScore / MC.SIMS;
    cand.score = avgScore;
    console.log(`[MC]   ${dispHex(cand.hex)}${cand.label ? '(' + cand.label + ')' : ''}: avg=${avgScore.toFixed(1)}`);

    if ((side === 'german' && avgScore > bestScore) ||
        (side === 'allied' && avgScore < bestScore)) {
      bestScore = avgScore;
      bestHex = cand.hex;
    }
  }

  console.log(`[MC]   → 選択: ${dispHex(bestHex)} (score=${bestScore.toFixed(1)})`);
  addLog('move', `[AI] ${unit.name}: ${dispHex(bestHex)}を選択 (MC=${bestScore.toFixed(1)})`);
  return bestHex;
}

// 簡易スコア（候補絞り込み用 — 上位候補をMCで精査）
function mcQuickScore(hid, unit) {
  let score = 0;
  const { col } = parseHexId(hid);
  const isCity = FACILITY_MAP && FACILITY_MAP[hid] === 'c';

  if (unit.side === 'german') {
    score -= col * 3; // 西へ行くほど加点
    if (isCity) score += 20;

    // 包囲価値: この位置から敵の退却hexをどれだけ塞げるか
    const adjEnemyHexes = getNeighborIds(hid).filter(nid =>
      getUnitsAt(nid).some(e => e.side === 'allied' && !e.eliminated && !e.exited)
    );
    for (const enemyHex of adjEnemyHexes) {
      const enemy = getUnitsAt(enemyHex).find(e => e.side === 'allied');
      if (enemy) {
        // 現在の退却hex数
        const currentRetreats = mcCountRetreats(G.units, enemy);
        score += (6 - currentRetreats) * 3; // 退却先が少ないほど高評価
        // ピン価値: 隣接すれば味方が敵ZOCを迂回可能
        score += 5;
      }
    }

    // 道路ボーナス
    const isRoad = ROAD_MAP && ROAD_MAP[hid] && ROAD_MAP[hid].length > 0;
    if (isRoad) score += 2;
  } else {
    if (isCity) score += 25;
    // 退却先の確保
    const retreatCount = mcCountRetreats(G.units, Object.assign({}, unit, { hexId: hid }));
    score += retreatCount * 3;
    // 敵から過度な圧力を受けていないか
    const adjEnemyPower = getNeighborIds(hid).reduce((s, nid) => {
      return s + getUnitsAt(nid).filter(e => e.side !== unit.side).reduce((es, e) => es + (e.flipped ? e.def : e.atk), 0);
    }, 0);
    const myPower = unit.flipped ? unit.def : unit.atk;
    if (adjEnemyPower > myPower * 2) score -= 15; // 危険位置
    // 味方と連携（味方隣接で孤立回避）
    const adjFriendly = getNeighborIds(hid).filter(nid =>
      getUnitsAt(nid).some(f => f.side === unit.side && f.id !== unit.id && !f.eliminated && !f.exited)
    ).length;
    score += adjFriendly * 2;
  }

  // 装甲部隊は道路なし森を避ける
  const terrain = TERRAIN_MAP[hid];
  const isRoad = ROAD_MAP && ROAD_MAP[hid] && ROAD_MAP[hid].length > 0;
  if (terrain === 'f' && isMechanized(unit) && !isRoad) {
    score -= 50;
  }

  return score;
}

// ========== モンテカルロ攻撃判断 ==========
function mcDecideAttack(attackers, defenders, defHexId) {
  const side = G.activeSide;
  const sign = side === 'german' ? 1 : -1;

  let atkTotalScore = 0;
  let noAtkTotalScore = 0;

  for (let i = 0; i < MC.SIMS; i++) {
    // 攻撃あり
    const simA = mcCloneUnits();
    const simAtk = attackers.map(u => simA.find(s => s.id === u.id)).filter(Boolean);
    const simDef = defenders.map(u => simA.find(s => s.id === u.id)).filter(Boolean);
    const atkPower = simAtk.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);
    const defPower = simDef.reduce((s, u) => s + (u.flipped ? u.def : u.atk), 0);

    // 支援計算
    let support = 0;
    const facility = FACILITY_MAP && FACILITY_MAP[defHexId];
    if (facility !== 'c') {
      for (const nid of getNeighborIds(defHexId)) {
        const helpers = simA.filter(u =>
          u.side === side && !u.eliminated && !u.exited && u.hexId === nid &&
          !simAtk.some(a => a.id === u.id)
        );
        support += helpers.length;
      }
    }

    const diff = atkPower - defPower;
    const die = Math.floor(Math.random() * 6) + 1;
    const modDie = Math.max(1, Math.min(6, die + support));
    const result = lookupCRT(diff, modDie);

    if (result === 'DE') simDef.forEach(u => u.eliminated = true);
    else if (result === 'EX') { if (simDef[0]) simDef[0].eliminated = true; if (simAtk[0]) simAtk[0].eliminated = true; }
    else if (result === 'DD') simDef.forEach(u => u.flipped = true);
    else if (result === 'AR') simAtk.forEach(u => u.flipped = true);
    else if (result === 'DR') {
      for (const def of simDef) {
        const retreats = mcCountRetreats(simA, def);
        if (retreats === 0) def.eliminated = true;
        else def.flipped = true;
      }
    }

    const enemySide = side === 'german' ? 'allied' : 'german';
    atkTotalScore += mcPlayout(simA, enemySide);

    // 攻撃なし
    const simB = mcCloneUnits();
    noAtkTotalScore += mcPlayout(simB, enemySide);
  }

  const atkAvg = atkTotalScore / MC.SIMS;
  const noAtkAvg = noAtkTotalScore / MC.SIMS;
  const shouldAttack = (side === 'german') ? (atkAvg > noAtkAvg) : (atkAvg < noAtkAvg);

  console.log(`[MC] ATTACK? ${dispHex(defHexId)} atk=${atkAvg.toFixed(1)} skip=${noAtkAvg.toFixed(1)} → ${shouldAttack ? '攻撃' : '見送り'}`);
  addLog('combat', `[AI] ${dispHex(defHexId)}攻撃${shouldAttack ? '実行' : '見送り'} (atk=${atkAvg.toFixed(1)} / skip=${noAtkAvg.toFixed(1)})`);
  return shouldAttack;
}
