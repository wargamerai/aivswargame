'use strict';
const DOKUSO_LANGUAGES = {
  ja: '日本語', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano',
  es: 'Español', zh: '简体中文', ko: '한국어', ru: 'Русский',
};
const DOKUSO_TRANSLATION_ORDER = ['en', 'fr', 'de', 'it', 'es', 'zh', 'ko', 'ru'];
const DOKUSO_TRANSLATIONS = {};
function dokusoTranslationRows(rows) {
  for (const row of rows.trim().split('\n')) {
    const [key, ...values] = row.split('|');
    if (values.length !== 8) throw new Error('Invalid translation: ' + key);
    DOKUSO_TRANSLATIONS[key] = Object.fromEntries(DOKUSO_TRANSLATION_ORDER.map((language, i) => [language, values[i]]));
  }
}
dokusoTranslationRows(`
独ソ電撃戦|Operation Barbarossa|Opération Barbarossa|Unternehmen Barbarossa|Operazione Barbarossa|Operación Barbarroja|巴巴罗萨行动|바르바로사 작전|Операция «Барбаросса»
拡大|Zoom|Zoom|Zoom|Zoom|Zoom|缩放|확대|Масштаб
手戻す|move back|coup en arrière|Zug zurück|mossa indietro|movimiento atrás|步撤销|수 되돌리기|ход назад
移動終了|End movement|Fin du mouvement|Bewegung beenden|Fine movimento|Terminar movimiento|结束移动|이동 종료|Завершить движение
戦闘終了|End combat|Fin des combats|Kampf beenden|Fine combattimento|Terminar combate|结束战斗|전투 종료|Завершить бой
次へ進む|Continue|Continuer|Weiter|Continua|Continuar|继续|계속|Продолжить
未移動へ|Find unmoved|Unités non déplacées|Unbewegte Einheiten|Unità non mosse|Unidades sin mover|查找未移动|미이동 부대 찾기|Неподвиженные части
未攻撃へ|Find unused attackers|Attaquants disponibles|Ungenutzte Angreifer|Attaccanti disponibili|Atacantes disponibles|查找未攻击|미공격 부대 찾기|Неатаковавшие части
ドイツ|Germany|Allemagne|Deutschland|Germania|Alemania|德国|독일|Германия
ソ連|Soviet Union|Union soviétique|Sowjetunion|Unione Sovietica|Unión Soviética|苏联|소련|СССР
遊び方を見る|Read instructions|Lire les instructions|Anleitung lesen|Leggi le istruzioni|Leer instrucciones|查看玩法|도움말 보기|Открыть инструкцию
遊び方|Instructions|Instructions|Anleitung|Istruzioni|Instrucciones|玩法说明|게임 방법|Инструкция
セーブ|Save|Sauvegarder|Speichern|Salva|Guardar|保存|저장|Сохранить
ファイルに保存|Save to file|Enregistrer dans un fichier|In Datei speichern|Salva su file|Guardar en archivo|保存到文件|파일로 저장|Сохранить в файл
ファイルを読み込む|Load from file|Charger depuis un fichier|Aus Datei laden|Carica da file|Cargar desde archivo|从文件读取|파일 불러오기|Загрузить из файла
ロード|Load|Charger|Laden|Carica|Cargar|读取|불러오기|Загрузить
地図|Map|Carte|Karte|Mappa|Mapa|地图|지도|Карта
右の欄を開く|Open side panel|Ouvrir le panneau|Seitenleiste öffnen|Apri il pannello|Abrir panel|展开侧栏|측면 패널 열기|Открыть панель
閉じる|Close|Fermer|Schließen|Chiudi|Cerrar|关闭|닫기|Закрыть
平地|Clear|Plaine|Ebene|Pianura|Llanura|平地|평지|Равнина
林|Woods|Bois|Gehölz|Bosco|Bosque ligero|疏林|수림|Редколесье
森|Forest|Forêt|Wald|Foresta|Bosque|森林|숲|Лес
荒地|Rough|Terrain accidenté|Schwieriges Gelände|Terreno accidentato|Terreno accidentado|崎岖地|험지|Пересечённая местность
湿地|Marsh|Marais|Sumpf|Palude|Pantano|沼泽|습지|Болото
湖|Lake|Lac|See|Lago|Lago|湖泊|호수|Озеро
対戦の形を選んでください|Choose a game mode|Choisissez le mode de jeu|Spielmodus wählen|Scegli la modalità|Elige el modo|选择对战模式|대전 모드 선택|Выберите режим
人間|Human|Humain|Mensch|Umano|Humano|人类|사람|Человек
対|vs|contre|gegen|contro|contra|对|대|против
観戦|Watch|Observer|Zuschauen|Osserva|Observar|观战|관전|Наблюдение
つの画面で交代|shared screen, take turns|écran partagé, chacun son tour|gemeinsamer Bildschirm|schermo condiviso a turni|pantalla compartida por turnos|个画面轮流操作|화면에서 번갈아 조작|общий экран, по очереди
ゲーム開始|Start game|Commencer|Spiel starten|Inizia partita|Iniciar partida|开始游戏|게임 시작|Начать игру
ソ連が先に配置します|The Soviet side deploys first|Les Soviétiques se déploient en premier|Die Sowjets stellen zuerst auf|I sovietici si schierano per primi|Los soviéticos despliegan primero|苏军先部署|소련군이 먼저 배치합니다|Советы развёртываются первыми
ソ連も自分の駒の戦闘力は分かりません|Soviet strength is hidden from both players|La force soviétique est cachée aux deux joueurs|Sowjetische Stärke ist für beide verborgen|La forza sovietica è nascosta a entrambi|La fuerza soviética está oculta para ambos|双方都不知道苏军的战斗力|소련군 전투력은 양측 모두에게 숨겨집니다|Сила советских частей скрыта от обоих
保存しました|Saved|Sauvegardé|Gespeichert|Salvato|Guardado|已保存|저장했습니다|Сохранено
保存できませんでした|Save failed|Échec de sauvegarde|Speichern fehlgeschlagen|Salvataggio fallito|Error al guardar|保存失败|저장하지 못했습니다|Ошибка сохранения
保存した対局を読み込めませんでした|Could not load the saved game|Impossible de charger la partie|Spielstand konnte nicht geladen werden|Impossibile caricare la partita|No se pudo cargar la partida|无法读取存档|저장한 게임을 불러올 수 없습니다|Не удалось загрузить игру
保存した対局を読み込みました|Saved game loaded|Partie chargée|Spielstand geladen|Partita caricata|Partida cargada|已读取存档|저장한 게임을 불러왔습니다|Игра загружена
戦闘後前進|Advance after combat|Avance après combat|Vorrücken nach Kampf|Avanzata dopo il combattimento|Avance tras el combate|战斗后推进|전투 후 전진|Продвижение после боя
戦闘力|Combat strength|Force de combat|Kampfstärke|Forza di combattimento|Fuerza de combate|战斗力|전투력|Боевая сила
戦闘|Combat|Combat|Kampf|Combattimento|Combate|战斗|전투|Бой
攻撃|Attack|Attaque|Angriff|Attacco|Ataque|攻击|공격|Атака
防御|Defence|Défense|Verteidigung|Difesa|Defensa|防御|방어|Оборона
地形|Terrain|Terrain|Gelände|Terreno|Terreno|地形|지형|Местность
比|Odds|Rapport|Verhältnis|Rapporto|Proporción|比值|전력비|Соотношение
ダイス|Die|Dé|Würfel|Dado|Dado|骰子|주사위|Кубик
次へ|Next|Suivant|Weiter|Avanti|Siguiente|下一步|다음|Далее
配置|Deployment|Déploiement|Aufstellung|Schieramento|Despliegue|部署|배치|Развёртывание
ターン|Turn|Tour|Zug|Turno|Turno|回合|턴|Ход
あなたの番です|Your turn|À vous de jouer|Du bist dran|Tocca a te|Tu turno|轮到你了|당신 차례입니다|Ваш ход
あなたの番|Your turn|Votre tour|Dein Zug|Il tuo turno|Tu turno|你的回合|당신 차례|Ваш ход
の番です|to play|doit jouer|ist dran|deve giocare|debe jugar|的回合|차례입니다|делает ход
の番|to play|doit jouer|ist dran|deve giocare|debe jugar|的回合|차례|делает ход
前進を取り消す|Reset advance|Annuler l’avance|Vorrücken zurücksetzen|Annulla avanzata|Anular avance|撤销推进|전진 취소|Отменить продвижение
案に戻す|restore proposal|rétablir la proposition|Vorschlag wiederherstellen|ripristina proposta|restaurar propuesta|恢复方案|제안 복원|вернуть предложение
前進を確定|Confirm advance|Confirmer l’avance|Vorrücken bestätigen|Conferma avanzata|Confirmar avance|确认推进|전진 확정|Подтвердить продвижение
前進を終える|Finish advance|Terminer l’avance|Vorrücken beenden|Termina avanzata|Terminar avance|结束推进|전진 종료|Завершить продвижение
お任せ配置|Auto-deploy|Déploiement automatique|Automatisch aufstellen|Schieramento automatico|Despliegue automático|自动部署|자동 배치|Авторазвёртывание
すべて取り外す|Remove all|Tout retirer|Alle entfernen|Rimuovi tutto|Retirar todo|全部撤下|모두 제거|Убрать все
配置完了|Finish deployment|Terminer le déploiement|Aufstellung abschließen|Termina schieramento|Terminar despliegue|部署完成|배치 완료|Завершить развёртывание
修正を確定|Confirm edit|Confirmer la modification|Änderung bestätigen|Conferma modifica|Confirmar cambio|确认修改|수정 확정|Подтвердить изменение
修正を中止|Cancel edit|Annuler la modification|Änderung abbrechen|Annulla modifica|Cancelar cambio|取消修改|수정 취소|Отменить изменение
この駒の移動を修正|Edit this unit’s move|Modifier ce déplacement|Bewegung dieser Einheit ändern|Modifica questa mossa|Modificar este movimiento|修改此单位的移动|이 부대의 이동 수정|Изменить ход этой части
オーバーラン|Overrun|Débordement|Überrennen|Travolgimento|Arrollamiento|碾压|오버런|Разгром с ходу
選んだ駒を外す|Deselect units|Désélectionner|Auswahl aufheben|Deseleziona unità|Deseleccionar unidades|取消选择|부대 선택 해제|Снять выбор частей
判定する|Resolve combats|Résoudre les combats|Kämpfe auswerten|Risolvi combattimenti|Resolver combates|结算战斗|전투 판정|Разрешить бои
移動を確定して戦闘へ|Confirm moves and enter combat|Confirmer les mouvements et combattre|Bewegungen bestätigen und kämpfen|Conferma mosse e passa al combattimento|Confirmar movimientos y combatir|确认移动并进入战斗|이동 확정 후 전투로|Подтвердить движение и перейти к бою
ゲーム終了|Game over|Partie terminée|Spiel beendet|Partita terminata|Partida terminada|游戏结束|게임 종료|Игра окончена
もう一度|Play again|Rejouer|Erneut spielen|Rigioca|Volver a jugar|再玩一次|다시 시작|Играть снова
注意|Warning|Attention|Hinweis|Attenzione|Atención|注意|주의|Внимание
選んだヘクス|Selected hex|Hexagone choisi|Gewähltes Hex|Esagono selezionato|Hexágono seleccionado|选中的六角格|선택한 헥스|Выбранный гекс
ヘクス|hex|hexagone|Hex|esagono|hexágono|六角格|헥스|гекс
取り消す|Cancel|Annuler|Abbrechen|Annulla|Cancelar|取消|취소|Отменить
取り外す|Remove|Retirer|Entfernen|Rimuovi|Retirar|撤下|제거|Убрать
これだけ動かす|Move this unit only|Déplacer cette unité seule|Nur diese Einheit bewegen|Muovi solo questa unità|Mover solo esta unidad|只移动此单位|이 부대만 이동|Переместить только эту часть
まとめて動かす|Move together|Déplacer ensemble|Gemeinsam bewegen|Muovi insieme|Mover juntos|一起移动|함께 이동|Переместить вместе
配置を変更|Change deployment|Modifier le déploiement|Aufstellung ändern|Modifica schieramento|Cambiar despliegue|修改部署|배치 변경|Изменить развёртывание
攻撃に使う|Use for attack|Utiliser pour attaquer|Zum Angriff einsetzen|Usa per attaccare|Usar para atacar|用于攻击|공격에 사용|Использовать в атаке
攻撃に使用|Committed to attack|Engagé dans l’attaque|Für Angriff eingesetzt|Assegnata all’attacco|Asignado al ataque|已用于攻击|공격에 사용됨|Задействована в атаке
動かす|Move|Déplacer|Bewegen|Muovi|Mover|移动|이동|Переместить
外す|Deselect|Désélectionner|Abwählen|Deseleziona|Deseleccionar|取消选择|선택 해제|Снять выбор
引き分け|Draw|Match nul|Unentschieden|Pareggio|Empate|平局|무승부|Ничья
の勝ち|wins|gagne|gewinnt|vince|gana|获胜|승리|побеждает
点|points|points|Punkte|punti|puntos|分|점|очков
都市|City|Ville|Stadt|Città|Ciudad|城市|도시|Город
大都市|Major city|Grande ville|Großstadt|Grande città|Ciudad grande|大城市|대도시|Крупный город
街|Town|Bourg|Ort|Paese|Villa|城镇|마을|Городок
突破|Breakthrough|Percée|Durchbruch|Sfondamento|Ruptura|突破|돌파|Прорыв
ドイツ軍の壊滅|German losses|Pertes allemandes|Deutsche Verluste|Perdite tedesche|Bajas alemanas|德军损失|독일군 손실|Потери Германии
道路が西につながらず得点にならない都市|Cities without a western road connection score no points|Villes sans liaison routière vers l’ouest : aucun point|Städte ohne Straßenverbindung nach Westen zählen nicht|Le città senza strada verso ovest non danno punti|Ciudades sin conexión por carretera al oeste no puntúan|道路未连通西侧的城市不计分|서쪽 도로에 연결되지 않은 도시는 득점 없음|Города без дороги на запад не дают очков
地図を見る|View map|Voir la carte|Karte ansehen|Mostra mappa|Ver mapa|查看地图|지도 보기|Показать карту
なし|None|Aucun|Keine|Nessuno|Ninguno|无|없음|Нет
前進なし|No advance|Aucune avance|Kein Vorrücken|Nessuna avanzata|Sin avance|不推进|전진 없음|Без продвижения
済|Done|Fait|Fertig|Fatto|Hecho|完|완료|Готово
移|Moved|Déplacé|Bewegt|Mossa|Movido|移|이동|Ход
未|Not yet|Pas encore|Noch nicht|Non ancora|Pendiente|未|미완료|Ещё нет
`);
dokusoTranslationRows(`
移動前の位置から|From the movement start|Depuis la position initiale|Vom Bewegungsbeginn aus|Dalla posizione iniziale|Desde la posición inicial|从移动前位置|이동 시작 위치에서|Из начальной позиции
色のついた行き先を選んでください|Select a highlighted destination|Choisissez une destination colorée|Markiertes Ziel wählen|Scegli una destinazione evidenziata|Elige un destino resaltado|选择高亮目的地|표시된 목적지를 선택하세요|Выберите подсвеченную цель
選んだ駒だけが変わります|Only the selected unit changes|Seule l’unité choisie change|Nur die gewählte Einheit wird geändert|Cambia solo l’unità scelta|Solo cambia la unidad elegida|仅修改选中的单位|선택한 부대만 변경됩니다|Меняется только выбранная часть
駒を選んで|Select a unit|Sélectionnez une unité|Einheit wählen|Scegli un’unità|Selecciona una unidad|选择单位|부대를 선택|Выберите часть
行き先をクリック|Click the destination|Cliquez sur la destination|Ziel anklicken|Fai clic sulla destinazione|Pulsa el destino|点击目的地|목적지를 클릭|Нажмите на цель
少し待ってください|Please wait|Patientez|Bitte warten|Attendi|Espera|请稍候|잠시 기다리세요|Подождите
が動かしています|is playing|joue|spielt|sta giocando|está jugando|正在操作|조작 중|делает ход
の移動を確認できます|movement can be reviewed|déplacement à vérifier|Bewegung kann geprüft werden|movimento da controllare|movimiento para revisar|的移动可供检查|이동을 확인할 수 있습니다|движение можно проверить
の移動が終わりました|movement is complete|a terminé son mouvement|Bewegung abgeschlossen|ha terminato il movimento|ha terminado el movimiento|的移动已结束|이동이 끝났습니다|завершила движение
矢印で動きを確認してから|Review the arrows, then|Vérifiez les flèches, puis|Pfeile prüfen, dann|Controlla le frecce, poi|Revisa las flechas y luego|查看移动箭头后|화살표로 이동을 확인한 뒤|Проверьте стрелки, затем
の戦闘に進みます|combat follows|le combat suit|der Kampf folgt|segue il combattimento|sigue el combate|进入战斗|전투로 진행|начнётся бой
の初期配置を修正できます|deployment can be edited|déploiement modifiable|Aufstellung kann geändert werden|schieramento modificabile|despliegue modificable|可修改初始部署|초기 배치를 수정할 수 있습니다|развёртывание можно изменить
いま置く場所|Deployment area|Zone de déploiement|Aufstellungsgebiet|Zona di schieramento|Zona de despliegue|部署区域|배치 구역|Район развёртывания
置く駒|Unit to deploy|Unité à déployer|Aufzustellende Einheit|Unità da schierare|Unidad a desplegar|待部署单位|배치할 부대|Развёртываемая часть
水色のヘクス|blue highlighted hex|hexagone bleu|blaues Hex|esagono azzurro|hexágono azul|浅蓝色六角格|하늘색 헥스|голубой гекс
をクリックすると置けます|click to deploy|cliquez pour déployer|zum Aufstellen anklicken|fai clic per schierare|pulsa para desplegar|点击即可部署|클릭하여 배치|нажмите для развёртывания
続けて次の駒が選ばれます|The next unit is selected automatically|L’unité suivante est sélectionnée|Die nächste Einheit wird gewählt|Si seleziona l’unità seguente|Se selecciona la siguiente unidad|自动选择下一个单位|다음 부대가 자동 선택됩니다|Следующая часть выбирается автоматически
全部置きました|All units deployed|Toutes les unités déployées|Alle Einheiten aufgestellt|Tutte le unità schierate|Todas las unidades desplegadas|已部署全部单位|모든 부대를 배치했습니다|Все части развёрнуты
すべての駒を配置しました|All units deployed|Toutes les unités déployées|Alle Einheiten aufgestellt|Tutte le unità schierate|Todas las unidades desplegadas|已部署全部单位|모든 부대를 배치했습니다|Все части развёрнуты
修正する駒をクリックするか|Click a unit to edit, or|Cliquez sur l’unité à modifier, ou|Einheit zum Ändern anklicken, oder|Clicca l’unità da modificare, oppure|Pulsa la unidad a modificar, o|点击要修改的单位，或|수정할 부대를 클릭하거나|Выберите часть для изменения или
配置先の水色のヘクスは|For a blue deployment hex|Pour un hexagone bleu|Bei einem blauen Aufstellungshex|Per un esagono azzurro|Para un hexágono azul|选择浅蓝色部署格时|하늘색 배치 헥스는|Для голубого гекса
駒の上をクリックしても指定できます|Clicking the unit on it also works|Vous pouvez aussi cliquer sur l’unité dessus|Auch die Einheit darauf anklicken|Puoi cliccare anche l’unità presente|También puedes pulsar la unidad encima|也可直接点击格内单位|그 위의 부대를 클릭해도 선택됩니다|Можно нажать на стоящую там часть
配置済みの駒を選び直すには|To select a deployed unit|Pour choisir une unité déployée|Aufgestellte Einheit wählen|Per selezionare un’unità schierata|Para seleccionar una unidad desplegada|重新选择已部署单位|배치된 부대를 다시 선택하려면|Для выбора развёрнутой части
クリックで広げてから選びます|click to fan out, then select|cliquez pour séparer, puis choisissez|zum Auffächern klicken, dann wählen|clicca per separare e scegli|pulsa para separar y selecciona|点击展开后选择|클릭하여 펼친 뒤 선택|раскройте щелчком и выберите
重なった駒は|Stacked units|Unités empilées|Gestapelte Einheiten|Unità impilate|Unidades apiladas|堆叠单位|겹친 부대|Части в стеке
戦線に穴があります|There is a gap in the front|Il y a une brèche dans le front|Die Front hat eine Lücke|C’è un varco nel fronte|Hay un hueco en el frente|战线存在缺口|전선에 빈틈이 있습니다|Во фронте есть разрыв
紫の点線の所を|Along the purple dotted route|Par le tracé violet|Entlang der violetten Punktlinie|Lungo il percorso viola|Por la ruta violeta|沿紫色虚线|보라색 점선 경로로|По фиолетовому пунктиру
ソ連に隣接せずに後方へ抜けられます|the rear can be reached without Soviet contact|on peut atteindre l’arrière sans contact soviétique|ist ein Durchgang ohne Sowjetkontakt möglich|si raggiunge la retrovia senza contatto sovietico|se llega a la retaguardia sin contacto soviético|可绕过苏军进入后方|소련군과 인접하지 않고 후방으로 통과 가능|можно пройти в тыл без контакта с советскими частями
このまま配置を終えることもできます|You may still finish deployment|Vous pouvez tout de même terminer|Aufstellung kann dennoch beendet werden|Puoi comunque terminare|Puedes terminar de todas formas|仍可完成部署|이대로 배치를 끝낼 수도 있습니다|Развёртывание всё равно можно завершить
未配置の駒|Undeployed units|Unités non déployées|Nicht aufgestellte Einheiten|Unità non schierate|Unidades sin desplegar|未部署单位|미배치 부대|Неразвёрнутые части
地図の水色のヘクスをクリック|Click a blue deployment hex|Cliquez sur un hexagone bleu|Blaues Aufstellungshex anklicken|Clicca un esagono azzurro|Pulsa un hexágono azul|点击地图上浅蓝色六角格|지도에서 하늘색 헥스를 클릭|Нажмите на голубой гекс
行き先をクリックしてください|Click a destination|Cliquez sur une destination|Ziel anklicken|Clicca una destinazione|Pulsa un destino|点击目的地|목적지를 클릭하세요|Нажмите на точку назначения
動かす駒のヘクスをクリックしてください|Click the unit you want to move|Cliquez sur l’unité à déplacer|Zu bewegende Einheit anklicken|Clicca l’unità da muovere|Pulsa la unidad que quieras mover|点击要移动的单位|이동할 부대의 헥스를 클릭하세요|Выберите перемещаемую часть
重なっている駒はまとめて選ばれます|Stacked units are selected together|Les unités empilées sont choisies ensemble|Gestapelte Einheiten werden gemeinsam gewählt|Le unità impilate si selezionano insieme|Las unidades apiladas se seleccionan juntas|堆叠单位会一起选中|겹친 부대는 함께 선택됩니다|Части в стеке выбираются вместе
個だけ動かす時は|unit alone: use|unité seule : utilisez|Einheit allein: mit|unità sola: usa|unidad sola: usa|个单位单独移动时|개만 이동하려면|часть отдельно: используйте
で左右に開いて|to fan out the stack|pour séparer les unités|zum Auffächern|per separare le unità|para separar las unidades|展开堆叠|좌우로 펼친 후|чтобы раскрыть стек
その駒をクリック|Click that unit|Cliquez sur cette unité|Diese Einheit anklicken|Clicca quell’unità|Pulsa esa unidad|点击该单位|해당 부대를 클릭|Нажмите на эту часть
駒の左下の目印|Lower-left markers|Marques en bas à gauche|Markierungen links unten|Segni in basso a sinistra|Marcas abajo a la izquierda|单位左下角标记|부대 왼쪽 아래 표시|Метки слева внизу
青い|Blue|Bleu|Blau|Blu|Azul|蓝色|파란색|Синий
灰色の|Grey|Gris|Grau|Grigio|Gris|灰色|회색|Серый
まだ動ける|Can still move|Peut encore bouger|Kann sich noch bewegen|Può ancora muoversi|Aún puede moverse|仍可移动|아직 이동 가능|Ещё может двигаться
移動を終えた|Movement finished|Mouvement terminé|Bewegung beendet|Movimento concluso|Movimiento terminado|移动结束|이동 완료|Движение закончено
動かした|Has moved|Déjà déplacée|Bereits bewegt|Già mossa|Ya movida|已移动|이동함|Уже двигалась
目印のない駒はまだ動かしていません|Unmarked units have not moved|Sans marque : pas encore déplacée|Ohne Markierung: noch nicht bewegt|Senza segno: non ancora mossa|Sin marca: aún no movida|没有标记的单位尚未移动|표시가 없는 부대는 아직 이동하지 않았습니다|Без метки — ещё не двигалась
まだ動かしていない|Not moved yet|Pas encore déplacée|Noch nicht bewegt|Non ancora mossa|Sin mover aún|尚未移动|아직 미이동|Ещё не двигалась
全部動かし終えたら上の|After all moves, use the top button|Après les mouvements, bouton du haut|Nach allen Bewegungen oben|Dopo tutte le mosse, pulsante in alto|Tras mover todas, botón superior|全部移动后使用顶部按钮|모두 이동한 뒤 위쪽 버튼|После всех движений кнопка вверху
移動できる|Reachable|Accessible|Erreichbar|Raggiungibile|Accesible|可到达|이동 가능|Доступно
敵に隣接して止まる|Stops next to the enemy|Arrêt au contact de l’ennemi|Stopp neben dem Feind|Si ferma accanto al nemico|Se detiene junto al enemigo|与敌相邻后停止|적과 인접하면 정지|Остановка рядом с врагом
敵に隣接して停止|Stopped next to the enemy|Arrêt au contact de l’ennemi|Neben dem Feind gestoppt|Ferma accanto al nemico|Detenida junto al enemigo|与敌相邻已停止|적과 인접하여 정지|Остановлена рядом с врагом
緑|Green|Vert|Grün|Verde|Verde|绿色|초록|Зелёный
オレンジ|Orange|Orange|Orange|Arancione|Naranja|橙色|주황|Оранжевый
赤枠の敵はオーバーランできます|Red-framed enemies can be overrun|Les ennemis encadrés en rouge peuvent être débordés|Rot umrandete Feinde können überrannt werden|I nemici in rosso possono essere travolti|Los enemigos con borde rojo pueden ser arrollados|可碾压红框敌军|빨간 테두리 적은 오버런 가능|Врага в красной рамке можно разгромить с ходу
赤枠の敵をクリックするか|Click a red-framed enemy or|Cliquez sur un ennemi en rouge ou|Rot umrandeten Feind anklicken oder|Clicca un nemico in rosso oppure|Pulsa un enemigo en rojo o|点击红框敌军或|빨간 테두리 적을 클릭하거나|Нажмите на врага в красной рамке или
敵をクリックか|Click the enemy or|Cliquez sur l’ennemi ou|Feind anklicken oder|Clicca il nemico o|Pulsa el enemigo o|点击敌军或|적을 클릭하거나|Нажмите на врага или
下の帯のボタンを押してください|use the action button|utilisez le bouton d’action|Aktionsknopf verwenden|usa il pulsante azione|usa el botón de acción|使用操作栏按钮|조작 버튼을 누르세요|используйте кнопку действия
重なりすぎ|Stack limit exceeded|Empilement excessif|Stapellimit überschritten|Limite di pila superato|Apilamiento excesivo|堆叠超限|중첩 제한 초과|Лимит стека превышен
移動を終える前に直してください|Fix before ending movement|Corrigez avant la fin du mouvement|Vor Bewegungsende korrigieren|Correggi prima di terminare|Corrige antes de terminar|结束移动前请修正|이동을 끝내기 전에 수정하세요|Исправьте до завершения движения
`);
dokusoTranslationRows(`
攻撃に使う自分の駒をクリックしてください|Select your attacking units|Sélectionnez vos attaquants|Eigene Angreifer wählen|Scegli le unità attaccanti|Selecciona tus atacantes|选择用于攻击的己方单位|공격할 아군 부대를 선택하세요|Выберите свои атакующие части
重なりを分けたい時は|To split a stack, use|Pour séparer une pile|Zum Teilen eines Stapels|Per separare una pila|Para separar una pila|拆分堆叠时使用|겹친 부대를 나누려면|Для разделения стека
個ずつクリック|click each unit|cliquez chaque unité|Einheiten einzeln anklicken|clicca ogni unità|pulsa cada unidad|逐个点击|하나씩 클릭|нажимайте по одной части
攻撃しないなら上の|To skip combat, use the top button|Pour éviter le combat, bouton du haut|Ohne Angriff oben|Per saltare il combattimento, pulsante in alto|Para omitir el combate, botón superior|不攻击时使用顶部按钮|공격하지 않으려면 위쪽 버튼|Чтобы пропустить бой, кнопка вверху
攻撃に使う駒|Attacking units|Unités attaquantes|Angreifende Einheiten|Unità attaccanti|Unidades atacantes|攻击单位|공격 부대|Атакующие части
攻撃する敵のヘクス|Enemy target hex|Hexagone ennemi ciblé|Feindliches Zielhex|Esagono nemico bersaglio|Hexágono enemigo objetivo|敌方目标六角格|공격할 적 헥스|Гекс атакуемого врага
赤く塗った所|red highlighted hexes|hexagones rouges|rot markierte Hexfelder|esagoni rossi|hexágonos rojos|红色高亮区域|빨간색으로 표시된 곳|красные гексы
をクリックしてください|click to select|cliquez pour choisir|zum Auswählen anklicken|clicca per scegliere|pulsa para elegir|点击选择|클릭하여 선택하세요|нажмите для выбора
宣言した組み合わせ|Declared combats|Combats déclarés|Angemeldete Kämpfe|Combattimenti dichiarati|Combates declarados|已宣告的战斗|선언한 전투|Объявленные бои
宣言した戦闘があるので|Declared combats must be resolved|Les combats déclarés doivent être résolus|Angemeldete Kämpfe müssen ausgewertet werden|I combattimenti dichiarati vanno risolti|Debes resolver los combates declarados|必须结算已宣告的战斗|선언한 전투를 먼저 판정해야 합니다|Объявленные бои нужно разрешить
は押せません|is unavailable|est indisponible|ist nicht verfügbar|non è disponibile|no está disponible|暂不可用|사용할 수 없습니다|недоступно
やめる時は宣言を取り消す|Cancel the declarations to stop|Annulez les déclarations pour arrêter|Zum Abbrechen Anmeldungen zurücknehmen|Annulla le dichiarazioni per fermarti|Anula las declaraciones para parar|要停止请取消宣告|그만두려면 선언을 취소하세요|Для отмены снимите объявления
比はソ連の戦闘力が分かってから|Odds shown after Soviet strength is revealed|Rapport après révélation soviétique|Verhältnis nach Aufdeckung sowjetischer Stärke|Rapporto dopo la rivelazione sovietica|Proporción tras revelar fuerza soviética|苏军战斗力揭示后显示比值|소련군 전투력 공개 후 전력비 표시|Соотношение после раскрытия советской силы
全部宣言したら上の|After declaring all attacks, use the top button|Après toutes les déclarations, bouton du haut|Nach allen Anmeldungen oben|Dopo tutte le dichiarazioni, pulsante in alto|Tras declarar ataques, botón superior|全部宣告后使用顶部按钮|모두 선언한 뒤 위쪽 버튼|После всех объявлений кнопка вверху
ソ連の戦闘力がここで分かり|Soviet strength is then revealed|La force soviétique est alors révélée|Sowjetische Stärke wird dann aufgedeckt|La forza sovietica viene rivelata|Se revela la fuerza soviética|此时揭示苏军战斗力|소련군 전투력이 공개됩니다|Советская сила раскрывается
つずつ判定されます|resolved one at a time|résolus un par un|einzeln ausgewertet|risolti uno alla volta|resueltos de uno en uno|场逐一结算|건씩 판정합니다|разрешаются по одному
判定が終わりました|Resolution complete|Résolution terminée|Auswertung abgeschlossen|Risoluzione terminata|Resolución terminada|结算完成|판정 완료|Разрешение завершено
判定中|Resolving|Résolution en cours|Auswertung läuft|Risoluzione in corso|Resolviendo|正在结算|판정 중|Идёт разрешение
退却|Retreat|Retraite|Rückzug|Ritirata|Retirada|撤退|후퇴|Отступление
の退却先を|retreat destination|destination de retraite|Rückzugsziel|destinazione di ritirata|destino de retirada|的撤退目的地|후퇴 목적지|точка отступления
地図の紫のヘクスからクリックしてください|Choose a purple hex on the map|Choisissez un hexagone violet|Violettes Hex auf der Karte wählen|Scegli un esagono viola|Elige un hexágono violeta|选择地图上的紫色六角格|지도의 보라색 헥스를 선택하세요|Выберите фиолетовый гекс на карте
の支配|controlled|contrôlé|kontrolliert|controllo|control|控制|지배|контроль
駒はありません|No units here|Aucune unité ici|Keine Einheiten hier|Nessuna unità qui|No hay unidades aquí|此处没有单位|부대가 없습니다|Здесь нет частей
このヘクスの駒は移動開始の時に別々のヘクスにいたので|These units began movement in different hexes|Ces unités ont commencé dans des hexagones différents|Diese Einheiten begannen in verschiedenen Hexfeldern|Queste unità sono partite da esagoni diversi|Estas unidades empezaron en hexágonos distintos|这些单位在移动开始时位于不同六角格|이 부대들은 이동 시작 시 서로 다른 헥스에 있었습니다|Эти части начали движение в разных гексах
個ずつ動かします|move each unit separately|déplacez chaque unité séparément|Einheiten einzeln bewegen|muovi ogni unità separatamente|mueve cada unidad por separado|个单位逐一移动|개씩 따로 이동|перемещайте по одной части
残り移動力|Movement points remaining|Points de mouvement restants|Verbleibende Bewegungspunkte|Punti movimento rimasti|Puntos de movimiento restantes|剩余移动力|남은 이동력|Осталось очков движения
残り|Remaining|Restant|Verbleibend|Rimasti|Restantes|剩余|남음|Осталось
現在の案|Current proposal|Proposition actuelle|Aktueller Vorschlag|Proposta attuale|Propuesta actual|当前方案|현재 제안|Текущее предложение
の戦闘後前進を確認|Review advance after combat|Vérifier l’avance après combat|Vorrücken nach Kampf prüfen|Controlla l’avanzata dopo il combattimento|Revisa el avance tras el combate|检查战斗后推进|전투 후 전진 확인|Проверить продвижение после боя
変更する場合は上の|To edit, use the top button|Pour modifier, bouton du haut|Zum Ändern oben|Per modificare, pulsante in alto|Para modificar, botón superior|要修改请使用顶部按钮|수정하려면 위쪽 버튼|Для изменения кнопка вверху
で駒を元に戻し|to restore the units|pour rétablir les unités|zum Zurücksetzen der Einheiten|per ripristinare le unità|para restaurar las unidades|将单位复位|부대를 원래대로 돌린 뒤|для возврата частей
盤面で前進を選び直せます|then choose a new advance on the map|puis choisissez une nouvelle avance|dann Vorrücken auf der Karte neu wählen|poi scegli una nuova avanzata|luego elige un nuevo avance|再在地图上重新选择推进|지도에서 전진을 다시 선택하세요|затем заново выберите продвижение
で続行します|to continue|pour continuer|zum Fortsetzen|per continuare|para continuar|继续|계속 진행|для продолжения
前進させる駒をクリック|Select units to advance|Choisissez les unités à avancer|Vorrückende Einheiten wählen|Scegli le unità da avanzare|Elige unidades para avanzar|选择要推进的单位|전진할 부대를 선택|Выберите продвигаемые части
重なりはまとめて|Stacked units together|Unités empilées ensemble|Gestapelte Einheiten zusammen|Unità impilate insieme|Unidades apiladas juntas|堆叠单位一起|겹친 부대는 함께|Части в стеке вместе
緑のヘクスをクリック|Click a green hex|Cliquez sur un hexagone vert|Grünes Hex anklicken|Clicca un esagono verde|Pulsa un hexágono verde|点击绿色六角格|초록색 헥스를 클릭|Нажмите на зелёный гекс
歩目は敵のいたヘクス|first step into the enemy’s former hex|premier pas dans l’ancien hexagone ennemi|erster Schritt ins frühere Feindhex|primo passo nell’esagono prima occupato dal nemico|primer paso al antiguo hexágono enemigo|步先进入敌军原先所在格|번째 이동은 적이 있던 헥스로|первый шаг в бывший гекс врага
緑の太枠|thick green outline|contour vert épais|dicke grüne Umrandung|bordo verde spesso|borde verde grueso|绿色粗边框|초록색 굵은 테두리|толстая зелёная рамка
移動力|Movement allowance|Capacité de mouvement|Bewegungsweite|Capacità di movimento|Capacidad de movimiento|移动力|이동력|Подвижность
以上の駒は続けてもう|or more can advance another|ou plus peut avancer encore|oder mehr kann noch vorrücken|o più può avanzare ancora|o más puede avanzar otro|以上的单位还能继续|이상인 부대는 추가로|и выше могут пройти ещё
ヘクス進めます|hex forward|hexagone|Hex vor|esagono|hexágono|格推进|헥스 전진 가능|гекс
選んでいる駒|Selected units|Unités choisies|Gewählte Einheiten|Unità selezionate|Unidades seleccionadas|已选单位|선택한 부대|Выбранные части
この駒はもう動けません|This unit cannot move further|Cette unité ne peut plus bouger|Diese Einheit kann nicht weiterziehen|Questa unità non può più muoversi|Esta unidad no puede moverse más|此单位无法继续移动|이 부대는 더 이동할 수 없습니다|Эта часть больше не может двигаться
この駒はもう攻撃が宣言されています|This unit already has an attack declared|Cette unité a déjà une attaque déclarée|Für diese Einheit ist bereits ein Angriff angemeldet|Questa unità ha già un attacco dichiarato|Esta unidad ya tiene un ataque declarado|此单位已宣告攻击|이 부대는 이미 공격을 선언했습니다|Эта часть уже объявила атаку
宣言を取り消せば選び直せます|Cancel the declaration to select again|Annulez la déclaration pour choisir à nouveau|Anmeldung zurücknehmen, um neu zu wählen|Annulla la dichiarazione per riselezionare|Anula la declaración para volver a elegir|取消宣告后可重新选择|선언을 취소하면 다시 선택할 수 있습니다|Отмените объявление для повторного выбора
そのヘクスには置けません|Cannot deploy in that hex|Déploiement impossible ici|Aufstellung dort nicht möglich|Impossibile schierare qui|No puedes desplegar aquí|无法在此格部署|이 헥스에는 배치할 수 없습니다|В этом гексе нельзя развернуться
水色のヘクスに置いてください|Use a blue deployment hex|Utilisez un hexagone bleu|Blaues Aufstellungshex verwenden|Usa un esagono azzurro|Usa un hexágono azul|请放在浅蓝色六角格|하늘색 헥스에 배치하세요|Используйте голубой гекс
そのヘクスには攻撃できません|Cannot attack that hex|Attaque impossible ici|Angriff dort nicht möglich|Impossibile attaccare qui|No puedes atacar ese hexágono|无法攻击此格|이 헥스는 공격할 수 없습니다|Этот гекс нельзя атаковать
選んだ駒の全部が隣接していないか|Not all selected units are adjacent, or|Toutes les unités ne sont pas adjacentes, ou|Nicht alle gewählten Einheiten sind benachbart, oder|Non tutte le unità sono adiacenti, oppure|No todas las unidades están adyacentes, o|并非所有已选单位都与敌相邻，或|선택한 부대 중 인접하지 않은 부대가 있거나|Не все выбранные части соседствуют с целью или
もう宣言されています|already declared|déjà déclaré|bereits angemeldet|già dichiarato|ya declarado|已宣告过攻击|이미 선언되었습니다|атака уже объявлена
攻撃した駒が全部除去されます|All attacking units are eliminated|Tous les attaquants sont éliminés|Alle Angreifer werden vernichtet|Tutti gli attaccanti sono eliminati|Todos los atacantes son eliminados|攻击单位全部被消灭|공격 부대 전멸|Все атакующие части уничтожены
攻撃した駒が|Attacking units|Les attaquants|Angreifende Einheiten|Le unità attaccanti|Las unidades atacantes|攻击单位|공격 부대가|Атакующие части
ヘクス退却します|hexes of retreat|hexagones de retraite|Hex Rückzug|esagoni di ritirata|hexágonos de retirada|格撤退|헥스 후퇴|гексов отступления
防御側が|Defenders|Les défenseurs|Verteidiger|I difensori|Los defensores|防守方|방어측이|Защитники
攻撃側は戦闘後前進できます|Attackers may advance after combat|Les attaquants peuvent avancer|Angreifer dürfen nachrücken|Gli attaccanti possono avanzare|Los atacantes pueden avanzar|攻击方可战斗后推进|공격측은 전투 후 전진 가능|Атакующие могут продвинуться после боя
防御側が全部除去されます|All defenders are eliminated|Tous les défenseurs sont éliminés|Alle Verteidiger werden vernichtet|Tutti i difensori sono eliminati|Todos los defensores son eliminados|防守单位全部被消灭|방어 부대 전멸|Все защитники уничтожены
駒の戦闘力|Printed combat strength|Force imprimée|Aufgedruckte Kampfstärke|Forza stampata|Fuerza impresa|单位印刷战斗力|부대의 표기 전투력|Напечатанная боевая сила
地形の倍率はかけない|without terrain multiplier|sans multiplicateur de terrain|ohne Geländefaktor|senza moltiplicatore del terreno|sin multiplicador de terreno|不乘地形倍率|지형 배율 제외|без множителя местности
の少ない側が全滅し|The weaker side is eliminated|Le camp le plus faible est éliminé|Die schwächere Seite wird vernichtet|La parte più debole è eliminata|El bando más débil es eliminado|较弱的一方全灭|전투력이 작은 쪽이 전멸|Более слабая сторона уничтожена
多い側もその数字以上の駒を失います|The stronger side loses at least that strength|Le camp plus fort perd au moins autant de force|Die stärkere Seite verliert mindestens diese Stärke|La parte più forte perde almeno tale forza|El más fuerte pierde al menos esa fuerza|较强一方也损失不少于该数值的战斗力|강한 쪽도 그 수치 이상의 전투력을 잃습니다|Сильная сторона теряет не меньшую силу
何も起こりません|No effect|Aucun effet|Keine Wirkung|Nessun effetto|Sin efecto|无效果|효과 없음|Нет эффекта
ソ連の駒を裏返します|Revealing Soviet units|Révélation des unités soviétiques|Sowjetische Einheiten aufdecken|Rivelazione delle unità sovietiche|Revelando unidades soviéticas|正在翻开苏军单位|소련군 부대를 공개합니다|Раскрытие советских частей
結果は決まっています|Result is automatic|Résultat automatique|Ergebnis steht fest|Risultato automatico|Resultado automático|结果已确定|결과는 정해져 있습니다|Результат предопределён
サイコロを振ります|Rolling the die|Lancer du dé|Würfeln|Lancio del dado|Tirando el dado|正在掷骰子|주사위를 굴립니다|Бросок кубика
裏返す前|before reveal|avant révélation|vor dem Aufdecken|prima della rivelazione|antes de revelar|翻开前|공개 전|до раскрытия
比が大きく|High odds|Rapport élevé|Hohes Verhältnis|Rapporto alto|Proporción alta|比值很高|전력비가 높음|Высокое соотношение
小さく|low|faible|niedrig|basso|baja|很低|낮음|низкое
以上|or more|ou plus|oder mehr|o più|o más|以上|이상|и выше
以下|or less|ou moins|oder weniger|o meno|o menos|以下|이하|и ниже
個まで|units maximum|unités maximum|Einheiten höchstens|unità al massimo|unidades como máximo|个为上限|개까지|частей максимум
個以上|units or more|unités ou plus|Einheiten oder mehr|unità o più|unidades o más|个以上|개 이상|частей и более
個ずつ|one unit at a time|une unité à la fois|einzeln|una unità alla volta|una unidad cada vez|逐个|하나씩|по одной части
個|units|unités|Einheiten|unità|unidades|个|개|частей
を動かします|will move|vont se déplacer|werden bewegt|verranno mosse|se moverán|将移动|이동합니다|будут перемещены
クリックで|click to|cliquez pour|klicken zum|clicca per|pulsa para|点击|클릭하여|нажмите для
クリック|click|cliquer|klicken|clic|clic|点击|클릭|нажать
上の|top button|bouton du haut|oberer Knopf|pulsante in alto|botón superior|顶部按钮|위쪽|кнопка вверху
下のボタン|action button|bouton d’action|Aktionsknopf|pulsante azione|botón de acción|操作按钮|조작 버튼|кнопка действия
を押してください|press to continue|appuyez pour continuer|zum Fortfahren drücken|premi per continuare|pulsa para continuar|请点击继续|눌러 진행하세요|нажмите для продолжения
地図の|on the map|sur la carte|auf der Karte|sulla mappa|en el mapa|地图上的|지도에서|на карте
ヘクスに|in a hex|dans un hexagone|in einem Hex|in un esagono|en un hexágono|在六角格中|헥스에|в гексе
のヘクス|hexes|hexagones|Hexfelder|esagoni|hexágonos|的六角格|헥스|гексы
できます|available|possible|möglich|disponibile|disponible|可以|가능|доступно
まで|until|jusqu’à|bis|fino a|hasta|直到|까지|до
へ|to|vers|nach|verso|hacia|至|으로|в
駒を選び|Select a unit|Choisissez une unité|Einheit wählen|Scegli un’unità|Elige una unidad|选择单位|부대를 선택|Выберите часть
ソ連軍|Soviet forces|Forces soviétiques|Sowjetische Kräfte|Forze sovietiche|Fuerzas soviéticas|苏军|소련군|Советские войска
攻|Attack|Att.|Angr.|Att.|Atq.|攻|공|Ат.
防|Defence|Déf.|Vert.|Dif.|Def.|防|방|Об.
の||||||的|의|
`);
dokusoTranslationRows(`
歩兵|Infantry|Infanterie|Infanterie|Fanteria|Infantería|步兵|보병|Пехота
騎兵|Cavalry|Cavalerie|Kavallerie|Cavalleria|Caballería|骑兵|기병|Кавалерия
戦車|Tank|Chars|Panzer|Carri|Carros|坦克|전차|Танки
自動車化歩兵|Motorized infantry|Infanterie motorisée|Motorisierte Infanterie|Fanteria motorizzata|Infantería motorizada|摩托化步兵|차량화 보병|Мотопехота
ソ連の配置|Soviet deployment|Déploiement soviétique|Sowjetische Aufstellung|Schieramento sovietico|Despliegue soviético|苏军部署|소련군 배치|Советское развёртывание
ドイツの配置|German deployment|Déploiement allemand|Deutsche Aufstellung|Schieramento tedesco|Despliegue alemán|德军部署|독일군 배치|Германское развёртывание
ソ連の移動|Soviet movement|Mouvement soviétique|Sowjetische Bewegung|Movimento sovietico|Movimiento soviético|苏军移动|소련군 이동|Советское движение
ドイツの移動|German movement|Mouvement allemand|Deutsche Bewegung|Movimento tedesco|Movimiento alemán|德军移动|독일군 이동|Германское движение
ソ連の戦闘|Soviet combat|Combat soviétique|Sowjetischer Kampf|Combattimento sovietico|Combate soviético|苏军战斗|소련군 전투|Советский бой
ドイツの戦闘|German combat|Combat allemand|Deutscher Kampf|Combattimento tedesco|Combate alemán|德军战斗|독일군 전투|Германский бой
攻撃側全滅|Attacker eliminated|Attaquant éliminé|Angreifer vernichtet|Attaccante eliminato|Atacante eliminado|攻击方全灭|공격측 전멸|Атакующие уничтожены
攻撃側退却|Attacker retreats|Retraite de l’attaquant|Angreifer zieht sich zurück|Ritirata dell’attaccante|Retirada del atacante|攻击方撤退|공격측 후퇴|Отступление атакующих
防御側退却|Defender retreats|Retraite du défenseur|Verteidiger zieht sich zurück|Ritirata del difensore|Retirada del defensor|防守方撤退|방어측 후퇴|Отступление защитников
防御側壊滅|Defender eliminated|Défenseur éliminé|Verteidiger vernichtet|Difensore eliminato|Defensor eliminado|防守方全灭|방어측 전멸|Защитники уничтожены
相打ち|Exchange|Échange de pertes|Verlusttausch|Scambio di perdite|Intercambio de bajas|互相损失|상호 손실|Обмен потерями
効果なし|No effect|Aucun effet|Keine Wirkung|Nessun effetto|Sin efecto|无效果|효과 없음|Нет эффекта
ソ連の配置が終わりました|Soviet deployment complete|Déploiement soviétique terminé|Sowjetische Aufstellung abgeschlossen|Schieramento sovietico terminato|Despliegue soviético terminado|苏军部署完成|소련군 배치 완료|Советское развёртывание завершено
ドイツの配置が終わりました|German deployment complete|Déploiement allemand terminé|Deutsche Aufstellung abgeschlossen|Schieramento tedesco terminato|Despliegue alemán terminado|德军部署完成|독일군 배치 완료|Германское развёртывание завершено
ドイツが配置します|Germany deploys next|L’Allemagne se déploie ensuite|Deutschland stellt als Nächstes auf|Segue lo schieramento tedesco|Alemania despliega después|接下来德军部署|다음은 독일군 배치|Далее развёртывается Германия
ソ連の戦闘力が判明|Soviet strength revealed|Force soviétique révélée|Sowjetische Stärke aufgedeckt|Forza sovietica rivelata|Fuerza soviética revelada|苏军战斗力已揭示|소련군 전투력 공개|Советская сила раскрыта
戦闘の組み合わせ|Combat declarations|Combats déclarés|Angemeldete Kämpfe|Combattimenti dichiarati|Combates declarados|战斗组合|전투 조합|Объявленные бои
戦闘の判定が終わっていません|Combat resolution is unfinished|Les combats ne sont pas résolus|Kampfauswertung noch nicht abgeschlossen|Risoluzione dei combattimenti incompleta|Resolución de combates pendiente|战斗尚未结算完毕|전투 판정이 끝나지 않았습니다|Разрешение боя ещё не завершено
宣言した戦闘を判定してください|Resolve all declared combats first|Résolvez d’abord les combats déclarés|Zuerst angemeldete Kämpfe auswerten|Risolvi prima i combattimenti dichiarati|Resuelve primero los combates declarados|请先结算已宣告的战斗|선언한 전투를 먼저 판정하세요|Сначала разрешите объявленные бои
このフェイズは終了できません|This phase cannot be ended now|Cette phase ne peut pas se terminer|Diese Phase kann jetzt nicht beendet werden|Questa fase non può terminare ora|Esta fase no puede terminar ahora|现在无法结束此阶段|지금은 이 단계를 끝낼 수 없습니다|Сейчас нельзя завершить эту фазу
個以上重なっています|units or more stacked|unités ou plus empilées|Einheiten oder mehr gestapelt|unità o più impilate|unidades o más apiladas|个以上单位堆叠|개 이상 겹쳐 있습니다|частей и более в стеке
移動の終了時は|At movement end|À la fin du mouvement|Am Bewegungsende|A fine movimento|Al terminar el movimiento|移动结束时|이동 종료 시|В конце движения
ソ連の増援|Soviet reinforcements|Renforts soviétiques|Sowjetische Verstärkung|Rinforzi sovietici|Refuerzos soviéticos|苏军增援|소련군 증원|Советские подкрепления
燃料集積所がドイツに占領されているため登場できません|Cannot arrive: fuel depots occupied by Germany|Arrivée impossible : dépôts occupés par l’Allemagne|Kein Erscheinen: Treibstofflager deutsch besetzt|Arrivo impossibile: depositi occupati dai tedeschi|No pueden llegar: depósitos ocupados por Alemania|燃料库被德军占领，无法登场|연료 집적소가 독일군에게 점령되어 등장 불가|Прибытие невозможно: топливные склады заняты Германией
が燃料集積所|at fuel depot|au dépôt de carburant|am Treibstofflager|al deposito carburante|en depósito de combustible|在燃料库|연료 집적소|на топливном складе
に登場|arrives|arrive|erscheint|arriva|llega|登场|등장|прибывает
を支配|takes control|prend le contrôle|übernimmt Kontrolle|assume il controllo|toma el control|占领|점령|занимает
相手がいないため取りやめ|Cancelled: no opponent remains|Annulé : plus d’adversaire|Abgebrochen: kein Gegner mehr|Annullato: nessun avversario rimasto|Anulado: no queda rival|敌军已不在，取消战斗|상대가 없어 취소|Отменено: противника уже нет
が全滅し|is eliminated|est éliminé|wird vernichtet|è eliminato|es eliminado|被全歼|전멸|уничтожены
以上を除去|strength or more eliminated|force ou plus éliminée|Stärke oder mehr vernichtet|forza o più eliminata|fuerza o más eliminada|以上战斗力被消灭|이상 제거|силы и более уничтожено
へ退却|retreats to|se replie vers|zieht sich zurück nach|si ritira verso|se retira a|撤退至|후퇴|отступает в
退却できず壊滅|Eliminated: no retreat|Éliminé : retraite impossible|Vernichtet: kein Rückzug|Eliminato: ritirata impossibile|Eliminado: sin retirada|无法撤退而被消灭|후퇴 불가로 전멸|Уничтожена: отступление невозможно
が除去されました|is eliminated|est éliminé|wird vernichtet|è eliminato|es eliminado|被消灭|제거됨|уничтожена
突破の条件|Breakthrough requirements|Conditions de percée|Durchbruchsbedingungen|Condizioni di sfondamento|Condiciones de ruptura|突破条件|돌파 조건|Условия прорыва
が満たされていません|not met|non remplies|nicht erfüllt|non soddisfatte|no cumplidas|未满足|충족되지 않음|не выполнены
地図左への道路|road to the western map edge|route vers l’ouest|Straße zum westlichen Kartenrand|strada verso il bordo occidentale|carretera al borde occidental|通往地图西侧的道路|지도 서쪽으로 이어지는 도로|дорога к западному краю карты
個を除去|units eliminated|unités éliminées|Einheiten vernichtet|unità eliminate|unidades eliminadas|个单位被消灭|개 제거|частей уничтожено
終了|Finished|Terminé|Beendet|Terminato|Terminado|结束|종료|Завершено
増援|Reinforcements|Renforts|Verstärkung|Rinforzi|Refuerzos|增援|증원|Подкрепления
装甲集団|Panzer Group|Groupe blindé|Panzergruppe|Gruppo corazzato|Grupo Panzer|装甲集群|기갑집단|Танковая группа
軍|Army|Armée|Armee|Armata|Ejército|军|군|Армия
ソ連第|Soviet No.|Soviétique n°|Sowjetisch Nr.|Sovietica n.|Soviético n.º|苏联第|소련 제|Советская №
ドイツ第|German No.|Allemand n°|Deutsch Nr.|Tedesco n.|Alemán n.º|德国第|독일 제|Германская №
攻撃側|Attacker|Attaquant|Angreifer|Attaccante|Atacante|攻击方|공격측|Атакующие
防御側|Defender|Défenseur|Verteidiger|Difensore|Defensor|防守方|방어측|Защитники
件|combats|combats|Kämpfe|combattimenti|combates|场|건|боёв
から|from|depuis|von|da|desde|从|에서|из
と|and|et|und|e|y|和|와|и
が||||||由|이|
は||||||是|는|
に||||||在|에|
`);
const DOKUSO_HELP = {
  en: [
    'Choose a side against the AI, watch AI vs AI, or take turns with another person on one screen.',
    'Deployment: select a unit in the bottom tray, then a blue hex. You can click a friendly unit to stack on its hex. Maximum two units per hex. Shift-click selects a deployed unit instead of placing onto it. Auto-deploy places the remaining units. Confirm deployment when finished.',
    'Movement: select a friendly unit or stack, then a highlighted destination. Green is reachable. Orange is adjacent to an enemy and ends movement. Shift-click fans a stack out so you can choose one unit. Click a reachable friendly hex to stack there. Shift-click selects another unit. Blue movement markers mean moved but still able to move. Grey markers mean finished. Undo reverses your latest move. On turn 1, German units may leave their own deployment area and cross the border, but cannot enter another friendly army’s deployment area. This restriction ends on turn 2.',
    'Reviewing Soviet AI moves: select a unit → Edit this unit’s move → choose a destination from its movement start → Confirm edit. Only that unit changes. Cancel edit or Esc keeps its original move. Yellow arrows show edited routes. Confirm moves and enter combat when your review is complete.',
    'Combat: select attackers, then an adjacent enemy hex. Shift-click selects units individually. After declaring all attacks, resolve combats. Soviet strengths are revealed and zero-strength units are removed. Select purple hexes for retreats. Advance after combat starts in the enemy’s former hex. Units with movement allowance 8 or more may advance a second hex. Finish the advance to continue. A German overrun requires revealed enemy strength and at least 10:1 strength.',
    'Cities score 2 and major cities 5. German city points require a road connection west. City outlines are red for Soviet control, black for German control and grey for German-held cities that do not score. Movement arrows disappear after the movement phase. Save stores one game in this browser. Load restores it. Language can be changed without restarting the game.',
  ],
  fr: [
    'Choisissez un camp contre l’IA, observez deux IA ou jouez à deux à tour de rôle sur le même écran.',
    'Déploiement : choisissez une unité en bas puis un hexagone bleu. Un clic sur une unité amie permet de l’empiler sur cet hexagone. Deux unités maximum par hexagone. Maj+clic sélectionne une unité déjà placée. Le déploiement automatique place les unités restantes. Confirmez une fois terminé.',
    'Mouvement : choisissez une unité ou une pile puis une destination colorée. Vert : accessible. Orange : contact ennemi, le mouvement s’arrête. Maj+clic sépare une pile pour choisir une unité. Cliquez sur un hexagone ami accessible pour y entrer. Maj+clic sélectionne une autre unité. Marque bleue : unité déplacée pouvant encore bouger. Marque grise : mouvement terminé. Annuler revient sur le dernier déplacement. Au tour 1, les Allemands peuvent quitter leur zone et franchir la frontière, mais ne peuvent pas entrer dans la zone de déploiement d’une autre armée amie. Cette restriction cesse au tour 2.',
    'Vérification de l’IA soviétique : choisissez une unité → modifier son déplacement → choisissez une destination depuis sa position initiale → confirmez. Seule cette unité change. Annuler ou Échap conserve sa proposition initiale. Les trajets modifiés sont jaunes. Confirmez les mouvements pour passer au combat.',
    'Combat : choisissez les attaquants puis un hexagone ennemi adjacent. Maj+clic choisit les unités séparément. Déclarez tous les combats puis résolvez-les. Les forces soviétiques sont révélées et les unités de force zéro retirées. Pour une retraite, choisissez un hexagone violet. L’avance commence dans l’ancien hexagone ennemi. Une capacité de mouvement d’au moins 8 permet un deuxième hexagone. Terminez l’avance pour continuer. Le débordement allemand exige une force ennemie connue et un rapport d’au moins 10 contre 1.',
    'Une ville vaut 2 points, une grande ville 5. Les points allemands exigent une route vers l’ouest. Contours rouges : contrôle soviétique, noirs : allemand, gris : ville allemande sans points. Les flèches disparaissent après le mouvement. La sauvegarde conserve une partie dans ce navigateur. Le chargement la reprend. Changer de langue conserve la partie.',
  ],
  de: [
    'Wähle eine Seite gegen die KI, beobachte zwei KIs oder spiele abwechselnd mit einer zweiten Person am selben Bildschirm.',
    'Aufstellung: Einheit unten wählen, dann ein blaues Hex. Ein Klick auf eine eigene Einheit stapelt dort. Höchstens zwei Einheiten pro Hex. Umschalt+Klick wählt eine bereits aufgestellte Einheit. Automatische Aufstellung platziert die übrigen Einheiten. Danach die Aufstellung bestätigen.',
    'Bewegung: Einheit oder Stapel wählen, dann ein markiertes Ziel. Grün: erreichbar. Orange: feindbenachbart, Bewegung endet dort. Umschalt+Klick fächert einen Stapel auf. Ein erreichbares eigenes Hex anklicken, um dort zu stapeln. Umschalt+Klick wählt eine andere Einheit. Blaue Markierung: bereits bewegt, kann noch ziehen. Grau: Bewegung beendet. Rückgängig nimmt den letzten Zug zurück. Im ersten Zug dürfen deutsche Einheiten ihr Gebiet verlassen und die Grenze überschreiten, aber kein Aufstellungsgebiet einer anderen eigenen Armee betreten. Ab Zug 2 entfällt diese Einschränkung.',
    'Sowjetische KI prüfen: Einheit wählen → Bewegung dieser Einheit ändern → Ziel vom Bewegungsbeginn aus wählen → Änderung bestätigen. Nur diese Einheit wird geändert. Abbrechen oder Esc erhält den ursprünglichen Zug. Geänderte Wege sind gelb. Nach der Prüfung die Bewegungen bestätigen und zum Kampf wechseln.',
    'Kampf: Angreifer wählen, dann ein benachbartes Feindhex. Umschalt+Klick wählt einzeln. Alle Kämpfe anmelden, dann auswerten. Sowjetische Stärke wird aufgedeckt, Einheiten mit Stärke null werden entfernt. Rückzug auf violette Hexfelder. Vorrücken beginnt im früheren Feindhex. Bewegungsweite 8 oder mehr erlaubt ein zweites Hex. Vorrücken abschließen. Deutsches Überrennen erfordert bekannte Feindstärke und mindestens 10:1.',
    'Städte zählen 2, Großstädte 5 Punkte. Deutsche Stadtpunkte benötigen eine Straße nach Westen. Rote Umrandung: sowjetisch, schwarz: deutsch, grau: deutsch ohne Punkte. Bewegungspfeile verschwinden am Phasenende. Speichern sichert eine Partie in diesem Browser. Laden setzt sie fort. Ein Sprachwechsel erhält den Spielstand.',
  ],
  it: [
    'Scegli un lato contro l’IA, osserva due IA oppure gioca a turni con un’altra persona sullo stesso schermo.',
    'Schieramento: scegli un’unità in basso, poi un esagono azzurro. Puoi cliccare un’unità amica per impilarle. Massimo due unità per esagono. Maiusc+clic seleziona un’unità già schierata. Lo schieramento automatico posiziona le unità rimaste. Conferma quando hai finito.',
    'Movimento: scegli un’unità o una pila e poi una destinazione evidenziata. Verde: raggiungibile. Arancione: adiacente al nemico, il movimento termina. Maiusc+clic separa una pila per scegliere un’unità. Clicca un esagono amico raggiungibile per entrarvi. Maiusc+clic seleziona un’altra unità. Segno blu: già mossa ma può ancora muoversi. Grigio: movimento concluso. Annulla torna all’ultima mossa. Al turno 1 i tedeschi possono uscire dalla propria zona e attraversare il confine, ma non entrare nella zona iniziale di un’altra armata amica. Dal turno 2 questa restrizione termina.',
    'Controllo dell’IA sovietica: seleziona un’unità → modifica questa mossa → scegli la destinazione dalla posizione iniziale → conferma. Cambia solo quell’unità. Annulla o Esc mantiene el movimiento originale. I percorsi modificati sono gialli. Conferma le mosse per passare al combattimento.',
    'Combattimento: scegli gli attaccanti e poi un esagono nemico adiacente. Maiusc+clic sceglie le unità singolarmente. Dichiara tutti gli attacchi, poi risolvili. La forza sovietica viene rivelata e le unità a forza zero eliminate. Ritirata negli esagoni viola. L’avanzata inizia nell’esagono prima occupato dal nemico. Movimento 8 o più permette un secondo esagono. Termina l’avanzata per continuare. Il travolgimento tedesco richiede forza nemica nota e almeno 10:1.',
    'Le città valgono 2 punti, le grandi città 5. I punti tedeschi richiedono una strada verso ovest. Bordi rossi: controllo sovietico, neri: tedesco, grigi: città tedesca senza punti. Le frecce spariscono a fine movimento. Salva conserva una partita nel browser. Carica la riprende. Puoi cambiare lingua durante la partita.',
  ],
  es: [
    'Elige un bando contra la IA, observa dos IA o juega por turnos con otra persona en la misma pantalla.',
    'Despliegue: elige una unidad abajo y luego un hexágono azul. Puedes pulsar una unidad amiga para apilar en su hexágono. Máximo dos unidades por hexágono. Mayús+clic selecciona una unidad ya desplegada. El despliegue automático coloca las restantes. Confirma al terminar.',
    'Movimiento: elige una unidad o pila y un destino resaltado. Verde: accesible. Naranja: adyacente al enemigo, detiene el movimiento. Mayús+clic separa una pila para elegir una unidad. Haz clic en un hexágono amigo accesible para apilarte allí. Mayús+clic selecciona otra unidad. Marca azul: ya movida, aún puede moverse. Gris: movimiento terminado. Anular revierte el último movimiento. En el turno 1 los alemanes pueden salir de su zona y cruzar la frontera, pero no entrar en la zona de despliegue de otro ejército amigo. Esta restricción termina en el turno 2.',
    'Revisar la IA soviética: elige una unidad → modificar este movimiento → elige un destino desde su posición inicial → confirma. Solo cambia esa unidad. Cancelar o Esc conserva el movimiento original. Las rutas modificadas son amarillas. Confirma los movimientos para pasar al combate.',
    'Combate: elige atacantes y un hexágono enemigo adyacente. Mayús+clic selecciona unidades por separado. Declara todos los ataques y resuélvelos. Se revela la fuerza soviética y se retiran las unidades de fuerza cero. Retírate a hexágonos violetas. El avance empieza en el antiguo hexágono enemigo. Movimiento 8 o más permite otro hexágono. Termina el avance para continuar. El arrollamiento alemán requiere fuerza enemiga conocida y al menos 10:1.',
    'Las ciudades valen 2 puntos y las ciudades grandes 5. Los puntos alemanes requieren una carretera hacia el oeste. Bordes rojos: control soviético, negros: alemán, grises: ciudad alemana sin puntos. Las flechas desaparecen al terminar el movimiento. Guardar conserva una partida en este navegador. Cargar la reanuda. Puedes cambiar el idioma durante la partida.',
  ],
  zh: [
    '选择人类对AI、AI对AI观战，或两个人在同一个画面轮流操作。',
    '部署：点击下方待部署单位，再点击浅蓝色六角格。也可以直接点击友军所在格来堆叠，每格最多两个单位。Shift＋点击可重新选择已部署单位。自动部署会放置剩余单位，完成后确认部署。',
    '移动：选择己方单位或堆叠，再选择高亮目的地。绿色表示可达，橙色表示与敌军相邻，进入后立即停止。Shift＋点击展开堆叠，选择单个单位。点击可到达的友军六角格即可叠放移动，Shift＋点击可改选其他单位。蓝色标记表示已移动但仍能移动，灰色表示移动结束。撤销按钮可撤回上一步。第1回合德军可离开自己的部署区并越过国境，但不能进入其他友军集团的初始部署区；第2回合起解除此限制。',
    '检查苏军AI移动：选择单位 → 修改此单位的移动 → 从移动前位置选择新目的地 → 确认修改。只改变该单位。取消或Esc保留原方案。黄色箭头表示人工修改的路线。检查完成后，确认移动并进入战斗。',
    '战斗：选择攻击单位，再点击相邻敌军格。Shift＋点击可逐个选择。宣告全部攻击后结算。苏军战斗力此时揭示，战斗力为零的单位被移除。选择紫色格撤退。战斗后推进先进入敌军原先所在格，移动力8以上的单位可再推进一格。完成推进后继续。德军碾压要求敌军战斗力已知且至少达到10比1。',
    '城市2分，大城市5分。德军城市得分必须有道路连通地图西侧。红框为苏军控制，黑框为德军控制，灰框为德军控制但不计分。移动阶段结束后路线箭头消失。保存按钮在当前浏览器中保存一局，读取按钮继续该存档。切换语言不会重新开始游戏。',
  ],
  ko: [
    '사람 대 AI, AI끼리 관전, 같은 화면에서 두 사람이 번갈아 조작하는 모드를 선택하세요.',
    '배치: 아래의 미배치 부대를 선택한 뒤 하늘색 헥스를 클릭하세요. 아군 위를 클릭하여 겹쳐 놓을 수도 있습니다. 헥스당 최대 두 부대입니다. Shift+클릭은 이미 배치된 부대를 다시 선택합니다. 자동 배치로 나머지를 배치하고 완료를 누르세요.',
    '이동: 아군 부대나 묶음을 선택한 뒤 표시된 목적지를 클릭합니다. 초록은 이동 가능, 주황은 적과 인접하여 이동이 끝나는 곳입니다. Shift+클릭으로 겹친 부대를 펼쳐 하나씩 선택합니다. 이동 가능한 아군 헥스를 누르면 겹쳐 이동합니다. 다른 부대 선택은 Shift+클릭입니다. 파란 표시는 이동했지만 더 이동 가능, 회색은 이동 완료입니다. 되돌리기로 직전 이동을 취소합니다. 독일군은 첫 턴에 자기 배치 구역을 벗어나 국경을 넘을 수 있지만 다른 아군 군의 초기 배치 구역에는 들어갈 수 없습니다. 이 제한은 2턴부터 사라집니다.',
    '소련 AI 이동 확인: 부대 선택 → 이 부대의 이동 수정 → 이동 전 위치에서 목적지 선택 → 수정 확정. 해당 부대만 변경됩니다. 취소나 Esc는 원래 이동을 유지합니다. 수정한 경로는 노란색입니다. 확인 후 이동 확정을 눌러 전투로 진행하세요.',
    '전투: 공격 부대를 고르고 인접한 적 헥스를 클릭하세요. Shift+클릭으로 하나씩 선택할 수 있습니다. 모두 선언한 뒤 판정합니다. 소련 전투력이 공개되며 전투력 0인 부대는 제거됩니다. 후퇴는 보라색 헥스를 선택합니다. 전투 후 전진은 적이 있던 헥스로 먼저 들어갑니다. 이동력 8 이상은 한 헥스 더 전진할 수 있습니다. 전진 종료 후 계속합니다. 독일군 오버런에는 공개된 적 전투력과 10:1 이상이 필요합니다.',
    '도시는 2점, 대도시는 5점입니다. 독일군 도시 점수는 서쪽까지 이어진 도로가 필요합니다. 빨간 테두리는 소련군, 검정은 독일군, 회색은 독일군 점령이지만 득점하지 못하는 도시입니다. 이동 단계가 끝나면 화살표가 사라집니다. 현재 브라우저에 한 게임을 저장하고 불러올 수 있습니다. 진행 중 언어를 바꿀 수 있습니다.',
  ],
  ru: [
    'Выберите сторону против ИИ, наблюдайте за двумя ИИ или играйте вдвоём по очереди за одним экраном.',
    'Развёртывание: выберите часть внизу, затем голубой гекс. Можно нажать на свою часть, чтобы поставить другую в тот же гекс. Максимум две части на гекс. Shift+щелчок выбирает уже развёрнутую часть. Авторазвёртывание размещает оставшиеся части. Затем подтвердите развёртывание.',
    'Движение: выберите свою часть или стек и подсвеченную цель. Зелёный означает доступность. Оранжевый означает соседство с врагом и остановку движения. Shift+щелчок раскрывает стек для выбора одной части. Нажмите доступный гекс своей части, чтобы войти в него. Shift+щелчок выбирает другую часть. Синяя метка: часть двигалась, но может двигаться ещё. Серая: движение закончено. Отмена возвращает последний ход. В первом ходу немецкие части могут выходить из своего района и пересекать границу, но не входить в район развёртывания другой своей армии. Со второго хода ограничение снимается.',
    'Проверка советского ИИ: выберите часть → изменить её ход → выберите новую цель из начальной позиции → подтвердите изменение. Меняется только эта часть. Отмена или Esc сохраняет исходный ход. Исправленные пути показаны жёлтым. Завершив проверку, подтвердите движение и перейдите к бою.',
    'Бой: выберите атакующие части и соседний гекс врага. Shift+щелчок выбирает части отдельно. Объявите все атаки и разрешите бои. Советская сила раскрывается, части с нулевой силой удаляются. Для отступления выберите фиолетовый гекс. Продвижение начинается в бывшем гексе врага. Подвижность 8 и выше позволяет пройти ещё гекс. Завершите продвижение. Немецкий разгром с ходу требует раскрытой силы врага и соотношения не менее 10:1.',
    'Город даёт 2 очка, крупный город 5. Немецкие очки за города требуют дороги на запад. Красная рамка означает советский контроль, чёрная — немецкий, серая — немецкий город без очков. Стрелки исчезают в конце движения. Сохранение хранит одну игру в этом браузере, загрузка её восстанавливает. Язык можно менять во время игры.',
  ],
};

