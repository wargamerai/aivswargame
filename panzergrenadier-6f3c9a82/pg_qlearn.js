// pg_qlearn.js — PG Q学習モジュール
'use strict';

// ===== パラメータ =====
const ALPHA = 0.1;    // 学習率
const GAMMA = 0.9;    // 割引率
const EPSILON_START = 0.15;
const EPSILON_END = 0.05;

// ===== 行動定義（評価関数の重みセット） =====
// stopFirePolicy: 'concentrate'=合算1目標, 'spread'=個別分散, 'split'=2+2分割
// focusTarget: 'nearest'=最寄り敵に全軍集中, 'weakest'=最弱敵に集中, 'spread'=分散攻撃
const GERMAN_ACTIONS = [
  { id:0,  westPriority:8,  enemyApproach:15, losAvoidance:10, coverBonus:5,  assaultThreshold:3.0, stopFirePolicy:'concentrate', focusTarget:'nearest' },
  { id:1,  westPriority:10, enemyApproach:20, losAvoidance:15, coverBonus:5,  assaultThreshold:3.0, stopFirePolicy:'concentrate', focusTarget:'nearest' },
  { id:2,  westPriority:12, enemyApproach:10, losAvoidance:20, coverBonus:8,  assaultThreshold:3.0, stopFirePolicy:'spread',      focusTarget:'weakest' },
  { id:3,  westPriority:15, enemyApproach:5,  losAvoidance:10, coverBonus:3,  assaultThreshold:2.5, stopFirePolicy:'concentrate', focusTarget:'nearest' },
  { id:4,  westPriority:8,  enemyApproach:25, losAvoidance:5,  coverBonus:3,  assaultThreshold:2.0, stopFirePolicy:'spread',      focusTarget:'weakest' },
  { id:5,  westPriority:10, enemyApproach:15, losAvoidance:15, coverBonus:10, assaultThreshold:3.0, stopFirePolicy:'split',        focusTarget:'spread' },
  { id:6,  westPriority:5,  enemyApproach:20, losAvoidance:20, coverBonus:8,  assaultThreshold:3.0, stopFirePolicy:'split',        focusTarget:'nearest' },
  { id:7,  westPriority:12, enemyApproach:15, losAvoidance:10, coverBonus:5,  assaultThreshold:2.5, stopFirePolicy:'spread',       focusTarget:'spread' },
  { id:8,  westPriority:10, enemyApproach:15, losAvoidance:10, coverBonus:5,  assaultThreshold:3.0, stopFirePolicy:'concentrate',  focusTarget:'weakest' },
  { id:9,  westPriority:8,  enemyApproach:20, losAvoidance:15, coverBonus:8,  assaultThreshold:2.5, stopFirePolicy:'concentrate',  focusTarget:'nearest' },
  { id:10, westPriority:15, enemyApproach:10, losAvoidance:15, coverBonus:3,  assaultThreshold:3.0, stopFirePolicy:'spread',       focusTarget:'weakest' },
  { id:11, westPriority:12, enemyApproach:25, losAvoidance:5,  coverBonus:5,  assaultThreshold:2.0, stopFirePolicy:'concentrate',  focusTarget:'nearest' },
];

const ALLIED_ACTIONS = [
  { id:0,  blockPriority:10, coverBonus:12, rangeKeep:5,  fireSpread:true,  stopFirePolicy:'concentrate' },
  { id:1,  blockPriority:15, coverBonus:8,  rangeKeep:3,  fireSpread:true,  stopFirePolicy:'concentrate' },
  { id:2,  blockPriority:8,  coverBonus:15, rangeKeep:8,  fireSpread:true,  stopFirePolicy:'spread' },
  { id:3,  blockPriority:12, coverBonus:10, rangeKeep:5,  fireSpread:false, stopFirePolicy:'split' },
  { id:4,  blockPriority:10, coverBonus:15, rangeKeep:10, fireSpread:true,  stopFirePolicy:'split' },
  { id:5,  blockPriority:15, coverBonus:12, rangeKeep:3,  fireSpread:false, stopFirePolicy:'concentrate' },
  { id:6,  blockPriority:8,  coverBonus:8,  rangeKeep:5,  fireSpread:true,  stopFirePolicy:'spread' },
  { id:7,  blockPriority:12, coverBonus:15, rangeKeep:8,  fireSpread:false, stopFirePolicy:'spread' },
  { id:8,  blockPriority:10, coverBonus:10, rangeKeep:5,  fireSpread:true,  stopFirePolicy:'split' },
  { id:9,  blockPriority:15, coverBonus:15, rangeKeep:8,  fireSpread:false, stopFirePolicy:'concentrate' },
  { id:10, blockPriority:8,  coverBonus:12, rangeKeep:3,  fireSpread:true,  stopFirePolicy:'concentrate' },
  { id:11, blockPriority:12, coverBonus:8,  rangeKeep:10, fireSpread:false, stopFirePolicy:'split' },
];

