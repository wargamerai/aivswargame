// fog.js — 戦場の霧の段階（ユーザーの独自ルール 2026-11-03）
//   霧1: 敵は 大きさ（大・中・小）、火災、発砲、撃沈だけ分かる。結果は本当に当たったか分からない曖昧な表現
//   霧2: さらに味方も、自分の乗っている艦（先頭の艦。沈んだら二番艦）以外は損害が分からない
const FOG_PLAYER_SIDE = decodeURIComponent(location.pathname).includes('/pf/') ? 'us' : 'jp';
function fogSavedLevel() {
  try {
    const v = localStorage.getItem('fogLevel');
    if (v !== null) return parseInt(v, 10) || 0;
    return localStorage.getItem('fogOfWar') === '1' ? 1 : 0;
  } catch (e) { return 0; }
}
function fogLevel() {
  if (typeof state === 'undefined' || !state || !state.fogMode) return 0;
  return fogSavedLevel();
}
function fogSetLevel(n) {
  localStorage.setItem('fogLevel', String(n));
  localStorage.setItem('fogOfWar', n > 0 ? '1' : '0');
}
function fogLevelLabel(n) { return n === 2 ? '霧2' : n === 1 ? '霧1' : 'OFF'; }
function fogAllShips() { return [...(state.jpFleet || []), ...(state.usFleet || [])]; }
function fogSize(ship) {
  if (ship.type === 'BB' || ship.type === 'OBB') return '大';
  if (ship.type === 'DD') return '小';
  return '中';
}
// 敵の表示名: 大きさと番号だけ
function fogName(ship) {
  const list = ship.side === 'jp' ? (state.jpFleet || []) : (state.usFleet || []);
  const n = list.findIndex(s => s.name === ship.name) + 1;
  // 視認の外（火災や発砲だけ見えている）は大きさも分からない
  if (ship.side !== FOG_PLAYER_SIDE && ship.status !== 'sunk' && !fogInSight(ship)) return '不明' + n;
  return fogSize(ship) + n;
}
// 味方のどれかから視認距離（レーダーを含む）の内にいるか
function fogHexDist(c1, r1, c2, r2) {
  const q1 = c1 - (r1 - (r1 & 1)) / 2, q2 = c2 - (r2 - (r2 & 1)) / 2;
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs((q1 + r1) - (q2 + r2)));
}
function fogInSight(ship) {
  if (ship.col < 0) return false;
  const own = FOG_PLAYER_SIDE === 'jp' ? (state.jpFleet || []) : (state.usFleet || []);
  const radarRange = typeof RADAR_RANGE !== 'undefined' ? RADAR_RANGE : 20;
  return own.some(f => {
    if (f.status === 'sunk' || f.status === 'exited' || f.col < 0) return false;
    const d = fogHexDist(ship.col, ship.row, f.col, f.row);
    return d <= (state.spotRange || 0) || (!!f.radar && d <= radarRange);
  });
}
// 画面に出してよいか: 視認の外の敵は、火災と発砲のほかは存在も分からない
function fogEnemyShown(ship) {
  if (!fogIsEnemyHidden(ship)) return true;
  if (ship.status === 'sunk') return true;
  if (ship.status === 'exited' || ship.col < 0) return false;
  return fogInSight(ship) || !!ship.onFire || !!ship.firedGun1;
}
function fogIsEnemyHidden(ship) {
  return fogLevel() > 0 && state.phase !== 'report' && !!ship && ship.side !== FOG_PLAYER_SIDE;
}
function fogShort(ship) { return fogIsEnemyHidden(ship) ? fogName(ship) : ship.name; }
function fogLabel(ship) { return fogIsEnemyHidden(ship) ? fogName(ship) : `${ship.name}(${ship.type})`; }
// 自分の乗っている艦: 先頭の艦。沈むか戦場を離れたら、次の艦（二番艦）へ移る
function fogOwnShip() {
  const list = (FOG_PLAYER_SIDE === 'jp' ? (state.jpFleet || []) : (state.usFleet || []))
    .filter(s => s.status !== 'sunk' && s.status !== 'exited');
  const cur = list.find(s => s.name === state.fogOwnName);
  if (cur) return cur;
  const placed = list.filter(s => s.col >= 0 && s.colIndex >= 0)
    .sort((a, b) => a.colIndex - b.colIndex || (b.isLead ? 1 : 0) - (a.isLead ? 1 : 0) || (a.followOrder || 0) - (b.followOrder || 0));
  if (!placed.length) return null;
  state.fogOwnName = placed[0].name;
  return placed[0];
}
function fogIsOwn(ship) {
  const own = fogOwnShip();
  return !!own && own.name === ship.name;
}
// この艦の損害や結果を隠すか
function fogHidden(ship) {
  const lv = fogLevel();
  if (lv <= 0 || !ship || state.phase === 'report') return false;
  if (ship.side !== FOG_PLAYER_SIDE) return true;
  return lv >= 2 && !fogIsOwn(ship);
}
// 本当に当たったか分からない言葉（実際の命中とは関係なく選ぶ）
function fogVaguePhrase() {
  const list = ['命中の模様', '目標付近に閃光', '水柱が上がった', '至近弾の模様', '効果不明'];
  return list[Math.floor(Math.random() * list.length)];
}
// 射撃の情報: 修正と命中率は目標や射撃艦の状態が分かるので隠す
function fogMaskInfo(html, firer, target) {
  if (!fogHidden(target) && !fogHidden(firer)) return html;
  return html
    .replace(/<div class="r-row"><span class="r-label">(?:修正|命中率)<\/span>[\s\S]*?<\/span><\/div>/g, '')
    .replace(/<div style="color:#aa8;[^"]*">[\s\S]*?<\/div>/g, '');
}
// 結果の画面: 隠す艦なら、ダイス・命中数・損害を消して曖昧な言葉にする
function fogMaskResult(html, r) {
  if (!r) return html;
  let out = fogMaskInfo(html, r.firer, r.target);
  if (fogHidden(r.firer)) out = out.replace(/<div class="r-ratio[^"]*"[^>]*>[\s\S]*?<\/div>/g, '');
  if (!fogHidden(r.target)) return out;
  out = out
    .replace(/<div class="r-(?:dice|hits|ratio|dmg|crit)[^"]*"[^>]*>[\s\S]*?<\/div>/g, '')
    .replace(/<div style="color:#aaa;[^"]*">[\s\S]*?<\/div>/g, '')
    .replace(/<div style="color:#f44;[^"]*"[^>]*>[\s\S]*?<\/div>/g, '');
  const word = (r.sunk || r.critSunk) ? '💥 撃沈を確認'
    : String(r.critText || '').includes('火災') ? '🔥 火災を確認' : fogVaguePhrase();
  return out + `<div class="r-hits" style="color:#555">${word}</div>`;
}
// ログ: 隠す艦の行は書き換える。出さない行は null を返す
let _fogHide = false, _fogSaid = false;
function fogSetTarget(target) { _fogHide = fogHidden(target); _fogSaid = false; }
function fogLogLine(msg) {
  if (fogLevel() <= 0 || state.phase === 'report') return msg;
  const plain = String(msg).replace(/<[^>]*>/g, '');
  const ships = fogAllShips();
  let display = msg, enemyInLine = false;
  ships.forEach(s => {
    if (s.side !== FOG_PLAYER_SIDE && display.includes(s.name)) {
      display = display.split(s.name).join(fogName(s));
      enemyInLine = true;
    }
  });
  // 射撃の宣言の行: 距離だけ残す
  if (/\(距離\d+/.test(plain)) {
    return (_fogHide || enemyInLine) ? display.replace(/\(距離(\d+)[^)]*\)/, '(距離$1)') : display;
  }
  // 敵の動きが分かる行は出さない
  if (enemyInLine && /砲撃を控える|雷撃温存/.test(plain)) return null;
  if (/態勢構築|レーダー射撃抑制/.test(plain)) return null;
  // 損害を確定する行: 「艦名: G1 M2 → 大破」「艦名 沈没！」
  const ship = ships.find(s => plain.includes(s.name));
  if (ship && /G\+?\d+ M\+?\d+|沈没|轟沈|撃沈/.test(plain)) {
    _fogHide = fogHidden(ship);
    _fogSaid = true;
    if (!_fogHide) return display;
    if (plain.includes('既に')) return null;
    return /沈没|轟沈|撃沈/.test(plain) ? `${fogShort(ship)} 撃沈を確認` : null;
  }
  // 結果の行: 曖昧な言葉を1回だけ。火災は確かなものとして出す
  if (_fogHide && /^\s*(命中|外れ|→|損害|クリティカル|ダイス|戦力比|合計命中|⚡)/.test(plain)) {
    if (plain.includes('火災')) return '  🔥火災を確認';
    if (_fogSaid) return null;
    _fogSaid = true;
    return '  ' + fogVaguePhrase();
  }
  return display;
}
// 衝突の結果
function fogCollisionText(ship, d1, d2, dmgStr, res) {
  if (!fogHidden(ship)) {
    let t = '  ダイス: ' + d1 + ' + ' + d2 + ' = ' + (d1 + d2) + '\n  損害: ' + dmgStr + '\n';
    if (res.critText) t += '  クリティカル: ' + res.critText + '\n';
    if (res.sunk) t += '  → 沈没!\n';
    return t;
  }
  if (res.sunk) return '  撃沈を確認\n';
  if (String(res.critText || '').includes('火災')) return '  🔥火災を確認\n';
  return '  損害不明\n';
}
