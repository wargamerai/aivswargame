# WS&IM v1.2b 帆船戦ゲーム 実装メモ（JavaScript/HTML 向け）

本書は `WSM_mechanics_summary.md` と `WSM_tables.md` を補完する **実装メモ** である。
判定フロー・状態遷移・数式・疑似コードを中心に、JS/HTML での実装に直接落とし込めるレベルまで具体化する。
逐語訳ではない。既存の IJN ベース実装（`phase_gun.html` / `phase_move.html` 他）を拡張する想定で、差分を明示する。

---

## 0. グローバル型とユーティリティ（共通）

帆船戦では全艦が 2 ヘクス占有・60 度方向・風向状態を持つため、まず共通の型と座標系を決める。

```javascript
// 共通ヘックス座標（既存 IJN の col/row を継承）
// 方向: 1..6（ヘクス辺を時計回り）。1=北東/上右、以下時計回りで 6=北西相当
// 既存 IJN の dir 定義に合わせて座標オフセット配列を流用する

// 1 ヘクス隣接オフセット（odd-q / even-q の別は既存プロジェクトに従う）
const DIR_OFFSETS = { /* 既存 IJN 実装と同じ定義を使用 */ };

// 風向 1..6（同じ方向系）。矢印は「風が吹いてくる方向」か「吹いていく方向」か一貫させる
// 本実装では "wind.dir = 風が向かう先のヘクス辺番号" で統一
```

---

## 1. 移動 (Movement)

### 概要
毎ターン秘匿プロット → 同時解決。風向と艦の針路の相対角度 (A/B/C/D 4 態勢) で移動力が決まる。
Battle Sail (BS) と Full Sail (FS) の 2 速度系、60 度単位の転舵、ドリフト、バッキングを扱う。

### 状態変数

```javascript
ship = {
  // 位置・向き
  bow:  { col, row },   // 艦首ヘックス
  stern:{ col, row },   // 艦尾ヘックス（bow から dir の反対向きへ 1）
  dir:  1..6,           // bow の向き（ヘクス辺番号）

  // 推進系
  battleSailSpeed: 3 | 4,          // 艦の固有値
  fullSailSpeed:   5 | 6 | 7 | null, // null=FS 不可艦（小型等）
  sailMode: "furled" | "battle" | "full", // 現在の帆状態
  pendingSailMode: null | "battle" | "full", // 帆変更プロット中の目標
  mir: false,                      // Men in the Rigging（帆変更中）

  // 旋回
  turningAbility: 1..N,            // 初期値
  turnsRemainingThisPhase: 0,      // 毎ターンリセット
  prevTurnEndedInTurn: false,      // L/R で終了→次ターン先頭転舵不可
  lastTurnDidNotMoveBowHex: false, // 2 連続で bow 不動なら drift 強制

  // ドリフト/錨/拘束
  driftPending: false,
  consecutiveStillTurns: 0,
  anchor: null | "A" | "AB" | "AS",
  anchorCableSquares: 2,           // クリティカル 5H で減少
  isFouled: false, fouledWith: [shipId,...],
  isGrappled: false, grappledWith: [shipId,...],
  isAground: false, groundRoll: 0, // 1..6 refloat 目標

  // プロット
  plotMoves: [ "L", "R", "1", "B", "D", "0", ... ], // 命令列（記入順）
  plotNotes: { repair: null|"RH"|"RG"|"RR", anchor: null, sailChange: null },

  // 損害（既存 IJN と別配列で管理）
  hull: [...], crew: [[...],[...],[...]], 
  rigging: [[...],[...],[...],[...]],
  gunsStarboardBow:[], gunsStarboardStern:[], 
  gunsPortBow:[],     gunsPortStern:[],
  carronadesL:[], carronadesR:[],
  reloads: 30,
};
```

### 移動力算出の判定フロー

1. 艦の `dir` と `wind.dir` の相対角度差を算出（ヘクス辺差 0..5）。
2. 相対角度差 → 風向態勢 `A/B/C/D` に写像:
   - 風が艦の真後ろから来る = **A** (追い風, running)
   - 後側 60 度 = **B** (broad reach)
   - 前側 60 度 = **C** (close-hauled)
   - 真正面 = **D** (in irons, 停止)
3. 態勢 + `sailMode` から最大移動力 `MA[attitude]` を取得:
   - BS: (A,B,C,D) = 艦のログから (例 SOL BS=3 なら 3/2/1/0)
   - FS: (A,B,C,D) = (例 FS=6 なら 6/5/2/0)
4. ターン開始時態勢の `MA` が **そのターンの総移動力**（モーメンタム）。
5. 各態勢にはその態勢中に進める **最大ヘクス数** の上限が別途存在 (= その態勢の MA)。
6. 態勢変更後は新態勢の上限まで（ただし「転舵」自体は態勢内ヘクス数にカウントしない）。

### 判定フロー（プロット実行）

```
for 各プロット記号:
  if "L"/"R":
    if turnsRemainingThisPhase == 0: 違反 → 以降切り捨て
    attitude ← 新 dir から再計算
    if attitude == "D": 艦停止。以降の記号は無視（7.1.16）
    if movementPointsLeft == 0 && 態勢以外の条件: 7.1.15 により無料 60 度転舵を 1 回だけ許可
    else movementPointsLeft -= 1; turnsRemainingThisPhase -= 1
    prevTurnEndedInTurn ← true（この記号で終わった場合）
  elif "N" (1..N の数値):
    for i in 1..N:
      if attitudeHexUsed[attitude] >= MA[attitude]: 違反
      bow を dir 方向に 1 ヘクス進める、stern を旧 bow へ
      attitudeHexUsed[attitude] += 1
      movementPointsLeft -= 1
      prevTurnEndedInTurn ← false
  elif "B" (backing):
    movementPointsLeft -= 1  // 場に留まる
  elif "D" (drift):
    bow/stern を wind.dir と反対（風下）へ 1 ヘクス
  elif "0":
    何もしない
```

