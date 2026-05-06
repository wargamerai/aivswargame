// 海の戦い - 地図・ユニット登録

// === 地図上の座標（%, 駒の中心） ===
// 各港湾の駒配置位置 / 修理位置
const PORT_COORDS = {
  USA:       { x: 3.34,  y: 7.55,  repairX: 8.26,  repairY: 7.56  },
  England:   { x: 38.55, y: 54.08, repairX: 38.50, repairY: 50.29 },
  Russia:    { x: 88.17, y: 26.46, repairX: 88.17, repairY: 30.07 },
  Leningrad: { x: 87.27, y: 40.49, repairX: 87.26, repairY: 43.99 },
  Germany:   { x: 56.38, y: 56.38, repairX: 56.28, repairY: 59.95 },
  France:    { x: 38.40, y: 63.59, repairX: 39.20, repairY: 68.69 },
  Italy:     { x: 59.95, y: 73.14, repairX: 64.97, repairY: 73.20 },
  Malta:     { x: 75.35, y: 95.32, repairX: 73.91, repairY: 87.97 },
  Neutral:   { x: 5.11,  y: 89.67 }
};

// 支配マーカー配置位置（各海域）
const SEA_CONTROL_COORDS = {
  NorthAtlantic: { x: 12.89, y: 38.85 }, // c1
  Barents:       { x: 54.17, y: 19.54 }, // c2
  NorthSea:      { x: 43.27, y: 48.72 }, // c3
  Baltic:        { x: 77.42, y: 44.03 }, // c4
  SouthAtlantic: { x: 13.64, y: 60.13 }, // c5
  Mediterranean: { x: 63.11, y: 80.50 }  // c6
};

// 海域中心座標（%）暫定値。後で調整可。
const SEA_COORDS = {
  NorthAtlantic: { x: 13.0, y: 30.0 },
  Barents:       { x: 52.0, y: 12.0 },
  NorthSea:      { x: 43.0, y: 41.0 },
  Baltic:        { x: 76.0, y: 36.0 },
  Mediterranean: { x: 50.0, y: 80.0 },
  SouthAtlantic: { x: 13.0, y: 65.0 }
};

// 海域内の陣営/タイプ別配置位置（提供座標を反映）
const SEA_POSITIONS = {
  NorthAtlantic: {
    allies: { x: 10.02, y: 22.82 }, // nao-e
    axis:   { x: 16.20, y: 22.82 }, // nao-g
    uboat:  { x: 16.20, y: 26.74 }, // nao-u
    convoy: { x: 10.02, y: 26.74 }  // nao-c
  },
  Barents: {
    allies: { x: 50.39, y: 8.32 },  // b-e
    axis:   { x: 58.02, y: 8.17 },  // b-g
    convoy: { x: 50.29, y: 12.17 }, // bec
    uboat:  { x: 58.02, y: 15.60 }  // bgu
  },
  NorthSea: {
    allies: { x: 40.34, y: 41.73 }, // nb
    axis:   { x: 45.65, y: 41.66 }  // ng
  },
  Baltic: {
    allies: { x: 77.14, y: 32.49 }, // br (ロシア)
    axis:   { x: 77.33, y: 40.47 }, // bg
    uboat:  { x: 77.14, y: 36.62 }  // bga
  },
  SouthAtlantic: {
    allies: { x: 9.82,  y: 64.22 }, // saob
    axis:   { x: 15.52, y: 64.29 }  // saog
  },
  Mediterranean: {
    allies: { x: 51.83, y: 80.20 }, // mb
    axis:   { x: 46.72, y: 80.34 }, // mi (伊中心)
    uboat:  { x: 46.72, y: 84.05 }, // mg → ここをuboatに割り当て(暫定)
    convoy: { x: 51.83, y: 76.69 }  // mf
  }
};

// 各ターンマスの中心座標（%）。turn1はturn2-3間隔から推定。
const TURN_BOX = {
  1: { x: 26.88, y: 97.33 }, // 推定
  2: { x: 32.71, y: 97.33 },
  3: { x: 38.31, y: 97.36 },
  4: { x: 44.24, y: 97.36 },
  5: { x: 50.09, y: 97.39 },
  6: { x: 55.89, y: 97.43 },
  7: { x: 61.69, y: 97.35 },
  8: { x: 67.61, y: 97.30 }
};


// === 海域 (6) ===
// lba: 'axis'=赤い飛行機マーク / 'allies'=白い飛行機マーク / 'both'=両方
const SEAS = {
  NorthAtlantic: { name:'北大西洋',   axis:3, allies:1 },
  Barents:       { name:'バレンツ海', axis:2, allies:1, lba:'axis' },
  NorthSea:      { name:'北海',       axis:3, allies:1 },
  Baltic:        { name:'バルト海',   axis:1, allies:2, lba:'axis' },
  Mediterranean: { name:'地中海',     axis:2, allies:1, lba:'both' },
  SouthAtlantic: { name:'南大西洋',   axis:3, allies:1 }
};

