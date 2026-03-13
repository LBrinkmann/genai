import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';

const mockCategories = ['More helpful', 'More accurate', 'Better tone'];

function FeedbackPanel({ onConfirm }) {
  const [selectedTags, setSelectedTags] = useState([]);

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
  };

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
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {mockCategories.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            variant={selectedTags.includes(cat) ? 'filled' : 'outlined'}
            color={selectedTags.includes(cat) ? 'primary' : 'default'}
            onClick={() => toggleTag(cat)}
            sx={{ cursor: 'pointer' }}
          />
        ))}
      </Box>
      <Button
        variant="contained"
        size="small"
        onClick={() => onConfirm && onConfirm(selectedTags)}
      >
        Confirm selection
      </Button>
    </Box>
  );
}

export default FeedbackPanel;
