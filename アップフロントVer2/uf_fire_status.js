// アップフロント: 隠蔽カード・射撃結果・§33 負傷・§32 捕虜
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== 隠蔽カード処理 =====
function findConcealedIndices(hand, side = 'player') {
  const out = [];
  hand.forEach((c, i) => {
    if (handActionFace(c, 'CONCEALED', side)) out.push(i);
  });
  return out;
}

function getConcealMod(cards, side) {
  let mod = 0;
  cards.forEach(c => {
    const raw = (c.terrain.modifier || '').replace(/[*⊙]/g, '');
    if (raw.indexOf('/') >= 0) {
      // "+1/-1" 形式: 隠蔽は防御側使用なのでスラッシュ右側を採用
      const parts = raw.split('/');
      mod += parseInt((parts[1] || '').replace(/[^\-+0-9]/g, ''), 10) || 0;
    } else {
      mod += parseInt(raw.replace(/[^\-+0-9]/g, ''), 10) || 0;
    }
  });
  return mod < 0 && side && partisanSide(side) ? mod - 1 : mod;
}

function buildFireStrengthPreview(cards, summary, confirm) {
  const layout = document.createElement('div');
  layout.className = 'fire-strength-preview';
  layout.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 16px;max-width:100%;';

  const cardRow = document.createElement('div');
  cardRow.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:5px;min-width:0;';
  for (const card of cards || []) {
    if (!card || !card.img) continue;
    const img = document.createElement('img');
    img.src = card.img;
    img.alt = card.terrain.type;
    img.style.cssText = 'height:' + (confirm ? 'clamp(100px, 27vh, 210px)' : '70px') + ';border-radius:4px;';
    cardRow.appendChild(img);
  }
  if (cardRow.childElementCount) layout.appendChild(cardRow);

  const values = document.createElement('div');
  values.style.cssText = 'text-align:left;padding:8px 12px;background:#211e18;color:#fff5db;border-radius:5px;min-width:125px;';
  for (const text of [`カードの射撃力 ${summary.raw}`, ...summary.mods]) {
    const line = document.createElement('div');
    line.textContent = text;
    values.appendChild(line);
  }
  const total = document.createElement('strong');
  total.style.cssText = 'display:block;color:#ffe08e;font-size:20px;margin-top:5px;padding-top:4px;border-top:1px solid #80664a;';
  total.textContent = `${confirm ? '最終火力' : '隠蔽前の火力'} ${summary.total}`;
  values.appendChild(total);
  if (summary.varies) {
    const note = document.createElement('small');
    note.textContent = '兵士ごとの修正は判定結果に表示';
    values.appendChild(note);
  }
  layout.appendChild(values);
  return layout;
}

/** 撃たれる時の予告: ヒーローの確認・隠蔽カードの選択の前に、どの敵がどのグループをどれだけの火力で撃つかを
 *  画面の上に出し、撃つ敵のグループと撃たれる自分のグループを光らせる。info = { si, ti, title, cards, lines } */
function setIncomingAttack(info) {
  state._incoming = info;
  let b = document.getElementById('incoming-banner');
  if (!b) { b = document.createElement('div'); b.id = 'incoming-banner'; document.body.appendChild(b); }
  b.innerHTML = '';
  const t = document.createElement('div'); t.className = 'ib-title'; t.textContent = info.title; b.appendChild(t);
  if (info.fireSummary) {
    b.appendChild(buildFireStrengthPreview(info.cards, info.fireSummary, false));
  } else if (info.cards && info.cards.length) {
    const row = document.createElement('div'); row.className = 'ib-cards';
    info.cards.forEach(c => { if (c && c.img) { const im = document.createElement('img'); im.src = c.img; row.appendChild(im); } });
    b.appendChild(row);
  }
  (info.lines || []).forEach(l => { const d = document.createElement('div'); d.textContent = l; b.appendChild(d); });
  b.style.display = 'block';
  renderField('ai'); renderField('player');
}
function clearIncomingAttack() {
  if (!state._incoming) return;
  state._incoming = null;
  const b = document.getElementById('incoming-banner');
  if (b) b.style.display = 'none';
  renderField('ai'); renderField('player');
}
const _sgn = n => (n > 0 ? '+' + n : String(n));

/** プレイヤーに隠蔽カード選択モーダルを表示し、選択結果をPromiseで返す */
function askPlayerConcealment() {
  const indices = findConcealedIndices(state.playerHand);
  if (indices.length === 0) return Promise.resolve([]);
  return new Promise(resolve => {
    const modal = document.getElementById('conceal-modal');
    const grid = document.getElementById('conceal-cards');
    grid.innerHTML = '';
    const selected = new Set();
    modal.style.display = 'flex';
    const useBtn = document.getElementById('conceal-use');
    const skipBtn = document.getElementById('conceal-skip');
    const updateUseBtn = () => {
      useBtn.disabled = selected.size === 0;
      useBtn.style.opacity = selected.size === 0 ? '0.4' : '1';
      useBtn.style.cursor = selected.size === 0 ? 'not-allowed' : 'pointer';
    };
    indices.forEach(idx => {
      const card = state.playerHand[idx];
      const wrap = document.createElement('div');
      wrap.style.cssText = 'cursor:pointer; border:2px solid #555; border-radius:4px; padding:2px; transition:all 0.15s;';
      const img = document.createElement('img');
      img.src = card.img;
      img.style.cssText = 'width:90px; display:block; border-radius:3px;';
      wrap.appendChild(img);
      wrap.addEventListener('click', () => {
        // §9.1 1回の攻撃に使える隠ぺいカードは1枚だけ
        if (selected.has(idx)) { selected.delete(idx); wrap.style.borderColor = '#555'; }
        else {
          selected.clear();
          grid.querySelectorAll('div').forEach(d => { d.style.borderColor = '#555'; });
          selected.add(idx); wrap.style.borderColor = '#ffeb3b';
        }
        updateUseBtn();
      });
      grid.appendChild(wrap);
    });
    updateUseBtn();
    const cleanup = () => {
      modal.style.display = 'none';
      useBtn.replaceWith(useBtn.cloneNode(true));
      skipBtn.replaceWith(skipBtn.cloneNode(true));
    };
    document.getElementById('conceal-use').addEventListener('click', () => {
      cleanup();
      const cards = [...selected].sort((a,b) => b-a).map(i => {
        const c = state.playerHand[i];
        if (!useHandActionFace(c, handActionFace(c, 'CONCEALED', 'player'))) return null;
        state.playerHand.splice(i, 1);
        if (c) pushTerrainToDiscard(c);
        return c;
      }).filter(Boolean);
      renderHands();
      resolve(cards);
    });
    document.getElementById('conceal-skip').addEventListener('click', () => {
      cleanup();
      resolve([]);
    });
  });
}

/** AI側の隠蔽カード自動使用: 1枚あれば使う */
/** §10.4/§10.42 相手のターン: AI の攻撃を解決する前に、撃たれるグループのピン状態の兵士1名をヒーローで回復できる
 *  （アクションに数えない。使った分の補充は自分のターンの終わりまで無し §9.3） */
async function askPlayerHeroRally(tgtGroup, targets = tgtGroup?.cards || []) {
  const R = window.INFANTRY_RULES;
  if (!R || !tgtGroup || tgtGroup.italianSurrender) return;
  const heroIdx = state.playerHand.findIndex(c => c && c.terrain && c.terrain.type === 'HERO');
  if (heroIdx < 0) return;
  const pinned = targets.filter(c => R.isAlive(c) && R.isPinned(c));
  if (pinned.length === 0) return;
  const playerKey = getFactionKey(state.player);
  const nameOf = c => { const d = R.lookupSoldier(c, playerKey); return d ? d.name : c.id; };
  let picked = null;
  if (pinned.length === 1) {
    if (!confirm(`GROUP ${tgtGroup.name} が撃たれます。ヒーローカードで ${nameOf(pinned[0])} を回復しますか？`)) return;
    picked = pinned[0];
  } else {
    const list = pinned.map((c, i) => `${i + 1}: ${nameOf(c)}`).join('\n');
    const ans = prompt(`GROUP ${tgtGroup.name} が撃たれます。ヒーローカードで回復する兵士を番号で選んでください（使わない時はキャンセル）\n${list}`, '1');
    if (ans == null) return;
    const k = parseInt(ans, 10) - 1;
    if (!(k >= 0 && k < pinned.length)) return;
    picked = pinned[k];
  }
  const hero = state.playerHand.splice(heroIdx, 1)[0];
  pushTerrainToDiscard(hero);
  if (window.AFV?.isAfvCard(picked)) window.afvRallyCredit(tgtGroup, hero);
  else if (infantryGunProfile(picked, 'player')) rallyInfantryGun(picked, 1);
  else {
    R.unpinSoldier(picked);
    picked.heroRecovery = true; // §42.43
  }
  renderField('player'); renderHands();
}

