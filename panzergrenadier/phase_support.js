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
  fpMode: ob.fpMode || null,
  fpATModifier: ob.fpATModifier || 0,
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

function currentSupportSide() {
  return PHASES[G.phase]?.id === 'supportDef'
    ? (G.initiative === 'german' ? 'allied' : 'german') : G.initiative;
}

function renderSupportPhase(activeSide) {
  const c = document.getElementById('phaseContent');
  const sideNames = { german: 'ドイツ軍', allied: '連合軍' };
  const side = activeSide || currentSupportSide();

  let html = '<div class="phase-info">' + sideNames[side] + ' の間接射撃フェイズです。</div>';

  // 該当陣営の砲兵を表示
  [side].forEach(side => {
    const artillery = testUnits.filter(u => u.type === 'A' && u.side === side && pgOnMap(u));
    html += `<div class="recovery-section"><h3>${sideNames[side]} 砲兵</h3>`;

    if (artillery.length === 0) {
      html += '<div style="color:var(--pg-muted);font-size:0.8em;padding:4px;">砲兵ユニットなし</div>';
    } else {
      artillery.forEach(u => {
        const selected = supportState.selectedArtillery.includes(u.name);
        const fired = u.firedThisTurn;
        const available = canIndirectFire(u);
        const hexId = toHexId(u.col, u.row);
        const bgColor = selected ? 'var(--pg-green-bg)' : fired ? 'var(--pg-shade)' : 'var(--pg-card)';
        html += `<div class="recovery-unit" aria-pressed="${selected}" style="background:${bgColor};cursor:${available?'pointer':'default'};" onclick="${available?`toggleArtillerySelect('${u.name}')`:''}">`;
        html += `<span class="u-name">${u.name}</span>`;
        html += `<span style="color:var(--pg-blue);font-size:0.75em;font-weight:bold;">${hexId}</span>`;
        html += `<span style="color:var(--pg-muted);font-size:0.8em;">FP${u.spSoft || u.fpSoft}/${u.spAT || u.fpAT} 射程${u.range}</span>`;
        html += `<span class="u-status ${u.status}">${u.status === 'ok' ? '正常' : u.status.toUpperCase()}</span>`;
        if (fired) html += '<span style="color:var(--pg-red);font-size:0.8em;">射撃済</span>';
        if (selected) html += '<span style="color:var(--pg-green);font-size:0.8em;">✓選択</span>';
        html += '</div>';
      });
    }

    // 盤外支援砲兵
    const offBoards = SCENARIO_OFF_BOARD.filter(ob => ob.side === side);
    if (offBoards.length > 0) {
      html += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--pg-line);">';
      html += '<div style="color:var(--pg-muted);font-size:0.75em;">盤外支援砲兵</div>';
      offBoards.forEach(ob => {
        const exhausted = ob.usedCount >= ob.uses;
        const selected = supportState.selectedOffBoard.includes(ob.id);
        const bgColor = selected ? 'var(--pg-green-bg)' : exhausted ? 'var(--pg-shade)' : 'var(--pg-card)';
        html += `<div class="recovery-unit" aria-pressed="${selected}" style="background:${bgColor};cursor:${exhausted?'default':'pointer'};" onclick="${exhausted?'':`toggleOffBoardSelect('${ob.id}')`}">`;
        html += `<span class="u-name">${ob.name}</span>`;
        html += `<span style="color:var(--pg-muted);font-size:0.8em;">FP${ob.fp} (${ob.usedCount}/${ob.uses}回)</span>`;
        if (exhausted) {
          html += '<span style="color:var(--pg-red);font-size:0.8em;">使い切り</span>';
        } else if (selected) {
          html += '<span style="color:var(--pg-green);font-size:0.8em;">✓選択</span>';
        }
        if (ob.combinable && !exhausted) {
          html += '<span style="color:var(--pg-blue);font-size:0.7em;">合算可</span>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
  });

  // 目標選択UI
  if (supportState.selectedArtillery.length > 0 || supportState.targetMode) {
    html += '<div style="margin:8px 0;padding:8px;background:var(--pg-shade);border-radius:4px;">';
    if (supportState.targetHexId) {
      const terrain = getHexTerrain(supportState.targetHexId);
      const mod = getTerrainFireMod(supportState.targetHexId);
      const tNames = {p:'平地',w:'林',f:'森林',r:'荒地',t:'町',c:'市街地',lake:'湖'};
      html += `<div style="color:var(--pg-accent);font-weight:bold;">目標: ${supportState.targetHexId} (${tNames[terrain]||terrain}, 修正${mod>=0?'+':''}${mod})</div>`;
      // 目標ヘクスの敵ユニット
      const enemies = supportTargets(supportState.targetHexId, currentSupportSide())
        .filter(u => u.type !== 'leader');
      if (enemies.length > 0) {
        html += '<div style="font-size:0.8em;color:var(--pg-muted);margin:4px 0;">';
        enemies.forEach(e => {
          html += `${e.name}(${e.type},防御${e.def||0}) `;
        });
        html += '</div>';
      } else {
        html += '<div style="font-size:0.8em;color:var(--pg-red);">敵ユニットなし</div>';
      }
      html += `<button class="dice-btn" style="font-size:0.9em;padding:6px 16px;margin-top:4px;" onclick="executeSupportFire()">砲撃実行</button>`;
      html += ` <button class="top-btn" onclick="cancelSupportTarget()">キャンセル</button>`;
    } else {
      html += '<div style="color:var(--pg-accent);font-size:0.9em;">🎯 マップ上のヘクスをクリックして目標を選択</div>';
      html += `<button class="top-btn" onclick="cancelSupportTarget()">キャンセル</button>`;
    }
    html += '</div>';
  }

  // 射撃結果ログ
  if (supportState.fireResults.length > 0) {
    html += '<div style="margin:8px 0;padding:6px;background:var(--pg-green-bg);border:1px solid #4a4;border-radius:4px;max-height:200px;overflow-y:auto;">';
    html += '<div style="color:var(--pg-green);font-weight:bold;font-size:0.85em;margin-bottom:4px;">射撃結果</div>';
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
    if (!canIndirectFire(newUnit) || newUnit.side !== currentSupportSide()) return;
    const selected = supportState.selectedArtillery.map(id => testUnits.find(u => u.name === id));
    if (!canCombineSupport([...selected, newUnit])) {
      alert('協同射撃は同じヘクスか隣接ヘクスの2部隊までです。');
      return;
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
  if (!ob || ob.side !== currentSupportSide() || ob.usedCount >= ob.uses) return;

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
      <span class="fire-detail" id="fireDetail${i}" style="color:var(--pg-muted);font-size:0.85em;">FP${r.fp} 防御${r.def}</span>
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
        detailEl.style.color = 'var(--pg-muted)';
        detailEl.innerHTML = `${statusChange ? '<span style="color:var(--pg-ink);font-size:1.1em;font-weight:bold;">' + statusChange + '</span> ' : ''}FP${r.fp} ${terrainStr} ダイス${r.roll} 損害Lv${dlLabel} 防御${r.def}`;
      }
    });
  }, allDoneTime);

  overlay.classList.add('show');
}

