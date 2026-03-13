# Interaction Patterns

How to reliably interact with specific components. Updated after each test session.

## MUI Components
- MUI TextFields: the actual `<input>` is nested inside wrapper divs. Use `form_input` tool targeting the input element.
- MUI Buttons: may need to click the inner `<button>` element, not the outer wrapper.
- MUI Chips: clickable toggles — look for `[class*="MuiChip"]` elements.

## General
- After any action, wait and re-read the page to verify state changed.
- Enter-to-send: use keyboard Enter in the input field.
- Shift+Enter: for newline without sending.
