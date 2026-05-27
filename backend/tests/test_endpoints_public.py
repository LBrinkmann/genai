"""Tests for the public (no-auth) LLM-endpoint state + activate routes."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import (
    AppConfig,
    BotConfig,
    DefaultsConfig,
    FeedbackConfig,
    LLMEndpointConfig,
)
from app.database import get_session
from app.models import Base
from app.routes import endpoints as endpoints_route
from app.routes.endpoints import router as endpoints_router
from app.services import config_overrides, endpoint_control

# ---- DB (in-memory sqlite) ---------------------------------------------

_test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
_test_session_factory = async_sessionmaker(
    _test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def _override_get_session():
    async with _test_session_factory() as session:
        yield session


@pytest.fixture(autouse=True)
async def _setup_tables():
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    config_overrides.reset_cache()
    endpoint_control.reset_state_cache()
    endpoints_route._reset_rate_limit_for_tests()
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("HF_API_TOKEN", "hf_test_token_DO_NOT_LEAK")
    fastapi_app = FastAPI()
    fastapi_app.include_router(endpoints_router)
    fastapi_app.dependency_overrides[get_session] = _override_get_session
    return fastapi_app


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ---- Config helpers ----------------------------------------------------

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


def _set_test_config(monkeypatch, bots):
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


def _status(state):
    return {"name": "genocideai-01-ywg", "state": state}


# ---- /state ------------------------------------------------------------


def test_state_no_managed_bots_is_ready(client, monkeypatch):
    """No managed endpoints → nothing to gate, chat is ready."""
    _set_test_config(monkeypatch, [_UNMANAGED_BOT])
    resp = client.get("/api/llm-endpoints/state")
    assert resp.status_code == 200
    assert resp.json() == {"ready": True, "state": "ready", "mode": "auto"}


def test_state_auto_running_is_ready(client, monkeypatch):
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    with patch(
        "app.services.endpoint_control.hf_endpoints.get_status",
        new=AsyncMock(return_value=_status("running")),
    ):
        resp = client.get("/api/llm-endpoints/state")
    body = resp.json()
    assert body["ready"] is True
    assert body["state"] == "ready"


def test_state_auto_scaled_to_zero_is_asleep(client, monkeypatch):
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    with patch(
        "app.services.endpoint_control.hf_endpoints.get_status",
        new=AsyncMock(return_value=_status("scaledToZero")),
    ):
        resp = client.get("/api/llm-endpoints/state")
    body = resp.json()
    assert body["ready"] is False
    assert body["state"] == "asleep"


def test_state_auto_initializing_is_waking(client, monkeypatch):
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    with patch(
        "app.services.endpoint_control.hf_endpoints.get_status",
        new=AsyncMock(return_value=_status("initializing")),
    ):
        resp = client.get("/api/llm-endpoints/state")
    body = resp.json()
    assert body["ready"] is False
    assert body["state"] == "waking"


def test_state_mode_off_is_disabled_without_hitting_hf(client, monkeypatch):
    """Mode 'off' short-circuits — no HF calls, gate shows disabled."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    get_mock = AsyncMock(return_value=_status("running"))
    with patch(
        "app.routes.endpoints.config_overrides.load_overrides",
        new=AsyncMock(return_value={"endpoint_mode": "off"}),
    ), patch(
        "app.services.endpoint_control.hf_endpoints.get_status", new=get_mock
    ):
        resp = client.get("/api/llm-endpoints/state")
    body = resp.json()
    assert body == {"ready": False, "state": "disabled", "mode": "off"}
    get_mock.assert_not_awaited()


def test_state_mode_on_is_ready_even_when_asleep(client, monkeypatch):
    """Mode 'on' drops the gate; HF isn't even consulted."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    get_mock = AsyncMock(return_value=_status("scaledToZero"))
    with patch(
        "app.routes.endpoints.config_overrides.load_overrides",
        new=AsyncMock(return_value={"endpoint_mode": "on"}),
    ), patch(
        "app.services.endpoint_control.hf_endpoints.get_status", new=get_mock
    ):
        resp = client.get("/api/llm-endpoints/state")
    body = resp.json()
    assert body == {"ready": True, "state": "ready", "mode": "on"}
    get_mock.assert_not_awaited()


# ---- /activate ---------------------------------------------------------


def test_activate_blocked_when_off(client, monkeypatch):
    """Activation is refused with 403 while mode is 'off'."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    wake_mock = AsyncMock()
    with patch(
        "app.routes.endpoints.config_overrides.load_overrides",
        new=AsyncMock(return_value={"endpoint_mode": "off"}),
    ), patch("app.services.endpoint_control.wake_all", new=wake_mock):
        resp = client.post("/api/llm-endpoints/activate")
    assert resp.status_code == 403
    wake_mock.assert_not_awaited()


def test_activate_wakes_endpoints(client, monkeypatch):
    """Happy path: activation wakes the managed bots and returns state."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    wake_mock = AsyncMock()
    with patch("app.services.endpoint_control.wake_all", new=wake_mock), patch(
        "app.services.endpoint_control.hf_endpoints.get_status",
        new=AsyncMock(return_value=_status("initializing")),
    ):
        resp = client.post("/api/llm-endpoints/activate")
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "waking"
    wake_mock.assert_awaited_once()


def test_activate_rate_limited(client, monkeypatch):
    """Too many activations from one client → 429 with Retry-After."""
    _set_test_config(monkeypatch, [_MANAGED_BOT])
    with patch(
        "app.services.endpoint_control.wake_all", new=AsyncMock()
    ), patch(
        "app.services.endpoint_control.hf_endpoints.get_status",
        new=AsyncMock(return_value=_status("running")),
    ):
        last = None
        for _ in range(endpoints_route._RL_MAX_ATTEMPTS + 1):
            last = client.post("/api/llm-endpoints/activate")
    assert last.status_code == 429
    assert "Retry-After" in last.headers
