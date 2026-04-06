// data.js — 聖戦士ダンバイン オーラバトラー ゲームデータ
// マスターチャート: dunbain/1dunbine_data.xlsx（例: 受け率表・格闘命中率表・移動力表…）
// 表を直すときは xlsx を正とし、ここへ同期すること。

// ===== パイロットランク表（1dunbine_data_csv/パイロットランク表.csv と同期）=====
// CSV「搭乗オーラ力」が X(Y) のとき: X＝搭乗時オーラ力、Y＝オーラバトラー搭乗時（表）のオーラ力。
// aura＝括弧内Y（111Book1・搭乗オーラ解放成功時の仮オーラ・パワー判定票の列） / auraBoarding＝X＝初期currentAura・オーラ力変動表の縦 / auraMax＝上限
// 数字のみ（例: 3）＝搭乗も表も同値（auraBoarding 省略可）
const PILOTS = {
  'ショウ・ザマ':         { aura: 7, auraMax: 7, auraBoarding: 6, side: 'given', earthling: true },
  'マーベル・フローズン': { aura: 6, auraMax: 6, auraBoarding: 5, side: 'given', earthling: true },
  'ニー・ギブン':         { aura: 3, auraMax: 3, side: 'given' },
  'キーン・キッス':       { aura: 4, auraMax: 4, auraBoarding: 3, side: 'given' },
  'リムル・ルフト':       { aura: 3, auraMax: 3, side: 'given' },
  'トッド・ギネス':       { aura: 6, auraMax: 6, auraBoarding: 5, side: 'drake', earthling: true },
  'トカマク・ロブスキー': { aura: 5, auraMax: 5, side: 'drake', earthling: true },
  'アレン・ブレディ':     { aura: 5, auraMax: 5, side: 'drake', earthling: true },
  'フェイ・チェンカ':     { aura: 5, auraMax: 5, side: 'drake', earthling: true },
  'ジェリル・クチビ':     { aura: 5, auraMax: 5, side: 'drake', earthling: true },
  'バーン・バニングス':   { aura: 5, auraMax: 5, auraBoarding: 4, side: 'drake' },
  'ガラリア・ニャムヒー': { aura: 4, auraMax: 4, side: 'drake' },
  'ミュージー・ポー':     { aura: 4, auraMax: 4, side: 'drake' },
  'ガラミティ・マンガン': { aura: 4, auraMax: 4, side: 'drake' },
  'ダー':                 { aura: 3, auraMax: 3, side: 'drake' },
  'ニエット':             { aura: 3, auraMax: 3, side: 'drake' },
  '一般兵':               { aura: 3, auraMax: 3, side: 'any' },
  'フォイゾン・ゴウ':     { aura: 3, auraMax: 3, side: 'given' },
  'トルストール・チュレンコ': { aura: 3, auraMax: 3, side: 'drake' },
  'ゼット・ライト':       { aura: 5, auraMax: 5, side: 'drake' },
};

/** パイロットが地上人ならAタイプ、バイストン・ウェルの人ならBタイプに自動切替。A/B型がない機体はそのまま */
function resolveMachineVariant(machineName, pilotName) {
  if (!machineName) return machineName;
  const pilot = PILOTS[pilotName] || {};
  const isEarthling = !!pilot.earthling;
  // 末尾の " A" / " B" を除去してベース名を得る
  const base = machineName.replace(/ [AB]$/, '');
  const varA = base + ' A';
  const varB = base + ' B';
  const hasA = !!(AURA_BATTLERS[varA] || WING_CALIBERS[varA]);
  const hasB = !!(AURA_BATTLERS[varB] || WING_CALIBERS[varB]);
  if (hasA && hasB) {
    return isEarthling ? varA : varB;
  }
  // A/B型が両方ない場合は元の名前をそのまま返す
  return AURA_BATTLERS[machineName] || WING_CALIBERS[machineName] ? machineName : base;
}

// ===== オーラ力判定（変動1–2のあとの再判定）=====
// 111Book1.csv 相当：縦＝パイロット表オーラ力、横＝1d6（配列は左から出目6,5,4,3,2,1）
const AURA_PILOT_D6_TABLE = {
  8: [10, 10, 9, 8, 7, 6],
  7: [10, 9, 8, 7, 6, 5],
  6: [9, 8, 7, 6, 5, 4],
  5: [8, 7, 6, 5, 4, 4],
  4: [7, 6, 6, 5, 4, 3],
  3: [6, 6, 5, 4, 3, 2],
};

