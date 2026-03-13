# [DRAFT] Implementation Plan

## Goal

Implement the full GenAI RLHF platform from greenfield to a working deployment. Work is structured into parallelizable workpackages (WPs) that can be developed by independent agents on separate branches, with clear merge order and integration points.

## Dependency Graph

```
WP1 (Infrastructure)  ──────────────────────────────────────────────┐
WP2 (Backend Core)    ───────┬──> WP4 (Backend API) ──┐            │
WP3 (Frontend Shell)  ──┐    │                         ├──> WP6 (Integration) ──> WP7 (Prod Deploy)
                         ├──> WP5 (Frontend Features)──┘            │
                         │                                          │
                         └──────────────────────────────────────────┘
```

**Phase 1** — WP1, WP2, WP3 run in parallel (no dependencies between them)
**Phase 2** — WP4 (needs WP2), WP5 (needs WP3) run in parallel
**Phase 3** — WP6 (needs WP1 + WP4 + WP5) integrates everything
**Phase 4** — WP7 (needs WP6) production deployment

## Summary Table

| WP | Name | Branch | Depends on | Agent |
|----|------|--------|------------|-------|
| 1 | Infrastructure & Docker | `feat/infrastructure` | — | engineer |
| 2 | Backend Core (models, config, DB) | `feat/backend-core` | — | engineer |
| 3 | Frontend Shell & Layout | `feat/frontend-shell` | — | engineer |
| 4 | Backend API Endpoints | `feat/backend-api` | WP2 | engineer |
| 5 | Frontend Features (RLHF, feedback, sessions) | `feat/frontend-features` | WP3 | engineer |
| 6 | Integration & End-to-End | `feat/integration` | WP1, WP4, WP5 | engineer |
| 7 | Production Deployment | `feat/prod-deploy` | WP6 | engineer |

---

## WP1: Infrastructure & Docker

**Branch**: `feat/infrastructure`
**Parallel**: Yes — no dependencies
**Agent**: engineer

### Scope

Set up the complete Docker Compose development environment and production configuration files. This WP produces the scaffolding that all other WPs will run inside.

### Deliverables

- `docker-compose.yml` — base services: backend (Python 3.13), frontend (Node), PostgreSQL
- `docker-compose.dev.yml` — dev overrides: hot-reload, source mounts, exposed ports
- `docker-compose.prod.yml` — prod overrides: gunicorn, Caddy, built frontend, restart policies, resource limits
- `backend/Dockerfile` — multi-stage (dev + prod)
- `frontend/Dockerfile` — multi-stage (dev + prod)
- `Caddyfile` — reverse proxy + static file serving config
- `.env.example` — documented template for all environment variables
- `config/experiment.example.yml` — example YAML experiment config (used by other WPs for testing)
- `backend/pyproject.toml` — Poetry project with core dependencies (FastAPI, uvicorn, SQLAlchemy, asyncpg, httpx, pyyaml, pydantic)
- `frontend/package.json` — CRA project with core dependencies (React 19, MUI v6, React Router v7, axios)

### Test Strategy

