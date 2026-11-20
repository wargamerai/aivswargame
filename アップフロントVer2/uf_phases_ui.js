// アップフロント: §27 目標捕捉・右クリックメニュー・オーバーレイ・§3.6 開始時の地形配置
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== §27 目標捕捉 =====
// 捕捉は砲ごとに1つ。カードとグループの参照を保存し、側方移送や番号変更を追跡する。
function _otherSide(side) { return side === 'player' ? 'ai' : 'player'; }

function groupAcquisitions(group, opposite) {
  if (group.acquisitions) return group.acquisitions;
  const target = opposite[group.pinpointing?.[0]];
  const faction = group._faction || getGroupFaction(group);
  const shooter = target && (group.cards.find(card => card.num === group.pinpointShooterNum) ||
    group.cards.find(card => /迫撃砲/.test(window.INFANTRY_RULES.lookupSoldier(card, faction)?.weaponCat || '')));
  // 旧セーブの迫撃砲の捕捉も引き継ぐ。
  group.acquisitions = target && shooter ? [{ shooter, target }] : [];
  delete group.pinpointing;
  delete group.pinpointShooterNum;
  return group.acquisitions;
}

function syncAcquisitionFlags() {
  for (const side of ['player', 'ai']) {
    state.groups[side].forEach(group => {
      if (!group) return;
      group.pinpointed = false;
      group.pinpointedBy = null;
    });
  }
  for (const side of ['player', 'ai']) {
    const opposite = state.groups[_otherSide(side)];
    state.groups[side].forEach((group, index) => {
      if (!group) return;
      for (const { target } of groupAcquisitions(group, opposite)) {
        if (!target.pinpointed && opposite.includes(target)) {
          target.pinpointed = true;
          target.pinpointedBy = { side, idx: index };
        }
      }
    });
  }
}

function isAcquiredBy(group, targetIndex, shooterCard) {
  const side = _groupSideIdx(group)?.side;
  if (!side) return false;
  const opposite = state.groups[_otherSide(side)];
  return groupAcquisitions(group, opposite).some(({ shooter, target }) =>
    target === opposite[targetIndex] && (!shooterCard || shooter === shooterCard));
}

function applyGunAcquisition(side, sourceIndex, targetIndex, shooter, canAcquire = true) {
  const group = state.groups[side][sourceIndex];
  const opposite = state.groups[_otherSide(side)];
  const target = opposite[targetIndex];
  if (!group || !target || !shooter) return;
  const entries = groupAcquisitions(group, opposite);
  if (entries.some(entry => entry.shooter === shooter && entry.target === target)) return;
  group.acquisitions = entries.filter(entry => entry.shooter !== shooter);
  if (canAcquire && !isMovingIgnoringOverlays(group) && !isMovingIgnoringOverlays(target) &&
      !window.MORTAR_RULES.hasSmoke(group) && !window.MORTAR_RULES.hasSmoke(target)) {
    group.acquisitions.push({ shooter, target });
  }
  syncAcquisitionFlags();
}

// 卓上に残る移動カードによって、撃つ側と目標のどちらの捕捉も解除する。
function loseAcquisitionOnMove(group) {
  const side = _groupSideIdx(group)?.side;
  if (!side) return;
  const opposite = state.groups[_otherSide(side)];
  groupAcquisitions(group, opposite).length = 0;
  for (const other of opposite) {
    if (!other) continue;
    other.acquisitions = groupAcquisitions(other, state.groups[side]).filter(entry => entry.target !== group);
  }
  syncAcquisitionFlags();
}

function loseAcquisitionForCards(cards) {
  for (const side of ['player', 'ai']) {
    const opposite = state.groups[_otherSide(side)];
    for (const group of state.groups[side]) {
      if (!group) continue;
      group.acquisitions = groupAcquisitions(group, opposite).filter(entry => !cards.includes(entry.shooter));
    }
  }
  syncAcquisitionFlags();
}

function loseAfvAcquisitionOnFire(group, target) {
  const side = _groupSideIdx(group)?.side;
  if (!side || !window.AFV?.isAfvGroup(group)) return;
  const entries = groupAcquisitions(group, state.groups[_otherSide(side)]);
  if (entries.every(entry => entry.target === target)) return;
  group.acquisitions = entries.filter(entry => entry.target === target);
  syncAcquisitionFlags();
}

function updateAcquisitions() {
  const R = window.INFANTRY_RULES;
  if (!R || !state.groups) return;
  for (const side of ['player', 'ai']) {
    const enemy = _otherSide(side);
    const opposite = state.groups[enemy];
    state.groups[side].forEach((group, sourceIndex) => {
      if (!group) return;
      const entries = groupAcquisitions(group, opposite);
      if (!entries.length) return;
      group.acquisitions = entries.filter(({ shooter, target }) => {
        if (group.eliminated || !group.cards.includes(shooter) || !R.isAlive(shooter) ||
            R.isPinned(shooter) || shooter.malfunctioned || shooter.destroyed || shooter.infiltrating || shooter.transfer) return false;
        const targetIndex = opposite.indexOf(target);
        if (targetIndex < 0 || target.eliminated || !target.cards.some(R.isAlive)) return false;
        return side === 'ai' ? aiCanTargetRecognized(sourceIndex, targetIndex) :
          isTargetVisibleForPlayer(group, targetIndex, enemy);
      });
    });
  }
  syncAcquisitionFlags();
}

function resolveMortarAction() {
  const source = state.fireSource?.idx;
  const target = state.fireTarget?.idx;
  const plan = ordnancePlans('player', source, target).find(candidate => candidate.weapon.kind === 'mortar');
  const fire = [...state.selectedHand].map(index => state.playerHand[index]).find(isOrdnanceFireCard);
  if (!plan || !fire) return false;
  return resolveOrdnance([plan], [fire], false);
}

/** §3.3 移送中の兵士を除き、ピン状態の兵士も隊列変更の対象にできる。 */
function groupOrderCandidates(group, includePinned = false) {
  const R = window.INFANTRY_RULES;
  return group?.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => R.isAlive(card) && (includePinned || !R.isPinned(card)) && !card.transfer) || [];
}
function askGroupOrder(group, optional = false) {
  const candidates = groupOrderCandidates(group, true);
  if (candidates.length < 2) return false;
  const faction = getFactionKey(state.player);
  const R = window.INFANTRY_RULES;
  const names = candidates.map(({ card }, index) => `${index + 1}: ${R.lookupSoldier(card, faction)?.name || card.id}`);
  const title = radioText('兵士を左から並べる順に、番号を空白で区切って入力してください。',
    'Enter the soldier numbers from left to right, separated by spaces.');
  const instruction = optional ? title + radioText(' 空欄なら現在の隊列を保ちます。', ' Leave blank to keep the current order.') : title;
  const answer = prompt([instruction, ...names].join('\n'), '');
  if (!answer?.trim()) return false;
  const order = answer.trim().split(/[\s,、]+/).map(n => Number(n) - 1);
  if (order.length !== candidates.length || new Set(order).size !== candidates.length ||
      order.some(index => !candidates[index])) {
    alert(radioText('一覧の番号をそれぞれ1回入力してください。', 'Enter each listed number exactly once.'));
    return false;
  }
  if (order.every((index, position) => index === position)) return false;
  const reordered = group.cards.slice();
  candidates.forEach(({ index }, position) => { reordered[index] = candidates[order[position]].card; });
  const living = reordered.filter(R.isAlive);
  const separatesCrew = Object.entries(group.crewPairs || {}).some(([owner, assistant]) => {
    const ownerIndex = living.findIndex(card => card.num === Number(owner));
    const assistantIndex = living.findIndex(card => card.num === Number(assistant));
    return ownerIndex >= 0 && assistantIndex >= 0 && Math.abs(ownerIndex - assistantIndex) !== 1;
  });
  if (separatesCrew) {
    alert(radioText('クルーの射手と助手は隣に置いてください（§11.11）。',
      'Keep each weapon operator next to their assistant (§11.11).'));
    return false;
  }
  group.cards = reordered;
  return true;
}

