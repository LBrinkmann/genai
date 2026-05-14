"""FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import init_config
from app.database import create_tables
from app.routes.admin import router as admin_router
from app.routes.auth import router as auth_router
from app.routes.chat import router as chat_router
from app.routes.config import router as config_router
from app.routes.export import router as export_router
from app.routes.sessions import router as sessions_router


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    """Startup: load config and create tables."""
    config_path = os.environ.get("CONFIG_PATH", "config.yaml")
    init_config(config_path)
    await create_tables()
    yield


app = FastAPI(
    title="GenAI RLHF Platform",
    lifespan=lifespan,
)

_cors_raw = os.environ.get("CORS_ORIGIN", "http://localhost:3000")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(config_router)
app.include_router(chat_router)
app.include_router(sessions_router)
app.include_router(export_router)


@app.get("/api/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/api/health/bots")
async def health_bots(config: str = "default") -> dict:
    """Check reachability of each bot in a feedback config."""
    import httpx

    from app.config import get_config

    cfg = get_config()

    # Find the feedback config
    fc = None
    for f in cfg.feedback_configs:
        if f.name == config:
            fc = f
            break
    if fc is None:
        return {"bots": []}

    # Find bot configs
    bot_map = {b.name: b for b in cfg.bots}
    results = []

    async with httpx.AsyncClient(timeout=5) as client:
        for bot_name in fc.bots:
            bot = bot_map.get(bot_name)
            if bot is None:
                results.append({"name": bot_name, "status": "error"})
                continue
            try:
                headers = {}
                if bot.api_key:
                    headers["Authorization"] = f"Bearer {bot.api_key}"
                resp = await client.post(
                    bot.api_url,
                    json={
                        "model": bot.model,
                        "messages": [
                            {
                                "role": "user",
                                "content": "ping",
                            }
                        ],
                        "max_tokens": 1,
                    },
                    headers=headers,
                )
                if resp.status_code == 503:
                    results.append({"name": bot_name, "status": "loading"})
                elif resp.status_code < 400:
                    results.append({"name": bot_name, "status": "online"})
                else:
                    results.append({"name": bot_name, "status": "error"})
            except httpx.TimeoutException:
                results.append({"name": bot_name, "status": "loading"})
            except Exception:
                results.append({"name": bot_name, "status": "error"})

    return {"bots": results}