function resolveAuraFromPilotRollTable(pilotChartAura, d6) {
  let rowKey = Math.round(Number(pilotChartAura));
  if (!Number.isFinite(rowKey)) rowKey = 5;
  rowKey = Math.max(3, Math.min(8, rowKey));
  const die = Math.max(1, Math.min(6, Math.round(Number(d6))));
  const row = AURA_PILOT_D6_TABLE[rowKey];
  return row[6 - die];
}

/** 実効ランクが B 以上（a または b）か。a が最上位 */
function isEffectiveRankAtLeastB(rankLetter) {
  const r = String(rankLetter || '').toLowerCase();
  return r === 'a' || r === 'b';
}

// ===== パワー判定票（1dunbine_data_csv/パワー判定票.csv と同一）=====
// ターン開始: 111Book1 等で決めた「新オーラ力」と、機体のパワー行（a〜f）の交差 → 実効パワー（a〜g）
// 配列 index = オーラ力 − 2（0→オーラ2 … 8→オーラ10）
const POWER_TABLE = {
  'a': ['e','e','d','c','c','b','b','a','a'],
  'b': ['e','e','d','d','c','c','b','b','a'],
  'c': ['f','e','e','d','d','c','c','b','b'],
  'd': ['g','f','e','e','d','d','c','c','b'],
  'e': ['g','f','f','e','e','d','d','c','c'],
  'f': ['g','g','f','f','e','e','d','d','c'],
};

// ===== オーラバトラー性能表 =====
const AURA_BATTLERS = {
  'ダンバイン A':     { power: 'b', reqAura: 4, limitAura: Infinity, type: 'AB' },
  'ダンバイン B':     { power: 'c', reqAura: 4, limitAura: Infinity, type: 'AB' },
  'ビルバイン':       { power: 'a', reqAura: 5, limitAura: Infinity, type: 'AB', canTransform: true },
  'ダーナオシー A':   { power: 'e', reqAura: 4, limitAura: 9, type: 'AB' },
  'ダーナオシー B':   { power: 'e', reqAura: 2, limitAura: 7, type: 'AB' },
  'ボゾン A':         { power: 'd', reqAura: 3, limitAura: 6, type: 'AB' },
  'ボゾン B':         { power: 'd', reqAura: 2, limitAura: 4, type: 'AB' },
  'ボゾン(マーベル用)': { power: 'd', reqAura: 4, limitAura: 8, type: 'AB' },
  'ボチューン A':     { power: 'c', reqAura: 3, limitAura: 9, type: 'AB' },
  'ボチューン B':     { power: 'c', reqAura: 2, limitAura: 7, type: 'AB' },
  'ゲド':             { power: 'e', reqAura: 4, limitAura: 8, type: 'AB' },
  'ビランビー':       { power: 'b', reqAura: 3, limitAura: 8, type: 'AB' },
  'ドラムロ A':       { power: 'd', reqAura: 4, limitAura: 9, type: 'AB' },
  'ドラムロ B':       { power: 'd', reqAura: 2, limitAura: 7, type: 'AB' },
  'バストール A':     { power: 'c', reqAura: 3, limitAura: 8, type: 'AB' },
  'バストール B':     { power: 'c', reqAura: 2, limitAura: 6, type: 'AB' },
  'ビアレス':         { power: 'b', reqAura: 3, limitAura: 8, type: 'AB' },
  'レプラカーン':     { power: 'c', reqAura: 3, limitAura: 8, type: 'AB' },
  'ライネック':       { power: 'b', reqAura: 4, limitAura: 9, type: 'AB' },
  'ズワース':         { power: 'a', reqAura: 4, limitAura: 8, type: 'AB' },
  'ガラバ':           { power: 'b', reqAura: 3, limitAura: 8, type: 'AB' },
};