function seatCrewAssistant(cards, owner, assistant) {
  const ownerIndex = cards.indexOf(owner);
  const assistantIndex = cards.indexOf(assistant);
  if (ownerIndex < 0 || assistantIndex < 0 || Math.abs(ownerIndex - assistantIndex) <= 1) return;
  cards.splice(assistantIndex, 1);
  cards.splice(cards.indexOf(owner) + 1, 0, assistant);
}

/** §11 兵器クルーは1アクションにつき1組変更できる。 */
function openCrewModal(grp, canDecide, onDecide) {
  const R = window.INFANTRY_RULES;
  if (!R || !grp) return;
  const facKey = getFactionKey(state.player);
  const orig = Object.assign({}, grp.crewPairs || {});
  let pairs = Object.assign({}, orig);
  let ownerSel = null;   // 選択中の持ち主 card
  let changed = null;    // 変更内容の説明（1つだけ）
  const alive = grp.cards.filter(c => R.isAlive(c));
  const defOf = c => R.lookupSoldier(c, facKey);
  const nameOf = c => { const d = defOf(c); return `#${c.num} ${d ? d.name : c.id}`; };
  const byNum = n => alive.find(c => c.num === Number(n));
  const assistOf = owner => { const a = pairs[owner.num]; return a != null ? byNum(a) : null; };
  const isAssistant = c => Object.values(pairs).some(v => Number(v) === c.num);
  const ownerOfAssistant = c => { const o = Object.keys(pairs).find(k => Number(pairs[k]) === c.num); return o != null ? byNum(o) : null; };

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:3000;display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#222;border:2px solid #888;border-radius:8px;padding:16px 20px;max-width:94vw;max-height:92vh;overflow:auto;color:#eee;';
  ov.appendChild(box);
  document.body.appendChild(ov);
  const close = () => ov.remove();

  function render() {
    box.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = `GROUP ${grp.name} クルー指定`;
    h.style.cssText = 'margin:0 0 6px;color:#ffeb3b;';
    box.appendChild(h);
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:10px;';
    hint.textContent = changed ? `変更: ${changed}（1回のアクションで変更できるのは1つです）`
      : ownerSel ? `${nameOf(ownerSel)} の助手にする兵士を押してください`
      : 'クルー兵器を持つ兵士（黄色の枠）を押して、次に助手を押してください。組んでいるクルーは「解除」で解けます';
    box.appendChild(hint);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
    alive.forEach(c => {
      const d = defOf(c);
      const pinned = R.isPinned(c);
      const isOwner = Boolean(d?.needsCrew && !c.destroyed);
      const asst = isOwner ? assistOf(c) : null;
      // §11.12–11.13 現在の助手がいる場合は、解除にグループの行動を使う。
      const ownerPickable = !changed && !ownerSel && isOwner && !pinned && !c.transfer &&
        !isAssistant(c) && !asst;
      // 助手として押せる: ピンでない・持ち主本人でない・他の助手でない・自分の助手を持っていない
      const asstPickable = !changed && ownerSel && c !== ownerSel && !isAssistant(c) &&
        !assistOf(c) && canServeAsWeaponAssistant(c, facKey);
      const wrap = document.createElement('div');
      const border = ownerSel === c ? '#0f0' : (ownerPickable || asstPickable) ? '#ffeb3b' : '#555';
      wrap.style.cssText = `width:110px;border:3px solid ${border};border-radius:6px;padding:3px;text-align:center;font-size:11px;`
        + ((ownerPickable || asstPickable || ownerSel === c) ? 'cursor:pointer;' : 'opacity:0.55;');
      const img = document.createElement('img');
      img.src = pinned ? (c.imgBack || c.img) : c.img;
      img.style.cssText = 'width:100%;display:block;border-radius:3px;';
      wrap.appendChild(img);
      const lab = document.createElement('div');
      lab.textContent = nameOf(c) + (pinned ? '（ピン）' : '');
      wrap.appendChild(lab);
      const role = document.createElement('div');
      role.style.cssText = 'color:#8cf;';
      if (asst) role.textContent = `主 → 助手 #${asst.num}`;
      else if (ownerOfAssistant(c)) role.textContent = `助手（#${ownerOfAssistant(c).num} の）`;
      else if (isOwner) role.textContent = 'クルー兵器（助手なし）';
      wrap.appendChild(role);
      // 解除ボタン（持ち主・助手ともピンでない時だけ）
      if (asst && !changed && !ownerSel) {
        const canBreak = !pinned && !R.isPinned(asst) && !c.transfer && !asst.transfer;
        const b = document.createElement('button');
        b.textContent = canBreak ? '解除' : '解除不可（ピン）';
        b.disabled = !canBreak;
        b.style.cssText = 'margin-top:3px;font-size:11px;';
        b.onclick = e => { e.stopPropagation(); delete pairs[c.num]; changed = `${nameOf(c)} のクルーを解除`; render(); };
        wrap.appendChild(b);
      }
      wrap.onclick = () => {
        if (ownerSel === c) { ownerSel = null; render(); return; }
        if (ownerPickable) { ownerSel = c; render(); return; }
        if (asstPickable) {
          pairs[ownerSel.num] = c.num;
          changed = `${nameOf(ownerSel)} の助手を ${nameOf(c)} に`;
          ownerSel = null;
          render();
        }
      };
      row.appendChild(wrap);
    });
    box.appendChild(row);

    const btns = document.createElement('div');
    btns.style.cssText = 'margin-top:12px;display:flex;gap:10px;justify-content:center;';
    const mk = (t, fn, dis) => { const b = document.createElement('button'); b.textContent = t; b.disabled = !!dis; b.style.cssText = 'padding:6px 18px;font-size:14px;'; b.onclick = fn; btns.appendChild(b); };
    mk('決定（1アクション）', () => {
      if (!canDecide()) {
        close();
        return;
      }
      for (const [owner, assistant] of Object.entries(pairs)) {
        if (orig[owner] !== assistant) seatCrewAssistant(grp.cards, byNum(owner), byNum(assistant));
      }
      grp.crewPairs = pairs;
      close();
      if (onDecide) onDecide();
      renderField('player');
    }, !changed);
    mk('やり直す', () => { pairs = Object.assign({}, orig); changed = null; ownerSel = null; render(); }, !changed && !ownerSel);
    mk('やめる', () => { close(); });
    box.appendChild(btns);
  }
  render();
}

function buildCrewMapFromPairs(group) {
  // group.crewPairs (主num→副num) を card index ベースの crewMap に変換
  const out = {};
  const R = window.INFANTRY_RULES;
  if (!group.crewPairs) return out;
  Object.keys(group.crewPairs).forEach(ownerNum => {
    const ownerIdx = group.cards.findIndex(c => c.num === Number(ownerNum));
    const assistIdx = group.cards.findIndex(c => c.num === group.crewPairs[ownerNum]);
    const owner = group.cards[ownerIdx];
    const assistant = group.cards[assistIdx];
    if (R.isAlive(owner) && !owner.transfer && R.isAlive(assistant) && !assistant.transfer) out[ownerIdx] = assistIdx;
  });
  return out;
}

