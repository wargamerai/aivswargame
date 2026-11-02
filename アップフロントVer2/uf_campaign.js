// アップフロント: キャンペーンのシナリオ終了・戦間の画面
// （index.html から切り出したもの。読み込む順番が大事: index.html の <script src> の順で読み込む）
// ===== キャンペーン: シナリオ終了処理 (ルール準拠 §42) =====
function endCampaignScenario(winner) {
  // 重複呼び出し防止（1シナリオ内で1回のみ集計）
  if (state.campaignEnded) return;
  state.campaignEnded = true;
  // キャンペーン編成から始めたシナリオ以外は、記録もキャンペーン結果画面もなし
  if (!state.isCampaign) return;
  const R = window.INFANTRY_RULES;
  const C = window.CAMPAIGN_RULES;
  if (!R || !C) return;
  const playerKey = getFactionKey(state.player);
  const playerWon = (winner === 'player');

  // プレイヤー側の全兵士を集計
  const allCards = [];
  state.groups.player.forEach(g => { g.cards.forEach(c => allCards.push(c)); });

  allCards.forEach(card => {
    const def = R.lookupSoldier(card, playerKey);
    if (!def) return;
    const id = card.id;
    const rec = getRecord(playerKey, id);
    if (!rec.rank) rec.rank = 'PVT';
    if (rec.kia == null) rec.kia = 8;
    if (rec.moraleVal == null) rec.moraleVal = parseInt(def.morale, 10) || 0;
    if (rec.panicVal == null) rec.panicVal = parseInt(def.panic, 10) || 0;

    const isFlamethrower = def.weaponCat && def.weaponCat.indexOf('火炎放射器') === 0;

    // 戦闘参加カウント (KIA時はリセット)
    if (card.killed) {
      rec.battles = 0;
    } else {
      rec.battles = (rec.battles || 0) + 1;
    }
    if (card.killed) {
      // §42.41 戦死 → 再登場時は KIA 7 (火炎放射器 6) スタート、気力で上げた値・斜線・気力ポイントもリセット
      rec.status = 'killed';
      rec.moraleVal = null;
      rec.panicVal = null;
      rec.ccvFrontVal = null;
      rec.ccvBackVal = null;
      rec.moralePoints = 0;
      rec.survivalSlashes = 0;
      rec.promotionSlashes = 0;
      rec.kia = isFlamethrower ? 6 : 7;
    } else if (card.routed) {
      // §42.42 潰走: モラル/パニック値を-1 (パニック側を-1がデフォルト)
      C.applyRout(rec, 'panic', parseInt(def.morale, 10) || 0, parseInt(def.panic, 10) || 0);
    } else {
      // 生存
      rec.status = 'active';
      // §42.45 生存欄に斜線
      C.addSurvivalSlash(rec, isFlamethrower);
      // §42.43 気力ポイント (加算内訳を rec.lastMpBreakdown に記録)
      const breakdown = [];
      let mp = 0;
      if (playerWon) { mp += C.MORALE_POINT_TABLE.SCENARIO_WIN; breakdown.push('勝+' + C.MORALE_POINT_TABLE.SCENARIO_WIN); }
      if (card.pinned) { mp += C.MORALE_POINT_TABLE.SURVIVED_WOUNDED_OR_PIN; breakdown.push('ピン+' + C.MORALE_POINT_TABLE.SURVIVED_WOUNDED_OR_PIN); }
      if (card.wounded) { mp += C.MORALE_POINT_TABLE.SURVIVED_WOUNDED_OR_PIN; breakdown.push('負傷+' + C.MORALE_POINT_TABLE.SURVIVED_WOUNDED_OR_PIN); }
      if (card.heroRecovery) { mp += C.MORALE_POINT_TABLE.HERO_RECOVERY; breakdown.push('英雄+' + C.MORALE_POINT_TABLE.HERO_RECOVERY); }
      if (card.ccKills) { const v = card.ccKills * C.MORALE_POINT_TABLE.CC_KILL; mp += v; breakdown.push('CC×' + card.ccKills + '+' + v); }
      if (card.demoKilled3OrMore) { mp += C.MORALE_POINT_TABLE.DEMO_KILL_3; breakdown.push('爆薬+' + C.MORALE_POINT_TABLE.DEMO_KILL_3); }
      if (mp > 0) C.addMoralePoints(rec, mp);
      rec.lastMpBreakdown = breakdown.join(', ');
    }
    if (card.malfunctioned) rec.malfunctioned = true;
    if (card.destroyed) rec.destroyed = true;
  });

  // キャンペーン全体の戦数を加算
  if (!campaignRecords._meta) campaignRecords._meta = {};
  campaignRecords._meta.totalBattles = (campaignRecords._meta.totalBattles || 0) + 1;
  saveRecords();
  showInterimScreen(playerKey, playerWon);
}

