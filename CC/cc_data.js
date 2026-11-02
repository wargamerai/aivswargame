// コルベット・コマンド（Corvette Command: Battle of the Atlantic 1941-43）— 表とデータ
// 出典: ルールブック（CC_rules.md）と、ユーザーのまとめ（コルベットコマンド.xlsx / さまりー）

// A/P 判定表（5.1）: AP_TABLE[P-1][A-1]。d66 でこの値以下なら成功
const AP_TABLE = [
  [36,41,43,45,51,53,55,61,63,65],
  [35,36,41,43,45,51,53,55,61,63],
  [33,35,36,41,43,45,51,53,55,61],
  [31,33,35,36,41,43,45,51,53,55],
  [25,31,33,35,36,41,43,45,51,53],
  [23,25,31,33,35,36,41,43,45,51],
  [21,23,25,31,33,35,36,41,43,45],
  [15,21,23,25,31,33,35,36,41,43],
  [13,15,21,23,25,31,33,35,36,41],
  [11,13,15,21,23,25,31,33,35,36],
];

// U ボート（2.3.2・xlsx「uboat」）: 性格（攻撃距離）・攻撃値・回避値。攻撃回数は VII 型 3、IX 型 4
const UBOATS = [
  { id:'VII-1',  type:7, range:'C',   atk:6, eva:6 },
  { id:'VII-2',  type:7, range:'LM',  atk:3, eva:2 },
  { id:'VII-3',  type:7, range:'LM',  atk:4, eva:3 },
  { id:'VII-4',  type:7, range:'LM',  atk:5, eva:3 },
  { id:'VII-5',  type:7, range:'LMC', atk:3, eva:5 },
  { id:'VII-6',  type:7, range:'LMC', atk:4, eva:4 },
  { id:'VII-7',  type:7, range:'MC',  atk:2, eva:4 },
  { id:'VII-8',  type:7, range:'MC',  atk:3, eva:3 },
  { id:'VII-9',  type:7, range:'MC',  atk:3, eva:4 },
  { id:'VII-10', type:7, range:'MC',  atk:4, eva:3 },
  { id:'VII-11', type:7, range:'MC',  atk:4, eva:5 },
  { id:'VII-12', type:7, range:'MC',  atk:5, eva:4 },
  { id:'VII-13', type:7, range:'MC',  atk:5, eva:5 },
  { id:'IX-1',   type:9, range:'C',   atk:6, eva:5 },
  { id:'IX-2',   type:9, range:'LM',  atk:3, eva:3 },
  { id:'IX-3',   type:9, range:'LM',  atk:4, eva:2 },
  { id:'IX-4',   type:9, range:'MC',  atk:4, eva:4 },
  { id:'IX-5',   type:9, range:'MC',  atk:5, eva:4 },
  { id:'IX-6',   type:9, range:'MC',  atk:6, eva:4 },
];
const RANGE_NAME = { L:L('長距離', 'Long'), M:L('中距離', 'Medium'), C:L('近距離', 'Close'), OUT:L('圏外', 'Out of range') };
const RANGE_CHAR = { C:L('C（常に近距離）', 'C (always close)'), LM:L('L/M（慎重）', 'L/M (cautious)'), LMC:L('L/M/C（慎重）', 'L/M/C (cautious)'), MC:'M/C' };

// 船団ユニット（3.5・まとめ）: 低速 ON/SC ×3、高速 ON/HX ×4
const CONVOY_UNITS = [
  { id:'SLOW-1', speed:'slow', canada:'SC' }, { id:'SLOW-2', speed:'slow', canada:'SC' }, { id:'SLOW-3', speed:'slow', canada:'SC' },
  { id:'FAST-1', speed:'fast', canada:'HX' }, { id:'FAST-2', speed:'fast', canada:'HX' }, { id:'FAST-3', speed:'fast', canada:'HX' }, { id:'FAST-4', speed:'fast', canada:'HX' },
];
const PORT_NAME = { HX:L('ハリファックス', 'Halifax'), SC:L('セント・ジョンズ', 'St. John\'s'), ON:L('リバプール', 'Liverpool') };

// 航路のマス（地図）。行 0〜3（北から）、列 0〜12（西から）
//  C=カナダ水域 / A=エア・ギャップ / A20=1942年6月からカナダ水域 / A30=1942年6月からウェスタン・アプローチ / W=ウェスタン・アプローチ
//  HX・SC・ON=港
const MAP_ROWS = [
  //  0     1     2     3     4      5     6      7     8     9     10    11    12
  [ null, null, null, 'C',  'A20', 'A',  'A30', 'W',  'W',  'W',  'W',  'W',  null ],
  [ null, null, null, 'C',  'A20', 'A',  'A',   'A',  'W',  'W',  'W',  'W',  'ON' ],
  [ null, 'C',  'SC', 'C',  'A',   'A',  'A',   'A',  'A',  'W',  'W',  null, null ],
  [ 'HX', 'C',  'C',  'C',  'C',   'A',  'A',   'A',  null, null, null, null, null ],
];
const PORT_POS = { HX:[3,0], SC:[2,2], ON:[1,12] };

// ウェスタン・アプローチの割り当て航路（3.6・地図の矢印）。西の端 → リバプール
const WA_ROUTES = {
  NC: { name:L('北方航路', 'Northern route'), slow:[[0,7],[0,8],[0,9],[0,10],[0,11],[1,11]], fast:[[0,7],[0,8],[0,9],[0,10],[1,11]] },
  CC: { name:L('中央航路', 'Central route'), slow:[[1,8],[1,9],[1,10],[1,11]],              fast:[[1,8],[1,9],[1,10],[1,11]] },
  SC: { name:L('南方航路', 'Southern route'), slow:[[2,9],[2,10],[1,10],[1,11]],             fast:[[2,9],[2,10],[1,11]] },
};

