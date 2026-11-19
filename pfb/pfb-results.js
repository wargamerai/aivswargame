'use strict';

const PFBResults=(()=>{
    const STORE='pfb-played-match-';
    const memory=new Map();
    const formatIP=outs=>`${Math.floor(outs/3)}${outs%3?' '+outs%3+'/3':''}`;
    const scoreWord=['ソロ','2ラン','3ラン','満塁'];
    const inningLabel=(inning,side)=>`${inning}回${side===0?'表':'裏'}`;
    const pitcherId=p=>String(p.row.Index);
    const statKey=p=>`${p.row['チーム']}|${p.row['氏名']}|${p.row['背番号']}`;
    const byId=(g,id)=>g.pitchers.flat().find(p=>pitcherId(p)===id);

    function appearanceOrder(g,side) {
        const data=g.pitchingOrder?.[side] || [];
        if (data.length) return data;
        const used=g.pitchers[side].filter(p=>p.isUsed);
        return used.map(p=>({id:pitcherId(p),inning:p.appearanceInning || 1,outs:null,lead:0}))
            .sort((a,b)=>a.inning-b.inning);
    }

    function officialGame(g) {
        if (!g.called || !/降雨/.test(g.endReason || '')) return true;
        const [homeBattingOuts,awayBattingOuts]=g.pitchers.map(arms=>arms.reduce((n,p)=>n+p.outsPitched,0));
        return homeBattingOuts>=15 || awayBattingOuts>=15 && g.scores[1]>=g.scores[0];
    }

    function pickRelief(choices) {
        if (!choices.length) return null;
        const max=Math.max(...choices.map(({arm})=>arm.outsPitched));
        // 投球回の差が1回未満なら、失点、点差、登板順を比較する。
        return choices.filter(({arm})=>max-arm.outsPitched<3).sort((a,b)=>
            a.arm.chargedRuns-b.arm.chargedRuns || a.arm.runsAllowed-b.arm.runsAllowed ||
            Math.abs(a.entry.lead)-Math.abs(b.entry.lead) || a.index-b.index
        )[0].arm;
    }

    function decide(g) {
        if (!officialGame(g) || g.scores[0]===g.scores[1]) return {win:null,loss:null,save:null};
        const side=Number(g.scores[1]>g.scores[0]);
        if (g.leadingPitchers?.side!==side) return {win:null,loss:null,save:null};
        const appearances=appearanceOrder(g,side).map((entry,index)=>({entry,index,arm:byId(g,entry.id)})).filter(x=>x.arm);
        let win=byId(g,g.leadingPitchers.win);
        const loss=byId(g,g.leadingPitchers.loss);
        const innings=Math.max(0,...appearances.map(({arm})=>arm.lastInning || 0));
        if (win?.isStarter && win.outsPitched<(innings>=6?15:12)) {
            win=pickRelief(appearances.filter(x=>x.arm.isRelief));
        } else if (win?.isRelief && win.outsPitched<3 && win.runsAllowed>=2) {
            const index=appearances.findIndex(a=>a.arm===win);
            win=pickRelief(appearances.slice(index+1).filter(x=>x.arm.runsAllowed===0&&x.arm.outsPitched>0)) || win;
        }
        const last=appearances.at(-1);
        const finish=last?.arm;
        const save=finish?.isRelief && finish!==win && finish.outsPitched>=3 &&
            (last.entry.lead>0 && last.entry.lead<=3 || finish.outsPitched>=9) ? finish : null;
        return {win,loss,save};
    }

    function readLedger() {
        const ledger=new Map(memory);
        try {
            for (let i=0;i<localStorage.length;i++) {
                const key=localStorage.key(i);
                if (!key?.startsWith(STORE)) continue;
                const value=JSON.parse(localStorage.getItem(key));
                if (value && Array.isArray(value.pitchers)) ledger.set(key.slice(STORE.length),value);
            }
        } catch {}
        return ledger;
    }

    function addToTotals(totals, report, pitcherNames) {
        for (const pitcher of report.pitchers) {
            const current=totals[pitcher.key] ||= {w:0,l:0,sv:0,g:0,outs:0,h:0,k:0,bb:0,hbp:0,r:0};
            for (const key of ['w','l','sv','outs','h','k','bb','hbp','r']) current[key]+=pitcher[key] || 0;
            current.g++;
            if (pitcherNames) pitcherNames[pitcher.key]={name:pitcher.name,team:pitcher.team,id:pitcher.id};
        }
    }

    function record(g, context={}) {
        if (g.finalReport) {
            g.finalReport.innings ||= g.innScores.map(line=>[...line]);
            return g.finalReport;
        }
        const {win,loss,save}=decide(g);
        const pitchers=[0,1].flatMap(side=>appearanceOrder(g,side).flatMap(entry=>{
            const p=byId(g,entry.id);
            if (!p) return [];
            return [{...entry,side,key:statKey(p),team:teamAt(g,side),name:playerName(p.row),
                enterOuts:entry.outs,outs:p.outsPitched,h:p.hitsAllowed,k:p.strikeouts,bb:p.walks,hbp:p.hitByPitch,
                r:p.chargedRuns,w:Number(p===win),l:Number(p===loss),sv:Number(p===save),started:p.isStarter}];
        }));
        const report={id:g.matchId,teams:[g.playerTeam,g.oppTeam],scores:[...g.scores],innings:g.innScores.map(line=>[...line]),pitchers,
            homers:g.hrEvents?.length?g.hrEvents:g.homeRuns.map(name=>({name})),
            date:context.date || '',label:context.label || '',official:officialGame(g),totals:{}};
        if (!context.season && !context.online && report.official) {
            memory.set(report.id,report);
            try { localStorage.setItem(STORE+report.id,JSON.stringify(report)); } catch {}
            for (const item of readLedger().values()) addToTotals(report.totals,item);
        }
        g.finalReport=report;
        return report;
    }

    function lineScore(report,names) {
        if (!Array.isArray(report.innings)||report.innings.length!==2||!report.innings.every(Array.isArray)) return '';
        const [away,home]=report.innings;
        const columns=Math.max(9,away.length,home.length);
        const unusedHome=report.official&&report.scores[1]>report.scores[0]&&away.length>=9&&home.length===away.length-1;
        const headings=Array.from({length:columns},(_,index)=>`<th scope="col">${index+1}</th>`).join('');
        const rows=report.innings.map((line,side)=>{
            const cells=Array.from({length:columns},(_,index)=>{
                const score=line[index] ?? (side===1&&unusedHome&&index===home.length?'X':'—');
                return `<td>${esc(score)}</td>`;
            }).join('');
            return `<tr><th scope="row">${esc(names[side])}</th>${cells}<td class="report-total">${report.scores[side]}</td></tr>`;
        }).join('');
        return `<div class="report-line-score" tabindex="0" aria-label="イニングスコア"><table>
            <thead><tr><th scope="col">球団</th>${headings}<th scope="col" class="report-total">計</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`;
    }

    function scoringMoments(innings,winner) {
        const running=[0,0];
        let goAhead=null;
        let tied=null;
        for (let index=0;index<Math.max(innings[0].length,innings[1].length);index++) {
            for (const side of [0,1]) {
                const runs=innings[side][index]||0;
                if (!runs) continue;
                const wasAhead=running[side]>running[1-side];
                const wasBehind=running[side]<running[1-side];
                running[side]+=runs;
                const moment={side,inning:index+1,runs,score:[...running],previous:running[side]-runs,wasBehind};
                if (side===winner&&!wasAhead&&running[side]>running[1-side]) goAhead=moment;
                if (wasBehind&&running[side]===running[1-side]) tied=moment;
            }
        }
        return {goAhead,tied};
    }

    function newspaper(report,names) {
        const [away,home]=report.scores;
        const paragraphs=[];
        if (!report.official) return {headline:`${names.join('―')}、降雨でノーゲーム`,
            text:`降雨のため試合は成立しなかった。打ち切り時点のスコアは${away}対${home}だった。`};
        const winner=away===home ? null : Number(home>away);
        const loser=winner===null ? null : 1-winner;
        const won=names[winner];
        const lost=names[loser];
        const winScore=report.scores[winner];
        const lossScore=report.scores[loser];
        const winPitcher=report.pitchers.find(p=>p.w);
        const starter=report.pitchers.find(p=>p.side===winner&&p.started);
        const highlight=starter?.outs>=15&&starter.r===0 ? starter : winPitcher;
        const {goAhead,tied}=report.innings?.length===2&&report.innings.every(Array.isArray)
            ? scoringMoments(report.innings,winner) : {};
        const walkoff=winner===1&&goAhead?.inning>=9&&goAhead.inning===report.innings?.[1].length&&
            report.pitchers.filter(p=>p.side===0).reduce((outs,p)=>outs+p.outs,0)<goAhead.inning*3;
        let headline;
        if (winner===null) {
            headline=away===0 ? `${names.join('―')}、両軍無得点で引き分け` : `${names.join('―')}、${away}対${home}で引き分け`;
            if (tied) paragraphs.push(`${names[tied.side]}が${inningLabel(tied.inning,tied.side)}に${tied.runs}点を挙げて追いつき、${away}対${home}で引き分けた。`);
            else paragraphs.push(away===0 ? '両チームとも最後まで得点を許さなかった。' : `両チームが${away}点ずつを挙げ、引き分けた。`);
        } else {
            const phrase=walkoff?'サヨナラ勝ち':lossScore===0?'零封勝ち':goAhead?.wasBehind?'逆転勝ち':'勝利';
            headline=`${won}、${lost}に${winScore}―${lossScore}で${phrase}`;
            if (goAhead) {
                const other=goAhead.score[loser];
                const action=goAhead.wasBehind?'逆転':goAhead.previous===0&&other===0?'先制':'勝ち越し';
                paragraphs.push(`${won}は${inningLabel(goAhead.inning,winner)}に${goAhead.runs}点を挙げて${action}した。`);
                const added=winScore-goAhead.score[winner];
                if (added>0) paragraphs.push(`その後も${added}点を加えた。`);
            } else paragraphs.push(`${won}が${winScore}対${lossScore}で${lost}を下した。`);
            if (highlight) {
                const runs=highlight.r===0?'無失点':`${highlight.r}失点`;
                paragraphs.push(`${highlight.started?'先発の':''}${highlight.name}は${formatIP(highlight.outs)}回を${highlight.h}安打${runs}${highlight.k?`、${highlight.k}奪三振`:''}。`);
                const relievers=report.pitchers.filter(p=>p.side===winner&&!p.started);
                if (lossScore===0&&highlight.started&&relievers.length) paragraphs.push(`${relievers.map(p=>p.name).join('、')}とつなぎ、零封した。`);
            }
            const homer=report.homers.filter(h=>h.side===winner&&h.inning&&h.runs)
                .sort((a,b)=>b.runs-a.runs)[0];
            if (homer) paragraphs.push(`${inningLabel(homer.inning,winner)}には${homer.name}が${homer.runs===1?'ソロ':homer.runs+'ラン'}を放った。`);
        }
        return {headline,text:paragraphs.join('')};
    }

    function reportHtml(report) {
        const names=report.teams.map(teamShort);
        const {headline,text}=newspaper(report,names);
        const outcomes=[['勝',report.pitchers.find(p=>p.w)],['敗',report.pitchers.find(p=>p.l)],['S',report.pitchers.find(p=>p.sv)]];
        const decisions=outcomes.filter(([,p])=>p).map(([label,p])=>{
            const total=report.totals?.[p.key];
            const count=total?`（${total.w}勝${total.l}敗${total.sv?total.sv+'S':''}）`:'';
            return `<span><b>${label}</b> ${esc(p.name)}${esc(count)}</span>`;
        }).join('');
        const columns=report.teams.map((team,side)=>{
            const roster=report.pitchers.filter(p=>p.side===side);
            const homers=report.homers.filter(h=>h.side===side);
            const hr=homers.map(h=>`<li>${esc(inningLabel(h.inning,side))}　${esc(h.name)} ${esc(scoreWord[h.runs-1]||'本塁打')}</li>`).join('');
            const rows=roster.map(p=>{
                const stamp=p.started?'先発':`（${p.inning}回${p.enterOuts==null?'':p.enterOuts+'死'}）`;
                const total=report.totals?.[p.key];
                const count=total?`${total.w}勝${total.l}敗`:'';
                return `<tr><th scope="row">${esc(p.name)}<small>${esc(stamp)}${p.w?' · 勝':p.l?' · 敗':p.sv?' · S':''}</small></th>
                    <td>${formatIP(p.outs)}</td><td>${p.h}</td><td>${p.k}</td><td>${p.r}</td><td>${esc(count||'—')}</td></tr>`;
            }).join('');
            return `<section class="report-team"><h3>${esc(teamShort(team))}</h3>
                <h4>継投</h4><table><thead><tr><th>投手</th><th>投球回</th><th>被安打</th><th>奪三振</th><th>失点</th><th>勝敗計</th></tr></thead>
                <tbody>${rows||'<tr><td colspan="6">記録なし</td></tr>'}</tbody></table>
                <h4>本塁打</h4>${hr?`<ul>${hr}</ul>`:'<p>なし</p>'}</section>`;
        }).join('');
        const legacy=report.homers.filter(h=>h.side===undefined).map(h=>esc(h.name)).join('、');
        return `<article class="match-report">
            ${report.date? `<p class="report-date">${esc(report.date)}　${esc(report.label)}</p>`:''}
            <h2>${esc(headline)}</h2>
            <div class="report-score"><span>${esc(teamShort(report.teams[0]))}</span><b>${report.scores[0]} − ${report.scores[1]}</b><span>${esc(teamShort(report.teams[1]))}</span></div>
            ${lineScore(report,names)}
            ${decisions?`<p class="report-decisions">${decisions}</p>`:''}
            <p class="report-story">${esc(text)}</p>
            <div class="report-teams">${columns}</div>
            ${legacy?`<p>本塁打（旧セーブ） ${legacy}</p>`:''}
        </article>`;
    }

    const reportCreditHtml=`<footer class="report-credit"><p>このゲームは、もりつち様作の『PFB』のウェブ版です。ご興味のある方は、<a href="https://mk2kpfb.chu.jp/SGame/SLG_Moritsuchi.html" target="_blank" rel="noopener noreferrer">もりつちブランドの公式サイト</a>をご覧ください。</p></footer>`;

    const exportedReports=new Set();
    function downloadReport(report,standings,automatic=false,pngButton=null) {
        if (automatic&&exportedReports.has(report.id)) return;
        const names=report.teams.map(teamShort);
        const title=newspaper(report,names).headline;
        const html=`<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}｜PFB試合結果</title>
<style>
:root { --paper:#f7f5ee; --ink:#211f1c; --muted:#5f5a52; --rule:#ccc6ba; --tint:#ebe7dd; --accent:#792c2a; }
* { box-sizing:border-box; }
body { margin:0; color:var(--ink); background:#e6e3da; font:16px/1.65 "Hiragino Mincho ProN","Yu Mincho",serif; }
main { max-width:1050px; margin:24px auto; padding:clamp(16px,4vw,42px); background:var(--paper); }
.match-report { border-top:5px double; }
h2,h3,h4,p { margin:.4em 0; }
.match-report h2 { font-size:clamp(26px,5vw,49px); line-height:1.2; letter-spacing:-.04em; }
.report-date { font-size:.9rem; color:var(--muted); }
.report-score { display:flex; flex-wrap:wrap; align-items:center; gap:.65em; }
.report-score b { color:var(--accent); font-size:clamp(24px,5vw,42px); font-variant-numeric:tabular-nums; }
.report-line-score,.table-scroll { overflow-x:auto; }
table { width:100%; border-collapse:collapse; white-space:nowrap; font-size:.9rem; font-variant-numeric:tabular-nums; }
th,td { padding:.3em .45em; text-align:right; border-bottom:1px solid var(--rule); }
thead th { border-top:2px solid var(--ink); border-bottom:1px solid var(--ink); }
th:first-child,th[scope="row"] { text-align:left; }
.report-total,.my-club { background:var(--tint); }
.report-total,.report-decisions b,.report-league-summary h3 { color:var(--accent); }
.report-decisions { display:flex; flex-wrap:wrap; gap:.3em 1em; }
.report-story { max-width:65ch; margin:.9em 0 1.3em; }
.report-teams,.season-league-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
.report-team { overflow-x:auto; }
.report-team small { display:block; color:var(--muted); }
.report-team ul { padding-left:1.2em; }
.report-league-summary { margin-top:1.6em; border-top:5px double; padding-top:.55em; }
.report-credit { margin-top:1.6em; border-top:1px solid var(--rule); padding-top:.55em; color:var(--muted); font-size:.9rem; }
.season-leaders { margin-top:1em; }
@media(max-width:760px) { .report-teams,.season-league-grid { grid-template-columns:1fr; } }
@media print { body { background:white; } main { margin:0; padding:0; } }
</style>
<body><main>${reportHtml(report)}${standings}${reportCreditHtml}</main></body></html>`;
        const filename=['PFB試合結果',report.date,...names,report.scores.join('-')].filter(Boolean)
            .join('-').replace(/[\\/:*?"<>|]/g,'-');
        if (pngButton) return ReportImage.download(html,filename,pngButton,{width:1200});
        const file=GameReportLimit.html(html, {
            history:['.report-teams tbody tr'],
            summary:'.match-report h2, .report-score, .report-line-score, .report-league-summary',
            footer:'.report-credit',
        });
        downloadFile(new Blob([file],{type:'text/html;charset=utf-8'}),filename+'.html');
        if (automatic) exportedReports.add(report.id);
    }

    function applyTotals(report, totals) {
        report.totals=Object.fromEntries(report.pitchers.filter(p=>totals[p.key]).map(p=>[p.key,{...totals[p.key]}]));
    }

    return {record,decide,reportHtml,reportCreditHtml,downloadReport,applyTotals,officialGame,addToTotals,formatIP,pitcherId,statKey};
})();