/** §9.5 トーチカにいるグループには隠ぺいカードを使えない */
function canUseConcealment(grp, forOrdnance = false) {
  const R = window.INFANTRY_RULES;
  if (!grp || !R) return true;
  if (R.currentTerrainType(grp) === 'PILLBOX' || window.AFV?.isAfvGroup(grp)) return false;
  const side = _groupSideIdx(grp)?.side;
  if (!side) return true;
  const defenders = attackTargetsOf(grp).filter(R.isAlive);
  return forOrdnance ? defenders.length > 0 && !defenders.some(card => ignoresConcealment(card, side)) :
    defenders.some(card => !ignoresConcealment(card, side));
}

function aiUseConcealment() {
  const idx = aiActionCardIndex('CONCEALED');
  if (idx < 0) return [];
  const card = state.aiHand[idx];
  state.aiHand.splice(idx, 1);
  if (card) pushTerrainToDiscard(card);
  state.aiHandCount = state.aiHand.length;
  renderHands();
  return [card];
}

// ===== 射撃結果オーバーレイ =====
function resultLabel(r) {
  if (r === 'NONE') return '無傷';
  if (r === 'PANIC_KIA') return 'KIA(パニック)';
  if (r === 'PANIC_ROUT') return '潰走';
  if (r === 'BERSERK') return '狂暴兵';
  if (r === 'WOUND') return '負傷';
  if (r === 'COMMANDER_KILLED') return '車長戦死';
  if (r === 'BUTTONED') return 'ハッチ閉鎖';
  return r;
}
function resultColor(r) {
  if (r === 'KIA' || r === 'PANIC_KIA') return '#f44';
  if (r === 'PIN' || r === 'BUTTONED') return '#fd0';
  if (r === 'COMMANDER_KILLED') return '#f80';
  if (r === '潰走' || r === 'PANIC_ROUT') return '#f80';
  if (r === 'BERSERK') return '#f0f';
  if (r === 'WOUND') return '#fa0';
  return '#8f8';
}

/** 全滅グループの地形カードを捨て札にしてグループを除去 */
// §17.6 グループが包囲されているかを判定（両隣の敵が横向き移動中で距離4以下）
function isGroupEncircled(group, side) {
  const R = window.INFANTRY_RULES;
  if (!R || !R.canEncircle || !group || group.eliminated) return false;
  const enemySide = side === 'player' ? 'ai' : 'player';
  const enemyGroups = state.groups[enemySide] || [];
  const idx = state.groups[side].indexOf(group);
  if (idx < 0) return false;
  const left = enemyGroups[idx - 1], right = enemyGroups[idx + 1];
  const isGrpAlive = g => g && !g.eliminated && g.cards && g.cards.some(c => R.isAlive(c));
  const hasLateral = g => {
    const top = g && g.terrain && g.terrain.length > 0 ? g.terrain[g.terrain.length - 1] : null;
    return top && top.terrain && top.terrain.type === 'MOVEMENT' && top._moveMode === 'lateral';
  };
  return isGrpAlive(left) && isGrpAlive(right) && R.canEncircle(left, right, group) && (hasLateral(left) || hasLateral(right));
}

// ===== §33 負傷 =====
/** カードのいる側を返す */
function _sideOfCard(card) {
  for (const sd of ['player', 'ai']) if ((state.groups[sd] || []).some(g => g && g.cards.indexOf(card) >= 0)) return sd;
  return null;
}
/** 手札のヒーローカードを1枚使う（使えたら true）。player はたずねる */
function _useHeroFromHand(side, question) {
  const hand = side === 'player' ? state.playerHand : state.aiHand;
  const hi = hand.findIndex(c => c && c.terrain && c.terrain.type === 'HERO');
  if (hi < 0) return false;
  if (side === 'player' && !confirm(question)) return false;
  pushTerrainToDiscard(hand.splice(hi, 1)[0]);
  if (side === 'ai') state.aiHandCount = state.aiHand.length;
  return true;
}
/** §10.4 / §17.8: ピン直後のヒーローで潜入や移送を続けられる。 */
function applyPersonnelPin(card) {
  const R = window.INFANTRY_RULES;
  const transferring = Boolean(card.transfer);
  const side = (transferring || card.infiltrating) ? _sideOfCard(card) : null;
  if (side && !infantryGunProfile(card, side)) {
    const name = R.lookupSoldier(card, getFactionKey(state[side]))?.name || card.id;
    const action = transferring ? radioText('移送', 'transfer') : radioText('潜入', 'infiltration');
    if (_useHeroFromHand(side, radioText(
      `${name} の${action}を続けるためヒーローを使いますか？`,
      `Use a Hero to let ${name} continue their ${action}?`))) {
      if (side === 'ai') alert(`AI: ${name} はヒーローで${action}を続けます。`);
      return 'NONE';
    }
  }
  R.pinSoldier(card);
  if (card.infiltrating) window.CC_ACTION.clearSoldierInfiltration(card);
  if (transferring) updateTransfers();
  return 'PIN';
}

/** §33.1 負傷を付ける。負傷前と同じ状態（ピンか通常）のまま。
 *  §33.7 すでに負傷している兵が再び負傷したら、ヒーローカードをすぐに使わない限り KIA。戻り値: 'WOUND' | 'KIA' */
function applyWound(card) {
  const R = window.INFANTRY_RULES;
  const side = _sideOfCard(card);
  if (R.isWoundActive(card)) {
    const d = R.lookupSoldier(card, getFactionKey(side === 'player' ? state.player : state.ai));
    const name = d ? d.name : card.id;
    if (side && _useHeroFromHand(side, `${name} が再び負傷しました。ヒーローカードを使って戦死を防ぎますか？（§33.7）`)) {
      if (side === 'ai') alert(`AI: ${name} の再負傷にヒーローカードを使い、戦死を防ぎました（§33.7）`);
      return 'WOUND';
    }
    return 'KIA';
  }
  card.wounded = true;
  woundPortage(card);
  return 'WOUND';
}
window.applyWound = applyWound;

/** §21.1 爆薬（副次兵器）を持てる兵器: 非武装か、小銃・突撃銃・カービン・BAR・短機関銃 */
const SECONDARY_ELIGIBLE_WEAPONS = ['非武装', 'ボルトアクション小銃', '半自動小銃', '突撃銃', 'カービン', 'BAR自動小銃', '短機関銃'];

function secondaryWeaponEligible(card, faction) {
  const R = window.INFANTRY_RULES;
  if (!R.isAlive(card) || window.AFV?.isAfvCard(card)) return false;
  const def = card.id ? R.lookupSoldier(card, faction) : getSoldierDef(faction, card.num);
  const weapon = card.destroyed || card.flameDiscarded ? '非武装' : def?.weaponCat;
  return SECONDARY_ELIGIBLE_WEAPONS.includes(weapon) &&
    (!R.isWoundActive(card) || weapon === '非武装');
}

function reservedSecondaryWeapon(scenario, faction, number) {
  return ['panzerfaustHolders', 'antiTankMines', 'radioHolders', 'demoHolders'].find(key =>
    scenario?.[key]?.[faction]?.includes(number));
}

