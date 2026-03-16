import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

function FeedbackPanel({
  categories = [],
  mainPreferenceFeedback = '',
  onConfirm,
}) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [confirmed, setConfirmed] = useState(false);

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
  };

  const handleConfirm = () => {
    setConfirmed(true);
    if (onConfirm) {
      onConfirm(selectedTags);
    }
  };

  if (confirmed) {
    return (
      <Box sx={{ py: 1, px: 2 }}>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', opacity: 0.5 }}
        >
          Feedback submitted
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5,
        py: 1.5,
        px: 2,
      }}
    >
      {mainPreferenceFeedback && (
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', opacity: 0.7 }}
        >
          {mainPreferenceFeedback}
        </Typography>
      )}
      {categories.length > 0 && (
        <Box
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
        >
          {categories.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              variant="outlined"
              onClick={() => toggleTag(cat)}
              sx={{
                cursor: 'pointer',
                borderColor: selectedTags.includes(cat)
                  ? 'primary.main'
                  : 'rgba(255,255,255,0.12)',
                color: selectedTags.includes(cat)
                  ? 'primary.main'
                  : 'text.secondary',
                bgcolor: selectedTags.includes(cat)
                  ? 'rgba(196, 163, 90, 0.08)'
                  : 'transparent',
                '&:hover': {
                  borderColor: 'primary.light',
                },
              }}
            />
          ))}
        </Box>
      )}
      <Button
        variant="outlined"
        size="small"
        onClick={handleConfirm}
        sx={{
          borderColor: 'rgba(255,255,255,0.12)',
          color: 'text.secondary',
          textTransform: 'none',
          fontSize: '0.75rem',
          '&:hover': {
            borderColor: 'primary.main',
            color: 'primary.main',
          },
        }}
      >
        Confirm selection
      </Button>
    </Box>
  );
}

export default FeedbackPanel;
