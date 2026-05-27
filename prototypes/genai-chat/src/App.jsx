import { Routes, Route } from 'react-router-dom'
import Chat from './Chat.jsx'
import Background from './Background.jsx'
import PrivacyPolicy from './PrivacyPolicy.jsx'
import TermsAndConditions from './TermsAndConditions.jsx'
import About from './About.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Chat />} />
      <Route path="/background" element={<Background />} />
      <Route path="/about" element={<About />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsAndConditions />} />
    </Routes>
  )
}
