// アップフロント: §17 側面射撃と包囲・§18 兵器の所有・§17.8 個人移送・§17.9 グループの設立・§17.7 側方移送
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== §17 側面射撃と包囲 =====
function _enemySide(side) { return side === 'player' ? 'ai' : 'player'; }
function _groupAlive(g) {
  const R = window.INFANTRY_RULES;
  return !!(g && !g.eliminated && R && g.cards.some(c => R.isAlive(c)));
}
function _groupSideIdx(grp) {
  for (const side of ['player', 'ai']) {
    const i = (state.groups[side] || []).indexOf(grp);
    if (i >= 0) return { side, idx: i };
  }
  return null;
}
/** 敵隣接グループの背後にいる（距離チットの合計が 6 以上 = 相対距離5を通り過ぎて4以下） */
function _isBehind(srcSide, srcIdx, tgtIdx) {
  const src = state.groups[srcSide][srcIdx];
  const tgt = state.groups[_enemySide(srcSide)][tgtIdx];
  if (!_groupAlive(src) || !_groupAlive(tgt) || Math.abs(srcIdx - tgtIdx) !== 1) return false;
  return (src.distance || 0) + (tgt.distance || 0) >= 6;
}
/** 目標グループが同じアルファベットの真正面の相手と向き合っているか */
function _facesOpposite(tgtSide, tgtIdx) {
  return _groupAlive((state.groups[_enemySide(tgtSide)] || [])[tgtIdx]);
}
/** §17.3 通常側面射撃: 移動カードなしで、敵隣接グループの背後にいて、その敵が真正面の相手と向き合っている */
function hasNormalFlank(srcSide, srcIdx, tgtIdx) {
  return _isBehind(srcSide, srcIdx, tgtIdx) && _facesOpposite(_enemySide(srcSide), tgtIdx);
}
/** §17.41・§17.44 側面射撃は攻撃元が地形を置いても継続する。 */
function cardFlankValid(srcSide, srcIdx) {
  const src = state.groups[srcSide][srcIdx];
  if (!src || src.flankingTarget == null || !src.flankCard) return false;
  const t = src.flankingTarget;
  if (!_groupAlive(src) || !_groupAlive(state.groups[_enemySide(srcSide)][t]) || !_facesOpposite(_enemySide(srcSide), t)) return false;
  return !window.INFANTRY_RULES.hasTerrainType(src, 'WIRE');
}

function clearOutgoingFlanks(group) {
  group.flankingTarget = null;
  group.flankCard = null;
}
/** §17.4/§17.612 この射撃が側面射撃になるか（側面移動カード・通常側面射撃・包囲下の目標） */
function isFlankFire(srcSide, srcIdx, tgtIdx) {
  const src = state.groups[srcSide][srcIdx];
  const tgt = state.groups[_enemySide(srcSide)][tgtIdx];
  if (!_groupAlive(src) || !_groupAlive(tgt)) return false;
  // §23.7–23.8 トーチカへの側面射撃は、背後から距離5に戻ったグループに限る。
  if (window.INFANTRY_RULES.currentTerrainType(tgt) === 'PILLBOX') {
    return pillboxRelation(srcSide, srcIdx, tgtIdx) === 'flank';
  }
  if (tgt.encircled) return true;
  if (src.flankingTarget === tgtIdx && cardFlankValid(srcSide, srcIdx)) return true;
  return hasNormalFlank(srcSide, srcIdx, tgtIdx);
}
/** §23.7 トーチカの背後では射撃不可。背後の距離5ではトーチカからの射撃は半減し、トーチカへの射撃は側面射撃になる。 */
function pillboxRelation(srcSide, srcIdx, tgtIdx) {
  const R = window.INFANTRY_RULES;
  const src = state.groups[srcSide][srcIdx];
  const tgt = state.groups[_enemySide(srcSide)][tgtIdx];
  if (!R || !src || !tgt || Math.abs(srcIdx - tgtIdx) !== 1) return null;
  let P, E, key;
  if (R.currentTerrainType(tgt) === 'PILLBOX') { P = tgt; E = src; key = _enemySide(srcSide) + ':' + tgtIdx; }
  else if (R.currentTerrainType(src) === 'PILLBOX') { P = src; E = tgt; key = srcSide + ':' + srcIdx; }
  else return null;
  const sum = (P.distance || 0) + (E.distance || 0);
  if (sum >= 6) { E._behindPillbox = key; return 'blocked'; }
  if (sum === 5 && E._behindPillbox === key) return P === src ? 'half' : 'flank';
  if (sum < 5 && E._behindPillbox === key) E._behindPillbox = null;
  return null;
}
/** トーチカの背後に出たことを記録する（撃たなくても、後退して5になった時の判定に使う） */
function updatePillboxBehind() {
  const R = window.INFANTRY_RULES;
  if (!R || !state.groups) return;
  ['player', 'ai'].forEach(side => (state.groups[side] || []).forEach((P, pi) => {
    if (!P || P.eliminated || R.currentTerrainType(P) !== 'PILLBOX') return;
    [pi - 1, pi + 1].forEach(ei => {
      const E = (state.groups[_enemySide(side)] || [])[ei];
      if (!E || E.eliminated) return;
      const sum = (P.distance || 0) + (E.distance || 0);
      if (sum >= 6) E._behindPillbox = side + ':' + pi;
      else if (sum < 5 && E._behindPillbox === side + ':' + pi) E._behindPillbox = null;
    });
  }));
}

/** §17.4 側面射撃の火力2倍（火炎放射器の火力は倍にしない） */
function flankDoubledFP(group, factionKey, distance, fp, opts) {
  const R = window.INFANTRY_RULES;
  if (!R) return fp * 2;
  const ft = group.cards.filter(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c._noFire) return false;
    const d = R.lookupSoldier(c, factionKey);
    return d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0;
  });
  if (ft.length === 0) return fp * 2;
  const tmp = { ...group, cards: ft };
  const flameFP = R.calcGroupFirepower(tmp, factionKey, distance, Object.assign({}, opts || {}, { crewMap: buildCrewMapFromPairs(tmp) }));
  return fp * 2 - Math.min(fp, flameFP);
}

