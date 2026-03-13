#!/usr/bin/env bash
# Usage: ./scripts/deploy.sh <server-host>
# Deploys the application to the target server via SSH
set -euo pipefail

HOST="${1:?Usage: deploy.sh <server-host>}"

ssh "$HOST" "cd /opt/genai && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
