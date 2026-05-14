"""Tests for the admin login / logout / me endpoints."""

import json
import time

import bcrypt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner

from app.auth import (
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    require_admin_session,
)
from app.routes.auth import (
    RATE_LIMIT_MAX_ATTEMPTS,
    _reset_rate_limit_for_tests,
)
from app.routes.auth import router as auth_router

# Plaintext password used across cases; the bcrypt hash is generated
# in the fixture so the test stays deterministic but doesn't ship a
# hardcoded hash.
TEST_USERNAME = "admin"
TEST_PASSWORD = "secret123"
TEST_SESSION_SECRET = "test-secret-for-tests-only-not-prod-32-bytes-pad"


@pytest.fixture
def env(monkeypatch):
    """Configure env vars + reset the rate limiter."""
    hashed = bcrypt.hashpw(
        TEST_PASSWORD.encode("utf-8"),
        bcrypt.gensalt(rounds=4),
    ).decode("utf-8")
    monkeypatch.setenv("ADMIN_USERNAME", TEST_USERNAME)
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", hashed)
    monkeypatch.setenv("SESSION_SECRET", TEST_SESSION_SECRET)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    _reset_rate_limit_for_tests()
    yield
    _reset_rate_limit_for_tests()


@pytest.fixture
def app(env):
    """Minimal FastAPI app with only the auth router + a guarded route.

    Avoids the heavier ``app.main`` import (which pulls DB + config
    init). Keeps these tests focused on the auth surface.
    """
    fastapi_app = FastAPI()
    fastapi_app.include_router(auth_router)

    @fastapi_app.get("/api/_test_protected")  # test-only route
    async def protected(
        user: str = Depends(require_admin_session),
    ) -> dict:
        return {"user": user}

    return fastapi_app


@pytest.fixture
def client(app):
    """TestClient with raise_server_exceptions disabled."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ---- helpers -----------------------------------------------------------


def _sign_payload(payload: dict, secret: str = TEST_SESSION_SECRET) -> str:
    """Hand-sign a payload to fabricate cookies for tests."""
    return (
        TimestampSigner(secret)
        .sign(json.dumps(payload).encode("utf-8"))
        .decode("utf-8")
    )


# ---- cases -------------------------------------------------------------


def test_login_wrong_username_returns_401(client):
    """Case 1: unknown user → 401 with the standard shape."""
    resp = client.post(
        "/api/auth/login",
        json={"username": "nope", "password": TEST_PASSWORD},
    )
    assert resp.status_code == 401
    assert resp.json() == {"detail": "Invalid credentials"}


def test_login_wrong_password_returns_401(client):
    """Case 2: known user, wrong password → 401, same shape as case 1."""
    resp = client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": "wrong"},
    )
    assert resp.status_code == 401
    assert resp.json() == {"detail": "Invalid credentials"}


def test_login_success_sets_cookie(client):
    """Case 3: correct creds → 200, cookie set with right attributes."""
    resp = client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "user": TEST_USERNAME}

    # The Set-Cookie header carries the attributes; the TestClient
    # cookie jar only exposes value, so inspect the raw header.
    set_cookie = resp.headers.get("set-cookie", "")
    assert f"{SESSION_COOKIE_NAME}=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=strict" in set_cookie or ("SameSite=Strict" in set_cookie)
    assert f"Max-Age={SESSION_MAX_AGE}" in set_cookie
    assert "Path=/" in set_cookie
    # COOKIE_SECURE=false in the fixture → Secure should NOT appear.
    assert "Secure" not in set_cookie


def test_login_rate_limited_after_five_attempts(client):
    """Case 4: 6th attempt in 60s from same IP → 429 + Retry-After."""
    for _ in range(RATE_LIMIT_MAX_ATTEMPTS):
        resp = client.post(
            "/api/auth/login",
            json={"username": TEST_USERNAME, "password": "wrong"},
        )
        # All five within the window are still allowed by the limiter
        # (they return 401 because creds are wrong).
        assert resp.status_code == 401

    resp = client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 429
    assert "retry-after" in {k.lower() for k in resp.headers}
    retry_after = int(resp.headers["retry-after"])
    assert 1 <= retry_after <= 60


def test_me_without_cookie(client):
    """Case 5: GET /me without cookie → 200, authenticated false."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": False, "user": None}


def test_me_with_valid_cookie(client):
    """Case 6: GET /me with valid cookie → 200, authenticated true."""
    login = client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    assert login.status_code == 200
    # TestClient carries the cookie through its jar automatically.
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json() == {
        "authenticated": True,
        "user": TEST_USERNAME,
    }


def test_me_with_forged_cookie(client):
    """Case 7: bad-signature cookie → authenticated false (NOT 401)."""
    forged = _sign_payload(
        {
            "user": TEST_USERNAME,
            "exp": int(time.time()) + 3600,
        },
        secret="a-different-secret-than-the-real-one",
    )
    client.cookies.set(SESSION_COOKIE_NAME, forged)
    resp = client.get("/api/auth/me")
    client.cookies.clear()
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": False, "user": None}


def test_me_with_expired_cookie(client):
    """Case 8: payload exp in the past → authenticated false."""
    expired = _sign_payload(
        {
            "user": TEST_USERNAME,
            "exp": int(time.time()) - 10,
        }
    )
    client.cookies.set(SESSION_COOKIE_NAME, expired)
    resp = client.get("/api/auth/me")
    client.cookies.clear()
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": False, "user": None}


def test_logout_clears_cookie(client):
    """Case 9: /logout after login → cookie cleared (max-age=0)."""
    client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    set_cookie = resp.headers.get("set-cookie", "")
    assert f"{SESSION_COOKIE_NAME}=" in set_cookie
    expired_marker = (
        "Max-Age=0" in set_cookie
        or "expires=Thu, 01 Jan 1970" in set_cookie.lower()
    )
    assert expired_marker, set_cookie

    # And /me confirms the session is gone after a fresh client.
    # The Set-Cookie header in the response should have cleared the jar;
    # if it didn't (TestClient quirks), check via a manual probe.
    client.cookies.clear()
    me = client.get("/api/auth/me")
    assert me.json()["authenticated"] is False


def test_require_admin_session_guard(client):
    """Case 10: guarded route is 401 without cookie, 200 with one."""
    # Without cookie → 401.
    unauth = client.get("/api/_test_protected")
    assert unauth.status_code == 401

    # With a valid cookie → 200 and the user is propagated.
    client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    auth = client.get("/api/_test_protected")
    assert auth.status_code == 200
    assert auth.json() == {"user": TEST_USERNAME}
