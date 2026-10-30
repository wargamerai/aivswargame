// Up Front - 英語/日本語の切り替え（海の戦いの lang.js と同じ仕組み）
// ゲームの処理には手を入れず、画面に出た日本語を対訳表で英語に置き換える
//   - 言語: ?lang=en|ja → 保存した言語 → 日本語
//   - 英語のとき、文字の変化を見張って置き換える。アラート・確認・入力のダイアログも置き換える
//   - 日本語に戻すときは、元の文字に戻す（ゲームは続けたまま）

// 文全体が一致したときの訳（語句の置き換えより先に使う）
const LANG_EXACT = {
  // 陣営選択
  'シナリオ:': 'Scenario:',
  'A: パトロール（遭遇戦）': 'A: Patrol (meeting engagement)',
  'B: 市街戦': 'B: Street Fighting',
  'C: 要塞強襲（非対称）': 'C: Fortress Assault (asymmetric)',
  'D: 後衛戦（非対称）': 'D: Rear Guard (asymmetric)',
  '先攻:': 'First player:',
  'プレイヤー（攻撃側）': 'Player (attacker)',
  'AI（防御側）': 'AI (defender)',
  '時間帯:': 'Time of day:',
  '昼': 'Day',
  '夜': 'Night',
  'ドイツ': 'Germany',
  'ソ連': 'Soviet Union',
  'アメリカ': 'USA',
  '日本': 'Japan',
  'イギリス': 'Britain',
  '🇩🇪 ドイツ': '🇩🇪 Germany',
  '🇷🇺 ソ連': '🇷🇺 Soviet Union',
  '🇺🇸 アメリカ': '🇺🇸 USA',
  '🇯🇵 日本': '🇯🇵 Japan',
  '🇬🇧 イギリス': '🇬🇧 Britain',
  'キャンペーン編成': 'Campaign Roster',
  // キャンペーン編成
  'シナリオ開始': 'Start Scenario',
  'エクスポート': 'Export',
  'インポート': 'Import',
  'リセット': 'Reset',
  '戻る': 'Back',
  // 編成
  '編成': 'Setup',
  '配置先グループ': 'Target group',
  'を選択 → 未配置兵士をクリックで連続配置': ': select it, then click unassigned soldiers to place them one after another',
  'グループ内兵士をクリック→選択 → 別グループクリックで移動 ／ クルー設定: クルー兵器持ちを選択 →': 'Click a soldier in a group to select, then click another group to move / Crew: select a soldier with a crew weapon →',
  'クルー設定': 'Set Crew',
  'ボタン → 同じグループの別兵士をアシスタント指定': 'button → pick another soldier in the same group as assistant',
  'モラル順 ↓': 'By Morale ↓',
  '爆薬': 'Demo',
  'ゲーム開始': 'Start Game',
  '未配置の兵士 (': 'Unassigned soldiers (',
  '名)': ')',
  // メイン画面
  '敵': 'Enemy',
  '自軍': 'Player',
  '手札:': 'Hand:',
  '枚 / 補充': 'cards / Draw',
  'サイクル': 'Cycle',
  '山札': 'Deck',
  '捨て札': 'Discard',
  '除去': 'Removed',
  '判定': 'RNC',
  '判定 (有効化されたら押す)': 'Random Number Card (press when enabled)',
  '射撃': 'Fire',
  '迫撃砲': 'Mortar',
  '移動': 'Movement',
  '側面': 'Flank',
  '包囲': 'Encircle',
  '回復': 'Rally',
  '狙撃': 'Sniper',
  '地形配置': 'Terrain',
  '修理': 'Repair',
  '鉄条網除去': 'Remove Wire',
  '地雷原排除': 'Clear Mines',
  '侵入': 'Infiltrate',
  '白兵戦': 'Close Combat',
  '個人移送': 'Transfer',
  'クルー': 'Crew',
  '索敵': 'Scout',
  '照明弾': 'Flare',
  '塹壕': 'Entrench',
  '確定': 'Confirm',
  '終了': 'End',
  // ダイアログ
  '移動方向を選択': 'Choose direction of movement',
  '▲ 前進': '▲ Advance',
  '◀▶ 横移動': '◀▶ Sideways',
  '▼ 後退': '▼ Retreat',
  'キャンセル': 'Cancel',
  '受け入れ': 'Accept',
  '拒否（横移動）': 'Refuse (move sideways)',
  '隠蔽カードを使用しますか？': 'Play a Concealment card?',
  '使う': 'Play',
  '使わない': 'Don\'t play',
  '配置を終える': 'Finish placing',
  '全部表': 'All face up',
  '全部裏': 'All face down',
};