// ===== 右クリックメニュー =====
const ctxMenu = document.getElementById('ctx-menu');

function nextGroupLetter() {
  const used = new Set(state.groups.player.map(g => g.name));
  for (const l of ALL_GROUP_LETTERS) if (!used.has(l)) return l;
  return null;
}

function showCardContextMenu(x, y, fromGroup, cardIdx) {
  const card = fromGroup.cards[cardIdx];
  if (!card) return;
  ctxMenu.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'ctx-title';
  title.textContent = `${card.id}${card.name ? ' (' + card.name + ')' : ''} を移動`;
  ctxMenu.appendChild(title);

  state.groups.player.forEach(g => {
    if (g === fromGroup) return;
    const it = document.createElement('div');
    it.className = 'ctx-item';
    it.textContent = `GROUP ${g.name} へ (${g.cards.length}人)`;
    it.addEventListener('click', () => {
      moveCard(fromGroup, cardIdx, g);
      hideContextMenu();
    });
    ctxMenu.appendChild(it);
  });

  const sep = document.createElement('div'); sep.className = 'ctx-sep'; ctxMenu.appendChild(sep);

  const newItem = document.createElement('div');
  newItem.className = 'ctx-item new';
  const nextL = nextGroupLetter();
  if (nextL) {
    newItem.textContent = `＋ 新グループ ${nextL} を作成して移動`;
    newItem.addEventListener('click', () => {
      const newGroup = { name: nextL, cards: [], distance: 0, terrain: [], actions: [] };
      state.groups.player.push(newGroup);
      moveCard(fromGroup, cardIdx, newGroup);
      hideContextMenu();
    });
  } else {
    newItem.className = 'ctx-item disabled';
    newItem.textContent = '＋ 新グループ作成 (上限A〜Z)';
  }
  ctxMenu.appendChild(newItem);

  // 火炎放射器を持つ兵士: 任意廃棄オプション
  const R_ctx = window.INFANTRY_RULES;
  const facKey_ctx = getFactionKey(state.player);
  const def_ctx = R_ctx ? R_ctx.lookupSoldier(card, facKey_ctx) : null;
  if (def_ctx && def_ctx.weaponCat && def_ctx.weaponCat.indexOf('火炎放射器') === 0
      && !card.malfunctioned && !card.flameDiscarded) {
    const sep2 = document.createElement('div'); sep2.className = 'ctx-sep'; ctxMenu.appendChild(sep2);
    const flameItem = document.createElement('div');
    flameItem.className = 'ctx-item';
    flameItem.style.color = '#f88';
    flameItem.textContent = '火炎放射器を廃棄';
    flameItem.addEventListener('click', () => {
      if (confirm(`${def_ctx.name} の火炎放射器を廃棄しますか？(以後使用不可、kia ペナルティ解除)`)) {
        card.flameDiscarded = true;
        renderField('player');
      }
      hideContextMenu();
    });
    ctxMenu.appendChild(flameItem);
  }

  const cancel = document.createElement('div');
  cancel.className = 'ctx-item';
  cancel.style.color = '#aaa';
  cancel.textContent = 'キャンセル';
  cancel.addEventListener('click', hideContextMenu);
  ctxMenu.appendChild(cancel);

  // 位置調整 (画面外にはみ出ないように)
  ctxMenu.style.left = '0px'; ctxMenu.style.top = '0px';
  ctxMenu.classList.add('active');
  const rect = ctxMenu.getBoundingClientRect();
  let px = x, py = y;
  if (px + rect.width  > window.innerWidth)  px = window.innerWidth  - rect.width  - 6;
  if (py + rect.height > window.innerHeight) py = window.innerHeight - rect.height - 6;
  ctxMenu.style.left = px + 'px';
  ctxMenu.style.top  = py + 'px';
}

function hideContextMenu() { ctxMenu.classList.remove('active'); }

function moveCard(fromGroup, idx, toGroup) {
  const [card] = fromGroup.cards.splice(idx, 1);
  toGroup.cards.push(card);
  renderField('player');
  // オーバーレイ表示中なら再描画
  if (overlay.classList.contains('active') && currentOverlayGroup === fromGroup && currentOverlaySide === 'player') {
    if (fromGroup.cards.length > 0) {
      showGroupOverlay('player', fromGroup);
    } else {
      overlay.classList.remove('active');
    }
  }
}

document.addEventListener('click', e => {
  if (!ctxMenu.contains(e.target)) hideContextMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideContextMenu();
});

// ===== オーバーレイ =====
const overlay = document.getElementById('card-overlay');
const overlayImg = document.getElementById('card-overlay-img');
const overlayGroup = document.getElementById('card-overlay-group');
const groupTitle = document.getElementById('group-view-title');
const groupGrid = document.getElementById('group-view-grid');

let returnToCardGrid = false;

function showOverlay(src, enlarged = false) {
  returnToCardGrid = enlarged && overlay.classList.contains('active') && overlayGroup.style.display !== 'none';
  overlayImg.src = src;
  overlayImg.style.display = '';
  overlayGroup.style.display = 'none';
  overlay.classList.toggle('enlarged', enlarged);
  overlay.classList.add('active');
  overlay.scrollTop = overlay.scrollLeft = 0;
}

function closeCardOverlay() {
  overlay.classList.remove('enlarged');
  if (returnToCardGrid) {
    returnToCardGrid = false;
    overlayImg.style.display = 'none';
    overlayGroup.style.display = '';
    return;
  }
  overlay.classList.remove('active');
}
let groupOverlayImgs = []; // {img, card, showBack}

let currentOverlayGroup = null;
let currentOverlaySide = null;

