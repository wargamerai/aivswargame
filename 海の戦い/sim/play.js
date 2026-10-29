// 海の戦い: 画面なしで1回対戦（連合=連合AI / 枢軸=ドイツ軍AI＋自動判断）
// 使い方: node play.js <ゲームのフォルダ>
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const gameDir = process.argv[2];
let html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
// 外部スクリプトはインラインで埋め込む
for(const f of ['data.js', 'battle.js']){
  html = html.replace(`<script src="${f}"></script>`, `<script>${fs.readFileSync(path.join(gameDir, f), 'utf8')}</script>`);
}

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push(String(e && (e.stack || e.message) || e)));
const realSetTimeout = setTimeout;

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  virtualConsole: vc,
  pretendToBeVisual: true,
  beforeParse(w){
    w.alert = () => {};
    w.confirm = () => true;
    w.prompt = () => null;
    // アニメーションの待ち時間を0に
    const st = w.setTimeout.bind(w);
    w.setTimeout = (fn, ms, ...a) => st(fn, 0, ...a);
    w.console = { log(){}, warn(){}, error: (...a) => errors.push(a.join(' ')), trace(){}, info(){}, debug(){} };
  }
});
const w = dom.window;
const G = code => w.eval(code);

if(errors.length){ console.log('読み込みエラー:', errors.join('\n')); }

// ===== オプションルール（--ub-nolimit --bismarck7 --us-ease） =====
{
  const flags = { '--ub-nolimit': 'ubNoLimit', '--bismarck7': 'bismarck7', '--us-ease': 'usEase' };
  for(const a of process.argv.slice(3)){
    if(!flags[a]) continue;
    const cb = w.document.querySelector(`.optRule[data-opt="${flags[a]}"]`);
    cb.checked = true;
    w.setOptionRule(cb);
  }
}
// ===== ダイスの演出を飛ばす =====
w.rollAnimDice = async (el, r, cls) => { el.classList.add(cls); el.textContent = r; };
// ===== ボタン待ちを即時に進める =====
w.waitForCombatFlowBtn = () => Promise.resolve();
w.waitForAirAttackBtn = () => Promise.resolve();
w.waitForCombatConfirm = () => Promise.resolve();
w.waitForRoundEnd = () => Promise.resolve();

// ===== 陣営を一時的に入れ替えて、AI側の判断処理を枢軸にも使う =====
const withAiSide = (side, fn) => {
  const prevAi = G('aiSide'), prevHuman = G('humanSide');
  G(`aiSide=${JSON.stringify(side)}; humanSide=${JSON.stringify(side === 'allies' ? 'axis' : 'allies')}`);
  const restore = () => G(`aiSide=${JSON.stringify(prevAi)}; humanSide=${JSON.stringify(prevHuman)}`);
  let r;
  try { r = fn(); } catch(e){ restore(); throw e; }
  if(r && typeof r.then === 'function') return r.then(v => { restore(); return v; }, e => { restore(); throw e; });
  restore();
  return r;
};

// 目標選択（射撃側=AI）
const origSurf = w.waitForSurfaceTarget;
w.waitForSurfaceTarget = (side, sea, attacker, pending) =>
  withAiSide(attacker ? attacker.side : (side === 'allies' ? 'axis' : 'allies'), () => origSurf(side, sea, attacker, pending));
const origFromList = w.waitForTargetClickFromList;
w.waitForTargetClickFromList = (list, attacker) =>
  withAiSide(attacker ? attacker.side : G('aiSide'), () => origFromList(list, attacker));
const origClickIn = w.waitForTargetClickIn;
w.waitForTargetClickIn = (side, sea, ex, mode) => {
  const prev = G('aiMode');
  G('aiMode=true');
  const r = withAiSide(side === 'allies' ? 'axis' : 'allies', () => origClickIn(side, sea, ex, mode));
  G(`aiMode=${prev}`);
  return r;
};
// Uボートなどの単発の目標選択
if(w.waitForTargetClick){
  const origClick = w.waitForTargetClick;
  w.waitForTargetClick = (side, sea) => {
    const prev = G('aiMode');
    G('aiMode=true');
    const r = withAiSide(side === 'allies' ? 'axis' : 'allies', () => origClick(side, sea));
    G(`aiMode=${prev}`);
    return r;
  };
}
// 航空攻撃
const origAir = w.runAirStrike;
const lbaRec = {}; // ターン → [{ side, area }]（観戦ページ用）
w.runAirStrike = (side, ...rest) => {
  if(rest[1]){ const t = G('currentTurn'); (lbaRec[t] = lbaRec[t] || []).push({ side, area: rest[0] }); }
  return withAiSide(side, () => origAir(side, ...rest));
};
// 撤退・追撃: 枢軸は相手が撤退するなら追撃する
const origRetreat = w.tryRetreat;
w.tryRetreat = (side, sea, decision) => withAiSide(side, () => origRetreat(side, sea, decision)).then(r => {
  if(side === 'axis' && decision && decision.enemyRetreating) decision.pursue = true;
  return r;
});
const origPursuit = w.tryPursuit;
w.tryPursuit = (side, sea, groups) => withAiSide(side, () => origPursuit(side, sea, groups));

// ドイツ軍の航空攻撃: 目標の多いエリアから順に全部使う
w.selectAxisAirStrike = async (options) => {
  const count = a => G('SHIPS').filter(s => s.location === a && !s.sunk && s.side === 'allies' && s.type !== 'UBOAT' && !s.disabledThisTurn).length;
  options.sort((a, b) => count(b.area) - count(a.area) || (a.cvOnly ? 1 : 0) - (b.cvOnly ? 1 : 0));
  const opt = options[0];
  return w.startLbaBombing('axis', opt.area, opt.cvOnly, opt.useCv);
};

// 修理: 両陣営ともAIの自動修理
w.showRepairUI = () => Promise.resolve([]);
const origRepair = w.executeRepair;
w.executeRepair = async (side) => {
  const prev = G('humanSide');
  G('humanSide="none"');
  try { return await origRepair(side); } finally { G(`humanSide=${JSON.stringify(prev)}`); }
};

