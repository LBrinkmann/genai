"""Async HuggingFace Inference Endpoints API client.

Wraps the small subset of the HF v2 endpoints API we need: get
endpoint status, resume a paused endpoint, pause a running endpoint.

The HF API token is read from the ``HF_API_TOKEN`` environment
variable at *call time* (not module import) so test fixtures can swap
it via ``monkeypatch.setenv``.

All non-2xx responses raise an ``HFError`` subclass. The admin route
layer is responsible for translating these into FastAPI
``HTTPException``s; this module never reaches into FastAPI.
"""

import os
from datetime import datetime, timezone
from typing import Optional

import httpx

API_BASE_URL = "https://api.endpoints.huggingface.cloud/v2"
DEFAULT_TIMEOUT = 15.0

# State strings we surface to callers. HF documents these values for
# the ``status.state`` field; anything else collapses to ``"unknown"``.
_KNOWN_STATES = frozenset(
    {
        "running",
        "paused",
        "scaledToZero",
        "initializing",
        "pending",
        "updating",
        "failed",
        "unknown",
    }
)


# ---- Errors ------------------------------------------------------------


class HFError(Exception):
    """Base class for HF API client errors."""


class HFAuthError(HFError):
    """401/403 from HF, or missing HF_API_TOKEN."""


class HFNotFoundError(HFError):
    """404 from HF (unknown namespace/endpoint name)."""


class HFTimeoutError(HFError):
    """The request to HF timed out."""


class HFAPIError(HFError):
    """Any other non-2xx HF response."""

    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"HF API error {status_code}: {body[:200]}")
        self.status_code = status_code
        self.body = body


# ---- Internal helpers --------------------------------------------------


def _get_token() -> str:
    """Read HF_API_TOKEN from the environment.

    Raises ``HFAuthError`` if missing. Never logs or returns the
    token from anywhere else.
    """
    token = os.environ.get("HF_API_TOKEN", "")
    if not token:
        raise HFAuthError("HF_API_TOKEN not set")
    return token


def _normalize_state(raw: Optional[str]) -> str:
    """Map HF state to our enum, collapsing unknowns to ``unknown``."""
    if raw in _KNOWN_STATES:
        return raw  # type: ignore[return-value]
    return "unknown"


def _normalize(payload: dict) -> dict:
    """Project an HF endpoint response into our flat dict shape.

    HF responses nest fields under ``status``, ``model``, and
    ``compute``. Read each field defensively — HF occasionally omits
    ``status.url`` while an endpoint is initializing, for example.
    """
    if not isinstance(payload, dict):
        payload = {}
    status = payload.get("status") or {}
    if not isinstance(status, dict):
        status = {}
    model = payload.get("model") or {}
    if not isinstance(model, dict):
        model = {}
    compute = payload.get("compute") or {}
    if not isinstance(compute, dict):
        compute = {}

    instance_type = compute.get("instanceType")
    state = _normalize_state(status.get("state"))
    updated_at = status.get("updatedAt")
    estimated_cost_usd = _estimate_running_cost(
        state, updated_at, instance_type
    )

    return {
        "name": payload.get("name") or "",
        "state": state,
        "message": status.get("message"),
        "url": status.get("url"),
        "model": model.get("repository"),
        "instance": instance_type,
        "updated_at": updated_at,
        "estimated_cost_usd": estimated_cost_usd,
    }


# Per-instance hourly $ rates (HF Inference Endpoints public pricing,
# https://huggingface.co/pricing#endpoints — last reviewed 2026-05).
# Unknown instance types fall through to None so the UI can hide the
# cost line instead of showing a misleading $0.00.
_INSTANCE_HOURLY_USD = {
    "nvidia-l4": 0.80,
    "nvidia-t4": 0.50,
    "nvidia-a10g": 1.30,
    "nvidia-l40s": 1.80,
    "nvidia-a100": 4.50,
    "nvidia-h100": 8.30,
    "intel-icl": 0.07,
    "intel-spr": 0.12,
}


def _estimate_running_cost(
    state: str, updated_at: Optional[str], instance_type: Optional[str]
) -> Optional[float]:
    """Estimate $ spent since the endpoint last entered ``running``.

    Returns ``None`` when the endpoint isn't running, the timestamp is
    missing, or we don't have a rate for the instance type. Returns a
    float USD amount otherwise. This is an *upper-bound estimate* — it
    treats ``status.updatedAt`` as the resume time, which is correct for
    a freshly resumed endpoint but inflates the figure if the state
    has been edited for unrelated reasons. The UI should display it
    with an "est." prefix to avoid implying authoritative billing.
    """
    if state != "running":
        return None
    if not updated_at or not instance_type:
        return None
    rate = _INSTANCE_HOURLY_USD.get(instance_type)
    if rate is None:
        return None
    try:
        # HF timestamps are RFC 3339 with Z suffix: "2026-05-14T20:22:14.840Z"
        # datetime.fromisoformat handles "+00:00" but not "Z" until 3.11+,
        # so substitute defensively.
        ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    now = datetime.now(timezone.utc)
    elapsed_hours = max(0.0, (now - ts).total_seconds() / 3600.0)
    return round(elapsed_hours * rate, 2)


def _raise_for_status(resp: httpx.Response) -> None:
    """Convert HF non-2xx responses into typed exceptions."""
    code = resp.status_code
    if 200 <= code < 300:
        return
    if code in (401, 403):
        # Body is intentionally not surfaced — HF echoes the token
        # scope in some 401 responses.
        raise HFAuthError("HF rejected the API token")
    if code == 404:
        raise HFNotFoundError("HF endpoint not found")
    # Truncate body to keep error messages bounded.
    body = ""
    try:
        body = resp.text
    except Exception:  # pragma: no cover — defensive
        body = ""
    raise HFAPIError(code, body)


async def _request(method: str, path: str) -> dict:
    """Issue an authenticated HF request and return JSON."""
    token = _get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    url = f"{API_BASE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.request(method, url, headers=headers)
    except httpx.TimeoutException as exc:
        raise HFTimeoutError("HF request timed out") from exc
    _raise_for_status(resp)
    try:
        return resp.json()
    except ValueError as exc:
        raise HFAPIError(
            resp.status_code,
            "HF returned non-JSON body",
        ) from exc


# ---- Public API --------------------------------------------------------


async def get_status(namespace: str, name: str) -> dict:
    """Return the normalized status dict for an HF endpoint."""
    data = await _request(
        "GET",
        f"/endpoint/{namespace}/{name}",
    )
    return _normalize(data)


async def resume(namespace: str, name: str) -> dict:
    """Resume a paused HF endpoint. Returns the normalized status."""
    data = await _request(
        "POST",
        f"/endpoint/{namespace}/{name}/resume",
    )
    return _normalize(data)


async def pause(namespace: str, name: str) -> dict:
    """Pause a running HF endpoint. Returns the normalized status."""
    data = await _request(
        "POST",
        f"/endpoint/{namespace}/{name}/pause",
    )
    return _normalize(data)
