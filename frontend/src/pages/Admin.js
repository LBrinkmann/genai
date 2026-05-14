import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useAdmin from '../hooks/useAdmin';
import LoginModal from '../components/LoginModal';
import {
  getAdminConfig,
  patchAdminConfig,
} from '../services/api';

/**
 * /admin — dedicated page for operator config overrides. Auth-gated
 * via the same admin_session cookie used elsewhere. Tailwind-only.
 */
function Section({ title, children, error, status }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-100">{title}</h2>
        {status && (
          <span className="text-xs text-zinc-400">{status}</span>
        )}
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

function Admin() {
  const { authenticated, user, login, logout, loading: authLoading } =
    useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);

  // Per-section local state.
  const [activeFc, setActiveFc] = useState('');
  const [visibleLimit, setVisibleLimit] = useState('');
  const [contextLimit, setContextLimit] = useState('');
  const [botMessages, setBotMessages] = useState({});

  // Per-section status messages so the user gets feedback after save.
  const [statusFc, setStatusFc] = useState(null);
  const [statusLimits, setStatusLimits] = useState(null);
  const [statusBot, setStatusBot] = useState({});

  const hydrate = useCallback((resp) => {
    setData(resp);
    setActiveFc(resp.overrides?.active_feedback_config || '');
    setVisibleLimit(
      typeof resp.overrides?.visible_limit === 'number'
        ? String(resp.overrides.visible_limit)
        : ''
    );
    if ('context_limit' in (resp.overrides || {})) {
      setContextLimit(
        resp.overrides.context_limit === null
          ? ''
          : String(resp.overrides.context_limit)
      );
    } else {
      setContextLimit('');
    }
    const initialBots = {};
    (resp.merged?.bots || []).forEach((b) => {
      initialBots[b.name] = b.system_message || '';
    });
    setBotMessages(initialBots);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getAdminConfig();
      hydrate(resp);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        setData(null);
      } else {
        setError(
          err?.response?.data?.detail ||
            err.message ||
            'Failed to load admin config'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    if (!authLoading && authenticated) {
      load();
    }
  }, [authLoading, authenticated, load]);

  const applyPatch = async (patch, statusSetter, key = null) => {
    setError(null);
    try {
      const resp = await patchAdminConfig(patch);
      hydrate(resp);
      if (key !== null) {
        statusSetter((prev) => ({ ...prev, [key]: 'Saved' }));
        setTimeout(
          () =>
            statusSetter((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            }),
          1500
        );
      } else {
        statusSetter('Saved');
        setTimeout(() => statusSetter(null), 1500);
      }
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err.message ||
        'Save failed';
      if (key !== null) {
        statusSetter((prev) => ({ ...prev, [key]: `Error: ${detail}` }));
      } else {
        statusSetter(`Error: ${detail}`);
      }
    }
  };

  const handleSaveFc = () => {
    applyPatch(
      { active_feedback_config: activeFc || null },
      setStatusFc
    );
  };

  const handleResetFc = () => {
    setActiveFc('');
    applyPatch({ active_feedback_config: null }, setStatusFc);
  };

  const handleSaveLimits = () => {
    const patch = {};
    if (visibleLimit === '') {
      patch.visible_limit = null;
    } else {
      const n = Number(visibleLimit);
      if (!Number.isFinite(n) || n < 1) {
        setStatusLimits('Error: visible_limit must be ≥ 1');
        return;
      }
      patch.visible_limit = Math.floor(n);
    }
    if (contextLimit === '') {
      // Empty input → reset override (YAML default applies).
      patch.context_limit = null;
    } else {
      const n = Number(contextLimit);
      if (!Number.isFinite(n) || n < 1) {
        setStatusLimits('Error: context_limit must be ≥ 1 or empty');
        return;
      }
      patch.context_limit = Math.floor(n);
    }
    applyPatch(patch, setStatusLimits);
  };

  const handleResetLimits = () => {
    setVisibleLimit('');
    setContextLimit('');
    applyPatch(
      { visible_limit: null, context_limit: null },
      setStatusLimits
    );
  };

  const handleSaveBot = (botName) => {
    const msg = botMessages[botName];
    if (!msg || !msg.trim()) {
      setStatusBot((prev) => ({
        ...prev,
        [botName]: 'Error: cannot be empty',
      }));
      return;
    }
    applyPatch(
      {
        bot_overrides: {
          [botName]: { system_message: msg },
        },
      },
      setStatusBot,
      botName
    );
  };

  const handleResetBot = (botName) => {
    applyPatch(
      {
        bot_overrides: {
          [botName]: null,
        },
      },
      setStatusBot,
      botName
    );
  };

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
        <p className="text-sm">
          Please log in to access admin settings.
        </p>
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

  const bots = data?.merged?.bots || [];
  const fcs = data?.available_feedback_configs || [];

  // Derive YAML defaults for the helper text under each input.
  // The override agent applies visible/context_limit to every feedback_config,
  // so the YAML default we show is the one on the YAML-default-active config
  // (`defaults.config`) — the one users see without overrides.
  const yamlDefaultFcName = data?.yaml_defaults?.defaults?.config;
  const yamlDefaultFc = (data?.yaml_defaults?.feedback_configs || []).find(
    (fc) => fc.name === yamlDefaultFcName
  );
  const yamlDefaultVisible = yamlDefaultFc?.visible_limit;
  const yamlDefaultContext =
    yamlDefaultFc && 'context_limit' in yamlDefaultFc
      ? yamlDefaultFc.context_limit
      : undefined;
  const yamlDefaultBotMessage = (botName) =>
    (data?.yaml_defaults?.bots || []).find((b) => b.name === botName)
      ?.system_message || '';

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-xs text-zinc-400 hover:text-white"
            >
              ← Back to chat
            </Link>
            <h1 className="text-base font-medium">Admin settings</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span>
              Logged in as{' '}
              <span className="text-zinc-200">{user}</span>
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
        {loading && (
          <div className="text-xs text-zinc-400">Loading config…</div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-rose-700/40 bg-rose-900/20 p-3 text-xs text-rose-300"
          >
            {error}
          </div>
        )}

        <Section
          title="Active feedback config"
          status={statusFc}
        >
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Choose a feedback_config (overrides YAML default)
            <select
              value={activeFc}
              onChange={(e) => setActiveFc(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600"
            >
              <option value="">(use YAML default)</option>
              {fcs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-zinc-500">
              YAML default:{' '}
              <code className="text-zinc-400">
                {data?.yaml_defaults?.defaults?.config ?? '—'}
              </code>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <GhostButton onClick={handleResetFc}>
              Reset to YAML default
            </GhostButton>
            <PrimaryButton onClick={handleSaveFc}>Save</PrimaryButton>
          </div>
        </Section>

        <Section title="Display limits" status={statusLimits}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              visible_limit
              <input
                type="number"
                min={1}
                value={visibleLimit}
                onChange={(e) => setVisibleLimit(e.target.value)}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600"
                placeholder="(YAML default)"
              />
              <span className="text-[11px] text-zinc-500">
                YAML default:{' '}
                <code className="text-zinc-400">
                  {yamlDefaultVisible ?? '—'}
                </code>
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              context_limit (empty = unlimited)
              <input
                type="number"
                min={1}
                value={contextLimit}
                onChange={(e) => setContextLimit(e.target.value)}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600"
                placeholder="(YAML default)"
              />
              <span className="text-[11px] text-zinc-500">
                YAML default:{' '}
                <code className="text-zinc-400">
                  {yamlDefaultContext === null
                    ? 'null (unlimited)'
                    : yamlDefaultContext ?? '—'}
                </code>
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <GhostButton onClick={handleResetLimits}>
              Reset to YAML default
            </GhostButton>
            <PrimaryButton onClick={handleSaveLimits}>
              Save
            </PrimaryButton>
          </div>
        </Section>

        <Section title="Bot personas">
          <div className="flex flex-col gap-4">
            {bots.length === 0 && (
              <div className="text-xs text-zinc-500">
                No bots configured.
              </div>
            )}
            {bots.map((bot) => (
              <div
                key={bot.name}
                className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <label
                    className="text-xs text-zinc-400"
                    htmlFor={`bot-${bot.name}`}
                  >
                    {bot.display_name || bot.name}{' '}
                    <span className="text-zinc-600">({bot.name})</span>
                  </label>
                  {statusBot[bot.name] && (
                    <span className="text-xs text-zinc-400">
                      {statusBot[bot.name]}
                    </span>
                  )}
                </div>
                <textarea
                  id={`bot-${bot.name}`}
                  rows={4}
                  value={botMessages[bot.name] || ''}
                  onChange={(e) =>
                    setBotMessages((prev) => ({
                      ...prev,
                      [bot.name]: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600"
                />
                <details className="mt-2 text-[11px] text-zinc-500">
                  <summary className="cursor-pointer hover:text-zinc-300">
                    YAML default
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded border border-zinc-800/60 bg-zinc-950/60 p-2 text-zinc-400">
                    {yamlDefaultBotMessage(bot.name) || '(empty)'}
                  </pre>
                </details>
                <div className="mt-2 flex justify-end gap-2">
                  <GhostButton
                    onClick={() => handleResetBot(bot.name)}
                  >
                    Reset to YAML default
                  </GhostButton>
                  <PrimaryButton
                    onClick={() => handleSaveBot(bot.name)}
                  >
                    Save
                  </PrimaryButton>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </main>
    </div>
  );
}

export default Admin;
