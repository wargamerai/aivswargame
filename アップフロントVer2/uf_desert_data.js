// Desert War personnel. The statistics follow the supplied front and back card images.
const UF_DESERT_SOLDIERS = {
  ita: `#,階級,名前,CCV表,リーダー,武器カテゴリ,X値,武器名,射程0,射程1,射程2,射程3,射程4,射程5,士気,PT,戦死表,パニック,CCV裏,戦死裏,ルート/RNC,裏面備考
1,軍曹,FERRARO,6/3,分隊長,短機関銃,X6,Beretta M38-A,0,0,0,1,3,5,3,36,8,3,2/-1,9,0r RNC > 2,手札数減少
2,伍長,ANTONIO,9/4,副分隊長,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,4,32,8,4,5/0,9,0r RNC > 3,分隊長時のみ手札数減少
3,上等兵,CAPITANO,5/4,,軽機関銃,X5-6,Breda Mod 30,2,3,4,5,5,6,4,33,8,3,1/0,9,0r RNC > 2,副武器使用不可
4,兵卒,SARDUCCI,9/4,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,4,10,8,3,5/0,9,0r RNC > 2,
5,兵卒,NARDO,7/2,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,2,5,8,1,3/-2,9,0r RNC > 1,
6,兵卒,ABRUZZI,8/3,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,3,9,8,3,4/-1,9,0r RNC > 2,
7,兵卒,MARINO,8/3,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,3,7,8,2,4/-1,9,0r RNC > 1,
8,兵卒,PAOLINI,10/5,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,5,12,8,4,6/1,9,0r RNC > 3,
9,上等兵,NAPOLI,4/3,,軽機関銃,X5-6,Breda Mod 30,2,3,4,5,5,6,3,30,8,3,0/-1,9,0r RNC > 2,副武器使用不可
10,兵卒,CELOZZI,7/2,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,2,6,8,2,3/-2,9,0r RNC > 1,
11,兵卒,GIORGIO,8/3,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,3,7,8,2,4/-1,9,0r RNC > 1,
12,兵卒,PASINI,8/3,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,3,9,8,3,4/-1,9,0r RNC > 2,
13,兵卒,FARINACCI,8/3,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,3,7,8,2,4/-1,9,0r RNC > 1,
14,兵卒,GIONELLI,7/2,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,2,6,8,2,3/-2,9,0r RNC > 1,
15,兵卒,CIAPPI,7/2,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,2,5,8,1,3/-2,9,0r RNC > 1,
16,兵卒,NATALE,7/2,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,2,6,8,2,3/-2,9,0r RNC > 1,
17,兵卒,COSTANZI,7/2,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,2,5,8,1,3/-2,9,0r RNC > 1,
18,兵卒,GIGANTI,9/4,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,4,10,8,3,5/0,9,0r RNC > 2,
19,兵卒,ROMANO,6/1,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,1,3,8,1,2/-3,9,0r RNC > 1,
20,兵卒,MOSELLI,6/1,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,1,2,8,0,2/-3,9,unless KIA,
21,軍曹,CAPONE,7/4,分隊長,短機関銃,X6,Beretta M38-A,0,0,0,1,3,5,4,39,8,4,3/0,9,0r RNC > 3,手札数減少
22,伍長,FARRIO,6/3,副分隊長,短機関銃,X6,Beretta M38-A,0,0,0,1,3,5,3,31,8,3,2/-1,9,0r RNC > 2,分隊長時のみ手札数減少
23,兵卒,CORRERI,7/2,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,2,6,8,2,3/-2,9,0r RNC > 1,
24,兵卒,TIOLLE,7/2,,ボルトアクション小銃,X6,Mannlicher Carcano M91/41,0,0,1,2,2,3,2,5,8,1,3/-2,9,0r RNC > 1,
25,上等兵,GIOVINO,3/3,,45mm迫撃砲,[X4-6] X5-6,Mod 35 Brixia,0[2],0-1[1],0-2[0],0-3[0-1],0-3[0-1],NA/2FP,3,35,8,3,-1/-1,9,0r RNC > 2,副武器使用不可 / 移動射撃不可
26,上等兵,LEONE,2/3,,火炎放射器,X5-6,Lanciafiamme M40,NA,NA,NA,NA,NA,12,3,30,7,2,-2/-1,8,0r RNC > 1,副武器使用不可 / 移動射撃半減なし
27,上等兵,SALVADORI,3/3,,中機関銃,[X4-6] X5-6,Fiat Revelli M35,6[3],7[4],8[4],9[5],10[5],11[6],3,52,8,3,-1/-1,9,0r RNC > 3,副武器使用不可 / 移動射撃不可
28,上等兵,RITONDO,3/3,,対戦車ライフル,[X5-6] X6,Solothurn 20mm,4[5]/1,3[4]/1,3[4]/1,2[3]/1,2[3]/1,1[2]/1,3,9,8,2,-1/-1,9,0r RNC > 1,副武器使用不可 / 移動射撃不可 / 側面射撃 -1命中頻度`,
  fra: `#,階級,名前,CCV表,リーダー,武器カテゴリ,X値,武器名,射程0,射程1,射程2,射程3,射程4,射程5,士気,PT,戦死表,パニック,CCV裏,戦死裏,ルート/RNC,裏面備考
1,軍曹,VILLENEUVE,8/3,分隊長,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,3,38,8,4,4/-1,9,0r RNC > 4,手札数減少
2,伍長,DUBOIS,9/4,副分隊長,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,4,35,8,4,5/0,9,0r RNC > 4,分隊長時のみ手札数減少
3,上等兵,LARUE,5/4,,軽機関銃,X6,Chatellerault Mle 24/29,2,3,4,5,6,7,4,57,8,5,1/0,9,0r RNC > 5,副武器使用不可
4,兵卒,CASSAVANT,9/4,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,4,15,8,4,5/0,9,0r RNC > 4,
5,兵卒,CORBEIL,6/1,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,1,4,8,2,2/-3,9,0r RNC > 2,
6,兵卒,PICCARD,8/3,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,3,11,8,3,4/-1,9,0r RNC > 3,
7,兵卒,LAFORTE,10/5,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,5,19,8,5,6/1,9,0r RNC > 5,
8,兵卒,DECAUTAUX,8/3,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,3,13,8,4,4/-1,9,0r RNC > 4,
9,兵卒,BIENVENUE,9/4,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,4,15,8,4,5/0,9,0r RNC > 4,
10,兵卒,MEILLEURE,7/2,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,2,8,8,2,3/-2,9,0r RNC > 2,
11,兵卒,KASTLER,7/2,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,2,9,8,3,3/-2,9,0r RNC > 3,
12,兵卒,ROUSSELLE,8/3,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,3,13,8,4,4/-1,9,0r RNC > 4,
13,伍長,HOULE,4/4,,中機関銃,[X5-6] X6,Hotchkiss,6[3],7[4],8[4],9[5],10[5],11[6],4,92,8,5,0/0,9,0r RNC > 5,副武器使用不可 / 移動射撃不可
14,上等兵,MONTCALM,3/4,,火炎放射器,X5-6,Flamethrower,NA,NA,NA,NA,NA,12,4,34,7,5,-1/0,8,0r RNC > 5,副武器使用不可 / 移動射撃半減なし
15,兵卒,BRENTON,8/3,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,3,11,8,3,4/-1,9,0r RNC > 3,
16,兵卒,BAUDET,8/3,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,3,11,8,3,4/-1,9,0r RNC > 3,
17,兵卒,ROCHARD,10/5,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,5,19,8,5,6/1,9,0r RNC > 5,
18,兵卒,BOURASSA,7/2,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,2,8,8,2,3/-2,9,0r RNC > 2,
19,兵卒,TARDIEU,6/1,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,1,4,8,2,2/-3,9,0r RNC > 2,
20,兵卒,BERNET,10/5,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,5,22,8,6,6/1,9,0r RNC > 6,
21,軍曹,PETROU,9/4,分隊長,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,4,43,8,5,5/0,9,0r RNC > 5,手札数減少
22,伍長,GOREUX,8/3,副分隊長,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,3,33,8,4,4/-1,9,0r RNC > 4,分隊長時のみ手札数減少
23,兵卒,BARRAL,7/2,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,2,9,8,3,3/-2,9,0r RNC > 3,
24,兵卒,LEBESQUE,6/1,,ボルトアクション小銃,X6,MAS 36 CR39,0,1,1,2,2,3,1,4,8,1,2/-3,9,0r RNC > 1,
25,上等兵,SARTE,3/3,,50mm迫撃砲,[X4-6] X5-6,50mm Mle 37,1[3],0[2],0-1[1],0-2[0],0-3[0-1],NA/2FP,3,42,8,3,-1/-1,9,0r RNC > 3,副武器使用不可 / 移動射撃不可
26,上等兵,LASALLE,4/4,,60mm迫撃砲,[X4-6] X5-6,60mm Mle 35,0[2],0-1[1],0-2[0],0-3[0-1],NA/1FP,NA/2FP,4,61,8,4,0/0,9,0r RNC > 4,副武器使用不可 / 移動射撃不可
27,上等兵,ROCHE,4/3,,軽機関銃,X6,Chatellerault Mle 24/29,2,3,4,5,6,7,3,43,8,4,0/-1,9,0r RNC > 4,副武器使用不可`,
};

