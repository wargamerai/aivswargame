// wsm_damage.js — WSM 損害管理・降伏・沈没・爆発処理
// 損害消去ルールの詳細 + 状態遷移

// ============================================================
// 損害適用（Phase 5 applyDamageの強化版）
// WSMルール準拠:
//   Rigging: 最大番号セクションから消去（L=1, C=2, R=3 の順番想定のため R→C→L）
//   Crew:    最小番号セクションから消去（被弾側）
//   Gun:     被弾セクションのHit Table番号-1
//   Hull:    均等に減算
// ============================================================
function applyDamageWSM(target, damages, ctx) {
  const applied = [];
  const arc = ctx?.arc;           // firerから見たarc (port/stbd/bow/stern)
  const raked = !!ctx?.rake;      // Rakeフラグ

  // 被弾側 (target視点のL/R) を算出
  // 自分のportから撃てば相手のstbdに当たる（相対関係は艦の向きで決まる）
  // 簡略: 攻撃舷の反対側が被弾舷
  const hitSide = (arc === 'port') ? 'R' : (arc === 'stbd') ? 'L' : null;

  for (const d of damages) {
    if (d.extra && !d.apply) continue;
    const n = d.n || 1;
    switch (d.type) {
      case 'H': {
        if (!target.hull) break;
        target.hull.remain = Math.max(0, target.hull.remain - n);
        applied.push(`船体-${n}(残${target.hull.remain}/${target.hull.max})`);
        // 船体0 → 破壊判定フラグ
        if (target.hull.remain === 0 && !target._hullDestroyedChecked) {
          target._hullDestroyedCheck = true;
        }
        break;
      }
      case 'R': {
        if (!target.rigging || !Array.isArray(target.rigging.sections)) break;
        // 能1（index 0）から消去
        // 全帆（full sail）時は索具ダメージが 2 倍
        const nR = (target.sailState === 'full') ? n * 2 : n;
        let removed = 0;
        for (let i = 0; i < target.rigging.sections.length && removed < nR; i++) {
          while (removed < nR && target.rigging.sections[i] > 0) {
            target.rigging.sections[i]--;
            removed++;
          }
        }
        applied.push((target.sailState === 'full') ? `索具-${removed}（全帆×2）` : `索具-${removed}`);
        // 索具全滅判定
        const total = target.rigging.sections.reduce((a,v) => a + (v||0), 0);
        if (total === 0) {
          if (!target.sailBroken) {
            target.sailBroken = true;
            applied.push('全帆柱喪失 → sailBroken');
          }
        }
        break;
      }
      case 'C': {
        if (!target.crew || !Array.isArray(target.crew.abilities)) break;
        // 能1（index 0）から消去
        let removed = 0;
        for (let i = 0; i < target.crew.abilities.length && removed < n; i++) {
          while (removed < n && target.crew.abilities[i] > 0) {
            target.crew.abilities[i]--;
            removed++;
          }
        }
        applied.push(`乗員-${removed}`);
        break;
      }
      case 'G': {
        if (!target.gunHitTable) break;
        // 被弾舷側のHit Table番号を1段階下げる（簡略: s1→s2→s3→s4の順に）
        // 実装: 最大値のセクションを探して-1
        const sects = ['s1','s2','s3','s4'];
        const valid = sects.filter(s => (target.gunHitTable[s] || 0) > 0)
          .sort((a,b) => (target.gunHitTable[b]||0) - (target.gunHitTable[a]||0));
        let removed = 0;
        while (removed < n && valid.length > 0) {
          const sec = valid[0];
          if (target.gunHitTable[sec] > 0) {
            target.gunHitTable[sec]--;
            removed++;
            if (target.gunHitTable[sec] === 0) valid.shift();
          } else {
            valid.shift();
          }
        }
        // 右パネル表示用 broadsideGuns も同期（被弾舷から減算）
        if (target.broadsideGuns) {
          const gunSide = hitSide || 'L';
          const gd = target.broadsideGuns[gunSide];
          if (gd) {
            let rem = removed;
            while (rem > 0 && gd.remain > 0) { gd.remain--; rem--; }
          }
        }
        applied.push(`砲セクション-${removed}`);
        break;
      }
      case 'crit': {
        applied.push('クリティカル発動');
        target._pendingCrit = true;
        break;
      }
    }
  }
  return applied;
}

