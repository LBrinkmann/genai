"""Public LLM-endpoint routes: state + activation.

Unauthenticated by design — any visitor may wake the managed HF
endpoints so they can chat (see ``doc/plans/mock-api-layer.md`` and the
admin mode in ``endpoint_control``). Cost is bounded by HF scale-to-zero
plus a per-IP rate limit on activation. Billing/cost figures are NOT
exposed here; those stay behind the admin ``/api/admin/llm-endpoints``
route.
"""

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit_event, client_ip
from app.database import get_session
from app.services import config_overrides, endpoint_control

router = APIRouter(prefix="/api/llm-endpoints", tags=["endpoints"])


# ---- Activation rate limiting ------------------------------------------
#
# Waking a GPU costs money, so cap how often any one IP can trigger it.
# In-process deque, single-worker assumption — same trade-off documented
# in auth.py.

_RL_WINDOW_SECONDS = 60
_RL_MAX_ATTEMPTS = 12
_attempt_log: Dict[str, Deque[float]] = defaultdict(deque)
_attempt_lock = threading.Lock()


def _rate_limited(ip: str) -> int:
    """Record an attempt; return seconds-until-retry, or 0 if allowed."""
    now = time.time()
    cutoff = now - _RL_WINDOW_SECONDS
    with _attempt_lock:
        log = _attempt_log[ip]
        while log and log[0] < cutoff:
            log.popleft()
        if len(log) >= _RL_MAX_ATTEMPTS:
            return max(int(_RL_WINDOW_SECONDS - (now - log[0])), 1)
        log.append(now)
        return 0


def _reset_rate_limit_for_tests() -> None:
    """Test helper: wipe the activation rate-limit log."""
    with _attempt_lock:
        _attempt_log.clear()


# ---- Helpers ------------------------------------------------------------


async def _current_verdict(mode: str, cfg=None) -> dict:
    """Build the chat-gate verdict for ``mode`` (skips HF when it can)."""
    bots = endpoint_control.managed_bots(cfg)
    if mode in ("off", "on") or not bots:
        verdict = endpoint_control.aggregate_state(mode, [])
    else:
        states = await endpoint_control.live_states(bots)
        verdict = endpoint_control.aggregate_state(mode, states)
    return {**verdict, "mode": mode}


# ---- Routes -------------------------------------------------------------


@router.get("/state")
async def endpoint_state(
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Aggregate readiness of the managed endpoints for the chat gate."""
    overrides = await config_overrides.load_overrides(session)
    mode = endpoint_control.read_mode(overrides)
    cfg = await config_overrides.get_merged_config(session)
    return await _current_verdict(mode, cfg)


@router.post("/activate")
async def activate_endpoints(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Wake every managed endpoint so participants can start chatting."""
    overrides = await config_overrides.load_overrides(session)
    mode = endpoint_control.read_mode(overrides)

    if mode == "off":
        audit_event(
            "endpoints.activate",
            ok=False,
            user="public",
            ip=client_ip(request),
            extra={"reason": "disabled"},
        )
        raise HTTPException(
            status_code=403,
            detail="Activation is currently disabled by the administrator.",
        )

    retry_after = _rate_limited(client_ip(request))
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many activation attempts. Try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )

    # Scoped to the active config, so a visitor on the v1-only default
    # never wakes the GPU behind a bot they cannot reach.
    cfg = await config_overrides.get_merged_config(session)
    bots = endpoint_control.managed_bots(cfg)
    await endpoint_control.wake_all(bots)
    audit_event(
        "endpoints.activate",
        ok=True,
        user="public",
        ip=client_ip(request),
        extra={"count": len(bots)},
    )

    # Bypass the cache so the response reflects the just-issued wake.
    if mode in ("off", "on") or not bots:
        verdict = endpoint_control.aggregate_state(mode, [])
    else:
        states = await endpoint_control.live_states(bots, force=True)
        verdict = endpoint_control.aggregate_state(mode, states)
    return {**verdict, "mode": mode}
