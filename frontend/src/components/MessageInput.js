import React, { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';

function MessageInput({ onSend, disabled = false }) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (onSend) {
      onSend(trimmed);
    }
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 3 },
        py: 1.5,
        background: 'rgba(10,10,15,0.6)',
      }}
    >
      <TextField
        fullWidth
        multiline
        maxRows={4}
        placeholder="Type here..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        variant="standard"
        size="small"
        sx={{
          '& .MuiInput-root': {
            color: 'text.primary',
            fontSize: '0.95rem',
            '&:before': {
              borderBottomColor: 'rgba(255,255,255,0.1)',
            },
            '&:hover:not(.Mui-disabled):before': {
              borderBottomColor: 'rgba(255,255,255,0.2)',
            },
            '&:after': {
              borderBottomColor: 'primary.main',
            },
          },
          '& .MuiInput-input::placeholder': {
            color: 'text.secondary',
            opacity: 0.4,
          },
        }}
        slotProps={{
          input: {
            disableUnderline: false,
          },
        }}
      />
      {disabled && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            mt: 1,
          }}
        >
          <Box
            sx={{
              width: 24,
              height: 2,
              bgcolor: 'primary.main',
              borderRadius: 1,
              animation: 'pulse 1.5s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 0.3 },
                '50%': { opacity: 0.8 },
              },
            }}
          />
        </Box>
      )}
    </Box>
  );
}

export default MessageInput;
