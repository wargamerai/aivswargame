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
  const rows = lines.slice(1); // skip header
  const out = [];
  rows.forEach(line => {
    const c = line.split(',');
    const num = parseInt(c[0], 10);
    if (!num) return;
    // 新CSV列構造: [0]# [1-5]左国名 [6]左種別 [7-11]右国名 [12]右種別 [13]修正 [14]射程 [15]色 [16]サブ [17+]dice
    const diceKeys = ['1','2b','3','4c','5o','6','7w','8','9','0r'];
    const dice = {};
    const diceColor = {};
    diceKeys.forEach((key, i) => {
      dice[key]      = c[17 + i * 2] || '';
      diceColor[key] = c[18 + i * 2] || '';  // '赤' or ''(=黒)
    });
    const leftFactions = [c[1], c[2], c[3], c[4], c[5]].map(x => (x || '').trim()).filter(x => x);
    const rightFactions = [c[7], c[8], c[9], c[10], c[11]].map(x => (x || '').trim()).filter(x => x);
    const leftType = (c[6] || '').trim();
    const rightType = (c[12] || '').trim();
    out.push({
      num,
      leftFactions,
      rightFactions,
      leftType,
      rightType,
      restrictions: leftFactions,
      type:     leftType, // デフォルトは左種別（カード使用時に faction で実効値が決まる）
      modifier: c[13] || '',
      range:    c[14] || '',
      rncColor: (c[15] || '').trim(),
      sub:      c[16] || '',
      dice,
      diceColor,
      note: (c[37] || '').trim(),
      img:     encPath(`upfrontimages/地形カード/AD ${num}.gif`),
      imgBack: encPath(`upfrontimages/地形カード/AD Back.gif`),
    });
  });
  return out;
}

// 国別カード（左/右で種別・修正値が異なる）の実効値を、使用する faction で確定する
function applyFactionToTerrainCard(card, factionKey) {
  const t = card && card.terrain;
  if (!t || t._factionApplied) return;
  const factionLabelMap = { ger: '独', rus: 'ソ', jpn: '日', uk: '英', us: '米' };
  const factionLabel = factionLabelMap[factionKey] || factionKey;
  // 国別指定が無いカード (HILL 等) は modifier を保持
  const hasFactionSplit = (t.leftFactions && t.leftFactions.length > 0) || (t.rightFactions && t.rightFactions.length > 0);
  if (!hasFactionSplit) {
    t._factionApplied = true;
    return;
  }
  const inLeft  = t.leftFactions  && t.leftFactions.indexOf(factionLabel)  >= 0;
  const inRight = t.rightFactions && t.rightFactions.indexOf(factionLabel) >= 0;
  const mods = (t.modifier || '').split('/');
  if (inRight && t.rightType) {
    t.type = t.rightType;
    t.modifier = mods.slice(1).join('/');
  } else if (inLeft && t.leftType) {
    t.type = t.leftType;
    t.modifier = mods[0] != null ? mods[0] : t.modifier;
  }
  t._factionApplied = true;
}

function getGroupFaction(grp) {
  if (!grp || typeof state === 'undefined' || !state || !state.groups) return null;
  if (state.groups.player && state.groups.player.indexOf(grp) >= 0) return getFactionKey(state.player);
  if (state.groups.ai     && state.groups.ai.indexOf(grp)     >= 0) return getFactionKey(state.ai);
  return null;
}

