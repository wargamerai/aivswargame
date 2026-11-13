'use strict';

// The Allied player proposes orders. The rules engine validates them exactly
// as it validates manually entered orders, and only the UI commits them.
const BulgeAI = (() => {
  const R=BulgeRules, D=BulgeData, {distance}=R;
  const strongholds=[...R.finalVictoryCities,'2410'];
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

  function holdsPosition(state, hex) {
    return objectives.has(hex) || (state.depot && hex===D.depotHex);
  }
  function encirclementRisk(hex, coverage, germanReach) {
    if (R.isEncircled(hex,coverage)) return 2;
    const adjacent=R.neighbors(hex);
    return Number(adjacent.length===6 && adjacent.every(next=>coverage.has(next) || germanReach.has(next)));
  }
  function frontStage(board, reach, coverage, incoming=0) {
    const rows=[...new Set([...reach,...coverage].map(hex=>R.map.get(hex).row))];
    if (!rows.length) return 0;
    const span=Math.max(...rows)-Math.min(...rows)+1;
    const available=R.onMap(board,'allied').filter(unit=>!unit.marker && !unit.disrupted).length+incoming;
    if (available>=Math.max(2,Math.ceil(span/2))) return 2;
    return available>=Math.max(2,Math.ceil(span/3)) ? 3 : 0;
  }
  function frontSpacing(board, reach, coverage, spacing) {
    if (!spacing) return 0;
    const units=R.onMap(board,'allied').filter(unit=>!unit.marker && !unit.disrupted &&
      affectsGermanAdvance(unit,reach,coverage));
    return units.reduce((score,unit)=>{
      const gap=nearest(unit.hex,units.filter(other=>other.id!==unit.id));
      return score+(gap===spacing ? 2 : gap===spacing+1 ? 1 : gap<spacing ? -1 : 0);
    },0);
  }
  function threatenedObjectives(board, reach) {
    const attackers=new Set(R.onMap(board,'german').filter(unit=>!unit.disrupted && !unit.marker).map(unit=>unit.hex));
    const sites=board.depot ? new Set([...objectives,D.depotHex]) : objectives;
    return [...sites].filter(hex=>board.control[hex]==='allied' &&
      (reach.has(hex) || R.neighbors(hex).some(next=>reach.has(next) || attackers.has(next))));
  }
  function objectiveDefense(board, sites, reach) {
    const garrisons=new Set(R.onMap(board,'allied').filter(unit=>!unit.marker && !unit.disrupted).map(unit=>unit.hex));
    let guarded=0, approaches=0;
    for (const hex of sites) {
      if (!garrisons.has(hex)) continue;
      guarded++;
      approaches+=R.neighbors(hex).filter(next=>reach.has(next)).length;
    }
    return [guarded,-approaches];
  }
  function defensePriority(board, immediate, forecast, coverage, relevant, tactical, opportunity, spacing, reach, sites) {
    const allies=R.onMap(board,'allied').filter(unit=>!unit.marker);
    const safety=allies.reduce((sum,unit)=>sum+encirclementRisk(unit.hex,coverage,immediate.reach),0);
    const projectedSafety=R.onMap(forecast.board,'allied').filter(unit=>!unit.marker)
      .reduce((sum,unit)=>sum+encirclementRisk(unit.hex,coverage,forecast.reach),0);
    const closure=Math.trunc((forecast.change.closed-forecast.change.opened)/3);
    const [guarded, approaches]=objectiveDefense(board,sites,immediate.reach);
    const [projectedGuarded, projectedApproaches]=objectiveDefense(forecast.board,sites,forecast.reach);
    return [-safety,-projectedSafety,guarded,projectedGuarded,approaches,projectedApproaches,
      Number(relevant),frontSpacing(forecast.board,reach,coverage,spacing),
      closure,Number(opportunity),tactical];
  }
  function affectsGermanAdvance(unit, reach, coverage) {
    return coverage.has(unit.hex) || [unit.hex,...R.unitZoc(unit)].some(hex=>reach.has(hex));
  }
  function betterDefense(candidate, current) {
    const difference=candidate.findIndex((value,index)=>value!==current[index]);
    return difference>=0 && candidate[difference]>current[difference];
  }

  function defensivePosition(state, hex) {
    const roads=state.bridges[hex] ? 0 : (roadNeighbors.get(hex) ?? [])
      .filter(next=>!state.bridges[next]).length;
    return Number(R.city(hex))*2.8 + Math.max(0,roads-2)*1.35 +
      Number(R.ridge(hex))*1.2 - Number(R.river(hex))*0.8 +
      Number(holdsPosition(state,hex))*3.5;
  }
  function moveScore(state, hex, supply, coverage) {
    const exits=R.neighbors(hex).filter(next=>supply.has(next) && !coverage.has(next)).length;
    return defensivePosition(state,hex) + (supply.has(hex) ? 1.5 : -4) +
      Math.min(exits,2)*0.6;
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
      if (!moved.length) return {closed:0,opened:0,widens:false,reach:before};
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
      const widens=opened.length>=3 && (opened.some(hex=>objectives.has(hex)) || widestOpening>=6 ||
        opened.length-closed.length>=5);
      return {closed:closed.length,opened:opened.length,widens,reach:after};
    };
  }
  function mobilityScore({closed,opened}) {
    return Math.max(0,closed-2)*0.65-Math.max(0,opened-2)*1.1;
  }
  function frontGap(board, unit, hex, before, after) {
    const allies=R.onMap(board,'allied').filter(other=>other.id!==unit.id);
    const alliedZones=new Set(allies.flatMap(R.unitZoc));
    const nextZones=R.unitZoc({...unit,hex});
    const covered=nextZones.filter(next=>before.has(next) && !after.has(next) && !alliedZones.has(next)).length;
    return Math.max(0,covered-2)*0.55;
  }
  function futureDefense(state) {
    const board=R.upcomingAlliedReinforcements(state);
    if (!board) return null;
    const orders=reinforcements(board);
    return {board:R.previewReinforcements(board,orders).state, orders};
  }
  function completesEncirclement(board, enemies, previousBlockade, moved) {
    const newlyBlocked=new Set([moved.hex,...R.unitZoc(moved)].filter(hex=>!previousBlockade.has(hex)));
    if (!newlyBlocked.size) return false;
    const blockade=R.unitCoverage(R.onMap(board,'allied'));
    return enemies.some(enemy=>!enemy.marker && R.neighbors(enemy.hex).some(hex=>newlyBlocked.has(hex)) &&
      R.isEncircled(enemy.hex,blockade));
  }
  function opensAttackOpportunity(before, after, id, enemies) {
    const moved=R.unitById(after,id);
    if (!moved.support.some(chip=>R.chit(chip).kind!=='dummy')) return false;
    const phase=after.turnSide==='allied'?'attack':'counter';
    const attackBoard={...after,phase};
    const previousAttackBoard={...before,phase};
    for (const enemy of enemies) {
      if (!R.neighbors(enemy.hex).includes(moved.hex)) continue;
      const attackers=R.battleCandidates(attackBoard,enemy.hex).map(unit=>unit.id);
      if (!attackers.includes(id) || !guaranteedAttack(attackBoard,enemy.hex,attackers,R.inflictsUnitDamage)) continue;
      const previousAttackers=R.battleCandidates(previousAttackBoard,enemy.hex).map(unit=>unit.id);
      if (!previousAttackers.includes(id) ||
          !guaranteedAttack(previousAttackBoard,enemy.hex,previousAttackers,R.inflictsUnitDamage)) return true;
    }
    return false;
  }

  function moves(state) {
    if (R.actor(state)!=='allied' || !['move','reaction','highbeam'].includes(state.phase)) return [];
    const opponents=R.onMap(state,'german');
    if (!opponents.length) return [];
    const opponentHexes=new Set(opponents.map(unit=>unit.hex));
    const coverage=R.unitCoverage(opponents);
    const plan=[];
    let preview=R.previewMoves(state,[]).state;
    const initialMobility=germanMobility(preview);
    const initialReach=initialMobility(preview).reach;
    const sites=threatenedObjectives(preview,initialReach);
    const units=R.onMap(preview,'allied').filter(unit=>!unit.disrupted && unit.movement &&
      !unit.movementOrder)
      .sort((a,b)=>encirclementRisk(b.hex,coverage,initialReach)-encirclementRisk(a.hex,coverage,initialReach) || b.attack-a.attack);
    const alreadyMoved=new Set(preview.trails.map(trail=>trail.id));
    for (const original of units) {
      if (alreadyMoved.has(original.id)) continue;
      const unit=R.unitById(preview,original.id);
      const supply=R.lines(preview,'allied',true);
      const currentMobility=plan.length ? germanMobility(preview) : initialMobility;
      const current=currentMobility(preview);
      const currentRisk=encirclementRisk(unit.hex,coverage,current.reach);
      const supports=[null,...R.moveChits(unit)];
      const candidates=new Map();
      for (const mode of ['normal','mechanized']) for (const support of supports) {
        for (const route of R.movementOptions(preview,unit.id,{mode,support}).values()) {
          const hex=route.hex;
          if (R.river(hex) && !currentRisk) continue;
          const from=route.path.at(-2) ?? unit.hex;
          const roadEntry=roadNeighbors.get(from)?.includes(hex) && !preview.bridges[from] && !preview.bridges[hex];
          if (unit.support.length && R.ridge(hex) && !roadEntry) continue;
          const spent=Number(Boolean(support&&R.chit(support).discard))*0.9;
          const lost=route.lost ? unit.support.filter(id=>R.chit(id).kind!=='dummy').length*1.15 : 0;
          const excess=route.excess.filter(id=>R.chit(id).kind!=='dummy').length*0.8;
          const score=moveScore(preview,hex,supply,coverage)+
            (defensiveTerrain(hex)-defensiveTerrain(unit.hex))*1.25-
            Math.max(lost,excess)-spent-route.cost*0.045;
          if (score>(candidates.get(hex)?.score ?? -Infinity))
            candidates.set(hex,{order:{unit:unit.id,to:hex,mode,support},path:route.path,score});
        }
      }
      if (!candidates.size) continue;

      const forecast=futureDefense(preview);
      const forecastMobility=forecast ? germanMobility(forecast.board) : null;
      const forecastBefore=forecastMobility ? forecastMobility(forecast.board) : current;
      const spacing=frontStage(forecast?.board ?? preview,forecastBefore.reach,coverage);
      const holdScore=moveScore(preview,unit.hex,supply,coverage)+
        frontGap(preview,unit,unit.hex,current.reach,current.reach)+0.75;
      const nuts=unit.support.find(id=>id.startsWith('a-nuts:'));
      let value=defensePriority(preview,current,{board:forecast?.board ?? preview,reach:forecastBefore.reach,change:forecastBefore},
        coverage,affectsGermanAdvance(unit,current.reach,coverage),holdScore,Boolean(nuts && nutsAttack(preview,unit.id,nuts)),spacing,forecastBefore.reach,sites);
      const previousBlockade=R.unitCoverage(R.onMap(preview,'allied'));
      const hasSupport=unit.support.some(id=>R.chit(id).kind!=='dummy');
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
        const risk=encirclementRisk(hex,coverage,immediate.reach);
        if (risk>currentRisk || (risk===2 && currentRisk===2)) continue;
        const exposesAlly=R.onMap(preview,'allied').some(other=>!other.marker && other.id!==unit.id &&
          encirclementRisk(other.hex,coverage,immediate.reach)>encirclementRisk(other.hex,coverage,current.reach));
        if (exposesAlly || (state.phase==='reaction' && immediate.widens && risk>=currentRisk)) continue;
        let projected=board, change=immediate;
        if (forecastMobility) {
          const arrival=R.upcomingAlliedReinforcements(board);
          const trial=R.previewReinforcements(arrival,forecast.orders);
          projected=trial.rejected.length || R.eligiblePlacements(trial.state).length
            ? R.previewReinforcements(arrival,reinforcements(arrival,trial.valid)).state : trial.state;
          change=forecastMobility(projected);
        }
        const tactical=score+mobilityScore(immediate)*0.25+
          frontGap(preview,unit,hex,current.reach,immediate.reach);
        let opportunity=false;
        if (hasSupport && risk===0) {
          opportunity=completesEncirclement(board,opponents,previousBlockade,relocated);
          if (!opportunity && R.neighbors(hex).some(next=>opponentHexes.has(next))) {
            const after=R.previewMoves(state,[...plan,order]).state;
            opportunity=nuts ? nutsAttack(after,unit.id,nuts) : opensAttackOpportunity(preview,after,unit.id,opponents);
          }
        }
        const relevant=opportunity || immediate.closed>0 || affectsGermanAdvance(relocated,current.reach,coverage);
        const candidate=defensePriority(board,immediate,{board:projected,reach:change.reach,change},coverage,relevant,tactical,opportunity,spacing,forecastBefore.reach,sites);
        if (betterDefense(candidate,value)) {
          best=order;
          value=candidate;
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
  function guaranteedAgainstDefense(state, choices, outcome, targets=[], checked=new Set()) {
    // The same set of tanks removed by German AT gives the same remaining support.
    const key=targets.slice().sort().join(',');
    if (checked.has(key)) return true;
    checked.add(key);
    const profile=R.combatProfile(state,choices,targets);
    if (profile.nextAT)
      return profile.nextAT.every(({id})=>guaranteedAgainstDefense(state,choices,outcome,[...targets,id],checked));
    if (profile.artillerySide==='allied') return outcome(profile,R.suggestedDie(profile));
    // Every face is possible with either a random roll or German artillery.
    return D.crt.every((_,index)=>outcome(profile,index+1));
  }
  function guaranteedAttack(state, target, attackers, outcome=R.decisiveAttack) {
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
      if (!guaranteedAgainstDefense(board,response,outcome)) return false;
    }
    return true;
  }
  function nutsAttack(state, id, chit) {
    const unit=R.unitById(state,id);
    if (!unit?.hex || unit.disrupted || !unit.support.includes(chit)) return false;
    const board={...state,phase:state.turnSide==='allied'?'attack':'counter'};
    return R.neighbors(unit.hex).some(target=>{
      const attackers=R.battleCandidates(board,target).map(candidate=>candidate.id);
      return attackers.includes(id) && guaranteedAttack(board,target,attackers);
    });
  }
  function nutsRecipient(state, chit, recipients) {
    const phase=state.turnSide==='allied'?'move':'reaction';
    const coverage=R.unitCoverage(R.onMap(state,'german'));
    const candidates=recipients.filter(unit=>!unit.disrupted && !R.isEncircled(unit.hex,coverage));
    const withChit=unit=>({...state,phase,units:state.units.map(other=>other.id===unit.id
      ? {...other,support:[...other.support,chit]} : other)});
    for (const unit of candidates) {
      if (nutsAttack(withChit(unit),unit.id,chit)) return unit;
    }
    for (const unit of candidates) {
      const board=withChit(unit);
      const plan=moves(board);
      if (!plan.some(order=>order.unit===unit.id)) continue;
      const projected=R.previewMoves(board,plan).state;
      if (nutsAttack(projected,unit.id,chit)) return unit;
    }
    return null;
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
        const usesNuts=units.some(unit=>unit.support.some(id=>id.startsWith('a-nuts:')));
        if (!best || Number(usesNuts)>Number(best.usesNuts) || (usesNuts===best.usesNuts && score>best.score))
          best={target,attackers,score,usesNuts};
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
        const supply=R.lines(state,side,true);
        const coverage=R.unitCoverage(opponents);
        const compare=germanMobility(state);
        const before=compare(state).reach;
        const sites=threatenedObjectives(state,before);
        const places=R.placements(state,unit.id);
        const spacing=frontStage(state,before,coverage,eligible.length);
        let bestHex, bestValue;
        for (const hex of places) {
          const board={...state,units:state.units.map(other=>other.id===unit.id ? {...unit,hex} : other)};
          const change=compare(board);
          const exits=R.neighbors(hex).filter(next=>supply.has(next) && !coverage.has(next) && !change.reach.has(next));
          const risk=encirclementRisk(hex,coverage,change.reach);
          const score=defensivePosition(state,hex)+defensiveTerrain(hex)*1.25+
            Math.min(exits.length,2)*0.5+mobilityScore(change)+
            frontGap(state,unit,hex,before,change.reach);
          const relevant=change.closed>0 || affectsGermanAdvance({...unit,hex},before,coverage);
          const value=[-risk,...objectiveDefense(board,sites,change.reach),-Number(R.river(hex)),Number(relevant),frontSpacing(board,before,coverage,spacing),
            Math.trunc((change.closed-change.opened)/3),score];
          if (!bestValue || betterDefense(value,bestValue)) {
            bestHex=hex;
            bestValue=value;
          }
        }
        const hex=bestHex;
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
        const recipients=R.supportTargets(state);
        const unit=(id.startsWith('a-nuts:') && nutsRecipient(state,id,recipients)) ||
          R.alliedSupportTarget(state,id,recipients);
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