// 帰還先: ドイツ艦は大西洋で洋上補給できるなら補給、それ以外は元の港（なければ候補の先頭）
w.showAxisReturnUI = async (ships, options) => {
  options = options || {};
  const list = options.autoDefault ? ships.filter(s => s.location && G('SEAS')[s.location]) : ships;
  const turn = G('currentTurn');
  // 損害艦のうち、フランスへ帰れる艦は、フランスの修理枠（3）に入る分だけフランスへ（損害の小さい順）
  const toFrance = new Set();
  if(!options.autoDefault && G('PORTS').France.available.includes(turn)){
    let budget = G('PORTS').France.repair - G('SHIPS').filter(s => s.location === 'France' && !s.sunk && s.damage > 0).reduce((t, s) => t + s.damage, 0);
    list.filter(s => s.country === 'DE' && s.damage > 0 && w.getReturnPorts(s).includes('France'))
      .sort((a, b) => a.damage - b.damage)
      .forEach(s => { if(s.damage <= budget){ toFrance.add(s.id); budget -= s.damage; } });
  }
  for(const ship of list){
    const from = ship.location;
    const ports = w.getReturnPorts(ship);
    const refuelable = !ship.forcedReturn && ship.country === 'DE' && turn <= 3 &&
      (from === 'NorthAtlantic' || from === 'SouthAtlantic') && !options.autoDefault && !(ship.damage > 0);
    if(refuelable){
      const r = w.rollD6();
      if(r <= 6 - turn){ ship.refuelTurn = turn; ship.atDock = false; continue; }
      ship.location = 'Neutral'; ship.arrivedNeutralTurn = turn; ship.atDock = false; continue;
    }
    let dest;
    if(options.autoDefault) dest = ship.country === 'DE' ? 'Germany' : (ship.country === 'IT' ? 'Italy' : null);
    else dest = toFrance.has(ship.id) ? 'France' : ship.originThisTurn;
    if(!ports.includes(dest)) dest = ports.includes(ship.homePort) ? ship.homePort : ports[0];
    if(!dest) dest = ship.homePort;
    ship.location = dest;
    ship.atDock = false;
    if(dest === 'Neutral') ship.arrivedNeutralTurn = turn;
  }
};
w.waitForPortChoice = (ports) => Promise.resolve({ port: ports[0], atDock: false });

// ===== ドイツ軍（私）の移動 =====
const axisState = { assaultTurn: null, target: null, won: null };
const axisLog = [];
const axisOps = {}; // ターン → ドイツ軍の作戦の記録（レポート用）
// 1ラウンドだけの戦闘を n 回試して、枢軸（axisArr）が勝つ割合を返す
//   航空攻撃（航空力1につきダイス1個）→ 砲撃（攻撃力1につきダイス1個、無傷のドイツ艦は+1）、損害は両軍同時
//   6で命中（損害ダイス1個）、5で戦闘不能（帰港）。LBA・Uボート・撤退・追撃は入れない
//   勝ち: 沈没艦と帰港艦を除いて battleEval で比べ、枢軸のほうが大きい
function winProb(axisArr, alliedArr, n = 2000){
  const d6 = () => Math.floor(Math.random() * 6) + 1;
  const isBig = s => s.name === 'Bismarck' || s.name === 'Tirpitz';
  let wins = 0;
  for(let k = 0; k < n; k++){
    const mk = s => ({ name: s.name, side: s.side, country: s.country, type: s.type, def: s.def, dmg: s.damage || 0,
      atk: s.atk || 0, air: s.air || 0, spdOrig: s.spdOrig || s.spd, sunk: false, out: false });
    const ax = axisArr.filter(s => s.type !== 'UBOAT').map(mk), al = alliedArr.filter(s => s.type !== 'UBOAT').map(mk);
    const live = arr => arr.filter(s => !s.sunk && !s.out);
    // 目標選び（空母・船団は、ほかの艦を全部撃ったあと）
    const pickFor = (side, enemies, pend, firedAt) => {
      const cands0 = live(enemies).filter(s => s.dmg + (pend.dmg.get(s) || 0) <= s.def);
      const normal = cands0.filter(s => s.type !== 'CV' && s.type !== 'CONVOY');
      const convoy = cands0.filter(s => s.type === 'CONVOY'), cv = cands0.filter(s => s.type === 'CV');
      const allN = normal.every(s => firedAt.has(s)), allC = convoy.every(s => firedAt.has(s));
      const cands = [...normal, ...(allN ? convoy : []), ...(allN && allC ? cv : [])];
      if(!cands.length) return null;
      if(side === 'allies'){
        const pool = cands.filter(s => !isBig(s)).length ? cands.filter(s => !isBig(s)) : cands;
        const spd = s => Math.max(1, s.spdOrig - s.dmg);
        return pool.sort((a, b) => spd(b) - spd(a) || (a.def - a.dmg) - (b.def - b.dmg))[0];
      }
      const unfired = cands.filter(s => !firedAt.has(s));
      const base = unfired.length ? unfired : cands;
      return base.find(s => s.dmg === 0) || base[0];
    };
    const fire = (shooters, dice, enemies, side, pend, plusOne) => {
      const firedAt = new Set();
      for(const s of shooters){
        const t = pickFor(side, enemies, pend, firedAt);
        if(!t) return;
        firedAt.add(t);
        const bonus = plusOne && s.country === 'DE' && s.dmg === 0 ? 1 : 0;
        for(let i = 0; i < dice(s); i++){
          const r = d6() + bonus;
          if(r >= 6) pend.dmg.set(t, (pend.dmg.get(t) || 0) + d6());
          else if(r === 5) pend.out.add(t);
        }
      }
    };
    const apply = pend => {
      pend.dmg.forEach((v, s) => { s.dmg += v; if(s.dmg > s.def) s.sunk = true; else if(s.dmg === s.def && s.atk > 0) s.atk = 1; });
      pend.out.forEach(s => { if(!s.sunk) s.out = true; });
    };
    // 航空攻撃
    let pend = { dmg: new Map(), out: new Set() };
    fire(live(ax).filter(s => s.type === 'CV'), s => s.air, al, 'axis', pend, false);
    fire(live(al).filter(s => s.type === 'CV'), s => s.air, ax, 'allies', pend, false);
    apply(pend);
    // 砲撃
    pend = { dmg: new Map(), out: new Set() };
    fire(live(ax).filter(s => s.type !== 'CV' && s.atk > 0), s => s.atk, al, 'axis', pend, true);
    fire(live(al).filter(s => s.type !== 'CV' && s.atk > 0), s => s.atk, ax, 'allies', pend, true);
    apply(pend);
    const e = w.battleEval(live(ax), live(al));
    if(e.ours > e.theirs) wins++;
  }
  return wins / n;
}

