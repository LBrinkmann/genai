---
name: hetzner
description: Manage Hetzner Cloud servers via API. Create, list, start, stop, delete VPS instances, deploy the app, check logs and status.
argument-hint: [action] [args...]
---

# Hetzner Cloud Server Management

Run the `hcloud.sh` script located in this skill's directory. It reads `HETZNER_API_TOKEN` from the project `.env` automatically.

## Usage

```bash
.claude/skills/hetzner/hcloud.sh $ARGUMENTS
```

If `$ARGUMENTS` is empty, run with `help` to show available commands.

## Available Commands

**Server management:**
- `list` — list all servers
- `info <name|id>` — show server details
- `create [name] [type] [image] [location]` — create server (defaults: genai cx23 ubuntu-24.04 nbg1)
- `delete <name|id>` — delete server (**ask user to confirm first**)
- `start <name|id>` — power on
- `stop <name|id>` — shutdown
- `reboot <name|id>` — reboot
- `ssh <name|id>` — SSH into server

**Deployment:**
- `init <name|id>` — full setup: install Docker, clone repo, copy .env + config, build, start
- `deploy <name|id>` — pull latest code + rebuild containers
- `sync-config <name|id>` — upload local config + restart backend
- `status <name|id>` — show container status on server
- `logs <name|id> [service]` — show container logs (optionally filter by service: backend, caddy, db)

**Branch previews (remote):**
- `preview-start <server> <branch> [fport] [bport]` — deploy a branch as a preview on custom ports
- `preview-stop <server> <branch>` — stop a branch preview
- `preview-list <server>` — list all remote previews

**Infrastructure:**
- `types` — list available server types with prices
- `ssh-key-add <name> <pubkey-file>` — upload SSH public key

## Safety

- **Never run `delete` without explicit user confirmation**
- The script reads the API token from `.env` — never echo or log it
