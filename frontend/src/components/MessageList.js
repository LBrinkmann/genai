import React, { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ResponseComparison from './ResponseComparison';
import FeedbackPanel from './FeedbackPanel';

const fadeInKeyframes = {
  '@keyframes msgFadeIn': {
    from: {
      opacity: 0,
      transform: 'translateY(10px)',
    },
    to: {
      opacity: 1,
      transform: 'translateY(0)',
    },
  },
};

function MessageList({
  messages,
  onSelectResponse,
  feedbackCategories = [],
  mainPreferenceFeedback = '',
  onFeedbackConfirm,
  scrollRef,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current && endRef.current.scrollIntoView) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <Box
      ref={scrollRef}
      sx={{
        flex: 1,
        overflowY: 'auto',
        px: { xs: 1.5, sm: 2 },
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        position: 'relative',
        ...fadeInKeyframes,
        /* Scrollbar styling */
        '&::-webkit-scrollbar': {
          width: 4,
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 2,
        },
      }}
    >
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <Box
              key={msg.index}
              data-msg-index={msg.index}
              sx={{
                display: 'flex',
                justifyContent: 'flex-end',
                animation: 'msgFadeIn 1s ease forwards',
              }}
            >
              <Box
                sx={{
                  bgcolor: 'rgba(196, 163, 90, 0.12)',
                  border: '1px solid rgba(196, 163, 90, 0.15)',
                  color: 'text.primary',
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  maxWidth: { xs: '85%', sm: '70%' },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap' }}
                >
                  {msg.content}
                </Typography>
              </Box>
            </Box>
          );
        }

        const isComparison = Array.isArray(msg.content);
        if (!isComparison) {
          return (
            <Box
              key={msg.index}
              data-msg-index={msg.index}
              sx={{
                display: 'flex',
                justifyContent: 'flex-start',
                animation: 'msgFadeIn 1s ease forwards',
              }}
            >
              <Box
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  maxWidth: { xs: '85%', sm: '70%' },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap' }}
                >
                  {msg.content}
                </Typography>
              </Box>
            </Box>
          );
        }

        return (
          <Box
            key={msg.index}
            data-msg-index={msg.index}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 1,
              animation: 'msgFadeIn 1s ease forwards',
            }}
          >
            <ResponseComparison
              responses={msg.content}
              selected={msg.selected}
              onSelect={
                msg.selected === null ||
                msg.selected === undefined
                  ? (idx) => onSelectResponse(msg.index, idx)
                  : undefined
              }
            />
            {msg.selected !== null &&
              msg.selected !== undefined && (
                <FeedbackPanel
                  categories={feedbackCategories}
                  mainPreferenceFeedback={
                    mainPreferenceFeedback
                  }
                  onConfirm={(tags) =>
                    onFeedbackConfirm &&
                    onFeedbackConfirm(msg.index, tags)
                  }
                />
              )}
          </Box>
        );
      })}
      <div ref={endRef} />
    </Box>
  );
}

export default MessageList;
