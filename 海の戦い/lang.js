// 海の戦い - 英語/日本語の切り替え
// ゲームの処理には手を入れず、画面に出た日本語を対訳表で英語に置き換える
//   - 言語: ?lang=en|ja → 保存した言語 → 日本語
//   - 英語のとき、文字の変化を見張って置き換える。アラート・確認のダイアログも置き換える
//   - 日本語に戻すときは、元の文字に戻す（ゲームは続けたまま）
//   - 画面なしの対戦（sim/play.js）では読み込まれない

// 文全体が一致したときの訳（語句の置き換えより先に使う）
const LANG_EXACT = {
  '終了': 'Done',
  '戦闘': 'Combat',
  '移動': 'Move',
  '帰還': 'Return',
  '攻撃': 'Attack',
  '決定': 'OK',
  '確定': 'OK',
  '実行': 'Execute',
  '解除': 'Clear',
  '修理': 'Repair',
  'なし': 'None',
  '空爆': 'Air strike',
  '外れ': 'Miss',
  '港湾': 'Ports',
  '移動先': 'Destination',
  '連合軍': 'Allies',
  '枢軸軍': 'Axis',
  '連合軍 ALLIES': 'ALLIES',
  '枢軸軍 AXIS': 'AXIS',
  '艦名': 'Ship',
  '損害': 'Damage',
  '修理量': 'Repair',
  '現在地': 'Location',
  '帰還先 / 洋上補給': 'Return to / Refuel at sea',
  '追跡を続けますか？(キャンセル=追撃中止し母港帰還)': 'Continue the pursuit? (Cancel = stop pursuing and return to home port)',
  '連合 (空爆値3, 1回/ターン)': 'Allies (strike value 3, once per turn)',
  '枢軸 (空爆値3, 1回/ターン)': 'Axis (strike value 3, once per turn)',
  '⚂=2海域(ダイス判定)': '⚂ = 2-area move (die roll)',
  'ラウンド終了ボタンで撤退/追撃判定へ': 'Press End Round for retreat / pursuit decisions',
  '艦と移動先を選択して「実行」': 'Select ships and a destination, then press "Execute"',
  '港湾/海域を選択': 'Select a port or sea area',
  '艦一覧の表示/非表示': 'Show / hide ship list',
  'あなたはドイツ軍（枢軸）を担当します。連合軍はAIが動かします。': 'You play the German (Axis) side. The Allies are controlled by the AI.',
  'ターンごとの移動、戦闘結果、支配、POCのレポートを、このパソコンに保存できます。': 'You can save a report of each turn (movement, combat results, sea control and POC) to this computer.',
  'レポートを保存': 'Save report',
  'ターン:': 'Turn:',
  'ズーム:': 'Zoom:',
  'プレイ陣営:': 'Play side:',
};

