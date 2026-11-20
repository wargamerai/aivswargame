// アップフロント: パスの補助・地形カードのデータ
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== パスエンコードヘルパ =====
// ローカル(macOS)では NFD, GitHub Pages 等のリモートでは NFC で保存される。
// location.protocol で切替: file:// → NFD, http(s):// → NFC
function encPath(p) {
  const form = (location.protocol === 'file:') ? 'NFD' : 'NFC';
  return p.normalize(form).split('/').map(s => encodeURIComponent(s)).join('/');
}

// ===== 地形カードデータ =====
let TERRAIN_CARDS = []; // { num, type, modifier, range, sub, dice:{1,2,3,4,5,6,7,8,9,0}, note, img, restrictions }

function parseTerrainCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  // 外部CSVには修正列が2つあり、埋め込みCSVには1つだけある。
  const rangeIndex = splitCSVLine(lines[0] || '').indexOf('射程');
  const rncIndex = rangeIndex >= 0 ? rangeIndex : 14;
  const rows = lines.slice(1);
  const out = [];
  rows.forEach(line => {
    const c = splitCSVLine(line);
    const num = parseInt(c[0], 10);
    if (!num) return;
    // 射程列の後ろに色・サブ・RPC（値と色の組）が続く。
    const diceKeys = ['1','2b','3','4c','5o','6','7w','8','9','0r'];
    const dice = {};
    const diceColor = {};
    diceKeys.forEach((key, i) => {
      dice[key]      = c[rncIndex + 3 + i * 2] || '';
      diceColor[key] = c[rncIndex + 4 + i * 2] || '';  // '赤' or ''(=黒)
    });
    const leftFactions = [c[1], c[2], c[3], c[4], c[5]].map(x => (x || '').trim()).filter(x => x);
    const rightFactions = [c[7], c[8], c[9], c[10], c[11]].map(x => (x || '').trim()).filter(x => x);
    const leftType = (c[6] || '').trim();
    const rawRightType = (c[12] || '').trim();
    const rightType = { 平地: 'COWER', 隠蔽: 'CONCEALED' }[rawRightType] || rawRightType;
    out.push({
      num,
      leftFactions,
      rightFactions,
      leftType,
      rightType,
      restrictions: leftFactions,
      type:     leftType, // デフォルトは左種別（カード使用時に faction で実効値が決まる）
      modifier: c[13] || '',
      rightModifier: rncIndex > 14 ? c[14] || '' : c[13] || '',
      range:    c[rncIndex] || '',
      rncColor: (c[rncIndex + 1] || '').trim(),
      sub:      c[rncIndex + 2] || '',
      dice,
      diceColor,
      note: (c[rncIndex + 23] || '').trim(),
      img:     encPath(`upfrontimages/地形カード/AD ${num}.gif`),
      imgBack: encPath(`upfrontimages/地形カード/AD Back.gif`),
    });
  });
  return out;
}

const ACTION_CARD_NATIONALITY = { ger: '独', rus: 'ソ', jpn: '日', uk: '英', us: '米', fra: '独' };

// §2.21 斜線の両側は別の用途。判定カードの原表と盤面に出した面は切り替えない。
function nationalActionFaces(printed, faction, game = state) {
  if (!printed.rightType) return null;
  const troop = troopTypeOf(faction, game);
  if (faction === 'ita' && troop !== 'bersaglieri' || troop === 'reservists') return [];
  const mark = faction === 'ita' ? '独' : ACTION_CARD_NATIONALITY[faction];
  if (!mark) return null;
  const faces = [];
  if (printed.leftFactions.includes(mark)) {
    faces.push({ ...printed, nationalFace: 0 });
  }
  if (printed.rightFactions.includes(mark)) {
    faces.push({ ...printed, type: printed.rightType, modifier: printed.rightModifier, nationalFace: 1 });
  }
  return faces;
}

function handActionFaces(card, side) {
  if (!card?.terrain) return [];
  const H = window.SCENARIO_HELPERS;
  const faces = card.nationalFaces || [card.terrain];
  return faces.filter(face => !H.isCardDisabledAsTerrain(state.scenario,
    { terrain: face, nationalFaces: card.nationalFaces, terrainIndex: card.terrainIndex },
    state[side + 'Role'] === 'attacker'));
}

function handActionFace(card, type, side) {
  return handActionFaces(card, side).find(face => face.type === type);
}

/** §14.4 狙撃兵の除去後やシナリオで無効の間は、狙撃カードを使えない。 */
function sniperCardPlayable(card, side) {
  return card?.terrain?.type === 'SNIPER' && !state[side + 'SniperDisabled'] &&
    !window.SCENARIO_HELPERS.isCardDisabledAsTerrain(state.scenario, card, state[side + 'Role'] === 'attacker');
}

function handCardIsCower(card, side) {
  if (card?.terrain?.type === 'SNIPER') return !sniperCardPlayable(card, side);
  if (card?.nationalFaces) return !handActionFaces(card, side).some(face => face.type !== 'COWER');
  return card?.terrain?.type === 'COWER' || window.SCENARIO_HELPERS.isCardDisabledAsTerrain(
    state.scenario, card, state[side + 'Role'] === 'attacker');
}

function useHandActionFace(card, face) {
  if (!face) return false;
  card.terrain = face;
  return true;
}

function handActionCardIndex(side, type, accepts = () => true) {
  return state[side + 'Hand'].findIndex(card => {
    const face = handActionFace(card, type, side);
    return face && accepts(face, card) && useHandActionFace(card, face);
  });
}

