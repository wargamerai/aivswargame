/* 仮データ。正式な地図・初期配置・カード内容に合わせて置き換えできます。 */
window.GAME_DATA = {
  areas: [
    // 元盤面の西（左）から東（右）への配置。座標は簡略図上の地域中心。
    {id:'hakushi',name:'伯耆',x:5.1,y:40.4,weight:1000,base:false,initial:[['吉川元春','吉川軍',7,2]]},
    {id:'inaba',name:'因幡',x:16.5,y:40.4,weight:100,base:false,initial:[['','中立軍',1,1]]},
    {id:'tajima',name:'但馬',x:24.6,y:42.3,weight:900,base:false,initial:[['','中立軍',1,1]]},
    {id:'tango',name:'丹波',x:35.1,y:55.6,weight:850,base:false,initial:[['','中立軍',1,1]]},
    {id:'bitchu',name:'備中',x:3.5,y:60.0,weight:1050,base:true,initial:[['毛利輝元','毛利軍',5,2],['小早川隆景','小早川軍',5,2]]},
    {id:'mimasaka',name:'美作備前',x:11.5,y:63.2,weight:1400,base:false,initial:[['宇喜多直家','宇喜多軍',5,2]]},
    {id:'harima',name:'播磨',x:22.0,y:63.3,weight:950,base:false,initial:[['','中立軍',1,1]]},
    {id:'yamashiro',name:'山城',x:41.1,y:72.0,weight:450,base:true,initial:[['','織田軍',5,2]]},
    {id:'kawachi',name:'摂津',x:34.8,y:74.8,weight:500,base:true,initial:[['','石山一向一揆',6,2]]},
    {id:'awaji',name:'淡路',x:21.5,y:86.4,weight:150,base:false,initial:[['','三好軍',1,2]]},
    {id:'sanuki',name:'讃岐阿波',x:6.7,y:95.5,weight:1100,base:false,initial:[['三好三人衆','三好軍',4,2]]},
    {id:'yamato',name:'大和',x:41.0,y:90.8,weight:1000,base:true,initial:[['松永久秀','松永軍',5,2]]},
    {id:'kii',name:'紀伊',x:29.5,y:96.5,weight:1200,base:false,initial:[['雑賀孫市','本願寺（雑賀軍）',1,2]]},
    {id:'kitakinki',name:'北近江',x:56.3,y:53.0,weight:1100,base:true,initial:[['浅井長政','浅井軍',5,3]]},
    {id:'minamikinki',name:'南近江',x:52.0,y:68.1,weight:650,base:true,initial:[['','織田軍',5,2]]},
    {id:'echizen',name:'越前',x:60.0,y:36.4,weight:1100,base:true,initial:[['朝倉義景','朝倉軍',5,2]]},
    {id:'kaga',name:'加賀',x:66.4,y:24.9,weight:900,base:false,initial:[['','加賀一向一揆',4,2]]},
    {id:'etchu',name:'越中',x:80.4,y:20.5,weight:950,base:false,initial:[['','中立軍',1,1]]},
    {id:'echigo',name:'越後',x:94.3,y:10.2,weight:2300,base:true,initial:[['上杉謙信','上杉軍',9,5]]},
    {id:'nishimino',name:'西美濃',x:63.6,y:60.6,weight:750,base:true,initial:[['織田信長','織田軍',11,2]]},
    {id:'higashimino',name:'東美濃',x:76.4,y:59.1,weight:1100,base:false,initial:[['','織田軍',1,2]]},
    {id:'owari',name:'尾張',x:68.2,y:69.7,weight:800,base:true,initial:[['柴田勝家','織田軍',5,3]]},
    {id:'kitaise',name:'北伊勢',x:59.3,y:75.0,weight:550,base:true,initial:[['','長島一向一揆',4,2]]},
    {id:'minamise',name:'南伊勢',x:51.9,y:82.8,weight:1250,base:false,initial:[['','織田軍',5,2]]},
    {id:'mikawa',name:'三河',x:75.5,y:81.6,weight:1250,base:false,initial:[['徳川家康','徳川軍',5,4]]},
    {id:'totomi',name:'遠江',x:85.2,y:88.2,weight:1000,base:false,initial:[['','中立軍',1,1]]},
    {id:'kitanoshinano',name:'北信濃',x:92.3,y:35.8,weight:2300,base:false,initial:[['','武田軍',1,2]]},
    {id:'minaminoshinano',name:'南信濃',x:85.6,y:59.2,weight:2200,base:false,initial:[['','武田軍',1,2]]},
    {id:'kai-suruga',name:'甲斐駿河',x:94.3,y:67.8,weight:2300,base:true,initial:[['武田信玄','武田軍',11,4]]}
  ],
  roads: [['hakushi','inaba'],['inaba','tajima'],['tajima','tango'],['tango','yamashiro'],['bitchu','mimasaka'],['mimasaka','harima'],['harima','kawachi'],['kawachi','yamashiro'],['kawachi','kii'],['awaji','kawachi'],['sanuki','awaji'],['yamashiro','yamato'],['yamashiro','minamise'],['yamashiro','minamikinki'],['minamikinki','kitakinki'],['minamikinki','nishimino'],['kitakinki','echizen'],['echizen','kaga'],['kaga','etchu'],['etchu','echigo'],['nishimino','higashimino'],['higashimino','minaminoshinano'],['minaminoshinano','kitanoshinano'],['kitanoshinano','kai-suruga'],['kai-suruga','totomi'],['nishimino','owari'],['owari','kitaise'],['owari','mikawa'],['mikawa','totomi'],['kitaise','minamise']],
  cards: [
    {name:'織田信長',side:'player',leaders:['織田信長','羽柴秀吉','明智光秀','柴田勝家','丹羽長秀'],reinforce:'actingOda',description:'信長または任意の織田家臣1人が行動する。織田家臣が信長側または中立なら参戦マーカーを戻せる。補充時は行動した織田軍武将に戦略値分。'},
    {name:'徳川家康',side:'player',leaders:['徳川家康'],reinforce:'tokugawa',track:'tokugawa',description:'徳川家康が行動する。参戦状態によってマーカーが移動し、反逆に達すると反信長側に寝返る。補充は徳川軍1駒。'},
    {name:'松永久秀',side:'player',leaders:['松永久秀'],reinforce:'matsunaga',track:'matsunaga',description:'松永久秀が行動する。中立なら参戦マーカーを進め、反逆に達すると反信長側に寝返る。補充は松永軍1駒。'},
    {name:'追討令',side:'event',effect:'repeatPreviousAndReshuffle',description:'直前のカードを再度処理。その後、使用済みと残りの札を集めて切り直す。山札の1枚目なら効果なし。'},
    {name:'羽柴秀吉',side:'player',leaders:['羽柴秀吉'],reinforce:'actingOda',description:'羽柴秀吉が行動する。補充は織田軍なら戦略値分、反逆織田軍なら2駒。'},
    {name:'明智光秀',side:'player',leaders:['明智光秀'],reinforce:'actingOda',description:'明智光秀が行動する。補充は織田軍なら戦略値分、反逆織田軍なら2駒。'},
    {name:'柴田勝家',side:'player',leaders:['柴田勝家'],reinforce:'actingOda',description:'柴田勝家が行動する。補充は織田軍なら戦略値分、反逆織田軍なら2駒。'},
    {name:'丹羽長秀',side:'player',leaders:['丹羽長秀'],reinforce:'actingOda',description:'丹羽長秀が行動する。補充は織田軍なら戦略値分、反逆織田軍なら2駒。'},
    {name:'武田信玄',side:'enemy',leaders:['武田信玄'],reinforce:[['武田信玄',2]],description:'武田信玄が行軍または攻撃し、武田軍を2駒補充する。'},
    {name:'浅井・朝倉',side:'enemy',leaders:['浅井長政','朝倉義景'],reinforce:[['浅井長政',1],['朝倉義景',1]],description:'浅井長政と朝倉義景が行軍または攻撃し、それぞれの軍を1駒補充する。'},
    {name:'三好三人衆',side:'enemy',leaders:['三好三人衆'],reinforce:[['三好三人衆',1]],description:'三好三人衆が行軍または攻撃し、三好軍を1駒補充する。'},
    {name:'本願寺',side:'enemy',leaders:['雑賀孫市'],special:'ikkoshuHomeAttacks',reinforce:[['雑賀孫市',1],['摂津',2],['北伊勢',2],['加賀',2]],description:'雑賀孫市が行軍または攻撃。一向一揆は本領エリアで攻撃する。雑賀孫市に1駒、摂津・北伊勢・加賀の一向一揆に各2駒補充。'},
    {name:'上杉謙信',side:'event',leaders:['上杉謙信'],track:'uesugi',reinforce:[['上杉謙信',2]],description:'上杉謙信の参戦マーカーを1列進める。参戦に達していれば上杉軍が行動し、2駒補充する。'},
    {name:'毛利輝元',side:'event',leaders:['毛利輝元','小早川隆景','吉川元春'],track:'mori',reinforce:[['毛利輝元',1],['小早川隆景',1],['吉川元春',1]],description:'毛利輝元の参戦マーカーを1列進める。参戦に達していれば毛利・小早川・吉川の各軍が行動し、それぞれ1駒補充する。'},
    {name:'宇喜多直家',side:'event',leaders:['宇喜多直家'],track:'ukita',reinforce:[['宇喜多直家',1]],description:'宇喜多直家の参戦マーカーを1列進める。参戦に達していれば宇喜多軍が行動し、1駒補充する。'},
    {name:'足利義昭',side:'event',effect:'advanceOrRepeatPrevious',description:'直前が反信長大名のカードなら、そのカードを再処理。織田家臣または信長側大名なら、該当する参戦マーカーを1列進める。反逆に達した場合は寝返る。山札の1枚目なら効果なし。'}
  ],
  units: {
    leaders: {'織田信長':2,'柴田勝家':2,'丹羽長秀':2,'羽柴秀吉':2,'明智光秀':2,'徳川家康':4,'松永久秀':2,'武田信玄':4,'浅井長政':3,'朝倉義景':2,'三好三人衆':2,'雑賀孫市':2,'毛利輝元':2,'小早川隆景':2,'吉川元春':2,'宇喜多直家':2,'上杉謙信':5},
    armies: {'織田軍':46,'徳川軍':5,'松永軍':5,'武田軍':13,'長島一向一揆':4,'石山一向一揆':6,'本願寺（雑賀軍）':1,'加賀一向一揆':4,'中立軍':6,'浅井軍':5,'朝倉軍':5,'三好軍':5,'毛利軍':5,'小早川軍':5,'吉川軍':7,'宇喜多軍':5,'上杉軍':8},
    notes:'2026-11-09 draft sheet; replace with official counter data when supplied.'
  },
  cardBackImage: 'assets/cards/back.jpg',
  cardImages: {
    '織田信長':'assets/cards/01_織田信長.png','徳川家康':'assets/cards/02_徳川家康.png','松永久秀':'assets/cards/03_松永久秀.png','追討令':'assets/cards/04_追討令.png',
    '羽柴秀吉':'assets/cards/05_羽柴秀吉.png','明智光秀':'assets/cards/06_明智光秀.png','柴田勝家':'assets/cards/07_柴田勝家.png','丹羽長秀':'assets/cards/08_丹羽長秀.png',
    '武田信玄':'assets/cards/09_武田信玄.png','浅井・朝倉':'assets/cards/10_浅井朝倉.png','三好三人衆':'assets/cards/11_三好三人衆.png','本願寺':'assets/cards/12_本願寺.png',
    '上杉謙信':'assets/cards/13_上杉謙信.png','毛利輝元':'assets/cards/14_毛利輝元.png','宇喜多直家':'assets/cards/15_宇喜多直家.png','足利義昭':'assets/cards/16_足利義昭.png'
  },
  goals: {controlAll: true, defeatAreas: ['yamashiro','nishimino'], minimumStrategy: 2},
  unitImages: {}
};
