import React, { useEffect, useMemo, useRef, useState } from 'react';
import FeedbackPanel from './FeedbackPanel';
import { SimultaneousEntropyMessage } from './effects/SimultaneousEntropyMessage';

/**
 * Tailwind chat surface — renders each message via the canvas dissolve effect.
 *
 * Eviction (D4 + D9):
 *   • A message is "resolved" unless it is a pending RLHF comparison
 *     (`Array.isArray(content) && selected == null`).
 *   • Only the last `visibleLimit` resolved messages stay visible
 *     (`evict=false`). Older resolved messages render with `evict=true`
 *     so the canvas can run its dissolve. Once `onEvicted` fires they
 *     are filtered out of the rendered set; the underlying `messages[]`
 *     in `useChat` is untouched (eviction is display-only).
 *   • Pending comparisons NEVER count toward the visible cap and are
 *     never evicted. Once the user selects, the message becomes a
 *     resolved single response and is eligible for eviction again.
 *
 * The canvas path fires `onEvicted` ~6s after `evict={true}` (5s dissolve
 * + 1s pause); the reduced-motion path fires ~250ms after. The component
 * must tolerate either delay by keeping the message rendered until the
 * callback fires.
 */
function MessageList({
  messages,
  onSelectResponse,
  feedbackCategories = [],
  mainPreferenceFeedback = '',
  onFeedbackConfirm,
  visibleLimit = 3,
}) {
  const endRef = useRef(null);
  const [evictedIds, setEvictedIds] = useState(() => new Set());

  // Reset eviction tracking when the messages array is cleared (e.g. reset).
  useEffect(() => {
    if (messages.length === 0 && evictedIds.size > 0) {
      setEvictedIds(new Set());
    }
  }, [messages.length, evictedIds.size]);

  useEffect(() => {
    if (endRef.current && endRef.current.scrollIntoView) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const isPendingComparison = (msg) =>
    Array.isArray(msg.content) &&
    (msg.selected === null || msg.selected === undefined);

  /**
   * Decide which messages are visible and which should evict.
   * The shape returned per entry: { msg, evict, isPending }.
   * The list still includes locally-evicted-but-not-yet-callback-fired
   * messages so their dissolve animation can complete.
   */
  const renderPlan = useMemo(() => {
    // Walk the full message list from the end to find the last
    // `visibleLimit` resolved messages — these are visible. Everything
    // older that is resolved gets evict=true; pending comparisons are
    // always visible regardless of position.
    const resolvedKept = new Set();
    let keptCount = 0;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (isPendingComparison(m)) continue;
      if (keptCount < visibleLimit) {
        resolvedKept.add(m.index);
        keptCount += 1;
      }
    }

    return messages.map((msg) => {
      const pending = isPendingComparison(msg);
      const kept = resolvedKept.has(msg.index);
      // Pending comparisons: always visible.
      // Resolved + kept: visible.
      // Resolved + not kept: evict (display-only).
      const evict = !pending && !kept;
      return { msg, evict, isPending: pending };
    });
  }, [messages, visibleLimit]);

  const handleEvicted = (msgIndex) => {
    setEvictedIds((prev) => {
      if (prev.has(msgIndex)) return prev;
      const next = new Set(prev);
      next.add(msgIndex);
      return next;
    });
  };

  return (
    <main className="flex-1 overflow-y-auto px-0 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pt-4">
      <div className="mx-auto max-w-2xl">
        {renderPlan.map(({ msg, evict, isPending }) => {
          if (evictedIds.has(msg.index)) return null;

          // Resolved comparison (user selected a response): render the
          // selected response as the canonical message and the feedback
          // panel underneath.
          if (
            Array.isArray(msg.content) &&
            msg.selected !== null &&
            msg.selected !== undefined
          ) {
            const selectedText = msg.content[msg.selected]?.text || '';
            return (
              <div key={msg.index} className="flex w-full flex-col">
                <SimultaneousEntropyMessage
                  content={selectedText}
                  textColor="#D4A864"
                  textAlign="left"
                  evict={evict}
                  onEvicted={() => handleEvicted(msg.index)}
                />
                <div className="mb-2">
                  <FeedbackPanel
                    categories={feedbackCategories}
                    mainPreferenceFeedback={mainPreferenceFeedback}
                    onConfirm={(tags) =>
                      onFeedbackConfirm &&
                      onFeedbackConfirm(msg.index, tags)
                    }
                  />
                </div>
              </div>
            );
          }

          // Pending comparison: temporary placeholder treatment until
          // Phase 4 lands. Two stacked Tailwind cards with Select buttons.
          if (isPending) {
            return (
              <div
                key={msg.index}
                className="mb-4 flex w-full flex-col gap-2"
              >
                {msg.content.map((resp, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                  >
                    <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-200">
                      {resp.text}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectResponse(msg.index, idx)
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            );
          }

          // Plain single response (assistant) or user message.
          const isUser = msg.role === 'user';
          return (
            <SimultaneousEntropyMessage
              key={msg.index}
              content={msg.content}
              textColor={isUser ? '#e0e0e0' : '#D4A864'}
              textAlign={isUser ? 'right' : 'left'}
              evict={evict}
              onEvicted={() => handleEvicted(msg.index)}
            />
          );
        })}
        <div ref={endRef} />
      </div>
    </main>
  );
}

export default MessageList;
