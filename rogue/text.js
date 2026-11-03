// Rogue の文章（日本語と英語）
var ROGUE_TEXT = {
en: {
  hint: '', top: 'Top page', more: '--More--',
  status: 'Level: {l}  Gold: {g}  Hp: {h}({m})  Str: {s}({ms})  Arm: {a}  Exp: {e}/{x}',
  hungry: 'Hungry', weak: 'Weak', faint: 'Fainting',
  welcome: 'Hello adventurer. Welcome to the Dungeons of Doom.',
  noStairs: "I see no way down.", noUp: "I see no way up.", needAmulet: 'Your way is magically blocked.',
  gold: 'you found {n} gold pieces', got: 'you now have {i} ({k})', packFull: 'there is no room in your pack',
  seeHere: 'you see here {i}', moved: 'you moved onto {i}',
  hitYou: 'the {m} hits you', missYou: 'the {m} misses you', youHit: 'you hit the {m}', youMiss: 'you miss the {m}', youKill: 'you have defeated the {m}',
  levelUp: 'welcome to level {n}', hungryMsg: 'you are starting to get hungry', weakMsg: 'you are starting to feel weak with hunger', faintMsg: 'you feel too weak from lack of food. You faint', stuckMsg: 'you are being held',
  noItem: "you don't have anything appropriate", prompt: 'what do you want to {v}? (press its letter, ESC to cancel)', badItem: "that's not a valid item",
  v_quaff: 'quaff', v_read: 'read', v_eat: 'eat', v_wield: 'wield', v_wear: 'wear', v_put: 'put on', v_drop: 'drop', v_throw: 'throw', v_zap: 'zap',
  dirPrompt: 'which direction? (numpad 8 4 6 2, diagonals 7 9 1 3, 0 cancels)', cannotMove: 'you cannot move that way',
  yum: 'my, that was a yummy {f}', yuk: 'yuk, this food tastes awful', notFood: "that isn't something you can eat",
  fruit: 'slime mold',
  wearing: 'you are now wearing {i}', wielding: 'you are now wielding {i}', cursed: 'you can\'t. It appears to be cursed',
  armorOff: 'you are no longer wearing {i}', noArmor: "you aren't wearing any armor", alreadyArmor: 'you are already wearing some. You\'ll have to take it off first',
  ringOn: 'you are now wearing {i}', ringOff: 'you are no longer wearing {i}', noRing: "you aren't wearing any rings", twoRings: 'you already have a ring on each hand',
  dropped: 'dropped {i}', noRoom: 'there is something there already',
  nothing: 'nothing happens', searching: 'you search...', foundDoor: 'you found a secret door',
  trap_door: 'you fell through a trap door!', trap_arrow: 'an arrow shoots you', trap_arrowMiss: 'an arrow shoots past you', trap_sleep: 'a strange white mist envelops you and you fall asleep', trap_bear: 'you are caught in a bear trap', trap_tele: 'you find yourself somewhere else', trap_dart: 'a small dart just hit you in the shoulder', trap_dartMiss: 'a small dart whizzes by your ear', trap_rust: 'a gush of water hits you',
  rust: 'your armor weakens', rustSafe: 'the rust vanishes instantly', frozen: 'you are frozen by the {m}', str: 'you feel a bite in your leg and now feel weaker', strSafe: 'a bite momentarily weakens you', drain: 'you suddenly feel weaker', stolen: 'your purse feels lighter', nymph: 'she stole {i}!', held: 'you are being held by the {m}', confuse: 'the {m}\'s gaze has confused you', breath: 'the {m} breathes fire!',
  p_conf: 'wait, what\'s going on here. Huh? What? Who?', p_hall: 'Oh wow! Everything seems so cosmic!', p_poison: 'you feel very sick now', p_str: 'you feel stronger, now. What bulging muscles!', p_see: 'this potion tastes like slime mold juice', p_heal: 'you begin to feel better', p_mdet: 'you begin to sense the presence of monsters', p_mdetNo: 'you have a strange feeling for a moment', p_odet: 'you can sense magic', p_raise: 'you suddenly feel much more skillful', p_xheal: 'you begin to feel much better', p_haste: 'you feel yourself moving much faster', p_restore: 'hey, this tastes great. It makes you feel warm all over', p_blind: 'a cloak of darkness falls around you', p_lev: 'you start to float in the air',
  blindEnd: 'the veil of darkness lifts', confEnd: 'you feel less confused now', hasteEnd: 'you feel yourself slowing down', levEnd: 'you float gently to the ground', hallEnd: 'everything looks SO boring now',
  blindNoRead: "you can't read while blind",
  s_conf: 'your hands begin to glow red', s_map: 'this scroll has a map on it', s_hold: 'the monsters around you freeze', s_sleep: 'you fall asleep', s_earm: 'your armor glows silver for a moment', s_id: 'this scroll is an identify scroll', s_idWhich: 'what do you want to identify?', s_scare: 'you hear maniacal laughter in the distance', s_food: 'your nose tingles and you smell food', s_foodNo: 'your nose tingles', s_tele: 'you feel yourself somewhere else', s_eweap: 'your weapon glows blue for a moment', s_create: 'you hear a faint cry of anguish', s_curse: 'you feel as if somebody is watching over you', s_agg: 'you hear a high pitched humming noise', s_prot: 'your armor is covered by a shimmering gold shield', s_noArm: 'you feel a strange sense of loss', s_noWeap: 'your hands tingle',
  z_light: 'the corridor glows and then fades', z_lightRoom: 'the room is lit', z_bolt: 'the {b} hits the {m}', z_boltMiss: 'the {b} misses the {m}', z_none: 'the bolt vanishes', z_noCharge: 'nothing happens', z_tele: 'the {m} vanishes', z_poly: 'the {m} changes shape', z_slow: 'the {m} slows down', z_haste: 'the {m} speeds up', z_invis: 'the {m} vanishes from sight', z_cancel: 'the {m} loses its powers', z_drain: 'you feel your life force flow out', z_drainNo: 'you have a tingling feeling',
  thrownHit: 'the {i} hits the {m}', thrownMiss: 'the {i} misses the {m}',
  invTitle: 'Your pack: (press any key)', invEmpty: 'you are empty handed', inHand: 'in hand', onBody: 'being worn', leftHand: 'on left hand', rightHand: 'on right hand',
  amulet: 'the Amulet of Yendor',
  quit: 'really quit? (y/n)',
  rip: 'REST IN PEACE', ripKilled: 'killed by {m}', ripOn: 'on level {l}', ripGold: '{g} Au', hunger: 'starvation', ripQuit: 'quit', trap: 'a trap',
  win: 'You escape the Dungeons of Doom with the Amulet of Yendor!', winScore: 'Gold {g}. Press Enter to play again.', again: 'Press Enter to play again.',
  btnHelp: 'Help', sheet: `Numpad   7 down stairs   8 up     9 up stairs    0 search
         4 left          5 rest   6 right
         1 pick up       2 down   3 menu (press again for the next menu)`,
  nothingHere: 'there is nothing here', menuKeys: '3 next menu  8/2 choose  5 OK  0 close', menuRun: 'Press 5 to do this.',
  m_pack: 'Pack', m_quaff: 'Drink a potion', m_read: 'Read a scroll', m_eat: 'Eat', m_wield: 'Hold a weapon', m_wear: 'Wear armor', m_off: 'Take off armor', m_ring: 'Put on a ring', m_ringOff: 'Take off a ring', m_zap: 'Use a wand', m_throw: 'Throw', m_drop: 'Drop', m_help: 'Help', m_quit: 'Give up',
  help: `HOW TO PLAY ROGUE

You are the @. Go down the stairs (%) to level 26, grab the Amulet (,)
and climb all the way back up. You only live once. There is no saving.

THE NUMPAD        7 down stairs   8 up     9 up stairs
                  4 left          5 rest   6 right
                  1 pick up       2 down   3 menu      0 search
                  Arrow keys move too. Two arrows at once = diagonal.

FIGHTING          Just walk into a monster (a capital letter A-Z).
PICKING UP        Just walk over an item.
STAIRS            Stand on % and press 7. Press 9 to go up (needs the Amulet).
STUCK?            Dead end? Press 0 a few times to search for a secret door.
LOW ON HP?        Press 5 to rest, or drink a potion.
HUNGRY?           Open the menu and eat before you starve.

THE MENU          3 opens your pack. Press 3 again for the next menu:
                  pack, drink, read, eat, weapon, wear, take off, ring on,
                  ring off, wand, throw, drop, help, give up.
                  8 and 2 choose, 5 confirms, 0 closes.
                  In a throw or wand direction: 8 4 6 2, or 7 9 1 3 for diagonals.

The old letter keys still work: h j k l y u b n, i q r e w W T P R z t d s Q > <

WHAT YOU SEE
  @ you    A-Z monster   % stairs   + door    # passage
  * gold   : food        ! potion   ? scroll  ) weapon
  ] armor  = ring        / wand     ^ trap    , the Amulet

Unknown potions and scrolls have odd names. Try them to learn what they do.

Press any key to go back.`,
},
ja: {
  hint: '', top: 'トップページへ', more: '--続く--',
  status: '階: {l}  金: {g}  HP: {h}({m})  力: {s}({ms})  防: {a}  経験: {e}/{x}',
  hungry: '空腹', weak: '衰弱', faint: '瀕死',
  welcome: 'ようこそ冒険者よ。運命の迷宮へ。',
  noStairs: 'ここに下り階段はない。', noUp: 'ここに上り階段はない。', needAmulet: '魔法の力で上がれない。',
  gold: '金貨を {n} 枚見つけた', got: '{i} を手に入れた ({k})', packFull: '持ち物がいっぱいだ',
  seeHere: 'ここに {i} がある', moved: '{i} の上に乗った',
  hitYou: '{m}の攻撃を受けた', missYou: '{m}の攻撃は外れた', youHit: '{m}に命中', youMiss: '{m}に外れた', youKill: '{m}を倒した',
  levelUp: 'レベル {n} になった', hungryMsg: '腹が減ってきた', weakMsg: '空腹で力が出ない', faintMsg: '空腹で気を失った', stuckMsg: 'つかまっていて動けない',
  noItem: '使えるものを持っていない', prompt: 'どれを{v}？ (左の文字。ESC でやめる)', badItem: 'それは選べない',
  v_quaff: '飲む', v_read: '読む', v_eat: '食べる', v_wield: '持つ', v_wear: '着る', v_put: 'はめる', v_drop: '置く', v_throw: '投げる', v_zap: '振る',
  dirPrompt: 'どの方向？ (テンキー 8 4 6 2、斜めは 7 9 1 3。0 でやめる)', cannotMove: 'そちらへは動けない',
  yum: 'うまい{f}だった', yuk: 'まずい食べ物だ', notFood: 'それは食べられない',
  fruit: 'ねばねばの実',
  wearing: '{i} を着た', wielding: '{i} を持った', cursed: 'できない。呪われているようだ',
  armorOff: '{i} を脱いだ', noArmor: '鎧を着ていない', alreadyArmor: 'もう着ている。先に脱ぐこと',
  ringOn: '{i} をはめた', ringOff: '{i} を外した', noRing: '指輪をしていない', twoRings: '両手とも指輪をしている',
  dropped: '{i} を置いた', noRoom: 'そこにはもう何かある',
  nothing: '何も起きない', searching: '調べている…', foundDoor: '隠し扉を見つけた',
  trap_door: '落とし穴に落ちた！', trap_arrow: '矢が当たった', trap_arrowMiss: '矢がかすめた', trap_sleep: '白い霧に包まれて眠ってしまった', trap_bear: 'トラばさみにかかった', trap_tele: '別の場所にいる', trap_dart: '小さな矢が肩に刺さった', trap_dartMiss: '小さな矢が耳をかすめた', trap_rust: '水を浴びた',
  rust: '鎧が弱くなった', rustSafe: 'さびはすぐに消えた', frozen: '{m}に凍らされた', str: '足を噛まれて力が抜けた', strSafe: '噛まれたがすぐ治った', drain: '急に弱くなった気がする', stolen: '財布が軽くなった', nymph: '{i} を盗まれた！', held: '{m}につかまった', confuse: '{m}の視線で混乱した', breath: '{m}が炎を吐いた！',
  p_conf: 'あれ？ここはどこ？', p_hall: 'おお！すべてが宇宙的だ！', p_poison: 'ひどく気分が悪い', p_str: '力がみなぎる！', p_see: 'ねばねばの実のジュースの味がする', p_heal: '傷が癒えていく', p_mdet: '怪物の気配を感じる', p_mdetNo: '一瞬、奇妙な感じがした', p_odet: '魔法の気配を感じる', p_raise: '急に腕が上がった気がする', p_xheal: '傷がすっかり癒えていく', p_haste: '体がとても速く動く', p_restore: '力が元に戻った', p_blind: '闇に包まれた', p_lev: '宙に浮き始めた',
  blindEnd: '闇が晴れた', confEnd: '混乱がおさまった', hasteEnd: '動きが元に戻った', levEnd: 'そっと地面に降りた', hallEnd: 'すべてが退屈に見える',
  blindNoRead: '目が見えないので読めない',
  s_conf: '手が赤く光り始めた', s_map: '巻物に地図が描いてある', s_hold: '周りの怪物が凍りついた', s_sleep: '眠ってしまった', s_earm: '鎧が銀色に光った', s_id: 'これは識別の巻物だ', s_idWhich: 'どれを識別する？', s_scare: '遠くで狂ったような笑い声がした', s_food: '鼻がむずむずして食べ物の匂いがする', s_foodNo: '鼻がむずむずする', s_tele: '別の場所にいる', s_eweap: '武器が青く光った', s_create: 'かすかな苦悶の声が聞こえた', s_curse: '誰かに見守られている気がする', s_agg: '高い音が響いた', s_prot: '鎧が金色の盾に包まれた', s_noArm: '奇妙な喪失感がある', s_noWeap: '手がぴりぴりする',
  z_light: '通路が光って消えた', z_lightRoom: '部屋が明るくなった', z_bolt: '{b}が{m}に命中', z_boltMiss: '{b}は{m}に外れた', z_none: '光線は消えた', z_noCharge: '何も起きない', z_tele: '{m}は消えた', z_poly: '{m}の姿が変わった', z_slow: '{m}の動きが遅くなった', z_haste: '{m}の動きが速くなった', z_invis: '{m}の姿が見えなくなった', z_cancel: '{m}の力が失われた', z_drain: '生命力が流れ出た', z_drainNo: 'ぴりぴりする',
  thrownHit: '{i} が{m}に命中', thrownMiss: '{i} は{m}に外れた',
  invTitle: '持ち物: (何かキーを押す)', invEmpty: '何も持っていない', inHand: '手に持っている', onBody: '着ている', leftHand: '左手', rightHand: '右手',
  amulet: 'イェンダーの魔除け',
  quit: '本当にやめますか？ (y/n)',
  rip: '安らかに眠れ', ripKilled: '{m} に殺された', ripOn: '{l} 階にて', ripGold: '金貨 {g} 枚', hunger: '飢え', ripQuit: '途中でやめた', trap: '罠',
  win: 'イェンダーの魔除けを持って、運命の迷宮から脱出した！', winScore: '金貨 {g} 枚。Enter でもう一度。', again: 'Enter でもう一度。',
  btnHelp: 'ヘルプ', sheet: `テンキー  7 階段を下りる  8 上    9 階段を上がる  0 探す
          4 左          5 休む  6 右
          1 拾う        2 下    3 メニュー（押すたびに次のメニュー）`,
  nothingHere: 'ここには何もない', menuKeys: '3 次のメニュー  8/2 選ぶ  5 決定  0 閉じる', menuRun: '5 で実行します。',
  m_pack: '持ち物', m_quaff: '薬を飲む', m_read: '巻物を読む', m_eat: '食べる', m_wield: '武器を持つ', m_wear: '鎧を着る', m_off: '鎧を脱ぐ', m_ring: '指輪をはめる', m_ringOff: '指輪を外す', m_zap: '杖を振る', m_throw: '投げる', m_drop: '置く', m_help: 'ヘルプ', m_quit: 'やめる',
  help: `Rogue の遊び方

あなたは @ です。階段(%)で26階まで下りて魔除け(,)を取り、地上まで戻ります。
命は1つだけです。セーブはありません。

テンキー    7 階段を下りる  8 上    9 階段を上がる
            4 左            5 休む  6 右
            1 拾う          2 下    3 メニュー     0 探す
            矢印キーでも動けます。2つ同時に押すと斜めです。

戦う        怪物（A〜Zの大文字）にぶつかると攻撃します。
拾う        物の上を歩くと拾います。
階段        % の上で 7 を押すと下ります。
            9 で上がります（魔除けが必要です）。
行き止まり  0 を何度か押すと、隠し扉を探せます。
HPが少ない  5 で休むか、薬を飲みます。
空腹        飢え死にする前にメニューから食べます。

メニュー    3 で持ち物が開きます。もう一度 3 で次のメニューに変わります。
            持ち物、薬を飲む、巻物を読む、食べる、武器を持つ、鎧を着る、鎧を脱ぐ、
            指輪をはめる、指輪を外す、杖を振る、投げる、置く、ヘルプ、やめる
            8 と 2 で選び、5 で決定、0 で閉じます。
            投げる時や杖の方向は 8 4 6 2。斜めは 7 9 1 3。

昔の文字キーも使えます: h j k l y u b n, i q r e w W T P R z t d s Q > <

画面の記号
  @ 自分   A-Z 怪物   % 階段   + 扉    # 通路
  * 金     : 食べ物   ! 薬     ? 巻物  ) 武器
  ] 鎧     = 指輪     / 杖     ^ 罠    , 魔除け

名前の分からない薬や巻物は、使うと正体が分かります。

何かキーを押すと戻ります。`,
},
};
// アイテムと怪物の名前。[英語, 日本語]
var ROGUE_NAMES = {
  monsters: { aquator: 'アクアター', bat: 'コウモリ', centaur: 'ケンタウロス', dragon: 'ドラゴン', emu: 'エミュー', 'venus flytrap': 'ハエトリグサ', griffin: 'グリフィン', hobgoblin: 'ホブゴブリン', 'ice monster': 'アイスモンスター', jabberwock: 'ジャバウォック', kestrel: 'チョウゲンボウ', leprechaun: 'レプラコーン', medusa: 'メデューサ', nymph: 'ニンフ', orc: 'オーク', phantom: 'ファントム', quagga: 'クアッガ', rattlesnake: 'ガラガラヘビ', snake: 'ヘビ', troll: 'トロル', 'black unicorn': '黒いユニコーン', vampire: 'バンパイア', wraith: 'レイス', xeroc: 'ゼロック', yeti: 'イエティ', zombie: 'ゾンビ' },
  potion: { confusion: '混乱', hallucination: '幻覚', poison: '毒', 'gain strength': '力増強', 'see invisible': '透明視', healing: '回復', 'monster detection': '怪物探知', 'magic detection': '魔法探知', 'raise level': 'レベル上昇', 'extra healing': '大回復', 'haste self': '加速', 'restore strength': '力回復', blindness: '盲目', levitation: '浮遊' },
  scroll: { 'monster confusion': '怪物混乱', 'magic mapping': '地図', 'hold monster': '金縛り', sleep: '睡眠', 'enchant armor': '鎧強化', 'identify potion': '薬識別', 'identify scroll': '巻物識別', 'identify weapon': '武器識別', 'identify armor': '鎧識別', 'identify ring, wand or staff': '指輪と杖の識別', 'scare monster': '怪物恐怖', 'food detection': '食料探知', teleportation: '瞬間移動', 'enchant weapon': '武器強化', 'create monster': '怪物召喚', 'remove curse': '解呪', 'aggravate monsters': '怪物覚醒', 'protect armor': '鎧保護' },
  ring: { protection: '防御', 'add strength': '力', 'sustain strength': '力維持', searching: '探索', 'see invisible': '透明視', adornment: '飾り', 'aggravate monster': '怪物覚醒', dexterity: '器用', 'increase damage': '打撃', regeneration: '再生', 'slow digestion': '遅い消化', teleportation: '瞬間移動', stealth: '忍び足', 'maintain armor': '鎧維持' },
  stick: { light: '光', invisibility: '透明化', lightning: '雷', fire: '炎', cold: '冷気', polymorph: '変身', 'magic missile': '魔法の矢', 'haste monster': '怪物加速', 'slow monster': '怪物減速', 'drain life': '生命吸収', nothing: '無', 'teleport away': '遠ざけ', 'teleport to': '引き寄せ', cancellation: '無効化' },
  weapon: { mace: 'メイス', 'long sword': '長剣', 'short bow': '短弓', arrow: '矢', dagger: '短剣', 'two handed sword': '両手剣', dart: 'ダーツ', shuriken: '手裏剣', spear: '槍' },
  armor: { 'leather armor': '革鎧', 'ring mail': 'リングメイル', 'studded leather armor': '鋲付き革鎧', 'scale mail': 'スケイルメイル', 'chain mail': 'チェインメイル', 'splint mail': 'スプリントメイル', 'banded mail': 'バンデッドメイル', 'plate mail': 'プレートメイル' },
  colors: [['amber', '琥珀色'], ['aquamarine', '藍玉色'], ['black', '黒'], ['blue', '青'], ['brown', '茶色'], ['clear', '透明'], ['crimson', '深紅'], ['cyan', '水色'], ['ecru', '生成り色'], ['gold', '金色'], ['green', '緑'], ['grey', '灰色'], ['magenta', '赤紫'], ['orange', '橙色'], ['pink', '桃色'], ['plaid', '格子模様'], ['purple', '紫'], ['red', '赤'], ['silver', '銀色'], ['tan', '黄褐色'], ['tangerine', 'みかん色'], ['topaz', '黄玉色'], ['turquoise', '青緑'], ['vermilion', '朱色'], ['violet', '菫色'], ['white', '白'], ['yellow', '黄色']],
  stones: [['agate', 'めのう'], ['alexandrite', 'アレキサンドライト'], ['amethyst', 'アメジスト'], ['carnelian', 'カーネリアン'], ['diamond', 'ダイヤ'], ['emerald', 'エメラルド'], ['germanium', 'ゲルマニウム'], ['granite', '花崗岩'], ['garnet', 'ガーネット'], ['jade', 'ひすい'], ['kryptonite', 'クリプトナイト'], ['lapis lazuli', 'ラピスラズリ'], ['moonstone', '月長石'], ['obsidian', '黒曜石'], ['onyx', 'オニキス'], ['opal', 'オパール'], ['pearl', '真珠'], ['peridot', 'ペリドット'], ['ruby', 'ルビー'], ['sapphire', 'サファイア'], ['stibotantalite', 'スチボタンタライト'], ['tiger eye', '虎目石'], ['topaz', 'トパーズ'], ['turquoise', 'トルコ石'], ['taaffeite', 'ターフェアイト'], ['zircon', 'ジルコン']],
  woods: [['avocado wood', 'アボカド'], ['balsa', 'バルサ'], ['bamboo', '竹'], ['banyan', 'バンヤン'], ['birch', '樺'], ['cedar', '杉'], ['cherry', '桜'], ['cinnibar', '辰砂'], ['cypress', '糸杉'], ['dogwood', 'ハナミズキ'], ['driftwood', '流木'], ['ebony', '黒檀'], ['elm', '楡'], ['eucalyptus', 'ユーカリ'], ['fall', '滝'], ['hemlock', 'ツガ'], ['holly', 'ヒイラギ'], ['ironwood', '鉄木'], ['kukui wood', 'ククイ'], ['mahogany', 'マホガニー'], ['manzanita', 'マンザニータ'], ['maple', '楓'], ['oaken', '樫'], ['persimmon wood', '柿'], ['pecan', 'ペカン'], ['pine', '松'], ['poplar', 'ポプラ'], ['redwood', 'セコイア'], ['rosewood', '紫檀'], ['spruce', 'トウヒ'], ['teak', 'チーク'], ['walnut', 'クルミ'], ['zebrawood', 'ゼブラウッド']],
  syl: ['a', 'ab', 'ag', 'aks', 'ala', 'an', 'app', 'arg', 'arze', 'ash', 'bek', 'bie', 'bit', 'bjor', 'blu', 'bot', 'bu', 'byt', 'comp', 'con', 'cos', 'cre', 'dalf', 'dan', 'den', 'do', 'e', 'eep', 'el', 'eng', 'er', 'ere', 'erk', 'esh', 'evs', 'fa', 'fid', 'fri', 'fu', 'gan', 'gar', 'glen', 'gop', 'gre', 'ha', 'hyd', 'i', 'ing', 'ip', 'ish', 'it', 'ite', 'iv', 'jo', 'kho', 'kli', 'klis', 'la', 'lech', 'mar', 'me', 'mi', 'mic', 'mik', 'mon', 'mung', 'mur', 'nej', 'nelg', 'nep', 'ner', 'nes', 'nes', 'nih', 'nin', 'o', 'od', 'ood', 'org', 'orn', 'ox', 'oxy', 'pay', 'ple', 'plu', 'po', 'pot', 'prok', 're', 'rea', 'rhov', 'ri', 'ro', 'rog', 'rok', 'rol', 'sa', 'san', 'sat', 'sef', 'seh', 'shu', 'ski', 'sna', 'sne', 'snik', 'sno', 'so', 'sol', 'sri', 'sta', 'sun', 'ta', 'tab', 'tem', 'ther', 'ti', 'tox', 'trol', 'tue', 'turs', 'u', 'ulk', 'um', 'un', 'uni', 'ur', 'val', 'viv', 'vly', 'vom', 'wah', 'wed', 'werg', 'wex', 'whon', 'wun', 'xo', 'y', 'yot', 'yu', 'zant', 'zeb', 'zim', 'zok', 'zon', 'zum'],
};
