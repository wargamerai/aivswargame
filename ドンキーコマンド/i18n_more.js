// ドンキーコマンド スペイン語・ドイツ語・フランス語・イタリア語・中国語・韓国語（英語の文章から訳したもの。2026-11-06）
// 抜けている言葉は英語で出る（game.js の T）
DC_TEXT.es = {
  title: "DONKEY COMMAND", sub: "Infíltrate solo en la base secreta, cumple tus misiones y vuelve al ascensor",
  backTop: "Página principal", rules: "Reglas", langOther: "Idioma", close: "Cerrar",
  h0: "Dificultad", diff_easy: "Fácil", diff_normal: "Normal", diff_hard: "Difícil", diff_veryhard: "Muy difícil",
  diffd_easy: "Atributos y carga x1,5", diffd_normal: "Atributos y carga x1,2",
  diffd_hard: "Las reglas originales", diffd_veryhard: "Atributos y carga x0,8",
  h1: "1. Tira tus atributos", roll: "Tirar atributos", reroll: "Volver a tirar",
  h2: "2. Elige el equipo", auto: "Equipo automático", autoNote: "Se elige según tus atributos y habilidades. Después puedes cambiarlo", start: "Comenzar la infiltración", again: "Jugar otra vez",
  ab_end: "Resistencia", ab_str: "Fuerza", ab_luck: "Suerte", ab_know: "Conocimiento", ab_reac: "Reacción", ab_acc: "Puntería",
  abd_end: "Si las heridas llegan a este número, quedas inconsciente y te capturan", abd_str: "Peso que puedes llevar", abd_luck: "Ayuda en accidentes, huidas y granadas",
  abd_know: "Probabilidad de éxito en demoliciones y robos", abd_reac: "Puntos de acción en combate", abd_acc: "Acertar con las armas",
  bonusSum: "Total de dados de Reacción + Puntería: {n} (con 20 o más obtienes una habilidad extra)",
  noBonus: "Sin habilidad extra", bonusGot: "Habilidades extra: {s}",
  eqInfo: "Peso {w} / {max}   Cinturón {b} / {bm}   Armas {g} / 3 (1 en la mano + 2 al hombro)",
  belt: "Cinturón", ruck: "Mochila", gun: "Arma", lMain: "Arma en la mano:", none: "Ninguna",
  errWeight: "Demasiado peso", errBelt: "El cinturón admite {n} objetos", errGuns: "Puedes llevar 3 armas",
  hMove: "Mover (exactamente 1 casilla por turno)", north: "N ↑", south: "S ↓", east: "E →", west: "← O",
  hPhase: "Qué hacer ahora", hMsgs: "Este turno", hStat: "Comando", hEq: "Equipo",
  turn: "Turno {t}   PV {v}   Enemigos abatidos {k}",
  legend: "★ tú   grueso = pared   marrón = puerta   punteado = pasillo   figura roja + número = enemigos   También puedes moverte con las flechas",
  phaseMove: "Elige adónde moverte. Al cruzar una puerta se comprueba si hay un accidente.",
  phaseAdjust: "Fase de ajuste. Haz misiones en la sala o cambia el equipo, y luego muévete.",
  inRoom: "Posición: {r} ({d})", inHall: "Posición: pasillo",
  wounds: "Heridas", st_vp: "PV",
  btnMission: "Hacer misión: {m}", btnMed: "Recibir tratamiento (curar 2d6)", btnArmory: "Tomar del arsenal", btnEquip: "Cambiar equipo", btnExit: "Terminar la partida aquí (huir)",
  mi_blast: "Demolición (1 explosivo)", mi_steal: "Robo (kit de documentos)", noEP: "No tienes explosivos", noKit: "No tienes kit de documentos",
  r_EH: "Vestíbulo del ascensor", r_CP: "Puesto de mando", r_RC: "Archivo", r_GP: "Aposentos del general", r_AS: "Arsenal", r_TP: "Almacén", r_PP: "Barracón", r_LR: "Sala de radar", r_ER: "Sala de energía", r_LS: "Laboratorio", r_CC: "Centro médico",
  rd_EH: "Salida. Aquí puedes terminar la partida", rd_CP: "Demolición. Bonificación especial: 10 PV", rd_RC: "Robo. Bonificación especial: 6 PV", rd_GP: "Robo. Si fallas, te envían 4 casillas al sur", rd_AS: "Toma las armas que quieras. Aquí no se pueden usar granadas en combate",
  rd_TP: "No hay nada", rd_PP: "Si hay enemigos, siempre son 10", rd_LR: "Demolición. Bonificación especial: 6 PV", rd_ER: "Demolición", rd_LS: "Demolición. Bonificación especial: Big K Gun y 20 PV", rd_CC: "Curar 2d6 (una vez)",
  it_SMG: "Subfusil", it_AR: "Fusil de asalto", it_P: "Pistola", it_ATR: "Fusil antitanque", it_BIGK: "Big K Gun",
  it_G: "Granada", it_N: "Cuchillo", it_LSMG: "Munición de subfusil", it_LAR: "Munición de fusil", it_LP: "Munición de pistola", it_LATR: "Munición antitanque", it_EP: "Explosivo", it_K: "Kit de documentos", it_U: "Paraguas", it_B: "Biblia",
  itd_U: "No sirve para nada", itd_B: "No sirve para nada",
  empty: "vacía", onHand: "Mano", onShoulder: "Hombro", onBelt: "Cinturón", onRuck: "Mochila", dropped: "En el suelo",
  sk_knifeThrow: "Lanzar cuchillo", sk_karate: "Kárate", sk_grenade: "Granada", sk_smg: "Subfusil", sk_pistol: "Pistola", sk_ar: "Fusil de asalto", sk_reload: "Recarga rápida", sk_flee: "Huida", sk_suggest: "Sugestión",
  m_start: "La infiltración comienza en el vestíbulo del ascensor.",
  m_moved: "Te mueves hacia {dir}.", m_wall: "Ahí hay una pared.", m_door: "Cruzas una puerta.",
  m_acc0: "Comprobación de accidente 1d6={d} (menos que Suerte {l}): no pasa nada.",
  m_acc: "Comprobación de accidente 1d6={d}, 2d6={n}: {t}",
  a_laser: "¡Trampa láser! {n} heridas.", a_trip: "Tropiezas. En la primera ronda del próximo combate tus puntos de acción serán iguales a tu Suerte.", a_tv: "¡Te ha captado un monitor! Aquí hay enemigos seguro.", a_sneeze: "¡Un estornudo! Se te ha caído el arma principal.", a_hic: "Hipo. Sin efecto.",
  m_room: "Esto es: {r}.", m_enemy: "¡{n} enemigos avistados en {x}!", cell_here: "esta casilla", cell_n: "el norte", cell_s: "el sur", cell_e: "el este", cell_w: "el oeste",
  m_noEnemy: "No hay enemigos.", m_heal: "Descansas en la sala y curas 1 herida.", m_healed: "Curas {n}.",
  m_mOk: "¡Misión cumplida! 1d6={d} (Conocimiento {k} o menos): ganas {d} PV.", m_mNg: "Misión fallida. 1d6={d} (Conocimiento {k}).",
  m_sb: "¡Bonificación especial! {v} PV más.", m_bigk: "¡Consigues la Big K Gun! 20 PV más.",
  m_gp: "¡Defensas automáticas! Te envían 4 casillas al sur.",
  m_lvChk: "Comprobación por cada 10 enemigos: 1d6={d}.", m_lvUp: "¡{a} sube a {n}!", m_newSk: "Nueva habilidad extra: {s}",
  m_flee: "¡Has huido! Vuelves a la casilla anterior.",
  cb_men: "{n}", cb_title: "COMBATE", cb_round: "Ronda {r}   {n} enemigos", apLab: "Puntos de acción",
  cb_st: "Heridas {w}/{e}   {p}", prone: "Cuerpo a tierra", standing: "De pie",
  cb_pick: "Haz clic en la casilla objetivo", endRound: "Terminar la ronda (fuego enemigo)", cancel: "Cancelar",
  ac_auto: "Ráfaga", ac_single: "Tiro a tiro", ac_pistol: "Disparo de pistola", ac_grenade: "Granada", ac_knife: "Ataque con cuchillo", ac_throw: "Lanzar cuchillo", ac_melee: "Cuerpo a cuerpo", ac_atr: "Disparo antitanque", ac_karate: "Kárate", ac_reload: "Recargar (llenar el cargador)", ac_swap: "Cambiar de arma (del hombro)", ac_prone: "Echarse al suelo", ac_stand: "Levantarse", ac_surr: "Exigir la rendición", ac_flee: "Huir", ac_bigk: "Big K Gun",
  all: "todo", c_ap: "{r} puntos de acción (2d6={d} + Reacción {e})", c_ap_trip: "{r} puntos de acción (tropiezo: Suerte)",
  c_shot: "{w} 2d6={d} + Puntería {a} = {t} (necesitas {n}): {res}", c_hit: "impacto", c_miss: "fallo",
  c_empty: "{w} se ha quedado sin munición (1d6={d}).", c_nade: "Granada (2d6={d} + Suerte {l} + Puntería {a}) / 4 = {n} enemigos abatidos.",
  c_knife: "Cuchillo 1d6={d} + Puntería {a} = {t} (necesitas 7): {res}", c_kdrop: "Se te ha caído el cuchillo (1d6={d}).",
  c_throw: "Lanzar cuchillo 1d6={d} (4 o menos): {res}", c_melee: "Cuerpo a cuerpo 1d6={d} + Fuerza {s} = {t} (necesitas 16): {res}",
  c_kar: "Kárate 1d6={d} (4 o menos): {res}", c_reload: "Has recargado: {w}.", c_swap: "Ahora empuñas: {w}.", c_prone: "Te echas al suelo.", c_stand: "Te levantas.",
  c_surr: "Rendición 1d6={d} (4 o menos): {res}", c_surrOk: "¡Todos los enemigos se rinden!", c_surrNg: "Se niegan.",
  c_flee: "Huida 2d6={d} + Suerte {l} = {t} (necesitas 12): {res}", c_ok: "éxito", c_ng: "fracaso",
  c_big: "Big K Gun 1d6={d} (5 o menos): {res}",
  c_cnt: "Fuego enemigo: {a} disparan, {p} entran en pánico. {n} heridas.", c_win: "¡Todos los enemigos abatidos!", c_nothing: "No hay objetivo.", c_ko: "Pierdes el conocimiento...",
  endTitle: "FIN DE LA PARTIDA", endCap: "Quedaste inconsciente y te capturaron. Pierdes los PV de los documentos robados.", endBack: "¡Has escapado en el ascensor!",
  endScore: "PV {v} / {k} enemigos abatidos / {t} turnos", rank: "Rango: {r}",
  rk_0: "Recluta", rk_1: "Soldado", rk_2: "Veterano", rk_3: "Fuerzas especiales", rk_4: "Comando legendario",
  dlgEquip: "Cambiar equipo", dlgArmory: "Arsenal (toma lo que quieras)", takeHand: "Empuñar", toShoulder: "Al hombro", pickUp: "Recoger", discard: "Tirar", take: "Tomar", toBelt: "▲ al cinturón", toRuck: "▼ a la mochila",
  rulesTitle: "Reglas",
  rulesBody: `OBJETIVO
Empiezas en el vestíbulo del ascensor, en el centro de una base secreta. Cumple misiones en las salas para ganar puntos de victoria (PV) y vuelve a un ascensor para terminar. Si tus heridas llegan a tu Resistencia, te capturan.

ORDEN DEL TURNO
1. Muévete exactamente 1 casilla. Las paredes te bloquean.
2. Al cruzar una puerta se comprueba si hay un accidente. Si 1d6 es igual o mayor que tu Suerte, 2d6 decide el accidente.
3. Tira los lados de la nueva casilla (1,2 = pared, 3,4 = puerta, 5,6 = pasillo).
4. Si los cuatro lados son paredes o puertas, es una sala. 2d6 decide cuál.
5. Comprueba si hay enemigos en las casillas que ves por primera vez (1d6 de 3 o menos: 1d6 enemigos).
6. Si hay enemigos, combates.
7. Ajuste: en las salas curas 1 herida. También puedes hacer misiones y cambiar el equipo.

VISIÓN
Ves tu casilla y las vecinas unidas por un pasillo. No puedes ver a través de paredes ni puertas.

COMBATE
En cada ronda, 2d6 + Reacción te dan los puntos de acción. Los puntos que no uses se pierden.
Actúas primero y luego los supervivientes responden al fuego.
Los enemigos que sacan 1-4 en 1d6 disparan. Cada uno tira 1d6 para las heridas (0-7 da 0,1,1,1,2,2,3,4). Cuerpo a tierra es -1. Un enemigo en tu casilla es +1.
Un disparo acierta cuando 2d6 + Puntería alcanza el número del arma. Después de disparar, un 1d6 igual o menor que su número de munición significa que se ha vaciado.
Las acciones marcadas con todo (7+) necesitan 7 puntos o más y son la única acción de esa ronda.
Cuerpo a tierra solo puedes hacer las acciones marcadas con P.

HERIDAS
Por encima de la mitad de tu Resistencia, cada 3 heridas más cuestan 1 de Reacción y de Puntería, y cada herida más cuesta 1 de Fuerza.

MISIONES
La demolición necesita un explosivo; el robo, un kit de documentos. Con 1d6 igual o menor que tu Conocimiento tienes éxito y esa tirada son tus PV. Otro 1d6 de 1 da una bonificación especial.

PROGRESO
Por cada 10 enemigos abatidos, un 1d6 de 2 o menos sube un atributo.`,
};

