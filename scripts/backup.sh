#!/usr/bin/env bash
# Runs pg_dump inside the Docker container and saves to /opt/genai/backups/
# Designed to be called via cron on the VPS
set -euo pipefail

BACKUP_DIR="/opt/genai/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

docker compose exec -T db pg_dump -U genai genai > "$BACKUP_DIR/genai_$TIMESTAMP.sql"

# Rotate: keep last 30 backups
ls -1t "$BACKUP_DIR"/genai_*.sql | tail -n +31 | xargs -r rm

echo "Backup saved: $BACKUP_DIR/genai_$TIMESTAMP.sql"
