# Tech Stack

## Frontend Applications

Two separate single-page applications are built with the same core technology:

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
- **Dependency Management**: Poetry
- **Python Version**: 3.13

## Database

- **Engine**: PostgreSQL (latest)
- **ORM**: SQLAlchemy 2.x with async support
- **Connection Driver**: AsyncPG for non-blocking database access
- **Connection Strategy**: Async session factory with connection pooling

## External Integrations

- **LLM Providers**: Any OpenAI-compatible chat completion API (configurable per bot — supports OpenAI, self-hosted models, or any provider exposing the same interface)
- **API Key Management**: Per-bot API keys stored in the database, injected into outbound requests

## Containerization and Orchestration

- **Local Development**: Docker Compose with hot-reload for all services (frontend, dashboard, backend, database)
- **Container Builds**: Multi-stage Dockerfiles with separate development and production stages
- **Production Web Server**: Nginx serves the built React apps as static files in production
- **Orchestration**: Kubernetes with Helm charts for production deployment
- **CI/CD**: GitLab CI with child pipelines per service — builds container images, pushes to a container registry, and deploys via Helm

## Architecture Pattern

The system follows a classic three-tier architecture:

1. **Presentation Layer**: Two React SPAs (chat interface + admin dashboard) communicate with the backend via REST API calls.
2. **Application Layer**: A FastAPI backend handles business logic, proxies LLM requests, manages sessions, and serves both the chat and admin APIs.
3. **Data Layer**: PostgreSQL stores all persistent state — messages, sessions, bot configurations, and feedback configurations.

The backend acts as a **proxy** between the frontend and external LLM providers. The frontend never calls LLM APIs directly; instead, it sends requests to the backend, which resolves the appropriate bot configuration, injects system prompts, and forwards the request to the configured LLM endpoint. This architecture allows centralized credential management and request shaping.
