// ===== 回復フェイズ (phase_recovery.js) =====
// 依存: G, units, addLog, isOverstacked, hasLeaderMoraleBonus, renderRecoveryPhase

// 回復結果を保存
const recoveryResults = {};

// 回復可能かどうかの判定
function canAttemptRecovery(unit) {
  if (unit.status === 'ok' || unit.status === 'eliminated') return { can: false, reason: '回復不要/除去済み' };
  if (unit.type === 'fortification') return { can: false, reason: '陣地は回復不可' };
  if (isOverstacked(unit.hexId)) return { can: false, reason: 'スタック超過（上限4個）' };
  if (unit.adjacentEnemy) return { can: false, reason: '敵ユニットに隣接' };
  if (unit.inEnemyRange && !unit.inCover) return { can: false, reason: '敵射程内（遮蔽なし）' };
  return { can: true, reason: '' };
}

// 有効モラルレベル計算
function getEffectiveMorale(unit) {
  let ml = unit.morale;
  if (!unit.inEnemyRange && unit.inCover) ml += 1;
  if (hasLeaderMoraleBonus(unit)) ml += 1;
  return ml;
}

// 回復ダイスロール実行
function resolveRecovery(unit) {
  const roll = Math.floor(Math.random() * 10);
  const effectiveMorale = getEffectiveMorale(unit);
  let result;

  if (roll === 0) {
    if (unit.status === 'd') {
      unit.status = 'dd';
      result = { roll, success: false, effect: 'D → DD（悪化）', critical: true };
    } else if (unit.status === 'dd') {
      unit.status = 'eliminated';
      result = { roll, success: false, effect: 'DD → 壊滅！', critical: true };
    }
  } else if (roll <= effectiveMorale) {
    if (unit.status === 'dd') {
      unit.status = 'd';
      result = { roll, success: true, effect: 'DD → D（回復）', critical: false };
    } else if (unit.status === 'd') {
      unit.status = 'ok';
      result = { roll, success: true, effect: 'D → 正常（回復）', critical: false };
    }
  } else {
    result = { roll, success: false, effect: '変化なし', critical: false };
  }

  return { ...result, effectiveMorale };
}

function renderRecoveryPhase() {
  const c = document.getElementById('phaseContent');
  const attacker = G.initiative;
  const defender = attacker === 'german' ? 'allied' : 'german';
  const sideNames = { german: 'ドイツ軍', allied: '連合軍' };

  const sides = [attacker, defender];

  let html = '<div class="phase-info">D/DDユニットの回復を試みます。先攻（' + sideNames[attacker] + '）が先。</div>';
  html += '<div style="display:flex;gap:4px;margin:4px 0;">';
  html += '<button class="recovery-all-btn" style="font-size:0.75em;padding:3px 8px;" onclick="addTestUnit(\'german\')">+ドイツ軍</button>';
  html += '<button class="recovery-all-btn" style="font-size:0.75em;padding:3px 8px;" onclick="addTestUnit(\'allied\')">+連合軍</button>';
  html += '</div>';

  sides.forEach(side => {
    const sideUnits = units.filter(u => u.side === side && u.status !== 'eliminated');
    const needsRecovery = sideUnits.filter(u => u.status === 'd' || u.status === 'dd');
    const otherUnits = sideUnits.filter(u => u.status === 'ok');

    html += `<div class="recovery-section">`;
    html += `<h3>${sideNames[side]}（${needsRecovery.length}ユニット要回復）</h3>`;

    if (needsRecovery.length === 0) {
      html += '<div style="color:#888;font-size:0.8em;padding:4px;">回復が必要なユニットなし</div>';
    } else {
      const allDone = needsRecovery.every(u => recoveryResults[u.id]);
      html += `<button class="recovery-all-btn" onclick="rollAllRecovery('${side}')" ${allDone ? 'disabled' : ''}>全ユニット一括ロール</button>`;

      needsRecovery.forEach(u => {
        const check = canAttemptRecovery(u);
        const done = recoveryResults[u.id];
        const em = getEffectiveMorale(u);

        html += `<div class="recovery-unit">`;
        html += `<span class="u-name">${u.name}</span>`;
        html += `<span class="u-status ${u.status}">${u.status.toUpperCase()}</span>`;
        html += `<span class="u-morale">M${u.morale}`;
        if (em !== u.morale) html += `→${em}`;
        html += `</span>`;

        if (!check.can) {
          html += `<span class="u-blocked">✕ ${check.reason}</span>`;
        } else if (done) {
          const cls = done.critical ? 'critical' : done.success ? 'success' : 'fail';
          html += `<span class="u-result ${cls}">D10:${done.roll} ${done.effect}</span>`;
        } else {
          html += `<button onclick="rollSingleRecovery('${u.id}')">ロール</button>`;
        }
        html += `</div>`;
      });
    }

    if (otherUnits.length > 0) {
      html += `<div style="color:#666;font-size:0.75em;margin-top:4px;">${otherUnits.length}ユニット正常</div>`;
    }
    html += `</div>`;
  });

  c.innerHTML = html;
}

function rollSingleRecovery(unitId) {
  const unit = units.find(u => u.id === unitId);
  if (!unit) return;
  const check = canAttemptRecovery(unit);
  if (!check.can) return;

  const result = resolveRecovery(unit);
  recoveryResults[unit.id] = result;

  const sideStr = unit.side === 'german' ? 'ドイツ' : '連合';
  addLog('init', `[回復] ${sideStr} ${unit.name}: D10=${result.roll} (有効M${result.effectiveMorale}) → ${result.effect}`);

  const rc = result.critical ? 'hit-elim' : result.success ? 'hit-d' : 'hit-none';
  showDiceOverlay('回復チェック', unit.name, [{
    label: unit.name,
    roll: result.roll,
    detail: `M${result.effectiveMorale} ${unit.status === 'ok' ? '' : unit.status.toUpperCase()}`,
    resultText: result.effect,
    resultClass: rc,
  }], function() {
    renderRecoveryPhase();
  });
}

function rollAllRecovery(side) {
  const targetUnits = units.filter(u => u.side === side && (u.status === 'd' || u.status === 'dd') && !recoveryResults[u.id]);

  const overlayRows = [];
  targetUnits.forEach(u => {
    const check = canAttemptRecovery(u);
    if (!check.can) return;

    const result = resolveRecovery(u);
    recoveryResults[u.id] = result;

    const sideStr = u.side === 'german' ? 'ドイツ' : '連合';
    addLog('init', `[回復] ${sideStr} ${u.name}: D10=${result.roll} (有効M${result.effectiveMorale}) → ${result.effect}`);

    const rc = result.critical ? 'hit-elim' : result.success ? 'hit-d' : 'hit-none';
    overlayRows.push({
      label: u.name,
      roll: result.roll,
      detail: `M${result.effectiveMorale}`,
      resultText: result.effect,
      resultClass: rc,
    });
  });

  if (overlayRows.length > 0) {
    showDiceOverlay('回復チェック', side === 'german' ? 'ドイツ軍' : '連合軍', overlayRows, function() {
      renderRecoveryPhase();
    });
  } else {
    renderRecoveryPhase();
  }
}
