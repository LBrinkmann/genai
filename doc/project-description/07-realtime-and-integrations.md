# Real-Time Features and External Integrations

## WebSocket Layer (Partially Integrated)

The backend includes a WebSocket layer built on Socket.IO, though it is not fully integrated into the primary chat flow:

- **Server-Side**: A Socket.IO server is defined with event handlers for connection, disconnection, room joining, and message exchange. It includes participant tracking logic — maintaining a count of connected users per room.
- **Client-Side**: The frontend initializes a Socket.IO client instance and provides it via React context, but the chat page does not actively use it for message exchange.
- **Current State**: The WebSocket infrastructure appears to be prepared for future use cases (e.g., real-time multi-user sessions, live researcher observation) but is not part of the active data flow. All current communication between frontend and backend uses standard HTTP REST calls.

## External LLM Integration

The primary external integration is with language model inference APIs:

- **Protocol**: OpenAI-compatible chat completion API (the de facto standard adopted by most LLM providers and self-hosted solutions).
- **Request Format**: Messages are sent as an array of role/content objects, with the system message injected by the backend.
- **Response Format**: The backend expects and parses the standard completion response structure, extracting the generated text from the first choice.
- **Provider Flexibility**: Each bot can be configured to use a different provider, model, and API key. This enables:
  - Comparing commercial models (e.g., different model families or versions)
  - Comparing commercial vs. self-hosted models
  - Testing the same model with different system prompts
  - Using custom fine-tuned models alongside base models
- **Timeout Handling**: The async HTTP client supports configurable timeouts per request. This is critical for self-hosted models that use scale-to-zero infrastructure, where the first request after idle may take several minutes while the model loads into GPU memory.
- **Error Propagation**: HTTP errors from the LLM provider are caught and forwarded to the frontend with appropriate status codes, enabling the UI to display meaningful status indicators.

## CORS Configuration

The backend is configured to accept cross-origin requests from any origin, with credentials support enabled. This permissive CORS policy simplifies development and deployment across different domains for the frontend, dashboard, and backend services.
