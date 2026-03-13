# GenAI — RLHF Data Collection Platform

## Project Overview

A research platform for collecting Reinforcement Learning from Human Feedback (RLHF) data through multi-bot conversational interfaces. Users chat with multiple AI bots simultaneously, compare side-by-side responses, and provide structured preference feedback. All interactions are logged for later analysis and model training.

## Architecture

Three-tier architecture:

1. **Chat Frontend** — React 19 SPA for participants to chat, compare bot responses, and give feedback
2. **Admin Dashboard** — React 19 SPA for researchers to configure bots, design feedback schemes, review sessions, and export data
3. **Backend API** — FastAPI (Python 3.13, async) acting as hub between frontends, PostgreSQL, and external LLM providers
4. **Database** — PostgreSQL with SQLAlchemy 2.x async ORM (AsyncPG driver)

The backend proxies all LLM requests — frontends never call LLM APIs directly. This centralizes credential management and system prompt injection.

## Tech Stack

### Frontend (both apps)
- React 19, functional components + hooks
- React Router v7
- Material-UI (MUI) v6 with Emotion CSS-in-JS
- Create React App (React Scripts)
- Socket.IO client (available, not yet active in chat flow)
- JavaScript (JSX)

### Backend
- FastAPI on Uvicorn (ASGI)
- HTTPX for async outbound LLM requests
- Python-SocketIO (partially integrated)
- Poetry for dependency management
- Python 3.13

### Database
- PostgreSQL (latest)
- SQLAlchemy 2.x async + AsyncPG
- Async session factory with connection pooling

### Infrastructure
- Docker Compose for local dev (hot-reload on all services)
- Multi-stage Dockerfiles (dev + prod)
- Nginx for serving production frontend builds
- Kubernetes + Helm for production
- GitLab CI with child pipelines per service

## Data Model

Four core tables (names include version suffix for schema evolution):

- **Chat Messages** — all messages with bot IDs (JSON), user/session IDs, index, role, content (JSON), feedback (JSON), timestamp
- **Sessions** — session UUID, user ID, feedback config ID, created_at
- **Bot Configurations** — bot name (unique), LLM model, API URL, system message, API key
- **Feedback Configurations** — name (unique), bot list (JSON), main preference feedback text, additional categories (JSON)

Relationships are logical (not FK-enforced). Duplicate messages are prevented by session ID + index uniqueness.

## Key Patterns

- **RLHF mode**: Two bots respond in parallel; user selects preferred response; only selected response enters conversation history
- **LLM proxy**: Backend resolves bot config, injects system prompt, forwards to OpenAI-compatible API, returns response
- **Auto-scaling tolerance**: Configurable timeouts (up to 10 min) for 503 responses from scale-to-zero endpoints
- **Session identity**: Browser-local random user ID (no accounts for participants); UUID session IDs from server
- **CSV export**: Streaming responses for all messages, per-session messages, and session summaries
- **Auth**: Dashboard uses simple env-var username/password check; no RBAC

## Environment Variables

### Backend
- Database connection string (async PostgreSQL URL)
- Default LLM API key, endpoint, model (seeds initial bot config)
- Dashboard auth credentials (username, password)
- Access key for frontend feature gating

### Frontends
- Backend API base URL
- Backend Socket URL

## Project Status

Greenfield — project description docs exist in `doc/project-description/`, no implementation code yet.

## Detailed Specs

Full project description lives in `doc/project-description/`:
- `01-overview.md` — purpose, capabilities, user roles, workflow
- `02-tech-stack.md` — full technology choices and architecture pattern
- `03-frontend-chat-interface.md` — chat UI layout, RLHF comparison, feedback, session management
- `04-frontend-admin-dashboard.md` — admin auth, session browser, bot/feedback config CRUD, data export
- `05-backend-api.md` — all API endpoints (public + dashboard), LLM proxy architecture, async design
- `06-data-model.md` — table schemas, relationships, constraints
- `07-realtime-and-integrations.md` — WebSocket layer (partial), LLM integration protocol, CORS
- `08-infrastructure.md` — Docker, CI/CD, Kubernetes, environment config
