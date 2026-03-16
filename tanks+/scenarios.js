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
  'Pz III/J':       { type:'tank', nation:'ge', armor:3, move:4, antiInf:7, turret:'rotating', small:false, score:6, img:'DE_Pz III-J.png' },
  'Pz III/J late':  { type:'tank', nation:'ge', armor:3, move:4, antiInf:7, turret:'rotating', small:false, score:6, img:'DE_Pz III-J.png' },
  'Pz IV/H':        { type:'tank', nation:'ge', armor:4, move:4, antiInf:8, turret:'rotating', small:false, score:8, img:'DE_Pz IV-H.png' },
  'Pz V/G':         { type:'tank', nation:'ge', armor:6, move:5, antiInf:8, turret:'rotating', small:false, score:20, img:'DE_Pz V-G.png' },
  'Tiger I':         { type:'tank', nation:'ge', armor:6, move:3, antiInf:9, turret:'rotating', small:false, score:15, img:'DE_Tiger I.png' },
  'Tiger II':        { type:'tank', nation:'ge', armor:8, move:3, antiInf:9, turret:'rotating', small:false, score:30, img:'DE_Tiger II.png' },
  'StuG III':        { type:'tank', nation:'ge', armor:4, move:4, antiInf:8, turret:'fixed', small:true, score:8, img:'DE_StuG III.png' },
  'JP IV':           { type:'tank', nation:'ge', armor:5, move:4, antiInf:8, turret:'fixed', small:true, score:18, img:'DE_JP IV.png' },
  'Hetzer':          { type:'tank', nation:'ge', armor:4, move:3, antiInf:8, turret:'fixed', small:true, score:9, img:'DE_Hetzer.png' },
  'Ferdinand':       { type:'tank', nation:'ge', armor:8, move:2, antiInf:9, turret:'fixed', small:false, score:20, noMG:true, img:'DE_Ferdinand.png' },
  'J.Tiger':         { type:'tank', nation:'ge', armor:10, move:2, antiInf:11, turret:'fixed', small:false, score:40, img:'DE_JTiger.png' },
  'J.Panther':       { type:'tank', nation:'ge', armor:6, move:5, antiInf:9, turret:'fixed', small:false, score:25, img:'DE_Jpanther.png' },
  'Marder III':      { type:'tank', nation:'ge', armor:2, move:4, antiInf:8, turret:'fixed', small:false, score:5, img:'DE_Marder III.png' },
  'PAK38':           { type:'atgun', nation:'ge', armor:0, move:0, antiInf:7, turret:null, small:true, score:3, img:'DE_PAK38.png' },
  'PAK40':           { type:'atgun', nation:'ge', armor:0, move:0, antiInf:8, turret:null, small:true, score:5, img:'DE_PAK40.png' },
  'PAK43':           { type:'atgun', nation:'ge', armor:0, move:0, antiInf:9, turret:null, small:true, score:10, img:'DE_PAK43.png' },
  'FLAK37':          { type:'atgun', nation:'ge', armor:0, move:0, antiInf:9, turret:null, small:true, score:7, img:'DE_FLAK37.png' },
  'GE Infantry':     { type:'infantry', nation:'ge', armor:0, move:2, antiInf:0, turret:'rotating', small:false, score:1, img:'DE_Infantry.png' },
  'APC':             { type:'apc', nation:'ge', armor:1, move:5, antiInf:0, turret:'rotating', small:false, score:2, img:'DE_APC.png' },

  // ソ連軍
  'T34/76':          { type:'tank', nation:'su', armor:4, move:5, antiInf:8, turret:'rotating', small:false, score:3, img:'SU_T-34-76.png' },
  'T34/85':          { type:'tank', nation:'su', armor:5, move:5, antiInf:9, turret:'rotating', small:false, score:5, img:'SU_T-34-85.png' },
  'IS-II':           { type:'tank', nation:'su', armor:8, move:3, antiInf:11, turret:'rotating', small:false, score:15, img:'SU_JS-II.png' },
  'KV-1C':           { type:'tank', nation:'su', armor:5, move:3, antiInf:8, turret:'rotating', small:false, score:3, img:'SU_KV-1C.png' },
  'SU-76':           { type:'tank', nation:'su', armor:2, move:5, antiInf:8, turret:'fixed', small:true, score:2, img:'SU_Su-76.png' },
  'SU-85':           { type:'tank', nation:'su', armor:5, move:2, antiInf:9, turret:'fixed', small:false, score:5, img:'SU_Su-76.png' },
  'SU-100':          { type:'tank', nation:'su', armor:5, move:5, antiInf:10, turret:'fixed', small:true, score:10, img:'SU_Su-100.png' },
  '76.2mm':          { type:'atgun', nation:'su', armor:0, move:0, antiInf:8, turret:null, small:true, score:1, img:'SU_762mmGun.png' },
  'SU Infantry':     { type:'infantry', nation:'su', armor:0, move:2, antiInf:0, turret:'rotating', small:false, score:1, img:'SU_Infantry.png' },

  // アメリカ軍
  'M4A1':            { type:'tank', nation:'us', armor:4, move:4, antiInf:8, turret:'rotating', small:false, score:7, img:'US_M4A1.png' },
  'M4A3':            { type:'tank', nation:'us', armor:5, move:4, antiInf:8, turret:'rotating', small:false, score:8, img:'US_M4A3.png' },
  'M26':             { type:'tank', nation:'us', armor:6, move:5, antiInf:9, turret:'rotating', small:false, score:14, img:'US_M26.png' },
  'M24':             { type:'tank', nation:'us', armor:3, move:5, antiInf:7, turret:'rotating', small:false, score:6, img:'US_M24.png' },
  'M10':             { type:'tank', nation:'us', armor:3, move:4, antiInf:7, turret:'rotating', small:false, score:6, img:'US_M10.png' },
  'M36':             { type:'tank', nation:'us', armor:3, move:4, antiInf:7, turret:'rotating', small:false, score:7, img:'US_M36.png' },
  'M5 76.2mm':       { type:'atgun', nation:'us', armor:0, move:0, antiInf:8, turret:null, small:true, score:2, img:'US_762mmAT.png' },
  'US Infantry':     { type:'infantry', nation:'us', armor:0, move:2, antiInf:0, turret:'rotating', small:false, score:1, img:'US_Infantry.png' },

  // イギリス軍
  'Cromwell':        { type:'tank', nation:'uk', armor:4, move:5, antiInf:7, turret:'rotating', small:false, score:7, img:'UK_Cromwell.png' },
  'Firefly':         { type:'tank', nation:'uk', armor:5, move:4, antiInf:8, turret:'rotating', small:false, score:9, img:'UK_FireFly.png' },
  'Churchill':       { type:'tank', nation:'uk', armor:6, move:2, antiInf:9, turret:'rotating', small:false, score:7, img:'UK_Churchill.png' },
  'A34':             { type:'tank', nation:'uk', armor:6, move:4, antiInf:8, turret:'rotating', small:false, score:9, img:'UK_A34.png' },
  'Centurion':       { type:'tank', nation:'uk', armor:6, move:3, antiInf:9, turret:'rotating', small:false, score:12, img:'UK_Centurion.png' },
  'Achilles':        { type:'tank', nation:'uk', armor:3, move:4, antiInf:7, turret:'rotating', small:false, score:8, img:'UK_Achilles.png' },
  'Archer':          { type:'tank', nation:'uk', armor:2, move:3, antiInf:7, turret:'fixed', small:true, score:7, img:'UK_Archer.png' },
  'UK Infantry':     { type:'infantry', nation:'uk', armor:0, move:2, antiInf:0, turret:'rotating', small:true, score:1, img:'UK_Infantry.png' },
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
// modifier: -3以下～+3以上 (clamped)
const DESTRUCTION_TABLE = {
  '-3': { destroyed:[2,2],   noEffect:[3,10],  immobilized:[11,12] },  // -3以下
  '-2': { destroyed:[2,3],   noEffect:[4,10],  immobilized:[11,12] },
  '-1': { destroyed:[2,4],   noEffect:[5,10],  immobilized:[11,12] },
   '0': { destroyed:[2,5],   noEffect:[6,10],  immobilized:[11,12] },
   '1': { destroyed:[2,6],   noEffect:[7,10],  immobilized:[11,12] },
   '2': { destroyed:[2,7],   noEffect:[8,10],  immobilized:[11,12] },
   '3': { destroyed:[2,9],   noEffect:[10,10], immobilized:[11,12] },  // 3以上
};