function showGroupOverlay(side, group) {
  overlay.classList.remove('enlarged');
  returnToCardGrid = false;
  currentOverlayGroup = group;
  currentOverlaySide = side;
  overlayImg.style.display = 'none';
  overlayGroup.style.display = '';
  groupGrid.classList.remove('discard-row');
  const faction = side === 'player' ? state.player : state.ai;
  const hint = side === 'player' ? '左クリックで裏／表、Shift＋クリックで拡大、右クリックで移動' : 'クリックで裏／表、Shift＋クリックで拡大';
  groupTitle.textContent = `${faction.flag} ${faction.name} — GROUP ${group.name}  (距離 ${group.distance} / 兵士 ${group.cards.length}人)  ${hint}`;
  groupGrid.innerHTML = '';
  groupOverlayImgs = [];
  const crewPairs = group.crewPairs || {};
  const ownerNums = new Set(Object.keys(crewPairs).map(Number));
  const assistantNums = new Set(Object.values(crewPairs));
  const facKeyForDemo = side === 'player' ? getFactionKey(state.player) : getFactionKey(state.ai);
  group.cards.forEach((card, idx) => {
    if (card.killed || card.routed) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;';
    const img = document.createElement('img');
    const initBack = !!card.pinned;
    const entry = { img, card, showBack: initBack };
    img.src = initBack ? (card.imgBack || card.img) : card.img;
    img.alt = card.id;
    img.onerror = () => { img.style.background = '#666'; img.alt = card.id; };
    img.addEventListener('click', e => {
      e.stopPropagation();
      if (e.shiftKey) {
        showOverlay(img.src, true);
        return;
      }
      entry.showBack = !entry.showBack;
      img.src = entry.showBack ? (card.imgBack || card.img) : card.img;
    });
    if (side === 'player') {
      img.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showCardContextMenu(e.clientX, e.clientY, group, idx, true);
      });
    }
    wrap.appendChild(img);
    // PIN マーカー
    if (card.pinned) {
      const m = document.createElement('div');
      m.textContent = 'PIN';
      m.style.cssText = 'position:absolute;top:4px;right:4px;background:#fd0;color:#000;font-size:12px;font-weight:bold;padding:2px 6px;border-radius:4px;border:1px solid #fff;z-index:5;';
      wrap.appendChild(m);
    }
    // §18/§19.4/§17.8 拾った・捕獲した兵器／非武装／移送中のチット
    appendSoldierChits(wrap, card, 1.6);
    // 侵入マーカー (§20)
    if (card.infiltrating) {
      const m = document.createElement('div');
      m.textContent = '侵';
      m.style.cssText = 'position:absolute;top:4px;right:4px;background:#f44;color:#fff;font-size:12px;font-weight:bold;padding:2px 6px;border-radius:4px;border:1px solid #fff;z-index:5;';
      m.title = '侵入中';
      wrap.appendChild(m);
    }
    // 監視役マーカー (§32.2)
    if (card.prisoners && card.prisoners.length) {
      const m = document.createElement('div');
      m.textContent = '捕' + card.prisoners.length;
      m.style.cssText = 'position:absolute;top:4px;right:40px;background:#795548;color:#fff;font-size:12px;font-weight:bold;padding:2px 6px;border-radius:4px;border:1px solid #fff;z-index:5;';
      m.title = `監視役（捕虜 ${card.prisoners.length} 人）火力・CCV 半分`;
      wrap.appendChild(m);
    }
    // 負傷マーカー (§33)
    if (card.wounded && !card.killed && !card.routed) {
      const sus = window.INFANTRY_RULES && !window.INFANTRY_RULES.isWoundActive(card);
      const m = document.createElement('div');
      m.textContent = sus ? '負(止)' : '負';
      m.style.cssText = 'position:absolute;bottom:4px;left:4px;background:#e65100;color:#fff;font-size:12px;font-weight:bold;padding:2px 6px;border-radius:4px;border:1px solid #fff;z-index:5;';
      m.title = sus ? '負傷（ヒーローでこのターンは効果なし）' : '負傷: 火力½・移動射撃不可・CCV低下・潜入不可';
      wrap.appendChild(m);
    }
    // クルー主/副
    if (card.num != null && ownerNums.has(card.num)) {
      const m = document.createElement('div');
      m.textContent = '主';
      m.style.cssText = 'position:absolute;top:4px;left:4px;background:#fa6;color:#000;font-size:12px;font-weight:bold;padding:2px 6px;border-radius:4px;border:1px solid #fff;z-index:5;';
      m.title = 'クルー主';
      wrap.appendChild(m);
    } else if (card.num != null && assistantNums.has(card.num)) {
      const m = document.createElement('div');
      m.textContent = '副';
      m.style.cssText = 'position:absolute;top:4px;left:4px;background:#6af;color:#000;font-size:12px;font-weight:bold;padding:2px 6px;border-radius:4px;border:1px solid #fff;z-index:5;';
      m.title = 'クルー副';
      wrap.appendChild(m);
    }
    // 爆薬保持
    if (card.demoCharge) {
      const dm = document.createElement('img');
      dm.src = encPath(getDemoImagePath(facKeyForDemo));
      dm.style.cssText = 'position:absolute;top:50%;left:4px;transform:translateY(-50%);width:36px;height:36px;border:2px solid #f66;border-radius:4px;background:#000;z-index:6;';
      dm.title = '爆薬保持';
      dm.onerror = () => { dm.style.display = 'none'; };
      wrap.appendChild(dm);
    }
    groupGrid.appendChild(wrap);
    groupOverlayImgs.push(entry);
  });
  overlay.classList.add('active');
}

document.getElementById('flip-all-front').addEventListener('click', e => {
  e.stopPropagation();
  groupOverlayImgs.forEach(en => { en.showBack = false; en.img.src = en.card.img; });
});
document.getElementById('flip-all-back').addEventListener('click', e => {
  e.stopPropagation();
  groupOverlayImgs.forEach(en => { en.showBack = true; en.img.src = en.card.imgBack || en.card.img; });
});

// 汎用グリッドオーバーレイ (地形/アクションカード用)
function showCardGridOverlay(title, cards) {
  overlay.classList.remove('enlarged');
  returnToCardGrid = false;
  overlayImg.style.display = 'none';
  overlayGroup.style.display = '';
  groupTitle.textContent = `${title}  (${cards.length}枚)  クリックで裏／表、Shift＋クリックで拡大`;
  groupGrid.innerHTML = '';
  groupGrid.classList.add('discard-row');
  groupOverlayImgs = [];
  cards.forEach(card => {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.alignItems = 'center';
    const img = document.createElement('img');
    const entry = { img, card, showBack: false };
    img.src = card.img; img.alt = card.id;
    img.onerror = () => { img.style.background = '#666'; img.alt = card.id; };
    img.addEventListener('click', e => {
      e.stopPropagation();
      if (e.shiftKey) {
        showOverlay(img.src, true);
        return;
      }
      entry.showBack = !entry.showBack;
      img.src = entry.showBack ? (card.imgBack || card.img) : card.img;
    });
    wrap.appendChild(img);
    groupGrid.appendChild(wrap);
    groupOverlayImgs.push(entry);
  });
  overlay.classList.add('active');
}
overlay.addEventListener('click', e => {
  if (e.target === overlay || e.target === overlayImg) { closeCardOverlay(); return; }
  // グループの拡大表示: カード（左クリック=裏/表、右クリック=メニュー）と「全部表/全部裏」以外は、どこをクリックしても閉じる
  //   （拡大していると枠の外が見つけにくいため）。カードのクリックは stopPropagation でここまで来ない
  if (overlayGroup.style.display !== 'none' && !(e.target.closest && e.target.closest('.toolbar'))) {
    closeCardOverlay();
  }
});
// 1枚の拡大表示中は、画面のどこをクリックしても閉じる（ズーム中は拡大画像の外がなくなるため）
document.addEventListener('click', e => {
  if (overlay.classList.contains('active') && overlayImg.style.display !== 'none') {
    e.stopPropagation(); e.preventDefault();
    if (e.shiftKey && e.target === overlayImg && !overlay.classList.contains('enlarged')) {
      overlay.classList.add('enlarged');
      return;
    }
    closeCardOverlay();
  }
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && overlay.classList.contains('active')) closeCardOverlay();
});

// ===== §3.6 開始時の地形交互配置フェーズ =====
state.phase = 'play'; // 'play' | 'terrainPlacement'
state.terrainTurn = null; // 'player' | 'ai'
state.terrainSelected = null; // 選択中の手札index
state.terrainDone = { player: false, ai: false };

function isTerrainHandCard(card, side = 'player') {
  if (!card || !card.terrain) return false;
  const t = card.terrain.type;
  const placeable = ['WOODS','BUILDINGS','HILL','GULLY','WALL','BRUSH','STREAM','MARSH','SMOKE','WIRE','MINEFIELD','PILLBOX'];
  if (placeable.indexOf(t) < 0) return false;
  return !window.SCENARIO_HELPERS.isCardDisabledAsTerrain(
    state.scenario, card, state[side + 'Role'] === 'attacker'
  );
}