function pushTerrainWithFaction(grp, card) {
  const facKey = getGroupFaction(grp);
  if (facKey) applyFactionToTerrainCard(card, facKey);
  // §24.6 グループに置かれた地雷原カードは二度とデッキに戻らない（印を付け、捨て札にせずゲームから除く）
  if (card.terrain && card.terrain.type === 'MINEFIELD') card._minefieldPlaced = true;
  // MOVEMENT カードが地形スタックに置かれたら塹壕を除去（鉄条網除去は pushTerrainToDiscard で別経路）
  if (card.terrain && card.terrain.type === 'MOVEMENT' && grp.terrain) {
    grp.terrain = grp.terrain.filter(c => !c._isTrench);
  }
  grp.terrain.push(card);
  try {
    const _w = _ufSideOfGroup(grp), _ty = card.terrain && card.terrain.type;
    if (_w && _ty === 'MOVEMENT') ufEvent(_w.side, `GROUP ${grp.name} が${{ advance: '前進', lateral: '横移動', retreat: '後退' }[card._moveMode || 'advance'] || '移動'}（距離 ${grp.distance}）`);
    else if (_w && _ty && UF_TERR_NAME[_ty]) ufEvent(_w.side === state.currentTurn ? _w.side : state.currentTurn,
      _w.side === state.currentTurn ? `GROUP ${grp.name} に「${UF_TERR_NAME[_ty]}」` : `敵の GROUP ${grp.name} に「${UF_TERR_NAME[_ty]}」を置いた`);
  } catch (e) {}
  // §27.2 卓上に残る移動カードを置いたグループは、捕捉している目標も、捕捉されている状態も失う
  if (card.terrain && card.terrain.type === 'MOVEMENT') loseAcquisitionOnMove(grp);
  // §17.42 地形カードが使われた／§17.43 移動カードを使った グループへの側面射撃は終わる（煙幕・鉄条網は除く）
  const _ty = card.terrain && card.terrain.type;
  if (_ty && _ty !== 'SMOKE' && _ty !== 'WIRE' && typeof breakFlanksOn === 'function') breakFlanksOn(grp);
  // §17.7 側方移送の成立／§17.92 新グループの設立完了（地形カードが置かれて認められた）
  if (_ty && _ty !== 'MOVEMENT' && _ty !== 'SMOKE' && _ty !== 'WIRE' && typeof onTerrainAccepted === 'function') onTerrainAccepted(grp);
  // §20.53 侵入兵: 非MOVEMENTの地形カード配置時、侵入先との相対距離が4なら侵入解除
  if (card.terrain && card.terrain.type !== 'MOVEMENT') {
    const R = window.INFANTRY_RULES;
    if (R && grp.cards && state && state.groups) {
      grp.cards.forEach(c => {
        if (!c.infiltrating) return;
        const tSide = c.infiltratedGroupSide;
        const tIdx = c.infiltratedGroupIdx;
        if (!tSide || tIdx == null) return;
        const tgtGroup = state.groups[tSide] && state.groups[tSide][tIdx];
        if (!tgtGroup) return;
        const relDist = R.relativeRange(grp.distance, tgtGroup.distance);
        if (relDist === 4) {
          c.infiltrating = false;
          delete c.infiltratedGroupSide;
          delete c.infiltratedGroupIdx;
        }
      });
    }
  }
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
  const rc = drawTerrainCard();
  if (!rc) return null;
  checkBreezeRemoveSmoke(rc); pushTerrainToDiscard(rc);
  const abs = parseInt((rc.terrain && rc.terrain.range) || '0', 10) || 0;
  const red = rc.terrain && rc.terrain.rncColor === '赤';
  const rnc = rncMode === 'signed' ? (red ? -abs : abs) : abs;
  const rpc0r = parseInt((rc.terrain.dice && rc.terrain.dice['0r']) || '0', 10) || 0;
  const wasPinned = R.isPinned(target);
  const r = R.resolveFireOnSoldier(atk + wireMod, rnc, def, wasPinned, rpc0r, commissarModOf(group), commissarModOf(group), 0, R.rpc7wOf(rc));
  if (r.result === 'WOUND') r.result = applyWound(target); // §33.1
  if (r.result === 'KIA' || r.result === 'PANIC_KIA') R.killSoldier(target);
  else if (r.result === 'PANIC_ROUT') R.routSoldier(target);
  else if (r.result === 'PIN') R.pinSoldier(target);
  return `${def.name}: 攻撃力${atk}${wireMod ? '+鉄条網1' : ''} ${rnc >= 0 ? '+' : ''}${rnc}（RNC ${red ? '赤' : '黒'}${abs}）→ ${r.result}`;
}

/** §24.31 地雷原攻撃: RPC で1つの位置を決め、RNC の数字（色に関係なく）を攻撃力に足す */
function triggerMinefieldAttack(group, card, side) {
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const rpcCard = drawTerrainCard();
  if (!rpcCard) return;
  checkBreezeRemoveSmoke(rpcCard); pushTerrainToDiscard(rpcCard);
  const target = pickByRPC(rpcCard, group);
  if (!target) return;
  const pos = group.cards.filter(c => R.isAlive(c)).indexOf(target) + 1;
  const line = _minefieldAttackSoldier(group, card, side, target, 'abs');
  if (line) alert(`§24.31 地雷原攻撃（GROUP ${group.name} の位置 ${pos}）\n${line}`);
  renderField(side);
}

