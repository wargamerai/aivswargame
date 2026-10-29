海の戦い 画面なしの対戦（連合=連合AI / 枢軸=play.js の中のドイツ軍の指し方）

ゲーム本体（index.html・data.js・battle.js）をそのまま読み込んで、ターン1〜8を1回対戦します。
ボタン待ち・ダイスの演出は飛ばします。

■ 初回だけ
  cd /Users/baron/Desktop/aigame/海の戦い/sim
  npm install

■ 1回対戦する
  cd /Users/baron/Desktop/aigame/海の戦い/sim
  node play.js ..

■ ドイツ軍の動きも表示する
  node play.js .. log

■ ドイツ海軍の提督の作戦報告として書き出す（reports フォルダにも保存）
  node play.js .. report

■ 表示されるもの
  ターンごとのPOCの獲得分と累計、各海域の支配、両軍の撃沈艦
