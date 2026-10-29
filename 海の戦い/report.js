// 海の戦い - プレイの記録とレポートの保存
// ゲームの処理は書き換えず、フェイズの進行・ターン終了・航空攻撃の呼び出しの前後で記録を取る
//   ターンの初め（フェイズ2の前）: 出発地
//   戦闘の前（フェイズ6の前）: 戦闘直前の位置、移動の失敗
//   戦闘の後（フェイズ7の前）: 戦闘の結果
//   ターン終了: 支配、POC
// ターン8が終わったら、観戦ページと同じ形のレポートを、プレイした人のパソコンに保存できる
// 画面なしの対戦（sim/play.js）では読み込まれない

const REP_SEA = { NorthAtlantic:'North Atlantic', Barents:'Barents Sea', NorthSea:'North Sea', Baltic:'Baltic Sea', Mediterranean:'Mediterranean', SouthAtlantic:'South Atlantic' };
const REP_LOC = { ...REP_SEA, Germany:'Germany', France:'France', Italy:'Italy', Malta:'Malta', England:'Britain', USA:'USA', Leningrad:'Leningrad', Russia:'Russia', Neutral:'Neutral port' };
const REP_PORTS = ['England', 'Malta', 'USA', 'Russia', 'Leningrad', 'Germany', 'France', 'Italy', 'Neutral'];
const REP = { turns: [], start: null, before: null, combat: null, lba: {} };

function repSnap(){
  const m = {};
  SHIPS.forEach(s => { m[s.id] = { id: s.id, name: s.name, side: s.side, type: s.type, country: s.country, loc: s.location,
    damage: s.damage || 0, def: s.def, sunk: !!s.sunk, ret: !!s.returnPending, forced: !!s.forcedReturn,
    failed: !!s.failedMove, usEntered: !!s.usEntered, removed: !!s.removed, landed: !!s.landed }; });
  return m;
}
// 戦闘の前後をくらべて、場所ごとの撃沈・損害・帰還をまとめる
function repSummarize(before, after){
  const out = {};
  for(const loc of [...Object.keys(REP_SEA), ...REP_PORTS]){
    const here = Object.values(before).filter(b => b.loc === loc && !b.sunk);
    const al = here.filter(b => b.side === 'allies'), ax = here.filter(b => b.side === 'axis');
    const changed = here.some(b => after[b.id].sunk || after[b.id].damage > b.damage || after[b.id].ret);
    if((!al.length || !ax.length) && !changed) continue;
    const r = { sunk: { allies: [], axis: [] }, damaged: { allies: [], axis: [] }, retreat: { allies: [], axis: [] }, forced: { allies: [], axis: [] }, dmgOf: {} };
    for(const b of here){
      const a = after[b.id];
      if(a.sunk){ r.sunk[b.side].push(b.name); continue; }
      if(a.damage > b.damage){ r.damaged[b.side].push(`${b.name} (damage ${a.damage}/${b.def})`); r.dmgOf[b.id] = `${a.damage}/${b.def}`; }
      if(a.ret && a.forced) r.forced[b.side].push(b.name);
      else if(a.ret) r.retreat[b.side].push(b.name);
    }
    out[loc] = r;
  }
  return out;
}
function repTurnData(turn, ctl, gain, total){
  const start = REP.start || REP.before || repSnap();
  const before = REP.before || start;
  const cb = REP.combat || {};
  const shipsAt = loc => {
    const here = Object.values(before).filter(b => b.loc === loc && !b.sunk && (!b.removed || b.landed));
    const c = cb[loc];
    const res = b => {
      if(!c) return { res: '', dmg: b.damage ? `${b.damage}/${b.def}` : '' };
      const dmg = c.dmgOf[b.id] || (b.damage ? `${b.damage}/${b.def}` : '');
      if(c.sunk[b.side].includes(b.name)) return { res: 'sunk', dmg: '' };
      if(c.forced[b.side].includes(b.name) || c.retreat[b.side].includes(b.name)) return { res: 'ret', dmg };
      return { res: c.dmgOf[b.id] ? 'dmg' : '', dmg };
    };
    const side = sd => ({ ships: here.filter(b => b.side === sd).map(b => {
      const from = start[b.id] ? start[b.id].loc : b.loc;
      return { name: b.name, type: b.type, from: REP_LOC[from] || from, failed: b.failed, landed: b.landed, ...res(b) };
    }) });
    return { allies: side('allies'), axis: side('axis') };
  };
  const seas = {};
  for(const sea of Object.keys(REP_SEA)) seas[sea] = shipsAt(sea);
  const ports = [];
  for(const port of REP_PORTS){
    const p = shipsAt(port);
    if(p.allies.ships.length || p.axis.ships.length) ports.push({ loc: port, name: REP_LOC[port], ...p });
  }
  const failed = Object.values(before).filter(b => b.failed && !b.sunk && b.loc && !String(b.loc).startsWith('T')).map(b => ({
    side: b.side, name: b.name, at: REP_LOC[b.loc] || b.loc,
    why: b.country === 'US' && !b.usEntered ? 'US entry roll failed' : '2-area move failed',
  }));
  const combat = Object.keys(cb).map(loc => ({ loc: REP_LOC[loc] || loc, port: !REP_SEA[loc], sunk: cb[loc].sunk, damaged: cb[loc].damaged, retreat: cb[loc].retreat, forced: cb[loc].forced }));
  const lba = (REP.lba[turn] || []).map(x => ({ side: x.side, loc: x.area, name: REP_LOC[x.area] || x.area }));
  // このターンに上陸した船団（ロシア +3、英国 +1）
  const now = repSnap();
  const convoys = Object.values(now).filter(n => n.type === 'CONVOY' && n.landed && !(start[n.id] && start[n.id].landed))
    .map(n => ({ name: n.name, port: REP_LOC[n.loc] || n.loc, pts: n.loc === 'Russia' ? 3 : 1 }));
  // 水上戦闘ごとの連合AIの目標の選び方（倍率は戦闘の始まりの連合/枢軸の戦力）
  const targeting = (typeof alliedTargetModeLog !== 'undefined' ? alliedTargetModeLog : []).filter(x => x.turn === turn)
    .map(x => ({ sea: REP_LOC[x.sea] || x.sea, mode: x.mode, ratio: isFinite(x.ratio) ? x.ratio : null }));
  const pst = (typeof alliedPostureLog !== 'undefined' ? alliedPostureLog : []).find(x => x.turn === turn);
  return { turn, seas, ports, failed, combat, ctl, gain, total, lba, convoys, targeting, posture: pst ? pst.posture : null };
}