### ドリフト判定

- 連続 2 ターン `bow` ヘクスが不変 → 2 ターン目に **風下へ 1 ヘクス**強制
- SOL (クラス 1-2) は 2 ターンに 1 ヘクス、それ以外は 1 ターンに 1 ヘクス
- 全索具喪失 (dismasted) 艦の旋回: `turningAbility` に応じた待機ターン数
  - TA=1 → 3 連続 drift 後に 60 度転舵 1 回
  - TA=2 → 2 連続後
  - TA=3 → 1 連続後
- fouled/grappled 艦は旋回不可・drift のみ

### 衝突 (Collision) と Fouling

1. 同一ヘクスに複数艦が同時到達 → 1 ヘクスずつ遡って衝突検出
2. 残留優先順位: (a) 先着、(b) bow vs stern 時 bow 優先、(c) 同時なら 1d6 高い側
3. Fouling 判定: `2d6 + modifiers >= 10` で絡み発生
4. 修正子:
   ```
   +1 per ship at FS
   -4 if either ship motionless/drifting
   +1 if target plotted to move >= 3 MP
   -1 if both friendly
   crew quality: elite -2, crack -1, green +1, poor +2 (per ship)
   unmodified 12 は常に foul
   ```

### バッキングと錨泊

- `B` = 1 MP で場に留まる（衝突回避用）
- `A` = 通常錨、`AB` = 艦首錨、`AS` = 艦尾錨
- 錨はプロット **次ターン**に効力発生
- スプリング錨 (AB/AS) は錨軸で ±60/120 度旋回可、だが当該ターン発砲・装填不可
- 揚錨は circled-A を 2 ターン連続記入、その間は射撃・修理・白兵不可
- 錨は 2 つあり (クリティカル 5H で 1 個損失可能)。1 個のみでも錨泊可だが HDT ボーナス消失
- cut anchors (`a`) → 即解除、ただし以後錨泊不可

### 実装上の注意

- 既存 IJN の「1 ヘクス占有・1 ターン全員一斉移動」と異なり、**2 ヘクス占有 + 同時解決 + 衝突遡行**。衝突解決は最も手間のかかる部分。
- プロット文字列は正規表現でトークナイズ (例 `/([LR]|\d+|B|D|0)/g`)。各トークンごとに状態更新。
- 「態勢ごとのヘクス数上限」は 1 ターン内でも態勢遷移のたびに別々に管理。A 態勢で 4 動ける艦でも、C に入ると C の上限(1)しか使えない。
- `turnInPlace` は MA=0 のときのみ無料 (7.1.15)。この判定を間違えると全体がずれる。

### 疑似コード

```javascript
function computeAttitude(shipDir, windDir) {
  // ヘクス辺差（0..5）。0 = 風と同方向（艦が風下へ向かう = 追い風）
  const diff = (shipDir - windDir + 6) % 6;
  // WS&IM: 艦の針路と風の相対関係
  // diff==0: A (running)  diff==1,5: B  diff==2,4: C  diff==3: D (in irons)
  if (diff === 0) return "A";
  if (diff === 1 || diff === 5) return "B";
  if (diff === 2 || diff === 4) return "C";
  return "D";
}

function maxMoveForAttitude(ship, attitude) {
  const table = ship.sailMode === "full" ? ship.fsMoveTable : ship.bsMoveTable;
  // table: { A:n, B:n, C:n, D:0 }
  const rigLost = countLostRiggingSections(ship);
  return Math.max(0, table[attitude] - rigLost);
}

function executeMovePlot(ship, plot, wind) {
  let mp = maxMoveForAttitude(ship, computeAttitude(ship.dir, wind.dir));
  let turnsLeft = ship.turningAbility;
  const attHex = { A:0, B:0, C:0, D:0 };
  
  for (const tok of tokenize(plot)) {
    const att = computeAttitude(ship.dir, wind.dir);
    if (att === "D" && !["0"].includes(tok)) break; // in irons
    
    if (tok === "L" || tok === "R") {
      if (turnsLeft <= 0) break;
      if (mp === 0 && !ship.anchor && !ship.isFouled) {
        ship.dir = rotateDir(ship.dir, tok === "L" ? -1 : +1);
        turnsLeft -= 1;
        continue; // 無料 in-place 転舵
      }
      if (mp <= 0) break;
      ship.dir = rotateDir(ship.dir, tok === "L" ? -1 : +1);
      mp -= 1;
      turnsLeft -= 1;
    } else if (/^\d+$/.test(tok)) {
      let n = parseInt(tok);
      while (n-- > 0 && mp > 0) {
        const a = computeAttitude(ship.dir, wind.dir);
        if (a === "D") return;
        if (attHex[a] >= maxMoveForAttitude(ship, a)) return;
        stepForward(ship);
        attHex[a]++;
        mp--;
      }
    } else if (tok === "B") {
      if (mp > 0) mp--;
    } else if (tok === "D") {
      driftOneHex(ship, wind);
    }
  }
}
```

---

## 2. 風・帆 (Wind & Sails)

### 概要
マップ隅の「風向ヘックス」に矢印マーカ。風は 6 方向 × 8 速度段階。Advanced では毎ターン変化判定。
帆状態は furled / battle / full の 3 種。Full Sail は速度 +、被弾時の rigging 追加ダメージ・HDT -1 のトレードオフ。

### 状態変数

```javascript
wind = {
  dir: 1..6,          // 矢印方向
  velocity: 0..7,     // 0=becalmed 〜 7=hurricane
  changeNumber: 7..12 // シナリオ初期値。2d6 がこの値で変化発生
};
```

### 判定フロー（Wind Phase）

