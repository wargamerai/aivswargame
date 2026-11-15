// WebRTC sends commands to the host. Only the host runs the game and rolls dice.
let pgOnlineRole = null;
let pgOnlineSeat = null;
let pgOnlinePeer = null;
let pgOnlineChannel = null;
let pgOnlineApplying = false;
let pgOnlineView = null;
let pgOnlinePending = 0;
let pgOnlineRequest = 0;
let pgOnlineAck = 0;
let pgOnlineNotice = '';

const pgOnlineRoots = ['phaseContent', 'diceOverlay', 'fireOverlay', 'gameOverOverlay'];
const pgOnlineCommands = new Map();
const pgOnlineCommandIds = new WeakMap();
let pgOnlineCommandNumber = 0;
const pgOtherSide = side => side === 'german' ? 'allied' : 'german';
const pgSideName = side => side === 'german' ? 'ドイツ軍' : '連合軍';
const pgOnlineConnected = () => pgOnlineChannel?.readyState === 'open';

function pgOnlineActor() {
  const phase = PHASES[G.phase]?.id;
  if (G.turn > G.maxTurn) return pgOnlineSeat;
  if (phase === 'initiative' || phase === 'recovery' || !G.initiative) return pgOnlineSeat;
  if (phase === 'supportDef') return pgOtherSide(G.initiative);
  if (phase === 'moveFire' || phase === 'defMove') {
    if (reinforcementState.phaseSide) return reinforcementState.phaseSide;
    if (_fireFlowState?.canEvade) return _fireFlowState.target.side;
    if (_fireFlowState?.shooters?.length) return _fireFlowState.shooters[0].side;
    if (moveState._waitingCounterAttack) return moveState.movingUnit.side;
    if (moveState.stopFirePending) return pgOtherSide(moveState.movingUnit.side);
    if (directFireState.mode === 'counterAttack') return directFireState.defenderSide;
    if (phase === 'defMove') return pgOtherSide(G.initiative);
  }
  if (phase === 'assault') {
    if (assaultState._retreatSide === 'def' || assaultState.phase === 'defenderChoice') return pgOtherSide(G.initiative);
  }
  return G.initiative;
}

function pgOnlineActiveOverlay() {
  return [...pgOnlineRoots].reverse().slice(0, 3)
    .map(id => document.getElementById(id))
    .find(el => el.classList.contains('show') || el.style.display === 'flex');
}

function pgOnlineMayAdvance() {
  if (pgOnlineRole !== 'host' || !pgOnlineConnected() ||
      (!pgOnlineApplying && pgOnlineActor() !== pgOnlineSeat)) return false;
  if (pgOnlineActiveOverlay() || reinforcementState.phaseSide ||
      _fireFlowState || moveState.stopFirePending || _pendingReconState ||
      directFireState.mode === 'counterAttack' || assaultState.pendingResult) return false;
  return PHASES[G.phase]?.id !== 'turnEnd';
}

function pgOnlineHidden(unit, side) {
  return unit.side !== side && unit.type !== 'dummy' && isDummyProtected(unit.hexId);
}

function pgOnlineStatus(actor, connected, notice = '') {
  const box = document.getElementById('pgOnlineStatus');
  box.hidden = false;
  box.textContent = notice || (!connected ? '接続を待っています' :
    actor === pgOnlineSeat ? `${pgSideName(pgOnlineSeat)}・あなたの操作` :
    `${pgSideName(pgOnlineSeat)}・相手の操作を待っています`);
  box.style.color = connected && actor === pgOnlineSeat ? 'var(--pg-green)' : 'var(--pg-ink)';
  document.getElementById('nextPhaseBtn').disabled = !connected || actor !== pgOnlineSeat;
}

