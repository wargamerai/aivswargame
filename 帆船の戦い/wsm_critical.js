// wsm_critical.js — WSM クリティカル命中処理
// criticaldata.js の CRITICAL_HIT_TABLE / CRITICAL_TYPES を参照

// クリティカル発動: 2d6で該当エントリを参照
// context: { firer, target, damageType: 'H'|'R' }
function rollCriticalHit(ctx) {
  const d1 = rollD6(), d2 = rollD6();
  const total = d1 + d2;
  const key = total + (ctx.damageType === 'R' ? 'R' : 'H');
  const type = (typeof CRITICAL_TYPES !== 'undefined') ? CRITICAL_TYPES[key] : null;
  const desc = (typeof CRITICAL_HIT_TABLE !== 'undefined') ? CRITICAL_HIT_TABLE[key] : '';
  return { roll: total, dice: [d1, d2], key, type, desc };
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

  switch (result.type) {
    case 'mast_fall': {
      // 1d6 ≤ 射撃艦のHit Table番号 → 帆柱倒壊
      const r = rollD6();
      if (r <= firerHitTable) {
        // どの索具セクションの帆柱が倒れるか：最大残量のセクション
        const sections = ['L','C','R'];
        const sorted = sections.filter(s => t.rigging?.[s]?.remain > 0)
          .sort((a,b) => t.rigging[b].remain - t.rigging[a].remain);
        if (sorted[0]) {
          const sec = sorted[0];
          const lost = t.rigging[sec].remain;
          t.rigging[sec].remain = 0;
          log.push(`帆柱倒壊！ ${sec}索具 -${lost}（${sec}セクション全損）`);
          // 帆柱が全滅したら sailBroken
          const total = sections.reduce((a,s) => a + (t.rigging?.[s]?.remain||0), 0);
          if (total === 0) { t.sailBroken = true; log.push('全帆柱喪失'); }
        }
      } else {
        log.push(`帆柱倒壊判定: 1d6=${r} > HT#${firerHitTable} → 効果なし`);
      }
      break;
    }

    case 'fire': {
      // 1d6 ≤ 射撃艦のHit Table番号 → 火災発生
      const r = rollD6();
      if (r <= firerHitTable) {
        t.onFire = (t.onFire || 0) + 1;
        log.push(`🔥 火災発生！ (1d6=${r} ≤ HT#${firerHitTable})`);
        // さらに1d6で6なら制御不能（爆発マーカー）
        const r2 = rollD6();
        if (r2 === 6) {
          t.fireOutOfControl = true;
          log.push('⚠️ 火災制御不能（次フェイズから爆発判定）');
        } else {
          log.push(`消火可能（1d6=${r2}、乗員セクション${r2}以下で鎮火）`);
        }
      } else {
        log.push(`火災判定: 1d6=${r} > HT#${firerHitTable} → 発火せず`);
      }
      break;
    }

    case 'demoralize': {
      // 1d6 + 乗員品質強度 - 失った乗員セクション ≤ 6 → 品質1段階低下
      const cq = t.crewQuality || 'average';
      const cqStr = { elite: 5, crack: 4, average: 3, green: 2, poor: 1 }[cq] || 3;
      const lostCrew = ((t.crew?.L?.max||0) - (t.crew?.L?.remain||0)) + ((t.crew?.R?.max||0) - (t.crew?.R?.remain||0));
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

    case 'rigging_obscure_L':
      t.gunMalus = t.gunMalus || {};
      t.gunMalus.L = { turns: 3, delta: -1 };
      // 索具2枠消去
      if (t.rigging?.L?.remain > 0) t.rigging.L.remain = Math.max(0, t.rigging.L.remain - 2);
      log.push('左舷砲: 索具に遮蔽され3ターン HT-1、索具L -2');
      break;

    case 'rigging_obscure_R':
      t.gunMalus = t.gunMalus || {};
      t.gunMalus.R = { turns: 3, delta: -1 };
      if (t.rigging?.R?.remain > 0) t.rigging.R.remain = Math.max(0, t.rigging.R.remain - 2);
      log.push('右舷砲: 索具に遮蔽され3ターン HT-1、索具R -2');
      break;

    case 'grapple_shot':
      t.towGrapple = false;
      log.push('曳航鉤縄破壊');
      break;

    case 'sail_change_hit':
      // 帆操作中の乗員被害（簡略: 乗員1損失）
      if (t._plannedSailChange || t._plannedRigRepair) {
        const side = Math.random() < 0.5 ? 'L' : 'R';
        if (t.crew?.[side]?.remain > 0) {
          t.crew[side].remain--;
          log.push(`帆操作中の被害: 乗員${side} -1`);
        }
      } else {
        log.push('帆操作中の被害: 対象外');
      }
      break;

    case 'anchor_severed':
      t.anchorCableBroken = true;
      log.push('錨綱切断');
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

    case 'rake_double_rig':
      // 縦射時に索具損害2倍（呼び出し元で既に適用済みケースも多い）
      if (t.rigging) {
        const sections = ['L','C','R'].filter(s => t.rigging[s].remain > 0)
          .sort((a,b) => t.rigging[b].remain - t.rigging[a].remain);
        if (sections[0]) {
          const sec = sections[0];
          const lost = Math.min(t.rigging[sec].remain, 1);
          t.rigging[sec].remain -= lost;
          log.push(`縦射特別: 索具${sec} 追加-${lost}`);
        }
      }
      break;

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

    case 'fullsail_double_rig':
      if (t.sailState === 'full' && t.rigging) {
        const sections = ['L','C','R'].filter(s => t.rigging[s].remain > 0)
          .sort((a,b) => t.rigging[b].remain - t.rigging[a].remain);
        if (sections[0]) {
          const sec = sections[0];
          const lost = Math.min(t.rigging[sec].remain, 1);
          t.rigging[sec].remain -= lost;
          log.push(`全帆展開のため索具${sec} 追加-${lost}`);
        }
      } else {
        log.push('全帆展開時の索具2倍: 対象外');
      }
      break;

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
  };
  const critResult = rollCriticalHit(ctx);
  log.push(`💥 クリティカル判定: 2d6=${critResult.roll} → ${critResult.key} "${critResult.desc}"`);
  applyCriticalEffect(ctx, critResult, log);
  return critResult;
}
