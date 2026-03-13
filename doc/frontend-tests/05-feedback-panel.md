# Test: Feedback Panel and Category Chips

## What
Verify that the feedback panel appears after selecting a response in RLHF mode, displays the main preference text and category chips from the config, allows toggling chips on/off, and submits feedback when the confirm button is clicked.

## Prerequisites
- Backend is running with a `comparison` config that includes `main_preference_feedback` text and `additional_categories` (array of category strings)
- Navigate to: `http://localhost:3000/?config=comparison&log=true`
- A message has been sent, two comparison responses are visible, and one has been selected

## Steps

### Step 1: Verify feedback panel appears after selection
**Do**: After selecting a response card (from test 04), look below the comparison cards.
**Expect**: A feedback panel appears containing:
  - The main preference feedback text (configured in backend YAML, displayed as body2 typography in grey)
  - A row of Chip components, one for each category from the config
  - A "Confirm selection" button (contained variant, small size)
  The chips should all be in their default/unselected state (outlined variant, default color).
**Screenshot**: Capture the feedback panel showing the preference text, category chips, and confirm button.

### Step 2: Toggle category chips
**Do**: Click on the first category chip.
**Expect**: The clicked chip changes from outlined to filled variant, with a primary (blue) color. This indicates it is selected.
**Screenshot**: Capture the chips showing one selected (filled/blue) and the rest unselected (outlined/grey).

### Step 3: Toggle multiple chips and deselect
**Do**: Click on a second category chip to select it. Then click on the first chip again to deselect it.
**Expect**: After clicking the second chip, both first and second chips are filled/blue. After clicking the first chip again, it returns to outlined/default state. Only the second chip remains selected. Chips act as toggles -- clicking a selected chip deselects it.
**Screenshot**: Capture the chips after the toggle sequence, showing only the second chip selected.

### Step 4: Submit feedback
**Do**: With at least one chip selected, click the "Confirm selection" button.
**Expect**: The entire feedback panel (preference text, chips, and button) is replaced by a single line of caption text reading "Feedback submitted" in grey/secondary color. The panel cannot be interacted with further.
**Screenshot**: Capture the area where the feedback panel was, now showing "Feedback submitted" text.

### Step 5: Verify feedback is not re-editable
**Do**: Look at the area where the feedback panel was.
**Expect**: Only the "Feedback submitted" text is shown. There are no chips, no button, and no way to modify the submitted feedback. The confirmation is final.
**Screenshot**: Capture the submitted state to confirm the panel is fully replaced.

## Pass Criteria
- [ ] Feedback panel appears below comparison cards after a response is selected
- [ ] Main preference feedback text is displayed (if configured)
- [ ] Category chips are displayed matching the backend config
- [ ] Chips start in unselected state (outlined variant)
- [ ] Clicking a chip toggles it to selected (filled, primary color)
- [ ] Clicking a selected chip deselects it (back to outlined)
- [ ] Multiple chips can be selected simultaneously
- [ ] "Confirm selection" button is present
- [ ] After clicking confirm, panel is replaced with "Feedback submitted" text
- [ ] Feedback submission is final (no re-editing)
