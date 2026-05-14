# [ACTIVE] Admin /admin page with DB-persisted config overrides

## Goal

Add a dedicated `/admin` route (login-gated) where the operator can change four config knobs and have the change persist for ALL participants without a redeploy:

- `visible_limit` — display message cap (on the active feedback_config)
- `context_limit` — bot conversation history cap (on the active feedback_config)
- `active_feedback_config` — switch between `default` / `comparison` / etc.
- Per-bot `system_message` — the LLM persona prompt

## Design

### Persistence: DB overrides on top of YAML

YAML stays the immutable baseline. A new `config_overrides` table in Postgres holds a single row with sparse JSONB; backend merges override → YAML at every `get_config()` call. Survives redeploys; YAML changes still apply when overrides are absent.

```
table config_overrides
  id            INT PRIMARY KEY  -- always 1 (singleton)
  overrides     JSONB            -- {visible_limit, context_limit, active_feedback_config, bot_overrides: {bot_name: {system_message}}}
  updated_at    TIMESTAMP
  updated_by    TEXT             -- admin username
```

Merge order (highest wins): DB override → YAML default. Sparse — only the explicitly-set fields override.

### Backend routes (all behind `require_admin_session`)

- `GET /api/admin/config` — returns the **merged** config along with which fields are currently overridden:
  ```
  { merged: {...}, overrides: {visible_limit: 5, ...}, available_feedback_configs: ["default", "comparison"], updated_by, updated_at }
  ```
- `PATCH /api/admin/config` — body `{visible_limit?: int, context_limit?: int|null, active_feedback_config?: str, bot_overrides?: {[name]: {system_message?: str}}}`. Validates each field (bot name must exist; feedback_config name must exist; limits must be positive int or null). Writes to the singleton row.
- `DELETE /api/admin/config` — wipes all overrides; YAML defaults take over again.

### Config loader change

`backend/app/config.py` exposes `get_config()` which returns the loaded YAML. Wrap that so it asynchronously fetches overrides from the DB at request time and merges. Cache the merged config in memory for ~5 s to avoid hitting the DB on every chat request.

### Audit logging

Every admin write (PATCH/DELETE on `/api/admin/config`, plus existing pause/resume) emits a JSON log line: `{ts, event, user, ip, payload_keys, ok}`. Stdout only — Caddy/uvicorn pick it up.

### Frontend `/admin` route

- New `frontend/src/pages/Admin.js`. Tailwind, dark surface, same aesthetic as the chat.
- `useAdmin` already exposes `authenticated`; if false, show "Please log in" + a Log in button that opens the modal.
- Form sections:
  - **Active feedback config**: `<select>` populated from `available_feedback_configs`. "Save" persists.
  - **Display limits**: two number inputs for visible_limit + context_limit. Empty string for context_limit = null (unlimited).
  - **Bot personas**: one `<textarea>` per bot for `system_message`. Save per-bot.
- Each section has a "Save" + "Reset to YAML default" button. "Reset" deletes that field's override.
- Footer link: "← Back to chat" → `/`.
- Gear menu in Header gets a new entry "Admin settings" (only when authenticated) that links to `/admin`.

### Cache invalidation

When overrides change, the 5-second merged-config cache will expire naturally. Participants on existing sessions see the change on next /api/config fetch (which `useConfig` polls? — verify; if not, just on next page load).

## Locked decisions

- Dedicated `/admin` route, not inline.
- DB overrides over YAML.
- All four fields editable now: visible_limit, context_limit, active_feedback_config, per-bot system_message.
- Audit logging baseline added (covers admin config + the already-shipped pause/resume).

## Phased plan

Single phase, single commit, single engineer (this isn't large enough to split).

1. **Backend**: SQLAlchemy `ConfigOverride` model + create_all wiring; `services/config_overrides.py` for the merge logic with 5s in-memory cache; `routes/admin.py` extension with GET/PATCH/DELETE for `/api/admin/config`; structured `logger` wired across `routes/auth.py` + `routes/admin.py` (login, logout, pause, resume, config write). Tests covering each route + the merge logic.
2. **Frontend**: `pages/Admin.js`, route in `App.js`, gear-menu link in `Header.js`, `services/api.js` helpers (`getAdminConfig`, `patchAdminConfig`, `deleteAdminConfig`). No new deps.
3. **Verify**: deploy to gen-ai-server-1 and drive the full edit + persistence flow in Chrome MCP.

## Agent

`engineer`, `opus`, standard reasoning. One agent owns everything — files don't overlap with other in-flight work.

## File touch list

```
doc/plans/admin-config-overrides.md           (this file)
backend/app/models.py                         (+ ConfigOverride)
backend/app/services/__init__.py              (no-op or existing)
backend/app/services/config_overrides.py      (new — merge logic + cache)
backend/app/routes/admin.py                   (+ /api/admin/config GET/PATCH/DELETE)
backend/app/routes/auth.py                    (+ structured logging)
backend/app/schemas.py                        (+ AdminConfigResponse, AdminConfigPatch)
backend/tests/test_admin_config.py            (new)
frontend/src/pages/Admin.js                   (new)
frontend/src/App.js                           (+ /admin route)
frontend/src/components/Header.js             (+ "Admin settings" menu item)
frontend/src/services/api.js                  (+ admin-config helpers)
frontend/src/hooks/useConfig.js               (refetch on focus or short polling so overrides land)
```

## Status updates

(append phase completions here)
