/* キャンペーンゲーム処理 (42章)
 *
 * 入出力:
 *   - 入力: 兵士戦歴レコード (record), シナリオ結果 (scenarioResult)
 *   - 出力: 更新されたレコード, VP計算結果
 *
 * index.html 側は CAMPAIGN_RULES.xxx を呼ぶだけ。状態管理は外側。
 *
 * レコード構造:
 *   {
 *     status: 'active'|'wounded'|'killed'|'replaced'|'transferred',
 *     rank: 'PVT'|'PFC'|'CPL'|'JR_SGT'|'SGT'|'SSG'|'COMM',
 *     kia: 7,                  // KIA値 (火炎放射器なら6/7)
 *     moraleVal: 3,            // モラル値（カード基本値からの上昇後）
 *     panicVal: 4,             // パニック値
 *     ccvFrontVal: null,       // CCV表 armed側（カード基本値からの上昇後、null=基本値）
 *     ccvBackVal: null,        // CCV裏 armed側（カード基本値からの上昇後、null=基本値）
 *     moralePoints: 0,         // 気力ポイント (累積)
 *     survivalSlashes: 0,      // 生存欄の斜線数
 *     promotionSlashes: 0,     // 昇進欄の斜線数
 *     battles: 0, wins: 0, kills: 0, wounds: 0,
 *     promoted: false, decorations: [],
 *     woundedUntilScenario: 0, // 負傷で参加不可なシナリオ番号 (今+3)
 *     replacementCount: 0,     // 補充された回数
 *   }
 */