/** §5.1・§8.42・§13.34・§24.4 側面射撃や包囲に使える横移動か。 */
function lateralAttackBlockReason(group) {
  const R = window.INFANTRY_RULES;
  if (!_groupAlive(group) || group._immob || group._bog || group._stun || group.cards.some(R.isPinned)) {
    return 'このグループは移動できません';
  }
  if (R.hasTerrainType(group, 'WIRE') || R.hasTerrainType(group, 'MINEFIELD')) {
    return '鉄条網や地雷原にいるグループは側面移動・包囲を行えません';
  }
  if (R.isInMarsh(group) && R.marshMoveCount(group) === 0) {
    return '湿地での最初の横移動には側面射撃・包囲の効果がありません（§8.42）';
  }
  return null;
}

/** 側面移動カードで側面にまわり込めない理由（できるなら null） §17.2 */
function cardFlankBlockReason(srcSide, srcIdx, tgtIdx) {
  const src = state.groups[srcSide][srcIdx];
  const blocked = lateralAttackBlockReason(src);
  if (blocked) return blocked;
  const tgt = state.groups[_enemySide(srcSide)][tgtIdx];
  if (!_groupAlive(tgt)) return '目標のグループがいません';
  if (Math.abs(srcIdx - tgtIdx) !== 1) return '側面射撃はアルファベットが直前・直後の敵グループに対してのみ可能です（§17.2）';
  if (!_facesOpposite(_enemySide(srcSide), tgtIdx)) return '目標のグループが真正面の相手と向き合っていないため、側面にまわり込めません（§17.2）';
  const enemyFlanksMe = (tgt.flankingTarget === srcIdx && cardFlankValid(_enemySide(srcSide), tgtIdx))
    || hasNormalFlank(_enemySide(srcSide), tgtIdx, srcIdx);
  if (enemyFlanksMe) return '自分に側面射撃をしているグループには、側面にまわり込めません（§17.2）';
  if (src && src.encirclingIdx != null) return 'このグループは包囲を行っているため、側面にまわり込めません（§17.6）';
  return null;
}

/** §8.531・§17.1 側面移動での渡河は、渡河できたときにだけ側面射撃が成立する。 */
function playFlankMovement(side, source, target, card) {
  const group = state.groups[side][source];
  const R = window.INFANTRY_RULES;
  let judge = null;
  if (R.isInStream(group) && !R.hasCrossedStream(group)) {
    const ford = attemptStreamMovement(group, side, card);
    if (ford.result !== 'forded') return ford;
    judge = ford.judge;
  } else {
    card._moveMode = 'lateral';
    pushTerrainWithFaction(group, card);
  }
  group.flankingTarget = target;
  group.flankCard = card;
  return { result: 'flanked', judge };
}

/** 包囲できない理由（できるなら null） §17.6 */
function encircleBlockReason(srcSide, srcIdx, tgtIdx) {
  const src = state.groups[srcSide][srcIdx];
  const blocked = lateralAttackBlockReason(src);
  if (blocked) return blocked;
  const R = window.INFANTRY_RULES;
  if (R.isInStream(src) && !R.hasCrossedStream(src)) return '包囲するには先に渡河してください（§8.53）';
  const tgt = state.groups[_enemySide(srcSide)][tgtIdx];
  if (!_groupAlive(tgt)) return '目標のグループがいません';
  if (window.AFV?.isAfvGroup(tgt)) return '車両は包囲の対象になりません（§17.6）';
  if (Math.abs(srcIdx - tgtIdx) !== 1) return '包囲は敵隣接グループに対してのみ可能です';
  if (!_facesOpposite(_enemySide(srcSide), tgtIdx)) return '包囲する敵グループの真正面に味方のグループがいなければなりません（§17.6）';
  if (!_isBehind(srcSide, srcIdx, tgtIdx)) return '包囲するには、その敵グループの背後（相対距離5を通り過ぎて4以下）にいなければなりません（§17.6）';
  if (tgt.encircled) return 'そのグループはすでに包囲されています';
  if (src.encirclingIdx != null) return 'このグループはすでに別のグループを包囲しています（§17.6）';
  if (src.flankingTarget != null && cardFlankValid(srcSide, srcIdx)) return 'このグループは側面にまわり込んでいるため、包囲できません（§17.6）';
  return null;
}
/** 包囲を成立させる（後方のグループ＝src、前方のグループ＝目標の真正面の相手） */
function applyEncircle(srcSide, srcIdx, tgtIdx) {
  const tgt = state.groups[_enemySide(srcSide)][tgtIdx];
  tgt.encircled = true;
  tgt.encircledBy = { side: srcSide, rearIdx: srcIdx, frontIdx: tgtIdx };
  state.groups[srcSide][srcIdx].encirclingIdx = tgtIdx;
}
/** §17.42/§17.43 そのグループに地形カードが使われた・そのグループが移動カードを使った → そのグループへの側面射撃は終わる */
function breakFlanksOn(grp) {
  // §18.4 そのグループが地形カード・移動カードを使った（拒否・捨て札を含む）→ 誰も持っていない兵器チットは除去
  if (grp && grp.weaponPool && grp.weaponPool.length) grp.weaponPool = [];
  const p = _groupSideIdx(grp);
  if (!p) return;
  (state.groups[_enemySide(p.side)] || []).forEach(g => {
    if (g && g.flankingTarget === p.idx) { g.flankingTarget = null; g.flankCard = null; }
  });
}
/** §17.44/§17.62 終わった側面射撃・解けた包囲を片付ける */
function updateFlankAndEncircle() {
  const R = window.INFANTRY_RULES;
  if (!R || !state.groups) return;
  ['player', 'ai'].forEach(side => {
    (state.groups[side] || []).forEach((g, i) => {
      if (g && g.flankingTarget != null && !cardFlankValid(side, i)) { g.flankingTarget = null; g.flankCard = null; }
    });
  });
  ['player', 'ai'].forEach(side => {
    (state.groups[side] || []).forEach((y, yi) => {
      if (!y || !y.encircled) return;
      const by = y.encircledBy;
      let release = !by || !_groupAlive(y);
      if (!release) {
        const rear = state.groups[by.side][by.rearIdx];
        const front = state.groups[by.side][by.frontIdx];
        if (!_groupAlive(rear) || !_groupAlive(front)) release = true;                       // どちらかが除去
        else if (R.relativeRange(y.distance, rear.distance) <= 1
              || R.relativeRange(y.distance, front.distance) <= 1) release = true;          // 相対距離1以下
        else if ((rear.distance || 0) + (y.distance || 0) < 5) release = true;              // 両方とも前方に出た
        else if (y.cards.some(c => c.infiltrating && c.infiltratedGroupSide === by.side
                 && (c.infiltratedGroupIdx === by.rearIdx || c.infiltratedGroupIdx === by.frontIdx))) release = true; // 包囲下のグループに侵入された
      }
      if (release) {
        if (by && state.groups[by.side][by.rearIdx]) state.groups[by.side][by.rearIdx].encirclingIdx = null;
        y.encircled = false;
        y.encircledBy = null;
      }
    });
  });
}

