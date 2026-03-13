# Configuration: YAML-Based Experiment Setup

All experiment configuration — bots, feedback schemes, and their relationships — is defined in YAML files and loaded by the backend at startup. There is no admin UI or runtime CRUD for configuration.

## Configuration File Structure

A single YAML configuration file (or a directory of files) defines the full experiment setup. The backend reads these on startup and holds them in memory.

### Bot Configurations

Each bot entry defines a language model endpoint:

```yaml
bots:
  - name: "gpt-4"
    model: "gpt-4"
    api_url: "https://api.openai.com/v1/chat/completions"
    api_key: "${OPENAI_API_KEY}"  # supports env var interpolation
    system_message: "You are a helpful assistant."

  - name: "llama-local"
    model: "llama-3.1-70b"
    api_url: "http://localhost:8080/v1/chat/completions"
    api_key: ""
    system_message: "You are a helpful assistant."
```

Fields:
- **name** (unique, required): Human-readable identifier for the bot
- **model** (required): The model identifier passed to the LLM API
- **api_url** (required): The endpoint URL of the external LLM service
- **api_key** (optional): Authentication credential; supports `${ENV_VAR}` interpolation so secrets stay out of the file
- **system_message** (optional): The system prompt prepended to all conversations with this bot

### Feedback Configurations

Each feedback entry defines an experiment setup — which bots to compare and what feedback to collect:

```yaml
feedback_configs:
  - name: "gpt4-vs-llama"
    bots: ["gpt-4", "llama-local"]
    main_preference_feedback: "I select this option"
    additional_categories:
      - "More helpful"
      - "More accurate"
      - "Better tone"

  - name: "single-bot-test"
    bots: ["gpt-4"]
    main_preference_feedback: ""
    additional_categories: []
```

Fields:
- **name** (unique, required): Identifier for the feedback scheme, referenced by URL parameter in the chat interface
- **bots** (required): List of bot names (must match names defined in the bots section)
- **main_preference_feedback** (optional): Label text shown when a user selects their preferred response
- **additional_categories** (optional): List of category labels for optional fine-grained feedback tags

## Environment Variable Interpolation

API keys and other secrets can reference environment variables using `${VAR_NAME}` syntax. The backend resolves these at startup, keeping secrets out of the YAML files and compatible with Docker/K8s secret injection.

## Startup Behavior

1. The backend reads the YAML configuration file(s) from a path specified by an environment variable (e.g., `CONFIG_PATH`).
2. Bot and feedback configurations are validated (unique names, bot references resolve, required fields present).
3. Validated configs are held in memory for the lifetime of the process.
4. If validation fails, the backend refuses to start and logs a clear error message.

## Updating Configuration

To change bot or feedback configurations, edit the YAML file and restart the backend. The config file is mounted as a Docker volume, so edits on the host are reflected after a container restart (`docker compose restart backend`).
