// ============================================================
//  Battle of the Bulge - ユニットデータ & CRT
//  Excelデータから生成
// ============================================================

// 機械化師団: 同一hexにKGまたはCC 2ユニットでスタック可能
// mechPair: ペアのユニットID（同hexに配置される相方）

const INITIAL_SETUP = {
  german: [
    // === 戦車(KG) 初期配置 ===
    { id:'de_pz_01', name:'装甲KG-1', side:'german', nation:'de', type:'panzer', atk:4, def:4, hexId:'2010', mechPair:'de_pz_02', flipped:false },
    { id:'de_pz_02', name:'装甲KG-2', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2107', mechPair:'de_pz_01', flipped:false },
    { id:'de_pz_03', name:'装甲KG-3', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2006', mechPair:'de_pz_04', flipped:false },
    { id:'de_pz_04', name:'装甲KG-4', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2006', mechPair:'de_pz_03', flipped:false },
    { id:'de_pz_05', name:'装甲KG-5', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2011', mechPair:'de_pz_06', flipped:false },
    { id:'de_pz_06', name:'装甲KG-6', side:'german', nation:'de', type:'panzer', atk:2, def:1, hexId:'2011', mechPair:'de_pz_05', flipped:false },
    { id:'de_pz_07', name:'装甲KG-7', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'1713', mechPair:'de_pz_08', flipped:false },
    { id:'de_pz_08', name:'装甲KG-8', side:'german', nation:'de', type:'panzer', atk:2, def:1, hexId:'1713', mechPair:'de_pz_07', flipped:false },
    { id:'de_pz_09', name:'装甲KG-9', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'1712', mechPair:'de_pz_10', flipped:false },
    { id:'de_pz_10', name:'装甲KG-10', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'1712', mechPair:'de_pz_09', flipped:false },
    // === 歩兵 初期配置 ===
    { id:'de_inf_01', name:'歩兵-1', side:'german', nation:'de', type:'infantry', atk:2, def:1, hexId:'1801', mechPair:null, flipped:false },
    { id:'de_inf_02', name:'歩兵-2', side:'german', nation:'de', type:'infantry', atk:2, def:1, hexId:'1802', mechPair:null, flipped:false },
    { id:'de_inf_03', name:'歩兵-3', side:'german', nation:'de', type:'infantry', atk:2, def:1, hexId:'2003', mechPair:null, flipped:false },
    { id:'de_inf_04', name:'歩兵-4', side:'german', nation:'de', type:'infantry', atk:3, def:3, hexId:'2005', mechPair:null, flipped:false },
    { id:'de_inf_05', name:'歩兵-5', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'2008', mechPair:null, flipped:false },
    { id:'de_inf_06', name:'歩兵-6', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'2109', mechPair:null, flipped:false },
    { id:'de_inf_07', name:'歩兵-7', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1911', mechPair:null, flipped:false },
    { id:'de_inf_08', name:'歩兵-8', side:'german', nation:'de', type:'infantry', atk:3, def:3, hexId:'1612', mechPair:null, flipped:false },
    { id:'de_inf_09', name:'歩兵-9', side:'german', nation:'de', type:'infantry', atk:3, def:3, hexId:'1714', mechPair:null, flipped:false },
    { id:'de_inf_10', name:'歩兵-10', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1815', mechPair:null, flipped:false },
    { id:'de_inf_11', name:'歩兵-11', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1716', mechPair:null, flipped:false },
    { id:'de_inf_12', name:'歩兵-12', side:'german', nation:'de', type:'infantry', atk:3, def:3, hexId:'1817', mechPair:null, flipped:false },
  ],

  allied: [
    // === アメリカ軍 初期配置 ===
    { id:'us_pz_01', name:'戦車CC-1', side:'allied', nation:'us', type:'panzer', atk:3, def:2, hexId:'1508', mechPair:'us_pz_02', flipped:false },
    { id:'us_pz_02', name:'戦車CC-2', side:'allied', nation:'us', type:'panzer', atk:2, def:1, hexId:'1508', mechPair:'us_pz_01', flipped:false },
    { id:'us_pz_03', name:'戦車-3',   side:'allied', nation:'us', type:'panzer', atk:1, def:0, hexId:'1907', mechPair:null, flipped:false },
    { id:'us_inf_01', name:'歩兵-1',  side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1804', mechPair:null, flipped:false },
    { id:'us_inf_02', name:'歩兵-2',  side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1806', mechPair:null, flipped:false },
    { id:'us_inf_03', name:'歩兵-3',  side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1602', mechPair:null, flipped:false },
    { id:'us_inf_04', name:'歩兵-4',  side:'allied', nation:'us', type:'infantry', atk:2, def:2, hexId:'1710', mechPair:null, flipped:false },
    { id:'us_inf_05', name:'歩兵-5',  side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1513', mechPair:null, flipped:false },
    { id:'us_inf_06', name:'歩兵-6',  side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1615', mechPair:null, flipped:false },
  ],
};

// ============================================================
//  増援 (ターン番号 → ユニット配列)
//  entryTag: reinforce_e, reinforce_n, reinforce_s, reinforce_nw, reinforce_sw
// ============================================================
const REINFORCEMENTS = {
  2: [
    // ドイツ軍 Turn 2 東から
    { id:'de_r2_pz_01', name:'増援KG-1', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:'de_r2_pz_02', flipped:false },
    { id:'de_r2_pz_02', name:'増援KG-2', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:'de_r2_pz_01', flipped:false },
    { id:'de_r2_pz_03', name:'増援KG-3', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:'de_r2_pz_04', flipped:false },
    { id:'de_r2_pz_04', name:'増援KG-4', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:'de_r2_pz_03', flipped:false },
    { id:'de_r2_pz_05', name:'増援戦車-1', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:null, flipped:false },
    { id:'de_r2_pz_06', name:'増援戦車-2', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:null, flipped:false },
    { id:'de_r2_pz_07', name:'増援戦車-3', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:null, flipped:false },
    { id:'de_r2_pz_08', name:'増援KG-5', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:'de_r2_pz_09', flipped:false },
    { id:'de_r2_pz_09', name:'増援KG-6', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:'de_r2_pz_08', flipped:false },
    { id:'de_r2_inf_01', name:'増援歩兵-1', side:'german', nation:'de', type:'infantry', atk:2, def:1, entryTag:'reinforce_e', mechPair:null, flipped:false },
    // アメリカ軍 Turn 2
    { id:'us_r2_pz_01', name:'増援CC-1', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_n', mechPair:'us_r2_pz_02', flipped:false },
    { id:'us_r2_pz_02', name:'増援CC-2', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_n', mechPair:'us_r2_pz_01', flipped:false },
    { id:'us_r2_pz_03', name:'増援CC-3', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_s', mechPair:'us_r2_pz_04', flipped:false },
    { id:'us_r2_pz_04', name:'増援CC-4', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_s', mechPair:'us_r2_pz_03', flipped:false },
    { id:'us_r2_inf_01', name:'増援歩兵-1', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_n', mechPair:null, flipped:false },
    { id:'us_r2_inf_02', name:'増援歩兵-2', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_n', mechPair:null, flipped:false },
    { id:'us_r2_inf_03', name:'増援歩兵-3', side:'allied', nation:'us', type:'infantry', atk:4, def:4, entryTag:'reinforce_sw', mechPair:null, flipped:false },
    { id:'us_r2_inf_04', name:'増援歩兵-4', side:'allied', nation:'us', type:'infantry', atk:4, def:4, entryTag:'reinforce_sw', mechPair:null, flipped:false },
  ],
  3: [
    // イギリス軍 Turn 3 北西から
    { id:'uk_r3_pz_01', name:'英戦車CC-1', side:'allied', nation:'uk', type:'panzer', atk:3, def:2, entryTag:'reinforce_nw', mechPair:'uk_r3_pz_02', flipped:false },
    { id:'uk_r3_pz_02', name:'英戦車CC-2', side:'allied', nation:'uk', type:'panzer', atk:2, def:1, entryTag:'reinforce_nw', mechPair:'uk_r3_pz_01', flipped:false },
    { id:'uk_r3_pz_03', name:'英戦車-3',   side:'allied', nation:'uk', type:'panzer', atk:2, def:1, entryTag:'reinforce_nw', mechPair:null, flipped:false },
    { id:'uk_r3_inf_01', name:'英歩兵-1',  side:'allied', nation:'uk', type:'infantry', atk:3, def:3, entryTag:'reinforce_nw', mechPair:null, flipped:false },
    { id:'uk_r3_inf_02', name:'英歩兵-2',  side:'allied', nation:'uk', type:'infantry', atk:3, def:3, entryTag:'reinforce_nw', mechPair:null, flipped:false },
  ],
  4: [
    // ドイツ軍 Turn 4 東から
    { id:'de_r4_pz_01', name:'増援KG-7', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:'de_r4_pz_02', flipped:false },
    { id:'de_r4_pz_02', name:'増援KG-8', side:'german', nation:'de', type:'panzer', atk:2, def:1, entryTag:'reinforce_e', mechPair:'de_r4_pz_01', flipped:false },
    { id:'de_r4_pz_03', name:'増援KG-9', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:'de_r4_pz_04', flipped:false },
    { id:'de_r4_pz_04', name:'増援KG-10', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:'de_r4_pz_03', flipped:false },
    // アメリカ軍 Turn 4
    { id:'us_r4_pz_01', name:'増援CC-5', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_n', mechPair:'us_r4_pz_02', flipped:false },
    { id:'us_r4_pz_02', name:'増援CC-6', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_n', mechPair:'us_r4_pz_01', flipped:false },
    { id:'us_r4_pz_03', name:'増援CC-7', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_n', mechPair:'us_r4_pz_04', flipped:false },
    { id:'us_r4_pz_04', name:'増援CC-8', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_n', mechPair:'us_r4_pz_03', flipped:false },
    { id:'us_r4_pz_05', name:'増援CC-9', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_s', mechPair:'us_r4_pz_06', flipped:false },
    { id:'us_r4_pz_06', name:'増援CC-10', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_s', mechPair:'us_r4_pz_05', flipped:false },
    { id:'us_r4_inf_01', name:'増援歩兵-5', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_n', mechPair:null, flipped:false },
    { id:'us_r4_inf_02', name:'増援歩兵-6', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_s', mechPair:null, flipped:false },
    { id:'us_r4_inf_03', name:'増援歩兵-7', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_s', mechPair:null, flipped:false },
    { id:'us_r4_inf_04', name:'増援歩兵-8', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_s', mechPair:null, flipped:false },
  ],
  5: [
    // ドイツ軍 Turn 5 東から
    { id:'de_r5_inf_01', name:'増援歩兵-2', side:'german', nation:'de', type:'infantry', atk:2, def:1, entryTag:'reinforce_e', mechPair:null, flipped:false },
    { id:'de_r5_inf_02', name:'増援歩兵-3', side:'german', nation:'de', type:'infantry', atk:2, def:1, entryTag:'reinforce_e', mechPair:null, flipped:false },
    // アメリカ軍 Turn 5
    { id:'us_r5_inf_01', name:'増援歩兵-9', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_n', mechPair:null, flipped:false },
  ],
  6: [
    // アメリカ軍 Turn 6
    { id:'us_r6_pz_01', name:'増援CC-11', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_s', mechPair:'us_r6_pz_02', flipped:false },
    { id:'us_r6_pz_02', name:'増援CC-12', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_s', mechPair:'us_r6_pz_01', flipped:false },
  ],
};

// ============================================================
//  戦闘結果表 (CRT)
//  列: 戦闘差分  -2以下, -1, 0, +1, +2, +3, +4, +5, +6以上
//  行: ダイス結果 1〜9
//  結果: AR=攻撃側後退, NE=効果なし, DR=防御側後退,
//        DD=防御側壊乱後退, EX=相互損害, DE=防御側壊滅
// ============================================================
const CRT_COLUMNS = ['-2以下', '-1', '0', '+1', '+2', '+3', '+4', '+5', '+6以上'];

const CRT = [
  // dice 1
  ['AR', 'AR', 'AR', 'AR', 'NE', 'NE', 'DR', 'DR', 'DR'],
  // dice 2
  ['AR', 'AR', 'AR', 'NE', 'NE', 'DR', 'DR', 'DR', 'DD'],
  // dice 3
  ['AR', 'AR', 'NE', 'NE', 'DR', 'DR', 'DR', 'DD', 'DD'],
  // dice 4
  ['AR', 'NE', 'NE', 'DR', 'DR', 'DR', 'DD', 'DD', 'DE'],
  // dice 5
  ['NE', 'NE', 'DR', 'DR', 'DR', 'DD', 'DD', 'DE', 'DE'],
  // dice 6
  ['NE', 'NE', 'DR', 'DR', 'DD', 'DD', 'EX', 'DE', 'DE'],
  // dice 7
  ['NE', 'DR', 'DR', 'DD', 'DD', 'EX', 'DE', 'DE', 'DE'],
  // dice 8
  ['DR', 'DR', 'DD', 'DD', 'EX', 'DE', 'DE', 'DE', 'DE'],
  // dice 9
  ['DR', 'DD', 'DD', 'EX', 'DE', 'DE', 'DE', 'DE', 'DE'],
];

/**
 * CRT検索
 * @param {number} differential  戦闘差分 (攻撃力 - 防御力)
 * @param {number} dieRoll       ダイス結果 (1-9)
 * @returns {string} 戦闘結果コード
 */
function lookupCRT(differential, dieRoll) {
  let col;
  if (differential <= -2) col = 0;
  else if (differential >= 6) col = 8;
  else col = differential + 2;
  const row = Math.max(0, Math.min(8, dieRoll - 1));
  return CRT[row][col];
}