DC_TEXT.de = {
  title: "DONKEY COMMAND", sub: "Dring allein in die Geheimbasis ein, erfülle deine Aufträge und kehre zum Aufzug zurück",
  backTop: "Startseite", rules: "Regeln", langOther: "Sprache", close: "Schließen",
  h0: "Schwierigkeit", diff_easy: "Leicht", diff_normal: "Normal", diff_hard: "Schwer", diff_veryhard: "Sehr schwer",
  diffd_easy: "Fähigkeiten und Traglast x1,5", diffd_normal: "Fähigkeiten und Traglast x1,2",
  diffd_hard: "Die Originalregeln", diffd_veryhard: "Fähigkeiten und Traglast x0,8",
  h1: "1. Fähigkeiten auswürfeln", roll: "Fähigkeiten würfeln", reroll: "Neu würfeln",
  h2: "2. Ausrüstung wählen", auto: "Automatische Ausrüstung", autoNote: "Nach deinen Fähigkeiten und Fertigkeiten gewählt. Danach kannst du sie ändern", start: "Einsatz beginnen", again: "Noch einmal",
  ab_end: "Ausdauer", ab_str: "Stärke", ab_luck: "Glück", ab_know: "Wissen", ab_reac: "Reaktion", ab_acc: "Treffsicherheit",
  abd_end: "Erreichen die Wunden diesen Wert, wirst du bewusstlos und gefangen", abd_str: "Gewicht, das du tragen kannst", abd_luck: "Hilft bei Unfällen, Flucht und Granaten",
  abd_know: "Erfolg bei Sprengung und Diebstahl", abd_reac: "Aktionspunkte im Kampf", abd_acc: "Treffen mit Waffen",
  bonusSum: "Würfelsumme Reaktion + Treffsicherheit: {n} (ab 20 gibt es eine Bonusfertigkeit)",
  noBonus: "Keine Bonusfertigkeit", bonusGot: "Bonusfertigkeiten: {s}",
  eqInfo: "Gewicht {w} / {max}   Gürtel {b} / {bm}   Waffen {g} / 3 (1 in der Hand + 2 über der Schulter)",
  belt: "Gürtel", ruck: "Rucksack", gun: "Waffe", lMain: "Waffe in der Hand:", none: "Keine",
  errWeight: "Zu schwer", errBelt: "Der Gürtel fasst {n} Gegenstände", errGuns: "Du kannst 3 Waffen tragen",
  hMove: "Bewegen (genau 1 Feld pro Zug)", north: "N ↑", south: "S ↓", east: "O →", west: "← W",
  hPhase: "Was jetzt zu tun ist", hMsgs: "Dieser Zug", hStat: "Kommando", hEq: "Ausrüstung",
  turn: "Zug {t}   SP {v}   Gegner ausgeschaltet {k}",
  legend: "★ du   dick = Wand   braun = Tür   gepunktet = Gang   rote Figur + Zahl = Gegner   Bewegung auch mit den Pfeiltasten",
  phaseMove: "Wähle, wohin du gehst. Beim Durchqueren einer Tür wird auf einen Unfall geprüft.",
  phaseAdjust: "Anpassungsphase. Erledige Aufträge im Raum oder ändere die Ausrüstung, dann bewege dich.",
  inRoom: "Standort: {r} ({d})", inHall: "Standort: Gang",
  wounds: "Wunden", st_vp: "SP",
  btnMission: "Auftrag ausführen: {m}", btnMed: "Behandeln lassen (2W6 heilen)", btnArmory: "Aus der Waffenkammer nehmen", btnEquip: "Ausrüstung ändern", btnExit: "Spiel hier beenden (Flucht)",
  mi_blast: "Sprengung (1 Sprengstoff)", mi_steal: "Diebstahl (Dokumentenset)", noEP: "Kein Sprengstoff", noKit: "Kein Dokumentenset",
  r_EH: "Aufzugshalle", r_CP: "Kommandoposten", r_RC: "Archiv", r_GP: "Generalsquartier", r_AS: "Waffenkammer", r_TP: "Lagerraum", r_PP: "Kaserne", r_LR: "Radarraum", r_ER: "Kraftwerksraum", r_LS: "Labor", r_CC: "Sanitätszentrum",
  rd_EH: "Ausgang. Hier kannst du das Spiel beenden", rd_CP: "Sprengung. Sonderbonus 10 SP", rd_RC: "Diebstahl. Sonderbonus 6 SP", rd_GP: "Diebstahl. Bei Misserfolg wirst du 4 Felder nach Süden geschickt", rd_AS: "Nimm beliebige Waffen. Hier keine Granaten im Kampf",
  rd_TP: "Hier ist nichts", rd_PP: "Wenn Gegner hier sind, sind es immer 10", rd_LR: "Sprengung. Sonderbonus 6 SP", rd_ER: "Sprengung", rd_LS: "Sprengung. Sonderbonus Big K Gun und 20 SP", rd_CC: "2W6 heilen (einmal)",
  it_SMG: "Maschinenpistole", it_AR: "Sturmgewehr", it_P: "Pistole", it_ATR: "Panzerbüchse", it_BIGK: "Big K Gun",
  it_G: "Granate", it_N: "Messer", it_LSMG: "MP-Munition", it_LAR: "Sturmgewehrmunition", it_LP: "Pistolenmunition", it_LATR: "Panzerbüchsenmunition", it_EP: "Sprengstoff", it_K: "Dokumentenset", it_U: "Regenschirm", it_B: "Bibel",
  itd_U: "Völlig nutzlos", itd_B: "Völlig nutzlos",
  empty: "leer", onHand: "Hand", onShoulder: "Schulter", onBelt: "Gürtel", onRuck: "Rucksack", dropped: "Fallen gelassen",
  sk_knifeThrow: "Messerwurf", sk_karate: "Karate", sk_grenade: "Granate", sk_smg: "MP", sk_pistol: "Pistole", sk_ar: "Sturmgewehr", sk_reload: "Schnelles Nachladen", sk_flee: "Flucht", sk_suggest: "Suggestion",
  m_start: "Der Einsatz beginnt in der Aufzugshalle.",
  m_moved: "Nach {dir} bewegt.", m_wall: "Dort ist eine Wand.", m_door: "Durch eine Tür.",
  m_acc0: "Unfallprüfung 1W6={d} (unter Glück {l}): nichts passiert.",
  m_acc: "Unfallprüfung 1W6={d}, 2W6={n}: {t}",
  a_laser: "Laserfalle! {n} Wunden.", a_trip: "Du stolperst. In der ersten Runde des nächsten Kampfes sind deine Aktionspunkte gleich deinem Glück.", a_tv: "Von einem Monitor erfasst! Hier sind ganz sicher Gegner.", a_sneeze: "Ein Niesen! Du hast deine Hauptwaffe fallen lassen.", a_hic: "Schluckauf. Keine Wirkung.",
  m_room: "Das ist: {r}.", m_enemy: "{n} Gegner entdeckt ({x})!", cell_here: "diesem Feld", cell_n: "Norden", cell_s: "Süden", cell_e: "Osten", cell_w: "Westen",
  m_noEnemy: "Keine Gegner.", m_heal: "Du ruhst im Raum und heilst 1 Wunde.", m_healed: "{n} geheilt.",
  m_mOk: "Auftrag erfüllt! 1W6={d} (Wissen {k} oder weniger): {d} SP erhalten.", m_mNg: "Auftrag gescheitert. 1W6={d} (Wissen {k}).",
  m_sb: "Sonderbonus! {v} SP mehr.", m_bigk: "Du hast die Big K Gun! 20 SP mehr.",
  m_gp: "Automatische Abwehr! Du wirst 4 Felder nach Süden geschickt.",
  m_lvChk: "Prüfung für je 10 Gegner: 1W6={d}.", m_lvUp: "{a} steigt auf {n}!", m_newSk: "Neue Bonusfertigkeit: {s}",
  m_flee: "Entkommen! Du bist auf das vorige Feld zurückgekehrt.",
  cb_men: "{n}", cb_title: "KAMPF", cb_round: "Runde {r}   {n} Gegner", apLab: "Aktionspunkte",
  cb_st: "Wunden {w}/{e}   {p}", prone: "Liegend", standing: "Stehend",
  cb_pick: "Klicke auf das Zielfeld", endRound: "Runde beenden (Gegenfeuer)", cancel: "Abbrechen",
  ac_auto: "Feuerstoß", ac_single: "Einzelschuss", ac_pistol: "Pistolenschuss", ac_grenade: "Granate", ac_knife: "Messerangriff", ac_throw: "Messerwurf", ac_melee: "Nahkampf", ac_atr: "Panzerbüchsenschuss", ac_karate: "Karate", ac_reload: "Nachladen (Magazin füllen)", ac_swap: "Waffe wechseln (von der Schulter)", ac_prone: "Hinlegen", ac_stand: "Aufstehen", ac_surr: "Kapitulation fordern", ac_flee: "Flucht", ac_bigk: "Big K Gun",
  all: "alle", c_ap: "{r} Aktionspunkte (2W6={d} + Reaktion {e})", c_ap_trip: "{r} Aktionspunkte (gestolpert: Glück)",
  c_shot: "{w} 2W6={d} + Treffsicherheit {a} = {t} (nötig {n}): {res}", c_hit: "Treffer", c_miss: "daneben",
  c_empty: "{w} ist leer (1W6={d}).", c_nade: "Granate (2W6={d} + Glück {l} + Treffsicherheit {a}) / 4 = {n} Gegner ausgeschaltet.",
  c_knife: "Messer 1W6={d} + Treffsicherheit {a} = {t} (nötig 7): {res}", c_kdrop: "Du hast das Messer fallen lassen (1W6={d}).",
  c_throw: "Messerwurf 1W6={d} (4 oder weniger): {res}", c_melee: "Nahkampf 1W6={d} + Stärke {s} = {t} (nötig 16): {res}",
  c_kar: "Karate 1W6={d} (4 oder weniger): {res}", c_reload: "{w} nachgeladen.", c_swap: "Jetzt in der Hand: {w}.", c_prone: "Du hast dich hingelegt.", c_stand: "Du bist aufgestanden.",
  c_surr: "Kapitulation 1W6={d} (4 oder weniger): {res}", c_surrOk: "Alle Gegner ergeben sich!", c_surrNg: "Sie weigern sich.",
  c_flee: "Flucht 2W6={d} + Glück {l} = {t} (nötig 12): {res}", c_ok: "Erfolg", c_ng: "Misserfolg",
  c_big: "Big K Gun 1W6={d} (5 oder weniger): {res}",
  c_cnt: "Gegenfeuer: {a} schießen, {p} geraten in Panik. {n} Wunden.", c_win: "Alle Gegner sind ausgeschaltet!", c_nothing: "Kein Ziel vorhanden.", c_ko: "Du wirst bewusstlos...",
  endTitle: "SPIELENDE", endCap: "Du wurdest bewusstlos und gefangen genommen. Die SP für gestohlene Dokumente gehen verloren.", endBack: "Du bist mit dem Aufzug entkommen!",
  endScore: "SP {v} / {k} Gegner ausgeschaltet / {t} Züge", rank: "Rang: {r}",
  rk_0: "Rekrut", rk_1: "Soldat", rk_2: "Veteran", rk_3: "Spezialeinheit", rk_4: "Legendäres Kommando",
  dlgEquip: "Ausrüstung ändern", dlgArmory: "Waffenkammer (nimm, was du willst)", takeHand: "In die Hand", toShoulder: "Über die Schulter", pickUp: "Aufheben", discard: "Wegwerfen", take: "Nehmen", toBelt: "▲ an den Gürtel", toRuck: "▼ in den Rucksack",
  rulesTitle: "Regeln",
  rulesBody: `ZIEL
Du beginnst in der Aufzugshalle in der Mitte einer Geheimbasis. Erfülle Aufträge in Räumen, um Siegpunkte (SP) zu sammeln, und kehre dann zu einem Aufzug zurück, um das Spiel zu beenden. Erreichen deine Wunden deine Ausdauer, wirst du gefangen.

ZUGABLAUF
1. Bewege dich genau 1 Feld. Wände blockieren.
2. Beim Durchqueren einer Tür wird auf einen Unfall geprüft. Ist 1W6 gleich oder höher als dein Glück, bestimmt 2W6 den Unfall.
3. Würfle die Seiten des neuen Feldes (1,2 = Wand, 3,4 = Tür, 5,6 = Gang).
4. Sind alle vier Seiten Wände oder Türen, ist es ein Raum. 2W6 bestimmt welcher.
5. Prüfe neu sichtbare Felder auf Gegner (1W6 von 3 oder weniger: 1W6 Gegner).
6. Sind Gegner da, kämpfst du.
7. Anpassung: In Räumen heilst du 1 Wunde. Du kannst auch Aufträge erledigen und die Ausrüstung ändern.

SICHT
Du siehst dein Feld und die Nachbarfelder, die durch einen Gang verbunden sind. Durch Wände und Türen siehst du nicht.

KAMPF
In jeder Runde ergeben 2W6 + Reaktion deine Aktionspunkte. Nicht genutzte Punkte verfallen.
Du handelst zuerst, dann schießen die Überlebenden zurück.
Gegner mit 1-4 auf 1W6 schießen. Jeder würfelt 1W6 für Wunden (0-7 ergibt 0,1,1,1,2,2,3,4). Liegend -1. Ein Gegner auf deinem Feld +1.
Ein Schuss trifft, wenn 2W6 + Treffsicherheit den Wert der Waffe erreicht. Nach dem Schuss bedeutet 1W6 gleich oder unter ihrem Munitionswert, dass sie leer ist.
Mit alle (7+) markierte Aktionen brauchen 7 oder mehr Punkte und sind die einzige Aktion der Runde.
Liegend sind nur mit P markierte Aktionen möglich.

WUNDEN
Über der Hälfte deiner Ausdauer kosten je 3 weitere Wunden 1 Reaktion und Treffsicherheit, und jede weitere Wunde kostet 1 Stärke.

AUFTRÄGE
Sprengung braucht Sprengstoff, Diebstahl ein Dokumentenset. 1W6 gleich oder unter deinem Wissen ist ein Erfolg, und dieser Wurf sind deine SP. Ein weiterer 1W6 mit 1 gibt einen Sonderbonus.

AUFSTIEG
Für je 10 ausgeschaltete Gegner steigt bei 1W6 von 2 oder weniger eine Fähigkeit.`,
};

