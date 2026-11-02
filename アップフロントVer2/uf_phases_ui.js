// アップフロント: §27 目標捕捉・右クリックメニュー・オーバーレイ・§3.6 開始時の地形配置
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== §27 目標捕捉（迫撃砲） =====
// 捕捉は撃った側のグループに持たせる: g.pinpointing = [目標グループの番号]、g.pinpointShooterNum = 捕捉している迫撃砲の兵士番号
// 目標側の g.pinpointed / g.pinpointedBy は表示用で、syncAcquisitionFlags で撃った側から作り直す

function _otherSide(side) { return side === 'player' ? 'ai' : 'player'; }

/** 目標側の捕捉の印を、撃った側の pinpointing から作り直す */
function syncAcquisitionFlags() {
  ['player', 'ai'].forEach(side => (state.groups[side] || []).forEach(t => { if (t) { t.pinpointed = false; t.pinpointedBy = null; } }));
  ['player', 'ai'].forEach(side => {
    const tSide = _otherSide(side);
    (state.groups[side] || []).forEach((g, gi) => {
      if (!g || !Array.isArray(g.pinpointing)) return;
      g.pinpointing.forEach(ti => {
        const t = state.groups[tSide] && state.groups[tSide][ti];
        if (t && !t.pinpointed) { t.pinpointed = true; t.pinpointedBy = { side: side, idx: gi }; }
      });
    });
  });
}

/** グループ g の迫撃砲が、目標 tgtIdx を捕捉しているか */
function isAcquiredBy(g, tgtIdx, shooterCard) {
  if (!g || !Array.isArray(g.pinpointing) || g.pinpointing.indexOf(tgtIdx) < 0) return false;
  if (shooterCard && g.pinpointShooterNum != null && g.pinpointShooterNum !== shooterCard.num) return false;
  return true;
}

/** §27.1 迫撃砲が撃ったあとの捕捉。命中・外れに関係なく目標を捕捉する。
 *  別の目標を撃ったら前の捕捉は失う（§27.2）。撃つ側か目標が移動中（§27.1）・煙幕の中（§27.11）なら新しく捕捉しない */
function applyMortarAcquisition(srcSide, srcIdx, tgtIdx, shooterCard) {
  const M = window.MORTAR_RULES;
  const g = state.groups[srcSide] && state.groups[srcSide][srcIdx];
  const t = state.groups[_otherSide(srcSide)] && state.groups[_otherSide(srcSide)][tgtIdx];
  if (!g || !t || !M) return;
  const already = isAcquiredBy(g, tgtIdx, shooterCard);
  if (!already) {
    g.pinpointing = [];
    g.pinpointShooterNum = null;
    const canAcquire = !M.isMoving(g) && !M.isMoving(t) && !M.hasSmoke(g) && !M.hasSmoke(t);
    if (canAcquire) { g.pinpointing = [tgtIdx]; g.pinpointShooterNum = shooterCard ? shooterCard.num : null; }
  }
  syncAcquisitionFlags();
}

/** §27.2 卓上に残る移動カードを置いたグループ grp: 自分の捕捉も、grp への捕捉も失う */
function loseAcquisitionOnMove(grp) {
  let changed = false;
  ['player', 'ai'].forEach(side => {
    const gi = (state.groups[side] || []).indexOf(grp);
    if (gi < 0) return;
    if (Array.isArray(grp.pinpointing) && grp.pinpointing.length) { grp.pinpointing = []; grp.pinpointShooterNum = null; changed = true; }
    (state.groups[_otherSide(side)] || []).forEach(e => {
      if (e && Array.isArray(e.pinpointing) && e.pinpointing.indexOf(gi) >= 0) {
        e.pinpointing = e.pinpointing.filter(x => x !== gi);
        changed = true;
      }
    });
  });
  if (changed) syncAcquisitionFlags();
}

/** §27.2 白兵戦に入った兵士のうち、捕捉している迫撃砲の兵士なら捕捉を失う */
function loseAcquisitionForCards(cards) {
  if (!cards || !cards.length) return;
  let changed = false;
  ['player', 'ai'].forEach(side => (state.groups[side] || []).forEach(g => {
    if (!g || !Array.isArray(g.pinpointing) || !g.pinpointing.length) return;
    const shooter = _acquiringShooterCard(g, side);
    if (shooter && cards.indexOf(shooter) >= 0) { g.pinpointing = []; g.pinpointShooterNum = null; changed = true; }
  }));
  if (changed) syncAcquisitionFlags();
}
window.loseAcquisitionForCards = loseAcquisitionForCards;