/** §24.4 地雷原の上の移動カード1枚の上に自分で地形カードを置いて出る: 全員がそれぞれの RNC で攻撃を受ける（赤は－、黒は＋） */
function triggerMinefieldGroupAttack(group, card, side) {
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

// 地雷原: 縦移動・鉄条網除去時の RNC 判定（赤かつ RNC > 4 で 1 名攻撃）
function triggerMinefieldRNCCheck(group, side) {
  const R = window.INFANTRY_RULES;
  if (!R || !group.terrain) return false;
  const minefield = group.terrain.find(c => c && c.terrain && c.terrain.type === 'MINEFIELD');
  if (!minefield) return false;
  const judgeCard = drawTerrainCard();
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
  const R = window.INFANTRY_RULES;
  if (!R) return { ok: false, reason: 'no R' };
  const minefieldCard = (group.terrain || []).find(c => c && c.terrain && c.terrain.type === 'MINEFIELD');
  if (!minefieldCard) return { ok: true, hadMinefield: false };
  const moveCount = (group.terrain || []).filter(c => c && c.terrain && c.terrain.type === 'MOVEMENT').length;
  if (moveCount === 0) return { ok: false, reason: '地雷原から出るには、先に移動カードが必要です' };
  if (moveCount === 1) triggerMinefieldGroupAttack(group, minefieldCard, side);
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
      const c = drawTerrainCard();
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

/** §19 故障チェック（射撃の解決で引いた RNC ごとに呼ぶ）
 *  - 赤5: いま使っている X 値に 5 を含む射撃中の兵器（§19.15 () の火力で撃つ兵器など）が直接故障。2つ以上なら RNC で決める
 *  - 赤6: 射撃中の兵器が1つだけなら自動で故障し、残りの防御側の攻撃は解決しない（§19.11）
 *         2つ以上なら RPC で兵士を決める（§19.13）:
 *           ピン状態の兵士 → 攻撃への影響なし、兵器は故障（§19.14）
 *           すでに故障している兵器 → 除去（§19.2）、攻撃への影響なし
 *           射撃中の機関銃の助手／今の距離で火力のない兵器 → 一時的な故障: 残りの射撃力 -1、兵器は故障しない
 *           射撃中の兵器 → 故障。残りの射撃力を、その兵器の火力2（2未満の余りも）につき1減らす
 *  - §22.3 攻撃に使われている火炎放射器は、赤5・6で RPC なしに故障（捕獲兵器より優先）
 *  戻り値: 残りの防御側への射撃力の修正（負値）。§19.11 の時は state._malfStopAttack = true */
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
  const assistantIdx = new Set(Object.values(crewMap));
  const opts = { moving, crewMap };
  const total = R.calcGroupFirepower(firingGroup, factionKey, fireDistance, opts);
  // その兵士の兵器の火力（その兵士を除いた時に減るグループ火力）
  const soldierFP = c => {
    const i = firingGroup.cards.indexOf(c);
    const tmp = { cards: firingGroup.cards.filter(x => x !== c), terrain: firingGroup.terrain, crewPairs: firingGroup.crewPairs };
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
    return !!(a && R.isAlive(a) && !R.isPinned(a));
  };
  // いま使っている X 値（() の火力で撃つ兵器は [X..] の値）
  const xOf = (c, d) => {
    const ents = parseXValues(d.xVal);
    const br = ents.find(e => e.type === 'bracket');
    const nm = [].concat(...ents.filter(e => e.type === 'normal').map(e => e.values));
    const usesBracket = d.needsCrew && (moving || !hasActiveAssistant(c));
    if (usesBracket && br) return br.values;
    return nm.length ? nm : [6];
  };
  const nameOf = (c, d) => (d && d.name) || c.id;
  // 射撃中の兵器（§19.13 の例外: 火炎放射器・射撃していない侵入兵・助手本来の兵器は除く）
  const firing = firingGroup.cards.filter((c, i) => {
    if (!R.isAlive(c) || R.isPinned(c) || c.malfunctioned || c.destroyed || assistantIdx.has(i) || c._noFire) return false;
    const d = defOf(c);
    return d && !isFlame(d) && d.weaponCat && d.weaponCat !== '非武装' && soldierFP(c) > 0;
  });
  let mod = 0;
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

  // §22.3 火炎放射器: 攻撃に使われていれば、どの防御側の判定でも赤5・6で RPC を引かずに火炎放射器が故障する
  //   （§20.741 捕獲兵器と一緒なら火炎放射器の方が故障）。残りの攻撃はほかの兵器で続ける
  const flames = firingGroup.cards.filter(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c.malfunctioned || c.destroyed || c._noFire) return false;
    return isFlame(defOf(c)) && soldierFP(c) > 0;
  });
  if (flames.length > 0) {
    let t = flames[0];
    if (flames.length > 1) {
      const rc = drawTerrainCard();
      if (rc) { checkBreezeRemoveSmoke(rc); pushTerrainToDiscard(rc); if (rc.terrain.rncColor !== '赤') t = flames[1]; }
    }
    const fp = soldierFP(t);
    breakWeapon(t, defOf(t), `火炎放射器・赤${rncVal} §22.3`);
    return -reduceFor(fp);
  }

  // §20.741 捕獲兵器は赤の5か6で自動的に故障し、除去される（2つ以上なら RNC 赤→1つ目、黒→2つ目）
  const captured = firing.filter(c => c.acquiredWeapon && c.acquiredWeapon.captured);
  if (captured.length > 0) {
    let t = captured[0];
    if (captured.length > 1) {
      const rc = drawTerrainCard();
      if (rc) { checkBreezeRemoveSmoke(rc); pushTerrainToDiscard(rc); if (rc.terrain.rncColor !== '赤') t = captured[1]; }
    }
    const fp = soldierFP(t);
    const nm = nameOf(t, defOf(t));
    t.acquiredWeapon = null; // 捕獲兵器は除去。カードに印刷された兵器に戻る
    alert(`§20.741 捕獲兵器の故障: ${nm} の捕獲兵器は除去されました（赤${rncVal}）`);
    renderField('player'); renderField('ai');
    return -reduceFor(fp);
  }

  if (rncVal === 5) {
    const cands = firing.filter(c => xOf(c, defOf(c)).indexOf(5) >= 0);
    if (cands.length === 0) return 0;
    let t = cands[0];
    if (cands.length > 1) {
      const rc = drawTerrainCard();
      if (rc) { checkBreezeRemoveSmoke(rc); pushTerrainToDiscard(rc); t = cands[(parseInt(rc.terrain.range, 10) || 0) % cands.length]; }
    }
    const fp = soldierFP(t);
    breakWeapon(t, defOf(t), '赤5');
    return -reduceFor(fp);
  }
  // 赤6
  if (firing.length === 1) {
    const t = firing[0];
    breakWeapon(t, defOf(t), '赤6・射撃中の兵器が1つだけ — 残りの防御側の攻撃は解決しない §19.11');
    state._malfStopAttack = true;
    return 0;
  }
  if (firing.length === 0) return 0;
  const rpcCard = drawTerrainCard();
  if (!rpcCard) return 0;
  checkBreezeRemoveSmoke(rpcCard);
  pushTerrainToDiscard(rpcCard);
  const T = pickByRPC(rpcCard, firingGroup);
  if (!T) return 0;
  const d = defOf(T);
  if (!d || !d.weaponCat || d.weaponCat === '非武装' || T.destroyed) return 0;
  const pos = firingGroup.cards.filter(c => R.isAlive(c)).indexOf(T) + 1;
  const label = `赤6 RPC 位置${pos}`;
  if (T._noFire && !R.isPinned(T)) return 0;                            // 射撃していない兵士（侵入兵 §20.531・火炎放射器 §22.2）: 影響なし
  if (R.isPinned(T)) { breakWeapon(T, d, label + '・ピン状態の兵士 — 攻撃への影響なし §19.14'); return 0; }
  if (T.malfunctioned) { breakWeapon(T, d, label + '・すでに故障'); return 0; }
  const isAsst = assistantIdx.has(firingGroup.cards.indexOf(T));
  const fpT = soldierFP(T);
  if (isAsst || fpT <= 0) {
    alert(`§19.13 一時的な故障: ${nameOf(T, d)}（${isAsst ? '機関銃の助手' : 'この距離では火力のない兵器'}）— 残りの射撃力 -1、兵器は故障しない (${label})`);
    return -1;
  }
  breakWeapon(T, d, label);
  return -reduceFor(fpT);
}

