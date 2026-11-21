"use strict";

const sections = {
  "機首":["爆撃手","航法士"],"操縦室":["正操縦士","副操縦士","航空機関士"],
  "無線室":["無線士"],"胴体側部":["下部銃手","左側面銃手","右側面銃手"],"尾部":["尾部銃手"],"爆弾倉":[]
};
function seatsInSection(area){
  const members=sections[area]||[];
  if(!s.pathfinder)return members;
  if(area==="無線室")return [...members,"下部銃手"];
  if(area==="胴体側部")return members.filter(person=>person!=="下部銃手");
  return members;
}
const crewInSection = area => seatsInSection(area).map(seatOccupant).filter(person=>!wasBailed(person));
const terrainNames = {E:"英国",W:"海上",F:"フランス",B:"ベルギー",N:"オランダ",G:"ドイツ"};
const terrain = () => s.zone===1?["E"]:s.target.route[s.zone-2].split("/")[1].split("");
const enginesOut = () => s.engines.filter(e=>e.stopped).length;
const bombsAboard = () => s.bomb===null&&!s.jettisoned;
const wasBailed = name => Boolean(s?.bailed?.includes(name));
const canWork = name => !wasBailed(name)&&(s.wounds[name]||0)<3;
function dropBombs(reason){
  if(!bombsAboard())return;
  s.jettisoned=true;
  note("爆弾投棄："+reason);
}
function descend(reason){
  if(s.low)return;
  if(s.randomEvents)s.randomEvents.coldGuns=[];
  s.low=true;
  s.out=true;
  note("10,000 ftへ降下・編隊離脱："+reason);
}
function demand(reason,mode="controlled"){
  if(s.emergency?.mode==="uncontrolled")return;
  s.emergency={reason,mode};
  boardView="crew";
  s.phase="emergency";
  event("緊急事態",reason);
}
function stopEngine(index,feather=true){
  const engine=s.engines[index];
  engine.stopped=true;
  engine.drag=!feather;
  engine.oil=null;
  if(!feather)s.out=true;
  const count=enginesOut();
  if(count>=2){
    dropBombs("エンジン2基以上停止");
    s.out=true;
    s.pendingLow=true;
  }
  if(count===3&&s.lastLeg===null)s.lastLeg=1;
  if(count===4)demand("全エンジン停止。現在のゾーンで降りるか、脱出してください。");
}
function engineHit(area){
  const table="B1-1";
  const index=(area==="左翼"?0:2)+(roll(table+" エンジン位置")<=3?0:1);
  const label="第"+(index+1)+"エンジン";
  const e=s.engines[index];
  const r=roll(table+" エンジン損傷");
  if(r<=2||e.stopped)return "軽微な損傷";
  if(r<=5){
    const ok=!s.faults.has("フェザリング装置故障")&&roll(table+" プロペラの停止処置")<=5;
    stopEngine(index,ok);
    if(r===5&&!ok)demand(label+"暴走。機体を放棄してください。","bail");
    return fault(label+(r===5?"暴走・停止":"停止")+(ok?"":"・プロペラ停止不能"));
  }
  const oil=roll(table+" オイルタンク");
  if(oil>=5)return "軽微な損傷";
  if(oil>=3){
    e.oil=Math.ceil(roll(table+" 停止までの残りゾーン")/2);
    e.oilZone=s.zone;
    return fault(label+"オイル漏れ・残り "+e.oil+" ゾーン");
  }
  let extinguished=false;
  while(e.charges>0&&!s.faults.has("エンジン消火装置故障")){
    e.charges--;
    if(roll(table+" "+label+"消火")<=4){extinguished=true;break;}
  }
  if(!extinguished){demand(label+"の火災が消せません。機体を放棄してください。","bail");return fault(label+"火災");}
  stopEngine(index);
  return fault(label+"火災・消火後に停止");
}
function fuelHit(area){
  const side=roll("B1-1 燃料タンク位置")<=3?"外側":"内側";
  const tank=area+side+"タンク";
  const r=roll("B1-1 燃料タンク損傷");
  if(r>=5)return "軽微な損傷";
  if(r<=2){
    const blast=roll("B1-1 燃料火災")===6;
    demand(tank+(blast?"が爆発。機体は制御不能です。":"火災が消せません。機体を放棄してください。"),blast?"uncontrolled":"bail");
    return fault(tank+(blast?"爆発":"火災"));
  }
  if(!s.leaks.includes(tank)){
    s.leaks.push(tank);
    const count=s.leaks.length;
    const limit=count===1?3+Math.ceil(roll("B1-1 残り飛行ターン")/2):count===2?2:1;
    s.fuel=s.fuel===null?limit:Math.min(s.fuel,limit);
  }
  return fault(tank+"漏れ・残り "+s.fuel+" ターン");
}
function structural(part,limit){
  const n=s.structure[part]=(s.structure[part]||0)+1;
  if(n>=limit)demand(part+"の脱落で操縦不能です。","uncontrolled");
  return part+" 根元損傷 "+n+"/"+limit;
}
function heat(affected){
  for(const person of affected)if(s.heat[person]===undefined)s.heat[person]=s.turn;
  return fault("暖房故障："+affected.join("、"));
}
function oxygen(area,rolls){
  const affected=seatsInSection(area);
  const fire=rolls===6;
  let chosen=affected;
  if(!fire&&area==="機首")chosen=rolls<=2?[affected[0]]:rolls<=4?[affected[1]]:affected;
  if(!fire&&area==="操縦室")chosen=rolls===1?affected.slice(0,2):[affected[rolls<=3?rolls-2:2]];
  if(!fire&&area==="胴体側部")chosen=[rolls<=2?"左側面銃手":rolls<=4?"右側面銃手":"下部銃手"].filter(seat=>affected.includes(seat));
  chosen=chosen.filter(Boolean);
  for(const who of chosen)s.oxygen[who]=(s.oxygen[who]||0)+(fire?2:1);
  if(chosen.some(who=>canWork(seatOccupant(who))&&s.oxygen[who]>=2))s.pendingLow=true;
  if(!fire)return fault("酸素供給に被弾："+(chosen.join("、")||area));
  for(let i=0;i<3&&s.extinguishers>0;i++){
    s.extinguishers--;
    if(roll("B1-3 酸素火災・携帯消火器")<=4)return fault(area+"の酸素火災・消火");
  }
  demand(area+"の酸素火災が消せません。機体を放棄してください。","bail");
  return fault(area+"の酸素火災");
}
function internalBurst(area){
  if(area==="爆弾倉"&&bombsAboard()){
    finish("爆弾が誘爆。機体喪失、乗員全員戦死");
    return s.outcome;
  }
  for(const person of crewInSection(area))s.wounds[person]=4;
  if(["左翼","右翼","操縦室","尾部"].includes(area)){
    demand(area+"の機内炸裂で操縦不能です。","uncontrolled");
    return fault(area+"で機内炸裂");
  }
  s.out=true;
  s.burst=true;
  for(let result=2;result<=12&&s.phase!=="end"&&s.phase!=="emergency";result++){
    const effect=damage({area,burst:false},result);
    if(effect!=="軽微な損傷")note(effect);
  }
  return fault(area+"で機内炸裂・着陸修正 −4・機体修復不能");
}
function upkeep(moved){
  s.turn++;
  if(s.fuel!==null)s.fuel=Math.max(0,s.fuel-1);
  if(s.pendingLow){descend("酸素喪失またはエンジン停止");s.pendingLow=false;}
  if(moved){
    for(const [index,engine] of s.engines.entries()){
      if(engine.oil!==null&&s.zone!==engine.oilZone){
        engine.oilZone=s.zone;
        if(--engine.oil<=0){stopEngine(index);fault("第"+(index+1)+"エンジン・オイル漏れで停止");}
      }
    }

  }
  if(!s.low)for(const [seat,since] of Object.entries(s.heat)){
    const person=seatOccupant(seat);
    if(s.turn>since+1&&canWork(person)&&!s.frost.includes(person)&&roll("B1-5 凍傷 "+person)<=3){
      s.frost.push(person);note(person+" 凍傷");
    }
  }
  return s.phase!=="emergency";
}
function slowFlight(){
  return s.mechanicalSlow||s.burst||enginesOut()>=2||enginesOut()===1&&bombsAboard()
    ||s.engines.some(e=>e.drag)||Boolean((s.faults.has("航法機器故障")||!canWork(seatOccupant("航法士")))&&s.out&&s.zone%2);
}
function landingModifier(water,includeCrew=true){
  const both=(a,b)=>s.faults.has(a)&&s.faults.has(b);
  const faults={...s.landingMods};
  for(const f of ["操縦室窓破損","操縦索切断","方向舵故障"])if(s.faults.has(f))faults[f]=1;
  if(!water){
    for(const f of ["尾輪損傷","ブレーキ故障"])if(s.faults.has(f))faults[f]=1;
    if(s.faults.has("降着装置故障"))faults["降着装置"]=3;
  }
  if(s.faults.has("方向舵故障"))delete faults["方向舵制御故障"];
  if(both("左昇降舵故障","右昇降舵故障"))faults["昇降舵制御故障"]=1;
  if(both("左翼フラップ故障","右翼フラップ故障"))faults["フラップ制御故障"]=1;
  if(both("左翼補助翼故障","右翼補助翼故障"))faults["補助翼制御故障"]=1;
  let mod=-Object.values(faults).reduce((a,b)=>a+b,0);
  if(water){
    if(s.faults.has("救命いかだ損傷"))mod-=6;
    if(s.out&&(s.faults.has("無線機故障")||!canWork(seatOccupant("無線士"))))mod-=6;
  }
  if(enginesOut()===3)mod-=3;
  if(enginesOut()===4)mod-=water?4:7;
  if(s.burst)mod-=4;
  if(!includeCrew)return mod;
  const pilot=actingPilot();
  mod-=pilotReplacementPenalty(pilot);
  if(pilot)mod-=fatiguePenalty(pilot);
  if(s.manualJettison&&bombsAboard())mod-=4;
  if(pilots.some(p=>canWork(p)&&(s.wounds[p]||0)<2&&crewExperience(p)>=11))mod++;
  return mod;
}
function survival(person,where,bail){
  if(s.wounds[person]===4)return;
  if(where==="W"){
    if(bail&&(s.out&&(s.faults.has("無線機故障")||!canWork(seatOccupant("無線士")))
      ||roll("G-8 "+person+" 海上救助")-((s.wounds[person]||0)>0?1:0)<5)){
      s.wounds[person]=4;return;
    }
    if(s.zone>=6)s.crewResult[person]="捕虜";
    else s.crewResult[person]="救助・基地へ帰還";
  }else if(where==="G"||where==="N")s.crewResult[person]="捕虜";
  else if(where==="F"||where==="B"){
    if((s.wounds[person]||0)>=3||roll("G-6/G-9 "+person+" 帰還")<6)s.crewResult[person]="捕虜";
  }
}
function checkBailout(person,uncontrolled){
  const raw=roll((uncontrolled?"G-7 ":"G-6 ")+person+" 脱出");
  const mod=(s.wounds[person]||0)>0?1:0;
  return uncontrolled?raw===6:raw===6||raw-mod>1||roll("G-6 "+person+" 事故")!==6;
}
function canBail(person){
  return canWork(person)&&!(crewSeat(person)==="下部銃手"&&trappedInBall());
}
function bailBeforeLanding(person){
  if(s.phase!=="land"||!canBail(person)||!crew.some(([who])=>who!==person&&canWork(who)))return;
  (s.bailed??=[]).push(person);
  if(checkBailout(person,false)){
    s.crewResult[person]="英国で脱出・基地へ帰還";
    event("着陸前に脱出",crewName(person)+"は無事にパラシュートで降下しました。");
  }else{
    s.wounds[person]=4;
    s.crewResult[person]="戦死";
    event("脱出事故",crewName(person)+"は脱出中の事故で戦死しました。");
  }
}
function resolveBail(where){
  const uncontrolled=s.emergency?.mode==="uncontrolled";
  for(const [person] of crew){
    if(wasBailed(person))continue;
    if(!canBail(person)||!checkBailout(person,uncontrolled))s.wounds[person]=4;
    else survival(person,where,true);
  }
  finish(terrainNames[where]+"で脱出・機体喪失");
}
function resolveLanding(where,extra=0,departure=false){
  const water=where==="W";
  const weatherMod=where==="E"?(departure?(s.departureWeather||0):(s.baseWeather??=weather("基地"))):s.zone===targetZone()?s.weather:0;
  const mod=landingModifier(water)-weatherMod-(!water&&where!=="E"?3:0)+extra;
  const raw=roll(water?"G-10 着水":"G-9 着陸",2);
  const r=raw+mod;
  s.landing={where,raw,mod,r,departure};
  note("着陸 修正 "+mod+" ／ 修正後 "+r);
  let result;
  if(water)result=raw===12||r>=4?"着水・機体喪失":"着水失敗・乗員全員戦死";
  else if(raw!==12&&r<=-3)result="墜落・乗員全員戦死";
  else if(where!=="E")result=terrainNames[where]+"に不時着・機体喪失";
  else if(r<=0||s.burst)result="基地着陸・機体修復不能";
  else if(s.faults.has("降着装置故障")&&roll("N-1 #26 機体の修復可否")>=4)result="基地着陸・機体修復不能";
  else result=departure?"離陸中止・基地に帰還":r===1?"基地着陸・機体は修理可能":"基地着陸・生還";
  if(!water&&r<=0&&bombsAboard()&&roll("G-9 搭載爆弾の誘爆")===6)result="爆弾が誘爆・乗員全員戦死";
  s.landing.touchedDown=!water&&!result.includes("全員戦死");
  if(!result.includes("全員戦死")){
    for(const [person] of crew){
      if(wasBailed(person))continue;
      if(!water&&raw!==12&&(r===-1||r===-2))note(wound(person,r===-2?1:0));
      if(crewSeat(person)==="下部銃手"&&trappedInBall()&&s.faults.has("降着装置故障"))s.wounds[person]=4;
      survival(person,where,false);
    }
  }
  finish(result);
}
function resolveMedical(){
  for(const [person] of crew){
    if(s.wounds[person]===4){s.crewResult[person]="戦死";continue;}
    if(s.crewResult[person]==="捕虜")continue;
    if(s.wounds[person]===3){
      const r=roll("B1-4 "+person+" 生存判定")-(ruleEnabled("training")&&s.landing?(s.caregivers?.[person]||[]).filter(canWork).length:0);
      if(r===6){s.wounds[person]=4;s.crewResult[person]="戦死";continue;}
      if(r>=2)s.crewResult[person]="搭乗離任";
    }
    if(s.frost.includes(person)&&roll("B1-5 "+person+" 凍傷の回復")<=3)s.crewResult[person]="搭乗離任";
  }
}
function instrumentHit(){
  const result=roll("B1-2 計器",2);
  const label=["自動操縦故障","降着装置故障","機内通話故障","酸素系故障",
    "フラップ制御故障","補助翼制御故障","昇降舵制御故障","方向舵制御故障",
    "フェザリング装置故障","エンジン消火装置故障","電気系統故障"][result-2];
  if(result===5)s.pendingLow=true;
  if(result>=6&&result<=9)s.landingMods[label]=1;
  if(result===12)demand("電気系統が故障。機体を放棄してください。","bail");
  return fault(label);
}
function ammoDonors(to){
  return Object.keys(guns).filter(from=>from!==to&&s.ammo[from]>=2&&(!guns[to][2]||guns[from][2]));
}
function transferAmmo(from,to,count){
  if(!s.ammoTransferAllowed||s.ammo[to]!==0||!ammoDonors(to).includes(from)||
    !Number.isInteger(count)||count<2||count%2||s.ammo[from]<count)return false;
  s.ammo[from]-=count;
  s.ammo[to]+=count;
  event("弾薬を融通",guns[from][0]+"から"+guns[to][0]+"へ "+count+" 発を移しました。");
  return true;
}
function renderAmmoTransfer(options){
  if(!s.ammoTransferAllowed)return;
  const receivers=Object.keys(guns).filter(key=>s.ammo[key]===0&&ammoDonors(key).length);
  if(!receivers.length)return;
  const details=make("details",undefined,"ammo-transfer");
  details.append(make("summary",playMode==="story"?"「機長、空になった銃座へ弾を回しますか？」":"弾切れの銃座に弾薬を移す"));
  const form=make("form");
  const picker=(label,values)=>{
    const select=make("select");
    select.setAttribute("aria-label",label);
    for(const [key,text] of values){
      const option=make("option",text);
      option.value=key;
      select.append(option);
    }
    return select;
  };
  const target=picker("移動先",receivers.map(key=>[key,guns[key][0]]));
  const source=picker("移動元",[]);
  const amount=picker("移す弾薬の数",[]);
  const refreshAmount=()=>{
    const count=Math.floor((s.ammo[source.value]||0)/2);
    amount.replaceChildren(...picker("移す弾薬の数",Array.from({length:count},(_,i)=>[(i+1)*2,(i+1)*2+" 発"])).children);
  };
  const refreshSource=()=>{
    source.replaceChildren(...picker("移動元",ammoDonors(target.value).map(key=>[key,guns[key][0]])).children);
    refreshAmount();
  };
  target.addEventListener("change",refreshSource);
  source.addEventListener("change",refreshAmount);
  refreshSource();
  const button=make("button",playMode==="story"?"「その銃座へ弾を回せ」":"弾薬を移す","subtle");
  form.addEventListener("submit",e=>{
    e.preventDefault();
    captainReply(guns[source.value][0]+"から"+guns[target.value][0]+"へ弾を回せ。",["航空機関士","機長、空になった銃座へ弾を回しますか？"]);
    if(transferAmmo(source.value,target.value,Number(amount.value)))render();
  });
  form.append(target,source,amount,button);
  details.append(form);
  options.append(details);
}
function renderColdGunRepair(options,adviceBox){
  const state=s.randomEvents;
  if(!["randomEvent","combat"].includes(s.phase)||!state?.coldGuns?.length)return;
  const wave=crewWave();
  for(const key of state.coldGuns){
    const role=gunnerAt(key);
    if(state.repairWaves?.[role]===wave||!canWork(role)||gunnerMoving(role)||actingPilot()===role||s.disabled.has(key))continue;
    const label=guns[key][0], reply=label+"の凍結を直せ";
    const advice=[role,"機長、"+label+"が凍っています。修理を試してもいいですか？"];
    if(playMode==="story")adviceBox.append(make("p",crewLine(...advice),"flight-advice"));
    const button=make("button",playMode==="story"?quoteLine(reply):label+"の凍結を修理","subtle");
    button.addEventListener("click",()=>{
      captainReply(reply,advice);
      (state.repairWaves??={})[role]=wave;
      const result=roll("凍結銃の修理 "+label,2)-(guns[key][2]?1:0);
      if(result<=3)s.disabled.add(key);
      if(result<=3||result>=8)state.coldGuns=state.coldGuns.filter(item=>item!==key);
      event("偶発事象・銃座の修理",label+(result<=3?"は破損し、もう使えません。":result>=8?"が復旧しました。":"はまだ凍結しています。次の波で再試行できます。"));
      render();
    });
    options.append(button);
  }
}
function renderFlightOptions(){
  const options=el("flight-options"),adviceBox=el("command-advice");
  options.replaceChildren();
  adviceBox.replaceChildren();
  el("flight-readout").textContent="エンジン "+(4-enginesOut())+"/4"+
    (s.fuel===null?"":" ／ 燃料 "+s.fuel+"ターン")+
    " ／ "+(s.low?"10,000 ft":s.pendingLow?"次ターン降下":"20,000 ft")+
    (s.out?" ／ 編隊外":"");
  if(s.phase==="end")return;
  function action(label,reply,fn,advice){
    if(playMode==="story"&&advice)adviceBox.append(make("p",crewLine("航空機関士",advice),"flight-advice"));
    const b=make("button",playMode==="story"?quoteLine(reply):label,"subtle");
    b.addEventListener("click",()=>{captainReply(reply,advice?["航空機関士",advice]:headingReport());fn();render();});
    options.append(b);
  }
  renderColdGunRepair(options,adviceBox);
  renderCrewAssignments(options);
  if(s.phase==="combat"&&!s.coverRem&&!s.enemyDisrupted&&canEvade()){
    action(s.evade?"回避機動を解除":"回避機動を取る",s.evade?"進路を戻せ":"回避機動だ。敵の照準を外せ",()=>{
      s.evade=!s.evade;
      event(s.evade?"回避機動":"回避機動を解除",s.evade?"敵の射撃 −1。味方の銃は基本6で命中します。":"進路を安定させます。");
    },"機長、編隊外です。機体を振れば敵の狙いを外せます。どうしますか？");
  }
  if(s.phase==="takeoffChoice"){
    if(s.takeoffWeak&&bombsAboard())
      action("爆弾を降ろして離陸","爆弾を降ろせ。機体を軽くする",()=>{
        dropBombs("離陸時の出力低下");
        s.out=false;
        takeoff();
      });
    action("離陸を中止","離陸は中止だ。機体を戻せ",()=>abortTakeoff("機長の判断で離陸を取りやめました。"));
    return;
  }
  if(s.phase==="emergency"){
    for(const where of terrain()){
      if(s.emergency.mode==="controlled")
        action(where==="W"?"海上へ着水":terrainNames[where]+"に着陸",where==="W"?"海に降りる。着水に備えろ":terrainNames[where]+"に降りるぞ",()=>resolveLanding(where));
      action(terrainNames[where]+"で脱出",terrainNames[where]+"で総員脱出！",()=>resolveBail(where));
    }
    return;
  }
  if(s.phase==="land"){
    const danger=landingModifier(false)-(s.baseWeather||0)<0;
    if(!danger&&!s.bailed?.length)return;
    const available=crew.filter(([person])=>canBail(person)&&crew.some(([other])=>other!==person&&canWork(other)));
    if(!available.length)return;
    const advice="機長、この着陸は危険です。着陸前に脱出させる乗員はいますか？";
    if(playMode==="story")adviceBox.append(make("p",crewLine("副操縦士",advice),"flight-advice"));
    const pick=make("select");
    pick.setAttribute("aria-label","着陸前に脱出する乗員");
    for(const [person] of available){
      const option=make("option",crewName(person)+"（"+person+"）");
      option.value=person;
      pick.append(option);
    }
    options.append(pick);
    const button=make("button",playMode==="story"?"「選んだ乗員、先に脱出しろ」":"選んだ乗員を脱出させる","subtle");
    button.addEventListener("click",()=>{
      captainReply(crewName(pick.value)+"、先に脱出しろ。",["副操縦士",advice]);
      bailBeforeLanding(pick.value);
      render();
    });
    options.append(button);
    return;
  }
  if(!["move","flak","bomb"].includes(s.phase))return;
  renderAmmoTransfer(options);
  if(ruleEnabled("training")&&s.zone>1&&(s.careTurn??-1)!==s.turn){
    const pilot=actingPilot();
    const medic=crew.find(([role])=>role!==pilot&&canWork(role)&&s.service[role]?.training?.includes("医療訓練"))?.[0];
    if(medic)for(const [patient] of crew.filter(([role])=>s.wounds[role]===3&&!wasBailed(role)&&(s.medicalCare?.[role]||0)<2)){
      action(crewName(patient)+"を手当てする","負傷者を手当てしてくれ",()=>{
        s.careTurn=s.turn;
        s.careMedic=medic;
        (s.medicalCare??={})[patient]=(s.medicalCare[patient]||0)+1;
        ((s.caregivers??={})[patient]??=[]).push(medic);
        event("負傷者の手当て",crewName(medic)+"が"+crewName(patient)+"の応急処置を行いました。");
      },"機長、"+crewName(patient)+"は重傷です。いま手当てしますか？");
    }
  }
  if(enginesOut()===3&&s.lastLeg!==null&&!s.stripped){
    action("武装・弾薬を投棄して延命","武装と弾薬を捨てろ。機体を軽くする",()=>{
      dropBombs("重量軽減");
      for(const gun of Object.keys(s.ammo))s.ammo[gun]=0;
      s.extinguishers=0;
      for(const engine of s.engines)engine.charges=0;
      s.lastLeg++;
      s.stripped=true;
      if(!s.returning){s.returning=true;s.aborted=true;}
      event("重量を軽減","弾薬と消火器を投棄し、残りの飛行距離を1ゾーン延長。");
    },"機長、エンジンが１基しか残っていません。武装を捨てれば、もう少し飛べます。投棄しますか？");
  }
  if(s.zone>1&&(s.fuel!==null||enginesOut()>=3)){
    action("緊急着陸・脱出","ここで降りる手を考えよう",()=>demand("現在のゾーンで降りるか、脱出してください。"),"機長、このまま飛び続けるのは危険です。緊急着陸か脱出を考えますか？");
  }
  if(s.manualJettison&&bombsAboard()&&s.lastJettisonZone!==s.zone)
    action("爆弾の緊急投棄を試す","緊急投棄を試せ",()=>{
      s.lastJettisonZone=s.zone;
      if(roll("爆弾の緊急投棄")<=3)dropBombs("緊急投棄");
      event("爆弾の緊急投棄",bombsAboard()?"投棄できません。次のゾーンで再試行できます。":"爆弾を投棄しました。");
    },"機長、投下装置が故障しています。緊急投棄を試しますか？");
  if(!s.manualJettison&&bombsAboard()&&s.zone>1&&(enginesOut()||s.out||s.engines.some(e=>e.reducedPower)))
    action("爆弾を投棄","爆弾を捨てろ",()=>{dropBombs("乗員の判断");if(!s.rocketBroken&&!enginesOut()&&!s.low&&!s.pendingLow&&!s.aborted&&s.engines.some(e=>e.reducedPower))s.out=false;event("爆弾を投棄","爆撃は実施できません。");},"機長、爆弾を抱えたままです。投棄しますか？");
  if(Object.keys(s.heat).length&&!s.low&&!s.pendingLow)
    action("暖房故障のため降下","編隊を出て高度を落とす",()=>{descend("乗員の判断");event("低空へ降下","凍傷を避けるため編隊を離れます。");},"機長、暖房が止まりました。この高度では凍傷の恐れがあります。降下を勧めます。");
}
