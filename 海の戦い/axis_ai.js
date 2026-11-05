// axis_ai.js — ドイツ軍（枢軸）AI の移動ルーチン（ユーザーの指示 2026-11-03）
// 人が連合を持つ時に枢軸を動かす。シミュレーター（sim/play.js）と同じ処理を使う
// ページの変数 SHIPS / SEAS / PORTS / PORT_SEAS / SEA_ADJ / seaControl / currentTurn / poc と
// 関数 battleEval / rollD6 / failMovePorts / placeAllShips を使う
var AXIS_AI = {
  state: { assaultTurn: null, target: null, won: null },
  log: [],
  ops: {},
  prevPoc: 0,
  lastGain: null, // シミュレーターは自分で渡す
  read() {
    const cum = typeof alliedCumPoc === 'function' ? alliedCumPoc() : poc;
    const gain = this.lastGain !== null ? this.lastGain : cum - this.prevPoc;
    this.prevPoc = cum;
    return { axisState: this.state, cumPoc: cum, lastTurnGain: gain };
  },
};

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
    const e = battleEval(live(ax), live(al));
    if(e.ours > e.theirs) wins++;
  }
  return wins / n;
}

// イタリアの構え: 対戦の開始時に1回だけくじ（慎重派60% / 積極派40%）。積極派は必ず出撃するターン（1〜4）も決める
const IT_STYLE = { style: Math.random() < 0.6 ? 'caut' : 'aggr', turn: 1 + Math.floor(Math.random() * 4) };
const AXIS_PLAN_MODE = 6; // 0=今までの処理 / 1=POC の予想 / 4=公式（planAxisV2） / 6=作戦（planAxisV6）。ユーザーの指示 2026-11-05
function axisAiMove(){
  const turn = currentTurn;
  const { axisState, cumPoc, lastTurnGain } = AXIS_AI.read();
  const pw = s => (s.atk || 0) + (s.air || 0);
  const sum = arr => arr.reduce((t, s) => t + pw(s), 0);
  const alive = s => !s.sunk && !s.removed;
  const alliedAt = sea => SHIPS.filter(s => alive(s) && s.side === 'allies' && s.location === sea && s.type !== 'UBOAT');
  const placed = {}; Object.keys(SEAS).forEach(k => placed[k] = []);
  const log = [];
  const ops = { northHeld: seaControl['NorthSea'] === 'axis' || seaControl['Barents'] === 'axis', italy: null, assault: null, assaultSkipped: null, raid: false, mode: null, failed: [] };
  // 到達: 1=確実 / 2=2エリア移動（ダイス<速力） / 0=不可
  const reach = (s, sea) => {
    if(s.location === 'France' && turn > 6) return 0; // 2.4 フランスは6ターンの後は使える港でない。戻った艦は出撃できない
    // 洋上補給の成功艦は海から出る。隣は確実、2エリア先はダイス（港からと同じ）
    const adj = (s.refuelTurn === turn - 1 && SEAS[s.location]) ? (SEA_ADJ[s.location] || []) : (PORT_SEAS[s.location] || []);
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
      const d = rollD6();
      if(d >= s.spd){
        // 失敗: 目的の海域に隣接する味方の港があればそこへ（例: 北海経由の南大西洋 → フランス）、なければ元の港
        s.failedMove = true;
        const alt = failMovePorts(s, sea, s.location)[0];
        if(alt){ s.location = alt; s.movedThisTurn = true; }
        else if(SEAS[s.location]) s.location = s.homePort; // 6.4 海には残れない（補給で海から出た艦）
        log.push(`${s.name}: ${sea}へ2エリア移動失敗${alt ? ' → ' + alt : ''}`); ops.failed.push(s.name); return false;
      }
    }
    s.location = sea;
    placed[sea].push(s);
    return true;
  };

  const r1 = x => Math.round(x * 10) / 10;
  let assaultNow = null; // このターンに突撃する海域
  // POC の予想で配置する（ユーザーの指示 2026-11-03）。連合の配置は見えているので、それに対する一番よい手を探す
  const AX_MODE = (typeof window !== 'undefined' && window.__axisPlanMode !== undefined) ? window.__axisPlanMode : AXIS_PLAN_MODE;
  let ubPlan = null;
  if(AX_MODE >= 1){
    const seaList = ['NorthSea', 'Barents', 'NorthAtlantic', 'SouthAtlantic', 'Mediterranean', 'Baltic'];
    const movers = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.type !== 'UBOAT' && !s.movedThisTurn && !(s.damage > 0) &&
      !(s.location === 'France' && turn > 6) && (PORTS[s.location] || (SEAS[s.location] && s.refuelTurn === turn - 1)));
    const neutral = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.location === 'Neutral' && !s.movedThisTurn);
    neutral.forEach(s => { move(s, 'SouthAtlantic'); });
    const ships = movers.filter(s => !s.movedThisTurn).map(s => {
      const o = seaList.filter(sea => {
        if(s.country === 'IT'){
          if(sea === 'Mediterranean') return reach(s, sea) > 0;
          return sea === 'SouthAtlantic' && s.type === 'CA' && reach(s, sea) > 0;
        }
        if(sea === 'Mediterranean') return false;
        const h = reach(s, sea);
        return h === 1 || (h === 2 && (s.spd - 1) / 6 >= 0.6);
      });
      return { s, opts: [...o, 'port'] };
    });
    const allied = {};
    seaList.forEach(sea => { allied[sea] = alliedAt(sea); });
    const fixed = {};
    seaList.forEach(sea => { fixed[sea] = placed[sea].slice(); });
    const nextReinf = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.country === 'DE' && s.type !== 'UBOAT' && s.location === 'T' + (turn + 1));
    // 両軍の増援（ターン表）: 今後2ターン分
    const reinf = {}, alliedReinf = {};
    for(const t of [turn + 1, turn + 2]){
      reinf[t] = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.country === 'DE' && s.type !== 'UBOAT' && s.location === 'T' + t);
      alliedReinf[t] = SHIPS.filter(s => alive(s) && s.side === 'allies' && s.country === 'UK' && s.type !== 'CONVOY' && s.location === 'T' + t);
    }
    const italyPending = SHIPS.filter(s => alive(s) && s.country === 'IT' && /^T\d/.test(s.location || '')).length;
    const r = (AX_MODE >= 6 ? PocPlanner.planAxisV6 : AX_MODE >= 4 ? PocPlanner.planAxisV2 : AX_MODE >= 3 ? PocPlanner.planAxisSimple : AX_MODE >= 2 ? PocPlanner.planAxisConcentrate : PocPlanner.planAxis)({ turn, seas: SEAS, seaList, ships, allied, fixed, nextReinf, reinf, alliedReinf, italyPending, ubs: SHIPS.filter(s => alive(s) && s.type === 'UBOAT' && s.side === 'axis' && s.location === 'Germany').length });
    ubPlan = r.ubPlan || null;
    if(r.notes) log.push(r.notes.join(' / '));
    ships.forEach(u => { const sea = r.plan[u.s.id]; if(sea && sea !== 'port') move(u.s, sea); });
    log.push(`POCの予想で配置（評価 ${r1(r.value)}）`);
    ops.mode = 'poc';
  } else {
  // --- イタリア ---
  const itShips = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.country === 'IT' && s.location === 'Italy' && !(s.damage > 0));
  const itEval = battleEval(itShips, alliedAt('Mediterranean'));
  const medAllied = r1(itEval.theirs), itAtk = r1(itEval.ours);
  // 出撃の判断はイタリアの構え（対戦の開始時のくじ）で決める
  //   慎重派: 連合と同等以上のときだけ出撃。第7・8ターンは必ず出撃
  //   積極派: くじで決めた第1〜4ターンのどこかで必ず出撃。ほかのターンは同等以上なら出撃
  const itGo = IT_STYLE.style === 'caut'
    ? (turn >= 7 || itAtk >= medAllied)
    : (turn === IT_STYLE.turn || itAtk >= medAllied);
  if(itShips.length && itGo){
    itShips.forEach(s => move(s, 'Mediterranean'));
    log.push(`イタリア出撃 ${itShips.length}隻(攻${itAtk}) vs 連合${medAllied}`);
    ops.italy = { sortie: true, n: itShips.length, atk: itAtk, al: medAllied };
  } else if(itShips.length){
    log.push(`イタリア待機 (攻${itAtk} vs 連合${medAllied})`);
    ops.italy = { sortie: false, n: itShips.length, atk: itAtk, al: medAllied };
  }

  // --- ドイツ水上艦 ---
  let de = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.country === 'DE' && s.type !== 'UBOAT' && !(s.damage > 0) &&
    !(s.location === 'France' && turn > 6) && // 2.4 閉じたフランスからは出撃できない
    (PORTS[s.location] || (SEAS[s.location] && s.refuelTurn === turn - 1)));
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

  // バルト海: 毎ターン最低1隻。ソ連艦がいれば確実に仕留めるため、勝つ確率が WIN_PROB 以上になるまで（弱い艦から）
  //   ソ連を取りこぼすと致命的。届かなければ届く艦を全部
  {
    const ru = alliedAt('Baltic');
    const balOk = de.filter(s => reach(s, 'Baltic') === 1).sort((a, b) => (pw(a) + a.def) - (pw(b) + b.def));
    const sent = [];
    const wins = () => sent.length > 0 && winProb(sent, ru) >= WIN_PROB;
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

  const ruOut = alliedAt('Baltic').length > 0; // ソ連艦がバルト海に出てきたターンは突撃しない（バルト海の支配が優先）
  // 最後の突撃: ターン7・8で最終的に逆転されそうなら、前の突撃の有無・戦力に関係なく、港の艦を損害艦も含めて全部突撃
  const finalDanger = turn >= 7 && (-cumPoc) - Math.max(0, lastTurnGain) * (8 - turn + 1) <= 0;
  if(finalDanger){
    const target = pickTarget();
    const pool = SHIPS.filter(s => alive(s) && s.side === 'axis' && s.country === 'DE' && s.type !== 'UBOAT' && !s.movedThisTurn &&
      (PORTS[s.location] || (SEAS[s.location] && s.refuelTurn === turn - 1)));
    const force = pool.filter(s => reach(s, target));
    const asEval = battleEval(force, alliedAt(target));
    const forceAtk = r1(asEval.ours), alAtk = r1(asEval.theirs);
    axisState.assaultTurn = turn; axisState.target = target; axisState.won = null;
    force.forEach(s => move(s, target));
    log.push(`最後の突撃: ${target} ${force.length}隻(攻${forceAtk}) vs 連合${alAtk}`);
    ops.assault = { target, atk: forceAtk, al: alAtk };
    assaultNow = target;
    raid(de.filter(s => !s.movedThisTurn));
  } else if(axisState.assaultTurn === null){
    const target = pickTarget();
    const force = de.filter(s => reach(s, target));
    const asEval = battleEval(force, alliedAt(target));
    const forceAtk = r1(asEval.ours), alAtk = r1(asEval.theirs);
    // 突撃するかどうか（ターン3〜6）: 得点の状況で確率を変えてランダムに決める
    //   最終的に逆転されそう = 前ターンに連合が取った点を残りのターン（このターンを含む）取られるとリードが消える
    //   ターン7・8で逆転されそうなときは上の「最後の突撃」。ソ連艦が出てきたターンは突撃しない
    const lead = -cumPoc;
    const danger = lead - Math.max(0, lastTurnGain) * (8 - turn + 1) <= 0;
    const favorable = forceAtk >= alAtk * WIN_RATIO;
    let p = 0;
    if(turn >= 3 && turn <= 6 && !ruOut){
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
      if(turn >= 3){ log.push(`殴り込み見送り: ${target} (攻${forceAtk} vs 連合${alAtk}, リード${lead}, 確率${p})`); ops.assaultSkipped = { target, atk: forceAtk, al: alAtk, lead, danger }; }
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
      const PORTS_ = PORTS;
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

  // ソ連艦が出てきたターン: 港に残るくらいなら、残った無傷艦は全部バルト海へ（最低限ではなく厚く）
  if(ruOut){
    const extra = de.filter(s => !s.movedThisTurn && reach(s, 'Baltic') === 1 && move(s, 'Baltic'));
    if(extra.length){
      ops.baltic.ships.push(...extra.map(x => x.name));
      ops.baltic.atk += sum(extra);
      log.push(`バルト海へ追加 ${extra.length}隻: ${extra.map(x => x.name).join(',')}`);
    }
  }

  } // POC の予想を使わない時の処理ここまで

  // --- Uボート ---
  const ubs = SHIPS.filter(s => alive(s) && s.type === 'UBOAT' && s.side === 'axis' && s.location === 'Germany');
  if(ubs.length){
    const aswDice = sea => alliedAt(sea).reduce((t, s) => t + ((s.type === 'CV' || s.type === 'CONVOY') ? 3 : 1), 0);
    const convoyAt = Object.keys(SEAS).find(k => SHIPS.some(s => alive(s) && s.type === 'CONVOY' && s.location === k));
    // 連合がいて、ドイツ・イタリアの水上艦がいない海域（ドイツが支配を取れず、連合のPOCになる海域）を安全な順に
    //   安全の見積もり = 対潜ダイス × くじの倍率（0.5〜1.5）。たまには地中海などダイスの多い海域にも行く
    const danger = {};
    Object.keys(SEAS).forEach(k => { danger[k] = aswDice(k) * (0.5 + Math.random()); });
    const thin = Object.keys(SEAS).filter(k => alliedAt(k).length && !placed[k].some(s => s.type !== 'UBOAT') && k !== convoyAt)
      .sort((a, b) => danger[a] - danger[b]);
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
    // 毎ターン: 船団の海域 → 連合の支配を打ち消せる海域（安全な順） → 余りは安全な海域へ
    if(ubPlan){ for(const sea in ubPlan) for(let i = 0; i < ubPlan[sea] && queue.length; i++) put(queue.shift(), sea); }
    else { if(convoyAt) putOver(convoyAt); for(const sea of thin) putOver(sea); }
    // 余りは安全な海域で遊ばせず、置いた海域に順番に分けて足す（置いた海域がなければ安全な海域へ）
    const used = Object.keys(SEAS).filter(k => alliedAt(k).length && placed[k].some(s => s.type === 'UBOAT'));
    for(let i = 0; queue.length && used.length; i++) put(queue.shift(), used[i % used.length]);
    toSafe();
  }

  const dist = Object.keys(placed).filter(k => placed[k].length).map(k => `${k}:${placed[k].length}`).join(' ');
  AXIS_AI.log.push(`T${turn} ${log.join(' / ')} | 配置 ${dist}`);
  ops.placed = {}; ops.uboats = {};
  Object.keys(placed).forEach(k => {
    const surf = placed[k].filter(x => x.type !== 'UBOAT');
    const ub = placed[k].filter(x => x.type === 'UBOAT').length;
    if(surf.length) ops.placed[k] = surf.map(x => x.name);
    if(ub) ops.uboats[k] = ub;
  });
  AXIS_AI.ops[turn] = ops;
  placeAllShips();
}


async function aiAxisMove(){ axisAiMove(); }