function aiActionCardIndex(type, accepts) {
  return handActionCardIndex('ai', type, accepts);
}

function getGroupFaction(grp) {
  if (!grp || typeof state === 'undefined' || !state || !state.groups) return null;
  if (state.groups.player && state.groups.player.indexOf(grp) >= 0) return getFactionKey(state.player);
  if (state.groups.ai     && state.groups.ai.indexOf(grp)     >= 0) return getFactionKey(state.ai);
  return null;
}

function entrenchAllowed(group, side) {
  const R = window.INFANTRY_RULES;
  return group && !group.eliminated && groupCanEntrench(group, side) && !isMovingIgnoringOverlays(group) &&
    !group.cards.some(c => R.isAlive(c) && (R.isPinned(c) || c.infiltrating)) && !R.hasTerrainType(group, 'WIRE') &&
    !R.hasTerrainType(group, 'TRENCH') && ['PLAIN','WOODS','HILL','BRUSH'].includes(R.currentTerrainType(group));
}
function placeEntrenchment(group) {
  pushTerrainWithFaction(group, {
    terrain: { type: 'TRENCH', modifier: '/-1', range: '0', rncColor: '黒', dice: {} },
    _isTrench: true
  });
}
function discardUnclaimedWeapons(group) {
  if (group.weaponPool?.length) group.weaponPool.length = 0;
}
/** §45.6 / §50.7: 重いMMG・ATRの移動に必要なクルーを確認する。 */
function abandonUnsupportedHeavyWeapons(group, usingMovementCard = true) {
  const side = _groupSideIdx(group)?.side;
  if (!side) return;
  const R = window.INFANTRY_RULES;
  const faction = getFactionKey(state[side]);
  const ready = card => R.isAlive(card) && !R.isPinned(card) && !R.isWoundActive(card) && !card.transfer;
  for (const card of group.cards) {
    if (!R.isAlive(card) || card.transfer) continue;
    const weapon = weaponOfCard(card, faction);
    const italian = weapon?.fac === 'ita';
    if (!(weapon?.fac === 'jpn' || italian && usingMovementCard) ||
        !/^(中機関銃|対戦車ライフル)/.test(weapon.weaponCat)) continue;
    const assistant = group.cards.find(other => other.num === Number(group.crewPairs?.[card.num]));
    const eligible = ready(card) && ready(assistant) && (!italian ||
      (!card.wounded && !assistant.wounded && !secondaryWeaponOn(card, faction) && !secondaryWeaponOn(assistant, faction) &&
       !weaponOfCard(assistant, faction)?.needsCrew));
    if (eligible) continue;
    installAcquiredWeapon(group, card, UNARMED_WEAPON);
    const section = italian ? '§50.7' : '§45.6';
    const message = radioText(`${weapon.weaponName} は移動に必要なクルーを欠き、放棄されました（${section}）。`,
      `${weapon.weaponName} was abandoned for lack of a crew able to move it (${section}).`);
    if (side === 'player') alert(message);
    else ufReportLog(side, message, side);
  }
}

function pushTerrainWithFaction(grp, card) {
  const type = card.terrain?.type;
  if (type === 'TRENCH') {
    grp.terrain.push(card);
    return;
  }
  if (type && type !== 'SMOKE' && type !== 'WIRE') {
    discardUnclaimedWeapons(grp);
    if (state.phase === 'play') abandonUnsupportedHeavyWeapons(grp, type === 'MOVEMENT');
  }
  if (type === 'MOVEMENT' || type === 'WIRE') clearOutgoingFlanks(grp); // §17.41
  if (!['MOVEMENT','SMOKE','WIRE'].includes(card.terrain?.type)) delete grp._overrunTargets;
  // §24.6 グループに置かれた地雷原カードは二度とデッキに戻らない（印を付け、捨て札にせずゲームから除く）
  if (card.terrain && card.terrain.type === 'MINEFIELD') card._minefieldPlaced = true;
  // MOVEMENT カードが地形スタックに置かれたら塹壕を除去（鉄条網除去は pushTerrainToDiscard で別経路）
  if (card.terrain && card.terrain.type === 'MOVEMENT' && grp.terrain) {
    grp.terrain = grp.terrain.filter(c => !c._isTrench);
    const side = _groupSideIdx(grp)?.side;
    if (side) grp.cards.filter(c => infantryGunProfile(c,side)).forEach(c => { c._infantryGunUsed = true; });
  }
  grp.terrain.push(card);
  if (card.terrain?.type === 'MOVEMENT' && grp.terrain.some(terrain => terrain._surpriseBuilding) &&
      window.INFANTRY_RULES.currentTerrainType(grp) !== 'BUILDINGS') {
    grp.terrain = grp.terrain.filter(terrain => !terrain._surpriseBuilding);
  }
  try {
    const _w = _ufSideOfGroup(grp), _ty = card.terrain && card.terrain.type;
    if (_w && _ty === 'MOVEMENT') ufEvent(_w.side, `GROUP ${grp.name} が${{ advance: '前進', lateral: '横移動', retreat: '後退' }[card._moveMode || 'advance'] || '移動'}（距離 ${grp.distance}）`);
    else if (_w && _ty && UF_TERR_NAME[_ty]) ufEvent(_w.side === state.currentTurn ? _w.side : state.currentTurn,
      _w.side === state.currentTurn ? `GROUP ${grp.name} に「${UF_TERR_NAME[_ty]}」` : `敵の GROUP ${grp.name} に「${UF_TERR_NAME[_ty]}」を置いた`);
  } catch (e) {}
  // §27.2 卓上に残る移動カードを置いたグループは、捕捉している目標も、捕捉されている状態も失う
  if (type === 'MOVEMENT') {
    loseAcquisitionOnMove(grp);
    window.CC_ACTION?.clearInfiltration(grp, 'move'); // §20.53 自分のグループの移動で侵入が解除される。
  }
  // §17.42 地形カードが使われた／§17.43 移動カードを使った グループへの側面射撃は終わる（煙幕・鉄条網は除く）
  const _ty = card.terrain && card.terrain.type;
  if (_ty && _ty !== 'SMOKE' && _ty !== 'WIRE' && typeof breakFlanksOn === 'function') breakFlanksOn(grp);
  // §17.7 側方移送の成立／§17.92 新グループの設立完了（地形カードが置かれて認められた）
  if (_ty && _ty !== 'MOVEMENT' && _ty !== 'SMOKE' && _ty !== 'WIRE' && typeof onTerrainAccepted === 'function') onTerrainAccepted(grp);
}

