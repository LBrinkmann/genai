# Interaction Patterns

How to reliably interact with specific components. Updated 2026-03-14 (Round 2).

## Sending Messages (IMPORTANT)
- form_input sets value but does NOT trigger React's onChange properly for sending
- After form_input, click on input field (~700, 781) to focus, then press Return key
- OR click send button at ~(1470, 781) -- but sometimes this misses
- Most reliable: form_input -> click input to focus -> key Return

## MUI Components
- MUI TextFields: find("message input field") -> ref_6, then form_input to set value
- MUI Buttons: click via ref from find() or by coordinates
- MUI Chips: clickable toggles, click to select/deselect
- MUI Menu: opens on click of gear icon, closes on Escape or click outside

## Gear Menu
- Find gear button: find("settings gear icon button") -> ref_5
- Click ref_5 to open menu
- Menu may close quickly if clicking coordinates -- use ref-based click instead

## Multiline Input
- Shift+Enter inserts a newline without sending
- Enter sends the message
- Newlines now render correctly in message bubbles (white-space: pre-wrap fixed)

## RLHF Selection
- Click on either comparison card to select
- Selected card: blue border, unselected dims to 55%
- Feedback panel appears below automatically

## Feedback Flow
1. Click chips to toggle categories
2. Click "CONFIRM SELECTION" button
3. Panel replaced by "Feedback submitted" text

## Docker Setup
- Docker Desktop must be running
- Use: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
- This exposes ports 3000 (frontend), 8000 (backend), 5432 (db)
- Base docker-compose.yml does NOT expose ports -- dev override is required

## General
- After navigation, wait 3 seconds for config fetch + render
- After sending message, wait 10-12 seconds for LLM response
- Browser extension may disconnect; use tabs_context_mcp to reconnect
