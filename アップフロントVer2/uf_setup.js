// アップフロント: 兵士カード・陣営のデータ・ゲームの状態・初期化・開始と編成の画面・キャンペーン編成・戦歴
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== 兵士カードデータ =====
var SOLDIER_CARDS = { us: [], ger: [], rus: [], jpn: [], uk: [] };

function splitCSVLine(line) {
  // クォート対応CSV行分割
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i+1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function soldierImgPath(faction, num) {
  if (faction === 'us')  return { dir: 'upfrontimages/ありか', prefix: 'US' };
  if (faction === 'ger') return { dir: 'upfrontimages/ドイツ', prefix: 'Ger' };
  if (faction === 'rus') {
    // 1-30: "russian", 31+: "Rus"
    return { dir: 'upfrontimages/ソ連', prefix: num <= 30 ? 'russian' : 'Rus' };
  }
  return { dir: '', prefix: '' };
}

/** "5" → {main:5}, "5[2]" → {main:5, noCrew:2}, "NA" → {na:true} */
function parseRangeValue(s) {
  if (!s) return { main: 0 };
  const t = String(s).trim();
  if (t === 'NA' || t.indexOf('NA') === 0) return { na: true };
  const m = t.match(/^([0-9\-]+)\s*\[\s*([0-9\-]+)\s*\]/);
  if (m) {
    return { main: parseInt(m[1], 10) || 0, noCrew: parseInt(m[2], 10) || 0 };
  }
  return { main: parseInt(t, 10) || 0 };
}

function parseSoldierCSV(text, faction) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = lines.slice(1);
  const out = [];
  const hasBerserk = (faction === 'ger' || faction === 'rus');
  rows.forEach(line => {
    const c = splitCSVLine(line);
    const num = parseInt(c[0], 10);
    if (!num) return;
    const { dir, prefix } = soldierImgPath(faction, num);
    const rangeArr = [c[8], c[9], c[10], c[11], c[12], c[13]];
    const rangeData = rangeArr.map(parseRangeValue);
    const needsCrew = rangeData.some(rd => rd.noCrew != null);
    const card = {
      num,
      rank:       c[1] || '',
      name:       c[2] || '',
      ccvFront:   c[3] || '',
      leader:     c[4] || '',
      weaponCat:  c[5] || '',
      xVal:       c[6] || '',
      weaponName: c[7] || '',
      range: rangeArr,
      rangeData,
      needsCrew,
      morale:    c[14] || '',
      pt:        c[15] || '',
      kiaFront:  c[16] || '',
      panic:     c[17] || '',
      ccvBack:   c[18] || '',
      kiaBack:   c[19] || '',
      rncRoute:  c[20] || '',
      imgFront: encPath(`${dir}/${prefix} ${num}f.gif`),
      imgBack:  encPath(`${dir}/${prefix} ${num}b.gif`),
    };
    if (hasBerserk) {
      card.berserk  = c[21] || '';
      card.noteBack = c[22] || '';
    } else {
      card.noteBack = c[21] || '';
    }
    out.push(card);
  });
  return out;
}

function logSoldierCardsLoaded() {
  console.log(`兵士カード読込: US=${SOLDIER_CARDS.us.length}, Ger=${SOLDIER_CARDS.ger.length}, Rus=${SOLDIER_CARDS.rus.length}, Jpn=${SOLDIER_CARDS.jpn.length}, UK=${SOLDIER_CARDS.uk.length}`);
}

const _embedSoldiers = (typeof __EMBED_CSV__ !== 'undefined' && __EMBED_CSV__ && __EMBED_CSV__.us && __EMBED_CSV__.ger && __EMBED_CSV__.rus);
if (_embedSoldiers) {
  try {
    SOLDIER_CARDS.us  = parseSoldierCSV(__EMBED_CSV__.us,  'us');
    SOLDIER_CARDS.ger = parseSoldierCSV(__EMBED_CSV__.ger, 'ger');
    SOLDIER_CARDS.rus = parseSoldierCSV(__EMBED_CSV__.rus, 'rus');
    // JPN/UK は埋め込みに無ければ fetch
    Promise.all([
      __EMBED_CSV__.jpn
        ? Promise.resolve().then(() => { SOLDIER_CARDS.jpn = parseSoldierCSV(__EMBED_CSV__.jpn, 'jpn'); })
        : fetch(encPath('upfrontimages/日本/Japan_card_list.csv')).then(r => r.text()).then(t => { SOLDIER_CARDS.jpn = parseSoldierCSV(t, 'jpn'); }).catch(e => console.warn('JPN CSV:', e)),
      __EMBED_CSV__.uk
        ? Promise.resolve().then(() => { SOLDIER_CARDS.uk = parseSoldierCSV(__EMBED_CSV__.uk, 'uk'); })
        : fetch(encPath('upfrontimages/イギリス/Britain_card_list.csv')).then(r => r.text()).then(t => { SOLDIER_CARDS.uk = parseSoldierCSV(t, 'uk'); }).catch(e => console.warn('UK CSV:', e)),
    ]).then(logSoldierCardsLoaded);
  } catch (e) {
    console.warn('埋め込み兵士CSV:', e);
  }
} else {
  Promise.all([
    fetch(encPath('upfrontimages/ありか/US_card_list.csv')).then(r => r.text()).then(t => { SOLDIER_CARDS.us  = parseSoldierCSV(t, 'us'); }).catch(e => console.warn('US CSV:', e)),
    fetch(encPath('upfrontimages/ドイツ/Germany_card_list.csv')).then(r => r.text()).then(t => { SOLDIER_CARDS.ger = parseSoldierCSV(t, 'ger'); }).catch(e => console.warn('Ger CSV:', e)),
    fetch(encPath('upfrontimages/ソ連/USSR_card_list.csv')).then(r => r.text()).then(t => { SOLDIER_CARDS.rus = parseSoldierCSV(t, 'rus'); }).catch(e => console.warn('USSR CSV:', e)),
    fetch(encPath('upfrontimages/日本/Japan_card_list.csv')).then(r => r.text()).then(t => { SOLDIER_CARDS.jpn = parseSoldierCSV(t, 'jpn'); }).catch(e => console.warn('JPN CSV:', e)),
    fetch(encPath('upfrontimages/イギリス/Britain_card_list.csv')).then(r => r.text()).then(t => { SOLDIER_CARDS.uk = parseSoldierCSV(t, 'uk'); }).catch(e => console.warn('UK CSV:', e)),
  ]).then(logSoldierCardsLoaded);
}

