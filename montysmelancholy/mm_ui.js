// Monty's Melancholy: browser UI
(function () {
  const $ = id => document.getElementById(id);
  const SAVE = 'mm_save_v8', PREF = 'mm_pref_v1';
  const CELL = 59, CS = 46; // atlas cell, counter size on map
  const TRACK = [817, 914, 1010, 1107, 1204, 1300].map(x => 2064 - x);
  let G = null, zoom = 0, UI = null, readUpto = 0, rolledN = 0, fast = false;

  function loadPref() { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch (e) { return {}; } }
  function savePref(p) { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (e) { /* ignore */ } }
  const pref = loadPref();
  if (pref.fs) document.documentElement.style.setProperty('--fs', pref.fs + 'px');

  function save() { try { localStorage.setItem(SAVE, JSON.stringify({ seed: G.S.seed, answers: G.answers })); } catch (e) { /* ignore */ } }
  function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE)); } catch (e) { return null; } }

  const bgStyle = (el, idx, size) => {
    const cols = G.DATA.atlas.cols, k = size / CELL;
    const rows = Math.ceil(G.DATA.units.length * 2 / cols) + 1;
    el.style.backgroundImage = 'url(img/units.jpg)';
    el.style.backgroundSize = (cols * size) + 'px auto';
    el.style.backgroundPosition = (-(idx % cols) * size) + 'px ' + (-Math.floor(idx / cols) * size) + 'px';
    el.dataset.k = k + rows;
  };
  const face = st => { const u = G.UNIT[st.id]; return st.back && u.bi !== null ? u.bi : u.fi; };
  function addMark(el, st) {
    if (!st.mark) return;
    const m = document.createElement('div'); m.className = 'mk'; m.textContent = '防';
    el.appendChild(m);
  }
  const nm = a => G.AREA[a] ? G.AREA[a].name : a;
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ------- hover -------
  const HOVER_SIZE = 96, HOVER_SMALL = 72;
  function hoverAt(ev) {
    const t = $('tip');
    const r = t.getBoundingClientRect();
    let x = ev.clientX + 16, y = ev.clientY + 12;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 16;
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  }
  function unitLine(st) {
    const u = G.UNIT[st.id];
    const vals = st.back ? `消耗(防御${u.back})` : `攻撃${u.a} 防御${u.d} 移動${u.m}`;
    const kind = [u.tank ? '戦車' : '', u.white ? '渡河可' : '', u.hq ? '司令部' : '', u.at ? '対戦車' : '', u.bridge ? '架橋' : '', st.mark ? '防御態勢' : ''].filter(Boolean).join('・');
    return `<b>${esc(u.name)}</b> ${esc(vals)}${kind ? ' ・ ' + esc(kind) : ''}` + (u.side === 'A' && G.onMap(st) && !G.supplied(st.id) ? ' <span class="tipbad">補給切れ</span>' : '');
  }
  function showUnits(list, ev) {
    if (!list.length) return hideTip();
    const t = $('tip'); t.innerHTML = '';
    if (list.length > 5) {
      const wrap = document.createElement('div'); wrap.className = 'tipgrid';
      list.forEach(st => {
        const c = document.createElement('div'); c.className = 'tipct';
        c.style.width = c.style.height = HOVER_SMALL + 'px';
        bgStyle(c, face(st), HOVER_SMALL);
        addMark(c, st);
        wrap.appendChild(c);
      });
      t.appendChild(wrap);
      t.style.display = 'block';
      hoverAt(ev);
      return;
    }
    list.forEach(st => {
      const row = document.createElement('div'); row.className = 'tiprow';
      const c = document.createElement('div'); c.className = 'tipct';
      c.style.width = c.style.height = HOVER_SIZE + 'px';
      bgStyle(c, face(st), HOVER_SIZE);
      addMark(c, st);
      const i = document.createElement('div'); i.innerHTML = unitLine(st);
      row.append(c, i); t.appendChild(row);
    });
    t.style.display = 'block';
    hoverAt(ev);
  }
  function showCard(src, ev) {
    const t = $('tip');
    t.innerHTML = `<img class="tipcard" src="${src}" alt="札">`;
    t.style.display = 'block';
    hoverAt(ev);
  }
  function hideTip() { $('tip').style.display = 'none'; }
  function attachHover(el, fn) {
    el.addEventListener('mouseenter', ev => fn(ev));
    el.addEventListener('mousemove', hoverAt);
    el.addEventListener('mouseleave', hideTip);
  }

  // ------- start -------
  let endTimer = null;
  function hideEnd() { clearTimeout(endTimer); $('end').style.display = 'none'; $('rp').style.display = 'none'; }
  function showEnd() {
    const o = G.S.over; if (!o) return;
    const e = $('end'); e.className = o.r;
    $('endT').textContent = o.r === 'win' ? '連合軍の勝利' : '連合軍の敗北';
    $('endW').textContent = o.why;
    e.style.display = 'flex';
    clearTimeout(endTimer);
    endTimer = setTimeout(openReport, 3500);
  }
  let rpData = null;
  async function openReport() {
    clearTimeout(endTimer);
    $('end').style.display = 'none';
    const rp = $('rp'); rp.style.display = 'flex';
    $('rpBlogBox').style.display = 'none';
    if (!rpData) {
      const data = MMReport.build(G.S.seed, G.answers);
      let map = null;
      try { map = await MMReport.renderMap(data); } catch (e) { map = null; }
      rpData = { data, map };
    }
    $('rpFrame').srcdoc = MMReport.oneFile(rpData.data, rpData.map);
  }
  function saveFile(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const stamp = () => 'monty_report_' + G.S.seed;
  function blogBox() {
    const box = $('rpBlogBox'); box.style.display = 'block';
    const text = MMReport.blogText(rpData.data);
    box.innerHTML = `<div>本文 ${text.length.toLocaleString()}文字。画像を先にアップロードし、本文の「report_map.jpg」を画像のURLに置き換えます。</div><div class="row"></div>`;
    const row = box.querySelector('.row');
    const add = (t, f, dis) => { const b = document.createElement('button'); b.textContent = t; b.disabled = !!dis; b.onclick = f; row.appendChild(b); return b; };
    add('本文をコピー', async ev => {
      try { await navigator.clipboard.writeText(text); ev.target.textContent = 'コピーしました'; }
      catch (e) { ev.target.textContent = 'コピーできません。保存を使ってください'; }
    });
    add('本文を保存', () => saveFile('report_blog.html', new Blob([text], { type: 'text/html' })));
    add('地図の画像を保存', () => { const a = document.createElement('a'); a.href = rpData.map; a.download = 'report_map.jpg'; document.body.appendChild(a); a.click(); a.remove(); }, !rpData.map);
  }
  // the setup is announced one stage at a time: XXX Corps, then each airborne division
  const STAGES = [
    { key: '第30', title: '英第30軍団', text: () => '第30軍団の駒を Rommel か Bergeijk に置きます。Rommel に1駒も残さないと補給が切れます。' },
    { key: '英第1空挺', title: '英第1空挺師団', text: () => 'Arnhem の周りに降下します。まず司令部を置き、次に駒を置きます。' },
    { key: '米第82空挺', title: '米第82空挺師団', text: () => 'Nijmegen の周りに降下します。まず司令部を置き、次に駒を置きます。' },
    { key: '米第101空挺', title: '米第101空挺師団', text: () => 'Veghel の周りに降下します。まず司令部を置き、次に駒を置きます。' },
  ];
  let lastStage = -1, askLang = false;
  const langOpen = () => $('lg').style.display === 'flex';
  // true while the stage notice is up: the setup panel waits for it
  function showStage() {
    const p = G.prompt;
    if (!p || p.kind !== 'setup' || langOpen()) return false;
    const i = STAGES.findIndex(s => p.title.includes(s.key));
    if (i < 0 || i === lastStage) return false;
    lastStage = i;
    $('stBig').textContent = i === 0 ? '初期配置を始めます' : '';
    $('stBig').style.display = i === 0 ? '' : 'none';
    $('stNo').textContent = `初期配置 ${i + 1}/${STAGES.length}`;
    $('stT').textContent = STAGES[i].title;
    $('stTx').textContent = STAGES[i].text();
    $('st').style.display = 'flex';
    return true;
  }
  function openSetupIfNeeded() {
    const p = G.prompt;
    if (p && p.kind === 'setup' && !p.hq) openSetup();
    focusMap();
  }
  function start(seed, answers) {
    hideEnd(); rpData = null; lastStage = -1; $('st').style.display = 'none';
    G = answers ? MM.restore(seed, answers) : MM.newGame(seed);
    UI = { orders: [], sel: new Set(), area: null, mode: null, dmg: {}, restored: !!answers };
    readUpto = 0; rolledN = 0;
    closePop();
    afterStep();
  }
  function answer(a) {
    hideTip();
    G.step(a);
    // results are already in the log and on the map: no second confirmation
    while (G.prompt && G.prompt.kind === 'battleEnd') G.step({});
    save();
    UI.orders = []; UI.sel = new Set(); UI.mode = null; UI.err = null; UI.dmg = {}; UI.dmgErr = null; UI.area = null;
    closePop();
    afterStep();
  }
  function afterStep() {
    const p = G.prompt;
    if (p && p.kind === 'setup') UI.sel = new Set();
    if (p && p.kind === 'air') { UI.sel = new Set(); openAir(); }
    render();
    renderBattle();
    $('gs').style.display = p && p.kind === 'gamestart' ? 'flex' : 'none';
    if (!p && G.S.over && !UI.restored) showEnd();
    if (showStage()) { focusMap(); return; }
    openSetupIfNeeded();
  }
  // scrolls the map to the areas the current prompt is about
  function focusAreas() {
    const p = G.prompt; if (!p) return [];
    const locs = ids => ids.map(i => G.S.u[i].loc);
    switch (p.kind) {
      case 'alloc': return locs(p.elig);
      case 'gstart': return locs(p.units);
      case 'rein': return locs(p.units);
      case 'battle': case 'battleEnd': return [p.area];
      case 'order': return p.areas;
      case 'retreat': return p.options;
      case 'setup': return p.legal;
      case 'next': return G.S.moves.map(m => m.to);
      default: return [];
    }
  }
  function focusMap() {
    const pts = focusAreas().map(a => G.AREA[a]).filter(Boolean);
    const left = $('left');
    if (!pts.length || !left.scrollTo) return;
    const z = zoom || fit();
    const xs = pts.map(a => a.x), ys = pts.map(a => a.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    left.scrollTo({ left: cx * z - left.clientWidth / 2, top: cy * z - left.clientHeight / 2, behavior: 'smooth' });
  }
  function picked() {
    const p = G.prompt;
    if (p && p.kind === 'gstart') return { ids: new Set(p.units), cls: 'pickg' };
    if (p && p.kind === 'rein') return { ids: new Set(p.units), cls: 'pickg' };
    if (p && p.kind === 'alloc') {
      const taken = new Set(UI.orders.map(o => o.id));
      return { ids: new Set(p.elig.filter(i => !taken.has(i))), cls: 'pick' };
    }
    return { ids: new Set(), cls: '' };
  }

  // ------- render -------
  function render() { renderStat(); renderCards(); renderMap(); renderLog(); renderOps(); }
  function renderStat() {
    const S = G.S;
    const cupA = S.u.filter(x => x.loc === 'cupA').length, cupG = S.u.filter(x => x.loc === 'cupG').length;
    $('stat').textContent = `札 ${S.cards}枚目 ・ 山札 ${S.deck.length} ・ ${S.cycle}巡目 ・ 増援カップ 連合${cupA} / 独${cupG}`;
  }
  const cardImg = n => (MMLang.lang !== 'ja' ? `img/${MMLang.lang}/${n}.jpg` : `img/${n}.jpg`);
  function renderCards() {
    const S = G.S;
    const atDeck = !S.cur || S.deck.length === G.DATA.deck.length; // deck is full: nothing drawn since the reshuffle
    const cur = !atDeck ? `<figure><img src="${cardImg(S.cur.img)}" alt="${esc(S.cur.name)}">この札</figure>` : `<figure><img src="img/back.jpg" alt="山札">山札</figure>`;
    const prev = S.jcard && !atDeck ? `<figure><img src="${cardImg(S.jcard.img)}" alt="${esc(S.jcard.name)}">1枚前(判定)</figure>` : `<figure><div class="deck">山札の最初</div>1枚前(判定)</figure>`;
    $('cards').innerHTML = cur + prev;
    $('cards').querySelectorAll('img').forEach(im => attachHover(im, ev => showCard(im.getAttribute('src'), ev)));
  }
  function areaBox(id) {
    const a = G.AREA[id];
    if (a.off) return { w: 100, h: 100 };
    return a.city ? { w: 112, h: 112 } : { w: 96, h: 96 };
  }
  function stackAt(layer, list, cx, cy, plan, clk) {
    const n = list.length;
    if (!n) return;
    const pk = picked();
    const show = [...list].sort((a, b) => (a.mark - b.mark) || (pk.ids.has(a.id) - pk.ids.has(b.id))).slice(-5);
    const off = 7;
    const w = CS + off * (show.length - 1);
    show.forEach((st, i) => {
      const d = document.createElement('div');
      d.className = 'ct' + (pk.ids.has(st.id) ? ' ' + pk.cls : '');
      d.style.width = d.style.height = CS + 'px';
      bgStyle(d, face(st), CS);
      d.style.left = (cx - w / 2 + i * off) + 'px';
      d.style.top = (cy - CS / 2 - i * off / 2) + 'px';
      addMark(d, st);
      attachHover(d, ev => showUnits(list, ev));
      if (clk) d.onclick = ev => { ev.stopPropagation(); hideTip(); clk(ev); };
      const o = plan && plan.get(st.id);
      if (o) { const t = document.createElement('div'); t.className = 'ord'; t.textContent = ({ move: '移', moveattack: '移攻', attack: '攻', recover: '回' })[o.act]; d.appendChild(t); }
      layer.appendChild(d);
    });
    if (n > 1) {
      const c = document.createElement('div');
      c.className = 'cnt'; c.textContent = n;
      attachHover(c, ev => showUnits(list, ev));
      if (clk) c.onclick = ev => { ev.stopPropagation(); hideTip(); clk(ev); };
      c.style.left = (cx + w / 2 - 12) + 'px';
      c.style.top = (cy - CS / 2 - show.length * off / 2 - 10) + 'px';
      layer.appendChild(c);
    }
  }
  function highlight() {
    const p = G.prompt; const out = { can: {}, can2: {}, elig: new Set(), click: null };
    if (!p) return out;
    if (p.kind === 'setup') p.legal.forEach(a => { out.can[a] = ''; });
    if (p.kind === 'retreat') p.options.forEach(a => { out.can[a] = ''; });
    if (p.kind === 'order') p.areas.forEach(a => { out.can[a] = ''; });
    if (p.kind === 'drop') p.legal.forEach(a => { out.can[a] = ''; });
    if (p.kind === 'gstart' || p.kind === 'rein') out.gsel = new Set(p.units.map(i => G.S.u[i].loc));
    if (p.kind === 'alloc') {
      const taken = new Set(UI.orders.map(o => o.id));
      p.elig.forEach(i => { if (!taken.has(i)) out.elig.add(G.S.u[i].loc); });
      if (UI.mode) {
        const ms = moveSet();
        for (const a in ms) { (ms[a].cross ? out.can2 : out.can)[a] = fmt(ms[a].cost); }
      }
    }
    return out;
  }
  const fmt = c => (c === 0.5 ? '½' : c % 1 ? Math.floor(c) + '½' : String(c));
  const movers = () => [...UI.sel].filter(i => !G.S.u[i].back && G.UNIT[i].m > 0);
  function moveSet(mode) {
    mode = mode || UI.mode;
    const ids = movers();
    if (!ids.length) return {};
    let res = null;
    for (const i of ids) {
      const m = G.legalMoves(i);
      if (res === null) res = { ...m };
      else {
        for (const a in res) {
          if (!m[a]) delete res[a];
          else res[a] = { cost: Math.max(res[a].cost, m[a].cost), cross: res[a].cross || m[a].cross, needBridge: res[a].needBridge || m[a].needBridge };
        }
      }
    }
    if (mode === 'moveattack') for (const a in res) if (res[a].cross) delete res[a];
    return res || {};
  }
  const regions = {};
  function regionEl(id) {
    if (typeof MM_REGIONS === 'undefined' || !MM_REGIONS[id]) return null;
    if (!regions[id]) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      el.setAttribute('points', MM_REGIONS[id]);
      el.setAttribute('data-rg', id);
      el.addEventListener('click', ev => { ev.stopPropagation(); clickArea(id, ev); });
      $('rgs').appendChild(el);
      regions[id] = el;
    }
    return regions[id];
  }
  // why the selected units cannot go to this area
  function whyNot(to) {
    const ids = movers();
    if (!ids.length) return '駒が選ばれていない。';
    const st = G.S.u[ids[0]], u = G.UNIT[ids[0]], from = st.loc;
    const dest = nm(to);
    const e = G.EDGE[from] && G.EDGE[from][to];
    if (from === to) return '今いるエリアです。移動先を押すか「移動をやめる」を押す。';
    if (G.AREA[to].off) return `${dest} は盤外なので入れない。`;
    if (!e) return `${nm(from)} から ${dest} へは道路でつながっていないか、移動力が足りない。緑か橙のエリアだけ選べる。`;
    if (e.corps) return `${nm(from)} と ${dest} の間は軍団戦区境で、越えられない。`;
    if (e.k !== 'P' && !u.white) return `${dest} へは河川を渡る。戦車は、架橋部隊が同じエリアにいて道路がある場合だけ渡れる。`;
    if (e.k === 'M' && !e.road) return `${dest} へは大河を渡る。道路のない所は渡れない。`;
    if (UI.mode === 'moveattack' && G.legalMoves(ids[0])[to]) return '渡河のときは移動+攻撃ができない。「移動」を使う。';
    return `${dest} へは移動力が足りないか、ルール上入れない。`;
  }
  function noMoveReason(sel) {
    const st = sel[0], u = G.UNIT[st.id];
    const nb = Object.keys(G.EDGE[st.loc]).filter(b => !G.AREA[b].off && !G.EDGE[st.loc][b].corps);
    if (!u.white && nb.length && nb.every(b => G.EDGE[st.loc][b].k !== 'P' && G.S.ctrl[b] !== 'A')) return `${nm(st.loc)} の周りは河川で、戦車は架橋部隊なしで渡れない。先に歩兵で対岸を取る。`;
    if (sel.length > 1) return '選んだ駒に共通の移動先がない。駒を減らす。';
    return 'この駒には移動先がない。';
  }
  function renderMap() {
    const layer = $('layer'); layer.innerHTML = '';
    const S = G.S; const hl = highlight();
    const plan = new Map(UI.orders.map(o => [o.id, o]));
    for (const id in G.AREA) {
      const a = G.AREA[id]; const b = areaBox(id);
      const d = document.createElement('div');
      d.className = 'ar' + (a.city ? ' city' : '');
      d.style.left = (a.x - b.w / 2) + 'px'; d.style.top = (a.y - b.h / 2) + 'px';
      d.style.width = b.w + 'px'; d.style.height = b.h + 'px';
      d.dataset.area = id;
      let cls = '';
      if (hl.can[id] !== undefined) cls = 'can';
      else if (hl.can2[id] !== undefined) cls = 'can2';
      else if (hl.elig.has(id)) cls = 'elig';
      else if (hl.gsel && hl.gsel.has(id)) cls = 'gsel';
      if (UI.area === id) cls += ' sel';
      const rg = regionEl(id);
      if (rg) rg.setAttribute('class', 'rg ' + cls);
      else if (cls) d.className += ' ' + cls;
      const cost = hl.can[id] !== undefined ? hl.can[id] : hl.can2[id];
      if (cost) { const c = document.createElement('span'); c.className = 'cost'; c.textContent = cost; d.appendChild(c); }
      if (!a.off && S.ctrl[id] === 'A') { const c = document.createElement('span'); c.className = 'ctl'; c.textContent = '連'; d.appendChild(c); }
      d.onclick = ev => { ev.stopPropagation(); clickArea(id, ev); };
      layer.appendChild(d);
      const al = G.here(id, 'A'), ge = G.here(id, 'G');
      const go = ev => clickArea(id, ev);
      if (id === 'Arnhem' && al.length && ge.length) {
        stackAt(layer, al, a.x, a.y + 4, plan, go);
        const spots = [[92, -38], [92, 40], [160, -38], [160, 40]];
        ['9SS', '10SS', '107', ''].map(dv => ge.filter(st => G.UNIT[st.id].div === dv)).filter(l => l.length).forEach((list, i) => {
          stackAt(layer, list, a.x + spots[i][0], a.y + spots[i][1], null, go);
        });
      } else if (al.length && ge.length) { stackAt(layer, al, a.x - 28, a.y + 6, plan, go); stackAt(layer, ge, a.x + 28, a.y + 6, null, go); }
      else if (al.length) stackAt(layer, al, a.x, a.y + 4, plan, go);
      else if (ge.length) stackAt(layer, ge, a.x, a.y + 4, null, go);
    }
    // track
    for (let i = 1; i <= 6; i++) {
      const st = S.u.filter(x => x.loc === 'T' + i);
      const h = document.createElement('div');
      h.className = 'ar city'; h.style.left = '25px'; h.style.top = (TRACK[i - 1] - 46) + 'px'; h.style.width = '62px'; h.style.height = '92px';
      h.onclick = ev => { ev.stopPropagation(); openList(`増援トラック ${i}列目`, S.u.filter(x => x.loc === 'T' + i), ev); };
      layer.appendChild(h);
      if (st.length) stackAt(layer, st, 58, TRACK[i - 1], null, ev => openList(`増援トラック ${i}列目`, st, ev));
    }
    // polish box
    const bx = S.u.filter(x => x.loc === 'box');
    if (bx.length) stackAt(layer, bx, 235, 264);
    drawArrows();
  }
  function drawArrows() {
    const svg = $('svg');
    const seen = new Set(); let out = '';
    const marker = '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>';
    const line = (from, to, col, dash) => {
      const a = from === 'TRACK' ? { x: 58, y: TRACK[0] } : G.AREA[from], b = G.AREA[to];
      if (!a || !b) return;
      const k = from + '>' + to; if (seen.has(k)) return; seen.add(k);
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const m = 40;
      out += `<line x1="${a.x + dx / L * m}" y1="${a.y + dy / L * m}" x2="${b.x - dx / L * m}" y2="${b.y - dy / L * m}" stroke="${col}" stroke-width="7" ${dash ? 'stroke-dasharray="14 9"' : ''} marker-end="url(#ah)"/>`;
    };
    for (const m of G.S.moves) {
      const col = m.side === 'A' ? '#2a7fff' : '#ff3b1f';
      if (m.path) for (let i = 0; i < m.path.length - 1; i++) line(m.path[i], m.path[i + 1], col, false);
      else line(m.from, m.to, col, m.retreat);
    }
    for (const o of UI.orders) if (o.to) line(G.S.u[o.id].loc, o.to, '#38e08a', true);
    svg.innerHTML = marker + out;
  }
  function renderLog() {
    const box = $('log'); const S = G.S;
    const n = S.log.length;
    box.innerHTML = S.log.map((l, i) => `<div class="${l.c}${i < readUpto ? ' read' : ''}">${esc(l.t)}</div>`).join('');
    readUpto = Math.max(readUpto, 0);
    box.dataset.n = n;
    const down = () => { box.scrollTop = box.scrollHeight; };
    down(); requestAnimationFrame(down);
  }
  function orderWord(o) {
    if (o.act === 'attack') return '攻撃';
    if (o.act === 'recover') return '回復';
    return (o.act === 'moveattack' ? '移動攻撃→' : '移動→') + nm(o.to);
  }
  function undoLast() { UI.orders = UI.orders.slice(0, -1); UI.err = null; }
  function resetOrders() { UI.orders = []; UI.sel = new Set(); UI.mode = null; UI.err = null; }
  // pass ends the card, so go straight to the next one
  function execOrPass() {
    const pass = !UI.orders.length;
    answer({ orders: UI.orders });
    if (pass && G.prompt && G.prompt.kind === 'next') answer({});
  }
  function apBox(p, used) {
    const left = p.val - used;
    const d = document.createElement('div'); d.className = 'ap' + (left < 0 ? ' over' : left === 0 ? ' zero' : '');
    d.innerHTML = `<span class="apl">残り行動値</span><b class="apn">${left}</b><span class="aps">この札 ${p.total}</span>` + (used ? `<span class="aps">命令中 ${used}</span>` : '');
    return d;
  }
  function usedVal() { return UI.orders.reduce((s, o) => s + G.orderCost(o), 0); }
  function renderOps() {
    const ops = $('ops'); const p = G.prompt; ops.innerHTML = '';
    const msg = (t, c) => { const d = document.createElement('div'); d.className = 'msg' + (c ? ' ' + c : ''); d.textContent = t; ops.appendChild(d); };
    const row = document.createElement('div'); row.className = 'row';
    const btn = (t, f, go) => { const b = document.createElement('button'); b.textContent = t; if (go) b.className = 'go'; b.onclick = f; row.appendChild(b); return b; };
    if (!p) {
      const o = G.S.over;
      msg(o ? (o.r === 'win' ? '連合軍の勝利。' : '連合軍の敗北。') + o.why : 'ゲーム終了。', o && o.r === 'win' ? '' : 'err');
      btn('レポートを見る', openReport, true);
      btn('新しいゲーム', () => { start(newSeed()); });
      ops.appendChild(row);
      return;
    }
    if (p.msg) msg(p.msg, 'err');
    switch (p.kind) {
      case 'setup':
        msg(`${p.title}: ${p.hint}。残り${p.units.length}駒。`);
        if (!p.hq) btn('駒を選ぶ', e => openSetup(e));
        if (!p.title.includes('第30')) btn('おまかせ', () => answer({ auto: true }));
        break;
      case 'gamestart':
        msg('空挺降下が終わった。ここから札をめくる。');
        btn('最初の札をめくる', () => answer({}), true);
        break;
      case 'gstart':
        msg(`${p.label}: ${p.units.length}駒が行動する(方向 ${p.letter})。橙の枠の駒が対象。`);
        btn('確認', () => answer({}), true);
        break;
      case 'rein':
        msg(`${p.label}: ${p.units.length}駒。橙の枠の駒が登場した。`);
        btn('確認', () => answer({}), true);
        break;
      case 'next':
        readUpto = G.S.log.length;
        btn('次の札をめくる', () => answer({}), true);
        break;
      case 'alloc': {
        const used = usedVal();
        const over = used > p.val;
        ops.appendChild(apBox(p, used));
        msg(over ? '行動値を超えている。命令を減らす。' : '青い枠のエリアを押して駒を選ぶ。終わるならパス。', over ? 'err' : '');
        if (UI.mode) msg('緑か橙のエリアを押して移動先を決める。橙は渡河で、移動後に消耗する。');
        if (UI.err) msg(UI.err, 'err');
        if (UI.mode) btn('移動をやめる', () => { UI.mode = null; UI.err = null; UI.sel = new Set(); render(); });
        btn(UI.orders.length ? '実行' : 'パス', execOrPass, true).disabled = over;
        btn('1つ戻す', () => { undoLast(); closePop(); render(); }).disabled = !UI.orders.length;
        btn('全部リセット', () => { resetOrders(); closePop(); render(); }).disabled = !UI.orders.length && !UI.mode && !UI.sel.size;
        if (UI.orders.length) {
          const list = document.createElement('div'); list.className = 'plot';
          UI.orders.forEach(o => {
            const c = document.createElement('button'); c.className = 'chip';
            c.textContent = `${G.UNIT[o.id].name} ${orderWord(o)} ×`;
            c.title = 'この命令を消す';
            c.onclick = () => { UI.orders = UI.orders.filter(x => x.id !== o.id); UI.err = null; closePop(); render(); };
            list.appendChild(c);
          });
          ops.appendChild(list);
        }
        break;
      }
      case 'order':
        msg('攻撃を解決するエリアを地図で選ぶ。');
        break;
      case 'retreat':
        msg(`${G.UNIT[p.unit].name} の退却先を選ぶ。`);
        break;
      case 'drop':
        msg('ポーランド旅団の降下先を地図で選ぶ(敵のいないエリア)。');
        btn('今回は降下しない', () => answer({}), false);
        break;
      case 'battle': case 'battleEnd':
        msg(`${nm(p.area)} の戦闘。`);
        break;
      case 'air':
        msg('航空補給: 回復させる駒を3つまで選ぶ。');
        btn('駒を選ぶ', () => openAir());
        break;
    }
    ops.appendChild(row);
  }

  // ------- map clicks -------
  function clickArea(id, ev) {
    const p = G.prompt;
    if (!p) { openArea(id, ev); return; }
    if (p.kind === 'setup' && p.legal.includes(id)) {
      const ids = p.hq ? p.units : [...UI.sel];
      if (!ids.length) { openSetup(ev); return; }
      if (p.title.includes('第30') && id !== 'Rommel' && ids.length === p.units.length && !G.here('Rommel', 'A').length) { warnRommel(ids, id, ev); return; }
      answer({ ids, area: id });
      return;
    }
    if (p.kind === 'retreat' && p.options.includes(id)) { answer({ area: id }); return; }
    if (p.kind === 'order' && p.areas.includes(id)) { answer({ area: id }); return; }
    if (p.kind === 'drop' && p.legal.includes(id)) { answer({ area: id }); return; }
    if (p.kind === 'alloc' && UI.mode) {
      const ms = moveSet();
      if (ms[id]) {
        for (const i of movers()) {
          UI.orders = UI.orders.filter(o => o.id !== i);
          const act = UI.mode;
          UI.orders.push(act === 'moveattack' && G.UNIT[i].tank ? { id: i, act, to: id } : { id: i, act: 'move', to: id });
        }
        UI.sel = new Set(); UI.mode = null; UI.err = null; closePop(); render();
        return;
      }
      UI.err = whyNot(id);
      renderOps();
      return;
    }
    openArea(id, ev);
  }

  // ------- pop -------
  function place(ev) {
    const pop = $('pop');
    pop.style.display = 'block';
    const r = pop.getBoundingClientRect();
    let x = ev && ev.clientX ? ev.clientX + 12 : 40, y = ev && ev.clientY ? ev.clientY + 8 : 60;
    x = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function closePop() { $('pop').style.display = 'none'; }
  function head(pop, title) {
    const h = document.createElement('h3');
    const t = document.createElement('span'); t.textContent = title;
    const c = document.createElement('button'); c.textContent = '閉じる'; c.onclick = () => { closePop(); UI.mode = null; UI.area = null; renderMap(); };
    h.append(t, c); pop.appendChild(h);
  }
  function tile(st, onclick) {
    const d = document.createElement('div'); d.className = 'pu';
    bgStyle(d, face(st), CELL);
    addMark(d, st);
    attachHover(d, ev => showUnits([st], ev));
    if (onclick) d.onclick = () => onclick(d); else d.style.cursor = 'default';
    return d;
  }
  function openList(title, list, ev) {
    const pop = $('pop'); pop.innerHTML = ''; head(pop, title);
    const us = document.createElement('div'); us.className = 'us';
    list.forEach(st => us.appendChild(tile(st)));
    if (!list.length) us.textContent = '駒はない。';
    pop.appendChild(us); place(ev);
  }
  function openArea(id, ev) {
    const p = G.prompt; const pop = $('pop');
    UI.area = id;
    if (p && p.kind === 'alloc') UI.sel = new Set([...UI.sel].filter(i => G.S.u[i].loc === id));
    const al = G.here(id, 'A'), ge = G.here(id, 'G');
    pop.innerHTML = '';
    const a = G.AREA[id];
    const ctrl = a.off ? '' : (G.S.ctrl[id] === 'A' ? ' ・ 連合軍支配' : ' ・ ドイツ軍支配');
    head(pop, nm(id) + ctrl);
    const isAlloc = p && p.kind === 'alloc';
    const elig = isAlloc ? new Set(p.elig) : new Set();
    if (al.length) {
      const us = document.createElement('div'); us.className = 'us';
      al.forEach(st => {
        const can = elig.has(st.id);
        const t = tile(st, can ? () => { toggle(st.id); openArea(id, ev); renderMap(); } : null);
        if (isAlloc && !can) t.classList.add('off');
        const o = UI.orders.find(x => x.id === st.id);
        if (o) { t.classList.add('done'); const g = document.createElement('div'); g.className = 'tag'; g.textContent = o.to ? '→' + nm(o.to) : ({ attack: '攻撃', recover: '回復' })[o.act]; t.appendChild(g); }
        if (UI.sel.has(st.id)) t.classList.add('on');
        us.appendChild(t);
      });
      pop.appendChild(us);
    }
    if (ge.length) {
      const us = document.createElement('div'); us.className = 'us'; us.style.marginTop = '6px';
      ge.forEach(st => us.appendChild(tile(st)));
      pop.appendChild(us);
    }
    if (!al.length && !ge.length) pop.append('駒はない。');
    if (isAlloc && al.some(s => elig.has(s.id))) {
      const acts = document.createElement('div'); acts.className = 'acts';
      const sel = [...UI.sel].map(i => G.S.u[i]);
      const b = (t, en, f) => { const x = document.createElement('button'); x.textContent = t; x.disabled = !en; x.onclick = f; acts.appendChild(x); };
      const allElig = al.filter(s => elig.has(s.id) && !UI.orders.some(o => o.id === s.id));
      b('全部選ぶ', allElig.length > 0, () => { allElig.forEach(s => UI.sel.add(s.id)); openArea(id, ev); renderMap(); });
      const mv = sel.filter(s => !s.back && G.UNIT[s.id].m > 0);
      const atk = sel.filter(s => !s.back && G.UNIT[s.id].a > 0);
      const rec = sel.filter(s => s.back);
      const canMove = Object.keys(moveSet('move')).length > 0;
      const canMA = mv.some(s => G.UNIT[s.id].tank) && Object.keys(moveSet('moveattack')).length > 0;
      b('移動', canMove, () => { UI.mode = 'move'; UI.err = null; closePop(); render(); });
      b('移動+攻撃', canMA, () => { UI.mode = 'moveattack'; UI.err = null; closePop(); render(); });
      b('攻撃', atk.length > 0 && G.enemyHere(id, 'A'), () => { setOrder('attack'); openArea(id, ev); });
      b('回復', rec.length > 0, () => { setOrder('recover'); openArea(id, ev); });
      b('命令を消す', sel.some(s => UI.orders.some(o => o.id === s.id)), () => { UI.orders = UI.orders.filter(o => !UI.sel.has(o.id)); UI.sel = new Set(); openArea(id, ev); render(); });
      b('1つ戻す', UI.orders.length > 0, () => { undoLast(); openArea(id, ev); render(); });
      b('全部リセット', UI.orders.length > 0 || sel.length > 0, () => { resetOrders(); openArea(id, ev); render(); });
      const used = usedVal();
      pop.insertBefore(apBox(p, used), pop.children[1]);
      const run = document.createElement('button'); run.className = 'go'; run.textContent = UI.orders.length ? '実行' : 'パス';
      run.disabled = used > p.val;
      run.onclick = execOrPass;
      acts.appendChild(run);
      pop.appendChild(acts);
      const nt = document.createElement('div'); nt.className = 'note';
      nt.textContent = '駒を押して選ぶ。暗い駒は補給切れか札の対象外。';
      pop.appendChild(nt);
      const warn = t => { const w = document.createElement('div'); w.className = 'note'; w.style.color = 'var(--bad)'; w.textContent = t; pop.appendChild(w); };
      const fixed = sel.filter(s => !s.back && !G.UNIT[s.id].m).map(s => G.UNIT[s.id].name);
      if (fixed.length) warn(`${fixed.join('、')} は移動力0・攻撃力0なので、移動も攻撃もしません。`);
      const noAtk = sel.filter(s => !s.back && G.UNIT[s.id].m && !G.UNIT[s.id].a).map(s => G.UNIT[s.id].name);
      if (noAtk.length && G.enemyHere(id, 'A')) warn(`${noAtk.join('、')} は攻撃力0なので攻撃しません。`);
      if (mv.length && !canMove && !(atk.length && G.enemyHere(id, 'A'))) warn(noMoveReason(mv));
      if (atk.length && !G.enemyHere(id, 'A')) warn('攻撃できるのは同じエリアの敵だけ。このエリアに敵はいない。戦車以外は、移動した札では攻撃できない。');
    }
    place(ev);
    renderMap();
  }
  function toggle(i) { if (UI.sel.has(i)) UI.sel.delete(i); else UI.sel.add(i); }
  function setOrder(act) {
    for (const i of UI.sel) {
      const st = G.S.u[i], u = G.UNIT[i];
      if (act === 'attack' ? (st.back || !u.a) : !st.back) continue;
      UI.orders = UI.orders.filter(o => o.id !== i);
      UI.orders.push({ id: i, act });
    }
    UI.sel = new Set();
    render();
  }
  function openSetup(ev) {
    const p = G.prompt; const pop = $('pop'); pop.innerHTML = '';
    head(pop, p.title);
    const us = document.createElement('div'); us.className = 'us';
    p.units.forEach(i => {
      const st = G.S.u[i];
      const t = tile(st, () => { toggle(i); t.classList.toggle('on'); });
      if (UI.sel.has(i)) t.classList.add('on');
      us.appendChild(t);
    });
    pop.appendChild(us);
    const nt = document.createElement('div'); nt.className = 'note';
    nt.textContent = '選んだ駒を置くエリアを地図で押す。対戦車は敵のいるエリアに置けない。';
    pop.appendChild(nt);
    const acts = document.createElement('div'); acts.className = 'acts';
    const a = document.createElement('button'); a.textContent = '全部選ぶ'; a.onclick = () => { UI.sel = new Set(p.units); openSetup(ev); };
    const n = document.createElement('button'); n.textContent = '全部外す'; n.onclick = () => { UI.sel = new Set(); openSetup(ev); };
    acts.append(a, n); pop.appendChild(acts);
    place({ clientX: 30, clientY: 9999 });
  }
  // ------- battle window -------
  const dieHtml = (r, a) => `<span class="dice ${r.hit ? 'hit' : 'miss'}" title="攻撃力${a}以下で命中">${r.r}</span>`;
  function renderBattle() {
    const box = $('bt'); const B = G.S.battle; const p = G.prompt;
    if (!B || !p || !['battle', 'retreat', 'battleEnd'].includes(p.kind)) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'flex';
    box.classList.toggle('mini', p.kind === 'retreat');
    if (p.kind === 'retreat') {
      box.innerHTML = `<h3>${esc(G.UNIT[p.unit].name)} の退却先</h3>`;
      box.appendChild(victimRow(p.unit, true));
      const m = document.createElement('div'); m.id = 'btSum';
      m.textContent = '緑のエリアかボタンを押す。';
      box.appendChild(m);
      return;
    }
    const atkA = B.side === 'A';
    const title = `${nm(B.area)} の戦闘` + (B.city ? ' (市街: 攻撃力3以上は-1)' : '');
    box.innerHTML = `<h3>${esc(title)}</h3><div class="btgrid"><div class="btcol ally"><h4>連合軍(${atkA ? '攻撃' : '防御'})</h4><div id="btA"></div></div><div class="btcol ger"><h4>ドイツ軍(${atkA ? '防御' : '攻撃'})</h4><div id="btG"></div></div></div><div id="btSum"></div><div id="btOps"></div>`;
    const atkBox = $(atkA ? 'btA' : 'btG'), defBox = $(atkA ? 'btG' : 'btA');
    const rolled = fast || rolledN === B.n;
    B.rolls.forEach((r, i) => {
      const row = btRow(G.S.u[r.id], `攻撃力 ${r.a}`);
      const d = row.querySelector('.btdice');
      d.id = 'btd' + i;
      if (rolled) d.innerHTML = dieHtml(r, r.a);
      atkBox.appendChild(row);
    });
    B.victims.forEach(i => defBox.appendChild(victimRow(i, rolled)));
    if (rolled) { rolledN = B.n; battleOps(); } else animateDice(B);
  }
  function btRow(st, status) {
    const row = document.createElement('div'); row.className = 'btrow';
    const t = document.createElement('div'); t.className = 'pu'; t.style.cursor = 'default'; t.style.width = t.style.height = '46px';
    bgStyle(t, face(st), 46);
    addMark(t, st);
    attachHover(t, ev => showUnits([st], ev));
    const info = document.createElement('div'); info.className = 'btinfo';
    info.innerHTML = `<b>${esc(G.UNIT[st.id].name)}</b><span class="btst">${esc(status)}</span>`;
    const d = document.createElement('div'); d.className = 'btdice';
    row.append(t, info, d);
    return row;
  }
  const WORD = { flip: '消耗', retreat: '退却', remove: '除去' };
  function victimRow(i, rolled) {
    const B = G.S.battle, p = G.prompt, st = G.S.u[i];
    const lad = G.ladder(st).map(s => `${s.p}点 ${WORD[s.w]}`).join('・');
    const row = btRow(st, B.result[i] ? '' : lad);
    const d = row.querySelector('.btdice');
    if (B.result[i] && !(p.kind === 'retreat' && p.unit === i)) {
      d.innerHTML = `<span class="btres">${esc(B.result[i])}</span>`;
      if (B.result[i].includes('除去')) row.classList.add('gone');
    }
    if (rolled && p.kind === 'battle' && B.hits && !B.noEffect) {
      const dm = UI.dmg[i] || 0;
      const used = Object.values(UI.dmg).reduce((n, v) => n + v, 0);
      const maxD = Math.max(...B.victims.map(v => G.curDef(G.S.u[v])));
      const cand = used < B.total && dm < G.capacity(st) && (used > 0 || G.curDef(st) === maxD);
      const lab = document.createElement('span'); lab.className = 'btres';
      if (cand) {
        // one click takes the points up to this unit's next result
        const next = G.ladder(st).find(l => l.p > dm);
        const add = Math.min(next.p - dm, B.total - used);
        const after = dm + add;
        lab.textContent = `押すと ${after}点 ${WORD[G.effect(st, after)] || '効果なし'}`;
        row.classList.add('cand');
        row.onclick = () => {
          UI.dmg[i] = after;
          UI.dmgErr = null;
          if (used + add === B.total) {
            const foe = B.side === 'A' ? 'G' : 'A';
            UI.dmgErr = G.validateAlloc(B.victims.map(v => G.S.u[v]), B.hits, UI.dmg, foe);
            if (!UI.dmgErr) { answer({ alloc: UI.dmg }); return; }
          }
          renderBattle();
        };
      } else if (dm) {
        lab.textContent = `${dm}点 ${WORD[G.effect(st, dm)] || '効果なし'}`;
        row.classList.add('sel');
      } else if (used < B.total) row.classList.add('nocand');
      d.appendChild(lab);
    }
    if (p.kind === 'retreat' && p.unit === i) {
      row.classList.add('sel');
      p.options.forEach(a => { const b = document.createElement('button'); b.textContent = nm(a); b.onclick = () => answer({ area: a }); d.appendChild(b); });
    }
    return row;
  }
  function animateDice(B) {
    let left = B.rolls.length;
    B.rolls.forEach((r, i) => {
      const d = $('btd' + i);
      const el = document.createElement('span'); el.className = 'dice rolling'; el.textContent = '?';
      setTimeout(() => {
        if (!d.isConnected) return;
        d.appendChild(el);
        const t0 = Date.now();
        const tick = setInterval(() => {
          if (!el.isConnected) { clearInterval(tick); return; }
          el.textContent = 1 + Math.floor(Math.random() * 6);
          if (Date.now() - t0 >= 550) {
            clearInterval(tick);
            el.className = 'dice ' + (r.hit ? 'hit' : 'miss');
            el.textContent = r.r;
            if (--left === 0) { rolledN = B.n; renderBattle(); }
          }
        }, 70);
      }, i * 130);
    });
  }
  function battleOps() {
    const B = G.S.battle, p = G.prompt;
    const sum = $('btSum'), ops = $('btOps');
    if (!sum) return;
    const dHits = B.rolls.filter(r => r.hit).length;
    sum.textContent = `${B.rolls.length}駒が攻撃、命中${dHits}。` + (B.hits && B.total < B.hits ? `受けられる損害は${B.total}まで。` : '');
    const btn = (t, f, go, dis) => { const b = document.createElement('button'); b.textContent = t; if (go) b.className = 'go'; b.disabled = !!dis; b.onclick = f; ops.appendChild(b); };
    ops.innerHTML = '';
    if (p.kind === 'battle' && B.noEffect) sum.textContent += ` 損害${B.hits}は効果なし。`;
    if (p.kind === 'battle' && (!B.hits || B.noEffect)) { btn('確認', () => answer({}), true); return; }
    if (p.kind === 'battle') {
      const used = Object.values(UI.dmg).reduce((n, v) => n + v, 0);
      sum.textContent += ` 緑の駒を押すと損害を受ける: 残り${B.total - used}。` + (used ? '' : '最初の1点は防御力が最も高い駒へ。');
      btn('やり直す', () => { UI.dmg = {}; UI.dmgErr = null; renderBattle(); }, false, !used);
      if (B.side === 'A') btn('おまかせ', () => answer({ auto: true }));
      const em = UI.dmgErr || p.msg;
      if (em) { const m = document.createElement('div'); m.className = 'btmsg'; m.textContent = em + ' 「やり直す」で選び直す。'; ops.appendChild(m); }
    } else if (p.kind === 'retreat') {
      sum.textContent += ` ${G.UNIT[p.unit].name} の退却先を選ぶ。`;
    } else btn('確認', () => answer({}), true);
  }
  function warnRommel(ids, area, ev) {
    const pop = $('pop'); pop.innerHTML = '';
    head(pop, '警告: Rommelが空になります');
    const m = document.createElement('div');
    m.textContent = `全部を ${nm(area)} に置くと、Rommelに駒がいなくなります。第30軍団の補給が切れて、近衛の札でも動けません。`;
    pop.appendChild(m);
    const h = document.createElement('div'); h.className = 'note'; h.textContent = 'Rommelに残す駒を押してください。';
    pop.appendChild(h);
    const us = document.createElement('div'); us.className = 'us';
    ids.forEach(i => us.appendChild(tile(G.S.u[i], () => {
      const rest = ids.filter(x => x !== i);
      answer({ ids: [i], area: 'Rommel' });
      if (rest.length) answer({ ids: rest, area });
    })));
    pop.appendChild(us);
    const acts = document.createElement('div'); acts.className = 'acts';
    const b = document.createElement('button'); b.textContent = '選び直す'; b.onclick = () => openSetup(ev);
    const c = document.createElement('button'); c.textContent = 'このまま置く'; c.onclick = () => answer({ ids, area });
    acts.append(b, c); pop.appendChild(acts);
    place(ev);
  }
  function openAir() {
    const p = G.prompt; const pop = $('pop'); pop.innerHTML = '';
    head(pop, '航空補給(3つまで)');
    const us = document.createElement('div'); us.className = 'us';
    p.cands.forEach(i => {
      const t = tile(G.S.u[i], () => {
        if (UI.sel.has(i)) UI.sel.delete(i); else if (UI.sel.size < p.max) UI.sel.add(i);
        openAir();
      });
      if (UI.sel.has(i)) t.classList.add('on');
      const g = document.createElement('div'); g.className = 'tag'; g.textContent = nm(G.S.u[i].loc); t.appendChild(g);
      us.appendChild(t);
    });
    pop.appendChild(us);
    const acts = document.createElement('div'); acts.className = 'acts';
    const ok = document.createElement('button'); ok.className = 'go'; ok.textContent = '決定'; ok.onclick = () => answer({ ids: [...UI.sel] });
    acts.appendChild(ok); pop.appendChild(acts);
    place({ clientX: 30, clientY: 9999 });
  }

  // ------- zoom -------
  function fit() {
    const left = $('left');
    return (left.clientWidth - 2) / 1457;
  }
  function applyZoom() {
    const w = $('mapwrap');
    const z = zoom || fit();
    w.style.transform = `scale(${z})`;
    w.style.width = '1457px'; w.style.height = '2064px';
    w.style.marginRight = (1457 * z - 1457) + 'px';
    w.style.marginBottom = (2064 * z - 2064) + 'px';
  }
  function newSeed() { return (Date.now() ^ (Math.random() * 1e9)) >>> 0; }

  $('bZp').onclick = () => { zoom = (zoom || fit()) * 1.2; applyZoom(); };
  $('bZm').onclick = () => { zoom = (zoom || fit()) / 1.2; applyZoom(); };
  $('bFp').onclick = () => { pref.fs = Math.min(26, (pref.fs || 17) + 1); document.documentElement.style.setProperty('--fs', pref.fs + 'px'); savePref(pref); applyZoom(); };
  $('bFm').onclick = () => { pref.fs = Math.max(13, (pref.fs || 17) - 1); document.documentElement.style.setProperty('--fs', pref.fs + 'px'); savePref(pref); applyZoom(); };
  $('gsGo').onclick = () => answer({});
  $('stGo').onclick = () => { $('st').style.display = 'none'; openSetupIfNeeded(); };
  // a new game starts by confirming the language, then the first setup stage
  function askLanguage() {
    askLang = true; lastStage = -1;
    $('st').style.display = 'none'; closePop();
    $('lg').style.display = 'flex';
  }
  MMLang.onClose = () => {
    if (!askLang) return;
    askLang = false;
    if (!showStage()) openSetupIfNeeded();
  };
  $('endGo').onclick = openReport;
  $('rpClose').onclick = () => { $('rp').style.display = 'none'; };
  $('rpNew').onclick = () => start(newSeed());
  $('rpOne').onclick = () => { saveFile(stamp() + '.html', new Blob([MMReport.oneFile(rpData.data, rpData.map)], { type: 'text/html' })); };
  $('rpBlog').onclick = blogBox;
  $('bHelp').onclick = () => { $('help').style.display = 'flex'; };
  $('bPool').onclick = e => { const S = G.S; openList('除去された駒', S.u.filter(x => x.loc === 'dead'), e); };
  $('bNew').onclick = () => { if (!G.S.cards || G.S.over || confirm('今のゲームを捨てて始めますか')) { start(newSeed()); save(); askLanguage(); } };
  window.addEventListener('resize', applyZoom);
  document.getElementById('left').addEventListener('click', () => { closePop(); });

  MMLang.init();
  if (MMLang.lang !== 'ja') document.querySelector('img.map').src = `img/${MMLang.lang}/map.jpg`;
  const sv = loadSave();
  let ok = false;
  if (sv && sv.answers) { try { start(sv.seed, sv.answers); ok = true; } catch (e) { ok = false; } }
  if (!ok) start(newSeed());
  applyZoom();
  if (MMLang.askAtStart && !G.S.cards && !G.answers.length) askLanguage();
  window.MM_UI = { get G() { return G; }, answer, clickArea, render, focusMap, renderBattle, apply: MMLang.apply, openReport, get rp() { return rpData; }, setFast(v) { fast = v; } };
})();