// ===== §18 兵器の所有 =====
/** 兵士が今持っている兵器（拾った兵器があればそれ）を兵器チットの形で取り出す */
function weaponOfCard(card, factionKey) {
  const R = window.INFANTRY_RULES;
  const d = R && R.lookupSoldier(card, factionKey);
  if (!d || !d.weaponCat || d.weaponCat === '非武装' || card.destroyed ||
      (card.flameDiscarded && /^火炎放射器/.test(d.weaponCat)) || d.afv || d.infantryGun || d.isInfantryGun) return null;
  return { weaponCat: d.weaponCat, xVal: d.xVal, weaponName: d.weaponName,
           range: (d.range || []).slice(), rangeData: (d.rangeData || []).slice(), needsCrew: !!d.needsCrew,
           fac: card.acquiredWeapon?.fac || factionKey,
           malfunctioned: Boolean(card.malfunctioned), captured: Boolean(card.acquiredWeapon?.captured) };
}
function installAcquiredWeapon(group, card, weapon) {
  const { malfunctioned, fromNum, assistantNum, fromSide, ...characteristics } = weapon;
  if (characteristics.captured) card._printedWeaponBeforeCapture ||= { available: false };
  else delete card._printedWeaponBeforeCapture;
  card.acquiredWeapon = characteristics;
  card.malfunctioned = Boolean(malfunctioned);
  card.destroyed = false;
  delete card.flameDiscarded;
  const side = _groupSideIdx(group)?.side;
  if (side) {
    loseAcquisitionForCards([card]); // §27.1 捕捉は兵士でなく兵器に属する。
    const faction = getFactionKey(state[side]);
    const secondary = secondaryWeaponOn(card, faction);
    if (secondary && !SECONDARY_ELIGIBLE_WEAPONS.includes(characteristics.weaponCat)) {
      const infiltrated = card.infiltrating && state.groups[card.infiltratedGroupSide]?.[card.infiltratedGroupIdx];
      const destination = infiltrated || group;
      (destination.weaponPool ||= []).push(secondaryWeaponToken(secondary, card, faction, side));
      setSecondaryWeapon(card, null);
    }
  }
  const pairs = group.crewPairs || {};
  for (const [owner, assistant] of Object.entries(pairs)) {
    if (Number(owner) === card.num || Number(assistant) === card.num) delete pairs[owner];
  }
}
function capturePrimaryWeapon(group, card, weapon) {
  if (!card.acquiredWeapon?.captured) {
    card._printedWeaponBeforeCapture = {
      available: !card.acquiredWeapon && !card.destroyed && !card.flameDiscarded,
      malfunctioned: Boolean(card.malfunctioned)
    };
  }
  installAcquiredWeapon(group, card, { ...weapon, captured: true });
  if (card.wounded) woundPortage(card);
}
function abandonCapturedWeapon(card) {
  const printed = card._printedWeaponBeforeCapture;
  card.acquiredWeapon = printed?.available === false ? UNARMED_WEAPON : null;
  card.malfunctioned = Boolean(printed?.available && printed.malfunctioned);
  card.destroyed = false;
  delete card._printedWeaponBeforeCapture;
  if (card.wounded) woundPortage(card);
}

/** §18.21 / §20.74: 武器の受け渡しと捕獲兵器の放棄。 */
function askWeaponExchange(group) {
  const faction = getFactionKey(state.player);
  const R = window.INFANTRY_RULES;
  const cards = groupOrderCandidates(group).map(entry => entry.card)
    .filter(card => !card.infiltrating && !window.AFV.isAfvCard(card) && !infantryGunProfile(card, 'player'));
  const options = [];
  const nameOf = card => R.lookupSoldier(card, faction)?.name || card.id;
  for (const [index, first] of cards.entries()) {
    if (first.acquiredWeapon?.captured) {
      options.push({
        label: nameOf(first) + radioText('　捕獲兵器を放棄', ' · abandon captured weapon'),
        apply() { abandonCapturedWeapon(first); }
      });
    }
    for (const second of cards.slice(index + 1)) {
      const label = `${nameOf(first)} / ${nameOf(second)}`;
      const firstWeapon = weaponOfCard(first, faction), secondWeapon = weaponOfCard(second, faction);
      if ((first.wounded || second.wounded) && (firstWeapon || secondWeapon)) {
        options.push({
          label: label + radioText('　主兵器', ' · primary weapons'),
          apply() {
            installAcquiredWeapon(group, first, secondWeapon || UNARMED_WEAPON);
            installAcquiredWeapon(group, second, firstWeapon || UNARMED_WEAPON);
            for (const card of [first, second]) if (card.wounded) woundPortage(card);
          }
        });
      }
      const firstSecondary = secondaryWeaponOn(first, faction), secondSecondary = secondaryWeaponOn(second, faction);
      if ((firstSecondary || secondSecondary) && (!firstSecondary || secondaryWeaponEligible(second, faction)) &&
          (!secondSecondary || secondaryWeaponEligible(first, faction))) {
        options.push({
          label: label + radioText('　副次兵器', ' · secondary weapons'),
          apply() {
            setSecondaryWeapon(first, secondSecondary);
            setSecondaryWeapon(second, firstSecondary);
          }
        });
      }
    }
  }
  for (const donor of group.cards) {
    if (!R.isAlive(donor) || !R.isPinned(donor) || !donor.wounded || donor.transfer || donor.infiltrating) continue;
    const weapon = secondaryWeaponOn(donor, faction);
    if (!weapon) continue;
    for (const receiver of cards) {
      if (secondaryWeaponOn(receiver, faction) || !secondaryWeaponEligible(receiver, faction)) continue;
      options.push({
        label: `${nameOf(donor)} → ${nameOf(receiver)}　${secondaryWeaponLabel(weapon.kind)}`,
        apply() {
          setSecondaryWeapon(receiver, weapon);
          setSecondaryWeapon(donor, null);
        }
      });
    }
  }
  if (!options.length) {
    alert(radioText('受け渡しできる兵器と兵士の組み合わせがありません。', 'This group has no eligible weapon exchange.'));
    return false;
  }
  const list = options.map((option, index) => `${index + 1}: ${option.label}`);
  const answer = prompt([radioText('受け渡す組み合わせを番号で選んでください。', 'Choose a weapon exchange by number.'), ...list].join('\n'), '1');
  const option = options[Number(answer) - 1];
  if (!option) return false;
  option.apply();
  return true;
}