// セクターごとのイベント・マーカー（3.3・まとめ）
const EVENT_MIX = { C:{ RE:1, UB:1, NE:8 }, A:{ RE:1, UB:6, NE:8 }, W:{ RE:1, UB:2, NE:9 } };
const SECTOR_NAME = { C:L('カナダ水域', 'Canadian waters'), A:L('エア・ギャップ', 'the Air Gap'), W:L('ウェスタン・アプローチ', 'the Western Approaches') };

const WEATHER = [L('好天', 'Fair'), L('悪天候', 'Poor'), L('霧／雪', 'Fog/Snow'), L('暴風雨', 'Storm')];

// 喪失トン数の勝利点（12.1）
function vpForTonnage(t) {
  if (t < 25000) return 3; if (t < 37500) return 2; if (t < 50000) return 1;
  if (t < 62500) return 0; if (t < 75000) return -1; if (t < 87500) return -2; return -3;
}
// 1年間の勝利レベル（12.2）
function victoryLevel(vp) {
  if (vp >= 7) return L('提督級勝利', 'Admiral\'s victory'); if (vp >= 4) return L('連合軍大勝利', 'Major Allied victory'); if (vp >= 1) return L('連合軍辛勝', 'Marginal Allied victory');
  if (vp === 0) return L('引き分け', 'Draw'); if (vp >= -3) return L('ドイツ軍辛勝', 'Marginal German victory'); if (vp >= -6) return L('ドイツ軍大勝利', 'Major German victory'); return L('国家転覆的大敗北', 'Catastrophic defeat');
}
const VICTORY_LEVELS = [L('国家転覆的大敗北', 'Catastrophic defeat'), L('ドイツ軍大勝利', 'Major German victory'), L('ドイツ軍辛勝', 'Marginal German victory'), L('引き分け', 'Draw'), L('連合軍辛勝', 'Marginal Allied victory'), L('連合軍大勝利', 'Major Allied victory'), L('提督級勝利', 'Admiral\'s victory')];

// コルベットの区画（3.1）
const SECTIONS = [
  { key:'gun4',  name:L('4インチ砲', '4-inch gun') }, { key:'aa', name:L('対空砲', 'AA gun') }, { key:'dc', name:L('爆雷', 'Depth charges') },
  { key:'asdic', name:'ASDIC' },     { key:'watch', name:L('監視', 'Lookout') }, { key:'engine', name:L('機関', 'Engine') },
  { key:'radar', name:L('レーダー', 'Radar') },   { key:'hh', name:L('ヘッジホッグ', 'Hedgehog') }, { key:'hfdf', name:'HF-DF' },
];
const SECTION_NAME = Object.fromEntries(SECTIONS.map(s => [s.key, s.name]));
// 新しい装備（3.1・13章）が使えるようになる年月（年*12+月）
const EQUIP_DATE = { radar: 1941 * 12 + 9, hh: 1942 * 12 + 10, hfdf: 1942 * 12 + 11 };

// 艦名（15.0）
const SHIP_NAMES = [
  L('HMCS〈アルバーニ〉', 'HMCS Alberni'), L('HMS〈ブルーベル〉', 'HMS Bluebell'), L('HMS〈コンパス・ローズ〉', 'HMS Compass Rose'), L('HMS〈ダイアンサス〉', 'HMS Dianthus'), L('HMCS〈アイブライト〉', 'HMCS Eyebright'), L('HMCS〈フェンネル〉', 'HMCS Fennel'),
  L('HMS〈グラジオラス〉', 'HMS Gladiolus'), L('HMS〈ハニーサックル〉', 'HMS Honeysuckle'), L('HMCS〈レヴィ〉', 'HMCS Lévis'), L('HMS〈マロウ〉', 'HMS Mallow'), L('HMS〈マリーゴールド〉', 'HMS Marigold'), L('HMS〈オルキス〉', 'HMS Orchis'),
  L('HMS〈ペチュニア〉', 'HMS Petunia'), L('HMCS〈サスカトゥーン〉', 'HMCS Saskatoon'), L('HMCS〈シャウィニガン〉', 'HMCS Shawinigan'), L('HMS〈サンフラワー〉', 'HMS Sunflower'), L('HMS〈ヴェッチ〉', 'HMS Vetch'), L('HMS〈ジニア〉', 'HMS Zinnia'),
];

// ランダム・イベント（14章）の名前。RE プールは 1〜20
const RE_NAME = {
  1:L('幸運', 'Luck'), 2:L('生存者発見', 'Survivors Sighted'), 3:L('油膜発見', 'Oil Slick'), 4:L('機雷／ソナーに感', 'Mine / Sonar Contact'), 5:L('落水', 'Man Overboard'), 6:L('潜望鏡発見', 'Periscope Sighted'), 7:L('氷山', 'Icebergs'), 8:L('キャッチアップ', 'Catch-Up'),
  9:L('海軍本部からの情報', 'Admiralty Intelligence'), 10:L('空襲', 'Air Raid'), 11:L('敵機／ミルヒ・クー発見', 'Enemy Aircraft / Milch Cow'), 12:L('救助要請', 'Call for Assistance'), 13:L('たゆまぬ努力', 'Tireless Effort'), 14:L('酒保開け', 'Splice the Mainbrace'),
  15:L('暗号通信', 'Cipher Traffic'), 16:L('巧みな操艦', 'Skilled Shiphandling'), 17:L('洋上補給', 'Refuelling at Sea'), 18:L('急病人発生', 'Sudden Illness'), 19:L('火災発生', 'Fire!'), 20:L('借りは返す', 'Payback'),
};
