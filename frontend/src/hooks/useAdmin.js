import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
} from '../services/api';

/**
 * Cookie-session admin auth. On mount, calls /api/auth/me once to
 * hydrate state. Exposes login/logout/refresh; all consumers own a
 * local copy of state (only Header consumes this today).
 */
export default function useAdmin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const data = await getMe();
      if (!mountedRef.current) return;
      if (data && data.authenticated) {
        setAuthenticated(true);
        setUser(data.user || null);
      } else {
        setAuthenticated(false);
        setUser(null);
      }
    } catch {
      if (!mountedRef.current) return;
      setAuthenticated(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchMe();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  const login = useCallback(
    async (username, password) => {
      setLoading(true);
      setError(null);
      try {
        await apiLogin(username, password);
        await fetchMe();
        return { ok: true };
      } catch (err) {
        const status = err?.response?.status;
        const detail =
          err?.response?.data?.detail ||
          err?.message ||
          'Invalid credentials';
        if (status === 429) {
          const retryAfter = parseInt(
            err?.response?.headers?.['retry-after'] || '60',
            10
          );
          if (mountedRef.current) {
            setError(
              `Too many attempts; try again in ${retryAfter}s`
            );
          }
          return { ok: false, status: 429, retryAfter };
        }
        if (mountedRef.current) setError(detail);
        return { ok: false, status };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [fetchMe]
  );

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await apiLogout();
    } catch {
      // Best-effort logout; clear local state regardless.
    }
    await fetchMe();
    if (mountedRef.current) setLoading(false);
  }, [fetchMe]);

  const refresh = useCallback(async () => {
    await fetchMe();
  }, [fetchMe]);

  return {
    authenticated,
    user,
    loading,
    error,
    login,
    logout,
    refresh,
  };
}
