'use strict';

const PFBSeasonUI=(()=>{
    const STORE='pfb-pennant-v1';
    let season=null, data=null, tab='news', month=2, dashboardLeague='CL', statTeam='', statType='hitting';
    let statSort=null;
    let busy=false;
    const view=()=>document.getElementById('season-dialog');
    const body=()=>document.getElementById('season-content');
    const teamLabel=team=>esc(teamShort(team));

    function active(){return Boolean(season)}
    function stored(){
        try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; }
    }
    function bundle(){
        return {format:'pfb-season-v1',season,roster:data,
            match:gameInst?.seasonMatch&&!gameInst.gameOver&&!gameInst.pending?exportMatch(gameInst,data,halfEndPending):null};
    }
    function autosave(){
        if(!season||gameInst?.pending)return;
        try { localStorage.setItem(STORE,JSON.stringify(bundle())); } catch {}
    }
    function downloadSave(day){
        const date=PFBSeason.dateOf(day).toISOString().slice(5,10);
        downloadJson(bundle(),`PFB-${teamShort(season.team)}-ペナント-${date}.json`);
    }
    function save(){
        if(gameInst?.pending){reportSave('判定を終えてから保存してください。');return}
        const day=gameInst?.seasonMatch?.day ?? season.day;
        downloadSave(day);
        reportSave('ペナントをファイルに保存しました');
    }
    function load(value){
        if(value?.format!=='pfb-season-v1'||value.season?.version!==PFBSeason.VERSION||!Array.isArray(value.roster)||
            !Array.isArray(value.season.fixtures)||!value.season.clubs?.[value.season.league]?.includes(value.season.team)){
            throw new Error('PFBのペナントファイルを読み込めません。');
        }
        if(value.match) importMatch(value.match);
        season=value.season;
        data=value.roster;
        PFBSeason.updateSavedPitching(season,data);
        dashboardLeague=season.league;
        statTeam='';
        statSort=null;
        month=PFBSeason.dateOf(season.day).getUTCMonth();
        close();
        showGameScreen();
        if(value.match){
            resumeMatch(value.match);
            gameInst.longInjuries=season.longInjuries;
            const f=season.fixtures.find(x=>x.id===gameInst.seasonMatch?.id);
            gameInst.profiles=f?[f.away,f.home].map(team=>profile(team)):undefined;
        }else{
            gameInst=null;players=data;show('news');
        }
    }
    function leave(){
        autosave();
        if(data)players=data;
        season=null;data=null;
        close();
    }
    function start(league,team){
        season=PFBSeason.create(players,league,team);
        data=players;
        gameInst=null;
        dashboardLeague=league;
        statTeam='';
        statSort=null;
        month=PFBSeason.dateOf(season.day).getUTCMonth();
        autosave();
        show('news');
    }
    function close(){if(view().open)view().close()}
    function show(key='news'){
        if(!season)return;
        tab=key;
        render();
        if(!view().open)view().showModal();
    }
    function standingsTable(league){
        const order=PFBSeason.rank(season,league);
        return `<div class="table-scroll"><table><thead><tr><th>順位</th><th>球団</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>差</th></tr></thead><tbody>${order.map(([team,x],i)=>{
            const winRate=x.w+x.l?PFBSeason.rateText(x.w/(x.w+x.l)):'—';
            return `<tr class="${team===season.team?'my-club':''}"><td>${i+1}</td><th>${teamLabel(team)}</th><td>${x.w+x.l+x.t}</td><td>${x.w}</td><td>${x.l}</td><td>${x.t}</td><td>${winRate}</td><td>${i?PFBSeason.gb(order[0][1],x):'—'}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    }
    function statRoster(teams){
        return [...data.filter(row=>teams.includes(row['チーム'])).map(row=>[rowId(row),{
            name:displayName(row),team:row['チーム'],limit:Number(row['試合数'])||0,pitcher:isPitcher(row)
        }]),...Object.entries(season.playerInfo).filter(([,p])=>teams.includes(p.team)&&p.anonymous)
            .map(([id,p])=>[id,{...p,pitcher:id.includes('/P/')}])];
    }
    function leaderTable(league,pitching){
        const teams=season.clubs[league];
        const records=season.stats;
        const gamesPlayed=Math.max(0,...teams.map(team=>{
            const record=season.records[team];
            return record ? record.w+record.l+record.t : 0;
        }));
        const minimum=Math.max(1,Math.floor(gamesPlayed*3.1));
        const average=line=>line.H/line.AB;
        const leaders=statRoster(teams).flatMap(([id,player])=>{
            const line=records[id];
            return line&&(pitching ? line.PG>0 : line.AB>0&&line.PA>=minimum) ? [{player,line}] : [];
        }).sort((a,b)=>pitching ? b.line.W-a.line.W || b.line.PK-a.line.PK :
            average(b.line)-average(a.line) || b.line.H-a.line.H).slice(0,5);
        const heading=pitching ? '投手ベスト5（勝利数）' : '打撃ベスト5（打率）';
        const columns=pitching ? ['勝','敗','S','奪三振'] : ['打率','本塁打','打点','打席'];
        return `<section><h4>${heading}</h4>${pitching?'':`<p>対象 ${minimum}打席以上</p>`}${leaders.length?
            `<div class="table-scroll"><table aria-label="${heading}"><thead><tr><th>順位</th><th>選手</th><th>球団</th>${columns.map(label=>`<th>${label}</th>`).join('')}</tr></thead>
            <tbody>${leaders.map(({player,line},index)=>{
                const values=pitching ? [line.W,line.L,line.SV,line.PK] : [PFBSeason.rateText(average(line)),line.HR,line.RBI,line.PA];
                return `<tr${player.team===season.team?' class="my-club"':''}><td>${index+1}</td><th scope="row">${esc(player.name)}</th><td>${teamLabel(player.team)}</td>${values.map(value=>`<td>${value}</td>`).join('')}</tr>`;
            }).join('')}</tbody></table></div>` : '<p>対象選手はまだいません。</p>'}</section>`;
    }
    function standings(){
        const leagues=Object.entries(PFBSeason.LEAGUES);
        return `<div class="season-league-grid">${leagues.map(([key,{name}])=>
            `<section><h3>${name}</h3>${standingsTable(key)}</section>`).join('')}</div>
            <div class="season-league-grid season-leaders">${leagues.map(([key,{name}])=>
            `<section><h3>${name}の個人成績</h3>${leaderTable(key,false)}${leaderTable(key,true)}</section>`).join('')}</div>`;
    }
    function reportStandings(){
        return season ? `<section class="report-league-summary"><h2>現在のペナント成績</h2>${standings()}</section>` : '';
    }
    function gameButton(f){
        const score=f.result?` ${f.result[0]}−${f.result[1]} `:' 対 ';
        return `<button type="button" class="season-fixture${[f.away,f.home].includes(season.team)?' my-club':''}" data-season="report" data-id="${esc(f.id)}"${f.result?'':' disabled'}>${teamLabel(f.away)}${score}${teamLabel(f.home)}${f.label?` <small>${esc(f.label)}</small>`:''}${f.cancelled?'（振替）':''}</button>`;
    }
    function starterSelect(fixture){
        if(busy || ![fixture.away,fixture.home].includes(season.team) ||
            fixture.result || fixture.cancelled || fixture.skipped || fixture.id===season.active) return '';
        const {starterCandidates,starterUnavailable,registeredName}=PFBSeason.namedRoster(season,data,season.team,fixture.day,fixture);
        const label=registeredName||'登録投手';
        const missing=starterUnavailable ? `<option selected disabled>${esc(label)}（登板不可）</option>` : '';
        const options=starterCandidates.map(row=>{
            const id=rowId(row);
            return `<option value="${esc(id)}"${id===fixture.starter?' selected':''}>${esc(displayName(row))}</option>`;
        }).join('');
        const name=fixture.starter ? `<span class="season-starter-name${starterUnavailable?' unavailable':''}">${esc(label)}${starterUnavailable?'（登板不可）':''}</span>` : '';
        return `<label class="season-starter">先発${name}<select data-starter-fixture="${esc(fixture.id)}"
            aria-label="${esc(PFBSeason.dayText(fixture.day))}の先発投手"><option value="">自動選択</option>${missing}${options}</select></label>`;
    }
    function calendar(){
        const year=PFBSeason.dateOf(season.day).getUTCFullYear();
        const list=season.fixtures.filter(f=>f.league===dashboardLeague||f.league==='日本');
        const days=new Map();
        for(const f of list){const games=days.get(f.day)||[];games.push(f);days.set(f.day,games)}
        const start=PFBSeason.dateOf(0);
        const startDate=Date.UTC(year,month,1);
        const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
        const blanks=(new Date(startDate).getUTCDay()+6)%7;
        const rows=[...Array(blanks).fill('<div></div>'),...Array.from({length:last},(_,i)=>{
            const day=Math.round((Date.UTC(year,month,i+1)-start.getTime())/86400000);
            const matches=(days.get(day)||[]).map(f=>gameButton(f)+starterSelect(f)).join('');
            const rest=new Date(Date.UTC(year,month,i+1)).getUTCDay()===1;
            return `<div class="season-date${day===season.day?' current-date':''}"><b>${i+1}</b>${matches|| (rest?'<small>休み</small>':'')}</div>`;
        })].join('');
        return `<div class="season-calendar-head"><button type="button" data-season="month-prev">前月</button><b>${year}年${month+1}月</b><button type="button" data-season="month-next">翌月</button></div>
            <div class="season-calendar">${['月','火','水','木','金','土','日'].map(x=>'<b class="calendar-weekday">'+x+'</b>').join('')}${rows}</div>`;
    }
    function statTable(){
        const teams=season.clubs[dashboardLeague];
        const roster=statRoster(statTeam ? [statTeam] : teams);
        const ledger=statType.startsWith('post-')?season.postStats:season.stats;
        const arm=statType.endsWith('pitching');
        const cols=arm?[['PG','登板'],['GS','先発'],['IP','投球回'],['W','勝'],['L','敗'],['SV','S'],['PH','被安打'],['PK','奪三振'],['PBB','与四球'],['PR','失点'],['SHOCK','ショック']]:
            [['G','試合'],['PA','打席'],['AB','打数'],['H','安打'],['AVG','打率'],['2B','二塁打'],['3B','三塁打'],['HR','本塁打'],['RBI','打点'],['R','得点'],['BB','四球'],['SO','三振'],['SB','盗塁']];
        const sort=statSort ?? {key:arm?'W':'AVG',descending:true};
        const selected=roster.flatMap(([id,player])=>{
            const line=ledger[id];
            const played=Boolean(line?.[arm?'PG':'PA']);
            if (!played && (!statTeam || player.pitcher!==arm)) return [];
            let value=null;
            if (played) value=sort.key==='AVG' ? (line.AB ? line.H/line.AB : null) : line[sort.key] ?? 0;
            return [{player,line:line ?? PFBSeason.statLine(),value}];
        }).sort((a,b)=>{
            if (a.value===null || b.value===null) {
                const missing=Number(a.value===null)-Number(b.value===null);
                if (missing) return missing;
            } else if (a.value!==b.value) {
                return sort.descending ? b.value-a.value : a.value-b.value;
            }
            return (arm ? b.line.PK-a.line.PK : b.line.H-a.line.H) || a.player.name.localeCompare(b.player.name,'ja');
        });
        const headers=cols.map(([key,name])=>{
            const active=key===sort.key;
            return `<th scope="col"${active?` aria-sort="${sort.descending?'descending':'ascending'}"`:''}><button type="button"
                class="stat-sort" data-season="stat-sort" data-id="${key}">${name}${active?` <span aria-hidden="true">${sort.descending?'▼':'▲'}</span>`:''}</button></th>`;
        }).join('');
        return `<div class="season-filters"><select id="season-stat-team" aria-label="成績の球団"><option value=""${statTeam?'':' selected'}>リーグ全体</option>${teams.map(team=>`<option value="${esc(team)}"${team===statTeam?' selected':''}>${teamLabel(team)}</option>`).join('')}</select>
        <select id="season-stat-type" aria-label="成績の種類">${[['hitting','公式戦 打撃'],['pitching','公式戦 投手'],['post-hitting','ポストシーズン 打撃'],['post-pitching','ポストシーズン 投手']].map(([value,name])=>`<option value="${value}"${value===statType?' selected':''}>${name}</option>`).join('')}</select></div>
        ${selected.length?'':'<p>表示できる成績はまだありません。</p>'}
        <div class="table-scroll"><table><thead><tr><th>選手</th><th>球団</th><th>上限</th>${headers}</tr></thead><tbody>${selected.map(({player:p,line})=>{
            return `<tr${p.team===season.team?' class="my-club"':''}><th scope="row">${esc(p.name)}</th><td>${teamLabel(p.team)}</td><td>${p.limit??'—'}</td>${cols.map(([key])=>{
                if(key==='AVG')return `<td>${line.AB?PFBSeason.rateText(line.H/line.AB):'—'}</td>`;
                return `<td>${key==='IP'?PFBResults.formatIP(line.IP):line[key]}</td>`;
            }).join('')}</tr>`;
        }).join('')}</tbody></table></div>`;
    }
    function news(){
        const latest=season.news.slice(0,36);
        const today=season.fixtures.filter(f=>f.day===season.day);
        return `<div class="season-news">
            <section><h3>${esc(PFBSeason.dayText(season.day))}の対戦</h3>${today.map(gameButton).join('')}</section>
            <section><h3>野球ニュース</h3>${latest.length?`<ol>${latest.map(item=>`<li><time>${esc(PFBSeason.dayText(item.day))}</time> ${esc(item.text)}${item.fixture?` <button type="button" data-season="report" data-id="${esc(item.fixture)}">試合結果</button>`:''}</li>`).join('')}</ol>`:'<p>開幕前</p>'}</section>
        </div>`;
    }
    function render(){
        const next=PFBSeason.fixture(season);
        const live=gameInst?.seasonMatch&&!gameInst.gameOver;
        document.getElementById('season-title').textContent=`PFB ペナント　${teamShort(season.team)}`;
        document.getElementById('season-summary').textContent=season.champion?`日本一　${teamShort(season.champion)}`:
            next?`${PFBSeason.dayText(next.day)}　${next.label || '公式戦'}`:'';
        const buttons=[['news','ニュース'],['calendar','日程'],['standings','順位'],['stats','個人成績']];
        document.getElementById('season-tab-list').innerHTML=buttons.map(([key,title])=>`<button type="button" data-season="tab" data-id="${key}" aria-pressed="${key===tab}">${title}</button>`).join('');
        document.getElementById('season-toolbar').innerHTML=live?'<button type="button" data-season="close">試合に戻る</button>':
            `<button type="button" data-season="next"${!next||busy?' disabled':''}>次の試合へ</button><button type="button" data-season="sim-day"${!next||busy?' disabled':''}>1日をAIで進める</button><button type="button" data-season="save">セーブ</button><button type="button" data-season="leave">開始画面に戻る</button>`;
        const selector=`<label class="season-league">リーグ <select id="season-league"><option value="CL"${dashboardLeague==='CL'?' selected':''}>セ・リーグ</option><option value="PL"${dashboardLeague==='PL'?' selected':''}>パ・リーグ</option></select></label>`;
        body().innerHTML=(['calendar','stats'].includes(tab)?selector:'')+({news,calendar,standings,stats:statTable})[tab]();
    }
    function profile(team){
        return PFBSeason.PROFILES[season.clubs[PFBSeason.leagueOf(team)].indexOf(team)%PFBSeason.PROFILES.length];
    }
    function recordGame(fixture,g){
        if(fixture.result || fixture.cancelled) return;
        PFBSeason.applyResult(season,fixture,g);
        autosave();
        if([fixture.away,fixture.home].includes(season.team)) downloadSave(fixture.day);
    }
    function finish(g){
        if(!season || !g.seasonMatch)return;
        const fixture=season.fixtures.find(f=>f.id===g.seasonMatch.id);
        if(fixture) recordGame(fixture,g);
    }
    function matchRecords(g) {
        if (!season || !g.seasonMatch) return null;
        const regular=g.seasonMatch.phase==='regular';
        const includeLive=!season.reports?.[g.seasonMatch.id] && g.finalReport?.official!==false;
        return {label:regular?'ペナント累計':'ポストシーズン累計',
            totals:regular?season.stats:season.postStats,includeLive};
    }
    function beginMatch(fixture){
        const home=fixture.home===season.team;
        const opponent=home?fixture.away:fixture.home;
        const plan={...PFBSeason.namedRoster(season,data,season.team,fixture.day,fixture),records:season.stats};
        const visitingPlan=PFBSeason.namedRoster(season,data,opponent,fixture.day);
        requireStartingRoster(opponent,visitingPlan);
        const rosters=home?[visitingPlan,plan]:[plan,visitingPlan];
        setup={away:fixture.away,home:fixture.home,humanSide:Number(home),versusAI:true,
            dome:PFBSeason.DOMES.has(onwardTeam(fixture.home))};
        close();
        openRosterSetup(Number(home),plan,selection=>{
            rosters[Number(home)]={...selection,profile:plan.profile};
            gameInst=PFBSeason.newGame(season,data,fixture,rosters);
            gameInst.versusAI=true;
            players=[...new Map([...data,...gameInst.lineups.flat(),...gameInst.benches.flat(),...gameInst.pitchers.flat().map(p=>p.row)].map(p=>[rowId(p),p])).values()];
            season.active=fixture.id;
            if(plan.starterUnavailable) fixture.starter=rowId(selection.starter);
            gameInst.logAdd(`試合開始　${teamShort(fixture.away)} 対 ${teamShort(fixture.home)}`,'l-inning');
            PFBSeason.rememberRoster(season,fixture.day,selection);
            startAtBat();
            autosave();
        },()=>show('news'));
    }
    async function advance(simDay){
        if(!season||busy||gameInst?.seasonMatch&&!gameInst.gameOver)return;
        const day=PFBSeason.fixture(season)?.day;
        if(day==null)return;
        busy=true;render();
        let failure;
        try{
            for(let count=0;count<season.fixtures.length;count++){
                const f=PFBSeason.fixture(season);
                if(!f || simDay&&f.day!==day)break;
                if(!simDay&&[f.away,f.home].includes(season.team)){beginMatch(f);break}
                recordGame(f,PFBSeason.simulate(PFBSeason.newGame(season,data,f)));
                if(!simDay&&f.day!==day)break;
                if(count%4===3)await new Promise(resolve=>setTimeout(resolve,0));
            }
            autosave();
        }catch(error){
            failure=error;
        }finally{
            busy=false;
            if(view().open){
                render();
                if(failure) document.getElementById('season-summary').textContent=failure.message;
            }
        }
    }
    function dispatch(target){
        const action=target.dataset.season;
        if(action==='tab'){show(target.dataset.id)}
        else if(action==='close'){close()}
        else if(action==='leave'){leave();gameInst=null;showTeamSelect()}
        else if(action==='next'||action==='sim-day'){void advance(action==='sim-day')}
        else if(action==='save'){save()}
        else if(action==='stat-sort'){
            const key=target.dataset.id;
            const current=statSort ?? {key:statType.endsWith('pitching')?'W':'AVG',descending:true};
            statSort={key,descending:current.key!==key || !current.descending};
            render();
            body().querySelector(`[data-season="stat-sort"][data-id="${key}"]`)?.focus();
        }
        else if(action==='month-prev'||action==='month-next'){month=Math.max(0,Math.min(11,month+(action==='month-next'?1:-1)));render()}
        else if(action==='report'){
            const report=season.reports[target.dataset.id];
            if(report)body().innerHTML=`<button type="button" data-season="tab" data-id="${esc(tab)}">戻る</button>${PFBResults.reportHtml(report)}${reportStandings()}${PFBResults.reportCreditHtml}`;
        }
    }
    view().addEventListener('click',event=>{const action=event.target.closest('button[data-season]');if(action&&!action.disabled)dispatch(action)});
    view().addEventListener('change',event=>{
        const starterFixture=event.target.dataset.starterFixture;
        if(starterFixture){
            const fixture=season.fixtures.find(f=>f.id===starterFixture);
            if(!fixture || fixture.id===season.active || fixture.result || fixture.cancelled || busy) return;
            if(event.target.value) fixture.starter=event.target.value;
            else delete fixture.starter;
            autosave();
            render();
            body().querySelector(`[data-starter-fixture="${CSS.escape(fixture.id)}"]`)?.focus();
            return;
        }
        if(event.target.id==='season-league'){dashboardLeague=event.target.value;statTeam=''}
        if(event.target.id==='season-stat-team') statTeam=event.target.value;
        if(event.target.id==='season-stat-type') {statType=event.target.value;statSort=null;}
        render();
    });
    return {active,stored,load,start,leave,show,finish,save,autosave,profile,matchRecords,reportStandings};
})();

const resumeSeason=document.getElementById('resume-season');
resumeSeason.hidden=!PFBSeasonUI.stored();
