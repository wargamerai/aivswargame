'use strict';

const PFBMatchCoach=(()=>{
    const input=document.getElementById('match-coach');
    const option=document.getElementById('coach-option');
    const note=document.getElementById('coach-advice');
    const extraBaseHits=new Set(['2H','2H+','3H','HR']);
    let currentMenu=null;
    let rendered='';

    function possibleGrades(value) {
        const {whole,fraction}=gradeRollParts(Math.max(0,value));
        return fraction
            ? [[clampGrade(whole),1-fraction/10],[clampGrade(whole+1),fraction/10]]
            : [[clampGrade(whole),1]];
    }

    function battingOutlook(g,batter,pitcher,tactics={},entering=false,ignoreLeft=false) {
        const projected=entering ? {arm:pitcher.arm,isRelief:true,facedBatters:0} : pitcher;
        const modifiers=swingPitchModifiers(g,batter,projected,tactics);
        const tempG=modifiers.tempG-Number(ignoreLeft && leftMatchup(pitcher,batter));
        const fatigued=pitcher.staminaRemaining-Number(pitcher.lastInning!==g.inning)<0;
        const adjustment=pitcher.form?.adjust || 0;
        const grades=entering ? possibleGrades(pitcher.cardG+adjustment) : [[pitcher.baseG,1]];
        const controls=entering ? possibleGrades(pitcher.cardC+adjustment) : [[pitcher.baseC,1]];
        const result={reach:0,power:0,score:0};
        for (const [baseG,pG] of grades) {
            const G=effectivePitchGrade(baseG+tempG,fatigued,pitcher.shock);
            for (const [baseC,pC] of controls) {
                const C=effectivePitchGrade(baseC+modifiers.tempC,fatigued,pitcher.shock);
                const weight=pG*pC;
                const card={G,C,K:pitcher.K,HR_mod:pitcher.HR_mod};
                for (let roll=1;roll<=100;roll++) {
                    const [,,event]=resolveAtBat(batter,card,g.outs,g.bases,roll);
                    if (event==='GENERIC' || event==='K') continue;
                    if (event==='SF') {
                        result.score+=weight;
                        continue;
                    }
                    result.reach+=weight;
                    if (extraBaseHits.has(event)) result.power+=weight;
                    if (advanceForHit(event,g.bases,batter)?.[1]>0) result.score+=weight;
                }
            }
        }
        return result;
    }

    function impact(g,projection) {
        const oneRunMatters=g.inning>=7 && Math.abs(g.scores[0]-g.scores[1])<=1;
        return projection.reach+projection.power*.5+projection.score*(oneRunMatters?2:1);
    }

    function leftMatchBenefit(g,batter,pitcher,tactics,entering,current) {
        if (!leftMatchup(pitcher,batter)) return false;
        const withoutBonus=battingOutlook(g,batter,pitcher,tactics,entering,true);
        return impact(g,withoutBonus)-impact(g,current)>=.1;
    }

    function battingAdvice(g,pitcher,tactics,entering,canPinch,choosing) {
        const batter=g.batter;
        const name=displayName(batter);
        const current=battingOutlook(g,batter,pitcher,tactics,entering);
        const left=leftMatchBenefit(g,batter,pitcher,tactics,entering,current);
        if (!canPinch || !g.bench.length) {
            return left ? `左対左で厳しい打席だ。ここは${name}の出塁に期待しよう。` : '';
        }

        const currentImpact=impact(g,current);
        const [best]=g.bench.map(row=>{
            const forecast=battingOutlook(g,row,pitcher,tactics,entering);
            return {row,forecast,advantage:impact(g,forecast)-currentImpact};
        }).sort((a,b)=>b.advantage-a.advantage);
        const candidate=displayName(best.row);
        const minimum=g.inning<5 && !left ? 5 : 2;
        if (best.advantage<minimum) {
            const keep=left ? `左対左で厳しいけど、ここは${name}でいこう。` : `ここは${name}でいこう。代打は取っておきたい。`;
            return choosing && best.advantage>0 ? `${keep} 出すなら${candidate}だ。` : keep;
        }

        const {forecast}=best;
        let reason='この投手とは相性がいい。';
        if (left && !leftMatchup(pitcher,best.row)) reason='左対左を外して勝負しよう。';
        else if (forecast.score-current.score>=2) reason='この場面なら走者を返す打撃が期待できる。';
        else if (forecast.power-current.power>=2) reason='この投手から長打を狙うならいい選択だ。';
        else if (forecast.reach-current.reach>=2) reason='この投手には出塁を期待できる。';
        return `ここは${candidate}を代打に出そう。${reason}`;
    }

    function pitcherTrouble(p) {
        if (p.unavailable || p.shock===2) return `${p.name}はここまでだ。`;
        if (p.shock===1) return `${p.name}はショックで投球が苦しくなっている。`;
        if (p.fatigued) return `${p.name}に疲れが出ている。`;
        return '';
    }

    function bullpenAdvice(g,current,canReplace,forced) {
        const p=g.pitcher;
        const trouble=pitcherTrouble(p);
        const stay=leftMatchBenefit(g,g.batter,p,{},false,current)
            ? `左対左が効いている。ここは${p.name}で勝負しよう。`
            : `この打者には${p.name}でいこう。控えは取っておきたい。`;
        if (!canReplace) {
            if (trouble) return `${trouble} 交代できるまで、まずこの打者を抑えよう。`;
            return leftMatchup(p,g.batter) ? stay : '';
        }

        const currentImpact=impact(g,current);
        const [best]=g.pitchers[g.defSide].filter(candidate=>!candidate.isUsed && !candidate.unavailable)
            .map(candidate=>{
                const forecast=battingOutlook(g,g.batter,candidate,{},true);
                return {candidate,forecast,advantage:currentImpact-impact(g,forecast)};
            })
            .sort((a,b)=>b.advantage-a.advantage ||
                b.candidate.staminaRemaining-a.candidate.staminaRemaining);
        if (!best) return `${trouble}使える控え投手がいない。`;
        if (!forced && best.advantage<2 && (!trouble || best.advantage<0)) {
            return trouble ? `${trouble} この打者までは任せよう。` : stay;
        }

        const {candidate,forecast}=best;
        let reason='';
        if (leftMatchBenefit(g,g.batter,candidate,{},true,forecast)) reason='左対左で抑えにいこう。';
        else if (current.score-forecast.score>=2) reason='走者を返される前に手を打とう。';
        else if (current.power-forecast.power>=2) reason='この打者の長打を抑えたい。';
        else if (current.reach-forecast.reach>=2) reason='この打者を塁に出しにくい投手だ。';
        return `${trouble}${displayName(candidate.row)}に代えよう。${reason}`;
    }

    function stealOutlook(g,group,pitcher,cautious) {
        const conditions=g.stealConditions({cautious});
        const catcherT=g.catcherT();
        const odds=group.map(target=>stealProbabilities(group,target,pitcher,catcherT,conditions));
        const start=odds[0].start;
        const low=Math.min(...odds.map(chance=>chance.afterStart));
        return {group,start,low,success:start*low/100,caught:start*(100-low)/100};
    }

    function stealOpinion(g,{group,start,low,caught},cautious,gap) {
        const home=group.some(({from})=>from===2);
        const third=group.some(({from})=>from===1);
        const names=group.map(({runner})=>displayName(runner)).join('と');
        const threshold=(home?90:third?80:72)+Number(gap>=2)*5;
        if (!start) return {hold:`${names}は塁に置いておこう。ここはスタートが切れそうにない。`};
        if (gap>=3 && !home) return {hold:'何点か取らないと追いつけない。走者を残して、打席でつなごう。'};
        if (g.outs===2 && third && !home) return {hold:`二死だ。${names}は無理に三塁を狙わず、打者に任せよう。`};
        if (low<threshold || caught>20) {
            if (cautious) return {hold:`相手が警戒している。${names}は走らせず、打者に任せよう。`};
            if (g.outs===2) return {hold:`${names}はそのまま。刺されるとこの回が終わる。`};
            return {hold:`このバッテリー相手に${names}を走らせるのは危ない。ここは塁に置いておこう。`};
        }
        if (start<40) return {hold:`${names}はスタートが切りにくい。ここは打者に任せよう。`};
        if (group.length>1) {
            const targets=group.map(({from})=>['二塁','三塁','本塁'][from]).join('と');
            return {go:`${names}を一緒に走らせよう。${targets}を同時に狙える。`};
        }
        if (home) return {go:`${names}なら本盗を狙える。思い切って本塁へ走らせよう。`};
        if (third) return {go:`${names}は三塁を狙おう。進めれば、外野フライでも帰ってこられる。`};
        return {go:`ここは${names}を走らせよう。このバッテリーなら二塁を狙える。`};
    }

    function stealAdvice(g,pitcher,cautious,gap,fieldingChange) {
        const opinions=g.stealGroups().map(group=>stealOutlook(g,group,pitcher,cautious))
            .sort((a,b)=>b.success-a.success || a.caught-b.caught)
            .map(forecast=>stealOpinion(g,forecast,cautious,gap));
        if (!opinions.length) return {};
        if (fieldingChange) return {hold:'相手が守備を代えるなら、走るかどうかは交代を見てから決めよう。'};
        return opinions.find(opinion=>opinion.go) || opinions[0];
    }

    function defense(g,actions,gap,pitcherMenu,forced) {
        const current=battingOutlook(g,g.batter,g.pitcher);
        const pitching=bullpenAdvice(g,current,actions.has('def_pitcher') || pitcherMenu || forced,forced);
        if (pitcherMenu || forced) return [pitching];
        if (gap>=-1 && gap<=1 && g.bases[2] && g.outs<2 && actions.has('def_forward')) {
            return ['ここは前進守備でいこう。三塁走者を本塁で止めたい。',pitching];
        }
        if (!actions.has('def_steal')) return [pitching];

        const [threat]=g.stealGroups().map(group=>stealOutlook(g,group,g.pitcher,false))
            .sort((a,b)=>b.success-a.success);
        if (!threat || threat.success<40) return [pitching];
        const warned=stealOutlook(g,threat.group,g.pitcher,true);
        const names=threat.group.map(({runner})=>displayName(runner)).join('と');
        if (threat.success-warned.success>=20 && gap>=0 && gap<=2) {
            return [`${names}が走ってきそうだ。ここは盗塁警戒で進塁を止めよう。`,pitching];
        }
        return [pitching,`${names}のスタートは気になるけど、ここは通常守備で打者を抑えよう。`];
    }

    function suggest(g,buttons,side) {
        if (g.gameOver || g.isAuto || g.outs>=3 || !g.batter || !g.pitcher) return [];
        if ((g.versusAI || g.onlineMatch) && side!==g.humanSide) return [];
        const commands=buttons.map(([,action])=>action);
        const actions=new Set(commands);
        const pinchMenu=commands.some(action=>action.startsWith('pinch:'));
        const stealMenu=commands.some(action=>action.startsWith('steal:'));
        const pitcherMenu=commands.some(action=>action.startsWith('chpitch:'));
        const forced=g.pending?.title.includes('の交代投手を選択') && commands.some(action=>action.startsWith('choice:'));
        const gap=g.scores[g.defSide]-g.scores[g.batSide];
        if (g.pending && !forced) return [];
        if (side===g.defSide && (actions.has('def_normal') || pitcherMenu || forced)) {
            return defense(g,actions,gap,pitcherMenu,forced);
        }
        if (side!==g.batSide || !(actions.has('hit') || pinchMenu || stealMenu)) return [];

        const cpu=g.waitingForCpuDefense ? cpuDefensePlan(g) : null;
        const pitcher=cpu?.reliever || g.pitcher;
        const cautious=cpu?.cautious ?? g.isCautious;
        const running=actions.has('steal_menu') || stealMenu
            ? stealAdvice(g,pitcher,cautious,gap,cpu?.fieldingChange)
            : {};
        if (stealMenu) return [running.go || running.hold];
        const hitting=battingAdvice(g,pitcher,{cautious},Boolean(cpu?.reliever),actions.has('pinch') || pinchMenu,pinchMenu);
        if (pinchMenu) return [hitting];

        const closeLate=g.inning>=7 && gap>=0 && gap<=1 && !g.buntContinuation;
        if (closeLate && actions.has('squeeze') && g.buntStrength(true)>=4) {
            return [`ここは一点が欲しい。${displayName(g.batter)}のバントならスクイズを狙えるぞ。`];
        }
        if (closeLate && actions.has('bunt') && g.outs===0 && g.bases[0] && !g.bases[1] &&
            !g.bases[2] && g.buntStrength(false)>=3 && !running.go) {
            return [`${displayName(g.batter)}に送らせよう。まず一塁走者を得点圏に進めたい。`];
        }
        if (running.go) return [running.go,hitting && `打たせるなら、${hitting}`];
        return [running.hold,hitting];
    }

    function render() {
        const g=currentMenu?.game;
        const tips=input.checked && g && g===gameInst
            ? suggest(g,currentMenu.buttons,currentMenu.side).filter(Boolean)
            : [];
        const key=JSON.stringify(tips);
        if (rendered===key) return;
        rendered=key;
        note.hidden=!tips.length;
        if (!tips.length) {
            note.replaceChildren();
            return;
        }
        const speaker=document.createElement('strong');
        speaker.className='coach-speaker';
        speaker.textContent='コーチ';
        note.replaceChildren(speaker,...tips.map(text=>{
            const line=document.createElement('p');
            line.className='coach-tip';
            line.textContent=`「${text}」`;
            return line;
        }));
        note.scrollTop=0;
    }

    function menu(game,buttons,side) {
        currentMenu={game,buttons,side};
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
