---
name: hetzner
description: Manage Hetzner Cloud servers via API. Create, list, start, stop, delete VPS instances, manage SSH keys, firewalls, and volumes.
argument-hint: [action] [args...]
---

# Hetzner Cloud Server Management

Manage cloud infrastructure via the Hetzner Cloud API. The API token must be set in the `HETZNER_API_TOKEN` environment variable.

## API Basics

- **Base URL**: `https://api.hetzner.cloud/v1`
- **Auth**: `Authorization: Bearer $HETZNER_API_TOKEN`
- **Format**: JSON request/response

## Actions

Parse `$ARGUMENTS` to determine the action. Supported actions:

### `list` — List all servers
```bash
curl -s -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  'https://api.hetzner.cloud/v1/servers' | python3 -m json.tool
```
Show a table: ID, name, status, server type, IP address.

### `create <name>` — Create a new server
Default: CX22 (2 vCPU, 4GB RAM, 40GB SSD), Ubuntu 24.04, Nuremberg.

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  -d '{
    "name": "<name>",
    "server_type": "cx22",
    "image": "ubuntu-24.04",
    "location": "nbg1",
    "ssh_keys": [<SSH_KEY_IDS>],
    "firewalls": [{"firewall": <FIREWALL_ID>}]
  }' \
  'https://api.hetzner.cloud/v1/servers'
```

Before creating:
1. List SSH keys — if none exist, ask the user to provide one or upload `~/.ssh/id_*.pub`
2. List firewalls — if none exist, create one allowing ports 22, 80, 443
3. Ask the user to confirm server type, image, and location before creating
4. After creation, display: server ID, IP address, and root password (if no SSH key)

### `delete <id-or-name>` — Delete a server
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  'https://api.hetzner.cloud/v1/servers/<ID>'
```
**Always ask for confirmation before deleting.**

### `info <id-or-name>` — Show server details
```bash
curl -s -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  'https://api.hetzner.cloud/v1/servers/<ID>'
```
Show: name, status, type, IP, image, datacenter, created date.

### `start <id-or-name>` / `stop <id-or-name>` / `reboot <id-or-name>`
```bash
curl -s -X POST \
  -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  'https://api.hetzner.cloud/v1/servers/<ID>/actions/<power_on|shutdown|reboot>'
```

### `ssh-keys` — List SSH keys
```bash
curl -s -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  'https://api.hetzner.cloud/v1/ssh_keys'
```

### `ssh-key add <name> <public-key-file>` — Upload SSH key
Read the public key file, then:
```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  -d '{"name": "<name>", "public_key": "<contents>"}' \
  'https://api.hetzner.cloud/v1/ssh_keys'
```

### `firewall create <name>` — Create firewall (SSH + HTTP + HTTPS)
```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  -d '{
    "name": "<name>",
    "rules": [
      {"direction":"in","protocol":"tcp","port":"22","source_ips":["0.0.0.0/0","::/0"]},
      {"direction":"in","protocol":"tcp","port":"80","source_ips":["0.0.0.0/0","::/0"]},
      {"direction":"in","protocol":"tcp","port":"443","source_ips":["0.0.0.0/0","::/0"]}
    ]
  }' \
  'https://api.hetzner.cloud/v1/firewalls'
```

### `firewall apply <firewall-id> <server-id>` — Apply firewall to server
```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  -d '{"apply_to":[{"type":"server","server":{"id":<SERVER_ID>}}]}' \
  'https://api.hetzner.cloud/v1/firewalls/<FIREWALL_ID>/actions/apply_to_resources'
```

### `types` — List available server types
```bash
curl -s -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  'https://api.hetzner.cloud/v1/server_types' | python3 -c "
import json,sys
d=json.load(sys.stdin)
for t in d['server_types']:
    print(f\"{t['name']:10} {t['cores']}vCPU {t['memory']}GB {t['disk']}GB {t['prices'][0]['price_monthly']['gross']}€/mo\")
"
```

### `images` — List available OS images
```bash
curl -s -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  'https://api.hetzner.cloud/v1/images?type=system' | python3 -c "
import json,sys
d=json.load(sys.stdin)
for i in d['images']:
    print(f\"{i['name']:20} {i['description']}\")
"
```

### `deploy <id-or-name>` — Deploy this project to a server
Run the deploy script:
```bash
ssh root@<SERVER_IP> "cd /opt/genai && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
```
Or use `scripts/deploy.sh <SERVER_IP>`.

## Name-to-ID Resolution

When the user provides a server name instead of an ID, resolve it:
```bash
curl -s -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  'https://api.hetzner.cloud/v1/servers?name=<NAME>'
```
Extract the ID from the first result.

## Recommended Setup for This Project

- **Server type**: `cx22` (2 vCPU, 4GB, 40GB SSD, ~€4.35/mo)
- **Image**: `ubuntu-24.04`
- **Location**: `nbg1` (Nuremberg)
- **Firewall**: allow 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **SSH key**: inject at creation for passwordless access

## Safety

- **Never delete servers without explicit user confirmation**
- **Never expose the API token** in logs or output
- API token is read from `HETZNER_API_TOKEN` env var — if not set, inform the user
