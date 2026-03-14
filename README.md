# GenAI — RLHF Data Collection Platform

A research platform for collecting Reinforcement Learning from Human Feedback (RLHF) data. Participants chat with multiple AI bots simultaneously, compare side-by-side responses, and provide structured preference feedback. All interactions are logged for later analysis.

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/LBrinkmann/genai.git
cd genai
cp .env.example .env
cp config/experiment.example.yml config/experiment.yml

# 2. Edit .env — at minimum, set your LLM API key
#    OPENAI_API_KEY=sk-...

# 3. Start
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

The chat interface is at **http://localhost:3000** and the API at **http://localhost:8000**.

## Configuration

Everything is configured through two files: `.env` for secrets/infrastructure, and a YAML file for experiment setup.

### Environment Variables (`.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://genai:genai@db:5432/genai` |
| `CONFIG_PATH` | Path to YAML config inside the container | `/app/config/experiment.yml` |
| `ACCESS_KEY` | Key that unlocks admin controls in the chat UI | `my-secret-key` |
| `OPENAI_API_KEY` | LLM API key (referenced in YAML config via `${OPENAI_API_KEY}`) | `sk-...` |
| `REACT_APP_API_URL` | Backend URL for the frontend (dev only) | `http://localhost:8000` |
| `CADDY_DOMAIN` | Chat frontend domain (production only) | `chat.example.com` |
| `CADDY_API_DOMAIN` | API domain (production only) | `api.example.com` |

### Experiment Configuration (YAML)

The YAML file at `config/experiment.yml` defines **bots** and **feedback configs**. It is loaded once when the backend starts.

#### Bots

Each bot points to an OpenAI-compatible chat completion API:

```yaml
bots:
  - name: "gpt-4o"
    model: "gpt-4o"
    api_url: "https://api.openai.com/v1/chat/completions"
    api_key: "${OPENAI_API_KEY}"
    system_message: "You are a helpful assistant."

  - name: "claude-sonnet"
    model: "claude-sonnet-4-20250514"
    api_url: "https://api.anthropic.com/v1/chat/completions"
    api_key: "${ANTHROPIC_API_KEY}"
    system_message: "You are a helpful assistant."

  - name: "local-llama"
    model: "llama-3.1-70b"
    api_url: "http://my-server:8080/v1/chat/completions"
    api_key: ""
    system_message: "You are a helpful assistant."
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique identifier for the bot |
| `model` | yes | Model ID passed to the LLM API |
| `api_url` | yes | Endpoint URL (must be OpenAI-compatible) |
| `api_key` | no | API key; use `${ENV_VAR}` to reference secrets from `.env` |
| `system_message` | no | System prompt prepended to every conversation |

#### Feedback Configs

Each feedback config defines an experiment — which bots to use and what feedback to collect:

```yaml
feedback_configs:
  # Single bot — regular chat, no comparison
  - name: "simple-chat"
    bots: ["gpt-4o"]
    main_preference_feedback: ""
    additional_categories: []

  # Two bots — RLHF comparison mode
  - name: "gpt4-vs-claude"
    bots: ["gpt-4o", "claude-sonnet"]
    main_preference_feedback: "I prefer this response"
    additional_categories:
      - "More helpful"
      - "More accurate"
      - "Better tone"
      - "More concise"
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique identifier, used in the chat URL |
| `bots` | yes | List of bot names (1 = regular chat, 2 = RLHF comparison) |
| `main_preference_feedback` | no | Label shown when a user selects their preferred response |
| `additional_categories` | no | Feedback tags the user can toggle after selecting a response |

#### How it works

- **1 bot** → regular chat interface, messages go back and forth
- **2 bots** → RLHF mode: both bots respond to each message, displayed side-by-side. The user clicks their preferred response, which then enters the conversation history for subsequent turns.

#### Defaults

Set default values for URL parameters so participants don't need to include them:

```yaml
defaults:
  config: "gpt4-vs-claude"   # which feedback config to load when no ?config= param
  log: true                   # persist messages when no ?log= param
```

| Field | Default | Description |
|-------|---------|-------------|
| `config` | `"default"` | Feedback config name used when `?config=` is not in the URL |
| `log` | `false` | Whether to persist messages when `?log=` is not in the URL |

URL parameters always override these defaults. For example, `?log=false` disables logging even if `defaults.log` is `true`.

### Secrets and `${ENV_VAR}` Interpolation

API keys in the YAML config can reference environment variables:

```yaml
api_key: "${OPENAI_API_KEY}"    # resolved from .env at startup
```

This keeps secrets out of the config file. Add any referenced variables to your `.env`.

### Applying Config Changes

After editing `config/experiment.yml`, restart the backend:

```bash
docker compose restart backend
```

The config is validated at startup — if something is wrong (duplicate names, missing fields, bot references that don't resolve), the backend will refuse to start and log what's wrong.

## Sharing with Participants

Send participants a URL with the config name:

```
http://localhost:3000/?config=gpt4-vs-claude
```

Optional URL parameters:

| Parameter | Effect |
|-----------|--------|
| `config=<name>` | Which feedback config to load (defaults to `defaults.config` in YAML, or `default`) |
| `log=true` | Enable message persistence (defaults to `defaults.log` in YAML, or `false`) |
| `key=<access-key>` | Unlock admin controls (reset button) if it matches `ACCESS_KEY` |

Example with all parameters:
```
https://chat.example.com/?config=gpt4-vs-claude&log=true&key=my-secret-key
```

## Data Export

The backend provides CSV export endpoints:

```bash
# All messages across all sessions
curl http://localhost:8000/api/export/messages -o messages.csv

# Messages for a specific session
curl http://localhost:8000/api/export/messages/SESSION_UUID -o session.csv

# Session summary (with message counts)
curl http://localhost:8000/api/export/sessions -o sessions.csv
```

## Production Deployment

See `doc/plans/09-deployment-options.md` for full details. The short version:

```bash
# On a VPS (Ubuntu)
./scripts/setup-server.sh    # installs Docker, clones repo, sets up cron backup
vim .env                     # set production values
vim config/experiment.yml    # set up your experiment

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy auto-provisions HTTPS certificates. Point your DNS A records to the server and set `CADDY_DOMAIN` / `CADDY_API_DOMAIN` in `.env`.

## Development

```bash
# Start dev environment (hot-reload on all services)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Run backend tests
cd backend && poetry install && poetry run pytest tests/ -v

# Run frontend tests
cd frontend && npm install && npm test -- --watchAll=false
```

## License

See [LICENSE](LICENSE) for details.
