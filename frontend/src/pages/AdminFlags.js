import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useAdmin from '../hooks/useAdmin';
import LoginModal from '../components/LoginModal';
import {
  listFlags,
  updateFlag,
  getFlagContext,
} from '../services/api';

/**
 * /admin/flags — review surface for admin response flags. Same auth
 * gate and Tailwind idiom as /admin. Two views in one page: a filtered
 * list of flags, and a detail view that pulls the full conversation
 * that produced the flagged response.
 */
function Section({ title, children, error, status }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-100">{title}</h2>
        {status && <span className="text-xs text-zinc-400">{status}</span>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
      {error && (
        <div className="mt-3 text-xs text-rose-400" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function PrimaryButton({ children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-zinc-200 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GhostButton({ children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

const STATUS_TABS = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

// Relative for anything recent, locale string beyond a week — the
// list is newest-first so most rows land in the relative branch.
function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return d.toLocaleString();
}

function snippet(text, max = 160) {
  if (!text) return '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// An assistant turn stores either a plain string (single-bot) or an
// array of { bot, text } (comparison / parallel). Normalise both to
// the array shape so the transcript renderer has one code path.
function responsesOf(message) {
  const content = message?.content;
  if (Array.isArray(content)) {
    return content.map((c, i) => ({
      bot: c?.bot ?? (message.bot_ids || [])[i] ?? null,
      text: typeof c?.text === 'string' ? c.text : String(c?.text ?? ''),
    }));
  }
  return [
    {
      bot: (message?.bot_ids || [])[0] ?? null,
      text: typeof content === 'string' ? content : String(content ?? ''),
    },
  ];
}

function ResolvedBadge({ resolved }) {
  return (
    <span
      className={
        'rounded-full border px-2 py-0.5 text-[10px] font-medium ' +
        (resolved
          ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
          : 'border-amber-800/60 bg-amber-950/30 text-amber-300')
      }
    >
      {resolved ? 'Resolved' : 'Open'}
    </span>
  );
}

function FlagRow({ flag, onOpen }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(flag)}
        className="w-full rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900/60"
      >
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span>{formatTime(flag.created_at)}</span>
          <span className="text-zinc-300">
            {flag.bot_name || 'unknown bot'}
          </span>
          <span className="text-zinc-600">
            #{flag.message_index}:{flag.response_index}
          </span>
          {flag.created_by && <span>by {flag.created_by}</span>}
          <ResolvedBadge resolved={flag.resolved} />
        </div>
        <div className="text-xs text-zinc-400">
          {snippet(flag.response_text) || (
            <span className="text-zinc-600">(no response snapshot)</span>
          )}
        </div>
        {flag.comment ? (
          <div className="mt-1 text-xs text-zinc-200">{flag.comment}</div>
        ) : (
          <div className="mt-1 text-xs text-zinc-600">(no comment)</div>
        )}
      </button>
    </li>
  );
}

function Transcript({ messages, flag }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const responses = responsesOf(msg);
        return (
          <div key={msg.index} className="flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-wide text-zinc-600">
              {msg.role} · #{msg.index}
            </div>
            {isUser ? (
              <div className="whitespace-pre-wrap rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3 text-xs text-zinc-300">
                {responses[0].text}
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                {responses.map((resp, idx) => {
                  const flagged =
                    msg.index === flag.message_index &&
                    idx === flag.response_index;
                  return (
                    <div
                      key={idx}
                      data-testid={
                        flagged ? 'flagged-response' : 'response'
                      }
                      className={
                        'flex-1 whitespace-pre-wrap rounded-lg border p-3 text-xs ' +
                        (flagged
                          ? 'border-amber-500/70 bg-amber-950/20 text-zinc-100 ring-2 ring-amber-500/60'
                          : 'border-zinc-800/60 bg-zinc-950/40 text-zinc-300')
                      }
                    >
                      <div className="mb-1 flex items-center gap-2 text-[11px] text-zinc-500">
                        <span>{resp.bot || 'assistant'}</span>
                        {msg.selected === idx && (
                          <span className="text-emerald-400">selected</span>
                        )}
                        {flagged && (
                          <span className="font-medium text-amber-400">
                            flagged
                          </span>
                        )}
                      </div>
                      {resp.text}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AdminFlags() {
  const { authenticated, user, login, logout, loading: authLoading } =
    useAdmin();
  const [loginOpen, setLoginOpen] = useState(false);

  const [status, setStatus] = useState('open');
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState(null);

  const [comment, setComment] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);

  const describeError = (err, fallback) =>
    err?.response?.data?.detail || err?.message || fallback;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await listFlags({ status });
      setFlags(Array.isArray(resp) ? resp : []);
    } catch (err) {
      if (err?.response?.status === 401) {
        setFlags([]);
      } else {
        setError(describeError(err, 'Failed to load flags'));
      }
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (!authLoading && authenticated) {
      load();
    }
  }, [authLoading, authenticated, load]);

  const openFlag = useCallback(async (flag) => {
    setSelected(flag);
    setComment(flag.comment || '');
    setSaveStatus(null);
    setContext(null);
    setContextError(null);
    setContextLoading(true);
    try {
      const resp = await getFlagContext(flag.id);
      setContext(resp);
      if (resp?.flag) {
        setSelected(resp.flag);
        setComment(resp.flag.comment || '');
      }
    } catch (err) {
      const code = err?.response?.status;
      if (code === 404) {
        setContextError('This flag no longer exists.');
      } else if (code === 401) {
        setContextError('Session expired — please log in again.');
      } else {
        setContextError(
          describeError(err, 'Failed to load conversation context')
        );
      }
    } finally {
      setContextLoading(false);
    }
  }, []);

  const backToList = () => {
    setSelected(null);
    setContext(null);
    setContextError(null);
    setSaveStatus(null);
  };

  // Keep the list in step with an edit without a refetch, and drop the
  // row when it no longer matches the active filter.
  const mergeFlag = useCallback(
    (updated) => {
      setFlags((prev) => {
        const next = prev.map((f) =>
          f.id === updated.id ? { ...f, ...updated } : f
        );
        if (status === 'open') return next.filter((f) => !f.resolved);
        if (status === 'resolved') return next.filter((f) => f.resolved);
        return next;
      });
      setSelected((prev) =>
        prev && prev.id === updated.id ? { ...prev, ...updated } : prev
      );
      setContext((prev) =>
        prev && prev.flag && prev.flag.id === updated.id
          ? { ...prev, flag: { ...prev.flag, ...updated } }
          : prev
      );
    },
    [status]
  );

  const applyPatch = async (patch, okMessage) => {
    if (!selected) return;
    setSaveStatus(null);
    try {
      const updated = await updateFlag(selected.id, patch);
      mergeFlag(updated);
      setSaveStatus(okMessage);
      setTimeout(() => setSaveStatus(null), 1500);
    } catch (err) {
      setSaveStatus(`Error: ${describeError(err, 'Save failed')}`);
    }
  };

  const handleSaveComment = () => applyPatch({ comment }, 'Saved');

  const handleToggleResolved = () =>
    applyPatch(
      { resolved: !selected.resolved },
      selected.resolved ? 'Reopened' : 'Resolved'
    );

  if (authLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 text-zinc-300">
        Loading…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center text-zinc-300">
        <p className="text-sm">Please log in to review response flags.</p>
        <div className="flex gap-2">
          <Link
            to="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            ← Back to chat
          </Link>
          <PrimaryButton onClick={() => setLoginOpen(true)}>
            Log in
          </PrimaryButton>
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

  const session = context?.session || null;
  const messages = context?.messages || [];
  const notLogged = !session || messages.length === 0;

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              className="text-xs text-zinc-400 hover:text-white"
            >
              ← Admin settings
            </Link>
            <h1 className="text-base font-medium">Response flags</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span>
              Logged in as <span className="text-zinc-200">{user}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
        {!selected && (
          <Section title="Flags">
            <div
              role="group"
              aria-label="Filter flags by status"
              className="flex flex-wrap gap-2"
            >
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={status === tab.key}
                  onClick={() => setStatus(tab.key)}
                  className={
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ' +
                    (status === tab.key
                      ? 'border-zinc-500 bg-zinc-700 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800')
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loading && (
              <div className="text-xs text-zinc-400">Loading flags…</div>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-md border border-rose-700/40 bg-rose-900/20 p-3 text-xs text-rose-300"
              >
                {error}
              </div>
            )}
            {!loading && !error && flags.length === 0 && (
              <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-6 text-center text-xs text-zinc-500">
                No {status === 'all' ? '' : `${status} `}flags yet. Flag a
                response from the chat while logged in as an admin.
              </div>
            )}
            {flags.length > 0 && (
              <ul className="flex flex-col gap-2">
                {flags.map((flag) => (
                  <FlagRow key={flag.id} flag={flag} onOpen={openFlag} />
                ))}
              </ul>
            )}
          </Section>
        )}

        {selected && (
          <>
            <div className="flex items-center justify-between">
              <GhostButton onClick={backToList}>
                ← Back to flags
              </GhostButton>
              <ResolvedBadge resolved={selected.resolved} />
            </div>

            <Section title="Flag" status={saveStatus}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-400">
                <dt>Session</dt>
                <dd className="font-mono text-zinc-300">
                  {selected.session_id}
                </dd>
                <dt>Response</dt>
                <dd className="text-zinc-300">
                  turn #{selected.message_index}, response{' '}
                  {selected.response_index}
                  {selected.bot_name ? ` — ${selected.bot_name}` : ''}
                </dd>
                <dt>Flagged</dt>
                <dd className="text-zinc-300">
                  {formatTime(selected.created_at)}
                  {selected.created_by ? ` by ${selected.created_by}` : ''}
                </dd>
                {session && (
                  <>
                    <dt>User</dt>
                    <dd className="text-zinc-300">
                      {session.user_id || '—'}
                    </dd>
                    <dt>Config</dt>
                    <dd className="text-zinc-300">
                      {session.feedback_config_name || '—'}
                    </dd>
                  </>
                )}
              </dl>

              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Comment
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600"
                />
              </label>
              <div className="flex justify-end gap-2">
                <GhostButton onClick={handleToggleResolved}>
                  {selected.resolved ? 'Reopen' : 'Mark resolved'}
                </GhostButton>
                <PrimaryButton onClick={handleSaveComment}>
                  Save comment
                </PrimaryButton>
              </div>
            </Section>

            <Section title="Conversation" error={contextError}>
              {contextLoading && (
                <div className="text-xs text-zinc-400">
                  Loading conversation…
                </div>
              )}
              {!contextLoading && !contextError && notLogged && (
                <>
                  <div
                    role="status"
                    className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-300"
                  >
                    This conversation was not logged, so there is no
                    transcript to show. Only the response snapshot taken
                    when the flag was created survives.
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg border border-amber-500/70 bg-amber-950/20 p-3 text-xs text-zinc-100 ring-2 ring-amber-500/60">
                    <div className="mb-1 text-[11px] text-zinc-500">
                      {selected.bot_name || 'assistant'} — flagged response
                    </div>
                    {selected.response_text || '(empty response)'}
                  </div>
                </>
              )}
              {!contextLoading && !contextError && !notLogged && (
                <Transcript messages={messages} flag={selected} />
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

export default AdminFlags;
