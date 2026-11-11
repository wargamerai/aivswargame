// Additional locales. Each row follows the order of ROGUE_EXTRA_LOCALES.
const ROGUE_EXTRA_LOCALES = ['fr', 'de', 'it', 'es', 'zh', 'ko', 'ru'];
const ROGUE_LANGUAGES = {
  ja: '日本語', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano',
  es: 'Español', zh: '简体中文', ko: '한국어', ru: 'Русский',
};
function rogueLocaleRows(rows, add) {
  for (const row of rows.trim().split('\n')) {
    const [key, ...values] = row.split('|');
    if (values.length !== ROGUE_EXTRA_LOCALES.length) throw new Error('Rogue locale row: ' + key);
    ROGUE_EXTRA_LOCALES.forEach((lang, i) => add(lang, key, values[i]));
  }
}
ROGUE_EXTRA_LOCALES.forEach(lang => { ROGUE_TEXT[lang] = { hint: '' }; });
rogueLocaleRows(`
top|Accueil|Startseite|Pagina iniziale|Inicio|返回主页|홈으로|Главная
more|— Suite —|— Weiter —|— Continua —|— Más —|— 继续 —|— 계속 —|— Далее —
status|Étage {l}  Or {g}  PV {h}({m})  For {s}({ms})  Arm {a}  Exp {e}/{x}|Ebene {l}  Gold {g}  LP {h}({m})  Stä {s}({ms})  Rüst {a}  Erf {e}/{x}|Piano {l}  Oro {g}  PF {h}({m})  For {s}({ms})  Arm {a}  Esp {e}/{x}|Piso {l}  Oro {g}  PV {h}({m})  Fue {s}({ms})  Arm {a}  Exp {e}/{x}|层 {l}  金 {g}  生命 {h}({m})  力量 {s}({ms})  防御 {a}  经验 {e}/{x}|층 {l}  금 {g}  체력 {h}({m})  힘 {s}({ms})  방어 {a}  경험 {e}/{x}|Этаж {l}  Золото {g}  ОЗ {h}({m})  Сила {s}({ms})  Броня {a}  Опыт {e}/{x}
hungry|Faim|Hungrig|Fame|Hambre|饥饿|배고픔|Голод
weak|Faiblesse|Schwach|Debolezza|Debilidad|虚弱|쇠약|Слабость
faint|Évanouissement|Ohnmacht|Svenimento|Desmayo|昏厥|기절|Обморок
welcome|Bienvenue dans les Donjons du Destin, aventurier !|Willkommen in den Verliesen des Verderbens!|Benvenuto nei Sotterranei del Destino, avventuriero!|¡Bienvenido a las Mazmorras del Destino!|冒险者，欢迎来到末日地牢！|모험가여, 파멸의 던전에 온 것을 환영합니다!|Добро пожаловать в Подземелья Рока!
noStairs|Pas d’escalier pour descendre ici.|Hier führt keine Treppe hinab.|Qui non ci sono scale per scendere.|Aquí no hay escaleras para bajar.|这里没有下行楼梯。|여기에는 내려가는 계단이 없습니다.|Здесь нет лестницы вниз.
noUp|Pas d’escalier pour remonter ici.|Hier führt keine Treppe hinauf.|Qui non ci sono scale per salire.|Aquí no hay escaleras para subir.|这里没有上行楼梯。|여기에는 올라가는 계단이 없습니다.|Здесь нет лестницы вверх.
needAmulet|La magie vous bloque le passage.|Magie versperrt dir den Weg.|La magia ti blocca il passaggio.|La magia te impide el paso.|魔法挡住了去路。|마법이 길을 막고 있습니다.|Магия преграждает путь.
gold|Vous trouvez {n} pièces d’or|Du findest {n} Goldmünzen|Trovi {n} monete d’oro|Encuentras {n} monedas de oro|找到 {n} 枚金币|금화 {n}개를 찾았습니다|Найдено золото: {n}
got|Vous ramassez {i} ({k})|Du nimmst {i} ({k}) auf|Raccogli {i} ({k})|Recoges {i} ({k})|获得 {i}（{k}）|{i} 획득 ({k})|Подобрано: {i} ({k})
packFull|Votre sac est plein|Dein Rucksack ist voll|Lo zaino è pieno|Tu mochila está llena|背包已满|배낭이 가득 찼습니다|Рюкзак полон
seeHere|Vous voyez {i} ici|Hier siehst du: {i}|Qui vedi {i}|Aquí ves {i}|这里有 {i}|여기에 {i} 있음|Здесь лежит {i}
moved|Vous marchez sur {i}|Du trittst auf {i}|Passi sopra {i}|Pasas por encima de {i}|踩到了 {i}|{i} 위로 이동했습니다|Вы наступили на предмет: {i}
hitYou|{m} vous touche|{m} trifft dich|{m} ti colpisce|{m} te alcanza|{m} 击中了你|{m}의 공격에 맞았습니다|Вас поразил противник: {m}
missYou|{m} vous rate|{m} verfehlt dich|{m} ti manca|{m} falla el ataque|{m} 没有击中你|{m}의 공격이 빗나갔습니다|Противник {m} промахивается
youHit|Vous touchez la créature : {m}|Du triffst das Monster: {m}|Colpisci il mostro: {m}|Golpeas al monstruo: {m}|你击中了 {m}|{m}에게 명중했습니다|Вы попадаете по цели: {m}
youMiss|Vous ratez la créature : {m}|Du verfehlst das Monster: {m}|Manchi il mostro: {m}|Fallas el ataque contra {m}|你没有击中 {m}|{m}에 대한 공격이 빗나갔습니다|Вы промахиваетесь. Цель: {m}
youKill|Vous terrassez la créature : {m}|Du besiegst das Monster: {m}|Sconfiggi il mostro: {m}|Derrotas al monstruo: {m}|你击败了 {m}|{m} 처치|Повержен противник: {m}
levelUp|Vous passez au niveau {n}|Du erreichst Stufe {n}|Raggiungi il livello {n}|Subes al nivel {n}|升到了 {n} 级|레벨 {n}에 도달했습니다|Достигнут уровень {n}
hungryMsg|Vous commencez à avoir faim|Du bekommst Hunger|Inizi ad avere fame|Empiezas a tener hambre|你开始感到饥饿|배가 고파지기 시작합니다|Вы начинаете голодать
weakMsg|La faim vous affaiblit|Der Hunger schwächt dich|La fame ti indebolisce|El hambre te debilita|饥饿让你虚弱|굶주림으로 힘이 빠집니다|Голод отнимает силы
faintMsg|Vous vous évanouissez de faim|Du wirst vor Hunger ohnmächtig|Svieni per la fame|Te desmayas de hambre|你饿晕了|굶주림으로 쓰러졌습니다|Вы теряете сознание от голода
stuckMsg|Vous êtes immobilisé|Du wirst festgehalten|Sei immobilizzato|Te tienen inmovilizado|你被困住了|붙잡혀 움직일 수 없습니다|Вас удерживают
noItem|Vous n’avez rien d’approprié|Du hast nichts Passendes|Non hai nulla di adatto|No tienes nada adecuado|没有合适的物品|적합한 물건이 없습니다|Нет подходящих предметов
prompt|Quel objet voulez-vous {v} ? (lettre, Échap pour annuler)|Welchen Gegenstand willst du {v}? (Buchstabe, Esc bricht ab)|Quale oggetto vuoi {v}? (lettera, Esc per annullare)|¿Qué quieres {v}? (letra, Esc para cancelar)|要{v}哪个物品？（按字母键，Esc 取消）|어떤 물건을 사용할까요? ({v}, 문자 키, Esc 취소)|Что вы хотите {v}? (буква, Esc — отмена)
badItem|Objet non valide|Ungültiger Gegenstand|Oggetto non valido|Objeto no válido|无效物品|선택할 수 없는 물건입니다|Нельзя выбрать этот предмет
v_quaff|boire|trinken|bere|beber|喝|마시기|выпить
v_read|lire|lesen|leggere|leer|读|읽기|прочесть
v_eat|manger|essen|mangiare|comer|吃|먹기|съесть
v_wield|prendre en main|führen|impugnare|empuñar|装备|들기|взять в руку
v_wear|revêtir|anziehen|indossare|vestir|穿上|입기|надеть
v_put|passer au doigt|anstecken|infilare al dito|ponerte|戴上|끼기|надеть
v_drop|déposer|ablegen|lasciare|soltar|丢弃|버리기|бросить
v_throw|lancer|werfen|lanciare|lanzar|投掷|던지기|метнуть
v_zap|activer|einsetzen|attivare|activar|使用|사용하기|применить
dirPrompt|Direction ? (8 4 6 2, diagonales 7 9 1 3, 0 annule)|Richtung? (8 4 6 2, diagonal 7 9 1 3, 0 bricht ab)|Direzione? (8 4 6 2, diagonali 7 9 1 3, 0 annulla)|¿Dirección? (8 4 6 2, diagonales 7 9 1 3, 0 cancela)|方向？（8 4 6 2，斜向 7 9 1 3，0 取消）|방향? (8 4 6 2, 대각선 7 9 1 3, 0 취소)|Направление? (8 4 6 2, диагонали 7 9 1 3, 0 — отмена)
cannotMove|Impossible d’aller par là|Dort kannst du nicht entlang|Non puoi andare da quella parte|No puedes ir por ahí|无法向那里移动|그쪽으로 갈 수 없습니다|Туда нельзя пройти
yum|Délicieux ! ({f})|Lecker! ({f})|Che bontà! ({f})|¡Qué rico! ({f})|真好吃！（{f}）|맛있다! ({f})|Вкусно! ({f})
yuk|Beurk, c’est infect|Igitt, das schmeckt furchtbar|Bleah, che schifo|Puaj, esto sabe fatal|呸，真难吃|으, 맛이 끔찍합니다|Фу, какая гадость
notFood|Ce n’est pas comestible|Das ist nicht essbar|Non è commestibile|Eso no se puede comer|这不能吃|먹을 수 없습니다|Это несъедобно
fruit|moisissure visqueuse|Schleimpilz|muffa vischiosa|moho viscoso|黏菌|점균|слизевик
wearing|Armure enfilée : {i}|Angezogen: {i}|Armatura indossata: {i}|Armadura puesta: {i}|穿上了 {i}|{i} 착용|Надета броня: {i}
wielding|Arme en main : {i}|In der Hand: {i}|Arma impugnata: {i}|Arma empuñada: {i}|装备了 {i}|{i} 장비|Оружие в руке: {i}
cursed|Impossible. L’objet semble maudit.|Das geht nicht. Der Gegenstand ist wohl verflucht.|Impossibile. Sembra maledetto.|No puedes. Parece estar maldito.|不能这样做，物品似乎被诅咒了。|할 수 없습니다. 저주받은 것 같습니다.|Не получается. Похоже, предмет проклят.
armorOff|Armure retirée : {i}|Ausgezogen: {i}|Armatura tolta: {i}|Armadura quitada: {i}|脱下了 {i}|{i} 벗음|Снята броня: {i}
noArmor|Vous ne portez pas d’armure|Du trägst keine Rüstung|Non indossi un’armatura|No llevas armadura|没有穿护甲|갑옷을 입고 있지 않습니다|На вас нет брони
alreadyArmor|Retirez d’abord l’armure que vous portez|Zieh zuerst deine Rüstung aus|Togli prima l’armatura che indossi|Quítate primero la armadura que llevas|请先脱下身上的护甲|입고 있는 갑옷을 먼저 벗으세요|Сначала снимите надетую броню
ringOn|Bague mise : {i}|Angesteckt: {i}|Anello indossato: {i}|Anillo puesto: {i}|戴上了 {i}|{i} 착용|Надето кольцо: {i}
ringOff|Bague retirée : {i}|Ring abgezogen: {i}|Anello tolto: {i}|Anillo quitado: {i}|摘下了 {i}|{i} 벗음|Снято кольцо: {i}
noRing|Vous ne portez aucune bague|Du trägst keinen Ring|Non indossi anelli|No llevas anillos|没有戴戒指|끼고 있는 반지가 없습니다|На вас нет колец
twoRings|Vous portez déjà une bague à chaque main|Du trägst schon an jeder Hand einen Ring|Porti già un anello per mano|Ya llevas un anillo en cada mano|两只手都已戴上戒指|양손에 이미 반지를 끼고 있습니다|На каждой руке уже есть кольцо
dropped|Objet déposé : {i}|Abgelegt: {i}|Oggetto lasciato: {i}|Objeto soltado: {i}|丢下了 {i}|{i} 내려놓음|Оставлен предмет: {i}
noRoom|Il y a déjà quelque chose ici|Hier liegt schon etwas|Qui c’è già qualcosa|Aquí ya hay algo|这里已经有东西|이미 무언가 있습니다|Здесь уже что-то лежит
nothing|Il ne se passe rien|Nichts passiert|Non succede nulla|No pasa nada|什么也没发生|아무 일도 일어나지 않습니다|Ничего не происходит
searching|Vous fouillez…|Du suchst …|Cerchi…|Estás buscando…|正在搜索……|수색 중…|Вы ищете…
foundDoor|Vous trouvez une porte secrète|Du findest eine Geheimtür|Trovi una porta segreta|Encuentras una puerta secreta|发现了一扇暗门|비밀문을 찾았습니다|Найдена потайная дверь
trap_door|Vous tombez dans une trappe !|Du fällst durch eine Falltür!|Cadi in una botola!|¡Caes por una trampilla!|你掉进了活板门！|함정문 아래로 떨어졌습니다!|Вы провалились в люк!
trap_arrow|Une flèche vous touche|Ein Pfeil trifft dich|Una freccia ti colpisce|Una flecha te alcanza|一支箭射中了你|화살에 맞았습니다|Вас поражает стрела
trap_arrowMiss|Une flèche vous frôle|Ein Pfeil zischt vorbei|Una freccia ti sfiora|Una flecha pasa rozándote|一支箭从身旁掠过|화살이 스쳐 지나갔습니다|Стрела пролетает мимо
trap_sleep|Une brume blanche vous endort|Weißer Nebel schläfert dich ein|Una nebbia bianca ti fa addormentare|Una niebla blanca te hace dormir|白雾使你沉睡|흰 안개에 휩싸여 잠들었습니다|Белый туман усыпляет вас
trap_bear|Un piège à ours vous retient|Du sitzt in einer Bärenfalle fest|Sei preso in una tagliola|Caes en un cepo para osos|你被捕兽夹夹住了|곰덫에 걸렸습니다|Вы попали в капкан
trap_tele|Vous vous retrouvez ailleurs|Du findest dich woanders wieder|Ti ritrovi altrove|Apareces en otro lugar|你出现在另一个地方|다른 곳으로 옮겨졌습니다|Вы оказываетесь в другом месте
trap_dart|Une fléchette vous atteint à l’épaule|Ein Wurfpfeil trifft dich an der Schulter|Un dardo ti colpisce alla spalla|Un dardo te alcanza en el hombro|一枚飞镖刺中了肩膀|작은 다트가 어깨에 박혔습니다|Дротик попадает вам в плечо
trap_dartMiss|Une fléchette siffle près de votre oreille|Ein Wurfpfeil zischt am Ohr vorbei|Un dardo ti sibila vicino all’orecchio|Un dardo te silba junto al oído|一枚飞镖从耳边飞过|작은 다트가 귀 옆을 스쳤습니다|Дротик свистит мимо уха
trap_rust|Un jet d’eau vous frappe|Ein Wasserschwall trifft dich|Un getto d’acqua ti investe|Te alcanza un chorro de agua|一股水喷到了你身上|물이 쏟아졌습니다|На вас обрушивается струя воды
rust|Votre armure s’affaiblit|Deine Rüstung wird schwächer|L’armatura si indebolisce|Tu armadura se debilita|护甲受损了|갑옷이 약해졌습니다|Ваша броня ослабевает
rustSafe|La rouille disparaît aussitôt|Der Rost verschwindet sofort|La ruggine sparisce subito|El óxido desaparece al instante|锈迹立刻消失了|녹이 즉시 사라졌습니다|Ржавчина тут же исчезает
frozen|{m} vous glace sur place|{m} friert dich ein|{m} ti congela|{m} te congela|{m} 冻住了你|{m} 때문에 얼어붙었습니다|Вас замораживает противник: {m}
str|Une morsure à la jambe vous affaiblit|Ein Biss ins Bein schwächt dich|Un morso alla gamba ti indebolisce|Una mordedura en la pierna te debilita|腿被咬了一口，力量减弱了|다리를 물려 힘이 약해졌습니다|Укус в ногу лишает вас сил
strSafe|Une morsure vous affaiblit un instant|Ein Biss schwächt dich kurz|Un morso ti indebolisce per un istante|Una mordedura te debilita un instante|被咬后短暂感到虚弱|물린 뒤 잠시 힘이 빠졌습니다|Укус ненадолго ослабляет вас
drain|Vous vous sentez soudain plus faible|Du fühlst dich plötzlich schwächer|Ti senti di colpo più debole|De repente te sientes más débil|你突然感到虚弱|갑자기 몸이 약해집니다|Вы внезапно слабеете
stolen|Votre bourse semble plus légère|Dein Geldbeutel fühlt sich leichter an|La borsa sembra più leggera|Tu bolsa parece más ligera|钱袋变轻了|돈주머니가 가벼워졌습니다|Ваш кошелёк полегчал
nymph|Elle vous vole {i} !|Sie hat {i} gestohlen!|Ti ha rubato {i}!|¡Te ha robado {i}!|她偷走了 {i}！|{i}을(를) 빼앗겼습니다!|Нимфа украла предмет: {i}!
held|{m} vous immobilise|{m} hält dich fest|{m} ti immobilizza|{m} te inmoviliza|{m} 缠住了你|{m}에게 붙잡혔습니다|Вас удерживает противник: {m}
confuse|Le regard de {m} vous désoriente|Der Blick von {m} verwirrt dich|Lo sguardo di {m} ti confonde|La mirada de {m} te confunde|{m} 的目光让你陷入混乱|{m}의 시선에 혼란에 빠졌습니다|Взгляд существа {m} сбивает вас с толку
breath|{m} crache du feu !|{m} speit Feuer!|{m} sputa fuoco!|¡{m} escupe fuego!|{m} 喷出了火焰！|{m}이(가) 불을 뿜습니다!|{m} извергает пламя!
`, (lang, key, value) => { ROGUE_TEXT[lang][key] = value; });
rogueLocaleRows(`
p_conf|Que se passe-t-il ? Qui suis-je ?|Was ist hier los? Wer bin ich?|Che succede? Chi sono?|¿Qué está pasando? ¿Quién soy?|怎么回事？我是谁？|무슨 일이죠? 나는 누구죠?|Что происходит? Кто я?
p_hall|Tout semble si cosmique !|Alles wirkt so kosmisch!|Tutto sembra così cosmico!|¡Todo parece tan cósmico!|一切都如此奇幻！|모든 것이 우주적으로 보입니다!|Всё кажется таким космическим!
p_poison|Vous vous sentez très malade|Dir wird sehr schlecht|Ti senti molto male|Te sientes muy mal|你感到非常难受|몸이 몹시 아픕니다|Вам очень плохо
p_str|Vos muscles se gonflent de force !|Du fühlst dich stärker!|Ti senti più forte!|¡Te sientes más fuerte!|你感到力量涌现！|힘이 솟아납니다!|Вы чувствуете прилив сил!
p_see|Cette potion a un goût de jus de moisissure|Der Trank schmeckt nach Schleimpilzsaft|Sa di succo di muffa vischiosa|Sabe a zumo de moho viscoso|这药水有黏菌汁的味道|점균 주스 맛이 납니다|Зелье на вкус как сок слизевика
p_heal|Vos blessures commencent à guérir|Deine Wunden beginnen zu heilen|Le ferite iniziano a guarire|Tus heridas empiezan a sanar|伤口开始愈合|상처가 낫기 시작합니다|Раны начинают заживать
p_mdet|Vous sentez la présence des monstres|Du spürst die Anwesenheit von Monstern|Avverti la presenza dei mostri|Percibes la presencia de monstruos|你感应到了怪物|괴물의 기척이 느껴집니다|Вы ощущаете присутствие чудовищ
p_mdetNo|Une sensation étrange vous traverse|Du hast kurz ein seltsames Gefühl|Provi una strana sensazione|Tienes una sensación extraña|你产生了一瞬间的奇妙感觉|잠시 이상한 느낌이 듭니다|Вас на миг охватывает странное чувство
p_odet|Vous sentez la magie|Du spürst Magie|Percepisci la magia|Percibes la magia|你感应到了魔法|마법의 기운이 느껴집니다|Вы ощущаете магию
p_raise|Vous vous sentez plus habile|Du fühlst dich geschickter|Ti senti più abile|Te sientes más hábil|你感到技艺精进|실력이 늘어난 것 같습니다|Вы чувствуете себя опытнее
p_xheal|Vos blessures guérissent davantage|Deine Wunden heilen deutlich|Le ferite guariscono molto meglio|Tus heridas sanan mucho más|伤口大幅愈合|상처가 크게 회복됩니다|Ваши раны быстро затягиваются
p_haste|Vous bougez beaucoup plus vite|Du bewegst dich viel schneller|Ti muovi molto più in fretta|Te mueves mucho más rápido|你的动作变快了|움직임이 훨씬 빨라집니다|Вы двигаетесь гораздо быстрее
p_restore|Une douce chaleur vous rend vos forces|Wärme durchströmt dich und gibt dir Kraft|Un calore ti restituisce le forze|Un calor te devuelve las fuerzas|暖流恢复了你的力量|온기가 퍼지며 힘이 회복됩니다|Приятное тепло возвращает вам силы
p_blind|L’obscurité vous enveloppe|Dunkelheit umhüllt dich|L’oscurità ti avvolge|La oscuridad te envuelve|黑暗笼罩了你|어둠에 휩싸입니다|Вас окутывает тьма
p_lev|Vous commencez à flotter|Du beginnst zu schweben|Inizi a fluttuare|Empiezas a flotar|你开始浮在空中|공중에 떠오르기 시작합니다|Вы начинаете парить
blindEnd|Le voile d’obscurité se lève|Der Schleier der Dunkelheit hebt sich|Il velo di oscurità si solleva|El velo de oscuridad se levanta|黑暗消散了|어둠이 걷혔습니다|Пелена тьмы рассеивается
confEnd|Votre esprit s’éclaircit|Dein Kopf wird wieder klar|La mente si schiarisce|Tu mente se despeja|混乱消退了|혼란이 가라앉았습니다|Сознание проясняется
hasteEnd|Vos mouvements ralentissent|Du wirst wieder langsamer|I movimenti rallentano|Tus movimientos se ralentizan|动作恢复正常|움직임이 느려졌습니다|Ваши движения замедляются
levEnd|Vous redescendez doucement au sol|Du schwebst sanft zu Boden|Scendi dolcemente a terra|Desciendes suavemente al suelo|你轻轻落回地面|사뿐히 땅에 내려왔습니다|Вы мягко опускаетесь на землю
hallEnd|Tout semble terriblement banal|Alles wirkt wieder langweilig|Tutto sembra di nuovo noioso|Todo vuelve a parecer aburrido|一切又变得平淡了|모든 것이 다시 지루해 보입니다|Всё снова кажется скучным
blindNoRead|Impossible de lire sans voir|Blind kannst du nicht lesen|Non puoi leggere alla cieca|No puedes leer sin ver|失明时无法阅读|앞이 보이지 않아 읽을 수 없습니다|Вы не можете читать вслепую
s_conf|Vos mains brillent d’une lueur rouge|Deine Hände leuchten rot|Le mani iniziano a brillare di rosso|Tus manos brillan de rojo|双手泛起红光|손에서 붉은 빛이 납니다|Ваши руки начинают светиться красным
s_map|Ce parchemin porte une carte|Auf der Schriftrolle ist eine Karte|La pergamena contiene una mappa|El pergamino contiene un mapa|卷轴上绘有地图|두루마리에 지도가 있습니다|На свитке нарисована карта
s_hold|Les monstres autour de vous se figent|Die Monster um dich herum erstarren|I mostri attorno a te si bloccano|Los monstruos a tu alrededor se paralizan|周围的怪物被定住了|주위의 괴물들이 굳어버렸습니다|Чудовища вокруг вас застывают
s_sleep|Vous vous endormez|Du schläfst ein|Ti addormenti|Te duermes|你睡着了|잠이 들었습니다|Вы засыпаете
s_earm|Votre armure brille d’argent|Deine Rüstung leuchtet silbern|L’armatura brilla d’argento|Tu armadura brilla como la plata|护甲闪过银光|갑옷이 은빛으로 빛납니다|Ваша броня сияет серебром
s_id|C’est un parchemin d’identification|Das ist eine Schriftrolle der Identifikation|È una pergamena di identificazione|Es un pergamino de identificación|这是鉴定卷轴|감정의 두루마리입니다|Это свиток опознания
s_idWhich|Quel objet voulez-vous identifier ?|Was willst du identifizieren?|Cosa vuoi identificare?|¿Qué quieres identificar?|要鉴定什么？|무엇을 감정할까요?|Что вы хотите опознать?
s_scare|Un rire dément résonne au loin|In der Ferne ertönt irres Gelächter|Senti una risata folle in lontananza|Oyes una risa demente a lo lejos|远处传来疯狂的笑声|멀리서 미친 듯한 웃음소리가 들립니다|Вдалеке раздаётся безумный смех
s_food|Votre nez picote : vous sentez de la nourriture|Deine Nase kribbelt: Du riechst Essen|Il naso pizzica: senti odore di cibo|Te pica la nariz: hueles comida|鼻子发痒，你闻到了食物|코가 간질거리며 음식 냄새가 납니다|В носу щекочет: вы чуете еду
s_foodNo|Votre nez picote|Deine Nase kribbelt|Il naso pizzica|Te pica la nariz|鼻子发痒|코가 간질거립니다|У вас щекочет в носу
s_tele|Vous vous retrouvez ailleurs|Du findest dich woanders wieder|Ti ritrovi altrove|Apareces en otro lugar|你出现在另一个地方|다른 곳으로 옮겨졌습니다|Вы оказываетесь в другом месте
s_eweap|Votre arme brille d’une lueur bleue|Deine Waffe leuchtet blau|L’arma brilla di blu|Tu arma brilla de azul|武器闪过蓝光|무기가 푸르게 빛납니다|Ваше оружие светится синим
s_create|Un faible cri de douleur se fait entendre|Du hörst einen leisen Schmerzensschrei|Senti un debole grido di dolore|Oyes un débil grito de dolor|传来微弱的痛苦叫声|희미한 고통의 비명이 들립니다|Слышен слабый крик боли
s_curse|Vous vous sentez protégé|Du fühlst dich behütet|Ti senti protetto|Sientes que alguien te protege|你感到有人在守护你|누군가 지켜주는 것 같습니다|Вы чувствуете чью-то защиту
s_agg|Un bourdonnement aigu retentit|Du hörst ein schrilles Summen|Senti un ronzio acuto|Oyes un zumbido agudo|响起尖锐的嗡鸣声|날카로운 윙윙거림이 들립니다|Раздаётся пронзительное гудение
s_prot|Un bouclier doré scintille sur votre armure|Ein goldener Schild umgibt deine Rüstung|Uno scudo dorato avvolge l’armatura|Un escudo dorado envuelve tu armadura|金色护盾笼罩了护甲|갑옷이 황금빛 방패에 둘러싸입니다|Золотой щит окутывает вашу броню
s_noArm|Vous éprouvez un étrange sentiment de perte|Du empfindest einen seltsamen Verlust|Provi uno strano senso di perdita|Sientes una extraña sensación de pérdida|你感到莫名的失落|이상한 상실감이 듭니다|Вы чувствуете странную потерю
s_noWeap|Vos mains picotent|Deine Hände kribbeln|Le mani pizzicano|Te hormiguean las manos|双手发麻|손이 따끔거립니다|У вас покалывает в руках
z_light|Le couloir s’illumine puis s’assombrit|Der Gang leuchtet auf und wird wieder dunkel|Il corridoio si illumina, poi si oscura|El pasillo se ilumina y vuelve a oscurecerse|走廊亮起后又暗了下来|통로가 빛났다 어두워집니다|Коридор вспыхивает и снова темнеет
z_lightRoom|La pièce s’illumine|Der Raum wird hell|La stanza si illumina|La sala se ilumina|房间亮了起来|방이 밝아졌습니다|Комната освещена
z_bolt|Le rayon ({b}) touche {m}|Der Strahl ({b}) trifft {m}|Il raggio ({b}) colpisce {m}|El rayo ({b}) alcanza a {m}|{b} 击中了 {m}|{b} 광선이 {m}에게 명중|Луч ({b}) поражает цель: {m}
z_boltMiss|Le rayon ({b}) rate {m}|Der Strahl ({b}) verfehlt {m}|Il raggio ({b}) manca {m}|El rayo ({b}) no alcanza a {m}|{b} 没有击中 {m}|{b} 광선이 {m}을(를) 빗나감|Луч ({b}) пролетает мимо цели: {m}
z_none|Le rayon disparaît|Der Strahl verschwindet|Il raggio svanisce|El rayo desaparece|光束消失了|광선이 사라졌습니다|Луч исчезает
z_noCharge|Il ne se passe rien|Nichts passiert|Non succede nulla|No pasa nada|什么也没发生|아무 일도 일어나지 않습니다|Ничего не происходит
z_tele|{m} disparaît|{m} verschwindet|{m} scompare|{m} desaparece|{m} 消失了|{m}이(가) 사라졌습니다|Противник {m} исчезает
z_poly|{m} change de forme|{m} verändert seine Gestalt|{m} cambia forma|{m} cambia de forma|{m} 改变了形态|{m}의 모습이 변했습니다|Противник {m} меняет облик
z_slow|{m} ralentit|{m} wird langsamer|{m} rallenta|{m} se ralentiza|{m} 的动作变慢了|{m}의 움직임이 느려집니다|Противник {m} замедляется
z_haste|{m} accélère|{m} wird schneller|{m} accelera|{m} se acelera|{m} 的动作变快了|{m}의 움직임이 빨라집니다|Противник {m} ускоряется
z_invis|{m} devient invisible|{m} wird unsichtbar|{m} diventa invisibile|{m} se vuelve invisible|{m} 隐形了|{m}이(가) 보이지 않게 되었습니다|Противник {m} становится невидимым
z_cancel|{m} perd ses pouvoirs|{m} verliert seine Kräfte|{m} perde i suoi poteri|{m} pierde sus poderes|{m} 失去了能力|{m}의 힘이 사라졌습니다|Противник {m} теряет свои силы
z_drain|Vous sentez votre vie s’écouler|Du spürst, wie deine Lebenskraft schwindet|Senti la forza vitale abbandonarti|Sientes escapar tu fuerza vital|生命力正在流失|생명력이 빠져나갑니다|Вы чувствуете, как утекает жизнь
z_drainNo|Vous ressentez des picotements|Du spürst ein Kribbeln|Senti un formicolio|Sientes un hormigueo|你感到一阵刺麻|몸이 따끔거립니다|Вы чувствуете покалывание
thrownHit|{i} touche {m}|{i} trifft {m}|{i} colpisce {m}|{i} alcanza a {m}|{i} 击中了 {m}|{i}이(가) {m}에게 명중|Предмет {i} поражает цель: {m}
thrownMiss|{i} rate {m}|{i} verfehlt {m}|{i} manca {m}|{i} no alcanza a {m}|{i} 没有击中 {m}|{i}이(가) {m}을(를) 빗나감|Предмет {i} пролетает мимо цели: {m}
invTitle|Votre sac (appuyez sur une touche)|Dein Rucksack (beliebige Taste)|Il tuo zaino (premi un tasto)|Tu mochila (pulsa una tecla)|背包（按任意键返回）|배낭 (아무 키나 누르세요)|Рюкзак (нажмите любую клавишу)
invEmpty|Vous avez les mains vides|Du hast nichts dabei|Non hai nulla|No llevas nada|你什么也没带|아무것도 없습니다|У вас ничего нет
inHand|en main|in der Hand|in mano|en la mano|手持|손에 듦|в руке
onBody|porté|angezogen|indossato|puesto|已穿戴|착용 중|надето
leftHand|main gauche|linke Hand|mano sinistra|mano izquierda|左手|왼손|левая рука
rightHand|main droite|rechte Hand|mano destra|mano derecha|右手|오른손|правая рука
amulet|l’Amulette de Yendor|das Amulett von Yendor|l’Amuleto di Yendor|el Amuleto de Yendor|延多护符|옌도르의 부적|Амулет Йендора
quit|Vraiment abandonner ? (y/n)|Wirklich aufgeben? (y/n)|Vuoi davvero abbandonare? (y/n)|¿Seguro que quieres abandonar? (y/n)|真的要放弃吗？（y/n）|정말 포기할까요? (y/n)|Действительно выйти? (y/n)
rip|REPOSE EN PAIX|RUHE IN FRIEDEN|RIPOSA IN PACE|DESCANSA EN PAZ|安息吧|편히 잠드소서|ПОКОЙСЯ С МИРОМ
ripKilled|Mort causée par : {m}|Todesursache: {m}|Causa della morte: {m}|Causa de muerte: {m}|死因：{m}|사망 원인: {m}|Причина смерти: {m}
ripOn|à l’étage {l}|auf Ebene {l}|al piano {l}|en el piso {l}|在第 {l} 层|{l}층에서|на этаже {l}
ripGold|{g} pièces d’or|{g} Goldmünzen|{g} monete d’oro|{g} monedas de oro|{g} 枚金币|금화 {g}개|Золото: {g}
hunger|la famine|Verhungern|fame|inanición|饥饿|굶주림|голод
ripQuit|abandon|Aufgegeben|abbandono|abandono|放弃冒险|모험 포기|выход из игры
trap|un piège|Falle|trappola|trampa|陷阱|함정|ловушка
win|Vous vous échappez avec l’Amulette de Yendor !|Du entkommst mit dem Amulett von Yendor!|Fuggi con l’Amuleto di Yendor!|¡Escapas con el Amuleto de Yendor!|你带着延多护符逃出了地牢！|옌도르의 부적을 가지고 탈출했습니다!|Вы спаслись с Амулетом Йендора!
winScore|Or : {g}. Entrée pour rejouer.|Gold: {g}. Mit Enter neu spielen.|Oro: {g}. Premi Invio per ricominciare.|Oro: {g}. Pulsa Intro para volver a jugar.|金币 {g}。按 Enter 重新开始。|금화 {g}개. Enter로 다시 시작.|Золото: {g}. Enter — новая игра.
again|Entrée pour rejouer.|Mit Enter neu spielen.|Premi Invio per ricominciare.|Pulsa Intro para volver a jugar.|按 Enter 重新开始。|Enter로 다시 시작.|Enter — новая игра.
btnHelp|Aide|Hilfe|Aiuto|Ayuda|帮助|도움말|Помощь
nothingHere|Il n’y a rien ici|Hier liegt nichts|Qui non c’è nulla|Aquí no hay nada|这里什么也没有|여기에는 아무것도 없습니다|Здесь ничего нет
menuKeys|3 menu suivant  8/2 choisir  5 valider  0 fermer|3 nächstes Menü  8/2 wählen  5 OK  0 schließen|3 menu seguente  8/2 scegli  5 OK  0 chiudi|3 menú siguiente  8/2 elegir  5 aceptar  0 cerrar|3 下一菜单  8/2 选择  5 确认  0 关闭|3 다음 메뉴  8/2 선택  5 확인  0 닫기|3 след. меню  8/2 выбор  5 OK  0 закрыть
menuRun|Appuyez sur 5 pour exécuter.|Mit 5 ausführen.|Premi 5 per eseguire.|Pulsa 5 para ejecutar.|按 5 执行。|5를 눌러 실행하세요.|Нажмите 5 для выполнения.
m_pack|Sac|Rucksack|Zaino|Mochila|背包|배낭|Рюкзак
m_quaff|Boire une potion|Trank trinken|Bere una pozione|Beber una poción|喝药水|물약 마시기|Выпить зелье
m_read|Lire un parchemin|Schriftrolle lesen|Leggere una pergamena|Leer un pergamino|读卷轴|두루마리 읽기|Прочесть свиток
m_eat|Manger|Essen|Mangiare|Comer|吃东西|먹기|Поесть
m_wield|Prendre une arme|Waffe führen|Impugnare un’arma|Empuñar un arma|装备武器|무기 들기|Взять оружие
m_wear|Enfiler une armure|Rüstung anziehen|Indossare un’armatura|Ponerse armadura|穿护甲|갑옷 입기|Надеть броню
m_off|Retirer l’armure|Rüstung ausziehen|Togliere l’armatura|Quitarse la armadura|脱护甲|갑옷 벗기|Снять броню
m_ring|Mettre une bague|Ring anstecken|Mettere un anello|Ponerse un anillo|戴戒指|반지 끼기|Надеть кольцо
m_ringOff|Retirer une bague|Ring abziehen|Togliere un anello|Quitarse un anillo|摘戒指|반지 빼기|Снять кольцо
m_zap|Utiliser un bâton|Stab benutzen|Usare un bastone|Usar un bastón|使用法杖|지팡이 사용|Применить посох
m_throw|Lancer|Werfen|Lanciare|Lanzar|投掷|던지기|Метнуть
m_drop|Déposer|Ablegen|Lasciare|Soltar|丢弃|버리기|Бросить
m_help|Aide|Hilfe|Aiuto|Ayuda|帮助|도움말|Помощь
m_quit|Abandonner|Aufgeben|Abbandonare|Abandonar|放弃|포기|Выйти
`, (lang, key, value) => { ROGUE_TEXT[lang][key] = value; });
// Names follow the same order as the original tables.
var ROGUE_LOCAL_NAMES = {};
ROGUE_EXTRA_LOCALES.forEach(lang => { ROGUE_LOCAL_NAMES[lang] = {}; });
function rogueNameTable(group, rows) {
  const source = ROGUE_NAMES[group];
  const keys = Array.isArray(source) ? source.map(pair => pair[0]) : Object.keys(source);
  rows.forEach((row, i) => {
    const values = row.split(';');
    if (values.length !== keys.length) throw new Error('Rogue names: ' + group + '/' + i);
    ROGUE_LOCAL_NAMES[ROGUE_EXTRA_LOCALES[i]][group] = Object.fromEntries(keys.map((key, j) => [key, values[j]]));
  });
}
rogueNameTable('monsters', [
'aquator;chauve-souris;centaure;dragon;émeu;dionée;griffon;hobgobelin;monstre de glace;Jabberwock;crécerelle;leprechaun;Méduse;nymphe;orque;fantôme;quagga;serpent à sonnette;serpent;troll;licorne noire;vampire;spectre;xeroc;yéti;zombie',
'Aquator;Fledermaus;Zentaur;Drache;Emu;Venusfliegenfalle;Greif;Hobgoblin;Eismonster;Jabberwock;Turmfalke;Leprechaun;Medusa;Nymphe;Ork;Phantom;Quagga;Klapperschlange;Schlange;Troll;schwarzes Einhorn;Vampir;Geist;Xeroc;Yeti;Zombie',
'aquator;pipistrello;centauro;drago;emù;acchiappamosche;grifone;hobgoblin;mostro di ghiaccio;Jabberwock;gheppio;leprecauno;Medusa;ninfa;orco;fantasma;quagga;serpente a sonagli;serpente;troll;unicorno nero;vampiro;spettro;xeroc;yeti;zombi',
'aquator;murciélago;centauro;dragón;emú;atrapamoscas;grifo;hobgoblin;monstruo de hielo;Jabberwock;cernícalo;duende;Medusa;ninfa;orco;fantasma;cuaga;serpiente de cascabel;serpiente;trol;unicornio negro;vampiro;espectro;xeroc;yeti;zombi',
'水怪;蝙蝠;半人马;龙;鸸鹋;捕蝇草;狮鹫;大地精;冰怪;炸脖龙;红隼;妖精;美杜莎;宁芙;兽人;幻影;斑驴;响尾蛇;蛇;巨魔;黑独角兽;吸血鬼;怨灵;泽洛克;雪人;僵尸',
'아쿠아토르;박쥐;켄타우로스;드래곤;에뮤;파리지옥;그리핀;홉고블린;얼음 괴물;재버워크;황조롱이;레프러콘;메두사;님프;오크;유령;콰가;방울뱀;뱀;트롤;검은 유니콘;뱀파이어;망령;제로크;예티;좀비',
'акватор;летучая мышь;кентавр;дракон;эму;венерина мухоловка;грифон;хобгоблин;ледяное чудовище;Бармаглот;пустельга;лепрекон;медуза;нимфа;орк;фантом;квагга;гремучая змея;змея;тролль;чёрный единорог;вампир;призрак;ксерок;йети;зомби',
]);
rogueNameTable('potion', [
'confusion;hallucinations;poison;force accrue;vision de l’invisible;soins;détection des monstres;détection de la magie;gain de niveau;soins majeurs;vitesse;restauration de la force;cécité;lévitation',
'Verwirrung;Halluzination;Gift;Stärkesteigerung;Unsichtbares sehen;Heilung;Monsterortung;Magieortung;Stufenaufstieg;starker Heilung;Beschleunigung;Stärkewiederherstellung;Blindheit;Schweben',
'confusione;allucinazioni;veleno;forza maggiore;vista dell’invisibile;guarigione;rilevamento mostri;rilevamento magia;aumento di livello;guarigione maggiore;velocità;recupero della forza;cecità;levitazione',
'confusión;alucinaciones;veneno;aumento de fuerza;visión de lo invisible;curación;detección de monstruos;detección de magia;aumento de nivel;curación mayor;velocidad;restauración de fuerza;ceguera;levitación',
'混乱;幻觉;剧毒;增强力量;看破隐形;治疗;侦测怪物;侦测魔法;升级;强效治疗;加速;恢复力量;失明;漂浮',
'혼란;환각;독;힘 증가;투명 감지;치유;괴물 탐지;마법 탐지;레벨 상승;대치유;가속;힘 회복;실명;공중 부양',
'замешательство;галлюцинации;яд;усиление;зрение невидимого;исцеление;обнаружение чудовищ;обнаружение магии;повышение уровня;сильное исцеление;ускорение;восстановление силы;слепота;левитация',
]);
rogueNameTable('scroll', [
'confusion des monstres;cartographie magique;immobilisation des monstres;sommeil;enchantement d’armure;identification des potions;identification des parchemins;identification des armes;identification des armures;identification des bagues et bâtons;peur des monstres;détection de nourriture;téléportation;enchantement d’arme;création de monstre;désenvoûtement;éveil des monstres;protection d’armure',
'Monsterverwirrung;magische Karte;Monsterlähmung;Schlaf;Rüstungsverzauberung;Trankidentifikation;Schriftrollenidentifikation;Waffenidentifikation;Rüstungsidentifikation;Ring- und Stabidentifikation;Monsterschreck;Nahrungsortung;Teleportation;Waffenverzauberung;Monstererschaffung;Fluchbrechung;Monstererweckung;Rüstungsschutz',
'confusione dei mostri;mappa magica;blocca mostri;sonno;incanta armatura;identifica pozione;identifica pergamena;identifica arma;identifica armatura;identifica anello e bastone;spaventa mostri;rileva cibo;teletrasporto;incanta arma;crea mostro;rimuovi maledizione;risveglia mostri;proteggi armatura',
'confusión de monstruos;mapa mágico;parálisis de monstruos;sueño;encantamiento de armadura;identificación de pociones;identificación de pergaminos;identificación de armas;identificación de armaduras;identificación de anillos y bastones;terror de monstruos;detección de comida;teletransporte;encantamiento de armas;creación de monstruo;eliminación de maldiciones;despertar de monstruos;protección de armadura',
'怪物混乱;魔法地图;定身怪物;睡眠;强化护甲;鉴定药水;鉴定卷轴;鉴定武器;鉴定护甲;鉴定戒指与法杖;恐吓怪物;侦测食物;传送;强化武器;召唤怪物;解除诅咒;惊醒怪物;保护护甲',
'괴물 혼란;마법 지도;괴물 결박;수면;갑옷 강화;물약 감정;두루마리 감정;무기 감정;갑옷 감정;반지와 지팡이 감정;괴물 공포;음식 탐지;순간 이동;무기 강화;괴물 소환;저주 해제;괴물 각성;갑옷 보호',
'замешательство чудовищ;магическая карта;паралич чудовищ;сон;зачарование брони;опознание зелий;опознание свитков;опознание оружия;опознание брони;опознание колец и посохов;устрашение чудовищ;обнаружение еды;телепортация;зачарование оружия;создание чудовища;снятие проклятия;пробуждение чудовищ;защита брони',
]);
rogueNameTable('ring', [
'protection;force;maintien de la force;recherche;vision de l’invisible;ornement;éveil des monstres;dextérité;dégâts accrus;régénération;digestion lente;téléportation;discrétion;préservation d’armure',
'Schutz;Stärke;Stärkeerhalt;Suche;Unsichtbares sehen;Schmuck;Monstererweckung;Geschicklichkeit;Schadenssteigerung;Regeneration;langsamer Verdauung;Teleportation;Heimlichkeit;Rüstungserhalt',
'protezione;forza;forza costante;ricerca;vista dell’invisibile;ornamento;risveglio dei mostri;destrezza;danno maggiore;rigenerazione;digestione lenta;teletrasporto;furtività;armatura preservata',
'protección;fuerza;conservación de fuerza;búsqueda;visión de lo invisible;adorno;despertar de monstruos;destreza;daño aumentado;regeneración;digestión lenta;teletransporte;sigilo;conservación de armadura',
'防护;力量;维持力量;搜索;看破隐形;装饰;惊醒怪物;灵巧;增强伤害;再生;缓慢消化;传送;潜行;保护护甲',
'보호;힘;힘 유지;탐색;투명 감지;장식;괴물 각성;민첩;피해 증가;재생;느린 소화;순간 이동;은신;갑옷 유지',
'защита;сила;сохранение силы;поиск;зрение невидимого;украшение;пробуждение чудовищ;ловкость;усиление урона;регенерация;медленное пищеварение;телепортация;скрытность;сохранение брони',
]);
rogueNameTable('stick', [
'lumière;invisibilité;foudre;feu;froid;métamorphose;projectile magique;accélération des monstres;ralentissement des monstres;drain de vie;néant;téléportation éloignée;téléportation rapprochée;annulation',
'Licht;Unsichtbarkeit;Blitz;Feuer;Kälte;Verwandlung;Magiegeschoss;Monsterbeschleunigung;Monsterverlangsamung;Lebensentzug;Nichts;Wegteleportation;Herteleportation;Entzauberung',
'luce;invisibilità;fulmine;fuoco;gelo;metamorfosi;dardo magico;velocizza mostro;rallenta mostro;risucchio vitale;nulla;teletrasporto lontano;teletrasporto vicino;annullamento',
'luz;invisibilidad;rayo;fuego;frío;metamorfosis;proyectil mágico;aceleración de monstruos;ralentización de monstruos;drenaje vital;nada;teletransporte lejano;teletransporte cercano;anulación',
'光明;隐形;闪电;火焰;寒冰;变形;魔法飞弹;加速怪物;减速怪物;吸取生命;无效;传送远离;传送靠近;取消魔法',
'빛;투명화;번개;불;냉기;변신;마법 화살;괴물 가속;괴물 감속;생명 흡수;무효;멀리 이동;가까이 이동;마법 해제',
'свет;невидимость;молния;огонь;холод;превращение;магический снаряд;ускорение чудовищ;замедление чудовищ;похищение жизни;ничто;телепортация прочь;телепортация сюда;отмена магии',
]);
rogueNameTable('weapon', [
'masse;épée longue;arc court;flèche;dague;épée à deux mains;fléchette;shuriken;lance',
'Streitkolben;Langschwert;Kurzbogen;Pfeil;Dolch;Zweihänder;Wurfpfeil;Shuriken;Speer',
'mazza;spada lunga;arco corto;freccia;pugnale;spada a due mani;dardo;shuriken;lancia',
'maza;espada larga;arco corto;flecha;daga;espada a dos manos;dardo;shuriken;lanza',
'钉头锤;长剑;短弓;箭;匕首;双手剑;飞镖;手里剑;长矛',
'철퇴;장검;단궁;화살;단검;양손검;다트;수리검;창',
'булава;длинный меч;короткий лук;стрела;кинжал;двуручный меч;дротик;сюрикен;копьё',
]);
rogueNameTable('armor', [
'armure de cuir;cotte d’anneaux;cuir clouté;armure d’écailles;cotte de mailles;armure d’éclisses;armure à bandes;armure de plates',
'Lederrüstung;Ringpanzer;Nietenleder;Schuppenpanzer;Kettenhemd;Schienenpanzer;Bänderpanzer;Plattenpanzer',
'armatura di cuoio;maglia ad anelli;cuoio borchiato;armatura a scaglie;cotta di maglia;armatura a stecche;armatura a bande;armatura a piastre',
'armadura de cuero;cota de anillos;cuero tachonado;armadura de escamas;cota de malla;armadura de tablillas;armadura de bandas;armadura de placas',
'皮甲;环甲;镶钉皮甲;鳞甲;锁子甲;板条甲;带甲;板甲',
'가죽 갑옷;고리 갑옷;징 박힌 가죽 갑옷;비늘 갑옷;사슬 갑옷;미늘 갑옷;띠 갑옷;판금 갑옷',
'кожаная броня;кольчатая броня;клёпаная кожа;чешуйчатая броня;кольчуга;шинная броня;полосчатая броня;латная броня',
]);
rogueNameTable('colors', [
'ambre;aigue-marine;noir;bleu;brun;transparent;cramoisi;cyan;écru;or;vert;gris;magenta;orange;rose;à carreaux;pourpre;rouge;argent;fauve;mandarine;topaze;turquoise;vermillon;violet;blanc;jaune',
'bernsteinfarben;aquamarin;schwarz;blau;braun;klar;karminrot;cyan;ecrufarben;golden;grün;grau;magenta;orange;rosa;kariert;purpur;rot;silbern;hellbraun;mandarinenfarben;topasfarben;türkis;zinnoberrot;violett;weiß;gelb',
'ambra;acquamarina;nero;blu;marrone;trasparente;cremisi;ciano;écru;oro;verde;grigio;magenta;arancione;rosa;a quadri;porpora;rosso;argento;marrone chiaro;mandarino;topazio;turchese;vermiglio;viola;bianco;giallo',
'ámbar;aguamarina;negro;azul;marrón;transparente;carmesí;cian;crudo;dorado;verde;gris;magenta;naranja;rosa;a cuadros;púrpura;rojo;plateado;canela;mandarina;topacio;turquesa;bermellón;violeta;blanco;amarillo',
'琥珀色;海蓝色;黑色;蓝色;棕色;透明;深红色;青色;米色;金色;绿色;灰色;洋红色;橙色;粉色;格子纹;紫色;红色;银色;黄褐色;橘色;黄玉色;绿松石色;朱红色;紫罗兰色;白色;黄色',
'호박색;아쿠아마린색;검정;파랑;갈색;투명;진홍;청록;연베이지;금색;초록;회색;자홍;주황;분홍;격자무늬;자주;빨강;은색;황갈색;귤색;황옥색;옥색;주홍;보라;흰색;노랑',
'янтарь;аквамарин;чёрный;синий;коричневый;прозрачный;багряный;голубой;экрю;золотой;зелёный;серый;пурпурный;оранжевый;розовый;клетчатый;лиловый;красный;серебряный;светло-коричневый;мандариновый;топазовый;бирюзовый;киноварный;фиолетовый;белый;жёлтый',
]);
rogueNameTable('stones', [
'agate;alexandrite;améthyste;cornaline;diamant;émeraude;germanium;granit;grenat;jade;kryptonite;lapis-lazuli;pierre de lune;obsidienne;onyx;opale;perle;péridot;rubis;saphir;stibiotantalite;œil-de-tigre;topaze;turquoise;taafféite;zircon',
'Achat;Alexandrit;Amethyst;Karneol;Diamant;Smaragd;Germanium;Granit;Granat;Jade;Kryptonit;Lapislazuli;Mondstein;Obsidian;Onyx;Opal;Perle;Peridot;Rubin;Saphir;Stibiotantalit;Tigerauge;Topas;Türkis;Taaffeit;Zirkon',
'agata;alessandrite;ametista;corniola;diamante;smeraldo;germanio;granito;granato;giada;kryptonite;lapislazzuli;pietra di luna;ossidiana;onice;opale;perla;peridoto;rubino;zaffiro;stibiotantalite;occhio di tigre;topazio;turchese;taaffeite;zircone',
'ágata;alejandrita;amatista;cornalina;diamante;esmeralda;germanio;granito;granate;jade;kriptonita;lapislázuli;piedra lunar;obsidiana;ónice;ópalo;perla;peridoto;rubí;zafiro;estibiotantalita;ojo de tigre;topacio;turquesa;taaffeíta;circón',
'玛瑙;变石;紫水晶;红玉髓;钻石;祖母绿;锗;花岗岩;石榴石;翡翠;氪石;青金石;月光石;黑曜石;缟玛瑙;欧泊;珍珠;橄榄石;红宝石;蓝宝石;锑钽矿;虎眼石;黄玉;绿松石;塔菲石;锆石',
'마노;알렉산드라이트;자수정;홍옥수;다이아몬드;에메랄드;게르마늄;화강암;석류석;비취;크립토나이트;청금석;월장석;흑요석;오닉스;오팔;진주;감람석;루비;사파이어;스티비오탄탈라이트;호안석;토파즈;터키석;태퍼이트;지르콘',
'агат;александрит;аметист;сердолик;алмаз;изумруд;германий;гранит;гранат;нефрит;криптонит;лазурит;лунный камень;обсидиан;оникс;опал;жемчуг;перидот;рубин;сапфир;стибиотанталит;тигровый глаз;топаз;бирюза;тааффеит;циркон',
]);
rogueNameTable('woods', [
'avocatier;balsa;bambou;banian;bouleau;cèdre;cerisier;cinabre;cyprès;cornouiller;bois flotté;ébène;orme;eucalyptus;cascade;pruche;houx;bois de fer;kukui;acajou;manzanita;érable;chêne;plaqueminier;pacanier;pin;peuplier;séquoia;palissandre;épicéa;teck;noyer;zébrano',
'Avocadoholz;Balsa;Bambus;Banyan;Birke;Zeder;Kirsche;Zinnober;Zypresse;Hartriegel;Treibholz;Ebenholz;Ulme;Eukalyptus;Wasserfall;Hemlock;Stechpalme;Eisenholz;Kukui;Mahagoni;Manzanita;Ahorn;Eiche;Kakiholz;Pekannuss;Kiefer;Pappel;Mammutbaum;Palisander;Fichte;Teak;Walnuss;Zebrano',
'avocado;balsa;bambù;banyan;betulla;cedro;ciliegio;cinabro;cipresso;corniolo;legno alla deriva;ebano;olmo;eucalipto;cascata;tsuga;agrifoglio;legno ferro;kukui;mogano;manzanita;acero;quercia;kaki;pecan;pino;pioppo;sequoia;palissandro;abete rosso;teak;noce;zebrano',
'aguacate;balsa;bambú;baniano;abedul;cedro;cerezo;cinabrio;ciprés;cornejo;madera a la deriva;ébano;olmo;eucalipto;cascada;tsuga;acebo;palo de hierro;kukui;caoba;manzanita;arce;roble;caqui;pacana;pino;álamo;secuoya;palisandro;pícea;teca;nogal;cebrano',
'鳄梨木;轻木;竹;榕木;桦木;雪松木;樱木;辰砂;柏木;山茱萸木;浮木;乌木;榆木;桉木;瀑布;铁杉木;冬青木;铁木;石栗木;桃花心木;熊果木;枫木;橡木;柿木;山核桃木;松木;杨木;红杉木;紫檀木;云杉木;柚木;胡桃木;斑马木',
'아보카도나무;발사나무;대나무;반얀나무;자작나무;삼나무;벚나무;진사;사이프러스;층층나무;유목;흑단;느릅나무;유칼립투스;폭포;솔송나무;호랑가시나무;철목;쿠쿠이나무;마호가니;만자니타;단풍나무;참나무;감나무;피칸나무;소나무;포플러;레드우드;자단;가문비나무;티크;호두나무;제브라우드',
'авокадо;бальса;бамбук;баньян;берёза;кедр;вишня;киноварь;кипарис;кизил;плавник;эбен;вяз;эвкалипт;водопад;тсуга;падуб;железное дерево;кукуи;махагон;манзанита;клён;дуб;хурма;пекан;сосна;тополь;секвойя;палисандр;ель;тик;орех;зебрано',
]);
rogueLocaleRows(`
foodName|ration|Proviant|razione|ración|口粮|식량|паёк
food|nourriture|Essen|cibo|comida|食物|음식|еда
itemKnown|{kind} : {name}|{kind}: {name}|{kind}: {name}|{kind}: {name}|{name}{kind}|{name} {kind}|{kind}: {name}
itemUnknown|{kind} ({name})|{kind} ({name})|{kind} ({name})|{kind} ({name})|{kind}（{name}）|{kind} ({name})|{kind} ({name})
itemTitled|parchemin « {name} »|Schriftrolle „{name}“|pergamena «{name}»|pergamino «{name}»|名为“{name}”的卷轴|“{name}” 두루마리|свиток «{name}»
kind_potion|potion|Trank|pozione|poción|药水|물약|зелье
kind_scroll|parchemin|Schriftrolle|pergamena|pergamino|卷轴|두루마리|свиток
kind_ring|bague|Ring|anello|anillo|戒指|반지|кольцо
kind_stick|bâton|Stab|bastone|bastón|法杖|지팡이|посох
`, (lang, key, value) => { ROGUE_TEXT[lang][key] = value; });
ROGUE_TEXT.en.foodName = 'food ration';
ROGUE_TEXT.en.food = 'food';
ROGUE_TEXT.ja.foodName = '食料';
ROGUE_TEXT.ja.food = '食料';
const ROGUE_HELP = {
  fr: `ROGUE — MODE D’EMPLOI

Vous êtes @. Descendez jusqu’à l’étage 26, trouvez l’Amulette de Yendor (,),
puis remontez à la surface. Une seule vie. Aucune sauvegarde.

PAVÉ NUMÉRIQUE
  7 descendre   8 haut    9 monter    0 chercher
  4 gauche     5 repos   6 droite
  1 ramasser   2 bas     3 menu (répéter pour le menu suivant)
Les flèches fonctionnent aussi. Deux flèches ensemble : diagonale.

COMBAT : marchez vers un monstre (A–Z) pour l’attaquer.
OBJETS : marchez dessus pour les ramasser.
ESCALIERS : sur %, 7 descend. Pour remonter avec 9, il faut l’Amulette.
IMPASSE : cherchez une porte secrète en appuyant plusieurs fois sur 0.
BLESSURES : reposez-vous avec 5 ou buvez une potion.
FAIM : mangez depuis le menu avant de mourir de faim.

MENU : 3 ouvre le sac, puis passe aux autres commandes :
sac, potion, parchemin, nourriture, arme, armure, retirer l’armure,
bague, retirer une bague, bâton, lancer, déposer, aide, abandonner.
8/2 pour choisir, 5 pour valider, 0 pour fermer.
Pour viser avec un objet ou un bâton : 8 4 6 2, diagonales 7 9 1 3.

Touches classiques : h j k l y u b n, i q r e w W T P R z t d s Q > <

SYMBOLES
  @ vous     A–Z monstre   % escalier  + porte   # couloir
  * or       : nourriture ! potion    ? parchemin  ) arme
  ] armure   = bague      / bâton     ^ piège   , Amulette

Les potions et parchemins inconnus portent des noms étranges.
Leur utilisation révèle leur effet. Une touche pour revenir.`,
  de: `ROGUE — SPIELANLEITUNG

Du bist @. Steige bis Ebene 26 hinab, hole das Amulett von Yendor (,)
und kehre an die Oberfläche zurück. Ein Leben. Kein Speichern.

ZIFFERNBLOCK
  7 hinab      8 hoch     9 hinauf    0 suchen
  4 links      5 rasten   6 rechts
  1 aufheben   2 runter   3 Menü (erneut: nächstes Menü)
Auch die Pfeiltasten bewegen dich. Zwei gleichzeitig: diagonal.

KAMPF: Laufe gegen ein Monster (A–Z), um es anzugreifen.
GEGENSTÄNDE: Laufe darüber, um sie aufzuheben.
TREPPEN: Auf % steigt 7 hinab. Für 9 hinauf brauchst du das Amulett.
SACKGASSE: Suche mit 0 mehrmals nach Geheimtüren.
WENIG LP: Raste mit 5 oder trinke einen Trank.
HUNGER: Iss über das Menü, bevor du verhungerst.

MENÜ: 3 öffnet den Rucksack und wechselt dann die Befehle:
Rucksack, Trank, Schriftrolle, Essen, Waffe, Rüstung, Rüstung ausziehen,
Ring, Ring abziehen, Stab, werfen, ablegen, Hilfe, aufgeben.
8/2 wählen, 5 bestätigen, 0 schließen.
Wurf- und Stabrichtung: 8 4 6 2, diagonal 7 9 1 3.

Klassische Tasten: h j k l y u b n, i q r e w W T P R z t d s Q > <

ZEICHEN
  @ du       A–Z Monster   % Treppe   + Tür     # Gang
  * Gold     : Essen       ! Trank    ? Schriftrolle  ) Waffe
  ] Rüstung  = Ring        / Stab     ^ Falle   , Amulett

Unbekannte Tränke und Schriftrollen tragen seltsame Namen.
Beim Benutzen erfährst du ihre Wirkung. Beliebige Taste: zurück.`,
  it: `ROGUE — COME GIOCARE

Sei @. Scendi fino al piano 26, trova l’Amuleto di Yendor (,)
e torna in superficie. Hai una sola vita. Non puoi salvare.

TASTIERINO NUMERICO
  7 scendi     8 su       9 sali       0 cerca
  4 sinistra   5 riposa   6 destra
  1 raccogli   2 giù      3 menu (ripeti per il menu seguente)
Funzionano anche le frecce. Due insieme: movimento diagonale.

COMBATTERE: cammina contro un mostro (A–Z) per attaccarlo.
OGGETTI: camminaci sopra per raccoglierli.
SCALE: su %, 7 scende. Per salire con 9 serve l’Amuleto.
VICOLO CIECO: premi 0 più volte per cercare porte segrete.
POCHI PF: riposa con 5 o bevi una pozione.
FAME: mangia dal menu prima di morire di fame.

MENU: 3 apre lo zaino e poi passa agli altri comandi:
zaino, pozione, pergamena, cibo, arma, armatura, togli armatura,
anello, togli anello, bastone, lancia, lascia, aiuto, abbandona.
8/2 sceglie, 5 conferma, 0 chiude.
Direzione di lancio o bastone: 8 4 6 2, diagonali 7 9 1 3.

Tasti classici: h j k l y u b n, i q r e w W T P R z t d s Q > <

SIMBOLI
  @ tu        A–Z mostro  % scale    + porta    # corridoio
  * oro       : cibo      ! pozione  ? pergamena  ) arma
  ] armatura  = anello    / bastone  ^ trappola , Amuleto

Pozioni e pergamene sconosciute hanno nomi strani.
Usale per scoprirne gli effetti. Premi un tasto per tornare.`,
  es: `ROGUE — CÓMO JUGAR

Eres @. Baja hasta el piso 26, encuentra el Amuleto de Yendor (,)
y regresa a la superficie. Una sola vida. No hay partidas guardadas.

TECLADO NUMÉRICO
  7 bajar      8 arriba    9 subir     0 buscar
  4 izquierda  5 reposar   6 derecha
  1 recoger    2 abajo     3 menú (repite para el siguiente menú)
También sirven las flechas. Dos a la vez: movimiento diagonal.

COMBATIR: camina contra un monstruo (A–Z) para atacarlo.
OBJETOS: pasa por encima para recogerlos.
ESCALERAS: sobre %, 7 baja. Para subir con 9 necesitas el Amuleto.
CALLEJÓN SIN SALIDA: pulsa 0 varias veces para buscar puertas secretas.
POCOS PV: reposa con 5 o bebe una poción.
HAMBRE: come desde el menú antes de morir de inanición.

MENÚ: 3 abre la mochila y luego cambia de comando:
mochila, poción, pergamino, comida, arma, armadura, quitar armadura,
anillo, quitar anillo, bastón, lanzar, soltar, ayuda, abandonar.
8/2 elige, 5 confirma, 0 cierra.
Dirección de lanzamiento o bastón: 8 4 6 2, diagonales 7 9 1 3.

Teclas clásicas: h j k l y u b n, i q r e w W T P R z t d s Q > <

SÍMBOLOS
  @ tú       A–Z monstruo  % escaleras + puerta  # pasillo
  * oro      : comida      ! poción    ? pergamino ) arma
  ] armadura = anillo      / bastón    ^ trampa  , Amuleto

Las pociones y los pergaminos desconocidos tienen nombres extraños.
Úsalos para descubrir sus efectos. Pulsa una tecla para volver.`,
  zh: `ROGUE — 游戏指南

你是 @。下到第26层，找到延多护符（,），再返回地面。
只有一条命，无法存档。

数字键盘
  7 下楼梯   8 向上    9 上楼梯   0 搜索
  4 向左     5 休息    6 向右
  1 拾取     2 向下    3 菜单（再次按下切换菜单）
方向键也能移动，同时按两个方向键可斜向移动。

战斗：向怪物（A–Z）移动即可攻击。
拾取：从物品上走过即可拾取。
楼梯：站在 % 上按 7 下楼。按 9 上楼，需要护符。
死路：多按几次 0 搜索暗门。
生命不足：按 5 休息或喝药水。
饥饿：从菜单吃东西，以免饿死。

菜单：按 3 打开背包，再按 3 切换命令：
背包、喝药水、读卷轴、吃东西、装备武器、穿护甲、脱护甲、
戴戒指、摘戒指、法杖、投掷、丢弃、帮助、放弃。
8/2 选择，5 确认，0 关闭。
投掷或法杖的方向用 8 4 6 2，斜向用 7 9 1 3。

传统字母键同样有效：
h j k l y u b n, i q r e w W T P R z t d s Q > <

符号
  @ 自己   A–Z 怪物   % 楼梯   + 门      # 走廊
  * 金币   : 食物     ! 药水   ? 卷轴    ) 武器
  ] 护甲   = 戒指     / 法杖   ^ 陷阱    , 护符

未知药水和卷轴会显示奇怪的名称，使用后就能知道效果。
按任意键返回。`,
  ko: `ROGUE — 게임 방법

당신은 @입니다. 26층까지 내려가 옌도르의 부적(,)을 찾고
다시 지상으로 돌아오세요. 목숨은 하나이며 저장할 수 없습니다.

숫자 키패드
  7 계단 내려가기  8 위     9 계단 올라가기  0 수색
  4 왼쪽           5 휴식   6 오른쪽
  1 줍기           2 아래   3 메뉴 (다시 누르면 다음 메뉴)
방향키로도 이동합니다. 두 방향키를 함께 누르면 대각선 이동입니다.

전투: 괴물(A–Z) 쪽으로 이동하면 공격합니다.
줍기: 물건 위를 걸으면 줍습니다.
계단: % 위에서 7로 내려갑니다. 9로 올라가려면 부적이 필요합니다.
막다른 길: 0을 여러 번 눌러 비밀문을 찾으세요.
체력 부족: 5로 쉬거나 물약을 마시세요.
굶주림: 굶어 죽기 전에 메뉴에서 음식을 드세요.

메뉴: 3으로 배낭을 열고 다시 3을 누르면 명령이 바뀝니다.
배낭, 물약, 두루마리, 음식, 무기, 갑옷 입기, 갑옷 벗기,
반지 끼기, 반지 빼기, 지팡이, 던지기, 버리기, 도움말, 포기.
8/2 선택, 5 확인, 0 닫기.
던지기나 지팡이 방향은 8 4 6 2, 대각선은 7 9 1 3입니다.

기존 문자 키도 사용할 수 있습니다.
h j k l y u b n, i q r e w W T P R z t d s Q > <

기호
  @ 자신   A–Z 괴물   % 계단    + 문       # 통로
  * 금화   : 음식     ! 물약    ? 두루마리 ) 무기
  ] 갑옷   = 반지     / 지팡이  ^ 함정     , 부적

모르는 물약과 두루마리는 이상한 이름으로 표시됩니다.
사용하면 효과를 알 수 있습니다. 아무 키나 누르면 돌아갑니다.`,
  ru: `ROGUE — КАК ИГРАТЬ

Вы — @. Спуститесь на 26-й этаж, найдите Амулет Йендора (,)
и вернитесь на поверхность. Жизнь одна. Сохранений нет.

ЦИФРОВОЙ БЛОК
  7 вниз по лестнице  8 вверх    9 вверх по лестнице  0 поиск
  4 влево             5 отдых   6 вправо
  1 подобрать         2 вниз    3 меню (ещё раз — следующее меню)
Стрелки тоже работают. Две стрелки вместе — ход по диагонали.

БОЙ: идите на чудовище (A–Z), чтобы атаковать.
ПРЕДМЕТЫ: пройдите по предмету, чтобы подобрать его.
ЛЕСТНИЦЫ: стоя на %, нажмите 7 для спуска. Для подъёма с 9 нужен Амулет.
ТУПИК: несколько раз нажмите 0, чтобы искать потайную дверь.
МАЛО ОЗ: отдыхайте с помощью 5 или выпейте зелье.
ГОЛОД: поешьте через меню до того, как умрёте от голода.

МЕНЮ: 3 открывает рюкзак и переключает команды:
рюкзак, зелье, свиток, еда, оружие, надеть броню, снять броню,
надеть кольцо, снять кольцо, посох, метнуть, бросить, помощь, выйти.
8/2 — выбор, 5 — подтверждение, 0 — закрыть.
Направление броска или посоха: 8 4 6 2, диагонали 7 9 1 3.

Классические клавиши тоже работают:
h j k l y u b n, i q r e w W T P R z t d s Q > <

СИМВОЛЫ
  @ вы       A–Z чудовище  % лестница  + дверь  # коридор
  * золото   : еда         ! зелье     ? свиток ) оружие
  ] броня    = кольцо      / посох     ^ ловушка , Амулет

Неизвестные зелья и свитки имеют странные названия.
Примените их, чтобы узнать эффект. Любая клавиша — назад.`,
};
for (const lang of ROGUE_EXTRA_LOCALES) {
  ROGUE_TEXT[lang].help = ROGUE_HELP[lang];
  const lines = ROGUE_HELP[lang].split('\n');
  const start = lines.findIndex(line => line.includes('7 '));
  ROGUE_TEXT[lang].sheet = lines.slice(start, start + 3).join('\n');
}
