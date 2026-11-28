// unitdata.js — PG ユニットマスターデータ＋シナリオ定義
// シナリオごとにUNIT_DEFSから必要なユニットを選んで読み込む

// ===== ユニットマスターデータ =====
// range:射程, fpAT:対装甲火力, fpSoft:対非装甲火力, def:防御レベル
// assAtk:近接攻撃力, assDef:近接防御力, mv:移動力, type:ユニットタイプ
// T=戦車, AC=装甲車, AT=対戦車砲, A=砲兵, I=歩兵

const UNIT_DEFS = {

  // ===== アメリカ軍 =====
  us_m4:       { name:'M4',        side:'allied', nation:'us', range:4, fpAT:4, fpSoft:4, def:6, assAtk:5, assDef:4, mv:9,  type:'T',  img:'images/us_m4.jpg',       imgBack:'images/us_m4_back.jpg' },
  us_sh76:     { name:'Sh.76',     side:'allied', nation:'us', range:5, fpAT:6, fpSoft:4, def:5, assAtk:5, assDef:3, mv:10, type:'T',  img:'images/us_sh76.jpg',     imgBack:null },
  us_sh105:    { name:'Sh.105',    side:'allied', nation:'us', range:3, fpAT:4, fpSoft:6, def:5, assAtk:5, assDef:3, mv:10, type:'T',  img:'images/us_sh105.jpg',    imgBack:null },
  us_jumbo:    { name:'Sh.Jumbo',  side:'allied', nation:'us', range:4, fpAT:4, fpSoft:4, def:7, assAtk:4, assDef:5, mv:7,  type:'T',  img:'images/us_jumbo.jpg',    imgBack:null },
  us_m5:       { name:'M5',        side:'allied', nation:'us', range:5, fpAT:3, fpSoft:3, def:4, assAtk:3, assDef:2, mv:13, type:'T',  img:'images/us_m5.jpg',       imgBack:null },
  us_m8:       { name:'M8',        side:'allied', nation:'us', range:5, fpAT:3, fpSoft:3, def:2, assAtk:2, assDef:2, mv:12, type:'AC', img:'images/us_m8.jpg',       imgBack:null },
  us_m18:      { name:'M18',       side:'allied', nation:'us', range:5, fpAT:6, fpSoft:4, def:3, assAtk:5, assDef:2, mv:14, type:'T',  img:'images/us_m18.jpg',      imgBack:null },
  us_m36:      { name:'M36',       side:'allied', nation:'us', range:6, fpAT:7, fpSoft:5, def:5, assAtk:6, assDef:3, mv:9,  type:'T',  img:'images/us_m36.jpg',      imgBack:null },
  us_m26:      { name:'M26',       side:'allied', nation:'us', range:7, fpAT:5, fpSoft:6, def:6, assAtk:5, assDef:4, mv:9,  type:'T',  img:'images/us_m26.gif',      imgBack:'images/us_m26_back.gif' },
  us_57atg:    { name:'57ATG',     side:'allied', nation:'us', range:5, fpAT:5, fpSoft:3, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/us_57atg.jpg',    imgBack:null },
  us_76atg:    { name:'76ATG',     side:'allied', nation:'us', range:5, fpAT:6, fpSoft:4, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/us_76atg.jpg',    imgBack:null },
  us_90aag:    { name:'90AAG',     side:'allied', nation:'us', range:7, fpAT:7, fpSoft:4, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/us_90aag.jpg',    imgBack:null },
  us_40aag:    { name:'40AAG',     side:'allied', nation:'us', range:5, fpAT:3, fpSoft:3, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/us_40aag.jpg',    imgBack:null },
  us_mortar81: { name:'81 Mortar', side:'allied', nation:'us', range:8, fpAT:0, fpSoft:2, def:1, assAtk:0, assDef:1, mv:2,  type:'A',  img:'images/us_mortar81.jpg', imgBack:null },
  us_inf:      { name:'Infantry',  side:'allied', nation:'us', range:1, fpAT:1, fpSoft:2, def:4, assAtk:3, assDef:4, mv:5,  type:'I',  img:'images/us_inf.gif',      imgBack:'images/us_inf_back.gif' },
  us_eng:      { name:'Engineer',  side:'allied', nation:'us', range:1, fpAT:1, fpSoft:1, def:4, assAtk:2, assDef:4, mv:4,  type:'I',  img:'images/us_eng.jpg',      imgBack:null },
  us_para:     { name:'Parachute', side:'allied', nation:'us', range:1, fpAT:0, fpSoft:3, def:5, assAtk:4, assDef:5, mv:5,  type:'I',  img:'images/us_para.jpg',     imgBack:null },
  us_ranger:   { name:'Ranger',    side:'allied', nation:'us', range:1, fpAT:0, fpSoft:1, def:6, assAtk:2, assDef:6, mv:6,  type:'I',  img:'images/us_ranger.jpg',   imgBack:null },
  us_leader_b: { name:'Leader B',  side:'allied', nation:'us', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/us_leader_b.jpg', imgBack:null },
  us_leader_c: { name:'Leader C',  side:'allied', nation:'us', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/us_leader_c.jpg', imgBack:null },

  // ===== イギリス軍 =====
  uk_m4:       { name:'M4',        side:'allied', nation:'uk', range:4, fpAT:4, fpSoft:4, def:5, assAtk:5, assDef:3, mv:10, type:'T',  img:'images/uk_m4.jpg',       imgBack:null },
  uk_a22:      { name:'A22',       side:'allied', nation:'uk', range:4, fpAT:4, fpSoft:4, def:10,assAtk:5, assDef:8, mv:4,  type:'T',  img:'images/uk_a22.jpg',      imgBack:null },
  uk_a27:      { name:'A27',       side:'allied', nation:'uk', range:4, fpAT:4, fpSoft:4, def:5, assAtk:4, assDef:4, mv:8,  type:'T',  img:'images/uk_a27.jpg',      imgBack:null },
  uk_a27cs:    { name:'A27 C/S',   side:'allied', nation:'uk', range:2, fpAT:1, fpSoft:7, def:5, assAtk:4, assDef:4, mv:8,  type:'T',  img:'images/uk_a27cs.jpg',    imgBack:null },
  uk_firefly:  { name:'Firefly',   side:'allied', nation:'uk', range:6, fpAT:8, fpSoft:4, def:7, assAtk:5, assDef:5, mv:7,  type:'T',  img:'images/uk_firefly.jpg',  imgBack:null },
  uk_achilles: { name:'Achilles',  side:'allied', nation:'uk', range:6, fpAT:8, fpSoft:4, def:4, assAtk:5, assDef:2, mv:10, type:'T',  img:'images/uk_achilles.jpg', imgBack:null },
  uk_daimler:  { name:'Daimler',   side:'allied', nation:'uk', range:5, fpAT:3, fpSoft:1, def:1, assAtk:2, assDef:2, mv:14, type:'AC', img:'images/uk_daimler.jpg',  imgBack:null },
  uk_6lb_atg:  { name:'6lb ATG',   side:'allied', nation:'uk', range:5, fpAT:5, fpSoft:3, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/uk_6lb_atg.jpg',  imgBack:null },
  uk_17lb_atg: { name:'17lb ATG',  side:'allied', nation:'uk', range:6, fpAT:8, fpSoft:4, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/uk_17lb_atg.jpg', imgBack:null },
  uk_40aag:    { name:'40 AAG',    side:'allied', nation:'uk', range:5, fpAT:3, fpSoft:3, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/uk_40aag.jpg',    imgBack:null },
  uk_76mort:   { name:'76Mortar',  side:'allied', nation:'uk', range:8, fpAT:0, fpSoft:2, def:1, assAtk:0, assDef:1, mv:2,  type:'A',  img:'images/uk_76mort.jpg',   imgBack:null },
  uk_inf:      { name:'Infantry',  side:'allied', nation:'uk', range:1, fpAT:1, fpSoft:2, def:4, assAtk:2, assDef:5, mv:4,  type:'I',  img:'images/uk_inf.jpg',      imgBack:null },
  uk_eng:      { name:'Engineer',  side:'allied', nation:'uk', range:1, fpAT:1, fpSoft:2, def:5, assAtk:3, assDef:6, mv:4,  type:'I',  img:'images/uk_eng.jpg',      imgBack:null },
  uk_para:     { name:'Parachute', side:'allied', nation:'uk', range:1, fpAT:0, fpSoft:3, def:5, assAtk:3, assDef:6, mv:5,  type:'I',  img:'images/uk_para.jpg',     imgBack:null },
  uk_leader_b: { name:'Leader B',  side:'allied', nation:'uk', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/uk_leader_b.jpg', imgBack:null },
  uk_leader_c: { name:'Leader C',  side:'allied', nation:'uk', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/uk_leader_c.jpg', imgBack:null },

  // ===== ドイツ軍 =====
  ge_pz3m:     { name:'Pz IIIM',   side:'german', nation:'ge', range:5, fpAT:4, fpSoft:3, def:5, assAtk:4, assDef:3, mv:10, type:'T',  img:'images/ge_pz3m.gif',     imgBack:'images/ge_pz3m_back.gif' },
  ge_pz4h:     { name:'Pz IVH',    side:'german', nation:'ge', range:5, fpAT:6, fpSoft:4, def:6, assAtk:5, assDef:4, mv:9,  type:'T',  img:'images/ge_pz4h.gif',     imgBack:'images/ge_pz4h_back.gif' },
  ge_pz5a:     { name:'Pz VA',     side:'german', nation:'ge', range:6, fpAT:8, fpSoft:5, def:8, assAtk:9, assDef:9, mv:12, type:'T',  img:'images/ge_pz5a.gif',     imgBack:'images/ge_pz5a_back.gif' },
  ge_pz6e:     { name:'Pz VIE',    side:'german', nation:'ge', range:5, fpAT:8, fpSoft:6, def:10,assAtk:9, assDef:9, mv:7,  type:'T',  img:'images/ss_pz6e.gif',     imgBack:'images/ss_pz6e_back.gif' },
  ge_pz6b:     { name:'Pz VIB',    side:'german', nation:'ge', range:7, fpAT:11,fpSoft:6, def:12,assAtk:10,assDef:12,mv:5,  type:'T',  img:'images/ss_pz6b.gif',     imgBack:'images/ss_pz6b_back.gif' },
  ge_jgdpz4:   { name:'Jgd Pz IVL',side:'german', nation:'ge', range:6, fpAT:8, fpSoft:3, def:8, assAtk:5, assDef:4, mv:9,  type:'T',  img:'images/ge_jgdpz4.gif',   imgBack:null },
  ge_jgdpz5:   { name:'Jgd Pz V',  side:'german', nation:'ge', range:7, fpAT:10,fpSoft:4, def:9, assAtk:6, assDef:9, mv:11, type:'T',  img:'images/ge_jgdpz4.gif',   imgBack:null },
  ge_stg3:     { name:'STG III',    side:'german', nation:'ge', range:5, fpAT:6, fpSoft:3, def:6, assAtk:4, assDef:3, mv:10, type:'T',  img:'images/ge_stg3.gif',     imgBack:'images/ge_stg3_back.gif' },
  ge_hetzer:   { name:'Hetzer',     side:'german', nation:'ge', range:5, fpAT:7, fpSoft:3, def:8, assAtk:5, assDef:4, mv:7,  type:'T',  img:'images/ge_stg105.gif',   imgBack:'images/ge_stg105_back.gif' },
  ge_sdkfz1:   { name:'Sd Kfz-1',  side:'german', nation:'ge', range:4, fpAT:2, fpSoft:2, def:3, assAtk:4, assDef:3, mv:12, type:'AC', img:'images/ge_sdkfz1.gif',   imgBack:'images/ge_sdkfz1_back.gif' },
  ge_sdkfz2:   { name:'Sd Kfz-2',  side:'german', nation:'ge', range:5, fpAT:4, fpSoft:3, def:3, assAtk:4, assDef:3, mv:11, type:'AC', img:'images/ge_sdkfz2.gif',   imgBack:'images/ge_sdkfz2_back.gif' },
  ge_pak75:    { name:'PAK 75',     side:'german', nation:'ge', range:5, fpAT:6, fpSoft:4, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/ge_pak75.gif',    imgBack:'images/ge_pak75_back.gif' },
  ge_pak88:    { name:'PAK 88',     side:'german', nation:'ge', range:8, fpAT:10,fpSoft:4, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/ge_pak88.gif',    imgBack:'images/ge_pak88_back.gif' },
  ge_flak88:   { name:'FLAK 88',    side:'german', nation:'ge', range:6, fpAT:7, fpSoft:4, def:1, assAtk:0, assDef:1, mv:0,  type:'AT', img:'images/ge_pak88.gif',    imgBack:null },
  ge_nebel:    { name:'Nebelwerfer',side:'german', nation:'ge', range:10,fpAT:1, fpSoft:5, def:1, assAtk:0, assDef:1, mv:0,  type:'A',  img:'images/ge_mortar81.gif', imgBack:null },
  ge_mortar81: { name:'81 Mortar',  side:'german', nation:'ge', range:8, fpAT:0, fpSoft:2, def:1, assAtk:0, assDef:1, mv:2,  type:'A',  img:'images/ge_mortar81.gif', imgBack:'images/ge_mortar81_back.gif' },
  ge_inf:      { name:'Infantry',   side:'german', nation:'ge', range:1, fpAT:1, fpSoft:2, def:5, assAtk:3, assDef:6, mv:5,  type:'I',  img:'images/ge_inf.gif',      imgBack:'images/ge_inf_back.gif' },
  ge_fj:       { name:'FJ',         side:'german', nation:'ge', range:1, fpAT:1, fpSoft:2, def:6, assAtk:4, assDef:6, mv:5,  type:'I',  img:'images/ge_inf.gif',      imgBack:'images/ge_inf_back.gif' },
  ge_mg:       { name:'MG',         side:'german', nation:'ge', range:2, fpAT:1, fpSoft:5, def:5, assAtk:2, assDef:6, mv:4,  type:'I',  img:'images/ge_mg.gif',       imgBack:'images/ge_mg_back.gif' },
  ge_leader_a: { name:'Leader A',   side:'german', nation:'ge', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/ss_leader_a.jpg', imgBack:null },
  ge_leader_b: { name:'Leader B',   side:'german', nation:'ge', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/ge_leader_c.gif', imgBack:null },
  ge_leader_c: { name:'Leader C',   side:'german', nation:'ge', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/ge_leader_c.gif', imgBack:null },

  // ===== ドイツSS =====
  ss_pz5d:     { name:'Pz VD',     side:'german', nation:'ss', range:6, fpAT:9, fpSoft:6, def:9, assAtk:10,assDef:10,mv:12, type:'T',  img:'images/ss_pz5d.gif',     imgBack:'images/ss_pz5d_back.gif' },
  ss_pz4j:     { name:'Pz IVJ',    side:'german', nation:'ss', range:5, fpAT:7, fpSoft:5, def:7, assAtk:6, assDef:5, mv:9,  type:'T',  img:'images/ss_pz4j.jpg',     imgBack:null },
  ss_inf:      { name:'SS Infantry',side:'german', nation:'ss', range:1, fpAT:1, fpSoft:3, def:6, assAtk:4, assDef:7, mv:5,  type:'I',  img:'images/ss_inf.jpg',      imgBack:null },
  ss_leader_a: { name:'SS Leader A',side:'german', nation:'ss', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/ss_leader_a.jpg', imgBack:null },
  ss_leader_b: { name:'SS Leader B',side:'german', nation:'ss', range:0, fpAT:0, fpSoft:0, def:0, assAtk:0, assDef:0, mv:15, type:'leader', img:'images/ss_leader_b.jpg', imgBack:null },

  // ===== マーカー =====
  marker_zinchi1: { name:'陣地Lv1', type:'fortification', def:1, img:'images/zinchi1.jpg', imgBack:'images/ip.jpg' },
  marker_zinchi2: { name:'陣地Lv2', type:'fortification', def:2, img:'images/zinchi2.jpg', imgBack:'images/ip.jpg' },
  marker_zinchi3: { name:'陣地Lv3', type:'fortification', def:1, img:'images/zinchi3.gif', imgBack:'images/ip.jpg' },
  marker_zinchi4: { name:'陣地Lv4', type:'fortification', def:1, img:'images/zinchi4.gif', imgBack:'images/ip.jpg' },
  marker_zinchi5: { name:'陣地Lv5', type:'fortification', def:1, img:'images/zinchi5.gif', imgBack:'images/ip.jpg' },
  marker_ip:      { name:'I.P.',    type:'ip',            def:0, img:'images/ip.jpg',      imgBack:null },
  marker_dummy:   { name:'ダミー',  type:'dummy',         def:0, img:'images/ge_dummy.gif', imgBack:null },
};

// ===== モラルテーブル =====
const MORALE_TABLE = {
  us:   { base: 5, para: 6, ranger: 6 },
  uk:   { base: 5, para: 6 },
  ge:   { base: 6 },
  ss:   { base: 7 },
};

// ===== リーダー能力 =====
// A=突撃, M=モラル, R=回復, F=射撃
const LEADER_ABILITIES = {
  leader_a: ['A','M','R','F','A','R','F','M','R'],  // A.M.R / F.A.R / F.M.R
  leader_b: ['F','R','A','R','M','R'],                // F.R / A.R / M.R
  leader_c: ['F','A','M','R','R'],                    // F / A / M or R or R
};

// ===== 射撃戦闘結果表 =====
// 火力列: [1,2,3,4,5,6,7,8,9,10,11-12,13-14,15-16,17-18,19-20,21-22,23-24,25-26,27-29,30-32,33-35,36-38,39-41,42-45,46-49,50+]
// 行: ダイス目（修正後）-3〜12
// 値: 損害レベル。'E'=防御レベルに関係なく壊滅
const FIRE_POWER_COLS = [1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,24,26,29,32,35,38,41,45,49,99];
const FIRE_COMBAT_TABLE = {
  '-3': [0,0,0,0,0,0,0,0,1,2, 3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9,10,11,11,12,12],
  '-2': [0,0,0,0,0,0,1,2,3,4, 5, 6, 6, 7, 7, 8, 8, 9, 9,10,10,11,11,12,12,12],
  '-1': [0,0,0,0,1,1,3,4,5,6, 6, 7, 7, 8, 8, 9, 9,10,10,11,11,12,12,13,13,13],
   '0': [0,0,0,0,1,1,3,4,5,6, 7, 7, 8, 8, 9, 9,10,10,11,11,12,12,13,13,14,14],
   '1': [0,0,0,1,1,4,5,6,6,7, 7, 7, 8, 8, 9, 9,10,10,11,11,12,12,13,13,14,14],
   '2': [0,0,1,1,2,3,5,6,7,7, 8, 8, 9, 9,10,10,11,11,12,12,13,13,14,14,15,15],
   '3': [0,0,1,2,3,4,6,6,7,7, 8, 8, 9,10,10,11,11,12,12,13,13,14,14,15,15,15],
   '4': [0,1,2,3,4,5,6,7,8,8, 9, 9,10,10,11,11,12,12,13,13,14,14,15,15,'E', 4],
   '5': [1,2,3,3,5,6,7,7,8,9, 9,10,10,11,11,12,12,13,13,14,14,15,15,'E','E', 5],
   '6': [2,3,3,4,6,6,7,8,8,9, 9,10,10,11,11,12,12,13,13,14,15,15,'E','E','E', 6],
   '7': [3,4,4,5,6,7,8,8,9,10,10,10,11,11,12,12,13,13,14,14,15,'E','E','E','E', 7],
   '8': [4,5,5,6,7,8,8,9,9,10,11,11,12,12,13,13,14,14,15,15,'E','E','E','E','E', 8],
   '9': [4,5,6,6,7,8,8,9,9,10,10,11,12,13,13,14,14,15,15,'E','E','E','E','E','E', 9],
  '10': [5,5,6,7,8,8,9,9,10,10,11,11,12,13,13,14,15,15,'E','E','E','E','E','E','E',10],
  '11': [6,7,8,8,9,10,10,10,11,11,12,13,13,14,15,15,'E','E','E','E','E','E','E','E','E',11],
  '12': [7,8,9,9,10,10,11,11,12,13,13,14,14,15,15,'E','E','E','E','E','E','E','E','E','E',12],
};

// 火力から列インデックスを取得
function getFirePowerCol(fp) {
  for (let i = 0; i < FIRE_POWER_COLS.length; i++) {
    if (fp <= FIRE_POWER_COLS[i]) return i;
  }
  return FIRE_POWER_COLS.length - 1;
}

// 射撃結果を取得: 損害レベル or 'E'
function getFireCombatResult(firePower, diceRoll) {
  const col = getFirePowerCol(firePower);
  const row = Math.max(-3, Math.min(12, diceRoll));
  return FIRE_COMBAT_TABLE[String(row)][col];
}

// 損害判定: 損害レベル vs 防御レベル
// +0 or +1: D, +2: DD, +3以上: 壊滅, 'E': 壊滅
function resolveDamage(damageLevel, defenseLevel) {
  if (damageLevel === 'E') return 'eliminated';
  const diff = damageLevel - defenseLevel;
  if (diff < 0) return 'none';
  if (diff <= 1) return 'd';
  if (diff === 2) return 'dd';
  return 'eliminated'; // +3以上
}

// ===== 地形修正テーブル =====
// 射撃修正（ダイス目に加算）、突撃修正、移動コスト、視認コスト
const TERRAIN_MODIFIERS = {
  p:    { fire: 0,  assault: 0,  move: 1,   moveMech: 1, vision: 1,    losBlock: false }, // 平地
  w:    { fire: -2, assault: -1, move: 2,   moveMech: 4, vision: 'block', losBlock: true  }, // 林
  f:    { fire: -3, assault: -2, move: 3,   moveMech: 6, vision: 'block', losBlock: true  }, // 森林 (*3 戦車進入不可、移動隊形なら可)
  r:    { fire: -1, assault: -1, move: 2,   moveMech: 4, vision: 4,    losBlock: false }, // 荒地
  t:    { fire: -2, assault: -1, move: 1,   moveMech: 1, vision: 'block', losBlock: true  }, // 町
  c:    { fire: -3, assault: -2, move: 1,   moveMech: 1, vision: 'block', losBlock: true  }, // 市街地
  lake: { fire: 0,  assault: 0,  move: 99,  moveMech: 99,vision: 1,    losBlock: false }, // 湖（通行不可）
};
// ヘクスサイド地形修正
const HEXSIDE_MODIFIERS = {
  river:  { move: 1,  fire: 0,  assault: -1 }, // 川
  slope1: { move: 1,  fire: 0,  assault: -1 }, // 斜面
  slope2: { move: 1,  fire: 0,  assault: -1 }, // 急斜面
  cliff:  { move: 99, fire: 0,  assault: -99}, // 崖（レインジャーのみ全移動力で越可）
};
// 施設修正（陣地・I.P.は地形と重複）
const FACILITY_MODIFIERS = {
  fortification: { fire: 0, assault: -2 }, // 陣地: 射撃は特殊（17章）、突撃-2
  ip:            { fire: -1, assault: -2 }, // I.P.: 射撃-1、突撃-2
};

// ===== 偵察チャート =====
const RECON_CHART_DATA = [1,1,2,2,3,3,4,4,0,0]; // index=ダイス, 値=除去ダミー数(0=失敗)

// ===== 戦闘爆撃機発見表 =====
const FIGHTER_BOMBER_DISCOVERY = {
  p: [1,8],    // 平地: 1-8で発見
  r: [1,6],    // 荒地: 1-6で発見
  w: [1,3],    // 林: 1-3で発見
  t: [1,3],    // 町: 1-3で発見
  f: [1,1],    // 森林: 1のみ
  c: [1,1],    // 市街地: 1のみ
};

// ===== シナリオ定義 =====
// シナリオごとにユニット構成・配置・マップを定義
const SCENARIOS = {

  // テストシナリオ
  test: {
    name: 'テストシナリオ',
    map: 'm3.jpg',
    mapConfig: { hexSize:78.4, offsetX:-98, offsetY:-140, cols:31, rows:10 },
    maxTurn: 10,
    initMarker: 5,
    visionRange: 12,
    units: [
      // ドイツ軍
      { def:'ge_pz4h',  hexId:'1505', morale:6, status:'ok' },
      { def:'ge_pz4h',  hexId:'1505', morale:6, status:'ok' },
      { def:'ge_inf',   hexId:'1606', morale:6, status:'ok' },
      { def:'ge_inf',   hexId:'1606', morale:6, status:'ok' },
      { def:'ge_inf',   hexId:'1607', morale:6, status:'ok' },
      { def:'ge_stg3',  hexId:'1807', morale:6, status:'ok' },
      { def:'ge_pak75', hexId:'1708', morale:6, status:'ok' },
      // 連合軍
      { def:'uk_a27',   hexId:'1005', morale:5, status:'ok' },
      { def:'uk_a27',   hexId:'1005', morale:5, status:'ok' },
      { def:'uk_inf',   hexId:'1107', morale:5, status:'ok' },
      { def:'uk_inf',   hexId:'1107', morale:5, status:'ok' },
      { def:'uk_inf',   hexId:'1206', morale:5, status:'ok' },
      { def:'uk_firefly',hexId:'0905',morale:5, status:'ok' },
      { def:'uk_6lb_atg',hexId:'1306',morale:5, status:'ok' },
    ],
    markers: [
      { def:'marker_zinchi1', hexId:'1606' },
      { def:'marker_ip',      hexId:'1206' },
    ],
  },
};