let dokusoLanguage = 'ja';
const requestedDokusoLanguage = new URLSearchParams(location.search).get('lang');
let savedDokusoLanguage;
try { savedDokusoLanguage = localStorage.getItem('dokusoLanguage'); } catch {}
if (Object.hasOwn(DOKUSO_LANGUAGES, requestedDokusoLanguage)) dokusoLanguage = requestedDokusoLanguage;
else if (Object.hasOwn(DOKUSO_LANGUAGES, savedDokusoLanguage)) dokusoLanguage = savedDokusoLanguage;

dokusoTranslationRows(`
オンライン対戦|Online match|Partie en ligne|Online-Partie|Partita online|Partida en línea|在线对战|온라인 대전|Сетевая игра
部屋を作った人がソ連、参加した人がドイツです。|The room creator plays the Soviets; the joining player plays Germany.|Le créateur joue les Soviétiques ; l'autre joueur joue l'Allemagne.|Der Ersteller spielt die Sowjets, der beitretende Spieler Deutschland.|Chi crea la stanza gioca i sovietici; chi entra gioca la Germania.|Quien crea la sala juega con los soviéticos; quien entra, con Alemania.|房主使用苏军，加入者使用德军。|방장은 소련, 참가자는 독일을 맡습니다.|Создатель комнаты играет за СССР, второй игрок — за Германию.
同じ言語で参加してください。部屋の有効期限は作成から48時間です。再接続には同じブラウザを使ってください。|Join using the same language. Rooms expire 48 hours after creation. Reconnect using the same browser.|Choisissez la même langue. Les salles expirent après 48 heures. Reconnectez-vous avec le même navigateur.|Wählt dieselbe Sprache. Räume gelten 48 Stunden. Zum Wiederverbinden denselben Browser verwenden.|Scegliete la stessa lingua. La stanza scade dopo 48 ore. Riconnettiti dallo stesso browser.|Usad el mismo idioma. La sala caduca a las 48 horas. Reconecta con el mismo navegador.|请使用相同语言。房间创建48小时后失效。重新连接时请使用同一浏览器。|같은 언어를 선택하세요. 방은 생성 후 48시간 동안 유지됩니다. 재접속은 같은 브라우저에서 하세요.|Выберите один язык. Комната действует 48 часов. Для переподключения используйте тот же браузер.
部屋を作る|Create room|Créer une salle|Raum erstellen|Crea stanza|Crear sala|创建房间|방 만들기|Создать комнату
部屋に入る・再接続|Join / reconnect|Rejoindre / reconnecter|Beitreten / wiederverbinden|Entra / riconnettiti|Entrar / reconectar|加入或重新连接|입장 / 재접속|Войти / переподключиться
部屋番号は8桁の数字で入力してください。|Enter an 8-digit room number.|Saisissez les 8 chiffres du numéro de salle.|Bitte die achtstellige Raumnummer eingeben.|Inserisci il numero di stanza di 8 cifre.|Introduce el número de sala de 8 cifras.|请输入8位数字房间号。|8자리 숫자로 된 방 번호를 입력하세요.|Введите восьмизначный номер комнаты.
部屋番号|Room number|Numéro de salle|Raumnummer|Numero stanza|Número de sala|房间号|방 번호|Номер комнаты
戻る|Back|Retour|Zurück|Indietro|Volver|返回|뒤로|Назад
この部屋は別の言語です。同じ言語を選んで参加してください。|This room uses another language. Select the same language to join.|Cette salle utilise une autre langue. Choisissez la même langue pour entrer.|Dieser Raum verwendet eine andere Sprache. Bitte dieselbe Sprache wählen.|Questa stanza usa un'altra lingua. Scegli la stessa lingua per entrare.|Esta sala usa otro idioma. Selecciona el mismo para entrar.|此房间使用另一种语言，请选择相同语言后加入。|이 방은 다른 언어를 사용합니다. 같은 언어를 선택하고 입장하세요.|В комнате выбран другой язык. Выберите тот же язык для входа.
この部屋は満員です。|This room is full.|Cette salle est pleine.|Dieser Raum ist voll.|Questa stanza è piena.|Esta sala está llena.|房间已满。|방이 가득 찼습니다.|Комната заполнена.
部屋が見つからないか、有効期限が切れています。|Room not found or expired.|Salle introuvable ou expirée.|Raum nicht gefunden oder abgelaufen.|Stanza inesistente o scaduta.|Sala no encontrada o caducada.|房间不存在或已过期。|방이 없거나 만료되었습니다.|Комната не найдена или срок истёк.
ゲームの版が異なります。ページを更新してください。|Game versions differ. Reload the page.|Les versions diffèrent. Rechargez la page.|Unterschiedliche Spielversionen. Bitte neu laden.|Versioni diverse. Ricarica la pagina.|Versiones diferentes. Recarga la página.|游戏版本不同，请刷新页面。|게임 버전이 다릅니다. 페이지를 새로고침하세요.|Версии игры различаются. Обновите страницу.
盤面が更新されました。確認して操作し直してください。|The board changed. Check it and try again.|Le plateau a changé. Vérifiez puis réessayez.|Das Spielfeld wurde aktualisiert. Prüfen und erneut versuchen.|La mappa è cambiata. Controlla e riprova.|El tablero cambió. Revísalo e inténtalo de nuevo.|棋盘已更新，请确认后重新操作。|게임판이 갱신되었습니다. 확인 후 다시 조작하세요.|Положение изменилось. Проверьте его и повторите действие.
この操作はできません。盤面を確認して操作し直してください。|This action is invalid. Check the board and try again.|Action impossible. Vérifiez le plateau puis réessayez.|Ungültige Aktion. Spielfeld prüfen und erneut versuchen.|Azione non valida. Controlla la mappa e riprova.|Acción no válida. Revisa el tablero e inténtalo de nuevo.|无法执行此操作，请确认棋盘后重试。|이 조작은 불가능합니다. 게임판을 확인하고 다시 시도하세요.|Недопустимое действие. Проверьте положение и повторите попытку.
今は操作できません。接続と手番を確認してください。|You cannot act now. Check the connection and whose turn it is.|Action impossible pour le moment. Vérifiez la connexion et le tour.|Jetzt keine Aktion möglich. Verbindung und Zug prüfen.|Non puoi agire ora. Controlla connessione e turno.|No puedes actuar ahora. Revisa la conexión y el turno.|当前无法操作，请确认连接及回合。|지금은 조작할 수 없습니다. 연결과 차례를 확인하세요.|Сейчас ход невозможен. Проверьте соединение и очередь хода.
相手の応答を待っています。再接続後に盤面を確認してください。|Waiting for the opponent. Check the board after reconnecting.|En attente de l'adversaire. Vérifiez le plateau après reconnexion.|Warte auf den Gegner. Spielfeld nach dem Wiederverbinden prüfen.|In attesa dell'avversario. Controlla la mappa dopo la riconnessione.|Esperando al rival. Revisa el tablero tras reconectar.|正在等待对手响应，请在重连后确认棋盘。|상대의 응답을 기다립니다. 재접속 후 게임판을 확인하세요.|Ожидание соперника. После переподключения проверьте положение.
保存できる対局データの上限に達しました。|The game data storage limit has been reached.|La limite des données de partie est atteinte.|Das Speicherlimit für die Partie wurde erreicht.|Raggiunto il limite dei dati della partita.|Se alcanzó el límite de datos de la partida.|对局数据已达到存储上限。|대국 데이터 저장 한도에 도달했습니다.|Достигнут предел данных партии.
接続を終了しました。|Disconnected.|Déconnecté.|Verbindung beendet.|Disconnesso.|Desconectado.|连接已结束。|연결을 종료했습니다.|Соединение завершено.
オンライン対戦は準備中です。無料プランの確認後に利用できます。|Online play is being prepared. It will open after the free plan is verified.|Le jeu en ligne est en préparation. Il ouvrira après vérification du forfait gratuit.|Online-Spiel wird vorbereitet und nach Prüfung des kostenlosen Tarifs freigeschaltet.|Modalità online in preparazione. Sarà disponibile dopo la verifica del piano gratuito.|Modo en línea en preparación. Se abrirá tras verificar el plan gratuito.|在线对战准备中，确认免费方案后开放。|온라인 대전을 준비 중입니다. 무료 요금제 확인 후 이용할 수 있습니다.|Сетевая игра готовится. Доступ появится после проверки бесплатного тарифа.
通信を確認できません。回線を確認して再接続してください。|Connection unavailable. Check your network and reconnect.|Connexion indisponible. Vérifiez le réseau et reconnectez-vous.|Keine Verbindung. Netzwerk prüfen und erneut verbinden.|Connessione non disponibile. Controlla la rete e riconnettiti.|Conexión no disponible. Revisa la red y reconecta.|无法确认通信，请检查网络后重新连接。|통신을 확인할 수 없습니다. 회선을 확인하고 재접속하세요.|Нет связи. Проверьте сеть и подключитесь заново.
接続設定を確認できません。管理者による設定確認が必要です。|Connection settings need to be checked by the site owner.|Les paramètres doivent être vérifiés par le responsable du site.|Der Betreiber muss die Verbindungseinstellungen prüfen.|Il gestore deve verificare le impostazioni di connessione.|El administrador debe revisar la configuración de conexión.|需要网站管理员检查连接设置。|사이트 관리자가 연결 설정을 확인해야 합니다.|Владельцу сайта нужно проверить настройки подключения.
無料枠の上限に達しました。時間をおいて再接続してください。|The free quota is exhausted. Try reconnecting later.|Quota gratuit épuisé. Réessayez plus tard.|Kostenloses Kontingent erschöpft. Später erneut verbinden.|Quota gratuita esaurita. Riprova più tardi.|Cuota gratuita agotada. Reconecta más tarde.|免费额度已用尽，请稍后重新连接。|무료 사용량 한도에 도달했습니다. 나중에 재접속하세요.|Бесплатный лимит исчерпан. Попробуйте позже.
この部屋は終了しました。|This room has ended.|Cette salle est fermée.|Dieser Raum wurde beendet.|Questa stanza è terminata.|Esta sala ha terminado.|房间已结束。|이 방은 종료되었습니다.|Комната закрыта.
接続を確認しています。操作は確定していません。|Checking the connection. Your action is not confirmed.|Vérification de la connexion. L'action n'est pas confirmée.|Verbindung wird geprüft. Die Aktion ist noch nicht bestätigt.|Verifica connessione. L'azione non è confermata.|Comprobando conexión. La acción no está confirmada.|正在确认连接，操作尚未确定。|연결 확인 중입니다. 조작은 아직 확정되지 않았습니다.|Проверка связи. Действие ещё не подтверждено.
相手の参加を待っています。部屋番号を相手に伝えてください。|Waiting for an opponent. Share the room number.|En attente d'un adversaire. Transmettez le numéro de salle.|Warte auf Mitspieler. Bitte Raumnummer weitergeben.|In attesa dell'avversario. Comunica il numero di stanza.|Esperando al rival. Comparte el número de sala.|正在等待对手加入，请将房间号告知对方。|상대의 입장을 기다립니다. 방 번호를 알려 주세요.|Ожидание соперника. Передайте ему номер комнаты.
相手と盤面を同期しています…|Synchronizing the board…|Synchronisation du plateau…|Spielfeld wird synchronisiert…|Sincronizzazione della mappa…|Sincronizando el tablero…|正在与对手同步棋盘…|상대와 게임판을 동기화 중…|Синхронизация положения…
相手の操作を待っています。|Waiting for the opponent's move.|En attente du coup adverse.|Warte auf den Zug des Gegners.|In attesa della mossa avversaria.|Esperando la jugada del rival.|正在等待对手操作。|상대의 조작을 기다립니다.|Ожидание хода соперника.
接続を確認しています…|Connecting…|Connexion…|Verbindung wird hergestellt…|Connessione…|Conectando…|正在连接…|접속 중…|Подключение…
退却できない駒を除去|Remove unit unable to retreat|Retirer l'unité sans retraite|Einheit ohne Rückzug entfernen|Elimina unità senza ritirata|Eliminar unidad sin retirada|移除无法撤退的单位|퇴각 불가능 부대 제거|Убрать часть без пути отхода
戦闘処理を進める|Continue combat resolution|Poursuivre la résolution du combat|Kampfabwicklung fortsetzen|Prosegui la risoluzione del combattimento|Continuar la resolución del combate|继续战斗处理|전투 처리 진행|Продолжить розыгрыш боя
オンライン対戦を開始します。ソ連が先に配置します。|Starting online play. The Soviets deploy first.|Début de la partie en ligne. Les Soviétiques se déploient d'abord.|Online-Partie beginnt. Die Sowjets stellen zuerst auf.|Inizio partita online. I sovietici si schierano per primi.|Comienza la partida en línea. Los soviéticos despliegan primero.|在线对战开始，苏军先部署。|온라인 대전을 시작합니다. 소련이 먼저 배치합니다.|Начало сетевой игры. СССР расставляется первым.
`);