// ===== 陣営データ =====
const FACTIONS = {
  ger: { name: 'ドイツ', flag: '🇩🇪', dir: 'upfrontimages/ドイツ', prefix: 'Ger', count: 46, handMax: 5, handDraw: 1, breakLvl: 0.51 },
  rus: { name: 'ソ連',   flag: '🇷🇺', dir: 'upfrontimages/ソ連',   prefix: 'russian', count: 30, handMax: 4, handDraw: 4, breakLvl: 0.51 },
  us:  { name: 'アメリカ', flag: '🇺🇸', dir: 'upfrontimages/ありか', prefix: 'US', count: 44, handMax: 6, handDraw: 2, breakLvl: 0.51 },
  jpn: { name: '日本',   flag: '🇯🇵', dir: 'upfrontimages/日本',   prefix: 'Jap', count: 38, handMax: 4, handDraw: 2, breakLvl: 0.75 },
  uk:  { name: 'イギリス', flag: '🇬🇧', dir: 'upfrontimages/イギリス', prefix: 'Brit', count: 40, handMax: 5, handDraw: 2, breakLvl: 0.51 },
};
// scenarios.js などの外部スクリプトから参照できるようにグローバル公開
window.FACTIONS = FACTIONS;

// A〜D で開始、A〜Z まで動的に追加可能
const INITIAL_GROUP_NAMES = ['A', 'B', 'C', 'D'];
const ALL_GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ===== ゲーム状態 =====
const state = {
  player: null, ai: null,
  groups: { player: [], ai: [] },
  /** 地形デッキ: draw/discard は TERRAIN_CARDS のインデックス。cycle はリサイクル済み回数 */
  terrainDeck: null,
  /** 夜間モード（true なら夜間ルール適用） */
  isNight: false,
  /** ターン経過数（照明弾効果期間の判定用） */
  turnCount: 0,
};
// discard.js 等から参照するため同一オブジェクトを公開
window.state = state;

const _embedTerrain = (typeof __EMBED_CSV__ !== 'undefined' && __EMBED_CSV__ && __EMBED_CSV__.terrain);
if (_embedTerrain) {
  applyTerrainCsvText(_embedTerrain);
} else {
  fetch(encPath('upfrontimages/地形カード/terrain_cards.csv'))
    .then(r => r.text())
    .then(applyTerrainCsvText)
    .catch(err => console.warn('地形CSV読込失敗:', err));
}

// ===== 初期化 =====
document.querySelectorAll('.faction-btn').forEach(btn => {
  btn.addEventListener('click', () => { setupState.fromCampaign = false; openSetupScreen(btn.dataset.faction); });
});

// ===== セットアップ画面 =====
const setupState = {
  faction: null,            // 'ger'|'us'|'rus'
  scenario: null,
  groups: [[], [], [], []], // A,B,C,D : ソルジャー番号配列
  pool: [],                 // 未配置の番号配列
  selected: null,           // {from: 'pool'|'A'|'B'|.., num: int}
  targetGroup: 0,           // 配置先 (0..3)
  crewMode: false,          // クルー設定モード
  crewLeader: null,         // {grp: int, num: int} クルー兵器を持つ兵士
  crewPairs: {},            // { "A:5": "A:7" } 兵士番号→アシスタント番号 (グループ内ペア)
};

function openSetupScreen(factionKey) {
  const scenarioId = (document.getElementById('scenario-pick') || {}).value || 'A';
  const scenario = (window.SCENARIOS || {})[scenarioId];
  if (!scenario) { alert('シナリオ未読込'); return; }
  setupState.faction = factionKey;
  setupState.scenario = scenario;
  setupState.groups = [[], [], [], []];
  setupState.crewPairs = {};
  setupState.crewMode = false;
  setupState.crewLeader = null;
  setupState.selected = null;
  setupState.targetGroup = 0;
  setupState.demoMode = false;
  setupState.demoHolders = new Set(); // "<grpIdx>:<num>" 形式
  // 非対称シナリオの先攻選択 → プレイヤーの役割 (attacker/defender)
  let playerRole;
  if (scenario.asymmetric) {
    const fpPick = document.getElementById('first-player-pick');
    const firstSide = (fpPick && fpPick.value) ? fpPick.value : 'player';
    playerRole = (firstSide === 'player') ? 'attacker' : 'defender';
  } else {
    playerRole = (scenario.attackerRole === 'player') ? 'attacker' : (scenario.attackerRole ? 'defender' : null);
  }
  setupState.role = playerRole;
  // プールに使用兵士全員 (役割に応じて左列/右列)
  const nums = (window.SCENARIO_HELPERS && window.SCENARIO_HELPERS.getSoldierNumbers(scenario, factionKey, playerRole)) || [];
  setupState.pool = nums.slice();

  document.getElementById('faction-select').style.display = 'none';
  document.getElementById('setup-screen').classList.add('active');
  const fac = FACTIONS[factionKey];
  const roleLabel = (scenario.id === 'C') ? (playerRole === 'attacker' ? '攻撃側・先攻' : '防御側・後攻') : '';
  document.getElementById('setup-title').textContent =
    `${fac.flag} ${fac.name} 編成 — シナリオ${scenario.id}「${scenario.name}」${roleLabel ? ' ['+roleLabel+']' : ''} (兵士 ${nums.length}名)`;
  renderSetup();
}

function getSoldierDef(factionKey, num) {
  const list = (SOLDIER_CARDS && SOLDIER_CARDS[factionKey]) || [];
  return list.find(s => s.num === num) || null;
}

