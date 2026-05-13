import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import ChatPage from './pages/ChatPage';
import EffectSandbox from './pages/__EffectSandbox';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/__effect-sandbox" element={<EffectSandbox />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
