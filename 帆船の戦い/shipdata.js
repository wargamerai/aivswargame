// shipdata.js — WSM艦艇スペック（国別）
// 各艦: guns, class, classNum, hull, rigging{l,c,r}, crew{l,r}, carronades{l,r},
//        gunHitTable{s1..s4}, pv{el,cr,av,gr,pr}, depth, notes
// class: SOL=戦列艦, F=フリゲート, C=コルベット, B=ブリッグ, S=スループ
// pv: EL/CR/AV/GR/PR = Elite/Crack/Average/Green/Poor の得点値

const SHIP_SPECS = {
  "GB": [
    {
      "guns": 120,
      "class": "SOL",
      "classNum": 1,
      "hull": 27,
      "rigging": {
        "l": 12,
        "c": 12,
        "r": 12
      },
      "crew": {
        "l": 28,
        "r": 28
      },
      "carronades": {
        "l": 4,
        "r": 4
      },
      "gunHitTable": {
        "s1": 9,
        "s2": 9,
        "s3": 9,
        "s4": null
      },
      "pv": {
        "el": 43,
        "cr": 40,
        "av": 32,
        "gr": 30,
        "pr": 27
      },
      "depth": 24,
      "notes": ""
    },
    {
      "guns": 110,
      "class": "SOL",
      "classNum": 1,
      "hull": 27,
      "rigging": {
        "l": 12,
        "c": 12,
        "r": 10
      },
      "crew": {
        "l": 24,
        "r": 24
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 9,
        "s2": 9,
        "s3": 9,
        "s4": null
      },
      "pv": {
        "el": 38,
        "cr": 35,
        "av": 28,
        "gr": 26,
        "pr": 23
      },
      "depth": 24,
      "notes": ""
    },
    {
      "guns": 100,
      "class": "SOL",
      "classNum": 1,
      "hull": 26,
      "rigging": {
        "l": 12,
        "c": 12,
        "r": 10
      },
      "crew": {
        "l": 22,
        "r": 22
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": 8,
        "s4": null
      },
      "pv": {
        "el": 35,
        "cr": 32,
        "av": 26,
        "gr": 24,
        "pr": 22
      },
      "depth": 23,
      "notes": ""
    },
    {
      "guns": 98,
      "class": "SOL",
      "classNum": 1,
      "hull": 24,
      "rigging": {
        "l": 10,
        "c": 10,
        "r": 10
      },
      "crew": {
        "l": 20,
        "r": 20
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": 8,
        "s4": null
      },
      "pv": {
        "el": 33,
        "cr": 30,
        "av": 24,
        "gr": 23,
        "pr": 20
      },
      "depth": 22,
      "notes": ""
    },
    {
      "guns": 90,
      "class": "SOL",
      "classNum": 2,
      "hull": 21,
      "rigging": {
        "l": 10,
        "c": 10,
        "r": 10
      },
      "crew": {
        "l": 16,
        "r": 16
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": 8,
        "s4": null
      },
      "pv": {
        "el": 31,
        "cr": 28,
        "av": 22,
        "gr": 21,
        "pr": 18
      },
      "depth": 21,
      "notes": ""
    },
    {
      "guns": 84,
      "class": "SOL",
      "classNum": 2,
      "hull": 24,
      "rigging": {
        "l": 10,
        "c": 10,
        "r": 10
      },
      "crew": {
        "l": 20,
        "r": 20
      },
      "carronades": {
        "l": 4,
        "r": 4
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": 8,
        "s4": null
      },
      "pv": {
        "el": 34,
        "cr": 32,
        "av": 25,
        "gr": 24,
        "pr": 21
      },
      "depth": 21,
      "notes": ""
    },
    {
      "guns": 80,
      "class": "SOL",
      "classNum": 2,
      "hull": 24,
      "rigging": {
        "l": 10,
        "c": 10,
        "r": 8
      },
      "crew": {
        "l": 20,
        "r": 20
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": 8,
        "s4": null
      },
      "pv": {
        "el": 34,
        "cr": 31,
        "av": 24,
        "gr": 23,
        "pr": 21
      },
      "depth": 21,
      "notes": ""
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 2,
      "hull": 21,
      "rigging": {
        "l": 10,
        "c": 8,
        "r": 8
      },
      "crew": {
        "l": 18,
        "r": 18
      },
      "carronades": {
        "l": 4,
        "r": 4
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": 7,
        "s4": null
      },
      "pv": {
        "el": 30,
        "cr": 29,
        "av": 23,
        "gr": 21,
        "pr": 19
      },
      "depth": 21,
      "notes": "Large Class / 大型級"
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 2,
      "hull": 21,
      "rigging": {
        "l": 8,
        "c": 8,
        "r": 8
      },
      "crew": {
        "l": 16,
        "r": 16
      },
      "carronades": {
        "l": 4,
        "r": 4
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": 7,
        "s4": null
      },
      "pv": {
        "el": 29,
        "cr": 27,
        "av": 22,
        "gr": 20,
        "pr": 18
      },
      "depth": 20,
      "notes": "Common Class / 通常級"
    },
    {
      "guns": 67,
      "class": "SOL",
      "classNum": 2,
      "hull": 18,
      "rigging": {
        "l": 8,
        "c": 8,
        "r": 6
      },
      "crew": {
        "l": 14,
        "r": 14
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": 7,
        "s4": null
      },
      "pv": {
        "el": 25,
        "cr": 23,
        "av": 20,
        "gr": 18,
        "pr": 16
      },
      "depth": 19,
      "notes": ""
    },
    {
      "guns": 64,
      "class": "SOL",
      "classNum": 2,
      "hull": 17,
      "rigging": {
        "l": 8,
        "c": 6,
        "r": 6
      },
      "crew": {
        "l": 12,
        "r": 12
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": 7,
        "s4": null
      },
      "pv": {
        "el": 22,
        "cr": 20,
        "av": 17,
        "gr": 15,
        "pr": 13
      },
      "depth": 19,
      "notes": ""
    },
    {
      "guns": 54,
      "class": "SOL",
      "classNum": 2,
      "hull": 14,
      "rigging": {
        "l": 6,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 8,
        "r": 8
      },
      "carronades": {
        "l": 4,
        "r": 4
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": null
      },
      "pv": {
        "el": 20,
        "cr": 18,
        "av": 15,
        "gr": 12,
        "pr": 10
      },
      "depth": 17,
      "notes": ""
    },
    {
      "guns": 50,
      "class": "SOL",
      "classNum": 2,
      "hull": 13,
      "rigging": {
        "l": 6,
        "c": 6,
        "r": 4
      },
      "crew": {
        "l": 10,
        "r": 10
      },
      "carronades": {
        "l": 10,
        "r": 10
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": 7,
        "s4": null
      },
      "pv": {
        "el": 22,
        "cr": 20,
        "av": 18,
        "gr": 16,
        "pr": 14
      },
      "depth": 20,
      "notes": "Razee / レジー（上甲板切除改造艦）"
    },
    {
      "guns": 50,
      "class": "SOL",
      "classNum": 2,
      "hull": 12,
      "rigging": {
        "l": 6,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 8,
        "r": 8
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": null
      },
      "pv": {
        "el": 20,
        "cr": 17,
        "av": 13,
        "gr": 11,
        "pr": 9
      },
      "depth": 17,
      "notes": "Two Decker / 2層甲板"
    },
    {
      "guns": 50,
      "class": "F",
      "classNum": 3,
      "hull": 18,
      "rigging": {
        "l": 6,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 8,
        "r": 8
      },
      "carronades": {
        "l": 8,
        "r": 8
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": 6
      },
      "pv": {
        "el": 22,
        "cr": 20,
        "av": 18,
        "gr": 16,
        "pr": 14
      },
      "depth": 19,
      "notes": ""
    },
    {
      "guns": 46,
      "class": "F",
      "classNum": 3,
      "hull": 17,
      "rigging": {
        "l": 6,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 8,
        "r": 8
      },
      "carronades": {
        "l": 6,
        "r": 6
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": 6
      },
      "pv": {
        "el": 20,
        "cr": 18,
        "av": 15,
        "gr": 12,
        "pr": 10
      },
      "depth": 17,
      "notes": ""
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 3,
      "hull": 11,
      "rigging": {
        "l": 4,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 4,
        "r": 4
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 5
      },
      "pv": {
        "el": 14,
        "cr": 12,
        "av": 10,
        "gr": 9,
        "pr": 8
      },
      "depth": 17,
      "notes": "Two Decker / 2層甲板"
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 3,
      "hull": 17,
      "rigging": {
        "l": 6,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 10,
        "r": 10
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": 6
      },
      "pv": {
        "el": 20,
        "cr": 18,
        "av": 15,
        "gr": 12,
        "pr": 10
      },
      "depth": 18,
      "notes": "Razee / レジー（上甲板切除改造艦）"
    },
    {
      "guns": 40,
      "class": "F",
      "classNum": 3,
      "hull": 15,
      "rigging": {
        "l": 6,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 8,
        "r": 8
      },
      "carronades": {
        "l": 6,
        "r": 6
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 5
      },
      "pv": {
        "el": 19,
        "cr": 17,
        "av": 15,
        "gr": 14,
        "pr": 12
      },
      "depth": 17,
      "notes": ""
    },
    {
      "guns": 38,
      "class": "F",
      "classNum": 3,
      "hull": 14,
      "rigging": {
        "l": 6,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 6,
        "r": 6
      },
      "carronades": {
        "l": 6,
        "r": 6
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 5
      },
      "pv": {
        "el": 17,
        "cr": 15,
        "av": 13,
        "gr": 12,
        "pr": 11
      },
      "depth": 17,
      "notes": ""
    },
    {
      "guns": 36,
      "class": "F",
      "classNum": 3,
      "hull": 12,
      "rigging": {
        "l": 4,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 6,
        "r": 6
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 5
      },
      "pv": {
        "el": 16,
        "cr": 14,
        "av": 12,
        "gr": 11,
        "pr": 10
      },
      "depth": 16,
      "notes": ""
    },
    {
      "guns": 36,
      "class": "F",
      "classNum": 3,
      "hull": 11,
      "rigging": {
        "l": 4,
        "c": 4,
        "r": 2
      },
      "crew": {
        "l": 4,
        "r": 4
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 5
      },
      "pv": {
        "el": 13,
        "cr": 11,
        "av": 10,
        "gr": 9,
        "pr": 8
      },
      "depth": 15,
      "notes": ""
    },
    {
      "guns": 32,
      "class": "F",
      "classNum": 3,
      "hull": 9,
      "rigging": {
        "l": 4,
        "c": 4,
        "r": 2
      },
      "crew": {
        "l": 6,
        "r": 6
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 5
      },
      "pv": {
        "el": 14,
        "cr": 12,
        "av": 11,
        "gr": 10,
        "pr": 9
      },
      "depth": 15,
      "notes": ""
    },
    {
      "guns": 32,
      "class": "F",
      "classNum": 3,
      "hull": 8,
      "rigging": {
        "l": 4,
        "c": 2,
        "r": 2
      },
      "crew": {
        "l": 4,
        "r": 4
      },
      "carronades": {
        "l": 2,
        "r": 2
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 5
      },
      "pv": {
        "el": 12,
        "cr": 10,
        "av": 9,
        "gr": 8,
        "pr": 7
      },
      "depth": 14,
      "notes": ""
    },
    {
      "guns": 28,
      "class": "B",
      "classNum": 5,
      "hull": 8,
      "rigging": {
        "l": 4,
        "c": 2,
        "r": 2
      },
      "crew": {
        "l": 4,
        "r": 4
      },
      "carronades": {
        "l": null,
        "r": null
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 4
      },
      "pv": {
        "el": 11,
        "cr": 9,
        "av": 8,
        "gr": 7,
        "pr": 6
      },
      "depth": 13,
      "notes": ""
    },
    {
      "guns": 24,
      "class": "S",
      "classNum": 5,
      "hull": 6,
      "rigging": {
        "l": 4,
        "c": 2,
        "r": 2
      },
      "crew": {
        "l": null,
        "r": null
      },
      "carronades": {
        "l": 10,
        "r": 10
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 4
      },
      "pv": {
        "el": 12,
        "cr": 11,
        "av": 10,
        "gr": 9,
        "pr": 8
      },
      "depth": 12,
      "notes": ""
    },
    {
      "guns": 22,
      "class": "F",
      "classNum": 3,
      "hull": 6,
      "rigging": {
        "l": 2,
        "c": 2,
        "r": 2
      },
      "crew": {
        "l": null,
        "r": null
      },
      "carronades": {
        "l": 8,
        "r": 8
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 4
      },
      "pv": {
        "el": 11,
        "cr": 9,
        "av": 8,
        "gr": 7,
        "pr": 6
      },
      "depth": 12,
      "notes": ""
    },
    {
      "guns": 20,
      "class": "S",
      "classNum": 5,
      "hull": 6,
      "rigging": {
        "l": 2,
        "c": 2,
        "r": 2
      },
      "crew": {
        "l": null,
        "r": null
      },
      "carronades": {
        "l": 8,
        "r": 8
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 4
      },
      "pv": {
        "el": 12,
        "cr": 10,
        "av": 9,
        "gr": 8,
        "pr": 7
      },
      "depth": 12,
      "notes": ""
    },
    {
      "guns": 19,
      "class": "B",
      "classNum": 5,
      "hull": 6,
      "rigging": {
        "l": 2,
        "c": 2,
        "r": 2
      },
      "crew": {
        "l": 2,
        "r": 2
      },
      "carronades": {
        "l": null,
        "r": null
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 4
      },
      "pv": {
        "el": 9,
        "cr": 7,
        "av": 6,
        "gr": 5,
        "pr": 4
      },
      "depth": 12,
      "notes": ""
    },
    {
      "guns": 18,
      "class": "S",
      "classNum": 5,
      "hull": 8,
      "rigging": {
        "l": 4,
        "c": 4,
        "r": 4
      },
      "crew": {
        "l": 6,
        "r": 6
      },
      "carronades": {
        "l": null,
        "r": null
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 4
      },
      "pv": {
        "el": 11,
        "cr": 9,
        "av": 8,
        "gr": 7,
        "pr": 6
      },
      "depth": 11,
      "notes": ""
    },
    {
      "guns": 16,
      "class": "S",
      "classNum": 5,
      "hull": 5,
      "rigging": {
        "l": 2,
        "c": 2,
        "r": 2
      },
      "crew": {
        "l": null,
        "r": null
      },
      "carronades": {
        "l": 4,
        "r": 4
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 4
      },
      "pv": {
        "el": 9,
        "cr": 7,
        "av": 6,
        "gr": 5,
        "pr": 4
      },
      "depth": 11,
      "notes": ""
    }
  ],
  "FR": [
    {
      "guns": 120,
      "class": "SOL",
      "classNum": 27,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 28,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 9
      },
      "gunHitTable": {
        "s1": 9,
        "s2": 9,
        "s3": null,
        "s4": 43
      },
      "pv": {
        "el": 40,
        "cr": 33,
        "av": 30,
        "gr": 27,
        "pr": 24
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 110,
      "class": "SOL",
      "classNum": 27,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 26,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 9
      },
      "gunHitTable": {
        "s1": 9,
        "s2": 9,
        "s3": null,
        "s4": 39
      },
      "pv": {
        "el": 36,
        "cr": 31,
        "av": 27,
        "gr": 25,
        "pr": 24
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 80,
      "class": "SOL",
      "classNum": 24,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 22,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 36
      },
      "pv": {
        "el": 33,
        "cr": 27,
        "av": 25,
        "gr": 23,
        "pr": 23
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 21,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 20,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 32
      },
      "pv": {
        "el": 29,
        "cr": 24,
        "av": 22,
        "gr": 20,
        "pr": 21
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 60,
      "class": "SOL",
      "classNum": 18,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 21
      },
      "pv": {
        "el": 19,
        "cr": 16,
        "av": 14,
        "gr": 12,
        "pr": 20
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 17,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 5,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 6
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": 22
      },
      "pv": {
        "el": 20,
        "cr": 17,
        "av": 15,
        "gr": 13,
        "pr": 19
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 40,
      "class": "F",
      "classNum": 15,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 19
      },
      "pv": {
        "el": 17,
        "cr": 15,
        "av": 12,
        "gr": 11,
        "pr": 18
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 38,
      "class": "F",
      "classNum": 14,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 19
      },
      "pv": {
        "el": 17,
        "cr": 14,
        "av": 12,
        "gr": 10,
        "pr": 18
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 36,
      "class": "F",
      "classNum": 12,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 17
      },
      "pv": {
        "el": 15,
        "cr": 13,
        "av": 12,
        "gr": 10,
        "pr": 17
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 32,
      "class": "F",
      "classNum": 11,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 13
      },
      "pv": {
        "el": 11,
        "cr": 10,
        "av": 9,
        "gr": 8,
        "pr": 15
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 28,
      "class": "F",
      "classNum": 9,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 12
      },
      "pv": {
        "el": 10,
        "cr": 9,
        "av": 8,
        "gr": 7,
        "pr": 14
      },
      "depth": null,
      "notes": ""
    }
  ],
  "ES": [
    {
      "guns": 130,
      "class": "SOL",
      "classNum": 30,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 26,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 10
      },
      "gunHitTable": {
        "s1": 10,
        "s2": 10,
        "s3": null,
        "s4": 42
      },
      "pv": {
        "el": 38,
        "cr": 32,
        "av": 30,
        "gr": 27,
        "pr": 25
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 112,
      "class": "SOL",
      "classNum": 27,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 24,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 9
      },
      "gunHitTable": {
        "s1": 9,
        "s2": 9,
        "s3": null,
        "s4": 38
      },
      "pv": {
        "el": 35,
        "cr": 29,
        "av": 27,
        "gr": 25,
        "pr": 23
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 100,
      "class": "SOL",
      "classNum": 24,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 20,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 8
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": null,
        "s4": 34
      },
      "pv": {
        "el": 31,
        "cr": 24,
        "av": 23,
        "gr": 21,
        "pr": 22
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 84,
      "class": "SOL",
      "classNum": 23,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 20,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 35
      },
      "pv": {
        "el": 32,
        "cr": 25,
        "av": 24,
        "gr": 22,
        "pr": 22
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 80,
      "class": "SOL",
      "classNum": 23,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 20,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 33
      },
      "pv": {
        "el": 30,
        "cr": 22,
        "av": 20,
        "gr": 18,
        "pr": 22
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 21,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 29
      },
      "pv": {
        "el": 26,
        "cr": 22,
        "av": 20,
        "gr": 18,
        "pr": 22
      },
      "depth": null,
      "notes": "Large Class / 大型級"
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 20,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 28
      },
      "pv": {
        "el": 25,
        "cr": 20,
        "av": 18,
        "gr": 16,
        "pr": 21
      },
      "depth": null,
      "notes": "Small Class / 小型級"
    },
    {
      "guns": 64,
      "class": "SOL",
      "classNum": 17,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 23
      },
      "pv": {
        "el": 21,
        "cr": 17,
        "av": 15,
        "gr": 13,
        "pr": 20
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 40,
      "class": "F",
      "classNum": 14,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 19
      },
      "pv": {
        "el": 17,
        "cr": 15,
        "av": 14,
        "gr": 12,
        "pr": 17
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 34,
      "class": "F",
      "classNum": 9,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 14
      },
      "pv": {
        "el": 12,
        "cr": 11,
        "av": 10,
        "gr": 9,
        "pr": 14
      },
      "depth": null,
      "notes": ""
    }
  ],
  "US": [
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 27,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 22,
        "r": 8
      },
      "carronades": {
        "l": 8,
        "r": 8
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": null,
        "s4": 39
      },
      "pv": {
        "el": 37,
        "cr": 29,
        "av": 27,
        "gr": 24,
        "pr": null
      },
      "depth": null,
      "notes": "First Class / 1等級"
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 24,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 18,
        "r": 6
      },
      "carronades": {
        "l": 6,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 34
      },
      "pv": {
        "el": 32,
        "cr": 25,
        "av": 23,
        "gr": 20,
        "pr": 23
      },
      "depth": null,
      "notes": "Second Class / 2等級"
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 18,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": 8
      },
      "carronades": {
        "l": 8,
        "r": 6
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": 24
      },
      "pv": {
        "el": 21,
        "cr": 17,
        "av": 15,
        "gr": 13,
        "pr": 19
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 38,
      "class": "F",
      "classNum": 14,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": 6
      },
      "carronades": {
        "l": 6,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 18
      },
      "pv": {
        "el": 16,
        "cr": 14,
        "av": 13,
        "gr": 11,
        "pr": 17
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 36,
      "class": "F",
      "classNum": 12,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 17
      },
      "pv": {
        "el": 15,
        "cr": 13,
        "av": 12,
        "gr": 10,
        "pr": 16
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 32,
      "class": "F",
      "classNum": 11,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": null,
        "r": 12
      },
      "carronades": {
        "l": 12,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 15
      },
      "pv": {
        "el": 13,
        "cr": 12,
        "av": 11,
        "gr": 9,
        "pr": 15
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 24,
      "class": "B",
      "classNum": 8,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 4
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 13
      },
      "pv": {
        "el": 11,
        "cr": 9,
        "av": 8,
        "gr": 7,
        "pr": 13
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 20,
      "class": "S",
      "classNum": 6,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": null,
        "r": 6
      },
      "carronades": {
        "l": 6,
        "r": 4
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 12
      },
      "pv": {
        "el": 10,
        "cr": 8,
        "av": 7,
        "gr": 6,
        "pr": 12
      },
      "depth": null,
      "notes": ""
    }
  ],
  "NL": [
    {
      "guns": 76,
      "class": "SOL",
      "classNum": 21,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 33
      },
      "pv": {
        "el": 28,
        "cr": 24,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 17,
      "notes": ""
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 21,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 32
      },
      "pv": {
        "el": 27,
        "cr": 23,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 17,
      "notes": ""
    },
    {
      "guns": 68,
      "class": "SOL",
      "classNum": 18,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 14,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 25
      },
      "pv": {
        "el": 22,
        "cr": 20,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 16,
      "notes": ""
    },
    {
      "guns": 64,
      "class": "SOL",
      "classNum": 17,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 22
      },
      "pv": {
        "el": 20,
        "cr": 18,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 16,
      "notes": ""
    },
    {
      "guns": 56,
      "class": "SOL",
      "classNum": 15,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 10,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 20
      },
      "pv": {
        "el": 17,
        "cr": 14,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 14,
      "notes": ""
    },
    {
      "guns": 50,
      "class": "SOL",
      "classNum": 12,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 19
      },
      "pv": {
        "el": 16,
        "cr": 13,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 21,
      "notes": ""
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 12,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": null,
        "s4": 15
      },
      "pv": {
        "el": 13,
        "cr": 10,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 15,
      "notes": ""
    },
    {
      "guns": 32,
      "class": "F",
      "classNum": 11,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": null,
        "s4": 13
      },
      "pv": {
        "el": 11,
        "cr": 8,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 13,
      "notes": ""
    },
    {
      "guns": 24,
      "class": "C",
      "classNum": 8,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 4
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": null,
        "s4": 12
      },
      "pv": {
        "el": 10,
        "cr": 7,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 12,
      "notes": ""
    },
    {
      "guns": 18,
      "class": "B",
      "classNum": 5,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": null,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 4
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": null,
        "s4": 9
      },
      "pv": {
        "el": 7,
        "cr": 5,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 11,
      "notes": ""
    }
  ],
  "DK": [
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 21,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 18,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 31
      },
      "pv": {
        "el": 26,
        "cr": 22,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 17,
      "notes": ""
    },
    {
      "guns": 70,
      "class": "SOL",
      "classNum": 21,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 18,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 29
      },
      "pv": {
        "el": 24,
        "cr": 20,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 17,
      "notes": ""
    },
    {
      "guns": 64,
      "class": "SOL",
      "classNum": 17,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 25
      },
      "pv": {
        "el": 20,
        "cr": 17,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 16,
      "notes": ""
    },
    {
      "guns": 60,
      "class": "SOL",
      "classNum": 17,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 23
      },
      "pv": {
        "el": 18,
        "cr": 16,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 15,
      "notes": ""
    },
    {
      "guns": 56,
      "class": "SOL",
      "classNum": 17,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 10,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 22
      },
      "pv": {
        "el": 18,
        "cr": 15,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 15,
      "notes": ""
    },
    {
      "guns": 48,
      "class": "SOL",
      "classNum": 14,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 22
      },
      "pv": {
        "el": 18,
        "cr": 14,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 14,
      "notes": ""
    },
    {
      "guns": 40,
      "class": "F",
      "classNum": 14,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 22
      },
      "pv": {
        "el": 18,
        "cr": 14,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 15,
      "notes": ""
    },
    {
      "guns": 26,
      "class": "F",
      "classNum": 11,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 16
      },
      "pv": {
        "el": 13,
        "cr": 11,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 12,
      "notes": ""
    },
    {
      "guns": 26,
      "class": "F",
      "classNum": 9,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 14
      },
      "pv": {
        "el": 11,
        "cr": 9,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 12,
      "notes": ""
    },
    {
      "guns": 20,
      "class": "B",
      "classNum": 9,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 3
      },
      "gunHitTable": {
        "s1": 3,
        "s2": 3,
        "s3": 3,
        "s4": 13
      },
      "pv": {
        "el": 10,
        "cr": 8,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 11,
      "notes": ""
    },
    {
      "guns": 18,
      "class": "B",
      "classNum": 8,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 2,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 3
      },
      "gunHitTable": {
        "s1": 3,
        "s2": 3,
        "s3": 3,
        "s4": 11
      },
      "pv": {
        "el": 8,
        "cr": 6,
        "av": null,
        "gr": null,
        "pr": null
      },
      "depth": 11,
      "notes": ""
    }
  ],
  "RU": [
    {
      "guns": 110,
      "class": "SOL",
      "classNum": 26,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 24,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 9
      },
      "gunHitTable": {
        "s1": 9,
        "s2": 9,
        "s3": null,
        "s4": 36
      },
      "pv": {
        "el": 31,
        "cr": 27,
        "av": null,
        "gr": null,
        "pr": 22
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 100,
      "class": "SOL",
      "classNum": 23,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 20,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 8
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": null,
        "s4": 35
      },
      "pv": {
        "el": 30,
        "cr": 26,
        "av": null,
        "gr": null,
        "pr": 21
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 84,
      "class": "SOL",
      "classNum": 23,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 18,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 32
      },
      "pv": {
        "el": 27,
        "cr": 24,
        "av": null,
        "gr": null,
        "pr": 19
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 21,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 30
      },
      "pv": {
        "el": 25,
        "cr": 22,
        "av": null,
        "gr": null,
        "pr": 17
      },
      "depth": null,
      "notes": "Large Class / 大型級"
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 18,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 28
      },
      "pv": {
        "el": 23,
        "cr": 20,
        "av": null,
        "gr": null,
        "pr": 17
      },
      "depth": null,
      "notes": "Common Class / 通常級"
    },
    {
      "guns": 66,
      "class": "SOL",
      "classNum": 15,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 23
      },
      "pv": {
        "el": 19,
        "cr": 16,
        "av": null,
        "gr": null,
        "pr": 16
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 50,
      "class": "SOL",
      "classNum": 18,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 6
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": 24
      },
      "pv": {
        "el": 20,
        "cr": 17,
        "av": null,
        "gr": null,
        "pr": 15
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 15,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 19
      },
      "pv": {
        "el": 16,
        "cr": 14,
        "av": null,
        "gr": null,
        "pr": 16
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 38,
      "class": "F",
      "classNum": 9,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 16
      },
      "pv": {
        "el": 13,
        "cr": 11,
        "av": null,
        "gr": null,
        "pr": 14
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 32,
      "class": "F",
      "classNum": 9,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 15
      },
      "pv": {
        "el": 12,
        "cr": 10,
        "av": null,
        "gr": null,
        "pr": 12
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 28,
      "class": "C",
      "classNum": 8,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 4
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 14
      },
      "pv": {
        "el": 11,
        "cr": 9,
        "av": null,
        "gr": null,
        "pr": 12
      },
      "depth": null,
      "notes": ""
    }
  ],
  "TR": [
    {
      "guns": 120,
      "class": "SOL",
      "classNum": 27,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 26,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 9
      },
      "gunHitTable": {
        "s1": 9,
        "s2": 9,
        "s3": null,
        "s4": 41
      },
      "pv": {
        "el": 36,
        "cr": 32,
        "av": null,
        "gr": null,
        "pr": 24
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 100,
      "class": "SOL",
      "classNum": 24,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 22,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 8
      },
      "gunHitTable": {
        "s1": 8,
        "s2": 8,
        "s3": null,
        "s4": 35
      },
      "pv": {
        "el": 30,
        "cr": 26,
        "av": null,
        "gr": null,
        "pr": 24
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 84,
      "class": "SOL",
      "classNum": 23,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 18,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 32
      },
      "pv": {
        "el": 28,
        "cr": 24,
        "av": null,
        "gr": null,
        "pr": 23
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 21,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 30
      },
      "pv": {
        "el": 26,
        "cr": 22,
        "av": null,
        "gr": null,
        "pr": 21
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 64,
      "class": "SOL",
      "classNum": 15,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 24
      },
      "pv": {
        "el": 20,
        "cr": 16,
        "av": null,
        "gr": null,
        "pr": 21
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 60,
      "class": "SOL",
      "classNum": 15,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 23
      },
      "pv": {
        "el": 19,
        "cr": 15,
        "av": null,
        "gr": null,
        "pr": 21
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 56,
      "class": "SOL",
      "classNum": 14,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 10,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 6
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": null,
        "s4": 20
      },
      "pv": {
        "el": 17,
        "cr": 14,
        "av": null,
        "gr": null,
        "pr": 21
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 50,
      "class": "SOL",
      "classNum": 12,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 10,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 6
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": null,
        "s4": 18
      },
      "pv": {
        "el": 15,
        "cr": 12,
        "av": null,
        "gr": null,
        "pr": 21
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 50,
      "class": "F",
      "classNum": 18,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 6
      },
      "gunHitTable": {
        "s1": 6,
        "s2": 6,
        "s3": 6,
        "s4": 23
      },
      "pv": {
        "el": 20,
        "cr": 17,
        "av": null,
        "gr": null,
        "pr": 20
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 14,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 19
      },
      "pv": {
        "el": 16,
        "cr": 13,
        "av": null,
        "gr": null,
        "pr": 19
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 40,
      "class": "F",
      "classNum": 12,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 18
      },
      "pv": {
        "el": 15,
        "cr": 12,
        "av": null,
        "gr": null,
        "pr": 18
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 34,
      "class": "F",
      "classNum": 11,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 17
      },
      "pv": {
        "el": 14,
        "cr": 11,
        "av": null,
        "gr": null,
        "pr": 14
      },
      "depth": null,
      "notes": ""
    }
  ],
  "SE": [
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 18,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 29
      },
      "pv": {
        "el": 25,
        "cr": 21,
        "av": null,
        "gr": null,
        "pr": 17
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 70,
      "class": "SOL",
      "classNum": 18,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 28
      },
      "pv": {
        "el": 24,
        "cr": 20,
        "av": null,
        "gr": null,
        "pr": 17
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 64,
      "class": "SOL",
      "classNum": 15,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 22
      },
      "pv": {
        "el": 18,
        "cr": 15,
        "av": null,
        "gr": null,
        "pr": 16
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 60,
      "class": "SOL",
      "classNum": 14,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 10,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 20
      },
      "pv": {
        "el": 16,
        "cr": 13,
        "av": null,
        "gr": null,
        "pr": 15
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 12,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 19
      },
      "pv": {
        "el": 16,
        "cr": 13,
        "av": null,
        "gr": null,
        "pr": 16
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 40,
      "class": "F",
      "classNum": 11,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 8,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 17
      },
      "pv": {
        "el": 14,
        "cr": 11,
        "av": null,
        "gr": null,
        "pr": 15
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 32,
      "class": "F",
      "classNum": 9,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 4
      },
      "gunHitTable": {
        "s1": 4,
        "s2": 4,
        "s3": 4,
        "s4": 16
      },
      "pv": {
        "el": 13,
        "cr": 10,
        "av": null,
        "gr": null,
        "pr": 12
      },
      "depth": null,
      "notes": ""
    }
  ],
  "PT": [
    {
      "guns": 84,
      "class": "SOL",
      "classNum": 24,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 20,
        "r": 4
      },
      "carronades": {
        "l": 4,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 37
      },
      "pv": {
        "el": 35,
        "cr": 28,
        "av": 25,
        "gr": 22,
        "pr": 22
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 74,
      "class": "SOL",
      "classNum": 20,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 16,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 30
      },
      "pv": {
        "el": 28,
        "cr": 22,
        "av": 20,
        "gr": 18,
        "pr": 19
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 64,
      "class": "SOL",
      "classNum": 15,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 12,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 7
      },
      "gunHitTable": {
        "s1": 7,
        "s2": 7,
        "s3": null,
        "s4": 25
      },
      "pv": {
        "el": 24,
        "cr": 19,
        "av": 17,
        "gr": 15,
        "pr": 18
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 44,
      "class": "F",
      "classNum": 12,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 18
      },
      "pv": {
        "el": 17,
        "cr": 13,
        "av": 12,
        "gr": 11,
        "pr": 16
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 36,
      "class": "F",
      "classNum": 11,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 6,
        "r": null
      },
      "carronades": {
        "l": null,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 16
      },
      "pv": {
        "el": 15,
        "cr": 12,
        "av": 11,
        "gr": 10,
        "pr": 15
      },
      "depth": null,
      "notes": ""
    },
    {
      "guns": 32,
      "class": "F",
      "classNum": 9,
      "hull": null,
      "rigging": null,
      "crew": {
        "l": 4,
        "r": 2
      },
      "carronades": {
        "l": 2,
        "r": 5
      },
      "gunHitTable": {
        "s1": 5,
        "s2": 5,
        "s3": 5,
        "s4": 15
      },
      "pv": {
        "el": 14,
        "cr": 11,
        "av": 10,
        "gr": 9,
        "pr": 14
      },
      "depth": null,
      "notes": ""
    }
  ]
};

const NATION_NAMES_JP = {
  GB: "イギリス", FR: "フランス", ES: "スペイン", US: "アメリカ",
  NL: "オランダ", DK: "デンマーク", RU: "ロシア", TR: "トルコ",
  SE: "スウェーデン", PT: "ポルトガル",
};

const SHIP_CLASS_NAMES_JP = { SOL:"戦列艦", F:"フリゲート", C:"コルベット", B:"ブリッグ", S:"スループ" };