function isLeaderSoldier(def) {
  return !!(def && def.leader && def.leader.trim().length > 0);
}

const CREW_WEAPON_KEYWORDS = ['中機関銃','軽機関銃','バズーカ','パンツァーシュレック','火炎放射器','迫撃砲','60mm迫撃砲','50mm迫撃砲','擲弾筒'];
function isCrewWeaponSoldier(def) {
  if (!def) return false;
  // CSV の括弧表記 (rangeData の noCrew 値あり) で判定
  return !!def.needsCrew;
}

function buildSetupCard(num, location) {
  // location: 'pool' or 0..3 (group index)
  const fac = FACTIONS[setupState.faction];
  const def = getSoldierDef(setupState.faction, num);
  let prefix = fac.prefix;
  if (setupState.faction === 'rus') prefix = num <= 30 ? 'russian' : 'Rus';
  const img = encPath(`${fac.dir}/${prefix} ${num}f.gif`);

  const el = document.createElement('div');
  el.className = 'scard';
  if (setupState.selected && setupState.selected.from === location && setupState.selected.num === num) {
    el.classList.add('selected');
  }
  if (setupState.crewMode && setupState.crewLeader && setupState.crewLeader.num !== num
      && typeof location === 'number' && setupState.crewLeader.grp === location) {
    el.classList.add('crew-target');
  }

  const im = document.createElement('img');
  im.src = img; im.alt = `#${num}`;
  im.onerror = () => { im.style.display = 'none'; el.style.background='#666'; };
  el.appendChild(im);

  const nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = def ? def.name : `#${num}`;
  el.appendChild(nm);

  const wp = document.createElement('div');
  wp.className = 'wp';
  wp.textContent = def ? def.weaponCat : '';
  el.appendChild(wp);

  if (def && isLeaderSoldier(def)) {
    const lb = document.createElement('div');
    lb.className = 'leader'; lb.textContent = '指';
    el.appendChild(lb);
  }

  // クルー兵器マーク (主)
  if (def && isCrewWeaponSoldier(def)) {
    const ci = document.createElement('div');
    ci.className = 'crewIcon'; ci.textContent = '主';
    ci.title = 'クルー操作兵器: アシスタント要';
    el.appendChild(ci);
  }
  // ペア状況: クルー主としてペア有り → "✓"
  // クルー副 (アシスタント) → 青の "副"
  if (typeof location === 'number') {
    const key = `${location}:${num}`;
    // この兵士がアシスタント?
    const ownerKey = Object.keys(setupState.crewPairs).find(k => setupState.crewPairs[k] === key);
    if (ownerKey) {
      const ai = document.createElement('div');
      ai.className = 'crewIcon assistant'; ai.textContent = '副';
      ai.title = 'アシスタントクルー (自身の火力は使用不可)';
      el.appendChild(ai);
    }
    // この兵士がクルー主としてアシスタント割当済?
    if (setupState.crewPairs[key]) {
      const lk = document.createElement('div');
      lk.className = 'crewLink'; lk.textContent = '✓';
      lk.title = 'アシスタント設定済み';
      el.appendChild(lk);
    }
    // 爆薬保持者
    if (setupState.demoHolders && setupState.demoHolders.has(key)) {
      const demo = document.createElement('img');
      demo.src = encPath(getDemoImagePath(setupState.faction));
      demo.className = 'demoIcon';
      demo.style.cssText = 'position:absolute;top:2px;right:2px;width:28px;height:28px;z-index:3;border:1px solid #f66;border-radius:3px;background:#000;';
      demo.title = '爆薬保持';
      el.appendChild(demo);
    }
  }

  el.addEventListener('click', (e) => {
    // Option/Alt + クリックで拡大表示
    if (e.altKey) {
      e.stopPropagation();
      if (typeof showOverlay === 'function') showOverlay(img);
      return;
    }
    onSetupCardClick(num, location);
  });
  return el;
}

