// コルベット・コマンド — 言語（日本語 / English）
// 言語はページを開く時に決まる（?lang=en / 前に選んだ言語）。切り替えるとページを読み直す
'use strict';
const LANG = (() => {
  let l = null;
  try { l = new URLSearchParams(location.search).get('lang'); } catch (e) {}
  if (!l) { try { l = localStorage.getItem('cc_lang'); } catch (e) {} }
  return l === 'en' ? 'en' : 'ja';
})();
// 日本語と英語の対から、今の言語の方を返す
function L(ja, en) { return LANG === 'en' && en != null ? en : ja; }
const MONTH_EN = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// 処理の中で比べるのに使う日本語を、画面に出す時だけ英語にする
const TK_EN = { 'U ボートの雷撃': 'U-boat torpedo', '空襲': 'Air raid', '落伍船の沈没': 'Straggler lost', '弾薬運搬船': 'Ammunition ship', 'タンカー': 'Tanker', '救難船': 'Rescue ship', '地中海': 'the Mediterranean', 'イギリス海峡': 'the English Channel', '近海': 'home waters', '北極海': 'the Arctic', 'オーバーホール': 'overhaul' };
function TK(x) { return LANG === 'en' ? (TK_EN[x] || x) : x; }
function setLang(l) {
  try { localStorage.setItem('cc_lang', l); } catch (e) {}
  const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
}
document.documentElement.lang = LANG;