function isInitialTerrainCard(card, side = 'player') {
  // §3.6 煙幕・鉄条網・裏向きの平地は不可。
  return isTerrainHandCard(card, side) && !card._faceDown && !card._isPlain &&
    !['SMOKE', 'WIRE'].includes(card.terrain.type);
}

/** 山札から引かない仮の平地カード（地形のないグループ用・裏向き表示） */
function makeDummyPlain() {
  return {
    terrain: { type: 'PLAIN', modifier: '0', range: '0', rncColor: '黒', dice: {} },
    _faceDown: true,
    _isPlain: true
  };
}
function isDummyPlain(c) { return !!(c && c._isPlain && c.terrainIndex == null); }

function startTerrainPlacementPhase() {
  state.phase = 'terrainPlacement';
  prepareRandomReinforcementSlots();
  // §15.51 コミッサールはプレイ開始時、一番大きなグループへ
  placeCommissarInLargestGroup('player');
  placeCommissarInLargestGroup('ai');
  initCommissar('player');
  initCommissar('ai');
  // 最初から地形のないグループに仮の平地カードを置いておく（地形を配置したら入れ替える）
  ['player', 'ai'].forEach(side => {
    (state.groups[side] || []).forEach(grp => {
      if (!grp || grp.eliminated) return;
      if (!grp.terrain) grp.terrain = [];
      if (grp.terrain.length === 0) grp.terrain.push(makeDummyPlain());
    });
    renderField(side);
  });
  // §3.6 先攻陣営 (シナリオから取得)
  const firstFac = state.scenario && state.scenario.firstPlayer;
  // 自陣営が先攻なら 'player', そうでなければ 'ai'
  let firstSide = 'player';
  if (state.firstSideOverride) {
    firstSide = state.firstSideOverride;
  } else if (firstFac) {
    const playerKey = Object.keys(FACTIONS).find(k => FACTIONS[k] === state.player);
    firstSide = (playerKey === firstFac) ? 'player' : 'ai';
  }
  state.terrainTurn = firstSide;
  state.terrainSelected = null;
  state.terrainDone = { player: false, ai: false };
  document.getElementById('phase-banner').classList.add('active');
  updatePhaseBanner();
  renderHands();
  if (state.terrainTurn === 'ai') setTimeout(aiPlaceTerrain, 600);
}

function updatePhaseBanner() {
  const msg = document.getElementById('phase-msg');
  if (state.phase !== 'terrainPlacement') return;
  const turnName = state.terrainTurn === 'player' ? state.player.name : state.ai.name;
  const placeable = state.terrainTurn === 'player'
    ? state.playerHand.filter(c => isInitialTerrainCard(c)).length
    : state.aiHand.filter(c => isInitialTerrainCard(c, 'ai')).length;
  msg.innerHTML = `<b>地形配置フェーズ §3.6</b> ／ 手番: <b>${turnName}</b> ／ 配置可能な地形カード: <b>${placeable}枚</b>`;
}

function applyInitialTrenches() {
  if (!state.scenario?.openingTrenches && !state.scenario?.setupTrenches) return;
  const defender = state.playerRole === 'defender' ? 'player' : 'ai';
  const R = window.INFANTRY_RULES;
  for (const group of state.groups[defender]) {
    const type = R.currentTerrainType(group);
    if (!['PLAIN', 'WOODS', 'HILL', 'BRUSH'].includes(type) || !groupCanEntrench(group, defender)) continue;
    group.terrain.push({
      terrain: { type: 'TRENCH', modifier: '/-1', range: '0', rncColor: '黒', dice: {} },
      _isTrench: true,
    });
  }
}

function applyEvacuationWounds() {
  if (!state.scenario?.evacuationSetup) return;
  const defender = state.playerRole === 'defender' ? 'player' : 'ai';
  const R = window.INFANTRY_RULES;
  const deck = state.terrainDeck;
  // RNCに使ったカードも戻す。手札・配置中・除外済みカードはこの山札に含まれない。
  const indices = [...deck.draw, ...deck.discard];
  const judgments = shuffleTerrainIndices(indices);
  for (const group of state.groups[defender]) {
    let lowest = Infinity;
    let wounded = null;
    for (const card of group.cards.filter(R.isAlive)) {
      const judge = TERRAIN_CARDS[judgments.shift()];
      if (!judge) break;
      const result = (Number(judge.range) || 0) * (judge.rncColor === '赤' ? -1 : 1);
      if (result < lowest) {
        lowest = result;
        wounded = card;
      }
    }
    if (wounded) {
      applyWound(wounded);
      wounded._evacuationWound = true;
    }
  }
  deck.draw = shuffleTerrainIndices(indices);
  deck.discard = [];
  updateDeckCounts();
}

function endTerrainPlacementPhase() {
  applyEvacuationWounds();
  applyInitialTrenches();
  startSurpriseRules();
  state.phase = 'play';
  state.terrainSelected = null;
  state.actedGroups = new Set();
  updateCommissarMarker('player');
  updateCommissarMarker('ai');
  // §15.2 ゲーム開始時点の SL を記録（最初のゲームターンに除去された時の判定用）
  recordSLAtTurnEnd('player');
  recordSLAtTurnEnd('ai');
  document.querySelectorAll('.action-btn').forEach(b => { b.disabled = false; });
  document.getElementById('phase-banner').classList.remove('active');
  // 地形が無いグループにはダミーの平地カードを配置（実際の地形カードは引かない）
  ['player', 'ai'].forEach(side => {
    (state.groups[side] || []).forEach(grp => {
      if (!grp || grp.eliminated) return;
      if (grp.terrain && grp.terrain.length > 0) return;
      if (!grp.terrain) grp.terrain = [];
      grp.terrain.push(makeDummyPlain());
    });
  });
  // §3.6 末尾: 手札を補充
  while (state.playerHand.length < state.player.handMax) {
    const c = drawTerrainCard('player'); if (!c) break; state.playerHand.push(c);
  }
  while (state.aiHand.length < state.ai.handMax) {
    const c = drawTerrainCard('ai'); if (!c) break; state.aiHand.push(c);
  }
  state.aiHandCount = state.aiHand.length;
  // §4.1 先攻陣営からターン開始
  state.playerIdleLastTurn = false;
  state.aiIdleLastTurn = false;
  const firstFac = state.scenario && state.scenario.firstPlayer;
  const playerKey = getFactionKey(state.player);
  if (state.firstSideOverride) {
    state.currentTurn = state.firstSideOverride;
  } else {
    state.currentTurn = (firstFac === playerKey) ? 'player' : 'ai';
  }
  recordStartingRanges();
  if (state.currentTurn === 'player' && window.DISCARD_RULES) window.DISCARD_RULES.resetTurn();
  if (settleDeckTimeLimit() || checkBuildingParityVictory() || checkEditorVictory()) {
    renderField('player');
    renderField('ai');
    return;
  }
  renderHands();
  updateTurnBanner();
  if (state.currentTurn === 'ai') setTimeout(aiTurn, 800);
}

function updateTurnBanner() {
  if (state.phase !== 'play') return;
  const isPlayer = state.currentTurn === 'player';
  const turnName = isPlayer ? state.player.name : state.ai.name;
  // オーバーレイ表示
  let ov = document.getElementById('turn-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'turn-overlay';
    ov.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3000;pointer-events:none;transition:opacity 0.4s;border-radius:8px;padding:16px 40px;font-size:28px;';
    document.body.appendChild(ov);
  }
  ov.style.background = isPlayer ? 'rgba(0,80,180,0.85)' : 'rgba(180,30,30,0.85)';
  ov.style.border = isPlayer ? '2px solid #4af' : '2px solid #f66';
  ov.innerHTML = `<span style="font-size:16px;font-weight:bold;color:#fff;">${isPlayer ? '▶ あなたの手番' : '▶ ' + turnName + 'の手番'}</span>`;
  ov.style.opacity = '1';
  setTimeout(() => { ov.style.opacity = '0'; }, 2500);
}

