'use strict';

// Counter values and placement codes transcribed from the printed fronts.
// [front, back, designation, starting hex / reinforcement group, attack, transport, mechanized]
const germanCounters = [
  [3,21,'1 SS','3008',4,2,1], [4,20,'2 SS','R1',4,2,1], [5,19,'9 SS','R1',4,2,1],
  [6,18,'12 SS','3004',4,2,1], [7,17,'Lehr','2715',3,2,1], [8,16,'2 PzD','2514',3,2,1],
  [9,15,'9 PzD','R2',3,2,1], [10,14,'116 PzD','2712',3,2,1], [11,13,'Fuh','R1',3,2,1],
  [43,61,'3 PGD','R1',2,2,1], [44,60,'15 PGD','R2',2,2,1], [45,59,'9 VG','R2',2,1,0],
  [46,58,'12 VG','2707',2,1,0], [47,57,'18 VG','2910',2,1,0], [48,56,'26 VG','2416',2,1,0],
  [49,55,'62 VG','2711',2,1,0], [50,54,'79 VG','R2',2,1,0], [51,53,'89 VG','3002',2,1,0],
  [83,101,'167 VG','R2',2,1,0], [84,100,'212 VG','3021',2,1,0], [85,99,'246 VG','R1',2,1,0],
  [86,98,'272 VG','2903',2,1,0], [87,97,'276 VG','2919',2,1,0], [88,96,'277 VG','2706',2,1,0],
  [89,95,'326 VG','2705',2,1,0], [90,94,'3 FJD','2908',2,1,0], [91,93,'5 FJD','2617',2,1,0],
  [123,141,'340 VG','R3',2,1,0], [124,140,'352 VG','2718',2,1,0], [125,139,'560 VG','2513',2,1,0],
];
const alliedCounters = [
  [13,11,'2 AD','R3',3,3,1], [14,10,'3 AD','R2',3,3,1], [15,9,'4 AD','R3',3,2,1],
  [16,8,'6 AD','R4',3,2,1], [17,7,'7 AD','R1',3,2,1], [18,null,'9 AD','2410',3,2,1],
  [19,5,'10 AD','R1',3,2,1], [20,4,'11 AD','R4',3,2,1], [21,3,'106 ID','2710',3,2,0],
  [53,51,'82 AbnD','R1',4,1,0], [54,50,'101 AbnD','R1',4,1,0], [55,49,'1 ID','R1',3,2,0],
  [56,48,'2 ID','2704',3,2,0], [57,47,'4 ID','2319',3,2,0], [58,46,'5 ID','R3',3,2,0],
  [59,45,'9 ID','R2',3,2,0], [60,44,'26 ID','R3',3,2,0], [61,43,'28 ID','2314',3,2,0],
  [93,91,'30 ID','R1',3,2,0], [94,90,'35 ID','R4',3,2,0], [95,89,'75 ID','R3',3,2,0],
  [96,88,'78 ID','2802',3,2,0], [97,87,'80 ID','R3',3,2,0], [98,86,'GD','RS',3,3,1],
  [99,85,'43 ID','RS',3,2,0], [100,84,'51 ID','RS',3,2,0], [101,83,'53 ID','RS',3,2,0],
  [133,131,'83 ID','R4',3,2,0], [134,130,'84 ID','R2',3,2,0], [135,129,'99 ID','2607',3,2,0],
];

