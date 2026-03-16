const API_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:8000';

export async function fetchTTSAudio(text, voice = null) {
  const resp = await fetch(`${API_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!resp.ok) return null;
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}
