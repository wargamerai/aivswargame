// Monty's Melancholy: language. Japanese is the source; other languages are applied to the page text as it is rendered.
// The tables below map Japanese to English; mm_i18n.js maps that English to each other language.
(function (root) {
  let lang = 'ja', askAtStart = true;
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q) askAtStart = false;
    lang = q || localStorage.getItem('mm_lang') || 'ja';
  } catch (e) { /* no storage */ }
  const NAMES = { ja: '日本語', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano', es: 'Español', zh: '简体中文', ko: '한국어', ru: 'Русский' };
  const LANGS = ['ja', 'en', 'fr', 'de', 'it', 'es', 'zh', 'ko', 'ru'];
  if (!LANGS.includes(lang)) lang = 'ja';
  const DICT = (root.MM_I18N && root.MM_I18N[lang]) || {};
  const X = s => (DICT[s] !== undefined ? DICT[s] : s);

  const EXACT = {
    '防': 'D', '連': 'A', '移': 'M', '移攻': 'MA', '攻': 'Atk', '回': 'Rec',
    '攻撃': 'Attack', '移動': 'Move', '回復': 'Recover', '除去': 'Eliminated', '消耗': 'Depleted', '退却': 'Retreat',
    'パス': 'Pass', '実行': 'Execute', '確認': 'OK', '閉じる': 'Close', 'おまかせ': 'Auto', '決定': 'Confirm',
    'この札': 'This card', '山札': 'Deck', '1枚前(判定)': 'Previous card (judge)', '山札の最初': 'First card of the deck',
    '戦闘報告': 'After-Action Report', '地図': 'Map', '札': 'Card', '遊び方': 'How to Play', 'ゲーム開始': 'Game Start',
    'モントゴメリーの憂鬱': "Monty's Melancholy", '配置する': 'Place units', '初期配置を始めます': 'Starting the initial setup',
    '架橋部隊が登場': 'Bridging unit arrives',
  };
  const P = [
    [/あなたは連合軍です。ドイツ軍はルールどおり自動で動きます。/, 'You play the Allies. The Germans move automatically by the rules.'],
    [/札を1枚ずつめくり、書いてあることを実行します。判定には1枚前の札の左側の数字を使います。山札の最初の札は自分の左側を使います。/, 'Turn cards one at a time and carry them out. Judgements use the left side of the previous card. The first card of a deck uses its own left side.'],
    [/連合軍の札では、行動値の数まで駒を動かせます。補給下の駒だけが動けます。/, 'An Allied card lets you act with as many units as its action value. Only supplied units can act.'],
    [/地図の青い枠は、動かせる駒がいるエリアです。エリアを押して駒を選び、移動・攻撃・回復を決めて、下の「実行」を押します。/, 'A blue outline marks an area with units that can act. Click the area, select units, choose Move, Attack or Recover, then press Execute.'],
    [/命令は「実行」を押すまで確定しません。下の一覧の×で1つずつ消せます。「1つ戻す」「全部リセット」も使えます。/, 'Orders are not final until you press Execute. Remove one with its × below, or use Undo or Reset All.'],
    [/行動値が残っている間は札は終わりません。実行のあと、まだ動いていない駒に残りを使えます。終えるときは「パス」を押します。1駒が動けるのは1枚の札につき1回です。原作は全部の命令を決めてから一度に実行するので、ここは原作より連合軍に有利です。/, 'A card does not end while action points remain. After Execute, spend the rest on units that have not acted, or press Pass to finish. Each unit acts once per card. The original game executes all orders at once, so this favors the Allies.'],
    [/戦車と歩兵を一緒に「移動\+攻撃」にすると、戦車は移動して攻撃し、歩兵は移動だけします。/, 'If tanks and infantry are given Move + Attack together, tanks move and attack, and infantry only move.'],
    [/移動先の数字は必要な移動力です。橙の枠は渡河で、移動後に消耗します。/, 'The number on a destination is the movement cost. Orange means a river crossing: the unit is depleted after moving.'],
    [/駒が1つもいないエリアはドイツ軍の支配下に戻ります。幹線道路に駒を残さないと補給が切れます。/, 'An area with no units returns to German control. Keep units on the highway or supply is cut.'],
    [/勝利: 幹線道路がARNHEMまでつながり、第30軍団の駒がARNHEMに入る。/, 'Victory: the highway is connected to ARNHEM and a XXX Corps unit enters ARNHEM.'],
    [/敗北: 一度取ったARNHEMが支配下に戻る。または増援が出尽くしたあと、次の「橋はまだ遠い」が引かれる。/, 'Defeat: ARNHEM, once taken, returns to German control, or "A Bridge Too Far" is drawn again after all reinforcements have entered.'],
    [/空挺降下が終わりました。ここから札を1枚ずつめくります。/, 'The airborne landings are complete. From here, turn the cards one at a time.'],
    [/幹線道路がARNHEMまでつながり、第30軍団がARNHEMに入った。/, 'The highway reached ARNHEM and XXX Corps entered the city.'],
    [/ARNHEMがドイツ軍の支配下に戻った。/, 'ARNHEM returned to German control.'],
    [/増援が出尽くしたあと、次の「橋はまだ遠い」が引かれた。/, '"A Bridge Too Far" was drawn after all reinforcements had entered.'],
    [/勝利: /, 'Victory: '], [/敗北: /, 'Defeat: '],
    [/除去に必要な数を超えている。/, 'More points than needed to eliminate.'],
    [/損害を (\d+) ポイントすべて割り当てる。/, 'Assign all $1 hits.'],
    [/最初の1ポイントは防御力が最も高い駒に割り当てる。/, 'The first hit must go to the unit with the highest defense.'],
    [/無効になる損害が出ないように割り当てる。/, 'Assign hits so that none are wasted.'],
    [/連合軍(\d+)駒が攻撃、損害(\d+)。/, 'Allies attack with $1 units, $2 hits.'],
    [/ドイツ軍(\d+)駒が攻撃、損害(\d+)。/, 'Germans attack with $1 units, $2 hits.'],
    [/損害は効果なし。/, 'The hits have no effect.'],
    [/　(.+) 退却できず除去。/, '  $1 cannot retreat and is eliminated.'],
    [/退却できず除去/, 'Eliminated (no retreat)'],
    [/　(.+) → (.+)へ退却。/, '  $1 retreats to $2.'],
    [/退却→/, 'Retreat → '],
    [/動く駒はない。/, 'no units to act.'],
    [/移動(\d+)、攻撃(\d+)、回復(\d+)\(方向 ([ABC])\)。/, 'move $1, attack $2, recover $3 (direction $4).'],
    [/トラック: (.+) は全部登場ずみ。/, 'Track: $1 has all entered.'],
    [/トラック: (.+) が ([NEW]\d) に登場。/, 'Track: $1 enter at $2.'],
    [/トラック: (.+) が1列進む。/, 'Track: $1 advances one column.'],
    [/ドイツ軍増援\((\d+)\): /, 'German reinforcements ($1): '],
    [/連合軍増援\((\d+)\): /, 'Allied reinforcements ($1): '],
    [/ドイツ軍増援: カップは空。/, 'German reinforcements: the cup is empty.'],
    [/連合軍増援: カップは空。/, 'Allied reinforcements: the cup is empty.'],
    [/→待機ボックス/, ' → Waiting Box'], [/ 失われた/, ' lost'],
    [/行動値 (\d+)\+(\d+)=(\d+)。/, 'Action value $1+$2=$3.'],
    [/行動できる駒がない。/, 'No units can act.'],
    [/移動 (\d+)駒。/, 'Moved $1 units.'], [/回復 (\d+)駒。/, 'Recovered $1 units.'],
    [/残りの行動値 (\d+)。/, 'Action points left: $1.'],
    [/同じ駒に2回割り当てている。/, 'The same unit was ordered twice.'],
    [/(.+) は行動できない。/, '$1 cannot act.'],
    [/(.+) は消耗していない。/, '$1 is not depleted.'],
    [/(.+) は回復しかできない。/, '$1 can only recover.'],
    [/(.+) は攻撃できない。/, '$1 cannot attack.'],
    [/(.+) は (.+) へ移動できない。/, '$1 cannot move to $2.'],
    [/(.+) は移動・攻撃できない。/, '$1 cannot move and attack.'],
    [/不明な命令。/, 'Unknown order.'],
    [/行動値を超えている\((\d+)\/(\d+)\)。/, 'Over the action value ($1/$2).'],
    [/行動値を超えている。命令を減らす。/, 'Over the action value. Remove some orders.'],
    [/航空補給: (.+) を回復。/, 'Air supply: $1 recovered.'],
    [/航空補給: 回復させる駒を3つまで選ぶ。/, 'Air supply: choose up to 3 units to recover.'],
    [/航空補給\(3つまで\)/, 'Air supply (up to 3)'],
    [/降下作戦は見送り。/, 'The air drop is postponed.'],
    [/降下作戦: ポーランド旅団 (\d+)駒が (.+) に降下。/, 'Air drop: $1 Polish units land at $2.'],
    [/第30軍団の駒を Rommel か Bergeijk に置きます。Rommel に1駒も残さないと補給が切れます。/, 'Place XXX Corps units at Rommel or Bergeijk. If no unit stays at Rommel, supply is cut.'],
    [/(.+) の周りに降下します。まず司令部を置き、次に駒を置きます。/, 'Landing around $1. Place the HQ first, then the units.'],
    [/初期配置 (\d)\/(\d)/, 'Initial setup $1/$2'],
    [/第30軍団の配置/, 'XXX Corps setup'],
    [/RommelかBergeijkを選ぶ。Rommelに誰もいないと補給が切れる/, 'Choose Rommel or Bergeijk. If Rommel is empty, supply is cut'],
    [/(.+) の隣で敵のいないエリアを選ぶ/, 'Choose an enemy-free area next to $1'],
    [/司令部から2エリア以内、合計3エリアまで。敵のいるエリアは1つまで/, 'Within 2 areas of the HQ, 3 areas in total, at most 1 with enemies'],
    [/(.+) 司令部/, '$1 HQ'], [/(.+) の配置/, '$1 setup'],
    [/連合軍の配置から始める。/, 'Begin with the Allied setup.'],
    [/ゲーム開始。/, 'Game start.'],
    [/山札を作り直した\((\d+)回目\)。/, 'The deck was rebuilt (no. $1). '],
    [/増援は出尽くした。次の「橋はまだ遠い」で終わる。/, 'All reinforcements have entered. The next "A Bridge Too Far" ends the game.'],
    [/札 (\d+)枚目 ・ 山札 (\d+) ・ (\d+)巡目 ・ 増援カップ 連合(\d+) \/ 独(\d+)/, 'Card $1 · Deck $2 · Round $3 · Reinforcement cups: Allied $4 / German $5'],
    [/消耗\(防御(\d+)\)/, 'Depleted (defense $1)'],
    [/攻撃(\d+) 防御(\d+) 移動(\d+)/, 'Attack $1, Defense $2, Move $3'],
    [/本文 ([\d,]+)文字。画像を先にアップロードし、本文の「report_map.jpg」を画像のURLに置き換えます。/, 'Text: $1 characters. Upload the image first, then replace "report_map.jpg" in the text with its URL.'],
    [/コピーできません。保存を使ってください/, 'Copy failed. Please use Save'],
    [/駒が選ばれていない。/, 'No units are selected.'],
    [/今いるエリアです。移動先を押すか「移動をやめる」を押す。/, 'This is the current area. Click a destination or press Stop Moving.'],
    [/(.+) は盤外なので入れない。/, '$1 is off-map and cannot be entered.'],
    [/(.+) から (.+) へは道路でつながっていないか、移動力が足りない。緑か橙のエリアだけ選べる。/, '$2 cannot be reached from $1: no road, or not enough movement. Choose a green or orange area.'],
    [/(.+) と (.+) の間は軍団戦区境で、越えられない。/, 'The corps boundary between $1 and $2 cannot be crossed.'],
    [/(.+) へは河川を渡る。戦車は、架橋部隊が同じエリアにいて道路がある場合だけ渡れる。/, '$1 is across a river. Tanks can cross only with a bridging unit in the same area and a road.'],
    [/(.+) へは大河を渡る。道路のない所は渡れない。/, '$1 is across a major river. It cannot be crossed without a road.'],
    [/渡河のときは移動\+攻撃ができない。「移動」を使う。/, 'Move + Attack is not allowed when crossing a river. Use Move.'],
    [/(.+) へは移動力が足りないか、ルール上入れない。/, '$1 cannot be entered: not enough movement, or not allowed by the rules.'],
    [/(.+) の周りは河川で、戦車は架橋部隊なしで渡れない。先に歩兵で対岸を取る。/, 'Rivers surround $1, and tanks cannot cross without a bridging unit. Take the far bank with infantry first.'],
    [/選んだ駒に共通の移動先がない。駒を減らす。/, 'The selected units share no destination. Select fewer.'],
    [/この駒には移動先がない。/, 'This unit has no destination.'],
    [/増援トラック (\d)列目/, 'Reinforcement track, column $1'],
    [/移動攻撃→/, 'Move + Attack → '], [/移動→/, 'Move → '],
    [/空挺降下が終わった。ここから札をめくる。/, 'The landings are complete. Turn the first card.'],
    [/(.+): (\d+)駒が行動する\(方向 ([ABC])\)。橙の枠の駒が対象。/, '$1: $2 units act (direction $3). Units with an orange outline are affected.'],
    [/(.+): (\d+)駒。橙の枠の駒が登場した。/, '$1: $2 units. Units with an orange outline have entered.'],
    [/青い枠のエリアを押して駒を選ぶ。終わるならパス。/, 'Click an area outlined in blue to select units. Press Pass to finish.'],
    [/緑か橙のエリアを押して移動先を決める。橙は渡河で、移動後に消耗する。/, 'Click a green or orange area to choose the destination. Orange is a river crossing: the unit is depleted after moving.'],
    [/攻撃を解決するエリアを地図で選ぶ。/, 'Choose on the map which attack to resolve.'],
    [/(.+) の退却先を選ぶ。/, 'Choose where $1 retreats.'],
    [/(.+) の退却先/, '$1: retreat destination'],
    [/ポーランド旅団の降下先を地図で選ぶ\(敵のいないエリア\)。/, 'Choose the Polish landing area on the map (an enemy-free area).'],
    [/(.+) の戦闘。/, 'Battle at $1.'],
    [/(.+) の戦闘/, 'Battle at $1'],
    [/ \(市街: 攻撃力3以上は-1\)/, ' (city: attack 3 or more is -1)'],
    [/駒を押して選ぶ。暗い駒は補給切れか札の対象外。/, 'Click units to select them. Dimmed units are out of supply or not on this card.'],
    [/(.+) は移動力0・攻撃力0なので、移動も攻撃もしません。/, '$1 has movement 0 and attack 0, so it will not move or attack.'],
    [/(.+) は攻撃力0なので攻撃しません。/, '$1 has attack 0, so it will not attack.'],
    [/攻撃できるのは同じエリアの敵だけ。このエリアに敵はいない。戦車以外は、移動した札では攻撃できない。/, 'Units attack only enemies in the same area, and there are none here. Only tanks can move and attack with the same card.'],
    [/① この窓の駒を押して選ぶ ② 地図の Rommel か Bergeijk を押す。Rommel に1駒は残す\(空だと補給が切れる\)。/, '1) Click units in this window to select them. 2) Click Rommel or Bergeijk on the map. Keep at least one unit in Rommel (if it is empty, supply is cut).'],
    [/架橋部隊が Rommel に来ました。渡河できない駒\(戦車など\)は、架橋部隊と同じエリアにいて道路がある場合だけ川を渡れます。/, 'The bridging unit has arrived at Rommel. Units that cannot cross rivers (such as tanks) can cross only with the bridging unit in the same area and a road.'],
    [/選んだ駒を置くエリアを地図で押す。対戦車は敵のいるエリアに置けない。/, 'Click the area for the selected units. Anti-tank units cannot be placed with enemies.'],
    [/攻撃力(\d+)以下で命中/, 'Hits on $1 or less'],
    [/攻撃力 (\d+)/, 'Attack $1'],
    [/押すと (\d+)点 /, 'Click: $1 hits, '],
    [/(\d+)点 /, '$1 hits: '],
    [/(\d+)駒が攻撃、命中(\d+)。/, '$1 units attack, $2 hits.'],
    [/受けられる損害は(\d+)まで。/, 'Only $1 can be absorbed.'],
    [/損害(\d+)は効果なし。/, '$1 hit(s): no effect.'],
    [/緑の駒を押すと損害を受ける: 残り(\d+)。/, 'Click a green unit to take hits: $1 left.'],
    [/最初の1点は防御力が最も高い駒へ。/, 'The first hit goes to the highest defense.'],
    [/ 「やり直す」で選び直す。/, ' Press Start Over to choose again.'],
    [/緑のエリアかボタンを押す。/, 'Click a green area or a button.'],
    [/警告: Rommelが空になります/, 'Warning: Rommel will be empty'],
    [/全部を (.+) に置くと、Rommelに駒がいなくなります。第30軍団の補給が切れて、近衛の札でも動けません。/, 'Placing everything at $1 leaves Rommel empty. XXX Corps supply is cut, and Guards cards cannot move them.'],
    [/Rommelに残す駒を押してください。/, 'Click the unit to keep at Rommel.'],
    [/今のゲームを捨てて始めますか/, 'Abandon this game and start a new one?'],
    [/ ・ 連合軍支配/, ' · Allied control'], [/ ・ ドイツ軍支配/, ' · German control'],
    [/残り(\d+)駒。/, '$1 units left.'],
    [/(\d+SS)師団/, '$1 Division'],
    [/残り行動値/, 'Action points left'], [/この札 (\d+)/, 'This card $1'], [/命令中 (\d+)/, 'Ordered $1'],
  ].map(([r, s]) => [new RegExp(r.source, 'g'), X(s)]);
  const PH = {
    '東部戦区(107装甲旅団)': 'East Sector (107th Panzer Bde)', 'SS第10装甲師団': '10th SS Panzer Div', 'SS第9装甲師団': '9th SS Panzer Div',
    '米第101空挺師団': 'US 101st Airborne', '米第82空挺師団': 'US 82nd Airborne', '英第11機甲師団': 'UK 11th Armoured', '英第1空挺師団': 'UK 1st Airborne',
    '英第30軍団': 'UK XXX Corps', '英第50師団': 'UK 50th Division', '英近衛機甲師団': 'Guards Armoured', '橋はまだ遠い': 'A Bridge Too Far',
    '連合軍増援': 'Allied Reinforcement', 'ドイツ軍増援': 'German Reinforcement', 'トラックから登場': 'Entering from the track', '降下作戦': 'Air Drop',
    '北部戦区': 'North Sector', '東部戦区': 'East Sector', '西部戦区': 'West Sector', '英第1空挺': 'UK 1st Airborne', '米第82空挺': 'US 82nd Airborne', '米第101空挺': 'US 101st Airborne',
    '連合軍の勝利': 'Allied Victory', '連合軍の敗北': 'Allied Defeat', 'ゲーム終了': 'Game over', '架橋': 'Bridge', '戦車': 'Tank', '渡河可': 'River crossing', '司令部': 'HQ', '対戦車': 'Anti-tank', '防御態勢': 'Defensive', '補給切れ': 'Out of supply',
    '除去された駒': 'Eliminated units', '縮小': 'Zoom −', '拡大': 'Zoom +', '文字−': 'Text −', '文字+': 'Text +', '新しいゲーム': 'New Game', 'レポートへ': 'To the Report', 'レポートを見る': 'View Report',
    '1本もので保存': 'Save as one file', 'ブログ用に分割': 'Split for a blog', '本文をコピー': 'Copy text', 'コピーしました': 'Copied', '本文を保存': 'Save text', '地図の画像を保存': 'Save map image',
    '最初の札をめくる': 'Turn the first card', '次の札をめくる': 'Turn the next card', '駒を選ぶ': 'Select units', '移動をやめる': 'Stop Moving', '1つ戻す': 'Undo', '全部リセット': 'Reset All', '全部選ぶ': 'Select All', '行動値分選ぶ': 'Select by Action Value', '消耗している駒を選ぶ': 'Select Depleted', '全部外す': 'Clear All',
    '今回は降下しない': 'Do not drop now', '移動+攻撃': 'Move + Attack', '命令を消す': 'Remove orders', 'やり直す': 'Start Over', '選び直す': 'Choose Again', 'このまま置く': 'Place Anyway', 'この命令を消す': 'Remove this order',
    '駒はない。': 'No units.', '連合軍': 'Allies', 'ドイツ軍': 'Germans', '攻撃': 'attack', '防御': 'defense', '効果なし': 'no effect', '除去': 'eliminated', '消耗': 'depleted', '退却': 'retreat', '回復': 'recover', '移動': 'move',
  };
  const KEYS = Object.keys(PH).sort((a, b) => b.length - a.length);
  const JA = /[぀-ヿ㐀-鿿]/;
  // translated output is remembered: Chinese text contains kanji and must not be translated a second time
  const DONE = new Set();
  const tidy = o => {
    if (lang === 'en') o = o.replace(/\b1 units\b/g, '1 unit').replace(/\b1 hits\b/g, '1 hit');
    if (lang === 'zh') return o.replace(/・/g, ' · ').replace(/[「」]/g, '"').replace(/　/g, '  ');
    return o.replace(/、/g, ', ').replace(/。/g, '. ').replace(/・/g, ' · ').replace(/[「」]/g, '"').replace(/【/g, '[').replace(/】/g, ']').replace(/　/g, '  ').replace(/\.(?=[\p{Lu}가-힣])/gu, '. ');
  };
  function T(s) {
    if (lang === 'ja' || !s || !JA.test(s) || DONE.has(s)) return s;
    const t = s.trim();
    let o;
    if (EXACT[t]) o = s.replace(t, X(EXACT[t]));
    else {
      o = s;
      for (const [r, v] of P) o = o.replace(r, v);
      for (const k of KEYS) if (o.includes(k)) o = o.split(k).join(X(PH[k]));
      o = tidy(o).replace(/\s+$/, m => (s.endsWith(' ') ? m : ''));
    }
    DONE.add(o);
    return o;
  }
  function apply(node) {
    if (lang === 'ja' || !node) return;
    if (node.nodeType === 3) { const v = T(node.nodeValue); if (v !== node.nodeValue) node.nodeValue = v; return; }
    if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.id === 'lg') return;
    for (const a of ['title', 'alt']) { if (node.hasAttribute && node.hasAttribute(a)) { const v = T(node.getAttribute(a)); if (v !== node.getAttribute(a)) node.setAttribute(a, v); } }
    node.childNodes.forEach(apply);
  }
  function setLang(l) {
    try { localStorage.setItem('mm_lang', l); } catch (e) { /* no storage */ }
    const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
  }
  // keeps the page when the choice matches the language already showing
  function choose(l) {
    if (l === lang) { try { localStorage.setItem('mm_lang', l); } catch (e) { /* no storage */ } return; }
    setLang(l);
  }
  function init() {
    const b = document.getElementById('bLang');
    if (b) {
      b.textContent = NAMES[lang];
      b.onclick = () => { document.getElementById('lg').style.display = 'flex'; };
    }
    const box = document.getElementById('lgBtns');
    if (box) {
      LANGS.forEach(l => {
        const x = document.createElement('button');
        x.className = 'go'; x.lang = l; x.textContent = NAMES[l];
        x.onclick = () => { choose(l); document.getElementById('lg').style.display = 'none'; if (api.onClose) api.onClose(); };
        box.appendChild(x);
      });
    }
    if (lang === 'ja') return;
    document.documentElement.lang = lang;
    // the page font is Japanese: Chinese and Korean need their own
    if (lang === 'zh') document.body.style.fontFamily = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
    if (lang === 'ko') document.body.style.fontFamily = "'Apple SD Gothic Neo','Malgun Gothic',sans-serif";
    // the Japanese font draws Cyrillic with wide spacing
    if (lang === 'ru') document.body.style.fontFamily = "'Helvetica Neue',Arial,sans-serif";
    document.title = X("Monty's Melancholy");
    const nativeConfirm = window.confirm.bind(window);
    window.confirm = m => nativeConfirm(T(m));
    apply(document.body);
    new MutationObserver(ms => {
      ms.forEach(m => {
        if (m.type === 'characterData') apply(m.target);
        else m.addedNodes.forEach(apply);
      });
    }).observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  const api = { T, X, LANGS, NAMES, apply, init, setLang, choose, get askAtStart() { return askAtStart; }, get lang() { return lang; }, _setLang(l) { lang = l; } };
  if (typeof module !== 'undefined') module.exports = api;
  root.MMLang = api;
  try {
    if (typeof window !== 'undefined' && window.goatcounter === undefined) window.goatcounter = {};
    if (typeof window !== 'undefined') window.goatcounter.path = () => location.pathname + '?lang=' + lang;
  } catch (e) { /* ignore */ }
})(typeof globalThis !== 'undefined' ? globalThis : this);