// ---------- 呼び出しの前後で記録を取る ----------
document.addEventListener('DOMContentLoaded', () => {
  const origAdvance = window.advancePhase;
  window.advancePhase = async function(){
    const next = phaseIdx + 1;
    if(phaseIdx < 9){
      if(next === 2){ REP.start = repSnap(); REP.before = null; REP.combat = null; }
      if(next === 6) REP.before = repSnap();
      if(next === 7 && REP.before) REP.combat = repSummarize(REP.before, repSnap());
    }
    return origAdvance.apply(this, arguments);
  };
  const origEnd = window.endTurn;
  window.endTurn = function(){
    const turn = currentTurn;
    const ctl = {};
    Object.keys(SEAS).forEach(k => { ctl[k] = seaControl[k] || null; });
    if(REP.before && !REP.combat) REP.combat = repSummarize(REP.before, repSnap());
    const r = origEnd.apply(this, arguments);
    if(!REP.turns.some(t => t.turn === turn)) REP.turns.push(repTurnData(turn, ctl, lastTurnPocGain, poc));
    REP.start = null; REP.before = null; REP.combat = null;
    return r;
  };
  const origAir = window.runAirStrike;
  window.runAirStrike = function(side, area, lbaUsable){
    if(lbaUsable) (REP.lba[currentTurn] = REP.lba[currentTurn] || []).push({ side, area });
    return origAir.apply(this, arguments);
  };
});

