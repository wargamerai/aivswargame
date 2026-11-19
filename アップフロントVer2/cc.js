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
  // §20.6 兵器値（上から順に照合。具体的な名前を先に置く）
  const WEAPON_CCV = [
    ['非武装', 0],
    ['BAR', 2],
    ['対戦車ライフル', 0], ['ATR', 0],
    ['軽機関銃', 1], ['LMG', 1],
    ['短機関銃', 3],
    ['中機関銃', 0], ['MMG', 0], ['機関銃', 0],
    ['カービン', 4], ['突撃銃', 4],
    ['火炎放射器', -1],
    ['迫撃砲', 0], ['擲弾筒', 0], ['歩兵砲', 0], ['対戦車砲', 0],
    ['バズーカ', 0], ['パンツァー', 0], ['PIAT', 0],
    ['小銃', 5], ['ライフル', 5],
  ];

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
  function getWeaponValue(weaponCat, faction) {
    if (!weaponCat) return 0;
    if (faction === 'jpn') {
      if (/^(軽機関銃|LMG)/.test(weaponCat)) return 2;
      if (/^短機関銃/.test(weaponCat)) return 4;
    }
    for (const [key, val] of WEAPON_CCV) {
      if (weaponCat.includes(key)) return val;
    }
    return 5; // その他のライフル
  }

  /** グループ内の生存兵士 */
  function aliveCards(group) {
    return (group.cards || []).filter(c => R().isAlive(c));
  }

  /** グループ内のピン状態でない生存兵士 */
  function unpinnedAlive(group) {
    return aliveCards(group).filter(c => !R().isPinned(c));
  }

  /** §32.21 監視役（捕虜を監視している兵）は潜入を試みられない */
  function isGuard(card) { return !!(card && card.prisoners && card.prisoners.length); }
  /** §32.21 監視役・§33.5 負傷兵は潜入を試みられない */
  function cannotInfiltrate(card, faction) {
    return !!card?.transfer || global.AFV?.isAfvCard(card) || isGuard(card) || R().isWoundActive(card) ||
      !!R().lookupSoldier(card, faction)?.isInfantryGun;
  }

  /** グループ内のピン状態兵士数 */
  function pinnedCount(group) {
    return aliveCards(group).filter(c => R().isPinned(c)).length;
  }

  /** グループが移動中か（MOVEMENTカードあり） */
  function isMoving(group) {
    if (global.isMovingIgnoringOverlays) return global.isMovingIgnoringOverlays(group);
    const base = group?.terrain?.findLast(card => card && !['SMOKE','WIRE'].includes(card.terrain?.type));
    return base?.terrain?.type === 'MOVEMENT';
  }

  /** グループの煙幕カード枚数 */
  /** §20.39 そのグループが敵の侵入を受けているか */
  function isInfiltratedByEnemy(group) {
    const st = global.state;
    if (!st || !st.groups || !group) return false;
    for (const side of ['player', 'ai']) {
      const idx = (st.groups[side] || []).indexOf(group);
      if (idx < 0) continue;
      const enemy = side === 'player' ? 'ai' : 'player';
      return (st.groups[enemy] || []).some(g => g && g.cards.some(c => c.infiltrating && R().isAlive(c)
        && c.infiltratedGroupSide === side && c.infiltratedGroupIdx === idx));
    }
    return false;
  }

  /** §20.23 中機関銃・迫撃砲を持つ兵士は侵入を試みる時その兵器を手放す（グループの兵器チットとして残る） */
  function abandonHeavyWeapon(group, card, facKey, side) {
    const def = R().lookupSoldier(card, facKey);
    if (!def || !def.weaponCat) return false;
    if (def.weaponCat.indexOf('中機関銃') !== 0 && def.weaponCat.indexOf('迫撃砲') < 0) return false;
    if (typeof global.dropWeaponToPool === 'function') global.dropWeaponToPool(group, card, facKey, side);
    return true;
  }

  /** §10.43 侵入・CC参加の試みでピン状態になった兵士をヒーローで回復して、もう一度試みるか（プレイヤーのみ） */
  function offerHeroRetry(card, def, what) {
    const st = global.state;
    if (!st || !st.playerHand) return false;
    const name = def ? def.name : card.id;
    if (!global._useHeroFromHand('player',
      `${name} はピン状態になりました。ヒーローカードで回復して、もう一度${what}を試みますか？（§10.43）`)) return false;
    R().unpinSoldier(card);
    card.heroRecovery = true;
    card._ccRetryHeroTurn = st.turnCount || 0;
    if (global.renderHands) global.renderHands();
    return true;
  }

  /** §11.13 その兵士が持ち主または助手になっているクルーを解く */
  function breakCrewOf(group, card) {
    if (!group || !group.crewPairs || !card || card.num == null) return;
    Object.keys(group.crewPairs).forEach(o => {
      if (parseInt(o, 10) === card.num || Number(group.crewPairs[o]) === card.num) delete group.crewPairs[o];
    });
  }

  function smokeCount(group) {
    // §13.26 夜間シナリオでは煙幕は非機能カード
    if (global.state && global.state.isNight) return 0;
    return (group.terrain || []).filter(c => c.terrain && c.terrain.type === 'SMOKE').length;
  }

  /** 攻撃側の地形タイプ → 侵入コラムシフト (§20.33-20.37) */
  function attackerTerrainShift(group) {
    if (R().isInBrush(group))    return -2;  // 繁み (§8.82・§20.33)
    if (R().isInWoods(group))    return -1;  // 森林
    if (R().isInTerrainType(group, 'HILL')) return +1;  // 丘
    // §8.12 平地（地形なし・平地カード・移動カード2枚で地形を出た状態 §5.2）は右へ2
    if (R().currentTerrainType(group) === 'PLAIN') return +2; // 平地
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

  /** §20.52・§20.55 参加者ごとに、前の手番までに侵入した相手を照合する。 */
  function closeCombatTargets(source) {
    const state = global.state;
    const origin = global._groupSideIdx(source);
    if (!source || !origin || source.eliminated || source._stun) return [];
    const targets = new Map();
    for (const card of getInfiltratingFromGroup(source)) {
      if (card.infiltratedThisTurn || R().isPinned(card) || card.transfer) continue;
      const side = card.infiltratedGroupSide;
      const index = card.infiltratedGroupIdx;
      const group = state.groups[side]?.[index];
      if (side === origin.side || !global._groupAlive(group) || Math.abs(origin.idx - index) > 1 ||
          R().relativeRange(source.distance, group.distance) !== 5 || global.AFV?.isAfvGroup(group) ||
          R().hasTerrainType(group, 'PILLBOX') || R().hasTerrainType(group, 'MINEFIELD')) continue;
      if (!targets.has(group)) targets.set(group, { side, index, group, soldiers: [] });
      targets.get(group).soldiers.push(card);
    }
    return [...targets.values()];
  }

  // ===========================================================
  // 3. 侵入ロジック (§20.1-20.5)
  // ===========================================================

  /**
   * 侵入可否チェック
   * @returns {{ ok:boolean, error:string }}
   */
  function canAttemptInfiltration(srcGroup, tgtGroup, srcSide) {
    if (!global._groupAlive(srcGroup) || !global._groupAlive(tgtGroup) || srcGroup._stun ||
        srcGroup.forming || tgtGroup.forming) return { ok: false, error: '侵入できるグループがありません' };
    const dist = R().relativeRange(srcGroup.distance, tgtGroup.distance);
    if (dist !== 5) return { ok: false, error: `相対距離が${dist}です（5が必要）` };
    // §20.2 真正面または隣接グループのみ
    const st = global.state;
    const sourceStart = srcGroup.ccStartingPosition;
    const targetStart = tgtGroup.ccStartingPosition;
    const turn = st?.turnCount || 0;
    if (sourceStart?.side === srcSide && targetStart?.side === srcSide &&
        sourceStart.turn === turn && targetStart.turn === turn &&
        (Math.abs(sourceStart.index - targetStart.index) > 1 ||
          R().relativeRange(sourceStart.distance, targetStart.distance) !== 5)) {
      return { ok: false, error: '侵入には手番開始時点から正面または隣接する目標と相対距離5である必要があります（§20.2）' };
    }
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
    // §20.24 未渡河の河川からは移動カードを使って侵入する。
    if (R().isInStream(srcGroup) && !R().hasCrossedStream(srcGroup) &&
        !movementCardsFor(srcSide).length) {
      return { ok: false, error: '未渡河の河川から侵入するには移動カードが必要です' };
    }
    // §23.5 トーチカにいるグループからは侵入できない
    if (R().currentTerrainType && R().currentTerrainType(srcGroup) === 'PILLBOX')
      return { ok: false, error: 'トーチカにいるグループからは侵入できません（§23.5）' };
    // §20.24 湿地: 移動カードが2枚のせられるまでは侵入できない
    if (R().isInMarsh && R().isInMarsh(srcGroup) && R().marshMoveCount(srcGroup) < 2)
      return { ok: false, error: '湿地からは、移動カードが2枚のせられるまで侵入できません（§20.24）' };
    // §20.24 地雷原・鉄条網にいるグループからは侵入不可
    if (R().hasTerrainType(srcGroup, 'MINEFIELD') || R().hasTerrainType(srcGroup, 'WIRE'))
      return { ok: false, error: '地雷原または鉄条網内からは侵入できません' };
    // §20.25 地雷原にいる敵には侵入不可
    if (R().hasTerrainType(tgtGroup, 'MINEFIELD'))
      return { ok: false, error: '地雷原にいるグループには侵入できません' };
    // ピン状態でない生存兵士が必要
    const faction = st && global.getFactionKey(st[srcSide]);
    const vehicle = global.AFV?.isAfvGroup(tgtGroup);
    const eligible = unpinnedAlive(srcGroup).filter(card => !card.infiltrating && !cannotInfiltrate(card, faction) &&
      (!vehicle || global.AFV.canAttackVehicleInCloseCombat(card, srcSide))); // §32.21 監視役・§33.5 負傷兵は潜入不可
    if (eligible.length === 0) return { ok: false, error: 'ピン状態でない兵士がいません（監視役・負傷兵は潜入できません）' };
    return { ok: true };
  }

  /**
   * §20.3 侵入コラム計算
   * @returns {number} 1〜10
   */
  function calcInfiltrationColumn(tgtGroup, srcGroup, opts) {
    return calcInfiltrationColumnDetailed(tgtGroup, srcGroup, opts).column;
  }

  function calcInfiltrationColumnDetailed(tgtGroup, srcGroup, opts) {
    opts = opts || {};
    const breakdown = [];
    const vehicle = global.AFV?.isAfvGroup(tgtGroup) ? global.AFV.afvCard(tgtGroup) : null;
    const base = vehicle ? global.AFV.closeCombatColumn(vehicle) : aliveCards(tgtGroup).length;
    breakdown.push({ label: vehicle ? '車両の状態(基礎)' : '防御側生存数(基礎)', value: base });
    let col = base;
    if (vehicle?._ck) {
      col -= vehicle._ck;
      breakdown.push({ label: '車両の乗員損失', value: -vehicle._ck });
    }

    const atkTerrShift = attackerTerrainShift(srcGroup);
    if (atkTerrShift) { breakdown.push({ label: '攻撃側地形シフト', value: atkTerrShift }); col += atkTerrShift; }

    if (global.state?.scenario?.jungleMode) {
      breakdown.push({ label: 'ジャングル 左1', value: -1 });
      col -= 1;
    }
    const defTerrShift = defenderTerrainShift(tgtGroup);
    if (defTerrShift) { breakdown.push({ label: '防御側地形シフト', value: defTerrShift }); col += defTerrShift; }

    const pinned = vehicle ? 0 : pinnedCount(tgtGroup);
    if (pinned) { breakdown.push({ label: 'ピン状態防御兵', value: -pinned }); col -= pinned; }

    if (isMoving(srcGroup)) { breakdown.push({ label: '攻撃側移動中', value: 2 }); col += 2; }
    const defenders = aliveCards(tgtGroup);
    if (isMoving(tgtGroup) || (defenders.length && defenders.every(card => card.transfer))) {
      breakdown.push({ label: '防御側移動中', value: 2 });
      col += 2;
    }
    // §20.39 攻撃側グループがすでに敵に侵入されている
    const _srcInfiltrated = opts.srcAlreadyInfiltrated != null ? opts.srcAlreadyInfiltrated : isInfiltratedByEnemy(srcGroup);
    if (_srcInfiltrated) { breakdown.push({ label: '攻撃側が侵入を受けている', value: 2 }); col += 2; }
    if (opts.srcFacKey === 'jpn') { breakdown.push({ label: '日本軍 左1', value: -1 }); col -= 1; }

    const sSmoke = smokeCount(srcGroup);
    if (sSmoke) { breakdown.push({ label: `攻撃側煙幕×${sSmoke}`, value: -sSmoke * 2 }); col -= sSmoke * 2; }

    const tSmoke = smokeCount(tgtGroup);
    if (tSmoke) { breakdown.push({ label: `防御側煙幕×${tSmoke}`, value: -tSmoke * 2 }); col -= tSmoke * 2; }

    if (opts.night) { breakdown.push({ label: '夜間', value: -3 }); col -= 3; }
    if (opts.concealValue) { breakdown.push({ label: '隠蔽', value: -opts.concealValue }); col -= opts.concealValue; }

    const final = Math.max(1, Math.min(10, col));
    if (final !== col) breakdown.push({ label: 'クランプ(1-10)', value: final - col });
    return { column: final, breakdown, raw: col };
  }

  /**
   * §20.21 モラルチェック
   * @returns {{ pass:boolean, rnc:number, rncColor:string }}
   */
  function checkInfiltrationMorale(soldierDef, rncCard, card, group) {
    const rnc = parseInt(rncCard.terrain.range, 10) || 0;
    const modifier = card && group
      ? global.commissarModOf(group, card) - R().weaponMoralePenalty(card, soldierDef)
      : 0;
    const morale = (parseInt(soldierDef.morale, 10) || 0) + modifier;
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
    const pinnedReal = R().isPinned(card);
    if (soldierDef.isInfantryGun) {
      return (parseInt(soldierDef.morale,10) || 0) - (pinnedReal ? 4 : 0);
    }
    // §33.5 負傷兵: 良好な状態の間は「ピン時の CCV」、ピン状態の間は「ピン時かつ非武装時の CCV」
    const wounded = R().isWoundActive && R().isWoundActive(card);
    const pinned = pinnedReal || wounded;
    // カードの印刷値（キャンペーンで上がった値があればそれ: lookupSoldier が反映）
    const p = parseCCV(pinned ? soldierDef.ccvBack : soldierDef.ccvFront);
    if (wounded && pinnedReal) {
      let wccv = p.unarmed;
      if (card.prisoners && card.prisoners.length) wccv = Math.floor(wccv / 2); // §32.21
      return wccv;
    }
    // 助手かどうか（§20.61 助手の兵器値は常に0）
    let isAsst = false;
    const g = opts.group;
    if (g && g.crewPairs && card.num != null) isAsst = Object.values(g.crewPairs).some(v => Number(v) === card.num);
    let ccv;
    if (card.destroyed || (soldierDef.weaponCat === '非武装' && card.acquiredWeapon)) {
      // 兵器を失った: 印刷の非武装時の値（斜線のあと）
      ccv = p.unarmed;
    } else if (card.acquiredWeapon || isAsst) {
      // §20.6 兵器を変えた・助手: モラル値＋兵器値（ピン状態は -4）。キャンペーンで上がった分も足す
      const morale = parseInt(soldierDef.morale, 10) || 0;
      const faction = card.acquiredWeapon?.fac ?? opts.faction ?? g?._faction ??
        (/^Jap[ _]/.test(card.id) ? 'jpn' : null);
      const weaponValue = isAsst ? 0 : getWeaponValue(soldierDef.weaponCat, faction);
      ccv = morale + weaponValue + (card._ccvDelta || 0);
      if (pinned) ccv -= 4;
    } else {
      ccv = p.armed;
    }
    // §20.6 兵器故障中: -1
    if (card.malfunctioned || opts.weaponMalfunction) ccv -= 1;
    // §32.21 監視役（捕虜を監視している兵）は CCV が半分（端数切り捨て）
    if (card.prisoners && card.prisoners.length) ccv = Math.floor(ccv / 2);
    return ccv;
  }

  /** クルーの相棒（持ち主⇔助手） */
  function crewPartnerOf(group, card) {
    if (!group || !group.crewPairs || card.num == null) return null;
    const cp = group.crewPairs;
    if (cp[card.num] != null) return group.cards.find(c => c.num === Number(cp[card.num])) || null;
    const owner = Object.keys(cp).find(o => Number(cp[o]) === card.num);
    return owner != null ? (group.cards.find(c => c.num === Number(owner)) || null) : null;
  }

  /** §20.74: 白兵戦で選べる捕獲は1兵器。残った兵器は地形に置く。 */
  function ccCaptureOrRemove(winner, winnerSide, winnerFac, loser, loserFac) {
    loser._weaponHandled = true;
    if (winnerSide !== 'player') return;
    const wd = R().lookupSoldier(winner, winnerFac);
    if ((wd?.needsCrew && !winner.destroyed) || wd?.isInfantryGun || wd?.infantryGun || wd?.afv) return;
    const group = global.state.groups[winnerSide]?.find(candidate => candidate.cards.includes(winner));
    if (!group) return;

    const weapon = global.weaponOfCard(loser, loserFac);
    const primary = weapon && !R().isArtillery(weapon.weaponCat) && !/対戦車砲|歩兵砲/.test(weapon.weaponCat) ?
      weapon : null;
    const secondary = global.secondaryWeaponOn(loser, loserFac);
    const options = [];
    if (primary) options.push({ kind: 'primary', label: primary.weaponName || primary.weaponCat });
    if (secondary && global.secondaryWeaponEligible(winner, winnerFac)) {
      options.push({ kind: 'secondary', label: global.secondaryWeaponLabel(secondary.kind) });
    }
    if (!options.length) return;
    const name = wd?.name || winner.id;
    const choice = options.length === 1 ?
      (confirm(`§20.74 ${name} が「${options[0].label}」を捕獲しますか？（キャンセルで除去）`) ? options[0] : null) :
      options[Number(prompt([`§20.74 ${name} が捕獲する兵器を選んでください。0で除去。`,
        ...options.map((option, index) => `${index + 1}: ${option.label}`)].join('\n'), '0')) - 1];
    if (!choice) return;

    const loserSide = global._sideOfCard(loser);
    const where = loser.infiltrating ?
      global.state.groups[loser.infiltratedGroupSide]?.[loser.infiltratedGroupIdx] :
      (global.state.groups[loserSide] || []).find(candidate => candidate.cards.includes(loser));
    const canLeaveEquipment = where && !R().isInMarsh(where) && !R().isInStream(where);
    if (choice.kind === 'primary') {
      global.capturePrimaryWeapon(group, winner, primary);
      if (canLeaveEquipment && secondary) {
        (where.weaponPool ||= []).push(global.secondaryWeaponToken(secondary, loser, loserFac, loserSide));
      }
    } else {
      global.setSecondaryWeapon(winner, secondary);
      if (canLeaveEquipment && primary) {
        (where.weaponPool ||= []).push({ ...primary, fromNum: loser.num, fromSide: loserSide });
      }
    }
  }

  /** §20.52/§20.62/§20.7 CC の解決（プレイヤー・AI 共通）
   *  - 攻撃側ごとに RPC で相手を決める
   *  - §20.621 隠ぺい: 攻撃側・防御側とも 1回の CC に 1枚、相手の兵士1人の CCV を下げる
   *  - §20.622/§20.72 余分な（ピン状態でない）兵士1人につき +3。攻撃するのは1名ずつ
   *  - §20.71 防御側がクルーなら、直接攻撃されていない相棒も加わる（攻撃側は勝てば続けて相棒と戦う）
   *  - §20.73 最後の相手を3以上の差で破った時だけ侵入状態を保つ
   *  - §20.74 勝った兵士は倒した兵士の兵器を捕獲か除去。§20.742 相打ちなら兵器は侵入されたグループに残る */
  async function resolveCCBattles(ctx) {
    return await global.withDeckAttack(() => resolveCCBattlesInProgress(ctx)) || [];
  }

  function assignCloseCombatTargets(participants, target, drawFn) {
    const defMap = new Map(); // 防御側 card → [攻撃側 card]
    for (const card of participants) {
      const rpc = drawFn();
      if (!rpc) break;
      const defender = determineCCTarget(rpc, target)?.card;
      if (!defender) continue;
      if (!defMap.has(defender)) defMap.set(defender, []);
      defMap.get(defender).push(card);
    }
    return defMap;
  }

  function useSingleConcealedCard(side, question) {
    if (side === 'ai') return Math.abs(global.getConcealMod(global.aiUseConcealment(), side));
    const hand = global.state.playerHand;
    const choices = hand.map(card => ({ card, face: global.handActionFace(card, 'CONCEALED', side) }))
      .filter(entry => entry.face);
    if (!choices.length) return 0;
    const labels = choices.map(({ face }, index) => `${index + 1}. ${face.modifier || face.type}`);
    const choice = choices[Number(prompt([question, ...labels].join('\n'), '0')) - 1];
    if (!choice) return 0;
    global.useHandActionFace(choice.card, choice.face);
    const modifier = Math.abs(global.getConcealMod([choice.card], side));
    global.pushTerrainToDiscard(hand.splice(hand.indexOf(choice.card), 1)[0]);
    return modifier;
  }

  function closeCombatConcealment(side, name) {
    return useSingleConcealedCard(side, global.radioText(
      `${name} のCCVを下げる隠ぺいカードを選んでください。0で使いません。`,
      `Choose a Concealed card to reduce ${name}'s close combat value. Enter 0 to decline.`));
  }

  async function resolveCCBattlesInProgress(ctx) {
    const { srcGroup, srcSide, srcFacKey, tgtGroup, tgtSide, tgtIdx, tgtFacKey, participants, drawFn } = ctx;
    const st = global.state || {};
    const alive = c => R().isAlive(c);
    const nameOf = (c, fk) => { const d = R().lookupSoldier(c, fk); return d ? d.name : c.id; };
    const defMap = ctx.assignments || assignCloseCombatTargets(participants, tgtGroup, drawFn);
    // §27.2 白兵戦に入った兵器は捕捉を失う。
    global.loseAcquisitionForCards([...defMap.keys(), ...[...defMap.values()].flat()]);

    const chooseLead = (attackers, start) => {
      const remaining = attackers.slice(start).filter(alive);
      if (remaining.length < 2 || srcSide !== 'player') return;
      const question = global.radioText('先に白兵戦を行う兵士を選んでください。', 'Choose who attacks first.');
      const names = remaining.map((card, index) => `${index + 1}. ${nameOf(card, srcFacKey)}`);
      const selected = remaining[(Number(prompt([question, ...names].join('\n'), '1')) || 1) - 1];
      if (selected) attackers.splice(start, 0, attackers.splice(attackers.indexOf(selected), 1)[0]);
    };

    const battles = [];
    const atkFlag = (srcSide === 'player' ? (st.player && st.player.flag) : (st.ai && st.ai.flag)) || '';
    const defFlag = (tgtSide === 'player' ? (st.player && st.player.flag) : (st.ai && st.ai.flag)) || '';
    for (const [primary, atkList] of defMap) {
      if (!alive(primary)) continue;
      const defs = [primary];
      const partner = crewPartnerOf(tgtGroup, primary);
      if (partner && alive(partner) && !defMap.has(partner)) defs.push(partner); // §20.71
      let ai = 0, di = 0;
      chooseLead(atkList, ai);
      const lastDiff = new Map();
      while (ai < atkList.length && di < defs.length) {
        const a = atkList[ai], d = defs[di];
        if (!alive(a)) { ai++; continue; }
        if (!alive(d)) { di++; continue; }
        const aDef = R().lookupSoldier(a, srcFacKey), dDef = R().lookupSoldier(d, tgtFacKey);
        if (!aDef || !dDef) break;
        // §33.5 負傷兵は追加の兵としての +3 を加えない
        const aBonus = atkList.slice(ai + 1).filter(x => alive(x) && !R().isPinned(x) && !R().isWoundActive(x)).length * 3;
        const otherGunCrew = dDef.isInfantryGun && !R().isPinned(d) ? Math.max(0, 2 - (d._infantryGunCrewLost || 0)) : 0;
        const otherDefenders = defs.filter((x, k) => k !== di && alive(x) && !R().isPinned(x) && !R().isWoundActive(x)).length;
        const dBonus = (otherDefenders + otherGunCrew) * 3;
        // §20.621 この組み合わせに使える隠ぺいは、両軍それぞれ1枚。
        const concealAllowed = !global.ignoresConcealment(d, tgtSide);
        const aCon = concealAllowed && global.canUseConcealment(tgtGroup) ? closeCombatConcealment(tgtSide, aDef.name) : 0;
        const dCon = concealAllowed && global.canUseConcealment(srcGroup) ? closeCombatConcealment(srcSide, dDef.name) : 0;
        let atkCCV = getCCV(a, aDef, { group: srcGroup, faction: srcFacKey }) + aBonus - aCon - (ctx.attackerPenalty || 0);
        let defCCV = getCCV(d, dDef, { group: tgtGroup }) + dBonus - dCon;
        // §32.11 捕虜を取る宣言とCCV−2は、この白兵戦の対戦相手にだけ適用する。
        const takePrisoner = !infantryGunProfile(d, tgtSide) && !global.AFV?.isAfvCard(d) &&
          global.guardCandidates(srcGroup, srcSide).length > 0 && (srcSide === 'player'
            ? confirm(global.radioText(`${dDef.name} を捕虜にしますか？ この白兵戦でCCVが2下がります。`,
                `Try to take ${dDef.name} prisoner at a cost of 2 close combat value?`))
            : atkCCV - 2 >= defCCV + 1);
        const defenderTakesPrisoner = !global.infantryGunProfile(a, srcSide) && !global.AFV?.isAfvCard(a) &&
          !global.infantryGunProfile(d, tgtSide) && global.guardCandidates(tgtGroup, tgtSide).length > 0 &&
          (tgtSide === 'player'
            ? confirm(global.radioText(`${aDef.name} を捕虜にしますか？ 防御側のCCVが2下がります。`,
                `Try to take ${aDef.name} prisoner? The defender’s close combat value is reduced by 2.`))
            : defCCV - 2 >= atkCCV + 1);
        if (takePrisoner) atkCCV -= 2;
        if (defenderTakesPrisoner) defCCV -= 2;
        // §33.5 ピン状態かつ非武装の負傷兵が単独で防御する白兵戦は自動的に敗北
        const dAloneUnarmedWounded = R().isWoundActive(d) && R().isPinned(d)
          && (d.destroyed || dDef.weaponCat === '非武装')
          && defs.filter(x => alive(x)).length === 1;
        let combat;
        if (dAloneUnarmedWounded) {
          combat = { result: 'DEF_KIA', atkTotal: atkCCV, defTotal: defCCV, diff: 99,
                     atkRnc: 0, defRnc: 0, atkRncColor: '自動', defRncColor: '自動' };
        } else {
          const atkRncCard = drawFn(srcSide);
          const defRncCard = drawFn(tgtSide);
          if (!atkRncCard || !defRncCard) break;
          combat = resolveCCCombat(atkCCV, defCCV, atkRncCard, defRncCard);
        }
        battles.push({
          atkName: `${atkFlag ? atkFlag + ' ' : ''}#${a.num} ${aDef.name}`,
          defName: `${defFlag ? defFlag + ' ' : ''}#${d.num} ${dDef.name}`,
          atkCCV, defCCV,
          atkRnc: combat.atkRnc, defRnc: combat.defRnc,
          atkRncColor: combat.atkRncColor, defRncColor: combat.defRncColor,
          atkTotal: combat.atkTotal, defTotal: combat.defTotal,
          atkBonus: aBonus, defBonus: dBonus, concealMod: aCon + dCon,
          result: combat.result,
        });
        if (combat.result === 'DEF_KIA' && takePrisoner && global.capturePrisoner(d, tgtSide, srcGroup, srcSide)) {
          // §32.11 敗れた兵は捕虜になる。捕虜を取った兵は潜入状態を失う
          battles.at(-1).defName += '（捕虜）';
          battles.at(-1).captured = true;
          ccCaptureOrRemove(a, srcSide, srcFacKey, d, tgtFacKey);
          a._tookPrisoner = true;
          lastDiff.set(a, combat.diff);
          di++;
        } else if (combat.result === 'DEF_KIA') {
          if (loseInfantryGunCrew(d,tgtSide)) {
            battles.at(-1).defName += '（歩兵砲の乗員損失）';
            lastDiff.set(a,combat.diff);
            continue;
          }
          R().killSoldier(d);
          a.ccKills = (a.ccKills || 0) + 1; // §42.43
          ccCaptureOrRemove(a, srcSide, srcFacKey, d, tgtFacKey);
          lastDiff.set(a, combat.diff);
          di++; // §20.71 相棒がいれば続けて戦う
        } else if (combat.result === 'ATK_KIA') {
          if (defenderTakesPrisoner && global.capturePrisoner(a, srcSide, tgtGroup, tgtSide)) {
            battles.at(-1).atkName += '（捕虜）';
            battles.at(-1).captured = true;
            clearSoldierInfiltration(d);
          } else {
            R().killSoldier(a);
          }
          ccCaptureOrRemove(d, tgtSide, tgtFacKey, a, srcFacKey);
          clearSoldierInfiltration(a);
          ai++; // §20.72 次の攻撃側
          chooseLead(atkList, ai);
        } else { // BOTH_KIA §20.742 兵器は侵入されたグループに残る
          a._dropSide = tgtSide; a._dropIdx = tgtIdx;
          if (loseInfantryGunCrew(d,tgtSide)) battles.at(-1).defName += '（歩兵砲の乗員損失）';
          else { R().killSoldier(d); di++; }
          R().killSoldier(a);
          clearSoldierInfiltration(a);
          ai++;
          chooseLead(atkList, ai);
        }
      }
      // §20.73 最後の相手を3以上の差で破った攻撃側だけ侵入状態を保つ
      for (const [a, diff] of lastDiff) {
        const tookPrisoner = !!a._tookPrisoner; delete a._tookPrisoner;
        if (!alive(a)) continue;
        if (tookPrisoner) { clearSoldierInfiltration(a); continue; } // §32.11 捕虜を取った兵は潜入状態を失う
        if (!ctx.banzai && diff >= 3) { a.infiltrating = true; a.infiltratedGroupSide = tgtSide; a.infiltratedGroupIdx = tgtIdx; }
        else clearSoldierInfiltration(a);
      }
    }
    return battles;
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
    const card = global.pickByRPC(rpcCard, defGroup);
    if (!card) return null;
    const position = defGroup.cards.filter(R().isAlive).indexOf(card) + 1;
    return { position, card, cardIdx: defGroup.cards.indexOf(card) };
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
  function showInfiltrationSetupModal(srcGroup, targets, srcFacKey) {
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();

      const multiple = targets.length > 1;
      const tgtGroup = targets[0].group;
      const mustFord = R().isInStream(srcGroup) && !R().hasCrossedStream(srcGroup);
      // タイトル
      const title = el('div', TITLE_STYLE, multiple ? `侵入 — ${srcGroup.name}` : `侵入 — ${srcGroup.name} → 敵${tgtGroup.name}`);
      frag.appendChild(title);

      // コラム情報
      const baseCol = aliveCards(tgtGroup).length;
      const _isNight = !!(global.state && global.state.isNight);
      const _sFlared = Boolean(global.isGroupFlared?.(tgtGroup)); // §38.6 潜入される側が照らされているか
      const col = calcInfiltrationColumn(tgtGroup, srcGroup, { srcFacKey, night: _isNight && !_sFlared });
      const info = el('div', { color:'#ccc', fontSize:'13px', marginBottom:'12px' },
        `防御兵数: ${baseCol} | 最終コラム: ${col}`);
      if (!multiple) frag.appendChild(info);

      // 移動カード数
      const moveCards = movementCardsFor('player');
      const moveInfo = el('div', { color:'#aaa', fontSize:'12px', marginBottom:'10px' },
        `手札の移動カード: ${moveCards.length}枚`);
      frag.appendChild(moveInfo);

      // 兵士リスト（テーブル形式）
      const alive = aliveCards(srcGroup);
      const selections = [];
      const listTable = document.createElement('table');
      listTable.style.cssText = 'width:100%; border-collapse:collapse; margin-bottom:16px;';
      const thead = el('tr', { background:'#444' });
      const columns = multiple ? ['', '兵士', '目標', '士気', '爆薬', '方法'] : ['', '兵士', '士気', '爆薬', '方法'];
      columns.forEach(h => {
        const th = el('th', { padding:'4px 6px', textAlign:'center', borderBottom:'1px solid #666', fontSize:'11px', color:'#aaa' }, h);
        thead.appendChild(th);
      });
      listTable.appendChild(thead);

      let defaultMovers = 0;
      alive.forEach(card => {
        const def = R().lookupSoldier(card, srcFacKey);
        if (!def) return;
        const isPinned = R().isPinned(card);
        const morale = parseInt(def.morale, 10) || 0;

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #555';
        const available = targets.filter(({ group }) => !global.AFV?.isAfvGroup(group) ||
          global.AFV.canAttackVehicleInCloseCombat(card, 'player'));
        const entry = { card, target: available[0], soldierDef: def, selected: false, useMove: mustFord };
        selections.push(entry);

        if (isPinned || card.infiltrating || !available.length || cannotInfiltrate(card, srcFacKey)) {
          tr.style.opacity = '0.4';
          const td = el('td', { padding:'4px 6px', color:'#f88', fontSize:'13px' }, `✕ #${card.num} ${def.name} (${isPinned ? 'ピン状態' : isGuard(card) ? '監視役 §32.21' : card.infiltrating ? '侵入中' : !available.length ? '対車両白兵戦に参加不可' : '侵入不可'})`);
          td.colSpan = columns.length;
          tr.appendChild(td);
        } else {
          // チェックボックス（デフォルトON）
          const tdCb = el('td', { padding:'4px 6px', textAlign:'center' });
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = available.includes(targets[0]) && (!mustFord || defaultMovers < moveCards.length);
          entry.selected = cb.checked;
          if (mustFord && cb.checked) defaultMovers++;
          cb.onchange = () => { entry.selected = cb.checked; updateMoveCount(); };
          tdCb.appendChild(cb);
          tr.appendChild(tdCb);

          // 兵士情報
          tr.appendChild(el('td', { padding:'4px 6px', color:'#eee', fontSize:'13px' }, `#${card.num} ${def.name}`));

          if (multiple) {
            const targetCell = el('td', { padding:'4px 6px', textAlign:'center' });
            const select = document.createElement('select');
            select.setAttribute('aria-label', `${def.name} の侵入先`);
            available.forEach((target, index) => {
              const option = document.createElement('option');
              option.value = String(index);
              option.textContent = `GROUP ${target.group.name}`;
              select.appendChild(option);
            });
            select.onchange = () => { entry.target = available[Number(select.value)]; };
            targetCell.appendChild(select);
            tr.appendChild(targetCell);
          }

          // 士気
          tr.appendChild(el('td', { padding:'4px 6px', color:'#adf', fontSize:'13px', textAlign:'center' }, String(morale)));

          // 爆薬
          const tdDemo = el('td', { padding:'4px 6px', textAlign:'center', fontSize:'14px' }, card.demoCharge ? '💣' : '');
          if (card.demoCharge) tdDemo.style.color = '#f66';
          tr.appendChild(tdDemo);

          // 方法
          const tdMethod = document.createElement('td');
          tdMethod.style.cssText = 'padding:4px 6px; text-align:center;';
          const radioName = `inf_method_${card.id}`;
          const lblMorale = el('label', { color:'#ccc', fontSize:'12px', cursor:'pointer', marginRight:'8px' });
          const rMorale = document.createElement('input');
          rMorale.type = 'radio'; rMorale.name = radioName; rMorale.checked = !mustFord; rMorale.disabled = mustFord;
          rMorale.onchange = () => { entry.useMove = false; updateMoveCount(); };
          lblMorale.appendChild(rMorale);
          lblMorale.appendChild(document.createTextNode('モラル'));
          tdMethod.appendChild(lblMorale);

          const lblMove = el('label', { color:'#ccc', fontSize:'12px', cursor:'pointer' });
          const rMove = document.createElement('input');
          rMove.type = 'radio'; rMove.name = radioName; rMove.checked = mustFord;
          rMove.onchange = () => { entry.useMove = true; updateMoveCount(); };
          lblMove.appendChild(rMove);
          lblMove.appendChild(document.createTextNode('移動'));
          tdMethod.appendChild(lblMove);

          tr.appendChild(tdMethod);
        }
        listTable.appendChild(tr);
      });
      frag.appendChild(listTable);

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
   * モラルチェック結果オーバーレイ
   */
  function showMoralCheckOverlay(title, results) {
    if (global.__HEADLESS) return Promise.resolve(); // 画面なし対戦（sim）では待たない
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();
      frag.appendChild(el('div', TITLE_STYLE, title));

      const table = document.createElement('table');
      table.style.cssText = 'width:100%; border-collapse:collapse; font-size:13px; color:#eee;';
      const thead = el('tr', { background:'#555' });
      ['兵士','方法','士気','RNC','結果'].forEach(h => {
        const th = el('th', { padding:'4px 6px', textAlign:'center', borderBottom:'1px solid #777' }, h);
        thead.appendChild(th);
      });
      table.appendChild(thead);

      let passCount = 0;
      results.forEach(r => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #444';
        const cells = [];
        cells.push(r.name);
        cells.push(r.method);
        cells.push(r.morale != null ? String(r.morale) : '--');
        if (r.exempted) cells.push('--');
        else if (r.rnc != null) cells.push(`${r.rncColor}${Math.abs(r.rnc)}`);
        else cells.push('--');
        let resText, resColor;
        if (r.exempted) { resText = '免除(移動)'; resColor = '#6cf'; passCount++; }
        else if (r.passed) { resText = '通過'; resColor = '#4f4'; passCount++; }
        else if (r.pinned) { resText = 'ピン'; resColor = '#fd0'; }
        else { resText = 'NG'; resColor = '#f88'; }
        cells.push(resText);
        cells.forEach((text, ci) => {
          const td = el('td', { padding:'4px 6px', textAlign:'center' }, text);
          if (ci === cells.length - 1) td.style.color = resColor;
          if (ci === 3 && r.rncColor === '赤') td.style.color = '#f66';
          if (ci === 3 && r.rncColor === '黒') td.style.color = '#6cf';
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      frag.appendChild(table);

      const summary = el('div', { marginTop:'12px', fontSize:'14px', color:'#ffeb3b' },
        `モラル通過: ${passCount}名 / 全${results.length}名`);
      frag.appendChild(summary);

      const btnRow = el('div', { display:'flex', justifyContent:'flex-end', marginTop:'16px' });
      const btn = el('button', BTN_PRIMARY, 'OK');
      btn.onclick = () => { removeOverlay(overlay); resolve(); };
      btnRow.appendChild(btn);
      frag.appendChild(btnRow);

      const overlay = showOverlay(frag);
    });
  }

  /**
   * 侵入結果オーバーレイ（内訳付き）
   * @returns {Promise<void>}
   */
  function showInfiltrationResultOverlay(title, results) {
    try { if (typeof global.ufEvent === 'function') { const ok = (results || []).filter(r => r.infiltrated).length, ng = (results || []).length - ok;
      global.ufEvent(global.state && global.state.currentTurn, `侵入（${String(title).replace(/^.*?—\s*/, '')}）→ 成功${ok}・失敗${ng}`); } } catch (e) {}
    if (global.__HEADLESS) return Promise.resolve(); // 画面なし対戦（sim）では待たない
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();
      frag.appendChild(el('div', TITLE_STYLE, title));

      // テーブル: 兵士、コラム計算内訳、最終列、RPC、結果
      const table = document.createElement('table');
      table.style.cssText = 'width:100%; border-collapse:collapse; font-size:13px; color:#eee;';
      const thead = el('tr', { background:'#555' });
      ['兵士','コラム内訳','最終列','RPC','結果'].forEach(h => {
        const th = el('th', { padding:'4px 6px', textAlign:'center', borderBottom:'1px solid #777' }, h);
        thead.appendChild(th);
      });
      table.appendChild(thead);

      let successCount = 0;
      results.forEach(r => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #444';
        const cells = [];
        cells.push(r.name);
        // 内訳をテキスト化
        let bdText = '--';
        if (r.breakdown && r.breakdown.length) {
          bdText = r.breakdown.map(b => `${b.label}${b.value>=0?'+':''}${b.value}`).join(' / ');
        }
        cells.push(bdText);
        cells.push(r.column != null ? String(r.column) : '--');
        // RPC
        if (r.rpcColor != null && r.rpcValue != null) cells.push(`${r.rpcColor}${r.rpcValue}`);
        else cells.push('--');
        // 結果
        let resText, resColor;
        if (r.infiltrated) { resText = '侵入成功'; resColor = '#4f4'; successCount++; }
        else { resText = '失敗'; resColor = '#f88'; }
        cells.push(resText);

        cells.forEach((text, ci) => {
          const td = el('td', { padding:'4px 6px', textAlign:ci === 1 ? 'left' : 'center' }, text);
          if (ci === 1) td.style.fontSize = '11px';
          if (ci === cells.length - 1) td.style.color = resColor;
          if (ci === 3 && r.rpcColor === '赤') td.style.color = '#f66';
          if (ci === 3 && r.rpcColor === '黒') td.style.color = '#6cf';
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      frag.appendChild(table);

      // サマリー
      const summary = el('div', { marginTop:'12px', fontSize:'14px', color:'#ffeb3b' },
        `侵入成功: ${successCount}名 / 判定${results.length}名`);
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
  function showCCSetupModal(srcGroup, targets, infiltrators, srcFacKey) {
    return new Promise(resolve => {
      const frag = document.createDocumentFragment();
      const multiple = targets.length > 1;
      const title = multiple ? `白兵戦 — ${srcGroup.name}` : `白兵戦 — ${srcGroup.name} → 敵${targets[0].group.name}`;
      frag.appendChild(el('div', TITLE_STYLE, title));

      // 侵入兵リスト
      const moveCards = movementCardsFor('player');

      const listTable = document.createElement('table');
      listTable.style.cssText = 'width:100%; border-collapse:collapse; margin-bottom:12px;';
      const thead = el('tr', { background:'#444' });
      const columns = multiple ? ['', '兵士', '目標', 'CCV', '方法'] : ['', '兵士', 'CCV', '方法'];
      columns.forEach(h => {
        const th = el('th', { padding:'4px 6px', textAlign:'center', borderBottom:'1px solid #666', fontSize:'11px', color:'#aaa' }, h);
        thead.appendChild(th);
      });
      listTable.appendChild(thead);
      const entries = [];

      infiltrators.forEach(inf => {
        const def = R().lookupSoldier(inf.card, srcFacKey);
        if (!def) return;
        const ccv = getCCV(inf.card, def, {});

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #555';
        const entry = { ...inf, soldierDef: def, ccv, selected: true, useMove: false };
        entries.push(entry);

        // チェックボックス（デフォルトON）
        const tdCb = el('td', { padding:'4px 6px', textAlign:'center' });
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = true;
        cb.onchange = () => { entry.selected = cb.checked; };
        tdCb.appendChild(cb);
        tr.appendChild(tdCb);

        // 兵士
        tr.appendChild(el('td', { padding:'4px 6px', color:'#eee', fontSize:'13px' }, `#${inf.card.num} ${def.name}`));

        if (multiple) tr.appendChild(el('td', { padding:'4px 6px', textAlign:'center' }, `GROUP ${inf.target.group.name}`));

        // CCV
        tr.appendChild(el('td', { padding:'4px 6px', color:'#fa6', fontSize:'13px', textAlign:'center' }, String(ccv)));

        // 方法
        const tdMethod = document.createElement('td');
        tdMethod.style.cssText = 'padding:4px 6px; text-align:center;';
        const radioName = `cc_method_${inf.card.id}`;
        const lblMorale = el('label', { color:'#ccc', fontSize:'12px', cursor:'pointer', marginRight:'8px' });
        const rMorale = document.createElement('input');
        rMorale.type = 'radio'; rMorale.name = radioName; rMorale.checked = true;
        rMorale.onchange = () => { entry.useMove = false; };
        lblMorale.appendChild(rMorale);
        lblMorale.appendChild(document.createTextNode('モラル'));
        tdMethod.appendChild(lblMorale);

        const lblMove = el('label', { color:'#ccc', fontSize:'12px', cursor:'pointer' });
        const rMove = document.createElement('input');
        rMove.type = 'radio'; rMove.name = radioName;
        rMove.onchange = () => { entry.useMove = true; };
        lblMove.appendChild(rMove);
        lblMove.appendChild(document.createTextNode('移動'));
        tdMethod.appendChild(lblMove);
        tr.appendChild(tdMethod);

        listTable.appendChild(tr);
      });
      frag.appendChild(listTable);

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
        resolve({ participants: selected, cancelled: false });
      };
      btnCancel.onclick = () => {
        removeOverlay(overlay);
        resolve({ participants: [], cancelled: true });
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
    try { if (typeof global.ufReportLog === 'function') global.ufReportLog('cc', title + ' → ' + (battles || []).map(b => `${b.atkName} 対 ${b.defName}: ${b.result}`).join('、')); } catch (e) {}
    try { if (typeof global.ufEvent === 'function') { const w = (battles || []).filter(b => b.result === 'DEF_KIA').length, l = (battles || []).filter(b => b.result === 'ATK_KIA').length, d = (battles || []).filter(b => b.result === 'BOTH_KIA').length;
      global.ufEvent(global.state && global.state.currentTurn, `白兵戦（${String(title).replace(/^.*?—\s*/, '')}）→ 攻撃側の勝ち${w}・負け${l}${d ? '・相打ち' + d : ''}`); } } catch (e) {}
    if (global.__HEADLESS) return Promise.resolve(); // 画面なし対戦（sim）では待たない
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
        if (b.result === 'DEF_KIA')  { resText = `${b.defName}${b.captured ? '' : ' KIA'}`; resColor = '#4f4'; }
        else if (b.result === 'ATK_KIA')  { resText = `${b.atkName}${b.captured ? '' : ' KIA'}`; resColor = '#f44'; }
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
  async function executeInfiltration(srcGroup, tgtGroup, tgtSide, tgtIdx, drawFn, srcFacKey, { singleTarget = false } = {}) {
    const st = global.state;
    const visible = (group, index) => canAttemptInfiltration(srcGroup, group, 'player').ok &&
      global.isTargetVisibleForPlayer(srcGroup, index, tgtSide);
    if (!visible(tgtGroup, tgtIdx)) return { ok: false, results: [], actionUsed: false };
    const targets = [{ group: tgtGroup, side: tgtSide, index: tgtIdx }];
    if (!singleTarget) {
      st.groups[tgtSide].forEach((group, index) => {
        if (index !== tgtIdx && visible(group, index)) targets.push({ group, side: tgtSide, index });
      });
    }
    const setup = await showInfiltrationSetupModal(srcGroup, targets, srcFacKey);
    if (setup.cancelled) return { ok: false, results: [], actionUsed: false };

    const vehicleTarget = setup.soldiers.some(sel => global.AFV?.isAfvGroup(sel.target.group));
    for (const sel of setup.soldiers) {
      const primary = global.weaponOfCard(sel.card, srcFacKey);
      const secondary = global.secondaryWeaponOn(sel.card, srcFacKey);
      const name = sel.soldierDef.name;
      if (primary?.weaponCat.startsWith('火炎放射器')) {
        sel.leaveFlamethrower = confirm(global.radioText(
          `${name} は火炎放射器を置いて潜入しますか？（§20.23）`,
          `Leave ${name}'s flamethrower behind during infiltration?`));
      }
      if (secondary) {
        const label = global.secondaryWeaponLabel(secondary.kind);
        sel.leaveSecondary = confirm(global.radioText(
          `${name} は${label}を置いて潜入しますか？（§20.23）`,
          `Leave ${name}'s ${label} behind during infiltration?`)) ? secondary : null;
      }
    }
    const carrier = setup.soldiers.find(sel => sel.card.demoCharge && !sel.leaveSecondary &&
      !global.AFV?.isAfvGroup(sel.target.group));
    const plannedCharge = carrier && confirm(global.radioText(
      `${carrier.soldierDef.name} が、この侵入で爆薬を仕掛けますか？ 成功したら同じ行動で爆薬攻撃を行います。`,
      `Place a demolition charge with ${carrier.soldierDef.name}? A successful infiltration will detonate it as part of this action.`
    )) ? carrier.card : null;

    const moveCards = movementCardsFor('player');

    // ステップ1: モラルチェック（移動カード使用者は免除）
    const moralResults = [];
    const passedSoldiers = [];
    for (const sel of setup.soldiers) {
      if (st.terrainDeck?.timeLimitReached) break;
      const def = sel.soldierDef;
      const morale = parseInt(def.morale, 10) || 0;
      const targetName = targets.length > 1 ? ` → GROUP ${sel.target.group.name}` : '';
      const entry = { name: `#${sel.card.num} ${def.name}${targetName}`, morale };
      sel.label = entry.name;
      breakCrewOf(srcGroup, sel.card); // §11.13 侵入を試みるとクルーは解かれる
      // §20.23 中機関銃・迫撃砲の兵士は兵器を手放す
      if (abandonHeavyWeapon(srcGroup, sel.card, srcFacKey, 'player')) entry.abandoned = true;
      if (sel.leaveFlamethrower) global.dropWeaponToPool(srcGroup, sel.card, srcFacKey, 'player');
      if (sel.leaveSecondary) {
        (srcGroup.weaponPool ||= []).push(global.secondaryWeaponToken(sel.leaveSecondary, sel.card, srcFacKey, 'player'));
        global.setSecondaryWeapon(sel.card, null);
      }
      // §20.24 未渡河の河川からは「移動」カードを使う形でしか侵入できない
      const _inStream = R().isInStream(srcGroup) && !R().hasCrossedStream(srcGroup);
      if (_inStream && !sel.useMove) {
        entry.method = '河川（移動カードが必要）';
        entry.passed = false;
        moralResults.push(entry);
        continue;
      }

      if (sel.useMove) {
        entry.method = '移動カード(免除)';
        entry.exempted = true;
        entry.passed = true;
        const mc = moveCards.shift();
        if (!spendMovementCard('player', mc)) {
          entry.passed = false;
          moralResults.push(entry);
          continue;
        }
        // §20.24 河川: 渡河カードなら成功。他の移動カードなら RNC を引き、黒なら渡河成功で同じカードを侵入の RPC に使う
        if (_inStream) {
          const isFord = !!(mc && mc.terrain && mc.terrain.sub === '渡河');
          if (!isFord) {
            const cr = drawFn(global.state?.currentTurn);
            const ok = !!cr && !(cr.terrain && cr.terrain.rncColor === '赤');
            entry.method = ok ? '移動カード・渡河成功（RNC黒）' : '移動カード・渡河失敗（RNC赤）';
            entry.passed = ok;
            if (ok) sel._rpcCard = cr;
          } else {
            entry.method = '渡河カード（渡河成功）';
          }
        }
      } else {
        entry.method = 'モラルチェック';
        // §10.43 ピン状態になってもヒーローで回復すれば、もう一度試みられる
        for (;;) {
          const rncCard = drawFn(global.state?.currentTurn);
          if (!rncCard) { entry.passed = false; break; }
          const currentDef = R().lookupSoldier(sel.card, srcFacKey);
          const check = checkInfiltrationMorale(currentDef, rncCard, sel.card, srcGroup);
          entry.rnc = check.rnc;
          entry.rncColor = check.rncColor;
          entry.morale = check.morale;
          entry.passed = check.pass;
          if (check.pass) { entry.pinned = false; break; }
          R().pinSoldier(sel.card);
          entry.pinned = true;
          if (!offerHeroRetry(sel.card, def, '侵入')) break;
          entry.method = 'モラルチェック（ヒーローで再試行）';
        }
      }
      moralResults.push(entry);
      if (entry.passed) passedSoldiers.push(sel);
    }

    const beforeCombat = { ok: true, results: moralResults, actionUsed: true };
    if (st.terrainDeck?.timeLimitReached || st.phase !== 'play') {
      global.settleDeckTimeLimit();
      return beforeCombat;
    }
    await showMoralCheckOverlay(`モラルチェック — ${srcGroup.name}`, moralResults);
    const resolve = () => resolvePlayerInfiltration(srcGroup, drawFn, srcFacKey, moralResults, passedSoldiers, plannedCharge);
    return (await (vehicleTarget ? global.withDeckAttack(resolve) : resolve())) || beforeCombat;
  }

  async function resolvePlayerInfiltration(srcGroup, drawFn, srcFacKey, moralResults, passedSoldiers, plannedCharge) {
    const infResults = [];
    const vehicles = new Set();
    let detonation = null;
    for (const sel of passedSoldiers) {
      const { group: tgtGroup, side: tgtSide, index: tgtIdx } = sel.target;
      const night = Boolean(global.state.isNight && !global.isGroupFlared(tgtGroup));
      // §9.4 侵入の援護には兵士1名につき隠ぺいカード1枚。
      const concealValue = useSingleConcealedCard('player', global.radioText(
        `${sel.soldierDef.name} の侵入を援護する隠ぺいカードを選んでください。0で使いません。`,
        `Choose a Concealed card to support ${sel.soldierDef.name}'s infiltration. Enter 0 to decline.`));
      const colDetail = calcInfiltrationColumnDetailed(tgtGroup, srcGroup, { srcFacKey, night, concealValue });
      const entry = {
        name: sel.label,
        column: colDetail.column,
        breakdown: colDetail.breakdown,
      };
      const rpcCard = sel._rpcCard || drawFn(); // §20.24 渡河の RNC を侵入の RPC に使う
      delete sel._rpcCard;
      if (!rpcCard) { entry.infiltrated = false; infResults.push(entry); continue; }
      const rpcResult = resolveInfiltrationRPC(rpcCard, colDetail.column);
      entry.rpcColor = rpcResult.color;
      entry.rpcValue = rpcResult.posValue;
      entry.infiltrated = rpcResult.success;

      if (rpcResult.success) {
        sel.card.infiltrating = true;
        sel.card.infiltratedGroupSide = tgtSide;
        sel.card.infiltratedGroupIdx = tgtIdx;
        sel.card.infiltratedThisTurn = true;
        if (global.AFV?.isAfvGroup(tgtGroup)) vehicles.add(tgtGroup);
        if (sel.card === plannedCharge) detonation = sel.target;
      }
      infResults.push(entry);
    }

    await showInfiltrationResultOverlay(`侵入チェック — ${srcGroup.name}`, infResults);
    for (const group of vehicles) await global.AFV.resolveVehicleCloseCombat(srcGroup, group, 'player');
    if (detonation && global.state.phase === 'play') {
      const { group, side, index } = detonation;
      const faction = group._faction || global.getFactionKey(global.state[side]);
      await executeDemoCharge(plannedCharge, srcGroup, 'player', group, side, index, drawFn, srcFacKey, faction);
    }

    // 互換のため統合結果も返す
    const results = moralResults.map(m => {
      const inf = infResults.find(i => i.name === m.name);
      return Object.assign({}, m, inf || {}, { moraleResult: m.passed });
    });
    return { ok: true, results, actionUsed: true };
  }

  /**
   * 白兵戦アクション実行
   * @returns {Promise<{ ok:boolean, battles:Array, actionUsed:boolean }>}
   */
  async function executeCC(srcGroup, srcGroupIdx, drawFn, srcFacKey) {
    const targets = closeCombatTargets(srcGroup);
    if (!targets.length) return { ok: false, battles: [], actionUsed: false };
    const entries = targets.flatMap(target => target.soldiers.map(card => ({ card, target })));
    const setup = await showCCSetupModal(srcGroup, targets, entries, srcFacKey);
    if (setup.cancelled) return { ok: false, battles: [], actionUsed: false };
    return await executeDeclaredCloseCombat(srcGroup, 'player', srcFacKey, setup.participants, drawFn);
  }

  function movementCardsFor(side) {
    return global.state[side + 'Hand'].filter(card => global.handActionFace(card, 'MOVEMENT', side));
  }

  function spendMovementCard(side, card) {
    const hand = global.state[side + 'Hand'];
    const index = hand.indexOf(card);
    if (index < 0 || !global.useHandActionFace(card, global.handActionFace(card, 'MOVEMENT', side))) return false;
    global.pushTerrainToDiscard(hand.splice(index, 1)[0]);
    if (side === 'ai') global.state.aiHandCount = hand.length;
    return true;
  }

  /** §20.52 各兵の参加方法と目標を確定し、全員の位置を引いてから白兵戦を解決する。 */
  async function executeDeclaredCloseCombat(srcGroup, side, faction, entries, drawFn) {
    const st = global.state;
    const moves = movementCardsFor(side);
    const participants = new Map();
    for (const { card, target, useMove } of entries) {
      if (st.terrainDeck?.timeLimitReached || st.phase !== 'play') break;
      const def = R().lookupSoldier(card, faction);
      if (!def || !R().isAlive(card) || R().isPinned(card)) continue;
      let entered = false;
      if (useMove) entered = spendMovementCard(side, moves.shift());
      else {
        for (;;) {
          const judge = drawFn(side);
          if (!judge) break;
          if (checkInfiltrationMorale(def, judge, card, srcGroup).pass) { entered = true; break; }
          R().pinSoldier(card);
          if (side === 'player' && offerHeroRetry(card, def, '白兵戦への参加')) continue;
          clearSoldierInfiltration(card);
          break;
        }
      }
      if (entered) {
        if (!participants.has(target)) participants.set(target, []);
        participants.get(target).push(card);
      }
    }
    if (st.terrainDeck?.timeLimitReached) global.settleDeckTimeLimit();
    const battles = st.phase === 'play' && await global.withDeckAttack(async () => {
      const assignments = [...participants].map(([target, soldiers]) => ({ target, soldiers,
        positions: assignCloseCombatTargets(soldiers, target.group, drawFn) }));
      const results = [];
      for (const { target, soldiers, positions } of assignments) {
        const outcomes = await resolveCCBattlesInProgress({ srcGroup, srcSide: side, srcFacKey: faction,
          tgtGroup: target.group, tgtIdx: target.index, tgtSide: target.side,
          tgtFacKey: target.group._faction || global.getFactionKey(st[target.side]),
          participants: soldiers, assignments: positions, drawFn });
        results.push(...outcomes);
      }
      return results;
    }) || [];
    if (battles.length) await showCCResultOverlay(`${side === 'ai' ? 'AI' : ''}白兵戦結果 — ${srcGroup.name}`, battles);
    return { ok: true, battles, actionUsed: true };
  }

  /**
   * §21 爆薬攻撃: 侵入したターンのみ1度だけ、射撃力8で目標グループを攻撃
   * 1枚目RNCが赤6なら爆薬故障(失われる)、攻撃はそこで中止
   */
  async function executeDemoCharge(attackerCard, srcGroup, srcSide, tgtGroup, tgtSide, tgtIdx, drawFn, atkFacKey, tgtFacKey) {
    return global.withDeckAttack(() => executeDemoChargeInProgress(attackerCard, srcGroup, srcSide, tgtGroup, tgtSide, tgtIdx, drawFn, atkFacKey, tgtFacKey));
  }

  async function executeDemoChargeInProgress(attackerCard, srcGroup, srcSide, tgtGroup, tgtSide, tgtIdx, drawFn, atkFacKey, tgtFacKey) {
    if (!attackerCard.demoCharge || !attackerCard.infiltrating || !attackerCard.infiltratedThisTurn ||
        !R().isAlive(attackerCard) || R().isPinned(attackerCard) || global.AFV?.isAfvGroup(tgtGroup) ||
        attackerCard.infiltratedGroupSide !== tgtSide || attackerCard.infiltratedGroupIdx !== tgtIdx) {
      return { ok: false, actionUsed: false };
    }
    const results = [];
    let malfunctioned = false;
    const st = global.state;
    const baseFP = 8 - Number(Boolean(st.scenario?.jungleMode));
    const defenders = global.attackTargetsOf(tgtGroup).filter(R().isAlive);
    if (!defenders.length) return { ok: false, actionUsed: false };
    if (tgtSide === 'player') await global.askPlayerHeroRally(tgtGroup, defenders);
    // §21.3 攻撃側の地形を使わず、守備側の地形と隠蔽を適用する。
    const conceal = global.canUseConcealment(tgtGroup)
      ? (tgtSide === 'player' ? await global.askPlayerConcealment() : global.aiUseConcealment()) : [];
    const concealMod = global.getConcealMod(conceal, tgtSide);
    const terrainOpts = {
      japanBuildings: global.isJapanInGame(), encircled: Boolean(tgtGroup.encircled),
      isFlank: st.groups[srcSide].indexOf(srcGroup) !== tgtIdx
    };
    const defenderModifiers = R().getTerrainModBreakdown(tgtGroup.terrain, false, terrainOpts);

    // 攻撃対象: 防御側グループの全兵士 + 同じ侵入先にいる他の味方侵入兵（自分自身は除く）
    const targets = defenders.map(card => ({ card, group: tgtGroup, friendly: false }));
    for (const group of st.groups[srcSide]) {
      for (const card of group.cards) {
        if (card !== attackerCard && R().isAlive(card) && card.infiltrating &&
            card.infiltratedGroupSide === tgtSide && card.infiltratedGroupIdx === tgtIdx) {
          targets.push({ card, group, friendly: true });
        }
      }
    }

    let first = true;
    let demoEnemyKills = 0;
    for (let i = 0; i < targets.length; i++) {
      const { card, group: defenderGroup, friendly } = targets[i];
      const facKey = friendly ? atkFacKey : tgtFacKey;
      const defendingSide = friendly ? srcSide : tgtSide;
      if (!R().isAlive(card)) continue;
      const judge = drawFn(srcSide);
      if (!judge) continue;
      const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
      const isRed = judge.terrain && judge.terrain.rncColor === '赤';
      const rnc = isRed ? -rncAbs : rncAbs;
      // §21.4 1枚目RNCが赤6 → 爆薬故障、以降の解決なし
      if (first && isRed && rncAbs === 6) {
        malfunctioned = true;
        first = false;
        break;
      }
      first = false;
      const def = R().lookupSoldier(card, facKey);
      const wasPinned = R().isPinned(card);
      const rpc0r = parseInt((judge.terrain && judge.terrain.dice && judge.terrain.dice['0r']) || '0', 10) || 0;
      const modifiers = friendly ? R().getTerrainModBreakdown(defenderGroup.terrain, false, {
        japanBuildings: terrainOpts.japanBuildings, encircled: Boolean(defenderGroup.encircled)
      }) : defenderModifiers;
      const cover = modifiers.reduce((sum, item) => sum + item.mod, 0);
      const trenchModifier = modifiers.find(item => item.type === 'TRENCH')?.mod;
      const concealment = friendly ? 0 : concealMod;
      const armorSupport = global.infantryGunProfile(card, defendingSide) ? 0 :
        Number(global.AFV?.adjacentArmorSupport(defenderGroup) || 0);
      const fpHere = baseFP + cover + concealment - armorSupport +
        global.personnelDefenseAdjustment(card, defendingSide, trenchModifier, concealment);
      const moraleMod = global.commissarModOf(defenderGroup, card) - R().weaponMoralePenalty(card, def);
      const panicMod = moraleMod - Number(Boolean(wasPinned && defenderGroup.encircled));
      const r = R().resolveFireOnSoldier(fpHere, rnc, def, wasPinned, rpc0r, moraleMod, panicMod, 0, R().rpc7wOf(judge));
      r.result = global.berserkFireResult(r, defenderGroup, card, def, defendingSide, rpc0r);
      if (r.result === 'WOUND' && typeof global.applyWound === 'function') r.result = global.applyWound(card); // §33.1
      if (r.result === 'KIA' || r.result === 'PANIC_KIA') {
        R().killSoldier(card);
        if (!friendly) demoEnemyKills++;
      } else if (r.result === 'PANIC_ROUT') {
        R().routSoldier(card);
        if (!friendly) demoEnemyKills++;
      } else if (r.result === 'PIN') r.result = global.applyPersonnelPin(card);
      const morale = def ? (wasPinned ? parseInt(def.panic,10)||0 : parseInt(def.morale,10)||0) : 0;
      const kia = def ? (wasPinned ? parseInt(def.kiaBack,10)||0 : parseInt(def.kiaFront,10)||0) : 0;
      const namePrefix = friendly ? '[味方] ' : '';
      const stD = global.state || {};
      const sideFac = friendly ? (srcSide === 'player' ? stD.player : stD.ai) : (tgtSide === 'player' ? stD.player : stD.ai);
      const sideFlag = (sideFac && sideFac.flag) ? sideFac.flag + ' ' : '';
      results.push({ name: namePrefix + sideFlag + (def ? def.name : card.id), result: r.result, rnc, rncColor: isRed ? '赤' : '黒', finalFP: fpHere, sum: fpHere + rnc, morale, kia, wasPinned });
    }
    if (first) return { ok: false, actionUsed: false };
    if (typeof global.noteSurpriseAttack === 'function') {
      const survived = tgtGroup.cards.some(R().isAlive);
      global.noteSurpriseAttack(srcSide, survived && !malfunctioned ? tgtSide : null);
    }
    // 爆薬は使用済み
    attackerCard.demoCharge = false;
    attackerCard.infiltratedThisTurn = false;
    clearSoldierInfiltration(attackerCard); // §20.53・FAQ §21.2
    // §42.43 爆薬で3人以上殺害/潰走
    if (demoEnemyKills >= 3) attackerCard.demoKilled3OrMore = true;

    const title = malfunctioned
      ? `爆薬故障 (赤6) — 攻撃失敗 / 爆薬喪失`
      : `爆薬攻撃 — ${srcGroup.name} → ${tgtSide === 'player' ? '自' : '敵'}${tgtGroup.name} (FP ${baseFP})`;
    // 射撃判定と同じ形式で結果表示
    const showFn = global.showFireResultOverlay || (typeof window !== 'undefined' && window.showFireResultOverlay);
    if (showFn) {
      await showFn(title, results, conceal);
    } else {
      let msg = title + '\n';
      results.forEach(r => { msg += `${r.name}: ${r.result} (RNC ${r.rncColor}${Math.abs(r.rnc)})\n`; });
      alert(msg);
    }

    global.cleanupEliminatedGroups();
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
      if (reason === 'fire' && card._noFire) continue; // §20.531 射撃に参加しなかった侵入兵は侵入状態のまま
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
    if (closeCombatTargets(srcGroup).length) return { ok: true };
    return { ok: false, error: '相対距離5の正面・隣接グループに、前の手番までに侵入した兵士が必要です（§20.52・§20.55）' };
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
      if (!card.infiltrating || card._noFire) continue; // §20.531 射撃に参加しない侵入兵
      if (card.infiltratedGroupSide !== tgtSide || card.infiltratedGroupIdx !== tgtIdx) continue;
      const def = R().lookupSoldier(card, srcFacKey);
      if (!def) continue;
      // §20.51 例外: 火炎放射器は2倍にしない
      if (def.weaponCat && def.weaponCat.includes('火炎放射器')) continue;
      if (R().isWoundActive(card)) {
        bonus += R().calcGroupFirepower({ ...srcGroup, cards: [card] }, srcFacKey, distance, {
          moving: global.isMovingIgnoringOverlays(srcGroup),
        });
      } else {
        bonus += parseInt(def.range[idx], 10) || 0;
      }
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
    if (factionKey !== 'rus' || soldierDef.isInfantryGun || soldierDef.infantryGun || card.berserk) return false;
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
    return global.withDeckAttack(() => executeBerserkInfantryCC(berserkCard, srcGroup, tgtGroup, tgtSide, drawFn, srcFacKey));
  }

  async function executeBerserkInfantryCC(berserkCard, srcGroup, tgtGroup, tgtSide, drawFn, srcFacKey) {
    const tgtFacKey = global.getFactionKey(global.state[tgtSide]);
    const def = R().lookupSoldier(berserkCard, srcFacKey);
    const defenders = aliveCards(tgtGroup);
    if (!def || !defenders.length) return { battles: [] };

    const rpcCard = defenders.length > 1 ? drawFn() : null;
    const defCard = defenders.length === 1 ? defenders[0] : determineCCTarget(rpcCard, tgtGroup)?.card;
    if (!defCard) return { battles: [] };
    const defDef = R().lookupSoldier(defCard, tgtFacKey);
    if (!defDef) return { battles: [] };

    // §20.91 ピン状態のCCVを使用
    const atkCCV = getCCV(berserkCard, def, {});
    const defCCV = getCCV(defCard, defDef, {});

    const atkRncCard = drawFn(global.state?.currentTurn);
    const defRncCard = drawFn(global.state?.currentTurn === 'player' ? 'ai' : 'player');
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
      // §42.43 CC殺害カウント (狂暴兵)
      berserkCard.ccKills = (berserkCard.ccKills || 0) + 1;
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
    if (!canAttemptInfiltration(srcGroup, tgtGroup, 'ai').ok) return { ok: false, actionUsed: false };
    const vehicle = global.AFV?.isAfvGroup(tgtGroup);
    const eligible = unpinnedAlive(srcGroup).filter(card => !card.infiltrating && !cannotInfiltrate(card, aiFacKey) &&
      (!vehicle || global.AFV.canAttackVehicleInCloseCombat(card, 'ai'))); // §32.21 監視役・§33.5 負傷兵は潜入不可
    // 爆薬を持つ兵を先頭に: 移動カード（モラルチェックなし）と隠ぺいカードを優先して使い、侵入を助ける
    eligible.sort((a, b) => (b.demoCharge ? 1 : 0) - (a.demoCharge ? 1 : 0));
    if (eligible.length === 0) return { ok: false, actionUsed: false };

    // AI: 移動カードがあれば使う、なければモラルチェック
    const st = global.state;
    const moveCards = movementCardsFor('ai');
    const fording = R().isInStream(srcGroup) && !R().hasCrossedStream(srcGroup);
    const attempts = [];
    for (const card of eligible) {
      if (st.terrainDeck?.timeLimitReached || (fording && !moveCards.length)) break;
      const def = R().lookupSoldier(card, aiFacKey);
      if (!def) continue;
      const morale = parseInt(def.morale, 10) || 0;
      const entry = { name: `#${card.num} ${def.name}`, morale };
      breakCrewOf(srcGroup, card); // §11.13 侵入を試みるとクルーは解かれる
      abandonHeavyWeapon(srcGroup, card, aiFacKey, 'ai');

      let reusedRpc = null;
      const move = moveCards.shift();
      if (move) {
        entry.method = '移動';
        if (!spendMovementCard('ai', move)) continue;
        if (fording && !R().isFordCard(move)) reusedRpc = drawFn(st.currentTurn);
        entry.moraleResult = !fording || R().isFordCard(move) ||
          Boolean(reusedRpc && reusedRpc.terrain.rncColor !== '赤');
      } else {
        entry.method = 'モラル';
        const rncCard = drawFn(st.currentTurn);
        if (rncCard) {
          const currentDef = R().lookupSoldier(card, aiFacKey);
          const check = checkInfiltrationMorale(currentDef, rncCard, card, srcGroup);
          Object.assign(entry, { rnc: check.rnc, rncColor: check.rncColor, morale: check.morale, moraleResult: check.pass });
          if (!check.pass) {
            R().pinSoldier(card);
            entry.pinned = true;
          }
        }
      }
      attempts.push({ card, entry, reusedRpc });
    }

    const results = attempts.map(({ entry }) => entry);
    const completed = { ok: true, actionUsed: attempts.length > 0, results };
    if (st.terrainDeck?.timeLimitReached || st.phase !== 'play') {
      global.settleDeckTimeLimit();
      return completed;
    }

    const resolve = async () => {
      for (const { card, entry, reusedRpc } of attempts) {
        if (!entry.moraleResult) { entry.infiltrated = false; continue; }
        // 侵入RPC判定
        const _isNight3 = !!(global.state && global.state.isNight);
        const _sFlared3 = Boolean(global.isGroupFlared?.(tgtGroup)); // §38.6 潜入される側が照らされているか
        // §9.4 AI も侵入する兵士1名につき隠ぺいカード1枚で援護する（持っていれば使う）
        const concealValue = useSingleConcealedCard('ai');
        const column = calcInfiltrationColumn(tgtGroup, srcGroup, { srcFacKey: aiFacKey, night: _isNight3 && !_sFlared3, concealValue });
        entry.column = column;
        const rpcCard = reusedRpc || drawFn();
        if (!rpcCard) { entry.infiltrated = false; continue; }
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
      }

      if (results.length) {
        await showInfiltrationResultOverlay(`AI侵入 — ${srcGroup.name} → プレイヤー${tgtGroup.name}`, results);
        if (vehicle) await global.AFV.resolveVehicleCloseCombat(srcGroup, tgtGroup, 'ai');
      }
      return completed;
    };
    return (await (vehicle ? global.withDeckAttack(resolve) : resolve())) || completed;
  }

  /**
   * AI自動CC（モーダルなし）
   */
  async function aiExecuteCC(srcGroup, srcGroupIdx, drawFn, aiFacKey, targets = closeCombatTargets(srcGroup)) {
    if (!targets.length) return { ok: false, actionUsed: false };
    const moves = movementCardsFor('ai').length;
    const entries = targets.flatMap(target => target.soldiers.map(card => ({ card, target })));
    entries.forEach((entry, index) => { entry.useMove = index < moves; });
    return await executeDeclaredCloseCombat(srcGroup, 'ai', aiFacKey, entries, drawFn);
  }

  // ===========================================================
  // 12. エクスポート
  // ===========================================================

  async function executeBanzaiCombat(srcGroup, srcSide, tgtGroup, tgtSide, tgtIdx, participants, drawFn, title) {
    const tgtFacKey = tgtGroup._faction || global.getFactionKey(global.state[tgtSide]);
    const battles = await resolveCCBattles({
      srcGroup, srcSide, srcFacKey: 'jpn', tgtGroup, tgtSide, tgtIdx, tgtFacKey,
      participants, drawFn, banzai: true, attackerPenalty: 1,
    });
    if (battles.length) await showCCResultOverlay(title, battles);
    return battles;
  }

  global.CC_ACTION = {
    // メイン実行
    executeInfiltration,
    executeCC,
    executeBanzaiCombat,
    // チェック
    canAttemptInfiltration,
    canAttemptCC,
    closeCombatTargets,
    // 侵入管理
    clearInfiltration,
    clearSoldierInfiltration,
    getInfiltratingFromGroup,
    getInfiltratorsFor,
    isInfiltratedByEnemy,
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
    calcInfiltrationColumnDetailed,
    resolveInfiltrationRPC,
    resolveCCCombat,
    determineCCTarget,
  };

})(typeof window !== 'undefined' ? window : this);
