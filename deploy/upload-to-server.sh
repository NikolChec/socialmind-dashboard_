#!/usr/bin/env bash
# Run this on your Mac to upload the project to the Hetzner server.
# Edit SERVER_IP below first.
set -e

# ── EDIT THESE ──────────────────────────────────────────────
SERVER_IP="REPLACE_WITH_YOUR_SERVER_IP"
SERVER_USER="root"   # change to "socialmind" after first run
# ────────────────────────────────────────────────────────────

cd "$(dirname "$0")/.."  # repo root

if [ "$SERVER_IP" = "REPLACE_WITH_YOUR_SERVER_IP" ]; then
  echo "ERROR: edit deploy/upload-to-server.sh and set SERVER_IP first"; exit 1
fi

echo "==> Syncing files to ${SERVER_USER}@${SERVER_IP}:/home/socialmind/app"
rsync -av --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'build' \
  --exclude '.env' \
  --exclude '*.db' \
  --exclude '*.db-shm' \
  --exclude '*.db-wal' \
  --exclude '.DS_Store' \
  --exclude 'release' \
  --exclude '.vite' \
  --exclude 'coverage' \
  ./ "${SERVER_USER}@${SERVER_IP}:/home/socialmind/app/"

echo
echo "Files uploaded."
echo "Now SSH in and run deploy/build-and-start.sh on the server:"
echo "  ssh ${SERVER_USER}@${SERVER_IP}"
echo "  cd /home/socialmind/app && bash deploy/build-and-start.sh"
