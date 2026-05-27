"""Shared logic for the public endpoint activation flow.

The chat needs its managed HuggingFace endpoints to be *running* before
participants can talk to the bots. Those endpoints are configured with
HF's native **scale-to-zero**: they idle down to ~$0 on their own after
a period of inactivity, and wake on demand. We deliberately do NOT run
our own shutoff timer — a browser-side timer would leak cost if the tab
closed, and a backend scheduler would just reimplement what HF already
does server-side.

So this module only covers the *wake* direction plus a global admin
mode:

  - ``auto`` — public Activate allowed; endpoints sleep on their own.
  - ``on``   — gate dropped, chat always enabled (best-effort resume;
               scale-to-zero still applies and wakes on demand).
  - ``off``  — endpoints forced paused; public Activate disabled.

The admin mode is persisted in the singleton ``ConfigOverride`` blob
under the ``endpoint_mode`` key (see ``config_overrides``).
"""

import asyncio
import time
from typing import Optional

import httpx

from app.config import BotConfig, get_config
from app.services import hf_endpoints

# ---- Mode ---------------------------------------------------------------

MODES = frozenset({"auto", "on", "off"})
DEFAULT_MODE = "auto"


def read_mode(overrides: dict) -> str:
    """Extract the endpoint mode from an overrides blob (default auto)."""
    mode = (overrides or {}).get("endpoint_mode")
    return mode if mode in MODES else DEFAULT_MODE


# ---- State classification ----------------------------------------------

# Lowercased, separator-stripped HF states grouped by how the chat gate
# should treat them.
_UP_STATES = frozenset({"running", "initializing", "pending", "updating"})
_WAKING_STATES = frozenset({"initializing", "pending", "updating"})
_ASLEEP_STATES = frozenset({"scaledtozero", "paused", "failed"})


def normalize_state(raw: Optional[str]) -> str:
    """Lowercase and drop ``-``/``_`` (so ``scaledToZero`` → one token)."""
    return str(raw or "unknown").lower().replace("-", "").replace("_", "")


def aggregate_state(mode: str, states: list[str]) -> dict:
    """Collapse per-endpoint states into a single chat-gate verdict.

    Returns ``{"ready": bool, "state": str}`` where ``state`` is one of
    ``ready`` | ``waking`` | ``asleep`` | ``disabled`` | ``unavailable``.
    """
    if mode == "off":
        return {"ready": False, "state": "disabled"}
    # ``on`` drops the gate entirely; no managed endpoints means nothing
    # to wait on, so the chat is immediately usable either way.
    if mode == "on" or not states:
        return {"ready": True, "state": "ready"}

    norm = [normalize_state(s) for s in states]
    if all(s == "running" for s in norm):
        return {"ready": True, "state": "ready"}
    if any(s in _ASLEEP_STATES for s in norm):
        return {"ready": False, "state": "asleep"}
    if any(s in _WAKING_STATES for s in norm):
        return {"ready": False, "state": "waking"}
    # All remaining endpoints are ``unknown`` — HF was unreachable.
    return {"ready": False, "state": "unavailable"}


# ---- Managed bots -------------------------------------------------------


def managed_bots() -> list[BotConfig]:
    """Return all bots in the active config with a managed endpoint."""
    cfg = get_config()
    return [b for b in cfg.bots if b.llm_endpoint is not None]


# ---- Live state (short-TTL cached) -------------------------------------

# A single worker fans many visitor polls into one HF round-trip every
# few seconds. Consistent with the single-worker assumption documented
# in auth.py's rate limiter.
_STATE_TTL_SECONDS = 4.0
_state_cache: dict = {"expires_at": 0.0, "states": None}


def reset_state_cache() -> None:
    """Drop the cached live states (used by tests and after a wake)."""
    _state_cache["expires_at"] = 0.0
    _state_cache["states"] = None


async def live_states(
    bots: list[BotConfig], *, force: bool = False
) -> list[str]:
    """Fetch each managed endpoint's raw HF state, briefly cached.

    A single failed lookup yields ``"unknown"`` for that endpoint rather
    than failing the whole batch. Pass ``force=True`` to bypass the cache
    (e.g. immediately after a wake, to reflect the new state).
    """
    if not bots:
        return []
    now = time.monotonic()
    if (
        not force
        and _state_cache["states"] is not None
        and now < _state_cache["expires_at"]
    ):
        return _state_cache["states"]

    results = await asyncio.gather(
        *(
            hf_endpoints.get_status(
                b.llm_endpoint.namespace,  # type: ignore[union-attr]
                b.llm_endpoint.name,  # type: ignore[union-attr]
            )
            for b in bots
        ),
        return_exceptions=True,
    )
    states = [
        "unknown" if isinstance(r, Exception) else r.get("state", "unknown")
        for r in results
    ]
    _state_cache["states"] = states
    _state_cache["expires_at"] = now + _STATE_TTL_SECONDS
    return states


# ---- Waking -------------------------------------------------------------

_WARMUP_TIMEOUT = 5.0


async def _warmup(bot: BotConfig) -> None:
    """Fire a tiny inference request to trigger a scale-from-zero.

    A scaled-to-zero endpoint wakes on traffic to its inference URL, not
    via the management API. The cold-start 503 (or a timeout) is the
    expected response here, so every error is swallowed — the point is
    simply to have *sent* the request.
    """
    headers = {}
    if bot.api_key:
        headers["Authorization"] = f"Bearer {bot.api_key}"
    payload = {
        "model": bot.model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=_WARMUP_TIMEOUT) as client:
            await client.post(bot.api_url, json=payload, headers=headers)
    except Exception:  # noqa: BLE001 — cold-start 503/timeout expected
        pass


async def wake_bot(bot: BotConfig) -> None:
    """Best-effort wake of a single managed endpoint.

    ``paused`` endpoints need a management-API ``resume``; everything
    else (scaled-to-zero, failed, unreachable) is woken by sending
    inference traffic. Already-up endpoints are left alone.
    """
    ep = bot.llm_endpoint
    if ep is None:
        return
    try:
        status = await hf_endpoints.get_status(ep.namespace, ep.name)
        state = normalize_state(status.get("state"))
    except hf_endpoints.HFError:
        # Couldn't query HF; still try traffic in case it's just asleep.
        await _warmup(bot)
        return

    if state in _UP_STATES:
        return
    if state == "paused":
        try:
            await hf_endpoints.resume(ep.namespace, ep.name)
        except hf_endpoints.HFError:
            pass
    await _warmup(bot)


async def wake_all(bots: list[BotConfig]) -> None:
    """Wake every managed endpoint concurrently, swallowing failures."""
    if not bots:
        return
    await asyncio.gather(*(wake_bot(b) for b in bots), return_exceptions=True)
    reset_state_cache()


async def pause_all(bots: list[BotConfig]) -> None:
    """Force every managed endpoint paused (the ``off`` mode side-effect).

    Pausing is unconditional: a scaled-to-zero endpoint would otherwise
    auto-wake on the next request, so it must be paused too. Per-endpoint
    failures are swallowed; the next status poll reconciles.
    """
    if not bots:
        return
    await asyncio.gather(
        *(
            hf_endpoints.pause(
                b.llm_endpoint.namespace,  # type: ignore[union-attr]
                b.llm_endpoint.name,  # type: ignore[union-attr]
            )
            for b in bots
        ),
        return_exceptions=True,
    )
    reset_state_cache()