dokusoTranslationRows(`
再接続|Reconnect|Reconnecter|Wiederverbinden|Riconnetti|Reconectar|重新连接|재접속|Переподключиться
この端末で退出|Leave on this device|Quitter sur cet appareil|Auf diesem Gerät verlassen|Esci da questo dispositivo|Salir en este dispositivo|在此设备退出|이 기기에서 퇴장|Выйти на этом устройстве
部屋を閉じる|Close room|Fermer la salle|Raum schließen|Chiudi stanza|Cerrar sala|关闭房间|방 닫기|Закрыть комнату
接続|Connection|Connexion|Verbindung|Connessione|Conexión|连接|연결|Соединение
`);

const DOKUSO_ONLINE_HELP = {
  "en": "Online play: create a room and share its 8-digit number. The creator plays the Soviets and the other player Germany. Both must select the same language before joining. Only the acting side can send moves; the defending player chooses their own retreats. Combat dice are rolled once by the room creator and shared. Both players must keep the page open. After a disconnect, rejoin with the same browser and room number. Rooms last 48 hours. Connection → Leave on this device preserves the room; Close room ends it. Local Save/Load is disabled online.",
  "fr": "En ligne : créez une salle et partagez ses 8 chiffres. Le créateur joue les Soviétiques, le second l’Allemagne. Choisissez la même langue avant de rejoindre. Seul le joueur concerné agit, y compris pour ses retraites. Les dés sont tirés une fois par le créateur puis partagés. Gardez tous deux la page ouverte. Après une coupure, utilisez le même navigateur et numéro. La salle dure 48 heures. Connexion permet de quitter cet appareil sans fermer la salle, ou de fermer la salle définitivement. La sauvegarde locale est désactivée.",
  "de": "Online: Raum erstellen und die achtstellige Nummer weitergeben. Der Ersteller spielt die Sowjets, der zweite Spieler Deutschland. Vor dem Beitritt dieselbe Sprache wählen. Nur der zuständige Spieler darf handeln, auch beim Rückzug seiner Einheiten. Der Ersteller würfelt einmal und teilt das Ergebnis. Beide müssen die Seite offen lassen. Nach einer Unterbrechung mit demselben Browser und derselben Nummer zurückkehren. Räume gelten 48 Stunden. Unter Verbindung kann man nur dieses Gerät verlassen oder den Raum beenden. Lokales Speichern und Laden ist online gesperrt.",
  "it": "Online: crea una stanza e comunica il numero di 8 cifre. Il creatore gioca i sovietici, il secondo giocatore la Germania. Scegliete la stessa lingua prima di entrare. Agisce solo il giocatore di turno, incluse le ritirate dei propri reparti. Il creatore tira i dadi una sola volta e condivide il risultato. Entrambi devono tenere la pagina aperta. Dopo una disconnessione, usa lo stesso browser e numero. La stanza dura 48 ore. Connessione permette di uscire dal dispositivo mantenendo la stanza, oppure di chiuderla. Salvataggio e caricamento locali sono disattivati.",
  "es": "En línea: crea una sala y comparte el número de 8 cifras. El creador juega con los soviéticos y el otro con Alemania. Elegid el mismo idioma antes de entrar. Solo actúa el jugador correspondiente, incluidas las retiradas de sus unidades. El creador tira los dados una vez y comparte el resultado. Ambos deben mantener la página abierta. Tras una desconexión, usa el mismo navegador y número. La sala dura 48 horas. Conexión permite salir de este dispositivo sin cerrar la sala, o cerrarla definitivamente. Guardar y cargar localmente está desactivado.",
  "zh": "在线对战：创建房间并分享8位数字房间号。房主使用苏军，加入者使用德军。加入前双方须选择相同语言。仅当前行动方可操作，各方自行选择己方单位的撤退位置。战斗骰子由房主统一掷一次并同步。双方须保持页面开启。断线后使用同一浏览器及房间号重连。房间有效期48小时。“连接”菜单中的设备退出保留房间，关闭房间则结束对局。在线模式不能使用本地存档读写。",
  "ko": "온라인: 방을 만들고 8자리 방 번호를 전달하세요. 방장은 소련, 참가자는 독일을 맡습니다. 입장 전에 같은 언어를 선택해야 합니다. 현재 행동할 진영만 조작할 수 있으며 각 진영이 자기 부대의 퇴각지를 고릅니다. 주사위는 방장 쪽에서 한 번 굴려 동기화합니다. 양쪽 모두 페이지를 열어 두어야 합니다. 연결이 끊기면 같은 브라우저와 방 번호로 재접속하세요. 방은 48시간 유지됩니다. 연결 메뉴에서 이 기기만 퇴장하면 방이 유지되며 방 닫기는 대국을 종료합니다. 온라인에서는 로컬 저장과 불러오기를 사용할 수 없습니다.",
  "ru": "Сетевая игра: создайте комнату и передайте восьмизначный номер. Создатель играет за СССР, второй игрок — за Германию. Перед входом выберите один язык. Действует только нужная сторона, включая выбор отступления своих частей. Создатель один раз бросает кубик и передаёт результат. Оба игрока должны держать страницу открытой. После обрыва используйте тот же браузер и номер. Комната действует 48 часов. В меню соединения можно выйти на этом устройстве, сохранив комнату, или закрыть её полностью. Локальное сохранение и загрузка в сети отключены."
};
for (const [language, text] of Object.entries(DOKUSO_ONLINE_HELP)) DOKUSO_HELP[language].push(text);

