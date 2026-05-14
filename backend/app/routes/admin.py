"""Admin-only endpoints: HuggingFace Inference Endpoint controls.

All routes are gated by ``require_admin_session``. The HF API client
lives in ``app.services.hf_endpoints``; this module translates its
typed exceptions into FastAPI ``HTTPException``s.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit_event, client_ip
from app.auth import require_admin_session
from app.config import BotConfig, get_config
from app.database import get_session
from app.models import ConfigOverride
from app.schemas import AdminConfigResponse
from app.services import config_overrides, hf_endpoints
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


@router.post("/llm-endpoints/{bot_name}/resume")
async def resume_llm_endpoint(
    bot_name: str,
    request: Request,
    user: str = Depends(require_admin_session),
) -> dict:
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
        audit_event(
            "admin.llm.resume",
            ok=False,
            user=user,
            ip=client_ip(request),
            extra={"bot": bot_name},
        )
        raise _translate_hf_error(exc) from exc
    audit_event(
        "admin.llm.resume",
        ok=True,
        user=user,
        ip=client_ip(request),
        extra={"bot": bot_name},
    )
    return _row_from_status(bot, status)


@router.post("/llm-endpoints/{bot_name}/pause")
async def pause_llm_endpoint(
    bot_name: str,
    request: Request,
    user: str = Depends(require_admin_session),
) -> dict:
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
        audit_event(
            "admin.llm.pause",
            ok=False,
            user=user,
            ip=client_ip(request),
            extra={"bot": bot_name},
        )
        raise _translate_hf_error(exc) from exc
    audit_event(
        "admin.llm.pause",
        ok=True,
        user=user,
        ip=client_ip(request),
        extra={"bot": bot_name},
    )
    return _row_from_status(bot, status)


# ---- Config overrides --------------------------------------------------


def _validate_patch(
    patch: dict,
    available_feedback_configs: list[str],
    available_bots: list[str],
) -> None:
    """Validate a sparse override patch; raise 400 on bad shape."""
    allowed = {
        "visible_limit",
        "context_limit",
        "active_feedback_config",
        "bot_overrides",
    }
    extra = set(patch.keys()) - allowed
    if extra:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown field(s): {sorted(extra)}",
        )

    if "visible_limit" in patch:
        v = patch["visible_limit"]
        if v is not None and (not isinstance(v, int) or v < 1):
            raise HTTPException(
                status_code=400,
                detail="visible_limit must be a positive integer or null",
            )

    if "context_limit" in patch:
        v = patch["context_limit"]
        if v is not None and (not isinstance(v, int) or v < 1):
            raise HTTPException(
                status_code=400,
                detail="context_limit must be a positive integer or null",
            )

    if "active_feedback_config" in patch:
        v = patch["active_feedback_config"]
        if v is not None and (
            not isinstance(v, str) or v not in available_feedback_configs
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "active_feedback_config must be one of: "
                    f"{available_feedback_configs}"
                ),
            )

    if "bot_overrides" in patch:
        v = patch["bot_overrides"]
        if v is None:
            return
        if not isinstance(v, dict):
            raise HTTPException(
                status_code=400,
                detail="bot_overrides must be an object",
            )
        for bot_name, sub in v.items():
            if bot_name not in available_bots:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown bot: {bot_name}",
                )
            if sub is None:
                continue
            if not isinstance(sub, dict):
                raise HTTPException(
                    status_code=400,
                    detail="bot_overrides[*] must be an object",
                )
            extra_sub = set(sub.keys()) - {"system_message"}
            if extra_sub:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Unknown bot override field(s): "
                        f"{sorted(extra_sub)}"
                    ),
                )
            sm = sub.get("system_message")
            if sm is not None and (not isinstance(sm, str) or not sm.strip()):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "bot_overrides[*].system_message must be "
                        "a non-empty string or null"
                    ),
                )


def _apply_patch(existing: dict, patch: dict) -> dict:
    """Merge ``patch`` into ``existing`` with explicit-null reset.

    ``None`` at a top-level key removes that key from the stored
    overrides. For ``bot_overrides`` we merge per-bot: a bot value of
    ``None`` deletes the bot's whole entry; a ``system_message`` of
    ``None`` deletes just that field.
    """
    out = dict(existing)
    for key, value in patch.items():
        if key == "bot_overrides":
            if value is None:
                out.pop("bot_overrides", None)
                continue
            bots = dict(out.get("bot_overrides") or {})
            for bot_name, sub in value.items():
                if sub is None:
                    bots.pop(bot_name, None)
                    continue
                merged_bot = dict(bots.get(bot_name) or {})
                for k, v in sub.items():
                    if v is None:
                        merged_bot.pop(k, None)
                    else:
                        merged_bot[k] = v
                if merged_bot:
                    bots[bot_name] = merged_bot
                else:
                    bots.pop(bot_name, None)
            if bots:
                out["bot_overrides"] = bots
            else:
                out.pop("bot_overrides", None)
        else:
            if value is None:
                out.pop(key, None)
            else:
                out[key] = value
    return out


async def _build_admin_response(
    session: AsyncSession,
) -> AdminConfigResponse:
    """Compose the full /api/admin/config response shape."""
    yaml_cfg = get_config()
    record = await config_overrides.load_override_record(session)
    overrides = dict(record.overrides or {}) if record else {}
    merged = config_overrides.merge_into_config(yaml_cfg, overrides)
    return AdminConfigResponse(
        merged=merged.model_dump(),
        overrides=overrides,
        available_feedback_configs=[
            fc.name for fc in yaml_cfg.feedback_configs
        ],
        available_bots=[b.name for b in yaml_cfg.bots],
        updated_by=record.updated_by if record else None,
        updated_at=record.updated_at if record else None,
    )


@router.get("/config", response_model=AdminConfigResponse)
async def get_admin_config(
    user: str = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
) -> AdminConfigResponse:
    """Return the merged config and current override metadata."""
    return await _build_admin_response(session)


@router.patch("/config", response_model=AdminConfigResponse)
async def patch_admin_config(
    request: Request,
    patch: dict = Body(default_factory=dict),
    user: str = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
) -> AdminConfigResponse:
    """Merge ``patch`` into the persisted override blob."""
    yaml_cfg = get_config()
    available_fcs = [fc.name for fc in yaml_cfg.feedback_configs]
    available_bots = [b.name for b in yaml_cfg.bots]
    try:
        _validate_patch(patch, available_fcs, available_bots)
    except HTTPException:
        audit_event(
            "admin.config.patch",
            ok=False,
            user=user,
            ip=client_ip(request),
            payload_keys=list(patch.keys()) if isinstance(patch, dict) else [],
        )
        raise

    record = await config_overrides.load_override_record(session)
    if record is None:
        record = ConfigOverride(id=1, overrides={})
        session.add(record)

    record.overrides = _apply_patch(record.overrides or {}, patch)
    record.updated_by = user
    record.updated_at = datetime.now(timezone.utc)
    await session.commit()
    config_overrides.reset_cache()

    audit_event(
        "admin.config.patch",
        ok=True,
        user=user,
        ip=client_ip(request),
        payload_keys=list(patch.keys()),
    )
    return await _build_admin_response(session)


@router.delete("/config", response_model=AdminConfigResponse)
async def delete_admin_config(
    request: Request,
    user: str = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
) -> AdminConfigResponse:
    """Wipe all overrides — YAML defaults take over."""
    record = await config_overrides.load_override_record(session)
    if record is not None:
        record.overrides = {}
        record.updated_by = user
        record.updated_at = datetime.now(timezone.utc)
        await session.commit()
    config_overrides.reset_cache()

    audit_event(
        "admin.config.delete",
        ok=True,
        user=user,
        ip=client_ip(request),
    )
    return await _build_admin_response(session)
