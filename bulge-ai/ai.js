'use strict';

// The Allied player proposes orders. The rules engine validates them exactly
// as it validates manually entered orders, and only the UI commits them.
const BulgeAI = (() => {
  const R=BulgeRules, D=BulgeData, {distance}=R;
  const strongholds=R.finalVictoryCities;
  function nearest(hex, units) {
    return units.reduce((min,u)=>Math.min(min,distance(hex,u.hex)),30);
  }
  function moveScore(state, unit, hex, opponents, supply) {
    const adjacent=opponents.filter(u=>R.neighbors(hex).includes(u.hex));
    const pressure=adjacent.filter(u=>!u.disrupted&&!u.marker).reduce((sum,u)=>sum+u.attack,0);
    const near=nearest(hex,opponents);
    const supports=R.onMap(state,'allied').filter(u=>u.id!==unit.id && !u.disrupted &&
      R.neighbors(hex).includes(u.hex)).length;
    const city=R.city(hex);
    return -Math.max(1,near)*1.35 + Number(city)*2.2 + Number(supply.has(hex))*1.1 +
      Number(R.ridge(hex))*0.6 + Math.min(supports,2)*0.45 -
      Math.max(0,pressure-unit.defense)*0.6 - Number(R.river(hex))*0.65;
  }
  function germanReach(board, unit) {
    const hexes=new Set(R.movementOptions(board,unit.id).keys());
    if (unit.mechanized)
      for (const hex of R.movementOptions(board,unit.id,{mode:'mechanized'}).keys()) hexes.add(hex);
    return hexes;
  }
  function reactionRisk(state, unit, opponents) {
    const german={...state,phase:'move',turnSide:'german'};
    const threats=opponents.filter(enemy=>!enemy.disrupted && enemy.movement && !enemy.marker);
    const reach=new Map(threats.map(enemy=>[enemy.id,germanReach(german,enemy)]));
    const before=new Set([...reach.values()].flatMap(options=>[...options]));
    return to=>{
      const revised={...unit,hex:to};
      const affected=[unit.hex,to,...R.unitZoc(unit),...R.unitZoc(revised)];
      const changesControl=(R.city(to)||R.source('allied',to)||R.source('german',to)) && state.control[to]!=='allied';
      const board={...german,units:german.units.map(other=>other.id===unit.id?revised:other),
        control:changesControl?{...german.control,[to]:'allied'}:german.control};
      const after=new Set();
      let widestOpening=0;
      for (const enemy of threats) {
        const old=reach.get(enemy.id);
        const nearby=affected.some(hex=>distance(hex,enemy.hex)<=(enemy.mechanized?10:enemy.movement));
        const options=nearby || (changesControl && enemy.mechanized) ? germanReach(board,enemy) : old;
        if (options!==old) widestOpening=Math.max(widestOpening,options.size-old.size);
        for (const hex of options) after.add(hex);
      }
      const opened=[...after].filter(hex=>!before.has(hex));
      const closed=[...before].filter(hex=>!after.has(hex));
      const opensObjective=opened.some(hex=>strongholds.includes(hex)||D.victoryCities.includes(hex));
      const widens=opensObjective || widestOpening>=6 ||
        (opened.length>=4 && opened.length-closed.length>=3);
      return {widens, score:closed.length*0.5-opened.length*0.85};
    };
  }
  function moves(state) {
    if (R.actor(state)!=='allied' || !['move','reaction','highbeam'].includes(state.phase)) return [];
    const opponents=R.onMap(state,'german');
    if (!opponents.length) return [];
    const units=R.onMap(state,'allied').filter(u=>!u.disrupted&&u.movement&&!u.movementOrder&&!strongholds.includes(u.hex))
      .sort((a,b)=>nearest(a.hex,opponents)-nearest(b.hex,opponents)||b.attack-a.attack);
    let plan=[], preview=R.previewMoves(state,[]).state;
    for (const original of units) {
      const unit=R.unitById(preview,original.id);
      const supply=R.lines(preview,'allied',true);
      let value=moveScore(preview,unit,unit.hex,opponents,supply)+0.55, best=null;
      const reactions=new Map();
      const supports=[null,...R.moveChits(unit)];
      for (const mode of ['normal','mechanized']) for (const support of supports) {
        for (const route of R.movementOptions(preview,unit.id,{mode,support}).values()) {
          const spent=Number(Boolean(support&&R.chit(support).discard))*0.9;
          const lost=route.lost ? unit.support.filter(id=>R.chit(id).kind!=='dummy').length*1.15 : 0;
          const excess=route.excess.filter(id=>R.chit(id).kind!=='dummy').length*0.8;
          const score=moveScore(preview,unit,route.hex,opponents,supply)-Math.max(lost,excess)-spent-route.cost*0.045;
          const order={unit:unit.id,to:route.hex,mode,support};
          if (state.phase==='reaction') {
            if (score>(reactions.get(route.hex)?.score ?? -Infinity)) reactions.set(route.hex,{order,score});
          } else if (score>value) {
            best=order; value=score;
          }
        }
      }
      if (reactions.size) {
        const risk=reactionRisk(preview,unit,opponents);
        // Compare a short list of promising hexes, including alternatives when a move opens a gap.
        const candidates=[...reactions.values()].sort((a,b)=>b.score-a.score).slice(0,12);
        for (const {order,score} of candidates) {
          const change=risk(order.to);
          if (change.widens || score+change.score<=value) continue;
          best=order;
          value=score+change.score;
        }
      }
      if (best) {
        plan.push(best);
        preview=R.previewMoves(state,plan).state;
      }
    }
    return plan;
  }
  function* defensiveSupport(cards, start=0, selected=[], hasArtillery=false) {
    yield selected;
    if (selected.length===3) return;
    for (let index=start;index<cards.length;index++) {
      const id=cards[index];
      const artillery=R.chit(id).kind==='artillery';
      if (artillery && hasArtillery) continue;
      yield* defensiveSupport(cards,index+1,[...selected,id],hasArtillery||artillery);
    }
  }
  function winsAgainstDefense(state, choices, targets=[], checked=new Set()) {
    // The same set of tanks removed by German AT gives the same remaining support.
    const key=targets.slice().sort().join(',');
    if (checked.has(key)) return true;
    checked.add(key);
    const profile=R.combatProfile(state,choices,targets);
    if (profile.nextAT)
      return profile.nextAT.every(({id})=>winsAgainstDefense(state,choices,[...targets,id],checked));
    if (profile.artillerySide==='allied') return R.decisiveAttack(profile,R.suggestedDie(profile));
    // Every face is possible with either a random roll or German artillery.
    return D.crt.every((_,index)=>R.decisiveAttack(profile,index+1));
  }
  function guaranteedAttack(state, target, attackers) {
    const board={...state,phase:'resolve',combat:{side:'allied',queue:[{target,attackers}],total:1}};
    const info=R.battleInfo(board);
    const defaults=R.defaultSupport(info);
    const choices=Object.fromEntries(attackers.map(id=>[id,defaults[id]]));
    const combatKinds=['tank','artillery','damage','dice'];
    if (!Object.values(choices).some(ids=>ids.some(id=>combatKinds.includes(R.chit(id).kind)))) return false;
    const defender=info.defenders.find(unit=>!unit.marker);
    const cards=defender ? R.possibleSupport(defender,true).filter(id=>
      !['dummy','engineer'].includes(R.chit(id).kind)) : [];
    for (const selected of defensiveSupport(cards)) {
      const response=defender ? {...choices,[defender.id]:selected} : choices;
      if (!winsAgainstDefense(board,response)) return false;
    }
    return true;
  }
  function attacks(state) {
    if (R.actor(state)!=='allied' || !['attack','counter'].includes(state.phase)) return [];
    const targets=[...new Set(R.onMap(state,'german').map(u=>u.hex))];
    const used=new Set(), planned=[];
    for (;;) {
      let best=null;
      for (const target of targets) {
        if (planned.some(order=>order.target===target)) continue;
        const units=R.battleCandidates(state,target).filter(unit=>!used.has(unit.id));
        if (!units.length) continue;
        const attackers=units.map(unit=>unit.id);
        if (!guaranteedAttack(state,target,attackers)) continue;
        const defense=R.at(state,target).filter(unit=>unit.side==='german').reduce((sum,unit)=>sum+unit.defense,0);
        const strength=units.reduce((sum,unit)=>sum+unit.attack,0);
        const score=strength/defense+Number(R.city(target))*0.23;
        if (!best || score>best.score) best={target,attackers,score};
      }
      if (!best) break;
      for (const id of best.attackers) used.add(id);
      planned.push({target:best.target,attackers:best.attackers});
    }
    return planned;
  }
  function administration(state) {
    if (R.actor(state)!=='allied') return null;
    const opponents=R.onMap(state,'german');
    const side='allied';
    if (['move','reaction','attack','counter'].includes(state.phase)) {
      for (const unit of R.onMap(state,side).filter(unit=>unit.disrupted)) {
        const ration=unit.support.find(id=>R.chit(id).kind==='ration');
        if (ration) return {type:'ration',unit:unit.id,chit:ration,side};
      }
    }
    if (state.events.length && ['event','reinforce'].includes(state.phase)) {
      const chit=state.events[0];
      const options=R.eventOptions(state,chit);
      const hex=options.slice().sort((a,b)=>nearest(a,opponents)-nearest(b,opponents))[0];
      return {type:'event',chit,hex,side};
    }
    switch (state.phase) {
      case 'supply': {
        const rank=index=>{
          const [points,kind]=D.supply.allied[index];
          return points+(kind==='normal'&&state.groups.allied<4 ? 18 : 0)+
            (kind==='special'&&state.flags.monty ? 16 : 0);
        };
        return {type:'supply',index:state.stock.allied.slice().sort((a,b)=>rank(b)-rank(a))[0],side};
      }
      case 'reentry':
      case 'reinforce': {
        const eligible=R.eligiblePlacements(state);
        const special=state.phase==='reinforce' && eligible.find(unit=>unit.group==='RS');
        const unit=special || eligible[0];
        if (!unit) return {type:'next',side};
        const zones=R.zoc(state,side);
        const score=h=>Math.abs(nearest(h,opponents)-2)+Number(zones.has(h))*4-
          Number(R.source(side,h))*0.7-Number(strongholds.includes(h))*9;
        const hex=R.placements(state,unit.id).slice().sort((a,b)=>score(a)-score(b))[0];
        return {type:'place',unit:unit.id,hex,side};
      }
      case 'recovery': {
        const unit=R.onMap(state,side).filter(u=>u.disrupted&&!u.marker)
          .sort((a,b)=>nearest(a.hex,opponents)-nearest(b.hex,opponents)||b.attack-a.attack)[0];
        return unit&&state.supplyPoints>=3 ? {type:'recover',unit:unit.id,side} : {type:'next',side};
      }
      case 'support': {
        if (state.supportConfirmed && !R.supportPlacementStatus(state).required) return {type:'next',side};
        const order={fort:8,ration:7,artillery:5,tank:4,engineer:3,movement:3};
        const priority=id=>id.startsWith('a-nuts:') ? 10 : R.chit(id).at ? 6 : order[R.chit(id).kind] ?? 2;
        const id=state.hand.filter(id=>R.chit(id).kind!=='dummy').sort((a,b)=>priority(b)-priority(a))[0]
          ?? R.dummyReserve(state,side)[0];
        if (!id) return {type:'confirm-support',side};
        const unit=R.alliedSupportTarget(state,id,R.supportTargets(state));
        return unit ? {type:'assign',unit:unit.id,chit:id,side} : {type:'confirm-support',side};
      }
      case 'event': return {type:'next',side};
      default: return null;
    }
  }
  function reinforcements(state, existing=[]) {
    if (R.actor(state)!=='allied' || state.phase!=='reinforce' || state.events.length) return [];
    const checked=R.previewReinforcements(state,existing);
    const plan=checked.valid;
    let board=checked.state;
    for (;;) {
      const action=administration(board);
      if (action.type!=='place') return plan;
      const order={unit:action.unit,hex:action.hex};
      plan.push(order);
      board=R.previewReinforcements(board,[order]).state;
    }
  }
  return {moves,attacks,reinforcements,administration,distance};
})();
