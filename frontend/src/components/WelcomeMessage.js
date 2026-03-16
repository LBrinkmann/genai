import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

function WelcomeMessage({ visible = true }) {
  return (
    <Box
      sx={{
        px: { xs: 2, sm: 4 },
        py: { xs: 2, sm: 3 },
        textAlign: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.5s ease',
        borderBottom: '1px solid',
        borderColor: 'divider',
        background:
          'linear-gradient(to bottom, rgba(18,18,26,0.9), rgba(10,10,15,0.6))',
      }}
    >
      <Typography
        variant="body1"
        sx={{
          fontFamily: '"Playfair Display", serif',
          fontSize: { xs: '0.95rem', sm: '1.1rem' },
          lineHeight: 1.8,
          color: 'text.secondary',
          maxWidth: 640,
          mx: 'auto',
          fontStyle: 'italic',
        }}
      >
        This is GENocideAI, a collective voice assembled from
        testimonies of genocide. Every response draws from the words
        of those who witnessed, survived, or did not survive.
        <br />
        Please engage with care.
      </Typography>
    </Box>
  );
}

export default WelcomeMessage;