function secondaryWeaponOn(card, faction) {
  if (card.demoCharge) return { kind: 'demo' };
  const kind = card._secondaryWeapon === undefined ?
    reservedSecondaryWeapon(state.scenario, faction, card.num) : card._secondaryWeapon;
  if (!kind || kind === 'demoHolders' || (kind === 'radioHolders' && card._radioRemoved) ||
      (kind === 'antiTankMines' && card._magneticMineSpent) ||
      (kind === 'panzerfaustHolders' && card._panzerfaustSpent)) return null;
  return { kind, broken: kind === 'radioHolders' && Boolean(card._radioBroken) };
}
function setSecondaryWeapon(card, weapon) {
  const kind = weapon?.kind;
  card.demoCharge = kind === 'demo';
  card._secondaryWeapon = kind && kind !== 'demo' ? kind : null;
  card._radioBroken = kind === 'radioHolders' && Boolean(weapon.broken);
  card._radioRemoved = false;
  card._magneticMineSpent = false;
  card._panzerfaustSpent = false;
}
function carriesScenarioSecondary(card, faction, key) {
  return secondaryWeaponOn(card, faction)?.kind === key && secondaryWeaponEligible(card, faction);
}
function secondaryWeaponLabel(kind, translate = true) {
  const label = translate ? radioText : ja => ja;
  if (kind === 'demo') return label('爆薬', 'Demolition charge');
  if (kind === 'radioHolders') return label('無線機', 'Radio');
  if (kind === 'panzerfaustHolders') return label('パンツァーファウスト', 'Panzerfaust');
  return label('対戦車磁気地雷', 'Anti-tank magnetic mine');
}
function secondaryWeaponToken(weapon, card, faction, side) {
  const name = secondaryWeaponLabel(weapon.kind);
  return { secondary: weapon, isDemo: weapon.kind === 'demo', weaponCat: name, weaponName: name,
    fac: faction, fromNum: card.num, fromSide: side };
}
function noteSniperCheck(group, number) {
  const turn = (state.turnCount || 0) + 1;
  const previous = group._sniperCheck;
  group._sniperCheck = { turn, number: previous?.turn === turn ? Math.min(previous.number, number) : number };
}

function voluntaryPanicCandidates(group, side) {
  const R = window.INFANTRY_RULES;
  if (group?.italianSurrender) return [];
  return group?.cards.filter(card => R.isPinned(card) && R.isAlive(card) && !card._commissar &&
    !card.berserk && !card.transfer && !window.AFV.isAfvCard(card) && !infantryGunProfile(card, side)) || [];
}

function berserkTargets(group, side) {
  const R = window.INFANTRY_RULES;
  const index = state.groups[side].indexOf(group);
  return state.groups[_enemySide(side)].map((enemy, target) => ({ enemy, target }))
    .filter(({ enemy, target }) => _groupAlive(enemy) && R.relativeRangeBetweenGroups(group, enemy, {
      sameOpposing: index === target, adjacent: Math.abs(index - target) === 1
    }) === 5);
}

function berserkFireResult(resolution, group, card, def, side, rpc) {
  const result = resolution.result;
  const panic = resolution.replaced || result;
  if (card.berserk && (panic === 'PANIC_KIA' || panic === 'PANIC_ROUT')) {
    card.berserk = false;
    return 'PANIC_KIA';
  }
  if (result !== 'PANIC_KIA' || !def || !_groupSideIdx(group) ||
      !window.CC_ACTION.checkBerserkEligibility(card, def, rpc, getFactionKey(state[side]), 5) ||
      !berserkTargets(group, side).length) return result;
  if (window.INFANTRY_RULES.hasTerrainType(group, 'MINEFIELD')) return 'KIA';
  card.berserk = true;
  return 'BERSERK';
}

async function runBerserkAtTurnStart(side) {
  const R = window.INFANTRY_RULES;
  const groups = state.groups[side];
  const enemySide = _enemySide(side);
  const faction = getFactionKey(state[side]);
  for (const group of groups) {
    for (const card of group?.cards.filter(c => c.berserk && R.isAlive(c)) || []) {
      if (state.phase !== 'play' || settleDeckTimeLimit()) return;
      const definition = R.lookupSoldier(card, faction);
      const targets = berserkTargets(group, side).filter(({ enemy }) =>
        !window.AFV.isAfvGroup(enemy) || (!definition?.needsCrew && window.AFV.canAttackVehicleInCloseCombat(card, side)));
      if (!targets.length) {
        R.unpinSoldier(card);
        card.berserk = false;
      } else {
        let picked = targets[0];
        if (side === 'player' && targets.length > 1) {
          const answer = prompt(radioText('狂暴兵の攻撃先を番号で選んでください。', 'Choose a target for the berserk soldier.') +
            '\n' + targets.map(({ enemy }, i) => `${i + 1}: GROUP ${enemy.name}`).join('\n'), '1');
          picked = targets[Number(answer) - 1] || picked;
        }
        if (definition?.needsCrew) dropWeaponToPool(group, card, faction, side);
        if (window.AFV.isAfvGroup(picked.enemy)) {
          const results = await window.AFV.resolveVehicleCloseCombat(group, picked.enemy, side, card);
          if (results?.some(hit => hit.result === 'KIA')) R.unpinSoldier(card);
        } else {
          await window.CC_ACTION.executeBerserkCC(card, group, groups.indexOf(group),
            picked.enemy, enemySide, picked.target, ccDrawCard, faction);
        }
        cleanupEliminatedGroups();
      }
      renderField('player');
      renderField('ai');
    }
  }
}

function sniperCheckNumber(group, side, checked = group?._sniperCheck) {
  if (checked?.turn !== (state.turnCount || 0) || group.eliminated) return null;
  const rules = window.INFANTRY_RULES;
  const faction = getFactionKey(state[side]);
  const armed = group.cards.some(card => {
    if (!rules.isAlive(card) || rules.isPinned(card) || card.transfer) return false;
    if (window.AFV?.isAfvCard(card)) return !window.AFV.isButtoned(card);
    return infantryGunProfile(card, side) || hasPrimaryWeapon(card, faction);
  });
  return armed ? checked.number : null;
}

/** §14.4・§14.41: 成功したチェック1回につき、その狙撃兵だけを除去する。 */
function resolveSniperCheck(sniperSide, attackNumber, judge) {
  const roll = ordnanceRNC(judge);
  if (roll.red || roll.number <= attackNumber) return 'failed';
  if (!partisanSniperCheck(sniperSide)) return 'remaining';

  const extra = sniperSide + 'ExtraSnipers';
  if (state[extra] > 0) {
    state[extra]--;
    if (state.partisanSniperChecks) state.partisanSniperChecks[sniperSide] = 0;
    return 'remaining';
  }
  state[sniperSide + 'SniperDisabled'] = true;
  return 'disabled';
}

function hasPrimaryWeapon(card, fk) {
  const w = (typeof weaponOfCard === 'function') ? weaponOfCard(card, fk) : null;
  return !!(w && w.weaponCat !== '非武装' && !card.destroyed);
}
/** §21.1: 副次兵器は1個まで。 */
function demoEligible(card, faction) {
  return Boolean(card && !secondaryWeaponOn(card, faction) && secondaryWeaponEligible(card, faction));
}

/** §33.6: 負傷時は主兵器か副次兵器のどちらかを手放す。 */
function woundPortage(card) {
  const R = window.INFANTRY_RULES;
  if (!R.isAlive(card) || !R.isWoundActive(card)) return;
  const side = _sideOfCard(card);
  if (!side) return;
  const faction = getFactionKey(state[side]);
  const secondary = secondaryWeaponOn(card, faction);
  if (!secondary || !hasPrimaryWeapon(card, faction)) return;
  const group = state.groups[side].find(candidate => candidate?.cards.includes(card));
  if (!group) return;
  const destination = card.infiltrating ? state.groups[card.infiltratedGroupSide]?.[card.infiltratedGroupIdx] || group : group;
  const name = window.INFANTRY_RULES.lookupSoldier(card, faction)?.name || card.id;
  const label = secondaryWeaponLabel(secondary.kind);
  const dropSecondary = side === 'player' ?
    confirm(radioText(`${name} は負傷のため主兵器と${label}を同時に持てません。OKで${label}を、キャンセルで主兵器を手放します。`,
      `${name} is wounded. OK drops ${label}. Cancel drops the primary weapon.`)) :
    !card.infiltrating || secondary.kind !== 'demo';
  if (dropSecondary) {
    (destination.weaponPool ||= []).push(secondaryWeaponToken(secondary, card, faction, side));
    setSecondaryWeapon(card, null);
  } else {
    dropWeaponToPool(destination, card, faction, side);
    releaseFromCrew(group, card);
    if (group.crewPairs) delete group.crewPairs[card.num];
  }
  if (side === 'ai') alert(`AI: 負傷した ${name} は${dropSecondary ? label : '主兵器'}を手放しました（§33.6）`);
}