// ===== 戦間処理画面 =====
function showInterimScreen(factionKey, won) {
  let ov = document.getElementById('interim-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'interim-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:2500;display:flex;align-items:center;justify-content:center;overflow-y:auto;';
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';

  // 参加兵士のみ (state.groups.player に含まれるid 集合に基づく)
  const participatedIds = new Set();
  if (state && state.groups && state.groups.player) {
    state.groups.player.forEach(g => g.cards.forEach(c => { if (c && c.id) participatedIds.add(c.id); }));
  }
  const soldiers = getAllSoldiers(factionKey).filter(s => participatedIds.has(s.id));
  const totalBattles = (campaignRecords._meta && campaignRecords._meta.totalBattles) || 0;
  let html = '<div style="background:#222;border:2px solid #888;border-radius:8px;padding:20px;max-width:800px;width:95%;max-height:90vh;overflow-y:auto;">';
  html += `<h2 style="color:#ffeb3b;margin:0 0 12px;">キャンペーン結果 — ${won ? '勝利！' : '敗北'} <span style="color:#aaa;font-size:14px;">(${totalBattles} 戦目)</span></h2>`;

  // 兵士一覧
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px;color:#ccc;">';
  html += '<tr style="color:#888;border-bottom:1px solid #555;"><th>名前</th><th>階級</th><th>戦</th><th>KIA値</th><th>モラル</th><th>パニック</th><th>CCV</th><th>気力</th><th>生存</th><th>昇進</th><th>気力使用</th></tr>';
  soldiers.forEach(s => {
    const rec = getRecord(factionKey, s.id);
    const statusColor = rec.status === 'active' ? '#8f8' : rec.status === 'wounded' ? '#fa0' : rec.status === 'killed' ? '#f44' : '#888';
    const statusLabel = STATUS_LABEL[rec.status] || rec.status;
    const def = (SOLDIER_CARDS[factionKey] || []).find(d => s.id.match(/(\d+)\s*$/) && d.num === parseInt(s.id.match(/(\d+)\s*$/)[1], 10));
    const name = def ? def.name : s.id;
    const rank = def && def.rank ? def.rank : (rec.rank || '');
    const kiaVal = rec.kia != null ? rec.kia : 8;
    const baseMoraleStr = def ? def.morale : '';
    const basePanicStr = def ? def.panic : '';
    const baseMoraleN = parseInt(baseMoraleStr, 10);
    const basePanicN = parseInt(basePanicStr, 10);
    const isKilled = rec.status === 'killed';
    const moraleCur = (!isKilled && rec.moraleVal != null) ? rec.moraleVal : baseMoraleStr;
    const panicCur = (!isKilled && rec.panicVal != null) ? rec.panicVal : basePanicStr;
    const moraleDisp = (!isKilled && rec.moraleVal != null && !isNaN(baseMoraleN) && rec.moraleVal !== baseMoraleN)
      ? `${moraleCur}(${baseMoraleStr})` : moraleCur;
    const panicDisp = (!isKilled && rec.panicVal != null && !isNaN(basePanicN) && rec.panicVal !== basePanicN)
      ? `${panicCur}(${basePanicStr})` : panicCur;
    const canSpend = (rec.moralePoints || 0) >= 5 && rec.status !== 'killed';
    const btnStyle = canSpend
      ? 'background:#46a;color:#fff;border:1px solid #6af;border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer;margin:0 2px;'
      : 'background:#444;color:#888;border:1px solid #555;border-radius:3px;padding:2px 6px;font-size:11px;margin:0 2px;cursor:not-allowed;';
    html += `<tr style="border-bottom:1px solid #333;">`;
    html += `<td style="padding:4px;">${name}</td>`;
    html += `<td>${rank}</td>`;
    html += `<td style="text-align:center;">${rec.battles || 0}</td>`;
    html += `<td style="text-align:center;">${kiaVal}</td>`;
    html += `<td style="text-align:center;">${moraleDisp}</td>`;
    html += `<td style="text-align:center;">${panicDisp}</td>`;
    // CCV表示: ccvFront のみ (上昇時は armed部分を更新して括弧内に元値)
    (function() {
      const bF = def ? def.ccvFront : '';
      const armedF = (function(s){ const m = String(s||'').match(/^(-?\d+)/); return m ? parseInt(m[1],10) : null; })(bF);
      const curF = (!isKilled && rec.ccvFrontVal != null) ? rec.ccvFrontVal : armedF;
      const upF = (!isKilled && rec.ccvFrontVal != null && armedF != null && rec.ccvFrontVal !== armedF);
      function replaceArmed(orig, newArmed) {
        if (newArmed == null) return orig || '';
        if (!orig) return String(newArmed);
        return String(orig).replace(/^-?\d+/, String(newArmed));
      }
      const dispF = upF ? `${replaceArmed(bF, curF)}(${bF})` : (bF || '');
      html += `<td style="text-align:center;">${dispF}</td>`;
    })();
    const mpBreakdown = rec.lastMpBreakdown ? ` <span style="color:#888;font-size:11px;">(${rec.lastMpBreakdown})</span>` : '';
    html += `<td style="text-align:center;">${rec.moralePoints || 0}${mpBreakdown}</td>`;
    const survivalDisp = (rec.status === 'killed') ? 'KIA' : '/'.repeat(rec.survivalSlashes || 0);
    html += `<td style="text-align:center;color:${rec.status === 'killed' ? '#f44' : '#ccc'};">${survivalDisp}</td>`;
    html += `<td style="text-align:center;">${'/'.repeat(rec.promotionSlashes || 0)}</td>`;
    html += `<td style="text-align:center;white-space:nowrap;">`;
    html += `<button class="morale-spend-btn" data-id="${s.id}" data-choice="morale" style="${btnStyle}"${canSpend ? '' : ' disabled'}>モラル+1</button>`;
    html += `<button class="morale-spend-btn" data-id="${s.id}" data-choice="panic" style="${btnStyle}"${canSpend ? '' : ' disabled'}>パニック+1</button>`;
    html += `<button class="ccv-spend-btn" data-id="${s.id}" style="${btnStyle}"${canSpend ? '' : ' disabled'}>CCV+1</button>`;
    html += `</td>`;
    html += `</tr>`;
  });
  html += '</table>';

  // 戦間処理ボタン
  html += '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">';
  html += '<button id="interim-done" style="background:#555;color:#fff;border:1px solid #777;border-radius:4px;padding:8px 16px;cursor:pointer;">次のシナリオへ</button>';
  html += '<button id="interim-reset" style="background:#a33;color:#fff;border:1px solid #f66;border-radius:4px;padding:8px 16px;cursor:pointer;">リセット</button>';
  html += '<button id="interim-export" style="background:#36a;color:#fff;border:1px solid #6af;border-radius:4px;padding:8px 16px;cursor:pointer;">書き出し</button>';
  html += '<button id="interim-import" style="background:#363;color:#fff;border:1px solid #6c6;border-radius:4px;padding:8px 16px;cursor:pointer;">読み込み</button>';
  html += '<input type="file" id="interim-import-file" accept=".json" style="display:none;">';
  html += '</div>';
  html += '</div>';
  ov.innerHTML = html;

  document.getElementById('interim-reset').addEventListener('click', () => {
    if (!confirm('全キャンペーン記録をリセットしますか?')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    campaignRecords = loadRecords();
    saveRecords();
    showInterimScreen(factionKey, won);
  });
  document.getElementById('interim-export').addEventListener('click', () => {
    const data = JSON.stringify(campaignRecords, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url; a.download = `upfront_campaign_${ts}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  });
  document.getElementById('interim-import').addEventListener('click', () => {
    document.getElementById('interim-import-file').click();
  });
  document.getElementById('interim-import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target.result);
        campaignRecords = obj;
        saveRecords();
        alert('キャンペーン記録を読み込みました');
        showInterimScreen(factionKey, won);
      } catch (err) {
        alert('読み込み失敗: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
  document.getElementById('interim-done').addEventListener('click', () => {
    ov.style.display = 'none';
    // タイトルに戻る
    document.getElementById('game').classList.remove('active');
    document.getElementById('faction-select').style.display = '';
  });
  // 気力使用ボタン
  document.querySelectorAll('.morale-spend-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.getAttribute('data-id');
      const choice = btn.getAttribute('data-choice');
      const rec = getRecord(factionKey, sid);
      const def = (SOLDIER_CARDS[factionKey] || []).find(d => sid.match(/(\d+)\s*$/) && d.num === parseInt(sid.match(/(\d+)\s*$/)[1], 10));
      const baseMorale = def ? parseInt(def.morale, 10) || 0 : 0;
      const basePanic = def ? parseInt(def.panic, 10) || 0 : 0;
      const C = window.CAMPAIGN_RULES;
      if (!C || !C.applyMoraleIncreaseOnce) return;
      const res = C.applyMoraleIncreaseOnce(rec, choice, baseMorale, basePanic);
      if (!res.ok) {
        alert(res.reason || '適用不可');
        return;
      }
      saveRecords();
      showInterimScreen(factionKey, won);
    });
  });
  // CCV+1 ボタン
  document.querySelectorAll('.ccv-spend-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.getAttribute('data-id');
      const rec = getRecord(factionKey, sid);
      const def = (SOLDIER_CARDS[factionKey] || []).find(d => sid.match(/(\d+)\s*$/) && d.num === parseInt(sid.match(/(\d+)\s*$/)[1], 10));
      const baseCcvFront = def ? def.ccvFront : '';
      const baseCcvBack  = def ? def.ccvBack  : '';
      const C = window.CAMPAIGN_RULES;
      if (!C || !C.applyCCVIncreaseOnce) return;
      const res = C.applyCCVIncreaseOnce(rec, baseCcvFront, baseCcvBack);
      if (!res.ok) {
        alert(res.reason || '適用不可');
        return;
      }
      saveRecords();
      showInterimScreen(factionKey, won);
    });
  });
}

// 補充兵追加: KIA兵士を新兵に置き換え
function interimReplace(factionKey) {
  const soldiers = getAllSoldiers(factionKey);
  let replaced = 0;
  soldiers.forEach(s => {
    const rec = getRecord(factionKey, s.id);
    if (rec.status === 'killed') {
      rec.status = 'active';
      rec.battles = 0; rec.wins = 0; rec.kills = 0; rec.wounds = 0; rec.pins = 0;
      rec.moralePoints = 0; rec.promoted = false; rec.decorations = [];
      rec.malfunctioned = false; rec.destroyed = false;
      rec.rank = '補充兵';
      replaced++;
    }
  });
  saveRecords();
  alert(`${replaced}名の補充兵を追加しました`);
}

// 昇進判定
function interimPromote(factionKey) {
  const SH = window.SCENARIO_HELPERS;
  const table = SH ? SH.getPromotionTable(factionKey) : null;
  if (!table) { alert('昇進テーブルがありません'); return; }
  const ranks = table.ranks;
  const thresholds = table.thresholds;
  const soldiers = getAllSoldiers(factionKey);
  let promoted = 0;
  const promotedNames = [];
  soldiers.forEach(s => {
    const rec = getRecord(factionKey, s.id);
    if (rec.status !== 'active') return;
    const currentIdx = ranks.indexOf(rec.rank);
    if (currentIdx < 0 || currentIdx >= ranks.length - 1) return;
    const nextThreshold = thresholds[currentIdx + 1] || Infinity;
    if (rec.moralePoints >= nextThreshold) {
      const oldRank = rec.rank;
      rec.rank = ranks[currentIdx + 1];
      rec.promoted = true;
      promoted++;
      const def = (SOLDIER_CARDS[factionKey] || []).find(d => {
        const m = s.id.match(/(\d+)\s*$/);
        return m && d.num === parseInt(m[1], 10);
      });
      promotedNames.push(`${def ? def.name : s.id}: ${oldRank}→${rec.rank}`);
    }
  });
  saveRecords();
  if (promoted > 0) {
    alert(`昇進:\n${promotedNames.join('\n')}`);
  } else {
    alert('昇進対象者はいません');
  }
}

// 武器修理（戦間）
function interimRepair(factionKey) {
  const soldiers = getAllSoldiers(factionKey);
  let repaired = 0;
  soldiers.forEach(s => {
    const rec = getRecord(factionKey, s.id);
    if (rec.status !== 'active') return;
    if (rec.malfunctioned) {
      rec.malfunctioned = false;
      repaired++;
    }
  });
  saveRecords();
  alert(`${repaired}件の武器を修理しました`);
}

function showFireResultOverlay(title, results, fireCard) {
  try { ufLogFire(title, results); } catch (e) {}
  // 直前のオーバーレイ処理を待ってから表示
  const next = (typeof _aiActionQueue !== 'undefined' ? _aiActionQueue : Promise.resolve())
    .then(() => _showFireResultOverlayImpl(title, results, fireCard));
  if (typeof _aiActionQueue !== 'undefined') _aiActionQueue = next.catch(() => {});
  return next;
}
function _showFireResultOverlayImpl(title, results, fireCard) {
  return new Promise(resolve => {
    let ov = document.getElementById('fire-result-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'fire-result-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2500;display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(ov);
    }
    ov.style.display = 'flex';

    let html = '<div style="display:flex;gap:12px;align-items:flex-start;max-height:90vh;">';
    html += '<div style="background:#222;border:2px solid #888;border-radius:8px;padding:20px;min-width:420px;max-width:700px;max-height:80vh;overflow-y:auto;">';
    html += `<div style="font-size:16px;font-weight:bold;color:#ffeb3b;margin-bottom:10px;">${title}</div>`;
    // ヘッダー行
    html += '<div style="display:flex;gap:4px;padding:2px 8px;font-size:11px;color:#888;margin-bottom:4px;">';
    html += '<span style="min-width:90px;">兵士</span>';
    html += '<span style="min-width:30px;text-align:center;">状態</span>';
    html += '<span style="min-width:35px;text-align:center;">火力</span>';
    html += '<span style="min-width:45px;text-align:center;">RNC</span>';
    html += '<span style="min-width:35px;text-align:center;">合計</span>';
    html += '<span style="min-width:35px;text-align:center;">士気</span>';
    html += '<span style="min-width:35px;text-align:center;">KIA</span>';
    html += '<span style="min-width:70px;text-align:center;">結果</span>';
    html += '</div>';
    // 兵士行
    results.forEach((r, idx) => {
      const pinLabel = r.wasPinned ? 'PIN' : '';
      html += `<div class="fire-row" style="display:flex;align-items:center;gap:4px;padding:5px 8px;margin-bottom:1px;background:#333;border-radius:3px;">`;
      html += `<span style="color:#ccc;min-width:90px;font-size:13px;">${r.name}</span>`;
      html += `<span style="min-width:30px;text-align:center;font-size:11px;color:${r.wasPinned ? '#fd0' : '#555'};">${pinLabel}</span>`;
      html += `<span style="min-width:35px;text-align:center;font-size:13px;color:#aaa;">${r.finalFP != null ? r.finalFP : ''}</span>`;
      html += `<span class="rnc-cell" style="min-width:45px;text-align:center;font-weight:bold;font-size:13px;color:#888;">—</span>`;
      html += `<span class="sum-cell" style="min-width:35px;text-align:center;font-weight:bold;font-size:13px;color:#888;">—</span>`;
      html += `<span style="min-width:35px;text-align:center;font-size:13px;color:#adf;">${r.morale || ''}</span>`;
      html += `<span style="min-width:35px;text-align:center;font-size:13px;color:#faa;">${r.kia || ''}</span>`;
      html += `<span class="result-cell" style="min-width:70px;text-align:center;font-weight:bold;font-size:14px;color:#555;">—</span>`;
      html += '</div>';
    });
    html += `<button id="fire-result-ok" style="display:none;margin-top:12px;background:#3a3;color:#fff;border:1px solid #6c6;border-radius:4px;padding:8px 30px;font-size:14px;cursor:pointer;width:100%;">OK</button>`;
    html += '</div>'; // 左ボックス閉じ
    // 右側: 射撃に用いたカード（複数可）
    const fireCards = Array.isArray(fireCard) ? fireCard : (fireCard ? [fireCard] : []);
    const validFireCards = fireCards.filter(c => c && c.img);
    if (validFireCards.length > 0) {
      html += '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;background:#222;border:2px solid #888;border-radius:8px;padding:16px;max-height:80vh;overflow-y:auto;">';
      html += '<div style="font-size:12px;color:#aaa;">射撃カード</div>';
      validFireCards.forEach(c => {
        html += `<img src="${c.img}" style="height:340px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">`;
      });
      html += '</div>';
    }
    html += '</div>'; // 外側 flex 閉じ
    ov.innerHTML = html;

    const rows = ov.querySelectorAll('.fire-row');
    const rncVals = ['赤6','赤5','赤4','赤3','赤2','赤1','黒0','黒1','黒2','黒3','黒4','黒5','黒6'];

    // 全員一斉にRNCアニメ開始
    const intervals = [];
    rows.forEach((row, idx) => {
      const cell = row.querySelector('.rnc-cell');
      let tick = 0;
      intervals[idx] = setInterval(() => {
        const ri = tick % rncVals.length;
        const txt = rncVals[ri];
        const isRed = txt.startsWith('赤');
        cell.textContent = txt.replace('赤','').replace('黒','');
        cell.style.color = isRed ? '#f66' : '#6cf';
        tick++;
      }, 50);
    });

    // results が空の場合は即OKボタン表示
    if (results.length === 0) {
      document.getElementById('fire-result-ok').style.display = 'block';
    }

    // 時間差で確定（上から順に 0.6秒間隔）
    let settled = 0;
    results.forEach((r, idx) => {
      const delay = 600 + idx * 350;
      setTimeout(() => {
        clearInterval(intervals[idx]);
        const row = rows[idx];
        const rncCell = row.querySelector('.rnc-cell');
        const sumCell = row.querySelector('.sum-cell');
        const resCell = row.querySelector('.result-cell');
        const absVal = Math.abs(r.rnc);
        const isRed = r.rncColor === '赤';
        rncCell.textContent = (isRed ? '赤' : '黒') + absVal;
        rncCell.style.color = isRed ? '#f66' : '#6cf';
        if (r.sum != null) { sumCell.textContent = r.sum; sumCell.style.color = '#fff'; }
        resCell.textContent = resultLabel(r.result);
        resCell.style.color = resultColor(r.result);
        settled++;
        if (settled >= results.length) {
          document.getElementById('fire-result-ok').style.display = 'block';
        }
      }, delay);
    });

    document.getElementById('fire-result-ok').addEventListener('click', () => {
      intervals.forEach(iv => clearInterval(iv));
      ov.style.display = 'none';
      resolve();
    });
  });
}

/**
 * §7.32 地形拒否: プレイヤーのグループに相手が地形を置いた時の選択
 * 受け入れ → 地形スタックに積む、下のアクションカード(移動等)を捨て札(§7.34)
 * 拒否 → 移動カードを横移動に変更(距離戻す)or横移動の移動カードを捨て札、地形カードも捨て札
 */
function askTerrainRefusal(grp, terrainCard) {
  return new Promise(resolve => {
    const modal = document.getElementById('terrain-refuse-modal');
    const title = document.getElementById('terrain-refuse-title');
    const info = document.getElementById('terrain-refuse-info');
    title.textContent = `地形カード「${terrainCard.terrain.type}」が配置されました`;

    // グループの最後の移動カード情報を表示
    const lastMove = findLastMovement(grp);
    if (lastMove) {
      info.textContent = '拒否すると移動カードが横移動モードになり、距離が戻ります。';
    } else {
      info.textContent = '移動カードがないため拒否できません。';
    }

    modal.style.display = 'flex';
    const accBtn = document.getElementById('terrain-accept');
    const refBtn = document.getElementById('terrain-refuse');
    const newAcc = accBtn.cloneNode(true);
    const newRef = refBtn.cloneNode(true);
    accBtn.replaceWith(newAcc);
    refBtn.replaceWith(newRef);

    // §7.3/§8.5 河川・地雷原は拒否不可 / §13.1 煙幕・鉄条網は拒否不可 / 移動カードがなければ拒否不可
    // §7.32 横移動中でも拒否できる（その移動カードは捨て札）
    const tTypeR = terrainCard.terrain && terrainCard.terrain.type;
    const isStream = tTypeR === 'STREAM';
    const isSmoke = tTypeR === 'SMOKE';
    const isMinefieldR = tTypeR === 'MINEFIELD';
    const isWireR = tTypeR === 'WIRE';
    const isLateralMv = !!(lastMove && lastMove.mode === 'lateral');
    const canRefuse = lastMove && !isStream && !isSmoke && !isMinefieldR && !isWireR;
    newRef.disabled = !canRefuse;
    newRef.style.opacity = canRefuse ? '1' : '0.4';
    if (isStream) info.textContent = '河川は拒否できません。';
    else if (isMinefieldR) info.textContent = '地雷原は拒否できません。';
    else if (isSmoke) info.textContent = '煙幕は拒否できません。';
    else if (isWireR) info.textContent = '鉄条網は拒否できません。';
    else if (isLateralMv) info.textContent = '横移動中に拒否すると、その移動カードは捨て札になります。';

    newAcc.addEventListener('click', () => {
      modal.style.display = 'none';
      // §7.34 下のカードを全て捨て札（煙幕/鉄条網は重ねるだけ）
      const tType = terrainCard.terrain && terrainCard.terrain.type;
      const isOverlay = tType === 'SMOKE' || tType === 'WIRE';
      if (!isOverlay) {
        removeSmokeFromGroup(grp, 'player', '地形カードを配置'); // §13.241
        while (grp.terrain.length > 0) {
          pushTerrainToDiscard(grp.terrain.pop());
        }
      }
      pushTerrainWithFaction(grp, terrainCard);
      // §24.31 地雷原を置かれたら直ちに1つの位置が攻撃を受ける
      if (tType === 'MINEFIELD') triggerMinefieldAttack(grp, terrainCard, 'player');
      resolve('accept');
    });

    newRef.addEventListener('click', () => {
      if (!lastMove) return;
      modal.style.display = 'none';
      // 前進/後退の移動カード → 横移動に変更、距離を戻す
      if (lastMove.mode === 'advance') {
        grp.distance -= 1;
        if (lastMove.card) lastMove.card._moveMode = 'lateral';
      } else if (lastMove.mode === 'retreat') {
        grp.distance += 1;
        if (lastMove.card) lastMove.card._moveMode = 'lateral';
      }
      // 既に横移動モードなら移動カードを捨て札
      if (lastMove.mode === 'lateral') {
        grp.terrain.splice(lastMove.idx, 1);
        pushTerrainToDiscard(lastMove.card);
      }
      // 地形カードを捨て札
      pushTerrainToDiscard(terrainCard);
      // §13.241 煙幕上に置かれた地形を拒否しても煙幕は取り去られる
      removeSmokeFromGroup(grp, 'player', '地形カードを拒否');
      breakFlanksOn(grp); // §17.42 拒否しても側面射撃は終わる
      resolve('refuse');
    });
  });
}

/** グループの地形スタック最上の移動カード情報を返す */
function findLastMovement(grp) {
  if (!grp.terrain || grp.terrain.length === 0) return null;
  for (let i = grp.terrain.length - 1; i >= 0; i--) {
    const c = grp.terrain[i];
    if (c && c.terrain && c.terrain.type === 'MOVEMENT') {
      // mode判定: lateral フラグがあるか、距離変動があったか
      // 簡易: moveMode プロパティで判定
      const mode = c._moveMode || 'advance';
      return { idx: i, card: c, mode };
    }
    break; // 最上が移動でなければなし
  }
  return null;
}

function showMoveDirectionModal(grp, card, cardIdx) {
  const modal = document.getElementById('move-dir-modal');
  modal.style.display = 'flex';
  const advBtn = document.getElementById('move-advance');
  const latBtn = document.getElementById('move-lateral');
  const retBtn = document.getElementById('move-retreat');
  const cancelBtn = document.getElementById('move-cancel');
  const newAdv = advBtn.cloneNode(true);
  const newLat = latBtn.cloneNode(true);
  const newRet = retBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  advBtn.replaceWith(newAdv);
  latBtn.replaceWith(newLat);
  retBtn.replaceWith(newRet);
  cancelBtn.replaceWith(newCancel);
  // disabled状態をリセット（前回 disabled にしたボタンが cloneNode で属性引継ぐため）
  newAdv.disabled = false; newAdv.style.opacity = '1';
  newLat.disabled = false; newLat.style.opacity = '1';
  newRet.disabled = false; newRet.style.opacity = '1';

  // キャンセル: モーダルを閉じ、選択状態をクリア（カードは手札に残る）
  newCancel.addEventListener('click', () => {
    modal.style.display = 'none';
    state.selectedAction = null;
    state.selectedHand.clear();
    state.fireSource = null;
    state.fireTarget = null;
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-confirm').disabled = true;
    renderField('player'); renderField('ai');
    renderHands();
    if (typeof updateDecideBtn === 'function') updateDecideBtn();
  });

  function finish() {
    modal.style.display = 'none';
    // §45 日本軍: 移動はアクションとしてカウントしない（捨て札制限に影響しない）
    const facKey = getFactionKey(state.player);
    if (facKey !== 'jpn' && window.DISCARD_RULES) window.DISCARD_RULES.markActed();
    if (!state.actedGroups) state.actedGroups = new Set();
    if (state.fireSource) state.actedGroups.add(state.fireSource.idx);
    // §20.53 移動カード使用 → 侵入状態解除
    if (window.CC_ACTION) window.CC_ACTION.clearInfiltration(grp, 'move');
    // §20.53 侵入されたグループが相対距離3まで下がった → 敵の侵入兵は侵入状態でなくなる
    { const _n = releaseInfiltrationOnRetreat(grp, 'player', 'move');
      if (_n) setTimeout(() => alert(`GROUP ${grp.name} が相対距離3まで下がったので、敵の侵入兵 ${_n}名は侵入状態でなくなりました（§20.53）`), 50); }
    state.selectedAction = null;
    state.selectedHand.clear();
    state.fireSource = null;
    state.fireTarget = null;
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-confirm').disabled = true;
    renderField('player'); renderField('ai');
    renderHands();
    updateDecideBtn();
  }

  // §8.53 河川 / §8.22 涸れ谷 / §8.42 湿地: 1枚目の移動カードは横向き強制（2枚目以降は自由）
  const R_move = window.INFANTRY_RULES;
  const inStream = R_move && R_move.isInStream(grp);
  const inGully = R_move && R_move.isInGully && R_move.isInGully(grp);
  const inMarsh = R_move && R_move.isInMarsh && R_move.isInMarsh(grp);
  let _firstMoveOnSpecial = false;
  if (inStream && R_move.streamMoveCount && R_move.streamMoveCount(grp) === 0) _firstMoveOnSpecial = true;
  if (inGully && R_move.gullyMoveCount && R_move.gullyMoveCount(grp) === 0) _firstMoveOnSpecial = true;
  if (inMarsh && R_move.marshMoveCount && R_move.marshMoveCount(grp) === 0) _firstMoveOnSpecial = true;
  // §17.8 移送中（送り出し・受け取り待ち）のグループは距離チットを動かせない（横移動だけ）
  const _gp = _groupSideIdx(grp);
  if (_gp && groupInTransfer(_gp.side, _gp.idx)) _firstMoveOnSpecial = true;
  if (_firstMoveOnSpecial) {
    newAdv.disabled = true; newAdv.style.opacity = '0.4';
    newRet.disabled = true; newRet.style.opacity = '0.4';
  }
  // 地雷原のあるグループは前進/後退不可（横移動のみ）
  const inMinefield = grp.terrain.some(c => c && c.terrain && c.terrain.type === 'MINEFIELD');
  if (inMinefield) {
    newAdv.disabled = true; newAdv.style.opacity = '0.4';
    newRet.disabled = true; newRet.style.opacity = '0.4';
  }

  newAdv.addEventListener('click', () => {
    if (_firstMoveOnSpecial) return;
    // §5.7 相対距離5 で前進不可
    const R_blk = window.INFANTRY_RULES;
    const selfIdx = state.groups.player.indexOf(grp);
    const opposing = state.groups.ai[selfIdx];
    if (opposing && R_blk && R_blk.isBlocked && R_blk.isBlocked(grp, opposing)) {
      alert('相対距離5のため前進できません（§5.7）');
      return;
    }
    grp.distance += 1;
    card._moveMode = 'advance';
    pushTerrainWithFaction(grp, card);
    state.playerHand.splice(cardIdx, 1);
    finish();
  });

  newLat.addEventListener('click', () => {
    const R = window.INFANTRY_RULES;
    // §8.53 河川内なら渡河判定
    if (R && R.isInStream(grp) && !R.hasCrossedStream(grp)) {
      state.playerHand.splice(cardIdx, 1);
      if (R.isFordCard(card)) {
        card._moveMode = 'lateral';
        pushTerrainWithFaction(grp, card);
        alert('渡河成功（渡河カード使用）');
        finish();
      } else {
        // RNCで判定: 黒なら成功
        const judge = drawTerrainCard();
        showJudgeCard(judge);
        if (judge) { checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge); }
        const isBlack = !(judge && judge.terrain && judge.terrain.rncColor === '赤');
        if (isBlack) {
          card._moveMode = 'lateral';
          pushTerrainWithFaction(grp, card);
          alert('渡河成功（RNC 黒）');
        } else {
          pushTerrainToDiscard(card);
          breakFlanksOn(grp); // §17.43 不成功の渡河も移動カードを使ったことになる
          alert('渡河失敗（RNC 赤）— カードは捨て札');
        }
        finish();
      }
      return;
    }
    card._moveMode = 'lateral';
    pushTerrainWithFaction(grp, card);
    state.playerHand.splice(cardIdx, 1);
    finish();
  });

  newRet.addEventListener('click', () => {
    if (_firstMoveOnSpecial) return;
    // §5.51 撤退: 一番近い敵グループとの相対距離が0より小さくなる後退は不可
    const newDist = grp.distance - 1;
    const enemies = (state.groups.ai || []).filter(e => e && !e.eliminated);
    if (enemies.length > 0) {
      const nearest = Math.min(...enemies.map(e => newDist + (e.distance || 0)));
      if (nearest < 0) {
        alert('一番近い敵グループとの相対距離が0より小さくなるため、後退できません（§5.51）');
        return;
      }
    }
    // §5.51 距離チットがマイナスになる後退は、赤いRNCの移動カードでなければならない
    if (newDist < 0 && !(card.terrain && card.terrain.rncColor === '赤')) {
      alert('距離チットがマイナスになる後退には、赤いRNCの移動カードが必要です（§5.51）');
      return;
    }
    // 距離はマイナスも可（相対距離は0として扱う）
    grp.distance -= 1;
    card._moveMode = 'retreat';
    pushTerrainWithFaction(grp, card);
    state.playerHand.splice(cardIdx, 1);
    finish();
  });
}

// プレイヤー視点: ターゲットが認知されているか or 照らされているか
function isTargetVisibleForPlayer(srcGrp, tgtGrpIdx, tgtSide) {
  if (!state.isNight) return true;
  if (srcGrp && srcGrp.recognizedTargets && srcGrp.recognizedTargets.indexOf(tgtGrpIdx) >= 0) return true;
  const tgt = state.groups[tgtSide] && state.groups[tgtSide][tgtGrpIdx];
  if (tgt && tgt.flaredUntilTurn && tgt.flaredUntilTurn >= (state.turnCount || 0)) return true;
  return false;
}

/** §20.531 侵入兵は、グループの射撃に参加するかを選べる（参加しなければ侵入状態のまま） */
function resolveFireAction() {
  const R = window.INFANTRY_RULES;
  const src = state.fireSource;
  const srcGroup = src && state.groups[src.side] && state.groups[src.side][src.idx];
  const infs = (srcGroup && R) ? srcGroup.cards.filter(c => c.infiltrating && R.isAlive(c) && !R.isPinned(c)) : [];
  if (infs.length > 0) {
    const fk = getFactionKey(state.player);
    const lst = infs.map((c, k) => { const d = R.lookupSoldier(c, fk); return `${k + 1}: ${d ? d.name : c.id}`; }).join('\n');
    const ans = prompt(`侵入兵は射撃に参加するかを選べます（§20.531）。参加しない侵入兵の番号を入力してください（スペース区切り、空欄なら全員参加）\n参加すると、射撃のあと侵入状態でなくなります\n${lst}`, '');
    if (ans == null) return;
    ans.split(/[\s,]+/).map(x => parseInt(x, 10) - 1).filter(k => k >= 0 && k < infs.length).forEach(k => { infs[k]._noFire = true; });
  }
  // §22.2 火炎放射器は、参加させないと前もって宣言すれば攻撃に参加しない
  const fts = (srcGroup && R) ? srcGroup.cards.filter(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c.malfunctioned || c.destroyed || c._noFire) return false;
    const d = R.lookupSoldier(c, getFactionKey(state.player));
    return d && d.weaponCat && d.weaponCat.indexOf('火炎放射器') === 0;
  }) : [];
  if (fts.length > 0 && !confirm('火炎放射器をこの攻撃に参加させますか？（キャンセル: 参加させない §22.2）')) fts.forEach(c => { c._noFire = true; });
  try {
    _resolveFireActionInner();
  } finally {
    if (srcGroup) srcGroup.cards.forEach(c => { delete c._noFire; });
  }
}

function _resolveFireActionInner() {
  const R = window.INFANTRY_RULES;
  if (!R) { alert('ルールエンジン未読込'); return; }
  const src = state.fireSource;
  const tgt = state.fireTarget;
  if (!src || !tgt) return;
  const srcGroup = state.groups[src.side][src.idx];
  const tgtGroup = state.groups[tgt.side][tgt.idx];
  // §23.7 トーチカとその背後のグループは互いに撃てない
  const _pbRel = pillboxRelation(src.side, src.idx, tgt.idx);
  if (_pbRel === 'blocked') { alert('トーチカと、その背後（距離チット6）にいるグループは互いに射撃できません（§23.7）'); return; }
  // 夜間: 認知 or 照射 されていないターゲットには射撃不可
  if (!isTargetVisibleForPlayer(srcGroup, tgt.idx, tgt.side)) {
    alert('夜間: 認知されていない敵には射撃できません（索敵してください）');
    return;
  }
  const playerKey = getFactionKey(state.player);
  const enemyKey  = getFactionKey(state.ai);
  const srcFacKey = src.side === 'player' ? playerKey : enemyKey;
  const tgtFacKey = tgt.side === 'player' ? playerKey : enemyKey;

  // 相対距離（隣接でなければ-1）
  const adjacent = Math.abs(src.idx - tgt.idx) <= 1;
  const baseDistance = R.relativeRange(srcGroup.distance, tgtGroup.distance);
  const distance = adjacent ? baseDistance : Math.max(0, baseDistance - 1);

  // §8.2 GULLY チェック
  if (R.isInGully(srcGroup)) { alert('涸れ谷にいるグループは攻撃できません'); return; }
  if (R.isInGully(tgtGroup) && !R.canFireAtGully(srcGroup, distance, {})) { alert('涸れ谷にいるグループは攻撃できません（例外: 狙撃、迫撃砲、丘上、相対距離5）'); return; }

  // §6.2 火力（地形スタック末尾がMOVEMENTなら移動中＝火力半減）
  const lastTerrain = srcGroup.terrain.length > 0 ? srcGroup.terrain[srcGroup.terrain.length - 1] : null;
  const moving = !!(lastTerrain && lastTerrain.terrain && lastTerrain.terrain.type === 'MOVEMENT');
  const crewMap = srcGroup.crewPairs ? buildCrewMapFromPairs(srcGroup) : {};
  let fp = R.calcGroupFirepower(srcGroup, srcFacKey, distance, { moving, crewMap });
  // ===== 射撃詳細ログ =====
  try {
    console.log('===== FIRE DETAIL (player) =====');
    console.log(`  src=GROUP ${srcGroup.name}(idx=${src.idx}) dist=${srcGroup.distance} → tgt=GROUP ${tgtGroup.name}(idx=${tgt.idx}) dist=${tgtGroup.distance} | relative=${distance}`);
    console.log(`  state: isNight=${state.isNight} turnCount=${state.turnCount} moving=${moving} (last=${lastTerrain && lastTerrain.terrain ? lastTerrain.terrain.type : 'none'}, _moveMode=${lastTerrain ? lastTerrain._moveMode : '-'})`);
    console.log(`  tgt.flaredUntilTurn=${tgtGroup.flaredUntilTurn} → effectiveNight=${state.isNight && !(tgtGroup.flaredUntilTurn && tgtGroup.flaredUntilTurn >= (state.turnCount||0))}`);
    console.log(`  crewPairs=${JSON.stringify(srcGroup.crewPairs || {})}`);
    const assistantSet = new Set(Object.values(crewMap));
    const idx_ = R.rangeIndex ? R.rangeIndex(distance) : Math.max(0, Math.min(5, Math.floor(distance)));
    srcGroup.cards.forEach((c, i) => {
      const def = R.lookupSoldier(c, srcFacKey);
      const rd = def && def.rangeData ? def.rangeData[idx_] : null;
      const reasons = [];
      if (!R.isAlive(c)) reasons.push('not-alive');
      if (R.isPinned(c)) reasons.push('pinned');
      if (assistantSet.has(i)) reasons.push('assistant');
      if (c.malfunctioned) reasons.push('malf');
      if (c.destroyed) reasons.push('destroyed');
      const excluded = reasons.length > 0;
      console.log(`    #${c.num} ${def?def.name:c.id} ${def?def.weaponCat:'?'} rd.main=${rd?rd.main:'-'} rd.noCrew=${rd?rd.noCrew:'-'} ${excluded?'[EXCLUDED: '+reasons.join(',')+']':'[INCLUDED]'}`);
    });
    console.log(`  calcGroupFirepower(soldier fp total) = ${fp}`);
  } catch(e){ console.log('fire log error', e); }
  // §20.51 侵入兵の火力2倍（侵入先グループへの射撃時）
  const CC = window.CC_ACTION;
  const infBonus = CC ? CC.calcInfiltrationFPBonus(srcGroup, tgt.side, tgt.idx, srcFacKey, distance) : 0;
  fp += infBonus;
  // §17.4 側面射撃: 兵士火力を2倍（火炎放射器は除く）。§17.3 通常側面射撃・§17.612 包囲下も含む
  const _isFlankPre = isFlankFire(src.side, src.idx, tgt.idx);
  if (_isFlankPre) fp = flankDoubledFP(srcGroup, srcFacKey, distance, fp, { moving, crewMap });

  // 射撃カードを抽出し、必要火力チェック
  const fireCards = [...state.selectedHand].map(i => state.playerHand[i]).filter(c => c.terrain && c.terrain.type && c.terrain.type.indexOf('FIRE') === 0);
  if (fireCards.length === 0) { alert('「射撃」カードを選択してください'); return; }
  let needed = 0;
  fireCards.forEach(c => {
    const m = (c.terrain.sub || '').match(/FP(.)/);
    needed += circledToNum((m && m[1]) || '');
  });
  // §10.45 ヒーローカード: 兵士1名の火力をそのターン2倍（すでに2倍なら3倍）。対象の兵士を選ぶ
  const heroPreCard = [...state.selectedHand].map(i => state.playerHand[i]).find(c => c && c.terrain && c.terrain.type === 'HERO');
  let _heroPicked = null;
  if (heroPreCard) {
    const cands = heroCandidates(srcGroup, srcFacKey, distance, { moving, crewMap });
    if (cands.length === 0) { alert('ヒーローカードで火力が上がる兵士がいません'); return; }
    if (cands.length === 1) {
      _heroPicked = cands[0].card;
    } else {
      const list = cands.map((x, i) => {
        const d = R.lookupSoldier(x.card, srcFacKey);
        return `${i + 1}: ${d ? d.name : x.card.id}（火力 +${x.gain}）`;
      }).join('\n');
      const ans = prompt(`ヒーローカードで火力を上げる兵士を番号で選んでください\n${list}`, '1');
      if (ans == null) return;
      const k = parseInt(ans, 10) - 1;
      if (!(k >= 0 && k < cands.length)) { alert('番号が正しくありません'); return; }
      _heroPicked = cands[k].card;
    }
    // 火力の判定のため一時的に効果を付けて再計算（射撃が確定したら下で正式に付ける）
    const _prevHero = _heroPicked._heroEnhanced;
    _heroPicked._heroEnhanced = _prevHero ? 2 : 1;
    fp = R.calcGroupFirepower(srcGroup, srcFacKey, distance, { moving, crewMap });
    _heroPicked._heroEnhanced = _prevHero;
    if (window.CC_ACTION) fp += window.CC_ACTION.calcInfiltrationFPBonus(srcGroup, tgt.side, tgt.idx, srcFacKey, distance);
    const _isFlankPre2 = isFlankFire(src.side, src.idx, tgt.idx);
    if (_isFlankPre2) fp = flankDoubledFP(srcGroup, srcFacKey, distance, fp, { moving, crewMap });
  }
  let flameHalf = false;
  if (fp < needed) {
    // 火炎放射器を持つ兵士 (生存・非ピン) がいれば 1/2 火力で撃てる
    const hasFlame = srcGroup.cards.some(c => {
      if (!R.isAlive(c) || R.isPinned(c)) return false;
      if (c.malfunctioned || c.destroyed) return false;
      const def = R.lookupSoldier(c, srcFacKey);
      return def && def.weaponCat && def.weaponCat.indexOf('火炎放射器') === 0;
    });
    if (hasFlame) {
      const halfNeed = Math.ceil(needed / 2);
      if (fp >= halfNeed && confirm(`火力不足: 必要 ${needed} / 利用可能 ${fp}\n火炎放射器を使い 1/2 火力で撃ちますか？`)) {
        flameHalf = true;
        needed = halfNeed;
      } else {
        alert(`火力不足: 必要 ${needed} / 利用可能 ${fp}${infBonus ? ' (侵入+' + infBonus + ')' : ''}`);
        return;
      }
    } else {
      alert(`火力不足: 必要 ${needed} / 利用可能 ${fp}${infBonus ? ' (侵入+' + infBonus + ')' : ''}`);
      return;
    }
  }
  // ターン累積 FP 超過チェック (このグループが既に消費した FP + 今回の合計 ≤ fp)
  {
    const _turnedFP = srcGroup.firedFPThisTurn || 0;
    if (_turnedFP + needed > fp) {
      alert(`ターン累積FP超過: 既使用 ${_turnedFP} + 今回 ${needed} = ${_turnedFP + needed} > 火力 ${fp}\n別のカードを選択してください`);
      return;
    }
  }

  // 地形修正 (攻撃側 + 防御側)
  const jpOpts = { japanBuildings: isJapanInGame() };
  // §22.1 火炎放射器を含む攻撃は、防御側の地形の修正を受けない（煙幕・鉄条網・隠蔽は使える）。攻撃側の地形の修正は受ける
  //   火炎放射器の火力があるのは相対距離5だけ。§22.2 参加しないと宣言した火炎放射器は除く
  const _hasFlamethrowerFire = (distance === 5) && srcGroup.cards.some(c => {
    if (!R.isAlive(c) || R.isPinned(c) || c._noFire) return false;
    if (c.malfunctioned || c.destroyed) return false;
    const _def = R.lookupSoldier(c, srcFacKey);
    return _def && _def.weaponCat && _def.weaponCat.indexOf('火炎放射器') === 0;
  });
  const _naturalTerrains = ['WOODS','BUILDINGS','BRUSH','HILL','WALL','GULLY','MARSH','STREAM','PILLBOX'];
  const _effSrcTerrain = srcGroup.terrain; // §22.1 攻撃側の地形の修正は受ける
  const _effDefTerrain = _hasFlamethrowerFire
    ? (tgtGroup.terrain || []).filter(c => !(c && c.terrain && _naturalTerrains.indexOf(c.terrain.type) >= 0))
    : tgtGroup.terrain;
  // §8.31/8.32 丘の例外は相手の地形、§8.9 障壁は包囲の有無で判定
  const _atkOpts = Object.assign({}, jpOpts, { otherStack: _effDefTerrain });
  const atkMod = R.calcTerrainMod(_effSrcTerrain, true, _atkOpts);
  const _isFlankFromAdjacent = src.idx !== tgt.idx;
  const _defOptsP = Object.assign({}, jpOpts, { isFlank: _isFlankFromAdjacent, otherStack: _effSrcTerrain, encircled: !!tgtGroup.encircled });
  const defMod = R.calcTerrainMod(_effDefTerrain, false, _defOptsP);
  // §8.21 GULLY/§8.4 MARSH の防御修正は calcTerrainMod が CSVのmodifierから既に算出するので二重カウントしない
  const gullyMod = 0;
  const marshDefMod = 0;

  // §9 隠蔽: AI側が隠蔽カードを使うか判定
  const aiConcealCards = canUseConcealment(tgtGroup) ? aiUseConcealment() : []; // §9.5 トーチカは不可
  const concealMod = getConcealMod(aiConcealCards);

  // 射撃力 = FIREカードの数字（複数枚使用時は合算）。合計射撃力は味方火力 (fp) 以下である必要あり
  const _rawStrength = fireCards.reduce((s, c) => s + (parseInt(c.terrain.type.replace('FIRE ', ''), 10) || 0), 0);
  if (_rawStrength > fp) {
    alert(`射撃力超過: 合計射撃力 ${_rawStrength} > 味方火力 ${fp}\n選択カード数を減らしてください`);
    return;
  }
  let strength = _rawStrength;
  // 火炎放射器使用で 1/2 火力
  if (flameHalf) strength = Math.floor(strength / 2);
  // §12.1 移動射撃: 射撃カードの射撃力は他の修正に先だって½（端数切り捨て）。横移動も移動中（§6.4）
  //   例外: 必要な火力をすべて火炎放射器だけで与える射撃カード
  const _srcTopMv = srcGroup.terrain && srcGroup.terrain.length > 0 ? srcGroup.terrain[srcGroup.terrain.length - 1] : null;
  const _srcMovingFire = !!(_srcTopMv && _srcTopMv.terrain && _srcTopMv.terrain.type === 'MOVEMENT')
    && !flameCoversNeed(srcGroup, srcFacKey, distance, needed);
  // 夜間は別に半減。ただしターゲットが照明弾で照らされていれば夜間効果スキップ
  const _tgtFlared = !!(tgtGroup && tgtGroup.flaredUntilTurn && tgtGroup.flaredUntilTurn >= (state.turnCount || 0));
  const _effectiveNight = state.isNight && !_tgtFlared;
  strength = halvedFireStrength(strength, _srcMovingFire, _effectiveNight);
  // §23.7 一度トーチカの背後に出て距離チット5へ後退したグループとトーチカの間の射撃は、射撃カードの射撃力が半分（切り捨て）
  if (_pbRel === 'half') strength = Math.floor(strength / 2);
  try {
    const _fireCardNames = fireCards.map(c => c.terrain.type).join(',');
    console.log(`  FIRE cards=[${_fireCardNames}] rawSum=${_rawStrength} flameHalf=${flameHalf} srcMovingFire=${_srcMovingFire} effectiveNight=${_effectiveNight} → strength=${strength}`);
  } catch(e){}
  // §10.45 英雄: 射撃と同時に英雄カード → グループ内最高火力兵士の火力を倍化（=追加加算）
  const heroCard = [...state.selectedHand].map(i => state.playerHand[i]).find(c => c && c.terrain && c.terrain.type === 'HERO');
  let heroBonus = 0;
  if (heroCard) {
    const isBlackHero = !(heroCard.terrain.rncColor === '赤');
    if ((srcFacKey === 'jpn' || srcFacKey === 'uk') && !isBlackHero) {
      alert('日本軍/イギリス軍は黒の英雄カードでないと使えません');
      return;
    }
    // §10.45 選んだ兵士の火力をそのターン2倍（2枚目なら3倍、ターン終了時にクリア）
    // §42.43 ヒーローカードを使った兵士に気力+3
    if (_heroPicked) {
      heroBonus = heroGainForSoldier(srcGroup, _heroPicked, srcFacKey, distance, { moving, crewMap });
      _heroPicked.heroRecovery = true;
      _heroPicked._heroEnhanced = _heroPicked._heroEnhanced ? 2 : 1;
    }
  }
  // §20.51 侵入兵の火力2倍は calcInfiltrationFPBonus で加算済み。コラムシフトは無し。
  const infShift = 0;
  // §17.4 側面射撃: 手動設定フラグ参照。§17.612 包囲下は自動で側面射撃扱い
  // 火力倍化は兵士火力（calcGroupFirepower）側で適用済み。基礎射撃力は変えない
  const tgtEliminated = tgtGroup.eliminated;
  const isFlankFireNow = !tgtEliminated && isFlankFire(src.side, src.idx, tgt.idx);
  // §12.1 移動射撃: 兵士火力は calcGroupFirepower 内で半減済み（基礎判定火力は半減しない）
  const movingFP = strength;
  const japanRuleMod = isJapanInGame() ? -1 : 0;
  // §10.45 英雄カード：必要火力の判定にのみ加算（基礎火力は変えない）
  let baseFP = movingFP + atkMod + defMod + concealMod + gullyMod + marshDefMod + infShift + japanRuleMod;
  try {
    console.log(`  mods: atk=${atkMod} def=${defMod} conceal=${concealMod} gully=${gullyMod} marshDef=${marshDefMod} infShift=${infShift} jpRule=${japanRuleMod} isFlankFire=${isFlankFireNow} heroBonus=${heroBonus} infBonus=${infBonus}`);
    console.log(`  baseFP = strength(${strength}) + sum_mods = ${baseFP}`);
    console.log('===== /FIRE DETAIL =====');
  } catch(e){}
  let malfuncMod = 0;

  // 各防御兵士に判定（1回の射撃で全員に判定）
  const results = [];
  const _targets = attackTargetsOf(tgtGroup); // §17.8 移送中の兵士も目標
  state._malfStopAttack = false;
  for (let i = 0; i < _targets.length; i++) {
    if (state._malfStopAttack) break; // §19.11 残りの防御側の攻撃は解決しない
    const card = _targets[i];
    if (!R.isAlive(card)) continue;
    const finalFP = baseFP + malfuncMod + transitFireBonus(card); // §17.8 移送中 +2
    const judge = drawTerrainCard();
    if (!judge) continue;
    const rncAbs = parseInt((judge.terrain && judge.terrain.range) || '0', 10) || 0;
    const isRed = judge.terrain && judge.terrain.rncColor === '赤';
    const rnc = isRed ? -rncAbs : rncAbs;
    const rpc0r = parseInt((judge.terrain && judge.terrain.dice && judge.terrain.dice['0r']) || '0', 10) || 0;
    const def = R.lookupSoldier(card, tgtFacKey);
    const wasPinned = R.isPinned(card);
    const commissarMod = hasCommissar(tgtGroup) ? 1 : 0;
    const malfMoraleMod = (card.malfunctioned || card.destroyed) ? -1 : 0;
    // §17.613 包囲下のピン兵士はパニック値-1
    const encircleMod = (tgtGroup && tgtGroup.encircled && wasPinned) ? -1 : 0;
    // 火炎放射器を保持中の兵士は kia -1 (戦死しやすい)
    const flameKiaMod = (def && def.weaponCat && def.weaponCat.indexOf('火炎放射器') === 0 && !card.malfunctioned && !card.flameDiscarded) ? -1 : 0;
    const r = R.resolveFireOnSoldier(finalFP, rnc, def, wasPinned, rpc0r, commissarMod + malfMoraleMod, commissarMod + encircleMod + malfMoraleMod, flameKiaMod, R.rpc7wOf(judge));
    if (r.result === 'WOUND') r.result = applyWound(card); // §33.1
    // §20.9 狂暴兵チェック（ソ連軍ピン状態兵がPANIC_KIAのとき）
    let actualResult = r.result;
    if (r.result === 'PANIC_KIA' && def && window.CC_ACTION) {
      const enemySide = tgt.side === 'ai' ? 'player' : 'ai';
      const enemyGroups = state.groups[enemySide] || [];
      const atDist5 = enemyGroups.some(eg => R.relativeRange(tgtGroup.distance, eg.distance) === 5);
      if (window.CC_ACTION.checkBerserkEligibility(card, def, rpc0r, tgtFacKey, atDist5 ? 5 : 0)) {
        card.berserk = true;
        actualResult = 'BERSERK';
        // §24.7 地雷原にいる兵が狂戦士になったら排除される
        if (R.hasTerrainType(tgtGroup, 'MINEFIELD')) { card.berserk = false; actualResult = 'KIA'; }
      }
    }
    // §20.9 既に狂暴兵が再パニック → KIA
    if (r.result === 'PANIC_KIA' && card.berserk && actualResult !== 'BERSERK') {
      actualResult = 'PANIC_KIA';
    }
    if (actualResult === 'KIA' || actualResult === 'PANIC_KIA') R.killSoldier(card);
    else if (actualResult === 'PANIC_ROUT') R.routSoldier(card);
    else if (actualResult === 'PIN') R.pinSoldier(card);
    // §20.53 ピン/KIA/潰走 → 侵入状態解除
    if (actualResult !== 'NONE' && actualResult !== 'BERSERK' && actualResult !== 'WOUND' && card.infiltrating && window.CC_ACTION) {
      window.CC_ACTION.clearSoldierInfiltration(card);
    }
    if ((actualResult === 'KIA' || actualResult === 'PANIC_KIA' || actualResult === 'PANIC_ROUT') && def && def.leader && def.leader === '分隊長') {
      applySLDamagePenalty(tgt.side);
    }
    const morale = def ? (wasPinned ? parseInt(def.panic,10)||0 : parseInt(def.morale,10)||0 + commissarMod) : 0;
    const kia = def ? (wasPinned ? parseInt(def.kiaBack,10)||0 : parseInt(def.kiaFront,10)||0) : 0;
    const tgtFac = tgt.side === 'player' ? state.player : state.ai;
    const tgtFlag = (tgtFac && tgtFac.flag) ? tgtFac.flag + ' ' : '';
    results.push({ i, name: tgtFlag + (def ? def.name : card.id), rnc, rncColor: isRed ? '赤' : '黒', result: actualResult, finalFP, sum: finalFP + rnc, morale, kia, wasPinned });
    showJudgeCard(judge);
    malfuncMod += checkMalfunction(judge, srcGroup, srcFacKey, distance, baseFP + malfuncMod);
    checkBreezeRemoveSmoke(judge); pushTerrainToDiscard(judge);
  }

  // 使用した射撃カードを手札から除去（カード参照は保持）
  const usedFireCards = [];
  const indices = [...state.selectedHand].sort((a,b) => b-a);
  indices.forEach(i => {
    const hc = state.playerHand[i];
    if (hc) usedFireCards.unshift(hc);
    state.playerHand.splice(i, 1);
    if (hc) pushTerrainToDiscard(hc);
  });

  // 修正項目の内訳を取得（カードごとに表示。火炎放射器射撃時は自然地形を除外）
  const atkBreakdown = R.getTerrainModBreakdown ? R.getTerrainModBreakdown(_effSrcTerrain, true, _atkOpts) : [];
  const defBreakdown = R.getTerrainModBreakdown ? R.getTerrainModBreakdown(_effDefTerrain, false, _defOptsP) : [];

  // 結果をオーバーレイ表示（修正項目を全て列挙）
  const mods = [];
  if (isFlankFireNow) mods.push('側面射撃(兵士火力×2)');
  atkBreakdown.forEach(x => {
    const label = x.type === 'MOVEMENT' ? '攻撃側移動カード' : `攻撃側 ${x.type}`;
    mods.push(`${label} ${x.mod>=0?'+':''}${x.mod}`);
  });
  defBreakdown.forEach(x => {
    const label = x.type === 'MOVEMENT' ? '防御側移動カード' : `防御側 ${x.type}`;
    mods.push(`${label} ${x.mod>=0?'+':''}${x.mod}`);
  });
  if (concealMod) mods.push(`隠蔽${concealMod>=0?'+':''}${concealMod}`);
  if (malfuncMod) mods.push(`故障${malfuncMod>=0?'+':''}${malfuncMod}`);
  if (japanRuleMod) mods.push(`日本ルール ${japanRuleMod>=0?'+':''}${japanRuleMod}`);
  const title = `射撃 ${srcGroup.name}→${tgtGroup.name} 距離${distance} 基礎射撃力${strength}<br/>修正項目:<br/>${mods.length ? mods.join('<br/>') : 'なし'}`;
  showFireResultOverlay(title, results, usedFireCards).then(() => {
    cleanupEliminatedGroups();
    renderField('player'); renderField('ai');
    renderHands();
  });
  // §20.53 射撃を行ったグループの侵入兵は侵入状態解除
  if (window.CC_ACTION) window.CC_ACTION.clearInfiltration(srcGroup, 'fire');
  if (window.DISCARD_RULES) window.DISCARD_RULES.markActed();
  // §6.6/§4.2 射撃はグループの1アクション（1ターンに1回）
  if (!state.actedGroups) state.actedGroups = new Set();
  state.actedGroups.add(src.idx);
  markFiredAt(srcGroup, tgtGroup); // §38.3 観測の修正用
  // ターン累積 FP を加算 (このグループの今ターン射撃合計に追加)
  srcGroup.firedFPThisTurn = (srcGroup.firedFPThisTurn || 0) + needed;
}

/**
 * 迫撃砲射撃の実行
 * - 射撃カード1枚使用（数字無視）
 * - RNCチェック1回 → 数字が命中上限以下なら命中（色は無関係。ただし片方移動なら赤外れ）
 * - 隠蔽は1枚で命中ランク-1、補足中の敵には+1、壁から-1、味方煙幕越しは-1
 * - 命中したら兵士ごとに判定カードを引いてダメージ判定
 * - 砲撃で目標グループに「補足」マークを付与
 */
