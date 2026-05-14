"""Tests for the admin config-override routes."""

import textwrap
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.auth import SESSION_COOKIE_NAME
from app.models import Base
from app.services import config_overrides

# Reuse the YAML the other tests use, with one extra feedback_config so
# we can test ``active_feedback_config`` switching.
TEST_CONFIG_YAML = textwrap.dedent(
    """\
    bots:
      - name: "bot-a"
        model: "gpt-4"
        api_url: "https://api.example.com/v1/chat/completions"
        api_key: "sk-test"
        system_message: "You are helpful."
      - name: "bot-b"
        model: "llama-3"
        api_url: "http://localhost:8080/v1/chat/completions"
        api_key: ""
        system_message: "You are friendly."
    feedback_configs:
      - name: "default"
        bots: ["bot-a", "bot-b"]
        main_preference_feedback: "I prefer this"
        additional_categories:
          - "More helpful"
        visible_limit: 3
        context_limit: 10
      - name: "comparison"
        bots: ["bot-a"]
        main_preference_feedback: ""
        additional_categories: []
        visible_limit: 5
        context_limit: null
    """
)


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
def _config_and_db(tmp_path: Path, monkeypatch):
    """Load test config and swap DB engine for the running app."""
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(TEST_CONFIG_YAML)
    monkeypatch.setenv("CONFIG_PATH", str(cfg_file))

    from app.config import init_config

    init_config(str(cfg_file))

    import app.database as db_mod

    monkeypatch.setattr(db_mod, "engine", _test_engine)
    monkeypatch.setattr(db_mod, "async_session_factory", _test_session_factory)

    # Always start each case with a fresh override cache.
    config_overrides.reset_cache()


@pytest.fixture(autouse=True)
async def _setup_tables():
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture()
def client(admin_session_env):
    from app.database import get_session
    from app.main import app

    app.dependency_overrides[get_session] = _override_get_session
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


# ---- Cases -------------------------------------------------------------


def test_get_admin_config_requires_auth(client):
    resp = client.get("/api/admin/config")
    assert resp.status_code == 401


def test_get_admin_config_returns_empty_overrides(client, admin_cookie):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    resp = client.get("/api/admin/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["overrides"] == {}
    assert set(data["available_feedback_configs"]) == {
        "default",
        "comparison",
    }
    assert set(data["available_bots"]) == {"bot-a", "bot-b"}
    # Merged should mirror YAML.
    fc_default = [
        fc
        for fc in data["merged"]["feedback_configs"]
        if fc["name"] == "default"
    ][0]
    assert fc_default["visible_limit"] == 3
    assert fc_default["context_limit"] == 10


def test_patch_visible_limit_applies_to_feedback_configs(client, admin_cookie):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    resp = client.patch("/api/admin/config", json={"visible_limit": 7})
    assert resp.status_code == 200
    data = resp.json()
    assert data["overrides"]["visible_limit"] == 7
    for fc in data["merged"]["feedback_configs"]:
        assert fc["visible_limit"] == 7

    # GET sees the same.
    resp2 = client.get("/api/admin/config")
    assert resp2.status_code == 200
    assert resp2.json()["overrides"]["visible_limit"] == 7

    # And /api/config/default reflects it.
    public = client.get("/api/config/default")
    assert public.status_code == 200
    assert public.json()["visible_limit"] == 7


def test_patch_invalid_bot_name_returns_400(client, admin_cookie):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    resp = client.patch(
        "/api/admin/config",
        json={"bot_overrides": {"no-such-bot": {"system_message": "evil"}}},
    )
    assert resp.status_code == 400


def test_patch_invalid_active_feedback_config_returns_400(
    client, admin_cookie
):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    resp = client.patch(
        "/api/admin/config",
        json={"active_feedback_config": "no-such-fc"},
    )
    assert resp.status_code == 400


def test_patch_accumulates_with_previous_overrides(client, admin_cookie):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    r1 = client.patch("/api/admin/config", json={"visible_limit": 5})
    assert r1.status_code == 200

    r2 = client.patch(
        "/api/admin/config",
        json={"bot_overrides": {"bot-a": {"system_message": "new persona"}}},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["overrides"]["visible_limit"] == 5
    assert (
        data["overrides"]["bot_overrides"]["bot-a"]["system_message"]
        == "new persona"
    )

    # Merged bot-a system_message reflects the override.
    bot_a = [b for b in data["merged"]["bots"] if b["name"] == "bot-a"][0]
    assert bot_a["system_message"] == "new persona"


def test_patch_active_feedback_config_pins_default(client, admin_cookie):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    resp = client.patch(
        "/api/admin/config",
        json={"active_feedback_config": "comparison"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["merged"]["defaults"]["config"] == "comparison"


def test_delete_wipes_overrides(client, admin_cookie):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    client.patch("/api/admin/config", json={"visible_limit": 9})

    resp = client.delete("/api/admin/config")
    assert resp.status_code == 200
    assert resp.json()["overrides"] == {}

    resp2 = client.get("/api/admin/config")
    assert resp2.json()["overrides"] == {}
    fc_default = [
        fc
        for fc in resp2.json()["merged"]["feedback_configs"]
        if fc["name"] == "default"
    ][0]
    assert fc_default["visible_limit"] == 3


def test_patch_null_resets_individual_field(client, admin_cookie):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    client.patch("/api/admin/config", json={"visible_limit": 8})
    client.patch(
        "/api/admin/config",
        json={"bot_overrides": {"bot-a": {"system_message": "x"}}},
    )

    # Reset just visible_limit; bot_overrides should remain.
    r = client.patch("/api/admin/config", json={"visible_limit": None})
    assert r.status_code == 200
    data = r.json()
    assert "visible_limit" not in data["overrides"]
    assert "bot_overrides" in data["overrides"]


def test_patch_rejects_unknown_top_level_field(client, admin_cookie):
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    resp = client.patch("/api/admin/config", json={"hax0r": 1})
    assert resp.status_code == 400