// === 港湾 (8 + 中立港) ===
// 港湾→隣接海域
const PORT_SEAS = {
  USA:       ['NorthAtlantic'],
  England:   ['NorthAtlantic','NorthSea','SouthAtlantic'],
  Malta:     ['Mediterranean'],
  Russia:    ['Barents'],
  Leningrad: ['Baltic'],
  Italy:     ['Mediterranean'],
  France:    ['NorthAtlantic','Mediterranean','SouthAtlantic'],
  Germany:   ['NorthSea','Baltic','Barents'],
  Neutral:   ['SouthAtlantic']
};

// 海域→隣接海域
const SEA_ADJ = {
  NorthAtlantic: ['Barents','NorthSea','SouthAtlantic','Mediterranean'],
  Barents:       ['NorthAtlantic','NorthSea'],
  NorthSea:      ['NorthAtlantic','Barents','Baltic','SouthAtlantic'],
  Baltic:        ['NorthSea'],
  Mediterranean: ['SouthAtlantic','NorthAtlantic'],
  SouthAtlantic: ['NorthAtlantic','NorthSea','Mediterranean']
};

const PORTS = {
  USA:       { side:'allies', name:'米国',           repair:10, available:[4,5,6,7,8] },
  England:   { side:'allies', name:'英国',           repair:8,  available:[1,2,3,4,5,6,7,8] },
  Malta:     { side:'allies', name:'マルタ',         repair:2,  available:[1,2,3,4,5,6,7,8], lba:'axis' },
  Russia:    { side:'allies', name:'ロシア',         repair:2,  available:[3,4,5,6,7,8] },
  Leningrad: { side:'allies', name:'レニングラード', repair:1,  available:[3,4,5,6,7,8], lba:'axis' },
  Germany:   { side:'axis',   name:'ドイツ',         repair:8,  available:[1,2,3,4,5,6,7,8], lba:'allies' },
  France:    { side:'axis',   name:'フランス',       repair:3,  available:[2,3,4,5,6],       lba:'allies' },
  Italy:     { side:'axis',   name:'イタリア',       repair:4,  available:[1,2,3,4,5,6,7,8], lba:'allies' },
  Neutral:   { side:'neutral',name:'中立港(南米)',   repair:0,  available:[1,2,3,4,5,6,7,8] }
};

// === 艦船 ===
// 数値はファイル名 ABC_name.gif の A=攻撃 / B=防御 / C=速力
function S(id, side, country, name, atk, def, spd, type, file, opts={}){
  return Object.assign({ id, side, country, name, atk, def, spd, type, file }, opts);
}

