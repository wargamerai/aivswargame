// sc4_train.js — SC4「フューリー」Tiger AI 進化学習
// 使い方: node sc4_train.js
// 出力: ai_sc4_weights.json

const { runGame } = require('./sc4_sim.js');
const fs = require('fs');

// --- 学習パラメータ ---
const POP_SIZE = 30;         // 個体数
const GAMES_PER_EVAL = 40;   // 1個体あたりの対戦数
const GENERATIONS = 500;     // 世代数
const MUTATION_RATE = 0.3;   // 突然変異率
const MUTATION_SCALE = 0.5;  // 突然変異の大きさ
const ELITE_COUNT = 8;       // エリート保存数

// --- 初期重み ---
function randomWeights() {
  return {
    killChance: 5 + Math.random() * 10,     // 撃破チャンス重視
    canShoot: 0.5 + Math.random() * 2,      // 射撃可能数
    threat: -(3 + Math.random() * 7),        // 脅威回避
    canBeShot: -(1 + Math.random() * 3),     // 被射撃回避
    distance: -(0.1 + Math.random() * 0.5),  // 近すぎない
    terrainCover: 1 + Math.random() * 3,     // 地形防御
    flankThreat: -(2 + Math.random() * 4),   // 側面回避
    killable: 2 + Math.random() * 5,         // 高確率撃破
    edgePenalty: -(1 + Math.random() * 2),   // 端回避
    aliveEnemies: -(0.5 + Math.random()),    // 残敵数
  };
}

// --- 勝ちパターン記録 ---
const winPatterns = []; // { tigerRow, m4Rows, count }

function recordWinPattern(initPos) {
  // TigerのRowと各M4との距離差をパターンとして記録
  const key = `${initPos.tigerRow}_${initPos.m4Rows.sort((a,b)=>a-b).join(',')}`;
  const existing = winPatterns.find(p => p.key === key);
  if (existing) {
    existing.count++;
  } else {
    winPatterns.push({ key, tigerRow: initPos.tigerRow, m4Rows: initPos.m4Rows, count: 1 });
  }
}

function getWinPatternBonus(initPos) {
  // 勝ちパターンとの類似度でボーナス
  if (winPatterns.length === 0) return 0;
  let bonus = 0;
  const tr = initPos.tigerRow;
  const m4s = initPos.m4Rows.sort((a,b) => a-b);
  for (const wp of winPatterns) {
    // Tiger行の近さ + M4行の近さで類似度
    const tigerSim = Math.max(0, 3 - Math.abs(tr - wp.tigerRow)); // 0-3
    const wpM4 = wp.m4Rows.sort((a,b) => a-b);
    let m4Sim = 0;
    for (let i = 0; i < 4; i++) {
      m4Sim += Math.max(0, 3 - Math.abs(m4s[i] - wpM4[i]));
    }
    const similarity = (tigerSim + m4Sim) / 15; // 0-1
    bonus += similarity * wp.count * 0.1; // 勝利回数×類似度でボーナス
  }
  return Math.min(bonus, 3); // 最大3点
}

// --- 個体評価 ---
function evaluate(weights) {
  let totalScore = 0;
  let wins = 0;
  let totalKills = 0;
  let survived = 0;

  for (let i = 0; i < GAMES_PER_EVAL; i++) {
    const result = runGame(weights);
    if (result.winner === 'ge') {
      wins++;
      recordWinPattern(result.initPos);
    }
    totalKills += result.tigerKills;
    if (result.tigerSurvived) survived++;
    // スコア: 勝利10点 + 撃破数×2 + 生存3点 + ターン短縮ボーナス - 突破ペナルティ + 勝ちパターンボーナス
    let gameScore = (result.winner === 'ge' ? 10 : 0) + result.tigerKills * 2 + (result.tigerSurvived ? 3 : 0);
    if (result.winner === 'ge') gameScore += Math.max(0, (20 - result.turns) * 0.2);
    if (result.usEscaped) gameScore -= result.usEscaped * 5; // 突破されたらペナルティ
    if (result.winner === 'ge') gameScore += getWinPatternBonus(result.initPos);
    totalScore += gameScore;
  }

  return {
    score: totalScore / GAMES_PER_EVAL,
    winRate: wins / GAMES_PER_EVAL,
    avgKills: totalKills / GAMES_PER_EVAL,
    survivalRate: survived / GAMES_PER_EVAL,
  };
}

// --- 突然変異 ---
function mutate(weights) {
  const child = { ...weights };
  for (const key of Object.keys(child)) {
    if (Math.random() < MUTATION_RATE) {
      child[key] += (Math.random() - 0.5) * 2 * MUTATION_SCALE * Math.abs(child[key] || 1);
    }
  }
  return child;
}

// --- 交叉 ---
function crossover(a, b) {
  const child = {};
  for (const key of Object.keys(a)) {
    child[key] = Math.random() < 0.5 ? a[key] : b[key];
  }
  return child;
}

