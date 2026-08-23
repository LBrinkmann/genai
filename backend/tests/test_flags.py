"""Tests for the admin response-flag routes."""

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


@pytest.fixture()
def auth(client, admin_cookie):
    """A TestClient already carrying a valid admin session cookie."""
    client.cookies.set(SESSION_COOKIE_NAME, admin_cookie)
    return client


def _create(auth, **overrides) -> dict:
    """POST a flag, asserting success, and return the payload."""
    body = {
        "session_id": "sess-1",
        "message_index": 1,
        "response_index": 0,
        "bot_name": "bot-a",
        "response_text": "the flagged answer",
        "comment": "hallucinated",
    }
    body.update(overrides)
    resp = auth.post("/api/admin/flags", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _log_turn(auth, session_id: str, index: int, role: str, content) -> None:
    """Persist one transcript message via the public messages route."""
    resp = auth.post(
        "/api/messages",
        json={
            "user_id": "user-1",
            "session_id": session_id,
            "index": index,
            "role": role,
            "content": content,
            "bot_ids": ["bot-a"],
            "feedback": [],
            "selected": None,
            "timestamp": "2026-01-01T00:00:00Z",
        },
    )
    assert resp.status_code == 201, resp.text


# ---- Auth --------------------------------------------------------------


def test_flag_routes_require_auth(client):
    assert client.post("/api/admin/flags", json={}).status_code == 401
    assert client.get("/api/admin/flags").status_code == 401
    assert client.patch("/api/admin/flags/1", json={}).status_code == 401
    assert client.get("/api/admin/flags/1/context").status_code == 401


# ---- Upsert ------------------------------------------------------------


def test_create_flag_returns_stored_row(auth):
    data = _create(auth)
    assert data["session_id"] == "sess-1"
    assert data["message_index"] == 1
    assert data["response_index"] == 0
    assert data["bot_name"] == "bot-a"
    assert data["response_text"] == "the flagged answer"
    assert data["comment"] == "hallucinated"
    assert data["resolved"] is False
    assert data["created_by"] == "admin"


def test_reflagging_same_response_updates_in_place(auth):
    first = _create(auth)
    second = _create(
        auth,
        comment="actually a refusal",
        response_text="updated snapshot",
    )
    assert second["id"] == first["id"]
    assert second["comment"] == "actually a refusal"
    assert second["response_text"] == "updated snapshot"
    assert second["created_by"] == "admin"

    listed = auth.get("/api/admin/flags").json()
    assert len(listed) == 1


def test_different_response_index_creates_second_flag(auth):
    first = _create(auth)
    second = _create(auth, response_index=1, bot_name="bot-b")
    assert second["id"] != first["id"]
    assert len(auth.get("/api/admin/flags").json()) == 2


# ---- Listing -----------------------------------------------------------


def test_list_filters_by_status(auth):
    open_flag = _create(auth)
    resolved_flag = _create(auth, message_index=2)
    auth.patch(
        f"/api/admin/flags/{resolved_flag['id']}",
        json={"resolved": True},
    )

    all_ids = {f["id"] for f in auth.get("/api/admin/flags").json()}
    assert all_ids == {open_flag["id"], resolved_flag["id"]}

    open_ids = {
        f["id"] for f in auth.get("/api/admin/flags?status=open").json()
    }
    assert open_ids == {open_flag["id"]}

    resolved_ids = {
        f["id"] for f in auth.get("/api/admin/flags?status=resolved").json()
    }
    assert resolved_ids == {resolved_flag["id"]}


def test_list_filters_by_session_id(auth):
    mine = _create(auth)
    _create(auth, session_id="sess-2")

    resp = auth.get("/api/admin/flags?session_id=sess-1")
    assert resp.status_code == 200
    data = resp.json()
    assert [f["id"] for f in data] == [mine["id"]]


def test_list_rejects_unknown_status(auth):
    resp = auth.get("/api/admin/flags?status=bogus")
    assert resp.status_code == 400


# ---- Patch -------------------------------------------------------------


def test_patch_updates_comment_only(auth):
    flag = _create(auth)
    resp = auth.patch(
        f"/api/admin/flags/{flag['id']}",
        json={"comment": "edited note"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["comment"] == "edited note"
    assert data["resolved"] is False


def test_patch_marks_resolved_without_touching_comment(auth):
    flag = _create(auth)
    resp = auth.patch(
        f"/api/admin/flags/{flag['id']}",
        json={"resolved": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["resolved"] is True
    assert data["comment"] == flag["comment"]


def test_patch_unknown_flag_returns_404(auth):
    resp = auth.patch("/api/admin/flags/9999", json={"comment": "x"})
    assert resp.status_code == 404


# ---- Context -----------------------------------------------------------


def test_context_returns_ordered_transcript(auth):
    _log_turn(auth, "sess-1", 0, "user", "hello")
    _log_turn(auth, "sess-1", 1, "assistant", ["hi there"])
    _log_turn(auth, "sess-1", 2, "user", "and again")
    flag = _create(auth)

    resp = auth.get(f"/api/admin/flags/{flag['id']}/context")
    assert resp.status_code == 200
    data = resp.json()

    assert data["flag"]["id"] == flag["id"]
    assert data["session"] is None  # no /api/sessions row was created
    assert [m["index"] for m in data["messages"]] == [0, 1, 2]
    assert [m["role"] for m in data["messages"]] == [
        "user",
        "assistant",
        "user",
    ]


def test_context_includes_session_metadata_when_logged(auth):
    created = auth.post(
        "/api/sessions",
        json={"user_id": "user-1", "feedback_config_name": "default"},
    )
    assert created.status_code == 200, created.text
    session_id = created.json()["session_id"]

    _log_turn(auth, session_id, 0, "user", "hello")
    flag = _create(auth, session_id=session_id, message_index=0)

    data = auth.get(f"/api/admin/flags/{flag['id']}/context").json()
    assert data["session"]["session_id"] == session_id
    assert data["session"]["user_id"] == "user-1"
    assert data["session"]["feedback_config_name"] == "default"
    assert [m["index"] for m in data["messages"]] == [0]


def test_context_empty_for_unlogged_session(auth):
    flag = _create(auth, session_id="never-logged")

    resp = auth.get(f"/api/admin/flags/{flag['id']}/context")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session"] is None
    assert data["messages"] == []
    assert data["flag"]["response_text"] == "the flagged answer"


def test_context_unknown_flag_returns_404(auth):
    assert auth.get("/api/admin/flags/9999/context").status_code == 404
