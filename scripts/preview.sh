#!/usr/bin/env bash
# preview.sh — Run branch previews on custom ports
# Usage: ./scripts/preview.sh <action> <branch> [frontend-port] [backend-port]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PREVIEWS_DIR="$PROJECT_ROOT/previews"

ACTION="${1:-help}"
BRANCH="${2:-}"
FRONTEND_PORT="${3:-3001}"
BACKEND_PORT="${4:-8001}"

start_preview() {
  local name="$1" fport="$2" bport="$3"
  local dir="$PREVIEWS_DIR/$name"

  # Create worktree if needed
  if [ ! -d "$dir" ]; then
    cd "$PROJECT_ROOT"
    git fetch origin 2>/dev/null || true
    git worktree add "$dir" "origin/feat/$name" 2>/dev/null || \
      git worktree add "$dir" "origin/$name" 2>/dev/null || \
      { echo "Error: branch feat/$name or $name not found"; exit 1; }
  fi

  # Copy .env from main project
  cp "$PROJECT_ROOT/.env" "$dir/.env"
  sed -i.bak "s|REACT_APP_API_URL=.*|REACT_APP_API_URL=http://localhost:${bport}|" "$dir/.env"
  sed -i.bak "s|CORS_ORIGIN=.*|CORS_ORIGIN=http://localhost:${fport}|" "$dir/.env"
  echo "CORS_ORIGIN=http://localhost:${fport}" >> "$dir/.env"
  rm -f "$dir/.env.bak"

  # Generate a self-contained dev override with custom ports (replaces docker-compose.dev.yml)
  cat > "$dir/docker-compose.preview.yml" << EOF
services:
  backend:
    build:
      target: dev
    volumes:
      - ./backend:/app
      - ./config:/app/config
    ports:
      - "${bport}:8000"
    environment:
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
      - HF_INFERENCE_TOKEN=\${HF_INFERENCE_TOKEN}
      - CORS_ORIGIN=http://localhost:${fport}
    command: >
      uvicorn app.main:app
      --host 0.0.0.0
      --port 8000
      --reload

  frontend:
    build:
      target: dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "${fport}:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:${bport}

  db: {}
EOF

  cd "$dir"
  echo "Starting preview: $name"
  # Use base compose + preview override only (skip docker-compose.dev.yml to avoid port conflicts)
  COMPOSE_PROJECT_NAME="genai-$name" \
    docker compose \
    -f docker-compose.yml \
    -f docker-compose.preview.yml \
    up -d --build 2>&1 | tail -10

  echo ""
  echo "Preview '$name' running:"
  echo "  Frontend: http://localhost:$fport"
  echo "  Backend:  http://localhost:$bport"
}

stop_preview() {
  local name="$1"
  local dir="$PREVIEWS_DIR/$name"
  if [ ! -d "$dir" ]; then
    echo "Preview '$name' not found"; exit 1
  fi
  cd "$dir"
  COMPOSE_PROJECT_NAME="genai-$name" \
    docker compose \
    -f docker-compose.yml \
    -f docker-compose.preview.yml \
    down 2>&1 | tail -5
  echo "Preview '$name' stopped."
}

list_previews() {
  echo "Previews:"
  for dir in "$PREVIEWS_DIR"/*/; do
    [ -d "$dir" ] || continue
    local name=$(basename "$dir")
    local running=$(COMPOSE_PROJECT_NAME="genai-$name" docker compose -f "$dir/docker-compose.yml" -f "$dir/docker-compose.preview.yml" ps --format "{{.Status}}" 2>/dev/null | head -1)
    echo "  $name — ${running:-stopped}"
  done
}

case "$ACTION" in
  start)  start_preview "$BRANCH" "$FRONTEND_PORT" "$BACKEND_PORT" ;;
  stop)   stop_preview "$BRANCH" ;;
  list)   list_previews ;;
  help|*)
    cat << 'HELP'
Usage: preview.sh <action> <branch> [frontend-port] [backend-port]

  start <branch> [fport] [bport]   Start preview (default: 3001/8001)
  stop <branch>                    Stop preview
  list                             List previews

Examples:
  ./scripts/preview.sh start ui-redesign 3001 8001
  ./scripts/preview.sh start text-dissolution 3002 8002
  ./scripts/preview.sh stop ui-redesign
HELP
    ;;
esac
