'use strict';

function showGameScreen() {
    document.getElementById('load-screen').style.display='none';
    document.getElementById('game-screen').style.display='flex';
}

function showGameDialog(type, row) {
    const g=gameInst;
    if (!g) return;
    const dialog=document.getElementById('game-dialog');
    const title=document.getElementById('game-dialog-title');
    const body=document.getElementById('game-dialog-body');
    const statSelect=document.getElementById('dialog-stat-source');
    statSelect.hidden=type!=='stats';
    statSelect.value=matchStatSource;
    if (type==='player' && row) {
        title.textContent=displayName(row);
        const stat=g.matchStats[String(row.Index)];
        const pitch=g.pitchers.flat().find(p=>p.row===row);
        const cardText=(row['個人DATA'] || '').replace(/^.*?生\s*/,'');
        const avg=stat?.ab?(stat.h/stat.ab).toFixed(3).replace(/^0/,''):'—';
        const batting=stat ? `${stat.ab}打数 ${stat.h}安打　打率 ${avg}　${stat.hr}本塁打　${stat.bb}四球　${stat.k}三振` : '打席なし';
        const pitching=pitch?.isUsed ? `${Math.floor(pitch.outsPitched/3)}回${pitch.outsPitched%3?' '+pitch.outsPitched%3+'/3':''}　${pitch.runsAllowed}失点　対戦打者 ${pitch.facedBatters}` : '登板なし';
        const tools=[handedness(row,false),handedness(row,true)].filter(Boolean).join('・');
        body.innerHTML=`<dl><dt>球団・投打</dt><dd>${esc(teamShort(row['チーム']))}　${esc(tools)}</dd>
            <dt>元データ</dt><dd>${esc(cardText || '—')}</dd>
            ${pitch ? `<dt>この試合の投球</dt><dd>${esc(pitching)}</dd>` : ''}
            ${!pitch || stat ? `<dt>この試合の打撃</dt><dd>${esc(batting)}</dd>` : ''}</dl>`;
    } else if (type==='stats') {
        const real=matchStatSource==='real';
        const scope=real ? null : matchRecordScope(g);
        title.textContent=real ? 'リアル成績' : scope?.label || 'この試合の成績';
        const assigned=g.humanSide ?? 0;
        body.innerHTML=[assigned,1-assigned].map(side=>renderMatchStatTeam(g,side,real,scope)).join('');
    } else return;
    if (!dialog.open) dialog.showModal();
}

function renderMatchStatTeam(g,side,real,scope) {
    const team=teamAt(g,side);
    const batters=[...new Set([...g.lineups[side],...g.benches[side],
        ...players.filter(row=>row['チーム']===team && g.matchStats[rowId(row)])])];
    let batRows, pitchRows;
    if (real) {
        batRows=batters.map(row=>{
            const {games,average,homers}=cardBattingRecord(row);
            return [row,games,average,homers];
        });
        pitchRows=g.pitchers[side].map(p=>{
            const {games,wins,losses,saves,era}=cardPitchingRecord(p.row);
            return [p.row,handedness(p.row,false) || '—',p.cardG,games,wins,losses,saves,era];
        });
    } else {
        batRows=batters.flatMap(row=>{
            const line=matchBattingTotals(g,row,scope);
            return line?.pa ? [[row,line.ab,line.h,battingAverage(line),line.hr,line.bb,line.k]] : [];
        });
        pitchRows=g.pitchers[side].flatMap(p=>{
            const past=scope?.totals?.[rowId(p.row)];
            const live=scope?.includeLive!==false && p.isUsed;
            if (!live && !past?.PG) return [];
            return [[p.row,PFBResults.formatIP((past?.IP || 0)+(live ? p.outsPitched : 0)),
                (past?.BF || 0)+(live ? p.facedBatters : 0),(past?.PR || 0)+(live ? p.chargedRuns : 0)]];
        });
    }
    const battingCols=real ? ['打者','試合','打率','本塁打'] : ['打者','打数','安打','打率','本塁打','四球','三振'];
    const pitchingCols=real ? ['投手','左右','グレード','登板','勝','敗','S','防御率'] : ['投手','投球回','打者','失点'];
    return `<h3>${esc(teamShort(team))}</h3>
        ${matchStatsTable('打撃成績',battingCols,batRows,'打席なし')}
        ${matchStatsTable('投手成績',pitchingCols,pitchRows,'登板なし')}`;
}

