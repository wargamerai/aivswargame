/* ============================================================
 * Up Front シナリオデータ
 *
 * 各シナリオの兵士編成 (使用カード番号), 勝利条件, 手札枚数,
 * デッキサイクル数, 開始時地形配置などを定義する。
 * 歩兵専用; AFV/IG/砲兵を含むシナリオは別ファイルで管理する。
 * ============================================================ */
(function (global) {
  'use strict';

  /**
   * シナリオA「パトロール」
   *   双方が斥候/前哨戦闘を行う基本シナリオ。
   *   - ソ連 : Rus 1-12 (12名)
   *   - ドイツ: Ger 1-10 (10名)
   *   - 米軍 : US  1-15 (15名)
   *   勝利条件: 制限時間切れ時に勝利点の多い側 (§16.4)
   *   崩壊判定: §16.5 自軍の半数を超える損害で負け
   */
  const SCENARIO_A_PATROL = {
    id: 'A',
    name: 'パトロール',
    description: '斥候同士の遭遇戦。両軍は互いに前進し、相対距離を詰めて勝利点を稼ぐ。',
    factions: {
      ger: { soldierRange: [1, 10] },
      rus: { soldierRange: [1, 12] },
      us:  { soldierRange: [1, 15] },
    },
    // §16.3 制限時間 (山札サイクル数)
    deckCycles: 3,
    // §3.5 国籍別手札枚数 (シナリオによる例外なし)
    handLimits: { ger: 5, us: 6, rus: 4 },
    // §3.6 開始地形配置: 規定なし(プレイヤーが手札の地形カードを配置)
    initialTerrain: null,
    // 勝利条件 (§16.42 達成型):
    //   相対距離 4 以内 / 侵入されていない自軍グループ /
    //   ピン状態でない兵士が 4 名以上 / その兵士たちへの射撃力を
    //   減じることのできる地形 にいる ことを満たせば勝ち
    victory: {
      type: 'reachAndHold',
      minSoldiers: 4,
      maxRelativeRange: 4,      // この値「以下」を達成
      requireProtectiveTerrain: true,
      requireNotInfiltrated: true,
    },
    // シナリオAでは「トーチカ」「地雷原」を使用しない → 引かれたら「平地」として扱う
    treatAsPlain: ['PILLBOX', 'MINEFIELD'],
    // §16.1 デッキ改変:
    //   判定用 (RNC/RPC) として引かれて捨て札になった、もしくは
    //   プレイヤーの手札から直接捨て札にされた最初の 5 枚の
    //   「建物 (BUILDINGS)」カードはゲームから完全に除去する。
    //   (除去後、残り 3 枚の建物カードは地形カードとして使用できる)
    deckRemovals: [
      { type: 'BUILDINGS', count: 5, trigger: 'firstDiscard' },
    ],
  };

  const SCENARIOS = {
    A: SCENARIO_A_PATROL,
  };

  /**
   * シナリオから 1 陣営の兵士カード番号配列を取り出す。
   */
  function getSoldierNumbers(scenario, factionKey) {
    const f = scenario && scenario.factions && scenario.factions[factionKey];
    if (!f) return [];
    const [lo, hi] = f.soldierRange;
    const out = [];
    for (let i = lo; i <= hi; i++) out.push(i);
    return out;
  }

  /**
   * シナリオから 1 陣営のユニットカード(state.groups[].cards 用)を生成する。
   * UI 側の makeCard と同じ形式 (id, img, imgBack)。
   */
  function buildUnitCards(scenario, factionKey) {
    const fac = (global.FACTIONS || {})[factionKey];
    if (!fac) return [];
    const enc = global.encPath || (s => s);
    const nums = getSoldierNumbers(scenario, factionKey);
    return nums.map(num => {
      // ソ連は番号により prefix が異なる (russian/Rus)
      let prefix = fac.prefix;
      let dir = fac.dir;
      if (factionKey === 'rus') {
        prefix = num <= 30 ? 'russian' : 'Rus';
      }
      return {
        id: `${prefix}_${num}`,
        img:     enc(`${dir}/${prefix} ${num}f.gif`),
        imgBack: enc(`${dir}/${prefix} ${num}b.gif`),
      };
    });
  }

  /**
   * 初期グループ分割: 兵士配列を A〜D の最大 4 グループに分配する。
   * §3.2 各グループ最少 2 名 / 最大 10 名
   * 配分は均等優先 (端数は若いグループへ)。
   */
  function distributeIntoGroups(unitCards) {
    const N = unitCards.length;
    if (N === 0) return [];
    // できるだけ 4 グループ, 各グループ 2 以上 / 10 以下
    let groupCount = Math.min(4, Math.floor(N / 2));
    if (groupCount < 1) groupCount = 1;
    // 1 グループあたりが 10 を超えるなら グループ数を増やす(最大 4)
    while (Math.ceil(N / groupCount) > 10 && groupCount < 4) groupCount++;
    const groups = [];
    const base = Math.floor(N / groupCount);
    let extra = N - base * groupCount;
    let idx = 0;
    const NAMES = ['A', 'B', 'C', 'D'];
    for (let g = 0; g < groupCount; g++) {
      const size = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      const cards = unitCards.slice(idx, idx + size);
      idx += size;
      groups.push({
        name: NAMES[g],
        cards,
        distance: 0,
        terrain: [],
        actions: [],
        _faction: null, // 呼び出し側で設定
      });
    }
    return groups;
  }

  /**
   * シナリオ + 陣営キーから 完全な初期グループ配列を作る。
   * state.groups.player / state.groups.ai に直接代入できる形式。
   */
  function buildInitialGroups(scenario, factionKey) {
    const units = buildUnitCards(scenario, factionKey);
    const groups = distributeIntoGroups(units);
    groups.forEach(g => { g._faction = factionKey; });
    return groups;
  }

  global.SCENARIOS = SCENARIOS;
  global.SCENARIO_HELPERS = {
    getSoldierNumbers,
    buildUnitCards,
    distributeIntoGroups,
    buildInitialGroups,
  };

})(typeof window !== 'undefined' ? window : this);
