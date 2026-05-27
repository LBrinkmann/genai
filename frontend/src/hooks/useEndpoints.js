import { useState, useEffect, useCallback, useRef } from 'react';
import { getEndpointState, activateEndpoints } from '../services/api';

/**
 * Tracks the readiness of the managed LLM endpoints so the chat can gate
 * its composer. Polls the public `/state` route and exposes an
 * `activate()` action that wakes the endpoints.
 *
 * Fail-open: if the state route errors (e.g. backend briefly down) we
 * treat the chat as ready rather than locking participants out — the
 * chat's own cold-start tolerance still handles a sleeping endpoint.
 */
const POLL_INTERVAL_MS = 5000;

export default function useEndpoints() {
  // Optimistic default: assume ready until the first poll says otherwise.
  const [status, setStatus] = useState({
    ready: true,
    state: 'ready',
    mode: 'auto',
  });
  const [activating, setActivating] = useState(false);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getEndpointState();
      if (s && typeof s === 'object') setStatus(s);
    } catch {
      setStatus({ ready: true, state: 'ready', mode: 'auto' });
    }
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  const activate = useCallback(async () => {
    setActivating(true);
    try {
      const s = await activateEndpoints();
      if (s && typeof s === 'object') setStatus(s);
    } catch {
      // Leave state as-is; the next poll reconciles.
    } finally {
      setActivating(false);
    }
  }, []);

  return {
    ready: status.ready,
    state: status.state,
    mode: status.mode,
    activating,
    activate,
    refresh,
  };
}
