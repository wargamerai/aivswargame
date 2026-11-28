武将・ユニット画像の置き場所です。
画像を置いた後、../game-data.js の unitImages に次の形式で追加してください。

unitImages: {
  '織田信長': 'assets/units/nobunaga.png',
  '徳川家康': 'assets/units/tokugawa.png'
}

地図は SVG と CSS で描いています。エリア座標と街道は game-data.js の areas と roads で調整します。
