// アップフロント: 場の描画・修理の表・手札
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== 場の描画 =====
/** 枠の上の情報欄: シナリオの勝利条件・今の勝利点・損害と崩壊の限度（§16.4/§16.5） */
function updateInfoPanel() {
  const el = document.getElementById('ap-info');
  if (!el || !state || !state.groups || !state.player || !state.ai) return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const sc = state.scenario;
  const role = state.playerRole === 'attacker' ? '（自軍は攻撃側）' : state.playerRole === 'defender' ? '（自軍は防御側）' : '';
  let title = '勝利条件', cond = '';
  const v = sc && sc.victory;
  if (sc) title = `シナリオ${sc.id}「${sc.name}」${role}`;
  if (!v) cond = '敵の兵の過半数に損害を与えれば勝ち（§16.5）';
  else if (v.type === 'reachAndHold') cond = `相対射程${v.maxRelativeRange}以内で、侵入されておらず、ピン状態でない兵${v.minSoldiers}人以上が守りになる地形にいるグループを作れば勝ち`;
  else if (v.type === 'vpCount') cond = `デッキ${getScenarioDeckCycles()}巡の時間切れで、勝利点の多い側が勝ち${v.requireBuildingsForTerritorial ? '（距離の点は建物にいる兵だけ）' : ''}`;
  else if (v.type === 'pillboxClear') cond = v.description || '攻撃側はトーチカの兵を全滅か放棄させれば勝ち';
  else if (v.type === 'reducedDefender') cond = `攻撃側: ピン状態でない兵${v.attackerMinSoldiers}人以上が相対射程${v.attackerRange}${v.requireProtectiveTerrain ? 'で、守りになる地形' : ''}にいれば勝ち`;
  else cond = v.description || '';
  const loss = side => {
    const initial = (state.initialSoldierCount && state.initialSoldierCount[side]) || 0;
    let alive = 0;
    (state.groups[side] || []).forEach(g => g && g.cards.forEach(c => { if (R.isAlive(c)) alive++; }));
    const lost = Math.max(0, initial - alive);
    const limit = initial ? Math.floor(initial / 2) + 1 : 0;
    return { lost, limit };
  };
  const pL = loss('player'), aL = loss('ai');
  const lossCell = l => l.limit ? `<span class="${l.limit - l.lost <= 1 ? 'warn' : ''}">${l.lost} / ${l.limit}</span>` : '-';
  el.innerHTML =
    `<div class="ap-info-sec"><div class="ap-info-h">${title}</div><div>${cond}</div><div style="color:#aaa;">兵の過半数が損害を受けた側は負け（§16.5）</div></div>`
    + (() => { if (true) return ''; /* 敵の作戦はゲームの間は見せない（興ざめするため） */ const st = ((state.groups.ai || []).find(g => g && g._strategy) || {})._strategy; const nm = st && window.SCENARIO_HELPERS && window.SCENARIO_HELPERS.AI_STRATEGY_NAMES ? window.SCENARIO_HELPERS.AI_STRATEGY_NAMES[st] : null; return nm ? `<div class="ap-info-sec"><div class="ap-info-h">敵の作戦</div><div>${nm}</div></div>` : ''; })()
    + `<div class="ap-info-sec"><div class="ap-info-h">勝利点・損害</div><table>`
    + `<tr><td></td><td class="num">勝利点</td><td class="num">損害/負け</td></tr>`
    + `<tr><td>${state.player.flag || ''} 自軍</td><td class="num">${calcVictoryPoints('player')}</td><td class="num">${lossCell(pL)}</td></tr>`
    + `<tr><td>${state.ai.flag || ''} 敵</td><td class="num">${calcVictoryPoints('ai')}</td><td class="num">${lossCell(aL)}</td></tr>`
    + `</table><div style="color:#aaa;font-size:11px;">損害/負け: 失った兵 / この数で負け</div></div>`;
}

