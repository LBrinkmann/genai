"""Admin-only endpoints: HuggingFace Inference Endpoint controls.

All routes are gated by ``require_admin_session``. The HF API client
lives in ``app.services.hf_endpoints``; this module translates its
typed exceptions into FastAPI ``HTTPException``s.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_admin_session
from app.config import BotConfig, get_config
from app.services import hf_endpoints
from app.services.hf_endpoints import (
    HFAPIError,
    HFAuthError,
    HFError,
    HFNotFoundError,
    HFTimeoutError,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---- Helpers -----------------------------------------------------------


def _managed_bots() -> list[BotConfig]:
    """Return all bots in the active config with a non-null endpoint."""
    cfg = get_config()
    return [b for b in cfg.bots if b.llm_endpoint is not None]


def _find_managed_bot(bot_name: str) -> BotConfig:
    """Look up a managed bot by name. Raises 404 if missing/unmanaged."""
    cfg = get_config()
    for bot in cfg.bots:
        if bot.name == bot_name:
            if bot.llm_endpoint is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Bot '{bot_name}' has no managed "
                        "llm_endpoint configured"
                    ),
                )
            return bot
    raise HTTPException(
        status_code=404,
        detail=f"Bot '{bot_name}' not found",
    )


def _translate_hf_error(exc: HFError) -> HTTPException:
    """Map a typed HF error to an HTTPException for the client.

    Never leaks the HF token: even on auth failure we return a generic
    message. Other unexpected statuses become 502 (bad gateway) so the
    operator knows the issue is upstream.
    """
    if isinstance(exc, HFAuthError):
        return HTTPException(
            status_code=502,
            detail=(
                "HuggingFace API rejected our credentials. "
                "Check HF_API_TOKEN."
            ),
        )
    if isinstance(exc, HFNotFoundError):
        return HTTPException(
            status_code=404,
            detail="HuggingFace endpoint not found",
        )
    if isinstance(exc, HFTimeoutError):
        return HTTPException(
            status_code=504,
            detail="HuggingFace API timed out",
        )
    if isinstance(exc, HFAPIError):
        return HTTPException(
            status_code=502,
            detail=("HuggingFace API error " f"({exc.status_code})"),
        )
    return HTTPException(
        status_code=502,
        detail="HuggingFace API error",
    )


def _row_from_status(bot: BotConfig, status: dict) -> dict:
    """Combine bot metadata with normalized HF status for the wire."""
    endpoint = bot.llm_endpoint
    assert endpoint is not None  # narrowed at call sites
    return {
        "bot_name": bot.name,
        "provider": endpoint.provider,
        "namespace": endpoint.namespace,
        "name": endpoint.name,
        "state": status.get("state", "unknown"),
        "message": status.get("message"),
        "url": status.get("url"),
        "model": status.get("model"),
        "instance": status.get("instance"),
    }


def _unknown_row(bot: BotConfig, message: str) -> dict:
    """Build a placeholder row when HF didn't answer."""
    endpoint = bot.llm_endpoint
    assert endpoint is not None  # narrowed at call sites
    return {
        "bot_name": bot.name,
        "provider": endpoint.provider,
        "namespace": endpoint.namespace,
        "name": endpoint.name,
        "state": "unknown",
        "message": message,
        "url": None,
        "model": None,
        "instance": None,
    }


# ---- Routes ------------------------------------------------------------


@router.get(
    "/llm-endpoints",
    dependencies=[Depends(require_admin_session)],
)
async def list_llm_endpoints() -> dict:
    """List the live state for every bot with a managed endpoint.

    Fans out concurrently via ``asyncio.gather``. A single failed
    endpoint yields an entry with ``state='unknown'`` and a ``message``
    explaining the upstream issue, so the UI can still render the
    other rows.
    """
    bots = _managed_bots()
    if not bots:
        return {"endpoints": []}

    tasks = [
        hf_endpoints.get_status(
            bot.llm_endpoint.namespace,  # type: ignore[union-attr]
            bot.llm_endpoint.name,  # type: ignore[union-attr]
        )
        for bot in bots
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    rows: list[dict] = []
    for bot, result in zip(bots, results):
        if isinstance(result, Exception):
            if isinstance(result, HFError):
                detail = _translate_hf_error(result).detail
            else:
                # Unexpected; surface as unknown rather than 500ing
                # the whole list.
                detail = "Unexpected error"
            rows.append(_unknown_row(bot, detail))
        else:
            rows.append(_row_from_status(bot, result))
    return {"endpoints": rows}


@router.post(
    "/llm-endpoints/{bot_name}/resume",
    dependencies=[Depends(require_admin_session)],
)
async def resume_llm_endpoint(bot_name: str) -> dict:
    """Resume the HF endpoint backing ``bot_name``."""
    bot = _find_managed_bot(bot_name)
    endpoint = bot.llm_endpoint
    assert endpoint is not None
    try:
        status = await hf_endpoints.resume(
            endpoint.namespace,
            endpoint.name,
        )
    except HFError as exc:
        raise _translate_hf_error(exc) from exc
    return _row_from_status(bot, status)


@router.post(
    "/llm-endpoints/{bot_name}/pause",
    dependencies=[Depends(require_admin_session)],
)
async def pause_llm_endpoint(bot_name: str) -> dict:
    """Pause the HF endpoint backing ``bot_name``."""
    bot = _find_managed_bot(bot_name)
    endpoint = bot.llm_endpoint
    assert endpoint is not None
    try:
        status = await hf_endpoints.pause(
            endpoint.namespace,
            endpoint.name,
        )
    except HFError as exc:
        raise _translate_hf_error(exc) from exc
    return _row_from_status(bot, status)
