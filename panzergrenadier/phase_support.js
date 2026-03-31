// ===== 支援射撃フェイズ (phase_support.js) =====
// 戦闘爆撃機発見表（unitdata.jsが未ロードの場合のフォールバック）
if (typeof FIGHTER_BOMBER_DISCOVERY === 'undefined') {
  var FIGHTER_BOMBER_DISCOVERY = {
    p: [1,8], r: [1,6], w: [1,3], t: [1,3], f: [1,1], c: [1,1],
  };
}
// 依存: G, SCENARIO, testUnits, units, dummyMap, toHexId, fromHexId, hexDistance,
//   getHexTerrain, getTerrainFireMod, getFireCombatResult, resolveDamage, applyDamageToUnit,
//   getDummyCount, isDummyProtected, checkLeaderCasualty, checkLeaderOnStackEliminated,
//   calculateVisionRange, addLog, drawMap, FACILITY_MAP

// ===== 支援射撃フェイズ (ルール9) UI =====
// ===== 盤外支援砲兵定義 (シナリオから読み込む) =====
// fp: 固定火力 or null(ランダム)
// fpRandom: ランダムの場合 { dieCount:1, table:[0,4,6,8,10,12,14,16,18,20] } ← ダイス目→火力
// uses: 使用可能回数, usedCount: 使用済み回数
// side: 所属陣営
// combinable: 他の盤外砲兵と合算可能か (9-2-(5))
// 盤外砲兵（シナリオから読み込み）
const SCENARIO_OFF_BOARD = SCENARIO.offBoardArtillery.map((ob, i) => ({
  id: 'ob_' + i,
  name: ob.name || `盤外砲兵${i+1}`,
  side: ob.side,
  fp: ob.fp || null,
  fpRandom: ob.fpRandom || null,
  uses: ob.uses || 1,
  usedCount: 0,
  combinable: ob.combinable || false,
}));

// ゲーム開始時にランダム火力を決定
function initOffBoardArtillery() {
  SCENARIO_OFF_BOARD.forEach(ob => {
    ob.usedCount = 0;
    if (ob.fpRandom && !ob.fp) {
      const roll = Math.floor(Math.random() * 10);
      ob.fp = ob.fpRandom.table[roll];
      addLog('init', `${ob.name}: 火力決定ダイス${roll} → FP${ob.fp}`);
    }
  });
}

let supportState = {
  selectedArtillery: [],  // 選択中の砲兵ユニット
  targetHexId: null,      // 攻撃目標ヘクス
  targetMode: false,      // マップクリックで目標選択中
  fireResults: [],        // 射撃結果ログ
  selectedOffBoard: [],   // 選択中の盤外砲兵ID
};

function resetSupportState() {
  supportState = {
    selectedArtillery: [], targetHexId: null, targetMode: false,
    fireResults: [], selectedOffBoard: [],
  };
  // 盤外砲兵の使用回数はターンをまたいでも保持（シナリオ通算）
}