function pgOnlineClean(node) {
  const allowed = new Set(['SECTION', 'DIV', 'SPAN', 'B', 'STRONG', 'SMALL', 'BR', 'H3', 'H4',
    'BUTTON', 'LABEL', 'INPUT', 'SELECT', 'OPTION', 'IMG', 'P', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'UL', 'LI', 'EM']);
  for (const child of node.querySelectorAll('*')) {
    if (!allowed.has(child.tagName)) {
      child.remove();
      continue;
    }
    for (const attr of [...child.attributes]) {
      if (['class', 'style', 'type', 'value', 'checked', 'disabled', 'selected', 'alt', 'aria-pressed', 'data-pg-command'].includes(attr.name)) continue;
      if (attr.name === 'src' && child.tagName === 'IMG' && /^images\/(?!.*\.\.)[^\\?#]+$/u.test(attr.value)) continue;
      child.removeAttribute(attr.name);
    }
    if (child.tagName === 'INPUT' && !['checkbox', 'radio'].includes(child.type)) child.remove();
  }
}

function pgOnlinePanel(root, enable, overlay = false) {
  const copy = root.cloneNode(true);
  const elements = [...root.querySelectorAll('*')];
  const copies = [...copy.querySelectorAll('*')];
  elements.forEach((el, i) => {
    if (!el.onclick && !el.onchange &&
        !el.matches('button,input,select')) return;
    if (el.disabled || el.getAttribute('onclick')?.includes('addTestUnit')) {
      copies[i].disabled = true;
      copies[i].setAttribute('style', 'display:none');
      return;
    }
    if (!enable) return;
    let id = pgOnlineCommandIds.get(el);
    if (!id) {
      id = ++pgOnlineCommandNumber;
      pgOnlineCommandIds.set(el, id);
    }
    pgOnlineCommands.set(id, el);
    copies[i].setAttribute('data-pg-command', id);
  });
  if (overlay && root.id === 'diceOverlay' && enable) {
    const button = document.createElement('button');
    button.textContent = '閉じる';
    button.dataset.pgCommand = 'closeDice';
    copy.appendChild(button);
  }
  if (overlay && root.id === 'gameOverOverlay') {
    const button = document.createElement('button');
    button.textContent = '閉じる';
    button.dataset.pgCommand = 'closeGameOver';
    copy.appendChild(button);
  }
  pgOnlineClean(copy);
  return copy.innerHTML;
}

function pgOnlineBoard(guest) {
  const onMap = testUnits.filter(u => pgOnMap(u) && !pgOnlineHidden(u, guest));
  return onMap.map(u => ({
    id: u.id, name: u.name, type: u.type, side: u.side, nation: u.nation,
    x: u.x, y: u.y, col: u.col, row: u.row, hexId: u.hexId, src: u.src,
    status: u.status, marchMode: u.marchMode, outOfAmmo: u.outOfAmmo, abilities: u.abilities,
    pgMovementOrder: u.side === guest ? u.pgMovementOrder : undefined,
  }));
}

function pgOnlineSnapshot() {
  if (!pgOnlineConnected() || !canvas.dataset.loaded) return;
  const actor = pgOnlineActor();
  const guest = pgOtherSide(pgOnlineSeat);
  const enable = actor === guest;
  const active = pgOnlineActiveOverlay();
  pgOnlineCommands.clear();
  const state = {
    actor, ack: pgOnlineAck, notice: pgOnlineNotice,
    game: { turn: G.turn, phase: G.phase, initiative: G.initiative, markerPos: G.markerPos,
      visionRange: G.visionRange, breakthroughCount: G.breakthroughCount },
    units: pgOnlineBoard(guest),
    panel: enable ? pgOnlinePanel(document.getElementById('phaseContent'), true) : '',
    overlay: active ? { id: active.id, html: pgOnlinePanel(active, enable, true) } : null,
    markers: {
      target: supportState.targetHexId, artillery: enable ? supportState.selectedArtillery : [],
      entry: enable ? reinforcementState.entryHexes : [],
      orderDraft: enable && pgOrderDraft ? { id: pgOrderDraft.unit.id, target: pgOrderDraft.target } : null,
      moving: enable ? moveState.movingUnit?.id : null,
      reachable: enable ? Object.keys(moveState.validHexes || {}) : [],
      path: moveState.path, retreat: enable ? assaultState._validRetreats : null,
      selected: enable ? directFireState.selectedHexId : null,
      shooters: directFireState.shooters.map(u => u.id), arrow: fireArrowData,
    },
    advance: !active && !reinforcementState.phaseSide && !_fireFlowState &&
      !moveState.movingUnit && !_pendingReconState && directFireState.mode !== 'counterAttack' &&
      !assaultState.pendingResult && PHASES[G.phase]?.id !== 'turnEnd' &&
      (PHASES[G.phase]?.id !== 'initiative' || G.diceRolled),
  };
  pgOnlineStatus(actor, true);
  document.getElementById('phaseContent').style.visibility = enable ? 'hidden' : '';
  document.getElementById('nextPhaseBtn').disabled = enable || !state.advance;
  const payload = JSON.stringify(state);
  if (payload !== pgOnlineLastSnapshot && pgOnlineChannel.bufferedAmount < 150000) {
    pgOnlineSend({kind: 'view', state});
    pgOnlineLastSnapshot = payload;
  }
}
let pgOnlineLastSnapshot = '';

const pgOnlineImages = new Map();
function pgOnlineUseView(state) {
  if (!canvas.dataset.loaded) { pgOnlineView = state; return; }
  pgOnlineView = state;
  if (state.ack >= pgOnlinePending) pgOnlinePending = 0;
  Object.assign(G, state.game);
  testUnits.splice(0, testUnits.length, ...state.units.map(u => {
    if (!/^images\/(?!.*\.\.)[^\\?#]+$/u.test(u.src || '')) return u;
    if (!pgOnlineImages.has(u.src)) {
      const img = new Image();
      img.onload = () => {
        testUnits.forEach(unit => { if (unit.src === u.src) unit.img = img; });
        drawMap();
      };
      img.src = u.src;
      pgOnlineImages.set(u.src, img);
    }
    const img = pgOnlineImages.get(u.src);
    return {...u, img: img.complete && img.naturalWidth ? img : null};
  }));
  supportState.targetHexId = state.markers.target;
  supportState.selectedArtillery = state.markers.artillery;
  reinforcementState.entryHexes = state.markers.entry;
  const draft = state.markers.orderDraft;
  const draftUnit = draft && testUnits.find(u => u.id === draft.id);
  pgOrderDraft = draftUnit ? { unit: draftUnit, target: draft.target } : null;
  moveState.movingUnit = testUnits.find(u => u.id === state.markers.moving) || null;
  moveState.validHexes = Object.fromEntries(state.markers.reachable.map(hex => [hex, true]));
  moveState.path = state.markers.path || [];
  assaultState._validRetreats = state.markers.retreat;
  directFireState.selectedHexId = state.markers.selected;
  directFireState.shooters = testUnits.filter(u => state.markers.shooters.includes(u.id));
  fireArrowData = state.markers.arrow;
  const own = state.actor === pgOnlineSeat;
  const panels = document.getElementById('phaseContent');
  panels.style.visibility = '';
  pgOnlineApplyHtml(panels, own ? state.panel : '<div class="phase-info">相手の操作を待っています。</div>');
  for (const id of pgOnlineRoots.slice(1)) {
    const el = document.getElementById(id);
    const active = state.overlay?.id === id;
    el.classList.toggle('show', active);
    el.style.display = active ? 'flex' : 'none';
    if (active) pgOnlineApplyHtml(el, state.overlay.html);
  }
  pgOnlineStatus(state.actor, true, state.notice);
  document.getElementById('nextPhaseBtn').disabled = !own || !state.advance;
  document.getElementById('breakthroughScore').textContent = SCENARIO.victory.breakthroughTarget
    ? `突破: ${G.breakthroughCount} / ${SCENARIO.victory.breakthroughTarget}` : '';
  updatePhaseBar();
  drawMap();
}

function pgOnlineApplyHtml(target, html) {
  if (target._pgOnlineHtml === html) return;
  target._pgOnlineHtml = html;
  const template = document.createElement('template');
  template.innerHTML = html;
  pgOnlineClean(template.content);
  target.replaceChildren(template.content);
}

function pgOnlineSend(message) {
  const text = JSON.stringify(message);
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(text.length, offset + 8000);
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    pgOnlineChannel.send((end === text.length ? '1' : '0') + text.slice(offset, end));
    offset = end;
  }
}

function pgOnlineAct(action, value) {
  if (!pgOnlineConnected() || pgOnlinePending || pgOnlineView?.actor !== pgOnlineSeat) return;
  pgOnlinePending = ++pgOnlineRequest;
  pgOnlineSend({kind: 'action', request: pgOnlineRequest, action, value});
}

function pgOnlineRunAction(message) {
  if (!Number.isSafeInteger(message.request) || message.request !== pgOnlineAck + 1) return;
  pgOnlineAck = message.request;
  pgOnlineNotice = '';
  const guest = pgOtherSide(pgOnlineSeat);
  if (pgOnlineActor() !== guest || !canvas.dataset.loaded) { pgOnlineSnapshot(); return; }

  pgOnlineApplying = true;
  const nativeAlert = window.alert;
  window.alert = message => { pgOnlineNotice = String(message); };
  try {
    const overlay = pgOnlineActiveOverlay();
    if (message.action === 'map' && !overlay) {
      const {x, y, cmd} = message.value || {};
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const {col, row} = getNearestHex(x, y);
        if (col >= 0 && col < MAP_CONFIG.cols && row >= 0 && row < MAP_CONFIG.rows) {
          G.playerSide = guest;
          onMapPoint(x, y, {ctrlKey: cmd === true});
        }
      }
    } else if (message.action === 'next' && !overlay) {
      nextPhase();
    } else if (message.action === 'closeDice' && overlay?.id === 'diceOverlay') {
      closeDiceOverlay();
    } else {
      const el = pgOnlineCommands.get(message.action);
      const scope = overlay || document.getElementById('phaseContent');
      if (el && scope.contains(el) && !el.disabled) {
        if (el.matches('select') && [...el.options].some(option => option.value === message.value)) {
          el.value = message.value;
          el.dispatchEvent(new Event('change', {bubbles: true}));
        } else if (!el.matches('select')) {
          el.click();
        }
      }
    }
  } catch (error) {
    console.error(error);
    pgOnlineNotice = '操作を処理できませんでした。';
  } finally {
    window.alert = nativeAlert;
    G.playerSide = pgOnlineSeat;
    pgOnlineApplying = false;
  }
  drawMap();
  pgOnlineSnapshot();
}

function pgOnlineMapClick(x, y, e) {
  if (e.altKey || e.button === 2) return false;
  if (pgOnlineRole === 'guest') {
    if (!losMode && !losCheckMode) pgOnlineAct('map', {x, y, cmd: e.ctrlKey || e.metaKey});
    return !losMode && !losCheckMode;
  }
  return !pgOnlineConnected() || pgOnlineActor() !== pgOnlineSeat;
}

function pgOnlineControls(event) {
  if (pgOnlineApplying) return;
  const target = event.target.closest?.('button,input,select,[onclick],[data-pg-command]');
  const root = pgOnlineRoots.find(id => document.getElementById(id).contains(event.target));
  const next = target?.id === 'nextPhaseBtn';
  if (!root && !next) return;
  if (pgOnlineRole === 'host' && pgOnlineConnected() &&
      (root === 'gameOverOverlay' || pgOnlineActor() === pgOnlineSeat) &&
      !target?.getAttribute('onclick')?.includes('addTestUnit')) return;
  if (pgOnlineRole === 'guest' && target?.dataset.pgCommand === 'closeGameOver') {
    document.getElementById('gameOverOverlay').style.display = 'none';
    return;
  }
  if (pgOnlineRole === 'guest' && event.type === 'click' && target?.matches('select')) return;
  const command = target?.dataset.pgCommand;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (pgOnlineRole !== 'guest') return;
  if (next) pgOnlineAct('next');
  else if (command) pgOnlineAct(/^\d+$/.test(command) ? Number(command) : command, target.value);
}

function pgOnlineBindChannel(channel, lobby) {
  pgOnlineChannel = channel;
  let chunks = '';
  let refresh;
  channel.onmessage = event => {
    if (typeof event.data !== 'string') return;
    chunks += event.data.slice(1);
    if (chunks.length > 1000000) { chunks = ''; channel.close(); return; }
    if (event.data[0] !== '1') return;
    let message;
    try { message = JSON.parse(chunks); } catch { chunks = ''; return; }
    chunks = '';
    if (pgOnlineRole === 'guest' && message.kind === 'view') pgOnlineUseView(message.state);
    if (pgOnlineRole === 'host' && message.kind === 'action') pgOnlineRunAction(message);
  };
  channel.onopen = () => {
    lobby.remove();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    document.addEventListener('click', pgOnlineControls, true);
    document.addEventListener('change', pgOnlineControls, true);
    G.playerSide = pgOnlineSeat;
    document.getElementById('btnAIStep').hidden = true;
    pgOnlineStatus(null, true);
    initGame();
    refresh = setInterval(() => {
      if (pgOnlineRole === 'host') pgOnlineSnapshot();
      else if (pgOnlineView && canvas.dataset.loaded && !pgOnlineLastSnapshot) {
        pgOnlineLastSnapshot = 'loaded';
        pgOnlineUseView(pgOnlineView);
      }
    }, 180);
  };
  channel.onclose = () => {
    clearInterval(refresh);
    pgOnlineStatus(null, false, '切断されました。対戦を中断しています。');
  };
}

function pgOnlineCode(data) {
  return btoa(JSON.stringify(data)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function pgOnlineReadCode(code, type) {
  if (!/^[A-Za-z0-9_-]{1,28000}$/.test(code)) throw new Error('コードを確認してください。');
  const result = JSON.parse(atob(code.replaceAll('-', '+').replaceAll('_', '/')));
  if (result.version !== 1 || result.scenario !== SCENARIO.id ||
      !['german', 'allied'].includes(result.host) || result.description?.type !== type ||
      typeof result.description.sdp !== 'string') throw new Error('招待コード・シナリオが一致しません。');
  return result;
}

async function pgOnlineLocalDescription(description) {
  await pgOnlinePeer.setLocalDescription(description);
  if (pgOnlinePeer.iceGatheringState !== 'complete') {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pgOnlinePeer.removeEventListener('icegatheringstatechange', done);
        reject(new Error('接続情報を取得できませんでした。時間をおいて再試行してください。'));
      }, 15000);
      function done() {
        if (pgOnlinePeer.iceGatheringState !== 'complete') return;
        clearTimeout(timer);
        pgOnlinePeer.removeEventListener('icegatheringstatechange', done);
        resolve();
      }
      pgOnlinePeer.addEventListener('icegatheringstatechange', done);
      done();
    });
  }
  return pgOnlinePeer.localDescription.toJSON();
}