DC_TEXT.fr = {
  title: "DONKEY COMMAND", sub: "Infiltrez seul la base secrète, accomplissez vos missions et regagnez l'ascenseur",
  backTop: "Page d'accueil", rules: "Règles", langOther: "Langue", close: "Fermer",
  h0: "Difficulté", diff_easy: "Facile", diff_normal: "Normal", diff_hard: "Difficile", diff_veryhard: "Très difficile",
  diffd_easy: "Caractéristiques et charge x1,5", diffd_normal: "Caractéristiques et charge x1,2",
  diffd_hard: "Les règles d'origine", diffd_veryhard: "Caractéristiques et charge x0,8",
  h1: "1. Tirez vos caractéristiques", roll: "Tirer les caractéristiques", reroll: "Relancer",
  h2: "2. Choisissez l'équipement", auto: "Équipement automatique", autoNote: "Choisi selon vos caractéristiques et compétences. Vous pourrez le modifier ensuite", start: "Commencer l'infiltration", again: "Rejouer",
  ab_end: "Endurance", ab_str: "Force", ab_luck: "Chance", ab_know: "Savoir", ab_reac: "Réflexes", ab_acc: "Précision",
  abd_end: "Si vos blessures atteignent ce nombre, vous perdez connaissance et êtes capturé", abd_str: "Poids que vous pouvez porter", abd_luck: "Aide pour les accidents, la fuite et les grenades",
  abd_know: "Réussite des missions de sabotage et de vol", abd_reac: "Points d'action en combat", abd_acc: "Toucher avec les armes",
  bonusSum: "Total des dés Réflexes + Précision : {n} (20 ou plus donne une compétence bonus)",
  noBonus: "Aucune compétence bonus", bonusGot: "Compétences bonus : {s}",
  eqInfo: "Poids {w} / {max}   Ceinture {b} / {bm}   Armes {g} / 3 (1 en main + 2 à l'épaule)",
  belt: "Ceinture", ruck: "Sac", gun: "Arme", lMain: "Arme en main :", none: "Aucune",
  errWeight: "Trop lourd", errBelt: "La ceinture contient {n} objets", errGuns: "Vous pouvez porter 3 armes",
  hMove: "Déplacement (exactement 1 case par tour)", north: "N ↑", south: "S ↓", east: "E →", west: "← O",
  hPhase: "À faire maintenant", hMsgs: "Ce tour", hStat: "Commando", hEq: "Équipement",
  turn: "Tour {t}   PV {v}   Ennemis abattus {k}",
  legend: "★ vous   épais = mur   marron = porte   pointillé = couloir   silhouette rouge + nombre = ennemis   Les flèches du clavier déplacent aussi",
  phaseMove: "Choisissez où aller. Franchir une porte déclenche un test d'accident.",
  phaseAdjust: "Phase d'ajustement. Faites les missions de la salle ou changez d'équipement, puis déplacez-vous.",
  inRoom: "Position : {r} ({d})", inHall: "Position : couloir",
  wounds: "Blessures", st_vp: "PV",
  btnMission: "Faire la mission : {m}", btnMed: "Se faire soigner (2d6)", btnArmory: "Prendre à l'armurerie", btnEquip: "Changer d'équipement", btnExit: "Terminer la partie ici (s'échapper)",
  mi_blast: "Sabotage (1 explosif)", mi_steal: "Vol (kit de documents)", noEP: "Pas d'explosif", noKit: "Pas de kit de documents",
  r_EH: "Hall de l'ascenseur", r_CP: "Poste de commandement", r_RC: "Archives", r_GP: "Quartiers du général", r_AS: "Armurerie", r_TP: "Réserve", r_PP: "Caserne", r_LR: "Salle radar", r_ER: "Salle des générateurs", r_LS: "Laboratoire", r_CC: "Centre médical",
  rd_EH: "Sortie. Vous pouvez terminer la partie ici", rd_CP: "Sabotage. Bonus spécial 10 PV", rd_RC: "Vol. Bonus spécial 6 PV", rd_GP: "Vol. En cas d'échec, vous êtes envoyé 4 cases au sud", rd_AS: "Prenez les armes que vous voulez. Pas de grenades en combat ici",
  rd_TP: "Rien ici", rd_PP: "S'il y a des ennemis, ils sont toujours 10", rd_LR: "Sabotage. Bonus spécial 6 PV", rd_ER: "Sabotage", rd_LS: "Sabotage. Bonus spécial Big K Gun et 20 PV", rd_CC: "Soigner 2d6 (une fois)",
  it_SMG: "Pistolet-mitrailleur", it_AR: "Fusil d'assaut", it_P: "Pistolet", it_ATR: "Fusil antichar", it_BIGK: "Big K Gun",
  it_G: "Grenade", it_N: "Couteau", it_LSMG: "Munitions PM", it_LAR: "Munitions fusil", it_LP: "Munitions pistolet", it_LATR: "Munitions antichar", it_EP: "Explosif", it_K: "Kit de documents", it_U: "Parapluie", it_B: "Bible",
  itd_U: "Totalement inutile", itd_B: "Totalement inutile",
  empty: "vide", onHand: "Main", onShoulder: "Épaule", onBelt: "Ceinture", onRuck: "Sac", dropped: "Lâché",
  sk_knifeThrow: "Lancer de couteau", sk_karate: "Karaté", sk_grenade: "Grenade", sk_smg: "PM", sk_pistol: "Pistolet", sk_ar: "Fusil d'assaut", sk_reload: "Rechargement rapide", sk_flee: "Fuite", sk_suggest: "Suggestion",
  m_start: "L'infiltration commence au hall de l'ascenseur.",
  m_moved: "Déplacement {dir}.", m_wall: "C'est un mur.", m_door: "Vous franchissez une porte.",
  m_acc0: "Test d'accident 1d6={d} (moins que Chance {l}) : rien ne se passe.",
  m_acc: "Test d'accident 1d6={d}, 2d6={n} : {t}",
  a_laser: "Piège laser ! {n} blessures.", a_trip: "Vous trébuchez. Au premier round du prochain combat, vos points d'action sont égaux à votre Chance.", a_tv: "Repéré par un écran de surveillance ! Il y a forcément des ennemis ici.", a_sneeze: "Un éternuement ! Vous avez lâché votre arme principale.", a_hic: "Hoquet. Aucun effet.",
  m_room: "C'est : {r}.", m_enemy: "{n} ennemis repérés : {x} !", cell_here: "cette case", cell_n: "au nord", cell_s: "au sud", cell_e: "à l'est", cell_w: "à l'ouest",
  m_noEnemy: "Aucun ennemi.", m_heal: "Vous vous reposez dans la salle et soignez 1 blessure.", m_healed: "{n} soigné(s).",
  m_mOk: "Mission réussie ! 1d6={d} (Savoir {k} ou moins) : {d} PV gagnés.", m_mNg: "Mission échouée. 1d6={d} (Savoir {k}).",
  m_sb: "Bonus spécial ! {v} PV de plus.", m_bigk: "Vous avez la Big K Gun ! 20 PV de plus.",
  m_gp: "Défenses automatiques ! Vous êtes envoyé 4 cases au sud.",
  m_lvChk: "Test pour chaque 10 ennemis : 1d6={d}.", m_lvUp: "{a} passe à {n} !", m_newSk: "Nouvelle compétence bonus : {s}",
  m_flee: "Vous vous êtes échappé ! Retour à la case précédente.",
  cb_men: "{n}", cb_title: "COMBAT", cb_round: "Round {r}   {n} ennemis", apLab: "Points d'action",
  cb_st: "Blessures {w}/{e}   {p}", prone: "Couché", standing: "Debout",
  cb_pick: "Cliquez sur la case cible", endRound: "Fin du round (riposte ennemie)", cancel: "Annuler",
  ac_auto: "Rafale", ac_single: "Coup par coup", ac_pistol: "Tir au pistolet", ac_grenade: "Grenade", ac_knife: "Attaque au couteau", ac_throw: "Lancer de couteau", ac_melee: "Corps à corps", ac_atr: "Tir antichar", ac_karate: "Karaté", ac_reload: "Recharger (remplir le chargeur)", ac_swap: "Changer d'arme (de l'épaule)", ac_prone: "Se coucher", ac_stand: "Se relever", ac_surr: "Exiger la reddition", ac_flee: "Fuir", ac_bigk: "Big K Gun",
  all: "tout", c_ap: "{r} points d'action (2d6={d} + Réflexes {e})", c_ap_trip: "{r} points d'action (trébuché : Chance)",
  c_shot: "{w} 2d6={d} + Précision {a} = {t} (il faut {n}) : {res}", c_hit: "touché", c_miss: "raté",
  c_empty: "{w} est vide (1d6={d}).", c_nade: "Grenade (2d6={d} + Chance {l} + Précision {a}) / 4 = {n} ennemis abattus.",
  c_knife: "Couteau 1d6={d} + Précision {a} = {t} (il faut 7) : {res}", c_kdrop: "Vous avez lâché le couteau (1d6={d}).",
  c_throw: "Lancer de couteau 1d6={d} (4 ou moins) : {res}", c_melee: "Corps à corps 1d6={d} + Force {s} = {t} (il faut 16) : {res}",
  c_kar: "Karaté 1d6={d} (4 ou moins) : {res}", c_reload: "Rechargé : {w}.", c_swap: "En main : {w}.", c_prone: "Vous vous couchez.", c_stand: "Vous vous relevez.",
  c_surr: "Reddition 1d6={d} (4 ou moins) : {res}", c_surrOk: "Tous les ennemis se rendent !", c_surrNg: "Ils refusent.",
  c_flee: "Fuite 2d6={d} + Chance {l} = {t} (il faut 12) : {res}", c_ok: "réussite", c_ng: "échec",
  c_big: "Big K Gun 1d6={d} (5 ou moins) : {res}",
  c_cnt: "Riposte : {a} tirent, {p} paniquent. {n} blessures.", c_win: "Tous les ennemis sont abattus !", c_nothing: "Aucune cible.", c_ko: "Vous perdez connaissance...",
  endTitle: "FIN DE PARTIE", endCap: "Vous avez perdu connaissance et avez été capturé. Les PV des documents volés sont perdus.", endBack: "Vous vous êtes échappé par l'ascenseur !",
  endScore: "PV {v} / {k} ennemis abattus / {t} tours", rank: "Grade : {r}",
  rk_0: "Recrue", rk_1: "Soldat", rk_2: "Vétéran", rk_3: "Forces spéciales", rk_4: "Commando légendaire",
  dlgEquip: "Changer d'équipement", dlgArmory: "Armurerie (prenez ce que vous voulez)", takeHand: "En main", toShoulder: "À l'épaule", pickUp: "Ramasser", discard: "Jeter", take: "Prendre", toBelt: "▲ à la ceinture", toRuck: "▼ dans le sac",
  rulesTitle: "Règles",
  rulesBody: `BUT
Vous commencez au hall de l'ascenseur, au centre d'une base secrète. Accomplissez des missions dans les salles pour gagner des points de victoire (PV), puis regagnez un ascenseur pour terminer. Si vos blessures atteignent votre Endurance, vous êtes capturé.

DÉROULEMENT DU TOUR
1. Déplacez-vous d'exactement 1 case. Les murs vous bloquent.
2. Franchir une porte déclenche un test d'accident. Si 1d6 est égal ou supérieur à votre Chance, 2d6 détermine l'accident.
3. Tirez les côtés de la nouvelle case (1,2 = mur, 3,4 = porte, 5,6 = couloir).
4. Si les quatre côtés sont des murs ou des portes, c'est une salle. 2d6 détermine laquelle.
5. Vérifiez la présence d'ennemis dans les cases nouvellement visibles (1d6 de 3 ou moins : 1d6 ennemis).
6. S'il y a des ennemis, vous combattez.
7. Ajustement : dans une salle, vous soignez 1 blessure. Vous pouvez aussi faire des missions et changer d'équipement.

VISION
Vous voyez votre case et les cases voisines reliées par un couloir. Vous ne voyez pas à travers les murs ni les portes.

COMBAT
À chaque round, 2d6 + Réflexes donnent vos points d'action. Les points non utilisés sont perdus.
Vous agissez d'abord, puis les survivants ripostent.
Les ennemis qui font 1-4 sur 1d6 tirent. Chacun lance 1d6 pour les blessures (0-7 donne 0,1,1,1,2,2,3,4). Couché : -1. Un ennemi sur votre case : +1.
Un tir touche quand 2d6 + Précision atteint le nombre de l'arme. Après le tir, un 1d6 égal ou inférieur à son nombre de munitions signifie qu'elle est vide.
Les actions marquées tout (7+) demandent 7 points ou plus et sont la seule action du round.
Couché, seules les actions marquées P sont possibles.

BLESSURES
Au-delà de la moitié de votre Endurance, chaque tranche de 3 blessures coûte 1 en Réflexes et en Précision, et chaque blessure supplémentaire coûte 1 en Force.

MISSIONS
Le sabotage demande un explosif ; le vol, un kit de documents. Un 1d6 égal ou inférieur à votre Savoir réussit, et ce jet donne vos PV. Un autre 1d6 de 1 donne un bonus spécial.

PROGRESSION
Pour chaque 10 ennemis abattus, un 1d6 de 2 ou moins augmente une caractéristique.`,
};