dokusoTranslationRows(`
第1ターンのドイツ軍は、他の味方軍の配置エリアには入れません。自分のエリアから出て国境を越える移動は可能です。第2ターンからはこの制限はありません。|On turn 1, German units may leave their own deployment area and cross the border, but cannot enter another friendly army’s deployment area. This restriction ends on turn 2.|Au tour 1, les Allemands peuvent quitter leur zone et franchir la frontière, mais ne peuvent pas entrer dans la zone de déploiement d’une autre armée amie. Cette restriction cesse au tour 2.|Im ersten Zug dürfen deutsche Einheiten ihr Gebiet verlassen und die Grenze überschreiten, aber kein Aufstellungsgebiet einer anderen eigenen Armee betreten. Ab Zug 2 entfällt diese Einschränkung.|Al turno 1 i tedeschi possono uscire dalla propria zona e attraversare il confine, ma non entrare nella zona iniziale di un’altra armata amica. Dal turno 2 questa restrizione termina.|En el turno 1 los alemanes pueden salir de su zona y cruzar la frontera, pero no entrar en la zona de despliegue de otro ejército amigo. Esta restricción termina en el turno 2.|第1回合德军可离开自己的部署区并越过国境，但不能进入其他友军集团的初始部署区；第2回合起解除此限制。|독일군은 첫 턴에 자기 배치 구역을 벗어나 국경을 넘을 수 있지만 다른 아군 군의 초기 배치 구역에는 들어갈 수 없습니다. 이 제한은 2턴부터 사라집니다.|В первом ходу немецкие части могут выходить из своего района и пересекать границу, но не входить в район развёртывания другой своей армии. Со второго хода ограничение снимается.
`);

