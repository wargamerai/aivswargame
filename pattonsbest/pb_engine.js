// パットンズ・ベスト — ゲームのルール（画面とは分けてある。node でも動く）
'use strict';
if (typeof module !== 'undefined' && typeof PB === 'undefined') { global.PB = require('./pb_tables.js'); }
if (typeof L === 'undefined') { var L = (j, e) => j; }
// 判定の記録: JUDGE なら、すべてのダイスの判定を記録する。画面には出さず止めない（あとで確認する用。ユーザーの指示 2026-11-04）
var JUDGE = false;
function setJudge(v) { JUDGE = !!v; }
function J(t) { if (JUDGE) say(t, 'judge'); }
const rr10 = () => 1 + Math.floor(Math.random() * 10);
const rr100 = () => 1 + Math.floor(Math.random() * 100);
const d10 = lab => { const n = rr10(); J(`${lab || L('判定', 'Roll')}: 1D = ${n}`); return n; };
const d100 = lab => { const n = rr100(); J(`${lab || L('判定', 'Roll')}: 2D = ${n}`); return n; };
const sg = n => (n >= 0 ? '+' : '') + n;
// 判定の結果を言葉にする
const ACT_WORD = a => ({ none: L('何もしない', 'do nothing'), F: L('前方へ移動', 'move forward'), B: L('後方へ移動', 'move back'), L: L('左へ移動', 'move left'), R: L('右へ移動', 'move right'), inf: L('味方の歩兵を撃つ', 'fire at infantry'), any: L('味方の戦車を撃つ', 'fire at any tank'), any3: L('味方の戦車を撃つ(こちらが狙っていれば自分を撃つ)', 'fire at any tank (you if you target it)'), any4: L('味方の戦車を撃つ(こちらが狙っていれば自分を撃つ)', 'fire at any tank (you if you target it)'), you: L('自分の戦車を撃つ', 'fire at YOUR tank'), lead: L('先頭戦車を撃つ', 'fire at the lead tank'), coll: L('自分の戦車へ小火器(付随損害)', 'small arms at your tank'), leadcoll: L('先頭戦車へ小火器', 'small arms at the lead tank') }[a] || a);
const ENEMY_WORD = n => ({ LW: L('歩兵火器', 'light weapons'), MG: L('機関銃班', 'MG team'), TRUCK: L('トラック', 'truck'), PSW: L('装甲車', 'armored car'), AT: L('対戦車砲', 'AT gun'), SPG: L('自走砲', 'SP gun'), TANK: L('戦車', 'tank') }[String(n).replace(/[12]$/, '')] || n);
const WOUND_WORD = k => ({ near: L('かすり傷もなし', 'near miss'), uncon: L('気絶', 'unconscious'), light: L('軽傷', 'light wound'), out1: L('1週間離脱', 'out 1 week'), outD: L('重傷、数週間離脱', 'out for weeks'), home: L('重傷、本国送還', 'sent home'), kia: L('戦死', 'killed') }[k] || k);
const EVENT_WORD = e => ({ time: L('時間の経過(15分)', 'time passes'), fart: L('味方の砲撃', 'friendly artillery'), eart: L('敵の砲撃', 'enemy artillery'), mine: L('地雷', 'mines'), pf: L('パンツァーファウスト攻撃', 'panzerfaust attack'), har: L('妨害射撃', 'harassing fire'), fadv: L('味方の前進', 'friendly advance'), rein: L('敵の増援', 'enemy reinforcement'), eadv: L('敵の前進', 'enemy advance'), flank: L('味方の側面射撃', 'flanking fire') }[e] || e);
const WHY_WORD = w => ({ art: L('味方の砲撃', 'artillery'), air: L('味方の航空攻撃', 'air strike'), adv: L('前進射撃', 'advancing fire'), friend: L('味方部隊の射撃', 'friendly forces') }[w] || w);
const DRIVE_WORD = a => ({ fwd: L('前進', 'forward'), rev: L('後退', 'reverse'), fwdHD: L('前進して車体隠蔽', 'forward to hull down'), revHD: L('後退して車体隠蔽', 'reverse to hull down') }[a] || a);
const WEAPON_WORD = k => ({ bow: L('車体機銃', 'bow MG'), coax: L('同軸機銃', 'coax MG'), aa: L('.50機銃', '.50 MG'), sub: L('短機関銃', 'sub MG'), main: L('主砲', 'main gun') }[k] || k);
const AMMO_WORD = a => ({ HE: L('榴弾HE', 'HE'), AP: L('徹甲弾AP', 'AP'), WP: L('白燐弾WP', 'WP'), HCBI: L('発煙弾HCBI', 'HCBI'), HVAP: L('高速徹甲弾HVAP', 'HVAP') }[a] || a);
const UNIT_WORD = t => { const d = PB.UNIT[t]; return d ? L(d.name, d.en) : t; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pick = a => a[Math.floor(Math.random() * a.length)];
const rowOf = (rows, n) => rows.find(r => n <= r[0])[1];
const NAMES = ['Baker', 'Miller', 'Kowalski', 'Sullivan', 'Rossi', 'Johnson', 'Hayes', 'Novak', 'Walker', 'Martinez', 'Cohen', 'Becker', 'Murphy', 'Taylor', 'Reed', 'Carter', 'Brooks', 'Dunn', 'Ward', 'Foster', 'Price', 'Long', 'Ellis', 'Grant'];
const POS = ['C', 'G', 'L', 'D', 'A'];
const POS_NAME = { C: () => L('車長', 'Commander'), G: () => L('砲手', 'Gunner'), L: () => L('装填手', 'Loader'), D: () => L('操縦手', 'Driver'), A: () => L('副操縦手', 'Asst. driver') };
const RANKS = [() => L('軍曹', 'Sergeant'), () => L('二等軍曹', 'Staff Sergeant'), () => L('少尉', '2nd Lieutenant'), () => L('中尉', '1st Lieutenant'), () => L('大尉', 'Captain')];
// 乗員の名前は重ならないようにする
const newMan = () => { const used = typeof G !== 'undefined' && G && G.crew ? Object.values(G.crew).map(m => m.name) : (newMan.used || []); const free = NAMES.filter(n => !used.includes(n)); const name = pick(free.length ? free : NAMES); newMan.used = used.concat(name); return { name, rating: Math.ceil(d10(L('補充兵の腕前','Replacement rating')) / 2), status: 'ok', kills: 0, days: 0 }; };

let G = null;
let LOG = () => {};
function setLogger(f) { LOG = f; }
let SAYN = 0; // ログに出した行の数（こちらの行動ごとに止めるのに使う）
function say(text, cls) { if (cls !== 'judge') SAYN++; LOG(text, cls || ''); }
// こちらの行動の1つが終わったら、何か出ていれば一度止める（ユーザーの指示 2026-11-08）
// 車長の短い返事（止まるボタンの文字。セリフのやり取りにする。ユーザーの指示 2026-11-08）
const ack = () => pick([L('了解', 'Roger'), L('分かった', 'Got it'), L('よし', 'Right'), L('続けろ', 'Carry on')]);
function stepDone(n0) { if (SAYN !== n0 && SAYN !== LASTPAUSE && G.phase === 'battle') PAUSE(ack()); }
// 判定の前で止まる（画面が車長の確認を待つ）。text=止まる時のセリフ、label=ボタンの言葉
let PAUSE = () => {};
let LASTPAUSE = -1; // 最後に止めたときのログの行の数（同じところで2回止めない）
function setPause(f) { PAUSE = label => { LASTPAUSE = SAYN; f(label); }; }
function stop(text, label, cls) { if (text) say(text, cls); PAUSE(label || L('続けろ', 'Go on')); }
const crewN = p => (G.crew[p] && G.crew[p].name) || '';
const alive = p => G.crew[p] && G.crew[p].status === 'ok';
const unitName = u => { const t = u.type || u.shown; const d = PB.UNIT[t]; return d ? L(d.name, d.en) : t; };
// 種類が分からない敵は、戦車・自走砲・対戦車砲のどれかだけを言う（型まで言うと分かってしまう。ユーザーの指示 2026-11-08）
const unitLabel = u => u.identified === false ? L('種類の分からない', 'Unidentified ') + ({ TANK: L('戦車', 'tank'), SPG: L('自走砲', 'SPG'), AT: L('対戦車砲', 'AT gun') }[u.cls] || unitName(u)) : unitName(u);
const sectorIdx = s => PB.SECTORS.indexOf(s);
// 地図から消えた敵の記録（地図に、元の場所の薄い駒と矢印・×を出すため。ユーザーの指示 2026-11-08）
const goneRec = (u, how) => ({ id: u.id, s: u.sector, r: u.range, spot: u.spot, name: unitLabel(u), type: u.type, shown: u.shown, cls: u.cls, identified: u.identified, how, killed: how !== 'out' });
function markGone(u, how) { const b = G.bb; if (b) b.gone = (b.gone || []).concat([goneRec(u, how)]); }
// 見つけていない敵は、地図と同じ番号（?5 など）を付ける
const tagOf = u => (u && u.spot !== 'spotted' ? `(?${u.id})` : '');
const rangeName = r => [L('近距離', 'close'), L('中距離', 'medium'), L('遠距離', 'long')][r];
const sectorName = s => L('セクター', 'sector ') + PB.SECTOR_NAME[s];

function newCampaign(opts) {
  G = null; newMan.used = [];
  const crew = {};
  const rolls = POS.map(() => Math.ceil(rr10() / 2)).sort((a, b) => b - a);
  ['C', 'G', 'D', 'L', 'A'].forEach((p, i) => { crew[p] = newMan(); crew[p].rating = rolls[i]; });
  crew.C.name = (opts && opts.name) || crew.C.name;
  G = {
    calIdx: 0, crew, tankId: 1, tankName: (opts && opts.tank) || 'Patton\'s Best', totalVP: 0, rank: 0, promoMonth: null, medals: [], gyro: false,
    days: 0, battles: 0, kills: { }, wounded: [], over: null, journal: [], phase: 'calendar', hvss: false,
    start: { rating: rolls.reduce((a, b) => a + b, 0) },
  };
  return G;
}
function tank() { return PB.TANKS[G.tankId]; }
function today() { return PB.CAL[G.calIdx]; }
const dateText = c => c.refit ? L('再編', 'Refit') : `${c.year}/${c.mon}/${c.day}`;

// ===== 4.1 暦 =====
function nextDay() {
  G.day = null;
  if (G.calIdx >= PB.CAL.length) { G.over = { win: true, why: L('第4機甲師団の戦いは終わった。生きて終戦を迎えた。', 'The 4th Armored\'s war is over. You survived.') }; G.phase = 'over'; return { over: true }; }
  const c = today();
  if (c.refit) { G.calIdx++; return refit(c.refit); }
  const r = rr10();
  say(`── ${dateText(c)} ${c.note ? '「' + c.note + '」' : ''} ` + L(`作戦判定 ${r}（${c.prob}以下で出撃）`, `combat check ${r} (need ${c.prob} or less)`), 'date');
  G.calIdx++;
  if (r > c.prob) {
    say(pick([L('今日は師団の後方で待機。缶詰の夕食がうまい。', 'Held in reserve today. The canned dinner tastes fine.'), L('前線は別の部隊の持ち場だ。整備と手紙で一日が暮れた。', 'Another unit has the line. Maintenance and letters fill the day.'), L('砲声は遠い。乗員は久しぶりに眠った。', 'The guns are distant. The crew finally sleeps.')]));
    return { skipped: true };
  }
  stop(pick([L(`無線が入った。「全車、エンジン始動。${c.note ? c.note + '方面へ' : '前線へ'}向かう」`, `The radio crackles: "All tanks, start engines. We move${c.note ? ' on ' + c.note : ' up'}."`), L('中隊長の声が響く。「今日は戦うぞ。全車、ついて来い」', 'The company commander\'s voice: "We fight today. All tanks, follow me."'), L(`夜明け前、${crewN('D')}がエンジンを回した。冷えた鋼鉄が震える。`, `Before dawn ${crewN('D')} turns the engine over. Cold steel shudders.`)]), L('出撃する', 'Mount up'), 'head');
  return morning(c);
}
function refit(days) {
  say(L(`── 師団は再編に入った（${days}日間）。`, `── The Division goes into refit (${days} days).`), 'date');
  const back = G.wounded.filter(w => w.pos); back.forEach(w => { w.left -= days; });
  if (days >= 7) {
    for (const p of POS) { const m = G.crew[p]; if (m.rating < 10 && d10(L(`${m.name}の訓練(腕前${m.rating}より上で向上)`, `${m.name} training`)) > m.rating) { m.rating++; say(L(`${POS_NAME[p]()} ${m.name} は訓練で腕を上げた（${m.rating}）。`, `${POS_NAME[p]()} ${m.name} improved in training (${m.rating}).`), 'good'); } }
    const sum = POS.reduce((t, p) => t + G.crew[p].rating, 0);
    if (!G.gyro && sum >= 30) { G.gyro = true; say(L('乗員はジャイロスタビライザーの訓練を終えた。走りながら主砲を撃てる。', 'The crew is now gyrostabilizer trained: the main gun can fire on the move.'), 'good'); }
  }
  return { refit: days, canChangeTank: true };
}
// 24.0 新しい戦車（カードの情報が揃う型だけ。月で入手しやすさが変わる）
function replaceTank(choose) {
  const c = PB.CAL[Math.min(G.calIdx, PB.CAL.length - 1)];
  // 24.0 戦車補充表。列は 8/44〜4/45（7月は 8/44 を使う）。再編中は次に戦う月の列
  let c2 = c; if (c.refit) { for (let k = G.calIdx; k < PB.CAL.length; k++) if (!PB.CAL[k].refit) { c2 = PB.CAL[k]; break; } if (c2.refit) c2 = { mon: 4 }; }
  const col = { 7: 0, 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 1: 5, 2: 6, 3: 7, 4: 8 }[c2.mon];
  const r = d100(L('戦車補充', 'Tank replacement')); let id = 16;
  for (let k = 1; k <= 17; k++) { const up = PB.REPLACE[k][col]; if (up != null && r <= up) { id = k; break; } }
  if (choose && PB.TANKS[choose]) id = choose;
  G.tankId = id;
  // 5.25 HVSS: カードの範囲内なら付いている（1944年11月より前は付かない）
  { const hv = tank().hvss; const cc = c2 && c2.mon ? c2 : { mon: 8 }; const late = cc.mon === 11 || cc.mon === 12 || cc.mon <= 4; G.hvss = !!(hv && late && d10('HVSS') <= hv); }
  say(L(`新しい戦車が届いた: #${id} ${tank().model}（${tank().gun}mm砲、装甲クラス${tank().armor}）`, `New tank issued: #${id} ${tank().model} (${tank().gun}mm gun, armor class ${tank().armor})`), 'good');
}
// ===== 4.2 朝 =====
function rollWeather(c) {
  const mon = c.mon, col = mon <= 8 ? 0 : mon <= 11 && mon >= 9 ? 1 : mon === 12 || mon <= 2 ? 2 : 3;
  const T = [[69, 88, 91, 97, 100, 100], [61, 72, 75, 91, 97, 100], [44, 50, 50, 50, 58, 100], [53, 71, 75, 91, 97, 100]][col];
  const r = rr100(); const i = T.findIndex(x => r <= x);
  J(L(`天候: 2D = ${r} → ${['晴れ', '曇り', '霧', '泥濘', '泥濘・曇り', '雪'][i]}`, `Weather: 2D = ${r} → ${['clear', 'overcast', 'fog', 'mud', 'mud/overcast', 'snow'][i]}`));
  let w = ['clear', 'overcast', 'fog', 'mud', 'mudover', 'snow'][i];
  const out = { base: w, overcast: w === 'overcast' || w === 'mudover', mud: w === 'mud' || w === 'mudover', fog: w === 'fog', fall: false, ground: false, deep: false, rain: false, rainH: 0, snowDay: false };
  if (w === 'snow') {
    if (mon !== 11 && mon !== 3 && mon !== 12 && mon !== 1 && mon !== 2) { out.overcast = true; out.base = 'overcast'; return out; }
    let s = d10(L('雪の表', 'Snow table')) + (mon === 12 || mon <= 2 ? 1 : 0) - (mon === 3 || mon === 11 ? 1 : 0);
    out.fall = [0, 1, 4, 5, 10, 11].includes(s); out.snowDay = out.fall; out.ground = [2, 3, 4, 5, 6, 7].includes(s); out.deep = [8, 9, 10, 11].includes(s);
  }
  return out;
}
const weatherText = w => { const a = []; if (w.fog) a.push(L('霧', 'Fog')); if (w.fall) a.push(L('降雪', 'Falling snow')); if (w.deep) a.push(L('深雪', 'Deep snow')); else if (w.ground) a.push(L('積雪', 'Ground snow')); if (w.mud) a.push(L('泥濘', 'Mud')); if (w.rain) a.push(L('雨', 'Rain')); if (w.overcast) a.push(L('曇り', 'Overcast')); return a.join('・') || L('晴れ', 'Clear'); };
// 即応弾架の既定（28.0: 半分以上AP、煙1〜2発、残りHE。76はAP75%、HE25%）
function defaultRack(t) { if (t.gun === 76) { const ap = Math.round(t.rack * .75); return { AP: ap, HE: t.rack - ap, WP: 0, HCBI: 0, HVAP: 0 }; } const ap = Math.ceil(t.rack / 2); return { AP: ap, WP: 1, HE: t.rack - ap - 1, HCBI: 0, HVAP: 0 }; }
// 朝の弾薬の積み方（4.26）。he は残り。ap/wp は主砲弾の数、rack は弾種ごとの即応弾架の数、vol は任意の追加（30発まで）
function setLoad(o) {
  const d = G.day, t = tank();
  const req = d.extraReq != null ? d.extraReq : d.extra, vol = clamp(o.vol || 0, 0, 30);
  d.extraReq = req; d.extra = req + vol;
  const total = t.rounds + req + vol;
  const wp = t.gun === 75 ? clamp(o.wp || 0, 0, total) : 0, ap = clamp(o.ap || 0, 0, total - wp), he = total - wp - ap;
  d.ammo.HE = Math.max(0, he - d.heSpent); d.ammo.AP = ap; d.ammo.WP = wp;
  d.base = total; d.overload = req + vol > 0;
  if (o.rack) { let left = t.rack; const r = {}; for (const k of ['AP', 'HE', 'WP', 'HCBI', 'HVAP']) { const n = clamp(o.rack[k] || 0, 0, Math.min(left, d.ammo[k] || 0)); r[k] = n; left -= n; } d.rack = r; }
  d.loaded = true;
}
function morning(c) {
  G.days++;
  const t = tank();
  // 欠員を埋める
  for (const p of POS) if (['kia', 'out', 'home'].includes(G.crew[p].status)) { const old = G.crew[p]; const wback = G.wounded.find(w => w.pos === p && w.left <= 0); if (wback) { G.crew[p] = wback.man; G.crew[p].status = 'ok'; G.wounded = G.wounded.filter(x => x !== wback); say(L(`${wback.man.name} が病院から戻ってきた。`, `${wback.man.name} is back from the hospital.`), 'good'); } else { G.crew[p] = newMan(); say(L(`補充兵 ${G.crew[p].name} が${POS_NAME[p]()}として乗り込む（腕前${G.crew[p].rating}）。`, `Replacement ${G.crew[p].name} joins as ${POS_NAME[p]()} (rating ${G.crew[p].rating}).`)); } }
  POS.forEach(p => { G.crew[p].status = 'ok'; G.crew[p].periscope = true; });
  const w = rollWeather(c);
  const [rise, set] = PB.SUN[c.mon];
  const roll = rr10();
  const elapsed = Math.floor(roll / 2) + 1;
  J(L(`経過時間: 1D = ${roll} → 日の出から${elapsed}時間、HE ${roll * 2}発使用済み`, `Time elapsed: 1D = ${roll} → ${elapsed} hours, ${roll * 2} HE used`));
  // 追加弾薬表（1Dの1回の出目で決める）
  const xr = rr10();
  J(L(`追加弾薬: 1D = ${xr}`, `Extra ammo: 1D = ${xr}`));
  const needExtra = xr <= 2 ? 0 : xr <= 6 ? (c.sc === 'A' ? 20 : 0) : (c.sc === 'A' ? 30 : 10);
  const total = t.rounds + needExtra;
  // 既定の積み方はルールのヒント（28.0）。朝の画面で自分で変えられる
  const he = Math.round(total * .6), wp = t.gun === 75 ? Math.round(total * .1) : 0, ap = total - he - wp;
  const hvapR = t.gun === 76 ? d10('HVAP') : 0;
  G.day = {
    c, sc: c.sc, res: c.res, w, set, time: rise + elapsed * 60, rise, freeCheck: true, ammo: { HE: Math.max(0, he - roll * 2), AP: ap, WP: wp, HCBI: t.gun === 75 ? d10('HCBI') : 0, HVAP: t.gun === 76 ? (hvapR <= 3 ? 1 : hvapR <= 7 ? 2 : 3) : 0 }, extra: needExtra,
    start: rise + elapsed * 60, areas: 0, exits: 0, lostN: 0, lostEx: 0, fko: {}, fortT: 0, fortF: 0, notes: [], smokeBomb: t.mortar ? 14 : 0, grenades: 6, periscopes: 6, heSpent: roll * 2, base: total, overload: false, rack: defaultRack(t),
    vpTank: 0, vpFriend: 0, vpArea: 0, vpLost: 0, tanksLost: 0, squadsLost: 0, ko: {}, broken: { main: false, coax: false, bow: false, aa: false, sight: false }, jam: { main: false, coax: false, bow: false, aa: false },
    woundsToday: false, cmdExposedColl: false, lead: false, status: 'ok', map: null, areaIdx: null, medalBonus: 0,
  };
  say(L(`${c.sc === 'A' ? '進撃' : c.sc === 'B' ? '戦闘' : '反撃阻止'}作戦。予想される抵抗: ${{ L: '軽', M: '中', H: '重' }[c.res]}。天候: ${weatherText(w)}。`, `${{ A: 'Advance', B: 'Battle', C: 'Counterattack' }[c.sc]} scenario. Expected resistance: ${{ L: 'Light', M: 'Medium', H: 'Heavy' }[c.res]}. Weather: ${weatherText(w)}.`), 'head');
  say(pick([L(`${G.crew.D.name}「エンジン快調。今日も無事に帰りましょうや」`, `${G.crew.D.name}: "Engine's sweet. Let's all get home today."`), L(`${G.crew.L.name}が砲弾を数えながら口笛を吹く。`, `${G.crew.L.name} whistles as he counts the rounds.`), L(`${G.crew.G.name}は照準器のレンズを丁寧に拭いた。`, `${G.crew.G.name} carefully wipes the gunsight.`), L('砲兵の朝の射撃が地平線の向こうで始まった。', 'The morning barrage begins beyond the horizon.')]));
  say(L(`日の出から${elapsed}時間が経過。出撃 ${clock(G.day.time)}、日没 ${clock(set)}。`, `${elapsed} hours past sunrise. Start ${clock(G.day.time)}, sunset ${clock(set)}.`));
  G.phase = c.sc === 'C' ? 'ca' : 'move';
  G.day.map = makeMap();
  G.bb = freshBoard();
  placeStart();
  return { combat: true };
}
const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function freshBoard() {
  const t = tank();
  const deploy = rr100(); const heavy = G.tankId === 12 || G.tankId === 13; // 配置表 II
  const hd = deploy <= (heavy ? 8 : 20); const mv = deploy >= (heavy ? 37 : 58);
  J(L(`自分の戦車の配置: 2D = ${deploy} → ${hd ? '車体隠蔽' : mv ? '移動中' : '停止'}`, `Deployment: 2D = ${deploy} → ${hd ? 'hull down' : mv ? 'moving' : 'stopped'}`));
  const b = { units: [], smoke: {}, us: { 1: true, 2: true, 3: true }, facing: 0, turret: 0, moving: mv, hull: hd, thrown: false, bogged: false, assist: false, acq: null, advFire: {}, advMG: {}, round: 0, smokeOnTank: 0, enemyAcq: {}, firstShotAt: null };
  if (heavy ? ((deploy >= 32 && deploy <= 36) || deploy >= 64) : (deploy === 57 || deploy >= 91)) { if (G.day) G.day.lead = true; }
  b.load = 'HE'; b.reload = 'HE'; b.useRack = false;
  b.hatch = { C: true, G: false, L: t.loaderHatch, D: true, A: true };
  void t;
  return b;
}
// ===== 地図（移動盤）=====
function makeMap() {
  const areas = PB.AREAS.map((a, id) => ({ id, x: a[0], y: a[1], type: a[2], edge: a[3] || null, res: null, us: false, art: 0, air: 0, left: [] }));
  const roads = PB.ROADS;
  return { areas, roads, start: null, exit: null, cur: null };
}
const roadKey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
function neighbors(a, areas) { const L2 = areas || G.day.map.areas; return PB.ADJ[a.id].map(i => L2[i]); }
function placeStart() {
  const m = G.day.map;
  const s = d10(L('開始区域', 'Start area'));
  const st = m.areas.find(a => a.edge === s);
  m.start = st.id; m.cur = st.id; st.us = true;
  const ex = PB.EXIT[d10(L('出口区域', 'Exit area')) - 1][s - 1];
  m.exit = m.areas.find(a => a.edge === ex).id;
  say(L(`任務: 地図の${s}番から${ex}番の区域まで進め。`, `Orders: drive from area ${s} to area ${ex}.`));
}
function rollResistance(a) {
  const mod = a.type === 'A' ? 1 : a.type === 'C' ? 2 : 0;
  const rawR = rr10(), r = rawR + mod, res = G.day.res;
  J(L(`この区域の敵の抵抗(${a.type}区域、今日は${res}): 1D = ${rawR} ${sg(mod)} = ${r}`, `Resistance (${a.type}, day ${res}): 1D = ${rawR} ${sg(mod)} = ${r}`));
  if (res === 'L') return r <= 7 ? 'L' : 'M';
  if (res === 'M') return r <= 5 ? 'L' : r <= 9 ? 'M' : 'H';
  return r <= 4 ? 'L' : r <= 8 ? 'M' : 'H';
}
const spend = m => { const d = G.day, h0 = Math.floor(d.time / 60); d.time += m; for (let h = h0 + 1; h <= Math.floor(d.time / 60); h++) weatherHour(); };
// 天候の効果: 曇りは毎時の始めに雨の判定、雨が2時間で泥濘。降雪も毎時に止む・また降る
function weatherHour() {
  const w = G.day.w;
  if (w.overcast) {
    const r = d10(L('雨の判定(降っていれば1-5で止む、なければ9-10で降る)', 'Rain check'));
    if (w.rain) { w.rainH++; if (r <= 5) { w.rain = false; say(L('雨が止んだ。', 'The rain stops.')); } }
    else if (r >= 9) { w.rain = true; say(L('雨が降り出した。', 'It starts to rain.')); }
    if (w.rainH >= 2 && !w.mud) { w.mud = true; say(L('雨で道がぬかるんできた。', 'The rain has turned the ground to mud.'), 'warn'); }
  }
  if (w.snowDay) {
    const r = d10(L('雪の判定(9-10で止む・また降る)', 'Snow check'));
    if (w.fall && r >= 9) { w.fall = false; say(L('雪が止んだ。', 'The snow stops.')); }
    else if (!w.fall && r >= 9) { w.fall = true; say(L('また雪が降り出した。', 'It starts snowing again.')); }
  }
}
const dayDone = () => G.day.time >= G.day.set;
function opCheck(id) { const d = G.day, a = d.map.areas[id]; if (d.freeCheck) d.freeCheck = false; else spend(15); a.res = rollResistance(a); say(L(`斥候の報告: 前方の区域の抵抗は${{ L: '軽', M: '中', H: '重' }[a.res]}。`, `Scouts report ${{ L: 'light', M: 'medium', H: 'heavy' }[a.res]} resistance ahead.`)); return dayEndCheck(); }
// 支援砲撃の結果は、ボタンで一度止めて見せる（ユーザーの指示 2026-11-08）
function opArt(id) { spend(15); const a = G.day.map.areas[id]; const r = d10(L('砲兵の到着(1-7)', 'Artillery arrives (1-7)')); const cn = G.crew.C.name, w = crewN('L') || crewN('A');
  // 頼んだ結果は無線のやり取りのセリフで出す。ダイスの目は出さない（判定の記録には残る。ユーザーの指示 2026-11-08）
  if (r <= 7) { a.art++; stop(pick([L(`${w}「${cn}隊長、砲兵から返答です。支援射撃の要請、了解とのこと！」`, `${w}: "Sergeant ${cn}, artillery acknowledges. Fire mission approved!"`), L(`${w}「隊長、砲兵が目標を了解しました。その区域に入ったら撃ってくれます！」`, `${w}: "Sarge, the guns have the target. They'll fire when we go in!"`)]), L('よし', 'Good'), 'good'); }
  else stop(pick([L(`${w}「${cn}隊長、砲兵は他の任務で手が回らないそうです」`, `${w}: "Sergeant ${cn}, the guns are busy elsewhere."`), L(`${w}「だめです、隊長。砲兵の支援は出せないとのことです」`, `${w}: "No luck, Sarge. No artillery for us."`)]), L('仕方ない', 'Can\'t be helped'));
  return dayEndCheck(); }
// 航空支援の結果も、ボタンで一度止めて見せる（ユーザーの指示 2026-11-08）
function opAir(id) { const w0 = G.day.w, cn = G.crew.C.name, w = crewN('L') || crewN('A');
  if (w0.overcast || w0.fog || w0.fall) { stop(L(`${w}「${cn}隊長、この天気では飛行機は飛べないそうです」`, `${w}: "Sergeant ${cn}, no planes in this weather."`), L('そうか', 'I see')); return null; }
  spend(30); const a = G.day.map.areas[id]; const r = d10(L('航空攻撃の到着(1-4)', 'Air strike arrives (1-4)'));
  if (r <= 4) { a.air++; stop(pick([L(`${w}「${cn}隊長、航空支援の要請が受理されました！ P-47が上空に入ります！」`, `${w}: "Sergeant ${cn}, air support approved! P-47s are on their way!"`), L(`${w}「隊長、P-47が来てくれます！ その区域に入ったら仕掛けてくれます！」`, `${w}: "Sarge, the Jugs are coming! They'll hit the area when we go in!"`)]), L('よし', 'Good'), 'good'); }
  else stop(pick([L(`${w}「${cn}隊長、航空支援は出せないそうです」`, `${w}: "Sergeant ${cn}, no air support available."`), L(`${w}「だめです、隊長。飛行機は他へ回されています」`, `${w}: "No good, Sarge. The planes are busy elsewhere."`)]), L('仕方ない', 'Can\'t be helped'));
  return dayEndCheck(); }
function opResupply() { spend(60); if (d10(L('補給(1-7)', 'Resupply (1-7)')) <= 7) { const t = tank(); const d = G.day; const sum = d.ammo.HE + d.ammo.AP + d.ammo.WP; const need = Math.max(0, t.rounds - sum); d.ammo.HE += Math.round(need * .55); d.ammo.AP += need - Math.round(need * .55); restockRack(); say(L(`補給が届いた。主砲弾${need}発を積み込む。`, `Resupply arrives: ${need} rounds taken aboard.`), 'good'); } else say(L('補給車は来なかった。', 'The supply trucks never came.')); return dayEndCheck(); }
function dayEndCheck() { if (dayDone()) { say(L('日が暮れた。', 'Night falls.')); return debrief(); } return null; }
function enterTime(a, b) {
  const road = G.day.map.roads[roadKey(a.id, b.id)];
  const w = G.day.w;
  return (road === 'imp' ? 15 : road === 'dirt' ? 30 : 45) + (w.mud || w.fog || w.rain || w.ground || w.deep ? 15 : 0);
}
function opEnter(id, adv, zones, noTime) {
  const d = G.day, m = d.map, cur = m.areas[m.cur], a = m.areas[id];
  stop(pick([L(`「${crewN('D')}、前進。あの${areaName(a)}へ入るぞ」`, `"${crewN('D')}, move out. We're going into ${areaName(a)}."`), L(`機動部隊が${areaName(a)}へ動き出す。全員が息をひそめた。`, `The task force rolls toward ${areaName(a)}. Nobody breathes.`), L(`「目を離すな。あそこに何かいる気がする」`, `"Keep your eyes open. I don't like the look of it."`)]), L('進め', 'Advance'));
  if (!noTime) spend(enterTime(cur, a)); // 11.33 前進で離れた時は時間を使わない
  if (noTime && d.advFrom != null) m.cur = d.advFrom;
  d.advChoice = null; d.advFrom = null;
  m.prev = m.cur; m.cur = id;
  d.freeCheck = true; // 4.53
  if (adv) { if (G.bb) G.bb.load = 'HE'; const n = Math.floor(d10(L('前進射撃の弾薬', 'Advancing fire ammo')) / 2); d.ammo.HE = Math.max(0, d.ammo.HE - n); say(L(`前進射撃。榴弾${n}発を撃ち込みながら進む。`, `Advancing fire: ${n} HE rounds as you roll in.`)); }
  if (a.us) { say(L('味方の支配区域を通過。', 'Moving through friendly ground.')); return dayEndCheck(); }
  if (!a.res) a.res = rollResistance(a);
  const mod = a.type === 'A' ? 1 : a.type === 'C' ? 2 : 0;
  const need = { L: 8, M: 6, H: 4 }[a.res];
  const rawB = rr10(), roll = rawB + mod;
  J(L(`戦闘の判定(抵抗${a.res}は${need}以上): 1D = ${rawB} ${sg(mod)} = ${roll} → ${roll >= need ? '戦闘' : 'なし'}`, `Battle check (${a.res} needs ${need}+): 1D = ${rawB} ${sg(mod)} = ${roll}`));
  if (roll >= need || a.left.length) { spend(15); return startBattle(a, adv ? (zones || autoZones()) : null); }
  say(pick([L('村には白旗が出ていた。敵は引き上げた後だ。', 'White flags in the village. The enemy has gone.'), L('抵抗なし。農夫が帽子を振っている。', 'No resistance. A farmer waves his hat.'), L('空の塹壕だけが残っていた。', 'Only empty foxholes remain.')]));
  return capture(a);
}
// 前進射撃のマーカーの数（22.12）。味方戦車の損失3両ごとに1個減る（切り上げ）
function advMarkers() { return Math.max(0, 6 - Math.ceil((G.day.tanksLost || 0) / 3)); }
function autoZones() { const z = {}, n = advMarkers(), k = ['45:0', '68:0', '910:0', '45:1', '68:1', '910:1']; for (let i = 0; i < n; i++) z[k[i]] = (z[k[i]] || 0) + 1; return z; }
function capture(a) {
  const d = G.day, m = d.map;
  a.us = true;
  if (a.id === m.exit) {
    d.vpArea += 10; d.exits++;
    say(L('目標区域を確保した！ 勝利点+10。新たな任務が来た。', 'Exit area captured! +10 VP. New orders arrive.'), 'good');
    d.map = makeMap(); placeStart();
  } else { d.vpArea += 1; d.areas++; say(L('この区域を確保。勝利点+1。', 'Area secured. +1 VP.')); }
  return dayEndCheck();
}
// ===== 4.6 戦闘の開始 =====
function activate(type, cols) {
  const c = G.day.c, sc = G.day.sc;
  const r = rr100(); const name = PB.ACT[sc][Math.min(19, Math.floor((r - 1) / 5))];
  J(L(`現れる敵の種類: 2D = ${r} → ${ENEMY_WORD(name)}`, `Activation: 2D = ${r} → ${ENEMY_WORD(name)}`));
  const late1 = (c.year === 1945 && c.mon >= 2), late2 = (c.year === 1945 && c.mon >= 3);
  let k = name.replace(/[12]$/, '');
  if (name.endsWith('1') && late1) k = 'LW';
  if (name.endsWith('2') && late2) k = 'MG';
  return k;
}
function identifyType(u) {
  const b = G.bb;
  if (u.cls === 'PSW') return PB.APPEAR.PSW[d10('PSW/SPW') - 1];
  if (u.cls === 'LW' || u.cls === 'MG' || u.cls === 'TRUCK') return u.cls;
  // 同じ区域では同じ型（Pz VI を除く）
  b.same = b.same || {};
  if (b.same[u.cls]) return b.same[u.cls];
  let t = PB.APPEAR[u.cls][d10(L('敵の型', 'Enemy type')) - 1];
  if (t === 'PzVI') { const q = d100(L('VI号の型(1-80 V号、81-94 VIe、95- VIb)', 'Pz VI type')); t = q <= 80 ? 'PzV' : q <= 94 ? 'PzVIe' : 'PzVIb'; }
  if (t !== 'PzVIe' && t !== 'PzVIb') b.same[u.cls] = t;
  return t;
}
function placeUnit(k, area) {
  const b = G.bb;
  const r = d10(L('敵のセクター', 'Enemy sector'));
  let s = r >= 9 ? '910' : r >= 6 ? '68' : r >= 4 ? '45' : String(r);
  if (b.us[s]) { const p = PB.PAIR[s]; if (b.us[p]) return null; s = p; }
  const mod = area.type === 'C' ? -3 : area.type === 'D' ? -2 : 0;
  const rr = clamp(d10(L('敵の距離', 'Enemy range')) + mod, 1, 10), RT = PB.RANGE_T[k];
  let range = rr <= RT[0] ? 0 : rr <= RT[1] ? 1 : 2;
  if (k === 'LW' && range === 2) range = 1;
  const inf = ['LW', 'MG', 'AT'].includes(k);
  const shown = k === 'TANK' ? 'PzVIe' : k === 'SPG' ? 'StuG' : k === 'AT' ? '88LL' : k === 'PSW' ? null : k;
  const u = { id: ++b.seq, cls: k, type: null, shown, identified: !['TANK', 'SPG', 'AT'].includes(k), sector: s, range, facing: 0, terr: 'open', moving: false, spot: 'none', firedLast: false, disabled: false };
  if (k === 'PSW') { u.type = identifyType(u); u.shown = u.type; }
  if (u.identified && !u.type) u.type = k;
  setFacingTerrain(u, area);
  b.units.push(u);
  return u;
}
function setFacingTerrain(u, area) {
  const k = u.cls, inf = ['LW', 'MG', 'AT'].includes(k);
  if (!inf) { const F = PB.FACING_T[k], r = d10(L('敵の向き', 'Enemy facing')); u.facing = r <= F[0] ? 0 : r <= F[1] ? 1 : 2; }
  const r = clamp(d10(L('敵の地形', 'Enemy terrain')) + (G.day.sc === 'C' ? 2 : 0), 1, 10), t = area ? area.type : (G.bb.area || 'B');
  u.moving = false;
  if (inf) {
    const T = PB.TERRAIN_INF[t];
    const fortMonth = G.day && ((G.day.c.mon === 11 && G.day.c.year === 1944) || (G.day.c.mon === 2 && G.day.c.year === 1945)); // 配置表の注3、注4
    if (r <= T.woods) u.terr = fortMonth ? 'fort' : 'woods'; else if (T.building && r <= T.building) u.terr = 'building'; else if (T.fort && r <= T.fort) u.terr = 'fort'; else u.terr = 'open';
    if (k === 'AT' && u.terr === 'building') u.terr = fortMonth ? 'fort' : 'open';
    if (k === 'LW' && r === 10) { u.terr = 'open'; u.moving = true; }
  } else {
    const T = PB.TERRAIN_VEH[t];
    if (r <= T[0]) u.terr = 'hull'; else if (r <= T[1]) u.terr = 'woods'; else if (r <= T[2]) u.terr = 'open'; else { u.terr = 'open'; u.moving = true; }
  }
}
function startBattle(area, advZones) {
  const d = G.day, prev = G.bb;
  const b = G.bb = freshBoard();
  if (prev) { b.load = prev.load; b.reload = prev.reload; b.hatch = prev.hatch; }
  if (d.sc === 'C') { b.hull = true; b.moving = false; }
  b.seq = 0; b.area = area.type; b.areaId = area.id; b.ended = false; b.firstAmbush = true;
  G.phase = 'battle'; G.battles++;
  const n = { L: 2, M: 3, H: 4 }[area.res || 'M'];
  say(L(`敵だ！ ${areaName(area)}で戦闘開始。`, `Contact! Battle in ${areaName(area)}.`), 'head');
  for (let i = 0; i < n; i++) placeUnit(activate(), area);
  area.left.forEach(u => { u.spot = 'none'; b.units.push(u); u.id = ++b.seq; }); area.left = [];
  // 敵の配置を地図で確かめてから、支援や待ち伏せへ進む（ユーザーの指示 2026-11-08）
  // 敵の配置は地図で分かるので、乗員のセリフだけにする。ボタンは車長の返事（ユーザーの指示 2026-11-08）
  if (b.units.length) { const cn = G.crew.C.name;
    const lines = [
      [L(`${crewN('A')}「敵です、${cn}隊長！」`, `${crewN('A')}: "Enemy, Sergeant ${cn}!"`), L('確認した', 'I see them')],
      [L(`${crewN('D')}「前方に敵、${cn}隊長！」`, `${crewN('D')}: "Enemy ahead, Sergeant ${cn}!"`), L('見えている', 'Got them')],
      [L(`${crewN('G')}「${cn}隊長、敵がいます！」`, `${crewN('G')}: "Sergeant ${cn}, enemy out there!"`), L('確認した。落ち着いていけ', 'Seen. Stay calm')],
      [L(`${crewN('L')}「隊長、外に何かいます！」`, `${crewN('L')}: "Sarge, something's out there!"`), L('分かっている', 'I know')],
    ];
    const [t, btn] = pick(lines); stop(t, btn); }
  say(pick([L(`${G.crew.A.name}「ちくしょう、撃ってきやがる！」`, `${G.crew.A.name}: "Damn, they're shooting!"`), L('砲塔に機関銃弾が当たって乾いた音を立てた。', 'MG rounds rattle off the turret.'), L('歩兵が一斉に溝へ飛び込んだ。', 'The infantry dives for the ditches.')]));
  // 砲兵・航空支援・前進射撃（4.64）
  for (let i = 0; i < area.art; i++) friendlyAll(0, 'art', L('支援砲撃が着弾した。', 'Supporting fire lands.'));
  for (let i = 0; i < area.air; i++) friendlyAll(-10, 'air', L('P-47が機銃掃射に入った。', 'P-47s make a strafing run.'));
  area.art = 0; area.air = 0;
  if (advZones && d.sc !== 'C') advancingFire(advZones);
  // 4.65 待ち伏せ
  const w = d.w, amb = d10(L('待ち伏せ(1-7)', 'Ambush (1-7)')) - (w.rain || w.fall || w.fog ? 1 : 0);
  if (amb <= 7 && d.sc === 'C' && b.units.length) { // 20.43 反撃では待ち伏せるのはこちら。最初のラウンドは敵が動かない
    say(L('敵はこちらに気づいていない。待ち伏せだ！ 先に撃てるぞ。', 'They haven\'t seen you. Ambush: you get the first shots.'), 'good');
    b.freeRound = true;
  }
  // 待ち伏せで敵が動いた跡も矢印で出す（ユーザーの指示 2026-11-08）
  b.units.forEach(u => { u._from = { s: u.sector, r: u.range }; });
  if (amb <= 7 && d.sc !== 'C' && b.units.length) {
    stop(pick([L('閃光！ 敵に先に撃たれた！ 待ち伏せだ！', 'A flash! They fired first! Ambush!'), L(`${crewN('A')}「待ち伏せだ！ 敵が来るぞ！」`, `${crewN('A')}: "Ambush! Here they come!"`)]), L('伏せろ！', 'Button up!'), 'bad');
    enemyPhase(true);
    if (!G.bb.ended && G.phase === 'battle') randomEvent();
  }
  return checkBattleEnd() || beginRound();
}
const areaName = a => ({ A: L('農場と畑', 'farmland'), B: L('畑', 'fields'), C: L('村', 'a village'), D: L('森', 'woods') }[a.type]);
function advancingFire(zones) {
  const b = G.bb;
  let k = 0;
  for (const key of Object.keys(zones)) {
    const n = zones[key]; if (!n) continue;
    const [sec, r] = key.split(':');
    for (let i = 0; i < n; i++) for (const u of b.units.filter(x => x.sector === sec && x.range === +r)) { if (friendlyRoll(u, 0, 'adv')) { markGone(u, 'out'); b.units = b.units.filter(x => x !== u); k++; } }
  }
  if (k) say(L(`前進射撃で敵${k}隊が退いた。`, `Advancing fire drives off ${k} enemy units.`), 'good');
}
// ===== 味方の攻撃（14.0）=====
function friendlyRoll(u, mod, why) {
  const d = G.day, b = G.bb;
  if (u.hidden) void 0;
  const key = u.cls === 'LW' ? 'LW' : u.cls === 'MG' ? 'MG' : u.cls === 'AT' ? 'AT' : u.cls === 'TRUCK' ? 'TRUCK' : (u.type || u.shown);
  const T = PB.FRIENDLY[key] || [20];
  const raw = rr100();
  let m = mod;
  const sq = why !== 'art' && why !== 'air'; // Q&A: 米軍支配と味方損失の修正は砲撃と航空には使わない
  if (sq) m -= 3 * Object.keys(b.us).filter(s => b.us[s]).length;
  const inf = ['LW', 'MG', 'AT'].includes(u.cls);
  if (why === 'air' && !inf) m -= 10;
  if (why === 'art' && inf && u.terr === 'woods') m -= 3;
  if (sq) { if (inf) m += d.squadsLost; else m += 2 * d.tanksLost; }
  m += 10 * smokeAt(u.sector, u.range);
  if (d.w.fog || d.w.fall) m += 10;
  if ((why === 'adv' || why === 'art') && !inf && u.cls !== 'TRUCK') m += 10;
  if ((d.w.fog || d.w.fall) && why !== 'art' && u.sector === '68' && u.range > 0) return false;
  if (T[1] && raw >= T[1]) addSmoke(u.sector, u.range, 1);
  const ok = raw <= 3 || raw + m <= T[0];
  J(L(`${WHY_WORD(why)}が${unitLabel(u)}を倒せるか: 2D = ${raw} ${sg(m)} = ${raw + m}、必要 ${T[0]} 以下 → ${ok ? '撃破' : 'なし'}`, `${WHY_WORD(why)} vs ${unitLabel(u)}: ${raw} ${sg(m)} = ${raw + m}, need ${T[0]} → ${ok ? 'KO' : 'no effect'}`));
  return ok;
}
function friendlyAll(mod, why, msg) {
  const b = G.bb; if (msg && b.units.length) say(msg);
  const had = b.units.length; let kills = 0;
  // 支援砲撃・航空攻撃は、敵1隊ずつは書かず、部下の報告で結果だけ言う。撃破は地図の×で見せる（ユーザーの指示 2026-11-08）
  const sup = why === 'art' || why === 'air', supName = why === 'art' ? L('砲撃', 'the barrage') : L('航空攻撃', 'the air strike');
  const cn = G.crew.C.name, who = pick(['A', 'G', 'L', 'D'].filter(q => G.crew[q] && G.crew[q].status === 'ok')) || 'A';
  if (sup && !had) stop(L(`${crewN(who)}「${cn}隊長、${supName}が来ましたが、敵の姿はありません」`, `${crewN(who)}: "Sergeant ${cn}, ${supName} came in, but there's no enemy."`), L('そうか', 'I see'));
  for (const u of b.units.slice()) if (friendlyRoll(u, mod, why)) {
    kills++;
    if (!sup) say(L(`味方が${unitLabel(u)}${tagOf(u)}を撃破（${sectorName(u.sector)}・${rangeName(u.range)}）。`, `Friendly forces knock out ${unitLabel(u)}${tagOf(u)} (${sectorName(u.sector)}, ${rangeName(u.range)}).`));
    markGone(u, 'ko');
    if (why !== 'adv') { const dd = G.day, tt = u.type || u.shown; dd.vpFriend += vpOf(u); dd.fko[tt] = (dd.fko[tt] || 0) + 1; if (u.terr === 'fort') dd.fortF++; }
    b.units = b.units.filter(x => x !== u);
    if (b.acq && b.acq.id === u.id) b.acq = null;
  }
  if (sup && had) {
    const left = b.units.length;
    const hit = [
      [L(`${crewN(who)}「${cn}隊長、${supName}で敵${kills}隊が吹き飛びました！」`, `${crewN(who)}: "Sergeant ${cn}, ${supName} took out ${kills} of them!"`), L('よし', 'Good')],
      [L(`${crewN(who)}「命中です、隊長！ 敵${kills}隊が沈黙！」`, `${crewN(who)}: "Direct hit, Sarge! ${kills} silenced!"`), L('よくやった', 'Well done')],
    ];
    const miss = [
      [L(`${crewN(who)}「${cn}隊長、${supName}は外れました。敵はまだいます」`, `${crewN(who)}: "Sergeant ${cn}, ${supName} missed. They're still there."`), L('仕方ない', 'Can\'t be helped')],
      [L(`${crewN(who)}「だめです、隊長。土煙だけです」`, `${crewN(who)}: "No good, Sarge. Just dirt."`), L('次で仕留める', 'We\'ll get them')],
    ];
    const [t, btn] = pick(kills ? hit : miss);
    stop(t + (kills && left ? L(`（残り${left}隊）`, ` (${left} left)`) : ''), btn, kills ? 'good' : '');
  }
  if (why === 'friend' && kills) stop(L(`${crewN(who)}「隊長、味方が敵を${kills}隊仕留めました！」`, `${crewN(who)}: "Sarge, our boys got ${kills} of them!"`), L('よし', 'Good'), 'good');
}
const vpOf = u => { const t = u.type || u.shown; const d = PB.UNIT[t]; return (d ? d.vp : 1) + (u.terr === 'fort' ? 2 : 0); };
// ===== 煙 =====
const zoneKey = (s, r) => `${s}:${r}`;
function addSmoke(s, r, n) { const k = zoneKey(s, r), z = G.bb.smoke; z[k] = (z[k] || 0) + n * 2; }
function smokeAt(s, r) { return Math.ceil((G.bb.smoke[zoneKey(s, r)] || 0) / 2); }
function smokeBetween(u) { let n = G.bb.smokeOnTank ? Math.ceil(G.bb.smokeOnTank / 2) : 0; for (let r = 0; r <= u.range; r++) n += smokeAt(u.sector, r); return n; }
function depleteSmoke() {
  const b = G.bb, rate = G.day.w.rain ? 2 : 1;
  for (const k of Object.keys(b.smoke)) { b.smoke[k] -= rate; if (b.smoke[k] <= 0) delete b.smoke[k]; }
  if (b.smokeOnTank) b.smokeOnTank = Math.max(0, b.smokeOnTank - rate);
}
// ===== 4.72 索敵 =====
function canSpot(p, u, orders) {
  const m = G.crew[p], b = G.bb, t = tank();
  if (m.status !== 'ok') return false;
  const o = (orders && orders[p]) || {};
  const open = !!b.hatch[p];
  if (!open && p !== 'G' && m.periscope === false) return false;
  if (p === 'G') {
    if (o.act === 'fire' || o.act === 'rotfire' || o.act === 'repair') return false;
    if (G.day.broken.sight && m.periscope === false) return false;
    return u.sector === PB.SECTORS[b.turret];
  }
  if (p === 'L') {
    if (o.act && !['load', 'aa', 'sub'].includes(o.act)) return false;
    if (b.firedMain) return false;
    if (open) return true;
    return u.sector === (b.loaderLook || PB.SECTORS[b.turret]);
  }
  if (p === 'D' || p === 'A') {
    if (p === 'A' && o.act && !['none', 'bow'].includes(o.act)) return false;
    if (p === 'D' && false) return false;
    const off = (sectorIdx(u.sector) - b.facing + 6) % 6;
    if (!open) return off === 0;
    return off !== 3;
  }
  if (p === 'C') { if (o.act === 'repairAA') return false; if (open) return true; if (t.cupola) return true; return u.sector === (b.cmdLook || PB.SECTORS[b.turret]); }
  return false;
}
function spottingPhase() {
  const b = G.bb, w = G.day.w, t = tank();
  if (b.units.some(u => u.spot !== 'hidden')) stop(pick([L('「全員、目を凝らせ。何か見えるか」', '"Everybody, eyes out. What do you see?"'), L(`${crewN('C')}はキューポラから双眼鏡を上げた。`, `${crewN('C')} raises his binoculars.`), L('砲声の合間に、車内を静けさが覆う。', 'Between the guns, silence inside the hull.')]), L('探せ', 'Search'));
  for (const u of b.units) {
    if (u.spot === 'hidden') continue;
    let stop = false;
    if ((w.fog || w.fall) && u.range > 0) { if (u.spot !== 'spotted') u.spot = 'none'; continue; }
    const was = u.spot;
    for (const p of POS) {
      if (stop) break;
      if (!canSpot(p, u, b.lastOrders)) continue;
      const m = G.crew[p], raw = rr10();
      if (raw >= 9) { J(L(`索敵: ${POS_NAME[p]()}が${unitLabel(u)}を探す: 1D = ${raw} → 隠れて見えない`, `Spot ${POS_NAME[p]()}→${unitLabel(u)}: ${raw} → hidden`)); if (was === 'none' && u.spot === 'none') { u.spot = 'hidden'; stop = true; } continue; }
      let mod = 0; const open = !!b.hatch[p];
      if (!open && !(p === 'C' && t.cupola)) mod += 3;
      if (p === 'C' && !open && t.cupola) mod += 2;
      if (b.moving) mod += 1;
      if (['woods', 'building', 'fort', 'hull'].includes(u.terr)) mod += 1;
      if (w.fall || w.fog) mod += 1;
      mod += smokeBetween(u);
      const d = PB.UNIT[u.type || u.shown] || { size: 'M' };
      if (d.size === 'S') mod += 1; if (d.size === 'L') mod -= 1; if (d.size === 'VL') mod -= 2;
      if (u.range === 1) mod -= 1; if (u.range === 0) mod -= 2;
      if (u.firedLast) mod -= 2; if (u.moving) mod -= 3; if (was === 'spotted') mod -= 3;
      const r = raw + mod;
      J(L(`索敵: ${POS_NAME[p]()}(腕前${m.rating})が${unitLabel(u)}を探す: 1D = ${raw} ${sg(mod)} = ${r}、${m.rating}以下で発見 → ${r <= m.rating || raw === 1 ? '発見' : '見つからない'}`, `Spot ${POS_NAME[p]()} (${m.rating})→${unitLabel(u)}: ${raw} ${sg(mod)} = ${r} → ${r <= m.rating || raw === 1 ? 'spotted' : 'no'}`));
      if (r <= m.rating || raw === 1) {
        if (u.spot !== 'spotted') { u.spot = 'spotted'; if (was !== 'spotted') say(spotText(p, m, u)); }
        if ((r <= Math.floor(m.rating / 2) || raw === 1) && !u.identified) { identify(u, p, m); PAUSE(L('了解', 'Roger')); }
      }
    }
    if (u.spot === 'hidden') say(L(`${sectorName(u.sector)}の敵は物陰に隠れて見えなくなった。`, `The enemy in ${sectorName(u.sector)} has gone to ground.`));
  }
}
// 主砲の号令
function gunCall(u, amm) {
  const dir = sectorClock(u.sector), n = unitLabel(u), r = rangeName(u.range);
  const ammoJ = { AP: '徹甲', HE: '榴弾', WP: '白燐', HCBI: '発煙', HVAP: '高速徹甲' }[amm], ammoE = { AP: 'AP', HE: 'HE', WP: 'WP', HCBI: 'smoke', HVAP: 'HVAP' }[amm];
  return pick([
    L(`「砲手、${ammoJ}！ ${dir}、${r}、${n}！」 ${crewN('G')}の手がハンドルを回す。`, `"Gunner, ${ammoE}! ${dir}, ${r}, ${n}!" ${crewN('G')} spins the traverse.`),
    L(`${crewN('G')}「目標確認、${n}！ 照準よし！」`, `${crewN('G')}: "Identified, ${n}! On target!"`),
    L(`照準器の十字が${n}に重なった。あとは号令だけだ。`, `The crosshairs settle on ${n}. All it needs is the word.`),
    L(`${crewN('L')}「${ammoJ}、装填よし！」 ${crewN('G')}「いつでも！」`, `${crewN('L')}: "${ammoE}, up!" ${crewN('G')}: "Ready!"`),
  ]);
}
function spotText(p, m, u) {
  const dir = sectorClock(u.sector);
  // 種類が分からない敵は、見間違えるかもしれない名前で「〜か？」と言う。種類が分かったら、違えば「いや、〜だ！」と言い直す（ユーザーの指示 2026-11-08）
  if (u.identified === false) { const g = unitName(u); u.guess = u.shown; return pick([
    L(`${m.name}「${dir}方向、${rangeName(u.range)}に${g}……か？」`, `${m.name}: "${dir}, ${rangeName(u.range)}... a ${g}?"`),
    L(`「いたぞ！ ${dir}、${g}らしい」`, `"There! ${dir}, looks like a ${g}."`),
  ]); }
  return pick([
    L(`${m.name}「${dir}方向、${rangeName(u.range)}に${unitLabel(u)}！」`, `${m.name}: "${unitLabel(u)}, ${dir}, ${rangeName(u.range)}!"`),
    L(`${POS_NAME[p]()}が${dir}の${unitLabel(u)}を発見。`, `${POS_NAME[p]()} spots ${unitLabel(u)} at ${dir}.`),
    L(`「いたぞ！ ${dir}、${unitLabel(u)}だ」`, `"There! ${dir}, ${unitLabel(u)}."`),
  ]);
}
function sectorClock(s) { const off = (sectorIdx(s) - G.bb.facing + 6) % 6; return [L('正面', 'front'), L('右前', 'right front'), L('右後', 'right rear'), L('真後ろ', 'rear'), L('左後', 'left rear'), L('左前', 'left front')][off]; }
function identify(u, p, m) {
  const guess = u.guess || null;
  u.type = identifyType(u); u.shown = u.type; u.identified = true;
  const n = unitName(u), gn = guess && PB.UNIT[guess] ? L(PB.UNIT[guess].name, PB.UNIT[guess].en) : null;
  if (gn && guess !== u.type) say(L(`${m.name}「確認した、いや、${n}だ！」`, `${m.name}: "Confirmed... no, it's a ${n}!"`), u.type.startsWith('PzVI') ? 'bad' : '');
  else if (gn) say(L(`${m.name}「確認した、${n}だ！」`, `${m.name}: "Confirmed, a ${n}!"`), u.type.startsWith('PzVI') ? 'bad' : '');
  else say(L(`${m.name}「確認！ ${n}だ！」`, `${m.name}: "Confirmed! ${n}!"`), u.type.startsWith('PzVI') ? 'bad' : '');
}
function beginRound() {
  const b = G.bb;
  b.round++;
  depleteSmoke();
  spottingPhase();
  b.firedMain = false;
  b.units.forEach(u => { u.firedLast = false; });
  return { round: b.round };
}
// ===== 主砲の射撃（9.0）=====
const TARGET_INF = u => ['LW', 'MG', 'AT'].includes(u.cls);
function parseKill(str, loc, range) {
  if (str === 'nc') return 0;
  const parts = str.split(' ');
  let s = parts.find(x => x[0] === loc) || parts[0];
  if (s[0] === 'T' || s[0] === 'H') s = (s.slice(1).trim());
  if (s === 'nc' || s === '') return 0;
  const v = s.split('/');
  const x = v.length === 1 ? v[0] : v[range];
  return x === 'nc' ? 0 : parseInt(x, 10);
}
function hitChance(u, amm, mode, opts) {
  const b = G.bb, gun = tank().gun, w = G.day.w;
  const cat = TARGET_INF(u) ? 'inf' : 'veh';
  let base = PB.TOHIT[mode][gun][cat][u.range];
  if (w.fog || w.fall) { if (u.range > 0) return { need: 0, mod: 0, note: 'P' }; base = Math.floor(base / 2); }
  for (let i = 0; i < smokeBetween(u); i++) base = Math.floor(base / 2);
  let mod = 0;
  const cOpen = !!b.hatch.C;
  if (b.firstShotAt !== u.id && !(opts && opts.cmdDirect && cOpen)) mod += 10;
  if (b.acq && b.acq.id === u.id) mod += b.acq.n === 1 ? [-5, -10, -15][u.range] : [-10, -20, -30][u.range];
  if (u.moving && cat === 'veh') mod += [20, 25, 25][u.range];
  const g = G.crew.G; if (g.status === 'ok') mod -= g.rating;
  if (opts && opts.cmdDirect && G.crew.C.status === 'ok') mod -= G.crew.C.rating;
  const rot = (opts && opts.rotated) || 0; mod += 10 * rot;
  if (cat === 'inf' && u.cls === 'AT') mod += (u.type || u.shown) === '88LL' ? 10 : 20;
  if (mode === 'direct') {
    const d = PB.UNIT[u.type || u.shown] || { size: 'M' };
    if (cat === 'veh') { if (d.size === 'S') mod += 10; if (d.size === 'L') mod += [-5, -10, -15][u.range]; if (d.size === 'VL') mod += [-10, -20, -30][u.range]; if (opts && opts.track) mod += [65, 55, 45][u.range]; }
    if ((opts && opts.moving != null ? opts.moving : b.moving) || (opts && opts.pivoted)) mod += 25;
    if (u.terr === 'woods') mod += [5, 10, 15][u.range];
    if (cat === 'inf' && u.terr === 'building') mod += [10, 15, 25][u.range];
    if (cat === 'inf' && u.terr === 'fort') mod += [15, 25, 35][u.range];
  }
  return { need: base, mod, chance: clamp(base - mod, 0, 97) };
}
function fireMainGun(u, mode, opts) {
  const b = G.bb, d = G.day, t = tank();
  const hits = [];
  let shots = 0;
  while (true) {
    const amm = b.load;
    if (!amm || d.ammo[amm] <= 0) { say(L('主砲弾がない！', 'Out of that ammunition!'), 'bad'); break; }
    const m = amm === 'WP' || amm === 'HCBI' ? 'area' : (amm === 'AP' || amm === 'HVAP' ? 'direct' : mode);
    const h = hitChance(u, amm, m, opts);
    if (h.note === 'P') { say(L('霧で遠くは撃てない。', 'Fog: cannot fire beyond close range.')); break; }
    stop(shots === 0 ? gunCall(u, amm) : pick([L(`「次弾、同じ目標！ 撃て！」`, `"Same target, fire again!"`), L(`${crewN('C')}「まだだ、もう一発！」`, `${crewN('C')}: "Again! Put another one in him!"`)]), L('撃て！', 'FIRE!'));
    const raw = rr100();
    d.ammo[amm]--; shots++;
    if (b.useRack && d.rack[b.reload] > 0) d.rack[b.reload]--;
    b.firedMain = true; b.fired = true;
    if (raw >= 98) { d.jam.main = true; say(L(`主砲が故障した！ ${G.crew.L.name}「閉鎖器が動かない！」`, `Main gun malfunction! ${G.crew.L.name}: "Breech is jammed!"`), 'bad'); b.load = null; break; }
    const crit = raw <= 3, val = raw + h.mod;
    const hit = crit || val <= h.need;
    J(L(`主砲の命中(${AMMO_WORD(amm)}、${unitLabel(u)}へ): 2D = ${raw} ${sg(h.mod)} = ${val}、必要 ${h.need} 以下 → ${crit ? '決定的命中' : hit ? '命中' : '外れ'}`, `Main gun (${amm}): ${raw} ${sg(h.mod)} = ${val}, need ${h.need} → ${crit ? 'critical' : hit ? 'hit' : 'miss'}`));
    b.firstShotAt = u.id;
    if (!b.acq || b.acq.id !== u.id) b.acq = { id: u.id, n: 1 }; else b.acq.n = Math.min(2, b.acq.n + 1);
    if (hit) {
      hits.push({ amm, crit, mode: m, track: !!(opts && opts.track) });
      say(pick(crit ? [L(`ドンピシャ！ ${unitLabel(u)}の真ん中に吸い込まれた！`, `Dead center! Right into ${unitLabel(u)}!`), L(`${crewN('G')}「直撃です！」`, `${crewN('G')}: "Direct hit!"`)] : [L(`${crewN('G')}「命中！」 ${unitLabel(u)}に火花が散った。`, `${crewN('G')}: "Hit!" Sparks fly off ${unitLabel(u)}.`), L(`「当たった！」 曳光弾が${unitLabel(u)}に吸い込まれる。`, `"On target!" The tracer disappears into ${unitLabel(u)}.`), L(`砲煙の向こうで${unitLabel(u)}が揺れた。命中だ。`, `Through the gun smoke ${unitLabel(u)} rocks. A hit.`)]), 'good');
      if (amm === 'WP') addSmoke(u.sector, u.range, 1);
      if (amm === 'HCBI') addSmoke(u.sector, u.range, 2);
    } else say(pick([L(`遠い！ 土煙が上がっただけだ。`, `Long! Just dirt in the air.`), L(`砲弾は${unitLabel(u)}の頭上を越えていった。`, `The round sails over ${unitLabel(u)}.`), L(`${crewN('C')}「手前だ！ 修正しろ！」`, `${crewN('C')}: "Short! Adjust!"`), L(`${crewN('G')}「くそっ、外した！」`, `${crewN('G')}: "Damn, missed!"`)]));
    // 再装填と発射速度
    b.load = (d.ammo[b.reload] > 0) ? b.reload : (['HE', 'AP', 'WP', 'HCBI', 'HVAP'].find(x => d.ammo[x] > 0) || null);
    const rofBase = t.gun === 75 ? 30 : 20;
    let rm = 0;
    if (G.crew.G.status === 'ok') rm -= G.crew.G.rating;
    if (G.crew.L.status === 'ok') rm -= G.crew.L.rating; else { b.load = null; break; }
    if (b.useRack && d.rack[b.reload] > 0) rm -= 10;
    else if (opts && opts.passAmmo && G.crew.A.status === 'ok') rm -= G.crew.A.rating;
    J(L(`続けて撃てるか(発射速度): ${raw} ${sg(rm)} = ${raw + rm}、必要 ${rofBase} 以下 → ${raw + rm <= rofBase ? 'もう一発' : '終わり'}`, `Rate of fire: ${raw} ${sg(rm)} = ${raw + rm}, need ${rofBase}`));
    if (raw + rm <= rofBase && b.load && shots < 6) { say(pick([L(`${crewN('L')}「装填よし！」 速い。もう一発いける。`, `${crewN('L')}: "Up!" Fast. There's time for another.`), L(`薬莢が床で跳ねた瞬間、${crewN('L')}の声。「次弾よし！」`, `The shell case hits the floor and ${crewN('L')} shouts: "Loaded!"`)]), 'good'); continue; }
    break;
  }
  if (hits.length) {
    if (shots > 1) say(L(`撃ち終わった。${shots}発のうち${hits.length}発が命中している。`, `Firing stops. ${hits.length} of ${shots} rounds hit.`));
    for (const h of hits) { if (!b.units.includes(u)) break; PAUSE(L('どうだ！？', 'Well!?')); if (resolveHit(u, h)) break; }
  }
  return hits.length;
}
function resolveHit(u, h) {
  const b = G.bb, gun = tank().gun, w = G.day.w;
  if (h.amm === 'WP' || h.amm === 'HCBI') return false;
  if (h.track && !TARGET_INF(u)) { u.disabled = true; say(L('履帯に命中！ 敵は動けない。', 'Track hit! The enemy is immobilized.'), 'good'); return false; }
  let ko = false;
  if (TARGET_INF(u)) {
    if (h.amm !== 'HE') return false;
    const direct = h.mode === 'direct';
    const T = { 75: { d: [55, 80], a: [35, 55] }, 76: { d: [30, 55], a: [20, 30] } }[gun];
    const base = direct ? T.d[h.crit ? 1 : 0] : T.a[h.crit ? 1 : 0];
    let m = 0;
    const star = !direct || h.crit;
    if (u.terr === 'building' && star) m += h.crit ? -15 : 15;
    if (u.terr === 'woods' && star) m += h.crit ? -10 : 10;
    if (u.terr === 'fort' && star) m += h.crit ? -20 : 20;
    if (u.cls === 'AT') { if (h.crit) { ko = true; } else m += 15; }
    if (u.moving) m -= 10;
    if (w.mud || w.deep) m += 5;
    { const rk = rr100(); const k2 = rk + m <= base; J(L(`歩兵目標を倒せるか(${unitLabel(u)}): 2D = ${rk} ${sg(m)} = ${rk + m}、必要 ${base} 以下 → ${k2 ? '撃破' : 'なし'}`, `Infantry kill: ${rk} ${sg(m)} = ${rk + m}, need ${base}`)); ko = ko || k2; }
  } else {
    const t = u.type || (u.shown);
    const loc = (() => { if (u.terr === 'hull') return d10(L('命中箇所(車体隠蔽)', 'Hit location (HD)')) <= 5 ? 'T' : null; const r = d10(L('命中箇所(1-4砲塔、5-9車体、10履帯)', 'Hit location')); return r <= 4 ? 'T' : r <= 9 ? 'H' : 'X'; })();
    if (loc === null) { say(L('砲弾は地形に当たった。', 'The round strikes the ground in front of the hull.')); return false; }
    if (loc === 'X') { u.disabled = true; say(L(`${unitLabel(u)}の履帯を吹き飛ばした！ もう動けない。`, `${unitLabel(u)} throws a track — immobilized!`), 'good'); return false; }
    let need = 0;
    if (h.amm === 'AP') {
      const tb = gun === 75 ? PB.AP75 : PB.AP76, row = tb[t];
      if (h.crit) {
        if (gun === 75 && PB.AP75_CRIT[t] && u.facing === 0) need = parseKill(PB.AP75_CRIT[t][0], loc, u.range);
        else if (gun === 76 && t === 'PzVIb' && u.facing === 0 && loc === 'H') need = [58, 42, 28][u.range];
        else need = 100;
      } else need = row ? parseKill(row[u.facing], loc, u.range) : 50;
    } else if (h.amm === 'HVAP') {
      if (h.crit) need = 100; else { const row = PB.HVAP[t]; need = row ? parseKill(row[u.facing], loc, u.range) : 50; }
    } else { const row = (gun === 75 ? PB.HE75 : PB.HE76)[t]; need = row ? parseKill(row[h.crit ? 1 : 0][u.facing], loc, u.range) : 10; }
    const r = rr100();
    ko = need > 0 && r <= need;
    J(L(`敵車両を倒せるか(${UNIT_WORD(t)}、${AMMO_WORD(h.amm)}、${loc === 'T' ? '砲塔' : '車体'}、${['正面', '側面', '背面'][u.facing]}): 2D = ${r}、必要 ${need} 以下 → ${ko ? '撃破' : 'なし'}`, `Kill (${t}, ${h.amm}, ${loc}): ${r}, need ${need} → ${ko ? 'KO' : 'no'}`));
    if (!ko) say(need === 0 ? pick([L(`砲弾は${unitLabel(u)}の装甲に弾かれた！`, `The round bounces off ${unitLabel(u)}!`), L(`火花を散らして跳ね返った。この距離でこの角度では抜けない。`, `Sparks and a ricochet. No penetration at this angle.`)]) : L(`${unitLabel(u)}に当たったが貫通せず（${r} > ${need}）。`, `Hit ${unitLabel(u)} but no penetration (${r} > ${need}).`));
  }
  if (ko) { knockOut(u, 'you'); return true; }
  if (TARGET_INF(u)) say(L(`${unitLabel(u)}はまだ撃ってくる。`, `${unitLabel(u)} is still firing.`));
  return false;
}
function knockOut(u, by) {
  const b = G.bb, d = G.day;
  const t = u.type || u.shown; const vp = vpOf(u);
  if (by === 'you') {
    d.vpTank += vp; G.totalVP += vp; d.ko[t] = (d.ko[t] || 0) + 1; if (u.terr === 'fort') d.fortT++; G.kills[t] = (G.kills[t] || 0) + 1;
    say(pick([L(`${unitLabel(u)}を撃破！ 勝利点+${vp}。`, `${unitLabel(u)} knocked out! +${vp} VP.`), L(`やった！ ${unitLabel(u)}が炎を上げた。勝利点+${vp}。`, `Got him! ${unitLabel(u)} is burning. +${vp} VP.`), L(`${G.crew.G.name}「命中、撃破！」 ${unitLabel(u)}は沈黙した。勝利点+${vp}。`, `${G.crew.G.name}: "Target destroyed!" ${unitLabel(u)} goes silent. +${vp} VP.`)]), 'good');
  }
  markGone(u, 'ko');
  b.units = b.units.filter(x => x !== u);
  if (b.acq && b.acq.id === u.id) b.acq = null;
}
// ===== 機関銃（10.0）=====
// 機関銃の命令: target が数字なら目標、'z:セクター:距離' なら前進射撃（22.2）
function mgOrder(kind, o, p, direct, can) {
  const b = G.bb, d = G.day;
  const tg = o.target;
  if (typeof tg === 'string' && tg.startsWith('z:')) {
    const [, s, r] = tg.split(':');
    if (!can([s, +r])) return;
    const raw = d100(L('前進射撃の機銃(98-故障)', 'MG advancing fire'));
    if (raw >= 98) { d.jam[kind] = true; say(L('機銃が故障した！', 'The MG jams!'), 'bad'); return; }
    b.advFire[zoneKey(s, +r)] = true; b.advMG[zoneKey(s, +r)] = { kind, p };
    say(L(`${sectorName(s)}の${rangeName(+r)}へ機銃を撃ち込む。`, `MG advancing fire into ${sectorName(s)}, ${rangeName(+r)}.`));
    // Q&A: 敵のいるゾーンにも撃てて、効果もある
    for (const u of b.units.filter(x => x.sector === s && x.range === +r).slice()) fireMG(kind, u, p, { adv: true });
    return;
  }
  const u = b.units.find(x => x.id === tg); if (u && can([u.sector, u.range])) fireMG(kind, u, p, { direct });
}
// 22.22 前進射撃のゾーンへ入った敵を撃つ
function checkAdvMG(u) {
  const b = G.bb, m = b.advMG && b.advMG[zoneKey(u.sector, u.range)];
  if (m && ['LW', 'MG', 'AT', 'TRUCK'].includes(u.cls) && G.crew[m.p].status === 'ok') fireMG(m.kind, u, m.p, { adv: true });
}
function fireMG(kind, u, p, opts) {
  const d = G.day, w = G.day.w, b = G.bb;
  const eligible = ['LW', 'MG', 'TRUCK', 'AT'].includes(u.cls);
  if (!eligible) return false;
  if (w.fog || w.fall) { if (u.range > 0) return false; }
  stop(pick([L(`「${unitLabel(u)}をなぎ払え！」`, `"Hose down ${unitLabel(u)}!"`), L(`機銃の銃口が${unitLabel(u)}へ向いた。`, `The MG swings onto ${unitLabel(u)}.`)]), L('撃て', 'Fire'));
  const raw = rr100();
  if (raw >= 98) { J(L(`機銃の故障の判定(98以上で故障): 2D = ${raw}`, `MG jam: ${raw}`)); d.jam[kind] = true; stop(L(`${crewN(p)}「隊長、${{ bow: '車体', coax: '同軸', aa: '対空', sub: '短' }[kind]}機関銃が故障しました！」`, `${crewN(p)}: "Sarge, the ${kind.toUpperCase()} MG jammed!"`), L('直せ', 'Fix it'), 'bad'); return false; }
  let base = PB.MG[kind][u.range];
  if (base < 0) return false;
  for (let i = 0; i < smokeBetween(u); i++) base = Math.floor(base / 2);
  if (w.fog || w.fall) base = Math.floor(base / 2);
  let m = 0;
  if (G.crew[p].status === 'ok') m -= G.crew[p].rating;
  if (opts && opts.direct && G.crew.C.status === 'ok') m -= G.crew.C.rating;
  if (opts && opts.adv) m += kind === 'sub' ? -10 : 10;
  if (u.cls === 'LW' && u.moving) m += { bow: -10, coax: -15, aa: -15, sub: -5 }[kind];
  if (b.moving) m += 10;
  if (u.terr === 'woods') m += 10;
  if (u.cls === 'AT' || u.terr === 'building') m += 15;
  if (u.terr === 'fort') m += 20;
  const name = { bow: L('車体機銃', 'Bow MG'), coax: L('同軸機銃', 'Coax MG'), aa: L('.50口径機銃', '.50 cal'), sub: L('短機関銃', 'Sub MG') }[kind];
  J(L(`${WEAPON_WORD(kind)}で${unitLabel(u)}を倒せるか: 2D = ${raw} ${sg(m)} = ${raw + m}、必要 ${base} 以下 → ${raw <= 3 || raw + m <= base ? '撃破' : 'なし'}`, `MG (${kind})→${unitLabel(u)}: ${raw} ${sg(m)} = ${raw + m}, need ${base}`));
  // 機関銃の結果で一度止める（ユーザーの指示 2026-11-08）
  if (raw <= 3 || raw + m <= base) { stop(pick([L(`${crewN(p)}「やりました！ ${unitLabel(u)}を片付けました！」`, `${crewN(p)}: "Got 'em! ${unitLabel(u)} is down!"`), L(`${crewN(p)}「${unitLabel(u)}、沈黙！」`, `${crewN(p)}: "${unitLabel(u)} silenced!"`)]), pick([L('よくやった', 'Well done'), L('いいぞ', 'Nice')]), 'good'); knockOut(u, 'you'); return true; }
  stop(pick([L(`${crewN(p)}「だめです、${unitLabel(u)}には効きません！」`, `${crewN(p)}: "No good, ${unitLabel(u)} is still there!"`), L(`${crewN(p)}「外れました！」`, `${crewN(p)}: "Missed!"`)]), pick([L('撃ち続けろ', 'Keep firing'), L('次は当てろ', 'Hit it next time')]));
  return false;
}
// ===== 乗員の行動（4.74）=====
function shiftUnits(dirSign, cat) {
  // dirSign=+1 前進: 前方の敵は近づき、後方の敵は遠ざかる（移動図）
  const b = G.bb, off = [];
  const leavers = [];
  for (const u of b.units.slice()) {
    const o = (sectorIdx(u.sector) - b.facing + 6) % 6;
    const toward = dirSign > 0 ? o === 0 : o === 3;
    const away = dirSign > 0 ? o === 3 : o === 0;
    const passFront = dirSign > 0 ? (o === 1 || o === 5) : (o === 2 || o === 4);
    const passRear = dirSign > 0 ? (o === 2 || o === 4) : (o === 1 || o === 5);
    if (cat === 'A') {
      if (toward) { if (u.range > 0) u.range--; else u.sector = PB.SECTORS[(sectorIdx(u.sector) + 3) % 6]; }
      else if (away || passRear) { if (u.range < 2) u.range++; else { leavers.push(u); continue; } }
      else if (passFront) { if (u.range > 0) u.range--; else { const k = sectorIdx(u.sector) + ((o === 1 || o === 2) ? 1 : -1); u.sector = PB.SECTORS[(k + 6) % 6]; } }
      recheckFacing(u); u.spot = u.spot === 'hidden' ? 'none' : u.spot;
    } else if (cat === 'B') {
      if (away) { if (u.range > 0) u.range--; } else if (toward || passFront) { if (u.range < 2) u.range++; else { leavers.push(u); continue; } } else if (passRear && u.range > 0) u.range--;
      recheckFacing(u); u.spot = u.spot === 'hidden' ? 'none' : u.spot;
    } else if (cat === 'C') recheckFacing(u);
  }
  if (leavers.length) { b.gone = (b.gone || []).concat(leavers.map(u => goneRec(u, 'out'))); b.units = b.units.filter(u => !leavers.includes(u)); b.offBoard = (b.offBoard || []).concat(leavers); }
}
// Q&A: 戦車の移動で煙も敵と同じようにずれる。戦車の上の煙は真後ろの近距離へ
function shiftSmoke(dirSign, cat) {
  if (cat !== 'A' && cat !== 'B') return;
  const b = G.bb, out = {};
  for (const k of Object.keys(b.smoke)) {
    const [sec, rr] = k.split(':'); let r = +rr, s2 = sec;
    const o = (sectorIdx(sec) - b.facing + 6) % 6;
    const toward = dirSign > 0 ? o === 0 : o === 3, away = dirSign > 0 ? o === 3 : o === 0;
    const passFront = dirSign > 0 ? (o === 1 || o === 5) : (o === 2 || o === 4), passRear = dirSign > 0 ? (o === 2 || o === 4) : (o === 1 || o === 5);
    if (cat === 'A') {
      if (toward) { if (r > 0) r--; else s2 = PB.SECTORS[(sectorIdx(sec) + 3) % 6]; }
      else if (away || passRear) { if (r < 2) r++; else continue; }
      else if (passFront) { if (r > 0) r--; else s2 = PB.SECTORS[(sectorIdx(sec) + ((o === 1 || o === 2) ? 1 : -1) + 6) % 6]; }
    } else {
      if (away) { if (r > 0) r--; } else if (toward || passFront) { if (r < 2) r++; else continue; } else if (passRear && r > 0) r--;
    }
    const nk = zoneKey(s2, r); out[nk] = (out[nk] || 0) + b.smoke[k];
  }
  b.smoke = out;
  if (b.smokeOnTank) { const rear = zoneKey(PB.SECTORS[(b.facing + 3) % 6], 0); b.smoke[rear] = (b.smoke[rear] || 0) + b.smokeOnTank; b.smokeOnTank = 0; }
}
function recheckFacing(u) { if (!['LW', 'MG', 'AT'].includes(u.cls)) { const F = PB.FACING_T[u.cls], r = d10(L('敵の向きの再判定', 'Enemy facing again')); u.facing = r <= F[0] ? 0 : r <= F[1] ? 1 : 2; } }
function doDriver(act, cmdDirect) {
  const b = G.bb, d = G.day, w = d.w;
  const m = G.crew.D;
  if (m.status !== 'ok') { if (['fwd', 'rev', 'fwdHD', 'revHD', 'pivot'].includes(act)) say(L('操縦手がいない。戦車は動けない。', 'No driver. The tank cannot move.'), 'bad'); return; }
  if (act === 'stop' || !act) { b.moving = false; return; }
  if (b.thrown) { say(L('履帯が切れている。動けない。', 'Thrown track. No movement.')); return; }
  if (b.assist) { say(L('はまったままだ。戦闘が終わるまで動けない。', 'Stuck fast until the battle ends.')); return; }
  if (b.bogged) {
    if (act !== 'rev') { say(L('スタックしている。後退で脱出を試みるしかない。', 'Bogged. Only reverse can free you.')); return; }
    let mod = -m.rating - (cmdDirect && b.hatch.C ? G.crew.C.rating : 0) + (b.hatch.D ? 0 : 10) - (G.hvss ? 5 : 0);
    const raw = rr100(), r = raw === 100 ? 100 : raw + mod;
    J(L(`スタックから抜けられるか: 2D = ${raw} ${sg(mod)} = ${r} (1-10脱出、81-90履帯切断、91-救援)`, `Bogged: ${raw} ${sg(mod)} = ${r}`));
    if (r <= 10) { b.bogged = false; say(L('スタックから脱出した！', 'Free!'), 'good'); }
    else if (r <= 80) say(L('空転するばかりだ。', 'Tracks just spin.'));
    else if (r <= 90) { b.thrown = true; b.bogged = false; say(L('無理をして履帯が切れた。', 'Forcing it throws a track.'), 'bad'); }
    else { b.assist = true; say(L('もう自力では無理だ。', 'Assistance required.'), 'bad'); }
    return;
  }
  if (act === 'pivot') {
    b.facing = b.pivotTo != null ? b.pivotTo : b.facing;
    b.hull = false; b.moving = false; b.pivoted = true; if (!G.gyro) b.acq = null;
    b.units.forEach(u => { if (u.spot === 'hidden') u.spot = 'none'; });
    say(L('超信地旋回で車体の向きを変えた。', 'The hull pivots.'));
    return;
  }
  stop(pick([L(`「${crewN('D')}、${act.startsWith('fwd') ? '前へ出ろ' : '下がれ'}！」 エンジンが吠える。`, `"${crewN('D')}, ${act.startsWith('fwd') ? 'forward' : 'back up'}!" The engine roars.`), L(`履帯が地面を噛んだ。`, `The tracks bite.`)]), L('動け', 'Go'));
  let mod = -m.rating + (b.hatch.D ? 0 : 5) - (G.hvss ? 2 : 0);
  if (cmdDirect) mod -= b.hatch.C ? G.crew.C.rating : (tank().cupola ? Math.floor(G.crew.C.rating / 2) : 0);
  if (w.ground) mod += 3; if (w.deep) mod += 6; if (w.mud) mod += 9;
  const raw = rr100(), r = raw === 100 ? 100 : clamp(raw + mod, 1, 100);
  J(L(`戦車の移動の事故(${DRIVE_WORD(act)}): 2D = ${raw} ${sg(mod)} = ${r}(98-99履帯切断、100スタック)、白ダイス ${1 + (raw - 1) % 10}`, `Movement (${act}): ${raw} ${sg(mod)} = ${r}, white ${1 + (raw - 1) % 10}`));
  const hdRoll = act === 'fwdHD' ? 20 : act === 'revHD' ? 10 : 0;
  b.hull = false; b.moving = true;
  if (!G.gyro) b.acq = null;
  b.units.forEach(u => { if (u.spot === 'hidden') u.spot = 'none'; });
  const white = 1 + (raw - 1) % 10;
  if (r >= 100) { b.bogged = true; b.moving = false; say(L('泥にはまった！ スタックした。', 'Bogged down!'), 'bad'); }
  else if (r >= 98) { b.thrown = true; b.moving = false; say(L('履帯が切れた！ 動けない！', 'Thrown track!'), 'bad'); }
  else if (r <= hdRoll) { b.hull = true; say(L('稜線の陰に入った。車体隠蔽。', 'Hull down behind the rise.'), 'good'); }
  const T = {
    fwd: ['A', 'A', 'A', 'A', 'C'], rev: ['B', 'B', 'C', 'C', ''], fwdHD: ['A', 'A', 'C', '', ''], revHD: ['B', 'C', '', '', ''],
  }[act];
  const eff = T[white - 1] || '';
  const sign = (act === 'fwd' || act === 'fwdHD') ? 1 : -1;
  if (eff) { shiftUnits(sign, eff); shiftSmoke(sign, eff); }
  if (eff && eff !== 'C') say(L('戦車が前後に動き、敵との位置が変わった。', 'The tank moves and the range changes.'));
  if (!G.bb.units.length && (G.bb.offBoard || []).length) leaveBoard(sign);
}
function leaveBoard(sign) {
  const b = G.bb, d = G.day, m = d.map;
  const fwdSide = [0, 1, 5].includes(b.facing);
  const advance = sign > 0 ? fwdSide : !fwdSide;
  b.left = true;
  const a = m.areas[b.areaId];
  a && (a.left = (b.offBoard || []).slice());
  if (d.sc === 'C' && !advance) { // 20.45 反撃中の撤退: 区域を1つ失い、出口の方へ下がる
    spend(15); loseArea(a);
    const ex = m.areas[m.exit]; const n0 = neighbors(a);
    const to0 = n0.slice().sort((p, q) => Math.hypot(p.x - ex.x, p.y - ex.y) - Math.hypot(q.x - ex.x, q.y - ex.y))[0];
    if (to0) m.cur = to0.id;
    say(L('区域を失った。陣地を下げる。', 'Area lost. You fall back.'), 'bad');
    b.departed = { adv: false };
    G.phase = 'ca';
    replaceCrew();
    return;
  }
  if (advance) {
    const n = neighbors(a).filter(o => o.id !== m.prev);
    const to = pick(n.length ? n : neighbors(a)); d.advChoice = (n.length ? n : neighbors(a)).map(x => x.id); d.advFrom = a.id; // 11.33 行き先は選べる（画面で選ぶ。選ばなければ to）
    m.cur = to.id;
    say(L('敵を振り切って前進した。', 'You drive past the enemy.'), 'good');
    b.departed = { adv: true, to: to.id };
  } else { m.cur = m.prev != null ? m.prev : m.cur; say(L('後退して戦闘を離脱した。', 'You withdraw from the fight.')); b.departed = { adv: false }; }
  G.phase = d.sc === 'C' ? 'ca' : 'move';
  d.freeCheck = true;
  replaceCrew();
}
function resolveRound(o) {
  const b = G.bb, d = G.day;
  if (G.phase !== 'battle') return;
  b.lastOrders = o;
  // 敵の動いた跡（地図に矢印と×を出す。次のラウンドの命令を実行するまで残す。ユーザーの指示 2026-11-08）
  // 1つ前のラウンドの跡は、薄くしてもう1ラウンド残す（ユーザーの指示 2026-11-08: すぐ消えると分からない）
  b.prevTrails = b.units.filter(u => u._from && (u._from.s !== u.sector || u._from.r !== u.range)).map(u => ({ s1: u._from.s, r1: u._from.r, s2: u.sector, r2: u.range, u: { id: u.id, spot: u.spot, type: u.type, shown: u.shown, cls: u.cls, identified: u.identified } })); b.prevGone = b.gone || [];
  b.units.forEach(u => { u._from = { s: u.sector, r: u.range }; }); b.gone = [];
  const cmdDirMove = o.C && o.C.act === 'dirmove' && G.crew.C.status === 'ok';
  const cmdDirFire = o.C && o.C.act === 'dirfire' && G.crew.C.status === 'ok';
  b.pivoted = false; b.fired = false;
  b.advFire = {}; b.advMG = {}; // 22.23
  // ハッチ
  if (o.hatch) Object.keys(o.hatch).forEach(p => { if (p !== 'L' || tank().loaderHatch) b.hatch[p] = o.hatch[p]; });
  if (o.reload) b.reload = o.reload;
  b.useRack = !!o.useRack;
  // 1) 移動
  if (o.D && o.D.act === 'pivot') b.pivotTo = o.D.to;
  let n0 = SAYN;
  doDriver(o.D ? o.D.act : 'stop', cmdDirMove);
  if (G.phase !== 'battle') return afterBattle();
  stepDone(n0); n0 = SAYN;
  // 2) 主砲
  const g = o.G || {}, gm = G.crew.G;
  const mainOk = !d.jam.main && !d.broken.main && !d.broken.sight && b.load;
  const target = id => b.units.find(u => u.id === id);
  const canFireMove = !(b.moving || b.pivoted) || G.gyro;
  if (gm.status === 'ok' && (g.act === 'fire' || g.act === 'rotfire')) {
    const u = target(g.target);
    if (!u) say(L('目標が見えない。', 'No target.'));
    else if (!mainOk) say(L('主砲は撃てない。', 'The main gun cannot fire.'), 'bad');
    else if (!canFireMove) say(L('走行中は主砲を撃てない（ジャイロ訓練が必要）。', 'Cannot fire on the move (gyro training needed).'), 'bad');
    else {
      let rot = 0;
      const want = sectorIdx(u.sector);
      if (b.turret !== want) { if (g.act === 'rotfire') { const dd = Math.abs(want - b.turret); rot = Math.min(dd, 6 - dd); b.turret = want; b.acq = null; } else { say(L('砲塔の正面に目標がいない。', 'Target is not in the turret arc.')); rot = -1; } }
      if (rot >= 0) fireMainGun(u, g.mode || 'direct', { cmdDirect: cmdDirFire, rotated: rot, pivoted: b.pivoted, track: !!g.track, passAmmo: o.A && o.A.act === 'pass' });
    }
  } else if (gm.status === 'ok' && g.act === 'rotate') {
    if (g.to != null && g.to !== b.turret) { b.turret = g.to; b.acq = null; say(L('砲塔を旋回させた。', 'The turret traverses.')); }
  } else if (gm.status === 'ok' && g.act === 'coax') {
    if (!d.jam.coax) mgOrder('coax', g, 'G', cmdDirFire, z => z[0] === PB.SECTORS[b.turret]);
  }
  stepDone(n0); n0 = SAYN;
  // 3) 機関銃（目標か、前進射撃のゾーン）
  const a = o.A || {};
  if (G.crew.A.status === 'ok' && a.act === 'bow' && !d.jam.bow && !b.hull) mgOrder('bow', a, 'A', cmdDirFire, z => sectorIdx(z[0]) === b.facing);
  stepDone(n0); n0 = SAYN;
  const c = o.C || {};
  if (G.crew.C.status === 'ok' && c.act === 'aa' && b.hatch.C && !d.jam.aa && !d.broken.aa) mgOrder('aa', c, 'C', false, () => true);
  if (G.crew.C.status === 'ok' && c.act === 'sub' && b.hatch.C) mgOrder('sub', c, 'C', false, () => true);
  stepDone(n0); n0 = SAYN;
  // 4) その他
  const l = o.L || {};
  if (G.crew.L.status === 'ok') {
    if (l.act === 'aa' && tank().loaderAA && b.hatch.L && !d.jam.aa && !d.broken.aa) mgOrder('aa', l, 'L', false, () => true);
    if (l.act === 'sub' && tank().turret !== 'A' && b.hatch.L) mgOrder('sub', l, 'L', false, () => true);
    stepDone(n0); n0 = SAYN;
    if (l.act === 'repairaa' && tank().loaderAA) tryRepair('aa', G.crew.L.rating);
    if (l.act === 'repairmain') tryRepair('main', G.crew.L.rating + (g.act === 'repair' && gm.status === 'ok' ? gm.rating : 0));
    if (l.act === 'repaircoax') tryRepair('coax', G.crew.L.rating);
    if (l.act === 'mortar' && d.smokeBomb > 0) { d.smokeBomb--; addSmoke(PB.SECTORS[b.turret], 0, 1); say(L('発煙弾を発射。', 'Smoke mortar fires.')); }
    if (l.act === 'change' && l.ammo && d.ammo[l.ammo] > 0) { b.load = l.ammo; say(L(`弾を${l.ammo}に替えた。`, `Round changed to ${l.ammo}.`)); }
    if (l.act === 'restock') { restockRack(); say(L('即応弾架に補充した。', 'Ready rack restocked.')); }
    if (!b.load && !d.jam.main) b.load = d.ammo[b.reload] > 0 ? b.reload : (['HE', 'AP', 'WP', 'HCBI', 'HVAP'].find(x => d.ammo[x] > 0) || null);
    stepDone(n0); n0 = SAYN;
  }
  if (a.act === 'repairbow' && G.crew.A.status === 'ok') tryRepair('bow', G.crew.A.rating);
  if (c.act === 'repairaa' && G.crew.C.status === 'ok') tryRepair('aa', G.crew.C.rating);
  // 8.64 ペリスコープの交換
  for (const p of POS) { const oo = o[p]; if (oo && oo.act === 'periscope' && G.crew[p].status === 'ok' && G.crew[p].periscope === false && d.periscopes > 0) { d.periscopes--; G.crew[p].periscope = true; say(L(`${POS_NAME[p]()}がペリスコープを交換した。`, `${POS_NAME[p]()} replaces the periscope.`)); } }
  // 19.22 副操縦手が負傷者の席へ移る（丸1ラウンド。操縦手以外の席では腕前が半分）
  if (a.act === 'swap' && G.crew.A.status === 'ok' && a.to && G.crew[a.to].status !== 'ok' && a.to !== 'A') swapAssistant(a.to);
  stepDone(n0); n0 = SAYN;
  if (((c.act === 'grenade') || g.act === 'grenade') && d.grenades > 0) { d.grenades--; b.smokeOnTank += 2; say(L('発煙手榴弾を投げた。', 'Smoke grenade thrown.')); }
  stepDone(n0); n0 = SAYN;
  // 気絶の回復
  POS.forEach(p => { if (G.crew[p].status === 'uncon' && d10(L(`${G.crew[p].name}の意識(1-5回復)`, `${G.crew[p].name} recovers (1-5)`)) <= 5) { G.crew[p].status = 'ok'; say(L(`${G.crew[p].name}が意識を取り戻した。`, `${G.crew[p].name} comes to.`), 'good'); } });
  stepDone(n0);
  if (checkBattleEnd()) return afterBattle();
  // 5) 敵（20.43 反撃で待ち伏せた最初のラウンドは動かない）
  if (b.freeRound) b.freeRound = false; else enemyPhase(false);
  if (G.phase !== 'battle') return afterBattle();
  if (checkBattleEnd()) return afterBattle();
  // 6) 味方
  friendlyAll(0, 'friend', null);
  if (checkBattleEnd()) return afterBattle();
  // 7) ランダム
  randomEvent();
  if (G.phase !== 'battle') return afterBattle();
  if (checkBattleEnd()) return afterBattle();
  return beginRound();
}
function afterBattle() { if (G.phase === 'postko') return debrief(); return { ended: true }; }
// 8.36 弾架の補充: 残っている弾で全部埋める（Q&A）
function restockRack() { const d = G.day, t = tank(); const def = defaultRack(t); let left = t.rack; const r = {}; for (const k of ['AP', 'HE', 'WP', 'HCBI', 'HVAP']) { const n = Math.min(left, def[k] || 0, d.ammo[k] || 0); r[k] = n; left -= n; } for (const k of ['HE', 'AP']) { const n = Math.min(left, (d.ammo[k] || 0) - r[k]); if (n > 0) { r[k] += n; left -= n; } } d.rack = r; }
function tryRepair(what, rating) {
  const d = G.day;
  if (!d.jam[what]) return;
  const raw = rr100();
  J(L(`${WEAPON_WORD(what)}の修理(腕前${rating}): 2D = ${raw} -${rating} = ${raw - rating}(1-20修理、91-破損)`, `Repair (${what}): ${raw} -${rating} = ${raw - rating}`));
  if (raw >= 98 || raw - rating >= 91) { d.broken[what] = true; d.jam[what] = false; say(L('修理できない。この銃砲は今日はもう使えない。', 'Beyond repair for today.'), 'bad'); return; }
  if (raw - rating <= 20) { d.jam[what] = false; say(L(`修理完了！ 撃てる。`, `Repaired!`), 'good'); if (what === 'main' && !G.bb.load) G.bb.load = G.bb.reload; } else say(L('修理は進まない。', 'Repair continues.'));
}
// ===== 敵の行動（13.0）=====
function enemyPhase(ambush) {
  const b = G.bb, d = G.day;
  // 敵の番は、始めと、敵が1隊動くたびに一度止める（ユーザーの指示 2026-11-08）
  if (b.units.length) { const w0 = pick(['A', 'G', 'L', 'D'].filter(q => G.crew[q] && G.crew[q].status === 'ok')) || 'A'; stop(pick([L(`${crewN(w0)}「隊長、敵が動きます！」`, `${crewN(w0)}: "Sarge, they're moving!"`), L(`${crewN(w0)}「敵に動きあり！」`, `${crewN(w0)}: "Movement out there!"`)]), pick([L('目を離すな', 'Keep your eyes on them'), L('よく見ておけ', 'Watch them')])); }
  for (const u of b.units.slice()) {
    if (G.phase !== 'battle' || !b.units.includes(u)) continue;
    const key = u.cls === 'AT' ? 'AT' : ['TANK', 'SPG'].includes(u.cls) ? 'veh' : ['LW', 'MG'].includes(u.cls) ? 'inf' : 'lt';
    const T = PB.ENEMY[d.sc][key];
    let raw = rr100(); const raw0 = raw;
    if (ambush) raw += ['TANK', 'SPG', 'TRUCK', 'PSW'].includes(u.cls) ? 10 : 20;
    let act = rowOf(T, raw);
    J(L(`${unitLabel(u)}は何をするか: 2D = ${raw0}${ambush ? ` (待ち伏せで ${raw})` : ''} → ${ACT_WORD(act)}`, `What does ${unitLabel(u)} do: ${raw0} → ${ACT_WORD(act)}`));
    if (u.spot === 'hidden' && !['F', 'L', 'R', 'B'].includes(act)) act = 'none';
    if (u.disabled && ['F', 'L', 'R', 'B'].includes(act)) act = 'none';
    const firingAt = b.acq && b.acq.id === u.id;
    if (act === 'any3') { if (firingAt) act = u.facing === 0 ? 'you' : 'B'; else act = 'any'; }
    else if (act === 'any4') { act = firingAt ? 'you' : 'any'; }
    if (act === 'lead') act = d.lead ? 'you' : 'any';
    if (act === 'leadcoll') act = d.lead ? 'coll' : 'none'; // 会戦: MG/LW の 96-100 は先頭戦車のみ
    if (u.cls === 'TRUCK' && (act === 'inf' || act === 'coll')) act = 'none';
    if (act === 'none') { u.moving = false; continue; } // 4.75 何もしない・射撃なら移動マーカーを外す
    if ('FLRB'.includes(act)) { enemyMove(u, act); if (b.units.includes(u)) { say(L(`${unitLabel(u)}${tagOf(u)}が${sectorName(u.sector)}・${rangeName(u.range)}へ動いた。`, `${unitLabel(u)}${tagOf(u)} moves to ${sectorName(u.sector)}, ${rangeName(u.range)}.`)); checkAdvMG(u); } PAUSE(ack()); continue; }
    u.moving = false;
    u.firedLast = true;
    if (u.spot === 'none' && u.identified === false) { /* 発砲で見つかりやすくなる */ }
    if (act === 'inf') enemyFireInf(u);
    else if (act === 'any') enemyFireTank(u);
    else if (act === 'coll') { say(L(`${unitLabel(u)}の銃弾が車体をたたく。`, `${unitLabel(u)} rakes the hull.`)); collateral(); }
    else if (act === 'you') { if (u.cls === 'TANK' || u.cls === 'SPG' || u.cls === 'AT') fireAtYou(u); else collateral(); }
    PAUSE(ack());
  }
}
function loseArea(a) { const d = G.day; if (a.id === d.map.exit) { d.vpLost += 10; d.lostEx++; } else { d.vpLost += 1; d.lostN++; } }
function enemyMove(u, dir) {
  const b = G.bb, i = sectorIdx(u.sector);
  if (dir === 'F') { if (u.range > 0) u.range--; else u.sector = PB.SECTORS[(i + 3) % 6]; }
  if (dir === 'B') {
    if (u.range < 2) u.range++;
    else {
      if (['1', '2', '3'].includes(u.sector)) { const a = G.day.map.areas[G.day.map.prev]; if (a) { a.left.push(u); if (a.us) loseArea(a); a.us = false; } }
      say(L(`${unitLabel(u)}${tagOf(u)}は戦場から退いた。`, `${unitLabel(u)}${tagOf(u)} withdraws from the field.`));
      markGone(u, 'out');
      b.units = b.units.filter(x => x !== u); if (b.acq && b.acq.id === u.id) b.acq = null; return;
    }
  }
  if (dir === 'L') u.sector = PB.SECTORS[(i + 5) % 6];
  if (dir === 'R') u.sector = PB.SECTORS[(i + 1) % 6];
  if (b.us[u.sector]) { delete b.us[u.sector]; say(L(`味方は${sectorName(u.sector)}から押し出された。`, `Friendly forces are pushed out of ${sectorName(u.sector)}.`), 'bad'); }
  if (u.spot !== 'none') u.spot = 'none';
  setFacingTerrain(u); u.moving = true;
  if (b.acq && b.acq.id === u.id && dir !== 'B') b.acq = null;
  // 動いた先は、敵の番のほうで1行にまとめて出す（2行出ないように。2026-11-08）
}
function enemyFireInf(u) {
  const d = G.day, tbl = PB.EFIRE[d.sc === 'C' ? 'C' : 'AB'];
  let need = ['TANK', 'SPG'].includes(u.cls) ? tbl.veh[u.range] : u.cls === 'MG' || u.type === 'PSW' ? tbl.MG[u.range] : tbl.LW[u.range];
  if (d.w.fog || d.w.fall) { if (u.range > 0) return; need = Math.floor(need / 2); }
  for (let i = 0; i < smokeBetween(u); i++) need = Math.floor(need / 2);
  const r = rr100();
  J(L(`${unitLabel(u)}の射撃が味方の歩兵に当たるか: 2D = ${r}、必要 ${need} 以下 → ${r <= 3 || r <= need ? '1個分隊撃破' : 'なし'}`, `Enemy vs squad: ${r}, need ${need}`));
  if (r <= 3 || r <= need) { d.squadsLost++; say(pick([L(`${unitLabel(u)}の射撃で味方の歩兵1個分隊がやられた。`, `${unitLabel(u)} cuts down a US squad.`), L('「衛生兵！」 無線に叫び声が入る。歩兵分隊がやられた。', '"Medic!" on the radio. A squad is down.')]), 'bad'); }
}
function gunOf(u) { const t = u.type || u.shown; return (PB.UNIT[t] || {}).gun || '75L'; }
function enemyFireTank(u) {
  const d = G.day, gun = gunOf(u), tbl = PB.EFIRE[d.sc === 'C' ? 'C' : 'AB'];
  let need = tbl[gun] ? tbl[gun][u.range] : 30;
  if (d.w.fog || d.w.fall) { if (u.range > 0) return; need = Math.floor(need / 2); }
  for (let i = 0; i < smokeBetween(u); i++) need = Math.floor(need / 2);
  const rq = rr100();
  J(L(`${unitLabel(u)}の射撃が味方の戦車を倒すか: 2D = ${rq}、必要 ${need} 以下 → ${rq <= need ? '撃破' : 'なし'}`, `Enemy vs friendly tank: ${rq}, need ${need}`));
  if (rq <= need) { d.tanksLost++; say(pick([L(`僚車が${unitLabel(u)}に撃たれて炎上した！`, `A friendly tank is hit by ${unitLabel(u)} and burns!`), L('無線が途切れた。隣のシャーマンから黒煙が上がっている。', 'The radio cuts off. Black smoke from the Sherman beside you.')]), 'bad'); }
  else say(L(`${unitLabel(u)}の砲弾が僚車をかすめた。`, `${unitLabel(u)}'s round narrowly misses a friendly tank.`));
}
function fireAtYou(u) {
  const b = G.bb, d = G.day, t = tank(), w = d.w;
  const gun = gunOf(u);
  if (w.fog || w.fall) { if (u.range > 0) return; }
  let base = PB.EHIT[gun][u.range];
  if (w.fog || w.fall) base = Math.floor(base / 2);
  for (let i = 0; i < smokeBetween(u); i++) base = Math.floor(base / 2);
  const acq = b.enemyAcq[u.id] || 0;
  let m = 0;
  if (acq === 0 && u.cls !== 'AT') m += 10;
  if (acq === 1) m += [-5, -10, -15][u.range];
  if (acq >= 2) m += [-10, -20, -30][u.range];
  if (b.moving) m += 20;
  b.enemyAcq[u.id] = acq + 1;
  const dir = sectorClock(u.sector);
  stop(pick([L(`${dir}で閃光！ ${unitLabel(u)}がこっちを撃った！`, `A flash at ${dir}! ${unitLabel(u)} is firing at us!`), L(`${crewN('D')}「${dir}、${unitLabel(u)}の砲口がこっちを向いてる！」`, `${crewN('D')}: "${dir}! ${unitLabel(u)}'s gun is on us!"`), L(`${dir}から風を切る音が近づく。`, `The scream of a shell from ${dir}.`)]), L('来るぞ！', 'Incoming!'), 'warn');
  const raw1 = rr100(), r = raw1 + m;
  J(L(`${unitLabel(u)}の弾が自分の戦車に当たるか: 2D = ${raw1} ${sg(m)} = ${r}、必要 ${base} 以下 → ${r <= base ? '命中' : '外れ'}`, `Enemy to-hit: ${raw1} ${sg(m)} = ${r}, need ${base}`));
  if (r > base) { say(pick([L(`砲弾は頭上をかすめた。頭の毛が逆立つ。`, `It screams past overhead. Hair stands on end.`), L(`横の地面がえぐれた。外れだ。`, `The earth beside you erupts. A miss.`), L(`${crewN('A')}「今のは近かった……」`, `${crewN('A')}: "That was close..."`)]), 'warn'); return; }
  // 命中
  const hd = b.hull;
  const lr = d10(L('命中箇所(1-4砲塔、5-9車体、10履帯。車体隠蔽は1-5砲塔、6-外れ)', 'Hit location'));
  stop(L('衝撃！ 車内が揺れた！', 'IMPACT! The whole tank rings!'), L('どこだ！？', 'Where!?'), 'bad');
  if (hd && lr >= 6) { say(L('砲弾は稜線に当たった！ 車体隠蔽に救われた。', 'The round hits the ridge. Hull down saved you.'), 'good'); return; }
  const loc = hd ? 'T' : lr <= 4 ? 'T' : lr <= 9 ? 'H' : 'X';
  if (loc === 'X') { b.thrown = true; b.moving = false; say(L('履帯に被弾！ 動けない！', 'Track hit! Immobilized!'), 'bad'); return; }
  const ref = loc === 'T' ? b.turret : b.facing;
  const o = (sectorIdx(u.sector) - ref + 6) % 6;
  const col = o === 0 ? 0 : o === 3 ? 2 : 1;
  const need = parseKill(PB.EKILL[gun][t.armor][col], loc, u.range);
  stop(L(`${loc === 'T' ? '砲塔' : '車体'}${['正面', '側面', '背面'][col]}に当たった！ 抜かれたか！？`, `${loc === 'T' ? 'Turret' : 'Hull'} ${['front', 'side', 'rear'][col]} hit! Did it get through!?`), L('確認しろ', 'Check'), 'bad');
  const pr = rr100();
  J(L(`装甲を貫通するか(敵${gun}砲、装甲${t.armor}、${loc === 'T' ? '砲塔' : '車体'}、${['前', '横', '後'][col]}): 2D = ${pr}、必要 ${need} 以下 → ${pr <= need ? '貫通' : '弾いた'}`, `Penetration (${gun}, armor ${t.armor}): ${pr}, need ${need}`));
  if (pr <= need) {
    const part = loc === 'T' ? ['TF', 'TR', 'TR', 'TB', 'TL', 'TL'][o] : ['HF', 'HFR', 'HBR', 'HB', 'HBL', 'HFL'][o];
    say(L(`${dir}から${unitLabel(u)}の砲弾が${loc === 'T' ? '砲塔' : '車体'}を貫通した！`, `${unitLabel(u)}'s round penetrates the ${loc === 'T' ? 'turret' : 'hull'} from ${dir}!`), 'bad');
    tankKO(part, gun);
  } else say(pick([L(`ガン！ ${loc === 'T' ? '砲塔' : '車体'}に当たったが貫通せず。頭がしびれる。`, `CLANG! Off the ${loc === 'T' ? 'turret' : 'hull'} — no penetration. Ears ringing.`), L(`弾かれた！ ${G.crew.A.name}「神様！」`, `It bounced! ${G.crew.A.name}: "Oh God!"`)]), 'warn');
}
// ===== 撃破（4.81）=====
function woundRoll(p, mod) {
  const m = G.crew[p], raw = rr100(), v = raw === 100 ? 100 : raw + mod;
  const k = rowOf(PB.WOUND_ROWS, v);
  J(L(`${POS_NAME[p]()} ${m.name}の負傷の程度: 2D = ${raw} ${sg(mod)} = ${v} → ${WOUND_WORD(k)}`, `Wound ${m.name}: ${raw} ${sg(mod)} = ${v} → ${WOUND_WORD(k)}`));
  return { k, raw };
}
function applyWound(p, k, gun) {
  const m = G.crew[p], d = G.day;
  if (k === 'near' || (k === 'light')) return;
  if (k === 'uncon') { if (gun) { m.status = 'uncon'; say(L(`${POS_NAME[p]()} ${m.name}が気を失った。`, `${POS_NAME[p]()} ${m.name} is unconscious.`), 'bad'); } return; }
  if (k === 'out1' || k === 'outD' || k === 'home' || k === 'kia') {
    const wk = k === 'out1' ? 1 : k === 'outD' ? d10(L('離脱の週数', 'Weeks out')) : 99;
    if (k === 'kia') { m.status = 'kia'; say(L(`${POS_NAME[p]()} ${m.name}が戦死した。`, `${POS_NAME[p]()} ${m.name} is killed.`), 'bad'); }
    else { m.status = wk === 99 ? 'home' : 'out'; say(L(`${POS_NAME[p]()} ${m.name}が重傷を負った。`, `${POS_NAME[p]()} ${m.name} is badly wounded.`), 'bad'); if (wk !== 99) G.wounded.push({ pos: p, man: Object.assign({}, m, { status: 'ok' }), left: wk * 7 }); }
    if (p === 'G' && G.gyro) G.gyro = false;
    if (p === 'C') { d.woundsToday = true; }
  }
}
function tankKO(part, gun, pf) {
  const b = G.bb, d = G.day, t = tank();
  stop(pick([L('白い閃光と熱風。車内が煙で満ちる。「脱出！ 脱出だ！」', 'White light and hot wind. Smoke fills the hull. "Bail out! Bail out!"'), L(`金属の悲鳴。${crewN('A')}が叫ぶ。「やられた！ 出ろ！」`, `A scream of metal. ${crewN('A')} yells: "We're hit! Get out!"`)]), L('脱出！', 'Bail out!'), 'bad');
  const expR = rr100(); const expRaw = expR + (part[0] === 'H' ? 5 : 0) + (gun === '88L' || gun === '88LL' ? 5 : 0) + Math.ceil((d.extra || 0) / 2) + (t.wet ? 0 : 5);
  J(L(`戦車が爆発するか: 2D = ${expR}、修正後 ${expRaw} (100以上で爆発)`, `Explosion: ${expR} → ${expRaw}`));
  if (expRaw >= 100) {
    say(L('弾薬に引火した。戦車は一瞬で吹き飛んだ。', 'The ammunition cooks off. The tank is gone in an instant.'), 'bad');
    POS.forEach(p => { G.crew[p].status = 'kia'; });
  } else {
    const mods = PB.HITMOD[part] || {};
    for (const p of POS) { const mod = mods[p] != null ? mods[p] : (mods._ || 0); const r = woundRoll(p, mod); G.crew[p].fate = r.k; applyWound(p, r.k, true); }
    const out = [], inside = [];
    for (const p of POS) {
      const m = G.crew[p];
      if (['kia', 'home'].includes(m.status) && m.status === 'kia') continue;
      if (m.status === 'uncon') { inside.push(p); continue; }
      if (m.fate === 'home') { inside.push(p); continue; }
      const bm = d10(L(`${m.name}の脱出(修正後10以下)`, `${m.name} bails out`)) + (m.fate === 'outD' ? 2 : 0) + (p === 'L' && !t.loaderHatch ? 1 : 0);
      if (bm <= 10) { out.push(p); const w = woundRoll(p, -m.rating); applyWound(p, w.k, false); } else inside.push(p);
    }
    PAUSE(L('誰が出られた！？', 'Who got out!?'));
    if (out.length) say(L(`脱出！ ${out.map(p => G.crew[p].name).join('、')}が車外へ飛び出した。`, `Bail out! ${out.map(p => G.crew[p].name).join(', ')} get clear.`));
    // 救助
    for (const p of inside.slice()) { const res = out.find(x => G.crew[x].status === 'ok' && !G.crew[x].rescued); if (!res) break; G.crew[res].rescued = true; const w = woundRoll(res, -G.crew[res].rating); applyWound(res, w.k, false); if (G.crew[res].status === 'ok') { inside.splice(inside.indexOf(p), 1); say(L(`${G.crew[res].name}が${G.crew[p].name}を引きずり出した。`, `${G.crew[res].name} drags ${G.crew[p].name} out.`), 'good'); if (p === 'C' || res === 'C') d.medalBonus += 25; } }
    PAUSE(L('燃えるか……', 'Will she burn...'));
    const brewT = t.brew === 'W' && d.overload ? (t.model.startsWith('M4A1') ? 'M4A1' : 'M4A3') : t.brew; // 炎上表の注: 弾を積みすぎると湿式弾庫の利点がなくなる
    const brew = { M4: pf ? 85 : 80, M4A1: pf ? 80 : 75, M4A3: pf ? 75 : 70, W: pf ? 20 : 15 }[brewT];
    if (d100(L(`炎上(${brew}以下)`, `Brew up (${brew} or less)`)) <= brew) { say(L('戦車が炎上した。', 'The tank brews up.'), 'bad'); inside.forEach(p => { if (G.crew[p].status !== 'kia') { G.crew[p].status = 'kia'; say(L(`${G.crew[p].name}は戦車の中に残された。`, `${G.crew[p].name} was still inside.`), 'bad'); } }); }
    POS.forEach(p => { delete G.crew[p].rescued; delete G.crew[p].fate; });
  }
  d.status = 'ko';
  G.phase = 'postko';
  G.lostTank = true;
  b.ended = true;
}
function collateral() {
  const d = G.day, r = d100(L('付随損害(1-50なし)', 'Collateral damage (1-50 none)'));
  const b = G.bb;
  if (r <= 50) return;
  const peri = p => { G.crew[p].periscope = false; say(L(`${POS_NAME[p]()}のペリスコープが割れた。`, `${POS_NAME[p]()}'s periscope is smashed.`), 'warn'); };
  if (r <= 52) peri('D'); else if (r <= 54) peri('A'); else if (r <= 57) peri('G'); else if (r <= 60) peri('L'); else if (r <= 63) peri('C');
  else if (r <= 65) { d.broken.sight = true; say(L('照準器が割れた！ 今日はもう主砲を撃てない。', 'Gunsight broken! No more main gun today.'), 'bad'); }
  else if (r <= 70) { d.broken.aa = true; say(L('.50口径機銃がやられた。', 'The .50 cal is smashed.'), 'warn'); }
  else {
    const p = r <= 75 ? 'D' : r <= 80 ? 'A' : r <= 90 ? 'L' : 'C';
    if (b.hatch[p]) {
      if (p === 'C') d.cmdExposedColl = true;
      // 負傷表の修正: 対空機銃・短機関銃を撃っていれば+5。妨害射撃で、近距離が前進射撃の下か近い敵がいなければ-10
      const lo = b.lastOrders && b.lastOrders[p];
      const wm = (lo && (lo.act === 'aa' || lo.act === 'sub') ? 5 : 0) + (b.harass ? -10 : 0);
      const w = woundRoll(p, wm);
      if (w.k === 'near') say(L(`${G.crew[p].name}のすぐ横を銃弾が抜けた。`, `Bullets miss ${G.crew[p].name} by inches.`), 'warn');
      else if (w.k === 'light' || w.k === 'uncon') { say(L(`${G.crew[p].name}が軽傷を負った。`, `${G.crew[p].name} takes a light wound.`), 'warn'); if (p === 'C') d.woundsToday = true; }
      else { applyWound(p, w.k, false); if (p === 'C' && ['kia', 'home', 'out'].includes(G.crew.C.status)) commanderDown(); }
    }
  }
}
function commanderDown() { /* 戦闘の後で判定する */ }
function randomEvent() {
  const b = G.bb, d = G.day;
  const re = rr100(); const e = rowOf(PB.EVENTS[d.sc], re);
  const mv0 = b.moving;
  J(L(`ランダムイベント: 2D = ${re} → ${EVENT_WORD(e)}`, `Random event: ${re} → ${EVENT_WORD(e)}`));
  if (e === 'time') { spend(15); }
  else if (e === 'fart') friendlyAll(0, 'art', L('味方の砲兵が敵陣を耕している。', 'Friendly artillery works over the enemy line.'));
  else if (e === 'eart') { const r = d10(L('敵の砲撃の損害', 'Enemy artillery')); const n = r <= 6 ? 1 : r <= 9 ? 2 : 3; d.squadsLost += n; say(L(`敵の砲撃！ 歩兵${n}個分隊がやられた。`, `Enemy artillery! ${n} squads lost.`), 'bad'); collateral(); }
  else if (e === 'mine') { if (b.moving) { const r = d10(L('地雷', 'Mines')) - (d.c.year === 1945 ? 1 : 0); if (r <= 1) { d.tanksLost++; say(L('僚車が地雷を踏んだ。', 'A friendly tank hits a mine.'), 'bad'); } else if (r === 2) { b.thrown = true; b.moving = false; say(L('地雷だ！ 履帯をやられた！', 'Mine! Your track is gone!'), 'bad'); const c = d10(L('地雷の乗員への影響', 'Mine crew effect')); if (c === 9) applyWound('D', woundRoll('D', -20).k, true); if (c === 10) applyWound('A', woundRoll('A', -20).k, true); } } }
  else if (e === 'pf') panzerfaust();
  else if (e === 'har') { say(L('どこからか小銃弾が飛んでくる。', 'Rifle fire pings off the hull.')); b.harass = !PB.SECTORS.some(s => !b.us[s] && !b.advFire[zoneKey(s, 0)]) || !b.units.some(u => ['LW', 'MG'].includes(u.cls) && u.range < 2); collateral(); b.harass = false; }
  else if (e === 'fadv') { const q = PB.SECTORS.find(s => !b.us[s] && !b.units.some(u => u.sector === s)); if (q) { b.us[q] = true; say(L(`味方が${sectorName(q)}へ進出した。`, `Friendly forces advance into ${sectorName(q)}.`), 'good'); } }
  else if (e === 'rein') { const n = d.sc === 'A' ? 1 : 2; let k = 0; const a = { type: b.area }; for (let i = 0; i < n; i++) { const nu = placeUnit(activate(), a); if (nu) { k++; checkAdvMG(nu); } } if (k) say(L(`敵の増援が${k}隊現れた。`, `${k} enemy reinforcements appear.`), 'bad'); }
  else if (e === 'eadv') { const cand = PB.SECTORS.filter(s => b.us[s] && b.units.some(u => Math.abs(sectorIdx(u.sector) - sectorIdx(s)) % 5 <= 1)); if (cand.length) { delete b.us[pick(cand)]; say(L('味方が後退した。', 'Friendly forces fall back.'), 'bad'); } }
  else if (e === 'flank') friendlyAll(-10, 'friend', L('味方が側面へ回り込んだ。', 'Friendly forces work around the flank.'));
  // 出来事で何か起きたら一度止める（ユーザーの指示 2026-11-08）
  if (['eart', 'pf', 'har', 'fadv', 'rein', 'eadv'].includes(e) || (e === 'mine' && mv0)) PAUSE(ack());
}
function panzerfaust() {
  const b = G.bb, d = G.day;
  const r = d10(L('ファウストのセクター', 'Panzerfaust sector')); const s = r >= 9 ? '910' : r >= 6 ? '68' : r >= 4 ? '45' : String(r);
  if (b.us[s]) return;
  const adv = !!(b.advFire && b.advFire[zoneKey(s, 0)]);
  const a0 = d10(L('ファウストの攻撃', 'Panzerfaust attack')); let a = a0 + (d.c.year === 1945 || d.c.mon === 12 ? -1 : 0) + (b.moving ? -1 : 0) + (d.lead ? -1 : 0) + (adv ? 3 : 0) + (['1', '2', '3'].includes(s) ? -1 : 0);
  const lim = { A: 3, B: 5, C: 2 }[d.sc];
  if (a > lim && a0 !== 1) return; // 修正前の1は必ず攻撃
  stop(pick([L(`${sectorClock(s)}の茂みで人影が動いた。パンツァーファウストだ！`, `Movement in the brush at ${sectorClock(s)}. Panzerfaust!`), L(`${crewN('D')}「${sectorClock(s)}、筒を持った奴が！」`, `${crewN('D')}: "${sectorClock(s)}! Man with a tube!"`)]), L('避けろ！', 'Move!'), 'bad');
  if (d10(L('ファウストの命中(修正後1-7)', 'Panzerfaust hit (1-7)')) + (b.moving ? 2 : 0) + (adv ? 3 : 0) >= 8) { say(L('外れた！ 後ろで爆発した。', 'It misses and bursts behind you.'), 'warn'); return; }
  if (d10(L('ファウストの撃破(1-8)', 'Panzerfaust kill (1-8)')) <= 8) {
    const o = (sectorIdx(s) - b.facing + 6) % 6; const lr = d10(L('命中箇所', 'Hit location'));
    if (b.hull && lr >= 6) { say(L('車体隠蔽が弾頭を防いだ。', 'Your hull-down position stops the warhead.'), 'good'); return; }
    if (!b.hull && lr === 10) { b.thrown = true; b.moving = false; say(L('履帯をやられた！', 'Your track is hit!'), 'bad'); return; }
    const part = lr <= 4 ? ['TF', 'TR', 'TR', 'TB', 'TL', 'TL'][o] : ['HF', 'HFR', 'HBR', 'HB', 'HBL', 'HFL'][o];
    tankKO(part, 'PF', true);
  } else say(L('命中したが、噴流は装甲の中で止まった！', 'It hits, but the jet fails to get through!'), 'warn');
}
// 19.3 戦闘のあとすぐ補充する（1人でも30分）。車長は別（その日で終わる）
function replaceCrew() {
  let any = false;
  // 席を移っていた副操縦手を元へ戻す
  for (const p of POS) { const m = G.crew[p]; if (m.subFor) { m.rating = m.origRating; delete m.origRating; delete m.subFor; const w = G.crew.A; G.crew.A = m; G.crew[p] = w; } }
  for (const p of POS) if (p !== 'C' && ['kia', 'out', 'home'].includes(G.crew[p].status)) {
    G.crew[p] = newMan(); G.crew[p].periscope = true; any = true;
    say(L(`補充兵 ${G.crew[p].name} が${POS_NAME[p]()}として乗り込む（腕前${G.crew[p].rating}）。`, `Replacement ${G.crew[p].name} joins as ${POS_NAME[p]()} (rating ${G.crew[p].rating}).`));
  }
  if (any) spend(30);
}
function swapAssistant(p) {
  const a = G.crew.A, w = G.crew[p];
  a.origRating = a.rating; a.subFor = p;
  if (p !== 'D') a.rating = Math.floor(a.rating / 2);
  G.crew[p] = a; G.crew.A = w;
  say(L(`${a.name}が${POS_NAME[p]()}の席に移った。`, `${a.name} moves to the ${POS_NAME[p]()}'s position.`), 'warn');
}
function checkBattleEnd() {
  const b = G.bb, d = G.day;
  if (G.phase === 'postko') return endDayKO();
  if (G.crew.C.status === 'kia' || G.crew.C.status === 'out' || G.crew.C.status === 'home') { /* 車長不在でも戦車は戦う */ }
  if (G.phase !== 'battle') return null;
  if (b.left) return { left: true };
  if (b.units.length) return null;
  // Q&A: 一部の敵だけ盤外へ出ていたら、区域を確保するにはその敵と戦う（配置し直す）
  if ((b.offBoard || []).length && !b.replaced) {
    b.replaced = true; const back = b.offBoard; b.offBoard = [];
    let k = 0;
    for (const u of back) { const nu = placeUnit(u.cls, { type: b.area }); if (nu) { nu.type = u.type; nu.shown = u.shown; nu.identified = u.identified; k++; } }
    if (k) { say(L('押し出した敵が戻ってきた。', 'The enemy you drove off comes back.'), 'warn'); return null; }
  }
  say(L('敵影なし。この区域の戦闘は終わった。', 'No more targets. The battle here is over.'), 'head');
  // 故障の自動修理
  for (const k of ['main', 'coax', 'bow', 'aa']) if (d.jam[k]) { if (d100(L('戦闘後の修理(91-破損)', 'Repair after battle')) >= 91) { d.broken[k] = true; } d.jam[k] = false; }
  G.phase = d.sc === 'C' ? 'ca' : 'move';
  const m = d.map; const a = m.areas[b.areaId];
  d.freeCheck = true;
  // Q&A: 戦闘のあとはペリスコープの交換と弾架の補充が自由にできる
  POS.forEach(p => { if (G.crew[p].periscope === false && d.periscopes > 0) { d.periscopes--; G.crew[p].periscope = true; } });
  restockRack();
  replaceCrew();
  // 6.0 車長が倒れたらその日は終わり
  if (['kia', 'out', 'home'].includes(G.crew.C.status)) { say(L('車長を失い、戦車は後方へ下がった。', 'With the commander down, the tank falls back.'), 'bad'); return debrief(); }
  if (d.broken.main || d.broken.sight || b.thrown) { say(L('この戦車は今日はもう戦えない。', 'This tank is finished for the day.')); return debrief(); }
  b.ended = true;
  if (d.sc === 'C') { const roll = d10(L('次の戦闘までの時間', 'Time to next battle')); spend((Math.floor(roll / 2) + 1) * 60); return dayEndCheck() || { cleared: true }; }
  return capture(a) || { cleared: true };
}
function endDayKO() { return debrief(); }
// 反撃阻止: 15分ごとに戦闘の判定
function caTick() {
  const d = G.day;
  spend(15);
  const res = d.res, a = { type: 'B', res: null, left: [] };
  const r = d10(L('反撃の判定', 'Counterattack check'));
  a.res = res === 'L' ? (r <= 7 ? 'L' : 'M') : res === 'M' ? (r <= 5 ? 'L' : r <= 9 ? 'M' : 'H') : (r <= 4 ? 'L' : r <= 8 ? 'M' : 'H');
  const need = { L: 8, M: 6, H: 4 }[a.res];
  if (r >= need) { a.id = d.map.cur; const ar = d.map.areas[d.map.cur]; a.left = ar.left; ar.left = []; return startBattle(Object.assign(ar, { res: a.res }), false); }
  return dayEndCheck();
}
// ===== 4.9 夕方 =====
function debrief() {
  const d = G.day, t = tank();
  G.phase = 'debrief';
  const mult = { A: [1, 2, 1], B: [1, 2, 3], C: [2, 0, 2] }[d.sc];
  const your = d.vpTank * mult[0], fr = d.vpFriend * mult[0] - 5 * d.tanksLost - 3 * d.squadsLost;
  const terr = d.vpArea * mult[1] - d.vpLost * mult[2];
  const total = your + fr + terr;
  const res = { your, fr, terr, total, promoted: false, medal: null, ko: d.status === 'ko', improved: [] };
  say(L(`── 夕方の報告。戦車の戦果${your}、味方${fr}、地域${terr}、合計${total}点。`, `── Evening report. Tank ${your}, friendly ${fr}, territory ${terr}, total ${total} VP.`), 'evening');
  const cLost = ['kia', 'home'].includes(G.crew.C.status);
  const idAt = G.tankId;
  const crewSnap = POS.map(p => { const m = G.crew[p]; return { pos: p, name: m.name, rating: m.rating, status: m.status }; });
  // 車長の負傷: 治るまで作戦を休んで戻る（6.3 負傷しても生き残れば勝ち）
  if (G.crew.C.status === 'out') {
    const w = G.wounded.find(x => x.pos === 'C');
    const days = w ? w.left : 7;
    G.crew.C.status = 'ok'; G.wounded = G.wounded.filter(x => x !== w);
    G.calIdx = Math.min(PB.CAL.length, G.calIdx + days);
    say(L(`車長は負傷して${days}日間入院した。`, `The commander spends ${days} days in hospital.`), 'warn');
  }
  // 昇進
  const c = d.c, tag = c.year + '/' + c.mon;
  if (G.rank < 4 && G.totalVP >= (G.rank + 1) * 100 && G.promoMonth !== tag && !cLost) { G.rank++; G.promoMonth = tag; res.promoted = true; say(L(`昇進！ 今日からあなたは${RANKS[G.rank]()}だ。`, `Promoted! You are now ${RANKS[G.rank]()}.`), 'good'); }
  // 勲章
  let m = 2 * d.vpTank + d.vpFriend + d.vpArea + d.medalBonus + (G.rank >= 2 ? 5 : 0) + (d.cmdExposedColl ? 5 : 0) + (d.woundsToday ? 10 : 0) + (c.mon === 11 || c.mon === 12 ? 5 : 0);
  const rm0 = rr100(), roll = rm0 + m;
  J(L(`勲章がもらえるか: 2D = ${rm0} ${sg(m)} = ${roll}(200以上)`, `Decoration: ${rm0} ${sg(m)} = ${roll}`));
  const medal = roll >= 300 ? L('名誉勲章', 'Medal of Honor') : roll >= 250 ? L('殊勲十字章', 'Distinguished Service Cross') : roll >= 225 ? L('シルバースター', 'Silver Star') : roll >= 200 ? L('ブロンズスター', 'Bronze Star') : null;
  if (medal && !cLost) { G.medals.push(medal); res.medal = medal; say(L(`${medal}が授与された。`, `Awarded the ${medal}.`), 'good'); }
  if (d.woundsToday && !cLost) { G.medals.push(L('パープルハート', 'Purple Heart')); }
  // 腕前の向上
  for (const p of POS) {
    const man = G.crew[p];
    if (man.status === 'ok' || man.status === 'uncon') { man.status = 'ok'; man.days++; if (man.rating < 10 && d10(L(`${man.name}の腕前の向上(今${man.rating}より上)`, `${man.name} improves`)) > man.rating) { man.rating++; res.improved.push(p); say(L(`${POS_NAME[p]()} ${man.name}の腕が上がった（${man.rating}）。`, `${POS_NAME[p]()} ${man.name} improves to ${man.rating}.`), 'good'); } }
  }
  G.journal.push({ date: dateText(c), sc: c.sc, total, ko: d.status === 'ko', kills: Object.values(d.ko).reduce((a, b) => a + b, 0) });
  if (d.status === 'ko') { replaceTank(); }
  if (cLost) {
    if (G.crew.C.status === 'kia') { G.over = { win: false, why: L('車長は戦死した。', 'The commander is dead.'), canContinue: true }; }
    else { G.over = { win: true, why: L('車長は重傷で本国へ送られた。あなたの戦争はここで終わった。生きて帰れたのだから、勝ちだ。', 'The commander has been sent home wounded. Your war is over, and you are alive: you win.'), canContinue: true }; }
    G.phase = 'over';
  }
  res.report = {
    date: dateText(c), tankName: G.tankName, model: t.model, tankId: idAt, sc: d.sc, res: d.res, weather: weatherText(d.w), crew: crewSnap, rank: G.rank, promoted: res.promoted, medal: res.medal, totalVP: G.totalVP,
    rise: d.rise, set: d.set, start: d.start, end: d.time, ammo: Object.assign({}, d.ammo), smokeBomb: d.smokeBomb, grenades: d.grenades, periscopes: d.periscopes,
    ko: d.ko, fko: d.fko, fortT: d.fortT, fortF: d.fortF, areas: d.areas, exits: d.exits, lostN: d.lostN, lostEx: d.lostEx, tanksLost: d.tanksLost, squadsLost: d.squadsLost,
    your, fr, terr, total, mult, koed: d.status === 'ko', broken: !!(d.broken.main || d.broken.sight), lead: !!d.lead,
  };
  return { debrief: res };
}
function continueAsReplacement() {
  G.crew.C = newMan(); G.over = null; G.phase = 'calendar'; G.totalVP = 0; G.rank = 0; say(L(`新しい車長 ${G.crew.C.name} が着任した。戦争はまだ続く。`, `New commander ${G.crew.C.name} takes over. The war goes on.`));
}
const ENGINE = { setJudge, setLoad, advMarkers, setPause, newCampaign, nextDay, opCheck, opArt, opAir, opResupply, opEnter, resolveRound, beginRound, caTick, debrief, continueAsReplacement, replaceTank, setLogger, tank, today, neighbors, enterTime, get G() { return G; }, set G(v) { G = v; }, checkBattleEnd, hitChance, fireMainGun, smokeBetween, sectorClock };
if (typeof module !== 'undefined') module.exports = ENGINE;
