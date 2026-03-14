import axios from 'axios';

const API_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_URL,
});

export async function fetchConfig(configName) {
  const response = await client.get(
    `/api/config/${encodeURIComponent(configName)}`
  );
  return response.data;
}

export async function sendChat(botName, messages, timeout = 60) {
  const response = await client.post(
    '/api/chat',
    { bot_name: botName, messages },
    { timeout: timeout * 1000 }
  );
  return response.data;
}

export async function createSession(userId, feedbackConfigName) {
  const response = await client.post('/api/sessions', {
    user_id: userId,
    feedback_config_name: feedbackConfigName,
  });
  return response.data;
}

export async function saveMessage(messageData) {
  const response = await client.post('/api/messages', messageData);
  return response.data;
}

export async function validateKey(key) {
  const response = await client.post('/api/auth/validate-key', {
    key,
  });
  return response.data;
}

export default client;