// トーチカ持ち判定 (包囲/CC/側面攻撃/隠蔽の対象外判定用)
function hasPillbox(group) {
  return !!(group && group.terrain && group.terrain.some(c => c && c.terrain && c.terrain.type === 'PILLBOX'));
}

// 地雷原配置時のランダム1名攻撃
/** §24.31/§24.32 地雷原の攻撃を兵士1人に解決する。rncMode: 'abs'＝RNC の数字を色に関係なく足す（24.31）、'signed'＝赤は－・黒は＋（24.4） */
function _minefieldAttackSoldier(group, card, side, target, rncMode) {
  const R = window.INFANTRY_RULES;
  const atkMatch = (card.terrain.modifier || '').match(/Atk:(\d+)/);
  const atk = atkMatch ? parseInt(atkMatch[1], 10) : 4;
  const wireMod = R.hasTerrainType(group, 'WIRE') ? 1 : 0; // §24.32 修正を加えられるのは鉄条網だけ
  const facKey = side === 'player' ? getFactionKey(state.player) : getFactionKey(state.ai);
  const def = R.lookupSoldier(target, facKey);
  if (!def) return null;
  const rc = drawRandomReinforcementRnc();
  if (!rc) return null;
  checkBreezeRemoveSmoke(rc); pushTerrainToDiscard(rc);
  const abs = parseInt((rc.terrain && rc.terrain.range) || '0', 10) || 0;
  const red = rc.terrain && rc.terrain.rncColor === '赤';
  if (window.AFV?.isAfvCard(target)) {
    const signed = red ? -abs : abs;
    const result = window.AFV.applyMinefieldHit(group, target, signed, wireMod);
    return `${def.name}: 地雷原 1${wireMod ? '+鉄条網1' : ''}（RNC ${red ? '赤' : '黒'}${abs}）→ ${result}`;
  }
  const rnc = rncMode === 'signed' ? (red ? -abs : abs) : abs;
  const rpc0r = parseInt((rc.terrain.dice && rc.terrain.dice['0r']) || '0', 10) || 0;
  const wasPinned = R.isPinned(target);
  const moraleMod = commissarModOf(group, target) - R.weaponMoralePenalty(target, def);
  const panicMod = moraleMod - Number(Boolean(group.encircled && wasPinned));
  const r = R.resolveFireOnSoldier(atk + wireMod, rnc, def, wasPinned, rpc0r, moraleMod, panicMod, 0, R.rpc7wOf(rc));
  r.result = berserkFireResult(r, group, target, def, side, rpc0r);
  if (r.result === 'WOUND') r.result = applyWound(target); // §33.1
  if (r.result === 'KIA' || r.result === 'PANIC_KIA') R.killSoldier(target);
  else if (r.result === 'PANIC_ROUT') R.routSoldier(target);
  else if (r.result === 'PIN') r.result = applyPersonnelPin(target);
  return `${def.name}: 攻撃力${atk}${wireMod ? '+鉄条網1' : ''} ${rnc >= 0 ? '+' : ''}${rnc}（RNC ${red ? '赤' : '黒'}${abs}）→ ${r.result}`;
}

/** §24.31 地雷原攻撃: RPC で1つの位置を決め、RNC の数字（色に関係なく）を攻撃力に足す */
function triggerMinefieldAttack(group, card, side) {
  return withDeckAttack(() => triggerMinefieldAttackInProgress(group, card, side));
}

function triggerMinefieldAttackInProgress(group, card, side) {
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const rpcCard = drawTerrainCard();
  if (!rpcCard) return;
  checkBreezeRemoveSmoke(rpcCard); pushTerrainToDiscard(rpcCard);
  const targets = { cards: attackTargetsOf(group) };
  const target = pickByRPC(rpcCard, targets);
  if (!target) return;
  const pos = targets.cards.filter(R.isAlive).indexOf(target) + 1;
  const line = _minefieldAttackSoldier(group, card, side, target, 'abs');
  if (line) alert(`§24.31 地雷原攻撃（GROUP ${group.name} の位置 ${pos}）\n${line}`);
  renderField(side);
}

/** §24.4 地雷原の上の移動カード1枚の上に自分で地形カードを置いて出る: 全員がそれぞれの RNC で攻撃を受ける（赤は－、黒は＋） */
function triggerMinefieldGroupAttack(group, card, side) {
  return withDeckAttack(() => triggerMinefieldGroupAttackInProgress(group, card, side));
}