// 語句の訳（長い語句から順に置き換える）
const LANG_TERMS = {
  // 長い文・決まった言い回し
  'ドイツ軍 航空攻撃：攻撃するエリアを選んでください': 'German air strike: choose an area to attack',
  '枢軸艦の右にあるグループボタンをクリックで割当': 'Click the group button to the right of each Axis ship to assign it',
  'タグを選び艦をクリックでグループ分け': 'choose a tag, then click ships to group them',
  'ドイツ軍の攻撃ボタンを押してください': 'Press the German Attack button',
  '連合軍の攻撃ボタンを押してください': 'Press the Allied Attack button',
  'クリックで全フェイズ表示／戻す': 'Click to show all phases / collapse',
  '戦闘確認ボタンを押してください': 'Press Confirm Combat',
  '艦と移動先を選択してください': 'Select ships and a destination',
  '各グループ別に追撃艦を割当': 'assign pursuing ships to each group',
  '攻撃ボタンを押してください': 'Press the Attack button',
  'ボタンを押してください': ': press the button',
  '目標を選択してください（': 'Select a target (',
  '100回シミュレーション結果': '100-game simulation results',
  '100回高速シミュレート': 'Fast-simulate 100 games',
  '港湾を選択してください': 'Select a port',
  'このターンの連合獲得POC': 'Allied POC this turn',
  'このターンの連合獲得': 'Allied gain this turn ',
  '即時帰還 帰還港選択': 'Immediate return: choose a return port',
  '各艦の目標をクリック': 'click a target for each ship',
  '枢軸も撤退のため撤回': 'Axis is also retreating, so the retreat is cancelled',
  '連合も撤退のため撤回': 'Allies are also retreating, so the retreat is cancelled',
  '枢軸艦 修理フェイズ': 'Axis Ships: Repair Phase',
  '枢軸艦 帰還フェイズ': 'Axis Ships: Return Phase',
  '2海域移動・ダイス判定': '2-area move (die roll)',
  '行動を選んでください': 'choose an action',
  'イタリア艦隊の接収': 'Fate of the Italian Fleet',
  'ドイツ軍 航空攻撃': 'German Air Strike',
  'ビスマルク級 防御': 'Bismarck class: Defense ',
  '出撃控え（数劣勢）': 'sortie held back (outnumbered)',
  '地中海にイタリア艦': 'Mediterranean: Italian ships ',
  '地中海戦力ちょうど': 'Mediterranean strength exactly matched',
  '攻撃可能な敵艦なし': 'no enemy ships to attack',
  '移動失敗・配置不可': 'move failed, cannot deploy',
  '米国投入ダイス緩和': 'Easier US entry rolls',
  '追撃中止し母港帰還': 'stop pursuing and return to home port',
  '追撃をやめる（母港へ帰還）': 'Stop pursuit (return to home port)',
  '追撃を続ける': 'Continue pursuit',
  '追跡を続けますか？': 'Continue the pursuit?',
  'LBAを': 'Use LBA on ',
  'に使用しますか？': '?',
  'の目標をクリック': ': click a target',
  'オプションルール': 'Optional Rules',
  'ドイツ軍の管理下': 'under German control',
  '連合軍の管理下': 'under Allied control',
  'Uボート反撃 終了': 'U-boat counterattack finished',
  'Uボート戦闘 終了': 'U-boat combat finished',
  'ロシア艦出港判定': 'Soviet ship sortie rolls',
  '出港判定スキップ': 'sortie roll skipped',
  '水上戦闘対象なし': 'No surface combat targets',
  '隻以上のため削除': ' or more, removed',
  'ドイツ軍の攻撃': 'German Attack',
  '連合軍の攻撃': 'Allied Attack',
  'Uボート上限なし': 'No U-boat limit',
  'レニングラード': 'Leningrad',
  '修理対象艦なし': 'No ships to repair',
  'AI判断で追撃せず': 'AI decides not to pursue',
  'AI判断で追撃（': 'AI decides to pursue (',
  'AI判断で撤退（': 'AI decides to retreat (',
  'AI判断で残留': 'AI decides to stay',
  '地中海戦力不足': 'Mediterranean strength short',
  '地中海戦力調整': 'Mediterranean strength adjusted',
  '地中海戦力': 'Mediterranean strength',
  '撤退艦から目標': 'target from retreating ships',
  '追跡艦から目標': 'target from pursuing ships',
  '枢軸集中先分布': 'Axis focus distribution',
  '水上戦闘 終了': 'Surface combat finished',
  '目標をクリック': 'click a target',
  '目標連合艦なし': 'No Allied targets',
  '積極攻撃モード': 'aggressive mode',
  '連合（準備中）': 'Allies (coming soon)',
  'コンボイ護衛': 'convoy escort',
  'マルタの余力': 'Malta surplus',
  'ラウンド終了': 'End Round',
  '・イギリス艦': ', British ships ',
  'ターン4以降に出撃可': 'can sortie from Turn 4',
  'T4以降のみ': 'Turn 4 onward only',
  '以降に出撃可': ' onward: can sortie',
  '以降のみ': ' onward only',
  '全戦闘 終了': 'All combat finished',
  '帰還先を選択': 'choose a return destination',
  '戦闘ログなし': 'No combat log',
  '戦闘対象なし': 'No combat targets',
  '撤退側 反撃': 'Retreating side returns fire',
  '攻撃可能なし': 'Nothing to attack',
  '攻撃手段なし': 'No means of attack',
  '海域リセット': 'Reset Sea Area',
  '追撃可能枢軸': 'Axis ships able to pursue',
  '追撃戦 終了': 'Pursuit finished',
  '追跡ラウンド': 'Pursuit round',
  '追跡側 射撃': 'Pursuing side fires',
  '追跡速度不足': 'pursuers too slow',
  '高速戦闘完了': 'Fast combat complete',
  'へ2エリア移動': ' (2-area move)',
  '2エリア移動': '2-area move',
  '2海域': '2-area move',
  'エリア移動': '-area move',
  'Uボートなし': 'no U-boats',
  'Uボート総数': 'total U-boats ',
  'Uボート撃沈': 'U-boats sunk ',
  'Uボート反撃': 'U-boat counterattack',
  'Uボート戦闘': 'U-boat combat',
  'Uボート': 'U-boat',
  'LBA空爆': 'LBA air strike',
  'LBA+空母': 'LBA + carriers',
  'AI戦闘実行': 'Run AI Combat',
  '連合軍AI移動実行': 'Run Allied AI Move',
  '連合軍AI': 'Allied AI',
  'キャンセル': 'Cancel',
  'グループ）': ' groups)',
  'ゲーム終了': 'Game over',
  '最終POC': 'Final POC',
  '枢軸の勝ち': 'Axis victory',
  '連合の勝ち': 'Allied victory',
  '引き分け': 'Draw',
  'ゲーム開始': 'Start Game',
  'ターン終了': 'End Turn',
  'ダイス判定': 'die roll',
  'テスト配置': 'Test setup',
  'バレンツ海': 'Barents Sea',
  'プレイ陣営': 'Play side',
  'マルタ出撃': 'Malta sortie',
  'ロシア上陸': 'landed in Russia',
  'ロシア出港': 'Soviet sortie',
  '・即時帰還': ', immediate return ',
  '中立港残留': 'stays in neutral port',
  '中立港(南米)': 'Neutral port (South America)',
  '修理ドック': 'repair dock',
  '候補スコア': 'candidate scores',
  '出撃ロール': 'sortie roll',
  '出撃見送り': 'sortie skipped',
  '勝てるとき': 'when winnable',
  '命中・損害': 'Hit, damage ',
  '対象艦なし': 'No target ships',
  '損害により': 'due to damage',
  '撤退を撤回': 'retreat cancelled',
  '次の戦闘へ': 'Next combat',
  '次フェイズ': 'Next Phase',
  '海域を選択': 'select a sea area',
  '海戦 終了': 'battle finished',
  '移動先なし': 'No destinations',
  '空爆 終了': 'Air strike finished',
  '複数選択可': 'multiple selection allowed',
  '護衛が貧弱': 'escort too weak',
  '追撃しない': 'does not pursue',
  '追撃する（': 'pursues (',
  '追撃判定へ': 'pursuit decision',
  '連合リード': 'Allies lead',
  '陸上攻撃機': 'Land-based bomber',
  'は不参加': ' = not taking part',
  'やり直し': 'Redo',
  'イタリア': 'Italy',
  'グループ': 'Group ',
  'ドイツ側': 'German side',
  'バルト海': 'Baltic Sea',
  'バレンツ': 'Barents',
  'フランス': 'France',
  'マルタ系': 'Malta group',
  'ランダム': 'random',
  'ロシア向': 'bound for Russia',
  'ロシア艦': 'Soviet ships',
  '修理実行': 'Execute Repair',
  '修理結果': 'Repair results',
  '全艦選択': 'Select All',
  '出撃判定': 'sortie roll',
  '出港判定': 'sortie roll',
  '北大西洋': 'North Atlantic',
  '南大西洋': 'South Atlantic',
  '即時反撃': 'immediate return fire',
  '即時帰還': 'immediate return',
  '8.帰還': '8.Return',
  '増援配置': 'Reinforcements',
  '対潜戦闘': 'Anti-submarine combat',
  '対象なし': 'None',
  '帰還待ち': 'awaiting return',
  '戦力補強': 'reinforcement',
  '戦力過剰': 'excess strength',
  '戦略選択': 'Strategy',
  '戦闘ログ': 'Combat Log',
  '戦闘確認': 'Confirm Combat',
  '戦闘終了': 'Combat finished',
  '戦闘解決': 'Combat Resolution',
  '投入判定': 'entry roll',
  '損害適用': 'Apply damage',
  '撤退する': 'Retreat',
  '支配配置': 'Place Control',
  '支配除去': 'Remove Control',
  '最終判定': 'final roll',
  '枢軸移動': 'Axis Move',
  '連合移動': 'Allied Move',
  '水上戦闘': 'Surface combat',
  '洋上補給': 'Refuel at sea',
  '海の戦い': 'War at Sea',
  '海上残留': 'stays at sea',
  '片側壊滅': 'one side destroyed',
  '移動不可': 'cannot move',
  '移動実行': 'Execute Move',
  '積極攻撃': 'aggressive attack',
  '空母のみ': 'Carriers only',
  '航空戦闘': 'Air combat',
  '航空攻撃': 'Air strike',
  '艦船一覧': 'Ships',
  '該当なし': 'none',
  '追撃する': 'Pursue',
  '追撃中止': 'pursuit stopped',
  '追撃戦闘': 'Pursuit combat',
  '追撃砲撃': 'pursuit fire',
  '追撃選択': ' pursuit selection',
  '追跡終了': 'pursuit ends',
  '速度不足': 'too slow',
  '過剰戻し': 'excess sent back ',
  '配置不可': 'cannot deploy',
  '駒非表示': 'Hide Units',
  '駒表示': 'Show Units',
  '高速戦闘': 'Fast Combat',
  // 単語
  'しない': 'no',
  'の艦船': ' ships',
  'へ帰還': ' (returned)',
  'ズーム': 'Zoom',
  'ターン': 'Turn',
  'ダイス': 'dice',
  'ドイツ': 'Germany',
  'ボート': 'boat',
  'マルタ': 'Malta',
  'ロシア': 'Russia',
  '・不能': ', disabled ',
  '・速力': ', speed ',
  '中立港': 'Neutral port',
  '修理量': 'repair ',
  '地中海': 'Mediterranean',
  '大西洋': 'Atlantic',
  '帰還先': 'Return to',
  '撃沈中': 'sinking',
  '撤退側': 'Retreating side',
  '撤退（': 'retreat (',
  '枢軸勝': 'Axis wins',
  '枢軸軍': 'Axis',
  '止まる': 'Stay',
  '現在地': 'Location',
  '移動先': 'Destination',
  '空爆値': 'strike value ',
  '米投入': 'US entry',
  '追撃戦': 'Pursuit',
  '追跡側': 'Pursuing side',
  '連合勝': 'Allied wins',
  '連合軍': 'Allies',
  '選択艦': 'Selected',
  '閉じる': 'Close',
  '非表示': 'hide',
  '（残り': ' (remaining ',
  'する': 'yes',
  'なし': 'none',
  '上陸': 'landed',
  '余り': 'leftover',
  '余艦': 'leftover ship',
  '修理': 'Repair',
  '出撃': 'sortie',
  '北海': 'North Sea',
  '南米': 'South America',
  '反撃': 'return fire',
  '取消': 'Cancel',
  '合計': 'total ',
  '命中': 'Hit ',
  '変動': 'change',
  '外れ': 'Miss',
  '失敗': 'failed',
  '実行': 'Execute',
  '帰還': 'return',
  '平均': 'Average',
  '引分': 'Draws',
  '成功': 'success',
  '戦力': 'strength',
  '戦闘': 'Combat',
  '損害': 'Damage ',
  '撃沈': 'Sunk',
  '撤退': 'retreat',
  '攻撃': 'Attack',
  '最大': 'Max',
  '最小': 'Min',
  '最遅': 'slowest ',
  '本国': 'home',
  '枢軸': 'Axis',
  '残留': 'stays',
  '永続': 'permanent',
  '決定': 'OK',
  '海域': 'area',
  '海戦': 'Battle',
  '温存': 'held back',
  '港湾': 'Ports',
  '生存': 'surviving ',
  '目標': 'target',
  '砲撃': 'gunfire',
  '確定': 'OK',
  '移動': 'Move',
  '空母': 'carriers',
  '空爆': 'Air strike',
  '米国': 'USA',
  '累計': 'total ',
  '終了': 'finished',
  '結果': 'results',
  '船団': 'Convoy',
  '艦名': 'Ship',
  '英国': 'UK',
  '補強': 'reinforce',
  '補給': 'Refuel',
  '解体': 'scuttled',
  '解除': 'Clear',
  '連合': 'Allies',
  '配分': 'Allocation',
  '開始': 'Start',
  'へ': ' to ',
  'を': ' ',
  '伊': 'IT',
  '先': 'to',
  '回': ' times',
  '攻': 'Atk ',
  '残': 'now ',
  '港': ' port',
  '発': ' dice',
  '艦': ' ships',
  '隻': ' ships',
  // 記号
  '）': ')',
  '（': ' (',
  '＋': '+',
  '－': '-',
  '／': '/',
  '：': ': ',
  '、': ', ',
  '。': '. ',
  '・': ', ',
  '「': '"',
  '」': '"',
  '？': '?',
  '　': ' ',
};

