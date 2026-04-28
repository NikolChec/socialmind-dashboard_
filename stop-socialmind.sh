#!/usr/bin/env bash
# Stop everything started by start-socialmind.sh.
set -e

GREEN='\033[0;32m'
RESET='\033[0m'
say() { echo -e "${GREEN}==>${RESET} $1"; }

say "Stopping backend on port 4000…"
lsof -ti:4000 2>/dev/null | xargs kill -9 2>/dev/null || true

say "Stopping any tsx watch / dev processes…"
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

if [ -f /tmp/socialmind-caffeinate.pid ]; then
  say "Releasing caffeinate (Mac can sleep again)…"
  kill "$(cat /tmp/socialmind-caffeinate.pid)" 2>/dev/null || true
  rm -f /tmp/socialmind-caffeinate.pid
fi

# Ollama stays running by default — leave it on, it idles fine.
# To also stop Ollama, uncomment:
# say "Stopping Ollama…"
# pkill -x ollama 2>/dev/null || true

say "Stopped. Mac apps will keep showing whatever they had cached until you close them."
