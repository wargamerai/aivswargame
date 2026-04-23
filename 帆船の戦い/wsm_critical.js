// wsm_critical.js — WSM クリティカル命中処理
// criticaldata.js の CRITICAL_HIT_TABLE / CRITICAL_TYPES を参照

// クリティカル発動: 1d6 + Hit Table番号 で該当エントリを参照
// context: { firer, target, damageType: 'H'|'R', hitTable }
function rollCriticalHit(ctx) {
  const d1 = rollD6();
  const ht = ctx.hitTable || 0;
  const total = Math.max(1, Math.min(16, d1 + ht));
  const key = total + (ctx.damageType === 'R' ? 'R' : 'H');
  const type = (typeof CRITICAL_TYPES !== 'undefined') ? CRITICAL_TYPES[key] : null;
  const desc = (typeof CRITICAL_HIT_TABLE !== 'undefined') ? CRITICAL_HIT_TABLE[key] : '';
  return { roll: total, dice: [d1], hitTable: ht, key, type, desc };
}

// クリティカル効果適用
// ctx: { firer, target, range, arc }
// result: { roll, type, desc }
// log: [] — 追記先
function applyCriticalEffect(ctx, result, log) {
  const t = ctx.target;
  if (!t || !result.type) return;
  const firerHitTable = getFirerHitTableNum(ctx.firer);
  log = log || [];

  // 索具/乗員から n だけ消去（能1=index 0 から）
  function reduceSections(arr, n) {
    if (!Array.isArray(arr) || n <= 0) return 0;
    let removed = 0;
    for (let i = 0; i < arr.length && removed < n; i++) {
      while (removed < n && arr[i] > 0) { arr[i]--; removed++; }
    }
    return removed;
  }

  switch (result.type) {
    case 'mast_fall': {
      // 索具1セクション -1（能1=index 0 から）
      const removed = reduceSections(t.rigging?.sections, 1);
      if (removed > 0) {
        log.push(`帆柱倒壊！ 索具 -${removed}`);
        const total = (t.rigging?.sections||[]).reduce((a,v) => a + (v||0), 0);
        if (total === 0) { t.sailBroken = true; log.push('全帆柱喪失'); }
      } else {
        log.push('帆柱倒壊: 対象索具なし');
      }
      break;
    }

    case 'fire': {
      // 無条件発火、1d6で6なら制御不能、それ以外は鎮火ターン数＝被害艦HT減
      t.onFire = (t.onFire || 0) + 1;
      log.push('🔥 火災発生！');
      const r2 = rollD6();
      if (r2 === 6) {
        t.fireOutOfControl = true;
        log.push('⚠️ 火災制御不能（次フェイズから爆発判定）');
      } else {
        t.fireTurnsRemaining = r2;
        t.fireHtMalus = r2;
        log.push(`鎮火まで${r2}ターン。この期間、被害艦の命中表が${r2}減少。`);
      }
      break;
    }

    case 'demoralize': {
      // 1d6 + 乗員品質強度 - 失った乗員セクション ≤ 6 → 品質1段階低下
      const cq = t.crewQuality || 'average';
      const cqStr = { elite: 5, crack: 4, average: 3, green: 2, poor: 1 }[cq] || 3;
      const maxC = (t.crew?.abilitiesMax||[]).reduce((a,v) => a + (v||0), 0);
      const curC = (t.crew?.abilities||[]).reduce((a,v) => a + (v||0), 0);
      const lostCrew = maxC - curC;
      const r = rollD6();
      const total = r + cqStr - lostCrew;
      if (total <= 6) {
        const order = ['elite','crack','average','green','poor'];
        const i = order.indexOf(cq);
        if (i >= 0 && i < order.length - 1) {
          t.crewQuality = order[i+1];
          log.push(`士気低下！ ${cq} → ${t.crewQuality} (r=${r}+${cqStr}-${lostCrew}=${total})`);
        } else {
          log.push(`士気判定: すでに最低品質`);
        }
      } else {
        log.push(`士気判定: r=${r}+${cqStr}-${lostCrew}=${total} > 6 → 踏み止まる`);
      }
      break;
    }

    case 'helm_destroyed':
      t.cannotTurn = true;
      t._helmDestroyedTurn = 1;  // 次の移動フェイズで転舵不能
      log.push('舵輪破壊（次の移動フェイズで転舵不可）');
      break;

    case 'rigging_obscure_L': {
      t.gunMalus = t.gunMalus || {};
      t.gunMalus.L = { turns: 3, delta: -1 };
      const removed = reduceSections(t.rigging?.sections, 2);
      log.push(`左舷砲: 索具に遮蔽され3ターン HT-1、索具 -${removed}`);
      break;
    }

    case 'rigging_obscure_R': {
      t.gunMalus = t.gunMalus || {};
      t.gunMalus.R = { turns: 3, delta: -1 };
      const removed = reduceSections(t.rigging?.sections, 2);
      log.push(`右舷砲: 索具に遮蔽され3ターン HT-1、索具 -${removed}`);
      break;
    }

    case 'grapple_shot':
      t.towGrapple = false;
      log.push('曳航鉤縄破壊');
      break;

    case 'sail_change_hit':
      // 帆操作中の乗員被害（乗員1損失）
      if (t._plannedSailChange || t._plannedRigRepair) {
        const removed = reduceSections(t.crew?.abilities, 1);
        log.push(`帆操作中の被害: 乗員 -${removed}`);
      } else {
        log.push('帆操作中の被害: 対象外');
      }
      break;

    case 'anchor_severed':
      t.anchorCableBroken = true;
      t.noAnchorAgain = true;
      log.push('錨綱切断（以後錨泊不可）');
      break;

    case 'rudder_destroyed': {
      // 艦首縦射の場合は効果なし
      if (ctx.rake === 'bow_rake') {
        log.push('舵破壊: 艦首縦射のため効果なし');
        break;
      }
      t.cannotTurn = true;
      t.turnAbilityReduced = (t.turnAbilityReduced || 0) + 1;
      log.push('舵破壊（次の移動フェイズ転舵不可、転舵能力恒久-1）');
      break;
    }

    case 'rake_double_rig': {
      // 縦射時に索具損害2倍
      const removed = reduceSections(t.rigging?.sections, 1);
      log.push(`縦射特別: 索具 追加-${removed}`);
      break;
    }

    case 'waterline': {
      const r = rollD6();
      if (r <= firerHitTable) {
        t.waterline = true;
        t.crewAssignedFloat = (t.crewAssignedFloat || 0) + 1;
        log.push(`喫水線損傷！ (1d6=${r}) 乗員セクション1を浸水対応に固定`);
      } else {
        log.push(`喫水線判定: 1d6=${r} > HT#${firerHitTable} → 効果なし`);
      }
      break;
    }

    case 'fullsail_double_rig': {
      if (t.sailState === 'full') {
        const removed = reduceSections(t.rigging?.sections, 1);
        log.push(`全帆展開のため索具 追加-${removed}`);
      } else {
        log.push('全帆展開時の索具2倍: 対象外');
      }
      break;
    }

    case 'magazine': {
      // 1d6 + 射程 ≤ 4 → 爆発、それ以外は2Hと同じ火災
      const r = rollD6();
      const v = r + (ctx.range || 0);
      if (v <= 4) {
        t.status = 'exploded';
        log.push(`💥 弾薬庫爆発！ (1d6=${r}+射程${ctx.range||0}=${v} ≤ 4)`);
      } else {
        t.onFire = (t.onFire || 0) + 1;
        log.push(`弾薬庫発火: 2H相当火災発生 (1d6=${r}+射程${ctx.range||0}=${v} > 4)`);
      }
      break;
    }

    case 'close_rake_rig_loss': {
      // rake && range ≤ 3 で索具1セクション喪失
      if (ctx.rake && (ctx.range || 0) <= 3) {
        const removed = reduceSections(t.rigging?.sections, 1);
        if (removed > 0) log.push(`近距離縦射: 索具 -${removed}`);
        else log.push('近距離縦射索具喪失: 対象索具なし');
      } else {
        log.push('近距離縦射索具喪失: 条件未満（rake && range≤3）');
      }
      break;
    }

    case 'close_rake_double': {
      // rake && range ≤ 3 で砲と乗員の損害を追加1点
      if (ctx.rake && (ctx.range || 0) <= 3) {
        // 砲セクション: gunHitTable の最大値のセクションを-1
        if (t.gunHitTable) {
          const keys = ['s1','s2','s3','s4'];
          const max = keys.map(k => ({k, v: t.gunHitTable[k] || 0}))
            .sort((a,b) => b.v - a.v);
          if (max[0] && max[0].v > 0) {
            t.gunHitTable[max[0].k]--;
            log.push(`近距離縦射: 砲${max[0].k} -1`);
          }
        }
        // 乗員 -1
        const removed = reduceSections(t.crew?.abilities, 1);
        if (removed > 0) log.push(`近距離縦射: 乗員 -${removed}`);
      } else {
        log.push('近距離縦射損害2倍: 条件未満');
      }
      break;
    }

    case 'rake_rig_loss': {
      // rake のとき索具1セクション喪失
      if (ctx.rake) {
        const removed = reduceSections(t.rigging?.sections, 1);
        if (removed > 0) log.push(`縦射: 索具 -${removed}`);
        else log.push('縦射索具喪失: 対象索具なし');
      } else {
        log.push('縦射索具喪失: 縦射でないため効果なし');
      }
      break;
    }

    case 'rake_crew_gun_double': {
      // rake のとき砲と乗員の損害を追加1点
      if (ctx.rake) {
        if (t.gunHitTable) {
          const keys = ['s1','s2','s3','s4'];
          const max = keys.map(k => ({k, v: t.gunHitTable[k] || 0}))
            .sort((a,b) => b.v - a.v);
          if (max[0] && max[0].v > 0) {
            t.gunHitTable[max[0].k]--;
            log.push(`縦射: 砲${max[0].k} -1`);
          }
        }
        const removed = reduceSections(t.crew?.abilities, 1);
        if (removed > 0) log.push(`縦射: 乗員 -${removed}`);
      } else {
        log.push('縦射損害2倍: 縦射でないため効果なし');
      }
      break;
    }

    case 'steering_damage': {
      // 1d6で1/3/5なら旋回能力恒久-1
      const r = rollD6();
      if (r === 1 || r === 3 || r === 5) {
        t.turnAbilityReduced = (t.turnAbilityReduced || 0) + 1;
        log.push(`操舵損傷: 1d6=${r} → 旋回能力恒久-1`);
      } else {
        log.push(`操舵損傷判定: 1d6=${r} → 効果なし`);
      }
      break;
    }

    case 'none':
    default:
      log.push(`クリティカル${result.key}: 効果なし`);
      break;
  }
}

