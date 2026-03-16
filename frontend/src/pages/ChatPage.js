import React, { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AnimatedBackground from '../components/AnimatedBackground';
import DissolvingText from '../components/DissolvingText';
import WelcomeMessage from '../components/WelcomeMessage';
import DeactivatedBanner from '../components/DeactivatedBanner';
import Footer from '../components/Footer';
import Header from '../components/Header';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import useConfig from '../hooks/useConfig';
import useSession from '../hooks/useSession';
import useChat from '../hooks/useChat';
import useVoice from '../hooks/useVoice';
import { saveMessage } from '../services/api';

function ChatPage() {
  const {
    config,
    loading: configLoading,
    error: configError,
    configName,
    loggingEnabled,
  } = useConfig();

  const { userId, sessionId, createSession, resetSession } =
    useSession();

  const bots = config?.bots || [];
  const feedbackCategories =
    config?.additional_categories || [];
  const mainPreferenceFeedback =
    config?.main_preference_feedback || '';

  const ttsEnabled = config?.tts_enabled || false;

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

  const {
    playingIndex,
    muted,
    playResponse,
    toggleMute,
  } = useVoice({ enabled: ttsEnabled });

  const [sessionError, setSessionError] = useState(null);
  const [allBotsError, setAllBotsError] = useState(false);
  const scrollRef = useRef(null);
  const prevMsgCountRef = useRef(0);

  // Track bot statuses for deactivated banner
  const handleBotStatuses = useCallback((statuses) => {
    if (statuses.length === 0) {
      setAllBotsError(false);
      return;
    }
    const allError = statuses.every(
      (b) => b.status === 'error'
    );
    setAllBotsError(allError);
  }, []);

  useEffect(() => {
    if (config && !sessionId) {
      createSession(configName).catch((err) => {
        console.error('Session creation failed:', err);
        setSessionError(
          'Failed to create session. Please reload.'
        );
      });
    }
  }, [config, sessionId, createSession, configName]);

  // Auto-play TTS for new assistant messages
  useEffect(() => {
    const count = messages.length;
    if (count > prevMsgCountRef.current) {
      const lastMsg = messages[count - 1];
      if (
        lastMsg &&
        lastMsg.role === 'assistant' &&
        !Array.isArray(lastMsg.content)
      ) {
        playResponse(lastMsg.content, lastMsg.index);
      }
    }
    prevMsgCountRef.current = count;
  }, [messages, playResponse]);

  // Close/leave confirmation
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () =>
      window.removeEventListener('beforeunload', handler);
  }, []);

  const handleSelectResponse = useCallback(
    (messageIndex, botIndex) => {
      selectResponse(messageIndex, botIndex);
      const msg = messages.find(
        (m) => m.index === messageIndex
      );
      if (
        msg &&
        Array.isArray(msg.content) &&
        msg.content[botIndex]
      ) {
        playResponse(
          msg.content[botIndex].text,
          messageIndex
        );
      }
    },
    [selectResponse, messages, playResponse]
  );

  const handleReset = useCallback(async () => {
    clearMessages();
    try {
      await resetSession(configName);
      setSessionError(null);
    } catch (err) {
      console.error('Session reset failed:', err);
      setSessionError(
        'Failed to reset session. Please reload.'
      );
    }
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
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <AnimatedBackground />
        <Box
          sx={{
            width: 32,
            height: 2,
            bgcolor: 'primary.main',
            borderRadius: 1,
            animation: 'pulse 1.5s ease-in-out infinite',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 0.3 },
              '50%': { opacity: 0.8 },
            },
            zIndex: 1,
          }}
        />
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
          bgcolor: 'background.default',
        }}
      >
        <AnimatedBackground />
        <Typography
          variant="body1"
          sx={{
            color: 'text.secondary',
            textAlign: 'center',
            zIndex: 1,
          }}
        >
          {configError}
        </Typography>
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
        position: 'relative',
      }}
    >
      <AnimatedBackground />
      <DeactivatedBanner visible={allBotsError} />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Header
          onReset={handleReset}
          configName={configName}
          onBotStatuses={handleBotStatuses}
          ttsEnabled={ttsEnabled}
          muted={muted}
          onToggleMute={toggleMute}
        />
        <WelcomeMessage visible={messages.length === 0} />
        <DissolvingText scrollRef={scrollRef}>
          <MessageList
            messages={messages}
            onSelectResponse={handleSelectResponse}
            feedbackCategories={feedbackCategories}
            mainPreferenceFeedback={mainPreferenceFeedback}
            onFeedbackConfirm={handleFeedbackConfirm}
            scrollRef={scrollRef}
            playingIndex={playingIndex}
          />
        </DissolvingText>
        {sessionError && (
          <Alert
            severity="warning"
            sx={{
              mx: 2,
              mb: 1,
              bgcolor: 'rgba(196, 163, 90, 0.08)',
              color: 'text.primary',
              '& .MuiAlert-icon': {
                color: 'primary.main',
              },
            }}
            onClose={() => setSessionError(null)}
          >
            {sessionError}
          </Alert>
        )}
        <MessageInput
          onSend={sendMessage}
          disabled={isLoading}
        />
        <Footer />
      </Box>
    </Box>
  );
}

export default ChatPage;