function triggerMinefieldGroupAttackInProgress(group, card, side) {
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const lines = [];
  group.cards.filter(c => R.isAlive(c)).forEach(t => {
    const line = _minefieldAttackSoldier(group, card, side, t, 'signed');
    if (line) lines.push(line);
  });
  alert(`§24.4 地雷原から移動カード1枚で出た — 全員が攻撃を受けます\n${lines.join('\n')}`);
  renderField(side);
}

/** §24.5 除去に成功した地雷原カードを裏返して平地（Open Ground）にする。§24.6 捨て札にはならない */
function flipMinefieldToPlain(mineCard) {
  return {
    terrain: { type: 'PLAIN', modifier: '0', range: '0', rncColor: '黒', dice: {} },
    terrainIndex: terrainIndexFromCard(mineCard),
    _faceDown: true,
    _isPlain: true,
    _minefieldPlaced: true
  };
}

// 地雷原カードの判定値を備考から抽出
function getMinefieldThresholds(card) {
  const t = card && card.terrain;
  const note = (t && t.note) || '';
  const modifier = (t && t.modifier) || '';
  const atkMatch = modifier.match(/Atk:(\d+)/);
  // 備考の例: 「脱出には横移動2回：赤RNC>4で攻撃発生／除去：黒RNC≧5／赤RNC>4で攻撃発生」（色の文字を許す）
  const exitMatch = note.match(/横移動2回[：:]?\s*[赤黒]?RNC>(\d+)/);
  const removeYMatch = note.match(/除去[：:]\s*[赤黒]?RNC[≧>=]+(\d+)/);
  const removeZMatch = note.match(/除去[^／]*?[／]\s*[赤黒]?RNC>(\d+)/);
  return {
    atk:    atkMatch    ? parseInt(atkMatch[1], 10)    : 4,
    exitX:  exitMatch   ? parseInt(exitMatch[1], 10)   : 4,
    removeY: removeYMatch ? parseInt(removeYMatch[1], 10) : 4,
    removeZ: removeZMatch ? parseInt(removeZMatch[1], 10) : 4,
  };
}

function minefieldMovementCount(group, mineIndex) {
  return group.terrain.slice(mineIndex + 1)
    .filter(card => card.terrain?.type === 'MOVEMENT' && card._moveMode === 'lateral').length;
}

/** §24.4・§24.6 横移動2枚で出た地雷原は捨て札に戻さない。移動カードはその場に残す。 */
function retireEscapedMinefield(group) {
  const mineIndex = group?.terrain?.findIndex(card => card.terrain?.type === 'MINEFIELD') ?? -1;
  if (mineIndex >= 0 && minefieldMovementCount(group, mineIndex) >= 2) {
    group.terrain.splice(mineIndex, 1);
  }
}

// 地雷原上の横移動・鉄条網除去の判定。2枚目の横移動も判定してから地雷原を除く。
function triggerMinefieldRNCCheck(group, side) {
  const minefield = group.terrain?.find(card => card.terrain?.type === 'MINEFIELD');
  if (!minefield) return false;
  return withDeckAttack(() => {
    const attacked = triggerMinefieldRNCCheckInProgress(group, side, minefield);
    retireEscapedMinefield(group);
    if (attacked) cleanupEliminatedGroups();
    return attacked;
  });
}

function triggerMinefieldRNCCheckInProgress(group, side, minefield) {
  const judgeCard = drawRandomReinforcementRnc(side);
  if (!judgeCard) return false;
  const rncAbs = parseInt((judgeCard.terrain && judgeCard.terrain.range) || '0', 10) || 0;
  const isRed = judgeCard.terrain && judgeCard.terrain.rncColor === '赤';
  showJudgeCard(judgeCard);
  checkBreezeRemoveSmoke(judgeCard);
  pushTerrainToDiscard(judgeCard);
  // §24.4 赤で、地雷原カードの説明文の2行目の数字より大きければ、もう1人が攻撃を受ける
  if (isRed && rncAbs > getMinefieldThresholds(minefield).exitX) {
    triggerMinefieldAttack(group, minefield, side);
    return true;
  }
  return false;
}

// §24.4 地雷原から自分の地形カードで出る:
//   横向きの移動カード2枚（1ターンに1枚ずつ）なら脱出に成功している → 攻撃なしで地形を置ける
//   移動カード1枚の上に地形カードを置いたら出られるが、全員が攻撃を受ける
//   （各移動カードを置いた時の RNC 判定は triggerMinefieldRNCCheck で行う）
function processMinefieldEscape(group, side) {
  const mineIndex = group.terrain.findIndex(card => card.terrain?.type === 'MINEFIELD');
  if (mineIndex < 0) return { ok: true, hadMinefield: false };
  const moveCount = minefieldMovementCount(group, mineIndex);
  if (moveCount === 0) return { ok: false, reason: '地雷原から出るには、先に移動カードが必要です' };
  if (moveCount === 1) triggerMinefieldGroupAttack(group, group.terrain[mineIndex], side);
  return { ok: true, hadMinefield: true, lateralCount: moveCount };
}

