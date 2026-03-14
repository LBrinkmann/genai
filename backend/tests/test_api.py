"""Tests for API endpoints."""

import csv
import io
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.models import Base

# --------------- fixtures ---------------

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
        system_message: ""
    feedback_configs:
      - name: "compare"
        bots: ["bot-a", "bot-b"]
        main_preference_feedback: "I prefer this"
        additional_categories:
          - "More helpful"
    """
)

# Create a module-level test engine
_test_engine = create_async_engine("sqlite+aiosqlite://", echo=False)


@event.listens_for(_test_engine.sync_engine, "connect")
def _set_sqlite_pragma(conn, _):
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


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
    """Load test config and swap DB engine."""
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(TEST_CONFIG_YAML)
    monkeypatch.setenv("CONFIG_PATH", str(cfg_file))
    monkeypatch.setenv("ACCESS_KEY", "test-secret")

    from app.config import init_config

    init_config(str(cfg_file))

    # Swap the database module globals
    import app.database as db_mod

    monkeypatch.setattr(db_mod, "engine", _test_engine)
    monkeypatch.setattr(
        db_mod,
        "async_session_factory",
        _test_session_factory,
    )


@pytest.fixture(autouse=True)
async def _setup_tables():
    """Create and drop tables for each test."""
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture()
def client():
    """FastAPI TestClient with overridden deps."""
    from fastapi.testclient import TestClient

    from app.database import get_session
    from app.main import app

    app.dependency_overrides[get_session] = _override_get_session
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


# --------------- config tests ---------------


def test_get_config_valid(client) -> None:
    resp = client.get("/api/config/compare")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "compare"
    assert len(data["bots"]) == 2
    assert data["bots"][0]["name"] == "bot-a"
    assert data["main_preference_feedback"] == ("I prefer this")
    assert data["additional_categories"] == ["More helpful"]
    assert "access_key" not in data


def test_get_config_not_found(client) -> None:
    resp = client.get("/api/config/nonexistent")
    assert resp.status_code == 404


# --------------- chat tests ---------------


def test_chat_proxies_to_llm(client) -> None:
    mock_response = httpx.Response(
        200,
        json={"choices": [{"message": {"content": "Hello there!"}}]},
        request=httpx.Request("POST", "https://x"),
    )

    with patch("app.routes.chat.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_client

        resp = client.post(
            "/api/chat",
            json={
                "bot_name": "bot-a",
                "messages": [
                    {
                        "role": "user",
                        "content": "Hi",
                    }
                ],
            },
        )

    assert resp.status_code == 200
    assert resp.json()["content"] == "Hello there!"

    # Verify system message was prepended
    call_kwargs = mock_client.post.call_args
    sent = call_kwargs.kwargs["json"]["messages"]
    assert sent[0]["role"] == "system"
    assert sent[0]["content"] == "You are helpful."


def test_chat_bot_not_found(client) -> None:
    resp = client.post(
        "/api/chat",
        json={
            "bot_name": "nonexistent",
            "messages": [],
        },
    )
    assert resp.status_code == 404


# --------------- session tests ---------------


def test_create_session(client) -> None:
    resp = client.post(
        "/api/sessions",
        json={
            "user_id": "user-1",
            "feedback_config_name": "compare",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert "created_at" in data


# --------------- message tests ---------------


def test_save_message(client) -> None:
    now = datetime.now(timezone.utc).isoformat()
    resp = client.post(
        "/api/messages",
        json={
            "user_id": "user-1",
            "session_id": "sess-1",
            "index": 0,
            "role": "user",
            "content": "Hello",
            "bot_ids": [],
            "feedback": [],
            "timestamp": now,
        },
    )
    assert resp.status_code == 201


def test_save_message_duplicate(client) -> None:
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "user_id": "user-1",
        "session_id": "sess-dup",
        "index": 0,
        "role": "user",
        "content": "First",
        "bot_ids": [],
        "feedback": [],
        "timestamp": now,
    }
    resp1 = client.post("/api/messages", json=payload)
    assert resp1.status_code == 201

    payload["content"] = "Second"
    resp2 = client.post("/api/messages", json=payload)
    assert resp2.status_code == 201


# --------------- export tests ---------------


AUTH_HEADER = {"Authorization": "Bearer test-secret"}


def test_export_messages_csv(client) -> None:
    now = datetime.now(timezone.utc).isoformat()
    client.post(
        "/api/messages",
        json={
            "user_id": "u1",
            "session_id": "s1",
            "index": 0,
            "role": "user",
            "content": "hi",
            "bot_ids": [],
            "feedback": [],
            "timestamp": now,
        },
    )

    resp = client.get("/api/export/messages", headers=AUTH_HEADER)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]

    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    assert rows[0][0] == "id"
    assert "selected" in rows[0]
    assert len(rows) >= 2


def test_export_session_messages_csv(
    client,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    client.post(
        "/api/messages",
        json={
            "user_id": "u1",
            "session_id": "s-export",
            "index": 0,
            "role": "user",
            "content": "test",
            "bot_ids": [],
            "feedback": [],
            "timestamp": now,
        },
    )

    resp = client.get(
        "/api/export/messages/s-export",
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 200
    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    assert len(rows) >= 2


def test_export_sessions_csv(client) -> None:
    client.post(
        "/api/sessions",
        json={
            "user_id": "u1",
            "feedback_config_name": "compare",
        },
    )

    resp = client.get("/api/export/sessions", headers=AUTH_HEADER)
    assert resp.status_code == 200
    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    assert rows[0] == [
        "session_id",
        "user_id",
        "feedback_config_name",
        "created_at",
        "message_count",
    ]
    assert len(rows) >= 2


def test_export_requires_auth(client) -> None:
    """Export endpoints return 401 without valid key."""
    for path in [
        "/api/export/messages",
        "/api/export/messages/s1",
        "/api/export/sessions",
    ]:
        resp = client.get(path)
        assert resp.status_code == 401

    bad = {"Authorization": "Bearer wrong"}
    for path in [
        "/api/export/messages",
        "/api/export/sessions",
    ]:
        resp = client.get(path, headers=bad)
        assert resp.status_code == 401


# --------------- health ---------------


def test_health(client) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# --------------- validate-key ---------------


def test_validate_key_correct(client) -> None:
    resp = client.post(
        "/api/auth/validate-key",
        json={"key": "test-secret"},
    )
    assert resp.status_code == 200
    assert resp.json()["valid"] is True


def test_validate_key_wrong(client) -> None:
    resp = client.post(
        "/api/auth/validate-key",
        json={"key": "bad"},
    )
    assert resp.status_code == 200
    assert resp.json()["valid"] is False


# --------------- selected field ---------------


def test_save_message_with_selected(client) -> None:
    now = datetime.now(timezone.utc).isoformat()
    resp = client.post(
        "/api/messages",
        json={
            "user_id": "u1",
            "session_id": "s-sel",
            "index": 0,
            "role": "assistant",
            "content": [
                {"bot": "a", "text": "hi"},
                {"bot": "b", "text": "hey"},
            ],
            "bot_ids": ["a", "b"],
            "feedback": [],
            "selected": 1,
            "timestamp": now,
        },
    )
    assert resp.status_code == 201

    export = client.get(
        "/api/export/messages/s-sel",
        headers=AUTH_HEADER,
    )
    reader = csv.reader(io.StringIO(export.text))
    rows = list(reader)
    header = rows[0]
    sel_idx = header.index("selected")
    assert rows[1][sel_idx] == "1"


# --------------- LLM error handling ---------------


def test_chat_bad_llm_response(client) -> None:
    """502 when LLM returns unexpected JSON."""
    mock_response = httpx.Response(
        200,
        json={"unexpected": "format"},
        request=httpx.Request("POST", "https://x"),
    )

    with patch("app.routes.chat.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_client

        resp = client.post(
            "/api/chat",
            json={
                "bot_name": "bot-a",
                "messages": [{"role": "user", "content": "Hi"}],
            },
        )

    assert resp.status_code == 502
