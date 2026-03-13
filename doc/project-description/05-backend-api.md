# Backend: API and Business Logic

The backend is an async Python web application that serves as the central hub connecting the frontend applications, the database, and external LLM providers.

## API Surface

The backend exposes two groups of endpoints: public-facing endpoints used by the chat interface, and protected endpoints used by the admin dashboard.

### Public Endpoints

#### Configuration Retrieval

A GET endpoint returns the full experiment configuration for a given configuration name. The response includes:
- An access key for UI feature gating
- The list of assigned bots (with names and identifiers)
- The feedback configuration ID
- All feedback categories and the main preference feedback text

If the requested configuration does not exist, the endpoint returns a 404 error.

#### LLM Chat Proxy

A POST endpoint accepts a chat request containing a bot name and a message history. The backend:
1. Looks up the bot's configuration in the database (model, API URL, API key, system prompt).
2. Prepends the bot's system message to the conversation history.
3. Forwards the full message array to the configured external LLM API using an async HTTP client.
4. Returns the LLM's response to the frontend.

This endpoint supports a configurable timeout parameter for handling auto-scaling inference endpoints. When the external API returns a 503 (service unavailable), the frontend can retry with an extended timeout (up to 10 minutes) to wait for the model to spin up.

#### Session Creation

A POST endpoint creates a new session record in the database. It accepts a user identifier and a feedback configuration ID, generates a UUID for the session, and returns the session ID and creation timestamp.

#### Message Saving

A POST endpoint persists a chat message. It accepts:
- User ID, session ID, message index, role (user/assistant)
- Message content (stored as JSON to support structured data)
- Associated bot identifiers (as a JSON array)
- Feedback tags (as a JSON array)
- Timestamp

To prevent duplication, if a message with the same session ID and index already exists, it is deleted before the new one is inserted.

#### Data Export Endpoints

Three GET endpoints serve CSV downloads:
- **All messages**: Streams every stored message with full metadata as CSV.
- **Single session messages**: Streams messages for a specific session as CSV.
- **Sessions summary**: Streams a summary table of all sessions with message counts and time ranges.

These use streaming responses to handle potentially large datasets without loading everything into memory.

### Dashboard Endpoints

#### Authentication

A simple GET endpoint accepts username and password as path parameters and validates them against environment variables. Returns a success flag if credentials match.

#### Bot Configuration CRUD

A set of endpoints supports full lifecycle management of bot configurations:
- **List all**: Returns all bot configurations.
- **Get one**: Returns a specific bot configuration by name.
- **Create or update**: Accepts a bot configuration object. If marked as new, validates that the name is unique before creating. Otherwise, updates the existing record.
- **Delete**: Removes a bot configuration by name.

#### Feedback Configuration CRUD

Parallel endpoints manage feedback configurations:
- **List all**: Returns all feedback configurations.
- **Get one**: Returns a specific feedback configuration by name.
- **Create or update**: Accepts a feedback configuration with assigned bot list, preference text, and additional categories. Validates name uniqueness for new configs.
- **Delete**: Removes a feedback configuration by name.

#### Session Browsing

- **List sessions**: Returns all sessions for display in the dashboard.
- **Get session detail**: Returns a specific session with all its messages, ordered by message index.

## LLM Proxy Architecture

The backend's most critical role is acting as a proxy between the frontend and external LLM providers:

- **Credential Isolation**: API keys are stored in the database and never exposed to the frontend. The backend injects them into outbound requests.
- **System Prompt Injection**: Each bot has a configurable system message. The backend prepends this to the conversation history before forwarding, ensuring consistent bot behavior without relying on the frontend.
- **Provider Agnosticism**: The proxy targets any OpenAI-compatible chat completion API. By changing the API URL and key per bot, researchers can compare responses from different providers, models, or even self-hosted endpoints.
- **Error Handling for Auto-Scaling**: The proxy gracefully handles 503 responses, which are common when inference endpoints use scale-to-zero strategies. The configurable timeout allows the system to wait for cold starts.

## Async Architecture

The entire backend is built on async primitives:
- All database operations use async sessions via SQLAlchemy's async engine.
- Outbound HTTP calls to LLM APIs use an async HTTP client.
- The ASGI server processes requests concurrently, enabling efficient handling of parallel LLM requests (critical in RLHF mode where two responses are generated simultaneously).