// ===== 状態エンコード =====
// 5184状態 = 6(ターン) x 6(前進度) x 4(戦力比) x 4(突破) x 3(混乱) x 3(遮蔽)
function encodeState(side, G, testUnits) {
  const alive = testUnits.filter(u => u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader');
  const ger = alive.filter(u => u.side === 'german');
  const all = alive.filter(u => u.side === 'allied');

  // ターン (1-6)
  const turnBin = Math.min(6, G.turn);

  // ドイツ前進度（平均col、5刻み）
  const avgCol = ger.length > 0
    ? ger.reduce((s, u) => s + u.col, 0) / ger.length
    : 30;
  const advanceBin = Math.min(5, Math.floor((30 - avgCol) / 5));

  // 戦力比
  const total = ger.length + all.length;
  const ratio = total > 0 ? ger.length / total : 0.5;
  const ratioBin = ratio < 0.3 ? 0 : ratio < 0.5 ? 1 : ratio < 0.7 ? 2 : 3;

  // 突破数
  const bt = G.breakthroughCount || 0;
  const btBin = bt < 1 ? 0 : bt < 3 ? 1 : bt < 5 ? 2 : 3;

  // 混乱比率
  const sideUnits = side === 'german' ? ger : all;
  const disrupted = sideUnits.filter(u => u.status === 'd' || u.status === 'dd').length;
  const dRatio = sideUnits.length > 0 ? disrupted / sideUnits.length : 0;
  const dBin = dRatio < 0.2 ? 0 : dRatio < 0.5 ? 1 : 2;

  // 遮蔽率
  const inCover = sideUnits.filter(u => {
    if (typeof getHexTerrain === 'function') {
      const t = getHexTerrain(u.hexId);
      return t === 'f' || t === 'w' || t === 't' || t === 'c';
    }
    return false;
  }).length;
  const cRatio = sideUnits.length > 0 ? inCover / sideUnits.length : 0;
  const cBin = cRatio < 0.3 ? 0 : cRatio < 0.6 ? 1 : 2;

  return `${turnBin}_${advanceBin}_${ratioBin}_${btBin}_${dBin}_${cBin}`;
}

// ===== Q テーブル =====
class QAgent {
  constructor(side, actions) {
    this.side = side;
    this.actions = actions;
    this.qTable = {};  // { state: { actionId: qValue } }
    this.history = [];  // [{ state, actionId, reward }]
    this.intermediateReward = 0;
  }

  // Q値取得
  getQ(state, actionId) {
    if (!this.qTable[state]) return 0;
    return this.qTable[state][actionId] || 0;
  }

  // 行動選択（ε-greedy）
  selectAction(state, epsilon) {
    // 探索
    if (Math.random() < epsilon) {
      return this.actions[Math.floor(Math.random() * this.actions.length)];
    }
    // 貪欲
    let bestId = 0;
    let bestQ = -Infinity;
    for (const act of this.actions) {
      const q = this.getQ(state, act.id) + Math.random() * 0.01; // タイブレーク
      if (q > bestQ) {
        bestQ = q;
        bestId = act.id;
      }
    }
    return this.actions[bestId];
  }

  // 行動記録
  record(state, actionId) {
    this.history.push({ state, actionId, reward: this.intermediateReward });
    this.intermediateReward = 0;
  }

  // 中間報酬追加
  addReward(r) {
    this.intermediateReward += r;
  }

  // ゲーム終了時のQ値更新（逆順伝播）
  learn(terminalReward) {
    let futureReturn = terminalReward;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const { state, actionId, reward } = this.history[i];
      const totalReward = reward + futureReturn;

      if (!this.qTable[state]) this.qTable[state] = {};
      const oldQ = this.qTable[state][actionId] || 0;
      this.qTable[state][actionId] = oldQ + ALPHA * (totalReward - oldQ);

      futureReturn = this.qTable[state][actionId] * GAMMA;
    }
    this.history = [];
    this.intermediateReward = 0;
  }

  // Q テーブルのサイズ
  size() {
    let count = 0;
    for (const state of Object.keys(this.qTable)) {
      count += Object.keys(this.qTable[state]).length;
    }
    return count;
  }

  // エクスポート（JSON形式）
  exportJSON() {
    return JSON.stringify(this.qTable);
  }

  // インポート
  importJSON(json) {
    this.qTable = JSON.parse(json);
  }
}

// ===== 報酬計算 =====
function calcTerminalReward(side, G, testUnits) {
  const bt = G.breakthroughCount || 0;
  if (side === 'german') {
    if (bt >= 7) return 10;   // 勝利
    if (bt >= 4) return 2;    // 引き分け
    return -10;               // 敗北
  } else {
    if (bt >= 7) return -10;  // 敗北
    if (bt >= 4) return -2;   // 引き分け
    return 10;                // 勝利
  }
}