/** 兵器を持たない状態（§19.4 非武装） */
const UNARMED_WEAPON = { weaponCat: '非武装', xVal: '', weaponName: '', range: ['0','0','0','0','0','0'],
  rangeData: [0,1,2,3,4,5].map(() => ({ main: 0 })), needsCrew: false };
/** 兵士が兵器を手放す（グループの兵器チットとして残す §20.23）。兵士は非武装になる */
function dropWeaponToPool(group, card, factionKey, side) {
  const w = weaponOfCard(card, factionKey);
  if (!w) return;
  (group.weaponPool || (group.weaponPool = [])).push(Object.assign({ fromNum: card.num, assistantNum: null, fromSide: side }, w));
  installAcquiredWeapon(group, card, UNARMED_WEAPON);
}

/** §18.1 KIA（パニックKIA含む）・潰走した兵士の兵器をグループの兵器チットとして残す（1回だけ処理）
 *  湿地・河川にいる時は失われる。潰走はクルー操作兵器の持ち主の時だけ残る。侵入兵は侵入先のグループに残す */
function processDroppedWeapons() {
  const R = window.INFANTRY_RULES;
  if (!R || !state.groups) return;
  ['player', 'ai'].forEach(side => {
    const fk = getFactionKey(side === 'player' ? state.player : state.ai);
    (state.groups[side] || []).forEach(g => {
      if (!g) return;
      g.cards.forEach(c => {
        if (c._weaponHandled || !(c.killed || c.routed)) return;
        c._weaponHandled = true;
        const w = weaponOfCard(c, fk);
        const secondary = c.killed ? secondaryWeaponOn(c, fk) : null;
        if (!w && !secondary) return;
        if (c.routed && !c.killed && !w?.needsCrew) return; // 潰走: 兵器とともに抜ける
        let where = g;
        if (c._dropSide && c._dropIdx != null) {
          // §20.742 CC の相打ち: 侵入されたグループに残る
          where = (state.groups[c._dropSide] || [])[c._dropIdx] || g;
        } else if (c.infiltrating && c.infiltratedGroupSide && c.infiltratedGroupIdx != null) {
          where = (state.groups[c.infiltratedGroupSide] || [])[c.infiltratedGroupIdx] || g;
        }
        if (R.isInMarsh(where) || R.isInStream(where)) return; // 湿地・河川では失われる
        const assistantNum = (g.crewPairs && g.crewPairs[c.num] != null) ? Number(g.crewPairs[c.num]) : null;
        const pool = (where.weaponPool ||= []);
        if (w) pool.push({ fromNum: c.num, assistantNum, fromSide: side, ...w });
        if (secondary) pool.push(secondaryWeaponToken(secondary, c, fk, side));
      });
    });
  });
}

// ===== §17.8 個人移送 / §17.9 グループの設立 / §17.7 グループ側方移送 =====
const GROUP_LETTERS = ['A', 'B', 'C', 'D'];
const RANDOM_REINFORCEMENT_SLOTS = ['Z', 'A', 'B', 'C', 'D', 'E'];

function groupSlotName(index) {
  return state.scenario?.randomDefenderReinforcements ? RANDOM_REINFORCEMENT_SLOTS[index] : GROUP_LETTERS[index];
}

function isInitialGroupSlot(index) {
  return GROUP_LETTERS.includes(groupSlotName(index));
}
/** 移送中の兵士: card.transfer = { toIdx, startTurn }（兵士は送り出したグループの cards に残る） */
function incomingTransit(side, idx) {
  const R = window.INFANTRY_RULES;
  const out = [];
  (state.groups[side] || []).forEach((g, gi) => {
    if (gi === idx || !g) return;
    g.cards.forEach(c => { if (c.transfer && c.transfer.toIdx === idx && (!R || R.isAlive(c))) out.push(c); });
  });
  return out;
}

function fireGroupWithTransfers(group, soldiers) {
  if (!soldiers.length) return group;
  return { ...group, cards: [...new Set([...group.cards, ...soldiers])], transferFire: new Set(soldiers) };
}

/** §17.8 FAQ: 移送兵は送り出す側か受け入れる側の射撃に参加できる。 */
function transferFireCandidates(group, side, index, range, eliteBlackFire = false) {
  if (group.forming || group._stun || index == null) return [];
  const R = window.INFANTRY_RULES;
  const faction = getFactionKey(state[side]);
  return [...group.cards.filter(card => card.transfer), ...incomingTransit(side, index)].filter(card =>
    card._transferFireTurn !== (state.turnCount || 0) && R.isAlive(card) && !R.isPinned(card) &&
    R.calcGroupFirepower({ ...group, cards: [card], transferFire: new Set([card]) }, faction, range,
      { eliteBlackFire }) > 0);
}

function chooseTransferFire(candidates, side) {
  if (!candidates.length) return [];
  const faction = getFactionKey(state[side]);
  const R = window.INFANTRY_RULES;
  const names = candidates.map((card, i) => `${i + 1}. ${R.lookupSoldier(card, faction)?.name || card.id}`);
  const question = radioText(
    '射撃に加える移送中の兵士の番号（複数可・空欄で参加なし）。参加すると移動射撃になります。',
    'Enter the numbers of men in transfer to include, or leave blank. Including them makes this Moving Fire.');
  const answer = prompt([question, ...names].join('\n'), '');
  if (answer == null) return null;
  if (!answer.trim()) return [];
  const selected = answer.trim().split(/[\s,、]+/).map(number => candidates[Number(number) - 1]);
  if (selected.some(card => !card) || new Set(selected).size !== selected.length) {
    alert(radioText('移送中の兵士を重複しない番号で指定してください。', 'Choose distinct numbers from the list.'));
    return null;
  }
  return selected;
}

