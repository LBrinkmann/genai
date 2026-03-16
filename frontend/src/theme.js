import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#c4a35a',
      light: '#d4b97a',
      dark: '#a08040',
    },
    background: {
      default: '#0a0a0f',
      paper: '#12121a',
    },
    text: {
      primary: '#e0e0e0',
      secondary: '#8a8a9a',
    },
    divider: 'rgba(255,255,255,0.06)',
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    h5: {
      fontFamily: '"Playfair Display", serif',
      fontWeight: 600,
    },
    h6: {
      fontFamily: '"Playfair Display", serif',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          margin: 0,
          padding: 0,
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: '#0a0a0f',
        },
        '#root': {
          height: '100vh',
        },
      },
    },
  },
});

export const pulseKeyframes = {
  '@keyframes pulse': {
    '0%, 100%': { opacity: 0.3 },
    '50%': { opacity: 0.8 },
  },
};

export default theme;
