# [ACTIVE] Parallel test mode with per-bot histories

Adds a second operating mode for debugging: several bots answer the same user turn in parallel, each on its own conversation history, with no preference selection. The existing single-bot flow and the existing RLHF comparison flow are both left untouched.

## Motivation

Today two-bot mode means RLHF comparison: both bots share one history, the user picks a winner, and only the winner is committed to context (`useChat.js:41-66`). That is correct for preference collection but useless for debugging, because the two bots' histories converge the moment a selection is made — you can never see how bot B would have continued from its *own* previous answer.

Test mode keeps the threads permanently separate, so each bot's transcript is a faithful record of that bot alone.

## Modes

**Normal mode** — unchanged. One bot, streaming, canvas/entropy visualisation. This is what participants see.

**Comparison mode** — unchanged. Two bots, shared history, click-to-select, RLHF preference data. Still the production data-collection path.

**Test mode** — new. N bots answer every user turn in parallel. Each bot's history contains the user turns plus *its own* prior answers, never the other bots'. No selection UI. Debug-only.

## Decisions

| Question | Decision |
|---|---|
| Replace comparison, or add alongside? | **Add alongside.** Comparison mode and its selection UI stay exactly as they are. |
| How are bots activated individually? | **Admin UI.** New override keys on the existing DB-persisted config-override surface. |
| Re-activated bot's history | **Catch up.** It sees every user turn including those sent while it was off. |
| Logging | **Logged and flagged**, via session-level marking — see below. |

## Test flagging without a schema change

The chosen approach was a per-message test flag. That is not safe to implement as a new column: `database.py:28` runs `Base.metadata.create_all`, which creates missing *tables* but never alters existing ones, and there is no Alembic in the project. A new `chat_messages_v1` column would never materialise on the production database, and inserts would then fail.

Instead the marking is **session-level**. `sessions_v1.feedback_config_name` already stores the config each session ran under. Entering test mode starts a fresh session whose config name is the test config, so:

- every message in a test session is unambiguously test data,
- exports filter test data with a session join, no new field,
- zero DDL against a live database.

Entering or leaving test mode therefore always begins a new session. This is desirable anyway — a mode switch mid-conversation would otherwise leave a transcript whose semantics change halfway through.

If a per-message flag is later genuinely required, the project's stated evolution path is the table-version suffix (`chat_messages_v2`), which `create_all` *would* create — not an in-place column add.

## Backend changes

No model or schema changes. All work is in the override layer.

**`services/config_overrides.py`** — two new sparse override keys, documented alongside the existing four:

- `test_mode` (bool) — when true, the active feedback config runs in parallel mode.
- `active_bots` (list[str]) — subset of the active config's bots that are live. Absent means all bots active.

`merge_into_config` applies `active_bots` by filtering the active feedback config's bot list, and surfaces `test_mode` so the frontend can read it from the config endpoint.

**`models.py`** — extend the `ConfigOverride` docstring key list only.

**`schemas.py` / `routes/admin.py`** — accept, validate, and echo the two new keys. Validation: `active_bots` must be a subset of the config's known bots, and must be non-empty (an empty set would leave a chat with nobody to answer).

## Frontend changes

**`hooks/useChat.js`** — the core change. `buildHistory` gains a bot index:

- For bot *k*, an assistant message contributes `content[k].text` and nothing else.
- Slots that are empty (bot was inactive for that turn) are skipped, so a re-activated bot sees the user turns it missed with no fabricated answers of its own. Catch-up falls out of the data model for free — no special-casing needed.
- `selected` is ignored entirely in parallel mode and persisted as `null`.

The parallel send path fans out with `Promise.all` over the *active* bots, one independent history each, and writes the same array-shaped `content` the comparison path already uses. The message and persistence shapes do not change.

**`components/MessageList.js`** — the pending-comparison branch (`MessageList.js:135`) renders the stacked cards with "Select" buttons. In test mode it instead renders one labelled column per bot with no Select button, since there is nothing to select.

Note: `components/ResponseComparison.js` is **not** involved — it is dead code, imported nowhere in `frontend/src`, superseded by the inline rendering in `MessageList`. `doc/plans/frontend-design-integration.md:398` already flags it for deletion. Left untouched here.

**`pages/Admin.js` / `hooks/useAdmin.js`** — a test-mode switch plus a per-bot active/inactive toggle row.

**`services/mockApi.js`** — mirror the two override keys in `_mockMergedConfig` so the whole flow is exercisable without a backend.

## Not in scope

Parallel mode uses the non-streaming `sendChat` path, matching how comparison mode works today. Both bots streaming simultaneously would need the single-bot streaming path generalised to N concurrent streams and the canvas visualisation taught to render more than one — worthwhile, but a separate piece of work.

## Risks

- `active_bots` is global admin state, not per-session. Two people debugging at once will fight over it. Acceptable for a debugging tool; a URL-parameter override would isolate sessions if this becomes a problem.
- Test mode is reachable by anyone once an admin enables it, since the override is server-wide. Leaving it on would put participants into parallel mode. The admin UI should make the active mode obvious.
