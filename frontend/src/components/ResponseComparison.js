import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

function ResponseComparison({ responses, selected, onSelect }) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        width: '100%',
        maxWidth: 720,
      }}
    >
      {responses.map((resp, idx) => {
        const isSelected = selected === idx;
        const isOtherSelected =
          selected !== null && selected !== undefined && !isSelected;

        return (
          <Paper
            key={idx}
            elevation={isSelected ? 3 : 1}
            onClick={() => onSelect && onSelect(idx)}
            sx={{
              flex: 1,
              p: 2,
              cursor: onSelect ? 'pointer' : 'default',
              border: 2,
              borderColor: isSelected
                ? 'primary.main'
                : 'transparent',
              opacity: isOtherSelected ? 0.55 : 1,
              transition: 'all 0.2s ease',
              '&:hover': onSelect
                ? {
                    borderColor: isSelected
                      ? 'primary.main'
                      : 'primary.light',
                    transform: 'translateY(-1px)',
                  }
                : {},
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: 'text.secondary',
                mb: 1,
                display: 'block',
              }}
            >
              {resp.bot}
            </Typography>
            <Typography variant="body2">{resp.text}</Typography>
          </Paper>
        );
      })}
    </Box>
  );
}

export default ResponseComparison;