1. `2d6 = n` を振る。
2. `n == wind.changeNumber` → 変化発生
3. 変化発生時:
   - 1d6 振って **Wind Direction Changes Table** 参照
     - 1: 120 度 CCW, 2: 60 度 CCW, 3: 初期方向に戻る, 4: 変化なし, 5: 60 度 CW, 6: 120 度 CW
   - 1d6 振って **Wind Velocity Changes Table** 参照
     - 1-2: velocity -1, 3-4: なし, 5-6: velocity +1
   - 方向と速度が両方変わった場合のみ、任意で 4 回目 1d6 → 新 changeNumber を 7/9/11 のいずれかに更新
4. Velocity の境界効果:
   - 5 (gale) → 6 (storm) 遷移時: 全艦 FS 解除、FS 中艦は 1d6/2 切上げ の R ダメージ
   - 6 → 7 (hurricane): ゲーム即終了
   - 1 → 0 (becalmed): 旋回のみ可能、移動不可（態勢不問）
5. Velocity による射撃ペナルティ (HDT):
   - velocity 5 (gale): クラス 1/5/6 は HDT -1
   - velocity 6 (storm): クラス 1/4 は -2、クラス 2/3 は -1

### Full Sail の扱い

- BS ↔ FS の切替は **Movement Notation Phase** にプロット。実反映は **Full Sail Phase** (ターン末)。
- プロット時点で `pendingSailMode` をセット、Movement Execution Phase で `mir = true`（crew section 1 つを帆変更要員に割当）。
- FS 状態では:
  - 発砲時 HDT -1
  - Rigging 被弾時、Hit Table セルの `(...R)` 値を通常結果に加算
  - 第 1 Rigging セクション全損 → 即 BS 強制降格、修理完了まで FS 不可

### 風遮蔽 (Blocked Wind) — rule 37

- 風上隣接艦が自艦と風の間に位置 → 帆遮蔽で移動力低下
- 遮蔽艦 FS: 被遮蔽艦 -2 MP/ターン
- 遮蔽艦 BS かつ Rigging 半分以上残: 被遮蔽艦 -1 MP/ターン
- 艦サイズ差による補正:
  - 遮蔽艦が被遮蔽艦より 30+ 門少ない: 減速量 -1（遮蔽弱）
  - 30+ 門多い: 減速量 +1
  - 60+ 門差: ±2

### 実装上の注意

- 風向変化は **ターン先頭**。全艦の態勢・MA が変わる可能性があるので、Wind Phase 完了後に再計算キューを走らせる。
- `pendingSailMode` と `mir` の 2 段階管理が重要。MIR 中は crew section 1 つ消費相当で HDT 追加 -1、OBP 不可 (section を DBP として使える場合は sail change が無効化)。

### 疑似コード

```javascript
function windPhase(wind, ships) {
  const n = d6() + d6();
  if (n !== wind.changeNumber) return;
  
  const dirRoll = d6();
  const dirMap = { 1:-120, 2:-60, 3:"reset", 4:0, 5:+60, 6:+120 };
  applyWindDirChange(wind, dirMap[dirRoll]);
  
  const velRoll = d6();
  const velDelta = velRoll <= 2 ? -1 : velRoll >= 5 ? +1 : 0;
  const oldVel = wind.velocity;
  wind.velocity = Math.max(0, Math.min(7, oldVel + velDelta));
  
  // 境界効果
  if (oldVel === 5 && wind.velocity === 6) {
    for (const ship of ships) {
      if (ship.sailMode === "full") {
        ship.sailMode = "battle";
        const riggingDmg = Math.ceil(d6() / 2);
        applyRiggingDamage(ship, riggingDmg);
      }
    }
  }
  if (oldVel === 6 && wind.velocity === 7) endGame("hurricane");
  
  // 任意の 4 回目
  if (dirMap[dirRoll] !== 0 && velDelta !== 0) {
    const n4 = d6();
    wind.changeNumber = newWCNFromChart(n4);
  }
}
```

---

## 3. 砲撃 (Gunnery)

### 概要
左右舷 (port/starboard) それぞれ独立の broadside。Advanced では各舷を bow/stern 半舷に分割。
射界 5 フィールド、射程 10 ヘクス、弾種 4 種、装填 30 発、Rake・Initial Broadside ボーナスあり。

### 状態変数

```javascript
ship.broadside = {
  starboard: {
    bowGuns:   [{alive:true},...],
    sternGuns: [...],
    bowCarronades:   [...],
    sternCarronades: [...],
    loaded: "R" | "C" | "D" | "G" | null,  // 装填弾種
    initialFired: false,
    doubleshotLoadTurnsLeft: 0, // ダブル用 2 ターン装填
  },
  port: { ... },
};
```

### 射界判定 (Advanced, rule 24.1)

- 各舷は 5 フィールドに分割 (Field 1/2/3 = full broadside 可、Field 4 = stern 半舷のみ、Field 5 = bow 半舷のみ)
- 標的が跨がる場合:
  - 射撃判定: 最小番号フィールドに属すとみなす
  - 視線判定 (LOS): 両方のフィールドに属すとみなす
- 例外:
  - Field 2/4 跨ぎ: Field 4 に近接艦があれば stern 射撃不可、bow のみ可
  - Field 3/5 跨ぎ: Field 5 に近接艦があれば bow 射撃不可、stern のみ可
- 最近艦が友軍/陸/降伏艦/廃艦 → 当該フィールド射線遮断

### 射撃解決フロー