const marker = (label, kind, image, count, extra = {}) => ({ label, kind, image, count, ...extra });
const germanChits = {
  'g-arty': marker('砲兵支援','artillery',174,6,{ discard: true }),
  'g-tiger': marker('タイガー大隊','tank',213,2,{ shift: 2, at: true }),
  'g-panther': marker('パンター大隊','tank',215,7,{ shift: 1, at: true }),
  'g-tank': marker('戦車大隊','tank',256,6,{ shift: 1 }),
  'g-assault': marker('突撃砲大隊','tank',261,3,{ shift: 1 }),
  'g-trojan': marker('トロイの木馬旅団','tank',253,1,{ shift: 1, at: true, move: 'ignoreZoc' }),
  'g-peiper': marker('パイパー連隊','tank',293,1,{ shift: 1, at: true }),
  'g-barkmann': marker('バルクマン軍曹','tank',294,1,{ shift: 1, at: true, denyAT: true }),
  'g-destroyer': marker('重駆逐大隊','tank',295,2,{ at: true }),
  'g-217': marker('第217大隊','tank',297,1,{ shift: 2 }),
  'g-flak': marker('高射砲大隊','airDefense',298,1),
  'g-halftrack': marker('ハーフトラック','movement',299,4,{ move: 'carry' }),
  'g-recon': marker('索敵大隊','movement',335,3,{ move: 'reaction', discard: true }),
  'g-goliath': marker('第301ゴリアテ大隊','engineer',336,1,{ breakFort: true, discard: true }),
  'g-infiltrate': marker('浸透移動','special',337,2,{ move: 'infiltrate', discard: true }),
  'g-nuts': marker('俺のケツを舐めろ','damage',339,1,{ absorb: 2, inflict: 2, discard: true }),
  'g-cross': marker('騎士十字章','damage',340,1,{ absorb: 1, inflict: 1, discard: true }),
  'g-dummy': marker('ダミー','dummy',374,6),
  'g-engineer': marker('工兵大隊','engineer',379,3,{ move: 'river', discard: true }),
  'g-haite': marker('ハイテ連隊','event',413,1,{ event: 'haite' }),
  'g-depot': marker('集積所','event',414,1,{ event: 'depot' }),
  'g-capture': marker('物資捕獲','event',415,1,{ event: 'capture' }),
  'g-fear': marker('恐怖の奔流','event',416,3,{ event: 'fear' }),
  'g-nordwind': marker('ノルトヴィント作戦','event',419,1,{ event: 'nordwind' }),
  'g-greif': marker('グライフ作戦','event',420,1,{ event: 'greif' }),
  'g-bodenplatte': marker('ボーデンプラッテ作戦','event',421,1,{ event: 'bodenplatte' }),
};
const alliedChits = {
  'a-arty': marker('砲兵支援','artillery',168,12,{ discard: true }),
  'a-star': marker('シルバースター勲章','damage',209,1,{ absorb: 1, inflict: 1, discard: true }),
  'a-engineer': marker('工兵大隊','engineer',210,1,{ move: 'river', discard: true }),
  'a-recon': marker('偵察大隊','movement',211,1,{ move: 'reaction', discard: true }),
  'a-ration': marker('Kレーション','ration',243,6,{ discard: true }),
  'a-sanders': marker('サンダース軍曹','dice',248,1,{ dieAdd: 3, discard: true }),
  'a-nuts': marker('ナッツ!!','damage',249,1,{ absorb: 2, inflict: 2, discard: true }),
  'a-ranger': marker('第99ノルウェー大隊／第2レンジャー大隊','engineer',250,2,{ move: 'terrain', discard: true }),
  'a-tank': marker('戦車大隊','tank',283,10,{ shift: 1 }),
  'a-royal': marker('王室戦車連隊','tank',324,1,{ shift: 1, at: true }),
  'a-761': marker('第761黒人戦車大隊','tank',325,1,{ shift: 2 }),
  'a-destroyer': marker('駆逐戦車大隊','tank',326,2,{ at: true }),
  'a-fort': marker('要塞化','fort',328,4),
  'a-dummy': marker('ダミー','dummy',368,6),
  'a-air': marker('空軍支援','event',369,3,{ event: 'air' }),
  'a-monty': marker('モンティの許可','event',403,1,{ event: 'monty' }),
  'a-patton': marker('パットンの救援','event',404,1,{ event: 'patton' }),
  'a-highbeam': marker('ハイビーム行軍','event',405,1,{ event: 'highbeam' }),
  'a-vt': marker('VT信管解禁','event',406,1,{ event: 'vt' }),
  'a-bridge': marker('橋梁爆破','event',407,5,{ event: 'bridge' }),
  'a-cavalry': marker('騎兵連隊','event',411,1,{ event: 'cavalry' }),
};