function getEffectiveHandMax(side) {
  const fac = side === 'player' ? state.player : state.ai;
  const base = fac.handMax;
  let max = base;
  let slPen = 0, leaderLost = 0, enemyBonus = 0;
  // §15.4 SL・ASL（コミッサール含む）が全員除去 → 以後ずっと -1
  // §15.2/§15.3 それ以外は、SL（除去後は ASL/コミッサール）がピン、またはこのゲームターンに除去 → -1（重ねない）
  if (checkAllLeadersLost(side)) {
    leaderLost = 1;
    max -= 1;
  } else {
    slPen = slPenaltyNow(side);
    max -= slPen;
  }
  const enemySide = side === 'player' ? 'ai' : 'player';
  const activeEnemyGroups = state.groups[enemySide].filter(g => !g?.forming && _groupAlive(g));
  if (activeEnemyGroups.length === 1) {
    enemyBonus = 1;
    max += 1;
  }
  const final = Math.max(1, max);
  try {
    console.log(`[handMax-${side}] base=${base} slPen=-${slPen} leaderLost=-${leaderLost} enemyBonus=+${enemyBonus} → ${final}`);
  } catch(e){}
  return final;
}

/** §15.5 ソ連のコミッサール: 政治委員 (def.rank === '政治委員') は最初から SL・ASL と同じ指揮官（コミッサール） */
function initCommissar(side) {
  const factionKey = getFactionKey(side === 'player' ? state.player : state.ai);
  if (factionKey !== 'rus') return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  state.groups[side].forEach(g => {
    g.cards.forEach(c => {
      const def = R.lookupSoldier(c, factionKey);
      c._commissar = !!(def && def.rank === '政治委員' && R.isAlive(c));
    });
  });
}

/** §15.51 コミッサールはプレイ開始時、一番大きなグループに配置する（必要なら移す） */
function placeCommissarInLargestGroup(side) {
  const factionKey = getFactionKey(side === 'player' ? state.player : state.ai);
  if (factionKey !== 'rus') return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const groups = (state.groups[side] || []).filter(g => g && !g.eliminated);
  groups.forEach(g => {
    const ci = g.cards.findIndex(c => { const d = R.lookupSoldier(c, factionKey); return d && d.rank === '政治委員' && R.isAlive(c); });
    if (ci < 0) return;
    const size = gg => gg.cards.filter(c => R.isAlive(c)).length;
    const largest = groups.reduce((a, b) => (size(b) > size(a) ? b : a), g);
    if (largest === g || size(largest) <= size(g) || largest.cards.length >= 10) return;
    const card = g.cards.splice(ci, 1)[0];
    if (g.crewPairs) Object.keys(g.crewPairs).forEach(o => { if (Number(o) === card.num || Number(g.crewPairs[o]) === card.num) delete g.crewPairs[o]; });
    largest.cards.push(card);
    if (side === 'player') {
      const d = R.lookupSoldier(card, factionKey);
      alert(`§15.51 コミッサール ${d ? d.name : card.id} を一番大きなグループ GROUP ${largest.name} に移しました`);
    }
  });
}

/** §15.52 ピン状態でないコミッサールのいるグループの兵士はモラル値・パニック値 +1 */
function commissarModOf(group, soldier) {
  return hasCommissar(group, soldier) ? 1 : 0;
}

/** §15.2/§15.3 今「SL」として扱う兵士: SL が健在なら SL、除去されていれば ASL（またはコミッサール） */
function currentSLCard(side) {
  const R = window.INFANTRY_RULES;
  if (!R) return null;
  const facKey = getFactionKey(side === 'player' ? state.player : state.ai);
  const all = [];
  (state.groups[side] || []).forEach(g => g.cards.forEach(c => all.push(c)));
  const alive = all.filter(c => R.isAlive(c));
  const role = c => { const d = R.lookupSoldier(c, facKey); return d ? d.leader : ''; };
  return alive.find(c => role(c) === '分隊長')
    || alive.find(c => role(c) === '副分隊長')
    || alive.find(c => c._commissar)
    || null;
}

/** §15.2 自分のターン終了時の SL ペナルティ（1枚）: SL がピン状態、またはこのゲームターン中に SL が除去された */
function slPenaltyNow(side) {
  const R = window.INFANTRY_RULES;
  if (!R) return 0;
  const prev = state.slCardAtLastEnd && state.slCardAtLastEnd[side];
  const cur = currentSLCard(side);
  if (prev && !R.isAlive(prev)) return 1;
  return cur && R.isPinned(cur) ? 1 : 0;
}

/** 自分のターン終了時（補充の後）に、次のゲームターンの判定用に今の SL を記録 */
function recordSLAtTurnEnd(side) {
  if (!state.slCardAtLastEnd) state.slCardAtLastEnd = {};
  state.slCardAtLastEnd[side] = currentSLCard(side);
}

/** コミッサール持ちが死亡したら再配置 */
function updateCommissarMarker(side) {
  const factionKey = getFactionKey(side === 'player' ? state.player : state.ai);
  if (factionKey !== 'rus') return;
  initCommissar(side);
}

/** グループにコミッサールがいて、かつPINでないか */
/** §10.23 ピン状態でない SL・ASL・コミッサールがグループにいるか */
function hasActiveRallyLeader(group, side) {
  const R = window.INFANTRY_RULES;
  if (!group || !R) return false;
  const facKey = getFactionKey(side === 'player' ? state.player : state.ai);
  return group.cards.some(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c.transfer || infantryGunProfile(c, side) || window.AFV?.isAfvCard(c)) return false;
    if (c._commissar) return true;
    const def = R.lookupSoldier(c, facKey);
    return Boolean(def && (def.leader === '分隊長' || def.leader === '副分隊長'));
  });
}

/** §10.23 全回復で一緒に回復できるもう1つのグループの候補（ピン兵あり・未アクション）
 *  同距離で隣接し、どちらかに指揮官がいる／隣接していなければ両方に指揮官がいる */
function rallyAllPartnerCandidates(side, srcIdx) {
  const R = window.INFANTRY_RULES;
  const groups = state.groups[side] || [];
  const src = groups[srcIdx];
  if (!src || !R) return [];
  const teamCanRally = group => !window.AFV.isAfvGroup(group) || window.AFV.defOf(window.AFV.afvCard(group))?.ot;
  if (!teamCanRally(src)) return [];
  const acted = side === 'player' ? state.actedGroups : state.aiActedGroups;
  const srcLeader = hasActiveRallyLeader(src, side);
  const out = [];
  groups.forEach((g, gi) => {
    if (gi === srcIdx || !g || g.eliminated || acted?.has(gi) || !teamCanRally(g) ||
        (side === 'ai' && state.aiFiredGroups?.has(gi))) return;
    if (!g.cards.some(c => R.isPinned(c) && R.isAlive(c) && !c.transfer)) return;
    const gLeader = hasActiveRallyLeader(g, side);
    const adjacent = Math.abs(gi - srcIdx) === 1;
    const sameRange = (g.distance || 0) === (src.distance || 0);
    if (adjacent ? (sameRange && (srcLeader || gLeader)) : (srcLeader && gLeader)) out.push(gi);
  });
  return out;
}