function markTransferFire(soldiers) {
  for (const card of soldiers) card._transferFireTurn = state.turnCount || 0;
}
/** §17.8 受け入れ側が攻撃されたら、移送中の兵士から先に判定する。 */
function attackTargetsOf(group) {
  if (group.forming) return [];
  const p = _groupSideIdx(group);
  return p ? incomingTransit(p.side, p.idx).concat(group.cards) : group.cards;
}
/** §17.8 移送中と移送が終わった手番は距離チットを動かせない。 */
function transferLocksRange(side, idx) {
  const g = state.groups[side][idx];
  return !!g && (g.transferEndedTurn === (state.turnCount || 0) ||
    g.cards.some(c => c.transfer) || incomingTransit(side, idx).length > 0);
}
function finishIndividualTransfer(card, source, destination) {
  const turn = state.turnCount || 0;
  delete card.transfer;
  source.transferEndedTurn = turn;
  if (destination) destination.transferEndedTurn = turn;
}
function cancelFormingGroup(side, index) {
  const groups = state.groups[side];
  const destination = groups[index];
  if (!destination?.forming) return;
  groups.forEach(group => group?.cards.forEach(card => {
    if (card.transfer?.toIdx === index) finishIndividualTransfer(card, group, destination);
  }));
  destination.forming = null;
  destination.eliminated = true;
}
function _hasActiveLeader(g, side) {
  const R = window.INFANTRY_RULES;
  const fk = getFactionKey(side === 'player' ? state.player : state.ai);
  return !!(g && g.cards.some(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c.transfer) return false;
    if (c._commissar) return true;
    const d = R.lookupSoldier(c, fk);
    return !!(d && d.leader);
  }));
}
function recordStartingRanges() {
  const side = state.currentTurn;
  state.shiftOccupiedAtTurnStart = new Set();
  for (const [factionSide, groups] of Object.entries(state.groups)) {
    groups.forEach((group, index) => {
      if (!group) return;
      const distance = group.distance || 0;
      group.ccStartingPosition = { turn: state.turnCount || 0, side, index, distance };
      if (factionSide !== side) return;
      group.transferStartingRange = distance;
      if (group.forming || _groupAlive(group)) state.shiftOccupiedAtTurnStart.add(index);
    });
  }
  recordReinforcementStartingRange(side);
}
function sameTransferRange(source, destination) {
  const sourceNow = source.distance || 0;
  const destinationNow = destination.distance || 0;
  return sourceNow === destinationNow &&
    (source.transferStartingRange ?? sourceNow) === (destination.transferStartingRange ?? destinationNow);
}
/** 移送先の候補: 隣の自軍グループ（同じ距離チット）と、隣の空いた位置（新グループ §17.91） */
function transferDestinations(side, fromIdx) {
  const arr = state.groups[side];
  const src = arr[fromIdx];
  const out = [];
  [fromIdx - 1, fromIdx + 1].forEach(j => {
    if (!isInitialGroupSlot(j)) return;
    const g = arr[j];
    if (g && !g.eliminated && (g.cards.length > 0 || g.forming)) {
      if (!g.forming && !window.AFV?.isAfvGroup(g) && sameTransferRange(src, g)) out.push({ idx: j, isNew: false });
    } else if (j <= arr.length) {
      out.push({ idx: j, isNew: true });
    }
  });
  return out;
}
/** §17.8/§17.81/§17.82/§17.91 個人移送できない理由（できるなら null） */
function transferBlockReason(side, fromIdx, dest, soldiers) {
  const R = window.INFANTRY_RULES;
  const src = state.groups[side][fromIdx];
  if (!src || src.eliminated || src.forming || window.AFV?.isAfvGroup(src)) return '送り出せるグループがありません';
  if (soldiers.some(card => card._evacuationWound) && src.cards.filter(R.isAlive).length > 1) {
    return radioText('P2の初期負傷兵は、グループに1人だけ残った場合に個人移送できます。',
      'A P2 starting casualty may transfer only when they are the last member of the group.');
  }
  if (src.encircled) return '包囲下のグループは個人移送できません（§17.611）';
  if (R.hasTerrainType(src, 'MINEFIELD') || R.hasTerrainType(src, 'WIRE')) return '地雷原・鉄条網にいるグループは個人移送できません（§17.8）';
  if (R.isInStream(src) && R.streamMoveCount(src) === 0 &&
      soldiers.some(c => infantryGunProfile(c, side))) {
    return '歩兵砲は移送前に最初の横移動が必要です（§8.53、§34.3）。';
  }
  if (R.isInMarsh(src) && R.marshMoveCount(src) < 1) return '湿地からは、先に移動カードを使っていなければ個人移送できません（§17.81）';
  if (soldiers.some(c => !R.isAlive(c) || R.isPinned(c) || c.infiltrating || c.transfer)) return 'ピン状態・侵入中・移送中の兵士は移送できません（§17.8）';
  if (soldiers.some(c => R.isDesignatedCrew(src, c))) {
    return radioText('クルーを組んでいる兵士は、クルーを解くまで移送できません（§17.8）。',
      'A weapon operator or assistant must leave the crew before transferring (§17.8).');
  }
  if (dest.isNew) {
    if (soldiers.length < 2) return '新しいグループを作るには、同時に2名以上を移送しなければなりません（§17.91）';
    if (!_hasActiveLeader(src, side)) return '移送にはピン状態でないリーダーが必要です（§17.8）';
    return null;
  }
  const dst = state.groups[side][dest.idx];
  if (!dst || dst.forming || dst.eliminated || window.AFV?.isAfvGroup(dst)) return 'このグループは兵士を受け取れません。';
  if (dst.encircled) return '包囲下のグループへは個人移送できません（§17.611）';
  if (!sameTransferRange(src, dst)) return '手番開始時から同じ距離チットにいる隣接グループに移送できます（§17.8）。';
  if (!_hasActiveLeader(src, side) && !_hasActiveLeader(dst, side)) return 'どちらかのグループにピン状態でないリーダーが必要です（§17.8）';
  const R2 = window.INFANTRY_RULES;
  const after = dst.cards.filter(c => R2.isAlive(c)).length + incomingTransit(side, dest.idx).length + soldiers.length;
  if (after > 10) return '移送でグループの兵員を11名以上にすることはできません（§17.82）';
  return null;
}
/** §17.81: 未渡河の兵士は、自分の移動カードで渡河できた場合に移送を始める。 */
function troopsAbleToTransfer(side, source, soldiers, movementCards) {
  const R = window.INFANTRY_RULES;
  if (!R.isInStream(source) || R.hasCrossedStream(source)) return soldiers;
  return soldiers.filter((card, index) => {
    if (R.isFordCard(movementCards[index]) || partisanSide(side)) return true;
    const judge = drawRandomReinforcementRnc(side);
    if (!judge) return false;
    showJudgeCard(judge);
    checkBreezeRemoveSmoke(judge);
    pushTerrainToDiscard(judge);
    return judge.terrain.rncColor !== '赤';
  });
}