// ===== WC・オーラボム性能表（仮実装） =====
const WING_CALIBERS = {
  'フォウ':   { power: 'd', reqAura: 2, limitAura: 6, type: 'WC' },
  'バラウ':   { power: 'e', reqAura: 2, limitAura: 6, type: 'WC' },
  'ズロン':   { power: 'd', reqAura: 3, limitAura: 6, type: 'WC' },
  'グラバイ': { power: 'b', reqAura: 3, limitAura: 8, type: 'WC' },
  'ドロ':     { power: 'f', reqAura: 2, limitAura: 5, type: 'OB' },
  'グナン':   { power: 'e', reqAura: 2, limitAura: 5, type: 'OB' },
  'タンギー': { power: 'e', reqAura: 2, limitAura: 5, type: 'OB' },
};

/** 武装一覧表の火焔砲に加え、ドラムロはオーラソード（剣）を保持する。 */
const CHART_WEAPONS_DRUMLO = ['オーラソード', '火焔砲'];

// ===== 武器命中率表 =====
// 射程1〜8+（配列index 0=射程1, 7=射程8+）、'-'は射程外
const WEAPON_HIT = {
  'ソード':                 [3, null, null, null, null, null, null, null],
  'ミサイルランチャー':     [3, 4, 5, 6, 6, 5, 5, 4],
  '火焔砲':                 [4, 5, 6, 6, 5, 5, 4, 3],
  '鉤爪':                   [5, 6, 5, 4, 3, null, null, null],
  'ガッシュ':               [4, 5, 6, 6, 5, 4, 4, 3],
  'ボゾン砲':               [3, 4, 5, 5, 4, 3, null, null],
  'オーラバルカン':         [5, 6, 7, 6, 5, 3, null, null],
  'オーラショット':         [3, 5, 6, 6, 5, 5, 4, 3],
  'オーラキャノン':         [3, 4, 5, 6, 6, 5, 5, 4],
  '手榴弾':                 [6, 5, 4, null, null, null, null, null],
  'オーラキャノン(ビルバイン)': [3, 3, 4, 4, 5, 5, 5, 4],
  'オーラライフル':         [4, 5, 6, 7, 7, 6, 5, 4],
  '機関砲':                 [4, 5, 6, 7, 6, 5, 4, 3],
};

// ===== 射撃威力表 =====
const WEAPON_POWER = {
  'ソード':                 [null, null, null, null, null, null, null, null],
  'ミサイルランチャー':     [6, 6, 6, 6, 6, 6, 6, 6],
  '火焔砲':                 [6, 6, 6, 5, 5, 4, 4, 3],
  '鉤爪':                   [4, 4, 3, 3, 2, null, null, null],
  'ガッシュ':               [4, 4, 4, 3, 3, 3, 2, 2],
  'ボゾン砲':               [5, 5, 4, 4, 4, 3, null, null],
  'オーラバルカン':         [3, 3, 3, 2, 2, 2, null, null],
  'オーラショット':         [6, 6, 6, 6, 5, 5, 5, 4],
  'オーラキャノン':         [6, 6, 6, 6, 6, 5, 5, 5],
  '手榴弾':                 [8, 8, 8, null, null, null, null, null],
  'オーラキャノン(ビルバイン)': [10, 10, 10, 10, 10, 9, 9, 8],
  'オーラライフル':         [6, 6, 6, 6, 6, 5, 5, 5],
  '機関砲':                 [4, 4, 4, 4, 3, 3, 3, 2],
};

// ===== 射手パワーによる修正値表 =====
const SHOOTER_POWER_MOD = { a: 2, b: 1, c: 1, d: 0, e: 0, f: -1, g: -1 };

// ===== 目標回避値表 =====
const TARGET_EVADE_MOD = { a: -3, b: -2, c: -1, d: 0, e: 0, f: 1, g: 1 };

// ===== 目標の行動による修正値表 =====
const TARGET_ACTION_MOD = {
  '剣': 0,
  '射撃': 1,
  '回避': -3,
  '格闘': 0,
  '通常移動': 0,
  '高速移動': -1,
  '突撃': 0,
  '行動不能': 2,
  '変形': 2,
  '合体': 2,
  '積載': 2,
};

