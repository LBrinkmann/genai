# Data Model

The application uses a relational database with two core tables for runtime data. Table names include a version suffix to support schema evolution without migrations. Bot and feedback configurations are defined in YAML files, not stored in the database.

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
| Feedback Config Name | String | Name of the feedback configuration used for this session (references YAML config) |
| Created At | DateTime | When the session started (defaults to UTC now) |

## Relationships and Constraints

- Sessions reference feedback configurations by name (a string matching the YAML config name).
- Messages reference sessions by session ID string (logical foreign key).
- Messages reference bots by name in a JSON field (no referential integrity enforcement).
- Uniqueness is enforced on session IDs.
- The duplicate prevention logic for messages operates on the combination of session ID and message index — if a message with the same pair exists, it is replaced.