function closeFireOverlay() {
  document.getElementById('fireOverlay').classList.remove('show');
}

// 汎用ダイスオーバーレイ: 画面中央でダイスを回し、結果を表示してコールバック
// rows: [{ label, roll, detail, resultText, resultClass('hit-d','hit-dd','hit-elim','hit-none') }]
// callback: オーバーレイを閉じた後に呼ばれる
function showDiceOverlay(title, subtitle, rows, callback) {
  const overlay = document.getElementById('fireOverlay');
  document.getElementById('fireOverlayTitle').textContent = title;
  document.getElementById('fireOverlayTarget').textContent = subtitle;
  const container = document.getElementById('fireOverlayResults');
  container.innerHTML = '';

  const n = rows.length;
  const diceDelay = n > 1 ? 300 : 0;
  const rollDuration = 800;
  const allDoneTime = n * diceDelay + rollDuration + 200;

  rows.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'fire-row hit-none';
    row.style.animationDelay = `${i * 0.1}s`;
    row.innerHTML = `
      <span class="fire-unit-name">${r.label}</span>
      <span class="fire-dice" id="fireDice${i}">-</span>
      <span class="fire-detail" id="fireDetail${i}" style="color:var(--pg-muted);font-size:0.85em;">${r.detail || ''}</span>
      <span class="fire-damage none" id="fireDmg${i}" style="visibility:hidden;">-</span>
    `;
    container.appendChild(row);

    const startTime = i * diceDelay;
    setTimeout(() => {
      const diceEl = document.getElementById(`fireDice${i}`);
      if (!diceEl) return;
      diceEl.classList.add('rolling');
      const rollInterval = setInterval(() => {
        diceEl.textContent = Math.floor(Math.random() * 10);
      }, 50);
      setTimeout(() => {
        clearInterval(rollInterval);
        diceEl.classList.remove('rolling');
        diceEl.textContent = r.roll;
      }, rollDuration);
    }, startTime);
  });

  setTimeout(() => {
    rows.forEach((r, i) => {
      const rc = r.resultClass || 'hit-none';
      const rowEl = document.querySelectorAll('#fireOverlayResults .fire-row')[i];
      if (rowEl) rowEl.className = `fire-row ${rc}`;

      const dmgEl = document.getElementById(`fireDmg${i}`);
      if (dmgEl) {
        dmgEl.className = `fire-damage ${rc.replace('hit-','')}`;
        dmgEl.textContent = r.resultText || '';
        dmgEl.style.visibility = 'visible';
        dmgEl.style.transform = 'scale(1.5)';
        dmgEl.style.transition = 'transform 0.3s';
        setTimeout(() => { dmgEl.style.transform = 'scale(1)'; }, 200);
      }

      const detailEl = document.getElementById(`fireDetail${i}`);
      if (detailEl && r.detailAfter) {
        detailEl.style.color = 'var(--pg-muted)';
        detailEl.innerHTML = r.detailAfter;
      }
    });
  }, allDoneTime);

  // コールバック付き閉じる
  overlay.classList.add('show');
  const closeEl = overlay.querySelector('.fire-close');
  if (closeEl) {
    closeEl.onclick = function() {
      overlay.classList.remove('show');
      closeEl.onclick = function() { overlay.classList.remove('show'); };
      if (callback) callback();
    };
  }
}

