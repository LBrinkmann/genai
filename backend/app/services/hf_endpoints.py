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

    return {
        "name": payload.get("name") or "",
        "state": _normalize_state(status.get("state")),
        "message": status.get("message"),
        "url": status.get("url"),
        "model": model.get("repository"),
        "instance": compute.get("instanceType"),
    }


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
