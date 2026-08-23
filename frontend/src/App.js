import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import ChatPage from './pages/ChatPage';
import About from './pages/About';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsAndConditions from './pages/TermsAndConditions';
import Background from './pages/Background';
import Admin from './pages/Admin';
import AdminFlags from './pages/AdminFlags';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="/background" element={<Background />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/flags" element={<AdminFlags />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
