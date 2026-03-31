// ===== シナリオ2: カーンの逆襲 - AI行動定義 =====

// 手動待ち伏せポイント（重要度: weight高=選ばれやすい）
const AMBUSH_POINTS_S2 = [
  { hexId: '0307', weight: 3 },
  { hexId: '0406', weight: 1 },
  { hexId: '0407', weight: 1 },
  { hexId: '0702', weight: 3 },
  { hexId: '0705', weight: 3 },
  { hexId: '0804', weight: 1 },
  { hexId: '0904', weight: 2 },
  { hexId: '0805', weight: 2 },
  { hexId: '1203', weight: 1 },
  { hexId: '1204', weight: 3 },
  { hexId: '1304', weight: 3 },
  { hexId: '0907', weight: 1 },
  { hexId: '1008', weight: 1 },
  { hexId: '1309', weight: 2 },
  { hexId: '0607', weight: 1, infantryOnly: true },
];

// スタックごとの事前割り当て先 { stackKey → hexId }
const _aiAssignedTargets = {};

// ゲーム開始時に全スタック分の行き先を一括割り当て
function assignAmbushTargets() {
  const candidates = AMBUSH_POINTS_S2.map(p => {
    const pos = fromHexId(p.hexId);
    return { col: pos.col, row: pos.row, hexId: p.hexId, weight: p.weight, infantryOnly: p.infantryOnly || false };
  });
  window._aiAmbushCandidates = candidates;

  // スタック定義（ターン1: M4x4, M4x4, A27x4、ターン4: A22x2+Inf×2, Inf×2）
  const stackDefs = [
    { key: 'M4_0', isTank: true },
    { key: 'M4_1', isTank: true },
    { key: 'A27_0', isTank: true },
    { key: 'R4_0', isTank: true },  // 増援スタック1（A22戦車含む）
    { key: 'R4_1', isTank: false },  // 増援スタック2
  ];

  const usedHexes = new Set();
  // 初期配置ヘクスを使用済みに追加
  const initUnits = testUnits.filter(u => u.side === 'allied' && u.status !== 'eliminated' && u.type !== 'dummy');
  initUnits.forEach(u => usedHexes.add(u.hexId));

  for (const sd of stackDefs) {
    const avail = candidates.filter(c => {
      if (usedHexes.has(c.hexId)) return false;
      if (c.infantryOnly && sd.isTank) return false;
      return true;
    });
    if (avail.length === 0) continue;
    // 重み付きランダム
    const totalW = avail.reduce((s, c) => s + (c.weight || 1), 0);
    let roll = Math.random() * totalW;
    let pick = avail[avail.length - 1];
    for (const c of avail) {
      roll -= (c.weight || 1);
      if (roll <= 0) { pick = c; break; }
    }
    _aiAssignedTargets[sd.key] = pick.hexId;
    usedHexes.add(pick.hexId);
  }
  console.log('AI待ち伏せ割り当て:', JSON.stringify(_aiAssignedTargets));
}

// 初期配置候補（★★のヘクスから選択）
const INIT_PLACEMENT_CANDIDATES_S2 = [
  { hexId: '0307', weight: 1 },
  { hexId: '0702', weight: 1 },
  { hexId: '0705', weight: 1 },
  { hexId: '1204', weight: 1 },
  { hexId: '1304', weight: 1 },
];