function renderSupportPhase(activeSide) {
  const c = document.getElementById('phaseContent');
  const sideNames = { german: 'ドイツ軍', allied: '連合軍' };
  const side = activeSide || G.initiative;

  let html = '<div class="phase-info">' + sideNames[side] + ' の間接射撃フェイズです。</div>';

  // 該当陣営の砲兵を表示
  [side].forEach(side => {
    const artillery = testUnits.filter(u => u.type === 'A' && u.side === side && u.status !== 'eliminated');
    html += `<div class="recovery-section"><h3>${sideNames[side]} 砲兵</h3>`;

    if (artillery.length === 0) {
      html += '<div style="color:#888;font-size:0.8em;padding:4px;">砲兵ユニットなし</div>';
    } else {
      artillery.forEach(u => {
        const selected = supportState.selectedArtillery.includes(u.name);
        const fired = u.firedThisTurn;
        const hexId = toHexId(u.col, u.row);
        const bgColor = selected ? '#445522' : fired ? '#333' : '#222';
        html += `<div class="recovery-unit" style="background:${bgColor};cursor:${fired?'default':'pointer'};" onclick="${fired?'':`toggleArtillerySelect('${u.name}')`}">`;
        html += `<span class="u-name">${u.name}</span>`;
        html += `<span style="color:#6af;font-size:0.75em;font-weight:bold;">${hexId}</span>`;
        html += `<span style="color:#aaa;font-size:0.8em;">FP${u.spSoft || u.fpSoft}/${u.spAT || u.fpAT} 射程${u.range}</span>`;
        html += `<span class="u-status ${u.status}">${u.status === 'ok' ? '正常' : u.status.toUpperCase()}</span>`;
        if (fired) html += '<span style="color:#f66;font-size:0.8em;">射撃済</span>';
        if (selected) html += '<span style="color:#8f8;font-size:0.8em;">✓選択</span>';
        html += '</div>';
      });
    }

    // 盤外支援砲兵
    const offBoards = SCENARIO_OFF_BOARD.filter(ob => ob.side === side);
    if (offBoards.length > 0) {
      html += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid #444;">';
      html += '<div style="color:#aaa;font-size:0.75em;">盤外支援砲兵</div>';
      offBoards.forEach(ob => {
        const exhausted = ob.usedCount >= ob.uses;
        const selected = supportState.selectedOffBoard.includes(ob.id);
        const bgColor = selected ? '#445522' : exhausted ? '#333' : '#222';
        html += `<div class="recovery-unit" style="background:${bgColor};cursor:${exhausted?'default':'pointer'};" onclick="${exhausted?'':`toggleOffBoardSelect('${ob.id}')`}">`;
        html += `<span class="u-name">${ob.name}</span>`;
        html += `<span style="color:#aaa;font-size:0.8em;">FP${ob.fp} (${ob.usedCount}/${ob.uses}回)</span>`;
        if (exhausted) {
          html += '<span style="color:#f66;font-size:0.8em;">使い切り</span>';
        } else if (selected) {
          html += '<span style="color:#8f8;font-size:0.8em;">✓選択</span>';
        }
        if (ob.combinable && !exhausted) {
          html += '<span style="color:#88f;font-size:0.7em;">合算可</span>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
  });

  // 目標選択UI
  if (supportState.selectedArtillery.length > 0 || supportState.targetMode) {
    html += '<div style="margin:8px 0;padding:8px;background:#333;border-radius:4px;">';
    if (supportState.targetHexId) {
      const terrain = getHexTerrain(supportState.targetHexId);
      const mod = getTerrainFireMod(supportState.targetHexId);
      const tNames = {p:'平地',w:'林',f:'森林',r:'荒地',t:'町',c:'市街地',lake:'湖'};
      html += `<div style="color:#c8a020;font-weight:bold;">目標: ${supportState.targetHexId} (${tNames[terrain]||terrain}, 修正${mod>=0?'+':''}${mod})</div>`;
      // 目標ヘクスの敵ユニット
      const enemies = testUnits.filter(u => {
        const hid = toHexId(u.col, u.row);
        return hid === supportState.targetHexId && u.side !== (supportState._firingSide || G.initiative) && u.status !== 'eliminated' &&
          u.type !== 'leader' && u.type !== 'dummy';
      });
      if (enemies.length > 0) {
        html += '<div style="font-size:0.8em;color:#aaa;margin:4px 0;">';
        enemies.forEach(e => {
          html += `${e.name}(${e.type},防御${e.def||0}) `;
        });
        html += '</div>';
      } else {
        html += '<div style="font-size:0.8em;color:#f66;">敵ユニットなし</div>';
      }
      html += `<button class="dice-btn" style="font-size:0.9em;padding:6px 16px;margin-top:4px;" onclick="executeSupportFire()">砲撃実行</button>`;
      html += ` <button class="top-btn" onclick="cancelSupportTarget()">キャンセル</button>`;
    } else {
      html += '<div style="color:#ff0;font-size:0.9em;">🎯 マップ上のヘクスをクリックして目標を選択</div>';
      html += `<button class="top-btn" onclick="cancelSupportTarget()">キャンセル</button>`;
    }
    html += '</div>';
  }

  // 射撃結果ログ
  if (supportState.fireResults.length > 0) {
    html += '<div style="margin:8px 0;padding:6px;background:#1a2a1a;border:1px solid #4a4;border-radius:4px;max-height:200px;overflow-y:auto;">';
    html += '<div style="color:#8f8;font-weight:bold;font-size:0.85em;margin-bottom:4px;">射撃結果</div>';
    supportState.fireResults.forEach(r => {
      const color = r.damage === 'eliminated' ? '#f44' : r.damage === 'dd' ? '#f88' : r.damage === 'd' ? '#fd8' : '#aaa';
      html += `<div style="font-size:0.8em;color:${color};padding:1px 0;">${r.text}</div>`;
    });
    html += '</div>';
  }

  c.innerHTML = html;
}

// 砲兵ユニット選択トグル
function toggleArtillerySelect(name) {
  const idx = supportState.selectedArtillery.indexOf(name);
  if (idx >= 0) {
    supportState.selectedArtillery.splice(idx, 1);
  } else {
    // 盤外砲兵と盤上砲兵は協同不可 (9-2-(6))
    if (supportState.selectedOffBoard.length > 0) {
      alert('盤上砲兵と盤外砲兵は協同攻撃できません (9-2-(6))');
      return;
    }
    // 協同攻撃チェック: 同一or隣接ヘクスの砲兵のみ
    const newUnit = testUnits.find(u => u.name === name);
    if (supportState.selectedArtillery.length > 0) {
      const firstUnit = testUnits.find(u => u.name === supportState.selectedArtillery[0]);
      const dist = hexDistance(firstUnit.col, firstUnit.row, newUnit.col, newUnit.row);
      if (dist > 1) {
        alert('協同攻撃は同一または隣接ヘクスの砲兵のみ可能です (9-1-(5))');
        return;
      }
    }
    supportState.selectedArtillery.push(name);
  }
  // 選択があればターゲットモード開始
  supportState.targetMode = supportState.selectedArtillery.length > 0;
  supportState._offBoard = false;
  supportState._firingSide = testUnits.find(u => u.name === (supportState.selectedArtillery[0] || name))?.side;
  renderSupportPhase();
  drawMap();
}

// 盤外砲兵選択トグル
function toggleOffBoardSelect(obId) {
  const ob = SCENARIO_OFF_BOARD.find(o => o.id === obId);
  if (!ob || ob.usedCount >= ob.uses) return;

  const idx = supportState.selectedOffBoard.indexOf(obId);
  if (idx >= 0) {
    supportState.selectedOffBoard.splice(idx, 1);
  } else {
    // 合算チェック: combinable同士のみ合算可 (9-2-(5))
    if (supportState.selectedOffBoard.length > 0) {
      const first = SCENARIO_OFF_BOARD.find(o => o.id === supportState.selectedOffBoard[0]);
      if (!first.combinable || !ob.combinable) {
        alert('この盤外砲兵は他と合算できません (9-2-(5))');
        return;
      }
      if (first.side !== ob.side) {
        alert('異なる陣営の砲兵は合算できません');
        return;
      }
    }
    // 盤上砲兵と盤外砲兵は協同不可 (9-2-(6))
    if (supportState.selectedArtillery.length > 0) {
      alert('盤上砲兵と盤外砲兵は協同攻撃できません (9-2-(6))');
      return;
    }
    supportState.selectedOffBoard.push(obId);
  }
  supportState.targetMode = supportState.selectedOffBoard.length > 0;
  supportState._offBoard = supportState.selectedOffBoard.length > 0;
  supportState._firingSide = ob.side;
  renderSupportPhase();
  drawMap();
}

// 目標キャンセル
// ===== 砲撃結果オーバーレイ =====
function showFireOverlay(title, targetInfo, results) {
  const overlay = document.getElementById('fireOverlay');
  document.getElementById('fireOverlayTitle').textContent = title;
  document.getElementById('fireOverlayTarget').textContent = targetInfo;
  const container = document.getElementById('fireOverlayResults');
  container.innerHTML = '';

  const n = results.length;
  const diceDelay = 300;   // 各ダイス開始の時間差
  const rollDuration = 800; // ダイスが回る時間
  const allDoneTime = n * diceDelay + rollDuration + 200; // 全ダイス停止後の余白

  results.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'fire-row hit-none'; // 初期は灰色
    row.style.animationDelay = `${i * 0.1}s`;
    row.innerHTML = `
      <span class="fire-unit-name">${r.targetName}</span>
      <span class="fire-dice" id="fireDice${i}">-</span>
      <span class="fire-detail" id="fireDetail${i}" style="color:#666;font-size:0.85em;">FP${r.fp} 防御${r.def}</span>
      <span class="fire-damage none" id="fireDmg${i}" style="visibility:hidden;">-</span>
    `;
    container.appendChild(row);

    // ダイスを時間差で回し始め、順に止める
    const startTime = i * diceDelay;
    setTimeout(() => {
      const diceEl = document.getElementById(`fireDice${i}`);
      if (!diceEl) return;
      diceEl.classList.add('rolling');
      const rollInterval = setInterval(() => {
        diceEl.textContent = Math.floor(Math.random() * 10);
      }, 50);

      // このダイスが止まるタイミング
      setTimeout(() => {
        clearInterval(rollInterval);
        diceEl.classList.remove('rolling');
        diceEl.textContent = r.roll;
      }, rollDuration);
    }, startTime);
  });

  // 全ダイス停止後 → 一斉に結果表示
  setTimeout(() => {
    results.forEach((r, i) => {
      const dmgClass = r.damage === 'eliminated' ? 'hit-elim' : r.damage === 'dd' ? 'hit-dd' : r.damage === 'd' ? 'hit-d' : 'hit-none';
      const dmgLabel = r.damage === 'eliminated' ? '壊滅' : r.damage === 'dd' ? 'DD' : r.damage === 'd' ? 'D' : '効果なし';
      const statusChange = r.damage !== 'none' ? `${r.prevStatus.toUpperCase()} → ${r.newStatus.toUpperCase()}` : '';
      const dlLabel = r.isElimination ? 'E' : r.damageLevel;
      const terrainStr = r.terrainMod ? `地形${r.terrainMod >= 0 ? '+' : ''}${r.terrainMod}` : '';

      const row = document.querySelectorAll('#fireOverlayResults .fire-row')[i];
      if (row) row.className = `fire-row ${dmgClass}`;

      const dmgEl = document.getElementById(`fireDmg${i}`);
      if (dmgEl) {
        dmgEl.className = `fire-damage ${r.damage}`;
        dmgEl.textContent = dmgLabel;
        dmgEl.style.visibility = 'visible';
        dmgEl.style.transform = 'scale(1.5)';
        dmgEl.style.transition = 'transform 0.3s';
        setTimeout(() => { dmgEl.style.transform = 'scale(1)'; }, 200);
      }

      const detailEl = document.getElementById(`fireDetail${i}`);
      if (detailEl) {
        detailEl.style.color = '#aaa';
        detailEl.innerHTML = `${statusChange ? '<span style="color:#fff;font-size:1.1em;font-weight:bold;">' + statusChange + '</span> ' : ''}FP${r.fp} ${terrainStr} ダイス${r.roll} 損害Lv${dlLabel} 防御${r.def}`;
      }
    });
  }, allDoneTime);

  overlay.classList.add('show');
}

function closeFireOverlay() {
  document.getElementById('fireOverlay').classList.remove('show');
}

function cancelSupportTarget() {
  supportState.selectedArtillery = [];
  supportState.targetHexId = null;
  supportState.targetMode = false;
  supportState._offBoard = false;
  renderSupportPhase();
}

// マップクリックで目標ヘクス選択（supportフェイズ時）
function onSupportMapClick(col, row) {
  if (!supportState.targetMode) return false;
  const hexId = toHexId(col, row);

  // 射程チェック（盤上砲兵の場合）
  if (!supportState._offBoard && supportState.selectedArtillery.length > 0) {
    for (const name of supportState.selectedArtillery) {
      const u = testUnits.find(u2 => u2.name === name);
      const uPos = { col: u.col, row: u.row };
      const dist = hexDistance(uPos.col, uPos.row, col, row);
      if (dist < 3) {
        alert(`${u.name}: 近すぎます（最低3ヘクス、現在${dist}）`);
        return true;
      }
      if (dist > (u.range || 8)) {
        alert(`${u.name}: 射程外です（最大${u.range}、現在${dist}）`);
        return true;
      }
    }
  }

  // 航空支援かどうか判定（IDが'air_'で始まる盤外砲兵）
  const isAirSupport = supportState._offBoard && supportState.selectedOffBoard.some(id =>
    id.startsWith('air_')
  );

  // ダミーがいるヘクスは砲撃不可（航空支援は例外）
  if (!isAirSupport) {
    const hasDummy = testUnits.some(u =>
      u.hexId === hexId && u.type === 'dummy' && u.status !== 'eliminated'
    );
    if (hasDummy) {
      alert('ダミーのいるヘクスには支援砲撃できません');
      return true;
    }
  }

  // 味方ユニットが目標を視認している必要がある
  const firingSide = supportState._firingSide || G.initiative;
  if (!isTargetSpottedByFriendly(hexId, firingSide)) {
    if (isAirSupport) {
      // 航空支援: 戦闘爆撃機発見表で視認チェック
      const terrain = getHexTerrain(hexId) || 'p';
      const disc = FIGHTER_BOMBER_DISCOVERY[terrain] || FIGHTER_BOMBER_DISCOVERY['p'];
      const roll = Math.floor(Math.random() * 10);
      const success = roll >= (disc[0] - 1) && roll <= (disc[1] - 1);  // 0-9に変換
      if (success) {
        addLog('init', `航空支援 視認チェック: ダイス${roll+1} (${terrain}, 成功範囲${disc[0]}-${disc[1]}) → 発見！`);
        // 発見成功: ダミーマーカーを除去
        const dummies = testUnits.filter(u =>
          u.hexId === hexId && u.type === 'dummy' && u.status !== 'eliminated'
        );
        dummies.forEach(d => {
          d.status = 'eliminated';
          addLog('init', `航空支援: ${hexId} のダミーマーカーを除去`);
        });
      } else {
        addLog('init', `航空支援 視認チェック: ダイス${roll+1} (${terrain}, 成功範囲${disc[0]}-${disc[1]}) → 発見できず`);
        alert(`航空支援: 目標を発見できませんでした（ダイス${roll+1}、${terrain}地形は${disc[0]}-${disc[1]}で発見）`);
        return true;
      }
    } else {
      alert('味方ユニットが目標を視認していません');
      return true;
    }
  }

  supportState.targetHexId = hexId;
  renderSupportPhase();
  drawMap();
  return true;
}

// 砲撃実行
function executeSupportFire() {
  if (!supportState.targetHexId) return;
  const targetHexId = supportState.targetHexId;
  const side = supportState._firingSide || G.initiative;
  const terrainMod = getTerrainFireMod(targetHexId);
  const tNames = {p:'平地',w:'林',f:'森林',r:'荒地',t:'町',c:'市街地',lake:'湖'};
  const terrain = getHexTerrain(targetHexId);

  // 目標ヘクスの敵ユニット（指揮官・ダミーは除外）
  const targetUnits = testUnits.filter(u => {
    const hid = toHexId(u.col, u.row);
    return hid === targetHexId && u.side !== side && u.status !== 'eliminated' &&
      u.type !== 'leader' && u.type !== 'dummy';
  });

  if (targetUnits.length === 0) {
    alert('目標ヘクスに敵ユニットがいません');
    return;
  }

  // 陣地チェック: 陣地があればまず陣地への判定
  const fort = testUnits.find(u =>
    (u.hexId || toHexId(u.col, u.row)) === targetHexId &&
    u.type === 'fortification' && u.status !== 'eliminated'
  );
  if (fort) {
    const fortRoll = Math.floor(Math.random() * 10);
    const prevFortStatus = fort.status;
    let fortDamage = 'none';
    if (fortRoll >= 4) {
      if (typeof downgradeFort === 'function') downgradeFort(fort);
      else fort.status = 'eliminated';
      fortDamage = 'eliminated';
    } else if (fortRoll === 3) {
      if (fort.status === 'ok') { fort.status = 'dd'; fortDamage = 'dd'; }
      else { if (typeof downgradeFort === 'function') downgradeFort(fort); else fort.status = 'eliminated'; fortDamage = 'eliminated'; }
    } else if (fortRoll >= 1) {
      if (fort.status === 'ok') { fort.status = 'd'; fortDamage = 'd'; }
      else if (fort.status === 'd') { fort.status = 'dd'; fortDamage = 'dd'; }
      else { if (typeof downgradeFort === 'function') downgradeFort(fort); else fort.status = 'eliminated'; fortDamage = 'eliminated'; }
    }
    const fortLabel = fort.status === 'eliminated' ? '破壊' : fortDamage === 'dd' ? 'DD' : fortDamage === 'd' ? 'D' : '効果なし';
    addLog('init', `砲撃→陣地判定: ${fort.name} D10:${fortRoll} → ${fortLabel}`);
    // 陣地が残っていたらユニットへの損害なし
    if (fort.status !== 'eliminated') {
      addLog('init', `陣地健在 → ユニットへの損害なし`);
      supportState.targetHexId = null;
      supportState.targetMode = false;
      renderSupportPhase();
      drawMap();
      return;
    }
  }

  let firerName = '';
  const overlayResults = [];

  // 盤外砲兵の場合
  if (supportState._offBoard && supportState.selectedOffBoard.length > 0) {
    const obUnits = supportState.selectedOffBoard.map(id => SCENARIO_OFF_BOARD.find(o => o.id === id)).filter(Boolean);
    let fp = 0;
    obUnits.forEach(ob => { fp += ob.fp || 0; });
    firerName = obUnits.map(ob => ob.name).join('+');

    targetUnits.forEach(target => {
      const roll = Math.floor(Math.random() * 10);
      const modRoll = roll + terrainMod;
      const combat = getFireCombatResult(fp, modRoll);
      const damage = resolveDamage(combat.damageLevel, target.def || 0);
      const prevStatus = target.status;
      applyDamageToUnit(target, damage);
      const dlLabel = combat.isElimination ? 'E' : combat.damageLevel;
      const text = `${firerName}→${target.name}: FP${fp} ダイス${roll}${terrainMod?'(地形'+terrainMod+')':''}=${modRoll} 損害Lv${dlLabel} → ${prevStatus.toUpperCase()}→${target.status.toUpperCase()}`;
      supportState.fireResults.push({ text, damage });
      addLog('init', text);
      overlayResults.push({
        targetName: target.name, roll, modRoll, fp, terrainMod,
        damageLevel: combat.damageLevel, isElimination: combat.isElimination,
        def: target.def || 0, damage, prevStatus, newStatus: target.status
      });
    });

    obUnits.forEach(ob => {
      ob.usedCount++;
      addLog('init', `${ob.name}: 使用${ob.usedCount}/${ob.uses}回`);
    });

    supportState.selectedOffBoard = [];
    supportState.targetHexId = null;
    supportState.targetMode = false;
    supportState._offBoard = false;

  } else {
    // 盤上砲兵
    const firingUnits = supportState.selectedArtillery.map(name => testUnits.find(u => u.name === name)).filter(Boolean);
    firerName = firingUnits.map(u => u.name).join('+');

    targetUnits.forEach(target => {
      const isArmored = target.type === 'T' || target.type === 'AC';
      let fp = 0;
      firingUnits.forEach(u => { fp += isArmored ? (u.spAT || u.fpAT || 0) : (u.spSoft || u.fpSoft || 0); });
      const roll = Math.floor(Math.random() * 10);
      const modRoll = roll + terrainMod;
      const combat = getFireCombatResult(fp, modRoll);
      const damage = resolveDamage(combat.damageLevel, target.def || 0);
      const prevStatus = target.status;
      applyDamageToUnit(target, damage);
      const dlLabel = combat.isElimination ? 'E' : combat.damageLevel;
      const text = `${firerName}→${target.name}: FP${fp} ダイス${roll}${terrainMod?'(地形'+terrainMod+')':''}=${modRoll} 損害Lv${dlLabel} → ${prevStatus.toUpperCase()}→${target.status.toUpperCase()}`;
      supportState.fireResults.push({ text, damage });
      addLog('init', text);
      overlayResults.push({
        targetName: target.name, roll, modRoll, fp, terrainMod,
        damageLevel: combat.damageLevel, isElimination: combat.isElimination,
        def: target.def || 0, damage, prevStatus, newStatus: target.status
      });
    });

    firingUnits.forEach(u => { u.firedThisTurn = true; });

    supportState.selectedArtillery = [];
    supportState.targetHexId = null;
    supportState.targetMode = false;
  }

  // 指揮官負傷チェック: 損害が出た場合、同ヘクスの指揮官もオーバーレイに表示
  if (overlayResults.some(r => r.damage !== 'none')) {
    const defSide = targetUnits[0]?.side;
    const leader = getLeaderInHex(targetHexId, defSide);
    if (leader) {
      const lRoll = Math.floor(Math.random() * 10);
      const wounded = lRoll === 0;
      if (wounded) {
        leader.status = 'eliminated';
        addLog('init', `⚠ ${leader.name} 負傷！（ダイス: ${lRoll}）→ 除去`);
      } else {
        addLog('init', `${leader.name} 負傷チェック（ダイス: ${lRoll}）→ 無事`);
      }
      overlayResults.push({
        targetName: `${leader.name}【負傷チェック】`,
        roll: lRoll, modRoll: lRoll, fp: 0, terrainMod: 0,
        damageLevel: 0, isElimination: wounded,
        def: 0, damage: wounded ? 'eliminated' : 'none',
        prevStatus: wounded ? 'ok' : leader.status,
        newStatus: leader.status
      });
      // スタック壊滅チェック
      checkLeaderOnStackEliminated(targetHexId, defSide);
    }
  }

  // オーバーレイ表示
  const targetInfo = `${firerName} → ${targetHexId} (${tNames[terrain]||terrain}${terrainMod ? ', 修正'+(terrainMod>=0?'+':'')+terrainMod : ''})`;
  showFireOverlay('砲撃！', targetInfo, overlayResults);

  renderSupportPhase();
  drawMap();
}

// ===== 間接射撃 (ルール9) =====

// 間接射撃可能か判定
function canIndirectFire(unit) {
  if (unit.type !== 'A') return { can: false, reason: '砲兵ユニットのみ間接射撃可能' };
  if (unit.status !== 'ok') return { can: false, reason: '正常状態でない' };
  if (unit.firedThisTurn) return { can: false, reason: '今フェイズ射撃済み' };
  return { can: true, reason: '' };
}

// 間接射撃の射程チェック (9-1-(3): 最低3ヘクス〜最大射程)
function isInIndirectRange(unit, targetHexId) {
  const uPos = fromHexId(unit.hexId);
  const tPos = fromHexId(targetHexId);
  const dist = hexDistance(uPos.col, uPos.row, tPos.col, tPos.row);
  if (dist < 3) return { inRange: false, reason: '近すぎる（最低3ヘクス）' };
  if (dist > (unit.range || 8)) return { inRange: false, reason: '射程外' };
  return { inRange: true, dist };
}

// 味方の誰かが目標を視認しているか (9-1-(2))
function isTargetSpottedByFriendly(targetHexId, side) {
  const tPos = fromHexId(targetHexId);
  // ダミー付きなら視認不可
  if (getDummyCount(targetHexId) > 0) {
    const d = dummyMap[targetHexId];
    if (d && d.side !== side && isDummyProtected(targetHexId)) return false;
  }
  for (const u of units) {
    if (u.side !== side || u.status !== 'ok' || u.type === 'leader' || u.type === 'dummy') continue;
    if (!u.hexId || u.hexId === 'reinforcement') continue;
    const uPos = fromHexId(u.hexId);
    const visionHexes = calculateVisionRange(uPos.col, uPos.row, G.visionRange);
    if (visionHexes[`${tPos.col},${tPos.row}`]) return true;
  }
  return false;
}

// 協同攻撃可能な砲兵を取得 (9-1-(5): 同一or隣接ヘクスの砲兵)
function getCoopArtillery(unit) {
  const result = [];
  const uPos = fromHexId(unit.hexId);
  units.forEach(u => {
    if (u === unit || u.type !== 'A' || u.side !== unit.side) return;
    if (u.status !== 'ok' || u.firedThisTurn) return;
    const pos = fromHexId(u.hexId);
    const dist = hexDistance(uPos.col, uPos.row, pos.col, pos.row);
    if (dist <= 1) result.push(u);
  });
  return result;
}

// 間接射撃実行
// targetHexId: 攻撃先ヘクス
// firingUnits: 射撃する砲兵ユニット配列（協同攻撃含む）
function executeIndirectFire(firingUnits, targetHexId) {
  // 火力合計
  let totalFP = 0;
  firingUnits.forEach(u => {
    totalFP += u.fpSoft || 0; // 間接射撃は対非装甲火力
    u.firedThisTurn = true;
  });

  // 目標ヘクスの地形修正
  const terrainMod = getTerrainFireMod(targetHexId);

  // 施設修正（I.P.）
  const facility = FACILITY_MAP[targetHexId];
  let facilityMod = 0;
  if (facility === 'ip') facilityMod = -1; // I.P.の射撃修正

  // 目標ヘクスの全敵ユニットに対して個別にダイスロール (9-3-(5))
  const targetUnits = units.filter(u =>
    u.hexId === targetHexId &&
    u.side !== firingUnits[0].side &&
    u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader'
  );

  const results = [];
  targetUnits.forEach(target => {
    // 対装甲/対非装甲の火力選択 (9-3-(6))
    const isArmored = target.type === 'T' || target.type === 'AC';
    let fp = 0;
    firingUnits.forEach(u => {
      fp += isArmored ? (u.spAT || u.fpAT || 0) : (u.spSoft || u.fpSoft || 0);
    });

    const roll = Math.floor(Math.random() * 10);
    const modifiedRoll = roll + terrainMod;
    const combat = getFireCombatResult(fp, modifiedRoll);
    const damage = resolveDamage(combat.damageLevel, target.def || 0);

    // 損害適用
    const prevStatus = target.status;
    applyDamageToUnit(target, damage);

    results.push({
      target, roll, modifiedRoll, fp,
      damageLevel: combat.damageLevel, isElimination: combat.isElimination,
      ammoCheck: combat.ammoCheck, damage,
      prevStatus, newStatus: target.status
    });

    const dlLabel = combat.isElimination ? 'E' : combat.damageLevel;
    if (damage !== 'none') {
      addLog('init', `間接射撃: ${target.name} (fp${fp}, ダイス${roll}${terrainMod?'+'+terrainMod:''}=${modifiedRoll}, 損害Lv${dlLabel}) → ${prevStatus.toUpperCase()}→${target.status.toUpperCase()}`);
    } else {
      addLog('init', `間接射撃: ${target.name} (fp${fp}, ダイス${roll}${terrainMod?'+'+terrainMod:''}=${modifiedRoll}, 損害Lv${dlLabel}) → 効果なし`);
    }
  });

  // 指揮官負傷チェック（損害が出た場合、1回の攻撃につき1回）
  if (results.some(r => r.damage !== 'none')) {
    checkLeaderCasualty(targetHexId, targetUnits[0]?.side);
    // スタック壊滅チェック
    checkLeaderOnStackEliminated(targetHexId, targetUnits[0]?.side);
  }

  // ダミー付きでも損害チェックは行う (9-3-(7)) — ダミーは取らない

  return results;
}

// 損害をユニットに適用する共通関数
function applyDamageToUnit(unit, damage) {
  // 移動隊形の歩兵への脱出チェック (12-3)
  if (unit.marchMode && unit.type === 'I' && damage !== 'none') {
    const escapeRoll = Math.floor(Math.random() * 10);
    if (damage === 'eliminated') {
      // 壊滅 → 0-4でDD（戦闘隊形に戻る）
      if (escapeRoll <= 4) {
        unit.status = 'dd';
        unit.marchMode = false;
        addLog('fire', `${unit.name}: 移動隊形脱出チェック D10:${escapeRoll} → DD（戦闘隊形）`);
        return;
      }
      // 5-9は壊滅
      unit.status = 'eliminated';
      unit.marchMode = false;
      addLog('fire', `${unit.name}: 移動隊形脱出チェック D10:${escapeRoll} → 壊滅`);
      return;
    } else if (damage === 'd' || damage === 'dd') {
      // D/DD → 0-4で無傷（戦闘隊形に戻る）
      if (escapeRoll <= 4) {
        unit.status = 'ok';
        unit.marchMode = false;
        addLog('fire', `${unit.name}: 移動隊形脱出チェック D10:${escapeRoll} → 無傷（戦闘隊形）`);
        return;
      }
      // 5-9は通常通り損害適用（戦闘隊形に戻る）
      unit.marchMode = false;
    }
  }

  if (damage === 'd') {
    if (unit.status === 'ok') unit.status = 'd';
    else if (unit.status === 'd') unit.status = 'dd';
    else if (unit.status === 'dd') unit.status = 'eliminated';
  } else if (damage === 'dd') {
    if (unit.status === 'ok') unit.status = 'dd';
    else unit.status = 'eliminated';
  } else if (damage === 'eliminated') {
    unit.status = 'eliminated';
  }
}

// ===== 盤外支援砲兵 (ルール9-2) =====
// シナリオで定義。射程制限なし、距離制限なし、攻撃を受けない
// 盤上砲兵との協同攻撃は不可 (9-2-(6))
function executeOffBoardArtillery(firePower, targetHexId, side) {
  // 味方の視認チェック
  if (!isTargetSpottedByFriendly(targetHexId, side)) {
    addLog('init', `盤外支援砲撃: ${targetHexId} — 視認なし、攻撃不可`);
    return [];
  }

  const terrainMod = getTerrainFireMod(targetHexId);

  // 陣地チェック
  const fort = units.find(u =>
    u.hexId === targetHexId && u.type === 'fortification' && u.status !== 'eliminated'
  );
  if (fort) {
    const fortRoll = Math.floor(Math.random() * 10);
    let fortDamage = 'none';
    if (fortRoll >= 4) {
      if (typeof downgradeFort === 'function') downgradeFort(fort); else fort.status = 'eliminated';
      fortDamage = 'eliminated';
    } else if (fortRoll === 3) {
      if (fort.status === 'ok') { fort.status = 'dd'; fortDamage = 'dd'; }
      else { if (typeof downgradeFort === 'function') downgradeFort(fort); else fort.status = 'eliminated'; fortDamage = 'eliminated'; }
    } else if (fortRoll >= 1) {
      if (fort.status === 'ok') { fort.status = 'd'; fortDamage = 'd'; }
      else if (fort.status === 'd') { fort.status = 'dd'; fortDamage = 'dd'; }
      else { if (typeof downgradeFort === 'function') downgradeFort(fort); else fort.status = 'eliminated'; fortDamage = 'eliminated'; }
    }
    const fortLabel = fort.status === 'eliminated' ? '破壊' : fortDamage === 'dd' ? 'DD' : fortDamage === 'd' ? 'D' : '効果なし';
    addLog('init', `盤外砲撃→陣地判定: ${fort.name} D10:${fortRoll} → ${fortLabel}`);
    if (fort.status !== 'eliminated') {
      addLog('init', `陣地健在 → ユニットへの損害なし`);
      return [];
    }
  }

  const targetUnits = units.filter(u =>
    u.hexId === targetHexId &&
    u.side !== side &&
    u.status !== 'eliminated' &&
    u.type !== 'dummy' && u.type !== 'leader'
  );

  const results = [];
  targetUnits.forEach(target => {
    const isArmored = target.type === 'T' || target.type === 'AC';
    const fp = firePower; // 盤外砲兵は単一火力

    const roll = Math.floor(Math.random() * 10);
    const modifiedRoll = roll + terrainMod;
    const combat = getFireCombatResult(fp, modifiedRoll);
    const damage = resolveDamage(combat.damageLevel, target.def || 0);

    const prevStatus = target.status;
    applyDamageToUnit(target, damage);

    results.push({
      target, roll, modifiedRoll, fp,
      damageLevel: combat.damageLevel, isElimination: combat.isElimination,
      ammoCheck: combat.ammoCheck, damage,
      prevStatus, newStatus: target.status
    });

    const dlLabel = combat.isElimination ? 'E' : combat.damageLevel;
    if (damage !== 'none') {
      addLog('init', `盤外砲撃: ${target.name} (fp${fp}, ダイス${roll}${terrainMod?'+'+terrainMod:''}=${modifiedRoll}, 損害Lv${dlLabel}) → ${prevStatus.toUpperCase()}→${target.status.toUpperCase()}`);
    } else {
      addLog('init', `盤外砲撃: ${target.name} (fp${fp}, ダイス${roll}${terrainMod?'+'+terrainMod:''}=${modifiedRoll}, 損害Lv${dlLabel}) → 効果なし`);
    }
  });

  if (results.some(r => r.damage !== 'none')) {
    checkLeaderCasualty(targetHexId, targetUnits[0]?.side);
    checkLeaderOnStackEliminated(targetHexId, targetUnits[0]?.side);
  }

  return results;
}

// ===== AI自動支援砲撃 =====
function aiAutoSupportFire(activeSide) {
  const sides = activeSide ? [activeSide] : ['german', 'allied'];
  sides.forEach(side => {
    const enemySide = side === 'german' ? 'allied' : 'german';

    // 味方ユニットがマップ上にいなければスキップ（援軍未到着）
    const friendlyOnMap = testUnits.some(u =>
      u.side === side && u.status !== 'eliminated' &&
      u.type !== 'dummy' && u.type !== 'leader' &&
      u.col >= 0 && u.col < MAP_CONFIG.cols
    );
    if (!friendlyOnMap) return;

    // 盤上砲兵
    const artillery = testUnits.filter(u =>
      u.side === side && u.type === 'A' && u.status === 'ok' && !u.firedThisTurn
    );
    artillery.forEach(arty => {
      const enemies = testUnits.filter(e =>
        e.side === enemySide && e.status !== 'eliminated' &&
        e.type !== 'dummy' && e.type !== 'leader'
      );
      if (enemies.length === 0) return;
      let bestTarget = null, bestScore = -1;
      const checkedHexes = new Set();
      enemies.forEach(e => {
        if (checkedHexes.has(e.hexId)) return;
        checkedHexes.add(e.hexId);
        const dist = hexDistance(arty.col, arty.row, e.col, e.row);
        if (dist < 3 || dist > (arty.range || 8)) return;
        if (testUnits.some(u => u.hexId === e.hexId && u.type === 'dummy' && u.status !== 'eliminated')) return;
        if (!isTargetSpottedByFriendly(e.hexId, side)) return;
        const hexEnemies = enemies.filter(u => u.hexId === e.hexId).length;
        // 正常な敵を優先（弱った敵は突撃で仕留める）
        const okEnemies = enemies.filter(u => u.hexId === e.hexId && u.status === 'ok').length;
        const score = okEnemies * 15 + hexEnemies * 5 + (10 - dist);
        if (score > bestScore) { bestScore = score; bestTarget = e; }
      });
      if (!bestTarget) return;
      const targetHexId = bestTarget.hexId;
      const terrainMod = getTerrainFireMod(targetHexId);
      const tgts = testUnits.filter(u =>
        u.hexId === targetHexId && u.side === enemySide && u.status !== 'eliminated' &&
        u.type !== 'leader' && u.type !== 'dummy'
      );
      if (tgts.length === 0) return;
      tgts.forEach(target => {
        const isArmored = target.type === 'T' || target.type === 'AC';
        const fp = isArmored ? (arty.spAT || arty.fpAT || 0) : (arty.spSoft || arty.fpSoft || 0);
        if (fp <= 0) return;
        const roll = Math.floor(Math.random() * 10);
        const modRoll = roll + terrainMod;
        const combat = getFireCombatResult(fp, modRoll);
        const damage = resolveDamage(combat.damageLevel, target.def || 0);
        const prevStatus = target.status;
        applyDamageToUnit(target, damage);
        addLog('init', `AI支援砲撃: ${arty.name}→${target.name} FP${fp} D10:${roll}${terrainMod?'+'+terrainMod:''}=${modRoll} → ${prevStatus.toUpperCase()}→${target.status.toUpperCase()}`);
      });
      arty.firedThisTurn = true;
      if (tgts.some(u => u.status !== 'eliminated')) {
        checkLeaderCasualty(targetHexId, enemySide);
        checkLeaderOnStackEliminated(targetHexId, enemySide);
      }
    });

    // 盤外砲兵
    SCENARIO_OFF_BOARD.filter(ob => ob.side === side && ob.usedCount < ob.uses).forEach(ob => {
      const enemies = testUnits.filter(e =>
        e.side === enemySide && e.status !== 'eliminated' &&
        e.type !== 'dummy' && e.type !== 'leader'
      );
      if (enemies.length === 0) return;
      const isAir = ob.id && ob.id.startsWith('air_');
      let bestTarget = null, bestScore = -1;
      const checkedHexes = new Set();
      enemies.forEach(e => {
        if (checkedHexes.has(e.hexId)) return;
        checkedHexes.add(e.hexId);
        if (!isAir && testUnits.some(u => u.hexId === e.hexId && u.type === 'dummy' && u.status !== 'eliminated')) return;
        if (!isTargetSpottedByFriendly(e.hexId, side)) {
          if (!isAir) return;
          const terrain = getHexTerrain(e.hexId) || 'p';
          const disc = FIGHTER_BOMBER_DISCOVERY[terrain] || FIGHTER_BOMBER_DISCOVERY['p'];
          const dRoll = Math.floor(Math.random() * 10);
          if (!(dRoll >= (disc[0] - 1) && dRoll <= (disc[1] - 1))) return;
        }
        const hexEnemies = enemies.filter(u => u.hexId === e.hexId).length;
        if (hexEnemies > bestScore) { bestScore = hexEnemies; bestTarget = e; }
      });
      if (!bestTarget) return;
      const targetHexId = bestTarget.hexId;
      const terrainMod = getTerrainFireMod(targetHexId);
      const tgts = testUnits.filter(u =>
        u.hexId === targetHexId && u.side === enemySide && u.status !== 'eliminated' &&
        u.type !== 'leader' && u.type !== 'dummy'
      );
      if (tgts.length === 0) return;
      tgts.forEach(target => {
        const roll = Math.floor(Math.random() * 10);
        const modRoll = roll + terrainMod;
        const combat = getFireCombatResult(ob.fp, modRoll);
        const damage = resolveDamage(combat.damageLevel, target.def || 0);
        const prevStatus = target.status;
        applyDamageToUnit(target, damage);
        addLog('init', `AI盤外砲撃: ${ob.name}→${target.name} FP${ob.fp} D10:${roll}${terrainMod?'+'+terrainMod:''}=${modRoll} → ${prevStatus.toUpperCase()}→${target.status.toUpperCase()}`);
      });
      ob.usedCount++;
      checkLeaderCasualty(targetHexId, enemySide);
      checkLeaderOnStackEliminated(targetHexId, enemySide);
    });
  });
}