function cancelSupportTarget() {
  supportState.selectedArtillery = [];
  supportState.selectedOffBoard = [];
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
      if (dist > u.range) {
        alert(`${u.name}: 射程外です（最大${u.range}、現在${dist}）`);
        return true;
      }
    }
  }

  const side = currentSupportSide();
  if (supportTargets(hexId, side).length === 0 || !isTargetSpottedByFriendly(hexId, side)) {
    alert('視認できる敵のいるヘクスを選んでください。');
    return true;
  }

  supportState.targetHexId = hexId;
  renderSupportPhase();
  drawMap();
  return true;
}

// §9: 人間もAIも同じ射程・視認・協同射撃・損害判定を使う。
function canIndirectFire(unit) {
  return pgOnMap(unit) && unit.type === 'A' && unit.status === 'ok' &&
    !unit.marchMode && !unit.outOfAmmo && !unit.firedThisTurn;
}

function isInIndirectRange(unit, hex) {
  const target = fromHexId(hex);
  const distance = hexDistance(unit.col, unit.row, target.col, target.row);
  return distance >= 3 && distance <= unit.range;
}

function isTargetSpottedByFriendly(hex, side) {
  if (isDummyProtected(hex) && testUnits.some(u =>
    u.hexId === hex && u.side !== side && u.type === 'dummy' && pgOnMap(u))) return false;
  const target = fromHexId(hex);
  return testUnits.some(u => {
    if (!pgOnMap(u) || u.side !== side || u.status !== 'ok' || !['T', 'AC', 'I', 'A'].includes(u.type)) return false;
    return Boolean(calculateVisionRange(u.col, u.row, G.visionRange)[`${target.col},${target.row}`]);
  });
}

function supportTargets(hex, side) {
  return testUnits.filter(u => pgOnMap(u) && u.hexId === hex && u.side !== side &&
    !['dummy', 'leader', 'ip'].includes(u.type));
}

function canCombineSupport(artillery) {
  return artillery.length <= 2 && (artillery.length < 2 ||
    hexDistance(artillery[0].col, artillery[0].row, artillery[1].col, artillery[1].row) <= 1);
}

