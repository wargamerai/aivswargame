#!/usr/bin/env node
// pg_train.js — PG Q学習訓練スクリプト
// 使い方: node pg_train.js [対局数] [--verbose] [--s3]
'use strict';

const fs = require('fs');
const path = require('path');
const dir = __dirname;

// ===== 訓練パラメータ（require前に解析） =====
const args = process.argv.slice(2);
const numGames = parseInt(args.find(a => !a.startsWith('-')) || '1000');
const verbose = args.includes('--verbose');
const scenarioId = args.includes('--s3') ? 3 : 2;

// S3時: headlessエンジン読み込み前にシナリオIDを設定
if (scenarioId === 3) {
  global._presetHeadlessScenario = 3;
}

// Q学習モジュール読み込み
const QL = require(path.join(dir, 'pg_qlearn.js'));

// ヘッドレスエンジン読み込み（グローバルに展開）
require(path.join(dir, 'pg_headless.js'));

// アクション定義（S3はV2、S2は旧版）
const gerActions = scenarioId >= 3 ? QL.GERMAN_ACTIONS_V2 : QL.GERMAN_ACTIONS;
const allActions = scenarioId >= 3 ? QL.ALLIED_ACTIONS_V2 : QL.ALLIED_ACTIONS;

console.log(`PG Q-Learning Training — ${numGames} games (Scenario ${scenarioId})`);
console.log(`α=${QL.ALPHA} γ=${QL.GAMMA} ε=${QL.EPSILON_START}→${QL.EPSILON_END}`);
console.log(`German actions: ${gerActions.length}, Allied actions: ${allActions.length}`);
if (scenarioId >= 3) console.log('Using Blackboard+Experts AI (V2 actions)');
console.log('---');

// ===== エージェント初期化 =====
const germanAgent = new QL.QAgent('german', gerActions);
const alliedAgent = new QL.QAgent('allied', allActions);

// 既存のQ値があれば読み込む
const qFilePath = path.join(dir, scenarioId >= 3 ? 'pg_qtable_s3.json' : 'pg_qtable.json');
if (fs.existsSync(qFilePath)) {
  try {
    const data = JSON.parse(fs.readFileSync(qFilePath, 'utf8'));
    if (data.german) germanAgent.importJSON(JSON.stringify(data.german));
    if (data.allied) alliedAgent.importJSON(JSON.stringify(data.allied));
    console.log(`Loaded existing Q-table: GE=${germanAgent.size()} entries, UK=${alliedAgent.size()} entries`);
  } catch (e) {
    console.log('No existing Q-table found, starting fresh');
  }
}

// ===== 訓練用フック =====
// pg_headless.jsのグローバル関数にフックして、
// 各ターンの移動フェイズ前にQ学習の行動選択を注入する

// グローバルに重みを公開（AI評価関数から参照される）
global._qWeightsGerman = null;
global._qWeightsAllied = null;