// ===== 格闘命中率表 =====
const MELEE_HIT = {
  '突く': { a: 10, b: 9, c: 9, d: 8, e: 8, f: 7, g: 6 },
  '斬る': { a: 10, b: 9, c: 8, d: 7, e: 6, f: 5, g: 4 },
  '殴る': { a: 7, b: 6, c: 5, d: 5, e: 4, f: 4, g: 3 },
  '武器で殴る': { a: 8, b: 7, c: 6, d: 6, e: 5, f: 5, g: 4 },
  '蹴る': { a: 6, b: 5, c: 4, d: 4, e: 3, f: 3, g: 3 },
};

// ===== 格闘威力表 =====
const MELEE_POWER = {
  '突く': { a: 9, b: 8, c: 7, d: 6, e: 5, f: 4, g: 3 },
  '斬る': { a: 10, b: 9, c: 8, d: 7, e: 6, f: 5, g: 4 },
  '殴る': { a: 7, b: 6, c: 5, d: 5, e: 4, f: 3, g: 2 },
  '武器で殴る': { a: 5, b: 4, c: 3, d: 3, e: 3, f: 2, g: 2 },
  '蹴る': { a: 8, b: 7, c: 6, d: 6, e: 5, f: 4, g: 3 },
};

// ===== パワーによる威力の修正値 =====
const POWER_DAMAGE_MOD = { a: 3, b: 2, c: 1, d: 0, e: -1, f: -1, g: -2 };

// ===== 格闘命中箇所補正（Sheet9.csv と同期）=====
// 斬る: 頭・手・足系の命中箇所なら威力+1 / 突く: 胴・コクピットなら威力+1
const MELEE_LOCATION_MOD = {
  '斬る': { '頭手足': 1, '胴コクピット': 0 },
  '突く': { '頭手足': 0, '胴コクピット': 1 },
};

/** Sheet9 用：命中箇所 → 列キー（翼・オーラC等は補正対象外で 0） */
function meleeHitPartSheet9Category(part) {
  if (part === '頭' || part === '右手' || part === '左手' || part === '右足' || part === '左足') return '頭手足';
  if (part === '胴' || part === 'コクピット') return '胴コクピット';
  return null;
}

function getMeleeLocationPowerMod(method, part) {
  const row = MELEE_LOCATION_MOD[method];
  if (!row) return 0;
  const cat = meleeHitPartSheet9Category(part);
  if (!cat) return 0;
  return row[cat] || 0;
}

// ===== 受け率表 =====
const DEFENSE_TABLE = {
  '同位置同箇所': { a: 11, b: 10, c: 9, d: 8, e: 8, f: 7, g: 6 },
  '同位置異箇所': { a: 8, b: 7, c: 6, d: 6, e: 5, f: 4, g: 3 },
  '異位置同箇所': { a: 10, b: 9, c: 8, d: 7, e: 7, f: 6, g: 5 },
  '異位置異箇所': { a: 6, b: 5, c: 4, d: 4, e: 4, f: 3, g: 2 },
  '武器・盾':     { a: 9, b: 8, c: 7, d: 7, e: 6, f: 6, g: 5 },
  '手':           { a: 8, b: 7, c: 6, d: 6, e: 5, f: 5, g: 4 },
  '足':           { a: 7, b: 6, c: 5, d: 4, e: 4, f: 3, g: 2 },
};

// ===== 命中箇所判定表 AB =====
// 攻撃方向 x サイコロ(2d6: 2〜12) → 部位名
const HIT_LOCATION_AB = {
  '正面':   ['頭','右足','コクピット','右足','右手','胴','左手','左足','胴','左足','頭'],
  '右側面': ['頭','左手','翼','右手','胴','右足','左足','オーラコンバーター','右足','胴','頭'],
  '左側面': ['頭','右手','翼','左手','胴','左足','右足','オーラコンバーター','左足','胴','頭'],
  '後面':   ['頭','左足','オーラコンバーター','左足','左手','胴','右手','右足','翼','右足','頭'],
};
// index 0 = サイコロ2, index 10 = サイコロ12

// ===== 命中箇所判定表 AB2（側面/後面追加判定） =====
// 1d6: 1〜6
const HIT_LOCATION_AB2 = {
  '側面': ['翼','オーラコンバーター','胴','胴','胴','胴'],
  '後面': ['翼','オーラコンバーター','オーラコンバーター','胴','胴','胴'],
};