dokusoTranslationRows(`
番号をコピー|Copy number|Copier le numéro|Nummer kopieren|Copia numero|Copiar número|复制房间号|번호 복사|Копировать номер
コピーしました|Copied|Copié|Kopiert|Copiato|Copiado|已复制|복사했습니다|Скопировано
部屋を作りました|Room created|Salle créée|Raum erstellt|Stanza creata|Sala creada|房间已创建|방을 만들었습니다|Комната создана
この部屋番号を相手に伝えてください。|Share this room number with your opponent.|Transmettez ce numéro de salle à votre adversaire.|Teile diese Raumnummer deinem Mitspieler mit.|Comunica questo numero di stanza al tuo avversario.|Comparte este número de sala con tu rival.|请把这个房间号告诉对手。|이 방 번호를 상대에게 알려 주세요.|Передайте этот номер комнаты сопернику.
地図を見る|View map|Voir la carte|Karte ansehen|Vedi mappa|Ver mapa|查看地图|지도 보기|Открыть карту
番号を選択しました。⌘CまたはCtrl+Cでコピーしてください。|Number selected. Press ⌘C or Ctrl+C to copy.|Numéro sélectionné. Appuyez sur ⌘C ou Ctrl+C pour copier.|Nummer ausgewählt. Mit ⌘C oder Strg+C kopieren.|Numero selezionato. Premi ⌘C o Ctrl+C per copiare.|Número seleccionado. Pulsa ⌘C o Ctrl+C para copiar.|已选中房间号，按⌘C或Ctrl+C复制。|번호를 선택했습니다. ⌘C 또는 Ctrl+C로 복사하세요.|Номер выделен. Нажмите ⌘C или Ctrl+C для копирования.
`);