/** §33.9 ヒーローで止めていた負傷の効果は手番終了時に戻る。 */
function expireWoundSuspensions() {
  const endingTurn = state.turnCount || 0;
  for (const side of ['player', 'ai']) {
    const cards = state.groups[side].flatMap(group => group?.cards || []);
    for (const card of cards) {
      if (card.woundSuspendedTurn !== endingTurn) continue;
      delete card.woundSuspendedTurn;
      woundPortage(card);
    }
  }
}

/** §33.7 山札を作り直した後、各陣営が自分の次の手番に負傷兵の耐久判定を行う。 */
function checkWoundEndurance() {
  if (state.phase !== 'play') return;
  const side = state.currentTurn;
  const pending = state.woundCheckPending === true ? { player: true, ai: true } : state.woundCheckPending;
  if (!pending?.[side]) return;
  const otherSide = _enemySide(side);
  state.woundCheckPending = pending[otherSide] ? { [otherSide]: true } : false;
  const R = window.INFANTRY_RULES;
  const faction = getFactionKey(state[side]);
  const groups = state.groups[side].filter(group => group && !group.eliminated);

  const lines = [];
  for (const card of groups.flatMap(group => group.cards)) {
    if (state.terrainDeck?.timeLimitReached) break;
    if (!R.isAlive(card) || !R.isWoundActive(card) || card._evacuationWound) continue;
    const name = (side === 'ai' ? 'AI: ' : '') + (R.lookupSoldier(card, faction)?.name || card.id);
    if (_useHeroFromHand(side, `新しいデッキ: 負傷兵 ${name} の耐久判定の前に、ヒーローカードで免除しますか？（§33.7）`)) {
      lines.push(`${name} — ヒーローカードで免除`);
      continue;
    }
    const judge = drawRandomReinforcementRnc(side);
    if (!judge) break;
    showJudgeCard(judge);
    checkBreezeRemoveSmoke(judge);
    pushTerrainToDiscard(judge);
    const red = judge.terrain.rncColor === '赤';
    if (red) R.killSoldier(card);
    lines.push(`${name} — RNC ${red ? '赤' : '黒'}${judge.terrain.range}${red ? ' → 戦死' : ' → 無事'}`);
  }
  if (lines.length) {
    alert(`§33.7 新しいデッキ: 負傷兵の耐久判定\n${lines.join('\n')}`);
    cleanupEliminatedGroups();
    renderField('player'); renderField('ai');
  }
}

// ===== §32 捕虜 =====
// 捕虜になった兵: routed = true（盤から消える）、captured = true。解放されたら released = true
// 監視役の兵: card.prisoners = [捕虜のカード...]

/** 兵士がグループのどれかの兵器の指定補助乗員か */
function isCrewAssistant(grp, card) {
  return !!(grp && grp.crewPairs && card && card.num != null && Object.values(grp.crewPairs).some(v => Number(v) === card.num));
}
/** §11.11: 他のクルー兵器を所持する兵士や捕虜の監視役は助手になれない。 */
function canServeAsWeaponAssistant(card, faction) {
  const R = window.INFANTRY_RULES;
  if (!R.isAlive(card) || R.isPinned(card) || card.transfer || card.infiltrating || card.prisoners?.length) return false;
  const def = R.lookupSoldier(card, faction);
  return def && !def.afv && !def.isInfantryGun && !def.infantryGun && (!def.needsCrew || card.destroyed);
}
/** 補助乗員の任務を解く（§32.2 補助乗員しか監視役の候補がいない時） */
function releaseFromCrew(grp, card) {
  if (!isCrewAssistant(grp, card)) return;
  Object.keys(grp.crewPairs).forEach(k => { if (Number(grp.crewPairs[k]) === card.num) delete grp.crewPairs[k]; });
}
/** §32.2 ピン・負傷・非武装でも監視できる。助手を使うのは他に候補がいない時だけ。 */
function guardCandidates(group, side) {
  const R = window.INFANTRY_RULES;
  const members = group.cards.filter(card => R.isAlive(card) && !card.transfer &&
    !window.AFV?.isAfvCard(card) && !infantryGunProfile(card, side));
  const withoutAssistants = members.filter(card => !isCrewAssistant(group, card));
  return withoutAssistants.length ? withoutAssistants : members;
}

function choosePrisonerGuard(group, side, candidates) {
  if (candidates.length < 2) return candidates[0];
  const R = window.INFANTRY_RULES;
  const faction = getFactionKey(state[side]);
  if (side === 'player') {
    const list = candidates.map((card, i) => {
      const name = R.lookupSoldier(card, faction)?.name || card.id;
      return `${i + 1}: #${card.num} ${name}`;
    }).join('\n');
    const choice = parseInt(prompt(`捕虜の監視役を選択（番号）§32.2:\n${list}`, '1'), 10) - 1;
    return candidates[choice] || candidates[0];
  }

  // 指揮官とクルー兵器の射手を避け、CCV の低い兵を優先する。
  const score = card => {
    const definition = R.lookupSoldier(card, faction);
    return 10 * Number(Boolean(definition?.leader)) +
      10 * Number(group.crewPairs?.[card.num] != null) +
      (parseInt(definition?.ccvFront, 10) || 0);
  };
  return candidates.reduce((best, card) => score(card) < score(best) ? card : best);
}

function assignPrisoners(group, guard, prisoners) {
  releaseFromCrew(group, guard);
  guard.prisoners = (guard.prisoners || []).concat(prisoners);
}

function prisonerGuardsAvailableToChange(group) {
  const R = window.INFANTRY_RULES;
  return (group?.cards || []).filter(card => R.isAlive(card) && !card.transfer && card.prisoners?.length);
}

function changePrisonerGuard(group, previousGuards, nextGuard) {
  const moved = [];
  for (const guard of previousGuards) {
    if (guard === nextGuard) continue;
    moved.push(...guard.prisoners);
    guard.prisoners = [];
  }
  assignPrisoners(group, nextGuard, moved);
}

/** §32 捕虜にする。成功したら true。 */
function capturePrisoner(prisoner, prisonerSide, captorGroup, captorSide, chosenGuard) {
  const R = window.INFANTRY_RULES;
  if (!R || !R.isAlive(prisoner) || prisoner.captured || !captorGroup ||
      captorGroup.eliminated || captorGroup.forming || window.AFV?.isAfvCard(prisoner) ||
      infantryGunProfile(prisoner, prisonerSide)) return false;
  const guard = chosenGuard || choosePrisonerGuard(captorGroup, captorSide, guardCandidates(captorGroup, captorSide));
  if (!guard) return false;
  prisoner.routed = true;
  prisoner.captured = true;
  prisoner.pinned = false;
  if (prisoner.infiltrating) window.CC_ACTION.clearSoldierInfiltration(prisoner);
  assignPrisoners(captorGroup, guard, [prisoner]);
  if (prisoner.transfer) updateTransfers();
  recordTerrainClaimAfterLoss(prisoner);
  return true;
}
window.capturePrisoner = capturePrisoner;

/** §32.12 敗走する兵: 相対射程5に敵の歩兵グループがいれば、敗走の代わりにその敵に降伏する（捕獲者は敗走を選んでもよい）。
 *  降伏したら true（routSoldier から呼ばれる） */
