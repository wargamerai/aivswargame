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
const RANGE_NAME = { L:'長距離', M:'中距離', C:'近距離', OUT:'圏外' };
const RANGE_CHAR = { C:'C（常に近距離）', LM:'L/M（慎重）', LMC:'L/M/C（慎重）', MC:'M/C' };

// 船団ユニット（3.5・まとめ）: 低速 ON/SC ×3、高速 ON/HX ×4
const CONVOY_UNITS = [
  { id:'SLOW-1', speed:'slow', canada:'SC' }, { id:'SLOW-2', speed:'slow', canada:'SC' }, { id:'SLOW-3', speed:'slow', canada:'SC' },
  { id:'FAST-1', speed:'fast', canada:'HX' }, { id:'FAST-2', speed:'fast', canada:'HX' }, { id:'FAST-3', speed:'fast', canada:'HX' }, { id:'FAST-4', speed:'fast', canada:'HX' },
];
const PORT_NAME = { HX:'ハリファックス', SC:'セント・ジョンズ', ON:'リバプール' };

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
  NC: { name:'北方航路', slow:[[0,7],[0,8],[0,9],[0,10],[0,11],[1,11]], fast:[[0,7],[0,8],[0,9],[0,10],[1,11]] },
  CC: { name:'中央航路', slow:[[1,8],[1,9],[1,10],[1,11]],              fast:[[1,8],[1,9],[1,10],[1,11]] },
  SC: { name:'南方航路', slow:[[2,9],[2,10],[1,10],[1,11]],             fast:[[2,9],[2,10],[1,11]] },
};

// セクターごとのイベント・マーカー（3.3・まとめ）
const EVENT_MIX = { C:{ RE:1, UB:1, NE:8 }, A:{ RE:1, UB:6, NE:8 }, W:{ RE:1, UB:2, NE:9 } };
const SECTOR_NAME = { C:'カナダ水域', A:'エア・ギャップ', W:'ウェスタン・アプローチ' };

const WEATHER = ['好天', '悪天候', '霧／雪', '暴風雨'];

// 喪失トン数の勝利点（12.1）
function vpForTonnage(t) {
  if (t < 25000) return 3; if (t < 37500) return 2; if (t < 50000) return 1;
  if (t < 62500) return 0; if (t < 75000) return -1; if (t < 87500) return -2; return -3;
}
// 1年間の勝利レベル（12.2）
function victoryLevel(vp) {
  if (vp >= 7) return '提督級勝利'; if (vp >= 4) return '連合軍大勝利'; if (vp >= 1) return '連合軍辛勝';
  if (vp === 0) return '引き分け'; if (vp >= -3) return 'ドイツ軍辛勝'; if (vp >= -6) return 'ドイツ軍大勝利'; return '国家転覆的大敗北';
}
const VICTORY_LEVELS = ['国家転覆的大敗北', 'ドイツ軍大勝利', 'ドイツ軍辛勝', '引き分け', '連合軍辛勝', '連合軍大勝利', '提督級勝利'];

// コルベットの区画（3.1）
const SECTIONS = [
  { key:'gun4',  name:'4インチ砲' }, { key:'aa', name:'対空砲' }, { key:'dc', name:'爆雷' },
  { key:'asdic', name:'ASDIC' },     { key:'watch', name:'監視' }, { key:'engine', name:'機関' },
  { key:'radar', name:'レーダー' },   { key:'hh', name:'ヘッジホッグ' }, { key:'hfdf', name:'HF-DF' },
];
const SECTION_NAME = Object.fromEntries(SECTIONS.map(s => [s.key, s.name]));
// 新しい装備（3.1・13章）が使えるようになる年月（年*12+月）
const EQUIP_DATE = { radar: 1941 * 12 + 9, hh: 1942 * 12 + 10, hfdf: 1942 * 12 + 11 };

// 艦名（15.0）
const SHIP_NAMES = [
  'HMCS〈アルバーニ〉', 'HMS〈ブルーベル〉', 'HMS〈コンパス・ローズ〉', 'HMS〈ダイアンサス〉', 'HMCS〈アイブライト〉', 'HMCS〈フェンネル〉',
  'HMS〈グラジオラス〉', 'HMS〈ハニーサックル〉', 'HMCS〈レヴィ〉', 'HMS〈マロウ〉', 'HMS〈マリーゴールド〉', 'HMS〈オルキス〉',
  'HMS〈ペチュニア〉', 'HMCS〈サスカトゥーン〉', 'HMCS〈シャウィニガン〉', 'HMS〈サンフラワー〉', 'HMS〈ヴェッチ〉', 'HMS〈ジニア〉',
];

// ランダム・イベント（14章）の名前。RE プールは 1〜20
const RE_NAME = {
  1:'幸運', 2:'生存者発見', 3:'油膜発見', 4:'機雷／ソナーに感', 5:'落水', 6:'潜望鏡発見', 7:'氷山', 8:'キャッチアップ',
  9:'海軍本部からの情報', 10:'空襲', 11:'敵機／ミルヒ・クー発見', 12:'救助要請', 13:'たゆまぬ努力', 14:'酒保開け',
  15:'暗号通信', 16:'巧みな操艦', 17:'洋上補給', 18:'急病人発生', 19:'火災発生', 20:'借りは返す',
};