```
1. 舷選択 + 弾種確認（broadside.loaded）
2. 射界フィールド判定
3. 最近敵艦探索 (field 1/2/3 では全 full broadside、field 4/5 では半舷のみ)
4. 射線遮蔽チェック → block なら射撃不能
5. 射程 = min(dist_to_bow, dist_to_stern)
6. 弾種の最大射程チェック: Round=10, Chain=4, Double=3, Grape=2, Carronade=2
7. 砲数集計: 対応半舷の生存 guns + Carronade（射程 2 以下なら）
8. Rake 判定: 対象艦の bow or stern が指す方向に自艦 && 射程 ≤ 5
9. HDT 参照:
   - 行: range (1, 2, 3, 4, 5-6, 7-10)
   - 列: gun count (1-3, 4-6, 7-9, 10-12, 13-15, 16-18, 19-21, 22-24, 25+)
   - セル: "基本値 (Rake値)"
10. 修正子集計:
    + Crew Quality: Elite+2, Crack+1, Avg 0, Green-1, Poor-2 (砲数によって変動有)
    + Initial Broadside: +1 (舷ごと 1 回のみ)
    + Rake Stern: +1
    + Full Sail (firer): -1
    + Anchored (firer): +1
    + Crew Loss: 喪失 1 section につき -1
    + Captured: -2 (乗員喪失修正は無視)
    + MIR: -1 (crew section down 扱い)
    + Ammunition: Chain +2(HG 命中→miss), Double +2, Grape (表不使用), Round 0
    + Low Powder: -1 to -2 (砲数帯による)
    + Wind Velocity ペナルティ (18.2.2.4-5)
11. 最終 HT# = clamp(0..10); 負値 = 自動外れ
12. 標的宣言: Hull / Rigging (射程 6 以上は Rigging 強制)
13. Hit Table #n の該当セクションを 1d6 で引く
14. Grape は表不使用、最終 HT# = 殺傷 crew 数
15. FS 標的で Rigging 狙い → `(...R)` を結果に加算
16. 6 の目で `*` → 2d6 で Critical Hit Table
17. 全 firing 完了後、Combat Phase 末尾でダメージ適用
18. fired broadside に `/` 記入 → 次ターン以降要装填
```

### Hit Table セルの構造

```javascript
// 例: "2R-H-C*(R)" をパースして
hitCell = { 
  H: 1, R: 2, G: 0, C: 1, 
  critStar: true, 
  fsBonusR: 1 
};

// 被弾適用関数
function applyHit(target, cell, firerHT, targetSailFull) {
  applyHullHits(target, cell.H);
  applyGunHits(target, cell.G, firerSide);
  applyCrewHits(target, cell.C);      // 最小番号 crew section から
  let rDmg = cell.R + (targetSailFull ? cell.fsBonusR : 0);
  applyRiggingHits(target, rDmg);     // 最大番号 section から
  if (cell.critStar && target.lastDieWas6) rollCritical(target, firerHT);
}
```

### Rake 判定

```javascript
function isRaking(firer, target) {
  // target の bow hex が指す方向に firer が位置する → bow rake
  // target の stern hex が指す反対方向に firer が位置する → stern rake
  const range = hexRange(firer, target);
  if (range > 5) return null;
  
  if (positionIsAlongBowAxis(firer, target)) return "bow";
  if (positionIsAlongSternAxis(firer, target)) return "stern";
  
  // 例外: 距離 1 で真正面/真後ろなら対象が反撃可能でも Rake 認定
  if (range === 1 && isAtAbsoluteBowOrStern(firer, target)) 
    return positionIsAlongBowAxis(firer, target) ? "bow" : "stern";
  
  return null;
}
```

### 装填管理

- `reloads` は初期 30。broadside 発砲毎に装填で 1 マス消費 (double は 2)
- 1 ターンで装填できるのは 1 broadside のみ (両舷同時装填不可)
- Double は crew 3 section 残存で 1 ターン、2 section 以下で 2 ターン装填
- Grape は Round 装填済 broadside の発砲直前に切替可能 (ただし double は不可)
- `reloads = 0` で **Low Powder** 状態、HDT ペナルティ + ダイス目 1 で火災チェック (2d6=12 で火災)

### 実装上の注意（IJN との差分）

- IJN は単一舷・単発砲。WS&IM は **左右独立 broadside + 半舷分割 + 弾種 + 装填サイクル**で格段に複雑。
- Initial Broadside ボーナスは舷ごとに 1 回のみ。ターゲット無しで空撃ちしても失効する（rule 13.4）。
- 同時解決: Combat Phase で全艦が先にダイスを振り結果を記録、**末尾で一括反映**。この順序を守らないと不正（先に倒された艦が撃ち返せなくなる）。
- Field of Fire 判定は既存 IJN の sector 判定より複雑（最近艦チェックがフィールドごとに独立）。早期に専用判定関数を確立すべき。

### 疑似コード

```javascript
function resolveGunnery(firer, broadsideSide, ammo, wind) {
  const field = determineFireField(firer, broadsideSide);
  const candidates = findEnemiesInField(firer, broadsideSide, field);
  const target = pickClosestTarget(candidates);
  if (!target || isBlocked(firer, target, broadsideSide)) return null;
  
  const range = hexRangeToShip(firer, target);
  if (range > maxRangeForAmmo(ammo)) return null;
  
  const gunCount = countGunsInBroadside(firer, broadsideSide, field, range);
  const rakeType = isRaking(firer, target);
  const baseHT = HDT_LOOKUP(gunCount, range, rakeType !== null);
  
  let mod = 0;
  mod += crewQualityMod(firer, gunCount);
  if (!firer.broadside[broadsideSide].initialFired) mod += 1;
  if (rakeType === "stern") mod += 1;
  if (firer.sailMode === "full") mod -= 1;
  if (firer.anchor) mod += 1;
  mod -= countLostCrewSections(firer);
  if (firer.captured) { mod -= 2; mod += countLostCrewSections(firer); } // 打ち消し
  if (firer.mir) mod -= 1;
  mod += ammoModifier(ammo, gunCount);
  if (firer.reloads === 0) mod += lowPowderMod(gunCount);
  mod += windVelocityMod(wind, firer.shipClass);
  
  const ht = Math.max(0, Math.min(10, baseHT + mod));
  if (ht < 0) return "miss";
  
  const aspect = (range >= 6) ? "rigging" : playerChoice();
  
  // Grape 特例
  if (ammo === "G") return { crewKilled: ht };
  
  const die = d6();
  const cell = HIT_TABLE[ht][aspect][die - 1];
  
  const result = { ...cell, target, firer, rollDie: die };
  if (die === 6 && cell.critStar) {
    result.critical = rollCriticalHit(ht, aspect);
  }
  
  firer.broadside[broadsideSide].initialFired = true;
  // 装填消費: reload フェイズで処理
  return result;
}

// Combat Phase 末尾で一括適用
function applyAllFiringResults(results) {
  for (const r of results) applyHit(r.target, r, r.firer.ht, r.target.sailMode === "full");
  for (const r of results) if (r.critical) applyCritical(r.target, r.critical);
}
```

