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
      jpn: { soldierRange: [1, 13] },
      uk:  { soldierRange: [1, 10] },
    },
    // §3.6 / §4.1 先攻陣営
    firstPlayer: 'ger',
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

  /**
   * シナリオB「市街戦」
   *   建物占拠がVPの鍵。森林4枚除去、特殊地形はCower扱い。
   */
  const SCENARIO_B_CITY = {
    id: 'B',
    name: '市街戦',
    description: '市街での戦闘。建物の占拠がVPの鍵。',
    factions: {
      ger: { soldierList: [1,2,3,4,6,9,10,17,18,22], dc: true },
      rus: { soldierList: [2,3,4,5,6,7,8,9,11,12,15,22,23,24,26], dc: true },
      us:  { soldierList: [1,2,3,4,5,6,7,8,9,11,21,22], dc: true },
      jpn: { soldierList: [1,2,3,4,5,6,7,8,9,10,18,19,20], dc: true },
      uk:  { soldierList: [1,2,3,4,5,6,7,16,17,18], dc: true },
    },
    firstPlayer: 'ger',
    deckCycles: 3,
    handLimits: { ger: 5, us: 6, rus: 4, jpn: 4, uk: 5 },
    initialTerrain: null,
    // 建物占拠兵のみ領土VP。時間切れ時VP多い側勝利。
    victory: {
      type: 'vpCount',
      requireBuildingsForTerritorial: true,
    },
    // 特殊地形はCower(非機能)扱い
    treatAsPlain: ['PILLBOX','MINEFIELD','MARSH'],
    // 森林4枚除去
    deckRemovals: [
      { type: 'WOODS', count: 4, trigger: 'firstDiscard' },
    ],
  };

  /**
   * シナリオC「要塞強襲」
   *   攻撃側が防御側トーチカを破壊する非対称シナリオ。
   */
  const SCENARIO_C_ASSAULT = {
    id: 'C',
    name: '要塞強襲',
    description: '攻撃側が防御側のトーチカを破壊せよ。',
    asymmetric: true,
    attackerRole: 'player',
    factions: {
      ger: { soldierList: [1,3,4,5,6,9,10,14,17,24], dc: true },
      rus: { soldierList: [3,5,6,9,11,14,16,17,19,20,22,23,24,25,26], dc: true },
      us:  { soldierList: [1,2,3,4,5,6,7,8,9,12,16,25], dc: true },
      jpn: { soldierList: [1,2,4,5,6,7,8,9,10,12,16,17,18], dc: true },
      uk:  { soldierList: [1,3,4,5,6,9,10,14,17,22], dc: true },
    },
    defenderFactions: {
      ger: { soldierList: [3,4,5,8,9,10,23,24] },
      rus: { soldierList: [1,2,4,5,6,7,9,10,11,14,15,24,25] },
      us:  { soldierList: [1,2,3,4,5,6,7,8,10,12] },
      jpn: { soldierList: [4,5,6,7,8,11,12,13,21,25,27] },
      uk:  { soldierList: [1,4,5,6,7,9,12,22] },
    },
    firstPlayer: 'attacker',
    deckCycles: 3,
    handLimits: { ger: 5, us: 6, rus: 4, jpn: 4, uk: 5 },
    // C.1 防御側はシナリオ開始前にトーチカをグループBに配置
    initialTerrain: {
      defender: [{ groupName: 'B', type: 'PILLBOX' }],
    },
    victory: {
      type: 'pillboxClear',
      description: '攻撃側はトーチカ内の人格カード全滅または放棄で勝利',
    },
    // C.2 攻撃側保有時の地雷原/狙撃兵はCower扱い、湿地は全てCower扱い
    treatAsPlainAttacker: ['MINEFIELD','SNIPER'],
    treatAsPlain: ['MARSH'],
    deckRemovals: [
      { type: 'STREAM', count: 1, trigger: 'firstDiscard' },
      { type: 'BUILDINGS', count: 4, trigger: 'firstDiscard' },
    ],
  };

  /**
   * シナリオD「後衛戦」
   *   攻撃側が防御側を圧迫する非対称シナリオ。
   */
  const SCENARIO_D_REARGUARD = {
    id: 'D',
    name: '後衛戦',
    description: '攻撃側が防御側の後衛部隊を突破する。',
    asymmetric: true,
    attackerRole: 'player',
    factions: {
      ger: { soldierList: [2,3,4,5,6,7,8,9,10,18,22,23,25], dc: true },
      rus: { soldierList: [3,4,5,6,7,8,9,10,11,12,19,20,23,24,25,26,27,28], dc: true },
      us:  { soldierList: [1,2,4,5,6,7,8,9,10,11,12,17,19,24,28], dc: true },
      jpn: { soldierList: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,23], dc: true },
      uk:  { soldierList: [1,3,4,5,6,7,9,10,15,19,22,23,25], dc: true },
    },
    defenderFactions: {
      ger: { soldierList: [2,4,6,8,9,10,12,23] },
      rus: { soldierList: [2,3,4,5,6,7,12,13,14,23,24,25,26] },
      us:  { soldierList: [3,4,6,7,8,9,17,18,20,27] },
      jpn: { soldierList: [1,2,3,4,5,6,7,8,10,18,20] },
      uk:  { soldierList: [3,4,5,9,15,17,21,22] },
    },
    firstPlayer: 'attacker',
    deckCycles: 3,
    handLimits: { ger: 5, us: 6, rus: 4, jpn: 4, uk: 5 },
    initialTerrain: null,
    victory: {
      type: 'reducedDefender',
      attackerMinSoldiers: 5,
      attackerRange: 5,
      requireProtectiveTerrain: true,
    },
    // D.1 攻撃側保有時の狙撃兵はCower扱い、D.2 トーチカ・地雷原はCower扱い
    treatAsPlainAttacker: ['SNIPER'],
    treatAsPlain: ['PILLBOX','MINEFIELD'],
    deckRemovals: [
      { type: 'BUILDINGS', count: 4, trigger: 'firstDiscard' },
    ],
  };

  const SCENARIOS = {
    A: SCENARIO_A_PATROL,
    B: SCENARIO_B_CITY,
    C: SCENARIO_C_ASSAULT,
    D: SCENARIO_D_REARGUARD,
  };

  /**
   * シナリオから 1 陣営の兵士カード番号配列を取り出す。
   * role='attacker'|'defender' を指定すれば非対称シナリオの defenderFactions を参照
   */
  function getSoldierNumbers(scenario, factionKey, role) {
    if (!scenario) return [];
    let f;
    if (role === 'defender' && scenario.defenderFactions && scenario.defenderFactions[factionKey]) {
      f = scenario.defenderFactions[factionKey];
    } else {
      f = scenario.factions && scenario.factions[factionKey];
    }
    if (!f) return [];
    if (f.soldierList) return f.soldierList.slice();
    if (f.soldierRange) {
      const [lo, hi] = f.soldierRange;
      const out = [];
      for (let i = lo; i <= hi; i++) out.push(i);
      return out;
    }
    return [];
  }

  /**
   * シナリオから 1 陣営のユニットカード(state.groups[].cards 用)を生成する。
   * UI 側の makeCard と同じ形式 (id, img, imgBack)。
   */
  function buildUnitCards(scenario, factionKey, role) {
    const fac = (global.FACTIONS || {})[factionKey];
    if (!fac) return [];
    const enc = global.encPath || (s => s);
    const nums = getSoldierNumbers(scenario, factionKey, role);
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
  function buildInitialGroups(scenario, factionKey, role) {
    const units = buildUnitCards(scenario, factionKey, role);
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
  function buildAIGroupsSmart(scenario, factionKey, role) {
    const units = buildUnitCards(scenario, factionKey, role);
    const N = units.length;
    // シナリオA: モラル4以上を勝利目標グループに、残りを火力支援グループに
    if (scenario && scenario.id === 'A' && N >= 6) {
      const enriched = units.map(u => {
        const m = String(u.id).match(/(\d+)\s*$/);
        const num = m ? parseInt(m[1], 10) : null;
        const def = getSoldierDefByNum(factionKey, num);
        return { unit: u, num, def, morale: def ? (parseInt(def.morale, 10) || 0) : 0, leader: isLeaderDef(def), crew: isCrewWeaponDef(def) };
      });
      // 勝利グループA: モラル降順で最大5名（リーダー優先）
      enriched.sort((a, b) => {
        if (a.leader !== b.leader) return a.leader ? -1 : 1;
        return b.morale - a.morale;
      });
      const victorySize = Math.min(5, Math.max(4, Math.floor(N / 2)));
      const victory = enriched.slice(0, victorySize);
      const support = enriched.slice(victorySize);
      const NAMES2 = ['A', 'B'];
      const groups2 = NAMES2.map((nm, gi) => ({
        name: nm, cards: [], distance: 0, terrain: [], actions: [], _faction: factionKey, crewPairs: {},
      }));
      victory.forEach(e => addCard(groups2[0], e));
      support.forEach(e => addCard(groups2[1], e));
      // 各グループ内のクルー兵器にアシスタントを割当
      groups2.forEach(g => {
        g.cards.forEach((card, ci) => {
          const e = enriched.find(x => x.unit === card);
          if (!e || !e.crew) return;
          const candidate = g.cards.find((c2, ci2) => {
            if (ci2 === ci) return false;
            const e2 = enriched.find(x => x.unit === c2);
            if (!e2) return false;
            if (e2.crew) return false;
            return true;
          });
          if (candidate) {
            const ownerNum = e.num;
            const assistNum = candidate.num != null ? candidate.num : extractNum(candidate);
            g.crewPairs[ownerNum] = assistNum;
          }
        });
      });
      return groups2;
    }
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

  // ===== デッキ除去ルール ============================================

  /** このシナリオで地形カードとして使用不可か判定する */
  function isCardDisabledAsTerrain(scenario, card) {
    if (!scenario || !scenario.treatAsPlain || !card || !card.terrain) return false;
    return scenario.treatAsPlain.indexOf(card.terrain.type) >= 0;
  }

  /** カードが捨て札になる前に除去対象か判定する。
   *  除去対象なら true を返す（呼び出し側は捨て札山に入れない）。 */
  function shouldRemoveFromGame(scenario, card, deckRemoved) {
    if (!scenario || !scenario.deckRemovals || !card || !card.terrain) return false;
    for (let i = 0; i < scenario.deckRemovals.length; i++) {
      const rule = scenario.deckRemovals[i];
      if (card.terrain.type !== rule.type) continue;
      const key = rule.type;
      if (!deckRemoved[key]) deckRemoved[key] = 0;
      if (deckRemoved[key] < rule.count) {
        deckRemoved[key]++;
        return true;
      }
    }
    return false;
  }

  // ===== キャンペーン: 昇進テーブル ===================================
  const PROMOTION_TABLE = {
    us:  { ranks: ['兵卒','上等兵','伍長','軍曹','曹長'], thresholds: [0, 20, 50, 100, 200] },
    ger: { ranks: ['兵卒','上等兵','伍長','軍曹','曹長'], thresholds: [0, 20, 50, 100, 200] },
    rus: { ranks: ['兵卒','上等兵','伍長','軍曹'],        thresholds: [0, 20, 50, 100] },
  };

  function getPromotionTable(factionKey) {
    return PROMOTION_TABLE[factionKey] || PROMOTION_TABLE.us;
  }

  global.PROMOTION_TABLE = PROMOTION_TABLE;
  global.SCENARIOS = SCENARIOS;
  global.SCENARIO_HELPERS = {
    getSoldierNumbers,
    buildUnitCards,
    distributeIntoGroups,
    buildInitialGroups,
    buildAIGroupsSmart,
    shouldRemoveFromGame,
    isCardDisabledAsTerrain,
    getPromotionTable,
  };

})(typeof window !== 'undefined' ? window : this);