DC_TEXT.it = {
  title: "DONKEY COMMAND", sub: "Infiltrati da solo nella base segreta, porta a termine le missioni e torna all'ascensore",
  backTop: "Pagina iniziale", rules: "Regole", langOther: "Lingua", close: "Chiudi",
  h0: "Difficoltà", diff_easy: "Facile", diff_normal: "Normale", diff_hard: "Difficile", diff_veryhard: "Molto difficile",
  diffd_easy: "Caratteristiche e carico x1,5", diffd_normal: "Caratteristiche e carico x1,2",
  diffd_hard: "Le regole originali", diffd_veryhard: "Caratteristiche e carico x0,8",
  h1: "1. Tira le caratteristiche", roll: "Tira le caratteristiche", reroll: "Ritira",
  h2: "2. Scegli l'equipaggiamento", auto: "Equipaggiamento automatico", autoNote: "Scelto in base a caratteristiche e abilità. Puoi modificarlo dopo", start: "Inizia l'infiltrazione", again: "Gioca ancora",
  ab_end: "Resistenza", ab_str: "Forza", ab_luck: "Fortuna", ab_know: "Conoscenza", ab_reac: "Riflessi", ab_acc: "Precisione",
  abd_end: "Se le ferite raggiungono questo numero, svieni e vieni catturato", abd_str: "Peso che puoi portare", abd_luck: "Aiuta con incidenti, fuga e granate",
  abd_know: "Riuscita delle missioni di sabotaggio e furto", abd_reac: "Punti azione in combattimento", abd_acc: "Colpire con le armi",
  bonusSum: "Totale dei dadi Riflessi + Precisione: {n} (con 20 o più ottieni un'abilità bonus)",
  noBonus: "Nessuna abilità bonus", bonusGot: "Abilità bonus: {s}",
  eqInfo: "Peso {w} / {max}   Cintura {b} / {bm}   Armi {g} / 3 (1 in mano + 2 in spalla)",
  belt: "Cintura", ruck: "Zaino", gun: "Arma", lMain: "Arma in mano:", none: "Nessuna",
  errWeight: "Troppo pesante", errBelt: "La cintura contiene {n} oggetti", errGuns: "Puoi portare 3 armi",
  hMove: "Movimento (esattamente 1 casella per turno)", north: "N ↑", south: "S ↓", east: "E →", west: "← O",
  hPhase: "Cosa fare ora", hMsgs: "Questo turno", hStat: "Commando", hEq: "Equipaggiamento",
  turn: "Turno {t}   PV {v}   Nemici abbattuti {k}",
  legend: "★ tu   spesso = muro   marrone = porta   tratteggiato = corridoio   figura rossa + numero = nemici   Puoi muoverti anche con le frecce",
  phaseMove: "Scegli dove andare. Attraversare una porta comporta un controllo incidenti.",
  phaseAdjust: "Fase di sistemazione. Fai le missioni della stanza o cambia equipaggiamento, poi muoviti.",
  inRoom: "Posizione: {r} ({d})", inHall: "Posizione: corridoio",
  wounds: "Ferite", st_vp: "PV",
  btnMission: "Esegui missione: {m}", btnMed: "Farsi curare (2d6)", btnArmory: "Prendi dall'armeria", btnEquip: "Cambia equipaggiamento", btnExit: "Termina qui la partita (fuga)",
  mi_blast: "Sabotaggio (1 esplosivo)", mi_steal: "Furto (kit documenti)", noEP: "Nessun esplosivo", noKit: "Nessun kit documenti",
  r_EH: "Atrio dell'ascensore", r_CP: "Posto di comando", r_RC: "Archivio", r_GP: "Alloggi del generale", r_AS: "Armeria", r_TP: "Magazzino", r_PP: "Caserma", r_LR: "Sala radar", r_ER: "Sala generatori", r_LS: "Laboratorio", r_CC: "Centro medico",
  rd_EH: "Uscita. Qui puoi terminare la partita", rd_CP: "Sabotaggio. Bonus speciale 10 PV", rd_RC: "Furto. Bonus speciale 6 PV", rd_GP: "Furto. Se fallisci vieni spedito 4 caselle a sud", rd_AS: "Prendi le armi che vuoi. Qui niente granate in combattimento",
  rd_TP: "Qui non c'è niente", rd_PP: "Se ci sono nemici, sono sempre 10", rd_LR: "Sabotaggio. Bonus speciale 6 PV", rd_ER: "Sabotaggio", rd_LS: "Sabotaggio. Bonus speciale Big K Gun e 20 PV", rd_CC: "Cura 2d6 (una volta)",
  it_SMG: "Mitra", it_AR: "Fucile d'assalto", it_P: "Pistola", it_ATR: "Fucile anticarro", it_BIGK: "Big K Gun",
  it_G: "Granata", it_N: "Coltello", it_LSMG: "Munizioni mitra", it_LAR: "Munizioni fucile", it_LP: "Munizioni pistola", it_LATR: "Munizioni anticarro", it_EP: "Esplosivo", it_K: "Kit documenti", it_U: "Ombrello", it_B: "Bibbia",
  itd_U: "Del tutto inutile", itd_B: "Del tutto inutile",
  empty: "scarica", onHand: "Mano", onShoulder: "Spalla", onBelt: "Cintura", onRuck: "Zaino", dropped: "Caduta",
  sk_knifeThrow: "Lancio del coltello", sk_karate: "Karate", sk_grenade: "Granata", sk_smg: "Mitra", sk_pistol: "Pistola", sk_ar: "Fucile d'assalto", sk_reload: "Ricarica rapida", sk_flee: "Fuga", sk_suggest: "Suggestione",
  m_start: "L'infiltrazione inizia nell'atrio dell'ascensore.",
  m_moved: "Ti muovi {dir}.", m_wall: "Lì c'è un muro.", m_door: "Attraversi una porta.",
  m_acc0: "Controllo incidenti 1d6={d} (meno di Fortuna {l}): non succede niente.",
  m_acc: "Controllo incidenti 1d6={d}, 2d6={n}: {t}",
  a_laser: "Trappola laser! {n} ferite.", a_trip: "Inciampi. Nel primo round del prossimo combattimento i tuoi punti azione saranno pari alla Fortuna.", a_tv: "Ripreso da un monitor! Qui ci sono di sicuro nemici.", a_sneeze: "Uno starnuto! Ti è caduta l'arma principale.", a_hic: "Singhiozzo. Nessun effetto.",
  m_room: "Questa è: {r}.", m_enemy: "{n} nemici avvistati: {x}!", cell_here: "questa casella", cell_n: "a nord", cell_s: "a sud", cell_e: "a est", cell_w: "a ovest",
  m_noEnemy: "Nessun nemico.", m_heal: "Riposi nella stanza e curi 1 ferita.", m_healed: "Curate {n}.",
  m_mOk: "Missione riuscita! 1d6={d} (Conoscenza {k} o meno): {d} PV guadagnati.", m_mNg: "Missione fallita. 1d6={d} (Conoscenza {k}).",
  m_sb: "Bonus speciale! {v} PV in più.", m_bigk: "Hai la Big K Gun! 20 PV in più.",
  m_gp: "Difese automatiche! Vieni spedito 4 caselle a sud.",
  m_lvChk: "Controllo per ogni 10 nemici: 1d6={d}.", m_lvUp: "{a} sale a {n}!", m_newSk: "Nuova abilità bonus: {s}",
  m_flee: "Sei fuggito! Torni alla casella precedente.",
  cb_men: "{n}", cb_title: "COMBATTIMENTO", cb_round: "Round {r}   {n} nemici", apLab: "Punti azione",
  cb_st: "Ferite {w}/{e}   {p}", prone: "A terra", standing: "In piedi",
  cb_pick: "Clicca sulla casella bersaglio", endRound: "Fine round (fuoco nemico)", cancel: "Annulla",
  ac_auto: "Raffica", ac_single: "Colpo singolo", ac_pistol: "Colpo di pistola", ac_grenade: "Granata", ac_knife: "Attacco col coltello", ac_throw: "Lancio del coltello", ac_melee: "Corpo a corpo", ac_atr: "Colpo anticarro", ac_karate: "Karate", ac_reload: "Ricarica (riempi il caricatore)", ac_swap: "Cambia arma (dalla spalla)", ac_prone: "Buttati a terra", ac_stand: "Alzati", ac_surr: "Intima la resa", ac_flee: "Fuggi", ac_bigk: "Big K Gun",
  all: "tutto", c_ap: "{r} punti azione (2d6={d} + Riflessi {e})", c_ap_trip: "{r} punti azione (inciampato: Fortuna)",
  c_shot: "{w} 2d6={d} + Precisione {a} = {t} (serve {n}): {res}", c_hit: "colpito", c_miss: "mancato",
  c_empty: "{w} è scarica (1d6={d}).", c_nade: "Granata (2d6={d} + Fortuna {l} + Precisione {a}) / 4 = {n} nemici abbattuti.",
  c_knife: "Coltello 1d6={d} + Precisione {a} = {t} (serve 7): {res}", c_kdrop: "Ti è caduto il coltello (1d6={d}).",
  c_throw: "Lancio del coltello 1d6={d} (4 o meno): {res}", c_melee: "Corpo a corpo 1d6={d} + Forza {s} = {t} (serve 16): {res}",
  c_kar: "Karate 1d6={d} (4 o meno): {res}", c_reload: "Ricaricato: {w}.", c_swap: "Ora impugni: {w}.", c_prone: "Ti butti a terra.", c_stand: "Ti alzi.",
  c_surr: "Resa 1d6={d} (4 o meno): {res}", c_surrOk: "Tutti i nemici si arrendono!", c_surrNg: "Si rifiutano.",
  c_flee: "Fuga 2d6={d} + Fortuna {l} = {t} (serve 12): {res}", c_ok: "successo", c_ng: "fallimento",
  c_big: "Big K Gun 1d6={d} (5 o meno): {res}",
  c_cnt: "Fuoco nemico: {a} sparano, {p} vanno nel panico. {n} ferite.", c_win: "Tutti i nemici sono abbattuti!", c_nothing: "Nessun bersaglio.", c_ko: "Svieni...",
  endTitle: "FINE PARTITA", endCap: "Sei svenuto e sei stato catturato. I PV dei documenti rubati sono persi.", endBack: "Sei fuggito con l'ascensore!",
  endScore: "PV {v} / {k} nemici abbattuti / {t} turni", rank: "Grado: {r}",
  rk_0: "Recluta", rk_1: "Soldato", rk_2: "Veterano", rk_3: "Forze speciali", rk_4: "Commando leggendario",
  dlgEquip: "Cambia equipaggiamento", dlgArmory: "Armeria (prendi ciò che vuoi)", takeHand: "Impugna", toShoulder: "In spalla", pickUp: "Raccogli", discard: "Getta", take: "Prendi", toBelt: "▲ alla cintura", toRuck: "▼ nello zaino",
  rulesTitle: "Regole",
  rulesBody: `SCOPO
Inizi nell'atrio dell'ascensore, al centro di una base segreta. Porta a termine missioni nelle stanze per guadagnare punti vittoria (PV), poi torna a un ascensore per finire. Se le ferite raggiungono la tua Resistenza, vieni catturato.

SEQUENZA DEL TURNO
1. Muoviti di esattamente 1 casella. I muri ti bloccano.
2. Attraversare una porta comporta un controllo incidenti. Se 1d6 è pari o superiore alla Fortuna, 2d6 decide l'incidente.
3. Tira i lati della nuova casella (1,2 = muro, 3,4 = porta, 5,6 = corridoio).
4. Se tutti e quattro i lati sono muri o porte, è una stanza. 2d6 decide quale.
5. Controlla i nemici nelle caselle appena visibili (1d6 di 3 o meno: 1d6 nemici).
6. Se ci sono nemici, combatti.
7. Sistemazione: nelle stanze curi 1 ferita. Puoi anche fare missioni e cambiare equipaggiamento.

VISTA
Vedi la tua casella e quelle vicine collegate da un corridoio. Non vedi attraverso muri e porte.

COMBATTIMENTO
A ogni round, 2d6 + Riflessi danno i punti azione. I punti non usati vanno persi.
Agisci per primo, poi i sopravvissuti rispondono al fuoco.
I nemici che fanno 1-4 su 1d6 sparano. Ognuno tira 1d6 per le ferite (0-7 dà 0,1,1,1,2,2,3,4). A terra -1. Un nemico nella tua casella +1.
Un colpo va a segno quando 2d6 + Precisione raggiunge il numero dell'arma. Dopo lo sparo, un 1d6 pari o inferiore al suo numero di munizioni significa che è scarica.
Le azioni segnate tutto (7+) richiedono 7 punti o più e sono l'unica azione del round.
A terra puoi fare solo le azioni segnate P.

FERITE
Oltre la metà della Resistenza, ogni 3 ferite in più costano 1 di Riflessi e di Precisione, e ogni ferita in più costa 1 di Forza.

MISSIONI
Il sabotaggio richiede un esplosivo; il furto un kit documenti. Un 1d6 pari o inferiore alla Conoscenza riesce, e quel tiro sono i tuoi PV. Un altro 1d6 di 1 dà un bonus speciale.

CRESCITA
Ogni 10 nemici abbattuti, un 1d6 di 2 o meno aumenta una caratteristica.`,
};

