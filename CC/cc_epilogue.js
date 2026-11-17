'use strict';

// 15.4 コルベットのその後
function* epilogueReports(roll) {
  const ship = SH();
  const total = ['gun4', 'aa', 'dc', 'asdic', 'watch', 'engine', 'radar', 'hfdf']
    .filter(hasSection).reduce((n, k) => n + ship.skills[k], 0);
  const campaignVP = (S.camp.yearVP[1] || 0) + (S.camp.yearVP[2] || 0);
  let bonus = 0;
  let kills = 0;
  let ending;
  const product = () => {
    const a = roll(), b = roll();
    return { value: a * b, text: `${a} × ${b} = ${a * b}` };
  };
  const yearTitle = y => L(`${y}年の報告`, `${y} report`);
  const nextYear = y => L(`${y}年の報告へ`, `Read the ${y} report`);
  const lastPage = L('艦の結末を読む', 'Read the ship’s fate');
  const sunk = L('戦没', 'Lost in action');
  const lostAt = values => L(`戦没する出目 ${values.join('・')}`, `Loss on ${values.join(' or ')}`);
  const torpedoSkill = L(`爆雷スキル ${ship.skills.dc} 以下で撃沈`, `Sink on a roll at or below depth-charge skill ${ship.skills.dc}`);
  const torpedo = L('Uボート1隻撃沈', 'One U-boat sunk');
  const noSuccess = L('戦果なし', 'No successes recorded');
  yield {
    title: L('コルベットのその後', 'What became of the corvette'),
    details: [L(`総合スキル ${total}　爆雷スキル ${ship.skills.dc}`, `Overall skill ${total} · Depth-charge skill ${ship.skills.dc}`)],
    button: nextYear(1943)
  };

  const tours = [
    [1943, ['地中海', '地中海', '近海', '近海', '北極海', 'オーバーホール']],
    [1944, ['近海', 'イギリス海峡', 'イギリス海峡', 'イギリス海峡', '北極海', 'オーバーホール']]
  ];
  for (const [year, areas] of tours) {
    const die = roll();
    const area = areas[die - 1];
    const details = [`1d6 = ${die} → ${TK(area)}`];
    const results = [];
    if (area === 'オーバーホール') {
      results.push(L('オーバーホール。戦闘判定なし。', 'In overhaul. No combat roll.'));
    } else {
      const d = product();
      const operation = area === '地中海' ? L('ハスキー作戦', 'Operation Husky') :
        area === 'イギリス海峡' ? L('ネプチューン作戦', 'Operation Neptune') : '';
      const losses = area === '北極海' || area === 'イギリス海峡' ? [30, 36] : [36];
      const threshold = area === '近海' ? ship.skills.dc : Math.floor(total / 2);
      details.push(`1d36 = ${d.text}`, lostAt(losses));
      if (operation) details.push(L(`${operation}の功績は総合スキル ${total} 以下で +1 VP`, `Earn +1 VP for distinction in ${operation} at or below overall skill ${total}`));
      details.push(area === '近海' ? torpedoSkill : L(`総合スキルの半分（${threshold}）以下で撃沈`, `Sink on half the overall skill (${threshold}) or less`));
      if (losses.includes(d.value)) {
        ending = { year, result: sunk };
        results.push(sunk);
      } else {
        if (operation && d.value <= total) { bonus++; results.push(`${operation} +1 VP`); }
        if (d.value <= threshold) { kills++; results.push(torpedo); }
        if (!results.length) results.push(noSuccess);
      }
    }
    yield { title: yearTitle(year), details, results, button: ending ? lastPage : nextYear(year + 1) };
    if (ending) break;
  }

  let year = 1945, modifier = 0;
  while (!ending) {
    const die = roll();
    const result = die + modifier;
    const details = [modifier ? `1d6: ${die} + ${modifier} = ${result}` : `1d6 = ${die}`];
    if (result === 1) {
      yield {
        title: L('最後の護衛任務', 'The last escort voyage'),
        details,
        speaker: L('当直士官', 'Officer of the watch'),
        line: L('「艦長、船団が出港します。これが最後の護衛です。見張りは全員、持ち場に。最後の一隻が港に入るまで、私たちの航海は終わりません。」', '“Captain, the convoy is getting under way. This is our last escort. All lookouts to their stations. Our watch ends when the last ship is safely in harbour.”'),
        button: L('最後の護衛を判定する', 'Resolve the last escort')
      };
      const d = product();
      const lost = [25, 30, 36].includes(d.value);
      const kill = !lost && d.value <= ship.skills.dc;
      if (lost) ending = { year, result: sunk };
      if (kill) kills++;
      yield {
        title: L('最後の護衛任務の報告', 'Report from the last escort'),
        details: [`1d36 = ${d.text}`, torpedoSkill, lostAt([25, 30, 36]),
          ...(!lost ? [L('5年後の再判定に +1', '+1 on the roll in five years')] : [])],
        results: [lost ? sunk : kill ? torpedo : noSuccess],
        speaker: lost ? L('通信員', 'Wireless operator') : L('見張り員', 'Lookout'),
        line: lost
          ? L(`「こちら〈${ship.name}〉。応答が途切れる前に、どうか記録を。われわれは最後まで、船団を護衛していました。」`, `“This is ${ship.name}. Before we lose the signal, please put it in the log. We stayed with the convoy to the end.”`)
          : kill
            ? L('「艦長、Uボートの撃沈を確認。船団の最後の灯が港に入りました。これでようやく、見張りを降りられますね。」', '“Captain, the U-boat is confirmed sunk. The last convoy light has passed into the harbour. We can finally stand down the watch.”')
            : L('「艦長、最後の一隻が港に入りました。戦果欄は空白ですが、あの灯が消えるまで見張ったことだけは、日誌に書かせてください。」', '“Captain, the last ship is in. We have nothing to enter under victories. But let me put in the log that we kept watch until the last light was home.”'),
        button: lost ? lastPage : nextYear(year + 5)
      };
      modifier = 1;
    } else if (result < 4) {
      modifier = 2;
      const disposition = result === 2
        ? L('イギリス連邦または同盟国へ譲渡され、軍艦として就役。', 'Transferred to a Commonwealth or Allied navy.')
        : L('民間に払い下げ。', 'Sold into civilian service.');
      yield {
        title: yearTitle(year), details: [...details, L('5年後の再判定に +2', '+2 on the roll in five years')],
        results: [disposition], button: nextYear(year + 5)
      };
    } else {
      const vp = campaignVP + bonus;
      const d = product();
      const preserved = d.value <= vp;
      ending = { year, result: preserved ? L('記念館として保存', 'Preserved as a memorial') : L('解体', 'Broken up for scrap') };
      yield {
        title: yearTitle(year), details: [...details, L('解体の判定', 'Scrapping decision'), `1d36 = ${d.text}`,
          L(`合計 ${vp} VP 以下なら記念館として保存`, `Preserved as a memorial at or below the total of ${vp} VP`)],
        button: lastPage
      };
    }
    year += 5;
  }

  yield {
    title: L(`${ending.year}年　${ending.result}`, `${ending.year} · ${ending.result}`),
    details: [
      L(`キャンペーン ${campaignVP} VP ＋ その後の戦果 ${bonus} VP ＝ 合計 ${campaignVP + bonus} VP`, `Campaign ${campaignVP} VP + epilogue ${bonus} VP = ${campaignVP + bonus} VP total`),
      L(`15.4で撃沈したUボート ${kills}隻`, `U-boats sunk in the epilogue: ${kills}`)
    ],
    button: L('報告を閉じる', 'Close the report')
  };
}

