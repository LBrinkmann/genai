# GenAI — RLHF Data Collection Platform

## Project Overview

A research platform for collecting Reinforcement Learning from Human Feedback (RLHF) data through multi-bot conversational interfaces. Users chat with multiple AI bots simultaneously, compare side-by-side responses, and provide structured preference feedback. All interactions are logged for later analysis and model training.

## Architecture

Two-tier architecture:

1. **Chat Frontend** — React 19 SPA for participants to chat, compare bot responses, and give feedback
2. **Backend API** — FastAPI (Python 3.13, async) acting as hub between frontend, PostgreSQL, and external LLM providers
3. **Database** — PostgreSQL with SQLAlchemy 2.x async ORM (AsyncPG driver)

Bot and feedback configurations are defined in YAML files and loaded by the backend at startup — no admin UI. The backend proxies all LLM requests; the frontend never calls LLM APIs directly.

## Tech Stack

### Frontend
- React 19, functional components + hooks
- React Router v7
- Material-UI (MUI) v6 with Emotion CSS-in-JS
- Create React App (React Scripts)
- Socket.IO client (available, not yet active in chat flow)
- JavaScript (JSX)

### Backend
- FastAPI on Uvicorn (ASGI)
- HTTPX for async outbound LLM requests
- YAML config loading (bots, feedback schemes)
- Python-SocketIO (partially integrated)
- Poetry for dependency management
- Python 3.13

### Database
- PostgreSQL (latest)
- SQLAlchemy 2.x async + AsyncPG
- Async session factory with connection pooling

### Infrastructure
- Docker Compose for local dev (hot-reload) and production (override file)
- Multi-stage Dockerfiles (dev + prod)
- Caddy for production reverse proxy, static file serving, and automatic TLS
- Single VPS deployment (Hetzner CX22 or similar)
- Deploy via SSH + `git pull` + `docker compose up --build` (or GitHub Actions)

## Data Model

Two database tables (names include version suffix for schema evolution):

- **Chat Messages** — all messages with bot IDs (JSON), user/session IDs, index, role, content (JSON), feedback (JSON), timestamp
- **Sessions** — session UUID, user ID, feedback config name, created_at

Bot and feedback configurations live in YAML files, not in the database. Duplicate messages are prevented by session ID + index uniqueness.

## Key Patterns

- **YAML config**: Bots and feedback schemes defined in YAML, loaded at startup; env var interpolation for secrets (`${API_KEY}`)
- **RLHF mode**: Two bots respond in parallel; user selects preferred response; only selected response enters conversation history
- **LLM proxy**: Backend resolves bot config from YAML, injects system prompt, forwards to OpenAI-compatible API, returns response
- **Auto-scaling tolerance**: Configurable timeouts (up to 10 min) for 503 responses from scale-to-zero endpoints
- **Session identity**: Browser-local random user ID (no accounts for participants); UUID session IDs from server
- **CSV export**: Streaming responses for all messages, per-session messages, and session summaries

## Environment Variables

### Backend
- Database connection string (async PostgreSQL URL)
- Config file path (`CONFIG_PATH`) pointing to YAML configuration
- Admin credentials (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`) for the cookie-session admin login that gates reset and LLM endpoint controls. The old `ACCESS_KEY` / `?key=` flow has been replaced.

### Frontend
- Backend API base URL
- Backend Socket URL

## Project Status

Greenfield — project description docs exist in `doc/plans/`, no implementation code yet.

## Detailed Specs

Full project description lives in `doc/plans/`:
- `01-overview.md` — purpose, capabilities, user roles, workflow
- `02-tech-stack.md` — full technology choices and architecture pattern
- `03-frontend-chat-interface.md` — chat UI layout, RLHF comparison, feedback, session management
- `04-configuration.md` — YAML config format for bots and feedback schemes
- `05-backend-api.md` — all API endpoints, LLM proxy architecture, async design
- `06-data-model.md` — table schemas, relationships, constraints
- `07-realtime-and-integrations.md` — WebSocket layer (partial), LLM integration protocol, CORS
- `08-infrastructure.md` — Docker Compose (dev + prod), Caddy, container builds, environment config
- `09-deployment-options.md` — single VPS deployment with Docker Compose and Caddy