// ---------- レポートの保存 ----------
function repBuildHtml(){
  const opts = [];
  if(optionRules.ubNoLimit) opts.push('No U-boat limit');
  if(optionRules.bismarck7) opts.push('Bismarck class Defense 7');
  if(optionRules.usEase) opts.push('Easier US entry');
  const data = { turns: REP.turns, seaName: REP_SEA, finalPoc: poc, opts,
    sunk: { allies: SHIPS.filter(s => s.side === 'allies' && s.sunk && s.type !== 'UBOAT').map(s => s.name),
            axis: SHIPS.filter(s => s.side === 'axis' && s.sunk && s.type !== 'UBOAT').map(s => s.name),
            ubAxis: SHIPS.filter(s => s.side === 'axis' && s.sunk && s.type === 'UBOAT').length } };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>War at Sea Game Report</title>
<style>
:root{ --bg:#f6f7f9; --card:#fff; --fg:#1d2330; --mute:#667085; --line:#d9dee7; --al:#1f5fbf; --ax:#b42318; --none:#98a2b3;
  --ctl-none:#fff; --ctl-al:#d6e4ff; --ctl-ax:#ffd9d4; --r-sunk:#d10000; --r-dmg:#c25e00; --r-ret:#7a2fc0; }
@media (prefers-color-scheme: dark){ :root{ --bg:#14171d; --card:#1d222b; --fg:#e6e9ef; --mute:#98a2b3; --line:#2f3642; --al:#6ea8ff; --ax:#ff7a6e; --none:#667085;
  --ctl-none:#1d222b; --ctl-al:#1b2f55; --ctl-ax:#4f1f1b; --r-sunk:#ff6b6b; --r-dmg:#ffa94d; --r-ret:#c599ff; } }
*{ box-sizing:border-box; }
body{ margin:0; background:var(--bg); color:var(--fg); font:14px/1.6 -apple-system,"Helvetica Neue",Arial,sans-serif; }
.wrap{ max-width:1100px; margin:0 auto; padding:16px; }
h1{ font-size:20px; margin:0 0 4px; } .sub{ color:var(--mute); font-size:12px; margin-bottom:12px; }
.nav{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
.nav button{ border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:6px; padding:6px 12px; font-size:14px; cursor:pointer; }
.nav button.on{ background:var(--fg); color:var(--bg); }
h2{ font-size:16px; margin:18px 0 8px; }
.card{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px; }
.grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px;
  grid-template-areas:"NorthAtlantic Barents Baltic" "SouthAtlantic NorthSea Mediterranean"; }
@media (max-width:760px){ .grid{ grid-template-columns:1fr; grid-template-areas:"NorthAtlantic" "SouthAtlantic" "Barents" "NorthSea" "Baltic" "Mediterranean"; } }
.sea.ctl-none{ background:var(--ctl-none); } .sea.ctl-allies{ background:var(--ctl-al); } .sea.ctl-axis{ background:var(--ctl-ax); }
.sea h3{ font-size:15px; margin:0 0 6px; display:flex; justify-content:space-between; }
.ports{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; } .ports h3{ font-size:15px; margin:0 0 6px; }
.tag{ font-size:12px; padding:1px 8px; border-radius:10px; color:#fff; }
.tag.allies{ background:var(--al); } .tag.axis{ background:var(--ax); } .tag.none{ background:var(--none); }
.side{ margin:4px 0; } b.allies{ color:var(--al); } b.axis{ color:var(--ax); }
ul{ margin:2px 0 0; padding-left:18px; } li{ margin:0; }
.from{ color:var(--mute); font-size:12px; } .empty{ color:var(--mute); }
.r-sunk{ color:var(--r-sunk); font-weight:bold; text-decoration:line-through; } .r-dmg{ color:var(--r-dmg); font-weight:bold; } .r-ret{ color:var(--r-ret); font-weight:bold; }
.lba{ font-size:12px; font-weight:bold; color:#fff; padding:1px 6px; border-radius:10px; margin-left:6px; } .lba.allies{ background:var(--al); } .lba.axis{ background:var(--ax); }
.legend{ font-size:12px; font-weight:normal; margin-left:10px; } .legend span{ margin-right:10px; }
table{ border-collapse:collapse; width:100%; } td,th{ border-bottom:1px solid var(--line); padding:4px 6px; text-align:left; vertical-align:top; }
.poc{ font-size:15px; margin-top:8px; }
</style></head><body><div class="wrap">
<h1>War at Sea: Game Report</h1>
<div class="sub" id="sub"></div>
<div class="nav" id="nav"></div>
<div id="view"></div>
</div>
<script>
const D = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const sgn = n => (n >= 0 ? '+' : '') + n;
const CTL = { allies:'Allies', axis:'Axis' };
let cur = 0;
document.getElementById('sub').textContent = 'Player (Axis) vs AI (Allies). Optional rules: ' + (D.opts.length ? D.opts.join(', ') : 'none') + '. POC: + favors the Allies, - favors the Axis.';
function side(sd, x, locName, inPort){
  if(!x.ships.length) return '';
  let h = '<div class="side"><b class="' + sd + '">' + CTL[sd] + '</b>';
  const note = s => inPort ? (s.landed ? ' <span class="from">landed</span>' : s.failed ? ' <span class="from">move failed</span>' : '')
    : ' <span class="from">' + (s.from === locName ? 'stayed' : '← ' + esc(s.from)) + '</span>';
  h += '<ul>' + x.ships.map(s => '<li><span class="' + (s.res ? 'r-' + s.res : '') + '">' + esc(s.name) + '</span>' + (s.dmg ? ' (damage ' + s.dmg + ')' : '') + note(s) + '</li>').join('') + '</ul>';
  return h + '</div>';
}
function list(arr){ return arr.length ? arr.map(esc).join(', ') : ''; }
function render(){
  const nav = document.getElementById('nav');
  nav.innerHTML = '<button id="prev">◀ Prev</button>' + D.turns.map((t, i) => '<button data-i="' + i + '" class="' + (i === cur ? 'on' : '') + '">T' + t.turn + '</button>').join('') + '<button data-i="sum" class="' + (cur === 'sum' ? 'on' : '') + '">Summary</button><button id="next">Next ▶</button>';
  nav.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { cur = b.dataset.i === 'sum' ? 'sum' : +b.dataset.i; render(); });
  document.getElementById('prev').onclick = () => { if(cur === 'sum') cur = D.turns.length - 1; else if(cur > 0) cur--; render(); };
  document.getElementById('next').onclick = () => { if(cur === 'sum') return; cur = cur < D.turns.length - 1 ? cur + 1 : 'sum'; render(); };
  const v = document.getElementById('view');
  if(cur === 'sum' || !D.turns.length){
    cur = 'sum';
    v.innerHTML = '<h2>Summary</h2><div class="card"><div class="poc">Final POC ' + sgn(D.finalPoc) + ' (' + (D.finalPoc < 0 ? 'Axis victory' : D.finalPoc > 0 ? 'Allied victory' : 'Draw') + ')</div>'
      + '<p>Allied ships sunk: ' + D.sunk.allies.length + ' — ' + (list(D.sunk.allies) || 'none') + '</p>'
      + '<p>Axis ships sunk: ' + D.sunk.axis.length + ' — ' + (list(D.sunk.axis) || 'none') + '. U-boats lost: ' + D.sunk.ubAxis + '</p>'
      + '<table><tr><th>Turn</th><th>Gained</th><th>Total</th></tr>' + D.turns.map(t => '<tr><td>T' + t.turn + '</td><td>' + sgn(t.gain) + '</td><td>' + sgn(t.total) + '</td></tr>').join('') + '</table></div>';
    return;
  }
  const t = D.turns[cur];
  const lbaOf = loc => (t.lba || []).filter(x => x.loc === loc).map(x => '<span class="lba ' + x.side + '">✈' + CTL[x.side] + ' LBA</span>').join('');
  let h = '<h2>Turn ' + t.turn + ': Control</h2><div class="card">' + Object.keys(D.seaName).map(k => D.seaName[k] + ': <b class="' + (t.ctl[k] || '') + '">' + (CTL[t.ctl[k]] || 'none') + '</b>').join(' &nbsp; ')
    + '<div>LBA: ' + (['allies', 'axis'].map(sd => { const x = (t.lba || []).filter(l => l.side === sd); return '<b class="' + sd + '">' + CTL[sd] + '</b> ' + (x.length ? x.map(l => esc(l.name)).join(', ') : 'not used'); }).join(' &nbsp; ')) + '</div>'
    + (t.posture ? '<div>Allied posture: ' + ({ ns:'North Sea heavy', normal:'standard', atl:'Atlantic heavy' })[t.posture] + '</div>' : '')
    + ((t.targeting || []).length ? '<div>Allied targeting: ' + t.targeting.map(x => esc(x.sea) + ' — ' + ({ big:'concentrate on big ships', normal:'standard (fast ships first)', spread:'spread fire' })[x.mode] + ' (' + (x.ratio === null ? '-' : x.ratio + 'x') + ')').join(', ') + '</div>' : '')
    + ((t.convoys || []).length ? '<div>Convoys: ' + t.convoys.map(c => esc(c.name) + ' landed in ' + esc(c.port) + ' (<b class="allies">Allies +' + c.pts + '</b>)').join(', ') + '</div>' : '')
    + '<div class="poc">POC this turn ' + sgn(t.gain) + ' &nbsp; Total ' + sgn(t.total) + '</div></div>';
  h += '<h2>Movement (positions before combat)<span class="legend"><span class="r-sunk">Sunk</span><span class="r-dmg">Damaged</span><span class="r-ret">Returned</span></span></h2><div class="grid">';
  for(const sea of Object.keys(D.seaName)){
    const s = t.seas[sea], c = t.ctl[sea];
    const body = side('allies', s.allies, D.seaName[sea]) + side('axis', s.axis, D.seaName[sea]);
    h += '<div class="card sea ctl-' + (c || 'none') + '" style="grid-area:' + sea + '"><h3><span>' + D.seaName[sea] + lbaOf(sea) + '</span><span class="tag ' + (c || 'none') + '">' + (CTL[c] || 'Uncontrolled') + '</span></h3>' + (body || '<div class="empty">No ships</div>') + '</div>';
  }
  h += '</div>';
  h += '<h2>In port (did not sail)</h2><div class="ports">' + t.ports.map(p => '<div class="card"><h3>' + esc(p.name) + lbaOf(p.loc) + '</h3>' + side('allies', p.allies, p.name, true) + side('axis', p.axis, p.name, true) + '</div>').join('') + '</div>';
  if(t.failed.length) h += '<h2>Failed moves</h2><div class="card"><ul>' + t.failed.map(f => '<li><b class="' + f.side + '">' + CTL[f.side] + '</b> ' + esc(f.name) + ': ' + f.why + ' (stays in ' + esc(f.at) + ')</li>').join('') + '</ul></div>';
  h += '<h2>Combat results</h2>';
  if(!t.combat.length) h += '<div class="card empty">No combat</div>';
  else {
    h += '<div class="card"><table><tr><th>Location</th><th>Allies</th><th>Axis</th></tr>';
    for(const c of t.combat){
      const cell = sd => {
        const r = [];
        if(c.sunk[sd].length) r.push('Sunk: ' + list(c.sunk[sd]));
        if(c.damaged[sd].length) r.push('Damaged: ' + list(c.damaged[sd]));
        if(c.forced[sd].length) r.push('Forced return: ' + list(c.forced[sd]));
        if(c.retreat[sd].length) r.push('Retreated: ' + list(c.retreat[sd]));
        return r.length ? r.join('<br>') : '<span class="empty">No losses</span>';
      };
      h += '<tr><td>' + esc(c.loc) + (c.port ? ' (port)' : '') + '</td><td>' + cell('allies') + '</td><td>' + cell('axis') + '</td></tr>';
    }
    h += '</table></div>';
  }
  v.innerHTML = h;
}
render();
<\/script></body></html>`;
}
function saveGameReport(){
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const name = `war_at_sea_report_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.html`;
  const blob = new Blob([repBuildHtml()], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// ゲーム終了の画面（最終POCとレポートの保存ボタン）
function showReportSave(){
  let el = document.getElementById('reportSaveModal');
  if(!el){
    el = document.createElement('div');
    el.id = 'reportSaveModal';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:1200;';
    document.body.appendChild(el);
  }
  const result = poc < 0 ? '枢軸の勝ち' : poc > 0 ? '連合の勝ち' : '引き分け';
  el.innerHTML = `<div class="modal-box" style="min-width:320px;text-align:center;">
    <h3>ゲーム終了</h3>
    <p style="margin:10px 0;font-size:1.1em;">最終POC ${poc >= 0 ? '+' : ''}${poc}（${result}）</p>
    <p style="margin:6px 0 14px;color:#cde;font-size:0.9em;">ターンごとの移動、戦闘結果、支配、POCのレポートを、このパソコンに保存できます。</p>
    <button class="locBtn" style="background:#2266cc;padding:6px 18px;" onclick="saveGameReport()">レポートを保存</button>
    <button class="locBtn" style="padding:6px 18px;margin-left:8px;" onclick="document.getElementById('reportSaveModal').remove()">閉じる</button>
  </div>`;
}
