#!/usr/bin/env bash
# Run this on the SERVER (inside /home/socialmind/app) every time you deploy.
set -e
cd "$(dirname "$0")/.."

echo "==> Installing all workspace deps"
npm install

echo "==> Building everything (shared, backend, frontend, child)"
npm run build

echo "==> Seeding DB if missing"
if [ ! -f socialmind.db ]; then
  npm run seed || true
fi

echo "==> Starting/restarting backend with PM2"
pm2 startOrRestart deploy/pm2.config.cjs
pm2 save

echo
echo "DONE. Backend is running on port 4000."
echo "Frontend bundles:"
echo "  Dashboard: $(pwd)/frontend/dist"
echo "  Child:     $(pwd)/SOCIALMIND-CHILD_APP/dist"
echo "Configure nginx with deploy/nginx.conf to expose them."
