// シナリオ.js — 聖戦士ダンバイン シナリオ定義
// ドラムロの武装は data.js の CHART_WEAPONS_DRUMLO（火焔砲＝表／剣＝オーラソード）

const SCENARIOS = {
  // 練習シナリオ
  practice: {
    id: 'practice',
    name: '練習シナリオ：ラウの海の戦い',
    description: 'ショウとマーベルのダンバインが、バーンとトッドのドラムロ部隊と遭遇。',
    mapCols: 18,
    mapRows: 18,
    maxTurn: 8,
    given: [
      { pilot: 'ショウ・ザマ', machine: 'ダンバイン A', weapons: ['オーラソード','オーラショット'], x: 3, y: 9, dir: 0 },
      { pilot: 'マーベル・フローズン', machine: 'ボゾン(マーベル用)', weapons: ['オーラソード', 'ボゾン砲', 'ガッシュ'], x: 5, y: 9, dir: 0 },
    ],
    drake: [
      { pilot: 'バーン・バニングス', machine: 'ビランビー', weapons: ['オーラソード','オーラショット'], x: 4, y: 2, dir: 3 },
      { pilot: 'トッド・ギネス', machine: 'ドラムロ A', weapons: [...CHART_WEAPONS_DRUMLO], x: 6, y: 2, dir: 3 },
    ],
    victory: {
      given: '敵を全滅させる',
      drake: '敵を全滅させる',
    },
  },

  // キャンペーンシナリオ（campaign.htmlから使用）
  campaign1: {
    id: 'campaign1',
    name: 'キャンペーン：ラース・ワウの攻防',
    description: 'ドレイク軍がラース・ワウに進撃。ギブン家の防衛戦。',
    mapCols: 30,
    mapRows: 30,
    maxTurn: 15,
    given: [
      { pilot: 'ショウ・ザマ', machine: 'ダンバイン A', weapons: ['オーラソード','オーラショット'], x: 15, y: 25, dir: 0 },
      { pilot: 'マーベル・フローズン', machine: 'ボゾン(マーベル用)', weapons: ['オーラソード', 'ボゾン砲', 'ガッシュ'], x: 13, y: 26, dir: 0 },
      { pilot: 'ニー・ギブン', machine: 'ボチューン A', weapons: ['オーラソード','オーラショット'], x: 17, y: 26, dir: 0 },
    ],
    drake: [
      { pilot: 'バーン・バニングス', machine: 'ビランビー', weapons: ['オーラソード','オーラショット'], x: 14, y: 4, dir: 3 },
      { pilot: 'トッド・ギネス', machine: 'ドラムロ A', weapons: [...CHART_WEAPONS_DRUMLO], x: 16, y: 4, dir: 3 },
      { pilot: 'ガラリア・ニャムヒー', machine: 'バストール A', weapons: ['オーラソード','オーラショット'], x: 15, y: 3, dir: 3 },
      { pilot: '一般兵', machine: 'ドラムロ B', weapons: [...CHART_WEAPONS_DRUMLO], x: 13, y: 5, dir: 3 },
    ],
    victory: {
      given: '8ターン経過時にギブン軍ユニットが1体以上生存',
      drake: 'ギブン軍を全滅させる',
    },
  },

  campaign_musou: {
    id: 'campaign_musou',
    name: 'キャンペーン：ダンバイン無双',
    description: 'ショウのダンバイン1機が、一般兵（オーラ力3）搭乗のドラムロBと相対。初戦は敵1機、勝つたびに敵が1機ずつ増え最大100機まで勝ち進み（敗北・引き分けでその回終了）。最高連続勝ち抜きはキャンペーン画面に記録表示。',
    mapCols: 40,
    mapRows: 36,
    maxTurn: 99,
    musou: true,
    given: [
      { pilot: 'ショウ・ザマ', machine: 'ダンバイン A', weapons: ['オーラソード', 'オーラショット'], x: 19, y: 31, dir: 0 },
    ],
    drake: [],
    victory: {
      given: '敵ドラムロBを全滅',
      drake: 'ショウを撃破',
    },
  },

  /** 1on1を8連戦。index.html が gauntletBosses と sessionStorage で各戦を組み立てる */
  campaign_gauntlet: {
    id: 'campaign_gauntlet',
    name: 'キャンペーン：宿敵連戦（8番勝負）',
    description: 'ショウのダンバイン対ドレイク側の名パイロットを、1機ずつ8戦連続。勝てば次戦へ（敗北・引き分けで終了）。操作側もQ学習対象（qlLearnPlayerSide）。観戦では8戦を連続実行してデータを溜められる。',
    gauntlet: true,
    qlLearnPlayerSide: true,
    mapCols: 14,
    mapRows: 14,
    maxTurn: 22,
    given: [],
    drake: [],
    gauntletBosses: [
      { pilot: 'マーベル・フローズン', machine: 'ダーナオシー A', weapons: ['オーラソード', 'オーラショット'] },
      { pilot: 'バーン・バニングス', machine: 'ドラムロ A', weapons: [...CHART_WEAPONS_DRUMLO] },
      { pilot: 'ガラリア・ニャムヒー', machine: 'バストール A', weapons: ['オーラソード', 'オーラショット'] },
      { pilot: 'ジェリル・クチビ', machine: 'レプラカーン', weapons: ['オーラバルカン', 'オーラショット'] },
      { pilot: 'アレン・ブレディ', machine: 'ビランビー', weapons: ['オーラソード', 'オーラショット'] },
      { pilot: 'トッド・ギネス', machine: 'ビアレス', weapons: ['オーラバルカン', '火焔砲'] },
      { pilot: 'ミュージー・ポー', machine: 'ライネック', weapons: ['オーラバルカン', 'ミサイルランチャー'] },
      { pilot: 'バーン・バニングス', machine: 'ズワース', weapons: ['オーラソード', 'オーラショット'] },
    ],
    victory: {
      given: '8戦勝ち抜き',
      drake: '8戦勝ち抜き',
    },
  },
};

/**
 * ダンバイン無双：ドラムロB×count をマップ上部にグリッド配置（一般兵・オーラ力は PILOTS または未定義名フォールバックで3）
 */
function buildMusouDrakeDefinitions(count, mapCols, mapRows, playerY) {
  const n = Math.max(1, Math.min(100, Math.floor(Number(count)) || 1));
  const py = playerY != null ? playerY : mapRows - 5;
  const maxEnemyY = Math.max(2, py - 7);
  const perRow = Math.max(1, mapCols - 4);
  const defs = [];
  for (let i = 0; i < n; i++) {
    const c = i % perRow;
    const r = Math.floor(i / perRow);
    const x = 2 + c;
    const y = 2 + r;
    if (y > maxEnemyY) break;
    defs.push({
      pilot: '一般兵 #' + (i + 1),
      machine: 'ドラムロ B',
      weapons: [...CHART_WEAPONS_DRUMLO],
      x,
      y,
      dir: 3,
    });
  }
  return defs;
}

function getScenario(id) {
  return SCENARIOS[id] || SCENARIOS.practice;
}
