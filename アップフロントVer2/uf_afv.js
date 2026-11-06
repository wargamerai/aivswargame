// uf_afv.js — AFV（§25・§27〜§29）とシナリオE（ユーザーの指示 2026-11-04）
// AFV は「1枚で1グループの兵士」として作り、ふつうの射撃・移動の処理に乗せる。
//   カード番号 31=乗員露出(CE) / 131=閉鎖(Buttoned Up)。閉鎖するとカード番号が変わるので、火力とモラルも裏面の値になる
//   KIA・パニックの値は届かない数字にして、撃破は装甲への攻撃（§28.4）か白兵戦（§28.8）だけにする
(function (global) {
  'use strict';
  const U = { ger: 'Ger', us: 'US' };
  // ドイツの車両はカードどおり #30 SPW 251/1。ゲームの中の番号は 31 なので、画像の道だけ 30 にする
  if (typeof global.encPath === 'function') {
    const encOrig = global.encPath;
    global.encPath = s => encOrig(String(s).replace(/(\/Ger )31([fb]\.gif)$/, '$130$2'));
  }
  const DEFS = {
    ger: {
      // シナリオカードEの #30 SPW 251/1（ゲームの中の番号は他の国と同じ 31 のまま）
      name: 'SPW 251/1', pt: 202, ot: true,
      ce: { ovr: 3, ceVal: 9, morale: 5, fp: [8, 9, 10, 11, 12, 13], hit: null, bog: '4c', bogW: '7w', armor: { is: 0, k: 1 }, flank: { is: -1, k: 0 } },
      bu: { ovr: 3, fp: [8, 9, 10, 11, 12, 13], hit: null, bog: '4c', bogW: '7w', armor: { is: 0, k: 1 }, flank: { is: -1, k: 0 } },
      effect: null, x: 'X6',
    },
    rus: {
      name: 'M5 Halftrack', pt: 137, ot: true,
      ce: { ovr: 3, ceVal: 9, morale: 5, fp: [7, 8, 9, 10, 11, 12], hit: null, bog: '4c', bogW: '7w', armor: { is: -1, k: 0 }, flank: { i: -2, s: -1, k: 0 } },
      bu: { ovr: 3, fp: [7, 8, 9, 10, 11, 12], hit: null, bog: '4c', bogW: '7w', armor: { is: -1, k: 0 }, flank: { i: -2, s: -1, k: 0 } },
      effect: null, x: 'X6',
    },
    us: {
      name: 'M3 Halftrack', pt: 141, ot: true,
      ce: { ovr: 3, ceVal: 9, morale: 4, fp: [7, 8, 9, 10, 11, 12], hit: null, bog: '4c', bogW: '7w', armor: { is: -1, k: 0 }, flank: { i: -2, s: -1, k: 0 } },
      bu: { ovr: 3, fp: [7, 8, 9, 10, 11, 12], hit: null, bog: '4c', bogW: '7w', armor: { is: -1, k: 0 }, flank: { i: -2, s: -1, k: 0 } },
      effect: null, x: 'X6',
    },
  };
  const stats = global.__afvStats = { fire: 0, overrun: 0, overrunKills: 0, gun: 0, gunHits: 0, boxed: 0, killed: 0, buttoned: 0, ck: 0, bog: 0, cc: 0 };

  function factionOfCard(c) { const m = String(c && c.id).match(/^(Ger|US|Rus|russian)[ _]/); return m ? (m[1] === 'Ger' ? 'ger' : m[1] === 'US' ? 'us' : 'rus') : null; }
  function numOf(c) { const m = String(c && c.id).match(/(\d+)\s*$/); return m ? +m[1] : 0; }
  function isAfvCard(c) { const n = numOf(c); return !!factionOfCard(c) && (n === 31 || n === 131); }
  function isButtoned(c) { return numOf(c) === 131; }
  function isAfvGroup(g) { return !!(g && g.cards && g.cards.some(isAfvCard)); }
  function afvCard(g) { return g && g.cards && g.cards.find(isAfvCard); }
  function defOf(c) { return DEFS[factionOfCard(c)]; }
  function sideOf(c) { const d = defOf(c); return isButtoned(c) ? d.bu : d.ce; }
  function ckMod(c) { return (c && c._ck) || 0; }

  // ===== 兵士の表に AFV を足す =====
  function inject() {
    const SC = global.SOLDIER_CARDS; if (!SC) return;
    for (const f of Object.keys(DEFS)) {
      const list = SC[f]; if (!list || list.some(s => s.num === 31 && s.afv)) continue;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].num === 31 || list[i].num === 131) list.splice(i, 1);
      const dd = DEFS[f], dirP = f === 'ger' ? ['ドイツ', 'Ger'] : f === 'us' ? ['ありか', 'US'] : ['ソ連', 'Rus'];
      const imgNo = f === 'ger' ? 30 : 31; // カード画像の番号（ドイツは #30）
      const mk = (num, side, back) => ({
        num, rank: 'AFV', name: dd.name + (back ? '（閉鎖）' : ''), ccvFront: '0/0', leader: '', weaponCat: 'AFV', xVal: 'X6', weaponName: 'MG',
        range: side.fp.map(String), rangeData: side.fp.map(v => (typeof parseRangeValue === 'function' ? parseRangeValue(String(v)) : { value: v })),
        needsCrew: false, morale: back ? '' : String(side.morale), pt: String(dd.pt), kiaFront: '99', panic: '99', ccvBack: '0/0', kiaBack: '99', rncRoute: '',
        imgFront: encodeURI(`upfrontimages/${dirP[0]}/${dirP[1]} ${imgNo}${back ? 'b' : 'f'}.gif`), imgBack: encodeURI(`upfrontimages/${dirP[0]}/${dirP[1]} ${imgNo}b.gif`), noteBack: '', afv: true,
      });
      list.push(mk(31, dd.ce, false)); list.push(mk(131, dd.bu, true));
    }
  }

  // ===== シナリオE =====
  const E = {
    id: 'E', name: '機甲偵察', description: '攻撃側に装甲車が1両つく。距離4で、ピン状態でない4枚が身を隠せる地形に入れば勝ち。時間切れは防御側の勝ち。',
    asymmetric: true, attackerRole: 'player',
    factions: {
      // images/シナリオ/Scenario E.gif のとおり（31 はその国の車両）
      ger: { soldierList: [1, 2, 4, 5, 6, 7, 8, 9, 31] },
      us: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 31] },
      rus: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 31] },
    },
    defenderFactions: {
      ger: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      us: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      rus: { soldierList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    },
    onlyFactions: ['ger', 'rus', 'us'], // ドイツ・ソ連・アメリカだけ（ユーザーの指示 2026-11-04）
    firstPlayer: 'attacker', deckCycles: 3, handLimits: { ger: 5, us: 6, rus: 4, jpn: 4, uk: 5 }, initialTerrain: null,
    victory: { type: 'reachAndHold', minSoldiers: 4, maxRelativeRange: 4, requireProtectiveTerrain: true, requireNotInfiltrated: true },
    treatAsPlain: ['PILLBOX', 'MINEFIELD'],
    deckRemovals: [{ type: 'BUILDINGS', count: 4, trigger: 'firstDiscard' }],
  };

  // AFV を1枚で1グループにする（§28.11）。グループは4つまで
  function splitAfv(groups) {
    let found = null;
    for (const g of groups) { const c = afvCard(g); if (c) { found = { g, c }; break; } }
    if (!found || found.g.cards.length === 1) return groups;
    found.g.cards = found.g.cards.filter(x => x !== found.c);
    const a = Object.assign({}, found.g, { name: 'T', cards: [found.c], terrain: [], actions: [], crewPairs: {} });
    const out = groups.filter(g => g.cards.length > 0);
    out.push(a);
    while (out.length > 4) { const inf = out.filter(g => !isAfvGroup(g)).sort((x, y) => x.cards.length - y.cards.length); inf[1].cards = inf[1].cards.concat(inf[0].cards); out.splice(out.indexOf(inf[0]), 1); }
    return out;
  }

  // ===== 使い勝手の小道具 =====
  const R = () => global.INFANTRY_RULES;
  const rncOf = j => { const a = parseInt((j.terrain && j.terrain.range) || '0', 10) || 0; return { abs: a, red: j.terrain.rncColor === '赤', v: j.terrain.rncColor === '赤' ? -a : a }; };
  const log = t => { try { if (global.ufEvent) global.ufEvent('sys', t); } catch (e) {} };
  function draw() { return typeof ccDrawCard === 'function' ? ccDrawCard() : null; }
  function inFreqList(freq, n) {
    if (!freq) return false; const m = String(freq).split('-').map(Number);
    return m.length === 1 ? n === m[0] : (n >= m[0] && n <= m[1]);
  }
  function shiftFreq(freq, by) { // §25.6
    const order = ['3', '2', '1', '0', '0-1', '0-2', '0-3', '0-4', '0-5', '0-6'];
    const i = order.indexOf(freq); if (i < 0) return freq; return order[Math.max(0, Math.min(order.length - 1, i + by))];
  }
  const isMoving = g => (g.terrain || []).some(c => c && c.terrain && c.terrain.type === 'MOVEMENT');
  const sideway = g => { const t = (g.terrain || [])[g.terrain.length - 1]; return !!(t && t.terrain && t.terrain.type === 'MOVEMENT' && t._moveMode === 'lateral'); };
  function isHullDown(g, firer) { // §28.9
    const t = (g.terrain || [])[(g.terrain || []).length - 1]; const ty = t && t.terrain && t.terrain.type;
    if (ty === 'WALL') return true;
    if (ty === 'HILL') { const f = firer && (firer.terrain || [])[(firer.terrain || []).length - 1]; return !(f && f.terrain && f.terrain.type === 'HILL'); }
    return false;
  }
  function kill(g, c, why) { R().killSoldier(c); stats.killed++; log(`AFV ${defOf(c).name} 撃破（${why}）`); if (typeof cleanupEliminatedGroups === 'function') cleanupEliminatedGroups(); }
  function immobilize(g, c) {
    if (g._immob) return stun(g, c); g._immob = true; log(`AFV ${defOf(c).name} 移動不能`);
    (g.terrain || []).filter(t => t.terrain && t.terrain.type === 'MOVEMENT').forEach(t => { if (typeof pushTerrainToDiscard === 'function') pushTerrainToDiscard(t); });
    g.terrain = (g.terrain || []).filter(t => !(t.terrain && t.terrain.type === 'MOVEMENT'));
  }
  function stun(g, c) { c.pinned = true; toButton(c, true); g._afvRally = 0; g._stun = (g._stun || 0) + 1; log(`AFV ${defOf(c).name} スタン`); if (g._stun >= 3) kill(g, c, 'スタン3回'); }
  function toButton(c, silent) { if (!isButtoned(c) && !defOf(c).ot) { c.id = String(c.id).replace(/31(\s*)$/, '131$1'); c.num = 131; stats.buttoned++; if (!silent) log(`AFV ${defOf(c).name} ハッチを閉じた`); } }
  // 装甲への攻撃（§28.4）。final=最終の攻撃の強さ
  function armorResult(g, c, final, flank) {
    const s = sideOf(c), A = (flank || g._immob || g._bog) ? s.flank : s.armor;
    if (final >= A.k) { kill(g, c, `強さ${final}`); return 'KILL'; }
    const hd = isHullDown(g);
    if (A.is != null && final === A.is) { const j = draw(); const red = j && j.terrain.rncColor === '赤'; if (red && !hd) immobilize(g, c); else stun(g, c); return red ? 'IMMOB' : 'STUN'; }
    if (A.i != null && final === A.i) { if (hd) stun(g, c); else immobilize(g, c); return 'IMMOB'; }
    if (A.s != null && final === A.s) { stun(g, c); return 'STUN'; }
    return 'NONE';
  }
  // §28.7 オープントップには、距離5の歩兵に固有の対装甲火力 1 がある。射撃カードが使えれば、同じカードで装甲にもう一度
  function boxedAfterFire(src, tgt, need, strength) {
    if (isAfvGroup(src)) stats.fire++;
    if (!isAfvGroup(tgt) || !src || isAfvGroup(src)) return;
    const c = afvCard(tgt); if (!defOf(c).ot || !R().isAlive(c)) return;
    const rr = R().relativeRange(src.distance, tgt.distance); if (rr !== 5) return;
    const men = src.cards.filter(x => R().isAlive(x) && !R().isPinned(x)).length;
    if ((need || 0) > men) return;
    const j = draw(); if (!j) return;
    const rn = rncOf(j);
    let tem = R().calcTerrainMod(tgt.terrain, false, {}) || 0;
    const friendly = 0; void friendly;
    const final = (strength || 0) + (isHullDown(tgt, src) ? 0 : tem) + rn.v;
    stats.boxed++;
    armorResult(tgt, c, final, sideway(tgt));
  }
  // ===== AFV の主砲（§25）: 装甲車の 20mm。対AFV専用に使う =====
  function gunTargets(side, enemySide) {
    const out = [];
    (state.groups[side] || []).forEach((g, gi) => {
      if (!isAfvGroup(g) || g.eliminated) return; const c = afvCard(g); if (!c || !R().isAlive(c) || R().isPinned(c) || !defOf(c).effect) return;
      (state.groups[enemySide] || []).forEach((t, ti) => { if (isAfvGroup(t) && !t.eliminated) out.push({ g, gi, c, t, ti }); });
    });
    return out;
  }
  function gunShot(a, fireCardIdx, hand) {
    const c = a.c, s = sideOf(c), dd = defOf(c), rr = R().relativeRange(a.g.distance, a.t.distance);
    let freq = s.hit && s.hit[rr]; if (!freq) return false;
    if (ckMod(c)) freq = shiftFreq(freq, -ckMod(c));
    if (isMoving(a.g) && isMoving(a.t)) freq = shiftFreq(freq, -1);
    const fc = hand.splice(fireCardIdx, 1)[0]; if (fc && typeof pushTerrainToDiscard === 'function') pushTerrainToDiscard(fc);
    const j = draw(); stats.gun++;
    const rn = rncOf(j);
    const redMiss = isMoving(a.t) || isMoving(a.g) || isHullDown(a.t, a.g);
    if (rn.red && (rn.abs === 5 || rn.abs === 6)) { c.malfunctioned = true; log(`AFV ${dd.name} 主砲故障`); return true; }
    if (redMiss && rn.red) return true;
    if (!inFreqList(freq, rn.abs)) return true;
    stats.gunHits++;
    const hitStr = dd.effect.box + rr; // §25.4 IG/AFV 対 AFV は相対距離を足す
    const tgtC = afvCard(a.t);
    const j2 = draw(); const r2 = rncOf(j2);
    const tem = isHullDown(a.t, a.g) ? 0 : (R().calcTerrainMod(a.t.terrain, false, {}) || 0);
    armorResult(a.t, tgtC, hitStr + tem + r2.v, sideway(a.t));
    return true;
  }
  // ===== オーバーラン（§29）=====
  function canOverrun(g) {
    if (!isAfvGroup(g) || g.eliminated || g._immob || g._bog || g._stun) return false;
    const c = afvCard(g); return !!c && R().isAlive(c) && !R().isPinned(c) && !c.malfunctioned && !c.destroyed;
  }
  function overrunTargets(g, gi, enemySide) {
    const out = [];
    (state.groups[enemySide] || []).forEach((t, ti) => {
      if (!t || t.eliminated || isAfvGroup(t) || Math.abs(ti - gi) > 1) return;
      if (R().relativeRange(g.distance, t.distance) !== 5) return;
      if (['MARSH', 'MINEFIELD', 'PILLBOX'].some(x => R().hasTerrainType && R().hasTerrainType(t, x))) return;
      if (!t.cards.some(x => R().isAlive(x))) return;
      out.push({ t, ti });
    });
    return out;
  }
  function overrun(g, t, moveCard, tgtKey, side) {
    const c = afvCard(g), s = sideOf(c), dd = defOf(c), Rr = R();
    moveCard._moveMode = 'lateral';
    pushTerrainWithFaction(g, moveCard);
    if (g._bog) return { results: [], bogged: true };
    const j = draw(); const rn = rncOf(j);
    let strength = Math.max(0, s.ovr - ckMod(c)) + rn.abs;
    if (c.malfunctioned) strength = Math.floor(s.ovr / 2) + rn.abs;
    const tem = Rr.calcTerrainMod(t.terrain, false, {}) || 0;
    const final = strength + tem + (isMoving(t) ? 1 : 0);
    const risky = ['BRUSH', 'BUILDINGS', 'WALL', 'WOODS'].some(x => Rr.hasTerrainType && Rr.hasTerrainType(t, x));
    const bogRisk = ['GULLY', 'WOODS', 'STREAM', 'WIRE'].some(x => Rr.hasTerrainType && Rr.hasTerrainType(t, x));
    stats.overrun++;
    if (bogRisk && checkBog(g, c, t)) return { results: [], bogged: true };
    const results = [];
    for (const man of t.cards.slice()) {
      if (!Rr.isAlive(man)) continue;
      const jj = draw(); if (!jj) break;
      const r2 = rncOf(jj), rpc = parseInt(jj.terrain.dice && jj.terrain.dice['0r'], 10) || 0;
      const def = Rr.lookupSoldier(man, tgtKey), was = Rr.isPinned(man);
      if (risky && !was && r2.red) { // §29.41-.42
        if (dd.ot && r2.abs === 5) { kill(g, c, 'オーバーラン'); break; }
        if (r2.abs === 6) { immobilize(g, c); break; }
      }
      const res = Rr.resolveFireOnSoldier(final, r2.v, def, was, rpc);
      if (res.result === 'WOUND') { res.result = typeof applyWound === 'function' ? applyWound(man) : 'NONE'; }
      if (res.result === 'KIA' || res.result === 'PANIC_KIA') { Rr.killSoldier(man); stats.overrunKills++; }
      else if (res.result === 'PANIC_ROUT') { Rr.routSoldier(man); stats.overrunKills++; }
      else if (res.result === 'PIN') Rr.pinSoldier(man);
      results.push({ name: def ? def.name : man.id, result: res.result });
    }
    if (typeof cleanupEliminatedGroups === 'function') cleanupEliminatedGroups();
    log(`オーバーラン 強さ${final} ${results.map(r => r.name + ':' + r.result).join(' ')}`);
    return { results, final };
  }
  // ===== スタック（§28.53）=====
  function checkBog(g, c, terrainGroup, wire) {
    const s = sideOf(c), col = wire ? s.bogW : s.bog;
    const j = draw(); if (!j || !j.terrain.diceColor) return false;
    if (j.terrain.diceColor[col] === '赤') { g._bog = true; stats.bog++; log(`AFV ${defOf(c).name} スタック`); return true; }
    return false;
  }
  // ===== 白兵戦（§28.8）: 距離5から肉薄する。人物カードの強さは関係なく、RNC と修正だけで決まる =====
  function ccAttack(attacker, attGroup, afvG, side) {
    const Rr = R(), c = afvCard(afvG), dd = defOf(c);
    const col = dd.ot && !isButtoned(c) && !Rr.isPinned(c) ? '5o' : (!isButtoned(c) && !Rr.isPinned(c) ? '4c' : '2b');
    const shift = ckMod(c);
    const cols = ['1', '2b', '3', '4c', '5o', '6', '7w', '8', '9', '0r'];
    const use = cols[Math.max(0, cols.indexOf(col) - shift)];
    const jr = draw(); if (!jr) return null;
    stats.cc++;
    // 侵入: RPC が赤なら近づけた
    if (jr.terrain.diceColor && jr.terrain.diceColor[use] !== '赤') return { ok: false };
    const j = draw(); const rn = rncOf(j);
    let m = rn.v;
    const t = (afvG.terrain || [])[(afvG.terrain || []).length - 1], ty = t && t.terrain && t.terrain.type;
    if (ty === 'BUILDINGS') m += 3; if (ty === 'WOODS' || ty === 'WALL' || ty === 'GULLY') m += 2; if (ty === 'BRUSH') m += 1;
    if (!isButtoned(c) && !dd.ot) m -= 1; if (isButtoned(c)) m += 1; m += ckMod(c); if (afvG._immob || afvG._bog) m += 2; if (dd.ot) m += 3;
    if (attacker.demo) { m += 4; attacker.demo = false; }
    if (m >= 7) { kill(afvG, c, '白兵戦'); return { ok: true, res: 'KILL' }; }
    if (m === 6) { immobilize(afvG, c); return { ok: true, res: 'IMMOB' }; }
    if (m <= 0) { Rr.killSoldier(attacker); return { ok: true, res: 'ATTACKER_KIA' }; }
    return { ok: true, res: 'NONE' };
  }
  // ===== AI の判断 =====
  async function aiTryGun() {
    const a = gunTargets('ai', 'player'); if (!a.length) return false;
    const fi = state.aiHand.findIndex(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0);
    if (fi < 0) return false;
    const acted = state.aiActedGroups || new Set();
    const pick = a.filter(x => !acted.has(x.gi)).sort((p, q) => R().relativeRange(q.g.distance, q.t.distance) - R().relativeRange(p.g.distance, p.t.distance))[0];
    if (!pick) return false;
    gunShot(pick, fi, state.aiHand); state.aiHandCount = state.aiHand.length; acted.add(pick.gi);
    if (typeof renderField === 'function') { renderField('ai'); renderField('player'); }
    if (typeof showAIAction === 'function') await showAIAction('AI: AFV 主砲', null, pick.gi);
    return true;
  }
  // 重み: オーバーランの価値。研究用に差し替えられる
  const POL = global.AFV_POLICY = Object.assign({ overrunMinMen: 2, overrunMaxTem: 0, advance: 'normal' }, global.AFV_POLICY || {});
  async function aiTryOverrun() {
    const mi = state.aiHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT'); if (mi < 0) return false;
    const acted = state.aiActedGroups || new Set(), fired = state.aiFiredGroups || new Set();
    const key = (typeof getFactionKey === 'function') ? getFactionKey(state.player) : 'us';
    for (let gi = 0; gi < state.groups.ai.length; gi++) {
      const g = state.groups.ai[gi];
      if (acted.has(gi) || fired.has(gi) || !canOverrun(g)) continue;
      const c = overrunTargets(g, gi, 'player').map(x => ({ ...x, men: x.t.cards.filter(m => R().isAlive(m)).length, tem: R().calcTerrainMod(x.t.terrain, false, {}) || 0 }))
        .filter(x => x.men >= POL.overrunMinMen && x.tem >= -POL.overrunMaxTem - 1).sort((p, q) => (q.men + q.tem) - (p.men + p.tem));
      if (!c.length) continue;
      const mv = state.aiHand.splice(mi, 1)[0]; state.aiHandCount = state.aiHand.length;
      overrun(g, c[0].t, mv, key, 'ai'); acted.add(gi);
      if (typeof renderField === 'function') { renderField('ai'); renderField('player'); }
      if (typeof showAIAction === 'function') await showAIAction('AI: オーバーラン', null, gi);
      return true;
    }
    return false;
  }
  async function aiTryAfvRally() { return false; }
  // §28.42 ピン（スタン）の AFV の回復: 回復の強さが合わせて3以上で回復。1・2の回復カードは積み立てられる
  //   （AFV が回復するか、またスタンするか、撃破されるまで残る）。§10.41 ヒーローは1として数える
  //   全回復のカードは、全員を回復させるカードなのでそのまま回復させる（こちらの判断）
  global.afvRallyCredit = function (g, rallyCard) {
    const c = afvCard(g); if (!c || !R().isAlive(c) || !R().isPinned(c)) return null;
    const t = rallyCard && rallyCard.terrain ? rallyCard.terrain.type : '';
    const v = t === 'RALLY ALL' ? 3 : t === 'HERO' ? 1 : (parseInt(String(t).replace('RALLY ', ''), 10) || 0);
    const total = (g._afvRally || 0) + v;
    if (total >= 3) { R().unpinSoldier(c); g._afvRally = 0; log(`AFV ${defOf(c).name} 回復`); return { rallied: true, total, name: defOf(c).name }; }
    g._afvRally = total; return { rallied: false, total, name: defOf(c).name };
  };
  // 歩兵が AFV に肉薄する
  async function aiTryCCAfv() {
    const acted = state.aiActedGroups || new Set(), fired = state.aiFiredGroups || new Set();
    for (let gi = 0; gi < state.groups.ai.length; gi++) {
      const g = state.groups.ai[gi]; if (!g || g.eliminated || isAfvGroup(g) || acted.has(gi) || fired.has(gi)) continue;
      const tgt = (state.groups.player || []).find((t, ti) => isAfvGroup(t) && !t.eliminated && Math.abs(ti - gi) <= 0 && R().relativeRange(g.distance, t.distance) === 5);
      if (!tgt) continue;
      const man = g.cards.find(m => R().isAlive(m) && !R().isPinned(m)); if (!man) continue;
      ccAttack(man, g, tgt, 'ai'); acted.add(gi);
      if (typeof renderField === 'function') { renderField('ai'); renderField('player'); }
      if (typeof showAIAction === 'function') await showAIAction('AI: AFV に肉薄', null, gi);
      return true;
    }
    return false;
  }
  // ===== 人が動かす時の操作 =====
  function humanPanel() {
    let el = document.getElementById('afvPanel');
    if (!state || !state.scenario || state.phase !== 'play' || state.currentTurn !== 'player') { if (el) el.style.display = 'none'; return; }
    const gs = state.groups.player || [];
    const gi = gs.findIndex(g => isAfvGroup(g) && !g.eliminated);
    const enemyAfv = (state.groups.ai || []).findIndex(g => isAfvGroup(g) && !g.eliminated);
    if (gi < 0 && enemyAfv < 0) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'afvPanel';
      el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:900;background:#1b1f14;border:1px solid #887;padding:6px 8px;color:#eee;font-size:13px;border-radius:4px';
      document.body.appendChild(el);
    }
    el.style.display = '';
    const c = gi >= 0 ? afvCard(gs[gi]) : null;
    el.innerHTML = (c ? `<b>${defOf(c).name}</b> ${isButtoned(c) ? '閉鎖' : '乗員露出'}${gs[gi]._immob ? ' 移動不能' : ''}${gs[gi]._bog ? ' スタック' : ''}${gs[gi]._stun ? ' スタン' : ''}${c._ck ? ' 車長戦死' : ''}<br>
      <button onclick="AFV.uiOverrun()">オーバーラン</button> ${defOf(c).effect ? '<button onclick="AFV.uiGun()">主砲</button> ' : ''}${gs[gi]._bog ? '<button onclick="AFV.uiUnbog()">スタック脱出</button> ' : ''}${!isButtoned(c) && !defOf(c).ot ? '<button onclick="AFV.uiButton()">ハッチを閉じる</button> ' : ''}` : '') + (enemyAfv >= 0 ? `<button onclick="AFV.uiCC()">AFV へ肉薄</button>` : '');
  }
  function uiAfterAction() { if (typeof renderField === 'function') { renderField('player'); renderField('ai'); } if (typeof renderHands === 'function') renderHands(); humanPanel(); }
  const AFVAPI = {
    uiOverrun() {
      const gs = state.groups.player, gi = gs.findIndex(isAfvGroup), g = gs[gi];
      if (!canOverrun(g)) return alert('今はオーバーランできません');
      const mi = state.playerHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT'); if (mi < 0) return alert('手札に移動カードがありません');
      const list = overrunTargets(g, gi, 'ai'); if (!list.length) return alert('距離5で隣か正面に敵の歩兵がいません');
      const i = list.length === 1 ? 0 : (parseInt(prompt(list.map((x, k) => `${k + 1}: ${x.t.name}`).join('\n'), '1'), 10) || 1) - 1;
      if (!list[i]) return;
      const mv = state.playerHand.splice(mi, 1)[0];
      const r = overrun(g, list[i].t, mv, getFactionKey(state.ai), 'player');
      alert(r.bogged ? 'スタックした！' : `オーバーラン（強さ${r.final}）\n` + r.results.map(x => `${x.name}: ${x.result}`).join('\n'));
      if (state.actedGroups && state.actedGroups.add) state.actedGroups.add(gi);
      uiAfterAction();
    },
    uiGun() {
      const a = gunTargets('player', 'ai'); if (!a.length) return alert('敵の AFV がいません');
      const fi = state.playerHand.findIndex(c => c && c.terrain && String(c.terrain.type).indexOf('FIRE') === 0); if (fi < 0) return alert('手札に射撃カードがありません');
      gunShot(a[0], fi, state.playerHand); if (state.actedGroups && state.actedGroups.add) state.actedGroups.add(a[0].gi); uiAfterAction();
    },
    uiUnbog() {
      const g = state.groups.player.find(isAfvGroup); const mi = state.playerHand.findIndex(c => c && c.terrain && c.terrain.type === 'MOVEMENT'); if (mi < 0) return alert('手札に移動カードがありません');
      pushTerrainToDiscard(state.playerHand.splice(mi, 1)[0]); const j = draw(); if (j && j.terrain.rncColor !== '赤') { g._bog = false; alert('脱出した'); } else alert('まだ動けない'); uiAfterAction();
    },
    uiButton() { const c = afvCard(state.groups.player.find(isAfvGroup)); toButton(c); uiAfterAction(); },
    uiCC() {
      const eg = state.groups.ai.findIndex(isAfvGroup); const t = state.groups.ai[eg];
      const gi = state.groups.player.findIndex((g, i) => g && !g.eliminated && !isAfvGroup(g) && i === eg && R().relativeRange(g.distance, t.distance) === 5);
      if (gi < 0) return alert('真向かいで距離5のグループがありません');
      const g = state.groups.player[gi], m = g.cards.find(x => R().isAlive(x) && !R().isPinned(x)); if (!m) return alert('動ける兵がいません');
      const r = ccAttack(m, g, t, 'player'); alert(!r.ok ? '近づけなかった' : { KILL: '撃破！', IMMOB: '移動不能にした', ATTACKER_KIA: '返り討ちにあった', NONE: '効果なし' }[r.res]);
      if (state.actedGroups && state.actedGroups.add) state.actedGroups.add(gi); uiAfterAction();
    },
  };
  // ===== 本体への差し込み =====
  function wire() {
    inject();
    if (global.SCENARIOS && !global.SCENARIOS.E) global.SCENARIOS.E = E;
    // 研究用: 防御側にも AFV をつける
    if (global.UF_BOTH_AFV) { ['ger', 'us', 'rus'].forEach(f => { E.defenderFactions[f].soldierList = E.factions[f].soldierList; }); }
    // AFV の前進の方針（研究用に差し替えられる）
    if (typeof global.aiGroupWantsAdvance === 'function' && !global.aiGroupWantsAdvance._afv) {
      const o = global.aiGroupWantsAdvance;
      global.aiGroupWantsAdvance = function (g, i) {
        if (isAfvGroup(g)) {
          if (POL.advance === 'rush') return true;
          if (POL.advance === 'mid') { const closest = Math.max(...(state.groups.player || []).filter(t => t && !t.eliminated).map(t => R().relativeRange(g.distance, t.distance))); return closest < 3; }
        }
        return o(g, i);
      };
      global.aiGroupWantsAdvance._afv = true;
    }
    const SH = global.SCENARIO_HELPERS;
    if (SH && SH.buildAIGroupsSmart && !SH._afvWrapped) {
      const o = SH.buildAIGroupsSmart; SH._afvWrapped = true;
      SH.buildAIGroupsSmart = function (sc, f, role, st) { const g = o(sc, f, role, st); if (!sc || sc.id !== 'E') return g; inject(); return splitAfv(g); };
    }
    const Rr = R();
    if (Rr && !Rr._afvWrapped) {
      Rr._afvWrapped = true;
      const oRes = Rr.resolveFireOnSoldier, oPin = Rr.pinSoldier;
      Rr.resolveFireOnSoldier = function (finalFP, rnc, soldier) {
        const r = oRes.apply(this, arguments);
        if (soldier && soldier.afv) { Rr._afvCE = ((finalFP | 0) + (rnc | 0)) >= 9; }
        return r;
      };
      Rr.pinSoldier = function (card) {
        if (isAfvCard(card)) {
          if (Rr._afvCE) { card._ck = (card._ck || 0) + 1; stats.ck++; log(`AFV ${defOf(card).name} 車長戦死`); Rr._afvCE = false; }
          if (defOf(card).ot) { if (card._ck >= 3) { Rr.killSoldier(card); stats.killed++; return; } return oPin.apply(this, arguments); } // オープントップはピン
          toButton(card); return; // 閉鎖するだけで、機能は止まらない（§28.43）
        }
        return oPin.apply(this, arguments);
      };
    }
    if (typeof global.canUseConcealment === 'function' && !global.canUseConcealment._afv) {
      const o = global.canUseConcealment; global.canUseConcealment = function (g) { return isAfvGroup(g) ? false : o(g); }; global.canUseConcealment._afv = true;
    }
    if (typeof global.pushTerrainWithFaction === 'function' && !global.pushTerrainWithFaction._afv) {
      const o = global.pushTerrainWithFaction;
      global.pushTerrainWithFaction = function (g, card) {
        if (isAfvGroup(g)) {
          const ty = card && card.terrain && card.terrain.type, c = afvCard(g);
          if (ty === 'MARSH' && !g._marshOk) { pushTerrainToDiscard(card); return; } // §28.5 湿地には入らない
          // §13.35 AFV に鉄条網: ただちにスタックの判定。結果に関係なく鉄条網は捨て札（AFV の射撃に影響しない）
          if (c && ty === 'WIRE') { checkBog(g, c, null, true); pushTerrainToDiscard(card); return; }
          const r = o(g, card);
          if (c && ['GULLY', 'WOODS', 'STREAM'].includes(ty)) checkBog(g, c);
          return r;
        }
        return o(g, card);
      };
      global.pushTerrainWithFaction._afv = true;
    }
    // 人が組んだグループでも、AFV は1枚で1グループにする
    if (typeof global.startGameWithSetup === 'function' && !global.startGameWithSetup._afv) {
      const o = global.startGameWithSetup;
      global.startGameWithSetup = function () {
        inject();
        const r = o.apply(this, arguments);
        try { if (state.scenario && state.scenario.id === 'E') { state.groups.player = splitAfv(state.groups.player); state.groups.player.forEach((g, i) => { g.name = ['A', 'B', 'C', 'D'][i]; }); if (typeof renderField === 'function') renderField('player'); } } catch (e) {}
        return r;
      };
      global.startGameWithSetup._afv = true;
    }
    if (global.CARD_SCORE && global.CARD_SCORE.wire) global.CARD_SCORE.wire();
  }
  global.AFV = Object.assign({ isAfvCard, isAfvGroup, afvCard, wire, boxedAfterFire, aiTryGun, aiTryOverrun, aiTryCCAfv, canOverrun, humanPanel, stats, defOf, E, splitAfv }, AFVAPI);
  wire();
  // シナリオEはまだ公開しない（ユーザーの指示 2026-11-05）。URL に scenarioE=1 を付けたときだけ選べる
  try {
    if (global.document && !/[?&]scenarioE=1(&|$)/.test(global.location.search)) {
      const opt = global.document.querySelector('#scenario-pick option[value="E"]');
      if (opt) opt.remove();
    }
  } catch (e) {}
  setInterval(() => { try { if (global.document && global.state) humanPanel(); } catch (e) {} }, 800);
})(typeof window !== 'undefined' ? window : this);
