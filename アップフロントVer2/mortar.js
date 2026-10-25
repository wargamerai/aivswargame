/* 迫撃砲 (Mortar)
 *
 * 命中判定:
 *   - 射撃カード1枚を消費（数字無視）
 *   - RNCチェック1回 → 数字が命中上限以下なら命中（色は関係なし）
 *   - どちらかが移動していれば赤は外れ
 *   - 隠蔽カード: 1枚で命中ランクを1段階下げる
 *   - 補足中の敵には +1 ランク
 *   - 壁から撃つと -1 ランク
 *   - 双方非移動の補足は累積ではなく、補足マークの効果として +1 ランク
 *
 * ダメージ判定:
 *   - 命中したら兵士ごとに判定カードを引き、RNCの数字を加算（射撃と同様）
 *
 * 撃てない地形:
 *   - 建物・トーチカ・川・湿地から撃てない（枯れ谷OK）
 *   - 味方煙幕がある場合、補足中の敵にのみ不利修正(-1ランク)で撃てる
 *
 * クルー:
 *   - クルー不在のときは [ ] 内の数字を使う
 *
 * 補足:
 *   - 砲撃で目標敵グループに「補足」マーク付与
 *   - 砲撃側か目標側のどちらかが移動すると解除
 */
(function (global) {
  'use strict';

  /** "0[2]" / "0-1[1]" / "0-3[0-1]" / "NA/1FP" 等を {main:max, noCrew:max, na:bool} に */
  function parseHitRange(str) {
    if (!str) return { na: true };
    const t = String(str).trim();
    if (t === 'NA' || t.indexOf('NA') === 0) return { na: true };
    // 形式: "X[Y]" の X, Y それぞれ "n" または "n-m"
    const m = t.match(/^([0-9\-]+)\s*\[\s*([0-9\-]+)\s*\]/);
    if (m) {
      return { main: rangeMax(m[1]), noCrew: rangeMax(m[2]) };
    }
    // [ ] が無い場合
    return { main: rangeMax(t) };
  }

  /** "0-2" → 2, "0" → 0, "3" → 3 */
  function rangeMax(s) {
    if (!s) return 0;
    const parts = String(s).split('-');
    let max = -1;
    parts.forEach(p => {
      const n = parseInt(p, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max < 0 ? 0 : max;
  }

  function isAlive(card) {
    return !!(card && !card.killed && !card.routed);
  }

  function isPinned(card) {
    return !!(card && card.pinned && !card.killed && !card.routed);
  }

  /** グループ内の生存している迫撃砲兵士一覧を返す */
  function getMortarShooters(group, factionKey) {
    if (!group || !group.cards) return [];
    const SOLDIERS = global.SOLDIER_CARDS && global.SOLDIER_CARDS[factionKey];
    if (!SOLDIERS) return [];
    const out = [];
    group.cards.forEach((card, i) => {
      if (!isAlive(card)) return;
      if (isPinned(card)) return;
      if (card.malfunctioned || card.destroyed) return;
      const m = String(card.id).match(/(\d+)\s*$/);
      if (!m) return;
      const num = parseInt(m[1], 10);
      const def = SOLDIERS.find(s => s.num === num);
      if (!def) return;
      if (!def.weaponCat || def.weaponCat.indexOf('迫撃砲') < 0) return;
      out.push({ idx: i, card: card, def: def });
    });
    return out;
  }

  /** 兵士にクルー(副)が居るか */
  function hasAssistant(group, ownerIdx) {
    if (!group || !group.crewPairs || !group.cards) return false;
    const owner = group.cards[ownerIdx];
    if (!owner || owner.num == null) return false;
    const assistNum = group.crewPairs[owner.num];
    if (assistNum == null) return false;
    const assistIdx = group.cards.findIndex(c => c.num === assistNum);
    if (assistIdx < 0) return false;
    const a = group.cards[assistIdx];
    return isAlive(a) && !isPinned(a);
  }

  /** 地形スタックの一番上の地形タイプ（MOVEMENTを除く直近の地形） */
  function topNonMoveTerrain(group) {
    if (!group || !group.terrain) return null;
    for (let i = group.terrain.length - 1; i >= 0; i--) {
      const t = group.terrain[i] && group.terrain[i].terrain;
      if (!t) continue;
      if (t.type !== 'MOVEMENT') return t;
    }
    return null;
  }

  /** グループが「煙幕」状態か（地形スタックに SMOKE があるか） */
  function hasSmoke(group) {
    if (!group || !group.terrain) return false;
    return group.terrain.some(c => c && c.terrain && c.terrain.type === 'SMOKE');
  }

  /** 地形スタック末尾がMOVEMENTか（移動中） */
  function isMoving(group) {
    if (!group || !group.terrain || group.terrain.length === 0) return false;
    const last = group.terrain[group.terrain.length - 1];
    return !!(last && last.terrain && last.terrain.type === 'MOVEMENT');
  }

  /** 攻撃側が壁地形にいるか */
  function isOnWall(group) {
    const t = topNonMoveTerrain(group);
    return !!(t && (t.type === 'WALL' || t.type === '壁'));
  }

  /** 攻撃側が丘地形にいるか */
  function isOnHill(group) {
    const t = topNonMoveTerrain(group);
    return !!(t && (t.type === 'HILL' || t.type === '丘'));
  }

  /**
   * 迫撃砲を撃てるかチェック
   * 戻り値: { ok:bool, reason:string, smokePenalty:bool }
   */
  function canFire(srcGroup, tgtGroup, opts) {
    opts = opts || {};
    const R = global.INFANTRY_RULES;
    if (!R) return { ok: false, reason: 'ルールエンジン未読込' };
    // 攻撃側地形制限
    const top = topNonMoveTerrain(srcGroup);
    if (top) {
      if (top.type === 'BUILDINGS') return { ok: false, reason: '建物からは迫撃砲を撃てません' };
      if (top.type === 'BUNKER' || top.type === 'PILLBOX') return { ok: false, reason: 'トーチカからは迫撃砲を撃てません' };
    }
    if (R.isInStream && R.isInStream(srcGroup)) return { ok: false, reason: '河川内からは迫撃砲を撃てません' };
    if (R.isInMarsh && R.isInMarsh(srcGroup))  return { ok: false, reason: '湿地内からは迫撃砲を撃てません' };

    // 味方煙幕: 砲撃不可、ただし補足中の敵には不利修正で可
    let smokePenalty = false;
    if (hasSmoke(srcGroup)) {
      if (tgtGroup && tgtGroup.pinpointed) {
        smokePenalty = true;
      } else {
        return { ok: false, reason: '味方側に煙幕があるため迫撃砲を撃てません（補足中の敵には可）' };
      }
    }
    return { ok: true, smokePenalty: smokePenalty };
  }

  /**
   * 命中数字の上限を計算
   * 引数:
   *   shooter: { def, idx }
   *   distance: 相対距離 (0..5)
   *   group: 射手グループ（クルー判定用）
   *   opts: { conceals:int, pinpoint:bool, wall:bool, smokePenalty:bool }
   * 戻り値: { ceiling:int, na:bool, base:int, hasCrew:bool }
   */
  function calcHitCeiling(shooter, distance, group, opts) {
    opts = opts || {};
    const def = shooter.def;
    if (!def || !def.range) return { ceiling: -1, na: true };
    const raw = def.range[distance];
    const parsed = parseHitRange(raw);
    if (parsed.na) return { ceiling: -1, na: true };
    const hasCrew = hasAssistant(group, shooter.idx);
    const base = (!hasCrew && parsed.noCrew != null) ? parsed.noCrew : parsed.main;
    let ceiling = base;
    if (opts.conceals) ceiling -= opts.conceals; // 隠蔽: ランク-N
    if (opts.pinpoint) ceiling += 1;             // 補足: +1ランク
    if (opts.wall)     ceiling -= 1;             // 壁から撃つ: -1ランク
    if (opts.hill)     ceiling += 1;             // 丘から撃つ: +1ランク
    if (opts.smokePenalty) ceiling -= 1;         // 味方煙幕越し砲撃: -1ランク
    if (ceiling < 0) ceiling = -1;               // 負は命中不可
    return { ceiling: ceiling, na: false, base: base, hasCrew: hasCrew };
  }

  /** RNCの数字（絶対値）と色を返す */
  function readRNC(judge) {
    if (!judge || !judge.terrain) return { num: 0, isRed: false };
    const num = parseInt(judge.terrain.range || '0', 10) || 0;
    const isRed = judge.terrain.rncColor === '赤';
    return { num: num, isRed: isRed };
  }

  /** 迫撃砲の攻撃力（FP）を距離別に返す
   *  - 日本以外: 距離に関わらず2固定
   *  - 日本: 擲弾筒/迫撃砲 距離別 [2,2,2,1,1,0]
   */
  function getMortarFP(soldier, distance, factionKey) {
    if (factionKey === 'jpn') {
      const jpnFP = [2, 2, 2, 1, 1, 0];
      return jpnFP[distance] != null ? jpnFP[distance] : 0;
    }
    return 2;
  }

  global.MORTAR_RULES = {
    parseHitRange: parseHitRange,
    rangeMax: rangeMax,
    getMortarShooters: getMortarShooters,
    hasAssistant: hasAssistant,
    canFire: canFire,
    calcHitCeiling: calcHitCeiling,
    readRNC: readRNC,
    getMortarFP: getMortarFP,
    isMoving: isMoving,
    isOnWall: isOnWall,
    isOnHill: isOnHill,
    hasSmoke: hasSmoke,
  };

  // 旧API（互換）
  global.Mortar = {
    use() { alert('迫撃砲: index.html 側の resolveMortarAction を使用してください'); return false; }
  };

})(typeof window !== 'undefined' ? window : this);
