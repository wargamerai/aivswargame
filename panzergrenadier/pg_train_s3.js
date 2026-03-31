#!/usr/bin/env node
// pg_train_s3.js — S3専用 Q学習訓練スクリプト
// 使い方: node pg_train_s3.js [対局数] [--verbose]
'use strict';

const fs = require('fs');
const path = require('path');
const dir = __dirname;

const args = process.argv.slice(2);
const numGames = parseInt(args.find(a => !a.startsWith('-')) || '1000');
const verbose = args.includes('--verbose');

// phase_support.js の var FIGHTER_BOMBER_DISCOVERY が
// unitdata.js の const と衝突するため、読み込み時にパッチ
const _origReadFileSync = fs.readFileSync;
fs.readFileSync = function(filepath, encoding) {
  const content = _origReadFileSync.call(fs, filepath, encoding);
  if (typeof filepath === 'string' && filepath.includes('phase_support.js') && typeof content === 'string') {
    return content.replace(/\bvar\s+FIGHTER_BOMBER_DISCOVERY\b/, 'FIGHTER_BOMBER_DISCOVERY');
  }
  return content;
};

// S3シナリオ設定
global._presetHeadlessScenario = 3;

// Q学習モジュール
const QL = require(path.join(dir, 'pg_qlearn.js'));

// ヘッドレスエンジン読み込み
require(path.join(dir, 'pg_headless.js'));

// fsを元に戻す
fs.readFileSync = _origReadFileSync;

// V2アクション
const gerActions = QL.GERMAN_ACTIONS_V2;
const allActions = QL.ALLIED_ACTIONS_V2;

console.log(`PG S3 Training — ${numGames} games`);
console.log(`α=${QL.ALPHA} γ=${QL.GAMMA} ε=${QL.EPSILON_START}→${QL.EPSILON_END}`);
console.log(`Blackboard+Experts AI (V2 actions: GE=${gerActions.length} UK=${allActions.length})`);
console.log('---');

// エージェント初期化
const germanAgent = new QL.QAgent('german', gerActions);
const alliedAgent = new QL.QAgent('allied', allActions);

// 既存Q値読み込み
const qFilePath = path.join(dir, 'pg_qtable_s3.json');
if (fs.existsSync(qFilePath)) {
  try {
    const data = JSON.parse(fs.readFileSync(qFilePath, 'utf8'));
    if (data.german) germanAgent.importJSON(JSON.stringify(data.german));
    if (data.allied) alliedAgent.importJSON(JSON.stringify(data.allied));
    console.log(`Loaded Q-table: GE=${germanAgent.size()} UK=${alliedAgent.size()}`);
  } catch (e) {
    console.log('Starting fresh');
  }
}

// weight注入
function injectWeights(gerAction, allAction) {
  global._qWeightsGerman = gerAction;
  global._qWeightsAllied = allAction;
  if (typeof AI_CONTROLLER !== 'undefined') {
    AI_CONTROLLER.setWeights('german', gerAction);
    AI_CONTROLLER.setWeights('allied', allAction);
    AI_CONTROLLER.buildBoard('german');
    AI_CONTROLLER.buildBoard('allied');
  }
}

// 訓練ループ
let germanWins = 0, alliedWins = 0, draws = 0;
let recentGermanWins = 0, recentGames = 0;
const startTime = Date.now();

for (let game = 0; game < numGames; game++) {
  const progress = game / numGames;
  const epsilon = QL.EPSILON_START + (QL.EPSILON_END - QL.EPSILON_START) * progress;

  initGame();

  let prevState = { bt: 0, gerAlive: 13, allAlive: 12 };

  for (let turn = 1; turn <= G.maxTurn; turn++) {
    G.turn = turn;
    rollInitiativeSync();
    aiAutoRecovery();

    const gerState = QL.encodeState('german', G, testUnits);
    const allState = QL.encodeState('allied', G, testUnits);
    const gerAction = germanAgent.selectAction(gerState, epsilon);
    const allAction = alliedAgent.selectAction(allState, epsilon);

    injectWeights(gerAction, allAction);

    aiAutoMoveFireSync();
    aiAutoAssaultSync();
    aiAutoDefMoveSync();

    const gerReward = QL.calcIntermediateRewards('german', prevState, G, testUnits);
    const allReward = QL.calcIntermediateRewards('allied', prevState, G, testUnits);
    germanAgent.addReward(gerReward);
    alliedAgent.addReward(allReward);
    germanAgent.record(gerState, gerAction.id);
    alliedAgent.record(allState, allAction.id);

    const gerAlive = testUnits.filter(u => u.side === 'german' && u.status !== 'eliminated' && u.type !== 'dummy').length;
    const allAlive = testUnits.filter(u => u.side === 'allied' && u.status !== 'eliminated' && u.type !== 'dummy').length;
    prevState = { bt: G.breakthroughCount, gerAlive, allAlive };

    advanceTurnSync();
  }

  const gerTerminal = QL.calcTerminalReward('german', G, testUnits);
  const allTerminal = QL.calcTerminalReward('allied', G, testUnits);
  germanAgent.learn(gerTerminal);
  alliedAgent.learn(allTerminal);

  const bt = G.breakthroughCount;
  if (bt >= 7) { germanWins++; recentGermanWins++; }
  else if (bt >= 4) { draws++; }
  else { alliedWins++; }
  recentGames++;

  if ((game + 1) % 100 === 0 || (verbose && (game + 1) % 10 === 0)) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const wr = (recentGermanWins / recentGames * 100).toFixed(1);
    console.log(`  ${game + 1}/${numGames} (${elapsed}s) ε=${epsilon.toFixed(3)} GE勝率=${wr}% bt=${bt} Q: GE=${germanAgent.size()} UK=${alliedAgent.size()}`);
    recentGermanWins = 0;
    recentGames = 0;
  }
}

// 結果出力
const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('---');
console.log(`Done: ${numGames} games in ${totalTime}s`);
console.log(`  German: ${germanWins} (${(germanWins / numGames * 100).toFixed(1)}%)`);
console.log(`  Allied: ${alliedWins} (${(alliedWins / numGames * 100).toFixed(1)}%)`);
console.log(`  Draws:  ${draws} (${(draws / numGames * 100).toFixed(1)}%)`);
console.log(`  Q-size: GE=${germanAgent.size()} UK=${alliedAgent.size()}`);

// Q値保存
const qData = {
  german: germanAgent.qTable,
  allied: alliedAgent.qTable,
  metadata: { scenario: 3, games: numGames, germanWinRate: germanWins / numGames, timestamp: new Date().toISOString() }
};
fs.writeFileSync(qFilePath, JSON.stringify(qData));
console.log(`Q-table → ${qFilePath}`);

// ブラウザ用JS出力
const pretrainedPath = path.join(dir, 'ai_pretrained_pg_s3.js');
const pretrainedData = {
  german: { qTable: germanAgent.qTable, actions: gerActions },
  allied: { qTable: alliedAgent.qTable, actions: allActions }
};
let js = '// ai_pretrained_pg_s3.js — S3 Q-table (Blackboard+Experts)\n';
js += '// Generated: ' + new Date().toISOString() + '\n';
js += 'const PG_PRETRAINED = ' + JSON.stringify(pretrainedData, null, 0) + ';\n';
fs.writeFileSync(pretrainedPath, js);
console.log(`Pretrained → ${pretrainedPath}`);