| Check | Method |
|-------|--------|
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml config` validates | auto |
| `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` validates | auto |
| `docker compose up` starts all three services without errors | auto: check exit codes + health |
| Backend container responds on its port (e.g., `curl localhost:8000/docs`) | auto |
| Frontend container responds on its port (e.g., `curl localhost:3000`) | auto |
| PostgreSQL accepts connections from backend container | auto |
| `.env.example` documents every variable used in compose files | manual: review |

---

## WP2: Backend Core (Models, Config, DB)

**Branch**: `feat/backend-core`
**Parallel**: Yes — no dependencies
**Agent**: engineer

### Scope

The foundational backend layer: SQLAlchemy models, YAML config loading with validation, database session factory, and table creation. No API endpoints yet — just the core that endpoints will use.

### Deliverables

- `backend/app/models.py` — SQLAlchemy async models for `ChatMessage` and `Session` tables (per `06-data-model.md`)
- `backend/app/database.py` — async engine, session factory, `create_tables()` startup function
- `backend/app/config.py` — YAML config loader with Pydantic validation models (`BotConfig`, `FeedbackConfig`, `AppConfig`), `${ENV_VAR}` interpolation, startup validation
- `backend/app/__init__.py` — package init
- `backend/tests/test_config.py` — unit tests for config loading, validation, env var interpolation
- `backend/tests/test_models.py` — unit tests for model creation (using SQLite async or test PostgreSQL)

### Test Strategy

| Check | Method |
|-------|--------|
| Config loads valid YAML and produces correct Pydantic models | auto: `pytest test_config.py` |
| Config rejects invalid YAML (missing required fields, duplicate names, unresolved bot refs) | auto: `pytest test_config.py` |
| `${ENV_VAR}` interpolation resolves from environment | auto: `pytest test_config.py` |
| SQLAlchemy models create tables without errors | auto: `pytest test_models.py` |
| Message upsert (session_id + index uniqueness) works correctly | auto: `pytest test_models.py` |
| `poetry run pre-commit run --all-files` passes | auto |

---

## WP3: Frontend Shell & Layout

**Branch**: `feat/frontend-shell`
**Parallel**: Yes — no dependencies
**Agent**: engineer

### Scope

The React app skeleton: project setup, page layout, routing, theme, and static UI components. Uses mock data — no backend calls. The goal is to get the visual structure right before wiring up API calls.

### Deliverables

- CRA project in `frontend/` with React 19, MUI v6, React Router v7
- `frontend/src/App.js` — router setup, MUI theme provider
- `frontend/src/theme.js` — MUI theme customization
- `frontend/src/pages/ChatPage.js` — main chat page layout with header, message area, input area
- `frontend/src/components/Header.js` — app title, gear icon, LLM status indicator (static/placeholder)
- `frontend/src/components/MessageList.js` — scrollable message container, renders user and assistant messages
- `frontend/src/components/MessageInput.js` — text field with enter-to-send
- `frontend/src/components/ResponseComparison.js` — two-column layout for RLHF side-by-side responses (static mock)
- `frontend/src/components/FeedbackPanel.js` — preference button + category tags (static mock)

### Test Strategy

| Check | Method |
|-------|--------|
| App renders without errors | auto: `npm test` |
| All components render with mock data | auto: `npm test` |
| **Visual review — initial layout** | manual: browser |

#### Browser Testing Protocol (WP3)

This WP requires multiple revision loops to get the UI right:

1. **Round 1 — Skeleton**: Start the dev server (`npm start`), open in browser. Take screenshots of: (a) empty chat state, (b) chat with mock messages, (c) RLHF comparison layout with two mock responses. Review screenshots for: correct layout structure, proper MUI theming, responsive behavior, visual hierarchy. Fix issues.

2. **Round 2 — Polish**: After fixes, re-screenshot. Check: spacing/padding consistency, scroll behavior in message area, input field focus states, header alignment. Verify mobile viewport (375px) and desktop (1440px). Fix issues.

3. **Round 3 — Sign-off**: Final screenshot set. Verify no visual regressions from round 2. Confirm all placeholder components are properly positioned for later wiring.

Each round: take screenshot → review → fix → re-screenshot. Minimum 3 rounds, continue until no visual issues remain.

---

## WP4: Backend API Endpoints

**Branch**: `feat/backend-api`
**Depends on**: WP2 merged to `dev`
**Agent**: engineer

### Scope

All FastAPI endpoints: config retrieval, LLM proxy, session creation, message saving, CSV export. Wires up the core from WP2 into a working API.

### Deliverables

- `backend/app/main.py` — FastAPI app, CORS middleware, startup event (load config, create tables)
- `backend/app/routes/config.py` — `GET /api/config/{name}` → returns feedback config with bots
- `backend/app/routes/chat.py` — `POST /api/chat` → LLM proxy (HTTPX to external API, system prompt injection, timeout handling)
- `backend/app/routes/sessions.py` — `POST /api/sessions` → create session; message saving
- `backend/app/routes/export.py` — `GET /api/export/messages`, `/api/export/messages/{session_id}`, `/api/export/sessions` → streaming CSV
- `backend/app/schemas.py` — Pydantic request/response models for all endpoints
- `backend/tests/test_api.py` — endpoint tests using FastAPI TestClient + mocked LLM responses

### Test Strategy

| Check | Method |
|-------|--------|
| `GET /api/config/{name}` returns correct config for valid name | auto: `pytest test_api.py` |
| `GET /api/config/{name}` returns 404 for unknown name | auto: `pytest test_api.py` |
| `POST /api/chat` forwards to LLM and returns response (mocked HTTPX) | auto: `pytest test_api.py` |
| `POST /api/chat` handles 503 from LLM gracefully | auto: `pytest test_api.py` |
| `POST /api/sessions` creates session and returns UUID | auto: `pytest test_api.py` |
| `POST /api/messages` saves message; duplicate (session+index) replaces | auto: `pytest test_api.py` |
| CSV export endpoints return valid CSV with correct headers | auto: `pytest test_api.py` |
| All endpoints reject malformed input with 422 | auto: `pytest test_api.py` |
| `poetry run pre-commit run --all-files` passes | auto |
| Manual: hit `/docs` (Swagger UI) and test each endpoint interactively | manual: browser |

---

## WP5: Frontend Features (RLHF, Feedback, Sessions)

**Branch**: `feat/frontend-features`
**Depends on**: WP3 merged to `dev`
**Agent**: engineer

### Scope

Wire up the static shell from WP3 to the backend API. Implement all interactive features: config loading, LLM chat flow, RLHF comparison with selection, feedback collection, session management, message persistence. Uses a mock API service initially (to avoid needing the backend running), then switches to real API calls.

### Deliverables

- `frontend/src/services/api.js` — API client (axios): config fetch, chat send, session create, message save
- `frontend/src/hooks/useSession.js` — session lifecycle: user ID generation (localStorage), session creation, reset
- `frontend/src/hooks/useChat.js` — chat state management: message history, send message, receive response(s), RLHF selection
- `frontend/src/hooks/useConfig.js` — load config from URL params, fetch from backend
- Update `ChatPage.js` — wire hooks to components, handle loading/error states
- Update `ResponseComparison.js` — clickable selection, visual highlight of chosen response, only selected enters history
- Update `FeedbackPanel.js` — dynamic categories from config, toggle tags, save feedback with message
- Update `Header.js` — LLM status indicator (ping on load, green/yellow/red), gear icon with reset button (shown when access key provided)
- Update `MessageInput.js` — disabled during LLM response, loading indicator

### Test Strategy

| Check | Method |
|-------|--------|
| Hooks render without errors with mock data | auto: `npm test` |
| API service functions call correct endpoints | auto: `npm test` (mocked axios) |
| **Visual + functional review — full chat flow** | manual: browser |

#### Browser Testing Protocol (WP5)

Multiple revision loops with increasing fidelity:

1. **Round 1 — Mock API flow**: Run frontend with a mock API service (hardcoded responses). Test full flow: page loads → config fetched → type message → send → two mock responses appear side by side → click preferred → it enters history → feedback tags appear → toggle tags → send another message. Take screenshots at each step. Check: loading states, disabled input during response, correct message ordering, selection highlight.

2. **Round 2 — Edge cases**: Test with mock data: (a) single-bot config (no comparison, just chat), (b) very long messages (scroll behavior), (c) rapid message sending, (d) empty feedback categories, (e) reset conversation (new session, same user ID, cleared history). Take screenshots. Fix issues.

3. **Round 3 — Session management**: Verify: (a) user ID persists across page reload (check localStorage), (b) new session created on load, (c) reset creates new session without changing user ID, (d) config name loaded from URL param `?config=gpt4-vs-llama`, (e) logging toggle from URL param works. Take screenshots.

4. **Round 4 — Visual polish**: Full walkthrough of the happy path. Screenshot every state: empty, loading, single response, comparison, selected, with feedback, after reset. Check: animation/transitions feel smooth, no layout jumps, consistent spacing, accessible color contrast. Fix and re-screenshot until clean.

5. **Round 5 — LLM status indicator**: Test status badge with mock responses: (a) green when LLM responds immediately, (b) yellow/loading when 503 received + retry, (c) red on error. Verify gear icon shows reset button only when access key is in URL. Screenshot each state.

Each round: take screenshot → review against spec (`03-frontend-chat-interface.md`) → fix → re-screenshot. Minimum 5 rounds, continue until all functions work and UI is polished.

---

## WP6: Integration & End-to-End

**Branch**: `feat/integration`
**Depends on**: WP1, WP4, WP5 all merged to `dev`
**Agent**: engineer

### Scope

Merge all components, connect frontend to real backend, test the complete system running in Docker Compose with a real (or test) LLM endpoint. Fix any integration issues.

### Deliverables

- Verify/fix Docker Compose dev setup runs all services together
- Wire frontend `REACT_APP_API_URL` to backend container
- Create `config/experiment.yml` with a working test configuration (e.g., using a cheap model like `gpt-4o-mini`)
- Fix any CORS, networking, or API contract mismatches
- End-to-end smoke test script or checklist
- Verify CSV export produces valid data after a chat session

### Test Strategy

| Check | Method |
|-------|--------|
| `docker compose up` starts all services, no errors | auto |
| Frontend loads config from backend | auto: curl + check response |
| **Full end-to-end chat session** | manual: browser |
| CSV export contains messages from the session | auto: curl export endpoint, validate CSV |
| Session persists across page reload | manual: browser |
| Reset creates new session | manual: browser |

#### Browser Testing Protocol (WP6)

This is the critical integration test. Run the full stack in Docker Compose.

1. **Round 1 — Happy path**: Open chat in browser with `?config=<name>`. Send a message. Wait for two LLM responses. Select one. Send follow-up. Verify conversation is coherent (only selected response in history). Apply feedback tags. Screenshot every step. Check backend logs for errors.

2. **Round 2 — Data verification**: After the chat session, hit the CSV export endpoints. Verify: (a) all messages appear with correct session ID, (b) feedback tags are recorded, (c) bot IDs are correct, (d) timestamps are reasonable. Open sessions summary export and verify session appears.

3. **Round 3 — Error scenarios**: (a) Start with LLM endpoint down — verify status indicator shows red, (b) use invalid config name — verify 404 handling in UI, (c) disconnect network mid-chat — verify graceful error display.

4. **Round 4 — Cross-browser**: Test in Chrome and Firefox. Screenshot both. Check for layout differences.

---

## WP7: Production Deployment

**Branch**: `feat/prod-deploy`
**Depends on**: WP6 merged to `dev`
**Agent**: engineer

### Scope

Finalize production Docker Compose, deploy to VPS, verify everything works with real DNS and TLS.

### Deliverables

- Final `docker-compose.prod.yml` (tested and working)
- `Caddyfile` with real domain names
- `scripts/deploy.sh` — SSH deploy script
- `scripts/backup.sh` — pg_dump backup script with rotation
- Optional: GitHub Actions workflow for automated deploy on push to `dev`
- Documentation updates to `README.md` with setup instructions

### Test Strategy

| Check | Method |
|-------|--------|
| `docker compose -f ... -f ...prod.yml up -d` starts cleanly on VPS | auto |
| Caddy provisions TLS certificate | manual: check `https://` works |
| Frontend loads via HTTPS | manual: browser |
| Full chat session works via production URL | manual: browser |
| Backup script produces valid pg_dump file | auto: run script, check file |
| Backup restore works | manual: restore to test DB, verify data |

---

## Merge Order

1. Merge WP1, WP2, WP3 to `dev` (any order — they're independent)
2. Merge WP4 to `dev` (after WP2)
3. Merge WP5 to `dev` (after WP3)
4. Merge WP6 to `dev` (after WP1 + WP4 + WP5)
5. Merge WP7 to `dev` (after WP6)

## Next Actions

- [ ] Review and approve this plan
- [ ] Launch WP1, WP2, WP3 in parallel (three engineer agents on separate branches)
- [ ] After Phase 1 merges, launch WP4 and WP5 in parallel
- [ ] After Phase 2 merges, launch WP6
- [ ] After WP6, launch WP7
