// シナリオ3: サン・メール・エグリーズ (1944年6月6日)
// D-Day早朝、米第101空挺師団がユタ・ビーチ裏手に降下。
// ドイツ軍第6降下猟兵連隊の第2大隊が反撃を開始する。
//
// 道路ヘクス対応: 1=0106, 2=0610, 3=1610, 4=2610, 5=3106, 6=2601
// 町A=0506, 町D=2105/2106/2205/2206/2306(都市群)
const SCENARIO_3 = {
  id: 3,
  name: 'サン・メール・エグリーズ',
  date: '1944年6月6日',
  description: 'D-Day早朝、米第101空挺師団がユタ・ビーチ裏手に降下。ドイツ軍第6降下猟兵連隊が反撃を開始する。',
  map: 3,
  maxTurn: 8,
  initiative: { start: 8, side: 'german', shift: 1 },
  visionRange: 12,
  ammoCheck: false,
  airSupport: false,
  heavyBombers: [],
  fighterBombers: [],
  offBoardArtillery: [
    { name: '盤外砲兵', side: 'german', fp: 8, uses: 4 },
  ],
  specialRules: ['アメリカ軍ユニットは移動隊形になれない'],

  // 勝利条件
  victory: {
    german: 'ドイツ軍: 道路ヘクス3(1610)より、D/DD状態でないユニットを5個以上突破。または全ての町・市街地から米軍を排除',
    allied: 'アメリカ軍: ドイツ軍の勝利条件を阻止',
    draw: '',
    breakthroughTarget: 5,
    drawThreshold: 5,
  },

  // ===== 米軍初期配置 =====
  // A町(0506)～道路ヘクス3(1610)間の道路上かその周り3ヘクス以内
  initialUnits: [
    // --- Para (A町～道路ヘクス3間) ---
    { nation:'アメリカ軍', unitName:'Parachute', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:6,
      hexId:'0506', count:4 },
    { nation:'アメリカ軍', unitName:'Parachute', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:6,
      hexId:'1205', count:4 },
    { nation:'アメリカ軍', unitName:'Parachute', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:6,
      hexId:'1508', count:2 },

    // --- 40AAG×2 ---
    { nation:'アメリカ軍', unitName:'40AAG', side:'allied', type:'AT',
      range:5, fpAT:3, fpSoft:3, def:1, closeAtk:0, closeDef:1, move:0, morale:5,
      hexId:'0803', count:2 },

    // --- 81Mort×2 ---
    { nation:'アメリカ軍', unitName:'81 Mortar', side:'allied', type:'A',
      range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
      hexId:'1409', count:2 },

    // --- Eng×1 + Ranger×1 (1508) ---
    { nation:'アメリカ軍', unitName:'Engineer', side:'allied', type:'I',
      range:1, fpAT:1, fpSoft:1, def:4, closeAtk:2, closeDef:4, move:4, morale:5,
      hexId:'1508', count:1 },
    { nation:'アメリカ軍', unitName:'Ranger', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:1, def:6, closeAtk:2, closeDef:6, move:6, morale:6,
      hexId:'1508', count:1 },

    // --- Leader B×1 (1205) ---
    { nation:'アメリカ軍', unitName:'Leader B', side:'allied', type:'leader',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'1205', count:1 },

    // --- D町(2105-2306)周辺 ---
    // 2105: Para×1 + 81Mort×1
    { nation:'アメリカ軍', unitName:'Parachute', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:6,
      hexId:'2105', count:1 },
    { nation:'アメリカ軍', unitName:'81 Mortar', side:'allied', type:'A',
      range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
      hexId:'2105', count:1 },
    // 2306: Para×4 + Leader B×1
    { nation:'アメリカ軍', unitName:'Parachute', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:6,
      hexId:'2306', count:4 },
    { nation:'アメリカ軍', unitName:'Leader B', side:'allied', type:'leader',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'2306', count:1 },

    // --- ダミー×10 (ユニット配置ヘクスに均等配分) ---
    { nation:'アメリカ軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'0506', count:2 },
    { nation:'アメリカ軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'0803', count:1 },
    { nation:'アメリカ軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'1205', count:2 },
    { nation:'アメリカ軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'1409', count:1 },
    { nation:'アメリカ軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'1508', count:1 },
    { nation:'アメリカ軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'2105', count:1 },
    { nation:'アメリカ軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'2306', count:2 },
  ],

  // ===== 固定援軍: ドイツ軍第1ターン (道路ヘクス1=0106から登場) =====
  reinforcements: [
    // スタック1: FJ×4 + Leader A
    { turn:1, side:'german', entryHexes:['0106'],
      units: [
        { nation:'ドイツ軍', unitName:'FJ', type:'I',
          range:1, fpAT:1, fpSoft:2, def:6, closeAtk:4, closeDef:6, move:5, morale:6,
          count:4 },
        { nation:'ドイツ軍', unitName:'Leader A', type:'leader',
          range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
          count:1 },
      ]
    },
    // スタック2: FJ×4 + Leader B
    { turn:1, side:'german', entryHexes:['0205'],
      units: [
        { nation:'ドイツ軍', unitName:'FJ', type:'I',
          range:1, fpAT:1, fpSoft:2, def:6, closeAtk:4, closeDef:6, move:5, morale:6,
          count:4 },
        { nation:'ドイツ軍', unitName:'Leader B', type:'leader',
          range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
          count:1 },
      ]
    },
    // スタック3: FJ×4
    { turn:1, side:'german', entryHexes:['0207'],
      units: [
        { nation:'ドイツ軍', unitName:'FJ', type:'I',
          range:1, fpAT:1, fpSoft:2, def:6, closeAtk:4, closeDef:6, move:5, morale:6,
          count:4 },
      ]
    },
    // スタック4: FJ×1
    { turn:1, side:'german', entryHexes:['0107'],
      units: [
        { nation:'ドイツ軍', unitName:'FJ', type:'I',
          range:1, fpAT:1, fpSoft:2, def:6, closeAtk:4, closeDef:6, move:5, morale:6,
          count:1 },
      ]
    },
    // スタック5: 81 Mortar×3
    { turn:1, side:'german', entryHexes:['0105'],
      units: [
        { nation:'ドイツ軍', unitName:'81 Mortar', type:'A',
          range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
          count:3 },
      ]
    },
  ],

  // ===== ダイス援軍テーブル =====
  // 第1ターンからイニシアチブ決定後にダイスを振って判定
  // 先攻の時はダイスの目＋1。※ ( ) 内は登場道路ヘクス
  diceReinforcements: {
    allied: {
      startTurn: 1,
      firstPlayerBonus: 1,
      table: [
        { min:0, max:4, units:[], label:'なし' },
        { min:5, max:5, units:[
          { unitName:'Parachute', type:'I', range:1, fpAT:0, fpSoft:3, def:5,
            closeAtk:4, closeDef:5, move:5, morale:6, count:1 }
        ], entryHexes:['0610'], label:'Para×1 (道路ヘクス2)' },
        { min:6, max:6, units:[
          { unitName:'Parachute', type:'I', range:1, fpAT:0, fpSoft:3, def:5,
            closeAtk:4, closeDef:5, move:5, morale:6, count:1 },
          { unitName:'81 Mortar', type:'A', range:8, fpAT:0, fpSoft:2, def:1,
            closeAtk:0, closeDef:1, move:2, morale:5, count:1 }
        ], entryHexes:['2601'], label:'Para×1 + 81Mort×1 (道路ヘクス6)' },
        { min:7, max:7, units:[
          { unitName:'Parachute', type:'I', range:1, fpAT:0, fpSoft:3, def:5,
            closeAtk:4, closeDef:5, move:5, morale:6, count:1 }
        ], entryHexes:['3106'], label:'Para×1 (道路ヘクス5)' },
        { min:8, max:8, units:[
          { unitName:'Sh.105', type:'T', range:3, fpAT:4, fpSoft:6, def:5,
            closeAtk:5, closeDef:3, move:10, morale:5, count:1 }
        ], entryHexes:['2610'], label:'Sh.105×1 (道路ヘクス4)' },
        { min:9, max:9, airSupport:1, units:[], label:'航空支援×1' },
        { min:10, max:10, airSupport:2, units:[], label:'航空支援×2' },
      ],
    },
    german: {
      startTurn: 1,
      firstPlayerBonus: 1,
      table: [
        { min:0, max:2, units:[], label:'なし' },
        { min:3, max:3, units:[
          { unitName:'Infantry', type:'I', range:1, fpAT:1, fpSoft:2, def:5,
            closeAtk:3, closeDef:6, move:5, morale:6, count:1 }
        ], entryHexes:['3106'], label:'Infantry×1 (道路ヘクス5)' },
        { min:4, max:4, units:[
          { unitName:'Infantry', type:'I', range:1, fpAT:1, fpSoft:2, def:5,
            closeAtk:3, closeDef:6, move:5, morale:6, count:1 }
        ], entryHexes:['2601'], label:'Infantry×1 (道路ヘクス6)' },
        { min:5, max:5, units:[
          { unitName:'Infantry', type:'I', range:1, fpAT:1, fpSoft:2, def:5,
            closeAtk:3, closeDef:6, move:5, morale:6, count:1 },
          { unitName:'81 Mortar', type:'A', range:8, fpAT:0, fpSoft:2, def:1,
            closeAtk:0, closeDef:1, move:2, morale:5, count:1 }
        ], entryHexes:['3106'], label:'Infantry×1 + 81Mort×1 (道路ヘクス5)' },
        { min:6, max:6, units:[
          { unitName:'Infantry', type:'I', range:1, fpAT:1, fpSoft:2, def:5,
            closeAtk:3, closeDef:6, move:5, morale:6, count:2 },
          { unitName:'Leader C', type:'leader', range:0, fpAT:0, fpSoft:0, def:0,
            closeAtk:0, closeDef:0, move:15, morale:0, count:1 }
        ], entryHexes:['2601'], label:'Infantry×2 + Leader C×1 (道路ヘクス6)' },
        { min:7, max:7, units:[
          { unitName:'Infantry', type:'I', range:1, fpAT:1, fpSoft:2, def:5,
            closeAtk:3, closeDef:6, move:5, morale:6, count:2 },
          { unitName:'Leader C', type:'leader', range:0, fpAT:0, fpSoft:0, def:0,
            closeAtk:0, closeDef:0, move:15, morale:0, count:1 }
        ], entryHexes:['3106'], label:'Infantry×2 + Leader C×1 (道路ヘクス5)' },
        { min:8, max:8, units:[
          { unitName:'Infantry', type:'I', range:1, fpAT:1, fpSoft:2, def:5,
            closeAtk:3, closeDef:6, move:5, morale:6, count:1 },
          { unitName:'81 Mortar', type:'A', range:8, fpAT:0, fpSoft:2, def:1,
            closeAtk:0, closeDef:1, move:2, morale:5, count:1 }
        ], entryHexes:['2601'], label:'Infantry×1 + 81Mort×1 (道路ヘクス6)' },
        { min:9, max:9, units:[
          { unitName:'FJ', type:'I', range:1, fpAT:1, fpSoft:2, def:6,
            closeAtk:4, closeDef:6, move:5, morale:6, count:3 }
        ], entryHexes:['0106'], label:'FJ×3 (道路ヘクス1)' },
        { min:10, max:10, units:[
          { unitName:'STG III', type:'T', range:5, fpAT:6, fpSoft:3, def:6,
            closeAtk:4, closeDef:3, move:10, morale:6, count:1 }
        ], entryHexes:['0106'], label:'STG III×1 (道路ヘクス1)' },
      ],
    },
  },

  // ===== 指揮官ランダム裏面プール =====
  // ゲーム開始時にランクに応じてランダム割り当て
  // abilities: F=射撃, A=突撃, M=モラル, R=回復
  leaderPool: {
    german: {
      A: [ // Aランク (能力3つ)
        { abilities:['F','A','R'], back:'ドイツ裏2cut18000006.jpg' },
        { abilities:['F','M','R'], back:'ドイツ裏2cut17000005.jpg' },
        { abilities:['M','A','R'], back:'ドイツ裏2cut19000007.jpg' },
      ],
      B: [ // Bランク (能力2つ)
        { abilities:['A','R'], back:'ドイツ裏2cut15000003.jpg' },
        { abilities:['F','R'], back:'ドイツ裏2cut16000004.jpg' },
        { abilities:['M','R'], back:'ドイツ裏2cut14000002.jpg' },
      ],
      C: [ // Cランク (能力1つ)
        { abilities:['A'], back:'ドイツ裏2cut12000000.jpg' },
        { abilities:['F'], back:'ドイツ裏2cut13000001.jpg' },
        { abilities:['M'], back:'ドイツ裏2cut29000015.jpg' },
        { abilities:['R'], back:'ドイツ裏2cut28000014.jpg' },
      ],
    },
    allied: {
      A: [], // アメリカ軍にAランク指揮官はない
      B: [ // Bランク (能力2つ)
        { abilities:['A','R'], back:'us裏02cut13000001.jpg' },
        { abilities:['F','R'], back:'us裏02cut14000002.jpg' },
        { abilities:['M','R'], back:'us裏02cut12000000.jpg' },
      ],
      C: [ // Cランク (能力1つ)
        { abilities:['A'], back:'us裏02cut28000014.jpg' },
        { abilities:['F'], back:'us裏02cut29000015.jpg' },
        { abilities:['M'], back:'us裏02cut27000013.jpg' },
        { abilities:['R'], back:'us裏02cut25000011.jpg' },
      ],
    },
  },

  // ===== 画像マッピング =====
  imageMap: {
    'アメリカ軍/Parachute': 'us表01cut43000017.jpg',
    'アメリカ軍/81 Mortar': 'us表02cut76000036.jpg',
    'アメリカ軍/40AAG':     'us表02cut58000030.jpg',
    'アメリカ軍/Engineer':  'us表01cut28000014.jpg',
    'アメリカ軍/Ranger':    'us表03cut27000013.jpg',
    'アメリカ軍/Leader B':  'us表03cut17000005.jpg',
    'アメリカ軍/Leader C':  'us表03cut22000008.jpg',
    'アメリカ軍/Sh.105':    'us表cut53000025.jpg',
    'アメリカ軍/Dummy':     'us表03cut28000014.jpg',
    'ドイツ軍/FJ':          'ドイツ表01cut28000014.jpg',
    'ドイツ軍/81 Mortar':   'ドイツ表02cut73000033.jpg',
    'ドイツ軍/Leader A':    'ドイツcut13000001.jpg',
    'ドイツ軍/Leader B':    'ドイツcut16000004.jpg',
    'ドイツ軍/Leader C':    'ドイツcut24000010.jpg',
    'ドイツ軍/Infantry':    'ドイツ表01cut22000008.jpg',
    'ドイツ軍/STG III':     'ドイツ表02cut17000005.jpg',
    'ドイツ軍/Dummy':       'ドイツcut47000021.jpg',
  },

  getUnitImage(nation, unitName) {
    const key = nation + '/' + unitName;
    return this.imageMap[key] ? 'images/' + this.imageMap[key] : '';
  },
};