/** 捕捉している迫撃砲の兵士カード（番号が無い古いデータは、グループの最初の迫撃砲の兵士） */
function _acquiringShooterCard(g, side) {
  const R = window.INFANTRY_RULES;
  if (!R || !g) return null;
  const facKey = getFactionKey(side === 'player' ? state.player : state.ai);
  const mortars = g.cards.filter(c => {
    const d = R.lookupSoldier(c, facKey);
    return d && d.weaponCat && d.weaponCat.indexOf('迫撃砲') >= 0;
  });
  if (g.pinpointShooterNum != null) return mortars.find(c => c.num === g.pinpointShooterNum) || null;
  return mortars[0] || null;
}

/** §27.2 捕捉を失う状態の確認（描画のたびに呼ぶ）: 迫撃砲の兵士の戦死・潰走・故障・ピン・白兵戦（侵入）、
 *  §38.2 夜間に目標の観測を失った、目標グループの消滅 */
function updateAcquisitions() {
  const R = window.INFANTRY_RULES;
  if (!R || !state || !state.groups) return;
  let changed = false;
  ['player', 'ai'].forEach(side => {
    const tSide = _otherSide(side);
    (state.groups[side] || []).forEach(g => {
      if (!g || !Array.isArray(g.pinpointing) || !g.pinpointing.length) return;
      const shooter = _acquiringShooterCard(g, side);
      const lost = g.eliminated || !shooter || !R.isAlive(shooter) || R.isPinned(shooter)
        || shooter.malfunctioned || shooter.destroyed || shooter.infiltrating;
      const keep = lost ? [] : g.pinpointing.filter(ti => {
        const t = state.groups[tSide] && state.groups[tSide][ti];
        if (!t || t.eliminated) return false;
        return isTargetVisibleForPlayer(g, ti, tSide);
      });
      if (keep.length !== g.pinpointing.length) {
        g.pinpointing = keep;
        if (!keep.length) g.pinpointShooterNum = null;
        changed = true;
      }
    });
  });
  if (changed) syncAcquisitionFlags();
}

