'use strict';

const PFBOnlineCore=(()=>{
    const SEATS=['away','home'];
    function fingerprint(rows){
        let hash=2166136261;
        for(const row of rows){
            const value=JSON.stringify(row);
            for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
        }
        return (hash>>>0).toString(36);
    }
    function scopedRandom(room,fn){
        const old=diceRandom;
        diceRandom=()=>{room.rng=(Math.imul(room.rng,1664525)+1013904223)>>>0;return room.rng/4294967296};
        try { return fn(); } finally { diceRandom=old; }
    }
    function openPlate(game){
        game.preparePlate();
        game.autoPitChange(true);
        if(game.pending)return;
        if(game.called){game.gameOver=true;return}
        game.beginPitchingInning();
        game.state='defense';
    }
    function create(teams,rows,images,seed,forcedSubs=true){
        if(!teams||teams.away===teams.home||![teams.away,teams.home].every(team=>rows.filter(row=>row['チーム']===team).length>=25)){
            throw new Error('対戦する球団を選んでください。');
        }
        const room={teams,checksum:fingerprint(rows),seed:seed>>>0,rng:seed>>>0,actions:[],game:null};
        room.game=scopedRandom(room,()=>{
            const game=new Game(teams.away,rows,teams.home,undefined,PFBSeason.DOMES.has(onwardTeam(teams.home)));
            game.onlineMatch=true;
            game.manualForcedSubs=forcedSubs;
            game.logAdd(`オンライン対戦　${teamShort(teams.away)} 対 ${teamShort(teams.home)}`,'l-inning');
            openPlate(game);
            return game;
        });
        return room;
    }
    function actor(game){
        if(game.gameOver)return null;
        if(game.pending)return SEATS[game.pending.side];
        return SEATS[game.state==='defense'?game.defSide:game.batSide];
    }
    function choices(game){
        const g=game;
        if(g.gameOver)return [];
        if(g.pending)return g.pending.choices.map(([label],i)=>[label,`choice:${i}`,'bp']);
        if(g.state==='between')return [[g.outs>=3?'チェンジ':g.plateComplete?'次の打席':'打席を続ける','next','bp']];
        if(g.state==='offense'){
            const buttons=[ATTACK_ACTIONS[0]];
            if(g.bench.length&&!g.offenseLocked)buttons.push(ATTACK_ACTIONS[1]);
            if(g.pinchRunnerBases().length)buttons.push(PINCH_RUN_ACTION);
            if(g.canBunt(false)&&!g.buntContinuation?.squeeze)buttons.push(ATTACK_ACTIONS[2]);
            if(g.stealGroups().length)buttons.push(ATTACK_ACTIONS[3]);
            if(g.canEndRun())buttons.push(ATTACK_ACTIONS[4]);
            if(g.canBunt(true)&&(!g.buntContinuation||g.buntContinuation.squeeze))buttons.push(['スクイズ','squeeze','bw']);
            return buttons;
        }
        const buttons=[DEFENSE_ACTIONS[0],DEFENSE_ACTIONS[2]];
        if(g.bases[2])buttons.push(DEFENSE_ACTIONS[1]);
        if(g.bases.some(Boolean)&&g.pitcher.G>0)buttons.push(DEFENSE_ACTIONS[3]);
        if(g.canReplacePitcher()&&g.pitchers[g.defSide].some(p=>!p.isUsed))buttons.push(DEFENSE_ACTIONS[4]);
        if(g.defBench.length)buttons.push(DEFENSE_ACTIONS[5]);
        return buttons;
    }
    function afterPlay(g){
        g.resolveRemovedFielders();
        if(g.pending)return;
        if(g.outs<3&&!g.gameOver){
            g.checkSecondBase();
            if(g.pitcher.unavailable)g.autoPitChange();
            if(g.pending)return;
        }
        if(g.called)g.gameOver=true;
        if(g.gameOver||g.outs>=3)PFBSeason.saveHalfScore(g);
        g.state='between';
    }
    function run(g,action){
        if(g.pending){
            const option=g.pending.choices[Number(action.slice(7))];
            if(!action.startsWith('choice:')||!option)return false;
            const {beforePlate}=g.pending;
            g.pending=null;option[1]();
            if(beforePlate)openPlate(g);
            else afterPlay(g);
            return true;
        }
        if(action==='next'&&g.state==='between'){
            if(g.outs>=3){
                PFBSeason.advanceHalf(g);
                if(!g.gameOver)openPlate(g);
            }else if(g.plateComplete)openPlate(g);
            else g.state='offense';
            return true;
        }
        if(g.state==='defense'){
            const pitching=g.pitchers[g.defSide].filter(p=>!p.isUsed);
            const pitcher=action.match(/^chpitch:(\d+)$/);
            if(pitcher&&g.canReplacePitcher()&&pitching[Number(pitcher[1])]){
                g.replacePitcher(pitching[Number(pitcher[1])]);
                return true;
            }
            const sub=action.match(/^defsub:(\d+):(\d+)$/);
            if(sub&&g.defLineup[Number(sub[1])]&&g.defBench[Number(sub[2])]){
                g.substitute(g.defSide,Number(sub[1]),Number(sub[2]));return true;
            }
            if(action==='def_ibb'){
                g.logAdd(`${playerName(g.batter)}を敬遠`,'l-info',g.defSide);g.applyHitResult('BB',g.batter,'');g.nextBatter();afterPlay(g);return true;
            }
            if(!['def_normal','def_forward','def_steal'].includes(action)||!choices(g).some(([,a])=>a===action))return false;
            g.isForward=action==='def_forward';g.isCautious=action==='def_steal';
            g.logAdd(action==='def_forward'?'前進守備':action==='def_steal'?'盗塁警戒':'通常守備','l-info',g.defSide);
            g.state='offense';return true;
        }
        if(g.state!=='offense')return false;
        const pinch=action.match(/^pinch:(\d+)$/);
        if(pinch&&!g.offenseLocked&&g.bench[Number(pinch[1])]){
            g.substitute(g.batSide,g.batIdx[g.batSide],Number(pinch[1]));return true;
        }
        const pinchRun=action.match(/^prsub:([0-2]):(\d+)$/);
        if(pinchRun)return g.pinchRunner(Number(pinchRun[1]),Number(pinchRun[2]));
        const steal=action.match(/^steal:(\d+)$/);
        if(steal){
            const attempt=g.stealGroups()[Number(steal[1])];
            if(!attempt)return false;
            g.stealAttempted=g.offenseLocked=true;g.runSteal(attempt);afterPlay(g);return true;
        }
        if(!['hit','bunt','squeeze','hr'].includes(action)||!choices(g).some(([,a])=>a===action))return false;
        g.offenseLocked=true;
        g.processAtBat(action,g.isForward,action==='hr');afterPlay(g);return true;
    }
    function perform(room,teams,seat,name,args){
        if(name!=='play'||actor(room.game)!==seat||!Array.isArray(args)||args.length!==1||typeof args[0]!=='string'||args[0].length>40)return false;
        const accepted=scopedRandom(room,()=>run(room.game,args[0]));
        if(accepted)room.actions.push({seat,action:args[0]});
        return accepted;
    }
    function pack(room){
        return JSON.stringify({teams:room.teams,seed:room.seed,checksum:room.checksum,forcedSubs:room.game.manualForcedSubs,actions:room.actions});
    }
    function unpack(teams,rows,images,value){
        const parsed=JSON.parse(value);
        if(parsed.checksum!==fingerprint(rows))throw new Error('作成者と同じ Data_25.csv を読み込んでください。');
        const room=create(parsed.teams,rows,null,parsed.seed,parsed.forcedSubs===true);
        for(const {seat,action} of parsed.actions){
            if(!perform(room,room.teams,seat,'play',[action]))throw new Error('対戦の操作履歴を読み込めません。');
        }
        return room;
    }
    return {create,actor,choices,perform,pack,unpack,SEATS};
})();
