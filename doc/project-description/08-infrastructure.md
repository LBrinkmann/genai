# Infrastructure and Deployment

## Local Development Environment

The local development setup uses Docker Compose to orchestrate four services:

1. **Backend**: The Python API server runs with hot-reload enabled, mounting the source code as a volume so changes are reflected immediately. Exposed on a dedicated port.
2. **Chat Frontend**: The React development server for the chat interface, also with hot-reload and source mounting. Exposed on its own port.
3. **Admin Dashboard**: A separate React development server for the admin interface, running on a third port. Shares the same codebase pattern as the chat frontend.
4. **Database**: A PostgreSQL instance with a persistent named volume to retain data across container restarts.

All services share a Docker network for inter-service communication. Environment variables are passed through the compose file, including database connection strings, LLM API credentials, and dashboard authentication details.

## Container Build Strategy

Each service uses a multi-stage Dockerfile:

### Frontend / Dashboard Build
- **Development stage**: Node.js base image, installs dependencies, runs the React dev server.
- **Production build stage**: Installs dependencies and runs the production build, generating optimized static assets.
- **Production serve stage**: Nginx base image serving the built static files. A custom Nginx configuration handles single-page application routing (all paths fall through to the index page).

### Backend Build
- **Development stage**: Python slim base image, installs Poetry and dependencies, runs the ASGI server with reload.
- **Production stage**: Same base, but runs without reload and with production-appropriate settings.

## CI/CD Pipeline

The continuous integration and deployment pipeline uses a parent-child pipeline architecture:

1. **Parent Pipeline**: Defines the overall structure and triggers child pipelines for each service.
2. **Child Pipelines** (one per service): Each handles building a Docker image, pushing it to a container registry, and deploying via Helm to a Kubernetes cluster.
3. **Build Stage**: Constructs production Docker images and tags them with the commit SHA.
4. **Deploy Stage**: Uses Helm to upgrade (or install) the service in a Kubernetes namespace, passing environment-specific configuration as Helm values.

## Production Architecture

In production, the system runs on Kubernetes:

- Each service (backend, chat frontend, admin dashboard) runs as a separate Kubernetes deployment.
- Frontend services serve static files via Nginx containers.
- The backend runs the ASGI server directly.
- Resource limits are configured (memory requests and limits) to ensure stable operation in a shared cluster.
- Each service is exposed via its own ingress with TLS termination, providing HTTPS access on dedicated subdomains.
- Environment variables (database URLs, API keys, credentials) are injected via CI/CD variable management, keeping secrets out of the repository.

## Environment Configuration

The application relies on environment variables for all deployment-specific configuration:

### Backend
- Database connection string (async PostgreSQL URL)
- Default LLM API key, endpoint, and model (used for seeding the initial bot configuration)
- Dashboard authentication credentials (username and password)
- Access key for frontend feature gating

### Frontend Applications
- Backend API base URL (for REST calls)
- Backend Socket URL (for WebSocket connections, if used)

This environment-based configuration means the same container images can be deployed across different environments (development, staging, production) by simply changing the injected variables.
