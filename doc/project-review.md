# Project Review -- GenAI RLHF Platform

**Date:** 2026-03-14
**Reviewer:** Automated audit (Claude Opus 4.6)
**Branch:** `dev` (commit `15cf396`)

## Executive Summary

The GenAI RLHF platform is a well-structured, small-scale research tool with clean separation between backend and frontend. The core functionality -- YAML-driven configuration, LLM proxying, RLHF comparison flow, and CSV export -- is correctly implemented and covered by passing tests. However, the project has one **critical** security issue (the ACCESS_KEY is leaked to every frontend user via the config API) and several high-severity concerns around missing authentication on export/admin endpoints, a stale `messages` closure bug in the React chat hook, and the `selected` field being silently dropped on save. The codebase is production-viable after addressing the critical and high-severity items below.

## Test Results

### Backend (`poetry run pytest tests/ -v`)

```
23 passed, 152 warnings in 0.47s
```

All 23 tests pass. Warnings are all asyncio deprecation notices from pytest-asyncio on Python 3.14 (harmless, will need updating when Python 3.16 removes the deprecated APIs).

### Frontend (`npm test -- --watchAll=false`)

```
3 passed, 0 failed
```

All 3 tests pass. Console warnings about React Router v6 deprecation flags (`v7_startTransition`, `v7_relativeSplatPath`) and `act(...)` wrapping are present but non-blocking.

### Docker Compose

Both `docker-compose.yml + docker-compose.dev.yml` and `docker-compose.yml + docker-compose.prod.yml` validate successfully via `docker compose config`.

---

## Findings by Severity

### Critical (must fix before production use)

#### C1. ACCESS_KEY leaked to all users via `/api/config/{name}`

**File:** `/Users/brinkmann/repros/genai/backend/app/routes/config.py`, line 37

```python
access_key=os.environ.get("ACCESS_KEY"),
```

The server's `ACCESS_KEY` environment variable is returned verbatim in every `/api/config/{name}` response. Any user can open DevTools, inspect the network response, read the `access_key` field, and append `?key=<value>` to their URL to gain admin controls (conversation reset). This defeats the entire purpose of the access key gating.

**Fix:** Remove `access_key` from the `ConfigResponse` schema and the endpoint. Instead, validate the key server-side: add a dedicated endpoint (e.g., `POST /api/auth/validate-key`) that accepts the key and returns a boolean, or simply check the key on the backend when admin actions are requested.

#### C2. Real API keys committed in `.env` (local only, not in git)

**File:** `/Users/brinkmann/repros/genai/.env`, lines 11, 24, 27, 29

The local `.env` file contains real production API keys:
- An OpenAI API key (`sk-proj-9fIU0_...`)
- A Hetzner API token
- Two Hugging Face tokens

While `.env` is in `.gitignore` and not tracked by git, anyone with read access to the development machine can extract these. The `HETZNER_API_TOKEN` is especially dangerous as it provides infrastructure-level access.

**Recommendation:** Rotate all four keys immediately. Consider using a secrets manager or at minimum ensure the dev machine has restricted access. The `HETZNER_API_TOKEN` is not referenced anywhere in the application code and should be removed from `.env` entirely.

---

### High (should fix soon)

#### H1. No authentication on export endpoints

**Files:**
- `/Users/brinkmann/repros/genai/backend/app/routes/export.py`, lines 71-97, 144-153

The endpoints `/api/export/messages`, `/api/export/messages/{session_id}`, and `/api/export/sessions` are completely unauthenticated. Anyone who discovers the URL can download all conversation data, including user IDs and message content. For a research platform handling potentially sensitive interactions, this is a significant data exposure risk.

**Fix:** Add API key authentication (e.g., require `ACCESS_KEY` as a Bearer token or query parameter) for all export endpoints.

#### H2. No authentication on session/message creation

**Files:**
- `/Users/brinkmann/repros/genai/backend/app/routes/sessions.py`, lines 17-62

Any client can create sessions and save messages with arbitrary `user_id` values. There is no validation that the `user_id` in a message matches the session's `user_id`, meaning one user could inject messages into another user's session. The `save_message` endpoint uses DELETE + INSERT (lines 43-48) which means any client can overwrite any message in any session.