// 射撃艦の Hit Table番号（最大セクション値）
function getFirerHitTableNum(ship) {
  if (!ship?.gunHitTable) return 5;
  const vals = ['s1','s2','s3','s4'].map(k => ship.gunHitTable[k] || 0);
  return Math.max(...vals);
}

// 便利関数: 砲撃結果 → クリティカル判定 → 適用までの一連
// gunneryResult: resolveGunnery の戻り値
function resolveCriticalFromGunnery(firer, target, gunneryResult, log) {
  if (!gunneryResult || !gunneryResult.damages) return;
  const hasCrit = gunneryResult.damages.some(d => d.type === 'crit');
  if (!hasCrit) return;
  // damageType判定（Hコード優先）
  const hasH = gunneryResult.damages.some(d => d.type === 'H');
  const dmgType = hasH ? 'H' : 'R';
  const ctx = {
    firer, target,
    range: gunneryResult.range,
    arc: gunneryResult.arc,
    rake: gunneryResult.rake,
    damageType: dmgType,
    hitTable: gunneryResult.table || 0,
  };
  const critResult = rollCriticalHit(ctx);
  log.push(`💥 クリティカル判定: 1d6=${critResult.dice[0]}+HT#${critResult.hitTable}=${critResult.roll} → ${critResult.key} "${critResult.desc}"`);
  applyCriticalEffect(ctx, critResult, log);
  return critResult;
}