// ============================================================
// 降伏・沈没・爆発 判定（船体破壊後）
// DESTROYED_HULL_TABLE: 1d6
//   1-4: 降伏（旗を降ろす）
//   5: 沈没可能性
//   6: 爆発可能性
// ============================================================
function rollDestroyedHull(ship, log) {
  log = log || [];
  const r = rollD6();
  log.push(`船体破壊判定: 1d6=${r}`);
  if (r <= 4) {
    ship.status = 'struck';
    log.push('🏳 降伏（旗を降ろす）');
    return { result: 'struck' };
  } else if (r === 5) {
    log.push('沈没可能性');
    // 続く1d6で6なら沈没
    const r2 = rollD6();
    if (r2 === 6) {
      ship.status = 'sunk';
      log.push(`🌊 沈没確定 (1d6=${r2})`);
      return { result: 'sunk' };
    } else {
      ship.status = 'struck';  // 降伏
      log.push(`沈没せず→降伏 (1d6=${r2})`);
      return { result: 'struck' };
    }
  } else {
    log.push('爆発可能性');
    const r2 = rollD6();
    if (r2 === 6) {
      ship.status = 'exploded';
      log.push(`💥 爆発 (1d6=${r2})`);
      // 隣接艦への延焼判定（簡略: 別途実装）
      return { result: 'exploded' };
    } else {
      ship.status = 'struck';
      log.push(`爆発せず→降伏 (1d6=${r2})`);
      return { result: 'struck' };
    }
  }
}

// ============================================================
// 降伏条件チェック（毎フェイズ呼び出し想定）
// ============================================================
// WSM: 以下の場合、降伏判定を促される
//   - 船体全損
//   - 乗員が半数以下に落ちた
//   - 艦長戦死 + 士気崩壊
// 戻り値: true なら降伏判定をする必要あり
function checkSurrenderConditions(ship) {
  if (!ship || ship.status !== 'ok') return false;
  // 船体全損
  if (ship.hull && ship.hull.remain === 0) return true;
  // 乗員半数以下 + 士気低下で降伏
  if (ship.crew) {
    const maxCrew = (ship.crew.abilitiesMax||[]).reduce((a,v) => a + (v||0), 0);
    const curCrew = (ship.crew.abilities||[]).reduce((a,v) => a + (v||0), 0);
    if (maxCrew > 0 && curCrew / maxCrew <= 0.4 && (ship.crewQuality === 'poor' || ship.crewQuality === 'green')) {
      return true;
    }
  }
  // 火災制御不能で爆発マーカー → 爆発判定（簡略）
  if (ship.fireOutOfControl) return true;
  return false;
}

// ============================================================
// 火災進行処理（毎ターン絡み解除フェイズで）
// ============================================================
// onFire: 火災中の艦に対して
//   - 乗員セクション配置で消火判定
//   - 失敗で船体1+索具1消去
function processFireProgression(ship, crewAssignedToFire, log) {
  log = log || [];
  if (!ship.onFire) return { extinguished: true, log };
  const r = rollD6();
  if (r <= crewAssignedToFire) {
    ship.onFire = 0;
    ship.fireOutOfControl = false;
    log.push(`🪣 鎮火成功 (1d6=${r} ≤ 配置乗員${crewAssignedToFire})`);
    return { extinguished: true, log };
  }
  // 火災継続: 船体1+索具1消去
  if (ship.hull?.remain > 0) { ship.hull.remain--; log.push('火災延焼: 船体-1'); }
  if (Array.isArray(ship.rigging?.sections)) {
    for (let i = 0; i < ship.rigging.sections.length; i++) {
      if (ship.rigging.sections[i] > 0) { ship.rigging.sections[i]--; log.push('火災延焼: 索具-1'); break; }
    }
  }
  // 制御不能で爆発リスク
  if (ship.fireOutOfControl) {
    const r2 = rollD6();
    if (r2 === 6) {
      ship.status = 'exploded';
      log.push(`💥 火災制御不能 → 爆発 (1d6=${r2})`);
      return { extinguished: false, exploded: true, log };
    }
  }
  log.push(`火災継続 (1d6=${r})`);
  return { extinguished: false, log };
}

// ============================================================
// クリティカルタイマー減衰（毎ターン開始）
// ============================================================
function tickCriticalTimers(ship) {
  if (ship.gunMalus) {
    for (const side of ['L','R']) {
      if (ship.gunMalus[side]) {
        ship.gunMalus[side].turns--;
        if (ship.gunMalus[side].turns <= 0) delete ship.gunMalus[side];
      }
    }
    if (Object.keys(ship.gunMalus).length === 0) delete ship.gunMalus;
  }
  if (ship._helmDestroyedTurn !== undefined) {
    ship._helmDestroyedTurn--;
    if (ship._helmDestroyedTurn <= 0) {
      delete ship._helmDestroyedTurn;
      if (!ship.turnAbilityReduced) ship.cannotTurn = false;  // 舵破壊（恒久）でなければ解除
    }
  }
}

// ============================================================
// 艦の総合状態更新（毎フェイズ末推奨）
// ============================================================
function updateShipStatus(ship, log) {
  log = log || [];
  if (ship.status !== 'ok') return;
  // 船体0で即時破壊判定
  if (ship._hullDestroyedCheck) {
    ship._hullDestroyedCheck = false;
    ship._hullDestroyedChecked = true;
    rollDestroyedHull(ship, log);
    return;
  }
  // 降伏条件
  if (checkSurrenderConditions(ship)) {
    // ロジック簡略: 船体0なら必ず判定、他は乗員半減などで確率的に
    if (ship.hull?.remain === 0) {
      rollDestroyedHull(ship, log);
    }
  }
}