function applyTerrainCsvText(text) {
  TERRAIN_CARDS = parseTerrainCSV(text);
  if (state && state.player && document.getElementById('game') && document.getElementById('game').classList.contains('active')) {
    initTerrainDeck();
  } else {
    updateDeckCounts();
  }
  console.log(`地形カード読込: ${TERRAIN_CARDS.length} 枚`);
  if (state && state.player && state.playerHand && state.playerHand.length === 0) {
    ensureTerrainDeck();
    for (let i = 0; i < state.player.handMax; i++) {
      const c = drawTerrainCard('player');
      if (c) state.playerHand.push(c);
    }
    renderHands();
  }
}

function getScenarioDeckCycles() {
  return (state.scenario && state.scenario.deckCycles != null) ? state.scenario.deckCycles : 3;
}

function shuffleTerrainIndices(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initTerrainDeck() {
  if (!TERRAIN_CARDS.length) return;
  const indices = TERRAIN_CARDS.map((_, i) => i);
  state.deckRemoved = {};
  state.woundCheckPending = false;
  state.reinforcementsUsed = {};
  state.reinforcementStart = {};
  state.partisanSniperChecks = {};
  state.terrainDeck = {
    draw: shuffleTerrainIndices(indices),
    discard: [],
    cycle: 0,
    gameOver: false,
  };
  updateDeckCounts();
}

function ensureTerrainDeck() {
  if (!state.terrainDeck && TERRAIN_CARDS.length) initTerrainDeck();
}

/** X値文字列をパースして故障対象のRPC値セットを返す
 *  例: "X6" → [6], "[X5-6] X6" → [{bracket:[5,6]}, {normal:[6]}], "X5-6" → [5,6] */
function parseXValues(xVal) {
  if (!xVal) return [];
  const results = [];
  // [X5-6] 形式（括弧内＝クルー無し時の武器）
  const bracketMatch = xVal.match(/\[X(\d)(?:-(\d))?\]/);
  if (bracketMatch) {
    const from = parseInt(bracketMatch[1], 10);
    const to = bracketMatch[2] != null ? parseInt(bracketMatch[2], 10) : from;
    const vals = [];
    for (let v = from; v <= to; v++) vals.push(v);
    results.push({ type: 'bracket', values: vals });
  }
  // 括弧外の X値
  const normalMatches = xVal.replace(/\[X\d(?:-\d)?\]\s*/g, '').match(/X(\d)(?:-(\d))?/g);
  if (normalMatches) {
    normalMatches.forEach(m => {
      const mm = m.match(/X(\d)(?:-(\d))?/);
      if (mm) {
        const from = parseInt(mm[1], 10);
        const to = mm[2] != null ? parseInt(mm[2], 10) : from;
        const vals = [];
        for (let v = from; v <= to; v++) vals.push(v);
        results.push({ type: 'normal', values: vals });
      }
    });
  }
  return results;
}

/** §19.5 迫撃砲の故障: 命中判定の RNC でだけ、迫撃砲そのものが故障の対象（小文字 x の兵器）。
 *  赤の RNC が迫撃砲の故障数値（クルーなしなら [X..] の値、クルーありなら X.. の値）に当たれば故障 */
function checkMortarMalfunction(judgeCard, group, shooter) {
  if (!judgeCard || !judgeCard.terrain || judgeCard.terrain.rncColor !== '赤' || !shooter || !shooter.def) return false;
  const rncVal = parseInt(judgeCard.terrain.range, 10) || 0;
  const M = window.MORTAR_RULES;
  const ents = parseXValues(shooter.def.xVal);
  const br = ents.find(e => e.type === 'bracket');
  const nm = [].concat(...ents.filter(e => e.type === 'normal').map(e => e.values));
  const hasCrew = !!(M && M.hasAssistant && M.hasAssistant(group, shooter.idx));
  const vals = (!hasCrew && br) ? br.values : (nm.length ? nm : [6]);
  if (vals.indexOf(rncVal) < 0) return false;
  const card = shooter.card || group.cards[shooter.idx];
  if (!card) return false;
  card.malfunctioned = true;
  alert(`§19 迫撃砲故障: ${shooter.def.name || card.id}（赤${rncVal}${hasCrew ? '' : '・クルーなし'}）`);
  renderField('player'); renderField('ai');
  return true;
}

/** §19 射撃の各RNCで兵器故障を調べ、残りの射撃力への修正を返す。
 *  赤5は該当兵器のみ、赤6で複数の候補があるときは移送中を除く全員の位置でRPCを引く。 */
function checkMalfunction(judgeCard, firingGroup, factionKey, fireDistance, currentStrength) {
  if (!judgeCard || !judgeCard.terrain) return 0;
  if (judgeCard.terrain.rncColor !== '赤') return 0;
  const rncVal = parseInt(judgeCard.terrain.range, 10) || 0;
  if (rncVal !== 5 && rncVal !== 6) return 0;
  if (!firingGroup) return 0;
  const R = window.INFANTRY_RULES;
  if (!R) return 0;
  const moving = isMovingIgnoringOverlays(firingGroup);
  const crewMap = buildCrewMapFromPairs(firingGroup);
  const ownerByAssistant = new Map(Object.entries(crewMap).map(([owner, assistant]) => [assistant, firingGroup.cards[owner]]));
  const bracketTerrain = R.isInMarsh(firingGroup) || R.isInStream(firingGroup) || R.hasTerrainType(firingGroup, 'WIRE');
  const opts = { moving, crewMap };
  const total = R.calcGroupFirepower(firingGroup, factionKey, fireDistance, opts);
  // その兵士の兵器の火力（その兵士を除いた時に減るグループ火力）
  const soldierFP = c => {
    const i = firingGroup.cards.indexOf(c);
    const tmp = { ...firingGroup, cards: firingGroup.cards.filter(x => x !== c) };
    const cm = {}; Object.keys(crewMap).forEach(o => { if (Number(o) !== i && crewMap[o] !== i) {
      const no = firingGroup.cards[o], na = firingGroup.cards[crewMap[o]];
      cm[tmp.cards.indexOf(no)] = tmp.cards.indexOf(na); } });
    return Math.max(0, total - R.calcGroupFirepower(tmp, factionKey, fireDistance, { moving, crewMap: cm }));
  };
  const defOf = c => R.lookupSoldier(c, factionKey);
  const isFlame = d => !!(d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0);
  const hasActiveAssistant = c => {
    const i = firingGroup.cards.indexOf(c);
    const a = crewMap[i] != null ? firingGroup.cards[crewMap[i]] : null;
    return !!(a && R.isAlive(a) && !R.isPinned(a) && !a.transfer);
  };
  // いま使っている X 値（() の火力で撃つ兵器は [X..] の値）
  const xOf = (c, d) => {
    const ents = parseXValues(d.xVal);
    const br = ents.find(e => e.type === 'bracket');
    const nm = [].concat(...ents.filter(e => e.type === 'normal').map(e => e.values));
    const usesBracket = d.needsCrew && (moving || c.transfer || bracketTerrain || !hasActiveAssistant(c));
    if (usesBracket && br) return br.values;
    return nm.length ? nm : [6];
  };
  const nameOf = (c, d) => (d && d.name) || c.id;
  const isArmed = def => def?.weaponCat && def.weaponCat !== '非武装';
  const firingOnlyAsOrdnance = (card, def) => Boolean(def && (def.afv || def.infantryGun ||
    def.isInfantryGun || R.isArtillery(def.weaponCat) || /^(バズーカ|パンツァーシュレック|PIAT)/i.test(def.weaponCat)) &&
    !soldierFP(card));
  const eligible = card => R.isAlive(card) && (!card.transfer || firingGroup.transferFire?.has(card));
  const positionCheck = cards => {
    const rpcCard = drawTerrainCard();
    if (!rpcCard) return null;
    checkBreezeRemoveSmoke(rpcCard);
    pushTerrainToDiscard(rpcCard);
    return pickByRPC(rpcCard, { cards });
  };
  // §19.13 現在の距離で火力が0の小火器も故障の対象に含める。
  const regularWeapons = firingGroup.cards.filter((card, index) => {
    if (!eligible(card) || R.isPinned(card) || card.malfunctioned || card.destroyed ||
        ownerByAssistant.has(index) || card._noFire) return false;
    const def = defOf(card);
    return isArmed(def) && !isFlame(def) && !firingOnlyAsOrdnance(card, def);
  });
  const firing = regularWeapons.filter(card => soldierFP(card) > 0);
  const participants = firingGroup.cards.filter(eligible);
  const woundedInMovingFire = card => (moving || card.transfer) && R.isWoundActive(card);
  const breakWeapon = (c, d, why) => {
    if (c.malfunctioned) {
      c.malfunctioned = false; c.destroyed = true;
      alert(`§19.2 兵器除去: ${nameOf(c, d)} の兵器は再び故障してプレイから除かれました（${why}）`);
    } else {
      c.malfunctioned = true;
      alert(`§19 兵器故障: ${nameOf(c, d)}（${why}）`);
    }
    renderField('player'); renderField('ai');
  };
  const reduceFor = fp => Math.ceil(fp / 2); // 火力2（2未満の余りも）につき1
  const reduceAfterMalfunction = fp => {
    if (firing.length + flames.length === 1) {
      state._malfStopAttack = true;
      return 0;
    }
    return -reduceFor(fp);
  };

  // §22.3 火炎放射器: 攻撃に使われていれば、どの防御側の判定でも赤5・6で RPC を引かずに火炎放射器が故障する
  //   （§20.741 捕獲兵器と一緒なら火炎放射器の方が故障）。ほかの兵器の残りの攻撃は同じ射撃力で続ける。
  const flames = firingGroup.cards.filter(c => {
    if (!eligible(c) || R.isPinned(c) || c.malfunctioned || c.destroyed || c._noFire) return false;
    return isFlame(defOf(c)) && soldierFP(c) > 0;
  });
  if (flames.length > 0) {
    let t = flames[0];
    if (flames.length > 1) {
      const rc = drawRandomReinforcementRnc();
      if (rc) { checkBreezeRemoveSmoke(rc); pushTerrainToDiscard(rc); if (rc.terrain.rncColor !== '赤') t = flames[1]; }
    }
    breakWeapon(t, defOf(t), `火炎放射器・赤${rncVal} §22.3`);
    if (flames.length === 1 && !firing.length) state._malfStopAttack = true;
    return 0;
  }

  // §20.741 捕獲兵器は赤の5か6で自動的に故障し、除去される（2つ以上なら RNC 赤→1つ目、黒→2つ目）
  const captured = firing.filter(c => c.acquiredWeapon && c.acquiredWeapon.captured);
  if (captured.length > 0) {
    let t = captured[0];
    if (captured.length > 1) {
      const rc = drawRandomReinforcementRnc();
      if (rc) { checkBreezeRemoveSmoke(rc); pushTerrainToDiscard(rc); if (rc.terrain.rncColor !== '赤') t = captured[1]; }
    }
    const fp = soldierFP(t);
    const nm = nameOf(t, defOf(t));
    abandonCapturedWeapon(t); // §20.741
    alert(`§20.741 捕獲兵器の故障: ${nm} の捕獲兵器は除去されました（赤${rncVal}）`);
    renderField('player'); renderField('ai');
    return reduceAfterMalfunction(fp);
  }

  if (rncVal === 5) {
    const candidates = firing.filter(card => xOf(card, defOf(card)).includes(5));
    if (!candidates.length) return 0;
    const chosen = candidates.length === 1 ? candidates[0] : positionCheck(candidates);
    if (!chosen) return 0;
    const fp = soldierFP(chosen);
    breakWeapon(chosen, defOf(chosen), '赤5');
    return fp ? reduceAfterMalfunction(fp) : 0;
  }
  // §19訂正: 射撃中の銃が1挺でも、同じ故障値を持つ別の銃や機関銃の助手がいれば位置を判定する。
  const isMGAssistant = card => {
    const owner = ownerByAssistant.get(firingGroup.cards.indexOf(card));
    return owner && firing.includes(owner) && /^[軽中]機関銃/.test(defOf(owner)?.weaponCat || '');
  };
  const candidates = participants.filter(card => {
    const def = defOf(card);
    if (!isArmed(def) || card.destroyed) return false;
    if (R.isPinned(card) || card.malfunctioned || woundedInMovingFire(card)) return true;
    return isMGAssistant(card) || (regularWeapons.includes(card) && xOf(card, def).includes(6));
  });
  if (!candidates.length) return 0;
  const chosen = candidates.length === 1 ? candidates[0] : positionCheck(participants);
  if (!candidates.includes(chosen)) return 0;
  const def = defOf(chosen);
  const label = `赤6${candidates.length > 1 ? ' RPC 位置' + (participants.indexOf(chosen) + 1) : ''}`;
  if (R.isPinned(chosen) || chosen.malfunctioned || woundedInMovingFire(chosen)) {
    breakWeapon(chosen, def, label);
    return 0;
  }
  const fp = soldierFP(chosen);
  if (isMGAssistant(chosen) || !fp) {
    const reason = isMGAssistant(chosen) ? '機関銃の助手' : 'この距離で火力なし';
    alert(`§19.13 一時的な故障: ${nameOf(chosen, def)}（${reason}）— 残りの射撃力 -1 (${label})`);
    return -1;
  }
  breakWeapon(chosen, def, label);
  return reduceAfterMalfunction(fp);
}

/** §13.2 自軍グループに煙幕を置けない理由（置けるなら null）:
 *  風が出たターン / 湿地 / ピン状態でない指揮官（SL・ASL）がいない */
function smokeBlockReason(grp, side) {
  const R = window.INFANTRY_RULES;
  if (state.isNight) return '夜間シナリオでは煙幕は非機能カードです（置けません）'; // §13.26
  if (state.breezeTurn != null && state.breezeTurn === (state.turnCount || 0)) return '風が出たターンには煙幕を置けません';
  if (R?.isInMarsh(grp)) return '湿地には移動カード2枚を置くまで煙幕を置けません';
  const facKey = getFactionKey(side === 'player' ? state.player : state.ai);
  const hasLeader = R && grp.cards.some(c => {
    if (!R.isAlive(c) || R.isPinned(c)) return false;
    const def = R.lookupSoldier(c, facKey);
    return !!(def && (def.afv ? ['us','uk','ger'].includes(facKey) :
      def.leader === '分隊長' || def.leader === '副分隊長'));
  });
  if (!hasLeader) return 'ピン状態でない指揮官（SL・ASL）か AFV がいるグループにのみ煙幕を置けます';
  return null;
}

/** §13.23 煙幕を無視した最上のカード（移動カード上の煙幕は地形配置の妨げにならない） */
function topIgnoringSmoke(grp) {
  const t = grp && grp.terrain;
  if (!t) return null;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] && t[i].terrain && t[i].terrain.type === 'SMOKE') continue;
    return t[i];
  }
  return null;
}

