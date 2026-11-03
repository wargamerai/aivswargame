// コルベット・コマンド — 言語（日本語 / English / Español / Deutsch / Français / Italiano / 中文 / 한국어）
// 言語はページを開く時に決まる（?lang=xx / 前に選んだ言語）。切り替えるとページを読み直す
// 日本語と英語はソースの L(日本語, 英語) に直接ある。ほかの言語は cc_i18n_xx.js の、英語の文をキーにした辞書で訳す
'use strict';
const LANGS = [['ja', '日本語'], ['en', 'English'], ['es', 'Español'], ['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano'], ['zh', '中文'], ['ko', '한국어']];
const LANG = (() => {
  let l = null;
  try { l = new URLSearchParams(location.search).get('lang'); } catch (e) {}
  if (!l) { try { l = localStorage.getItem('cc_lang'); } catch (e) {} }
  return LANGS.some(x => x[0] === l) ? l : 'ja';
})();
// 辞書はゲームの文より先に読み込む必要があるので、ここで同期して読む
if (LANG !== 'ja' && LANG !== 'en' && typeof CC_I18N === 'undefined') document.write(`<script src="cc_i18n_${LANG}.js"><\/script>`);
// 訳す。exact=そのままの文、pats=変わる部分を含む文（変わる部分の値も、辞書にあれば訳す）
const I18N_cache = new Map();
function I18N_tr(en) {
  if (typeof CC_I18N === 'undefined' || !en) return en;
  if (I18N_cache.has(en)) return I18N_cache.get(en);
  let out = en;
  const ex = CC_I18N.exact;
  if (ex[en] != null) out = ex[en];
  else {
    for (const p of CC_I18N_PATS()) {
      const m = p.re.exec(en);
      if (m) {
        out = p.to.replace(/\{(\d+)\}/g, (_, i) => { const x = m[+i + 1]; return ex[x] != null ? ex[x] : (x == null ? '' : x); });
        break;
      }
    }
  }
  I18N_cache.set(en, out);
  return out;
}
let I18N_compiled = null;
function CC_I18N_PATS() {
  if (I18N_compiled) return I18N_compiled;
  const esc = t => t.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  I18N_compiled = (CC_I18N.pats || []).map(([from, to]) => ({ re: new RegExp('^' + from.split(/\{\d+\}/).map(esc).join('([\\s\\S]*?)') + '$'), to }))
    .map((p, i, a) => p);
  return I18N_compiled;
}
// 文以外の言語ごとの決まり（日付・艦長の呼び方など）
function I18N_X(k, en) { return (typeof CC_I18N !== 'undefined' && CC_I18N.x && CC_I18N.x[k] != null) ? CC_I18N.x[k] : en; }
// 日本語と英語の対から、今の言語の方を返す
function L(ja, en) {
  if (LANG === 'ja' || en == null) return ja;
  if (LANG === 'en') return en;
  if (en === '') return (CC_I18N_empty()[ja] != null) ? CC_I18N_empty()[ja] : '';
  return I18N_tr(en);
}
function CC_I18N_empty() { return (typeof CC_I18N !== 'undefined' && CC_I18N.empty) || {}; }
const MONTH_EN = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// 処理の中で比べるのに使う日本語を、画面に出す時だけ訳す
const TK_EN = { 'U ボートの雷撃': 'U-boat torpedo', '空襲': 'Air raid', '落伍船の沈没': 'Straggler lost', '弾薬運搬船': 'Ammunition ship', 'タンカー': 'Tanker', '救難船': 'Rescue ship', '地中海': 'the Mediterranean', 'イギリス海峡': 'the English Channel', '近海': 'home waters', '北極海': 'the Arctic', 'オーバーホール': 'overhaul' };
function TK(x) { return L(x, TK_EN[x] || x); }
function setLang(l) {
  try { localStorage.setItem('cc_lang', l); } catch (e) {}
  const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
}
document.documentElement.lang = LANG;
// カウンター: 言語ごとに別の行で数える（?lang を付けずに開いても、選んだ言語の行に入る）
window.goatcounter = { path: function (p) { return location.pathname.replace(/index\.html$/, '') + '?lang=' + LANG; } };
