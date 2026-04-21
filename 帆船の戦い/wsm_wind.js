// wsm_wind.js — WSM風フェイズ処理
// 各ターン開始時、2d6 vs windChangeNumber で風変化判定

function rollD6() { return 1 + Math.floor(Math.random() * 6); }
function roll2D6() { return rollD6() + rollD6(); }

// 風向変化判定（メインエントリ）
// 戻り値: { changed, oldWind, newWind, log: [] }
// WCNターンごとに判定（WCNは固定）
function executeWindPhase(wind) {
  const log = [];
  if (!wind.turnCounter) wind.turnCounter = 0;
  wind.turnCounter++;
  const oldWind = JSON.parse(JSON.stringify(wind));
  const wcn = wind.windChangeNumber || 3;
  if (wind.turnCounter % wcn !== 0) {
    log.push(`風期: ${wind.turnCounter}ターン目（${wcn}ターンごと判定）`);
    return { changed: false, oldWind, newWind: wind, log };
  }
  const r = rollD6();
  log.push(`風変化判定: 1d6=${r} vs 変化番号${wcn}`);

  if (r < wcn) {
    log.push('→ 変化なし');
    return { changed: false, oldWind, newWind: wind, log };
  }

  log.push('→ 変化発生');

  // 1) 風向変化（1d6）
  const dirRoll = rollD6();
  applyWindDirectionChange(wind, dirRoll, log);

  // 2) 風速変化（1d6）
  const velRoll = rollD6();
  applyWindVelocityChange(wind, velRoll, log);

  // WCN は固定（更新しない）

  return { changed: true, oldWind, newWind: wind, log };
}

// 風向変化表（1d6）— chartsdata.js の WIND_CHANGE_TABLE 準拠
function applyWindDirectionChange(wind, r, log) {
  const order = [9, 6, 3, 1, 4, 7];  // 時計回り順（numpad）
  let i = order.indexOf(wind.direction);
  if (i < 0) i = 0;
  switch (r) {
    case 1:
      wind.direction = wind.initialDirection || wind.direction;
      log.push(`風向: 初期方向(${DIR_NAMES_JP[wind.direction]})に戻る`);
      break;
    case 2:
      log.push(`風向: 変化なし(${DIR_NAMES_JP[wind.direction]})`);
      break;
    case 3:
      wind.direction = order[(i + 1) % 6];  // 時計回り60°
      log.push(`風向: 時計回り60°→ ${DIR_NAMES_JP[wind.direction]}`);
      break;
    case 4:
      wind.direction = order[(i + 5) % 6];  // 反時計回り60°
      log.push(`風向: 反時計回り60°→ ${DIR_NAMES_JP[wind.direction]}`);
      break;
    case 5:
      wind.direction = order[(i + 2) % 6];  // 時計回り120°
      log.push(`風向: 時計回り120°→ ${DIR_NAMES_JP[wind.direction]}`);
      break;
    case 6:
      wind.direction = order[(i + 4) % 6];  // 反時計回り120°
      log.push(`風向: 反時計回り120°→ ${DIR_NAMES_JP[wind.direction]}`);
      break;
  }
}

// 風速変化表（1d6）
function applyWindVelocityChange(wind, r, log) {
  if (r <= 2) {
    wind.velocity = Math.max(1, wind.velocity - 1);
    log.push(`風速: -1 → ${wind.velocity}`);
  } else if (r <= 4) {
    log.push(`風速: 変化なし (${wind.velocity})`);
  } else {
    wind.velocity = Math.min(6, wind.velocity + 1);
    log.push(`風速: +1 → ${wind.velocity}`);
  }
}

// 変化番号変動表（1d6）
function applyChangingWindNumber(wind, r, log) {
  const opts = {
    1: [7, 9, 11], 2: [7, 9], 3: [7, 11],
    4: [7], 5: [9], 6: [11],
  };
  const choices = opts[r] || [9];
  // 複数候補のときはランダムに
  wind.windChangeNumber = choices[Math.floor(Math.random() * choices.length)];
  log.push(`変化番号: ${wind.windChangeNumber}`);
}

// プレビュー（ダイス無し、現状の表示用文字列）
function describeWind(wind) {
  if (!wind) return '';
  const dn = (typeof DIR_NAMES_JP !== 'undefined') ? (DIR_NAMES_JP[wind.direction] || '?') : wind.direction;
  return `風向 ${dn} / 風速 ${wind.velocity} / 変化番号 ${wind.windChangeNumber}`;
}
