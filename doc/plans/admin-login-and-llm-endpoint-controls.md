# [ACTIVE] Admin login + HF Inference Endpoint controls

## Goal

Add a proper username/password login that gates two server-side admin actions:

1. **Reset conversation** (already exists, currently `ACCESS_KEY`-gated as a frontend feature flag).
2. **Start/stop the HuggingFace Inference Endpoint** that serves the project's fine-tuned model (`NoraAl/GENocideAI-01` on endpoint `genocideai-01-ywg`, currently **paused**). Resume from the UI, pause from the UI, with a confirmation step on pause since active users get disconnected.

The motivation: the model endpoint is expensive to keep running. The operator wants to be able to bring it online on demand (e.g. for a curatorial preview) without SSHing into the server or opening the HF console.

## Design

### Server-side login (replaces ACCESS_KEY)

- **Config** (env vars):
  - `ADMIN_USERNAME` — e.g. `admin`.
  - `ADMIN_PASSWORD_HASH` — bcrypt hash. Generated once via `scripts/hash_password.py`; plaintext never lives in env.
  - `SESSION_SECRET` — 32+ random bytes that sign session cookies. Generated via `python -c "import secrets; print(secrets.token_hex(32))"` once per deployment.
- **Session mechanism**: signed cookie, no DB session table.
  - Library: `itsdangerous.TimestampSigner` — stdlib-friendly, no DB.
  - Cookie name: `admin_session`. Attributes: `HttpOnly`, `Secure` (in prod), `SameSite=Strict`. Expires 24 h. Sliding refresh on each authenticated request.
  - Payload: `{user, exp}` JSON, signed.
- **Backend routes** in `backend/app/routes/auth.py` (replace existing file content):
  - `POST /api/auth/login` — body `{username, password}`. Verifies bcrypt hash. Sets cookie. Returns `{ok: true, user}`. **Rate-limited to 5 attempts / 60 s / IP** via an in-memory deque (no redis dependency).
  - `POST /api/auth/logout` — clears the cookie.
  - `GET /api/auth/me` — returns `{authenticated: bool, user?: string}`.
- **Guard dependency** in `backend/app/auth.py`: `require_admin_session(request)` reads + validates the cookie, attaches `request.state.user`, raises 401 if missing/invalid/expired.
- **ACCESS_KEY removed entirely.** The frontend's `?key=` query param is dropped. The "Reset conversation" route moves behind `require_admin_session`. `.env.example` documents the migration.

### HF Inference Endpoint controls

- **Config** in `experiment.yml`, optional per-bot block:
  ```yaml
  bots:
    - name: "genocide-ai"
      model: "NoraAl/GENocideAI-01"
      api_url: "https://twt8ziu7jvtabi5l.us-east-1.aws.endpoints.huggingface.cloud/v1/chat/completions"
      api_key: "${HF_INFERENCE_TOKEN}"
      system_message: "..."
      llm_endpoint:                   # NEW — optional
        provider: "hf"
        namespace: "NoraAl"
        name: "genocideai-01-ywg"
  ```
  Only bots with `llm_endpoint` get a control surface in the admin UI; others are unmanaged.
- **Env**: `HF_API_TOKEN` already exists (write scope, owns the endpoint). Backend uses it server-side. **Never reaches the browser.**
- **Backend routes** in `backend/app/routes/admin.py` (new file), all gated by `require_admin_session`:
  - `GET /api/admin/llm-endpoints` — returns a list of `{bot_name, provider, namespace, name, state, message, url, model}` for every bot that has an `llm_endpoint` configured.
  - `POST /api/admin/llm-endpoints/{bot_name}/resume` — calls HF `POST /v2/endpoint/{namespace}/{name}/resume`. Returns the updated state.
  - `POST /api/admin/llm-endpoints/{bot_name}/pause` — calls HF `POST /v2/endpoint/{namespace}/{name}/pause`. Returns updated state.
- **HF API client** in `backend/app/services/hf_endpoints.py` (new). Async `httpx` client. Handles the small response-shape quirks (state in `status.state`, URL in `status.url`).

### Frontend (modal in the gear menu)

- **`useAdmin()` hook** in `frontend/src/hooks/useAdmin.js`:
  - On mount: `GET /api/auth/me` (with `credentials: 'include'`).
  - Exposes `{ authenticated, user, login, logout, refresh }`.
  - `login(username, password)` POSTs to `/api/auth/login`, refreshes state on success.
- **`LoginModal`** in `frontend/src/components/LoginModal.js`:
  - Tailwind dialog (no MUI). Username + password fields, submit button, error display.
  - Open/close state controlled by parent (`Header`).
  - On Enter or submit: calls `login(...)`, closes modal on success.