function myAxisMove(){
  const SHIPS = G('SHIPS'), SEAS = G('SEAS'), PORT_SEAS = G('PORT_SEAS'), SEA_ADJ = G('SEA_ADJ');
  const seaControl = G('seaControl'), turn = G('currentTurn');
  const pw = s => (s.atk || 0) + (s.air || 0);
  const sum = arr => arr.reduce((t, s) => t + pw(s), 0);
  const alive = s => !s.sunk && !s.removed;
  const alliedAt = sea => SHIPS.filter(s => alive(s) && s.side === 'allies' && s.location === sea && s.type !== 'UBOAT');
  const placed = {}; Object.keys(SEAS).forEach(k => placed[k] = []);
  const log = [];
  const ops = { northHeld: seaControl['NorthSea'] === 'axis' || seaControl['Barents'] === 'axis', italy: null, assault: null, assaultSkipped: null, raid: false, mode: null, failed: [] };
  // 到達: 1=確実 / 2=2エリア移動（ダイス<速力） / 0=不可
  const reach = (s, sea) => {
    if(s.refuelTurn === turn - 1 && SEAS[s.location]) return 1; // 洋上補給成功艦はどこでも
    const adj = PORT_SEAS[s.location] || [];
    if(adj.includes(sea)) return 1;
    if(adj.some(mid => seaControl[mid] !== 'allies' && (SEA_ADJ[mid] || []).includes(sea))) return 2;
    return 0;
  };
  const move = (s, sea) => {
    const r = reach(s, sea);
    if(!r) return false;
    s.originThisTurn = s.originThisTurn || s.location;
    s.movedThisTurn = true;
    if(r === 2){
      const d = w.rollD6();
      if(d >= s.spd){ s.failedMove = true; log.push(`${s.name}: ${sea}へ2エリア移動失敗`); ops.failed.push(s.name); return false; }
    }
    s.location = sea;
    placed[sea].push(s);
    return true;
  };

  // --- イタリア ---
  const itShips = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.country === 'IT' && s.location === 'Italy' && !(s.damage > 0));
  const r1 = x => Math.round(x * 10) / 10;
  const itEval = w.battleEval(itShips, alliedAt('Mediterranean'));
  const medAllied = r1(itEval.theirs), itAtk = r1(itEval.ours);
  if(itShips.length && medAllied < itAtk * 2){
    itShips.forEach(s => move(s, 'Mediterranean'));
    log.push(`イタリア出撃 ${itShips.length}隻(攻${itAtk}) vs 連合${medAllied}`);
    ops.italy = { sortie: true, n: itShips.length, atk: itAtk, al: medAllied };
  } else if(itShips.length){
    log.push(`イタリア待機 (攻${itAtk} vs 連合${medAllied})`);
    ops.italy = { sortie: false, n: itShips.length, atk: itAtk, al: medAllied };
  }

  // --- ドイツ水上艦 ---
  let de = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.country === 'DE' && s.type !== 'UBOAT' && !(s.damage > 0) &&
    (G('PORTS')[s.location] || (SEAS[s.location] && s.refuelTurn === turn - 1)));
  // 船団の位置
  const convoySea = ['Barents', 'NorthSea'].find(k => SHIPS.some(s => alive(s) && s.type === 'CONVOY' && s.location === k));
  const pickTarget = () => convoySea || (sum(alliedAt('Barents')) <= sum(alliedAt('NorthSea')) ? 'Barents' : 'NorthSea');
  // 大西洋への送り込み（温存）: 勝つ確率が WIN_PROB 以上になる艦だけ送る（連合がいなければ1隻）
  //   北大西洋 → 南大西洋の順に、強い艦から1隻ずつ足して、届いたところで止める。余った艦は港に残す
  //   南大西洋はターン6から2隻まで
  const WIN_RATIO = 1.3;
  const WIN_PROB = 0.9;
  const raid = (ships) => {
    ops.raid = true;
    const saMax = turn >= 6 ? 2 : Infinity;
    const surfAt = sea => placed[sea].filter(x => x.type !== 'UBOAT');
    const cap = sea => sea === 'SouthAtlantic' ? saMax : Infinity;
    // 勝てる: 1ラウンドの勝つ確率が WIN_PROB 以上（連合がいなければ1隻）
    const winsWith = (arr, sea) => {
      if(!alliedAt(sea).length) return arr.length >= 1;
      return arr.length > 0 && winProb(arr, alliedAt(sea)) >= WIN_PROB;
    };
    const enough = sea => winsWith(surfAt(sea), sea);
    let pool = ships.filter(s => !s.movedThisTurn).sort((a, b) => pw(b) - pw(a));
    for(const sea of ['NorthAtlantic', 'SouthAtlantic']){
      const cands = pool.filter(s => reach(s, sea));
      // 届く艦すべて（上限内）で勝てるか
      const usable = cands.slice(0, cap(sea) === Infinity ? cands.length : cap(sea));
      const possible = winsWith(usable, sea);
      if(!possible){ log.push(`${sea}: 勝てないので見送り(届く${usable.length}隻 勝率${alliedAt(sea).length ? Math.round(winProb(usable, alliedAt(sea)) * 100) : 0}%)`); continue; }
      for(const s of cands){
        if(enough(sea) || surfAt(sea).length >= cap(sea)) break;
        move(s, sea);
      }
      if(surfAt(sea).length && alliedAt(sea).length) log.push(`${sea}: ${surfAt(sea).length}隻 勝率${Math.round(winProb(surfAt(sea), alliedAt(sea)) * 100)}%`);
      pool = pool.filter(s => !s.movedThisTurn);
    }
  };
  const atlSeas = () => ['NorthAtlantic', 'SouthAtlantic'];

  // バルト海: 毎ターン最低1隻。ソ連艦がいれば攻撃力と艦数で上回るまで（弱い艦から）
  {
    const ru = alliedAt('Baltic');
    const balOk = de.filter(s => reach(s, 'Baltic') === 1).sort((a, b) => (pw(a) + a.def) - (pw(b) + b.def));
    const sent = [];
    const wins = () => { const e = w.battleEval(sent, ru); return e.ours > e.theirs && sent.length > ru.length; };
    for(const s of balOk){
      if(sent.length >= 1 && (!ru.length || wins())) break;
      if(move(s, 'Baltic')) sent.push(s);
    }
    ops.baltic = { ships: sent.map(x => x.name), ru: ru.map(x => x.name), ruAtk: sum(ru), atk: sum(sent) };
    log.push(`バルト海 ${sent.length}隻(攻${sum(sent)}) vs ソ連${ru.length}隻(攻${sum(ru)})`);
    de = de.filter(s => !s.movedThisTurn);
  }

  // 中立港のドイツ艦は必ず出撃（居残ると毎ターン連合にPOCを与えるため）。損害・勝ち負けに関係なく南大西洋へ
  {
    const neu = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.country === 'DE' && s.type !== 'UBOAT' && s.location === 'Neutral' && !s.movedThisTurn);
    const out = neu.filter(s => move(s, 'SouthAtlantic'));
    if(out.length){ log.push('中立港から出撃: ' + out.map(x => x.name).join(',')); ops.neutralOut = out.map(x => x.name); }
    de = de.filter(s => !s.movedThisTurn);
  }

  let assaultNow = null; // このターンに突撃する海域
  if(axisState.assaultTurn === null){
    const target = pickTarget();
    const force = de.filter(s => reach(s, target));
    const asEval = w.battleEval(force, alliedAt(target));
    const forceAtk = r1(asEval.ours), alAtk = r1(asEval.theirs);
    // 突撃するかどうか（ターン3〜6）: 得点の状況で確率を変えてランダムに決める
    //   逆転されそう = ドイツのリードが0以下、または前ターンに連合が取った点でリードが消える
    const lead = -cumPoc;
    const danger = lead <= 0 || lead - Math.max(0, lastTurnGain) <= 0;
    const favorable = forceAtk >= alAtk * WIN_RATIO;
    let p = 0;
    if(turn >= 3 && turn <= 6){
      if(danger) p = favorable ? 0.9 : (turn === 6 ? 0.7 : 0.4);
      else p = favorable ? 0.4 : 0.05;
    }
    if(force.length && Math.random() < p){
      axisState.assaultTurn = turn; axisState.target = target;
      force.forEach(s => move(s, target));
      log.push(`殴り込み: ${target} ${force.length}隻(攻${forceAtk}) vs 連合${alAtk}`);
      ops.assault = { target, atk: forceAtk, al: alAtk };
      assaultNow = target;
      raid(de.filter(s => !s.movedThisTurn));
    } else {
      if(turn >= 3 && turn <= 6){ log.push(`殴り込み見送り: ${target} (攻${forceAtk} vs 連合${alAtk}, リード${lead}, 確率${p})`); ops.assaultSkipped = { target, atk: forceAtk, al: alAtk, lead, danger }; }
      raid(de);
    }
  } else {
    if(axisState.won === null) axisState.won = seaControl[axisState.target] === 'axis';
    if(axisState.won){
      log.push('殴り込み成功 → 大西洋'); ops.mode = 'won';
      raid(de);
    } else {
      log.push('殴り込み失敗 → 港で修理'); ops.mode = 'lost';
      // 連合艦がいない海域には出撃する（1隻ずつ）。出すのは無傷艦と、港の修理枠に入らない損害艦
      const PORTS_ = G('PORTS');
      const overCap = [];
      for(const port of ['Germany', 'France']){
        if(!PORTS_[port].available.includes(turn)) continue;
        let budget = PORTS_[port].repair;
        SHIPS.filter(x => alive(x) && x.side === 'axis' && x.country === 'DE' && x.type !== 'UBOAT' && x.location === port && x.damage > 0 && !x.movedThisTurn)
          .sort((a, b) => a.damage - b.damage)
          .forEach(x => { if(x.damage <= budget) budget -= x.damage; else overCap.push(x); });
      }
      const sortiePool = [...de.filter(x => !x.movedThisTurn), ...overCap].sort((a, b) => (pw(a) + a.def) - (pw(b) + b.def));
      const emptySeas = ['NorthAtlantic', 'SouthAtlantic', 'NorthSea', 'Barents'].filter(k => !alliedAt(k).length && !placed[k].some(x => x.type !== 'UBOAT'));
      const sent = [];
      for(const sea of emptySeas){
        const sh = sortiePool.find(x => !x.movedThisTurn && reach(x, sea));
        if(sh && move(sh, sea)) sent.push(`${sh.name}→${sea}`);
      }
      if(sent.length){ log.push('空いた海域へ出撃: ' + sent.join(', ')); ops.emptySortie = sent; }
    }
  }

  // --- Uボート ---
  const ubs = SHIPS.filter(s => alive(s) && s.type === 'UBOAT' && s.side === 'axis' && s.location === 'Germany');
  if(ubs.length){
    const aswDice = sea => alliedAt(sea).reduce((t, s) => t + ((s.type === 'CV' || s.type === 'CONVOY') ? 3 : 1), 0);
    const convoyAt = Object.keys(SEAS).find(k => SHIPS.some(s => alive(s) && s.type === 'CONVOY' && s.location === k));
    // 連合がいて、ドイツ水上艦がいない海域（連合のPOCになる海域）を手薄な順に
    const thin = Object.keys(SEAS).filter(k => alliedAt(k).length && !placed[k].some(s => s.type !== 'UBOAT') && k !== convoyAt)
      .sort((a, b) => aswDice(a) - aswDice(b));
    const queue = [...ubs];
    const put = (u, sea) => { u.location = sea; u.movedThisTurn = true; u.originThisTurn = 'Germany'; placed[sea].push(u); };
    // 連合の対潜ダイス3個につきUボート1隻を止められるとみなす。置くのは、それを上回る数を置ける海域だけ
    //   need: その海域で上回るのに足りない数（連合がいなければ0）
    const need = sea => alliedAt(sea).length ? Math.max(0, Math.floor(aswDice(sea) / 3) + 1 - placed[sea].filter(s => s.type === 'UBOAT').length) : 0;
    const putOver = sea => {
      const n = need(sea);
      if(!n || n > queue.length) return false;
      for(let i = 0; i < n; i++) put(queue.shift(), sea);
      return true;
    };
    // 置けなかったUボートは、連合艦のいない安全な海域（バルト海優先）へ。なければ港
    const toSafe = () => {
      const safe = ['Baltic', ...Object.keys(SEAS).filter(k => k !== 'Baltic')].find(k => !alliedAt(k).length);
      if(safe) while(queue.length) put(queue.shift(), safe);
      queue.length = 0;
    };
    if(assaultNow){
      // 突撃のターン: 例外として、すべて突撃先に集中
      while(queue.length) put(queue.shift(), assaultNow);
    }
    if(!assaultNow){
      // 北海かバレンツ海の連合の支配を外す（次ターンに本国から北大西洋へ出るため）。足りる方の少ない海域から
      const opts = ['NorthSea', 'Barents'].filter(sea => alliedAt(sea).length && need(sea) <= queue.length).sort((a, b) => need(a) - need(b));
      const freeOpen = ['NorthSea', 'Barents'].some(sea => !alliedAt(sea).length);
      if(!freeOpen && opts.length){
        const n = need(opts[0]);
        if(putOver(opts[0])) ops.ubBreak = { sea: opts[0], n };
      }
    }
    if(!assaultNow && axisState.assaultTurn === null){
      // 突撃までは溜めておく: 船団がいる海域に上回る数を置ければ置き、残りは安全な海域へ
      if(convoyAt) putOver(convoyAt);
      toSafe();
    }
    if(convoyAt) putOver(convoyAt);
    for(const sea of thin) putOver(sea);
    toSafe();
  }

  const dist = Object.keys(placed).filter(k => placed[k].length).map(k => `${k}:${placed[k].length}`).join(' ');
  axisLog.push(`T${turn} ${log.join(' / ')} | 配置 ${dist}`);
  ops.placed = {}; ops.uboats = {};
  Object.keys(placed).forEach(k => {
    const surf = placed[k].filter(x => x.type !== 'UBOAT');
    const ub = placed[k].filter(x => x.type === 'UBOAT').length;
    if(surf.length) ops.placed[k] = surf.map(x => x.name);
    if(ub) ops.uboats[k] = ub;
  });
  axisOps[turn] = ops;
  w.placeAllShips();
}

