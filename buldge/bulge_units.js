// ============================================================
//  Battle of the Bulge - ユニットデータ & CRT
//  ※ダミーデータ。実データは後日差し替え
// ============================================================

const INITIAL_SETUP = {
  german: [
    { id: 'de_inf_12',   name: '12 VGD',        side: 'german', nation: 'de', type: 'infantry',          atk: 4, def: 4, hexId: '1803', mechPair: null, flipped: false },
    { id: 'de_inf_26',   name: '26 VGD',        side: 'german', nation: 'de', type: 'infantry',          atk: 4, def: 4, hexId: '1705', mechPair: null, flipped: false },
    { id: 'de_inf_62',   name: '62 VGD',        side: 'german', nation: 'de', type: 'infantry',          atk: 3, def: 3, hexId: '1907', mechPair: null, flipped: false },
    { id: 'de_inf_560',  name: '560 VGD',       side: 'german', nation: 'de', type: 'infantry',          atk: 3, def: 3, hexId: '1609', mechPair: null, flipped: false },
    { id: 'de_pz_2',     name: '2 Pz Div',      side: 'german', nation: 'de', type: 'panzer',            atk: 7, def: 6, hexId: '1804', mechPair: null, flipped: false },
    { id: 'de_pz_116',   name: '116 Pz Div',    side: 'german', nation: 'de', type: 'panzer',            atk: 6, def: 5, hexId: '1706', mechPair: null, flipped: false },
    { id: 'de_pzg_3',    name: '3 PzGren Div',  side: 'german', nation: 'de', type: 'panzergrenadier',   atk: 5, def: 4, hexId: '1908', mechPair: null, flipped: false },
    { id: 'de_pz_lehr',  name: 'Pz Lehr',       side: 'german', nation: 'de', type: 'panzer',            atk: 7, def: 6, hexId: '1710', mechPair: null, flipped: false },
    { id: 'de_para_5',   name: '5 FJ Div',      side: 'german', nation: 'de', type: 'paratroop',         atk: 4, def: 5, hexId: '1602', mechPair: null, flipped: false },
    { id: 'de_inf_352',  name: '352 VGD',       side: 'german', nation: 'de', type: 'infantry',          atk: 3, def: 3, hexId: '1511', mechPair: null, flipped: false },
  ],

  allied: [
    { id: 'us_inf_2',    name: '2nd Inf Div',   side: 'allied', nation: 'us', type: 'infantry',   atk: 5, def: 5, hexId: '1204', mechPair: null, flipped: false },
    { id: 'us_inf_99',   name: '99th Inf Div',  side: 'allied', nation: 'us', type: 'infantry',   atk: 4, def: 4, hexId: '1303', mechPair: null, flipped: false },
    { id: 'us_inf_106',  name: '106th Inf Div', side: 'allied', nation: 'us', type: 'infantry',   atk: 3, def: 3, hexId: '1406', mechPair: null, flipped: false },
    { id: 'us_inf_28',   name: '28th Inf Div',  side: 'allied', nation: 'us', type: 'infantry',   atk: 4, def: 4, hexId: '1208', mechPair: null, flipped: false },
    { id: 'us_inf_4',    name: '4th Inf Div',   side: 'allied', nation: 'us', type: 'infantry',   atk: 4, def: 4, hexId: '1110', mechPair: null, flipped: false },
    { id: 'us_arm_9',    name: '9th Arm Div',   side: 'allied', nation: 'us', type: 'panzer',     atk: 5, def: 4, hexId: '0907', mechPair: null, flipped: false },
    { id: 'us_arm_7',    name: '7th Arm Div',   side: 'allied', nation: 'us', type: 'panzer',     atk: 5, def: 4, hexId: '0812', mechPair: null, flipped: false },
    { id: 'us_abn_82',   name: '82nd Airborne', side: 'allied', nation: 'us', type: 'paratroop',  atk: 4, def: 5, hexId: '1005', mechPair: null, flipped: false },
  ],
};

// ------------------------------------------------------------
//  増援 (ターン番号 → ユニット配列)
// ------------------------------------------------------------
const REINFORCEMENTS = {
  2: [
    { id: 'de_pz_9',    name: '9 Pz Div',      side: 'german', nation: 'de', type: 'panzer',    atk: 6, def: 5, hexId: '2106', mechPair: null, flipped: false },
  ],
  3: [
    { id: 'us_inf_1',   name: '1st Inf Div',   side: 'allied', nation: 'us', type: 'infantry',  atk: 5, def: 5, hexId: '0205', mechPair: null, flipped: false },
    { id: 'us_arm_3',   name: '3rd Arm Div',   side: 'allied', nation: 'us', type: 'panzer',    atk: 6, def: 5, hexId: '0208', mechPair: null, flipped: false },
  ],
  4: [
    { id: 'de_inf_79',  name: '79 VGD',        side: 'german', nation: 'de', type: 'infantry',  atk: 3, def: 3, hexId: '2010', mechPair: null, flipped: false },
  ],
  5: [
    { id: 'us_abn_101', name: '101st Airborne', side: 'allied', nation: 'us', type: 'paratroop', atk: 4, def: 5, hexId: '0211', mechPair: null, flipped: false },
    { id: 'uk_arm_gds', name: 'Gds Arm Div',   side: 'allied', nation: 'uk', type: 'panzer',    atk: 5, def: 5, hexId: '0203', mechPair: null, flipped: false },
  ],
};

// ------------------------------------------------------------
//  戦闘結果表 (CRT)
//  列: 戦闘差分  -2以下, -1, 0, +1, +2, +3, +4, +5, +6以上
//  行: ダイス結果 1〜9
//  結果: AR=攻撃側後退, NE=効果なし, DR=防御側後退,
//        DD=防御側壊乱後退, EX=相互損害, DE=防御側壊滅
// ------------------------------------------------------------
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
  else col = differential + 2; // -1→1, 0→2, ... +5→7

  const row = Math.max(0, Math.min(8, dieRoll - 1));
  return CRT[row][col];
}
