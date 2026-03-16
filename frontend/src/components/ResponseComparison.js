import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

function ResponseComparison({ responses, selected, onSelect }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
        width: '100%',
        maxWidth: 720,
      }}
    >
      {responses.map((resp, idx) => {
        const isSelected = selected === idx;
        const isOtherSelected =
          selected !== null &&
          selected !== undefined &&
          !isSelected;

        return (
          <Box
            key={idx}
            onClick={() => onSelect && onSelect(idx)}
            sx={{
              flex: 1,
              p: 2,
              cursor: onSelect ? 'pointer' : 'default',
              bgcolor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid',
              borderColor: isSelected
                ? 'rgba(196, 163, 90, 0.4)'
                : 'rgba(255, 255, 255, 0.06)',
              borderRadius: 2,
              opacity: isOtherSelected ? 0.4 : 1,
              transition: 'all 0.4s ease',
              boxShadow: isSelected
                ? '0 0 20px rgba(196, 163, 90, 0.1)'
                : 'none',
              '&:hover': onSelect
                ? {
                    borderColor: isSelected
                      ? 'rgba(196, 163, 90, 0.4)'
                      : 'rgba(255, 255, 255, 0.15)',
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                  }
                : {},
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                color: 'text.secondary',
                mb: 1,
                display: 'block',
                opacity: 0.5,
              }}
            >
              GENocideAI
            </Typography>
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap' }}
            >
              {resp.text}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default ResponseComparison;