function getDestructionResult(modifier, diceTotal) {
  const key = String(Math.max(-3, Math.min(3, modifier)));
  const t = DESTRUCTION_TABLE[key];
  if (diceTotal >= t.destroyed[0] && diceTotal <= t.destroyed[1]) return 'destroyed';
  if (diceTotal >= t.immobilized[0] && diceTotal <= t.immobilized[1]) return 'immobilized';
  return 'noEffect';
}

// --- AI用: 撃破率計算 ---
const DICE_2D6_CUM = [0,0, 1/36, 3/36, 6/36, 10/36, 15/36, 21/36, 26/36, 30/36, 33/36, 35/36, 1];

function calcKillChance(shooterName, targetName, dist, frontHit) {
  const di = distKey(dist);
  if (di < 0) return { kill: 0, immob: 0, hit: 0 };
  const ft = FIRE_TABLE[shooterName];
  if (!ft || !ft[di]) return { kill: 0, immob: 0, hit: 0 };
  const tDb = UNIT_DB[targetName];
  if (!tDb) return { kill: 0, immob: 0, hit: 0 };
  const pen = ft[di][0], hitNum = ft[di][1];
  const hitProb = hitNum >= 12 ? 1 : hitNum <= 1 ? 0 : (DICE_2D6_CUM[hitNum] || 0);
  if (hitProb <= 0) return { kill: 0, immob: 0, hit: 0 };

  if (tDb.type === 'infantry' || tDb.type === 'atgun') {
    const sDb = UNIT_DB[shooterName];
    if (!sDb) return { kill: 0, immob: 0, hit: hitProb };
    const kp = sDb.antiInf >= 12 ? 1 : sDb.antiInf <= 1 ? 0 : (DICE_2D6_CUM[sDb.antiInf] || 0);
    return { kill: hitProb * kp, immob: 0, hit: hitProb };
  }
  const armor = tDb.armor - (frontHit !== false ? 0 : 2);
  const penDiff = pen - Math.max(0, armor);
  const key = String(Math.max(-3, Math.min(3, penDiff)));
  const dt = DESTRUCTION_TABLE[key];
  return {
    kill: hitProb * ((dt.destroyed[1] - dt.destroyed[0] + 1) / 11),
    immob: hitProb * ((dt.immobilized[1] - dt.immobilized[0] + 1) / 11),
    hit: hitProb
  };
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
  advanceFire: { ge:2, su:3, us:2, uk:2, infantry:1 }, // 前進射撃（国別、歩兵は+1）
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

// --- マップ地形 ---
const MAP_TERRAIN = {
  A: {
    '4,8':'forest', '4,9':'forest', '5,9':'forest', '5,10':'forest',
    '5,11':'forest', '5,12':'forest', '6,9':'forest', '6,10':'forest',
    '6,11':'forest', '6,12':'forest',
    '9,2':'slope', '9,3':'slope', '10,2':'slope', '10,3':'slope',
    '17,3':'forest', '17,4':'forest', '18,2':'forest', '18,3':'forest',
    '19,3':'forest', '19,4':'forest', '19,5':'forest',
    '20,3':'forest', '20,4':'forest', '20,5':'forest',
    '21,4':'forest', '21,5':'forest',
    '22,13':'forest', '22,14':'forest', '23,14':'forest',
    '23,15':'forest', '24,14':'forest',
  },
  C: {
    '6,4':'forest', '7,5':'forest', '7,6':'forest', '8,5':'forest',
    '11,13':'forest', '13,11':'building', '20,14':'forest',
    '21,15':'forest', '22,5':'forest', '22,6':'forest', '23,7':'forest'
  },
  B: {
    '3,9':'forest', '3,10':'forest', '4,8':'forest', '4,9':'forest',
    '4,10':'forest', '5,9':'forest', '5,10':'forest', '5,11':'forest',
    '6,10':'forest', '6,11':'forest', '6,12':'forest',
    '7,11':'forest', '7,12':'forest',
    '19,3':'slope', '19,4':'slope', '19,5':'slope', '19,6':'slope',
    '20,2':'slope', '20,3':'slope', '20,4':'slope', '20,5':'slope', '20,6':'slope',
    '21,3':'slope', '21,4':'slope', '21,5':'building', '21,6':'slope', '21,7':'slope',
    '22,3':'slope', '22,4':'building', '22,5':'slope', '22,6':'slope',
    '23,3':'slope', '23,4':'slope', '23,5':'slope', '23,6':'slope',
    '24,5':'slope',
  },
};

const MAP_HEXSIDE_TERRAIN = {
  B: {
    '6,4-6,5':'bocage', '6,5-7,5':'bocage', '7,5-7,6':'bocage',
    '7,5-8,5':'bocage', '8,4-8,5':'bocage', '8,5-9,5':'bocage',
    '9,5-9,6':'bocage',
  },
  C: {
    '1,11-1,12':'bocage', '1,12-2,11':'bocage', '1,8-1,9':'bocage', '1,8-2,8':'bocage',
    '10,11-9,11':'bocage', '10,11-9,12':'bocage', '10,12-9,12':'bocage',
    '11,10-12,10':'slope', '11,14-12,14':'bocage', '11,15-12,14':'bocage',
    '11,15-12,15':'bocage', '11,16-12,15':'bocage', '11,4-12,4':'bocage',
    '11,5-12,4':'bocage', '11,5-12,5':'bocage', '11,6-12,5':'bocage',
    '12,10-12,9':'slope', '12,3-12,4':'bocage', '12,4-13,4':'bocage',
    '12,9-13,10':'slope', '13,10-13,9':'slope', '13,10-14,9':'slope',
    '14,10-14,9':'slope', '14,10-15,10':'slope', '14,10-15,11':'slope',
    '14,11-15,11':'slope', '2,11-2,12':'bocage', '2,11-3,12':'bocage',
    '2,4-2,5':'bocage', '2,4-3,5':'bocage', '2,5-2,6':'bocage',
    '2,6-3,6':'bocage', '2,7-2,8':'bocage', '2,8-3,8':'bocage',
    '3,11-3,12':'bocage', '3,12-4,11':'bocage', '3,13-4,13':'bocage',
    '3,14-4,13':'bocage', '3,14-4,14':'bocage', '3,15-4,14':'bocage',
    '3,15-4,15':'bocage', '3,2-4,2':'bocage', '3,3-4,2':'bocage',
    '3,4-3,5':'bocage', '3,5-4,4':'bocage', '3,5-4,5':'bocage',
    '3,6-3,7':'bocage', '3,6-4,5':'bocage', '3,6-4,6':'bocage',
    '3,8-3,9':'bocage', '3,8-4,8':'bocage', '4,1-4,2':'bocage',
    '4,1-5,2':'bocage', '4,10-5,10':'bocage', '4,10-5,11':'bocage',
    '4,11-4,12':'bocage', '4,11-5,11':'bocage', '4,11-5,12':'bocage',
    '4,12-4,13':'bocage', '4,13-5,13':'bocage', '4,2-4,3':'bocage',
    '4,2-5,3':'bocage', '4,7-4,8':'bocage', '4,8-5,8':'bocage',
    '4,8-5,9':'bocage', '4,9-5,10':'bocage', '4,9-5,9':'bocage',
    '5,1-5,2':'bocage', '5,13-5,14':'bocage', '5,13-6,13':'bocage',
    '5,2-5,3':'bocage', '5,2-6,1':'bocage', '5,2-6,2':'bocage',
    '6,12-6,13':'bocage', '6,13-7,13':'bocage', '6,13-7,14':'bocage',
    '6,14-7,14':'bocage', '6,14-7,15':'bocage', '6,15-7,15':'bocage',
    '7,10-8,9':'bocage', '7,8-8,8':'bocage', '7,9-8,8':'bocage',
    '7,9-8,9':'bocage', '8,1-9,1':'bocage', '8,1-9,2':'bocage',
    '8,10-8,9':'bocage', '8,2-9,2':'bocage', '8,2-9,3':'bocage',
    '8,7-8,8':'bocage',
  },
};

// --- シナリオ ---
const SCENARIOS = [
  // シナリオ1: 赤軍の反抗（通常表示）
  {
    id: 'sc1',
    name: '赤軍の反抗',
    front: 'east',
    map1: 'A', map1orient: 'Vertical',
    map2: null, map2orient: null,
    maxTurns: 99,
    firstPlayer: 'ge',
    victory: '先に半数以上破壊した側の勝利',
    sides: {
      ge: {
        setup: 'enterRight',
        enterEdge: 'right',
        units: [
          { name:'Pz III/J', col:0, row:0, dir:2 },
          { name:'Pz III/J', col:0, row:0, dir:2 },
          { name:'Pz IV/H', col:0, row:0, dir:2 },
          { name:'Pz IV/H', col:0, row:0, dir:2 },
        ]
      },
      su: {
        setup: 'enterLeft',
        enterEdge: 'left',
        units: [
          { name:'KV-1C', col:0, row:0, dir:0 },
          { name:'KV-1C', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
        ]
      }
    },
    terrain: MAP_TERRAIN.A
  },
  // シナリオ2: エレファント（隠し）
  {
    id: 'sc2',
    name: 'エレファント',
    hidden: true,
    front: 'east',
    map1: 'A', map1orient: 'Vertical',
    map2: null, map2orient: null,
    maxTurns: 99,
    firstPlayer: 'ge',
    victory: 'ドイツ: 1ユニット以上をマップから脱出 / ソ連: 阻止（射撃不能は破壊扱い）',
    sides: {
      ge: {
        setup: 'enterBottom',
        enterEdge: 'bottom',
        units: [
          { name:'Ferdinand', col:0, row:0, dir:1 },
          { name:'Ferdinand', col:0, row:0, dir:1 },
          { name:'Ferdinand', col:0, row:0, dir:1 },
        ]
      },
      su: {
        setup: 'free',
        enterEdge: null,
        units: [
          { name:'KV-1C', col:0, row:0, dir:0 },
          { name:'KV-1C', col:0, row:0, dir:0 },
          { name:'KV-1C', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'T34/76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
          { name:'SU-76', col:0, row:0, dir:0 },
        ]
      }
    },
    terrain: MAP_TERRAIN.A
  },
  // シナリオ3: ドニエプル（隠し）
  {
    id: 'sc3',
    name: 'ドニエプル',
    hidden: true,
    front: 'east',
    map1: 'B', map1orient: 'Vertical',
    map2: null, map2orient: null,
    maxTurns: 99,
    firstPlayer: 'ge',
    victory: 'ドイツ: 2ユニット以上をマップ下から脱出 / ソ連: 阻止（射撃不能は破壊扱い）',
    sides: {
      ge: {
        setup: 'enterTop',
        enterEdge: 'top',
        units: [
          { name:'Pz V/G', col:0, row:0, dir:4 },
          { name:'Pz V/G', col:0, row:0, dir:4 },
          { name:'Pz V/G', col:0, row:0, dir:4 },
          { name:'Pz IV/H', col:0, row:0, dir:4 },
          { name:'Pz IV/H', col:0, row:0, dir:4 },
          { name:'StuG III', col:0, row:0, dir:4 },
          { name:'StuG III', col:0, row:0, dir:4 },
          { name:'StuG III', col:0, row:0, dir:4 },
        ]
      },
      su: {
        setup: 'free',
        enterEdge: null,
        units: [
          { name:'SU-100', col:0, row:0, dir:0 },
          { name:'SU-100', col:0, row:0, dir:0 },
          { name:'SU-100', col:0, row:0, dir:0 },
          { name:'SU-100', col:0, row:0, dir:0 },
          { name:'SU-100', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
          { name:'T34/85', col:0, row:0, dir:0 },
        ]
      }
    },
    terrain: MAP_TERRAIN.B,
    hexsideTerrain: MAP_HEXSIDE_TERRAIN.B
  },
  // シナリオ4: フューリー（隠し）
  {
    id: 'sc4',
    name: 'フューリー',
    hidden: true,
    front: 'west',
    map1: 'A', map1orient: 'Vertical',
    map2: null, map2orient: null,
    maxTurns: 99,
    firstPlayer: 'ge',
    victory: 'ドイツ: M4を全て破壊 / アメリカ: ドイツ破壊またはM4が下側から突破',
    specialRules: { noAmmoOut: true },
    sides: {
      ge: {
        setup: 'enterBottom',
        enterEdge: 'bottom',
        units: [
          { name:'Tiger I', col:0, row:0, dir:1 },
        ]
      },
      us: {
        setup: 'enterTop',
        enterEdge: 'top',
        units: [
          { name:'M4A3', col:0, row:0, dir:4 },
          { name:'M4A3', col:0, row:0, dir:4 },
          { name:'M4A3', col:0, row:0, dir:4 },
          { name:'M4A3', col:0, row:0, dir:4 },
        ]
      }
    },
    terrain: MAP_TERRAIN.A
  },
  // シナリオ5: カーン近郊
  {
    id: 'sc5',
    name: 'カーン近郊',
    front: 'west',
    map1: 'C', map1orient: 'Vertical',
    map2: null, map2orient: null,
    maxTurns: 10,
    firstPlayer: 'uk',
    victory: '建物を支配している側の勝利',
    sides: {
      ge: {
        setup: 'enterRight',
        enterEdge: 'right',
        units: [
          { name:'Infantry', col:0, row:0, dir:2 },
          { name:'Infantry', col:0, row:0, dir:2 },
          { name:'Tiger I', col:0, row:0, dir:2 },
          { name:'Pz IV/H', col:0, row:0, dir:2 },
          { name:'Pz IV/H', col:0, row:0, dir:2 },
        ]
      },
      uk: {
        setup: 'enterLeft',
        enterEdge: 'left',
        units: [
          { name:'Cromwell', col:0, row:0, dir:0 },
          { name:'Cromwell', col:0, row:0, dir:0 },
          { name:'Cromwell', col:0, row:0, dir:0 },
          { name:'Cromwell', col:0, row:0, dir:0 },
          { name:'Cromwell', col:0, row:0, dir:0 },
          { name:'Cromwell', col:0, row:0, dir:0 },
          { name:'Firefly', col:0, row:0, dir:0 },
          { name:'Firefly', col:0, row:0, dir:0 },
        ]
      }
    },
    reinforcement: {
      turn: 5,
      side: 'ge',
      enterEdge: 'topRight',
      diceTable: {
        1: { name:'Jagdpanzer V', col:0, row:0, dir:2 },
        2: { name:'Pz IV/H', col:0, row:0, dir:2 },
        3: { name:'Marder III', col:0, row:0, dir:2 },
        4: { name:'StuG III', col:0, row:0, dir:2 },
        5: { name:'StuG III', col:0, row:0, dir:2 },
        6: null
      }
    },
    terrain: MAP_TERRAIN.C,
    hexsideTerrain: MAP_HEXSIDE_TERRAIN.C
  },
];

// --- 視認距離 ---
// 戦車: 森5ヘクス, 他10ヘクス
// その他: 森10ヘクス, 他20ヘクス
function getSpottingRange(observerType, targetTerrain) {
  if (observerType === 'tank') {
    return targetTerrain === 'forest' ? 5 : 10;
  }
  return targetTerrain === 'forest' ? 10 : 20;
}

function canSpot(observer, target, terrain) {
  const obsDb = UNIT_DB[observer.name];
  if (!obsDb) return false;  // UNIT_DB未登録なら視認不可
  // hexDist inline
  function toAxial(col, row) {
    const q = col - 1;
    const r = row - 1 - Math.floor((col - 1) / 2);
    return { q, r };
  }
  const a = toAxial(observer.col, observer.row);
  const b = toAxial(target.col, target.row);
  const dist = Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q + a.r) - (b.q + b.r)));
  const tTerrain = terrain[`${target.col},${target.row}`] || 'plain';
  const range = getSpottingRange(obsDb.type, tTerrain);
  return dist <= range;
}
