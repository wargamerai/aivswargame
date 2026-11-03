// スタートリック 日本語と英語の文章
var TRICK_TEXT = {
ja: {
  title: 'スタートリック',
  subtitle: '1971年のあのゲーム',
  langLabel: '言語',
  modeLabel: 'モード',
  diffLabel: '難易度',
  start: 'スタート',
  backTop: 'トップページへ',
  newGame: 'もう一度',
  skip: 'クリックかEnterで飛ばす',
  mode_classic: '昔のまんま',
  mode_classic_d: 'コマンドをキーボードで打つだけ。地図も命令しないと更新されない。',
  mode_kind: '親切',
  mode_kind_d: 'マウスでコマンドを選べる。地図はいつも最新。方向は図から選ぶ。',
  mode_beginner: '初心者',
  mode_beginner_d: '親切モードに加えて、目標をクリックすると角度とワープを計算する。次にやることも教える。',
  diff_easy: '優しい', diff_normal: '普通', diff_hard: 'ハード', diff_veryhard: 'ベリーハード',
  diffInfo: '敵{k}隻 / 基地{b}か所 / 期限{d}日',
  shortMap: '短距離スキャン（今いるクワドラント）',
  longMap: '長距離スキャン',
  galaxyMap: '銀河地図（*** はまだ調べていない場所）',
  status: '状況',
  help: 'ヘルプ',
  commands: 'コマンド',
  results: '結果',
  notScanned: 'まだ表示していません。{c} を打ってください。',
  srsDown: '短距離センサー故障中',
  st_date: '現在の日付', st_left: '残り日数', st_cond: '状態', st_quad: 'クワドラント', st_sect: 'セクター',
  st_energy: 'エネルギー', st_shield: 'シールド', st_torp: '魚雷', st_klingon: '敵の残り', st_base: '基地の残り',
  cond_green: '緑（安全）', cond_yellow: '黄（燃料不足）', cond_red: '赤（敵がいる）', cond_docked: 'ドッキング中',
  legend: '<*>=自艦  +K+=敵  >!<=基地  *=星',
  legendG: '3桁の数字 = 敵の数・基地の数・星の数。例 205 = 敵2 基地0 星5。[ ] は現在地',
  prompt: 'COMMAND>',
  p_course: 'コース (1〜8.99)>',
  p_warp: 'ワープ (1〜8。2m なら2マス)>',
  p_sectors: 'マス数>',
  sectorsBtn: '{n}マス',
  p_energy: '使うエネルギー>',
  p_shield: 'シールドの値>',
  p_com: 'コンピューター (0〜4)>',
  p_com4: '現在のX Y 目標のX Y（クワドラントの番号）>',
  cmd_nav: 'NAV 移動', cmd_srs: 'SRS 短距離', cmd_lrs: 'LRS 長距離', cmd_pha: 'PHA フェイザー', cmd_tor: 'TOR 魚雷',
  cmd_she: 'SHE シールド', cmd_dam: 'DAM 損傷', cmd_com: 'COM 計算機', cmd_xxx: 'XXX 中止',
  run: '実行', cancel: 'やめる', course: 'コース', warp: 'ワープ', energy: 'エネルギー', amount: '量',
  warpInfo: '移動 {n} マス / 使うエネルギー {e} / {t} 日かかる',
  com0: '銀河地図', com1: '任務の状況', com2: '魚雷の計算', com3: '基地の計算', com4: '方向の計算',
  // 初心者モード
  bg_title: 'お手伝い',
  bg_nav: '行きたい場所を、上の短距離スキャンか銀河地図でクリックしてください。コースとワープを計算します。',
  bg_tor: '敵を選んでください。途中に星や基地があると当たりません。',
  bg_target: '目標 {x},{y}: コース {c} / 距離 {d} マス',
  bg_targetQ: '目標クワドラント {x},{y}: コース {c} / ワープ {w}',
  bg_path_ok: '進路に障害物はありません。',
  bg_path_block: '注意: {x},{y} の {t} にぶつかって止まります。',
  bg_tor_row: '敵 {x},{y}  コース {c}  {s}',
  bg_tor_ok: '当たる',
  bg_tor_block: '{t} に当たる',
  bg_fire: 'この敵を撃つ',
  bg_pha: '今の敵を全部倒す目安は {n} です（ばらつきあり）。距離が遠いほど弱くなります。',
  bg_she: '敵の一斉射の目安は {n} です。その2倍の {r} あると安心です。シールドが0になると艦は沈みます。',
  bg_use: 'この値を使う',
  star: '星', base: '基地', klingon: '敵',
  adv_shield: '次にやること: 敵がいます。まず SHE でシールドを張りましょう。',
  adv_attack: '次にやること: TOR か PHA で敵を攻撃しましょう。',
  adv_refuel: '次にやること: 燃料か魚雷が少なくなりました。銀河地図で基地（真ん中の数字が1）へ向かいましょう。',
  adv_lrs: '次にやること: LRS で周りを調べましょう。時間はかかりません。',
  adv_go: '次にやること: 銀河地図で敵（左の数字が1以上）がいる場所をクリックして、NAV で向かいましょう。',
  adv_explore: '次にやること: 銀河地図の *** をクリックして、NAV でまだ調べていない場所へ向かいましょう。',
  // コマンドの説明
  dev_nav: 'ワープエンジン', dev_srs: '短距離センサー', dev_lrs: '長距離センサー', dev_pha: 'フェイザー',
  dev_tor: '魚雷発射管', dev_dam: '損傷管理', dev_she: 'シールド制御', dev_com: 'コンピューター',
  dam_ok: '正常', dam_bad: '故障 あと{n}日',
  com1_text: '敵の残り {k} / 基地の残り {b} / 残り {d} 日 / エネルギー {e} / 魚雷 {t}',
  com2_row: '敵 {x},{y}: コース {c} / 距離 {d}',
  com2_none: 'このクワドラントに敵はいません。',
  com3_row: '基地 {x},{y}（このクワドラント）: コース {c} / 距離 {d}',
  com3_rowQ: '基地があるクワドラント {x},{y}: コース {c} / ワープ {w}',
  com3_none: '基地の場所はまだわかっていません。',
  com4_row: 'コース {c} / ワープ {w}',
  badCommand: '{c} というコマンドはありません。HELP で一覧を出せます。',
  comDown: 'コンピューターが故障しています。',
  damDown: '損傷管理装置が故障していて報告できません。',
  needGame: '任務は終わりました。「もう一度」を押してください。',
  quitConfirm: '任務を中止しました。',
  // ゲームからの報告
  intro: '指令: 宇宙日{date}までに敵艦{k}隻をすべて倒せ。味方の基地は{b}か所。期限は{d}日。',
  enter: 'クワドラント {x},{y} に入りました。',
  combatArea: '戦闘区域です。敵 {n} 隻を確認。',
  shieldsLow: '警告: シールドが危険なほど低い状態です。',
  docked: '基地にドッキング。エネルギーと魚雷を補給しました。シールドは下ろします。',
  repaired: '基地で全装置を修理しました（{t}日）。',
  baseProtects: '基地のシールドが守ってくれました。',
  hit: '敵 {x},{y} の攻撃 {h}。シールド残り {s}。',
  devHit: '被弾で {d} が故障しました。',
  devFixed: '{d} の修理が終わりました。',
  devImproved: '{d} の修理が進みました。',
  devAccident: '事故で {d} が故障しました。',
  badCourse: 'コースは 1 以上 9 未満で指定してください。',
  badWarp: 'ワープは 0.125 以上 8 以下で指定してください。',
  navDamaged: 'エンジン故障中はワープ 0.2 までです。',
  noEnergy: 'エネルギーが足りません。必要 {need} / 残り {have}。',
  shieldHint: 'シールドに {s} 振り分けています。SHE で減らせます。',
  galaxyEdge: '銀河の端です。これ以上は進めません。',
  blocked: '障害物の手前、セクター {x},{y} で停止しました。',
  shieldSupply: 'エネルギーが足りないのでシールドから補いました。',
  lrsDown: '長距離センサーが故障しています。',
  lrsDone: '長距離スキャンを行いました。',
  phaDown: 'フェイザーが故障しています。',
  noTargets: '敵がいません。',
  badAmount: '正しい数を入れてください。',
  phaNoEffect: '敵 {x},{y} には効きませんでした。',
  phaHit: '敵 {x},{y} に {h} 命中。敵の残り {r}。',
  killed: '敵 {x},{y} を撃破！ 残り {n} 隻。',
  torDown: '魚雷発射管が故障しています。',
  noTorps: '魚雷がありません。',
  torTrack: '魚雷の航跡: {path}',
  torStar: '魚雷は {x},{y} の星に吸い込まれました。',
  torBase: 'しまった！ 味方の基地を破壊しました。',
  torMiss: '魚雷は外れました。',
  sheDown: 'シールド制御が故障しています。',
  shieldsSet: 'シールド {s} / エネルギー残り {e}。',
  end_win: '敵を全滅させました！ 任務成功です。宇宙日 {date}。',
  end_destroyed: 'エンタープライズは撃沈されました。敵は {k} 隻残っています。',
  end_time: '期限切れです。敵は {k} 隻残っています。任務失敗。',
  end_stranded: 'エネルギーが尽きて宇宙を漂っています。敵は {k} 隻残っています。任務失敗。',
  end_quit: '任務を中止しました。敵は {k} 隻残っています。',
  help_tabs: ['はじめに', '方向', '画面', 'コマンド', '戦い方'],
  help_pages: [
`【目的】
期限までに銀河にいる敵艦をすべて倒します。

【負ける条件】
・シールドが0になる（撃沈）
・期限が過ぎる
・エネルギーが尽きる

【銀河のつくり】
銀河は 12×12 のクワドラント（区画）です。
1つのクワドラントは 8×8 のセクター（マス）です。

【進め方】
1. LRS で周りを調べる（時間はかかりません）
2. 敵のいる場所へ NAV で移動する
3. SHE でシールドを張ってから TOR か PHA で攻撃する
4. 減ったら基地で補給する
基地の隣のマスに止まると、ドッキングして全回復します。

【時間】
ワープ1以上の移動は、距離に関係なく1日です。
ワープ1未満はその分だけ短くなります。
スキャン、シールド、攻撃に時間はかかりません。`,
`【方向とは】
「コース」という数字で向きを決めます。
画面の右が東、上が北です。

      4   3   2
       \\  |  /
    5 --- 艦 --- 1
       /  |  \\
      6   7   8

1 = 右  (東)
2 = 右上(北東)
3 = 上  (北)
4 = 左上(北西)
5 = 左  (西)
6 = 左下(南西)
7 = 下  (南)
8 = 右下(南東)

【小数も使える】
2つの数字の間の向きは小数で指定します。
1.5 は 1(右) と 2(右上) のちょうど中間です。

【計算のしかた】
目標が 右に4マス、上に2マス なら、
「右」(1) と「右上」(2) の間です。
上÷右 = 2÷4 = 0.5 なので、コースは 1.5 です。

計算が苦手なら COM 2（敵）か COM 3（基地）で
コンピューターに聞けます。初心者モードなら
クリックだけで計算します。

【ワープ】
ワープ1で8マス、つまり1クワドラント進みます。
短く動くときは、マス数で指定すると楽です。
M 3 2 = コース3へ2マス
NAV 3 2m でも同じです。`,
`【短距離スキャン】
今いるクワドラントの中です。
<*> 自分の艦
+K+ 敵
>!< 味方の基地
 *  星（通れません。魚雷も止まります）

左端と上の数字が座標です。X が横、Y が縦です。

【銀河地図】
*** は、まだ調べていない場所です。
移動するか LRS を使うと中身がわかります。
数字は3桁です。
  左 = 敵の数
  中 = 基地の数
  右 = 星の数
例: 205 は 敵2隻、基地なし、星5つ。

【状態】
緑 = 安全
黄 = エネルギーが残り少ない
赤 = 同じクワドラントに敵がいる`,
`NAV コース ワープ
  移動します。例: NAV 3 1 （上へ1クワドラント）
  NAV 3 2m でも、M 3 2 でも「上へ2マス」です。
  小数を打たなくて済みます。
  エネルギーは (マス数 + 10) 減ります。
  移動の前に敵が撃ってきます。

SRS  短距離スキャン。時間はかかりません。

LRS  周囲3×3を調べます。時間はかかりません。

PHA 量
  全部の敵にエネルギーを等分して撃ちます。
  遠い敵ほど弱くなり、弱すぎると効きません。
  撃った後、生き残った敵が撃ち返します。

TOR コース
  魚雷を1発撃ちます。当たれば必ず倒します。
  途中の星や基地に当たると止まります。
  基地に当たると基地が壊れます。

SHE 値
  シールドの量を決めます。増やした分は
  エネルギーから引かれます。減らすと戻ります。

DAM  各装置の故障の状況を表示します。

COM 番号
  0 銀河地図を表示
  1 任務の状況
  2 敵までのコースと距離
  3 基地までのコースと距離
  4 COM 4 X1 Y1 X2 Y2 2点間の計算

XXX  任務を中止します。

HELP  コマンドの一覧を結果欄に出します。`,
`【シールドがすべて】
シールドが0になると一撃で沈みます。
敵の攻撃は、敵の力 ÷ 距離 × 2〜3 です。
隣の敵からは300以上の攻撃が来ることもあります。
敵のいるクワドラントに入る前に十分張りましょう。

【魚雷とフェイザー】
魚雷は1発で必ず倒せます。まっすぐ狙える敵に。
フェイザーは星を気にせず撃てますが、遠いと弱いです。
敵は攻撃するたびに弱っていくので、距離を取ると有利です。

【時間の節約】
長距離のワープも1日です。遠くまで一度に飛びましょう。
LRS は無料です。到着するたびに使いましょう。

【基地】
基地の隣に止まると、補給と修理を一度にできます。
ドッキング中は敵の攻撃も受けません。

【故障】
移動すると少しずつ直ります。基地なら一度に直ります。`,
  ],
  help_list: 'コマンド: NAV 移動 / SRS 短距離 / LRS 長距離 / PHA フェイザー / TOR 魚雷 / SHE シールド / DAM 損傷 / COM 計算機 / XXX 中止',
},
en: {
  title: 'STAR TRICK',
  subtitle: 'That game from 1971',
  langLabel: 'Language',
  modeLabel: 'Mode',
  diffLabel: 'Difficulty',
  start: 'START',
  backTop: 'Top page',
  newGame: 'Play again',
  skip: 'Click or press Enter to skip',
  mode_classic: 'Old School',
  mode_classic_d: 'Type every command on the keyboard. Maps update only when you order a scan.',
  mode_kind: 'Friendly',
  mode_kind_d: 'Pick commands with the mouse. Maps are always current. Choose directions from a dial.',
  mode_beginner: 'Beginner',
  mode_beginner_d: 'Friendly mode, and clicking a target works out the course and warp for you. Also suggests the next step.',
  diff_easy: 'Easy', diff_normal: 'Normal', diff_hard: 'Hard', diff_veryhard: 'Very Hard',
  diffInfo: '{k} enemies / {b} bases / {d} days',
  shortMap: 'Short range scan (this quadrant)',
  longMap: 'Long range scan',
  galaxyMap: 'Galaxy map (*** = not explored yet)',
  status: 'Status',
  help: 'Help',
  commands: 'Commands',
  results: 'Results',
  notScanned: 'Nothing on screen yet. Type {c}.',
  srsDown: 'Short range sensors are out',
  st_date: 'Stardate', st_left: 'Days left', st_cond: 'Condition', st_quad: 'Quadrant', st_sect: 'Sector',
  st_energy: 'Energy', st_shield: 'Shields', st_torp: 'Torpedoes', st_klingon: 'Enemies left', st_base: 'Bases left',
  cond_green: 'GREEN', cond_yellow: 'YELLOW (low energy)', cond_red: '*RED* (enemy here)', cond_docked: 'DOCKED',
  legend: '<*>=you  +K+=enemy  >!<=base  *=star',
  legendG: '3 digits = enemies, bases, stars. 205 = 2 enemies, no base, 5 stars. [ ] is you',
  prompt: 'COMMAND>',
  p_course: 'Course (1-8.99)>',
  p_warp: 'Warp (1-8, or 2m for 2 sectors)>',
  p_sectors: 'Sectors>',
  sectorsBtn: '{n}sec',
  p_energy: 'Energy to fire>',
  p_shield: 'Shield level>',
  p_com: 'Computer (0-4)>',
  p_com4: 'From X Y to X Y (quadrant numbers)>',
  cmd_nav: 'NAV Move', cmd_srs: 'SRS Short', cmd_lrs: 'LRS Long', cmd_pha: 'PHA Phasers', cmd_tor: 'TOR Torpedo',
  cmd_she: 'SHE Shields', cmd_dam: 'DAM Damage', cmd_com: 'COM Computer', cmd_xxx: 'XXX Abort',
  run: 'Execute', cancel: 'Cancel', course: 'Course', warp: 'Warp', energy: 'Energy', amount: 'Amount',
  warpInfo: 'Moves {n} sectors / uses {e} energy / takes {t} days',
  com0: 'Galaxy map', com1: 'Mission status', com2: 'Torpedo data', com3: 'Starbase data', com4: 'Direction calc',
  bg_title: 'Helper',
  bg_nav: 'Click where you want to go on the short range scan or the galaxy map. The course and warp are worked out for you.',
  bg_tor: 'Choose an enemy. Stars and bases in the way will stop the torpedo.',
  bg_target: 'Target {x},{y}: course {c} / {d} sectors away',
  bg_targetQ: 'Target quadrant {x},{y}: course {c} / warp {w}',
  bg_path_ok: 'The path is clear.',
  bg_path_block: 'Careful: you will stop at the {t} at {x},{y}.',
  bg_tor_row: 'Enemy {x},{y}  course {c}  {s}',
  bg_tor_ok: 'will hit',
  bg_tor_block: 'hits a {t}',
  bg_fire: 'Fire at this one',
  bg_pha: 'About {n} should destroy every enemy here (results vary). Distance weakens phasers.',
  bg_she: 'One enemy volley is about {n}. Twice that, {r}, is comfortable. If shields reach 0 the ship is lost.',
  bg_use: 'Use this',
  star: 'star', base: 'base', klingon: 'enemy',
  adv_shield: 'Next: enemies are here. Raise shields with SHE first.',
  adv_attack: 'Next: attack with TOR or PHA.',
  adv_refuel: 'Next: energy or torpedoes are low. Head for a base (middle digit 1 on the galaxy map).',
  adv_lrs: 'Next: use LRS to look around. It takes no time.',
  adv_go: 'Next: click a place with enemies (left digit 1 or more) on the galaxy map, then NAV there.',
  adv_explore: 'Next: click a *** on the galaxy map, then NAV somewhere unexplored.',
  dev_nav: 'Warp engines', dev_srs: 'Short range sensors', dev_lrs: 'Long range sensors', dev_pha: 'Phasers',
  dev_tor: 'Torpedo tubes', dev_dam: 'Damage control', dev_she: 'Shield control', dev_com: 'Computer',
  dam_ok: 'OK', dam_bad: 'Damaged, {n} days',
  com1_text: 'Enemies {k} / Bases {b} / {d} days left / Energy {e} / Torpedoes {t}',
  com2_row: 'Enemy {x},{y}: course {c} / distance {d}',
  com2_none: 'No enemies in this quadrant.',
  com3_row: 'Base {x},{y} (this quadrant): course {c} / distance {d}',
  com3_rowQ: 'Base in quadrant {x},{y}: course {c} / warp {w}',
  com3_none: 'No base found yet.',
  com4_row: 'Course {c} / warp {w}',
  badCommand: 'No such command: {c}. HELP lists them.',
  comDown: 'The computer is damaged.',
  damDown: 'Damage control is out and cannot report.',
  needGame: 'The mission is over. Press Play again.',
  quitConfirm: 'Mission aborted.',
  intro: 'Orders: destroy all {k} enemy ships by stardate {date}. You have {b} bases and {d} days.',
  enter: 'Entering quadrant {x},{y}.',
  combatArea: 'Combat area. {n} enemies detected.',
  shieldsLow: 'Warning: shields dangerously low.',
  docked: 'Docked at the base. Energy and torpedoes restored. Shields lowered.',
  repaired: 'The base repaired all devices ({t} days).',
  baseProtects: 'The base shields protect the ship.',
  hit: 'Enemy at {x},{y} hits for {h}. Shields {s}.',
  devHit: 'The hit damaged the {d}.',
  devFixed: '{d} repaired.',
  devImproved: '{d} repairs are going well.',
  devAccident: 'An accident damaged the {d}.',
  badCourse: 'Course must be at least 1 and below 9.',
  badWarp: 'Warp must be from 0.125 to 8.',
  navDamaged: 'With damaged engines, warp is limited to 0.2.',
  noEnergy: 'Not enough energy. Need {need}, have {have}.',
  shieldHint: 'Shields hold {s}. Lower them with SHE.',
  galaxyEdge: 'Edge of the galaxy. You can go no further.',
  blocked: 'Stopped before an obstacle at sector {x},{y}.',
  shieldSupply: 'Shields supplied the missing energy.',
  lrsDown: 'Long range sensors are damaged.',
  lrsDone: 'Long range scan complete.',
  phaDown: 'Phasers are damaged.',
  noTargets: 'No enemies here.',
  badAmount: 'Enter a valid number.',
  phaNoEffect: 'No effect on the enemy at {x},{y}.',
  phaHit: '{h} hit on the enemy at {x},{y}. It has {r} left.',
  killed: 'Enemy at {x},{y} destroyed! {n} left.',
  torDown: 'Torpedo tubes are damaged.',
  noTorps: 'No torpedoes left.',
  torTrack: 'Torpedo track: {path}',
  torStar: 'The star at {x},{y} absorbed the torpedo.',
  torBase: 'Oh no! You destroyed a friendly base.',
  torMiss: 'The torpedo missed.',
  sheDown: 'Shield control is damaged.',
  shieldsSet: 'Shields {s} / energy {e}.',
  end_win: 'All enemies destroyed! Mission complete at stardate {date}.',
  end_destroyed: 'The Enterprise has been destroyed. {k} enemies remain.',
  end_time: 'Time is up. {k} enemies remain. Mission failed.',
  end_stranded: 'Out of energy and adrift in space. {k} enemies remain. Mission failed.',
  end_quit: 'Mission aborted. {k} enemies remain.',
  help_tabs: ['Basics', 'Direction', 'Screen', 'Commands', 'Tactics'],
  help_pages: [
`GOAL
Destroy every enemy ship before the deadline.

YOU LOSE IF
- shields reach 0 (ship destroyed)
- the deadline passes
- energy runs out

THE GALAXY
The galaxy is 12x12 quadrants.
Each quadrant is 8x8 sectors.

HOW TO PLAY
1. LRS to look around (takes no time)
2. NAV to a place with enemies
3. SHE to raise shields, then TOR or PHA to attack
4. Refuel at a base when low
Stop next to a base to dock and restore everything.

TIME
A move of warp 1 or more takes 1 day, however far.
Below warp 1 it takes less.
Scans, shields and attacks take no time.`,
`WHAT DIRECTION MEANS
A number called the course sets your heading.
Right on screen is east. Up is north.

      4   3   2
       \\  |  /
    5 --- <*> --- 1
       /  |  \\
      6   7   8

1 = right       (east)
2 = up-right    (northeast)
3 = up          (north)
4 = up-left     (northwest)
5 = left        (west)
6 = down-left   (southwest)
7 = down        (south)
8 = down-right  (southeast)

DECIMALS
Use a decimal for directions in between.
1.5 is exactly halfway between 1 and 2.

WORKING IT OUT
A target 4 right and 2 up lies between 1 and 2.
Up / right = 2 / 4 = 0.5, so the course is 1.5.

If you dislike the math, ask COM 2 (enemies) or
COM 3 (bases). In Beginner mode just click.

WARP
Warp 1 is 8 sectors, which is 1 quadrant.
For short hops, give the number of sectors.
M 3 2 = course 3, 2 sectors
NAV 3 2m does the same.`,
`SHORT RANGE SCAN
Shows your current quadrant.
<*> your ship
+K+ enemy
>!< friendly base
 *  star (blocks ships and torpedoes)

The numbers on the edge are coordinates.
X runs across, Y runs down.

GALAXY MAP
*** means not explored yet.
Visit it or use LRS to see what is there.
Each entry has 3 digits:
  left   = enemies
  middle = bases
  right  = stars
Example: 205 = 2 enemies, no base, 5 stars.

CONDITION
GREEN  = safe
YELLOW = low on energy
RED    = enemies in this quadrant`,
`NAV course warp
  Move. Example: NAV 3 1 (up one quadrant)
  NAV 3 2m and M 3 2 both mean up 2 sectors,
  so you never need to type decimals.
  Costs sectors moved + 10 energy.
  Enemies fire before you move.

SRS  Short range scan. Takes no time.

LRS  Scan the 3x3 around you. Takes no time.

PHA amount
  Splits energy among all enemies here.
  Weaker with distance. Too weak has no effect.
  Survivors shoot back.

TOR course
  Fires one torpedo. A hit always destroys.
  Stars and bases stop it.
  Hitting a base destroys the base.

SHE level
  Sets the shield level. Energy pays for increases
  and gets refunds for decreases.

DAM  Shows device damage.

COM number
  0 galaxy map
  1 mission status
  2 course and distance to enemies
  3 course and distance to bases
  4 COM 4 X1 Y1 X2 Y2 calculator

XXX  Abort the mission.

HELP  Lists commands in the results area.`,
`SHIELDS ARE EVERYTHING
At 0 shields you are lost.
An enemy hit is its power / distance x 2-3.
A close enemy can hit for 300 or more.
Raise plenty of shields before entering a fight.

TORPEDOES AND PHASERS
A torpedo always kills. Use it with a clear line.
Phasers ignore stars but fade with distance.
Enemies weaken with every shot they fire, so distance helps.

SAVING TIME
Even a long warp takes 1 day, so jump far.
LRS is free. Use it every time you arrive.

BASES
Stop next to a base to refuel and repair at once.
Enemies cannot hurt you while docked.

DAMAGE
Devices slowly repair as you travel. A base fixes all.`,
  ],
  help_list: 'Commands: NAV move / SRS short scan / LRS long scan / PHA phasers / TOR torpedo / SHE shields / DAM damage / COM computer / XXX abort',
},
};
if (typeof module !== 'undefined' && module.exports) module.exports = TRICK_TEXT;