function onSoldierRout(card) {
  const R = window.INFANTRY_RULES;
  if (!R || !state || !state.groups) return false;
  let side = null, gi = -1;
  ['player', 'ai'].forEach(sd => (state.groups[sd] || []).forEach((g, i) => { if (g && g.cards.indexOf(card) >= 0) { side = sd; gi = i; } }));
  if (!side) return false;
  const grp = state.groups[side][gi];
  if (window.AFV?.isAfvCard(card) || infantryGunProfile(card, side)) return false;
  const eSide = side === 'player' ? 'ai' : 'player';
  const captors = [];
  (state.groups[eSide] || []).forEach((e, ei) => {
    if (!e || e.eliminated || e.forming || !guardCandidates(e, eSide).length) return;
    const rr = R.relativeRangeBetweenGroups(grp, e, {
      sameOpposing: ei === gi, adjacent: Math.abs(ei - gi) === 1
    });
    if (rr === 5) captors.push(ei);
  });
  if (!captors.length) return false;
  let ci = captors[0];
  if (eSide === 'player') {
    const def = R.lookupSoldier(card, getFactionKey(state.ai));
    const name = def ? def.name : card.id;
    if (!confirm(`${name} が敗走しようとしています。降伏させて捕虜にしますか？（捕虜 5点・しなければ敗走 §32.12）`)) return false;
    if (captors.length > 1) {
      const list = captors.map((x, k) => `${k + 1}: GROUP ${state.groups.player[x].name}`).join('\n');
      const sel = parseInt(prompt(`捕虜を取るグループを選択（番号）:\n${list}`, '1'), 10) - 1;
      ci = captors[sel] != null ? captors[sel] : captors[0];
    }
  } else {
    // AI: 生存兵の多いグループで捕虜を取る
    ci = captors.slice().sort((a, b) =>
      state.groups.ai[b].cards.filter(c => R.isAlive(c)).length - state.groups.ai[a].cards.filter(c => R.isAlive(c)).length)[0];
  }
  const ok = capturePrisoner(card, side, state.groups[eSide][ci], eSide);
  if (ok && eSide === 'ai') {
    const def = R.lookupSoldier(card, getFactionKey(state.player));
    alert(`§32.12 ${def ? def.name : card.id} は敵の GROUP ${state.groups.ai[ci].name} に降伏し、捕虜になりました`);
  }
  return ok;
}
window.onSoldierRout = onSoldierRout;

/** §32.2/§32.22 監視役を失ったグループの捕虜は、生存者に引き継ぐ。 */
function updateGroupPrisoners(group, side) {
  const R = window.INFANTRY_RULES;
  const waiting = group._prisonersAwaitingGuard || [];
  for (const card of group.cards) {
    if (!card.prisoners?.length || R.isAlive(card)) continue;
    waiting.push(...card.prisoners);
    card.prisoners = [];
  }
  if (!waiting.length) return 0;

  if (!group.cards.some(R.isAlive)) {
    waiting.forEach(prisoner => { prisoner.released = true; });
    delete group._prisonersAwaitingGuard;
    return waiting.length;
  }

  const guard = choosePrisonerGuard(group, side, guardCandidates(group, side));
  if (guard) {
    assignPrisoners(group, guard, waiting);
    delete group._prisonersAwaitingGuard;
  } else {
    // 歩兵砲だけが残った場合なども、グループが全滅するまでは解放しない。
    group._prisonersAwaitingGuard = waiting;
  }
  return 0;
}

function updatePrisoners(boundaryTransfer) {
  let released = 0;
  if (boundaryTransfer) {
    released = updateGroupPrisoners(boundaryTransfer.group, boundaryTransfer.side);
  } else {
    for (const side of ['player', 'ai']) {
      for (const group of state.groups[side]) {
        if (group) released += updateGroupPrisoners(group, side);
      }
    }
  }
  if (released) alert(`§32.22 捕虜 ${released} 人が解放されました（捕獲側はその勝利点を失います）`);
}

/** §20.8 最後の兵を失った時点の侵入兵を、射撃や白兵戦で侵入が解除される前に記録する。 */
function recordTerrainClaimAfterLoss(card) {
  if (state.phase !== 'play') return;
  const side = _sideOfCard(card);
  if (!side) return;
  const index = state.groups[side].findIndex(group => group?.cards.includes(card));
  const group = state.groups[side][index];
  if (!group || group.eliminated || _groupAlive(group)) return;
  const claims = terrainClaimants(side, index);
  if (claims.length) group._terrainClaim = claims;
}

function terrainClaimants(side, index) {
  const R = window.INFANTRY_RULES;
  return state.groups[_enemySide(side)].flatMap(group => _groupAlive(group) && !group.forming
    ? group.cards.filter(card => R.isAlive(card) && card.infiltrating &&
      card.infiltratedGroupSide === side && card.infiltratedGroupIdx === index).map(card => ({ group, card })) : []);
}

function captureEliminatedTerrain(defender, side, index) {
  const R = window.INFANTRY_RULES;
  const attackers = _enemySide(side);
  const claims = (defender._terrainClaim || terrainClaimants(side, index)).filter(({ group, card }) =>
    _groupAlive(group) && group.cards.includes(card) && R.isAlive(card));
  delete defender._terrainClaim;
  if (!claims.length) return;

  // FAQ §20.8 2枚移動していれば、古い移動カードを裏返して平地として捕獲する。
  const stack = (defender.terrain || []).filter(card => card?.terrain &&
    !['WIRE', 'SMOKE', 'TRENCH'].includes(card.terrain.type));
  const base = stack.findLastIndex(card => card.terrain.type !== 'MOVEMENT');
  const moves = stack.slice(base + 1);
  const covered = moves.length >= 2 ? moves[0] : stack[base];
  const trench = defender.terrain?.find(card => card.terrain?.type === 'TRENCH');
  if ((!covered || covered._surpriseBuilding || isDummyPlain(covered)) && !trench) return;
  const ground = covered && !covered._surpriseBuilding
    ? (moves.length >= 2 ? placedOpenGround(covered) : covered) : makeDummyPlain();
  const type = ground.terrain.type;
  const faction = getFactionKey(state[attackers]);
  const pillboxEligible = card => !window.AFV.isAfvCard(card) && !infantryGunProfile(card, attackers) &&
    !secondaryWeaponOn(card, faction) && !pillboxForbiddenWeapon(R.lookupSoldier(card, faction)?.weaponCat);
  const groups = [...new Set(claims.map(claim => claim.group))].filter(group => {
    if (type === 'MARSH' && (window.AFV.isAfvGroup(group) || groupHasInfantryGun(group, attackers))) return false;
    if (type !== 'PILLBOX') return true;
    const men = group.cards.filter(R.isAlive);
    return men.length <= 3 && men.every(pillboxEligible);
  });
  if (!groups.length) return;

  const newTerrain = [ground, ...(trench ? [trench] : [])];
  let captor;
  if (attackers === 'player') {
    const names = groups.map((group, i) => `${i + 1}. GROUP ${group.name}`);
    const question = radioText('地形を占拠するグループを選んでください。0で占拠しません（§20.8）。',
      'Choose a group to capture the terrain. Enter 0 to decline (§20.8).');
    captor = groups[Number(prompt([question, ...names].join('\n'), '0')) - 1];
  } else {
    const defense = R.calcTerrainMod(newTerrain, false);
    captor = groups.find(group => defense < R.calcTerrainMod(group.terrain, false) || isMovingIgnoringOverlays(group));
  }
  if (!captor) return;

  defender.terrain = defender.terrain.filter(card => card !== covered && card !== trench);
  const wire = captor.terrain.filter(card => card.terrain?.type === 'WIRE');
  captor.terrain.filter(card => !wire.includes(card)).forEach(pushTerrainToDiscard);
  captor.terrain = [...newTerrain, ...wire];
  clearOutgoingFlanks(captor);
  breakFlanksOn(captor);
  delete captor.pendingShift;
  delete captor._overrunTargets;
  if (defender.weaponPool?.length) {
    captor.weaponPool = defender.weaponPool;
    defender.weaponPool = [];
  }

  const capacity = (type === 'PILLBOX' ? 3 : 10) - captor.cards.filter(R.isAlive).length -
    incomingTransit(attackers, state.groups[attackers].indexOf(captor)).length;
  const others = capacity > 0 ? claims.filter(({ group, card }) =>
    group !== captor && card.infiltrating && !card.prisoners?.length && (type !== 'PILLBOX' || pillboxEligible(card))) : [];
  if (attackers === 'player' && others.length) {
    const names = others.map(({ group, card }, i) => `${i + 1}. GROUP ${group.name} / ${R.lookupSoldier(card, faction)?.name || card.id}`);
    const question = radioText(`占拠したグループに合流させる侵入兵の番号（最大${capacity}人・空欄で合流なし）。`,
      `Enter numbers of infiltrators to join the group that captured the terrain (up to ${capacity}), or leave blank.`);
    const answer = prompt([question, ...names].join('\n'), '')?.trim();
    const chosen = answer ? [...new Set(answer.split(/[\s,、]+/).map(number => others[Number(number) - 1]))] : [];
    if (chosen.length <= capacity && chosen.every(Boolean)) {
      for (const { group, card } of chosen) {
        group.cards = group.cards.filter(man => man !== card);
        captor.cards.push(card);
        if (!group.cards.some(R.isAlive)) {
          group.terrain.forEach(pushTerrainToDiscard);
          group.terrain = [];
          group.weaponPool = [];
          group.eliminated = true;
        }
      }
    }
  }
  ufReportLog(attackers, `GROUP ${captor.name} が GROUP ${defender.name} の地形を占拠（§20.8）`, attackers);
}