---

## 4. 接舷・白兵戦 (Boarding & Melee)

### 概要
隣接艦同士で Grapple 判定 → 成功で拘束 → Boarding Preparation Phase で OBP/DBP/TBP を秘匿プロット → Melee Phase で TMS 比較 → 3 ラウンド/ターン、TMS 3:1 で決着。

### 状態変数

```javascript
ship.boarding = {
  assignments: [  // 各 crew section への割当
    { section: 0, type: "OBP" | "DBP" | "TBP" | "NBP" | "FIRE" | "MIR" | "REPAIR", targetShipId: null },
    ...
  ],
  meleeState: null | { opponents: [shipId,...], roundsFought: 0, lockedIn: true }
};
```

### Grappling 判定 (2d6 >= 10)

修正子 (rule 9.1 + 22.1):
```
+/- 1 per crew quality 差（対敵グラップル時）
     友軍グラップル時は crack +1, elite +2 を firer に適用
+4 両艦友軍
+1 片方静止 (drift 含む、bow が新ヘクス入らず)
+2 両艦静止
-1 per 標的 MP の 1 超過分
+1 wind velocity = 1
-1 wind velocity = 5
-2 wind velocity = 6
unmodified 12 = 常に grapple
```

### Ungrappling (2d6 >= 10)

```
+1 crack, +2 elite
+1 melee not in progress
-6 melee in progress
+1 wind velocity = 6
友軍同士なら自動解除（ダイス不要）
unmodified 12 = 常に解除
```

- 1 grapple に対し 1 試行。複数 grapple は全て解除しないと自由にならない。
- Fouling との違い: Fouling は衝突由来・解除テーブル (Unfouling) が別、修正子も一部異なる。

### Boarding Party 形成

- crew section を OBP/DBP/TBP/NBP のいずれかに割当（秘匿）
- **最小番号 section から順**に割当義務（skip 不可）
- 全 section 投入 → 当ターン射撃不可 + 次ターン移動不可
- 修理中艦は OBP 不可 (DBP は可、ただし DBP 形成で修理キャンセル)
- MIR 中の section は DBP のみ可 (使用で sail change キャンセル)

### Melee 手順

1. **TMS (Total Melee Strength) 計算**:
   - 各 crew section の square 数 × (crew quality × BP type) の melee factor
   - Crew Melee Strength Table 参照 (Elite DBP=7, Crack DBP=6, Avg DBP=5, Green DBP=4, Poor DBP=3; OBP は DBP -1 相当)
   - DBP* (対 Rake 中) は DBP から -1 相当（原表に従う）
2. 双方同時 1d6 振り **Melee Resolution Table** で cross-ref:
   - 行: 1-2, 3-4, 5-6
   - 列: TMS 帯 (1-10, 11-20, ..., 81+)
   - セル値 = 相手が失う crew square 数
3. 最大 **3 ラウンド/ターン**。TMS 3:1 で決着しなければ次ターン継続。
4. 損害は対象の最小番号 crew section から
5. 複数 OBP が同一艦を攻撃 → TMS 合算

### 降伏と拿捕

4 種の降伏:
1. **Strike** (Hull 全損) → Destroyed Hull Table 1d6 判定 (1-4 降伏/5 沈没予定/6 爆発予定)
2. **Firepower** (Gun 全損 + 10 ヘクス内に同等以上友軍なし) → 接近して発砲した敵に降伏
3. **Immobility** (Rigging 全損 + 10 ヘクス内に同等以上友軍なし) → Rake を受けた時点で降伏
4. **Melee** (TMS 3:1)

拿捕:
- Melee 敗北艦 → 勝者 OBP が prize crew として乗り込む
- 他 3 降伏 → OBP/TBP 配置で拿捕
- Prize crew 1 square = 元 crew 最大 6 squares 管理。割合を下回ると囚人反乱で立場逆転
- 拿捕艦発砲 HDT -2、crew loss modifier 無視
- 被弾時 crew loss は 1/3/5..回目 = prize crew、2/4/6..回目 = 元 crew（通算）

### 実装上の注意

- Melee は **複数ターン継続状態**。OBP は決着まで解除不可（rule 10.2.2）。
- TMS は毎ラウンド再計算（crew 減っているため）。3:1 チェックは **TMS 比**で、square 数ではない。
- Fire / Waterline / MIR / Repair など「crew section を割当中」の section は boarding に使えない。割当状態管理を厳密に。
- 既存 IJN の「1 隻 vs 1 隻の攻撃」と異なり、**1 隻に複数 OBP が同時攻撃**あり、TMS 合算要。

### 疑似コード