/** 煙幕の除去を大きく表示する */
function announceSmokeRemoval(side, grp, reason, cards) {
  if (!cards || cards.length === 0) return;
  const who = side === 'player' ? '自軍' : '敵';
  showAIAction(`煙幕除去: ${who} GROUP ${grp.name}（${reason}）`, cards);
  renderField('player'); renderField('ai');
}

/** §13.3 鉄条網を置けない理由（置けるなら null）: 湿地（移動2枚前）/ トーチカ / 渡河成功前の河川 */
function wireBlockReason(grp) {
  const R = window.INFANTRY_RULES;
  if (R && R.hasTerrainType && R.hasTerrainType(grp, 'PILLBOX')) return 'トーチカにいるグループには鉄条網を置けません';
  if (R?.isInMarsh(grp)) return '湿地には移動カード2枚を置くまで鉄条網を置けません';
  if (R?.isInStream(grp) && !R.hasCrossedStream(grp)) {
    return '河川には渡河に成功した後でなければ鉄条網を置けません';
  }
  return null;
}

/** 地形以外の手札は全て平地として置ける。平地として置くカードか */
function isPlainUseCard(card, side = 'player') {
  if (!card || !card.terrain) return false;
  // §シナリオ: 使わない地形カード（攻撃側だけ使えないカードは、プレイヤーが攻撃側の時だけ）
  if (window.SCENARIO_HELPERS && window.SCENARIO_HELPERS.isCardDisabledAsTerrain(state.scenario, card, state[side + 'Role'] === 'attacker')) return true;
  const placeable = ['WOODS','BUILDINGS','HILL','GULLY','WALL','BRUSH','STREAM','MARSH','SMOKE','WIRE','MINEFIELD','PILLBOX'];
  return placeable.indexOf(card.terrain.type) < 0;
}

