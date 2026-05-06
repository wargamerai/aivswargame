// 海の戦い - 戦闘処理（ルール7, 8）
// イベント収集型: events[] に { type, ... } を push して返す
// UI側で順次再生（アニメーション）

const DICE_FACE = ['','⚀','⚁','⚂','⚃','⚄','⚅'];

// ダメージ適用
function applyDamage(target, dmg, events){
  target.damage += dmg;
  if(typeof logCombatLine === 'function') logCombatLine(`${target.name}: 損害+${dmg} (累計${target.damage}/${target.def})`);
  if(target.damage > target.def){
    target.sunk = true;
    if(typeof logCombatLine === 'function') logCombatLine(`★ ${target.name} 撃沈`);
    events.push({ type:'sunk', ship: target.id, name: target.name });
    return;
  }
  target.spd = Math.max(1, target.spdOrig - target.damage);
  if(target.damage === target.def && target.atkOrig > 0){
    target.atk = 1;
  }
  events.push({ type:'damage', ship: target.id, name: target.name, damage: target.damage, def: target.def, spd: target.spd });
}

// 1艦の砲撃 (ルール7) - 旧式（一括判定）
function fireOne(att, target, events){
  if(att.atk === 0 || target.sunk) return;
  const dice = [];
  let dmgTotal = 0;
  let disabled = false;
  for(let i=0; i<att.atk; i++){
    const r = rollD6();
    let dmgRoll = null;
    if(r === 6){
      dmgRoll = rollD6();
      dmgTotal += dmgRoll;
    } else if(r === 5){
      disabled = true;
    }
    dice.push({ r, dmgRoll });
  }
  events.push({
    type:'fire',
    attacker: att.id, attackerName: att.name,
    target: target.id, targetName: target.name,
    dice, dmgTotal, disabled
  });
  if(dmgTotal > 0){
    applyDamage(target, dmgTotal, events);
  } else if(disabled){
    target.location = target.homePort;
    events.push({ type:'return_disabled', ship: target.id, name: target.name });
  }
}

// 11. 水上戦闘 1艦の砲撃: 攻撃ダイス一括→6の回数だけ損害ダイス
// pending を渡せば即時適用せず保留（ラウンド終了時に同時適用）
function surfaceFireOne(att, target, events, pending){
  if(att.atk === 0 || target.sunk) return;
  // 11.5 損害無しのドイツ艦は出目+1（命中判定のみ、損害ダイス除く）
  const undamaged = att.country === 'DE' && att.damage === 0;
  const dice = [];
  let hits = 0, hasDisabled = false;
  for(let i=0; i<att.atk; i++){
    const r = rollD6();
    const eff = r + (undamaged ? 1 : 0);
    const isHit = eff >= 6;
    const isDis = eff === 5;
    if(isHit) hits++;
    if(isDis) hasDisabled = true;
    dice.push({ r, eff, isHit, isDis, undamagedDe: undamaged });
  }
  const damageRolls = [];
  for(let i=0; i<hits; i++) damageRolls.push(rollD6());

  const totalDmg = damageRolls.reduce((a,b)=>a+b, 0);
  events.push({
    type:'fire_volley',
    attacker: att.id, attackerName: att.name,
    target: target.id, targetName: target.name,
    dice, damageRolls, hits, hasDisabled, dmgTotal: totalDmg
  });
  if(pending){
    // 保留: ラウンド終了時に同時適用
    if(totalDmg > 0) pending.damage[target.id] = (pending.damage[target.id] || 0) + totalDmg;
    if(hasDisabled)  pending.disabled.add(target.id);
  } else {
    // 即時適用（旧挙動）
    if(totalDmg > 0) applyDamage(target, totalDmg, events);
    if(hasDisabled && !target.sunk){
      target.location = target.homePort;
      events.push({ type:'return_disabled', ship: target.id, name: target.name });
    }
  }
}

function fireRound(attackers, defenders, events){
  attackers.forEach(att => {
    if(att.sunk || att.disabled) return;
    const targets = defenders.filter(d => !d.sunk);
    if(!targets.length) return;
    fireOne(att, targets[0], events);
  });
}