/** §18/§19.4/§17.8 兵士カードに重ねるチット画像 */
const WPN_CHIT_FOLDER = {
  ger: ['ドイツマーカ', 'Ger'], rus: ['ソ連マーカー', 'Russian'], us: ['アメリカマーカ', 'US'],
  jpn: ['日本マーカー', 'Jap'], uk: ['共通マーカー/イギリスマーカー', 'Brit'],
};
/** 兵器の種類 → 兵器チットの記号 */
function weaponChitCode(weaponCat, fac) {
  const w = weaponCat || '';
  if (w.indexOf('半自動小銃') === 0) return 'SAR';
  if (w.indexOf('カービン') === 0) return 'CAR';
  if (w.indexOf('突撃銃') === 0) return 'AR';
  if (w.indexOf('短機関銃') === 0) return 'MP';
  // 画像の「BAR」は B.A Rifle（ボルトアクション小銃）。米国のブローニングBARの画像は「LMG」のファイル
  if (w.indexOf('ボルトアクション小銃') === 0) return 'BAR';
  if (w.indexOf('BAR') === 0) return 'LMG';
  if (w.indexOf('軽機関銃') === 0) return fac === 'jpn' ? 'LMG1' : 'LMG';
  if (w.indexOf('中機関銃') === 0) return 'MMG';
  if (w.indexOf('擲弾筒') === 0) return fac === 'jpn' ? 'GL' : 'MTR';
  if (w.indexOf('迫撃砲') >= 0) return 'MTR';
  if (w.indexOf('火炎放射器') === 0) return 'FTR';
  if (w.indexOf('対戦車ライフル') === 0) return 'ATR';
  if (w.indexOf('バズーカ') === 0) return 'BAZ';
  if (w.indexOf('パンツァーシュレック') === 0) return 'PSK';
  if (w.indexOf('PIAT') === 0) return 'PIAT';
  return null; // ボルトアクション小銃などチットのない兵器
}
/** 兵器チットの表（故障なら裏の画像。裏は複数の兵器の共用ファイル） */
const WPN_CHIT_BACK = {
  ger: ['AR MMG', 'BAR', 'FTR', 'MOR', 'MP LMG ATR', 'PSK', 'RAD'],
  us: ['BAR SAR MMG', 'BAZ', 'CAR', 'FTR', 'LMG', 'MP MOR', 'RAD'],
  rus: ['BAR', 'FTR', 'LMG ATR', 'MOR', 'MP', 'RAD', 'SAR MMG'],
  jpn: ['BAR', 'FTR', 'LMG ATR GL', 'MMG', 'MP', 'RAD'],
  uk: ['ATR', 'BAR', 'FTR', 'LMG MMG', 'MOR', 'MP', 'PIAT', 'RAD'],
};
function weaponChitImage(w, broken) {
  if (!w) return null;
  const fac = w.fac;
  const f = WPN_CHIT_FOLDER[fac];
  const code = weaponChitCode(w.weaponCat, fac);
  if (!f || !code) return null;
  if (!broken) return encPath(`images/${f[0]}/Wpn Front ${code} ${f[1]}.gif`);
  const bc = code === 'MTR' ? 'MOR' : code === 'LMG1' ? 'LMG' : code;
  const name = (WPN_CHIT_BACK[fac] || []).find(n => n.split(' ').indexOf(bc) >= 0);
  return name ? encPath(`images/${f[0]}/Wpn Back ${name} ${f[1]}.gif`) : null;
}
/** 兵士カードに 拾った・捕獲した兵器／非武装／移送中 のチットを重ねる（scale: 1=場、1.4=一覧） */
function appendSoldierChits(el, card, scale) {
  const sz = Math.round(24 * (scale || 1));
  const add = (src, title, css, fallbackText) => {
    const img = document.createElement('img');
    img.src = src;
    img.title = title;
    img.style.cssText = `position:absolute;width:${sz}px;height:${sz}px;border:1px solid #fff;border-radius:2px;background:#000;z-index:6;` + css;
    img.onerror = () => {
      const t = document.createElement('div');
      t.textContent = fallbackText;
      t.title = title;
      t.style.cssText = `position:absolute;background:#333;color:#ff8;font-size:${Math.round(10 * (scale || 1))}px;padding:1px 3px;border-radius:3px;border:1px solid #fff;z-index:6;` + css;
      img.replaceWith(t);
    };
    el.appendChild(img);
  };
  const aw = card.acquiredWeapon;
  if (card.destroyed || (aw && aw.weaponCat === '非武装')) {
    add(encPath('images/共通マーカー/Unarmed Front.gif'), '非武装（§19.4）', 'bottom:2px;right:2px;', '非武装');
  } else if (aw) {
    const label = (aw.captured ? '捕獲兵器: ' : '拾った兵器: ') + (aw.weaponName || aw.weaponCat) + (card.malfunctioned ? '（故障）' : '');
    const src = weaponChitImage(aw, card.malfunctioned);
    if (src) add(src, label, 'bottom:2px;right:2px;', (aw.captured ? '捕:' : '拾:') + (aw.weaponName || aw.weaponCat));
    else {
      const t = document.createElement('div');
      t.textContent = (aw.captured ? '捕:' : '拾:') + (aw.weaponName || aw.weaponCat);
      t.title = label;
      t.style.cssText = `position:absolute;bottom:2px;right:2px;background:#333;color:#ff8;font-size:${Math.round(10 * (scale || 1))}px;padding:1px 3px;border-radius:3px;border:1px solid #fff;z-index:6;`;
      el.appendChild(t);
    }
  }
  if (card.transfer) {
    add(encPath('images/共通マーカー/Transfer Front.gif'), `移送中 → GROUP ${GROUP_LETTERS[card.transfer.toIdx]}（§17.8）`, 'bottom:2px;left:50%;transform:translateX(-50%);', '移送');
  }
}

function getDemoImagePath(factionKey) {
  const map = {
    ger: 'images/ドイツマーカ/Wpn Front DEMO Ger.gif',
    rus: 'images/ソ連マーカー/Wpn Front DEMO Russian.gif',
    us:  'images/アメリカマーカ/Wpn Front DEMO US.gif',
    jpn: 'images/日本マーカー/Wpn Front DEMO Jap.gif',
    uk:  'images/共通マーカー/イギリスマーカー/Wpn Front DEMO Brit.gif',
  };
  return map[factionKey] || '';
}

function onSetupCardClick(num, location) {
  // 爆薬モード: 配置済み兵士をクリックで爆薬保持を切り替え
  if (setupState.demoMode) {
    if (typeof location !== 'number') { alert('グループ内の兵士を選択してください'); return; }
    const key = `${location}:${num}`;
    if (setupState.demoHolders.has(key)) {
      setupState.demoHolders.delete(key);
    } else {
      setupState.demoHolders.add(key);
    }
    renderSetup();
    return;
  }
  // クルー設定モード時の動作
  if (setupState.crewMode) {
    if (!setupState.crewLeader) {
      // 最初のクリック: グループ内のクルー兵器持ちを選ぶ
      if (typeof location !== 'number') { alert('グループ内のクルー兵器持ちを選択してください'); return; }
      const def = getSoldierDef(setupState.faction, num);
      if (!isCrewWeaponSoldier(def)) { alert('この兵士はクルー操作兵器を持っていません'); return; }
      setupState.crewLeader = { grp: location, num };
      renderSetup();
      return;
    }
    // 2回目: 同じグループの別兵士をアシスタント指定
    if (location !== setupState.crewLeader.grp) { alert('同じグループ内の兵士を選んでください'); return; }
    if (num === setupState.crewLeader.num) {
      // 同じ兵士を再クリック → キャンセル
      setupState.crewLeader = null; renderSetup(); return;
    }
    // 既にアシスタントとして使われている兵士は選べない
    const targetKey = `${location}:${num}`;
    if (Object.values(setupState.crewPairs).includes(targetKey)) {
      alert('この兵士は既に他のクルーのアシスタントです'); return;
    }
    // 既に自身がクルー主としてペアを持っているのも選べない
    if (setupState.crewPairs[targetKey]) {
      alert('この兵士は既にクルー主です'); return;
    }
    const leaderKey = `${setupState.crewLeader.grp}:${setupState.crewLeader.num}`;
    setupState.crewPairs[leaderKey] = targetKey;
    setupState.crewLeader = null;
    setupState.crewMode = false;
    document.getElementById('setup-crew').classList.remove('active');
    renderSetup();
    return;
  }

  // 通常モード:
  // - プールから兵士クリック かつ targetGroup が決まっていれば即配置 (連続)
  // - グループ内兵士クリックは選択 → 別グループクリックで移動
  if (location === 'pool' && setupState.targetGroup != null) {
    setupState.selected = { from: location, num };
    moveSelectedTo(setupState.targetGroup);
    return;
  }
  if (setupState.selected && setupState.selected.from === location && setupState.selected.num === num) {
    setupState.selected = null;
    renderSetup();
    return;
  }
  setupState.selected = { from: location, num };
  renderSetup();
}