const combatChitTiming = '攻撃・反撃フェイズ';
const movementChitTiming = '自軍の移動・対応移動フェイズ';
const engineerGuide = {
  when: `${movementChitTiming}、攻撃・反撃フェイズ`,
  effects: [
    '渡河支援では移動中の河川による停止を免れる。森林など、河川以外の地形効果は受ける。',
    '橋梁修復では、通常移動で爆破された橋のヘクスに入り、移動終了時に爆破チットを取り除く。',
    '河川ヘクスからの攻撃では、この部隊が戦車系チットと砲兵支援を使用できる。工兵を含めて1部隊3枚まで。',
  ],
};
const reconGuide = {
  when: movementChitTiming,
  effects: [
    '対応移動では、敵のZOC（支配地域）内にいる部隊が対応移動を開始できる。',
    '移動支援に選ぶと、出発時と到着時に隣接する敵部隊の支援チットを公開する。',
  ],
};
const chitGuide = {
  tank: {
    when: combatChitTiming,
    effects: ['この戦闘で有効だったチットを1枚取り除き、配属先の部隊の損害を1点軽減できる。使用制限を受けた戦闘では、この軽減もできない。'],
  },
  artillery: {
    when: combatChitTiming,
    effects: [
      '1戦闘につき各軍1枚まで。片側だけが使用した場合、その側がダイスの出目を選ぶ。両軍が使った場合は通常どおりダイスを振る。',
      '尾根・要塞など、地形の効果で使えない場合がある。',
    ],
  },
  damage: {
    when: combatChitTiming,
    effects: ['複数部隊が参加する戦闘では、参加部隊の損害判定に適用する。'],
  },
  dice: {when: combatChitTiming},
  dummy: {
    when: '初期配置・支援チット取得・戦闘',
    effects: [
      '各軍6枚。補給ポイントを使わずに配属できる。盤上では通常の支援チットと同じく輸送枚数に数える。',
      '戦闘に出しても効果はなく、公開されると手元に戻る。支援チット取得や自軍の移動・対応移動の開始時にも取り外せる。',
    ],
  },
  'g-engineer': engineerGuide,
  'a-engineer': engineerGuide,
  'g-recon': reconGuide,
  'a-recon': reconGuide,
  'a-arty': {effects: ['VT信管解禁後はドイツ軍の損害を1点増やす。両軍の砲兵で出目の操作が相殺されても、追加損害は適用する。']},
  'g-trojan': {
    when: `${combatChitTiming}、${movementChitTiming}`,
    effects: [
      '公開前に一度だけ、敵ZOCに入っても停止せず進める。機械化移動との併用は不可。',
      '移動・戦闘・敵の偵察で公開された後は、戦車系チットとして使える。',
    ],
  },
  'g-peiper': {
    when: `${combatChitTiming}、${movementChitTiming}`,
    effects: [
      '移動力5で移動した直後、配属先の部隊だけで隣接する敵を攻撃できる。戦闘後も通常状態なら、さらに移動力5で移動できる。機械化移動との併用は不可。',
      '対応移動の開始時に敵と隣接していれば、最初の移動を省いて単独攻撃する。ZOCを及ぼしていた敵を除去し、通常状態なら再移動できる。',
      '移動・対応移動の後の攻撃・反撃フェイズにも、ほかの部隊と一緒に攻撃できる。',
    ],
  },
  'g-halftrack': {
    when: movementChitTiming,
    effects: ['移動中の輸送制限を緩和し、森林・尾根を道路外で通っても支援チットを保持できる。尾根や河川による移動停止は通常どおり。'],
  },
  'g-goliath': {
    when: 'ドイツ軍の攻撃・反撃フェイズ',
    effects: ['攻撃先で連合軍が「要塞化」を使用した場合、その効果をこの部隊に対して無効化する。この部隊は他の制限がなければ戦車系チットや砲兵支援を使える。'],
  },
  'g-infiltrate': {
    when: movementChitTiming,
    effects: ['開始時にダイスを1個振る。1〜5ならその数を移動力として、敵ZOCと地形効果を無視して移動する。6なら移動できない。',
      '機械化移動との併用は不可。チットは移動中の輸送枚数に数え、使用後に捨てる。'],
  },
  'g-flak': {
    when: '連合軍のイベント解決フェイズ',
    effects: ['配属先が「空軍支援」の対象になると、その効果を無効にする。高射砲大隊は部隊に残り、再使用できる。'],
  },
  'a-ranger': {
    when: `${movementChitTiming}、攻撃・反撃フェイズ`,
    effects: [
      '移動支援では地形による移動制限を無視する。機械化移動との併用は不可。',
      '攻撃時は河川・尾根・要塞による戦車系チットと砲兵支援の使用制限を、この部隊に限り解除する。',
    ],
  },
  'a-fort': {
    when: '攻撃・反撃フェイズの防御時',
    effects: ['部隊のいるヘクスを要塞化し、敵の戦車系チットと砲兵支援を無効にする。',
      '第301ゴリアテ大隊はこの効果を打ち消せる。要塞化した部隊が移動すると、チットを取り除く。'],
  },
  'a-ration': {
    when: '連合軍の移動・対応移動・攻撃・反撃フェイズ',
    effects: ['配属先の混乱部隊を、補給ポイントを消費せず表に戻す。回復した部隊は同じフェイズに行動できる。'],
  },
  'a-air': {effects: [
    '都市にいるか連合軍に隣接するドイツ軍部隊1個を選ぶ。混乱させるか、その部隊の支援チットをすべて取り除く。',
    '混乱による部隊の除去は行わない。高射砲大隊で無効化される。',
  ]},
  'a-monty': {effects: ['特別増援の英軍4部隊が以後移動可能になる。英軍の登場は特別増援の補給チットで行う。']},
  'a-patton': {effects: ['次に登場する米軍増援1グループを今ターンに繰り上げる。通常増援も予定されていれば2グループが登場する。']},
  'a-highbeam': {effects: ['次に登場する米軍増援が、配置した直後に移動できる。条件を満たせば機械化移動も可能。']},
  'a-vt': {effects: ['ゲーム終了まで、連合軍の砲兵支援を使った戦闘でドイツ軍の損害が1点増える。両軍の砲兵が出目の操作を相殺しても有効。']},
  'a-bridge': {effects: ['連合軍の連絡線が通る道路付き河川ヘクスに置く。道路が途切れ、部隊は進入時に停止する。工兵大隊で修復できる。']},
  'a-cavalry': {effects: ['連合軍の連絡線上に移動力0・戦闘力1の駒を置く。単独でも防御でき、ZOCを持つ。', '味方部隊と重なると防御力に1を加える。騎兵連隊を除去して防御側の損害を1点受け持てる。除去したチットはカップへ戻る。']},
  'g-haite': {effects: ['連合軍部隊や連合軍補給源のないヘクスに移動力0・戦闘力1の駒を置く。ZOCを持ち、防御時に同じヘクスの部隊を支援する。除去後はゲームから外す。']},
  'g-depot': {effects: ['スパ（2005）に集積所を置く。スパを支配している間、ドイツ軍が取得する補給ポイントが毎ターン3増える。']},
  'g-capture': {effects: ['取得時に保留した支援チットを、イベント解決で補給切れのドイツ軍1部隊にまとめて配属する。部隊は補給切れのまま。対象がいなければ保留分は戻る。']},
  'g-fear': {effects: ['都市の外にいて補給切れの連合軍部隊1個を選び、直ちに除去する。処理後はカップへ戻る。']},
  'g-nordwind': {effects: ['次に予定される米軍の通常増援1グループを延期する。先に「パットンの救援」で米軍増援が発生した場合は、その登場を取り消す。']},
  'g-greif': {effects: ['このドイツ軍ターンの連合軍対応移動をすべて止める。']},
  'g-bodenplatte': {effects: ['次のターンとその次のターンの連合軍「空軍支援」を無効にする。引いた空軍支援は補給ポイントを消費する。']},
};

