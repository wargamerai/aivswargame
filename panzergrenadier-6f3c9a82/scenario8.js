// シナリオ8: 地獄のハイウェイ：フェーヘル (1944年9月22日)
// マーケット・ガーデン作戦も6日目、ドイツ軍は連合軍の長い後方補給を突くべく、
// フェーヘル＝ウーデン地区で反撃に出た。連合軍の前進を停止させ、
// ニーダーライン河北方にいるイギリス第1空挺師団に対する支援を不可能にする
// とともに、あわよくば北方のイギリス・アメリカ軍全部隊を包囲しようというのが
// その狙いだった。
// フェーヘルは今やマーケット・ガーデン作戦の鍵を握っているのだった。
//
// マップ: 地図8（単体マップ）

const SCENARIO_8 = {
  id: 8,
  name: '地獄のハイウェイ：フェーヘル',
  date: '1944年9月22日',
  description: 'マーケット・ガーデン作戦の補給路フェーヘルにドイツ軍が反撃。第101空挺師団とイギリス近衛機甲師団がフェーヘルの鍵を守れるか。',
  map: 8,
  mapImages: ['map/m6.jpg'],
  mapImageRotate: 180,
  maxTurn: 8,
  initiative: { start: 8, side: 'german', shift: 2 },
  visionRange: 10,
  ammoCheck: true,
  ammoDepletionRoll: { allied: 1, german: 3 },
  ammoRecoveryHexes: { allied: ['1701','2701'], german: ['0205'] },
  airSupport: false,
  heavyBombers: [],
  fighterBombers: [],
  offBoardArtillery: [],
  specialRules: [
    'ドイツ軍のSSと国防軍はスタック・共同攻撃可',
    'アメリカ軍とイギリス軍はスタック・共同攻撃不可',
  ],
  // アメリカ軍とイギリス軍のスタック・共同攻撃禁止
  noUSUKStack: true,

  // 勝利条件: フェーヘルの6ヘクスのうち4ヘクス以上を占領した側が勝利
  victory: {
    allied: '連合軍: ゲーム終了時にフェーヘルの6ヘクスのうち4ヘクス以上を占領',
    german: 'ドイツ軍: ゲーム終了時にフェーヘルの6ヘクスのうち4ヘクス以上を占領',
    draw: '3ヘクスずつで引き分け',
    type: 'occupation',
    targetHexes: ['1905','2003','2004','2005','2104','2105'],
    targetCount: 4,
  },

  // ===== 連合軍初期配置 =====
  // 大河ヘクスより北側、町A（フェーヘル）から8ヘクス以内に配置
  initialUnits: [
    // --- アメリカ軍: Para ×11 ---
    { nation:'アメリカ軍', unitName:'Para', side:'allied', type:'I', org:'us',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:7,
      hexId:'1805', count:3 },
    { nation:'アメリカ軍', unitName:'Para', side:'allied', type:'I', org:'us',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:7,
      hexId:'1905', count:2 },
    { nation:'アメリカ軍', unitName:'Para', side:'allied', type:'I', org:'us',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:7,
      hexId:'2005', count:3 },
    { nation:'アメリカ軍', unitName:'Para', side:'allied', type:'I', org:'us',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:7,
      hexId:'2105', count:3 },
    // --- アメリカ軍: 81Mort ×3 ---
    { nation:'アメリカ軍', unitName:'81 Mortar', side:'allied', type:'A', org:'us',
      range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
      hexId:'1904', count:3 },
    // --- アメリカ軍: Leader C ×2 ---
    { nation:'アメリカ軍', unitName:'Leader C', side:'allied', type:'leader', org:'us',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'1905', count:1 },
    { nation:'アメリカ軍', unitName:'Leader C', side:'allied', type:'leader', org:'us',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'2105', count:1 },
    // --- イギリス軍: M4 ×4 * ---
    { nation:'イギリス軍', unitName:'M4', side:'allied', type:'T', org:'uk',
      range:4, fpAT:4, fpSoft:4, def:5, closeAtk:5, closeDef:3, move:10, morale:5,
      hexId:'2004', count:4 },
  ],

  // ===== 援軍 =====
  reinforcements: [
    // --- ドイツSS 第1ターン: 道路ヘクス5から登場 ---
    { turn:1, side:'german', entryHexes:['2005'],  // TODO: 道路ヘクス5の実座標
      units: [
        { nation:'ドイツSS', unitName:'Pz VD', type:'T', org:'ss',
          range:6, fpAT:9, fpSoft:6, def:9, closeAtk:10, closeDef:10, move:12, morale:6,
          count:3 },
        { nation:'ドイツSS', unitName:'Pz IVJ', type:'T', org:'ss',
          range:5, fpAT:7, fpSoft:5, def:7, closeAtk:6, closeDef:5, move:9, morale:6,
          count:1 },
        { nation:'ドイツSS', unitName:'Leader B', type:'leader', org:'ss',
          range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
          count:1 },
      ]
    },
    // --- ドイツ国防軍 第1ターン: 地図西端から登場 ---
    { turn:1, side:'german', entryHexes:['0201','0202','0203','0204','0205','0206','0207','0208','0209'],
      units: [
        { nation:'ドイツ軍', unitName:'Infantry', type:'I', org:'heer',
          range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
          count:13 },
        { nation:'ドイツ軍', unitName:'81 Mortar', type:'A', org:'heer',
          range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
          count:3 },
        { nation:'ドイツ軍', unitName:'Leader B', type:'leader', org:'heer',
          range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
          count:1 },
        { nation:'ドイツ軍', unitName:'Leader C', type:'leader', org:'heer',
          range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
          count:1 },
      ]
    },
    // --- アメリカ軍援軍 第3ターン: 道路ヘクス7から登場 ---
    { turn:3, side:'allied', entryHexes:['1710'],
      units: [
        { nation:'アメリカ軍', unitName:'Para', type:'I', org:'us',
          range:1, fpAT:0, fpSoft:3, def:5, closeAtk:4, closeDef:5, move:5, morale:7,
          count:4 },
        { nation:'アメリカ軍', unitName:'76ATG', type:'AT', org:'us',
          range:5, fpAT:6, fpSoft:4, def:1, closeAtk:0, closeDef:1, move:0, morale:5,
          count:3 },
        { nation:'アメリカ軍', unitName:'Leader C', type:'leader', org:'us',
          range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
          count:1 },
      ]
    },
    // --- イギリス軍援軍 第3ターン: 道路ヘクス2から登場 ---
    { turn:3, side:'allied', entryHexes:['2701'],  // TODO: 道路ヘクス2の実座標
      units: [
        { nation:'イギリス軍', unitName:'M4', type:'T', org:'uk',
          range:4, fpAT:4, fpSoft:4, def:5, closeAtk:5, closeDef:3, move:10, morale:5,
          count:4 },
        { nation:'イギリス軍', unitName:'Leader B', type:'leader', org:'uk',
          range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
          count:1 },
      ]
    },
  ],

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
    germanSS: {
      B: [
        { abilities:['A','R'], back:'ge裏cut42000019.jpg' },
        { abilities:['F','R'], back:'ge裏cut44000021.jpg' },
        { abilities:['M','R'], back:'ge裏cut43000020.jpg' },
      ],
    },
    allied: {
      B: [
        { abilities:['A','R'], back:'uk裏cut34000026.jpg' },
        { abilities:['F','R'], back:'uk裏cut35000027.jpg' },
        { abilities:['M','R'], back:'uk裏cut36000028.jpg' },
      ],
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
    // アメリカ軍
    'アメリカ軍/Para':       'us表01cut43000017.jpg',
    'アメリカ軍/81 Mortar':  'us表02cut72000032.jpg',
    'アメリカ軍/76ATG':      'us表02cut52000024.jpg',
    'アメリカ軍/Leader B':   'us表03cut17000005.jpg',
    'アメリカ軍/Leader C':   'us表03cut22000008.jpg',
    'アメリカ軍/Dummy':      'us表03cut28000014.jpg',
    // イギリス軍
    'イギリス軍/M4':         'ge表cut12000000.jpg',
    'イギリス軍/Leader B':   'ge表1cut25000011.jpg',
    // ドイツSS
    'ドイツSS/Pz VD':        'ss_pz5d_counter.jpg',
    'ドイツSS/Pz IVJ':       'ss_pz4j.jpg',
    'ドイツSS/Leader B':     'ss_leader_b.jpg',
    // ドイツ国防軍
    'ドイツ軍/Infantry':     'ドイツ表01cut22000008.jpg',
    'ドイツ軍/81 Mortar':    'ドイツ表02cut73000033.jpg',
    'ドイツ軍/Leader B':     'ドイツcut16000004.jpg',
    'ドイツ軍/Leader C':     'ドイツcut18000006.jpg',
    'ドイツ軍/Dummy':        'ドイツcut47000021.jpg',
  },

  getUnitImage(nation, unitName) {
    const key = nation + '/' + unitName;
    return this.imageMap[key] ? 'images/' + this.imageMap[key] : '';
  },
};