/** 個人移送を始める（移送チット）。新しい位置なら設立中のグループを作る */
function startTransfer(side, fromIdx, dest, soldiers) {
  const arr = state.groups[side];
  const src = arr[fromIdx];
  if (dest.isNew) {
    const ng = { name: groupSlotName(dest.idx), cards: [], distance: src.distance || 0, terrain: [], actions: [],
                 _faction: src._faction, crewPairs: {}, forming: { fromIdx } };
    retainGroupCasualties(side, arr[dest.idx]);
    if (dest.idx < arr.length) arr[dest.idx] = ng; else arr.push(ng);
  }
  soldiers.forEach(c => {
    c.transfer = { toIdx: dest.idx, startTurn: state.turnCount || 0 };
  });
}
/** §17.8 受け取り（受け取るグループの1アクション、移送を始めたターンには不可）。戻り値: 受け取った人数 */
function receiveTransfers(side, toIdx, choosePosition) {
  const R = window.INFANTRY_RULES;
  const groups = state.groups[side];
  const destination = groups[toIdx];
  if (!destination || destination.forming || destination.eliminated) return 0;
  const turn = state.turnCount || 0;
  const transfers = groups.flatMap(source => source?.cards
    .filter(card => card.transfer?.toIdx === toIdx && card.transfer.startTurn < turn &&
      R.isAlive(card) && !R.isPinned(card))
    .map(card => ({ source, card })) || []);
  if (!transfers.length) return 0;
  const formation = destination.cards.slice();
  for (const { card } of transfers) {
    const position = choosePosition ? choosePosition(card, formation) : formation.length;
    if (!Number.isInteger(position) || position < 0 || position > formation.length) return null;
    formation.splice(position, 0, card);
  }
  for (const { source, card } of transfers) {
    source.cards.splice(source.cards.indexOf(card), 1);
    finishIndividualTransfer(card, source, destination);
  }
  destination.cards = formation;
  return transfers.length;
}
/** §17.92 地形を受け入れて新しいグループが成立。 */
function completeFormingGroup(side, idx) {
  const groups = state.groups[side];
  const destination = groups[idx];
  if (!destination?.forming) return;
  updateTransfers();
  if (!destination.forming) return;
  groups.forEach(source => {
    if (!source || source === destination) return;
    const arrivals = source.cards.filter(card => card.transfer?.toIdx === idx);
    if (!arrivals.length) return;
    source.cards = source.cards.filter(card => card.transfer?.toIdx !== idx);
    arrivals.forEach(card => finishIndividualTransfer(card, source, destination));
    destination.cards.push(...arrivals);
  });
  destination.forming = null;
}
/** §17.84 ピンで移送を打ち切る。設立中にピンが出た場合は全員が戻る。 */
function updateTransfers() {
  const R = window.INFANTRY_RULES;
  if (!R || !state.groups) return;
  ['player', 'ai'].forEach(side => {
    const groups = state.groups[side] || [];
    groups.forEach(source => source?.cards.forEach(card => {
      if (!card.transfer) return;
      const index = card.transfer.toIdx;
      const destination = groups[index];
      if (!R.isAlive(card) || !destination || destination.eliminated) {
        finishIndividualTransfer(card, source, destination);
      } else if (R.isPinned(card)) {
        if (destination.forming) cancelFormingGroup(side, index);
        else finishIndividualTransfer(card, source, destination);
      }
    }));
    groups.forEach((group, index) => {
      if (group?.forming && !incomingTransit(side, index).length) cancelFormingGroup(side, index);
    });
  });
}

/** §17.7 グループ側方移送の移動先候補: 隣の空いた位置（A〜D） */
function shiftDestinations(side, fromIdx) {
  const arr = state.groups[side];
  const out = [];
  [fromIdx - 1, fromIdx + 1].forEach(j => {
    if (!isInitialGroupSlot(j) || state.shiftOccupiedAtTurnStart?.has(j)) return;
    const g = arr[j];
    if (!g || (g.eliminated && !g.forming) || (g.cards.length === 0 && !g.forming)) { if (j <= arr.length) out.push(j); }
  });
  return out;
}
function groupShiftBlockReason(side, index) {
  const R = window.INFANTRY_RULES;
  const g = state.groups[side][index];
  const acted = side === 'player' ? state.actedGroups : state.aiActedGroups;
  if (!_groupAlive(g) || g.forming) return '移送できるグループがありません';
  if (acted?.has(index) || g.firedFPThisTurn > 0 || (side === 'ai' && state.aiFiredGroups?.has(index))) {
    return `GROUP ${g.name} はこの手番に行動済みです`;
  }
  if (window.CC_ACTION?.isInfiltratedByEnemy(g)) {
    return `GROUP ${g.name} は敵に侵入されているため側方移送できません（§20.56）`;
  }
  if (g.pendingShift || g.encircled || g._immob || g._bog || g._stun ||
      g.cards.some(c => R.isAlive(c) && (R.isPinned(c) || c.infiltrating)) || R.hasTerrainType(g, 'WIRE')) {
    return `GROUP ${g.name} は現在、側方移送できません（§17.7）`;
  }
  return null;
}

function startGroupShift(group, side, card, toIdx, partnerIdx = null) {
  const R = window.INFANTRY_RULES;
  const fromMarsh = R.isInMarsh(group);
  const move = R.isInStream(group) && !R.hasCrossedStream(group)
    ? attemptStreamMovement(group, side, card) : null;
  if (move?.result === 'failed') return false;
  if (!move) {
    card._moveMode = 'lateral';
    pushTerrainWithFaction(group, card);
  }
  group.pendingShift = { toIdx, card, partnerIdx, ready: fromMarsh };
  if (R.hasTerrainType(group, 'MINEFIELD')) triggerMinefieldRNCCheck(group, side);
  return true;
}

