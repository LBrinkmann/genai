import { useState, useEffect, useCallback, useRef } from 'react';
import client, {
  listLLMEndpoints,
  resumeLLMEndpoint,
  pauseLLMEndpoint,
} from '../services/api';
import useAdmin from '../hooks/useAdmin';
import LoginModal from './LoginModal';

const dotClass = {
  online: 'bg-emerald-500',
  loading: 'bg-amber-500',
  error: 'bg-rose-500',
};

// Lowercased state → tailwind classes for the pill badge.
const STATE_STYLES = {
  running: 'bg-emerald-500/20 text-emerald-300',
  paused: 'bg-zinc-700/40 text-zinc-300',
  scaledtozero: 'bg-amber-500/20 text-amber-300',
  initializing: 'bg-amber-500/20 text-amber-300 animate-pulse',
  pending: 'bg-amber-500/20 text-amber-300 animate-pulse',
  updating: 'bg-amber-500/20 text-amber-300 animate-pulse',
  failed: 'bg-rose-500/20 text-rose-300',
  unknown: 'bg-zinc-700/40 text-zinc-300',
};

const START_STATES = new Set([
  'paused',
  'scaledtozero',
  'failed',
]);
const STOP_STATES = new Set([
  'running',
  'initializing',
  'pending',
  'updating',
]);

function normState(s) {
  return String(s || 'unknown').toLowerCase().replace(/[-_]/g, '');
}

function StateBadge({ state }) {
  const key = normState(state);
  const style = STATE_STYLES[key] || STATE_STYLES.unknown;
  const label =
    String(state || 'unknown').charAt(0).toUpperCase() +
    String(state || 'unknown').slice(1);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}

/**
 * Minimal Tailwind-only corner cluster (D5):
 *   bot status dots + settings dropdown.
 * Absolutely positioned in the top-right of the chat surface — no
 * AppBar, no branding text (D11).
 */
function Header({ onReset, configName }) {
  const { authenticated, user, login, logout } = useAdmin();
  const [botStatuses, setBotStatuses] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [endpoints, setEndpoints] = useState([]);
  const [pendingBot, setPendingBot] = useState(null);
  const [confirmingPauseFor, setConfirmingPauseFor] =
    useState(null);
  const menuRef = useRef(null);
  const pollRef = useRef(null);

  const checkStatus = useCallback(async () => {
    if (!configName) return;
    try {
      const resp = await client.get(
        `/api/health/bots?config=${encodeURIComponent(configName)}`
      );
      setBotStatuses(resp.data.bots || []);
    } catch {
      setBotStatuses([]);
    }
  }, [configName]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Click-outside dismissal for the settings popover.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        // Don't close the menu while the login modal is open —
        // the modal lives outside menuRef.
        if (loginOpen) return;
        setMenuOpen(false);
        setConfirmingPauseFor(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen, loginOpen]);

  // Poll endpoints while menu is open AND user is authenticated.
  const refreshEndpoints = useCallback(async () => {
    try {
      const data = await listLLMEndpoints();
      setEndpoints(Array.isArray(data) ? data : []);
    } catch {
      setEndpoints([]);
    }
  }, []);

  useEffect(() => {
    if (!(menuOpen && authenticated)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return undefined;
    }
    refreshEndpoints();
    pollRef.current = setInterval(refreshEndpoints, 10000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [menuOpen, authenticated, refreshEndpoints]);

  const handleReset = () => {
    setMenuOpen(false);
    setConfirmingPauseFor(null);
    if (onReset) onReset();
  };

  const handleResume = async (botName) => {
    setPendingBot(botName);
    try {
      const updated = await resumeLLMEndpoint(botName);
      setEndpoints((prev) =>
        prev.map((e) =>
          e.bot_name === botName ? { ...e, ...updated } : e
        )
      );
    } catch {
      // Leave the row as-is; next poll will reconcile.
    } finally {
      setPendingBot(null);
    }
  };

  const handleConfirmPause = async (botName) => {
    setPendingBot(botName);
    try {
      const updated = await pauseLLMEndpoint(botName);
      setEndpoints((prev) =>
        prev.map((e) =>
          e.bot_name === botName ? { ...e, ...updated } : e
        )
      );
    } catch {
      // Leave the row as-is.
    } finally {
      setPendingBot(null);
      setConfirmingPauseFor(null);
    }
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    setConfirmingPauseFor(null);
    await logout();
  };

  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        {botStatuses.length === 0 ? (
          <span
            className={`h-2.5 w-2.5 rounded-full ${dotClass.loading}`}
            title="Checking..."
            data-testid="status-indicator"
          />
        ) : (
          botStatuses.map((b) => (
            <span
              key={b.name}
              className={`h-2.5 w-2.5 rounded-full ${
                dotClass[b.status] || dotClass.error
              }`}
              title={`${b.name}: ${b.status}`}
              data-testid="status-indicator"
            />
          ))
        )}
      </div>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Settings"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800/60 hover:text-white"
        >
          {/* Heroicons "cog-6-tooth" (outline) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-72 rounded-xl border border-zinc-800 bg-zinc-900/95 p-1 text-sm shadow-lg backdrop-blur"
          >
            {!authenticated ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => setLoginOpen(true)}
                className="block w-full rounded px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
              >
                Log in
              </button>
            ) : (
              <div className="flex flex-col">
                <div className="px-3 py-1.5 text-xs text-zinc-500">
                  Logged in as{' '}
                  <span className="text-zinc-300">{user}</span>
                </div>
                {endpoints.length > 0 && (
                  <div className="border-t border-zinc-800 px-1 py-1">
                    {endpoints.map((ep) => {
                      const key = normState(ep.state);
                      const inFlight = pendingBot === ep.bot_name;
                      const canStart = START_STATES.has(key);
                      const canStop = STOP_STATES.has(key);
                      if (confirmingPauseFor === ep.bot_name) {
                        return (
                          <div
                            key={ep.bot_name}
                            className="rounded px-2 py-2"
                          >
                            <div className="mb-2 text-xs text-zinc-300">
                              Disconnect users? Active sessions
                              will fail until resumed.
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={inFlight}
                                onClick={() =>
                                  setConfirmingPauseFor(null)
                                }
                                className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-white disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={inFlight}
                                onClick={() =>
                                  handleConfirmPause(ep.bot_name)
                                }
                                className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                              >
                                {inFlight
                                  ? 'Pausing…'
                                  : 'Confirm pause'}
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={ep.bot_name}
                          className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-xs text-zinc-200">
                              {ep.bot_name}
                            </span>
                            <StateBadge state={ep.state} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            {inFlight && (
                              <span
                                className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400"
                                aria-hidden
                              />
                            )}
                            {canStart && (
                              <button
                                type="button"
                                disabled={inFlight}
                                onClick={() =>
                                  handleResume(ep.bot_name)
                                }
                                className="rounded-md bg-white px-2 py-1 text-xs font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
                              >
                                Start
                              </button>
                            )}
                            {canStop && (
                              <button
                                type="button"
                                disabled={inFlight}
                                onClick={() =>
                                  setConfirmingPauseFor(ep.bot_name)
                                }
                                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                              >
                                Stop
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {onReset && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleReset}
                    className="block w-full rounded px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
                  >
                    Reset conversation
                  </button>
                )}
                <div className="border-t border-zinc-800" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="block w-full rounded px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={async (u, p) => {
          const r = await login(u, p);
          if (r.ok) setLoginOpen(false);
          return r;
        }}
      />
    </div>
  );
}

export default Header;