dokusoTranslationRows(`
戦闘結果|Combat result|Résultat du combat|Kampfergebnis|Risultato del combattimento|Resultado del combate|战斗结果|전투 결과|Результат боя
紫色のヘクスを選んで退却してください。|Choose a purple hex to retreat.|Choisissez un hexagone violet pour la retraite.|Zum Rückzug ein violettes Hex wählen.|Scegli un esagono viola per ritirarti.|Elige un hexágono morado para retirarte.|请选择紫色六角格撤退。|보라색 헥스를 선택해 퇴각하세요.|Выберите фиолетовый гекс для отступления.
相手が退却先を選んでいます。|Your opponent is choosing a retreat destination.|L’adversaire choisit sa retraite.|Der Gegner wählt ein Rückzugsziel.|L’avversario sta scegliendo la ritirata.|El rival está eligiendo su retirada.|对手正在选择撤退位置。|상대가 퇴각지를 고르고 있습니다.|Соперник выбирает путь отступления.
戦闘後前進を選んでください。終わったら「前進を終える」を押してください。|Choose advances after combat, then press Finish advance.|Choisissez les avances, puis terminez l’avance.|Vorrücken nach dem Kampf wählen, dann Vorrücken abschließen.|Scegli le avanzate, poi termina l’avanzata.|Elige los avances y después termina el avance.|请选择战斗后推进，完成后结束推进。|전투 후 전진을 선택하고 완료되면 전진 종료를 누르세요.|Выберите продвижение после боя, затем завершите его.
相手が戦闘後前進を選んでいます。|Your opponent is choosing advances after combat.|L’adversaire choisit ses avances après combat.|Der Gegner wählt das Vorrücken nach dem Kampf.|L’avversario sta scegliendo le avanzate.|El rival está eligiendo los avances tras el combate.|对手正在选择战斗后推进。|상대가 전투 후 전진을 고르고 있습니다.|Соперник выбирает продвижение после боя.
駒を配置し、終わったら「配置完了」を押してください。|Deploy your units, then confirm deployment.|Placez vos unités, puis confirmez le déploiement.|Einheiten aufstellen, dann Aufstellung bestätigen.|Schiera le unità, poi conferma lo schieramento.|Despliega tus unidades y confirma el despliegue.|请部署单位，完成后确认部署。|부대를 배치하고 완료되면 배치 완료를 누르세요.|Расставьте части, затем подтвердите расстановку.
相手が駒を配置しています。|Your opponent is deploying units.|L’adversaire déploie ses unités.|Der Gegner stellt seine Einheiten auf.|L’avversario sta schierando le unità.|El rival está desplegando sus unidades.|对手正在部署单位。|상대가 부대를 배치하고 있습니다.|Соперник расставляет части.
駒を移動し、終わったら「移動終了」を押してください。|Move your units, then press End movement.|Déplacez vos unités, puis terminez le mouvement.|Einheiten bewegen, dann Bewegung beenden.|Muovi le unità, poi termina il movimento.|Mueve tus unidades y termina el movimiento.|请移动单位，完成后结束移动。|부대를 이동하고 완료되면 이동 종료를 누르세요.|Передвиньте части, затем завершите движение.
相手が駒を移動しています。|Your opponent is moving units.|L’adversaire déplace ses unités.|Der Gegner bewegt seine Einheiten.|L’avversario sta muovendo le unità.|El rival está moviendo sus unidades.|对手正在移动单位。|상대가 부대를 이동하고 있습니다.|Соперник передвигает части.
戦闘が終わりました。「戦闘終了」を押してください。|All combats are resolved. Press End combat.|Tous les combats sont résolus. Terminez les combats.|Alle Kämpfe sind ausgewertet. Kampf beenden drücken.|Tutti i combattimenti sono risolti. Termina il combattimento.|Todos los combates están resueltos. Termina el combate.|所有战斗已结算，请结束战斗。|모든 전투 판정이 끝났습니다. 전투 종료를 누르세요.|Все бои разыграны. Завершите фазу боя.
相手の「戦闘終了」を待っています。|Waiting for your opponent to end combat.|Attente de la fin des combats adverse.|Warte auf das Kampfende des Gegners.|In attesa che l’avversario termini il combattimento.|Esperando que el rival termine el combate.|正在等待对手结束战斗。|상대가 전투를 종료하기를 기다립니다.|Ожидание завершения фазы боя соперником.
「戦闘処理を進める」を押してください。|Press Continue combat resolution.|Appuyez pour poursuivre la résolution du combat.|Kampfabwicklung fortsetzen drücken.|Premi Prosegui la risoluzione del combattimento.|Pulsa Continuar la resolución del combate.|请点击继续战斗处理。|전투 처리 진행을 누르세요.|Нажмите «Продолжить розыгрыш боя».
相手が戦闘を判定しています。|Your opponent is resolving combat.|L’adversaire résout un combat.|Der Gegner wertet einen Kampf aus.|L’avversario sta risolvendo il combattimento.|El rival está resolviendo el combate.|对手正在结算战斗。|상대가 전투를 판정하고 있습니다.|Соперник разыгрывает бой.
攻撃を宣言し、決まったら「判定する」を押してください。|Declare attacks, then press Resolve.|Déclarez les attaques, puis résolvez-les.|Angriffe anmelden, dann auswerten.|Dichiara gli attacchi, poi risolvili.|Declara los ataques y resuélvelos.|请宣告攻击，确定后进行结算。|공격을 선언하고 결정되면 판정을 누르세요.|Объявите атаки, затем разыграйте их.
相手が攻撃を宣言しています。|Your opponent is declaring attacks.|L’adversaire déclare ses attaques.|Der Gegner meldet Angriffe an.|L’avversario sta dichiarando gli attacchi.|El rival está declarando los ataques.|对手正在宣告攻击。|상대가 공격을 선언하고 있습니다.|Соперник объявляет атаки.
前進を終えて戦闘処理を進める|Finish advance and continue combat resolution|Terminer l’avance et poursuivre la résolution du combat|Vorrücken beenden und Kampfabwicklung fortsetzen|Termina l’avanzata e prosegui il combattimento|Terminar avance y continuar la resolución del combate|结束推进并继续战斗处理|전진을 끝내고 전투 처리 진행|Завершить продвижение и продолжить розыгрыш боя
`);

