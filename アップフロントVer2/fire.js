/* 射撃処理 (fire.js)
 *
 * フロー:
 *   射撃ボタン → 射撃カード選択 → 味方グループ → 敵グループ → 確定
 *   → 敵隠蔽カード確認 → 最終火力決定 → 判定カードドロー
 *   → (黒+/赤-) → 故障チェック → ダメージチェック
 *   → KIA/PIN/潰走/無傷 判定
 *
 * §6 射撃攻撃 / §7 地形修正 / §9 隠蔽 / §12 移動射撃
 */
(function (global) {
  'use strict';

  // 丸数字→数値
  function circledToNum(ch) {
    if (!ch) return 0;
    var code = ch.charCodeAt(0);
    if (code >= 0x2460 && code <= 0x2473) return code - 0x2460 + 1;
    var n = parseInt(ch, 10);
    return isNaN(n) ? 0 : n;
  }

  function getFactionKey(facObj) {
    var factions = global.FACTIONS;
    if (!factions || !facObj) return null;
    return Object.keys(factions).find(function (k) { return factions[k] === facObj; });
  }

  function buildCrewMap(group) {
    var out = {};
    if (!group.crewPairs) return out;
    Object.keys(group.crewPairs).forEach(function (ownerNum) {
      var ownerIdx = group.cards.findIndex(function (c) { return c.num === parseInt(ownerNum, 10); });
      var assistIdx = group.cards.findIndex(function (c) { return c.num === group.crewPairs[ownerNum]; });
      if (ownerIdx >= 0 && assistIdx >= 0) out[ownerIdx] = assistIdx;
    });
    return out;
  }

  // グループが移動中か (最後のterrainがMOVEMENT)
  function isMoving(group) {
    if (!group.terrain || group.terrain.length === 0) return false;
    var last = group.terrain[group.terrain.length - 1];
    return !!(last && last.terrain && last.terrain.type === 'MOVEMENT');
  }

  /**
   * 射撃実行
   * 引数:
   *   srcGroup: 味方グループ
   *   tgtGroup: 敵グループ
   *   fireCards: 使用する射撃カード配列 [{terrain:{type,range,sub,...}}, ...]
   *   drawFn: 山札からカードを引く関数 () => card
   *   showJudgeFn: 判定カード表示関数 (card) => void
   * 戻り値:
   *   { ok: bool, error: string, results: [{name, result, rnc, malfunc}], summary: string }
   */
  function execute(srcGroup, tgtGroup, fireCards, drawFn, showJudgeFn) {
    var R = global.INFANTRY_RULES;
    var s = global.state;
    if (!R || !s) return { ok: false, error: 'ルールエンジン未読込' };

    var playerKey = getFactionKey(s.player);
    var enemyKey = getFactionKey(s.ai);
    var srcKey = playerKey; // プレイヤー側が攻撃
    var tgtKey = enemyKey;

    // §6.2 火力計算
    var distance = R.relativeRange(srcGroup.distance, tgtGroup.distance);
    var moving = isMoving(srcGroup);
    var crewMap = buildCrewMap(srcGroup);
    var fp = R.calcGroupFirepower(srcGroup, srcKey, distance, { moving: moving, crewMap: crewMap });

    // 射撃カードの必要火力と射撃力を集計
    var needed = 0;
    var baseStrength = 0;
    fireCards.forEach(function (c) {
      var t = c.terrain;
      if (!t || t.type !== 'FIRE') return;
      needed += parseInt(t.range, 10) || 0;
      var m = (t.sub || '').match(/FP(.)/);
      baseStrength += circledToNum(m ? m[1] : '');
    });

    // §44.2 イギリス軍: 必要火力+1
    if (srcKey === 'uk' && needed > 0) needed += 1;

    if (needed === 0) return { ok: false, error: '射撃カードを選択してください' };
    if (fp < needed) return { ok: false, error: '火力不足: 必要 ' + needed + ' / 利用可能 ' + fp };

    // §12.1 移動射撃: 射撃力半減
    var strength = moving ? Math.floor(baseStrength / 2) : baseStrength;

    // §7 地形修正
    var atkMod = R.calcTerrainMod(srcGroup.terrain, true);
    var defMod = R.calcTerrainMod(tgtGroup.terrain, false);

    // 最終火力 (隠蔽は後で適用)
    var finalFP = Math.max(0, strength + atkMod + defMod);

    // §9 敵隠蔽カード確認 (AIは自動判断)
    // ここでは隠蔽なしで進む。将来: 隠蔽カードの適用UIを追加
    // TODO: 隠蔽カード処理

    // 各防御兵士に判定
    var results = [];
    var lastJudge = null;
    tgtGroup.cards.forEach(function (card) {
      if (!R.isAlive(card)) return;
      var judge = drawFn();
      if (!judge) return;
      lastJudge = judge;

      // RNC: 射程列の値、色は rncColor ('赤' なら減算)
      var rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
      var isRed = judge.terrain && judge.terrain.rncColor === '赤';
      var rncVal = isRed ? -rncAbs : rncAbs;

      // 故障チェック: TODO (breakdownデータ追加後に実装)
      var malfunc = false;

      // §6.5 最終戦闘解決数値
      var combatResult = finalFP + rncVal;

      var def = R.lookupSoldier(card, tgtKey);
      var wasPinned = R.isPinned(card);
      var name = def ? def.name : card.id;

      var result = 'NONE';
      if (!wasPinned) {
        var morale = parseInt(def && def.morale, 10) || 0;
        var kia = parseInt(def && def.kiaFront, 10) || 0;
        if (kia > 0 && combatResult >= kia) {
          result = 'KIA';
          R.killSoldier(card);
        } else if (morale > 0 && combatResult >= morale) {
          result = 'PIN';
          R.pinSoldier(card);
        }
      } else {
        // ピン状態: 裏面のKIA/パニック値で判定
        var kiaBack = parseInt(def && def.kiaBack, 10) || 0;
        var panic = parseInt(def && def.panic, 10) || 0;
        if (kiaBack > 0 && combatResult >= kiaBack) {
          result = 'KIA';
          R.killSoldier(card);
        } else if (panic > 0 && combatResult >= panic) {
          // §6.531 潰走チェック
          var rpc = parseInt((judge.terrain && judge.terrain.dice && judge.terrain.dice['0r']) || '0', 10) || 0;
          if (rpc > panic) {
            result = '潰走';
            R.routSoldier(card);
          } else {
            result = 'KIA(パニック)';
            R.killSoldier(card);
          }
        }
      }

      results.push({ name: name, result: result, rnc: rncVal, combat: combatResult, malfunc: malfunc });
    });

    if (lastJudge && showJudgeFn) showJudgeFn(lastJudge);

    // サマリ生成
    var summary = '射撃 距離' + distance + ' 火力' + baseStrength
      + (moving ? '(移動半減→' + strength + ')' : '')
      + ' 修正' + (atkMod >= 0 ? '+' : '') + atkMod + '/' + (defMod >= 0 ? '+' : '') + defMod
      + ' → 最終' + finalFP + '\n'
      + results.map(function (r) {
        return '  ' + r.name + ': ' + (r.result === 'NONE' ? '無傷' : r.result)
          + ' (RNC ' + r.rnc + ' → 合計' + r.combat + ')';
      }).join('\n');

    return { ok: true, results: results, summary: summary };
  }

  global.FIRE_RULES = {
    execute: execute,
  };

})(typeof window !== 'undefined' ? window : this);
