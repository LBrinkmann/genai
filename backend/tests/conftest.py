"""Shared pytest fixtures.

The ``admin_cookie`` fixture hands tests a pre-signed ``admin_session``
cookie value matching the configured ``SESSION_SECRET``, so a TestClient
can authenticate against routes guarded by ``require_admin_session``
without going through the full login flow (which would also require
bcrypt + rate-limit setup).

The ``admin_session_env`` fixture sets the env vars the cookie machinery
needs and returns the secret used to sign the cookie. Tests that want to
hit guarded routes should request ``admin_session_env`` (or just
``admin_cookie``, which depends on it) so the env is in place before the
guard runs.
"""

import json
import time

import pytest
from itsdangerous import TimestampSigner

from app.auth import SESSION_MAX_AGE

TEST_SESSION_SECRET = "test-secret-for-tests-only-not-prod-32-bytes-pad"
TEST_ADMIN_USERNAME = "admin"


@pytest.fixture
def admin_session_env(monkeypatch):
    """Set env vars required for ``require_admin_session`` to verify."""
    monkeypatch.setenv("SESSION_SECRET", TEST_SESSION_SECRET)
    monkeypatch.setenv("ADMIN_USERNAME", TEST_ADMIN_USERNAME)
    return TEST_SESSION_SECRET


@pytest.fixture
def admin_cookie(admin_session_env) -> str:
    """Return a freshly-signed ``admin_session`` cookie value.

    Sign a payload with ``{user, exp}`` using the same ``TimestampSigner``
    that the production guard uses. Tests should set it on the TestClient
    jar with ``client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)``
    (per-request ``cookies=`` is deprecated in Starlette).
    """
    payload = {
        "user": TEST_ADMIN_USERNAME,
        "exp": int(time.time()) + SESSION_MAX_AGE,
    }
    signer = TimestampSigner(admin_session_env)
    signed = signer.sign(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    return signed.decode("utf-8")