dokusoTranslationRows(`
前進できる駒がありません。前進を終了してください。|No units can advance further. Finish the advance.|Aucune unité ne peut avancer davantage. Terminez l’avance.|Keine Einheit kann weiter vorrücken. Vorrücken abschließen.|Nessuna unità può avanzare ancora. Termina l’avanzata.|Ninguna unidad puede avanzar más. Termina el avance.|没有单位可以继续推进，请结束推进。|더 전진할 부대가 없습니다. 전진을 종료하세요.|Больше никто не может продвигаться. Завершите продвижение.
`);

dokusoTranslationRows(`
ダイス判定中…|Rolling the die…|Lancer du dé…|Der Würfel rollt…|Lancio del dado…|Lanzando el dado…|正在掷骰…|주사위 굴리는 중…|Бросок кубика…
`);

dokusoTranslationRows(`
選択中の攻撃部隊|Selected attackers|Attaquants sélectionnés|Gewählte Angreifer|Attaccanti selezionati|Atacantes seleccionados|已选攻击部队|선택한 공격 부대|Выбранные атакующие
宣言済みの攻撃|Declared attacks|Attaques déclarées|Angemeldete Angriffe|Attacchi dichiarati|Ataques declarados|已宣告攻击|선언된 공격|Объявленные атаки
攻撃に参加|Participating attackers|Unités attaquantes|Beteiligte Angreifer|Unità attaccanti|Unidades atacantes|参战攻击部队|공격 참가 부대|Участники атаки
味方の駒を順にクリックして複数選択し、敵のヘクスをクリックしてください。|Click friendly units in sequence to select several, then click the enemy hex.|Cliquez successivement sur plusieurs unités amies, puis sur l’hexagone ennemi.|Eigene Einheiten nacheinander auswählen, dann das Feindhex anklicken.|Clicca più unità amiche in sequenza, poi l’esagono nemico.|Selecciona varias unidades amigas haciendo clic y luego el hexágono enemigo.|依次点击多个友军单位，再点击敌军六角格。|아군 부대를 차례로 눌러 여러 부대를 선택한 뒤 적 헥스를 누르세요.|Последовательно выберите несколько своих частей, затем гекс врага.
移動可能な味方のヘクスをクリックすると、そこへ重ねて移動します。別の駒を選び直す時はShift＋クリック。|Click a reachable friendly hex to stack there. Shift-click selects another unit.|Cliquez sur un hexagone ami accessible pour y entrer. Maj+clic sélectionne une autre unité.|Ein erreichbares eigenes Hex anklicken, um dort zu stapeln. Umschalt+Klick wählt eine andere Einheit.|Clicca un esagono amico raggiungibile per entrarvi. Maiusc+clic seleziona un’altra unità.|Haz clic en un hexágono amigo accesible para apilarte allí. Mayús+clic selecciona otra unidad.|点击可到达的友军六角格即可叠放移动。Shift＋点击可改选其他单位。|이동 가능한 아군 헥스를 누르면 겹쳐 이동합니다. 다른 부대 선택은 Shift+클릭입니다.|Нажмите доступный гекс своей части, чтобы войти в него. Shift+щелчок выбирает другую часть.
味方のいるヘクスへの移動も、緑のヘクスをクリックするだけです。|To enter a friendly hex, click its green highlight.|Pour entrer dans un hexagone ami, cliquez sur sa surbrillance verte.|Zum eigenen Hex auf dessen grüne Markierung klicken.|Per entrare in un esagono amico, clicca l’evidenziazione verde.|Para entrar en un hexágono amigo, pulsa su resaltado verde.|进入友军所在格时，直接点击绿色格即可。|아군이 있는 헥스도 초록색 표시를 누르면 이동합니다.|Для входа в гекс своей части нажмите зелёную подсветку.
`);