// Uボート1艦が指定目標に射撃（pending を渡せば結果を保留、最後に同時適用）
function uboatFireAt(u, target, events, pending){
  if(target.sunk) return;
  const r = rollD6();
  let dmgRoll = null;
  if(r === 6){
    dmgRoll = rollD6();
    events.push({ type:'fire', attacker: u.id, attackerName: u.name,
      target: target.id, targetName: target.name,
      dice:[{r, dmgRoll}], dmgTotal: dmgRoll, disabled: false });
    if(pending){
      pending.damage[target.id] = (pending.damage[target.id] || 0) + dmgRoll;
    } else {
      applyDamage(target, dmgRoll, events);
    }
  } else if(r === 5){
    if(pending){
      pending.disabled.add(target.id);
    } else {
      target.location = target.homePort;
    }
    if(typeof logCombatLine === 'function') logCombatLine(`${target.name}: 即時帰還 (Uボート)`);
    events.push({ type:'fire', attacker: u.id, attackerName: u.name,
      target: target.id, targetName: target.name,
      dice:[{r, dmgRoll:null}], dmgTotal: 0, disabled: true });
    events.push({ type:'return_disabled', ship: target.id, name: target.name });
  } else {
    events.push({ type:'fire', attacker: u.id, attackerName: u.name,
      target: target.id, targetName: target.name,
      dice:[{r, dmgRoll:null}], dmgTotal: 0, disabled: false });
  }
}

// 8.0 ASW（pending を渡せば結果を保留、最後に同時適用）
function resolveUboatASW(seaKey, events, pending){
  console.log('[DBG] resolveUboatASW 呼び出し', seaKey, 'pending=', !!pending);
  console.trace();
  const ships = SHIPS.filter(s => s.location === seaKey && !s.sunk);
  const allies = ships.filter(s => s.side === 'allies');
  let uboats = ships.filter(s => s.type === 'UBOAT' && s.side === 'axis');
  if(!uboats.length || !allies.length) return;
  events.push({ type:'phase', sea: seaKey, phase:'asw', label:'対潜戦闘 (ASW)' });

  // pending対象: 既に保留済みの艦も次の検索から除外
  const isPendingHit = (u) => pending && (pending.uboatSunk.has(u.id) || pending.uboatReturn.has(u.id));

  allies.forEach(s => {
    const numDice = (s.type === 'CV' || s.type === 'CONVOY') ? 3 : 1;
    const dice = [];
    const applyEvents = [];
    for(let i=0; i<numDice; i++){
      const r = rollD6();
      dice.push(r);
      if(r === 6){
        const u = uboats.find(x => !x.sunk && x.location === seaKey && !isPendingHit(x));
        if(u){
          if(pending){
            pending.uboatSunk.add(u.id);
          } else {
            u.sunk = true;
          }
          if(typeof logCombatLine === 'function') logCombatLine(`★ ${u.name} 撃沈 (ASW: ${s.name})`);
          applyEvents.push({ type:'sunk', ship: u.id, name: u.name });
        }
      } else if(r === 5){
        const u = uboats.find(x => !x.sunk && x.location === seaKey && !isPendingHit(x));
        if(u){
          if(pending){
            pending.uboatReturn.add(u.id);
          } else {
            u.location = 'Germany';
          }
          if(typeof logCombatLine === 'function') logCombatLine(`${u.name}: 帰還 (ASW: ${s.name})`);
          applyEvents.push({ type:'uboat_disabled', ship: u.id, name: u.name });
        }
      }
    }
    // ダイス表示 → その後で適用イベント
    events.push({ type:'asw_ship', ship: s.id, name: s.name, dice });
    applyEvents.forEach(e => events.push(e));
  });
}