// 語句の訳（長い語句から順に置き換える）
const LANG_TERMS = {
  // ===== 第2段階: メッセージ・ログ・ダイアログ =====
  // 地雷原・鉄条網
  '地雷原脱出には横移動カード2枚必要です': 'Escaping a minefield requires 2 sideways Movement cards',
  '地雷原脱出 (横移動1枚): 全員攻撃 (Atk': 'Minefield escape (1 sideways card): attack on all (Atk',
  '地雷原攻撃:': 'Minefield attack:',
  'このグループに鉄条網がありません': 'This group has no Wire',
  'PIN状態の兵士がいると鉄条網を除去できません': 'Wire cannot be removed while a soldier is pinned',
  'このグループに地雷原がありません': 'This group has no Minefield',
  '地雷原排除を試みる兵士がいません（全員ピン/戦死）': 'No soldier can attempt mine clearing (all pinned / KIA)',
  '地雷原排除を試みる兵士を選択（番号）:': 'Choose the soldier to attempt mine clearing (number):',
  'の地雷原排除判定:': ' mine clearing check:',
  '→ 除去成功（黒 RNC ≧': '→ Cleared (black RNC ≥',
  '）。地雷原はゲームから除外。': '). The Minefield is removed from the game.',
  '→ 排除失敗（赤 RNC >': '→ Clearing failed (red RNC >',
  '→ 排除失敗（条件不一致）。地雷原はそのまま。': '→ Clearing failed (conditions not met). The Minefield stays.',
  '→ 排除失敗（条件不一致）': '→ Clearing failed (conditions not met)',
  'AI 地雷原排除:': 'AI mine clearing:',
  'AI: 横移動（地雷原脱出）': 'AI: sideways (minefield escape)',
  'に攻撃 →': ' attacked →',
  'で攻撃 →': ' attack →',
  'に Atk': ' Atk',
  // 武器・故障
  '火炎放射器故障:': 'Flamethrower malfunction:',
  'アシスタント被弾:': 'Assistant hit:',
  '— 火力一時-1 (': '— Firepower temporarily -1 (',
  '武器故障:': 'Weapon malfunction:',
  '— 射撃途中の火力÷2切り上げ (': '— remaining firepower halved, rounded up (',
  '火炎放射器を使い 1/2 火力で撃ちますか？': 'Fire the flamethrower at 1/2 firepower?',
  '火炎放射器を廃棄': 'Discard flamethrower',
  'の火炎放射器を廃棄しますか？(以後使用不可、kia ペナルティ解除)': '\'s flamethrower: discard it? (cannot be used again; the KIA penalty is lifted)',
  '移動中は修理できません': 'Cannot repair while moving',
  '湿地内では修理できません': 'Cannot repair in a Marsh',
  '河川内では修理できません': 'Cannot repair in a Stream',
  '修理可能な故障武器がありません': 'No malfunctioned weapon can be repaired',
  'この武器の修理データがありません': 'No repair data for this weapon',
  '武器破壊:': 'Weapon eliminated:',
  '修理成功:': 'Repaired:',
  '修理失敗:': 'Repair failed:',
  '件の武器を修理しました': ' weapon(s) repaired',
  // 風・煙幕
  '風: 煙幕': 'Wind: Smoke',
  '枚除去': ' card(s) removed',
  // シナリオの終了
  'シナリオA 勝利！ —': 'Scenario A victory! —',
  'シナリオB 終了：引き分け (VP': 'Scenario B over: draw (VP',
  'シナリオB 終了：': 'Scenario B over: ',
  'シナリオC 終了：': 'Scenario C over: ',
  'シナリオD 終了：': 'Scenario D over: ',
  'の勝利！ (防御側がトーチカを守り切った)': ' wins! (the defender held the Pillbox)',
  'の勝利！ (防御側が持ちこたえた)': ' wins! (the defender held out)',
  'の勝利！ (敵グループ消滅 & 損害優位': ' wins! (enemy groups eliminated & casualty advantage',
  'の勝利！ (トーチカ守備隊全滅)': ' wins! (Pillbox garrison eliminated)',
  'の勝利！ (トーチカ放棄)': ' wins! (Pillbox abandoned)',
  'が距離5に5人到達)': ' reached range 5 with 5 men)',
  'の勝利！ (GROUP': ' wins! (GROUP',
  'の勝利！ (VP': ' wins! (VP',
  'の過半数が損害を受けました。': ': a majority has become casualties.',
  'の勝利です！': ' wins!',
  '地形デッキの制限サイクル（': 'The terrain deck reached its cycle limit (',
  '）に達しました。シナリオによるゲーム終了です。': '). The game ends per the scenario.',
  // 読み込み
  '地形カード読込:': 'Terrain cards loaded:',
  '兵士カード読込: US=': 'Soldier cards loaded: US=',
  '埋め込み兵士CSV:': 'Embedded soldier CSV:',
  '地形CSV読込失敗:': 'Failed to load terrain CSV:',
  'シナリオ未読込': 'Scenario not loaded',
  'ルールエンジン未読込': 'Rules engine not loaded',
  '地形デッキ未読込': 'Terrain deck not loaded',
  '地形デッキがありません': 'No terrain deck',
  '読み込み失敗:': 'Load failed:',
  '読み込みました': 'Loaded',
  // 編成
  '攻撃側・先攻': 'Attacker, moves first',
  '防御側・後攻': 'Defender, moves second',
  '編成 — シナリオ': 'Setup — Scenario',
  'クルー操作兵器: アシスタント要': 'Crew-served weapon: needs an assistant',
  'アシスタントクルー (自身の火力は使用不可)': 'Assistant crew (cannot use own firepower)',
  'アシスタントクルー (火力使用不可)': 'Assistant crew (no firepower)',
  'アシスタント設定済み': 'Assistant set',
  '爆薬保持': 'Carrying Demo charge',
  'グループ内のクルー兵器持ちを選択してください': 'Select a soldier with a crew weapon in the group',
  'グループ内の兵士を選択してください': 'Select a soldier in the group',
  'この兵士はクルー操作兵器を持っていません': 'This soldier has no crew-served weapon',
  '同じグループ内の兵士を選んでください': 'Choose a soldier in the same group',
  'この兵士は既に他のクルーのアシスタントです': 'This soldier is already another crew\'s assistant',
  'この兵士は既にクルー主です': 'This soldier is already a crew owner',
  '守備側のBグループは最大3名までです': 'The defender\'s group B can have at most 3 men',
  '守備側のBグループはトーチカ専用です': 'The defender\'s group B is for the Pillbox only',
  'トーチカはBグループにのみ配置できます': 'The Pillbox can only be placed with group B',
  '初期配置では1グループに地形1枚までです': 'At setup, at most 1 terrain card per group',
  '現在のクルーペア:': 'Current crew pairs:',
  '[OK] 全クリア　[キャンセル] クリアしない': '[OK] clear all  [Cancel] keep',
  '兵士一覧:': 'Soldiers:',
  'ペア入力: オーナー アシスタント の順に番号をスペース区切りで入力': 'Enter pairs: owner then assistant numbers, separated by spaces',
  '例: 3 17 5 18 → #3→#17, #5→#18': 'Example: 3 17 5 18 → #3→#17, #5→#18',
  '空欄でキャンセル': 'Leave blank to cancel',
  // キャンペーン
  'キャンペーン結果 —': 'Campaign result —',
  'キャンペーン:': 'Campaign:',
  'キャンペーン記録を読み込みました': 'Campaign record loaded',
  '全キャンペーン記録をリセットしますか?': 'Reset the whole campaign record?',
  '全戦歴をリセットします。よろしいですか?': 'Reset the whole service record. OK?',
  '名の補充兵を追加しました': ' replacement(s) added',
  '昇進テーブルがありません': 'No promotion table',
  '昇進対象者はいません': 'No one is eligible for promotion',
  '次のシナリオへ': 'Next scenario',
  '書き出し': 'Export',
  '読み込み': 'Import',
  '補充兵': 'Replacement',
  '戦目)': ')',
  '戦目': ' battle #',
  'KIA値': 'KIA value',
  '気力使用': 'Use willpower',
  '気力不足': 'Not enough willpower',
  '気力': 'Willpower',
  '上限到達または制約': 'At limit or restricted',
  '最高位': 'Highest rank',
  '転任候補なし': 'No transfer candidate',
  'SLピン状態': 'SL pinned',
  'モラルチェック失敗': 'Morale check failed',
  'モラル+1': 'Morale +1',
  'パニック+1': 'Panic +1',
  '適用不可': 'Not applicable',
  '昇進:': 'Promotion:',
  '昇進': 'Promotion',
  '生存': 'Survived',
  '勝+': 'Wins +',
  'ピン+': 'Pins +',
  '負傷+': 'Wounds +',
  '英雄+': 'Heroes +',
  '爆薬+': 'Demo +',
  '名前': 'Name',
  '階級': 'Rank',
  // 状態・目印
  '▶側面': '▶Flank',
  '⚠包囲': '⚠Encircled',
  '◎補足': '◎Spotted',
  '@距離': '@Range',
  'クルー主': 'Crew owner',
  'クルー副': 'Crew assistant',
  '侵入中': 'Infiltrating',
  '狂暴兵': 'Berserk',
  '狂暴': 'Berserk',
  '武器故障': 'Weapon malfunction',
  '武器破壊': 'Weapon eliminated',
  '裏向き地形カード（平地扱い）': 'Face-down terrain card (treated as Open Ground)',
  '塹壕（防御 -1）': 'Entrenchment (defense -1)',
  '塹壕 -1': 'Entrenchment -1',
  '— アクション/射撃 (FP合計': '— Action / Fire (FP total',
  '— 地形': '— Terrain',
  'KIA(パニック)': 'KIA (panic)',
  '無傷': 'Unhurt',
  '潰走': 'Routed',
  '負傷': 'Wounded',
  '戦死': 'KIA',
  '離脱': 'Out of action',
  // 武器
  'BAR自動小銃': 'BAR',
  'ボルトアクション小銃': 'Bolt-action rifle',
  'ボルトアクション': 'Bolt-action',
  '半自動小銃': 'Semi-automatic rifle',
  '自動小銃': 'Automatic rifle',
  '短機関銃': 'SMG',
  '中機関銃': 'MMG',
  '軽機関銃': 'LMG',
  '機関銃': 'Machine gun',
  'カービン銃': 'Carbine',
  'カービン': 'Carbine',
  '突撃銃': 'Assault rifle',
  '小銃': 'Rifle',
  'ライフル': 'Rifle',
  '無線機': 'Radio',
  '対戦車ライフル': 'Anti-tank rifle',
  'パンツァーシュレック': 'Panzerschreck',
  'パンツァーファウスト': 'Panzerfaust',
  'パンツァー': 'Panzer',
  'バズーカ': 'Bazooka',
  '60mm迫撃砲': '60mm mortar',
  '50mm迫撃砲': '50mm mortar',
  '擲弾筒': 'Knee mortar',
  '歩兵砲': 'Infantry gun',
  '火炎放射器': 'Flamethrower',
  '非武装': 'Unarmed',
  // 階級・役職
  '副分隊長': 'Assistant Squad Leader',
  '分隊長': 'Squad Leader',
  '政治委員': 'Commissar',
  '兵卒': 'Private',
  '上等兵': 'Private First Class',
  '伍長': 'Corporal',
  '軍曹': 'Sergeant',
  '曹長': 'Staff Sergeant',
  'コミッサール処刑:': 'Commissar execution:',
  // 行動の制限
  '全滅したグループは選択できません': 'An eliminated group cannot be selected',
  'このグループは今ターン既にアクション済みです': 'This group has already taken an action this turn',
  'PIN状態の兵士がいるグループは移動できません': 'A group with a pinned soldier cannot move',
  '移動カードを選択してください': 'Select Movement cards',
  '側面射撃は敵隣接グループに対してのみ可能です': 'Flank fire is only possible against an adjacent enemy group',
  'トーチカ持ちグループには側面射撃できません': 'A group in a Pillbox cannot be flanked',
  '側面射撃成立: GROUP': 'Flank established: GROUP',
  '側面射撃(兵士火力×2)': 'Flank fire (soldier firepower ×2)',
  '認知した敵にのみ照明弾を打てます': 'Flares can only be fired at spotted enemies',
  '相対距離1〜5 の敵に照明弾を打てます': 'Flares can be fired at enemies at relative range 1-5',
  'ピンでない分隊長がグループにいる必要があります': 'An unpinned Squad Leader must be in the group',
  'そのグループは既に照らされています': 'That group is already lit',
  '照明弾発射: GROUP': 'Flare fired: GROUP',
  'とその周辺を 2 ターン照らします': ' and its surroundings are lit for 2 turns',
  'ピン状態の兵士がいるグループでは塹壕を作れません': 'A group with a pinned soldier cannot entrench',
  '塹壕は平地・森・丘・ブッシュにのみ作成可能です': 'Entrenchment is only possible in Open Ground, Woods, Hill or Brush',
  '塹壕構築成功 (RNC=0)': 'Entrenched (RNC=0)',
  '塹壕構築失敗 (RNC=': 'Entrenching failed (RNC=',
  '涸れ谷からは「相対距離5」「迫撃砲」「丘の上」 にのみ索敵できます': 'From a Gully you can only scout "relative range 5", "mortar" or "on a Hill"',
  '索敵成功 (RNC': 'Scouting succeeded (RNC',
  '索敵失敗 (RNC': 'Scouting failed (RNC',
  ') — アクション消費なし': ') — no action used',
  ') — アクション消費': ') — action used',
  'トーチカ持ちグループは包囲できません': 'A group in a Pillbox cannot be encircled',
  '包囲は敵隣接グループに対してのみ可能です': 'Encirclement is only possible against an adjacent enemy group',
  '包囲を構成するもう1つの自軍グループがありません': 'There is no second friendly group to complete the encirclement',
  '包囲不成立: 相対距離': 'No encirclement: relative range',
  '（両方4以下必要）': ' (both must be 4 or less)',
  '包囲成立: GROUP': 'Encirclement: GROUP',
  'を包囲': ' encircled',
  'このシナリオではこのカードを地形として使用できません': 'This card cannot be used as terrain in this scenario',
  '移動中（最上が移動カード）のグループにのみ地形を配置できます': 'Terrain can only be placed on a moving group (top card is Movement)',
  '移動中のグループにのみ地形を配置できます': 'Terrain can only be placed on a moving group',
  '湿地に地形カードを置くには移動カード2枚が必要です': 'Placing terrain in a Marsh requires 2 Movement cards',
  '涸れ谷に地形カードを置くには移動カード2枚が必要です': 'Placing terrain in a Gully requires 2 Movement cards',
  '河川に地形カードを置くには渡河成功＋移動カード合計2枚が必要です': 'Placing terrain in a Stream requires a successful crossing + 2 Movement cards in total',
  '煙幕/鉄条網は地形の上にのみ置けます（移動中は不可）': 'Smoke / Wire can only be placed on terrain (not while moving)',
  'AI: 地形カードを拒否しました（横移動モードに変更）': 'AI: refused the terrain card (changed to sideways movement)',
  'このグループにPIN状態の兵士がいません': 'This group has no pinned soldier',
  'が回復しました': ' rallied',
  '回復(': 'Rally (',
  '攻撃側は狙撃カードを使用できません': 'The attacker cannot use Sniper cards',
  '狙撃 →': 'Sniper →',
  '夜間: 認知されていない敵には侵入できません': 'Night: cannot infiltrate an unspotted enemy',
  '夜間: 認知されていない敵には射撃できません（索敵してください）': 'Night: cannot fire at an unspotted enemy (scout first)',
  '夜間: 認知されていない敵には迫撃砲射撃できません': 'Night: cannot fire a mortar at an unspotted enemy',
  '移送できる兵士がいません': 'No soldier can be transferred',
  '爆薬を使用できる兵士がいません（爆薬保有・侵入したターンの兵士のみ）': 'No soldier can use a Demo charge (only soldiers carrying one who infiltrated this turn)',
  '侵入先のグループが特定できません': 'Cannot determine the group to infiltrate',
  // 地形カードの配置
  '地形カード「': 'Terrain card "',
  '」が配置されました': '" was placed',
  '拒否すると移動カードが横移動モードになり、距離が戻ります。': 'If you refuse, the Movement card becomes sideways movement and the range is restored.',
  '移動カードがないため拒否できません。': 'Cannot refuse: no Movement card.',
  '河川は拒否できません。': 'A Stream cannot be refused.',
  '煙幕は拒否できません。': 'Smoke cannot be refused.',
  '横移動中は拒否できません（縦移動のみ拒否可）。': 'Cannot refuse while moving sideways (only forward / back movement can refuse).',
  '相対距離5のため前進できません（§5.7）': 'Cannot advance: relative range is 5 (§5.7)',
  '渡河成功（渡河カード使用）': 'Crossed (Stream card used)',
  '渡河成功（RNC 黒）': 'Crossed (RNC black)',
  '渡河失敗（RNC 赤）— カードは捨て札': 'Crossing failed (RNC red) — card discarded',
  '地形配置フェーズ §3.6': 'Terrain placement phase §3.6',
  '／ 手番:': '/ Turn:',
  '／ 配置可能な地形カード:': '/ Terrain cards that can be placed:',
  // 射撃
  '涸れ谷にいるグループは攻撃できません（例外: 狙撃、迫撃砲、丘上、相対距離5）': 'A group in a Gully cannot attack (except Sniper, mortar, on a Hill, relative range 5)',
  '涸れ谷にいるグループは攻撃できません': 'A group in a Gully cannot attack',
  '「射撃」カードを選択してください': 'Select "Fire" cards',
  '射撃カードを1枚選択してください（数字は無視されます）': 'Select 1 Fire card (its number is ignored)',
  '射撃カードを選択してください': 'Select Fire cards',
  '火力不足: 必要': 'Not enough firepower: need',
  '/ 利用可能': '/ available',
  'ターン累積FP超過: 既使用': 'Turn FP total exceeded: used',
  '+ 今回': '+ now',
  '> 火力': '> firepower',
  '別のカードを選択してください': 'Select another card',
  '射撃力超過: 合計射撃力': 'Fire strength exceeded: total',
  '> 味方火力': '> friendly firepower',
  '選択カード数を減らしてください': 'Select fewer cards',
  '日本軍/イギリス軍は黒の英雄カードでないと使えません': 'Japan / Britain can only use black Hero cards',
  '攻撃側移動カード': 'Attacker Movement card',
  '防御側移動カード': 'Defender Movement card',
  '日本ルール': 'Japanese rule',
  '基礎射撃力': 'Base fire strength',
  '修正項目:': 'Modifiers:',
  'このグループには迫撃砲を持つ生存兵士がいません': 'No surviving soldier in this group has a mortar',
  'は迫撃砲の射程外（NA）です — 通常の射撃で撃ってください': ' is out of mortar range (NA) — use normal fire',
  '建物からは迫撃砲を撃てません': 'A mortar cannot fire from a Building',
  'トーチカからは迫撃砲を撃てません': 'A mortar cannot fire from a Pillbox',
  '河川内からは迫撃砲を撃てません': 'A mortar cannot fire from a Stream',
  '湿地内からは迫撃砲を撃てません': 'A mortar cannot fire from a Marsh',
  '味方側に煙幕があるため迫撃砲を撃てません（補足中の敵には可）': 'A mortar cannot fire because of friendly Smoke (allowed against a spotted enemy)',
  '迫撃砲: index.html 側の resolveMortarAction を使用してください': 'Mortar: use resolveMortarAction in index.html',
  '補足: +1': 'Spotted: +1',
  '壁: -1': 'Wall: -1',
  '煙幕越し: -1': 'Through Smoke: -1',
  '隠蔽: -': 'Concealment: -',
  '命中不能': 'Cannot hit',
  '（移動中: 赤は外れ）': ' (moving: red misses)',
  '基本命中ランク: 0-': 'Base hit range: 0-',
  '最終命中ランク:': 'Final hit range:',
  '(移動半減→': '(moving, halved →',
  '移動半減 -': 'Moving, halved -',
  '射撃 距離': 'Fire, range',
  '→ 最終火力': '→ final firepower',
  '→ 最終': '→ final',
  '→ 合計': '→ total',
  '射撃カード': 'Fire card',
  // グループの移動
  'を作成して移動': ' created and moved',
  '＋ 新グループ作成 (上限A〜Z)': '+ New group (A-Z max)',
  '＋ 新グループ': '+ New group',
  'を移動': ' moved',
  '※ 左クリック=裏/表, 右クリック=移動': '* Left click = flip, right click = move',
  '枚)  ※ クリックで裏/表': ' cards)  * click to flip',
  '※ クリックで裏/表': '* click to flip',
  '次のグループ →': 'Next group →',
  // AI
  'AI: cower 捨て札': 'AI: cower discard',
  'AI: 塹壕構築成功 → GROUP': 'AI: entrenched → GROUP',
  'AI: 塹壕構築失敗 (RNC=': 'AI: entrenching failed (RNC=',
  'AI: 照明弾 → GROUP': 'AI: Flare → GROUP',
  'AI: 索敵成功 → GROUP': 'AI: scouting succeeded → GROUP',
  'AI: 索敵失敗 → GROUP': 'AI: scouting failed → GROUP',
  'AI: 迫撃砲射撃 → GROUP': 'AI: mortar fire → GROUP',
  'AI: 側面射撃 → GROUP': 'AI: flank fire → GROUP',
  'AI: 包囲 → GROUP': 'AI: encircle → GROUP',
  'AI: 地形配置 → GROUP': 'AI: terrain → GROUP',
  'AI: 渡河成功（渡河カード）': 'AI: crossed (Stream card)',
  'AI: 渡河成功（RNC 黒）': 'AI: crossed (RNC black)',
  'AI: 渡河失敗（RNC 赤）': 'AI: crossing failed (RNC red)',
  'AI: 横移動（脱出）': 'AI: sideways (escape)',
  'AI: 煙幕配置 (自軍)': 'AI: Smoke placed (own side)',
  'AI: クルー設定 (GROUP': 'AI: crew set (GROUP',
  'AI: 鉄条網除去': 'AI: Wire removed',
  'AI: 修理成功': 'AI: repaired',
  'AI: 修理失敗': 'AI: repair failed',
  'AI: 地形配置': 'AI: terrain',
  'AI: 白兵戦': 'AI: Close Combat',
  'AI: 侵入': 'AI: Infiltrate',
  'AI: 捨て札': 'AI: discard',
  'AI: 射撃': 'AI: Fire',
  'AI: 移動': 'AI: Movement',
  'AI: 回復': 'AI: Rally',
  'AI: 狙撃 →': 'AI: Sniper →',
  'AI狙撃 →': 'AI Sniper →',
  'AI侵入シフト': 'AI infiltration shift',
  'AI射撃': 'AI fire',
  'AI侵入 —': 'AI infiltration —',
  'AI白兵戦 —': 'AI Close Combat —',
  '→ プレイヤー': '→ Player',
  '湿地防御': 'Marsh defense',
  // 侵入・白兵戦
  '相対距離が': 'Relative range is',
  'です（5が必要）': ' (5 is required)',
  '真正面または隣接グループにのみ侵入可能 (§20.2)': 'Infiltration is only possible into the group directly opposite or adjacent (§20.2)',
  '河川内からは侵入できません': 'Cannot infiltrate from a Stream',
  '地雷原または鉄条網内からは侵入できません': 'Cannot infiltrate from a Minefield or Wire',
  '地雷原にいるグループには侵入できません': 'Cannot infiltrate a group in a Minefield',
  'ピン状態でない兵士がいません': 'No unpinned soldier',
  '防御側生存数(基礎)': 'Defender survivors (base)',
  '攻撃側地形シフト': 'Attacker terrain shift',
  '防御側地形シフト': 'Defender terrain shift',
  'ピン状態防御兵': 'Pinned defenders',
  '攻撃側移動中': 'Attacker moving',
  '防御側移動中': 'Defender moving',
  '攻撃側既侵入': 'Attacker already infiltrated',
  '日本軍 左1': 'Japan, left 1',
  '攻撃側煙幕×': 'Attacker Smoke ×',
  '防御側煙幕×': 'Defender Smoke ×',
  'クランプ(1-10)': 'Clamp (1-10)',
  '侵入 —': 'Infiltration —',
  '→ 敵': '→ enemy',
  '防御兵数:': 'Defenders:',
  '| 最終コラム:': '| final column:',
  '手札の移動カード:': 'Movement cards in hand:',
  '(ピン状態)': '(pinned)',
  '移動カード必要:': 'Movement cards needed:',
  '枚 / 手札:': ' / in hand:',
  '兵士を選択してください': 'Select soldiers',
  '移動カードが足りません': 'Not enough Movement cards',
  '移動カード(免除)': 'Movement card (exempt)',
  '免除(移動)': 'Exempt (moving)',
  'モラル通過:': 'Passed morale:',
  '名 / 全': ' / all',
  'コラム内訳': 'Column breakdown',
  '最終列': 'Final column',
  '侵入成功:': 'Infiltrated:',
  '侵入成功': 'Infiltrated',
  '名 / 判定': ' / check',
  '白兵戦結果 —': 'Close Combat result —',
  '白兵戦 —': 'Close Combat —',
  '隠ぺいカード（相手のCCVを減少）:': 'Concealment card (reduces the opponent\'s CCV):',
  '隠ぺい(値': 'Concealment (value',
  '隠ぺい)': 'concealment)',
  '移動カード手札:': 'Movement cards in hand:',
  '参加する兵士を選択してください': 'Select the soldiers taking part',
  '攻撃: CCV': 'Attack: CCV',
  '防御: CCV': 'Defense: CCV',
  '人数)': 'men)',
  '両者 KIA': 'Both KIA',
  '兵器捕獲 (§20.74)': 'Weapon capture (§20.74)',
  'を捕獲できます。': ' can be captured.',
  '捕獲する': 'Capture',
  '除去する': 'Remove',
  'モラルチェック —': 'Morale check —',
  'モラルチェック': 'Morale check',
  '侵入チェック —': 'Infiltration check —',
  '侵入中の兵士がいません': 'No soldier is infiltrating',
  '侵入先グループが見つかりません': 'The infiltrated group was not found',
  'が爆薬を保有しています。爆薬攻撃(FP8)を使用しますか？': ' carries a Demo charge. Make a Demo attack (FP8)?',
  '(使用すると以降このグループの攻撃は不可)': '(if used, this group cannot attack afterwards)',
  'のあるグループには白兵戦は挑めません（爆薬攻撃のみ可）': ': a group with this cannot be engaged in Close Combat (Demo attack only)',
  'CC参加に成功した兵士がいません': 'No soldier succeeded in joining the Close Combat',
  '[味方]': '[friendly]',
  '爆薬故障 (赤6) — 攻撃失敗 / 爆薬喪失': 'Demo malfunction (red 6) — attack failed / charge lost',
  '爆薬攻撃 —': 'Demo attack —',
  'トーチカ内のグループはCC不可（火力2倍や爆薬のみ有効）': 'A group in a Pillbox cannot be engaged in CC (only double firepower or Demo work)',
  '[狂暴]': '[berserk]',
  '狂暴兵CC —': 'Berserk CC —',
  // シナリオの説明
  '斥候同士の遭遇戦。両軍は互いに前進し、相対距離を詰めて勝利点を稼ぐ。': 'A meeting engagement between patrols. Both sides advance, close the relative range and earn victory points.',
  '市街での戦闘。建物の占拠がVPの鍵。': 'Fighting in a town. Holding buildings is the key to VP.',
  '攻撃側が防御側のトーチカを破壊せよ。': 'The attacker must destroy the defender\'s Pillbox.',
  '攻撃側はトーチカ内の人格カード全滅または放棄で勝利': 'The attacker wins if all personality cards in the Pillbox are eliminated or it is abandoned',
  '攻撃側が防御側の後衛部隊を突破する。': 'The attacker breaks through the defender\'s rear guard.',
  'パトロール': 'Patrol',
  '市街戦': 'Street Fighting',
  '要塞強襲': 'Fortress Assault',
  '後衛戦': 'Rear Guard',
  // 捨て札
  'アクション後は捨て札できません（米・ソ §4.3）': 'Cannot discard after an action (US / Soviet §4.3)',
  'このターンの捨て札上限に達しています': 'The discard limit for this turn has been reached',
  '国籍ルールにより': 'By nationality rule, only',
  '枚のみ捨て札しました': ' card(s) discarded',
  // ===== 第3段階: カードのデータ（武器名）。階級は上の「階級・役職」 =====
  'M1トンプソン': 'M1 Thompson',
  'M1ガーランド': 'M1 Garand',
  'M1バズーカ2.36インチ': 'M1 Bazooka 2.36 in',
  'ブローニングM1919A6 .30口径': 'Browning M1919A6 .30 cal',
  'M1 .30口径カービン': 'M1 .30 cal Carbine',
  'M1903スプリングフィールド': 'M1903 Springfield',
  'トカレフ SVT-40': 'Tokarev SVT-40',
  'モシン・ナガン M1891/30': 'Mosin-Nagant M1891/30',
  'マキシム PM1910': 'Maxim PM1910',
  'アリサカ三八式': 'Arisaka Type 38',
  '十一年式軽機関銃': 'Type 11 LMG',
  '九二式重機関銃': 'Type 92 HMG',
  '九三式火炎放射器': 'Type 93 Flamethrower',
  '百式機関短銃': 'Type 100 SMG',
  '八九式重擲弾筒': 'Type 89 Grenade Discharger',
  '九六式軽機関銃': 'Type 96 LMG',
  '九七式自動砲': 'Type 97 AT Rifle',
  '九四式三十七粍砲': 'Type 94 37mm Gun',
  '一式四十七粍砲': 'Type 1 47mm Gun',
  '九七式中戦車新砲塔': 'Type 97 Chi-Ha Shinhoto',
  '九七式中戦車': 'Type 97 Chi-Ha',
  '九七式軽戦車': 'Type 97 Te-Ke',
  '九五式軽戦車': 'Type 95 Ha-Go',
  '三式中戦車': 'Type 3 Chi-Nu',
  '一式七糎半自走砲': 'Type 1 Ho-Ni 75mm SPG',
  '九二式装甲自動車': 'Type 92 Armored Car',
  '一式装甲兵員輸送車': 'Type 1 Ho-Ki APC',
  'ステンMk II': 'Sten Mk II',
  'リー・エンフィールドMk I': 'Lee-Enfield Mk I',
  'ヴィッカースMk I': 'Vickers Mk I',
  '携帯型No.5 Mk I': 'Portable No.5 Mk I',
  '2インチ迫撃砲': '2-inch Mortar',
  'ボーイズ': 'Boys',
  '2ポンド砲 L52': '2-pdr L52',
  '6ポンド砲 L45': '6-pdr L45',
  'Mk VIA軽戦車': 'Mk VIA Light Tank',
  'T17E1装甲車': 'T17E1 Armored Car',
  'WASP ブレンキャリア火炎放射型': 'Wasp Bren Carrier Flamethrower',
  'ブレンキャリアMk I': 'Bren Carrier Mk I',
  'ブレン': 'Bren',
  'A15CS クルセイダー': 'A15CS Crusader',
  'A15 クルセイダー': 'A15 Crusader',
  'A12 マチルダII': 'A12 Matilda II',
  'シャーマンVCファイアフライ': 'Sherman VC Firefly',
  'A22 チャーチルVII': 'A22 Churchill VII',
  'A10 巡航戦車': 'A10 Cruiser Tank',
  'A27M クロムウェルIV': 'A27M Cromwell IV',
  'セクストン 25ポンド自走砲': 'Sexton 25-pdr SPG',
  // 文の中に埋め込まれた短い語
  '▶ あなたの手番': '▶ Your turn',
  'の手番': '\'s turn',
  '勝利！': 'Victory!',
  '敗北': 'Defeat',
  '(侵入+': '(infiltration +',
  '[クルー無]': '[no crew]',
  'なし': 'None',
  '自軍': 'own side',
  '自': 'own ',
  '敵': 'enemy ',
  // 表の見出し・短い語
  '射撃力': 'Fire strength',
  '兵士': 'Soldier',
  '状態': 'Status',
  '火力': 'Firepower',
  '合計': 'Total',
  '士気': 'Morale',
  '結果': 'Result',
  '結果:': 'Result:',
  'モラル': 'Morale',
  'パニック': 'Panic',
  '攻撃側': 'Attacker',
  '防御側': 'Defender',
  '隠蔽': 'Concealment',
  '故障': 'Malfunction',
  '距離': 'Range',
  '修正:': 'Modifier:',
  '修正': 'Modifier',
  '命中': 'Hit',
  '外れ': 'Miss',
  '確認': 'OK',
  '方法': 'Method',
  '実行': 'Execute',
  '通過': 'Passed',
  '失敗': 'Failed',
  '戦闘': 'Combat',
  '使わない': 'Don\'t use',
  '(なし)': '(none)',
  '(兵士': '(soldiers',
  '(距離': '(range',
  '/ 兵士': '/ soldiers',
  '[手札': '[hand',
  '湿地': 'Marsh',
  '涸れ谷': 'Gully',
  '河川': 'Stream',
  '渡河': 'Stream crossing',
  '煙幕': 'Smoke',
  '鉄条網': 'Wire',
  '地雷原': 'Minefield',
  'トーチカ': 'Pillbox',
  '建物': 'Building',
  '平地': 'Open Ground',
  'ブッシュ': 'Brush',
  '森': 'Woods',
  '丘': 'Hill',
  '壁': 'Wall',
  '夜間': 'Night',
  '風': 'Wind',
  'ピン': 'Pinned',
  'プレイヤー': 'Player',
  '日本軍': 'Japan',
  'イギリス軍': 'Britain',
  '黒': 'Black',
  '赤': 'Red',
  '裏': 'Back',
  'ドイツ': 'Germany',
  'ソ連': 'Soviet Union',
  'アメリカ': 'USA',
  '日本': 'Japan',
  'イギリス': 'Britain',
  '独': 'GER',
  'ソ': 'SOV',
  '日': 'JPN',
  '米': 'US',
  '英': 'UK',
  '戦': ' battles',
  '指': 'L',
  '主': 'C',
  '副': 'A',
  '侵': 'I',
  '故': 'M',
  '破': 'X',
  '名)': ')',
  '名': '',
  '枚': ' cards',
  '人)': ' men)',
  'は': ':',
  'の': '\'s ',
  'へ (': ' to (',
  '／': ' / ',
  '〜': '-',
  '。': '. ',
  '、': ', ',
  '・': ', ',
  '「': ' "',
  '」': '" ',
  '？': '?',
  '！': '!',
  '：': ': ',
  '（': ' (',
  '）': ')',
  '　': ' ',
};