// Vehicle profiles and infantry guns transcribed from both faces of the supplied cards.
const UF_DESERT_VEHICLES = {
  ita: [
    {"image": 31, "name": "L3/35", "pt": 90, "ot": false, "ce": {"ovr": 1, "fp": [3, 4, 5, 6, 7, 8], "hit": null, "bog": "6", "bogW": "8", "armor": {"is": 0, "k": 1}, "flank": {"is": -1, "k": 0}, "morale": 3, "ceVal": 9}, "bu": {"ovr": 0, "fp": [2, 3, 3, 4, 4, 5], "hit": null, "bog": "5", "bogW": "7", "armor": {"is": 0, "k": 1}, "flank": {"is": -1, "k": 0}}, "effect": null},
    {"image": 32, "name": "L3/Lf", "pt": 120, "ot": false, "ce": {"ovr": 4, "fp": [2, 3, 3, 4, 4, 5], "hit": null, "bog": "5", "bogW": "7", "armor": {"is": 0, "k": 1}, "flank": {"is": -1, "k": 0}, "morale": 3, "ceVal": 9, "flame": [0, 0, 0, 0, 0, 14]}, "bu": {"ovr": 3, "fp": [1, 2, 2, 3, 3, 4], "hit": null, "bog": "3", "bogW": "6", "armor": {"is": 0, "k": 1}, "flank": {"is": -1, "k": 0}, "flame": [0, 0, 0, 0, 0, 10]}, "effect": null},
    {"image": 33, "name": "M13/40", "pt": 260, "ot": false, "ce": {"ovr": 3, "fp": [5, 6, 7, 8, 9, 10], "hit": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "bog": "6", "bogW": "0r", "armor": {"i": 1, "s": 2, "k": 3}, "flank": {"i": 0, "s": 1, "k": 2}, "morale": 3, "ceVal": 9}, "bu": {"ovr": 2, "fp": [4, 5, 5, 6, 6, 7], "hit": ["3", "1", "0", "0-1", "0-2", "0-3"], "bog": "5", "bogW": "9", "armor": {"i": 1, "s": 2, "k": 3}, "flank": {"i": 0, "s": 1, "k": 2}}, "effect": {"infantry": 2, "box": 2}},
    {"image": 34, "name": "Semovente M41", "pt": 223, "ot": false, "ce": {"ovr": 2, "fp": [2, 3, 4, 5, 6, 7], "hit": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "bog": "5", "bogW": "8", "armor": {"i": 1, "s": 2, "k": 3}, "flank": {"i": 0, "s": 1, "k": 2}, "morale": 3, "ceVal": 9}, "bu": {"ovr": 0, "fp": [0, 0, 0, 0, 0, 0], "hit": ["3", "1", "0", "0-1", "0-2", "0-3"], "bog": "5", "bogW": "8", "armor": {"i": 1, "s": 2, "k": 3}, "flank": {"i": 0, "s": 1, "k": 2}}, "effect": {"infantry": 4, "box": 2}, "fixedGun": true, "mainGunMalfunction": "X4-6"},
    {"image": 35, "name": "Ansaldo AB 41", "pt": 162, "ot": false, "ce": {"ovr": 2, "fp": [2, 3, 4, 5, 6, 7], "hit": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "bog": "4", "bogW": "7", "armor": {"is": -1, "k": 0}, "flank": {"is": -2, "k": -1}, "morale": 3, "ceVal": 9}, "bu": {"ovr": 1, "fp": [1, 2, 2, 3, 3, 4], "hit": ["3", "1", "0", "0-1", "0-2", "0-3"], "bog": "3", "bogW": "6", "armor": {"is": -1, "k": 0}, "flank": {"is": -2, "k": -1}}, "effect": {"infantry": 1, "box": 0}, "mainGunMalfunction": "X4-6"},
  ],
  fra: [
    {"image": 31, "name": "Char Léger H39", "pt": 273, "ot": false, "ce": {"ovr": 2, "fp": [2, 3, 4, 5, 6, 7], "hit": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "bog": "8", "bogW": "0r", "armor": {"i": 2, "s": 3, "k": 4}, "flank": {"i": 1, "s": 2, "k": 3}, "morale": 4, "ceVal": 9}, "bu": {"ovr": 1, "fp": [2, 3, 3, 4, 4, 5], "hit": ["3", "1", "0", "0-1", "0-2", "0-3"], "bog": "6", "bogW": "9", "armor": {"i": 2, "s": 3, "k": 4}, "flank": {"i": 1, "s": 2, "k": 3}}, "effect": {"infantry": 1, "box": 1}},
    {"image": 32, "name": "Char Léger R35", "pt": 262, "ot": false, "ce": {"ovr": 2, "fp": [2, 3, 4, 5, 6, 7], "hit": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "bog": "8", "bogW": "0r", "armor": {"i": 2, "s": 3, "k": 4}, "flank": {"i": 1, "s": 2, "k": 3}, "morale": 4, "ceVal": 9}, "bu": {"ovr": 1, "fp": [2, 3, 3, 4, 4, 5], "hit": ["3", "1", "0", "0-1", "0-2", "0-3"], "bog": "7", "bogW": "9", "armor": {"i": 2, "s": 3, "k": 4}, "flank": {"i": 1, "s": 2, "k": 3}}, "effect": {"infantry": 1, "box": 0}},
    {"image": 33, "name": "Char S-35", "pt": 297, "ot": false, "ce": {"ovr": 2, "fp": [2, 3, 4, 5, 6, 7], "hit": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "bog": "6", "bogW": "0r", "armor": {"i": 2, "s": 3, "k": 4}, "flank": {"i": 1, "s": 2, "k": 3}, "morale": 4, "ceVal": 9}, "bu": {"ovr": 1, "fp": [2, 3, 3, 4, 4, 5], "hit": ["3", "1", "0", "0-1", "0-2", "0-3"], "bog": "5", "bogW": "9", "armor": {"i": 2, "s": 3, "k": 4}, "flank": {"i": 1, "s": 2, "k": 3}}, "effect": {"infantry": 2, "box": 2}},
    {"image": 34, "name": "Char B1 bis", "pt": 315, "ot": false, "ce": {"ovr": 3, "fp": [3, 4, 5, 6, 7, 8], "hit": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "bog": "5", "bogW": "0r", "armor": {"i": 3, "s": 4, "k": 5}, "flank": {"i": 1, "s": 2, "k": 3}, "morale": 4, "ceVal": 9}, "bu": {"ovr": 2, "fp": [2, 3, 4, 5, 6, 7], "hit": ["3", "1", "0", "0-1", "0-2", "0-3"], "bog": "4", "bogW": "9", "armor": {"i": 3, "s": 4, "k": 5}, "flank": {"i": 1, "s": 2, "k": 3}}, "effect": {"infantry": 2, "box": 2}, "hullGun": {"infantry": 4, "box": 2}},
    {"image": 35, "name": "AMD 35", "pt": 232, "ot": false, "ce": {"ovr": 2, "fp": [2, 3, 4, 5, 6, 7], "hit": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "bog": "4", "bogW": "7", "armor": {"i": 1, "s": 2, "k": 3}, "flank": {"i": 0, "s": 1, "k": 2}, "morale": 4, "ceVal": 9}, "bu": {"ovr": 1, "fp": [2, 3, 3, 4, 4, 5], "hit": ["3", "1", "0", "0-1", "0-2", "0-3"], "bog": "3", "bogW": "6", "armor": {"i": 1, "s": 2, "k": 3}, "flank": {"i": 0, "s": 1, "k": 2}}, "effect": {"infantry": 1, "box": 0}},
  ],
};
const UF_DESERT_GUNS = {
  ita: [
    {"number": 29, "name": "20mm ATG M35", "armor": 0, "infantry": 1, "range": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "pt": 113, "ccvFront": "5/5", "ccvBack": "1/1", "morale": "5", "kiaFront": "9", "kiaBack": "9", "panic": "4", "rncRoute": "0r RNC > 3", "boxedDefense": {"morale": "3", "kiaFront": "7", "kiaBack": "7", "panic": "2"}},
    {"number": 30, "name": "47mm ATG M35", "armor": 2, "infantry": 2, "range": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "pt": 163, "ccvFront": "5/5", "ccvBack": "1/1", "morale": "5", "kiaFront": "9", "kiaBack": "9", "panic": "4", "rncRoute": "0r RNC > 3", "boxedDefense": {"morale": "3", "kiaFront": "7", "kiaBack": "7", "panic": "2"}},
  ],
  fra: [
    {"number": 28, "name": "37mm Mle 16 TRP", "armor": 1, "infantry": 1, "range": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "pt": 191, "ccvFront": "5/5", "ccvBack": "1/1", "morale": "5", "kiaFront": "9", "kiaBack": "9", "panic": "6", "rncRoute": "0r RNC > 6", "boxedDefense": {"morale": "3", "kiaFront": "7", "kiaBack": "7", "panic": "4"}},
    {"number": 29, "name": "47mm SA Mle 37", "armor": 2, "infantry": 2, "range": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "pt": 225, "ccvFront": "5/5", "ccvBack": "1/1", "morale": "5", "kiaFront": "9", "kiaBack": "9", "panic": "6", "rncRoute": "0r RNC > 6", "boxedDefense": {"morale": "3", "kiaFront": "7", "kiaBack": "7", "panic": "4"}},
    {"number": 30, "name": "75mm Mle 19", "armor": 4, "infantry": 4, "range": ["1", "0-1", "0-2", "0-3", "0-4", "0-5"], "pt": 295, "ccvFront": "5/5", "ccvBack": "1/1", "morale": "5", "kiaFront": "9", "kiaBack": "9", "panic": "6", "rncRoute": "0r RNC > 6", "boxedDefense": {"morale": "3", "kiaFront": "7", "kiaBack": "7", "panic": "4"}},
  ],
};