// 8.0 Uボート戦闘 (古い関数、互換性維持用に残す)
function resolveUboatCombat(seaKey, events){
  const ships = SHIPS.filter(s => s.location === seaKey && !s.sunk);
  const allies = ships.filter(s => s.side === 'allies');
  let uboats = ships.filter(s => s.type === 'UBOAT' && s.side === 'axis');
  if(!uboats.length || !allies.length) return;
  events.push({ type:'phase', sea: seaKey, phase:'asw', label:'対潜戦闘 (ASW)' });

  // 8.3 各艦個別にASWロール (空母/船団3個、その他1個)
  let dis = 0, snk = 0;
  allies.forEach(s => {
    const numDice = (s.type === 'CV' || s.type === 'CONVOY') ? 3 : 1;
    const dice = [];
    for(let i=0; i<numDice; i++){
      const r = rollD6();
      dice.push(r);
      if(r === 5) dis++;
      else if(r === 6) snk++;
    }
    events.push({ type:'asw_ship', ship: s.id, name: s.name, dice });
  });
  events.push({ type:'asw_summary', sea: seaKey, sunk: snk, disabled: dis });

  for(let i=0; i<snk && uboats.length; i++){
    const u = uboats.shift();
    u.sunk = true;
    events.push({ type:'sunk', ship: u.id, name: u.name });
  }
  for(let i=0; i<dis && uboats.length; i++){
    const u = uboats.shift();
    u.location = 'Germany';
    events.push({ type:'uboat_disabled', ship: u.id, name: u.name });
  }

  // 8.5 反撃
  if(!uboats.length) return;
  events.push({ type:'phase', sea: seaKey, phase:'uboat_attack', label:'Uボート反撃' });
  uboats.forEach(u => {
    const targets = allies.filter(a => !a.sunk);
    if(!targets.length) return;
    const target = targets[0];
    const r = rollD6();
    let dmgRoll = null;
    if(r === 6){
      dmgRoll = rollD6();
      events.push({ type:'fire', attacker: u.id, attackerName: u.name,
        target: target.id, targetName: target.name,
        dice:[{r, dmgRoll}], dmgTotal: dmgRoll, disabled: false });
      applyDamage(target, dmgRoll, events);
    } else if(r === 5){
      target.location = target.homePort;
      events.push({ type:'fire', attacker: u.id, attackerName: u.name,
        target: target.id, targetName: target.name,
        dice:[{r, dmgRoll:null}], dmgTotal: 0, disabled: true });
      events.push({ type:'return_disabled', ship: target.id, name: target.name });
    } else {
      events.push({ type:'fire', attacker: u.id, attackerName: u.name,
        target: target.id, targetName: target.name,
        dice:[{r, dmgRoll:null}], dmgTotal: 0, disabled: false });
    }
  });
}

// 単一海域の戦闘
function resolveSeaCombat(seaKey, events){
  const seaLabel = (typeof SEA_LABEL !== 'undefined' && SEA_LABEL[seaKey]) || seaKey;
  if(typeof startCombatLogEntry === 'function') startCombatLogEntry(seaLabel, '高速戦闘');
  resolveUboatCombat(seaKey, events);
  const ships = SHIPS.filter(s => s.location === seaKey && !s.sunk);
  const allies = ships.filter(s => s.side === 'allies' && s.type !== 'UBOAT');
  const axis   = ships.filter(s => s.side === 'axis'   && s.type !== 'UBOAT');
  if(allies.length && axis.length){
    events.push({ type:'phase', sea: seaKey, phase:'surface', label:'水上戦闘' });
    fireRound(allies, axis, events);
    fireRound(axis, allies, events);
  }
  SHIPS.filter(s => s.location === seaKey && s.disabled && !s.sunk).forEach(s => {
    s.location = s.homePort;
    s.disabled = false;
    if(typeof logCombatLine === 'function') logCombatLine(`${s.name}: 即時帰還`);
    events.push({ type:'return_disabled', ship: s.id, name: s.name });
  });
  if(typeof endCombatLogEntry === 'function') endCombatLogEntry();
}

// 全海域
function resolveAllCombat(events){
  Object.keys(SEAS).forEach(seaKey => resolveSeaCombat(seaKey, events));
}
