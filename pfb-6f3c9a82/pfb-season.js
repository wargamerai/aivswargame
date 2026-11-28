'use strict';

const PFBSeason = (() => {
    const VERSION = 1;
    const LEAGUES = {
        CL: {name:'セ・リーグ', clubs:['Tigers','Baystars','Giants','Dragons','Carp','Swallows']},
        PL: {name:'パ・リーグ', clubs:['Hawks','Fighters','Buffaloes','Eagles','Lions','Marines']}
    };
    const START_DAY = Date.UTC(2026,2,31);
    const DAY_MS = 86400000;
    const COLUMN=['G','PA','AB','H','2B','3B','HR','R','RBI','BB','HBP','SO','SH','SF','SB','CS','PG','GS','IP','BF','PH','PBB','PHBP','PK','PR','W','L','SV','SHOCK'];
    const PROFILES = [
        {name:'早めの継投', pen:4, attack:1, lateDefense:false, pinch:7},
        {name:'先発を信頼', pen:6, attack:0, lateDefense:false, pinch:8},
        {name:'リードを守る', pen:5, attack:0, lateDefense:true, pinch:8},
        {name:'打撃を優先', pen:5, attack:2, lateDefense:false, pinch:6}
    ];
    const NAMES = {Tigers:'阪神',Baystars:'DeNA',Giants:'巨人',Dragons:'中日',Carp:'広島',Swallows:'ヤクルト',
        Hawks:'ソフトバンク',Fighters:'日本ハム',Buffaloes:'オリックス',Eagles:'楽天',Lions:'西武',Marines:'ロッテ'};
    const DOMES = new Set(['Giants','Dragons','Hawks','Fighters','Buffaloes','Lions']);

    const suffix = team => String(team).trim().split(/\s+/).at(-1);
    const nameOf = team => NAMES[suffix(team)] || team;
    const leagueOf = team => Object.keys(LEAGUES).find(key => LEAGUES[key].clubs.includes(suffix(team)));
    const dateOf = day => new Date(START_DAY + day * DAY_MS);
    const dayText = day => dateOf(day).toLocaleDateString('ja-JP',{timeZone:'UTC',month:'numeric',day:'numeric',weekday:'short'});
    const playDay = day => dateOf(day).getUTCDay() === 1 ? day+1 : day;
    const idOf = row => row?._seasonId || (row ? String(row.Index) : '');
    const real = row => Boolean(row?.['チーム']) && !row._anonymous;
    const limit = row => real(row) ? Math.max(0,Number(row['試合数']) || 0) : Infinity;
    const rowName = row => row?.['氏名'] || '';
    const escape = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const statLine = () => Object.fromEntries(COLUMN.map(key => [key,0]));
    const standingsLine = () => ({w:0,l:0,t:0,r:0,ra:0});
    const percent = (n,d) => d ? n/d : 0;
    const rateText = value => value.toFixed(3).replace(/^0\./,'.');

    function teamsIn(data,key) {
        const found = new Map(data.filter(real).map(row => [suffix(row['チーム']),row['チーム']]));
        return LEAGUES[key].clubs.map(club => found.get(club)).filter(Boolean);
    }

    function leagueCalendar(teams,league) {
        const games = [];
        let rotation = [...teams];
        const rounds = [];
        for (let round = 0; round < 5; round++) {
            rounds.push(Array.from({length:3},(_,index) => [rotation[index],rotation[5-index]]));
            rotation = [rotation[0],rotation.at(-1),...rotation.slice(1,-1)];
        }
        for (let block = 0; block < 45; block++) {
            const cycle = Math.floor(block/5);
            const start = Math.floor(block/2)*7 + (block%2)*3;
            const length = cycle === 8 ? 2 : 3;
            for (let day = 0; day < length; day++) {
                for (const [index,pair] of rounds[block%5].entries()) {
                    const flip=(cycle+index+block%5)%2===1;
                    const [away,home] = flip ? [...pair].reverse() : pair;
                    games.push({id:`${league}-${block}-${day}-${index}`,league,phase:'regular',day:start+day,away,home});
                }
            }
        }
        return games;
    }

    function create(data,league,team) {
        const clubs = {CL:teamsIn(data,'CL'),PL:teamsIn(data,'PL')};
        if (clubs.CL.length !== 6 || clubs.PL.length !== 6 || !clubs[league]?.includes(team)) {
            throw new Error('12球団がそろった選手データCSVを読み込んでください。');
        }
        const days = [...leagueCalendar(clubs.CL,'CL'),...leagueCalendar(clubs.PL,'PL')].sort((a,b) => a.day-b.day);
        return {version:VERSION,league,team,clubs,day:0,fixtures:days,stage:'regular',
            champion:null,leagueChampions:{},series:{},stats:{},postStats:{},usage:{},injuries:{},
            pitching:{},longInjuries:{},news:[],records:{},reports:{},pitchTotals:{},postPitchTotals:{},playerInfo:{},active:null};
    }

    function rank(season,league) {
        const order = season.clubs[league].map(team => [team,season.records[team] || standingsLine()]);
        return order.sort((a,b) => percent(b[1].w,b[1].w+b[1].l) - percent(a[1].w,a[1].w+a[1].l) ||
            b[1].w-a[1].w || headToHead(season,b[0],a[0]) - headToHead(season,a[0],b[0]) ||
            b[1].r-b[1].ra-(a[1].r-a[1].ra));
    }

    function headToHead(season,team,opponent) {
        let wins = 0;
        for (const game of season.fixtures) {
            if (game.phase !== 'regular' || !game.result) continue;
            const {away,home,result:[a,h]} = game;
            if (home === team && away === opponent && h>a || away === team && home === opponent && a>h) wins++;
        }
        return wins;
    }

    function fixture(season) {
        return season.fixtures.find(game => !game.result && !game.cancelled && !game.skipped);
    }

    function seriesFixture(season,series,day) {
        const index = series.played;
        const home = series.stage === '日本シリーズ' && index >= 2 && index <= 4 ? series.challenger : series.host;
        const game = {id:`${series.id}-${index+1}`,league:series.league,phase:series.id,
            label:`${series.stage} 第${index+1}戦`,day:playDay(day),home,
            away:home === series.host ? series.challenger : series.host,noDraw:series.stage === '日本シリーズ' && index >= 7};
        season.fixtures.push(game);
    }

    function openSeries(season,id,league,stage,host,challenger,day,advantage = 0,required = 2,max = 3) {
        const series = {id,league,stage,host,challenger,hostWins:advantage,awayWins:0,required,max,played:0,winner:null};
        season.series[id] = series;
        seriesFixture(season,series,day);
    }

    function gb(leader,row) {
        return ((leader.w-row.w)+(row.l-leader.l))/2;
    }

    function finishRound(season,game) {
        const series = season.series[game.phase];
        if (!series) return;
        const [away,home]=game.result;
        const winner = away === home ? null : away>home ? game.away : game.home;
        if (winner === series.host) series.hostWins++;
        if (winner === series.challenger) series.awayWins++;
        series.played++;
        const clinched = series.hostWins >= series.required || series.awayWins >= series.required;
        const locked = series.played >= series.max || series.hostWins >= series.awayWins + series.max - series.played;
        if (!clinched && (series.stage === '日本シリーズ' || !locked)) {
            const breakDay = series.stage === '日本シリーズ' && [2,5].includes(series.played) ? 2 : 1;
            seriesFixture(season,series,game.day+breakDay);
            return;
        }
        series.winner = series.hostWins >= series.awayWins ? series.host : series.challenger;
        season.news.unshift({day:game.day,text:`${nameOf(series.winner)}が${series.stage}を制す`});
        if (series.stage === 'CSファースト') {
            const ranked = rank(season,series.league);
            const lead = ranked[0];
            const rival = ranked.find(([team]) => team === series.winner);
            const extra = gb(lead[1],rival[1]) >= 10 || percent(rival[1].w,rival[1].w+rival[1].l) < .5;
            openSeries(season,`${series.league}-final`,series.league,'CSファイナル',lead[0],series.winner,game.day+3,extra?2:1,extra?5:4,extra?7:6);
        } else if (series.stage === 'CSファイナル') {
            season.leagueChampions[series.league] = series.winner;
        } else {
            season.champion = series.winner;
            season.stage = 'complete';
        }
    }

    function advanceSchedule(season) {
        season.fixtures.sort((a,b) => a.day-b.day || a.id.localeCompare(b.id));
        const next = fixture(season);
        if (next) { season.day = next.day; return; }
        const nextDay = Math.max(season.day,...season.fixtures.map(game => game.day)) + 4;
        if (season.stage === 'regular') {
            season.stage = 'cs';
            for (const league of ['CL','PL']) {
                const ranked = rank(season,league);
                openSeries(season,`${league}-first`,league,'CSファースト',ranked[1][0],ranked[2][0],nextDay);
            }
        } else if (season.stage === 'cs' && season.leagueChampions.CL && season.leagueChampions.PL) {
            season.stage = 'japan';
            openSeries(season,'japan','日本','日本シリーズ',season.leagueChampions.CL,season.leagueChampions.PL,nextDay,0,4,Infinity);
            season.series.japan.max = null;
        }
        const dated = fixture(season);
        if (dated) season.day = dated.day;
    }

    function pitchedRest(row,innings,started,batters) {
        const stats = extractPitcherStats(row);
        const stamina = Number(stats.S);
        const rest = Math.max(started ? 4 : 0,Number(stats.I) || 0);
        if (!started && batters <= 1) return 0;
        if (innings <= stamina/3) return Math.floor(rest/3*2)/2;
        if (innings <= stamina/2) return Math.floor(rest/2*2)/2;
        if (innings < stamina) return Math.max(0,rest-(stamina-innings)*.5);
        return rest + Math.max(0,innings-stamina*(started?2:1));
    }

    function updateSavedPitching(season,data) {
        const legacy=new Map(data.filter(row=>isPitcher(row) && season.pitching[idOf(row)] &&
            !season.pitching[idOf(row)].countedOuts).map(row=>[idOf(row),row]));
        if (!legacy.size) return;
        const appearances=new Map();
        for (const game of season.fixtures) {
            for (const pitcher of season.reports?.[game.id]?.pitchers||[]) {
                const row=legacy.get(pitcher.id);
                if (!row || !Number.isFinite(pitcher.outs)) continue;
                const prev=season.pitching[pitcher.id];
                if (game.day>prev.day || game.day<=prev.day-prev.chain) continue;
                if (!appearances.has(pitcher.id)) appearances.set(pitcher.id,[]);
                appearances.get(pitcher.id).push({...pitcher,day:game.day});
            }
        }
        for (const [id,games] of appearances) {
            const prev=season.pitching[id];
            const latest=games.find(game=>game.day===prev.day);
            if (!latest || games.length!==prev.chain) continue;
            prev.innings=games.reduce((outs,game)=>outs+game.outs,0)/3;
            // Older reports did not store batters faced. Preserve an existing one-batter rest allowance.
            const batters=prev.rest<=prev.penalty ? 1 : 2;
            prev.rest=pitchedRest(legacy.get(id),prev.innings,latest.started,batters)+prev.penalty;
            prev.countedOuts=true;
        }
    }

    function readyPitcher(season,row,day) {
        const prev = season.pitching[idOf(row)];
        if (!prev) return {adjust:real(row) ? .3 : 0, previousInnings:0, penalty:0};
        if (row._anonymous) return {adjust:0,previousInnings:0,penalty:0};
        const rest = day-prev.day-1-Math.max(0,Math.min(day,season.injuries[idOf(row)]?.until || 0)-Math.max(prev.day+1,season.injuries[idOf(row)]?.from || 0));
        const short = Number((prev.rest-rest).toFixed(1));
        if (short>1) return null;
        return {adjust:short===1?-.3:short<=-1.5?.3:0,previousInnings:rest===0?prev.innings:0,penalty:short>0&&rest>0?.5:short>0&&prev.chain===1?.5:0};
    }

    function available(season,row,day) {
        const id=idOf(row);
        return (season.usage[id] || 0) < limit(row) && (season.injuries[id]?.until || 0) <= day &&
            (!isPitcher(row) || readyPitcher(season,row,day));
    }

    let defaultAnonymousCards;
    function anonymous(data,team,role,number) {
        const ids = {P:[501,502],C:[503,504],IF:[505,506],OF:[507,508]};
        const template = ids[role][number%2];
        let source = data.find(row => Number(row.Index) === template);
        if (!source) {
            defaultAnonymousCards ??= parseCSV(new TextDecoder('shift-jis').decode(
                Uint8Array.from(atob(PFB_DEFAULT_CSV_BASE64), value=>value.charCodeAt(0))))
                .filter(row=>Number(row.Index)>=501&&Number(row.Index)<=508);
            source=defaultAnonymousCards.find(row=>Number(row.Index)===template);
        }
        const id=`${team}/${role}/${number+1}`;
        const row={...source,Index:id,'チーム':team,_anonymous:'1',_seasonId:id};
        const order = role === 'P' ? number : number * 3 + {C:0,IF:1,OF:2}[role];
        const name = ['一郎','次郎','三郎','四郎','五郎','六郎','七郎','八郎','九郎','十郎','十一郎','十二郎'][order] || `${order+1}郎`;
        row['氏名'] = (role === 'P' ? '球' : '無名') + name;
        if (role === 'OF' && ![1,2,3,4,5,6,7].some(i => row[DEF_COL(i)]?.startsWith('OF='))) {
            row[DEF_COL(2)] = 'OF=2';
        }
        if (role === 'IF') {
            for (const [index,pos] of ['1B','2B','3B','SS'].entries()) row[DEF_COL(index+1)] = pos+'=2';
        }
        return row;
    }

    function yesterdayStarter(season,team,day) {
        if (team===season.team && season.lastRoster?.day===day-1) return season.lastRoster.starter;
        // Older saves already record the starter in each official game's report.
        const game=season.fixtures.find(f=>f.day===day-1 && f.result && (f.away===team || f.home===team));
        return game && season.reports?.[game.id]?.pitchers.find(p=>p.team===team && p.started)?.id;
    }

    function starterStamina(row) {
        return Number(extractPitcherStats(row).S)>=4;
    }

    function rememberRoster(season,day,{selected,lineup,starter,positions}) {
        season.lastRoster={day,selected:selected.map(idOf),lineup:lineup.map(idOf),starter:idOf(starter),
            positions:Object.fromEntries(Object.entries(positions).map(([pos,row])=>[pos,idOf(row)]))};
    }

    function namedRoster(season,data,team,day,scheduledGame=null,forSchedule=false) {
        const restingStarter=yesterdayStarter(season,team,day);
        const registered=scheduledGame?.starter;
        const reserved=new Set(scheduledGame&&!forSchedule ? season.fixtures
            .filter(game=>game.day>=day&&game.id!==scheduledGame.id&&!game.result&&!game.cancelled&&!game.skipped&&
                (game.away===team||game.home===team))
            .map(game=>game.starter).filter(id=>id&&id!==registered) : []);
        const regular=data.filter(row=>real(row)&&row['チーム']===team&&idOf(row)!==restingStarter&&
                !reserved.has(idOf(row))&&available(season,row,day))
            .sort((a,b)=>Number(b['試合数'])-Number(a['試合数']));
        const replacements=Object.entries({C:2,IF:4,OF:3,P:2}).flatMap(([role,count])=>
            Array.from({length:count},(_,number)=>anonymous(data,team,role,number)))
            .filter(row=>idOf(row)!==restingStarter&&!reserved.has(idOf(row))&&available(season,row,day));
        const pool=[...regular,...replacements];
        const bats=regular.filter(row=>!isPitcher(row));
        const pits=regular.filter(isPitcher);
        const replacementBats=replacements.filter(row=>!isPitcher(row));
        const starterCandidates=pool.filter(isPitcher).filter(row=>{
            const form=readyPitcher(season,row,day);
            return starterStamina(row)&&form.previousInnings===0&&form.adjust>=0&&form.penalty===0;
        });
        const listed=starterCandidates.find(row=>idOf(row)===registered);
        const starter=registered ? listed||null : starterCandidates[0]||null;
        const starterUnavailable=Boolean(registered&&!listed);
        const registeredName=[...data,...replacements].find(row=>row['チーム']===team&&idOf(row)===registered);
        const previous=team===season.team ? season.lastRoster : null;
        const byId=new Map(pool.map(row=>[idOf(row),row]));
        const warnings=[];
        if (starterUnavailable) {
            const name=registeredName ? displayName(registeredName) : '登録した投手';
            warnings.push(`予定先発の${name}は登板できません。先発を選び直してください。`);
        }
        if (!starterCandidates.length) warnings.push('登板可能な先発投手がいません。');
        if (bats.length+replacementBats.length<9) warnings.push('打順に入れる野手が9人いません。');

        let lineup,positions,selected;
        if (previous) {
            const missing=[];
            lineup=previous.lineup.map((id,index)=>{
                const row=byId.get(id);
                if (!row) missing.push(index+1);
                return row||null;
            });
            if (missing.length) warnings.push(`前回の打順の${missing.join('・')}番に出場できない選手がいます。空欄の野手を選び直してください。`);
            positions=Object.fromEntries(Object.entries(previous.positions||{})
                .map(([pos,id])=>[pos,byId.get(id)]).filter(([,row])=>row&&lineup.includes(row)));
            selected=[...new Set([starter,...lineup,...previous.selected.map(id=>byId.get(id))].filter(Boolean))].slice(0,25);
        } else {
            positions=assignFieldPositions(bats,{}, {allowUnqualified:false});
            positions=assignFieldPositions([...bats,...replacementBats],positions,{allowUnqualified:false});
            const vacant=FIELD_POSITIONS.filter(pos=>!positions[pos]);
            if (vacant.length) warnings.push(`守備に入れる野手が足りません（${vacant.map(pos=>FNAME[pos]).join('・')}）。`);
            const fielders=Object.values(positions);
            const lineupPool=[...bats,...replacementBats];
            const dh=lineupPool.find(row=>!fielders.includes(row));
            lineup=lineupPool.filter(row=>fielders.includes(row)||row===dh);
            const reserves=bats.filter(row=>!lineup.includes(row)).slice(0,14-lineup.length);
            selected=[...lineup,...reserves,starter,...pits.filter(row=>row!==starter)].filter(Boolean).slice(0,25);
            selected.push(...bats.filter(row=>!selected.includes(row)).slice(0,25-selected.length));
        }
        const profile=PROFILES[season.clubs[leagueOf(team)].indexOf(team)%PROFILES.length];
        return {pool,selected,lineup,positions,starter,starterCandidates,profile,starterUnavailable,warnings,
            registeredName:registeredName?displayName(registeredName):'',fixedStarter:Boolean(listed),restored:Boolean(previous)};
    }

    // Unattended fixtures between other clubs use the league's existing replacement players.
    function roster(season,data,team,day) {
        const pool=data.filter(row=>row['チーム']===team&&available(season,row,day))
            .sort((a,b)=>Number(b['試合数'])-Number(a['試合数']));
        const names=new Map();
        function add(role) {
            const number=names.get(role)||0;
            names.set(role,number+1);
            return anonymous(data,team,role,number);
        }
        const bats=pool.filter(row=>!isPitcher(row));
        const pits=pool.filter(isPitcher);
        const selected=[];
        const positions={};
        for (const pos of FIELD_POSITIONS) {
            const role=pos==='C'?'C':OUTFIELD.includes(pos)?'OF':'IF';
            const qualified=bats.filter(row=>!selected.includes(row)&&fieldCard(row,pos).rating>0);
            const pick=qualified.find(row=>fieldCard(row,pos).preference===3)||qualified[0]||add(role);
            if (!bats.includes(pick)) bats.push(pick);
            positions[pos]=pick;
            selected.push(pick);
        }
        while (bats.length<14) bats.push(add(bats.length===13?'C':'IF'));
        while (pits.length<11) pits.push(add('P'));
        if (!pits.some(starterStamina)) pits.push(add('P'));
        const starter=pits.find(row=>real(row)&&starterStamina(row)&&(readyPitcher(season,row,day)?.previousInnings||0)===0)||
            pits.find(row=>real(row)&&starterStamina(row))||pits[0];
        const chosenBats=[...selected,...bats.filter(row=>!selected.includes(row))].slice(0,14);
        const chosenPits=[starter,...pits.filter(row=>row!==starter)].slice(0,11);
        const profile=PROFILES[season.clubs[leagueOf(team)].indexOf(team)%PROFILES.length];
        const lineup=chosenBats.slice(0,9).sort((a,b)=>Number(b['試合数'])-Number(a['試合数'])||
            (profile.attack===2 ? Number(getVal(b.HR,2))-Number(getVal(a.HR,2)) : 0));
        return {selected:[...chosenBats,...chosenPits],lineup,starter,positions,profile};
    }

    function newGame(season,data,game,rosters) {
        const teams=[game.away,game.home];
        const ownGame=teams.includes(season.team);
        const selected=rosters || teams.map(team=>ownGame
            ? namedRoster(season,data,team,game.day,team===season.team?game:null)
            : roster(season,data,team,game.day));
        if (ownGame&&!rosters) {
            const plan=selected[teams.indexOf(season.team)];
            if (plan.warnings.length||plan.selected.length>25) {
                throw new Error([...plan.warnings, '「次の試合へ」で選手を確認し、編成してください。'].join(' '));
            }
        }
        for (const team of selected) {
            team.pitchForms = Object.fromEntries(team.selected.filter(isPitcher)
                .map(row => [idOf(row),readyPitcher(season,row,game.day)]));
        }
        const g=new Game(game.away,data,game.home,selected,DOMES.has(suffix(game.home)));
        g.seasonMatch={id:game.id,day:game.day,phase:game.phase,noDraw:Boolean(game.noDraw),date:dayText(game.day),label:game.label || LEAGUES[game.league].name};
        g.longInjuries=season.longInjuries;
        g.humanSide=[game.away,game.home].indexOf(season.team);
        g.profiles=selected.map(team=>team.profile);
        for (let side=0;side<2;side++) {
            const lineup=g.lineups[side];
            g.positions[side]=selected[side].positions || assignFieldPositions(lineup);
        }
        return g;
    }

    const BAT_COLUMNS={pa:'PA',ab:'AB',h:'H',hr:'HR',bb:'BB',k:'SO',doubles:'2B',triples:'3B',hbp:'HBP',
        sh:'SH',sf:'SF',r:'R',rbi:'RBI',sb:'SB',cs:'CS'};
    function collectStats(season,game,g,report) {
        const ledger=game.phase==='regular'?season.stats:season.postStats;
        const ownRows=new Map([...g.lineups.flat(),...g.benches.flat(),...g.removed,...g.pitchers.flat().map(p=>p.row)]
            .map(row=>[idOf(row),row]));
        const used=[...new Set([...g.appearances,...report.pitchers.map(p=>p.id)])];
        for (const id of used) {
            const player=ownRows.get(id);
            if(!player)continue;
            const total=ledger[id] ||= statLine();
            total.G++;
            season.usage[id]=(season.usage[id]||0)+1;
            season.playerInfo[id]={name:rowName(player),team:player['チーム'],anonymous:Boolean(player._anonymous),limit:real(player)?limit(player):null};
            for (const [stat,column] of Object.entries(BAT_COLUMNS)) total[column]+=g.matchStats[id]?.[stat]||0;
        }
        for (const pitcher of report.pitchers) {
            const total=ledger[pitcher.id] ||= statLine();
            total.PG++;
            total.GS+=Number(pitcher.started);
            const arm=g.pitchers.flat().find(p=>String(p.row.Index)===pitcher.id);
            total.BF+=arm?.facedBatters || 0;
            for (const [key,column] of Object.entries({outs:'IP',h:'PH',bb:'PBB',hbp:'PHBP',k:'PK',r:'PR',w:'W',l:'L',sv:'SV'})) {
                total[column]+=pitcher[key]||0;
            }
        }
    }

    function simulate(g) {
        g.isAuto=true;
        for(let step=0;step<1800&&!g.gameOver&&!g.called;step++){
            if(g.plateComplete)g.preparePlate();
            g.autoPitChange();
            if(g.called)break;
            g.beginPitchingInning();
            const profile=g.profiles[g.defSide];
            const lead=g.scores[g.defSide]-g.scores[g.batSide];
            if(g.canReplacePitcher() && g.pitcher.facedBatters>=1 &&
                (g.pitcher.shock===2 || g.pitcher.fatigued && (g.inning>=profile.pen || g.pitcher.runsAllowed>=4) ||
                    g.pitcher.runsAllowed>=profile.pen && g.inning>=5)) {
                const next=g.pitchers[g.defSide].filter(p=>!p.isUsed)
                    .sort((a,b)=>Number(b.row['試合数']||0)-Number(a.row['試合数']||0))[0];
                if(next)g.replacePitcher(next);
            }
            if(g.inning===8 && g.outs===0 && profile.lateDefense && lead>0 && g.fielderChangeInning!==g.inning){
                improveDefense(g);
                g.fielderChangeInning=g.inning;
            }
            const attack=g.profiles[g.batSide];
            if(!g.offenseLocked && !g.stealAttempted && !g.buntContinuation && g.inning>=attack.pinch && lead>=0 && lead<=3){
                const power=row=>getVal(row['1H'],g.pitcher.G);
                const best=g.bench.findIndex(row=>power(row)>=power(g.batter)+8);
                if(best>=0){g.substitute(g.batSide,g.batIdx[g.batSide],best);g.offenseLocked=true}
            }
            g.isForward=Boolean(g.bases[2]&&g.outs<2&&g.inning>=6&&Math.abs(lead)<=1);
            g.isCautious=!g.isForward&&Boolean(g.bases[0]&&!g.bases[1]&&Number(g.bases[0].S2)>=82&&g.pitcher.G>0);
            const steal=g.stealGroups().find(group=>group.length===1&&group[0].from===0&&
                Number(group[0].runner.S2)+g.catcherT()>=72);
            if(steal && lead<=1 && lead>=-1 && attack.attack>0 && d10()<=2){
                g.stealAttempted=true;
                g.runSteal(steal);
            }else if(!g.buntContinuation&&g.canBunt(false)&&g.outs===0&&g.inning>=7&&lead>=0&&lead<=1&&attack.attack<2){
                g.processAtBat('bunt');
            }else if(g.canEndRun()&&g.bases[0]&&Number(g.bases[0].S2)>=75&&g.outs<2&&attack.attack>0&&d10()===1){
                g.processAtBat('hit',g.isForward,true);
            }else g.processAtBat('hit');
            g.checkSecondBase();
            if(g.outs>=3) advanceHalf(g);
        }
        if(!g.gameOver&&!g.called)throw new Error('自動試合を最後まで処理できませんでした。');
        saveHalfScore(g);
        return g;
    }

    function improveDefense(g) {
        for(const [pos,row] of Object.entries(g.defPositions)){
            const current=fieldCard(row,pos).rating;
            const better=g.defBench.findIndex(other=>fieldCard(other,pos).rating>=current+2);
            if(better>=0){g.substitute(g.defSide,g.defLineup.indexOf(row),better);return true}
        }
        return false;
    }

    function saveHalfScore(g) {
        if(g.innScores[g.batSide].length>=g.inning)return;
        const prior=g.innScores[g.batSide].reduce((n,score)=>n+(score||0),0);
        g.innScores[g.batSide][g.inning-1]=g.scores[g.batSide]-prior;
    }

    function advanceHalf(g) {
        saveHalfScore(g);
        g.endPitchingInning();
        g.outs=0;g.bases=[null,null,null];g.responsible=Object.create(null);g.stealBlocked.clear();
        g.endRunUsed=false;g.preparePlate();
        if(g.half===0){
            if(g.inning>=9&&g.scores[1]>g.scores[0])g.gameOver=true;
            else g.half=1;
        }else if(g.inning>=9&&(g.scores[0]!==g.scores[1]||g.inning>=12&&!g.seasonMatch?.noDraw)){
            g.gameOver=true;
        }else{g.half=0;g.inning++}
    }

    function applyResult(season,game,g) {
        if (game.result || game.cancelled) return;
        season.active=null;
        const report=PFBResults.record(g,{season:true,date:dayText(game.day),label:game.label||LEAGUES[game.league]?.name});
        const official=report.official;
        const rows=new Map([...g.lineups.flat(),...g.benches.flat(),...g.removed,...g.pitchers.flat().map(p=>p.row)].map(row=>[idOf(row),row]));
        for (const event of g.injuryEvents) {
            const row=rows.get(event.id);
            const info=row?{name:rowName(row),team:row['チーム']}:null;
            const eventText=info ? `${nameOf(info.team)} ${info.name}` : '';
            const details=event.kind==='shock' ? (event.permanent?'回復不能の一時ショック':'一時ショック') :
                event.days ? `${event.kind==='eject'?'出場停止':'負傷'}・${event.days}日` : event.kind==='eject'?'退場':'負傷退場';
            if (eventText) season.news.unshift({day:game.day,text:`${eventText}　${details}`});
            if (event.days) season.injuries[event.id]={from:game.day+1,until:game.day+event.days+1};
            if(event.long)season.longInjuries[event.id]=true;
        }
        if (!official) {
            game.cancelled=true;
            season.news.unshift({day:game.day,text:`${nameOf(game.away)}－${nameOf(game.home)}　試合不成立・振替`});
            let day=playDay(game.day+1);
            while (season.fixtures.some(f => !f.cancelled && (f.away===game.away || f.home===game.away || f.away===game.home || f.home===game.home) && f.day===day)) day=playDay(day+1);
            season.fixtures.push({...game,id:game.id+'r',day,cancelled:false});
            advanceSchedule(season);
            return;
        }
        game.result=[...g.scores];
        const [away,home]=game.result;
        if (game.phase==='regular') {
            for (const [team,runs,against] of [[game.away,away,home],[game.home,home,away]]) {
                const line=season.records[team] ||= standingsLine();
                line[runs>against?'w':runs<against?'l':'t']++;
                line.r+=runs; line.ra+=against;
            }
        }
        collectStats(season,game,g,report);
        const totals=game.phase==='regular'?season.pitchTotals:season.postPitchTotals;
        PFBResults.addToTotals(totals,report);
        PFBResults.applyTotals(report,totals);
        season.reports[game.id]=report;
        const ledger=game.phase==='regular'?season.stats:season.postStats;
        for(const event of g.injuryEvents){
            if(event.kind==='shock'&&ledger[event.id])ledger[event.id].SHOCK++;
        }
        for (const pitcher of g.pitchers.flat().filter(p=>p.isUsed)) {
            const row=pitcher.row;
            const id=idOf(row);
            const previous=season.pitching[id];
            const consecutive=previous?.day===game.day-1;
            const innings=pitcher.outsPitched/3+(consecutive?previous.innings:0);
            const chain=consecutive?previous.chain+1:1;
            const penalty=(consecutive?previous.penalty:0)+(pitcher.form?.penalty || 0);
            season.pitching[id]={day:game.day,innings,chain,penalty,countedOuts:true,
                rest:pitchedRest(row,innings,pitcher.isStarter,pitcher.facedBatters)+penalty};
        }
        if (game.phase!=='regular') finishRound(season,game);
        season.news.unshift({day:game.day,fixture:game.id,text:`${game.label || LEAGUES[game.league].name}　${nameOf(game.away)} ${away}－${home} ${nameOf(game.home)}`});
        advanceSchedule(season);
    }

    return {VERSION,LEAGUES,PROFILES,COLUMN,teamsIn,nameOf,leagueOf,dayText,dateOf,idOf,limit,escape,rateText,percent,
        statLine,standingsLine,create,rank,gb,fixture,applyResult,namedRoster,rememberRoster,starterStamina,updateSavedPitching,newGame,readyPitcher,available,DOMES,simulate,improveDefense,advanceHalf,saveHalfScore};
})();
