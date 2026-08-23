# [DONE] Admin response flags with comments

Adds an admin-only way to flag an individual bot response from inside the chat, attach a free-text comment to it, and review every flag from a dedicated admin page with a full-conversation detail view.

## Motivation

Operators watching a session notice bad responses in the moment — a hallucination, a refusal, an off-persona answer. Today there is nowhere to record that observation: `feedback` on `chat_messages_v1` is participant preference data with a fixed category vocabulary from the YAML config, and the CSV export is the only way out. The observation gets lost, or ends up in a side channel with no link back to the conversation that produced it.

Flags are an operator-side annotation layer: written by a logged-in admin, never visible to participants, and reviewable in one place with the context that produced the flagged answer.

## Decisions

| Question | Decision |
|---|---|
| What does a flag attach to? | **A single bot response.** In a comparison or parallel turn each response card carries its own flag, so a rejected response can be flagged too. |
| Who can flag? | **Logged-in admins only.** The icon renders only when `useAdmin()` reports `authenticated`; every endpoint is behind `require_admin_session`. |
| Where is the review UI? | **A new `/admin/flags` route**, linked from `/admin`. Keeps the config page uncluttered. |
| Flag lifecycle | **Edit the comment** and **mark resolved**. No delete — a flag is a record, not a scratchpad. |
| Storage | **New table `response_flags_v1`.** `create_all` materialises new tables, so no Alembic and no DDL risk. |
| Identity of a flagged response | **`(session_id, message_index, response_index)`**, not a FK to `chat_messages_v1.id`. |

## Why a logical key, not a foreign key

`POST /api/messages` (`routes/sessions.py:37-63`) saves a turn by delete-then-insert on `(session_id, index)`. A turn is re-saved whenever the user selects a response or confirms feedback, so `chat_messages_v1.id` is *not* stable across the life of a message — a FK would dangle after the first selection. The `(session_id, index)` pair is stable and is already the table's uniqueness constraint, so the flag keys off it and resolves the row at read time.

`response_index` is the position inside an assistant turn:

- comparison / parallel turns — the index into the `content` array, i.e. which bot answered;
- single-bot streaming turns — always `0`.

## Snapshot on write

The flag stores `response_text` and `bot_name` copied from the response at flag time. Two reasons:

1. The list view renders without joining the transcript.
2. Flagging works even when `log` is off. In that case the message was never persisted, so the detail view has no transcript to show — the snapshot is all that survives, and the detail view says so explicitly rather than rendering an empty conversation.

## Data model

New table, `response_flags_v1`:

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `session_id` | str, indexed | |
| `message_index` | int | `chat_messages_v1.index` of the assistant turn |
| `response_index` | int, default 0 | which response within the turn |
| `bot_name` | str, nullable | snapshot |
| `response_text` | text, nullable | snapshot |
| `comment` | text | admin's note, may be empty |
| `resolved` | bool, default false | |
| `created_by` | str(64), nullable | admin username from the session cookie |
| `created_at` / `updated_at` | timestamptz | |

Unique constraint `uq_flag_session_message_response` on `(session_id, message_index, response_index)` — one flag per response. Re-flagging the same response updates the existing row rather than creating a duplicate.

## API

All routes live in a new `backend/app/routes/flags.py`, mounted at `/api/admin/flags`, every one gated by `Depends(require_admin_session)`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/flags` | Upsert a flag on `(session_id, message_index, response_index)`. Body carries the snapshot + comment. Returns the flag. |
| `GET` | `/api/admin/flags` | List flags, newest first. Query: `status=all\|open\|resolved` (default `all`), `session_id` (optional filter), `limit`, `offset`. |
| `PATCH` | `/api/admin/flags/{id}` | Partial update: `comment`, `resolved`. |
| `GET` | `/api/admin/flags/{id}/context` | The flag plus the full ordered transcript of its session and the session metadata. |

`GET /api/admin/flags?session_id=…` is what the chat page calls on load so already-flagged responses render with a filled icon.

The context response shape:

```json
{
  "flag": { ...FlagResponse... },
  "session": { "session_id": "…", "user_id": "…", "feedback_config_name": "…", "created_at": "…" },
  "messages": [ { "index": 0, "role": "user", "content": …, "bot_ids": [], "feedback": [], "selected": null, "timestamp": "…" } ]
}
```

`session` is `null` and `messages` is `[]` when the session was never logged.

## Frontend

**Chat surface.** `ChatPage` gains `useAdmin()` for the `authenticated` flag and a `useFlags(sessionId, enabled)` hook holding a `Map` keyed `"{message_index}:{response_index}"`. `MessageList` takes `adminMode`, `flags`, and `onFlag`, and renders a `FlagButton` on every **assistant** response — the resolved-comparison card, each parallel column, each pending comparison card, and the plain single response. Never on user messages, never while a response is still streaming.

Clicking opens a small popover with a textarea prefilled from the existing comment, a Save button, and — for an already-saved flag — a resolved toggle. The icon is outlined when unflagged, filled when flagged, and dimmed when the flag is resolved.

**Admin page.** New `pages/AdminFlags.js` at `/admin/flags`, same auth gate and Tailwind idiom as `pages/Admin.js`. A list of flags (time, bot, session, comment, response snippet, resolved state) with an open/resolved/all filter. Selecting a row opens the detail view, which fetches `/context` and renders the whole conversation up to and including the flagged turn, with the flagged response highlighted, plus inline comment editing and the resolve toggle. `/admin` links to it.

**Mock layer.** `services/mockApi.js` gets in-memory equivalents so `REACT_APP_MOCK_API=true` keeps working.

## Out of scope

- Deleting flags (per decision above).
- Exporting flags to CSV — the existing export endpoints are untouched.
- Participant-visible flagging.

## Task breakdown

1. **Backend** — `ResponseFlag` model, Pydantic schemas, `routes/flags.py`, router registration, tests in `backend/tests/test_flags.py`.
2. **Frontend chat** — `api.js` + `mockApi.js` clients, `useFlags` hook, `FlagButton`, `MessageList` / `ChatPage` wiring.
3. **Frontend admin** — `pages/AdminFlags.js`, route in `App.js`, link from `pages/Admin.js`.

## Verification

Implemented 2026-08-23.

- Backend: `99 passed` (`backend/.venv/bin/python -m pytest -q`) — 85 pre-existing plus 14 new in `tests/test_flags.py`. `black` / `isort` / `flake8` clean on every touched file.
- Frontend: `40 passed, 1 failed` (`CI=true npx craco test --watchAll=false`), 22 of them new. The single failure is `App.test.js › renders chat page with header`, which asserts on the string `GenAI Chat` — removed when the header became the icon-only corner cluster. Confirmed pre-existing by re-running the suite on a stashed tree; unrelated to this change.
- `npx craco build` succeeds. Under `CI=true` it fails on two eslint warnings in `components/effects/SimultaneousEntropyMessage.js`, also pre-existing on `dev` and in a file this change does not touch.

Two behaviours settled during implementation and worth knowing:

- The flag control is suppressed on a message that is mid-eviction (`evict` true) in the two canvas-rendered branches, so a button never outlives the dissolve animation.
- `FlagButton` closes its popover immediately on Save rather than awaiting the round-trip; `useFlags` owns the pending and error state.
