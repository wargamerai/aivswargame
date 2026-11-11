'use strict';

(() => {
  const root = document.documentElement;
  const tracker = window.goatcounter = window.goatcounter || {};
  tracker.no_onload = true;

  const script = document.createElement('script');
  script.src = 'https://gc.zgo.at/count.js';
  script.async = true;
  script.dataset.goatcounter = 'https://shigerusuzuki.goatcounter.com/count';

  let lastLanguage;
  const countLanguage = () => {
    const counter = window.goatcounter;
    if (typeof counter.count !== 'function') return;
    const language = root.lang.toLowerCase().split('-')[0];
    if (!/^[a-z]{2}$/.test(language) || language === lastLanguage) return;
    let path = location.pathname;
    try { path = decodeURI(path); } catch { /* Keep the original path if decoding fails. */ }
    counter.count({path: path + '?lang=' + language});
    lastLanguage = language;
  };

  const start = () => {
    countLanguage();
    new MutationObserver(countLanguage).observe(root, {attributes: true, attributeFilter: ['lang']});
    script.addEventListener('load', countLanguage, {once: true});
    document.head.append(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
