// ===== イニシアチブ・フェイズ (phase_initiative.js) =====
// 依存: G, PHASES, INIT_CHART, addLog, updatePhaseBar, nextPhase

const INIT_CHART = [
  ['a','a','a','a','a','a','a','a','a','a','g'],
  ['a','a','a','a','a','a','a','a','a','g','g'],
  ['a','a','a','a','a','a','a','a','g','g','g'],
  ['a','a','a','a','a','a','a','g','g','g','g'],
  ['a','a','a','a','a','a','g','g','g','g','g'],
  ['a','a','a','a','a','g','g','g','g','g','g'],
  ['a','a','a','a','g','g','g','g','g','g','g'],
  ['a','a','a','g','g','g','g','g','g','g','g'],
  ['a','a','g','g','g','g','g','g','g','g','g'],
  ['a','g','g','g','g','g','g','g','g','g','g'],
];

function renderInitiativePhase() {
  const c = document.getElementById('phaseContent');
  let html = '';

  // マーカー位置バー
  html += '<div id="markerRow">';
  for (let i = 0; i <= 10; i++) {
    const cls = i === G.markerPos ? 'slot current' : 'slot';
    const label = i === 0 ? 'A' : i === 10 ? 'G' : i;
    html += `<div class="${cls}">${label}</div>`;
  }
  html += '</div>';

  // チャート表
  html += '<div id="initChart"><table>';
  html += '<tr><th>D10</th>';
  for (let col = 0; col <= 10; col++) {
    html += `<th>${col}</th>`;
  }
  html += '</tr>';
  for (let row = 0; row <= 9; row++) {
    html += `<tr><th>${row}</th>`;
    for (let col = 0; col <= 10; col++) {
      const v = INIT_CHART[row][col];
      let cls = v;
      if (col === G.markerPos) cls += ' marker';
      html += `<td class="${cls}">${v.toUpperCase()}</td>`;
    }
    html += '</tr>';
  }
  html += '</table></div>';

  // ダイス
  html += '<div id="diceArea">';
  html += '<div id="diceResult">-</div><br>';
  html += `<button class="dice-btn" id="rollBtn" onclick="rollInitiative()" ${G.diceRolled ? 'disabled' : ''}>ダイスを振る (D10)</button>`;
  html += '</div>';

  // 結果
  html += '<div id="initResult"></div>';

  // 説明
  html += '<div class="phase-info">';
  html += `マーカー位置: ${G.markerPos}<br>`;
  html += 'ダイスを振ってイニシアチブを決定します。<br>';
  html += '結果に応じてマーカーが移動します。';
  html += '</div>';

  c.innerHTML = html;

  if (G.diceRolled && G.initiative) {
    showInitResult();
  }
}

function rollInitiative() {
  const btn = document.getElementById('rollBtn');
  const disp = document.getElementById('diceResult');
  btn.disabled = true;
  disp.classList.add('rolling');
  document.getElementById('rightPanel').scrollTop = 0;
  disp.scrollIntoView({ behavior:'smooth', block:'center' });

  let count = 0;
  const interval = setInterval(() => {
    disp.textContent = Math.floor(Math.random() * 10);
    count++;
    if (count > 12) {
      clearInterval(interval);
      const result = Math.floor(Math.random() * 10);
      disp.textContent = result;
      disp.classList.remove('rolling');
      resolveInitiative(result);
    }
  }, 60);
}

function resolveInitiative(dieRoll) {
  const col = G.markerPos;
  const winner = INIT_CHART[dieRoll][col];

  G.initiative = winner === 'g' ? 'german' : 'allied';
  G.diceRolled = true;

  // マーカー移動
  if (G.initiative === 'german') {
    G.markerPos = Math.max(0, G.markerPos - G.markerShift);
  } else {
    G.markerPos = Math.min(10, G.markerPos + G.markerShift);
  }

  // 天候変化（18-2）
  const prevVision = G.visionRange;
  let weatherShift = 0;
  if (dieRoll === 0) weatherShift = -2;
  else if (dieRoll <= 2) weatherShift = -1;
  else if (dieRoll <= 6) weatherShift = 0;
  else if (dieRoll <= 8) weatherShift = +1;
  else weatherShift = +2;
  G.visionRange = Math.max(1, prevVision + weatherShift);

  const shiftStr = weatherShift > 0 ? `+${weatherShift}` : weatherShift === 0 ? '±0' : `${weatherShift}`;
  addLog('init', `ダイス: ${dieRoll} → ${G.initiative === 'german' ? 'ドイツ軍' : '連合軍'}がイニシアチブ獲得 (M${G.markerPos}) 視認${prevVision}→${G.visionRange}(${shiftStr})`);

  showDiceOverlay(dieRoll);
  updatePhaseBar();
}

function showDiceOverlay(dieRoll) {
  const overlay = document.getElementById('diceOverlay');
  const die = document.getElementById('overlayDie');
  const result = document.getElementById('overlayResult');
  const isG = G.initiative === 'german';
  die.textContent = dieRoll;
  result.className = 'big-result ' + (isG ? 'german' : 'allied');
  result.textContent = (isG ? 'ドイツ軍' : '連合軍') + ' がイニシアチブ獲得！';
  overlay.classList.add('show');
  // AI同士なら自動で閉じる
  if (G.gameMode === 'aivai') {
    setTimeout(() => closeDiceOverlay(), 1500);
  }
}

function closeDiceOverlay() {
  document.getElementById('diceOverlay').classList.remove('show');
  renderInitiativePhase();
  // AI同士なら自動で次のフェイズへ
  if (G.gameMode === 'aivai') {
    setTimeout(() => { nextPhase(); setTimeout(() => runAIvAILoop(), 500); }, 500);
  }
}

function showInitResult() {
  const r = document.getElementById('initResult');
  if (!r) return;
  r.style.display = 'block';
  const isG = G.initiative === 'german';
  r.className = isG ? 'german' : 'allied';
  r.textContent = `${isG ? 'ドイツ軍' : '連合軍'}がイニシアチブを獲得！`;
}
