// ===== TANKS+ データファイル =====

// --- 距離レンジのキー ---
const DIST_RANGES = [1, 2, 4, 6, 9, 12, 16, 20, 25, 30];
function distKey(d) {
  for (let i = 0; i < DIST_RANGES.length; i++) {
    if (d <= DIST_RANGES[i]) return i;
  }
  return -1; // 射程外
}

// --- ユニットDB ---
// type: 'tank'|'infantry'|'atgun'|'apc'
// turret: 'rotating'|'fixed'|null
// small: 小型目標
const UNIT_DB = {
  // ドイツ軍
  'Pz III/J':       { type:'tank', nation:'ge', armor:4, move:3, antiInf:6, turret:'rotating', small:false, score:6 },
  'Pz III/J late':  { type:'tank', nation:'ge', armor:4, move:3, antiInf:6, turret:'rotating', small:false, score:6 },
  'Pz IV/H':        { type:'tank', nation:'ge', armor:4, move:4, antiInf:6, turret:'rotating', small:false, score:8 },
  'Pz V/G':         { type:'tank', nation:'ge', armor:6, move:9, antiInf:3, turret:'rotating', small:false, score:20 },
  'Tiger I':         { type:'tank', nation:'ge', armor:6, move:9, antiInf:3, turret:'rotating', small:false, score:15 },
  'Tiger II':        { type:'tank', nation:'ge', armor:6, move:9, antiInf:3, turret:'rotating', small:false, score:30 },
  'StuG III':        { type:'tank', nation:'ge', armor:4, move:4, antiInf:8, turret:'fixed', small:true, score:8 },
  'JP IV':           { type:'tank', nation:'ge', armor:5, move:4, antiInf:8, turret:'fixed', small:true, score:18 },
  'Hetzer':          { type:'tank', nation:'ge', armor:4, move:3, antiInf:8, turret:'fixed', small:true, score:9 },
  'Ferdinand':       { type:'tank', nation:'ge', armor:8, move:2, antiInf:9, turret:'fixed', small:false, score:20, noMG:true },
  'J.Tiger':         { type:'tank', nation:'ge', armor:10, move:9, antiInf:6, turret:'fixed', small:false, score:40 },
  'J.Panther':       { type:'tank', nation:'ge', armor:6, move:5, antiInf:9, turret:'fixed', small:false, score:25 },
  'Marder III':      { type:'tank', nation:'ge', armor:4, move:2, antiInf:8, turret:'fixed', small:false, score:5 },
  'PAK38':           { type:'atgun', nation:'ge', armor:0, move:0, antiInf:7, turret:null, small:true, score:3 },
  'PAK40':           { type:'atgun', nation:'ge', armor:0, move:0, antiInf:8, turret:null, small:true, score:5 },
  'PAK43':           { type:'atgun', nation:'ge', armor:0, move:0, antiInf:9, turret:null, small:true, score:10 },
  'FLAK37':          { type:'atgun', nation:'ge', armor:0, move:0, antiInf:9, turret:null, small:true, score:7 },
  'GE Infantry':     { type:'infantry', nation:'ge', armor:0, move:2, antiInf:0, turret:null, small:false, score:1 },
  'APC':             { type:'apc', nation:'ge', armor:1, move:5, antiInf:0, turret:null, small:false, score:2 },

  // ソ連軍
  'T34/76':          { type:'tank', nation:'su', armor:5, move:4, antiInf:8, turret:'rotating', small:false, score:3 },
  'T34/85':          { type:'tank', nation:'su', armor:5, move:5, antiInf:6, turret:'rotating', small:false, score:5 },
  'IS-II':           { type:'tank', nation:'su', armor:8, move:3, antiInf:11, turret:'rotating', small:false, score:15 },
  'KV-1C':           { type:'tank', nation:'su', armor:5, move:3, antiInf:8, turret:'rotating', small:false, score:3 },
  'SU-76':           { type:'tank', nation:'su', armor:2, move:5, antiInf:8, turret:'fixed', small:true, score:2 },
  'SU-85':           { type:'tank', nation:'su', armor:5, move:2, antiInf:9, turret:'fixed', small:false, score:5 },
  'SU-100':          { type:'tank', nation:'su', armor:5, move:10, antiInf:5, turret:'fixed', small:true, score:10 },
  '76.2mm':          { type:'atgun', nation:'su', armor:0, move:0, antiInf:8, turret:null, small:true, score:1 },
  'SU Infantry':     { type:'infantry', nation:'su', armor:0, move:2, antiInf:0, turret:null, small:false, score:1 },

  // アメリカ軍
  'M4A1':            { type:'tank', nation:'us', armor:4, move:4, antiInf:8, turret:'rotating', small:false, score:7 },
  'M4A3':            { type:'tank', nation:'us', armor:5, move:4, antiInf:8, turret:'rotating', small:false, score:8 },
  'M26':             { type:'tank', nation:'us', armor:6, move:5, antiInf:9, turret:'rotating', small:false, score:14 },
  'M24':             { type:'tank', nation:'us', armor:6, move:7, antiInf:5, turret:'rotating', small:false, score:6 },
  'M10':             { type:'tank', nation:'us', armor:3, move:4, antiInf:7, turret:'rotating', small:false, score:6 },
  'M36':             { type:'tank', nation:'us', armor:5, move:7, antiInf:5, turret:'rotating', small:false, score:7 },
  'M5 76.2mm':       { type:'atgun', nation:'us', armor:0, move:0, antiInf:8, turret:null, small:true, score:2 },
  'US Infantry':     { type:'infantry', nation:'us', armor:0, move:2, antiInf:0, turret:null, small:false, score:1 },

  // イギリス軍
  'Cromwell':        { type:'tank', nation:'uk', armor:4, move:5, antiInf:7, turret:'rotating', small:false, score:7 },
  'Firefly':         { type:'tank', nation:'uk', armor:5, move:4, antiInf:8, turret:'rotating', small:false, score:9 },
  'Churchill':       { type:'tank', nation:'uk', armor:6, move:9, antiInf:2, turret:'rotating', small:false, score:7 },
  'A34':             { type:'tank', nation:'uk', armor:6, move:8, antiInf:4, turret:'rotating', small:false, score:9 },
  'Centurion':       { type:'tank', nation:'uk', armor:6, move:9, antiInf:3, turret:'rotating', small:false, score:12 },
  'Achilles':        { type:'tank', nation:'uk', armor:3, move:4, antiInf:7, turret:'rotating', small:false, score:8 },
  'Archer':          { type:'tank', nation:'uk', armor:3, move:7, antiInf:4, turret:'fixed', small:true, score:7 },
  'UK Infantry':     { type:'infantry', nation:'uk', armor:0, move:2, antiInf:0, turret:null, small:true, score:1 },
};

