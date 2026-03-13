# Element Selectors

Reliable CSS selectors for key UI elements. Updated 2026-03-14 (Round 2).

## Header
- App bar: header.MuiAppBar-root or .MuiAppBar-root
- Title: Typography h6 inside Toolbar -- text "GenAI Chat"
- Status indicator: [data-testid="status-indicator"] -- 10x10px circle
- Gear icon: find("settings gear icon button") -> ref_5 (unnamed button in banner area)

## Message Area
- Message list container: Box with flex column, overflowY auto
- User message bubbles: bgcolor rgb(25, 118, 210), color white, maxWidth 70%, borderRadius 36px
- Assistant message bubbles: bgcolor rgb(245, 245, 245), maxWidth 70%
- All Paper cards (RLHF): .MuiPaper-root -- index 0 is header, 1 and 2 are comparison cards

## Input
- Text field: find("message input field") -> ref_6 (textarea with placeholder "Type a message...")
- ref_7 is a secondary unnamed textbox -- prefer ref_6
- Send button: IconButton at right end of input area (~coordinate [1470, 781])
- Send button disabled: grey/faded appearance
- Send button active: blue background rgb(25, 118, 210)

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