/** §23.3 トーチカを占拠できない兵器（迫撃砲・擲弾筒・バズーカ・パンツァーシュレック。IG・AFV は未対応） */
function pillboxForbiddenWeapon(weaponCat) {
  return /迫撃砲|擲弾筒|バズーカ|パンツァーシュレック/.test(weaponCat || '');
}

function moveSelectedTo(targetLoc) {
  const sel = setupState.selected;
  if (!sel) return;
  // シナリオC 守備側: Bグループは最大3名
  if (targetLoc !== 'pool'
      && setupState.scenario && setupState.scenario.id === 'C'
      && setupState.role === 'defender'
      && targetLoc === 1
      && setupState.groups[1].length >= 3) {
    alert('守備側のBグループは最大3名までです');
    return;
  }
  // §23.3 迫撃砲・副次兵器・バズーカ・パンツァーシュレックの兵士はトーチカを占拠できない
  if (targetLoc === 1 && setupState.scenario && setupState.scenario.id === 'C' && setupState.role === 'defender') {
    const d = (SOLDIER_CARDS[setupState.faction] || []).find(x => x.num === sel.num);
    if (d && pillboxForbiddenWeapon(d.weaponCat)) {
      alert(`${d.weaponCat} の兵士はトーチカ（Bグループ）に入れません（§23.3）`);
      return;
    }
  }
  // 元から削除
  removeFromAnywhere(sel.num);
  // 行先へ追加
  if (targetLoc === 'pool') setupState.pool.push(sel.num);
  else setupState.groups[targetLoc].push(sel.num);
  setupState.selected = null;
  renderSetup();
}

function removeFromAnywhere(num) {
  const pi = setupState.pool.indexOf(num);
  if (pi >= 0) { setupState.pool.splice(pi, 1); return; }
  for (let g = 0; g < 4; g++) {
    const gi = setupState.groups[g].indexOf(num);
    if (gi >= 0) {
      setupState.groups[g].splice(gi, 1);
      // この兵士に紐づくクルーペアを解除
      const myKey = `${g}:${num}`;
      delete setupState.crewPairs[myKey];
      Object.keys(setupState.crewPairs).forEach(k => {
        if (setupState.crewPairs[k] === myKey) delete setupState.crewPairs[k];
      });
      // グループ間の番号位置がずれるのでクルーペアキーを再構築
      rebuildCrewKeysAfterGroupChange();
      return;
    }
  }
}
function rebuildCrewKeysAfterGroupChange() {
  // crewPairs は "groupIndex:soldierNum" 形式なのでグループ内位置変動の影響はない
  // (実装上の no-op だが将来の拡張用に名前を残す)
}

function renderSetup() {
  const poolEl = document.getElementById('pool-cards');
  poolEl.innerHTML = '';
  setupState.pool.forEach(num => poolEl.appendChild(buildSetupCard(num, 'pool')));
  document.getElementById('pool-count').textContent = setupState.pool.length;

  const groupsEl = document.getElementById('setup-groups');
  groupsEl.innerHTML = '';
  ['A','B','C','D'].forEach((name, gi) => {
    const grp = document.createElement('div');
    grp.className = 'grp';
    if (setupState.targetGroup === gi) grp.style.borderColor = '#ffeb3b';

    const head = document.createElement('div');
    head.className = 'grp-head';
    const lc = countLeadersInGroup(gi);
    head.innerHTML = `<span class="gname">GROUP ${name}</span>
                      <span class="gcount">${setupState.groups[gi].length}名${lc>0?` / 指揮官${lc}`:''}</span>`;
    grp.appendChild(head);

    const cards = document.createElement('div');
    cards.className = 'grp-cards';
    setupState.groups[gi].forEach(num => cards.appendChild(buildSetupCard(num, gi)));
    grp.appendChild(cards);

    grp.addEventListener('click', e => {
      if (e.target !== grp && e.target !== cards && !e.target.classList.contains('grp-head')) return;
      // 配置先選択 or 選択中の兵士を配置
      if (setupState.selected) {
        moveSelectedTo(gi);
      } else {
        setupState.targetGroup = gi;
        document.getElementById('setup-target').textContent = name;
        renderSetup();
      }
    });
    groupsEl.appendChild(grp);
  });

  // プール側ドロップ: プール背景クリックで戻す
  document.querySelector('#setup-screen .pool-row').onclick = e => {
    if (e.target.closest('.scard')) return;
    if (setupState.selected && typeof setupState.selected.from === 'number') {
      moveSelectedTo('pool');
    }
  };

  document.getElementById('setup-target').textContent = ['A','B','C','D'][setupState.targetGroup];
  // 開始ボタン: プールが空 かつ 各グループ 2~10
  const allPlaced = setupState.pool.length === 0;
  const sizesOk = setupState.groups.every(g => g.length === 0 || (g.length >= 2 && g.length <= 10));
  const nonEmpty = setupState.groups.some(g => g.length > 0);
  document.getElementById('setup-start').disabled = !(allPlaced && sizesOk && nonEmpty);
}

function countLeadersInGroup(gi) {
  return setupState.groups[gi].filter(num => {
    const def = getSoldierDef(setupState.faction, num);
    return isLeaderSoldier(def);
  }).length;
}

