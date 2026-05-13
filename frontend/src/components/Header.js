import { useState, useEffect, useCallback, useRef } from 'react';
import client from '../services/api';

const dotClass = {
  online: 'bg-emerald-500',
  loading: 'bg-amber-500',
  error: 'bg-rose-500',
};

/**
 * Minimal Tailwind-only corner cluster (D5):
 *   bot status dots + settings dropdown.
 * Absolutely positioned in the top-right of the chat surface — no
 * AppBar, no branding text (D11).
 */
function Header({ accessKey, onReset, configName }) {
  const [botStatuses, setBotStatuses] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const handleReset = () => {
    setMenuOpen(false);
    if (onReset) onReset();
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
            className="absolute right-0 mt-2 min-w-[10rem] rounded-md border border-zinc-800 bg-zinc-900/95 p-1 text-sm shadow-lg backdrop-blur"
          >
            {accessKey ? (
              <button
                type="button"
                role="menuitem"
                onClick={handleReset}
                className="block w-full rounded px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
              >
                Reset conversation
              </button>
            ) : (
              <div
                role="menuitem"
                aria-disabled="true"
                className="px-3 py-1.5 text-zinc-500"
              >
                No admin controls
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Header;