function pgOnlineLobby() {
  const lobby = document.createElement('section');
  lobby.id = 'pgOnlineLobby';
  lobby.style.cssText = 'position:fixed;inset:0;z-index:12000;background:var(--pg-panel);display:grid;place-items:center;padding:16px;overflow:auto;color:#f5f1df';
  const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
  lobby.innerHTML = `<div style="width:min(600px,100%);background:var(--pg-blue-bg);border:1px solid #637683;border-radius:10px;padding:24px">
    <h2 style="margin-top:0">オンライン対戦</h2>
    <p>シナリオ ${SCENARIO.id}　${SCENARIO.name}</p>
    <p id="pgConnectionHelp">${invite ? '応答コードを作り、招待した人に送ってください。' : '陣営を選び、招待リンクを相手に送ってください。'}</p>
    <label id="pgHostLabel" ${invite ? 'hidden' : ''}>自軍 <select id="pgHostSide"><option value="german">ドイツ軍</option><option value="allied">連合軍</option></select></label>
    <button id="pgConnectionStart" class="dice-btn">${invite ? '応答コードを作る' : '招待リンクを作る'}</button>
    <label id="pgConnectionOutputLabel" hidden style="display:none;margin-top:12px"><span></span>
      <textarea id="pgConnectionOutput" rows="3" readonly style="display:block;width:100%"></textarea>
      <button id="pgConnectionCopy" class="top-btn">コピー</button></label>
    <label id="pgAnswerLabel" hidden style="display:none;margin-top:12px">相手から届いた応答コード
      <textarea id="pgAnswer" rows="3" style="display:block;width:100%"></textarea>
      <button id="pgFinishConnection" class="dice-btn">対戦を始める</button></label>
    <p id="pgConnectionMessage" role="status"></p><a href="title.html" style="color:var(--pg-blue)">シナリオ選択に戻る</a>
    </div>`;
  document.body.appendChild(lobby);
  const q = id => lobby.querySelector('#' + id);
  const output = q('pgConnectionOutput');
  const showOutput = (label, value) => {
    const field = q('pgConnectionOutputLabel');
    field.querySelector('span').textContent = label;
    field.hidden = false;
    field.style.display = 'block';
    output.value = value;
  };
  q('pgConnectionCopy').onclick = async () => {
    output.select();
    try { await navigator.clipboard.writeText(output.value); }
    catch { document.execCommand('copy'); }
  };
  const message = q('pgConnectionMessage');
  q('pgConnectionStart').onclick = async () => {
    const start = q('pgConnectionStart');
    start.disabled = true;
    message.textContent = '接続情報を作成しています…';
    try {
      pgOnlinePeer?.close();
      pgOnlinePeer = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
      pgOnlinePeer.onconnectionstatechange = () => {
        if (pgOnlinePeer.connectionState === 'failed') message.textContent = '接続できませんでした。双方のネットワークを確認してやり直してください。';
      };
      if (invite) {
        const offer = pgOnlineReadCode(invite, 'offer');
        pgOnlineRole = 'guest';
        pgOnlineSeat = pgOtherSide(offer.host);
        pgOnlinePeer.ondatachannel = event => pgOnlineBindChannel(event.channel, lobby);
        await pgOnlinePeer.setRemoteDescription(offer.description);
        const description = await pgOnlineLocalDescription(await pgOnlinePeer.createAnswer());
        showOutput('応答コード', pgOnlineCode({version: 1, scenario: SCENARIO.id, host: offer.host, description}));
        message.textContent = `${pgSideName(pgOnlineSeat)}で参加します。接続を待っています。`;
      } else {
        pgOnlineRole = 'host';
        pgOnlineSeat = q('pgHostSide').value;
        pgOnlineBindChannel(pgOnlinePeer.createDataChannel('pg-game'), lobby);
        const description = await pgOnlineLocalDescription(await pgOnlinePeer.createOffer());
        const url = new URL(location.href);
        url.searchParams.set('mode', 'online');
        url.searchParams.set('scenario', SCENARIO.id);
        url.hash = 'invite=' + pgOnlineCode({version: 1, scenario: SCENARIO.id, host: pgOnlineSeat, description});
        showOutput('招待リンク', url.href);
        q('pgAnswerLabel').hidden = false;
        q('pgAnswerLabel').style.display = 'block';
        message.textContent = '招待リンクを送り、相手の応答コードを待ってください。';
      }
    } catch (error) {
      message.textContent = error.message;
      start.disabled = false;
    }
  };
  q('pgFinishConnection').onclick = async () => {
    const button = q('pgFinishConnection');
    button.disabled = true;
    try {
      const answer = pgOnlineReadCode(q('pgAnswer').value.trim(), 'answer');
      if (answer.host !== pgOnlineSeat) throw new Error('今回の招待に対する応答コードを入力してください。');
      await pgOnlinePeer.setRemoteDescription(answer.description);
      message.textContent = '接続を待っています…';
    } catch (error) {
      message.textContent = error.message;
      button.disabled = false;
    }
  };
}
