// アップフロント: 隠蔽カード・射撃結果・§33 負傷・§32 捕虜
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== 隠蔽カード処理 =====
function findConcealedIndices(hand) {
  const out = [];
  hand.forEach((c, i) => {
    if (c && c.terrain && c.terrain.type === 'CONCEALED') out.push(i);
  });
  return out;
}

function getConcealMod(cards) {
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
  return mod;
}

/** 撃たれる時の予告: ヒーローの確認・隠蔽カードの選択の前に、どの敵がどのグループをどれだけの火力で撃つかを
 *  画面の上に出し、撃つ敵のグループと撃たれる自分のグループを光らせる。info = { si, ti, title, cards, lines } */
function setIncomingAttack(info) {
  state._incoming = info;
  let b = document.getElementById('incoming-banner');
  if (!b) { b = document.createElement('div'); b.id = 'incoming-banner'; document.body.appendChild(b); }
  b.innerHTML = '';
  const t = document.createElement('div'); t.className = 'ib-title'; t.textContent = info.title; b.appendChild(t);
  if (info.cards && info.cards.length) {
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
async function askPlayerHeroRally(tgtGroup) {
  const R = window.INFANTRY_RULES;
  if (!R || !tgtGroup) return;
  const heroIdx = state.playerHand.findIndex(c => c && c.terrain && c.terrain.type === 'HERO');
  if (heroIdx < 0) return;
  const pinned = tgtGroup.cards.filter(c => R.isAlive(c) && R.isPinned(c));
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
  R.unpinSoldier(picked);
  picked.heroRecovery = true; // §42.43
  renderField('player'); renderHands();
}

/** §9.5 トーチカにいるグループには隠ぺいカードを使えない */
function canUseConcealment(grp) {
  const R = window.INFANTRY_RULES;
  return !(grp && R && R.currentTerrainType && R.currentTerrainType(grp) === 'PILLBOX');
}

function aiUseConcealment() {
  const indices = findConcealedIndices(state.aiHand);
  if (indices.length === 0) return [];
  const idx = indices[0];
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
  return r;
}
function resultColor(r) {
  if (r === 'KIA' || r === 'PANIC_KIA') return '#f44';
  if (r === 'PIN') return '#fd0';
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
/** §33.1 負傷を付ける。負傷前と同じ状態（ピンか通常）のまま。
 *  §33.7 すでに負傷している兵が再び負傷したら、ヒーローカードをすぐに使わない限り KIA。戻り値: 'WOUND' | 'KIA' */
function applyWound(card) {
  const R = window.INFANTRY_RULES;
  const side = _sideOfCard(card);
  if (card.wounded) {
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
const DEMO_OK_WEAPONS = ['非武装', 'ボルトアクション小銃', '半自動小銃', '突撃銃', 'カービン', 'BAR自動小銃', '短機関銃'];
/** 兵士が主兵器（壊れていない兵器）を持っているか */
function hasPrimaryWeapon(card, fk) {
  const w = (typeof weaponOfCard === 'function') ? weaponOfCard(card, fk) : null;
  return !!(w && w.weaponCat !== '非武装' && !card.destroyed);
}
/** この兵士が爆薬を持てるか（§21.1・§33.6 負傷兵は主兵器と両方は持てない） */
function demoEligible(card, fk) {
  const R = window.INFANTRY_RULES;
  if (!card || card.demoCharge || (R && !R.isAlive(card))) return false;
  const w = (typeof weaponOfCard === 'function') ? weaponOfCard(card, fk) : null;
  const cat = (!w || card.destroyed) ? '非武装' : w.weaponCat;
  if (DEMO_OK_WEAPONS.indexOf(cat) < 0) return false;
  if (card.wounded && cat !== '非武装') return false; // §33.6
  return true;
}
/** §33.6 負傷した兵士は主兵器と副次兵器（今は爆薬）の両方は持てない。どちらかを捨て、捨てた兵器はグループの兵器チットとして残す（§18 で拾える）。
 *  プレイヤーは選ぶ。AI は侵入中なら爆薬を残し（侵入先で使う §21）、そうでなければ主兵器を残す */
function woundPortage(card) {
  const side = _sideOfCard(card);
  if (!side || !card.demoCharge) return;
  const fk = getFactionKey(side === 'player' ? state.player : state.ai);
  if (!hasPrimaryWeapon(card, fk)) return;
  const R = window.INFANTRY_RULES;
  const d = R.lookupSoldier(card, fk);
  const name = d ? d.name : card.id;
  const g = (state.groups[side] || []).find(x => x && x.cards && x.cards.indexOf(card) >= 0);
  if (!g) return;
  // 捨てた兵器を置くグループ（侵入中なら侵入先 §20.57）
  let where = g;
  if (card.infiltrating && card.infiltratedGroupSide && card.infiltratedGroupIdx != null) {
    where = (state.groups[card.infiltratedGroupSide] || [])[card.infiltratedGroupIdx] || g;
  }
  let dropDemo;
  if (side === 'player') {
    dropDemo = confirm(`負傷した ${name} は、主兵器と爆薬の両方は持てません（§33.6）。「OK」で爆薬を捨てて主兵器を残します。「キャンセル」で主兵器を捨てて爆薬を残します。`);
  } else {
    dropDemo = !card.infiltrating;
  }
  if (dropDemo) {
    card.demoCharge = false;
    (where.weaponPool || (where.weaponPool = [])).push({ isDemo: true, weaponCat: '爆薬', weaponName: '爆薬', xVal: '',
      range: ['0','0','0','0','0','0'], rangeData: [0,1,2,3,4,5].map(() => ({ main: 0 })), needsCrew: false,
      fac: fk, fromNum: card.num, assistantNum: null, fromSide: side });
    if (side === 'ai') alert(`AI: 負傷した ${name} は爆薬を捨てました（§33.6）`);
  } else {
    dropWeaponToPool(where, card, fk, side);
    // クルー兵器の持ち主だったらクルーの組を解く
    if (g.crewPairs) Object.keys(g.crewPairs).forEach(o => {
      if (Number(o) === card.num || Number(g.crewPairs[o]) === card.num) delete g.crewPairs[o];
    });
    if (side === 'ai') alert(`AI: 負傷した ${name} は主兵器を捨てて爆薬を残しました（§33.6）`);
  }
}

/** §33.7 新しいデッキの最初のターンの開始時に、負傷兵1人ごとに RNC。赤なら KIA。直前にヒーローカードで免除できる */
function checkWoundEndurance() {
  if (!state.woundCheckPending) return;
  state.woundCheckPending = false;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const lines = [];
  ['player', 'ai'].forEach(side => {
    const facKey = getFactionKey(side === 'player' ? state.player : state.ai);
    (state.groups[side] || []).forEach(g => {
      if (!g || g.eliminated) return;
      g.cards.forEach(c => {
        if (!c.wounded || !R.isAlive(c)) return;
        const d = R.lookupSoldier(c, facKey);
        const name = d ? d.name : c.id;
        if (_useHeroFromHand(side, `新しいデッキ: 負傷兵 ${name} の耐久判定の前に、ヒーローカードで免除しますか？（§33.7）`)) {
          lines.push(`${side === 'player' ? '' : 'AI: '}${name} — ヒーローカードで免除`);
          return;
        }
        const j = drawTerrainCard();
        if (!j) return;
        showJudgeCard(j);
        checkBreezeRemoveSmoke(j); pushTerrainToDiscard(j);
        const red = j.terrain && j.terrain.rncColor === '赤';
        if (red) R.killSoldier(c);
        lines.push(`${side === 'player' ? '' : 'AI: '}${name} — RNC ${red ? '赤' : '黒'}${j.terrain.range}${red ? ' → 戦死' : ' → 無事'}`);
      });
    });
  });
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
/** 補助乗員の任務を解く（§32.2 補助乗員しか監視役の候補がいない時） */
function releaseFromCrew(grp, card) {
  if (!isCrewAssistant(grp, card)) return;
  Object.keys(grp.crewPairs).forEach(k => { if (Number(grp.crewPairs[k]) === card.num) delete grp.crewPairs[k]; });
}
/** §32.2 監視役の候補: 生存している兵（ピン・負傷・非武装でもよい）。補助乗員は不可（それしかいなければ可） */
function guardCandidates(grp) {
  const R = window.INFANTRY_RULES;
  const alive = grp.cards.filter(c => R.isAlive(c));
  const nonAsst = alive.filter(c => !isCrewAssistant(grp, c));
  return nonAsst.length ? nonAsst : alive;
}
/** 監視役を自動で選ぶ（AI・監視役の引き継ぎ用）: 指揮官とクルー兵器の持ち主を避け、CCV の低い兵 */
function pickGuardAuto(grp, side) {
  const R = window.INFANTRY_RULES;
  const cands = guardCandidates(grp);
  if (!cands.length) return null;
  const facKey = getFactionKey(side === 'player' ? state.player : state.ai);
  const score = c => {
    const d = R.lookupSoldier(c, facKey) || {};
    let sc = 0;
    if (d.leader) sc += 10;
    if (grp.crewPairs && grp.crewPairs[c.num] != null) sc += 10;
    sc += parseInt(String(d.ccvFront || '0'), 10) || 0;
    return sc;
  };
  return cands.slice().sort((a, b) => score(a) - score(b))[0];
}
/** 捕虜を監視役の下に置く */
function _assignPrisoner(prisoner, guard, grp) {
  releaseFromCrew(grp, guard);
  guard.prisoners = (guard.prisoners || []).concat([prisoner]);
}
/** §32 捕虜にする。prisonerSide: 捕虜になる側、captorGroup/captorSide: 捕獲する側。成功したら true */
function capturePrisoner(prisoner, prisonerSide, captorGroup, captorSide) {
  const R = window.INFANTRY_RULES;
  if (!R || !prisoner || !captorGroup) return false;
  const cands = guardCandidates(captorGroup);
  if (!cands.length) return false;
  let guard;
  if (captorSide === 'player') {
    const facKey = getFactionKey(state.player);
    if (cands.length === 1) guard = cands[0];
    else {
      const list = cands.map((c, i) => { const d = R.lookupSoldier(c, facKey); return `${i + 1}: #${c.num} ${d ? d.name : c.id}`; }).join('\n');
      const sel = parseInt(prompt(`捕虜の監視役を選択（番号）§32.2:\n${list}`, '1'), 10) - 1;
      guard = cands[sel] || cands[0];
    }
  } else {
    guard = pickGuardAuto(captorGroup, captorSide);
  }
  if (!guard) return false;
  prisoner.routed = true;
  prisoner.captured = true;
  prisoner.pinned = false;
  if (prisoner.infiltrating && window.CC_ACTION && window.CC_ACTION.clearSoldierInfiltration) window.CC_ACTION.clearSoldierInfiltration(prisoner);
  prisoner.infiltrating = false;
  _assignPrisoner(prisoner, guard, captorGroup);
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
  const eSide = side === 'player' ? 'ai' : 'player';
  const captors = [];
  (state.groups[eSide] || []).forEach((e, ei) => {
    if (!e || e.eliminated || !e.cards.some(c => R.isAlive(c))) return;
    const base = R.relativeRange(grp.distance, e.distance);
    const rr = Math.abs(ei - gi) > 1 ? Math.max(0, base - 1) : base;
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

/** §32.2/§32.22 監視役が排除されたら同じグループの別の兵へ（行動に数えない）。グループの兵が全員排除されたら捕虜を解放 */
function updatePrisoners() {
  const R = window.INFANTRY_RULES;
  if (!R || !state || !state.groups) return;
  const released = [];
  ['player', 'ai'].forEach(side => (state.groups[side] || []).forEach(g => {
    if (!g) return;
    g.cards.forEach(c => {
      if (!c.prisoners || !c.prisoners.length || R.isAlive(c)) return;
      const list = c.prisoners;
      c.prisoners = [];
      const ng = pickGuardAuto(g, side);
      if (ng) list.forEach(p => _assignPrisoner(p, ng, g));
      else list.forEach(p => { p.released = true; released.push(p); });
    });
  }));
  if (released.length) alert(`§32.22 捕虜 ${released.length} 人が解放されました（捕獲側はその勝利点を失います）`);
}

function cleanupEliminatedGroups() {
  const R = window.INFANTRY_RULES;
  if (!R) return;
  updatePrisoners(); // §32.2/§32.22
  // 消滅グループは削除せず eliminated フラグを立てて位置関係を保持
  ['player', 'ai'].forEach(side => {
    state.groups[side].forEach(grp => {
      const alive = grp.cards.some(c => R.isAlive(c));
      if (!alive && grp.cards.length > 0 && !grp.eliminated) {
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

function checkDefeat() {
  if (!state.initialSoldierCount) return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  ['player', 'ai'].forEach(side => {
    const initial = state.initialSoldierCount[side];
    if (!initial) return;
    let lost = 0;
    state.groups[side].forEach(g => {
      g.cards.forEach(c => { if (c.killed || c.routed) lost++; });
    });
    // 全滅グループの兵士も数える（グループ除去済みなので initialCount - 現存生存数）
    let alive = 0;
    state.groups[side].forEach(g => {
      g.cards.forEach(c => { if (R.isAlive(c)) alive++; });
    });
    lost = initial - alive;
    const half = Math.floor(initial / 2) + 1;
    if (lost >= half) {
      const name = side === 'player' ? state.player.name : state.ai.name;
      const winner = side === 'player' ? state.ai.name : state.player.name;
      state.phase = 'gameover';
      alert(`${name} の過半数が損害を受けました。${winner} の勝利です！`);
      endCampaignScenario(side === 'player' ? 'ai' : 'player');
      return;
    }
  });
}

/** §16.4 勝利ポイント: 各グループの（ピン状態でなく移動中でない兵士の数 × 距離チット）の合計
 *  ＋ KIA させた敵兵 1人につき 2点、潰走させた敵兵 1人につき 1点 */
function calcVictoryPoints(side) {
  const R = window.INFANTRY_RULES;
  if (!R) return 0;
  let vp = 0;
  (state.groups[side] || []).forEach(g => {
    if (!g || g.eliminated) return;
    if (isMovingIgnoringOverlays(g)) return; // 移動中の兵士は数えない
    const n = g.cards.filter(c => R.isAlive(c) && !R.isPinned(c)).length;
    vp += n * (g.distance || 0);
  });
  const enemySide = side === 'player' ? 'ai' : 'player';
  (state.groups[enemySide] || []).forEach(g => g.cards.forEach(c => {
    if (c.captured) { if (!c.released) vp += 5; } // §32.1 捕虜 5点（§32.22 解放されたら 0点）
    else if (c.killed) vp += 2;
    else if (c.routed) vp += 1;
    else if (c.wounded) vp += 1; // §33.8 生き延びた負傷兵は相手に 1点（敗走 1点・KIA 2点は上で数える）
  }));
  return vp;
}

/** シナリオB「市街戦」勝利判定 (vpCount)
 *  デッキ3巡 or 損害限界超え時に、各グループ「ピン以外の生存兵士数 × distance」の合計で勝者決定。
 *  同点は引き分け（記録なし）。
 */
function checkScenarioBVictory() {
  if (state.phase === 'gameover') return;
  const sc = state.scenario;
  if (!sc || sc.id !== 'B') return;
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
  if (!sc || sc.id !== 'D') return;
  const R = window.INFANTRY_RULES;
  if (!R) return;
  // 条件A
  for (const grp of state.groups.player) {
    if (grp.eliminated) continue;
    if ((grp.distance || 0) < 5) continue;
    const aliveNotPinned = grp.cards.filter(c => R.isAlive(c) && !R.isPinned(c)).length;
    if (aliveNotPinned < 5) continue;
    state.phase = 'gameover';
    alert(`シナリオD 終了：${state.player.name} の勝利！ (GROUP ${grp.name} が距離5に5人到達)`);
    endCampaignScenario('player');
    return;
  }
  // 条件B
  const aiEliminated = state.groups.ai.some(g => g.eliminated);
  if (aiEliminated) {
    let playerLoss = 0, aiLoss = 0;
    state.groups.player.forEach(g => g.cards.forEach(c => { if (c.killed || c.routed) playerLoss++; }));
    state.groups.ai.forEach(g => g.cards.forEach(c => { if (c.killed || c.routed) aiLoss++; }));
    if (playerLoss < aiLoss) {
      state.phase = 'gameover';
      alert(`シナリオD 終了：${state.player.name} の勝利！ (敵グループ消滅 & 損害優位 ${playerLoss}<${aiLoss})`);
      endCampaignScenario('player');
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
  if (state.phase === 'gameover') return;
  const sc = state.scenario;
  if (!sc || sc.id !== 'C') return;
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
  if (!sc || (sc.id !== 'A' && sc.id !== 'E')) return; // E も同じ勝利条件（ユーザーの指示 2026-11-04）
  const R = window.INFANTRY_RULES;
  if (!R) return;
  const sides = ['player', 'ai'];
  for (const side of sides) {
    const ourGroups = state.groups[side].filter(g => !g.eliminated);
    for (const grp of ourGroups) {
      if ((grp.distance || 0) < 4) continue;
      const aliveNotPinned = grp.cards.filter(c => R.isAlive(c) && !R.isPinned(c)).length;
      if (aliveNotPinned < 4) continue;
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
          return R.canFireAtGully(eg, dist, {});
        });
        if (canBeShot) continue;
      }
      if (grp.cards.some(c => c.infiltrating)) continue;
      state.phase = 'gameover';
      const winnerName = side === 'player' ? state.player.name : state.ai.name;
      alert(`シナリオA 勝利！ — ${winnerName}（GROUP ${grp.name}）`);
      endCampaignScenario(side);
      return;
    }
  }
}

