import { useState, useCallback, useRef } from 'react';
import {
  saveMessage,
  sendChat,
  streamChat,
} from '../services/api';

export default function useChat({
  bots = [],
  sessionId = null,
  userId = null,
  loggingEnabled = false,
  contextLimit = null,
}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Per-message AbortControllers for in-flight streaming responses.
  // Keyed by the assistant-message `index`; a new send aborts any
  // controller still active so the second response always wins.
  const streamControllersRef = useRef(new Map());

  const abortAllStreams = useCallback(() => {
    const map = streamControllersRef.current;
    for (const ctrl of map.values()) {
      try {
        ctrl.abort();
      } catch {
        /* ignore */
      }
    }
    map.clear();
  }, []);

  // Build the conversation history sent to the bot. Independent of
  // `visible_limit` (D4): truncates to the last `contextLimit` messages
  // when set. Pending RLHF comparisons (no user selection yet) cannot
  // enter the bot context — they aren't committed; resolved comparisons
  // flatten to the user-selected branch.
  const buildHistory = useCallback(
    (msgs) => {
      const flattened = msgs
        .filter((m) => {
          if (m.role === 'user') return true;
          if (m.role === 'assistant') {
            if (Array.isArray(m.content)) {
              return (
                m.selected !== null && m.selected !== undefined
              );
            }
            return true;
          }
          return false;
        })
        .map((m) => {
          if (
            m.role === 'assistant' &&
            Array.isArray(m.content)
          ) {
            return {
              role: 'assistant',
              content: m.content[m.selected].text,
            };
          }
          return { role: m.role, content: m.content };
        });
      if (
        typeof contextLimit === 'number' &&
        contextLimit >= 0 &&
        flattened.length > contextLimit
      ) {
        return flattened.slice(flattened.length - contextLimit);
      }
      return flattened;
    },
    [contextLimit]
  );

  const persistMessage = useCallback(
    async (msg) => {
      if (!loggingEnabled || !sessionId) return;
      try {
        await saveMessage({
          user_id: userId,
          session_id: sessionId,
          index: msg.index,
          role: msg.role,
          content: msg.content,
          bot_ids: msg.bot_ids || [],
          feedback: msg.feedback || [],
          selected: msg.selected ?? null,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to save message:', err);
      }
    },
    [loggingEnabled, sessionId, userId]
  );

  const sendMessage = useCallback(
    async (text) => {
      const currentMessages = messagesRef.current;
      const userMsg = {
        role: 'user',
        content: text,
        index: currentMessages.length,
        bot_ids: bots.map((b) => b.name),
      };

      setMessages((prev) => [...prev, userMsg]);
      await persistMessage(userMsg);

      // Cancel any in-flight stream from a previous send. The user's
      // new message implicitly invalidates any pending response.
      abortAllStreams();

      setIsLoading(true);
      try {
        const nextMessages = [...currentMessages, userMsg];
        const history = buildHistory(nextMessages);
        const isRlhf = bots.length === 2;

        if (isRlhf) {
          const results = await Promise.all(
            bots.map((bot) =>
              sendChat(bot.name, history).catch((err) => ({
                error: true,
                message:
                  err?.response?.data?.detail ||
                  'Error getting response',
              }))
            )
          );

          const content = results.map((res, i) => ({
            bot: bots[i].display_name || bots[i].name,
            text: res.error
              ? `[Error: ${res.message}]`
              : res.content || res.message,
          }));

          const assistantMsg = {
            role: 'assistant',
            content,
            index: nextMessages.length,
            selected: null,
            bot_ids: bots.map((b) => b.name),
          };

          setMessages((prev) => [...prev, assistantMsg]);
          await persistMessage(assistantMsg);
        } else {
          const bot = bots[0];
          const assistantIndex = nextMessages.length;
          const controller = new AbortController();
          streamControllersRef.current.set(
            assistantIndex,
            controller
          );

          // Insert an empty streaming placeholder up-front so the
          // canvas renders an empty bubble immediately. Subsequent
          // chunks update its content; `streaming: false` flips on
          // done, which triggers MessageList to swap in the full
          // SimultaneousEntropyMessage.
          const placeholder = {
            role: 'assistant',
            content: '',
            index: assistantIndex,
            bot_ids: [bot.name],
            streaming: true,
          };
          setMessages((prev) => [...prev, placeholder]);

          await new Promise((resolve) => {
            streamChat(bot.name, history, {
              signal: controller.signal,
              onChunk: (_delta, accumulated) => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.index === assistantIndex
                      ? { ...m, content: accumulated }
                      : m
                  )
                );
              },
              onDone: async (accumulated) => {
                streamControllersRef.current.delete(
                  assistantIndex
                );
                let finalMsg = null;
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.index !== assistantIndex) return m;
                    const next = {
                      ...m,
                      content: accumulated || m.content,
                      streaming: false,
                    };
                    finalMsg = next;
                    return next;
                  })
                );
                if (finalMsg) await persistMessage(finalMsg);
                resolve();
              },
              onError: (message) => {
                streamControllersRef.current.delete(
                  assistantIndex
                );
                setMessages((prev) =>
                  prev.map((m) =>
                    m.index === assistantIndex
                      ? {
                          ...m,
                          content: `[Error: ${message}]`,
                          streaming: false,
                        }
                      : m
                  )
                );
                resolve();
              },
            });
          });
        }
      } catch (err) {
        console.error('Chat error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [bots, buildHistory, persistMessage, abortAllStreams]
  );

  const selectResponse = useCallback(
    async (messageIndex, botIndex) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.index === messageIndex
            ? { ...msg, selected: botIndex }
            : msg
        )
      );

      if (loggingEnabled && sessionId) {
        const msg = messagesRef.current.find(
          (m) => m.index === messageIndex
        );
        if (msg) {
          try {
            await saveMessage({
              user_id: userId,
              session_id: sessionId,
              index: msg.index,
              role: msg.role,
              content: msg.content,
              bot_ids: msg.bot_ids || [],
              feedback: [],
              selected: botIndex,
              timestamp: new Date().toISOString(),
            });
          } catch (err) {
            console.error('Failed to save selection:', err);
          }
        }
      }
    },
    [loggingEnabled, sessionId, userId]
  );

  const clearMessages = useCallback(() => {
    abortAllStreams();
    setMessages([]);
  }, [abortAllStreams]);

  return {
    messages,
    sendMessage,
    selectResponse,
    isLoading,
    clearMessages,
  };
}
