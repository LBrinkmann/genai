"""Tests for the SSE-streaming branch of ``/api/chat``.

Mocks ``httpx.AsyncClient`` so the route's ``client.stream(...)`` and
``client.post(...)`` calls hit an in-test fake that yields synthetic
SSE lines (or a synthetic JSON body for the non-SSE adapter case).
"""

import textwrap
from pathlib import Path
from typing import Iterable, Optional
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

TEST_CONFIG_YAML = textwrap.dedent(
    """\
    bots:
      - name: "bot-a"
        model: "gpt-4"
        api_url: "https://api.example.com/v1/chat/completions"
        api_key: "sk-leaktest-12345"
        system_message: "You are helpful."
    feedback_configs:
      - name: "compare"
        bots: ["bot-a"]
        main_preference_feedback: ""
        additional_categories: []
    """
)


# Swap the real Postgres engine for an in-memory SQLite engine so the
# FastAPI lifespan's ``create_tables`` succeeds without a running DB.
_test_engine = create_async_engine("sqlite+aiosqlite://", echo=False)
_test_session_factory = async_sessionmaker(
    _test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(autouse=True)
def _config(tmp_path: Path, monkeypatch):
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(TEST_CONFIG_YAML)
    monkeypatch.setenv("CONFIG_PATH", str(cfg_file))
    from app.config import init_config

    init_config(str(cfg_file))

    import app.database as db_mod

    monkeypatch.setattr(db_mod, "engine", _test_engine)
    monkeypatch.setattr(
        db_mod,
        "async_session_factory",
        _test_session_factory,
    )


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# --------------- fakes for httpx.AsyncClient ---------------


class _FakeStreamResponse:
    """Stand-in for ``httpx.Response`` in streaming mode."""

    def __init__(
        self,
        status_code: int,
        lines: Iterable[str],
        content_type: str = "text/event-stream",
        body_bytes: Optional[bytes] = None,
    ) -> None:
        self.status_code = status_code
        self._lines = list(lines)
        self.headers = {"content-type": content_type}
        self._body = body_bytes or "\n".join(self._lines).encode("utf-8")

    async def aiter_lines(self):
        for line in self._lines:
            yield line

    async def aread(self) -> bytes:
        return self._body


class _StreamCM:
    """Async context manager returned by ``client.stream(...)``."""

    def __init__(self, response: _FakeStreamResponse) -> None:
        self._response = response

    async def __aenter__(self) -> _FakeStreamResponse:
        return self._response

    async def __aexit__(self, *_exc) -> None:
        return None


class _FakeAsyncClient:
    """Fake ``httpx.AsyncClient`` matching the surface chat.py uses."""

    def __init__(
        self,
        stream_response: Optional[_FakeStreamResponse] = None,
        post_response=None,
    ) -> None:
        self._stream_response = stream_response
        self._post_response = post_response
        self.last_post_kwargs: Optional[dict] = None

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *_exc) -> None:
        return None

    def stream(self, *_a, **_kw) -> _StreamCM:
        assert self._stream_response is not None
        return _StreamCM(self._stream_response)

    async def post(self, *_a, **kw):
        self.last_post_kwargs = kw
        return self._post_response


def _patch_httpx(
    fake: _FakeAsyncClient,
):
    """Patch ``httpx.AsyncClient`` in ``app.routes.chat`` with *fake*."""
    return patch(
        "app.routes.chat.httpx.AsyncClient",
        return_value=fake,
    )


# --------------- tests ---------------


def test_chat_stream_false_unchanged(client):
    """``stream=false`` still returns the standard JSON response."""
    import httpx

    resp_obj = httpx.Response(
        200,
        json={
            "choices": [{"message": {"content": "Hello!"}}],
        },
        request=httpx.Request("POST", "https://x"),
    )
    fake = _FakeAsyncClient(post_response=resp_obj)

    with _patch_httpx(fake):
        resp = client.post(
            "/api/chat",
            json={
                "bot_name": "bot-a",
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": False,
            },
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json()["content"] == "Hello!"


def test_chat_stream_true_sse_forwarded(client):
    """``stream=true`` forwards upstream SSE events verbatim."""
    upstream_lines = [
        "data: "
        '{"choices":[{"index":0,"delta":'
        '{"role":"assistant"},"finish_reason":null}]}',
        "",
        "data: "
        '{"choices":[{"index":0,"delta":'
        '{"content":"Hello"},"finish_reason":null}]}',
        "",
        "data: "
        '{"choices":[{"index":0,"delta":'
        '{"content":" world"},"finish_reason":null}]}',
        "",
        "data: [DONE]",
        "",
    ]
    fake = _FakeAsyncClient(
        stream_response=_FakeStreamResponse(200, upstream_lines),
    )

    with _patch_httpx(fake):
        resp = client.post(
            "/api/chat",
            json={
                "bot_name": "bot-a",
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": True,
            },
        )

    assert resp.status_code == 200
    ct = resp.headers["content-type"]
    assert "text/event-stream" in ct
    body = resp.text
    assert '"content":"Hello"' in body
    assert '"content":" world"' in body
    assert "data: [DONE]" in body


def test_chat_stream_unknown_bot_returns_404(client):
    """Unknown bot returns 404 — same as the non-streaming path."""
    resp = client.post(
        "/api/chat",
        json={
            "bot_name": "nope",
            "messages": [],
            "stream": True,
        },
    )
    assert resp.status_code == 404


def test_chat_stream_upstream_401_emits_safe_error(client):
    """Upstream 4xx emits an SSE error frame; never leaks api_key."""
    # The fake's upstream body includes a long payload; it must be
    # truncated to 200 chars and not contain the bot's api_key.
    long_body = "Unauthorized: " + ("x" * 500)
    fake = _FakeAsyncClient(
        stream_response=_FakeStreamResponse(
            401,
            lines=[],
            content_type="application/json",
            body_bytes=long_body.encode("utf-8"),
        ),
    )

    with _patch_httpx(fake):
        resp = client.post(
            "/api/chat",
            json={
                "bot_name": "bot-a",
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": True,
            },
        )

    assert resp.status_code == 200
    body = resp.text
    assert "event: error" in body
    assert "Upstream 401" in body
    assert "sk-leaktest-12345" not in body
    # Bounded: truncated body + boilerplate stays well under the
    # cap + framing overhead.
    assert len(body) < 600
    # The trailing DONE sentinel is always emitted.
    assert "data: [DONE]" in body


def test_chat_stream_non_sse_upstream_wrapped(client):
    """Non-SSE upstream JSON wraps into one synthetic SSE event."""
    body = (
        '{"choices":[{"message":'
        '{"role":"assistant","content":"Hi from JSON"}}]}'
    )
    fake = _FakeAsyncClient(
        stream_response=_FakeStreamResponse(
            200,
            lines=[],
            content_type="application/json",
            body_bytes=body.encode("utf-8"),
        ),
    )

    with _patch_httpx(fake):
        resp = client.post(
            "/api/chat",
            json={
                "bot_name": "bot-a",
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": True,
            },
        )

    assert resp.status_code == 200
    text = resp.text
    assert "Hi from JSON" in text
    assert "data: [DONE]" in text
