// シナリオ7: 赤い悪魔：アルンエム (1944年9月18日)
// 史上最大の空挺作戦「マーケット・ガーデン」の最先鋒を受け持ったイギリス第1空挺師団は、
// 目標のアルンエムを降下日の9月17日に占領した。しかし計画は各所で食い違いを見せ、
// 市内に入れたのはわずかに1個大隊といくつかの寄せ集め部隊だけだった。
// 18日、ドイツ軍は第10SS装甲師団の歩兵と近くにいた国防軍をかき集めて反撃に出た。
// 目標はアルンエムの橋。
// イギリス軍は果たして、アルンエムの橋を守りきることができるだろうか。
// 地上軍たる第30軍は、まだはるか彼方なのだ。
//
// マップ: 地図2（北）＋地図7（南）

const SCENARIO_7 = {
  id: 7,
  name: '赤い悪魔：アルンエム',
  date: '1944年9月18日',
  description: 'マーケット・ガーデン作戦の最先鋒、イギリス第1空挺師団はアルンエムの橋を守りきれるか。第10SS装甲師団と国防軍が反撃を開始する。',
  map: 7,  // TODO: 連結マップデータ作成後に調整
  mapImages: ['map/m2.jpg', 'map/m7.jpg'],
  mapImageRotate: 180,
  mapImageOffsets: [{ x:0, y:0 }, { x:-13, y:7 }],
  maxTurn: 8,
  initiative: { start: 8, side: 'allied', shift: 1 },
  visionRange: 10,
  ammoCheck: true,
  ammoDepletionRoll: { allied: 0, german: 3 },
  ammoRecoveryHexes: { german: ['0701','1701','2701'] },
  airSupport: false,
  heavyBombers: [],
  fighterBombers: [],
  offBoardArtillery: [],
  specialRules: [
    'ネーベルヴェルファーと迫撃砲は共同射撃不可（迫撃砲同士なら可）',
    'ドイツ軍のSSと国防軍はスタック・共同攻撃不可',
    '両軍とも大河の南側へ移動不可、橋の上にも進入不可',
  ],
  // SS と国防軍のスタック・共同攻撃禁止
  noSSHeerStack: true,
  // ネーベルヴェルファーと迫撃砲の共同射撃禁止
  noMortarNebelCombined: true,

  // 勝利条件: 地図7のヘクス2248をゲーム終了時に占領した側が勝利
  victory: {
    allied: 'イギリス軍: ゲーム終了時にヘクス2248を占領',
    german: 'ドイツ軍: ゲーム終了時にヘクス2248を占領',
    draw: 'どちらも占領していなければ引き分け',
    type: 'occupation',
    targetHexes: ['1716'],
  },

  // ===== イギリス軍（第1空挺師団）初期配置 =====
  // 地図7内に自由配置
  initialUnits: [
    // --- Para ×18 ---
    { nation:'イギリス軍', unitName:'Para', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:7,
      hexId:'0815', count:3 },
    { nation:'イギリス軍', unitName:'Para', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:7,
      hexId:'1215', count:3 },
    { nation:'イギリス軍', unitName:'Para', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:7,
      hexId:'1615', count:3 },
    { nation:'イギリス軍', unitName:'Para', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:7,
      hexId:'2015', count:3 },
    { nation:'イギリス軍', unitName:'Para', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:7,
      hexId:'2415', count:3 },
    { nation:'イギリス軍', unitName:'Para', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:7,
      hexId:'2815', count:3 },
    // --- 1616: Para ×1 + Engineer ×3 ---
    { nation:'イギリス軍', unitName:'Para', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:7,
      hexId:'1616', count:1 },
    { nation:'イギリス軍', unitName:'Engineer', side:'allied', type:'I',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:4, morale:6,
      hexId:'1616', count:3 },
    // --- 1412: 6pdrATG ×3 + Para ×1 ---
    { nation:'イギリス軍', unitName:'6pdrATG', side:'allied', type:'AT',
      range:5, fpAT:5, fpSoft:3, def:1, closeAtk:0, closeDef:1, move:0, morale:5,
      hexId:'1412', count:3 },
    { nation:'イギリス軍', unitName:'Para', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:7,
      hexId:'1412', count:1 },
    // --- 40MAG ×2 ---
    { nation:'イギリス軍', unitName:'40MAG', side:'allied', type:'AT',
      range:5, fpAT:3, fpSoft:3, def:1, closeAtk:0, closeDef:1, move:0, morale:5,
      hexId:'1812', count:2 },
    // --- 79Mort ×4 ---
    { nation:'イギリス軍', unitName:'79Mort', side:'allied', type:'A',
      range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
      hexId:'1715', count:4 },
    // --- Leader B ×1 ---
    { nation:'イギリス軍', unitName:'Leader B', side:'allied', type:'leader',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'1415', count:1 },
    // --- Leader C ×1 ---
    { nation:'イギリス軍', unitName:'Leader C', side:'allied', type:'leader',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'2215', count:1 },
    // --- Dummy ×15 ---
    { nation:'イギリス軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'0815', count:3 },
    { nation:'イギリス軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'1215', count:3 },
    { nation:'イギリス軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'1615', count:3 },
    { nation:'イギリス軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'2015', count:3 },
    { nation:'イギリス軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'2415', count:3 },

    // ===== ドイツ軍 初期配置 =====
    // 地図2内に自由配置

    // --- SS: PzIIIM ×2 ---
    { nation:'ドイツ軍', unitName:'PzIIIM', side:'german', type:'T', org:'ss',
      range:5, fpAT:4, fpSoft:3, def:5, closeAtk:4, closeDef:3, move:10, morale:6,
      hexId:'1005', count:2 },
    // --- SS: STGIII ×1 ---
    { nation:'ドイツ軍', unitName:'STGIII', side:'german', type:'T', org:'ss',
      range:5, fpAT:6, fpSoft:3, def:6, closeAtk:4, closeDef:3, move:10, morale:6,
      hexId:'1805', count:1 },
    // --- SS: SdKfz-1 ×2 ---
    { nation:'ドイツ軍', unitName:'SdKfz-1', side:'german', type:'AC', org:'ss',
      range:4, fpAT:2, fpSoft:2, def:3, closeAtk:4, closeDef:3, move:12, morale:6,
      hexId:'2205', count:2 },
    // --- SS: Infantry ×6（SS装甲擲弾兵） ---
    { nation:'ドイツ軍', unitName:'SS Infantry', side:'german', type:'I', org:'ss',
      range:1, fpAT:1, fpSoft:3, def:6, closeAtk:4, closeDef:7, move:5, morale:7,
      hexId:'0806', count:2 },
    { nation:'ドイツ軍', unitName:'SS Infantry', side:'german', type:'I', org:'ss',
      range:1, fpAT:1, fpSoft:3, def:6, closeAtk:4, closeDef:7, move:5, morale:7,
      hexId:'1406', count:2 },
    { nation:'ドイツ軍', unitName:'SS Infantry', side:'german', type:'I', org:'ss',
      range:1, fpAT:1, fpSoft:3, def:6, closeAtk:4, closeDef:7, move:5, morale:7,
      hexId:'2006', count:2 },
    // --- SS: MG ×2 ---
    { nation:'ドイツ軍', unitName:'MG', side:'german', type:'I', org:'ss',
      range:2, fpAT:1, fpSoft:5, def:5, closeAtk:2, closeDef:6, move:4, morale:5,
      hexId:'1206', count:2 },
    // --- SS: Nebel ×1（ネーベルヴェルファー） ---
    { nation:'ドイツ軍', unitName:'Nebel', side:'german', type:'A', org:'ss',
      range:10, fpAT:1, fpSoft:0, spSoft:5, def:1, closeAtk:0, closeDef:1, move:0, morale:5,
      hexId:'1605', count:1 },
    // --- SS: Leader A ×1 ---
    { nation:'ドイツSS', unitName:'Leader A', side:'german', type:'leader', org:'ss',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'1406', count:1 },
    // --- SS: Leader B ×1 ---
    { nation:'ドイツSS', unitName:'Leader B', side:'german', type:'leader', org:'ss',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'0806', count:1 },
    // --- 国防軍: Leader B ×1 ---
    { nation:'ドイツ軍', unitName:'Leader B', side:'german', type:'leader', org:'heer',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'2006', count:1 },
    // --- 国防軍: Leader C ×1 ---
    { nation:'ドイツ軍', unitName:'Leader C', side:'german', type:'leader', org:'heer',
      range:0, fpAT:0, fpSoft:0, def:0, closeAtk:0, closeDef:0, move:15, morale:0,
      hexId:'1805', count:1 },

    // --- 国防軍: Infantry ×8 ---
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I', org:'heer',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'1114', count:4 },
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I', org:'heer',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'1612', count:4 },
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I', org:'heer',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'1712', count:4 },
    { nation:'ドイツ軍', unitName:'Infantry', side:'german', type:'I', org:'heer',
      range:1, fpAT:1, fpSoft:2, def:5, closeAtk:3, closeDef:6, move:5, morale:5,
      hexId:'2114', count:4 },
    // --- 国防軍: 81Mort ×3 ---
    { nation:'ドイツ軍', unitName:'81 Mortar', side:'german', type:'A', org:'heer',
      range:8, fpAT:0, fpSoft:0, spSoft:2, def:1, closeAtk:0, closeDef:1, move:2, morale:5,
      hexId:'1504', count:3 },
  ],

  // ===== 援軍 =====
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
    germanSS: {
      A: [
        { abilities:['F','A','R'], back:'ge裏cut46000023.jpg' },
        { abilities:['F','M','R'], back:'ge裏cut45000022.jpg' },
        { abilities:['M','A','R'], back:'ge裏cut47000024.jpg' },
      ],
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
        { abilities:['A'], back:'uk裏cut32000024.jpg' },
        { abilities:['F'], back:'uk裏cut58000040.jpg' },
        { abilities:['M'], back:'uk裏cut59000041.jpg' },
        { abilities:['R'], back:'uk裏cut33000025.jpg' },
      ],
    },
  },

  // ===== 画像マッピング =====
  imageMap: {
    // イギリス軍（第1空挺師団）
    'イギリス軍/Para':      'ge表11cut83000041.jpg',
    'イギリス軍/Engineer':  'ge表11cut78000038.jpg',
    'イギリス軍/6pdrATG':   'ge表11cut22000008.jpg',
    'イギリス軍/40MAG':     'ge表11cut27000013.jpg',
    'イギリス軍/79Mort':    'ge表11cut29000015.jpg',
    'イギリス軍/Leader B':  'ge表1cut25000011.jpg',
    'イギリス軍/Leader C':  'ge表1cut42000016.jpg',
    'イギリス軍/Dummy':     'ge表1cut46000020.jpg',
    // ドイツ軍（SS）
    'ドイツ軍/PzIIIM':      'ドイツ表cut13000001.jpg',
    'ドイツ軍/STGIII':      'ドイツ表02cut17000005.jpg',
    'ドイツ軍/SdKfz-1':     'ドイツ表02cut24000010.jpg',
    'ドイツ軍/SS Infantry': 'ss_inf.jpg',
    'ドイツ軍/MG':          'ドイツ表01cut58000030.jpg',
    'ドイツ軍/Nebel':       'ドイツ表02cut54000026.jpg',
    // ドイツ軍（国防軍）
    'ドイツ軍/Infantry':    'ドイツ表01cut22000008.jpg',
    'ドイツ軍/81 Mortar':   'ドイツ表02cut73000033.jpg',
    'ドイツSS/Leader A':    'ss_leader_a.jpg',
    'ドイツSS/Leader B':    'ss_leader_b.jpg',
    'ドイツ軍/Leader B':    'ドイツcut16000004.jpg',
    'ドイツ軍/Leader C':    'ドイツcut18000006.jpg',
    'ドイツ軍/Dummy':       'ドイツcut47000021.jpg',
  },

  getUnitImage(nation, unitName) {
    const key = nation + '/' + unitName;
    return this.imageMap[key] ? 'images/' + this.imageMap[key] : '';
  },
};
