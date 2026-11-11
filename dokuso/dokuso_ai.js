// 独ソ電撃戦 AI（ドイツ・ソ連の両方）。ソ連の見えていない戦闘力は覗かず、推定値（未判明の駒の平均）を使う
(function (root) {
  'use strict';
  const D = (typeof module !== 'undefined') ? require('./dokuso_engine.js') : root.DOKUSO;

  // ---- 目標までの距離（地形・敵を無視したヘクス数）から作る引力 ----
  function bfsDist(game, sources) {
    const m = game.map, dist = new Map();
    const q = [];
    for (const s of sources) { dist.set(s, 0); q.push(s); }
    for (let i = 0; i < q.length; i++) {
      const h = q[i], d = dist.get(h);
      for (const n of m.neighbors(h)) if (m.passable(n) && !dist.has(n)) { dist.set(n, d + 1); q.push(n); }
    }
    return dist;
  }
  // 目標ごとの距離を作り、potential(h) = max(価値 × 減衰^距離)
  function makePotential(game, targets, decay) {
    const fields = targets.map(t => ({ ...t, d: bfsDist(game, [t.h]) }));
    return (h, eligible) => {
      let best = 0;
      for (const f of fields) {
        const d = f.d.get(h);
        if (d == null || (eligible && !eligible(f.h))) continue;
        const v = f.v * Math.pow(decay, d);
        if (v > best) best = v;
      }
      return best;
    };
  }
  const isCity = (game, h) => !!D.CITY_POINTS[game.map.facility(h)];
  // 見えていないソ連の駒の慎重な見積もり: まだ判明していない駒（同じ種類）の戦闘力の q 分位
  //  ドイツが相手を見積もる時は強い方（q=0.75）、ソ連が自分の攻撃を見積もる時は弱い方（q=0.25）
  function qStr(game, u, q) {
    if (u.side === 'ger' || u.revealed) return u.str;
    const left = [];
    for (const [sv, c] of Object.entries(D.SOV_MIX[u.type])) for (let i = 0; i < c; i++) left.push(+sv);
    for (const v of game.units) if (v.side === 'sov' && v.type === u.type && v.revealed) { const i = left.indexOf(v.str); if (i >= 0) left.splice(i, 1); }
    if (!left.length) return game.estStr(u);
    left.sort((a, b) => a - b);
    return left[Math.min(left.length - 1, Math.floor(q * left.length))];
  }

  // ドイツAIの計画では、未判明の戦力だけ従来の推定値の半分で見る。
  const gerEstimatedDefense = (game, unit) => unit.revealed ? unit.str : qStr(game, unit, 0.75) / 2;

  // VASSALの支配マーカーの位置に対応するヘクス。
  const MINSK = '3716';
  const WESTERN_OBJECTIVES = new Set(['1810', '1315']); // グロドノ、ビヤリストク
  const westernObjectiveBonus = (game, h) => WESTERN_OBJECTIVES.has(h) && game.control[h] === 'sov' ? 2 : 0;

  function gerTargets(game, unit) {
    const t = [];
    for (const [h, s] of Object.entries(game.control)) if (s !== 'ger') t.push({ h, v: (D.CITY_POINTS[game.map.facility(h)] + westernObjectiveBonus(game, h)) * 3 });
    if (!unit || D.BREAK_POINTS[unit.type]) for (const h of (game.map.tags.fuel || [])) {
      const already = game.units.filter(u => u.alive && u.side === 'ger' && u.broke && u.hex === h).length;
      if (!already) t.push({ h, v: 9 });
    }
    return t;
  }
  function sovTargets(game) {
    const t = [];
    for (const [h, s] of Object.entries(game.control)) t.push({ h, v: D.CITY_POINTS[game.map.facility(h)] * (s === 'ger' ? 2.5 : 1.5) });
    for (const h of (game.map.tags.fuel || [])) t.push({ h, v: 5 });
    return t;
  }

  // ===== 配置 =====
  // ソ連の配置の考え方（ユーザーの指示 2026-11-01）
  //  ・戦線に穴を作らない（ドイツ側から、ソ連のいない・隣接しないヘクスだけを通って後方へ抜けられる道を残さない）
  //  ・駒どうしを隣に並べない。基本は1ヘクス離す（くっつけると戦車の戦闘後前進で包囲される）。同じヘクスに2個重ねるのは可
  //  ・ドイツの前（前線）には可能な限り歩兵を並べ、戦車など足の速い部隊は後方に置いて逃げられるようにする
  const SOV_BAND = ['reinforce_5', 'reinforce_4', 'reinforce_3', 'reinforce_2'];
  const fast = u => u.type === 'tank' || u.type === 'cav';
  function sovNoAdj(game, h, except) {
    return !game.map.neighbors(h).some(n => game.unitsAt(n).some(v => v.side === 'sov' && v !== except));
  }
  function isFrontHex(game, h) { const { west } = game.frontRegions(); return game.map.neighbors(h).some(n => west.has(n)); }
  // 駒を1つずつ、隣に駒がない空きヘクスへ。まだ覆っていない帯のヘクスを多く覆う所を選ぶ
  function sovSpread(game, units, hexes, coverSet) {
    for (const u of units) {
      if (u.hex) continue;
      const cov = new Set();
      for (const v of game.onMap('sov')) { cov.add(v.hex); for (const n of game.map.neighbors(v.hex)) cov.add(n); }
      let best = null, bs = -1;
      for (const h of hexes) {
        if (!game.canPlace(u, h) || game.friendCount(h, 'sov') > 0 || !sovNoAdj(game, h, u)) continue;
        let gain = 0;
        for (const x of [h, ...game.map.neighbors(h)]) if (coverSet.has(x) && !cov.has(x)) gain++;
        const s = gain * 10 + game.defMult(h, null);
        if (s > bs) { bs = s; best = h; }
      }
      if (best && bs >= 10) game.place(u, best);
    }
  }
  function sovFrontSetup(game) {
    const { band } = game.frontRegions();
    const areas = SOV_BAND.map(k => game.setupAreas('sov').find(a => a.key === k)).filter(Boolean);
    // 1) 前線（ドイツ側に接するヘクス）に歩兵
    for (const a of areas) sovSpread(game, a.units.filter(u => !fast(u)), a.hexes.filter(h => isFrontHex(game, h)), band);
    // 2) 後方（ドイツ側に接しないヘクス）に戦車。前線の帯は2ヘクス幅なので後方は前線の歩兵と隣り合うことがある。
    //    その時は隣の駒ができるだけ少ない所を選び、戦車どうしは隣に並べない（並べるくらいなら同じヘクスに重ねる）
    for (const a of areas) for (const u of a.units.filter(fast)) placeTankRear(game, u, a.hexes);
    // 3) 穴ふさぎ: 駒を1つ動かして（まだ置いていない駒を優先）穴が消える・小さくなる手を選ぶ。戦車を前線に出すのは最後の手段
    for (let it = 0; it < 40; it++) {
      const hole = game.frontHole();
      if (!hole) break;
      const target = new Set(hole.flatMap(h => [h, ...game.map.neighbors(h)]));
      let bestMove = null;
      const pool = areas.flatMap(a => a.units).sort((a, b) => (!!a.hex) - (!!b.hex));
      for (const u of pool) {
        const area = areas.find(a => a.key === u.area);
        const from = u.hex;
        for (const h of area.hexes) {
          if (!target.has(h) || h === from) continue;
          if (game.friendCount(h, 'sov') > 0 || !sovNoAdj(game, h, u)) continue;
          if (from) game.unplace(u);
          if (!game.place(u, h)) { if (from) game.place(u, from); continue; }
          const p = game.frontHole();
          let score = (p ? -p.length - 1000 : 0) - (from ? 0.5 : 0);
          if (fast(u) && isFrontHex(game, h)) score -= 50;
          if (!fast(u) && !isFrontHex(game, h)) score -= 1;
          game.unplace(u); if (from) game.place(u, from);
          if (!bestMove || score > bestMove.score) bestMove = { u, h, score };
        }
      }
      if (!bestMove) break;
      if (bestMove.u.hex) game.unplace(bestMove.u);
      game.place(bestMove.u, bestMove.h);
    }
    for (const a of areas) placeLeftovers(game, a);
  }
  function placeTankRear(game, u, hexes) {
    if (u.hex) return;
    let best = null, bs = -1e9;
    for (const h of hexes) {
      if (isFrontHex(game, h) || !game.canPlace(u, h)) continue;
      const here = game.unitsAt(h).filter(v => v.side === 'sov');
      if (here.length && !here.every(fast)) continue;            // 重ねるなら戦車どうしだけ
      const nb = game.map.neighbors(h).flatMap(n => game.unitsAt(n).filter(v => v.side === 'sov'));
      if (nb.some(fast)) continue;                                // 戦車どうしは隣に並べない
      const s = -10 * nb.length + game.defMult(h, null) - (here.length ? 15 : 0);
      if (s > bs) { bs = s; best = h; }
    }
    if (best) game.place(u, best);
  }
  // 残った駒: 隣に駒がない空きヘクス（歩兵は前線、戦車は後方）→ 同じ側の駒に重ねる → どこでも
  function placeLeftovers(game, area) {
    const front = h => isFrontHex(game, h);
    for (const u of area.units.filter(u => !u.hex)) {
      if (fast(u)) { placeTankRear(game, u, area.hexes); if (u.hex) continue; }
      const want = h => fast(u) ? !front(h) : front(h);
      const tries = [
        area.hexes.filter(h => want(h) && game.friendCount(h, 'sov') === 0 && sovNoAdj(game, h, u)),
        area.hexes.filter(h => want(h) && game.friendCount(h, 'sov') === 1 && game.unitsAt(h).every(v => fast(v) === fast(u))),
        area.hexes.filter(h => game.friendCount(h, 'sov') === 0 && sovNoAdj(game, h, u)),
        area.hexes.filter(h => game.friendCount(h, 'sov') === 1),
        area.hexes,
      ];
      for (const list of tries) {
        const c = list.filter(h => game.canPlace(u, h)).sort((a, b) => game.defMult(b, null) - game.defMult(a, null));
        if (c.length) { game.place(u, c[0]); break; }
      }
    }
  }
  // 第1ターンのソ連軍初期配置。セーブから駒の位置だけを採用する。
  const SOVIET_SETUP_HEXES = {
    s46: '1707', s47: '1604', s48: '1709',
    s49: '1408', s50: '0909', s51: '0811', s52: '1110', s53: '1109',
    s54: '1309', s55: '1410', s56: '1310', s57: '1310',
    s58: '1019', s59: '0715', s60: '0613', s61: '0917', s62: '0921',
    s63: '0915', s64: '0915', s65: '1119', s66: '1119',
    s67: '1125', s68: '1023', s69: '1129', s70: '1031',
    s71: '1226', s72: '1227', s73: '1227',
    s74: '3619', s75: '3514', s76: '3619', s77: '3416',
    s78: '3518', s79: '3613', s80: '3518',
    s81: '1810', s82: '1315', s83: '2804', s84: '2821',
    s85: '1810', s86: '1315', s87: '2804', s88: '2821',
    s89: '3625', s90: '3716', s91: '3625', s92: '3716',
  };
  function setupSovietPreset(game) {
    if (game.turn !== 1 || game.phase !== 'setup_sov') return false;
    const units = game.setupUnits('sov');
    if (units.length !== Object.keys(SOVIET_SETUP_HEXES).length) return false;
    const preview = Object.create(game);
    preview.units = game.units.map(unit => Object.hasOwn(SOVIET_SETUP_HEXES, unit.id)
      ? { ...unit, hex: SOVIET_SETUP_HEXES[unit.id] } : unit);
    if (!preview.setupUnits('sov').every(unit => preview.canPlace(unit, SOVIET_SETUP_HEXES[unit.id]))) return false;

    const moved = units.filter(unit => unit.hex !== SOVIET_SETUP_HEXES[unit.id]);
    for (const unit of moved) if (unit.hex) game.unplace(unit);
    for (const unit of moved) game.place(unit, SOVIET_SETUP_HEXES[unit.id]);
    return true;
  }
  function setup(game, side) {
    if (side === 'sov') {
      if (setupSovietPreset(game)) return;
      // 置き場所の限られる都市を先に（増援1の場所に大都市3716が含まれるため）
      const city = game.setupAreas('sov').find(a => a.key === 'city');
      setupGeneric(game, side, [city]);
      sovFrontSetup(game);
      const a1 = game.setupAreas('sov').find(a => a.key === 'reinforce_1');
      if (a1) { sovSpread(game, a1.units.filter(u => !fast(u)).concat(a1.units.filter(fast)), a1.hexes, new Set(a1.hexes)); placeLeftovers(game, a1); }
    }
    if (side === 'ger') gerLineSetup(game);
    setupGeneric(game, side, null);
  }
  // ドイツの配置（ユーザーの指示 2026-11-03）: 後ろに回り込まれないよう、スタート地点で歩兵の戦線を張る。
  //  歩兵は1個ずつ広げて、登場ヘクス全体を覆う。戦車と自動車化歩兵は前の方に2個ずつ
  function gerLineSetup(game) {
    const sovHexes = game.onMap('sov').map(u => u.hex);
    const closeness = h => sovHexes.length ? -Math.min(...sovHexes.map(x => game.map.dist(h, x))) : 0;
    const allHexes = new Set(game.setupAreas('ger').flatMap(a => a.hexes));
    const covered = new Set();
    for (const a of game.setupAreas('ger')) {
      const infs = a.units.filter(u => u.type === 'inf' && !u.hex);
      for (const u of infs) {
        let best = null, bs = -1e9;
        for (const h of a.hexes) {
          if (!game.canPlace(u, h) || game.friendCount(h, 'ger') > 0) continue;
          let gain = 0;
          for (const x of [h, ...game.map.neighbors(h)]) if (allHexes.has(x) && !covered.has(x)) gain++;
          const sc = gain * 3 + closeness(h);
          if (sc > bs) { bs = sc; best = h; }
        }
        if (best && game.place(u, best)) { covered.add(best); for (const n of game.map.neighbors(best)) covered.add(n); }
      }
      // 戦車と自動車化歩兵: 敵に近い空きヘクスへ2個ずつ
      const armor = a.units.filter(u => u.type !== 'inf' && !u.hex).sort((p, q) => rankType(q) - rankType(p));
      for (const u of armor) {
        const opts = a.hexes.filter(h => game.canPlace(u, h) && !game.unitsAt(h).some(v => v.type === 'inf')).sort((p, q) => closeness(q) - closeness(p));
        if (opts.length) game.place(u, opts[0]);
      }
    }
  }
  function setupGeneric(game, side, only) {
    const pot = side === 'ger'
      ? makePotential(game, gerTargets(game, null), 0.9)
      : makePotential(game, game.gerEntryHexes.map(h => ({ h, v: 1 })), 0.92); // ソ連: ドイツに近い所ほど前線
    // 置き場所の限られる都市を先に
    const areas = only || game.setupAreas(side).sort((a, b) => (b.key === 'city') - (a.key === 'city'));
    for (const area of areas) {
      const units = area.units.filter(u => !u.hex);
      if (!units.length) continue;
      if (area.key === 'city') {
        // 都市に2個ずつ。ドイツに近い都市から戦車を
        const cities = area.hexes.slice().sort((a, b) => pot(b) - pot(a));
        const order = units.slice().sort((a, b) => (b.type === 'tank') - (a.type === 'tank'));
        let i = 0;
        for (const u of order) { for (let k = 0; k < cities.length; k++) { const h = cities[(i + k) % cities.length]; if (game.place(u, h)) { i = (i + k + 1) % cities.length; break; } } }
        continue;
      }
      const defVal = h => (side === 'sov' ? game.defMult(h, null) * 0.6 + (game.map.facility(h) ? 0.5 : 0) : 0);
      const hexes = area.hexes.slice().sort((a, b) => (pot(b) + defVal(b)) - (pot(a) + defVal(a)));
      const order = units.slice().sort((a, b) => rankType(b) - rankType(a));
      if (side === 'ger') {
        // ドイツ: 前の方から2個ずつ詰める（戦車・自動車化歩兵が前）
        for (const u of order) for (const h of hexes) if (game.place(u, h)) break;
      } else {
        // ソ連: まず1個ずつ広く、余ったら2個目
        for (const u of order) {
          let ok = false;
          for (const h of hexes) if (game.friendCount(h, side) === 0 && game.place(u, h)) { ok = true; break; }
          if (!ok) for (const h of hexes) if (game.place(u, h)) break;
        }
      }
    }
  }
  const rankType = u => ({ tank: 3, mot: 2, cav: 1.5, inf: 1 })[u.type] || 0;

  // ===== 移動: 次の1手を返す（{type:'move'|'overrun', unit, hex}、なければ null） =====
  // 反撃の相手: 戦車・自動車化歩兵だけのヘクスで、隣にドイツの歩兵がいない（ついてきていない）所
  //  （相打ちでドイツは歩兵を差し出せず、戦車3点・自動車化歩兵2点を失う）
  function lonelyArmor(game) {
    const out = [];
    for (const h of [...new Set(game.onMap('ger').map(u => u.hex))]) {
      const here = game.unitsAt(h).filter(v => v.side === 'ger');
      if (!here.length || here.some(v => v.type === 'inf')) continue;
      if (game.map.neighbors(h).some(n => game.unitsAt(n).some(v => v.side === 'ger' && v.type === 'inf'))) continue;
      out.push({ h, pts: here.reduce((t, v) => t + D.KILL_POINTS[v.type], 0), def: here.reduce((t, v) => t + v.str, 0) });
    }
    return out.sort((a, b) => b.pts - a.pts);
  }
  // ドイツの戦車・自動車化歩兵（移動力10）が、次の移動で行けるヘクスの「価値」の合計。
  //  sovSet: ソ連の駒がいると仮定するヘクス。ソ連に隣接したヘクスに入ると止まる（その先へは行けない）。
  //  価値: ドイツがまだ取っていない都市（大都市5・都市2）×4、燃料集積所8、奥（東）へ行くほど少し
  function gerReachValue(game, sovSet, ctx) {
    const m = game.map;
    const zoc = new Set();
    for (const h of sovSet) { zoc.add(h); for (const n of m.neighbors(h)) zoc.add(n); }
    const best = ctx.best; best.clear();
    const buckets = Array.from({ length: 11 }, () => []);
    for (const h of ctx.sources) { if (sovSet.has(h)) continue; best.set(h, 0); buckets[0].push(h); }
    let val = 0, maxCol = 0;
    for (let c = 0; c <= 10; c++) {
      const B = buckets[c];
      for (let i = 0; i < B.length; i++) {
        const h = B[i];
        if (best.get(h) !== c) continue;
        const v = ctx.value.get(h);
        if (v) { val += v; ctx.valueSeen.add(h); }
        const col = ctx.col.get(h); if (col > maxCol) maxCol = col;
        if (c > 0 && zoc.has(h)) continue;          // ソ連に隣接したら止まる
        for (const n of ctx.nbr.get(h)) {
          if (sovSet.has(n)) continue;
          const nc = c + ctx.cost(h, n);
          if (nc > 10) continue;
          const old = best.get(n);
          if (old == null || nc < old) { best.set(n, nc); buckets[nc].push(n); }
        }
      }
    }
    return val + best.size * 0.03 + maxCol * 0.4;
  }
  function gerReachCtx(game) {
    const m = game.map;
    const value = new Map(), col = new Map(), nbr = new Map();
    for (const h of m.hexes) {
      col.set(h, m.parse(h).c);
      nbr.set(h, m.neighbors(h).filter(n => m.passable(n)));
      const f = m.facility(h);
      if (D.CITY_POINTS[f] && game.control[h] !== 'ger') value.set(h, D.CITY_POINTS[f] * 4);
      if ((m.tags.fuel || []).includes(h)) value.set(h, (value.get(h) || 0) + 8);
    }
    const sources = [...new Set(game.onMap('ger').filter(u => u.type !== 'inf').map(u => u.hex))];
    const costCache = new Map();
    const cost = (a, b) => { const k = a + b; let c = costCache.get(k); if (c == null) { c = game.moveCost(a, b); costCache.set(k, c); } return c; };
    return { value, col, nbr, sources, cost, best: new Map(), valueSeen: new Set() };
  }

  function sovMovementContext(game) {
    if (game._sovMovement?.state === game.moveState) return game._sovMovement;
    const m = game.map;
    const germanDistance = bfsDist(game, game.onMap('ger').map(u => u.hex));
    const sources = new Map();
    for (const u of game.onMap('ger')) {
      if (!sources.has(u.mov)) sources.set(u.mov, new Set());
      sources.get(u.mov).add(u.hex);
    }
    const { nbr, cost } = gerReachCtx(game);
    // 防衛線の有無に左右されず、ドイツ軍が次の移動で外周まで来られる都市を選ぶ。
    const germanApproach = new Set();
    for (const [mp, starts] of sources) {
      for (const h of zocReach(game, starts, new Set(), mp, { nbr, cost }).keys()) germanApproach.add(h);
    }
    const cities = m.hexes.filter(h => isCity(game, h)).map(h => {
      const inner = nbr.get(h);
      const outer = [...new Set(inner.flatMap(n => nbr.get(n)))].filter(n => m.dist(h, n) === 2);
      return { h, value: D.CITY_POINTS[m.facility(h)], inner, outer };
    }).filter(({ h, inner, outer }) => [h, ...inner, ...outer].some(n => germanApproach.has(n)))
      .sort((a, b) => b.value - a.value || m.center(a.h).x - m.center(b.h).x);
    const activeCities = new Set(cities.map(city => city.h));
    const cityDistance = bfsDist(game, [...activeCities].filter(h => game.control[h] === 'sov'));
    return (game._sovMovement = { state: game.moveState, cities, activeCities, cityDistance, germanDistance, sources, nbr, cost });
  }

  // 移動する駒を元の位置から外し、残る味方の占有とZOCでドイツ軍の移動を止める。
  function sovEnemyReach(game, unit, ctx) {
    const blockers = new Set(game.onMap('sov').filter(u => u !== unit).map(u => u.hex));
    const reach = new Set();
    for (const [mp, sources] of ctx.sources) {
      for (const h of zocReach(game, sources, blockers, mp, ctx, true).keys()) reach.add(h);
    }
    return reach;
  }

  function sovCityDefense(game, ctx) {
    const m = game.map;
    const occupied = new Map();
    for (const u of game.onMap('sov')) occupied.set(u.hex, (occupied.get(u.hex) || 0) + 1);
    const targets = new Map();
    const held = new Set();
    const distance = h => ctx.germanDistance.get(h) ?? Infinity;
    const defense = h => {
      const approaches = ctx.nbr.get(h).filter(n => distance(n) < distance(h));
      return game.defMult(h, approaches);
    };
    const offer = (h, rank, ring, cover) => {
      if (occupied.has(h) || game.enemyAt(h, 'sov')) return;
      const score = ((2 - ring) * ctx.cities.length + rank) * 10 + cover;
      if (score > (targets.get(h) ?? 0)) targets.set(h, score);
    };
    for (const [index, city] of ctx.cities.entries()) {
      if (game.control[city.h] !== 'sov') continue;
      const rank = ctx.cities.length - index;
      offer(city.h, rank, 0, 0);
      for (const h of city.inner) {
        if (occupied.has(h)) held.add(h);
        else if (!isCity(game, h)) offer(h, rank, 1, defense(h));
      }
      const complete = occupied.has(city.h) && city.inner.every(h => occupied.has(h));
      if (!complete) continue;
      for (const h of city.outer) {
        const cover = defense(h);
        if (cover <= 1 || isCity(game, h)) continue;
        if (occupied.has(h)) held.add(h);
        else offer(h, rank, 2, cover);
      }
    }

    // 防衛線にいる最後の駒と都市の守備隊を残し、動ける余剰部隊で空きを埋める。
    let order = null, best = -Infinity;
    if (targets.size) for (const u of game.onMap('sov')) {
      if (!game.canMove(u) || game.moveState[u.id]._done || game.control[u.hex] === 'sov') continue;
      if (held.has(u.hex) && occupied.get(u.hex) === 1) continue;
      for (const [h, move] of game.reachable(u)) {
        const priority = targets.get(h);
        if (!priority || (u.type !== 'inf' && !isCity(game, h))) continue;
        const score = priority * 10 - move.cost - Math.min(20, distance(h)) * 0.1;
        if (score > best) {
          best = score;
          order = { type: 'move', unit: u.id, hex: h };
        }
      }
    }
    return { order, held, occupied };
  }

  function sovNextMove(game) {
    const ctx = sovMovementContext(game);
    const { order, held, occupied } = sovCityDefense(game, ctx);
    if (order) {
      game.moveState[order.unit]._done = true;
      return order;
    }
    const m = game.map;
    const column = h => m.center(h).x;
    for (const u of game.onMap('sov')) {
      const state = game.moveState[u.id];
      if (!game.canMove(u) || state._done) continue;
      state._done = true;
      if (held.has(u.hex) && occupied.get(u.hex) === 1) continue;
      if (isCity(game, u.hex) && game.control[u.hex] === 'sov' &&
          game.friendCount(u.hex, 'sov') <= D.STACK_MAX) continue;

      const options = [...game.reachable(u)].filter(([h]) => game.friendCount(h, 'sov') < D.STACK_MAX);
      if (!options.length) continue;
      const reach = sovEnemyReach(game, u, ctx);
      const threatened = h => reach.has(h) || m.neighbors(h).some(n => reach.has(n));
      const retreat = threatened(u.hex);
      const from = column(u.hex);
      const allies = game.onMap('sov').filter(v => v !== u);
      const positions = [...options, [u.hex, { cost: 0 }]].map(([h, move]) => {
        const distance = ctx.cityDistance.get(h) ?? Infinity;
        const cover = D.TERRAIN_MULT[m.terrain(h)] || 1;
        const neighbors = ctx.nbr.get(h);
        const approaches = neighbors.filter(n => reach.has(n));
        const riverFront = approaches.length ? approaches : neighbors.filter(n => column(n) < column(h));
        const river = riverFront.length > 0 && riverFront.every(n => m.river(n, h));
        const city = ctx.activeCities.has(h) ? D.CITY_POINTS[m.facility(h)] : 0;
        const terrain = m.hasRoad(h) || (distance === 1 && cover > 1) ? 3 : river ? 2 : cover > 1 ? 1 : 0;
        const friends = game.friendCount(h, 'sov') - Number(h === u.hex);
        const supportsLine = distance <= 3 && allies.some(v => v.hex !== h && m.dist(v.hex, h) <= 2);
        const defense = Math.max(game.defMult(h, null), river ? 2 : 1);
        return { h, danger: threatened(h), city, terrain, distance, cover, defense, friends, supportsLine, cost: move.cost };
      });

      // ミンスクの外周にいる部隊は、防御地形を取れる限り都市の近くに残す。
      if (ctx.activeCities.has(MINSK) && game.control[MINSK] === 'sov' && m.dist(u.hex, MINSK) <= 3) {
        const localDefense = positions.filter(p => p.defense > 1 && m.dist(p.h, MINSK) <= 3);
        localDefense.sort((a, b) => b.defense - a.defense || Number(a.danger) - Number(b.danger) ||
          m.dist(a.h, MINSK) - m.dist(b.h, MINSK) || a.cost - b.cost);
        if (localDefense.length) {
          if (localDefense[0].h === u.hex) continue;
          return { type: 'move', unit: u.id, hex: localDefense[0].h };
        }
      }

      // 初期配置で接敵していた歩兵は、東西の向きより防御地形への移動を優先する。
      const defensiveMoves = game.sovInitialAdjacentInfantry?.has(u.id)
        ? positions.filter(p => p.h !== u.hex && p.defense > 1) : [];
      defensiveMoves.sort((a, b) => b.city - a.city || b.defense - a.defense ||
        Number(a.danger) - Number(b.danger) || a.distance - b.distance || a.cost - b.cost);
      const defensive = defensiveMoves[0];
      if (defensive) return { type: 'move', unit: u.id, hex: defensive.h };

      const candidates = positions.filter(p => retreat ? column(p.h) > from : column(p.h) <= from && !p.danger);
      candidates.sort((a, b) => Number(a.danger) - Number(b.danger) || b.city - a.city ||
        b.terrain - a.terrain || a.distance - b.distance || b.cover - a.cover ||
        a.friends - b.friends || Number(b.supportsLine) - Number(a.supportsLine) ||
        (retreat ? a.cost - b.cost : column(a.h) - column(b.h)) || a.cost - b.cost);
      const to = candidates[0]?.h;
      if (to && to !== u.hex) return { type: 'move', unit: u.id, hex: to };
    }
    return null;
  }

  // ===== ドイツの移動: 戦線を張り、包囲して確実にすりつぶす（ユーザーの指示 2026-11-02） =====
  // 敵の駒（ZOC を作る側）のヘクスの集合を仮定して、sources から maxMp で行けるヘクス → 費用
  function zocReach(game, sources, blockSet, maxMp, ctx, strictZoc = false) {
    const best = new Map();
    const zoc = new Set();
    for (const h of blockSet) { zoc.add(h); for (const n of ctx.nbr.get(h) || game.map.neighbors(h)) zoc.add(n); }
    const buckets = Array.from({ length: maxMp + 1 }, () => []);
    for (const h of sources) { if (blockSet.has(h)) continue; best.set(h, 0); buckets[0].push(h); }
    for (let c = 0; c <= maxMp; c++) {
      const B = buckets[c];
      for (let i = 0; i < B.length; i++) {
        const h = B[i];
        if (best.get(h) !== c) continue;
        if (c > 0 && zoc.has(h)) continue;
        for (const n of ctx.nbr.get(h)) {
          if (blockSet.has(n) || (strictZoc && zoc.has(h) && zoc.has(n))) continue;
          const nc = c + ctx.cost(h, n);
          if (nc > maxMp) continue;
          const old = best.get(n);
          if (old == null || nc < old) { best.set(n, nc); buckets[nc].push(n); }
        }
      }
    }
    return best;
  }
  // h のソ連が退却できる先（2ヘクス先）の数。gerSet のヘクスにドイツ軍がいると仮定
  function retreatCount(game, h, gerSet) {
    const m = game.map;
    const adjG = x => gerSet.has(x) || m.neighbors(x).some(n => gerSet.has(n));
    const ok = x => m.passable(x) && !adjG(x);
    let c = 0; const seen = new Set();
    for (const a of m.neighbors(h)) if (ok(a)) for (const b of m.neighbors(a)) if (!seen.has(b) && m.dist(b, h) === 2 && ok(b)) { seen.add(b); c++; }
    return c;
  }
  // ソ連のヘクス h が包囲されている: 周りのどのヘクスもドイツ軍に隣接していて、抜け出せない
  function pocketed(game, h, gerSet) {
    const m = game.map;
    return m.neighbors(h).every(a => !m.passable(a) || gerSet.has(a) || m.neighbors(a).some(n => gerSet.has(n)));
  }
  function gerPlanCtx(game) {
    const m = game.map;
    const nbr = new Map();
    for (const h of m.hexes) nbr.set(h, m.neighbors(h).filter(n => m.passable(n)));
    const costCache = new Map();
    const cost = (a, b) => { const k = a + b; let c = costCache.get(k); if (c == null) { c = game.moveCost(a, b); costCache.set(k, c); } return c; };
    // 守る価値: ドイツが取った都市と、そこから西へ行く道路（ソ連が通ると都市を取り返され、道路が切れる）
    const value = new Map();
    const gerCols = game.onMap('ger').map(u => m.parse(u.hex).c).sort((a, b) => a - b);
    const frontCol = gerCols.length ? gerCols[Math.floor(gerCols.length / 2)] : 0;
    for (const [h, sd] of Object.entries(game.control)) {
      if (sd !== 'ger') continue;
      value.set(h, (value.get(h) || 0) + D.CITY_POINTS[m.facility(h)] * 6);
      // 西への道路（西の端まで）
      const prev = new Map([[h, null]]), q = [h];
      let end = null;
      for (let i = 0; i < q.length && !end; i++) { const x = q[i]; if (m.parse(x).c + 1 <= 7) { end = x; break; } for (const n of m.neighbors(x)) if (!prev.has(n) && m.road(x, n)) { prev.set(n, x); q.push(n); } }
      for (let x = end; x; x = prev.get(x)) value.set(x, (value.get(x) || 0) + 1.5);
    }
    return { nbr, cost, value, frontCol };
  }
  // ソ連の駒が次の移動で届くヘクスの「守る価値」の合計（gerSet のドイツ軍の ZOC で止まる）
  function sovReachValue(game, gerSet, ctx) {
    const m = game.map;
    const fastSrc = game.onMap('sov').filter(u => u.type !== 'inf').map(u => u.hex);
    const infSrc = game.onMap('sov').filter(u => u.type === 'inf').map(u => u.hex);
    let v = 0;
    const seen = new Set();
    for (const [src, mp] of [[fastSrc, 8], [infSrc, 3]]) {
      if (!src.length) continue;
      for (const h of zocReach(game, src, gerSet, mp, ctx).keys()) {
        if (seen.has(h)) continue; seen.add(h);
        v += (ctx.value.get(h) || 0) + (m.parse(h).c < ctx.frontCol ? 0.15 : 0);
      }
    }
    return v;
  }
  const germanAttackMinimum = (game, h, units) =>
    !westernObjectiveBonus(game, h) && units.some(u => u.type === 'tank') ? 4 : 3;

  function gerPlan(game) {
    const key = game.turn + '|' + game.phase;
    if (game._gerPlan && game._gerPlan.key === key) return game._gerPlan;
    const m = game.map;
    const units = game.onMap('ger').filter(u => game.canMove(u) && !game.moveState[u.id]._done);
    const plan = new Map(), planned = new Map();
    for (const v of game.onMap('ger')) if (!units.includes(v)) planned.set(v.hex, (planned.get(v.hex) || 0) + 1);
    const occupy = (u, h) => { plan.set(u.id, h); planned.set(h, (planned.get(h) || 0) + 1); };
    const reach = new Map(units.map(u => [u.id, game.reachable(u)]));
    const eastOfTank = (u, h) => m.center(h).x >= m.center(u.hex).x;
    const canReach = (u, h) => h === u.hex || reach.get(u.id).has(h);
    const gerPos = (moving, destination) => new Set(game.onMap('ger').map(v =>
      v === moving ? destination : plan.get(v.id) || v.hex));
    const ctx = gerPlanCtx(game);
    // 0) 包囲を保つ（ユーザーの指示 2026-11-03）: 包囲で動けなくした敵は無理に攻撃しない。囲んでいる駒はその場に残す
    {
      const nowSet = new Set(game.onMap('ger').map(v => v.hex));
      for (const h of new Set(game.onMap('sov').map(u => u.hex))) {
        if (!pocketed(game, h, nowSet)) continue;
        if (isCity(game, h) || (m.tags.fuel || []).includes(h) || (ctx.value.get(h) || 0) > 0) continue; // 都市・補給・道路の上の敵は叩く
        for (const u of units.filter(v => !plan.has(v.id) && m.neighbors(v.hex).includes(h)).sort((a, b) => (b.type === 'inf') - (a.type === 'inf'))) {
          const without = new Set(game.onMap('ger').filter(v => v !== u && !(game.canMove(v) && !plan.has(v.id) && v.type !== 'inf' && v.hex === u.hex)).map(v => v.hex));
          if (!pocketed(game, h, without) || u.type === 'inf') occupy(u, u.hex);
        }
      }
    }
    // 守備隊のいない優先都市には、届く部隊を1個入れて占領する。
    for (const h of WESTERN_OBJECTIVES) {
      if (!westernObjectiveBonus(game, h) || game.enemyAt(h, 'ger')) continue;
      const candidates = units.filter(u => !plan.has(u.id) && reach.get(u.id).has(h));
      candidates.sort((a, b) => reach.get(a.id).get(h).cost - reach.get(b.id).get(h).cost ||
        Number(b.type === 'inf') - Number(a.type === 'inf'));
      if (candidates.length) occupy(candidates[0], h);
    }

    // 都市攻略と退路封鎖に部隊を集めてから、残りを戦線に回す。
    const targets = [...new Set(game.onMap('sov').map(u => u.hex))].map(h => {
      const def = game.unitsAt(h).filter(v => v.side === 'sov');
      const defEst = def.reduce((t, v) => t + gerEstimatedDefense(game, v), 0);
      const cityValue = D.CITY_POINTS[m.facility(h)] || 0;
      const val = m.parse(h).c * 2 + def.length * 2 + ((m.tags.fuel || []).includes(h) ? 6 : 0) +
        (ctx.value.get(h) || 0) + 2 / (1 + defEst);
      return { h, defEst, val, cityValue, priority: cityValue + westernObjectiveBonus(game, h) };
    }).sort((a, b) => b.priority - a.priority || b.val - a.val);
    const stalledCities = new Set();
    const nearStalledCity = h => [...stalledCities].some(city => m.dist(h, city) <= 3);
    const planAttack = (t, screenOnly = false) => {
      const spots = m.neighbors(t.h).filter(n => m.passable(n) && !game.enemyAt(n, 'ger'));
      // 都市の攻略なら戦車も西へ戻れる。野戦の目標と攻撃位置は従来どおり東側に限る。
      const canAttackFrom = (u, h) => canReach(u, h) &&
        (t.cityValue || u.type !== 'tank' || nearStalledCity(t.h) ||
          (eastOfTank(u, t.h) && eastOfTank(u, h)));
      const free = units.filter(u => !plan.has(u.id) && spots.some(sp => canAttackFrom(u, sp)));
      const defense = t.defEst * game.defMult(t.h, null);
      const sorted = free.sort((a, b) => Number(b.type === 'inf') - Number(a.type === 'inf') || b.str - a.str);
      const assigned = game.onMap('ger').filter(u =>
        (plan.has(u.id) || !reach.has(u.id)) && spots.includes(plan.get(u.id) || u.hex));
      const attackForce = assigned.concat(sorted);
      const canAttack = attackForce.reduce((sum, u) => sum + u.str, 0) >=
        defense * germanAttackMinimum(game, t.h, attackForce);
      const added = [];
      const screenPositions = (moving, destination) => new Set(game.onMap('ger')
        .filter(u => u === moving || plan.has(u.id) || !reach.has(u.id))
        .map(u => u === moving ? destination : plan.get(u.id) || u.hex));
      for (const u of sorted) {
        const positions = screenOnly ? screenPositions() : gerPos();
        const exits = retreatCount(game, t.h, positions);
        if (screenOnly && exits === 0) break;
        let best = null, bestScore = Infinity, bestExits = exits;
        for (const sp of spots) {
          if (!canAttackFrom(u, sp) || (planned.get(sp) || 0) >= D.STACK_MAX) continue;
          const after = screenOnly ? screenPositions(u, sp) : gerPos(u, sp);
          const exitsAfter = retreatCount(game, t.h, after);
          const openDirections = !screenOnly && t.cityValue ? spots.filter(h => !after.has(h)).length : 0;
          const score = openDirections * 100 + exitsAfter * 10 + (m.river(sp, t.h) ? 4 : 0) - game.defMult(sp, null) * 2
            + ((planned.get(sp) || 0) > 0 ? 0.5 : 0);
          if (score < bestScore) { bestScore = score; bestExits = exitsAfter; best = sp; }
        }
        if (!best || (screenOnly && bestExits >= exits)) continue;
        // 攻撃比が足りない野戦では、最初の拘束部隊と退路をさらに塞げる部隊だけを回す。
        if (!t.cityValue && !canAttack && assigned.length && bestExits >= exits) continue;
        occupy(u, best);
        assigned.push(u);
        added.push(u);
        if (!t.cityValue && canAttack && assigned.reduce((sum, v) => sum + v.str, 0) >=
            defense * germanAttackMinimum(game, t.h, assigned) && bestExits === 0) break;
      }
      if (!t.cityValue || screenOnly) return;
      const sufficient = units => units.length && units.reduce((sum, u) => sum + u.str, 0) >=
        t.defEst * game.defMult(t.h, units.map(u => plan.get(u.id) || u.hex)) *
        germanAttackMinimum(game, t.h, units);
      if (sufficient(assigned) || sufficient(assigned.filter(u => u.type !== 'tank'))) return;

      // 攻撃が成立しない配置を取り消し、退路を減らせる部隊だけを封鎖に残す。
      for (const u of added) {
        const h = plan.get(u.id);
        planned.set(h, planned.get(h) - 1);
        plan.delete(u.id);
      }
      stalledCities.add(t.h);
      planAttack(t, true);
    };
    for (const t of targets.filter(t => t.cityValue)) planAttack(t);
    const fieldTargets = targets.filter(t => !t.cityValue);
    fieldTargets.sort((a, b) => Number(nearStalledCity(b.h)) - Number(nearStalledCity(a.h)));
    for (const t of fieldTargets) planAttack(t);
    const attackUnits = new Set(plan.keys());
    // 包囲・攻略に割り当てていない歩兵で戦線を取る。3行ごとに、東進できる歩兵を1個ずつ確保する。
    const frontUnits = new Set();
    const sectors = new Map();
    for (const u of units.filter(u => u.type === 'inf' && !plan.has(u.id))) {
      const sector = Math.floor(m.parse(u.hex).r / 3);
      if (!sectors.has(sector)) sectors.set(sector, []);
      sectors.get(sector).push(u);
    }
    let previous = null;
    for (const [sector, infantry] of [...sectors].sort((a, b) => a[0] - b[0])) {
      let best = null, bestScore = -Infinity;
      for (const u of infantry) {
        const start = m.parse(u.hex);
        for (const h of [u.hex, ...reach.get(u.id).keys()]) {
          const { c, r } = m.parse(h);
          if (c < start.c || Math.floor(r / 3) !== sector || (planned.get(h) || 0) >= D.STACK_MAX) continue;
          const separation = previous ? m.dist(previous, h) : 0;
          const continuity = separation > 3 ? (separation - 3) * 6 : 0;
          const city = m.neighbors(h).some(n => isCity(game, n) && game.control[n] === 'sov');
          const score = c * 3 - continuity - Math.abs(r - (sector * 3 + 1)) +
            game.defMult(h, null) + (city ? 4 : 0) - (game.adjEnemy(h, 'ger') ? 2 : 0);
          if (score > bestScore) { bestScore = score; best = { u, h }; }
        }
      }
      if (!best) continue;
      occupy(best.u, best.h);
      frontUnits.add(best.u.id);
      previous = best.h;
    }
    // 2) 戦線: 残りの歩兵で、ソ連の駒が後方（ドイツの都市・西への道路・西側）へ届く範囲が一番狭くなる所へ
    {
      let cur = sovReachValue(game, gerPos(), ctx);
      const infs = units.filter(u => !plan.has(u.id) && u.type === 'inf');
      const sovHexes = game.onMap('sov').map(u => u.hex);
      for (const u of infs) {
        const col = m.parse(u.hex).c;
        const opts = [u.hex, ...reach.get(u.id).keys()].filter(h => m.parse(h).c >= col &&
          (planned.get(h) || 0) < D.STACK_MAX && !game.adjEnemy(h, 'ger'));
        // ソ連に近い候補から（遠すぎる所は線にならない）
        const near = opts.map(h => [h, Math.min(...sovHexes.map(x => m.dist(h, x)))]).sort((a, b) => a[1] - b[1]).slice(0, 16).map(x => x[0]);
        let bestH = null, bestV = cur;
        for (const h of near) {
          plan.set(u.id, h);
          const v = sovReachValue(game, gerPos(), ctx) - (m.parse(h).c - col) * 0.9 -
            (D.TERRAIN_MULT[m.terrain(h)] || 1) * 0.05;
          if (v < bestV - 0.3) { bestV = v; bestH = h; }
        }
        plan.delete(u.id);
        if (bestH) { occupy(u, bestH); cur = bestV; }
      }
    }
    // 3) 残りは前へ。都市・燃料集積所へ向かい、通過で支配。戦車は孤立させない（歩兵の近くか、ソ連が届かない所）
    {
      const sovFast = game.onMap('sov').filter(u => u.type !== 'inf').map(u => u.hex);
      const sovInf = game.onMap('sov').filter(u => u.type === 'inf').map(u => u.hex);
      const gs = gerPos();
      const danger = new Set();
      for (const [src, mp] of [[sovFast, 8], [sovInf, 3]]) if (src.length) for (const h of zocReach(game, src, gs, mp, ctx).keys()) { danger.add(h); for (const n of m.neighbors(h)) danger.add(n); }
      const activeTarget = t => !stalledCities.has(t.h);
      const mobileTargets = gerTargets(game, { type: 'tank' }).filter(activeTarget);
      const potAll = makePotential(game, gerTargets(game, null).filter(activeTarget), 0.88);
      const potFast = makePotential(game, mobileTargets, 0.9);
      const tankGoals = mobileTargets.map(t => ({
        h: t.h, v: D.CITY_POINTS[m.facility(t.h)] ? 10 + (D.CITY_POINTS[m.facility(t.h)] + westernObjectiveBonus(game, t.h)) * 5 : t.v,
      }));
      for (const t of targets) if (!t.cityValue) tankGoals.push({ h: t.h, v: 16 });
      const potTank = makePotential(game, tankGoals, 0.9);
      const rest = units.filter(u => !plan.has(u.id)).sort((a, b) => (a.type === 'inf') - (b.type === 'inf'));
      // 歩兵の予定位置（孤立の判定用）
      const infAt = () => { const st = new Set(); for (const v of game.onMap('ger')) if (v.type === 'inf') st.add(plan.has(v.id) ? plan.get(v.id) : v.hex); return st; };
      for (const u of rest.filter(x => x.type === 'inf').concat(rest.filter(x => x.type !== 'inf'))) {
        const ia = infAt();
        const tank = u.type === 'tank';
        const forwardGoal = h => eastOfTank(u, h);
        let best = u.hex, bs = -1e9;
        for (const [h, info] of [[u.hex, { path: [], cost: 0 }], ...reach.get(u.id)]) {
          if ((planned.get(h) || 0) >= D.STACK_MAX) continue;
          const eastward = m.parse(h).c - m.parse(u.hex).c;
          if (tank ? !forwardGoal(h) : eastward < 0) continue;
          const pot = tank ? potTank(h, forwardGoal) : (D.BREAK_POINTS[u.type] ? potFast : potAll)(h);
          let sc = pot * (tank ? 3 : u.type === 'inf' ? 1 : 2) + eastward * 4 +
            (game.defMult(h, null) - 1) * 3;
          if (u.type === 'inf') {
            const friends = [...ia].filter(x => x !== u.hex && m.dist(x, h) <= 3).length;
            sc += Math.min(friends, 3) * 0.6 + (ctx.value.get(h) || 0) * 0.5;
          }
          for (const p of info.path) if (game.control[p] && game.control[p] !== 'ger') sc += D.CITY_POINTS[m.facility(p)] * (tank ? 12 : 6);
          if ((m.tags.fuel || []).includes(h) && D.BREAK_POINTS[u.type] && !u.broke && game.breakthroughPathOK(h)) sc += 40;
          if (game.control[h] === 'ger' && !game.unitsAt(h).some(v => v.side === 'ger' && v !== u) && u.type === 'inf') sc += D.CITY_POINTS[m.facility(h)] * 5;
          if (game.adjEnemy(h, 'ger')) sc -= 6;                         // 予定外に隣接しない
          if (u.type !== 'inf') {
            const supported = ia.has(h) || m.neighbors(h).some(n => ia.has(n));
            if (!supported && danger.has(h)) sc -= 8;                   // 孤立した戦車は反撃される
          }
          if (sc > bs) { bs = sc; best = h; }
        }
        occupy(u, best);
      }
    }
    // 動く順: 包囲・攻撃の駒 → 戦線 → 前進（いずれも計画どおり）
    const order = units.slice().sort((a, b) => Number(attackUnits.has(b.id)) - Number(attackUnits.has(a.id))
      || Number(frontUnits.has(b.id)) - Number(frontUnits.has(a.id))
      || rankType(b) - rankType(a)).map(u => u.id);
    return (game._gerPlan = { key, plan, order });
  }
  function gerOverrunApproach(game) {
    const m = game.map;
    const armor = game.onMap('ger').filter(u => u.type === 'tank' && game.canMove(u) && !game.moveState[u.id]._done);
    if (!armor.length) return null;
    const reach = new Map();
    const enemyHexes = [...new Set(game.onMap('sov').map(u => u.hex))];
    const cityApproaches = enemyHexes.filter(h => isCity(game, h)).flatMap(h => m.neighbors(h))
      .filter(h => m.passable(h) && game.friendCount(h, 'ger') < D.STACK_MAX);
    let best = null, bestScore = -Infinity;
    for (const h of enemyHexes) {
      const defenders = game.unitsAt(h).filter(u => u.side === 'sov');
      if (defenders.some(u => !u.revealed)) continue;
      const defense = defenders.reduce((sum, u) => sum + u.str, 0);
      const cityValue = D.CITY_POINTS[m.facility(h)] || 0;
      for (const from of m.neighbors(h)) {
        if (!m.passable(from) || game.friendCount(from, 'ger') >= D.STACK_MAX) continue;
        const required = 10 * defense * game.defMult(h, [from]);
        for (const u of armor) {
          if (u.str < required || m.dist(u.hex, from) > game.moveState[u.id].mp) continue;
          const startX = m.center(u.hex).x;
          if (!cityValue && (m.center(h).x < startX || m.center(from).x < startX)) continue;
          if (!reach.has(u.id)) reach.set(u.id, game.reachable(u));
          const options = reach.get(u.id);
          const move = options.get(from);
          if (!move || (!cityValue && cityApproaches.some(h => h === u.hex || options.has(h)))) continue;
          const score = (cityValue + westernObjectiveBonus(game, h)) * 100 + m.parse(from).c - move.cost * 0.5;
          if (score > bestScore) { bestScore = score; best = { type: 'move', unit: u.id, hex: from }; }
        }
      }
    }
    return best;
  }

  function gerNextMove(game) {
    // オーバーランができるなら先に（そのあと計画をやり直す）
    for (const u of game.onMap('ger')) { const t = game.overrunTargets(u); if (t.length) { game._gerPlan = null; return { type: 'overrun', unit: u.id, hex: t[0] }; } }
    const approach = gerOverrunApproach(game);
    if (approach) {
      game._gerPlan = null;
      game.moveState[approach.unit]._done = true;
      return approach;
    }
    const P = gerPlan(game);
    for (const id of P.order) {
      const u = game.unit(id);
      if (!u || !u.alive || !game.canMove(u) || game.moveState[id]._done) continue;
      game.moveState[id]._done = true;
      const to = P.plan.get(id);
      if (!to || to === u.hex) continue;
      const r = game.reachable(u);
      if (r.has(to) && game.friendCount(to, 'ger') < D.STACK_MAX) return { type: 'move', unit: id, hex: to };
    }
    return null;
  }

  function nextMove(game, side) {
    if (side === 'sov') return sovNextMove(game);
    if (side === 'ger') return gerNextMove(game);
    const units = game.onMap(side).filter(u => game.moveState[u.id]);
    // オーバーランができるなら先に
    if (side === 'ger') for (const u of units) { const t = game.overrunTargets(u); if (t.length) return { type: 'overrun', unit: u.id, hex: t[0] }; }
    const cand = units.filter(u => game.canMove(u) && !game.moveState[u.id]._done)
      .sort((a, b) => rankType(b) - rankType(a));
    const ctx = side === 'ger' ? gerCtx(game) : sovCtx(game);
    for (const u of cand) {
      // ドイツの戦車・自動車化歩兵は、移動開始時にスタックしている相棒とまとめて動く（合わせてオーバーランできる）
      // ただし、合わせて初めてオーバーランできる判明済みのソ連が届く範囲にいる時だけ（普段は別々に動いて広がる）
      let mates = (side === 'ger' && rankType(u) >= 2) ? game.stackMates(u).filter(v => rankType(v) >= 2) : [];
      if (mates.length) {
        const sum = u.str + mates[0].str, reach = Math.min(game.moveState[u.id].mp, game.moveState[mates[0].id].mp) + 1;
        const worth = [...new Set(game.onMap('sov').filter(v => v.revealed).map(v => v.hex))].some(h => {
          if (game.map.dist(h, u.hex) > reach) return false;
          const def = game.unitsAt(h).filter(v => v.side === 'sov');
          if (def.some(v => !v.revealed)) return false;
          const d = def.reduce((t, v) => t + v.str, 0) * game.defMult(h, null);
          return sum >= 10 * d && u.str < 10 * d;
        });
        if (!worth) mates = [];
      }
      const group = mates.length ? [u, mates[0]] : [u];
      const r = game.reachableGroup(group);
      const here = scoreHex(game, side, u, u.hex, [], ctx, true);
      let best = null, bestS = here + 0.05;
      for (const [h, info] of r) {
        if (game.friendCount(h, side) > D.STACK_MAX - group.length) continue;
        const s = scoreHex(game, side, u, h, info.path, ctx, false);
        if (s > bestS) { bestS = s; best = h; }
      }
      for (const v of group) game.moveState[v.id]._done = true; // この駒の判断は終わり（オーバーランで止まりが解けたら再判断）
      if (best) return group.length > 1 ? { type: 'moveGroup', units: group.map(v => v.id), unit: u.id, hex: best } : { type: 'move', unit: u.id, hex: best };
    }
    return null;
  }
  function gerCtx(game) {
    return {
      potAll: makePotential(game, gerTargets(game, null), 0.88),
      potFast: makePotential(game, gerTargets(game, { type: 'tank' }), 0.9),
      sovHexes: [...new Set(game.onMap('sov').map(u => u.hex))],
    };
  }
  function sovCtx(game) {
    return {
      pot: makePotential(game, sovTargets(game), 0.85),
      gerDist: bfsDist(game, game.onMap('ger').map(u => u.hex)),
    };
  }
  function stackEst(game, h, side) { return game.unitsAt(h).filter(v => v.side !== side).reduce((t, v) => t + game.estStr(v), 0); }

  function scoreHex(game, side, u, h, path, ctx, stay) {
    const m = game.map;
    let s = 0;
    if (side === 'ger') {
      const pot = D.BREAK_POINTS[u.type] ? ctx.potFast : ctx.potAll;
      s += pot(h) * 3;
      for (const p of path) if (game.control[p] && game.control[p] !== 'ger') s += D.CITY_POINTS[m.facility(p)] * 6; // 通過で支配
      if ((m.tags.fuel || []).includes(h) && D.BREAK_POINTS[u.type] && !u.broke && game.breakthroughPathOK(h)) s += 40;
      // 支配した都市に守りを残す（ソ連が通過すると取り返されるため）。歩兵が主に残る
      if (game.control[h] === 'ger') {
        const garrison = game.unitsAt(h).filter(v => v.side === 'ger' && v !== u).length;
        if (garrison === 0) s += D.CITY_POINTS[m.facility(h)] * (u.type === 'inf' ? 5 : 1.5);
      }
      // 隣の敵: 攻撃の機会（弱い相手ほど良い）
      let adjBest = 0;
      for (const n of m.neighbors(h)) {
        if (!game.enemyAt(n, side)) continue;
        const d = stackEst(game, n, side) * game.defMult(n, [h]);
        adjBest = Math.max(adjBest, (u.str + 4) / (d + 1));
      }
      if (adjBest) s += Math.min(adjBest, 6) * (u.type === 'inf' ? 0.6 : 0.4);
      for (const n of m.neighbors(h)) if (game.enemyAt(n, side)) { const rc = roadCutValue(game, n); if (rc) { s += Math.min(rc, 10) * 0.5; break; } }
      s += (D.TERRAIN_MULT[m.terrain(h)] || 1) * 0.15;
    } else {
      s += ctx.pot(h) * 2;
      const fac = m.facility(h);
      if (D.CITY_POINTS[fac]) {
        const garrison = game.unitsAt(h).filter(v => v.side === 'sov' && v !== u).length;
        if (garrison < 2) s += D.CITY_POINTS[fac] * (garrison === 0 ? 3 : 1.5);
      }
      if ((m.tags.fuel || []).includes(h) && !game.unitsAt(h).some(v => v.side === 'sov' && v !== u)) s += 6;
      for (const p of path) if (game.control[p] === 'ger') s += D.CITY_POINTS[m.facility(p)] * 8; // 取り返す
      const dg = ctx.gerDist.get(h);
      if (dg != null) { if (dg === 2 || dg === 3) s += 1.6; else if (dg === 1) s += (u.type === 'tank' ? 1.0 : 0.3); else if (dg > 8) s -= 0.5; }
      s += game.defMult(h, null) * 0.6;
    }
    return s;
  }

  // ===== 戦闘の組み合わせ =====
  function sovietAttackersWithRetreat(game, available, odds, targetOdds) {
    const slots = new Map();
    const assigned = new Map();
    // 攻撃側退却は1ヘクス。全員分の空き枠を確保し、同じ枠を重複して数えない。
    function assignRetreat(unit, checked) {
      for (const slot of slots.get(unit)) {
        if (checked.has(slot)) continue;
        checked.add(slot);
        const other = assigned.get(slot);
        if (!other || assignRetreat(other, checked)) {
          assigned.set(slot, unit);
          return true;
        }
      }
      return false;
    }
    const attackers = [];
    for (const unit of available) {
      const destinations = game.retreatOptions(unit.id, 1);
      slots.set(unit, destinations.flatMap(hex => {
        const capacity = D.STACK_MAX - game.friendCount(hex, unit.side);
        return Array.from({ length: capacity }, (_, i) => hex + ':' + i);
      }));
      if (assignRetreat(unit, new Set())) {
        attackers.push(unit);
        if (odds(attackers) >= targetOdds) break;
      }
    }
    return attackers;
  }

  function planCombats(game, side) {
    const out = [];
    const used = new Set();
    const enemyHexes = [...new Set(game.onMap(game.enemyOf(side)).map(u => u.hex))];
    const targets = [];
    for (const h of enemyHexes) {
      const atk = game.onMap(side).filter(u => game.map.neighbors(u.hex).includes(h));
      if (!atk.length) continue;
      const defEst = game.unitsAt(h).filter(v => v.side !== side).reduce((t, v) => t + (side === 'ger' ? gerEstimatedDefense(game, v) : game.estStr(v)), 0);
      let value = (isCity(game, h) ? D.CITY_POINTS[game.map.facility(h)] * 2 : 0) + ((game.map.tags.fuel || []).includes(h) ? 4 : 0) + 3 / (1 + defEst);
      if (side === 'sov') { const la = lonelyArmor(game).find(x => x.h === h); if (la) value += 10 + la.pts * 3; }
      if (side === 'ger') value += roadCutValue(game, h) + westernObjectiveBonus(game, h) * 2;
      targets.push({ h, atk, defEst, value });
    }
    const stalledCities = side === 'ger' ? targets.filter(t => {
      if (!isCity(game, t.h)) return false;
      const sufficient = units => units.length && units.reduce((sum, u) => sum + u.str, 0) >=
        t.defEst * game.defMult(t.h, units.map(u => u.hex)) * germanAttackMinimum(game, t.h, units);
      return !sufficient(t.atk) && !sufficient(t.atk.filter(u => u.type !== 'tank'));
    }) : [];
    const priority = t => {
      if (side !== 'ger') return 0;
      if (stalledCities.includes(t)) return -1;
      if (isCity(game, t.h)) return new Set(t.atk.map(u => u.hex)).size === 6 ? 3 : 2;
      return Number(stalledCities.some(city => game.map.dist(t.h, city.h) <= 3));
    };
    targets.sort((a, b) => priority(b) - priority(a) || b.value - a.value);
    // ソ連: 全員が退却できる組のみ攻撃。通常は推定3対1、都市の外なら推定2対1から。
    const lonely = side === 'sov' ? new Set(lonelyArmor(game).map(t => t.h)) : new Set();
    for (const t of targets) {
      const avail = t.atk.filter(u => !used.has(u.id)).sort((a, b) => {
        const ra = game.map.river(a.hex, t.h) ? 1 : 0, rb = game.map.river(b.hex, t.h) ? 1 : 0;
        return (ra - rb) || (game.estStr(b) - game.estStr(a));
      });
      if (!avail.length) continue;
      const odds = list => { const mult = game.defMult(t.h, [...new Set(list.map(u => u.hex))]); const att = list.reduce((s, u) => s + (side === 'sov' ? qStr(game, u, 0.25) : u.str), 0); const def = t.defEst * mult; return def <= 0 ? 99 : att / def; };
      let minimum = 3;
      const okFor = list => odds(list) >= (side === 'ger' ? germanAttackMinimum(game, t.h, list) : minimum);
      const cityAttack = side === 'ger' && isCity(game, t.h);
      let pick = [];
      if (side === 'sov') {
        pick = sovietAttackersWithRetreat(game, avail, odds, lonely.has(t.h) ? 3 : 4);
        if (!okFor(pick)) {
          minimum = 2;
          const outsideCities = avail.filter(unit => !isCity(game, unit.hex));
          pick = sovietAttackersWithRetreat(game, outsideCities, odds, 3);
        }
      } else if (cityAttack) pick = avail;
      else {
        for (const u of avail) {
          pick.push(u);
          // 余力があれば5対1まで集める。4対1の相打ちによる自軍損失を減らす。
          if (odds(pick) >= 5) break;
        }
      }
      // 戦車を含む組で4対1に届かなければ、歩兵だけで3対1になるかを確認する。
      if (side === 'ger' && !okFor(pick)) pick = avail.filter(u => u.type !== 'tank');
      if (!pick.length || !okFor(pick)) continue;
      if (side === 'sov' && !lonely.has(t.h)) {
        const targetOdds = Math.min(odds(pick), minimum + 1) - 0.5;
        for (const u of pick.slice().sort((a, b) => game.estStr(a) - game.estStr(b))) {
          const rest = pick.filter(x => x !== u);
          if (rest.length && okFor(rest) && odds(rest) >= targetOdds) pick = rest;
        }
      }
      for (const u of pick) used.add(u.id);
      out.push({ attackers: pick.map(u => u.id), hex: t.h });
    }
    return out;
  }

  // ドイツが支配する都市の、西への道路を切っているソ連（道路の上か隣）なら、その都市の点数分の価値
  function roadCutValue(game, h) {
    let v = 0;
    const m = game.map;
    const near = [h, ...m.neighbors(h)];
    if (!near.some(x => m.hasRoad(x))) return 0;
    for (const c of Object.keys(game.control)) {
      if (game.control[c] !== 'ger') continue;
      if (game.breakthroughPathOK(c)) continue;
      if (m.dist(c, h) <= 12) v += D.CITY_POINTS[m.facility(c)] * 2;
    }
    return v;
  }

  // ===== 退却・前進 =====
  function chooseRetreat(game, uid) {
    const u = game.unit(uid);
    const opts = game.retreatOptions(uid);
    if (!opts.length) return null;
    const enemy = game.onMap(game.enemyOf(u.side)).map(v => v.hex);
    const pot = u.side === 'sov' ? makePotential(game, sovTargets(game), 0.85) : makePotential(game, game.gerEntryHexes.map(h => ({ h, v: 1 })), 0.9);
    let best = opts[0], bs = -1e9;
    for (const h of opts) {
      const de = enemy.length ? Math.min(...enemy.map(e => game.map.dist(h, e))) : 9;
      const s = de * 2 + game.defMult(h, null) + pot(h) * 2;
      if (s > bs) { bs = s; best = h; }
    }
    return best;
  }
  function chooseAdvance(game) {
    const p = game.pending;
    if (!p || !p.advance) return [];
    const side = game.combatSide();
    const units = p.advance.units.map(id => game.unit(id)).filter(u => u.alive);
    const H = p.advance.hex;
    if (side === 'sov') {
      // ソ連: 都市・燃料集積所なら入る（取り返す・守る）
      if (!(isCity(game, H) || (game.map.tags.fuel || []).includes(H))) return [];
      return units.sort((a, b) => game.estStr(b) - game.estStr(a)).slice(0, 1).map(u => ({ unit: u.id }));
    }
    const pot = makePotential(game, gerTargets(game, { type: 'tank' }), 0.9);
    const chosen = units.sort((a, b) => rankType(b) - rankType(a) || b.str - a.str).slice(0, D.STACK_MAX);
    const moves = [];
    for (const u of chosen) {
      let extra = null;
      if (u.mov >= 8) {
        let bs = pot(H) + 0.01;
        for (const h of game.advanceExtraOptions(u.id)) {
          const already = moves.filter(m => m.extra === h).length;
          if (game.friendCount(h, side) + already >= D.STACK_MAX) continue;
          const s = pot(h) + (game.control[h] && game.control[h] !== 'ger' ? 10 : 0);
          if (s > bs) { bs = s; extra = h; }
        }
      }
      moves.push(extra ? { unit: u.id, extra } : { unit: u.id });
    }
    return moves;
  }

  // ===== 1フェイズを最後まで（画面なしの対戦用） =====
  function playPhase(game) {
    const side = game.activeSide();
    if (!side) return;
    if (game.phase === 'setup_' + side) { setup(game, side); game.finishSetup(side); return; }
    if (game.phase === side + '_move') {
      let guard = 500, a;
      while (guard-- > 0 && (a = nextMove(game, side))) {
        doAction(game, a);
      }
      fixStacking(game, side);
      const r = game.endPhase();
      if (!r.ok) throw new Error('AI 移動の終了に失敗: ' + r.reason);
      return;
    }
    if (game.phase === side + '_combat') {
      for (const d of planCombats(game, side)) game.declare(d.attackers, d.hex);
      game.startResolve();
      resolveAll(game);
      game.endPhase();
    }
  }
  // nextMove の手を実行（画面からも使う）
  function doAction(game, a) {
    if (a.type === 'overrun') {
      const u = game.unit(a.unit);
      const grp = game.overrunGroup(u);
      game.overrun(u, a.hex);
      for (const v of grp) { const ms = game.moveState[v.id]; if (ms) ms._done = false; }
    } else if (a.type === 'moveGroup') game.moveGroup(a.units.map(id => game.unit(id)), a.hex);
    else game.moveUnit(game.unit(a.unit), a.hex);
  }
  function resolveAll(game, chooser) {
    let guard = 500;
    while (guard-- > 0) {
      if (game.pending) {
        const p = game.pending;
        if (p.retreat.length) { const x = p.retreat[0]; game.applyRetreat(x.unit, chooseRetreat(game, x.unit)); continue; }
        if (p.advance) { game.applyAdvance(chooseAdvance(game)); continue; }
      }
      if (!game.resolveNext()) break;
    }
  }
  // 重なりすぎを直す（移動力の残っている駒を動かす）
  function fixStacking(game, side) {
    for (const h of game.overStacked(side)) {
      const extra = game.unitsAt(h).filter(u => u.side === side);
      for (const u of extra) {
        if (game.friendCount(h, side) <= D.STACK_MAX) break;
        if (!game.canMove(u)) continue;
        for (const [to] of game.reachable(u)) if (game.friendCount(to, side) < D.STACK_MAX) { game.moveUnit(u, to); break; }
      }
    }
  }

  const DOKUSO_AI = { gerReachValue, gerReachCtx, setup, nextMove, doAction, planCombats, chooseRetreat, chooseAdvance, playPhase, resolveAll, fixStacking };
  if (typeof module !== 'undefined') module.exports = DOKUSO_AI;
  root.DOKUSO_AI = DOKUSO_AI;
})(typeof window !== 'undefined' ? window : globalThis);
