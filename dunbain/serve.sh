#!/usr/bin/env bash
# ダンバインをローカルで開く（file:// だと localStorage は動くが、URLパラメータの例は http が確実）
cd "$(dirname "$0")"
PORT="${1:-8765}"
echo "ブラウザで開く例:"
echo "  観戦＋学習ON:  http://127.0.0.1:${PORT}/index.html?spectator=1&ql=1&scenarioId=practice"
echo "  観戦のみ:      http://127.0.0.1:${PORT}/index.html?spectator=1&scenarioId=practice"
echo ""
echo "Ctrl+C で停止"
exec python3 -m http.server "$PORT"
