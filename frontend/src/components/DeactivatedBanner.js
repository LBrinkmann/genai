import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

function DeactivatedBanner({ visible = false }) {
  if (!visible) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        bgcolor: 'rgba(10, 10, 15, 0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 1.5s ease',
        '@keyframes fadeIn': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      }}
    >
      <Typography
        variant="h5"
        sx={{
          fontFamily: '"Playfair Display", serif',
          color: 'text.secondary',
          textAlign: 'center',
          px: 4,
          lineHeight: 1.8,
        }}
      >
        GENocideAI is currently offline.
      </Typography>
      <Typography
        variant="body1"
        sx={{
          color: 'text.secondary',
          mt: 2,
          opacity: 0.6,
        }}
      >
        Please return later.
      </Typography>
    </Box>
  );
}

export default DeactivatedBanner;