/** 位置の付け替えに伴って、グループ番号で持っている参照を付け替える（側面射撃・包囲は §17.44/§17.62 で終わる） */
function _remapGroupIdx(side, map) {
  const enemy = _enemySide(side);
  const m = i => (map[i] != null ? map[i] : i);
  // 動いたグループが関わる側面射撃・包囲は終わる
  const moved = Object.keys(map).map(Number).concat(Object.values(map));
  ['player', 'ai'].forEach(sd => (state.groups[sd] || []).forEach(g => {
    if (!g) return;
    if (sd === side && moved.includes(state.groups[sd].indexOf(g))) {
      clearOutgoingFlanks(g);
      g.encirclingIdx = null;
    }
    if (sd === enemy && g.flankingTarget != null && moved.indexOf(g.flankingTarget) >= 0) { g.flankingTarget = null; g.flankCard = null; }
  }));
  ['player', 'ai'].forEach(sd => (state.groups[sd] || []).forEach(y => {
    if (y && y.encircled && y.encircledBy && y.encircledBy.side === side
        && (moved.indexOf(y.encircledBy.rearIdx) >= 0 || moved.indexOf(y.encircledBy.frontIdx) >= 0)) {
      y.encircled = false; y.encircledBy = null;
    }
  }));
  // 侵入先・補足・夜間の認知・移送先の番号
  ['player', 'ai'].forEach(sd => (state.groups[sd] || []).forEach(g => {
    if (!g) return;
    g.cards.forEach(c => {
      if (c.infiltrating && c.infiltratedGroupSide === side && c.infiltratedGroupIdx != null) c.infiltratedGroupIdx = m(c.infiltratedGroupIdx);
      if (sd === side && c.transfer) c.transfer.toIdx = m(c.transfer.toIdx);
    });
    if (sd === enemy) {
      if (Array.isArray(g.recognizedTargets)) g.recognizedTargets = g.recognizedTargets.map(m);
      if (Array.isArray(g.pinpointing)) g.pinpointing = g.pinpointing.map(m);
    }
    if (g.pinpointedBy && g.pinpointedBy.side === side) g.pinpointedBy.idx = m(g.pinpointedBy.idx);
  }));
  const acted = side === 'player' ? state.actedGroups : state.aiActedGroups;
  if (acted) { const arr = [...acted].map(m); acted.clear(); arr.forEach(x => acted.add(x)); }
}
/** §17.7 グループ側方移送を実行（空いた位置へ移る／隣のグループと入れ替わる） */
function doGroupShift(side, fromIdx, toIdx) {
  const arr = state.groups[side];
  const g = arr[fromIdx];
  if (!g) return;
  const other = arr[toIdx];
  const swap = !!(other && !other.eliminated && other.cards.length > 0);
  const map = {}; map[fromIdx] = toIdx; if (swap) map[toIdx] = fromIdx;
  if (swap) {
    arr[toIdx] = g; arr[fromIdx] = other;
    other.name = groupSlotName(fromIdx);
  } else {
    const empty = { name: groupSlotName(fromIdx), cards: [], distance: 0, terrain: [], actions: [], _faction: g._faction, eliminated: true };
    retainGroupCasualties(side, other);
    if (toIdx < arr.length) arr[toIdx] = g; else arr.push(g);
    arr[fromIdx] = empty;
  }
  g.name = groupSlotName(toIdx);
  _remapGroupIdx(side, map);
}
/** §17.7 名称変更は、横向きの移動カードの上に地形カードが置かれて認められた時に成立（湿地は移動カード1枚で成立）。
 *  その前に横向きの移動カードがなくなった（拒否・渡河失敗など）ら不成立。入れ替えは両方成立した時だけ */
function updateGroupShifts() {
  ['player', 'ai'].forEach(side => {
    const arr = state.groups[side] || [];
    const turn = state.turnCount || 0;
    arr.forEach(g => {
      if (!g?.pendingShift) return;
      const ps = g.pendingShift;
      if (g.eliminated || (ps.readyThrough != null && turn > ps.readyThrough) ||
          (!ps.ready && !g.terrain.includes(ps.card))) g.pendingShift = null;
    });
    arr.forEach(g => {
      const ps = g?.pendingShift;
      if (ps?.partnerIdx == null) return;
      const partner = arr[ps.partnerIdx];
      if (partner?.eliminated) ps.partnerIdx = null;
      else if (!partner?.pendingShift) g.pendingShift = null;
    });
    for (let gi = 0; gi < arr.length; gi++) {
      const g = arr[gi];
      if (!g || !g.pendingShift || !g.pendingShift.ready) continue;
      const ps = g.pendingShift;
      if (ps.partnerIdx != null) {
        const p = arr[ps.partnerIdx];
        if (!p.pendingShift.ready) continue;
        p.pendingShift = null;
      }
      g.pendingShift = null;
      doGroupShift(side, gi, ps.toIdx);
      if (side === 'player') alert(`§17.7 グループ側方移送が成立しました（GROUP ${groupSlotName(gi)} → GROUP ${groupSlotName(ps.toIdx)}）`);
      break; // 配列が変わったので次の描画で残りを処理
    }
  });
}
/** 地形カードが置かれて認められた（側方移送の成立・新グループの設立完了の判定用） */
function onTerrainAccepted(grp) {
  const p = _groupSideIdx(grp);
  if (!p) return;
  if (grp.pendingShift && !grp.pendingShift.ready) {
    grp.pendingShift.ready = true;
    if (grp.pendingShift.partnerIdx != null) {
      grp.pendingShift.readyThrough = (state.turnCount || 0) + Number(state.currentTurn !== p.side);
    }
  }
  if (grp.forming) completeFormingGroup(p.side, p.idx);
}

function trackFireSmoke(source, target) {
  const R = window.INFANTRY_RULES;
  const modifier = (group, attacker) => R.calcTerrainMod(group.terrain.filter(card =>
    card.terrain?.type === 'SMOKE'), attacker);
  const initialAttack = modifier(source, true);
  const initialDefense = modifier(target, false);
  return (includeDefense = true) => modifier(source, true) - initialAttack +
    (includeDefense ? modifier(target, false) - initialDefense : 0);
}

