'use strict';

// The Allied player proposes orders. The rules engine validates them exactly
// as it validates manually entered orders, and only the UI commits them.
const BulgeAI = (() => {
  const R=BulgeRules, D=BulgeData, {distance}=R;
  const strongholds=R.finalVictoryCities;
  function nearest(hex, units) {
    return units.reduce((min,u)=>Math.min(min,distance(hex,u.hex)),30);
  }
  const objectives=new Set([...strongholds,...D.victoryCities]);
  const roadNeighbors=new Map();
  for (const [from,to] of R.roadLinks()) {
    if (!roadNeighbors.has(from)) roadNeighbors.set(from,[]);
    if (!roadNeighbors.has(to)) roadNeighbors.set(to,[]);
    roadNeighbors.get(from).push(to);
    roadNeighbors.get(to).push(from);
  }

  function defensivePosition(state, hex) {
    const roads=state.bridges[hex] ? 0 : (roadNeighbors.get(hex) ?? [])
      .filter(next=>!state.bridges[next]).length;
    return Number(R.city(hex))*2.8 + Math.max(0,roads-2)*1.35 +
      Number(R.ridge(hex))*1.2 - Number(R.river(hex))*0.8 +
      Number(objectives.has(hex))*3.5;
  }
  function moveScore(state, unit, hex, opponents, supply, zones) {
    const near=nearest(hex,opponents);
    const pressure=opponents.filter(enemy=>!enemy.disrupted && !enemy.marker &&
      R.neighbors(hex).includes(enemy.hex)).reduce((sum,enemy)=>sum+enemy.attack,0);
    const allies=R.onMap(state,'allied').filter(other=>other.id!==unit.id && !other.marker && !other.disrupted);
    const nearbyAllies=allies.filter(other=>distance(hex,other.hex)<=2).length;
    const exits=R.neighbors(hex).filter(next=>supply.has(next) && !zones.has(next) &&
      !opponents.some(enemy=>enemy.hex===next)).length;
    const early=state.turn<=4;
    const danger=Math.max(0,(early ? 4 : 3)-near);
    return defensivePosition(state,hex) + (supply.has(hex) ? 1.5 : -4) +
      Math.min(nearbyAllies,2)*0.5 + Math.min(exits,2)*0.6 -
      danger*(early ? 1.65 : 1.25) - Number(zones.has(hex))*2 -
      Math.max(0,pressure-unit.defense)*0.9;
  }
  function defensiveTerrain(hex) {
    if (R.ridge(hex)) return 2;
    return R.neighbors(hex).some(next=>R.riverTerrain(next)) ? 1 : 0;
  }
  function germanReach(board, unit) {
    const hexes=new Set();
    for (const support of [null,...R.moveChits(unit)]) {
      for (const mode of unit.mechanized ? ['normal','mechanized'] : ['normal']) {
        for (const hex of R.movementOptions(board,unit.id,{mode,support}).keys()) hexes.add(hex);
      }
    }
    return hexes;
  }
  function germanMobility(state) {
    const german={...state,phase:'move',turnSide:'german'};
    const threats=R.onMap(state,'german').filter(unit=>!unit.disrupted && unit.movement && !unit.marker);
    const allies=new Map(R.onMap(state,'allied').map(unit=>[unit.id,unit]));
    const supplyBefore=R.lines(german,'german',true);
    const reach=threats.map(unit=>germanReach(german,unit));
    const before=new Set(reach.flatMap(options=>[...options]));
    return board=>{
      const moved=R.onMap(board,'allied').filter(unit=>allies.get(unit.id)?.hex!==unit.hex);
      if (!moved.length) return {closed:0,opened:0,widens:false};
      const affected=new Set();
      for (const unit of moved) {
        affected.add(unit.hex);
        for (const hex of R.unitZoc(unit)) affected.add(hex);
        const old=allies.get(unit.id);
        if (old) {
          affected.add(old.hex);
          for (const hex of R.unitZoc(old)) affected.add(hex);
        }
      }
      const affectedHexes=[...affected];
      const germanAfter={...board,phase:'move',turnSide:'german'};
      const supplyAfter=R.lines(germanAfter,'german',true);
      const after=new Set();
      let widestOpening=0;
      for (const [index,unit] of threats.entries()) {
        const old=reach[index];
        const nearby=affectedHexes.some(hex=>distance(hex,unit.hex)<=(unit.mechanized?10:unit.movement));
        const supplyChanged=unit.mechanized && supplyBefore.has(unit.hex)!==supplyAfter.has(unit.hex);
        const options=nearby || supplyChanged ? germanReach(germanAfter,unit) : old;
        widestOpening=Math.max(widestOpening,options.size-old.size);
        for (const hex of options) after.add(hex);
      }
      const opened=[...after].filter(hex=>!before.has(hex));
      const closed=[...before].filter(hex=>!after.has(hex));
      const widens=opened.some(hex=>objectives.has(hex)) || widestOpening>=6 ||
        (opened.length>=4 && opened.length-closed.length>=3);
      return {closed:closed.length,opened:opened.length,widens};
    };
  }
  function mobilityScore(change) {
    return change.closed*1.5-change.opened*2;
  }
  function futureDefense(state) {
    const board=R.upcomingAlliedReinforcements(state);
    if (!board) return {board:state, orders:[]};
    const orders=reinforcements(board);
    return {board:R.previewReinforcements(board,orders).state, orders};
  }
  function moves(state) {
    if (R.actor(state)!=='allied' || !['move','reaction','highbeam'].includes(state.phase)) return [];
    const opponents=R.onMap(state,'german');
    if (!opponents.length) return [];
    const units=R.onMap(state,'allied').filter(unit=>!unit.disrupted && unit.movement &&
      !unit.movementOrder && !strongholds.includes(unit.hex) && !R.ridge(unit.hex))
      .sort((a,b)=>nearest(a.hex,opponents)-nearest(b.hex,opponents)||b.attack-a.attack);
    const plan=[];
    let preview=R.previewMoves(state,[]).state;
    for (const original of units) {
      const unit=R.unitById(preview,original.id);
      const supply=R.lines(preview,'allied',true);
      const zones=R.zoc(preview,'allied');
      const distanceBefore=nearest(unit.hex,opponents);
      const supports=[null,...R.moveChits(unit)];
      const candidates=new Map();
      for (const mode of ['normal','mechanized']) for (const support of supports) {
        for (const route of R.movementOptions(preview,unit.id,{mode,support}).values()) {
          const hex=route.hex;
          if (R.river(hex)) continue;
          const from=route.path.at(-2) ?? unit.hex;
          const roadEntry=roadNeighbors.get(from)?.includes(hex) && !preview.bridges[from] && !preview.bridges[hex];
          if (unit.support.length && R.ridge(hex) && !roadEntry) continue;
          const spent=Number(Boolean(support&&R.chit(support).discard))*0.9;
          const lost=route.lost ? unit.support.filter(id=>R.chit(id).kind!=='dummy').length*1.15 : 0;
          const excess=route.excess.filter(id=>R.chit(id).kind!=='dummy').length*0.8;
          const distanceAfter=nearest(hex,opponents);
          const westward=R.map.get(unit.hex).col-R.map.get(hex).col;
          const retreat=state.turn<=4 && distanceBefore<=3 && distanceAfter>distanceBefore
            ? Math.min(2,Math.max(0,westward))*0.4 : 0;
          const score=moveScore(preview,unit,hex,opponents,supply,zones)+retreat+
            (defensiveTerrain(hex)-defensiveTerrain(unit.hex))*1.25-
            Math.max(lost,excess)-spent-route.cost*0.045;
          if (score>(candidates.get(hex)?.score ?? -Infinity))
            candidates.set(hex,{order:{unit:unit.id,to:hex,mode,support},path:route.path,score});
        }
      }
      if (!candidates.size) continue;

      const currentMobility=germanMobility(preview);
      const forecast=futureDefense(preview);
      const forecastMobility=forecast.orders.length ? germanMobility(forecast.board) : null;
      let value=moveScore(preview,unit,unit.hex,opponents,supply,zones)+0.75;
      let best=null;
      for (const {order,path,score} of candidates.values()) {
        const hex=order.to;
        const relocated={...unit,hex};
        const control={...preview.control};
        for (const step of path) {
          if (R.city(step)||R.source('allied',step)||R.source('german',step)) control[step]='allied';
        }
        const board={...preview,control,units:preview.units.map(other=>other.id===unit.id ? relocated : other)};
        const immediate=currentMobility(board);
        if (state.phase==='reaction' && immediate.widens) continue;
        const usefulPosition=defensivePosition(preview,hex)>defensivePosition(preview,unit.hex) &&
          supply.has(hex) && !zones.has(hex);
        const near=nearest(hex,opponents);
        let combinedChange=immediate;
        let reduction=mobilityScore(immediate);
        if (forecastMobility) {
          const arrival=R.upcomingAlliedReinforcements(board);
          const trial=R.previewReinforcements(arrival,forecast.orders);
          const combined=trial.rejected.length || R.eligiblePlacements(trial.state).length
            ? R.previewReinforcements(arrival,reinforcements(arrival,trial.valid)).state : trial.state;
          combinedChange=forecastMobility(combined);
          reduction=mobilityScore(combinedChange)+reduction*0.25;
        }
        if (state.turn<=4 && near<distanceBefore && near<=3 &&
            !usefulPosition && combinedChange.closed-combinedChange.opened<4) continue;
        if (score+reduction>value) {
          best=order;
          value=score+reduction;
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
        const compare=germanMobility(state);
        let bestHex, bestScore=-Infinity;
        for (const hex of R.placements(state,unit.id)) {
          if (R.river(hex)) continue;
          const near=nearest(hex,opponents);
          const safeDistance=state.phase==='reentry' || state.turn<=4 ? 4 : 3;
          const exposure=Math.max(0,safeDistance-near)*2.7+Number(zones.has(hex))*6;
          const depthPenalty=Math.max(0,near-safeDistance-2)*0.45;
          const sourceBonus=state.phase==='reinforce' && R.source(side,hex) ? 0.8 : 0;
          const board={...state,units:state.units.map(other=>other.id===unit.id ? {...unit,hex} : other)};
          const score=defensivePosition(state,hex)+defensiveTerrain(hex)*1.25+sourceBonus-
            exposure-depthPenalty+mobilityScore(compare(board));
          if (score>bestScore) {
            bestHex=hex;
            bestScore=score;
          }
        }
        const hex=bestHex ?? R.placements(state,unit.id)[0];
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
