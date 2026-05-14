# Infrastructure and Deployment

## Local Development Environment

Docker Compose orchestrates three services:

1. **Backend**: FastAPI with hot-reload, source code and YAML config mounted as volumes. Exposed on a dedicated port.
2. **Frontend**: React dev server with hot-reload and source mounting. Exposed on its own port.
3. **Database**: PostgreSQL with a persistent named volume.

All services share a Docker network. Environment variables (database connection string, LLM API keys) are passed through the compose file or an `.env` file.

## Production Environment

A single VPS (e.g., Hetzner CX22: 2 vCPU, 4 GB RAM, ~$5–7/month) running Docker Compose with a production override file.

### Services

Four containers in production:

1. **Caddy** — reverse proxy and static file server. Serves the built React app, reverse proxies `/api` to the backend, and auto-provisions TLS certificates via Let's Encrypt. Ports 80 and 443 exposed.
2. **Backend** — FastAPI with gunicorn + uvicorn workers (no hot-reload). YAML config and `.env` mounted as volumes.
3. **Database** — PostgreSQL with a named volume for data persistence.
4. **Frontend build** — a one-shot container that builds the React app and outputs static files to a shared volume read by Caddy. (Alternatively, the frontend is built in CI and the static files are baked into the Caddy image.)

### Caddy Configuration

```
chat.example.com {
    root * /srv/frontend
    file_server
    try_files {path} /index.html
}

api.example.com {
    reverse_proxy backend:8000
}
```

Caddy replaces Nginx because it auto-provisions and renews TLS certificates with zero configuration — no certbot, no cron jobs.

### Docker Compose Files

- `docker-compose.yml` — base services (shared between dev and prod)
- `docker-compose.dev.yml` — dev overrides: hot-reload, source mounts, dev servers
- `docker-compose.prod.yml` — prod overrides: gunicorn, Caddy, built frontend, resource limits, restart policies

Production start: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

## Container Build Strategy

### Frontend
- **Development stage**: Node.js base, installs dependencies, runs React dev server.
- **Production stage**: Installs dependencies, runs `npm run build`, outputs static files.

### Backend
- **Development stage**: Python slim base, installs Poetry and dependencies, runs uvicorn with reload.
- **Production stage**: Same base, runs gunicorn with uvicorn workers, no reload.

## Deployment Workflow

Deployment is a simple SSH + Docker Compose pull:

1. Push code to GitHub
2. SSH into the VPS (or trigger via GitHub Actions)
3. `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

No container registry needed for a single-server setup — images are built on the server. If a registry is desired later, switch to `docker compose pull` + `up -d`.

## Backups

- A cron job on the VPS runs `pg_dump` daily and writes to a local directory
- Optionally sync backups to S3-compatible storage (e.g., Hetzner Object Storage, ~$0.01/GB)

## Environment Configuration

### Backend
- `DATABASE_URL` — async PostgreSQL connection string
- `CONFIG_PATH` — path to YAML configuration file (mounted volume)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` / `SESSION_SECRET` — admin
  login credentials and cookie-signing secret (replaced the legacy
  `ACCESS_KEY` in 2026-05; see `backend/scripts/hash_password.py`)
- LLM API keys referenced via `${VAR}` interpolation in the YAML config

### Frontend
- `REACT_APP_API_URL` — backend API base URL (baked in at build time)

### Production `.env` example

```
DATABASE_URL=postgresql+asyncpg://genai:secret@db:5432/genai
CONFIG_PATH=/app/config/experiment.yml
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$...
SESSION_SECRET=<32-byte hex>
OPENAI_API_KEY=sk-...
```
