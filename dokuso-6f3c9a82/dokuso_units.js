// 独ソ電撃戦 ユニットの画像一覧（images フォルダから自動作成）
// ger: ドイツ軍の駒（裏なし）。sovFront: ソ連の表（戦闘力U、種類ごとに共通）。sovImages: ソ連の裏（種類→戦闘力→画像）
const DOKUSO_UNIT_IMAGES = {
 "ger": [
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "5",
   "corps": "IIIPz",
   "img": "images/ドイツ/歩兵/5 xx IIIPz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "6",
   "corps": "IIIPz",
   "img": "images/ドイツ/歩兵/6 xx IIIPz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "7",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/7 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "8",
   "corps": "IX",
   "img": "images/ドイツ/歩兵/8 xx IX  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "17",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/17 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "23",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/23 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "26",
   "corps": "IIIPz",
   "img": "images/ドイツ/歩兵/26 xx IIIPz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "28",
   "corps": "IX",
   "img": "images/ドイツ/歩兵/28 xx IX  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "31",
   "corps": "II Pz",
   "img": "images/ドイツ/歩兵/31 xx II Pz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "34",
   "corps": "II Pz",
   "img": "images/ドイツ/歩兵/34 xx II Pz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "35",
   "corps": "IIIPz",
   "img": "images/ドイツ/歩兵/35 xx IIIPz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "45",
   "corps": "II Pz",
   "img": "images/ドイツ/歩兵/45 xx II Pz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "78",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/78 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "87",
   "corps": "IX",
   "img": "images/ドイツ/歩兵/87 xx IX  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "102",
   "corps": "IX",
   "img": "images/ドイツ/歩兵/102 xx IX  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "129",
   "corps": "IX",
   "img": "images/ドイツ/歩兵/129 xx IX  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "131",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/131 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "134",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/134 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "137",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/137 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "161",
   "corps": "IX",
   "img": "images/ドイツ/歩兵/161 xx IX  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "162",
   "corps": "IX",
   "img": "images/ドイツ/歩兵/162 xx IX  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "167",
   "corps": "II Pz",
   "img": "images/ドイツ/歩兵/167 xx II Pz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "252",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/252 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "255",
   "corps": "II Pz",
   "img": "images/ドイツ/歩兵/255 xx II Pz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "256",
   "corps": "IX",
   "img": "images/ドイツ/歩兵/256 xx IX  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "258",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/258 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "263",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/263 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "267",
   "corps": "II Pz",
   "img": "images/ドイツ/歩兵/267 xx II Pz 5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "268",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/268 xx IV  5-4.jpg"
  },
  {
   "type": "inf",
   "str": 5,
   "mov": 4,
   "num": "292",
   "corps": "IV",
   "img": "images/ドイツ/歩兵/292 xx IV  5-4.jpg"
  },
  {
   "type": "tank",
   "str": 10,
   "mov": 10,
   "num": "3",
   "corps": "IIPz",
   "img": "images/ドイツ/戦車/3 xx IIPz 10-10.jpg"
  },
  {
   "type": "tank",
   "str": 10,
   "mov": 10,
   "num": "4",
   "corps": "IIPz",
   "img": "images/ドイツ/戦車/4 xx IIPz 10-10.jpg"
  },
  {
   "type": "tank",
   "str": 10,
   "mov": 10,
   "num": "7",
   "corps": "IIIPz",
   "img": "images/ドイツ/戦車/7 xx IIIPz 10-10.jpg"
  },
  {
   "type": "mot",
   "str": 7,
   "mov": 10,
   "num": "10",
   "corps": "II Pz",
   "img": "images/ドイツ/戦車/10 xx II Pz 7-10.jpg"
  },
  {
   "type": "tank",
   "str": 10,
   "mov": 10,
   "num": "10",
   "corps": "IIPz",
   "img": "images/ドイツ/戦車/10 xx IIPz 10-10.jpg"
  },
  {
   "type": "tank",
   "str": 10,
   "mov": 10,
   "num": "12",
   "corps": "IIIPz",
   "img": "images/ドイツ/戦車/12 xx IIIPz 10-10.jpg"
  },
  {
   "type": "mot",
   "str": 7,
   "mov": 10,
   "num": "14",
   "corps": "IIIPz",
   "img": "images/ドイツ/戦車/14 xx IIIPz 7-10.jpg"
  },
  {
   "type": "tank",
   "str": 10,
   "mov": 10,
   "num": "17",
   "corps": "IIPz",
   "img": "images/ドイツ/戦車/17 xx IIPz 10-10.jpg"
  },
  {
   "type": "mot",
   "str": 7,
   "mov": 10,
   "num": "18",
   "corps": "IIIPz",
   "img": "images/ドイツ/戦車/18 xx IIIPz 7-10.jpg"
  },
  {
   "type": "tank",
   "str": 10,
   "mov": 10,
   "num": "18",
   "corps": "IIPz",
   "img": "images/ドイツ/戦車/18 xx IIPz 10-10.jpg"
  },
  {
   "type": "mot",
   "str": 7,
   "mov": 10,
   "num": "20",
   "corps": "IIIPz",
   "img": "images/ドイツ/戦車/20 xx IIIPz 7-10.jpg"
  },
  {
   "type": "mot",
   "str": 7,
   "mov": 10,
   "num": "29",
   "corps": "II Pz",
   "img": "images/ドイツ/戦車/29 xx II Pz 7-10.jpg"
  },
  {
   "type": "mot",
   "str": 7,
   "mov": 10,
   "num": "DRSS",
   "corps": "II Pz",
   "img": "images/ドイツ/戦車/DRSS xx II Pz 7-10.jpg"
  }
 ],
 "sovImages": {
  "inf": {
   "0": [
    {
     "num": "113",
     "img": "images/ソ連/歩兵/113 xx 0-3.jpg"
    },
    {
     "num": "155",
     "img": "images/ソ連/歩兵/155 xx 0-3.jpg"
    }
   ],
   "1": [
    {
     "num": "50",
     "img": "images/ソ連/歩兵/50 xx 1-3.jpg"
    },
    {
     "num": "53",
     "img": "images/ソ連/歩兵/53 xx 1-3.jpg"
    },
    {
     "num": "55",
     "img": "images/ソ連/歩兵/55 xx1-3.jpg"
    },
    {
     "num": "75",
     "img": "images/ソ連/歩兵/75 xx 1-3.jpg"
    },
    {
     "num": "102",
     "img": "images/ソ連/歩兵/102 xx 1-3.jpg"
    },
    {
     "num": "108",
     "img": "images/ソ連/歩兵/108 xx1-3.jpg"
    },
    {
     "num": "143",
     "img": "images/ソ連/歩兵/143 xx 1-3.jpg"
    },
    {
     "num": "161",
     "img": "images/ソ連/歩兵/161 xx1-3.jpg"
    }
   ],
   "2": [
    {
     "num": "23",
     "img": "images/ソ連/歩兵/23 xx 2-3.jpg"
    },
    {
     "num": "27",
     "img": "images/ソ連/歩兵/27 xx 2-3.jpg"
    },
    {
     "num": "33",
     "img": "images/ソ連/歩兵/33 xx 2-3.jpg"
    },
    {
     "num": "56",
     "img": "images/ソ連/歩兵/56 xx 2-3.jpg"
    },
    {
     "num": "64",
     "img": "images/ソ連/歩兵/64 xx2-3.jpg"
    },
    {
     "num": "86",
     "img": "images/ソ連/歩兵/86 xx 2-3.jpg"
    },
    {
     "num": "89",
     "img": "images/ソ連/歩兵/89 xx 2-3.jpg"
    },
    {
     "num": "110",
     "img": "images/ソ連/歩兵/110 xx 2-3.jpg"
    },
    {
     "num": "121",
     "img": "images/ソ連/歩兵/121 xx2-3.jpg"
    }
   ],
   "3": [
    {
     "num": "2",
     "img": "images/ソ連/歩兵/2 xx 3-3.jpg"
    },
    {
     "num": "17",
     "img": "images/ソ連/歩兵/17 xx 3-3.jpg"
    },
    {
     "num": "100",
     "img": "images/ソ連/歩兵/100 xx3-3.jpg"
    },
    {
     "num": "148",
     "img": "images/ソ連/歩兵/148 xx 3-3.jpg"
    },
    {
     "num": "172",
     "img": "images/ソ連/歩兵/172 xx 3-3.jpg"
    },
    {
     "num": "187",
     "img": "images/ソ連/歩兵/187 xx 3-3.jpg"
    }
   ],
   "4": [
    {
     "num": "6",
     "img": "images/ソ連/歩兵/6 xx 4-3.jpg"
    },
    {
     "num": "13",
     "img": "images/ソ連/歩兵/13 xx 4-3.jpg"
    },
    {
     "num": "24",
     "img": "images/ソ連/歩兵/24 xx 4-3.jpg"
    },
    {
     "num": "37",
     "img": "images/ソ連/歩兵/37 xx 4-3.jpg"
    }
   ]
  },
  "cav": {
   "0": [
    {
     "num": "36",
     "img": "images/ソ連/騎兵/36 xx 0-7.jpg"
    }
   ],
   "1": [
    {
     "num": "27",
     "img": "images/ソ連/騎兵/27 xx 1-7.jpg"
    },
    {
     "num": "42",
     "img": "images/ソ連/騎兵/42 xx 1-7.jpg"
    }
   ],
   "3": [
    {
     "num": "6",
     "img": "images/ソ連/騎兵/6 xx 3-7.jpg"
    }
   ]
  },
  "tank": {
   "0": [
    {
     "num": "205",
     "img": "images/ソ連/戦車/205 xx 0-8.jpg"
    }
   ],
   "1": [
    {
     "num": "103",
     "img": "images/ソ連/戦車/103 xx 1-8.jpg"
    }
   ],
   "2": [
    {
     "num": "204",
     "img": "images/ソ連/戦車/204 xx 2-8.jpg"
    }
   ],
   "3": [
    {
     "num": "4",
     "img": "images/ソ連/戦車/4 xx 3-8.jpg"
    },
    {
     "num": "25",
     "img": "images/ソ連/戦車/25 xx 3-8.jpg"
    }
   ],
   "4": [
    {
     "num": "29",
     "img": "images/ソ連/戦車/29 xx 4-8.jpg"
    },
    {
     "num": "50",
     "img": "images/ソ連/戦車/50 xx 4-8.jpg"
    },
    {
     "num": "54",
     "img": "images/ソ連/戦車/54 xx 4-8.jpg"
    }
   ],
   "5": [
    {
     "num": "26",
     "img": "images/ソ連/戦車/26 xx 5-8.jpg"
    },
    {
     "num": "30",
     "img": "images/ソ連/戦車/30 xx 5-8.jpg"
    },
    {
     "num": "33",
     "img": "images/ソ連/戦車/33 xx 5-8.jpg"
    },
    {
     "num": "55",
     "img": "images/ソ連/戦車/55 xx 5-8.jpg"
    }
   ],
   "6": [
    {
     "num": "5",
     "img": "images/ソ連/戦車/5 xx 6-8.jpg"
    },
    {
     "num": "27",
     "img": "images/ソ連/戦車/27 xx6-8.jpg"
    },
    {
     "num": "210",
     "img": "images/ソ連/戦車/210 xx 6-8.jpg"
    }
   ],
   "7": [
    {
     "num": "4",
     "img": "images/ソ連/戦車/4 xx 7-8.jpg"
    },
    {
     "num": "29",
     "img": "images/ソ連/戦車/29 xx 7-8.jpg"
    },
    {
     "num": "31",
     "img": "images/ソ連/戦車/31 xx 7-8.jpg"
    }
   ],
   "8": [
    {
     "num": "22",
     "img": "images/ソ連/戦車/22 xx 8-8.jpg"
    },
    {
     "num": "38",
     "img": "images/ソ連/戦車/38 xx 8-8.jpg"
    }
   ],
   "9": [
    {
     "num": "7",
     "img": "images/ソ連/戦車/7 xx 9-8.jpg"
    }
   ]
  }
 },
 "sovFront": {
  "inf": "images/ソ連/歩兵/xx U-3.jpg",
  "cav": "images/ソ連/騎兵/xx U-7.jpg",
  "tank": "images/ソ連/戦車/xx U-8.jpg"
 }
};
if (typeof module !== 'undefined') module.exports = DOKUSO_UNIT_IMAGES;
