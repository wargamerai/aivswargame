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
  function moves(state) {
    if (R.actor(state)!=='allied' || !['move','reaction','highbeam'].includes(state.phase)) return [];
    const opponents=R.onMap(state,'german');
    if (!opponents.length) return [];
    const units=R.onMap(state,'allied').filter(u=>!u.disrupted&&u.movement&&!strongholds.includes(u.hex))
      .sort((a,b)=>nearest(a.hex,opponents)-nearest(b.hex,opponents)||b.attack-a.attack);
    let plan=[], preview=state;
    for (const original of units) {
      const unit=R.unitById(preview,original.id);
      const supply=R.lines(preview,'allied',true);
      let value=moveScore(preview,unit,unit.hex,opponents,supply)+0.55, best=null;
      const supports=[null,...R.moveChits(unit)];
      for (const mode of ['normal','mechanized']) for (const support of supports) {
        for (const route of R.movementOptions(preview,unit.id,{mode,support}).values()) {
          const spent=Number(Boolean(support&&R.chit(support).discard))*0.9;
          const lost=route.lost ? unit.support.filter(id=>R.chit(id).kind!=='dummy').length*1.15 : 0;
          const excess=route.excess.filter(id=>R.chit(id).kind!=='dummy').length*0.8;
          const score=moveScore(preview,unit,route.hex,opponents,supply)-Math.max(lost,excess)-spent-route.cost*0.045;
          if (score>value) {
            best={unit:unit.id,to:route.hex,mode,support}; value=score;
          }
        }
      }
      if (best) {
        plan.push(best);
        preview=R.previewMoves(state,plan).state;
      }
    }
    return plan;
  }
  function attacks(state) {
    if (R.actor(state)!=='allied' || !['attack','counter'].includes(state.phase)) return [];
    const targets=[...new Set(R.onMap(state,'german').map(u=>u.hex))];
    const used=new Set(), planned=[];
    for (;;) {
      let best=null;
      for (const target of targets) {
        if (planned.some(b=>b.target===target)) continue;
        const attackers=R.battleCandidates(state,target).filter(u=>!used.has(u.id));
        if (!attackers.length) continue;
        const defense=R.at(state,target).filter(u=>u.side==='german').reduce((sum,u)=>sum+u.defense,0);
        const strength=attackers.reduce((sum,u)=>sum+u.attack,0);
        const column=R.ratioColumn(strength,defense);
        // Leave low-odds combats alone. Compare expected losses for the whole group.
        const score=D.crt.reduce((sum,row)=>{
          const result=row[column];
          const loss=Number(/A(\d)/.exec(result)?.[1]||0)*attackers.length;
          const inflicted=Number(/D(\d)/.exec(result)?.[1]||0);
          return sum+inflicted*1.45-loss;
        },0)/6 + Number(R.city(target))*0.23;
        if (column>=2 && score>0.05 && (!best||score>best.score)) best={ target, attackers, score };
      }
      if (!best) break;
      const ids=best.attackers.map(u=>u.id);
      for (const id of ids) used.add(id);
      planned.push({target:best.target,attackers:ids});
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
        const unit=R.eligiblePlacements(state)[0];
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
  return {moves,attacks,administration,distance};
})();
