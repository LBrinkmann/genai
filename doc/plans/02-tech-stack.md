# Tech Stack

## Frontend Application

A single-page application for the chat interface:

- **Framework**: React 19 with functional components and hooks
- **Routing**: React Router v7
- **UI Library**: Material-UI (MUI) v6 with Emotion for CSS-in-JS styling
- **Build Tooling**: React Scripts (Create React App)
- **Real-Time Communication**: Socket.IO client (available but not actively used in the primary chat flow)
- **Language**: JavaScript (JSX)

## Backend

- **Framework**: FastAPI (Python) — a modern, async-first web framework
- **ASGI Server**: Uvicorn
- **HTTP Client**: HTTPX for async outbound requests to external LLM APIs
- **WebSocket Layer**: Python-SocketIO (server-side, partially integrated)
- **Configuration**: YAML files for bot and feedback scheme definitions, loaded at startup
- **Dependency Management**: Poetry
- **Python Version**: 3.13

## Database

- **Engine**: PostgreSQL (latest)
- **ORM**: SQLAlchemy 2.x with async support
- **Connection Driver**: AsyncPG for non-blocking database access
- **Connection Strategy**: Async session factory with connection pooling

## External Integrations

- **LLM Providers**: Any OpenAI-compatible chat completion API (configurable per bot — supports OpenAI, self-hosted models, or any provider exposing the same interface)
- **API Key Management**: Per-bot API keys defined in YAML config, injected into outbound requests by the backend

## Containerization and Deployment

- **Local Development**: Docker Compose with hot-reload for all services (frontend, backend, database)
- **Container Builds**: Multi-stage Dockerfiles with separate development and production stages
- **Production Reverse Proxy**: Caddy — serves the built React app as static files, reverse proxies the API, and auto-provisions TLS certificates via Let's Encrypt
- **Production Deployment**: Single VPS running Docker Compose (production override file)
- **CI/CD**: Simple deploy script (`ssh` + `docker compose pull` + `docker compose up -d`) or GitHub Actions

## Architecture Pattern

The system follows a two-tier architecture:

1. **Presentation Layer**: A React SPA (chat interface) communicates with the backend via REST API calls.
2. **Application Layer**: A FastAPI backend handles business logic, proxies LLM requests, manages sessions, and loads experiment configuration from YAML files at startup.
3. **Data Layer**: PostgreSQL stores runtime state — messages and sessions. Static configuration (bots, feedback schemes) lives in YAML files.

The backend acts as a **proxy** between the frontend and external LLM providers. The frontend never calls LLM APIs directly; instead, it sends requests to the backend, which resolves the appropriate bot configuration, injects system prompts, and forwards the request to the configured LLM endpoint. This architecture allows centralized credential management and request shaping.
