"""Shared authentication utilities.

``require_admin_session`` is the only admin guard. It reads the signed
``admin_session`` cookie set by ``POST /api/auth/login`` (see
``backend/app/routes/auth.py``) and raises ``401`` if the cookie is
missing, tampered, or expired.

The legacy ``require_access_key`` Bearer-token guard was removed in
Phase B of the admin-login plan (2026-05). Operators migrate from
``ACCESS_KEY`` to ``ADMIN_USERNAME`` / ``ADMIN_PASSWORD_HASH`` /
``SESSION_SECRET``; see ``backend/scripts/hash_password.py``.
"""

import json
import os
import time

from fastapi import HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner

# Cookie + session constants. Kept here so the routes module can
# re-use them.
SESSION_COOKIE_NAME = "admin_session"
SESSION_MAX_AGE = 86400  # 24 hours, in seconds


def _get_session_secret() -> str:
    """Read SESSION_SECRET from the environment at call time.

    Read on every call (not at import) so tests can swap it via
    monkeypatch and so a missing secret produces a clear error during
    request handling rather than at module-import time.
    """
    secret = os.environ.get("SESSION_SECRET", "")
    if not secret:
        # Surface as a 500 to the client and a clear message in logs.
        raise HTTPException(
            status_code=500,
            detail="Server misconfigured: SESSION_SECRET not set",
        )
    return secret


def get_signer() -> TimestampSigner:
    """Build a TimestampSigner using the current SESSION_SECRET."""
    return TimestampSigner(_get_session_secret())


def decode_session_cookie(value: str) -> dict | None:
    """Validate signature + expiry and return the payload dict.

    Returns ``None`` for any failure (missing, tampered, expired, or
    payload-shape problems). Never raises — callers decide whether a
    bad cookie is a 401 or a probe-style ``authenticated: false``.
    """
    if not value:
        return None
    try:
        signer = get_signer()
    except HTTPException:
        return None
    try:
        raw = signer.unsign(value, max_age=SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        return None
    user = payload.get("user")
    if not isinstance(user, str) or not user:
        return None
    return payload


def require_admin_session(request: Request) -> str:
    """Guard dependency: require a valid admin_session cookie.

    Returns the authenticated username. Raises ``401`` if the cookie is
    missing, tampered, or expired. Sliding-expiry refresh is handled by
    ``GET /api/auth/me`` for v1 — the cookie still survives 24h from
    issue.
    """
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    payload = decode_session_cookie(cookie or "")
    if payload is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = payload["user"]
    # Stash on request.state for downstream handlers that want it.
    request.state.user = user
    return user