const LANG_JP = /[぀-ヿ一-鿿！-｠　-〿]/;
const LANG_TERM_RE = new RegExp(
  Object.keys(LANG_TERMS).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const langCache = new Map();

// 日本語の文字列を英語にする
function langTranslate(s){
  if(!LANG_JP.test(s)) return s;
  if(langCache.has(s)) return langCache.get(s);
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
  const core = s.trim();
  let out;
  if(LANG_EXACT[core] !== undefined){
    out = LANG_EXACT[core];
  } else {
    // 語句を置き換え、英単語どうしや数字と続くところに空白を入れる
    out = '';
    let last = 0, m, prevTerm = false;
    LANG_TERM_RE.lastIndex = 0;
    while((m = LANG_TERM_RE.exec(core))){
      const raw = core.slice(last, m.index);
      if(raw){
        if(prevTerm && /[A-Za-z0-9)]$/.test(out) && /^[A-Za-z0-9]/.test(raw)) out += ' ';
        out += raw;
      }
      const en = LANG_TERMS[m[0]];
      if(/[A-Za-z0-9)\]⚂]$/.test(out) && /^[A-Za-z0-9(]/.test(en)) out += ' ';
      out += en;
      last = m.index + m[0].length;
      prevTerm = true;
    }
    const rest = core.slice(last);
    if(rest && prevTerm && /[A-Za-z0-9)]$/.test(out) && /^[A-Za-z0-9]/.test(rest)) out += ' ';
    out += rest;
    out = out.replace(/([A-Za-z])(⚂|\()/g, '$1 $2').replace(/ {2,}/g, ' ').replace(/ ([,.:;)\]?])/g, '$1').replace(/\( /g, '(').trim();
  }
  out = lead + out + trail;
  langCache.set(s, out);
  return out;
}

