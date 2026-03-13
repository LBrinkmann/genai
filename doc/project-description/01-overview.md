# Project Overview

## Purpose

This platform is a research tool designed to facilitate **Reinforcement Learning from Human Feedback (RLHF)** data collection through multi-bot conversational interfaces. It enables researchers to deploy multiple AI language model bots in parallel, present their responses side-by-side to users, and collect structured preference feedback on which responses are better and why.

## Core Concept

The system follows a comparative evaluation paradigm: when a user sends a message, two (or more) different language model bots generate independent responses. The user then selects their preferred response and optionally provides categorized feedback. All interactions — messages, selections, and feedback — are logged to a database for later analysis and model training.

## Key Capabilities

- **Multi-Bot Conversations**: Users chat with multiple AI bots simultaneously, each potentially powered by a different language model, system prompt, or API endpoint.
- **Side-by-Side Response Comparison**: In RLHF mode, the interface presents two bot responses next to each other, allowing users to directly compare quality.
- **Structured Preference Feedback**: Beyond simple selection, users can tag responses with configurable feedback categories (e.g., "more helpful", "more accurate", "better tone").
- **Flexible Bot Configuration**: Researchers can configure bots at runtime — choosing different models, API providers, system prompts, and API keys — without redeploying the application.
- **Configurable Feedback Schemes**: Feedback categories and preference prompts can be customized per experiment through an admin interface.
- **Session-Based Data Collection**: Each user interaction is tracked within a session, enabling per-session and per-user analysis of feedback patterns.
- **Data Export**: All collected messages, feedback, and session metadata can be exported as CSV for offline analysis.

## User Roles

1. **Participants / End Users**: Interact with the chat interface, provide responses, and give feedback. They do not need accounts — identity is managed via browser-local identifiers.
2. **Researchers / Administrators**: Access the admin dashboard to configure bots, design feedback schemes, review collected sessions, and export data.

## Typical Workflow

1. A researcher configures one or more bots (choosing models, prompts, API endpoints) and creates a feedback configuration specifying which bots to compare and what feedback categories to offer.
2. The researcher shares a link to the chat interface, optionally with parameters controlling logging behavior and configuration selection.
3. A participant opens the link, begins chatting, and sees parallel responses from two bots.
4. The participant selects their preferred response and optionally tags it with feedback categories.
5. The selected response becomes part of the ongoing conversation context for subsequent turns.
6. The researcher later reviews sessions in the dashboard or exports CSV data for analysis.
