#!/usr/bin/env bash
# Start everything SocialMind needs: Ollama, the backend, and (optionally) the Mac apps.
# Run from anywhere: ~/Documents/ScoialMind-Dashboard/start-socialmind.sh
set -e
cd "$(dirname "$0")"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

say() { echo -e "${GREEN}==>${RESET} $1"; }
warn() { echo -e "${YELLOW}!! ${RESET} $1"; }
fail() { echo -e "${RED}✖ ${RESET} $1"; exit 1; }

# 1. Make sure Ollama is installed and running.
if ! command -v ollama >/dev/null 2>&1; then
  fail "Ollama is not installed. Install with: brew install ollama"
fi

if ! pgrep -x ollama >/dev/null; then
  say "Starting Ollama in the background…"
  ollama serve >/tmp/socialmind-ollama.log 2>&1 &
  sleep 2
else
  say "Ollama already running"
fi

# Make sure the model the child Helper uses is pulled.
if ! ollama list 2>/dev/null | grep -q "aya-expanse:8b"; then
  say "Pulling aya-expanse:8b model (one-time, ~5 GB download)…"
  ollama pull aya-expanse:8b
fi

# 2. Make sure node_modules exist.
if [ ! -d node_modules ]; then
  say "Installing npm dependencies (one-time)…"
  npm install
fi

# 3. Make sure the database is seeded.
if [ ! -f socialmind.db ]; then
  say "Seeding the database (one-time)…"
  npm run seed
fi

# 4. Stop any backend already running on port 4000.
if lsof -ti:4000 >/dev/null 2>&1; then
  warn "Killing existing process on port 4000"
  lsof -ti:4000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# 5. Keep the Mac awake while the backend runs (so iPhone keeps connecting overnight).
say "Preventing Mac sleep (caffeinate)…"
caffeinate -d -i &
CAFFEINATE_PID=$!
echo $CAFFEINATE_PID > /tmp/socialmind-caffeinate.pid

# 6. Start the backend in the background.
say "Starting backend on http://localhost:4000…"
npm run dev:backend >/tmp/socialmind-backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/socialmind-backend.pid

# Wait for backend to be ready.
for i in {1..30}; do
  if curl -s http://localhost:4000/api/health >/dev/null 2>&1; then
    say "Backend is up"
    break
  fi
  sleep 1
done

# 7. Find the LAN IP so iPhone can connect.
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "?")

# 8. Optionally open the Mac apps.
if [ "${1:-}" != "--no-apps" ]; then
  if [ -d "SOCIALMIND-CHILD_APP/release/mac-arm64/SocialMind.app" ]; then
    say "Opening SocialMind (child) Mac app"
    open "SOCIALMIND-CHILD_APP/release/mac-arm64/SocialMind.app"
  fi
  if [ -d "frontend/release/mac-arm64/SocialMind Dashboard.app" ]; then
    say "Opening SocialMind Dashboard Mac app"
    open "frontend/release/mac-arm64/SocialMind Dashboard.app"
  fi
fi

echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  SocialMind is running."
echo -e "  Backend:    http://localhost:4000"
echo -e "  iPhone URL: http://${LAN_IP}:4000  (same WiFi as Mac)"
echo -e "  Dashboard:  http://localhost:5173  (run separately if needed: npm run dev:frontend)"
echo -e "  Child web:  http://localhost:5174  (run separately if needed: npm run dev:child)"
echo -e ""
echo -e "  Logs:       tail -f /tmp/socialmind-backend.log"
echo -e "  Stop:       ./stop-socialmind.sh"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
