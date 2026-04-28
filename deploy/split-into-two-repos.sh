#!/usr/bin/env bash
# Splits this monorepo into two standalone folders ready to push as separate GitHub repos.
# Output:
#   ~/Documents/socialmind-dashboard   (backend + frontend dashboard + shared + seeds)
#   ~/Documents/socialmind-child-app   (child app, with shared copied in)
set -e

SRC="$HOME/Documents/ScoialMind-Dashboard"
DASH="$HOME/Documents/socialmind-dashboard"
CHILD="$HOME/Documents/socialmind-child-app"

echo "==> Creating dashboard repo at $DASH"
rm -rf "$DASH"
mkdir -p "$DASH"
rsync -a --exclude 'node_modules' --exclude 'dist' --exclude 'build' \
  --exclude '.env' --exclude '*.db' --exclude '*.db-shm' --exclude '*.db-wal' \
  --exclude 'release' --exclude '.vite' --exclude 'SOCIALMIND-CHILD_APP' \
  "$SRC/" "$DASH/"

echo "==> Creating child app repo at $CHILD"
rm -rf "$CHILD"
mkdir -p "$CHILD"
rsync -a --exclude 'node_modules' --exclude 'dist' --exclude 'build' \
  --exclude '.env' --exclude 'release' --exclude '.vite' \
  "$SRC/SOCIALMIND-CHILD_APP/" "$CHILD/"

echo "==> Copying shared/ into child app (so it can build standalone)"
rsync -a --exclude 'node_modules' --exclude 'dist' "$SRC/shared/" "$CHILD/shared/"

echo
echo "DONE."
echo "Dashboard repo:  $DASH"
echo "Child app repo:  $CHILD"
echo
echo "Next, for EACH folder, run:"
echo "  cd <folder>"
echo "  git init && git add . && git commit -m 'Initial commit'"
echo "  git branch -M main"
echo "  git remote add origin https://github.com/<YOU>/<REPO>.git"
echo "  git push -u origin main"
