# AI Game Collection

ブラウザで動く戦争ゲーム集。全てHTML/CSS/JSのみ（サーバーなし）。

## プロジェクト構成

| フォルダ | ゲーム | 概要 |
|---------|--------|------|
| `ijn/` | 連合艦隊 (IJN) | 海戦シミュレーション。キャンペーン+戦闘フェーズ(移動/砲撃/雷撃/修理/レポート) |
| `Panzer Waffe_West/` | パンツァーヴァッフェ 西部戦線 | 戦車戦AI対戦。Q学習ベース |
| `Panzer Waffe_North Africa/` | パンツァーヴァッフェ 北アフリカ | 同上の北アフリカ版 |
| `battleofnomonhan/` | ノモンハン事件 | 地上戦AI対戦。Q学習ベース |
| `f16ai/` | F-16 空戦 | 空中戦AI対戦 |
| `index.html` | ポータル | ゲーム選択画面 |

## 現在の重点: IJN (連合艦隊)

- 最もアクティブに開発中
- TODO/バグリスト: `ijn/TODO.md`
- フェーズ構成: init → move → gun → torpedo → repair → report
- 各フェーズが独立HTMLファイル (`phase_*.html`)
- `campaign.html`: キャンペーンモード, `hub.html`: 艦隊管理
- 日本軍=プレイヤー操作, 米軍=AI自動

## 技術スタック

- フロントエンドのみ (HTML + CSS + JS)
- ビルドツール・フレームワークなし
- AI: Q学習（学習済みデータはJSONファイル）
- ブラウザで直接開いて動作

## コード規約

- 言語: HTML/CSS/JavaScript (vanilla)
- UI文言: 日本語
- コメント: 日本語OK
- コミットメッセージ: 英語
- ファイル内のJS: HTML内に `<script>` で直接記述（外部JSは一部AI関連のみ）

## 開発の進め方

- ブラウザで直接HTMLを開いてテスト（サーバー不要）
- 変更後はブラウザリロードで確認
- gitで管理中 (mainブランチ)
