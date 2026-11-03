// ドンキーコマンド 日本語と英語の文章
var DC_TEXT = {
ja: {
  title: 'ドンキーコマンド', sub: '秘密基地に単身で潜入し、任務を果たしてエレベーターへ帰還せよ',
  backTop: 'トップページへ', rules: 'ルール', langOther: 'English', close: '閉じる',
  h0: '難易度', diff_easy: '優しい', diff_normal: '普通', diff_hard: 'ハード', diff_veryhard: 'ベリーハード',
  diffd_easy: '能力と持てる量が1.5倍', diffd_normal: '能力と持てる量が1.2倍',
  diffd_hard: '元のルールどおり', diffd_veryhard: '能力と持てる量が0.8倍',
  h1: '1. 能力を決める', roll: '能力を振る', reroll: '振り直す',
  h2: '2. 装備を選ぶ', auto: 'おまかせ装備', autoNote: '能力とスキルに合わせて選びます。そのあと直せます', start: '潜入開始', again: 'もう一度',
  ab_end: '耐久力', ab_str: '体力', ab_luck: '運', ab_know: '知識', ab_reac: '反応', ab_acc: '正確性',
  abd_end: '負傷がこの数に達すると気絶して捕虜になる', abd_str: '持てる装備の重さ', abd_luck: 'アクシデント、逃走、手榴弾に効く',
  abd_know: '爆破と奪取の成功率', abd_reac: '戦闘の運動ポイント', abd_acc: '射撃の命中',
  bonusSum: '反応と正確性のダイスの合計: {n}（20以上でボーナス能力）',
  noBonus: 'ボーナス能力なし', bonusGot: 'ボーナス能力: {s}',
  eqInfo: '重さ {w} / {max}　ベルト {b} / {bm}　銃 {g} / 3（手1＋肩2）',
  belt: 'ベルト', ruck: '背のう', gun: '銃', lMain: '手に持つ銃:', none: 'なし',
  errWeight: '重すぎます', errBelt: 'ベルトは{n}個までです', errGuns: '銃は3丁までです',
  hMove: '移動（1ターンに必ず1マス）', north: '北 ↑', south: '南 ↓', east: '東 →', west: '← 西',
  hPhase: '今やること', hMsgs: 'このターンの出来事', hStat: 'コマンドの状態', hEq: '装備',
  turn: 'ターン {t}　VP {v}　倒した敵 {k}',
  legend: '★自分　太線=壁　茶=ドア　点線=通路　赤い人型と数字=敵の人数　矢印キーでも移動できます',
  phaseMove: '移動先を選んでください。ドアを通るとアクシデントのチェックがあります。',
  phaseAdjust: '調整フェーズです。部屋の任務や装備の変更ができます。終わったら移動してください。',
  inRoom: '現在地: {r}（{d}）', inHall: '現在地: 通路',
  wounds: '負傷', st_vp: 'VP',
  btnMission: '任務を実行: {m}', btnMed: '治療を受ける（2d6回復）', btnArmory: '武器庫から取る', btnEquip: '装備を変更する', btnExit: 'ここからゲームを終わる（帰還）',
  mi_blast: '爆破（爆薬1個）', mi_steal: '奪取（文書回収キット）', noEP: '爆薬がありません', noKit: '文書回収キットがありません',
  r_EH: 'エレベーターホール', r_CP: '司令室', r_RC: '資料室', r_GP: '将官用個室', r_AS: '武器庫', r_TP: '物置き', r_PP: '兵舎', r_LR: 'レーダー無線室', r_ER: '発電室', r_LS: '研究室', r_CC: '医療センター',
  rd_EH: '出口。ここでゲームを終了できる', rd_CP: '爆破。特別ボーナスVP10', rd_RC: '奪取。特別ボーナスVP6', rd_GP: '奪取。失敗すると4マス南へ飛ばされる', rd_AS: '好きな武器が手に入る。戦闘で手榴弾は使えない',
  rd_TP: '何もない', rd_PP: '敵がいれば必ず10人', rd_LR: '爆破。特別ボーナスVP6', rd_ER: '爆破', rd_LS: '爆破。特別ボーナスでビッグKガンとVP20', rd_CC: '2d6回復できる（1回）',
  it_SMG: 'サブマシンガン', it_AR: 'アサルトライフル', it_P: 'ピストル', it_ATR: '対戦車ライフル', it_BIGK: 'ビッグKガン',
  it_G: '手榴弾', it_N: 'ナイフ', it_LSMG: 'SMG弾薬', it_LAR: 'AR弾薬', it_LP: 'ピストル弾薬', it_LATR: 'ATR弾薬', it_EP: '爆薬', it_K: '文書回収キット', it_U: 'カサ', it_B: '聖書',
  itd_U: '何の役にも立たない', itd_B: '何の役にも立たない',
  empty: '弾切れ', onHand: '手', onShoulder: '肩', onBelt: 'ベルト', onRuck: '背のう', dropped: '落とした',
  sk_knifeThrow: 'ナイフ投げ', sk_karate: '空手', sk_grenade: '手榴弾', sk_smg: 'SMG', sk_pistol: 'ピストル', sk_ar: 'アサルトライフル', sk_reload: 'マガジン交換', sk_flee: '逃げる', sk_suggest: '暗示能力',
  // 出来事
  m_start: 'エレベーターホールから潜入開始。',
  m_moved: '{dir}へ移動。', m_wall: 'そこは壁です。', m_door: 'ドアを通過。',
  m_acc0: 'アクシデント判定 1d6={d}（運{l}未満）: 何も起きない。',
  m_acc: 'アクシデント判定 1d6={d}、2d6={n}: {t}',
  a_laser: 'レーザー兵器作動！ {n} の負傷。', a_trip: 'つまずいた。次の戦闘の最初のラウンドは運動ポイントが運の値になる。', a_tv: 'テレビモニターに映った！ この部屋には必ず敵がいる。', a_sneeze: 'クシャミで主武器を落とした！', a_hic: 'シャックリ。影響なし。',
  m_room: 'ここは {r} だ。', m_enemy: '{x} に敵 {n} 人を発見！', cell_here: 'このマス', cell_n: '北', cell_s: '南', cell_e: '東', cell_w: '西',
  m_noEnemy: '敵はいない。', m_heal: '部屋で休んで負傷が1回復した。', m_healed: '{n} 回復した。',
  m_mOk: '任務成功！ 1d6={d}（知識{k}以下）でVP{d}を獲得。', m_mNg: '任務失敗。1d6={d}（知識{k}）。',
  m_sb: '特別ボーナス！ VP{v} を追加。', m_bigk: 'ビッグKガンを手に入れた！ VP20 を追加。',
  m_gp: '自動防御システム作動！ 4マス南へ飛ばされた。',
  m_lvChk: '敵10人ごとの判定 1d6={d}。', m_lvUp: '{a} が {n} に上がった！', m_newSk: '新しいボーナス能力: {s}',
  m_flee: '逃走成功！ 元のマスへ戻った。',
  // 戦闘
  cb_men: '{n} 人', cb_title: '戦闘', cb_round: 'ラウンド {r}　敵 {n} 人', apLab: '運動ポイント',
  cb_st: '負傷 {w}/{e}　{p}', prone: '伏せ', standing: '立ち',
  cb_pick: '目標のマスをクリックしてください', endRound: 'ラウンド終了（敵の反撃へ）', cancel: 'やめる',
  ac_auto: '連続射撃', ac_single: '単発射撃', ac_pistol: 'ピストル射撃', ac_grenade: '手榴弾', ac_knife: 'ナイフ攻撃', ac_throw: 'ナイフ投げ', ac_melee: '白兵戦', ac_atr: 'ATR射撃', ac_karate: '空手', ac_reload: 'マガジン交換（弾を込める）', ac_swap: '武器交換（肩の銃に持ち替え）', ac_prone: '伏せる', ac_stand: '立つ', ac_surr: '降伏勧告', ac_flee: '逃げる', ac_bigk: 'ビッグKガン',
  all: '全部', c_ap: '運動ポイント {r}（2d6={d}＋反応{e}）', c_ap_trip: '運動ポイント {r}（つまずき: 運の値）',
  c_shot: '{w} 2d6={d}＋正確{a}={t}（必要{n}）: {res}', c_hit: '命中', c_miss: '外れ',
  c_empty: '{w} は弾切れになった（1d6={d}）。', c_nade: '手榴弾 (2d6={d}＋運{l}＋正確{a})÷4 = {n} 人を倒した。',
  c_knife: 'ナイフ 1d6={d}＋正確{a}={t}（必要7）: {res}', c_kdrop: 'ナイフを落とした（1d6={d}）。',
  c_throw: 'ナイフ投げ 1d6={d}（4以下）: {res}', c_melee: '白兵戦 1d6={d}＋体力{s}={t}（必要16）: {res}',
  c_kar: '空手 1d6={d}（4以下）: {res}', c_reload: '{w} にマガジンを交換した。', c_swap: '{w} を手に持った。', c_prone: '伏せた。', c_stand: '立ち上がった。',
  c_surr: '降伏勧告 1d6={d}（4以下）: {res}', c_surrOk: '敵は全員降伏した！', c_surrNg: '敵は応じない。',
  c_flee: '逃走 2d6={d}＋運{l}={t}（必要12）: {res}', c_ok: '成功', c_ng: '失敗',
  c_big: 'ビッグKガン 1d6={d}（5以下）: {res}',
  c_cnt: '敵の反撃: {a} 人が撃ち、{p} 人はパニック。負傷 {n}。', c_win: '敵を全滅させた！', c_nothing: '撃てる相手がいません。', c_ko: '気絶した……。',
  // 終了
  endTitle: 'ゲーム終了', endCap: '気絶して捕虜になった。奪った文書のVPは失われた。', endBack: 'エレベーターで無事に脱出した！',
  endScore: 'VP {v} / 倒した敵 {k} 人 / {t} ターン', rank: '評価: {r}',
  rk_0: '新兵', rk_1: '兵士', rk_2: '優秀な兵士', rk_3: '特殊部隊員', rk_4: '伝説のコマンド',
  // 装備変更
  dlgEquip: '装備の変更', dlgArmory: '武器庫（好きなものを取れます）', takeHand: '手に持つ', toShoulder: '肩へ', pickUp: '拾う', discard: '捨てる', take: '取る', toBelt: '▲ベルトへ', toRuck: '▼背のうへ',
  rulesTitle: 'ルール',
  rulesBody: `【目的】
秘密基地の中央のエレベーターホールから出発し、部屋で任務を果たして勝利ポイント(VP)を稼ぎ、エレベーターへ戻ってゲームを終えます。負傷が耐久力に達すると捕虜になります。

【ターンの流れ】
1. 移動: 隣のマスへ必ず1マス。壁は通れません。
2. ドアを通るとアクシデントの判定があります。1d6が運以上だと2d6で事故の内容を決めます。
3. 新しいマスの壁を決めます（1,2=壁 3,4=ドア 5,6=通路）。
4. 四方が壁かドアなら部屋です。2d6で何の部屋か決めます。
5. 視界に新しく入ったマスで敵を判定します（1d6が3以下で敵が1d6人）。
6. 敵がいれば戦闘です。
7. 調整: 部屋なら負傷が1回復します。任務や装備の変更もできます。

【視界】
自分のマスと、通路でつながった隣のマスだけです。壁やドアの向こうは見えません。

【戦闘】
毎ラウンド、2d6＋反応が運動ポイントです。余った分は持ち越せません。
自分が先に動き、生き残った敵が反撃します。
1d6が1〜4の敵だけが撃ちます。敵1人につき1d6で負傷を決めます（0〜7の目で 0,1,1,1,2,2,3,4）。伏せていると−1、同じマスの敵は＋1です。
射撃は 2d6＋正確性 が命中数値以上で命中です。撃った後に1d6が弾薬数値以下なら弾切れです。
全部(7〜)と書かれた行動は、運動ポイントが7以上あるラウンドに、それだけしかできません。
伏せるとPの付いた行動しかできません。

【負傷】
耐久力の半分を超えると、超えた3につき反応と正確性が−1、超えた1につき体力が−1です。

【任務】
爆破は爆薬1個、奪取は文書回収キットが必要です。1d6が知識以下なら成功で、その目がVPです。さらに1d6で1なら特別ボーナスです。

【能力アップ】
敵を10人倒すごとに1d6で2以下なら、能力の1つが上がります。`,
},
en: {
  title: 'DONKEY COMMAND', sub: 'Infiltrate the secret base alone, complete your missions, and get back to the elevator',
  backTop: 'Top page', rules: 'Rules', langOther: '日本語', close: 'Close',
  h0: 'Difficulty', diff_easy: 'Easy', diff_normal: 'Normal', diff_hard: 'Hard', diff_veryhard: 'Very Hard',
  diffd_easy: 'Abilities and carrying x1.5', diffd_normal: 'Abilities and carrying x1.2',
  diffd_hard: 'The original rules', diffd_veryhard: 'Abilities and carrying x0.8',
  h1: '1. Roll your abilities', roll: 'Roll abilities', reroll: 'Roll again',
  h2: '2. Choose equipment', auto: 'Auto equip', autoNote: 'Chosen from your abilities and skills. You can adjust it afterward', start: 'Begin infiltration', again: 'Play again',
  ab_end: 'Endurance', ab_str: 'Strength', ab_luck: 'Luck', ab_know: 'Knowledge', ab_reac: 'Reaction', ab_acc: 'Accuracy',
  abd_end: 'Wounds reaching this knock you out and you are captured', abd_str: 'Weight you can carry', abd_luck: 'Helps with accidents, escape and grenades',
  abd_know: 'Chance of demolition and theft missions', abd_reac: 'Action points in combat', abd_acc: 'Hitting with weapons',
  bonusSum: 'Reaction + Accuracy dice total: {n} (20 or more grants a bonus skill)',
  noBonus: 'No bonus skill', bonusGot: 'Bonus skills: {s}',
  eqInfo: 'Weight {w} / {max}   Belt {b} / {bm}   Guns {g} / 3 (1 in hand + 2 on shoulder)',
  belt: 'Belt', ruck: 'Pack', gun: 'Gun', lMain: 'Gun in hand:', none: 'None',
  errWeight: 'Too heavy', errBelt: 'The belt holds {n} items', errGuns: 'You can carry 3 guns',
  hMove: 'Move (exactly 1 square each turn)', north: 'N ↑', south: 'S ↓', east: 'E →', west: '← W',
  hPhase: 'What to do now', hMsgs: 'This turn', hStat: 'Commando', hEq: 'Equipment',
  turn: 'Turn {t}   VP {v}   Enemies down {k}',
  legend: '★ you   thick = wall   brown = door   dotted = corridor   red figure + number = enemies   Arrow keys also move',
  phaseMove: 'Choose where to move. Passing a door triggers an accident check.',
  phaseAdjust: 'Adjustment phase. Do room missions or change equipment, then move.',
  inRoom: 'Location: {r} ({d})', inHall: 'Location: corridor',
  wounds: 'Wounds', st_vp: 'VP',
  btnMission: 'Do mission: {m}', btnMed: 'Get treatment (heal 2d6)', btnArmory: 'Take from armory', btnEquip: 'Change equipment', btnExit: 'End the game here (escape)',
  mi_blast: 'Demolition (1 explosive)', mi_steal: 'Theft (document kit)', noEP: 'No explosives', noKit: 'No document kit',
  r_EH: 'Elevator Hall', r_CP: 'Command Post', r_RC: 'Records Room', r_GP: "General's Quarters", r_AS: 'Armory', r_TP: 'Storeroom', r_PP: 'Barracks', r_LR: 'Radar Room', r_ER: 'Power Room', r_LS: 'Laboratory', r_CC: 'Medical Center',
  rd_EH: 'Exit. You may end the game here', rd_CP: 'Demolition. Special bonus VP 10', rd_RC: 'Theft. Special bonus VP 6', rd_GP: 'Theft. On failure you are sent 4 squares south', rd_AS: 'Take any weapons. No grenades in combat here',
  rd_TP: 'Nothing here', rd_PP: 'If enemies are here, there are always 10', rd_LR: 'Demolition. Special bonus VP 6', rd_ER: 'Demolition', rd_LS: 'Demolition. Special bonus Big K Gun and VP 20', rd_CC: 'Heal 2d6 (once)',
  it_SMG: 'Submachine gun', it_AR: 'Assault rifle', it_P: 'Pistol', it_ATR: 'Anti-tank rifle', it_BIGK: 'Big K Gun',
  it_G: 'Grenade', it_N: 'Knife', it_LSMG: 'SMG ammo', it_LAR: 'AR ammo', it_LP: 'Pistol ammo', it_LATR: 'ATR ammo', it_EP: 'Explosive', it_K: 'Document kit', it_U: 'Umbrella', it_B: 'Bible',
  itd_U: 'Completely useless', itd_B: 'Completely useless',
  empty: 'empty', onHand: 'Hand', onShoulder: 'Shoulder', onBelt: 'Belt', onRuck: 'Pack', dropped: 'Dropped',
  sk_knifeThrow: 'Knife throw', sk_karate: 'Karate', sk_grenade: 'Grenade', sk_smg: 'SMG', sk_pistol: 'Pistol', sk_ar: 'Assault rifle', sk_reload: 'Fast reload', sk_flee: 'Escape', sk_suggest: 'Suggestion',
  m_start: 'Infiltration begins at the elevator hall.',
  m_moved: 'Moved {dir}.', m_wall: 'That is a wall.', m_door: 'Through a door.',
  m_acc0: 'Accident check 1d6={d} (below Luck {l}): nothing happens.',
  m_acc: 'Accident check 1d6={d}, 2d6={n}: {t}',
  a_laser: 'Laser trap! {n} wounds.', a_trip: 'You trip. In the first round of the next fight your action points equal your Luck.', a_tv: 'Caught on a TV monitor! Enemies are certainly here.', a_sneeze: 'A sneeze! You dropped your main weapon.', a_hic: 'Hiccups. No effect.',
  m_room: 'This is the {r}.', m_enemy: '{n} enemies spotted at {x}!', cell_here: 'this square', cell_n: 'north', cell_s: 'south', cell_e: 'east', cell_w: 'west',
  m_noEnemy: 'No enemies.', m_heal: 'You rest in the room and heal 1 wound.', m_healed: 'Healed {n}.',
  m_mOk: 'Mission success! 1d6={d} (Knowledge {k} or less): VP {d} earned.', m_mNg: 'Mission failed. 1d6={d} (Knowledge {k}).',
  m_sb: 'Special bonus! VP {v} more.', m_bigk: 'You got the Big K Gun! VP 20 more.',
  m_gp: 'Automatic defenses! You are sent 4 squares south.',
  m_lvChk: 'Check for each 10 enemies: 1d6={d}.', m_lvUp: '{a} rose to {n}!', m_newSk: 'New bonus skill: {s}',
  m_flee: 'Escaped! You returned to the previous square.',
  cb_men: '{n}', cb_title: 'COMBAT', cb_round: 'Round {r}   {n} enemies', apLab: 'Action points',
  cb_st: 'Wounds {w}/{e}   {p}', prone: 'Prone', standing: 'Standing',
  cb_pick: 'Click the target square', endRound: 'End round (enemy return fire)', cancel: 'Cancel',
  ac_auto: 'Burst fire', ac_single: 'Single shot', ac_pistol: 'Pistol shot', ac_grenade: 'Grenade', ac_knife: 'Knife attack', ac_throw: 'Knife throw', ac_melee: 'Hand to hand', ac_atr: 'ATR shot', ac_karate: 'Karate', ac_reload: 'Reload (fill the magazine)', ac_swap: 'Swap weapon (from shoulder)', ac_prone: 'Go prone', ac_stand: 'Stand up', ac_surr: 'Demand surrender', ac_flee: 'Escape', ac_bigk: 'Big K Gun',
  all: 'all', c_ap: '{r} action points (2d6={d} + Reaction {e})', c_ap_trip: '{r} action points (tripped: Luck)',
  c_shot: '{w} 2d6={d} + Accuracy {a} = {t} (need {n}): {res}', c_hit: 'hit', c_miss: 'miss',
  c_empty: '{w} ran empty (1d6={d}).', c_nade: 'Grenade (2d6={d} + Luck {l} + Accuracy {a}) / 4 = {n} enemies down.',
  c_knife: 'Knife 1d6={d} + Accuracy {a} = {t} (need 7): {res}', c_kdrop: 'You dropped the knife (1d6={d}).',
  c_throw: 'Knife throw 1d6={d} (4 or less): {res}', c_melee: 'Hand to hand 1d6={d} + Strength {s} = {t} (need 16): {res}',
  c_kar: 'Karate 1d6={d} (4 or less): {res}', c_reload: 'Reloaded the {w}.', c_swap: 'Now holding the {w}.', c_prone: 'You went prone.', c_stand: 'You stood up.',
  c_surr: 'Surrender 1d6={d} (4 or less): {res}', c_surrOk: 'All enemies surrendered!', c_surrNg: 'They refuse.',
  c_flee: 'Escape 2d6={d} + Luck {l} = {t} (need 12): {res}', c_ok: 'success', c_ng: 'failure',
  c_big: 'Big K Gun 1d6={d} (5 or less): {res}',
  c_cnt: 'Return fire: {a} shoot, {p} panic. {n} wounds.', c_win: 'All enemies are down!', c_nothing: 'No target available.', c_ko: 'You pass out...',
  endTitle: 'GAME OVER', endCap: 'You were knocked out and captured. VP for stolen documents is lost.', endBack: 'You escaped by elevator!',
  endScore: 'VP {v} / {k} enemies down / {t} turns', rank: 'Rank: {r}',
  rk_0: 'Recruit', rk_1: 'Soldier', rk_2: 'Veteran', rk_3: 'Special Forces', rk_4: 'Legendary Commando',
  dlgEquip: 'Change equipment', dlgArmory: 'Armory (take whatever you like)', takeHand: 'Hold', toShoulder: 'To shoulder', pickUp: 'Pick up', discard: 'Discard', take: 'Take', toBelt: '▲ to belt', toRuck: '▼ to pack',
  rulesTitle: 'Rules',
  rulesBody: `GOAL
Start at the elevator hall in the center of a secret base. Complete missions in rooms to earn victory points (VP), then return to an elevator to finish. If your wounds reach your Endurance you are captured.

TURN ORDER
1. Move exactly 1 square. Walls block you.
2. Passing a door triggers an accident check. If 1d6 is Luck or more, 2d6 decides the accident.
3. Roll the new square's walls (1,2 = wall, 3,4 = door, 5,6 = corridor).
4. If all four sides are walls or doors, it is a room. 2d6 decides which.
5. Check squares newly in view for enemies (1d6 of 3 or less means 1d6 enemies).
6. If there are enemies, you fight.
7. Adjust: rooms heal 1 wound. You may also do missions and change equipment.

VISION
You see your square and neighbors joined by a corridor. You cannot see past walls or doors.

COMBAT
Each round, 2d6 + Reaction gives your action points. Unused points are lost.
You act first, then survivors fire back.
Enemies rolling 1-4 on 1d6 shoot. Each rolls 1d6 for wounds (0-7 gives 0,1,1,1,2,2,3,4). Prone is -1. An enemy in your square is +1.
A shot hits when 2d6 + Accuracy reaches the weapon's number. After firing, 1d6 at or below its ammo number means it ran empty.
Actions marked all (7+) need 7 or more points and are the only action that round.
When prone, only actions marked P are possible.

WOUNDS
Past half your Endurance, each 3 extra wounds cost 1 Reaction and Accuracy, and each extra wound costs 1 Strength.

MISSIONS
Demolition needs an explosive; theft needs a document kit. 1d6 at or below Knowledge succeeds and that roll is your VP. Another 1d6 of 1 gives a special bonus.

GROWTH
For every 10 enemies down, 1d6 of 2 or less raises one ability.`,
},
};
