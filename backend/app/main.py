"""FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import init_config
from app.database import create_tables
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(chat_router)
app.include_router(sessions_router)
app.include_router(export_router)


@app.get("/api/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}