```javascript
function resolveMelee(shipA, shipB) {
  // 各 3 ラウンド/ターン
  for (let round = 0; round < 3; round++) {
    const tmsA = computeTMS(shipA);
    const tmsB = computeTMS(shipB);
    
    if (tmsA >= tmsB * 3) { surrender(shipB, "melee"); capture(shipB, shipA); return; }
    if (tmsB >= tmsA * 3) { surrender(shipA, "melee"); capture(shipA, shipB); return; }
    
    const dieA = d6(), dieB = d6();
    const lossB = MELEE_RESOLUTION[tmsBand(tmsA)][dieBand(dieA)];
    const lossA = MELEE_RESOLUTION[tmsBand(tmsB)][dieBand(dieB)];
    
    applyCrewHitsToLowestMeleeSection(shipB, lossB);
    applyCrewHitsToLowestMeleeSection(shipA, lossA);
  }
  // 決着せず → 次ターン継続
  shipA.meleeState.lockedIn = true;
  shipB.meleeState.lockedIn = true;
}

function computeTMS(ship) {
  let tms = 0;
  for (const a of ship.boarding.assignments) {
    if (!["OBP","DBP"].includes(a.type)) continue;
    const squares = liveCrewSquaresInSection(ship, a.section);
    const factor = CREW_MELEE_STRENGTH[ship.crewQuality][a.type + (a.rakedThisTurn ? "_RAKED":"")];
    tms += squares * factor;
  }
  return tms;
}
```

---

## 5. 損害 (Damage)

### 概要
命中は H/G/C/R の 4 種。セクション消去順に厳格なルールあり。クリティカル・火災・沈没・爆発・帆柱倒壊は遅延処理。

### 消去順ルール（重要）

| 種別 | 消去順 |
|---|---|
| **Hull (H)** | 任意（プレイヤー選択。通常は最大番号から） |
| **Crew (C)** | **最小番号 section から** (rule 11.4.2.1) |
| **Gun (G)** | **発射艦に近い側の section から**（Advanced では bow/stern 分別）。両側等距離なら被弾側選択 |
| **Rigging (R)** | **最大番号 section から** (rule 11.4.4.1) |
| **Reloads** | 最大番号から |

### Rigging セクション損失の副作用

- 1 section 全損 → **全態勢で MA -1 hex**（速度劣化）
- 第 1 section 全損 + FS 状態 → 強制 BS（修理完了まで FS 不可）
- 全 section 喪失 (dismasted):
  - 射撃 HDT: 砲 6 以下で -1、7 以上で -2
  - 旋回: TA 依存の drift 待機ターン後にのみ 60 度可

### 帆柱倒壊判定 (rule 36)

- 1 section 全損時に 1d6:
  - 1: 帆柱が舷側に倒れかかる（さらに 1d6 で奇数=左/偶数=右）
  - 2-6: 清く折損（通常処理）
- 舷側倒壊:
  - 当該舷射撃不可
  - 旋回不可
  - MA -1（rigging 喪失分に追加）
  - Unfouling Phase で切離し試行（Unfouling Table 使用）
  - 隣接艦 rigging 射界内は fouling ロール対象

### クリティカル・ヒット (Critical Hit Table)

- Hit Table の `*` 付き 6 結果 → 2d6 で Hull/Rigging 別の Critical Hit Table 参照
- 重篤結果は **qualifying roll**（1d6 ≤ firer HT#）を要求
- 全効果は **Combat Phase 末尾・通常ダメージ適用後**に累積適用

代表効果:
| 出目 | Rigging 側 | Hull 側 |
|---|---|---|
| 2 | 2R + 火災判定 | 2H + 弾薬庫誘爆判定 (1d6+range ≤ 4 で爆沈) |
| 3 | 3R + マスト倒壊判定 | 3H + 艦員士気崩壊 |
| 4 | 4R + マスト倒壊 | 4H + 舵故障（次ターン旋回不可、永続 TA-1） |
| 5 | 5R | 5H + 水線下損傷（1 crew section を排水固定） |
| 6 | 6R | 6H |
| 7 | 7R (左舷 fallen rig) | 7H |
| 8 | 8R (右舷 fallen rig) | 8H |
| 9 | 9R (sail change 時 1C) | 9H |
| 10 | 10R (anchor cable 切断) | 10H (曳航グラップル損失) |
| 11 | 11R | 11H (Rake 時 R 被害 2 倍) |
| 12 | 12R | 12H (FS 時 R 被害 2 倍) |

### 火災 (Fire)

- Critical Hit 2H、Low Powder の 1 目 2d6=12、爆発艦隣接時にチェック
- 発火判定: 1d6 ≤ firer HT# → 発火
  - 発火時さらに 1d6: 6 = 制御不能（爆発マーカー）、それ以外は消火要員割当可能
- 消火: 毎 Unfouling Phase で 1d6 ≤ 割当 crew section 数 → 消火
  - 失敗: rigging 1 + hull 1 追加損害

### 浸水 (Waterline Damage)

- Critical Hit 5H で発動
- 1 crew section を排水作業に永続固定（他行動不可）
- 残行動 section が減るため事実上の戦闘力低下

### 降伏 (Surrender) 遅延処理

- **Strike**: Hull 全損時に Destroyed Hull Table ロール。5/6 は以降毎ターン Unfouling Phase で 1d6、6 の目で沈没/爆発実行
- **Firepower/Immobility**: 条件成立 + 近接友軍なし + 敵の接近射撃/Rake を受けた時点で降伏
- 降伏艦は射撃・白兵・移動不可（drift のみ）。5 ヘクス内に友軍が来ると解除（Strike のみ、ダメージは残る）

### 爆発 (Explode)

- Destroyed Hull Table 6 → 以降 1d6=6 で爆発
- 爆発時、隣接艦に rigging 被害 = `min(10, 爆発艦の 1 ヘクス Rake ボーナス × 2)` の Hit Table ロール
- 加えて隣接艦は 2H Critical (火災判定)
- FS 艦は fs ボーナス込み

### 実装上の注意

- **最小番号 crew vs 最大番号 rigging** の消去順を間違えない（ミスしやすい）。
- Critical は必ず **Combat Phase 末尾適用**。先に rigging section を消すと他艦の命中結果が狂う。
- Destroyed Hull Table と sink/explode は **遅延処理**。ship.pendingDestruction = "sink"|"explode" をフラグ化して毎ターン Unfouling Phase でロール。
- 降伏後の処理（prize crew 割当、firing 不可、drift のみ、5 ヘクス内友軍で復帰）は 5 種すべてを状態マシンで管理。

