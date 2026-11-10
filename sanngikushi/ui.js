'use strict';

(() => {
  const { areas, factions, leaders, cards, caoLeaders, setupSlots, defaultSetup, capitals } = Campaign;
  const rules = ThreeKingdoms;
  const $ = id => document.getElementById(id);
  const gameDialog = $('gameDialog');
  const storeKey = 'kodoku-cao-campaign-v1';
  const image = (n, type = 'cards') => `assets/${type}/${String(n).padStart(2, '0')}.webp`;
  const esc = value => String(value).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const areaLabel = id => areas[id]?.name || '補充プール';
  const panelTitle = (kicker, title) => `<p class="kicker">${kicker}</p><h2>${title}</h2>`;
  const button = (id, text, options = {}) =>
    `<button type="button" data-do="${id}"${options.value ? ` data-value="${options.value}"` : ''}${options.primary ? ' class="primary"' : ''}${options.disabled ? ' disabled' : ''}>${text}</button>`;
  const detail = (id, count) => `<span class="faction-label"><i style="--faction:${factions[id].color}"></i>${factions[id].name}${count === undefined ? '' : ` <b>${count}</b>`}</span>`;

  let saved = readSave();
  let state = null;
  let selected = 'xu';
  let zoom = 1;
  let following = null;
  let marchExtra = '';
  let marchTroops = null;
  let opened = null;
  let animatingReport = null;
  let setupRoster = [...defaultSetup];
  let setupLeader = null;

  function readSave() {
    try {
      const value = JSON.parse(localStorage.getItem(storeKey));
      return value?.version === 1 && value.board && value.location && Array.isArray(value.log) ? value : null;
    } catch { return null; }
  }

  function persist() {
    try { localStorage.setItem(storeKey, JSON.stringify(state)); saved = state; }
    catch { /* The current session remains playable if file storage is unavailable. */ }
  }

  function setupForm() {
    setupRoster = [...defaultSetup];
    setupLeader = null;
    $('setupError').textContent = '';
    setupView('武将を選んでください。');
    $('resume').hidden = !saved;
  }

  function setupView(message) {
    $('setupSelection').textContent = message;
    $('setupRoster').innerHTML = caoLeaders.map(id => {
      const { name, valor, intel, image: portrait } = leaders[id];
      return `<button type="button" class="setup-leader" data-setup-leader="${id}" aria-pressed="${setupLeader === id}">
        <img src="${image(portrait, 'units')}" alt="">
        <span><strong>${name}</strong><small>武勇 ${valor} ／ 知略 ${intel}</small>
        <small class="setup-effect">${cards[id].description}</small></span>
        <span class="tag">${areaLabel(setupSlots[setupRoster.indexOf(id)])}</span></button>`;
    }).join('');
    $('setupSlots').innerHTML = [...new Set(setupSlots)].map(id => {
      const { x, y, name } = areas[id];
      const slots = setupSlots.flatMap((place, i) => place === id ? [i] : []);
      return `<div class="setup-map-area" style="--x:${x / 1342 * 100}%;--y:${y / 1888 * 100}%">
        <strong>${name}</strong><div class="setup-map-slots">${slots.map((i, n) => {
          const leader = setupRoster[i];
          const position = slots.length > 1 ? `${name} ${n + 1}` : name;
          return `<button type="button" data-setup-slot="${i}" aria-label="${position}、${leaders[leader].name}"
            aria-pressed="${setupLeader === leader}">${leaders[leader].name}</button>`;
        }).join('')}</div></div>`;
    }).join('');
  }

  $('setupRoster').addEventListener('click', event => {
    const target = event.target.closest('[data-setup-leader]');
    if (!target) return;
    setupLeader = target.dataset.setupLeader;
    setupView(`${leaders[setupLeader].name}を選択中。地図上の配置枠を押してください。`);
    $('setupRoster').querySelector(`[data-setup-leader="${setupLeader}"]`)?.focus();
  });
  $('setupSlots').addEventListener('click', event => {
    const target = event.target.closest('[data-setup-slot]');
    if (!target) return;
    const index = Number(target.dataset.setupSlot);
    const occupant = setupRoster[index];
    if (!setupLeader) {
      setupLeader = occupant;
      setupView(`${leaders[setupLeader].name}を選択中。移動先の配置枠を押してください。`);
    } else {
      const source = setupRoster.indexOf(setupLeader);
      setupRoster[source] = occupant;
      setupRoster[index] = setupLeader;
      const name = leaders[setupLeader].name;
      setupLeader = null;
      setupView(`${name}を${areaLabel(setupSlots[index])}に配置しました。`);
    }
    $('setupSlots').querySelector(`[data-setup-slot="${index}"]`)?.focus();
  });

  function enterGame(value) {
    state = value;
    selected = 'xu';
    following = null;
    zoom = 1;
    $('start').hidden = true;
    $('game').hidden = false;
    $('resetButton').hidden = false;
    applyZoom();
    render();
    if (state.phase !== 'movement') requestAnimationFrame(() => center('xu', 'instant'));
  }

  $('setupForm').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!rules.validSetup(setupRoster)) {
      $('setupError').textContent = '曹操軍の将軍5人を、重複なしで選んでください。';
      return;
    }
    $('setupError').textContent = '';
    const next = rules.create(setupRoster, {
      captureOnly: form.has('captureOnly'), leaderDeath: form.has('leaderDeath'), fastBattle: form.has('fastBattle'),
    });
    enterGame(next);
  });
  $('resume').addEventListener('click', () => enterGame(saved));
  $('resetButton').addEventListener('click', () => modal('reset', `
    ${panelTitle('初期配置', '新しいゲーム')}
    <p>初期配置の画面に戻ります。新しいゲームを開始するとセーブが更新されます。</p>
    <div class="button-row">${button('close', '取消')}${button('reset', '初期配置に戻る', { primary: true })}</div>`));
  $('helpButton').addEventListener('click', () => $('helpDialog').showModal());
  $('helpClose').addEventListener('click', () => $('helpDialog').close());
  $('zoomOut').addEventListener('click', () => resize(zoom - .25));
  $('zoomIn').addEventListener('click', () => resize(zoom + .25));
  $('zoomReset').addEventListener('click', () => resize(0));
  $('centerMap').addEventListener('click', () => { if (!zoom) resize(1); center('xu'); });
  $('confirmMovement').addEventListener('click', () => {
    if (!rules.confirmMovement(state)) return;
    if (state.phase === 'result' && !state.end) rules.done(state);
    render();
    if (state.phase === 'ready') $('draw').focus();
  });
  $('cancelMovement').addEventListener('click', () => {
    const movement = state.movement;
    if (!rules.cancelMovement(state)) return;
    marchTroops = movement.troops;
    marchExtra = movement.leaders[1] || '';
    render();
    $('marchPanel').scrollIntoView({ block: 'start' });
    $('marchTroops').focus({ preventScroll: true });
  });
  $('draw').addEventListener('click', () => {
    if (state.turn === 0) showFirst();
    else change(rules.draw(state));
  });
  $('finishDisband').addEventListener('click', () => {
    if (state.phase !== 'disband' || !rules.done(state)) return;
    if (state.phase === 'result' && !state.end) rules.done(state);
    render();
    if (state.phase === 'ready') $('draw').focus();
  });
  $('lastCard').addEventListener('click', () => {
    previewCard(state.last);
  });

  function previewCard(id) {
    const c = cards[id];
    modal('preview', `<div class="preview"><img src="${c ? image(c.image) : 'assets/cards/back.webp'}" alt="${c?.name || '天命札の裏面'}"><div>${panelTitle('天命札', c?.name || '山札')}${c ? `<p>${c.description}</p>` : ''}${button('close', '閉じる', { primary: true })}</div></div>`);
  }

  function applyZoom() {
    const v = $('viewport');
    const fullWidth = Math.min(v.clientWidth, v.clientHeight * 1342 / 1888);
    $('board').style.width = `${zoom ? v.clientWidth * zoom : fullWidth}px`;
    $('zoomOut').disabled = !!zoom && zoom <= .75;
    $('zoomIn').disabled = zoom === 2.5;
  }

  function resize(level) {
    const v = $('viewport'), b = $('board');
    const point = [(v.scrollLeft + v.clientWidth / 2) / b.clientWidth, (v.scrollTop + v.clientHeight / 2) / b.clientHeight];
    zoom = level ? Math.max(.75, Math.min(2.5, level)) : 0;
    applyZoom();
    v.scrollTo({ left: point[0] * b.clientWidth - v.clientWidth / 2, top: point[1] * b.clientHeight - v.clientHeight / 2 });
  }

  function center(id, behavior = 'smooth') {
    if (!areas[id]) return;
    const { x, y } = areas[id], v = $('viewport'), b = $('board');
    v.scrollTo({ left: x / 1342 * b.clientWidth - v.clientWidth / 2,
      top: y / 1888 * b.clientHeight - v.clientHeight / 2, behavior });
  }
  window.addEventListener('resize', () => { if (!$('game').hidden) applyZoom(); });

  function focusMovement() {
    if (state.phase !== 'movement') return;
    const v = $('viewport');
    const points = state.route.map(id => areas[id]);
    const xs = points.map(a => a.x), ys = points.map(a => a.y);
    const margin = v.clientWidth < 600 ? 105 : 175;
    const maxScale = Math.min((v.clientWidth - margin) / Math.max(1, Math.max(...xs) - Math.min(...xs)),
      (v.clientHeight - 90) / Math.max(1, Math.max(...ys) - Math.min(...ys)));
    const routeZoom = Math.max(.15, maxScale * 1342 / v.clientWidth);
    if (zoom && zoom > routeZoom) { zoom = routeZoom; applyZoom(); }
    const scale = $('board').clientWidth / 1342;
    v.scrollTo({ left: (Math.min(...xs) + Math.max(...xs)) * scale / 2 - v.clientWidth / 2,
      top: (Math.min(...ys) + Math.max(...ys)) * scale / 2 - v.clientHeight / 2 });
    $('movementBanner').scrollIntoView({ block: 'start' });
    $('confirmMovement').focus({ preventScroll: true });
  }

  function boardView() {
    const moves = state.phase === 'march' ? rules.paths(state, state.active.leader) : {};
    const movement = state.phase === 'movement' ? state.movement : null;
    $('movementBanner').hidden = !movement;
    $('cancelMovement').hidden = !rules.canCancelMovement(state);
    if (movement) {
      const { name, faction } = leaders[movement.leader];
      const arrival = state.route.at(-1);
      const invading = faction !== 'cao' && (state.board[arrival].owner === 'cao' || rules.count(state, arrival, 'cao') > 0);
      $('movementTitle').textContent = `${name}（${factions[faction].name}）${invading ? 'が侵入' : 'が行軍'}`;
      const escort = movement.leaders.slice(1).map(id => leaders[id].name).join('・');
      $('movementRoute').textContent = `${state.route.map(areaLabel).join(' → ')}　軍勢 ${movement.troops}駒${escort ? `・同行将軍 ${escort}` : ''}`;
      $('movementBanner').classList.toggle('enemy', faction !== 'cao');
    }
    $('mapHint').textContent = state.phase === 'march' ? '軍勢の数を選び、明るい枠の拠点を押してください。' : '拠点を選ぶと駒の内訳を表示します。';
    $('areaNodes').innerHTML = Object.values(areas).map(a => {
      const owner = state.board[a.id].owner;
      const groups = rules.factionList(state, a.id).map(faction => ({
        faction, here: rules.present(state, a.id, faction), count: rules.troops(state, a.id, faction),
      }));
      const summary = groups.map(({ faction, here, count }) =>
        `${factions[faction].name} ${here.map(id => leaders[id].name).join('・')} 軍勢 ${count}駒`).join('、');
      const stacks = groups.map(({ faction, here, count }) => `
        <span class="area-stack" style="--army:${factions[faction].color}">
          ${here[0] ? `<img src="${image(leaders[here[0]].image, 'units')}" alt="">` : ''}
          <span><small class="stack-faction">${factions[faction].name}</small>
          ${here.map(id => `<strong>${leaders[id].name}</strong>`).join('')}<small>軍勢 ${count}駒</small></span>
        </span>`).join('');
      const classes = [a.id === selected ? 'selected' : '', moves[a.id] ? 'reachable' : '',
        rules.hostile(state, a.id, 'cao') && rules.count(state, a.id, 'cao') ? 'contested' : '',
        movement && state.route.at(-1) === a.id ? 'arrival' : ''].join(' ');
      return `<button type="button" class="area-node ${classes}" data-do="area" data-value="${a.id}"
        style="--x:${a.x / 1342 * 100}%;--y:${a.y / 1888 * 100}%;--faction:${factions[owner].color}"
        aria-label="${a.name}、${factions[owner].name}支配、${summary || '駒なし'}${moves[a.id] ? '、行軍可能' : ''}">
        ${stacks || '<small>0 駒</small>'}
      </button>`;
    }).join('');
    const route = $('route');
    route.innerHTML = '';
    if (movement) {
      route.innerHTML = state.route.slice(1).map((id, i) => {
        const from = areas[state.route[i]], to = areas[id];
        const [x, y] = [from.x + (to.x - from.x) * .76, from.y + (to.y - from.y) * .76];
        return `<path d="M${from.x},${from.y} L${x},${y}" fill="none" stroke="#fff9e5" stroke-width="32" stroke-linecap="round"/>
          <path d="M${from.x},${from.y} L${x},${y}" fill="none" stroke="#c5221f" stroke-width="24" stroke-linecap="round" marker-end="url(#arrow)"/>`;
      }).join('');
    }
    const tracks = { liu: [724, 132], sun: [724, 206], biao: [724, 278], shao: [1125, 352] };
    $('mapTracks').innerHTML = Object.entries(tracks).map(([id, [x, y]]) =>
      `<span class="track-pin" style="--x:${(x + 57.5 * state.track[id]) / 1342 * 100}%;--y:${y / 1888 * 100}%;--faction:${factions[id].color}">${factions[id].name[0]}</span>`).join('') +
      (state.location.zhu === 'track' ? `<span class="track-pin" style="--x:${(952 + 58 * state.kongming) / 1342 * 100}%;--y:${52 / 1888 * 100}%;--faction:#803f39">亮</span>` : '');
  }

  function statusView() {
    $('factions').innerHTML = Object.entries(factions).map(([id, f]) => {
      const active = !f.track || state.track[id] === f.track;
      const onMap = Object.keys(areas).reduce((n, area) => n + rules.troops(state, area, id), 0);
      const pool = state.pool[id];
      const stage = state.dead.includes(id) ? '滅亡' : f.track ? (active ? '参戦' : `${state.track[id]} / ${f.track}`) : '参戦中';
      return `<article class="faction-card" style="--faction:${f.color}"><div>${detail(id)} <span class="tag">${stage}</span></div>
        ${f.track ? `<progress max="${f.track}" value="${state.track[id]}" aria-label="${f.name}の参戦トラック"></progress>` : ''}
        <p>軍勢駒　盤上 <b>${onMap}</b>　補充 <b>${pool}</b>${id === 'liu' ? `　予備 <b>${state.reserve}</b>` : ''}</p></article>`;
    }).join('');
    $('roster').innerHTML = Object.values(leaders).map(leader => {
      const location = state.location[leader.id];
      const place = location === 'out' ? '除外' : location === 'track' ? `孔明出蘆 ${state.kongming} / 6` : areaLabel(location);
      return `<div class="roster-row"><img src="${image(leader.image, 'units')}" alt=""><div><strong>${leader.name}</strong>
        <small>${leader.valor === null ? '知略' : '武勇／知略'} ${leader.valor === null ? leader.intel : `${leader.valor}／${leader.intel}`}</small></div>
        <span>${place}</span></div>`;
    }).join('');
  }

  function detailView() {
    const a = areas[selected];
    const owner = state.board[selected].owner;
    const isBase = Object.values(factions).some(f => f.base === selected) || capitals.includes(selected);
    return `<div class="area-details"><div class="section-heading"><h3>${a.name}</h3>${isBase ? '<span class="tag">本拠地・州都</span>' : ''}</div>
      <p class="muted">支配　${detail(owner)}　地形能力 2／1</p>
      ${rules.factionList(state, selected).map(faction => `<div class="army-line">${detail(faction)}
        <small>${rules.present(state, selected, faction).map(id => leaders[id].name).join('・') || '将軍なし'} ／ 軍勢駒 ${rules.troops(state, selected, faction)}</small></div>`).join('') || '<p class="muted">駒なし</p>'}</div>`;
  }

  function marchChoices(leader) {
    const at = state.location[leader];
    const extra = marchExtra || null;
    return Array.from({ length: Math.min(10, rules.troops(state, at, 'cao')) + 1 }, (_, n) => n)
      .filter(n => rules.canMarch(state, leader, n, extra));
  }

  function marchView() {
    const panel = $('marchPanel');
    panel.hidden = state.phase !== 'march';
    if (panel.hidden) return;
    const leader = state.active.leader;
    const origin = state.location[leader];
    const eligible = marchChoices(leader);
    if (!eligible.includes(marchTroops)) marchTroops = eligible.at(-1) ?? null;
    panel.innerHTML = `<h3>${leaders[leader].name}の行軍</h3>
      <div class="button-row">
        <label class="stack-label">連れて行く軍勢駒<select id="marchTroops"${eligible.length ? '' : ' disabled'}>
          ${eligible.map(n => `<option value="${n}"${n === marchTroops ? ' selected' : ''}>${n}駒</option>`).join('') || '<option>守備駒が不足</option>'}</select></label>
        <label class="stack-label">同行する将軍<select id="marchExtra"><option value="">なし</option>${rules.present(state, origin, 'cao').filter(id => id !== leader)
          .map(id => `<option value="${id}"${marchExtra === id ? ' selected' : ''}>${leaders[id].name}</option>`).join('')}</select></label>
        ${button('cancelMarch', '行軍を取り消す')}
      </div>
      <div class="destination-list" aria-label="行軍先">${Object.entries(rules.paths(state, leader)).map(([id, path]) => button('area',
        path.slice(1).map(areaLabel).join(' → '), { value: id, disabled: !eligible.length })).join('')}</div>`;
  }

  function actionView() {
    let content = '';
    if (state.phase === 'action') {
      const { leader, choices } = state.active, at = state.location[leader];
      const otherLeaders = at ? rules.present(state, at, 'cao').filter(id => id !== leader) : [];
      const canMove = at && Object.keys(rules.paths(state, leader)).length &&
        [null, ...otherLeaders].some(id => rules.canMarch(state, leader, 0, id));
      content = `${panelTitle('曹操側の行動', cards[state.active.card].name)}
        <label class="stack-label">行動する将軍<select id="actingLeader">${choices.map(id =>
          `<option value="${id}"${leader === id ? ' selected' : ''}>${leaders[id].name}（${areaLabel(state.location[id])}）</option>`).join('')}</select></label>
        <div class="command-grid">${button('march', '行軍', { disabled: !canMove, primary: !!canMove })}
          ${button('battle', '戦闘', { disabled: !at || !rules.hostile(state, at, 'cao') })}
          ${button('reinforce', '補充', { disabled: !rules.canReinforce(state, leader) })}${button('pass', '何もしない')}</div>`;
    } else if (state.phase === 'march') {
      content = '<p class="muted">地図の上で行軍の編成と行き先を選べます。</p>';
    } else if (state.phase === 'disband') {
      const at = selected;
      const n = rules.troops(state, at, 'cao');
      content = `${panelTitle('献帝', '曹操軍の解散')}<p>解散は任意です。駒を戻す場合は拠点を選び、終わったら画面上部のボタンで進みます。</p>
        ${n ? `<div class="button-row"><label>軍勢駒 <input type="number" id="disbandAmount" min="1" max="${n}" value="1"></label>${button('disbandTroops', '軍勢駒を解散')}</div>` : ''}
        <div class="button-row">${rules.present(state, at, 'cao').map(id => button('disbandLeader',
          `${leaders[id].name}を解散`, { value: id })).join('')}</div>`;
    } else if (state.phase === 'ended') {
      content = `${panelTitle('ゲーム終了', state.won ? '勝利' : '敗北')}<p>${state.end}</p>`;
    } else {
      content = `${panelTitle('戦況', state.turn ? '次の天命札へ' : '戦いの始まり')}
        <p class="muted">${state.turn ? '上のボタンから山札を引きます。' : '最初の天命札は任意で選べます。'}</p>`;
    }
    $('actionPanel').innerHTML = content + detailView();
  }

  function modal(kind, markup) {
    if (opened !== kind || !gameDialog.open) {
      opened = kind;
      $('dialogBody').innerHTML = markup;
      $('dialogBody').querySelector('h2').id = 'dialogTitle';
      if (!gameDialog.open) gameDialog.showModal();
      else $('dialogBody').querySelector('button')?.focus();
    } else {
      $('dialogBody').innerHTML = markup;
      $('dialogBody').querySelector('h2').id = 'dialogTitle';
      $('dialogBody').querySelector('button:not([disabled])')?.focus();
    }
  }
  function close() { if (gameDialog.open) gameDialog.close(); opened = null; }
  gameDialog.addEventListener('cancel', event => {
    if (['first', 'preview', 'reset'].includes(opened)) { event.preventDefault(); close(); }
    else event.preventDefault();
  });

  function showFirst() {
    modal('first', `<div class="dialog-content">${panelTitle('第1巡', '最初の天命札を選ぶ')}
      <div class="first-grid">${state.deck.map(id => cards[id]).sort((a, b) => a.image - b.image).map(c =>
        `<button type="button" data-do="firstDraw" data-value="${c.id}"><img src="${image(c.image)}" alt=""><span>${c.name}</span></button>`).join('')}</div>
      <div class="button-row">${button('firstDraw', '山札から引く', { primary: true })}${button('close', '戻る')}</div></div>`);
  }

  function cardThumbnail(id) {
    const card = cards[id];
    return `<img src="${image(card.image)}" alt=""><span>${card.name}</span>`;
  }

  function usedCardsView() {
    const strip = $('usedCards');
    const used = rules.usedCards(state);
    const key = used.join(',');
    if (strip.dataset.cards === key) return;
    strip.dataset.cards = key;
    strip.innerHTML = used.map((id, i) => `<button type="button" data-do="previewUsed" data-value="${id}" aria-label="${i + 1}枚目、${cards[id].name}を拡大">${cardThumbnail(id)}</button>`)
      .join('') || '<p class="muted">使用した天命札はここに表示されます。</p>';
    strip.scrollLeft = strip.scrollWidth;
  }

  function battleView() {
    const { area, strike, report } = state.battle;
    const lineup = rules.battleLineup(state).map((side, i) => `<section class="battle-army">
      <h3>${i === strike ? '攻撃側' : '防御側'}</h3>
      ${side.map(({ faction, people, soldiers, size }) => `<div class="battle-stack" style="--army:${factions[faction].color}">
        <div><strong>${factions[faction].name}</strong><span>軍勢 ${soldiers}駒</span></div>
        <small>${people.map(id => leaders[id].name).join('・') || (size ? '武将なし' : '全滅')}</small>
      </div>`).join('')}</section>`).join('');
    const used = [state.last, ...(state.last === 'emperor' && state.previous ? [state.previous] : [])].filter(Boolean);
    const footer = used.length ? `<div class="battle-cards"><h3>この戦闘の天命札</h3><div class="used-card-strip">
      ${used.map(id => `<div class="used-card-mini">${cardThumbnail(id)}</div>`).join('')}</div></div>` : '';
    const dice = (rolling = false) => report.groups.map(group => `<section class="dice-group"><div>${detail(group.faction)}<b>ダイス ${group.rolls.length}個 ／ 武勇 ${group.valor}</b></div>
      <div class="dice${rolling ? ' rolling' : ''}"${rolling ? ' aria-hidden="true"' : ''}>${group.rolls.map((die, i) => rolling
        ? `<span class="rolling-die" style="--delay:${-(i % 6) * 45}ms">⚄</span>`
        : `<span${!group.table && die <= group.valor ? ' class="hit"' : ''}>${die}</span>`).join('') || '攻撃できる将軍なし'}</div>
      ${rolling ? '' : `<small>${group.table ? `簡易表（合計 ${group.rolls.reduce((a, b) => a + b, 0)}）` : '通常判定'}　${group.hits}損害</small>`}</section>`).join('');
    const removed = new Map();
    for (const name of report.removed) removed.set(name, (removed.get(name) || 0) + 1);
    const result = () => `${dice()}<p class="battle-result">${report.target.map(id => factions[id].name).join('・')}へ <b>${report.inflicted}</b> 損害
      ${report.bonus ? '（夏侯惇 ＋1）' : ''}${report.protect ? '（曹洪 −1）' : ''}</p>
      ${removed.size ? `<p class="muted">除去　${[...removed].map(([name, count]) => `${name} ${count}駒`).join('・')}</p>` : ''}
      ${button('nextStrike', strike || state.end ? '戦闘を確認' : '後攻の処理へ', { primary: true })}`;
    const revealed = report.revealed || report.removed.length > 0;
    modal('battle', `<div class="dialog-content">${panelTitle(strike ? '後攻' : '先攻', `${areaLabel(area)}の戦闘`)}
      <div class="battle-lineup">${lineup}</div>
      <div id="battleRoll" class="battle-roll" ${revealed ? '' : 'aria-live="polite"'}>${revealed ? result() : '<p>両軍が対峙しています。</p>'}</div>
      ${footer}</div>`);
    if (revealed || animatingReport === report) return;
    animatingReport = report;
    const current = () => state.phase === 'battle' && state.battle.report === report && opened === 'battle';
    const reveal = () => {
      if (!current()) return;
      report.revealed = true;
      animatingReport = null;
      render();
      $('battleRoll').querySelector('button')?.focus();
    };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      if (!current()) return;
      if (reducedMotion || !report.groups.some(group => group.rolls.length)) { reveal(); return; }
      $('battleRoll').innerHTML = `<p>ダイスを振っています…</p>${dice(true)}`;
      const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      let tick = 0;
      const timer = window.setInterval(() => {
        $('battleRoll')?.querySelectorAll('.rolling-die').forEach((die, i) => {
          die.textContent = faces[(tick + i * 5) % faces.length];
        });
        tick++;
      }, 90);
      window.setTimeout(() => { window.clearInterval(timer); reveal(); }, 900);
    }, 550);
  }

  function phaseDialog() {
    if (state.phase === 'reveal') {
      const card = cards[state.last];
      modal('reveal', `<div class="preview"><img src="${image(card.image)}" alt="${card.name}の天命札">
        <div>${panelTitle('引いた天命札', card.name)}<p>${card.description}</p>${button('play', 'この札を処理する', { primary: true })}</div></div>`);
    } else if (state.phase === 'battle') {
      battleView();
    } else if (state.phase === 'followup') {
      modal('followup', `<div class="dialog-content">${panelTitle('夏侯淵の特別ルール', '行軍後の戦闘')}
        <p>移動した軍勢だけで戦闘をおこなえます。</p>
        <div class="button-row">${button('followup', '戦闘する', { value: 'yes', primary: true })}${button('followup', '戦闘しない', { value: 'no' })}</div></div>`);
    } else if (state.phase === 'order') {
      modal('order', `<div class="dialog-content">${panelTitle('諸葛亮', '天下三分之計')}<p>次に処理する将軍を選んでください。</p>
        <div class="button-row">${state.order.map(id => button('order', leaders[id].name, { value: id })).join('')}</div></div>`);
    } else if (state.phase === 'result') {
      modal('result', `<div class="dialog-content">${panelTitle('天命札の処理結果', state.end ? (state.won ? '勝利' : '敗北') : cards[state.last].name)}
        ${state.end ? `<p class="battle-result">${state.end}</p>` : ''}<ul class="results">${state.events.map(note => `<li>${esc(note)}</li>`).join('')}</ul>
        ${button('done', state.end ? '盤面に戻る' : '確認して次へ', { primary: true })}</div>`);
    } else if (!['preview', 'reset', 'first'].includes(opened)) close();
  }

  function render() {
    if (state.phase === 'battle' && (state.battle.report.revealed || state.battle.report.removed.length)) {
      rules.resolveLosses(state);
    }
    persist();
    $('turnCount').textContent = `第${state.round}巡 ・ ${state.turn}手`;
    $('controlCount').textContent = `曹操支配 ${rules.controlCount(state)} / ${Object.keys(areas).length}`;
    $('deckCount').textContent = `山札 ${state.deck.length} 枚`;
    $('discardCount').textContent = `捨て札 ${state.discard.length} 枚`;
    $('draw').disabled = state.phase !== 'ready';
    $('draw').hidden = state.phase === 'disband';
    $('finishDisband').hidden = state.phase !== 'disband';
    $('finishDisband').textContent = state.events.some(note => note.endsWith('を解散。')) ? '解散を終えて進む' : '解散せずに進む';
    $('lastCard').innerHTML = `<img src="${state.last ? image(cards[state.last].image) : 'assets/cards/back.webp'}" alt="">
      <span><strong>${state.last ? cards[state.last].name : '山札'}</strong><small>クリックで拡大</small></span>`;
    $('log').innerHTML = [...state.log].reverse().slice(0, 25).map(note => `<li>${esc(note)}</li>`).join('');
    const focus = state.phase === 'movement' ? state.route.at(-1) :
      state.phase === 'battle' ? state.battle.area : state.active ? state.location[state.active.leader]
      : state.route.at(-1);
    if (focus && focus !== following) {
      selected = focus;
      following = focus;
      if (state.phase !== 'movement') requestAnimationFrame(() => center(focus));
    }
    boardView();
    marchView();
    actionView();
    statusView();
    usedCardsView();
    phaseDialog();
    if (state.phase === 'movement') requestAnimationFrame(focusMovement);
  }

  const change = ok => { if (ok) render(); };
  document.addEventListener('change', event => {
    const { id, value } = event.target;
    if (!state) return;
    if (id === 'actingLeader') { state.active.leader = value; render(); }
    if (id === 'marchExtra') { marchExtra = value; marchView(); $('marchExtra').focus(); }
    if (id === 'marchTroops') marchTroops = Number(value);
  });

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-do]');
    if (!target || !state) return;
    const { do: action, value } = target.dataset;
    if (action === 'previewUsed') { previewCard(value); return; }
    if (action === 'close') { close(); return; }
    if (action === 'reset') {
      close();
      $('start').hidden = false;
      $('game').hidden = true;
      $('resetButton').hidden = true;
      setupForm();
      return;
    }
    if (action === 'area') {
      selected = value;
      if (state.phase === 'march' && marchTroops !== null &&
          rules.march(state, value, marchTroops, marchExtra || null)) render();
      else { boardView(); actionView(); }
      return;
    }
    if (action === 'cancelMarch') { state.phase = 'action'; render(); return; }
    if (action === 'firstDraw') { close(); change(rules.draw(state, value)); return; }
    if (action === 'play') { change(rules.play(state)); return; }
    if (action === 'done') { change(rules.done(state)); return; }
    if (action === 'followup') { change(rules.followup(state, value === 'yes')); return; }
    if (action === 'order') { change(rules.order(state, value)); return; }
    if (action === 'nextStrike') { change(rules.nextStrike(state)); return; }
    if (action === 'disbandLeader') { change(rules.disbandLeader(state, value)); return; }
    if (action === 'disbandTroops') { change(rules.disband(state, selected, Number($('disbandAmount').value))); return; }
    if (action === 'march') {
      marchExtra = '';
      marchTroops = null;
      if (!rules.command(state, action, state.active?.leader)) return;
      render();
      center(state.location[state.active.leader]);
      $('marchPanel').scrollIntoView({ block: 'start' });
      $('marchTroops').focus({ preventScroll: true });
      return;
    }
    change(rules.command(state, action, state.active?.leader));
  });

  setupForm();
})();
