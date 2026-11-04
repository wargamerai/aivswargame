// 言語（日本語 / English）
'use strict';
var LANG = (() => { let l = null; try { l = new URLSearchParams(location.search).get('lang') || localStorage.getItem('pb_lang'); } catch (e) {} return l === 'en' ? 'en' : 'ja'; })();
var L = (j, e) => LANG === 'en' ? e : j;
function setLang(l) { try { localStorage.setItem('pb_lang', l); } catch (e) {} const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString(); }
if (window.goatcounter === undefined) window.goatcounter = {};
window.goatcounter.path = () => location.pathname + '?lang=' + LANG;
