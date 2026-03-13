# Known Issues

Bugs or unexpected behaviors discovered during testing. Updated 2026-03-14 (Round 2).

## All Round 1 Bugs Fixed

### (FIXED) Backend Session Creation -- timezone=True
- Was: SQLAlchemy insert failed with naive vs offset-aware datetime
- Fix: DateTime columns now use timezone=True
- Status: Verified working in Round 2

### (FIXED) Unhandled Promise Rejection in createSession/resetSession
- Was: CRA error overlay on every page load
- Fix: try/catch wrapping in ChatPage.js
- Status: Verified working in Round 2

### (FIXED) No Error Feedback in Single-Bot Chat
- Was: Errors silently logged to console only
- Fix: Error message now shown in UI as assistant message
- Status: Verified with "[Error: timeout of 60000ms exceeded]" shown in UI

### (FIXED) Access Key Gating Broken
- Was: Reset button always visible due to config fallback
- Fix: URL key param validated against backend config value
- Status: Verified -- No key / wrong key shows "No admin controls"

### (FIXED) Newlines Not Rendered in Messages
- Was: white-space not set to pre-wrap
- Fix: Added white-space: pre-wrap to message Typography
- Status: Verified -- multiline messages render on separate lines

## No New Issues Found in Round 2