// ===== WC/OB 命中箇所判定表 =====
const HIT_LOCATION_WC = {
  'ウイングキャリバー': ['ウイング','胴','コクピット','オーラコンバーター','胴','ウイング','胴','武器','胴','ウイング','頭'],
  'オーラボム':         ['オーラコンバーター','胴','胴','コクピット','胴','オーラコンバーター','武器','胴','胴','オーラコンバーター','頭'],
};

// ===== 被害判定表 =====
// 威力(行) x ダイス1d6(列: index 0=ダイス1, 5=ダイス6) → 結果
// n=なし, 数字=ダメージ, e=壊滅, W=特殊(武器破壊等)
const DAMAGE_TABLE = {
  '7+':    ['1','2','3','e','e','e'],
  '4-6':   ['1','1','1','2','3','e'],
  '3':     ['n','1','1','2','2','3'],
  '2':     ['n','n','1','1','2','2'],
  '1':     ['n','n','1','1','1','2'],
  '0':     ['n','n','n','1','1','1'],
  '-1':    ['n','n','n','n','1','1'],
  '-2-':   ['n','n','n','n','n','n'],
};
// ダイス列: index0=1, index1=2, index2=3, index3=4, index4=5, index5=6

// 被害判定表のキー取得ヘルパー
function getDamageKey(diff) {
  if (diff >= 7) return '7+';
  if (diff >= 4) return '4-6';
  if (diff === 3) return '3';
  if (diff === 2) return '2';
  if (diff === 1) return '1';
  if (diff === 0) return '0';
  if (diff === -1) return '-1';
  return '-2-';
}

// ===== 耐久力表 =====
// 命中箇所表（右手・左足・翼・オーラコンバーター等）とキーを一致させる。旧「手」「足」は左右に分割。
const DURABILITY = {
  'AB': {
    '頭': 2, '胴': 4, 'コクピット': 4,
    '右手': 3, '左手': 3, '右足': 3, '左足': 3,
    '翼': 2, 'オーラコンバーター': 2,
    '剣': 5, '盾': 5, '武器': 1,
  },
  'WC': {
    '頭': 2, '胴': 3, 'コクピット': 3, '翼': 2, 'ウイング': 4,
    'オーラコンバーター': 2, '武器': 3,
  },
  'OB': {
    '頭': 2, '胴': 3, 'コクピット': 3, '翼': 2,
    'オーラコンバーター': 2, '武器': 3,
  },
};

/** UI 表示順（部位名は命中・装甲表と同一） */
const DURABILITY_DISPLAY_ORDER = {
  AB: ['頭', '胴', 'コクピット', 'オーラコンバーター', '翼', '右手', '左手', '右足', '左足', '剣', '盾', '武器'],
  WC: ['頭', '胴', 'コクピット', 'オーラコンバーター', '翼', 'ウイング', '武器'],
  OB: ['頭', '胴', 'コクピット', 'オーラコンバーター', '翼', '武器'],
};

/**
 * 盾（耐久・格闘「武器・盾」受け）を持つのはズワース系とレプラカーンのみ。
 * 表記ゆれで「ズワウス」も許容（機体表は ARMOR_AB キーに合わせてズワース）。
 */
function machineBaseHasShield(baseName) {
  if (!baseName) return false;
  const n = String(baseName);
  return n === 'レプラカーン' || n === 'ズワース' || n === 'ズワウス';
}

// ===== 共通装甲厚 =====
const COMMON_ARMOR = { '剣': 7, '盾': 7, '武器': 2 };

