"""Authentication endpoints: login / logout / me.

Backed by a signed cookie (``admin_session``) using
``itsdangerous.TimestampSigner``. Password verification uses
``bcrypt.checkpw`` against ``ADMIN_PASSWORD_HASH``. Login is rate
limited per client IP via an in-memory deque (no Redis).

NOTE on rate-limit storage: the deque lives in the worker process. The
production compose setup runs a single uvicorn worker, so this is
effectively global; if we ever scale workers > 1 we will need to move
this to Redis. Documented intentionally — see plan doc.
"""

import hmac
import json
import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

import bcrypt
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.auth import (
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    decode_session_cookie,
    get_signer,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---- Rate limiting -----------------------------------------------------

RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_ATTEMPTS = 5

# Per-IP deque of recent attempt timestamps (float seconds).
_attempt_log: Dict[str, Deque[float]] = defaultdict(deque)
_attempt_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    """Resolve the client IP, honoring X-Forwarded-For when trusted."""
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


def _check_rate_limit(ip: str) -> int:
    """Record an attempt and return seconds-until-retry, or 0 if ok.

    Trims out-of-window entries, then appends. If the trimmed window
    already has >= MAX attempts, returns the seconds the caller must
    wait. Thread-safe via a module-level lock (uvicorn may run multiple
    threads under the asyncio executor).
    """
    now = time.time()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    with _attempt_lock:
        log = _attempt_log[ip]
        while log and log[0] < cutoff:
            log.popleft()
        if len(log) >= RATE_LIMIT_MAX_ATTEMPTS:
            retry_after = int(RATE_LIMIT_WINDOW_SECONDS - (now - log[0]))
            return max(retry_after, 1)
        log.append(now)
        return 0


def _reset_rate_limit_for_tests() -> None:
    """Test helper: wipe the rate-limit log between cases."""
    with _attempt_lock:
        _attempt_log.clear()


# ---- Constant-time password check --------------------------------------

# A pre-computed bcrypt hash used as a placeholder when the username
# does not match. Ensures we still spend time hashing, defeating
# username-enumeration via timing. Generated once at import (small cost,
# happens once per worker).
_PLACEHOLDER_HASH = bcrypt.hashpw(
    b"placeholder-not-a-real-password",
    bcrypt.gensalt(rounds=12),
)


def _verify_credentials(username: str, password: str) -> bool:
    """Return True iff (username, password) match the admin creds.

    Uses ``hmac.compare_digest`` on the username and ``bcrypt.checkpw``
    on the password. Always runs ``bcrypt.checkpw`` even when the
    username is wrong, against ``_PLACEHOLDER_HASH``, so the response
    time does not leak whether the username exists.
    """
    expected_user = os.environ.get("ADMIN_USERNAME", "")
    expected_hash = os.environ.get("ADMIN_PASSWORD_HASH", "")

    user_ok = bool(expected_user) and hmac.compare_digest(
        username.encode("utf-8"),
        expected_user.encode("utf-8"),
    )

    # Run bcrypt unconditionally to equalize timing. Choose the real
    # hash when the username matched and there is one configured;
    # otherwise hash against the placeholder.
    if user_ok and expected_hash:
        hash_to_check = expected_hash.encode("utf-8")
    else:
        hash_to_check = _PLACEHOLDER_HASH

    try:
        pw_ok = bcrypt.checkpw(
            password.encode("utf-8"),
            hash_to_check,
        )
    except ValueError:
        # Malformed hash in env; treat as failure but still consume
        # time (we already did the checkpw call above).
        pw_ok = False

    # Combine with hmac.compare_digest on single-byte tokens to keep
    # the final comparison constant-time too.
    user_byte = b"\x01" if user_ok else b"\x00"
    pw_byte = b"\x01" if pw_ok else b"\x00"
    return hmac.compare_digest(user_byte, b"\x01") and hmac.compare_digest(
        pw_byte, b"\x01"
    )


# ---- Cookie helpers ----------------------------------------------------


def _cookie_secure() -> bool:
    """Resolve the Secure flag. Defaults to True (fail-safe)."""
    raw = os.environ.get("COOKIE_SECURE")
    if raw is None:
        return True
    return raw.strip().lower() not in ("0", "false", "no", "")


def _set_session_cookie(response: Response, user: str) -> None:
    """Sign a fresh payload and attach the admin_session cookie."""
    payload = {
        "user": user,
        "exp": int(time.time()) + SESSION_MAX_AGE,
    }
    signed = get_signer().sign(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=signed.decode("utf-8"),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=_cookie_secure(),
        samesite="strict",
        path="/",
    )


# ---- Pydantic schemas --------------------------------------------------


class LoginRequest(BaseModel):
    """Body for POST /api/auth/login."""

    username: str
    password: str


class LoginResponse(BaseModel):
    """Successful login response."""

    ok: bool
    user: str


class MeResponse(BaseModel):
    """GET /api/auth/me response."""

    authenticated: bool
    user: str | None = None


class LogoutResponse(BaseModel):
    """POST /api/auth/logout response."""

    ok: bool


# ---- Routes ------------------------------------------------------------


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
) -> LoginResponse:
    """Verify credentials, set the admin_session cookie."""
    ip = _client_ip(request)
    retry_after = _check_rate_limit(ip)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts",
            headers={"Retry-After": str(retry_after)},
        )

    if not _verify_credentials(body.username, body.password):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    _set_session_cookie(response, body.username)
    return LoginResponse(ok=True, user=body.username)


@router.post("/logout", response_model=LogoutResponse)
async def logout(response: Response) -> LogoutResponse:
    """Clear the admin_session cookie."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value="",
        max_age=0,
        httponly=True,
        secure=_cookie_secure(),
        samesite="strict",
        path="/",
    )
    return LogoutResponse(ok=True)


@router.get("/me", response_model=MeResponse)
async def me(request: Request, response: Response) -> MeResponse:
    """Probe the session. Never raises.

    Returns ``{authenticated: false}`` for missing / tampered /
    expired cookies. For a valid cookie, slides the expiry by
    re-issuing a fresh cookie.
    """
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    payload = decode_session_cookie(cookie or "")
    if payload is None:
        return MeResponse(authenticated=False)
    user = payload["user"]
    # Sliding refresh: re-issue with a fresh exp window.
    _set_session_cookie(response, user)
    return MeResponse(authenticated=True, user=user)
