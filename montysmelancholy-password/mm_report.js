// Monty's Melancholy: after-action report, rebuilt by replaying the game's answers
(function (root) {
  const TRUNK = ['Rommel', 'Bergeijk', 'Valkenswaard', 'Eindhoven', 'Son', 'StOdenrode', 'Veghel', 'Uden', 'Grave', 'Wijchen', 'Nijmegen', 'Elst', 'Arnhem'];
  const KANA = { Rommel: 'ロンメル', Bergeijk: 'ベルヘイク', Valkenswaard: 'ファルケンスワールト', Eindhoven: 'アイントホーフェン', Son: 'ソン', StOdenrode: 'シント・オーデンローデ', Veghel: 'フェーヘル', Uden: 'ウーデン', Grave: 'グラーフェ', Wijchen: 'ワイヘン', Nijmegen: 'ナイメーヘン', Elst: 'エルスト', Arnhem: 'アルンヘム' };
  const GROUND = ['英第30軍団', '英近衛機甲師団', '英第11機甲師団', '英第50師団'];
  const AIR = ['米第101空挺師団', '米第82空挺師団', '英第1空挺師団'];
  const HEAVY = { Knaust: 'クナウスト戦闘団', '502P': '第502戦車部隊', '506P': '第506戦車部隊', '1P': '第107装甲旅団' };
  const idx = a => TRUNK.indexOf(a);
  const EN = () => root.MMLang && root.MMLang.lang !== 'ja';
  const X = s => root.MMLang.X(s);
  const R = (s, v) => { let o = X(s); for (const k in v || {}) o = o.split('{' + k + '}').join(v[k]); return o; };
  const HEAVY_EN = { Knaust: 'Kampfgruppe Knaust', '502P': 'The 502nd tank unit', '506P': 'The 506th tank unit', '1P': 'The 107th Panzer Brigade' };
  const titleCase = s => s.replace(/^[A-Z]+$/, m => m[0] + m.slice(1).toLowerCase());
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function replay(seed, answers) {
    const g = MM.newGame(seed);
    const ev = []; let prev = {}, started = false, startCtrl = null;
    const seen = new Set(); const peak = {};
    const snap = () => { const c = {}; TRUNK.forEach(a => { c[a] = g.S.ctrl[a]; }); return c; };
    const scan = () => {
      const card = g.S.cards, name = g.S.cur ? g.S.cur.name : '';
      const now = snap();
      TRUNK.forEach(a => { if (prev[a] && prev[a] !== now[a]) ev.push({ card, t: now[a] === 'A' ? 'gain' : 'loss', a, name }); });
      prev = now;
      Object.keys(HEAVY).forEach(n => {
        const st = g.S.u.find(x => g.UNIT[x.id].name === n);
        if (st && g.onMap(st) && !seen.has(n)) { seen.add(n); ev.push({ card, t: 'heavy', u: n }); }
      });
      const ag = g.here('Arnhem', 'G').length, aa = g.here('Arnhem', 'A').length;
      if (ag >= 5 && !peak.a5) { peak.a5 = 1; ev.push({ card, t: 'ag', n: ag, aa }); }
      if (ag >= 10 && !peak.a10) { peak.a10 = 1; ev.push({ card, t: 'ag', n: ag, aa }); }
      if (started && aa > 0 && aa <= 3 && !peak.b3) { peak.b3 = 1; ev.push({ card, t: 'aa', n: aa, ag }); }
      if (started && aa === 1 && !peak.b1) { peak.b1 = 1; ev.push({ card, t: 'aa', n: 1, ag }); }
      if (!peak.pol && g.S.u.some(x => g.UNIT[x.id].div === 'Pol' && g.onMap(x))) { peak.pol = 1; ev.push({ card, t: 'pol' }); }
    };
    const look = () => {
      const p = g.prompt; if (!p) return;
      if (p.kind === 'gamestart' && !started) { started = true; startCtrl = snap(); prev = startCtrl; }
      if (p.kind === 'next') scan();
    };
    look();
    for (const a of answers) { g.step(a); look(); }
    scan();
    return { g, ev, startCtrl: startCtrl || snap() };
  }

  function build(seed, answers) {
    const { g, ev, startCtrl } = replay(seed, answers);
    const S = g.S, AREA = g.AREA;
    if (EN()) return buildEn(g, ev, startCtrl, seed);
    const kn = a => KANA[a] || AREA[a].name;
    let r = (seed >>> 0) || 1;
    const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    const used = new Set();
    const once = (k, arr) => {
      const f = arr.filter((_, i) => !used.has(k + i)); const c = f.length ? f : arr;
      const t = c[Math.floor(rnd() * c.length)]; used.add(k + arr.indexOf(t)); return t;
    };
    const gainT = (list, e) => {
      const a = list.join('と');
      if (GROUND.includes(e.name)) return once('g', [`第30軍団に命令が下り、戦車の列が${a}へ入った。沿道の窓に、オレンジ色の布が揺れた。`, `第30軍団が${a}を押さえた。街道は、また少し北へ伸びた。`, `${a}が味方の手に戻った。無線の声が、少しだけ明るくなった。`]);
      if (AIR.includes(e.name)) return once('a', [`${e.name.replace('師団', '')}の兵たちが${a}を奪った。後続の戦車のために、道を空けておかなければならない。`, `空挺兵が${a}に踏み込んだ。背後から来るはずの戦車の音は、まだ聞こえない。`]);
      return `守りの手薄だった${a}が、味方の支配に入った。`;
    };
    const lossT = a => once('l', [`${a}を奪い返された。一本道は、一か所切られれば終わりだ。`, `「${a}を失った」。その報告に、幕僚たちは黙り込んだ。`, `守備隊の消えた${a}に、灰色の軍服が戻ってきた。`]);
    const items = []; const sg = new Set(), sl = new Set();
    ev.filter(e => (e.t === 'gain' || e.t === 'loss') && e.a !== 'Arnhem').sort((a, b) => a.card - b.card).forEach(e => {
      if (e.t === 'gain') {
        if (sg.has(e.a)) return; sg.add(e.a);
        const l = items[items.length - 1];
        if (l && l.t === 'gain' && l.card === e.card && l.name === e.name) l.list.push(kn(e.a));
        else items.push({ ...e, list: [kn(e.a)] });
      } else { if (sl.has(e.a)) return; sl.add(e.a); items.push(e); }
    });
    ev.forEach(e => { if (['heavy', 'ag', 'aa', 'pol'].includes(e.t)) items.push(e); });
    items.sort((a, b) => a.card - b.card);
    const text = e => {
      if (e.t === 'gain') return gainT(e.list, e);
      if (e.t === 'loss') return lossT(kn(e.a));
      if (e.t === 'heavy') return `${HEAVY[e.u]}が戦線に現れた。ビットリッヒの増援は途切れない。`;
      if (e.t === 'pol') return 'ポーランド第1空挺旅団が、ようやく空から降りてきた。';
      if (e.t === 'ag') return `アルンヘムのドイツ軍は${e.n}個部隊に増えていた。立てこもる空挺は${e.aa}個部隊。`;
      return e.n === 1 ? `アルンヘムの空挺は、最後の1個部隊になった。周りには${e.ag}個部隊のドイツ軍がいる。` : `アルンヘムの空挺は${e.n}個部隊まで減った。第30軍団は、まだ来ない。`;
    };
    const chunk = arr => { const o = []; for (let i = 0; i < arr.length; i += 3) o.push(arr.slice(i, i + 3).map(text).join('')); return o; };
    const dead = side => S.u.filter(x => x.loc === 'dead' && g.UNIT[x.id].side === side).length;
    const dA = dead('A'), dG = dead('G');
    let far = 0; for (let i = 0; i < TRUNK.length; i++) { if (S.ctrl[TRUNK[i]] === 'A') far = i; else break; }
    const dropped = TRUNK.filter(a => startCtrl[a] === 'A' && idx(a) > 1).map(kn);
    const ch = [];
    ch.push({ h: '空から', p: [`九月の空が、白い傘で埋まった。アーカート少将の英第1空挺師団はアルンヘムへ、ギャビン准将の第82空挺師団はナイメーヘンへ、テイラー少将の第101空挺師団はフェーヘルへ。${dropped.length ? `降下の日のうちに、${dropped.join('、')}に味方が立った。` : ''}`, '街道の南端では、ホロックス中将の第30軍団がエンジンをかけている。ここから北へ、一本道。アルンヘムの橋まで行けば戦争は年内に終わる。誰もがそう信じていた。'] });
    const mid = Math.floor(S.cards / 2);
    const a1 = chunk(items.filter(e => e.card <= mid)), a2 = chunk(items.filter(e => e.card > mid));
    if (a1.length) ch.push({ h: '一本道', p: a1 });
    const waves = S.cycle - 1;
    const p2 = (waves > 0 ? [`ドイツ軍の増援の波は、${waves}度にわたって戦線へ流れ込んだ。`] : []).concat(a2);
    if (p2.length) ch.push({ h: '橋はまだ遠い', p: p2 });
    if (S.over && S.over.r === 'win') {
      const aa = g.here('Arnhem', 'A').filter(x => g.UNIT[x.id].div === '1A').length;
      ch.push({ h: '橋の上で', p: [`第30軍団の先頭が、アルンヘムの橋に達した。${aa ? `橋のたもとで待っていた空挺は${aa}個部隊。` : '橋のたもとに、迎える空挺の姿はなかった。'}`, `連合軍が失った部隊は${dA}、除去したドイツ軍は${dG}。`, '史実では届かなかった橋に、この戦いでは戦車が届いた。モントゴメリーの賭けは当たった。'] });
    } else {
      const arn = S.over && S.over.why.includes('ARNHEM');
      ch.push({ h: 'モントゴメリーの憂鬱', p: [`そして、終わりは来た。${arn ? 'アルンヘムの無線は、もう応えない。' : '増援は尽き、橋は遠いままだった。'}`, `連合軍が切れ目なく押さえた街道は${kn(TRUNK[far])}まで。${arn && far === 11 ? '橋まで、あと1エリアだった。' : ''}連合軍は${dA}個部隊を失い、ドイツ軍の${dG}個部隊を除去した。`, 'モントゴメリーは後に、この作戦を「90パーセントの成功」と呼んだという。橋の上で戦った者たちがその数字をどう聞いたかは、書き残すまでもない。'] });
    }
    const counts = {};
    Object.keys(AREA).forEach(a => { if (!AREA[a].off) counts[a] = [g.here(a, 'A').length, g.here(a, 'G').length]; });
    const ctrl = {}; Object.keys(AREA).forEach(a => { ctrl[a] = S.ctrl[a]; });
    return { seed, win: !!(S.over && S.over.r === 'win'), ch, dA, dG, areas: Object.keys(AREA).filter(a => !AREA[a].off && S.ctrl[a] === 'A').length, trunk: TRUNK.map(a => ({ a, name: kn(a), on: S.ctrl[a] === 'A' })), counts, ctrl, pos: AREA };
  }

  function buildEn(g, ev, startCtrl, seed) {
    const S = g.S, AREA = g.AREA;
    const kn = a => titleCase(AREA[a].name);
    let r = (seed >>> 0) || 1;
    const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    const used = new Set();
    const once = (k, arr) => {
      const f = arr.filter((_, i) => !used.has(k + i)); const c = f.length ? f : arr;
      const t = c[Math.floor(rnd() * c.length)]; used.add(k + arr.indexOf(t)); return t;
    };
    const AIRNAME = { '米第101空挺師団': 'the US 101st Airborne', '米第82空挺師団': 'the US 82nd Airborne', '英第1空挺師団': 'the British 1st Airborne' };
    const gainT = (list, e) => {
      const a = list.join(R(" and "));
      if (GROUND.includes(e.name)) return once('g', [R("XXX Corps got its orders, and a column of tanks rolled into {a}. Orange cloth fluttered from the windows along the road.", { a }), R("XXX Corps secured {a}. The road reached a little further north.", { a }), R("{a} was back in friendly hands. The voices on the radio brightened a little.", { a })]);
      if (AIR.includes(e.name)) return once('a', [R("Men of {d} seized {a}. The road had to stay open for the tanks behind them.", { a, d: X(AIRNAME[e.name]) }), R("Paratroopers pushed into {a}. The sound of the tanks that should have been behind them still could not be heard.", { a })]);
      return R("{a}, lightly held, came under Allied control.", { a });
    };
    const lossT = a => once('l', [R("{a} was retaken. On a single road, one cut is enough.", { a }), R("\"We have lost {a}.\" The staff officers fell silent at the report.", { a }), R("The garrison at {a} was gone, and field grey returned to its streets.", { a })]);
    const items = []; const sg = new Set(), sl = new Set();
    ev.filter(e => (e.t === 'gain' || e.t === 'loss') && e.a !== 'Arnhem').sort((a, b) => a.card - b.card).forEach(e => {
      if (e.t === 'gain') {
        if (sg.has(e.a)) return; sg.add(e.a);
        const l = items[items.length - 1];
        if (l && l.t === 'gain' && l.card === e.card && l.name === e.name) l.list.push(kn(e.a));
        else items.push({ ...e, list: [kn(e.a)] });
      } else { if (sl.has(e.a)) return; sl.add(e.a); items.push(e); }
    });
    ev.forEach(e => { if (['heavy', 'ag', 'aa', 'pol'].includes(e.t)) items.push(e); });
    items.sort((a, b) => a.card - b.card);
    const text = e => {
      if (e.t === 'gain') return gainT(e.list, e);
      if (e.t === 'loss') return lossT(kn(e.a));
      if (e.t === 'heavy') return R("{u} appeared at the front. Bittrich's reinforcements kept coming.", { u: X(HEAVY_EN[e.u]) });
      if (e.t === 'pol') return R("The Polish 1st Airborne Brigade came down from the sky at last.");
      if (e.t === 'ag') return R("German strength at Arnhem had grown to {n} units, against {m} airborne units holding out.", { n: e.n, m: e.aa });
      return e.n === 1 ? R("The airborne at Arnhem were down to their last unit, surrounded by {n} German units.", { n: e.ag }) : R("The airborne at Arnhem were down to {n} units. XXX Corps had still not come.", { n: e.n });
    };
    const chunk = arr => { const o = []; for (let i = 0; i < arr.length; i += 3) o.push(arr.slice(i, i + 3).map(text).join(root.MMLang.lang === 'zh' ? '' : ' ')); return o; };
    const dead = side => S.u.filter(x => x.loc === 'dead' && g.UNIT[x.id].side === side).length;
    const dA = dead('A'), dG = dead('G');
    let far = 0; for (let i = 0; i < TRUNK.length; i++) { if (S.ctrl[TRUNK[i]] === 'A') far = i; else break; }
    const dropped = TRUNK.filter(a => startCtrl[a] === 'A' && idx(a) > 1).map(kn);
    const ch = [];
    ch.push({ h: R("From the Sky"), p: [R("The September sky filled with white parachutes. Urquhart's British 1st Airborne made for Arnhem, Gavin's 82nd for Nijmegen, Taylor's 101st for Veghel.") + (dropped.length ? ' ' + R("By the end of the day, friendly troops stood at {a}.", { a: dropped.join(R(", ")) }) : ''), R("At the southern end of the road, Horrocks's XXX Corps started its engines. North from here, one road. Reach the bridge at Arnhem and the war would be over by the end of the year. Everyone believed it.")] });
    const mid = Math.floor(S.cards / 2);
    const a1 = chunk(items.filter(e => e.card <= mid)), a2 = chunk(items.filter(e => e.card > mid));
    if (a1.length) ch.push({ h: R("One Road"), p: a1 });
    const waves = S.cycle - 1;
    const p2 = (waves > 0 ? [waves > 1 ? R("German reinforcements poured into the line in {n} waves.", { n: waves }) : R("German reinforcements poured into the line in one wave.")] : []).concat(a2);
    if (p2.length) ch.push({ h: R("A Bridge Too Far"), p: p2 });
    if (S.over && S.over.r === 'win') {
      const aa = g.here('Arnhem', 'A').filter(x => g.UNIT[x.id].div === '1A').length;
      ch.push({ h: R("On the Bridge"), p: [R("The head of XXX Corps reached the bridge at Arnhem.") + ' ' + (aa > 1 ? R("{n} airborne units were waiting at its foot.", { n: aa }) : aa ? R("One airborne unit was waiting at its foot.") : R("No airborne troops were left at its foot to meet them.")), R("The Allies lost {a} units and eliminated {g} German units.", { a: dA, g: dG }), R("In history the tanks never reached that bridge. In this battle they did. Montgomery's gamble paid off.")] });
    } else {
      const arn = S.over && S.over.why.includes('ARNHEM');
      ch.push({ h: R("Monty's Melancholy"), p: [R("And then the end came.") + ' ' + (arn ? R("The radio at Arnhem no longer answered.") : R("The reinforcements ran out, and the bridge stayed far away.")), R("The unbroken stretch of road held by the Allies ended at {a}.", { a: kn(TRUNK[far]) }) + ' ' + (arn && far === 11 ? R("The bridge was one area away.") + ' ' : '') + R("The Allies lost {a} units and eliminated {g} German units.", { a: dA, g: dG }), R("Montgomery is said to have later called the operation \"90 percent successful\". What the men on the bridge made of that number needs no recording.")] });
    }
    const counts = {};
    Object.keys(AREA).forEach(a => { if (!AREA[a].off) counts[a] = [g.here(a, 'A').length, g.here(a, 'G').length]; });
    const ctrl = {}; Object.keys(AREA).forEach(a => { ctrl[a] = S.ctrl[a]; });
    return { seed, win: !!(S.over && S.over.r === 'win'), ch, dA, dG, areas: Object.keys(AREA).filter(a => !AREA[a].off && S.ctrl[a] === 'A').length, trunk: TRUNK.map(a => ({ a, name: kn(a), on: S.ctrl[a] === 'A' })), counts, ctrl, pos: AREA };
  }

  function loadUri() {
    return new Promise((res, rej) => {
      if (root.MM_MAP_URI) return res(root.MM_MAP_URI);
      const s = document.createElement('script'); s.src = EN() ? `img/${root.MMLang.lang}/map_b64.js` : 'img/map_b64.js';
      s.onload = () => res(root.MM_MAP_URI); s.onerror = rej; document.head.appendChild(s);
    });
  }
  // draws the final map; returns a JPEG data URL. The map comes from a data URI so saving also works from file://
  async function renderMap(d) {
    const uri = await loadUri();
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = uri; });
    const W = 1457, H = 2064, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
    for (const a in MM_REGIONS) {
      if (!d.pos[a] || d.pos[a].off || d.ctrl[a] !== 'A') continue;
      x.beginPath();
      MM_REGIONS[a].split(' ').forEach((p, i) => { const [px, py] = p.split(',').map(Number); if (i) x.lineTo(px, py); else x.moveTo(px, py); });
      x.closePath(); x.fillStyle = 'rgba(40,110,255,.48)'; x.fill(); x.lineWidth = 6; x.strokeStyle = '#0b3fc4'; x.stroke();
    }
    x.lineCap = 'round';
    for (let i = 0; i < TRUNK.length - 1; i++) {
      const a = d.pos[TRUNK[i]], b = d.pos[TRUNK[i + 1]], ok = d.ctrl[TRUNK[i]] === 'A' && d.ctrl[TRUNK[i + 1]] === 'A';
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.setLineDash(ok ? [] : [22, 18]); x.lineWidth = 13; x.strokeStyle = ok ? '#00d0ff' : '#ff2a1a'; x.stroke();
    }
    x.setLineDash([]);
    const dot = (px, py, n, col) => {
      x.beginPath(); x.arc(px, py, 27, 0, 7); x.fillStyle = col; x.fill(); x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke();
      x.fillStyle = '#fff'; x.font = 'bold 31px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), px, py + 1);
    };
    for (const a in d.counts) {
      const [na, ng] = d.counts[a], p = d.pos[a];
      if (na) dot(p.x - (ng ? 26 : 0), p.y, na, '#0b3fc4');
      if (ng) dot(p.x + (na ? 26 : 0), p.y, ng, '#b3120a');
    }
    const o = document.createElement('canvas'); o.width = 1000; o.height = Math.round(1000 * H / W);
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
    return o.toDataURL('image/jpeg', 0.85);
  }
  const W = (j, e) => (EN() ? X(e) : j);
  const legend = () => W('青: 連合軍の支配エリア / 水色: つながった幹線道路 / 赤の破線: 切れた幹線道路 / 丸の数字: 青は連合軍、赤はドイツ軍の駒数', 'Blue: Allied-controlled areas / Light blue: connected highway / Red dashes: broken highway / Circles: units, blue Allied, red German');
  const resultWord = d => (d.win ? W('連合軍の勝利', 'Allied Victory') : W('連合軍の敗北', 'Allied Defeat'));
  const statsRows = d => `<tr><td>${W('連合軍の除去された駒', 'Allied units eliminated')}</td><td>${d.dA}</td></tr><tr><td>${W('ドイツ軍の除去された駒', 'German units eliminated')}</td><td>${d.dG}</td></tr><tr><td>${W('連合軍の支配エリア', 'Allied-controlled areas')}</td><td>${d.areas}</td></tr>`;
  const body = d => d.ch.map(c => `<h2>${esc(c.h)}</h2>` + c.p.map(t => `<p>${esc(t)}</p>`).join('')).join('');
  function oneFile(d, map) {
    const strip = d.trunk.map(t => `<span class="${t.on ? 'on' : 'off'}">${esc(t.name)}</span>`).join('');
    return `<!doctype html><html lang="${root.MMLang ? root.MMLang.lang : 'ja'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${W('モントゴメリーの憂鬱 戦闘報告', "Monty's Melancholy: After-Action Report")}</title><style>
:root{--ink:#2a2418;--paper:#f3ecd9;--acc:#8a2a14}*{box-sizing:border-box}body{margin:0;background:#3b3a30;color:var(--ink);font:18px/1.95 ${EN() ? 'serif' : "'Hiragino Mincho ProN','Yu Mincho',serif"}}
main{max-width:1000px;margin:0 auto;background:var(--paper);padding:34px 44px 44px}h1{margin:0;font-size:2em;line-height:1.3;letter-spacing:.06em}.sub{color:#6d6350;margin:2px 0 14px;font-size:.92em}
.res{display:inline-block;background:${d.win ? '#14532d' : 'var(--acc)'};color:#fff;padding:2px 16px;border-radius:3px;font-weight:bold;letter-spacing:.2em}
h2{font-size:1.2em;margin:26px 0 4px;border-bottom:2px solid var(--acc);color:var(--acc);padding-bottom:2px}p{margin:.3em 0;text-indent:1em}
img{display:block;width:100%;height:auto;margin:14px 0 6px}.leg{font:13px/1.6 ${EN() ? 'sans-serif' : "'Hiragino Kaku Gothic ProN',sans-serif"};color:#4a4436}
.strip{display:flex;flex-wrap:wrap;gap:3px;font:13px/1.5 ${EN() ? 'sans-serif' : "'Hiragino Kaku Gothic ProN',sans-serif"};margin:8px 0}.strip span{padding:1px 7px;border-radius:2px}.on{background:#0b3fc4;color:#fff}.off{background:#d9cfb6;color:#6d6350}
table{border-collapse:collapse;font:14px/1.6 ${EN() ? 'sans-serif' : "'Hiragino Kaku Gothic ProN',sans-serif"};margin:8px 0}td{padding:2px 16px 2px 0;border-bottom:1px solid #cfc4a8}td:last-child{font-weight:bold}
@media (max-width:640px){main{padding:18px 16px}body{font-size:16px}}</style></head><body><main>
<h1>${W('モントゴメリーの憂鬱', "Monty's Melancholy")}</h1><div class="sub">${W('戦闘報告 ― マーケット・ガーデン作戦', 'After-Action Report: Operation Market Garden')}</div><span class="res">${resultWord(d)}</span>
<div class="strip">${strip}</div>${map ? `<img src="${map}" alt="${W('終了時の地図', 'Final map')}"><div class="leg">${legend()}</div>` : ''}
<table>${statsRows(d)}</table>${body(d)}</main></body></html>`;
  }
  function blogText(d) {
    return `<h2>${W('モントゴメリーの憂鬱 戦闘報告', "Monty's Melancholy: After-Action Report")}</h2>\n<p><b>${resultWord(d)}</b></p>\n<p>${W('幹線道路で支配を保ったエリア', 'Highway areas held')}: ${d.trunk.filter(t => t.on).map(t => esc(t.name)).join(EN() ? R(', ') : '、')}</p>\n<p><img src="report_map.jpg" alt="${W('終了時の地図', 'Final map')}" style="max-width:100%;height:auto"></p>\n<p>${legend()}</p>\n<table>${statsRows(d)}</table>\n${body(d)}\n`;
  }
  const api = { build, renderMap, oneFile, blogText };
  if (typeof module !== 'undefined') module.exports = api;
  root.MMReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