document.getElementById('setup-back').addEventListener('click', () => {
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('faction-select').style.display = '';
});
document.getElementById('setup-reset').addEventListener('click', () => {
  const allNums = setupState.pool.concat(...setupState.groups);
  setupState.pool = allNums.slice().sort((a,b)=>a-b);
  setupState.groups = [[],[],[],[]];
  setupState.crewPairs = {};
  setupState.selected = null;
  setupState.crewLeader = null;
  setupState.crewMode = false;
  document.getElementById('setup-crew').classList.remove('active');
  renderSetup();
});
document.getElementById('setup-crew').addEventListener('click', () => {
  setupState.crewMode = !setupState.crewMode;
  setupState.crewLeader = null;
  document.getElementById('setup-crew').classList.toggle('active', setupState.crewMode);
  // 他モード解除
  setupState.demoMode = false;
  document.getElementById('setup-demo').classList.remove('active');
  renderSetup();
});
document.getElementById('setup-demo').addEventListener('click', () => {
  setupState.demoMode = !setupState.demoMode;
  document.getElementById('setup-demo').classList.toggle('active', setupState.demoMode);
  // 他モード解除
  setupState.crewMode = false;
  setupState.crewLeader = null;
  document.getElementById('setup-crew').classList.remove('active');
  renderSetup();
});
document.getElementById('setup-sort').addEventListener('click', () => {
  // pool 内兵士をモラル降順で並び替え
  setupState.pool.sort((a, b) => {
    const da = getSoldierDef(setupState.faction, a);
    const db = getSoldierDef(setupState.faction, b);
    const ma = da ? (parseInt(da.morale, 10) || 0) : 0;
    const mb = db ? (parseInt(db.morale, 10) || 0) : 0;
    return mb - ma; // 降順
  });
  renderSetup();
});
document.getElementById('setup-start').addEventListener('click', () => {
  document.getElementById('setup-screen').classList.remove('active');
  startGameWithSetup();
});

// ===== キャンペーン編成 =====
function getAllSoldiers(facKey) {
  if (facKey === 'ger') {
    return Array.from({length: 46}, (_, i) => ({
      id: `Ger ${i+1}`,
      img:     encPath(`upfrontimages/ドイツ/Ger ${i+1}f.gif`),
      imgBack: encPath(`upfrontimages/ドイツ/Ger ${i+1}b.gif`),
    }));
  }
  if (facKey === 'us') {
    return Array.from({length: 44}, (_, i) => ({
      id: `US ${i+1}`,
      img:     encPath(`upfrontimages/ありか/US ${i+1}f.gif`),
      imgBack: encPath(`upfrontimages/ありか/US ${i+1}b.gif`),
    }));
  }
  if (facKey === 'rus') {
    const arr = [];
    for (let i = 1; i <= 30; i++) arr.push({
      id: `russian ${i}`,
      img:     encPath(`upfrontimages/ソ連/russian ${i}f.gif`),
      imgBack: encPath(`upfrontimages/ソ連/russian ${i}b.gif`),
    });
    for (let i = 31; i <= 41; i++) arr.push({
      id: `Rus ${i}`,
      img:     encPath(`upfrontimages/ソ連/Rus ${i}f.gif`),
      imgBack: encPath(`upfrontimages/ソ連/Rus ${i}b.gif`),
    });
    return arr;
  }
  if (facKey === 'jpn') {
    return Array.from({length: 38}, (_, i) => ({
      id: `Jap ${i+1}`,
      img:     encPath(`upfrontimages/日本/Jap ${i+1}f.gif`),
      imgBack: encPath(`upfrontimages/日本/Jap ${i+1}b.gif`),
    }));
  }
  if (facKey === 'uk') {
    return Array.from({length: 40}, (_, i) => ({
      id: `Brit ${i+1}`,
      img:     encPath(`upfrontimages/イギリス/Brit ${i+1}f.gif`),
      imgBack: encPath(`upfrontimages/イギリス/Brit ${i+1}b.gif`),
    }));
  }
  return [];
}

const campState = { faction: 'ger', selected: new Set(), showBack: true, individual: {} };

// ===== 戦歴レコード =====
const SAVE_KEY = 'upfront_campaign_v2';
let campaignRecords = loadRecords();

function emptyRecord() {
  // ルール準拠 (campaign.js) のレコードを使う
  if (window.CAMPAIGN_RULES && window.CAMPAIGN_RULES.emptyRecord) {
    return window.CAMPAIGN_RULES.emptyRecord();
  }
  return { status: 'active', rank: null, kia: 8, moraleVal: null, panicVal: null,
    moralePoints: 0, survivalSlashes: 0, promotionSlashes: 0,
    promoted: false, decorations: [], malfunctioned: false, destroyed: false };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  // 初期化: 全兵士を active で登録
  const rec = { ger: {}, rus: {}, us: {}, jpn: {}, uk: {} };
  ['ger','rus','us','jpn','uk'].forEach(f => {
    getAllSoldiers(f).forEach(s => rec[f][s.id] = emptyRecord());
  });
  return rec;
}

function saveRecords() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(campaignRecords)); } catch (e) {}
}

/** AIの性格のくじ: 'aggr'（攻撃的）/'bal'（バランス）/'def'（防御的）。比率は仮（プレイして見直す） */
const AI_STYLE_WEIGHTS = {
  rus: [60, 30, 10], jpn: [60, 30, 10],
  ger: [25, 50, 25],
  us:  [10, 30, 60], uk:  [10, 30, 60],
};
function drawAIStyle(aiKey) {
  const w = AI_STYLE_WEIGHTS[aiKey] || [33, 34, 33];
  let r = Math.random() * (w[0] + w[1] + w[2]);
  const style = r < w[0] ? 'aggr' : (r < w[0] + w[1] ? 'bal' : 'def');
  try { console.log(`[AI性格] ${aiKey}: ${style}`); } catch (e) {}
  return style;
}