function calcIntermediateRewards(side, prevState, G, testUnits) {
  // 突破ボーナス
  const btDelta = (G.breakthroughCount || 0) - (prevState.bt || 0);
  let reward = 0;
  if (side === 'german') {
    reward += btDelta * 3;
  } else {
    reward -= btDelta * 3;
  }

  // ユニット喪失/壊滅
  const gerAlive = testUnits.filter(u => u.side === 'german' && u.status !== 'eliminated' && u.type !== 'dummy').length;
  const allAlive = testUnits.filter(u => u.side === 'allied' && u.status !== 'eliminated' && u.type !== 'dummy').length;

  const gerLost = (prevState.gerAlive || 0) - gerAlive;
  const allLost = (prevState.allAlive || 0) - allAlive;

  if (side === 'german') {
    reward += allLost * 1;   // 敵壊滅
    reward -= gerLost * 1;   // 味方喪失
  } else {
    reward += gerLost * 1;
    reward -= allLost * 1;
  }

  return reward;
}

// ===== エクスポート用関数 =====
function exportPretrained(germanAgent, alliedAgent) {
  const data = {
    german: {
      qTable: germanAgent.qTable,
      actions: GERMAN_ACTIONS
    },
    allied: {
      qTable: alliedAgent.qTable,
      actions: ALLIED_ACTIONS
    }
  };

  let js = '// ai_pretrained_pg.js — Auto-generated Q-table\n';
  js += '// Generated: ' + new Date().toISOString() + '\n';
  js += 'const PG_PRETRAINED = ' + JSON.stringify(data, null, 0) + ';\n';
  return js;
}

// ===== Blackboard+Experts用 行動定義（シナリオ3以降） =====
// expertWeights: 各Expertの重み倍率 (0.3~1.5)
// breakthroughAggression / focusTarget / assaultThreshold / stopFirePolicy: Expert内部パラメータ

const GERMAN_ACTIONS_V2 = [
  { id:0,  expertWeights:{breakthrough:1.0, fire:1.0, assault:1.0, recovery:1.0, stacking:1.0, recon:0.5, threat:1.0},
    breakthroughAggression:8,  focusTarget:'nearest',  assaultThreshold:3.0, stopFirePolicy:'concentrate' },
  { id:1,  expertWeights:{breakthrough:1.3, fire:0.8, assault:1.2, recovery:1.0, stacking:0.8, recon:0.5, threat:0.7},
    breakthroughAggression:12, focusTarget:'nearest',  assaultThreshold:2.5, stopFirePolicy:'concentrate' },
  { id:2,  expertWeights:{breakthrough:0.7, fire:1.3, assault:0.5, recovery:1.0, stacking:1.0, recon:0.8, threat:1.3},
    breakthroughAggression:5,  focusTarget:'weakest',  assaultThreshold:3.5, stopFirePolicy:'spread' },
  { id:3,  expertWeights:{breakthrough:1.5, fire:0.5, assault:1.0, recovery:1.0, stacking:0.5, recon:0.3, threat:0.5},
    breakthroughAggression:15, focusTarget:'nearest',  assaultThreshold:2.0, stopFirePolicy:'concentrate' },
  { id:4,  expertWeights:{breakthrough:0.5, fire:1.5, assault:0.3, recovery:1.0, stacking:1.2, recon:1.0, threat:1.5},
    breakthroughAggression:5,  focusTarget:'weakest',  assaultThreshold:3.5, stopFirePolicy:'spread' },
  { id:5,  expertWeights:{breakthrough:1.0, fire:1.0, assault:1.5, recovery:1.0, stacking:1.5, recon:0.3, threat:0.8},
    breakthroughAggression:10, focusTarget:'nearest',  assaultThreshold:2.0, stopFirePolicy:'split' },
  { id:6,  expertWeights:{breakthrough:1.2, fire:1.2, assault:0.8, recovery:1.0, stacking:1.0, recon:1.0, threat:1.2},
    breakthroughAggression:10, focusTarget:'spread',   assaultThreshold:3.0, stopFirePolicy:'spread' },
  { id:7,  expertWeights:{breakthrough:0.8, fire:0.8, assault:1.3, recovery:1.0, stacking:1.3, recon:0.5, threat:1.0},
    breakthroughAggression:8,  focusTarget:'nearest',  assaultThreshold:2.5, stopFirePolicy:'split' },
  { id:8,  expertWeights:{breakthrough:1.0, fire:1.5, assault:0.5, recovery:1.0, stacking:0.8, recon:0.8, threat:1.0},
    breakthroughAggression:8,  focusTarget:'weakest',  assaultThreshold:3.0, stopFirePolicy:'concentrate' },
  { id:9,  expertWeights:{breakthrough:1.3, fire:1.0, assault:1.0, recovery:1.0, stacking:1.0, recon:0.5, threat:0.8},
    breakthroughAggression:12, focusTarget:'nearest',  assaultThreshold:2.5, stopFirePolicy:'concentrate' },
  { id:10, expertWeights:{breakthrough:0.5, fire:1.0, assault:0.5, recovery:1.0, stacking:1.5, recon:1.0, threat:1.5},
    breakthroughAggression:5,  focusTarget:'spread',   assaultThreshold:3.5, stopFirePolicy:'spread' },
  { id:11, expertWeights:{breakthrough:1.5, fire:0.8, assault:1.5, recovery:1.0, stacking:0.5, recon:0.3, threat:0.5},
    breakthroughAggression:15, focusTarget:'nearest',  assaultThreshold:2.0, stopFirePolicy:'concentrate' },
];

