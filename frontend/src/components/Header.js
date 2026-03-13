import { useState, useEffect, useCallback } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import SettingsIcon from '@mui/icons-material/Settings';
import client from '../services/api';

const statusColors = {
  online: '#4caf50',
  loading: '#ff9800',
  error: '#f44336',
};

function Header({ accessKey, onReset }) {
  const [status, setStatus] = useState('loading');
  const [anchorEl, setAnchorEl] = useState(null);

  const checkStatus = useCallback(async () => {
    setStatus('loading');
    try {
      await client.get('/api/health');
      setStatus('online');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

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
            bgcolor:
              statusColors[status] || statusColors.error,
            ml: 1.5,
          }}
          title={`Status: ${status}`}
          data-testid="status-indicator"
        />
        <Box sx={{ flexGrow: 1 }} />
        <IconButton
          edge="end"
          color="inherit"
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <SettingsIcon />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          {accessKey && (
            <MenuItem>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => {
                  setAnchorEl(null);
                  if (onReset) onReset();
                }}
              >
                Reset conversation
              </Button>
            </MenuItem>
          )}
          {!accessKey && (
            <MenuItem disabled>
              <Typography variant="body2">
                No admin controls
              </Typography>
            </MenuItem>
          )}
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
