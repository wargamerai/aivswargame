// ===== シナリオ3: サン・メール・エグリーズ - AI行動定義 =====

// 待ち伏せポイント（連合軍防御拠点）
// A町(0506)～道路ヘクス3(1610)間の道路沿い
const AMBUSH_POINTS_S2 = [
  { hexId: '0506', weight: 3 },  // 町A
  { hexId: '0605', weight: 2 },
  { hexId: '0705', weight: 2 },
  { hexId: '0805', weight: 2 },
  { hexId: '0906', weight: 1 },
  { hexId: '1005', weight: 2 },
  { hexId: '1105', weight: 1 },
  { hexId: '1205', weight: 3 },  // 町D付近
  { hexId: '1306', weight: 2 },
  { hexId: '1406', weight: 1 },
  { hexId: '1506', weight: 2 },
  { hexId: '1508', weight: 2 },  // 町
  { hexId: '1606', weight: 1 },
];

// スタックごとの事前割り当て先（S2で定義済みの場合は上書き）
const _aiAssignedTargets = {};

// ゲーム開始時に全スタック分の行き先を一括割り当て
function assignAmbushTargets() {
  const candidates = AMBUSH_POINTS_S2.map(p => {
    const pos = fromHexId(p.hexId);
    return { col: pos.col, row: pos.row, hexId: p.hexId, weight: p.weight, infantryOnly: p.infantryOnly || false };
  });
  window._aiAmbushCandidates = candidates;

  // シナリオ3: 連合軍は初期配置済みなのでスタック割り当て不要
  // ドイツ軍は道路ヘクス1(0106)から進入するのでルート設定
  console.log('AI待ち伏せ割り当て(S3): 連合軍初期配置済み');
}

// 初期配置候補
const INIT_PLACEMENT_CANDIDATES_S2 = [
  { hexId: '0506', weight: 1 },
  { hexId: '0805', weight: 1 },
  { hexId: '1205', weight: 1 },
  { hexId: '1508', weight: 1 },
];

// ===== シナリオ3用: ドイツ軍AI方向設定 =====
// 突破目標: 道路ヘクス3 = 1610 (col=15, row=9)
const S3_BREAKTHROUGH_COL = 15;
const S3_BREAKTHROUGH_ROW = 9;

// 突破目標への距離を計算（ドイツ軍の前進度スコア）
function s3_advanceScore(col, row) {
  // 1610に近いほど高スコア
  const dist = hexDistance(col, row, S3_BREAKTHROUGH_COL, S3_BREAKTHROUGH_ROW);
  return Math.max(0, 30 - dist * 2);
}

// シナリオ3の突破判定用ヘクス
const S3_BREAKTHROUGH_HEXES = ['1610', '1609', '1710'];