// ===== 対戦 =====
process.on('unhandledRejection', e => errors.push('未処理の例外: ' + (e && e.stack || e)));
const sleep = ms => new Promise(r => realSetTimeout(r, ms));
async function waitCombatEnd(){
  const btn = w.document.getElementById('combatCloseBtn');
  const label = w.document.getElementById('phaseLabel');
  let last = '', same = 0;
  while(true){
    if(btn.style.display === '' && /全戦闘 終了/.test(label.textContent)) return true;
    await sleep(50);
    const t = label.textContent;
    if(t === last){ if(++same > 200) return false; } else { same = 0; last = t; }
  }
}

// ===== レポート（ドイツ海軍 提督の報告） =====
let combatBefore = null;
const combats = {}, sunkTotal = {};
const SEA_JA = { NorthAtlantic:'北大西洋', Barents:'バレンツ海', NorthSea:'北海', Baltic:'バルト海', Mediterranean:'地中海', SouthAtlantic:'南大西洋' };
function snapShips(){
  const m = {};
  G('SHIPS').forEach(s => { m[s.id] = { id: s.id, name: s.name, side: s.side, type: s.type, country: s.country, loc: s.location, damage: s.damage || 0, def: s.def, sunk: !!s.sunk, ret: !!s.returnPending, forced: !!s.forcedReturn, failed: !!s.failedMove, removed: !!s.removed, usEntered: !!s.usEntered }; });
  return m;
}
const PORT_JA2 = { Germany:'ドイツ本国の港', France:'ブレスト港', Italy:'タラント港', Malta:'マルタ港', England:'英本国の港', Leningrad:'レニングラード港', Russia:'ムルマンスク港' };
function summarizeCombat(before, after){
  const out = {};
  for(const sea of [...Object.keys(SEA_JA), ...Object.keys(PORT_JA2)]){
    const here = Object.values(before).filter(b => b.loc === sea && !b.sunk);
    const al = here.filter(b => b.side === 'allies'), ax = here.filter(b => b.side === 'axis');
    const changed = here.some(b => after[b.id].sunk || after[b.id].damage > b.damage || after[b.id].ret);
    if((!al.length || !ax.length) && !changed) continue;
    const r = { allies: al.length, axisSurf: ax.filter(b => b.type !== 'UBOAT').length, axisUb: ax.filter(b => b.type === 'UBOAT').length,
      sunk: { allies: [], axis: [] }, damaged: { allies: [], axis: [] }, retreat: { allies: [], axis: [] }, forced: { allies: [], axis: [] } };
    for(const b of here){
      const a = after[b.id];
      if(a.sunk){ r.sunk[b.side].push(b.name); continue; }
      if(a.damage > b.damage) r.damaged[b.side].push(`${b.name}(損害${a.damage}/${b.def})`);
      if(a.ret && a.forced) r.forced[b.side].push(b.name);
      else if(a.ret) r.retreat[b.side].push(b.name);
    }
    out[sea] = r;
  }
  return out;
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sgn = n => (n >= 0 ? '+' : '') + n;
const PORT_JA = { Germany: 'ヴィルヘルムスハーフェン', France: 'ブレスト', Neutral: '南米の中立港' };
function shipByName(name){ return G('SHIPS').find(s => s.name === name); }
// 艦隊の中で一番強い艦（旗艦あつかい）
function flagship(names){
  const ss = names.map(shipByName).filter(Boolean).filter(s => s.type !== 'CONVOY');
  ss.sort((a, b) => ((b.atk || 0) + (b.air || 0) + b.def) - ((a.atk || 0) + (a.air || 0) + a.def));
  return ss[0] ? ss[0].name : names[0];
}
function fleetText(names){
  if(names.length === 1) return names[0] + ' ';
  const f = flagship(names);
  if(names.length <= 2) return `${f}、${names.filter(n => n !== f)[0]} `;
  return `旗艦 ${f} 以下${names.length}隻`;
}
// 戦闘の結果を1段落で
function battleText(sea, c, opener){
  const s = [opener || pick(['砲火が交わされた。', '両艦隊が激突した。'])];
  if(c.sunk.allies.length) s.push(`敵 ${c.sunk.allies.join('、')} を撃沈。`);
  if(c.sunk.axis.length) s.push(`我が方は ${c.sunk.axis.join('、')} を失った。`);
  if(!c.sunk.allies.length && !c.sunk.axis.length) s.push('双方とも決定打はなかった。');
  if(c.damaged.axis.length) s.push(`${c.damaged.axis.map(x => x.replace(/\(.*\)/, '')).join('、')} 被弾。`);
  if(c.retreat.allies.length && !c.retreat.axis.length) s.push(pick(['敵は退いた。', '敵は戦場を捨てた。']));
  if(c.retreat.axis.length) s.push(pick(['我が艦隊は反転した。', '撤退の信号旗が掲げられた。']));
  return s.join('');
}
function buildReport(result, finalPoc){
  const L = [];
  L.push('ドイツ海軍　戦闘詳報');
  L.push(`作成 ${new Date().toLocaleString('ja-JP')}`);
  L.push('');
  for(const r of result){
    const ops = axisOps[r.turn] || {};
    const cb = combats[r.turn] || {};
    const used = new Set();
    let title = '静かな海';
    if(ops.assault) title = `${SEA_JA[ops.assault.target]}突入`;
    else if(ops.raid) title = '大西洋の狼たち';
    else if(ops.mode === 'lost') title = '再建の時';
    L.push(`━━ 第${r.turn}ターン　${title} ━━`);
    const P = [];
    // 殴り込み
    if(ops.assault){
      const t = ops.assault.target;
      let p = `${pick(['灰色の空の下、', '夜陰に紛れて、'])}${fleetText(ops.placed[t] || [])}が${SEA_JA[t]}へ突入した。我${ops.assault.atk}対敵${ops.assault.al}。`;
      if(cb[t]){
        used.add(t);
        p += battleText(t, cb[t], '');
        p += r.ctl[t] === 'axis' ? `${SEA_JA[t]}は我が手に帰した。` : `${SEA_JA[t]}の奪取はならなかった。`;
      }
      P.push(p);
    }
    if(ops.assaultSkipped){
      const a = ops.assaultSkipped;
      P.push(a.danger
        ? `${SEA_JA[a.target]}への突入は見送った（我${a.atk}対敵${a.al}）。戦況は厳しいが、まだ機は熟していない。`
        : `戦況は我に利あり。${SEA_JA[a.target]}への無理な突入は避けた（我${a.atk}対敵${a.al}）。`);
    }
    if(ops.mode === 'lost') P.push(pick(['先の突入の傷は深い。艦隊は港で修理に専念する。', '全艦待機。今は牙を研ぐ時である。']));
    const atlSent = ['NorthAtlantic', 'SouthAtlantic'].some(k => ops.placed && ops.placed[k] && ops.placed[k].length);
    if(ops.mode === 'won' && ops.raid && !atlSent) P.push('大西洋へ向かえる艦はなかった。');
    if(ops.mode === 'won' && ops.raid && atlSent) P.push(ops.northHeld ? '北の海を背に、艦隊は再び大西洋へ。' : '北の海は敵に奪われたが、艦隊は再び大西洋へ向かった。');
    // 大西洋
    for(const sea of ['NorthAtlantic', 'SouthAtlantic']){
      const ships = ops.placed && ops.placed[sea];
      if(!(ops.raid && ships && ships.length) || (ops.assault && ops.assault.target === sea)) continue;
      let p = `${SEA_JA[sea]}には ${fleetText(ships)}を放った。`;
      if(cb[sea]){ used.add(sea); p += battleText(sea, cb[sea], pick(['敵影発見。', '「右舷に敵影！」'])); }
      else if(r.ctl[sea] === 'axis') p += pick(['敵影なし。通商路は我が手に落ちた。', '敵の姿はなく、悠々と海を制した。']);
      P.push(p);
    }
    // 中立港からの出撃
    if(ops.neutralOut && ops.neutralOut.length){
      P.push(`中立港の ${ops.neutralOut.join('、')} は、居残りを許されず南大西洋へ出た。`);
    }
    // バルト海
    if(ops.baltic && ops.baltic.ships.length){
      const b = ops.baltic;
      if(b.ru.length){
        let p = `バルト海にソ連艦隊（${b.ru.join('、')}）が出現。${fleetText(b.ships)}が迎え撃つ（我${b.atk}対敵${b.ruAtk}）。`;
        if(cb.Baltic){ used.add('Baltic'); p += battleText('Baltic', cb.Baltic, ''); }
        P.push(p);
      } else {
        P.push(`バルト海は ${b.ships.join('、')} が哨戒。${pick(['ソ連艦隊は港を出ない。', '東の海は静かだった。'])}`);
      }
    }
    // イタリア
    if(ops.italy){
      if(ops.italy.sortie){
        let p = `イタリア艦隊${ops.italy.n}隻が出撃（我${ops.italy.atk}対敵${ops.italy.al}）。`;
        if(cb.Mediterranean){ used.add('Mediterranean'); p += battleText('Mediterranean', cb.Mediterranean, pick(['マルタ沖で激突。', 'シチリア沖に砲声が響いた。'])); }
        P.push(p);
      } else {
        P.push(`イタリア艦隊は港にとどまった（敵${ops.italy.al}対${ops.italy.atk}）。`);
      }
    }
    // Uボート
    const ubSeas = Object.keys(ops.uboats || {});
    if(ubSeas.length){
      let p = `Uボートは${ubSeas.map(k => `${SEA_JA[k]}${ops.uboats[k]}`).join('・')}隻が潜航。`;
      for(const sea of Object.keys(cb)){
        if(used.has(sea) || PORT_JA2[sea]) continue;
        const c = cb[sea];
        if(c.sunk.allies.length) p += `${SEA_JA[sea]}で ${c.sunk.allies.join('、')} を仕留めた。`;
        if(c.sunk.axis.length) p += `${SEA_JA[sea]}で${c.sunk.axis.length}隻が帰らなかった。`;
        used.add(sea);
      }
      P.push(p);
    }
    // 残り（港への航空攻撃など）
    for(const sea of Object.keys(cb)){
      if(used.has(sea)) continue;
      const c = cb[sea];
      if(PORT_JA2[sea]){
        let p = `${PORT_JA2[sea]}に${c.axisSurf || c.axisUb ? '敵機' : '我が爆撃機'}が来襲。`;
        if(c.sunk.axis.length) p += `${c.sunk.axis.join('、')} を失った。`;
        if(c.sunk.allies.length) p += `敵 ${c.sunk.allies.join('、')} を撃沈。`;
        if(!c.sunk.axis.length && !c.sunk.allies.length) p += '損害は軽微。';
        P.push(p);
        continue;
      }
      P.push(`${SEA_JA[sea]}：` + battleText(sea, c, ''));
    }
    if(ops.failed && ops.failed.length) P.push(`${ops.failed.join('、')} は出撃に間に合わなかった。`);
    const mine = Object.keys(r.ctl).filter(k => r.ctl[k] === 'axis').map(k => SEA_JA[k]);
    const g = -r.gain;
    P.push(`――支配：${mine.length ? mine.join('、') : 'なし'}。戦果${g > 0 ? `、我が方に${g}点` : g < 0 ? `、敵に${-g}点` : 'なし'}（このターンのPOC ${sgn(r.gain)}、累計 ${sgn(r.total)}）。`);
    P.forEach(p => L.push(p));
    L.push('');
  }
  const allSunk = side => G('SHIPS').filter(s => s.side === side && s.sunk && s.type !== 'UBOAT').map(s => s.name);
  L.push('━━ 総括 ━━');
  const verdict = finalPoc < 0 ? '大西洋の戦いは、我が方の勝利に終わった。' : finalPoc > 0 ? '我々は敗れた。海は英国のものとなった。' : '勝敗は決しなかった。';
  L.push(`${verdict}最終POC ${sgn(finalPoc)}。`);
  L.push(`沈めた敵艦${allSunk('allies').length}隻：${allSunk('allies').join('、') || 'なし'}`);
  L.push(`失った艦${allSunk('axis').length}隻：${allSunk('axis').join('、') || 'なし'}`);
  return L.join('\n');
}

// ===== 観戦ページ（watch、英語） =====
const SEA_EN = { NorthAtlantic:'North Atlantic', Barents:'Barents Sea', NorthSea:'North Sea', Baltic:'Baltic Sea', Mediterranean:'Mediterranean', SouthAtlantic:'South Atlantic' };
const LOC_EN = { ...SEA_EN, Germany:'Germany', France:'France', Italy:'Italy', Malta:'Malta', England:'Britain', USA:'USA', Leningrad:'Leningrad', Russia:'Russia', Neutral:'Neutral port' };
const WATCH_PORTS = ['England', 'Malta', 'USA', 'Russia', 'Leningrad', 'Germany', 'France', 'Italy', 'Neutral'];
const watchTurns = [];
// 1ターン分：海域ごとの両軍（戦闘直前の位置と出発地）、移動の失敗、戦闘の結果、支配
function watchTurnData(turn, start, before, cb, ctl, gain, total){
  // 海域・港ごとの両軍の艦と、戦闘の結果（撃沈 > 帰還 > 損害）
  const shipsAt = loc => {
    const here = Object.values(before).filter(b => b.loc === loc && !b.sunk && !b.removed);
    const c = cb[loc];
    const res = b => {
      if(!c) return { res: '', dmg: b.damage ? `${b.damage}/${b.def}` : '' };
      const sd = b.side;
      const hit = c.damaged[sd].find(x => x.startsWith(b.name + '('));
      const dmg = hit ? hit.slice(b.name.length + 3, -1) : (b.damage ? `${b.damage}/${b.def}` : '');
      if(c.sunk[sd].includes(b.name)) return { res: 'sunk', dmg: '' };
      if(c.forced[sd].includes(b.name) || c.retreat[sd].includes(b.name)) return { res: 'ret', dmg };
      return { res: hit ? 'dmg' : '', dmg };
    };
    const side = sd => ({
      ships: here.filter(b => b.side === sd).map(b => ({ name: b.name, type: b.type, from: LOC_EN[start[b.id].loc] || start[b.id].loc, failed: b.failed, ...res(b) })),
    });
    return { allies: side('allies'), axis: side('axis') };
  };
  const seas = {};
  for(const sea of Object.keys(SEA_EN)) seas[sea] = shipsAt(sea);
  // 港（出撃しなかった艦）。艦のいない港は載せない
  const ports = [];
  for(const port of WATCH_PORTS){
    const p = shipsAt(port);
    if(p.allies.ships.length || p.axis.ships.length) ports.push({ loc: port, name: LOC_EN[port], ...p });
  }
  const failed = Object.values(before).filter(b => b.failed && !b.sunk).map(b => ({
    side: b.side, name: b.name, at: LOC_EN[b.loc] || b.loc,
    why: b.country === 'US' && !b.usEntered ? 'US entry roll failed' : '2-area move failed',
  }));
  // 損害の表記「艦名(損害2/3)」を英語に
  const dmgEn = arr => arr.map(x => x.replace(/\(損害(.*)\)$/, ' (damage $1)'));
  const combat = Object.keys(cb).map(loc => ({ loc: LOC_EN[loc] || loc, port: !SEA_EN[loc], ...cb[loc],
    damaged: { allies: dmgEn(cb[loc].damaged.allies), axis: dmgEn(cb[loc].damaged.axis) } }));
  const lba = (lbaRec[turn] || []).map(x => ({ side: x.side, loc: x.area, name: LOC_EN[x.area] || x.area }));
  return { turn, seas, ports, failed, combat, ctl, gain, total, lba };
}
function buildWatchHtml(finalPoc){
  const opts = ['--ub-nolimit', '--bismarck7', '--us-ease'].filter(o => process.argv.includes(o));
  const data = { turns: watchTurns, seaName: SEA_EN, finalPoc, opts,
    sunk: { allies: G('SHIPS').filter(s => s.side === 'allies' && s.sunk && s.type !== 'UBOAT').map(s => s.name),
            axis: G('SHIPS').filter(s => s.side === 'axis' && s.sunk && s.type !== 'UBOAT').map(s => s.name),
            ubAxis: G('SHIPS').filter(s => s.side === 'axis' && s.sunk && s.type === 'UBOAT').length } };
  // 一覧のページ用の情報
  const meta = { finalPoc, opts };
  return `<!doctype html>
<!--META ${JSON.stringify(meta)}-->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>War at Sea Battle Watch</title>
<script data-goatcounter="https://shigerusuzuki.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
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
.side{ margin:4px 0; } .side b.allies{ color:var(--al); } .side b.axis{ color:var(--ax); }
ul{ margin:2px 0 0; padding-left:18px; } li{ margin:0; }
.from{ color:var(--mute); font-size:12px; } .empty{ color:var(--mute); }
.r-sunk{ color:var(--r-sunk); font-weight:bold; text-decoration:line-through; } .r-dmg{ color:var(--r-dmg); font-weight:bold; } .r-ret{ color:var(--r-ret); font-weight:bold; }
.lba{ font-size:12px; font-weight:bold; color:#fff; padding:1px 6px; border-radius:10px; margin-left:6px; } .lba.allies{ background:var(--al); } .lba.axis{ background:var(--ax); }
b.allies{ color:var(--al); } b.axis{ color:var(--ax); }
.legend{ font-size:12px; font-weight:normal; margin-left:10px; } .legend span{ margin-right:10px; }
table{ border-collapse:collapse; width:100%; } td,th{ border-bottom:1px solid var(--line); padding:4px 6px; text-align:left; vertical-align:top; }
.poc{ font-size:15px; margin-top:8px; }
</style></head><body><div class="wrap">
<h1>War at Sea: Battle Watch</h1>
<div class="sub" id="sub"></div>
<div class="nav" id="nav"></div>
<div id="view"></div>
</div>
<script>
const D = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const sgn = n => (n >= 0 ? '+' : '') + n;
const CTL = { allies:'Allies', axis:'Axis' };
const OPT = { '--ub-nolimit':'No U-boat limit', '--bismarck7':'Bismarck class Defense 7', '--us-ease':'Easier US entry' };
let cur = 0;
document.getElementById('sub').textContent = 'AI vs AI. Optional rules: ' + (D.opts.length ? D.opts.map(o => OPT[o] || o).join(', ') : 'none') + '. POC: + favors the Allies, - favors the Axis.';
// inPort: 港の欄（出発地の代わりに、移動の失敗を書く）
function side(sd, x, locName, inPort){
  if(!x.ships.length) return '';
  let h = '<div class="side"><b class="' + sd + '">' + CTL[sd] + '</b>';
  const note = s => inPort ? (s.failed ? ' <span class="from">move failed</span>' : '')
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
  if(cur === 'sum'){
    v.innerHTML = '<h2>Summary</h2><div class="card"><div class="poc">Final POC ' + sgn(D.finalPoc) + ' (' + (D.finalPoc < 0 ? 'Axis victory' : D.finalPoc > 0 ? 'Allied victory' : 'Draw') + ')</div>'
      + '<p>Allied ships sunk: ' + D.sunk.allies.length + ' — ' + (list(D.sunk.allies) || 'none') + '</p>'
      + '<p>Axis ships sunk: ' + D.sunk.axis.length + ' — ' + (list(D.sunk.axis) || 'none') + '. U-boats lost: ' + D.sunk.ubAxis + '</p>'
      + '<table><tr><th>Turn</th><th>Gained</th><th>Total</th></tr>' + D.turns.map(t => '<tr><td>T' + t.turn + '</td><td>' + sgn(t.gain) + '</td><td>' + sgn(t.total) + '</td></tr>').join('') + '</table></div>';
    return;
  }
  const t = D.turns[cur];
  // LBA（陸上機）の印。海域・港の欄の見出しに付ける
  const lbaOf = loc => (t.lba || []).filter(x => x.loc === loc).map(x => '<span class="lba ' + x.side + '">✈' + CTL[x.side] + ' LBA</span>').join('');
  let h = '<h2>Movement (positions before combat)<span class="legend"><span class="r-sunk">Sunk</span><span class="r-dmg">Damaged</span><span class="r-ret">Returned</span></span></h2><div class="grid">';
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
  // 支配とPOCは一番上に
  h = '<h2>Turn ' + t.turn + ': Control</h2><div class="card">' + Object.keys(D.seaName).map(k => D.seaName[k] + ': <b class="' + (t.ctl[k] || '') + '">' + (CTL[t.ctl[k]] || 'none') + '</b>').join(' &nbsp; ')
    + '<div>LBA: ' + (['allies', 'axis'].map(sd => { const x = (t.lba || []).filter(l => l.side === sd); return '<b class="' + sd + '">' + CTL[sd] + '</b> ' + (x.length ? x.map(l => esc(l.name)).join(', ') : 'not used'); }).join(' &nbsp; ')) + '</div>'
    + '<div class="poc">POC this turn ' + sgn(t.gain) + ' &nbsp; Total ' + sgn(t.total) + '</div></div>' + h;
  v.innerHTML = h;
}
render();
</script></body></html>`;
}

// ===== 一覧のページ（sim/index.html） =====
// 観戦ページ（英語）と提督レポート（日本語）を新しい順に並べる。書き出すたびに作り直す
function buildIndexHtml(){
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  const sgn = n => (n >= 0 ? '+' : '') + n;
  const stamp = f => { const m = f.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : f; };
  const files = dir => { try { return fs.readdirSync(path.join(__dirname, dir)).sort().reverse(); } catch(e){ return []; } };
  const OPT = { '--ub-nolimit':'No U-boat limit', '--bismarck7':'Bismarck class Def 7', '--us-ease':'Easier US entry' };
  const watchRows = files('watch').filter(f => f.endsWith('.html')).map(f => {
    let meta = null;
    try { const m = fs.readFileSync(path.join(__dirname, 'watch', f), 'utf8').match(/<!--META (.*?)-->/); if(m) meta = JSON.parse(m[1]); } catch(e){}
    const res = meta ? `Final POC ${sgn(meta.finalPoc)} (${meta.finalPoc < 0 ? 'Axis victory' : meta.finalPoc > 0 ? 'Allied victory' : 'Draw'})` : '';
    const opts = meta && meta.opts.length ? meta.opts.map(o => OPT[o] || o).join(', ') : 'none';
    return `<tr><td><a href="watch/${encodeURIComponent(f)}">${esc(stamp(f))}</a></td><td>${esc(res)}</td><td>${esc(opts)}</td></tr>`;
  });
  const reportRows = files('reports').filter(f => f.endsWith('.txt')).map(f => {
    let res = '';
    try { const m = fs.readFileSync(path.join(__dirname, 'reports', f), 'utf8').match(/最終POC ([+-]?\d+)/); if(m){ const p = +m[1]; res = `最終POC ${sgn(p)}（${p < 0 ? '枢軸の勝ち' : p > 0 ? '連合の勝ち' : '引き分け'}）`; } } catch(e){}
    return `<tr><td><a href="reports/${encodeURIComponent(f)}">${esc(stamp(f))}</a></td><td>${esc(res)}</td></tr>`;
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>War at Sea Reports</title>
<script data-goatcounter="https://shigerusuzuki.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
<style>
:root{ --bg:#f6f7f9; --card:#fff; --fg:#1d2330; --mute:#667085; --line:#d9dee7; --link:#1f5fbf; }
@media (prefers-color-scheme: dark){ :root{ --bg:#14171d; --card:#1d222b; --fg:#e6e9ef; --mute:#98a2b3; --line:#2f3642; --link:#6ea8ff; } }
*{ box-sizing:border-box; }
body{ margin:0; background:var(--bg); color:var(--fg); font:14px/1.6 -apple-system,"Helvetica Neue",Arial,"Hiragino Sans",sans-serif; }
.wrap{ max-width:900px; margin:0 auto; padding:16px; }
h1{ font-size:20px; margin:0 0 12px; } h2{ font-size:16px; margin:20px 0 8px; }
.card{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 12px; overflow-x:auto; }
table{ border-collapse:collapse; width:100%; } td,th{ border-bottom:1px solid var(--line); padding:6px; text-align:left; white-space:nowrap; }
a{ color:var(--link); } .empty{ color:var(--mute); }
</style></head><body><div class="wrap">
<h1>War at Sea: Reports</h1>
<h2>Battle Watch (AI vs AI)</h2>
<div class="card">${watchRows.length ? `<table><tr><th>Date</th><th>Result</th><th>Optional rules</th></tr>${watchRows.join('')}</table>` : '<div class="empty">No games yet.</div>'}</div>
<h2 lang="ja">ドイツ海軍 提督レポート</h2>
<div class="card" lang="ja">${reportRows.length ? `<table><tr><th>日時</th><th>結果</th></tr>${reportRows.join('')}</table>` : '<div class="empty">まだありません。</div>'}</div>
</div></body></html>`;
}
function writeIndex(){ fs.writeFileSync(path.join(__dirname, 'index.html'), buildIndexHtml()); }

let cumPoc = 0, lastTurnGain = 0;
// ゲームのPOCはターンごとに0へ戻すので、連合AIが見る累計は play.js の累計に置き換える
w.alliedCumPoc = () => cumPoc;
(async () => {
  // index: 対戦せずに一覧のページだけ作り直す
  if(process.argv.includes('index')){ writeIndex(); console.log('一覧: ' + path.join(__dirname, 'index.html')); process.exit(0); }
  const result = [];
  for(let turn = 1; turn <= 8; turn++){
    const turnStart = snapShips();
    // そのターンのPOCを上限で削らずに得るため、ターンの初めに0へ戻す（累計はここでルールどおりに計算）
    G('poc = 0; pocAtTurnStart = 0;');
    const pocStart = 0;
    for(let p = 2; p <= 9; p++){
      if(p === 3){
        // 枢軸移動（advancePhase は phase 3 で何もしないので、ここでドイツ軍AIを動かす）
        await w.advancePhase();
        myAxisMove();
        continue;
      }
      if(p === 6){
        combatBefore = snapShips();
        w.advancePhase();
        const ok = await waitCombatEnd();
        if(!ok){ console.log(`ターン${turn} 戦闘が終わりません（止まった箇所: ${w.document.getElementById('phaseLabel').textContent}）`); console.log(errors.slice(-10).join('\n')); process.exit(1); }
        w.closeCombatModal && w.closeCombatModal();
        combats[turn] = summarizeCombat(combatBefore, snapShips());
        continue;
      }
      await w.advancePhase();
    }
    const ctl = JSON.parse(JSON.stringify(G('seaControl')));
    w.endTurn();
    const pocEnd = G('poc');
    cumPoc = Math.max(-10, Math.min(10, cumPoc + (pocEnd - pocStart)));
    result.push({ turn, gain: pocEnd - pocStart, total: cumPoc, ctl });
    watchTurns.push(watchTurnData(turn, turnStart, combatBefore, combats[turn] || {}, ctl, pocEnd - pocStart, cumPoc));
    lastTurnGain = pocEnd - pocStart;
    sunkTotal[turn] = { allies: G('SHIPS').filter(s => s.side === 'allies' && s.sunk && s.type !== 'UBOAT').length, axis: G('SHIPS').filter(s => s.side === 'axis' && s.sunk && s.type !== 'UBOAT').length };
  }
  const lab = { NorthAtlantic:'北大西洋', Barents:'バレンツ', NorthSea:'北海', Baltic:'バルト', Mediterranean:'地中海', SouthAtlantic:'南大西洋' };
  for(const r of result){
    const c = Object.keys(r.ctl).map(k => `${lab[k]}:${r.ctl[k] === 'allies' ? '連' : r.ctl[k] === 'axis' ? '枢' : '-'}`).join(' ');
    console.log(`ターン${r.turn}: 獲得 ${r.gain >= 0 ? '+' : ''}${r.gain}  累計 ${r.total >= 0 ? '+' : ''}${r.total}  [${c}]`);
  }
  if(process.argv.includes('log')) axisLog.forEach(l => console.log(l));
  if(process.argv.includes('watch')){
    const dir = path.join(__dirname, 'watch');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), z = n => String(n).padStart(2, '0');
    const file = path.join(dir, `watch_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.html`);
    fs.writeFileSync(file, buildWatchHtml(cumPoc));
    console.log('観戦ページ: ' + file);
    writeIndex();
  }
  if(process.argv.includes('report')){
    const text = buildReport(result, cumPoc);
    const dir = path.join(__dirname, 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), z = n => String(n).padStart(2, '0');
    const file = path.join(dir, `report_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.txt`);
    fs.writeFileSync(file, text);
    console.log(text);
    console.log('\n保存: ' + file);
    writeIndex();
    process.exit(0);
  }
  const sunk = side => G('SHIPS').filter(s => s.side === side && s.sunk && s.type !== 'UBOAT').map(s => s.name);
  console.log('連合の撃沈:', sunk('allies').join(', ') || 'なし');
  console.log('枢軸の撃沈:', sunk('axis').join(', ') || 'なし');
  if(errors.length) console.log('エラー:\n' + errors.slice(0, 10).join('\n'));
  process.exit(0);
})().catch(e => { console.log('停止:', e.stack); if(errors.length) console.log(errors.slice(0,10).join('\n')); process.exit(1); });