const ALLIED_ACTIONS_V2 = [
  { id:0,  expertWeights:{breakthrough:1.0, fire:1.0, assault:0.5, recovery:1.0, stacking:1.0, recon:0.5, threat:1.0},
    blockAggression:10, rangeKeep:5,  fireSpread:true,  stopFirePolicy:'concentrate' },
  { id:1,  expertWeights:{breakthrough:1.3, fire:0.8, assault:0.3, recovery:1.0, stacking:0.8, recon:0.5, threat:1.2},
    blockAggression:15, rangeKeep:3,  fireSpread:true,  stopFirePolicy:'concentrate' },
  { id:2,  expertWeights:{breakthrough:0.8, fire:1.3, assault:0.5, recovery:1.0, stacking:1.2, recon:0.8, threat:1.3},
    blockAggression:8,  rangeKeep:8,  fireSpread:true,  stopFirePolicy:'spread' },
  { id:3,  expertWeights:{breakthrough:1.2, fire:1.0, assault:0.3, recovery:1.0, stacking:1.0, recon:0.5, threat:0.8},
    blockAggression:12, rangeKeep:5,  fireSpread:false, stopFirePolicy:'split' },
  { id:4,  expertWeights:{breakthrough:0.5, fire:1.5, assault:0.3, recovery:1.0, stacking:1.5, recon:1.0, threat:1.5},
    blockAggression:8,  rangeKeep:10, fireSpread:true,  stopFirePolicy:'split' },
  { id:5,  expertWeights:{breakthrough:1.5, fire:0.8, assault:0.5, recovery:1.0, stacking:0.5, recon:0.3, threat:0.5},
    blockAggression:15, rangeKeep:3,  fireSpread:false, stopFirePolicy:'concentrate' },
  { id:6,  expertWeights:{breakthrough:0.8, fire:1.0, assault:0.5, recovery:1.0, stacking:1.0, recon:1.0, threat:1.0},
    blockAggression:8,  rangeKeep:5,  fireSpread:true,  stopFirePolicy:'spread' },
  { id:7,  expertWeights:{breakthrough:1.0, fire:1.3, assault:0.3, recovery:1.0, stacking:1.3, recon:0.5, threat:1.2},
    blockAggression:12, rangeKeep:8,  fireSpread:false, stopFirePolicy:'spread' },
  { id:8,  expertWeights:{breakthrough:1.0, fire:1.0, assault:0.5, recovery:1.0, stacking:1.0, recon:0.5, threat:1.0},
    blockAggression:10, rangeKeep:5,  fireSpread:true,  stopFirePolicy:'split' },
  { id:9,  expertWeights:{breakthrough:1.3, fire:1.5, assault:0.3, recovery:1.0, stacking:0.8, recon:0.5, threat:1.0},
    blockAggression:15, rangeKeep:8,  fireSpread:false, stopFirePolicy:'concentrate' },
  { id:10, expertWeights:{breakthrough:0.5, fire:0.8, assault:0.5, recovery:1.0, stacking:1.5, recon:1.0, threat:1.5},
    blockAggression:8,  rangeKeep:3,  fireSpread:true,  stopFirePolicy:'concentrate' },
  { id:11, expertWeights:{breakthrough:1.2, fire:1.0, assault:0.5, recovery:1.0, stacking:0.8, recon:0.5, threat:0.8},
    blockAggression:12, rangeKeep:10, fireSpread:false, stopFirePolicy:'split' },
];

// Node.js用エクスポート
if (typeof module !== 'undefined') {
  module.exports = {
    ALPHA, GAMMA, EPSILON_START, EPSILON_END,
    GERMAN_ACTIONS, ALLIED_ACTIONS,
    GERMAN_ACTIONS_V2, ALLIED_ACTIONS_V2,
    encodeState, QAgent,
    calcTerminalReward, calcIntermediateRewards,
    exportPretrained
  };
}