- **`Header.js` gear menu** (extend the Phase 5 cluster):
  - When not authenticated: menu item "Log in" → opens LoginModal.
  - When authenticated: menu shows
    - "Logged in as {user}" (small zinc-400 label)
    - LLM endpoint section(s): per managed bot, current state badge + Start/Stop button. State refreshes every 10 s while menu is open.
    - "Reset conversation" (the existing action, now gated by login, not by `?key=`).
    - "Log out".
  - **Stop confirmation**: clicking Stop opens an inline confirm row: "Disconnect users? Active sessions will fail until resumed." [Cancel] [Confirm pause]. Two-click flow, no separate modal.
- **`services/api.js`**: add `withCredentials: true` (axios) so the cookie rides along.
- **`useSession.js` + `useConfig.js`**: remove all `?key=` plumbing. The existing `accessKey` prop disappears from `Header` / `ChatPage`.

### Dependencies

- Backend new deps: `bcrypt`, `itsdangerous`. Both small, well-known, in Poetry.
- Frontend: no new deps. Tailwind + existing fetch/axios.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| A1 | Password storage | bcrypt hash in `ADMIN_PASSWORD_HASH`. Helper `scripts/hash_password.py` generates it. Plaintext never lives anywhere except the operator's password manager. |
| A2 | Session storage | Signed cookie via `itsdangerous`, no DB session table. 24 h expiry, sliding refresh on authenticated requests. |
| A3 | Cookie attributes | `HttpOnly`, `Secure` (prod), `SameSite=Strict`. CSRF is sufficiently covered by SameSite=Strict for this single-origin app. |
| A4 | Login UX | Modal opened from the gear menu (user confirmed). |
| A5 | ACCESS_KEY fate | **Deprecated and removed.** New login is the only admin gate (user confirmed). |
| A6 | Endpoint identity | Per-bot `llm_endpoint` block in `experiment.yml` (user confirmed). Only bots with the block get a control. |
| A7 | Rate limiting | In-memory deque, 5/60s/IP, on `POST /api/auth/login` only. Reset routes are session-gated already. |
| A8 | Pause confirmation | Inline two-step confirm in the menu (not a separate modal). Stop button → "Confirm pause" + "Cancel" appear. |
| A9 | Multi-endpoint UI | UI iterates over all bots that have `llm_endpoint`. For now there's one; the shape allows N. |
| A10 | Out of scope | No password reset flow, no 2FA, no DB-backed session log, no audit trail beyond standard request logging. One operator, simple threat model. |

## Phased plan

Each phase = one PR off the current branch (or `main` if we open per-phase PRs as we did for the design integration).

### Phase A — Backend auth foundation

- Add `bcrypt` + `itsdangerous` to `pyproject.toml`.
- Write `scripts/hash_password.py` — reads password from `getpass`, prints bcrypt hash. Document in README.
- Rewrite `backend/app/routes/auth.py` with `login` / `logout` / `me` endpoints + rate limiting.
- Rewrite `backend/app/auth.py`: drop `require_access_key`, add `require_admin_session`.
- Add `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` to `.env.example` with comments.
- Wire `auth` router in `main.py`. Add CORS `allow_credentials=True` if not already.
- Tests: login happy path, wrong password, rate limit, expired cookie, valid-cookie auth check.
- **Out**: don't touch any existing route that uses `require_access_key` yet — Phase B does that.

### Phase B — Backend HF endpoint control