### 疑似コード

```javascript
function applyDamage(target, H, G, C, R, firerSide) {
  // Hull: 残り hull[] から 1 つずつ消す
  for (let i = 0; i < H && target.hullAlive > 0; i++) target.hullAlive--;
  
  // Gun: 発射側近接 section から
  const closer = firerSideCloserSection(target, firerSide);
  const farther = otherSection(closer);
  let remaining = G;
  remaining -= removeFromSection(target.guns[closer], remaining);
  if (remaining > 0) remaining -= removeFromSection(target.guns[farther], remaining);
  if (remaining > 0) remaining -= removeFromCarronades(target, remaining);
  
  // Crew: 最小番号から
  for (let s = 0; s < target.crew.length && C > 0; s++) {
    C -= removeFromSection(target.crew[s], C);
  }
  
  // Rigging: 最大番号から
  for (let s = target.rigging.length - 1; s >= 0 && R > 0; s--) {
    const wasSection = target.rigging[s].filter(x => x.alive).length;
    R -= removeFromSection(target.rigging[s], R);
    const nowSection = target.rigging[s].filter(x => x.alive).length;
    if (wasSection > 0 && nowSection === 0) onRiggingSectionLost(target, s);
  }
  
  // Hull 全損チェック
  if (target.hullAlive === 0 && !target.struck) {
    target.struck = true;
    const roll = d6();
    if (roll <= 4) surrender(target, "strike");
    else if (roll === 5) target.pendingDestruction = "sink";
    else target.pendingDestruction = "explode";
  }
}

function onRiggingSectionLost(ship, sectionIdx) {
  ship.speedReduction++;
  if (sectionIdx === 0 && ship.sailMode === "full") ship.sailMode = "battle";
  
  // マスト倒壊判定
  const d = d6();
  if (d === 1) {
    const side = d6() % 2 === 0 ? "starboard" : "port";
    ship.mastOverSide = side;  // 片舷射撃不可、旋回不可、MA -1
  }
  // 2-6: 清く折損（rigging 損失のみ）
}
```

---

## 6. 手番進行 (Sequence of Play)

### 概要
Basic 8 フェイズ / Advanced 10 フェイズ。すべて秘匿プロット → 同時解決。プロット対象は移動・装填・boarding party。

### Basic Game (8 フェイズ)

1. **Unfouling** — 絡み解除試行、rigging 1 sq で +1 可
2. **Movement Notation** — 各艦に移動命令を秘匿記入
3. **Movement Execution** — 同時移動、衝突検出→fouling 判定、drift 適用
4. **Grappling & Ungrappling** — 隣接艦に対し grapple 試行 or ungrapple 試行
5. **Boarding Preparation** — OBP/DBP/TBP/NBP を秘匿記入
6. **Combat** — 全砲撃を同時解決、ダメージは末尾一括適用
7. **Melee** — 白兵戦解決（最大 3 ラウンド/ターン）
8. **Load** — 装填

### Advanced Game (10 フェイズ)

1. **Wind** — 2d6 で風変化判定（前項 §2）
2. **Unfouling** — 絡み解除 + 沈没/爆発 1d6 + 火災 1d6
3. **Movement Notation** — 移動 + 修理 + 錨 + 帆変更 をプロット
4. **Movement Execution** — 実行 + drift + 衝突 + MIR マーカー配置
5. **Grappling & Ungrappling**
6. **Boarding Preparation** — 消火要員割当も含む
7. **Combat** — 砲撃解決 + Critical 判定 + 降伏判定 + マーカー配置
8. **Melee**
9. **Reload** — broadside 1 個装填 (R/C/G は 1 sq、D は 2 sq)、修理完了宣言 + 2 sq 回復
10. **Full Sail** — FS マーカー配置/除去、MIR マーカー除去

### プロット方式の実装

```javascript
const PHASE_ORDER = ["wind","unfoul","moveNotation","moveExec","grapple",
                     "boardPrep","combat","melee","reload","fullSail"];

gameState = {
  turn: 0,
  phase: "wind",
  plots: {
    [shipId]: { movement: "", notes: { repair, anchor, sailChange }, 
                boarding: [], loadTarget: "R" | "L" | null }
  },
  revealedPlots: false,  // プロット開放フラグ（秘匿プロット制御）
};
```

### 実装上の注意

- **プロット開放は各フェイズ直前**。Movement Notation 終了 → 全艦のプロット開示 → Movement Execution。
- 同時解決は「結果を全艦先に計算 → 末尾で一括適用」パターン。既存 IJN の phase_gun.html と同様に、中間 `pendingDamage[]` を貯めて末尾で反映。
- 修理・錨・帆変更は Movement Notation Phase でしか宣言できない（ターン中の判断変更不可）。UI 上はこのフェイズで専用入力欄を表示。

---

## 7. 2 ヘクス艦

### 概要
各艦は **bow hex + stern hex** の 2 ヘクスを占有。60 度回転は bow を軸にして stern がスイングする方式。Rake 判定・Rigging セクション・射界は bow/stern ベクトルに依存。

### 状態変数

```javascript
ship = {
  bow:   { col, row },   // 前半
  stern: { col, row },   // 後半（bow から dir の逆方向に 1）
  dir:   1..6,           // bow が指す方向（ヘクス辺番号）
  // stern の位置は常に: stern = hexNeighbor(bow, oppositeDir(dir))
};
```

### 旋回 (60 度) の挙動

```javascript
function rotate60(ship, direction /* "L" or "R" */) {
  ship.dir = (ship.dir + (direction === "R" ? +1 : -1) + 6 - 1) % 6 + 1;
  ship.stern = hexNeighbor(ship.bow, oppositeDir(ship.dir));
}
```

- bow を軸に stern が **新しいヘクスへスイング**
- スイング先ヘクスに他艦がいる場合 = 衝突判定対象
- スプリング錨 (AS) なら stern 軸で 60/120 度回転可（bow がスイング）
- スプリング錨 (AB) なら bow 軸で 60/120 度回転可（stern がスイング）