function renderField(side) {
  // §17.44/§17.62 終わった側面射撃・解けた包囲、§17.84 移送中のピン、§17.7 側方移送の成立を片付けてから描く
  if (typeof processDroppedWeapons === 'function') processDroppedWeapons(); // §18.1
  if (typeof updateTransfers === 'function') updateTransfers();
  if (typeof updateGroupShifts === 'function') updateGroupShifts();
  if (typeof updateFlankAndEncircle === 'function') updateFlankAndEncircle();
  if (typeof updatePillboxBehind === 'function') updatePillboxBehind(); // §23.7
  if (typeof updateAcquisitions === 'function') updateAcquisitions(); // §27.2 捕捉を失う
  if (typeof updatePrisoners === 'function') updatePrisoners(); // §32.2/§32.22 監視役の引き継ぎ・捕虜の解放
  try { updateInfoPanel(); } catch (e) { console.warn('updateInfoPanel', e); } // 枠の上の勝利条件・勝利点・損害
  try { if (state.phase === 'play' && !UF_REPORT.snaps.length) { ufSnapshot('開始時', ''); UF_REPORT.snaps[0].t = -1; } } catch (e) {}
  if (state.phase === 'gameover' && !state._ufReportShown) { state._ufReportShown = true; try { ufSnapshot('終了時', ''); } catch (e) {} setTimeout(ufShowGameOver, 400); } // ゲーム終了の画面
  const container = document.getElementById(side === 'player' ? 'player-field' : 'ai-field');
  container.innerHTML = '';
  // メイングループ A, B, C, D
  state.groups[side].forEach((group, idx) => {
    container.appendChild(makeMainGroup(side, group, idx));
  });
}

