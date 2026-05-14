"""LLM chat proxy endpoint.

Supports two response shapes selected by ``ChatRequest.stream``:

* ``stream=False`` (default): single JSON response with the assembled
  assistant content. Backwards compatible with the original proxy.
* ``stream=True``: Server-Sent Events forwarded from the upstream
  OpenAI-compatible endpoint. If the upstream does not support SSE
  (returns a regular JSON body), the response is wrapped into one
  synthetic SSE event followed by ``data: [DONE]`` so the frontend
  reader sees a uniform shape.

Error responses on the streaming path emit a single
``event: error\\ndata: {"message": ...}`` frame plus a final ``[DONE]``
sentinel. The upstream body is truncated to 200 characters and the bot's
``api_key`` is never echoed.
"""

import json
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AppConfig, BotConfig
from app.database import get_session
from app.schemas import ChatRequest, ChatResponse
from app.services.config_overrides import get_merged_config

router = APIRouter(prefix="/api", tags=["chat"])

# Cap how much of an upstream error body we expose to the caller so we
# never accidentally leak an opaque blob (the upstream could echo our
# request payload, headers, or internal traces).
_UPSTREAM_ERR_TRUNCATE = 200


def _resolve_bot(cfg: AppConfig, bot_name: str) -> BotConfig:
    """Return the configured bot or raise 404."""
    for b in cfg.bots:
        if b.name == bot_name:
            return b
    raise HTTPException(
        status_code=404,
        detail=f"Bot '{bot_name}' not found",
    )


def _prepare_payload(
    request: ChatRequest, bot: BotConfig
) -> tuple[dict, dict]:
    """Build the upstream payload and headers for *bot*.

    Returns ``(payload, headers)`` with the system message prepended
    when configured. The caller decides whether to add ``stream: True``
    on the payload.
    """
    messages = list(request.messages)
    if bot.system_message:
        messages.insert(
            0,
            {
                "role": "system",
                "content": bot.system_message,
            },
        )

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if bot.api_key:
        headers["Authorization"] = f"Bearer {bot.api_key}"

    payload: dict = {
        "model": bot.model,
        "messages": messages,
    }
    return payload, headers


def _truncate(text: str) -> str:
    """Truncate an upstream body for safe inclusion in error frames."""
    if text is None:
        return ""
    if len(text) <= _UPSTREAM_ERR_TRUNCATE:
        return text
    return text[:_UPSTREAM_ERR_TRUNCATE] + "..."


def _sse_error_frame(message: str) -> str:
    """Format an SSE error event followed by a terminal DONE."""
    body = json.dumps({"message": message}, separators=(",", ":"))
    return f"event: error\ndata: {body}\n\ndata: [DONE]\n\n"


async def _stream_upstream(
    bot: BotConfig,
    payload: dict,
    headers: dict,
    timeout: int,
) -> AsyncIterator[str]:
    """Open an SSE stream to *bot* and yield raw SSE frames.

    The OpenAI-compatible upstream emits ``data: {json}\\n\\n`` chunks
    terminated by ``data: [DONE]\\n\\n``. We forward each event as-is.

    If the upstream returns non-SSE JSON (i.e. it ignored ``stream``),
    the full body is read once and re-emitted as a single synthetic
    SSE event + ``[DONE]`` so the frontend reader sees a uniform shape.
    """
    payload = {**payload, "stream": True}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                bot.api_url,
                json=payload,
                headers=headers,
            ) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    text = _truncate(body.decode("utf-8", "replace"))
                    yield _sse_error_frame(
                        f"Upstream {resp.status_code}: {text}"
                    )
                    return

                content_type = resp.headers.get("content-type", "").lower()
                is_sse = "text/event-stream" in content_type

                if is_sse:
                    # Forward each line as-is. ``aiter_lines`` already
                    # strips the trailing newline; we restore the SSE
                    # framing by appending one newline per line and an
                    # extra blank line between events (handled by the
                    # blank lines the upstream itself emits).
                    async for line in resp.aiter_lines():
                        # Empty line = SSE event separator.
                        if line == "":
                            yield "\n"
                        else:
                            yield f"{line}\n"
                    return

                # Non-SSE upstream: read the full body, synthesize one
                # OpenAI-compatible delta event, then DONE.
                body = await resp.aread()
                try:
                    data = json.loads(body.decode("utf-8", "replace"))
                    content = data["choices"][0]["message"]["content"]
                except (
                    KeyError,
                    IndexError,
                    TypeError,
                    ValueError,
                ):
                    yield _sse_error_frame(
                        "Upstream returned an unexpected non-SSE body"
                    )
                    return

                synth = {
                    "choices": [
                        {
                            "index": 0,
                            "delta": {
                                "role": "assistant",
                                "content": content,
                            },
                            "finish_reason": "stop",
                        }
                    ]
                }
                yield "data: " + json.dumps(
                    synth, separators=(",", ":")
                ) + "\n\n"
                yield "data: [DONE]\n\n"
    except httpx.TimeoutException:
        yield _sse_error_frame("LLM request timed out")
    except httpx.RequestError as exc:
        # ``RequestError`` repr never includes the api_key (which lives
        # only in our outbound headers), but be defensive and only echo
        # the exception class + a truncated message.
        msg = _truncate(str(exc))
        yield _sse_error_frame(f"LLM connection error: {msg}")


@router.post("/chat")
async def chat(
    request: ChatRequest,
    session: AsyncSession = Depends(get_session),
):
    """Proxy a chat request to the configured LLM.

    With ``stream=False`` returns the existing ``ChatResponse`` JSON.
    With ``stream=True`` returns a ``text/event-stream`` whose body is
    forwarded from the upstream OpenAI-compatible endpoint.
    """
    cfg = await get_merged_config(session)
    bot = _resolve_bot(cfg, request.bot_name)
    payload, headers = _prepare_payload(request, bot)

    if request.stream:
        gen = _stream_upstream(bot, payload, headers, request.timeout)
        # ``X-Accel-Buffering: no`` is a hint for reverse proxies
        # (nginx, Caddy) to flush each chunk immediately. Caddy does
        # not buffer SSE by default but the header is cheap insurance.
        sse_headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
        return StreamingResponse(
            gen,
            media_type="text/event-stream",
            headers=sse_headers,
        )

    # Non-streaming path: behave exactly like before.
    try:
        async with httpx.AsyncClient(timeout=request.timeout) as client:
            resp = await client.post(
                bot.api_url,
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="LLM request timed out",
        )
    except httpx.HTTPStatusError as exc:
        # Truncate the upstream body before surfacing it. Mirrors the
        # SSE error frame's handling so neither path leaks unbounded
        # upstream output (security review finding on chat.py:65-67).
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=("LLM API error: " f"{_truncate(exc.response.text)}"),
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM connection error: {_truncate(str(exc))}",
        )

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail=("Unexpected LLM response format:" f" {exc}"),
        )
    return ChatResponse(content=content)