(function (global) {
  'use strict';

  // 階級順序 (低 → 高)
  const RANKS = ['PVT', 'PFC', 'CPL', 'JR_SGT', 'SGT', 'SSG'];
  // ソ連には PFC が無い、ドイツには JR_SGT が無い、など国別の違いは PROMOTION_TABLE 参照

  function emptyRecord() {
    return {
      status: 'active',
      rank: null,
      kia: 8,
      moraleVal: null, // null=カード基本値を使う
      panicVal: null,
      ccvFrontVal: null, // null=カード基本値を使う
      ccvBackVal: null,
      moralePoints: 0,
      survivalSlashes: 0,
      promotionSlashes: 0,
      battles: 0, wins: 0, kills: 0, wounds: 0,
      promoted: false, decorations: [],
      woundedUntilScenario: 0,
      replacementCount: 0,
      // フラグ
      malfunctioned: false, destroyed: false,
      pinAtEnd: false, woundedAtEnd: false,
      routedThisScenario: false,
    };
  }

  /** 42.41 補充: 戦死した兵士を新規補充兵として復帰 */
  function applyReplacement(record, isFlamethrower) {
    record.status = 'active';
    record.rank = 'PVT';
    record.kia = isFlamethrower ? 6 : 7;
    record.moraleVal = null;
    record.panicVal = null;
    record.ccvFrontVal = null;
    record.ccvBackVal = null;
    record.moralePoints = 0;
    record.survivalSlashes = 0;
    record.promotionSlashes = 0;
    record.replacementCount = (record.replacementCount || 0) + 1;
    record.routedThisScenario = false;
  }

  /** 42.42 潰走: モラル値またはパニック値を-1 (最低0)
   *  choice: 'morale' or 'panic'
   *  baseMorale, basePanic: 兵士カードの基本値
   */
  function applyRout(record, choice, baseMorale, basePanic) {
    const cur = {
      morale: record.moraleVal != null ? record.moraleVal : baseMorale,
      panic:  record.panicVal  != null ? record.panicVal  : basePanic,
    };
    if (choice === 'morale') {
      cur.morale = Math.max(0, cur.morale - 1);
    } else {
      cur.panic = Math.max(0, cur.panic - 1);
    }
    // パニック値はモラル値以上でなければならない
    if (cur.panic < cur.morale) cur.panic = cur.morale;
    record.moraleVal = cur.morale;
    record.panicVal = cur.panic;
    record.survivalSlashes = 0; // 生存欄リセット
    record.moralePoints = 0;    // 気力ポイント全失
    // 両方0でKIA
    if (cur.morale === 0 && cur.panic === 0) {
      record.status = 'killed';
    }
  }

  /** 42.43 気力ポイント追加 */
  function addMoralePoints(record, points) {
    record.moralePoints = (record.moralePoints || 0) + (points || 0);
  }

  /** 42.44 気力5点でモラルorパニック+1 (上限7)
   *  choice: 'morale' or 'panic'
   *  baseMorale, basePanic: 兵士カードの基本値
   *  戻り値: { ok: bool, reason: string, slashes: int 増加した斜線数 }
   */
  function applyMoraleIncrease(record, choice, baseMorale, basePanic) {
    if ((record.moralePoints || 0) < 5) return { ok: false, reason: '気力不足' };
    const cur = {
      morale: record.moraleVal != null ? record.moraleVal : baseMorale,
      panic:  record.panicVal  != null ? record.panicVal  : basePanic,
    };
    let slashAdded = 0;
    while (record.moralePoints >= 5) {
      let inc = false;
      if (choice === 'morale') {
        if (cur.morale < 7 && cur.morale + 1 <= cur.panic) {
          cur.morale += 1; inc = true;
        }
      } else {
        if (cur.panic < 7 && cur.panic + 1 >= cur.morale) {
          cur.panic += 1; inc = true;
        }
      }
      if (!inc) break;
      record.moralePoints -= 5;
      record.promotionSlashes = (record.promotionSlashes || 0) + 1;
      slashAdded++;
    }
    record.moraleVal = cur.morale;
    record.panicVal = cur.panic;
    return { ok: slashAdded > 0, slashes: slashAdded };
  }

  /** 42.44 気力5点でモラルorパニック+1 (上限7) を 1回だけ実行版
   *  choice: 'morale' or 'panic'
   *  戻り値: { ok: bool, reason: string }
   */
  function applyMoraleIncreaseOnce(record, choice, baseMorale, basePanic) {
    if ((record.moralePoints || 0) < 5) return { ok: false, reason: '気力不足' };
    const cur = {
      morale: record.moraleVal != null ? record.moraleVal : baseMorale,
      panic:  record.panicVal  != null ? record.panicVal  : basePanic,
    };
    let inc = false;
    if (choice === 'morale') {
      if (cur.morale < 7 && cur.morale + 1 <= cur.panic) {
        cur.morale += 1; inc = true;
      }
    } else {
      if (cur.panic < 7 && cur.panic + 1 >= cur.morale) {
        cur.panic += 1; inc = true;
      }
    }
    if (!inc) return { ok: false, reason: '上限到達または制約' };
    record.moralePoints -= 5;
    record.promotionSlashes = (record.promotionSlashes || 0) + 1;
    record.moraleVal = cur.morale;
    record.panicVal = cur.panic;
    return { ok: true };
  }

  /** 42.44c 気力5点でCCV+1 (上限なし) - 表裏両方、armed側のみ
   *  baseCcvFront, baseCcvBack: 兵士カードの基本CCV文字列 ("7/4"形式)
   *  戻り値: { ok: bool, reason: string }
   */
  function applyCCVIncreaseOnce(record, baseCcvFront, baseCcvBack) {
    if ((record.moralePoints || 0) < 5) return { ok: false, reason: '気力不足' };
    function parseArmed(str) {
      if (!str) return 0;
      const m = String(str).match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    }
    const curFront = record.ccvFrontVal != null ? record.ccvFrontVal : parseArmed(baseCcvFront);
    const curBack  = record.ccvBackVal  != null ? record.ccvBackVal  : parseArmed(baseCcvBack);
    record.ccvFrontVal = curFront + 1;
    record.ccvBackVal  = curBack  + 1;
    record.moralePoints -= 5;
    record.promotionSlashes = (record.promotionSlashes || 0) + 1;
    return { ok: true };
  }

  /** 42.45 生存: 戦死せずに終えた兵士に斜線追加。5本溜まればKIA+1 (上限8/火炎放射器7) */
  function addSurvivalSlash(record, isFlamethrower) {
    record.survivalSlashes = (record.survivalSlashes || 0) + 1;
    const cap = isFlamethrower ? 7 : 8;
    if (record.survivalSlashes >= 5 && (record.kia || 7) < cap) {
      record.kia = Math.min(cap, (record.kia || 7) + 1);
      record.survivalSlashes = 0;
    }
  }

  /** 42.46 昇進: 生存+昇進 斜線合計が10以上で1階級昇進 */
  function checkPromotion(record, factionKey) {
    const total = (record.survivalSlashes || 0) + (record.promotionSlashes || 0);
    if (total < 10) return { ok: false };
    const ranks = factionRanks(factionKey);
    const curIdx = ranks.indexOf(record.rank || 'PVT');
    if (curIdx < 0 || curIdx >= ranks.length - 1) {
      // 既に最高位
      record.survivalSlashes = 0;
      record.promotionSlashes = 0;
      return { ok: false, reason: '最高位' };
    }
    record.rank = ranks[curIdx + 1];
    record.survivalSlashes = 0;
    record.promotionSlashes = 0;
    record.promoted = true;
    return { ok: true, newRank: record.rank };
  }

  function factionRanks(factionKey) {
    if (factionKey === 'rus') return ['PVT', 'CPL', 'JR_SGT', 'SGT', 'SSG'];
    if (factionKey === 'ger' || factionKey === 'us') return ['PVT', 'PFC', 'CPL', 'SGT', 'SSG'];
    return ['PVT', 'PFC', 'CPL', 'SGT', 'SSG'];
  }

  /** 42.5 転任: SL/ASLが居ない場合、除去されていたSL/ASLカードから1枚復帰
   *  records: そのファクションの全レコード (id → record)
   *  needed: 'SL' or 'ASL'
   *  candidateIds: SL/ASLカード候補のIDリスト
   *  戻り値: { ok: bool, soldierId: string }
   */
  function applyTransfer(records, needed, candidateIds) {
    const removed = candidateIds.filter(id => {
      const r = records[id];
      return r && (r.status === 'killed' || r.status === 'replaced' || r.status === 'transferred');
    });
    if (removed.length === 0) return { ok: false, reason: '転任候補なし' };
    const idx = Math.floor(Math.random() * removed.length);
    const chosenId = removed[idx];
    const r = records[chosenId];
    r.status = 'active';
    r.transferred = true;
    return { ok: true, soldierId: chosenId, vpPenalty: 7 };
  }

  /** 42.43 気力ポイント獲得条件のテーブル (歩兵ゲーム用) */
  const MORALE_POINT_TABLE = {
    SCENARIO_WIN: 1,            // シナリオに勝つ
    SURVIVED_WOUNDED_OR_PIN: 2, // シナリオ終了時に負傷状態またはピン状態 (各々につき)
    HERO_RECOVERY: 3,           // 「ヒーロー」カードを使って回復した兵士
    CC_KILL: 4,                 // CCで敵兵1人を殺す
    DEMO_KILL_3: 5,             // 爆薬により3人以上の兵士を殺すか潰走させる
  };

  /** 42.6 撤退判定: 撤退可能か
   *  group: { distance, terrain, ... }
   *  戻り値: bool
   */
  function canRetreat(group, opts) {
    if (!group) return false;
    if (group.distance > 0) return false;
    if (opts && opts.encircled) return false;
    if (opts && opts.pursued) return false;
    return true;
  }

  /** 42.7 追撃モラルチェック
   *  rncValue: 引いた地形カードのRNC数値
   *  slMorale: SLのモラル値（現時点）
   *  slPinned: SLがピン状態か
   *  戻り値: { ok: bool, reason: string }
   */
  function pursuitMoraleCheck(rncValue, slMorale, slPinned) {
    if (slPinned) return { ok: false, reason: 'SLピン状態' };
    if (slMorale > rncValue) return { ok: true };
    return { ok: false, reason: 'モラルチェック失敗' };
  }

  /** 42.8 キャンペーンVP計算
   *  入力: { winnerScenario:bool, killedInfantry:int, lostIG:int, lostAFV:int, transferred:int, igEffectVal:int, afvEffectVal:int }
   *  戻り値: int (VP)
   */
  function calculateCampaignVP(stats) {
    const s = stats || {};
    let vp = 0;
    if (s.winnerScenario) vp += 12;
    vp += (s.lostIG || 0) * (-3 + (s.igEffectVal || 0));
    vp += (s.lostAFV || 0) * (-5 + (s.afvEffectVal || 0));
    vp += (s.killedInfantry || 0) * (-7);
    vp += (s.transferred || 0) * (-7);
    return vp;
  }

  /** 42.9 個人キャンペーン: 分身兵士の作成 */
  function createPersonalSoldier(name, factionKey) {
    const moraleByFaction = { ger: { m: 2, p: 3 }, us: { m: 2, p: 4 }, rus: { m: 3, p: 4 }, jpn: { m: 2, p: 3 }, uk: { m: 2, p: 3 } };
    const mp = moraleByFaction[factionKey] || moraleByFaction.us;
    return {
      name: name || 'プレイヤー',
      factionKey: factionKey,
      record: Object.assign(emptyRecord(), {
        rank: 'PVT',
        kia: 8,
        moraleVal: mp.m,
        panicVal: mp.p,
      })
    };
  }

  /** シナリオ終了時の一括処理
   *  入力:
   *    records: { soldierId → record }
   *    soldierStates: { soldierId → { killed, wounded, routed, pinAtEnd, isFlamethrower, kills, decoMorale } }
   *    scenarioResult: { winner: 'player'|'ai', playerSide: 'player' or 'ai' }
   *  出力: { changes: [{soldierId, change: 'KIA'|'wounded'|'routed'|'survived'|'mp+N'}], vp: int }
   */
  function processScenarioEnd(records, soldierStates, scenarioResult) {
    const changes = [];
    const ids = Object.keys(soldierStates || {});
    let killed = 0;
    ids.forEach(id => {
      const rec = records[id] || (records[id] = emptyRecord());
      const s = soldierStates[id] || {};
      rec.battles = (rec.battles || 0) + 1;

      if (s.killed) {
        rec.kills = (rec.kills || 0) + (s.kills || 0);
        killed++;
        // KIA → 同名の別人として補充扱い (生存/昇進/気力上昇分すべてクリア、階級PVT、KIA基本値)
        applyReplacement(rec, !!s.isFlamethrower);
        changes.push({ soldierId: id, change: 'KIA' });
        return;
      }
      if (s.routed) {
        // 42.42 潰走処理: choice 'panic' をデフォルト (UIで選択可)
        applyRout(rec, 'panic', s.baseMorale || 3, s.basePanic || 4);
        rec.routedThisScenario = false;
        changes.push({ soldierId: id, change: 'routed' });
        return;
      }
      if (s.wounded) {
        rec.wounds = (rec.wounds || 0) + 1;
        rec.status = 'wounded';
        rec.woundedUntilScenario = (rec.battles || 0) + 3;
        changes.push({ soldierId: id, change: 'wounded' });
      } else {
        rec.status = 'active';
      }

      // 42.45 生存斜線
      addSurvivalSlash(rec, !!s.isFlamethrower);

      // 42.43 気力ポイント自動加算
      let mp = 0;
      if (scenarioResult && scenarioResult.winner === scenarioResult.playerSide) {
        // プレイヤー側勝利 → プレイヤー側兵士に+1 (本実装では soldierState に勝利フラグを判定済みと仮定)
        if (s.onWinningSide) mp += MORALE_POINT_TABLE.SCENARIO_WIN;
      }
      if (s.wounded) mp += MORALE_POINT_TABLE.SURVIVED_WOUNDED_OR_PIN;
      if (s.pinAtEnd) mp += MORALE_POINT_TABLE.SURVIVED_WOUNDED_OR_PIN;
      if (s.heroRecovery) mp += MORALE_POINT_TABLE.HERO_RECOVERY;
      if (s.ccKills) mp += s.ccKills * MORALE_POINT_TABLE.CC_KILL;
      if (s.demoKilled3OrMore) mp += MORALE_POINT_TABLE.DEMO_KILL_3;
      if (mp > 0) {
        addMoralePoints(rec, mp);
        changes.push({ soldierId: id, change: 'mp+' + mp });
      }

      kills_count: if (s.kills) {
        rec.kills = (rec.kills || 0) + s.kills;
      }

      if (scenarioResult && scenarioResult.winner === scenarioResult.playerSide) {
        rec.wins = (rec.wins || 0) + 1;
      }
    });

    // VP計算
    const vp = calculateCampaignVP({
      winnerScenario: scenarioResult && (scenarioResult.winner === scenarioResult.playerSide),
      killedInfantry: killed,
      lostIG: scenarioResult ? scenarioResult.lostIG : 0,
      lostAFV: scenarioResult ? scenarioResult.lostAFV : 0,
      transferred: scenarioResult ? scenarioResult.transferred : 0,
      igEffectVal: scenarioResult ? scenarioResult.igEffectVal : 0,
      afvEffectVal: scenarioResult ? scenarioResult.afvEffectVal : 0,
    });

    return { changes: changes, vp: vp };
  }

  global.CAMPAIGN_RULES = {
    emptyRecord: emptyRecord,
    applyReplacement: applyReplacement,
    applyRout: applyRout,
    addMoralePoints: addMoralePoints,
    applyMoraleIncrease: applyMoraleIncrease,
    applyMoraleIncreaseOnce: applyMoraleIncreaseOnce,
    applyCCVIncreaseOnce: applyCCVIncreaseOnce,
    addSurvivalSlash: addSurvivalSlash,
    checkPromotion: checkPromotion,
    factionRanks: factionRanks,
    applyTransfer: applyTransfer,
    canRetreat: canRetreat,
    pursuitMoraleCheck: pursuitMoraleCheck,
    calculateCampaignVP: calculateCampaignVP,
    createPersonalSoldier: createPersonalSoldier,
    processScenarioEnd: processScenarioEnd,
    MORALE_POINT_TABLE: MORALE_POINT_TABLE,
    RANKS: RANKS,
  };

})(typeof window !== 'undefined' ? window : this);