/** §42 キャンペーンで変わった能力値を、この戦闘の兵士カードに反映する（lookupSoldier が使う） */
function applyCampaignStats(facKey) {
  const recs = campaignRecords[facKey] || {};
  const list = (SOLDIER_CARDS && SOLDIER_CARDS[facKey]) || [];
  const armedOf = str => parseInt(String(str || '').split('/')[0], 10) || 0;
  const unarmedOf = str => { const p = String(str || '').split('/'); return p[1] != null ? p[1] : p[0]; };
  (state.groups.player || []).forEach(g => g.cards.forEach(card => {
    const rec = recs[card.id];
    if (!rec) return;
    const base = list.find(d => d.num === card.num);
    if (!base) return;
    const o = {};
    if (rec.moraleVal != null) o.morale = String(rec.moraleVal);
    if (rec.panicVal != null) o.panic = String(rec.panicVal);
    // KIA値は補充（7、火炎放射器6）や生存で変わった時だけ（既定値8のままなら印刷値）
    if (rec.kia != null && (rec.kia !== 8 || rec.replacementCount)) o.kiaFront = String(rec.kia);
    if (rec.ccvFrontVal != null) {
      o.ccvFront = `${rec.ccvFrontVal}/${unarmedOf(base.ccvFront)}`;
      card._ccvDelta = rec.ccvFrontVal - armedOf(base.ccvFront); // §20.6 計算し直す時も上がった分を足す
    }
    if (rec.ccvBackVal != null) o.ccvBack = `${rec.ccvBackVal}/${unarmedOf(base.ccvBack)}`;
    if (Object.keys(o).length) card._statOverride = o;
  }));
}

function getRecord(fac, id) {
  if (!campaignRecords[fac]) campaignRecords[fac] = {};
  if (!campaignRecords[fac][id]) campaignRecords[fac][id] = emptyRecord();
  return campaignRecords[fac][id];
}

document.getElementById('open-campaign').addEventListener('click', () => {
  document.getElementById('faction-select').style.display = 'none';
  document.getElementById('campaign-screen').classList.add('active');
  renderCampaign();
});

document.getElementById('camp-back').addEventListener('click', () => {
  document.getElementById('campaign-screen').classList.remove('active');
  document.getElementById('faction-select').style.display = '';
});

document.querySelectorAll('#camp-fac-pick button').forEach(btn => {
  btn.addEventListener('click', () => {
    campState.faction = btn.dataset.faction;
    campState.selected.clear();
    renderCampaign();
  });
});

// シナリオ開始: シナリオ・AI陣営・役割をランダム決定し、setup-screen へ
document.getElementById('camp-start-scenario').addEventListener('click', () => {
  const ids = ['A', 'B', 'C', 'D'];
  const scenarioId = ids[Math.floor(Math.random() * ids.length)];
  const sp = document.getElementById('scenario-pick');
  if (sp) sp.value = scenarioId;
  const scenario = (window.SCENARIOS || {})[scenarioId];
  if (scenario && scenario.asymmetric) {
    const roles = ['player', 'ai'];
    const role = roles[Math.floor(Math.random() * roles.length)];
    const fp = document.getElementById('first-player-pick');
    if (fp) fp.value = role;
  }
  const others = ['ger', 'rus', 'us', 'jpn', 'uk'].filter(f => f !== campState.faction);
  const aiFaction = others[Math.floor(Math.random() * others.length)];
  setupState.aiFactionOverride = aiFaction;
  setupState.fromCampaign = true;
  // キャンペーンでは 1/3 の確率で夜間モード
  const _tod = document.getElementById('time-of-day-pick');
  if (_tod) _tod.value = (Math.random() < 1/3) ? 'night' : 'day';
  document.getElementById('campaign-screen').classList.remove('active');
  openSetupScreen(campState.faction);
});

const STATUS_LABEL = { active: '', wounded: '負傷', killed: '戦死', retired: '離脱' };

