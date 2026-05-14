"""Structured audit-log helper.

A single ``logger.info`` line per admin-relevant event. Format is a
flat JSON dict so uvicorn's default formatter forwards it verbatim and
``docker logs`` / Caddy can index it later. We never log raw values
(passwords, system messages, etc.) — only key names — to avoid leaking
secrets into stdout.
"""

import json
import logging
import os
from typing import Iterable, Optional

from fastapi import Request

logger = logging.getLogger("genai.audit")


def client_ip(request: Request) -> str:
    """Resolve the client IP honoring X-Forwarded-For when trusted."""
    trust_proxy = os.environ.get("TRUST_PROXY", "").lower() in (
        "1",
        "true",
        "yes",
    )
    if trust_proxy:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            first = fwd.split(",")[0].strip()
            if first:
                return first
    if request.client is not None:
        return request.client.host
    return "unknown"


def audit_event(
    event: str,
    *,
    ok: bool,
    user: Optional[str] = None,
    ip: Optional[str] = None,
    payload_keys: Optional[Iterable[str]] = None,
    extra: Optional[dict] = None,
) -> None:
    """Emit a single audit log line at INFO level."""
    record = {
        "event": event,
        "ok": ok,
        "user": user,
        "ip": ip,
        "payload_keys": (sorted(list(payload_keys)) if payload_keys else []),
    }
    if extra:
        # Keep things flat; callers should pass primitives only.
        record.update(extra)
    logger.info(json.dumps(record, separators=(",", ":")))
