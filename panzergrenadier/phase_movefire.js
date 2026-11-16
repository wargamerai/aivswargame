// ===== 移動・射撃フェイズ (phase_movefire.js) =====
// 依存: G, PHASES, testUnits, units, dummyMap, toHexId, fromHexId, hexDistance,
//   hasLOS, getTerrainFireMod, getFireCombatResult, resolveDamage, applyDamageToUnit,
//   getDummyCount, removeAllDummies, checkLeaderCasualty, checkLeaderOnStackEliminated,
//   getActiveLeaderForUnit, canCommandUnit, FACILITY_MAP, addLog, drawMap, showFireOverlay

// ===== 援軍配置フェイズ =====

let reinforcementState = {
  phaseSide: null,
  undeployed: [],      // 未配置ユニット
  selectedUnit: null,  // 選択中のユニット
  entryHexes: [],      // 配置可能ヘクス [{col,row}]
};

function pgUnitLabel(unit) {
  const label = document.createElement('span');
  label.className = 'pg-unit-label';
  if (unit.src) {
    const image = document.createElement('img');
    image.className = 'pg-unit-image';
    image.src = unit.src;
    image.alt = '';
    label.append(image);
  }
  const name = document.createElement('span');
  name.textContent = unit.name;
  label.append(name);
  return label;
}

function pgUnitHasFired(unit) {
  const uid = unit.id || unit.name;
  return directFireState.firedUnits.has(uid) || directFireState.counterFiredUnits.has(uid) ||
    unit._counterFired || (unit.firedThisTurn && !unit.reconDone);
}

function renderReinforcementPhase(undeployed) {
  const c = document.getElementById('phaseContent');
  reinforcementState.undeployed = undeployed;
  if (undeployed.length) reinforcementState.phaseSide = undeployed[0].side;

  // 入口ヘクス座標を計算
  const entrySet = new Set();
  undeployed.forEach(u => {
    if (u.reinforcement && u.reinforcement.entryHexes) {
      u.reinforcement.entryHexes.forEach(h => entrySet.add(h));
    }
  });
  reinforcementState.entryHexes = [...entrySet].map(h => {
    const pos = fromHexId(h);
    return { hexId: h, col: pos.col, row: pos.row };
  });

  const sideNames = { german:'ドイツ軍', allied:'連合軍' };
  const side = undeployed[0]?.side;

  let html = `<div class="phase-info" style="margin-bottom:8px;">
    <b style="color:var(--pg-accent);">援軍配置</b><br>
    <small>${sideNames[side] || ''}の援軍 ${undeployed.length}ユニットを配置してください</small><br>
    <small>入口ヘクス: ${[...entrySet].join(', ')}</small>
  </div>`;

  // 未配置ユニット一覧
  html += '<div class="pg-reinforcement-list">';
  undeployed.forEach(u => {
    const selected = reinforcementState.selectedUnit === u;
    html += `<button type="button" class="btn-sm unit-entry" aria-pressed="${selected}"
      value="${pgCheckboxValue(u.id || u.name)}" onclick="selectReinforcementUnit(this.value)">
      ${pgUnitLabel(u).outerHTML}
      <small>${u.type} · 火力 ${u.fpAT}/${u.fpSoft} · 射程 ${u.range} · 移動 ${u.move}</small>
    </button>`;
  });
  if (reinforcementState.selectedUnit) html += '<small>地図の入口ヘクスをクリック</small>';
  html += '</div>';

  // 一括配置ボタン
  html += `<div style="margin:8px 0;">
    <button class="btn-sm" onclick="autoDeployReinforcements()">一括配置（入口ヘクスに自動配置）</button>
  </div>`;

  // 配置完了ボタン
  const allDeployed = undeployed.every(u => u.reinforcement.deployed);
  html += `<div style="margin:12px 0;">
    <button class="dice-btn" style="font-size:0.9em;padding:6px 16px;" onclick="finishReinforcementPhase()" ${allDeployed ? '' : 'disabled'}>配置完了 → 移動・射撃フェイズへ</button>
  </div>`;

  c.innerHTML = html;

  // マップに入口ヘクスをハイライト
  drawMap();
}

function selectReinforcementUnit(uid) {
  const unit = testUnits.find(u => (u.id || u.name) === uid);
  if (!unit || !unit.reinforcement || unit.reinforcement.deployed) return;
  reinforcementState.selectedUnit = unit;
  renderReinforcementPhase(reinforcementState.undeployed.filter(u => !u.reinforcement.deployed));
}

function placeReinforcement(col, row) {
  const unit = reinforcementState.selectedUnit;
  if (!unit) return;

  const hexId = toHexId(col, row);

  // 入口ヘクスかチェック
  const isEntry = reinforcementState.entryHexes.some(e => e.hexId === hexId);
  if (!isEntry) {
    addLog('deploy', `${hexId}は入口ヘクスではありません`);
    return;
  }

  // スタック制限チェック
  const stackCount = getStackCount(hexId);
  if (stackCount >= 4) {
    addLog('deploy', `${hexId}はスタック上限（4ユニット）です`);
    return;
  }

  // 配置
  const center = getHexCenter(col, row);
  unit.col = col;
  unit.row = row;
  unit.x = center.x;
  unit.y = center.y;
  unit.hexId = hexId;
  unit.reinforcement.deployed = true;

  addLog('deploy', `${unit.name} → ${hexId} に配置`);

  reinforcementState.selectedUnit = null;

  // 未配置一覧を更新
  const remaining = reinforcementState.undeployed.filter(u => !u.reinforcement.deployed);
  if (remaining.length > 0) {
    renderReinforcementPhase(remaining);
  } else {
    renderReinforcementPhase([]);
  }
  drawMap();
}

function autoDeployReinforcements() {
  const undeployed = reinforcementState.undeployed.filter(u => !u.reinforcement.deployed);
  if (undeployed.length === 0) return;

  // 入口ヘクスに順番に配置（スタック上限考慮）
  const entries = reinforcementState.entryHexes;
  let entryIdx = 0;

  undeployed.forEach(u => {
    if (entries.length === 0) return;

    // スタック上限に達してなければ同じ入口に
    let placed = false;
    for (let tries = 0; tries < entries.length; tries++) {
      const e = entries[entryIdx % entries.length];
      const count = getStackCount(e.hexId);
      if (count < 4) {
        const center = getHexCenter(e.col, e.row);
        u.col = e.col;
        u.row = e.row;
        u.x = center.x;
        u.y = center.y;
        u.hexId = e.hexId;
        u.reinforcement.deployed = true;
        addLog('deploy', `${u.name} → ${e.hexId} に自動配置`);
        placed = true;
        break;
      }
      entryIdx++;
    }
    if (!placed) {
      // 全入口がスタック上限 → 最初の入口に強制配置
      const e = entries[0];
      const center = getHexCenter(e.col, e.row);
      u.col = e.col;
      u.row = e.row;
      u.x = center.x;
      u.y = center.y;
      u.hexId = e.hexId;
      u.reinforcement.deployed = true;
      addLog('deploy', `${u.name} → ${e.hexId} に配置（スタック超過注意）`);
    }
  });

  reinforcementState.selectedUnit = null;
  renderReinforcementPhase([]);
  drawMap();
}

function finishReinforcementPhase() {
  reinforcementState.phaseSide = null;
  reinforcementState.selectedUnit = null;
  renderPhase();
  drawMap();
}

// ===== 直接射撃 (ルール11) =====

// 直接射撃状態管理
let directFireState = {
  mode: null,         // null, 'selectShooter', 'selectTarget', 'counterAttack', 'moving'
  shooters: [],       // 射撃ユニット配列（協同射撃用）
  targetUnit: null,   // 目標ユニット
  activeSide: null,   // 先攻側
  defenderSide: null, // 後攻側
  selectedHexId: null, // 右パネルに表示中のスタックヘクス
  atkHexId: null,      // 味方スタックのヘクス
  defHexId: null,      // 敵スタックのヘクス
  stopFirePending: false, // ストップ射撃待ち
  counterAvailable: false, // 反撃可能か
  firedUnits: new Set(), // このフェイズで射撃済みユニットID
  movedUnits: new Set(), // このフェイズで移動済みユニットID
  counterFiredUnits: new Set(), // 反撃済みユニットID
  surpriseUnits: new Set(), // サプライズ・アタック2回目可能ユニットID
};

function resetDirectFireState() {
  directFireState.mode = 'selectShooter';
  directFireState.shooters = [];
  directFireState.targetUnit = null;
  directFireState.selectedHexId = null;
  directFireState.atkHexId = null;
  directFireState.defHexId = null;
  directFireState.stopFirePending = false;
  directFireState.counterAvailable = false;
  directFireState.firedUnits = new Set();
  directFireState.movedUnits = new Set();
  directFireState.counterFiredUnits = new Set();
  directFireState.surpriseUnits = new Set();
  directFireState.activeSide = G.initiative;
  directFireState.defenderSide = G.initiative === 'german' ? 'allied' : 'german';
}

// 直接射撃可能かチェック (11-1)
function canDirectFire(unit, counter = false) {
  if (unit.status === 'eliminated') return { can: false, reason: '壊滅' };
  if (unit.status === 'd') return { can: false, reason: 'D状態' };
  if (unit.status === 'dd') return { can: false, reason: 'DD状態' };
  if (unit.type === 'A') return { can: false, reason: '砲兵は直接射撃不可（支援フェイズのみ）' };
  if (unit.type === 'leader' || unit.type === 'dummy') return { can: false, reason: '射撃不可' };
  if (unit.marchMode || unit.outOfAmmo) return { can: false, reason: '移動隊形または弾薬不足' };
  const uid = unit.id || unit.name;
  if (!counter && (directFireState.firedUnits.has(uid) || directFireState.counterFiredUnits.has(uid))) {
    return { can: false, reason: 'このフェイズ射撃済み' };
  }
  if (!unit.range || unit.range < 1) return { can: false, reason: '射程なし' };
  return { can: true, reason: '' };
}

// AI用: 直接射撃可能か簡易チェック
function canDirectFireSimple(unit) {
  return unit.status === 'ok' &&
    unit.type !== 'A' && !unit.supportFireOnly &&
    unit.type !== 'leader' && unit.type !== 'dummy' &&
    (unit.fpAT > 0 || unit.fpSoft > 0);
}

// 先制射撃可能かチェック (11-2)
function canPreemptiveFire(unit) {
  const base = canDirectFire(unit);
  if (!base.can) return base;
  if (unit.side !== directFireState.activeSide) return { can: false, reason: '先攻側のみ' };
  // 移動中は不可 (11-2-(1))
  if (directFireState.movedUnits.has(unit.id || unit.name) && !unit.moveComplete)
    return { can: false, reason: '移動中' };
  return { can: true, reason: '' };
}

// 視認+射程チェック (11-1-(1)(2))
function canTargetUnit(shooter, target) {
  if (target.side === shooter.side) return { can: false, reason: '味方' };
  if (target.status === 'eliminated') return { can: false, reason: '壊滅済み' };
  if (target.type === 'leader') return { can: false, reason: '指揮官は攻撃対象外' };

  const shot = pgShotLineCheck(shooter, target);
  if (!shot.can) return shot;

  // ダミーチェック — ダミー付きで偵察されていなければ視認不可
  const tHexId = target.hexId || toHexId(target.col, target.row);
  if (getDummyCount(tHexId) > 0) {
    const d = dummyMap[tHexId];
    if (d && d.side !== shooter.side) return { can: false, reason: 'ダミーに覆われている' };
  }

  return shot;
}

function pgShotLineCheck(shooter, target) {
  const sPos = fromHexId(shooter.hexId || toHexId(shooter.col, shooter.row));
  const tPos = fromHexId(target.hexId || toHexId(target.col, target.row));

  const dist = hexDistance(sPos.col, sPos.row, tPos.col, tPos.row);
  if (dist > shooter.range) return { can: false, reason: `射程外（距離${dist}/射程${shooter.range}）` };
  if (dist === 0) return { can: false, reason: '同一ヘクス' };
  const sight = pgSightStatus(sPos.col, sPos.row, tPos.col, tPos.row);
  if (sight === 'blocked') return { can: false, reason: '射線が地形で遮られている' };
  if (sight === 'out-of-vision') return { can: false, reason: '視認範囲外' };
  return { can: true, dist };
}

// 協同射撃可能か (11-5)
function canCoopDirectFire(shooter, mainShooter) {
  if (shooter === mainShooter) return false;
  const base = canDirectFire(shooter);
  if (!base.can) return false;
  if (shooter.side !== mainShooter.side) return false;

  // SS/国防軍の共同射撃禁止
  if (SCENARIO.noSSHeerStack && shooter.org && mainShooter.org) {
    if ((shooter.org === 'ss' && mainShooter.org === 'heer') ||
        (shooter.org === 'heer' && mainShooter.org === 'ss')) return false;
  }
  // 米英の共同射撃禁止
  if (SCENARIO.noUSUKStack && shooter.org && mainShooter.org) {
    if ((shooter.org === 'us' && mainShooter.org === 'uk') ||
        (shooter.org === 'uk' && mainShooter.org === 'us')) return false;
  }
  // ネーベルヴェルファーと迫撃砲の共同射撃禁止
  if (SCENARIO.noMortarNebelCombined) {
    const isNebel = (u) => u.unitName === 'Nebel';
    const isMortar = (u) => u.type === 'A' && !isNebel(u);
    if ((isNebel(shooter) && isMortar(mainShooter)) ||
        (isMortar(shooter) && isNebel(mainShooter))) return false;
  }

  const sHex = shooter.hexId || toHexId(shooter.col, shooter.row);
  const mHex = mainShooter.hexId || toHexId(mainShooter.col, mainShooter.row);

  // 同一ヘクス→常に可 (11-5-(1))
  if (sHex === mHex) return true;

  // 指揮官の指揮範囲内→可 (11-5-(2))
  const leader = getActiveLeaderForUnit(shooter, 'F');
  if (leader) {
    // 指揮官がメインシューターもカバーしてるかチェック
    if (canCommandUnit(leader, mainShooter)) return true;
  }

  // R能力指揮官で繋がっている→可
  if (areLinkedByRLeader(sHex, mHex, shooter.side)) return true;

  return false;
}

// R能力指揮官のヘクスを中心に参加可能ヘクス一覧を返す
function getRLeaderLinkedHexes(hexId, side) {
  const result = [hexId];
  const leader = getLeaderInHex(hexId, side);
  if (leader && leader.abilities && leader.abilities.includes('R')) {
    const pos = fromHexId(hexId);
    const neighbors = getHexNeighbors(pos.col, pos.row);
    for (const n of neighbors) {
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;
      result.push(toHexId(n.col, n.row));
    }
  }
  return result;
}

// 指定ヘクスがR指揮官経由で繋がっているか（shooterとmainShooterが同じR指揮官ネットワーク内か）
function areLinkedByRLeader(hex1, hex2, side) {
  if (hex1 === hex2) return true;
  // hex1のR指揮官チェック
  const linked1 = getRLeaderLinkedHexes(hex1, side);
  if (linked1.includes(hex2)) return true;
  // hex2のR指揮官チェック
  const linked2 = getRLeaderLinkedHexes(hex2, side);
  if (linked2.includes(hex1)) return true;
  return false;
}

// サプライズ・アタック判定 (11-7)
function isSurpriseAttack(shooterHexId, side) {
  // 射撃側のダミーが1枚でもあればサプライズ成立
  const dummyCount = testUnits.filter(u =>
    u.type === 'dummy' && u.hexId === shooterHexId && u.side === side && u.status !== 'eliminated'
  ).length;
  return dummyCount > 0;
}

// ===== 陣地チェック =====
// ヘクスに生きた陣地があるか（陣地がある間は中のユニットを攻撃不可）
function getActiveFortification(hexId) {
  return testUnits.find(u =>
    (u.hexId || toHexId(u.col, u.row)) === hexId &&
    u.type === 'fortification' && u.status !== 'eliminated'
  );
}

