// ============================================================
//  Battle of the Bulge - ユニットデータ & CRT
//  unit_diff.xlsx 確認済みデータ
// ============================================================

const IMG_BASE = 'cmj46_ssbulge_v1/images/';
const IMG_BACK = 'cmj46_ssbulge_v1/images/123/';

const INITIAL_SETUP = {
  german: [
    // === 戦車KG 初期配置（機械化師団ペア）===
    { id:'de_1ss_1', name:'1SS(1)', side:'german', nation:'de', type:'panzer', atk:4, def:3, hexId:'2107', mechPair:'de_1ss_2', img:'fg_1ss_1.jpg', imgBack:'bg_1ss_1.jpg', flipped:false },
    { id:'de_1ss_2', name:'1SS(2)', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2107', mechPair:'de_1ss_1', img:'fg_1ss_2.jpg', imgBack:'bg_1ss_2.jpg', flipped:false },
    { id:'de_12ss_1', name:'12SS(1)', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2006', mechPair:'de_12ss_2', img:'fg_12ss_1.jpg', imgBack:'bg_12ss_1.jpg', flipped:false },
    { id:'de_12ss_2', name:'12SS(2)', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2006', mechPair:'de_12ss_1', img:'fg_12ss_2.jpg', imgBack:'bg_12ss_2.jpg', flipped:false },
    { id:'de_lehr_1', name:'Lehr(1)', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2011', mechPair:'de_lehr_2', img:'fg_Lehr_1.jpg', imgBack:'bg_Lehr_1.jpg', flipped:false },
    { id:'de_lehr_2', name:'Lehr(2)', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'2011', mechPair:'de_lehr_1', img:'fg_Lehr_2.jpg', imgBack:'bg_Lehr_2.jpg', flipped:false },
    { id:'de_2pz_1', name:'2Pz(1)', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'1713', mechPair:'de_2pz_2', img:'fg_2_1.jpg', imgBack:'bg_2_1.jpg', flipped:false },
    { id:'de_2pz_2', name:'2Pz(2)', side:'german', nation:'de', type:'panzer', atk:2, def:1, hexId:'1713', mechPair:'de_2pz_1', img:'fg_2_2.jpg', imgBack:'bg_2_2.jpg', flipped:false },
    { id:'de_116_1', name:'116Pz(1)', side:'german', nation:'de', type:'panzer', atk:3, def:2, hexId:'1712', mechPair:'de_116_2', img:'fg_116_1.jpg', imgBack:'bg_116_1.jpg', flipped:false },
    { id:'de_116_2', name:'116Pz(2)', side:'german', nation:'de', type:'panzer', atk:2, def:1, hexId:'1712', mechPair:'de_116_1', img:'fg_116_2.jpg', imgBack:'bg_116_2.jpg', flipped:false },
    // === 歩兵師団 初期配置 ===
    { id:'de_326', name:'326', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1801', mechPair:null, img:'fg_326.jpg', imgBack:'bg_326.jpg', flipped:false },
    { id:'de_277', name:'277', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1802', mechPair:null, img:'fg_277.jpg', imgBack:'bg_277.jpg', flipped:false },
    { id:'de_12inf', name:'12', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'2003', mechPair:null, img:'fg_12.jpg', imgBack:'bg_12.jpg', flipped:false },
    { id:'de_3inf', name:'3', side:'german', nation:'de', type:'infantry', atk:3, def:3, hexId:'2005', mechPair:null, img:'fg_3.jpg', imgBack:'bg_3.jpg', flipped:false },
    { id:'de_5', name:'5', side:'german', nation:'de', type:'infantry', atk:3, def:3, hexId:'2008', mechPair:null, img:'fg_5.jpg', imgBack:'bg_5.jpg', flipped:false },
    { id:'de_18', name:'18', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'2109', mechPair:null, img:'fg_18.jpg', imgBack:'bg_18.jpg', flipped:false },
    { id:'de_62', name:'62', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1911', mechPair:null, img:'fg_62.jpg', imgBack:'bg_62.jpg', flipped:false },
    { id:'de_26', name:'26', side:'german', nation:'de', type:'infantry', atk:3, def:3, hexId:'1612', mechPair:null, img:'fg_26.jpg', imgBack:'bg_26.jpg', flipped:false },
    { id:'de_276', name:'276', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1714', mechPair:null, img:'fg_276.jpg', imgBack:'bg_276.jpg', flipped:false },
    { id:'de_212', name:'212', side:'german', nation:'de', type:'infantry', atk:3, def:3, hexId:'1815', mechPair:null, img:'fg_212.jpg', imgBack:'bg_212.jpg', flipped:false },
    { id:'de_352', name:'352', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1716', mechPair:null, img:'fg_352.jpg', imgBack:'bg_352.jpg', flipped:false },
    { id:'de_560', name:'560', side:'german', nation:'de', type:'infantry', atk:2, def:2, hexId:'1817', mechPair:null, img:'fg_560.jpg', imgBack:'bg_560.jpg', flipped:false },
  ],

  allied: [
    // === 米軍 初期配置 ===
    { id:'us_9cc_1', name:'9CC(1)', side:'allied', nation:'us', type:'panzer', atk:3, def:2, hexId:'1508', mechPair:'us_9cc_2', img:'fa_9_1.jpg', imgBack:'ba_9_1.jpg', flipped:false },
    { id:'us_9cc_2', name:'9CC(2)', side:'allied', nation:'us', type:'panzer', atk:2, def:1, hexId:'1508', mechPair:'us_9cc_1', img:'fa_9_2.jpg', imgBack:'ba_9_2.jpg', flipped:false },
    { id:'us_14cc', name:'14CC', side:'allied', nation:'us', type:'panzer', atk:1, def:0, hexId:'1907', mechPair:null, img:'fa_14.jpg', imgBack:'ba_14.jpg', flipped:false },
    { id:'us_2inf', name:'2歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1804', mechPair:null, img:'fa_2.jpg', imgBack:'ba_2.jpg', flipped:false },
    { id:'us_4inf', name:'4歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1806', mechPair:null, img:'fa_4.jpg', imgBack:'ba_4.jpg', flipped:false },
    { id:'us_99', name:'99歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1602', mechPair:null, img:'fa_99.jpg', imgBack:'ba_99.jpg', flipped:false },
    { id:'us_9inf', name:'9歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1710', mechPair:null, img:'fa_9.jpg', imgBack:'ba_9.jpg', flipped:false },
    { id:'us_28', name:'28歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, hexId:'1513', mechPair:null, img:'fa_28.jpg', imgBack:'ba_28.jpg', flipped:false },
    { id:'us_106', name:'106歩兵', side:'allied', nation:'us', type:'infantry', atk:2, def:2, hexId:'1615', mechPair:null, img:'fa_106.jpg', imgBack:'ba_106.jpg', flipped:false },
  ],
};

// ============================================================
//  増援
// ============================================================
const REINFORCEMENTS = {
  2: [
    // ドイツ軍 Turn 2 東
    { id:'de_9ss_1', name:'9SS(1)', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:'de_9ss_2', img:'fg_9ss_1.jpg', flipped:false },
    { id:'de_9ss_2', name:'9SS(2)', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:'de_9ss_1', img:'fg_9ss_2.jpg', flipped:false },
    { id:'de_2ss_2', name:'2SS(2)', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:null, img:'fg_2ss_2.jpg', flipped:false },
    { id:'de_fb', name:'FB', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:null, img:'fg_FB.jpg', flipped:false },
    { id:'de_fg', name:'FG', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:null, img:'fg_FG.jpg', flipped:false },
    { id:'de_150', name:'150', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:null, img:'fg_150.jpg', flipped:false },
    { id:'de_3pz_1', name:'3PzGr(1)', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:'de_3pz_2', img:'fg_3_1.jpg', flipped:false },
    { id:'de_3pz_2', name:'3PzGr(2)', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:'de_3pz_1', img:'fg_3_2.jpg', flipped:false },
    // 米軍 Turn 2
    { id:'us_7cc_1', name:'7CC(1)', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_n', mechPair:'us_7cc_2', img:'fa_7_1.jpg', flipped:false },
    { id:'us_7cc_2', name:'7CC(2)', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_n', mechPair:'us_7cc_1', img:'fa_7_2.jpg', flipped:false },
    { id:'us_10cc_1', name:'10CC(1)', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_s', mechPair:'us_10cc_2', img:'fa_10_1.jpg', flipped:false },
    { id:'us_10cc_2', name:'10CC(2)', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_s', mechPair:'us_10cc_1', img:'fa_10_2.jpg', flipped:false },
    { id:'us_1inf', name:'1歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_n', mechPair:null, img:'fa_1.jpg', flipped:false },
    { id:'us_30', name:'30歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_n', mechPair:null, img:'fa_30.jpg', flipped:false },
    { id:'us_82', name:'82空挺', side:'allied', nation:'us', type:'airborne', atk:4, def:4, entryTag:'reinforce_sw', mechPair:null, img:'fa_82.jpg', flipped:false },
    { id:'us_101', name:'101空挺', side:'allied', nation:'us', type:'airborne', atk:4, def:4, entryTag:'reinforce_sw', mechPair:null, img:'fa_101.jpg', flipped:false },
  ],
  3: [
    // ドイツ軍 Turn 3 東
    { id:'de_79', name:'79', side:'german', nation:'de', type:'infantry', atk:2, def:2, entryTag:'reinforce_e', mechPair:null, img:'fg_79.jpg', flipped:false },
    // 英軍 Turn 3 北西
    { id:'uk_gds_1', name:'近衛CC(1)', side:'allied', nation:'uk', type:'panzer', atk:3, def:2, entryTag:'reinforce_nw', mechPair:'uk_gds_2', img:'fb_Gds_1.jpg', flipped:false },
    { id:'uk_gds_2', name:'近衛CC(2)', side:'allied', nation:'uk', type:'panzer', atk:2, def:1, entryTag:'reinforce_nw', mechPair:'uk_gds_1', img:'fb_Gds_2.jpg', flipped:false },
    { id:'uk_29', name:'29CC', side:'allied', nation:'uk', type:'panzer', atk:2, def:1, entryTag:'reinforce_nw', mechPair:null, img:'fb_29.jpg', flipped:false },
    { id:'uk_43', name:'43歩兵', side:'allied', nation:'uk', type:'infantry', atk:3, def:3, entryTag:'reinforce_nw', mechPair:null, img:'fe_43.jpg', flipped:false },
    { id:'uk_53', name:'53歩兵', side:'allied', nation:'uk', type:'infantry', atk:3, def:3, entryTag:'reinforce_nw', mechPair:null, img:'fe_53.jpg', flipped:false },
  ],
  4: [
    // ドイツ軍 Turn 4 東
    { id:'de_9pz_1', name:'9Pz(1)', side:'german', nation:'de', type:'panzer', atk:3, def:2, entryTag:'reinforce_e', mechPair:'de_9pz_2', img:'fg_9_1.jpg', flipped:false },
    { id:'de_9pz_2', name:'9Pz(2)', side:'german', nation:'de', type:'panzer', atk:2, def:1, entryTag:'reinforce_e', mechPair:'de_9pz_1', img:'fg_9_2.jpg', flipped:false },
    { id:'de_15_1', name:'15PzGr(1)', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:'de_15_2', img:'fg_15_1.jpg', flipped:false },
    { id:'de_15_2', name:'15PzGr(2)', side:'german', nation:'de', type:'panzer', atk:1, def:0, entryTag:'reinforce_e', mechPair:'de_15_1', img:'fg_15_2.jpg', flipped:false },
    // 米軍 Turn 4
    { id:'us_2cc_1', name:'2CC(1)', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_n', mechPair:'us_2cc_2', img:'fa_2_1.jpg', flipped:false },
    { id:'us_2cc_2', name:'2CC(2)', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_n', mechPair:'us_2cc_1', img:'fa_2_2.jpg', flipped:false },
    { id:'us_3cc_1', name:'3CC(1)', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_n', mechPair:'us_3cc_2', img:'fa_3_1.jpg', flipped:false },
    { id:'us_3cc_2', name:'3CC(2)', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_n', mechPair:'us_3cc_1', img:'fa_3_2.jpg', flipped:false },
    { id:'us_4cc_1', name:'4CC(1)', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_s', mechPair:'us_4cc_2', img:'fa_4_1.jpg', flipped:false },
    { id:'us_4cc_2', name:'4CC(2)', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_s', mechPair:'us_4cc_1', img:'fa_4_2.jpg', flipped:false },
    { id:'us_84', name:'84歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_n', mechPair:null, img:'fa_84.jpg', flipped:false },
    { id:'us_5inf', name:'5歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_s', mechPair:null, img:'fa_5.jpg', flipped:false },
    { id:'us_26', name:'26歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_s', mechPair:null, img:'fa_26.jpg', flipped:false },
    { id:'us_80', name:'80歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_s', mechPair:null, img:'fa_80.jpg', flipped:false },
  ],
  5: [
    // ドイツ軍 Turn 5 東
    { id:'de_167', name:'167', side:'german', nation:'de', type:'infantry', atk:2, def:2, entryTag:'reinforce_e', mechPair:null, img:'fg_167.jpg', flipped:false },
    { id:'de_246', name:'246', side:'german', nation:'de', type:'infantry', atk:2, def:2, entryTag:'reinforce_e', mechPair:null, img:'fg_246.jpg', flipped:false },
    // 米軍 Turn 5
    { id:'us_75', name:'75歩兵', side:'allied', nation:'us', type:'infantry', atk:3, def:3, entryTag:'reinforce_n', mechPair:null, img:'fa_75.jpg', flipped:false },
  ],
  6: [
    // 米軍 Turn 6
    { id:'us_11cc_1', name:'11CC(1)', side:'allied', nation:'us', type:'panzer', atk:3, def:2, entryTag:'reinforce_s', mechPair:'us_11cc_2', img:'fa_11_1.jpg', flipped:false },
    { id:'us_11cc_2', name:'11CC(2)', side:'allied', nation:'us', type:'panzer', atk:2, def:1, entryTag:'reinforce_s', mechPair:'us_11cc_1', img:'fa_11_2.jpg', flipped:false },
  ],
};

// ============================================================
//  戦闘結果表 (CRT)
// ============================================================
const CRT_COLUMNS = ['-2以下', '-1', '0', '+1', '+2', '+3', '+4', '+5', '+6以上'];

const CRT = [
  ['AR', 'AR', 'AR', 'AR', 'NE', 'NE', 'DR', 'DR', 'DR'],
  ['AR', 'AR', 'AR', 'NE', 'NE', 'DR', 'DR', 'DR', 'DD'],
  ['AR', 'AR', 'NE', 'NE', 'DR', 'DR', 'DR', 'DD', 'DD'],
  ['AR', 'NE', 'NE', 'DR', 'DR', 'DR', 'DD', 'DD', 'DE'],
  ['NE', 'NE', 'DR', 'DR', 'DR', 'DD', 'DD', 'DE', 'DE'],
  ['NE', 'NE', 'DR', 'DR', 'DD', 'DD', 'EX', 'DE', 'DE'],
  ['NE', 'DR', 'DR', 'DD', 'DD', 'EX', 'DE', 'DE', 'DE'],
  ['DR', 'DR', 'DD', 'DD', 'EX', 'DE', 'DE', 'DE', 'DE'],
  ['DR', 'DD', 'DD', 'EX', 'DE', 'DE', 'DE', 'DE', 'DE'],
];

function lookupCRT(differential, dieRoll) {
  let col;
  if (differential <= -2) col = 0;
  else if (differential >= 6) col = 8;
  else col = differential + 2;
  const row = Math.max(0, Math.min(8, dieRoll - 1));
  return CRT[row][col];
}
