(() => {
  const storageKey = 'upfront-custom-scenario-j';
  const scenarioFileFormat = 'upfront-scenario';
  const editorUnlockKey = 'upfront-scenario-editor-unlocked';
  const passwordSalt = '0f7cc864426bf9357c72520c5bec80d6';
  const passwordDigest = '910c44e8133981963af2577052a53f9b89ca16fd05d3f9797125e542118c98af';
  const aiPolicies = ['advance', 'hold', 'retreat'];
  const equipmentKinds = ['demo', 'panzerfaustHolders', 'antiTankMines', 'radioHolders'];
  const desertFactions = ['ita', 'fra'];
  const canPurchasePartisans = (faction, year) => faction === 'fra' || faction === 'ita' && year >= 1943;

  function formationPoints(team, cardCosts) {
    const radio = team.equipment?.includes('radioHolders') && desertFactions.includes(team.faction)
      ? desertRadioCost(team.faction, team.troopType, team.radioStrength ?? 5) : 0;
    const troopMultiplier = team.partisans ? 0.95 :
      ['bersaglieri', 'legionnaires'].includes(team.troopType) ? 1.15 :
      ['blackshirts', 'reservists'].includes(team.troopType) ? 0.85 : 1;
    const personnel = cardCosts.reduce((sum, cost) => sum + (cost ?? 0), 0);
    return Math.ceil(personnel * troopMultiplier) + radio;
  }
  const terrainLabels = {
    BUILDINGS: '建物', WOODS: '森林', HILL: '丘', WALL: '障壁', BRUSH: '繁み',
    GULLY: '涸れ谷', STREAM: '河川', MARSH: '湿地', PILLBOX: 'トーチカ',
    MINEFIELD: '地雷原', WIRE: '鉄条網', SMOKE: '煙幕',
  };
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'background:#292929;color:#eee;border:1px solid #888;border-radius:8px;width:760px;max-width:calc(100% - 2rem);max-height:85vh;overflow:auto';
  dialog.innerHTML = `
    <style>
      .uf-editor-tabs { display:flex; gap:6px; overflow-x:auto; padding:3px 2px 8px; border-bottom:1px solid #686868; }
      .uf-editor-tabs button { flex:none; padding:8px 12px; border:1px solid #777; border-radius:5px; background:#393939; color:#eee; }
      .uf-editor-tabs button[aria-selected="true"] { background:#dceabb; color:#202716; border-color:#dceabb; font-weight:bold; }
      .uf-editor-panel { padding:12px 0; }
      .uf-editor-panel[hidden] { display:none; }
      .uf-editor-panel fieldset { margin:0; }
      .uf-editor-formation { min-width:0; }
      .uf-editor-formation-layout { display:grid; grid-template-columns:minmax(0, 2fr) minmax(0, 3fr); gap:16px; }
      .uf-editor-roster { max-height:290px; overflow:auto; }
      .uf-editor-formation-preview { min-width:0; max-height:435px; overflow:auto; }
      .uf-editor-formation-preview h3 { margin:4px 0 8px; font-size:1em; }
      .uf-editor-formation-gallery { display:grid; grid-template-columns:repeat(auto-fill, minmax(86px, 1fr)); gap:10px; margin-bottom:12px; }
      .uf-editor-formation-gallery p { grid-column:1 / -1; margin:0; color:#ccc; }
      .uf-editor-formation-gallery figure { margin:0; min-width:0; }
      .uf-editor-formation-gallery button { display:block; width:100%; padding:0; border:0; background:none; cursor:zoom-in; }
      .uf-editor-formation-gallery button[hidden] { display:none; }
      .uf-editor-formation-gallery img { display:block; width:100%; height:auto; border-radius:4px; }
      .uf-editor-card-zoom { background:#222; color:#fff; border:1px solid #777; border-radius:8px; text-align:center; }
      .uf-editor-card-zoom::backdrop { background:rgba(0,0,0,.74); }
      .uf-editor-card-zoom img { display:block; width:auto; height:min(74vh, 680px); max-width:82vw; object-fit:contain; margin:0 auto 8px; }
      .uf-editor-weapon-chit { width:24px; height:24px; object-fit:contain; vertical-align:middle; border-radius:2px; margin:0 4px; }
      .uf-editor-formation-gallery figcaption { margin-top:3px; font-size:0.82em; overflow-wrap:anywhere; }
      @media (max-width:540px) {
        .uf-editor-formation-layout { grid-template-columns:minmax(0, 1fr); }
        .uf-editor-roster { max-height:200px; }
      }
      .uf-editor-panel td, .uf-editor-panel th { padding:5px 8px; text-align:left; }
      .uf-editor-footer { position:sticky; bottom:0; background:#292929; border-top:1px solid #686868; padding:8px 0 2px; }
      .uf-editor-footer [data-message]:empty { display:none; }
    </style>
    <form novalidate>
      <h2 id="uf-editor-title">シナリオエディタ</h2>
      <div class="uf-editor-tabs" role="tablist" aria-label="シナリオ設定">
        <button type="button" role="tab" data-tab="victory">勝利条件</button>
        <button type="button" role="tab" data-tab="special">特別ルール</button>
        <button type="button" role="tab" data-tab="sides">両軍の編成</button>
        <button type="button" role="tab" data-tab="cards">カード・山札</button>
        <button type="button" role="tab" data-tab="saved">保存</button>
      </div>
      <section class="uf-editor-panel" role="tabpanel" data-panel="victory">
        <div data-victories></div>
        <p><small>複数選んだ場合は、いずれかの条件を先に達成した側が勝ちます。同じ判定で両軍が達成した場合は引き分けです。時間切れの勝敗は、選んだ条件で判定します。</small></p>
      </section>
      <section class="uf-editor-panel" role="tabpanel" data-panel="special">
        <p><label>時間帯 <select name="timeOfDay"><option value="day">昼</option><option value="night">夜</option></select></label></p>
        <p><label>AIの方針
          <select name="aiPolicy">
            <option value="">従来どおり</option>
            <option value="advance">前進</option>
            <option value="hold">死守</option>
            <option value="retreat">後退</option>
          </select>
        </label></p>
        <div data-special></div>
      </section>
      <section class="uf-editor-panel" role="tabpanel" data-panel="sides">
        <p><label>年代 <input name="formationYear" type="number" min="1936" max="1945" placeholder="指定なし" style="width:7em"></label></p>
        <div class="uf-editor-tabs" data-side-tabs role="tablist" aria-label="編成する軍">
          <button type="button" role="tab">自軍</button>
          <button type="button" role="tab">相手軍</button>
        </div>
        <div data-sides></div>
      </section>
      <section class="uf-editor-panel" role="tabpanel" data-panel="cards">
        <p>除外枚数を指定すると、手札から捨てたカードや判定に出たカードを最初の指定枚数まで両軍共通で除外します。その後、残りは地形として使えます。</p>
        <p>「非機能」はチェックした側に対局を通して適用します。同じ地形に「特別ルール」の除外枚数もある場合は、多い方を使います。</p>
        <table>
          <thead><tr><th>カード</th><th>攻撃側で非機能</th><th>守備側で非機能</th><th>最初に除外する枚数</th></tr></thead>
          <tbody data-terrain></tbody>
        </table>
      </section>
      <section class="uf-editor-panel" role="tabpanel" data-panel="saved">
        <label>シナリオ名 <input name="scenarioName" maxlength="60" required value="自由シナリオ"></label>
        <p><button type="button" data-open-file>ファイルから読み込む</button><input type="file" data-scenario-file accept=".json,application/json" hidden></p>
        <p data-browser-saves hidden><label>以前のブラウザ保存 <select name="saved"></select></label> <button type="button" data-load>呼び出す</button></p>
      </section>
      <div class="uf-editor-footer">
      <p data-message role="status"></p>
      <button type="button" data-close>閉じる</button>
      <button type="button" data-save>ファイルに保存</button>
      <button type="submit">決定して試遊</button>
      </div>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const message = dialog.querySelector('[data-message]');
  let usingDefaultName = true;
  form.elements.scenarioName.addEventListener('input', () => { usingDefaultName = false; });
  dialog.setAttribute('aria-labelledby', 'uf-editor-title');
  const cardZoom = document.createElement('dialog');
  cardZoom.className = 'uf-editor-card-zoom';
  cardZoom.innerHTML = '<img alt=""><button type="button" autofocus>閉じる</button>';
  document.body.append(cardZoom);
  const zoomImage = cardZoom.querySelector('img');
  cardZoom.querySelector('button').addEventListener('click', () => cardZoom.close());
  cardZoom.addEventListener('click', event => {
    if (event.target === cardZoom) cardZoom.close();
  });
  function bindTabs(tabs, panels, idPrefix) {
    function selectTab(index, focus = false) {
      tabs.forEach((tab, position) => {
        const active = position === index;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[position].hidden = !active;
      });
      if (focus) tabs[index].focus();
    }
    tabs.forEach((tab, index) => {
      const panel = panels[index];
      tab.id = `${idPrefix}-tab-${index}`;
      panel.id = `${idPrefix}-panel-${index}`;
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('aria-labelledby', tab.id);
      tab.addEventListener('click', () => selectTab(index));
      tab.addEventListener('keydown', event => {
        const target = { ArrowLeft: (index + tabs.length - 1) % tabs.length,
          ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
        if (target == null) return;
        event.preventDefault();
        selectTab(target, true);
      });
    });
    selectTab(0);
    return selectTab;
  }
  const tabs = Array.from(dialog.querySelectorAll('[data-tab]'));
  const selectTab = bindTabs(tabs, tabs.map(tab => dialog.querySelector(`[data-panel="${tab.dataset.tab}"]`)), 'uf-editor');
  function showTab(name) {
    selectTab(tabs.findIndex(tab => tab.dataset.tab === name));
  }

  const presets = Object.values(window.SCENARIOS).filter(scenario => /^[A-X]$/.test(scenario.id));
  const specialChoices = new Map();
  const victoryChoices = new Map();
  const victoryDetails = {
    A: '距離チット4の防御地形に、ピン状態でないカードを合計4枚以上確保する。',
    B: '時間切れに、建物だけの陣地点と損害点の合計で勝負する。',
    C: '守備側Bグループを全滅させるか、トーチカを放棄させる。',
    D: '攻撃側が守備側と相対距離5の防御地形にピン状態でないカードを合計5枚確保するか、守備側を残り1グループにして損害で上回る。',
    E: '距離チット4の防御地形に、ピン状態でないカードを合計4枚以上確保する。時間切れは守備側の勝利。',
  };
  function addSpecial(key, label, rule) {
    const check = document.createElement('input');
    check.type = 'checkbox';
    const field = document.createElement('label');
    field.style.display = 'block';
    field.append(check, label);
    field.dataset.ruleSource = key[0];
    dialog.querySelector('[data-special]').append(field);
    specialChoices.set(key, { check, label, rule });
  }
  for (const preset of presets) {
    for (const [key, prefix] of [['treatAsPlain', '非機能'], ['treatAsPlainAttacker', '攻撃側だけ非機能']]) {
      const types = preset[key] || [];
      if (types.length) addSpecial(preset.id + key,
        `${preset.id} ${prefix} — ${types.map(type => terrainLabels[type] || type).join('・')}`, { [key]: types });
    }
    (preset.deckRemovals || []).forEach((rule, index) => addSpecial(preset.id + 'remove' + index,
      `${preset.id} 捨て札・判定に出た最初の${terrainLabels[rule.type] || rule.type}${rule.count}枚を除外`, { deckRemoval: rule }));
  }
  const fromImages = [
    ['C1', '守備側のグループBをトーチカに置いて開始', { defenderPillbox: true }],
    ['F1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['G1', '守備側の初期手札に防御−3の建物を追加', { defenderBonusBuilding: true }],
    ['G2', '攻撃側だけ狙撃を非機能にする', { treatAsPlainAttacker: ['SNIPER'] }],
    ['G3', 'トーチカ・湿地・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MARSH', 'MINEFIELD'] }],
    ['H1', '第2山から増援の登場を許可。増援カードは「両軍の編成」で指定', { reservesAfter: 1 }],
    ['H2', 'トーチカと地雷原を非機能にし、攻撃側の狙撃も非機能にする',
      { treatAsPlain: ['PILLBOX', 'MINEFIELD'], treatAsPlainAttacker: ['SNIPER'] }],
    ['H3', '守備側の初期手札に使用可能な地形を最低1枚確保', { defenderGuaranteedTerrain: true }],
    ['I1', 'トーチカを非機能にする', { treatAsPlain: ['PILLBOX'] }],
    ['I2', 'ドイツ軍の狙撃・地雷原を非機能にし、ソ連軍をパルチザンとして扱う', { partisans: 'rus', treatAsPlainAttacker: ['SNIPER', 'MINEFIELD'] }],
    ['K1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['K2', '攻撃側が第1区間に勝つと、生き残った攻撃側と元の守備側で再編成する。山札は残りを引き継ぐ', { twoSegments: true }],
    ['K3', '第2区間で狙撃と印刷武器を回復。鹵獲武器は持ち越さず、攻撃側の負傷は引き継ぐ', { restoreSegmentWeapons: true }],
    ['L1', '守備側は塹壕に入って開始でき、初期地形の押し付けを受けない', { openingTrenches: true }],
    ['L2', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['M1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['N1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['O1', '守備側のグループBをトーチカに置いて開始', { defenderPillbox: true }],
    ['O2', '攻撃側だけ地雷原・狙撃を非機能にする', { treatAsPlainAttacker: ['MINEFIELD', 'SNIPER'] }],
    ['P1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['P2', '守備側は3〜4グループで距離2から開始。初期地形を置いた後、グループごとに1人をRNCで負傷兵にする', { evacuationSetup: true }],
    ['Q1', 'トーチカ・地雷原を非機能にし、攻撃側の狙撃・鉄条網・河川も非機能にする',
      { treatAsPlain: ['PILLBOX', 'MINEFIELD'], treatAsPlainAttacker: ['SNIPER', 'WIRE', 'STREAM'] }],
    ['Q2', '守備側は適した地形に塹壕を掘って開始できる', { setupTrenches: true }],
    ['Q3', '日本軍が参加する対戦でジャングル地形ルールを使う', { japanJungle: true }],
    ['S1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['S2', '守備側は塹壕に入って開始でき、初期地形の押し付けを受けない', { openingTrenches: true }],
    ['T1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['U1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['V1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['V2', '攻撃側に国籍別の精鋭能力を適用し、士気1の兵士を2にする', { eliteAttackers: true }],
    ['V3', '黒6のRNCまたは山札の再編成後に守備側が増援判定。移動カードの色でEかZから登場', { randomDefenderReinforcements: true }],
    ['W1', 'トーチカ・地雷原を非機能にする', { treatAsPlain: ['PILLBOX', 'MINEFIELD'] }],
    ['W2', '守備側が建物で開始し、その建物から離れるとカードを除外する', { openingBuildings: true }],
    ['W3', '守備側は士気3の小銃兵1人を除きピン状態で開始。被射撃・爆薬攻撃を生き延びる・自ら攻撃した次の手番のいずれかまで通常回復不可。ヒーローは使用可', { surprisePinning: true }],
    ['W4', '守備側はヒーロー以外で兵士を1人回復するまで狙撃不可', { surpriseSniper: true }],
  ];
  for (const [key, label, rule] of fromImages) {
    addSpecial(key, `${key}　${label}${rule ? '' : '（未実装）'}`, rule);
    specialChoices.get(key).check.disabled = !rule;
  }
  for (const [id, count] of Object.entries({ F: 4, H: 4, I: 6, K: 4, L: 5, M: 5, T: 4, U: 4, V: 4, X: 4 })) {
    addSpecial(id + 'buildings', `${id} 捨て札・判定に出た最初の建物${count}枚を除外`,
      { deckRemoval: { type: 'BUILDINGS', count, trigger: 'firstDiscard' } });
  }
  const specialList = dialog.querySelector('[data-special]');
  const specialRows = Array.from(specialList.children);
  for (const id of 'ABCDEFGHIKLMNOPQRSTUVWX') {
    const group = document.createElement('fieldset');
    group.style.marginBottom = '8px';
    const heading = document.createElement('legend');
    heading.textContent = id;
    group.append(heading);
    const rows = specialRows.filter(row => row.dataset.ruleSource === id);
    if (rows.length) group.append(...rows);
    else group.append('指定画像に特別ルール欄なし。');
    if (id === 'X') group.append('特別ルール画像はなく、編成カードの山札除外設定を表示しています。');
    specialList.append(group);
  }
  Object.assign(victoryDetails, {
    F: '防御地形の距離4に、ピン状態でないカードを合計4枚置く。時間切れは守備側の勝利。',
    G: '時間切れに、建物の陣地点と損害点で攻撃側が守備側の2倍以上を取る。',
    H: '攻撃側が防御地形の距離5に、ピン状態でないカードを合計5枚置く。',
    I: '攻撃側の初期兵力の半数が距離5に達し、攻撃側の損害点が守備側の損害点と陣地点の合計を上回る。',
    K: '各区間で、先に距離4の防御地形にピン状態でないカードを合計4枚確保した側が勝つ。攻撃側は両区間を制する必要がある（K2が必要）。',
    L: '攻撃側が防御地形の距離5に、ピン状態でないカードを合計4枚置く。',
    M: '防御地形の距離4に、ピン状態でないカードを合計4枚置く。',
    N: '時間切れに、森林扱いの地形の陣地点と損害点で上回る。ジャングル地形ルールを使用。',
    O: 'トーチカの守備隊を全滅させるか、トーチカを放棄させる。',
    P: '攻撃側は距離5の防御地形にピン状態でないカード4枚を確保すると勝利。守備側は初期負傷兵2人をピン状態の兵がいない防御地形に置き、全攻撃グループと相対距離0にすると勝利（P2が必要）。',
    Q: '攻撃側が、守備側との相対距離5で防御地形にいる、ピン状態でないカードを合計5枚確保する。',
    S: '攻撃側が防御地形の距離5に、ピン状態でないカードを合計4枚置く。',
    T: '防御地形の距離4に、ピン状態でないカードを合計4枚置く。',
    U: '防御地形の距離4または5に、ピン状態でないカードを合計4枚置く。',
    V: '攻撃側が守備隊を崩壊させる。',
    W: '攻撃側が1か所以上の建物を占め、占拠数で守備側に並ぶか上回る。',
  });
  const victoryList = document.createElement('ul');
  dialog.querySelector('[data-victories]').append(victoryList);
  for (const id of 'ABCDEFGHIKLMNOPQSTUVW') {
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = id === 'B';
    const item = document.createElement('li');
    const label = document.createElement('label');
    label.append(check, `${id}　${victoryDetails[id]}`);
    item.append(label);
    victoryList.append(item);
    victoryChoices.set(id, check);
  }

  const terrainRows = new Map();
  const cardTypes = new Map(Object.entries(terrainLabels));
  for (const card of TERRAIN_CARDS) {
    for (const type of [card.type, card.rightType]) {
      if (type && !cardTypes.has(type)) cardTypes.set(type, type);
    }
  }
  for (const [type, label] of cardTypes) {
    const row = document.createElement('tr');
    const printedCount = Object.hasOwn(terrainLabels, type)
      ? TERRAIN_CARDS.filter(card => card.type === type).length : 0;
    row.innerHTML = `<th scope="row">${label}</th>
      <td><input type="checkbox" aria-label="攻撃側で${label}を非機能にする"></td>
      <td><input type="checkbox" aria-label="守備側で${label}を非機能にする"></td>
      <td>${printedCount ? `<input type="number" min="1" max="${printedCount}" placeholder="なし" aria-label="${label}を最初に除外する枚数" style="width:5em">` : '—'}</td>`;
    dialog.querySelector('[data-terrain]').append(row);
    const [attacker, defender, removalCount] = row.querySelectorAll('input');
    terrainRows.set(type, { attacker, defender, removalCount });
  }

  function buildDeckRemovals(counts, rules) {
    const removals = new Map(Object.entries(counts));
    for (const { deckRemoval } of rules) {
      if (!deckRemoval) continue;
      const { type, count } = deckRemoval;
      removals.set(type, Math.max(count, removals.get(type) || 0));
    }
    return Array.from(removals, ([type, count]) => ({ type, count, trigger: 'firstDiscard' }));
  }

  function availability(definition) {
    const date = /(?:登場|利用可能)\s*[：:]?\s*((?:\d{1,2}\/)?\d{4}(?:年(?:\d{1,2}月)?)?\s*(?:[-–—〜～]\s*(?:\d{1,2}\/)?\d{4})?)/.exec(definition?.noteBack || '');
    const years = date?.[1].match(/\d{4}/g)?.map(Number);
    return years ? { from: years[0], until: years[1] } : null;
  }

  function cardAvailableInYear(definition, year) {
    const dates = availability(definition);
    return !year || !dates || (year >= dates.from && (dates.until == null || year <= dates.until));
  }

  function printedPoints(definition) {
    if (!definition || definition.pt == null || !/^\d+$/.test(String(definition.pt).trim())) return null;
    return Number(definition.pt);
  }

  const h1Choice = specialChoices.get('H1');
  const h1Deck = h1Choice.rule.reservesAfter + 1;
  let deckCycles = 3;
  const sides = ['自軍', '相手軍'].map((label, index) => {
    const panel = document.createElement('section');
    panel.className = 'uf-editor-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.innerHTML = `<fieldset class="uf-editor-formation">
      <legend>${label}</legend>
      <div class="uf-editor-formation-layout">
        <div data-roster-controls>
          <label>陣営 <select></select></label>
          <div data-desert-troops hidden>
            <label>部隊種別 <select data-troop-type></select></label>
            <label><input type="checkbox" data-partisans> パルチザン（§37）</label>
          </div>
          <p><label>ポイント上限 <input data-point-limit type="number" min="1" max="99999" placeholder="上限なし" style="width:7em"></label>
          <span data-count aria-live="polite"></span></p>
          <div data-roster class="uf-editor-roster"></div>
          <details data-reserve-panel>
            <summary>増援</summary>
            <p><label>登場可能になる山札 <input data-reserve-deck type="number" min="1" step="1" value="${h1Deck}" style="width:4em"></label></p>
            <p><small>開始時の編成と別のカードを選びます。指定した山札に入ると、移動カードで登場できます。</small></p>
            <div data-reserves style="max-height:175px;overflow:auto"></div>
          </details>
          <div data-equipment style="margin-top:12px">
            <b>持ち込む装備</b>
            <label data-radio-strength-control hidden>無線支援の射撃力
              <select data-radio-strength><option>5</option><option>6</option><option>7</option></select>
              <span data-radio-cost></span>
            </label>
          </div>
        </div>
        <aside class="uf-editor-formation-preview">
          <h3>選択したカード</h3>
          <div data-selected-cards class="uf-editor-formation-gallery"></div>
          <section data-reserve-preview hidden>
            <h3>増援</h3>
            <div data-selected-reserves class="uf-editor-formation-gallery"></div>
          </section>
        </aside>
      </div>
    </fieldset>`;
    const field = panel.firstElementChild;
    const faction = field.querySelector('select');
    const preview = field.querySelector('[data-selected-cards]');
    const reservePreview = field.querySelector('[data-reserve-preview]');
    const reserveGallery = field.querySelector('[data-selected-reserves]');
    const roster = field.querySelector('[data-roster]');
    const count = field.querySelector('[data-count]');
    const pointLimit = field.querySelector('[data-point-limit]');
    const year = form.elements.formationYear;
    const reserveDeck = field.querySelector('[data-reserve-deck]');
    const reserves = field.querySelector('[data-reserves]');
    for (const [key, team] of Object.entries(FACTIONS)) faction.add(new Option(team.name, key));
    faction.value = index ? 'us' : 'ger';
    const numbersOf = list => Array.from(list.querySelectorAll('input:checked'), input => Number(input.value));
    const selected = () => numbersOf(roster);
    const selectedReserves = () => numbersOf(reserves);
    const equipment = field.querySelector('[data-equipment]');
    const troopControls = field.querySelector('[data-desert-troops]');
    const troopType = field.querySelector('[data-troop-type]');
    const partisans = field.querySelector('[data-partisans]');
    const radioStrength = field.querySelector('[data-radio-strength]');
    const radioStrengthControl = field.querySelector('[data-radio-strength-control]');
    const radioCost = field.querySelector('[data-radio-cost]');
    const equipmentControls = equipmentKinds.map(kind => {
      const label = document.createElement('label');
      label.style.display = 'block';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.equipmentKind = kind;
      const icon = document.createElement('img');
      icon.className = 'uf-editor-weapon-chit';
      icon.alt = '';
      label.append(input, icon, secondaryWeaponLabel(kind, false));
      equipment.append(label);
      return { kind, input, icon };
    });
    const selectedEquipment = () => equipmentControls.filter(({ input }) => input.checked && !input.disabled)
      .map(({ kind }) => kind);
    const options = () => troopControls.hidden ? {} : {
      troopType: partisans.checked ? 'regular' : troopType.value,
      partisans: partisans.checked,
      radioStrength: Number(radioStrength.value),
    };
    function showCards(gallery, numbers) {
      const cards = numbers.map(num => {
        const def = getSoldierDef(faction.value, num);
        const name = `#${def.cardNumber ?? num} ${def.name}`;
        const card = document.createElement('figure');
        const front = document.createElement('img');
        front.src = soldierFrontImage(faction.value, num, def);
        front.alt = name;
        const enlarge = document.createElement('button');
        enlarge.type = 'button';
        enlarge.title = 'Shift＋クリックで拡大';
        enlarge.setAttribute('aria-label', `${name}を拡大`);
        enlarge.append(front);
        front.addEventListener('error', () => { enlarge.hidden = true; });
        enlarge.addEventListener('click', event => {
          if (!event.shiftKey && event.detail !== 0) return;
          zoomImage.src = front.src;
          zoomImage.alt = name;
          cardZoom.setAttribute('aria-label', name);
          cardZoom.showModal();
        });
        const caption = document.createElement('figcaption');
        caption.textContent = name;
        card.append(enlarge, caption);
        return card;
      });
      if (!cards.length) {
        const empty = document.createElement('p');
        empty.textContent = 'カードが選択されていません。';
        cards.push(empty);
      }
      gallery.replaceChildren(...cards);
    }
    function updatePreview() {
      showCards(preview, selected());
      const reinforcements = selectedReserves();
      reservePreview.hidden = !reinforcements.length;
      showCards(reserveGallery, reinforcements);
    }
    function updateRoster() {
      const starters = selected();
      const reinforcements = selectedReserves();
      const chosen = [...starters, ...reinforcements];
      const costs = chosen.map(num => printedPoints(getSoldierDef(faction.value, num)));
      const selectedYear = year.valueAsNumber;
      partisans.disabled = !canPurchasePartisans(faction.value, selectedYear);
      if (partisans.disabled) partisans.checked = false;
      troopType.disabled = partisans.checked;
      const team = { faction: faction.value, equipment: selectedEquipment(), ...options() };
      radioStrengthControl.hidden = troopControls.hidden || !team.equipment.includes('radioHolders');
      radioCost.textContent = radioStrengthControl.hidden ? '' :
        `${desertRadioCost(team.faction, team.troopType, team.radioStrength)} pt`;
      const known = formationPoints(team, costs);
      const total = costs.includes(null) ? `${known} pt ＋未登録` : `${known} pt`;
      count.textContent = ` 選択 ${starters.length}枚 / ${total}${pointLimit.value ? ' / 上限 ' + pointLimit.value : ''}`;
      for (const input of [...roster.querySelectorAll('input'), ...reserves.querySelectorAll('input')]) {
        const num = Number(input.value);
        const allowed = cardAvailableInYear(getSoldierDef(faction.value, num), selectedYear);
        const otherCards = reserves.contains(input) ? starters : reinforcements;
        input.disabled = !input.checked && (!allowed || otherCards.includes(num));
        input.parentElement.querySelector('[data-year-warning]').hidden = allowed;
      }
      updatePreview();
    }
    function draw(numbers = [], reserveNumbers = [], equipment = [], team = {}) {
      troopControls.hidden = !desertFactions.includes(faction.value);
      troopType.replaceChildren(new Option('通常部隊', 'regular'), ...(troopControls.hidden ? [] :
        BASIC_TROOP_TYPES[faction.value].map(([key, label]) => new Option(label, key))));
      troopType.value = team.troopType || 'regular';
      partisans.checked = team.partisans === true;
      radioStrength.value = team.radioStrength ?? 5;
      for (const { kind, input, icon } of equipmentControls) {
        input.disabled = (kind === 'panzerfaustHolders' && faction.value !== 'ger') ||
          (kind === 'antiTankMines' && !['ger','rus'].includes(faction.value));
        input.checked = !input.disabled && equipment.includes(kind);
        icon.src = setupEquipmentImage(kind, faction.value);
      }
      roster.replaceChildren();
      reserves.replaceChildren();
      const cards = SOLDIER_CARDS[faction.value]
        .filter(def => def.weaponCat !== 'AFV' || (def.afv && !def.afvButtoned))
        .filter(def => !def.weaponCat.startsWith('対戦車砲') || def.infantryGun)
        .sort((a, b) => (a.cardNumber ?? a.num) - (b.cardNumber ?? b.num));
      for (const def of cards) {
        const row = document.createElement('label');
        row.style.display = 'block';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = def.num;
        input.checked = numbers.includes(def.num);
        const yearWarning = document.createElement('small');
        yearWarning.dataset.yearWarning = '';
        yearWarning.textContent = '（指定年代の対象外）';
        const points = printedPoints(def);
        row.append(input, ` #${def.cardNumber ?? def.num} ${def.name} ${def.weaponCat} · ${points ?? '未登録'} pt`, yearWarning);
        roster.append(row);
        const reserveRow = row.cloneNode(true);
        reserveRow.firstChild.checked = reserveNumbers.includes(def.num);
        reserves.append(reserveRow);
      }
      updateRoster();
    }
    faction.addEventListener('change', () => draw());
    roster.addEventListener('change', () => updateRoster());
    reserves.addEventListener('change', () => updateRoster());
    equipment.addEventListener('change', () => updateRoster());
    troopControls.addEventListener('change', () => updateRoster());
    pointLimit.addEventListener('input', () => updateRoster());
    year.addEventListener('input', () => updateRoster());
    dialog.querySelector('[data-sides]').append(panel);
    return { panel, faction, selected, selectedReserves, selectedEquipment, options, draw, reserveDeck, pointLimit };
  });
  const sideTabs = Array.from(dialog.querySelector('[data-side-tabs]').children);
  const selectSideTab = bindTabs(sideTabs, sides.map(side => side.panel), 'uf-editor-side');
  function showFormation(index) {
    showTab('sides');
    selectSideTab(index);
  }
  function updateReserveTiming() {
    for (const { reserveDeck } of sides) {
      reserveDeck.max = deckCycles;
      reserveDeck.disabled = h1Choice.check.checked;
      if (reserveDeck.disabled) reserveDeck.value = h1Deck;
    }
  }
  h1Choice.check.addEventListener('change', updateReserveTiming);

  function jungleMatch(first, second) {
    return first === 'jpn' || second === 'jpn';
  }

  function collect() {
    const invalid = form.querySelector('input:invalid:not([data-reserve-deck])');
    if (invalid) {
      showTab(invalid.closest('[data-panel]').dataset.panel);
      const sideIndex = sides.findIndex(side => side.panel.contains(invalid));
      if (sideIndex >= 0) selectSideTab(sideIndex);
      invalid.reportValidity();
      return null;
    }
    const formationYear = form.elements.formationYear.valueAsNumber || null;
    const [player, opponent] = sides.map(side => ({
      faction: side.faction.value,
      soldiers: side.selected(),
      reserves: side.selectedReserves(),
      equipment: side.selectedEquipment(),
      pointLimit: side.pointLimit.valueAsNumber || null,
      ...side.options(),
    }));
    if (player.faction === opponent.faction) {
      showTab('sides');
      message.textContent = '自軍と相手軍は別の陣営を選んでください。';
      return null;
    }
    const emptySide = [player, opponent].findIndex(side => !side.soldiers.length);
    if (emptySide >= 0) {
      showFormation(emptySide);
      message.textContent = `${emptySide ? '相手軍' : '自軍'}の開始時の部隊カードを選んでください。`;
      return null;
    }
    for (const [index, team] of [player, opponent].entries()) {
      const cardDefinitions = [...team.soldiers, ...team.reserves].map(num => getSoldierDef(team.faction, num));
      const unavailable = cardDefinitions.find(def => !cardAvailableInYear(def, formationYear));
      const starters = cardDefinitions.slice(0, team.soldiers.length);
      const groundCards = starters.filter(def => def && !def.afv);
      const vehicles = starters.length - groundCards.length;
      if ((groundCards.length === 1 && !canFormSoloGroup(groundCards[0])) ||
          vehicles + Math.ceil(groundCards.length / 10) > 4) {
        showFormation(index);
        message.textContent = `${index ? '相手軍' : '自軍'}は4グループ以内で編成してください。歩兵は2〜10枚ずつ、車両は1両ずつです。歩兵砲は単独でも編成できます。`;
        return null;
      }
      const costs = cardDefinitions.map(printedPoints);
      const total = formationPoints(team, costs);
      const name = index ? '相手軍' : '自軍';
      if (team.partisans) {
        const error = partisanFormationError({ partisans: team.faction }, team.faction, [...team.soldiers, ...team.reserves]);
        if (error) {
          showFormation(index);
          message.textContent = error;
          return null;
        }
      }
      if (unavailable || (team.pointLimit && (costs.includes(null) || total > team.pointLimit))) {
        showFormation(index);
        if (unavailable) message.textContent = `${name}の #${unavailable.cardNumber ?? unavailable.num} ${unavailable.name} は${formationYear}年に編成できません。`;
        else if (costs.includes(null)) message.textContent = `${name}の編成にポイント未登録のカードがあります。`;
        else message.textContent = `${name}の編成は増援を含めて${total} ptです。上限は${team.pointLimit} ptです。`;
        return null;
      }
      if (planSetupEquipment(team.soldiers, team.faction, team.equipment).size < team.equipment.length) {
        showFormation(index);
        message.textContent = `${name}に、持ち込む装備を分担できる兵士を選んでください。副次兵器は1人につき1つです。`;
        return null;
      }
      const squadSizes = { ger:10, us:12, rus:15 };
      const limit = { ger:2, us:1, rus:3 }[team.faction];
      const infantry = team.soldiers.filter(number => {
        const def = getSoldierDef(team.faction, number);
        return !def?.afv && !def?.infantryGun;
      }).length;
      const max = limit * Math.ceil(infantry / squadSizes[team.faction]);
      const antiTank = team.equipment.filter(kind => kind === 'panzerfaustHolders' || kind === 'antiTankMines').length;
      if (limit && antiTank > max) {
        showFormation(index);
        message.textContent = `この編成で指定できる対戦車用の副次兵器は${max}個までです。`;
        return null;
      }
    }
    if (h1Choice.check.checked && !player.reserves.length && !opponent.reserves.length) {
      showTab('sides');
      message.textContent = 'H1の増援を自軍か相手軍から選んでください。';
      return null;
    }
    for (const [index, team] of [player, opponent].entries()) {
      if (!team.reserves.length) continue;
      const reserveDeck = sides[index].reserveDeck;
      const hasVehicle = team.reserves.some(num => getSoldierDef(team.faction, num)?.afv);
      if (team.reserves.some(num => team.soldiers.includes(num)) || team.reserves.length > (hasVehicle ? 1 : 10)) {
        showFormation(index);
        reserveDeck.closest('details').open = true;
        message.textContent = '増援は開始時と重ならないカードから、歩兵など10枚まで、または車両1両を選んでください。';
        return null;
      }
      team.reserveDeck = h1Choice.check.checked ? h1Deck : reserveDeck.valueAsNumber;
      if (!Number.isInteger(team.reserveDeck) || team.reserveDeck < 1 || team.reserveDeck > deckCycles) {
        showFormation(index);
        reserveDeck.closest('details').open = true;
        message.textContent = h1Choice.check.checked
          ? `このシナリオは第${deckCycles}山までです。H1の増援は第${h1Deck}山から登場できます。`
          : `増援が登場可能になる山札を第1山〜第${deckCycles}山から指定してください。`;
        return null;
      }
    }
    const terrainRules = { treatAsPlainAttacker: [], treatAsPlainDefender: [], terrainRemovalCounts: {} };
    for (const [type, { attacker, defender, removalCount }] of terrainRows) {
      if (attacker.checked) terrainRules.treatAsPlainAttacker.push(type);
      if (defender.checked) terrainRules.treatAsPlainDefender.push(type);
      if (removalCount?.value) terrainRules.terrainRemovalCounts[type] = removalCount.valueAsNumber;
    }
    const name = form.elements.scenarioName.value.trim();
    if (!name || /[<>]/.test(name)) {
      showTab('saved');
      message.textContent = 'シナリオ名を入力してください。';
      return null;
    }
    const victories = Array.from(victoryChoices).filter(([, check]) => check.checked).map(([key]) => key);
    if (!victories.length) {
      showTab('victory');
      message.textContent = '勝利条件を1つ以上選んでください。';
      return null;
    }
    const defenderInfantry = opponent.soldiers.filter(num => !getSoldierDef(opponent.faction, num)?.afv).length;
    const defenderVehicles = opponent.soldiers.length - defenderInfantry;
    const special = Array.from(specialChoices).filter(([, choice]) => !choice.check.disabled && choice.check.checked).map(([key]) => key);
    const rules = special.map(key => specialChoices.get(key).rule);
    const blockedForDefender = new Set([...terrainRules.treatAsPlainDefender,
      ...rules.flatMap(rule => rule.treatAsPlain || [])]);
    const unavailableTerrain = new Set([...blockedForDefender,
      ...buildDeckRemovals(terrainRules.terrainRemovalCounts, rules).map(rule => rule.type)]);
    const pillboxStart = victories.some(id => id === 'C' || id === 'O') || rules.some(rule => rule.defenderPillbox);
    if (pillboxStart) {
      const holders = planSetupEquipment(opponent.soldiers, opponent.faction, opponent.equipment);
      const size = editorPillboxSize(opponent.soldiers, opponent.faction, new Set(holders.values()));
      if (size < 2 || Math.ceil((defenderInfantry - size) / 10) + 1 + defenderVehicles > 4) {
        showTab('sides');
        message.textContent = '守備側は、トーチカに入れる兵士2名以上を含め、トーチカの外にも1グループを編成してください。';
        return null;
      }
      if (unavailableTerrain.has('PILLBOX')) {
        showTab('cards');
        message.textContent = 'トーチカを使う勝利条件や特別ルールには、使用可能なトーチカが必要です。';
        return null;
      }
    }
    if ((victories.includes('K') || special.includes('K3')) && !special.includes('K2')) {
      showTab('special');
      message.textContent = 'Kの勝利条件とK3には、区間を切り替えるK2が必要です。';
      return null;
    }
    if (victories.includes('P') && !special.includes('P2')) {
      showTab('special');
      message.textContent = 'Pの勝利条件には初期負傷兵が必要です。P2を選択してください。';
      return null;
    }
    if (special.includes('P2') && (defenderVehicles || defenderInfantry < 6 || opponent.soldiers.some(num =>
        getSoldierDef(opponent.faction, num)?.infantryGun))) {
      showFormation(1);
      message.textContent = 'P2では守備側に歩兵を6名以上選び、車両と歩兵砲を外してください。';
      return null;
    }
    if (special.includes('P2') && (victories.some(id => id === 'C' || id === 'O') ||
        rules.some(rule => rule.defenderPillbox))) {
      showTab('special');
      message.textContent = 'P2の守備側編成とトーチカ開始は併用できません。';
      return null;
    }
    if (special.includes('I2')) {
      const error = player.faction === 'ger' && opponent.faction === 'rus'
        ? partisanFormationError({ partisans: 'rus' }, 'rus', [...opponent.soldiers, ...opponent.reserves])
        : 'I2を使うには、攻撃側をドイツ軍、守備側をソ連軍に指定してください。';
      if (error) {
        showTab('sides');
        message.textContent = error;
        return null;
      }
    }
    const jungleGame = victories.includes('N') || (special.includes('Q3') && jungleMatch(player.faction, opponent.faction));
    if (jungleGame && (special.includes('W2') || special.includes('G1'))) {
      showTab('special');
      message.textContent = 'ジャングルでは建物が森林になるため、建物で開始するW2とG1は併用できません。';
      return null;
    }
    if (special.includes('W2') && (blockedForDefender.has('BUILDINGS') ||
        victories.some(id => id === 'C' || id === 'O') || rules.some(rule => rule.defenderPillbox))) {
      showTab('special');
      message.textContent = 'W2には使用可能な建物が必要です。トーチカ開始とは併用できません。';
      return null;
    }
    if (special.includes('W3') && !opponent.soldiers.some(num =>
        surpriseReadyRifleman(getSoldierDef(opponent.faction, num)))) {
      showFormation(1);
      message.textContent = 'W3を使うには守備側に士気3の小銃兵が1人以上必要です。';
      return null;
    }
    if (rules.some(rule => rule.defenderBonusBuilding) && unavailableTerrain.has('BUILDINGS')) {
      showTab('special');
      message.textContent = 'G1を使うには、開始時に建物を使用できる設定にしてください。';
      return null;
    }
    if (rules.some(rule => rule.defenderGuaranteedTerrain) && !TERRAIN_CARDS.some(card =>
        Object.hasOwn(terrainLabels, card.type) && !unavailableTerrain.has(card.type) &&
        !['SMOKE', 'WIRE', 'MINEFIELD'].includes(card.type))) {
      showTab('special');
      message.textContent = 'H3を使うには、初期配置に使用できる地形が必要です。';
      return null;
    }
    const timeOfDay = form.elements.timeOfDay.value;
    const aiPolicy = form.elements.aiPolicy.value || undefined;
    return { name, player, opponent, formationYear, deckCycles, timeOfDay, aiPolicy, ...terrainRules, victories, special };
  }

  function library() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      return Array.isArray(value) ? value.filter(entry => typeof entry?.name === 'string' &&
        Array.isArray(entry.player?.soldiers) && Array.isArray(entry.opponent?.soldiers)) : [];
    } catch { return []; }
  }
  function refreshLibrary() {
    const entries = library();
    const select = form.elements.saved;
    select.replaceChildren(new Option('選択してください', ''));
    for (const entry of entries) select.add(new Option(entry.name, entry.name));
    select.closest('[data-browser-saves]').hidden = !entries.length;
  }
  function load(saved) {
    if (saved) form.elements.formationYear.value = saved.formationYear ?? '';
    sides.forEach((side, index) => {
      const team = saved?.[index ? 'opponent' : 'player'];
      if (team && Object.hasOwn(FACTIONS, team.faction)) side.faction.value = team.faction;
      if (saved) {
        side.pointLimit.value = team?.pointLimit ?? '';
        side.reserveDeck.value = team?.reserveDeck ?? h1Deck;
      }
      const equipment = saved ? (team?.equipment || equipmentKinds.filter(kind =>
        team?.secondary?.[kind === 'demo' ? 'demoHolders' : kind]?.length)) : side.selectedEquipment();
      side.draw(team?.soldiers || side.selected(), saved ? (team?.reserves || []) : side.selectedReserves(), equipment,
        team || side.options());
    });
    if (saved) {
      form.elements.scenarioName.value = saved.name;
      usingDefaultName = false;
      deckCycles = saved.deckCycles ?? 3;
      form.elements.timeOfDay.value = saved.timeOfDay === 'night' ? 'night' : 'day';
      form.elements.aiPolicy.value = aiPolicies.includes(saved.aiPolicy) ? saved.aiPolicy : '';
      for (const [key, check] of victoryChoices) check.checked = (saved.victories || [saved.victory || 'B']).includes(key);
      for (const [key, choice] of specialChoices) choice.check.checked = (saved.special || []).includes(key);
      for (const [type, { attacker, defender, removalCount }] of terrainRows) {
        const bothSides = saved.treatAsPlain?.includes(type);
        attacker.checked = bothSides || !!saved.treatAsPlainAttacker?.includes(type);
        defender.checked = bothSides || !!saved.treatAsPlainDefender?.includes(type);
        if (removalCount) removalCount.value = saved.terrainRemovalCounts?.[type] ?? '';
      }
    }
    updateReserveTiming();
    message.textContent = '';
  }
  const passwordDialog = document.createElement('dialog');
  passwordDialog.style.cssText = 'background:#292929;color:#eee;border:1px solid #888;border-radius:8px;max-width:calc(100% - 2rem)';
  passwordDialog.setAttribute('aria-labelledby', 'uf-editor-password-title');
  passwordDialog.innerHTML = `
    <form>
      <h2 id="uf-editor-password-title">シナリオエディタ</h2>
      <p><label>パスワード <input type="password" required autofocus autocomplete="off"></label></p>
      <p data-password-message role="status" hidden></p>
      <button type="button" data-password-cancel>キャンセル</button>
      <button type="submit">開く</button>
    </form>`;
  document.body.append(passwordDialog);
  const passwordForm = passwordDialog.querySelector('form');
  const passwordInput = passwordForm.querySelector('input');
  const passwordMessage = passwordForm.querySelector('[data-password-message]');
  const passwordSubmit = passwordForm.querySelector('[type="submit"]');
  let editorUnlocked = false;
  function isEditorUnlocked() {
    if (editorUnlocked) return true;
    try { return localStorage.getItem(editorUnlockKey) === passwordDigest; }
    catch { return false; }
  }
  function openEditor() {
    window.AFV?.registerCards();
    registerOrdnanceCards();
    load();
    refreshLibrary();
    if (usingDefaultName) form.elements.scenarioName.value = LANG === 'ja' ? '自由シナリオ' : langTranslate('自由シナリオ');
    showTab('victory');
    dialog.showModal();
  }
  document.getElementById('open-scenario-editor').addEventListener('click', () => {
    if (dialog.open || passwordDialog.open || passwordSubmit.disabled) return;
    if (isEditorUnlocked()) {
      openEditor();
      return;
    }
    passwordForm.reset();
    passwordMessage.hidden = true;
    passwordDialog.showModal();
  });
  passwordForm.querySelector('[data-password-cancel]').addEventListener('click', () => passwordDialog.close());
  passwordDialog.addEventListener('close', () => passwordForm.reset());
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!passwordDialog.open || passwordSubmit.disabled) return;
    passwordSubmit.disabled = true;
    let digest;
    try {
      const bytes = new TextEncoder().encode(passwordSalt + passwordInput.value);
      const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      digest = Array.from(sum, byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      passwordMessage.textContent = 'このブラウザではパスワードを確認できません。';
      passwordMessage.hidden = false;
      return;
    } finally {
      passwordSubmit.disabled = false;
    }
    if (!passwordDialog.open) return;
    if (digest !== passwordDigest) {
      passwordMessage.textContent = 'パスワードが違います。';
      passwordMessage.hidden = false;
      passwordInput.select();
      return;
    }
    editorUnlocked = true;
    try { localStorage.setItem(editorUnlockKey, passwordDigest); } catch { /* このページが開いている間は解除を維持する */ }
    passwordForm.reset();
    passwordDialog.close();
    openEditor();
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-load]').addEventListener('click', () => {
    const saved = library().find(entry => entry.name === form.elements.saved.value);
    if (saved) load(saved);
  });
  function readScenarioConfig(saved) {
    if (saved?.format !== scenarioFileFormat || saved.version !== 1) return null;
    const config = saved.scenario;
    return validScenarioFile(config) ? config : null;
  }

  function validScenarioFile(config) {
    if (typeof config?.name !== 'string' || !config.name.trim() || /[<>]/.test(config.name)) return false;
    if (config.deckCycles != null && (!Number.isInteger(config.deckCycles) || config.deckCycles < 1)) return false;
    if (config.timeOfDay != null && !['day', 'night'].includes(config.timeOfDay)) return false;
    if (config.aiPolicy != null && !aiPolicies.includes(config.aiPolicy)) return false;
    if (['victories', 'special', 'treatAsPlain', 'treatAsPlainAttacker', 'treatAsPlainDefender'].some(key =>
        config[key] != null && (!Array.isArray(config[key]) || config[key].some(value => typeof value !== 'string')))) return false;
    const victories = config.victories?.length ? config.victories : [config.victory || 'B'];
    if (victories.some(key => !victoryChoices.has(key))) return false;
    if (config.terrainRemovalCounts != null && (typeof config.terrainRemovalCounts !== 'object' ||
        Array.isArray(config.terrainRemovalCounts) || Object.entries(config.terrainRemovalCounts).some(([type, count]) =>
          !terrainRows.has(type) || !Number.isInteger(count) || count < 1))) return false;
    return [config.player, config.opponent].every(team =>
      team && Object.hasOwn(FACTIONS, team.faction) && Array.isArray(team.soldiers) &&
      team.soldiers.every(Number.isInteger) && (team.reserves == null ||
        (Array.isArray(team.reserves) && team.reserves.every(Number.isInteger))) &&
      (team.reserveDeck == null || (Number.isInteger(team.reserveDeck) &&
        team.reserveDeck >= 1 && team.reserveDeck <= (config.deckCycles ?? 3))) &&
      (team.troopType == null || desertFactions.includes(team.faction) &&
        (team.troopType === 'regular' || BASIC_TROOP_TYPES[team.faction].some(([key]) => key === team.troopType))) &&
      (team.radioStrength == null || desertFactions.includes(team.faction) && [5, 6, 7].includes(team.radioStrength)) &&
      (team.partisans == null || team.partisans === false ||
        team.partisans === true && canPurchasePartisans(team.faction, config.formationYear) &&
        (team.troopType == null || team.troopType === 'regular')) &&
      (team.equipment == null || (Array.isArray(team.equipment) &&
        team.equipment.every(kind => equipmentKinds.includes(kind))))) && config.player.faction !== config.opponent.faction;
  }

  const scenarioFileInput = dialog.querySelector('[data-scenario-file]');
  let scenarioReader;
  dialog.querySelector('[data-open-file]').addEventListener('click', () => scenarioFileInput.click());
  dialog.addEventListener('close', () => scenarioReader?.abort());
  scenarioFileInput.addEventListener('change', () => {
    const file = scenarioFileInput.files[0];
    scenarioFileInput.value = '';
    if (!file) return;
    scenarioReader?.abort();
    const reader = new FileReader();
    scenarioReader = reader;
    reader.addEventListener('load', () => {
      let saved;
      try { saved = JSON.parse(reader.result); } catch { /* エラー表示は形式が異なる場合と共通 */ }
      const config = readScenarioConfig(saved);
      if (!config) {
        message.textContent = 'Up Frontのシナリオファイルを読み込めませんでした。';
        return;
      }
      load(config);
      message.textContent = `${config.name}を読み込みました。`;
    });
    reader.addEventListener('error', () => {
      message.textContent = 'シナリオファイルを読み込めませんでした。';
    });
    reader.readAsText(file);
  });

  dialog.querySelector('[data-save]').addEventListener('click', () => {
    const config = collect();
    if (!config) return;
    const saved = { format: scenarioFileFormat, version: 1, scenario: config };
    const data = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    try {
      const url = URL.createObjectURL(data);
      link.href = url;
      link.download = config.name.replace(/[\\/:*?"|]/g, '_') + '.json';
      document.body.append(link);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.textContent = `${link.download}のダウンロードを開始しました。`;
    } catch {
      message.textContent = 'シナリオファイルを保存できませんでした。';
    } finally {
      link.remove();
    }
  });
  function buildEditorScenario(config) {
    const { name, player, opponent, formationYear, deckCycles = 3, timeOfDay = 'day', aiPolicy,
      treatAsPlainAttacker, treatAsPlainDefender, terrainRemovalCounts } = config;
    const victories = config.victories?.length ? config.victories : [config.victory || 'B'];
    const special = config.special || [];
    const rules = special.map(key => specialChoices.get(key)?.rule).filter(Boolean);
    const teams = [player, opponent];
    const partisans = [...rules.flatMap(rule => rule.partisans || []),
      ...teams.filter(team => team.partisans).map(team => team.faction)];
    const scenario = {
      id: 'custom', name, attackerRole: 'player', firstPlayer: player.faction,
      onlyFactions: [player.faction, opponent.faction],
      formationYear: formationYear ?? null,
      pointLimits: { [player.faction]: player.pointLimit ?? null, [opponent.faction]: opponent.pointLimit ?? null },
      factions: Object.fromEntries([player, opponent].map(team => [team.faction, { soldierList: team.soldiers }])),
      secondaryEquipment: { [player.faction]: player.equipment, [opponent.faction]: opponent.equipment },
      defenderPillbox: rules.some(rule => rule.defenderPillbox),
      defenderBonusBuilding: rules.some(rule => rule.defenderBonusBuilding),
      defenderGuaranteedTerrain: rules.some(rule => rule.defenderGuaranteedTerrain),
      partisans: partisans.length <= 1 ? partisans[0] : partisans,
      troopTypes: Object.fromEntries(teams.filter(team => desertFactions.includes(team.faction))
        .map(team => [team.faction, team.troopType || 'regular'])),
      radioStrength: Object.fromEntries(teams.filter(team => team.radioStrength)
        .map(team => [team.faction, team.radioStrength])),
      reinforcements: Object.fromEntries([player, opponent]
        .filter(team => team.reserves?.length)
        .map(team => [team.faction, { afterCycles: (team.reserveDeck ?? h1Deck) - 1, soldiers: team.reserves }])),
      openingTrenches: rules.some(rule => rule.openingTrenches),
      setupTrenches: rules.some(rule => rule.setupTrenches),
      twoSegments: rules.some(rule => rule.twoSegments),
      restoreSegmentWeapons: rules.some(rule => rule.restoreSegmentWeapons),
      evacuationSetup: rules.some(rule => rule.evacuationSetup),
      eliteAttackers: rules.some(rule => rule.eliteAttackers),
      randomDefenderReinforcements: rules.some(rule => rule.randomDefenderReinforcements),
      jungleMode: victories.includes('N') ||
        (rules.some(rule => rule.japanJungle) && jungleMatch(player.faction, opponent.faction)),
      openingBuildings: rules.some(rule => rule.openingBuildings),
      surprisePinning: rules.some(rule => rule.surprisePinning),
      surpriseSniper: rules.some(rule => rule.surpriseSniper),
      deckCycles, timeOfDay, aiPolicy, victoryPreset: victories[0], victoryPresets: victories,
      treatAsPlain: [...new Set([...(config.treatAsPlain || []), ...rules.flatMap(rule => rule.treatAsPlain || [])])],
      treatAsPlainAttacker: [...new Set([...(treatAsPlainAttacker || []), ...rules.flatMap(rule => rule.treatAsPlainAttacker || [])])],
      treatAsPlainDefender: treatAsPlainDefender || [],
      deckRemovals: buildDeckRemovals(terrainRemovalCounts || {}, rules),
      victory: window.SCENARIOS[victories[0]]?.victory,
      victoryLabels: victories.map(id => id + ' ' + victoryDetails[id]),
      specialLabels: special.map(key => specialChoices.get(key)).filter(choice =>
        Object.keys(choice.rule).some(key => !['treatAsPlain', 'treatAsPlainAttacker', 'deckRemoval'].includes(key)))
        .map(choice => choice.label),
    };
    return { faction: player.faction, scenario };
  }

  function startEditorScenario(config, returnToEditor) {
    const { faction, scenario } = buildEditorScenario(config);
    setupState.fromCampaign = false;
    setupState.aiFactionOverride = null;
    openSetupScreen(faction, scenario, false, returnToEditor);
  }

  window.UF_SCENARIO_FILES = {
    format: scenarioFileFormat,
    open(saved) {
      const config = readScenarioConfig(saved);
      if (!config) return false;
      window.AFV?.registerCards();
      registerOrdnanceCards();
      for (const team of [config.player, config.opponent]) {
        if (!team.soldiers.length || [...team.soldiers, ...(team.reserves || [])].some(number =>
            !getSoldierDef(team.faction, number))) return false;
        if (team.partisans && partisanFormationError({ partisans: team.faction }, team.faction,
            [...team.soldiers, ...(team.reserves || [])])) return false;
      }
      startEditorScenario(config, false);
      return true;
    },
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const config = collect();
    if (!config) return;
    dialog.close();
    startEditorScenario(config, true);
  });
})();