const SHIPS = [
  // ===== 英国 (UK) =====
  S('uk_nelson',     'allies','UK','Nelson',         5,5,3,'BB','イギリス/553_nelson.gif'),
  S('uk_rodney',     'allies','UK','Rodney',         5,5,3,'BB','イギリス/553_rodney.gif'),
  S('uk_hood',       'allies','UK','Hood',           4,4,7,'BC','イギリス/447_hood.gif'),
  S('uk_renown',     'allies','UK','Renown',         3,3,6,'BC','イギリス/336_renown.gif'),
  S('uk_repulse',    'allies','UK','Repulse',        3,3,6,'BC','イギリス/336_repulse.gif'),
  S('uk_warspite',   'allies','UK','Warspite',       4,4,4,'BB','イギリス/444_warspite.gif'),
  S('uk_valiant',    'allies','UK','Valiant',        4,4,4,'BB','イギリス/444_valiant.gif'),
  S('uk_queeneliz',  'allies','UK','QueenElizabeth', 4,4,4,'BB','イギリス/444_queeneliz.gif'),
  S('uk_barham',     'allies','UK','Barham',         4,4,4,'BB','イギリス/444_barham.gif'),
  S('uk_malaya',     'allies','UK','Malaya',         4,4,4,'BB','イギリス/444_malaya.gif'),
  S('uk_ramillies',  'allies','UK','Ramillies',      4,4,3,'BB','イギリス/443_ramillies.gif'),
  S('uk_resolution', 'allies','UK','Resolution',     4,4,3,'BB','イギリス/443_resolution.gif'),
  S('uk_revenge',    'allies','UK','Revenge',        4,4,3,'BB','イギリス/443_revenge.gif'),
  S('uk_royaloak',   'allies','UK','RoyalOak',       4,4,3,'BB','イギリス/443_royaloak.gif'),
  S('uk_royalsov',   'allies','UK','RoyalSovereign', 4,4,3,'BB','イギリス/443_royalsov.gif'),
  S('uk_pow',        'allies','UK','PrinceOfWales',  4,5,6,'BB','イギリス/456_princeofwales.gif',{ enterTurn:2 }),
  S('uk_kgv',        'allies','UK','KingGeorgeV',    4,5,6,'BB','イギリス/456_kinggeorgev.gif',{ enterTurn:2 }),
  S('uk_dukeofyork', 'allies','UK','DukeOfYork',     4,5,6,'BB','イギリス/456_dukeofyork.gif',{ enterTurn:3 }),
  S('uk_anson',      'allies','UK','Anson',          4,5,6,'BB','イギリス/456_anson.gif',{ enterTurn:4 }),
  S('uk_howe',       'allies','UK','Howe',           4,5,6,'BB','イギリス/456_howe.gif',{ enterTurn:5 }),
  S('uk_arkroyal',   'allies','UK','ArkRoyal',       0,2,7,'CV','イギリス/027_arkroyal.gif'),
  S('uk_formidable', 'allies','UK','Formidable',     0,2,7,'CV','イギリス/027_formidable.gif'),
  S('uk_victorious', 'allies','UK','Victorious',     0,2,7,'CV','イギリス/027_victorious.gif',{ enterTurn:3 }),
  S('uk_illustrious27','allies','UK','Illustrious',  0,2,7,'CV','イギリス/027_illustrious.gif'),
  S('uk_illustrious16','allies','UK','Illustrious',  0,1,6,'CV','イギリス/016_illustrious.gif',{ enterTurn:5 }),
  S('uk_courageous', 'allies','UK','Courageous',     0,1,6,'CV','イギリス/016_courageous.gif'),
  S('uk_glorious',   'allies','UK','Glorious',       0,1,6,'CV','イギリス/016_glorious.gif'),
  S('uk_eagle',      'allies','UK','Eagle',          1,2,4,'CV','イギリス/124_eagle.gif'),
  S('uk_norfolk',    'allies','UK','Norfolk',        1,1,7,'CA','イギリス/117_norfolk.gif'),
  S('uk_suffolk',    'allies','UK','Suffolk',        1,1,7,'CA','イギリス/117_suffolk.gif'),
  S('uk_kent',       'allies','UK','Kent',           1,1,7,'CA','イギリス/117_kent.gif'),
  S('uk_sussex',     'allies','UK','Sussex',         1,1,7,'CA','イギリス/117_sussex.gif'),
  S('uk_devonshire', 'allies','UK','Devonshire',     1,1,7,'CA','イギリス/117_devonshire.gif'),
  S('uk_cumberland', 'allies','UK','Cumberland',     1,1,7,'CA','イギリス/117_cumberland.gif'),
  S('uk_dorsetshire','allies','UK','Dorsetshire',    1,1,7,'CA','イギリス/117_dorsetshire.gif'),
  S('uk_exeter',     'allies','UK','Exeter',         1,1,7,'CA','イギリス/117_exeter.gif'),

  // ===== 米国 (US) =====
  S('us_washington', 'allies','US','Washington',     5,5,4,'BB','アメリカ/554_washington.gif',{ enterTurn:4 }),
  S('us_newyork',    'allies','US','NewYork',        4,4,3,'BB','アメリカ/443_newyork.gif',{ enterTurn:4 }),
  S('us_texas',      'allies','US','Texas',          4,4,3,'BB','アメリカ/443_texas.gif',{ enterTurn:4 }),
  S('us_wichita',    'allies','US','Wichita',        1,1,7,'CA','アメリカ/117_wichita.gif',{ enterTurn:4 }),
  S('us_tuscaloosa', 'allies','US','Tuscaloosa',     1,1,7,'CA','アメリカ/117_tuscaloosa.gif',{ enterTurn:4 }),
  S('us_augusta',    'allies','US','Augusta',        1,1,7,'CA','アメリカ/117_augusta.gif',{ enterTurn:4 }),
  S('us_convoy1a',   'allies','US','Convoy1A',       1,3,3,'CONVOY','アメリカ/133_convoy1a.gif',{ enterTurn:3 }),
  S('us_convoy2b',   'allies','US','Convoy2B',       1,3,3,'CONVOY','アメリカ/133_convoy2b.gif',{ enterTurn:4 }),
  S('us_convoy3c',   'allies','US','Convoy3C',       1,3,3,'CONVOY','アメリカ/133_convoy3c.gif',{ enterTurn:6 }),

  // ===== ロシア (RU) =====
  S('ru_marat',      'allies','RU','Marat',          3,3,3,'BB','ロシア/333_marat.gif',{ enterTurn:3 }),
  S('ru_oktrev',     'allies','RU','OktRevolutia',   3,3,3,'BB','ロシア/333_oktrev.gif',{ enterTurn:3 }),

  // ===== ドイツ (DE) =====
  S('de_bismarck',   'axis','DE','Bismarck',         4,9,6,'BB','ドイツ/496_bismarck.gif',{ enterTurn:2 }),
  S('de_tirpitz',    'axis','DE','Tirpitz',          4,9,6,'BB','ドイツ/496_tirpitz.gif',{ enterTurn:3 }),
  S('de_scharnhorst','axis','DE','Scharnhorst',      3,5,7,'BC','ドイツ/357_scharnhorst.gif'),
  S('de_gneisenau',  'axis','DE','Gneisenau',        3,5,7,'BC','ドイツ/357_gneisenau.gif'),
  S('de_admscheer',  'axis','DE','AdmiralScheer',    2,2,5,'PB','ドイツ/225_admscheer.gif'),
  S('de_grafspee',   'axis','DE','GrafSpee',         2,2,5,'PB','ドイツ/225_grafspee.gif'),
  S('de_lutzow',     'axis','DE','Lutzow',           2,2,5,'PB','ドイツ/225_lutzow.gif'),
  S('de_grafzep',    'axis','DE','GrafZeppelin',     1,2,8,'CV','ドイツ/128_grafzeppelin.gif',{ enterTurn:4 }),
  S('de_admhipper',  'axis','DE','AdmiralHipper',    1,2,7,'CA','ドイツ/127_admhipper.gif'),
  S('de_blucher',    'axis','DE','Blucher',          1,2,7,'CA','ドイツ/127_blucher.gif'),
  S('de_prinzeugen', 'axis','DE','PrinzEugen',       1,2,7,'CA','ドイツ/127_prinzeugen.gif',{ enterTurn:2 }),
  S('de_uboat1',     'axis','DE','U-Boat1',          1,0,0,'UBOAT','ドイツ/100_uboat.gif'),
  S('de_uboat2',     'axis','DE','U-Boat2',          1,0,0,'UBOAT','ドイツ/100_uboat.gif'),
  S('de_uboat3',     'axis','DE','U-Boat3',          1,0,0,'UBOAT','ドイツ/100_uboat.gif'),
  S('de_uboat4',     'axis','DE','U-Boat4',          1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:2 }),
  S('de_uboat5',     'axis','DE','U-Boat5',          1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:3 }),
  S('de_uboat6',     'axis','DE','U-Boat6',          1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:4 }),
  S('de_uboat7',     'axis','DE','U-Boat7',          1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:4 }),
  S('de_uboat8',     'axis','DE','U-Boat8',          1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:5 }),
  S('de_uboat9',     'axis','DE','U-Boat9',          1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:5 }),
  S('de_uboat10',    'axis','DE','U-Boat10',         1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:6 }),
  S('de_uboat11',    'axis','DE','U-Boat11',         1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:6 }),
  S('de_uboat12',    'axis','DE','U-Boat12',         1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:6 }),
  S('de_uboat13',    'axis','DE','U-Boat13',         1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:7 }),
  S('de_uboat14',    'axis','DE','U-Boat14',         1,0,0,'UBOAT','ドイツ/100_uboat.gif',{ enterTurn:8 }),

  // ===== イタリア (IT) =====
  S('it_litorio',    'axis','IT','Littorio',         4,6,6,'BB','イタリア/466_litorio.gif'),
  S('it_vitveneto',  'axis','IT','VittorioVeneto',   4,6,6,'BB','イタリア/466_vitveneto.gif'),
  S('it_impero',     'axis','IT','Impero',           4,6,6,'BB','イタリア/466_impero.gif',{ enterTurn:6 }),
  S('it_roma',       'axis','IT','Roma',             4,6,6,'BB','イタリア/466_roma.gif',{ enterTurn:7 }),
  S('it_andreadoria','axis','IT','AndreaDoria',      4,3,5,'BB','イタリア/435_andreadoria.gif'),
  S('it_caioduilio', 'axis','IT','CaioDuilio',       4,3,5,'BB','イタリア/435_caioduilio.gif'),
  S('it_contedicavour','axis','IT','ConteDiCavour',  4,3,5,'BB','イタリア/435_contedicavour.gif'),
  S('it_giuliocesare','axis','IT','GiulioCesare',    4,3,5,'BB','イタリア/435_giuliocesare.gif'),
  S('it_zara',       'axis','IT','Zara',             1,1,7,'CA','イタリア/117_zara.gif'),
  S('it_pola',       'axis','IT','Pola',             1,1,7,'CA','イタリア/117_pola.gif'),
  S('it_fiume',      'axis','IT','Fiume',            1,1,7,'CA','イタリア/117_fiume.gif'),
  S('it_gorizia',    'axis','IT','Gorizia',          1,1,7,'CA','イタリア/117_gorizia.gif'),
];