/** §13.2 自軍グループに煙幕を置けない理由（置けるなら null）:
 *  風が出たターン / 湿地 / ピン状態でない指揮官（SL・ASL）がいない */
function smokeBlockReason(grp, side) {
  const R = window.INFANTRY_RULES;
  if (state.isNight) return '夜間シナリオでは煙幕は非機能カードです（置けません）'; // §13.26
  if (state.breezeTurn != null && state.breezeTurn === (state.turnCount || 0)) return '風が出たターンには煙幕を置けません';
  if (marshBlocksOverlay(grp)) return '湿地には移動カード2枚を置くまで煙幕を置けません';
  const facKey = getFactionKey(side === 'player' ? state.player : state.ai);
  const hasLeader = R && grp.cards.some(c => {
    if (!R.isAlive(c) || R.isPinned(c)) return false;
    const def = R.lookupSoldier(c, facKey);
    return !!(def && (def.leader === '分隊長' || def.leader === '副分隊長' || def.afv)); // §13.2 ピン状態でない AFV のいるグループにも置ける
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

/** §8.42 湿地に移動カード2枚が置かれるまでは鉄条網・煙幕を置けない（上の煙幕・鉄条網は飛ばして判定） */
function marshBlocksOverlay(grp) {
  const t = grp && grp.terrain;
  if (!t) return false;
  let moves = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    const ty = t[i] && t[i].terrain && t[i].terrain.type;
    if (ty === 'SMOKE' || ty === 'WIRE') continue;
    if (ty === 'MOVEMENT') { moves++; continue; }
    return ty === 'MARSH' && moves < 2;
  }
  return false;
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
  if (marshBlocksOverlay(grp)) return '湿地には移動カード2枚を置くまで鉄条網を置けません';
  // 河川: 渡河に成功（河川の上に移動カードが置かれる）した後のみ。上の煙幕・鉄条網は飛ばして判定
  const t = grp.terrain || [];
  let moves = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    const ty = t[i] && t[i].terrain && t[i].terrain.type;
    if (ty === 'SMOKE' || ty === 'WIRE') continue;
    if (ty === 'MOVEMENT') { moves++; continue; }
    if (ty === 'STREAM' && moves === 0) return '河川には渡河に成功した後でなければ鉄条網を置けません';
    break;
  }
  return null;
}

/** 地形以外の手札は全て平地として置ける。平地として置くカードか */
function isPlainUseCard(card) {
  if (!card || !card.terrain) return false;
  // §シナリオ: 使わない地形カード（攻撃側だけ使えないカードは、プレイヤーが攻撃側の時だけ）
  if (window.SCENARIO_HELPERS && window.SCENARIO_HELPERS.isCardDisabledAsTerrain(state.scenario, card, state.playerRole === 'attacker')) return true;
  const placeable = ['WOODS','BUILDINGS','HILL','GULLY','WALL','BRUSH','STREAM','MARSH','SMOKE','WIRE','MINEFIELD','PILLBOX'];
  return placeable.indexOf(card.terrain.type) < 0;
}

/** 煙幕・鉄条網を無視した最上のカードが移動カードか（平地を置ける＝移動中） */
function isMovingIgnoringOverlays(grp) {
  const t = (grp && grp.terrain) || [];
  for (let i = t.length - 1; i >= 0; i--) {
    const ty = t[i] && t[i].terrain && t[i].terrain.type;
    if (ty === 'SMOKE' || ty === 'WIRE') continue;
    return ty === 'MOVEMENT';
  }
  return false;
}

/** 手札のカードを平地として移動中のグループに置く。
 *  §13.5 煙幕・鉄条網はそのまま残し、その下（移動カードの上）に平地を置く。移動カードと下の地形は捨て札 */
function placePlainOnGroup(grp, card) {
  const overlays = [];
  for (let i = grp.terrain.length - 1; i >= 0; i--) {
    const ty = grp.terrain[i] && grp.terrain[i].terrain && grp.terrain[i].terrain.type;
    if (ty !== 'SMOKE' && ty !== 'WIRE') break;
    overlays.unshift(grp.terrain.pop());
  }
  while (grp.terrain.length > 0) pushTerrainToDiscard(grp.terrain.pop());
  const plain = {
    terrain: { type: 'PLAIN', modifier: '0', range: '0', rncColor: '黒', dice: {} },
    terrainIndex: terrainIndexFromCard(card), // 捨て札時は元のカードとして戻す
    _faceDown: true,
    _isPlain: true
  };
  grp.terrain.push(plain);
  overlays.forEach(c => grp.terrain.push(c));
  grp.flankingTarget = null;
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