/** 煙幕・鉄条網を無視した最上のカードが移動カードか（平地を置ける＝移動中） */
function isMovingIgnoringOverlays(grp) {
  if (grp?._immob || grp?._bog || grp?._stun) return false;
  const t = (grp && grp.terrain) || [];
  for (let i = t.length - 1; i >= 0; i--) {
    const ty = t[i] && t[i].terrain && t[i].terrain.type;
    if (ty === 'SMOKE' || ty === 'WIRE') continue;
    return ty === 'MOVEMENT';
  }
  return false;
}

/** §8・§24・§34 距離チットを変えず、横向きに置かなくてはならない移動。 */
function requiresLateralMovement(group, side) {
  const R = window.INFANTRY_RULES;
  return infantryGunFirstLateral(group, side) || R.hasTerrainType(group, 'MINEFIELD') ||
    (R.isInStream(group) && !R.hasCrossedStream(group)) ||
    (R.isInMarsh(group) && R.marshMoveCount(group) === 0) ||
    (window.AFV?.isAfvGroup(group) && topIgnoringSmoke(group)?.terrain?.type === 'WOODS');
}

/** §8.1 裏向きのカードで平地に入る条件。 */
function openGroundBlockReason(group, side) {
  if (!group || group.eliminated) return '配置先のグループを選んでください';
  if (!isMovingIgnoringOverlays(group) && !group.forming) return '移動中のグループにのみ平地を置けます';
  const R = window.INFANTRY_RULES;
  if (!R.canPlaceTerrainOnMarsh(group)) return '湿地から平地に出るには移動カード2枚が必要です';
  if (!R.canPlaceTerrainOnGully(group)) return '涸れ谷から平地に出るには移動カードが必要です';
  if (!R.canPlaceTerrainOnStream(group)) return '河川から平地に出るには、先に渡河を成功させてください';
  const mineIndex = group.terrain.findIndex(card => card.terrain?.type === 'MINEFIELD');
  if (mineIndex >= 0 && minefieldMovementCount(group, mineIndex) < 2) {
    return '地雷原から平地に出るには横移動カード2枚が必要です';
  }
  if (!infantryGunCanEnter(group, 'PLAIN', side)) {
    return radioText('歩兵砲の移動カードが足りません。','The infantry gun needs another Movement card.');
  }
  return null;
}

