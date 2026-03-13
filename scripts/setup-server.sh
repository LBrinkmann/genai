#!/usr/bin/env bash
# Initial server setup for GenAI on a fresh Ubuntu VPS
# Run this ONCE on a new server
set -euo pipefail

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt-get install -y docker-compose-plugin

# Create app directory
mkdir -p /opt/genai
cd /opt/genai

# Clone repo (replace with actual repo URL)
git clone https://github.com/LBrinkmann/genai.git .

# Create .env from example
cp .env.example .env
echo ">>> Edit .env with production values, then run:"
echo ">>> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"

# Set up daily backup cron
echo "0 3 * * * cd /opt/genai && ./scripts/backup.sh >> /var/log/genai-backup.log 2>&1" | crontab -
