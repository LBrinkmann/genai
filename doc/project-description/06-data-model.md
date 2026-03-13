# Data Model

The application uses a relational database with four core tables. Table names include a version suffix to support schema evolution without migrations.

## Chat Messages

Stores every message exchanged in the system.

| Field | Type | Description |
|-------|------|-------------|
| ID | Integer (PK) | Auto-incrementing primary key |
| Bot IDs | JSON | Array of bot identifiers associated with this message (for assistant messages, identifies which bot(s) generated it) |
| User ID | String (indexed) | The browser-generated identifier of the participant |
| Session ID | String (indexed) | The UUID of the session this message belongs to |
| Index | Integer | The position of this message within the conversation (0-based) |
| Role | String | Either "user" or "assistant" |
| Content | JSON | The message text, stored as JSON to support structured content (e.g., multiple response variants) |
| Feedback | JSON | Array of feedback tags applied to this message (defaults to empty array) |
| Timestamp | DateTime | When the message was created (defaults to UTC now) |

## Sessions

Tracks individual conversation sessions.

| Field | Type | Description |
|-------|------|-------------|
| ID | Integer (PK) | Auto-incrementing primary key |
| Session ID | String (unique, indexed) | UUID generated when the session is created |
| User ID | String (indexed) | The participant who owns this session |
| Feedback Config ID | Integer | References the feedback configuration used for this session |
| Created At | DateTime | When the session started (defaults to UTC now) |

## Bot Configurations

Defines the available language model bots.

| Field | Type | Description |
|-------|------|-------------|
| ID | Integer (PK) | Auto-incrementing primary key |
| Bot Name | String (unique, indexed) | Human-readable identifier for the bot |
| LLM Model | String | The model identifier passed to the LLM API (e.g., a model version string) |
| API URL | String | The endpoint URL of the external LLM service |
| System Message | String | The system prompt prepended to all conversations with this bot |
| API Key | String | Authentication credential for the external LLM service |

A default bot configuration is seeded on first run, pointing to a standard commercial LLM API.

## Feedback Configurations

Defines experiment setups — which bots to compare and what feedback to collect.

| Field | Type | Description |
|-------|------|-------------|
| Feedback Config ID | Integer (PK) | Auto-incrementing primary key |
| Feedback Name | String (unique, indexed) | Human-readable name for this configuration |
| Bot List | JSON | Array of bot IDs to include in this experiment |
| Main Preference Feedback | String | The label text shown when a user selects their preferred response |
| Additional Feedback Categories | JSON | Array of category labels for optional fine-grained feedback |

A default feedback configuration is seeded on first run with a single bot and a standard preference label.

## Relationships and Constraints

- Sessions reference feedback configurations by ID (logical foreign key, not enforced at the database level).
- Messages reference sessions by session ID string (logical foreign key).
- Messages reference bots by ID array in a JSON field (no referential integrity enforcement).
- Uniqueness is enforced on bot names, session IDs, and feedback configuration names.
- The duplicate prevention logic for messages operates on the combination of session ID and message index — if a message with the same pair exists, it is replaced.