- Add the optional `llm_endpoint` field to the bot Pydantic schema in `backend/app/config.py` and `schemas.py`.
- Create `backend/app/services/hf_endpoints.py` — async client over `httpx` using `HF_API_TOKEN`. Three functions: `get_status(namespace, name)`, `resume(namespace, name)`, `pause(namespace, name)`. Normalize response shapes (`status.state`, `status.url`, etc.). Surface error states clearly.
- Create `backend/app/routes/admin.py` with the three routes (`GET /api/admin/llm-endpoints`, `POST .../resume`, `POST .../pause`). All depend on `require_admin_session`.
- Switch the existing `/api/messages` routes that used `require_access_key` over to `require_admin_session` (or leave them open if they shouldn't be admin — re-audit).
- Update `config/experiment.yml` + `config/experiment.example.yml` with the `llm_endpoint` block for `genocideai-01-ywg`, commented for clarity.
- Tests: status reachable, resume happy path (mocked HF), pause confirmation, 401 without session, 404 on unknown bot or missing `llm_endpoint`.

### Phase C — Frontend integration

- `services/api.js`: `withCredentials: true` so the session cookie rides along automatically.
- `hooks/useAdmin.js` — new.
- `components/LoginModal.js` — new. Tailwind dialog with focus trap. Submit on Enter.
- `components/Header.js` — extend the gear menu per the design above. State auto-refresh while open. Inline pause confirmation.
- Remove `accessKey` plumbing from `useSession.js`, `useConfig.js`, `ChatPage.js`, `Header.js`.
- Mock layer (`services/mockApi.js`): add stubs for `/api/auth/{me,login,logout}` and `/api/admin/llm-endpoints*` so dev mode works without the backend. Mock LLM endpoint state cycles through `paused → resuming → running → pausing → paused` for demoability.
- Tester: full login flow + start/stop in mock mode + 401 flow when logged out.

### Phase D — Docs + production wiring

- Update `frontend/README.md` and root `README.md` if it exists.
- Update `.env.example` files (root + backend) with the new admin vars + a note that `ACCESS_KEY` is gone.
- Update `config/experiment.example.yml` with the `llm_endpoint` example.
- Update `CLAUDE.md` if RLHF Data Collection platform description references `ACCESS_KEY` (likely).
- Migration note for the operator: how to rotate from `ACCESS_KEY` to the new login (one-time):
  1. SSH in, `python scripts/hash_password.py` to generate `ADMIN_PASSWORD_HASH`.
  2. `python -c "import secrets; print(secrets.token_hex(32))"` for `SESSION_SECRET`.
  3. Update server `.env`, `docker compose up -d --build`.
- Final cross-browser pass: login on Chromium + WebKit.

## Agent assignments

All `opus` per project preference. Max-reasoning flagged on the security-touching parts.

| Phase | Subtask | Agent | Reasoning |
|---|---|---|---|
| A | bcrypt + itsdangerous + login/logout/me + session signing + rate limit | `engineer` | **max** — security-critical; mistakes are expensive. |
| A | Tests for login flow + cookie signing + rate limit | `engineer` | standard |
| B | HF API client + admin routes | `engineer` | standard |
| B | YAML schema extension + sample configs | `engineer` | standard |
| B | Switch existing routes from access-key to session guard | `engineer` | **max** — careful audit of which routes need admin, which should stay open. |
| C | Frontend `useAdmin` + LoginModal + Header gear extension | `engineer` | standard |
| C | Mock layer stubs + remove `?key=` plumbing | `engineer` | standard |
| C | Frontend-tester: full login + LLM start/stop flow in mock mode | `frontend-tester` | standard |
| D | Docs + migration note + production wiring rehearsal | `engineer` | standard |
| D | Final cross-browser (Chromium + WebKit) | `frontend-tester` | standard |
| Reviews | Phase A + Phase B PR review | `reviewer` | **max** — security-critical. |
| Reviews | Phase C + D PR review | `reviewer` | standard |

## File touch list (anticipated)

```
doc/plans/admin-login-and-llm-endpoint-controls.md         (this file)
backend/pyproject.toml                                     (+ bcrypt, itsdangerous)
backend/scripts/hash_password.py                           (new)
backend/app/auth.py                                        (rewrite: require_admin_session)
backend/app/routes/auth.py                                 (rewrite: login/logout/me + rate-limit)
backend/app/routes/admin.py                                (new: HF endpoint controls)
backend/app/services/__init__.py                           (new pkg if not already)
backend/app/services/hf_endpoints.py                       (new: HF API client)
backend/app/config.py                                      (+ llm_endpoint Pydantic field)
backend/app/schemas.py                                     (+ LLMEndpointStatus, login schemas)
backend/app/main.py                                        (register new routers + CORS allow_credentials)
backend/tests/test_auth.py                                 (new)
backend/tests/test_admin_llm_endpoints.py                  (new)
config/experiment.yml                                      (+ llm_endpoint block on bot)
config/experiment.example.yml                              (same example)
.env.example                                               (add admin vars, note ACCESS_KEY removed)
frontend/src/services/api.js                               (withCredentials: true)
frontend/src/services/mockApi.js                           (mock auth + admin endpoints)
frontend/src/hooks/useAdmin.js                             (new)
frontend/src/hooks/useSession.js                           (remove accessKey)
frontend/src/hooks/useConfig.js                            (remove accessKey)
frontend/src/components/LoginModal.js                      (new)
frontend/src/components/Header.js                          (extend gear menu)
frontend/src/pages/ChatPage.js                             (drop accessKey prop)
frontend/README.md                                         (login section + admin section)
CLAUDE.md                                                  (update if it references ACCESS_KEY)
```

## Open questions

None blocking. All design choices are locked.

## Status updates

(append phase completions here)
