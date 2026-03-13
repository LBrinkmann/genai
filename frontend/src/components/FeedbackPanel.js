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
        <Typography variant="caption" color="text.secondary">
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
        <Typography variant="body2" color="text.secondary">
          {mainPreferenceFeedback}
        </Typography>
      )}
      {categories.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              variant={
                selectedTags.includes(cat)
                  ? 'filled'
                  : 'outlined'
              }
              color={
                selectedTags.includes(cat)
                  ? 'primary'
                  : 'default'
              }
              onClick={() => toggleTag(cat)}
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      )}
      <Button
        variant="contained"
        size="small"
        onClick={handleConfirm}
      >
        Confirm selection
      </Button>
    </Box>
  );
}

export default FeedbackPanel;
