# Element Selectors

Reliable CSS selectors for key UI elements. Updated 2026-03-14 (Round 2).

## Header (Phase 5+: Tailwind corner cluster, no MUI AppBar)
- NO more `header.MuiAppBar-root` on `/`. Header is now a `<div>` cluster.
- Cluster root: `div.absolute.right-4.top-4.z-20` containing dots + gear
- Status indicator: `[data-testid="status-indicator"]` (10px round Tailwind span)
- Gear icon button: `button[aria-label="Settings"]`
- Open menu: `[role="menu"]`
- Reset (key branch): `button:has-text("Reset conversation")` inside the menu
- No-key fallback text: "No admin controls" inside `div[role="menuitem"][aria-disabled="true"]`
- Title: `Chat | GENocideAI` (no "GenAI Chat" anywhere on page)

## Message Area
- Message list container: Box with flex column, overflowY auto
- User message bubbles: bgcolor rgb(25, 118, 210), color white, maxWidth 70%, borderRadius 36px
- Assistant message bubbles: bgcolor rgb(245, 245, 245), maxWidth 70%
- All Paper cards (RLHF): .MuiPaper-root -- index 0 is header, 1 and 2 are comparison cards

## Input
- Phase 5+: Tailwind `<input placeholder="Type your message...">` (NOT a textarea).
  - Playwright: `input[placeholder="Type your message..."]`
  - Submit by pressing Enter on the input
- Older MUI textarea selectors no longer apply.

## RLHF Comparison
- Bot name labels: Typography caption (e.g., "gpt-4", "gpt-4-concise")
- Selected card: borderColor blue, opacity 1
- Unselected card: opacity 0.55

## Feedback Panel
- Chips: "More helpful", "More accurate", "Better tone"
- Confirm button: "CONFIRM SELECTION"
- Submitted state: "Feedback submitted" text

## Gear Menu
- With correct key: "RESET CONVERSATION" button (outlined, error/red)
- Without key / wrong key: "No admin controls" (disabled text)

## Error State
- MUI Alert centered, "Configuration Error" heading
