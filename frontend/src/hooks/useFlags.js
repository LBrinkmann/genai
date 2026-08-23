import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createFlag,
  listFlags,
  updateFlag,
} from '../services/api';

/**
 * Admin response flags for one session.
 *
 * Flags are an operator-side annotation layer: the endpoints are all
 * behind the admin session cookie, so the hook is inert unless
 * `enabled` (i.e. `useAdmin().authenticated`) and a `sessionId` are
 * both present — with `enabled` false it issues no request at all and
 * hands back an empty map, which is what keeps the participant chat
 * byte-for-byte unchanged.
 *
 * State is a Map keyed `"{message_index}:{response_index}"`, matching
 * the logical identity of a flag on the backend.
 */
const flagKey = (messageIndex, responseIndex) =>
  `${messageIndex}:${responseIndex ?? 0}`;

export default function useFlags({ sessionId, enabled = false } = {}) {
  const [flags, setFlags] = useState(() => new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Merge one server row into the map, replacing any row at the same
  // logical key (the POST is an upsert, so this is the same row back).
  const mergeFlag = useCallback((flag) => {
    if (!flag) return;
    setFlags((prev) => {
      const next = new Map(prev);
      next.set(flagKey(flag.message_index, flag.response_index), flag);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId) {
      // Never leave another session's flags on screen. Keep the same
      // instance when it is already empty so logged-out renders don't
      // churn.
      setFlags((prev) => (prev.size === 0 ? prev : new Map()));
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listFlags({ sessionId });
        if (cancelled || !mountedRef.current) return;
        const next = new Map();
        (rows || []).forEach((f) => {
          next.set(flagKey(f.message_index, f.response_index), f);
        });
        setFlags(next);
        setError(null);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        setError(
          err?.response?.data?.detail ||
            err?.message ||
            'Failed to load flags'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled]);

  const getFlag = useCallback(
    (messageIndex, responseIndex) =>
      flags.get(flagKey(messageIndex, responseIndex)) || null,
    [flags]
  );

  const saveFlag = useCallback(
    async ({
      messageIndex,
      responseIndex = 0,
      botName = null,
      responseText = null,
      comment = '',
    }) => {
      if (!enabled || !sessionId) return null;
      setSaving(true);
      setError(null);
      try {
        const saved = await createFlag({
          session_id: sessionId,
          message_index: messageIndex,
          response_index: responseIndex,
          bot_name: botName,
          response_text: responseText,
          comment,
        });
        if (mountedRef.current) mergeFlag(saved);
        return saved;
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              'Failed to save flag'
          );
        }
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [enabled, sessionId, mergeFlag]
  );

  const toggleResolved = useCallback(
    async (flag) => {
      if (!flag || !flag.id) return null;
      setSaving(true);
      setError(null);
      try {
        const updated = await updateFlag(flag.id, {
          resolved: !flag.resolved,
        });
        if (mountedRef.current) mergeFlag(updated);
        return updated;
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              'Failed to update flag'
          );
        }
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [mergeFlag]
  );

  return { flags, getFlag, saveFlag, toggleResolved, saving, error };
}
