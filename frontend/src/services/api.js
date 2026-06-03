import axios from 'axios';

const USE_MOCK =
  process.env.REACT_APP_MOCK_API === 'true';

const mock = USE_MOCK ? require('./mockApi') : null;

// `??` (not `||`) so an explicit empty string passes through — that
// case means "use relative URLs, same origin as the page". This avoids
// mixed-content errors in prod, where the page is served via HTTPS
// (Cloudflare) but the server backs onto plain HTTP behind Caddy.
const API_URL =
  process.env.REACT_APP_API_URL ?? 'http://localhost:8000';

const realClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

/**
 * When mock mode is active, create a thin proxy that
 * intercepts .get() and .post() calls used elsewhere
 * (e.g. Header.js bot-health polling) so no real HTTP
 * requests are made.
 */
const mockClient = {
  get: async (url) => {
    if (url.startsWith('/api/health/bots')) {
      const params = new URLSearchParams(
        url.split('?')[1] || ''
      );
      const data = await mock.checkBotHealth(
        params.get('config')
      );
      return { data };
    }
    return { data: {} };
  },
  post: async () => ({ data: {} }),
};

const client = USE_MOCK ? mockClient : realClient;

export async function fetchConfig(configName) {
  if (USE_MOCK) return mock.fetchConfig(configName);
  const response = await client.get(
    `/api/config/${encodeURIComponent(configName)}`
  );
  return response.data;
}

export async function sendChat(botName, messages, timeout = 60) {
  if (USE_MOCK) return mock.sendChat(botName, messages);
  const response = await client.post(
    '/api/chat',
    { bot_name: botName, messages },
    { timeout: timeout * 1000 }
  );
  return response.data;
}

/**
 * Stream a chat response from the backend via Server-Sent Events.
 *
 * The backend forwards OpenAI-style SSE frames (`data: {json}\n\n`)
 * followed by `data: [DONE]\n\n`. Errors arrive as a single
 * `event: error\ndata: {"message": "..."}\n\n` frame before the
 * terminal `[DONE]`.
 *
 * Callers pass the same `(botName, messages)` they would pass to
 * `sendChat`, plus three callbacks and an optional `AbortSignal`:
 *
 *   - `onChunk(delta, accumulated)` — fired once per `delta.content`.
 *   - `onDone(accumulated)` — fired when the upstream sends `[DONE]`
 *     or the body closes cleanly.
 *   - `onError(message)` — fired for upstream/network failures and
 *     for `event: error` frames.
 *
 * Aborts: when `signal` is aborted the reader is cancelled and no
 * further callbacks fire (neither `onDone` nor `onError`).
 *
 * Mock mode delegates to `mockApi.streamChat`, which simulates a
 * word-by-word stream with `setTimeout` and matches this interface.
 */
export async function streamChat(
  botName,
  messages,
  { onChunk, onDone, onError, signal } = {}
) {
  if (USE_MOCK) {
    return mock.streamChat(botName, messages, {
      onChunk,
      onDone,
      onError,
      signal,
    });
  }

  let response;
  try {
    response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_name: botName,
        messages,
        stream: true,
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    onError?.(err?.message || 'Network error');
    return;
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const txt = await response.text();
      if (txt) detail = `${detail}: ${txt.slice(0, 200)}`;
    } catch {
      /* ignore */
    }
    onError?.(detail);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError?.('Response had no body');
    return;
  }

  // Streaming decode — emoji and other multi-byte characters can
  // span chunk boundaries, so we use the stream-aware TextDecoder.
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  const handleAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', handleAbort);

  try {
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (signal?.aborted) return;
        onError?.(err?.message || 'Stream read error');
        return;
      }
      const { value, done } = chunk;
      if (done) {
        // Flush any remaining buffered text — usually empty since the
        // server emits a trailing blank line after `[DONE]`.
        buffer += decoder.decode();
        if (buffer.trim() && accumulated === '') {
          // No DONE seen but body closed: still resolve.
        }
        onDone?.(accumulated);
        return;
      }
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line (`\n\n`). Process
      // every complete event currently in the buffer; keep the
      // trailing partial.
      let sepIdx;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        if (!raw) continue;

        // Each event may have an `event:` line and a `data:` line.
        let eventName = 'message';
        const dataLines = [];
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        const dataStr = dataLines.join('\n');
        if (!dataStr) continue;

        if (eventName === 'error') {
          let msg = dataStr;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed?.message) msg = parsed.message;
          } catch {
            /* leave raw */
          }
          onError?.(msg);
          // Drain to the [DONE] sentinel without firing onDone.
          return;
        }

        if (dataStr === '[DONE]') {
          onDone?.(accumulated);
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const delta =
            parsed?.choices?.[0]?.delta?.content || '';
          if (delta) {
            accumulated += delta;
            onChunk?.(delta, accumulated);
          }
        } catch {
          // Ignore malformed events — upstream sometimes emits
          // keep-alive comments or partial frames the splitter
          // already filtered. Be lenient.
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', handleAbort);
  }
}

