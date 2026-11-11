'use strict';
// Kept separate from the rules engine: offline games do not load Firebase.
let dokusoRoom = null, dokusoRoomStatus = '', dokusoRoomError = '', dokusoSeenView = null;
let dokusoConnecting = false, dokusoSdkPromise = null;
let dokusoLobbyRoom = null;
let dokusoOnlineTransition = '';
let dokusoDiceTimer = null;
let dokusoDeferredView = null;
let dokusoAdvanceUndoCount = 0;
function isDokusoOnline() { return !!dokusoRoom?.code; }
function dokusoOnlineReady() {
  return isDokusoOnline() && dokusoRoom.online && !!dokusoRoom.data?.guest &&
    !dokusoRoom.data.closed && dokusoRoom.data.expiresAt.toMillis() > Date.now() &&
    !dokusoRoom.busy && dokusoRoomStatus === 'connected';
}
function dokusoOnlineMyTurn() {
  return !dokusoDeferredView && dokusoOnlineReady() && dokusoRoom.data.actor === dokusoRoom.seat;
}
function dokusoOnlineText(error) {
  const code = error?.message || error?.code || '';
  if (code.includes('permission-denied')) return '接続設定を確認できません。管理者による設定確認が必要です。';
  if (code.includes('quota') || code.includes('resource-exhausted')) return '無料枠の上限に達しました。時間をおいて再接続してください。';
  if (code.includes('operation-not-allowed')) return '接続設定を確認できません。管理者による設定確認が必要です。';
  return ({ code: '部屋番号は8桁の数字で入力してください。', language: 'この部屋は別の言語です。同じ言語を選んで参加してください。',
    full: 'この部屋は満員です。', noRoom: '部屋が見つからないか、有効期限が切れています。',
    version: 'ゲームの版が異なります。ページを更新してください。', stale: '盤面が更新されました。確認して操作し直してください。',
    illegal: 'この操作はできません。盤面を確認して操作し直してください。',
    outOfTurn: '今は操作できません。接続と手番を確認してください。',
    timeout: '相手の応答を待っています。再接続後に盤面を確認してください。',
    size: '保存できる対局データの上限に達しました。',
    disconnected: '接続を終了しました。', disabled: 'オンライン対戦は準備中です。無料プランの確認後に利用できます。',
  })[code] || '通信を確認できません。回線を確認して再接続してください。';
}
function dokusoRoomStatusText() {
  if (dokusoRoomError) return dokusoRoomError;
  if (dokusoRoomStatus === 'closed') return 'この部屋は終了しました。';
  if (dokusoRoom?.data?.expiresAt.toMillis() <= Date.now()) return '部屋が見つからないか、有効期限が切れています。';
  if (game?.phase === 'over') return 'ゲーム終了';
  if (!dokusoRoom?.online) return '接続を確認しています。操作は確定していません。';
  if (!dokusoRoom.data?.guest) return '相手の参加を待っています。部屋番号を相手に伝えてください。';
  if (dokusoDeferredView) return 'ダイス判定中…';
  if (dokusoRoom.busy) return '相手と盤面を同期しています…';
  return dokusoRoom.data.actor === dokusoRoom.seat ? 'あなたの番です' : '相手の操作を待っています。';
}
function dokusoOnlineTask() {
  if (dokusoRoomError) return { title: dokusoRoomError, detail: '' };
  if (game?.phase === 'over') return { title: 'ゲーム終了', detail: '' };
  if (dokusoDeferredView || !dokusoOnlineReady()) return { title: dokusoRoomStatusText(), detail: '' };
  const mine = dokusoOnlineMyTurn(), g = game;
  const title = D.PHASE_NAME[g.phase] + ' ／ ' + (mine ? 'あなたの番です' : '相手の操作を待っています。');
  let detail;
  if (g.pending?.retreat.length) detail = mine ? '紫色のヘクスを選んで退却してください。' : '相手が退却先を選んでいます。';
  else if (g.pending?.advance) detail = mine ? '戦闘後前進を選んでください。終わったら「前進を終える」を押してください。' : '相手が戦闘後前進を選んでいます。';
  else if (g.phase.startsWith('setup')) detail = mine ? '駒を配置し、終わったら「配置完了」を押してください。' : '相手が駒を配置しています。';
  else if (g.phase.endsWith('_move')) detail = mine ? '駒を移動し、終わったら「移動終了」を押してください。' : '相手が駒を移動しています。';
  else if (g.combatFinished()) detail = mine ? '戦闘が終わりました。「戦闘終了」を押してください。' : '相手の「戦闘終了」を待っています。';
  else if (g.combatQueue) {
    const combat = g.peekNext();
    detail = (combat ? `戦闘 ${combat.no} / ${combat.total}（${combat.hex}） ／ ` : '') +
      (mine ? '「戦闘処理を進める」を押してください。' : '相手が戦闘を判定しています。');
  }
  else detail = mine ? `選択中の攻撃部隊（${ui.pick.length}） ／ 宣言済みの攻撃（${g.declared.length}）。` +
    '味方の駒を順にクリックして複数選択し、敵のヘクスをクリックしてください。' + '攻撃を宣言し、決まったら「判定する」を押してください。' : '相手が攻撃を宣言しています。';
  if (mine && g.pending?.advance && !advEligible().length) detail = '前進できる駒がありません。前進を終了してください。';
  if (mine && g.pending?.retreat.length && !g.retreatOptions(g.pending.retreat[0].unit).length) detail = '退却できない駒を除去';
  return { title, detail };
}
function updateDokusoOnlineTask() {
  const task = document.getElementById('dokusoOnlineTask'); task.hidden = !isDokusoOnline();
  if (task.hidden) return;
  const text = dokusoOnlineTask();
  task.classList.toggle('myturn', dokusoOnlineMyTurn());
  document.getElementById('dokusoOnlineTaskTitle').textContent = text.title;
  document.getElementById('dokusoOnlineTaskDetail').textContent = text.detail;
  document.getElementById('dokusoOnlineTransition').textContent = dokusoOnlineTransition;
}
function stopDokusoDiceAnimation() {
  clearTimeout(dokusoDiceTimer); dokusoDiceTimer = null;
  document.getElementById('dokusoOnlineDie').classList.remove('rolling');
}
function showDokusoFinalDie(result) {
  stopDokusoDiceAnimation();
  const die = document.getElementById('dokusoOnlineDie');
  die.textContent = `${DICE[result.die] || ''} ${result.die}`.trim();
  die.setAttribute('aria-label', `ダイス ${result.die}`);
  die.removeAttribute('aria-hidden');
  document.getElementById('dokusoOnlineResultDetail').textContent = `${D.RESULT_NAME[result.result]}（${result.result}）`;
}
function animateDokusoOnlineDie(result, revealBoard) {
  const die = document.getElementById('dokusoOnlineDie');
  const finish = () => {
    showDokusoFinalDie(result);
    dokusoDiceTimer = setTimeout(revealBoard, 250);
  };
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
  document.getElementById('dokusoOnlineResultDetail').textContent = 'ダイス判定中…';
  die.setAttribute('aria-hidden', 'true');
  die.classList.add('rolling');
  const finishAt = performance.now() + 585;
  const frame = () => {
    const remaining = finishAt - performance.now();
    if (remaining <= 0) { finish(); return; }
    const face = 1 + Math.floor(Math.random() * 6);
    die.textContent = `${DICE[face]} ${face}`;
    dokusoDiceTimer = setTimeout(frame, Math.min(65, remaining));
  };
  frame();
}
function showDokusoOnlineResult(result) {
  const box = document.getElementById('dokusoOnlineResult'); box.hidden = false;
  document.getElementById('dokusoOnlineResultSummary').textContent = `${result.hex} ／ ${SIDE[result.side]} 攻撃 ${result.att} 対 防御 ${result.def} ／ 比 ${result.odds.replace(':', '対')}`;
  document.getElementById('dokusoOnlineParticipantsLabel').textContent = `攻撃に参加（${result.attackers.length}）`;
  const participants = document.getElementById('dokusoOnlineParticipants'); participants.replaceChildren();
  for (const id of result.attackers) {
    const unit = game.unit(id); if (!unit) continue;
    const counter = document.createElement('img');
    counter.src = encodeURI(unitImg(unit)); counter.alt = game.unitName(unit);
    counter.title = game.unitName(unit) + (unit.label ? ' ' + unit.label : ''); participants.appendChild(counter);
  }
}
function showDokusoOnlinePhase(previous, previousTurn) {
  dokusoOnlineTransition = `${D.PHASE_NAME[previous]}：終了 → ${D.PHASE_NAME[game.phase]}`;
  updateDokusoOnlineTask();
  const el = document.getElementById('phaseBanner');
  el.className = dokusoOnlineMyTurn() ? 'human' : 'ai';
  const line = previousTurn !== game.turn ? `ターン ${previousTurn} → ${game.turn}<br>` : '';
  el.innerHTML = `<div class="t1">${line}${D.PHASE_NAME[previous]}：終了</div><div class="t2">${D.PHASE_NAME[game.phase]}</div><div class="t3">${dokusoOnlineTask().title}</div>`;
  el.style.opacity = '1'; el.style.display = 'block';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(hideBanner, 4000);
}
async function copyDokusoRoomNumber(inputId, statusId) {
  const input = document.getElementById(inputId), status = document.getElementById(statusId);
  if (!input?.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    status.textContent = 'コピーしました';
  } catch {
    input.focus(); input.select();
    status.textContent = '番号を選択しました。⌘CまたはCtrl+Cでコピーしてください。';
  }
}
function showDokusoLobby() {
  const box = document.getElementById('modalBox'); box.replaceChildren();
  box.dataset.onlineLobbyCode = dokusoRoom.code;
  const heading = document.createElement('h2'); heading.textContent = '部屋を作りました';
  const guide = document.createElement('p'); guide.textContent = 'この部屋番号を相手に伝えてください。';
  const group = document.createElement('div'); group.className = 'dokuso-lobby-code';
  const label = document.createElement('label'); label.htmlFor = 'dokusoLobbyCode'; label.textContent = '部屋番号';
  const number = document.createElement('input'); number.id = 'dokusoLobbyCode'; number.className = 'dokuso-room-code';
  number.readOnly = true; number.value = dokusoRoom.code; number.onclick = () => number.select();
  const copy = document.createElement('button'); copy.textContent = '番号をコピー';
  copy.onclick = () => void copyDokusoRoomNumber('dokusoLobbyCode', 'dokusoLobbyCopyStatus');
  const copied = document.createElement('p'); copied.id = 'dokusoLobbyCopyStatus'; copied.className = 'dokuso-code-status'; copied.setAttribute('role', 'status');
  group.append(label, number, copy, copied);
  const status = document.createElement('p'); status.id = 'dokusoLobbyStatus'; status.setAttribute('role', 'status');
  status.textContent = dokusoRoomStatusText();
  const map = document.createElement('button'); map.textContent = '地図を見る';
  map.onclick = () => { delete box.dataset.onlineLobbyCode; document.getElementById('modal').style.display = 'none'; };
  box.append(heading, guide, group, status, map);
  document.getElementById('modal').style.display = 'flex';
}
function updateDokusoRoomDisplay() {
  const bar = document.getElementById('dokusoRoomBar');
  bar.hidden = !isDokusoOnline() || !!dokusoRoom.data?.guest;
  if (!isDokusoOnline()) return;
  const number = document.getElementById('dokusoRoomNumber');
  if (number.value !== dokusoRoom.code) {
    number.value = dokusoRoom.code;
    document.getElementById('dokusoRoomCopyStatus').textContent = '';
  }
  const box = document.getElementById('modalBox');
  if (dokusoRoom.data?.guest) {
    // Only dismiss our waiting screen; never dismiss help or the room menu.
    if (box.dataset.onlineLobbyCode === dokusoRoom.code) {
      delete box.dataset.onlineLobbyCode;
      document.getElementById('modal').style.display = 'none';
    }
  } else if (dokusoSeenView !== null && dokusoRoom.seat === 'sov' && !dokusoRoom.data?.closed && dokusoLobbyRoom !== dokusoRoom.code) {
    dokusoLobbyRoom = dokusoRoom.code;
    showDokusoLobby();
  }
  const status = document.getElementById('dokusoLobbyStatus');
  if (status) status.textContent = dokusoRoomStatusText();
}
async function dokusoFirebase() {
  const config = window.DOKUSO_ONLINE_CONFIG;
  if (!config?.enabled || !config.firebase?.projectId) throw new Error('disabled');
  if (!dokusoSdkPromise) dokusoSdkPromise = (async () => {
    for (const part of ['app', 'auth', 'firestore']) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.gstatic.com/firebasejs/10.8.0/firebase-${part}-compat.js`;
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    const app = firebase.initializeApp(config.firebase, 'dokuso-room');
    const auth = app.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const user = auth.currentUser || (await auth.signInAnonymously()).user;
    return { db: app.firestore(), uid: user.uid };
  })().catch(error => { dokusoSdkPromise = null; throw error; });
  return dokusoSdkPromise;
}
function showDokusoOnline() {
  if (!window.DOKUSO_ONLINE_CONFIG?.enabled) return;
  if (isDokusoOnline()) { document.getElementById('modal').style.display = 'none'; return; }
  const box = document.getElementById('modalBox');
  box.innerHTML = `<h2>オンライン対戦</h2><p>部屋を作った人がソ連、参加した人がドイツです。</p>
    <p>同じ言語で参加してください。部屋の有効期限は作成から48時間です。再接続には同じブラウザを使ってください。</p>
    <button id="dokusoCreate">部屋を作る</button>
    <label>部屋番号 <input id="dokusoCode" inputmode="numeric" autocomplete="off" maxlength="8" pattern="[0-9]{8}" aria-label="部屋番号"></label>
    <button id="dokusoJoin">部屋に入る・再接続</button>
    <p id="dokusoConnectStatus" role="status"></p><button id="dokusoBack">戻る</button>`;
  try { document.getElementById('dokusoCode').value = localStorage.getItem('dokusoRoomNumber') || ''; } catch {}
  document.getElementById('dokusoCreate').onclick = () => void dokusoConnect(true);
  document.getElementById('dokusoJoin').onclick = () => void dokusoConnect(false);
  document.getElementById('dokusoBack').onclick = () => { if (!dokusoConnecting) showStart(); };
  document.getElementById('modal').style.display = 'flex';
}
async function dokusoConnect(create) {
  if (dokusoConnecting) return;
  const code = document.getElementById('dokusoCode').value;
  if (!create && !DOKUSO_ROOM.CODE.test(code.trim())) {
    document.getElementById('dokusoConnectStatus').textContent = dokusoOnlineText(new Error('code')); return;
  }
  dokusoConnecting = true;
  for (const id of ['dokusoCreate', 'dokusoJoin', 'dokusoBack']) document.getElementById(id).disabled = true;
  document.getElementById('dokusoConnectStatus').textContent = '接続を確認しています…';
  try {
    const connection = await dokusoFirebase();
    dokusoRoomError = ''; dokusoSeenView = null;
    dokusoRoom = new DOKUSO_ROOM.RoomClient({ ...connection, D, md: MD, images: DOKUSO_UNIT_IMAGES, core: DOKUSO_NET_CORE,
      onView: dokusoReceiveView,
      onStatus(status, error) {
        dokusoRoomStatus = status;
        dokusoRoomError = error ? dokusoOnlineText(error) : '';
        if (isDokusoOnline() && game) dokusoOnlineDrive();
      },
    });
    if (create) await dokusoRoom.create(dokusoLanguage, firebase.firestore.Timestamp);
    else await dokusoRoom.join(code, dokusoLanguage);
    try { localStorage.setItem('dokusoRoomNumber', dokusoRoom.code); } catch {}
  } catch (error) {
    if (!dokusoRoom?.code) dokusoRoom = null;
    document.getElementById('dokusoConnectStatus').textContent = dokusoOnlineText(error);
  } finally {
    dokusoConnecting = false;
    for (const id of ['dokusoCreate', 'dokusoJoin', 'dokusoBack']) {
      const button = document.getElementById(id); if (button) button.disabled = false;
    }
  }
}
function dokusoRemoteFocus(previous, next, seat, previousResult, nextResult) {
  if (!previous || previous.phase.startsWith('setup') || DOKUSO_NET_CORE.actor(previous) === seat) return null;
  // The opponent can move, retreat or advance; an overrun can remove our units.
  // Compare confirmed snapshots, so metadata notifications cannot repeat a pan.
  if (nextResult && JSON.stringify(previousResult) !== JSON.stringify(nextResult)) return nextResult.hex;
  for (const unit of next.units) {
    const before = previous.unit(unit.id);
    if (before && (before.hex !== unit.hex || before.alive !== unit.alive)) return unit.hex || before.hex;
  }
  const declared = next.declared.find(d => !previous.declared.some(p => p.hex === d.hex));
  return declared?.hex || null;
}
function dokusoReceiveView(data, seat) {
  if (dokusoDeferredView) {
    dokusoDeferredView.next = { data, seat };
    return;
  }
  if (dokusoSeenView === data.public) { dokusoOnlineDrive(); return; }
  const room = DOKUSO_NET_CORE.unpack(D, MD, DOKUSO_UNIT_IMAGES, data.public);
  const first = dokusoSeenView === null;
  const result = room.result && (first || JSON.stringify(ui.lastResult) !== JSON.stringify(room.result)) ? room.result : null;
  if (!result || first) {
    dokusoApplyView(data, seat, room, result);
    return;
  }

  // Keep the previous board, log and controls on screen until the die is shown.
  const deferred = { next: null };
  dokusoDeferredView = deferred;
  ui.hex = result.hex;
  ui.fanHex = null;
  showDokusoOnlineResult(result);
  dokusoOnlineDrive();
  scrollToHex(result.hex);
  animateDokusoOnlineDie(result, () => {
    dokusoDeferredView = null;
    dokusoDiceTimer = null;
    dokusoApplyView(data, seat, room, result, true);
    if (deferred.next) dokusoReceiveView(deferred.next.data, deferred.next.seat);
  });
}
function dokusoApplyView(data, seat, room, result, resultAlreadyShown = false) {
  const first = dokusoSeenView === null;
  const phaseChanged = game?.phase !== room.game.phase;
  const transition = !first && phaseChanged ? { phase: game.phase, turn: game.turn } : null;
  let focus = null;
  let restoredAdvance = [];
  if (!first) focus = dokusoRemoteFocus(game, room.game, seat, ui.lastResult, room.result);
  const currentCombat = room.game.peekNext();
  if (currentCombat && (first || !game.combatQueue || game.pending || game.combatQueue[0] !== room.game.combatQueue[0])) focus = currentCombat.hex;
  if (!first && game.pending?.advance && room.game.pending?.advance && room.advanceUndoCount < dokusoAdvanceUndoCount) {
    restoredAdvance = room.game.pending.advance.units.filter(id => game.unit(id).hex !== room.game.unit(id).hex);
    if (restoredAdvance.length) focus = room.game.unit(restoredAdvance[0]).hex;
  }
  if (result) focus = resultAlreadyShown ? null : result.hex;
  const retreatId = room.game.pending?.retreat[0]?.unit;
  if (retreatId && (first || retreatId !== game.pending?.retreat[0]?.unit)) {
    focus = room.game.unit(retreatId).hex;
  }

  dokusoSeenView = data.public;
  if (first) installGame(room.game);
  else { game = room.game; runToken++; hideCombatCard(); if (phaseChanged) hideBanner(); }
  trails = room.trails;
  if (phaseChanged) Object.assign(ui, INITIAL_UI, { hex: null, moveSel: [], pick: [] });
  if (ui.setupSel && game.unit(ui.setupSel)?.hex) ui.setupSel = null;
  ui.pick = ui.pick.filter(id => !game.usedAttackers().has(id));
  ui.lastResult = room.result;
  dokusoAdvanceUndoCount = room.advanceUndoCount;
  if (restoredAdvance.length && game.combatSide() === seat) ui.adv = { sel: restoredAdvance, review: false };
  if (phaseChanged && !resultAlreadyShown) {
    stopDokusoDiceAnimation();
    document.getElementById('dokusoOnlineResult').hidden = true;
  }
  ui.msg = '';
  if (focus) { ui.hex = focus; ui.fanHex = null; ui.moveSel = []; ui.pick = []; }
  renderLog();
  ctrl = { sov: seat === 'sov' ? 'human' : 'remote', ger: seat === 'ger' ? 'human' : 'remote' };
  document.getElementById('saveFileBtn').disabled = true;
  document.getElementById('loadFileBtn').disabled = true;
  languageSelect.disabled = true; // A room keeps its creation language.
  document.getElementById('dokusoRoomMenu').hidden = false;
  dokusoOnlineDrive();
  if (transition) showDokusoOnlinePhase(transition.phase, transition.turn);
  if (result && !resultAlreadyShown) {
    showDokusoOnlineResult(result);
    showDokusoFinalDie(result);
  }
  if (focus) scrollToHex(focus);
}
function dokusoOnlineDrive() {
  if (!game || !isDokusoOnline()) return;
  // Keep the chosen stack through the busy interval and incoming snapshots.
  // Clearing it here reselects a different attacker's stack after the first hex.
  const previousAdvance = ui.adv;
  ui.mode = null;
  ui.retreatUnit = dokusoDeferredView ? null : (game.pending?.retreat[0]?.unit ?? null);
  ui.adv = game.pending?.advance && game.combatSide() === dokusoRoom.seat
    ? (previousAdvance || { sel: [], review: false }) : null;
  if (dokusoOnlineMyTurn()) {
    if (ui.retreatUnit) {
      ui.mode = 'retreat';
    } else if (game.pending?.advance) {
      ui.mode = 'advance';
      ui.adv.sel = ui.adv.sel.filter(id => game.advanceTargets(id).length);
      if (!ui.adv.sel.length) selectAdvanceGroup();
    }
  }
  render();
  document.getElementById('saveStatus').textContent = `部屋番号: ${dokusoRoom.code} ／ ${SIDE[dokusoRoom.seat]} ／ ${dokusoRoomStatusText()}`;
  updateDokusoRoomDisplay();
  updateDokusoOnlineTask();
}
async function dokusoOnlineSend(name, args = []) {
  if (!dokusoOnlineMyTurn()) return false;
  dokusoRoomError = '';
  const promise = dokusoRoom.send(name, args);
  dokusoOnlineDrive();
  try { await promise; return true; }
  catch (error) { dokusoRoomError = dokusoOnlineText(error); return false; }
  finally { dokusoOnlineDrive(); }
}
async function dokusoFinishAdvanceAndNext() {
  if (!await dokusoOnlineSend('endAdvance')) return;
  if (!game.pending && game.combatQueue?.length) await dokusoOnlineSend('resolveNext');
}
function drawDokusoAdvanceChoices() {
  const groups = new Map();
  for (const u of advEligible()) {
    if (!groups.has(u.hex)) groups.set(u.hex, []);
    groups.get(u.hex).push(u);
  }
  if (!groups.size) return;
  const box = document.createElement('div');
  box.className = 'dokuso-advance-choices';
  for (const [hex, units] of groups) {
    const button = document.createElement('button');
    button.textContent = `${hex}: ${units.map(u => game.unitName(u)).join('、')}`;
    button.classList.toggle('go', units.every(u => ui.adv.sel.includes(u.id)));
    button.onclick = () => {
      ui.adv.sel = units.map(u => u.id); ui.hex = hex; ui.fanHex = null;
      render(); scrollToHex(hex);
    };
    box.appendChild(button);
  }
  P.appendChild(box);
}
function drawDokusoOnlineActions() {
  updateDokusoOnlineTask();
  const box = document.getElementById('actBtns');
  box.replaceChildren();
  document.getElementById('actionMsg').textContent = dokusoRoomStatusText();
  if (!dokusoOnlineMyTurn()) return;
  const action = (label, name, args = [], disabled = false) => {
    const button = document.createElement('button'); button.textContent = label;
    button.disabled = disabled;
    button.onclick = () => name === 'endAdvanceNext' ? void dokusoFinishAdvanceAndNext() : void dokusoOnlineSend(name, args);
    box.appendChild(button);
  };
  if (game.phase.startsWith('setup')) {
    action('お任せ配置', 'setupAuto'); action('すべて取り外す', 'setupClear');
    action('配置完了', 'finishSetup', [], !game.setupDone(dokusoRoom.seat));
  } else if (ui.mode === 'retreat') {
    if (!game.retreatOptions(ui.retreatUnit).length) action('退却できない駒を除去', 'applyRetreat', [ui.retreatUnit, null]);
  } else if (ui.mode === 'advance') {
    action('前進を1手戻す', 'undo', [], !dokusoAdvanceUndoCount);
    if (game.combatQueue?.length) action('前進を終えて戦闘処理を進める', 'endAdvanceNext');
    else action('前進を終える', 'endAdvance');
  }
  else if (game.combatFinished()) action('戦闘終了', 'endPhase');
  else if (game.combatQueue && !game.combatFinished()) action('戦闘処理を進める', 'resolveNext');
  else if (game.combatSide() && !game.combatQueue) action('判定する', 'startResolve', [], !game.declared.length);
  else if (game.phase === 'ger_move') {
    const u = overrunUnit();
    if (u) for (const h of game.overrunTargets(u)) action(`オーバーラン（${h}）`, 'overrun', [u.id, h]);
  }
}
function drawDokusoOnlinePanel() {
  P = document.getElementById('panel'); P.innerHTML = '';
  add(`<h2>${D.PHASE_NAME[game.phase]}</h2>`);
  step(dokusoRoomStatusText(), dokusoOnlineMyTurn() ? 'big' : '');
  if (game.phase === 'over') scoreBox();
  else if (dokusoOnlineMyTurn()) {
    if (ui.mode === 'retreat') retreatPanel();
    else if (ui.mode === 'advance') { advancePanel(); drawDokusoAdvanceChoices(); }
    else if (game.phase.startsWith('setup')) setupPanel(dokusoRoom.seat);
    else if (game.phase.endsWith('_move')) movePanel(dokusoRoom.seat);
    else if (!game.combatQueue) combatPanel(dokusoRoom.seat);
  }
  hexInspector();
}
function dokusoLeaveRoom() {
  dokusoRoom?.detach(); dokusoRoom = null; dokusoSeenView = null;
  game = null; runToken++; hideCombatCard(); hideBanner();
  languageSelect.disabled = false;
  document.getElementById('dokusoRoomMenu').hidden = true;
  document.getElementById('loadFileBtn').disabled = false;
  document.getElementById('saveStatus').textContent = '';
  dokusoLobbyRoom = null;
  dokusoOnlineTransition = '';
  dokusoAdvanceUndoCount = 0;
  dokusoDeferredView = null;
  stopDokusoDiceAnimation();
  document.getElementById('dokusoOnlineResult').hidden = true;
  document.getElementById('dokusoOnlineTask').hidden = true;
  delete document.getElementById('modalBox').dataset.onlineLobbyCode;
  updateDokusoRoomDisplay();
  showStart();
}
function showDokusoRoomMenu() {
  if (!isDokusoOnline()) return;
  const box = document.getElementById('modalBox'); box.replaceChildren();
  const heading = document.createElement('h2'); heading.textContent = 'オンライン対戦'; box.appendChild(heading);
  const status = document.createElement('p'); status.textContent = `部屋番号: ${dokusoRoom.code} ／ ${dokusoRoomStatusText()}`; box.appendChild(status);
  const action = (label, fn) => { const button = document.createElement('button'); button.textContent = label; button.onclick = fn; box.appendChild(button); };
  action('再接続', () => {
    const { code, seat } = dokusoRoom;
    dokusoRoomError = ''; dokusoRoom.attach(code, seat);
    document.getElementById('modal').style.display = 'none';
  });
  action('この端末で退出', dokusoLeaveRoom);
  if (dokusoRoom.seat === 'sov' && !dokusoRoom.data?.closed) action('部屋を閉じる', async () => {
    try { await dokusoRoom.close(); dokusoLeaveRoom(); }
    catch (error) { status.textContent = dokusoOnlineText(error); }
  });
  action('戻る', () => { document.getElementById('modal').style.display = 'none'; });
  document.getElementById('modal').style.display = 'flex';
}
