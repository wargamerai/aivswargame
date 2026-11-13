'use strict';

(() => {
  const R = BulgeRules, D = BulgeData, AI = BulgeAI;
  const byId = id => document.getElementById(id);
  const storageKey = 'bulge-allied-ai-v1';
  const query = new URLSearchParams(window.location.search);
  const practiceMode = query.get('practice');
  const battlePractice = practiceMode === 'battle';
  const supplyPractice = practiceMode === 'supply';
  const reentryPractice = practiceMode === 'reentry';
  const recoveryPractice = practiceMode === 'recovery';
  const supportPractice = practiceMode === 'support';
  const eventPractice = practiceMode === 'event';
  const adminPractice = supplyPractice || reentryPractice || recoveryPractice || supportPractice || eventPractice;
  const practice = battlePractice || adminPractice;
  const reentrySamples = {german: ['g3', 'g6'], allied: ['a18', 'a56']};
  const recoverySamples = {german: ['g3', 'g6', 'g7', 'g8'], allied: ['a18', 'a56', 'a57', 'a61']};
  const supportPracticePoints = 6;
  const practiceScenarios = [
    {target:'2410', attackers:['g3','g7'], label:'対戦車火力と戦闘後前進'},
    {target:'2510', attackers:['g6'], label:'河川・工兵と砲兵'},
    {target:'2308', attackers:['g8'], label:'尾根と損害を変えるチット'},
  ];
  const supportChitType = 'application/x-bulge-support-chit';
  const eventChitType = 'application/x-bulge-event-chit';
  const reinforcementType = 'application/x-bulge-reinforcement';
  const unitCounterSize = 43;
  const chitsByImage = new Map(Object.entries(D.chits).map(([id, chit]) => [`assets/marker-${chit.image}.jpg`, id]));
  const moving = () => ['move', 'reaction', 'highbeam'].includes(state.phase);
  const planning = () => ['attack', 'counter'].includes(state.phase);
  const isLocal = () => state.mode === 'local';
  const isAI = () => !isLocal() && !eventPractice && R.actor(state) === 'allied';
  const hasPendingEvent = () => !supportPractice && ['event', 'reinforce'].includes(state.phase) && state.events.length > 0;
  const assigningSupport = () => ['setup', 'support'].includes(state.phase);
  const reviewingAlliedSupport = () => state.phase === 'support' && !adminPractice && isAI() && state.supportConfirmed;
  const draftingReinforcements = () => state.phase === 'reinforce' && isAI() && !state.events.length;
  const waitingReinforcements = board => board.units.filter(unit => unit.side === R.actor(board) &&
    unit.status === 'reserve' && board.reinforceGroups.includes(unit.group));
  const eventChits = side => Object.keys(D.chits)
    .filter(id => id.startsWith(side[0] + '-') && D.chits[id].kind === 'event').map(id => id + ':1');
  const nameOf = id => R.unitById(state, id)?.name ?? id;
  const location = hex => D.cities[hex] ? `${hex} ${D.cities[hex]}` : hex;
  const point = hex => {
    const {x, y} = R.map.get(hex);
    return `${x},${y}`;
  };

  let state = adminPractice ? practiceAdministration() : battlePractice ? practiceBattle() : load();
  let practiceEvent = 'all';
  let practiceEventSide = 'german';
  let movePlan, attackPlan, reinforcementPlan, pausedReservations, selected, inspected, moveSupport;
  let moveRepair = false;
  let peiperDraft = false;
  let editingSetupBridge = false;
  let orderDraft = null;
  const movementOrderName = type => type === 'hold' ? '死守命令' : '移動予約';
  let recoveryOrders = [];
  let reentryHex = null;
  let reentryNotice = '';
  let mapInspection = null;
  let countersHidden = false;
  let reviewedAttack, diceAnimating = false;
  let announcedPhase, announcementTimer;
  let overviewUnit = null;
  let detailSource = null;
  let attackers, attackEdit, supportChoices, artilleryDie, card, eventEffect, message;
  let eventDraft = null;
  function proposeEvent(id) {
    eventDraft = null;
    if (!isAI() || !hasPendingEvent()) return;
    const proposal = AI.administration(id ? {...state, events: [id]} : state);
    if (proposal?.type !== 'event') return;
    card = proposal.chit;
    eventDraft = proposal.hex ?? null;
    eventEffect = eventDraft && R.chit(card).event === 'air' &&
      R.at(state, eventDraft).some(unit => unit.side === 'german' && !unit.marker && unit.disrupted) ? 'pile' : 'disrupt';
  }
  let preferDefenderLoss = false;
  let projection, range, legalHexes;
  const polygons = new Map();

  function useAssistedMode(board) {
    const units = board.units.map(unit => {
      if (unit.side !== 'german' || !unit.movementOrder) return unit;
      const revised = {...unit};
      delete revised.movementOrder;
      return revised;
    });
    const control = {...board.control};
    control['2319'] ??= R.at(board, '2319')[0]?.side ?? 'allied';
    return {...board, units, control, mode: 'ai'};
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved?.version === 1 && Array.isArray(saved.units) && Object.hasOwn(R.phaseNames, saved.phase))
        return useAssistedMode(saved);
    } catch { /* A fresh game also works when browser storage is disabled. */ }
    return null;
  }

  function fresh(mode) {
    const seed = new Uint32Array(1);
    crypto.getRandomValues(seed);
    return R.create(seed[0], mode);
  }

  function practiceBattle() {
    const board = fresh();
    const placement = [
      ['g3', '2409', ['g-panther:1', 'g-arty:1']],
      ['g7', '2509', ['g-panther:2']],
      ['a18', '2410', ['a-destroyer:1']],
      ['g6', '2610', ['g-engineer:1', 'g-tank:1', 'g-arty:2']],
      ['a57', '2510', ['a-arty:1', 'a-star:1', 'a-tank:1']],
      ['g8', '2307', ['g-tiger:1', 'g-arty:3', 'g-cross:1']],
      ['a56', '2308', ['a-nuts:1', 'a-tank:2']],
    ];
    board.units = placement.map(([id, hex, support]) => {
      const unit = R.unitById(board, id);
      board.cups[unit.side] = board.cups[unit.side].filter(chit => !support.includes(chit));
      return {...unit, hex, support, usedSupport: [], disrupted: id === 'a18'};
    });
    board.phase = 'attack';
    board.bridges = {};
    board.hand = [];
    board.log = [{turn: 1, text: '練習戦闘3件。右パネルから先に解決する戦闘を選べます。'}];
    const attacks = practiceScenarios.map(({target, attackers}) => ({target, attackers}));
    const result = R.apply(board, {type: 'attacks', side: 'german', attacks});
    if (!result.ok) throw Error(result.error);
    return result.state;
  }

  function practiceEvents(side, choice) {
    const board = fresh();
    board.turn = 4;
    board.turnSide = side;
    board.phase = 'event';
    board.groups.allied = 1;
    board.supplySelection = side === 'allied' ? 4 : 6;
    board.units = board.units.filter(unit => !unit.marker);
    board.bridges = {};
    board.hand = [];
    board.setupOrders = [];
    for (const unit of board.units) unit.support = [];
    const placement = [
      ['g3', '2005', false, ['g-tiger:1', 'g-arty:1']],
      ['g6', '1907', true, ['g-panther:1']],
      ['g7', '1809', false, ['g-flak:1']],
      ['g8', '1712', true, ['g-tank:1']],
      ['g10', '2112', false, ['g-halftrack:1']],
      ['g46', '2009', false], ['g48', '2016', true], ['g49', '2210', true], ['g90', '2007', false],
      ['a18', '1808', false, ['a-destroyer:1']],
      ['a21', '2309', true, ['a-arty:1']],
      ['a56', '1803', false], ['a57', '1716', false, ['a-fort:1']],
      ['a61', '1817', true], ['a96', '2003', false], ['a135', '2206', true],
      ['a17', '1910', true, ['a-tank:1']], ['a19', '1710', true, ['a-ration:1']],
      ['a53', '1708', false], ['a54', '1615', true], ['a55', '1606', false], ['a93', '1806', false],
      ['a14', '1609', false], ['a59', '1413', true],
    ];
    for (const [id, hex, disrupted, support = []] of placement) {
      const unit = R.unitById(board, id);
      Object.assign(unit, {hex, disrupted, support, status: 'map'});
      if (R.city(hex)) board.control[hex] = unit.side;
    }
    board.events = choice === 'all' ? eventChits(side) : [choice === 'grounded' ? 'a-air:1' : choice];
    if (choice === 'grounded') {
      board.flags.groundedFrom = board.turn;
      board.flags.groundedUntil = board.turn + 1;
    }
    if (board.events.includes('g-capture:1')) board.captureHold = ['g-tank:2', 'g-engineer:1'];
    const used = new Set([...board.events, ...board.captureHold, ...board.units.flatMap(unit => unit.support)]);
    for (const faction of ['german', 'allied']) {
      board.cups[faction] = Object.entries(D.chits)
        .filter(([id]) => id.startsWith(faction[0] + '-'))
        .flatMap(([id, chit]) => Array.from({length: chit.count}, (_, index) => `${id}:${index + 1}`))
        .filter(id => !used.has(id));
    }
    board.log = [{turn: board.turn, text: 'イベント練習用の盤面。ドイツ軍が西進し、両軍に通常・混乱の部隊がいます。'}];
    return board;
  }

  function practiceAdministration(side = 'german', event = 'all') {
    if (eventPractice) return practiceEvents(side, event);
    const board = fresh();
    board.turn = reentryPractice ? 3 : 2;
    board.turnSide = side;
    board.phase = reentryPractice ? 'reentry' : (recoveryPractice || supportPractice) ? 'recovery' : 'supply';
    if (supportPractice) board.cups.german.push(...board.hand.filter(id => R.chit(id).kind !== 'dummy'));
    board.hand = [];
    board.setupOrders = [];
    if (supportPractice) {
      board.supplyPoints = supportPracticePoints;
      board.log = [{turn: board.turn, text: `混乱回復後の補給ポイントが ${supportPracticePoints} 残っています。`}];
      const result = R.apply(board, {type: 'next', side});
      if (!result.ok) throw Error(result.error);
      return result.state;
    }
    if (reentryPractice) {
      for (const [index, id] of reentrySamples[side].entries()) {
        const unit = R.unitById(board, id);
        board.cups[side].push(...unit.support);
        Object.assign(unit, {hex: null, status: 'removed', returnTurn: board.turn + index,
          support: [], usedSupport: [], disrupted: true, fortified: null});
      }
    }
    if (recoveryPractice) {
      board.supplyPoints = 11;
      for (const id of recoverySamples[side]) R.unitById(board, id).disrupted = true;
    }
    board.log = [{turn: board.turn, text: `${R.sideName(side)}の${R.phaseNames[board.phase]}を試します。`}];
    return board;
  }

  function save() {
    if (practice) return;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { /* Play can continue in memory. */ }
  }

  function saveGameFile() {
    const data = {format: 'bulge-ai-save', version: 1, state, movePlan, attackPlan, supportChoices, artilleryDie,
      reinforcementPlan, recoveryOrders, preferDefenderLoss, pausedReservations: [...pausedReservations]};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], {type: 'application/json'}));
    const link = element('a');
    link.href = url;
    link.download = `bulge-turn-${state.turn}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    note('対局ファイルを保存しました。');
  }

  async function loadGameFile(input) {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    let saved;
    try {
      saved = JSON.parse(await file.text());
      let board = saved?.state;
      if (saved?.format !== 'bulge-ai-save' || saved.version !== 1 ||
          board?.version !== 1 || !Object.hasOwn(R.phaseNames, board.phase) ||
          !Number.isInteger(board.turn) || !['german', 'allied'].includes(board.turnSide) ||
          !Array.isArray(board.units) || !Array.isArray(board.log) || !Array.isArray(board.hand) ||
          !Array.isArray(board.events) || !board.flags || !board.cups || !board.bridges ||
          !Array.isArray(saved.movePlan) || !Array.isArray(saved.attackPlan)) throw Error('Invalid save');
      saved.state = board = useAssistedMode(board);
      if (board.units.some(unit => unit.movementOrder &&
          (!unit.hex || unit.marker || !unit.movement || !['reserve', 'hold'].includes(unit.movementOrder.type) ||
           !R.canOrderDestination(board, unit, unit.movementOrder.target)))) throw Error('Invalid movement reservation');
      const paused = saved.pausedReservations ?? [];
      if (!Array.isArray(paused) || paused.some(id => board.phase !== 'move' ||
          R.unitById(board, id)?.side !== R.actor(board) || !R.unitById(board, id)?.movementOrder))
        throw Error('Invalid paused reservations');
      if (['move', 'reaction', 'highbeam'].includes(board.phase) &&
          R.previewMoves(board, saved.movePlan, new Set(paused)).rejected.length)
        throw Error('Invalid movement orders');
      if (['attack', 'counter'].includes(board.phase) && !R.validateAttacks(board, saved.attackPlan))
        throw Error('Invalid attack orders');
      const reinforcements = saved.reinforcementPlan ?? [];
      if (!Array.isArray(reinforcements) || (reinforcements.length && (board.phase !== 'reinforce' ||
          R.previewReinforcements({...board, events: []}, reinforcements).rejected.length)))
        throw Error('Invalid reinforcement placements');
      const recoveries = saved.recoveryOrders ?? [];
      if (!Array.isArray(recoveries) || (recoveries.length &&
          !R.apply(board, {type: 'recover-batch', side: R.actor(board), units: recoveries}).ok))
        throw Error('Invalid recovery orders');
      if (board.phase === 'resolve') {
        if (!R.battleInfo(board)) throw Error('Missing battle');
        if (!board.combat.revealed && !board.combat.openSupport)
          R.combatProfile(board, saved.supportChoices ?? {});
      }
    } catch {
      const error = 'バルジの対局ファイルを読み込めませんでした。';
      if (!byId('start-dialog').open) return note(error, true);
      byId('start-error').textContent = error;
      byId('start-error').hidden = false;
      return;
    }
    state = saved.state;
    announcedPhase = null;
    if (byId('start-dialog').open) byId('start-dialog').close();
    document.querySelector('.game').hidden = false;
    const phase = state.phase;
    prepare();
    let rejectedMoves = 0;
    if (state.phase === phase) {
      if (moving() && (saved.movePlan.length || saved.pausedReservations?.length || !isAI())) {
        pausedReservations = new Set(saved.pausedReservations ?? []);
        const checked = R.previewMoves(state, saved.movePlan, pausedReservations);
        movePlan = checked.valid;
        rejectedMoves = checked.rejected.length;
      }
      if (planning() && (saved.attackPlan.length || !isAI())) attackPlan = saved.attackPlan;
      if (state.phase === 'reinforce' && isAI() && Array.isArray(saved.reinforcementPlan))
        reinforcementPlan = saved.reinforcementPlan;
      supportChoices = {...supportChoices, ...battleChoicesFor(saved.supportChoices ?? {}, 'german')};
    }
    artilleryDie = saved.artilleryDie ?? null;
    recoveryOrders = saved.recoveryOrders ?? [];
    preferDefenderLoss = saved.preferDefenderLoss === true;
    save();
    note(rejectedMoves ? `対局ファイルを読み込みました。現在の盤面で無効になった移動案を${rejectedMoves}件取り消しました。`
      : '対局ファイルを読み込みました。');
    focusMap();
  }

  function element(tag, content, className) {
    const node = document.createElement(tag);
    if (content != null) node.textContent = content;
    if (className) node.className = className;
    return node;
  }

  function svg(tag, attrs) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  }

  function button(label, action, {primary = false, disabled = false, pressed, id} = {}) {
    const node = element('button', label, primary ? 'primary' : null);
    node.type = 'button';
    node.disabled = disabled;
    if (id) node.id = id;
    if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed));
    node.addEventListener('click', action);
    return node;
  }

  function selectBox(label, choices, value, change) {
    const wrapper = element('label', label);
    const select = element('select');
    for (const [id, title] of choices) {
      const option = element('option', title);
      option.value = id;
      select.append(option);
    }
    select.value = value;
    select.addEventListener('change', () => change(select.value));
    wrapper.append(select);
    return wrapper;
  }

  function addChitTooltip(node, src) {
    if (src === 'assets/allied-support-back.jpg') {
      setChitTooltip(node, '未公開の支援チット。公開後に能力を確認できます。');
      return;
    }
    const id = chitsByImage.get(src);
    const chit = D.chits[id];
    if (!chit) return;
    const inspect = event => {
      if (!event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showChitDetail(id, src, node);
    };
    node.addEventListener('click', inspect, {capture: true});
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter') inspect(event);
    }, {capture: true});
    if (node.tagName === 'FIGURE') node.tabIndex = 0;
    const effects = [];
    if (chit.shift) effects.push(`戦闘結果表を有利な方へ${chit.shift}列ずらす`);
    if (chit.at) effects.push('敵の使用中の戦車系チット1枚を除去');
    if (chit.denyAT) effects.push('連合軍の対戦車火力を無効化');
    if (chit.kind === 'tank') effects.push('この戦闘の損害1点を吸収できる');
    if (chit.kind === 'artillery') effects.push('片側だけが使うと、その側が出目を選ぶ');
    if (chit.kind === 'fort') effects.push('防御時に要塞化し、敵の戦車・砲兵を制限');
    if (chit.kind === 'dummy') effects.push('公開時に除去');
    if (chit.kind === 'ration') effects.push('部隊の混乱を回復');
    if (chit.kind === 'airDefense') effects.push('敵の空軍支援から部隊を守る');
    if (chit.event === 'capture') effects.push('保留した支援チットを補給切れのドイツ軍1部隊に配属');
    if (chit.breakFort) effects.push('この部隊に対する敵の要塞化を無効化');
    if (chit.dieAdd) effects.push(`出目を+${chit.dieAdd}（上限6）`);
    if (chit.absorb) effects.push(`自軍の損害−${chit.absorb}、敵の損害+${chit.inflict}`);
    const movement = {
      river:'渡河を助け、河川からの攻撃で戦車・砲兵を使えるようにする',
      terrain:'森林・河川・尾根の移動制限と、河川・尾根・要塞による戦闘制限を無視',
      carry:'移動中の輸送制限を緩和',
      reaction:'敵ZOC内から対応移動できる',
      ignoreZoc:'公開前の1回だけ、移動中に敵ZOCを無視',
      infiltrate:'1〜5なら出目の移動力で敵ZOCと地形効果を無視。6なら移動失敗',
    }[chit.move];
    if (movement) effects.push(movement);
    if (chit.label === 'パイパー連隊') effects.push('移動力5で移動し、単独攻撃後に再移動できる');
    if (chit.discard) effects.push('使い捨て');
    const description = [...effects, 'Shift＋クリックで詳しい説明'].join('。') + '。';
    setChitTooltip(node, `${chit.label} — ${description}`);
    node.setAttribute('aria-description', description);
  }

  function showChitDetail(id, src, source) {
    const chit = D.chits[id];
    const common = D.chitGuide[chit.kind];
    const specific = D.chitGuide[id];
    const timing = specific?.when ?? common?.when ?? `${R.sideName(id.startsWith('g-') ? 'german' : 'allied')}のイベント解決フェイズ`;
    const effects = [];
    if (chit.shift) effects.push(`戦闘結果表を自軍に有利な方へ${chit.shift}列ずらす。両軍のシフトは差し引く。`);
    if (chit.at) effects.push('対戦車火力（AT）で、敵がこの戦闘で使った戦車系チットを1枚取り除く。除去されたチットの効果は失われる。');
    if (chit.denyAT) effects.push('この戦闘で連合軍が使う対戦車火力をすべて無効化する。');
    if (chit.dieAdd) effects.push(`戦闘解決の出目に${chit.dieAdd}を加える。上限は6。`);
    if (chit.absorb) effects.push(`戦闘結果の自軍損害を${chit.absorb}点減らし、敵軍損害を${chit.inflict}点増やす。`);
    effects.push(...(common?.effects ?? []), ...(specific?.effects ?? []));
    const detail = byId('chit-detail');
    detailSource = source;
    const host = source.closest('#battle-overview') ?? document.body;
    if (detail.parentElement !== host) host.append(detail);
    byId('chit-detail-image').src = src;
    byId('chit-detail-name').textContent = chit.label;
    byId('chit-detail-timing').textContent = `${timing}${chit.discard ? ' · 使い捨て' : ''}`;
    byId('chit-detail-effects').replaceChildren(...effects.map(effect => element('li', effect)));
    const note = byId('chit-detail-note');
    note.textContent = specific?.note ?? '';
    note.hidden = !note.textContent;
    detail.hidden = false;
    detail.scrollTop = 0;
    byId('close-chit-detail').focus({preventScroll: true});
  }

  function closeChitDetail() {
    const detail = byId('chit-detail');
    const restoreFocus = detail.contains(document.activeElement);
    detail.hidden = true;
    if (restoreFocus && detailSource?.isConnected) detailSource.focus({preventScroll: true});
    detailSource = null;
  }

  function setChitTooltip(node, text) {
    if (node.namespaceURI === 'http://www.w3.org/2000/svg') {
      const title = svg('title', {});
      title.textContent = text;
      node.prepend(title);
    } else node.title = text;
  }

  function tileButton(title, src, action, pressed) {
    const node = button('', action, {pressed});
    node.classList.add('tile');
    const picture = element('img');
    picture.src = src;
    picture.alt = '';
    node.append(picture, document.createTextNode(title));
    addChitTooltip(node, src);
    return node;
  }

  function note(text, error = false) {
    message = {text, error};
    render();
  }

  function confirmAction(dialog, proceed) {
    if (dialog.open) return;
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close', () => {
      if (dialog.returnValue === 'proceed') proceed();
    }, {once: true});
    dialog.showModal();
  }

  function confirmTransport(text, label, proceed) {
    byId('transport-warning').textContent = text;
    byId('transport-confirm').textContent = label;
    confirmAction(byId('transport-dialog'), proceed);
  }

  function hasPhaseActions(board) {
    switch (board.phase) {
      case 'setup': return Boolean(board.setupOrders?.length);
      case 'support': return Boolean(board.supportUndo?.length);
      case 'recovery': return Boolean(board.recoveryUndo?.length);
      default: return Boolean(board.phaseActions);
    }
  }

  function skipsEmptyPhase(command, before) {
    switch (command.type) {
      case 'moves': return !projection.state.trails.length && !before.peiper;
      case 'attacks': return !command.attacks.length;
      case 'advance': return !command.unit;
      case 'next':
      case 'finish-setup': return !hasPhaseActions(before);
      case 'roll': {
        const battle = R.battleInfo(before);
        return Boolean(battle && (!battle.attackers.length || !battle.defenders.length));
      }
      default: return false;
    }
  }

  function emptyPhaseTitle(board) {
    const side = R.actor(board);
    if (board.phase === 'recovery') {
      if (!R.onMap(board, side).some(unit => unit.disrupted && !unit.marker))
        return '回復させる部隊がありません';
      if (board.supplyPoints < 3) return '回復に必要な補給ポイントが足りません';
      return '回復させる部隊を選んでいません';
    }
    if (board.phase === 'reentry') {
      const waiting = board.units.some(unit => unit.side === side && unit.status === 'removed' &&
        unit.returnTurn <= board.turn);
      return waiting ? '再登場できる配置先がありません' : '今ターン再登場できる部隊がありません';
    }
    return `${R.phaseNames[board.phase]}が0件です`;
  }

  function step(command, {emptyPhaseConfirmed = false} = {}) {
    if (byId('turn-start-dialog').open) return;
    const before = state;
    const result = R.apply(state, {...command, side: R.actor(state), revision: state.revision});
    if (!result.ok) return note(result.error, true);

    if (!emptyPhaseConfirmed && skipsEmptyPhase(command, before)) {
      byId('empty-phase-title').textContent = emptyPhaseTitle(before);
      return confirmAction(byId('empty-phase-dialog'), () => {
        if (state === before) completeStep(command, result.state);
      });
    }

    let recipient;
    if (command.type === 'assign') {
      recipient = R.unitById(result.state, command.unit);
    } else if (command.type === 'event' && command.hex && R.chit(command.chit)?.event === 'capture') {
      const [held] = before.captureHold ?? [];
      if (held) recipient = R.at(result.state, command.hex).find(unit => unit.support.includes(held));
    }
    if (recipient) {
      const load = R.transportableSupport(recipient).length;
      if (load > recipient.transport) {
        return confirmTransport(
          `${recipient.name} の輸送能力は${recipient.transport}枚です。配置できます。移動時に持ち運べる枚数を超えます（現在の配属予定 ${load}枚、${load - recipient.transport}枚超過）。`,
          'このまま配置', () => { if (state === before) completeStep(command, result.state); });
      }
    }
    if (['moves', 'start-peiper', 'peiper-remobilize'].includes(command.type)) {
      const committed = before.peiper ? before.trails.length : 0;
      const trails = command.type === 'moves' ? projection.state.trails : result.state.trails;
      const overloads = trails.slice(committed).filter(trail => trail.excess.length);
      if (overloads.length) {
        const warnings = overloads.map(trail => {
          const unit = R.unitById(before, trail.id);
          const chits = unit.side === 'allied' ? '' : trail.excess.map(id => R.chit(id).label).join('、');
          const loss = trail.lost ? '\nこの経路では、地形の効果で残りの支援チットも失います。' : '';
          return `${unit.name}（輸送力${unit.transport}枚）
