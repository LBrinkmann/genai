# Timing Notes

Load times, wait requirements, and retry patterns. Updated 2026-03-14 (Round 2).

## Page Load
- Initial page load: ~1-2 seconds for React to render
- Config fetch from backend: < 500ms (localhost Docker)
- Session creation: succeeds in < 1 second (timezone fix working)
- No CRA error overlay -- page loads cleanly

## Chat Interaction
- LLM response time (working API key): ~5-10 seconds
- LLM response time (invalid API key / timeout): ~60 seconds
- RLHF mode (two bots parallel): ~5-10 seconds
- UI update after response: immediate
- Input re-enables after response: immediate

## After Navigation
- Wait 3 seconds before interacting to allow config fetch + render
- No error overlay to dismiss anymore

## Docker Startup
- Docker Desktop takes ~15 seconds to fully start after open -a Docker
- docker compose up takes ~20 seconds with db healthcheck
- After containers start, services ready in ~5-8 seconds

## General
- After clicking, verify state change before proceeding
- form_input updates value immediately
- Chip clicks toggle immediately
- Feedback confirm is immediate
- Browser extension may disconnect -- reconnect takes ~5 seconds
