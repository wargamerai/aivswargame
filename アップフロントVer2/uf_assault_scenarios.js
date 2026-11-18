// F〜X のシナリオはパスワードで復号してから、選択肢とシナリオ表に登録する。
const ASSAULT_SCENARIO_IDS = [...'FGHIKLMNOPQRSTUVWX'];

function isLockedAssaultScenario(id) {
  return ASSAULT_SCENARIO_IDS.includes(id) && !window.SCENARIOS[id];
}

async function decryptAssaultScenarios(password) {
  const bytes = Uint8Array.from(atob(UF_ASSAULT_DATA), ch => ch.charCodeAt(0));
  const header = bytes.subarray(0, 32);
  if (new TextDecoder().decode(header.subarray(0, 4)) !== 'UFB1') {
    throw new Error('Unknown scenario package');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: header.subarray(4, 20), iterations: 600_000, hash: 'SHA-256' },
    key, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: header.subarray(20), additionalData: header },
    aesKey, bytes.subarray(32),
  );
  const scenarios = JSON.parse(new TextDecoder().decode(plaintext));
  if (scenarios.map(scenario => scenario.id).join('') !== ASSAULT_SCENARIO_IDS.join('')) {
    throw new Error('Invalid scenario list');
  }
  return scenarios;
}

const assaultPasswordDialog = document.getElementById('assault-password-dialog');
const assaultPasswordInput = document.getElementById('assault-password');
const assaultPasswordMessage = document.getElementById('assault-password-message');
const assaultUnlockButton = document.getElementById('assault-unlock');
let resumeAssaultLoad = null;
let assaultUnlockRequest = 0;

function openAssaultUnlock(onUnlocked = null) {
  assaultUnlockRequest++;
  resumeAssaultLoad = onUnlocked;
  assaultPasswordInput.value = '';
  assaultPasswordMessage.hidden = true;
  assaultPasswordDialog.showModal();
}

assaultUnlockButton.addEventListener('click', () => openAssaultUnlock());
document.getElementById('assault-password-cancel').addEventListener('click', () => assaultPasswordDialog.close());
assaultPasswordDialog.addEventListener('close', () => {
  if (assaultPasswordDialog.open) return;
  assaultPasswordInput.value = '';
  resumeAssaultLoad = null;
});
document.getElementById('assault-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.getElementById('assault-password-submit');
  if (submit.disabled) return;
  if (!crypto.subtle) {
    assaultPasswordMessage.textContent = 'このページでは暗号化されたシナリオを解除できません。HTTPS版で開いてください。';
    assaultPasswordMessage.hidden = false;
    return;
  }
  submit.disabled = true;
  const request = assaultUnlockRequest;
  const password = assaultPasswordInput.value.trim();
  assaultPasswordInput.value = '';
  try {
    const scenarios = await decryptAssaultScenarios(password);
    if (!assaultPasswordDialog.open || request !== assaultUnlockRequest) return;
    installAssaultScenarios(scenarios);
    assaultUnlockButton.hidden = true;
    const resume = resumeAssaultLoad;
    resumeAssaultLoad = null;
    assaultPasswordDialog.close();
    if (resume) resume();
  } catch {
    if (assaultPasswordDialog.open && request === assaultUnlockRequest) {
      assaultPasswordMessage.textContent = 'パスワードが違います。';
      assaultPasswordMessage.hidden = false;
      assaultPasswordInput.focus();
    }
  } finally {
    submit.disabled = false;
  }
});

// 守備隊は左から A、B、C の順に配置する。
// hold: [地形, 最小距離, 1グループの必要人数, 必要グループ数（既定1）]
// clear: 失わせる守備拠点のグループ名
function installAssaultScenarios(scenarios) {
  const flameOperator = { ger: 14, rus: 17, us: 16, jpn: 17, uk: 14 };
  const infantry = Object.fromEntries(Object.entries(SOLDIER_CARDS).map(([key, cards]) =>
    [key, cards.filter(card => !card.afv && card.weaponCat !== 'AFV' &&
      !card.weaponCat.startsWith('対戦車砲') && card.num !== flameOperator[key]).map(card => card.num)]));
  const terrainNames = {
    BUILDINGS: ['建物', 'buildings'], WOODS: ['森林', 'woods'], HILL: ['丘', 'hill'],
    WALL: ['障壁', 'wall'], BRUSH: ['繁み', 'brush'], GULLY: ['涸れ谷', 'gully'],
    PILLBOX: ['トーチカ', 'pillbox'],
  };

  const translations = {};
  const options = document.getElementById('assault-scenario-options');
  for (const entry of scenarios) {
    const [name, englishName] = entry.name;
    const label = entry.id + '　' + name;
    const defense = entry.defense.map(([type, distance], index) =>
      ({ type, distance, name: 'ABC'[index] }));
    const hold = (entry.hold || []).map(([type, distance, soldiers, groups = 1]) =>
      ({ type, distance, soldiers, groups }));
    const clear = entry.clear || [];
    const ja = clear.map(key => `守備隊${key}の${terrainNames[defense.find(g => g.name === key).type][0]}の拠点を落とす`);
    const en = clear.map(key => `clear defender ${key} from its starting position`);
    for (const h of hold) {
      const [terrain, english] = terrainNames[h.type];
      ja.push(`距離${h.distance}以上の${terrain}に、健在でピン状態でない兵${h.soldiers}人以上の停止中のグループを${h.groups}個置く`);
      en.push(`hold ${english} at distance ${h.distance}+ with ${h.groups} stationary group${h.groups > 1 ? 's' : ''} of ${h.soldiers}+ active, unpinned soldiers each`);
    }
    const description = `攻撃側の目標は${ja.join('、かつ')}。山札${entry.cycles}巡で時間切れ。`;
    const factions = {};
    const defendersByAttacker = {};
    const nations = Object.keys(entry.headcounts);
    for (const attacker of nations) {
      const [count] = entry.headcounts[attacker];
      if (!count) continue;
      const defenders = {};
      const opponents = entry.opponents?.[attacker] ?? nations;
      for (const defender of opponents) {
        if (defender === attacker) continue;
        const [, defenseCount] = entry.headcounts[defender];
        const soldiers = typeof defenseCount === 'number' ? defenseCount : defenseCount[attacker];
        if (soldiers) defenders[defender] = { soldierList: infantry[defender].slice(0, soldiers) };
      }
      if (!Object.keys(defenders).length) continue;
      factions[attacker] = { soldierList: [...infantry[attacker].slice(0, count), flameOperator[attacker]] };
      defendersByAttacker[attacker] = defenders;
    }
    window.SCENARIOS[entry.id] = {
      id: entry.id, name, description,
      asymmetric: true, attackerOnly: true, firstPlayer: 'attacker',
      flameOperator, attackerDistance: entry.start, defenderGroups: defense,
      factions, defendersByAttacker,
      deckCycles: entry.cycles, victory: { type: 'assault', description, hold, clear },
    };
    translations[name] = englishName;
    translations[label] = entry.id + '  ' + englishName;
    translations[description] = `Attacker objectives: ${en.join('; and ')}. Time limit: ${entry.cycles} decks.`;
    options.append(new Option(label, entry.id));
  }
  Object.assign(LANG_EXACT, translations);
  options.hidden = false;
}