function makeMainGroup(side, group, idx) {
  const slot = document.createElement('div');
  slot.className = 'main-group';
  if (state._incoming) { // 撃たれる時の予告（撃つ敵・撃たれる自分のグループを光らせる）
    if (side === 'ai' && idx === state._incoming.si) slot.classList.add('incoming-src');
    if (side === 'player' && idx === state._incoming.ti) slot.classList.add('incoming-tgt');
  }
  // 夜間 + 相手陣営から認知されていない → 暗く表示（敵・味方とも）
  if (state.isNight) {
    const oppSide = side === 'player' ? 'ai' : 'player';
    const isRecognized = (state.groups[oppSide] || []).some(g =>
      g && g.recognizedTargets && g.recognizedTargets.indexOf(idx) >= 0
    );
    const isFlared = !!group.flaredUntilTurn && state.currentTurn != null && group.flaredUntilTurn >= (state.turnCount || 0);
    if (!isRecognized && !isFlared) {
      slot.style.opacity = '0.4';
    }
  }
  // 選択中のソース/ターゲットをハイライト
  if (state.fireSource && state.fireSource.side === side && state.fireSource.idx === idx) {
    slot.classList.add('target-source');
  }
  if (state.fireTarget && state.fireTarget.side === side && state.fireTarget.idx === idx) {
    slot.classList.add('target-enemy');
  }
  slot.addEventListener('click', e => {
    if (state.phase === 'terrainPlacement') {
      if (state.terrainTurn !== 'player') return;
      if (state.terrainSelected == null) return;
      onGroupClickTerrainPhase(side, idx);
      return;
    }
    onGroupClickActionPhase(side, idx);
  });

  // ヘッダー (グループ名 + 距離)
  const header = document.createElement('div');
  header.className = 'group-header';
  // 手動設定された側面/包囲フラグを使用
  const enemySide = side === 'player' ? 'ai' : 'player';
  const enemyGroups = state.groups[enemySide] || [];
  const R_enc = window.INFANTRY_RULES;
  const top = group.terrain && group.terrain.length > 0 ? group.terrain[group.terrain.length - 1] : null;
  const isFlanking = !group.eliminated && group.flankingTarget != null;
  const isSurrounded = !group.eliminated && !!group.encircled;
  const flankTag = isFlanking ? '<span style="color:#fa0;margin-left:8px;font-weight:bold;font-size:12px;">▶側面</span>' : '';
  const encTag = isSurrounded ? '<span style="color:#f33;margin-left:8px;font-weight:bold;font-size:12px;">⚠包囲</span>' : '';
  const ppTag = (!group.eliminated && group.pinpointed) ? '<span style="color:#ff6;margin-left:8px;font-weight:bold;font-size:12px;background:#660;padding:1px 6px;border-radius:3px;border:1px solid #ff6;">◎補足</span>' : '';
  // 敵の各グループとの距離に応じたグループ火力を、名前の下の行に並べて表示（斜め射撃用）
  let fpRow = '';
  if (!group.eliminated && R_enc && R_enc.calcGroupFirepower) {
    const fac = side === 'player' ? state.player : state.ai;
    const facKey = getFactionKey(fac);
    const moving = !!(top && top.terrain && top.terrain.type === 'MOVEMENT');
    const crewMap = group.crewPairs ? buildCrewMapFromPairs(group) : {};
    const parts = [];
    enemyGroups.forEach((eg, ei) => {
      if (!eg || eg.eliminated) return;
      const dist = R_enc.relativeRange(group.distance, eg.distance);
      const fp = R_enc.calcGroupFirepower(group, facKey, dist, { moving, crewMap });
      parts.push(`${eg.name}/${fp}`);
    });
    if (parts.length) fpRow = `<div style="flex-basis:100%;order:10;color:#8cf;font-size:12px;white-space:nowrap;">${parts.join(' ')}</div>`;
  }
  header.style.flexWrap = 'wrap';
  // §18.1 グループに残っている兵器チット／§17.8 移送中／§17.9 設立中／§17.7 側方移送の途中
  const _wp = (group.weaponPool || []);
  const wpTag = _wp.length ? `<span style="margin-left:8px;display:inline-flex;gap:2px;vertical-align:middle;" title="グループに残っている兵器（拾える §18.2）: ${_wp.map(w => w.weaponName || w.weaponCat).join(' / ')}">${
    _wp.map(w => { const src = w.isDemo ? encPath(getDemoImagePath(w.fac)) : weaponChitImage(w, false); // 捨てた爆薬（§33.6）
      return src ? `<img src="${src}" style="width:18px;height:18px;border:1px solid #fc6;border-radius:2px;background:#000;" onerror="this.outerHTML='<span style=&quot;color:#fc6;font-size:11px;&quot;>🔫</span>'">`
                 : '<span style="color:#fc6;font-size:11px;">🔫</span>'; }).join('')
  }</span>` : '';
  const _gpIdx = idx;
  const _outT = group.cards.filter(c => c.transfer).length;
  const _inT = (typeof incomingTransit === 'function') ? incomingTransit(side, _gpIdx).length : 0;
  const trTag = (_outT || _inT) ? `<span style="color:#9cf;margin-left:8px;font-size:12px;">移送${_outT ? ' 送出' + _outT : ''}${_inT ? ' 受入待' + _inT : ''}</span>` : '';
  const fmTag = group.forming ? '<span style="color:#9f9;margin-left:8px;font-size:12px;">設立中</span>' : '';
  const shTag = group.pendingShift ? `<span style="color:#f9c;margin-left:8px;font-size:12px;">→${GROUP_LETTERS[group.pendingShift.toIdx]}へ側方移送中</span>` : '';
  header.innerHTML = `<span class="gname">GROUP ${group.name}</span>${flankTag}${encTag}${ppTag}${wpTag}${trTag}${fmTag}${shTag}${fpRow}`;

  const dctrl = document.createElement('div');
  dctrl.className = 'distance-ctrl';
  const minus = document.createElement('button'); minus.textContent = '−';
  const plus  = document.createElement('button'); plus.textContent  = '+';
  const dist  = document.createElement('span'); dist.className = 'dist';
  dist.textContent = group.distance;
  if (group.distance >= 5) dist.classList.add('win');
  minus.addEventListener('click', e => { e.stopPropagation(); if(group.distance>0){group.distance--; renderField(side);} });
  plus.addEventListener('click',  e => { e.stopPropagation(); group.distance++; renderField(side); });
  dctrl.appendChild(minus); dctrl.appendChild(dist); dctrl.appendChild(plus);
  header.appendChild(dctrl);
  slot.appendChild(header);

  // 兵士カードスタック
  const cards = document.createElement('div');
  cards.className = 'cards-area';
  const crewPairs = group.crewPairs || {};
  const assistantNums = new Set(Object.values(crewPairs));
  const ownerNums = new Set(Object.keys(crewPairs).map(Number));
  const visibleCards = [];
  group.cards.forEach((card, origIdx) => { if (!card.killed && !card.routed) visibleCards.push({ card, origIdx }); });
  visibleCards.forEach(({ card, origIdx }, vi) => {
    const ci = origIdx;
    const c = document.createElement('div');
    c.className = 'card';
    c.style.top = (vi * 28) + 'px';
    const img = document.createElement('img');
    img.src = card.pinned ? card.imgBack : card.img;
    img.alt = card.id;
    img.onerror = () => { c.style.background = '#666'; img.style.display = 'none'; c.textContent = card.id; };
    c.appendChild(img);
    // クルー主マーカー
    if (card.num != null && ownerNums.has(card.num)) {
      const m = document.createElement('div');
      m.textContent = '主';
      m.style.cssText = 'position:absolute;top:2px;left:2px;background:#fa6;color:#000;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;border:1px solid #fff;z-index:5;';
      m.title = 'クルー主';
      c.appendChild(m);
    }
    if (card.num != null && assistantNums.has(card.num)) {
      const m = document.createElement('div');
      m.textContent = '副';
      m.style.cssText = 'position:absolute;top:2px;left:2px;background:#6af;color:#000;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;border:1px solid #fff;z-index:5;';
      m.title = 'アシスタントクルー (火力使用不可)';
      c.appendChild(m);
    }
    // 侵入マーカー (§20)
    if (card.infiltrating) {
      const m = document.createElement('div');
      m.textContent = '侵';
      m.style.cssText = 'position:absolute;top:2px;right:30px;background:#f44;color:#fff;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;border:1px solid #fff;z-index:5;';
      m.title = '侵入中';
      c.appendChild(m);
    }
    // 監視役マーカー (§32.2)
    if (card.prisoners && card.prisoners.length) {
      const m = document.createElement('div');
      m.textContent = '捕' + card.prisoners.length;
      m.style.cssText = 'position:absolute;top:2px;right:52px;background:#795548;color:#fff;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;border:1px solid #fff;z-index:5;';
      m.title = `監視役（捕虜 ${card.prisoners.length} 人）火力・CCV 半分`;
      c.appendChild(m);
    }
    // 負傷マーカー (§33)
    if (card.wounded && !card.killed && !card.routed) {
      const sus = window.INFANTRY_RULES && !window.INFANTRY_RULES.isWoundActive(card);
      const m = document.createElement('div');
      m.textContent = sus ? '負(止)' : '負';
      m.style.cssText = 'position:absolute;bottom:2px;left:2px;background:#e65100;color:#fff;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;border:1px solid #fff;z-index:5;';
      m.title = sus ? '負傷（ヒーローでこのターンは効果なし）' : '負傷: 火力½・移動射撃不可・CCV低下・潜入不可';
      c.appendChild(m);
    }
    // 狂暴兵マーカー (§20.9) — 大きく強調表示
    if (card.berserk) {
      // カード本体に紫の発光枠
      c.style.boxShadow = '0 0 0 3px #f0f, 0 0 12px 4px rgba(255,0,255,0.6)';
      const m = document.createElement('div');
      m.textContent = '狂暴';
      m.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#f0f;color:#fff;font-size:18px;font-weight:bold;padding:4px 10px;border-radius:5px;border:2px solid #fff;z-index:10;letter-spacing:2px;text-shadow:0 1px 2px #000;';
      m.title = '狂暴兵';
      c.appendChild(m);
    }
    // 故障マーカー (§19)
    if (card.malfunctioned) {
      const m = document.createElement('div');
      m.textContent = '故';
      m.style.cssText = 'position:absolute;top:2px;right:2px;background:#888;color:#fff;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;border:1px solid #fff;z-index:5;';
      m.title = '武器故障';
      c.appendChild(m);
    }
    // 破壊マーカー
    if (card.destroyed) {
      const m = document.createElement('div');
      m.textContent = '破';
      m.style.cssText = 'position:absolute;top:2px;right:2px;background:#c33;color:#fff;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;border:1px solid #fff;z-index:5;';
      m.title = '武器破壊';
      c.appendChild(m);
    }
    // §18/§19.4/§17.8 拾った・捕獲した兵器／非武装／移送中のチット
    appendSoldierChits(c, card, 1);
    // 爆薬保持マーカー (シナリオB)
    if (card.demoCharge) {
      const demo = document.createElement('img');
      const facKey = side === 'player' ? getFactionKey(state.player) : getFactionKey(state.ai);
      demo.src = encPath(getDemoImagePath(facKey));
      demo.style.cssText = 'position:absolute;top:50%;left:2px;transform:translateY(-50%);width:22px;height:22px;border:1px solid #f66;border-radius:2px;background:#000;z-index:6;';
      demo.title = '爆薬保持';
      demo.onerror = () => { demo.style.display = 'none'; };
      c.appendChild(demo);
    }
    c.addEventListener('click', () => {
      if (state.selectedAction === 'snipe' && side === 'ai') {
        // §14.2 選ぶのはグループ。撃たれる兵士は RPC で決まる
        state.sniperTarget = { side, grpIdx: idx };
        state.fireTarget = { side, idx };
        renderField('player'); renderField('ai');
        updateConfirmBtn();
        return;
      }
      showGroupOverlay(side, group);
    });
    if (side === 'player') {
      c.addEventListener('contextmenu', e => {
        e.preventDefault();
        showCardContextMenu(e.clientX, e.clientY, group, ci);
      });
    }
    cards.appendChild(c);
  });
  slot.appendChild(cards);

  // ワークロウ: Terrain + 小カウンター3 + Action
  const work = document.createElement('div');
  work.className = 'work-row';

  const terrain = buildTerrainStack(group);

  const fpSum = group.actions.reduce((s, c) => s + (c.fp || 0), 0);
  const action = buildCardBox('action-box', group.actions, 'Action in Play', () => {
    if (group.actions.length > 0) showCardGridOverlay(`GROUP ${group.name} — アクション/射撃 (FP合計 ${fpSum})`, group.actions);
  });
  if (fpSum > 0) {
    const fpBadge = document.createElement('div');
    fpBadge.textContent = `FP ${fpSum}`;
    fpBadge.style.cssText = 'position:absolute;bottom:2px;left:3px;background:#fa0;color:#000;font-size:11px;padding:1px 5px;border-radius:3px;font-weight:bold;';
    action.appendChild(fpBadge);
  }

  work.appendChild(terrain);
  work.appendChild(action);
  // §32 捕虜: 監視役のいるグループに、捕虜のカードを小さく置く（解放された捕虜は出さない）
  {
    const Rp = window.INFANTRY_RULES;
    const myFac = getFactionKey(side === 'player' ? state.player : state.ai);
    const enFac = getFactionKey(side === 'player' ? state.ai : state.player);
    const items = [];
    group.cards.forEach(guard => (guard.prisoners || []).forEach(p => { if (p && !p.released) items.push({ p, guard }); }));
    if (items.length) {
      const box = document.createElement('div');
      box.className = 'prison-in-group';
      box.innerHTML = `<div class="pg-title">捕虜 ${items.length}</div>`;
      const row = document.createElement('div'); row.className = 'pg-cards';
      items.forEach(({ p, guard }) => {
        const pd = Rp && Rp.lookupSoldier ? Rp.lookupSoldier(p, enFac) : null;
        const gd = Rp && Rp.lookupSoldier ? Rp.lookupSoldier(guard, myFac) : null;
        const im = document.createElement('img');
        im.src = p.img; im.alt = pd ? pd.name : p.id;
        im.title = `捕虜: ${pd ? pd.name : p.id}（監視役: ${gd ? gd.name : guard.id}）`;
        row.appendChild(im);
      });
      box.appendChild(row);
      work.appendChild(box);
    }
  }
  slot.appendChild(work);

  // 照明弾効果: 各カードに光る縁（照明弾1のチット=赤、裏返した照明弾2=オレンジ）
  if (state.isNight) {
    const flareRemaining = (group.flaredUntilTurn || 0) - (state.turnCount || 0);
    if (group.flaredUntilTurn && flareRemaining >= 0) {
      const tint = flareRemaining >= 2 ? '#f44' : '#fa6';
      slot.querySelectorAll('.card').forEach(c => {
        c.style.boxShadow = `0 0 8px 4px ${tint}`;
      });
    }
  }

  return slot;
}

