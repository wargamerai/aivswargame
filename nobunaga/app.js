(() => {
  const D = window.GAME_DATA;
  try{history.replaceState({nobunagaGame:true},'',location.href);history.pushState({nobunagaGame:true},'',location.href);window.addEventListener('popstate',()=>history.pushState({nobunagaGame:true},'',location.href))}catch{}
  let battleQueue=[],battleInProgress=false,battleTimer=null,movementTimer=null,movementPlan=null,pendingResolution=null,resolutionEntries=[],enemyStepQueue=[],enemyStepCard=null,enemyCurrentStep=null,enemyStepHistory=[],enemyViewIdx=-1,enemyAutoConfirm=false;const announcementQueue=[];let announcementBusy=false;
  const $ = (s) => document.querySelector(s);
  const leaderPower = Object.fromEntries(D.areas.flatMap(a => a.initial.map(([leader,, ,power]) => [leader,power])));
  const homeArea = Object.fromEntries(D.areas.flatMap(a => a.initial.map(([leader]) => [leader,a.id])));
  const odaRetainers=['羽柴秀吉','明智光秀','柴田勝家','丹羽長秀'];
  const retainerSites=[['yamashiro','山城'],['minamikinki','南近江'],['minamise','南伊勢'],['owari','尾張']];

  // ===== ルールの手伝い（2026-11-09 ルール見直し）=====
  const leaderArmy=Object.fromEntries(D.areas.flatMap(a=>a.initial.filter(([l])=>l).map(([l,army])=>[l,army])));
  function armyHomes(army){const out=new Set();for(const [l,ar] of Object.entries(leaderArmy))if(ar===army&&homeArea[l]&&(!optionalLeaders[l]||state.options[optionalLeaders[l].option]))out.add(homeArea[l]);if(/一向一揆/.test(army))for(const a of D.areas)if(a.initial.some(([,ar])=>ar===army))out.add(a.id);if(army==='織田軍')for(const l of ['織田信長',...odaRetainers])if(homeArea[l])out.add(homeArea[l]);return out}
  function pieces(f){return (Number(f.count)||0)+(f.leader?1:0)}
  function alive(f){return pieces(f)>0}
  const isIkko=army=>/一向一揆|本願寺/.test(army);
  // 一向一揆（石山・長島・加賀）の駒が本領の外にいるときは、本願寺の駒として見せる（中身のデータはそのまま）2026-11-09
  function shownArmy(f,areaId){if(!f||!/一向一揆/.test(f.army))return f?.army;if(!areaId){const hit=Object.entries(state.areas).find(([,r])=>r.forces.includes(f));areaId=hit?.[0]}return areaId&&!armyHomes(f.army).has(areaId)?'本願寺（雑賀軍）':f.army}
  function poolFor(force,n){if(!n)return;if(force.army==='中立軍')return;if(force.side==='enemy')state.enemyPool+=n;else state.playerPool+=n}
  const sideOfArmy = (army) => /織田|徳川|松永/.test(army) ? 'player' : (/中立|足利/.test(army) ? 'neutral' : 'enemy');
  const takigawa = '滝川一益', maeda = '前田利家';
  const optionalLeaders = {
    [takigawa]: {option:'extraTakigawa', home:'owari', cardOffset:0},
    [maeda]: {option:'extraMaeda', home:'nishimino', cardOffset:2}
  };
  function scenarioCards(options) {
    const cards = D.cards.map((card,id)=>({...card,id,leaders:card.leaders?.slice()}));
    const nobunaga = cards.find(card=>card.name==='織田信長');
    for (const [name, {option, cardOffset}] of Object.entries(optionalLeaders)) {
      if (!options[option]) continue;
      nobunaga.leaders.push(name);
      cards.push({name,side:'player',leaders:[name],reinforce:'actingOda',id:D.cards.length+cardOffset,
        description:`${name}が行動する。補充は織田軍なら戦略値分、反逆織田軍なら2駒。`});
    }
    if (options.extraNobunaga) cards.push({...nobunaga,id:D.cards.length+1});
    return cards;
  }
  function startingStrength(options) {
    const count=Number(options.startingStrength);
    return Number.isInteger(count)&&count>=5&&count<=10 ? count : 0;
  }
  function setupAreas(options, areas) {
    for (const [leader, {option, home}] of Object.entries(optionalLeaders)) {
      if (options[option]) areas[home].forces.push({leader,army:'織田軍',count:0,power:2,side:'player'});
    }
    const strength=startingStrength(options);
    if (strength) for (const area of Object.values(areas)) {
      for (const force of area.forces) {
        if (force.side==='player'&&force.leader!=='織田信長') force.count=strength;
      }
    }
    return areas;
  }
  for (const [leader, {home}] of Object.entries(optionalLeaders)) {
    leaderArmy[leader]='織田軍';
    homeArea[leader]=home;
  }
  function reserveTotal(options) {
    const count=Number(options.reserveTotal);
    return [12,13,14,15].includes(count) ? count : 10;
  }
  function initialDeck(options) {
    const deck=shuffle(scenarioCards(options));
    if (options.chooseFirstCard) {
      const index=deck.findIndex(card=>card.name===options.firstCard);
      if (index>0) deck.unshift(deck.splice(index,1)[0]);
    }
    return deck;
  }
  const fresh = (options={}) => ({options:{extraTakigawa:Boolean(options.extraTakigawa),extraMaeda:Boolean(options.extraMaeda),startingStrength:startingStrength(options),extraNobunaga:Boolean(options.extraNobunaga),reserveTotal:reserveTotal(options),chooseFirstCard:Boolean(options.chooseFirstCard),firstCard:options.firstCard||'',captureDefeat:Boolean(options.captureDefeat),leaderInjury:Boolean(options.leaderInjury),showUnitStats:Boolean(options.showUnitStats)},leaderPool:{player:[],enemy:[]},areas:setupAreas(options,Object.fromEntries(D.areas.map(a=>[a.id,{control:(a.initial[0] ? sideOfArmy(a.initial[0][1]) : 'neutral'),ownerArmy:a.initial[0]?.[1]||'',forces:a.initial.map(([leader,army,count,power])=>({leader,army,count,power:D.units?.leaders?.[leader]??power,side:sideOfArmy(army)}))}]))),playerPool:reserveTotal(options),enemyPool:12,deck:initialDeck(options),discard:[],round:1,lastCard:null,selectedArea:null,selectedLeader:null,mode:'',moveDestination:null,moveCount:null,reinforceCount:null,actionHighlights:[],mapFocusArea:null,pendingCard:null,highlightedCard:null,lastMove:null,tracks:{oda:0,tokugawa:0,matsunaga:0,uesugi:0,mori:0,ukita:0},revoltTracks:{},activeCard:null,lastActor:null,log:['ゲームを開始しました。状況カードを引いてください。'],over:false,turnComplete:true,setupComplete:false});
  const savedState=load();
  let canContinue=Boolean(savedState&&savedState.setupComplete&&D.areas.every(a=>savedState.areas?.[a.id]));
  let state = savedState || fresh();
  if(D.areas.some(a=>!state.areas?.[a.id])) state=fresh();
  state.setupComplete ??= false;if(state.mode==='moveAnimating')state.mode='';state.moveDestination??=null;state.moveCount??=null;state.reinforceCount??=null;state.moveSource??=null;state.turnComplete ??= true;state.options ||= {chooseFirstCard:false,firstCard:'',captureDefeat:false,leaderInjury:false,showUnitStats:false};state.options.showUnitStats=Boolean(state.options.showUnitStats);
  state.leaderPool ||= {player:[],enemy:[]};state.actionHighlights ||= [];state.mapFocusArea ||= null;state.pendingCard ||= null;state.highlightedCard ||= null;state.lastMove ||= null;state.trackFlash ||= null;
  state.tracks ||= {};for(const key of ['oda','tokugawa','matsunaga','uesugi','mori','ukita'])state.tracks[key]??=0;state.tracks.uesugi=Math.min(7,state.tracks.uesugi);state.tracks.mori=Math.min(7,state.tracks.mori);state.tracks.ukita=Math.min(7,state.tracks.ukita);state.tracks.tokugawa=Math.min(4,state.tracks.tokugawa);state.tracks.matsunaga=Math.min(4,state.tracks.matsunaga);syncLoyaltyForce('tokugawa');syncLoyaltyForce('matsunaga');state.tracks.oda=Math.min(5,state.tracks.oda);state.revoltTracks ||= {};state.activeCard ||= null;state.lastActor ||= null;
  if(!state.deck?.every(c=>scenarioCards(state.options).some(d=>d.name===c.name))){state.deck=shuffle(scenarioCards(state.options));state.discard=[];state.lastCard=null}
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function save(){if(state.over&&!state.reportDone&&(state.report||[]).length){state.reportDone=true;setTimeout(()=>{try{downloadReport()}catch(e){console.error(e)}},900)}try{localStorage.setItem('nobunaga1570-save',JSON.stringify(state))}catch{}}
  function load(){try{const v=JSON.parse(localStorage.getItem('nobunaga1570-save'));return v&&v.areas?v:null}catch{return null}}
  function note(t){(state.report||=[]).push({k:'note',r:state.round,c:state.lastCard?.name||'',t});state.log.unshift(t);state.log=state.log.slice(0,24);resolutionEntries.unshift(t)}
  function areaBy(id){return D.areas.find(a=>a.id===id)}
  function isPlayer(f){return f.side==='player'}
  function getLeader(name){for(const [id,a] of Object.entries(state.areas)){const f=a.forces.find(x=>x.leader===name);if(f)return {area:id,force:f}}return null}
  function recalc(){
    const bases=D.areas.filter(a=>a.base);let n=0;
    for(const a of bases){const region=state.areas[a.id];if(region.control==='player')n++}
    state.strategy=Math.floor(n/2);return {n,total:bases.length};
  }
  // 同じエリアの同じ軍（同じ側）の駒は、ひとつの山にまとめる（武将がいればその武将の山へ）2026-11-09
  function mergeStacks(){for(const region of Object.values(state.areas)){const out=[];for(const f of region.forces){if(!alive(f))continue;const same=out.find(g=>g.army===f.army&&g.side===f.side&&
      (!f.leader&&!g.leader||Boolean(f.leader)!==Boolean(g.leader)&&
        !(f.leader?g:f).garrison&&!excludedFromAllocation(f.leader||g.leader)));if(same){same.count+=f.count;f.count=0;if(f.leader){same.leader=f.leader;same.power=f.power;f.leader=''}}else out.push(f)}region.forces=out}}
  function render(){
    mergeStacks();syncLoyaltyForce('tokugawa');syncLoyaltyForce('matsunaga');
    const {n,total}=recalc();$('#strategy').textContent=state.strategy;$('#baseCount').textContent=`${n}/${total}`;$('#baseMeter').style.width=`${n/total*100}%`;
    if($('#turnBadge'))$('#turnBadge').textContent=`第${state.round}巡`;$('#deckCount').textContent=`山札 ${state.deck.length}枚`;
    $('#phaseTitle').textContent=state.over?'ゲーム終了':`戦略値 ${state.strategy} · 拠点 ${n}/${total}`;
    $('#playerPool').textContent=state.playerPool;$('#enemyPool').textContent=state.enemyPool;
    renderMap();renderTracks();renderPools();renderFactions();renderInventory();renderCommands();renderEvent();
    $('#openFormation').disabled=!formationAvailable();
    if(state.mapFocusArea){const id=state.mapFocusArea;state.mapFocusArea=null;requestAnimationFrame(()=>{centerMapOnArea(id);requestAnimationFrame(positionActionPanel)})}else if((state.mode==='cardAction'||(state.mode==='move'&&!state.moveDestination))&&state.selectedArea)requestAnimationFrame(()=>{centerMapOnArea(state.selectedArea);requestAnimationFrame(positionActionPanel)});else requestAnimationFrame(positionActionPanel);
    $('#log').innerHTML=state.log.map(x=>`<div class="log-entry">${esc(x)}</div>`).join('');$('#endTurn').disabled=state.over||Boolean(state.mode)||Boolean(pendingResolution)||Boolean(state.lastCard&&!state.turnComplete);$('#endTurn').textContent=state.over?'ゲーム終了':state.mode==='cardReveal'?'カードを確認中':state.lastCard?(state.turnComplete?'終了・次のカードへ':'行動を選択中'):'状況カードを引く';
    save();
  }
  function renderMap(){
    const activeCard=state.activeCard||state.pendingCard||state.highlightedCard||state.lastCard,cardLeaders=new Set(activeCard?.leaders||[]),homeAttacks=activeCard?.special==='ikkoshuHomeAttacks';
    const allTerritories=window.TERRITORY_PATHS||{},territoryDefs=`<defs><filter id="territoryEdgeBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter><pattern id="seigaiha" width="260" height="130" patternUnits="userSpaceOnUse"><g fill="#cbdad6" stroke="#9db8b3" stroke-width="3.5"><g><circle cx="0" cy="65.0" r="122"/><circle cx="0" cy="65.0" r="94"/><circle cx="0" cy="65.0" r="66"/><circle cx="0" cy="65.0" r="38"/><circle cx="0" cy="65.0" r="12"/></g><g><circle cx="260" cy="65.0" r="122"/><circle cx="260" cy="65.0" r="94"/><circle cx="260" cy="65.0" r="66"/><circle cx="260" cy="65.0" r="38"/><circle cx="260" cy="65.0" r="12"/></g><g><circle cx="130.0" cy="130" r="122"/><circle cx="130.0" cy="130" r="94"/><circle cx="130.0" cy="130" r="66"/><circle cx="130.0" cy="130" r="38"/><circle cx="130.0" cy="130" r="12"/></g><g><circle cx="0" cy="195.0" r="122"/><circle cx="0" cy="195.0" r="94"/><circle cx="0" cy="195.0" r="66"/><circle cx="0" cy="195.0" r="38"/><circle cx="0" cy="195.0" r="12"/></g><g><circle cx="260" cy="195.0" r="122"/><circle cx="260" cy="195.0" r="94"/><circle cx="260" cy="195.0" r="66"/><circle cx="260" cy="195.0" r="38"/><circle cx="260" cy="195.0" r="12"/></g></g></pattern><filter id="washiGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .34  0 0 0 0 .22  0 0 0 .55 -.18"/></filter>${Object.entries(allTerritories).map(([id,path])=>`<clipPath id="territoryClip-${id}" clipPathUnits="userSpaceOnUse"><path fill-rule="evenodd" clip-rule="evenodd" d="${path}"/></clipPath>`).join('')}</defs>`;
    const gameAreaIds=new Set(D.areas.map(a=>a.id));
    const controlledTerritories=D.areas.map(a=>{const r=state.areas[a.id],path=allTerritories[a.id],faction=r.control==='player'?'player':r.control==='enemy'?'enemy':'neutral';return path?`<g class="territory-group faction-${faction}"><path class="region-shape territory-region control-${r.control||'neutral'} faction-${faction}" fill-rule="evenodd" d="${path}"/><path class="territory-edge-soft" d="${path}" clip-path="url(#territoryClip-${a.id})"/><path class="territory-edge" d="${path}" clip-path="url(#territoryClip-${a.id})"/></g>`:''}).join('');
    const staticTerritories=Object.entries(allTerritories).filter(([id])=>!gameAreaIds.has(id)).map(([id,path])=>`<g class="territory-group faction-neutral"><path class="territory-region faction-neutral" fill-rule="evenodd" d="${path}"/><path class="territory-edge-soft" d="${path}" clip-path="url(#territoryClip-${id})"/><path class="territory-edge" d="${path}" clip-path="url(#territoryClip-${id})"/></g>`).join('');
    const highlightedTerritories=D.areas.filter(a=>{const region=state.areas[a.id];return state.selectedArea===a.id||region.forces.some(f=>cardLeaders.has(f.leader)||(homeAttacks&&/一向一揆|本願寺/.test(f.army)))}).map(a=>{const path=allTerritories[a.id];return path?`<path class="territory-highlight-underlay" d="${path}"/><path class="territory-highlight-overlay" d="${path}"/>`:''}).join('');const territoryHitPaths=D.areas.map(a=>{const path=allTerritories[a.id];return path?`<path class="territory-hit" data-area="${a.id}" d="${path}"/>`:''}).join('');const landEdges=Object.values(allTerritories).map(path=>`<path d="${path}"/>`).join('');const seaLayer=`<g mask="url(#oceanMask)"><rect width="4153" height="2923" fill="#cbdad6"/><rect width="4153" height="2923" fill="url(#seigaiha)" opacity=".45"/><g class="sea-shore" filter="url(#seaEdgeBlur)" opacity=".58">${landEdges.replaceAll('<path ', '<path fill="none" stroke="#7c9fa0" stroke-width="30" ')}</g></g>`;$('#territoryShapes').innerHTML=territoryDefs+seaLayer+`<g class="land-base">${landEdges.replaceAll('<path ', '<path fill="#efe7d4" ')}</g>`+controlledTerritories+staticTerritories+`<rect class="washi-grain" width="4153" height="2923" filter="url(#washiGrain)" opacity=".35" pointer-events="none"/><g class="territory-highlight-layer">${highlightedTerritories}</g><g class="territory-hit-layer">${territoryHitPaths}</g>`;
    const moving=new Set(state.actionHighlights||[]),origin=state.selectedArea,reachable=new Set([...moving,origin]);
    const svg=$('#roads');const roadLines=D.roads.map(([a,b])=>{const x=areaBy(a),y=areaBy(b),range=state.mode==='move'&&reachable.has(a)&&reachable.has(b);return `<line class="road ${range?'range-road':''}" x1="${x.x*9}" y1="${x.y*6.2}" x2="${y.x*9}" y2="${y.y*6.2}"/>`}).join('');let arrow='';if(state.lastMove){const from=areaBy(state.lastMove.from),to=areaBy(state.lastMove.to);if(from&&to){const x1=from.x*9,y1=from.y*6.2,dx=to.x*9-x1,dy=to.y*6.2-y1;arrow=`<line class="move-arrow ${(state.mode==='moveAnimating'||state.mode==='enemyStep')?'active ':''}${state.lastMove.side==='enemy'?'enemy-arrow':'player-arrow'}" x1="${x1+dx*.13}" y1="${y1+dy*.13}" x2="${x1+dx*.83}" y2="${y1+dy*.83}" marker-end="url(#arrow-${state.lastMove.side==='enemy'?'enemy':'player'})"/>`}}svg.innerHTML=`<defs><marker id="arrow-player" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ffd21a"/></marker><marker id="arrow-enemy" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#e24b43"/></marker></defs>${roadLines}${arrow}`;
    $('#territoryShapes').onclick=e=>{const hit=e.target.closest?.('.territory-hit');if(hit)selectArea(hit.dataset.area)};
    const areaNodes=$('#areaNodes');areaNodes.classList.toggle('stats-visible',state.options.showUnitStats);areaNodes.innerHTML=D.areas.map(a=>{const region=state.areas[a.id],sel=state.selectedArea===a.id,cardTargetArea=region.forces.some(f=>cardLeaders.has(f.leader)||(homeAttacks&&/一向一揆|本願寺/.test(f.army)));const groups=[];for(const f of region.forces){const sa=shownArmy(f,a.id);let g=groups.find(x=>x.army===sa&&x.side===f.side);if(!g){g={army:sa,side:f.side,count:0,leaders:[],power:f.power};groups.push(g)}g.count+=Number(f.count)||0;if(f.leader){if(f.leader===state.selectedLeader){g.leaders.unshift(f.leader);g.power=f.power}else{g.leaders.push(f.leader);if(g.leaders.length===1)g.power=f.power}}} // 同じ国の同じ軍は丸1つにまとめ、武将の名前を下に並べる（2026-11-09）
    let forces=groups.map((g,index)=>{const f={...g,leader:g.leaders[0]||''};const img=f.leader&&D.unitImages?.[f.leader],faction=factionClass(f.army),cardTarget=g.leaders.some(l=>cardLeaders.has(l))||(homeAttacks&&/一向一揆|本願寺/.test(f.army)),name=g.leaders.length?shortName(g.leaders[0])+(g.leaders.length>1?` 他${g.leaders.length-1}`:''):f.army;return `<span class="force-stack" style="--force-index:${index}"><span tabindex="0" class="counter ${f.leader?'leader-counter':'troop-counter'} ${f.side} ${faction} ${cardTarget?'card-target':''}" style="--tone:${factionColor(f.army)};--pile-width:26px"><b class="count-badge">${Number(f.count)||0}</b>${img?`<img class="unit-image" src="${esc(img)}" alt="" onerror="this.hidden=true">`:''}</span><span class="force-label"><span class="force-name">${esc(g.leaders.length?name:shortName(name))}</span><span class="force-stats">${f.leader?`能力 ${Number(f.power)||0} · `:''}×${Number(f.count)||0}</span></span></span>`}).join('');
    // 3勢力以上は四角1つにまとめ、数字は合計。中身はエリアをクリックして見る（2026-11-09）
    // 敵と味方がいるエリアは、斜線で分けた四角に、それぞれの合計を色分けで書く（2026-11-09）
    const sumSide=s=>groups.filter(g=>g.side===s).reduce((n,g)=>n+(Number(g.count)||0),0);
    if(groups.some(g=>g.side==='player')&&groups.some(g=>g.side==='enemy')){const cardTarget=groups.some(g=>g.leaders.some(l=>cardLeaders.has(l))||(homeAttacks&&/一向一揆|本願寺/.test(g.army)));forces=`<span class="force-stack"><span tabindex="0" class="counter split-counter ${cardTarget?'card-target':''}" title="クリックで中身を表示"><b class="split-num player">${sumSide('player')}</b><b class="split-num enemy">${sumSide('enemy')}</b></span><span class="force-label"><span class="force-name">${groups.length}勢力</span></span></span>`}
    else if(groups.length>=3){const total=groups.reduce((s,g)=>s+(Number(g.count)||0),0),cardTarget=groups.some(g=>g.leaders.some(l=>cardLeaders.has(l))||(homeAttacks&&/一向一揆|本願寺/.test(g.army)));forces=`<span class="force-stack"><span tabindex="0" class="counter mixed-counter ${cardTarget?'card-target':''}" title="クリックで中身を表示"><b class="count-badge">${total}</b></span><span class="force-label"><span class="force-name">${groups.length}勢力</span></span></span>`}
    const moveClass=moving.has(a.id)?'move-available':'',moveSource=state.lastMove?.from===a.id?'move-source':'',moveTarget=state.lastMove?.to===a.id?'move-destination':'',moveChoice=state.moveDestination===a.id?'move-destination-choice':'';return `<button class="area-node control-${region.control||'neutral'} ${a.base?'is-base':''} ${sel?'selected':''} ${cardTargetArea?'card-target-area':''} ${moveClass} ${moveSource} ${moveTarget} ${moveChoice}" style="left:${a.x}%;top:${a.y}%" data-area="${a.id}" aria-label="${a.name}、${region.control==='player'?'信長側':region.control==='enemy'?'反信長':'中立'}${moving.has(a.id)?'、行軍可能':''}、${region.forces.length}部隊"><span class="area-name">${a.name}</span><span class="forces">${forces||'<span class="empty-force">空きエリア</span>'}</span></button>`}).join('');
    document.querySelectorAll('.area-node').forEach(el=>el.addEventListener('click',()=>selectArea(el.dataset.area)));
  }
  function centerMapOnArea(id){const viewport=$('.map-viewport'),node=document.querySelector(`.area-node[data-area="${id}"]`);if(!viewport||!node||$('#mapPanel').hidden)return;const vr=viewport.getBoundingClientRect(),nr=node.getBoundingClientRect();viewport.scrollTo({left:viewport.scrollLeft+nr.left-vr.left-(viewport.clientWidth-nr.width)/2,top:viewport.scrollTop+nr.top-vr.top-(viewport.clientHeight-nr.height)/2,behavior:'smooth'})}
  function positionActionPanel(){
    const panel=$('#mapActionStrip'),board=$('#board'),viewport=$('.map-viewport');
    if(!panel||panel.hidden||!board||!viewport)return;
    const sceneKey=`${state.mode}|${state.selectedArea}|${state.moveDestination}`;
    if(panel.dataset.dragged==='1'&&panel.dataset.scene===sceneKey)return;
    panel.dataset.dragged='';panel.dataset.scene=sceneKey;panel.style.width='';panel.style.transform='none';
    // 行動のボタンは、地図の因幡の上の海に固定する（地図といっしょに動く）2026-11-09
    panel.style.left=`${board.clientWidth*0.02}px`;panel.style.top=`${Math.max(4,board.clientHeight*0.308-panel.offsetHeight)}px`; // ボタンの下の端を、因幡・但馬の海岸のすぐ上にそろえるpanel.style.maxWidth=`${board.clientWidth*0.44}px`;
  }
  (function enablePanelDrag(){
    const panel=document.getElementById('mapActionStrip');if(!panel||panel.dataset.dragReady)return;panel.dataset.dragReady='1';
    let sx=0,sy=0,ox=0,oy=0,on=false;
    panel.addEventListener('pointerdown',e=>{return; // 海に埋め込んだので動かさない
      if(e.target.closest('button,input,select,a,label'))return;on=true;sx=e.clientX;sy=e.clientY;ox=parseFloat(panel.style.left)||0;oy=parseFloat(panel.style.top)||0;panel.setPointerCapture(e.pointerId);panel.classList.add('dragging');e.preventDefault()});
    panel.addEventListener('pointermove',e=>{if(!on)return;const z=parseFloat(getComputedStyle(document.getElementById('board')).getPropertyValue('--map-zoom'))||1;panel.style.left=`${ox+(e.clientX-sx)}px`;panel.style.top=`${oy+(e.clientY-sy)}px`;panel.dataset.dragged='1'});
    const end=e=>{if(!on)return;on=false;panel.classList.remove('dragging');try{panel.releasePointerCapture(e.pointerId)}catch(_){}};
    panel.addEventListener('pointerup',end);panel.addEventListener('pointercancel',end);
  })();
  function voronoiCell(area){let poly=[[0,0],[900,0],[900,620],[0,620]],px=area.x*9,py=area.y*6.2;for(const other of D.areas){if(other.id===area.id)continue;const qx=other.x*9,qy=other.y*6.2,a=2*(qx-px),b=2*(qy-py),c=qx*qx+qy*qy-(Number(other.weight)||0)-px*px-py*py+(Number(area.weight)||0),next=[];for(let i=0;i<poly.length;i++){const s=poly[i],e=poly[(i+1)%poly.length],fs=a*s[0]+b*s[1]-c,fe=a*e[0]+b*e[1]-c,insideS=fs<=0,insideE=fe<=0;if(insideS&&insideE)next.push(e);else if(insideS&&!insideE){const t=fs/(fs-fe);next.push([s[0]+t*(e[0]-s[0]),s[1]+t*(e[1]-s[1])])}else if(!insideS&&insideE){const t=fs/(fs-fe);next.push([s[0]+t*(e[0]-s[0]),s[1]+t*(e[1]-s[1])],e)}}poly=next;if(!poly.length)break}return poly.length?`M${poly.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`:''}
  function renderFactions(){const items=[['織田信長','織田軍'],['徳川家康','徳川軍'],['松永久秀','松永軍']];$('#factionList').innerHTML=items.map(([name,army])=>{const g=getLeader(name);return `<div class="faction"><small>${name}</small><b>${g?areaBy(g.area).name+' · '+g.force.count+'駒':'盤上に不在'}</b></div>`}).join('')}
  function renderTracks(){
    const loyal=[['徳川家康','tokugawa'],['松永久秀','matsunaga']];
    const joining=[['上杉謙信','uesugi'],['毛利輝元','mori'],['宇喜多直家','ukita']];
    const steps=(track,value,labels,kind)=>`<div class="digital-steps">${labels.map((label,i)=>`<button type="button" class="track-step ${i===value?'current':''} ${i<value?'passed':''} ${state.trackFlash?.key===track&&i===state.trackFlash.from?'flash-from':''} ${state.trackFlash?.key===track&&i===state.trackFlash.to?'flash-to':''}" data-track="${track}" data-kind="${kind}" data-step="${i}" aria-label="${track}トラックを${label}に設定">${label}</button>`).join('')}</div>`;
    const loyaltyRows=loyal.map(([name,id])=>`<div class="track-row"><span class="track-name">${name}</span>${steps(id,state.tracks[id]||0,['START','信長側','中立','中立','反逆'],'loyalty')}</div>`).join('');
    const joiningRows=joining.map(([name,id])=>`<div class="track-row"><span class="track-name">${name}</span>${steps(id,state.tracks[id]||0,['START','1','2','3','4','5','6','参戦'],'joining')}</div>`).join('');
    const odaLabels=['START','反逆6','反逆5','反逆4','反逆3','反逆2'];
    const activeThreshold=[0,6,5,4,3,2][state.tracks.oda]||0;
    const rebellionActive=activeThreshold>0&&state.strategy>=activeThreshold;
    $('#trackDashboard').innerHTML=`<div class="strategy-digital"><span>戦略値</span><strong>${state.strategy}</strong><small>拠点 ${$('#baseCount').textContent}</small></div><div class="track-groups"><section class="track-group oda-track"><h3>織田家臣 · 反逆判定${rebellionActive?'有効':'待機'}</h3><div class="track-row">${steps('oda',state.tracks.oda||0,odaLabels,'oda')}</div><p class="track-caption">反逆条件は戦略値以上の欄で有効</p></section><section class="track-group"><h3>信長側大名</h3>${loyaltyRows}</section><section class="track-group joining-group"><h3>反信長大名 · 参戦まで</h3>${joiningRows}</section></div>`;
    document.querySelectorAll('.track-step').forEach(el=>el.addEventListener('click',()=>{const key=el.dataset.track;state.tracks[key]=Number(el.dataset.step);if(el.dataset.kind==='loyalty')syncLoyaltyForce(key);resolveControl();checkEnd();render()}));
  }
  function renderPools(){
    $('#playerPool').textContent=state.playerPool;$('#enemyPool').textContent=state.enemyPool;
    document.querySelectorAll('[data-pool]').forEach(el=>el.onclick=()=>{state[el.dataset.pool]=Math.max(0,(Number(state[el.dataset.pool])||0)+Number(el.dataset.delta));render()});
  }
  function trackStepLabel(key,index){if(key==='oda')return ['START','反逆6','反逆5','反逆4','反逆3','反逆2'][index]||String(index);if(key==='tokugawa'||key==='matsunaga')return ['START','信長側','中立','中立','反逆'][index]||String(index);return ['START','1','2','3','4','5','6','参戦'][index]||String(index)}
  function animateTrackMarker(key,name,from,to){state.trackFlash={key,from,to};const banner=$('#trackAnnouncement');$('#trackAnnounceName').textContent=name;$('#trackAnnounceFrom').textContent=trackStepLabel(key,from);$('#trackAnnounceTo').textContent=trackStepLabel(key,to);banner.hidden=false;banner.classList.remove('track-pop');void banner.offsetWidth;banner.classList.add('track-pop');renderTracks();clearTimeout(banner._timer);banner._timer=setTimeout(()=>{banner.hidden=true;banner.classList.remove('track-pop');state.trackFlash=null;renderTracks();save()},1800)}
  function syncLoyaltyForce(track){const army=track==='tokugawa'?'徳川軍':'松永軍',stage=state.tracks[track]||0;const side=stage>=4?'enemy':stage>=2?'neutral':'player';for(const region of Object.values(state.areas))for(const force of region.forces)if(force.army===army)force.side=side;resolveControl()}
  function resolveControl(){const acting=state.lastActingSide||null;for(const region of Object.values(state.areas)){region.forces=region.forces.filter(alive);const has=s=>region.forces.some(f=>f.side===s);const c=region.control||'neutral';
    // 支配している勢力の駒が残っていれば、支配は変わらない
    if(!has(c)){const p=has('player'),e=has('enemy'),n=has('neutral');let next=c;if(p&&!e)next='player';else if(e&&!p)next='enemy';else if(p&&e)next=acting||c;else if(n)next='neutral';region.control=next}
    if(region.control==='enemy'){if(!region.forces.some(f=>f.side==='enemy'&&f.army===region.ownerArmy))region.ownerArmy=region.forces.find(f=>f.side==='enemy')?.army||''}else if(region.control==='player')region.ownerArmy=region.forces.find(f=>f.side==='player')?.army||region.ownerArmy||'織田軍';else region.ownerArmy=region.forces.find(f=>f.side==='neutral')?.army||''}}
  function regionFaction(region){if(region.control==='player'){const owner=region.ownerArmy||region.forces.find(f=>f.side==='player')?.army||'織田軍';return factionClass(owner)}if(region.control==='enemy'){const owner=region.ownerArmy||region.forces.find(f=>f.side==='enemy')?.army;return owner?factionClass(owner):'enemy'}return 'neutral'}
  function factionClass(army){return /反逆織田/.test(army)?'rebel':/織田/.test(army)?'oda':/徳川/.test(army)?'tokugawa':/松永/.test(army)?'matsunaga':/武田/.test(army)?'takeda':/浅井/.test(army)?'asai':/朝倉/.test(army)?'asakura':/長島/.test(army)?'nagashima':/石山/.test(army)?'ishiyama':/加賀/.test(army)?'kaga-ikko':/雑賀/.test(army)?'saiga':/一向|本願/.test(army)?'ikko':/三好/.test(army)?'miyoshi':/小早川/.test(army)?'kobayakawa':/吉川/.test(army)?'kikkawa':/毛利/.test(army)?'mori':/宇喜多/.test(army)?'ukita':/上杉/.test(army)?'uesugi':'neutral'}
  // 駒は大名・軍勢ごとに識別色を変え、中立軍だけ灰色にする。
  function factionColor(army){return ({oda:'#b4432e',tokugawa:'#b9772a',matsunaga:'#6b4a7a',takeda:'#2e5070',asai:'#2f6a66',asakura:'#4a6b3f',nagashima:'#5d5486',ishiyama:'#6b4a32','kaga-ikko':'#93762c',saiga:'#86383a',ikko:'#5f5a55',miyoshi:'#a8842e',mori:'#3a7470',kobayakawa:'#34497e',kikkawa:'#83475f',ukita:'#9c4166',uesugi:'#2c3d6c',rebel:'#4b5a5e',neutral:'#6f7672'})[factionClass(army)]||'#64748b'}
  function pileWidth(count){return Math.max(62,28+Math.max(0,Number(count)||0)*4.2)}
  function unitPileMarkup(count){return `<span class="unit-pile" aria-hidden="true">${Array.from({length:Math.max(0,Number(count)||0)},(_,i)=>`<i class="unit-pile-piece" style="left:${i*4.2}px;bottom:${i*7.2}px;z-index:${i+1}"></i>`).join('')}</span>`}
  function renderInventory(){const u=D.units;if(!u)return;const leaders=Object.entries(u.leaders).map(([name,power])=>`<div class="inventory-row"><span class="unit-role"><i class="role-icon leader-icon">将</i>${name}</span><b>能力 ${power}</b><small>武将駒 1</small></div>`).join('');const armies=Object.entries(u.armies).map(([name,count])=>`<div class="inventory-row"><span class="unit-role"><i class="role-icon troop-icon">兵</i>${name}</span><b>${count}駒</b></div>`).join('');$('#unitCatalog').innerHTML=`<h3>武将駒</h3>${leaders}<h3>軍勢駒</h3>${armies}<p class="inventory-note">下書きユニット表から転記。正式版が届いたら差し替えます。</p>`}
  function renderCommands(){
    const selectedArea=state.selectedArea,region=selectedArea?state.areas[selectedArea]:null;
    const found=state.selectedLeader&&getLeader(state.selectedLeader),force=found?.force;
    $('#commandButtons').innerHTML='';$('#commandExtra').innerHTML='';$('#mapActionStrip').hidden=!region||(!state.mode&&state.turnComplete);
    if(!region){$('#commandTitle').textContent='未選択';$('#commandHint').textContent='地図のエリアを選ぶと部隊と行動が表示されます。';if($('#selectedStack'))$('#selectedStack').innerHTML='';return}
    if($('#selectedStack'))$('#selectedStack').innerHTML=region.forces.length?region.forces.map(f=>`<span class="selected-force ${f.side}"><b>${esc(f.leader||f.army)}</b>${f.leader?`<small>能力 ${Number(f.power)||0}</small>`:''}<small>駒 ${Number(f.count)||0}</small></span>`).join(''):'<span class="selected-force empty">部隊なし</span>';
    $('#commandTitle').textContent=found?state.selectedLeader:'部隊';
    $('#commandHint').textContent=`${state.repeatOf&&state.mode==='cardAction'?`追討令：「${state.repeatOf}」をもう一度 · `:''}${areaBy(selectedArea).name} · ${found?`${force.count}駒 · 戦闘力 ${force.power}`:'武将がいません'}`;
    if(state.mode==='cardReveal'){ $('#commandTitle').textContent='カードを確認';$('#commandHint').textContent='地図の上のカード画面でプレイかパスを選んでください。';return }
    if(state.mode==='enemyStep'||state.mode==='enemyBattleWait'){$('#commandHint').textContent='反信長側の行動を確認中です。';$('#commandButtons').innerHTML='';return}
    if(state.mode==='moveAnimating'){$('#commandHint').textContent='矢印の方向へ行軍中です。';$('#commandButtons').innerHTML='<button disabled>移動中…</button>';return}
    if(state.mode==='move'){
      const dest=state.moveDestination&&areaBy(state.moveDestination);
      $('#commandHint').textContent=dest?`${areaBy(found?.area||selectedArea).name} から ${dest.name} へ移動します。確定または取り消しを選んでください。`:'移動先を地図から選んでください。緑の表示と街路が移動可能範囲です。';
      $('#commandButtons').innerHTML=`<button id="confirmMove" ${!dest?'disabled':''}>移動を確定</button><button id="cancelAction">取り消し</button>`;
      const reg0=state.areas[found?.area||selectedArea],max=reg0.forces.filter(f=>f.side==='player'&&f.army===force?.army).reduce((s,f)=>s+f.count,0),value=Math.max(0,Math.min(max,state.moveCount??Math.max(0,max-1)));
      const comp=reg0.forces.filter(f=>f.leader&&f.leader!==state.selectedLeader&&f.side==='player'&&f.army==='織田軍'&&force?.army==='織田軍'&&f.leader!=='織田信長');
      $('#commandExtra').innerHTML=`<label>引き連れる軍勢<input id="moveCount" type="number" min="0" max="${max}" value="${value}"></label>${comp.map(f=>`<label class="disband-leader"><input type="checkbox" data-companion="${esc(f.leader)}" ${(state.moveCompanions||[]).includes(f.leader)?'checked':''}> ${esc(f.leader)}も同行</label>`).join('')}`;
      $('#moveCount').addEventListener('input',e=>{state.moveCount=Math.max(0,Math.min(max,Number(e.target.value)||0))});
      document.querySelectorAll('[data-companion]').forEach(c=>c.addEventListener('change',()=>{state.moveCompanions=[...document.querySelectorAll('[data-companion]:checked')].map(x=>x.dataset.companion)}));
      $('#confirmMove').addEventListener('click',confirmMove);$('#cancelAction').addEventListener('click',cancelCurrentAction);return;
    }
    if(state.mode==='disband'){
      const id=state.disbandArea;
      const targets=id?state.areas[id].forces.filter(f=>f.side==='player'&&alive(f)):[];
      const target=targets[state.disbandTarget??0];
      const troops=target?.count||0;
      $('#commandHint').textContent=id
        ? `${areaBy(id).name}で補充プールに戻す駒を選びます。地図でエリアを変更できます。`
        : '解散する軍勢がいるエリアを地図で選んでください。';
      $('#commandButtons').innerHTML=`<button id="confirmDisband" ${target?'':'disabled'}>解散を確定</button><button id="cancelAction">取り消し</button>`;
      const choices=targets.length>1
        ? `<label>部隊<select id="disbandTarget">${targets.map((f,i)=>`<option value="${i}" ${f===target?'selected':''}>${esc(f.leader||f.army)}（${f.count}駒）</option>`).join('')}</select></label>`
        : '';
      $('#commandExtra').innerHTML=target?`${choices}<label>戻す軍勢の駒数<input id="disbandCount" type="number" min="0" max="${troops}" value="${Math.min(1,troops)}"></label>${target.leader?`<label class="disband-leader"><input id="disbandLeader" type="checkbox"> 武将（${esc(target.leader)}）も戻す</label>`:''}`:'';
      $('#disbandTarget')?.addEventListener('change',e=>{state.disbandTarget=Number(e.target.value);render()});
      $('#confirmDisband').addEventListener('click',()=>disband(id,target,Number($('#disbandCount').value),Boolean($('#disbandLeader')?.checked)));
      $('#cancelAction').addEventListener('click',cancelCurrentAction);
      return;
    }
    if(state.mode==='attack'){
      const enemies=region.forces.some(x=>x.side!=='player');
      $('#commandHint').textContent=enemies?`${state.selectedLeader}が${areaBy(selectedArea).name}で戦闘します。`:'このエリアに攻撃対象はいません。';
      $('#commandButtons').innerHTML=`<button id="confirmAttack" ${!force||!enemies?'disabled':''}>戦闘開始</button><button id="cancelAction">取り消し</button>`;
      $('#confirmAttack').addEventListener('click',()=>attack(selectedArea,state.selectedLeader));$('#cancelAction').addEventListener('click',cancelCurrentAction);return;
    }
    if(state.mode==='reinforce'){
      const cap=force?playerReinforceLimit(force):0,max=Math.max(0,Math.min(state.playerPool,cap)),amount=Math.max(1,Math.min(max,Number(state.reinforceCount)||max));
      const why=state.activeCard?.reinforce==='actingOda'?(force?.side==='enemy'?'反逆織田軍は2駒':`織田軍は戦略値の${state.strategy}駒`):`カードの決まりで${cap}駒`;$('#commandHint').textContent=`補充プールから${state.selectedLeader}の部隊へ駒を加えます。上限 ${max} 駒（${why}、補充プールの残り${state.playerPool}駒）。`;
      $('#commandButtons').innerHTML=`<button id="confirmReinforce" ${!max?'disabled':''}>補充を確定</button><button id="cancelAction">${state.reinforceAfter?'補充しない':'取り消し'}</button>`;
      $('#commandExtra').innerHTML=`<label>補充する駒数<input id="reinforceCount" type="number" min="1" max="${max}" value="${amount}" ${!max?'disabled':''}></label><span id="reinforceLeft" class="pool-left">補充後のプール残り ${state.playerPool-amount}駒</span>`;$('#reinforceCount').addEventListener('input',e=>{const v=Math.max(0,Math.min(max,Number(e.target.value)||0));$('#reinforceLeft').textContent=`補充後のプール残り ${state.playerPool-v}駒`});
      bindReinforceChoices(max);$('#cancelAction').addEventListener('click',()=>{if(state.reinforceAfter){const f=getLeader(state.selectedLeader);note(`${state.selectedLeader}は補充しない。`);finishAction(f?.area||state.selectedArea,state.selectedLeader,true)}else cancelCurrentAction()});return;
    }
    if(state.mode==='cardAction'&&state.cardStage==='reinforce'&&force&&force.side==='player'){
      // 先に補充（2026-11-09）。補充したら、同じ武将で行軍・攻撃などを選ぶ
      const cap=playerReinforceLimit(force),max=Math.max(0,Math.min(state.playerPool,cap));
      $('#commandHint').textContent=`まず補充：${state.selectedLeader}の部隊へ駒を加えます（上限 ${max} 駒）。そのあと行動を選びます。`;
      $('#commandButtons').innerHTML=`<button id="confirmReinforce" ${!max?'disabled':''}>補充を確定</button><button id="skipReinforce">補充しない</button>`;
      $('#commandExtra').innerHTML=`<label>補充する駒数<input id="reinforceCount" type="number" min="1" max="${max}" value="${max}" ${!max?'disabled':''}></label>`;
      bindReinforceChoices(max);
      $('#skipReinforce').addEventListener('click',()=>{note(`${state.selectedLeader}は補充しない。`);state.cardStage='act';state.lockedLeader=state.selectedLeader;render()});
      $('#skipCardAction').addEventListener('click',()=>{state.mode='';state.lastActor=state.selectedLeader;state.lastActorCardId=state.lastCard?.id;state.activeCard=null;state.turnComplete=true;note(`${state.selectedLeader}は今回は行動をパス。`);render();state.autoNext=true;tryAutoDraw()});return;
    }
    const playerForce=force&&force.side==='player',enemy=region.forces.some(x=>x.side!=='player');
    const commands=[['移動','move',!playerForce],['戦闘','attack',!playerForce||!enemy],['補充','reinforce',!playerForce||state.playerPool<1||playerReinforceLimit(force)<=0],['解散','disband',!state.activeCard||!Object.values(state.areas).some(a=>a.forces.some(f=>f.side==='player'&&alive(f)))],['確定','end',!playerForce]];
    $('#commandHint').textContent='';$('#commandButtons').innerHTML=commands.map(([label,mode,disabled])=>`<button data-mode="${mode}" ${disabled?'disabled':''}>${label}</button>`).join('')+(state.mode==='cardAction'?(state.activeCard?.leaders||[]).filter(l=>state.leaderPool.player?.includes(l)&&!(state.rebels||[]).includes(l)&&redeployTargets(l).length).map(l=>`<button class="redeploy-btn" data-redeploy="${esc(l)}">${esc(l)}を戻す</button>`).join('')+'':'');
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{const mode=b.dataset.mode;if(mode==='end')finishAction(selectedArea,state.selectedLeader);else if(mode==='attack')attack(selectedArea,state.selectedLeader);else beginMode(mode)}));
    document.querySelectorAll('[data-redeploy]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.redeploy;state.mode='redeploy';state.redeployLeader=name;state.actionHighlights=redeployTargets(name);setBoardView('map');toast(`${name}を戻す本領を選んでください`);render()}));
    const skip=$('#skipCardAction');if(skip)skip.addEventListener('click',()=>{state.mode='';state.lastActor=state.selectedLeader;state.lastActorCardId=state.lastCard?.id;state.activeCard=null;state.turnComplete=true;note(`${state.selectedLeader}は今回は行動をパス。`);render();state.autoNext=true;tryAutoDraw()});
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.mode==='move'&&!state.moveDestination)cancelCurrentAction()});
  function cancelCurrentAction(){state.mode=state.activeCard?'cardAction':'';state.actionHighlights=[];state.moveDestination=null;state.moveCount=null;state.reinforceCount=null;render()}
  function renderEvent(){const back=D.cardBackImage||'assets/cards/back.jpg',shown=[...state.discard,...(state.pendingCard?[state.pendingCard]:[])],latest=state.lastCard;const thumbs=shown.map((c,i)=>{const src=D.cardImages?.[c.name]||c.image;return src?`<span class="drawn-card-thumb" title="${esc(c.name)}"><img class="card-art" src="${esc(src)}" alt="${esc(c.name)}"><small>${String(i+1).padStart(2,'0')}</small></span>`:`<span class="drawn-card-thumb drawn-card-fallback" title="${esc(c.name)}">${esc(c.name)}</span>`}).join('');$('#lastCard').className='card-preview card-history';$('#lastCard').innerHTML=`<div class="draw-pile"><button type="button" id="drawFromDeck" class="deck-back-button" ${state.over||state.mode||(state.lastCard&&!state.turnComplete)?'disabled':''} aria-label="山札から状況カードを引く"><img class="card-art card-back-art" src="${esc(back)}" alt="山札の裏面"><span>山札から引く</span></button><small>残り ${state.deck.length}枚</small></div><section class="drawn-history"><span class="eyebrow">引いたカード · 左から順</span><div class="drawn-card-strip">${thumbs||'<span class="empty-history">引いたカードはここに並びます</span>'}</div>${latest?`<div class="history-detail"><b>${esc(latest.name)}</b><p>${esc(cardText(latest))}</p></div>`:''}</section>`;$('#drawFromDeck').addEventListener('click',draw)}
  function shortName(s){const names={'織田信長':'信長','小早川隆景':'小早川','三好三人衆':'三好三人','石山一向一揆':'石山一向','長島一向一揆':'長島一向','加賀一向一揆':'加賀一向','本願寺（雑賀軍）':'本願寺','宇喜多直家':'宇喜多直'};return names[s]||[...s].slice(0,4).join('')}
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function showAreaInfo(id){let box=document.getElementById('areaInfo');if(!box){box=document.createElement('div');box.id='areaInfo';box.className='area-info';document.getElementById('board').append(box);document.addEventListener('pointerdown',e=>{if(!e.target.closest('#areaInfo,.area-node,.territory-hit'))box.hidden=true},true)}
    // カードで行動できる武将は、この窓から選ぶ（2026-11-09）
    const pickable=f=>state.mode==='cardAction'&&state.activeCard&&!state.lockedLeader&&f.side==='player'&&f.leader&&state.activeCard.leaders.includes(f.leader);
    const a=areaBy(id),reg=state.areas[id],sideJ={player:'信長側',enemy:'反信長',neutral:'中立'};
    const rows=reg.forces.filter(alive).map(f=>`<tr><td><i style="background:${factionColor(shownArmy(f,id))}"></i>${esc(f.leader||'（武将なし）')}</td><td>${esc(shownArmy(f,id))}</td><td>${f.leader?`能力${Number(D.units?.leaders?.[f.leader]??f.power)||0}`:''}</td><td>${Number(f.count)||0}駒${f.leader?'＋武将':''}</td><td>${sideJ[f.side]||f.side}</td><td>${pickable(f)?`<button type="button" class="area-pick${state.selectedLeader===f.leader?' on':''}" data-pick="${esc(f.leader)}">${state.selectedLeader===f.leader?'選択中':'選ぶ'}</button>`:''}</td></tr>`).join('');
    box.innerHTML=`<b>${esc(a.name)}</b> <small>支配：${sideJ[reg.control]||'中立'}${a.base?'・拠点':''}</small><table>${rows||'<tr><td>部隊なし</td></tr>'}</table>`;
    const b=document.getElementById('board');box.hidden=false;const x=b.clientWidth*a.x/100,y=b.clientHeight*a.y/100;box.style.left=`${Math.min(b.clientWidth-box.offsetWidth-6,Math.max(6,x+20))}px`;box.style.top=`${Math.min(b.clientHeight-box.offsetHeight-6,Math.max(6,y-box.offsetHeight/2))}px`;
    box.querySelectorAll('[data-pick]').forEach(btn=>btn.addEventListener('click',()=>{state.selectedArea=id;state.selectedLeader=btn.dataset.pick;$('#selectionHint').textContent=`${btn.dataset.pick}を選択中`;render();showAreaInfo(id)}))}
  function selectArea(id){
    if(state.mode==='moveAnimating')return;
    if(!['move','redeploy','disband'].includes(state.mode))setTimeout(()=>showAreaInfo(id),0);
    if(state.mode==='redeploy'){if((state.actionHighlights||[]).includes(id))redeployLeader(state.redeployLeader,id);else toast('緑色で示された本領を選んでください');return}
    if(state.mode==='disband'){
      if (!state.actionHighlights.includes(id)) {
        toast('信長側の駒がいるエリアを選んでください。');
        return;
      }
      state.disbandArea=id;
      state.disbandTarget=0;
      render();
      return;
    }
    if(state.mode==='move'){
      if (!(state.actionHighlights||[]).includes(id)) {
        toast('緑色で示されたエリアを選んでください');
        return;
      }
      const countInput=$('#moveCount');
      if (countInput) state.moveCount=Math.max(0,Math.min(Number(countInput.max),Number(countInput.value)||0));
      state.moveCompanions=[...document.querySelectorAll('#commandExtra [data-companion]:checked')].map(input=>input.dataset.companion);
      state.moveDestination=id;
      state.selectedArea=state.moveSource||state.selectedArea;
      render();
      return;
    }
    const reg=state.areas[id];
    if(state.mode==='cardAction'&&state.activeCard){if(state.lockedLeader){toast(`${state.lockedLeader}で行動してください`);return}const actors=reg.forces.filter(f=>state.activeCard.leaders.includes(f.leader)&&f.side==='player').sort((x,y)=>state.activeCard.leaders.indexOf(x.leader)-state.activeCard.leaders.indexOf(y.leader));const cardActor=actors.find(f=>f.leader===state.selectedLeader)||actors[0];if(cardActor){state.selectedArea=id;state.selectedLeader=cardActor.leader;$('#selectionHint').textContent=`${cardActor.leader}を選択中`;render();return}toast('このカードで行動できる武将を選んでください');return}
    state.selectedArea=id;state.mode='';state.actionHighlights=[];state.moveDestination=null;
    const own=reg.forces.find(f=>f.side==='player'&&f.leader);state.selectedLeader=own?.leader||null;
    $('#selectionHint').textContent=`${areaBy(id).name}を選択中 · ${reg.forces.length?reg.forces.map(f=>(f.leader||f.army)+' '+f.count+'駒').join(' / '):'部隊なし'}`;render()
  }
  function friendlyCommanders(id){
    return (state.areas[id]?.forces||[]).filter(f=>f.side==='player'&&f.leader);
  }
  function equalShares(total,size){
    return Array.from({length:size},(_,i)=>Math.floor(total/size)+(i<total%size?1:0));
  }
  function excludedFromAllocation(leader){
    return (state.formationExcluded||[]).includes(leader);
  }
  function formationAvailable(){
    return state.setupComplete&&!state.over&&!battleInProgress&&!pendingResolution&&
      (!state.mode||state.mode==='cardAction')&&Object.values(state.areas).some(a=>a.forces.some(f=>f.side==='player'&&f.leader));
  }
  function openFormation(){
    if(!formationAvailable())return;
    const areas=D.areas.filter(a=>friendlyCommanders(a.id).length);
    const select=$('#formationArea');
    select.innerHTML=areas.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    const preferred=areas.find(a=>a.id===state.selectedArea&&friendlyCommanders(a.id).length>1)
      ||areas.find(a=>friendlyCommanders(a.id).length>1)||areas.find(a=>a.id===state.selectedArea)||areas[0];
    select.value=preferred.id;
    const exceptions=new Set(state.formationExcluded||[]);
    const rows=$('#formationRows'),status=$('#formationStatus'),equal=$('#formationEqual');
    let forces=[],counts=[],started=[],total=0;
    const validate=()=>{
      const values=counts.map(input=>input.valueAsNumber);
      const assigned=values.reduce((sum,n)=>sum+(Number.isFinite(n)?n:0),0);
      const valid=values.every(n=>Number.isInteger(n)&&n>=0&&n<=total)&&assigned===total;
      status.textContent=`合計 ${assigned} / ${total} 駒${assigned===total?'':assigned<total?`（あと ${total-assigned} 駒）`:`（${assigned-total} 駒超過）`}`;
      $('#formationConfirm').disabled=!valid;
      equal.disabled=forces.filter(f=>!exceptions.has(f.leader)).length<2;
      return valid;
    };
    const update=()=>{
      forces=friendlyCommanders(select.value);
      started=forces.map(f=>f.count);
      total=started.reduce((a,b)=>a+b,0);
      rows.innerHTML=forces.map((f,i)=>`<div class="formation-row"><label for="formationCount${i}">${esc(f.leader)}</label><input id="formationCount${i}" type="number" min="0" max="${total}" step="1" value="${started[i]}" required><label><input type="checkbox" aria-label="${esc(f.leader)}を自動配分から外す" ${exceptions.has(f.leader)?'checked':''}> 配分から外す</label></div>`).join('');
      counts=[...rows.querySelectorAll('input[type="number"]')];
      counts.forEach(input=>input.addEventListener('input',validate));
      rows.querySelectorAll('input[type="checkbox"]').forEach((input,i)=>input.addEventListener('change',()=>{
        if(input.checked)exceptions.add(forces[i].leader);else exceptions.delete(forces[i].leader);
        validate();
      }));
      validate();
    };
    select.onchange=update;
    equal.onclick=()=>{
      const included=forces.map((f,i)=>exceptions.has(f.leader)?-1:i).filter(i=>i>=0);
      if(included.length<2)return;
      const spare=forces.reduce((sum,f,i)=>sum+(exceptions.has(f.leader)?0:started[i]),0);
      const shares=equalShares(spare,included.length);
      forces.forEach((f,i)=>{counts[i].value=started[i]});
      included.forEach((i,j)=>{counts[i].value=shares[j]});
      validate();
    };
    $('#formationForm').onsubmit=e=>{
      e.preventDefault();
      if(!formationAvailable()||!validate())return;
      const before=forces.map(f=>f.count);
      forces.forEach((f,i)=>{f.count=counts[i].valueAsNumber});
      state.formationExcluded=[...exceptions];
      $('#formationDialog').close();
      if(forces.some((f,i)=>f.count!==before[i])){
        note(`編成：${areaBy(select.value).name} · ${forces.map(f=>f.leader+' '+f.count+'駒').join('、')}。`);
      }
      render();
    };
    update();
    $('#formationDialog').showModal();
  }
  function odaTroopsCoverDeparture(region, army) {
    return ['徳川軍','松永軍'].includes(army) &&
      region.forces.some(force=>force.side==='player' && force.army==='織田軍' && force.count>0);
  }
  function beginMode(mode){
    if (mode==='disband') {
      state.mode=mode;
      state.disbandArea=null;
      state.disbandTarget=0;
      state.actionHighlights=Object.keys(state.areas).filter(id=>state.areas[id].forces.some(f=>f.side==='player'&&alive(f)));
      setBoardView('map');
      render();
      return;
    }
    const here=getLeader(state.selectedLeader);if(!here||here.force.side!=='player'){toast('信長側の武将がいるエリアを選んでください');return}
    state.mode=mode;state.actionHighlights=[];state.moveDestination=null;state.moveSource=here.area;state.moveCompanions=[];state.moveCount=odaTroopsCoverDeparture(state.areas[here.area],here.force.army)
      ? state.areas[here.area].forces.filter(force=>force.side==='player' && force.army===here.force.army).reduce((total,force)=>total+force.count,0)
      : Math.max(1,here.force.count-1);state.reinforceCount=null;
    if(mode==='move'){state.actionHighlights=legalMoves(here.area,here.force);setBoardView('map');toast('移動先を地図で選んでください（やめるときは Esc キー）')}
    render()
  }
  function confirmMove(){const here=getLeader(state.selectedLeader),to=state.moveDestination;if(!here||!to){toast('地図で移動先を選んでください');return}
    const reg=state.areas[here.area],amount=Math.max(0,Math.trunc(Number($('#moveCount')?.value))||0),companions=[...document.querySelectorAll('[data-companion]:checked')].map(x=>x.dataset.companion);
    // 7.1(2): 離れるエリアに自勢力の駒を1つは残す。本領の軍がいれば、その軍の駒を残す
    const group=reg.forces.filter(f=>f.side==='player'&&f.army===here.force.army),troops=group.reduce((s,f)=>s+f.count,0);
    const moving=group.filter(f=>f===here.force||companions.includes(f.leader));
    if(!moving.some(f=>!excludedFromAllocation(f.leader))&&amount>moving.reduce((sum,f)=>sum+f.count,0)){
      toast('同行武将が全員自動配分の対象外です。今の持ち分まで減らすか、「編成」で設定を変えてください。');return;
    }
    const remainAfter=reg.forces.filter(f=>f.side==='player').reduce((s,f)=>s+pieces(f),0)-amount-1-companions.length;
    const homeArmy=reg.forces.filter(f=>f.side==='player'&&armyHomes(f.army).has(here.area)).map(f=>f.army);
    const homeLeft=army=>reg.forces.filter(f=>f.side==='player'&&f.army===army).reduce((s,f)=>s+pieces(f),0)-(army===here.force.army?amount+1:0)-reg.forces.filter(f=>companions.includes(f.leader)&&f.army===army).length;
    if(amount>troops){toast('その数の軍勢はいません');return}if(remainAfter<1){toast('出発エリアに自勢力の駒を1つは残してください（7.1(2)）');return}if(homeArmy.some(army=>homeLeft(army)<1 &&
      !(army===here.force.army && odaTroopsCoverDeparture(reg,army)))){toast('本領の軍の駒を1つは残してください（7.1(2)）');return}
    clearTimeout(movementTimer);movementPlan={from:here.area,to,leader:state.selectedLeader,count:amount,side:here.force.side,companions};state.lastMove={...movementPlan};state.mode='moveAnimating';state.actionHighlights=[];state.moveDestination=null;render();
    movementTimer=setTimeout(()=>{const plan=movementPlan;movementPlan=null;movementTimer=null;if(plan)move(plan.from,plan.to,plan.leader,plan.count,plan.companions)},760)}
  function bindConfirm(fn){const el=$('#confirmAction');if(el)el.addEventListener('click',fn)}
  function playerReinforceLimit(force){const spec=state.activeCard?.reinforce;if(spec==='actingOda')return force.side==='enemy'?2:state.strategy;if(spec==='tokugawa'||spec==='matsunaga')return 1;if(Array.isArray(spec)){const entry=spec.find(([n])=>n===force.leader);return entry?.[1]||0}return state.strategy}
  function neighbors(id){return D.roads.filter(e=>e.includes(id)).map(e=>e[0]===id?e[1]:e[0])}
  function distancesFrom(start){let q=[[start,0]],out={[start]:0};while(q.length){const [u,d]=q.shift();for(const v of neighbors(u))if(out[v]===undefined){out[v]=d+1;q.push([v,d+1])}}return out}
  function legalMoves(start,f){const strat=Math.max(1,state.strategy);const others=id=>state.areas[id].forces.some(x=>x.side!=='player'&&alive(x));const ours=id=>state.areas[id].forces.some(x=>x.side==='player'&&alive(x));
    const dist={[start]:0},q=[start],out=new Set();
    while(q.length){const u=q.shift(),d=dist[u];if(d>=strat)continue;
      // 7.2(2): 他勢力がいる国、信長側の駒がない国に入ったら、そこで止まる
      if(u!==start&&(others(u)||!ours(u)))continue;
      for(const v of neighbors(u)){if(dist[v]!==undefined)continue;if(others(u)&&others(v))continue; // 7.2(1)
        dist[v]=d+1;out.add(v);q.push(v)}}
    return [...out]}
  function move(from,to,leader,num,companions=[]){const reg=state.areas[from],found=reg.forces.find(f=>f.leader===leader);if(!found||!to)return;state.lastActingSide='player';
    const group=reg.forces.filter(f=>f.side==='player'&&f.army===found.army);
    const moving=[found,...companions.map(name=>group.find(f=>f.leader===name)).filter(Boolean)];
    const included=moving.filter(f=>!excludedFromAllocation(f.leader));
    const moved=Math.max(0,Math.min(group.reduce((sum,f)=>sum+f.count,0),Math.trunc(num)));
    let remaining=moved;
    const shares=new Map();
    for(const f of moving.filter(f=>excludedFromAllocation(f.leader))){
      const count=Math.min(f.count,remaining);shares.set(f,count);f.count-=count;remaining-=count;
    }
    const balanced=equalShares(remaining,included.length);
    included.forEach((f,i)=>shares.set(f,balanced[i]));
    // Take marching commanders' troops before drawing on the area garrison.
    for(const f of [...included,...group.filter(f=>!moving.includes(f)).sort((a,b)=>Number(!!a.leader)-Number(!!b.leader))]){
      const count=Math.min(f.count,remaining);f.count-=count;remaining-=count;
    }
    const side=found.side,dest=state.areas[to];
    if(moving.length>1){
      for(const f of dest.forces)if(!f.leader&&f.side===side&&f.army===found.army)f.garrison=true;
    }
    for(const f of moving){
      dest.forces.push({leader:f.leader,army:f.army,count:shares.get(f)||0,power:f.power,side:f.side});
      f.leader='';
      if(moving.length>1&&f.count)f.garrison=true;
    }
    reg.forces=reg.forces.filter(alive);state.mode='';state.actionHighlights=[];state.moveDestination=null;state.moveSource=null;state.moveCount=null;state.lastMove={from,to,leader,side,count:moved};(state.report||=[]).push({k:'move',r:state.round,c:state.lastCard?.name||'',from,to,side,leader,count:moved});
    const message=`${leader}${companions.length?'（'+companions.join('・')+'と）':''}が${areaBy(from).name}から${areaBy(to).name}へ${moved}駒で行軍`;note(message+'。');announceAction('行軍',message);finishAction(to,leader)} // 行軍は移動で終わり。戦闘は別の行動（2026-11-09）
  function attack(id,leader){const reg=state.areas[id],att=reg.forces.find(f=>f.leader===leader);if(!att)return;if(!reg.forces.some(f=>f.side!==att.side)){toast('このエリアに攻撃対象はいません');return}
    state.lastActingSide='player';const group=reg.forces.filter(f=>f.side===att.side&&f.army===att.army);const dice=group.reduce((s,f)=>s+pieces(f),0),power=Number(D.units?.leaders?.[leader]??att.power)||2;
    let hits=0,rolls=[];for(let i=0;i<dice;i++){const n=1+Math.floor(Math.random()*6);rolls.push(n);if(n<=power)hits++}
    const targets=reg.forces.filter(f=>f.side!==att.side),attSnap=group.map(snapshotForce),defSnap=targets.map(snapshotForce);
    const done=damage=>{reg.forces=reg.forces.filter(alive);note(`${leader}が攻撃。出目 ${rolls.join('・')}、${hits}損害。`);queueBattle({area:areaBy(id).name,attackerSide:att.side,attackers:attSnap,defenders:defSnap,attackPower:power,rolls,hits,damage});finishAction(id,leader)};
    // 8.0(4): 損害を与える駒はプレーヤーが選ぶ（制限の中で）。選べる相手が1つだけなら自動
    const homeHere=a=>armyHomes(a).has(id),choices=targets.filter(f=>!homeHere(f.army));
    if(hits>0&&new Set(choices.filter(f=>f.count>0).map(f=>f.army)).size>1){note(`${leader}が攻撃。出目 ${rolls.join('・')}、${hits}損害。`);queueBattle({area:areaBy(id).name,attackerSide:att.side,attackers:attSnap,defenders:defSnap,attackPower:power,rolls,hits,damage:null,allocate:cb=>chooseCasualties(reg,targets,hits,id,damage=>{reg.forces=reg.forces.filter(alive);cb(damage);finishAction(id,leader)})})}else done(applyDamage(reg,targets,hits,'player',id))}
  function chooseCasualties(reg,targets,hits,id,done){
    const homeHere=a=>armyHomes(a).has(id);const rows=targets.map((f,i)=>({f,i,home:homeHere(f.army)}));
    const dlg=document.createElement('dialog');dlg.className='casualty-dialog resolution-dialog';
    dlg.innerHTML=`<div class="resolution-sheet"><span class="eyebrow">損害の割り振り（ルール8.0(4)）</span><h2>${hits} 損害を、どの駒に与えますか</h2><p class="muted">武将は同じ軍の軍勢が0になってから。${areaBy(id).name}が本領の軍は、ほかの駒がなくなってから。</p><div class="cas-rows">${rows.map(r=>`<label class="cas-row">${esc(r.f.leader||r.f.army)}${r.home?'（本領）':''} 軍勢${r.f.count}駒<input type="number" min="0" max="${r.f.count}" value="0" data-i="${r.i}"></label>`).join('')}</div><p class="cas-left"></p><button class="primary" type="button">決定</button></div>`;
    document.body.append(dlg);const inputs=[...dlg.querySelectorAll('input')],left=dlg.querySelector('.cas-left'),btn=dlg.querySelector('button');
    const troopsTotal=targets.reduce((s,f)=>s+f.count,0),need=Math.min(hits,troopsTotal);
    const check=()=>{const sum=inputs.reduce((s,x)=>s+(Number(x.value)||0),0);const nonHomeLeft=rows.filter(r=>!r.home).reduce((s,r)=>s+r.f.count-(Number(inputs.find(x=>+x.dataset.i===r.i).value)||0),0);const homeUsed=rows.filter(r=>r.home).reduce((s,r)=>s+(Number(inputs.find(x=>+x.dataset.i===r.i).value)||0),0);let msg=`あと ${need-sum} 駒`;let ok=sum===need;if(homeUsed>0&&nonHomeLeft>0){ok=false;msg='本領の軍より先に、ほかの駒から選んでください'}left.textContent=msg;btn.disabled=!ok};
    inputs.forEach(x=>x.addEventListener('input',check));check();dlg.showModal();
    btn.addEventListener('click',()=>{const casualties=[];let dealt=0;for(const x of inputs){const n=Math.min(Number(x.value)||0,targets[+x.dataset.i].count);if(!n)continue;const f=targets[+x.dataset.i];f.count-=n;poolFor(f,n);dealt+=n;casualties.push({name:f.leader||shownArmy(f),troops:n,leader:false,side:f.side})}
      let rest=hits-dealt;for(const f of targets){if(rest<=0)break;if(f.leader&&!targets.some(g=>g.army===f.army&&g.count>0)){const name=f.leader;sendLeaderToPool(f);casualties.push({name,troops:0,leader:true,side:f.side});dealt++;rest--}}
      dlg.close();dlg.remove();done({dealt,casualties})})}
  function bindReinforceChoices(max){
    $('#confirmReinforce').addEventListener('click',()=>reinforce(state.selectedLeader,Number($('#reinforceCount').value)));
    const group=friendlyCommanders(state.selectedArea).filter(f=>!excludedFromAllocation(f.leader));
    if(!max||!group.length||(group.length===1&&group[0].leader===state.selectedLeader))return;
    const button=document.createElement('button');
    button.type='button';button.textContent='均等';button.title='補充する駒を同じエリアの対象武将に均等に振り分けます';
    $('#confirmReinforce').after(button);
    button.addEventListener('click',()=>reinforce(state.selectedLeader,Number($('#reinforceCount').value),true));
  }
  function reinforce(leader,num,balanced=false){
    const found=getLeader(leader);
    if(!found||found.force.side!=='player'||state.playerPool<1)return;
    const limit=playerReinforceLimit(found.force);
    if(limit<1){toast('このカードでは補充できません');return}
    const amount=Math.min(Math.trunc(num),state.playerPool,limit);
    if(!Number.isInteger(amount)||amount<1){toast('補充する駒数を入力してください');return}
    const group=balanced?friendlyCommanders(found.area).filter(f=>!excludedFromAllocation(f.leader)):[found.force];
    if(!group.length){toast('自動配分の対象となる武将がいません');return}
    const shares=equalShares(amount,group.length);
    group.forEach((f,i)=>{f.count+=shares[i]});
    state.playerPool-=amount;
    const message=`${areaBy(found.area).name}で補充：${group.map((f,i)=>shares[i]?f.leader+' '+shares[i]+'駒':'').filter(Boolean).join('、')}（プール残り${state.playerPool}駒）`;
    note(message+'。');announceAction('補充',message);
    if(state.mode==='cardAction'&&state.cardStage==='reinforce'){state.cardStage='act';state.lockedLeader=leader;render();return}
    finishAction(found.area,leader);
  }
  function disband(id,force,num,withLeader){
    const reg=state.areas[id];
    if (!force||force.side!=='player'||!reg?.forces.includes(force)) return;
    const leader=force.leader;
    const n=Math.max(0,Math.min(force.count,Math.trunc(num)||0));
    if(!n&&!(leader&&withLeader)){toast('戻す駒を選んでください');return}
    if(withLeader&&leader==='織田信長'&&!confirm('織田信長を補充プールに戻すと、その時点で敗北になります。戻しますか？'))return;
    const actor=state.selectedLeader, actorArea=state.selectedArea;
    const name=leader||force.army;
    force.count-=n;
    state.playerPool+=n;
    const parts=[];
    if(n)parts.push(`軍勢${n}駒`);
    if(leader&&withLeader){
      state.leaderPool.player||=[];
      state.leaderPool.player.push(leader);
      force.leader='';
      parts.push(`武将（${leader}）`);
    }
    reg.forces=reg.forces.filter(alive);
    const message=`${areaBy(id).name}の${name}から${parts.join('と')}を解散し、補充プールへ戻した`;
    note(message+'。');
    announceAction('解散',message);
    state.disbandArea=null;
    state.disbandTarget=0;
    finishAction(actorArea,actor);
  }
  function finishAction(id,leader,skipReinforce){
    // 行軍・攻撃（または解散・何もしない）のあとに、カードの補充。補充を終えたらこのカードは終わり（2026-11-09）
    if(false&&!skipReinforce&&state.activeCard&&state.mode!=='reinforce'){const f=getLeader(leader);const cap=f?playerReinforceLimit(f.force):0;if(f&&f.force.side==='player'&&cap>0&&state.playerPool>0){state.mode='reinforce';state.reinforceAfter=true;state.selectedLeader=leader;state.selectedArea=f.area;state.actionHighlights=[];state.moveDestination=null;state.reinforceCount=null;resolveControl();checkEnd();render();if(state.over)showResolution(state.lastCard,resolutionEntries);return}}
    state.reinforceAfter=false;state.lastActingSide=state.lastActingSide||'player';state.mode='';state.actionHighlights=[];state.moveDestination=null;state.moveSource=null;state.moveCount=null;state.reinforceCount=null;state.selectedArea=id;state.selectedLeader=leader;state.lastActor=leader;state.lastActorCardId=state.lastCard?.id;state.activeCard=null;state.turnComplete=true;resolveControl();checkEnd();render();if(state.over)showResolution(state.lastCard,resolutionEntries);else{state.autoNext=true;tryAutoDraw()}}
  // 自分の行動が終わったら、少し待って次のカードを自動で引く（戦闘の画面が開いていれば、閉じてから）
  function tryAutoDraw(){if($('#formationDialog').open||!state.autoNext||battleInProgress||state.mode||!state.turnComplete||pendingResolution||state.over)return;state.autoNext=false;setTimeout(()=>{if($('#formationDialog').open){state.autoNext=true;return}if(!state.mode&&state.turnComplete&&!pendingResolution&&!battleInProgress&&!state.over)draw()},1200)}
  function showResolution(card,entries){pendingResolution={card,entries:[...entries]};$('#endTurn').disabled=true;showPendingResolution()}
  function showPendingResolution(){if(!pendingResolution||battleInProgress)return;{const dlg=$('#resolutionDialog');dlg.classList.remove('floating');dlg.style.left=dlg.style.top=dlg.style.margin='';if(dlg.open)dlg.close();const nav=$('#resolutionNav');if(nav)nav.hidden=true}const {card,entries}=pendingResolution;$('#resolutionEyebrow').textContent=state.repeatOf?`カード処理結果 · 追討令で「${state.repeatOf}」をもう一度`:'カード処理結果';$('#resolutionCardName').textContent=card?.name||'カード処理';$('#resolutionEntries').innerHTML=entries.length?entries.map(line=>`<li>${esc(line)}</li>`).join():'<li>このカードで発生した行動はありません。</li>';$('#resolutionConfirm').textContent=state.over?'結果を閉じる':'確認して次へ';if(state.over){const endLine=(state.log||[]).find(x=>/^(敗北|勝利)/.test(x))||'ゲーム終了';$('#resolutionEyebrow').textContent='ゲーム終了 · 新しいゲームで始め直せます';$('#resolutionCardName').textContent=endLine}if(!$('#resolutionDialog').open)$('#resolutionDialog').showModal()}
  function cardText(c){return c.description||'カード記載の武将・軍勢が行動します。'}
  function draw(){if(state.over||pendingResolution)return;if(state.mode){toast('カードをプレイするか、パスしてください');return}if(state.lastCard&&!state.turnComplete){toast('現在のカードの行動を終えてください');return}if(!state.deck.length){if(state.discard.length)state.deck=shuffle(state.discard.splice(0));else state.deck=shuffle(scenarioCards(state.options).filter(c=>!(state.removedCards||[]).includes(c.name)));state.round++;note('状況札を集めて山札を切り直しました。');state.reshuffleNotice='pending'}
    if(state.reshuffleNotice==='pending'){showRoundNotice();return}if(state.reshuffleNotice==='shown')state.reshuffleNotice=null;state.repeatOf=null;resolutionEntries=[];state.lastMove=null;const firstInDeck=state.discard.length===0,card=state.deck.shift();(state.report||=[]).push({k:'card',r:state.round,c:card.name,side:card.side});state.turnComplete=false;state.lastCard=card;state.pendingCard=card;state.mode='cardReveal';state.activeCard=null;state.actionHighlights=[];state.mapFocusArea=null;state.highlightedCard=card;if(firstInDeck&&card.name==='足利義昭'){note('足利義昭：山札の1枚目なので効果なし。処理結果の確認待ちです。');toast('足利義昭は効果なし。結果を確認してください')}render();openCardReveal(card)}
  const odaCommanders=new Set(['織田信長','徳川家康','松永久秀','羽柴秀吉','明智光秀','柴田勝家','丹羽長秀',takigawa,maeda]);
  function requiresHumanChoice(card){if(!card||card.side!=='player')return false;return (card.leaders||[]).some(name=>{if(!odaCommanders.has(name))return false;const found=getLeader(name);if(found)return found.force.side==='player';if(state.leaderPool?.enemy?.includes(name))return false;return true})}
  function openCardReveal(card){if(!card)return;const image=D.cardImages?.[card.name]||card.image,human=requiresHumanChoice(card);$('#cardControlLabel').textContent=human?'信長側カード · あなたが操作':'反信長側カード · 自動処理';$('#cardRevealTitle').textContent=card.name;$('#cardRevealText').textContent=cardText(card);$('#cardRevealContinue').textContent=human?'プレイ':'AIが処理中';$('#cardRevealContinue').disabled=!human;$('#cardRevealPass').hidden=true;$('#cardRevealClose').hidden=true;$('#cardRevealArt').innerHTML=image?`<img src="${esc(image)}" alt="${esc(card.name)}">`:`<div class="card-placeholder">${esc(card.name)}</div>`;if(!$('#cardRevealDialog').open)$('#cardRevealDialog').showModal();if(!human){toast('このカードの効果を自動処理します');setTimeout(()=>{if(state.pendingCard===card&&state.mode==='cardReveal')continueCard()},1200)}}
  function passCard(){const card=state.pendingCard;if(!card)return;resolutionEntries=[];$('#cardRevealDialog').close();state.pendingCard=null;state.mode='';state.activeCard=null;state.actionHighlights=[];state.discard.push(card);state.turnComplete=true;note(`「${card.name}」をパス。今回は何もせず終了。`);render();state.autoNext=true;tryAutoDraw()}
  function continueCard(){const card=state.pendingCard;if(!card)return;state.lastActingSide=null;resolutionEntries=[];enemyStepQueue=[];enemyStepCard=null;enemyCurrentStep=null;$('#cardRevealDialog').close();$('#cardRevealContinue').disabled=false;$('#cardRevealPass').hidden=true;$('#cardRevealClose').hidden=true;state.pendingCard=null;state.mode='';let focusCard=card;if(card.effect==='repeatPreviousAndReshuffle'){if(state.discard.length){const prev=state.discard[state.discard.length-1];focusCard=prev;note(`追討令：直前の「${prev.name}」をもう一度処理。`);announceAction('追討令',`直前の「${prev.name}」をもう一度行います`);state.repeatOf=prev.name;processCard(prev)}else{announceAction('追討令','山札の1枚目なので効果なし。札を切り直します')}state.discard.push(card);state.deck=shuffle(state.deck.concat(state.discard.splice(0)));state.round++;state.reshuffleNotice='pending';note('札を切り直して次の巡へ。')}else{if(processCard(card)!=='destroyed')state.discard.push(card)}const hasEnemySteps=enemyStepQueue.length>0;state.turnComplete=state.mode!=='cardAction'&&state.mode!=='redeploy'&&!hasEnemySteps;state.highlightedCard=focusCard;resolveControl();checkEnd();const focus=state.mode==='cardAction'?getLeader(state.selectedLeader):focusCard.leaders?.map(getLeader).find(Boolean);if(focus){state.mapFocusArea=focus.area;setBoardView('map')}if(hasEnemySteps){enemyStepCard=enemyStepCard||focusCard;state.mode='enemyStep';setBoardView('map')}render();if(hasEnemySteps)showEnemyPreview();else if(state.mode!=='cardAction'&&state.mode!=='redeploy'){if(state.over)showResolution(focusCard,resolutionEntries);else showEventNotice(card,resolutionEntries)}}
  // 山札を切り直したときの知らせ（浮かぶ窓）。「次の山札へ」で次のカードを引く
  function showRoundNotice(){state.reshuffleNotice='shown';const dlg=$('#resolutionDialog');$('#resolutionEyebrow').textContent='山札の切り直し';$('#resolutionCardName').textContent=`第${state.round}巡`;$('#resolutionEntries').innerHTML=`<li>使ったカードを集めて山札を切り直しました（${state.deck.length}枚）。</li>`;const nav=$('#resolutionNav');if(nav)nav.hidden=true;$('#resolutionConfirm').textContent='次の山札へ ▶';dlg.classList.add('floating');if(!dlg.open)dlg.show();placeFloatingDialog(dlg,[]);render()}
  function showEventNotice(card,entries){const dlg=$('#resolutionDialog');$('#resolutionEyebrow').textContent=state.repeatOf?`${card.name}（「${state.repeatOf}」をもう一度）`:'カードの効果';$('#resolutionCardName').textContent=card.name;$('#resolutionEntries').innerHTML=(entries.length?entries:['このカードで起きたことはありません。']).map(l=>`<li>${esc(l)}</li>`).join('');const nav=$('#resolutionNav');if(nav)nav.hidden=true;$('#resolutionConfirm').textContent='次のカードへ ▶';dlg.classList.add('floating');if(!dlg.open)dlg.show();placeFloatingDialog(dlg,[])}
  function processCard(card){
    if(card.effect==='advanceOrRepeatPrevious'){const prev=state.discard.at(-1);if(!prev){note('足利義昭：山札の1枚目なので効果なし。');return}const leader=(state.lastActorCardId===prev.id&&state.lastActor)||prev.leaders?.[0],located=leader&&getLeader(leader);if(prev.side==='enemy'||(prev.side==='event'&&prev.track&&['uesugi','mori','ukita'].includes(prev.track))||(located&&located.force.side==='enemy')){note(`足利義昭：直前の反信長カード「${prev.name}」を再処理。`);processCard(prev)}else if(prev.side==='player'&&leader){if(['徳川家康','松永久秀'].includes(leader)){const key=leader==='徳川家康'?'tokugawa':'matsunaga';const before=state.tracks[key]||0;state.tracks[key]=Math.min(4,before+1);animateTrackMarker(key,leader,before,state.tracks[key]);syncLoyaltyForce(key);note(`${leader}の参戦マーカーが進行。`)}else if(leader!=='織田信長')advanceRevolt(leader)}return}
    if(card.track&&['uesugi','mori','ukita'].includes(card.track)){const before=state.tracks[card.track]||0;if(before<7){const stage=state.tracks[card.track]=before+1;animateTrackMarker(card.track,card.name,before,stage);note(`${card.name}の参戦マーカーが進行（${stage}/7）。`);announceAction('参戦マーカー',stage>=7?`${card.name}が参戦。次にこのカードが引かれたときから行動`:`${card.name}が参戦へ一歩前進`);return}if(daimyoDestroyed(card))return 'destroyed';queueEnemyCardActions(card,null,false);return}
    if(card.side==='enemy'){if(daimyoDestroyed(card))return 'destroyed';queueEnemyCardActions(card,null,card.special==='ikkoshuHomeAttacks');return}
    if(card.side==='player'){
      if(card.track==='tokugawa'||card.track==='matsunaga'){
        const stage=state.tracks[card.track]||0;
        if(stage>=4){const name=card.track==='tokugawa'?'徳川家康':'松永久秀';queueEnemyCardActions(card,name,false);return}
        if(stage>=2){advanceLoyaltyTrack(card.track);return}
      }
      const eligible=Object.values(state.areas).flatMap(x=>x.forces).filter(f=>card.leaders.includes(f.leader)&&f.side==='player').sort((a,b)=>card.leaders.indexOf(a.leader)-card.leaders.indexOf(b.leader));
      const target=eligible[0];
      if(target){state.selectedLeader=target.leader;state.selectedArea=getLeader(target.leader).area;state.activeCard=card;setBoardView('map');note(`${target.leader}の行動を選択してください。`);state.mode='cardAction';state.cardStage='act';state.lockedLeader=null}else{const rebel=card.leaders.map(name=>getLeader(name)).find(found=>found?.force.side==='enemy');if(rebel){state.lastActingSide='enemy';queueEnemyCardActions(card,rebel.force.leader,false)}else if(card.leaders.length===1&&(state.rebels||[]).includes(card.leaders[0])){state.removedCards||=[];state.removedCards.push(card.name);note(`反逆織田軍の${card.leaders[0]}は盤上にいないため、カードを除く（13.1(5)）。`);return 'destroyed'}else if(offerRedeploy(card))return;else note(`「${card.name}」：行動できる信長側武将が盤上にいません。行動は発生しません。`)}
    }
  }
  function queueEnemyCardActions(card,onlyLeader,includeHomeAttacks){
    enemyStepCard=card;enemyStepQueue=[];enemyStepHistory=[];enemyViewIdx=-1;enemyAutoConfirm=false;
    for(const leader of (onlyLeader?[onlyLeader]:(card.leaders||[])))enemyStepQueue.push({title:`${leader}の行動`,leader,run:()=>enemyTurn(leader)});
    if(includeHomeAttacks)for(const [area,army] of [['kawachi','石山一向一揆'],['kitaise','長島一向一揆'],['kaga','加賀一向一揆']])enemyStepQueue.push({title:`${army}の戦闘`,area,run:()=>{const region=state.areas[area],force=region?.forces.find(f=>f.army===army);if(force&&region.forces.some(f=>f.side!=='enemy'&&alive(f)))attackForce(area,force,army);else note(`${areaBy(area).name}の${army}は攻撃対象がなく待機。`)}});
    for(const spec of enemyReinforcementSpecs(card,onlyLeader))enemyStepQueue.push({title:`${spec[0]}の補充`,leader:spec[0],run:()=>applyEnemyReinforcements(card,onlyLeader,spec)});
  }
  function runNextEnemyStep(){
    if(!enemyStepQueue.length){finishEnemySequence();return}
    enemyCurrentStep=enemyStepQueue.shift();const before=resolutionEntries.length;state.lastMove=null;enemyCurrentStep.run();
    const added=resolutionEntries.length-before;enemyCurrentStep.entries=added?resolutionEntries.slice(0,added):[`${enemyCurrentStep.title}：行動なし。`];
    const loc=enemyCurrentStep.leader&&getLeader(enemyCurrentStep.leader);if(loc){state.mapFocusArea=loc.area;state.selectedArea=loc.area;state.selectedLeader=enemyCurrentStep.leader}else if(enemyCurrentStep.area){state.mapFocusArea=enemyCurrentStep.area;state.selectedArea=enemyCurrentStep.area}setBoardView('map');
    enemyStepHistory.push({title:enemyCurrentStep.title,entries:enemyCurrentStep.entries,lastMove:state.lastMove?{...state.lastMove}:null,area:state.selectedArea,leader:state.selectedLeader});enemyViewIdx=enemyStepHistory.length-1;
    state.mode=battleInProgress?'enemyBattleWait':'enemyStep';render();if(!battleInProgress)showEnemyStepConfirmation();
  }
  function showEnemyPreview(){const next=enemyStepQueue[0];if(!next){finishEnemySequence();return}enemyCurrentStep={preview:true,title:next.title,entries:[]};enemyViewIdx=-1;state.lastMove=null;state.actionHighlights=[];state.moveDestination=null;const loc=next.leader&&getLeader(next.leader);if(loc){state.mapFocusArea=loc.area;state.selectedArea=loc.area}else if(next.area){state.mapFocusArea=next.area;state.selectedArea=next.area}state.mode='enemyStep';render();showEnemyStepConfirmation()}
  function showEnemyStepConfirmation(){if(!enemyCurrentStep||battleInProgress)return;
    if(enemyCurrentStep.preview&&!enemyAutoConfirm){ensureEnemyNav();$('#resolutionNav').hidden=false;$('#resolutionEyebrow').textContent=`${state.repeatOf?`追討令（「${state.repeatOf}」をもう一度）· `:''}反信長側の行動 · これから（全${enemyStepQueue.length}手）`;$('#resolutionCardName').textContent=enemyCurrentStep.title;$('#resolutionEntries').innerHTML='<li>「進む」を押すと、この行動をします。</li>';$('#resolutionBack').disabled=true;$('#resolutionFwd').disabled=false;$('#resolutionFwd').textContent='進む ▶';$('#resolutionConfirm').textContent='確定（全部進める）';const dlg=$('#resolutionDialog');dlg.classList.add('floating');if(!dlg.open)dlg.show();placeFloatingDialog(dlg,[]);return}
    if(enemyAutoConfirm){continueEnemySteps();return}
    if(enemyViewIdx<0)enemyViewIdx=enemyStepHistory.length-1;const h=enemyStepHistory[enemyViewIdx]||{title:enemyCurrentStep.title,entries:enemyCurrentStep.entries};
    const last=enemyViewIdx===enemyStepHistory.length-1;
    $('#resolutionEyebrow').textContent=`${state.repeatOf?`追討令（「${state.repeatOf}」をもう一度）· `:''}反信長側の行動 ${enemyViewIdx+1}／${enemyStepHistory.length}${enemyStepQueue.length?`（残り${enemyStepQueue.length}）`:''}${last?'':' · 見直し中'}`;
    $('#resolutionCardName').textContent=h.title;$('#resolutionEntries').innerHTML=(h.entries||[]).map(line=>`<li>${esc(line)}</li>`).join('');
    ensureEnemyNav();$('#resolutionNav').hidden=false;
    $('#resolutionBack').disabled=enemyViewIdx<=0;
    $('#resolutionFwd').disabled=false;$('#resolutionFwd').textContent=last?(enemyStepQueue.length?'進む ▶':'終わる ▶'):'次を見る ▶';if(last&&enemyStepQueue.length)$('#resolutionEntries').insertAdjacentHTML('beforeend',`<li class="next-step">次：${esc(enemyStepQueue[0].title)}</li>`);
    $('#resolutionConfirm').textContent=enemyStepQueue.length?'確定（残りを進める）':'確定してカード結果へ';
    const dlg=$('#resolutionDialog');dlg.classList.add('floating');if(!dlg.open)dlg.show();
    placeFloatingDialog(dlg,[h.area,h.lastMove?.from,h.lastMove?.to]);setTimeout(()=>placeFloatingDialog(dlg,[h.area,h.lastMove?.from,h.lastMove?.to]),450)}
  // 見直し: 前の一手の矢印と国を地図に出す（駒の位置は今のまま）
  function viewEnemyStep(idx){if(idx<0||idx>=enemyStepHistory.length)return;enemyViewIdx=idx;const h=enemyStepHistory[idx];state.lastMove=h.lastMove?{...h.lastMove}:null;if(h.area){state.selectedArea=h.area;state.mapFocusArea=h.area}if(h.leader)state.selectedLeader=h.leader;render();showEnemyStepConfirmation()}
  function continueEnemySteps(){const dlg=$('#resolutionDialog');const latest=enemyStepHistory[enemyStepHistory.length-1];if(latest&&enemyViewIdx!==enemyStepHistory.length-1){state.lastMove=latest.lastMove?{...latest.lastMove}:null}enemyViewIdx=-1;if(dlg.open)dlg.close();enemyCurrentStep=null;if(enemyStepQueue.length){runNextEnemyStep();return}enemyAutoConfirm=false;finishEnemySequence()}
  function ensureEnemyNav(){if($('#resolutionNav'))return;const nav=document.createElement('div');nav.id='resolutionNav';nav.className='resolution-nav';nav.innerHTML='<button id="resolutionBack" type="button" class="quiet">◀ 戻る</button><button id="resolutionFwd" type="button" class="quiet">進む ▶</button>';$('#resolutionConfirm').before(nav);
    $('#resolutionBack').addEventListener('click',()=>viewEnemyStep(enemyViewIdx-1));
    $('#resolutionFwd').addEventListener('click',()=>{if(enemyViewIdx<enemyStepHistory.length-1)viewEnemyStep(enemyViewIdx+1);else continueEnemySteps()})}
  // 浮かせた窓を、指定した国（とその駒）にかからない所へ置く。なければ地図の左上（海）へ
  function placeFloatingDialog(dlg,ids){if(!dlg||!dlg.open)return;const vp=$('.map-viewport');if(!vp)return;const vr=vp.getBoundingClientRect();dlg.style.margin='0';dlg.style.left=`${Math.max(8,vr.left+10)}px`;dlg.style.top=`${Math.max(8,vr.top+10)}px`;return;
    const L=Math.max(8,vr.left+8),T=Math.max(8,vr.top+8),R=Math.min(innerWidth-8,vr.right-8),B=Math.min(innerHeight-8,vr.bottom-8);
    dlg.style.margin='0';const w=dlg.offsetWidth,hgt=dlg.offsetHeight,avoid=[];
    for(const id of [...new Set(ids.filter(Boolean))]){for(const el of document.querySelectorAll(`#territoryShapes .territory-hit[data-area="${id}"],.area-node[data-area="${id}"]`)){const r=el.getBoundingClientRect();if(r.width&&r.height)avoid.push(r)}}
    const pad=10,ov=(l,t)=>avoid.reduce((s,r)=>{const a=Math.min(l+w,r.right+pad)-Math.max(l,r.left-pad),b=Math.min(t+hgt,r.bottom+pad)-Math.max(t,r.top-pad);return s+(a>0&&b>0?a*b:0)},0);
    const cl=l=>Math.max(L,Math.min(l,R-w)),ct=t=>Math.max(T,Math.min(t,B-hgt));
    const c=avoid[0]?{x:(avoid[0].left+avoid[0].right)/2,y:(avoid[0].top+avoid[0].bottom)/2}:{x:(L+R)/2,y:(T+B)/2},cands=[];
    for(const r of avoid)cands.push([r.right+pad,c.y-hgt/2],[r.left-w-pad,c.y-hgt/2],[c.x-w/2,r.top-hgt-pad],[c.x-w/2,r.bottom+pad]);
    cands.push([L,T],[R-w,T],[L,B-hgt],[R-w,B-hgt],[(L+R-w)/2,T],[(L+R-w)/2,B-hgt],[L,(T+B-hgt)/2],[R-w,(T+B-hgt)/2]);
    let best=null;for(const [l0,t0] of cands){const l=cl(l0),t=ct(t0);if(ov(l,t)>0)continue;const d=Math.hypot(l+w/2-c.x,t+hgt/2-c.y);if(!best||d<best.d)best={l,t,d}}
    if(!best)best={l:L,t:T};dlg.style.left=`${best.l}px`;dlg.style.top=`${best.t}px`}
  function finishEnemySequence(){const card=enemyStepCard||state.lastCard;enemyStepCard=null;enemyCurrentStep=null;state.mode='';state.turnComplete=true;resolveControl();checkEnd();render();if(state.over)showResolution(card,resolutionEntries);else{state.autoNext=true;tryAutoDraw()}}
  function availableTrackRetreats(){const out=[],stage=state.tracks.oda||0,threshold=[0,6,5,4,3,2][stage]||0;if(stage>0&&state.strategy>=threshold)out.push(['oda','織田家臣']);for(const key of ['tokugawa','matsunaga'])if((state.tracks[key]||0)>0&&(state.tracks[key]||0)<4)out.push([key,key==='tokugawa'?'徳川家康':'松永久秀']);return out}
  function advanceRevolt(leader){const before=state.tracks.oda||0,stage=state.tracks.oda=Math.min(5,before+1),threshold=[0,6,5,4,3,2][stage]||0;animateTrackMarker('oda',leader,before,stage);note(`直前は${leader}のカード。織田家臣の参戦マーカーが進行（${stage}/5）。${threshold&&state.strategy>=threshold?'':`反逆は戦略値${threshold||'-'}以上で有効（今の戦略値${state.strategy}）。`}`);if(stage>before&&threshold&&state.strategy>=threshold)rebelOdaRetainer(leader)}
  function rebelOdaRetainer(leader){const found=getLeader(leader);if(!found||found.force.army==='反逆織田軍')return;const reg=state.areas[found.area],otherOdaLeader=reg.forces.some(f=>f.leader&&f.leader!==leader&&f.army==='織田軍');for(const f of reg.forces)if(f===found.force||(!otherOdaLeader&&f.army==='織田軍')){f.side='enemy';f.army='反逆織田軍'}state.rebels||=[];if(!state.rebels.includes(leader))state.rebels.push(leader);note(`${leader}が反信長側に寝返りました。`)}
  function advanceLoyaltyTrack(track){if(state.tracks[track]>=2&&state.tracks[track]<4){const before=state.tracks[track];state.tracks[track]++;animateTrackMarker(track,track==='tokugawa'?'徳川家康':'松永久秀',before,state.tracks[track]);syncLoyaltyForce(track);const name=track==='tokugawa'?'徳川家康':'松永久秀';note(`${name}の参戦マーカーが進行。`);if(state.tracks[track]>=4)note(`${name}が反信長側に寝返りました。`)}}
  function redeployTargets(name){const oda=leaderArmy[name]==='織田軍'||odaRetainers.includes(name);if(oda)return [...armyHomes('織田軍')].filter(id=>state.areas[id]?.control==='player');const home=homeArea[name];return home&&(state.areas[home].control==='player'||!state.areas[home].forces.length)?[home]:[]}
  function offerRedeploy(card){const pool=(card.leaders||[]).filter(l=>state.leaderPool.player?.includes(l)&&!(state.rebels||[]).includes(l));for(const name of pool){const where=redeployTargets(name);if(!where.length)continue;state.mode='redeploy';state.redeployLeader=name;state.activeCard=card;state.actionHighlights=where;state.selectedArea=where[0];state.selectedLeader=null;setBoardView('map');note(`${name}は補充プールにいます。戻す本領を地図で選んでください（9.0(4)）。`);toast(`${name}を戻す本領を選んでください`);return true}return false}
  function redeployLeader(name,id){const oda=leaderArmy[name]==='織田軍'||odaRetainers.includes(name);const total=oda?Math.max(1,state.strategy):1;const n=Math.min(total-1,state.playerPool);state.leaderPool.player=state.leaderPool.player.filter(x=>x!==name);state.areas[id].forces.push({leader:name,army:leaderArmy[name]||'織田軍',count:n,power:D.units?.leaders?.[name]||2,side:'player'});state.playerPool-=n;const message=`${name}が補充プールから${areaBy(id).name}に戻る（軍勢${n}駒）`;note(message+'。');announceAction('補充',message);state.redeployLeader=null;finishAction(id,name,true)}
  function enemyTurn(leader){const found=getLeader(leader);if(!found||found.force.side!=='enemy')return;state.lastActingSide='enemy';const {area:id,force}=found;const reg=state.areas[id];
    if(reg.forces.some(f=>f.side!=='enemy'&&alive(f))){announceAction('反信長側の行動',`${leader}が${areaBy(id).name}で攻撃`);enemyAttack(id,leader);return}
    const targets=legalEnemyMoves(id,force);if(!targets.length){note(`${leader}は移動先がなく待機。`);announceAction('反信長側の行動',`${leader}は移動先がなく待機`);return}
    // 7.3(2): 同じ軍の駒を全部引き連れる。行動しない反信長の駒が残らないなら1駒残す。本領の軍も1駒残す
    const group=reg.forces.filter(f=>f.side==='enemy'&&(f.army===force.army||(leader==='雑賀孫市'&&isIkko(f.army))));
    const stay=reg.forces.some(f=>f.side==='enemy'&&!group.includes(f)&&alive(f));
    let troops=group.reduce((s,f)=>s+f.count,0);const keep=(!stay||armyHomes(force.army).has(id))?1:0;const amount=troops-keep;
    if(amount<0||(amount===0&&keep)){note(`${leader}は軍勢が少なく行軍できない。`);announceAction('反信長側の行動',`${leader}は軍勢が少なく待機`);return}
    const to=targets[0];let left=amount;const arriving={};
    for(const f of group.sort((a,b)=>(b.army===force.army)-(a.army===force.army))){const n=Math.min(f.count-(keep&&f===group.find(g=>g.army===force.army&&g.count>0)?keep:0),left);if(n>0){f.count-=n;left-=n;arriving[f.army]=(arriving[f.army]||0)+n}}
    force.leader='';reg.forces=reg.forces.filter(alive);
    const dest=state.areas[to];dest.forces.push({leader,army:force.army,count:arriving[force.army]||0,power:force.power,side:'enemy'});for(const [army,n] of Object.entries(arriving))if(army!==force.army)dest.forces.push({leader:'',army,count:n,power:2,side:'enemy'});
    state.lastMove={from:id,to,leader,side:'enemy',count:amount};(state.report||=[]).push({k:'move',r:state.round,c:state.lastCard?.name||'',from:id,to,side:'enemy',leader,count:amount});const message=`${leader}が${areaBy(id).name}から${areaBy(to).name}へ${amount}駒で行軍`;note(message+'。');announceAction('反信長側の行動',message)}
  function cardArmies(card){const s=new Set((card.leaders||[]).map(l=>leaderArmy[l]).filter(Boolean));if(card.name==='本願寺')['石山一向一揆','長島一向一揆','加賀一向一揆','本願寺（雑賀軍）'].forEach(a=>s.add(a));return s}
  // 12.0: 指定の武将が全部プールにいて、補充の軍の本領が全部他勢力の支配下なら、その大名は滅亡
  function daimyoDestroyed(card){const leaders=card.leaders||[];if(!leaders.length)return false;if(leaders.some(l=>getLeader(l)))return false;
    const armies=[...cardArmies(card)];const homes=new Set(armies.flatMap(a=>[...armyHomes(a)]));if(card.name==='本願寺')['kii','kawachi','kitaise','kaga'].forEach(a=>homes.add(a));
    if([...homes].some(h=>state.areas[h]?.control==='enemy'))return false;
    for(const region of Object.values(state.areas)){for(const f of region.forces)if(armies.includes(f.army)&&f.side==='enemy'){state.enemyPool+=f.count;f.count=0;f.leader=''}region.forces=region.forces.filter(alive)}
    state.leaderPool.enemy=(state.leaderPool.enemy||[]).filter(l=>!leaders.includes(l));state.removedCards||=[];state.removedCards.push(card.name);state.deck=state.deck.filter(c=>c.name!==card.name);state.discard=state.discard.filter(c=>c.name!==card.name);
    note(`${card.name}が滅亡。カードをゲームから除く（ルール12.0）。`);announceAction('大名の滅亡',`${card.name}が滅亡しました`);resolveControl();return true}
  function enemyReinforcementSpecs(card,onlyLeader){let specs=Array.isArray(card.reinforce)?card.reinforce:[];if(card.reinforce==='tokugawa')specs=[['徳川家康',1]];else if(card.reinforce==='matsunaga')specs=[['松永久秀',1]];else if(card.reinforce==='actingOda')specs=(onlyLeader?[onlyLeader]:card.leaders).filter(name=>getLeader(name)?.force.side==='enemy').map(name=>[name,2]);return specs}
  function applyEnemyReinforcements(card,onlyLeader,singleSpec){state.lastActingSide='enemy';const placements={'摂津':['kawachi','石山一向一揆'],'北伊勢':['kitaise','長島一向一揆'],'加賀':['kaga','加賀一向一揆']},specs=singleSpec?[singleSpec]:enemyReinforcementSpecs(card,onlyLeader);
    state.honganji||=[];
    // 13.22(1): 一向一揆の駒が全部プールにあり、反信長がその本領の支配を失っていれば、その軍は「本願寺」の駒になる
    for(const [army,home] of [['石山一向一揆','kawachi'],['長島一向一揆','kitaise'],['加賀一向一揆','kaga']]){if(state.honganji.includes(army))continue;const onMap=Object.values(state.areas).some(r=>r.forces.some(f=>f.army===army&&alive(f)));if(!onMap&&state.areas[home]?.control!=='enemy'){state.honganji.push(army);note(`${army}は本願寺の駒になった（13.22）。以後は雑賀孫市の枠でだけ補充。`)}}
    for(const [name,amount] of specs){
      // 13.23(2): 雑賀孫市（1駒）の枠は、石山・長島・加賀・本願寺のどれでも1駒。雑賀孫市のいるエリアに置く
      if(name==='雑賀孫市'){let saiga=getLeader('雑賀孫市');if(!saiga&&state.leaderPool.enemy?.includes('雑賀孫市')){const spot=['kii','kawachi','kitaise','kaga'].find(a=>state.areas[a]?.control==='enemy');if(spot){state.leaderPool.enemy=state.leaderPool.enemy.filter(x=>x!=='雑賀孫市');state.areas[spot].forces.push({leader:'雑賀孫市',army:'本願寺（雑賀軍）',count:0,power:2,side:'enemy'});note(`雑賀孫市が${areaBy(spot).name}に戻る（13.23(3)）。`);announceAction('反信長側の補充',`雑賀孫市が${areaBy(spot).name}に戻る`)}continue}
        if(!saiga||state.enemyPool<1)continue;const armies=['石山一向一揆','長島一向一揆','加賀一向一揆'].filter(a=>{const onMap=Object.values(state.areas).flatMap(r=>r.forces).filter(f=>f.army===a).reduce((s,f)=>s+f.count,0);return onMap<(D.units?.armies?.[a]||4)});if(!armies.length)continue;const army=armies[Math.floor(Math.random()*armies.length)],label=state.honganji.includes(army)?'本願寺':army;const reg=state.areas[saiga.area];let f=reg.forces.find(x=>x.army===army&&!x.leader);if(!f){f={leader:'',army,count:0,power:2,side:'enemy'};reg.forces.push(f)}f.count++;state.enemyPool--;note(`雑賀孫市の枠で${label}を1駒補充（${areaBy(saiga.area).name}、反信長の補充プール残り${state.enemyPool}駒）。`);announceAction('反信長側の補充',`雑賀孫市の枠で${label}を1駒補充`);continue}
      const found=getLeader(name);
      if(found&&found.force.side==='enemy'){const n=Math.min(amount,state.enemyPool);found.force.count+=n;state.enemyPool-=n;if(n){note(`${name}が${n}駒を補充（反信長の補充プール残り${state.enemyPool}駒）。`);announceAction('反信長側の補充',`${name}が${n}駒を補充（プール残り${state.enemyPool}駒）`)}continue}
      // 9.0(4): プールにいる武将は本領に戻る（本領が他勢力の支配下なら戻れない。反逆織田軍は本領がない 13.1(4)）
      if(!found&&state.leaderPool.enemy?.includes(name)&&!(state.rebels||[]).includes(name)){const home=homeArea[name],reg=home&&state.areas[home];if(reg&&reg.control!=='player'&&reg.control!=='neutral'||reg&&!reg.forces.length){const n=Math.min(Math.max(0,amount-1),state.enemyPool);state.leaderPool.enemy=state.leaderPool.enemy.filter(x=>x!==name);reg.forces.push({leader:name,army:leaderArmy[name],count:n,power:D.units?.leaders?.[name]||2,side:'enemy'});state.enemyPool-=n;note(`${name}が本領の${areaBy(home).name}に戻る（${n}駒）。`);announceAction('反信長側の補充',`${name}が${areaBy(home).name}に戻る`)}else note(`${name}は本領が他勢力の支配下で戻れない。`);continue}
      if(placements[name]){const [id,army]=placements[name];if(state.honganji.includes(army))continue; // 13.22(2): 本願寺になった駒は雑賀孫市の枠でしか補充できない
        const saiga=getLeader('雑賀孫市');let where=id;
        // 13.21(3): 雑賀孫市のいるエリアと本領が、他勢力をはさまず街道でつながっていれば、雑賀孫市のいるエリアに置く
        if(saiga){const seen=new Set([saiga.area]),q=[saiga.area];while(q.length){const u=q.shift();if(u===id){where=saiga.area;break}for(const v of neighbors(u)){if(seen.has(v))continue;if(v!==id&&state.areas[v].forces.some(f=>f.side!=='enemy'&&alive(f)))continue;seen.add(v);q.push(v)}}}
        const region=state.areas[where];let force=region.forces.find(f=>f.army===army&&!f.leader);if(!force){force={leader:'',army,count:0,power:2,side:'enemy'};region.forces.push(force)}
        const onMap=Object.values(state.areas).flatMap(r=>r.forces).filter(f=>f.army===army).reduce((s,f)=>s+f.count,0);const n=Math.min(amount,state.enemyPool,Math.max(0,(D.units?.armies?.[army]||amount)-onMap));force.count+=n;state.enemyPool-=n;region.forces=region.forces.filter(alive);if(n){note(`${army}を${areaBy(where).name}に${n}駒補充（反信長の補充プール残り${state.enemyPool}駒）。`);announceAction('反信長側の補充',`${army}を${areaBy(where).name}に${n}駒（プール残り${state.enemyPool}駒）`)}}}}
  function advanceTrackToActive(track){const stage=state.tracks[track]=Math.min(3,(state.tracks[track]||0)+1);return stage>=3}
  function ikkoshuHomeAttacks(){const locations=[['kawachi','石山一向一揆'],['kitaise','長島一向一揆'],['kaga','加賀一向一揆']];for(const [id,army] of locations){const region=state.areas[id];if(!region)continue;const force=region.forces.find(f=>f.army===army);if(force&&region.forces.some(f=>f.side==='player'))attackForce(id,force,army)}}
  function legalEnemyMoves(from,f){const targets=neighbors(from);if(!targets.length)return[];const goals=['yamashiro','nishimino'];const score=id=>Math.min(...goals.map(g=>distancesFrom(id)[g]??99));
    const best=Math.min(...targets.map(score));let cands=targets.filter(id=>score(id)===best);
    // 7.3(3): 同じ距離なら地図の矢印の向き、それも同じならサイコロ
    const arrows={minamikinki:'yamashiro',kitaise:'owari','kai-suruga':'totomi'};
    if(cands.length>1&&arrows[from]&&cands.includes(arrows[from]))cands=[arrows[from]];
    return [cands[Math.floor(Math.random()*cands.length)]]}
  function attackForce(id,att,label){const reg=state.areas[id];state.lastActingSide=att.side;
    // 8.0(1): 同じエリアの同じ軍の駒を全部使う（雑賀孫市は一向一揆・本願寺の駒も引率できる 13.23(1)）
    const group=reg.forces.filter(f=>f.side===att.side&&(f.army===att.army||(att.leader==='雑賀孫市'&&isIkko(f.army))));
    const dice=group.reduce((s,f)=>s+pieces(f),0),power=Number(att.leader?(D.units?.leaders?.[att.leader]??att.power):2)||2;
    let hits=0,rolls=[];for(let i=0;i<dice;i++){const n=1+Math.floor(Math.random()*6);rolls.push(n);if(n<=power)hits++}
    const targets=reg.forces.filter(f=>f.side!==att.side),attackers=group.map(snapshotForce),defenders=targets.map(snapshotForce),damage=applyDamage(reg,targets,hits,att.side,id);reg.forces=reg.forces.filter(alive);
    note(`${label}が${areaBy(id).name}で攻撃。出目 ${rolls.join('・')}、${hits}損害。`);queueBattle({area:areaBy(id).name,attackerSide:att.side,attackers,defenders,attackPower:power,rolls,hits,damage})}
  function enemyAttack(id,leader){const reg=state.areas[id],att=reg.forces.find(f=>f.leader===leader);if(att)attackForce(id,att,leader)}
  function snapshotForce(force){const sa=shownArmy(force);return {name:force.leader||sa,leader:force.leader||'',army:sa,side:force.side,count:force.count,power:force.power}}
  function applyDamage(region,targets,hits,attackerSide,id){
    // 8.0(4): ①反信長の攻撃では信長側を先に ②武将は同じ軍の最後の1駒まで残す ③このエリアが本領の軍は最後まで残す
    let loss=hits,dealt=0;const casualties=[];const homeHere=a=>armyHomes(a).has(id);
    const tierOf=f=>(attackerSide==='enemy'&&f.side!=='player'?2:0)+(homeHere(f.army)?1:0);
    const order=[...targets].sort((a,b)=>tierOf(a)-tierOf(b));
    const take=(f,n,isLeader)=>{if(isLeader){const name=f.leader,side=f.side;sendLeaderToPool(f);casualties.push({name,troops:0,leader:true,side})}else{f.count-=n;poolFor(f,n);casualties.push({name:f.leader||shownArmy(f),troops:n,leader:false,side:f.side})}dealt+=isLeader?1:n;loss-=isLeader?1:n};
    for(const tier of [...new Set(order.map(tierOf))]){
      const group=order.filter(f=>tierOf(f)===tier);
      // 先に軍勢駒（大きい山から）、武将は同じ軍の軍勢が0になってから
      while(loss>0){const troops=group.filter(f=>f.count>0).sort((a,b)=>b.count-a.count);if(!troops.length)break;take(troops[0],1,false)}
      for(const f of group){if(loss<=0)break;if(f.leader&&!group.some(g=>g.army===f.army&&g.count>0))take(f,1,true)}
      if(loss<=0)break}
    // 同じ人の山はまとめて表示
    const merged={};for(const c of casualties){const k=c.name+'|'+c.leader;merged[k]?merged[k].troops+=c.troops:(merged[k]={...c})}
    return {dealt,casualties:Object.values(merged)}}
  function sendLeaderToPool(force){const name=force.leader,side=force.side;force.leader='';if(side==='player'&&state.options.leaderInjury){if(['柴田勝家','丹羽長秀','羽柴秀吉','明智光秀'].includes(name)){const stage=state.tracks.oda=Math.min(5,(state.tracks.oda||0)+1),threshold=[0,6,5,4,3,2][stage]||0;note(`信長側武将の負傷：織田家臣トラックが${stage}/5に進行。`);if(threshold&&state.strategy>=threshold){note(`${name}は反逆条件に達したためゲームから除外。`);return}}else if(name==='徳川家康'||name==='松永久秀'){const key=name==='徳川家康'?'tokugawa':'matsunaga';state.tracks[key]=Math.min(4,(state.tracks[key]||0)+1);syncLoyaltyForce(key);note(`信長側武将の負傷：${name}の参戦トラックが進行。`)}}state.leaderPool[side]||=[];state.leaderPool[side].push(name);note(`${name}が補充プールに戻りました。`)}
  // ===== レポート（ゲーム終了時に自動、ボタンでいつでも）2026-11-09 =====
  function buildReport(){const W=4153,H=2923,R=state.report||[],P=a=>{const x=areaBy(a);return x?[W*x.x/100,H*x.y/100]:[0,0]};
    const red='#a8432f',blue='#2f4f6f',sideCol=s=>s==='player'?red:s==='enemy'?blue:'#777',sideJ=s=>s==='player'?'信長側':s==='enemy'?'反信長':'中立';
    const mapUrl=new URL('assets/maps/white-map.png',location.href).href;
    const terr=Object.entries(window.TERRITORY_PATHS||{}).map(([id,d])=>{const c=state.areas[id]?.control;return `<path d="${d}" fill="${c==='player'?red:c==='enemy'?blue:'none'}" fill-opacity=".22" stroke="none"/>`}).join('');
    const moves=R.filter(e=>e.k==='move');
    const arrows=moves.map((e,i)=>{const [x1,y1]=P(e.from),[x2,y2]=P(e.to),dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,o=(i%3-1)*18,nx=-dy/L*o,ny=dx/L*o,sx=x1+dx*.12+nx,sy=y1+dy*.12+ny,ex=x2-dx*.18+nx,ey=y2-dy*.18+ny,c=sideCol(e.side);
      return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${c}" stroke-width="10" stroke-opacity=".7" marker-end="url(#ah${e.side==='player'?'p':'e'})"/>`}).join('');
    // 年表: 同じカードで同じ国の合戦が続いたら、ひとつの戦いにまとめる
    const wars=[];let lastCard=null;for(const e of R){if(e.k==='card'){lastCard=e;continue}if(e.k!=='battle'||!e.area)continue;const w=wars[wars.length-1];if(w&&w.cardRef===lastCard&&w.area===e.area&&w.side===e.side&&w.att===e.att){w.n++;w.dealt+=e.dealt;w.lost.push(...(e.lost||[]));continue}wars.push({cardRef:lastCard,r:e.r||lastCard?.r||1,c:e.c,area:e.area,side:e.side,att:e.att,attArmy:e.attArmy,defs:e.defs||[],n:1,dealt:e.dealt,lost:[...(e.lost||[])]})}
    const byArea={};wars.forEach((w,i)=>(byArea[w.area]||=[]).push(i+1));
    const battles=Object.entries(byArea).map(([id,nums])=>{const [x,y]=P(id),label=nums.join('・'),wd=Math.max(110,label.length*30+70);return `<g transform="translate(${x-110},${y-110})"><rect x="${-wd/2}" y="-40" width="${wd}" height="80" rx="40" fill="#fff8e8" stroke="#8a2a1c" stroke-width="7"/><text y="16" text-anchor="middle" font-size="46" font-weight="800" fill="#8a2a1c">戦${label}</text></g>`}).join('');
    const marks=D.areas.map(a=>{const reg=state.areas[a.id],[x,y]=P(a.id),by={};for(const f of reg.forces.filter(alive))by[f.side]=(by[f.side]||0)+pieces(f);const list=Object.entries(by);return list.map(([s,n],i)=>`<g transform="translate(${x+(i-(list.length-1)/2)*84},${y+40})"><rect x="-36" y="-36" width="72" height="72" rx="10" fill="${sideCol(s)}" stroke="#fff" stroke-width="6"/><text y="16" text-anchor="middle" font-size="44" font-weight="800" fill="#fff">${n}</text></g>`).join('')}).join('');
    const svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#e9e0cb"><defs>${['p','e'].map(k=>`<marker id="ah${k}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10z" fill="${k==='p'?red:blue}"/></marker>`).join('')}</defs><image href="${mapUrl}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" opacity=".9"/>${terr}${arrows}${battles}${marks}</svg>`;
    const kanji=n=>'〇一二三四五六七八九十'[n]||String(n);
    let rows=wars.map((w,i)=>{const def=w.defs.filter(x=>x!==w.attArmy).join('・')||'敵';const times=w.n>1?`（${kanji(w.n)}度にわたり攻める）`:'';
      const lost=w.lost.length?`。${[...new Set(w.lost)].join('・')}は退く`:'';
      return `<li><span class="when">第${kanji(w.r)}巡</span><span class="num" style="background:${sideCol(w.side)}">${i+1}</span><div><b>${esc(areaBy(w.area)?.name||'')}の戦い</b> <small>（${esc(w.c)}のカード）</small><br>${esc(w.att)}（${sideJ(w.side)}）、${esc(def)}を攻める${times}。${esc(def)}は${w.dealt}駒を失う${esc(lost)}。</div></li>`}).join('');
    const end=[...R].reverse().find(e=>e.k==='note'&&/^(勝利|敗北)/.test(e.t));
    if(end)rows+=`<li class="end"><span class="when">第${kanji(end.r||state.round||1)}巡</span><span class="num" style="background:#3b332c">終</span><div><b>${esc(end.t.split('：')[0])}</b><br>${esc(end.t.split('：').slice(1).join('：'))}</div></li>`;
    rows=rows?`<ol class="chron">${rows}</ol>`:'';
    const {n,total}=recalc(),last=[...R].reverse().find(e=>e.k==='note'&&/^(勝利|敗北)/.test(e.t));
    const result=state.over?(last?.t||'ゲーム終了'):'ゲーム途中（まだ終わっていません）';
    const cnt=s=>Object.values(state.areas).flatMap(r=>r.forces).filter(f=>f.side===s&&alive(f)).reduce((a,f)=>a+pieces(f),0);
    const cards=R.filter(e=>e.k==='card').length,bt=R.filter(e=>e.k==='battle').length;
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>孤高の信長 レポート</title><style>body{margin:0;background:#ece4d2;color:#2b2622;font-family:'Hiragino Mincho ProN','Yu Mincho',serif}main{max-width:1100px;margin:0 auto;padding:18px}h1{margin:4px 0 2px;font-size:26px}h2{font-size:20px;margin:18px 0 6px}.sub{color:#7a7266;font-size:13px}.res{background:#f7f1e3;border:1px solid #dcd1bb;border-left:6px solid ${/^勝利/.test(result)?red:'#3b332c'};border-radius:8px;padding:12px 16px;margin:12px 0;font-size:18px;font-weight:700}.stats{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.stats div{background:#f7f1e3;border:1px solid #dcd1bb;border-radius:8px;padding:8px 12px;font-size:13px}.stats b{font-size:18px;display:block}.map{border:1px solid #c9bc9f;border-radius:8px;overflow:hidden}.legend{font-size:12px;color:#5a5249;margin:6px 0 10px}.legend i{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:-1px;margin:0 4px 0 10px}.card{background:#f7f1e3;border:1px solid #dcd1bb;border-radius:8px;padding:8px 14px;margin:8px 0}.card h3{margin:2px 0 6px;font-size:16px}.card h3 small{color:#7a7266;font-weight:400;font-size:12px}.chron{list-style:none;margin:0;padding:0 0 0 0;border-left:3px solid #b9a77f;margin-left:78px}.chron li{position:relative;display:flex;gap:12px;align-items:flex-start;padding:8px 0 12px 22px;font-size:15px;line-height:1.7}.chron .when{position:absolute;left:-84px;top:10px;width:64px;white-space:nowrap;text-align:right;color:#8a6d2f;font-size:13px}.chron .num{position:absolute;left:-13px;top:10px;width:22px;height:22px;border-radius:50%;color:#fff;font:700 12px/22px sans-serif;text-align:center}.chron small{color:#7a7266}.chron li.end b{color:#8a2a1c}</style></head><body><main>
<h1>孤高の信長 一五七〇 レポート</h1><div class="sub">${new Date().toLocaleString('ja-JP')} 作成</div>
<div class="res">${esc(result)}</div>
<div class="stats"><div>巡<b>第${state.round||1}巡</b></div><div>引いたカード<b>${cards}枚</b></div><div>合戦<b>${bt}回</b></div><div>信長側の拠点<b>${n}／${total}</b></div><div>戦略値<b>${state.strategy}</b></div><div>盤上の駒（武将を含む）<b>信長側 ${cnt('player')}・反信長 ${cnt('enemy')}</b></div></div>
<div class="map">${svg}</div>
<div class="legend">地図は終わったときの盤面。<i style="background:${red}"></i>信長側<i style="background:${blue}"></i>反信長　矢印＝行軍、「戦」＝合戦（番号は下の年表の番号）、四角＝残った駒の数（武将を含む）</div>
<h2>合戦年表</h2>${rows||'<p>合戦はありませんでした。</p>'}
</main></body></html>`}
  function downloadReport(){const html=buildReport(),blob=new Blob([html],{type:'text/html'}),url=URL.createObjectURL(blob),a=document.createElement('a'),d=new Date(),pad=n=>String(n).padStart(2,'0');a.href=url;a.download=`nobunaga_report_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.html`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
  window.__nobuReport=buildReport;
  document.addEventListener('click',e=>{if(e.target.closest('#reportButton'))downloadReport()});

  function checkEnd(){if(state.over)return;recalc();const nob=getLeader('織田信長');if(!nob){state.over=true;note('敗北：織田信長が盤上から除去されました。');return}const threatened=(D.goals.defeatAreas||[]).find(id=>state.options.captureDefeat?state.areas[id]?.control==='enemy':state.areas[id]?.forces.some(f=>f.side==='enemy'));if(threatened){state.over=true;note(`敗北：反信長軍が${areaBy(threatened).name}に進入しました。`);return}if(state.strategy<(D.goals.minimumStrategy||2)){state.over=true;note('敗北：戦略値が1以下になりました。');return}if(D.goals.controlAll&&D.areas.every(a=>state.areas[a.id]?.control==='player')){state.over=true;note('勝利：街道でつながる全てのエリアを支配しました。')}}
  const hoverPreview=$('#hoverPreview');let hoverTarget=null;
  function placeHoverPreview(target,x,y){const r=target.getBoundingClientRect();const px=x??r.right+12,py=y??r.top;const w=hoverPreview.offsetWidth,h=hoverPreview.offsetHeight;let left=px+18,top=py+8;if(left+w>innerWidth-10)left=px-w-18;if(top+h>innerHeight-10)top=innerHeight-h-10;hoverPreview.style.left=`${Math.max(10,left)}px`;hoverPreview.style.top=`${Math.max(10,top)}px`}
  function showHoverPreview(target,x,y){if(!target)return;hoverTarget=target;hoverPreview.replaceChildren();hoverPreview.className='hover-preview';
    if(target.matches('.counter')){hoverPreview.classList.add('unit-preview');const tone=target.style.getPropertyValue('--tone')||'#536b59';const box=document.createElement('div');box.className='zoom-counter';box.style.setProperty('--tone',tone);const token=target.cloneNode(true);token.classList.add('preview-token');token.removeAttribute('title');token.removeAttribute('tabindex');token.querySelectorAll('.counter-power,.counter-units').forEach(el=>el.remove());box.append(token);const stack=target.closest('.force-stack');const nm=stack?.querySelector('.force-name')?.textContent||'',stats=stack?.querySelector('.force-stats')?.textContent||'';if(nm){const cap=document.createElement('div');cap.className='zoom-caption';cap.innerHTML=`<strong>${esc(nm)}</strong><span>${esc(stats)}</span>`;box.append(cap)}hoverPreview.append(box)
    }else if(target.matches('.card-art')){hoverPreview.classList.add('card-preview-zoom');const cap=document.createElement('strong');cap.textContent=document.querySelector('#lastCard .drawn-card')?.textContent||target.alt||'状況札';const img=document.createElement('img');img.src=target.currentSrc||target.src;img.alt=target.alt||'状況札';hoverPreview.append(cap,img)}else return;
    hoverPreview.hidden=false;hoverPreview.setAttribute('aria-hidden','false');placeHoverPreview(target,x,y)}
  function hideHoverPreview(){hoverPreview.hidden=true;hoverPreview.setAttribute('aria-hidden','true');hoverTarget=null}
  document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const target=e.target.closest('.counter, #lastCard .card-art');if(target&&target!==hoverTarget)showHoverPreview(target,e.clientX,e.clientY)});
  document.addEventListener('pointermove',e=>{if(hoverTarget&&e.pointerType!=='touch')placeHoverPreview(hoverTarget,e.clientX,e.clientY)});
  document.addEventListener('pointerout',e=>{const target=e.target.closest('.counter, #lastCard .card-art');if(target===hoverTarget&&!e.relatedTarget?.closest?.('.counter, #lastCard .card-art'))hideHoverPreview()});
  document.addEventListener('focusin',e=>{const target=e.target.closest?.('.counter, #lastCard .card-art');if(target)showHoverPreview(target)});
  document.addEventListener('focusout',e=>{if(hoverTarget&&e.target===hoverTarget)hideHoverPreview()});
  function announceAction(kind,message){announcementQueue.push({kind,message});if(!announcementBusy)showNextAnnouncement()}
  function showNextAnnouncement(){if(!announcementQueue.length){announcementBusy=false;return}announcementBusy=true;const item=announcementQueue.shift(),el=$('#actionAnnouncement');el.innerHTML=`<b>${esc(item.kind)}</b><span>${esc(item.message)}</span>`;el.hidden=false;el.classList.remove('announce-in');void el.offsetWidth;el.classList.add('announce-in');setTimeout(()=>{el.hidden=true;announcementBusy=false;showNextAnnouncement()},2600)}
  function queueBattle(event){if(event.damage)battleReport(event);battleQueue.push(event);if(!battleInProgress)showNextBattle()}
  function battleReport(event){{const ar=D.areas.find(a=>a.name===event.area);(state.report||=[]).push({k:'battle',r:state.round,c:state.lastCard?.name||'',area:ar?.id,side:event.attackerSide,hits:event.hits,dealt:event.damage?.dealt||0,att:(event.attackers.find(f=>f.leader)||event.attackers[0]||{}).name||'',attArmy:(event.attackers[0]||{}).army||'',defs:[...new Set(event.defenders.map(f=>f.army))],lost:(event.damage?.casualties||[]).filter(x=>x.leader).map(x=>x.name)})}}
  function addBattleForce(container,force,marks={troops:0,leader:false},sideName=''){const row=document.createElement('div');row.className=`battle-force ${force.side}`;const header=document.createElement('div');header.className='battle-force-head';const name=document.createElement('b');name.textContent=force.name||force.army;const quantity=document.createElement('small');quantity.textContent=`${force.count}駒${force.leader?' + 武将':''}`;header.append(name,quantity);row.append(header);const pile=document.createElement('div');pile.className='battle-token-pile';for(let i=0;i<force.count;i++){const token=document.createElement('span');token.className=`battle-token ${i<marks.troops?'casualty':''}`;token.textContent='兵';token.style.setProperty('--tone',factionColor(force.army));pile.append(token)}if(force.leader){const leader=document.createElement('span');leader.className=`battle-token leader-token ${marks.leader?'casualty':''}`;leader.textContent='将';leader.title=force.leader;leader.style.setProperty('--tone',factionColor(force.army));pile.append(leader)}row.append(pile);container.append(row)}
  function showNextBattle(){if(!battleQueue.length){battleInProgress=false;return}battleInProgress=true;const b=battleQueue[0];$('#battleTitle').textContent=`${b.area}の合戦`;
    const sideText=side=>side==='player'?'信長側':side==='enemy'?'反信長':'中立';$('#battleAttackerSide').textContent=`攻撃側 · ${sideText(b.attackerSide)}`;$('#battleDefenderSide').textContent=`防御側 · ${[...new Set(b.defenders.map(f=>sideText(f.side)))].join('・')||'なし'}`;
    const a=$('#battleAttackers'),d=$('#battleDefenders');a.replaceChildren();d.replaceChildren();for(const f of b.attackers)addBattleForce(a,f);for(const f of b.defenders)addBattleForce(d,f,{troops:0,leader:false});const showLosses=b.showLosses=()=>{const damageByName={};for(const loss of b.damage.casualties){damageByName[loss.name]||={troops:0,leader:false};damageByName[loss.name].troops+=loss.troops;damageByName[loss.name].leader=damageByName[loss.name].leader||loss.leader}d.replaceChildren();for(const f of b.defenders){const loss=damageByName[f.name]||{troops:0,leader:false};addBattleForce(d,f,loss)}};
    $('#battleHitCount').textContent=`サイコロ ${b.rolls.length} 個`;$('#battleSummary').textContent=`攻撃力 ${b.attackPower} 以下の出目が命中。両軍の駒を確かめてから振ってください。`;$('#battleContinue').disabled=false;$('#battleContinue').textContent='サイコロを振る';$('#battleDice').innerHTML='';$('#battleDialog').showModal();
    b.roll=()=>{b.roll=null;$('#battleHitCount').textContent='判定中…';$('#battleContinue').disabled=true;$('#battleContinue').textContent='判定中…';paintBattleDice(b.rolls.map(()=>1+Math.floor(Math.random()*6)),b.attackPower,true);
    let step=0;clearInterval(battleTimer);battleTimer=setInterval(()=>{step++;if(step<12){paintBattleDice(b.rolls.map(()=>1+Math.floor(Math.random()*6)),b.attackPower,true);return}clearInterval(battleTimer);battleTimer=null;paintBattleDice(b.rolls,b.attackPower,false);$('#battleHitCount').textContent=`命中 ${b.hits} 個`;if(b.allocate){$('#battleSummary').textContent=`命中 ${b.hits} 個。どの駒に損害を与えるか選んでください`;$('#battleContinue').textContent='損害を割り振る';$('#battleContinue').disabled=false;return}showLosses();$('#battleSummary').textContent=`損害 ${b.damage.dealt} 駒 · ×印が損害を受けたコマです`;$('#battleContinue').textContent='結果を確認';$('#battleContinue').disabled=false},105)}}
  function paintBattleDice(values,power,rolling){$('#battleDice').innerHTML=values.map(n=>`<span class="battle-die ${!rolling&&n<=power?'hit':''} ${rolling?'rolling':''}">${n}</span>`).join('')||'<span class="muted">ダイスなし</span>'}
  function closeBattle(){if($('#battleContinue').disabled)return;if(battleQueue[0]?.roll){battleQueue[0].roll();return}if(battleQueue[0]?.allocate){const b=battleQueue[0],go=b.allocate;b.allocate=null;$('#battleContinue').disabled=true;go(damage=>{b.damage=damage;battleReport(b);b.showLosses();$('#battleSummary').textContent=`損害 ${damage.dealt} 駒 · ×印が損害を受けたコマです`;$('#battleContinue').textContent='結果を確認';$('#battleContinue').disabled=false});return}$('#battleDialog').close();clearInterval(battleTimer);battleTimer=null;battleQueue.shift();battleInProgress=false;if(battleQueue.length)setTimeout(showNextBattle,180);else if(state.mode==='enemyBattleWait'){state.mode='enemyStep';render();showEnemyStepConfirmation()}else{showPendingResolution();tryAutoDraw()}}
  function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
  let mapZoom=1,mapBaseWidth=0,mapBaseHeight=0;
  function setMapZoom(value){const board=$('#board'),viewport=$('.map-viewport');if(!mapBaseWidth){mapBaseWidth=board.clientWidth;mapBaseHeight=board.clientHeight}mapZoom=Math.max(.45,Math.min(1.8,Math.round(value*100)/100));const width=Math.round(mapBaseWidth*mapZoom);board.style.width=`${width}px`;const height=Math.round(mapBaseHeight*mapZoom);board.style.height=`${height}px`;viewport.style.width=`${Math.min(width,mapBaseWidth)}px`;viewport.style.height=`${height}px`;viewport.style.maxHeight='none';viewport.style.maxWidth='100%';viewport.style.marginInline='auto';board.style.setProperty('--map-zoom',mapZoom);$('#mapZoomLevel').textContent=`${Math.round(mapZoom*100)}%`;requestAnimationFrame(positionActionPanel)}
  $('.map-viewport').addEventListener('scroll',()=>requestAnimationFrame(()=>{positionActionPanel();const dlg=$('#resolutionDialog');if(dlg.open&&dlg.classList.contains('floating')&&enemyCurrentStep){const h=enemyStepHistory[enemyViewIdx];if(h)placeFloatingDialog(dlg,[h.area,h.lastMove?.from,h.lastMove?.to])}}),{passive:true});window.addEventListener('resize',()=>requestAnimationFrame(positionActionPanel));
  $('.map-viewport').addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)&&!e.ctrlKey){e.preventDefault();window.scrollBy(0,e.deltaY)}},{passive:false});
  $('#mapZoomIn').addEventListener('click',()=>setMapZoom(mapZoom+.1));$('#mapZoomOut').addEventListener('click',()=>setMapZoom(mapZoom-.1));
  $('#unitToggle').addEventListener('click',()=>{const hidden=$('#areaNodes').classList.toggle('units-hidden');$('#unitToggle').textContent=hidden?'駒を表示':'駒を隠す';$('#unitToggle').setAttribute('aria-pressed',String(hidden))});
  function setBoardView(view){const map=view==='map';$('#mapPanel').hidden=!map;$('#situationPanel').hidden=map;$('#mapTab').classList.toggle('active',map);$('#mapTab').setAttribute('aria-selected',String(map));$('#situationTab').classList.toggle('active',!map);$('#situationTab').setAttribute('aria-selected',String(!map))}
  $('#mapTab').addEventListener('click',()=>setBoardView('map'));$('#situationTab').addEventListener('click',()=>setBoardView('situation'));
  const firstCardSelect=$('#firstCardSelect');
  function refreshFirstCardChoices(name=firstCardSelect.value) {
    const cards=scenarioCards({extraTakigawa:$('#optionTakigawa').checked,extraMaeda:$('#optionMaeda').checked});
    firstCardSelect.innerHTML=cards.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
    if (cards.some(c=>c.name===name)) firstCardSelect.value=name;
  }
  $('#optionTakigawa').addEventListener('change',()=>refreshFirstCardChoices());
  $('#optionMaeda').addEventListener('change',()=>refreshFirstCardChoices());
  function syncStartOptions(){const o=state.options||{};$('#optionFirstCard').checked=Boolean(o.chooseFirstCard);$('#optionCaptureDefeat').checked=Boolean(o.captureDefeat);$('#optionLeaderInjury').checked=Boolean(o.leaderInjury);$('#optionUnitStats').checked=Boolean(o.showUnitStats);$('#optionTakigawa').checked=Boolean(o.extraTakigawa);$('#optionMaeda').checked=Boolean(o.extraMaeda);$('#optionStartingStrength').value=startingStrength(o);$('#optionExtraNobunaga').checked=Boolean(o.extraNobunaga);$('#optionReserveTotal').value=reserveTotal(o);refreshFirstCardChoices(o.firstCard);$('#firstCardChoice').hidden=!$('#optionFirstCard').checked}
  $('#optionFirstCard').addEventListener('change',e=>$('#firstCardChoice').hidden=!e.target.checked);
  function openStart(){syncStartOptions();document.querySelector('.app-shell').hidden=true;$('#startScreen').hidden=false;$('#continueGame').hidden=!canContinue}
  function closeStart(){document.querySelector('.app-shell').hidden=false;$('#startScreen').hidden=true;requestAnimationFrame(()=>setMapZoom(mapZoom))}
  function updateRetainerSetup(){const selects=[...document.querySelectorAll('[data-retainer-site]')],values=selects.map(x=>x.value),unique=new Set(values.filter(Boolean)).size===odaRetainers.length,complete=values.length===retainerSites.length&&values.every(Boolean)&&unique;const hint=$('#retainerSetupHint');hint.textContent=complete?'配置先は山城・南近江・南伊勢・尾張に固定されています。内容を確認して確定してください。':'4人を別々のエリアに割り当ててください。';hint.classList.toggle('error',values.some(Boolean)&&!complete);$('#retainerSetupConfirm').disabled=!complete}
  function openRetainerSetup(){document.querySelectorAll('[data-retainer-site]').forEach(select=>{select.innerHTML='<option value="">武将を選択</option>'+odaRetainers.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');select.value='';select.onchange=updateRetainerSetup});updateRetainerSetup();$('#retainerSetupDialog').showModal()}
  function applyRetainerPlacement(){const assignment=Object.fromEntries([...document.querySelectorAll('[data-retainer-site]')].map(x=>[x.dataset.retainerSite,x.value]));for(const region of Object.values(state.areas))for(const force of region.forces)if(odaRetainers.includes(force.leader))force.leader='';for(const [id] of retainerSites){const leader=assignment[id],region=state.areas[id];let force=region.forces.find(f=>f.army==='織田軍'&&f.side==='player');if(!force){force={leader:'',army:'織田軍',count:0,power:D.units?.leaders?.[leader]||2,side:'player'};region.forces.push(force)}force.leader=leader;force.power=D.units?.leaders?.[leader]||force.power||2;force.side='player';region.control='player';region.ownerArmy='織田軍';homeArea[leader]=id;note(`${leader}を${areaBy(id).name}に配置。`)}resolveControl();state.setupComplete=true}
  $('#startGame').addEventListener('click',()=>{state=fresh({extraTakigawa:$('#optionTakigawa').checked,extraMaeda:$('#optionMaeda').checked,startingStrength:$('#optionStartingStrength').value,extraNobunaga:$('#optionExtraNobunaga').checked,reserveTotal:$('#optionReserveTotal').value,chooseFirstCard:$('#optionFirstCard').checked,firstCard:firstCardSelect.value,captureDefeat:$('#optionCaptureDefeat').checked,leaderInjury:$('#optionLeaderInjury').checked,showUnitStats:$('#optionUnitStats').checked});canContinue=false;closeStart();render();openRetainerSetup()});
  function completeRetainerSetup(){applyRetainerPlacement();canContinue=true;$('#retainerSetupDialog').close();render();$('#firstDrawDialog').showModal()}
  $('#retainerSetupConfirm').addEventListener('click',completeRetainerSetup);$('#retainerRandomize').addEventListener('click',()=>{const names=[...odaRetainers];for(let i=names.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[names[i],names[j]]=[names[j],names[i]]}document.querySelectorAll('[data-retainer-site]').forEach((select,i)=>{select.value=names[i]});updateRetainerSetup();completeRetainerSetup()});$('#retainerSetupDialog').addEventListener('cancel',e=>e.preventDefault());
  $('#continueGame').addEventListener('click',()=>{closeStart();render();if(state.pendingCard)openCardReveal(state.pendingCard)});
  $('#battleContinue').addEventListener('click',closeBattle);$('#battleDialog').addEventListener('cancel',e=>{e.preventDefault();closeBattle()});
  $('#firstDrawConfirm').addEventListener('click',()=>{$('#firstDrawDialog').close();toast('1枚目の状況カードを引きます');setTimeout(draw,550)});$('#cardRevealContinue').addEventListener('click',continueCard);$('#cardRevealPass').addEventListener('click',passCard);$('#cardRevealClose').addEventListener('click',passCard);$('#cardRevealDialog').addEventListener('cancel',e=>{e.preventDefault()});$('#resolutionDialog').addEventListener('cancel',e=>e.preventDefault());$('#resolutionConfirm').addEventListener('click',()=>{if(enemyCurrentStep){enemyAutoConfirm=true;continueEnemySteps();return}if($('#resolutionDialog').open)$('#resolutionDialog').close();pendingResolution=null;if(!state.over)draw()});
  $('#openFormation').addEventListener('click',openFormation);
  $('#formationCancel').addEventListener('click',()=>$('#formationDialog').close());
  $('#formationDialog').addEventListener('close',tryAutoDraw);
  $('#endTurn').addEventListener('click',draw);$('#newGame').addEventListener('click',openStart);$('#helpBtn').addEventListener('click',()=>$('#helpDialog').showModal());$('#closeHelp').addEventListener('click',()=>$('#helpDialog').close());
  if(!canContinue)$('#continueGame').hidden=true;
  if('serviceWorker' in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