function cleanupEliminatedGroups() {
  const R = window.INFANTRY_RULES;
  if (!R) return;
  processDroppedWeapons();
  updatePrisoners(); // §32.2/§32.22
  // 消滅グループは削除せず eliminated フラグを立てて位置関係を保持
  ['player', 'ai'].forEach(side => {
    state.groups[side].forEach((grp, index) => {
      if (!grp) return;
      const alive = grp.cards.some(c => R.isAlive(c));
      if (!alive && grp.cards.length > 0 && !grp.eliminated) {
        captureEliminatedTerrain(grp, side, index);
        (grp.terrain || []).forEach(tc => { if (tc) pushTerrainToDiscard(tc); });
        grp.terrain = [];
        grp.eliminated = true;
      }
    });
  });
  // §20 侵入先のグループが消滅した（兵が残っていない）侵入兵は、侵入中の印を消す
  //   （消さないと、いないグループに白兵戦を続けてしまう）。消えた兵は元のグループの兵として射撃・移動に加わる
  ['player', 'ai'].forEach(side => (state.groups[side] || []).forEach(g => (g ? g.cards : []).forEach(c => {
    if (!c.infiltrating) return;
    const tg = c.infiltratedGroupSide && state.groups[c.infiltratedGroupSide] && state.groups[c.infiltratedGroupSide][c.infiltratedGroupIdx];
    if (!tg || tg.eliminated || !tg.cards.some(x => R.isAlive(x))) {
      if (window.CC_ACTION && window.CC_ACTION.clearSoldierInfiltration) window.CC_ACTION.clearSoldierInfiltration(c);
      else { c.infiltrating = false; delete c.infiltratedGroupSide; delete c.infiltratedGroupIdx; }
    }
  })));
  checkDefeat();
}

function participatingPersonnel(side) {
  const cards = state.groups[side].flatMap(group => group?.cards || []);
  cards.push(...(state.retiredCasualties?.[side] || []));
  if (side === 'ai') cards.push(...(state.randomReinforcements?.losses || []));
  return cards;
}

function breakForceSize(side) {
  // 旧セーブでは、増援が登場しても初期兵員数が更新されていない場合がある。
  return Math.max(state.initialSoldierCount?.[side] || 0, participatingPersonnel(side).length);
}

function breakLossLimit(side) {
  const initial = breakForceSize(side);
  if (!initial) return 0;
  const faction = getFactionKey(state[side]);
  if (faction === 'fra') return Math.ceil(initial / 2);
  if (faction === 'ita' && !italianFacingSoviets()) return Math.floor(initial * 2 / 5) + 1;
  const breakLevel = state[side]?.breakLvl;
  if (state.scenario?.victoryPresets?.includes('V') && breakLevel > 0.51) {
    return Math.ceil(initial * breakLevel);
  }
  return Math.floor(initial / 2) + 1;
}

function checkDefeat() {
  if (state.phase !== 'play' || deckAttackInProgress() || !state.initialSoldierCount) return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const broken = ['player', 'ai'].filter(side => {
    const initial = breakForceSize(side);
    if (!initial) return false;
    const alive = state.groups[side].reduce((sum, group) =>
      sum + (group?.cards.filter(R.isAlive).length || 0), 0);
    return initial - alive >= breakLossLimit(side);
  });
  if (broken.length === 2) {
    const message = radioText('両軍が同時に敗北ラインに達しました。両軍とも敗北です。',
      'Both squads broke simultaneously. Both sides lose.');
    state.phase = 'gameover';
    state._ufEndText = message;
    alert(message);
    endCampaignScenario(null);
    return;
  }
  const [side] = broken;
  if (!side || (side === 'ai' && advanceEditorSegment())) return;
  const winner = _enemySide(side);
  state.phase = 'gameover';
  alert(`${state[side].name} の損害が敗北ラインに達しました。${state[winner].name} の勝利です！`);
  endCampaignScenario(winner);
}

function retainGroupCasualties(side, group) {
  if (!group?.eliminated || !group.cards.length) return;
  const retired = state.retiredCasualties ||= { player: [], ai: [] };
  retired[side].push(...group.cards);
}

// §16.4 動ける装甲車両は、移動カードがある場合も陣地点を得る。
function calcVictoryPoints(side, allowedTerrain = state.scenario?.victory?.requireBuildingsForTerritorial ? ['BUILDINGS'] : null) {
  const R = window.INFANTRY_RULES;
  if (!R) return 0;
  const afv = window.AFV;
  let vp = 0;
  for (const group of state.groups[side]) {
    if (!group || group.eliminated) continue;
    if (allowedTerrain && !allowedTerrain.includes(R.currentTerrainType({
      terrain: group.terrain.filter(card => !card._isTrench)
    }))) continue;
    const moving = isMovingIgnoringOverlays(group);
    const ready = group.cards.filter(card => {
      if (!R.isAlive(card) || R.isPinned(card)) return false;
      return afv?.isAfvCard(card) ? !group._immob && !group._bog && !group._stun : !moving;
    });
    vp += ready.length * (group.distance || 0);
  }

  return vp + calcCasualtyVictoryPoints(side);
}

function calcCasualtyVictoryPoints(side) {
  const afv = window.AFV;
  const enemy = _enemySide(side);
  let vp = 0;
  const casualties = participatingPersonnel(enemy);
  for (const card of casualties) {
    const vehicle = afv?.defOf(card);
    const gun = infantryGunProfile(card, enemy);
    if (vehicle) vp += 2 * (card._ck || 0);
    if (gun) vp += 2 * (card._infantryGunCrewLost || 0);
    if (card.captured) { if (!card.released) vp += 5; }
    else if (card.killed) {
      if (vehicle) vp += 10 + (vehicle.effect?.box ?? 0);
      else vp += gun ? 6 : 2;
    } else if (card.routed || card.wounded) vp++;
  }
  return vp;
}

function hasBuildingParity(attacker, defender) {
  const R = window.INFANTRY_RULES;
  const occupied = side => state.groups[side].filter(group =>
    group && !group.eliminated && R.currentTerrainType(group) === 'BUILDINGS' &&
    group.cards.some(card => R.isAlive(card) && !card.transfer && !card.infiltrating)).length;
  const attackBuildings = occupied(attacker);
  return attackBuildings > 0 && attackBuildings >= occupied(defender);
}

function checkBuildingParityVictory() {
  if (state.scenario?.victoryPresets || state.phase !== 'play' ||
      (state.scenario?.victory?.type !== 'buildingParity' && !ufUsesVictory(state.scenario, 'W'))) return false;
  const attacker = state.playerRole === 'defender' ? 'ai' : 'player';
  const defender = _enemySide(attacker);
  if (!hasBuildingParity(attacker, defender)) return false;

  if (attacker === 'player' && advanceEditorSegment()) return true;
  state.phase = 'gameover';
  state.terrainDeck.gameOver = true;
  const name = state[attacker].name;
  alert(radioText(`奇襲 — 建物の確保に成功。 ${name}の勝利！`,
    `Surprise Attack — ${langTranslate(name)} wins by securing the buildings!`));
  endCampaignScenario(attacker);
  return true;
}

/** シナリオB「市街戦」は時間切れに建物の陣地点と損害点で決着する。 */
function checkScenarioBVictory() {
  if (state.phase === 'gameover') return;
  const sc = state.scenario;
  if (!ufUsesVictory(sc, 'B')) return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const playerVP = calcVictoryPoints('player');
  const aiVP = calcVictoryPoints('ai');
  state.phase = 'gameover';
  if (playerVP > aiVP) {
    alert(`シナリオB 終了：${state.player.name} の勝利！ (VP ${playerVP} vs ${aiVP})`);
    endCampaignScenario('player');
  } else if (aiVP > playerVP) {
    alert(`シナリオB 終了：${state.ai.name} の勝利！ (VP ${playerVP} vs ${aiVP})`);
    endCampaignScenario('ai');
  } else {
    alert(`シナリオB 終了：引き分け (VP ${playerVP} vs ${aiVP})`);
  }
}

