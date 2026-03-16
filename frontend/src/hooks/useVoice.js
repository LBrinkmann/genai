import { useState, useCallback, useRef, useEffect } from 'react';
import { fetchTTSAudio } from '../services/audio';

export default function useVoice({ enabled = false }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingIndex, setPlayingIndex] = useState(null);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const { text, index } = queueRef.current.shift();
      setIsPlaying(true);
      setPlayingIndex(index);

      try {
        const url = await fetchTTSAudio(text);
        if (!url) continue;

        const audio = new Audio(url);
        audioRef.current = audio;

        await new Promise((resolve) => {
          audio.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.play().catch(resolve);
        });
      } catch {
        // TTS failure is non-blocking
      }
    }

    audioRef.current = null;
    setIsPlaying(false);
    setPlayingIndex(null);
    processingRef.current = false;
  }, []);

  const playResponse = useCallback(
    (text, index) => {
      if (!enabled || muted || !text) return;
      queueRef.current.push({ text, index });
      processQueue();
    },
    [enabled, muted, processQueue]
  );

  const stopPlayback = useCallback(() => {
    queueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setPlayingIndex(null);
    processingRef.current = false;
  }, []);

  // Cleanup on unmount: stop audio and clear queue
  useEffect(() => {
    return () => {
      queueRef.current = [];
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src) {
          URL.revokeObjectURL(audioRef.current.src);
        }
        audioRef.current = null;
      }
      processingRef.current = false;
    };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      if (!prev) {
        // Muting — stop current playback
        queueRef.current = [];
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        setIsPlaying(false);
        setPlayingIndex(null);
        processingRef.current = false;
      }
      return !prev;
    });
  }, []);

  return {
    isPlaying,
    playingIndex,
    muted,
    playResponse,
    stopPlayback,
    toggleMute,
  };
}
