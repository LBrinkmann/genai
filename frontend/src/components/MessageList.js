import React, { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ResponseComparison from './ResponseComparison';
import FeedbackPanel from './FeedbackPanel';

function MessageList({
  messages,
  onSelectResponse,
  feedbackCategories = [],
  mainPreferenceFeedback = '',
  onFeedbackConfirm,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current && endRef.current.scrollIntoView) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <Box
      sx={{
        flex: 1,
        overflowY: 'auto',
        px: 2,
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <Box
              key={msg.index}
              sx={{
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <Box
                sx={{
                  bgcolor: 'primary.main',
                  color: 'white',
                  px: 2,
                  py: 1.5,
                  borderRadius: 3,
                  maxWidth: '70%',
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
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
              sx={{ display: 'flex', justifyContent: 'flex-start' }}
            >
              <Box
                sx={{
                  bgcolor: 'grey.100',
                  px: 2,
                  py: 1.5,
                  borderRadius: 3,
                  maxWidth: '70%',
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </Typography>
              </Box>
            </Box>
          );
        }

        return (
          <Box
            key={msg.index}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 1,
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
