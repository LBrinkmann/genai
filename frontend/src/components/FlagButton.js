import { useEffect, useRef, useState } from 'react';

/**
 * Admin-only flag toggle for a single bot response.
 *
 * Rendered by `MessageList` next to each assistant response when
 * `adminMode` is on. The icon is outlined when unflagged, filled amber
 * when flagged, and dimmed when the flag has been resolved. Clicking
 * opens a compact popover holding the comment, so the whole affordance
 * fits inside a chat bubble.
 *
 * The popover is absolutely positioned with a high z-index because the
 * chat scroll container is `overflow-y-auto` — an in-flow panel would
 * be clipped by the message list.
 */
function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function FlagIcon({ filled }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3v18M3 4.5h12.75l-2.25 4.5 2.25 4.5H3"
      />
    </svg>
  );
}

function FlagButton({
  flag = null,
  botName = null,
  responseText = '',
  onSave,
  onToggleResolved,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState(flag?.comment || '');
  const rootRef = useRef(null);

  // Re-seed the draft whenever the popover opens or the stored comment
  // changes underneath it (e.g. a save round-trip returned).
  useEffect(() => {
    if (open) setComment(flag?.comment || '');
  }, [open, flag]);

  // Click-outside dismissal, same idiom as the Header settings popover.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const flagged = Boolean(flag);
  const resolved = Boolean(flag?.resolved);
  const label = flagged ? 'Edit flag comment' : 'Flag response';

  const iconColor = !flagged
    ? 'text-zinc-500 hover:text-zinc-300'
    : resolved
      ? 'text-amber-400/40 hover:text-amber-400/60'
      : 'text-amber-400 hover:text-amber-300';

  // Fire-and-forget: the popover closes immediately and the caller
  // owns the round-trip (and its error state), so a slow save never
  // leaves the panel hanging open over the transcript.
  const settle = (result) => {
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  };

  const handleSave = () => {
    setOpen(false);
    if (onSave) settle(onSave(comment, { botName, responseText }));
  };

  const handleToggleResolved = () => {
    setOpen(false);
    if (onToggleResolved) settle(onToggleResolved(flag));
  };

  return (
    <span className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-zinc-800/60 disabled:opacity-40 ${iconColor}`}
      >
        <FlagIcon filled={flagged} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Flag comment"
          className="absolute right-0 top-7 z-50 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-lg"
        >
          <textarea
            aria-label="Flag comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="What is wrong with this response?"
            className="w-full resize-y rounded border border-zinc-800 bg-zinc-950 p-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled}
              className="rounded bg-white px-2 py-1 text-xs font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
            >
              Save
            </button>
          </div>
          {flagged && (
            <div className="mt-1.5 border-t border-zinc-800 pt-1.5">
              <button
                type="button"
                onClick={handleToggleResolved}
                disabled={disabled}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {resolved ? 'Reopen' : 'Mark resolved'}
              </button>
              <div className="mt-1.5 text-[10px] text-zinc-500">
                {flag.created_by || 'unknown'}
                {flag.created_at
                  ? ` · ${formatWhen(flag.created_at)}`
                  : ''}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export default FlagButton;