/** シナリオD「後衛戦」勝利判定 (reducedDefender)
 *  攻撃側=プレイヤー、防御側=AI。
 *  攻撃側勝利条件A: あるグループが distance≧5 かつ ピン以外の生存兵士5人以上
 *  攻撃側勝利条件B: 防御側のグループが1つでも消滅 かつ 自分の損害（killed+routed） < 相手の損害
 */
function checkScenarioDVictory() {
  if (state.phase === 'gameover') return;
  const sc = state.scenario;
  if (sc?.victoryPresets || !ufUsesVictory(sc, 'D')) return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  // テスト用（2026-11-08）: 攻撃側を役割で決める（元は「プレイヤー＝攻撃側」の決め打ち）
  const _atk = state.playerRole === 'defender' ? 'ai' : 'player', _def = _atk === 'player' ? 'ai' : 'player';
  const _atkName = _atk === 'player' ? state.player.name : state.ai.name;
  // 条件A
  for (const grp of state.groups[_atk]) {
    if (grp.eliminated) continue;
    if ((grp.distance || 0) < 5) continue;
    const aliveNotPinned = grp.cards.filter(c => R.isAlive(c) && !R.isPinned(c)).length;
    if (aliveNotPinned < 5) continue;
    state.phase = 'gameover';
    alert(`シナリオD 終了：${_atkName} の勝利！ (GROUP ${grp.name} が距離5に5人到達)`);
    endCampaignScenario(_atk);
    return;
  }
  // 条件B
  const aiEliminated = state.groups[_def].some(g => g.eliminated);
  if (aiEliminated) {
    let playerLoss = 0, aiLoss = 0;
    state.groups[_atk].forEach(g => g.cards.forEach(c => { if (c.killed || c.routed) playerLoss++; }));
    state.groups[_def].forEach(g => g.cards.forEach(c => { if (c.killed || c.routed) aiLoss++; }));
    if (playerLoss < aiLoss) {
      state.phase = 'gameover';
      alert(`シナリオD 終了：${_atkName} の勝利！ (敵グループ消滅 & 損害優位 ${playerLoss}<${aiLoss})`);
      endCampaignScenario(_atk);
      return;
    }
  }
}

/** シナリオC「要塞強襲」勝利判定 (pillboxClear)
 *  攻撃側=プレイヤー、防御側=AI。
 *  防御側のトーチカ持ちグループ（B）の兵士全員 killed/routed = 全滅 → 攻撃側勝利
 *  PILLBOX が消えた = 放棄 → 攻撃側勝利
 */
function checkScenarioCVictory() {
  if (state.phase !== 'play') return;
  const sc = state.scenario;
  if (!ufUsesVictory(sc, 'C') || sc?.victoryPresets) return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  // 防御側を判定（攻守は state.playerRole で決まる）
  const defenderSide = state.playerRole === 'defender' ? 'player' : 'ai';
  const winnerSide = state.playerRole === 'defender' ? 'ai' : 'player';
  const winnerName = winnerSide === 'player' ? state.player.name : state.ai.name;
  const pillboxGroup = state.groups[defenderSide].find(g => g.name === 'B');
  if (!pillboxGroup) return;
  const aliveInGroup = pillboxGroup.cards.some(c => R.isAlive(c));
  if (!aliveInGroup || pillboxGroup.eliminated) {
    state.phase = 'gameover';
    alert(`シナリオC 終了：${winnerName} の勝利！ (トーチカ守備隊全滅)`);
    endCampaignScenario(winnerSide);
    return;
  }
  const hasPillbox = (pillboxGroup.terrain || []).some(c => c && c.terrain && c.terrain.type === 'PILLBOX');
  if (!hasPillbox) {
    state.phase = 'gameover';
    alert(`シナリオC 終了：${winnerName} の勝利！ (トーチカ放棄)`);
    endCampaignScenario(winnerSide);
    return;
  }
}

/** シナリオA「パトロール」勝利判定 (reachAndHold)
 *  和文ルール: 自軍グループの距離が4以上、ピン以外4人以上、防御modある地形、侵入されていない
 */
function checkScenarioAVictory() {
  if (state.phase === 'gameover') return;
  const sc = state.scenario;
  if (sc?.victoryPresets) return;
  const useE = ufUsesVictory(sc, 'E');
  if (!ufUsesVictory(sc, 'A') && !useE) return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const sides = ['player', 'ai'];
  // シナリオE: 1つ以上のグループで合わせて4枚（ルールE）。AFV は数えない（ユーザーの指示 2026-11-06）
  const isE = useE;
  const countOf = grp => grp.cards.filter(c => R.isAlive(c) && !R.isPinned(c) && !(isE && isAfvCardForVictory(c))).length;
  for (const side of sides) {
    const ourGroups = state.groups[side].filter(g => !g.eliminated);
    let eTotal = 0; const eGroups = [];
    for (const grp of ourGroups) {
      if ((grp.distance || 0) < 4) continue;
      const aliveNotPinned = countOf(grp);
      if (!isE && aliveNotPinned < 4) continue;
      if (isE && aliveNotPinned < 1) continue;
      // 移動中 (MOVEMENT カードが terrain スタックにある) は勝利不成立
      if ((grp.terrain || []).some(c => c && c.terrain && c.terrain.type === 'MOVEMENT')) continue;
      // 地形カード（MOVEMENT 以外）が配置されている必要がある。§16.421 煙幕は永続的でないので数えない
      const terrainCards = (grp.terrain || []).filter(c => c && c.terrain && c.terrain.type !== 'MOVEMENT' && c.terrain.type !== 'SMOKE');
      if (terrainCards.length === 0) continue;
      const jpOpts = { japanBuildings: isJapanInGame() };
      const defMod = R.calcTerrainMod(terrainCards, false, jpOpts);
      if (defMod >= 0) continue;
      // §16.423 涸れ谷は、そこを射撃できる敵グループがいない時だけ条件を満たす
      if (R.currentTerrainType && R.currentTerrainType(grp) === 'GULLY') {
        const gi = state.groups[side].indexOf(grp);
        const enemySide = side === 'player' ? 'ai' : 'player';
        const canBeShot = (state.groups[enemySide] || []).some((eg, ei) => {
          if (!eg || eg.eliminated || !eg.cards.some(c => R.isAlive(c) && !R.isPinned(c))) return false;
          const base = R.relativeRange(eg.distance, grp.distance);
          const dist = Math.abs(ei - gi) <= 1 ? base : Math.max(0, base - 1);
          return R.gullyFireAllowed(eg, grp, dist);
        });
        if (canBeShot) continue;
      }
      if (grp.cards.some(c => c.infiltrating)) continue;
      if (isE) { eTotal += aliveNotPinned; eGroups.push(grp.name); if (eTotal < 4) continue; }
      state.phase = 'gameover';
      const winnerName = side === 'player' ? state.player.name : state.ai.name;
      alert(`シナリオ${sc.id} 勝利！ — ${winnerName}（GROUP ${isE ? eGroups.join('・') : grp.name}）`);
      endCampaignScenario(side);
      return;
    }
  }
}
// シナリオEの勝利条件で AFV のカードを数えないための判定
function isAfvCardForVictory(c) {
  const R = window.INFANTRY_RULES;
  for (const side of ['player', 'ai']) {
    const who = side === 'player' ? state.player : state.ai;
    const d = R && who ? R.lookupSoldier(c, getFactionKey(who)) : null;
    if (d?.afv) return true;
  }
  return false;
}



// W3/W4: 開始時の制限と解除条件。対局セーブには state と共に記録される。
function surpriseReadyRifleman(def) {
  return Number(def?.morale) === 3 && /^(ボルトアクション小銃|半自動小銃|カービン|突撃銃)$/.test(def.weaponCat);
}

function startSurpriseRules() {
  const sc = state.scenario;
  if (state.surprise || (!sc?.surprisePinning && !sc?.surpriseSniper)) return;
  const defender = state.playerRole === 'defender' ? 'player' : 'ai';
  state.surprise = { defender, rallyAfter: null, ralliedWithoutHero: false };
  if (!sc.surprisePinning) return;
  const R = window.INFANTRY_RULES;
  const faction = getFactionKey(state[defender]);
  const cards = state.groups[defender].flatMap(group => group.cards);
  const ready = cards.find(card => surpriseReadyRifleman(R.lookupSoldier(card, faction)));
  cards.filter(card => card !== ready).forEach(card => { card.pinned = true; });
}

