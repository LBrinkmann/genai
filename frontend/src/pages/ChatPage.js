import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
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

/**
 * Single-read of `prefers-reduced-motion: reduce`. Used to decide whether
 * the background video renders at all — when reduced-motion is on we
 * render the poster as a static `<img>` instead (D10).
 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setReduced(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/**
 * Background video with hardening:
 *   • Reduced-motion: don't render `<video>` at all, show the poster.
 *   • Tab hidden: `video.pause()`; visible: `video.play().catch()`.
 *   • Video load failure: swap to the poster as a plain `<img>`.
 *   • Poster image used both as the `poster` attribute (covers the
 *     pre-stream window + iOS Low Power Mode) and as the fallback.
 */
function BackgroundVideo({ reducedMotion }) {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    // `video.play()` returns undefined in jsdom (tests) and on a small set
    // of older browsers — guard the `.catch` so it doesn't crash there.
    const safePlay = () => {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    const kick = () => {
      video.muted = true;
      safePlay();
    };
    kick();
    video.addEventListener('loadeddata', kick);

    const onVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
      } else {
        safePlay();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      video.removeEventListener('loadeddata', kick);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      );
    };
  }, [reducedMotion]);

  if (reducedMotion || videoFailed) {
    return (
      <img
        src="/bg-video-poster.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
      />
    );
  }

  return (
    <video
      ref={videoRef}
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster="/bg-video-poster.jpg"
      onError={() => setVideoFailed(true)}
      aria-hidden
    >
      {/* MP4 (H.264/AAC) plays reliably across browsers; MOV is
          inconsistent outside Safari. */}
      <source src="/bg-video-slow.mp4" type="video/mp4" />
      <source src="/bg-video-slow.mov" type="video/quicktime" />
    </video>
  );
}

function ChatPage() {
  const {
    config,
    loading: configLoading,
    error: configError,
    configName,
    accessKey,
    loggingEnabled,
    visibleLimit,
    contextLimit,
  } = useConfig();

  const { userId, sessionId, createSession, resetSession } = useSession();

  const bots = config?.bots || [];
  const feedbackCategories = config?.additional_categories || [];
  const mainPreferenceFeedback = config?.main_preference_feedback || '';

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
    contextLimit,
  });

  const [sessionError, setSessionError] = useState(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (config && !sessionId) {
      createSession(configName).catch((err) => {
        console.error('Session creation failed:', err);
        setSessionError('Failed to create session. Please reload.');
      });
    }
  }, [config, sessionId, createSession, configName]);

  const handleReset = useCallback(async () => {
    clearMessages();
    try {
      await resetSession(configName);
      setSessionError(null);
    } catch (err) {
      console.error('Session reset failed:', err);
      setSessionError('Failed to reset session. Please reload.');
    }
  }, [clearMessages, resetSession, configName]);

  const handleFeedbackConfirm = useCallback(
    async (messageIndex, selectedTags) => {
      if (!loggingEnabled || !sessionId) return;
      const msg = messages.find((m) => m.index === messageIndex);
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
          bgcolor: '#09090b',
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
          bgcolor: '#09090b',
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
    <div className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-zinc-950">
      <BackgroundVideo reducedMotion={reducedMotion} />
      <div
        className="pointer-events-none absolute inset-0 -z-[9] bg-zinc-950/55"
        aria-hidden
      />
      <Header
        accessKey={accessKey}
        onReset={handleReset}
        configName={configName}
      />
      <MessageList
        messages={messages}
        onSelectResponse={selectResponse}
        feedbackCategories={feedbackCategories}
        mainPreferenceFeedback={mainPreferenceFeedback}
        onFeedbackConfirm={handleFeedbackConfirm}
        visibleLimit={visibleLimit}
      />
      {sessionError && (
        <Alert
          severity="warning"
          sx={{ mx: 2, mb: 1 }}
          onClose={() => setSessionError(null)}
        >
          {sessionError}
        </Alert>
      )}
      <footer className="flex flex-col gap-3 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:pb-4">
        <MessageInput onSend={sendMessage} disabled={isLoading} />
        <nav
          aria-label="Site"
          className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-500"
        >
          <Link className="hover:text-white" to="/about">
            About
          </Link>
          <Link className="hover:text-white" to="/privacy">
            Privacy Policy
          </Link>
          <Link className="hover:text-white" to="/terms">
            Terms &amp; Conditions
          </Link>
        </nav>
      </footer>
    </div>
  );
}

export default ChatPage;
