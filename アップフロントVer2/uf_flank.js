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
/** §17.1/§17.41/§17.44 側面移動カードによる側面射撃が今も有効か（最後のカードがその側面移動カードのまま、関係グループが健在） */
function cardFlankValid(srcSide, srcIdx) {
  const src = state.groups[srcSide][srcIdx];
  if (!src || src.flankingTarget == null || !src.flankCard) return false;
  const t = src.flankingTarget;
  if (!_groupAlive(src) || !_groupAlive(state.groups[_enemySide(srcSide)][t]) || !_facesOpposite(_enemySide(srcSide), t)) return false;
  return topIgnoringSmoke(src) === src.flankCard;
}
/** §17.4/§17.612 この射撃が側面射撃になるか（側面移動カード・通常側面射撃・包囲下の目標） */
function isFlankFire(srcSide, srcIdx, tgtIdx) {
  const src = state.groups[srcSide][srcIdx];
  const tgt = state.groups[_enemySide(srcSide)][tgtIdx];
  if (!_groupAlive(src) || !_groupAlive(tgt)) return false;
  if (tgt.encircled) return true;
  if (src.flankingTarget === tgtIdx && cardFlankValid(srcSide, srcIdx)) return true;
  // §23.8 通常の側面射撃はトーチカには効かない
  if (window.INFANTRY_RULES.currentTerrainType(tgt) === 'PILLBOX') return false;
  return hasNormalFlank(srcSide, srcIdx, tgtIdx);
}
/** §23.7 トーチカと、その隣の敵グループの関係: 'blocked'＝背後（距離チット合計6以上）で互いに撃てない、
 *  'half'＝一度背後に出て距離チット5へ後退した（まだ背後）→ 撃てるが射撃カードの射撃力は半分、null＝関係なし */
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
  if (sum === 5 && E._behindPillbox === key) return 'half';
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
  const tmp = { cards: ft, terrain: group.terrain, crewPairs: group.crewPairs };
  const flameFP = R.calcGroupFirepower(tmp, factionKey, distance, Object.assign({}, opts || {}, { crewMap: buildCrewMapFromPairs(tmp) }));
  return fp * 2 - Math.min(fp, flameFP);
}
/** 側面移動カードで側面にまわり込めない理由（できるなら null） §17.2 */
function cardFlankBlockReason(srcSide, srcIdx, tgtIdx) {
  const src = state.groups[srcSide][srcIdx];
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
/** 包囲できない理由（できるなら null） §17.6 */
function encircleBlockReason(srcSide, srcIdx, tgtIdx) {
  const tgt = state.groups[_enemySide(srcSide)][tgtIdx];
  if (!_groupAlive(tgt)) return '目標のグループがいません';
  if (Math.abs(srcIdx - tgtIdx) !== 1) return '包囲は敵隣接グループに対してのみ可能です';
  if (!_facesOpposite(_enemySide(srcSide), tgtIdx)) return '包囲する敵グループの真正面に味方のグループがいなければなりません（§17.6）';
  if (!_isBehind(srcSide, srcIdx, tgtIdx)) return '包囲するには、その敵グループの背後（相対距離5を通り過ぎて4以下）にいなければなりません（§17.6）';
  if (tgt.encircled) return 'そのグループはすでに包囲されています';
  const src = state.groups[srcSide][srcIdx];
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
  if (!d || !d.weaponCat || d.weaponCat === '非武装') return null;
  return { weaponCat: d.weaponCat, xVal: d.xVal, weaponName: d.weaponName,
           range: (d.range || []).slice(), rangeData: (d.rangeData || []).slice(), needsCrew: !!d.needsCrew,
           fac: (card.acquiredWeapon && card.acquiredWeapon.fac) || factionKey }; // 兵器の国籍（チット画像用）
}
/** 兵器を持たない状態（§19.4 非武装） */
const UNARMED_WEAPON = { weaponCat: '非武装', xVal: '', weaponName: '', range: ['0','0','0','0','0','0'],
  rangeData: [0,1,2,3,4,5].map(() => ({ main: 0 })), needsCrew: false };
/** 兵士が兵器を手放す（グループの兵器チットとして残す §20.23）。兵士は非武装になる */
function dropWeaponToPool(group, card, factionKey, side) {
  const w = weaponOfCard(card, factionKey);
  if (!w) return;
  (group.weaponPool || (group.weaponPool = [])).push(Object.assign({ fromNum: card.num, assistantNum: null, fromSide: side }, w));
  card.acquiredWeapon = UNARMED_WEAPON;
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
        if (!w) return;
        if (c.routed && !c.killed && !w.needsCrew) return; // 潰走: 兵器とともに抜ける
        let where = g;
        if (c._dropSide && c._dropIdx != null) {
          // §20.742 CC の相打ち: 侵入されたグループに残る
          where = (state.groups[c._dropSide] || [])[c._dropIdx] || g;
        } else if (c.infiltrating && c.infiltratedGroupSide && c.infiltratedGroupIdx != null) {
          where = (state.groups[c.infiltratedGroupSide] || [])[c.infiltratedGroupIdx] || g;
        }
        if (R.isInMarsh(where) || R.isInStream(where)) return; // 湿地・河川では失われる
        const assistantNum = (g.crewPairs && g.crewPairs[c.num] != null) ? Number(g.crewPairs[c.num]) : null;
        (where.weaponPool || (where.weaponPool = [])).push(Object.assign({ fromNum: c.num, assistantNum, fromSide: side }, w));
      });
    });
  });
}

