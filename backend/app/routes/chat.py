"""LLM chat proxy endpoint."""

import httpx
from fastapi import APIRouter, HTTPException

from app.config import get_config
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Proxy a chat request to the configured LLM."""
    cfg = get_config()

    bot = None
    for b in cfg.bots:
        if b.name == request.bot_name:
            bot = b
            break

    if bot is None:
        raise HTTPException(
            status_code=404,
            detail=f"Bot '{request.bot_name}' not found",
        )

    messages = list(request.messages)
    if bot.system_message:
        messages.insert(
            0,
            {
                "role": "system",
                "content": bot.system_message,
            },
        )

    headers: dict[str, str] = {
        "Content-Type": "application/json",
    }
    if bot.api_key:
        headers["Authorization"] = f"Bearer {bot.api_key}"

    payload = {
        "model": bot.model,
        "messages": messages,
    }

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
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"LLM API error: {exc.response.text}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM connection error: {exc}",
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
