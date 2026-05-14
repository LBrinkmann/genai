"""Tests for the admin LLM-endpoint control routes."""

import json
import time
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner

from app.auth import SESSION_COOKIE_NAME
from app.config import (
    AppConfig,
    BotConfig,
    DefaultsConfig,
    FeedbackConfig,
    LLMEndpointConfig,
)
from app.routes.admin import router as admin_router
from app.services.hf_endpoints import (
    HFAuthError,
    HFTimeoutError,
)

TEST_SESSION_SECRET = "test-secret-for-tests-only-not-prod-32-bytes-pad"
TEST_USER = "admin"


# ---- Fixtures ----------------------------------------------------------


@pytest.fixture
def env(monkeypatch):
    """Set session + HF env vars for every case."""
    monkeypatch.setenv("SESSION_SECRET", TEST_SESSION_SECRET)
    monkeypatch.setenv("HF_API_TOKEN", "hf_test_token_DO_NOT_LEAK")
    yield


@pytest.fixture
def app(env):
    """Minimal FastAPI app with only the admin router mounted."""
    fastapi_app = FastAPI()
    fastapi_app.include_router(admin_router)
    return fastapi_app


@pytest.fixture
def client(app):
    """TestClient that doesn't re-raise server-side exceptions."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def _set_test_config(
    monkeypatch: pytest.MonkeyPatch,
    bots: list[BotConfig],
) -> None:
    """Install a synthetic AppConfig for the duration of a test."""
    import app.config as config_mod

    feedback = FeedbackConfig(
        name="default",
        bots=[bots[0].name] if bots else [],
        main_preference_feedback="",
        additional_categories=[],
        visible_limit=3,
        context_limit=None,
    )
    cfg = AppConfig(
        bots=bots,
        feedback_configs=[feedback] if bots else [],
        defaults=DefaultsConfig(),
    )
    monkeypatch.setattr(config_mod, "_config", cfg)


def _valid_cookie() -> str:
    """Hand-sign a cookie that ``require_admin_session`` will accept."""
    payload = {
        "user": TEST_USER,
        "exp": int(time.time()) + 3600,
    }
    signed = TimestampSigner(TEST_SESSION_SECRET).sign(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    return signed.decode("utf-8")


def _attach_session(client: TestClient) -> None:
    """Inject the signed admin_session cookie into the test client."""
    client.cookies.set(SESSION_COOKIE_NAME, _valid_cookie())


# Bots used across cases.
_MANAGED_BOT = BotConfig(
    name="genocide-ai",
    model="NoraAl/GENocideAI-01",
    api_url="https://example.invalid/v1/chat/completions",
    api_key="hf_xxx",
    system_message="",
    llm_endpoint=LLMEndpointConfig(
        provider="hf",
        namespace="NoraAl",
        name="genocideai-01-ywg",
    ),
)
_UNMANAGED_BOT = BotConfig(
    name="plain-bot",
    model="gpt-4",
    api_url="https://api.example.com/v1/chat/completions",
    api_key="",
    system_message="",
)


# Sample HF response payloads, as returned by ``hf_endpoints._normalize``.
def _norm(state: str, **kw) -> dict:
    base = {
        "name": "genocideai-01-ywg",
        "state": state,
        "message": None,
        "url": None,
        "model": "NoraAl/GENocideAI-01",
        "instance": "nvidia-a10g",
    }
    base.update(kw)
    return base


# ---- Cases -------------------------------------------------------------


def test_list_without_cookie_returns_401(client, monkeypatch):
    """Case 1: missing session cookie → 401."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    resp = client.get("/api/admin/llm-endpoints")
    assert resp.status_code == 401


def test_list_with_no_managed_bots_returns_empty(client, monkeypatch):
    """Case 2: authenticated but no bots have llm_endpoint → []."""
    _set_test_config(monkeypatch, [_UNMANAGED_BOT])
    _attach_session(client)
    resp = client.get("/api/admin/llm-endpoints")
    assert resp.status_code == 200
    assert resp.json() == {"endpoints": []}


def test_list_returns_managed_endpoint_state(client, monkeypatch):
    """Case 3: one managed bot, HF says paused → row appears."""
    _set_test_config(monkeypatch, [_MANAGED_BOT, _UNMANAGED_BOT])
    _attach_session(client)
    with patch(
        "app.routes.admin.hf_endpoints.get_status",
        new=AsyncMock(return_value=_norm("paused")),
    ) as mock_get:
        resp = client.get("/api/admin/llm-endpoints")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["endpoints"]) == 1
    row = data["endpoints"][0]
    assert row["bot_name"] == "genocide-ai"
    assert row["state"] == "paused"
    assert row["namespace"] == "NoraAl"
    assert row["name"] == "genocideai-01-ywg"
    mock_get.assert_awaited_once_with("NoraAl", "genocideai-01-ywg")


def test_resume_happy_path(client, monkeypatch):
    """Case 4: resume calls HF with the right args, returns new state."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    _attach_session(client)
    with patch(
        "app.routes.admin.hf_endpoints.resume",
        new=AsyncMock(return_value=_norm("initializing")),
    ) as mock_resume:
        resp = client.post(
            "/api/admin/llm-endpoints/genocide-ai/resume",
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "initializing"
    assert body["bot_name"] == "genocide-ai"
    mock_resume.assert_awaited_once_with("NoraAl", "genocideai-01-ywg")


def test_resume_unknown_bot_returns_404(client, monkeypatch):
    """Case 5: unknown bot or unmanaged bot → 404 on resume."""
    _set_test_config(monkeypatch, [_MANAGED_BOT, _UNMANAGED_BOT])
    _attach_session(client)
    # Wholly unknown name.
    resp = client.post("/api/admin/llm-endpoints/nope/resume")
    assert resp.status_code == 404

    # Known but unmanaged (no llm_endpoint block).
    resp2 = client.post("/api/admin/llm-endpoints/plain-bot/resume")
    assert resp2.status_code == 404


def test_pause_happy_path(client, monkeypatch):
    """Case 6: pause calls HF and returns new state."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    _attach_session(client)
    with patch(
        "app.routes.admin.hf_endpoints.pause",
        new=AsyncMock(return_value=_norm("paused")),
    ) as mock_pause:
        resp = client.post(
            "/api/admin/llm-endpoints/genocide-ai/pause",
        )
    assert resp.status_code == 200
    assert resp.json()["state"] == "paused"
    mock_pause.assert_awaited_once_with("NoraAl", "genocideai-01-ywg")


def test_hf_auth_error_returns_502(client, monkeypatch):
    """Case 7: HF rejects token → 502, token never leaks in body."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    _attach_session(client)
    with patch(
        "app.routes.admin.hf_endpoints.resume",
        new=AsyncMock(side_effect=HFAuthError("HF rejected the API token")),
    ):
        resp = client.post(
            "/api/admin/llm-endpoints/genocide-ai/resume",
        )
    assert resp.status_code == 502
    body_text = resp.text
    assert "hf_test_token_DO_NOT_LEAK" not in body_text


def test_hf_timeout_returns_504(client, monkeypatch):
    """Case 8: HF timeout → 504 Gateway Timeout."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    _attach_session(client)
    with patch(
        "app.routes.admin.hf_endpoints.pause",
        new=AsyncMock(side_effect=HFTimeoutError("timed out")),
    ):
        resp = client.post(
            "/api/admin/llm-endpoints/genocide-ai/pause",
        )
    assert resp.status_code == 504
