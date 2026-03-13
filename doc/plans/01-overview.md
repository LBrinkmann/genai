# Project Overview

## Purpose

This platform is a research tool designed to facilitate **Reinforcement Learning from Human Feedback (RLHF)** data collection through multi-bot conversational interfaces. It enables researchers to deploy multiple AI language model bots in parallel, present their responses side-by-side to users, and collect structured preference feedback on which responses are better and why.

## Core Concept

The system follows a comparative evaluation paradigm: when a user sends a message, two (or more) different language model bots generate independent responses. The user then selects their preferred response and optionally provides categorized feedback. All interactions — messages, selections, and feedback — are logged to a database for later analysis and model training.

## Key Capabilities

- **Multi-Bot Conversations**: Users chat with multiple AI bots simultaneously, each potentially powered by a different language model, system prompt, or API endpoint.
- **Side-by-Side Response Comparison**: In RLHF mode, the interface presents two bot responses next to each other, allowing users to directly compare quality.
- **Structured Preference Feedback**: Beyond simple selection, users can tag responses with configurable feedback categories (e.g., "more helpful", "more accurate", "better tone").
- **YAML-Based Configuration**: Researchers define bots, feedback schemes, and experiment setups in YAML configuration files. The backend loads these at startup — no admin UI or runtime CRUD needed.
- **Session-Based Data Collection**: Each user interaction is tracked within a session, enabling per-session and per-user analysis of feedback patterns.
- **Data Export**: All collected messages, feedback, and session metadata can be exported as CSV for offline analysis.

## User Roles

1. **Participants / End Users**: Interact with the chat interface, provide responses, and give feedback. They do not need accounts — identity is managed via browser-local identifiers.
2. **Researchers / Administrators**: Define experiment configurations in YAML files, deploy the application, and export collected data for analysis.

## Typical Workflow

1. A researcher writes a YAML configuration file defining one or more bots (choosing models, prompts, API endpoints) and feedback schemes (which bots to compare, what feedback categories to offer).
2. The application is started (or restarted) with the configuration file. The backend loads bot and feedback configs from YAML at startup.
3. The researcher shares a link to the chat interface, optionally with parameters controlling logging behavior and configuration selection.
4. A participant opens the link, begins chatting, and sees parallel responses from two bots.
5. The participant selects their preferred response and optionally tags it with feedback categories.
6. The selected response becomes part of the ongoing conversation context for subsequent turns.
7. The researcher later exports CSV data for analysis via the backend's export endpoints.