### 前進 (1 hex) の挙動

```javascript
function stepForward(ship) {
  ship.stern = { ...ship.bow };        // 旧 bow が新 stern
  ship.bow = hexNeighbor(ship.bow, ship.dir);
}
```

- bow 先のヘクスに艦/陸/地形があれば停止・衝突検出

### 射程と射界

- **射程**: 発射艦の任意部位 → 標的の最近部位 (bow or stern) まで。つまり `min(dist(firer.bow, target.bow), dist(firer.bow, target.stern), dist(firer.stern, ...))` の最小値だが、通常は firer 側は舷側中心を暗黙に使う
- **射界 (field of fire)**: firer の dir を基準に左右舷を判定。舷は bow hex 寄り/stern hex 寄りで 2 分割
- **Rake 判定**: target の bow vector または stern vector の延長線上に firer がいるか判定
  - target.bow から見て dir 方向の軸上 = bow rake
  - target.stern から見て oppositeDir の軸上 = stern rake
  - 射程 5 hex 以内限定

### Rigging セクションとの対応

- Rigging は艦ログ上で section 1..4（ BS 4 艦 = 4 section、BS 3 艦 = 3 section）
- section 1 = 前部マスト（bow 寄り）、番号が大きいほど後部寄り
- 損失は **最大番号から**消去（艦尾マストから折れていく）
- 第 1 section 損失 = 主マスト喪失 → FS 不可

### Full / Half Hex 占有

- 通常 1 艦 = 2 hex (bow hex + stern hex)
- 例外なし。衝突判定は bow/stern どちらでも該当
- 他艦の stern と自艦の bow が同時に同じヘクスに入る → 衝突判定フロー (rule 8.3.2)

### 実装上の注意

- 既存 IJN は 1 艦 = 1 ヘクスベース。本ゲームでは **2 ヘクス描画**が必要で、ヒットボックス・ホバー・クリック判定も bow/stern 両方に対応させる。
- 旋回時の stern スイング先ヘクスが他オブジェクトと重なる場合 = 旋回不可（衝突扱い）。移動プロットバリデータで早期検出。
- **方向と座標の一貫性**を保つため、`ship.stern` は毎回 `hexNeighbor(bow, opposite(dir))` から導出する方針にすると破綻しにくい。bow と dir のみが「真の状態」、stern はキャッシュ扱い。

### 疑似コード

```javascript
function updateStern(ship) {
  ship.stern = hexNeighbor(ship.bow, oppositeDir(ship.dir));
}

function shipOccupies(ship, hex) {
  return sameHex(ship.bow, hex) || sameHex(ship.stern, hex);
}

function findShipAtHex(hex, ships) {
  for (const s of ships) {
    if (sameHex(s.bow, hex))   return { ship: s, part: "bow" };
    if (sameHex(s.stern, hex)) return { ship: s, part: "stern" };
  }
  return null;
}

function determineBowRakeHex(targetShip) {
  // target.bow の dir 方向 1 ヘクス先が「bow rake 可能な最初のヘクス」
  // そこから target.dir に沿って最大 5 ヘクスまで
  const rakeHexes = [];
  let cur = hexNeighbor(targetShip.bow, targetShip.dir);
  for (let i = 0; i < 5; i++) {
    rakeHexes.push(cur);
    cur = hexNeighbor(cur, targetShip.dir);
  }
  return rakeHexes;
}

function determineSternRakeHex(targetShip) {
  const rakeHexes = [];
  const dirBack = oppositeDir(targetShip.dir);
  let cur = hexNeighbor(targetShip.stern, dirBack);
  for (let i = 0; i < 5; i++) {
    rakeHexes.push(cur);
    cur = hexNeighbor(cur, dirBack);
  }
  return rakeHexes;
}

function isRaking(firer, target) {
  const range = hexRangeToShip(firer, target);
  if (range > 5) return null;
  const bowRakes = determineBowRakeHex(target);
  const sternRakes = determineSternRakeHex(target);
  const firerHexes = [firer.bow, firer.stern];
  for (const fh of firerHexes) {
    if (bowRakes.some(h => sameHex(h, fh))) return "bow";
    if (sternRakes.some(h => sameHex(h, fh))) return "stern";
  }
  return null;
}
```

---

## 付録: 実装優先順位の提案

1. **座標系・2 ヘクス艦モデル** (§7) — 他すべての前提
2. **Wind Phase + 風向態勢算出** (§2) — 移動の基礎
3. **Movement Notation + Execution** (§1) — 衝突・Fouling 含む。UI プロット入力も同時設計
4. **Sequence of Play 骨組み** (§6) — 残フェイズの器だけ用意
5. **Gunnery (Basic)** (§3) — HDT + Hit Table 0..8、Rake 含む。弾種/Critical/FS は後回し可
6. **Damage + Hit Table 反映** (§5) — 消去順（crew 最小/rigging 最大）最優先
7. **Boarding + Melee** (§4) — TMS + 3:1 判定
8. **Advanced 要素** — Field of Fire 5 分割、弾種 4 種、Critical、FS/MIR、Low Powder、Anchor、Repair、Blocked Wind、Tow、Bomb Ketch

このロードマップに沿えば、前半 4 段階で「動く艦と衝突する帆船」が完成し、後半で戦闘の深さを追加できる。
既存 IJN のフェイズ分離構造（`phase_init` → `phase_move` → `phase_gun` → `phase_report`）は本ゲームにもそのまま適用可能だが、`phase_wind`、`phase_grapple`、`phase_melee`、`phase_load`、`phase_fullsail` の追加が必要。

---

以上が WS&IM v1.2b 実装メモの全 7 節である。各節の擬似コードは最小限の雛形であり、実装時は既存 IJN の座標ユーティリティ・状態管理パターンを踏襲しつつ拡張する想定。