// 陣地レベルを取得（名前から）
function getFortLevel(fortUnit) {
  const m = fortUnit.name.match(/Lv(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

// 陣地をレベルダウン（E結果時）。Lv1以下なら除去。
function downgradeFort(fortUnit) {
  const level = getFortLevel(fortUnit);
  if (level <= 1) {
    fortUnit.status = 'eliminated';
    addLog('fire', `${fortUnit.name} → 除去`);
    return;
  }
  const newLevel = level - 1;
  const defKey = `marker_zinchi${newLevel}`;
  const def = UNIT_DEFS[defKey];
  if (def) {
    fortUnit.name = def.name;
    fortUnit.def = def.def;
    fortUnit.src = def.img;
    fortUnit.status = 'ok';
    addLog('fire', `陣地レベルダウン → ${def.name}`);
  } else {
    fortUnit.status = 'eliminated';
    addLog('fire', `${fortUnit.name} → 除去（レベルダウン先なし）`);
  }
}

// 陣地への装甲火力攻撃 (17章)
// D10: 1-2→D, 3→DD, 4+→E（レベルダウン）。回復なし
function fireFortification(shooters, fortUnit) {
  const totalFPAT = shooters.reduce((s, u) => s + (u.fpAT || 0), 0);
  if (totalFPAT <= 0) {
    addLog('fire', '陣地攻撃: 装甲火力がないため攻撃不可');
    return null;
  }

  const roll = Math.floor(Math.random() * 10);
  const prevStatus = fortUnit.status;
  const prevName = fortUnit.name;
  let damage = 'none';
  if (roll >= 4) {
    // E結果: レベルダウン
    downgradeFort(fortUnit);
    damage = 'eliminated';
  } else if (roll === 3) {
    if (fortUnit.status === 'ok') { fortUnit.status = 'dd'; damage = 'dd'; }
    else { downgradeFort(fortUnit); damage = 'eliminated'; }
  } else if (roll >= 1) {
    if (fortUnit.status === 'ok') { fortUnit.status = 'd'; damage = 'd'; }
    else if (fortUnit.status === 'd') { fortUnit.status = 'dd'; damage = 'dd'; }
    else { downgradeFort(fortUnit); damage = 'eliminated'; }
  }
  // roll === 0 → 効果なし

  // 射撃済みフラグ
  shooters.forEach(u => {
    const uid = u.id || u.name;
    directFireState.firedUnits.add(uid);
    u.firedThisTurn = true;
    directFireState.movedUnits.add(uid);
  });

  const dmgLabel = damage === 'eliminated' ? (fortUnit.status === 'eliminated' ? '除去' : 'レベルダウン') : damage === 'dd' ? 'DD' : damage === 'd' ? 'D' : '効果なし';
  addLog('fire', `陣地攻撃: ${shooters.map(u=>u.name).join('+')} → ${prevName} (装甲火力${totalFPAT}, D10:${roll}) → ${dmgLabel}`);

  return { roll, damage, prevStatus, prevName, newStatus: fortUnit.status, newName: fortUnit.name, fortUnit, totalFPAT };
}

// ===== 統一射撃フロー =====
// 全射撃（先制・ストップ・反撃）がこのフローを通る
// type: 'fire'|'stop'|'counter'|'surprise'
// shooters: 射撃ユニット配列, target: 目標ユニット
// callback: 射撃完了後のコールバック
let _fireFlowState = null;

function showFireFlow(type, shooters, target, callback) {
  const preview = calcFirePreview(shooters, target);
  if (!preview) { if (callback) callback(null); return; }

  const typeLabel = {fire:'先制射撃', stop:'ストップ射撃', counter:'反撃', surprise:'サプライズ'}[type] || '射撃';
  const shooterNames = shooters.length > 3
    ? shooters[0].name + '他' + (shooters.length - 1)
    : shooters.map(u => u.name).join('+');

  _fireFlowState = { type, shooters, target, preview, callback };

  const c = document.getElementById('phaseContent');
  let html = `<div style="padding:10px;background:var(--pg-shade);border:2px solid var(--pg-line);border-radius:6px;">`;
  html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:1.1em;">${typeLabel}</div>`;
  html += `<div style="margin:6px 0;">`;
  html += `<div style="color:var(--pg-green);">射撃: ${shooterNames} (fp${preview.totalFP})</div>`;
  html += `<div style="color:var(--pg-red);">目標: ${target.name} (def${target.def || 0})</div>`;
  html += `<div style="font-size:0.85em;color:var(--pg-muted);">距離:${preview.dist} 修正:${preview.totalMod}`;
  if (preview.terrainMod) html += ` 地形${preview.terrainMod}`;
  if (preview.maxRangeMod) html += ` 最大射程${preview.maxRangeMod}`;
  if (preview.facilityMod) html += ` I.P.${preview.facilityMod}`;
  html += `</div>`;
  html += `</div>`;
  // 確率表示
  html += `<div style="display:flex;gap:8px;margin:6px 0;font-size:0.9em;">`;
  html += `<span style="color:var(--pg-muted);">効果なし:${preview.none}%</span>`;
  html += `<span style="color:var(--pg-accent);">D:${preview.d}%</span>`;
  html += `<span style="color:var(--pg-red);">DD:${preview.dd}%</span>`;
  html += `<span style="color:var(--pg-red);">壊滅:${preview.elim}%</span>`;
  html += `</div>`;
  html += `<div style="display:flex;gap:6px;margin-top:8px;">`;
  html += `<button class="dice-btn" style="background:var(--pg-red-bg);padding:8px 20px;" onclick="fireFlowExecute()">射撃実行</button>`;
  html += `<button class="dice-btn" style="background:var(--pg-shade);padding:8px 20px;" onclick="fireFlowCancel()">キャンセル</button>`;
  html += `</div></div>`;
  c.innerHTML = html;

  // 矢印
  const shooterHexId = shooters[0].hexId || toHexId(shooters[0].col, shooters[0].row);
  const targetHexId = target.hexId || toHexId(target.col, target.row);
  fireArrowData = { from: shooterHexId, to: targetHexId, side: shooters[0].side };
  drawMap();
}

function fireFlowExecute() {
  if (!_fireFlowState) return;
  const { type, shooters, target, preview, callback } = _fireFlowState;
  const typeLabel = {fire:'先制射撃', stop:'ストップ射撃', counter:'反撃', surprise:'サプライズ'}[type] || '射撃';
  const shooterNames = shooters.length > 3
    ? shooters[0].name + '他' + (shooters.length - 1)
    : shooters.map(u => u.name).join('+');

  // 実際の射撃実行
  const result = executeDirectFire(shooters, target, type === 'counter');
  _fireFlowState = null;

  const dmgText = result.newStatus === 'eliminated' ? '壊滅' :
                  result.damage === 'dd' ? 'DD' :
                  result.damage === 'd' ? 'D' : '効果なし';
  const rc = result.newStatus === 'eliminated' ? 'hit-elim' : result.damage === 'dd' ? 'hit-dd' : result.damage === 'd' ? 'hit-d' : 'hit-none';

  const overlayRows = [{
    label: target.name,
    roll: result.roll,
    detail: `FP${result.totalFP} 防御${target.def||0}`,
    resultText: dmgText,
    resultClass: rc,
    detailAfter: `${result.prevStatus.toUpperCase()} → ${result.newStatus.toUpperCase()} ダイス${result.roll}${result.totalMod ? ' 修正'+result.modifiedRoll : ''}`
  }];
  // 指揮官負傷チェック結果（ダイス0で負傷）
  if (result.leaderCheck) {
    overlayRows.push({
      label: result.leaderCheck.leader.name,
      roll: result.leaderCheck.roll,
      detail: '指揮官負傷チェック (0で負傷)',
      resultText: result.leaderCheck.wounded ? '負傷！除去' : '無事',
      resultClass: result.leaderCheck.wounded ? 'hit-elim' : 'hit-none',
    });
  }
  showDiceOverlay(typeLabel, `${shooterNames} → ${target.name}`, overlayRows, function() {
    fireFlowShowResult(type, shooters, target, result, callback);
  });
}

function fireFlowShowResult(type, shooters, target, result, callback) {
  const c = document.getElementById('phaseContent');
  const typeLabel = {fire:'先制射撃', stop:'ストップ射撃', counter:'反撃', surprise:'サプライズ'}[type] || '射撃';

  const dmgText = result.newStatus === 'eliminated' ? '壊滅' :
                  result.damage === 'dd' ? 'DD' :
                  result.damage === 'd' ? 'D' : '効果なし';
  const dmgColor = result.newStatus === 'eliminated' || result.damage === 'dd' ? 'var(--pg-red)' :
                   result.damage === 'd' ? 'var(--pg-accent)' : 'var(--pg-muted)';

  // 最大射程退避判定: ストップ射撃で敵射程3以上、最大射程、壊滅、移動力1以上
  const ms = moveState;
  const canEvade = (type === 'stop' || type === 'surprise') &&
    result.newStatus === 'eliminated' &&
    result.dist === shooters[0].range &&
    shooters[0].range >= 3 &&
    ms && ms.remainingMP >= 1;

  let html = `<div style="padding:10px;background:var(--pg-shade);border:2px solid var(--pg-line);border-radius:6px;text-align:center;">`;
  html += `<div style="color:var(--pg-muted);font-size:0.85em;">${typeLabel}</div>`;
  html += `<div style="font-size:2em;font-weight:bold;color:var(--pg-accent);margin:6px 0;">D10: ${result.roll}</div>`;
  if (result.totalMod) html += `<div style="font-size:0.85em;color:var(--pg-muted);">修正後: ${result.modifiedRoll}</div>`;
  html += `<div style="font-size:1.5em;font-weight:bold;color:${dmgColor};margin:8px 0;">${dmgText}</div>`;
  html += `<div style="font-size:0.85em;color:var(--pg-ink);">${target.name}: ${result.prevStatus.toUpperCase()} → ${result.newStatus.toUpperCase()}</div>`;
  if (result.ammoDeplete) html += `<div style="color:var(--pg-red);margin-top:4px;">弾薬不足発生！</div>`;
  html += `<div style="margin-top:10px;display:flex;gap:6px;justify-content:center;">`;
  html += `<button class="dice-btn" style="padding:6px 20px;" onclick="fireFlowComplete()">OK</button>`;
  if (canEvade) {
    html += `<button class="dice-btn" style="padding:6px 20px;background:var(--pg-blue-bg);" onclick="fireFlowEvade()">射程外に退避（全員DD）</button>`;
  }
  html += `</div></div>`;
  c.innerHTML = html;

  _fireFlowState = { callback, result, type, shooters, target, canEvade };
  drawMap();
}

function fireFlowEvade() {
  if (!_fireFlowState || !_fireFlowState.canEvade) return;
  const { callback, result, target } = _fireFlowState;
  const ms = moveState;

  // 壊滅を取り消し→全員DD
  target.status = result.prevStatus; // 壊滅前に戻す
  const movingUnits = ms._stackMoving || [ms.movingUnit];
  movingUnits.forEach(u => {
    if (u.status !== 'eliminated') u.status = 'dd';
  });

  // 1ヘクス後退（射程外へ）
  if (ms.path && ms.path.length >= 2) {
    const prevHex = ms.path[ms.path.length - 2];
    const center = getHexCenter(prevHex.col, prevHex.row);
    const hexId = toHexId(prevHex.col, prevHex.row);
    movingUnits.forEach(u => {
      if (u.status !== 'eliminated') {
        u.col = prevHex.col; u.row = prevHex.row;
        u.x = center.x; u.y = center.y; u.hexId = hexId;
      }
    });
    ms.path.pop();
  }

  ms.remainingMP = 0;
  addLog('move', `射程外に退避 → 全員DD`);

  _fireFlowState = null;
  finishStopFire();
  drawMap();
}

function fireFlowComplete() {
  if (!_fireFlowState) return;
  const { callback, result } = _fireFlowState;
  _fireFlowState = null;
  if (callback) callback(result);
}

function fireFlowCancel() {
  const type = _fireFlowState?.type;
  _fireFlowState = null;
  if (moveState.stopFirePending && (type === 'stop' || type === 'counter')) {
    skipCounterAttack();
    return;
  }
  renderMoveFirePhase();
  drawMap();
}

// 直接射撃実行
function executeDirectFire(shooters, target, counter = false) {
  const isArmored = target.type === 'T' || target.type === 'AC';

  // 火力合計 (11-1-(5): 合計可、分割不可)
  let totalFP = 0;
  shooters.forEach(u => {
    totalFP += isArmored ? (u.fpAT || 0) : (u.fpSoft || 0);
  });

  if (totalFP <= 0) return { error: '火力0 — 攻撃不可' };
  if (typeof pgNoteMovementCombat === 'function') pgNoteMovementCombat(shooters, target);

  // ダイス修正計算
  const targetHexId = target.hexId || toHexId(target.col, target.row);
  const terrainMod = getTerrainFireMod(targetHexId);

  // 最大射程修正 (11-1-(3)): 射程3以上で最大射程使用時-1
  const sPos = fromHexId(shooters[0].hexId || toHexId(shooters[0].col, shooters[0].row));
  const tPos = fromHexId(targetHexId);
  const dist = hexDistance(sPos.col, sPos.row, tPos.col, tPos.row);
  let maxRangeMod = 0;
  if (shooters[0].range >= 3 && dist === shooters[0].range) {
    maxRangeMod = -1;
  }

  // I.P./陣地修正
  const facility = FACILITY_MAP[targetHexId];
  let facilityMod = 0;
  if (facility === 'ip') facilityMod = -1;

  // 移動隊形修正 (12-3-(5)): 移動隊形のユニットへの射撃はダイス+2
  let marchMod = 0;
  if (target.marchMode) marchMod = 2;

  const totalMod = terrainMod + maxRangeMod + facilityMod + marchMod;

  // ダイスロール
  const roll = Math.floor(Math.random() * 10);
  const modifiedRoll = roll + totalMod;

  // 戦闘結果表参照
  const combat = getFireCombatResult(totalFP, modifiedRoll);
  const damage = resolveDamage(combat.damageLevel, target.def || 0);

  // 弾薬不足チェック (11-8): 戦車・装甲車のみ、個別ダイス判定
  let ammoDeplete = false;
  const ammoRolls = [];
  if (G.ammoCheck && combat.ammoCheck) {
    const depletionRoll = SCENARIO.ammoDepletionRoll || null;
    shooters.forEach(u => {
      if (u.type === 'T' || u.type === 'AC') {
        if (depletionRoll) {
          // シナリオ別閾値で個別判定
          const threshold = depletionRoll[u.side] != null ? depletionRoll[u.side] : 1;
          const aRoll = Math.floor(Math.random() * 10);
          const depleted = aRoll <= threshold;
          ammoRolls.push({ unit: u, roll: aRoll, threshold, depleted });
          if (depleted) {
            u.outOfAmmo = true;
            ammoDeplete = true;
          }
        } else {
          // 閾値未設定: 従来通り自動弾切れ
          u.outOfAmmo = true;
          ammoDeplete = true;
        }
      }
    });
  }

  // 損害適用
  const prevStatus = target.status;
  if (target._towed && damage !== 'none') {
    // 牽引状態ユニットへの射撃特殊処理
    const towRoll = Math.floor(Math.random() * 10);
    // まず表（戦闘隊形）に戻す
    target.closeAtk = target._origCloseAtk;
    target.closeDef = target._origCloseDef;
    target.move = target._origMove;
    target.marchMode = false;
    target._towed = false;
    if (combat.isElimination) {
      // E結果
      if (target.type === 'I') {
        // 歩兵: 0-4でDD、5-9で壊滅
        if (towRoll <= 4) {
          target.status = 'dd';
          addLog('fire', `${target.name}: 牽引状態E結果 D10:${towRoll} → 表に戻りDD`);
        } else {
          target.status = 'eliminated';
          target.noTransport = true; // 二度と輸送体系になれない
          addLog('fire', `${target.name}: 牽引状態E結果 D10:${towRoll} → 壊滅（輸送体系不可）`);
        }
      } else {
        // 非歩兵（大砲・対戦車砲等）: E結果は壊滅
        target.status = 'eliminated';
        addLog('fire', `${target.name}: 牽引状態E結果 → 壊滅`);
      }
    } else if (damage !== 'none') {
      // 通常損害結果
      if (target.type === 'I') {
        // 歩兵: 0-4で表に戻る、5-9で表に戻りDD
        if (towRoll <= 4) {
          target.status = 'ok';
          addLog('fire', `${target.name}: 牽引状態被弾 D10:${towRoll} → 表に戻る`);
        } else {
          target.status = 'dd';
          addLog('fire', `${target.name}: 牽引状態被弾 D10:${towRoll} → 表に戻りDD`);
        }
      } else {
        // 非歩兵: 0-4で表に戻る、5-9で表に戻りDD
        if (towRoll <= 4) {
          target.status = 'ok';
          addLog('fire', `${target.name}: 牽引状態被弾 D10:${towRoll} → 表に戻る`);
        } else {
          target.status = 'dd';
          addLog('fire', `${target.name}: 牽引状態被弾 D10:${towRoll} → 表に戻りDD`);
        }
      }
    }
  } else {
    applyDamageToUnit(target, damage);
  }

  // 射撃済みフラグ
  shooters.forEach(u => {
    const uid = u.id || u.name;
    const fired = counter ? directFireState.counterFiredUnits : directFireState.firedUnits;
    fired.add(uid);
    u.firedThisTurn = true;
  });

  // ダミー除去 — 射撃したらダミーが剥がれる
  const shooterHexId = shooters[0].hexId || toHexId(shooters[0].col, shooters[0].row);
  if (dummyMap[shooterHexId] && dummyMap[shooterHexId].side === shooters[0].side) {
    removeAllDummies(shooterHexId);
  }

  const result = {
    shooters, target, roll, totalMod, modifiedRoll, totalFP,
    damageLevel: combat.damageLevel, isElimination: combat.isElimination,
    ammoCheck: combat.ammoCheck, ammoDeplete,
    damage, prevStatus, newStatus: target.status,
    terrainMod, maxRangeMod, facilityMod, marchMod, dist,
  };

  // ログ
  const dlLabel = combat.isElimination ? 'E' : combat.damageLevel;
  const modStr = [];
  if (terrainMod) modStr.push(`地形${terrainMod}`);
  if (maxRangeMod) modStr.push(`最大射程${maxRangeMod}`);
  if (facilityMod) modStr.push(`I.P.${facilityMod}`);
  if (marchMod) modStr.push(`移動隊形+${marchMod}`);
  const modLabel = modStr.length ? `(${modStr.join(',')})` : '';

  if (damage !== 'none') {
    addLog('fire', `直接射撃: ${shooters.map(u=>u.name).join('+')} → ${target.name} (fp${totalFP}, ダイス${roll}${modLabel}=${modifiedRoll}, 損害Lv${dlLabel}) → ${prevStatus.toUpperCase()}→${target.status.toUpperCase()}`);
  } else {
    addLog('fire', `直接射撃: ${shooters.map(u=>u.name).join('+')} → ${target.name} (fp${totalFP}, ダイス${roll}${modLabel}=${modifiedRoll}, 損害Lv${dlLabel}) → 効果なし`);
  }
  if (ammoRolls.length > 0) {
    ammoRolls.forEach(ar => {
      addLog('fire', `弾薬判定: ${ar.unit.name} D10=${ar.roll} (0-${ar.threshold}で弾切れ) → ${ar.depleted ? '弾薬不足！' : 'OK'}`);
    });
  }

  // 指揮官負傷チェック
  result.leaderCheck = null;
  if (damage !== 'none') {
    const lc = checkLeaderCasualty(targetHexId, target.side);
    if (lc) result.leaderCheck = lc;
    checkLeaderOnStackEliminated(targetHexId, target.side);
  }

  return result;
}

// ===== 移動・射撃フェイズUI =====

// 射撃矢印データ（drawMapで使用）
let fireArrowData = { from:null, to:null, side:null };

// チェック状態: { 'atk': Set(uid), 'def': Set(uid) }
let checkState = { atk: new Set(), def: new Set() };

function toggleUnitCheck(group, uid, checked) {
  if (checked) checkState[group].add(uid);
  else checkState[group].delete(uid);
  // 射程範囲を更新
  updateFireRange();
  renderMoveFirePhase();
  drawMap();
}

function pgStackCheckButtons(units, checks, eligible = () => true) {
  if (units.length < 2) return '';
  const has = unit => checks.has(unit.id || unit.name);
  const allowed = units.filter(eligible);
  const all = allowed.length > 0 && allowed.every(has);
  const none = !units.some(has);
  return `<div class="pg-stack-checks">
    <button type="button" class="btn-sm" aria-pressed="${none}" onclick="pgToggleStackChecks(this, false)">全部外す</button>
    <button type="button" class="btn-sm" aria-pressed="${all}" ${allowed.length ? '' : 'disabled'} onclick="pgToggleStackChecks(this, true)">全部入れる</button>
  </div>`;
}

function pgToggleStackChecks(button, checked) {
  const stack = button.closest('[data-pg-stack]');
  const group = stack.dataset.pgStack;
  const checks = group === 'assault' ? assaultState.atkChecked : checkState[group];
  for (const control of stack.querySelectorAll('input[type="checkbox"], .pg-unit-pick')) {
    if (!checked) checks.delete(control.value);
    else if (!control.disabled && control.dataset.pgSelectable !== 'false') checks.add(control.value);
  }
  if (group === 'assault') renderAssaultPhase();
  else {
    updateFireRange();
    renderMoveFirePhase();
  }
  drawMap();
}

function pgFriendlyUnits(hexId) {
  return testUnits.filter(unit => pgOnMap(unit) && unit.hexId === hexId &&
    unit.side === directFireState.activeSide && !STACK_EXEMPT_TYPES.includes(unit.type));
}

function pgPickedFriendlyUnits() {
  return (directFireState.atkAdjacentHexes || [directFireState.atkHexId])
    .flatMap(pgFriendlyUnits).filter(unit => checkState.atk.has(unit.id || unit.name));
}

function pgCanPickFriendlyUnit(unit) {
  return !(unit.moveComplete && pgUnitHasFired(unit));
}

function pgPickFriendlyUnit(uid) {
  const unit = (directFireState.atkAdjacentHexes || [directFireState.atkHexId])
    .flatMap(pgFriendlyUnits).find(unit => (unit.id || unit.name) === uid);
  if (!unit) return;
  pgOrderUnit = unit;
  pgOrderHex = unit.hexId;
  if (checkState.atk.has(uid) || pgCanPickFriendlyUnit(unit)) {
    toggleUnitCheck('atk', uid, !checkState.atk.has(uid));
  } else {
    renderMoveFirePhase();
    drawMap();
  }
}

function pgCheckboxValue(uid) {
  return String(uid).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

// チェック済み味方ユニットの射程範囲・視認範囲を計算
let fireRangeHexes = {}; // { "col,row": true }
let fireVisionHexes = {}; // { "col,row": true } 視認距離範囲
function updateFireRange() {
  fireRangeHexes = {};
  fireVisionHexes = {};
  if (!pgMayInitiateDirectFire()) return;
  const shooters = pgPickedFriendlyUnits().filter(unit => canDirectFire(unit).can);
  const rangesByHex = new Map();
  for (const shooter of shooters) {
    const current = rangesByHex.get(shooter.hexId);
    if (!current || shooter.range > current.range) rangesByHex.set(shooter.hexId, shooter);
  }
  for (const {col, row, range} of rangesByHex.values()) {
    const seen = calculateVisionRange(col, row, G.visionRange);
    Object.assign(fireVisionHexes, seen);
    for (const key of Object.keys(seen)) {
      const [c, r] = key.split(',').map(Number);
      if (hexDistance(col, row, c, r) <= range) fireRangeHexes[key] = true;
    }
  }
}

function pgSelectedFireLines() {
  const df = directFireState;
  if (!pgMayInitiateDirectFire() || df.mode !== 'selectShooter' || pgAIReview ||
      pgOrderDraft || losMode || losCheckMode || fireArrowData?.from || !df.defHexId) return [];
  const target = testUnits.find(unit => unit.hexId === df.defHexId && checkState.def.has(unit.id || unit.name))
    || getActiveFortification(df.defHexId);
  if (!target) return [];
  const byHex = new Map();
  for (const shooter of pgPickedFriendlyUnits().filter(unit => canDirectFire(unit).can)) {
    if (target.type === 'fortification' && shooter.fpAT <= 0) continue;
    const clear = (target.type === 'fortification' ? pgShotLineCheck(shooter, target) : canTargetUnit(shooter, target)).can;
    if (!byHex.has(shooter.hexId) || !clear) byHex.set(shooter.hexId, {shooter, target, clear});
  }
  return [...byHex.values()];
}

// 命中率・損害確率を計算
function calcFirePreview(shooters, target) {
  const isArmored = target.type === 'T' || target.type === 'AC';
  let totalFP = 0;
  shooters.forEach(u => { totalFP += isArmored ? (u.fpAT || 0) : (u.fpSoft || 0); });
  if (totalFP <= 0) return null;

  const targetHexId = target.hexId || toHexId(target.col, target.row);
  const terrainMod = getTerrainFireMod(targetHexId);

  // 最大射程修正
  const sPos = fromHexId(shooters[0].hexId || toHexId(shooters[0].col, shooters[0].row));
  const tPos = fromHexId(targetHexId);
  const dist = hexDistance(sPos.col, sPos.row, tPos.col, tPos.row);
  let maxRangeMod = 0;
  if (shooters[0].range >= 3 && dist === shooters[0].range) maxRangeMod = -1;

  const facility = FACILITY_MAP[targetHexId];
  let facilityMod = 0;
  if (facility === 'ip') facilityMod = -1;
  let marchMod = 0;
  if (target.marchMode) marchMod = 2;
  const totalMod = terrainMod + maxRangeMod + facilityMod + marchMod;

  // ダイス0-9の各結果を計算
  let countNone = 0, countD = 0, countDD = 0, countElim = 0;
  for (let roll = 0; roll <= 9; roll++) {
    const modRoll = roll + totalMod;
    const combat = getFireCombatResult(totalFP, modRoll);
    const dmg = resolveDamage(combat.damageLevel, target.def || 0);
    if (dmg === 'none') countNone++;
    else if (dmg === 'd') countD++;
    else if (dmg === 'dd') countDD++;
    else if (dmg === 'eliminated') countElim++;
  }

  return {
    totalFP, dist, totalMod, terrainMod, maxRangeMod, facilityMod,
    none: countNone * 10, d: countD * 10, dd: countDD * 10, elim: countElim * 10,
    isArmored,
  };
}

function pgMayInitiateDirectFire() {
  return PHASES[G.phase]?.id === 'moveFire';
}

function renderMoveFirePhase() {
  const c = document.getElementById('phaseContent');
  const df = directFireState;
  let html = '';
  if ((pgAIReview?.stage === 'review' || pgOrderDraft) && df.mode !== 'moving') {
    c.replaceChildren(pgMovementPanel());
    return;
  }

  // 移動中の場合
  if (df.mode === 'moving') {
    const ms = moveState;
    const u = ms.movingUnit;
    html += `<div style="padding:6px;background:var(--pg-shade);border-radius:4px;">`;
    html += '<b style="color:var(--pg-green);">移動中</b>';
    if (u) {
      html += `<div class="pg-moving-units">${(ms._stackMoving || [u]).filter(pgOnMap).map(unit => pgUnitLabel(unit).outerHTML).join('')}</div>`;
      html += '<div class="pg-move-legend"><span>青枠＝移動可能</span><span>黄枠＝現在地</span></div>';
      const combatUnits = (ms._stackMoving || [u]).filter(unit => pgOnMap(unit) && unit.type !== 'leader');
      const fullMP = Math.min(...combatUnits.map(unit => unit.move || 0));
      const startingMP = ms.cautious ? Math.floor(fullMP / 2) : fullMP;
      html += `<small>残移動力: ${ms.remainingMP} / ${startingMP}`;
      if (ms.cautious) html += ' (警戒移動)';
      html += `</small>`;

      // ストップ射撃警告
      if (ms.stopFirePending && ms.stopFireEnemies && ms.stopFireEnemies.length > 0) {
        html += `<div style="margin:6px 0;padding:6px;background:var(--pg-red-bg);border:1px solid var(--pg-line);border-radius:4px;">`;
        html += `<b style="color:var(--pg-red);">⚠ ストップ射撃</b><br>`;
        html += `<small style="color:var(--pg-red);">以下の敵ユニットがストップ射撃可能:</small>`;
        ms.stopFireEnemies.forEach(e => {
          html += `<div style="color:var(--pg-red);font-size:0.8em;">・${e.name} (fp${e.fpAT}/${e.fpSoft} R${e.range})</div>`;
        });
        html += `<div style="margin-top:4px;display:flex;gap:4px;">`;
        html += `<button class="btn-sm" style="background:var(--pg-red-bg);" onclick="resolveStopFire()">ストップ射撃を実行</button>`;
        html += `<button class="btn-sm" onclick="skipStopFire()">射撃なし（移動続行）</button>`;
        if (!ms._stopFired && !pgOrderRun) html += '<button class="btn-sm" onclick="cancelMove()">移動を取り消す</button>';
        html += `</div></div>`;
      }

      html += `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">`;
      if (!ms.stopFirePending) {
        html += `<button class="btn-sm" onclick="confirmMove()">移動確定</button>`;
        if (!ms._stopFired && !pgOrderRun) {
          html += `<button class="btn-sm" onclick="cancelMove()">移動を取り消す</button>`;
        }
        if (ms.path.length === 1 && !ms._stopFired && !pgOrderRun) {
          const inMarch = combatUnits.some(unit => unit.marchMode);
          if ((inMarch || combatUnits.some(isVehicle)) &&
              combatUnits.every(unit => unit.status === 'ok' && (inMarch || !unit.noTransport))) {
            html += `<button class="btn-sm" onclick="toggleFormation()">${inMarch ? '戦闘隊形へ' : '移動隊形へ'}</button>`;
          }
          if (!inMarch && combatUnits.every(unit => unit.status === 'ok')) {
            html += `<button class="btn-sm" aria-pressed="${ms.cautious}" onclick="toggleCautious()">${ms.cautious ? '警戒解除' : '警戒移動'}</button>`;
          }
        }
        // オーバーラン (12-5): 隣接敵がいれば表示
        if (!pgAIReview && !pgOrderRun && combatUnits.every(unit => !unit.marchMode && unit.status === 'ok') && !u.outOfAmmo && !ms.cautious) {
          const adjEnemies = getAdjacentEnemyStacks(u);
          if (Object.keys(adjEnemies).length > 0) {
            html += `</div><div style="margin-top:4px;padding:4px;background:var(--pg-red-bg);border:1px solid var(--pg-line);border-radius:3px;">`;
            html += `<div style="color:var(--pg-red);font-size:0.8em;font-weight:bold;">オーバーラン可能</div>`;
            Object.keys(adjEnemies).forEach(hexId => {
              const terrain = getHexTerrain(hexId);
              const tNames = {p:'平地',w:'林',f:'森林',r:'荒地',t:'町',c:'市街地',lake:'湖'};
              const mc = getMoveCost(u, u.col, u.row, fromHexId(hexId).col, fromHexId(hexId).row, ms.formation);
              const overrunCost = mc.cost === Infinity ? '不可' : (mc.cost + 2);
              const canOR = mc.cost !== Infinity && ms.remainingMP >= mc.cost + 2;
              const enemies = adjEnemies[hexId];
              const eNames = enemies.length > 0 ? enemies.map(e => e.name).join(',') : 'ダミー';
              html += `<div style="font-size:0.75em;color:var(--pg-muted);display:flex;align-items:center;gap:4px;padding:1px 0;">`;
              html += `${hexId}(${tNames[terrain]||terrain}) ${eNames} MP:${overrunCost}`;
              if (canOR) {
                html += `<button class="dice-btn" style="padding:4px 14px;font-size:0.9em;background:var(--pg-red-bg);margin-left:6px;" onclick="doOverrun('${hexId}')">オーバーラン</button>`;
              } else {
                html += ` <span style="color:var(--pg-muted);">MP不足</span>`;
              }
              html += `</div>`;
            });
          }
        }
      }
      html += `</div>`;
    }
    html += `</div>`;
    c.innerHTML = html;
    return;
  }

  // 反撃モード
  if (df.mode === 'counterAttack') {
    html += `<div style="padding:6px;background:var(--pg-red-bg);border:1px solid var(--pg-line);border-radius:4px;">`;
    html += `<b style="color:var(--pg-red);">反撃可能</b><br><small>反撃するユニットのヘクスをクリック</small>`;
    html += `<button class="btn-sm" onclick="skipCounter()" style="margin-top:4px;">反撃しない</button>`;
    html += `</div>`;
    c.innerHTML = html;
    return;
  }

  // === 味方スタック（上）＋隣接ヘクスの味方 ===
  const tNames = {p:'平地',w:'林',f:'森林',r:'荒地',t:'町',c:'市街地',lake:'湖'};
  html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:0.85em;margin-bottom:2px;">▼ 味方</div>`;
  if (df.atkHexId) {
    const adjHexes = df.atkAdjacentHexes || [df.atkHexId];
    adjHexes.forEach(ahex => {
      const atkUnits = pgFriendlyUnits(ahex);
      if (atkUnits.length === 0) return;
      const terrain = getHexTerrain(ahex);
      const isMain = ahex === df.atkHexId;
      html += `<div data-pg-stack="atk" style="padding:4px;background:${isMain?'var(--pg-card)':'var(--pg-shade)'};border:1px solid var(--pg-line);border-radius:4px;margin-bottom:2px;">`;
      html += `<div style="color:var(--pg-muted);font-size:0.7em;">${ahex} (${tNames[terrain]||terrain})${isMain?'':' [隣接]'}</div>`;
      html += pgStackCheckButtons(atkUnits, checkState.atk, pgCanPickFriendlyUnit);
      atkUnits.forEach(u => {
        const uid = u.id || u.name;
        const checked = checkState.atk.has(uid);
        const statusColor = u.status === 'ok' ? 'var(--pg-green)' : u.status === 'd' ? 'var(--pg-accent)' : u.status === 'dd' ? 'var(--pg-red)' : 'var(--pg-muted)';
        html += `<button type="button" class="btn-sm pg-unit-row pg-unit-pick" value="${pgCheckboxValue(uid)}"
          data-pg-selectable="${pgCanPickFriendlyUnit(u)}" aria-pressed="${checked}" onclick="pgPickFriendlyUnit(this.value)">`;
        html += pgUnitLabel(u).outerHTML;
        if (u.status !== 'ok') html += `<span style="color:${statusColor};font-weight:bold;">${u.status.toUpperCase()}</span>`;
        html += `<span style="color:var(--pg-muted);font-size:0.75em;">fp${u.fpAT}/${u.fpSoft} R${u.range}</span>`;
        if (pgUnitHasFired(u)) html += '<span class="pg-action-state pg-fired">射撃済</span>';
        if (u.reconDone) html += '<span class="pg-action-state">偵察済</span>';
        if (u.moveComplete) html += '<span class="pg-action-state">移動済</span>';
        html += `</button>`;
      });
      html += `</div>`;
    });
  } else {
    html += `<div style="color:var(--pg-muted);font-size:0.8em;padding:4px;">地図の味方をクリック</div>`;
  }

  // === スタック全体操作ボタン ===
  if (df.atkHexId) {
    const checkedUnits = pgPickedFriendlyUnits();
    const canMove = pgCanMoveSelection(checkedUnits);
    html += `<div style="display:flex;gap:4px;margin:6px 0;flex-wrap:wrap;">`;
    html += `<button class="dice-btn" style="font-size:0.8em;padding:4px 12px;flex:1;" onclick="startStackMove()" ${canMove ? '' : 'disabled'}>${checkedUnits.length > 1 ? 'スタック移動' : '移動'}</button>`;
    const fort = pgMayInitiateDirectFire() && df.defHexId && getActiveFortification(df.defHexId);
    if (fort && checkedUnits.length) {
      const shooters = checkedUnits.filter(unit => canDirectFire(unit).can && unit.fpAT > 0);
      const denied = shooters.map(unit => pgShotLineCheck(unit, fort)).find(check => !check.can);
      if (shooters.length) {
        html += `<button class="dice-btn" style="font-size:0.8em;padding:4px 12px;flex:1;background:var(--pg-gold);" onclick="executeCheckedFortFire()" ${denied ? 'disabled' : ''}>陣地攻撃</button>`;
      }
      if (denied || !shooters.length) {
        html += `<div class="pg-shot-blocked">${denied?.reason || '射撃可能な装甲火力なし'}</div>`;
      }
    }
    html += `<button class="btn-sm" style="padding:4px 12px;flex:1;" onclick="clearSelection()">キャンセル</button>`;
    html += `</div>`;
  }

  html += '<div class="pg-friendly-controls"></div>';

  // === 敵スタック（下） ===
  html += `<div style="color:var(--pg-red);font-weight:bold;font-size:0.85em;margin:8px 0 2px;">▼ 敵</div>`;
  if (df.defHexId) {
    const defUnits = testUnits.filter(u =>
      u.hexId === df.defHexId && u.status !== 'eliminated' && u.col >= 0 && u.type !== 'dummy' &&
      (G.gameMode !== 'online' || !pgOnlineHidden(u, df.activeSide))
    );
    const terrain = getHexTerrain(df.defHexId);
    const tNames = {p:'平地',w:'林',f:'森林',r:'荒地',t:'町',c:'市街地',lake:'湖'};
    const activeFort = getActiveFortification(df.defHexId);
    html += `<div data-pg-stack="def" style="padding:4px;background:var(--pg-red-bg);border:1px solid var(--pg-line);border-radius:4px;margin-bottom:4px;">`;
    html += `<div style="color:var(--pg-muted);font-size:0.75em;margin-bottom:2px;">${df.defHexId} (${tNames[terrain]||terrain})</div>`;
    if (activeFort) {
      // 陣地表示
      const fortColor = activeFort.status === 'ok' ? '#8f8' : activeFort.status === 'd' ? '#fd8' : '#f88';
      html += `<div style="padding:4px;background:var(--pg-gold);border:1px solid #aa4;border-radius:3px;margin-bottom:4px;">`;
      html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:0.85em;">陣地 <span style="color:${fortColor};">${activeFort.status.toUpperCase()}</span></div>`;
      html += `<div style="color:var(--pg-muted);font-size:0.75em;">陣地を破壊しないとユニットを攻撃できません（装甲火力で攻撃）</div>`;
      html += `</div>`;
    }
    if (!activeFort) html += pgStackCheckButtons(defUnits.filter(u => u.type !== 'fortification'), checkState.def);
    defUnits.forEach(u => {
      if (u.type === 'fortification') return; // 陣地は上で表示済み
      const uid = u.id || u.name;
      const checked = checkState.def.has(uid);
      const disabled = activeFort ? true : false; // 陣地があれば選択不可
      const statusColor = u.status === 'ok' ? 'var(--pg-green)' : u.status === 'd' ? 'var(--pg-accent)' : u.status === 'dd' ? 'var(--pg-red)' : 'var(--pg-muted)';
      html += `<div style="display:flex;align-items:center;gap:4px;padding:2px 0;font-size:0.8em;${disabled?'opacity:0.4;':''}">`;
      html += `<input type="checkbox" ${checked?'checked':''} ${disabled?'disabled':''} value="${pgCheckboxValue(uid)}" onchange="toggleUnitCheck('def',this.value,this.checked)" style="margin:0;">`;
      html += `<span style="color:var(--pg-ink);">${u.name}</span>`;
      if (u.status !== 'ok') html += `<span style="color:${statusColor};font-weight:bold;">${u.status.toUpperCase()}</span>`;
      html += `<span style="color:var(--pg-muted);font-size:0.8em;">防御${u.def}</span>`;
      if (pgUnitHasFired(u)) html += '<span class="pg-action-state pg-fired">射撃済</span>';
      html += `</div>`;
    });
    html += `</div>`;
  } else {
    html += `<div style="color:var(--pg-muted);font-size:0.8em;padding:4px;">敵ヘクスをクリック</div>`;
  }

  // === 命中率・損害確率 ===
  const atkChecked = pgPickedFriendlyUnits().filter(unit => canDirectFire(unit).can);
  const defChecked = testUnits.filter(u => checkState.def.has(u.id || u.name) && u.status !== 'eliminated');

  if (pgMayInitiateDirectFire() && atkChecked.length > 0 && defChecked.length > 0) {
    html += `<div style="margin:8px 0;padding:8px;background:var(--pg-green-bg);border:1px solid #4a4;border-radius:4px;">`;
    html += `<div style="color:var(--pg-green);font-weight:bold;font-size:0.85em;margin-bottom:4px;">射撃予測</div>`;

    defChecked.forEach(target => {
      const denied = atkChecked.map(unit => ({unit, check: canTargetUnit(unit, target)})).filter(entry => !entry.check.can);
      if (denied.length) {
        for (const {unit, check} of denied) {
          html += `<div class="pg-shot-blocked">${unit.name} → ${target.name}：${check.reason}</div>`;
        }
        return;
      }
      const preview = calcFirePreview(atkChecked, target);
      if (!preview) return;
      html += `<div style="margin:4px 0;padding:4px;background:var(--pg-shade);border-radius:3px;font-size:0.8em;">`;
      html += `<div style="color:var(--pg-ink);">→ ${target.name} (防御${target.def}${preview.isArmored?' 装甲':' 非装甲'})</div>`;
      html += `<div style="color:var(--pg-muted);">合計火力:${preview.totalFP} 距離:${preview.dist} 修正:${preview.totalMod>=0?'+':''}${preview.totalMod}</div>`;
      // 確率バー
      const colors = { none:'var(--pg-shade)', d:'var(--pg-gold)', dd:'#eec8ad', elim:'var(--pg-red-bg)' };
      html += `<div style="display:flex;height:16px;border-radius:2px;overflow:hidden;margin:4px 0;">`;
      if (preview.none > 0) html += `<div style="width:${preview.none}%;background:${colors.none};text-align:center;font-size:0.7em;color:var(--pg-muted);line-height:16px;">無${preview.none}%</div>`;
      if (preview.d > 0) html += `<div style="width:${preview.d}%;background:${colors.d};text-align:center;font-size:0.7em;color:var(--pg-ink);line-height:16px;">D${preview.d}%</div>`;
      if (preview.dd > 0) html += `<div style="width:${preview.dd}%;background:${colors.dd};text-align:center;font-size:0.7em;color:var(--pg-ink);line-height:16px;">DD${preview.dd}%</div>`;
      if (preview.elim > 0) html += `<div style="width:${preview.elim}%;background:${colors.elim};text-align:center;font-size:0.7em;color:var(--pg-ink);line-height:16px;">壊滅${preview.elim}%</div>`;
      html += `</div>`;
      html += `</div>`;
    });

    html += `<button class="dice-btn" style="font-size:0.9em;padding:8px 24px;margin-top:8px;width:100%;" onclick="executeCheckedFire()" ${atkChecked.every(unit => canTargetUnit(unit, defChecked[0]).can) ? '' : 'disabled'}>射撃実行</button>`;
    html += `<button class="btn-sm" style="margin-top:4px;width:100%;" onclick="checkState.atk.clear();checkState.def.clear();fireRangeHexes={};fireVisionHexes={};renderMoveFirePhase();drawMap();">キャンセル</button>`;
    html += `</div>`;
  }


  c.innerHTML = html;
  if (G.gameMode !== 'aivai') c.querySelector('.pg-friendly-controls').append(pgMovementPanel(false));
}

// チェック済みユニットで射撃実行
// 陣地攻撃実行
function executeCheckedFortFire() {
  if (!pgMayInitiateDirectFire()) return;
  const df = directFireState;
  const shooters = pgPickedFriendlyUnits().filter(unit => canDirectFire(unit).can && unit.fpAT > 0);
  if (shooters.length === 0 || !df.defHexId) return;

  const fort = getActiveFortification(df.defHexId);
  if (!fort) return;

  for (const shooter of shooters) {
    const check = pgShotLineCheck(shooter, fort);
    if (!check.can) {
      addLog('fire', `${shooter.name} → ${fort.name}：${check.reason}`);
      return;
    }
  }

  const result = fireFortification(shooters, fort);
  const isDowngrade = result.damage === 'eliminated' && result.newStatus !== 'eliminated';
  const dmgText = result.newStatus === 'eliminated' ? '除去' : isDowngrade ? 'レベルダウン' : result.damage === 'dd' ? 'DD' : result.damage === 'd' ? 'D' : '効果なし';
  const rc = result.newStatus === 'eliminated' ? 'hit-elim' : result.damage === 'dd' ? 'hit-dd' : result.damage === 'd' ? 'hit-d' : 'hit-none';
  const statusLine = isDowngrade ? `${result.prevName} → ${result.newName}` : `${result.prevName}: ${result.prevStatus.toUpperCase()} → ${result.newStatus.toUpperCase()}`;

  showDiceOverlay('陣地攻撃', fort.name, [{
    label: fort.name,
    roll: result.roll,
    detail: `FP${result.totalFP}`,
    resultText: dmgText,
    resultClass: rc,
    detailAfter: statusLine
  }], function() {
    clearSelection();
    drawMap();
  });
}

function executeCheckedFire() {
  if (!pgMayInitiateDirectFire()) return;
  const df = directFireState;
  const shooters = pgPickedFriendlyUnits().filter(unit => canDirectFire(unit).can);
  const targets = testUnits.filter(u => checkState.def.has(u.id || u.name) && u.status !== 'eliminated');

  if (shooters.length === 0 || targets.length === 0) return;

  // サプライズ判定
  const shooterHexId = shooters[0].hexId || toHexId(shooters[0].col, shooters[0].row);
  const surprise = isSurpriseAttack(shooterHexId, shooters[0].side);

  // 視認+射程チェック
  const target = targets[0]; // 1目標ずつ
  for (const s of shooters) {
    const check = canTargetUnit(s, target);
    if (!check.can) {
      addLog('fire', `${s.name}→${target.name}: ${check.reason}`);
      return;
    }
  }

  const fireType = surprise ? 'surprise' : 'fire';

  function finishFire() {
    removeAllDummies(shooterHexId);
    shooters.forEach(u => checkState.atk.delete(u.id || u.name));
    checkState.def.clear();
    const df = directFireState;
    const counterHex = target.hexId;
    const humanDefender = ['pvp', 'online'].includes(G.gameMode) || G.playerSide === target.side;
    if (humanDefender && PHASES[G.phase].id === 'moveFire' &&
      testUnits.some(u => u.side === target.side && u.hexId === counterHex &&
        shooters.some(attacker => canStationaryCounter(u, attacker)))) {
      df.counterHex = counterHex;
      df.counterTargets = shooters;
      df.mode = 'counterAttack';
      df.counterAvailable = true;
    }
    updateFireRange();
    renderMoveFirePhase();
    drawMap();
  }

  showFireFlow(fireType, shooters, target, function(result) {
    // サプライズなら2回目を連続処理（目標再選択あり）
    if (surprise) {
      const defIds = checkState.def;
      const stillAlive = testUnits.filter(u => defIds.has(u.id || u.name) && u.status !== 'eliminated');
      if (stillAlive.length > 0) {
        const nonLeader = stillAlive.filter(u => u.type !== 'leader');
        const nextTarget = [...(nonLeader.length > 0 ? nonLeader : stillAlive)].sort((a, b) => (a.def || 5) - (b.def || 5))[0];
        showFireFlow('surprise', shooters, nextTarget, function(result2) {
          finishFire();
        });
        return;
      }
    }
    finishFire();
  });
}

// 射撃ユニット選択
function onMoveFireUnitClick(uid) {
  if (!pgMayInitiateDirectFire()) return;
  const df = directFireState;
  // 移動中や反撃中でなければ射撃モードに切り替え
  if (df.mode === 'moving' || df.mode === 'counterAttack') return;
  if (df.mode !== 'selectShooter' && df.mode !== 'selectTarget') {
    df.mode = 'selectShooter';
    df.shooters = [];
  }

  const unit = testUnits.find(u => (u.id || u.name) === uid);
  if (!unit) return;

  const check = canDirectFire(unit);
  if (!check.can) return;

  // 既に選択中→解除
  const idx = df.shooters.indexOf(unit);
  if (idx >= 0) {
    df.shooters.splice(idx, 1);
    renderMoveFirePhase();
    drawMap();
    return;
  }

  // 1体目はそのまま追加
  if (df.shooters.length === 0) {
    df.shooters.push(unit);
  } else {
    // 協同射撃チェック (11-5)
    if (canCoopDirectFire(unit, df.shooters[0])) {
      df.shooters.push(unit);
    } else {
      addLog('fire', `${unit.name}は協同射撃不可（同一ヘクスまたは指揮範囲外）`);
    }
  }
  renderMoveFirePhase();
  drawMap();
}

// マップクリック（移動射撃フェイズ）
function onMoveFireMapClick(col, row, cmdKey, hitUnit) {
  if (pgPickAIMoveCorrection(col, row)) return;
  if (pgAIReview?.stage === 'ai' || _pendingReconState) return;
  if (pgSelectOrderHex(col, row)) return;
  if (directFireState.mode !== 'moving') {
    pgOrderHex = toHexId(col, row);
    pgOrderUnit = hitUnit?.hexId === pgOrderHex ? hitUnit : null;
    if (pgAIReview?.stage === 'review') {
      renderMoveFirePhase();
      drawMap();
      return;
    }
  }
  // オーバーラン後の退却先選択中
  if (typeof assaultState !== 'undefined' && assaultState._retreatSide) {
    onRetreatHexClick(col, row);
    return;
  }

  const df = directFireState;
  const hexId = toHexId(col, row);

  if (df.mode === 'counterAttack') {
    if (hexId !== df.counterHex) return;
    const counter = testUnits.find(u => u.hexId === hexId && u.side === df.defenderSide &&
      df.counterTargets.some(target => canStationaryCounter(u, target)));
    if (counter) executeStationaryCounterAttack(counter);
    return;
  }

  // 移動モード中
  if (df.mode === 'moving' && moveState.movingUnit) {
    // 移動可能ヘクスをクリック→移動
    const key = `${col},${row}`;
    if (!pgOrderRun && moveState.validHexes[key]) {
      moveToHex(col, row);
      return;
    }
    // 自分自身のヘクスクリック→移動確定
    if (col === moveState.movingUnit.col && row === moveState.movingUnit.row) {
      confirmMove();
      return;
    }
    return;
  }

  // ヘクスクリック → 味方/敵スタックを選択
  const clickedUnits = testUnits.filter(u => u.hexId === hexId && u.status !== 'eliminated' && u.col >= 0);
  if (clickedUnits.length > 0) {
    const side = clickedUnits[0].side;
    if (side === df.activeSide) {
      if (cmdKey && df.atkHexId && areLinkedByRLeader(df.atkHexId, hexId, df.activeSide)) {
        // Cmd+クリック: R指揮官経由で隣接部隊を候補に追加
        if (!df.atkAdjacentHexes.includes(hexId)) df.atkAdjacentHexes.push(hexId);
      } else if (df.atkHexId !== hexId || df.atkAdjacentHexes?.length !== 1) {
        df.atkHexId = hexId;
        df.atkAdjacentHexes = [hexId];
        checkState.atk.clear();
      }
      updateFireRange();
    } else {
      df.defHexId = hexId;
      // 敵ユニットを自動選択（D/DD含む、陣地・ダミー・指揮官除外）
      checkState.def.clear();
      testUnits.filter(u =>
        u.hexId === hexId && u.side !== df.activeSide && u.status !== 'eliminated' &&
        u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'fortification' &&
        (G.gameMode !== 'online' || !pgOnlineHidden(u, df.activeSide))
      ).forEach(u => checkState.def.add(u.id || u.name));
    }
  }
  renderMoveFirePhase();
  drawMap();
}

function startTargetSelect() {
  if (!pgMayInitiateDirectFire()) return;
  directFireState.mode = 'selectTarget';
  renderMoveFirePhase();
}

function removeShooter(idx) {
  directFireState.shooters.splice(idx, 1);
  renderMoveFirePhase();
}

function cancelDirectFire() {
  directFireState.mode = 'selectShooter';
  directFireState.shooters = [];
  directFireState.targetUnit = null;
  fireArrowData = { from: null, to: null };
  renderMoveFirePhase();
  drawMap();
}

// 先制射撃への反撃 (11-4)
function canStationaryCounter(unit, target) {
  if (!canDirectFire(unit, true).can || !canTargetUnit(unit, target).can) return false;
  return (['T', 'AC'].includes(target.type) ? unit.fpAT : unit.fpSoft) > 0;
}

function executeStationaryCounterAttack(unit) {
  const target = directFireState.counterTargets.find(attacker => canStationaryCounter(unit, attacker));
  if (target) showFireFlow('counter', [unit], target, skipCounter);
}

function skipCounter() {
  directFireState.mode = 'selectShooter';
  directFireState.shooters = [];
  directFireState.counterAvailable = false;
  directFireState.counterHex = null;
  directFireState.counterTargets = [];
  fireArrowData = { from: null, to: null };
  renderMoveFirePhase();
  drawMap();
}

// ストップ射撃実行 (11-3) — スタック単位で1回ずつ処理
function resolveStopFire() {
  const ms = moveState;
  if (!ms.stopFirePending || !ms.stopFireStacks || ms.stopFireStacks.length === 0) {
    finishStopFire();
    return;
  }

  // 次の敵スタックを取得
  const enemyStack = ms.stopFireStacks.shift();
  if (!enemyStack || enemyStack.length === 0) {
    if (ms.stopFireStacks.length > 0) {
      resolveStopFire(); // 次のスタックへ
    } else {
      finishStopFire();
    }
    return;
  }

  const target = ms.movingUnit;
  const movingUnits = ms._stackMoving || [target];
  if (!target || movingUnits.every(u => u.status === 'eliminated')) {
    finishStopFire();
    return;
  }

  // 敵スタックの火力合算（最も防御の低い移動ユニットを狙う）
  const aliveMoving = movingUnits.filter(u => u.status !== 'eliminated');
  const nonLeaderAlive = aliveMoving.filter(u => u.type !== 'leader');
  const targetUnit = [...(nonLeaderAlive.length > 0 ? nonLeaderAlive : aliveMoving)].sort((a, b) => (a.def || 5) - (b.def || 5))[0];
  const aliveEnemies = enemyStack.filter(u => u.status !== 'eliminated');

  const isArmored = targetUnit.type === 'T' || targetUnit.type === 'AC';
  let totalFP = 0;
  const firingUnits = [];
  aliveEnemies.forEach(u => {
    const fp = isArmored ? (u.fpAT || 0) : (u.fpSoft || 0);
    if (fp > 0) { totalFP += fp; firingUnits.push(u); }
  });

  if (totalFP <= 0 || firingUnits.length === 0) {
    if (ms.stopFireStacks.length > 0) resolveStopFire();
    else finishStopFire();
    return;
  }

  ms._stopFired = true;
  if (ms.pgMoveRecord) ms.pgMoveRecord.blocked = true;
  const shooterHexId = firingUnits[0].hexId || toHexId(firingUnits[0].col, firingUnits[0].row);

  // サプライズ・アタック判定
  const surprise = isSurpriseAttack(shooterHexId, firingUnits[0].side);
  const shotCount = surprise ? 2 : 1;

  // サプライズ判定直後にダミー除去（射撃前に剥がす）
  if (surprise) {
    removeAllDummies(shooterHexId);
  }

  // 保存
  ms._lastStopFireStack = enemyStack;
  ms._stopFireShooters = firingUnits;
  ms._stopFireTarget = targetUnit;
  ms._stopFireShotCount = shotCount;
  ms._stopFireCurrentShot = 0;
  ms._stopFireSurprise = surprise;

  const nameStr = firingUnits.length > 2 ? firingUnits[0].name + '他' + (firingUnits.length - 1) : firingUnits.map(u => u.name).join('+');

  if (surprise) {
    // サプライズ: 2回分をまとめて実行しオーバーレイで一括表示
    const result1 = executeDirectFire(firingUnits, targetUnit);
    addLog('stop', `サプライズ1回目: ${nameStr} (fp${totalFP}) → ${targetUnit.name}`);

    const dmgText1 = result1.newStatus === 'eliminated' ? '壊滅' : result1.damage === 'dd' ? 'DD' : result1.damage === 'd' ? 'D' : '効果なし';
    const rc1 = result1.newStatus === 'eliminated' ? 'hit-elim' : result1.damage === 'dd' ? 'hit-dd' : result1.damage === 'd' ? 'hit-d' : 'hit-none';

    const overlayRows = [{
      label: `1回目: ${targetUnit.name}`,
      roll: result1.roll,
      detail: `FP${totalFP} 防御${targetUnit.def||0}`,
      resultText: dmgText1,
      resultClass: rc1,
      detailAfter: `${result1.prevStatus.toUpperCase()} → ${result1.newStatus.toUpperCase()}`
    }];
    if (result1.leaderCheck) {
      overlayRows.push({
        label: result1.leaderCheck.leader.name,
        roll: result1.leaderCheck.roll,
        detail: '指揮官負傷チェック (0で負傷)',
        resultText: result1.leaderCheck.wounded ? '負傷！除去' : '無事',
        resultClass: result1.leaderCheck.wounded ? 'hit-elim' : 'hit-none',
      });
    }

    // 2回目: 生存ユニットから目標再選択
    const stillAlive = (ms._stackMoving || [ms.movingUnit]).filter(u => u.status !== 'eliminated');
    if (stillAlive.length > 0) {
      const stillNonLeader = stillAlive.filter(u => u.type !== 'leader');
      const nextTarget = [...(stillNonLeader.length > 0 ? stillNonLeader : stillAlive)].sort((a, b) => (a.def || 5) - (b.def || 5))[0];
      const result2 = executeDirectFire(firingUnits, nextTarget);
      addLog('stop', `サプライズ2回目: ${nameStr} (fp${totalFP}) → ${nextTarget.name}`);

      const dmgText2 = result2.newStatus === 'eliminated' ? '壊滅' : result2.damage === 'dd' ? 'DD' : result2.damage === 'd' ? 'D' : '効果なし';
      const rc2 = result2.newStatus === 'eliminated' ? 'hit-elim' : result2.damage === 'dd' ? 'hit-dd' : result2.damage === 'd' ? 'hit-d' : 'hit-none';
      overlayRows.push({
        label: `2回目: ${nextTarget.name}`,
        roll: result2.roll,
        detail: `FP${totalFP} 防御${nextTarget.def||0}`,
        resultText: dmgText2,
        resultClass: rc2,
        detailAfter: `${result2.prevStatus.toUpperCase()} → ${result2.newStatus.toUpperCase()}`
      });
      if (result2.leaderCheck) {
        overlayRows.push({
          label: result2.leaderCheck.leader.name,
          roll: result2.leaderCheck.roll,
          detail: '指揮官負傷チェック (0で負傷)',
          resultText: result2.leaderCheck.wounded ? '負傷！除去' : '無事',
          resultClass: result2.leaderCheck.wounded ? 'hit-elim' : 'hit-none',
        });
      }
    }

    showDiceOverlay('サプライズ・アタック', `${nameStr} → ${targetUnit.name}`, overlayRows, function() {
      afterStopFire(shooterHexId, firingUnits);
    });
  } else {
    // 通常ストップ射撃: 1回
    showFireFlow('stop', firingUnits, targetUnit, function(result) {
      if (!result) { proceedStopFire(); return; }
      addLog('stop', `ストップ射撃: ${nameStr} (fp${totalFP}) → ${targetUnit.name}`);
      afterStopFire(shooterHexId, firingUnits);
    });
  }
}

function afterStopFire(shooterHexId, enemyStack) {
  const ms = moveState;
  // 射撃したらダミーを全除去
  removeAllDummies(shooterHexId);
  // 実際に射撃した駒を反撃候補にする。
  ms._lastStopFireStack = enemyStack;
  ms._lastStopFireResult = {};
  ms._waitingCounterAttack = true;
  renderStopFireResult();
  drawMap();
}

// ストップ射撃結果と反撃選択UI
function renderStopFireResult() {
  const ms = moveState;
  const c = document.getElementById('phaseContent');
  const enemyStack = ms._lastStopFireStack;
  const result = ms._lastStopFireResult;
  const target = ms.movingUnit;
  const movingUnits = ms._stackMoving || [target];
  const aliveMoving = movingUnits.filter(u => u.status !== 'eliminated');

  const enemyNames = enemyStack.filter(u => u.status !== 'eliminated').map(u => u.name).join(', ');

  let html = `<div style="padding:8px;background:var(--pg-red-bg);border:1px solid var(--pg-line);border-radius:4px;">`;
  html += `<div style="color:var(--pg-red);font-weight:bold;font-size:1em;">ストップ射撃</div>`;
  html += `<div style="font-size:0.85em;color:var(--pg-ink);margin:4px 0;">敵: ${enemyNames}</div>`;

  if (result && !result.error) {
    const dmgText = result.damageResult === 'eliminated' ? '壊滅' :
                    result.damageResult === 'dd' ? 'DD' :
                    result.damageResult === 'd' ? 'D' : '効果なし';
    html += `<div style="font-size:1.1em;font-weight:bold;color:var(--pg-accent);margin:4px 0;">${dmgText}</div>`;
  }

  if (aliveMoving.length === 0) {
    html += `<div style="color:var(--pg-red);font-size:0.85em;">全滅</div>`;
    html += `<button class="btn-sm" style="width:100%;margin:4px 0;" onclick="finishStopFire()">OK</button>`;
  } else {
    // 射程内に敵がいるかチェック
    const aliveEnemies = enemyStack.filter(u => u.status !== 'eliminated');
    const canCounter = aliveMoving.some(unit => aliveEnemies.some(target => canStationaryCounter(unit, target)));

    if (canCounter) {
      html += `<div style="margin-top:8px;border-top:1px solid var(--pg-line);padding-top:6px;">`;
      html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:0.85em;">反撃しますか？（スタック全体で1回）</div>`;
      html += `<div style="font-size:0.75em;color:var(--pg-muted);">反撃したユニットは先制射撃不可になります</div>`;
      html += `<button class="dice-btn" style="font-size:0.85em;padding:6px 16px;width:100%;margin:4px 0;" onclick="doCounterAttack()">反撃する</button>`;
      html += `<button class="btn-sm" style="width:100%;margin:4px 0;" onclick="skipCounterAttack()">反撃しない</button>`;
    } else {
      html += `<div style="margin-top:8px;border-top:1px solid var(--pg-line);padding-top:6px;">`;
      html += `<button class="btn-sm" style="width:100%;margin:4px 0;" onclick="skipCounterAttack()">OK</button>`;
    }

    if (ms.stopFireStacks && ms.stopFireStacks.length > 0) {
      html += `<div style="font-size:0.75em;color:var(--pg-muted);margin-top:4px;">残り${ms.stopFireStacks.length}スタックがストップ射撃待ち</div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  c.innerHTML = html;
}

// 反撃選択UI表示（人間操作時）
function doCounterAttack() {
  const ms = moveState;
  const enemyStack = ms._lastStopFireStack;
  const movingUnit = ms.movingUnit;
  const movingUnits = ms._stackMoving || [movingUnit];
  const aliveMoving = movingUnits.filter(u => u.status === 'ok');

  if (!enemyStack || aliveMoving.length === 0) {
    skipCounterAttack();
    return;
  }

  const aliveEnemies = enemyStack.filter(u => u.status !== 'eliminated');
  if (aliveEnemies.length === 0) { skipCounterAttack(); return; }

  // AI操作時は自動反撃
  const isHumanSide = G.gameMode === 'pvp' || G.gameMode === 'online' ||
    (G.gameMode === 'pvai' && aliveMoving[0].side === G.playerSide);
  if (!isHumanSide) {
    doCounterAttackAuto();
    return;
  }

  // 人間操作: 目標選択+ユニット選択UIを表示
  ms._counterAttackEnemies = aliveEnemies;
  ms._counterAttackFriendlies = aliveMoving;
  ms._counterSelectedTarget = null;
  ms._counterSelectedUnits = new Set(aliveMoving.map(u => u.id || u.name));
  renderCounterAttackUI();
}

// 反撃選択UI描画（通常射撃UIと同じ形式）
function renderCounterAttackUI() {
  const ms = moveState;
  const c = document.getElementById('phaseContent');
  const enemies = ms._counterAttackEnemies;
  const friendlies = ms._counterAttackFriendlies;
  const selTarget = ms._counterSelectedTarget;
  const selUnits = ms._counterSelectedUnits;

  let html = `<div style="padding:8px;background:var(--pg-shade);border:1px solid var(--pg-accent);border-radius:4px;">`;
  html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:1.1em;margin-bottom:6px;">⚔ 反撃</div>`;

  // === 味方スタック（上） ===
  html += `<div style="background:var(--pg-green-bg);border:1px solid #4a4;border-radius:4px;padding:6px;margin-bottom:6px;">`;
  html += `<div style="color:var(--pg-blue);font-weight:bold;font-size:0.85em;margin-bottom:4px;">味方ユニット</div>`;
  friendlies.forEach(u => {
    const uid = u.id || u.name;
    const checked = selUnits.has(uid) ? 'checked' : '';
    const fpAT = u.fpAT || 0;
    const fpSoft = u.fpSoft || 0;
    const statusStr = u.status === 'd' ? ' [D]' : u.status === 'dd' ? ' [DD]' : '';
    html += `<label style="display:flex;align-items:center;gap:4px;font-size:0.8em;color:var(--pg-ink);cursor:pointer;padding:2px 0;">`;
    html += `<input type="checkbox" value="${uid}" ${checked} onchange="toggleCounterUnit('${uid}')">`;
    html += `<span>${u.name}${statusStr}</span>`;
    html += `<span style="color:var(--pg-muted);margin-left:auto;">AT:${fpAT} Soft:${fpSoft} R:${u.range || 1}</span>`;
    html += `</label>`;
  });
  html += `</div>`;

  // === 敵スタック（下） ===
  html += `<div style="background:var(--pg-red-bg);border:1px solid #a44;border-radius:4px;padding:6px;margin-bottom:6px;">`;
  html += `<div style="color:var(--pg-red);font-weight:bold;font-size:0.85em;margin-bottom:4px;">敵ユニット（目標選択）</div>`;
  enemies.forEach((e, i) => {
    const checked = selTarget === i ? 'checked' : '';
    const statusStr = e.status === 'd' ? ' [D]' : e.status === 'dd' ? ' [DD]' : '';
    html += `<label style="display:flex;align-items:center;gap:4px;font-size:0.8em;color:var(--pg-ink);cursor:pointer;padding:2px 0;">`;
    html += `<input type="radio" name="counterTarget" value="${i}" ${checked} onchange="selectCounterTarget(${i})">`;
    html += `<span>${e.name}${statusStr}</span>`;
    html += `<span style="color:var(--pg-muted);margin-left:auto;">def:${e.def || '?'}</span>`;
    html += `</label>`;
  });
  html += `</div>`;

  // === 命中率・損害確率 ===
  let totalFP = 0;
  let preview = null;
  if (selTarget !== null && selTarget !== undefined) {
    const target = enemies[selTarget];
    const isArmored = target.type === 'T' || target.type === 'AC';
    const shooters = friendlies.filter(u => selUnits.has(u.id || u.name));
    totalFP = 0;
    shooters.forEach(u => { totalFP += isArmored ? (u.fpAT || 0) : (u.fpSoft || 0); });

    if (totalFP > 0 && shooters.length > 0) {
      preview = calcFirePreview(shooters, target);
    }

    html += `<div style="background:var(--pg-blue-bg);border:1px solid #66a;border-radius:4px;padding:6px;margin-bottom:6px;">`;
    html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:0.85em;">合算火力: ${totalFP} (${isArmored ? '対装甲' : '対非装甲'})</div>`;
    if (preview) {
      html += `<div style="display:flex;gap:8px;font-size:0.8em;margin-top:4px;">`;
      html += `<span style="color:var(--pg-muted);">効果なし:${preview.none}%</span>`;
      html += `<span style="color:var(--pg-accent);">D:${preview.d}%</span>`;
      html += `<span style="color:var(--pg-red);">DD:${preview.dd}%</span>`;
      html += `<span style="color:var(--pg-red);">壊滅:${preview.elim}%</span>`;
      html += `</div>`;
    }
    html += `</div>`;
  }

  // === ボタン ===
  html += `<div style="display:flex;gap:6px;">`;
  const canFire = selTarget !== null && selTarget !== undefined && totalFP > 0;
  html += `<button class="dice-btn" style="font-size:0.9em;padding:8px 16px;flex:1;" ${canFire ? '' : 'disabled'} onclick="executeCounterAttack()">射撃実行</button>`;
  html += `<button class="btn-sm" style="flex:1;padding:8px;" onclick="skipCounterAttack()">反撃しない</button>`;
  html += `</div></div>`;
  c.innerHTML = html;
}

function selectCounterTarget(idx) {
  moveState._counterSelectedTarget = idx;
  renderCounterAttackUI();
}

function toggleCounterUnit(uid) {
  const set = moveState._counterSelectedUnits;
  if (set.has(uid)) set.delete(uid); else set.add(uid);
  renderCounterAttackUI();
}

// 人間操作の反撃実行
function executeCounterAttack() {
  const ms = moveState;
  const targetEnemy = ms._counterAttackEnemies[ms._counterSelectedTarget];
  const friendlies = ms._counterAttackFriendlies;
  const selUnits = ms._counterSelectedUnits;

  const firingUnits = friendlies.filter(u => targetEnemy && selUnits.has(u.id || u.name) && canStationaryCounter(u, targetEnemy));
  if (firingUnits.length === 0 || !targetEnemy) { skipCounterAttack(); return; }

  const dist = hexDistance(firingUnits[0].col, firingUnits[0].row, targetEnemy.col, targetEnemy.row);
  const isArmored = targetEnemy.type === 'T' || targetEnemy.type === 'AC';
  let totalFP = 0;
  const validUnits = [];
  firingUnits.forEach(u => {
    const fp = isArmored ? (u.fpAT || 0) : (u.fpSoft || 0);
    if (fp > 0 && dist <= (u.range || 1)) {
      totalFP += fp;
      validUnits.push(u);
    }
  });

  if (totalFP <= 0) {
    addLog('counter', `反撃: 有効な火力なし`);
    skipCounterAttack();
    return;
  }

  showFireFlow('counter', validUnits, targetEnemy, function(result) {
    const nameStr = validUnits.length > 2 ? validUnits[0].name + '他' + (validUnits.length - 1) : validUnits.map(u => u.name).join('+');
    addLog('counter', `反撃: ${nameStr} (fp${totalFP}) → ${targetEnemy.name}`);

    // 反撃したユニットは先制射撃不可
    validUnits.forEach(u => { u.counterAttacked = true; });

    ms._waitingCounterAttack = false;
    proceedStopFire();
    drawMap();
  });
}

// AI自動反撃（AI操作時）
function doCounterAttackAuto() {
  const ms = moveState;
  const enemyStack = ms._lastStopFireStack;
  const movingUnits = ms._stackMoving || [ms.movingUnit];
  const aliveMoving = movingUnits.filter(u => u.status === 'ok');
  const aliveEnemies = enemyStack.filter(u => u.status !== 'eliminated');
  if (!aliveMoving.length || !aliveEnemies.length) { skipCounterAttack(); return; }

  // 最も防御の低い敵を狙う
  const targetEnemy = [...aliveEnemies].sort((a, b) => (a.def || 5) - (b.def || 5))[0];

  const dist = hexDistance(aliveMoving[0].col, aliveMoving[0].row, targetEnemy.col, targetEnemy.row);
  if (dist <= 0 || dist > Math.max(...aliveMoving.map(u => u.range || 1))) {
    skipCounterAttack();
    return;
  }
  if (pgSightStatus(aliveMoving[0].col, aliveMoving[0].row, targetEnemy.col, targetEnemy.row) !== 'visible') {
    skipCounterAttack();
    return;
  }

  const isArmored = targetEnemy.type === 'T' || targetEnemy.type === 'AC';
  let totalFP = 0;
  const firingUnits = [];
  aliveMoving.forEach(u => {
    const fp = isArmored ? (u.fpAT || 0) : (u.fpSoft || 0);
    if (fp > 0 && dist <= (u.range || 1)) {
      totalFP += fp;
      firingUnits.push(u);
    }
  });

  if (totalFP > 0) {
    showFireFlow('counter', firingUnits, targetEnemy, function(result) {
      const nameStr = firingUnits.length > 2 ? firingUnits[0].name + '他' + (firingUnits.length - 1) : firingUnits.map(u => u.name).join('+');
      addLog('counter', `反撃: ${nameStr} (fp${totalFP}) → ${targetEnemy.name}`);
      // 反撃したユニットは先制射撃不可 (11-4-(2))
      firingUnits.forEach(u => { u._counterFiredThisTurn = true; });
      ms._waitingCounterAttack = false;
      proceedStopFire();
    });
    return;
  }

  ms._waitingCounterAttack = false;
  proceedStopFire();
}

// 反撃しない
function skipCounterAttack() {
  moveState._waitingCounterAttack = false;
  proceedStopFire();
}

// 次のストップ射撃スタックへ進む or 終了
function proceedStopFire() {
  const ms = moveState;
  const movingUnits = ms._stackMoving || [ms.movingUnit];
  if (movingUnits.every(u => u.status === 'eliminated')) {
    finishStopFire();
    return;
  }
  if (ms.stopFireStacks && ms.stopFireStacks.length > 0) {
    ms.stopFireEnemies = ms.stopFireStacks.flat();
    renderMoveFirePhase();
    drawMap();
  } else {
    finishStopFire();
  }
}

// ストップ射撃完了
function finishStopFire() {
  const ms = moveState;
  ms.stopFirePending = false;
  ms.stopFireStacks = [];
  ms.stopFireEnemies = [];
  ms._lastStopFireStack = null;
  ms._lastStopFireResult = null;
  ms._waitingCounterAttack = false;

  const movingUnits = ms._stackMoving || [ms.movingUnit];

  // D/DDになったユニットをスタックから自動除外（移動継続のため）
  if (ms._stackMoving) {
    const damaged = ms._stackMoving.filter(u => u.status === 'd' || u.status === 'dd');
    if (damaged.length > 0) {
      ms._stackMoving = ms._stackMoving.filter(u => u.status === 'ok');
      damaged.forEach(u => {
        // moveCompleteは設定しない（残りMPで退避移動可能にする）
        addLog('move', `${u.name} (${u.status.toUpperCase()}) スタックから離脱`);
      });
      // 移動中ユニットを更新
      if (ms._stackMoving.length > 0) {
        ms.movingUnit = ms._stackMoving[0];
      }
    }
  }

  if (movingUnits.every(u => u.status === 'eliminated') ||
      (ms._stackMoving && ms._stackMoving.length === 0)) {
    resetMoveState();
    directFireState.mode = 'selectShooter';
  }

  // ストップ射撃完了後にダミー視認チェック
  if (ms.movingUnit) checkDummyVisibility(ms.movingUnit);
  if (pgOrderRun) {
    if (ms.movingUnit) confirmMove();
    else queueMicrotask(pgContinueOrders);
    return;
  }

  renderMoveFirePhase();
  drawMap();
}

// ストップ射撃スキップ（移動続行）
function skipStopFire() {
  finishStopFire();
}

// オーバーラン実行 (12-5)
function doOverrun(targetHexId) {
  const ms = moveState;
  const unit = ms.movingUnit;
  if (!unit) return;
  const movingUnits = ms._stackMoving || [unit];
  const okUnits = movingUnits.filter(u => u.status === 'ok');
  if (okUnits.length === 0) return;

  // 移動コスト+2チェック (12-5-(3))
  const tPos = fromHexId(targetHexId);
  const mc = getMoveCost(unit, unit.col, unit.row, tPos.col, tPos.row, ms.formation);
  const totalCost = mc.cost + 2;
  if (mc.cost === Infinity || ms.remainingMP < totalCost) {
    addLog('move', 'オーバーラン: 移動力不足');
    return;
  }

  // 戦闘隊形のみ (12-5-(4))
  if (unit.marchMode) {
    addLog('move', 'オーバーラン: 移動隊形では不可');
    return;
  }

  // 確認画面を表示（確率・戦力比を見せてから実行）
  const defenderSide = unit.side === 'german' ? 'allied' : 'german';
  const defenders = testUnits.filter(u =>
    u.hexId === targetHexId && u.side === defenderSide && u.status !== 'eliminated' && u.type !== 'dummy'
  );
  const atkClose = okUnits.reduce((s, u) => s + (u.closeAtk || 0), 0);
  const defClose = defenders.filter(u => u.status === 'ok').reduce((s, u) => s + (u.closeDef || 0), 0);
  const terrain = getHexTerrain(targetHexId);
  const tNames = {p:'平地',w:'林',f:'森林',r:'荒地',t:'町',c:'市街地'};

  // 戦力比計算
  let ratioStr = '';
  if (atkClose > 0 && defClose > 0) {
    if (atkClose >= defClose) {
      const r = Math.floor(atkClose / defClose);
      ratioStr = `${r}:1`;
    } else {
      const r = Math.floor(defClose / atkClose);
      ratioStr = `1:${r}`;
    }
  }

  ms._overrunTarget = targetHexId;
  ms._overrunCost = totalCost;
  ms._overrunPending = true;

  const c = document.getElementById('phaseContent');
  let html = `<div style="padding:10px;background:var(--pg-red-bg);border:2px solid var(--pg-line);border-radius:6px;">`;
  html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:1.1em;">オーバーラン確認</div>`;
  html += `<div style="margin:6px 0;font-size:0.9em;">`;
  html += `<div style="color:var(--pg-accent);">攻撃側: ${okUnits.map(u=>u.name).join(', ')} (近接攻撃力:${atkClose})</div>`;
  html += `<div style="color:var(--pg-blue);">防御側: ${defenders.map(u=>u.name).join(', ')} (近接防御力:${defClose})</div>`;
  html += `<div style="color:var(--pg-muted);">地形: ${tNames[terrain]||terrain} | 戦力比: ${ratioStr} | MP消費: ${totalCost}</div>`;
  html += `</div>`;
  html += `<div style="display:flex;gap:6px;margin-top:8px;">`;
  html += `<button class="dice-btn" style="background:var(--pg-red-bg);padding:6px 16px;" onclick="executeOverrun()">実行</button>`;
  html += `<button class="dice-btn" style="background:var(--pg-shade);padding:6px 16px;" onclick="cancelOverrun()">やめる</button>`;
  html += `</div></div>`;
  c.innerHTML = html;
  drawMap();
}

function executeOverrun() {
  const ms = moveState;
  const unit = ms.movingUnit;
  if (!unit || !ms._overrunPending) return;
  const movingUnits = ms._stackMoving || [unit];
  const okUnits = movingUnits.filter(u => u.status === 'ok');
  const targetHexId = ms._overrunTarget;
  const totalCost = ms._overrunCost;
  const tPos = fromHexId(targetHexId);
  ms._overrunPending = false;
  if (ms.pgMoveRecord) ms.pgMoveRecord.blocked = true;

  // 移動力消費
  ms.remainingMP -= totalCost;
  const names = okUnits.map(u => `${u.name}(${u.status})`).join(', ');
  addLog('move', `${names} [${okUnits.length}台] オーバーラン → ${targetHexId} (MP消費:${totalCost}, 残:${ms.remainingMP})`);

  // 突撃フェイズと同じ処理に委譲
  // assaultStateにオーバーラン情報を保存
  assaultState.pendingResult = null;
  assaultState.atkChecked = new Set(okUnits.map(u => u.id || u.name));
  assaultState.defHexId = targetHexId;
  assaultState._isOverrun = true;
  assaultState._overrunAttackers = okUnits;
  assaultState._overrunOriginHex = toHexId(unit.col, unit.row);

  // オーバーランは突撃済み扱いにしない

  const result = executeAssault(okUnits, targetHexId);

  // ダミーのみ or 降伏 or エラー → そのまま前進
  if (result.dummyOnly || result.surrender || result.error) {
    const aliveAfter = okUnits.filter(u => u.status !== 'eliminated');
    if (aliveAfter.length > 0) {
      const center = getHexCenter(tPos.col, tPos.row);
      aliveAfter.forEach(u => {
        u.col = tPos.col; u.row = tPos.row;
        u.x = center.x; u.y = center.y; u.hexId = targetHexId;
      });
      addLog('move', `${aliveAfter.map(u=>u.name).join(', ')} → ${targetHexId} に前進`);
    }
    assaultState._isOverrun = false;
    finishOverrun();
    return;
  }

  // 突撃フェイズのUIで攻撃側→防御側→前進の流れ
  assaultState.pendingResult = result;
  renderAssaultResult();
  drawMap();
}

function cancelOverrun() {
  const ms = moveState;
  ms._overrunPending = false;
  ms._overrunTarget = null;
  ms._overrunCost = 0;
  renderMoveFirePhase();
  drawMap();
}

function finishOverrun() {
  const ms = moveState;
  const unit = ms.movingUnit;
  ms._overrunResult = null;
  ms._overrunTargetHex = null;

  const movingUnits = ms._stackMoving || [unit];
  if (!unit || movingUnits.every(u => u.status === 'eliminated')) {
    resetMoveState();
    directFireState.mode = 'selectShooter';
    renderMoveFirePhase();
    drawMap();
    return;
  }

  // D/DDをスタックから離脱
  if (ms._stackMoving) {
    const damaged = ms._stackMoving.filter(u => u.status === 'd' || u.status === 'dd');
    if (damaged.length > 0) {
      ms._stackMoving = ms._stackMoving.filter(u => u.status === 'ok');
      damaged.forEach(u => { u.moveComplete = true; });
    }
    if (ms._stackMoving.length > 0) {
      ms.movingUnit = ms._stackMoving[0];
    }
  }

  // 移動可能ヘクスを再計算
  ms.validHexes = {};
  if (ms.remainingMP > 0) {
    const tempUnit = { ...ms.movingUnit, move: ms.remainingMP };
    ms.validHexes = calculateMovableHexes(tempUnit, ms.formation, false, ms._stackMoving || [ms.movingUnit], false);
  }

  renderMoveFirePhase();
  drawMap();
}

// ===== 移動システム (ルール12) =====

// 完了済み移動経路（薄く表示用）
let _completedMoveTrails = [];

// 移動状態管理
let moveState = {
  movingUnit: null,       // 移動中のユニット
  path: [],               // 移動経路 [{col,row,cost}]
  remainingMP: 0,         // 残り移動力
  formation: 'combat',    // 'combat' or 'march' (戦闘隊形/移動隊形)
  cautious: false,        // 警戒移動 (12-6)
  validHexes: {},         // 移動可能ヘクス { "col,row": cost }
};

function resetMoveState() {
  // 移動経路が2ヘクス以上あれば記録
  if (moveState.path && moveState.path.length >= 2) {
    _completedMoveTrails.push(moveState.path);
  }
  moveState.movingUnit = null;
  moveState._stackMoving = null;
  moveState.pgMoveRecord = null;
  moveState.stopFirePending = false;
  moveState._stopFired = false;
  moveState.path = [];
  moveState.remainingMP = 0;
  moveState.formation = 'combat';
  moveState.cautious = false;
  moveState.validHexes = {};
}

// 移動コスト計算 (12-1, 12-2, 12-3)
// unit: 移動するユニット, fromHex: 出発ヘクス, toHex: 到着ヘクス, formation: 隊形
function getMoveCost(unit, fromCol, fromRow, toCol, toRow, formation) {
  const toHex = toHexId(toCol, toRow);
  const terrain = getHexTerrain(toHex);
  const mod = TERRAIN_MODIFIERS[terrain];
  if (!mod) return { cost: Infinity, reason: '不明な地形' };

  // 湖・崖は移動不可 (move=-1で表現)
  if (mod.move === -1) return { cost: Infinity, reason: '移動不可地形' };

  // 道路チェック
  const hasRoad = ROAD_MAP && ROAD_MAP[toHex];

  if (formation === 'march') {
    // === 移動隊形 (12-3) ===
    // 平地・町・市街地＋道路のみ通過可
    if (terrain === 'f') {
      if (hasRoad) return { cost: 0.5, reason: '森林道路（移動隊形）' };
      if (unit.type === 'T' || unit.type === 'AC') {
        return { cost: 6, reason: '森林（移動隊形・機械化）' };
      }
      return { cost: 3, reason: '森林（移動隊形・歩兵）' };
    }
    // 町・市街地は常に道路扱い
    if (terrain === 't' || terrain === 'c') {
      return { cost: 0.5, reason: '町/市街地（道路扱い）' };
    }
    if (hasRoad && (terrain === 'p' || terrain === 'r' || terrain === 'w')) {
      return { cost: 0.5, reason: '道路利用' };
    }
    if (terrain === 'p') {
      return { cost: 1, reason: '平地' };
    }
    // 林・荒地は移動隊形でも通過可（コストは戦闘隊形と同じ）
    if (terrain === 'w' || terrain === 'r') {
      if (unit.type === 'T' || unit.type === 'AC') return { cost: 4, reason: '林/荒地（移動隊形・機械化）' };
      return { cost: 2, reason: '林/荒地（移動隊形）' };
    }
    return { cost: Infinity, reason: '移動隊形: 通過不可地形' };

  } else {
    // === 戦闘隊形 (12-2) ===
    // 戦車は森林進入不可 (12-2-(2))
    if (unit.type === 'T' && terrain === 'f') {
      return { cost: Infinity, reason: '戦車は森林進入不可' };
    }

    // 崖: レインジャーのみ (12-2-(5))
    if (terrain === 'cliff') {
      return { cost: Infinity, reason: '崖は移動不可' };
    }

    // 斜面チェック: ヘクスサイドにslopeがあれば+1
    let slopeCost = 0;
    if (RIVER_MAP) {
      const fromHex = toHexId(fromCol, fromRow);
      RIVER_MAP.forEach(r => {
        if ((r[0] === fromHex && r[1] === toHex) || (r[0] === toHex && r[1] === fromHex)) {
          if (r[2] === 'slope1' || r[2] === 'slope2') slopeCost = Math.max(slopeCost, 1);
          if (r[2] === 'cliff') {
            // レインジャーのみ通過可
            if (unit.unitName !== 'Ranger') slopeCost = Infinity;
          }
        }
      });
    }

    if (slopeCost === Infinity) return { cost: Infinity, reason: '崖は通過不可' };

    // 川を越える場合+1 (地形表の川: +1)
    let riverCost = 0;
    if (RIVER_MAP) {
      const fromHex = toHexId(fromCol, fromRow);
      RIVER_MAP.forEach(r => {
        if ((r[0] === fromHex && r[1] === toHex) || (r[0] === toHex && r[1] === fromHex)) {
          if (r[2] === 'river') riverCost = 1;
        }
      });
    }

    // 非機械化/機械化で移動コストが異なる地形 (林:2/4, 荒地:2/4, 森林:3/6)
    let baseCost = mod.move;
    if (terrain === 'w' || terrain === 'r') {
      // 非機械化=2, 機械化=4
      if (unit.type === 'T' || unit.type === 'AC') baseCost = 4;
      else baseCost = 2;
    }
    if (terrain === 'f') {
      // 非機械化=3, 機械化=6（戦車は進入不可なのでここには来ない）
      if (unit.type === 'T' || unit.type === 'AC') baseCost = 6;
      else baseCost = 3;
    }

    // 戦闘隊形は道路利用不可 (12-2-(3))
    const totalCost = baseCost + slopeCost + riverCost;
    return { cost: totalCost, reason: '' };
  }
}

// 移動可能ヘクスをBFSで計算
function calculateMovableHexes(unit, formation, cautious, movingGroup = moveState._stackMoving || [unit], fromStart = true) {
  let mp = unit.move || 0;
  if (cautious) mp = Math.floor(mp / 2); // 警戒移動 (12-6-(2))

  const combatUnits = movingGroup.filter(member => member.type !== 'leader' && pgOnMap(member));
  const start = { col: unit.col, row: unit.row };
  const visited = {}; // "col,row" → remaining MP
  const queue = [{ col: start.col, row: start.row, mp: mp }];
  visited[`${start.col},${start.row}`] = mp;
  const result = {};

  while (queue.length > 0) {
    const cur = queue.shift();
    const neighbors = getHexNeighbors(cur.col, cur.row);

    for (const n of neighbors) {
      if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) continue;

      if (!pgCanEnter(movingGroup, toHexId(n.col, n.row))) continue;
      const cost = combatUnits.length > 1
        ? Math.max(...combatUnits.map(member => getMoveCost(member, cur.col, cur.row, n.col, n.row,
          member.marchMode ? 'march' : 'combat').cost))
        : getMoveCost(unit, cur.col, cur.row, n.col, n.row, formation).cost;
      if (cost === Infinity) continue;

      let remaining = cur.mp - cost;

      // 最低1ヘクス移動可 (12-1-(5)) — 移動開始時の隣接ヘクスのみ
      if (remaining < 0 && fromStart && cur.col === start.col && cur.row === start.row && cost <= unit.move * 2) {
        remaining = 0;
      }
      if (remaining < 0) continue;

      const key = `${n.col},${n.row}`;
      if (visited[key] !== undefined && visited[key] >= remaining) continue;

      visited[key] = remaining;
      result[key] = { cost: mp - remaining, remaining, prev: `${cur.col},${cur.row}` };
      queue.push({ col: n.col, row: n.row, mp: remaining });
    }
  }

  return result;
}

function pgCanMoveSelection(units) {
  return units.length > 0 && units.every(unit =>
    unit.hexId === units[0].hexId && pgCanReceiveOrder(unit) &&
    unit.status !== 'dd' && !unit.moveComplete && !pgUnitHasFired(unit) && !unit.pgMovementOrder);
}

function startStackMove() {
  if (pgOrderDraft || pgAIReview || pgOrderRun || directFireState.mode === 'moving') return;
  const units = pgPickedFriendlyUnits();
  if (!pgCanMoveSelection(units)) return;
  if (units.length === 1) {
    startMove(units[0]);
    return;
  }
  const group = [...units, ...pgMoveGroup(units[0]).slice(1)];
  pgBeginMove(group);
}

function pgBeginMove(group) {
  const unit = group[0];
  resetMoveState();
  moveState.movingUnit = unit;
  moveState._stackMoving = group;
  moveState.formation = unit.marchMode ? 'march' : 'combat';
  moveState.path = [{col: unit.col, row: unit.row, cost: 0}];
  pgStartManualMoveRecord(moveState);
  pgResetStartingMoveRange();
  directFireState.mode = 'moving';
  renderMoveFirePhase();
  drawMap();
}

function pgResetStartingMoveRange() {
  const ms = moveState;
  const units = ms._stackMoving.filter(unit => unit.type !== 'leader');
  const budget = Math.min(...units.map(unit => unit.move || 0));
  ms.remainingMP = ms.cautious ? Math.floor(budget / 2) : budget;
  ms.validHexes = calculateMovableHexes({...ms.movingUnit, move: budget}, ms.formation, ms.cautious);
}

// 選択解除
// 偵察実行
function doRecon(uid, targetHexId) {
  const unit = testUnits.find(u => (u.id || u.name) === uid);
  if (!unit) return;
  const result = executeRecon(unit, targetHexId);
  const rc = result.success ? 'hit-d' : 'hit-none';
  const resultText = result.success ? `ダミー${result.removed}枚除去` : (result.reason || '失敗');
  showDiceOverlay('偵察', `${unit.name} → ${targetHexId}`, [{
    label: unit.name,
    roll: result.roll != null ? result.roll : '-',
    detail: `対象: ${targetHexId}`,
    resultText: resultText,
    resultClass: rc,
  }], function() {
    renderMoveFirePhase();
    drawMap();
  });
}

function clearSelection() {
  checkState.atk.clear();
  checkState.def.clear();
  directFireState.atkHexId = null;
  directFireState.defHexId = null;
  directFireState.atkAdjacentHexes = null;
  pgOrderHex = null;
  pgOrderUnit = null;
  directFireState.mode = 'selectShooter';
  fireArrowData = null;
  if (typeof fireRangeHexes !== 'undefined') {
    for (const k in fireRangeHexes) delete fireRangeHexes[k];
  }
  if (typeof fireVisionHexes !== 'undefined') {
    for (const k in fireVisionHexes) delete fireVisionHexes[k];
  }
  renderMoveFirePhase();
  drawMap();
}

function startMove(unit, followingOrder = false) {
  if (!pgCanReceiveOrder(unit) || unit.status === 'dd' || unit.moveComplete || pgOrderDraft ||
      (unit.pgMovementOrder && !followingOrder) ||
      (pgAIReview && !followingOrder && !pgAIReview.returned.has(unit))) return;
  if (unit.side !== directFireState.activeSide) return;
  const uid = unit.id || unit.name;
  if (directFireState.firedUnits.has(uid)) {
    addLog('move', `${unit.name}: 先制射撃済みのため移動不可`);
    return;
  }
  if (directFireState.counterFiredUnits.has(uid)) {
    addLog('move', `${unit.name}: 反撃済みのため移動不可`);
    return;
  }
  if (directFireState.movedUnits.has(uid) && unit.moveComplete) {
    addLog('move', `${unit.name}: 移動完了済み`);
    return;
  }

  pgBeginMove(pgMoveGroup(unit));
}

// 経路復元（BFSのprevを辿る）
function getPathTo(validHexes, startCol, startRow, destCol, destRow) {
  const path = [];
  let key = `${destCol},${destRow}`;
  const startKey = `${startCol},${startRow}`;
  while (key && key !== startKey && validHexes[key]) {
    const [c, r] = key.split(',').map(Number);
    path.unshift({ col: c, row: r });
    key = validHexes[key].prev;
  }
  return path;
}

// あるヘクスでストップ射撃が発生するかチェック
function checkStopFireAt(col, row, side) {
  const enemySide = side === 'german' ? 'allied' : 'german';
  const stopFireEnemies = testUnits.filter(u =>
    u.side === enemySide && u.status === 'ok' &&
    u.type !== 'dummy' && u.type !== 'leader' && u.type !== 'A' &&
    !u.marchMode && !u.outOfAmmo && u.col >= 0 && u.range >= 1
  );
  const threats = [];
  for (const enemy of stopFireEnemies) {
    const dist = hexDistance(enemy.col, enemy.row, col, row);
    const effectiveRange = Math.min(enemy.range, G.visionRange || 12);
    if (dist <= effectiveRange && dist > 0) {
      if (pgSightStatus(enemy.col, enemy.row, col, row) === 'visible') {
        threats.push(enemy);
      }
    }
  }
  return threats;
}

// 移動先ヘクスをクリック
function moveToHex(col, row) {
  const ms = moveState;
  if (!ms.movingUnit) return;
  if (ms.stopFirePending) return;

  const key = `${col},${row}`;
  if (!ms.validHexes[key]) {
    addLog('move', '移動不可（移動力不足または地形制限）');
    return;
  }

  const unit = ms.movingUnit;
  const movingUnits = ms._stackMoving || [unit];

  // 経路を復元
  const fullPath = getPathTo(ms.validHexes, unit.col, unit.row, col, row);

  // 経路上の各ヘクスでストップ射撃チェック、最初に発生するヘクスで止める
  let actualDest = { col, row };
  let stopHexIdx = -1;
  for (let i = 0; i < fullPath.length; i++) {
    const h = fullPath[i];
    const threats = checkStopFireAt(h.col, h.row, unit.side);
    if (threats.length > 0) {
      actualDest = h;
      stopHexIdx = i;
      break;
    }
  }

  // 実際の移動先に更新
  const destKey = `${actualDest.col},${actualDest.row}`;
  const center = getHexCenter(actualDest.col, actualDest.row);
  const hexId = toHexId(actualDest.col, actualDest.row);
  // ダミーを移動先に転送（元ヘクスの全味方が移動する場合）
  const origHexId = toHexId(unit.col, unit.row);
  if (origHexId !== hexId && dummyMap[origHexId] && dummyMap[origHexId].side === unit.side) {
    const remainingAtOrig = testUnits.filter(u =>
      (u.hexId || toHexId(u.col, u.row)) === origHexId &&
      u.side === unit.side && u.status !== 'eliminated' &&
      !movingUnits.includes(u)
    );
    if (remainingAtOrig.length === 0) {
      // 全員移動→ダミーも移動
      if (!dummyMap[hexId]) dummyMap[hexId] = { side: unit.side, count: 0 };
      dummyMap[hexId].count += dummyMap[origHexId].count;
      dummyMap[hexId].side = unit.side;
      delete dummyMap[origHexId];
    }
  }
  movingUnits.forEach(u => {
    if (u.status === 'eliminated') return;
    u.col = actualDest.col;
    u.row = actualDest.row;
    u.x = center.x;
    u.y = center.y;
    u.hexId = hexId;
  });

  // 元ヘクスに味方がいなくなったらダミーを除去
  if (origHexId !== hexId && typeof cleanupOrphanDummies === 'function') {
    cleanupOrphanDummies(origHexId, unit.side);
    const record = ms.pgMoveRecord;
    if (record && ms.path.length === 1) {
      for (const dummy of record.dummies) {
        if (dummy.status === 'eliminated' && dummy.hexId === origHexId && dummy.side === unit.side)
          record.orphaned.add(dummy);
      }
    }
  }

  // 移動力を経路に沿って消費
  if (ms.validHexes[destKey]) {
    ms.remainingMP = ms.validHexes[destKey].remaining;
  } else {
    ms.remainingMP = 0;
  }

  // 経路途中のヘクスをパスに追加
  const pathToAdd = stopHexIdx >= 0 ? fullPath.slice(0, stopHexIdx + 1) : fullPath;
  pathToAdd.forEach(h => {
    const hk = `${h.col},${h.row}`;
    ms.path.push({ col: h.col, row: h.row, cost: ms.validHexes[hk] ? ms.validHexes[hk].cost : 0 });
  });

  addLog('move', `${unit.name} → ${hexId} (残MP:${ms.remainingMP})`);

  // 移動可能ヘクスを再計算（ダミー視認チェックはストップ射撃後に行う）
  ms.validHexes = {};
  if (ms.remainingMP > 0) {
    const tempUnit = { ...unit, move: ms.remainingMP };
    ms.validHexes = calculateMovableHexes(tempUnit, ms.formation, false, movingUnits, false);
  }

  // ストップ射撃チェック
  const threateningEnemies = checkStopFireAt(actualDest.col, actualDest.row, unit.side);
  if (threateningEnemies.length > 0) {
    const enemyStacks = {};
    threateningEnemies.forEach(e => {
      const eHex = e.hexId || toHexId(e.col, e.row);
      if (!enemyStacks[eHex]) enemyStacks[eHex] = [];
      enemyStacks[eHex].push(e);
    });
    const stackList = Object.values(enemyStacks);

    ms.stopFirePending = true;
    ms.stopFireStacks = stackList;
    ms.stopFireEnemies = threateningEnemies;
    addLog('move', `ストップ射撃警告: ${stackList.length}スタック(${threateningEnemies.length}ユニット)の射程内に進入`);
  } else {
    // ストップ射撃なし → ダミー視認チェック
    checkDummyVisibility(unit);
  }

  renderMoveFirePhase();
  drawMap();
}

// 移動確定
function confirmMove() {
  const ms = moveState;
  if (!ms.movingUnit || ms.stopFirePending || _pendingReconState) return;

  // スタック移動なら全員を移動完了にする
  const movingUnits = ms._stackMoving || [ms.movingUnit];
  movingUnits.forEach(u => {
    if (u.status === 'eliminated') return;
    const uid = u.id || u.name;
    directFireState.movedUnits.add(uid);
    u.moveComplete = true;
  });

  const names = movingUnits.filter(u => u.status !== 'eliminated').map(u => u.name).join(', ');
  const moveHexId = toHexId(ms.movingUnit.col, ms.movingUnit.row);
  addLog('move', `${names} 移動完了 (${moveHexId})`);

  // 弾切れユニットが補給ヘクスに到達 → 除去して2ターン後に再登場
  if (SCENARIO.ammoRecoveryHexes) {
    const recoveryHexes = SCENARIO.ammoRecoveryHexes;
    movingUnits.forEach(u => {
      if (!u.outOfAmmo || u.status === 'eliminated') return;
      if (u.type !== 'T' && u.type !== 'AC') return;
      const myHexes = recoveryHexes[u.side] || [];
      if (!myHexes.includes(moveHexId)) return;
      // 除去して補給待ちリストに追加
      u.col = -1; u.row = -1; u.x = -999; u.y = -999;
      u.hexId = 'resupply';
      u.status = 'resupply';
      u.outOfAmmo = false;
      u._resupplyTurn = G.turn + 2;
      u._resupplyHex = moveHexId;
      addLog('move', `${u.name}: 補給ヘクスへ後退 → ターン${u._resupplyTurn}に再登場`);
    });
  }

  // 偵察チェック: 隣接にダミーがあり、偵察可能ユニットがいるか
  const reconUnits = movingUnits.filter(u =>
    u.status === 'ok' && (u.type === 'I' || u.type === 'AC') && !u.reconDone && !u.firedThisTurn
  );
  const uPos = fromHexId(moveHexId);
  const neighbors = getHexNeighbors(uPos.col, uPos.row);
  const adjDummyHexes = neighbors.filter(n => {
    if (n.col < 0 || n.col >= MAP_CONFIG.cols || n.row < 0 || n.row >= MAP_CONFIG.rows) return false;
    return getDummyCount(toHexId(n.col, n.row)) > 0;
  });

  if (reconUnits.length > 0 && adjDummyHexes.length > 0) {
    // 偵察可能 → UIを表示して選択させる
    _pendingReconState = { reconUnits, adjDummyHexes, moveHexId };
    renderReconChoice();
    return;
  }

  finishConfirmMove();
}

// 偵察選択UI
let _pendingReconState = null;
function renderReconChoice() {
  const rs = _pendingReconState;
  if (!rs) return;
  const c = document.getElementById('phaseContent');
  const dummyInfo = rs.adjDummyHexes.map(dh => {
    const dhId = toHexId(dh.col, dh.row);
    return `${dhId}(D${getDummyCount(dhId)})`;
  }).join(', ');
  let html = `<div style="padding:8px;background:var(--pg-shade);border:1px solid #668;border-radius:4px;">`;
  html += `<div style="color:var(--pg-blue);font-weight:bold;font-size:1em;">偵察可能</div>`;
  html += `<div style="font-size:0.85em;color:var(--pg-ink);margin:4px 0;">隣接ダミー: ${dummyInfo}</div>`;
  html += `<div style="font-size:0.8em;color:var(--pg-muted);margin:4px 0;">偵察可能ユニット: ${rs.reconUnits.filter(u => !u.reconDone && !u.firedThisTurn).map(u => u.name).join(', ')}</div>`;
  html += `<div style="font-size:0.75em;color:var(--pg-muted);margin:4px 0;">偵察したユニットは射撃不可になります</div>`;
  html += `<button class="dice-btn" style="font-size:0.85em;padding:6px 16px;width:100%;margin:4px 0;" onclick="executeReconAll()">偵察実行</button>`;
  html += `<button class="btn-sm" style="width:100%;margin:4px 0;padding:6px;" onclick="skipRecon()">偵察しない</button>`;
  html += `</div>`;
  c.innerHTML = html;
}

// 偵察一括実行: 全偵察可能ユニットで順に偵察、ダミーが0になったら終了
function executeReconAll() {
  const rs = _pendingReconState;
  if (!rs) { finishConfirmMove(); return; }

  const overlayRows = [];
  const reconUnits = rs.reconUnits.filter(u => u.status === 'ok' && !u.reconDone && !u.firedThisTurn);

  for (const unit of reconUnits) {
    // 隣接のダミーヘクスで残っているものを探す
    let targetHexId = null;
    for (const dh of rs.adjDummyHexes) {
      const dhId = toHexId(dh.col, dh.row);
      if (getDummyCount(dhId) > 0) {
        targetHexId = dhId;
        break;
      }
    }
    if (!targetHexId) break; // ダミーが全部取れた

    const result = executeRecon(unit, targetHexId);
    const rc = result.success ? 'hit-d' : 'hit-none';
    const resultText = result.success ? `ダミー${result.removed}枚除去 (残${result.remaining})` : (result.reason || '失敗');
    overlayRows.push({
      label: `${unit.name} → ${targetHexId}`,
      roll: result.roll != null ? result.roll : '-',
      detail: `D${getDummyCount(targetHexId) + (result.removed || 0)}→D${getDummyCount(targetHexId)}`,
      resultText: resultText,
      resultClass: rc,
    });

    // ダミーが全部取れたら終了
    const anyDummyLeft = rs.adjDummyHexes.some(dh => getDummyCount(toHexId(dh.col, dh.row)) > 0);
    if (!anyDummyLeft) break;
  }

  _pendingReconState = null;

  if (overlayRows.length > 0) {
    showDiceOverlay('偵察', rs.moveHexId, overlayRows, function() {
      finishConfirmMove();
    });
  } else {
    finishConfirmMove();
  }
}

// 偵察スキップ
function skipRecon() {
  _pendingReconState = null;
  finishConfirmMove();
}

// 移動確定の後処理
function finishConfirmMove() {
  if (moveState.path.length > 1) {
    (moveState._stackMoving || [moveState.movingUnit]).forEach(pgRegisterBreakthrough);
  }
  pgRecordConfirmedMove(moveState);
  if (pgOnMap(moveState.movingUnit)) {
    pgOrderHex = moveState.movingUnit.hexId;
    if (pgOrderUnit?.hexId !== pgOrderHex) pgOrderUnit = moveState.movingUnit;
    if (!pgAIReview && !pgOrderRun) {
      directFireState.atkHexId = pgOrderHex;
      directFireState.atkAdjacentHexes = [pgOrderHex];
      checkState.atk.clear();
    }
  }
  pgReconcileOrders();
  resetMoveState();
  directFireState.mode = 'selectShooter';
  fireArrowData = null;
  if (typeof fireRangeHexes !== 'undefined') {
    for (const k in fireRangeHexes) delete fireRangeHexes[k];
  }
  if (typeof fireVisionHexes !== 'undefined') {
    for (const k in fireVisionHexes) delete fireVisionHexes[k];
  }
  renderMoveFirePhase();
  drawMap();
  if (pgOrderRun) queueMicrotask(pgContinueOrders);
}

// 移動キャンセル（元の位置に戻す）
function cancelMove() {
  const ms = moveState;
  if (!ms.movingUnit || pgOrderRun || ms._stopFired) return;

  // 最初の位置に戻す
  if (ms.path.length > 0) {
    const start = ms.path[0];
    const movingUnits = ms._stackMoving || [ms.movingUnit];
    movingUnits.forEach(u => {
      if (u.status === 'eliminated') return;
      const origin = ms.pgMoveRecord?.origins.get(u);
      if (origin) {
        const {wasMoved, status, ...beforeMove} = origin;
        Object.assign(u, beforeMove);
      } else {
        const {col, row} = start;
        Object.assign(u, {col, row, ...getHexCenter(col, row), hexId: toHexId(col, row)});
      }
    });
  }

  ms.path = [];
  resetMoveState();
  directFireState.mode = 'selectShooter';
  renderMoveFirePhase();
  drawMap();
}

// 車両ユニットかどうか判定
function isVehicle(unit) {
  return unit.type === 'T' || unit.type === 'AC';
}

// 隊形変換 (12-4)
function toggleFormation() {
  const ms = moveState;
  if (!ms.movingUnit || ms.path.length !== 1 || ms._stopFired || pgOrderRun) return;
  const units = ms._stackMoving.filter(unit => unit.type !== 'leader');
  const newMode = !units.some(unit => unit.marchMode);
  if (units.some(unit => unit.status !== 'ok' || (newMode && unit.noTransport)) ||
      (newMode && !units.some(isVehicle))) return;

  for (const unit of units) {
    if (newMode && !isVehicle(unit)) {
      unit._origCloseAtk = unit.closeAtk;
      unit._origCloseDef = unit.closeDef;
      unit._origMove = unit.move;
      unit.closeAtk = 0;
      unit.closeDef = 1;
      unit.move = 10;
      unit._towed = true;
    } else if (!newMode && unit._towed) {
      unit.closeAtk = unit._origCloseAtk;
      unit.closeDef = unit._origCloseDef;
      unit.move = unit._origMove;
      unit._towed = false;
    }
    unit.marchMode = newMode;
  }
  ms.formation = newMode ? 'march' : 'combat';
  if (newMode) ms.cautious = false;
  pgResetStartingMoveRange();
  addLog('move', `${units.map(unit => unit.name).join(', ')} → ${newMode ? '移動隊形' : '戦闘隊形'}に変換 (12-4)`);
  renderMoveFirePhase();
  drawMap();
}

// 警戒移動切り替え (12-6)
function toggleCautious() {
  const ms = moveState;
  if (!ms.movingUnit || ms.path.length !== 1 || ms._stopFired || pgOrderRun ||
      ms._stackMoving.some(unit => unit.type !== 'leader' && (unit.marchMode || unit.status !== 'ok'))) return;
  ms.cautious = !ms.cautious;
  pgResetStartingMoveRange();
  addLog('move', `${ms.movingUnit.name}: ${ms.cautious ? '警戒移動' : '警戒解除'} (12-6)`);
  renderMoveFirePhase();
  drawMap();
}

// ===== 突撃 (ルール13) =====

// 突撃戦闘結果表
const ASSAULT_RATIOS = ['1:3-','1:2','1:1','2:1','3:1','4:1','5:1','6:1+'];

const ASSAULT_TABLE = {
  '-3': ['A7','A5','A4','A3','A2','A1','D1','A1/D3'],
  '-2': ['A6','A5','A4/D1','A3/D1','A2/D1','A1/D1','A1/D2','D3'],
  '-1': ['A6','A4','A3','A2','A1','A2/D2','D2','A1/D4'],
   '0': ['A5','A4','A3/D1','A2/D1','A1/D1','D1','A1/D3','D4'],
   '1': ['A5','A4D1','A2','A1','A2/D2','A1/D2','D3','D4'],
   '2': ['A4','A3','A2/D1','A1/D1','D1','D2','A1/D4','D5'],
   '3': ['A4','A3D1','A1','A2/D2','A1/D2','A1/D3','D4','D5'],
   '4': ['A4/D1','A2','A1/D1','D1','D2','D3','D4','DE'],
   '5': ['A3','A2/D1','A2/D2','A1/D2','A1/D3','A1/D4','D5','DE'],
   '6': ['A3/D1','A1','D1','D2','D3','D4','D5','DE'],
   '7': ['A2','A1/D1','A1/D2','A1/D3','A1/D4','D4','DE','DE'],
   '8': ['A2/D1','A2/D2','D2','D3','D4','D5','DE','DE'],
   '9': ['A1','D1','A1/D3','D4','D4','D5','DE','DE'],
  '10': ['A1/D1','A1/D2','D3','D4','D5','DE','DE','DE'],
  '11': ['A2/D2','D2','A1/D4','D4','D5','DE','DE','DE'],
  '12': ['D1','A1/D3','D4','D5','DE','DE','DE','DE'],
};

// 結果文字列をパース: "A2/D3" → { atkLoss:2, defLoss:3, de:false }
function parseAssaultResult(resultStr) {
  if (resultStr === 'DE') return { atkLoss: 0, defLoss: 99, de: true };
  let atkLoss = 0, defLoss = 0;
  const parts = resultStr.split('/');
  parts.forEach(p => {
    const m = p.match(/([AD])(\d+)/);
    if (m) {
      if (m[1] === 'A') atkLoss = parseInt(m[2]);
      if (m[1] === 'D') defLoss = parseInt(m[2]);
    }
  });
  return { atkLoss, defLoss, de: false };
}

// 戦力比をインデックスに変換 (13-2-(1))
// 小数点以下は防御側有利に切り捨て/切り上げ
function getAssaultRatioIndex(atkPower, defPower) {
  if (defPower <= 0) return 7; // 6:1+
  if (atkPower <= 0) return 0; // 1:3-

  const ratio = atkPower / defPower;

  if (ratio < 0.5) return 0;       // 1:3-
  if (ratio < 1.0) return 1;       // 1:2
  if (ratio < 2.0) return 2;       // 1:1
  if (ratio < 3.0) return 3;       // 2:1
  if (ratio < 4.0) return 4;       // 3:1
  if (ratio < 5.0) return 5;       // 4:1
  if (ratio < 6.0) return 6;       // 5:1
  return 7;                          // 6:1+
}

// 突撃可能かチェック
function canAssault(unit) {
  if (unit.status === 'eliminated') return { can: false, reason: '壊滅' };
  if (unit.status === 'd' || unit.status === 'dd') return { can: false, reason: 'D/DD状態では突撃不可 (13-3-(1))' };
  if (unit.marchMode) return { can: false, reason: '移動隊形では突撃不可 (12-3-(6))' };
  if (unit.outOfAmmo) return { can: false, reason: '弾薬不足で突撃不可 (11-8-(2))' };
  if (unit.type === 'leader' || unit.type === 'dummy') return { can: false, reason: '突撃不可' };
  if (unit.assaultedThisTurn) return { can: false, reason: '突撃済み (13-1-(6))' };
  return { can: true, reason: '' };
}

// 隣接する敵スタックを取得
function getAdjacentEnemyStacks(unit) {
  const neighbors = getHexNeighbors(unit.col, unit.row);
  const enemySide = unit.side === 'german' ? 'allied' : 'german';
  const stacks = {};

  neighbors.forEach(n => {
    const hexId = toHexId(n.col, n.row);
    const enemies = testUnits.filter(u =>
      u.hexId === hexId && u.side === enemySide && u.status !== 'eliminated'
    );
    if (enemies.length > 0) {
      stacks[hexId] = enemies;
    }
    // ダミーのみのヘクスも突撃可 (13-1-(8))
    if (enemies.length === 0 && getDummyCount(hexId) > 0) {
      const d = dummyMap[hexId];
      if (d && d.side === enemySide) {
        stacks[hexId] = [];
      }
    }
  });

  return stacks;
}

// 突撃実行 (13-2)
function executeAssault(attackers, targetHexId) {
  const attackerSide = attackers[0].side;
  const defenderSide = attackerSide === 'german' ? 'allied' : 'german';

  // 退却選択で戻せるようにステータスを保存（ダミー除外）
  attackers.forEach(u => { u._prevStatusBeforeAssault = u.status; });
  const allDef = testUnits.filter(u =>
    u.hexId === targetHexId && u.side === defenderSide && u.status !== 'eliminated' && u.type !== 'dummy'
  );
  allDef.forEach(u => { u._prevStatusBeforeAssault = u.status; });

  // 突撃時はダミーを常に除去 (13-1-(8))
  if (getDummyCount(targetHexId) > 0) {
    removeAllDummies(targetHexId);
    addLog('assault', `突撃: ダミー除去`);
  }
  // ダミー以外の防御ユニット
  const defenders = testUnits.filter(u =>
    u.hexId === targetHexId && u.side === defenderSide && u.status !== 'eliminated' && u.type !== 'dummy'
  );
  if (defenders.length === 0) {
    return { dummyOnly: true };
  }

  // 牽引状態の防御側への突撃特殊処理
  defenders.forEach(u => {
    if (u._towed) {
      // まず表に戻す
      u.closeAtk = u._origCloseAtk;
      u.closeDef = u._origCloseDef;
      u.move = u._origMove;
      u.marchMode = false;
      u._towed = false;
      if (u.type === 'I') {
        // 歩兵: 0-4でDD退却
        const towRoll = Math.floor(Math.random() * 10);
        if (towRoll <= 4) {
          u.status = 'dd';
          addLog('assault', `${u.name}: 牽引状態で突撃を受ける D10:${towRoll} → 表に戻りDD`);
        } else {
          u.status = 'eliminated';
          addLog('assault', `${u.name}: 牽引状態で突撃を受ける D10:${towRoll} → 壊滅`);
        }
      } else {
        // 非歩兵（大砲・対戦車砲等）: 自動壊滅
        u.status = 'eliminated';
        addLog('assault', `${u.name}: 牽引状態で突撃を受ける → 自動壊滅`);
      }
    }
  });

  // 移動隊形の防御側への突撃/オーバーラン特殊処理
  defenders.forEach(u => {
    if (u.marchMode && u.status !== 'eliminated') {
      const escapeRoll = Math.floor(Math.random() * 10);
      if (escapeRoll <= 4) {
        u.status = 'dd';
        u.marchMode = false;
        addLog('assault', `${u.name}: 移動隊形で突撃を受ける D10:${escapeRoll} → DD退却（戦闘隊形）`);
      } else {
        u.status = 'eliminated';
        u.marchMode = false;
        addLog('assault', `${u.name}: 移動隊形で突撃を受ける D10:${escapeRoll} → 壊滅`);
      }
    }
  });

  // 牽引処理後に防御側が全滅していたら終了
  const defAfterTow = defenders.filter(u => u.status !== 'eliminated');
  if (defAfterTow.length === 0) {
    addLog('assault', `防御側は牽引状態で全滅`);
    checkLeaderOnStackEliminated(targetHexId, defenderSide);
    return { surrender: true, attackers, defenders };
  }

  // D/DDチェック (13-3)
  // 攻撃側: D/DDユニットは即壊滅 (13-3-(1))
  attackers.forEach(u => {
    if (u.status === 'd' || u.status === 'dd') {
      u.status = 'eliminated';
      addLog('assault', `${u.name}: D/DD状態で突撃参加 → 壊滅 (13-3-(1))`);
    }
  });
  const aliveAttackers = attackers.filter(u => u.status !== 'eliminated');
  if (aliveAttackers.length === 0) return { error: '攻撃側全滅' };

  // 防御側: D状態はモラルチェック (13-3-(2))
  const _moraleChecks = [];
  defenders.forEach(u => {
    if (u.status === 'd') {
      const roll = Math.floor(Math.random() * 10);
      const ml = getEffectiveMorale(u);
      if (roll > 0 && roll < ml) {
        u.status = 'ok';
        addLog('assault', `${u.name}: モラルチェック成功(D10:${roll}<M${ml}) → 回復、戦闘参加`);
        _moraleChecks.push({ name: u.name, roll, morale: ml, success: true });
      } else {
        u.status = 'dd';
        addLog('assault', `${u.name}: モラルチェック失敗(D10:${roll}>=M${ml}) → DD、戦闘不参加`);
        _moraleChecks.push({ name: u.name, roll, morale: ml, success: false });
      }
    }
  });
  // 防御側DD → 戦闘不参加（損害対象外）
  const defDD = defenders.filter(u => u.status === 'dd');
  const activeDef = defenders.filter(u => u.status === 'ok');

  // 戦闘参加ユニットがいなければDDのみ → 壊滅 (13-3-(3))
  if (activeDef.length === 0) {
    defDD.forEach(u => { u.status = 'eliminated'; });
    defenders.forEach(u => { if (u.status !== 'eliminated') u.status = 'eliminated'; });
    addLog('assault', `防御側に戦闘参加ユニットなし → DD全壊滅 (13-3-(3))`);
    checkLeaderOnStackEliminated(targetHexId, defenderSide);
    return { surrender: true, attackers: aliveAttackers, defenders };
  }

  // 戦力計算 (13-2-(1))
  let atkPower = 0;
  aliveAttackers.forEach(u => { atkPower += u.closeAtk || 0; });
  let defPower = 0;
  activeDef.forEach(u => { defPower += u.closeDef || 0; });

  const ratioIdx = getAssaultRatioIndex(atkPower, defPower);

  // ダイスロール + 修正 (13-2-(2))
  const roll = Math.floor(Math.random() * 10);
  const terrainMod = TERRAIN_MODIFIERS[getHexTerrain(targetHexId)]?.assault || 0;

  // 工兵修正 (13-2-(8))
  let engMod = 0;
  aliveAttackers.forEach(u => {
    if (u.unitName === 'Engineer' || u.unitName === 'engineer') engMod += 1;
  });
  activeDef.forEach(u => {
    if (u.unitName === 'Engineer' || u.unitName === 'engineer') engMod -= 1;
  });

  // 指揮官A能力修正: 攻撃側にA能力の指揮官がいれば+1
  let leaderAssaultMod = 0;
  const atkLeader = getActiveLeaderForUnit(aliveAttackers[0], 'A');
  if (atkLeader) {
    leaderAssaultMod += 1;
    addLog('assault', `${atkLeader.name}(A能力): 突撃+1修正`);
  }
  // 防御側にA能力の指揮官がいれば-1
  const defLeader = getActiveLeaderForUnit(activeDef[0], 'A');
  if (defLeader) {
    leaderAssaultMod -= 1;
    addLog('assault', `${defLeader.name}(A能力): 突撃-1修正（防御側）`);
  }

  const modifiedRoll = roll + terrainMod + engMod + leaderAssaultMod;
  const clampedRoll = Math.max(-3, Math.min(12, modifiedRoll));

  // 結果表参照
  const resultRow = ASSAULT_TABLE[String(clampedRoll)];
  const resultStr = resultRow ? resultRow[ratioIdx] : 'A1';
  const result = parseAssaultResult(resultStr);

  addLog('assault', `突撃: 攻${atkPower} vs 防${defPower} = ${ASSAULT_RATIOS[ratioIdx]}, D10:${roll}${terrainMod?'+地形'+terrainMod:''}${engMod?'+工兵'+engMod:''}${leaderAssaultMod?'+指揮官'+leaderAssaultMod:''} = ${modifiedRoll} → ${resultStr}`);

  // 損害は適用しない。結果だけ返す。選択後にapplyAssaultDamageで適用する。
  return {
    resultStr, result, attackers: aliveAttackers, defenders, activeDef, defDD,
    atkPower, defPower, ratioIdx, roll, modifiedRoll, terrainMod, engMod,
    targetHexId, attackerSide, defenderSide
  };
}

// 突撃の攻撃側損害を適用
function applyAssaultAtkDamage(r) {
  if (r.result.de) return; // DE時は防御側だけ
  const atkToElim = r.result.atkLoss;
  if (atkToElim > 0) {
    const alive = r.attackers.filter(u => u.status !== 'eliminated');
    const sorted = [...alive].sort((a, b) => (a.closeAtk || 0) - (b.closeAtk || 0));
    for (let i = 0; i < atkToElim && i < sorted.length; i++) {
      sorted[i].status = 'eliminated';
      addLog('assault', `攻撃側損害: ${sorted[i].name} 壊滅`);
    }
    if (alive.length > 0) {
      const atkHexId = toHexId(alive[0].col, alive[0].row);
      checkLeaderCasualty(atkHexId, r.attackerSide);
    }
  }
}

// 攻撃側が必要損害を出せたか
function canPayAtkLoss(r) {
  const eliminated = r.attackers.filter(u => u.status === 'eliminated').length;
  return eliminated >= r.result.atkLoss;
}

// 突撃の防御側損害を適用
function applyAssaultDefDamage(r) {
  if (r.result.de) {
    // DE: 防御側全滅
    r.activeDef.forEach(u => { u.status = 'eliminated'; });
    if (r.defDD) r.defDD.forEach(u => { if (u.status === 'dd') u.status = 'eliminated'; });
    addLog('assault', `防御側全滅 (DE)`);
    checkLeaderCasualty(r.targetHexId, r.defenderSide);
    checkLeaderOnStackEliminated(r.targetHexId, r.defenderSide);
    return;
  }
  const defToElim = r.result.defLoss;
  if (defToElim > 0) {
    const sorted = [...r.activeDef].filter(u => u.status === 'ok').sort((a, b) => (a.closeDef || 0) - (b.closeDef || 0));
    for (let i = 0; i < defToElim && i < sorted.length; i++) {
      sorted[i].status = 'eliminated';
      addLog('assault', `防御側損害: ${sorted[i].name} 壊滅`);
    }
    checkLeaderCasualty(r.targetHexId, r.defenderSide);
    checkLeaderOnStackEliminated(r.targetHexId, r.defenderSide);
  }
  // 防御側の戦闘参加ユニットが全滅した場合、DDは壊滅
  const remainingActive = r.activeDef.filter(u => u.status === 'ok');
  if (remainingActive.length === 0 && r.defDD && r.defDD.length > 0) {
    r.defDD.forEach(u => {
      if (u.status === 'dd') {
        u.status = 'eliminated';
        addLog('assault', `${u.name}: 防御側消滅によりDD壊滅`);
      }
    });
    checkLeaderOnStackEliminated(targetHexId, defenderSide);
  }

  return { resultStr, result, attackers: aliveAttackers, defenders, activeDef, defDD, atkPower, defPower, ratioIdx, roll, modifiedRoll, moraleChecks: _moraleChecks };
}

// ===== 突撃フェイズUI =====

let assaultState = {
  atkHexId: null,
  atkAdjacentHexes: [],
  defHexId: null,
  atkChecked: new Set(),
  pendingResult: null,
  phase: null, // 'attackerChoice','defenderChoice','atkRetreat','defRetreat','advance'
  _retreatSide: null,
  _retreatUnits: null,
  _validRetreats: null,
};

function renderAssaultPhase() {
  const c = document.getElementById('phaseContent');
  const df = directFireState;
  const activeSide = df.activeSide || G.initiative;
  const defenderSide = activeSide === 'german' ? 'allied' : 'german';
  const tNames = {p:'平地',w:'林',f:'森林',r:'荒地',t:'町',c:'市街地',lake:'湖'};

  let html = '';

  // === 攻撃側スタック ===
  html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:0.85em;margin-bottom:2px;">▼ 突撃ユニット</div>`;
  if (assaultState.atkHexId) {
    const participatingHexes = new Set([assaultState.atkHexId, ...assaultState.atkAdjacentHexes]);
    assaultState.atkChecked.forEach(uid => {
      const u = testUnits.find(u2 => (u2.id || u2.name) === uid);
      if (u) participatingHexes.add(u.hexId);
    });
    [...participatingHexes].forEach(hexId => {
      const atkUnits = testUnits.filter(u =>
        u.hexId === hexId && u.side === activeSide &&
        u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader' && u.col >= 0
      );
      if (atkUnits.length === 0) return;
      const terrain = getHexTerrain(hexId);
      const isAdj = hexId !== assaultState.atkHexId;
      html += `<div data-pg-stack="assault" style="padding:4px;background:var(--pg-card);border:1px solid ${isAdj?'#558':'#555'};border-radius:4px;margin-bottom:4px;">`;
      html += `<div style="color:var(--pg-muted);font-size:0.7em;">${hexId} (${tNames[terrain]||terrain})${isAdj?' <span style="color:var(--pg-blue);">R指揮</span>':''}</div>`;
      html += pgStackCheckButtons(atkUnits, assaultState.atkChecked, unit => canAssault(unit).can);
      atkUnits.forEach(u => {
        const uid = u.id || u.name;
        const checked = assaultState.atkChecked.has(uid);
        const canAss = canAssault(u);
        const statusColor = u.status === 'ok' ? 'var(--pg-green)' : u.status === 'd' ? 'var(--pg-accent)' : 'var(--pg-red)';
        html += `<div style="display:flex;align-items:center;gap:4px;padding:2px 0;font-size:0.8em;${!canAss.can?'opacity:0.4;':''}">`;
        html += `<input type="checkbox" ${checked?'checked':''} ${!canAss.can?'disabled':''} value="${pgCheckboxValue(uid)}" onchange="assaultToggle(this.value,this.checked)" style="margin:0;">`;
        html += `<span style="color:var(--pg-ink);">${u.name}</span>`;
        if (u.status !== 'ok') html += `<span style="color:${statusColor};font-weight:bold;">${u.status.toUpperCase()}</span>`;
        html += `<span style="color:var(--pg-muted);font-size:0.75em;">近攻${u.closeAtk} 近防${u.closeDef}</span>`;
        if (!canAss.can) html += `<span style="color:var(--pg-red);font-size:0.7em;">${canAss.reason}</span>`;
        html += `</div>`;
      });
      html += `</div>`;
    });
  } else {
    html += `<div style="color:var(--pg-muted);font-size:0.8em;padding:4px;">味方ヘクスをクリック</div>`;
  }

  // === 防御側スタック ===
  html += `<div style="color:var(--pg-red);font-weight:bold;font-size:0.85em;margin:8px 0 2px;">▼ 突撃目標</div>`;
  if (assaultState.defHexId) {
    const defUnits = testUnits.filter(u =>
      u.hexId === assaultState.defHexId && u.side === defenderSide &&
      u.status !== 'eliminated' && u.type !== 'dummy' && u.col >= 0
    );
    const terrain = getHexTerrain(assaultState.defHexId);
    const terrainMod = TERRAIN_MODIFIERS[terrain]?.assault || 0;
    html += `<div style="padding:4px;background:var(--pg-red-bg);border:1px solid var(--pg-line);border-radius:4px;margin-bottom:4px;">`;
    html += `<div style="color:var(--pg-muted);font-size:0.7em;">${assaultState.defHexId} (${tNames[terrain]||terrain} 突撃修正:${terrainMod>=0?'+':''}${terrainMod})</div>`;
    defUnits.forEach(u => {
      const statusColor = u.status === 'ok' ? 'var(--pg-green)' : u.status === 'd' ? 'var(--pg-accent)' : 'var(--pg-red)';
      html += `<div style="display:flex;align-items:center;gap:4px;padding:2px 0;font-size:0.8em;">`;
      html += `<span style="color:var(--pg-ink);">${u.name}</span>`;
      if (u.status !== 'ok') html += `<span style="color:${statusColor};font-weight:bold;">${u.status.toUpperCase()}</span>`;
      html += `<span style="color:var(--pg-muted);font-size:0.75em;">近攻${u.closeAtk} 近防${u.closeDef}</span>`;
      html += `</div>`;
    });
    html += `</div>`;
  } else {
    html += `<div style="color:var(--pg-muted);font-size:0.8em;padding:4px;">隣接する敵ヘクスをクリック</div>`;
  }

  // === 突撃プレビュー ===
  if (assaultState.atkHexId && assaultState.defHexId) {
    const attackers = testUnits.filter(u =>
      assaultState.atkChecked.has(u.id || u.name) && u.status !== 'eliminated'
    );
    const defenders = testUnits.filter(u =>
      u.hexId === assaultState.defHexId && u.side === defenderSide &&
      u.status !== 'eliminated' && u.type !== 'dummy'
    );

    if (attackers.length > 0 && defenders.length > 0) {
      let atkPower = 0;
      attackers.forEach(u => { if (canAssault(u).can) atkPower += u.closeAtk || 0; });
      let defPower = 0;
      defenders.filter(u => u.status === 'ok').forEach(u => { defPower += u.closeDef || 0; });

      const ratioIdx = getAssaultRatioIndex(atkPower, defPower);
      const terrain = getHexTerrain(assaultState.defHexId);
      const terrainMod = TERRAIN_MODIFIERS[terrain]?.assault || 0;

      // 工兵修正
      let engMod = 0;
      attackers.forEach(u => { if (u.unitName === 'Engineer') engMod += 1; });
      defenders.forEach(u => { if (u.unitName === 'Engineer') engMod -= 1; });

      html += `<div style="margin:8px 0;padding:8px;background:var(--pg-green-bg);border:1px solid #4a4;border-radius:4px;">`;
      html += `<div style="color:var(--pg-green);font-weight:bold;font-size:0.85em;">突撃プレビュー</div>`;
      html += `<div style="font-size:0.8em;color:var(--pg-muted);">攻撃力:${atkPower} vs 防御力:${defPower} = <b style="color:var(--pg-accent);">${ASSAULT_RATIOS[ratioIdx]}</b></div>`;
      html += `<div style="font-size:0.8em;color:var(--pg-muted);">地形修正:${terrainMod>=0?'+':''}${terrainMod}${engMod?' 工兵:'+engMod:''}</div>`;

      // ダイス0-9の各結果を縦表示
      html += `<div style="margin-top:4px;font-size:0.75em;">`;
      html += `<table style="border-collapse:collapse;width:100%;">`;
      for (let d = 0; d <= 9; d++) {
        const modRoll = Math.max(-3, Math.min(12, d + terrainMod + engMod));
        const row = ASSAULT_TABLE[String(modRoll)];
        const res = row ? row[ratioIdx] : '?';
        const isDE = res === 'DE';
        const hasD = res.includes('D') && !isDE;
        const color = isDE ? '#f22' : hasD ? '#da4' : '#888';
        html += `<tr>`;
        html += `<td style="border:1px solid var(--pg-line);padding:2px 6px;color:var(--pg-muted);width:40px;">D10:${d}</td>`;
        html += `<td style="border:1px solid var(--pg-line);padding:2px 6px;color:${color};">${res}</td>`;
        html += `</tr>`;
      }
      html += `</table></div>`;

      html += `<button class="dice-btn" style="font-size:0.9em;padding:8px 24px;margin-top:8px;width:100%;" onclick="doAssault()">突撃実行</button>`;
      html += `<button class="btn-sm" style="margin-top:4px;width:100%;" onclick="assaultState.atkHexId=null;assaultState.atkAdjacentHexes=[];assaultState.defHexId=null;assaultState.atkChecked.clear();renderAssaultPhase();drawMap();">キャンセル</button>`;
      html += `</div>`;
    }
  }

  c.innerHTML = html;
}

function assaultToggle(uid, checked) {
  if (checked) assaultState.atkChecked.add(uid);
  else assaultState.atkChecked.delete(uid);
  renderAssaultPhase();
}

function onAssaultMapClick(col, row, cmdKey) {
  // 退却先選択中ならそちらを処理
  if (assaultState._retreatSide) {
    onRetreatHexClick(col, row);
    return;
  }

  const hexId = toHexId(col, row);
  const activeSide = directFireState.activeSide || G.initiative;
  const defenderSide = activeSide === 'german' ? 'allied' : 'german';

  const clickedUnits = testUnits.filter(u => u.hexId === hexId && u.status !== 'eliminated' && u.col >= 0);
  if (clickedUnits.length === 0) return;

  const side = clickedUnits[0].side;
  if (side === activeSide) {
    if (cmdKey && assaultState.atkHexId && areLinkedByRLeader(assaultState.atkHexId, hexId, activeSide)) {
      // Cmd+クリック: R指揮官経由で隣接部隊を追加
      if (!assaultState.atkAdjacentHexes.includes(hexId)) assaultState.atkAdjacentHexes.push(hexId);
      testUnits.filter(u =>
        u.hexId === hexId && u.side === activeSide &&
        u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader' && u.col >= 0
      ).forEach(u => {
        if (canAssault(u).can) assaultState.atkChecked.add(u.id || u.name);
      });
    } else {
      // 通常クリック: そのヘクスのみ選択
      assaultState.atkHexId = hexId;
      assaultState.atkAdjacentHexes = [];
      assaultState.atkChecked.clear();
      testUnits.filter(u =>
        u.hexId === hexId && u.side === activeSide &&
        u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader' && u.col >= 0
      ).forEach(u => {
        if (canAssault(u).can) assaultState.atkChecked.add(u.id || u.name);
      });
    }
  } else {
    // 隣接チェック: 攻撃ヘクスに隣接していればOK（Cmd追加分も考慮）
    if (assaultState.atkHexId) {
      // 参加中の全ヘクスを収集
      const participatingHexes = new Set([assaultState.atkHexId]);
      assaultState.atkChecked.forEach(uid => {
        const u = testUnits.find(u2 => (u2.id || u2.name) === uid);
        if (u) participatingHexes.add(u.hexId);
      });
      const defPos = fromHexId(hexId);
      const isAdj = [...participatingHexes].some(pHex => {
        const p = fromHexId(pHex);
        return hexDistance(p.col, p.row, defPos.col, defPos.row) === 1;
      });
      if (!isAdj) {
        addLog('assault', '隣接ヘクスの敵のみ突撃可能');
        return;
      }
    }
    assaultState.defHexId = hexId;
  }
  renderAssaultPhase();
  drawMap();
}

function doAssault() {
  const activeSide = directFireState.activeSide || G.initiative;
  const attackers = testUnits.filter(u => assaultState.atkChecked.has(u.id || u.name) && u.status !== 'eliminated');
  if (attackers.length === 0 || !assaultState.defHexId) return;

  // 突撃済みフラグ設定 (13-1-(6))
  attackers.forEach(u => { u.assaultedThisTurn = true; });

  // 突撃実行
  const result = executeAssault(attackers, assaultState.defHexId);

  // ダミーのみ or 降伏 or エラー → そのまま終了
  if (result.dummyOnly || result.surrender || result.error) {
    if (result.surrender) addLog('assault', '防御側降伏');
    assaultReset();
    return;
  }

  const rc = result.resultStr.includes('DE') ? 'hit-elim' : 'hit-none';
  const assaultRows = [];
  // モラルチェック結果を先に表示
  if (result.moraleChecks && result.moraleChecks.length > 0) {
    result.moraleChecks.forEach(mc => {
      assaultRows.push({
        label: mc.name,
        roll: mc.roll,
        detail: `モラルチェック M${mc.morale}`,
        resultText: mc.success ? '回復' : 'DD',
        resultClass: mc.success ? 'hit-d' : 'hit-dd',
      });
    });
  }
  // 突撃結果
  assaultRows.push({
    label: `${ASSAULT_RATIOS[result.ratioIdx]}`,
    roll: result.roll,
    detail: `攻${result.atkPower} vs 防${result.defPower}`,
    resultText: result.resultStr,
    resultClass: rc,
    detailAfter: `D10:${result.roll} 修正${result.modifiedRoll} → ${result.resultStr}`
  });
  showDiceOverlay('突撃', `${assaultState.atkHexId} → ${assaultState.defHexId}`, assaultRows, function() {
    assaultState.pendingResult = result;
    renderAssaultResult();
    drawMap();
  });
}

function renderAssaultResult() {
  const c = document.getElementById('phaseContent');
  const r = assaultState.pendingResult;
  if (!r) { renderAssaultPhase(); return; }

  let html = `<div style="padding:8px;background:var(--pg-shade);border-radius:4px;">`;
  html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:1.1em;">突撃結果</div>`;
  html += `<div style="font-size:0.9em;color:var(--pg-ink);margin:4px 0;">戦力比: <b>${ASSAULT_RATIOS[r.ratioIdx]}</b> D10:${r.roll} → 修正${r.modifiedRoll}</div>`;
  html += `<div style="font-size:1.2em;font-weight:bold;color:var(--pg-accent);margin:8px 0;">${r.resultStr}</div>`;

  const parsed = r.result;

  // 攻撃側損害表示
  if (parsed.atkLoss > 0) {
    html += `<div style="color:var(--pg-red);font-size:0.85em;">攻撃側損害: ${parsed.atkLoss}ユニット壊滅</div>`;
  }
  // 防御側損害表示
  if (parsed.defLoss > 0) {
    html += `<div style="color:var(--pg-blue);font-size:0.85em;">防御側損害: ${parsed.defLoss}ユニット壊滅</div>`;
  }
  if (parsed.de) {
    html += `<div style="color:var(--pg-red);font-size:0.85em;">防御側全滅 (DE)</div>`;
  }

  html += `<div style="margin-top:12px;border-top:1px solid var(--pg-line);padding-top:8px;">`;
  html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:0.9em;margin-bottom:4px;">攻撃側の選択:</div>`;

  // 選択肢1: 損害を受け入れる（両軍に損害適用）
  html += `<button class="dice-btn" style="font-size:0.85em;padding:6px 16px;width:100%;margin:4px 0;" onclick="assaultAcceptLosses()">損害を受け入れる（攻${parsed.atkLoss} / 防${parsed.defLoss}）</button>`;

  // 選択肢2: 退却（全員DD、損害-1、防御側損害なし）(13-2-(3)(4))
  // 移動力0のユニットは退却不可
  const atkHasImmobile = r.attackers.some(u => u.status !== 'eliminated' && (u.move || 0) === 0);
  if (atkHasImmobile) {
    html += `<div style="color:var(--pg-muted);font-size:0.8em;margin:4px 0;">※ 移動力0のユニットがいるため退却不可</div>`;
  } else {
    const reducedLoss = Math.max(0, parsed.atkLoss - 1);
    html += `<button class="btn-sm" style="width:100%;margin:4px 0;padding:6px;" onclick="assaultRetreatDD()">退却する（全員DD、損害${reducedLoss}、防御側損害なし）</button>`;
  }

  html += `</div></div>`;
  c.innerHTML = html;
}

// ===== 攻撃側の選択 =====

// 攻撃側: 損害を受け入れる
function assaultAcceptLosses() {
  const r = assaultState.pendingResult;
  if (!r) return;
  addLog('assault', '攻撃側: 損害を受け入れ');
  // 攻撃側損害を適用
  applyAssaultAtkDamage(r);
  // 攻撃側が必要損害を出せなかった場合→防御側損害なし
  if (!canPayAtkLoss(r) && !r.result.de) {
    addLog('assault', `攻撃側が必要損害を出せず → 防御側損害なし`);
    assaultState.phase = 'advance';
    renderAdvanceChoice();
    drawMap();
    return;
  }
  // 次は防御側の選択
  assaultState.phase = 'defenderChoice';
  renderDefenderChoice();
  drawMap();
}

// 攻撃側: 退却（全員DD、損害-1、防御側損害なし）(13-2-(3)(4))
function assaultRetreatDD() {
  const r = assaultState.pendingResult;
  if (!r) return;

  // 損害数-1を壊滅させる（最低0）
  const reducedLoss = Math.max(0, r.result.atkLoss - 1);
  if (reducedLoss > 0) {
    const alive = r.attackers.filter(u => u.status !== 'eliminated');
    const sorted = [...alive].sort((a, b) => (a.closeAtk || 0) - (b.closeAtk || 0));
    for (let i = 0; i < reducedLoss && i < sorted.length; i++) {
      sorted[i].status = 'eliminated';
      addLog('assault', `退却損害: ${sorted[i].name} 壊滅`);
    }
  }

  // 残り全員をDD状態に
  r.attackers.forEach(u => {
    if (u.status !== 'eliminated') u.status = 'dd';
  });

  // 防御側は損害なし
  addLog('assault', `攻撃側: 退却（全員DD、損害${reducedLoss}、防御側損害なし）`);

  // 攻撃側退却先選択
  assaultState.phase = 'atkRetreat';
  renderRetreatChoice('atk');
  drawMap();
}

// ===== 防御側の選択 =====

function renderDefenderChoice() {
  const c = document.getElementById('phaseContent');
  const r = assaultState.pendingResult;
  if (!r) { assaultReset(); return; }

  const parsed = r.result;
  const defRemaining = r.defenders.filter(u => u.status !== 'eliminated');

  // DE結果または防御側損害0なら選択不要→即適用
  if (parsed.de || parsed.defLoss === 0 || defRemaining.length === 0) {
    if (parsed.de) {
      applyAssaultDefDamage(r);
    }
    addLog('assault', parsed.de ? '防御側全滅 (DE)' : '防御側損害なし');
    assaultState.phase = 'advance';
    renderAdvanceChoice();
    return;
  }

  // AI側なら自動判定: 退却可能なら退却、不可なら損害受け入れ
  const defSide = defRemaining[0].side;
  const isDefHuman = G.gameMode === 'pvp' || G.gameMode === 'online' || (G.gameMode === 'pvai' && defSide === G.playerSide);
  if (!isDefHuman) {
    const defHasImmobile = defRemaining.some(u => (u.move || 0) === 0);
    if (defHasImmobile) {
      addLog('assault', 'AI防御側: 損害を受け入れ');
      defenderAcceptLosses();
    } else {
      addLog('assault', 'AI防御側: 退却を選択');
      defenderRetreat();
    }
    return;
  }

  let html = `<div style="padding:8px;background:var(--pg-shade);border-radius:4px;">`;
  html += `<div style="color:var(--pg-red);font-weight:bold;font-size:1.1em;">防御側の選択</div>`;
  html += `<div style="font-size:0.9em;color:var(--pg-ink);margin:4px 0;">結果: ${r.resultStr} — 防御側損害: ${parsed.defLoss}ユニット</div>`;

  html += `<div style="margin-top:8px;">`;
  // 選択肢1: 損害を受け入れる
  html += `<button class="dice-btn" style="font-size:0.85em;padding:6px 16px;width:100%;margin:4px 0;" onclick="defenderAcceptLosses()">損害を受け入れる（${parsed.defLoss}ユニット壊滅）</button>`;

  // 選択肢2: 退却（全員DD、損害-1）
  // 移動力0のユニットは退却不可
  const defHasImmobile = r.defenders.some(u => u.status !== 'eliminated' && (u.move || 0) === 0);
  if (defHasImmobile) {
    html += `<div style="color:var(--pg-muted);font-size:0.8em;margin:4px 0;">※ 移動力0のユニットがいるため退却不可</div>`;
  } else {
    const reducedLoss = Math.max(0, parsed.defLoss - 1);
    html += `<button class="btn-sm" style="width:100%;margin:4px 0;padding:6px;" onclick="defenderRetreat()">退却する（全員DD、損害${reducedLoss}）</button>`;
  }

  html += `</div></div>`;
  c.innerHTML = html;
}

// 防御側: 損害を受け入れる
function defenderAcceptLosses() {
  const r = assaultState.pendingResult;
  if (!r) return;
  addLog('assault', '防御側: 損害を受け入れ');
  // 防御側損害を適用
  applyAssaultDefDamage(r);
  assaultState.phase = 'advance';
  renderAdvanceChoice();
  drawMap();
}

// 防御側: 退却（全員DD、損害-1）
function defenderRetreat() {
  const r = assaultState.pendingResult;
  if (!r) return;

  // 損害数-1を壊滅させる（最低0）
  const reducedLoss = Math.max(0, r.result.defLoss - 1);
  if (reducedLoss > 0) {
    const alive = r.defenders.filter(u => u.status !== 'eliminated');
    const sorted = [...alive].sort((a, b) => (a.closeDef || 0) - (b.closeDef || 0));
    for (let i = 0; i < reducedLoss && i < sorted.length; i++) {
      sorted[i].status = 'eliminated';
      addLog('assault', `退却損害: ${sorted[i].name} 壊滅`);
    }
  }

  // 残り全員DD
  r.defenders.forEach(u => {
    if (u.status !== 'eliminated') u.status = 'dd';
  });

  addLog('assault', `防御側: 退却（全員DD、損害${reducedLoss}）`);

  // 防御側退却先選択
  assaultState.phase = 'defRetreat';
  renderRetreatChoice('def');
  drawMap();
}

// ===== 退却先選択 =====

function renderRetreatChoice(side) {
  const c = document.getElementById('phaseContent');
  const r = assaultState.pendingResult;
  const isAtk = side === 'atk';
  const units = isAtk ? r.attackers : r.defenders;
  const aliveUnits = units.filter(u => u.status !== 'eliminated');
  if (aliveUnits.length === 0) {
    if (isAtk) { assaultReset(); }
    else { assaultState.phase = 'advance'; renderAdvanceChoice(); }
    return;
  }

  const sourceHexId = isAtk ? assaultState.atkHexId : assaultState.defHexId;
  const sourcePos = fromHexId(sourceHexId);
  const neighbors = getHexNeighbors(sourcePos.col, sourcePos.row);

  // 退却先: 敵のいない隣接ヘクス (13-2-(5))
  const enemySide = isAtk ? (aliveUnits[0].side === 'german' ? 'allied' : 'german') : (aliveUnits[0].side === 'german' ? 'allied' : 'german');
  const validRetreats = neighbors.filter(n => {
    const hexId = toHexId(n.col, n.row);
    const enemiesHere = testUnits.filter(u => u.hexId === hexId && u.side !== aliveUnits[0].side && u.status !== 'eliminated' && u.type !== 'dummy');
    return enemiesHere.length === 0;
  });

  let html = `<div style="padding:8px;background:var(--pg-shade);border-radius:4px;">`;
  html += `<div style="color:var(--pg-accent);font-weight:bold;font-size:1em;">${isAtk ? '攻撃側' : '防御側'}退却先を選択</div>`;

  if (validRetreats.length === 0) {
    html += `<div style="color:var(--pg-red);font-size:0.85em;">退却先なし → 全滅</div>`;
    aliveUnits.forEach(u => { u.status = 'eliminated'; });
    addLog('assault', `${isAtk ? '攻撃側' : '防御側'}: 退却先なし → 全滅`);
  } else {
    html += `<div style="font-size:0.9em;color:var(--pg-accent);margin:4px 0;">地図上の緑ハイライトヘクスをクリックしてください</div>`;
  }

  html += `</div>`;
  c.innerHTML = html;

  if (validRetreats.length > 0) {
    // AI側なら自動で退却先を選択（攻撃側から最も遠いヘクス）
    const retreatSide = aliveUnits[0].side;
    const isRetreatHuman = G.gameMode === 'pvp' || G.gameMode === 'online' || (G.gameMode === 'pvai' && retreatSide === G.playerSide);
    if (!isRetreatHuman) {
      const atkPos = fromHexId(assaultState.atkHexId);
      const best = validRetreats.reduce((a, b) =>
        hexDistance(b.col, b.row, atkPos.col, atkPos.row) > hexDistance(a.col, a.row, atkPos.col, atkPos.row) ? b : a
      );
      const center = getHexCenter(best.col, best.row);
      const retreatHexId = toHexId(best.col, best.row);
      aliveUnits.forEach(u => {
        u.col = best.col;
        u.row = best.row;
        u.x = center.x;
        u.y = center.y;
        u.hexId = retreatHexId;
      });
      addLog('assault', `${isAtk ? '攻撃側' : '防御側'}: ${retreatHexId}へ退却`);
      if (isAtk) { assaultReset(); }
      else { assaultState.phase = 'advance'; renderAdvanceChoice(); }
      drawMap();
      return;
    }
    assaultState._retreatSide = side;
    assaultState._retreatUnits = aliveUnits;
    assaultState._validRetreats = validRetreats.map(n => `${n.col},${n.row}`);
  } else {
    // 退却先なしで全滅 → 次のステップへ
    setTimeout(() => {
      if (isAtk) { assaultReset(); }
      else { assaultState.phase = 'advance'; renderAdvanceChoice(); }
      drawMap();
    }, 500);
  }
}

// 退却先ヘクスクリック処理
function onRetreatHexClick(col, row) {
  if (!assaultState._retreatSide) return;
  const key = `${col},${row}`;
  if (!assaultState._validRetreats || !assaultState._validRetreats.includes(key)) {
    addLog('assault', '退却先として無効なヘクス');
    return;
  }

  const hexId = toHexId(col, row);
  const center = getHexCenter(col, row);

  // ユニットを退却先に移動
  assaultState._retreatUnits.forEach(u => {
    u.col = col;
    u.row = row;
    u.x = center.x;
    u.y = center.y;
    u.hexId = hexId;
  });

  const isAtk = assaultState._retreatSide === 'atk';
  addLog('assault', `${isAtk ? '攻撃側' : '防御側'}: ${hexId}へ退却`);

  // 攻撃側退却の場合はさらに1ヘクス後退 (13-2-(6))
  // （突撃をかけたヘクスからさらに1ヘクス退却）
  // ここでは1回の退却で簡略化

  assaultState._retreatSide = null;
  assaultState._retreatUnits = null;
  assaultState._validRetreats = null;

  if (isAtk) {
    assaultReset();
  } else {
    assaultState.phase = 'advance';
    renderAdvanceChoice();
  }
  drawMap();
}

// ===== 戦闘後前進 =====

function renderAdvanceChoice() {
  const c = document.getElementById('phaseContent');
  const r = assaultState.pendingResult;
  const defHexId = assaultState.defHexId;
  const activeSide = directFireState.activeSide || G.initiative;

  // 防御側がまだいるか確認（陣地・ダミー除外）
  const defRemaining = testUnits.filter(u =>
    u.hexId === defHexId && u.side !== activeSide && u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'fortification' && u.type !== 'ip'
  );

  if (defRemaining.length > 0) {
    // 防御側が残っている → 攻撃側はもとのヘクスに戻る (13-2-(9))
    addLog('assault', '防御側残存 → 攻撃側はもとのヘクスに戻る');
    showFireOverlay('突撃結果', `${ASSAULT_RATIOS[r.ratioIdx]} → ${r.resultStr}`, []);
    assaultReset();
    return;
  }

  // 防御側ユニットがいなくなった → 陣地を破壊
  const fort = getActiveFortification(defHexId);
  if (fort) {
    fort.status = 'eliminated';
    addLog('assault', `${fort.name} → 防御側排除により陣地破壊`);
  }

  // 防御側ヘクスが空 → 前進選択
  // オーバーランは移動の一種なので必ず前進
  if (assaultState._isOverrun) {
    assaultAdvance();
    return;
  }
  const atkSide = (directFireState.activeSide || G.initiative);
  const isAtkHuman = G.gameMode === 'pvp' || G.gameMode === 'online' || (G.gameMode === 'pvai' && atkSide === G.playerSide);
  if (isAtkHuman) {
    // 人間: メッセージのみ表示、前進は手動で行う
    addLog('assault', `防御側排除 — ${defHexId}へ戦闘後前進可能`);
    showFireOverlay('突撃結果', `${ASSAULT_RATIOS[r.ratioIdx]} → ${r.resultStr} — 前進可能`, []);
    assaultReset();
    return;
  }
  // AI: 自動前進 (13-2-(7))
  assaultAdvance();
}

// 前進する
function assaultAdvance() {
  const r = assaultState.pendingResult;
  const defHexId = assaultState.defHexId;
  const defPos = fromHexId(defHexId);
  const center = getHexCenter(defPos.col, defPos.row);

  // 攻撃側の生存ユニット + 同ヘクスの指揮官も前進
  const aliveAtk = r.attackers.filter(u => u.status !== 'eliminated' && !u.pgMovementOrder);
  const atkHexId = assaultState.atkHexId;
  const leaders = atkHexId ? testUnits.filter(u =>
    u.hexId === atkHexId && u.type === 'leader' && u.status !== 'eliminated' &&
    u.side === aliveAtk[0]?.side
  ) : [];
  const advanceUnits = [...aliveAtk, ...leaders];
  let moved = 0;
  advanceUnits.forEach(u => {
    if (moved >= 4) return; // スタック制限
    u.col = defPos.col;
    u.row = defPos.row;
    u.x = center.x;
    u.y = center.y;
    u.hexId = defHexId;
    moved++;
  });

  addLog('assault', `攻撃側${moved}ユニットが${defHexId}へ前進`);
  showFireOverlay('突撃結果', `${ASSAULT_RATIOS[r.ratioIdx]} → ${r.resultStr} → 前進`, []);
  assaultReset();
}

function assaultSkipAdvance() {
  const r = assaultState.pendingResult;
  addLog('assault', '攻撃側: 前進せず');
  showFireOverlay('突撃結果', `${ASSAULT_RATIOS[r.ratioIdx]} → ${r.resultStr}`, []);
  assaultReset();
}

function assaultReset() {
  const wasOverrun = assaultState._isOverrun;
  const overrunAttackers = assaultState._overrunAttackers;
  const overrunTargetHex = assaultState.defHexId;

  assaultState.atkHexId = null;
  assaultState.atkAdjacentHexes = [];
  assaultState.defHexId = null;
  assaultState.atkChecked.clear();
  assaultState.pendingResult = null;
  assaultState.phase = null;
  assaultState._retreatSide = null;
  assaultState._retreatUnits = null;
  assaultState._validRetreats = null;
  assaultState._isOverrun = false;
  assaultState._overrunAttackers = null;
  assaultState._overrunOriginHex = null;

  if (wasOverrun) {
    // オーバーランの場合: 前進処理してから移動フェイズに戻る
    if (overrunAttackers && overrunTargetHex) {
      const defRemaining = testUnits.filter(u =>
        u.hexId === overrunTargetHex && u.side !== overrunAttackers[0].side && u.status !== 'eliminated' &&
        u.type !== 'dummy' && u.type !== 'fortification' && u.type !== 'ip'
      );
      const aliveAtk = overrunAttackers.filter(u => u.status !== 'eliminated');
      if (defRemaining.length === 0) {
        // 防御側排除 → 陣地破壊
        const fort = getActiveFortification(overrunTargetHex);
        if (fort) {
          fort.status = 'eliminated';
          addLog('assault', `${fort.name} → 防御側排除により陣地破壊`);
        }
      }
      if (defRemaining.length === 0 && aliveAtk.length > 0) {
        const tPos = fromHexId(overrunTargetHex);
        const center = getHexCenter(tPos.col, tPos.row);
        aliveAtk.forEach(u => {
          u.col = tPos.col; u.row = tPos.row;
          u.x = center.x; u.y = center.y; u.hexId = overrunTargetHex;
        });
        addLog('move', `${aliveAtk.map(u=>u.name).join(', ')} → ${overrunTargetHex} に前進`);
      }
    }
    finishOverrun();
    return;
  }

  renderAssaultPhase();
  drawMap();
}