/** 判定カードに風（BREEZE）があれば全グループの煙幕を除去 */
function checkBreezeRemoveSmoke(judgeCard) {
  if (!judgeCard || !judgeCard.terrain) return;
  const sub = judgeCard.terrain.sub || '';
  if (sub.indexOf('風') < 0 && sub.indexOf('BREEZE') < 0) return;
  state.breezeTurn = state.turnCount || 0; // §13.2 風が出たターンは煙幕を置けない
  let removed = 0;
  ['player', 'ai'].forEach(side => {
    state.groups[side].forEach(g => {
      for (let i = g.terrain.length - 1; i >= 0; i--) {
        if (g.terrain[i] && g.terrain[i].terrain && g.terrain[i].terrain.type === 'SMOKE') {
          pushTerrainToDiscard(g.terrain.splice(i, 1)[0]);
          removed++;
        }
      }
    });
  });
  if (removed > 0) {
    showAIAction('風: 煙幕 ' + removed + '枚除去', judgeCard);
    renderField('player'); renderField('ai');
  }
}

function terrainIndexFromCard(card) {
  if (!card) return -1;
  if (typeof card.terrainIndex === 'number') return card.terrainIndex;
  const t = card.terrain;
  if (!t || t.num == null) return -1;
  const ix = TERRAIN_CARDS.findIndex(c => c.num === t.num);
  return ix >= 0 ? ix : -1;
}

/** 手札から捨てる／判定で使い切ったカードを捨て札山へ（インデックスで戻す） */
function pushTerrainToDiscard(card) {
  ensureTerrainDeck();
  const d = state.terrainDeck;
  if (!d || !card) return;
  // §24.6 グループに置かれた地雷原（裏返して平地にしたものも含む）は捨て札にしない＝ゲームから除外
  if (card._minefieldPlaced || card._surpriseBuilding) {
    updateDeckCounts();
    return;
  }
  const ix = terrainIndexFromCard(card);
  if (ix < 0) return;
  // シナリオのデッキ除去ルール判定
  if (!state.deckRemoved) state.deckRemoved = {};
  const printedCard = { terrain: TERRAIN_CARDS[ix] || card.terrain };
  const wasOpenGround = card._faceDown && card._isPlain;
  if (!wasOpenGround && window.SCENARIO_HELPERS &&
      window.SCENARIO_HELPERS.shouldRemoveFromGame(state.scenario, printedCard, state.deckRemoved)) {
    updateDeckCounts();
    return;
  }
  d.discard.push(ix);
  updateDeckCounts();
}
window.pushTerrainToDiscard = pushTerrainToDiscard;

function showTerrainDeckGameOver() {
  if (state.phase !== 'play') return;
  if (checkEditorVictory(true)) return;
  if (state.scenario?.victory?.type === 'buildingParity') {
    if (checkBuildingParityVictory()) return;
    const defender = state.playerRole === 'defender' ? 'player' : 'ai';
    const name = state[defender].name;
    state.terrainDeck.gameOver = true;
    state.phase = 'gameover';
    updateDeckCounts();
    alert(radioText(`奇襲 — 時間切れ。守備側の${name}が勝利！`,
      `Surprise Attack — Time is up. ${langTranslate(name)} wins on defense!`));
    endCampaignScenario(defender);
    return;
  }
  const lim = getScenarioDeckCycles();
  const hasVictory = id => ufUsesVictory(state.scenario, id);
  state.terrainDeck.gameOver = true;
  updateDeckCounts();
  // シナリオB: VP判定
  if (hasVictory('B')) {
    if (typeof checkScenarioBVictory === 'function') checkScenarioBVictory();
    return;
  }
  // シナリオC・D: 時間切れは防御側の勝ち（防御側は攻守 state.playerRole で決まる）
  if (['C', 'D', 'E'].some(hasVictory)) {
    const defSide = state.playerRole === 'defender' ? 'player' : 'ai';
    const defName = defSide === 'player' ? state.player.name : state.ai.name;
    state.phase = 'gameover';
    alert(state.scenario.id === 'C'
      ? `シナリオC 終了：${defName} の勝利！ (防御側がトーチカを守り切った)`
      : `シナリオ${state.scenario.id} 終了：${defName} の勝利！ (防御側が持ちこたえた)`);
    endCampaignScenario(defSide);
    return;
  }
  // §16.4 勝利条件を満たさぬまま時間切れ → 勝利ポイントの多い方が勝者
  state.phase = 'gameover';
  const pVP = calcVictoryPoints('player');
  const aVP = calcVictoryPoints('ai');
  if (pVP > aVP) {
    alert(`時間切れ（山札${lim}回）：${state.player.name} の勝利！ (勝利ポイント ${pVP} vs ${aVP})`);
    endCampaignScenario('player');
  } else if (aVP > pVP) {
    alert(`時間切れ（山札${lim}回）：${state.ai.name} の勝利！ (勝利ポイント ${pVP} vs ${aVP})`);
    endCampaignScenario('ai');
  } else {
    alert(`時間切れ（山札${lim}回）：引き分け (勝利ポイント ${pVP} vs ${aVP})`);
  }
}

function updateDeckCounts() {
  const discEl = document.querySelector('#deck-discard .count');
  const removedEl = document.querySelector('#deck-removed .count');
  if (removedEl) {
    const count = Object.values(state.deckRemoved || {}).reduce((sum, n) => sum + n, 0);
    removedEl.textContent = String(count);
  }
  const drawImg = document.querySelector('#deck-draw .pile-img');
  if (drawImg) drawImg.src = encPath('upfrontimages/地形カード/AD Back.gif');

  const lim = getScenarioDeckCycles();
  const cur = document.getElementById('cycle-cur');
  const cmax = document.getElementById('cycle-max');
  if (!state.terrainDeck) {
    if (discEl) discEl.textContent = '0';
    if (cur) cur.textContent = '1';
    if (cmax) cmax.textContent = ` / ${lim}`;
    return;
  }
  const d = state.terrainDeck;

  if (discEl) discEl.textContent = String(d.discard.length);
  if (cur) {
    const seg = d.gameOver ? lim : Math.min(d.cycle + 1, lim);
    cur.textContent = String(seg);
  }
  if (cmax) cmax.textContent = ` / ${lim}`;
}

