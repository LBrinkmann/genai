"""Text-to-speech service using Kokoro TTS."""

import random
from typing import Optional

import httpx

from app.config import get_config

KOKORO_VOICES = [
    "af_heart",
    "af_bella",
    "af_nicole",
    "af_sarah",
    "af_sky",
    "am_adam",
    "am_michael",
    "am_echo",
    "am_liam",
    "am_onyx",
    "bf_emma",
    "bf_isabella",
    "bm_george",
    "bm_lewis",
    "bm_daniel",
]

_last_voice: Optional[str] = None


def pick_voice(exclude: Optional[str] = None) -> str:
    """Pick a random voice, avoiding *exclude*."""
    choices = [v for v in KOKORO_VOICES if v != exclude]
    if not choices:
        choices = KOKORO_VOICES
    return random.choice(choices)


async def synthesize_speech(text: str, voice: Optional[str] = None) -> bytes:
    """Call the Kokoro TTS endpoint and return audio bytes.

    Uses the OpenAI-compatible ``/v1/audio/speech`` format.
    If *voice* is ``None``, a random voice is selected
    (avoiding the most recently used voice).
    """
    global _last_voice

    cfg = get_config()
    tts = cfg.tts

    if not tts.enabled or not tts.api_url:
        raise RuntimeError("TTS is not configured")

    if voice is None:
        voice = pick_voice(exclude=_last_voice)
    _last_voice = voice

    headers: dict[str, str] = {
        "Content-Type": "application/json",
    }
    if tts.api_key:
        headers["Authorization"] = f"Bearer {tts.api_key}"

    payload = {
        "model": "kokoro",
        "input": text,
        "voice": voice,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            tts.api_url,
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.content
