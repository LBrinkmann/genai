import axios from 'axios';

const USE_MOCK =
  process.env.REACT_APP_MOCK_API === 'true';

const mock = USE_MOCK ? require('./mockApi') : null;

const API_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
  // Backend wraps the list as {endpoints: [...]}; the mock returns
  // a bare array. Normalize so callers always get the array.
  return response.data?.endpoints || [];
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

export default client;
