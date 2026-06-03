#!/usr/bin/env bash
# hcloud.sh — Hetzner Cloud server management for the GenAI project
# Usage: ./hcloud.sh <command> [args...]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load token from .env if not already set
if [ -z "${HETZNER_API_TOKEN:-}" ]; then
  ENV_FILE="$PROJECT_ROOT/.env"
  if [ -f "$ENV_FILE" ]; then
    HETZNER_API_TOKEN=$(grep -E '^HETZNER_API_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
    export HETZNER_API_TOKEN
  fi
fi

if [ -z "${HETZNER_API_TOKEN:-}" ]; then
  echo "Error: HETZNER_API_TOKEN not set. Add it to .env or export it." >&2
  exit 1
fi

# SSH key for connecting to provisioned servers. Override by exporting SSH_KEY.
SSH_KEY="${SSH_KEY:-$PROJECT_ROOT/.secrets/gen_ai}"
SSH_OPTS=(-o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
if [ -f "$SSH_KEY" ]; then
  SSH_OPTS=(-i "$SSH_KEY" "${SSH_OPTS[@]}")
fi

ssh_cmd() { ssh "${SSH_OPTS[@]}" "$@"; }
scp_cmd() { scp "${SSH_OPTS[@]}" "$@"; }

API="https://api.hetzner.cloud/v1"
AUTH="Authorization: Bearer $HETZNER_API_TOKEN"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
api_get()  { curl -sf -H "$AUTH" "$API/$1"; }
api_post() { curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" -d "$2" "$API/$1"; }
api_del()  { curl -sf -X DELETE -H "$AUTH" "$API/$1"; }

resolve_server() {
  # Accept ID (numeric) or name, return "ID IP"
  local input="$1"
  if [[ "$input" =~ ^[0-9]+$ ]]; then
    api_get "servers/$input" | python3 -c "
import json,sys; s=json.load(sys.stdin)['server']
print(s['id'], s['public_net']['ipv4']['ip'])"
  else
    api_get "servers?name=$input" | python3 -c "
import json,sys; d=json.load(sys.stdin)['servers']
if not d: print('not_found'); sys.exit(1)
s=d[0]; print(s['id'], s['public_net']['ipv4']['ip'])"
  fi
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
cmd_list() {
  echo "ID           NAME         STATUS       TYPE         IP"
  echo "------------ ------------ ------------ ------------ ----------------"
  api_get "servers" | python3 -c "
import json,sys
for s in json.load(sys.stdin)['servers']:
    print(f\"{s['id']:<12} {s['name']:<12} {s['status']:<12} {s['server_type']['name']:<12} {s['public_net']['ipv4']['ip']}\")"
}

cmd_info() {
  local id_ip; id_ip=$(resolve_server "$1")
  local sid; sid=$(echo "$id_ip" | cut -d' ' -f1)
  api_get "servers/$sid" | python3 -c "
import json,sys; s=json.load(sys.stdin)['server']
print(f\"Name:       {s['name']}\")
print(f\"ID:         {s['id']}\")
print(f\"Status:     {s['status']}\")
print(f\"Type:       {s['server_type']['name']} ({s['server_type']['cores']}vCPU, {s['server_type']['memory']}GB)\")
print(f\"IPv4:       {s['public_net']['ipv4']['ip']}\")
print(f\"Image:      {s['image']['name'] if s.get('image') else 'n/a'}\")
print(f\"Datacenter: {s['datacenter']['name']}\")
print(f\"Created:    {s['created']}\")"
}

cmd_create() {
  local name="${1:-genai}"
  local type="${2:-cx23}"
  local image="${3:-ubuntu-24.04}"
  local location="${4:-nbg1}"

  # Get first SSH key
  local ssh_key_id
  ssh_key_id=$(api_get "ssh_keys" | python3 -c "
import json,sys; keys=json.load(sys.stdin)['ssh_keys']
print(keys[0]['id'] if keys else '')")

  if [ -z "$ssh_key_id" ]; then
    echo "Error: No SSH keys found. Upload one first: ./hcloud.sh ssh-key-add <name> <pubkey-file>" >&2
    exit 1
  fi

  # Get or create firewall
  local fw_id
  fw_id=$(api_get "firewalls" | python3 -c "
import json,sys; fws=json.load(sys.stdin)['firewalls']
print(fws[0]['id'] if fws else '')")

  if [ -z "$fw_id" ]; then
    echo "Creating firewall (22, 80, 443)..."
    fw_id=$(api_post "firewalls" '{
      "name":"genai-fw",
      "rules":[
        {"direction":"in","protocol":"tcp","port":"22","source_ips":["0.0.0.0/0","::/0"]},
        {"direction":"in","protocol":"tcp","port":"80","source_ips":["0.0.0.0/0","::/0"]},
        {"direction":"in","protocol":"tcp","port":"443","source_ips":["0.0.0.0/0","::/0"]}
      ]}' | python3 -c "import json,sys; print(json.load(sys.stdin)['firewall']['id'])")
    echo "  Firewall created: $fw_id"
  fi

  echo "Creating server: name=$name type=$type image=$image location=$location"
  api_post "servers" "{
    \"name\": \"$name\",
    \"server_type\": \"$type\",
    \"image\": \"$image\",
    \"location\": \"$location\",
    \"ssh_keys\": [$ssh_key_id],
    \"firewalls\": [{\"firewall\": $fw_id}]
  }" | python3 -c "
import json,sys; d=json.load(sys.stdin)
if 'error' in d:
    print(f\"Error: {d['error']['message']}\"); sys.exit(1)
s=d['server']
print(f\"Server created!\")
print(f\"  ID:   {s['id']}\")
print(f\"  Name: {s['name']}\")
print(f\"  IPv4: {s['public_net']['ipv4']['ip']}\")
print(f\"  Type: {s['server_type']['name']}\")
rp=d.get('root_password')
if rp: print(f\"  Root password: {rp}\")
else:  print(f\"  Auth: SSH key\")"
}

cmd_delete() {
  local id_ip; id_ip=$(resolve_server "$1")
  local sid; sid=$(echo "$id_ip" | cut -d' ' -f1)
  echo "Deleting server $sid..."
  api_del "servers/$sid" > /dev/null
  echo "  Deleted."
}

cmd_start() {
  local id_ip; id_ip=$(resolve_server "$1")
  local sid; sid=$(echo "$id_ip" | cut -d' ' -f1)
  api_post "servers/$sid/actions/power_on" '{}' > /dev/null
  echo "Server $1 starting."
}

cmd_stop() {
  local id_ip; id_ip=$(resolve_server "$1")
  local sid; sid=$(echo "$id_ip" | cut -d' ' -f1)
  api_post "servers/$sid/actions/shutdown" '{}' > /dev/null
  echo "Server $1 stopping."
}

cmd_reboot() {
  local id_ip; id_ip=$(resolve_server "$1")
  local sid; sid=$(echo "$id_ip" | cut -d' ' -f1)
  api_post "servers/$sid/actions/reboot" '{}' > /dev/null
  echo "Server $1 rebooting."
}

cmd_ssh() {
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  echo "Connecting to root@$ip..."
  ssh_cmd "root@$ip"
}

cmd_init() {
  # Full server init: install Docker, clone repo, create .env, deploy
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  echo "Initializing server at $ip..."

  echo "  [1/4] Installing Docker..."
  ssh_cmd "root@$ip" \
    "curl -fsSL https://get.docker.com | sh" > /dev/null 2>&1

  echo "  [2/4] Cloning repo..."
  ssh_cmd "root@$ip" "cd /opt && git clone https://github.com/LBrinkmann/genai.git" 2>/dev/null || \
    ssh_cmd "root@$ip" "cd /opt/genai && git pull"

  echo "  [3/4] Copying .env and config..."
  local project_root; project_root="$(cd "$(dirname "$0")/../../.." && pwd)"
  scp_cmd "$project_root/.env" "root@$ip:/opt/genai/.env"
  scp_cmd "$project_root/config/experiment.yml" "root@$ip:/opt/genai/config/experiment.yml"
  # Force REACT_APP_API_URL to empty so the frontend uses RELATIVE URLs
  # (same origin as the page). Required for Cloudflare/HTTPS access:
  # baking the bare IP over HTTP triggers mixed-content blocks when the
  # site is served via HTTPS. api.js falls back to localhost:8000 only
  # when the var is unset; an explicit empty string means "relative".
  ssh_cmd "root@$ip" "sed -i 's|REACT_APP_API_URL=.*|REACT_APP_API_URL=|' /opt/genai/.env"
  # Caddyfile for IP-only (no domain yet)
  ssh_cmd "root@$ip" "cat > /opt/genai/Caddyfile << 'EOF'
:80 {
  handle /api/* {
    reverse_proxy backend:8000
  }
  handle {
    root * /srv/frontend
    file_server
    try_files {path} /index.html
  }
}
EOF"

  echo "  [4/4] Building and starting containers..."
  ssh_cmd "root@$ip" "cd /opt/genai && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build" 2>&1 | tail -5

  # Set up backup cron
  ssh_cmd "root@$ip" "chmod +x /opt/genai/scripts/*.sh && \
    (crontab -l 2>/dev/null; echo '0 3 * * * cd /opt/genai && ./scripts/backup.sh >> /var/log/genai-backup.log 2>&1') | crontab -" 2>/dev/null

  echo ""
  echo "Done! App is live at http://$ip"
}

cmd_sync_config() {
  # Upload local config to server and restart backend
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  local project_root; project_root="$(cd "$(dirname "$0")/../../.." && pwd)"
  echo "Syncing config to $ip..."
  scp_cmd "$project_root/config/experiment.yml" "root@$ip:/opt/genai/config/experiment.yml"
  echo "  Config uploaded. Restarting backend..."
  ssh_cmd "root@$ip" "cd /opt/genai && docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend" 2>&1
  echo "Done."
}

cmd_deploy() {
  # Update existing server: pull code, sync static assets, force-rebuild all, restart
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  local compose="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
  echo "Deploying to $ip..."
  echo "  [1/4] Pulling latest code..."
  ssh_cmd "root@$ip" "cd /opt/genai && git pull" 2>&1 | tail -5
  echo "  [2/4] Syncing static assets..."
  ssh_cmd "root@$ip" "mkdir -p /opt/genai/frontend/public && \
    rsync -a \
      --include='*.mp4' --include='*.mov' --include='*.svg' \
      --include='*.jpg' --include='*.png' --exclude='*' \
      /var/www/genai/public/ /opt/genai/frontend/public/" 2>&1 | tail -5
  echo "  [3/4] Removing old frontend build..."
  ssh_cmd "root@$ip" "cd /opt/genai && $compose down frontend caddy && docker volume rm -f genai_frontend-static" 2>&1 | tail -5
  echo "  [4/4] Rebuilding and starting all containers..."
  ssh_cmd "root@$ip" "cd /opt/genai && $compose up -d --build" 2>&1 | tail -10
  echo "Deploy complete."
}

cmd_pull_assets() {
  # Pull static media assets from the server into the local frontend/public/.
  # Media-only filter (mp4, mov, svg, jpg, png); everything else excluded.
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  local dest="$PROJECT_ROOT/frontend/public"
  mkdir -p "$dest"
  echo "Pulling static assets from root@$ip:/var/www/genai/public/ into $dest ..."
  local ssh_e="ssh ${SSH_OPTS[*]}"
  local stats
  stats=$(rsync -a --stats \
    --include='*.mp4' --include='*.mov' --include='*.svg' \
    --include='*.jpg' --include='*.png' --exclude='*' \
    -e "$ssh_e" \
    "root@$ip:/var/www/genai/public/" "$dest/")
  local files size
  files=$(echo "$stats" | grep -E '^Number of (regular )?files transferred' | head -1 | awk -F': ' '{print $2}' | tr -d ',')
  size=$(echo "$stats" | grep -E '^Total transferred file size' | head -1 | awk -F': ' '{print $2}')
  if [ -z "$files" ]; then
    files=$(echo "$stats" | grep -E '^Number of files transferred' | head -1 | awk -F': ' '{print $2}' | tr -d ',')
  fi
  echo "File count: ${files:-?} | Total size: ${size:-?}"
}

cmd_logs() {
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  local service="${2:-}"
  if [ -n "$service" ]; then
    ssh_cmd "root@$ip" "cd /opt/genai && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50 $service"
  else
    ssh_cmd "root@$ip" "cd /opt/genai && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50"
  fi
}

cmd_status() {
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  ssh_cmd "root@$ip" "cd /opt/genai && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
}

cmd_ssh_key_add() {
  local name="$1"
  local file="$2"
  local pubkey; pubkey=$(cat "$file")
  api_post "ssh_keys" "{\"name\": \"$name\", \"public_key\": \"$pubkey\"}" | python3 -c "
import json,sys; k=json.load(sys.stdin)['ssh_key']
print(f\"SSH key added: ID={k['id']} name={k['name']}\")"
}

cmd_preview_start() {
  # Deploy a branch preview on the remote server
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  local branch="$2"
  local fport="${3:-3001}"
  local bport="${4:-8001}"
  local preview_dir="/opt/genai-previews/$branch"

  echo "Starting remote preview: $branch on $ip"
  echo "  Frontend: http://$ip:$fport"
  echo "  Backend:  http://$ip:$bport"

  # Clone or update the preview worktree
  ssh_cmd "root@$ip" "
    set -e
    mkdir -p /opt/genai-previews
    if [ ! -d '$preview_dir' ]; then
      cd /opt/genai
      git fetch origin
      git worktree add '$preview_dir' 'origin/feat/$branch' 2>/dev/null || \
        git worktree add '$preview_dir' 'origin/$branch'
    else
      cd '$preview_dir'
      git fetch origin
      git checkout -B 'feat/$branch' 'origin/feat/$branch' 2>/dev/null || \
        git checkout -B '$branch' 'origin/$branch'
    fi
  " 2>&1 | tail -5

  # Copy .env and generate preview compose
  ssh_cmd "root@$ip" "
    cp /opt/genai/.env '$preview_dir/.env'
    sed -i 's|REACT_APP_API_URL=.*|REACT_APP_API_URL=http://$ip:${bport}|' '$preview_dir/.env'
    sed -i 's|CORS_ORIGIN=.*|CORS_ORIGIN=http://$ip:${fport}|' '$preview_dir/.env'

    cat > '$preview_dir/docker-compose.preview.yml' << YAML
services:
  backend:
    build:
      target: dev
    volumes:
      - ./backend:/app
      - ./config:/app/config
    ports:
      - \"${bport}:8000\"
    environment:
      - OPENAI_API_KEY=\\\${OPENAI_API_KEY}
      - HF_INFERENCE_TOKEN=\\\${HF_INFERENCE_TOKEN}
      - CORS_ORIGIN=http://$ip:${fport}
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
      - \"${fport}:3000\"
    environment:
      - REACT_APP_API_URL=http://$ip:${bport}

  db: {}
YAML
  "

  # Start the preview
  ssh_cmd "root@$ip" "
    cd '$preview_dir'
    COMPOSE_PROJECT_NAME='genai-$branch' \
      docker compose \
      -f docker-compose.yml \
      -f docker-compose.preview.yml \
      up -d --build
  " 2>&1 | tail -10

  echo ""
  echo "Preview '$branch' running on $ip:"
  echo "  Frontend: http://$ip:$fport"
  echo "  Backend:  http://$ip:$bport"
}

cmd_preview_stop() {
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)
  local branch="$2"
  local preview_dir="/opt/genai-previews/$branch"

  echo "Stopping remote preview: $branch"
  ssh_cmd "root@$ip" "
    cd '$preview_dir' 2>/dev/null && \
    COMPOSE_PROJECT_NAME='genai-$branch' \
      docker compose \
      -f docker-compose.yml \
      -f docker-compose.preview.yml \
      down
  " 2>&1 | tail -5
  echo "Preview '$branch' stopped."
}

cmd_preview_list() {
  local id_ip; id_ip=$(resolve_server "$1")
  local ip; ip=$(echo "$id_ip" | cut -d' ' -f2)

  echo "Remote previews on $ip:"
  ssh_cmd "root@$ip" "
    for dir in /opt/genai-previews/*/; do
      [ -d \"\$dir\" ] || continue
      name=\$(basename \"\$dir\")
      running=\$(cd \"\$dir\" && COMPOSE_PROJECT_NAME=\"genai-\$name\" docker compose -f docker-compose.yml -f docker-compose.preview.yml ps --format '{{.Status}}' 2>/dev/null | head -1)
      echo \"  \$name — \${running:-stopped}\"
    done
  " 2>/dev/null || echo "  (none)"
}

cmd_types() {
  echo "NAME        vCPU   RAM   DISK  ARCH   PRICE"
  echo "----------- ----  ----  -----  -----  ----------"
  api_get "server_types" | python3 -c "
import json,sys
for t in sorted(json.load(sys.stdin)['server_types'], key=lambda x: float(x['prices'][0]['price_monthly']['gross'])):
    if t.get('deprecation'): continue
    a=t.get('architecture','x86')
    p=float(t['prices'][0]['price_monthly']['gross'])
    print(f\"{t['name']:<11} {t['cores']:>4}  {t['memory']:>4}  {t['disk']:>5}  {a:<5}  {p:>7.2f}€/mo\")"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
CMD="${1:-help}"
shift || true

case "$CMD" in
  list)         cmd_list ;;
  info)         cmd_info "$1" ;;
  create)       cmd_create "${1:-genai}" "${2:-cx23}" "${3:-ubuntu-24.04}" "${4:-nbg1}" ;;
  delete)       cmd_delete "$1" ;;
  start)        cmd_start "$1" ;;
  stop)         cmd_stop "$1" ;;
  reboot)       cmd_reboot "$1" ;;
  ssh)          cmd_ssh "$1" ;;
  init)         cmd_init "$1" ;;
  deploy)       cmd_deploy "$1" ;;
  pull-assets)  cmd_pull_assets "$1" ;;
  sync-config)  cmd_sync_config "$1" ;;
  preview-start) cmd_preview_start "$1" "$2" "${3:-3001}" "${4:-8001}" ;;
  preview-stop)  cmd_preview_stop "$1" "$2" ;;
  preview-list)  cmd_preview_list "$1" ;;
  logs)         cmd_logs "$1" "${2:-}" ;;
  status)       cmd_status "$1" ;;
  ssh-key-add)  cmd_ssh_key_add "$1" "$2" ;;
  types)        cmd_types ;;
  help|*)
    cat << 'HELP'
Usage: hcloud.sh <command> [args...]

Server management:
  list                          List all servers
  info <name|id>                Show server details
  create [name] [type] [image] [location]  Create server (defaults: genai cx23 ubuntu-24.04 nbg1)
  delete <name|id>              Delete server
  start <name|id>               Power on
  stop <name|id>                Shutdown
  reboot <name|id>              Reboot
  ssh <name|id>                 SSH into server

Deployment:
  init <name|id>                Full setup: Docker, clone, .env, build, start
  deploy <name|id>              Pull code + sync static assets + rebuild containers
  sync-config <name|id>         Upload local config + restart backend
  status <name|id>              Show container status
  logs <name|id> [service]      Show container logs

Assets:
  pull-assets <server>          Rsync /var/www/genai/public/*.{mp4,mov,svg,jpg,png}
                                from the server into local frontend/public/

Previews (remote):
  preview-start <server> <branch> [fport] [bport]  Deploy branch preview
  preview-stop <server> <branch>                   Stop branch preview
  preview-list <server>                            List remote previews

Infrastructure:
  types                         List available server types + prices
  ssh-key-add <name> <file>     Upload SSH public key
HELP
    ;;
esac
