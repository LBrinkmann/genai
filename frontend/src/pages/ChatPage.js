import React, { useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Header from '../components/Header';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import useConfig from '../hooks/useConfig';
import useSession from '../hooks/useSession';
import useChat from '../hooks/useChat';
import { saveMessage } from '../services/api';

function ChatPage() {
  const {
    config,
    loading: configLoading,
    error: configError,
    configName,
    accessKey,
    loggingEnabled,
  } = useConfig();

  const { userId, sessionId, createSession, resetSession } =
    useSession();

  const bots = config?.bots || [];
  const feedbackCategories =
    config?.additional_categories || [];
  const mainPreferenceFeedback =
    config?.main_preference_feedback || '';

  const {
    messages,
    sendMessage,
    selectResponse,
    isLoading,
    clearMessages,
  } = useChat({
    bots,
    sessionId,
    userId,
    loggingEnabled,
  });

  useEffect(() => {
    if (config && !sessionId) {
      createSession(configName);
    }
  }, [config, sessionId, createSession, configName]);

  const handleReset = useCallback(async () => {
    clearMessages();
    await resetSession(configName);
  }, [clearMessages, resetSession, configName]);

  const handleFeedbackConfirm = useCallback(
    async (messageIndex, selectedTags) => {
      if (!loggingEnabled || !sessionId) return;
      const msg = messages.find(
        (m) => m.index === messageIndex
      );
      if (!msg) return;
      try {
        await saveMessage({
          user_id: userId,
          session_id: sessionId,
          index: msg.index,
          role: msg.role,
          content: msg.content,
          bot_ids: msg.bot_ids || [],
          feedback: selectedTags,
          selected: msg.selected,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to save feedback:', err);
      }
    },
    [loggingEnabled, sessionId, userId, messages]
  );

  if (configLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (configError) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          px: 3,
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 480 }}>
          <Typography variant="subtitle2">
            Configuration Error
          </Typography>
          <Typography variant="body2">{configError}</Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Header accessKey={accessKey} onReset={handleReset} />
      <MessageList
        messages={messages}
        onSelectResponse={selectResponse}
        feedbackCategories={feedbackCategories}
        mainPreferenceFeedback={mainPreferenceFeedback}
        onFeedbackConfirm={handleFeedbackConfirm}
      />
      <MessageInput onSend={sendMessage} disabled={isLoading} />
    </Box>
  );
}

export default ChatPage;
