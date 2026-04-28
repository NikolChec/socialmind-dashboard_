#!/usr/bin/env bash
# Shared bootstrap: ensures Homebrew, Ollama (correct version), the model,
# and a healthy backend are all running. Sourced by each launcher script.
set -e

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; RESET='\033[0m'
say()  { echo -e "${GREEN}==>${RESET} $1"; }
warn() { echo -e "${YELLOW}!! ${RESET} $1"; }
fail() { echo -e "${RED}✖ ${RESET} $1"; read -p "Press Enter to close…"; exit 1; }

# Required minimums — bump these if the project ever needs newer features.
MIN_OLLAMA_VERSION="0.4.0"
REQUIRED_MODEL="aya-expanse:8b"

PROJECT_ROOT="${1:-$HOME/Documents/ScoialMind-Dashboard}"

if [ ! -d "$PROJECT_ROOT" ]; then
  fail "Project not found at $PROJECT_ROOT. Clone the repo there or edit this launcher's PROJECT_ROOT."
fi

cd "$PROJECT_ROOT"

# ── 1. Homebrew ──────────────────────────────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  say "Homebrew not found. Installing (one-time, ~3-5 min)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || fail "Homebrew install failed. Visit https://brew.sh"
fi
# Ensure brew is in PATH for this shell.
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ]    && eval "$(/usr/local/bin/brew shellenv)"

# ── 2. Ollama: install or upgrade if version is too old ──────────────────────
version_ge() {
  # returns 0 if $1 >= $2 (semver compare via sort -V)
  [ "$1" = "$2" ] && return 0
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

install_ollama() { say "Installing Ollama…"; brew install ollama || fail "Ollama install failed."; }
upgrade_ollama() { say "Upgrading Ollama to a newer version…"; brew upgrade ollama || fail "Ollama upgrade failed."; }

if ! command -v ollama >/dev/null 2>&1; then
  install_ollama
else
  current_ver=$(ollama --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  if [ -z "$current_ver" ]; then
    warn "Could not detect Ollama version — reinstalling clean."
    brew uninstall --force ollama 2>/dev/null || true
    install_ollama
  elif ! version_ge "$current_ver" "$MIN_OLLAMA_VERSION"; then
    warn "Ollama $current_ver is older than required $MIN_OLLAMA_VERSION."
    upgrade_ollama
  else
    say "Ollama $current_ver is OK (>= $MIN_OLLAMA_VERSION)."
  fi
fi

# ── 3. Start Ollama daemon if not already running ────────────────────────────
if ! pgrep -x ollama >/dev/null; then
  say "Starting Ollama daemon…"
  ollama serve >/tmp/socialmind-ollama.log 2>&1 &
  sleep 2
else
  say "Ollama daemon already running."
fi

# ── 4. Pull required model if missing ────────────────────────────────────────
if ! ollama list 2>/dev/null | grep -q "$REQUIRED_MODEL"; then
  say "Pulling model $REQUIRED_MODEL (one-time, ~5 GB)…"
  ollama pull "$REQUIRED_MODEL" || fail "Failed to pull $REQUIRED_MODEL."
else
  say "Model $REQUIRED_MODEL is present."
fi

# ── 5. Node + dependencies ───────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  say "Installing Node.js 22…"
  brew install node@22 || fail "Node install failed."
  brew link --overwrite --force node@22 || true
fi

if [ ! -d node_modules ]; then
  say "Installing npm dependencies (one-time)…"
  npm install || fail "npm install failed."
fi

# ── 6. Seed DB if missing ────────────────────────────────────────────────────
if [ ! -f socialmind.db ]; then
  say "Seeding database…"
  npm run seed || warn "Seed failed, continuing anyway."
fi

# ── 7. Start backend if port 4000 is free ────────────────────────────────────
if lsof -ti:4000 >/dev/null 2>&1; then
  say "Backend already running on port 4000."
else
  say "Starting backend…"
  npm run dev:backend >/tmp/socialmind-backend.log 2>&1 &
  for i in {1..30}; do
    curl -s http://localhost:4000/api/health >/dev/null 2>&1 && { say "Backend is up."; break; }
    sleep 1
  done
fi

say "Bootstrap complete."