// --- ユニット射撃表 ---
// FIRE_TABLE[name] = [[pen,hit], [pen,hit], ...] (10 distance ranges)
// 距離レンジ: 1, 2, 3-4, 5-6, 7-9, 10-12, 13-16, 17-20, 21-25, 26-30
const FIRE_TABLE = {
  // ドイツ軍
  'Pz III/J':    [[7,11],[5,11],[4,10],[4,9],[4,8],[3,7],[3,6],[3,5],[2,4],[2,2]],
  'Pz III/J late':[[7,11],[5,11],[4,10],[4,9],[4,8],[3,7],[3,6],[3,5],[2,4],[2,2]],
  'Pz IV/H':     [[10,11],[7,11],[6,10],[6,9],[5,8],[5,7],[4,5],[4,4],[3,3],[3,2]],
  'Pz V/G':      [[13,11],[9,11],[8,10],[7,10],[7,9],[6,8],[5,7],[5,6],[4,5],[4,4]],
  'Tiger I':      [[15,11],[11,11],[10,10],[8,9],[8,8],[7,7],[6,6],[5,5],[5,4],[5,2]],
  'Tiger II':     [[20,11],[14,11],[12,10],[11,10],[10,9],[9,8],[8,7],[7,5],[6,4],[6,4]],
  'StuG III':     [[10,11],[7,11],[6,10],[6,9],[5,8],[5,7],[4,5],[4,4],[3,3],[3,2]],
  'JP IV':        [[13,11],[9,11],[8,10],[7,10],[7,9],[6,8],[5,7],[5,6],[4,5],[4,4]],
  'J.Panther':    [[20,11],[14,11],[12,10],[11,10],[10,9],[9,8],[8,7],[7,6],[7,5],[6,4]],
  'J.Tiger':      [[30,11],[21,11],[18,10],[17,9],[15,8],[14,7],[12,6],[11,5],[10,4],[9,2]],
  'Ferdinand':    [[20,11],[14,11],[12,10],[11,10],[10,9],[9,8],[8,7],[7,6],[7,5],[6,4]],
  'Hetzer':       [[10,11],[7,11],[6,10],[6,9],[5,8],[5,7],[4,5],[4,4],[3,3],[3,2]],
  'Marder III':   [[10,11],[7,11],[6,10],[6,9],[5,8],[5,7],[4,5],[4,4],[3,3],[3,2]],
  'PAK38':        [[7,12],[5,11],[4,10],[4,10],[4,9],[3,9],[3,8],[3,7],[2,6],[2,5]],
  'PAK40':        [[10,12],[7,11],[6,10],[6,10],[5,9],[5,8],[4,7],[4,6],[3,5],[3,4]],
  'FLAK37':       [[15,12],[11,11],[10,10],[8,10],[8,9],[7,9],[6,8],[5,7],[5,6],[5,5]],
  'PAK43':        [[20,12],[14,11],[12,10],[11,10],[10,9],[9,9],[8,9],[7,8],[7,7],[6,6]],
  // ソ連軍
  'T34/76':       [[9,10],[6,9],[5,7],[5,6],[5,4],[4,3],[4,2],[3,2],[3,2],[3,2]],
  'T34/85':       [[12,11],[8,10],[7,8],[7,7],[6,6],[5,5],[5,4],[4,2],[4,2],[4,2]],
  'KV-1C':        [[9,10],[6,9],[5,7],[5,6],[5,4],[4,3],[4,2],[3,2],[3,2],[3,2]],
  'IS-II':        [[22,11],[15,10],[13,8],[12,7],[11,6],[10,4],[9,2],[8,2],[7,2],[7,2]],
  'SU-76':        [[9,10],[6,9],[5,7],[5,6],[5,4],[4,3],[4,2],[3,2],[3,2],[3,2]],
  'SU-85':        [[12,11],[8,10],[7,8],[7,7],[6,6],[5,5],[5,4],[4,2],[4,2],[4,2]],
  'SU-100':       [[16,11],[11,10],[10,9],[9,8],[8,7],[7,6],[6,5],[6,3],[5,2],[5,2]],
  '76.2mm':       [[9,11],[6,10],[5,8],[5,7],[5,6],[4,5],[4,4],[3,3],[3,2],[3,2]],
  // アメリカ軍
  'M4A1':         [[7,10],[6,9],[5,9],[5,8],[4,8],[4,7],[4,5],[3,4],[3,3],[3,2]],
  'M4A3':         [[9,10],[7,10],[6,9],[6,9],[5,8],[5,7],[4,6],[4,5],[4,4],[3,3]],
  'M26':          [[10,11],[9,10],[8,10],[8,9],[7,9],[7,8],[6,7],[6,7],[5,6],[5,5]],
  'M24':          [[7,10],[6,9],[5,9],[5,8],[4,8],[4,7],[4,5],[3,4],[3,3],[3,2]],
  'M10':          [[7,10],[7,10],[6,9],[6,9],[5,8],[5,7],[4,6],[4,5],[4,4],[3,3]],
  'M36':          [[10,11],[9,10],[8,10],[8,9],[7,9],[7,8],[6,7],[6,7],[5,6],[5,5]],
  'M5 76.2mm':    [[9,10],[7,10],[6,9],[6,9],[5,8],[5,7],[4,6],[4,5],[4,4],[3,3]],
  // イギリス軍
  'Cromwell':     [[7,10],[6,9],[5,9],[5,8],[4,8],[4,7],[4,5],[3,4],[3,3],[3,2]],
  'Firefly':      [[11,10],[10,10],[9,9],[8,8],[7,8],[6,7],[6,6],[5,6],[4,5],[3,4]],
  'Churchill':    [[7,10],[6,9],[5,9],[5,8],[4,8],[4,7],[4,5],[3,4],[3,3],[3,2]],
  'A34':          [[10,11],[9,11],[8,9],[8,8],[7,8],[7,7],[6,6],[5,5],[5,4],[4,4]],
  'Centurion':    [[11,10],[10,10],[9,9],[8,8],[7,8],[6,7],[6,6],[5,6],[4,5],[3,4]],
  'Achilles':     [[11,10],[10,10],[9,9],[8,8],[7,8],[6,7],[6,6],[5,6],[4,5],[3,4]],
  'Archer':       [[11,10],[10,10],[9,9],[8,8],[7,8],[6,7],[6,6],[5,6],[4,5],[3,4]],
};

