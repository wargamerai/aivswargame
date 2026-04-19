/**
 * cc.js — 侵入 (Infiltration) & 白兵戦 (Close Combat) モジュール
 * ルールブック §20 に基づく実装
 *
 * エクスポート: window.CC_ACTION
 */
(function (global) {
  'use strict';

  // ===========================================================
  // 1. 定数
  // ===========================================================

  /** RPCコラムキー: index 0→コラム1, index 9→コラム10 */
  const RPC_KEYS = ['1','2b','3','4c','5o','6','7w','8','9','0r'];

  /** 兵器カテゴリ → CC兵器値 (§20.6) */
  const WEAPON_CCV = {
    'カービン銃':4, '突撃銃':4,
    '小銃':5, 'ライフル':5,
    '短機関銃':3,
    'BAR自動小銃':2, 'BAR':2,
    '軽機関銃':1, 'LMG':1,
    '火炎放射器':-1,
    '機関銃':0, 'MMG':0, '中機関銃':0,
    '対戦車ライフル':0, 'ATR':0,
    '迫撃砲':0, '歩兵砲':0,
    'バズーカ':0, 'パンツァーファウスト':0,
  };

  // ===========================================================
  // 2. ユーティリティ
  // ===========================================================

  const R = () => global.INFANTRY_RULES;

  /** DOM要素を簡潔に生成 */
  function el(tag, style, ...children) {
    const e = document.createElement(tag);
    if (style && typeof style === 'object') Object.assign(e.style, style);
    else if (typeof style === 'string') e.textContent = style;
    children.forEach(c => {
      if (!c) return;
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  /** CCV文字列 "7/4" → { armed:7, unarmed:4 } */
  function parseCCV(str) {
    if (!str) return { armed: 0, unarmed: 0 };
    const p = String(str).split('/');
    return {
      armed:   parseInt(p[0], 10) || 0,
      unarmed: parseInt(p[1] != null ? p[1] : p[0], 10) || 0,
    };
  }

  /** 兵器カテゴリ → CC兵器値 */
  function getWeaponValue(weaponCat) {
    if (!weaponCat) return 0;
    for (const [key, val] of Object.entries(WEAPON_CCV)) {
      if (weaponCat.includes(key)) return val;
    }
    return 5; // デフォルト: ライフル
  }

  /** グループ内の生存兵士 */
  function aliveCards(group) {
    return (group.cards || []).filter(c => R().isAlive(c));
  }

  /** グループ内のピン状態でない生存兵士 */
  function unpinnedAlive(group) {
    return aliveCards(group).filter(c => !R().isPinned(c));
  }

  /** グループ内のピン状態兵士数 */
  function pinnedCount(group) {
    return aliveCards(group).filter(c => R().isPinned(c)).length;
  }

  /** グループが移動中か（MOVEMENTカードあり） */
  function isMoving(group) {
    return (group.terrain || []).some(c => c.terrain && c.terrain.type === 'MOVEMENT');
  }

  /** グループの煙幕カード枚数 */
  function smokeCount(group) {
    return (group.terrain || []).filter(c => c.terrain && c.terrain.type === 'SMOKE').length;
  }

  /** 攻撃側の地形タイプ → 侵入コラムシフト (§20.33-20.37) */
  function attackerTerrainShift(group) {
    if (R().isInBrush(group))    return -2;  // 繁み
    if (R().isInWoods(group))    return -1;  // 森林
    if (R().isInTerrainType(group, 'HILL')) return +1;  // 丘
    // 保護地形なし = 平地
    const hasProtective = (group.terrain || []).some(c => {
      const t = c.terrain && c.terrain.type;
      return t && t !== 'MOVEMENT' && t !== 'FIRE' && !t.startsWith('FIRE') && t !== 'CONCEALED';
    });
    if (!hasProtective) return +2; // 平地
    return 0; // 建物・その他
  }

  /** 防御側の地形タイプ → 侵入コラムシフト (§20.36) */
  function defenderTerrainShift(group) {
    if (R().hasTerrainType(group, 'PILLBOX')) return +1; // トーチカ
    return 0;
  }

  /** グループに侵入兵がいるか（被侵入側） */
  function hasInfiltrators(group) {
    // 全グループの兵士から、このグループを侵入先としている兵士を探す
    const st = global.state;
    if (!st) return false;
    const sides = ['player', 'ai'];
    for (const side of sides) {
      for (const grp of (st.groups[side] || [])) {
        for (const c of grp.cards) {
          if (c.infiltrating && c.infiltratedGroupSide && c.infiltratedGroupIdx != null) {
            // このカードがgroupを侵入先にしているかチェック
            // (直接比較は難しいので呼び出し側で判定)
            return true;
          }
        }
      }
    }
    return false;
  }

  /** 指定グループの侵入兵リスト(自軍側から侵入している兵士) */
  function getInfiltratorsFor(targetSide, targetIdx) {
    const st = global.state;
    const result = [];
    const atkSide = targetSide === 'ai' ? 'player' : 'ai';
    for (let gi = 0; gi < (st.groups[atkSide] || []).length; gi++) {
      const grp = st.groups[atkSide][gi];
      for (let ci = 0; ci < grp.cards.length; ci++) {
        const c = grp.cards[ci];
        if (c.infiltrating && c.infiltratedGroupSide === targetSide && c.infiltratedGroupIdx === targetIdx) {
          result.push({ card: c, groupIdx: gi, cardIdx: ci, group: grp });
        }
      }
    }
    return result;
  }

  /** ソースグループから侵入中の兵士リスト */
  function getInfiltratingFromGroup(group) {
    return (group.cards || []).filter(c => c.infiltrating && R().isAlive(c));
  }

  // ===========================================================
  // 3. 侵入ロジック (§20.1-20.5)
  // ===========================================================

  /**
   * 侵入可否チェック
   * @returns {{ ok:boolean, error:string }}
   */
  function canAttemptInfiltration(srcGroup, tgtGroup, srcSide) {
    const dist = R().relativeRange(srcGroup.distance, tgtGroup.distance);
    if (dist !== 5) return { ok: false, error: `相対距離が${dist}です（5が必要）` };
    // §20.2 真正面または隣接グループのみ
    const st = global.state;
    if (st && st.groups) {
      const srcArr = st.groups[srcSide];
      const tgtSide = srcSide === 'player' ? 'ai' : 'player';
      const tgtArr = st.groups[tgtSide];
      const srcIdx = srcArr ? srcArr.indexOf(srcGroup) : -1;
      const tgtIdx = tgtArr ? tgtArr.indexOf(tgtGroup) : -1;
      if (srcIdx >= 0 && tgtIdx >= 0 && Math.abs(srcIdx - tgtIdx) > 1) {
        return { ok: false, error: '真正面または隣接グループにのみ侵入可能 (§20.2)' };
      }
    }
    // §8.5 河川内からは侵入不可
    if (R().isInStream && R().isInStream(srcGroup))
      return { ok: false, error: '河川内からは侵入できません' };
    // §20.24 地雷原・鉄条網にいるグループからは侵入不可
    if (R().hasTerrainType(srcGroup, 'MINEFIELD') || R().hasTerrainType(srcGroup, 'WIRE'))
      return { ok: false, error: '地雷原または鉄条網内からは侵入できません' };
    // §20.25 地雷原にいる敵には侵入不可
    if (R().hasTerrainType(tgtGroup, 'MINEFIELD'))
      return { ok: false, error: '地雷原にいるグループには侵入できません' };
    // ピン状態でない生存兵士が必要
    const eligible = unpinnedAlive(srcGroup);
    if (eligible.length === 0) return { ok: false, error: 'ピン状態でない兵士がいません' };
    return { ok: true };
  }

  /**
   * §20.3 侵入コラム計算
   * @returns {number} 1〜10
   */
  function calcInfiltrationColumn(tgtGroup, srcGroup, opts) {
    opts = opts || {};
    // 基本コラム = 防御側の生存ユニット数
    let col = aliveCards(tgtGroup).length;
    // 攻撃側地形シフト (§20.33-20.37)
    col += attackerTerrainShift(srcGroup);
    // 防御側地形シフト (§20.36 トーチカ)
    col += defenderTerrainShift(tgtGroup);
    // §20.38 ピン状態の防御兵 → 左1ずつ
    col -= pinnedCount(tgtGroup);
    // §20.39 攻撃側移動中 → 右2
    if (isMoving(srcGroup)) col += 2;
    // §20.39 防御側移動中 → 右2
    if (isMoving(tgtGroup)) col += 2;
    // §20.39 攻撃側が既に侵入されている → 右2
    if (opts.srcAlreadyInfiltrated) col += 2;
    // §45 日本軍は侵入判定で +1 コラム
    if (opts.srcFacKey === 'jpn') col += 1;
    // §20.32 煙幕 → 左2×枚数（両方の煙幕）
    col -= smokeCount(srcGroup) * 2;
    col -= smokeCount(tgtGroup) * 2;
    // §20.31 夜間 → 左3
    if (opts.night) col -= 3;
    // 隠ぺいカード → 左N
    if (opts.concealValue) col -= opts.concealValue;
    // クランプ 1〜10
    return Math.max(1, Math.min(10, col));
  }

  /**
   * §20.21 モラルチェック
   * @returns {{ pass:boolean, rnc:number, rncColor:string }}
   */
  function checkInfiltrationMorale(soldierDef, rncCard) {
    const rnc = parseInt(rncCard.terrain.range, 10) || 0;
    const morale = parseInt(soldierDef.morale, 10) || 0;
    // RNC < モラル値 → 成功 (色は関係なし)
    return { pass: rnc < morale, rnc, rncColor: rncCard.terrain.rncColor || '黒', morale };
  }

  /**
   * §20.3 侵入RPC判定
   * @returns {{ success:boolean, posValue:string, color:string }}
   */
  function resolveInfiltrationRPC(rpcCard, column) {
    const keyIdx = Math.max(0, Math.min(9, column - 1));
    const key = RPC_KEYS[keyIdx];
    const posValue = (rpcCard.terrain.dice && rpcCard.terrain.dice[key]) || '0';
    const color = (rpcCard.terrain.diceColor && rpcCard.terrain.diceColor[key]) || '';
    return {
      success: color === '赤',
      posValue,
      color: color === '赤' ? '赤' : '黒',
    };
  }

  // ===========================================================
  // 4. 白兵戦ロジック (§20.6-20.8)
  // ===========================================================

  /**
   * §20.6 CCV取得
   * @param {object} card - ユニットカード
   * @param {object} soldierDef - 兵士定義
   * @param {object} opts - { isAssistant, hasCapturedWeapon, weaponMalfunction }
   * @returns {number} CCV
   */
  function getCCV(card, soldierDef, opts) {
    opts = opts || {};
    const pinned = R().isPinned(card);
    // 基本CCVはカードの印刷値を使用
    const ccvStr = pinned ? soldierDef.ccvBack : soldierDef.ccvFront;
    let ccv = parseCCV(ccvStr).armed;
    // §20.6 兵器故障中: -1
    if (card.malfunctioned || opts.weaponMalfunction) ccv -= 1;
    return ccv;
  }

  /**
   * §20.7 CC解決
   * @returns {{ result:'ATK_KIA'|'DEF_KIA'|'BOTH_KIA', atkTotal:number, defTotal:number, diff:number }}
   */
  function resolveCCCombat(atkCCV, defCCV, atkRncCard, defRncCard) {
    const atkRnc = parseInt(atkRncCard.terrain.range, 10) || 0;
    const atkSign = atkRncCard.terrain.rncColor === '赤' ? -1 : 1;
    const defRnc = parseInt(defRncCard.terrain.range, 10) || 0;
    const defSign = defRncCard.terrain.rncColor === '赤' ? -1 : 1;

    const atkTotal = atkCCV + (atkRnc * atkSign);
    const defTotal = defCCV + (defRnc * defSign);

    let result;
    if (atkTotal === defTotal) result = 'BOTH_KIA';
    else if (atkTotal < defTotal)  result = 'ATK_KIA';
    else result = 'DEF_KIA';

    return { result, atkTotal, defTotal, diff: atkTotal - defTotal,
             atkRnc: atkRnc * atkSign, defRnc: defRnc * defSign,
             atkRncColor: atkRncCard.terrain.rncColor || '黒',
             defRncColor: defRncCard.terrain.rncColor || '黒' };
  }

  /**
   * RPCで防御側ポジション決定 (§20.52)
   * @returns {{ position:number, card:object, cardIdx:number }}
   */
  function determineCCTarget(rpcCard, defGroup) {
    const alive = [];
    defGroup.cards.forEach((c, i) => { if (R().isAlive(c)) alive.push({ card: c, idx: i }); });
    if (alive.length === 0) return null;
    const col = Math.max(1, Math.min(10, alive.length));
    const keyIdx = Math.max(0, Math.min(9, col - 1));
    const key = RPC_KEYS[keyIdx];
    const posStr = (rpcCard.terrain.dice && rpcCard.terrain.dice[key]) || '1';
    let pos = parseInt(posStr, 10) || 1;
    pos = Math.max(1, Math.min(alive.length, pos));
    const target = alive[pos - 1];
    return { position: pos, card: target.card, cardIdx: target.idx };
  }

  // ===========================================================
  // 5. UI共通
  // ===========================================================

  const OVERLAY_STYLE = {
    position:'fixed', inset:'0', background:'rgba(0,0,0,0.8)',
    zIndex:'2700', display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center',
  };
  const BOX_STYLE = {
    background:'#333', border:'2px solid #aaa', borderRadius:'8px',
    padding:'20px', maxWidth:'700px', width:'92%', maxHeight:'85vh', overflowY:'auto',
  };
  const TITLE_STYLE = {
    fontSize:'18px', fontWeight:'bold', color:'#ffeb3b', marginBottom:'12px',
  };
  const BTN_STYLE = {
    padding:'8px 24px', fontSize:'14px', fontWeight:'bold',
    border:'none', borderRadius:'6px', cursor:'pointer',
  };
  const BTN_PRIMARY = { ...BTN_STYLE, background:'#4caf50', color:'#fff' };
  const BTN_CANCEL  = { ...BTN_STYLE, background:'#666', color:'#eee' };
  const BTN_DANGER  = { ...BTN_STYLE, background:'#f44336', color:'#fff' };

  function showOverlay(content) {
    const overlay = el('div', OVERLAY_STYLE, el('div', BOX_STYLE, content));
    document.body.appendChild(overlay);
    return overlay;
  }
  function removeOverlay(overlay) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // ===========================================================
  // 6. 侵入UI
  // ===========================================================

  /**
   * 侵入セットアップモーダル
   * @returns {Promise<{ soldiers:Array, cancelled:boolean }>}
   */
  function showInfiltrationSetupModal(srcGroup, tgtGroup, playerHand, srcFacKey) {
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();

      // タイトル
      const title = el('div', TITLE_STYLE, `侵入 — ${srcGroup.name} → 敵${tgtGroup.name}`);
      frag.appendChild(title);

      // コラム情報
      const baseCol = aliveCards(tgtGroup).length;
      const col = calcInfiltrationColumn(tgtGroup, srcGroup, { srcFacKey });
      const info = el('div', { color:'#ccc', fontSize:'13px', marginBottom:'12px' },
        `防御兵数: ${baseCol} | 最終コラム: ${col}`);
      frag.appendChild(info);

      // 移動カード数
      const moveCards = playerHand.filter(c => c.terrain && c.terrain.type === 'MOVEMENT');
      const moveInfo = el('div', { color:'#aaa', fontSize:'12px', marginBottom:'10px' },
        `手札の移動カード: ${moveCards.length}枚`);
      frag.appendChild(moveInfo);

      // 兵士リスト
      const alive = aliveCards(srcGroup);
      const selections = []; // { card, cardIdx, soldierDef, selected, useMove }
      const listDiv = el('div', { marginBottom:'16px' });

      alive.forEach(card => {
        const cardIdx = srcGroup.cards.indexOf(card);
        const def = R().lookupSoldier(card, srcFacKey);
        if (!def) return;
        const isPinned = R().isPinned(card);
        const morale = parseInt(def.morale, 10) || 0;

        const row = el('div', {
          display:'flex', alignItems:'center', gap:'8px',
          padding:'4px 0', borderBottom:'1px solid #555',
        });

        const entry = { card, cardIdx, soldierDef: def, selected: false, useMove: false, row };
        selections.push(entry);

        if (isPinned) {
          row.style.opacity = '0.4';
          row.appendChild(el('span', { color:'#f88', fontSize:'13px' },
            `✕ #${card.num} ${def.name} (ピン状態)`));
        } else {
          // チェックボックス
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.onchange = () => { entry.selected = cb.checked; updateMoveCount(); };
          row.appendChild(cb);

          // 兵士情報
          row.appendChild(el('span', { color:'#eee', fontSize:'13px', minWidth:'140px' },
            `#${card.num} ${def.name} (士気${morale})`));

          // 方法選択ラジオ
          const radioName = `inf_method_${card.id}`;
          const lblMorale = el('label', { color:'#ccc', fontSize:'12px', cursor:'pointer' });
          const rMorale = document.createElement('input');
          rMorale.type = 'radio'; rMorale.name = radioName; rMorale.checked = true;
          rMorale.onchange = () => { entry.useMove = false; updateMoveCount(); };
          lblMorale.appendChild(rMorale);
          lblMorale.appendChild(document.createTextNode('モラル'));
          row.appendChild(lblMorale);

          const lblMove = el('label', { color:'#ccc', fontSize:'12px', cursor:'pointer' });
          const rMove = document.createElement('input');
          rMove.type = 'radio'; rMove.name = radioName;
          rMove.onchange = () => { entry.useMove = true; updateMoveCount(); };
          lblMove.appendChild(rMove);
          lblMove.appendChild(document.createTextNode('移動カード'));
          row.appendChild(lblMove);
        }
        listDiv.appendChild(row);
      });
      frag.appendChild(listDiv);

      // 移動カード必要数表示
      const moveCountDiv = el('div', { color:'#ff9', fontSize:'12px', marginBottom:'16px' });
      frag.appendChild(moveCountDiv);

      function updateMoveCount() {
        const need = selections.filter(s => s.selected && s.useMove).length;
        moveCountDiv.textContent = `移動カード必要: ${need}枚 / 手札: ${moveCards.length}枚`;
        if (need > moveCards.length) moveCountDiv.style.color = '#f44';
        else moveCountDiv.style.color = '#ff9';
      }
      updateMoveCount();

      // ボタン
      const btnRow = el('div', { display:'flex', gap:'12px', justifyContent:'flex-end' });
      const btnExec = el('button', BTN_PRIMARY, '実行');
      const btnCancel = el('button', BTN_CANCEL, 'キャンセル');

      btnExec.onclick = () => {
        const selected = selections.filter(s => s.selected);
        if (selected.length === 0) { alert('兵士を選択してください'); return; }
        const needMove = selected.filter(s => s.useMove).length;
        if (needMove > moveCards.length) { alert('移動カードが足りません'); return; }
        removeOverlay(overlay);
        resolve({ soldiers: selected, cancelled: false });
      };
      btnCancel.onclick = () => {
        removeOverlay(overlay);
        resolve({ soldiers: [], cancelled: true });
      };
      btnRow.appendChild(btnExec);
      btnRow.appendChild(btnCancel);
      frag.appendChild(btnRow);

      const overlay = showOverlay(frag);
    });
  }

  /**
   * 侵入結果オーバーレイ
   * @returns {Promise<void>}
   */
  function showInfiltrationResultOverlay(title, results) {
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();
      frag.appendChild(el('div', TITLE_STYLE, title));

      // テーブル
      const table = document.createElement('table');
      table.style.cssText = 'width:100%; border-collapse:collapse; font-size:13px; color:#eee;';
      const thead = el('tr', { background:'#555' });
      ['兵士','方法','士気','RNC','判定','コラム','RPC色','結果'].forEach(h => {
        const th = el('th', { padding:'4px 6px', textAlign:'center', borderBottom:'1px solid #777' }, h);
        thead.appendChild(th);
      });
      table.appendChild(thead);

      let successCount = 0;
      results.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #444';
        const cells = [];

        cells.push(r.name);
        cells.push(r.method);
        cells.push(r.morale != null ? String(r.morale) : '--');

        // RNC
        if (r.rnc != null) {
          const rncText = `${r.rncColor}${Math.abs(r.rnc)}`;
          cells.push(rncText);
        } else {
          cells.push('--');
        }

        // 判定
        if (r.moraleResult != null) {
          cells.push(r.moraleResult ? 'OK' : 'NG');
        } else {
          cells.push('OK');
        }

        // コラム
        cells.push(r.column != null ? String(r.column) : '--');

        // RPC色
        if (r.rpcColor != null) {
          cells.push(r.rpcColor);
        } else {
          cells.push('--');
        }

        // 結果
        let resText, resColor;
        if (r.infiltrated) { resText = '成功'; resColor = '#4f4'; successCount++; }
        else if (r.pinned) { resText = 'ピン'; resColor = '#fd0'; }
        else if (r.moraleResult === false) { resText = 'ピン(士気)'; resColor = '#fd0'; }
        else { resText = '失敗'; resColor = '#f88'; }
        cells.push(resText);

        cells.forEach((text, ci) => {
          const td = el('td', { padding:'4px 6px', textAlign:'center' }, text);
          if (ci === cells.length - 1) td.style.color = resColor;
          if (ci === 3 && r.rncColor === '赤') td.style.color = '#f66';
          if (ci === 3 && r.rncColor === '黒') td.style.color = '#6cf';
          if (ci === 6 && r.rpcColor === '赤') td.style.color = '#f66';
          if (ci === 6 && r.rpcColor === '黒') td.style.color = '#6cf';
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      frag.appendChild(table);

      // サマリー
      const summary = el('div', { marginTop:'12px', fontSize:'14px', color:'#ffeb3b' },
        `侵入成功: ${successCount}名`);
      frag.appendChild(summary);

      // OKボタン
      const btnRow = el('div', { display:'flex', justifyContent:'flex-end', marginTop:'16px' });
      const btn = el('button', BTN_PRIMARY, 'OK');
      btn.onclick = () => { removeOverlay(overlay); resolve(); };
      btnRow.appendChild(btn);
      frag.appendChild(btnRow);

      const overlay = showOverlay(frag);
    });
  }

  // ===========================================================
  // 7. 白兵戦UI
  // ===========================================================

  /**
   * CC参加セットアップモーダル
   * @returns {Promise<{ participants:Array, concealCard:object|null, cancelled:boolean }>}
   */
  function showCCSetupModal(srcGroup, tgtGroup, infiltrators, playerHand, srcFacKey) {
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();
      frag.appendChild(el('div', TITLE_STYLE, `白兵戦 — ${srcGroup.name} → 敵${tgtGroup.name}`));

      // 侵入兵リスト
      const moveCards = playerHand.filter(c => c.terrain && c.terrain.type === 'MOVEMENT');
      const concealCards = playerHand.filter(c => c.terrain && c.terrain.type === 'CONCEALED');

      const listDiv = el('div', { marginBottom:'12px' });
      const entries = [];

      infiltrators.forEach(inf => {
        const def = R().lookupSoldier(inf.card, srcFacKey);
        if (!def) return;
        const ccv = getCCV(inf.card, def, {});

        const row = el('div', {
          display:'flex', alignItems:'center', gap:'8px',
          padding:'4px 0', borderBottom:'1px solid #555',
        });

        const entry = { ...inf, soldierDef: def, ccv, selected: true, useMove: false };
        entries.push(entry);

        // チェックボックス（デフォルトON）
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = true;
        cb.onchange = () => { entry.selected = cb.checked; };
        row.appendChild(cb);

        row.appendChild(el('span', { color:'#eee', fontSize:'13px', minWidth:'180px' },
          `#${inf.card.num} ${def.name} (CCV:${ccv})`));

        // 方法選択
        const radioName = `cc_method_${inf.card.id}`;
        const lblMorale = el('label', { color:'#ccc', fontSize:'12px', cursor:'pointer' });
        const rMorale = document.createElement('input');
        rMorale.type = 'radio'; rMorale.name = radioName; rMorale.checked = true;
        rMorale.onchange = () => { entry.useMove = false; };
        lblMorale.appendChild(rMorale);
        lblMorale.appendChild(document.createTextNode('モラル'));
        row.appendChild(lblMorale);

        const lblMove = el('label', { color:'#ccc', fontSize:'12px', cursor:'pointer' });
        const rMove = document.createElement('input');
        rMove.type = 'radio'; rMove.name = radioName;
        rMove.onchange = () => { entry.useMove = true; };
        lblMove.appendChild(rMove);
        lblMove.appendChild(document.createTextNode('移動カード'));
        row.appendChild(lblMove);

        listDiv.appendChild(row);
      });
      frag.appendChild(listDiv);

      // 隠ぺいカード
      let selectedConceal = null;
      if (concealCards.length > 0) {
        const concealDiv = el('div', { marginBottom:'12px' });
        concealDiv.appendChild(el('div', { color:'#ff9', fontSize:'13px', marginBottom:'4px' },
          '隠ぺいカード（相手のCCVを減少）:'));
        const concealRow = el('div', { display:'flex', gap:'8px' });

        const btnNone = el('button', { ...BTN_CANCEL, fontSize:'12px', padding:'4px 12px' }, '使わない');
        btnNone.style.border = '2px solid #ffeb3b';
        btnNone.onclick = () => {
          selectedConceal = null;
          concealRow.querySelectorAll('button').forEach(b => b.style.borderColor = '#666');
          btnNone.style.borderColor = '#ffeb3b';
        };
        concealRow.appendChild(btnNone);

        concealCards.forEach((cc, i) => {
          const val = parseInt(cc.terrain.range, 10) || 1;
          const btn = el('button', { ...BTN_CANCEL, fontSize:'12px', padding:'4px 12px' },
            `隠ぺい(値${val})`);
          btn.onclick = () => {
            selectedConceal = { handIdx: playerHand.indexOf(cc), value: val, card: cc };
            concealRow.querySelectorAll('button').forEach(b => b.style.borderColor = '#666');
            btn.style.borderColor = '#ffeb3b';
          };
          concealRow.appendChild(btn);
        });
        concealDiv.appendChild(concealRow);
        frag.appendChild(concealDiv);
      }

      // 情報
      frag.appendChild(el('div', { color:'#aaa', fontSize:'12px', marginBottom:'12px' },
        `移動カード手札: ${moveCards.length}枚`));

      // ボタン
      const btnRow = el('div', { display:'flex', gap:'12px', justifyContent:'flex-end' });
      const btnExec = el('button', BTN_PRIMARY, '実行');
      const btnCancel = el('button', BTN_CANCEL, 'キャンセル');
      btnExec.onclick = () => {
        const selected = entries.filter(e => e.selected);
        if (selected.length === 0) { alert('参加する兵士を選択してください'); return; }
        const needMove = selected.filter(e => e.useMove).length;
        if (needMove > moveCards.length) { alert('移動カードが足りません'); return; }
        removeOverlay(overlay);
        resolve({ participants: selected, concealCard: selectedConceal, cancelled: false });
      };
      btnCancel.onclick = () => {
        removeOverlay(overlay);
        resolve({ participants: [], concealCard: null, cancelled: true });
      };
      btnRow.appendChild(btnExec);
      btnRow.appendChild(btnCancel);
      frag.appendChild(btnRow);

      const overlay = showOverlay(frag);
    });
  }

  /**
   * CC結果オーバーレイ
   * @returns {Promise<void>}
   */
  function showCCResultOverlay(title, battles) {
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();
      frag.appendChild(el('div', TITLE_STYLE, title));

      battles.forEach((b, i) => {
        const box = el('div', {
          background:'#2a2a2a', border:'1px solid #666', borderRadius:'6px',
          padding:'10px', marginBottom:'8px',
        });

        // 戦闘ヘッダー
        box.appendChild(el('div', { color:'#ffeb3b', fontSize:'14px', fontWeight:'bold', marginBottom:'6px' },
          `戦闘${i+1}: ${b.atkName} vs ${b.defName}`));

        // 攻撃側
        const atkRncCol = b.atkRncColor === '赤' ? '#f66' : '#6cf';
        const atkLine = el('div', { fontSize:'13px', color:'#eee', marginBottom:'2px' });
        atkLine.innerHTML = `攻撃: CCV <b>${b.atkCCV}</b> + RNC <span style="color:${atkRncCol}"><b>${b.atkRncColor}${Math.abs(b.atkRnc)}</b></span> = <b>${b.atkTotal}</b>`;
        if (b.atkBonus) atkLine.innerHTML += ` <span style="color:#ff9">(+${b.atkBonus}人数)</span>`;
        box.appendChild(atkLine);

        // 防御側
        const defRncCol = b.defRncColor === '赤' ? '#f66' : '#6cf';
        const defLine = el('div', { fontSize:'13px', color:'#eee', marginBottom:'6px' });
        defLine.innerHTML = `防御: CCV <b>${b.defCCV}</b> + RNC <span style="color:${defRncCol}"><b>${b.defRncColor}${Math.abs(b.defRnc)}</b></span> = <b>${b.defTotal}</b>`;
        if (b.defBonus) defLine.innerHTML += ` <span style="color:#ff9">(+${b.defBonus}人数)</span>`;
        if (b.concealMod) defLine.innerHTML += ` <span style="color:#8f8">(-${b.concealMod}隠ぺい)</span>`;
        box.appendChild(defLine);

        // 結果
        let resText, resColor;
        if (b.result === 'DEF_KIA')  { resText = `${b.defName} KIA`; resColor = '#4f4'; }
        else if (b.result === 'ATK_KIA')  { resText = `${b.atkName} KIA`; resColor = '#f44'; }
        else { resText = '両者 KIA'; resColor = '#f80'; }
        box.appendChild(el('div', { fontSize:'15px', fontWeight:'bold', color:resColor }, `結果: ${resText}`));

        frag.appendChild(box);
      });

      // OKボタン
      const btnRow = el('div', { display:'flex', justifyContent:'flex-end', marginTop:'12px' });
      const btn = el('button', BTN_PRIMARY, 'OK');
      btn.onclick = () => { removeOverlay(overlay); resolve(); };
      btnRow.appendChild(btn);
      frag.appendChild(btnRow);

      const overlay = showOverlay(frag);
    });
  }

  /**
   * 兵器捕獲選択モーダル
   * @returns {Promise<'capture'|'remove'>}
   */
  function showWeaponCaptureModal(winnerName, loserName, weaponName) {
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();
      frag.appendChild(el('div', TITLE_STYLE, '兵器捕獲 (§20.74)'));
      frag.appendChild(el('div', { color:'#eee', fontSize:'14px', marginBottom:'16px' },
        `${winnerName} は ${loserName} の ${weaponName} を捕獲できます。`));

      const btnRow = el('div', { display:'flex', gap:'12px', justifyContent:'center' });
      const btnCapture = el('button', BTN_PRIMARY, '捕獲する');
      const btnRemove = el('button', BTN_DANGER, '除去する');
      btnCapture.onclick = () => { removeOverlay(overlay); resolve('capture'); };
      btnRemove.onclick = () => { removeOverlay(overlay); resolve('remove'); };
      btnRow.appendChild(btnCapture);
      btnRow.appendChild(btnRemove);
      frag.appendChild(btnRow);

      const overlay = showOverlay(frag);
    });
  }

  // ===========================================================
  // 8. メイン実行関数
  // ===========================================================

  /**
   * 侵入アクション実行
   * @param {object} srcGroup - 攻撃側グループ
   * @param {object} tgtGroup - 防御側グループ
   * @param {string} tgtSide - 'ai' or 'player'
   * @param {number} tgtIdx - groups配列中のインデックス
   * @param {Function} drawFn - drawTerrainCard
   * @param {string} srcFacKey - 'us'|'ger'|'rus'
   * @returns {Promise<{ ok:boolean, results:Array, actionUsed:boolean }>}
   */
  async function executeInfiltration(srcGroup, tgtGroup, tgtSide, tgtIdx, drawFn, srcFacKey) {
    const st = global.state;
    const playerHand = st.playerHand || [];

    // セットアップモーダル
    const setup = await showInfiltrationSetupModal(srcGroup, tgtGroup, playerHand, srcFacKey);
    if (setup.cancelled) return { ok: false, results: [], actionUsed: false };

    const results = [];
    const moveCards = playerHand.filter(c => c.terrain && c.terrain.type === 'MOVEMENT');
    let moveCardUsed = 0;

    for (const sel of setup.soldiers) {
      const def = sel.soldierDef;
      const morale = parseInt(def.morale, 10) || 0;
      const entry = { name: `#${sel.card.num} ${def.name}`, morale };

      // §20.22 移動カード使用 → モラルチェック不要
      if (sel.useMove) {
        entry.method = '移動';
        entry.moraleResult = true;
        // 移動カードを消費
        if (moveCardUsed < moveCards.length) {
          const mc = moveCards[moveCardUsed];
          const handIdx = playerHand.indexOf(mc);
          if (handIdx >= 0) {
            playerHand.splice(handIdx, 1);
            if (mc.terrainIndex != null && st.terrainDeck) {
              st.terrainDeck.discard.push(mc.terrainIndex);
            }
          }
          moveCardUsed++;
        }
      } else {
        // §20.21 モラルチェック
        entry.method = 'モラル';
        const rncCard = drawFn();
        if (!rncCard) { entry.moraleResult = false; entry.infiltrated = false; results.push(entry); continue; }
        const check = checkInfiltrationMorale(def, rncCard);
        entry.rnc = check.rnc;
        entry.rncColor = check.rncColor;
        entry.morale = check.morale;
        entry.moraleResult = check.pass;

        if (!check.pass) {
          // §20.21 失敗 → ピン状態
          R().pinSoldier(sel.card);
          entry.pinned = true;
          entry.infiltrated = false;
          results.push(entry);
          continue;
        }
      }

      // §20.3 侵入判定RPC
      const column = calcInfiltrationColumn(tgtGroup, srcGroup, { srcFacKey });
      entry.column = column;

      const rpcCard = drawFn();
      if (!rpcCard) { entry.infiltrated = false; results.push(entry); continue; }
      const rpcResult = resolveInfiltrationRPC(rpcCard, column);
      entry.rpcColor = rpcResult.color;
      entry.rpcValue = rpcResult.posValue;
      entry.infiltrated = rpcResult.success;

      if (rpcResult.success) {
        // 侵入成功 → 侵入チット
        sel.card.infiltrating = true;
        sel.card.infiltratedGroupSide = tgtSide;
        sel.card.infiltratedGroupIdx = tgtIdx;
        sel.card.infiltratedThisTurn = true; // §21.2 爆薬使用可能期間
      }

      results.push(entry);
    }

    // 結果オーバーレイ
    const titleText = `侵入結果 — ${srcGroup.name} → 敵${tgtGroup.name}`;
    await showInfiltrationResultOverlay(titleText, results);

    return { ok: true, results, actionUsed: true };
  }

  /**
   * 白兵戦アクション実行
   * @returns {Promise<{ ok:boolean, battles:Array, actionUsed:boolean }>}
   */
  async function executeCC(srcGroup, srcGroupIdx, drawFn, srcFacKey) {
    const st = global.state;
    const playerHand = st.playerHand || [];
    const srcSide = 'player';

    // 侵入兵を収集
    const infiltrators = getInfiltratingFromGroup(srcGroup).map(card => {
      const ci = srcGroup.cards.indexOf(card);
      return { card, cardIdx: ci };
    });

    if (infiltrators.length === 0) {
      alert('侵入中の兵士がいません');
      return { ok: false, battles: [], actionUsed: false };
    }

    // 侵入先特定（最初の侵入兵の侵入先）
    const firstInf = infiltrators[0].card;
    const tgtSide = firstInf.infiltratedGroupSide;
    const tgtIdx = firstInf.infiltratedGroupIdx;
    const tgtGroup = st.groups[tgtSide][tgtIdx];
    if (!tgtGroup) {
      alert('侵入先グループが見つかりません');
      return { ok: false, battles: [], actionUsed: false };
    }

    const tgtFacKey = tgtGroup._faction || 'ger';

    // §21.2 爆薬使用可能兵士がいれば先に選択肢を出す
    const demoEligible = infiltrators.find(p => p.card.demoCharge && p.card.infiltratedThisTurn);
    if (demoEligible) {
      const name = (R().lookupSoldier(demoEligible.card, srcFacKey) || {}).name || demoEligible.card.id;
      const useDemo = confirm(`${name} が爆薬を保有しています。爆薬攻撃(FP8)を使用しますか？\n(使用すると以降このグループの攻撃は不可)`);
      if (useDemo) {
        return await executeDemoCharge(demoEligible.card, srcGroup, srcSide, tgtGroup, tgtSide, tgtIdx, drawFn, srcFacKey, tgtFacKey);
      }
    }

    // CCセットアップモーダル
    const setup = await showCCSetupModal(srcGroup, tgtGroup, infiltrators, playerHand, srcFacKey);
    if (setup.cancelled) return { ok: false, battles: [], actionUsed: false };

    // §20.52 各参加者のCC参加チェック
    const moveCards = playerHand.filter(c => c.terrain && c.terrain.type === 'MOVEMENT');
    let moveCardUsed = 0;
    const participants = [];

    for (const p of setup.participants) {
      const def = R().lookupSoldier(p.card, srcFacKey);
      if (!def) continue;

      if (p.useMove) {
        // 移動カード消費
        if (moveCardUsed < moveCards.length) {
          const mc = moveCards[moveCardUsed];
          const handIdx = playerHand.indexOf(mc);
          if (handIdx >= 0) {
            playerHand.splice(handIdx, 1);
            if (mc.terrainIndex != null && st.terrainDeck) st.terrainDeck.discard.push(mc.terrainIndex);
          }
          moveCardUsed++;
        }
        participants.push(p);
      } else {
        // モラルチェック (§20.21)
        const rncCard = drawFn();
        if (!rncCard) continue;
        const rnc = parseInt(rncCard.terrain.range, 10) || 0;
        const morale = parseInt(def.morale, 10) || 0;
        if (rnc < morale) {
          participants.push(p);
        } else {
          R().pinSoldier(p.card);
          // §20.53 ピン → 侵入状態解除
          p.card.infiltrating = false;
          delete p.card.infiltratedGroupSide;
          delete p.card.infiltratedGroupIdx;
        }
      }
    }

    if (participants.length === 0) {
      alert('CC参加に成功した兵士がいません');
      return { ok: true, battles: [], actionUsed: true };
    }

    // §20.52 RPCで防御側ポジション決定 & CC解決
    const battles = [];
    const concealMod = setup.concealCard ? setup.concealCard.value : 0;

    // 隠ぺいカード消費
    if (setup.concealCard) {
      const ci = setup.concealCard.handIdx;
      if (ci >= 0 && ci < playerHand.length) {
        const removed = playerHand.splice(ci, 1)[0];
        if (removed && removed.terrainIndex != null && st.terrainDeck) {
          st.terrainDeck.discard.push(removed.terrainIndex);
        }
      }
    }

    // 各参加者のCC相手をRPCで決定
    const assignments = []; // { attacker, defender, defCardIdx }
    for (const p of participants) {
      const rpcCard = drawFn();
      if (!rpcCard) continue;
      const target = determineCCTarget(rpcCard, tgtGroup);
      if (!target) continue;
      assignments.push({ attacker: p, defCard: target.card, defCardIdx: target.cardIdx, defPosition: target.position });
    }

    // §20.72 同じ防御側に複数の攻撃者 → +3ボーナス
    const defMap = new Map(); // defCardIdx → [attackers]
    for (const a of assignments) {
      if (!defMap.has(a.defCardIdx)) defMap.set(a.defCardIdx, []);
      defMap.get(a.defCardIdx).push(a);
    }

    // 各戦闘解決
    for (const [defCardIdx, attackers] of defMap) {
      const defCard = tgtGroup.cards[defCardIdx];
      if (!defCard || !R().isAlive(defCard)) continue;
      const defDef = R().lookupSoldier(defCard, tgtFacKey);
      if (!defDef) continue;

      let defCCV = getCCV(defCard, defDef, {});
      // 隠ぺいカード（攻撃側が防御側のCCVを減少）
      defCCV = Math.max(0, defCCV - concealMod);

      // §20.622 余分な攻撃者ボーナス
      const extraAttackers = Math.max(0, attackers.length - 1);
      const atkBonus = extraAttackers * 3;

      // 主攻撃者（最初の1名）で戦闘
      let attackerIdx = 0;
      while (attackerIdx < attackers.length && R().isAlive(defCard)) {
        const atk = attackers[attackerIdx];
        const atkDef = R().lookupSoldier(atk.attacker.card, srcFacKey);
        if (!atkDef) { attackerIdx++; continue; }

        let atkCCV = getCCV(atk.attacker.card, atkDef, {});
        // §20.72 最初の攻撃者のみボーナス加算（除去されたら次の攻撃者にはその分は消える）
        const currentBonus = Math.max(0, (attackers.length - 1 - attackerIdx)) * 3;
        atkCCV += currentBonus;

        // §20.7 RNC引き
        const atkRncCard = drawFn();
        const defRncCard = drawFn();
        if (!atkRncCard || !defRncCard) break;

        const combat = resolveCCCombat(atkCCV, defCCV, atkRncCard, defRncCard);

        const battle = {
          atkName: `#${atk.attacker.card.num} ${atkDef.name}`,
          defName: `#${defCard.num} ${defDef.name}`,
          atkCCV, defCCV,
          atkRnc: combat.atkRnc, defRnc: combat.defRnc,
          atkRncColor: combat.atkRncColor, defRncColor: combat.defRncColor,
          atkTotal: combat.atkTotal, defTotal: combat.defTotal,
          atkBonus: currentBonus > 0 ? currentBonus : 0,
          defBonus: 0,
          concealMod: concealMod > 0 ? concealMod : 0,
          result: combat.result,
        };
        battles.push(battle);

        // 結果適用
        if (combat.result === 'DEF_KIA' || combat.result === 'BOTH_KIA') {
          R().killSoldier(defCard);
          // 侵入状態解除
          atk.attacker.card.infiltrating = false;
          delete atk.attacker.card.infiltratedGroupSide;
          delete atk.attacker.card.infiltratedGroupIdx;

          // §20.73 3以上の差で勝った場合、侵入状態維持
          if (combat.result === 'DEF_KIA' && combat.diff >= 3) {
            atk.attacker.card.infiltrating = true;
            atk.attacker.card.infiltratedGroupSide = tgtSide;
            atk.attacker.card.infiltratedGroupIdx = tgtIdx;
          }
        }
        if (combat.result === 'ATK_KIA' || combat.result === 'BOTH_KIA') {
          R().killSoldier(atk.attacker.card);
          atk.attacker.card.infiltrating = false;
          delete atk.attacker.card.infiltratedGroupSide;
          delete atk.attacker.card.infiltratedGroupIdx;
        }

        // §20.72 攻撃者除去 → 次の攻撃者
        if (combat.result === 'ATK_KIA') {
          attackerIdx++;
        } else {
          break; // 攻撃者勝利 or 両者KIA → この防御者の戦闘終了
        }
      }
    }

    // 結果オーバーレイ
    const titleText = `白兵戦結果 — ${srcGroup.name} → 敵${tgtGroup.name}`;
    await showCCResultOverlay(titleText, battles);

    // §20.8 地形占拠チェック
    const defAlive = aliveCards(tgtGroup);
    if (defAlive.length === 0 && tgtGroup.terrain && tgtGroup.terrain.length > 0) {
      // 防御グループ全滅 → 地形占拠可能
      const terrainCards = tgtGroup.terrain.filter(t => t.terrain &&
        t.terrain.type !== 'MOVEMENT' && !t.terrain.type.startsWith('FIRE') && t.terrain.type !== 'CONCEALED');
      if (terrainCards.length > 0) {
        // 自動で地形を占拠（攻撃側グループに移動）
        for (const tc of terrainCards) {
          const idx = tgtGroup.terrain.indexOf(tc);
          if (idx >= 0) {
            tgtGroup.terrain.splice(idx, 1);
            srcGroup.terrain.push(tc);
          }
        }
      }
    }

    return { ok: true, battles, actionUsed: true };
  }

  /**
   * §21 爆薬攻撃: 侵入したターンのみ1度だけ、射撃力8で目標グループを攻撃
   * 1枚目RNCが赤6なら爆薬故障(失われる)、攻撃はそこで中止
   */
  async function executeDemoCharge(attackerCard, srcGroup, srcSide, tgtGroup, tgtSide, tgtIdx, drawFn, atkFacKey, tgtFacKey) {
    if (!attackerCard.demoCharge || !attackerCard.infiltratedThisTurn) {
      return { ok: false, reason: 'no-demo-or-not-just-infiltrated' };
    }
    const results = [];
    let malfunctioned = false;
    // 防御側の地形修正 / 隠蔽 / GULLY等（§21.3: 攻撃側の地形修正は適用されない）
    const defMod = R().calcTerrainMod(tgtGroup.terrain, false);
    const gullyMod = R().isInGully(tgtGroup) ? -2 : 0;
    const marshDefMod = R().isInMarsh(tgtGroup) ? -1 : 0;
    const baseFP = Math.max(0, 8 + defMod + gullyMod + marshDefMod);

    let first = true;
    for (let i = 0; i < tgtGroup.cards.length; i++) {
      const card = tgtGroup.cards[i];
      if (!R().isAlive(card)) continue;
      const judge = drawFn();
      if (!judge) continue;
      const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
      const isRed = judge.terrain && judge.terrain.rncColor === '赤';
      const rnc = isRed ? -rncAbs : rncAbs;
      // §21.4 1枚目RNCが赤6 → 爆薬故障、以降の解決なし
      if (first && isRed && rncAbs === 6) {
        malfunctioned = true;
        attackerCard.demoCharge = false;
        first = false;
        break;
      }
      first = false;
      const def = R().lookupSoldier(card, tgtFacKey);
      const wasPinned = R().isPinned(card);
      const rpc0r = parseInt((judge.terrain && judge.terrain.dice && judge.terrain.dice['0r']) || '0', 10) || 0;
      const r = R().resolveFireOnSoldier(baseFP, rnc, def, wasPinned, rpc0r, 0, 0);
      if (r.result === 'KIA' || r.result === 'PANIC_KIA') R().killSoldier(card);
      else if (r.result === 'PANIC_ROUT') R().routSoldier(card);
      else if (r.result === 'PIN') R().pinSoldier(card);
      const morale = def ? (wasPinned ? parseInt(def.panic,10)||0 : parseInt(def.morale,10)||0) : 0;
      const kia = def ? (wasPinned ? parseInt(def.kiaBack,10)||0 : parseInt(def.kiaFront,10)||0) : 0;
      results.push({ name: def ? def.name : card.id, result: r.result, rnc, rncColor: isRed ? '赤' : '黒', finalFP: baseFP, sum: baseFP + rnc, morale, kia, wasPinned });
    }
    // 爆薬は使用済み
    attackerCard.demoCharge = false;

    const title = malfunctioned
      ? `爆薬故障 (赤6) — 攻撃失敗 / 爆薬喪失`
      : `爆薬攻撃 — ${srcGroup.name} → ${tgtSide === 'player' ? '自' : '敵'}${tgtGroup.name} (FP ${baseFP})`;
    // 結果表示: fire overlay の流用は難しいので alert + 簡易一覧
    let msg = title + '\n';
    results.forEach(r => { msg += `${r.name}: ${r.result} (RNC ${r.rncColor}${Math.abs(r.rnc)})\n`; });
    alert(msg);

    return { ok: true, malfunctioned, results, actionUsed: true };
  }

  /**
   * 侵入状態をクリア（§20.53 条件に応じて呼ばれる）
   * @param {object} group - 対象グループ
   * @param {string} reason - 'move'|'fire'|'pin'
   */
  function clearInfiltration(group, reason) {
    if (!group || !group.cards) return;
    for (const card of group.cards) {
      if (!card.infiltrating) continue;
      if (reason === 'move' || reason === 'fire') {
        card.infiltrating = false;
        delete card.infiltratedGroupSide;
        delete card.infiltratedGroupIdx;
      }
    }
  }

  /**
   * 特定兵士の侵入状態クリア
   */
  function clearSoldierInfiltration(card) {
    card.infiltrating = false;
    delete card.infiltratedGroupSide;
    delete card.infiltratedGroupIdx;
  }

  /**
   * CC可能かチェック
   */
  function canAttemptCC(srcGroup) {
    // §45 万歳突撃: 防御側は侵入なしでCC可能（攻撃中Banzaiグループに対し）
    const st = global.state;
    if (st && st.groups) {
      const allEnemy = (srcGroup._faction && st.groups.player.indexOf(srcGroup) >= 0) ? st.groups.ai : st.groups.player;
      const banzaiAttacker = allEnemy.find(g => g.banzai && g.banzai.targetSide && st.groups[g.banzai.targetSide] && st.groups[g.banzai.targetSide].indexOf(srcGroup) >= 0);
      if (banzaiAttacker) {
        const aliveSrc = srcGroup.cards.some(c => R().isAlive(c));
        if (aliveSrc) return { ok: true, defenderVsBanzai: true, banzaiAttacker };
      }
    }
    const infiltrators = getInfiltratingFromGroup(srcGroup);
    if (infiltrators.length === 0) return { ok: false, error: '侵入中の兵士がいません' };
    // §23.5 トーチカ内のグループはCC対象とならない
    const first = infiltrators[0];
    const side = first.infiltratedGroupSide;
    const idx = first.infiltratedGroupIdx;
    const tgtGroup = st.groups && st.groups[side] && st.groups[side][idx];
    if (tgtGroup && R().hasTerrainType && R().hasTerrainType(tgtGroup, 'PILLBOX')) {
      return { ok: false, error: 'トーチカ内のグループはCC不可（火力2倍や爆薬のみ有効）' };
    }
    return { ok: true };
  }

  // ===========================================================
  // 9. §20.51 侵入兵の火力2倍
  // ===========================================================

  /**
   * 侵入兵の追加火力を計算（既にcalcGroupFirepowerに含まれる分と同額 → 結果2倍）
   * @returns {number} 追加FP
   */
  function calcInfiltrationFPBonus(srcGroup, tgtSide, tgtIdx, srcFacKey, distance) {
    let bonus = 0;
    const idx = R().rangeIndex(distance);
    for (const card of (srcGroup.cards || [])) {
      if (!R().isAlive(card) || R().isPinned(card)) continue;
      if (card.malfunctioned || card.destroyed) continue;
      if (!card.infiltrating) continue;
      if (card.infiltratedGroupSide !== tgtSide || card.infiltratedGroupIdx !== tgtIdx) continue;
      const def = R().lookupSoldier(card, srcFacKey);
      if (!def) continue;
      // §20.51 例外: 火炎放射器は2倍にしない
      if (def.weaponCat && def.weaponCat.includes('火炎放射器')) continue;
      const fp = parseInt(def.range[idx], 10) || 0;
      bonus += fp;
    }
    return bonus;
  }

  /**
   * srcGroupにtgtGroup(tgtSide/tgtIdx)を侵入先とする兵士がいるか
   */
  function hasInfiltratorsTargeting(srcGroup, tgtSide, tgtIdx) {
    return (srcGroup.cards || []).some(c =>
      c.infiltrating && c.infiltratedGroupSide === tgtSide && c.infiltratedGroupIdx === tgtIdx && R().isAlive(c)
    );
  }

  // ===========================================================
  // 10. §20.9 狂暴兵（ソ連軍専用）
  // ===========================================================

  /**
   * 狂暴兵チェック: PANIC_KIA時にソ連兵が狂暴兵になれるか
   * @param {object} card - ユニットカード
   * @param {object} soldierDef - 兵士定義（berserkフィールドあり）
   * @param {number} rpc0r - RPCの0rコラム値
   * @param {string} factionKey - 'rus'のみ対象
   * @param {number} relativeDistance - 敵との相対距離
   * @returns {boolean} trueなら狂暴兵化
   */
  function checkBerserkEligibility(card, soldierDef, rpc0r, factionKey, relativeDistance) {
    if (factionKey !== 'rus') return false;
    if (relativeDistance !== 5) return false;
    if (!R().isPinned(card)) return false;
    // パニック値以下なら狂暴兵化
    const panic = parseInt(soldierDef.panic, 10) || 0;
    return rpc0r <= panic;
  }

  /**
   * 狂暴兵のCC自動実行（ターン開始時）
   * @returns {Promise<{battles:Array}>}
   */
  async function executeBerserkCC(berserkCard, srcGroup, srcGroupIdx, tgtGroup, tgtSide, tgtIdx, drawFn, srcFacKey) {
    const tgtFacKey = tgtGroup._faction || 'ger';
    const def = R().lookupSoldier(berserkCard, srcFacKey);
    if (!def) return { battles: [] };

    // §20.91 RPCで防御側決定
    const rpcCard = drawFn();
    if (!rpcCard) return { battles: [] };
    const target = determineCCTarget(rpcCard, tgtGroup);
    if (!target) return { battles: [] };

    const defCard = target.card;
    const defDef = R().lookupSoldier(defCard, tgtFacKey);
    if (!defDef) return { battles: [] };

    // §20.91 ピン状態のCCVを使用
    const atkCCV = getCCV(berserkCard, def, {});
    const defCCV = getCCV(defCard, defDef, {});

    const atkRncCard = drawFn();
    const defRncCard = drawFn();
    if (!atkRncCard || !defRncCard) return { battles: [] };

    const combat = resolveCCCombat(atkCCV, defCCV, atkRncCard, defRncCard);

    const battle = {
      atkName: `#${berserkCard.num} ${def.name} [狂暴]`,
      defName: `#${defCard.num} ${defDef.name}`,
      atkCCV, defCCV,
      atkRnc: combat.atkRnc, defRnc: combat.defRnc,
      atkRncColor: combat.atkRncColor, defRncColor: combat.defRncColor,
      atkTotal: combat.atkTotal, defTotal: combat.defTotal,
      atkBonus: 0, defBonus: 0, concealMod: 0,
      result: combat.result,
    };

    // 結果適用
    if (combat.result === 'DEF_KIA' || combat.result === 'BOTH_KIA') {
      R().killSoldier(defCard);
    }
    if (combat.result === 'ATK_KIA' || combat.result === 'BOTH_KIA') {
      R().killSoldier(berserkCard);
      berserkCard.berserk = false;
    }
    // §20.91 勝利で回復
    if (combat.result === 'DEF_KIA') {
      R().unpinSoldier(berserkCard);
      berserkCard.berserk = false;
    }

    await showCCResultOverlay(`狂暴兵CC — ${srcGroup.name}`, [battle]);
    return { battles: [battle] };
  }

  // ===========================================================
  // 11. AI侵入/CC
  // ===========================================================

  /**
   * AI自動侵入（モーダルなし）
   */
  async function aiExecuteInfiltration(srcGroup, srcIdx, tgtGroup, tgtSide, tgtIdx, drawFn, aiFacKey) {
    const eligible = unpinnedAlive(srcGroup);
    if (eligible.length === 0) return { ok: false, actionUsed: false };

    // AI: 移動カードがあれば使う、なければモラルチェック
    const st = global.state;
    const aiHand = st.aiHand || [];
    const moveCards = aiHand.filter(c => c.terrain && c.terrain.type === 'MOVEMENT');
    let moveUsed = 0;
    const results = [];

    for (const card of eligible) {
      const def = R().lookupSoldier(card, aiFacKey);
      if (!def) continue;
      const morale = parseInt(def.morale, 10) || 0;
      const entry = { name: `#${card.num} ${def.name}`, morale };

      // 移動カードがあれば優先使用
      if (moveUsed < moveCards.length) {
        entry.method = '移動';
        entry.moraleResult = true;
        const mc = moveCards[moveUsed];
        const idx = aiHand.indexOf(mc);
        if (idx >= 0) {
          aiHand.splice(idx, 1);
          if (mc.terrainIndex != null && st.terrainDeck) st.terrainDeck.discard.push(mc.terrainIndex);
        }
        moveUsed++;
      } else {
        // モラルチェック
        entry.method = 'モラル';
        const rncCard = drawFn();
        if (!rncCard) { entry.moraleResult = false; entry.infiltrated = false; results.push(entry); continue; }
        const check = checkInfiltrationMorale(def, rncCard);
        entry.rnc = check.rnc;
        entry.rncColor = check.rncColor;
        entry.morale = check.morale;
        entry.moraleResult = check.pass;
        if (!check.pass) {
          R().pinSoldier(card);
          entry.pinned = true;
          entry.infiltrated = false;
          results.push(entry);
          continue;
        }
      }

      // 侵入RPC判定
      const column = calcInfiltrationColumn(tgtGroup, srcGroup, { srcFacKey: aiFacKey });
      entry.column = column;
      const rpcCard = drawFn();
      if (!rpcCard) { entry.infiltrated = false; results.push(entry); continue; }
      const rpcResult = resolveInfiltrationRPC(rpcCard, column);
      entry.rpcColor = rpcResult.color;
      entry.rpcValue = rpcResult.posValue;
      entry.infiltrated = rpcResult.success;
      if (rpcResult.success) {
        card.infiltrating = true;
        card.infiltratedGroupSide = tgtSide;
        card.infiltratedGroupIdx = tgtIdx;
        card.infiltratedThisTurn = true; // §21.2 爆薬使用可能期間
      }
      results.push(entry);
    }

    if (results.length > 0) {
      await showInfiltrationResultOverlay(`AI侵入 — ${srcGroup.name} → プレイヤー${tgtGroup.name}`, results);
    }
    return { ok: true, actionUsed: true, results };
  }

  /**
   * AI自動CC（モーダルなし）
   */
  async function aiExecuteCC(srcGroup, srcGroupIdx, drawFn, aiFacKey) {
    const st = global.state;
    const infiltrators = getInfiltratingFromGroup(srcGroup);
    if (infiltrators.length === 0) return { ok: false, actionUsed: false };

    const firstInf = infiltrators[0];
    const tgtSide = firstInf.infiltratedGroupSide;
    const tgtIdx = firstInf.infiltratedGroupIdx;
    const tgtGroup = st.groups[tgtSide][tgtIdx];
    if (!tgtGroup) return { ok: false, actionUsed: false };
    const tgtFacKey = tgtGroup._faction || 'us';

    // §21.2 爆薬使用可能兵士がいれば自動使用（AI判定: 敵数が2名以上のとき）
    const demoCard = infiltrators.find(c => c.demoCharge && c.infiltratedThisTurn);
    const aliveDefCount = tgtGroup.cards.filter(c => R().isAlive(c)).length;
    if (demoCard && aliveDefCount >= 2) {
      return await executeDemoCharge(demoCard, srcGroup, 'ai', tgtGroup, tgtSide, tgtIdx, drawFn, aiFacKey, tgtFacKey);
    }

    // 全侵入兵が参加（モラルチェックまたは移動カード）
    const aiHand = st.aiHand || [];
    const moveCards = aiHand.filter(c => c.terrain && c.terrain.type === 'MOVEMENT');
    let moveUsed = 0;
    const participants = [];

    for (const card of infiltrators) {
      const def = R().lookupSoldier(card, aiFacKey);
      if (!def) continue;
      if (moveUsed < moveCards.length) {
        const mc = moveCards[moveUsed];
        const idx = aiHand.indexOf(mc);
        if (idx >= 0) {
          aiHand.splice(idx, 1);
          if (mc.terrainIndex != null && st.terrainDeck) st.terrainDeck.discard.push(mc.terrainIndex);
        }
        moveUsed++;
        participants.push(card);
      } else {
        const rncCard = drawFn();
        if (!rncCard) continue;
        const rnc = parseInt(rncCard.terrain.range, 10) || 0;
        const morale = parseInt(def.morale, 10) || 0;
        if (rnc < morale) {
          participants.push(card);
        } else {
          R().pinSoldier(card);
          card.infiltrating = false;
          delete card.infiltratedGroupSide;
          delete card.infiltratedGroupIdx;
        }
      }
    }

    if (participants.length === 0) return { ok: true, actionUsed: true, battles: [] };

    // RPCで防御側決定 & CC解決
    const battles = [];
    const assignments = [];
    for (const card of participants) {
      const rpcCard = drawFn();
      if (!rpcCard) continue;
      const target = determineCCTarget(rpcCard, tgtGroup);
      if (!target) continue;
      assignments.push({ card, defCard: target.card, defCardIdx: target.cardIdx });
    }

    const defMap = new Map();
    for (const a of assignments) {
      if (!defMap.has(a.defCardIdx)) defMap.set(a.defCardIdx, []);
      defMap.get(a.defCardIdx).push(a);
    }

    for (const [defCardIdx, attackers] of defMap) {
      const defCard = tgtGroup.cards[defCardIdx];
      if (!defCard || !R().isAlive(defCard)) continue;
      const defDef = R().lookupSoldier(defCard, tgtFacKey);
      if (!defDef) continue;
      let defCCV = getCCV(defCard, defDef, {});

      let attackerIdx = 0;
      while (attackerIdx < attackers.length && R().isAlive(defCard)) {
        const atk = attackers[attackerIdx];
        const atkDef = R().lookupSoldier(atk.card, aiFacKey);
        if (!atkDef) { attackerIdx++; continue; }
        let atkCCV = getCCV(atk.card, atkDef, {});
        const currentBonus = Math.max(0, (attackers.length - 1 - attackerIdx)) * 3;
        atkCCV += currentBonus;

        const atkRncCard = drawFn();
        const defRncCard = drawFn();
        if (!atkRncCard || !defRncCard) break;
        const combat = resolveCCCombat(atkCCV, defCCV, atkRncCard, defRncCard);

        battles.push({
          atkName: `#${atk.card.num} ${atkDef.name}`,
          defName: `#${defCard.num} ${defDef.name}`,
          atkCCV, defCCV,
          atkRnc: combat.atkRnc, defRnc: combat.defRnc,
          atkRncColor: combat.atkRncColor, defRncColor: combat.defRncColor,
          atkTotal: combat.atkTotal, defTotal: combat.defTotal,
          atkBonus: currentBonus, defBonus: 0, concealMod: 0,
          result: combat.result,
        });

        if (combat.result === 'DEF_KIA' || combat.result === 'BOTH_KIA') R().killSoldier(defCard);
        if (combat.result === 'ATK_KIA' || combat.result === 'BOTH_KIA') {
          R().killSoldier(atk.card);
          atk.card.infiltrating = false;
        }
        if (combat.result === 'DEF_KIA') {
          atk.card.infiltrating = false;
          if (combat.diff >= 3) {
            atk.card.infiltrating = true;
            atk.card.infiltratedGroupSide = tgtSide;
            atk.card.infiltratedGroupIdx = tgtIdx;
          }
        }
        if (combat.result === 'ATK_KIA') attackerIdx++;
        else break;
      }
    }

    if (battles.length > 0) {
      await showCCResultOverlay(`AI白兵戦 — ${srcGroup.name} → ${tgtGroup.name}`, battles);
    }
    return { ok: true, actionUsed: true, battles };
  }

  // ===========================================================
  // 12. エクスポート
  // ===========================================================

  global.CC_ACTION = {
    // メイン実行
    executeInfiltration,
    executeCC,
    // チェック
    canAttemptInfiltration,
    canAttemptCC,
    // 侵入管理
    clearInfiltration,
    clearSoldierInfiltration,
    getInfiltratingFromGroup,
    getInfiltratorsFor,
    // CCV
    getCCV,
    parseCCV,
    getWeaponValue,
    // §20.51 火力2倍
    calcInfiltrationFPBonus,
    hasInfiltratorsTargeting,
    // §20.9 狂暴兵
    checkBerserkEligibility,
    executeBerserkCC,
    // AI侵入/CC
    aiExecuteInfiltration,
    aiExecuteCC,
    // §21 爆薬
    executeDemoCharge,
    // 内部（テスト用）
    calcInfiltrationColumn,
    resolveInfiltrationRPC,
    resolveCCCombat,
    determineCCTarget,
  };

})(typeof window !== 'undefined' ? window : this);