function rallyAllWithPartner(side, index, card) {
  const R = window.INFANTRY_RULES;
  const groups = state.groups[side];
  const primary = groups[index];
  const discard = window.DISCARD_RULES;
  const canRallyGroups = count => {
    if (!partisanActionRoom(side, count)) return false;
    if (side === 'player') return discard.canStillAct(count);
    const faction = getFactionKey(state.ai);
    const entrenchments = faction === 'rus' ? (state.aiEntrenchments || 0) : 0;
    const actions = Math.max(0, (state.aiActionCount || 0) - entrenchments);
    return !afvSmokeActionUsed(side) && (state.aiDiscardedThisTurn || 0) <=
      Math.max(0, discard.turnLimit(faction, actions + count) - entrenchments);
  };
  if (!primary?.cards.some(c => R.isAlive(c) && R.isPinned(c) && !c.transfer) || !canRallyGroups(1)) return 0;
  const partner = canRallyGroups(2) ? rallyAllPartnerCandidates(side, index).find(gi => side === 'ai' ||
    confirm(radioText(`GROUP ${groups[gi].name} も全回復しますか？ このグループの行動も使います。`,
      `Also rally GROUP ${groups[gi].name}? This spends its action as well.`))) : undefined;
  const indices = partner == null ? [index] : [index, partner];
  for (const gi of indices) {
    const group = groups[gi];
    const previous = surprisePinnedForRally(side, card, group);
    if (!window.afvRallyCredit(group, card)) {
      for (const soldier of group.cards) {
        if (!R.isAlive(soldier) || !R.isPinned(soldier) || soldier.transfer) continue;
        if (infantryGunProfile(soldier, side)) soldier._infantryGunRally = 0;
        R.unpinSoldier(soldier);
      }
    }
    noteSurpriseRally(previous);
  }
  if (partner != null) {
    const key = side === 'player' ? 'actedGroups' : 'aiActedGroups';
    (state[key] ||= new Set()).add(partner);
  }
  return indices.length;
}

function hasCommissar(group, except) {
  const R = window.INFANTRY_RULES;
  return Boolean(group?.cards.some(c => c !== except && c._commissar && R && !c.transfer && !R.isPinned(c) && R.isAlive(c)));
}

function checkAllLeadersLost(side) {
  const R = window.INFANTRY_RULES;
  if (!R) return false;
  const factionKey = getFactionKey(side === 'player' ? state.player : state.ai);
  let hasSL = false, hasASL = false;
  const details = [];
  state.groups[side].forEach(g => {
    g.cards.forEach(c => {
      if (!R.isAlive(c)) return;
      const def = R.lookupSoldier(c, factionKey);
      if (!def) return;
      details.push({ num: c.num, name: def.name, leader: def.leader || '' });
      // §15.5 コミッサールは SL・ASL と同じ
      if (c._commissar) hasASL = true;
      if (!def.leader) return;
      if (def.leader === '分隊長') hasSL = true;
      if (def.leader === '副分隊長') hasASL = true;
    });
  });
  const lost = !hasSL && !hasASL;
  try {
    console.log(`[checkAllLeadersLost-${side}] hasSL=${hasSL} hasASL=${hasASL} lost=${lost} alive=${details.length}`);
    details.forEach(d => console.log(`  #${d.num} ${d.name} leader=${JSON.stringify(d.leader)}`));
  } catch(e){}
  return lost;
}

/** SLがダメージを受けた時に呼ぶ。今ターンのみ手札-1 */
function applySLDamagePenalty(side) {
  if (!state.slDamagePenalty) state.slDamagePenalty = { player: 0, ai: 0 };
  state.slDamagePenalty[side]++;
}

/** ターン開始時にSLペナルティをリセット */
function resetSLDamagePenalty() {
  state.slDamagePenalty = { player: 0, ai: 0 };
}

/** コミッサール処刑チェック: PIN兵士がいればRPCで判定 */
function commissarExecutionCheck(side) {
  const factionKey = getFactionKey(side === 'player' ? state.player : state.ai);
  if (factionKey !== 'rus') return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const eligible = state.groups[side].filter(g => hasCommissar(g) &&
    g.cards.some(c => R.isPinned(c) && R.isAlive(c)));
  if (!eligible.length) return;
  withDeckAttack(() => {
    let casualties = false;
    for (const g of eligible) {
      // §15.53 対象がいるグループごとにRPCを1枚引く。
      const judge = drawRandomReinforcementRnc(side);
      if (!judge) break;
      const target = pickByRPC(judge, g);
      checkBreezeRemoveSmoke(judge);
      pushTerrainToDiscard(judge);
      if (!R.isPinned(target) || !R.isAlive(target) || target._commissar || target.berserk) continue;
      const def = R.lookupSoldier(target, factionKey);
      const name = def ? def.name : target.id;
      const pos = g.cards.filter(c => R.isAlive(c)).indexOf(target) + 1;
      R.killSoldier(target);
      casualties = true;
      alert(`コミッサール処刑: ${name}（GROUP ${g.name} の位置 ${pos}）`);
    }
    if (casualties) {
      cleanupEliminatedGroups();
      renderField(side);
    }
  });
}

function updateHandRefillOptions() {
  const select = document.getElementById('end-turn-refill');
  if (!select || state.phase !== 'play' || state.currentTurn !== 'player') return;
  const room = Math.max(0, getEffectiveHandMax('player') - state.playerHand.length);
  if (select.dataset.room === String(room)) return;
  select.dataset.room = String(room);
  const selected = select.value;
  select.replaceChildren();
  const full = document.createElement('option');
  full.value = '';
  full.textContent = '上限まで';
  select.appendChild(full);
  for (let count = 0; count <= room; count++) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = `${count}枚`;
    select.appendChild(option);
  }
  select.value = selected === '' || Number(selected) <= room ? selected : String(room);
}

/** §4.5 任意の枚数まで。補充で使ったヒーローは補充枚数に含めない。 */
function refillTurnHand(side, draw = true) {
  const R = window.INFANTRY_RULES;
  const hand = state[side + 'Hand'];
  const requested = draw === true ? Infinity : Math.max(0, Number(draw) || 0);
  const handTarget = hand.length + requested;
  let maximum = getEffectiveHandMax(side);
  while (hand.length < Math.min(maximum, handTarget)) {
    const card = drawTerrainCard(side);
    if (!card) break;
    hand.push(card);
    if (state.terrainDeck.timeLimitReached || card.terrain.type !== 'HERO' || !surpriseCanRally(side, card)) continue;
    const candidates = state.groups[side].flatMap(group => group.cards
      .filter(c => R.isAlive(c) && R.isPinned(c) && !c.transfer &&
        !window.AFV.isAfvCard(c) && !infantryGunProfile(c, side))
      .map(soldier => ({ group, soldier })));
    if (!candidates.length) continue;
    let selected;
    if (side === 'ai') {
      const leader = currentSLCard(side);
      selected = candidates.find(entry => entry.soldier === leader);
    } else {
      const faction = getFactionKey(state.player);
      const names = candidates.map(({ soldier }, i) => `${i + 1}: ${R.lookupSoldier(soldier, faction)?.name || soldier.id}`);
      const answer = prompt(radioText('今引いたヒーローで回復する兵士を選んでください。0で手札に残します。',
        'Choose a soldier to rally with the drawn Hero, or enter 0 to keep it.') + '\n' + names.join('\n'), '0');
      selected = candidates[Number(answer) - 1];
    }
    if (!selected) continue;
    const previous = surprisePinnedForRally(side, card, selected.group);
    R.unpinSoldier(selected.soldier);
    selected.soldier.heroRecovery = true;
    noteSurpriseRally(previous);
    pushTerrainToDiscard(hand.pop());
    maximum = getEffectiveHandMax(side);
  }
}

