# Frontend: Admin Dashboard

The admin dashboard is a separate single-page application providing researchers with tools to configure experiments, review collected data, and manage the system.

## Authentication

- The dashboard is protected by simple username/password authentication.
- Credentials are verified against server-side environment variables (not a user database).
- Authentication state is maintained in a React context; logging out clears the session and redirects to the login page.
- There is no role-based access control — all authenticated users have full access.

## Session Browser

The main landing page after login displays a list of all recorded user sessions:

- Each entry shows the session identifier, the associated user identifier, and the session creation timestamp.
- Sessions are ordered by creation date (most recent first).
- Clicking a session navigates to a detail view.

## Session Detail View

The session detail page displays the full conversation log for a selected session:

- Messages are listed in chronological order with their index, role (user or assistant), and timestamp.
- Assistant messages include the bot name that generated them.
- Feedback tags associated with each message are displayed.
- In RLHF sessions, the response that the user selected is visually highlighted, distinguishing it from the non-selected alternative.

## Bot Configuration Management

A dedicated page allows researchers to create and manage bot configurations:

- **Bot List**: A dropdown selector lists all existing bot configurations. Selecting one loads its details into an editable form.
- **Editable Fields**:
  - Bot name (must be unique across the system)
  - Language model identifier (e.g., a model name or version string)
  - API endpoint URL (the external LLM service to call)
  - API key (credentials for the external service)
  - System message (the system prompt prepended to all conversations with this bot)
- **Create New**: A button to create a new bot configuration with blank fields.
- **Save**: Persists changes to an existing or new bot configuration.
- **Delete**: Removes a bot configuration from the system.
- **Validation**: The system enforces unique bot names and prevents overwriting existing configurations when creating new ones.

## Feedback Configuration Management

A separate page manages feedback schemes — the combination of bots and feedback categories used in an experiment:

- **Configuration List**: A dropdown lists existing feedback configurations. Selecting one loads it for editing.
- **Editable Fields**:
  - Configuration name (unique identifier for the feedback scheme)
  - Assigned bots (selected from the existing bot configurations)
  - Main preference feedback text (the label shown when a user selects a preferred response)
  - Additional feedback categories (a dynamic list of category labels that users can tag responses with)
- **Dynamic Category Management**: Researchers can add or remove feedback category fields as needed.
- **Start a Chat**: A button that opens the chat interface in a new tab, pre-configured with the selected feedback configuration. This allows researchers to quickly test their setup.
- **Create / Save / Delete**: Standard CRUD operations with uniqueness validation on configuration names.

## Data Export

The dashboard provides access to CSV exports (served by the backend):

- **All Messages Export**: Downloads every message across all sessions with full metadata.
- **Session Export**: Downloads messages for a specific session.
- **Sessions Summary Export**: Downloads a summary of all sessions with message counts and timestamps.
