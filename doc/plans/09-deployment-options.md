# Deployment: Single VPS with Docker Compose and Caddy

## Overview

The application runs on a single cloud VPS using the same Docker Compose setup as local development, with a production override file. Caddy serves as the reverse proxy and static file server, handling TLS automatically.

## Server

A small VPS is sufficient for this workload (low-traffic research tool):

- **Provider**: Hetzner (or DigitalOcean, Vultr — any cheap VPS provider)
- **Recommended spec**: 2 vCPU, 4 GB RAM, 40 GB disk (Hetzner CX22)
- **Cost**: ~$5–7/month
- **OS**: Ubuntu 24.04 LTS

## Initial Server Setup

1. Provision VPS, set up SSH key access, disable password auth
2. Install Docker and Docker Compose plugin
3. Clone the repository
4. Create `.env` file with production secrets
5. Create/edit the YAML experiment configuration
6. Start services: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
7. Point DNS A records for `chat.example.com` and `api.example.com` to the server IP
8. Caddy auto-provisions TLS certificates on first request

## Why Caddy

Caddy replaces Nginx as the reverse proxy because:

- **Automatic HTTPS**: provisions and renews Let's Encrypt certificates with zero configuration — no certbot, no cron, no manual renewal
- **Minimal config**: the entire reverse proxy + static file server config is ~10 lines
- **Built-in SPA support**: `try_files {path} /index.html` handles client-side routing

## Updating the Application

```bash
ssh server
cd /opt/genai
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

To update only the experiment configuration (no rebuild needed):
```bash
# edit config/experiment.yml on the server
docker compose restart backend
```

## Updating via GitHub Actions (Optional)

A simple GitHub Actions workflow can automate deployment on push to `dev`:

```yaml
on:
  push:
    branches: [dev]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: |
          ssh ${{ secrets.SERVER }} \
            "cd /opt/genai && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
```

## Backups

- Daily `pg_dump` via cron on the VPS, writing to `/opt/genai/backups/`
- Optional: sync to Hetzner Object Storage or any S3-compatible bucket (~$0.01/GB)
- Retention: keep last 30 daily backups, rotate older ones

## Monitoring

For a small research tool, minimal monitoring is sufficient:

- `docker compose logs -f` for live debugging
- `docker compose ps` to check service health
- Optional: set up a simple uptime check (e.g., UptimeRobot free tier) that pings the health endpoint

## Scaling Notes

This setup handles the expected load (dozens of concurrent users in controlled experiments) with room to spare. If significantly more capacity is needed in the future, the options are:

1. Upgrade the VPS (vertical scaling — takes minutes)
2. Add gunicorn workers in the backend container
3. For truly high traffic, split services across multiple servers — but this is unlikely for a research tool