// ===== §17.8 個人移送 / §17.9 グループの設立 / §17.7 グループ側方移送 =====
const GROUP_LETTERS = ['A', 'B', 'C', 'D'];
/** 移送中の兵士: card.transfer = { toIdx, startTurn }（兵士は送り出したグループの cards に残る） */
function transitFireBonus(card) { return card && card.transfer ? 2 : 0; }
function incomingTransit(side, idx) {
  const R = window.INFANTRY_RULES;
  const out = [];
  (state.groups[side] || []).forEach((g, gi) => {
    if (gi === idx || !g) return;
    g.cards.forEach(c => { if (c.transfer && c.transfer.toIdx === idx && (!R || R.isAlive(c))) out.push(c); });
  });
  return out;
}
/** §17.8 攻撃の目標: グループの兵士＋そのグループへ移送中の兵士 */
function attackTargetsOf(group) {
  const p = _groupSideIdx(group);
  return p ? group.cards.concat(incomingTransit(p.side, p.idx)) : group.cards;
}
/** 移送に関わっているグループ（送り出し中・受け取り待ち）は距離チットを動かせない */
function groupInTransfer(side, idx) {
  const g = state.groups[side][idx];
  if (g && g.cards.some(c => c.transfer)) return true;
  return incomingTransit(side, idx).length > 0;
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
/** 移送先の候補: 隣の自軍グループ（同じ距離チット）と、隣の空いた位置（新グループ §17.91） */
function transferDestinations(side, fromIdx) {
  const arr = state.groups[side];
  const src = arr[fromIdx];
  const out = [];
  [fromIdx - 1, fromIdx + 1].forEach(j => {
    if (j < 0 || j > 3) return;
    const g = arr[j];
    if (g && !g.eliminated && (g.cards.length > 0 || g.forming)) {
      if ((g.distance || 0) === (src.distance || 0) && !g.forming) out.push({ idx: j, isNew: false });
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
  if (!src) return '送り出すグループがありません';
  if (src.encircled) return '包囲下のグループは個人移送できません（§17.611）';
  if (R.hasTerrainType(src, 'MINEFIELD') || R.hasTerrainType(src, 'WIRE')) return '地雷原・鉄条網にいるグループは個人移送できません（§17.8）';
  if (R.isInStream(src) && !R.hasCrossedStream(src)) return '未渡河の河川からは、渡河に成功するまで個人移送できません（§17.81）';
  if (R.isInMarsh(src) && R.marshMoveCount(src) < 1) return '湿地からは、先に移動カードを使っていなければ個人移送できません（§17.81）';
  if (soldiers.some(c => !R.isAlive(c) || R.isPinned(c) || c.infiltrating || c.transfer)) return 'ピン状態・侵入中・移送中の兵士は移送できません（§17.8）';
  if (dest.isNew) {
    if (soldiers.length < 2) return '新しいグループを作るには、同時に2名以上を移送しなければなりません（§17.91）';
    if (!_hasActiveLeader(src, side)) return '移送にはピン状態でないリーダーが必要です（§17.8）';
    return null;
  }
  const dst = state.groups[side][dest.idx];
  if (dst.encircled) return '包囲下のグループへは個人移送できません（§17.611）';
  if ((dst.distance || 0) !== (src.distance || 0)) return '同じ距離チットの隣接グループにしか移送できません（§17.8）';
  if (!_hasActiveLeader(src, side) && !_hasActiveLeader(dst, side)) return 'どちらかのグループにピン状態でないリーダーが必要です（§17.8）';
  const R2 = window.INFANTRY_RULES;
  const after = dst.cards.filter(c => R2.isAlive(c)).length + incomingTransit(side, dest.idx).length + soldiers.length;
  if (after > 10) return '移送でグループの兵員を11名以上にすることはできません（§17.82）';
  return null;
}
/** 個人移送を始める（移送チット）。新しい位置なら設立中のグループを作る */
function startTransfer(side, fromIdx, dest, soldiers) {
  const arr = state.groups[side];
  const src = arr[fromIdx];
  if (dest.isNew) {
    const ng = { name: GROUP_LETTERS[dest.idx], cards: [], distance: src.distance || 0, terrain: [], actions: [],
                 _faction: src._faction, crewPairs: {}, forming: { fromIdx } };
    if (dest.idx < arr.length) arr[dest.idx] = ng; else arr.push(ng);
  }
  soldiers.forEach(c => {
    // クルーを組んでいたら解く（移送する兵士は送り出すグループを離れる）
    if (src.crewPairs) Object.keys(src.crewPairs).forEach(o => { if (Number(o) === c.num || Number(src.crewPairs[o]) === c.num) delete src.crewPairs[o]; });
    c.transfer = { toIdx: dest.idx, startTurn: state.turnCount || 0 };
  });
}
/** §17.8 受け取り（受け取るグループの1アクション、移送を始めたターンには不可）。戻り値: 受け取った人数 */
function receiveTransfers(side, toIdx) {
  const arr = state.groups[side];
  const dst = arr[toIdx];
  let n = 0;
  arr.forEach((g, gi) => {
    if (gi === toIdx || !g) return;
    for (let i = g.cards.length - 1; i >= 0; i--) {
      const c = g.cards[i];
      if (c.transfer && c.transfer.toIdx === toIdx && c.transfer.startTurn < (state.turnCount || 0)) {
        g.cards.splice(i, 1);
        delete c.transfer;
        dst.cards.push(c);
        n++;
      }
    }
  });
  return n;
}
/** §17.92 設立中のグループに地形カードが置かれた → 設立完了（移送中の兵士がそのグループに入る） */
function completeFormingGroup(side, idx) {
  const arr = state.groups[side];
  const g = arr[idx];
  if (!g || !g.forming) return;
  arr.forEach((og, gi) => {
    if (gi === idx || !og) return;
    for (let i = og.cards.length - 1; i >= 0; i--) {
      const c = og.cards[i];
      if (c.transfer && c.transfer.toIdx === idx) { og.cards.splice(i, 1); delete c.transfer; g.cards.push(c); }
    }
  });
  g.forming = null;
}
/** §17.84/§17.92 移送中にピン状態になった兵士は元のグループへ戻る（設立中なら全員戻り、設立は失敗） */
function updateTransfers() {
  const R = window.INFANTRY_RULES;
  if (!R || !state.groups) return;
  ['player', 'ai'].forEach(side => {
    const arr = state.groups[side] || [];
    arr.forEach((g, gi) => {
      if (!g) return;
      g.cards.forEach(c => {
        if (!c.transfer) return;
        if (!R.isAlive(c)) { delete c.transfer; return; }
        if (R.isPinned(c)) {
          const toIdx = c.transfer.toIdx;
          const dst = arr[toIdx];
          if (dst && dst.forming) {
            // 設立中の新グループ: 全員戻して新グループを消す
            arr.forEach(og => og && og.cards.forEach(x => { if (x.transfer && x.transfer.toIdx === toIdx) delete x.transfer; }));
            dst.forming = null;
            dst.eliminated = true;
          } else {
            delete c.transfer;
          }
        }
      });
    });
    // 移送中の兵士がいなくなった設立中のグループは消す
    arr.forEach((g, gi) => {
      if (g && g.forming && incomingTransit(side, gi).length === 0) { g.forming = null; g.eliminated = true; }
    });
  });
}

/** §17.7 グループ側方移送の移動先候補: 隣の空いた位置（A〜D） */
function shiftDestinations(side, fromIdx) {
  const arr = state.groups[side];
  const out = [];
  [fromIdx - 1, fromIdx + 1].forEach(j => {
    if (j < 0 || j > 3) return;
    const g = arr[j];
    if (!g || (g.eliminated && !g.forming) || (g.cards.length === 0 && !g.forming)) { if (j <= arr.length) out.push(j); }
  });
  return out;
}
/** 位置の付け替えに伴って、グループ番号で持っている参照を付け替える（側面射撃・包囲は §17.44/§17.62 で終わる） */
function _remapGroupIdx(side, map) {
  const enemy = _enemySide(side);
  const m = i => (map[i] != null ? map[i] : i);
  // 動いたグループが関わる側面射撃・包囲は終わる
  const moved = Object.keys(map).map(Number).concat(Object.values(map));
  ['player', 'ai'].forEach(sd => (state.groups[sd] || []).forEach(g => {
    if (!g) return;
    if (sd === side && moved.indexOf((state.groups[sd]).indexOf(g)) >= 0) { g.flankingTarget = null; g.flankCard = null; g.encirclingIdx = null; }
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
    other.name = GROUP_LETTERS[fromIdx];
  } else {
    const empty = { name: GROUP_LETTERS[fromIdx], cards: [], distance: 0, terrain: [], actions: [], _faction: g._faction, eliminated: true };
    if (toIdx < arr.length) arr[toIdx] = g; else arr.push(g);
    arr[fromIdx] = empty;
  }
  g.name = GROUP_LETTERS[toIdx];
  _remapGroupIdx(side, map);
}
/** §17.7 名称変更は、横向きの移動カードの上に地形カードが置かれて認められた時に成立（湿地は移動カード1枚で成立）。
 *  その前に横向きの移動カードがなくなった（拒否・渡河失敗など）ら不成立。入れ替えは両方成立した時だけ */
function updateGroupShifts() {
  ['player', 'ai'].forEach(side => {
    const arr = state.groups[side] || [];
    arr.forEach((g, gi) => {
      if (!g || !g.pendingShift) return;
      const ps = g.pendingShift;
      if (ps.ready) return;
      if ((g.terrain || []).indexOf(ps.card) < 0) g.pendingShift = null; // 地形が置かれず横移動カードが消えた → 不成立
    });
    // 入れ替えの相手が不成立なら両方とも不成立
    arr.forEach(g => {
      if (g && g.pendingShift && g.pendingShift.partnerIdx != null) {
        const p = arr[g.pendingShift.partnerIdx];
        if (!p || !p.pendingShift) g.pendingShift = null;
      }
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
      if (side === 'player') alert(`§17.7 グループ側方移送が成立しました（GROUP ${GROUP_LETTERS[gi]} → GROUP ${GROUP_LETTERS[ps.toIdx]}）`);
      break; // 配列が変わったので次の描画で残りを処理
    }
  });
}
/** 地形カードが置かれて認められた（側方移送の成立・新グループの設立完了の判定用） */
function onTerrainAccepted(grp) {
  const p = _groupSideIdx(grp);
  if (!p) return;
  if (grp.pendingShift) grp.pendingShift.ready = true;
  if (grp.forming) completeFormingGroup(p.side, p.idx);
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
  if (card._minefieldPlaced) { updateDeckCounts(); return; }
  const ix = terrainIndexFromCard(card);
  if (ix < 0) return;
  // シナリオのデッキ除去ルール判定
  if (!state.deckRemoved) state.deckRemoved = {};
  if (window.SCENARIO_HELPERS && window.SCENARIO_HELPERS.shouldRemoveFromGame(state.scenario, card, state.deckRemoved)) {
    updateDeckCounts();
    return;
  }
  d.discard.push(ix);
  updateDeckCounts();
}
window.pushTerrainToDiscard = pushTerrainToDiscard;

function showTerrainDeckGameOver() {
  const lim = getScenarioDeckCycles();
  state.terrainDeck.gameOver = true;
  updateDeckCounts();
  // シナリオB: VP判定
  if (state.scenario && state.scenario.id === 'B') {
    if (typeof checkScenarioBVictory === 'function') checkScenarioBVictory();
    return;
  }
  // シナリオC・D: 時間切れは防御側の勝ち（防御側は攻守 state.playerRole で決まる）
  if (state.scenario && (state.scenario.id === 'C' || state.scenario.id === 'D' || state.scenario.id === 'E')) {
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
  const drawEl = document.querySelector('#deck-draw .count');
  const discEl = document.querySelector('#deck-discard .count');
  const drawImg = document.querySelector('#deck-draw .pile-img');
  if (drawImg) drawImg.src = encPath('upfrontimages/地形カード/AD Back.gif');

  const lim = getScenarioDeckCycles();
  const cur = document.getElementById('cycle-cur');
  const cmax = document.getElementById('cycle-max');
  if (!state.terrainDeck) {
    if (drawEl) drawEl.textContent = TERRAIN_CARDS.length;
    if (discEl) discEl.textContent = '0';
    if (cur) cur.textContent = '1';
    if (cmax) cmax.textContent = ` / ${lim}`;
    return;
  }
  const d = state.terrainDeck;
  if (drawEl) drawEl.textContent = String(d.draw.length);
  if (discEl) discEl.textContent = String(d.discard.length);
  if (cur) {
    const seg = d.gameOver ? lim : Math.min(d.cycle + 1, lim);
    cur.textContent = String(seg);
  }
  if (cmax) cmax.textContent = ` / ${lim}`;
}

