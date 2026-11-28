// シナリオ2: カーンの逆襲 (1944年6月6日)
const SCENARIO_2 = {
  id: 2,
  name: 'カーンの逆襲',
  date: '1944年6月6日',
  map: 2,
  maxTurn: 6,
  initiative: { start: 8, side: 'german', shift: 1 },
  visionRange: 12,
  ammoCheck: false,
  airSupport: false,
  heavyBombers: [],       // 重爆なし
  fighterBombers: [],     // 戦闘爆撃機なし
  offBoardArtillery: [],
  specialRules: ['移動隊形は使用できない'],

  // 勝利条件
  victory: {
    german: 'ドイツ軍: 7ユニット以上が地図南端から突破',
    allied: 'イギリス軍: ドイツ軍の突破を5ユニット以下に抑える',
    draw: '6ユニットが突破した場合は引き分け',
    breakthroughTarget: 7,
    drawThreshold: 6,
  },

  // イギリス軍 初期配置 (道路ヘクス4と6を結ぶラインより南)
  initialUnits: [
    // --- イギリス軍 ---
    { nation:'イギリス軍', unitName:'Parachute', side:'allied', type:'I',
      range:1, fpAT:0, fpSoft:3, def:5, closeAtk:3, closeDef:6, move:5, morale:6,
      hexId:'0506', count:2 },
    { nation:'イギリス軍', unitName:'6lb ATG', side:'allied', type:'AT',
      range:5, fpAT:5, fpSoft:3, def:1, closeAtk:0, closeDef:1, move:0, morale:5,
      hexId:'0606', count:2 },
    { nation:'イギリス軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'0506', count:3 },
    { nation:'イギリス軍', unitName:'Dummy', side:'allied', type:'D',
      hexId:'0606', count:2 },
  ],

  // 援軍
  reinforcements: [
    // イギリス軍 第1ターン: 道路ヘクス2～3の間（道路を含む）から
    { turn:1, side:'allied', entryHexes:['0610','0710','0810','0910','1010','1110','1210','1310','1410','1510','1610'],
      units: [
        { nation:'イギリス軍', unitName:'M4', type:'T',
          range:4, fpAT:4, fpSoft:4, def:5, closeAtk:5, closeDef:3, move:10, morale:5,
          count:8 },
        { nation:'イギリス軍', unitName:'A27', type:'T',
          range:4, fpAT:4, fpSoft:4, def:5, closeAtk:4, closeDef:4, move:8, morale:5,
          count:4 },
      ]
    },
    // イギリス軍 第4ターン: 道路ヘクス2～3の間から
    { turn:4, side:'allied', entryHexes:['0610','0710','0810','0910','1010','1110','1210','1310','1410','1510','1610'],
      units: [
        { nation:'イギリス軍', unitName:'A22', type:'T',
          range:4, fpAT:4, fpSoft:4, def:10, closeAtk:5, closeDef:8, move:4, morale:5,
          count:2 },
        { nation:'イギリス軍', unitName:'Infantry', type:'I',
          range:1, fpAT:1, fpSoft:2, def:4, closeAtk:2, closeDef:5, move:4, morale:5,
          count:4 },
      ]
    },
    // ドイツ軍 第1ターン: 道路ヘクス5から
    { turn:1, side:'german', entryHexes:['3106'],
      units: [
        { nation:'ドイツ軍', unitName:'Pz IVH', type:'T',
          range:5, fpAT:6, fpSoft:4, def:6, closeAtk:5, closeDef:4, move:9, morale:6,
          count:8 },
        { nation:'ドイツ軍', unitName:'STG III', type:'T',
          range:5, fpAT:6, fpSoft:3, def:6, closeAtk:4, closeDef:3, move:10, morale:6,
          count:2 },
        { nation:'ドイツ軍', unitName:'Sd Kfz-1', type:'AC',
          range:4, fpAT:2, fpSoft:2, def:3, closeAtk:4, closeDef:3, move:12, morale:6,
          count:3 },
      ]
    },
  ],

  // 画像マッピング（pg_unit_images.jsonから）
  imageMap: {
    'イギリス軍/Parachute': 'ge表11cut84000042.jpg',
    'イギリス軍/6lb ATG': 'ge表11cut22000008.jpg',
    'イギリス軍/M4': 'ge表cut22000008.jpg',
    'イギリス軍/A27': 'ge表cut42000016.jpg',
    'イギリス軍/A22': 'ge表cut25000011.jpg',
    'イギリス軍/Infantry': 'ge表11cut77000037.jpg',
    'イギリス軍/Dummy': 'ge表1cut46000020.jpg',
    'ドイツ軍/Pz IVH': 'ドイツ表cut19000007.jpg',
    'ドイツ軍/STG III': 'ドイツ表02cut17000005.jpg',
    'ドイツ軍/Sd Kfz-1': 'ドイツ表02cut24000010.jpg',
    'ドイツ軍/Dummy': 'ドイツcut47000021.jpg',
  },

  // ユニット画像取得
  getUnitImage(nation, unitName) {
    const key = nation + '/' + unitName;
    return this.imageMap[key] ? 'images/' + this.imageMap[key] : '';
  },
};
