#!/usr/bin/env bash
# Run this ONCE on the Hetzner server (as root) to install everything.
# Usage on server:
#   bash server-setup.sh
set -e

echo "==> Updating apt"
apt-get update -y
apt-get upgrade -y

echo "==> Installing base tools"
apt-get install -y curl ca-certificates gnupg ufw nginx git build-essential rsync

echo "==> Installing Node.js 22 (NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "==> Installing PM2 (process manager) globally"
npm install -g pm2

echo "==> Installing certbot (for HTTPS later)"
apt-get install -y certbot python3-certbot-nginx

echo "==> Configuring firewall (allow SSH, HTTP, HTTPS only)"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Creating app user 'socialmind'"
id -u socialmind &>/dev/null || useradd -m -s /bin/bash socialmind
mkdir -p /home/socialmind/app
chown -R socialmind:socialmind /home/socialmind/app

echo
echo "DONE. Server is ready."
echo "Next: from your Mac, run deploy/upload-to-server.sh to push the code."
