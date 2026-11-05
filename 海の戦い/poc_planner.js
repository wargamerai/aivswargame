// poc_planner.js — POC の予想で配置を決める（連合・ドイツ共通。ユーザーの指示 2026-11-03）
// 連合が先に動き、枢軸はそれを見て動く（5.2 → 5.3）。
//   枢軸: 見えている連合の配置に対する一番よい手を探す
//   連合: 枢軸の一番よい手を想定して、それでも一番よくなる配置を探す
// 海域ごとの結果は、ルールどおりの戦闘を手早く試算して求める（同じ戦力の組み合わせは覚えておく）
var PocPlanner = (function () {
  const P = {
    trials: 60,        // 1つの組み合わせの試算回数
    material: 0.12,    // 艦の損得を POC に換算する係数（序盤の値。最後のターンに向けて 0 へ下がる）
    control: 0.25,     // 支配を取ることの次のターンへの価値（2エリア移動など）
    ubNeedShare: 1,    // Uボートで支配を消せる時の重み
    sweeps: 2,         // 山登りの回数
    tie: 0.15,         // この差までの案からはランダムに選ぶ（読まれないように）
    lba: 0.5,          // 陸上機（1か所のみ）が使われる割合
    explore: 0,        // データを取る時だけ使う: この割合の艦の行き先をばらつかせる
    materialAxis: null, // 枢軸の計算だけ艦の損失の重みを変える時に使う
    greedAxis: 1,       // 枢軸が海域を取ることをどれだけ重く見るか（1=POC どおり）
    minRatioAxis: 0,    // 枢軸はこの戦力比に届かない海域へは出さない（薄く出して削られるのを防ぐ）。0=制限なし
    lossLine: 0.1,      // 損失の線: 1ターンに全戦力のこの割合まで（対戦で決める）
    lossK: 1,           // 公式の k: 艦1隻を失う値段（POC。これに残りのターン数をかける）
    simTrials: 150,     // 新ルーチン: 1つの組み合わせをダイスで試す回数
    winMin: 0.5,        // 新ルーチン: この勝率に届かない海域へは艦隊を出さない
    winEnough: 0.8,     // 新ルーチン: この勝率に届いたら、余った艦は次の海域へ回す
    allyEvals: 400,     // 新ルーチン: 連合が試す配置の数
    concRatio: 1.3,     // 枢軸の集中: この戦力比まで集められる海域にだけ出す
    useTable: 1,        // 1=実戦の記録の勝率表（poc_table.js）を使う / 0=その場で試算する
    v2DeWeight: 2,      // 公式の修正: ドイツの攻撃力1の値打ち（命中の期待値ならイギリスの2倍）
    v2Atlantic: 0,      // 公式の修正: 大西洋の2海域に先に置く攻撃力（0=置かない）
    v2WinCap: 0.4,      // 公式の修正: ドイツ全力の勝率がこれ以下なら「足りる」。300局で枢軸勝率62%（目標6割）
  };
  if (typeof window !== 'undefined' && window.__pocP) Object.assign(P, window.__pocP);   // 実験用
  const cache = new Map();
  const sig = s => s._ps || (s._ps = [s.type, s.atk || 0, s.def || 0, s.air || 0, s.damage || 0, s.country === 'DE' ? 1 : 0].join(','));
  const keyOf = arr => arr.map(sig).sort().join(';');
  const d6 = () => 1 + Math.floor(Math.random() * 6);

  // 1つの海域の戦闘を1回試す。戻り値 0=どちらも支配なし 1=連合 2=枢軸
  function runBattle(alSrc, axSrc, sea, out) {
    const mk = s => ({ t: s.type, a: s.atk || 0, d: s.def || 0, air: s.air || 0, dmg: s.damage || 0, de: s.country === 'DE', x: false, sunk: false, v: (s.atk || 0) + (s.air || 0) + (s.def || 0) * 0.5 });
    const al = alSrc.map(mk), ax = axSrc.map(mk);
    const live = arr => { const r = []; for (const u of arr) if (!u.sunk && !u.x) r.push(u); return r; };
    const shoot = (dice, bonus, targets, pend) => {
      if (!targets.length) return;
      for (let i = 0; i < dice.length; i++) {
        const shots = dice[i].n;
        const normal = targets.filter(t => t.t !== 'CV' && t.t !== 'CONVOY');
        const pool = normal.length ? normal : targets;
        const t = pool[Math.floor(Math.random() * pool.length)];
        for (let k = 0; k < shots; k++) {
          const r = d6() + (dice[i].plus ? 1 : 0);
          if (r >= 6) pend.push([t, d6()]);
          else if (r === 5) pend.push([t, 0]);
        }
      }
    };
    const apply = pend => {
      for (const [t, v] of pend) {
        if (v > 0) {
          t.dmg += v;
          if (t.dmg > t.d) t.sunk = true;
          else if (t.dmg === t.d && t.a > 0) t.a = 1;
        } else t.x = true;
      }
    };
    // 航空攻撃（1回だけ、同時）
    const lbaAxis = SEAS_LBA(sea, 'axis') && al.length && Math.random() < P.lba;
    const lbaAl = SEAS_LBA(sea, 'allies') && ax.length && Math.random() < P.lba;
    {
      const pend = [];
      const axAir = live(ax).filter(u => u.air > 0).map(u => ({ n: u.air, plus: false }));
      if (lbaAxis) axAir.push({ n: 3, plus: false });
      const alAir = live(al).filter(u => u.air > 0).map(u => ({ n: u.air, plus: false }));
      if (lbaAl) alAir.push({ n: 3, plus: false });
      shoot(axAir, 0, live(al), pend);
      shoot(alAir, 0, live(ax), pend);
      apply(pend);
    }
    // 水上戦闘（最大4ラウンド。明らかに不利な側は撤退する）
    let retreated = 0;
    for (let round = 0; round < 4; round++) {
      const la = live(al), lx = live(ax);
      const gunsA = la.filter(u => u.t !== 'CV' && u.a > 0), gunsX = lx.filter(u => u.t !== 'CV' && u.a > 0);
      if (!la.length || !lx.length) break;
      if (!gunsA.length && !gunsX.length) break;
      const sa = gunsA.reduce((t, u) => t + u.a, 0), sx = gunsX.reduce((t, u) => t + u.a, 0);
      if (round > 0) {
        if (sa < sx * 0.6) { retreated = 1; break; }
        if (sx < sa * 0.6) { retreated = 2; break; }
      }
      const pend = [];
      shoot(gunsA.map(u => ({ n: u.a, plus: false })), 0, lx, pend);
      shoot(gunsX.map(u => ({ n: u.a, plus: u.de && u.dmg === 0 })), 0, la, pend);
      apply(pend);
    }
    let lossA = 0, lossX = 0;
    for (const u of al) lossA += u.sunk ? u.v : Math.min(1, u.dmg / (u.d + 1)) * u.v * 0.3;
    for (const u of ax) lossX += u.sunk ? u.v : Math.min(1, u.dmg / (u.d + 1)) * u.v * 0.3;
    out.lossA += lossA; out.lossX += lossX;
    const hasA = retreated !== 1 && live(al).length > 0, hasX = retreated !== 2 && live(ax).length > 0;
    if (hasA && !hasX) return 1;
    if (hasX && !hasA) return 2;
    return 0;
  }
  function SEAS_LBA(sea, side) {
    if (sea === 'Mediterranean') return true;
    return side === 'axis' && (sea === 'Barents' || sea === 'Baltic');
  }
  // 海域の見込み: { pA, pX, lossA, lossX }
  function outcome(sea, al, ax) {
    if (!al.length || !ax.length) {
      return { pA: al.length ? 1 : 0, pX: ax.length ? 1 : 0, lossA: 0, lossX: 0 };
    }
    if (P.useTable && typeof POC_TABLE !== 'undefined') {
      const pw = arr => arr.reduce((t, s) => t + (s.type === 'CV' ? 0 : (s.atk || 0)) + (s.air || 0), 0);
      const pa = pw(al), px = pw(ax);
      if (pa <= 0 && px <= 0) return { pA: 0, pX: 0, lossA: 0, lossX: 0 };
      const lr = Math.log(Math.max(px, 0.25) / Math.max(pa, 0.25));
      const tot = pa + px;
      const rows = POC_TABLE[(sea === 'Barents' || sea === 'Baltic' || sea === 'Mediterranean') ? 'lba' : 'open'][tot <= 8 ? 0 : tot <= 18 ? 1 : 2];
      let i = 0;
      while (i < rows.length - 1 && rows[i + 1][0] < lr) i++;
      const a = rows[i], b = rows[Math.min(i + 1, rows.length - 1)];
      const f = b[0] > a[0] ? Math.max(0, Math.min(1, (lr - a[0]) / (b[0] - a[0]))) : 0;
      const m = j => a[j] + (b[j] - a[j]) * f;
      return { pX: m(1), pA: m(2), lossA: m(3), lossX: m(4) };
    }
    const k = sea + '|' + keyOf(al) + '|' + keyOf(ax);
    let r = cache.get(k);
    if (r) return r;
    const out = { lossA: 0, lossX: 0 };
    let a = 0, x = 0;
    for (let i = 0; i < P.trials; i++) {
      const w = runBattle(al, ax, sea, out);
      if (w === 1) a++; else if (w === 2) x++;
    }
    r = { pA: a / P.trials, pX: x / P.trials, lossA: out.lossA / P.trials, lossX: out.lossX / P.trials };
    if (cache.size > 300000) cache.clear();
    cache.set(k, r);
    return r;
  }
  const convoyValue = sea => (sea === 'Barents' ? 3 : sea === 'NorthAtlantic' ? 1 : 0);
  // 海域の価値（連合から見た POC の見込み）。cfg: { turn, seas }
  function seaValue(sea, al, ax, cfg) {
    if (!al.length && !ax.length) return 0;
    if (cfg.minRatio && ax.length) {
      const pw = arr => arr.reduce((t, s) => t + (s.type === 'CV' ? 0 : (s.atk || 0)) + (s.air || 0), 0);
      const pa = pw(al), px = pw(ax);
      if (pa > 0 && px < pa * cfg.minRatio) return 20 + (pa - px);   // 枢軸から見て選ばない手（足りないほど悪い）
    }
    const o = outcome(sea, al, ax);
    const S = cfg.seas[sea];
    let v = o.pA * S.allies - o.pX * S.axis * (cfg.greed || 1);
    const left = Math.max(0, 8 - cfg.turn) / 7;
    v += (o.lossX - o.lossA) * (cfg.material !== undefined ? cfg.material : P.material) * left;
    v += (o.pA - o.pX) * P.control * left;
    const n = al.filter(s => s.type === 'CONVOY').length;
    if (n) v += n * convoyValue(sea) * (o.pA + (1 - o.pA - o.pX) * 0.5 - o.pX * 0.5);
    return v;
  }
  // Uボートで消せる支配の分（連合の支配を、少ない隻数で消せる順に）
  function uboatLoss(alBySea, axBySea, ubs, cfg) {
    if (!ubs) return 0;
    const needs = [];
    for (const sea in alBySea) {
      const a = alBySea[sea];
      if (!a.length || (axBySea[sea] || []).length) continue;
      const dice = a.reduce((t, s) => t + ((s.type === 'CV' || s.type === 'CONVOY') ? 3 : 1), 0);
      needs.push([Math.floor(dice / 3) + 1, cfg.seas[sea].allies]);
    }
    let left = ubs, loss = 0;
    needs.sort((p, q) => p[0] - q[0]).forEach(([n, v]) => { if (left >= n) { left -= n; loss += v * P.ubNeedShare; } });
    return loss;
  }

  // 枢軸の一番よい手。min を目指す。戻り値 { value, assign: Map(ship→sea|'port') }
  function axisBest(cfg, alBySea, axFixed, axisShips, seaList, sweeps) {
    const total = (bySea) => {
      let t = 0;
      for (const sea of seaList) t += seaValue(sea, alBySea[sea] || [], bySea[sea], cfg);
      return t;
    };
    const mkBase = () => { const m = {}; seaList.forEach(s => { m[s] = (axFixed[s] || []).slice(); }); return m; };
    let bestV = Infinity, bestA = null;
    // 出発点: 全艦を港 / 1つの海域に集中
    const starts = [null, ...seaList.filter(sea => axisShips.some(u => u.opts.includes(sea)))];
    for (const focus of starts) {
      const by = mkBase();
      const at = new Map();
      for (const u of axisShips) {
        const pos = focus && u.opts.includes(focus) ? focus : (u.opts.includes('port') ? 'port' : u.opts[0]);
        at.set(u, pos);
        if (pos !== 'port') by[pos].push(u.s);
      }
      for (let sw = 0; sw < sweeps; sw++) {
        let moved = false;
        for (const u of axisShips) {
          const cur = at.get(u);
          const without = cur === 'port' ? null : by[cur].filter(x => x !== u.s);
          const base = cur === 'port' ? 0 : seaValue(cur, alBySea[cur] || [], by[cur], cfg);
          const baseOut = cur === 'port' ? 0 : seaValue(cur, alBySea[cur] || [], without, cfg);
          let bv = 0, bo = cur;
          for (const o of u.opts) {
            if (o === cur) continue;
            let delta = cur === 'port' ? 0 : baseOut - base;
            if (o !== 'port') {
              delta += seaValue(o, alBySea[o] || [], [...by[o], u.s], cfg) - seaValue(o, alBySea[o] || [], by[o], cfg);
            }
            if (delta < bv - 1e-9) { bv = delta; bo = o; }
          }
          if (bo !== cur) {
            if (cur !== 'port') by[cur] = without;
            if (bo !== 'port') by[bo].push(u.s);
            at.set(u, bo);
            moved = true;
          }
        }
        if (!moved) break;
      }
      const v = total(by);
      if (v < bestV) { bestV = v; bestA = at; }
    }
    return { value: bestV, assign: bestA };
  }

  // ドイツ・イタリアの配置
  function planAxis(a) {
    const cfg = { turn: a.turn, seas: a.seas, greed: P.greedAxis, minRatio: P.minRatioAxis };
    if (P.materialAxis !== null) cfg.material = P.materialAxis;
    const r = axisBest(cfg, a.allied, a.fixed || {}, a.ships, a.seaList, 4);
    const out = {};
    r.assign.forEach((sea, u) => {
      out[u.s.id] = (P.explore && Math.random() < P.explore) ? u.opts[Math.floor(Math.random() * u.opts.length)] : sea;
    });
    return { plan: out, value: r.value };
  }

  // ===== 新ルーチン（ユーザーの指示 2026-11-03）=====
  // 実際にダイスを振って勝率を出す。連合の艦 al、枢軸の艦 ax、海域 sea
  const simCache = new Map();
  function pWin(sea, al, ax) {
    if (!ax.length) return 0;
    if (!al.length) return 1;
    const k = sea + '|' + keyOf(al) + '|' + keyOf(ax);
    let r = simCache.get(k);
    if (r !== undefined) return r;
    let w = 0;
    const out = { lossA: 0, lossX: 0 };
    for (let i = 0; i < P.simTrials; i++) if (runBattle(al, ax, sea, out) === 2) w++;
    r = w / P.simTrials;
    if (simCache.size > 200000) simCache.clear();
    simCache.set(k, r);
    return r;
  }
  // 1ラウンド（航空＋砲撃）を試す。戻り値: { w: ドイツの戦力が多く残る割合, sx: ドイツの沈没数, sa: イギリスの沈没数 }
  const roundCache = new Map();
  function roundStats(sea, alSrc, axSrc) {
    if (!axSrc.length) return { w: 0, sx: 0, sa: 0, lx: 0, la: 0 };
    if (!alSrc.length) return { w: 1, sx: 0, sa: 0, lx: 0, la: 0 };
    const key = sea + '|' + keyOf(alSrc) + '|' + keyOf(axSrc);
    const hit = roundCache.get(key);
    if (hit) return hit;
    const lba = sea === 'Barents' || sea === 'Baltic' || sea === 'Mediterranean';
    const mk = s => ({ type: s.type, country: s.country, def: s.def || 0, dmg: s.damage || 0, atk: s.atk || 0, atk0: s.atk || 0, air: s.air || 0, sunk: false, out: false });
    const live = a => a.filter(u => !u.sunk && !u.out);
    const pick = (en, pend, fired, side) => {
      const c0 = live(en).filter(u => u.dmg + (pend.dmg.get(u) || 0) <= u.def);
      const nor = c0.filter(u => u.type !== 'CV' && u.type !== 'CONVOY');
      const rest = c0.filter(u => u.type === 'CV' || u.type === 'CONVOY');
      const cands = nor.every(u => fired.has(u)) ? [...nor, ...rest] : nor;
      if (!cands.length) return null;
      const un = cands.filter(u => !fired.has(u));
      const b = un.length ? un : cands;
      return b.find(u => u.dmg === 0) || b[0];
    };
    const fire = (shots, en, pend, side) => {
      const fired = new Set();
      for (const sh of shots) {
        const t = pick(en, pend, fired, side);
        if (!t) return;
        fired.add(t);
        for (let i = 0; i < sh.n; i++) {
          const r = d6() + (sh.plus ? 1 : 0);
          if (r >= 6) pend.dmg.set(t, (pend.dmg.get(t) || 0) + d6());
          else if (r === 5) pend.out.add(t);
        }
      }
    };
    const apply = p => {
      p.dmg.forEach((v, u) => { u.dmg += v; if (u.dmg > u.def) u.sunk = true; else if (u.dmg === u.def && u.atk > 0) u.atk = 1; });
      p.out.forEach(u => { if (!u.sunk) u.out = true; });
    };
    const strength = (o, t) => {
      const sf = a => a.filter(u => u.type !== 'CV');
      const su = a => sf(a).reduce((x, u) => x + u.atk, 0);
      const ai = a => a.filter(u => u.type === 'CV').reduce((x, u) => x + u.air, 0);
      let O = su(o), T = su(t);
      const net = ai(o) - ai(t), oc = sf(o).length, tc = sf(t).length;
      if (net > 0 && tc) T -= (net / 6) * (T / tc);
      if (net < 0 && oc) O -= (-net / 6) * (O / oc);
      return O > T;
    };
    let w = 0, sx = 0, sa = 0, lx = 0, la = 0;
    const N = P.simTrials;
    for (let k = 0; k < N; k++) {
      const al = alSrc.map(mk), ax = axSrc.map(mk);
      let p = { dmg: new Map(), out: new Set() };
      const airX = live(ax).filter(u => u.air > 0).map(u => ({ n: u.air, plus: false }));
      if (lba) airX.push({ n: 3, plus: false });
      fire(airX, al, p, 'axis');
      fire(live(al).filter(u => u.air > 0).map(u => ({ n: u.air, plus: false })), ax, p, 'allies');
      apply(p);
      p = { dmg: new Map(), out: new Set() };
      fire(live(ax).filter(u => u.type !== 'CV' && u.atk > 0).map(u => ({ n: u.atk, plus: u.country === 'DE' && u.dmg === 0 })), al, p, 'axis');
      fire(live(al).filter(u => u.type !== 'CV' && u.atk > 0).map(u => ({ n: u.atk, plus: false })), ax, p, 'allies');
      apply(p);
      if (strength(live(ax), live(al))) w++;
      for (const u of ax) if (u.sunk) { sx++; lx += u.atk0 + u.air; }
      for (const u of al) if (u.sunk) { sa++; la += u.atk0 + u.air; }
    }
    const r = { w: w / N, sx: sx / N, sa: sa / N, lx: lx / N, la: la / N };
    if (roundCache.size > 200000) roundCache.clear();
    roundCache.set(key, r);
    return r;
  }
  // 公式: 海域の点 ＝ 勝率 × POC ＋（イギリスの沈没数 − ドイツの沈没数）× k × 残りのターン数
  function seaScore(sea, al, ax, turn, seas) {
    const r = roundStats(sea, al, ax);
    const cv = al.filter(s => s.type === 'CONVOY').length * convoyValue(sea);
    return { score: r.w * (seas[sea].axis + cv) + (r.sa - r.sx) * P.lossK * Math.max(0, 8 - turn), w: r.w, sx: r.sx, sa: r.sa };
  }
  const aswOf = arr => arr.reduce((t, s) => t + ((s.type === 'CV' || s.type === 'CONVOY') ? 3 : 1), 0);
  const uNeed = arr => Math.floor(aswOf(arr) / 3) + 1;     // ASW3につき1隻
  const pwS = s => (s.type === 'CV' ? 0 : (s.atk || 0)) + (s.air || 0);
  const convoysIn = arr => arr.filter(s => s.type === 'CONVOY').length;
  const swing = (sea, arr, seas) => seas[sea].axis + seas[sea].allies + convoysIn(arr) * convoyValue(sea) * 2;

  // ドイツ・イタリア: 見えている連合の配置に対して決める
  function planAxisSimple(a) {
    const plan = {};
    const notes = [];
    let free = a.ships.slice();
    const take = (u, sea) => { plan[u.s.id] = sea; free = free.filter(x => x !== u); };
    const al = sea => a.allied[sea] || [];
    const last = a.turn >= 8;
    const winMin = last ? 0.2 : P.winMin;
    const canGo = sea => free.filter(u => u.opts.includes(sea));
    // 弱い艦から足して、目標の勝率に届く組を返す
    const force = (sea, target, order) => {
      const list = [];
      for (const u of order) {
        list.push(u);
        if (pWin(sea, al(sea), list.map(x => x.s)) >= target) return list;
      }
      return list;
    };
    // 1) バルト海: ソ連がいなければ1隻。いれば確実に勝てるだけ
    {
      const c = canGo('Baltic').sort((p, q) => (pwS(p.s) + (p.s.def || 0)) - (pwS(q.s) + (q.s.def || 0)));
      if (c.length) {
        const f = al('Baltic').length ? force('Baltic', 0.9, c) : [c[0]];
        f.forEach(u => take(u, 'Baltic'));
      }
    }
    // 強い艦から順に足して、公式の点が一番高くなる組を探す
    const bestForce = (sea, order) => {
      let best = null;
      const list = [];
      for (const u of order) {
        list.push(u);
        const r = seaScore(sea, al(sea), list.map(x => x.s), a.turn, a.seas);
        if (!best || r.score > best.score + 0.1) best = { score: r.score, w: r.w, sx: r.sx, sa: r.sa, list: list.slice() };   // 同じくらいなら少ない隻数で足りる
      }
      return best;
    };
    // 2) 地中海: イタリアとマルタの戦力を比べる。公式の点がプラスの時だけ出る
    {
      const it = canGo('Mediterranean').sort((x, y) => pwS(y.s) - pwS(x.s));
      if (it.length) {
        if (!al('Mediterranean').length) { it.forEach(u => take(u, 'Mediterranean')); notes.push('地中海 無人'); }
        else {
          const f = bestForce('Mediterranean', it);
          if (f.score > 0) { f.list.forEach(u => take(u, 'Mediterranean')); notes.push(`地中海 ${f.list.length}隻 勝率${Math.round(f.w * 100)}% 点${f.score.toFixed(1)}`); }
          else notes.push(`地中海 待機（点${f.score.toFixed(1)}）`);
        }
      }
    }
    const main = ['NorthSea', 'Barents', 'NorthAtlantic', 'SouthAtlantic'];
    // 3) 連合のいない海域は、弱い艦を1隻でタダで取る
    for (const sea of main.slice().sort((p, q) => a.seas[q].axis - a.seas[p].axis)) {
      if (al(sea).length) continue;
      const c = canGo(sea).sort((p, q) => (pwS(p.s) + (p.s.def || 0)) - (pwS(q.s) + (q.s.def || 0)));
      if (c.length) take(c[0], sea);
    }
    // 4) 残りの海域: 今・次のターン・その次のターンの勝率を、両軍の増援を入れて比べる
    //    今が一番よい海域だけ攻める。先の方がよければ保留して港で待つ
    const contested = main.filter(sea => al(sea).length);
    const doneSea = new Set();
    const pwList = arr => arr.reduce((t, x) => t + pwS(x), 0);
    const horizon = (sea, ships) => {
      const res = [];
      let myAdd = [], theirAdd = [];
      for (let h = 1; h <= 2; h++) {
        if (a.turn + h > 8) break;
        myAdd = myAdd.concat((a.reinf && a.reinf[a.turn + h]) || []);
        theirAdd = theirAdd.concat((a.alliedReinf && a.alliedReinf[a.turn + h]) || []);
        res.push(roundStats(sea, [...al(sea), ...theirAdd], [...ships, ...myAdd]).w);
      }
      return res;
    };
    const minWin = last ? 0.2 : P.winMin;
    for (let round = 0; round < 3; round++) {
      const rows = contested.filter(sea => !doneSea.has(sea)).map(sea => {
        const c = canGo(sea).sort((x, y) => pwS(y.s) - pwS(x.s));
        if (!c.length) return { sea, none: true, alPw: pwList(al(sea)) };
        const f = bestForce(sea, c);
        const later = horizon(sea, c.map(u => u.s));
        const now = roundStats(sea, al(sea), c.map(u => u.s)).w;
        return Object.assign(f, { sea, now, later, hold: later.some(w => w > now + 0.1) });
      });
      notes.push(rows.map(r => r.none
        ? `${r.sea}:届く艦なし`
        : `${r.sea}:今${Math.round(r.now * 100)}%${r.later.length ? '→' + r.later.map(w => Math.round(w * 100) + '%').join('→') : ''} 点${r.score.toFixed(1)}${r.hold ? ' 保留' : ''}`).join(' / '));
      const cand = rows.filter(r => !r.none && r.score > 0 && r.w >= minWin && !r.hold).sort((x, y) => y.score - x.score);
      if (!cand.length) break;
      const b = cand[0];
      b.list.forEach(u => take(u, b.sea));
      doneSea.add(b.sea);
      notes.push(`→ ${b.sea}へ ${b.list.length}隻 勝率${Math.round(b.w * 100)}% 沈没 独${b.sx.toFixed(1)} 英${b.sa.toFixed(1)} 点${b.score.toFixed(1)}`);
    }
    Object.keys(plan).forEach(k => { if (k[0] === '_') delete plan[k]; });
    return { plan, value: 0, notes };
  }

  // 連合: ドイツが一番得な所へ集中してくる、Uボートが ASW3につき1隻で支配を消す、と見て配置を試す
  function planAlliesSimple(a) {
    const main = ['NorthSea', 'Barents', 'NorthAtlantic', 'SouthAtlantic'];
    const reach = {};
    a.seaList.forEach(sea => { reach[sea] = a.axisShips.filter(u => u.opts.includes(sea)).map(u => u.s); });
    const seaVal = (by) => {
      let v = 0;
      const held = [];
      for (const sea of main) {
        if (by[sea].length) { v += a.seas[sea].allies + convoysIn(by[sea]) * convoyValue(sea); held.push(sea); }
        else if (reach[sea].length) v -= a.seas[sea].axis;
      }
      // 地中海: イタリアとの比較
      {
        const m = by.Mediterranean || [];
        const it = reach.Mediterranean || [];
        if (m.length) {
          const r = seaScore('Mediterranean', m, it, a.turn, a.seas);
          const p = r.w;
          v += r.score > 0 ? p * -a.seas.Mediterranean.axis + (1 - p) * a.seas.Mediterranean.allies : a.seas.Mediterranean.allies;
        } else if (it.length) v -= a.seas.Mediterranean.axis;
      }
      // ドイツの集中: 一番得な海域を1つ取りに来る
      let worst = 0, hit = null;
      for (const sea of held) {
        const r = seaScore(sea, by[sea], reach[sea], a.turn, a.seas);
        if (r.score <= 0) continue;                 // ドイツは点がプラスの海域にしか来ない
        const p = r.w;
        const loss = p * swing(sea, by[sea], a.seas);
        if (loss > worst) { worst = loss; hit = sea; }
      }
      v -= worst;
      // Uボート: ASW3につき1隻で、消せる海域から消す
      let left = a.ubs || 0;
      held.filter(sea => sea !== hit).map(sea => [uNeed(by[sea]), sea]).sort((p, q) => p[0] - q[0]).forEach(([n, sea]) => {
        if (left >= n) { left -= n; v -= a.seas[sea].allies; }
      });
      return v;
    };
    const build = at => {
      const by = {};
      a.seaList.forEach(s => { by[s] = (a.fixed[s] || []).slice(); });
      a.ships.forEach((u, i) => { if (at[i] !== 'port') by[at[i]].push(u.s); });
      return by;
    };
    const n = a.ships.length;
    let best = null, bestV = -Infinity;
    const scoreAt = at => seaVal(build(at));
    // 出発点: 広く分けた案と、ランダムな案
    let cur = a.ships.map((u, i) => { const o = u.opts.filter(x => x !== 'port'); return o.length ? o[i % o.length] : 'port'; });
    let curV = scoreAt(cur);
    best = cur.slice(); bestV = curV;
    let evals = 1;
    while (evals < P.allyEvals && n) {
      // 1隻か2隻を別の海域へ動かして、良くなれば採る
      const nxt = cur.slice();
      const m = Math.random() < 0.6 ? 1 : 2;
      for (let k = 0; k < m; k++) {
        const i = Math.floor(Math.random() * n);
        const o = a.ships[i].opts;
        nxt[i] = o[Math.floor(Math.random() * o.length)];
      }
      const v = scoreAt(nxt);
      evals++;
      if (v >= curV) { cur = nxt; curV = v; }
      if (v > bestV) { best = nxt.slice(); bestV = v; }
    }
    const out = {};
    a.ships.forEach((u, i) => { out[u.s.id] = best[i]; });
    return { plan: out, value: bestV };
  }

  // ===== 最新のルーチン（ユーザーの指示 2026-11-03 のまとめ）=====
  // 海域の価値: 北海＝3＋北大西洋3＋南大西洋3、バレンツ＝2＋北大西洋3、船団がいれば北大西洋＋3・バレンツ＋6
  function seaWorth(sea, al) {
    const n = (al || []).filter(s => s.type === 'CONVOY').length;
    if (sea === 'NorthSea') return 9;
    if (sea === 'Barents') return 5 + (n ? 6 : 0);
    if (sea === 'NorthAtlantic') return 2 + (n ? 3 : 0);
    if (sea === 'SouthAtlantic') return 3;
    if (sea === 'Mediterranean') return 2;
    if (sea === 'Baltic') return 1;
    return 0;
  }
  // イタリアの性格: 対戦の開始時にくじで決める
  const ITALY = (() => {
    const r = Math.random();
    if (r < 0.3) return { style: 'aggr' };
    if (r < 0.7) return { style: 'wait' };
    return { style: 'time', turn: 2 + Math.floor(Math.random() * 4) };
  })();
  const attackPoints = (r, turn) => (r.la - r.lx * P.v2DeWeight) * Math.max(0, 8 - turn);   // ドイツから見た攻撃の損得

  function planAxisV2(a) {
    const plan = {}, notes = [];
    let free = a.ships.slice();
    const take = (u, sea) => { plan[u.s.id] = sea; free = free.filter(x => x !== u); };
    const al = sea => a.allied[sea] || [];
    const canGo = sea => free.filter(u => u.opts.includes(sea));
    const last = a.turn >= 8;
    const total = a.ships.reduce((t, u) => t + pwS(u.s), 0);
    let lossLeft = last ? Infinity : total * P.lossLine;
    // 1) バルト海
    {
      const c = canGo('Baltic').sort((p, q) => (pwS(p.s) + (p.s.def || 0)) - (pwS(q.s) + (q.s.def || 0)));
      if (c.length) {
        if (!al('Baltic').length) take(c[0], 'Baltic');
        else {
          const list = [];
          for (const u of c) { list.push(u); if (roundStats('Baltic', al('Baltic'), list.map(x => x.s)).w >= 0.9) break; }
          list.forEach(u => take(u, 'Baltic'));
        }
      }
    }
    // 2) イタリア: 性格で出るかどうかを決める
    {
      const it = canGo('Mediterranean');
      if (it.length) {
        const pending = (a.italyPending || 0) > 0;
        const go = !al('Mediterranean').length || last || ITALY.style === 'aggr' ||
          (ITALY.style === 'wait' && !pending) || (ITALY.style === 'time' && a.turn >= ITALY.turn);
        if (go) { it.forEach(u => take(u, 'Mediterranean')); notes.push(`イタリア出撃（${ITALY.style}）`); }
        else notes.push(`イタリア待機（${ITALY.style}）`);
      }
    }
    const main = ['NorthSea', 'Barents', 'NorthAtlantic', 'SouthAtlantic'];
    // 3) 連合のいない海域は、弱い艦を1隻
    for (const sea of main.slice().sort((p, q) => seaWorth(q, al(q)) - seaWorth(p, al(p)))) {
      if (al(sea).length) continue;
      const c = canGo(sea).sort((p, q) => (pwS(p.s) + (p.s.def || 0)) - (pwS(q.s) + (q.s.def || 0)));
      if (c.length) { take(c[0], sea); notes.push(`${sea} 無人→${c[0].s.name}`); }
    }
    // 4) 連合のいる海域: POC の見込み（勝率×価値）の大きい順に、損失の線の中で送る。足りれば余りは次へ
    const horizonBetter = (sea, ships, now) => {
      if (last) return false;
      let myAdd = [], theirAdd = [];
      const enough = attackPoints(roundStats(sea, al(sea), ships), a.turn) <= 0;
      for (let h = 1; h <= 2; h++) {
        if (a.turn + h > 8) break;
        myAdd = myAdd.concat((a.reinf && a.reinf[a.turn + h]) || []);
        if (!enough) theirAdd = theirAdd.concat((a.alliedReinf && a.alliedReinf[a.turn + h]) || []);
        if (roundStats(sea, [...al(sea), ...theirAdd], [...ships, ...myAdd]).w > now + 0.1) return true;
      }
      return false;
    };
    const done = new Set();
    const minWin = last ? 0.2 : P.winMin;
    for (let round = 0; round < 4; round++) {
      const rows = main.filter(sea => al(sea).length && !done.has(sea)).map(sea => {
        const c = canGo(sea).sort((x, y) => pwS(y.s) - pwS(x.s));
        if (!c.length) return null;
        const list = [];
        let r = null;
        for (const u of c) { list.push(u); r = roundStats(sea, al(sea), list.map(x => x.s)); if (r.w >= P.winEnough) break; }
        return { sea, list, r, poc: r.w * seaWorth(sea, al(sea)), hold: horizonBetter(sea, c.map(u => u.s), r.w) };
      }).filter(Boolean);
      const cand = rows.filter(x => x.r.w >= minWin && x.r.lx <= lossLeft && !x.hold).sort((x, y) => y.poc - x.poc);
      notes.push(rows.map(x => `${x.sea}:${Math.round(x.r.w * 100)}%/${x.list.length}隻/失${x.r.lx.toFixed(1)}${x.hold ? '/待' : ''}`).join(' '));
      if (!cand.length) break;
      const b = cand[0];
      b.list.forEach(u => take(u, b.sea));
      done.add(b.sea);
      lossLeft -= b.r.lx;
      notes.push(`→${b.sea}へ${b.list.length}隻`);
    }
    if (typeof window !== 'undefined' && window.__pocTrace) window.__pocTrace.push('T' + a.turn + ' 枢軸 ' + notes.join(' | '));
    return { plan, value: 0, notes };
  }

  function planAlliesV2(a) {
    const main = ['NorthSea', 'Barents', 'NorthAtlantic', 'SouthAtlantic'];
    const reach = {};
    a.seaList.forEach(sea => { reach[sea] = a.axisShips.filter(u => u.opts.includes(sea)).map(u => u.s); });
    const place = {};
    a.seaList.forEach(s => { place[s] = (a.fixed[s] || []).slice(); });
    const plan = {};
    let free = a.ships.slice().sort((x, y) => pwS(y.s) - pwS(x.s));
    const put = (u, sea) => { plan[u.s.id] = sea; place[sea].push(u.s); free = free.filter(x => x !== u); };
    // ドイツが全力で来ても損になるか
    const enough = sea => {
      if (!reach[sea].length) return true;
      if (!place[sea].length) return false;
      const r = roundStats(sea, place[sea], reach[sea]);
      if (P.v2WinCap > 0 && r.w <= P.v2WinCap) return true;
      return attackPoints(r, a.turn) <= 0;
    };
    // 0) 大西洋: 二手に分かれたドイツを止めるだけの攻撃力を、先に置く（空けると1隻で POC 3 を取られる）
    if (P.v2Atlantic > 0) {
      for (const sea of ['NorthAtlantic', 'SouthAtlantic']) {
        if (!reach[sea].length) continue;
        const atk = () => place[sea].reduce((t, s) => t + pwS(s), 0);
        for (const u of free.slice().reverse()) {
          if (atk() >= P.v2Atlantic) break;
          if (u.opts.includes(sea)) put(u, sea);
        }
      }
    }
    // 1) 価値の高い海域から、足りるまで置く
    const order = main.slice().sort((p, q) => seaWorth(q, place[q]) - seaWorth(p, place[p]));
    for (const sea of order) {
      if (!reach[sea].length && place[sea].length) continue;
      for (const u of free.slice()) {
        if (enough(sea) && place[sea].length) break;
        if (u.opts.includes(sea)) put(u, sea);
      }
    }
    // 2) マルタ: イタリアとの差を見て、余裕があれば
    if (place.Mediterranean && reach.Mediterranean && reach.Mediterranean.length) {
      for (const u of free.slice()) {
        if (attackPoints(roundStats('Mediterranean', place.Mediterranean, reach.Mediterranean), a.turn) <= 0) break;
        if (u.opts.includes('Mediterranean') && free.length > 0) put(u, 'Mediterranean');
      }
    }
    // 3) 余剰: 誰もいない海域へ弱い艦から1隻ずつ、残りは価値の高い海域へ
    for (const sea of order.slice().reverse()) {
      if (place[sea].length) continue;
      const c = free.filter(u => u.opts.includes(sea)).sort((x, y) => pwS(x.s) - pwS(y.s));
      if (c.length) put(c[0], sea);
    }
    for (const u of free.slice()) {
      const sea = order.find(s => u.opts.includes(s));
      if (sea) put(u, sea);
    }
    if (typeof window !== 'undefined' && window.__pocTrace) window.__pocTrace.push('T' + a.turn + ' 連合 ' + main.concat(['Mediterranean']).map(sea => `${sea}:${(place[sea] || []).length}隻/攻${(place[sea] || []).reduce((t, s) => t + pwS(s), 0)}`).join(' ') + ' 余' + free.length);
    return { plan, value: 0 };
  }

  // 連合: マスター30。点が一番高い配分を選ぶ（ユーザーの指示 2026-11-05）
  //   点 = 艦を置いた海域の「値 ×（1 − ドイツの勝率）」の合計
  //   値は seaWorth、ドイツの勝率は届く艦の攻撃力 ÷ 置いた艦の攻撃力 を 8000 戦の表（win6）で引く
  function planAlliesV4(a) {
    const seas = ['NorthSea', 'Barents', 'SouthAtlantic', 'NorthAtlantic'];
    // 15.5 1ターン目は「前のターン」がないので、イタリアの重巡は地中海を出られない
    const axis = a.axisShips.map(u => ({ s: u.s, opts: u.s.country === 'IT' ? u.opts.filter(o => a.turn > 1 && o === 'SouthAtlantic') : u.opts }));
    const power = arr => arr.reduce((t, s) => t + pwS(s), 0);
    const reach = {};
    seas.forEach(sea => { reach[sea] = power(axis.filter(u => u.opts.includes(sea)).map(u => u.s)); });
    const by = {};
    seas.forEach(sea => { by[sea] = (a.fixed[sea] || []).slice(); });
    const winOf = sea => (!reach[sea] ? 0 : win6(sea, reach[sea] / Math.max(1, power(by[sea]))));
    const scoreOf = sea => (by[sea].length ? seaWorth(sea, by[sea]) * (1 - winOf(sea)) : 0);
    const total = () => seas.reduce((t, sea) => t + scoreOf(sea), 0);
    const plan = {};
    const units = a.ships.filter(u => seas.some(sea => u.opts.includes(sea))).sort((x, y) => pwS(y.s) - pwS(x.s));
    // 攻撃力の分け方を全部計算して、点が一番高い分け方を選ぶ
    const T = power(units.map(u => u.s));
    const base = {}, table = {};
    seas.forEach(sea => {
      base[sea] = power(by[sea]);
      const fixedShips = by[sea], w = seaWorth(sea, fixedShips);
      table[sea] = [];
      for (let x = 0; x <= T; x++) {
        const pw = base[sea] + x;
        if (!x && !fixedShips.length) { table[sea][x] = 0; continue; }
        table[sea][x] = w * (1 - (!reach[sea] ? 0 : win6(sea, reach[sea] / Math.max(1, pw))));
      }
    });
    let want = null, bestV = -Infinity;
    for (let n = T; n >= 0; n--) for (let b = T - n; b >= 0; b--) for (let s = T - n - b; s >= 0; s--) {
      const na = T - n - b - s;
      const v = table.NorthSea[n] + table.Barents[b] + table.SouthAtlantic[s] + table.NorthAtlantic[na];
      if (v > bestV + 1e-9) { bestV = v; want = { NorthSea: n, Barents: b, SouthAtlantic: s, NorthAtlantic: na }; }
    }
    // 強い艦から、足りない量が一番多い海域へ置く
    const left = Object.assign({}, want);
    for (const u of units) {
      const can = seas.filter(sea => u.opts.includes(sea));
      const withWant = can.filter(sea => want[sea] > 0); // 式が0とした海域には置かない
      const o = (withWant.length ? withWant : can).sort((x, y) => left[y] - left[x]);
      const sea = o[0];
      by[sea].push(u.s); plan[u.s.id] = sea; left[sea] -= pwS(u.s);
    }
    // 主要な海域に行けない艦（マルタの艦）は地中海へ
    a.ships.forEach(u => { if (!plan[u.s.id] && u.opts.includes('Mediterranean') && !seas.some(s => u.opts.includes(s))) plan[u.s.id] = 'Mediterranean'; });
    if (typeof window !== 'undefined' && window.__pocTrace) window.__pocTrace.push('T' + a.turn + ' 連合 点' + total().toFixed(1) + ' ' + seas.map(sea => `${sea}:${by[sea].length}隻/攻${power(by[sea])}${by[sea].length ? '(' + Math.round(winOf(sea) * 100) + '%)' : ''}`).join(' '));
    return { plan, value: total() };
  }

  // ドイツの作戦（ユーザーの指示 2026-11-05）
  const IT6 = { out: false };
  const IT6_P = { 1: 0.1, 2: 0.1, 3: 0.1, 4: 0.6, 5: 0.6, 6: 0.1, 7: 0.1, 8: 1 };
  const WIN6 = { NorthSea: [[0.59, 0.18], [0.74, 0.48], [0.89, 0.76], [1.0, 0.87], [1.25, 0.95]], other: [[0.59, 0.21], [0.74, 0.60], [0.89, 0.80], [1.0, 0.90], [1.25, 0.98]] };
  function win6(sea, r) {
    const t = WIN6[sea] || WIN6.other;
    if (r <= t[0][0]) return t[0][1] * r / t[0][0];
    for (let i = 1; i < t.length; i++) if (r <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (r - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
    return t[t.length - 1][1];
  }
  function planAxisV6(a) {
    const seas = a.seaList, al = sea => a.allied[sea] || [];
    const fx0 = {}; seas.forEach(sea => { fx0[sea] = ((a.fixed && a.fixed[sea]) || []).slice(); });
    const fx = sea => fx0[sea];
    const strength = u => pwS(u.s) + (u.s.def || 0);
    const sumP = arr => arr.reduce((t, s) => t + pwS(s), 0);
    let units = a.ships.map(u => ({ s: u.s, opts: u.opts.filter(o => o !== 'port' && !(u.s.country === 'IT' && a.turn === 1 && o === 'SouthAtlantic')) }));
    const pre = {};
    const notes = [];
    const put = (u, sea) => { pre[u.s.id] = sea; fx0[sea].push(u.s); units = units.filter(x => x !== u); };
    // イタリア: ターンごとのくじ。一度出たら以後も出る
    if (!IT6.out && Math.random() < IT6_P[a.turn]) { IT6.out = true; notes.push('イタリア出撃開始'); }
    if (IT6.out) {
      const it = units.filter(u => u.s.country === 'IT' && u.opts.includes('Mediterranean'));
      const ca = !al('SouthAtlantic').length && !fx('SouthAtlantic').length ? it.find(u => u.s.type === 'CA' && u.opts.includes('SouthAtlantic')) : null;
      if (ca && it.length > 1) { put(ca, 'SouthAtlantic'); notes.push('重巡→南大西洋'); }
      units.filter(u => u.s.country === 'IT' && u.opts.includes('Mediterranean')).forEach(u => put(u, 'Mediterranean'));
    }
    const de = () => units.filter(u => u.s.country === 'DE');
    const main = ['NorthSea', 'Barents', 'NorthAtlantic', 'SouthAtlantic'];
    const worth = sea => seaWorth(sea, al(sea));
    const assault = a.turn === 4 || a.turn === 5;
    let target = null;
    if (assault) {
      // 4〜5ターン目の突撃先: 北海とバレンツのうち、一番勝てる海域
      const winAt = sea => win6(sea, sumP(de().filter(u => u.opts.includes(sea)).map(u => u.s).concat(fx(sea))) / Math.max(1, sumP(al(sea))));
      const c = ['NorthSea', 'Barents'].filter(sea => al(sea).length && de().some(u => u.opts.includes(sea))).sort((p, q) => winAt(q) - winAt(p));
      target = c[0] || null;
    }
    // ソ連
    const ru = al('Baltic');
    const big = () => de().filter(u => u.opts.includes('Baltic') && u.s.type !== 'CV' && (u.s.atk || 0) >= 2);
    let ubs = a.ubs || 0;
    const ubForced = {};
    if (ru.length) {
      if (assault && target) {
        const need = ru.length === 1 ? 6 : 10;
        const b = big().sort((x, y) => (x.s.atk || 0) - (y.s.atk || 0));
        const min = [];
        for (const u of b) { if (sumP(min.map(x => x.s)) >= need && min.length >= 2) break; min.push(u); }
        const all = de().filter(u => u.opts.includes(target)).map(u => u.s);
        const rest = all.filter(s => !min.some(u => u.s === s));
        const rA = sumP(all) / Math.max(1, sumP(al(target))), rB = sumP(rest) / Math.max(1, sumP(al(target)));
        const vA = ubs >= uNeed(ru) ? win6(target, rA) * worth(target) : -1;
        const vB = sumP(min.map(u => u.s)) >= need ? win6(target, rB) * worth(target) + 1 : -1;
        if (vB > vA) { min.forEach(u => put(u, 'Baltic')); notes.push(`ソ連${ru.length}:艦で潰す(主力比${rB.toFixed(2)})`); }
        else if (vA >= 0) { const n = uNeed(ru); ubForced.Baltic = n; ubs -= n; notes.push(`ソ連${ru.length}:Uで消す(主力比${rA.toFixed(2)})`); }
      } else {
        big().forEach(u => put(u, 'Baltic'));
        notes.push(`ソ連${ru.length}:大艦で潰す攻${sumP(fx('Baltic'))}`);
      }
    }
    // 比 0.75 以上の海域（突撃のターン以外）
    const ratioOf = sea => sumP(de().filter(u => u.opts.includes(sea)).map(u => u.s).concat(fx(sea))) / Math.max(1, sumP(al(sea)));
    const go = assault ? (target ? [target] : []) : main.filter(sea => al(sea).length && de().some(u => u.opts.includes(sea)) && ratioOf(sea) >= 1).sort((p, q) => worth(q) - worth(p));
    const noUb = new Set(go);
    // ランキング: 確実に取れる海域と Uボートで消す海域
    const combos = [];
    for (let m = 0; m < (1 << seas.length); m++) {
      const taken = seas.filter((_, i) => m & (1 << i));
      let ub = 0, ok = true, d = 0, uk = 0;
      const ubPlan = {}, needShip = [];
      for (const sea of taken) {
        if (al(sea).length) {
          if (fx(sea).length || noUb.has(sea) || ubForced[sea]) { ok = false; break; }
          const n = uNeed(al(sea));
          ub += n; ubPlan[sea] = n;
        } else {
          d += a.seas[sea].axis;
          if (!fx(sea).length) needShip.push(sea);
        }
      }
      if (!ok || ub > ubs) continue;
      for (const sea of seas) if (al(sea).length && !taken.includes(sea) && !ubForced[sea]) uk += a.seas[sea].allies;
      let free = units.slice().sort((x, y) => strength(x) - strength(y));
      const assign = {};
      needShip.sort((p, q) => free.filter(u => u.opts.includes(p)).length - free.filter(u => u.opts.includes(q)).length);
      for (const sea of needShip) {
        const c = free.find(u => u.opts.includes(sea));
        if (!c) { ok = false; break; }
        assign[c.s.id] = sea; free = free.filter(x => x !== c);
      }
      if (!ok) continue;
      combos.push({ taken, ub, ubPlan, assign, d, uk, v: d - uk, ships: needShip.length, free });
    }
    combos.sort((x, y) => y.v - x.v || x.ub - y.ub || x.ships - y.ships);
    const pick = combos[0];
    const plan = Object.assign({}, pre, pick.assign);
    let free = pick.free.slice();
    const atk = [];
    for (const sea of go) {
      const list = free.filter(u => u.s.country === 'DE' && u.opts.includes(sea));
      if (!list.length) continue;
      const r = (sumP(list.map(u => u.s)) + sumP(fx(sea))) / Math.max(1, sumP(al(sea)));
      if (!assault && r < 1) continue;
      list.forEach(u => { plan[u.s.id] = sea; });
      free = free.filter(u => !list.includes(u));
      atk.push(`${sea}:${list.length}隻/比${r.toFixed(2)}/価${worth(sea)}`);
    }
    notes.unshift(`V6 独${pick.d} 英${pick.uk} 確実[${Object.values(pick.assign).join(',')}] U${pick.ub + (ubForced.Baltic || 0)}/${a.ubs || 0}[${Object.keys(pick.ubPlan).concat(Object.keys(ubForced)).join(',')}] 攻[${atk.join(',')}] 残${free.length}`);
    return { plan, value: 0, notes: [notes.join(' ')], ubPlan: Object.assign({}, pick.ubPlan, ubForced) };
  }

  // ドイツ・イタリアの集中配置: 分けない。勝てる戦力比まで集められる海域へ、価値の高い順に送る
  function planAxisConcentrate(a) {
    const pwS = s => (s.type === 'CV' ? 0 : (s.atk || 0)) + (s.air || 0);
    const pw = arr => arr.reduce((t, s) => t + pwS(s), 0);
    const plan = {};
    const free = a.ships.slice();
    const take = (u, sea) => { plan[u.s.id] = sea; free.splice(free.indexOf(u), 1); };
    const value = sea => {
      const cv = (a.allied[sea] || []).filter(s => s.type === 'CONVOY').length;
      return a.seas[sea].axis + a.seas[sea].allies + cv * convoyValue(sea) * 2;
    };
    const fixedPw = sea => pw((a.fixed && a.fixed[sea]) || []);
    // 1) 連合のいない海域: 一番弱い艦を1隻（戦わずに取れる）
    for (const sea of a.seaList.slice().sort((p, q) => value(q) - value(p))) {
      if ((a.allied[sea] || []).length || ((a.fixed && a.fixed[sea]) || []).length) continue;
      const c = free.filter(u => u.opts.includes(sea)).sort((p, q) => (pwS(p.s) + (p.s.def || 0)) - (pwS(q.s) + (q.s.def || 0)));
      if (c.length) take(c[0], sea);
    }
    // 2) 連合のいる海域: 集められる所のうち、価値の高い所から。足りるだけ送り、余りは次へ
    const R = P.concRatio;
    const done = new Set();
    for (;;) {
      const cand = a.seaList.filter(sea => !done.has(sea) && pw(a.allied[sea] || []) > 0).map(sea => {
        const need = pw(a.allied[sea]) * R - fixedPw(sea);
        const can = free.filter(u => u.opts.includes(sea));
        return { sea, need, can, have: pw(can.map(u => u.s)) };
      }).filter(c => c.have >= c.need && c.can.length);
      if (!cand.length) break;
      cand.sort((p, q) => (value(q.sea) / Math.max(1, q.need)) - (value(p.sea) / Math.max(1, p.need)));
      const c = cand[0];
      // ほかの海域へ行けない艦から使い、強い艦で早く届かせる
      const order = c.can.slice().sort((p, q) => (p.opts.length - q.opts.length) || (pwS(q.s) - pwS(p.s)));
      let got = 0;
      for (const u of order) {
        if (got >= c.need) break;
        take(u, c.sea);
        got += pwS(u.s);
      }
      done.add(c.sea);
    }
    return { plan, value: 0 };
  }

  // 連合の配置: 枢軸の一番よい手を想定した値が最大になるように、1隻ずつ動かして探す
  function planAllies(a) {
    const cfg = { turn: a.turn, seas: a.seas };
    const seaList = a.seaList;
    const evalPlan = (at) => {
      const by = {};
      seaList.forEach(s => { by[s] = (a.fixed[s] || []).slice(); });
      a.ships.forEach((u, i) => { if (at[i] !== 'port') by[at[i]].push(u.s); });
      const r = axisBest(cfg, by, a.axisFixed || {}, a.axisShips, seaList, 2);
      // Uボート: 枢軸の水上艦が来なかった海域の連合の支配を消しにくる
      const axBy = {};
      seaList.forEach(s => { axBy[s] = (a.axisFixed && a.axisFixed[s] || []).slice(); });
      r.assign.forEach((sea, u) => { if (sea !== 'port') axBy[sea].push(u.s); });
      return r.value - uboatLoss(by, axBy, a.ubs, cfg);
    };
    const results = [];
    const climb = (start) => {
      const at = start.slice();
      let cur = evalPlan(at);
      for (let sw = 0; sw < P.sweeps; sw++) {
        let moved = false;
        const order = a.ships.map((_, i) => i).sort(() => Math.random() - 0.5);
        for (const i of order) {
          let bo = at[i], bv = cur;
          const was = at[i];
          for (const o of a.ships[i].opts) {
            if (o === was) continue;
            at[i] = o;
            const v = evalPlan(at);
            if (v > bv + 1e-9) { bv = v; bo = o; }
          }
          at[i] = bo;
          if (bo !== was) { cur = bv; moved = true; }
        }
        if (!moved) break;
      }
      results.push({ at, v: cur });
    };
    // 出発点: POC の高い海域に広く / 北に集中
    const firstOf = (u, list) => { for (const s of list) if (u.opts.includes(s)) return s; return u.opts[0]; };
    climb(a.ships.map((u, i) => {
      const list = ['NorthSea', 'NorthAtlantic', 'Barents', 'SouthAtlantic', 'Mediterranean'];
      return firstOf(u, list.slice(i % list.length).concat(list.slice(0, i % list.length)));
    }));
    climb(a.ships.map(u => firstOf(u, ['NorthSea', 'Barents', 'NorthAtlantic', 'SouthAtlantic', 'Mediterranean'])));
    results.sort((p, q) => q.v - p.v);
    const near = results.filter(r => r.v >= results[0].v - P.tie);
    const pick = near[Math.floor(Math.random() * near.length)];
    const out = {};
    a.ships.forEach((u, i) => {
      out[u.s.id] = (P.explore && Math.random() < P.explore) ? u.opts[Math.floor(Math.random() * u.opts.length)] : pick.at[i];
    });
    return { plan: out, value: pick.v };
  }

  return { P, cache, outcome, seaValue, planAxisV6, planAlliesV4, planAxis, planAxisConcentrate, planAxisSimple, planAllies, planAlliesSimple, planAxisV2, planAlliesV2, seaWorth, ITALY, axisBest, pWin, roundStats, seaScore };
})();