function resolveMortarAction() {
  const R = window.INFANTRY_RULES;
  const M = window.MORTAR_RULES;
  if (!R || !M) { alert('ルールエンジン未読込'); return; }
  const src = state.fireSource;
  const tgt = state.fireTarget;
  if (!src || !tgt) return;
  const srcGroup = state.groups[src.side][src.idx];
  const tgtGroup = state.groups[tgt.side][tgt.idx];
  // 夜間: 認知 or 照射 されていないターゲットには迫撃砲射撃不可
  if (!isTargetVisibleForPlayer(srcGroup, tgt.idx, tgt.side)) {
    alert('夜間: 認知されていない敵には迫撃砲射撃できません');
    return;
  }
  const playerKey = getFactionKey(state.player);
  const enemyKey  = getFactionKey(state.ai);
  const srcFacKey = src.side === 'player' ? playerKey : enemyKey;
  const tgtFacKey = tgt.side === 'player' ? playerKey : enemyKey;

  const shooters = M.getMortarShooters(srcGroup, srcFacKey);
  if (shooters.length === 0) { alert('このグループには迫撃砲を持つ生存兵士がいません'); return; }
  const shooter = shooters[0];

  const fireCards = [...state.selectedHand].map(i => state.playerHand[i])
    .filter(c => c && c.terrain && c.terrain.type && c.terrain.type.indexOf('FIRE') === 0);
  if (fireCards.length === 0) { alert('射撃カードを1枚選択してください（数字は無視されます）'); return; }
  const fireCard = fireCards[0];

  const adjacent = Math.abs(src.idx - tgt.idx) <= 1;
  const baseDistance = R.relativeRange(srcGroup.distance, tgtGroup.distance);
  const distance = adjacent ? baseDistance : Math.max(0, baseDistance - 1);

  updateAcquisitions();
  const acquired = isAcquiredBy(srcGroup, tgt.idx, shooter.card);
  const fireCheck = M.canFire(srcGroup, tgtGroup, { acquired: acquired });
  if (!fireCheck.ok) { alert(fireCheck.reason); return; }
  const smokePenalty = fireCheck.smokePenalty;
  // §26.2 迫撃砲はガリーの中へ・ガリーから撃てる
  // §12.12 移動中のグループは迫撃砲を撃てない
  if (M.isMoving(srcGroup)) { alert('移動中のグループは迫撃砲を撃てません（§12.12）'); return; }

  const baseInfo = M.calcHitCeiling(shooter, distance, srcGroup, {});
  if (baseInfo.na) { alert(`距離${distance}は迫撃砲の射程外（NA）です — 通常の射撃で撃ってください`); return; }

  const aiConcealCards = canUseConcealment(tgtGroup) ? aiUseConcealment() : []; // §9.5 トーチカは不可
  const conceals = aiConcealCards.length;

  const pinpoint = acquired;
  const targetSmoke = M.hasSmoke(tgtGroup); // §27.12
  const mortarNight = state.isNight && !isGroupFlared(tgtGroup); // §38.4/§38.52
  // §8.9 壁（障壁）は撃たれる側の修正（火力 -1、ダメージ判定で適用）。撃つ側の壁による命中ランク修正は無し
  const tgtWall = M.isOnWall(tgtGroup) && !tgtGroup.encircled;

  const hitInfo = M.calcHitCeiling(shooter, distance, srcGroup, {
    conceals: conceals, pinpoint: pinpoint, smokePenalty: smokePenalty, targetSmoke: targetSmoke, night: mortarNight,
    guard: !!(shooter.card.prisoners && shooter.card.prisoners.length), // §32.21
    wounded: R.isWoundActive(shooter.card) // §33.2
  });
  const ceiling = hitInfo.ceiling;

  const judge = drawTerrainCard();
  if (!judge) { alert('地形デッキがありません'); return; }
  const rnc = M.readRNC(judge);
  const moving = M.isMoving(srcGroup) || M.isMoving(tgtGroup);
  let isHit = (rnc.num <= ceiling);
  if (moving && rnc.isRed) isHit = false;

  showJudgeCard(judge);
  // 迫撃砲: 命中判定用カードで故障チェック (現火力 = 迫撃砲のFP)
  const mortarBaseFP = M.getMortarFP(shooter.def, distance, srcFacKey);
  checkMortarMalfunction(judge, srcGroup, shooter); // §19.5 迫撃砲は命中判定のRNCで迫撃砲だけが故障の対象
  checkBreezeRemoveSmoke(judge);
  pushTerrainToDiscard(judge);

  // §27.1 捕捉（命中・外れに関係なく。別グループを撃ったら前の捕捉は失う）
  applyMortarAcquisition(src.side, src.idx, tgt.idx, shooter.card);
  markFiredAt(srcGroup, tgtGroup); // §38.3 観測の修正用

  const hi = state.playerHand.indexOf(fireCard);
  if (hi >= 0) state.playerHand.splice(hi, 1);
  pushTerrainToDiscard(fireCard);

  const mods = [];
  const modsLines = [];
  if (conceals) modsLines.push(`　隠蔽: -${conceals}`);
  if (pinpoint) modsLines.push('　補足: +1');
  if (tgtWall) modsLines.push('　目標が壁: 火力 -1');
  if (smokePenalty) modsLines.push('　煙幕越し: -1');
  if (targetSmoke) modsLines.push('　目標が煙幕: -1');
  if (mortarNight) modsLines.push('　夜間: -1');
  if (shooter.card.prisoners && shooter.card.prisoners.length) modsLines.push('　監視役: -1');
  if (R.isWoundActive(shooter.card)) modsLines.push('　負傷: -1');
  const ceilStr = ceiling < 0 ? '命中不能' : `0-${ceiling}`;
  const moveNote = moving ? '（移動中: 赤は外れ）' : '';
  const hitText = isHit ? '<span style="color:#3f3;font-weight:bold;">命中</span>'
                        : '<span style="color:#f66;font-weight:bold;">外れ</span>';
  const titleHit = `迫撃砲 ${srcGroup.name}→${tgtGroup.name} 距離${distance}${moveNote}<br/>`
                 + `基本命中ランク: 0-${baseInfo.base}${baseInfo.hasCrew ? '' : '[クルー無]'}<br/>`
                 + `修正:<br/>${modsLines.length ? modsLines.join('<br/>') : '　なし'}<br/>`
                 + `最終命中ランク: ${ceilStr}<br/>`
                 + `RNC: ${rnc.isRed ? '赤' : '黒'}${rnc.num} → ${hitText}`;

  if (!isHit) {
    showFireResultOverlay(titleHit, [], [fireCard, judge]).then(() => {
      renderField('player'); renderField('ai');
      renderHands();
    });
    if (window.DISCARD_RULES) window.DISCARD_RULES.markActed();
    // §6.6/§4.2 迫撃砲の射撃もグループの1アクション
    if (!state.actedGroups) state.actedGroups = new Set();
    state.actedGroups.add(src.idx);
    return;
  }

  // 命中したら兵士ごとに判定カードを引いてダメージ判定
  // §8.9 障壁にいる防御グループへの迫撃砲は火力 -1（包囲下は除く）
  const finalFP = Math.max(0, M.getMortarFP(shooter.def, distance, srcFacKey) - (tgtWall ? 1 : 0));
  const results = [];
  let malfuncMod = 0;
  const _targets = attackTargetsOf(tgtGroup); // §17.8 移送中の兵士も目標
  for (let i = 0; i < _targets.length; i++) {
    const card = _targets[i];
    if (!R.isAlive(card)) continue;
    const dj = drawTerrainCard();
    if (!dj) continue;
    const drnc = M.readRNC(dj);
    const drncSigned = drnc.isRed ? -drnc.num : drnc.num;
    const rpc0r = parseInt((dj.terrain && dj.terrain.dice && dj.terrain.dice['0r']) || '0', 10) || 0;
    const def = R.lookupSoldier(card, tgtFacKey);
    const wasPinned = R.isPinned(card);
    const commissarMod = hasCommissar(tgtGroup) ? 1 : 0;
    const encircleMod = (tgtGroup && tgtGroup.encircled && wasPinned) ? -1 : 0;
    const r = R.resolveFireOnSoldier(finalFP + malfuncMod + transitFireBonus(card), drncSigned, def, wasPinned, rpc0r, commissarMod + ((card.malfunctioned || card.destroyed) ? -1 : 0), commissarMod + encircleMod + ((card.malfunctioned || card.destroyed) ? -1 : 0), 0, R.rpc7wOf(dj)); // §19.4 故障兵器 -1
    if (r.result === 'WOUND') r.result = applyWound(card); // §33.1
    let actualResult = r.result;
    if (actualResult === 'KIA' || actualResult === 'PANIC_KIA') R.killSoldier(card);
    else if (actualResult === 'PANIC_ROUT') R.routSoldier(card);
    else if (actualResult === 'PIN') R.pinSoldier(card);
    if (actualResult !== 'NONE' && def && def.leader === '分隊長') {
      applySLDamagePenalty(tgt.side);
    }
    const morale = def ? (wasPinned ? parseInt(def.panic,10)||0 : parseInt(def.morale,10)||0 + commissarMod) : 0;
    const kia = def ? (wasPinned ? parseInt(def.kiaBack,10)||0 : parseInt(def.kiaFront,10)||0) : 0;
    results.push({
      i: i, name: def ? def.name : card.id,
      rnc: drncSigned, rncColor: drnc.isRed ? '赤' : '黒',
      result: actualResult, finalFP: finalFP + malfuncMod,
      sum: finalFP + malfuncMod + drncSigned,
      morale: morale, kia: kia, wasPinned: wasPinned
    });
    showJudgeCard(dj);
    checkBreezeRemoveSmoke(dj);
    pushTerrainToDiscard(dj);
  }

  showFireResultOverlay(titleHit, results, [fireCard, judge]).then(() => {
    cleanupEliminatedGroups();
    renderField('player'); renderField('ai');
    renderHands();
  });
  if (window.CC_ACTION) window.CC_ACTION.clearInfiltration(srcGroup, 'fire');
  if (window.DISCARD_RULES) window.DISCARD_RULES.markActed();
  // §6.6/§4.2 迫撃砲の射撃もグループの1アクション
  if (!state.actedGroups) state.actedGroups = new Set();
  state.actedGroups.add(src.idx);
}

