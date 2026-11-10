'use strict';

const Campaign = (() => {
  const factions = {
    cao: { name: '曹操軍', color: '#3a79a9', base: 'xu', total: 31 },
    lu: { name: '呂布軍', color: '#505357', base: 'xuzhou', total: 8 },
    shu: { name: '袁術軍', color: '#a95817', base: 'shouchun', total: 9 },
    shao: { name: '袁紹軍', color: '#887013', base: 'ji', total: 23, track: 3 },
    biao: { name: '劉表軍', color: '#337b4e', base: 'jing', total: 9, track: 10 },
    sun: { name: '孫権軍', color: '#77509a', base: 'jianye', total: 9, track: 10 },
    liu: { name: '劉備軍', color: '#a33b37', base: 'xiakou', total: 8, track: 10 },
  };
  const areas = Object.fromEntries([
    ['bing', '并州', 194, 270, 'shao', 1],
    ['you', '幽州', 573, 113, 'shao', 1],
    ['ji', '冀州', 554, 388, 'shao', 1],
    ['qing', '青州', 1002, 559, 'shao', 1],
    ['ye', '鄴', 539, 627, 'shao', 19],
    ['luoyang', '洛陽', 199, 997, 'cao', 3],
    ['yan', '兗州', 487, 928, 'cao', 3],
    ['dingtao', '定陶', 699, 825, 'cao', 3],
    ['xu', '許都', 378, 1237, 'cao', 2],
    ['yu', '豫州', 618, 1237, 'shu', 1],
    ['xuzhou', '徐州', 1033, 1085, 'lu', 8],
    ['shouchun', '寿春', 810, 1411, 'shu', 8],
    ['yang', '揚州', 808, 1686, 'sun', 1],
    ['jianye', '建業', 1101, 1519, 'sun', 8],
    ['jing', '荊州', 257, 1477, 'biao', 8],
    ['jiangling', '江陵', 142, 1698, 'biao', 1],
    ['xiakou', '夏口', 409, 1744, 'liu', 5],
  ].map(([id, name, x, y, faction, troops]) => [id, { id, name, x, y, faction, troops }]));
  const mainRoads = [
    ['bing', 'ji'], ['you', 'ji'], ['qing', 'ji'], ['ji', 'ye'], ['ye', 'yan'],
    ['luoyang', 'yan'], ['yan', 'dingtao'], ['dingtao', 'xuzhou'], ['yan', 'xu'],
    ['xu', 'yu'], ['xu', 'jing'], ['yu', 'shouchun'], ['shouchun', 'yang'],
    ['yang', 'jianye'], ['jing', 'jiangling'], ['jiangling', 'xiakou'],
  ];
  const minorRoads = [
    ['ye', 'dingtao'], ['qing', 'dingtao'], ['qing', 'xuzhou'], ['dingtao', 'yu'],
    ['yan', 'yu'], ['luoyang', 'xu'], ['yu', 'xuzhou'], ['shouchun', 'xuzhou'],
    ['xiakou', 'yang'],
  ];
  const capitals = ['ji', 'bing', 'you', 'qing'];
  const leaders = Object.fromEntries([
    ['cao', '曹操', 'cao', 2, 1, null, 1],
    ['dun', '夏侯惇', 'cao', 2, 1, null, 5],
    ['yuan', '夏侯淵', 'cao', 2, 1, null, 6],
    ['ren', '曹仁', 'cao', 2, 1, null, 7],
    ['hong', '曹洪', 'cao', 2, 1, null, 8],
    ['lu', '呂布', 'lu', 5, 1, 'xuzhou', 3],
    ['shu', '袁術', 'shu', 2, 1, 'shouchun', 2],
    ['shao', '袁紹', 'shao', 2, 1, 'ye', 9],
    ['biao', '劉表', 'biao', 2, 0, 'jing', 10],
    ['sun', '孫権', 'sun', 2, 1, 'jianye', 11],
    ['liu', '劉備', 'liu', 2, 1, 'xiakou', 13],
    ['zhu', '諸葛亮', 'liu', null, 3, 'track', 16],
  ].map(([id, name, faction, valor, intel, start, image]) => [
    id, { id, name, faction, valor, intel, start, image },
  ]));
  const setupSlots = ['xu', 'xu', 'dingtao', 'luoyang', 'yan'];
  const defaultSetup = ['cao', 'dun', 'ren', 'yuan', 'hong'];
  const caoLeaders = Object.keys(leaders).filter(id => leaders[id].faction === 'cao');
  const cards = Object.fromEntries([
    ['cao', '曹操', 1, '曹操を武勇値2／知略値2で行動させるか、曹操軍の将軍1人を選んで行動させます。'],
    ['shu', '袁術', 2, '袁術が行軍または戦闘し、補充します。'],
    ['lu', '呂布', 3, '呂布が行軍または戦闘し、補充します。'],
    ['emperor', '献帝', 4, '直前の有効な天命札を再処理します。その後、任意の曹操軍勢を解散でき、山札を切り直します。山札の1枚目では効果がありません。'],
    ['dun', '夏侯惇', 5, '夏侯惇が行動します。この札で戦闘すると、敵への損害を1増やせます。'],
    ['yuan', '夏侯淵', 6, '夏侯淵が行動します。この札で行軍した軍勢は、移動先で続けて戦闘できます。'],
    ['ren', '曹仁', 7, '曹仁が行動します。この札で補充すると、3駒を補充できます。'],
    ['hong', '曹洪', 8, '曹洪が行動します。この札で戦闘すると、受ける損害を1減らせます。'],
    ['shao', '袁紹', 9, '参戦マーカーを進めます。参戦済みなら行軍または戦闘し、州都の数に応じて補充します。'],
    ['biao', '劉表', 10, '参戦マーカーを進めます。参戦済みなら行軍または戦闘し、補充します。'],
    ['sun', '孫権', 11, '参戦マーカーを進めます。参戦済みなら行軍または戦闘し、補充します。'],
    ['zhou', '周瑜＊', 12, '孫権が武勇値3／知略値2で行軍または戦闘し、補充します。'],
    ['liu', '劉備', 13, '参戦マーカーを進めます。参戦済みなら行軍または戦闘し、補充します。'],
    ['guan', '関羽＊', 14, '劉備が武勇値5で行軍または戦闘し、補充します。'],
    ['zhang', '張飛＊', 15, '劉備が武勇値4で行軍または戦闘し、補充します。'],
    ['zhu', '諸葛亮＊', 16, '孔明出蘆を1段進めます。諸葛亮が盤上にいる場合は天下三分之計を実行します。'],
  ].map(([id, name, image, description]) => [id, { id, name, image, description }]));
  const extras = { liu: ['guan', 'zhang', 'zhu'], sun: ['zhou'] };
  const initialCards = Object.keys(cards).filter(id => !Object.values(extras).flat().includes(id));
  const combatTables = {
    2: [
      '0 0 0 0 0 0 0 0 0 1 1 2 3 3 4', '0 0 0 0 0 0 0 1 1 2 2 3 3 4 5',
      '0 0 0 1 1 1 1 2 2 3 3 4 4 5 6', '0 0 1 1 1 1 2 2 3 4 4 5 5 6 7',
      '0 0 1 1 1 2 2 3 3 4 5 5 6 7 8', '0 1 1 1 2 2 3 3 4 4 5 6 7 8 9',
      '1 1 1 2 2 2 3 4 5 5 6 7 7 9 10', '1 1 1 2 2 3 3 4 5 6 7 7 8 10 11',
      '1 1 2 2 2 3 4 5 6 7 8 8 9 11 13', '1 2 2 2 3 4 5 6 7 8 9 9 10 12 15',
      '1 2 2 3 4 5 6 7 8 9 9 10 12 14 18',
    ],
    3: [
      '0 0 0 0 0 0 0 1', '0 0 0 0 0 1 1 2', '0 0 1 1 1 2 2 3', '0 1 1 1 2 2 3 4',
      '0 1 1 2 2 2 3 4', '1 1 2 2 3 3 4 5', '1 1 2 2 3 3 5 6', '1 1 2 3 3 4 5 6',
      '1 2 2 3 4 5 6 7', '1 2 2 4 4 6 7 8', '1 2 3 4 5 6 8 9',
    ],
    4: [
      '0 0 0 0 0 1 2 2', '0 0 0 1 1 1 2 3', '0 1 1 2 2 2 3 4', '0 1 2 2 3 3 4 5',
      '1 1 2 2 3 4 5 6', '1 1 2 3 3 4 5 7', '1 2 2 3 4 5 6 8', '1 2 3 3 4 5 7 8',
      '1 2 3 4 5 5 8 9', '1 2 3 4 5 6 8 10', '1 3 3 4 5 6 8 10',
    ],
    5: [
      '0 0 0 0 1 2 3 4', '0 1 1 1 2 3 4 5', '0 1 2 2 2 3 5 6', '1 1 2 3 3 4 5 7',
      '1 1 2 3 4 5 6 8', '1 2 3 4 5 5 7 9', '1 2 3 4 5 6 8 9', '1 2 3 4 5 6 8 10',
      '1 2 3 4 5 6 8 10', '1 2 3 4 5 6 8 10', '1 2 3 4 5 6 8 10',
    ],
  };
  return { factions, areas, leaders, setupSlots, defaultSetup, caoLeaders, capitals,
    cards, extras, initialCards, mainRoads, minorRoads, combatTables };
})();

if (typeof module !== 'undefined') module.exports = Campaign;