**Fix:** At minimum, validate that the `user_id` on a message matches the session's `user_id`. Consider adding session tokens.

#### H3. Stale closure in `useChat.sendMessage` causes message loss risk

**File:** `/Users/brinkmann/repros/genai/frontend/src/hooks/useChat.js`, line 69

```javascript
const userMsg = {
  // ...
  index: messages.length,
```

`sendMessage` captures `messages` from the closure. If a user sends two messages rapidly before the first completes, the second message will use a stale `messages` array, potentially assigning the same `index` and overwriting the first message (since the backend does DELETE + INSERT on session_id + index). The `setMessages` call on line 74 also spreads from the stale `messages` rather than using the functional updater form.

**Fix:** Use the functional updater pattern (`setMessages(prev => ...)`) and derive the index from the previous state, not the closure.

#### H4. `selected` field silently dropped on save

**Files:**
- `/Users/brinkmann/repros/genai/frontend/src/hooks/useChat.js`, lines 160-169 (sends `selected: botIndex`)
- `/Users/brinkmann/repros/genai/frontend/src/pages/ChatPage.js`, line 84 (sends `selected: msg.selected`)
- `/Users/brinkmann/repros/genai/backend/app/schemas.py`, lines 37-47 (`MessageSave` has no `selected` field)
- `/Users/brinkmann/repros/genai/backend/app/models.py`, lines 16-44 (`ChatMessage` has no `selected` column)

The frontend sends a `selected` field when saving RLHF responses, but Pydantic's `MessageSave` schema silently ignores it (Pydantic v2 ignores extra fields by default). The user's preference selection -- **the core RLHF data point** -- is never persisted to the database. This means the entire research purpose of the platform (collecting preference data) is not being fulfilled.

**Fix:** Add a `selected` field to both `MessageSave` (schema) and `ChatMessage` (model). This is a schema migration.

#### H5. CORS allows all origins with credentials