function matchStatsTable(label,columns,rows,empty) {
    return `<table aria-label="${label}"><thead><tr>${columns.map(col=>`<th scope="col">${col}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(([row,...values])=>`<tr><th scope="row">${playerDetailsLink(row)}</th>${values.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('') ||
        `<tr><td colspan="${columns.length}">${empty}</td></tr>`}</tbody></table>`;
}

for (const id of ['match-stat-source','dialog-stat-source']) {
    document.getElementById(id).addEventListener('change',event=>{
        matchStatSource=event.target.value==='game' ? 'game' : 'real';
        document.getElementById('match-stat-source').value=matchStatSource;
        document.getElementById('dialog-stat-source').value=matchStatSource;
        renderLineups();
        if (document.getElementById('game-dialog').open && !document.getElementById('dialog-stat-source').hidden) showGameDialog('stats');
    });
}

function playerDetailsLink(row) {
    return `<button type="button" class="player-detail-link" data-player="${esc(row.Index)}">${esc(displayName(row))}</button>`;
}

const SAVE_GAME_FIELDS=[
    'dome','humanSide','versusAI','scores','inning','half','outs','batIdx','innScores','homeRuns','log',
    'gameOver','called','endReason','state','squeezeUsed','endRunUsed','isForward','isCautious',
    'isSqueezeCautious','shockChecked','stealAttempted','startFailed','buntContinuation','plateOutcome',
    'plateComplete','offenseLocked','waitingForCpuDefense','matchStats','matchId','pitchingOrder','hrEvents',
    'responsible','leadingPitchers','injuryEvents','finalReport','seasonMatch'
];
const SAVE_PITCHER_FIELDS=[
    'baseG','baseC','tempG','tempC','outsPitched','inningsPitched','facedBatters','appearanceInning','lastInning',
    'secondBaseChecked','runsAllowed','isUsed','shock','isStarter','isRelief','unavailable','chargedRuns','hitsAllowed',
    'strikeouts','walks','hitByPitch'
];
const SAVE_MATCH_FORMAT='pfb-match-v1';
function fields(object, keys) {
    return Object.fromEntries(keys.map(key=>[key,object[key]]));
}
function rowId(row) {
    return row ? String(row.Index) : null;
}

function exportMatch(g, roster, changingSides) {
    if (!g || g.pending) throw new Error('判定の選択を終えてからセーブしてください。');
    const cards=[...new Map([...roster,...g.lineups.flat(),...g.benches.flat(),...g.removed,...g.pitchers.flat().map(p=>p.row)].map(row=>[rowId(row),row])).values()];
    return {
        format:SAVE_MATCH_FORMAT,roster:cards,changingSides:Boolean(changingSides),
        away:g.playerTeam,home:g.oppTeam,game:fields(g,SAVE_GAME_FIELDS),
        lineups:g.lineups.map(lineup=>lineup.map(rowId)),
        benches:g.benches.map(bench=>bench.map(rowId)),
        positions:g.positions.map(positions=>Object.fromEntries(Object.entries(positions).map(([pos,row])=>[pos,rowId(row)]))),
        pitchers:g.pitchers.map(pitchers=>pitchers.map(p=>({id:rowId(p.row),state:fields(p,SAVE_PITCHER_FIELDS),form:p.form}))),
        currentPitchers:g.curPit.map(p=>rowId(p.row)),
        bases:g.bases.map(rowId),
        removed:[...g.removed].map(rowId),
        appearances:[...g.appearances],
        blocked:[...g.stealBlocked].map(([row,from])=>[rowId(row),from])
    };
}

function importMatch(save) {
    const invalid=()=>{ throw new Error('PFBのセーブファイルを読み込めません。'); };
    const pair=array=>Array.isArray(array)&&array.length===2;
    const nonNegative=n=>Number.isSafeInteger(n)&&n>=0;
    if (save?.format!==SAVE_MATCH_FORMAT || !Array.isArray(save.roster) || !save.game) invalid();
    const registry=new Map();
    for (const row of save.roster) {
        if (!row || typeof row!=='object' || typeof row['氏名']!=='string' || typeof row['チーム']!=='string' ||
            !Object.values(row).every(v=>typeof v==='string') || row.Index==null) invalid();
        registry.set(rowId(row),row);
    }
    if (registry.size!==save.roster.length || !registry.size) invalid();
    const getRow=id=>{
        const row=registry.get(String(id));
        if (!row) invalid();
        return row;
    };
    const teams=[save.away,save.home];
    const state=save.game;
    if (!teams.every(team=>typeof team==='string') || teams[0]===teams[1] ||
        ![0,1].includes(state.humanSide) || ![0,1].includes(state.half) || !['offense','defense','between'].includes(state.state) ||
        !nonNegative(state.inning) || !state.inning || state.inning>200 || !nonNegative(state.outs) || state.outs>3 ||
        !pair(state.scores) || !state.scores.every(nonNegative) || !pair(state.batIdx) || !state.batIdx.every(i=>nonNegative(i)&&i<9) ||
        !pair(state.innScores) || !state.innScores.every(line=>Array.isArray(line)&&line.every(n=>n===null||nonNegative(n))) ||
        !Array.isArray(state.log) || !state.log.every(entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string') ||
        !Array.isArray(state.homeRuns) || !state.homeRuns.every(v=>typeof v==='string') || !pair(state.squeezeUsed) ||
        !pair(save.lineups) || !pair(save.benches) || !pair(save.positions) || !pair(save.pitchers) || !pair(save.currentPitchers) ||
        !Array.isArray(save.bases) || save.bases.length!==3 || !Array.isArray(save.blocked) || !Array.isArray(save.removed)) invalid();
    const lineup=save.lineups.map((ids,side)=>{
        if (!Array.isArray(ids)||ids.length!==9) invalid();
        const rows=ids.map(getRow);
        if (new Set(rows).size!==9 || rows.some(row=>row['チーム']!==teams[side])) invalid();
        return rows;
    });
    const g=Object.assign(Object.create(Game.prototype),fields(state,SAVE_GAME_FIELDS));
    g.playerTeam=teams[0];
    g.oppTeam=teams[1];
    g.lineups=lineup;
    g.benches=save.benches.map(ids=>ids.map(getRow));
    g.positions=save.positions.map(positions=>Object.fromEntries(FIELD_POSITIONS.filter(pos=>positions[pos]!=null).map(pos=>[pos,getRow(positions[pos])])));
    g.pitchers=save.pitchers.map((entries,side)=>entries.map(entry=>{
        const row=getRow(entry.id);
        if (!isPitcher(row) || row['チーム']!==teams[side] || !entry.state) invalid();
        const p=new PitcherState(row);
        for (const field of SAVE_PITCHER_FIELDS) {
            const value=entry.state[field];
            if (value!=null && typeof value!=='boolean' && !Number.isFinite(value)) invalid();
            if (value!==undefined) p[field]=value;
        }
        if(entry.form){
            const form=fields(entry.form,['adjust','previousInnings','penalty']);
            if(!Object.values(form).every(Number.isFinite))invalid();
            p.form=form;
        }
        if (entry.state.chargedRuns===undefined) p.chargedRuns=p.runsAllowed;
        return p;
    }));
    g.curPit=save.currentPitchers.map((id,side)=>{
        const p=g.pitchers[side].find(arm=>rowId(arm.row)===String(id));
        if (!p) invalid();
        return p;
    });
    g.bases=save.bases.map(id=>id===null?null:getRow(id));
    g.removed=new Set(save.removed.map(getRow));
    g.stealBlocked=new Map(save.blocked.map(([id,from])=>[getRow(id),from]));
    g.pending=null;
    g.isAuto=false;
    g.matchStats=Object.create(null);
    for (const [id,line] of Object.entries(state.matchStats||{})) {
        if (!registry.has(id)||!line) invalid();
        const keys=['pa','ab','h','hr','bb','k','doubles','triples','hbp','sh','sf','r','rbi','sb','cs'];
        const values=Object.fromEntries(keys.map(key=>[key,line[key]??0]));
        if (!Object.values(values).every(nonNegative)) invalid();
        g.matchStats[id]=values;
    }
    g.appearances=new Set(Array.isArray(save.appearances)?save.appearances.map(id=>rowId(getRow(id))):
        [...g.lineups.flat().map(rowId),...Object.keys(g.matchStats)]);
    g.responsible=Object.assign(Object.create(null),state.responsible||{});
    g.leadingPitchers=state.leadingPitchers || null;
    g.pitchingOrder=pair(state.pitchingOrder)?state.pitchingOrder:[[],[]];
    g.hrEvents=Array.isArray(state.hrEvents)?state.hrEvents:[];
    g.injuryEvents=Array.isArray(state.injuryEvents)?state.injuryEvents:[];
    g.matchId=typeof state.matchId==='string'?state.matchId:(globalThis.crypto?.randomUUID?.() || Date.now().toString(36));
    return {game:g,roster:save.roster,changingSides:Boolean(save.changingSides&&state.outs===3&&!state.gameOver)};
}

function reportSave(message) {
    const note=document.getElementById('game-log');
    if (gameInst) note.textContent=message;
    else alert(message);
}
function saveCurrentMatch() {
    if (typeof PFBSeasonUI!=='undefined' && PFBSeasonUI.active() && (!gameInst||gameInst.seasonMatch)) {
        PFBSeasonUI.save();
        return;
    }
    if (!gameInst) return;
    try {
        const save=exportMatch(gameInst,players,halfEndPending);
        downloadJson(save,`PFB-${teamShort(gameInst.playerTeam)}-${teamShort(gameInst.oppTeam)}-${gameInst.inning}回.json`);
        reportSave('試合をファイルに保存しました');
    } catch (error) { reportSave(error.message); }
}
function downloadJson(value,name){
    downloadFile(new Blob([JSON.stringify(value)],{type:'application/json'}),name);
}
function downloadFile(blob,name){
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=name;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openSaveFile() {
    const input=document.getElementById('save-input');
    input.value='';
    input.click();
}
function resumeMatch(save) {
    const restored=importMatch(save);
    clearAutoTimer();
    clearTimeout(cpuTimer);
    cpuTimer=null;
    halfEndPending=restored.changingSides;
    players=restored.roster;
    gameInst=restored.game;
    document.getElementById('game-log').textContent='';
    showGameScreen();
    if (gameInst.gameOver) { renderFinalResult(); return; }
    updateUI();
    if (halfEndPending) showNext('チェンジ');
    else if (gameInst.state==='between') showNext(gameInst.plateComplete?'次の打席':'打席を続ける');
    else if (gameInst.state==='defense') showDefenseMenu();
    else showOffenseMenu();
}

document.getElementById('save-input').addEventListener('change', async event=>{
    const file=event.target.files[0];
    if (!file) return;
    try {
        const data=JSON.parse(await file.text());
        if (data?.format==='pfb-season-v1') PFBSeasonUI.load(data);
        else {
            if(typeof PFBSeasonUI!=='undefined')PFBSeasonUI.leave();
            if(typeof PFBOnline!=='undefined')PFBOnline.leave();
            resumeMatch(data);
        }
    } catch (error) { reportSave(error.message); }
});
document.getElementById('action-buttons').addEventListener('click',event=>{
    const button=event.target.closest('button[data-action]');
    if (button && !button.disabled) {
        document.getElementById('game-log').textContent='';
        if(typeof PFBOnline==='undefined'||!PFBOnline.click(button.dataset.action))doAction(button.dataset.action);
    }
});
document.addEventListener('click',event=>{
    const button=event.target.closest('button[data-player]');
    if (!button) return;
    const player=players.find(row=>rowId(row)===button.dataset.player);
    if (player) showGameDialog('player',player);
});