/** カードを裏返して平地にする。捨て札になるまで元のカードを記録する。 */
function placedOpenGround(card) {
  return {
    terrain: { type: 'PLAIN', modifier: '0', range: '0', rncColor: '黒', dice: {} },
    terrainIndex: terrainIndexFromCard(card),
    _faceDown: true,
    _isPlain: true
  };
}

/** §13.5 裏向きの平地を煙幕・鉄条網の下に置き、移動カードと元の地形を捨てる。 */
function placePlainOnGroup(grp, card) {
  discardUnclaimedWeapons(grp);
  if (state.phase === 'play') abandonUnsupportedHeavyWeapons(grp, false);
  const overlays = [];
  for (let i = grp.terrain.length - 1; i >= 0; i--) {
    const ty = grp.terrain[i] && grp.terrain[i].terrain && grp.terrain[i].terrain.type;
    if (ty !== 'SMOKE' && ty !== 'WIRE') break;
    overlays.unshift(grp.terrain.pop());
  }
  while (grp.terrain.length > 0) pushTerrainToDiscard(grp.terrain.pop());
  grp.terrain.push(placedOpenGround(card));
  overlays.forEach(c => grp.terrain.push(c));
  breakFlanksOn(grp); // §17.42 平地も地形カード
  onTerrainAccepted(grp); // §17.7/§17.92 平地も地形カード
}

/** グループの煙幕を全て捨て札にする（除去したら大きく表示）。戻り値: 除去枚数 */
function removeSmokeFromGroup(grp, side, reason) {
  const removed = [];
  for (let i = grp.terrain.length - 1; i >= 0; i--) {
    if (grp.terrain[i] && grp.terrain[i].terrain && grp.terrain[i].terrain.type === 'SMOKE') {
      const c = grp.terrain.splice(i, 1)[0];
      pushTerrainToDiscard(c);
      removed.push(c);
    }
  }
  announceSmokeRemoval(side, grp, reason, removed);
  return removed.length;
}

/** §13.242 プレイヤーターン終了時: 煙幕の上に移動カードが2枚残っていれば、その煙幕を除去 */
function removeSmokeUnderTwoMoves() {
  ['player', 'ai'].forEach(side => {
    (state.groups[side] || []).forEach(g => {
      if (!g || !g.terrain) return;
      const removed = [];
      let moves = 0;
      for (let i = g.terrain.length - 1; i >= 0; i--) {
        const ty = g.terrain[i] && g.terrain[i].terrain && g.terrain[i].terrain.type;
        if (ty === 'MOVEMENT') moves++;
        else if (ty === 'SMOKE' && moves >= 2) {
          const c = g.terrain.splice(i, 1)[0];
          pushTerrainToDiscard(c);
          removed.push(c);
        }
      }
      announceSmokeRemoval(side, g, '移動カード2枚', removed);
    });
  });
}

