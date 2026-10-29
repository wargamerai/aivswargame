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
  if(optionRules.ubNoLimit) opts.push('ubNoLimit');
  if(optionRules.bismarck7) opts.push('bismarck7');
  if(optionRules.usEase) opts.push('usEase');
  const data = { turns: REP.turns, seaName: REP_SEA, finalPoc: poc, opts,
    lang: (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ja',
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
body{ margin:0; background:var(--bg); color:var(--fg); font:14px/1.6 -apple-system,"Helvetica Neue",Arial,"Hiragino Sans",sans-serif; }
.wrap{ max-width:1100px; margin:0 auto; padding:16px; }
.top{ display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
h1{ font-size:20px; margin:0 0 4px; } .sub{ color:var(--mute); font-size:12px; margin-bottom:12px; }
.lang button{ border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:6px; padding:4px 10px; font-size:13px; cursor:pointer; }
.lang button.on{ background:var(--fg); color:var(--bg); }
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
<div class="top"><h1 id="title"></h1><div class="lang"><button id="lEn">English</button> <button id="lJa">日本語</button></div></div>
<div class="sub" id="sub"></div>
<div class="nav" id="nav"></div>
<div id="view"></div>
</div>
<script>
const D = ${JSON.stringify(data).replace(/</g, '\\u003c')};
// 英語と日本語の文言
const TX = {
  en: { title:'War at Sea: Game Report', opt:{ ubNoLimit:'No U-boat limit', bismarck7:'Bismarck class Defense 7', usEase:'Easier US entry' }, none:'none',
    sub:(o) => 'Player (Axis) vs AI (Allies). Optional rules: ' + o + '. POC: + favors the Allies, - favors the Axis.',
    prev:'◀ Prev', next:'Next ▶', summary:'Summary', finalPoc:'Final POC', axisWin:'Axis victory', alWin:'Allied victory', draw:'Draw',
    alSunk:(n) => 'Allied ships sunk: ' + n + ' — ', axSunk:(n) => 'Axis ships sunk: ' + n + ' — ', ubLost:'. U-boats lost: ', turn:'Turn', gained:'Gained', total:'Total',
    ctlHead:(n) => 'Turn ' + n + ': Control', lba:'LBA: ', notUsed:'not used', posture:'Allied posture: ', pst:{ ns:'North Sea heavy', normal:'standard', atl:'Atlantic heavy' },
    targeting:'Allied targeting: ', tgt:(p, s) => 'every ship targeted, ' + (p === 'strong' ? 'strong vs strong' : 'strong vs weak') + ', extra fire on ' + (s === 'strong' ? 'strong' : 'weak') + ' ships',
    convoys:'Convoys: ', landedIn:(n, p, pts) => n + ' landed in ' + p + ' (Allies +' + pts + ')', pocTurn:'POC this turn ', pocTotal:'Total ',
    move:'Movement (positions before combat)', sunk:'Sunk', dmg:'Damaged', ret:'Returned', side:{ allies:'Allies', axis:'Axis' }, unctl:'Uncontrolled', noShips:'No ships',
    stayed:'stayed', moveFailed:'move failed', landed:'landed', damage:(d) => ' (damage ' + d + ')', inPort:'In port (did not sail)', failed:'Failed moves',
    why:{ 'US entry roll failed':'US entry roll failed', '2-area move failed':'2-area move failed' }, staysIn:(p) => ' (stays in ' + p + ')',
    combat:'Combat results', noCombat:'No combat', loc:'Location', cSunk:'Sunk: ', cDmg:'Damaged: ', cForced:'Forced return: ', cRet:'Retreated: ', noLoss:'No losses', port:' (port)',
    lbaTag:(s) => '✈' + s + ' LBA', sep:', ' },
  ja: { title:'海の戦い：ゲームレポート', opt:{ ubNoLimit:'Uボート上限なし', bismarck7:'ビスマルク級 防御7', usEase:'米国投入ダイス緩和' }, none:'なし',
    sub:(o) => 'プレイヤー（枢軸）対 AI（連合）。オプションルール：' + o + '。POCは＋が連合、−が枢軸に有利。',
    prev:'◀ 前へ', next:'次へ ▶', summary:'総括', finalPoc:'最終POC', axisWin:'枢軸の勝ち', alWin:'連合の勝ち', draw:'引き分け',
    alSunk:(n) => '連合の撃沈 ' + n + '隻：', axSunk:(n) => '枢軸の撃沈 ' + n + '隻：', ubLost:'　Uボートの喪失 ', turn:'ターン', gained:'獲得', total:'累計',
    ctlHead:(n) => '第' + n + 'ターン　支配', lba:'LBA：', notUsed:'使わず', posture:'連合の構え：', pst:{ ns:'北海重視', normal:'今まで通り', atl:'大西洋重視' },
    targeting:'連合の割り振り：', tgt:(p, s) => '全艦に割り振り、' + (p === 'strong' ? '強い敵に強い艦' : '弱い敵から強い艦') + '、余りは' + (s === 'strong' ? '強い敵へ' : '弱い敵へ'),
    convoys:'船団：', landedIn:(n, p, pts) => n + ' が' + p + 'に上陸（連合 +' + pts + '）', pocTurn:'このターンのPOC ', pocTotal:'累計 ',
    move:'移動（戦闘直前の位置）', sunk:'撃沈', dmg:'損害', ret:'帰還', side:{ allies:'連合', axis:'枢軸' }, unctl:'支配なし', noShips:'艦なし',
    stayed:'留まる', moveFailed:'移動失敗', landed:'上陸', damage:(d) => '（損害' + d + '）', inPort:'港（出撃しなかった艦）', failed:'移動の失敗',
    why:{ 'US entry roll failed':'米国の参戦ロール失敗', '2-area move failed':'2エリア移動の失敗' }, staysIn:(p) => '（' + p + 'に残る）',
    combat:'戦闘結果', noCombat:'戦闘なし', loc:'場所', cSunk:'撃沈：', cDmg:'損害：', cForced:'強制帰還：', cRet:'撤退：', noLoss:'被害なし', port:'（港）',
    lbaTag:(s) => '✈' + s + 'LBA', sep:'、' }
};
// 場所の名前（英語 → 日本語）
const LOC_JA = { 'North Atlantic':'北大西洋', 'Barents Sea':'バレンツ海', 'North Sea':'北海', 'Baltic Sea':'バルト海', 'Mediterranean':'地中海', 'South Atlantic':'南大西洋',
  'Germany':'ドイツ', 'France':'フランス', 'Italy':'イタリア', 'Malta':'マルタ', 'Britain':'英国', 'USA':'米国', 'Leningrad':'レニングラード', 'Russia':'ロシア', 'Neutral port':'中立港' };
let lang = D.lang;
try { const sv = localStorage.getItem('wasReportLang'); if(sv === 'en' || sv === 'ja') lang = sv; } catch(e){}
const T = () => TX[lang];
const L = name => lang === 'ja' ? (LOC_JA[name] || name) : name;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const sgn = n => (n >= 0 ? '+' : '') + n;
// 戦闘結果の損害の表記「艦名 (damage 2/3)」を言語に合わせる
const dmgText = x => lang === 'ja' ? String(x).replace(/ \\(damage (.*)\\)$/, '（損害$1）') : x;
let cur = 0;
function side(sd, x, locName, inPort){
  if(!x.ships.length) return '';
  let h = '<div class="side"><b class="' + sd + '">' + T().side[sd] + '</b>';
  const note = s => inPort ? (s.landed ? ' <span class="from">' + T().landed + '</span>' : s.failed ? ' <span class="from">' + T().moveFailed + '</span>' : '')
    : ' <span class="from">' + (s.from === locName ? T().stayed : '← ' + esc(L(s.from))) + '</span>';
  h += '<ul>' + x.ships.map(s => '<li><span class="' + (s.res ? 'r-' + s.res : '') + '">' + esc(s.name) + '</span>' + (s.dmg ? T().damage(s.dmg) : '') + note(s) + '</li>').join('') + '</ul>';
  return h + '</div>';
}
function list(arr, f){ return arr.length ? arr.map(x => esc(f ? f(x) : x)).join(T().sep) : ''; }
function render(){
  document.documentElement.lang = lang;
  document.getElementById('title').textContent = T().title;
  document.getElementById('lEn').className = lang === 'en' ? 'on' : '';
  document.getElementById('lJa').className = lang === 'ja' ? 'on' : '';
  document.getElementById('sub').textContent = T().sub(D.opts.length ? D.opts.map(o => T().opt[o] || o).join(T().sep) : T().none);
  const nav = document.getElementById('nav');
  nav.innerHTML = '<button id="prev">' + T().prev + '</button>' + D.turns.map((t, i) => '<button data-i="' + i + '" class="' + (i === cur ? 'on' : '') + '">T' + t.turn + '</button>').join('') + '<button data-i="sum" class="' + (cur === 'sum' ? 'on' : '') + '">' + T().summary + '</button><button id="next">' + T().next + '</button>';
  nav.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { cur = b.dataset.i === 'sum' ? 'sum' : +b.dataset.i; render(); });
  document.getElementById('prev').onclick = () => { if(cur === 'sum') cur = D.turns.length - 1; else if(cur > 0) cur--; render(); };
  document.getElementById('next').onclick = () => { if(cur === 'sum') return; cur = cur < D.turns.length - 1 ? cur + 1 : 'sum'; render(); };
  const v = document.getElementById('view');
  if(cur === 'sum' || !D.turns.length){
    cur = 'sum';
    v.innerHTML = '<h2>' + T().summary + '</h2><div class="card"><div class="poc">' + T().finalPoc + ' ' + sgn(D.finalPoc) + ' (' + (D.finalPoc < 0 ? T().axisWin : D.finalPoc > 0 ? T().alWin : T().draw) + ')</div>'
      + '<p>' + T().alSunk(D.sunk.allies.length) + (list(D.sunk.allies) || T().none) + '</p>'
      + '<p>' + T().axSunk(D.sunk.axis.length) + (list(D.sunk.axis) || T().none) + T().ubLost + D.sunk.ubAxis + '</p>'
      + '<table><tr><th>' + T().turn + '</th><th>' + T().gained + '</th><th>' + T().total + '</th></tr>' + D.turns.map(t => '<tr><td>T' + t.turn + '</td><td>' + sgn(t.gain) + '</td><td>' + sgn(t.total) + '</td></tr>').join('') + '</table></div>';
    return;
  }
  const t = D.turns[cur];
  const lbaOf = loc => (t.lba || []).filter(x => x.loc === loc).map(x => '<span class="lba ' + x.side + '">' + T().lbaTag(T().side[x.side]) + '</span>').join('');
  let h = '<h2>' + T().ctlHead(t.turn) + '</h2><div class="card">' + Object.keys(D.seaName).map(k => esc(L(D.seaName[k])) + ': <b class="' + (t.ctl[k] || '') + '">' + (T().side[t.ctl[k]] || T().none) + '</b>').join(' &nbsp; ')
    + '<div>' + T().lba + (['allies', 'axis'].map(sd => { const x = (t.lba || []).filter(l => l.side === sd); return '<b class="' + sd + '">' + T().side[sd] + '</b> ' + (x.length ? x.map(l => esc(L(l.name))).join(T().sep) : T().notUsed); }).join(' &nbsp; ')) + '</div>'
    + (t.posture ? '<div>' + T().posture + T().pst[t.posture] + '</div>' : '')
    + ((t.targeting || []).length ? '<div>' + T().targeting + t.targeting.map(x => { const m = String(x.mode).split('/'); return esc(L(x.sea)) + ' — ' + (m.length === 2 ? T().tgt(m[0], m[1]) : esc(x.mode)); }).join('; ') + '</div>' : '')
    + ((t.convoys || []).length ? '<div>' + T().convoys + t.convoys.map(c => '<b class="allies">' + esc(T().landedIn(c.name, L(c.port), c.pts)) + '</b>').join(T().sep) + '</div>' : '')
    + '<div class="poc">' + T().pocTurn + sgn(t.gain) + ' &nbsp; ' + T().pocTotal + sgn(t.total) + '</div></div>';
  h += '<h2>' + T().move + '<span class="legend"><span class="r-sunk">' + T().sunk + '</span><span class="r-dmg">' + T().dmg + '</span><span class="r-ret">' + T().ret + '</span></span></h2><div class="grid">';
  for(const sea of Object.keys(D.seaName)){
    const s = t.seas[sea], c = t.ctl[sea];
    const body = side('allies', s.allies, D.seaName[sea]) + side('axis', s.axis, D.seaName[sea]);
    h += '<div class="card sea ctl-' + (c || 'none') + '" style="grid-area:' + sea + '"><h3><span>' + esc(L(D.seaName[sea])) + lbaOf(sea) + '</span><span class="tag ' + (c || 'none') + '">' + (T().side[c] || T().unctl) + '</span></h3>' + (body || '<div class="empty">' + T().noShips + '</div>') + '</div>';
  }
  h += '</div>';
  h += '<h2>' + T().inPort + '</h2><div class="ports">' + t.ports.map(p => '<div class="card"><h3>' + esc(L(p.name)) + lbaOf(p.loc) + '</h3>' + side('allies', p.allies, p.name, true) + side('axis', p.axis, p.name, true) + '</div>').join('') + '</div>';
  if(t.failed.length) h += '<h2>' + T().failed + '</h2><div class="card"><ul>' + t.failed.map(f => '<li><b class="' + f.side + '">' + T().side[f.side] + '</b> ' + esc(f.name) + ': ' + (T().why[f.why] || f.why) + T().staysIn(esc(L(f.at))) + '</li>').join('') + '</ul></div>';
  h += '<h2>' + T().combat + '</h2>';
  if(!t.combat.length) h += '<div class="card empty">' + T().noCombat + '</div>';
  else {
    h += '<div class="card"><table><tr><th>' + T().loc + '</th><th>' + T().side.allies + '</th><th>' + T().side.axis + '</th></tr>';
    for(const c of t.combat){
      const cell = sd => {
        const r = [];
        if(c.sunk[sd].length) r.push(T().cSunk + list(c.sunk[sd]));
        if(c.damaged[sd].length) r.push(T().cDmg + list(c.damaged[sd], dmgText));
        if(c.forced[sd].length) r.push(T().cForced + list(c.forced[sd]));
        if(c.retreat[sd].length) r.push(T().cRet + list(c.retreat[sd]));
        return r.length ? r.join('<br>') : '<span class="empty">' + T().noLoss + '</span>';
      };
      h += '<tr><td>' + esc(L(c.loc)) + (c.port ? T().port : '') + '</td><td>' + cell('allies') + '</td><td>' + cell('axis') + '</td></tr>';
    }
    h += '</table></div>';
  }
  v.innerHTML = h;
}
function setLang(l){ lang = l; try { localStorage.setItem('wasReportLang', l); } catch(e){} render(); }
document.getElementById('lEn').onclick = () => setLang('en');
document.getElementById('lJa').onclick = () => setLang('ja');
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
