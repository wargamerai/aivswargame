// F16・連合艦隊・太平洋艦隊の言語切り替え（9言語）
// ゲームの処理には手を入れず、画面に出た日本語を nv_i18n.js の対訳表で置き換える
//   - 言語: ?lang= → 保存した言語 → 日本語。フレームの中のページも同じ言語になる
//   - ゲームの入口では最初に正面で言語を聞く。いちばん外のページの右上にも、切り替えの箱を出す
(function () {
  const LANGS = { ja: '日本語', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano', es: 'Español', zh: '简体中文', ko: '한국어', ru: 'Русский' };
  let LANG = 'ja';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS[q]) { LANG = q; localStorage.setItem('nvLang', q); }
    else if (LANGS[localStorage.getItem('nvLang')]) LANG = localStorage.getItem('nvLang');
  } catch (e) { /* no storage */ }

  // カウンター: 言語ごとに別の行で数える。言語が決まってから1回だけ送る
  window.goatcounter = window.goatcounter || {};
  window.goatcounter.no_onload = true;
  let counted = false;
  function count() {
    if (counted) return;
    counted = true;
    let tries = 0;
    (function send() {
      const g = window.goatcounter;
      if (g && g.count) g.count({ path: location.pathname.replace(/index\.html$/, '') + '?lang=' + LANG });
      else if (tries++ < 40) setTimeout(send, 500);
    })();
  }

  const JP = /[぀-ヿ㐀-鿿]/;
  const KEYS = Object.keys(window.NV_I18N_KEYS || {}).sort((a, b) => b.length - a.length);
  const RE = KEYS.length ? new RegExp(KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const tr = k => {
    const n = window.NV_I18N_KEYS[k];
    const d = window.NV_I18N[LANG] || {}, en = window.NV_I18N.en || {};
    return d[n] !== undefined ? d[n] : en[n] !== undefined ? en[n] : k;
  };
  const cache = new Map(), done = new Set();
  const wordEnd = s => (LANG === 'zh' ? /[A-Za-z0-9)\]]$/ : /[\p{L}\p{N})\]]$/u).test(s);
  const wordStart = s => (LANG === 'zh' ? /^[A-Za-z0-9(]/ : /^[\p{L}\p{N}(]/u).test(s);
  function T(s) {
    if (LANG === 'ja' || !s || !RE || !JP.test(s) || done.has(s)) return s;
    if (cache.has(s)) return cache.get(s);
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
    let out = '', last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(core))) {
      const raw = core.slice(last, m.index);
      if (raw) { if (out && wordEnd(out) && wordStart(raw)) out += ' '; out += raw; }
      const t = tr(m[0]);
      if (out && wordEnd(out) && wordStart(t)) out += ' ';
      out += t;
      last = m.index + m[0].length;
    }
    const rest = core.slice(last);
    if (rest) { if (out && wordEnd(out) && wordStart(rest)) out += ' '; out += rest; }
    if (LANG !== 'zh') out = out.replace(/、/g, ', ').replace(/。/g, '. ').replace(/：/g, ': ').replace(/（/g, ' (').replace(/）/g, ') ').replace(/！/g, '! ').replace(/？/g, '? ').replace(/・/g, ' · ').replace(/「|」/g, '"').replace(/【/g, '[').replace(/】/g, ']').replace(/　/g, ' ').replace(/ {2,}/g, ' ').replace(/ ([,.:;)\]!?])/g, '$1').trim();
    out = lead + out + trail;
    cache.set(s, out); done.add(out);
    return out;
  }

  const texts = new WeakMap(), attrs = new WeakMap();
  const ATTRS = ['title', 'placeholder', 'alt'];
  function applyText(n) {
    const v = n.nodeValue, r = texts.get(n);
    if (r && r.lang === LANG && v === r.out) return;
    if (!JP.test(v)) return;
    const out = T(v);
    texts.set(n, { ja: v, out, lang: LANG });
    if (out !== v) n.nodeValue = out;
  }
  function applyAttr(el, a) {
    const v = el.getAttribute(a);
    if (v == null || !JP.test(v)) return;
    let m = attrs.get(el); if (!m) { m = {}; attrs.set(el, m); }
    const r = m[a];
    if (r && r.lang === LANG && v === r.out) return;
    const out = T(v);
    m[a] = { ja: v, out, lang: LANG };
    if (out !== v) el.setAttribute(a, out);
  }
  function walk(node) {
    if (node.nodeType === 3) { applyText(node); return; }
    if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.id === 'nvLangBox' || node.id === 'nvLangAsk') return;
    ATTRS.forEach(a => { if (node.hasAttribute(a)) applyAttr(node, a); });
    if (node.tagName === 'INPUT' && /^(button|submit)$/i.test(node.type) && node.hasAttribute('value')) applyAttr(node, 'value');
    node.childNodes.forEach(walk);
  }
  function restore(node) {
    if (node.nodeType === 3) { const r = texts.get(node); if (r && node.nodeValue === r.out) node.nodeValue = r.ja; texts.delete(node); return; }
    if (node.nodeType !== 1) return;
    const m = attrs.get(node);
    if (m) { Object.keys(m).forEach(a => { if (node.getAttribute(a) === m[a].out) node.setAttribute(a, m[a].ja); }); attrs.delete(node); }
    node.childNodes.forEach(restore);
  }
  let applying = false;
  const obs = new MutationObserver(ms => {
    if (LANG === 'ja' || applying) return;
    applying = true;
    ms.forEach(m => {
      if (m.type === 'characterData') applyText(m.target);
      else if (m.type === 'attributes') { if (m.target.nodeType === 1) applyAttr(m.target, m.attributeName); }
      else m.addedNodes.forEach(walk);
    });
    applying = false;
  });
  let jaTitle = null;
  function setLang(l, fromParent) {
    if (!LANGS[l]) l = 'ja';
    applying = true;
    if (LANG !== 'ja' && document.body) restore(document.body);
    if (jaTitle !== null) document.title = jaTitle;
    LANG = l;
    cache.clear(); done.clear();
    if (!fromParent) { try { localStorage.setItem('nvLang', l); } catch (e) { /* no storage */ } }
    document.documentElement.lang = l;
    if (document.body) {
      document.body.style.fontFamily = { zh: "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif", ko: "'Apple SD Gothic Neo','Malgun Gothic',sans-serif", ru: "'Helvetica Neue',Arial,sans-serif" }[l] || '';
      if (l !== 'ja') {
        walk(document.body);
        if (jaTitle === null) jaTitle = document.title;
        document.title = T(jaTitle);
        obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'alt', 'value'] });
      } else obs.disconnect();
    }
    applying = false;
    document.querySelectorAll('iframe').forEach(f => { try { if (f.contentWindow.NV_setLang) f.contentWindow.NV_setLang(l, true); } catch (e) { /* other origin */ } });
    const sel = document.getElementById('nvLangSel');
    if (sel) sel.value = l;
  }
  window.NV_setLang = setLang;
  window.NV_T = T;
  // ダイアログとキャンバスの文字
  const a = window.alert.bind(window), c = window.confirm.bind(window), p = window.prompt.bind(window);
  window.alert = m => a(T(String(m)));
  window.confirm = m => c(T(String(m)));
  window.prompt = (m, d) => p(T(String(m)), d);
  if (window.CanvasRenderingContext2D) {
    const P = CanvasRenderingContext2D.prototype, ft = P.fillText, st = P.strokeText;
    P.fillText = function (s, ...r) { return ft.call(this, T(String(s)), ...r); };
    P.strokeText = function (s, ...r) { return st.call(this, T(String(s)), ...r); };
  }
  function start() {
    if (window.top === window) {
      const box = document.createElement('div');
      box.id = 'nvLangBox';
      box.style.cssText = 'position:fixed;top:4px;right:4px;z-index:99999;opacity:.85;';
      const sel = document.createElement('select');
      sel.id = 'nvLangSel';
      sel.style.cssText = 'font-size:13px;padding:2px;';
      Object.keys(LANGS).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = LANGS[k]; sel.appendChild(o); });
      sel.value = LANG;
      sel.onchange = () => setLang(sel.value);
      box.appendChild(sel);
      document.body.appendChild(box);
    }
    if (LANG !== 'ja') setLang(LANG, true);
    askLanguage();
  }
  // ゲームの入口では、最初に画面の正面で言語を聞く（URL に lang= があるとき、この回で聞いたあとは聞かない）
  function askLanguage() {
    if (window.top !== window || !/(f16ai\/scenario|ijn\/savo|ijn\/campaign|pf\/campaign)\.html$/.test(location.pathname)) { if (window.top === window) count(); return; }
    let asked = false;
    try { asked = !!new URLSearchParams(location.search).get('lang') || sessionStorage.getItem('nvLangAsked') === '1'; } catch (e) { /* no storage */ }
    if (asked) { count(); return; }
    const bg = document.createElement('div');
    bg.id = 'nvLangAsk';
    bg.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:16px;font-family:sans-serif;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1e2733;color:#fff;border:2px solid #6ea8ff;border-radius:10px;padding:24px 28px;text-align:center;max-width:560px;width:100%;box-sizing:border-box;';
    const h = document.createElement('div');
    h.textContent = '言語 / Language / Langue / Sprache / Lingua / Idioma / 语言 / 언어 / Язык';
    h.style.cssText = 'font-size:16px;font-weight:bold;margin-bottom:18px;line-height:1.5;';
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;';
    Object.keys(LANGS).forEach(k => {
      const b = document.createElement('button');
      b.textContent = LANGS[k];
      b.lang = k;
      b.style.cssText = 'font-size:18px;padding:12px 8px;border-radius:6px;cursor:pointer;color:#fff;background:' + (k === LANG ? '#2f6fd6' : '#33415a') + ';border:1px solid #6ea8ff;';
      b.onclick = () => {
        try { sessionStorage.setItem('nvLangAsked', '1'); } catch (e) { /* no storage */ }
        if (k !== LANG) setLang(k); else { try { localStorage.setItem('nvLang', k); } catch (e) { /* no storage */ } }
        bg.remove();
        count();
      };
      row.appendChild(b);
    });
    box.appendChild(h); box.appendChild(row); bg.appendChild(box);
    document.body.appendChild(bg);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
