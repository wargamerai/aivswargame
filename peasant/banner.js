(() => {
    const script = document.currentScript;
    const { peasantBefore, peasantInside, peasantLanguage } = script.dataset;
    const heading = peasantBefore && document.querySelector(peasantBefore);
    const container = peasantInside && document.querySelector(peasantInside);
    if (!heading && !container) return;

    const pageLanguage = document.documentElement;
    const link = document.createElement('a');
    link.className = 'peasant-game-banner';
    link.target = '_blank';
    link.rel = 'noopener';
    link.style.cssText = 'display:block;flex:0 0 auto;width:min(calc(100% - 16px),560px,42svh);margin:8px auto 12px';

    const image = document.createElement('img');
    image.width = 2172;
    image.height = 724;
    image.decoding = 'async';
    image.style.cssText = 'display:block;width:100%;height:auto';
    link.append(image);

    function showBanner(language) {
        const japanese = /^ja(?:-|$)/i.test(language);
        const locale = japanese ? 'ja' : 'en';
        link.lang = locale;
        link.href = `https://peasant-homepage.savorymedal9.chatgpt.site/?lang=${locale}`;
        image.alt = japanese
            ? 'Pe@sant — ブラウザで楽しむクラシック・ボードウォーゲーム'
            : 'Pe@sant — Classic board wargames in your browser';
        image.src = new URL(`banner-${locale}.png`, script.src);
    }

    const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
    showBanner(requestedLanguage || peasantLanguage || pageLanguage.lang || 'ja');
    if (heading) heading.before(link);
    else container.prepend(link);

    new MutationObserver(() => showBanner(pageLanguage.lang || 'ja')).observe(pageLanguage, {
        attributes: true,
        attributeFilter: ['lang'],
    });
})();