function renderCampaign() {
  // 陣営ボタン active 表示
  document.querySelectorAll('#camp-fac-pick button').forEach(b => {
    b.classList.toggle('active', b.dataset.faction === campState.faction);
  });
  const grid = document.getElementById('camp-grid');
  grid.innerHTML = '';
  const factionKey = campState.faction;
  const list = getAllSoldiers(factionKey);

  const totalBattles = (campaignRecords._meta && campaignRecords._meta.totalBattles) || 0;
  let html = `<div style="color:#aaa;font-size:13px;margin-bottom:8px;">キャンペーン: ${totalBattles} 戦目</div>`;
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px;color:#ccc;">';
  html += '<tr style="color:#888;border-bottom:1px solid #555;"><th>名前</th><th>階級</th><th>戦</th><th>KIA値</th><th>モラル</th><th>パニック</th><th>CCV</th><th>気力</th><th>生存</th><th>昇進</th><th>気力使用</th></tr>';
  // 一時非表示: 対戦車/PIAT/バズーカ/パンツァー/狙撃
  const EXCLUDED_CATS = ['対戦車ライフル', 'PIAT', 'バズーカ', 'パンツァー', '狙撃'];
  list.forEach(s => {
    const rec = getRecord(factionKey, s.id);
    const statusColor = rec.status === 'active' ? '#8f8' : rec.status === 'wounded' ? '#fa0' : rec.status === 'killed' ? '#f44' : '#888';
    const statusLabel = STATUS_LABEL[rec.status] || rec.status;
    const def = (SOLDIER_CARDS[factionKey] || []).find(d => s.id.match(/(\d+)\s*$/) && d.num === parseInt(s.id.match(/(\d+)\s*$/)[1], 10));
    if (!def) return;
    const wc = def.weaponCat || '';
    if (EXCLUDED_CATS.some(cat => wc.indexOf(cat) === 0)) return;
    const name = def.name;
    const rank = def && def.rank ? def.rank : (rec.rank || '');
    const kiaVal = rec.kia != null ? rec.kia : 8;
    const baseMoraleStr = def ? def.morale : '';
    const basePanicStr = def ? def.panic : '';
    const baseMoraleN = parseInt(baseMoraleStr, 10);
    const basePanicN = parseInt(basePanicStr, 10);
    const isKilled = rec.status === 'killed';
    const moraleCur = (!isKilled && rec.moraleVal != null) ? rec.moraleVal : baseMoraleStr;
    const panicCur = (!isKilled && rec.panicVal != null) ? rec.panicVal : basePanicStr;
    const moraleDisp = (!isKilled && rec.moraleVal != null && !isNaN(baseMoraleN) && rec.moraleVal !== baseMoraleN)
      ? `${moraleCur}(${baseMoraleStr})` : moraleCur;
    const panicDisp = (!isKilled && rec.panicVal != null && !isNaN(basePanicN) && rec.panicVal !== basePanicN)
      ? `${panicCur}(${basePanicStr})` : panicCur;
    const canSpend = (rec.moralePoints || 0) >= 5 && rec.status !== 'killed';
    const btnStyle = canSpend
      ? 'background:#46a;color:#fff;border:1px solid #6af;border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer;margin:0 2px;'
      : 'background:#444;color:#888;border:1px solid #555;border-radius:3px;padding:2px 6px;font-size:11px;margin:0 2px;cursor:not-allowed;';
    html += `<tr style="border-bottom:1px solid #333;">`;
    html += `<td style="padding:4px;">${name}</td>`;
    html += `<td>${rank}</td>`;
    html += `<td style="text-align:center;">${rec.battles || 0}</td>`;
    html += `<td style="text-align:center;">${kiaVal}</td>`;
    html += `<td style="text-align:center;">${moraleDisp}</td>`;
    html += `<td style="text-align:center;">${panicDisp}</td>`;
    // CCV表示: ccvFront のみ (上昇時は armed部分を更新して括弧内に元値)
    (function() {
      const bF = def ? def.ccvFront : '';
      const armedF = (function(s){ const m = String(s||'').match(/^(-?\d+)/); return m ? parseInt(m[1],10) : null; })(bF);
      const curF = (!isKilled && rec.ccvFrontVal != null) ? rec.ccvFrontVal : armedF;
      const upF = (!isKilled && rec.ccvFrontVal != null && armedF != null && rec.ccvFrontVal !== armedF);
      function replaceArmed(orig, newArmed) {
        if (newArmed == null) return orig || '';
        if (!orig) return String(newArmed);
        return String(orig).replace(/^-?\d+/, String(newArmed));
      }
      const dispF = upF ? `${replaceArmed(bF, curF)}(${bF})` : (bF || '');
      html += `<td style="text-align:center;">${dispF}</td>`;
    })();
    html += `<td style="text-align:center;">${rec.moralePoints || 0}</td>`;
    html += `<td style="text-align:center;">${'/'.repeat(rec.survivalSlashes || 0)}</td>`;
    html += `<td style="text-align:center;">${'/'.repeat(rec.promotionSlashes || 0)}</td>`;
    html += `<td style="text-align:center;white-space:nowrap;">`;
    html += `<button class="camp-morale-spend-btn" data-id="${s.id}" data-choice="morale" style="${btnStyle}"${canSpend ? '' : ' disabled'}>モラル+1</button>`;
    html += `<button class="camp-morale-spend-btn" data-id="${s.id}" data-choice="panic" style="${btnStyle}"${canSpend ? '' : ' disabled'}>パニック+1</button>`;
    html += `<button class="camp-ccv-spend-btn" data-id="${s.id}" style="${btnStyle}"${canSpend ? '' : ' disabled'}>CCV+1</button>`;
    html += `</td>`;
    html += `</tr>`;
  });
  html += '</table>';
  grid.innerHTML = html;

  // 気力使用ボタン
  document.querySelectorAll('.camp-morale-spend-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.getAttribute('data-id');
      const choice = btn.getAttribute('data-choice');
      const rec = getRecord(factionKey, sid);
      const def = (SOLDIER_CARDS[factionKey] || []).find(d => sid.match(/(\d+)\s*$/) && d.num === parseInt(sid.match(/(\d+)\s*$/)[1], 10));
      const baseMorale = def ? parseInt(def.morale, 10) || 0 : 0;
      const basePanic = def ? parseInt(def.panic, 10) || 0 : 0;
      const C = window.CAMPAIGN_RULES;
      if (!C || !C.applyMoraleIncreaseOnce) return;
      const res = C.applyMoraleIncreaseOnce(rec, choice, baseMorale, basePanic);
      if (!res.ok) {
        alert(res.reason || '適用不可');
        return;
      }
      saveRecords();
      renderCampaign();
    });
  });

  // CCV+1 ボタン
  document.querySelectorAll('.camp-ccv-spend-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.getAttribute('data-id');
      const rec = getRecord(factionKey, sid);
      const def = (SOLDIER_CARDS[factionKey] || []).find(d => sid.match(/(\d+)\s*$/) && d.num === parseInt(sid.match(/(\d+)\s*$/)[1], 10));
      const baseCcvFront = def ? def.ccvFront : '';
      const baseCcvBack  = def ? def.ccvBack  : '';
      const C = window.CAMPAIGN_RULES;
      if (!C || !C.applyCCVIncreaseOnce) return;
      const res = C.applyCCVIncreaseOnce(rec, baseCcvFront, baseCcvBack);
      if (!res.ok) {
        alert(res.reason || '適用不可');
        return;
      }
      saveRecords();
      renderCampaign();
    });
  });

}

// 保存/読み込みボタン
document.getElementById('camp-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(campaignRecords, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'upfront_campaign.json';
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('camp-import').addEventListener('click', () => {
  document.getElementById('camp-import-file').click();
});
document.getElementById('camp-import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      campaignRecords = data;
      saveRecords();
      renderCampaign();
      alert('読み込みました');
    } catch (err) {
      alert('読み込み失敗: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});
document.getElementById('camp-reset').addEventListener('click', () => {
  if (!confirm('全戦歴をリセットします。よろしいですか?')) return;
  localStorage.removeItem(SAVE_KEY);
  campaignRecords = loadRecords();
  renderCampaign();
});