AIが返却する超過分 ${trail.excess.length}枚　${chits}${loss}`;
        });
        return confirmTransport(warnings.join('\n\n'), '返却して移動',
          () => { if (state === before) completeStep(command, result.state); });
      }
    }
    completeStep(command, result.state);
  }

  function completeStep(command, nextState) {
    const before = state;
    state = nextState;
    save();
    if (state.phase === 'resolve' && ['reveal-battle', 'choose-at', 'roll', 'apply-battle-losses'].includes(command.type)
        && (state.combat.revealed || state.combat.openSupport)) {
      message = null;
      render();
      byId('battle-overview').scrollTop = 0;
      return;
    }
    if (command.type === 'declare-infiltration') {
      peiperDraft = false;
      moveSupport = command.chit;
      moveRepair = false;
      message = null;
      render();
      return;
    }
    if (command.type === 'movement-order') {
      pausedReservations.delete(command.unit);
      const checked = R.previewMoves(state, movePlan.filter(order => order.unit !== command.unit), pausedReservations);
      movePlan = checked.valid;
      orderDraft = null;
      selected = null;
      const text = command.order ? `${nameOf(command.unit)}：${movementOrderName(command.order.type)}を設定しました。`
        : `${nameOf(command.unit)}：命令を解除しました。`;
      note(checked.rejected.length ? `${text} 実行できなくなった移動案を${checked.rejected.length}件取り消しました。` : text);
      return;
    }
    if (command.type === 'ration' || command.type === 'remove-dummy') {
      if (moving()) {
        const revised = R.previewMoves(state, movePlan, pausedReservations);
        movePlan = revised.valid;
      }
      note(command.type === 'ration' ? `${nameOf(command.unit)}の混乱を回復しました。` : 'ダミーを手元に戻しました。');
      return;
    }
    if (['confirm-setup', 'confirm-support', 'undo-support'].includes(command.type)) {
      card = null;
      const pending = command.type === 'confirm-setup' ? R.setupPlacementRequired(state)
        : R.supportPlacementStatus(state).required;
      return note(command.type === 'undo-support' ? '直前の操作を取り消しました。'
        : pending ? 'ここまでの配置を確定しました。残りは続けて配置できます。' : '配置を確定しました。');
    }
    if (state.phase === 'reinforce' && isAI() && ['event', 'place-reinforcements'].includes(command.type)) {
      reinforcementPlan = reinforcementPlan.filter(order => R.unitById(state, order.unit)?.status === 'reserve');
      if (!state.events.length) reinforcementPlan = AI.reinforcements(state, reinforcementPlan);
      selected = null;
      inspected = null;
      card = null;
      eventEffect = 'disrupt';
      message = command.type === 'event' ? {text: state.log.at(-1).text, error: false} : null;
      proposeEvent();
      render();
      if (draftingReinforcements() && reinforcementPlan.length) focusMap();
      return;
    }
    if (before.phase === state.phase && ['place', 'assign', 'event', 'recover-batch', 'undo-recovery',
        'undo-setup', 'hold-capture', 'release-capture'].includes(command.type)) {
      selected = null;
      recoveryOrders = [];
      reentryHex = null;
      reentryNotice = '';
      card = null;
      eventEffect = 'disrupt';
      const resultMessage = command.type === 'event' ? state.log.at(-1).text
        : command.type === 'recover-batch' ? `${command.units.length}個の部隊の回復を確定しました。`
        : command.type === 'undo-recovery' ? '直前の回復を取り消しました。' : null;
      message = resultMessage ? {text: resultMessage, error: false} : null;
      if (command.type === 'event') proposeEvent();
      render();
      return;
    }
    const resultHex = command.type === 'roll' ? state.lastBattle?.target : null;
    prepare(!adminPractice);
    render();
    if (resultHex) center(resultHex);
    else focusMap();
    if (!practice && state.turn !== before.turn) showTurnStart();
  }

  function prepare(automate = true) {
    editingSetupBridge = false;
    movePlan = []; attackPlan = []; reinforcementPlan = []; pausedReservations = new Set();
    attackers = new Set(); orderDraft = null;
    reviewedAttack = null;
    recoveryOrders = [];
    reentryHex = null;
    reentryNotice = '';
    overviewUnit = null;
    selected = null; inspected = null; card = null; eventEffect = 'disrupt';
    moveSupport = ''; moveRepair = false; attackEdit = null; message = null;
    peiperDraft = false;
    const beforeAdmin = state;
    if (!practice && state.turn === 1 && ['setup', 'move'].includes(state.phase)) {
      const corrected = R.apply(state, {type: 'correct-initial-bridge', side: R.actor(state)});
      if (corrected.ok) state = corrected.state;
    }
    if (automate && isAI() && state.phase === 'setup') {
      const migrate = action => {
        const result = R.apply(state, {...action, side: 'allied'});
        if (result.ok) state = result.state;
      };
      if (state.hand.length) migrate({type: 'auto-allied-setup'});
      migrate({type: 'confirm-setup'});
      migrate({type: 'finish-setup'});
    }
    const automatedPhases = ['support', 'move', 'reaction', 'attack', 'counter'];
    for (let i = 0; automate && isAI() && automatedPhases.includes(state.phase) && i < 150; i++) {
      const action = AI.administration(state);
      if (!action || action.type === 'next') break;
      const result = R.apply(state, {...action, revision: state.revision});
      if (!result.ok) {
        message = {text: '連合軍の準備を手動で進めてください。' + result.error, error: true};
        break;
      }
      state = result.state;
    }
    if (state !== beforeAdmin) save();
    if (automate && isAI() && moving()) movePlan = AI.moves(state);
    if (automate && isAI() && planning()) attackPlan = AI.attacks(state);
    if (automate && draftingReinforcements()) reinforcementPlan = AI.reinforcements(state);
    proposeEvent();
    if (moving() && ['attack', 'second'].includes(state.peiper?.stage)) {
      selected = state.peiper.unit;
      inspected = selected;
    }
    supportChoices = battleChoicesFor(R.defaultSupport(R.battleInfo(state)), 'allied');
    artilleryDie = null;
    preferDefenderLoss = false;
    if (state.phase === 'advance') {
      const units = state.combat.advance.ids.map(id => R.unitById(state, id));
      if (isAI()) selected = units.sort((a, b) => b.defense - a.defense)[0]?.id ?? null;
    }
    document.querySelector('.command-scroll').scrollTop = 0;
  }

  function clearMapSelection() {
    peiperDraft = false;
    selected = null;
    inspected = null;
    card = null;
    orderDraft = null;
    attackers.clear();
    attackEdit = null;
    reviewedAttack = null;
    reentryHex = null;
    reentryNotice = '';
    message = null;
    hideStack();
    render();
  }

  function chooseMover(id) {
    if (selected === id) return clearMapSelection();
    peiperDraft = false;
    orderDraft = null;
    selected = id;
    inspected = id;
    const existing = movePlan.find(order => order.unit === id);
    moveSupport = state.infiltration?.[id]?.chit ?? existing?.support ?? '';
    moveRepair = Boolean(existing?.repairBridge);
    message = null;
    render();
  }

  function returnSelectedMove() {
    const trail = projection.state.trails.find(entry => entry.id === selected);
    if (!moving() || !trail || state.peiper && state.trails.some(entry => entry.id === selected)) return;
    const remaining = movePlan.filter(order => order.unit !== trail.id);
    const paused = new Set(pausedReservations);
    if (trail.reserved) paused.add(trail.id);
    const revised = R.previewMoves(state, remaining, paused);
    const affected = R.onMap(projection.state, R.actor(state)).find(unit =>
      unit.id !== trail.id && R.unitById(revised.state, unit.id).hex !== unit.hex);
    if (affected)
      return note(`${affected.name}の移動に影響します。先にその部隊の移動を戻すか、予約を解除してください。`, true);
    movePlan = revised.valid;
    pausedReservations = paused;
    message = null;
    render();
  }

  function moveBaseForSelection() {
    if (!moving() || !selected) return null;
    if (state.peiper?.stage === 'attack') return null;
    if (state.peiper?.stage === 'second') return state.peiper.unit === selected ? state : null;
    const index = movePlan.findIndex(order => order.unit === selected);
    if (index >= 0)
      return R.previewMoves(state, movePlan.slice(0, index), pausedReservations).state;
    if (projection.state.trails.some(trail => trail.id === selected)) return null;
    return projection.state;
  }

  function movementPlanWith(route, index) {
    const order = {unit: selected, to: route.hex, mode: route.mode,
      support: route.support, repairBridge: route.repairBridge};
    const revised = movePlan.slice();
    if (index < 0) revised.push(order);
    else revised[index] = order;
    return revised;
  }

  function movementRange(board) {
    const destinations = new Map();
    if (!board) return destinations;
    if (peiperDraft || state.peiper?.stage === 'second') return R.peiperRoutes(board, selected);
    const index = movePlan.findIndex(order => order.unit === selected);
    const hasLaterMoves = index >= 0 && index < movePlan.length - 1;
    for (const mode of ['normal', 'mechanized']) {
      if (moveRepair && mode === 'mechanized') break;
      const options = R.movementOptions(board, selected, {mode, support: moveSupport || null, repairBridge: moveRepair});
      for (const route of options.values()) {
        const current = destinations.get(route.hex);
        if (current && (!current.lost || route.lost)) continue;
        if (hasLaterMoves && R.previewMoves(state, movementPlanWith(route, index), pausedReservations).rejected.length)
          continue;
        destinations.set(route.hex, route);
      }
    }
    return destinations;
  }

  function moveSelectedTo(hex) {
    if (peiperDraft) return step({type: 'start-peiper', unit: selected, to: hex, moves: movePlan});
    if (state.peiper?.stage === 'second') return step({type: 'peiper-remobilize', unit: selected, to: hex});
    const index = movePlan.findIndex(move => move.unit === selected);
    const checked = R.previewMoves(state, movementPlanWith(range.get(hex), index), pausedReservations);
    if (checked.rejected.length)
      return note('この移動先では、ほかの部隊の移動が成立しません。別の移動先を選んでください。', true);
    movePlan = checked.valid;
    selected = null;
    inspected = null;
    hideStack();
    render();
  }

  function editAttack(index) {
    reviewedAttack = null;
    attackEdit = index;
    attackers = new Set(attackPlan[index].attackers);
    message = null;
    render();
    center(attackPlan[index].target);
  }

  function chooseTarget(hex) {
    if (!attackers.size) return note('先に攻撃に参加する味方の駒を選んでください。', true);
    const index = attackPlan.findIndex(order => order.target === hex);
    if (index >= 0 && attackEdit != null && attackEdit !== index)
      return note('このヘクスは別の攻撃案に入っています。一覧からその攻撃を変更してください。', true);
    const replaced = attackEdit ?? index;
    const ids = new Set(replaced === index && attackEdit == null ? attackPlan[index]?.attackers : []);
    for (const id of attackers) ids.add(id);
    const order = {target: hex, attackers: [...ids]};
    const updated = attackPlan.slice();
    if (replaced >= 0) updated[replaced] = order;
    else updated.push(order);
    if (!R.validateAttacks(state, updated))
      return note('参加部隊は全て目標に隣接し、ほかの攻撃案に入っていない必要があります。', true);
    attackPlan = updated;
    reviewedAttack = null;
    attackers.clear();
    attackEdit = null;
    note(`${location(hex)}への攻撃案を更新しました。`);
  }

  function startMovementOrder(unit, type) {
    orderDraft = {unit: unit.id, type, target: unit.movementOrder?.target ?? null};
    selected = null;
    note(`${movementOrderName(type)}の目的地を地図で選んでください。`);
  }

  function chooseOrderTarget(hex) {
    const unit = R.unitById(state, orderDraft.unit);
    if (!R.canOrderDestination(state, unit, hex))
      return note('敵軍がいるヘクスや敵軍支配下など、進入できないヘクスには命令を出せません。', true);
    if (orderDraft.type === 'reserve' && hex === unit.hex)
      return note('その場に留まらせるには「死守命令」を選んでください。', true);
    orderDraft.target = hex;
    message = null;
    render();
  }

  function reinforcementPlaces(id) {
    if (!draftingReinforcements()) return R.placements(state, id);
    const otherPlacements = reinforcementPlan.filter(order => order.unit !== id);
    return R.placements(R.previewReinforcements(state, otherPlacements).state, id);
  }

  function placeReinforcement(id, hex) {
    if (!reinforcementPlaces(id).includes(hex)) return note('このヘクスには増援を配置できません。', true);
    if (!draftingReinforcements()) return step({type: 'place', unit: id, hex});
    const index = reinforcementPlan.findIndex(order => order.unit === id);
    const order = {unit: id, hex};
    if (index < 0) reinforcementPlan.push(order);
    else reinforcementPlan[index] = order;
    selected = null;
    message = null;
    render();
  }

  function supportRecipients() {
    return state.phase === 'setup'
      ? R.onMap(state, R.actor(state)).filter(unit => !unit.marker)
      : R.supportTargets(state);
  }

  function assignSupportAt(hex, chit, unitId) {
    const eligible = supportRecipients().filter(unit => unit.hex === hex);
    const unit = eligible.find(unit => unit.id === unitId) ?? eligible[0];
    if (!unit) {
      const friendly = R.at(state, hex).find(unit => unit.side === R.actor(state) && !unit.marker);
      if (friendly && state.phase === 'support') {
        if (friendly.side === 'allied' && R.city(hex) && state.airSupply)
          return note('補給線の通じない都市で支援を受けられるのは、すでに選んだ1部隊だけです。', true);
        return note(friendly.name + 'には補給線が通じていないため配属できません。', true);
      }
      return note('支援チットを付ける自軍の部隊を選んでください。', true);
    }
    inspected = unit.id;
    step({type: 'assign', unit: unit.id, chit});
  }

  function chooseUnit(id) {
    if (editingSetupBridge) return chooseHex(R.unitById(state,id).hex);
    if (orderDraft) return chooseOrderTarget(R.unitById(projection.state, id).hex);
    const clicked = R.unitById(projection.state, id);
    const unit = R.unitById(state, id);
    if (moving() && state.peiper?.stage === 'attack' && legalHexes.has(unit.hex)) return chooseHex(unit.hex);
    if (moving() && state.peiper?.stage === 'second' && range.has(unit.hex)) return chooseHex(unit.hex);
    if (draftingReinforcements() && reinforcementPlan.some(order => order.unit === id)) {
      if (selected === id) return clearMapSelection();
      selected = id;
      inspected = id;
      overviewUnit = id;
      message = null;
      render();
      return;
    }
    if (!planning() && !selected && !card && inspected === id) return clearMapSelection();
    inspected = id;
    overviewUnit = clicked.hex ? id : null;
    message = null;
    if (state.phase === 'recovery') {
      if (selected === id) return clearMapSelection();
      if (unit.side === R.actor(state) && unit.disrupted && !unit.marker && !recoveryOrders.includes(id)) {
        selected = id;
      }
      render();
      return;
    }
    if (state.phase === 'reentry' && unit.hex && (selected || R.city(unit.hex))) return chooseReentryHex(unit.hex);
    if ((hasPendingEvent() || state.phase === 'reinforce') && legalHexes.has(unit.hex))
      return chooseHex(unit.hex);
    if (moving()) {
      if (unit.side === R.actor(state)) {
        if (!unit.marker) return chooseMover(id);
        if (range.has(unit.hex)) return chooseHex(unit.hex);
      }
      selected = null;
      render();
      return;
    }
    if (planning() && unit.side !== R.actor(state)) return chooseTarget(unit.hex);
    if (planning() && unit.side === R.actor(state) && !unit.disrupted && !unit.marker) {
      reviewedAttack = null;
      const index = attackPlan.findIndex(order => order.attackers.includes(id));
      if (index >= 0 && attackEdit == null) return editAttack(index);
      if (index >= 0 && index !== attackEdit)
        return note('この部隊は別の攻撃案に入っています。', true);
      if (attackers.has(id)) attackers.delete(id);
      else attackers.add(id);
    }
    if (state.phase === 'advance' && state.combat.advance.ids.includes(id)) {
      if (selected === id) return clearMapSelection();
      selected = id;
    }
    if (assigningSupport() && card) return assignSupportAt(unit.hex, card, id);
    render();
  }

  function chooseHex(hex) {
    if (editingSetupBridge) {
      if (legalHexes.has(hex)) step({type: 'relocate-setup-bridge', hex});
      return;
    }
    if (orderDraft) return chooseOrderTarget(hex);
    message = null;
    if (moving() && state.peiper?.stage === 'attack' && legalHexes.has(hex))
      return step({type: 'peiper-attack', target: hex});
    if (moving() && range.has(hex)) return moveSelectedTo(hex);
    if (planning() && R.battleCandidates(state, hex).length) return chooseTarget(hex);
    if (hasPendingEvent() && legalHexes.has(hex)) {
      if (isAI()) { eventDraft = hex; return render(); }
      return step({type: 'event', chit: card, hex, effect: eventEffect});
    }
    if (state.phase === 'reentry' && (selected || R.city(hex))) return chooseReentryHex(hex);
    if (state.phase === 'reinforce' && selected && !hasPendingEvent())
      return placeReinforcement(selected, hex);
    if (assigningSupport() && card) return assignSupportAt(hex, card);
    const occupant = R.at(projection.state, hex)[0];
    if (occupant) return chooseUnit(occupant.id);
    if (moving() && selected) clearMapSelection();
  }

  function chooseReentryHex(hex) {
    if (legalHexes.has(hex)) {
      reentryHex = hex;
      reentryNotice = '';
      render();
      return;
    }
    reentryHex = null;
    const side = R.actor(state);
    const reason = !R.city(hex) ? '都市ヘクスではありません。'
      : R.at(state, hex).some(unit => !unit.marker || unit.side !== side) ? '別の部隊がいます。'
      : state.control[hex] !== side ? '自軍支配下の都市ではありません。'
      : !R.lines(state, side).has(hex) ? '自軍補給源までの連絡線が通じていません。'
      : selected ? 'この部隊の配置条件を満たしていません。' : '配置先にできます。先に再登場させる部隊を選んでください。';
    reentryNotice = `${location(hex)} · ${reason}`;
    render();
  }

  function wireSvg(node, action) {
    node.addEventListener('click', action);
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action();
      }
    });
  }

  function showCoordinates(hex) {
    byId('coordinates').textContent = `${location(hex)} · ${R.terrainName(hex)}`;
  }

  function initMap() {
    const segments = R.roadLinks().map(([from, to]) => `M ${point(from)} L ${point(to)}`);
    byId('road-data').append(svg('path', {d: segments.join(' ')}));
    for (const [id, {x, y}] of R.map) {
      const corners = Array.from({length: 6}, (_, i) => {
        const angle = i * Math.PI / 3;
        return `${x + Math.cos(angle)*35},${y + Math.sin(angle)*35}`;
      }).join(' ');
      const polygon = svg('polygon', {class: 'hex', points: corners, 'data-hex': id});
      if (R.riverTerrain(id)) polygon.setAttribute('data-river', R.city(id) ? 'city' : 'river');
      if (D.victoryCities.includes(id)) polygon.dataset.city = 'sudden';
      else if (R.finalVictoryCities.includes(id)) polygon.dataset.city = 'final';
      else if (R.city(id)) polygon.dataset.city = 'counted';
      if (R.ridge(id)) polygon.setAttribute('data-relief', 'ridge');
      else if (R.forest(id)) polygon.setAttribute('data-relief', 'forest');
      polygon.addEventListener('pointerenter', () => showCoordinates(id));
      wireSvg(polygon, () => {
        if (!mapInspection && !countersHidden) chooseHex(id);
      });
      byId('hexes').append(polygon);
      polygons.set(id, polygon);
    }
  }

  const counterArt = unit => D.counterArt[unit.id] ?? unit;

  function picture(unit) {
    if (unit.marker) return R.chitImage(unit.marker);
    const {front, back} = counterArt(unit);
    return (unit.disrupted && back) || front;
  }

  function supportPieces(unit) {
    const hidden = unit.side === 'allied' && !(supportPractice && R.actor(state) === 'allied');
    const used = R.unitById(state, unit.id)?.usedSupport ?? [];
    return unit.support.map(id => hidden && !used.includes(id)
      ? {src: 'assets/allied-support-back.jpg', label: '裏向きの支援チット'}
      : {src: R.chitImage(id), label: R.chit(id).label});
  }

  function stackFigure({src, label, caption = true}) {
    const figure = element('figure');
    const image = element('img');
    image.src = src;
    image.alt = caption ? '' : label;
    figure.append(image);
    if (caption) figure.append(element('figcaption', label));
    addChitTooltip(figure, src);
    return figure;
  }

  function showStack(unit) {
    const companions = R.at(projection.state, unit.hex).filter(companion =>
      companion.id !== unit.id && companion.side === unit.side && (companion.marker || unit.marker));
    const units = [unit, ...companions];
    const cards = units.map(member => {
      const status = member.marker ? `（防御+${member.defense}）` : member.disrupted ? '（混乱）' : '';
      return {src: picture(member), label: member.name + status};
    });
    const bridge = projection.state.bridges[unit.hex];
    if (bridge) cards.push({src: R.chitImage(bridge), label: R.chit(bridge).label});
    const support = units.flatMap(supportPieces);
    byId('stack-title').textContent = `${cards[0].label} · ${location(unit.hex)} · 支援 ${support.length}枚`;
    byId('stack-pieces').replaceChildren(...[...cards, ...support].map(stackFigure));
    byId('stack-overview').hidden = false;
  }

  function hideStack() {
    overviewUnit = null;
    byId('stack-overview').hidden = true;
  }

  function drawCounters() {
    const clicked = R.unitById(projection.state, overviewUnit);
    if (!countersHidden && clicked?.hex) showStack(clicked);
    else hideStack();
    const pieces = document.createDocumentFragment();
    const movingIds = new Set(moving() ? projection.state.trails.map(trail => trail.id) : []);
    const reinforcingIds = new Set(draftingReinforcements() ? reinforcementPlan.map(order => order.unit) : []);
    const committedOrders = new Map(R.onMap(state).filter(unit => unit.movementOrder)
      .map(unit => [unit.id, unit.movementOrder]));
    const fightingIds = new Set(attackPlan.flatMap(order => order.attackers));
    const occupied = new Map();
    for (const unit of R.onMap(projection.state)) {
      const stack = occupied.get(unit.hex) ?? [];
      stack.push(unit);
      occupied.set(unit.hex, stack);
    }
    for (const [hex, stack] of occupied) {
      const {x, y} = R.map.get(hex);
      const markerStack = stack.length === 2 && Boolean(stack[0].marker) !== Boolean(stack[1].marker);
      const counters = markerStack ? [stack.find(unit => unit.marker), stack.find(unit => !unit.marker)] : stack;
      for (const [index, unit] of counters.entries()) {
        const size = unitCounterSize;
        let left = x - size/2;
        let top = y - size/2;
        if (markerStack) {
          left += unit.marker ? 13 : -8;
          top += unit.marker ? -12 : 6;
        } else if (stack.length > 1) {
          left += index ? 14 : -7;
          if (index) top += 12;
        }
        const classes = ['counter'];
        if (state.phase === 'recovery' && unit.side === R.actor(state) && unit.disrupted && !unit.marker)
          classes.push('recovery-target');
        const moved = movingIds.has(unit.id);
        const reinforcing = reinforcingIds.has(unit.id);
        if (moved) classes.push('planned');
        if (reinforcing) classes.push('reinforcement-draft');
        if (unit.id === selected || attackers.has(unit.id)) classes.push('selected');
        else if (fightingIds.has(unit.id)) classes.push('attack-ordered');
        const support = supportPieces(unit);
        const order = committedOrders.get(unit.id);
        const orderMark = order && (order.type === 'hold' && hex === order.target ? '死守' : '予約');
        const label = `${R.sideName(unit.side)} ${unit.name} ${hex}${reinforcing ? ' 増援の配置案' : ''}${moved ? ' 移動済み' : ''}${unit.disrupted ? ' 混乱' : ''} 支援 ${support.length}枚${orderMark ? ' ' + orderMark : ''}`;
        const node = svg('g', {class: classes.join(' '), tabindex: 0, role: 'button',
          'aria-label': label, 'data-unit': unit.id});
        const offset = Math.min(5, 13 / Math.max(1, support.length));
        for (let index = support.length - 1; index >= 0; index--) {
          const shift = (index + 1) * offset;
          const tile = svg('g', {class: 'counter-support', 'aria-hidden': 'true'});
          tile.append(svg('rect', {x: left+shift-1, y: top-shift-1, width: size+2, height: size+2, rx: 2}),
            svg('image', {href: support[index].src, x: left+shift, y: top-shift, width: size, height: size}));
          addChitTooltip(tile, support[index].src);
          node.append(tile);
        }
        node.append(svg('rect', {class: 'rim', x: left-1, y: top-1, width: size+2, height: size+2, rx: 2}),
          svg('image', {href: picture(unit), x: left, y: top, width: size, height: size}));
        if (orderMark) {
          const badge = svg('text', {x: left + size/2, y: top - 2, class: 'order-label'});
          badge.textContent = orderMark;
          node.append(badge);
        }
        if (unit.marker) addChitTooltip(node, picture(unit));
        if (unit.disrupted && !counterArt(unit).back) {
          const label = svg('text', {x: left+size-2, y: top+size+2});
          label.textContent = '混';
          node.append(svg('circle', {class: 'count', cx: left+size-2, cy: top+size-2, r: 8}), label);
        }
        node.addEventListener('pointerenter', () => showCoordinates(hex));
        node.addEventListener('focus', () => showCoordinates(hex));
        wireSvg(node, () => chooseUnit(unit.id));
        pieces.append(node);
      }
    }
    byId('counters').replaceChildren(pieces);
  }

  function drawPath(path, style) {
    const points = path.map(point);
    const start = R.map.get(path.at(-2)), end = R.map.get(path.at(-1));
    const length = Math.hypot(start.x-end.x, start.y-end.y);
    points[points.length-1] = `${end.x + (start.x-end.x)*23/length},${end.y + (start.y-end.y)*23/length}`;
    byId('routes').append(svg('polyline', {class: `route ${style}`, points: points.join(' ')}));
  }

  function alliedSupportPlacements() {
    if (!reviewingAlliedSupport()) return new Set();
    const hexes = new Set();
    for (const {unit: previous} of state.supportUndo ?? []) {
      if (!previous) continue;
      const unit = R.unitById(state, previous.id);
      if (unit?.hex && unit.support.some(id => !previous.support.includes(id))) hexes.add(unit.hex);
    }
    return hexes;
  }

  function drawMap(moveBase, assistedHexes) {
    const supportPlacements = alliedSupportPlacements();
    const battle = state.phase === 'resolve' ? R.battleInfo(state) : null;
    const focus = state.phase === 'advance' ? state.combat.advance.hex : battle?.target;
    const visibleAttacks = attackEdit != null ? [attackPlan[attackEdit]]
      : reviewedAttack ? attackPlan.filter(order => order.target === reviewedAttack) : attackPlan;
    const targets = new Set(visibleAttacks.map(order => order.target));
    if (moving() && state.peiper?.stage === 'attack') for (const hex of legalHexes) targets.add(hex);
    if (focus) targets.add(focus);
    const groups = visibleAttacks.map(order => ({
      targets: [order.target],
      attackers: order.attackers,
    }));
    if (focus) {
      groups.splice(0, groups.length, {
        targets: [...targets],
        attackers: battle ? battle.attackers.map(unit => unit.id) : [],
      });
    }
    if (battlePractice && battle && state.combat.from === 'attack') {
      const queued = new Set(state.combat.queue.map(order => order.target));
      groups.splice(0, groups.length, ...practiceScenarios.filter(order => queued.has(order.target)).map(order => ({
        targets: [order.target],
        attackers: order.target === focus ? battle.attackers.map(unit => unit.id) : order.attackers,
      })));
      for (const target of queued) targets.add(target);
    }
    const participants = new Set([...attackers].map(id => R.unitById(state, id).hex));
    const battleColors = new Map();
    for (const group of groups) {
      const origins = group.attackers.map(id => R.unitById(state, id).hex).filter(Boolean);
      const hexes = [...origins, ...group.targets];
      const adjacent = new Set(hexes.flatMap(hex => [hex, ...R.neighbors(hex)]).map(hex => battleColors.get(hex)));
      const palette = [204, 38, 278, 150, 348, 70, 185, 18, 236, 310, 110, 10];
      const color = palette.find(hue => !adjacent.has(hue)) ?? palette[0];
      for (const hex of hexes) battleColors.set(hex, color);
      for (const hex of origins) participants.add(hex);
    }
    const origin = moveBase ? R.unitById(moveBase, selected).hex : null;
    const draftUnit = R.unitById(state, orderDraft?.unit);
    for (const [hex, polygon] of polygons) {
      const orderTarget = draftUnit && R.canOrderDestination(state, draftUnit, hex) &&
        (orderDraft.type === 'hold' || hex !== draftUnit.hex);
      const styles = ['hex'];
      const option = range.get(hex);
      if (option || legalHexes.has(hex)) styles.push(option?.stopped ? 'stop' : 'legal');
      if (assistedHexes.has(hex)) styles.push('support-movement');
      if (supportPlacements.has(hex)) styles.push('support-placement');
      if (targets.has(hex)) styles.push('target');
      if (focus === hex) styles.push('active-battle');
      if (participants.has(hex)) styles.push('attacker');
      if (battleColors.has(hex)) {
        styles.push('battle-group');
        polygon.style.setProperty('--battle-hue', battleColors.get(hex));
      } else polygon.style.removeProperty('--battle-hue');
      if (origin === hex) styles.push('origin');
      if (reentryHex === hex || orderDraft?.target === hex || (hasPendingEvent() && isAI() && eventDraft === hex)) styles.push('chosen');
      polygon.setAttribute('class', styles.join(' '));
      if (option || orderTarget || legalHexes.has(hex) || (planning() && targets.has(hex)) ||
          (state.phase === 'reentry' && R.city(hex))) {
        polygon.setAttribute('tabindex', '0');
        polygon.setAttribute('role', 'button');
        polygon.setAttribute('aria-label', assistedHexes.has(hex)
          ? `${location(hex)} · チットを使うと到達可能` : location(hex));
      } else {
        polygon.removeAttribute('tabindex');
        polygon.removeAttribute('role');
        polygon.removeAttribute('aria-label');
      }
    }
    byId('routes').replaceChildren();
    byId('marks').replaceChildren();
    const cavalryZone = moving() && R.actor(state) === 'german'
      ? new Set(R.onMap(projection.state, 'allied')
        .filter(unit => R.chit(unit.marker)?.event === 'cavalry').flatMap(R.unitZoc)) : new Set();
    cavalryLegend.hidden = !cavalryZone.size || countersHidden;
    for (const hex of cavalryZone) {
      byId('routes').append(svg('polygon', {points: polygons.get(hex).getAttribute('points'),
        fill: 'none', stroke: '#951d39', 'stroke-width': 3, 'stroke-dasharray': '7 4', 'pointer-events': 'none'}));
    }
    for (const unit of R.onMap(state)) {
      const order = unit.movementOrder;
      if (!order || (orderDraft?.unit === unit.id && orderDraft.target)) continue;
      const origin = R.unitById(projection.state, unit.id).hex;
      if (origin !== order.target) drawPath([origin, order.target], 'reserved');
    }
    if (orderDraft?.target && draftUnit.hex !== orderDraft.target)
      drawPath([draftUnit.hex, orderDraft.target], 'reserved order-draft');
    if (moving() && !orderDraft) {
      if (selected) {
        for (const trail of projection.state.trails.filter(trail => trail.id === selected)) drawPath(trail.path, 'reviewed');
      } else if (isAI()) {
        for (const trail of projection.state.trails) drawPath(trail.path, 'candidate');
      }
    }
    const occupied = new Set(R.onMap(projection.state).map(unit => unit.hex));
    for (const [hex, bridge] of Object.entries(state.bridges)) {
      const {x,y} = R.map.get(hex);
      const offset = occupied.has(hex) ? 14 : 0;
      byId('marks').append(svg('image', {href: R.chitImage(bridge), 'data-bridge': hex,
        x: x - unitCounterSize/2 + offset, y: y - unitCounterSize/2 - offset,
        width: unitCounterSize, height: unitCounterSize}));
    }
    if (state.depot) {
      const hex = D.depotHex;
      const {x, y} = R.map.get(hex);
      const offset = occupied.has(hex) ? 20 : 0;
      byId('marks').append(svg('image', {href: R.chitImage('g-depot:1'), 'data-depot': hex,
        x: x - unitCounterSize/2 + offset, y: y - unitCounterSize/2 - offset,
        width: unitCounterSize, height: unitCounterSize}));
    }
    drawCounters();
  }

  function center(hex) {
    if (!R.map.has(hex)) return;
    const {x, y} = R.map.get(hex);
    const scale = Number(byId('zoom').value)/100;
    const viewport = byId('map-scroll');
    viewport.scrollLeft = x*scale - viewport.clientWidth/2;
    viewport.scrollTop = y*scale - viewport.clientHeight/2;
    showCoordinates(hex);
  }

  function focusMap() {
    const battle = state.phase === 'advance' ? state.combat.advance.hex : R.battleInfo(state)?.target;
    const recovery = state.phase === 'recovery'
      ? R.onMap(projection.state, R.actor(state)).find(unit => unit.disrupted && !unit.marker)?.hex : null;
    const startingHex = eventPractice ? '2009' : '2509';
    const eventTarget = hasPendingEvent()
      ? [...legalHexes].sort((a, b) => R.distance(a, startingHex) - R.distance(b, startingHex))[0] : null;
    center(battle ?? recovery ?? eventTarget ?? reentryHex ?? orderDraft?.target ?? reviewedAttack ??
      R.unitById(projection.state, selected)?.hex ?? attackPlan[0]?.target ??
      movePlan[0]?.to ?? (draftingReinforcements() ? reinforcementPlan[0]?.hex : null) ??
      alliedSupportPlacements().values().next().value ?? startingHex);
  }

  function renderMovement(panel, actions, moveBase) {
    const allied = isAI();
    const peiper = state.peiper;
    if (['attack', 'second'].includes(peiper?.stage)) {
      const attacking = peiper.stage === 'attack';
      const unit = R.unitById(state, peiper.unit);
      panel.append(element('h3', `パイパー連隊 · ${unit.name}`));
      const instruction = attacking ? '攻撃する敵の駒をクリックしてください。'
        : range.size ? '色の付いたヘクスをクリックして、移動力5で再移動します。'
          : '移動先を表示するには、パイパー連隊を配属した駒を選んでください。';
      panel.append(element('p', instruction, 'hint'));
      actions.append(button(attacking ? '単独攻撃を行わない' : '再移動を行わない',
        () => step({type: 'finish-peiper'}), {id: 'finish-peiper'}));
      return;
    }
    if (selected) {
      const unit = R.unitById(projection.state, selected);
      panel.append(element('h3', `${unit.name} · ${unit.hex}`));
      const infiltration = state.infiltration?.[unit.id];
      if (infiltration) {
        const outcome = infiltration.die === 6 ? '移動できません。チットを消費しました。'
          : `移動力 ${infiltration.die}。敵ZOCと地形効果を無視します。`;
        const result = element('p', null, 'result');
        result.append(element('strong', `浸透移動の出目 ${infiltration.die}`), document.createElement('br'), outcome);
        result.setAttribute('role', 'status');
        panel.append(result);
        if (infiltration.die < 6 && moveBase)
          panel.append(element('p', range.size ? '色の付いた移動先をクリックしてください。'
            : '移動できるヘクスはありません。', 'hint'));
      }
      if (moveBase && !unit.movementOrder && !unit.disrupted && !infiltration) {
        const controls = element('div', null, 'controls');
        const publicSupport = R.unitById(state, unit.id).usedSupport;
        const originalUnit = R.unitById(state, unit.id);
        if (R.canUsePeiper(projection.state, unit)) {
          const adjacent = state.phase === 'reaction' && R.peiperTargets(projection.state, unit.id).length;
          const label = adjacent ? 'パイパー連隊で単独攻撃' : 'パイパー連隊で移動';
          controls.append(button(label, () => {
            if (adjacent) return step({type: 'start-peiper', unit: unit.id, moves: movePlan});
            peiperDraft = !peiperDraft;
            moveSupport = ''; moveRepair = false;
            render();
          }, {id: 'start-peiper', pressed: peiperDraft}));
          if (peiperDraft) panel.append(element('p', '移動力5。移動先をクリックすると、ここまでの移動も確定します。', 'hint'));
        }
        const chits = R.moveChits(originalUnit).filter(id => R.chit(id).move !== 'infiltrate' &&
          (!allied || id === moveSupport || publicSupport.includes(id)));
        const infiltrationChit = originalUnit.support.find(id => R.canDeclareInfiltration(state, originalUnit, id));
        if (infiltrationChit && !movePlan.some(order => order.unit === unit.id)) {
          controls.append(button('浸透移動を宣言してダイスを振る',
            () => step({type: 'declare-infiltration', unit: unit.id, chit: infiltrationChit}),
            {id: 'declare-infiltration'}));
        }
        if (chits.length) {
          const choices = [['','なし']];
          for (const id of chits) {
            const definition = R.chit(id);
            const hidden = allied && !publicSupport.includes(id);
            choices.push([id, hidden ? 'AIが選んだ移動支援'
              : definition.move === 'river' ? `${definition.label}（渡河支援）` : definition.label]);
            if (!hidden && definition.move === 'river' && state.phase !== 'highbeam')
              choices.push([`${id}|repair`, `${definition.label}（橋梁修復）`]);
          }
          controls.append(selectBox('移動支援', choices, moveRepair ? `${moveSupport}|repair` : moveSupport, value => {
            const [id, repair] = value.split('|');
            peiperDraft = false;
            moveSupport = id; moveRepair = Boolean(repair); render();
          }));
        }
        if (controls.childElementCount) panel.append(controls);
        const blockedByZoc = state.phase === 'reaction' && R.zoc(state, unit.side).has(unit.hex);
        panel.append(element('p', range.size ? '色の付いた移動先をクリックしてください。'
          : blockedByZoc ? '敵ZOC内からは、対応移動を許可する支援チットが必要です。'
            : 'この条件で移動できるヘクスはありません。', 'hint'));
      }
    }
    const confirmLabel = allied && state.phase === 'reaction' && !projection.state.trails.length
      ? '対応移動なしで進む' : allied ? '連合軍の移動を確定' : '移動を確定';
    actions.append(button(confirmLabel,
      () => step({type: 'moves', moves: movePlan, pausedReservations: [...pausedReservations]}),
      {primary: true, disabled: Boolean(orderDraft) || peiperDraft, id: 'confirm-moves'}));
  }

  function renderAttacks(panel, actions) {
    const allied = isAI();
    const kind = state.phase === 'counter' ? '反撃' : '攻撃';
    if (attackers.size || attackEdit != null) {
      const draft = element('div', null, 'controls');
      draft.append(element('strong', attackers.size ? `選択中 ${[...attackers].map(nameOf).join('、')}` : '攻撃部隊を選んでください。'));
      if (attackEdit != null) draft.append(button('変更を採用', () => chooseTarget(attackPlan[attackEdit].target),
        {disabled: !attackers.size, id: 'adopt-attack'}));
      draft.append(button('選択解除', () => { attackers.clear(); attackEdit = null; message = null; render(); }));
      panel.append(draft);
    }
    if (attackPlan.length || !allied)
      panel.append(element('h3', `${allied ? '連合軍AIの' : ''}${kind}案 ${attackPlan.length}件`));
    panel.append(element('p', `このフェイズの${kind}の組み合わせをすべて指定してから、まとめて確定します。`, 'hint'));
    const orders = element('ol', null, 'orders');
    attackPlan.forEach((order, index) => {
      const row = element('li', null, 'order');
      row.dataset.attack = order.target;
      const review = button(`${index+1}. ${location(order.target)}`, () => {
        reviewedAttack = reviewedAttack === order.target ? null : order.target;
        attackEdit = null; attackers.clear(); message = null; render();
        if (reviewedAttack) center(reviewedAttack);
      }, {pressed: reviewedAttack === order.target || index === attackEdit});
      review.append(element('small', order.attackers.map(nameOf).join('、')));
      row.append(review, button('変更', () => editAttack(index)), button('取消', () => {
        attackPlan = attackPlan.filter(value => value !== order);
        reviewedAttack = null; attackEdit = null; attackers.clear(); message = null; render();
      }));
      orders.append(row);
    });
    panel.append(orders);
    if (allied) panel.append(button(`AIの${kind}案に戻す`, () => {
      attackPlan = AI.attacks(state); reviewedAttack = null; attackEdit = null;
      attackers.clear(); message = null; render(); focusMap();
    }));
    const confirm = attackPlan.length ? `${kind}をすべて確定して判定へ（${attackPlan.length}件）`
      : `${kind}を確定（0件）`;
    actions.append(button(confirm, () => step({type: 'attacks', attacks: attackPlan}),
      {primary: true, disabled: attackers.size > 0 || attackEdit != null, id: 'confirm-attacks'}));
  }

  function renderBattle(panel, actions) {
    const info = R.battleInfo(state);
    panel.append(element('h3', `戦闘 ${info.number} / ${info.total} · ${location(info.target)}`));
    if (battlePractice && state.combat.from === 'attack') {
      const cases = element('div', null, 'controls');
      for (const {target} of state.combat.queue) {
        const label = practiceScenarios.find(order => order.target === target).label;
        cases.append(button(`${target} · ${label}`, () => step({type: 'prioritize-battle', target}), {
          pressed: target === info.target,
          disabled: Boolean(state.combat.revealed || state.combat.openSupport),
        }));
      }
      panel.append(cases);
    }
    if (!state.combat.revealed && (!info.attackers.length || !info.defenders.length)) {
      actions.append(button('戦闘処理を進める', () => step({type: 'roll'}), {primary: true}));
      return;
    }
    panel.append(element('p', '太枠が今回の攻撃先です。同じ色のヘクスがこの戦闘に参加します。', 'hint'));
    actions.append(button('戦闘結果へ', () => {
      const dialog = byId('battle-overview');
      renderBattleOverview();
      dialog.showModal();
    }, {primary: true, id: 'open-battle-overview'}));
  }

  function battleChoicesFor(choices, side) {
    return Object.fromEntries(Object.entries(choices)
      .filter(([id]) => R.unitById(state, id)?.side === side));
  }

  function setBattleChit(unit, id, tile) {
    const current = supportChoices[unit.id] ?? [];
    const adding = !current.includes(id);
    const next = adding ? [...current, id] : current.filter(chit => chit !== id);
    const revised = {...supportChoices, [unit.id]: next};
    const sideChoices = battleChoicesFor(revised, unit.side);
    let warning = '';
    if (adding && R.chit(id).kind === 'artillery') {
      const {attackers, defenders} = R.battleInfo(state);
      const participants = attackers[0].side === unit.side ? attackers : defenders;
      const artillery = participants.flatMap(member => sideChoices[member.id] ?? [])
        .filter(chit => R.chit(chit).kind === 'artillery');
      if (artillery.length > 1)
        warning = '砲兵支援は陣営ごとに1枚までです。変更するには、先に選んだ砲兵支援を解除してください。';
    }
    const dialog = byId('battle-overview');
    if (!warning) {
      try { R.combatProfile(state, sideChoices); }
      catch (error) { warning = error.message; }
    }
    if (warning) {
      dialog.querySelector('.battle-unit .battle-error')?.remove();
      const alert = element('p', warning, 'battle-error');
      alert.setAttribute('role', 'alert');
      tile.closest('.battle-chips').after(alert);
      alert.scrollIntoView?.({block: 'nearest'});
      return;
    }
    supportChoices = revised;
    message = null;
    renderBattleOverview();
    dialog.querySelector(`[data-battle-chit="${id}"]`)?.focus();
  }

  function battleUnitCard(unit, defensive, entry, revealed, restricted, stacked) {
    const card = element('section', null, 'battle-unit');
    const image = element('img');
    image.src = picture(unit);
    image.alt = '';
    const title = element('div', null, 'battle-unit-title');
    const description = element('div');
    const strength = unit.marker && stacked ? `防御支援 +${unit.defense}`
      : `${defensive ? unit.defense : unit.attack}戦力`;
    description.append(element('strong', unit.name + (unit.disrupted ? '（混乱）' : '')),
      element('p', `${unit.hex ?? '除去'} · ${strength}`, 'hint'));
    title.append(image, description);
    card.append(title);
    if (unit.marker) return card;

    const chips = element('div', null, 'battle-chips');
    const hiddenChit = () => stackFigure({src: 'assets/allied-support-back.jpg', label: '裏向きの支援チット'});
    if (revealed) {
      for (const id of entry.declared) {
        const status = revealed.shotDown.some(removed => removed.id === id) ? 'ATで除去'
          : revealed.dummies.some(removed => removed.id === id) ? 'ダミーを除去'
          : entry.cards.includes(id) ? '有効' : '地形で無効';
        const figure = stackFigure({src: R.chitImage(id), label: `${R.chit(id).label} · ${status}`});
        if (status !== '有効') figure.classList.add('inactive-chit');
        chips.append(figure);
      }
      if (!entry.declared.length) card.append(element('p', '使用チットなし', 'hint'));
      if (unit.side === 'allied') {
        for (const id of unit.support.filter(id => !entry.declared.includes(id))) chips.append(hiddenChit());
      }
    } else if (unit.side === 'allied') {
      card.append(element('p', `支援チット ${unit.support.length}枚`, 'hint'));
      for (let i = 0; i < unit.support.length; i++) chips.append(hiddenChit());
    } else {
      const chosen = supportChoices[unit.id] ?? [];
      const available = R.possibleSupport(unit, defensive);
      const legal = R.possibleSupport(unit, defensive, restricted);
      if (available.length) card.append(element('p', `使用するチット ${chosen.length} / 3枚`, 'hint'));
      if (legal.length < available.length)
        card.append(element('p', '地形により戦車系支援チットと砲兵支援を使用できません。', 'hint'));
      for (const id of available) {
        const active = chosen.includes(id);
        const tile = tileButton(`${R.chit(id).label} · ${active ? '使用' : '使わない'}`,
          R.chitImage(id), event => setBattleChit(unit, id, event.currentTarget), active);
        tile.dataset.battleChit = id;
        tile.disabled = !active && !legal.includes(id);
        chips.append(tile);
      }
      if (!available.length) card.append(element('p', '使用できるチットなし', 'hint'));
    }
    if (chips.childElementCount) card.append(chips);
    return card;
  }

  function rollFromOverview(die) {
    const animate = !state.combat.revealed.artillerySide &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    diceAnimating = animate;
    step({type: 'roll', die});
    if (!animate) return;
    const rolled = state.combat.rolled;
    let face = 0;
    const interval = window.setInterval(() => {
      const dice = byId('battle-die');
      if (dice) dice.textContent = '⚀⚁⚂⚃⚄⚅'[++face % 6];
    }, 95);
    window.setTimeout(() => {
      window.clearInterval(interval);
      diceAnimating = false;
      if (state.combat?.rolled === rolled) render();
    }, 850);
  }

  function renderBattleOverview() {
    const dialog = byId('battle-overview');
    const info = R.battleInfo(state);
    const {revealed, rolled, lossesApplied, openSupport} = state.combat;
    const pending = openSupport && R.combatProfile(state, openSupport.choices, openSupport.targets);
    const shown = revealed || (pending && {
      shotDown: pending.shotDown, dummies: [],
      attackGroup: pending.attackGroup.map(({unit, cards})=>({unit:unit.id, cards, declared:openSupport.choices[unit.id] ?? []})),
      defendGroup: pending.defendGroup.map(({unit, cards})=>({unit:unit.id, cards, declared:openSupport.choices[unit.id] ?? []})),
    });
    byId('battle-overview-title').textContent = `戦闘 ${info.number} / ${info.total} · ${location(info.target)}`;
    const content = byId('battle-overview-content');
    const controls = byId('battle-overview-actions');
    content.replaceChildren();
    controls.replaceChildren();

    if (message?.error) {
      const error = element('p', message.text, 'battle-error');
      error.setAttribute('role', 'alert');
      content.append(error);
    }
    if (lossesApplied) {
      content.append(battleResultCard(state.lastBattle));
      const canAdvance = R.advanceCandidates(state).length > 0;
      controls.append(button(canAdvance ? '戦闘後前進へ' : '戦闘処理を続ける', () => {
        dialog.close();
        step({type: 'continue-battle'});
      }, {primary: true, id: 'battle-continue'}));
      return;
    }

    const stage = diceAnimating ? 'ダイスを振っています…'
      : rolled ? '戦闘結果' : pending ? 'ATで除去する敵チットを選択' : revealed ? '支援チット公開・効果適用' : '使用する支援チットを選択';
    content.append(element('h3', stage, 'battle-stage'));

    if (diceAnimating) {
      const die = element('div', '⚀', 'battle-die rolling');
      die.id = 'battle-die';
      die.setAttribute('aria-hidden', 'true');
      content.append(die);
      return;
    }
    if (rolled) {
      const losses = {type: 'apply-battle-losses', preferDefenderLoss};
      const preview = R.apply(state, {...losses, side: R.actor(state), revision: state.revision});
      const marker = info.defenders.find(unit => unit.marker);
      const defender = info.defenders.find(unit => !unit.marker);
      if (marker && defender && preview.ok && preview.state.lastBattle.defendDamage > 0) {
        const assignment = selectBox('防御側の損害', [
          ['marker', `${marker.name}で1点消化`],
          ['defender', `${defender.name}を優先`],
        ], preferDefenderLoss ? 'defender' : 'marker', value => {
          preferDefenderLoss = value === 'defender';
          renderBattleOverview();
          byId('defense-loss-choice').focus();
        });
        assignment.querySelector('select').id = 'defense-loss-choice';
        content.append(assignment);
      }
      if (preview.ok) content.append(battleResultCard(preview.state.lastBattle, preview.state));
      controls.append(button('損害を適用', () => step(losses),
        {primary: true, id: 'apply-battle-losses'}));
      return;
    }

    const summary = element('p', `戦闘力 攻撃 ${info.attack} ／ 防御 ${info.defense}`, 'compact');
    content.append(summary);
    const armies = element('div', null, 'battle-armies');
    const germanDraft = shown ? null : R.combatProfile(state, battleChoicesFor(supportChoices, 'german'));
    for (const [label, units, defensive] of [['攻撃側', info.attackers, false], ['防御側', info.defenders, true]]) {
      const group = element('section', null, defensive ? 'battle-defense' : 'battle-attack');
      group.append(element('h3', `${label} · ${R.sideName(units[0].side)}`));
      for (const unit of units) {
        const entry = (defensive ? shown?.defendGroup : shown?.attackGroup)?.find(value => value.unit === unit.id);
        const restricted = unit.side === 'german' &&
          germanDraft?.attackGroup.some(value => value.unit.id === unit.id && value.supportRestricted);
        group.append(battleUnitCard(unit, defensive, entry, shown, restricted, units.length > 1));
      }
      armies.append(group);
    }
    content.append(armies);

    if (pending) {
      for (const {unit, id} of pending.nextAT) {
        controls.append(tileButton(`${nameOf(unit)}の${R.chit(id).label}を除去`,
          R.chitImage(id), () => step({type:'choose-at', chit:id})));
      }
      return;
    }
    if (!revealed) {
      const count = Object.values(battleChoicesFor(supportChoices, 'german')).reduce((sum, ids) => sum + ids.length, 0);
      controls.append(button(`確定して公開（ドイツ軍：${count ? count + '枚使用' : '使用なし'}）`,
        () => step({type: 'reveal-battle', support: supportChoices}),
        {primary: true, id: 'reveal-battle'}));
      return;
    }

    const overview = element('div', null, 'combat-overview');
    overview.append(element('strong', `判定に使う戦闘比 ${D.crtColumns[revealed.col]}`),
      element('p', `基本 ${D.crtColumns[revealed.base]} → 支援適用後 ${D.crtColumns[revealed.col]}`));
    if (revealed.dieAdd) overview.append(element('p', `出目に +${revealed.dieAdd}（上限6）`));
    if (revealed.deniedAT) overview.append(element('p', 'バルクマン軍曹により連合軍の対戦車火力は無効です。'));
    const alliedArtillery = revealed.artillerySide === 'allied';
    const die = alliedArtillery ? R.suggestedDie({...info, ...revealed}) : artilleryDie;
    if (alliedArtillery) overview.append(element('p', `連合軍の砲兵支援：AIが出目 ${die} を選択`));
    if (revealed.artillerySide && !alliedArtillery) {
      const choices = D.crt.map((_, index) => {
        const face = index + 1;
        const adjusted = Math.min(6, face + revealed.dieAdd);
        const result = D.crt[adjusted - 1][revealed.col];
        const damage = R.damageFor(result);
        return [face, `${face}${adjusted === face ? '' : `→${adjusted}`} · ${result}（攻${damage.attacker}／防${damage.defender}）`];
      });
      const picker = selectBox(`${R.sideName(revealed.artillerySide)}の砲兵が出目を指定`,
        [['', '出目を選択'], ...choices], die ?? '', value => {
          artilleryDie = value ? Number(value) : null;
          renderBattleOverview();
          byId('artillery-die').focus();
        });
      picker.querySelector('select').id = 'artillery-die';
      overview.append(picker);
    }
    content.append(overview);
    controls.append(button(revealed.artillerySide ? '指定した出目で判定' : 'ダイスを振る', () => rollFromOverview(die),
      {primary: true, id: 'roll-battle', disabled: Boolean(revealed.artillerySide && !die)}));
  }

  function renderAdvance(panel, actions) {
    const {hex, ids} = state.combat.advance;
    panel.append(element('p', `${location(hex)} に前進する部隊を1個選んでください。`, 'hint'));
    const controls = element('div', null, 'controls');
    for (const id of ids) {
      const unit = R.unitById(state, id);
      controls.append(tileButton(unit.name, picture(unit), () => {
        selected = id; inspected = id; render();
      }, selected === id));
    }
    panel.append(controls);
    actions.append(button('戦闘後前進をさせる', () => step({type: 'advance', unit: selected}),
      {primary: true, disabled: !selected, id: 'confirm-advance'}),
    button('前進せず戦闘処理を進める', () => step({type: 'advance', unit: null})));
  }

  function renderRecovery(panel, actions) {
    const side = R.actor(state);
    const disrupted = R.onMap(projection.state, side).filter(unit => unit.disrupted && !unit.marker);
    const unit = disrupted.find(value => value.id === selected);
    const pendingCost = recoveryOrders.length * 3;
    const usedPoints = (state.recoveryUndo?.length ?? 0) * 3 + pendingCost;
    const remainingPoints = state.supplyPoints - pendingCost;
    const supply = element('dl', null, 'recovery-supply');
    for (const [label, amount] of [['使用ポイント', usedPoints], ['残りポイント', remainingPoints]]) {
      const entry = element('div');
      entry.append(element('dt', label), element('dd', String(amount)));
      supply.append(entry);
    }
    panel.append(supply, element('p', '1部隊の回復に補給3ポイント', 'hint recovery-cost'));
    panel.append(element('p', `混乱中の部隊 ${disrupted.length}個${disrupted.length ? '（盤上の黄色い太枠）' : ''}`));
    if (unit) {
      const choice = element('div', null, 'result');
      choice.append(element('strong', `${unit.name} · ${location(unit.hex)}`));
      actions.append(button('回復', () => {
        recoveryOrders.push(unit.id);
        selected = null;
        message = null;
        render();
      }, {primary: true, disabled: remainingPoints < 3, id: 'prepare-recovery'}));
      panel.append(choice);
    } else if (disrupted.length) {
      panel.append(element('p', '地図上の黄色い太枠の駒をクリックして選びます。', 'hint'));
    }
    if (recoveryOrders.length) panel.append(element('p', `未確定の回復 ${recoveryOrders.length}個`, 'hint'));
    actions.append(
      button('回復をまとめて確定', () => step({type: 'recover-batch', units: recoveryOrders}),
        {primary: !unit && recoveryOrders.length > 0, disabled: !recoveryOrders.length, id: 'confirm-recovery'}),
      button('直前の回復を取り消す', () => step({type: 'undo-recovery'}),
        {disabled: !state.recoveryUndo?.length || recoveryOrders.length > 0, id: 'undo-recovery'}),
      button('次のフェイズへ', () => step({type: 'next'}),
        {disabled: recoveryOrders.length > 0, id: 'next-phase'}),
    );
  }

  function renderSupport(panel, actions) {
    if (reviewingAlliedSupport()) {
      const empty = !hasPhaseActions(state);
      const label = empty ? '配属なしで進む' : '配置を確認して次へ';
      actions.append(button(label, () => step({type: 'next'}, {emptyPhaseConfirmed: empty}),
        {primary: true, id: 'next-phase'}));
      return;
    }
    const canHold = R.canHoldCapturedSupport(state);
    if (card && canHold)
      panel.append(button('物資捕獲用に保留', () => step({type: 'hold-capture', chit: card}), {id: 'hold-capture'}));
    const {remaining, required} = R.supportPlacementStatus(state);
    const ready = state.supportConfirmed && !required;
    if (remaining) {
      const instruction = required
        ? canHold ? '次のフェイズに進む前に、配属するか物資捕獲用に保留してください。'
          : '次のフェイズに進む前に、残りを配属してください。'
        : '配属先がないため、次のフェイズへ進むとカップに戻ります。';
      actions.append(element('p', `未配属の支援チットが${remaining}枚あります。${instruction}`, 'support-warning'));
    }
    actions.append(
      button(required ? 'ここまでの配置を確定' : '配置を確定', () => step({type: 'confirm-support'}),
        {primary: !state.supportConfirmed, disabled: Boolean(state.supportConfirmed), id: 'confirm-support'}),
      button('直前の操作を取り消す', () => step({type: 'undo-support'}),
        {disabled: !state.supportUndo?.length, id: 'undo-support'}),
      button('次のフェイズへ', () => step({type: 'next'}),
        {primary: ready, disabled: !ready, id: 'next-phase'}),
    );
  }

  function renderAdmin(panel, actions) {
    const side = R.actor(state);
    if (state.phase === 'recovery') return renderRecovery(panel, actions);
    if (state.phase === 'support') return renderSupport(panel, actions);
    if (state.phase === 'supply') {
      const options = element('ul', null, 'orders');
      const kinds = {normal:'増援あり', special:'特別増援'};
      for (const index of state.stock[side]) {
        const [points, kind] = D.supply[side][index];
        const li = element('li', null, 'order');
        li.append(button(`${points} ポイント${kind ? ' · ' + kinds[kind] + '（移動後に登場）' : ''}`,
          () => step({type: 'supply', index})));
        options.append(li);
      }
      panel.append(options);
      return;
    }
    if (hasPendingEvent()) {
      if (!card) {
        panel.append(element('p', state.phase === 'reinforce'
          ? '地図の上のイベントチットを処理すると、残りの増援を配置できます。'
          : '地図の上から処理するイベントチットを選びます。', 'hint'));
        return;
      }
      const definition = R.chit(card);
      panel.append(element('h3', definition.label));
      panel.append(element('p', D.chitGuide[card.split(':')[0]].effects[0], 'hint'));
      if (definition.event === 'capture') {
        const held = state.captureHold ?? [];
        panel.append(element('p', held.length
          ? `保留した${held.length}枚。補給切れの部隊1個にまとめて配属します。`
          : '配属を保留した支援チットはありません。', 'hint'));
        if (held.length) {
          const chips = element('div', null, 'stack-pieces');
          for (const id of held) chips.append(stackFigure({src: R.chitImage(id), label: R.chit(id).label}));
          panel.append(chips);
          if (!legalHexes.size) panel.append(element('p', '対象部隊がいないため、処理すると保留分をカップに戻します。', 'hint'));
        }
      }
      if (definition.event === 'air' && legalHexes.size) {
        const controls = element('div', null, 'controls');
        controls.append(selectBox('空軍支援の効果', [['disrupt','混乱'],['pile','支援を失わせる']], eventEffect,
          value => { eventEffect = value; render(); }));
        panel.append(controls);
      }
      if (isAI()) {
        if (legalHexes.size) panel.append(element('p', `${location(eventDraft)}。変更する場合は別の候補ヘクスをクリックしてください。`, 'hint'));
        actions.append(button('イベントを確定', () => step({type: 'event', chit: card, hex: eventDraft, effect: eventEffect}),
          {primary: true, id: 'resolve-event'}));
      }
      else if (legalHexes.size) panel.append(element('p', '色が付いたヘクスをクリックするか、チットをそこへドラッグします。', 'hint'));
      else actions.append(button('イベントを処理', () => step({type: 'event', chit: card}), {primary: true, id: 'resolve-event'}));
      return;
    }
    let blocked = false;
    if (state.phase === 'reinforce') {
      if (draftingReinforcements() && reinforcementPlan.length) {
        actions.append(button('増援の配置を確定', () => step({type: 'place-reinforcements', placements: reinforcementPlan}),
          {primary: true, id: 'confirm-reinforcements'}));
        return;
      }
      const waiting = waitingReinforcements(state);
      blocked = waiting.some(unit => R.placements(state, unit.id).length);
      if (waiting.length && !blocked)
        panel.append(element('p', '連絡線の通じる空き都市・補給源など、配置条件を満たすヘクスがありません。', 'hint'));
    }
    if (state.phase === 'reentry') {
      const units = R.eligiblePlacements(state);
      if (reentryNotice) {
        const reason = element('p', reentryNotice, 'result');
        reason.setAttribute('role', 'status');
        panel.append(reason);
      }
      panel.append(element('p', units.length ? '部隊を選んでから、地図上の色が付いたヘクスを選びます。' :
        '今のフェイズで配置できる部隊はありません。', 'hint'));
      if (units.length) {
        const controls = element('div', null, 'controls');
        for (const unit of units) controls.append(tileButton(unit.name, picture(unit), () => {
          if (selected === unit.id) return clearMapSelection();
          selected = unit.id; inspected = unit.id; reentryHex = null; reentryNotice = ''; message = null; render();
          center([...legalHexes][0]);
        }, selected === unit.id));
        if (reentryHex) panel.append(element('p', `配置予定 ${location(reentryHex)}`, 'compact'));
        panel.append(controls);
        actions.append(button('再登場を確定', () => step({type: 'place', unit: selected, hex: reentryHex}),
          {primary: true, disabled: !reentryHex, id: 'confirm-reentry'}));
        return;
      }
    }
    actions.append(button('次のフェイズへ', () => step({type: 'next'}), {primary: true, disabled: blocked, id: 'next-phase'}));
  }

  function renderAdminPractice(panel, actions) {
    const side = state.turnSide;
    const sides = element('div', null, 'controls');
    for (const option of ['german', 'allied']) {
      sides.append(button(R.sideName(option), () => restartPractice(option), {pressed: side === option}));
    }
    if (eventPractice) {
      const choices = [['all', 'すべてのイベント'], ...eventChits(side).map(id => [id, R.chit(id).label])];
      if (side === 'allied') choices.push(['grounded', '空軍支援（飛行停止中）']);
      sides.append(selectBox('イベント', choices, practiceEvent, value => restartPractice(side, value)));
    }
    panel.append(sides);
    if (eventPractice) {
      renderAdmin(panel, actions);
      return;
    }
    if (supportPractice) {
      if (state.phase === 'support') {
        panel.append(element('p', `補給${supportPracticePoints}ポイントで${state.supportDraw.length}枚引きました。`, 'result'));
        renderAdmin(panel, actions);
      } else {
        panel.append(element('p', `支援チット取得を終了しました。次は「${R.phaseNames[state.phase]}」です。`, 'result'));
        if (state.captureHold?.length)
          panel.append(element('p', `物資捕獲用の${state.captureHold.length}枚はイベント解決で配属します。`, 'hint'));
        actions.append(button('支援チット取得をやり直す', () => restartPractice(side), {primary: true}));
      }
      return;
    }
    if (recoveryPractice) {
      if (state.phase === 'recovery') renderRecovery(panel, actions);
      else {
        panel.append(element('p', `混乱回復を終了しました。次は「${R.phaseNames[state.phase]}」です。`, 'result'));
        actions.append(button('回復をやり直す', () => restartPractice(side), {primary: true}));
      }
      return;
    }
    if (reentryPractice) {
      const [eligible, waiting] = reentrySamples[side].map(id => R.unitById(state, id));
      panel.append(element('p', `${waiting.name}は第${waiting.returnTurn}ターンから再登場できます。`, 'hint'));
      if (!eligible.hex) {
        panel.append(element('p', `${eligible.name}は今ターン再登場できます。連絡線の通じる自軍都市を選びます。`, 'hint'));
        renderAdmin(panel, actions);
        return;
      }
      const result = element('div', null, 'result');
      result.append(element('h3', `${eligible.name} · ${location(eligible.hex)} に再登場`),
        stackFigure({src: picture(eligible), label: '混乱状態'}),
        element('p', '次のフェイズは「混乱ユニット回復」です。', 'hint'));
      panel.append(result);
      actions.append(button('別の都市を試す', () => restartPractice(side), {primary: true}));
      return;
    }
    if (state.phase === 'supply') {
      panel.append(element('p', '未使用の補給チットから1枚選びます。', 'hint'));
      renderAdmin(panel, actions);
      return;
    }
    const [, kind] = D.supply[side][state.supplySelection];
    const result = element('div', null, 'result');
    result.append(element('h3', '選択結果'),
      element('p', `取得した補給ポイント ${state.supplyPoints}`),
      element('p', kind === 'normal' ? '増援あり' : kind === 'special' ? '特別増援あり' : '増援なし'),
      element('p', `残りの未使用チット ${state.stock[side].length}枚`),
      element('p', `次のフェイズは「${R.phaseNames[state.phase]}」です。`, 'hint'));
    panel.append(result);
    actions.append(button('別の補給チットを試す', () => restartPractice(side), {primary: true}));
  }

  function renderMovementOrder(panel, unit) {
    const order = unit.movementOrder;
    if (order) {
      const status = unit.hex === order.target ? '死守中' : movementOrderName(order.type);
      panel.append(element('p', `${status} · ${location(order.target)}`, 'compact'));
    }
    if (!R.canOrderUnit(state, unit)) return;
    const controls = element('div', null, 'controls');
    if (orderDraft?.unit === unit.id) {
      const {type, target} = orderDraft;
      panel.append(element('p', `${movementOrderName(type)} · ${target ? location(target) : '地図で目的地を選択'}`, 'hint'));
      controls.append(button('命令を確定', () => step({type: 'movement-order', unit: unit.id, order: {type, target}}),
        {primary: true, disabled: !target || !R.canOrderDestination(state, unit, target) ||
          (type === 'reserve' && target === unit.hex)}));
      controls.append(button('選択を取消', () => { orderDraft = null; message = null; render(); }));
    } else {
      controls.append(button(order?.type === 'reserve' ? '予約先を変更' : '移動予約', () => startMovementOrder(unit, 'reserve')),
        button(order?.type === 'hold' ? '死守先を変更' : '死守命令', () => startMovementOrder(unit, 'hold')));
      if (order) controls.append(button('命令を解除', () => step({type: 'movement-order', unit: unit.id, order: null})));
    }
    panel.append(controls);
  }

  function renderInspection() {
    const panel = byId('unit-info');
    panel.replaceChildren();
    if (state.phase === 'recovery') { panel.hidden = true; return; }
    const unit = R.unitById(projection.state, inspected);
    panel.hidden = !unit;
    if (!unit) return;
    if (moving() && ((selected === unit.id && !projection.state.trails.some(trail => trail.id === unit.id)) ||
        orderDraft?.unit === unit.id))
      renderMovementOrder(panel, R.unitById(state, unit.id));
    const ration = unit.support.find(id => R.chit(id).kind === 'ration');
    if ((moving() || planning()) && unit.side === 'german' && unit.side === R.actor(state) && unit.disrupted && ration)
      panel.append(button('Kレーションで回復', () => step({type: 'ration', unit: unit.id, chit: ration})));
    if ((unit.side === 'german' || supportPractice) && R.removableDummy(state, R.unitById(state, inspected)))
      panel.append(button('ダミーを1枚手元に戻す', () => step({type: 'remove-dummy', unit: unit.id})));
    panel.hidden = !panel.childElementCount;
  }

  function tableResultText(result) {
    const damage = R.damageFor(result);
    return `結果表（${result}） 攻撃側 ${damage.attacker}／防御側 ${damage.defender}`;
  }

  function battleResultCard(battle, board = state) {
    const {target, die, adjusted, odds, result, side, attackDamage, defendDamage, artillerySide, outcomes, shotDown} = battle;
    const summary = element('div', null, 'result');
    const preview = board !== state;
    summary.append(element('strong', `戦闘結果 · ${location(target)}`),
      element('p', `戦闘比 ${odds} · ${artillerySide ? R.sideName(artillerySide) + '砲兵が指定' : 'ダイスの出目'} ${die}${adjusted === die ? '' : ' → ' + adjusted}`),
      element('p', tableResultText(result)),
      element('p', `${preview ? '適用する' : '適用した'}損害 攻撃側 ${attackDamage}ずつ ／ 防御側 ${defendDamage}`));
    const armies = element('div', null, 'battle-result-armies');
    for (const [army, label, ids] of [[side, '攻撃側', battle.attackers], [R.enemy(side), '防御側', battle.defenders]]) {
      const group = element('section');
      group.append(element('h3', `${label} · ${R.sideName(army)}`));
      const counters = element('div', null, 'battle-result-counters');
      const changed = (outcomes ?? []).filter(outcome => R.unitById(board, outcome.unit)?.side === army);
      for (const id of new Set([...(ids ?? []), ...changed.map(outcome => outcome.unit)])) {
        const unit = R.unitById(board, id);
        if (!unit) continue;
        const removed = changed.some(outcome => outcome.unit === id && outcome.effect === 'removed') ||
          (!outcomes && unit.status === 'removed');
        const status = removed ? '除去' : unit.disrupted ? '混乱' : '通常';
        const piece = stackFigure({src: picture(unit), label: `${unit.name} · ${status}`});
        if (removed) {
          const cross = element('span', '×', 'battle-result-cross');
          cross.setAttribute('aria-hidden', 'true');
          piece.append(cross);
        }
        const unitResult = element('div', null, 'battle-result-unit');
        unitResult.append(piece);
        const entry = battle.support?.find(value => value.unit === id);
        if (entry?.declared.length) {
          const chips = element('div', null, 'battle-result-chits');
          const absorbed = changed.find(value => value.unit === id)?.absorbed ?? [];
          for (const chit of entry.declared) {
            const label = (shotDown ?? []).some(value => value.id === chit) ? 'ATで除去'
              : battle.dummies?.some(value => value.id === chit) ? 'ダミー除去'
              : absorbed.includes(chit) ? '損害を吸収'
              : !entry.cards.includes(chit) ? '無効'
              : R.chit(chit).discard ? '使用済み' : '使用';
            const chip = stackFigure({src: R.chitImage(chit), label});
            if (label.endsWith('除去') || label === '損害を吸収') chip.classList.add('spent-chit');
            chips.append(chip);
          }
          unitResult.append(chips);
        }
        counters.append(unitResult);
      }
      group.append(counters);
      armies.append(group);
    }
    summary.append(armies);
    const effects = element('ul', null, 'combat-effects');
    for (const {unit, id} of shotDown ?? [])
      effects.append(element('li', `${nameOf(unit)} · ${R.chit(id).label}を対戦車火力で喪失`));
    for (const {unit, damage, absorbed, effect, returnedUnused} of outcomes ?? []) {
      const changes = damage ? [`損害${damage}`] : [];
      if (absorbed.length) changes.push(`${absorbed.map(id => R.chit(id).label).join('・')}で${absorbed.length}点吸収`);
      if (effect) changes.push(effect === 'removed' ? '除去' : '残った損害で混乱（駒を裏返す）');
      if (returnedUnused) changes.push(`部隊除去に伴い未使用チット${returnedUnused}枚を回収`);
      if (changes.length) effects.append(element('li', `${nameOf(unit)} · ${changes.join('、')}`));
    }
    if (effects.childElementCount) {
      const details = element('details');
      details.append(element('summary', '損害の内訳'), effects);
      summary.append(details);
    }
    return summary;
  }

  function renderResult() {
    const panel = byId('battle-result');
    panel.replaceChildren();
    if (state.phase === 'resolve' && state.combat.lossesApplied && state.lastBattle)
      panel.append(battleResultCard(state.lastBattle));
  }

  function trayChit(id, action, {label = R.chit(id).label, pressed} = {}) {
    const tile = tileButton('', R.chitImage(id), action, pressed);
    tile.setAttribute('aria-label', label);
    tile.title ||= label;
    tile.dataset.chit = id;
    tile.querySelector('img').draggable = false;
    return tile;
  }

  function appendAssignableChit(tray, id, dragType = supportChitType) {
    const event = hasPendingEvent();
    const tile = trayChit(id, () => {
      if (event && isAI()) proposeEvent(id);
      else {
        card = card === id ? null : id;
        if (event) eventEffect = 'disrupt';
      }
      message = null;
      const scroll = tray.scrollLeft;
      render();
      tray.scrollLeft = scroll;
      tray.querySelector(`[data-chit="${id}"]`)?.focus({preventScroll: true});
      if (event && legalHexes.size === 1) center([...legalHexes][0]);
    }, {pressed: card === id});
    if (dragType) {
      tile.draggable = true;
      tile.addEventListener('dragstart', event => {
        event.dataTransfer.setData(dragType, id);
        event.dataTransfer.effectAllowed = 'move';
      });
    }
    tray.append(tile);
  }

  function renderSetup(actions) {
    const tray = byId('setup-chits');
    const scroll = tray.scrollLeft;
    tray.replaceChildren();
    tray.hidden = state.phase !== 'setup';
    if (tray.hidden) return;
    const side = R.actor(state);
    const required = R.setupPlacementRequired(state);
    const ready = state.setupConfirmed && !required;
    tray.setAttribute('aria-label', `${R.sideName(side)}の初期配置チット`);
    for (const id of state.hand)
      if (side !== 'german' || R.chit(id).kind !== 'dummy') appendAssignableChit(tray, id);
    tray.scrollLeft = scroll;
    if (R.setupBridgeOptions(state).length) {
      actions.append(button(editingSetupBridge ? '橋の訂正を取り消す' : '橋の位置を訂正', () => {
        editingSetupBridge = !editingSetupBridge;
        card = null;
        render();
      }, {id: 'edit-setup-bridge', pressed: editingSetupBridge}));
    }
    actions.append(
      button(required ? 'ここまでの配置を確定' : '配置を確定', () => step({type: 'confirm-setup'}),
        {primary: !state.setupConfirmed, disabled: Boolean(state.setupConfirmed), id: 'confirm-setup'}),
      button('直前の配置を取り消す', () => step({type: 'undo-setup'}), {disabled: !state.setupOrders.length}),
      button(side === 'allied' ? 'ドイツ軍の初期配置へ' : '移動フェイズへ',
        () => step({type: 'finish-setup'}), {primary: ready, disabled: !ready, id: 'finish-setup'}),
    );
  }

  function renderSupportTray() {
    const tray = byId('support-chits');
    const scroll = tray.scrollLeft;
    tray.replaceChildren();
    const events = hasPendingEvent();
    const reinforcements = state.phase === 'reinforce' && !events;
    tray.hidden = reviewingAlliedSupport() || (state.phase !== 'support' && !events && !reinforcements);
    if (tray.hidden) return;
    if (reinforcements) {
      tray.setAttribute('aria-label', '未配置の増援');
      for (const unit of waitingReinforcements(projection.state)) {
        const places = reinforcementPlaces(unit.id);
        const tile = tileButton('', picture(unit), () => {
          selected = selected === unit.id ? null : unit.id;
          message = null;
          render();
          tray.scrollLeft = scroll;
          tray.querySelector(`[data-reinforcement="${unit.id}"]`)?.focus({preventScroll: true});
          if (selected) center([...legalHexes][0]);
        }, selected === unit.id);
        const label = `${unit.group} ${unit.name}${places.length ? '' : '（配置先なし）'}`;
        tile.title = label;
        tile.setAttribute('aria-label', label);
        tile.dataset.reinforcement = unit.id;
        tile.querySelector('img').draggable = false;
        tile.disabled = !places.length;
        tile.draggable = !tile.disabled;
        tile.addEventListener('dragstart', event => {
          event.dataTransfer.setData(reinforcementType, unit.id);
          event.dataTransfer.effectAllowed = 'move';
        });
        tray.append(tile);
      }
      tray.scrollLeft = scroll;
      return;
    }
    const showDummies = supportPractice || R.actor(state) === 'allied';
    tray.setAttribute('aria-label', events ? '未処理のイベントチット'
      : showDummies ? '引いたチットと手元のダミー' : '引いたチット');
    if (events) {
      for (const id of state.events)
        appendAssignableChit(tray, id, R.eventOptions(state, id).length ? eventChitType : null);
      tray.scrollLeft = scroll;
      return;
    }
    const visibleChits = new Set([...(state.supportDraw ?? []), ...state.hand, ...state.events]);
    for (const id of visibleChits) {
      const {label, kind} = R.chit(id);
      if (state.hand.includes(id) && kind !== 'dummy') {
        appendAssignableChit(tray, id);
      } else if (state.events.includes(id)) {
        const figure = stackFigure({src: R.chitImage(id), label, caption: false});
        figure.classList.add('tile');
        figure.title ||= label;
        figure.dataset.chit = id;
        tray.append(figure);
      }
    }
    if (showDummies)
      for (const id of R.dummyReserve(state, R.actor(state))) appendAssignableChit(tray, id);
    for (const id of state.captureHold ?? []) {
      const label = `${R.chit(id).label}の保留を解除`;
      const tile = trayChit(id, () => step({type: 'release-capture', chit: id}), {label});
      tile.classList.add('chit-held');
      tile.title = `${label}。 ${tile.title}`;
      tray.append(tile);
    }
    tray.scrollLeft = scroll;
  }

  function aiPhaseOverview(phase) {
    if (!isAI() || orderDraft) return null;
    if (planning() && !attackPlan.length && !attackers.size && attackEdit == null) {
      const kind = R.phaseNames[phase];
      return {
        message: '連合軍の' + kind + 'はありません',
        nextLabel: `${kind}を確定（0件）`,
        next: () => step({type: 'attacks', attacks: []}, {emptyPhaseConfirmed: true}),
      };
    }
    if (moving() && phase !== 'reaction' && !projection.state.trails.length && !selected) {
      const kind = R.phaseNames[phase];
      return {
        message: '連合軍の' + kind + 'はありません',
        nextLabel: `${kind}なしで進む`,
        next: () => step({type: 'moves', moves: [], pausedReservations: [...pausedReservations]},
          {emptyPhaseConfirmed: true}),
      };
    }
    return null;
  }

  function announcePhase(turnLabel, phaseLabel, side, overview) {
    const key = [state.turn, state.turnSide, state.phase, side, phaseLabel].join('/');
    const overviewChanged = Boolean(overview) !== Boolean(announcedPhase?.overview);
    const phaseChanged = key !== announcedPhase?.key;
    if (!phaseChanged && !overviewChanged) return;
    const dismissed = !phaseChanged && announcedPhase.dismissed;
    announcedPhase = {key, overview, dismissed};
    const banner = byId('phase-announcement');
    const controls = byId('phase-overview-actions');
    window.clearTimeout(announcementTimer);
    banner.classList.toggle('ai-overview', Boolean(overview));
    byId('announced-turn').textContent = turnLabel;
    byId('announced-phase').textContent = overview?.message ??
      (side ? R.sideName(side) + ' · ' + phaseLabel : phaseLabel);
    controls.replaceChildren();
    controls.hidden = !overview;
    if (overview) {
      controls.append(
        button('地図を確認', () => {
          announcedPhase.dismissed = true;
          banner.hidden = true;
        }),
        button(overview.nextLabel, overview.next, {primary: true}),
      );
      banner.hidden = dismissed;
    } else {
      banner.hidden = !phaseChanged;
      announcementTimer = window.setTimeout(() => { banner.hidden = true; }, 2400);
    }
  }

  function showTurnStart() {
    const dialog = byId('turn-start-dialog');
    byId('turn-start-title').textContent = `第 ${state.turn} ターン 開始`;
    if (!dialog.open) dialog.showModal();
  }

  function render() {
    projection = moving() ? R.previewMoves(state, movePlan, pausedReservations)
      : draftingReinforcements() ? R.previewReinforcements(state, reinforcementPlan) : {state};
    const selectedMoved = moving() && projection.state.trails.some(trail => trail.id === selected);
    const committedMove = state.peiper && state.trails.some(trail => trail.id === selected);
    returnMoveButton.hidden = !selectedMoved || committedMove || countersHidden;
    if (state.phase === 'recovery' && recoveryOrders.length) {
      projection.state = {...state, units: state.units.map(unit =>
        recoveryOrders.includes(unit.id) ? {...unit, disrupted: false} : unit)};
    }
    const moveBase = moveBaseForSelection();
    range = movementRange(moveBase);
    const assistedHexes = new Set();
    if (range.size && moveSupport && !moveRepair) {
      const baseline = moveBase.infiltration?.[selected] ? {...moveBase, infiltration: undefined} : moveBase;
      const normal = R.movementOptions(baseline, selected, {mode: 'normal'});
      const mechanized = R.movementOptions(baseline, selected, {mode: 'mechanized'});
      for (const hex of range.keys())
        if (!normal.has(hex) && !mechanized.has(hex)) assistedHexes.add(hex);
    }
    byId('movement-support-legend').hidden = !assistedHexes.size;
    legalHexes = new Set();
    if (editingSetupBridge)
      legalHexes = new Set(R.setupBridgeOptions(state));
    else if (moving() && state.peiper?.stage === 'attack')
      legalHexes = new Set(R.peiperTargets(state, state.peiper.unit));
    else if (hasPendingEvent()) {
      if (card) legalHexes = new Set(R.eventOptions(state, card));
    }
    else if (state.phase === 'reinforce' && selected)
      legalHexes = new Set(reinforcementPlaces(selected));
    else if (state.phase === 'reentry' && selected)
      legalHexes = new Set(R.placements(state, selected));
    else if (assigningSupport() && card)
      legalHexes = new Set(supportRecipients().map(unit => unit.hex));

    const phase = state.phase;
    const side = R.actor(state);
    const {vt, monty, patton, highbeam, groundedFrom, groundedUntil, greif, nordwind} = state.flags;
    const {controlled, connected} = R.germanCityCounts(state);
    byId('german-city-count').textContent = `ドイツ軍支配都市 ${controlled}　連絡線あり ${connected} / 20`;
    const activeEvents = byId('active-events');
    const effects = [
      [vt, 'a-vt:1', '終局まで'],
      [monty, 'a-monty:1'],
      [patton, 'a-patton:1'],
      [highbeam, 'a-highbeam:1'],
      [groundedFrom > 0 && state.turn <= groundedUntil, 'g-bodenplatte:1',
        `第${groundedFrom}・${groundedUntil}ターン${state.turn < groundedFrom ? 'に発動予定' : 'に有効'}`],
      [greif === state.turn && state.turnSide === 'german', 'g-greif:1'],
      [nordwind, 'g-nordwind:1', '次の米軍増援まで'],
    ];
    activeEvents.replaceChildren();
    for (const [active, id, timing] of effects) {
      if (!active) continue;
      const label = R.chit(id).label;
      const tile = stackFigure({src: R.chitImage(id), label});
      if (timing) tile.querySelector('figcaption').append(document.createElement('br'), timing);
      activeEvents.append(tile);
    }
    activeEvents.hidden = !activeEvents.childElementCount;
    const turnLabel = battlePractice ? '練習戦闘 · 保存なし'
      : adminPractice ? `第${state.turn}ターン · 練習` : `第 ${state.turn} ターン`;
    let phaseLabel = R.phaseNames[phase];
    if (phase === 'resolve' || phase === 'advance') {
      const origin = R.phaseNames[state.combat.from];
      if (origin) phaseLabel = origin + 'の' + phaseLabel;
    } else if (phase === 'reinforce' && hasPendingEvent()) {
      phaseLabel = '増援登場（イベント処理）';
    } else if (phase === 'over') {
      phaseLabel = R.sideName(state.winner) + 'の勝利';
    }
    byId('turn').textContent = turnLabel;
    const actor = byId('actor');
    actor.textContent = side ? R.sideName(side) : '対局終了';
    actor.classList.toggle('allied', side === 'allied');
    byId('phase-title').textContent = phaseLabel;
    announcePhase(turnLabel, phaseLabel, side, aiPhaseOverview(phase));
    const reinforcementKind = D.supply[state.turnSide][state.supplySelection]?.[1];
    const reinforcementNotice = reinforcementKind && ['reentry', 'recovery', 'support', 'event', 'move'].includes(phase)
      ? `${reinforcementKind === 'special' ? '特別増援' : '増援'}を選択済み：このターンの通常移動後に登場します。` : '';
    const guidance = {
      setup: R.setupPlacementRequired(state)
        ? '地図の上の支援チットと駒を順にクリックするか、チットを駒にドラッグします。'
        : '必須チットの配置が済みました。配置を確定してから次へ進めます。',
      resolve:'両軍の支援チットを確認して戦闘を判定します。',
      advance:'戦闘後前進を選ぶと、この戦闘が終了します。',
      supply:'残りの補給チットから1枚選びます。',
      support:reviewingAlliedSupport()
        ? (alliedSupportPlacements().size ? '連合軍の配属先は青緑の太枠です。駒をクリックすると枚数を確認できます。'
          : '連合軍の支援チットの配属はありません。')
        : '地図の上のチットを選び、配属先の部隊をクリックします。',
      event:hasPendingEvent() ? '地図の上のイベントチットを選び、効果を適用します。' : '処理待ちのイベントはありません。',
      reinforce: draftingReinforcements() && reinforcementPlan.length ? '枠付きの増援をクリックすると配置先を変更できます。' : '',
    };
    byId('phase-detail').textContent = recoveryPractice && phase !== 'recovery' ? '混乱回復の練習はここまでです。'
      : supportPractice && phase !== 'support' ? '支援チット取得の練習はここまでです。'
      : reentryPractice ? '再登場できる部隊と配置先を確認します。'
      : supplyPractice ? '補給チットを選び、ポイントと増援の有無を確認します。'
      : moving()
      ? isAI() && projection.state.trails.length
        ? '赤い矢印は連合軍の移動経路です。駒をクリックして行き先を変えられます。'
        : '駒をクリックし、地図で移動先を選びます。'
      : planning()
        ? isAI() && attackPlan.length
          ? '対象と参加部隊を確認し、必要なら変更・取消してから確定してください。'
          : '味方の駒を選んでから、隣接する敵の駒を選びます。'
        : guidance[phase] ?? `${R.sideName(state.turnSide)}プレーヤーターン`;
    if (moving() && state.peiper?.stage === 'attack')
      byId('phase-detail').textContent = 'パイパー連隊の単独攻撃。隣接する敵を選びます。';
    else if (moving() && state.peiper?.stage === 'second')
      byId('phase-detail').textContent = 'パイパー連隊の再移動。移動力は5です。';
    if (reinforcementNotice) byId('phase-detail').append(' ', reinforcementNotice);
    if (editingSetupBridge) byId('phase-detail').textContent = '色の付いたヘクスをクリックして、橋の位置を訂正します。';
    const status = byId('message');
    status.hidden = !message;
    status.textContent = message?.text ?? '';
    status.classList.toggle('error', Boolean(message?.error));
    const panel = byId('panel'), actions = byId('actions');
    panel.inert = Boolean(orderDraft);
    panel.replaceChildren();
    actions.replaceChildren();
    renderSetup(actions);
    renderSupportTray();
    if (adminPractice && (!eventPractice || phase === 'event')) renderAdminPractice(panel, actions);
    else if (moving()) renderMovement(panel, actions, moveBase);
    else if (planning()) renderAttacks(panel, actions);
    else if (phase === 'resolve') renderBattle(panel, actions);
    else if (phase === 'advance') renderAdvance(panel, actions);
    else if (phase === 'over') panel.append(element('p', state.log.at(-1).text));
    else if (phase !== 'setup') renderAdmin(panel, actions);
    renderResult();
    if (phase === 'resolve' && byId('battle-overview').open) renderBattleOverview();
    renderInspection();
    byId('log').replaceChildren(...state.log.slice(-30).reverse().map(entry => element('li', `第${entry.turn}ターン · ${entry.text}`)));
    drawMap(moveBase, assistedHexes);
  }

  byId('board').addEventListener('dragover', event => {
    if (countersHidden) return;
    const type = hasPendingEvent() ? eventChitType
      : assigningSupport() ? supportChitType : state.phase === 'reinforce' ? reinforcementType : null;
    if (!type || !event.dataTransfer.types.includes(type)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  byId('board').addEventListener('drop', event => {
    if (countersHidden) return;
    const destination = event.target.closest('[data-hex], [data-unit]');
    const hex = destination?.dataset.hex ?? R.unitById(projection.state, destination?.dataset.unit)?.hex;
    if (assigningSupport()) {
      const chit = event.dataTransfer.getData(supportChitType);
      if (!chit) return;
      event.preventDefault();
      return assignSupportAt(hex, chit, destination?.dataset.unit);
    }
    if (state.phase === 'reinforce' && !hasPendingEvent()) {
      const unit = event.dataTransfer.getData(reinforcementType);
      if (!unit) return;
      event.preventDefault();
      return placeReinforcement(unit, hex);
    }
    if (!hasPendingEvent()) return;
    const id = event.dataTransfer.getData(eventChitType);
    if (!state.events.includes(id)) return;
    event.preventDefault();
    if (!R.eventOptions(state, id).includes(hex)) return note('このヘクスにはイベントを適用できません。', true);
    if (isAI()) {
      if (card !== id) proposeEvent(id);
      eventDraft = hex;
      return render();
    }
    step({type: 'event', chit: id, hex, effect: card === id ? eventEffect : 'disrupt'});
  });

  byId('zoom').addEventListener('input', event => {
    const viewport = byId('map-scroll');
    const oldScale = parseFloat(byId('zoom-value').textContent)/100;
    const x = (viewport.scrollLeft + viewport.clientWidth/2)/oldScale;
    const y = (viewport.scrollTop + viewport.clientHeight/2)/oldScale;
    const scale = Number(event.target.value)/100;
    byId('zoom-value').textContent = event.target.value + '%';
    byId('board').style.width = 1888*scale + 'px';
    viewport.scrollLeft = x*scale - viewport.clientWidth/2;
    viewport.scrollTop = y*scale - viewport.clientHeight/2;
  });
  const returnMoveButton = button('この部隊を元に戻す', returnSelectedMove, {id: 'return-move', primary: true});
  returnMoveButton.hidden = true;
  byId('actions').before(returnMoveButton);
  const cavalryLegend = element('span', '騎兵連隊のZOC（赤い破線）');
  cavalryLegend.hidden = true;
  byId('movement-support-legend').textContent = 'チットを使うと到達可能';
  document.querySelector('.map-legend').append(cavalryLegend);
  const toggleCounters = button('駒を隠す', () => {
    countersHidden = !countersHidden;
    for (const id of ['counters', 'marks', 'routes'])
      byId(id).style.display = countersHidden ? 'none' : '';
    byId('hexes').style.opacity = countersHidden ? '0' : '';
    cavalryLegend.hidden = countersHidden || !byId('routes').querySelector('polygon');
    if (countersHidden) hideStack();
    returnMoveButton.hidden = countersHidden || !moving() ||
      !projection.state.trails.some(trail => trail.id === selected);
    toggleCounters.setAttribute('aria-pressed', String(countersHidden));
    toggleCounters.textContent = countersHidden ? '駒を表示' : '駒を隠す';
  }, {id: 'toggle-counters', pressed: false});
  toggleCounters.setAttribute('aria-controls', 'counters marks routes');
  byId('zoom-value').after(toggleCounters);
  byId('toggle-command').addEventListener('click', event => {
    const panel = byId('command-panel');
    panel.hidden = !panel.hidden;
    panel.closest('.game').classList.toggle('command-hidden', panel.hidden);
    const toggle = event.currentTarget;
    const label = panel.hidden ? '右パネルを表示' : '右パネルを隠す';
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.textContent = panel.hidden ? '◀' : '▶';
  });
  const mapCoordinate = byId('map-coordinate');
  byId('hexes').addEventListener('pointermove', event => {
    const hex = event.target.getAttribute('data-hex');
    if (!hex || !mapInspection) return;
    showCoordinates(hex);
    mapCoordinate.textContent = hex;
    mapCoordinate.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 55)}px`;
    mapCoordinate.style.top = `${Math.min(event.clientY + 14, window.innerHeight - 26)}px`;
    mapCoordinate.hidden = false;
  });
  byId('hexes').addEventListener('pointerleave', () => { mapCoordinate.hidden = true; });
  const inspections = [
    {mode: 'city', label: '勝利条件の都市', toggle: byId('toggle-city-data')},
    {mode: 'road', label: '道路', toggle: byId('toggle-road-data')},
    {mode: 'river', label: '河川', toggle: byId('toggle-river-data')},
    {mode: 'terrain', label: '尾根・森林', toggle: byId('toggle-terrain-data')},
  ];
  for (const {mode, toggle} of inspections) {
    toggle.hidden = mode !== 'city' && query.get('inspect') !== 'map';
    toggle.addEventListener('click', () => {
      mapInspection = mapInspection === mode ? null : mode;
      for (const option of inspections) {
        const active = mapInspection === option.mode;
        byId('board').classList.toggle(`${option.mode === 'city' ? 'cities' : option.mode + 's'}-visible`, active);
        option.toggle.setAttribute('aria-pressed', String(active));
        option.toggle.textContent = `${option.label}${option.mode === 'city' ? '' : 'データ'}を${active ? '隠す' : '表示'}`;
      }
      byId('victory-city-legend').hidden = mapInspection !== 'city';
      byId('road-data').toggleAttribute('hidden', mapInspection !== 'road');
      mapCoordinate.hidden = true;
    });
  }
  byId('close-stack-overview').addEventListener('click', hideStack);
  byId('close-chit-detail').addEventListener('click', closeChitDetail);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || byId('transport-dialog').open || byId('empty-phase-dialog').open) return;
    if (!byId('chit-detail').hidden) {
      event.preventDefault();
      return closeChitDetail();
    }
    if (document.querySelector('dialog[open]')) return;
    if (selected || inspected || card || orderDraft || attackers?.size || attackEdit != null) {
      event.preventDefault();
      clearMapSelection();
    }
  });
  byId('battle-overview').addEventListener('close', () => {
    if (byId('battle-overview').contains(byId('chit-detail'))) closeChitDetail();
  });
  byId('open-help').addEventListener('click', () => byId('help').showModal());
  byId('save-game-file').addEventListener('click', saveGameFile);
  byId('load-game-file').addEventListener('click', () => byId('game-file').click());
  byId('game-file').addEventListener('change', event => loadGameFile(event.target));

  function openStartDialog() {
    byId('start-replace-note').hidden = !state;
    byId('start-back').hidden = !state;
    byId('start-error').hidden = true;
    byId('start-dialog').showModal();
  }

  byId('start-load-file').addEventListener('click', () => {
    byId('start-error').hidden = true;
    byId('game-file').click();
  });
  byId('turn-start-dialog').addEventListener('cancel', event => event.preventDefault());
  byId('start-dialog').addEventListener('cancel', event => {
    if (!state) event.preventDefault();
  });
  const helpTerms = [...byId('help').querySelectorAll('dt')];
  const stackHelp = helpTerms.find(term => term.textContent === '駒と支援チット');
  if (stackHelp?.nextElementSibling) stackHelp.nextElementSibling.textContent =
    '支援チットは駒の下に重なっています。駒をクリックすると右パネルで内訳を確認できます。相手の未公開チットは裏向きで表示します。';
  const movementHelp = helpTerms.find(term => term.textContent === '移動');
  if (movementHelp?.nextElementSibling) movementHelp.nextElementSibling.textContent =
    '駒をクリックし、色の付いた移動先をクリックします。移動方式は行き先に応じて自動で決まります。同じ駒をもう一度クリックするかEscで選択を解除できます。移動済みの駒はクリックすると経路が出ます。右パネルの「この部隊を元に戻す」で置き直せます。「移動を確定」でフェイズを進めます。輸送力を超える場合は確定前に警告が出ます。';
  const orderHelp = helpTerms.find(term => term.textContent === '移動予約・死守命令');
  if (orderHelp?.nextElementSibling) orderHelp.nextElementSibling.prepend('連合軍だけが使えます。');
  byId('start-local').textContent = 'ドイツ軍を操作（連合軍はAI補助）';
  byId('start-local').parentElement.querySelector('button:last-child').hidden = true;
  byId('start-local').addEventListener('click', () => {
    state = fresh('ai');
    announcedPhase = null;
    byId('start-dialog').close();
    document.querySelector('.game').hidden = false;
    closeChitDetail();
    save();
    prepare();
    render();
    focusMap();
    showTurnStart();
  });

  function restartPractice(side, event = 'all') {
    practiceEvent = event;
    practiceEventSide = side;
    state = adminPractice ? practiceAdministration(side, event) : practiceBattle();
    announcedPhase = null;
    prepare(!adminPractice);
    render();
    focusMap();
  }
  if (practice) {
    byId('save-game-file').hidden = true;
    byId('load-game-file').hidden = true;
    byId('new-game').textContent = eventPractice ? 'イベント練習をやり直す'
      : recoveryPractice ? '混乱回復をやり直す' : reentryPractice ? '再登場をやり直す'
      : supportPractice ? '支援チット取得をやり直す' : supplyPractice ? '補給取得をやり直す' : '戦闘をやり直す';
  }
  byId('new-game').addEventListener('click', () => {
    if (practice) {
      restartPractice(eventPractice ? practiceEventSide : state.turnSide, practiceEvent);
      return;
    }
    openStartDialog();
  });
  initMap();
  if (state) {
    prepare(!adminPractice);
    render();
    focusMap();
  } else {
    document.querySelector('.game').hidden = true;
    openStartDialog();
  }
})();