function supportRollModifier(hex, unit) {
  const ip = FACILITY_MAP[hex] === 'ip';
  const terrain = ip ? (TERRAIN_MODIFIERS[TERRAIN_MAP[hex]]?.fire ?? 0) - 1 : getTerrainFireMod(hex);
  return terrain + (unit.marchMode ? 2 : 0);
}

function supportFirepower(target, artillery, offBoardPower, offBoardAT) {
  const armored = ['T', 'AC', 'fortification'].includes(target.type);
  return artillery.length
    ? artillery.reduce((fp, u) => fp + (armored ? (u.spAT ?? u.fpAT ?? 0) : (u.spSoft ?? u.fpSoft ?? 0)), 0)
    : Math.max(0, offBoardPower + (armored ? offBoardAT : 0));
}

function resolveSupportAttack(side, hex, artillery, offBoard) {
  const targets = supportTargets(hex, side);
  if (targets.length === 0 || !isTargetSpottedByFriendly(hex, side)) return null;
  if (artillery.length && (offBoard.length || !canCombineSupport(artillery) ||
    artillery.some(u => u.side !== side || !canIndirectFire(u) || !isInIndirectRange(u, hex)))) return null;
  if (offBoard.some(ob => !ob || ob.side !== side || ob.usedCount >= ob.uses) ||
    (offBoard.length > 1 && offBoard.some(ob => !ob.combinable))) return null;
  if (!artillery.length && !offBoard.length) return null;

  const firerName = [...artillery, ...offBoard].map(u => u.name).join('+');
  let offBoardPower = 0;
  let offBoardAT = 0;
  artillery.forEach(u => { u.firedThisTurn = true; });
  offBoard.forEach(ob => {
    const fp = ob.fpMode === 'dice' ? Math.floor(Math.random() * 10) : ob.fp || 0;
    offBoardPower += fp;
    offBoardAT += ob.fpATModifier || 0;
    ob.usedCount++;
    addLog('init', `${ob.name}: FP${fp}、使用${ob.usedCount}/${ob.uses}回`);
  });

  const rows = [];
  const hit = target => {
    const prevStatus = target.status;
    const targetName = target.name;
    const fp = supportFirepower(target, artillery, offBoardPower, offBoardAT);
    const terrainMod = supportRollModifier(hex, target);
    const roll = fp > 0 ? Math.floor(Math.random() * 10) : null;
    const modRoll = roll === null ? null : roll + terrainMod;
    const combat = roll === null ? {damageLevel: 0, isElimination: false} : getFireCombatResult(fp, modRoll);
    const damage = fp > 0 ? resolveDamage(combat.damageLevel, target.def || 0) : 'none';
    applyDamageToUnit(target, damage);
    if (target.type === 'fortification' && target.status === 'eliminated') downgradeFort(target);
    const text = `${firerName} → ${targetName}: FP${fp}、ダイス${roll ?? '—'}、${prevStatus.toUpperCase()} → ${target.status.toUpperCase()}`;
    addLog('init', text);
    supportState.fireResults.push({text, damage});
    rows.push({targetName, roll: roll ?? '—', modRoll, fp, terrainMod, damageLevel: combat.damageLevel,
      isElimination: combat.isElimination, def: target.def || 0, damage, prevStatus, newStatus: target.status});
    return damage;
  };

  const fort = targets.find(u => u.type === 'fortification');
  if (fort) {
    hit(fort); // §17-2: 陣地が残る間は中の部隊に損害なし
    if (fort.status !== 'eliminated') return {firerName, hex, rows};
  }

  let damaged = false;
  for (const target of targets) {
    if (target !== fort && hit(target) !== 'none') damaged = true;
  }
  if (damaged) {
    const defender = side === 'german' ? 'allied' : 'german';
    const result = checkLeaderCasualty(hex, defender);
    if (result) {
      const {leader, roll, wounded} = result;
      rows.push({targetName: leader.name + '【負傷チェック】', roll, fp: 0, terrainMod: 0,
        damageLevel: 0, isElimination: wounded, def: 0, damage: wounded ? 'eliminated' : 'none',
        prevStatus: 'ok', newStatus: leader.status});
    }
    checkLeaderOnStackEliminated(hex, defender);
  }
  return {firerName, hex, rows};
}