/** §11 クルー指定画面（プレイヤー用）。1回のアクションで1つだけ変更（組む・組み直す・解く）。
 *  ピン状態の兵士は持ち主・助手にできず、ピン状態の兵士がいるクルーは解けない（§11.3）。
 *  クルー兵器の持ち主を別のクルー兵器の助手にもできる（その持ち主の兵器は撃てない §11.2）。
 *  onDecide: 変更を決定した時に呼ぶ（アクション消費） */
function openCrewModal(grp, onDecide) {
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
      const isOwner = !!(d && d.needsCrew);
      const asst = isOwner ? assistOf(c) : null;
      // 持ち主として押せる: クルー兵器持ち・ピンでない・助手役でない・現在の助手もピンでない
      const ownerPickable = !changed && !ownerSel && isOwner && !pinned && !isAssistant(c) && !(asst && R.isPinned(asst));
      // 助手として押せる: ピンでない・持ち主本人でない・他の助手でない・自分の助手を持っていない
      const asstPickable = !changed && ownerSel && c !== ownerSel && !pinned && !isAssistant(c) && !assistOf(c);
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
      else if (isAssistant(c)) role.textContent = `助手（#${ownerOfAssistant(c).num} の）`;
      else if (isOwner) role.textContent = 'クルー兵器（助手なし）';
      wrap.appendChild(role);
      // 解除ボタン（持ち主・助手ともピンでない時だけ）
      if (asst && !changed && !ownerSel) {
        const canBreak = !pinned && !R.isPinned(asst);
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
  if (!group.crewPairs) return out;
  Object.keys(group.crewPairs).forEach(ownerNum => {
    const ownerIdx = group.cards.findIndex(c => c.num === parseInt(ownerNum, 10));
    const assistIdx = group.cards.findIndex(c => c.num === group.crewPairs[ownerNum]);
    if (ownerIdx >= 0 && assistIdx >= 0) out[ownerIdx] = assistIdx;
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

function showOverlay(src) {
  overlayImg.src = src;
  overlayImg.style.display = '';
  overlayGroup.style.display = 'none';
  overlay.classList.add('active');
}
let groupOverlayImgs = []; // {img, card, showBack}

let currentOverlayGroup = null;
let currentOverlaySide = null;

function showGroupOverlay(side, group) {
  currentOverlayGroup = group;
  currentOverlaySide = side;
  overlayImg.style.display = 'none';
  overlayGroup.style.display = '';
  groupGrid.classList.remove('discard-row');
  const faction = side === 'player' ? state.player : state.ai;
  const hint = side === 'player' ? '※ 左クリック=裏/表, 右クリック=移動' : '※ クリックで裏/表';
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
  overlayImg.style.display = 'none';
  overlayGroup.style.display = '';
  groupTitle.textContent = `${title}  (${cards.length}枚)  ※ クリックで裏/表`;
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
  if (e.target === overlay || e.target === overlayImg) { overlay.classList.remove('active'); return; }
  // グループの拡大表示: カード（左クリック=裏/表、右クリック=メニュー）と「全部表/全部裏」以外は、どこをクリックしても閉じる
  //   （拡大していると枠の外が見つけにくいため）。カードのクリックは stopPropagation でここまで来ない
  if (overlayGroup.style.display !== 'none' && !(e.target.closest && e.target.closest('.toolbar'))) {
    overlay.classList.remove('active');
  }
});
// 1枚の拡大表示中は、画面のどこをクリックしても閉じる（ズーム中は拡大画像の外がなくなるため）
document.addEventListener('click', e => {
  if (overlay.classList.contains('active') && overlayImg.style.display !== 'none') {
    e.stopPropagation(); e.preventDefault();
    overlay.classList.remove('active');
  }
}, true);

// ===== §3.6 開始時の地形交互配置フェーズ =====
state.phase = 'play'; // 'play' | 'terrainPlacement'
state.terrainTurn = null; // 'player' | 'ai'
state.terrainSelected = null; // 選択中の手札index
state.terrainDone = { player: false, ai: false };

function isTerrainHandCard(card) {
  if (!card || !card.terrain) return false;
  const t = card.terrain.type;
  // §3.6 配置可能なのは地形カード(平地以外); 移動カード等は不可
  // 平地相当として除外: MOVEMENT, FIRE, RALLY, HERO, SNIPER, CONCEALED
  // 配置可能: WOODS, BUILDINGS, HILL, GULLY, WALL, BRUSH, STREAM, MARSH, SMOKE, WIRE, MINEFIELD, PILLBOX
  const placeable = ['WOODS','BUILDINGS','HILL','GULLY','WALL','BRUSH','STREAM','MARSH','SMOKE','WIRE','MINEFIELD','PILLBOX'];
  if (placeable.indexOf(t) < 0) return false;
  // シナリオで除外指定があれば除く (treatAsPlain)
  const tap = state.scenario && state.scenario.treatAsPlain;
  if (tap && tap.indexOf(t) >= 0) return false;
  return true;
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
    ? state.playerHand.filter(isTerrainHandCard).length
    : state.aiHand.filter(isTerrainHandCard).length;
  msg.innerHTML = `<b>地形配置フェーズ §3.6</b> ／ 手番: <b>${turnName}</b> ／ 配置可能な地形カード: <b>${placeable}枚</b>`;
}

function endTerrainPlacementPhase() {
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
    const c = drawTerrainCard(); if (!c) break; state.playerHand.push(c);
  }
  while (state.aiHand.length < state.ai.handMax) {
    const c = drawTerrainCard(); if (!c) break; state.aiHand.push(c);
  }
  state.aiHandCount = state.aiHand.length;
  // §4.1 先攻陣営からターン開始
  const firstFac = state.scenario && state.scenario.firstPlayer;
  const playerKey = getFactionKey(state.player);
  if (state.firstSideOverride) {
    state.currentTurn = state.firstSideOverride;
  } else {
    state.currentTurn = (firstFac === playerKey) ? 'player' : 'ai';
  }
  if (state.currentTurn === 'player' && window.DISCARD_RULES) window.DISCARD_RULES.resetTurn();
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
  const activeEnemyGroups = state.groups[enemySide].filter(g => !g.eliminated);
  if (activeEnemyGroups.length <= 1) {
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
function commissarModOf(group) {
  return (group && typeof hasCommissar === 'function' && hasCommissar(group)) ? 1 : 0;
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
  if (prev && !R.isAlive(prev)) return 1;
  const cur = currentSLCard(side);
  return (cur && R.isPinned(cur)) ? 1 : 0;
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
    if (!R.isAlive(c) || R.isPinned(c)) return false;
    if (c._commissar) return true;
    const def = R.lookupSoldier(c, facKey);
    return !!(def && (def.leader === '分隊長' || def.leader === '副分隊長'));
  });
}

/** §10.23 全回復で一緒に回復できるもう1つのグループの候補（ピン兵あり・未アクション）
 *  同距離で隣接し、どちらかに指揮官がいる／隣接していなければ両方に指揮官がいる */
function rallyAllPartnerCandidates(side, srcIdx) {
  const R = window.INFANTRY_RULES;
  const groups = state.groups[side] || [];
  const src = groups[srcIdx];
  if (!src || !R) return [];
  const acted = side === 'player' ? (state.actedGroups || new Set()) : (state.aiActedGroups || new Set());
  const srcLeader = hasActiveRallyLeader(src, side);
  const out = [];
  groups.forEach((g, gi) => {
    if (gi === srcIdx || !g || g.eliminated || acted.has(gi)) return;
    if (!g.cards.some(c => R.isPinned(c) && R.isAlive(c))) return;
    const gLeader = hasActiveRallyLeader(g, side);
    const adjacent = Math.abs(gi - srcIdx) === 1 && (g.distance || 0) === (src.distance || 0);
    if (adjacent ? (srcLeader || gLeader) : (srcLeader && gLeader)) out.push(gi);
  });
  return out;
}

function hasCommissar(group) {
  const R = window.INFANTRY_RULES;
  return group.cards.some(c => c._commissar && R && !R.isPinned(c) && R.isAlive(c));
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
  state.groups[side].forEach(g => {
    if (!hasCommissar(g)) return;
    if (!g.cards.some(c => R.isPinned(c) && R.isAlive(c))) return;
    // §15.53 RPC を引き、グループの人数の列の数字の位置にいる兵士がピン状態なら処刑（除去）
    const judge = drawTerrainCard();
    if (!judge) return;
    const target = pickByRPC(judge, g);
    checkBreezeRemoveSmoke(judge);
    pushTerrainToDiscard(judge);
    if (target && R.isPinned(target) && R.isAlive(target) && !target._commissar) {
      const def = R.lookupSoldier(target, factionKey);
      const name = def ? def.name : target.id;
      const pos = g.cards.filter(c => R.isAlive(c)).indexOf(target) + 1;
      R.killSoldier(target);
      alert(`コミッサール処刑: ${name}（GROUP ${g.name} の位置 ${pos}）`);
      renderField(side);
    }
  });
}

function endPlayerTurn() {
  // §14.4 狙撃兵チェックは狙撃を受けた直後のターンだけ。プレイヤーが狙撃していれば次のAIターンにチェックされうる
  state.aiSnipeCheckRnc = null;
  state.playerSnipeCheckRnc = state.playerSnipeRncThisTurn != null ? state.playerSnipeRncThisTurn : null;
  state.playerSnipeRncThisTurn = null;
  // §15.53 処刑の判定は自分のターン終了時だけ
  commissarExecutionCheck('player');
  updateCommissarMarker('player');
  updateCommissarMarker('ai');
  // §4.5 手札補充
  const pMax = getEffectiveHandMax('player');
  while (state.playerHand.length < pMax) {
    const c = drawTerrainCard(); if (!c) break; state.playerHand.push(c);
  }
  recordSLAtTurnEnd('player'); // §15.2 次のゲームターンの判定用
  // 次ターンでSLペナルティリセット
  resetSLDamagePenalty();
  removeSmokeUnderTwoMoves(); // §13.242
  state.currentTurn = 'ai';
  state.actedGroups = new Set();
  try { ufSnapshot('自軍の手番の終わり', 'player'); } catch (e) {}
  state.turnCount = (state.turnCount || 0) + 1;
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
  setTimeout(aiTurn, 3000);
}

function endAITurn() {
  // §14.4 AI がこのターンに狙撃した → 次のプレイヤーターンに狙撃兵チェックができる
  if (state.aiSnipeRncThisTurn != null) { state.aiSnipeCheckRnc = state.aiSnipeRncThisTurn; state.aiSnipeRncThisTurn = null; }
  // §4.6 AI がこのターンに何もしなかったか（次のプレイヤーターンはアクションか捨て札が必要）
  state.aiIdleLastTurn = !(state.aiActedThisTurn || (state.aiDiscardedThisTurn || 0) > 0 || state.aiDumpedThisTurn);
  // §15.53 処刑の判定は自分のターン終了時だけ
  commissarExecutionCheck('ai');
  updateCommissarMarker('player');
  updateCommissarMarker('ai');
  // §4.5 AI 手札補充
  const aiMax = getEffectiveHandMax('ai');
  while (state.aiHand.length < aiMax) {
    const c = drawTerrainCard(); if (!c) break; state.aiHand.push(c);
  }
  state.aiHandCount = state.aiHand.length;
  recordSLAtTurnEnd('ai'); // §15.2 次のゲームターンの判定用
  removeSmokeUnderTwoMoves(); // §13.242
  state.currentTurn = 'player';
  state.actionDone = false;
  state.actedGroups = new Set();
  try { ufSnapshot('敵の手番の終わり', 'ai'); } catch (e) {}
  state.turnCount = (state.turnCount || 0) + 1;
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
  document.querySelectorAll('.action-btn').forEach(b => { b.disabled = false; });
  renderField('player'); renderField('ai');
  renderHands();
  updateTurnBanner();
  // ターン終了時にシナリオ勝利判定
  if (typeof checkScenarioAVictory === 'function') checkScenarioAVictory();
  if (typeof checkScenarioCVictory === 'function') checkScenarioCVictory();
  if (typeof checkScenarioDVictory === 'function') checkScenarioDVictory();

  // §20.91 狂暴兵の自動CC（プレイヤーターン開始時）
  if (window.CC_ACTION) {
    const R_b = window.INFANTRY_RULES;
    const playerFacKey = getFactionKey(state.player);
    (async () => {
      for (let gi = 0; gi < state.groups.player.length; gi++) {
        const grp = state.groups.player[gi];
        for (const card of grp.cards) {
          if (!card.berserk || !R_b.isAlive(card)) continue;
          // 距離5の敵グループを探す
          let tgtGrp = null, tgtIdx = -1;
          for (let ei = 0; ei < state.groups.ai.length; ei++) {
            const eg = state.groups.ai[ei];
            if (eg.cards.some(c => R_b.isAlive(c)) && R_b.relativeRange(grp.distance, eg.distance) === 5) {
              tgtGrp = eg; tgtIdx = ei; break;
            }
          }
          if (!tgtGrp) {
            // §20.92 距離5の敵がいない → 回復
            R_b.unpinSoldier(card); card.berserk = false; continue;
          }
          await window.CC_ACTION.executeBerserkCC(card, grp, gi, tgtGrp, 'ai', tgtIdx, ccDrawCard, playerFacKey);
          cleanupEliminatedGroups();
          renderField('player'); renderField('ai');
        }
      }
    })();
  }
}

