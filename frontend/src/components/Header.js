import React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import SettingsIcon from '@mui/icons-material/Settings';

const statusColors = {
  online: '#4caf50',
  loading: '#ff9800',
  error: '#f44336',
};

function Header({ status = 'online' }) {
  return (
    <AppBar
      position="static"
      elevation={1}
      sx={{ bgcolor: 'background.paper', color: 'text.primary' }}
    >
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{ fontWeight: 600 }}
        >
          GenAI Chat
        </Typography>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: statusColors[status] || statusColors.error,
            ml: 1.5,
          }}
          title={`Status: ${status}`}
        />
        <Box sx={{ flexGrow: 1 }} />
        <IconButton edge="end" color="inherit">
          <SettingsIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
