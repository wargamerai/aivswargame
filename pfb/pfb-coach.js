'use strict';

const PFBMatchCoach=(()=>{
    const input=document.getElementById('match-coach');
    const option=document.getElementById('coach-option');
    const note=document.getElementById('coach-advice');
    let currentMenu=null;
    let lastHalf=null;
    const shown=new Map();

    function offense(g,actions,gap) {
        const [,second,third]=g.bases;
        if (gap<=1 && actions.has('steal_menu')) {
            const cautious=g.isCautious || (g.waitingForCpuDefense && !third &&
                g.bases[0] && !second && Number(g.bases[0].S2)>=80 && g.pitcher.G>0);
            const scouts=g.stealGroups().filter(group=>group.length===1).map(([runner])=>runner)
                .filter(({from})=>from===0 && !third || from===1 && g.outs<2)
                .map(attempt=>({attempt,start:stealStartValue(attempt,g.pitcher,cautious),
                    success:stealSuccessValue(attempt,g.catcherT(),{cautious})}))
                .filter(({attempt,start,success})=>(attempt.runner['走']==='F' || Number(attempt.runner.S2)>=90) && start>=4 && success>=80)
                .sort((a,b)=>b.success-a.success || b.start-a.start);
            if (scouts.length) {
                const {runner,from}=scouts[0].attempt;
                return `${displayName(runner)}の${from+2}盗を検討。足を生かして得点圏を広げられます。`;
            }
        }
        if (actions.has('pinch')) {
            const hitValue=row=>{
                const left=g.pitcher.arm.startsWith('左投') && handedness(row,true)==='左打';
                const grade=Math.min(4,Math.max(0,g.pitcher.G+Number(left)+Number(g.pitcher.isRelief&&!g.pitcher.facedBatters)-
                    Number(g.isCautious)+Number(g.startFailed || g.buntContinuation?.twoStrikes || false)));
                return getVal(row['1H'],grade);
            };
            const batterValue=hitValue(g.batter);
            const candidate=g.bench.map(row=>({row,value:hitValue(row)})).sort((a,b)=>b.value-a.value)[0];
            if (candidate && candidate.value>=batterValue+8) {
                return `代打に${displayName(candidate.row)}を検討。この投手に対して安打を狙いやすいカードです。`;
            }
        }
        if (gap<=1 && g.outs<2 && actions.has('squeeze') && g.buntStrength(true)>=4 && !g.buntContinuation) {
            return `三塁走者を返すなら、バントが得意な${displayName(g.batter)}でスクイズを検討。`;
        }
        if (gap<=1 && g.outs===0 && !second && !third && actions.has('bunt') &&
            g.buntStrength(false)>=3 && !g.buntContinuation) {
            return `${displayName(g.batter)}に送りバントを検討。一塁走者を得点圏へ進められます。`;
        }
        return '';
    }

    function defense(g,actions,lead) {
        const pitcher=g.pitcher;
        const remaining=pitcher.staminaRemaining;
        const needsRelief=remaining<=0 || pitcher.shock>0;
        const leftBatter=handedness(g.batter,true)==='左打';
        const sameHand=p=>leftBatter && p.arm.startsWith('左投');
        if (actions.has('def_pitcher') && (needsRelief || leftBatter && !sameHand(pitcher))) {
            const current=Math.min(4,pitcher.G+Number(sameHand(pitcher))+Number(pitcher.isRelief&&!pitcher.facedBatters));
            const available=g.pitchers[g.defSide].filter(p=>!p.isUsed && !p.unavailable && (needsRelief || sameHand(p)))
                .map(p=>({p,grade:Math.min(4,Math.max(0,p.cardG+(p.form?.adjust || 0)+1+Number(sameHand(p))))}))
                .filter(({grade})=>grade>=current)
                .sort((a,b)=>b.grade-a.grade || Number(sameHand(b.p))-Number(sameHand(a.p)) || b.p.cardC-a.p.cardC);
            if (available.length) {
                const next=available[0].p;
                const nextName=displayName(next.row);
                let reason=leftBatter && sameHand(next) ? '左打者には左投手の有利な補正があります。' : '';
                if (pitcher.fatigued) reason='疲労で投手のグレードが下がっています。';
                else if (pitcher.shock>0) reason='投手がショック状態です。';
                else if (remaining<=0) reason='投手がスタミナの上限に達しています。';
                return `${reason}${nextName}への継投を検討。`;
            }
        }
        if (lead<=1 && g.bases[2] && g.outs<2 && actions.has('def_forward')) {
            return '三塁走者の生還を防ぐなら、前進守備で本塁を狙う手があります。';
        }
        if (lead<=1 && g.bases[0] && !g.bases[1] && !g.bases[2] && Number(g.bases[0].S2)>=85 &&
            actions.has('def_steal')) {
            return `${displayName(g.bases[0])}は盗塁が得意です。盗塁警戒を検討。`;
        }
        return '';
    }

    function suggest(g,actions,side) {
        if (g.gameOver || g.pending || g.isAuto || g.inning<7 || g.outs>=3) return '';
        if ((g.versusAI || g.onlineMatch) && side!==g.humanSide) return '';
        const runners=g.bases.filter(Boolean).length;
        const gap=g.scores[g.defSide]-g.scores[g.batSide];
        if (gap<0 || gap>runners+1) return '';
        if (side===g.batSide && g.state==='offense' && actions.has('hit') && runners) return offense(g,actions,gap);
        if (side===g.defSide && g.state==='defense' && actions.has('def_normal') &&
            (runners || gap<=1 && g.pitcher.fatigued)) return defense(g,actions,gap);
        return '';
    }

    function render() {
        const g=currentMenu?.game;
        let text='';
        if (input.checked && g && g===gameInst) {
            const {actions,side}=currentMenu;
            const half=`${g.matchId}/${g.inning}/${g.half}`;
            if (lastHalf!==half) { lastHalf=half; shown.clear(); }
            const plate=g.batIdx[g.batSide];
            const suggestion=suggest(g,actions,side);
            const existing=shown.get(side);
            if (suggestion && (!existing || existing.plate===plate && existing.text===suggestion)) {
                text=suggestion;
                if (!existing) shown.set(side,{plate,text});
            }
        }
        note.hidden=!text;
        if (note.textContent!==text) note.textContent=text;
    }

    function menu(game,buttons,side) {
        currentMenu={game,actions:new Set(buttons.map(([,action])=>action)),side};
        render();
    }

    function gameChanged(game) {
        option.hidden=!game;
        if (currentMenu?.game!==game) {
            currentMenu=null;
            render();
        }
    }

    input.addEventListener('change',render);
    return {menu,gameChanged};
})();