dokusoTranslationRows(`
前進を1手戻す|Undo last advance|Annuler la dernière avance|Letztes Vorrücken zurücknehmen|Annulla l’ultima avanzata|Deshacer el último avance|撤销上一步推进|직전 전진 되돌리기|Отменить последнее продвижение
`);

const dokusoTranslationPattern = new RegExp(Object.keys(DOKUSO_TRANSLATIONS)
  .sort((a, b) => b.length - a.length)
  .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

function dokusoTranslate(source, language = dokusoLanguage) {
  if (language === 'ja' || !source) return source;
  const compact = language === 'zh' || language === 'ko';
  const text = source.replace(dokusoTranslationPattern, key => {
    const value = DOKUSO_TRANSLATIONS[key][language];
    return compact ? value : ' ' + value + ' ';
  });
  if (compact || !source.trim()) return text;
  const translated = text.replace(/[ \t]+/g, ' ').replace(/ +([,.;:!?）])/g, '$1').trim();
  return source.match(/^\s*/)[0] + translated + source.match(/\s*$/)[0];
}

const dokusoOriginalText = new WeakMap();
const dokusoOriginalAttributes = new WeakMap();
function dokusoLocalizeDOM(root = document.body) {
  const nodes = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = root;
  do {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (element.closest('script, style, .dokuso-language')) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      const previous = dokusoOriginalText.get(node);
      const source = previous && node.nodeValue === previous.translated ? previous.source : node.nodeValue;
      const translated = dokusoTranslate(source);
      dokusoOriginalText.set(node, { source, translated });
      if (node.nodeValue !== translated) node.nodeValue = translated;
    } else {
      const saved = dokusoOriginalAttributes.get(node) || {};
      for (const name of ['title', 'alt', 'aria-label']) {
        if (!node.hasAttribute(name)) continue;
        const current = node.getAttribute(name), previous = saved[name];
        const source = previous && current === previous.translated ? previous.source : current;
        const translated = dokusoTranslate(source);
        saved[name] = { source, translated };
        if (current !== translated) node.setAttribute(name, translated);
      }
      dokusoOriginalAttributes.set(node, saved);
    }
  } while ((node = nodes.nextNode()));
}

let dokusoHelpOrigin = null;
let dokusoHelpHeading = null;
const dokusoJapaneseHelp = window.showHelp;
window.showHelp = function (fromStart) {
  dokusoHelpOrigin = !!fromStart;
  if (dokusoLanguage === 'ja') {
    dokusoJapaneseHelp(fromStart);
    dokusoHelpHeading = document.getElementById('modalBox').firstElementChild;
    return;
  }
  const box = document.getElementById('modalBox');
  box.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = dokusoTranslate('遊び方');
  dokusoHelpHeading = heading;
  box.appendChild(heading);
  for (const text of DOKUSO_HELP[dokusoLanguage]) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    paragraph.style.margin = '10px 0';
    box.appendChild(paragraph);
  }
  const close = document.createElement('button');
  close.textContent = dokusoTranslate('閉じる');
  close.onclick = () => {
    dokusoHelpOrigin = null;
    if (fromStart) showStart();
    else document.getElementById('modal').style.display = 'none';
  };
  box.appendChild(close);
  document.getElementById('modal').style.display = 'flex';
};

function setDokusoLanguage(language) {
  if (!Object.hasOwn(DOKUSO_LANGUAGES, language)) return;
  dokusoLanguage = language;
  try { localStorage.setItem('dokusoLanguage', language); } catch {}
  document.documentElement.lang = language;
  document.title = dokusoTranslate('独ソ電撃戦');
  languageSelect.value = language;
  const modal = document.getElementById('modal');
  if (dokusoHelpOrigin !== null && modal.style.display !== 'none' && document.getElementById('modalBox').contains(dokusoHelpHeading)) showHelp(dokusoHelpOrigin);
  dokusoLocalizeDOM();
}

const languageLabel = document.createElement('label');
languageLabel.className = 'dokuso-language';
languageLabel.textContent = '🌐 ';
const languageSelect = document.createElement('select');
languageSelect.setAttribute('aria-label', 'Language');
for (const [language, label] of Object.entries(DOKUSO_LANGUAGES)) {
  const option = document.createElement('option');
  option.value = language;
  option.lang = language;
  option.textContent = label;
  languageSelect.appendChild(option);
}
languageSelect.onchange = () => setDokusoLanguage(languageSelect.value);
languageLabel.appendChild(languageSelect);
document.getElementById('bottom').appendChild(languageLabel);

const dokusoAlert = window.alert.bind(window);
window.alert = message => dokusoAlert(dokusoTranslate(String(message)));
const dokusoLanguageObserver = new MutationObserver(() => dokusoLocalizeDOM());
dokusoLanguageObserver.observe(document.body, {
  subtree: true, childList: true, characterData: true,
  attributes: true, attributeFilter: ['title', 'alt', 'aria-label'],
});
setDokusoLanguage(dokusoLanguage);
