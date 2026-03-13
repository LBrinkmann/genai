# Test: Selecting a Preferred Response

## What
Verify that clicking a response card in the RLHF comparison selects it as the preferred response. The selected card should be highlighted, the unselected card should dim, and only the selected response should be used as conversation context for subsequent messages.

## Prerequisites
- Backend is running with a valid `comparison` config containing exactly two bots
- Navigate to: `http://localhost:3000/?config=comparison`
- A message has been sent and two response cards are visible side by side (complete test 03 first)

## Steps

### Step 1: Click on the left response card
**Do**: Click on the left response card (first bot's response).
**Expect**: The clicked card receives a colored border (primary.main color, typically blue, 2px border). The clicked card's elevation increases (more shadow). The unselected (right) card dims to 55% opacity. The cards are no longer clickable (cursor changes from pointer to default) because `onSelect` becomes undefined after selection.
**Screenshot**: Capture the comparison area showing the selected card (highlighted with blue border, full opacity) and the dimmed unselected card.

### Step 2: Verify the feedback panel appears
**Do**: Look below the comparison cards.
**Expect**: A FeedbackPanel component appears below the comparison cards. This panel contains the main preference feedback text (if configured), category chips, and a "Confirm selection" button. This confirms that selection triggers the feedback UI.
**Screenshot**: Capture the area below the comparison showing the feedback panel has appeared.

### Step 3: Verify selected response enters conversation history
**Do**: Type a follow-up message like "Can you elaborate on that?" and press Enter. Wait for the response.
**Expect**: The new responses should be contextually relevant to the previously selected (left) response, not the unselected one. This confirms that `buildHistory` correctly extracts only the selected response text from the comparison array and includes it in the conversation history sent to the LLM.
**Screenshot**: Capture the full conversation showing the original message, the comparison (with selection), and the follow-up exchange.

### Step 4: Verify the second comparison also works
**Do**: After the second set of comparison responses appears, click on the right card this time.
**Expect**: The right card gets the blue border highlight and full opacity. The left card dims to 55% opacity. A new feedback panel appears below this second comparison.
**Screenshot**: Capture the second comparison with the right card selected.

## Pass Criteria
- [ ] Clicking a response card highlights it with a primary-colored (blue) border
- [ ] Selected card has elevated shadow (elevation 3)
- [ ] Unselected card dims to ~55% opacity
- [ ] Cards become non-clickable after selection (cursor: default)
- [ ] FeedbackPanel appears below the comparison after selection
- [ ] Follow-up messages receive contextually coherent responses (selected response used as context)
- [ ] Selection works on either card (left or right)
- [ ] Selection is permanent for that comparison (cannot re-select)
