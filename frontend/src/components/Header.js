import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import client from '../services/api';

const statusColors = {
  online: '#4a6a4a',
  loading: '#8a7a3a',
  error: '#6a3a3a',
};

function Header({
  onReset,
  configName,
  onBotStatuses,
  ttsEnabled = false,
  muted = false,
  onToggleMute,
}) {
  const [botStatuses, setBotStatuses] = useState([]);

  const checkStatus = useCallback(async () => {
    if (!configName) return;
    try {
      const resp = await client.get(
        `/api/health/bots?config=${encodeURIComponent(configName)}`
      );
      const statuses = resp.data.bots || [];
      setBotStatuses(statuses);
      if (onBotStatuses) onBotStatuses(statuses);
    } catch {
      setBotStatuses([]);
      if (onBotStatuses) onBotStatuses([]);
    }
  }, [configName, onBotStatuses]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(() => {
      checkStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const tooltipText = botStatuses.length === 0
    ? 'Checking...'
    : botStatuses.map((b) => `${b.name}: ${b.status}`).join(', ');

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: { xs: 2, sm: 3 },
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        background: 'rgba(10,10,15,0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 10,
      }}
    >
      <Typography
        variant="h6"
        component="div"
        sx={{
          fontFamily: '"Playfair Display", serif',
          fontWeight: 500,
          letterSpacing: '0.05em',
          color: 'text.primary',
          fontSize: { xs: '1rem', sm: '1.15rem' },
        }}
      >
        GENocideAI
      </Typography>
      <Tooltip title={tooltipText} arrow>
        <Box sx={{ display: 'flex', gap: 0.5, ml: 1.5 }}>
          {botStatuses.length === 0 ? (
            <Box
              sx={{
                width: 6,
                height: 6,
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
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor:
                    statusColors[b.status] || statusColors.error,
                }}
                title={`${b.name}: ${b.status}`}
                data-testid="status-indicator"
              />
            ))
          )}
        </Box>
      </Tooltip>
      <Box sx={{ flexGrow: 1 }} />
      {ttsEnabled && (
        <Tooltip title={muted ? 'Unmute voice' : 'Mute voice'} arrow>
          <IconButton
            onClick={() => { if (onToggleMute) onToggleMute(); }}
            size="small"
            sx={{
              color: 'text.secondary',
              opacity: muted ? 0.3 : 0.5,
              mr: 0.5,
              '&:hover': { opacity: 0.8 },
            }}
            data-testid="mute-toggle"
          >
            {muted ? (
              <VolumeOffIcon fontSize="small" />
            ) : (
              <VolumeUpIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="New conversation" arrow>
        <IconButton
          onClick={() => { if (onReset) onReset(); }}
          size="small"
          sx={{
            color: 'text.secondary',
            opacity: 0.5,
            '&:hover': { opacity: 0.8 },
          }}
        >
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default Header;