// --- 戦車撃破表 ---
// DESTRUCTION_TABLE[modifier] = { destroyed:[min,max], noEffect:[min,max], immobilized:[min,max] }
// modifier: -3以下～+2以上 (clamped)
const DESTRUCTION_TABLE = {
  '-3': { destroyed:[2,3],  noEffect:[4,10],  immobilized:[11,12] },
  '-2': { destroyed:[2,4],  noEffect:[5,10],  immobilized:[11,12] },
  '-1': { destroyed:[2,5],  noEffect:[6,10],  immobilized:[11,12] },
   '0': { destroyed:[2,6],  noEffect:[7,10],  immobilized:[11,12] },
   '1': { destroyed:[2,7],  noEffect:[8,10],  immobilized:[11,12] },
   '2': { destroyed:[2,9],  noEffect:[10,10], immobilized:[11,12] },
};

function getDestructionResult(modifier, diceTotal) {
  const key = String(Math.max(-3, Math.min(2, modifier)));
  const t = DESTRUCTION_TABLE[key];
  if (diceTotal >= t.destroyed[0] && diceTotal <= t.destroyed[1]) return 'destroyed';
  if (diceTotal >= t.immobilized[0] && diceTotal <= t.immobilized[1]) return 'immobilized';
  return 'noEffect';
}

