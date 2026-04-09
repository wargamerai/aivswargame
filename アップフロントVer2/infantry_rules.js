/* ============================================================
 * Up Front 歩兵ルールエンジン
 *
 * 対応範囲: 歩兵戦闘に関わるすべてのルール
 *   §3 プレイ準備 / §4 アクション / §5 移動と距離
 *   §6 射撃攻撃 / §7 地形修正 / §8 地形効果(歩兵分のみ)
 *   §9 隠ぺい / §10 ピン状態と回復 / §11 クルー操作兵器
 *   §12 移動射撃 / §13 人工地形 / §14 狙撃兵
 *   §15 コマンドコントロール / §16 デッキ・勝利点
 *   §17 側面射撃・包囲・側方移送・個人移送
 *   §18 兵器の所有(歩兵分のみ)
 *
 * 非対応(別プログラムにて管理):
 *   AFV / IG(歩兵砲) / 迫撃砲 / 砲兵類
 *   それらに固有のルール(オーバーラン, ボグ, ハッチ閉鎖, 命中効果表 等)
 *
 * 設計方針:
 *   - 状態を内部で持たず, 外部の game state を引数で受け取る純粋関数群
 *   - グローバル INFANTRY_RULES に公開
 *   - SOLDIER_CARDS / TERRAIN_CARDS など index.html 側のデータを参照
 * ============================================================ */
