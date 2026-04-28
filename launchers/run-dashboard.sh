#!/usr/bin/env bash
# Start backend + dashboard + open it in the browser.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Run shared bootstrap (Ollama + model + backend).
bash "$SCRIPT_DIR/_bootstrap.sh" "$PROJECT_ROOT" || exit 1

cd "$PROJECT_ROOT"

# Start dashboard frontend if not running on 5173.
if lsof -ti:5173 >/dev/null 2>&1; then
  echo "==> Dashboard already running on :5173"
else
  echo "==> Starting dashboard frontend…"
  npm run dev:frontend >/tmp/socialmind-dashboard.log 2>&1 &
  for i in {1..30}; do
    curl -s http://localhost:5173 >/dev/null 2>&1 && break
    sleep 1
  done
fi

echo "==> Opening dashboard in browser…"
open http://localhost:5173

cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SocialMind Dashboard is running.
  Dashboard: http://localhost:5173
  Backend:   http://localhost:4000
  Logs:      /tmp/socialmind-backend.log
             /tmp/socialmind-dashboard.log
  To stop:   close this Terminal window
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
read -p "Press Enter to close this window (apps keep running in background)…"