const LANG_JP = /[぀-ヿ一-鿿！-｠　-〿]/;
const LANG_TERM_RE = new RegExp(
  Object.keys(LANG_TERMS).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const langCache = new Map();

// 日本語の文字列を英語にする
function langTranslate(s){
  if(!LANG_JP.test(s)) return s;
  if(langCache.has(s)) return langCache.get(s);
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
  const core = s.trim();
  let out;
  if(LANG_EXACT[core] !== undefined){
    out = LANG_EXACT[core];
  } else {
    // 語句を置き換え、英単語どうしや数字と続くところに空白を入れる
    out = '';
    let last = 0, m, prevTerm = false;
    LANG_TERM_RE.lastIndex = 0;
    while((m = LANG_TERM_RE.exec(core))){
      const raw = core.slice(last, m.index);
      if(raw){
        if(prevTerm && /[A-Za-z0-9)]$/.test(out) && /^[A-Za-z0-9]/.test(raw)) out += ' ';
        out += raw;
      }
      const en = LANG_TERMS[m[0]];
      if(/[A-Za-z0-9)\]]$/.test(out) && /^[A-Za-z0-9(]/.test(en)) out += ' ';
      out += en;
      last = m.index + m[0].length;
      prevTerm = true;
    }
    const rest = core.slice(last);
    if(rest && prevTerm && /[A-Za-z0-9)]$/.test(out) && /^[A-Za-z0-9]/.test(rest)) out += ' ';
    out += rest;
    out = out.replace(/ {2,}/g, ' ').replace(/ ([,.:;)\]?!])/g, '$1').replace(/\( /g, '(').trim();
  }
  out = lead + out + trail;
  langCache.set(s, out);
  return out;
}