DC_TEXT.zh = {
  title: "DONKEY COMMAND", sub: "独自潜入秘密基地，完成任务后返回电梯",
  backTop: "首页", rules: "规则", langOther: "语言", close: "关闭",
  h0: "难度", diff_easy: "简单", diff_normal: "普通", diff_hard: "困难", diff_veryhard: "非常困难",
  diffd_easy: "能力和负重 x1.5", diffd_normal: "能力和负重 x1.2",
  diffd_hard: "原版规则", diffd_veryhard: "能力和负重 x0.8",
  h1: "1. 掷出能力值", roll: "掷能力值", reroll: "重掷",
  h2: "2. 选择装备", auto: "自动装备", autoNote: "根据能力和技能选择，之后可以修改", start: "开始潜入", again: "再玩一次",
  ab_end: "耐久", ab_str: "体力", ab_luck: "运气", ab_know: "知识", ab_reac: "反应", ab_acc: "精准",
  abd_end: "伤害达到此数值时昏迷并被俘", abd_str: "可携带的重量", abd_luck: "影响意外、逃跑和手榴弹",
  abd_know: "爆破和窃取任务的成功率", abd_reac: "战斗中的行动点数", abd_acc: "武器命中",
  bonusSum: "反应 + 精准的骰子合计：{n}（20 以上获得奖励技能）",
  noBonus: "没有奖励技能", bonusGot: "奖励技能：{s}",
  eqInfo: "重量 {w} / {max}　腰带 {b} / {bm}　枪 {g} / 3（手持 1 + 肩背 2）",
  belt: "腰带", ruck: "背包", gun: "枪", lMain: "手持的枪：", none: "无",
  errWeight: "太重了", errBelt: "腰带最多放 {n} 件", errGuns: "最多携带 3 把枪",
  hMove: "移动（每回合必须移动 1 格）", north: "北 ↑", south: "南 ↓", east: "东 →", west: "← 西",
  hPhase: "现在要做的事", hMsgs: "本回合", hStat: "突击队员", hEq: "装备",
  turn: "回合 {t}　VP {v}　击倒敌人 {k}",
  legend: "★自己　粗线=墙　棕色=门　虚线=通道　红色人形和数字=敌人数量　也可以用方向键移动",
  phaseMove: "请选择移动方向。穿过门时要检定意外。",
  phaseAdjust: "调整阶段。可以执行房间任务或更换装备，然后移动。",
  inRoom: "当前位置：{r}（{d}）", inHall: "当前位置：通道",
  wounds: "伤害", st_vp: "VP",
  btnMission: "执行任务：{m}", btnMed: "接受治疗（恢复 2d6）", btnArmory: "从武器库拿取", btnEquip: "更换装备", btnExit: "在此结束游戏（撤离）",
  mi_blast: "爆破（炸药 1 个）", mi_steal: "窃取（文件回收包）", noEP: "没有炸药", noKit: "没有文件回收包",
  r_EH: "电梯大厅", r_CP: "指挥室", r_RC: "资料室", r_GP: "将官房间", r_AS: "武器库", r_TP: "储藏室", r_PP: "兵营", r_LR: "雷达无线电室", r_ER: "发电室", r_LS: "研究室", r_CC: "医疗中心",
  rd_EH: "出口。可以在这里结束游戏", rd_CP: "爆破。特别奖励 VP10", rd_RC: "窃取。特别奖励 VP6", rd_GP: "窃取。失败会被传送到南方 4 格", rd_AS: "可以拿任何武器。在此战斗时不能用手榴弹",
  rd_TP: "什么都没有", rd_PP: "如果有敌人，一定是 10 人", rd_LR: "爆破。特别奖励 VP6", rd_ER: "爆破", rd_LS: "爆破。特别奖励：Big K 枪和 VP20", rd_CC: "恢复 2d6（一次）",
  it_SMG: "冲锋枪", it_AR: "突击步枪", it_P: "手枪", it_ATR: "反坦克步枪", it_BIGK: "Big K 枪",
  it_G: "手榴弹", it_N: "匕首", it_LSMG: "冲锋枪弹药", it_LAR: "步枪弹药", it_LP: "手枪弹药", it_LATR: "反坦克弹药", it_EP: "炸药", it_K: "文件回收包", it_U: "雨伞", it_B: "圣经",
  itd_U: "毫无用处", itd_B: "毫无用处",
  empty: "没子弹", onHand: "手", onShoulder: "肩", onBelt: "腰带", onRuck: "背包", dropped: "掉落",
  sk_knifeThrow: "飞刀", sk_karate: "空手道", sk_grenade: "手榴弹", sk_smg: "冲锋枪", sk_pistol: "手枪", sk_ar: "突击步枪", sk_reload: "快速换弹", sk_flee: "逃跑", sk_suggest: "暗示",
  m_start: "从电梯大厅开始潜入。",
  m_moved: "向{dir}移动。", m_wall: "那里是墙。", m_door: "穿过了门。",
  m_acc0: "意外检定 1d6={d}（小于运气 {l}）：什么也没发生。",
  m_acc: "意外检定 1d6={d}，2d6={n}：{t}",
  a_laser: "激光陷阱！受到 {n} 点伤害。", a_trip: "你绊倒了。下一场战斗的第一轮，行动点数等于运气。", a_tv: "被监视器拍到了！这里一定有敌人。", a_sneeze: "打了个喷嚏！主武器掉了。", a_hic: "打嗝。没有影响。",
  m_room: "这里是{r}。", m_enemy: "在{x}发现 {n} 名敌人！", cell_here: "这一格", cell_n: "北边", cell_s: "南边", cell_e: "东边", cell_w: "西边",
  m_noEnemy: "没有敌人。", m_heal: "在房间里休息，恢复 1 点伤害。", m_healed: "恢复了 {n}。",
  m_mOk: "任务成功！1d6={d}（知识 {k} 以下）：获得 VP {d}。", m_mNg: "任务失败。1d6={d}（知识 {k}）。",
  m_sb: "特别奖励！再加 VP {v}。", m_bigk: "得到了 Big K 枪！再加 VP20。",
  m_gp: "自动防御装置！你被传送到南方 4 格。",
  m_lvChk: "每击倒 10 名敌人的检定：1d6={d}。", m_lvUp: "{a}提升到 {n}！", m_newSk: "新的奖励技能：{s}",
  m_flee: "逃跑成功！回到了上一格。",
  cb_men: "{n}", cb_title: "战斗", cb_round: "第 {r} 轮　敌人 {n} 名", apLab: "行动点数",
  cb_st: "伤害 {w}/{e}　{p}", prone: "卧倒", standing: "站立",
  cb_pick: "请点击目标格", endRound: "结束本轮（敌人反击）", cancel: "取消",
  ac_auto: "连射", ac_single: "单发", ac_pistol: "手枪射击", ac_grenade: "手榴弹", ac_knife: "匕首攻击", ac_throw: "飞刀", ac_melee: "肉搏", ac_atr: "反坦克步枪射击", ac_karate: "空手道", ac_reload: "换弹（装满弹匣）", ac_swap: "换武器（从肩上）", ac_prone: "卧倒", ac_stand: "站起来", ac_surr: "劝降", ac_flee: "逃跑", ac_bigk: "Big K 枪",
  all: "全部", c_ap: "行动点数 {r}（2d6={d} + 反应 {e}）", c_ap_trip: "行动点数 {r}（绊倒：运气）",
  c_shot: "{w} 2d6={d} + 精准 {a} = {t}（需要 {n}）：{res}", c_hit: "命中", c_miss: "未命中",
  c_empty: "{w}没子弹了（1d6={d}）。", c_nade: "手榴弹（2d6={d} + 运气 {l} + 精准 {a}）/ 4 = 击倒 {n} 名敌人。",
  c_knife: "匕首 1d6={d} + 精准 {a} = {t}（需要 7）：{res}", c_kdrop: "匕首掉了（1d6={d}）。",
  c_throw: "飞刀 1d6={d}（4 以下）：{res}", c_melee: "肉搏 1d6={d} + 体力 {s} = {t}（需要 16）：{res}",
  c_kar: "空手道 1d6={d}（4 以下）：{res}", c_reload: "{w}已换弹。", c_swap: "现在手持{w}。", c_prone: "你卧倒了。", c_stand: "你站了起来。",
  c_surr: "劝降 1d6={d}（4 以下）：{res}", c_surrOk: "所有敌人都投降了！", c_surrNg: "他们拒绝了。",
  c_flee: "逃跑 2d6={d} + 运气 {l} = {t}（需要 12）：{res}", c_ok: "成功", c_ng: "失败",
  c_big: "Big K 枪 1d6={d}（5 以下）：{res}",
  c_cnt: "敌人反击：{a} 人射击，{p} 人惊慌。受到 {n} 点伤害。", c_win: "所有敌人都被击倒了！", c_nothing: "没有目标。", c_ko: "你昏过去了……",
  endTitle: "游戏结束", endCap: "你昏迷后被俘。窃取文件的 VP 作废。", endBack: "你乘电梯撤离了！",
  endScore: "VP {v} / 击倒敌人 {k} / {t} 回合", rank: "军衔：{r}",
  rk_0: "新兵", rk_1: "士兵", rk_2: "老兵", rk_3: "特种部队", rk_4: "传奇突击队员",
  dlgEquip: "更换装备", dlgArmory: "武器库（想拿什么就拿什么）", takeHand: "手持", toShoulder: "背到肩上", pickUp: "捡起", discard: "丢弃", take: "拿取", toBelt: "▲ 放到腰带", toRuck: "▼ 放进背包",
  rulesTitle: "规则",
  rulesBody: `目标
从秘密基地中央的电梯大厅出发。在房间里完成任务获得胜利点数（VP），然后回到电梯结束游戏。伤害达到耐久时会被俘。

回合顺序
1. 必须移动 1 格。墙挡住去路。
2. 穿过门时要检定意外。1d6 大于等于运气时，用 2d6 决定意外内容。
3. 掷出新格子四边（1、2 = 墙，3、4 = 门，5、6 = 通道）。
4. 四边都是墙或门时，就是房间。用 2d6 决定是哪个房间。
5. 检查新看到的格子里有没有敌人（1d6 为 3 以下时有 1d6 名敌人）。
6. 有敌人就战斗。
7. 调整：在房间里恢复 1 点伤害。也可以执行任务和更换装备。

视野
能看到自己所在的格子，以及用通道相连的相邻格子。看不到墙和门的另一边。

战斗
每轮用 2d6 + 反应决定行动点数。没用完的点数作废。
你先行动，然后幸存的敌人反击。
1d6 掷出 1-4 的敌人会射击。每人掷 1d6 决定伤害（0-7 对应 0,1,1,1,2,2,3,4）。卧倒 -1。敌人和你在同一格 +1。
2d6 + 精准达到武器的数值即命中。射击后掷 1d6，小于等于弹药数值就没子弹了。
标有"全部（7+）"的行动需要 7 点以上，并且是本轮唯一的行动。
卧倒时只能进行标有 P 的行动。

伤害
超过耐久的一半后，每多 3 点伤害，反应和精准各减 1；每多 1 点伤害，体力减 1。

任务
爆破需要炸药，窃取需要文件回收包。1d6 小于等于知识即成功，这个点数就是获得的 VP。再掷 1d6 为 1 时获得特别奖励。

成长
每击倒 10 名敌人，1d6 为 2 以下时提升一项能力。`,
};