// --- メインループ ---
function train() {
  console.log('=== SC4 Tiger AI Training ===');
  console.log(`Population: ${POP_SIZE}, Games/eval: ${GAMES_PER_EVAL}, Generations: ${GENERATIONS}`);
  console.log('');

  // 初期集団（前回のベストをシードとして含む）
  const seed = {"killChance":0.06122602741833063,"canShoot":0.000050547060782386146,"threat":-2.3869175308083523,"canBeShot":-0.0811099084493853,"distance":-0.006199703268995069,"terrainCover":0.11873763109907254,"flankThreat":-0.22348325054863713,"killable":0.0007544334167694595,"edgePenalty":-227.73361398844276,"aliveEnemies":-0.4724024995597076};
  let population = [];
  population.push({ weights: { ...seed }, fitness: 0, stats: null });
  for (let i = 0; i < 5; i++) {
    population.push({ weights: mutate(seed), fitness: 0, stats: null });
  }
  for (let i = population.length; i < POP_SIZE; i++) {
    population.push({ weights: randomWeights(), fitness: 0, stats: null });
  }

  let bestEver = null;
  let bestEverScore = -Infinity;

  for (let gen = 0; gen < GENERATIONS; gen++) {
    const startTime = Date.now();

    // 評価
    for (let i = 0; i < population.length; i++) {
      const stats = evaluate(population[i].weights);
      population[i].fitness = stats.score;
      population[i].stats = stats;
    }

    // ソート
    population.sort((a, b) => b.fitness - a.fitness);

    const best = population[0];
    const avgFitness = population.reduce((s, p) => s + p.fitness, 0) / POP_SIZE;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `Gen ${String(gen + 1).padStart(3)}: ` +
      `best=${best.fitness.toFixed(2)} avg=${avgFitness.toFixed(2)} ` +
      `win=${(best.stats.winRate * 100).toFixed(0)}% ` +
      `kills=${best.stats.avgKills.toFixed(1)} ` +
      `surv=${(best.stats.survivalRate * 100).toFixed(0)}% ` +
      `(${elapsed}s)`
    );

    // ベスト更新
    if (best.fitness > bestEverScore) {
      bestEverScore = best.fitness;
      bestEver = JSON.parse(JSON.stringify(best));
    }

    // 早期終了
    if (best.stats.winRate >= 0.95 && best.stats.survivalRate >= 0.8) {
      console.log('\n目標達成！学習終了。');
      break;
    }

    // 次世代生成
    const newPop = [];

    // エリート保存
    for (let i = 0; i < ELITE_COUNT; i++) {
      newPop.push({ weights: { ...population[i].weights }, fitness: 0, stats: null });
    }

    // 残りは交叉+突然変異
    while (newPop.length < POP_SIZE) {
      const pi = Math.floor(Math.random() * ELITE_COUNT);
      const pj = Math.floor(Math.random() * Math.min(POP_SIZE / 2, POP_SIZE));
      const child = mutate(crossover(population[pi].weights, population[pj].weights));
      newPop.push({ weights: child, fitness: 0, stats: null });
    }

    population = newPop;
  }

  // 結果出力
  console.log('\n=== Training Complete ===');
  console.log(`Best score: ${bestEver.fitness.toFixed(2)}`);
  console.log(`Win rate: ${(bestEver.stats.winRate * 100).toFixed(1)}%`);
  console.log(`Avg kills: ${bestEver.stats.avgKills.toFixed(2)}`);
  console.log(`Survival: ${(bestEver.stats.survivalRate * 100).toFixed(1)}%`);

  // 勝ちパターン上位表示
  winPatterns.sort((a, b) => b.count - a.count);
  console.log(`\nTop win patterns (${winPatterns.length} total):`);
  for (let i = 0; i < Math.min(10, winPatterns.length); i++) {
    const p = winPatterns[i];
    console.log(`  Tiger row=${p.tigerRow}, M4 rows=[${p.m4Rows.join(',')}] x${p.count}`);
  }

  console.log('\nWeights:');
  console.log(JSON.stringify(bestEver.weights, null, 2));

  // ファイル出力
  const output = {
    version: 1,
    trained: new Date().toISOString(),
    generations: GENERATIONS,
    gamesPerEval: GAMES_PER_EVAL,
    bestScore: bestEver.fitness,
    winRate: bestEver.stats.winRate,
    avgKills: bestEver.stats.avgKills,
    survivalRate: bestEver.stats.survivalRate,
    weights: bestEver.weights,
    winPatterns: winPatterns.sort((a,b) => b.count - a.count).slice(0, 20),
  };

  fs.writeFileSync(__dirname + '/ai_sc4_weights.json', JSON.stringify(output, null, 2));
  console.log('\n→ ai_sc4_weights.json に保存しました');
}

train();
