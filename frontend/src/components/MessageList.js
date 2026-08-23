import React, { useEffect, useMemo, useRef, useState } from 'react';
import FeedbackPanel from './FeedbackPanel';
import FlagButton from './FlagButton';
import { SimultaneousEntropyMessage } from './effects/SimultaneousEntropyMessage';
import { StreamingCanvasMessage } from './effects/StreamingCanvasMessage';

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
 *
 * Admin flags (`adminMode`): a FlagButton is rendered next to every
 * assistant response — never on user messages and never while a
 * response is still streaming. With `adminMode` false nothing extra is
 * rendered at all, so the participant surface is unchanged.
 */
function MessageList({
  messages,
  onSelectResponse,
  feedbackCategories = [],
  mainPreferenceFeedback = '',
  onFeedbackConfirm,
  visibleLimit = 3,
  testMode = false,
  adminMode = false,
  getFlag,
  onSaveFlag,
  onToggleResolved,
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

  /**
   * Flag control for one assistant response. Returns null outside
   * admin mode so the participant DOM is untouched.
   */
  const renderFlag = (messageIndex, responseIndex, botName, text) => {
    if (!adminMode) return null;
    const flag = getFlag ? getFlag(messageIndex, responseIndex) : null;
    return (
      <FlagButton
        flag={flag}
        botName={botName}
        responseText={text}
        onSave={(comment) =>
          onSaveFlag &&
          onSaveFlag({
            messageIndex,
            responseIndex,
            botName,
            responseText: text,
            comment,
          })
        }
        onToggleResolved={(f) => onToggleResolved && onToggleResolved(f)}
      />
    );
  };

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
              <div
                key={msg.index}
                className="relative flex w-full flex-col"
              >
                <SimultaneousEntropyMessage
                  content={selectedText}
                  textColor="#D4A864"
                  textAlign="left"
                  evict={evict}
                  onEvicted={() => handleEvicted(msg.index)}
                />
                {adminMode && !evict && (
                  <div className="mb-1 flex justify-start">
                    {renderFlag(
                      msg.index,
                      msg.selected,
                      msg.content[msg.selected]?.bot,
                      selectedText
                    )}
                  </div>
                )}
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

          // Parallel test mode: one labelled column per active bot,
          // side by side. No Select button — the threads stay
          // independent and nothing is ever chosen, so these never
          // resolve into a canonical message.
          if (isPending && testMode) {
            return (
              <div
                key={msg.index}
                className="mb-4 flex w-full flex-col gap-2 sm:flex-row"
              >
                {msg.content.map((resp, idx) => (
                  <div
                    key={idx}
                    className={`${
                      adminMode ? 'relative ' : ''
                    }flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4`}
                  >
                    {adminMode && (
                      <div className="absolute right-2 top-2">
                        {renderFlag(
                          msg.index,
                          idx,
                          resp.bot,
                          resp.text
                        )}
                      </div>
                    )}
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {resp.bot}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-zinc-200">
                      {resp.text}
                    </p>
                  </div>
                ))}
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
                {msg.content.map((resp, idx) => {
                  const selectButton = (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectResponse(msg.index, idx)
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                    >
                      Select
                    </button>
                  );
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                    >
                      <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-200">
                        {resp.text}
                      </p>
                      {adminMode ? (
                        <div className="flex items-center gap-2">
                          {selectButton}
                          {renderFlag(
                            msg.index,
                            idx,
                            resp.bot,
                            resp.text
                          )}
                        </div>
                      ) : (
                        selectButton
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          // Plain single response (assistant) or user message.
          const isUser = msg.role === 'user';
          const color = isUser ? '#e0e0e0' : '#D4A864';
          const align = isUser ? 'right' : 'left';

          // While the assistant response is still streaming, render a
          // lightweight canvas that redraws per chunk. The full
          // particle/dissolve component mounts only after the stream
          // completes (msg.streaming flips false), so the swap happens
          // exactly once at the moment the last chunk arrives — while
          // the bubble is still settling from its final growth.
          if (msg.streaming) {
            return (
              <StreamingCanvasMessage
                key={msg.index}
                content={msg.content}
                textColor={color}
                textAlign={align}
              />
            );
          }

          // The message body is canvas-rendered, so the flag control
          // cannot live inside it: wrap the bubble and put the button
          // in a row underneath, on the message's own side.
          if (adminMode && !isUser && !evict) {
            return (
              <div
                key={msg.index}
                className="relative flex w-full flex-col"
              >
                <SimultaneousEntropyMessage
                  content={msg.content}
                  textColor={color}
                  textAlign={align}
                  evict={evict}
                  onEvicted={() => handleEvicted(msg.index)}
                />
                <div className="mb-1 flex justify-start">
                  {renderFlag(
                    msg.index,
                    0,
                    msg.bot_ids?.[0],
                    msg.content
                  )}
                </div>
              </div>
            );
          }

          return (
            <SimultaneousEntropyMessage
              key={msg.index}
              content={msg.content}
              textColor={color}
              textAlign={align}
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