DC_TEXT.ko = {
  title: "동키 코만도", sub: "비밀 기지에 단독으로 잠입해 임무를 완수하고 엘리베이터로 돌아오라",
  backTop: "첫 페이지", rules: "규칙", langOther: "언어", close: "닫기",
  h0: "난이도", diff_easy: "쉬움", diff_normal: "보통", diff_hard: "어려움", diff_veryhard: "매우 어려움",
  diffd_easy: "능력치와 소지량 x1.5", diffd_normal: "능력치와 소지량 x1.2",
  diffd_hard: "원래 규칙", diffd_veryhard: "능력치와 소지량 x0.8",
  h1: "1. 능력치 굴리기", roll: "능력치 굴리기", reroll: "다시 굴리기",
  h2: "2. 장비 고르기", auto: "자동 장비", autoNote: "능력치와 기술에 맞춰 고릅니다. 나중에 바꿀 수 있습니다", start: "잠입 시작", again: "다시 하기",
  ab_end: "내구력", ab_str: "체력", ab_luck: "운", ab_know: "지식", ab_reac: "반응", ab_acc: "정확성",
  abd_end: "부상이 이 수에 이르면 기절해 포로가 된다", abd_str: "들 수 있는 장비의 무게", abd_luck: "사고, 도주, 수류탄에 영향",
  abd_know: "폭파와 탈취의 성공률", abd_reac: "전투의 행동 포인트", abd_acc: "사격 명중",
  bonusSum: "반응과 정확성 주사위 합계: {n} (20 이상이면 보너스 기술)",
  noBonus: "보너스 기술 없음", bonusGot: "보너스 기술: {s}",
  eqInfo: "무게 {w} / {max}   벨트 {b} / {bm}   총 {g} / 3 (손 1 + 어깨 2)",
  belt: "벨트", ruck: "배낭", gun: "총", lMain: "손에 든 총:", none: "없음",
  errWeight: "너무 무겁습니다", errBelt: "벨트에는 {n}개까지입니다", errGuns: "총은 3정까지입니다",
  hMove: "이동 (매 턴 반드시 1칸)", north: "북 ↑", south: "남 ↓", east: "동 →", west: "← 서",
  hPhase: "지금 할 일", hMsgs: "이번 턴", hStat: "코만도 상태", hEq: "장비",
  turn: "턴 {t}   VP {v}   쓰러뜨린 적 {k}",
  legend: "★자신   굵은 선=벽   갈색=문   점선=통로   빨간 사람과 숫자=적의 수   방향키로도 이동할 수 있습니다",
  phaseMove: "이동할 곳을 고르세요. 문을 지나면 사고 판정이 있습니다.",
  phaseAdjust: "조정 단계입니다. 방의 임무나 장비 변경을 하고 나서 이동하세요.",
  inRoom: "현재 위치: {r} ({d})", inHall: "현재 위치: 통로",
  wounds: "부상", st_vp: "VP",
  btnMission: "임무 실행: {m}", btnMed: "치료받기 (2d6 회복)", btnArmory: "무기고에서 가져가기", btnEquip: "장비 변경", btnExit: "여기서 게임 종료 (귀환)",
  mi_blast: "폭파 (폭약 1개)", mi_steal: "탈취 (문서 회수 키트)", noEP: "폭약이 없습니다", noKit: "문서 회수 키트가 없습니다",
  r_EH: "엘리베이터 홀", r_CP: "사령실", r_RC: "자료실", r_GP: "장성 개인실", r_AS: "무기고", r_TP: "창고", r_PP: "병영", r_LR: "레이더 무선실", r_ER: "발전실", r_LS: "연구실", r_CC: "의료 센터",
  rd_EH: "출구. 여기서 게임을 끝낼 수 있다", rd_CP: "폭파. 특별 보너스 VP10", rd_RC: "탈취. 특별 보너스 VP6", rd_GP: "탈취. 실패하면 남쪽으로 4칸 날아간다", rd_AS: "원하는 무기를 얻을 수 있다. 여기서 전투할 때 수류탄은 쓸 수 없다",
  rd_TP: "아무것도 없다", rd_PP: "적이 있으면 반드시 10명", rd_LR: "폭파. 특별 보너스 VP6", rd_ER: "폭파", rd_LS: "폭파. 특별 보너스로 빅 K 건과 VP20", rd_CC: "2d6 회복할 수 있다 (1회)",
  it_SMG: "기관단총", it_AR: "돌격소총", it_P: "권총", it_ATR: "대전차 소총", it_BIGK: "빅 K 건",
  it_G: "수류탄", it_N: "나이프", it_LSMG: "기관단총 탄약", it_LAR: "소총 탄약", it_LP: "권총 탄약", it_LATR: "대전차 탄약", it_EP: "폭약", it_K: "문서 회수 키트", it_U: "우산", it_B: "성경",
  itd_U: "아무 쓸모도 없다", itd_B: "아무 쓸모도 없다",
  empty: "탄 없음", onHand: "손", onShoulder: "어깨", onBelt: "벨트", onRuck: "배낭", dropped: "떨어뜨림",
  sk_knifeThrow: "나이프 던지기", sk_karate: "가라테", sk_grenade: "수류탄", sk_smg: "기관단총", sk_pistol: "권총", sk_ar: "돌격소총", sk_reload: "탄창 교환", sk_flee: "도주", sk_suggest: "암시 능력",
  m_start: "엘리베이터 홀에서 잠입 시작.",
  m_moved: "{dir}(으)로 이동.", m_wall: "거기는 벽입니다.", m_door: "문을 통과.",
  m_acc0: "사고 판정 1d6={d} (운 {l} 미만): 아무 일도 없다.",
  m_acc: "사고 판정 1d6={d}, 2d6={n}: {t}",
  a_laser: "레이저 함정! 부상 {n}.", a_trip: "넘어졌다. 다음 전투의 첫 라운드는 행동 포인트가 운과 같다.", a_tv: "TV 모니터에 찍혔다! 여기에는 틀림없이 적이 있다.", a_sneeze: "재채기! 주 무기를 떨어뜨렸다.", a_hic: "딸꾹질. 효과 없음.",
  m_room: "여기는 {r}입니다.", m_enemy: "{x}에서 적 {n}명 발견!", cell_here: "이 칸", cell_n: "북쪽", cell_s: "남쪽", cell_e: "동쪽", cell_w: "서쪽",
  m_noEnemy: "적이 없다.", m_heal: "방에서 쉬며 부상 1을 회복.", m_healed: "{n} 회복.",
  m_mOk: "임무 성공! 1d6={d} (지식 {k} 이하): VP {d} 획득.", m_mNg: "임무 실패. 1d6={d} (지식 {k}).",
  m_sb: "특별 보너스! VP {v} 추가.", m_bigk: "빅 K 건을 손에 넣었다! VP20 추가.",
  m_gp: "자동 방어 장치! 남쪽으로 4칸 날아갔다.",
  m_lvChk: "적 10명마다의 판정: 1d6={d}.", m_lvUp: "{a}이(가) {n}(으)로 올랐다!", m_newSk: "새 보너스 기술: {s}",
  m_flee: "도주 성공! 이전 칸으로 돌아갔다.",
  cb_men: "{n}", cb_title: "전투", cb_round: "라운드 {r}   적 {n}명", apLab: "행동 포인트",
  cb_st: "부상 {w}/{e}   {p}", prone: "엎드림", standing: "서 있음",
  cb_pick: "목표 칸을 클릭하세요", endRound: "라운드 종료 (적의 반격)", cancel: "취소",
  ac_auto: "연사", ac_single: "단발", ac_pistol: "권총 사격", ac_grenade: "수류탄", ac_knife: "나이프 공격", ac_throw: "나이프 던지기", ac_melee: "격투", ac_atr: "대전차 소총 사격", ac_karate: "가라테", ac_reload: "재장전 (탄창 채우기)", ac_swap: "무기 교체 (어깨에서)", ac_prone: "엎드리기", ac_stand: "일어서기", ac_surr: "항복 권고", ac_flee: "도주", ac_bigk: "빅 K 건",
  all: "전부", c_ap: "행동 포인트 {r} (2d6={d} + 반응 {e})", c_ap_trip: "행동 포인트 {r} (넘어짐: 운)",
  c_shot: "{w} 2d6={d} + 정확성 {a} = {t} (필요 {n}): {res}", c_hit: "명중", c_miss: "빗나감",
  c_empty: "{w} 탄이 떨어졌다 (1d6={d}).", c_nade: "수류탄 (2d6={d} + 운 {l} + 정확성 {a}) / 4 = 적 {n}명 쓰러뜨림.",
  c_knife: "나이프 1d6={d} + 정확성 {a} = {t} (필요 7): {res}", c_kdrop: "나이프를 떨어뜨렸다 (1d6={d}).",
  c_throw: "나이프 던지기 1d6={d} (4 이하): {res}", c_melee: "격투 1d6={d} + 체력 {s} = {t} (필요 16): {res}",
  c_kar: "가라테 1d6={d} (4 이하): {res}", c_reload: "{w} 재장전.", c_swap: "이제 {w}을(를) 들고 있다.", c_prone: "엎드렸다.", c_stand: "일어섰다.",
  c_surr: "항복 1d6={d} (4 이하): {res}", c_surrOk: "적이 모두 항복했다!", c_surrNg: "거부당했다.",
  c_flee: "도주 2d6={d} + 운 {l} = {t} (필요 12): {res}", c_ok: "성공", c_ng: "실패",
  c_big: "빅 K 건 1d6={d} (5 이하): {res}",
  c_cnt: "적의 반격: {a}명 사격, {p}명 패닉. 부상 {n}.", c_win: "적을 모두 쓰러뜨렸다!", c_nothing: "목표가 없다.", c_ko: "기절했다...",
  endTitle: "게임 종료", endCap: "기절해 포로가 되었다. 탈취한 문서의 VP는 사라진다.", endBack: "엘리베이터로 귀환했다!",
  endScore: "VP {v} / 쓰러뜨린 적 {k} / {t}턴", rank: "계급: {r}",
  rk_0: "신병", rk_1: "병사", rk_2: "베테랑", rk_3: "특수부대", rk_4: "전설의 코만도",
  dlgEquip: "장비 변경", dlgArmory: "무기고 (원하는 만큼 가져가기)", takeHand: "손에 들기", toShoulder: "어깨에", pickUp: "줍기", discard: "버리기", take: "가져가기", toBelt: "▲ 벨트로", toRuck: "▼ 배낭으로",
  rulesTitle: "규칙",
  rulesBody: `목표
비밀 기지 한가운데의 엘리베이터 홀에서 시작한다. 방에서 임무를 완수해 승리 점수(VP)를 얻고, 엘리베이터로 돌아와 게임을 끝낸다. 부상이 내구력에 이르면 포로가 된다.

턴 순서
1. 반드시 1칸 이동한다. 벽은 지나갈 수 없다.
2. 문을 지나면 사고 판정을 한다. 1d6이 운 이상이면 2d6으로 사고를 정한다.
3. 새 칸의 네 변을 굴린다 (1, 2 = 벽, 3, 4 = 문, 5, 6 = 통로).
4. 네 변이 모두 벽이나 문이면 방이다. 2d6으로 어떤 방인지 정한다.
5. 새로 보이게 된 칸에 적이 있는지 확인한다 (1d6이 3 이하면 적 1d6명).
6. 적이 있으면 전투한다.
7. 조정: 방에서는 부상 1을 회복한다. 임무와 장비 변경도 할 수 있다.

시야
자신의 칸과, 통로로 이어진 이웃 칸이 보인다. 벽과 문 너머는 보이지 않는다.

전투
매 라운드 2d6 + 반응이 행동 포인트가 된다. 쓰지 않은 포인트는 사라진다.
먼저 행동하고, 그다음 살아남은 적이 반격한다.
1d6에서 1-4가 나온 적이 사격한다. 각자 1d6으로 부상을 정한다 (0-7이 0,1,1,1,2,2,3,4). 엎드리면 -1. 같은 칸의 적은 +1.
2d6 + 정확성이 무기의 수치에 이르면 명중한다. 사격 후 1d6이 탄약 수치 이하이면 탄이 떨어진다.
"전부 (7+)" 표시가 있는 행동은 7포인트 이상이 필요하고, 그 라운드의 유일한 행동이 된다.
엎드려 있을 때는 P 표시가 있는 행동만 할 수 있다.

부상
내구력의 절반을 넘으면, 부상 3이 늘 때마다 반응과 정확성이 1씩, 부상 1이 늘 때마다 체력이 1 줄어든다.

임무
폭파에는 폭약, 탈취에는 문서 회수 키트가 필요하다. 1d6이 지식 이하이면 성공이고, 그 눈이 VP가 된다. 다시 굴린 1d6이 1이면 특별 보너스.

성장
적을 10명 쓰러뜨릴 때마다 1d6이 2 이하이면 능력치 하나가 오른다.`,
};