if (scenarioId < 3) {
  // ===== S2: 旧方式のmonkey-patch =====
  const _origGeEval = global.geAI_evaluateNeighbor;
  const _origUkEval = global.ukAI_evaluateNeighbor;
  const _origGeAssault = global.geAI_shouldAssault;

  // ドイツ評価関数を上書き（Q学習の重みを使用）
  global.geAI_evaluateNeighbor = function(stack, col, row, isDisrupted) {
    const QW = global._qWeightsGerman;
    if (!QW) return _origGeEval(stack, col, row, isDisrupted);

    const hexId = toHexId(col, row);
    const terrain = getHexTerrain(hexId);
    if (terrain === 'x' || terrain === 'lake') return -9999;

    let score = 0;

    if (isDisrupted) {
      const inLOS = geAI_isInEnemyFireZone(col, row);
      const isCover = geAI_isCoverTerrain(col, row);
      if (!inLOS && isCover) score += 50;
      else if (!inLOS) score += 30;
      else if (isCover) score += 15;
      else score -= 10;
      const curCol = stack[0].col;
      if (col > curCol + 2) score -= 20;
      return score;
    }

    // 突破
    if (col <= 1 && row >= 1 && row <= 9) return 1000;

    // Q学習の重みで評価
    score += (30 - col) * QW.westPriority;

    const inLOS = geAI_isInEnemyFireZone(col, row);
    if (!inLOS) {
      score += QW.losAvoidance;
    } else {
      const threat = geAI_getEnemyThreat(col, row);
      score -= threat.count * 3;
    }

    // focusTarget: 全軍が同じ敵に集中するか
    const focusPolicy = QW.focusTarget || 'nearest';
    let targetDist = Infinity;
    if (focusPolicy === 'nearest') {
      targetDist = geAI_nearestArmoredEnemyDist(col, row);
    } else if (focusPolicy === 'weakest') {
      let weakestDist = Infinity;
      let weakestDef = Infinity;
      testUnits.forEach(e => {
        if (e.side !== 'allied' || e.status === 'eliminated' || e.type === 'dummy' || e.type === 'leader') return;
        if (e.type !== 'T' && e.type !== 'AC' && e.type !== 'AT') return;
        const d = hexDistance(e.col, e.row, col, row);
        if (d > 0 && ((e.def || 99) < weakestDef || ((e.def || 99) === weakestDef && d < weakestDist))) {
          weakestDef = e.def || 99;
          weakestDist = d;
        }
      });
      targetDist = weakestDist;
    } else {
      targetDist = geAI_nearestArmoredEnemyDist(col, row);
    }
    if (targetDist <= 5) {
      score += (6 - targetDist) * QW.enemyApproach;
    }

    if (geAI_isCoverTerrain(col, row)) {
      score += QW.coverBonus;
    }

    // スタック
    const aliveCount = stack.filter(u => u.status !== 'eliminated').length;
    const allExisting = testUnits.filter(u =>
      u.hexId === hexId && u.status !== 'eliminated' &&
      !STACK_EXEMPT_TYPES.includes(u.type) && !stack.includes(u)
    ).length;
    if (allExisting + aliveCount > 4) return -9999;

    return score;
  };

  // 突撃閾値を上書き
  global.geAI_shouldAssault = function(stack, enemyHexId) {
    const QW = global._qWeightsGerman;
    const threshold = QW ? QW.assaultThreshold : 3.0;

    const aliveStack = stack.filter(u => u.status !== 'eliminated' && u.status !== 'dd');
    if (aliveStack.length === 0) return false;

    const enemies = testUnits.filter(u =>
      u.hexId === enemyHexId && u.side === 'allied' &&
      u.status !== 'eliminated' && u.type !== 'dummy' && u.type !== 'leader'
    );
    if (enemies.length === 0) return false;

    const activeEnemies = enemies.filter(u => u.status === 'ok' || u.status === 'd');
    if (activeEnemies.length === 0) return true;

    let atkPower = 0;
    aliveStack.forEach(u => { atkPower += (u.closeAtk || u.assAtk || 0); });
    let defPower = 0;
    activeEnemies.forEach(u => { defPower += (u.closeDef || u.assDef || 0); });

    const terrain = getHexTerrain(enemyHexId);
    const tmod = TERRAIN_MODIFIERS[terrain];
    if (tmod && tmod.assault) defPower -= tmod.assault;
    if (defPower <= 0) defPower = 1;

    return (atkPower / defPower) >= threshold;
  };
}
// S3: ai_blackboard.jsのshim関数がそのまま使われる（monkey-patch不要）

// ===== weight注入関数 =====
function injectWeights(gerAction, allAction) {
  global._qWeightsGerman = gerAction;
  global._qWeightsAllied = allAction;

  // S3: AI_CONTROLLERにExpert重みを注入
  if (scenarioId >= 3 && typeof AI_CONTROLLER !== 'undefined') {
    AI_CONTROLLER.setWeights('german', gerAction);
    AI_CONTROLLER.setWeights('allied', allAction);
    AI_CONTROLLER.buildBoard('german');
    AI_CONTROLLER.buildBoard('allied');
  }
}

// ===== 訓練ループ =====
let germanWins = 0, alliedWins = 0, draws = 0;
let recentGermanWins = 0, recentGames = 0;
const startTime = Date.now();