function showEpilogueReport(report) {
  const dialog = $('epilogue-dialog');
  const title = $('epilogue-title');
  $('epilogue-ship').textContent = SH().name;
  title.textContent = report.title;
  const body = $('epilogue-report');
  body.replaceChildren();
  for (const [style, entries] of [['epilogue-details', report.details], ['epilogue-results', report.results]]) {
    if (!entries?.length) continue;
    const list = document.createElement('ul');
    list.className = style;
    for (const entry of entries) {
      const item = document.createElement('li');
      item.textContent = entry;
      list.append(item);
    }
    body.append(list);
  }
  if (report.line) {
    const quote = document.createElement('blockquote');
    const speaker = document.createElement('cite');
    speaker.textContent = report.speaker;
    const line = document.createElement('p');
    line.textContent = report.line;
    quote.append(speaker, line);
    body.append(quote);
  }
  const button = $('epilogue-next');
  button.textContent = report.button;
  if (!dialog.open) dialog.showModal();
  body.scrollTop = 0;
  title.focus();
  return new Promise(resolve => {
    button.onclick = () => { button.onclick = null; resolve(); };
  });
}

async function epilogue() {
  const progress = S.epilogue || (S.epilogue = { page: 0, rolls: [] });
  S.phase = 'epilogue';
  let index = 0;
  const reports = epilogueReports(() => {
    if (index === progress.rolls.length) progress.rolls.push(d6());
    return progress.rolls[index++];
  });
  let current = reports.next();
  for (let page = 0; page < progress.page && !current.done; page++) current = reports.next();
  while (!current.done) {
    saveLocal();
    await showEpilogueReport(current.value);
    progress.page++;
    current = reports.next();
  }
  $('epilogue-dialog').close();
  await finishCampaign();
}

document.getElementById('epilogue-dialog').addEventListener('cancel', event => event.preventDefault());