// --- 歩兵対戦車攻撃表 ---
// INF_VS_TANK[nation][range] = hitNumber (2d6以下で撃破)
const INF_VS_TANK = {
  ge: { 0:8, 1:7, 2:5, 3:2 },
  su: { 0:7 },
  us: { 0:7, 1:6, 2:5, 3:3 },
  uk: { 0:7, 1:6, 2:4, 3:2 },
};

// --- 対歩兵攻撃表 ---
// ANTI_INF_TABLE[attackerType][range] = hitNumber
const ANTI_INF_TABLE = {
  tankMG:   { 0:6, 1:4, 2:2 },
  ge_inf:   { 0:7, 1:6, 2:5, 3:4, 4:2 },
  su_inf:   { 0:8, 1:5, 2:3, 3:2 },
  us_inf:   { 0:7, 1:6, 2:6, 3:5, 4:4 },
  uk_inf:   { 0:7, 1:6, 2:5, 3:4, 4:3 },
};

// --- 偵察表 ---
// DISCOVERY_TABLE[unitType][terrain] = discovery range (hex)
const DISCOVERY_TABLE = {
  tank:  { forest:5,  other:10 },
  other: { forest:10, other:20 },
};

// --- 命中修正表 ---
const HIT_MODIFIERS = {
  forest: 2,        // 目標が森にいる
  building: 2,      // 目標が建物にいる
  bocage: 1,        // ボカージュ1本につき
  smallTarget: 1,   // 小型目標
  immobilized: -1,  // 目標が移動不能
  defensiveFire: 1, // 防御射撃
  advanceFire: { ge:2, us:2, uk:2, su:3 }, // 前進射撃（国別）
  infForest: 1,     // 対歩兵: 森/建物の目標
  infDefAdv: 1,     // 対歩兵: 防御/前進射撃
};

// --- 地形コスト ---
const TERRAIN_COST = {
  plain: 1,
  forest: 2,
  slope: 2,
  building: 2,
  bocage: 1,  // ボカージュは移動に影響なし
};

// --- 国別色 ---
const NATION_COLORS = {
  ge: { fill:'#6B7B8D', stroke:'#3a4a5a', label:'ドイツ' },
  su: { fill:'#8B4513', stroke:'#5a2a0a', label:'ソ連' },
  us: { fill:'#4A7A4A', stroke:'#2a5a2a', label:'アメリカ' },
  uk: { fill:'#B8860B', stroke:'#8a6a0a', label:'イギリス' },
};

// --- テストシナリオ ---
const SCENARIOS = [
  {
    id: 'test1',
    name: 'テストシナリオ（東部戦線）',
    front: 'east',
    map1: 'A', map1orient: 'Vertical',
    map2: 'B', map2orient: 'Vertical',
    maxTurns: 10,
    firstPlayer: 'ge',
    sides: {
      ge: {
        setup: 'deploy', // 'deploy'=盤上配置, 'enter'=盤外進入
        enterEdge: null,
        units: [
          { name:'Pz IV/H', col:5, row:10, dir:1 },
          { name:'Pz IV/H', col:5, row:12, dir:1 },
          { name:'StuG III', col:4, row:11, dir:1 },
          { name:'GE Infantry', col:6, row:10 },
          { name:'GE Infantry', col:6, row:12 },
          { name:'PAK40', col:3, row:8, dir:1 },
        ]
      },
      su: {
        setup: 'enter',
        enterEdge: 'east',
        units: [
          { name:'T34/85', col:20, row:8, dir:4 },
          { name:'T34/85', col:20, row:10, dir:4 },
          { name:'T34/85', col:20, row:12, dir:4 },
          { name:'T34/76', col:21, row:9, dir:4 },
          { name:'T34/76', col:21, row:11, dir:4 },
          { name:'SU Infantry', col:22, row:10 },
        ]
      }
    }
  }
];
