// シナリオ9: ヒュルトゲン森林 (1944年11月3日)
// 1944年11月、アメリカ軍はドイツ軍を「西方の壁」から追い出しにかかっていた。
// しかし補給不足により攻勢は各地で停止しており、ここヒュルトゲン森林でも
// アメリカ第1軍は苦戦に陥っていた。
// 11月2日に始まった攻勢は、アメリカ第28歩兵師団を中心としたものであった。
// しかし攻勢2日目にして、ドイツ軍は第116装甲師団の一部を援軍として投入してきた。
//
// マップ: 地図8（180度回転）

const SCENARIO_9 = {
  id: 9,
  name: 'ヒュルトゲン森林',
  date: '1944年11月3日',
  description: 'ヒュルトゲン森林でアメリカ第28歩兵師団が攻勢。見通しの利かない森林地帯での歩兵中心の戦闘。ドイツ軍は第116装甲師団を援軍に投入。',
  map: 9,
  mapImages: ['map/m8.jpg', 'map/m1.jpg'],
  mapImageRotate: 0,
  mapImageOffsets: [{ x:0, y:0 }, { x:-10, y:8 }],
  maxTurn: 8,
  initiative: { start: 9, side: 'allied', shift: 1 },
  visionRange: 8,
  ammoCheck: true,
  ammoDepletionRoll: { allied: 1, german: 3 },
  ammoRecoveryHexes: { allied: ['0719','1719','2719'], german: ['0701','1701'] },
  airSupport: true,
  heavyBombers: [],
  fighterBombers: [
    { name: '空軍支援', side: 'allied', uses: 2, fpMode: 'dice', fpATModifier: -2 },
  ],
  offBoardArtillery: [
    { name: '盤外砲兵', side: 'allied', fpMode: 'dice', fpATModifier: -2, uses: 3, combinable: true },
  ],
  specialRules: [],

  // 勝利条件: 地図8のレベル3高地5ヘクスのうち3ヘクス以上を占領した側が勝利
  victory: {
    allied: 'アメリカ軍: ゲーム終了時にレベル3高地5ヘクスのうち3ヘクス以上を占領',
    german: 'ドイツ軍: ゲーム終了時にレベル3高地5ヘクスのうち3ヘクス以上を占領',
    draw: '',
    type: 'occupation',
    targetHexes: ['0706','0707','0805','0806','1305'],  // fuel 5ヘクス
    targetCount: 3,
  },

  // ===== ドイツ軍初期配置 =====
  // 地図内に自由配置
  initialUnits: [
    // --- Infantry ×10 ---
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'0706', count:2 },
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'0806', count:2 },
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'1005', count:2 },
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'1205', count:2 },
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'1305', count:2 },
    // --- MG ×2 ---
    { nation:'ドイツ軍', unitName:'MG', side:'german', type:'I',
      range:2, fpAT:1, fpSoft:5, def:5, closeAtk:2, closeDef:6, move:4, morale:5,
      hexId:'0805', count:2 },
    // --- 81Mort ×3 ---
    { nation:'ドイツ軍', unitName:'81 Mortar', side:'german', type:'A',
      range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
      hexId:'0905', count:3 },
    // --- PAK75 ×4 ---
    { nation:'ドイツ軍', unitName:'PAK75', side:'german', type:'AT',
      range:5, fpAT:6, fpSoft:4, def:1, closeAtk:0, closeDef:1, move:0, morale:5,
      hexId:'0707', count:4 },
    // --- 陣地Lv1 ×1 ---
    { nation:'ドイツ軍', unitName:'陣地Lv1', side:'german', type:'fortification',
      def:1, move:0, hexId:'0806', count:1 },
    // --- Leader B ×1 ---
    { nation:'ドイツ軍', unitName:'Leader B', side:'german', type:'leader',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'0806', count:1 },
    // --- Leader C ×1 ---
    { nation:'ドイツ軍', unitName:'Leader C', side:'german', type:'leader',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'1205', count:1 },
    // --- Dummy ×15 ---
    { nation:'ドイツ軍', unitName:'Dummy', side:'german', type:'D',
      hexId:'0706', count:3 },
    { nation:'ドイツ軍', unitName:'Dummy', side:'german', type:'D',
      hexId:'0806', count:3 },
    { nation:'ドイツ軍', unitName:'Dummy', side:'german', type:'D',
      hexId:'1005', count:3 },
    { nation:'ドイツ軍', unitName:'Dummy', side:'german', type:'D',
      hexId:'1205', count:3 },
    { nation:'ドイツ軍', unitName:'Dummy', side:'german', type:'D',
      hexId:'1305', count:3 },

    // === 確認用: 援軍を初期配置化（後で戻す） ===
    // --- アメリカ軍（本来T1 地図下端） ---
    { nation:'アメリカ軍', unitName:'Sh.Jumbo', side:'allied', type:'T',
      range:4, fpAT:4, fpSoft:4, def:5, closeAtk:4, closeDef:5, move:7, morale:7,
      hexId:'0515', count:2 },
    { nation:'アメリカ軍', unitName:'M5', side:'allied', type:'T',
      range:5, fpAT:3, fpSoft:3, def:3, closeAtk:4, closeDef:3, move:13, morale:5,
      hexId:'0715', count:4 },
    { nation:'アメリカ軍', unitName:'M8', side:'allied', type:'AC',
      range:3, fpAT:3, fpSoft:5, def:2, closeAtk:2, closeDef:2, move:12, morale:5,
      hexId:'0915', count:2 },
    { nation:'アメリカ軍', unitName:'Infantry', side:'allied', type:'I',
      range:1, fpAT:1, fpSoft:2, def:4, closeAtk:3, closeDef:4, move:5, morale:5,
      hexId:'1115', count:12 },
    { nation:'アメリカ軍', unitName:'Engineer', side:'allied', type:'I',
      range:1, fpAT:1, fpSoft:2, def:4, closeAtk:2, closeDef:4, move:4, morale:5,
      hexId:'1315', count:2 },
    { nation:'アメリカ軍', unitName:'81 Mortar', side:'allied', type:'A',
      range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
      hexId:'1515', count:3 },
    { nation:'アメリカ軍', unitName:'Leader C', side:'allied', type:'leader',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'1715', count:3 },
    // --- ドイツ軍援軍（本来T6 地図上端） ---
    { nation:'ドイツ軍', unitName:'STGIII', side:'german', type:'T',
      range:5, fpAT:6, fpSoft:3, def:6, closeAtk:4, closeDef:3, move:10, morale:6,
      hexId:'1505', count:1 },
  ],

  // ===== 援軍（確認用に一時的に空） =====
  reinforcements: [],

  // ===== 指揮官プール =====
  leaderPool: {
    german: {
      B: [
        { abilities:['A','R'], back:'ドイツ裏2cut15000003.jpg' },
        { abilities:['F','R'], back:'ドイツ裏2cut16000004.jpg' },
        { abilities:['M','R'], back:'ドイツ裏2cut14000002.jpg' },
      ],
      C: [
        { abilities:['A'], back:'ドイツ裏2cut12000000.jpg' },
        { abilities:['F'], back:'ドイツ裏2cut13000001.jpg' },
        { abilities:['M'], back:'ドイツ裏2cut29000015.jpg' },
        { abilities:['R'], back:'ドイツ裏2cut28000014.jpg' },
      ],
    },
    allied: {
      C: [
        { abilities:['A'], back:'us裏02cut28000014.jpg' },
        { abilities:['F'], back:'us裏02cut29000015.jpg' },
        { abilities:['M'], back:'us裏02cut27000013.jpg' },
        { abilities:['R'], back:'us裏02cut25000011.jpg' },
      ],
    },
  },

  // ===== 画像マッピング =====
  imageMap: {
    // ドイツ軍
    'ドイツ軍/Infantry':    'ドイツ表01cut22000008.jpg',
    'ドイツ軍/MG':          'ドイツ表01cut58000030.jpg',
    'ドイツ軍/81 Mortar':   'ドイツ表02cut73000033.jpg',
    'ドイツ軍/PAK75':       'ドイツ表02cut43000017.jpg',
    'ドイツ軍/STGIII':      'ドイツ表02cut17000005.jpg',
    'ドイツ軍/Leader B':    'ドイツcut16000004.jpg',
    'ドイツ軍/Leader C':    'ドイツcut18000006.jpg',
    'ドイツ軍/Dummy':       'ドイツcut47000021.jpg',
    'ドイツ軍/陣地Lv1':    'zinch1.jpg',
    // アメリカ軍
    'アメリカ軍/Sh.Jumbo':  'us表cut54000026.jpg',
    'アメリカ軍/M5':        'us表02cut12000000.jpg',
    'アメリカ軍/M8':        'us表02cut22000008.jpg',
    'アメリカ軍/Infantry':  'us表01cut14000002.jpg',
    'アメリカ軍/Engineer':  'us表01cut28000014.jpg',
    'アメリカ軍/81 Mortar': 'us表02cut72000032.jpg',
    'アメリカ軍/Leader C':  'us表03cut22000008.jpg',
    'アメリカ軍/Dummy':     'us表03cut28000014.jpg',
  },

  getUnitImage(nation, unitName) {
    const key = nation + '/' + unitName;
    return this.imageMap[key] ? 'images/' + this.imageMap[key] : '';
  },
};
