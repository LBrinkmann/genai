import React from 'react';

/**
 * Replaces the chat composer when the managed endpoints aren't ready.
 * Covers the non-ready `state` values surfaced by `useEndpoints`:
 *   - asleep      → "Wake the AI" button (public, no login)
 *   - waking      → spinner, no action (poll will flip to ready)
 *   - disabled    → admin turned chat off
 *   - unavailable → HF unreachable; offer a retry via the same wake
 *
 * Rendered only when `!ready`; the parent keeps the normal composer
 * otherwise.
 */
function EndpointGate({ state, activating, onActivate }) {
  const base =
    'mx-auto flex w-full max-w-2xl flex-col items-center gap-3 rounded-xl ' +
    'border border-zinc-800 bg-zinc-900/70 px-6 py-5 text-center backdrop-blur';

  if (state === 'waking') {
    return (
      <div className={base} data-testid="endpoint-gate" aria-live="polite">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-white"
          aria-hidden
        />
        <p className="text-sm text-zinc-300">
          Waking the AI… this can take up to 3 minutes.
        </p>
      </div>
    );
  }

  if (state === 'disabled') {
    return (
      <div className={base} data-testid="endpoint-gate">
        <p className="text-sm text-zinc-300">
          Chat is currently turned off by the administrator.
        </p>
      </div>
    );
  }

  const isError = state === 'unavailable';
  return (
    <div className={base} data-testid="endpoint-gate">
      <p className="text-sm text-zinc-300">
        {isError
          ? "Couldn't reach the AI right now."
          : 'The AI is asleep to save costs.'}
      </p>
      <button
        type="button"
        onClick={onActivate}
        disabled={activating}
        className="rounded-xl bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {activating ? 'Starting…' : isError ? 'Retry' : 'Wake the AI'}
      </button>
      {!isError && (
        <p className="text-xs text-zinc-500">
          It powers down automatically after a while of no use.
        </p>
      )}
    </div>
  );
}

export default EndpointGate;
