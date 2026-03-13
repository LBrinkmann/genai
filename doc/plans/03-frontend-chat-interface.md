# Frontend: Chat Interface

The primary user-facing application is a conversational interface designed for RLHF data collection. It presents as a clean, single-page chat application.

## Page Layout

The chat interface consists of a single full-screen page with the following regions:

- **Header Bar**: Displays the application title and a settings/gear icon. When an access key is provided via URL parameter, clicking the gear icon reveals additional controls (e.g., a conversation reset button).
- **LLM Status Indicator**: A small colored badge in the header showing the current availability of the connected language model — green for online, yellow for loading/scaling, red for error. This indicator proactively pings the LLM on page load to detect cold starts or unavailability.
- **Message Area**: A scrollable container displaying the conversation history. Messages are visually distinguished by role (user vs. assistant). In RLHF mode, assistant responses appear in a dual-pane layout showing two competing responses side by side.
- **Input Area**: A text field at the bottom with enter-to-send behavior for composing and sending messages.

## RLHF Response Comparison

When the system is configured with two bots, each user message triggers two parallel LLM requests. The responses are displayed in a two-column layout:

- Each column shows one bot's response, identified by the bot's configured name.
- The user must click on their preferred response to continue the conversation.
- The selected response is visually highlighted (e.g., with a colored border or background).
- Only the selected response is incorporated into the conversation history for subsequent turns, ensuring the ongoing dialogue stays coherent.

## Feedback Collection

After (or alongside) selecting a preferred response, users can provide additional structured feedback:

- **Main Preference Feedback**: A configurable prompt (e.g., "I select this option") associated with the selected response.
- **Additional Feedback Categories**: Clickable tags/buttons representing researcher-defined categories. These are loaded dynamically from the backend configuration. Users can toggle multiple categories per response pair.
- Feedback is saved alongside the message data, associated with the specific message index and session.

## Session Management

- On page load, the application generates a random user identifier and stores it in the browser's local storage, reusing it across sessions.
- A new session is created automatically when the page loads or when the user resets the conversation.
- Session identifiers (UUIDs) are generated server-side and tracked throughout the interaction.
- A "reset conversation" button clears the message history, creates a new session, and starts fresh — without changing the user identifier.

## Configuration Loading

- The chat interface accepts URL query parameters to control behavior:
  - A **configuration name** parameter specifies which bot/feedback setup to load.
  - A **logging toggle** parameter enables or disables message persistence.
  - An **access key** parameter unlocks settings controls in the UI.
- On mount, the frontend fetches the full configuration from the backend, including the list of bots and feedback categories.

## LLM Status Monitoring

- On initial load, the frontend sends a lightweight test message to the backend's LLM proxy to check if the model is responsive.
- If the model returns a 503 (common with auto-scaling inference endpoints), the interface enters a "loading" state, periodically retrying with an extended timeout to allow the model to scale up.
- The status indicator reflects the result: online, loading, or error.

## Message Persistence

- When logging is enabled, every message (user and assistant) is saved to the backend immediately after being sent or received.
- Messages include metadata: user ID, session ID, message index, role, content, associated bot identifiers, feedback tags, and timestamp.
- The system prevents duplicate message storage by detecting and replacing messages with matching session and index values.