function executeSupportFire() {
  const side = currentSupportSide();
  const hex = supportState.targetHexId;
  if (!hex) return;
  const artillery = supportState.selectedArtillery.map(name => testUnits.find(u => u.name === name));
  const offBoard = supportState.selectedOffBoard.map(id => SCENARIO_OFF_BOARD.find(ob => ob.id === id));
  const attack = resolveSupportAttack(side, hex, artillery, offBoard);
  if (!attack) {
    alert('視認・射程・射撃部隊を確認してください。');
    return;
  }
  cancelSupportTarget();
  showFireOverlay('砲撃！', `${attack.firerName} → ${hex}`, attack.rows);
  drawMap();
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

// ===== AI自動支援砲撃 =====
function aiAutoSupportFire(side) {
  const attacks = [];
  const enemyHexes = new Set(testUnits.filter(u => pgOnMap(u) && u.side !== side &&
    !['dummy', 'leader', 'ip'].includes(u.type)).map(u => u.hexId));
  const visible = [...enemyHexes].filter(hex => isTargetSpottedByFriendly(hex, side));
  const artillery = testUnits.filter(u => u.side === side && canIndirectFire(u));
  const offBoard = SCENARIO_OFF_BOARD.filter(ob => ob.side === side && ob.usedCount < ob.uses);
  const groups = artillery.map(unit => ({artillery: [unit], offBoard: []}));
  artillery.forEach((unit, i) => {
    for (const other of artillery.slice(i + 1)) {
      if (canCombineSupport([unit, other])) groups.push({artillery: [unit, other], offBoard: []});
    }
  });
  offBoard.forEach(ob => groups.push({artillery: [], offBoard: [ob]}));

  for (;;) {
    let best = null;
    for (const firing of groups) {
      if (firing.artillery.some(u => !canIndirectFire(u)) ||
          firing.offBoard.some(ob => ob.usedCount >= ob.uses || ob._aiFiredTurn === G.turn)) continue;
      for (const hex of visible) {
        if (firing.artillery.some(u => !isInIndirectRange(u, hex))) continue;
        const targets = supportTargets(hex, side);
        const fort = targets.find(u => u.type === 'fortification');
        const score = (fort ? [fort] : targets).reduce((sum, target) => {
          const fp = supportFirepower(target, firing.artillery,
            firing.offBoard.reduce((n, ob) => n + (ob.fpMode === 'dice' ? 5 : ob.fp || 0), 0),
            firing.offBoard.reduce((n, ob) => n + (ob.fpATModifier || 0), 0));
          if (fp <= 0) return sum;
          const mod = supportRollModifier(hex, target);
          for (let roll = 0; roll < 10; roll++) {
            const {damageLevel} = getFireCombatResult(fp, roll + mod);
            const damage = resolveDamage(damageLevel, target.def || 0);
            sum += damage === 'eliminated' ? 5 : damage === 'dd' ? 3 : damage === 'd' ? 1 : 0;
          }
          return sum;
        }, 0) / (firing.artillery.length || 1);
        if (score > 0 && (!best || score > best.score)) best = {firing, hex, score};
      }
    }
    if (!best) return attacks;
    const {hex, firing} = best;
    const attack = resolveSupportAttack(side, hex, firing.artillery, firing.offBoard);
    if (!attack) {
      visible.splice(visible.indexOf(hex), 1);
      continue;
    }
    firing.offBoard.forEach(ob => { ob._aiFiredTurn = G.turn; });
    attacks.push(attack);
  }
}

function renderAISupportPhase(side) {
  const phase = `${G.turn}:${G.phase}`;
  const first = supportState._aiPhase !== phase;
  if (first) {
    supportState._aiPhase = phase;
    supportState._aiAttacks = aiAutoSupportFire(side);
  }
  const attacks = supportState._aiAttacks;
  document.getElementById('phaseContent').innerHTML = `<div class="phase-info">${attacks.length
    ? 'AIの支援射撃が終了しました。' : 'AIの支援射撃はありません。'}</div>`;
  if (first && attacks.length) {
    showFireOverlay('AI支援射撃', side === 'german' ? 'ドイツ軍' : '連合軍',
      attacks.flatMap(attack => attack.rows.map(row => ({
        ...row, targetName: `${attack.hex} ${row.targetName}`,
      }))));
  }
  drawMap();
}
