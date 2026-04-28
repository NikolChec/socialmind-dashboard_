#!/usr/bin/env bash
# Start backend + child app + open it in the browser.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

bash "$SCRIPT_DIR/_bootstrap.sh" "$PROJECT_ROOT" || exit 1

cd "$PROJECT_ROOT"

if lsof -ti:5174 >/dev/null 2>&1; then
  echo "==> Child app already running on :5174"
else
  echo "==> Starting child app frontend…"
  npm run dev:child >/tmp/socialmind-child.log 2>&1 &
  for i in {1..30}; do
    curl -s http://localhost:5174 >/dev/null 2>&1 && break
    sleep 1
  done
fi

echo "==> Opening child app in browser…"
open http://localhost:5174

cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SocialMind Child App is running.
  Child:    http://localhost:5174
  Backend:  http://localhost:4000
  Login:    dana / child123
  Logs:     /tmp/socialmind-backend.log
            /tmp/socialmind-child.log
  To stop:  close this Terminal window
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
read -p "Press Enter to close this window (apps keep running in background)…"