function buildTerrainStack(group) {
  const box = document.createElement('div');
  box.className = 'terrain-box';
  box.style.position = 'relative';
  box.style.overflow = 'hidden';
  if (!group.terrain || group.terrain.length === 0) {
    box.style.height = '100px';
    box.innerHTML = '<span style="font-size:9px;color:#888;">Terrain</span>';
    return box;
  }
  const offset = 24;
  box.style.height = (100 + (group.terrain.length - 1) * offset) + 'px';
  group.terrain.forEach((card, i) => {
    // 裏向き(平地扱い): カード裏面画像を表示
    if (card._faceDown) {
      const img = document.createElement('img');
      img.src = encPath('upfrontimages/地形カード/AD Back.gif');
      img.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);width:80px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.5);top:' + (i * offset) + 'px;z-index:' + i + ';';
      img.onerror = () => { img.style.display = 'none'; };
      img.title = '裏向き地形カード（平地扱い）';
      box.appendChild(img);
      return;
    }
    // 塹壕カード
    if (card._isTrench) {
      const ph = document.createElement('div');
      ph.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);width:80px;height:50px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.5);top:' + (i * offset) + 'px;z-index:' + i + ';background:#6b4a2b;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:14px;border:1px solid #4a3018;';
      ph.textContent = '塹壕 -1';
      ph.title = '塹壕（防御 -1）';
      box.appendChild(ph);
      return;
    }
    const img = document.createElement('img');
    img.src = card.img;
    // 涸れ谷/湿地/河川からの最初の移動カードは横向き表示（§8.22/§8.4/§8.53）
    const prevCard = i > 0 ? group.terrain[i - 1] : null;
    const isFirstMoveFromSpecial = card.terrain && card.terrain.type === 'MOVEMENT' &&
      prevCard && prevCard.terrain && (prevCard.terrain.type === 'GULLY' || prevCard.terrain.type === 'MARSH' || prevCard.terrain.type === 'STREAM');
    const lateral = card._moveMode === 'lateral' || isFirstMoveFromSpecial;
    const transform = lateral ? 'translateX(-50%) rotate(90deg)' : 'translateX(-50%)';
    img.style.cssText = 'position:absolute;left:50%;transform:' + transform + ';width:80px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.5);top:' + (i * offset) + 'px;z-index:' + i + ';';
    img.onerror = () => { img.style.display = 'none'; };
    box.appendChild(img);
  });
  box.style.cursor = 'pointer';
  box.addEventListener('click', e => {
    e.stopPropagation();
    showCardGridOverlay(`GROUP ${group.name} — 地形`, group.terrain);
  });
  return box;
}

