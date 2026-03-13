import { useState, useCallback, useRef } from 'react';
import { createSession as apiCreateSession } from '../services/api';

function generateId() {
  try {
    if (
      typeof crypto !== 'undefined' &&
      crypto.randomUUID
    ) {
      return crypto.randomUUID();
    }
  } catch {
    // fallback below
  }
  return (
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

function getOrCreateUserId() {
  const key = 'genai_user_id';
  let userId = localStorage.getItem(key);
  if (!userId) {
    userId = generateId();
    localStorage.setItem(key, userId);
  }
  return userId;
}

export default function useSession() {
  const userId = useRef(getOrCreateUserId()).current;
  const [sessionId, setSessionId] = useState(null);

  const createSession = useCallback(
    async (feedbackConfigName) => {
      const data = await apiCreateSession(
        userId,
        feedbackConfigName
      );
      setSessionId(data.session_id);
      return data.session_id;
    },
    [userId]
  );

  const resetSession = useCallback(
    async (feedbackConfigName) => {
      const data = await apiCreateSession(
        userId,
        feedbackConfigName
      );
      setSessionId(data.session_id);
      return data.session_id;
    },
    [userId]
  );

  return { userId, sessionId, createSession, resetSession };
}