let LANG = 'ja';
try {
  const q = new URLSearchParams(location.search).get('lang');
  if(q === 'en' || q === 'ja'){ LANG = q; localStorage.setItem('wasLang', q); }
  else if(localStorage.getItem('wasLang') === 'en') LANG = 'en';
} catch(e){}

// 文字ごとに元の日本語と英語を覚えておき、切り替えで戻せるようにする
const langText = new WeakMap(), langTitle = new WeakMap();
let langApplying = false;
function langApplyText(node){
  const v = node.nodeValue;
  const rec = langText.get(node);
  if(rec && (v === rec.en || v === rec.ja && LANG === 'ja')) return;
  if(!LANG_JP.test(v)){ if(rec) langText.delete(node); return; }
  const r = { ja: v, en: langTranslate(v) };
  langText.set(node, r);
  if(LANG === 'en' && r.en !== v) node.nodeValue = r.en;
}
function langApplyTitle(el){
  const v = el.getAttribute('title');
  if(v == null) return;
  const rec = langTitle.get(el);
  if(rec && (v === rec.en || v === rec.ja && LANG === 'ja')) return;
  if(!LANG_JP.test(v)){ if(rec) langTitle.delete(el); return; }
  const r = { ja: v, en: langTranslate(v) };
  langTitle.set(el, r);
  if(LANG === 'en' && r.en !== v) el.setAttribute('title', r.en);
}
function langWalk(root, fn){
  if(root.nodeType === 3){ fn.text(root); return; }
  if(root.nodeType !== 1) return;
  if(root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
  if(root.hasAttribute('title')) fn.title(root);
  for(const c of root.childNodes) langWalk(c, fn);
}
function langApplyAll(){
  langApplying = true;
  langWalk(document.body, { text: langApplyText, title: langApplyTitle });
  langApplying = false;
}
function langRestoreAll(){
  langWalk(document.body, {
    text: n => { const r = langText.get(n); if(r && n.nodeValue === r.en) n.nodeValue = r.ja; },
    title: el => { const r = langTitle.get(el); if(r && el.getAttribute('title') === r.en) el.setAttribute('title', r.ja); },
  });
}
const langObserver = new MutationObserver(muts => {
  if(LANG !== 'en' || langApplying) return;
  langApplying = true;
  for(const m of muts){
    if(m.type === 'characterData') langApplyText(m.target);
    else if(m.type === 'attributes') langApplyTitle(m.target);
    else m.addedNodes.forEach(n => langWalk(n, { text: langApplyText, title: langApplyTitle }));
  }
  langApplying = false;
});
const langDocTitle = { ja: document.title, en: 'War at Sea' };

function setLang(lang){
  LANG = lang;
  try { localStorage.setItem('wasLang', lang); } catch(e){}
  document.documentElement.lang = lang;
  document.title = langDocTitle[lang];
  if(lang === 'en'){
    langApplyAll();
    langObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] });
  } else {
    langObserver.disconnect();
    langRestoreAll();
  }
  const b = document.getElementById('langBtn');
  if(b) b.textContent = lang === 'en' ? '日本語' : 'EN';
}
function toggleLang(){ setLang(LANG === 'en' ? 'ja' : 'en'); }

// アラート・確認のダイアログ
{
  const a = window.alert.bind(window), c = window.confirm.bind(window);
  window.alert = msg => a(LANG === 'en' ? langTranslate(String(msg)) : msg);
  window.confirm = msg => c(LANG === 'en' ? langTranslate(String(msg)) : msg);
}

document.addEventListener('DOMContentLoaded', () => setLang(LANG));