function noteSurpriseAttack(source, target) {
  const rule = state.surprise;
  if (!state.scenario?.surprisePinning || !rule) return;
  if (target === rule.defender) rule.rallyAfter = state.turnCount || 0;
  else if (source === rule.defender && rule.rallyAfter === null) rule.rallyAfter = (state.turnCount || 0) + 2;
}

function surpriseCanRally(side, card) {
  const rule = state.surprise;
  return !state.scenario?.surprisePinning || rule?.defender !== side ||
    card?.terrain?.type === 'HERO' ||
    (rule.rallyAfter !== null && (state.turnCount || 0) >= rule.rallyAfter);
}

function surprisePinnedForRally(side, card, group) {
  if (!state.scenario?.surpriseSniper || state.surprise?.defender !== side ||
      state.surprise.ralliedWithoutHero || card?.terrain?.type === 'HERO') return [];
  return group.cards.filter(window.INFANTRY_RULES.isPinned);
}

function noteSurpriseRally(previouslyPinned) {
  if (previouslyPinned.some(card => !window.INFANTRY_RULES.isPinned(card))) {
    state.surprise.ralliedWithoutHero = true;
  }
}

function surpriseCanSnipe(side) {
  return !state.scenario?.surpriseSniper || state.surprise?.defender !== side ||
    state.surprise.ralliedWithoutHero;
}

// エディタの勝利条件は、元シナリオの編成や特別ルールと独立して判定する。
function jungleFireMod() {
  return state.scenario?.jungleMode ? -1 : 0;
}

function infantryTerrainFireMod(flameOnly) {
  return state.scenario?.jungleMode ? (flameOnly ? 0 : -1) : (isJapanInGame() ? -1 : 0);
}

function jungleTerrainAllowed(group, card, side) {
  if (!state.scenario?.jungleMode) return true;
  if (card.terrain?.denseJungle && window.AFV?.isAfvGroup(group)) return false;
  return card.terrain?.type !== 'MARSH' || (!window.AFV?.isAfvGroup(group) && !groupHasInfantryGun(group, side));
}

function checkEditorVictory(atTimeLimit = false) {
  const sc = state.scenario;
  if (state.phase !== 'play' || !sc?.victoryPresets) return false;
  const R = window.INFANTRY_RULES;
  const enabled = id => sc.victoryPresets.includes(id);
  const attacker = state.playerRole === 'defender' ? 'ai' : 'player';
  const defender = _enemySide(attacker);
  const ready = card => R.isAlive(card) && !R.isPinned(card) && !card.transfer && !card.infiltrating;
  const active = group => group && !group.eliminated && !group.forming && group.cards.some(R.isAlive);
  const qualifyingCover = (group, side, index) => {
    if (!active(group) || isMovingIgnoringOverlays(group)) return false;
    const terrain = group.terrain.filter(card => !['SMOKE', 'MOVEMENT'].includes(card.terrain?.type));
    if (R.calcTerrainMod(terrain, false, { japanBuildings: isJapanInGame() }) >= 0) return false;
    return !state.groups[_enemySide(side)].some(other => active(other) && other.cards.some(card =>
      R.isAlive(card) && card.infiltrating && card.infiltratedGroupSide === side && card.infiltratedGroupIdx === index));
  };
  const coveringCount = (side, acceptsRange, acceptsCard = ready) => state.groups[side].reduce((total, group, index) =>
    qualifyingCover(group, side, index) && acceptsRange(group, index)
      ? total + group.cards.filter(acceptsCard).length : total, 0);
  const rangeIs = (...ranges) => group => ranges.includes(group.distance);
  const relative = (group, index, enemy, enemyIndex) => R.relativeRangeBetweenGroups(group, enemy, {
    sameOpposing: index === enemyIndex, adjacent: Math.abs(index - enemyIndex) === 1
  });
  const relativeFive = (group, index) => state.groups[defender].some((enemy, enemyIndex) =>
    active(enemy) && relative(group, index, enemy, enemyIndex) === 5);
  const losses = side => participatingPersonnel(side).filter(card => !R.isAlive(card)).length;
  const finish = (side, criteria) => {
    if (!atTimeLimit && side === attacker && advanceEditorSegment()) return true;
    state.phase = 'gameover';
    if (state.terrainDeck) state.terrainDeck.gameOver = true;
    const result = side ? state[side].name + 'の勝利' : '引き分け';
    state._ufEndText = `${sc.name} — ${result}（${criteria.join('・')}${atTimeLimit ? '／時間切れ' : ''}）`;
    alert(state._ufEndText);
    endCampaignScenario(side);
    return true;
  };
  const results = new Map();
  const record = (side, id) => {
    if (!results.has(side)) results.set(side, []);
    results.get(side).push(id);
  };

  for (const id of ['C','O']) {
    if (!enabled(id)) continue;
    const group = state.groups[defender].find(g => g.name === 'B');
    if (group && (!active(group) || R.currentTerrainType(group) !== 'PILLBOX')) record(attacker, id);
  }
  for (const id of ['A','E','F','K','M','T','U']) {
    if (!enabled(id)) continue;
    const allowed = id === 'U' ? rangeIs(4, 5) : rangeIs(4);
    for (const side of ['player','ai']) {
      if (coveringCount(side, allowed) >= 4) record(side, id);
    }
  }
  for (const id of ['D','Q']) {
    if (enabled(id) && coveringCount(attacker, relativeFive) >= 5) record(attacker, id);
  }
  for (const id of ['H','L','S']) {
    if (enabled(id) && coveringCount(attacker, rangeIs(5)) >= (id === 'H' ? 5 : 4)) record(attacker, id);
  }
  if (enabled('D') && state.groups[defender].filter(active).length === 1 &&
      state.groups[defender].some(group => group && !active(group) && group.cards.length) &&
      losses(attacker) < losses(defender)) record(attacker, 'D');
  if (enabled('P')) {
    if (coveringCount(attacker, rangeIs(5)) >= 4) record(attacker, 'P');
    const outsideAttackers = (group, index) => group.cards.every(card => !R.isAlive(card) || !R.isPinned(card)) &&
      state.groups[attacker].every((enemy, enemyIndex) => !active(enemy) || relative(group, index, enemy, enemyIndex) === 0);
    if (coveringCount(defender, outsideAttackers, card => ready(card) && card._evacuationWound) >= 2) record(defender, 'P');
  }
  if (enabled('I')) {
    const arrived = state.groups[attacker].filter(group => active(group) && group.distance === 5)
      .reduce((count, group) => count + group.cards.filter(R.isAlive).length, 0);
    if (arrived >= Math.ceil(state.initialSoldierCount[attacker] / 2) &&
        calcCasualtyVictoryPoints(attacker) > calcVictoryPoints(defender)) record(attacker, 'I');
  }
  if (enabled('W') && hasBuildingParity(attacker, defender)) record(attacker, 'W');

  if (results.size) return finish(results.size === 1 ? [...results.keys()][0] : null,
    [...new Set([...results.values()].flat())]);
  if (!atTimeLimit) return false;
  if (enabled('K') || (sc.twoSegments && state.editorSegment?.number === 1)) return finish(defender, ['K']);

  const scored = [];
  for (const [id, terrain] of [['B','BUILDINGS'], ['N','WOODS'], ['G','BUILDINGS']]) {
    if (!enabled(id)) continue;
    scored.push(id);
    const a = calcVictoryPoints(attacker, [terrain]);
    const b = calcVictoryPoints(defender, [terrain]);
    if (id === 'G') {
      if (a > 0 && a >= 2 * b) record(attacker, id);
    } else if (a !== b) record(a > b ? attacker : defender, id);
  }
  if (results.size) return finish(results.size === 1 ? [...results.keys()][0] : null, scored);
  if (enabled('B') || enabled('N')) return finish(null, scored);

  const hold = sc.victoryPresets.filter(id => 'CDEFGHILOPQSTUVW'.includes(id));
  if (hold.length) return finish(defender, hold);
  const a = calcVictoryPoints(attacker);
  const b = calcVictoryPoints(defender);
  return finish(a === b ? null : a > b ? attacker : defender, sc.victoryPresets);
}