// ===== 装甲等級表 AB（名称未設定フォルダ 2/1dunbine_data_csv/オーラバトラー装甲厚.csv と同期。HTML は CSV を直接読まない）=====
const ARMOR_AB = {
  'ダンバイン':   { '頭': 3, '胴': 4, 'コクピット': 4, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 3 },
  'ビルバイン':   { '頭': 4, '胴': 5, 'コクピット': 5, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 4 },
  'ダーナオシー': { '頭': 2, '胴': 3, 'コクピット': 3, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 2 },
  'ボチューン':   { '頭': 3, '胴': 4, 'コクピット': 4, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 3 },
  'ボゾン':       { '頭': 3, '胴': 4, 'コクピット': 4, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 3 },
  'ドラムロ':     { '頭': 4, '胴': 5, 'コクピット': 5, 'オーラコンバーター': 2, '翼': 1, '手': 3, '足': 3 },
  'ビランビー':   { '頭': 4, '胴': 5, 'コクピット': 5, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 4 },
  'バストール':   { '頭': 3, '胴': 4, 'コクピット': 4, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 3 },
  'ゲド':         { '頭': 3, '胴': 4, 'コクピット': 4, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 3 },
  'レプラカーン': { '頭': 3, '胴': 4, 'コクピット': 4, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 3 },
  'ビアレス':     { '頭': 4, '胴': 5, 'コクピット': 5, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 4 },
  'ライネック':   { '頭': 3, '胴': 4, 'コクピット': 4, 'オーラコンバーター': 2, '翼': 1, '手': 3, '足': 3 },
  'ズワース':     { '頭': 4, '胴': 5, 'コクピット': 5, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 4 },
  'ガラバ':       { '頭': null, '胴': 3, 'コクピット': 3, 'オーラコンバーター': 2, '翼': 1, '手': 2, '足': 2 },
};

// ===== 装甲等級表 WC =====
const ARMOR_WC = {
  'フォウ':   { '前面': 1, '側面': 1, '上面': 1, '下面': 1, '武器': 1, 'ウイング': 1 },
  'バラウ':   { '前面': 1, '側面': 1, '上面': 1, '下面': 1, '武器': 1, 'ウイング': 1 },
  'ズロン':   { '前面': 1, '側面': 1, '上面': 1, '下面': 1, '武器': 1, 'ウイング': 1 },
  'グラバイ': { '前面': 2, '側面': 1, '上面': 1, '下面': 1, '武器': 1, 'ウイング': 1 },
  'ドロ':     { '前面': 1, '側面': 1, '上面': 1, '下面': 1, '武器': 1, 'ウイング': 1 },
  'グナン':   { '前面': 1, '側面': 1, '上面': 1, '下面': 1, '武器': 1, 'ウイング': 1 },
  'タンギー': { '前面': 1, '側面': 1, '上面': 1, '下面': 1, '武器': 1, 'ウイング': 1 },
};

// ===== 移動力表 AB =====
const MOVEMENT_AB = {
  '剣':       { a: 3, b: 2, c: 1, d: 1, e: 0, f: 0, g: 0 },
  '射撃':     { a: 3, b: 2, c: 1, d: 1, e: 1, f: 0, g: 0 },
  '回避':     { a: 4, b: 3, c: 3, d: 2, e: 1, f: 1, g: 1 },
  '格闘':     { a: 3, b: 2, c: 1, d: 1, e: 1, f: 1, g: 0 },
  '通常移動': { a: 4, b: 3, c: 2, d: 2, e: 2, f: 1, g: 1 },
  '高速移動': { a: 5, b: 4, c: 3, d: 3, e: 2, f: 2, g: 2 },
  '突撃':     { a: 6, b: 5, c: 4, d: 4, e: 3, f: 3, g: 3 },
  '変形・合体': { a: 4, b: 3, c: 2, d: 1, e: 1, f: 1, g: 0 },
};

/** パワーランクを数値化（衝突の「差」用）a=7 … g=1 */
const POWER_RANK_TO_NUM = { a: 7, b: 6, c: 5, d: 4, e: 3, f: 2, g: 1 };

/**
 * 衝突判定表（ルールブック・チャート）
 * 行=1d6(1〜6)、列=パワー差(突入側−受け側) … 3 / 2〜1 / 0〜-1 / -2以下
 */
const COLLISION_TABLE = [
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, 'w'],
  [null, null, 'w', 'w'],
  ['w', 'w', 'd', 'd'],
  ['d', 'd', 'd', 'd'],
];

function powerRankToCollisionNum(rank) {
  const k = String(rank || 'g').toLowerCase();
  return POWER_RANK_TO_NUM[k] != null ? POWER_RANK_TO_NUM[k] : 1;
}

function collisionTableColumnIndex(diff) {
  if (diff >= 3) return 0;
  if (diff >= 1) return 1;
  if (diff >= -1) return 2;
  return 3;
}

// ===== 積載・合体・変形データ（仮実装、処理は後） =====
const TRANSFORM_DATA = {
  'ビルバイン': { canTransform: true, forms: ['AB', 'WC'] },
};
const COMBINE_DATA = {
  // WCとABの合体: { wc: 'フォウ', ab: 'ダンバイン A' } → 合体ユニット
  // 処理は後で実装
};
const LOAD_DATA = {
  // 積載: WCがABを運搬
  // 処理は後で実装
};