for (let game = 0; game < numGames; game++) {
  // εの減衰
  const progress = game / numGames;
  const epsilon = QL.EPSILON_START + (QL.EPSILON_END - QL.EPSILON_START) * progress;

  // ゲーム初期化
  initGame();

  // 前の状態を記録
  let prevGerman = { bt: 0, gerAlive: 13, allAlive: 12 };
  let prevAllied = { bt: 0, gerAlive: 13, allAlive: 12 };

  for (let turn = 1; turn <= G.maxTurn; turn++) {
    G.turn = turn;

    // ===== イニシアチブ =====
    rollInitiativeSync();

    // ===== 回復 =====
    aiAutoRecovery();

    // ===== 状態エンコード & 行動選択 =====
    const gerState = QL.encodeState('german', G, testUnits);
    const allState = QL.encodeState('allied', G, testUnits);

    const gerAction = germanAgent.selectAction(gerState, epsilon);
    const allAction = alliedAgent.selectAction(allState, epsilon);

    // 重みを適用
    injectWeights(gerAction, allAction);

    // ===== 移動・射撃 =====
    aiAutoMoveFireSync();

    // ===== 突撃 =====
    aiAutoAssaultSync();

    // ===== 後攻移動 =====
    aiAutoDefMoveSync();

    // ===== 中間報酬 =====
    const gerReward = QL.calcIntermediateRewards('german', prevGerman, G, testUnits);
    const allReward = QL.calcIntermediateRewards('allied', prevAllied, G, testUnits);

    germanAgent.addReward(gerReward);
    alliedAgent.addReward(allReward);

    // 行動記録
    germanAgent.record(gerState, gerAction.id);
    alliedAgent.record(allState, allAction.id);

    // 状態更新
    const gerAlive = testUnits.filter(u => u.side === 'german' && u.status !== 'eliminated' && u.type !== 'dummy').length;
    const allAlive = testUnits.filter(u => u.side === 'allied' && u.status !== 'eliminated' && u.type !== 'dummy').length;
    prevGerman = { bt: G.breakthroughCount, gerAlive, allAlive };
    prevAllied = { bt: G.breakthroughCount, gerAlive, allAlive };

    // ===== ターン終了 =====
    advanceTurnSync();
  }

  // ===== ゲーム終了 → Q値更新 =====
  const gerTerminal = QL.calcTerminalReward('german', G, testUnits);
  const allTerminal = QL.calcTerminalReward('allied', G, testUnits);

  germanAgent.learn(gerTerminal);
  alliedAgent.learn(allTerminal);

  // 統計
  const bt = G.breakthroughCount;
  if (bt >= 7) { germanWins++; recentGermanWins++; }
  else if (bt >= 4) { draws++; }
  else { alliedWins++; }
  recentGames++;

  // 進捗表示
  if ((game + 1) % 100 === 0 || (verbose && (game + 1) % 10 === 0)) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const recentWR = (recentGermanWins / recentGames * 100).toFixed(1);
    console.log(`  ${game + 1}/${numGames} (${elapsed}s) ε=${epsilon.toFixed(3)} GE勝率=${recentWR}% bt=${bt} Q-size: GE=${germanAgent.size()} UK=${alliedAgent.size()}`);
    recentGermanWins = 0;
    recentGames = 0;
  }
}

// ===== 結果出力 =====
const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('---');
console.log(`Training complete: ${numGames} games in ${totalTime}s (Scenario ${scenarioId})`);
console.log(`  German wins:  ${germanWins} (${(germanWins/numGames*100).toFixed(1)}%)`);
console.log(`  Allied wins:  ${alliedWins} (${(alliedWins/numGames*100).toFixed(1)}%)`);
console.log(`  Draws:        ${draws} (${(draws/numGames*100).toFixed(1)}%)`);
console.log(`  Q-table size: GE=${germanAgent.size()} UK=${alliedAgent.size()}`);

// ===== Q値保存 =====
const qData = {
  german: germanAgent.qTable,
  allied: alliedAgent.qTable,
  metadata: {
    scenario: scenarioId,
    games: numGames,
    germanWinRate: germanWins / numGames,
    timestamp: new Date().toISOString()
  }
};
fs.writeFileSync(qFilePath, JSON.stringify(qData));
console.log(`Q-table saved to ${qFilePath}`);

// ブラウザ用JSファイル出力
const pretrainedPath = path.join(dir, scenarioId >= 3 ? 'ai_pretrained_pg_s3.js' : 'ai_pretrained_pg.js');
fs.writeFileSync(pretrainedPath, QL.exportPretrained(germanAgent, alliedAgent));
console.log(`Pretrained JS saved to ${pretrainedPath}`);
