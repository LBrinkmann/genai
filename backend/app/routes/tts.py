"""TTS endpoints for text-to-speech synthesis."""

from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.config import get_config
from app.tts import KOKORO_VOICES, synthesize_speech

router = APIRouter(prefix="/api", tags=["tts"])


class TTSRequest(BaseModel):
    """Request body for TTS synthesis."""

    text: str
    voice: Optional[str] = None


@router.post("/tts")
async def tts(request: TTSRequest) -> Response:
    """Synthesize speech from text and return audio."""
    cfg = get_config()
    if not cfg.tts.enabled:
        raise HTTPException(
            status_code=404,
            detail="TTS is not enabled",
        )

    try:
        audio = await synthesize_speech(request.text, request.voice)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="TTS request timed out",
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=503,
            detail=(f"TTS API error: {exc.response.status_code}"),
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"TTS connection error: {exc}",
        )

    return Response(
        content=audio,
        media_type="audio/mpeg",
    )


@router.get("/tts/voices")
async def list_voices() -> dict:
    """Return available TTS voices."""
    return {"voices": KOKORO_VOICES}
