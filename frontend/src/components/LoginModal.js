import { useState, useEffect, useRef } from 'react';

/**
 * Tailwind-only login dialog. Pure presentational — the parent
 * (Header) owns the auth state and passes onLogin.
 *
 * Props:
 *   open       boolean — controls visibility.
 *   onClose    () => void — backdrop click / Escape / Cancel.
 *   onLogin    (username, password) => Promise<{ok, status?, retryAfter?}>.
 */
function LoginModal({ open, onClose, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const usernameRef = useRef(null);

  // Focus the username field whenever the modal flips to open.
  useEffect(() => {
    if (open) {
      setError(null);
      // Defer to next tick so the input is mounted before focusing.
      const t = setTimeout(() => {
        if (usernameRef.current) usernameRef.current.focus();
      }, 0);
      return () => clearTimeout(t);
    }
    // On close: reset fields for a clean reopen.
    setUsername('');
    setPassword('');
    setSubmitting(false);
    return undefined;
  }, [open]);

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose && onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onLogin(username.trim(), password);
      if (!result || !result.ok) {
        if (result && result.status === 429 && result.retryAfter) {
          setError(
            `Too many attempts; try again in ${result.retryAfter}s`
          );
        } else {
          setError('Invalid credentials');
        }
      }
      // On success the parent will close us via the `open` prop.
    } catch {
      setError('Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        // Only treat clicks that started on the backdrop as
        // dismissals — clicks that started inside the panel and
        // released on the backdrop should NOT close.
        if (e.target === e.currentTarget) onClose && onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Admin login"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-white shadow-2xl"
      >
        <h2 className="mb-4 text-base font-medium text-zinc-100">
          Admin login
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Username
            <input
              ref={usernameRef}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600 disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600 disabled:opacity-60"
            />
          </label>
          {error && (
            <div
              role="alert"
              className="text-xs text-red-400"
            >
              {error}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl px-4 py-2 text-sm text-zinc-400 transition hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="rounded-xl bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginModal;