(function (global) {
  'use strict';

  // ===== 定数 =====================================================

  // §3.5 国籍別の手札枚数
  const HAND_LIMITS = {
    ger: 5,
    us:  6,
    rus: 4,
  };

  // §4.3 国籍別 1ターンに捨てられる未使用手札の上限
  // ドイツ: 1枚 (アクション有無に関わらず)
  // 米   : アクション無しのターンに 2 枚まで
  // ソ連 : アクション無しのターンに 何枚でも
  const DISCARD_LIMITS = {
    ger: { withAction: 1, withoutAction: 1 },
    us:  { withAction: 0, withoutAction: 2 },
    rus: { withAction: 0, withoutAction: Infinity },
  };

  // §3.2 グループ編成の上下限 (歩兵)
  const GROUP_MIN = 2;
  const GROUP_MAX = 10;
  const MAX_GROUPS_INITIAL = 4;

  // §17.82 個人移送によりグループ人数の上限
  const TRANSFER_MAX = 11;

  // 砲兵類/AFV/IG など歩兵ルールでは扱わない武器カテゴリ (前方一致)
  const NON_INFANTRY_WEAPON_PREFIXES = [
    '60mm迫撃砲', '50mm迫撃砲', '迫撃砲',
  ];

  // クルー操作兵器のカテゴリ (歩兵範囲)
  // 中機関銃 / 軽機関銃 / バズーカ / パンツァーシュレック / 火炎放射器
  const CREW_WEAPON_PREFIXES = [
    '中機関銃', '軽機関銃',
    'バズーカ', 'パンツァーシュレック',
    '火炎放射器',
  ];

  // ボルトアクションライフル (移動射撃で半減 §12.11)
  const BOLT_ACTION_PREFIXES = ['ボルトアクション'];

  // §8.41 「湿地」内から射撃不可となる武器
  const NO_FIRE_FROM_MARSH = ['中機関銃'];
  // §8.52 「河川」内から射撃不可となる武器
  const NO_FIRE_FROM_STREAM = ['中機関銃'];

  // §10.12 ピン状態の兵士がいるグループは「移動」カードを置けない
  // §10.11 ピン兵士の火力は加算しない

  // ===== ヘルパ ====================================================

  function startsWithAny(s, prefixes) {
    if (!s) return false;
    return prefixes.some(p => s.indexOf(p) === 0);
  }

  function isInfantryWeapon(weaponCat) {
    return !startsWithAny(weaponCat, NON_INFANTRY_WEAPON_PREFIXES);
  }

  function isCrewWeapon(weaponCat) {
    return startsWithAny(weaponCat, CREW_WEAPON_PREFIXES);
  }

  function isBoltAction(weaponCat) {
    return startsWithAny(weaponCat, BOLT_ACTION_PREFIXES);
  }

  // ユニットカード(state.groups[].cards[i]) → 兵士定義(SOLDIER_CARDS から)
  function lookupSoldier(card, factionKey) {
    if (!card || !factionKey) return null;
    const list = (global.SOLDIER_CARDS && global.SOLDIER_CARDS[factionKey]) || [];
    if (!list.length) return null;
    // card.id 形式: "Ger_1" / "US_3" / "russian_5" / "Rus_31"
    // または "Ger 1" など (区切り問わず最後の数値を拾う)
    const m = String(card.id).match(/(\d+)\s*$/);
    if (!m) return null;
    const num = parseInt(m[1], 10);
    return list.find(s => s.num === num) || null;
  }

  // ユニットの ピン状態フラグ (UI が card.pinned を持つ前提)
  function isPinned(card)   { return !!(card && card.pinned); }
  function isWounded(card)  { return !!(card && card.wounded); }
  function isKilled(card)   { return !!(card && card.killed); }
  function isPanicked(card) { return !!(card && card.panicked); }
  function isAlive(card)    { return card && !card.killed && !card.routed && !card.panicked; }

  // 範囲インデックス: 距離(0-5, 6以上は5扱い)
  function rangeIndex(distance) {
    const d = Math.max(0, Math.min(5, Math.floor(distance)));
    return d;
  }

  // 数値文字列 → int (空/不正は0)
  function num(v) {
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }

  // ===== §5 移動と距離 =============================================

  /**
   * §5.6 相対距離: 双方の距離チットの合計から算出。
   * 5を超えたら 10 - 合計 とする (5 のチット + 追加チットの仕組み)。
   * 0 未満は 0 として扱う(§5.51 撤退ルール)。
   */
  function relativeRange(distA, distB) {
    let sum = (distA | 0) + (distB | 0);
    // 5+追加 表現: ここでは合計のまま 5 を超えたら 10-sum
    if (sum > 5) sum = 10 - sum;
    if (sum < 0) sum = 0;
    return sum;
  }

  /**
   * §5.61 側方距離: 真正面でなく隣接もしていない場合 -1
   */
  function relativeRangeBetweenGroups(grp1, grp2, opts) {
    const base = relativeRange(grp1.distance, grp2.distance);
    if (!opts) return base;
    const sideways = opts.sameOpposing === false && opts.adjacent === false;
    return sideways ? Math.max(0, base - 1) : base;
  }

  /**
   * §5.51 後退可能か: 既に最近敵との相対距離が 0 で, それ以上下がれない場合 false
   * 後退モードを試みる時は呼び出し側で更新前に判定する。
   */
  function canRetreat(group, closestEnemyGroup, useRedRNCCard) {
    const newDist = group.distance - 1;
    const tmp = { distance: newDist };
    const newRR = relativeRange(tmp.distance, closestEnemyGroup.distance);
    if (newRR > 0) return true;
    // RR が 0 以下: 距離チットが 0 以下になっても 赤RNCの移動カードなら可
    if (newDist >= 0) return true; // 通常後退の範囲
    return !!useRedRNCCard;
  }

  /**
   * §5.7 ブロック位置: 真正面の敵グループとの相対距離 5 で前進不可
   */
  function isBlocked(group, opposingGroup) {
    return relativeRange(group.distance, opposingGroup.distance) >= 5;
  }

  // ===== §6/§7 射撃力計算 ==========================================

  /**
   * §6.2 グループの利用可能火力
   * 引数:
   *   group       : { cards: [unit] }
   *   factionKey  : 'us'|'ger'|'rus'
   *   distance    : 相対距離 0-5
   *   crewMap     : { soldierIndex: assistantSoldierIndex } (任意)
   *   moving      : 移動中フラグ (§12)
   * 戻り値: 集計火力 (整数)
   */
  function calcGroupFirepower(group, factionKey, distance, ctx) {
    const opts = ctx || {};
    const idx = rangeIndex(distance);
    let total = 0;
    group.cards.forEach((card, i) => {
      // §10.11 ピン状態の兵士の火力は加算しない
      if (isPinned(card) || !isAlive(card)) return;
      const def = lookupSoldier(card, factionKey);
      if (!def) return;

      // 砲兵類/迫撃砲などは歩兵ルール対象外
      if (!isInfantryWeapon(def.weaponCat)) return;

      let fp = num(def.range[idx]);
      const crewed = isCrewWeapon(def.weaponCat);

      // クルー操作兵器: アシスタント完備でなければ () 内の半減火力を使う
      // CSV では range が括弧無しの値だが, クルー有無のフラグを XValで持つ。
      // ここではアシスタント割当 (opts.crewMap[i]) があるかで判定。
      const hasAssistant = !!(opts.crewMap && opts.crewMap[i] != null);
      if (crewed && !hasAssistant) {
        // §11.1 クルー無しは括弧火力 = 半減 (端数切り捨て)
        fp = Math.floor(fp / 2);
      }

      // §12.1 移動射撃: 火力半減
      if (opts.moving) {
        // 砲兵類/火炎放射器の例外があるが, 火炎放射器は半減しない
        if (def.weaponCat.indexOf('火炎放射器') !== 0) {
          // §12.11 ボルトアクションも 1/2 (端数切捨て)
          fp = Math.floor(fp / 2);
        }
        // §12.12 移動中は中機関銃/軽機関銃のクルー無しは射撃不可等
        if (def.weaponCat.indexOf('中機関銃') === 0) fp = 0;
        if (def.weaponCat.indexOf('軽機関銃') === 0 && !hasAssistant) fp = 0;
      }
      total += fp;
    });
    return total;
  }

  /**
   * §6.41/§6.42/§7 地形修正:
   * カードリストから, 防御側に対する射撃修正値を求める。
   * §7.2: 最後に置かれた地形/移動カードの修正を採用。
   *        ただし最後が「移動」なら, 直前の地形カードの修正値も加算する。
   *        「煙幕/鉄条網」は更に積まれていれば加算する。
   * 引数:
   *   terrainStack: 場のグループに置かれた地形/移動カードのスタック (古→新)
   *                 各要素は { terrain: { type, modifier, sub } } を想定
   *   asAttacker  : true なら攻撃側として「○付き修正(+/-)」のみを返す
   *                 false なら防御側として「○無し修正」のみを返す
   * 戻り値: 修正値 (整数)
   */
  function calcTerrainMod(terrainStack, asAttacker) {
    if (!terrainStack || terrainStack.length === 0) return 0;
    let mod = 0;

    // §7.1 「+」「-」記号が ◯ で囲まれていれば射撃する側 (attacker) への修正
    //      無ければ防御側への修正
    // CSV の "modifier" 列は文字列。 "⊙-1/-1" のような複合表記もある。
    // 簡易解析: 値が "X/Y" 形式なら 攻撃側=X, 防御側=Y とみなす。
    const parseMod = (rawMod) => {
      if (!rawMod) return { atk: 0, def: 0 };
      const s = String(rawMod);
      // ⊙ や * を取り除いた数値部分を拾う
      const clean = s.replace(/[*⊙]/g, '');
      if (clean.indexOf('/') >= 0) {
        const parts = clean.split('/');
        return {
          atk: num(parts[0].replace(/[^\-+0-9]/g, '')),
          def: num(parts[1].replace(/[^\-+0-9]/g, '')),
        };
      }
      const v = num(clean.replace(/[^\-+0-9]/g, ''));
      // ⊙ 付き → 攻撃側 / 無し → 防御側
      if (s.indexOf('⊙') >= 0) return { atk: v, def: 0 };
      return { atk: 0, def: v };
    };

    // 最後のカードが移動か地形か
    const last = terrainStack[terrainStack.length - 1];
    const lastType = last && last.terrain && last.terrain.type;
    const isLastMovement = lastType === 'MOVEMENT';

    if (isLastMovement) {
      // §7.2 最後が移動 → 直前の地形カード修正 + 移動の修正 + 煙幕/鉄条網 を合算
      for (let i = 0; i < terrainStack.length; i++) {
        const t = terrainStack[i].terrain;
        if (!t) continue;
        const m = parseMod(t.modifier);
        mod += asAttacker ? m.atk : m.def;
      }
    } else {
      // 通常: 最後の地形のみを採用 (ただし煙幕/鉄条網が更に積まれていれば加算)
      // §13.25/§13.6 効果は累積
      let baseAdded = false;
      for (let i = terrainStack.length - 1; i >= 0; i--) {
        const t = terrainStack[i].terrain;
        if (!t) continue;
        const isArtificial = (t.type === 'SMOKE' || t.type === 'WIRE');
        const m = parseMod(t.modifier);
        if (isArtificial) {
          mod += asAttacker ? m.atk : m.def;
          continue;
        }
        if (!baseAdded) {
          mod += asAttacker ? m.atk : m.def;
          baseAdded = true;
          break;
        }
      }
    }
    return mod;
  }

  // ===== §6.5/§6.6 射撃結果解決 ====================================

  /**
   * §6.5 1名の兵士に対する射撃結果を出す。
   * 引数:
   *   finalFP : 修正後最終射撃力
   *   rnc     : 引いたカードの RNC 数値 (黒は正/赤は負)
   *   soldier : 兵士定義
   *   wasPinned: 既にピン状態か
   *   rncRPC  : 同カードの RPC (パニック→潰走判定用, 0..9)
   * 戻り値: { result: 'NONE'|'PIN'|'PANIC_KIA'|'PANIC_ROUT'|'KIA' }
   */
  function resolveFireOnSoldier(finalFP, rnc, soldier, wasPinned, rncRPC) {
    const sum = (finalFP | 0) + (rnc | 0);
    if (!soldier) return { result: 'NONE' };

    if (!wasPinned) {
      const morale = num(soldier.morale);
      const kia    = num(soldier.kiaFront);
      // KIA 値以上 → 戦死
      if (kia > 0 && sum >= kia) return { result: 'KIA' };
      // モラル値以上 (KIA未満) → ピン
      if (morale > 0 && sum >= morale) return { result: 'PIN' };
      return { result: 'NONE' };
    }

    // 既にピン状態 → KIA(裏)/パニック値で判定
    const kiaBack = num(soldier.kiaBack);
    const panic   = num(soldier.panic);
    if (kiaBack > 0 && sum >= kiaBack) return { result: 'KIA' };
    if (panic > 0 && sum >= panic) {
      // §6.531 潰走チェック: rncRPC > パニック値 なら戦死せず潰走
      const rpc = (rncRPC == null) ? 0 : (rncRPC | 0);
      if (rpc > panic) return { result: 'PANIC_ROUT' };
      return { result: 'PANIC_KIA' };
    }
    return { result: 'NONE' };
  }

  /**
   * §6.6 グループ内全兵士へ順次解決
   * draws: [{rnc, rpc}, ...] (兵士数と同数, 各兵士1枚)
   * 戻り値: 各兵士の結果配列
   */
  function resolveFireOnGroup(group, factionKey, finalFP, draws) {
    return group.cards.map((card, i) => {
      if (!isAlive(card)) return { result: 'NONE' };
      const def = lookupSoldier(card, factionKey);
      const draw = draws[i] || {};
      return resolveFireOnSoldier(finalFP, draw.rnc, def, isPinned(card), draw.rpc);
    });
  }

  // ===== §9 隠ぺい =================================================

  /**
   * §9.1 隠ぺいカードによる射撃力減算
   *   concealmentValue: 1..3 (カード値)
   * 戻り値: 修正後最終射撃力
   */
  function applyConcealment(finalFP, concealmentValue) {
    return Math.max(0, (finalFP | 0) - (concealmentValue | 0));
  }

  // ===== §10 ピン状態と回復 =========================================

  function pinSoldier(card)   { card.pinned = true; }
  function unpinSoldier(card) { card.pinned = false; }
  function killSoldier(card)  { card.killed = true; }
  function routSoldier(card)  { card.routed = true; }

  /**
   * §10.2 回復: rallyValue 名までピン解除
   * - rallyValue がピン人数以上 → 全員強制解除 (§10.21)
   * - rallyValue がピン人数未満 → targets[] (任意指定) を解除
   */
  function applyRally(group, rallyValue, targets) {
    const pinIdx = group.cards
      .map((c, i) => (isPinned(c) && isAlive(c)) ? i : -1)
      .filter(i => i >= 0);
    if (pinIdx.length === 0) return [];
    if (rallyValue >= pinIdx.length) {
      pinIdx.forEach(i => unpinSoldier(group.cards[i]));
      return pinIdx;
    }
    const sel = (targets && targets.length === rallyValue)
      ? targets.filter(i => pinIdx.indexOf(i) >= 0)
      : pinIdx.slice(0, rallyValue);
    sel.forEach(i => unpinSoldier(group.cards[i]));
    return sel;
  }

  /**
   * §10.23 全回復: 1グループ内の全ピン解除 (アクション1消費)
   * リーダー条件は呼び出し側で確認。
   */
  function applyFullRally(group) {
    const cleared = [];
    group.cards.forEach((c, i) => {
      if (isPinned(c) && isAlive(c)) { unpinSoldier(c); cleared.push(i); }
    });
    return cleared;
  }

  /**
   * §10.3 自発的パニック: ピンの兵士をアクション消費なしで除去。
   * RNC を引いて 6.53 のパニック/潰走判定を再現。
   */
  function selfPanicSoldier(group, soldierIdx, rnc, rpc) {
    const card = group.cards[soldierIdx];
    if (!card || !isPinned(card) || !isAlive(card)) return { result: 'NONE' };
    const def = lookupSoldier(card, currentFactionOf(group));
    const panic = num(def && def.panic);
    if (rpc > panic) {
      routSoldier(card);
      return { result: 'PANIC_ROUT' };
    }
    killSoldier(card);
    return { result: 'PANIC_KIA' };
  }
  // 補助: グループにメタとして陣営キーを持たせる前提 (group._faction)
  function currentFactionOf(group) { return group && group._faction; }

  // ===== §11 クルー操作兵器 ========================================

  /**
   * §11.1 クルー設定: アシスタントを兵士 i に割り当てる
   * crewMap[i] = j (i: クルー兵器持ち, j: アシスタント)
   */
  function assignCrew(crewMap, weaponBearerIdx, assistantIdx) {
    crewMap[weaponBearerIdx] = assistantIdx;
  }

  function releaseCrew(crewMap, weaponBearerIdx) {
    delete crewMap[weaponBearerIdx];
  }

  // ===== §13 人工地形 (煙幕/鉄条網) ================================

  /**
   * §13.243 風による煙幕一掃: 引いたカードの sub に 'BREEZE' を含む場合に
   *         全グループの 煙幕カードを除去対象として返す。
   * 戻り値: 除去対象 [{groupRef, cardIdx}, ...]
   */
  function breezeRemovesSmoke(allGroups) {
    const out = [];
    allGroups.forEach(g => {
      (g.terrain || []).forEach((tc, i) => {
        if (tc.terrain && tc.terrain.type === 'SMOKE') {
          out.push({ groupRef: g, cardIdx: i });
        }
      });
    });
    return out;
  }

  /**
   * §13.31/13.32 鉄条網を含む射撃修正
   * 防御側 (鉄条網上) は攻撃側射撃力 +1
   * 攻撃側 (鉄条網上) は射撃力 -1
   */
  function wireFireMod(attackerStack, defenderStack) {
    let mod = 0;
    const has = (stack, t) => (stack || []).some(c => c.terrain && c.terrain.type === t);
    if (has(defenderStack, 'WIRE')) mod += 1;
    if (has(attackerStack, 'WIRE')) mod -= 1;
    return mod;
  }

  // ===== §14 狙撃兵 =================================================

  /**
   * §14.3 狙撃解決:
   *   sniperKIArange: [low, high] (例 [5,6])
   *   sniperPINrange: [low, high] (例 [3,4])
   *   rnc: 引いた数字 (色は無関係, 絶対値で判定)
   */
  function resolveSniper(sniperKIArange, sniperPINrange, rnc) {
    const v = Math.abs(rnc | 0);
    const inRange = (rng, x) => rng && x >= rng[0] && x <= rng[1];
    if (inRange(sniperKIArange, v)) return { result: 'KIA' };
    if (inRange(sniperPINrange, v)) return { result: 'PIN' };
    return { result: 'MISS' };
  }

  /**
   * §14.4 狙撃兵チェック: 防御側のアクション
   *   rnc: 黒数字
   *   sniperRnc: 狙撃が攻撃に使った RNC (色無関係, 絶対値)
   * 黒で sniperRnc より大きければ狙撃カードは「非機能」化。
   */
  function sniperCheck(rnc, sniperRnc, isBlack) {
    if (!isBlack) return false;
    return Math.abs(rnc | 0) > Math.abs(sniperRnc | 0);
  }

  // ===== §15 コマンドコントロール ==================================

  /**
   * §15.2/15.3/15.4 SL/ASL の状態から手札枚数を算出。
   * 引数:
   *   factionKey: 'ger'|'us'|'rus'
   *   slState : 'ok'|'pinned'|'killed'
   *   aslState: 'ok'|'pinned'|'killed'
   *   commissar: コミッサールがいる場合 'ok'|'pinned'|'killed' (ソ連用)
   * 戻り値: 手札制限枚数
   */
  function calcHandLimit(factionKey, slState, aslState, commissar) {
    const base = HAND_LIMITS[factionKey] || 5;
    const sl = slState  || 'ok';
    const asl = aslState || 'ok';

    // §15.51 ソ連でコミッサールがいれば SL/ASL のどちらかとして機能
    // §15.4 SL と ASL 両方除去 → 以後ずっと -1
    if (sl === 'killed' && asl === 'killed') {
      if (commissar && commissar !== 'killed') return base; // 代替が生きている
      return base - 1;
    }
    // §15.2 自ターン終了時に SL がピン or 当ターンに除去 → -1
    if (sl === 'pinned' || sl === 'killed') return base - 1;
    return base;
  }

  /**
   * §15.6 アンバランス: 相手が 1 グループのみ → 自分は手札を 1 枚追加で引ける
   */
  function ambalanceBonus(opponentGroups) {
    const alive = opponentGroups.filter(g => g.cards.some(isAlive));
    return alive.length <= 1 ? 1 : 0;
  }

  /**
   * §15.52 コミッサール特典: 同一グループ内の兵士のモラル/パニック値 +1
   */
  function commissarBonus(group, factionKey) {
    const hasUnpinnedCommissar = group.cards.some(c => {
      if (!isAlive(c) || isPinned(c)) return false;
      const def = lookupSoldier(c, factionKey);
      return def && /コミッサール/.test(def.rank || '');
    });
    return hasUnpinnedCommissar ? 1 : 0;
  }

  // ===== §16 アクションデッキ・勝利点 ==============================

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * デッキ管理: 山札が尽きたら捨て札をシャッフルして新たな山札に。
   * 1サイクル = 1デッキ経過。
   */
  function recycleDeck(deck) {
    deck.draw = shuffle(deck.discard);
    deck.discard = [];
    deck.cycle = (deck.cycle | 0) + 1;
    return deck;
  }

  function drawFrom(deck) {
    if (!deck.draw || deck.draw.length === 0) {
      if (!deck.discard || deck.discard.length === 0) return null;
      recycleDeck(deck);
    }
    return deck.draw.shift();
  }

  function discardTo(deck, card) {
    deck.discard = deck.discard || [];
    deck.discard.push(card);
  }

  /**
   * §16.4 勝利点計算 (歩兵分のみ, AFV/IG は別管理)
   * 引数:
   *   ownGroups: 自軍グループ
   *   killedEnemy: KIA で除去した敵兵士数
   *   killedLeaders: 戦死させた指揮官/クルー数 (歩兵)
   *   captives: 捕虜数 (§32)
   *   woundedEnemy: 負傷状態 / 潰走で除去した敵兵士数
   * 戻り値: 勝利点 (整数)
   */
  function calcVictoryPoints(ownGroups, killedEnemy, killedLeaders, captives, woundedEnemy) {
    let vp = 0;
    // 自軍グループ: ピン状態でない / 移動中でない 兵士数 × 距離チット
    ownGroups.forEach(g => {
      const cnt = g.cards.filter(c => isAlive(c) && !isPinned(c) && !c.moving).length;
      vp += cnt * (g.distance | 0);
    });
    vp += (killedEnemy | 0) * 2;       // §16.4 KIA で除去した敵兵士 1 人 = 2 点
    vp += (killedLeaders | 0) * 2;     // §16.4 戦死指揮官/クルー 1 人 = 2 点
    vp += (captives | 0) * 5;          // §32 捕虜 1 人 = 5 点
    vp += (woundedEnemy | 0) * 1;      // 負傷状態 / 潰走除去 = 1 点
    return vp;
  }

  /**
   * §16.5 崩壊した分隊: 自ユニットカードの半分を超える損害で負け
   */
  function isSquadCollapsed(allOwnSoldiers, lostCount) {
    return (lostCount | 0) > Math.floor((allOwnSoldiers | 0) / 2);
  }

  // ===== §17 側面射撃 / 包囲 / 移送 =================================

  /**
   * §17.1/§17.4 側面射撃中の射撃力 2 倍 (火炎放射器を除く)
   */
  function flankFireMultiplier(weaponCat) {
    if (!weaponCat) return 2;
    if (weaponCat.indexOf('火炎放射器') === 0) return 1;
    return 2;
  }

  /**
   * §17.2 隣接条件: アルファベット名称が直前/直後のグループに対してのみ
   *        側面にまわり込める。
   */
  function isAdjacentByName(name1, name2) {
    if (!name1 || !name2) return false;
    const a = name1.charCodeAt(0), b = name2.charCodeAt(0);
    return Math.abs(a - b) === 1;
  }

  /**
   * §17.6 包囲条件: 同一敵グループに対し、相手を挟む 2 自軍グループが
   *        各々相対距離 4 以下にある(初回は4以下, その後5まで維持可)
   */
  function canEncircle(myGroup1, myGroup2, enemyGroup) {
    const r1 = relativeRange(myGroup1.distance, enemyGroup.distance);
    const r2 = relativeRange(myGroup2.distance, enemyGroup.distance);
    return r1 <= 4 && r2 <= 4;
  }

  /**
   * §17.8 個人移送条件:
   *   - 自軍隣接グループ
   *   - 同じ距離チット
   *   - 包囲下でない / 地雷原・鉄条網にいない
   *   - どちらかにピン状態でないリーダー
   *   - 兵士は非ピン
   * 戻り値: { ok: bool, reason: string }
   */
  function canIndividualTransfer(fromGroup, toGroup, soldierIdx, factionKey) {
    if (!fromGroup || !toGroup) return { ok: false, reason: 'group missing' };
    if (fromGroup === toGroup) return { ok: false, reason: 'same group' };
    if (fromGroup.distance !== toGroup.distance) return { ok: false, reason: 'distance mismatch' };
    if (fromGroup.encircled || toGroup.encircled) return { ok: false, reason: 'encircled' };
    if (hasTerrainType(fromGroup, 'WIRE') || hasTerrainType(fromGroup, 'MINEFIELD'))
      return { ok: false, reason: 'wire/mine' };
    const soldier = fromGroup.cards[soldierIdx];
    if (!soldier || !isAlive(soldier) || isPinned(soldier))
      return { ok: false, reason: 'soldier invalid' };
    if (!isAdjacentByName(fromGroup.name, toGroup.name))
      return { ok: false, reason: 'not adjacent' };
    // §17.82 移送先 11 名以上にできない
    if (toGroup.cards.length >= TRANSFER_MAX)
      return { ok: false, reason: 'target full' };
    // どちらかに非ピンのリーダー必要
    const hasLeader = (g) => g.cards.some(c => {
      if (!isAlive(c) || isPinned(c)) return false;
      const d = lookupSoldier(c, factionKey);
      return d && d.leader;
    });
    if (!hasLeader(fromGroup) && !hasLeader(toGroup))
      return { ok: false, reason: 'no leader' };
    return { ok: true };
  }

  function hasTerrainType(group, type) {
    return (group.terrain || []).some(c => c.terrain && c.terrain.type === type);
  }

  /**
   * §17.9 グループ設立条件:
   *   - 個人移送で 2 名以上を新ポジションへ送り出す
   *   - 新ポジションに自軍グループがない
   */
  function canEstablishNewGroup(allOwnGroups, newName, transferSoldiers) {
    if (!newName) return false;
    if (allOwnGroups.some(g => g.name === newName)) return false;
    return transferSoldiers && transferSoldiers.length >= 2;
  }

  // ===== §18 兵器の所有 ============================================

  /**
   * §18.1 KIA で除去された兵士の兵器処理:
   *   湿地/河川にいる/移動中なら 兵器も失われる
   *   それ以外は グループにチットとして残る
   */
  function disposeWeaponOnKIA(group, soldierCard, factionKey) {
    const def = lookupSoldier(soldierCard, factionKey);
    if (!def) return { lost: true };
    const inLost = hasTerrainType(group, 'STREAM') || hasTerrainType(group, 'MARSH') || soldierCard.moving;
    if (inLost) return { lost: true };
    group.weaponPool = group.weaponPool || [];
    group.weaponPool.push({
      weaponCat: def.weaponCat,
      weaponName: def.weaponName,
      range: def.range.slice(),
    });
    return { lost: false };
  }

  /**
   * §18.2 兵器の所有試行:
   *   兵士 (非ピン) が グループの兵器プールから 1 つを所有する。
   *   黒RNC で成功, 赤RNC なら失敗してアクション消費のみ。
   */
  function tryAcquireWeapon(group, soldierIdx, weaponPoolIdx, rnc, isBlack) {
    if (!isBlack) return { ok: false };
    const card = group.cards[soldierIdx];
    if (!card || !isAlive(card) || isPinned(card)) return { ok: false };
    const w = (group.weaponPool || [])[weaponPoolIdx];
    if (!w) return { ok: false };
    card.acquiredWeapon = w;
    group.weaponPool.splice(weaponPoolIdx, 1);
    return { ok: true, weapon: w };
  }

  // ===== 公開 ======================================================

  const API = {
    // constants
    HAND_LIMITS, DISCARD_LIMITS,
    GROUP_MIN, GROUP_MAX, MAX_GROUPS_INITIAL, TRANSFER_MAX,

    // helpers
    lookupSoldier, isInfantryWeapon, isCrewWeapon, isBoltAction,
    isPinned, isWounded, isKilled, isPanicked, isAlive,
    rangeIndex,

    // distance/movement
    relativeRange, relativeRangeBetweenGroups, canRetreat, isBlocked,

    // firepower
    calcGroupFirepower, calcTerrainMod,

    // fire resolution
    resolveFireOnSoldier, resolveFireOnGroup,
    applyConcealment,

    // pin/recovery
    pinSoldier, unpinSoldier, killSoldier, routSoldier,
    applyRally, applyFullRally, selfPanicSoldier,

    // crew
    assignCrew, releaseCrew,

    // smoke/wire
    breezeRemovesSmoke, wireFireMod,

    // sniper
    resolveSniper, sniperCheck,

    // command control
    calcHandLimit, ambalanceBonus, commissarBonus,

    // deck
    shuffle, recycleDeck, drawFrom, discardTo,

    // VP
    calcVictoryPoints, isSquadCollapsed,

    // flank/encirclement/transfer
    flankFireMultiplier, isAdjacentByName, canEncircle,
    canIndividualTransfer, canEstablishNewGroup, hasTerrainType,

    // weapon ownership
    disposeWeaponOnKIA, tryAcquireWeapon,
  };

  global.INFANTRY_RULES = API;

})(typeof window !== 'undefined' ? window : this);