**File:** `/Users/brinkmann/repros/genai/backend/app/main.py`, lines 31-37

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    ...
)
```

`allow_origins=["*"]` with `allow_credentials=True` is an insecure combination. While browsers block `Access-Control-Allow-Origin: *` when credentials are included (the middleware will actually echo the requesting origin), this configuration signals intent to accept requests from any origin with cookies. In production, `allow_origins` should be restricted to the actual frontend domain(s).

**Fix:** Set `allow_origins` to the actual frontend domain (e.g., `[os.environ.get("CORS_ORIGIN", "http://localhost:3000")]`).

#### H6. LLM proxy does not validate response structure

**File:** `/Users/brinkmann/repros/genai/backend/app/routes/chat.py`, lines 74-75

```python
data = resp.json()
content = data["choices"][0]["message"]["content"]
```

If the LLM returns a valid HTTP 200 but with an unexpected JSON structure (missing `choices`, empty array, missing `message` key), this will raise an unhandled `KeyError` or `IndexError`, resulting in an opaque 500 error. This is especially likely with non-OpenAI-compatible endpoints that may use slightly different response formats.

**Fix:** Wrap the response parsing in a try/except and return a meaningful 502 error.

---

### Medium (improve when possible)

#### M1. Bot health check makes a real LLM call (costs money)

**File:** `/Users/brinkmann/repros/genai/backend/app/main.py`, lines 86-99

The `/api/health/bots` endpoint sends a real chat completion request (`"content": "ping"`, `max_tokens: 1`) to each bot. The Header component polls this every 10 seconds. For paid APIs like OpenAI, this continuously burns tokens. With 2 bots and 10-second polling per user, a single user costs ~8,640 API calls per day.

**Fix:** Consider checking reachability via a lighter mechanism (e.g., a HEAD request, or a models list endpoint) or increase the polling interval significantly.

#### M2. `python-socketio` is a dependency but never used

**File:** `/Users/brinkmann/repros/genai/backend/pyproject.toml`, line 17

```toml
python-socketio = "^5.12"
```

There are no imports of `socketio` anywhere in the backend application code. Similarly, `socket.io-client` is listed in the frontend `package.json` but never imported. These are dead dependencies.

**Fix:** Remove `python-socketio` from `pyproject.toml` and `socket.io-client` from `package.json`.

#### M3. `create_tables()` uses `create_all` in production

**File:** `/Users/brinkmann/repros/genai/backend/app/database.py`, lines 28-31

Using `Base.metadata.create_all` in the lifespan hook means the ORM creates tables on every startup. This works for greenfield but is dangerous once the schema evolves: `create_all` will NOT modify existing columns or add new ones. When the `selected` column is added to `ChatMessage` (see H4), existing production databases will not get the new column.

**Fix:** Adopt Alembic for schema migrations before making any model changes.

#### M4. CSV export loads all sessions into memory

**File:** `/Users/brinkmann/repros/genai/backend/app/routes/export.py`, lines 131-132

```python
result = await db.execute(stmt)
for row in result.all():
```

The sessions export uses `db.execute()` + `.all()` which loads all session rows into memory at once, unlike the messages export which uses `db.stream()`. For large datasets this could cause memory issues.

**Fix:** Use `db.stream()` for the sessions export as well.

#### M5. `_stream_messages` generator may hold DB session too long

**File:** `/Users/brinkmann/repros/genai/backend/app/routes/export.py`, lines 53-68

The streaming response keeps the database session open for the entire duration of the HTTP response. If a client has a slow connection, this ties up a database connection from the pool for an extended period. With the default pool size, a few slow clients could exhaust connections.

#### M6. No input length validation on chat messages

**File:** `/Users/brinkmann/repros/genai/backend/app/schemas.py`, line 13

```python
messages: list[dict]
```

The `ChatRequest.messages` field accepts any list of dicts with no validation on count or content size. A malicious client could send an extremely large message list or very long content strings, which would be forwarded to the LLM API (potentially incurring large costs) or cause memory issues.

**Fix:** Add `max_length` constraints on message content and `max_items` on the messages list.

#### M7. Frontend `useSession.resetSession` is just `createSession` aliased

**File:** `/Users/brinkmann/repros/genai/frontend/src/hooks/useSession.js`, lines 47-52

```javascript
return {
  // ...
  resetSession: createSession,
};
```

`resetSession` is an alias for `createSession`. This means "resetting" a session just creates a new one without any cleanup of the old session. The old session's messages remain in the database with no way to distinguish "completed" from "abandoned" sessions.

#### M8. No `display_name` set for either bot in `experiment.yml`

**File:** `/Users/brinkmann/repros/genai/config/experiment.yml`, lines 6-7

Both bots have `display_name: "GENocideAI"` -- the same display name for both bots in the comparison config. In RLHF mode, users will see two response panels both labeled "GENocideAI", making it impossible to distinguish which response came from which instance. (They are actually the same model/endpoint, making the comparison meaningless.)

#### M9. `HF_INFERENCE_TOKEN` vs `HF_API_TOKEN` naming inconsistency

**File:** `/Users/brinkmann/repros/genai/.env`, lines 27-29

The `.env` defines both `HF_API_TOKEN` and `HF_INFERENCE_TOKEN`. The YAML config only uses `HF_INFERENCE_TOKEN`. `HF_API_TOKEN` is unused and creates confusion.

#### M10. Docker Compose base file has no restart policy

**File:** `/Users/brinkmann/repros/genai/docker-compose.yml`

The base `docker-compose.yml` has no `restart` policy on any service. The prod override adds `restart: unless-stopped` for backend, caddy, and db, but not for the frontend (which is expected since it's a build-only container). This is fine as-is but worth noting.

#### M11. `setup-server.sh` overwrites existing crontab

**File:** `/Users/brinkmann/repros/genai/scripts/setup-server.sh`, line 25

```bash
echo "..." | crontab -
```

This pipes into `crontab -` which **replaces** the entire crontab, not appends to it. If the server has other cron jobs, they will be destroyed.

**Fix:** Use `(crontab -l 2>/dev/null; echo "...") | crontab -` to append.

#### M12. CI/CD deploys on push to `dev` with no tests

**File:** `/Users/brinkmann/repros/genai/.github/workflows/deploy.yml`

The deploy workflow triggers on push to `dev` and immediately deploys via SSH without running any tests first. A broken commit will be deployed to production.

**Fix:** Add a test job that runs backend and frontend tests, and make the deploy job depend on it.

---

### Low (nice to have)

#### L1. No README or LICENSE file at project root (README exists, LICENSE missing)

The README is comprehensive and well-written. A `LICENSE` file is referenced (`See [LICENSE](LICENSE) for details.`) but does not exist in the repository.

#### L2. Frontend has no accessibility attributes

No `aria-label`, `aria-live`, `role`, or keyboard navigation attributes are present on interactive elements. The message input has a `placeholder` which provides some implicit labeling, but the send button, reset button, settings button, status indicators, and response comparison panels have no accessible labels.

Key files: all components in `/Users/brinkmann/repros/genai/frontend/src/components/`.

#### L3. React Router v6 deprecation warnings

The frontend uses `react-router-dom` v6.30.3 with React 19, which emits deprecation warnings about v7 future flags. Consider either upgrading to React Router v7 or enabling the future flags.

#### L4. Frontend test coverage is minimal

Only 3 tests exist (render, input visible, spinner visible). No tests for:
- RLHF comparison flow (selecting a response)
- Feedback panel interaction
- Message sending/receiving
- Error states
- Session creation/reset
- URL parameter parsing

#### L5. Backend test coverage gaps

Missing tests for:
- `/api/health/bots` endpoint (mocking httpx for bot health checks)
- LLM timeout handling (504 response)
- LLM connection error handling (502 response)
- CSV export with JSON content fields
- Config defaults handling
- Concurrent duplicate message saves (race condition)

#### L6. No rate limiting

No rate limiting on any endpoint. A single client could flood the LLM proxy with requests, running up API costs.

#### L7. `poetry.lock` is gitignored

**File:** `/Users/brinkmann/repros/genai/.gitignore`, line 37

Ignoring `poetry.lock` means builds are not reproducible -- different environments may resolve different dependency versions. The Poetry documentation recommends committing the lock file for applications.

#### L8. `useChat.sendMessage` has `bots` in its dependency array

**File:** `/Users/brinkmann/repros/genai/frontend/src/hooks/useChat.js`, line 141

Since `bots` is an array prop that gets a new reference on every render (from `config?.bots || []` in ChatPage), the `sendMessage` callback is recreated on every render. This could cause unnecessary re-renders downstream. Memoize `bots` in `ChatPage` or use `useRef`.

#### L9. Frontend npm audit shows 26 vulnerabilities

`npm install` reports 26 vulnerabilities (9 low, 3 moderate, 14 high). Most are likely from `react-scripts` (CRA) transitive dependencies. Consider migrating to Vite.

#### L10. Backup script does not compress output

**File:** `/Users/brinkmann/repros/genai/scripts/backup.sh`, line 10

The `pg_dump` output is stored as raw SQL. For a growing database, this could consume significant disk space. Pipe through `gzip`.

---

## Architecture Assessment

The overall architecture is sound for its intended purpose as a small-scale research tool:

1. **Two-tier design** (React SPA + FastAPI) is appropriate. The YAML configuration approach avoids the need for an admin UI, which is a good tradeoff for a research project.

2. **LLM proxy pattern** correctly keeps API keys server-side and provides a uniform interface regardless of the backing LLM provider.

3. **RLHF flow design** is well-conceived: parallel bot queries, side-by-side display, preference selection, and conversation history filtering based on selected responses.

4. **Database schema** is minimal and appropriate. The `_v1` suffix on table names is a pragmatic approach to schema versioning, though Alembic would be better long-term.

**Structural concerns:**

- The `selected` preference data not being persisted (H4) is an architectural gap that undermines the platform's core purpose.
- The module-level singleton pattern for config (`_config`) is simple but makes testing harder and prevents runtime config reloading.
- No WebSocket integration despite dependencies being declared. The polling-based bot health check is wasteful.
- The RLHF mode is hardcoded to exactly 2 bots (`const isRlhf = bots.length === 2` in useChat.js line 80). This is a reasonable assumption but should be documented.

## Security Assessment

| Area | Status | Notes |
|------|--------|-------|
| API keys in source | OK | Keys are in `.env` (gitignored) and interpolated from env vars in YAML |
| ACCESS_KEY exposure | CRITICAL | Returned in plaintext via `/api/config/{name}` (C1) |
| CORS | NEEDS FIX | Wildcard origin with credentials (H5) |
| Input validation | WEAK | No length limits on messages (M6), no user_id validation (H2) |
| Authentication | MISSING | Export endpoints (H1) and data mutation endpoints (H2) have no auth |
| XSS | OK | React escapes content by default; user messages rendered via `{msg.content}` not `dangerouslySetInnerHTML` |
| SQL injection | OK | SQLAlchemy ORM with parameterized queries throughout |
| Secrets in git | OK | `.env` is gitignored and not tracked; `.env.example` has only placeholder values |
| HTTPS | OK | Caddy auto-provisions TLS certificates in production |
| Credential leakage to frontend | OK | Bot API keys, system messages, and model details are not exposed via the config endpoint |

## Test Coverage Assessment

### Backend (23 tests -- PASS)

**Well covered:**
- Config loading and validation (8 tests): all edge cases including env var interpolation, duplicates, missing fields, cross-references
- ORM models (4 tests): table creation, basic CRUD, uniqueness constraint
- API endpoints (11 tests): config retrieval, chat proxy with mocked LLM, session/message CRUD, CSV export, health check

**Missing coverage:**
- Bot health check endpoint (no tests at all)
- LLM error paths: timeout (504), connection error (502), malformed response
- Export with complex JSON content (nested dicts/lists in content field)
- Concurrent operations / race conditions
- Database connection failure handling

### Frontend (3 tests -- PASS)

**Covered:**
- App renders with header text
- Message input renders after config loads
- Loading spinner appears initially

**Missing coverage (significant gaps):**
- No tests for the RLHF comparison flow
- No tests for message sending/receiving
- No tests for feedback panel interaction
- No tests for error handling (API failures)
- No tests for URL parameter parsing (config name, log, key)
- No tests for session creation/reset
- No component-level unit tests (ResponseComparison, FeedbackPanel, Header, MessageList)

### Overall: Backend has reasonable coverage for a greenfield project. Frontend coverage is effectively a smoke test only.

## Recommendations

Prioritized list of what to address next:

1. **[CRITICAL] Fix ACCESS_KEY leak** (C1) -- Remove `access_key` from the config API response. Validate the key server-side instead.

2. **[CRITICAL] Rotate compromised API keys** (C2) -- The OpenAI, Hetzner, and HF tokens in `.env` should be rotated immediately.

3. **[HIGH] Persist the `selected` field** (H4) -- Add `selected: Optional[int]` to `MessageSave` and `ChatMessage`. This is the core data collection purpose of the platform.

4. **[HIGH] Add authentication to export endpoints** (H1) -- At minimum, require the `ACCESS_KEY` as a Bearer token.

5. **[HIGH] Fix stale closure in `useChat.sendMessage`** (H3) -- Use functional state updater pattern.

6. **[HIGH] Restrict CORS origins in production** (H5) -- Use actual frontend domain instead of `*`.

7. **[HIGH] Add response parsing validation in chat proxy** (H6) -- Catch KeyError/IndexError for malformed LLM responses.

8. **[MEDIUM] Add input validation** (M6) -- Constrain message count and content length.

9. **[MEDIUM] Add CI test step before deploy** (M12) -- Never deploy untested code.

10. **[MEDIUM] Reduce bot health check frequency/cost** (M1) -- Use lighter health check or longer polling interval.

11. **[MEDIUM] Remove dead dependencies** (M2) -- Clean up `python-socketio` and `socket.io-client`.

12. **[MEDIUM] Adopt Alembic** (M3) -- Before making any model changes (especially H4).

13. **[LOW] Expand test coverage** (L4, L5) -- Especially for the RLHF flow and error handling.

14. **[LOW] Add accessibility attributes** (L2) -- Required for any user-facing research tool.

15. **[LOW] Commit `poetry.lock`** (L7) -- Enable reproducible builds.