const BulgeData = {
  counters: { german: germanCounters, allied: alliedCounters },
  counterArt: {
    // 9 AD uses the 7 AD artwork. Its unit ID and 3–2–5 values are independent of the art.
    a18: {front: 'assets/allied-17.jpg', back: 'assets/allied-back-7.jpg'},
  },
  chits: { ...germanChits, ...alliedChits },
  chitGuide,
  supply: {
    german: [[12],[12],[12],[6],[6],[6],[6,'normal'],[0,'normal'],[0,'normal']],
    allied: [[15],[15],[6],[6],[3,'normal'],[3,'normal'],[3,'normal'],[3,'normal'],[6,'special']],
  },
  sources: {
    german: ['3002','3003','3004','3006','3008','3011','3012','3013','3014','3015','3017','3021'],
    allied: ['0103','0105','0111','0113','0116','0118','0121','0503','0521','0721','0805','1121',
      '1301','1721','1801','2121','2201','2321','2521','2601'],
  },
  protectedSources: ['0103','0503','1801','2201','2601','0521','0721','1121','1721','2121','2321','2521'],
  cities: { '0105':'Namur','0111':'Dinant','0805':'Huy','1301':'Liege','1716':'Bastogne','1803':'Verviers','2005':'Spa','2410':'St.Vith' },
  depotHex: '2005',
  siegfried: ['2501','2602','2603','2604','2704','2705','2706','2707','2708','2709','2710','2711',
    '2612','2512','2513','2514','2515','2516','2617','2618','2718','2819','2919','3020','3021'],
  borderColumn: [25,26,26,27,27,27,27,27,27,27,27,25,25,25,25,25,26,27,29,30,30],
  victoryCities: ['1301','0805','0105','0111'],
  crtColumns: ['1:3','1:2','1:1','2:1','3:1','5:1'],
  // Indexed by die (1–6), then by column from 1:3 to 5:1.
  crt: [
    ['A1','A1','A1','A1','NE','A1D1'],
    ['A1','A1','A1','NE','A1D1','D1'],
    ['A1','A1','NE','A1D1','D1','A1D2'],
    ['A1','A1','A1D1','D1','A1D2','D2'],
    ['A1','NE','D1','A1D2','D2','A1D3'],
    ['NE','A1D1','A1D2','D2','A1D3','D3'],
  ],
};
