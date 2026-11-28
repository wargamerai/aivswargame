(() => {
    const script = document.currentScript;
    const { peasantBefore, peasantInside, peasantLanguage } = script.dataset;
    const root = new URL('../', script.src);
    const page = location.pathname.slice(root.pathname.length).replace(/(^|\/)$/, '$1index.html');

    // バナーは最初のタイトル／設定画面の中にだけ置く。
    // 最初から盤面を操作するページでは、プレイ画面に広告を重ねない。
    const startScreens = {
        'b17/B-17-web.html': ['#base-scene[data-scene=ready]', '#base-scene', true],
        'battleofnomonhan-6f3c9a82/nomonhan.html': ['#start-screen'],
        'buldge-6f3c9a82/bulge.html': ['#startScreen'],
        'CC/index.html': ['body.cc-intro', '#bar', false, 'body'],
        'bulge-ai-6f3c9a82/index.html': ['#start-dialog', '#start-dialog > h2'],
        'dokuso-6f3c9a82/game.html': ['#modal', '#modalBox', true],
        'dunbain/scenario.html': ['#scenarioSetup', '#scenarioSetup', true],
        'f16ai-6f3c9a82/scenario.html': ['#card'],
        'ijn-6f3c9a82/savo.html': ['.btn-start', '.container > h1'],
        'jabro.html': ['#setup'],
        'montysmelancholy-6f3c9a82/index.html': ['#lg'],
        'nobunaga-6f3c9a82/index.html': ['#startScreen'],
        'nobunaga-gj-6f3c9a82/index.html': ['#gjGate'],
        'panzergrenadier-6f3c9a82/title.html': ['body'],
        'pattonsbest/index.html': ['#over', '#over > .box', true],
        'pfb-6f3c9a82/index.html': ['#load-screen', '#load-screen', true],
        'postcard-games/gulf-war.html': ['#overlay'],
        'postcard-games/gulf-war-en.html': ['#overlay'],
        'postcard-games/stalingrad-6f3c9a82.html': ['#setupDialog'],
        'sanngikushi-6f3c9a82/index.html': ['#start'],
        'startrick/index.html': ['#title'],
        'tanks-plus-6f3c9a82/hub.html': ['#scenarioScreen'],
        'アップフロントVer2/index.html': ['#faction-select'],
        'ドンキーコマンド/index.html': ['#setup'],
        '帆船の戦い/sandbox.html': ['#scenGrid', 'body > div > h1'],
        '海の戦い/index.html': ['#optionStartModal'],
    };

    const route = startScreens[decodeURI(page)];
    if (!route) return;
    const [screenSelector, placement, prepend, screenRoot] = route;
    const screen = document.querySelector(screenRoot || screenSelector);
    if (!screen) return;

    const pageLanguage = document.documentElement;
    const link = document.createElement('a');
    link.className = 'peasant-game-banner';
    link.target = '_blank';
    link.rel = 'noopener';
    link.style.cssText = 'display:block;flex:0 0 auto;width:min(calc(100% - 16px),560px,66svh);margin:8px auto 12px';

    const image = document.createElement('img');
    image.width = 648;
    image.height = 216;
    image.decoding = 'async';
    image.style.cssText = 'display:block;width:100%;height:auto';
    link.append(image);

    function showBanner(language) {
        const japanese = /^ja(?:-|$)/i.test(language);
        const locale = japanese ? 'ja' : 'en';
        if (link.lang === locale) return;
        link.lang = locale;
        link.href = `https://peasant-homepage.savorymedal9.chatgpt.site/?lang=${locale}`;
        image.alt = japanese
            ? 'Pe@sant — ブラウザで楽しむクラシック・ボードウォーゲーム'
            : 'Pe@sant — Classic board wargames in your browser';
        image.src = new URL(`banner-${locale}-compact.webp`, script.src);
    }

    function screenIsVisible() {
        if (!screen.isConnected || !screen.matches(screenSelector)) return false;
        for (let element = screen; element; element = element.parentElement) {
            if (element.hidden || (element.tagName === 'DIALOG' && !element.open)) return false;
            const { display, visibility } = getComputedStyle(element);
            if (display === 'none' || visibility === 'hidden' || visibility === 'collapse') return false;
        }
        return true;
    }

    const requestedLanguage = new URLSearchParams(location.search).get('lang');
    showBanner(requestedLanguage || peasantLanguage || pageLanguage.lang || 'ja');

    let shown = false;
    const onLanguage = new MutationObserver(() => showBanner(pageLanguage.lang || 'ja'));
    const onScreen = new MutationObserver(syncBanner);

    function syncBanner() {
        if (!screenIsVisible()) {
            if (!shown) return;
            link.remove();
            onLanguage.disconnect();
            onScreen.disconnect();
            return;
        }
        if (link.isConnected) return;
        const selector = placement || peasantBefore || peasantInside;
        const anchor = selector && document.querySelector(selector);
        if (!anchor) return;
        if (placement ? prepend : !peasantBefore && peasantInside) anchor.prepend(link);
        else anchor.before(link);
        shown = true;
    }

    onScreen.observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'],
    });
    onLanguage.observe(pageLanguage, { attributes: true, attributeFilter: ['lang'] });
    syncBanner();
})();