function endPlayerTurn(draw = true) {
  if (state.phase !== 'play') return;
  // §14.4 狙撃兵チェックは狙撃を受けた直後のターンだけ。プレイヤーが狙撃していれば次のAIターンにチェックされうる
  state.aiSnipeCheckRnc = null;
  state.playerSnipeCheckRnc = state.playerSnipeRncThisTurn != null ? state.playerSnipeRncThisTurn : null;
  state.playerSnipeRncThisTurn = null;
  // §15.53 処刑の判定は自分のターン終了時だけ
  commissarExecutionCheck('player');
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  updateCommissarMarker('player');
  updateCommissarMarker('ai');
  // §4.5 手札補充
  if (draw) refillTurnHand('player', draw);
  if (settleDeckTimeLimit() || state.phase !== 'play') return;
  expireWoundSuspensions();
  recordSLAtTurnEnd('player'); // §15.2 次のゲームターンの判定用
  // 次ターンでSLペナルティリセット
  resetSLDamagePenalty();
  removeSmokeUnderTwoMoves(); // §13.242
  state.currentTurn = 'ai';
  state.actedGroups = new Set();
  try { ufSnapshot('自軍の手番の終わり', 'player'); } catch (e) {}
  state.turnCount = (state.turnCount || 0) + 1;
  recordStartingRanges();
  // §21 爆薬は侵入したターンだけ使える: ターンが終わったら「侵入したターン」の印を消す
  ['player', 'ai'].forEach(sd => (state.groups[sd] || []).forEach(g => g && g.cards.forEach(c => { c.infiltratedThisTurn = false; })));
  // 認知状態はターン終了でリセット
  (state.groups.player || []).forEach(g => { if (g) g.recognizedTargets = []; });
  (state.groups.ai || []).forEach(g => { if (g) g.recognizedTargets = []; });
  // ターン累積FP リセット (グループごとのターン射撃FP合計)
  (state.groups.player || []).forEach(g => { if (g) g.firedFPThisTurn = 0; });
  (state.groups.ai || []).forEach(g => { if (g) g.firedFPThisTurn = 0; });
  // §10.45 英雄効果リセット (ターン終了で全兵士の _heroEnhanced をクリア)
  (state.groups.player || []).forEach(g => { if (g) g.cards.forEach(c => { c._heroEnhanced = false; }); });
  (state.groups.ai || []).forEach(g => { if (g) g.cards.forEach(c => { c._heroEnhanced = false; }); });
  renderHands();
  updateTurnBanner();
  // ターン終了時にシナリオ勝利判定
  if (typeof checkScenarioAVictory === 'function') checkScenarioAVictory();
  if (typeof checkScenarioCVictory === 'function') checkScenarioCVictory();
  if (typeof checkScenarioDVictory === 'function') checkScenarioDVictory();
  if (state.phase === 'play') setTimeout(aiTurn, 3000);
  else queueGameOverDisplay();
}

async function endAITurn() {
  if (state.phase !== 'play') return;
  // §14.4 AI がこのターンに狙撃した → 次のプレイヤーターンに狙撃兵チェックができる
  if (state.aiSnipeRncThisTurn != null) { state.aiSnipeCheckRnc = state.aiSnipeRncThisTurn; state.aiSnipeRncThisTurn = null; }
  // §4.6 AI がこのターンに何もしなかったか（次のプレイヤーターンはアクションか捨て札が必要）
  const didSomething = state.aiActedThisTurn || state.aiActedGroups?.size || state.aiFiredGroups?.size
    || state.aiDiscardedThisTurn > 0 || state.aiDumpedThisTurn;
  state.aiIdleLastTurn = !didSomething;
  if (state.aiIdleLastTurn && state.playerIdleLastTurn && state.aiHand.length > 0) {
    const nonHero = state.aiHand.findIndex(card => card.terrain?.type !== 'HERO');
    const [card] = state.aiHand.splice(Math.max(0, nonHero), 1);
    pushTerrainToDiscard(card);
    window.DISCARD_RULES.revealVolksDiscard('ai', card);
    state.aiDumpedThisTurn = true;
    state.aiIdleLastTurn = false;
    state.aiHandCount = state.aiHand.length;
    renderHands();
    await showAIDiscard('AI: 捨て札 1枚', [card]);
  }
  // §15.53 処刑の判定は自分のターン終了時だけ
  commissarExecutionCheck('ai');
  if (state.phase !== 'play' || settleDeckTimeLimit()) return;
  updateCommissarMarker('player');
  updateCommissarMarker('ai');
  // §4.5 AI 手札補充
  refillTurnHand('ai');
  state.aiHandCount = state.aiHand.length;
  if (settleDeckTimeLimit() || state.phase !== 'play') return;
  expireWoundSuspensions();
  recordSLAtTurnEnd('ai'); // §15.2 次のゲームターンの判定用
  removeSmokeUnderTwoMoves(); // §13.242
  state.currentTurn = 'player';
  state.actionDone = false;
  state.actedGroups = new Set();
  try { ufSnapshot('敵の手番の終わり', 'ai'); } catch (e) {}
  state.turnCount = (state.turnCount || 0) + 1;
  recordStartingRanges();
  // §21 爆薬は侵入したターンだけ使える: ターンが終わったら「侵入したターン」の印を消す
  ['player', 'ai'].forEach(sd => (state.groups[sd] || []).forEach(g => g && g.cards.forEach(c => { c.infiltratedThisTurn = false; })));
  // 認知状態はターン終了でリセット
  (state.groups.player || []).forEach(g => { if (g) g.recognizedTargets = []; });
  (state.groups.ai || []).forEach(g => { if (g) g.recognizedTargets = []; });
  // ターン累積FP リセット (グループごとのターン射撃FP合計)
  (state.groups.player || []).forEach(g => { if (g) g.firedFPThisTurn = 0; });
  (state.groups.ai || []).forEach(g => { if (g) g.firedFPThisTurn = 0; });
  // §10.45 英雄効果リセット (ターン終了で全兵士の _heroEnhanced をクリア)
  (state.groups.player || []).forEach(g => { if (g) g.cards.forEach(c => { c._heroEnhanced = false; }); });
  (state.groups.ai || []).forEach(g => { if (g) g.cards.forEach(c => { c._heroEnhanced = false; }); });
  if (window.DISCARD_RULES) window.DISCARD_RULES.resetTurn();
  checkWoundEndurance(); // §33.7 プレイヤーのターンの開始時
  if (settleDeckTimeLimit() || state.phase !== 'play') return;
  document.querySelectorAll('.action-btn').forEach(b => { b.disabled = false; });
  renderField('player'); renderField('ai');
  renderHands();
  updateTurnBanner();
  // ターン終了時にシナリオ勝利判定
  if (typeof checkScenarioAVictory === 'function') checkScenarioAVictory();
  if (typeof checkScenarioCVictory === 'function') checkScenarioCVictory();
  if (typeof checkScenarioDVictory === 'function') checkScenarioDVictory();
  if (state.phase !== 'play') { queueGameOverDisplay(); return; }

  await runBerserkAtTurnStart('player');
}