let LANG = 'ja';
try {
  const q = new URLSearchParams(location.search).get('lang');
  if(q === 'en' || q === 'ja'){ LANG = q; localStorage.setItem('ufLang', q); }
  else if(localStorage.getItem('ufLang') === 'en') LANG = 'en';
} catch(e){}

// 文字ごとに元の日本語と英語を覚えておき、切り替えで戻せるようにする
const langText = new WeakMap(), langTitle = new WeakMap();
let langApplying = false;
function langApplyText(node){
  if(node.parentNode && node.parentNode.classList && node.parentNode.classList.contains('lang-btn')) return; // 切り替えボタン自身は訳さない
  const v = node.nodeValue;
  const rec = langText.get(node);
  if(rec && (v === rec.en || v === rec.ja && LANG === 'ja')) return;
  if(!LANG_JP.test(v)){ if(rec) langText.delete(node); return; }
  const r = { ja: v, en: langTranslate(v) };
  langText.set(node, r);
  if(LANG === 'en' && r.en !== v) node.nodeValue = r.en;
}
function langApplyTitle(el){
  const v = el.getAttribute('title');
  if(v == null) return;
  const rec = langTitle.get(el);
  if(rec && (v === rec.en || v === rec.ja && LANG === 'ja')) return;
  if(!LANG_JP.test(v)){ if(rec) langTitle.delete(el); return; }
  const r = { ja: v, en: langTranslate(v) };
  langTitle.set(el, r);
  if(LANG === 'en' && r.en !== v) el.setAttribute('title', r.en);
}
function langWalk(root, fn){
  if(root.nodeType === 3){ fn.text(root); return; }
  if(root.nodeType !== 1) return;
  if(root.tagName === 'SCRIPT' || root.tagName === 'STYLE' || root.classList.contains('lang-btn')) return;
  if(root.hasAttribute('title')) fn.title(root);
  for(const c of root.childNodes) langWalk(c, fn);
}
function langApplyAll(){
  langApplying = true;
  langWalk(document.body, { text: langApplyText, title: langApplyTitle });
  langApplying = false;
}
function langRestoreAll(){
  langWalk(document.body, {
    text: n => { const r = langText.get(n); if(r && n.nodeValue === r.en) n.nodeValue = r.ja; },
    title: el => { const r = langTitle.get(el); if(r && el.getAttribute('title') === r.en) el.setAttribute('title', r.ja); },
  });
}
const langObserver = new MutationObserver(muts => {
  if(LANG !== 'en' || langApplying) return;
  langApplying = true;
  for(const m of muts){
    if(m.type === 'characterData') langApplyText(m.target);
    else if(m.type === 'attributes') langApplyTitle(m.target);
    else m.addedNodes.forEach(n => langWalk(n, { text: langApplyText, title: langApplyTitle }));
  }
  langApplying = false;
});

function setLang(lang){
  LANG = lang;
  try { localStorage.setItem('ufLang', lang); } catch(e){}
  document.documentElement.lang = lang;
  if(lang === 'en'){
    langApplyAll();
    langObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] });
  } else {
    langObserver.disconnect();
    langRestoreAll();
  }
  // 切り替えボタン（各画面にある）: 今の言語ではない方を表示
  document.querySelectorAll('.lang-btn').forEach(b => { b.textContent = lang === 'en' ? '🌐 日本語' : '🌐 English'; });
}
function toggleLang(){ setLang(LANG === 'en' ? 'ja' : 'en'); }

// アラート・確認・入力のダイアログ
{
  const a = window.alert.bind(window), c = window.confirm.bind(window), p = window.prompt.bind(window);
  window.alert = msg => a(LANG === 'en' ? langTranslate(String(msg)) : msg);
  window.confirm = msg => c(LANG === 'en' ? langTranslate(String(msg)) : msg);
  window.prompt = (msg, def) => p(LANG === 'en' ? langTranslate(String(msg)) : msg, def);
}

document.addEventListener('DOMContentLoaded', () => setLang(LANG));