function buildCardBox(cls, cardList, placeholder, onClick) {
  const box = document.createElement('div');
  box.className = cls;
  if (cardList && cardList.length > 0) {
    // スタックの先頭カードを表示 + 枚数バッジ
    const top = cardList[cardList.length - 1];
    const img = document.createElement('img');
    img.src = top.img;
    img.onerror = () => { img.style.display = 'none'; box.textContent = top.id; };
    box.appendChild(img);
    if (cardList.length > 1) {
      const badge = document.createElement('div');
      badge.textContent = cardList.length;
      badge.style.cssText = 'position:absolute;top:2px;right:3px;background:#c33;color:#fff;font-size:10px;padding:1px 5px;border-radius:8px;font-weight:bold;';
      box.style.position = 'relative';
      box.appendChild(badge);
    }
    box.style.cursor = 'pointer';
    box.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  } else {
    box.textContent = placeholder;
  }
  return box;
}

// ===== 修理テーブル =====
const REPAIR_TABLE = {
  // 兵器チットの裏（images/各国マーカー/Wpn Back ...）の REPAIR（修理できる目）・BROKEN（壊れる目、赤）・MOR/PAN -1 のとおり
  // チットの略号: BAR=ボルトアクション小銃 SAR=半自動小銃 CAR=カービン AR=突撃銃 MP=短機関銃 LMG=軽機関銃 MMG=中機関銃
  //   MOR=迫撃砲 GL=擲弾筒 ATR=対戦車ライフル BAZ=バズーカ PSK=パンツァーシュレック FTR=火炎放射器 RAD=無線機
  //   米の LMG チットは Browning BAR（BAR自動小銃）。名前は兵士のデータの武器の種類と前方一致で引く
  us: {
    'ボルトアクション小銃': { repair: '黒0-6,赤0', destroy: '赤6',   moralePenalty: -1 }, // BAR SAR MMG
    '半自動小銃':        { repair: '黒0-6,赤0', destroy: '赤6',   moralePenalty: -1 }, // BAR SAR MMG（M1ガーランド）
    '中機関銃':          { repair: '黒0-6,赤0', destroy: '赤6',   moralePenalty: -1 }, // BAR SAR MMG
    'BAR自動小銃':       { repair: '黒0-6',     destroy: '赤5-6', moralePenalty: -1 }, // LMG（Browning BAR）
    '軽機関銃':          { repair: '黒0-6',     destroy: '赤5-6', moralePenalty: -1 }, // LMG
    'カービン':          { repair: '黒0-6',     destroy: '赤6',   moralePenalty: -1 }, // CAR
    '短機関銃':          { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // MP MOR
    '迫撃砲':            { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // MP MOR
    '60mm迫撃砲':        { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // MP MOR
    'バズーカ':          { repair: '黒5-6',     destroy: '赤0-6', moralePenalty: -1 }, // BAZ
    '火炎放射器':        { repair: '黒6',       destroy: '赤0-6', moralePenalty: -1 }, // FTR
    '無線機':            { repair: '黒4-6',     destroy: '赤4-6', moralePenalty: -1 }, // RAD
  },
  rus: {
    'ボルトアクション小銃': { repair: '黒0-6',     destroy: '赤6',   moralePenalty: -1 }, // BAR
    '半自動小銃':        { repair: '黒1-6',     destroy: '赤5-6', moralePenalty: -1 }, // SAR MMG
    '中機関銃':          { repair: '黒1-6',     destroy: '赤5-6', moralePenalty: -1 }, // SAR MMG
    '軽機関銃':          { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // LMG ATR
    '対戦車ライフル':    { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // LMG ATR
    '短機関銃':          { repair: '黒0-6',     destroy: '赤5-6', moralePenalty: -1 }, // MP
    '迫撃砲':            { repair: '黒2-6',     destroy: '赤3-6', moralePenalty: -1 }, // MOR
    '50mm迫撃砲':        { repair: '黒2-6',     destroy: '赤3-6', moralePenalty: -1 }, // MOR
    '火炎放射器':        { repair: '黒6',       destroy: '赤0-6', moralePenalty: -1 }, // FTR
    '無線機':            { repair: '黒4-6',     destroy: '赤3-6', moralePenalty: -1 }, // RAD
  },
  ger: {
    'ボルトアクション小銃': { repair: '黒0-6,赤0', destroy: '赤6',   moralePenalty: -1 }, // BAR
    '突撃銃':            { repair: '黒0-6',     destroy: '赤5-6', moralePenalty: -1 }, // AR MMG
    '自動小銃':          { repair: '黒0-6',     destroy: '赤5-6', moralePenalty: -1 }, // AR MMG
    '中機関銃':          { repair: '黒0-6',     destroy: '赤5-6', moralePenalty: -1 }, // AR MMG
    '短機関銃':          { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // MP LMG ATR
    '軽機関銃':          { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // MP LMG ATR
    '対戦車ライフル':    { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // MP LMG ATR
    '迫撃砲':            { repair: '黒2-6',     destroy: '赤3-6', moralePenalty: -1 }, // MOR
    '50mm迫撃砲':        { repair: '黒2-6',     destroy: '赤3-6', moralePenalty: -1 }, // MOR
    'パンツァーシュレック': { repair: '黒5-6',     destroy: '赤1-6', moralePenalty: -1 }, // PSK
    '火炎放射器':        { repair: '黒6',       destroy: '赤0-6', moralePenalty: -1 }, // FTR
    '無線機':            { repair: '黒4-6',     destroy: '赤4-6', moralePenalty: -1 }, // RAD
  },
  jpn: {
    'ボルトアクション小銃': { repair: '黒0-6',     destroy: '赤6',   moralePenalty: -1 }, // BAR
    '軽機関銃':          { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // LMG ATR GL
    '対戦車ライフル':    { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // LMG ATR GL
    '擲弾筒':            { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // LMG ATR GL
    '中機関銃':          { repair: '黒1-6',     destroy: '赤5-6', moralePenalty: -1 }, // MMG
    '短機関銃':          { repair: '黒2-6',     destroy: '赤4-6', moralePenalty: -1 }, // MP
    '火炎放射器':        { repair: '黒6',       destroy: '赤0-6', moralePenalty: -1 }, // FTR
    '無線機':            { repair: '黒4-6',     destroy: '赤3-6', moralePenalty: -1 }, // RAD
  },
  uk: {
    'ボルトアクション小銃': { repair: '黒0-6,赤0', destroy: '赤6',   moralePenalty: -1 }, // BAR
    '軽機関銃':          { repair: '黒0-6',     destroy: '赤5-6', moralePenalty: -1 }, // LMG MMG
    '中機関銃':          { repair: '黒0-6',     destroy: '赤5-6', moralePenalty: -1 }, // LMG MMG
    '短機関銃':          { repair: '黒0-6',     destroy: '赤4-6', moralePenalty: -1 }, // MP
    '迫撃砲':            { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // MOR
    '50mm迫撃砲':        { repair: '黒1-6',     destroy: '赤4-6', moralePenalty: -1 }, // MOR
    '対戦車ライフル':    { repair: '黒1-6',     destroy: '赤5-6', moralePenalty: -1 }, // ATR
    'PIAT':              { repair: '黒3-6',     destroy: '赤1-6', moralePenalty: -1 }, // PIAT
    '火炎放射器':        { repair: '黒6',       destroy: '赤0-6', moralePenalty: -1 }, // FTR
    '無線機':            { repair: '黒4-6',     destroy: '赤4-6', moralePenalty: -1 }, // RAD
  },
};


function parseRepairRange(str) {
  if (!str) return [];
  return str.split(',').map(s => {
    const m = s.trim().match(/(黒|赤)(\d)(?:[−\-](\d))?/);
    if (!m) return null;
    return { color: m[1], from: parseInt(m[2],10), to: m[3] != null ? parseInt(m[3],10) : parseInt(m[2],10) };
  }).filter(x => x);
}

function matchesRange(ranges, rncColor, rncVal) {
  if (!ranges || ranges.length === 0) return false;
  return ranges.some(r => r.color === rncColor && rncVal >= r.from && rncVal <= r.to);
}

function getRepairEntry(factionKey, weaponCat) {
  const table = REPAIR_TABLE[factionKey];
  if (!table) return null;
  // 前方一致で検索
  for (const key of Object.keys(table)) {
    if (weaponCat.indexOf(key) === 0) return table[key];
  }
  return null;
}

// ===== 手札 =====
state.selectedAction = null;
state.selectedHand = new Set();

/** 自分の手札: マウスを乗せている間だけ、そのカードの真上に大きく表示する（クリック・ダブルクリックは今まで通り） */
function _handPreviewEl() {
  let el = document.getElementById('hand-hover-preview');
  if (!el) {
    el = document.createElement('img');
    el.id = 'hand-hover-preview';
    el.alt = '';
    el.style.cssText = 'position:fixed;display:none;height:300px;width:auto;z-index:2500;pointer-events:none;'
      + 'border:2px solid #ffeb3b;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,0.8);background:#222;';
    document.body.appendChild(el);
  }
  return el;
}
function hideHandPreview() { const el = document.getElementById('hand-hover-preview'); if (el) el.style.display = 'none'; }
function showHandPreview(cardEl, src) {
  const el = _handPreviewEl();
  el.src = src;
  el.style.display = 'block';
  const H = 300, W = 200; // 表示の高さ（幅はカードの縦横比でおよそ 200）
  // offsetLeft/offsetTop はズームの中の座標なので、fixed の位置にそのまま使える（手札の欄の横スクロール分を引く）
  const bar = cardEl.closest('.hand-bar');
  let left = cardEl.offsetLeft - (bar ? bar.scrollLeft : 0) + cardEl.offsetWidth / 2 - W / 2;
  const maxLeft = (document.body.clientWidth || window.innerWidth) - W - 8;
  left = Math.max(4, Math.min(left, maxLeft));
  const top = Math.max(4, cardEl.offsetTop - H - 12);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function renderHands() {
  const ph = document.getElementById('player-hand');
  const ah = document.getElementById('ai-hand');
  hideHandPreview();
  ph.innerHTML = ''; ah.innerHTML = '';
  state.playerHand.forEach((card, idx) => {
    const c = document.createElement('div'); c.className = 'hand-card';
    if (state.selectedHand.has(idx)) c.classList.add('selected');
    if (state.phase === 'terrainPlacement' && state.terrainTurn === 'player') {
      if (isTerrainHandCard(card)) {
        c.classList.add('terrain-pickable');
        if (state.terrainSelected === idx) c.classList.add('selected');
      } else {
        c.classList.add('terrain-disabled');
      }
    }
    const img = document.createElement('img');
    img.src = card.img; img.alt = card.id;
    img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'contain'; img.style.borderRadius = '4px';
    img.onerror = () => { c.textContent = card.id; img.remove(); };
    c.appendChild(img);
    c.addEventListener('click', () => {
      if (state.phase === 'terrainPlacement') {
        if (state.terrainTurn === 'player') onPlayerHandClickTerrainPhase(idx);
        return;
      }
      if (state.selectedHand.has(idx)) state.selectedHand.delete(idx);
      else state.selectedHand.add(idx);
      renderHands();
      updateConfirmBtn();
      updateDecideBtn();
    });
    c.addEventListener('dblclick', () => { hideHandPreview(); showOverlay(card.img); });
    c.addEventListener('mouseenter', () => showHandPreview(c, card.img));
    c.addEventListener('mouseleave', hideHandPreview);
    ph.appendChild(c);
  });
  const backSrc = encPath('upfrontimages/地形カード/AD Back.gif');
  // 配置フェーズ中はAI手札を「配置可能な地形カード」と「その他」で色分け
  const aiInPlace = (state.phase === 'terrainPlacement');
  const aiCards = state.aiHand || [];
  for (let i = 0; i < state.aiHandCount; i++) {
    const c = document.createElement('div'); c.className = 'hand-card';
    if (aiInPlace && aiCards[i] && isTerrainHandCard(aiCards[i])) {
      c.classList.add('terrain-pickable');
    }
    const img = document.createElement('img');
    img.src = backSrc;
    img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'contain'; img.style.borderRadius = '4px';
    img.onerror = () => { c.textContent = '裏'; img.remove(); };
    c.appendChild(img);
    ah.appendChild(c);
  }
  // 残数バッジ
  const aiName = document.getElementById('ai-name');
  if (aiName && state.ai) {
    aiName.textContent = `${state.ai.flag} ${state.ai.name}  [手札 ${state.aiHandCount}]`;
  }
}