// ===== 武器の装備腕（武装一覧表 CSV「左手外」「両手内」等と整合。シナリオで weaponHands で上書き可）=====
const WEAPON_HAND = {
  'オーラソード': '右',
  'オーラショット': '左',
  'ガッシュ': '左',
  'ボゾン砲': '両',
  'オーラバルカン': '両',
  'ミサイルランチャー': '左',
  '火焔砲': '両',
  '鉤爪': '両',
  '機関砲': '両',
  'オーラキャノン': '両',
  'オーラライフル': '右',
  'オーラキャノン(ビルバイン)': '両',
  'ミサイル': '両',
};

function getWeaponHand(weaponName, unitWeaponHands) {
  if (unitWeaponHands && Object.prototype.hasOwnProperty.call(unitWeaponHands, weaponName)) {
    return unitWeaponHands[weaponName];
  }
  return WEAPON_HAND[weaponName] || '両';
}

/** 右手／左手破壊時、その手の武器が使えないか */
function canOperateWeaponWithHands(destroyed, weaponName, unitWeaponHands) {
  const h = getWeaponHand(weaponName, unitWeaponHands);
  const d = destroyed || {};
  if (h === '右') return !d['右手'];
  if (h === '左') return !d['左手'];
  if (h === '両') return !d['右手'] && !d['左手'];
  return true;
}

// ===== ユーティリティ =====
// 2d6を振る
function roll2d6() {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}
// 1d6を振る
function roll1d6() {
  return Math.floor(Math.random() * 6) + 1;
}

// 機体名からベース名を取得（装甲等級表用・表キーとシナリオ名の接尾辞を接続）
function getBaseMachineName(name) {
  if (!name) return name;
  const tryMatch = keys => {
    const sorted = [...keys].sort((a, b) => b.length - a.length);
    for (const k of sorted) {
      if (name === k) return k;
      if (name.startsWith(k + ' ') || name.startsWith(k + '(') || name.startsWith(k + '（')) return k;
    }
    return null;
  };
  return tryMatch(Object.keys(ARMOR_AB)) || tryMatch(Object.keys(ARMOR_WC)) || name;
}

// 命中箇所表（右手・左足…）→ 装甲厚表・CSV（手・足）
function normalizeArmorLookupPart(part) {
  if (!part) return part;
  if (part === '右手' || part === '左手') return '手';
  if (part === '右足' || part === '左足') return '足';
  return part;
}

// 装甲値取得
function getArmor(machineName, part) {
  const base = getBaseMachineName(machineName);
  const p = normalizeArmorLookupPart(part);
  if (Object.prototype.hasOwnProperty.call(COMMON_ARMOR, p)) return COMMON_ARMOR[p];
  if (ARMOR_AB[base]) {
    const v = ARMOR_AB[base][p];
    return v != null ? v : 0;
  }
  if (ARMOR_WC[base]) {
    const v = ARMOR_WC[base][p];
    return v != null ? v : 0;
  }
  return 0;
}

// 実効パワーランク取得
function getEffectivePower(machineName, currentAura) {
  const machine = AURA_BATTLERS[machineName] || WING_CALIBERS[machineName];
  if (!machine) return 'g';
  const basePower = machine.power;
  const clampedAura = Math.min(currentAura, machine.limitAura === Infinity ? 99 : machine.limitAura);
  if (clampedAura < 2) return 'g';
  const col = Math.min(clampedAura, 10) - 2; // 列index: オーラ力2=0, 10=8
  const row = POWER_TABLE[basePower];
  if (!row) return basePower;
  return row[col] || 'g';
}

// 移動力取得
function getMovement(action, powerRank) {
  const row = MOVEMENT_AB[action];
  if (!row) return 0;
  return row[powerRank] || 0;
}

// 被害判定
function resolveDamage(weaponPower, armor) {
  const diff = weaponPower - armor;
  const key = getDamageKey(diff);
  const row = DAMAGE_TABLE[key];
  if (!row) return 'n';
  const die = roll1d6();
  return row[die - 1];
}
