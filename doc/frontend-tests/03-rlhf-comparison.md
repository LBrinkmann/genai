# Test: RLHF Two-Bot Comparison Flow

## What
Verify that when configured with two bots, user messages trigger parallel responses that appear side by side in a comparison layout. Each response card should show the bot name and response text. The input should remain disabled until responses arrive.

## Prerequisites
- Backend is running with a valid `comparison` config containing exactly two bots
- Navigate to: `http://localhost:3000/?config=comparison`
- Page has fully loaded (header visible, input ready)

## Steps

### Step 1: Send a message to trigger comparison
**Do**: Click the input field. Type "What is the meaning of life?" and press Enter.
**Expect**: The user message appears right-aligned in a blue bubble. The input field disables and shows a loading spinner.
**Screenshot**: Capture the page showing the user message and loading state.

### Step 2: Wait for both bot responses
**Do**: Wait for the comparison cards to appear (up to 60 seconds). Both bots are queried in parallel via `Promise.all`.
**Expect**: Two Paper cards appear side by side (flex row layout) below the user message. Each card shows:
  - A bot name label at the top in small caption text (grey, bold)
  - The bot's response text below the label
  The cards have equal width (flex: 1) and are contained within a max-width of 720px. Both cards have subtle elevation (shadow). The cards should have `cursor: pointer` indicating they are clickable.
**Screenshot**: Capture the comparison layout showing both cards side by side with bot names and response text.

### Step 3: Verify input state after responses arrive
**Do**: Check the input field state while the comparison is displayed but no selection has been made.
**Expect**: The input field is re-enabled (loading is false since responses arrived). The send button reappears. Note: the UI does not block further input before selection, but `buildHistory` excludes unselected comparison messages from context, so it is expected that the user selects before continuing.
**Screenshot**: Capture the input area to show its current enabled state.

### Step 4: Verify hover behavior on cards
**Do**: Hover the mouse over each response card individually.
**Expect**: On hover, the card shows a light primary-colored border and a subtle upward translation (-1px). This indicates the card is interactive/clickable.
**Screenshot**: Capture a card in its hover state showing the border highlight and slight lift effect.

## Pass Criteria
- [ ] Two response cards appear side by side after sending a message
- [ ] Each card displays the bot's name in caption text at the top
- [ ] Each card displays the bot's response text below the name
- [ ] Cards are equally sized (flex: 1 layout)
- [ ] Cards have pointer cursor indicating they are clickable
- [ ] Cards show hover effect (border color change, slight lift)
- [ ] No selection highlight is present initially (both cards at full opacity, transparent border)
- [ ] The overall layout is contained and not wider than 720px
