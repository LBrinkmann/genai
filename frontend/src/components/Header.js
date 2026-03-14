import { useState, useEffect, useCallback } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';
import client from '../services/api';

const statusColors = {
  online: '#4caf50',
  loading: '#ff9800',
  error: '#f44336',
};

function Header({ accessKey, onReset, configName }) {
  const [botStatuses, setBotStatuses] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);

  const checkStatus = useCallback(async () => {
    if (!configName) return;
    try {
      const resp = await client.get(
        `/api/health/bots?config=${encodeURIComponent(configName)}`
      );
      setBotStatuses(resp.data.bots || []);
    } catch {
      setBotStatuses([]);
    }
  }, [configName]);

  useEffect(() => {
    checkStatus();
    // Poll every 10s while any bot is not online
    const interval = setInterval(() => {
      checkStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Aggregate status: worst of all bots
  const aggregateStatus = botStatuses.length === 0
    ? 'loading'
    : botStatuses.every((b) => b.status === 'online')
      ? 'online'
      : botStatuses.some((b) => b.status === 'error')
        ? 'error'
        : 'loading';

  const tooltipText = botStatuses.length === 0
    ? 'Checking...'
    : botStatuses.map((b) => `${b.name}: ${b.status}`).join(', ');

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
        <Tooltip title={tooltipText} arrow>
          <Box sx={{ display: 'flex', gap: 0.5, ml: 1.5 }}>
            {botStatuses.length === 0 ? (
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: statusColors.loading,
                }}
                data-testid="status-indicator"
              />
            ) : (
              botStatuses.map((b) => (
                <Box
                  key={b.name}
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: statusColors[b.status] || statusColors.error,
                  }}
                  title={`${b.name}: ${b.status}`}
                  data-testid="status-indicator"
                />
              ))
            )}
          </Box>
        </Tooltip>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="New conversation" arrow>
          <IconButton
            color="inherit"
            onClick={() => { if (onReset) onReset(); }}
            size="small"
            sx={{ mr: 0.5 }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
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
