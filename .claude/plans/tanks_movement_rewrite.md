# TANKS+ 移動システム書き換え + 射撃修正

## 1. scenarios.js - データ修正

### DESTRUCTION_TABLE
- +3以上、-3以下を追加（現在は+2〜-3のみ）
- 正しい値:
  - '3': destroyed:[2,9], noEffect:[10,10], immobilized:[11,12]
  - '2': destroyed:[2,7], noEffect:[8,10], immobilized:[11,12]
  - '1': destroyed:[2,6], noEffect:[7,10], immobilized:[11,12]
  - '0': destroyed:[2,5], noEffect:[6,10], immobilized:[11,12]
  - '-1': destroyed:[2,4], noEffect:[5,10], immobilized:[11,12]
  - '-2': destroyed:[2,3], noEffect:[4,10], immobilized:[11,12]
  - '-3': destroyed:[2,2], noEffect:[3,10], immobilized:[11,12]

### HIT_MODIFIERS
- 国籍別の前進射撃修正に変更
  - forest: +2, building: +2, defensiveFire: +1
  - advanceFire: { ge:+2, su:+3, us:+2, uk:+2 }
  - smallTarget: +1, immobilized: -1

## 2. hub.html - クリック通知拡張

- MAP_SELECTメッセージにヘクスサイド情報を追加
  - クリック位置から最も近いヘクスサイド（0-5）を計算
  - `{ type:'MAP_SELECT', col, row, side, unitIdx }`
- 移動フェーズ中、移動可能ヘクスをハイライト表示

## 3. phase_move.html - 全面書き換え

### 状態遷移
- `idle` → ユニット未選択
- `moving` → ユニット選択済み、ヘクスクリックで移動
- `facing` → 移動完了、ヘクスサイドクリックで向き決定

### 移動ロジック
1. ユニットカードまたはマップクリックでユニット選択 → `moving`状態へ
2. 隣接ヘクスクリック:
   a. 旋回コスト計算: 現在の向きから移動方向までの角度差 × 1MP/60°
   b. 地形コスト計算: TERRAIN_COST[地形]（歩兵は常に1）
   c. 後退判定: 移動方向が背面(±180°以内の後方3方向)なら+1MP
   d. 合計コスト = 旋回 + 地形 + (後退なら+1)
   e. MP不足チェック → 不足なら移動不可表示
   f. スタックチェック
   g. 移動実行 → ユニット位置更新
   h. **防御射撃判定** → 敵ユニットが射界内かつ射程内なら自動射撃
   i. 移動履歴に追加（Undo用）
3. 移動完了（MPなし or プレイヤー選択）→ `facing`状態へ
4. ヘクスサイドクリック → 向き決定 → 確定

### 防御射撃
- 移動先ヘクスに入った時点で判定
- 全敵ユニットをチェック:
  - 射程内か
  - LOS通るか
  - 射界内か（旋回砲塔=360°、固定=前方120°）
  - 未射撃か（防御射撃は1フェーズ1回）
- 命中判定: HIT_MODIFIERS.defensiveFire (+1) を適用
- 撃破/移動不能の場合、移動即終了
- **防御射撃はUndoできない** → Undoは防御射撃後の位置から

### UI変更
- ボタン: 前進/後退/回転ボタン削除
- 残す: Undo、確定、フェーズ終了
- 追加: 残りMP表示、移動モード/向きモード表示
- 歩兵: 全方向移動可（旋回コストなし）
- AT砲: 移動不可、回転のみ（別途ヘクスサイドクリックで向き変更）

## 4. phase_gun.html - 射撃修正

### 連続射撃（ピンゾロ）
- 2が出たら `continuousFire` フラグセット
- 最初の目標が無効果 → 同じ目標に強制再射撃
- 最初の目標が破壊/移動不能 → 別の目標選択可能
- 状態: `continuousFire: true, continuousTarget: idx`

### 射界判定の呼び出し修正
- showShootInfo(): `canFireAt()` で射撃可否チェック
- doShoot(): `isHittingFrontArmor()` で装甲判定

## 実装順序
1. scenarios.js のデータ修正（DESTRUCTION_TABLE, HIT_MODIFIERS）
2. phase_gun.html の射界判定と連続射撃修正
3. hub.html のクリック通知拡張
4. phase_move.html の全面書き換え
