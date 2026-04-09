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
      rus: { soldierRange: [1, 15] },
      us:  { soldierRange: [1, 12] },
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

  // ===== AI 用の賢い編成 ============================================

  const CREW_WEAPON_PREFIXES = ['中機関銃','軽機関銃','バズーカ','パンツァーシュレック','火炎放射器'];
  function isCrewWeaponDef(def) {
    if (!def || !def.weaponCat) return false;
    return CREW_WEAPON_PREFIXES.some(p => def.weaponCat.indexOf(p) === 0);
  }
  function isLeaderDef(def) {
    return !!(def && def.leader && def.leader.trim().length > 0);
  }

  function getSoldierDefByNum(factionKey, num) {
    const list = (global.SOLDIER_CARDS && global.SOLDIER_CARDS[factionKey]) || [];
    return list.find(s => s.num === num) || null;
  }

  /**
   * 賢い AI 編成:
   *   - グループ数 = round(N / 5) を 2..4 に丸め (デフォルト 2 グループ以上)
   *   - リーダー(分隊長/副分隊長/コミッサール等)を別グループへ分散
   *   - 各クルー操作兵器に同グループのアシスタントを割当
   *   - 残りはサイズが揃うように分配
   * 戻り値: state.groups.{player|ai} に直接代入できる配列
   *         各グループは crewPairs (主番号→副番号) を含む
   */
  function buildAIGroupsSmart(scenario, factionKey) {
    const units = buildUnitCards(scenario, factionKey);
    const N = units.length;
    if (N === 0) return [];

    // グループ数とサイズ:
    //   勝利条件達成のため 最低 1 グループは 4 人以上必要 (シナリオA §16.42)。
    //   グループ数候補からランダムに選ぶ (常に 1 グループは 4+ になるよう調整)。
    let groupCount;
    let groupSizes;
    {
      // 候補: 2 / 3 グループ。N から各サイズ案を作る。
      const candidates = [];
      // 2 グループ案
      if (N >= 4) {
        // 5-5, 4-6, 6-4 等 のうち偏りを抑えた組
        for (let a = Math.max(2, Math.ceil(N/2)); a <= Math.min(10, N - 2); a++) {
          const b = N - a;
          if (b >= 2 && b <= 10) candidates.push([a, b]);
        }
      }
      // 3 グループ案 (どれか 1 つは 4 以上)
      if (N >= 6) {
        for (let a = 4; a <= Math.min(10, N - 4); a++) {
          // 残りを 2 分割 (各 2 以上)
          const rem = N - a;
          for (let b = 2; b <= Math.min(10, rem - 2); b++) {
            const c = rem - b;
            if (c >= 2 && c <= 10) candidates.push([a, b, c]);
          }
        }
      }
      // 1 グループ全員 (極小編成)
      if (N >= 2 && N <= 10) candidates.push([N]);
      // 4 人以上を含むものに限定
      const valid = candidates.filter(arr => arr.some(x => x >= 4));
      const pool = valid.length ? valid : candidates;
      groupSizes = pool[Math.floor(Math.random() * pool.length)];
      groupCount = groupSizes.length;
    }

    const NAMES = ['A','B','C','D'];
    const groups = [];
    for (let g = 0; g < groupCount; g++) {
      groups.push({
        name: NAMES[g], cards: [], distance: 0,
        terrain: [], actions: [], _faction: factionKey,
        crewPairs: {},
      });
    }

    // unit に def を取り出し
    const enriched = units.map(u => {
      const m = String(u.id).match(/(\d+)\s*$/);
      const num = m ? parseInt(m[1], 10) : null;
      const def = getSoldierDefByNum(factionKey, num);
      return { unit: u, num, def, leader: isLeaderDef(def), crew: isCrewWeaponDef(def) };
    });

    // 各グループの目標サイズ (groupSizes) に従って配置する。
    // 残席が 0 のグループには入れない。
    function pickAvailable(skip) {
      // 残席のあるグループ内で最も空きが大きいものを返す
      let best = -1, bestRoom = -1;
      for (let i = 0; i < groupCount; i++) {
        if (skip && skip.has(i)) continue;
        const room = groupSizes[i] - groups[i].cards.length;
        if (room > 0 && room > bestRoom) { bestRoom = room; best = i; }
      }
      return best;
    }

    // 1. リーダーを別グループへ (1 つずつ別の空きグループへ)
    const leaders = enriched.filter(e => e.leader);
    leaders.forEach((e) => {
      const used = new Set(groups.map((g, gi) => g.cards.some(c => {
        const ee = enriched.find(x => x.unit === c);
        return ee && ee.leader;
      }) ? gi : -1).filter(x => x >= 0));
      let gi = pickAvailable(used);
      if (gi < 0) gi = pickAvailable(); // 全グループにリーダー配置済 → 空き優先
      if (gi < 0) return;
      addCard(groups[gi], e);
    });

    // 2. クルー兵器持ち (リーダー以外) を 残席優先で配布
    const crews = enriched.filter(e => e.crew && !e.leader);
    crews.forEach((e) => {
      const gi = pickAvailable();
      if (gi < 0) return;
      addCard(groups[gi], e);
    });

    // 3. 残り
    const rest = enriched.filter(e => !e.leader && !e.crew);
    rest.forEach((e) => {
      const gi = pickAvailable();
      if (gi < 0) return;
      addCard(groups[gi], e);
    });

    // 4. 各クルー兵器に同グループ内のアシスタント(非リーダー/非クルー)を割当
    groups.forEach((g, gi) => {
      // ピック済アシスタント番号セット
      const used = new Set();
      g.cards.forEach((card, ci) => {
        const e = enriched.find(x => x.unit === card);
        if (!e || !e.crew) return;
        // 同グループから assistant 候補を探す
        const candidate = g.cards.find((c2, ci2) => {
          if (ci2 === ci) return false;
          if (used.has(c2.num != null ? c2.num : extractNum(c2))) return false;
          const e2 = enriched.find(x => x.unit === c2);
          if (!e2) return false;
          // 別のクルー兵器でないこと, リーダーは可とする
          if (e2.crew) return false;
          return true;
        });
        if (candidate) {
          const ownerNum = e.num;
          const assistNum = candidate.num != null ? candidate.num : extractNum(candidate);
          g.crewPairs[ownerNum] = assistNum;
          used.add(assistNum);
        }
      });
    });

    return groups;
  }

  function addCard(group, e) {
    // unit に num を持たせて場の描画でも使えるように
    const u = Object.assign({}, e.unit, { num: e.num });
    group.cards.push(u);
  }
  function smallestGroupIdx(groups) {
    let best = 0, bestN = Infinity;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].cards.length < bestN) { bestN = groups[i].cards.length; best = i; }
    }
    return best;
  }
  function extractNum(card) {
    const m = String(card.id).match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : null;
  }

  global.SCENARIOS = SCENARIOS;
  global.SCENARIO_HELPERS = {
    getSoldierNumbers,
    buildUnitCards,
    distributeIntoGroups,
    buildInitialGroups,
    buildAIGroupsSmart,
  };

})(typeof window !== 'undefined' ? window : this);
