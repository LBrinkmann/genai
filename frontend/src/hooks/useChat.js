import { useState, useCallback, useRef } from 'react';
import { sendChat, saveMessage } from '../services/api';

export default function useChat({
  bots = [],
  sessionId = null,
  userId = null,
  loggingEnabled = false,
}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const buildHistory = useCallback(
    (msgs) =>
      msgs
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
        }),
    []
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
          try {
            const result = await sendChat(bot.name, history);

            const assistantMsg = {
              role: 'assistant',
              content: result.content || result.message,
              index: nextMessages.length,
              bot_ids: [bot.name],
            };

            setMessages((prev) => [...prev, assistantMsg]);
            await persistMessage(assistantMsg);
          } catch (chatErr) {
            const errorMsg = {
              role: 'assistant',
              content: `[Error: ${chatErr?.response?.data?.detail || chatErr.message || 'Failed to get response'}]`,
              index: nextMessages.length,
              bot_ids: [bot.name],
            };
            setMessages((prev) => [...prev, errorMsg]);
          }
        }
      } catch (err) {
        console.error('Chat error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [bots, buildHistory, persistMessage]
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
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    selectResponse,
    isLoading,
    clearMessages,
  };
}