export async function createSession(userId, feedbackConfigName) {
  if (USE_MOCK)
    return mock.createSession(userId, feedbackConfigName);
  const response = await client.post('/api/sessions', {
    user_id: userId,
    feedback_config_name: feedbackConfigName,
  });
  return response.data;
}

export async function saveMessage(messageData) {
  if (USE_MOCK) return mock.saveMessage(messageData);
  const response = await client.post(
    '/api/messages',
    messageData
  );
  return response.data;
}

export async function getMe() {
  if (USE_MOCK) return mock.getMe();
  const response = await client.get('/api/auth/me');
  return response.data;
}

export async function login(username, password) {
  if (USE_MOCK) return mock.login(username, password);
  const response = await client.post('/api/auth/login', {
    username,
    password,
  });
  return response.data;
}

export async function logout() {
  if (USE_MOCK) return mock.logout();
  const response = await client.post('/api/auth/logout');
  return response.data;
}

export async function listLLMEndpoints() {
  if (USE_MOCK) return mock.listLLMEndpoints();
  const response = await client.get(
    '/api/admin/llm-endpoints'
  );
  // Admin view: per-endpoint rows (with cost) plus the global mode.
  return {
    endpoints: response.data?.endpoints || [],
    mode: response.data?.mode || 'auto',
  };
}

// Public (no auth): aggregate readiness for the chat gate. Returns
// { ready, state, mode } where state is one of
// ready|waking|asleep|disabled|unavailable.
export async function getEndpointState() {
  if (USE_MOCK) return mock.getEndpointState();
  const response = await client.get('/api/llm-endpoints/state');
  return response.data;
}

// Public (no auth): wake all managed endpoints. Returns the same
// { ready, state, mode } shape reflecting the post-wake state.
export async function activateEndpoints() {
  if (USE_MOCK) return mock.activateEndpoints();
  const response = await client.post('/api/llm-endpoints/activate');
  return response.data;
}

// Admin: set the global endpoint mode (auto|on|off). Returns
// { mode, endpoints }.
export async function setEndpointMode(mode) {
  if (USE_MOCK) return mock.setEndpointMode(mode);
  const response = await realClient.put(
    '/api/admin/llm-endpoints/mode',
    { mode }
  );
  return response.data;
}

export async function resumeLLMEndpoint(botName) {
  if (USE_MOCK) return mock.resumeEndpoint(botName);
  const response = await client.post(
    `/api/admin/llm-endpoints/${encodeURIComponent(
      botName
    )}/resume`
  );
  return response.data;
}

export async function pauseLLMEndpoint(botName) {
  if (USE_MOCK) return mock.pauseEndpoint(botName);
  const response = await client.post(
    `/api/admin/llm-endpoints/${encodeURIComponent(
      botName
    )}/pause`
  );
  return response.data;
}

export async function getAdminConfig() {
  if (USE_MOCK) return mock.getAdminConfig();
  const response = await client.get('/api/admin/config');
  return response.data;
}

export async function patchAdminConfig(patch) {
  if (USE_MOCK) return mock.patchAdminConfig(patch);
  const response = await realClient.patch(
    '/api/admin/config',
    patch
  );
  return response.data;
}

export async function deleteAdminConfig() {
  if (USE_MOCK) return mock.deleteAdminConfig();
  const response = await realClient.delete('/api/admin/config');
  return response.data;
}

export default client;
