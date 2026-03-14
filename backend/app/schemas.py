"""Pydantic request/response schemas for the API."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    """Request body for the LLM chat proxy."""

    bot_name: str
    messages: list[dict]
    timeout: int = 60


class ChatResponse(BaseModel):
    """Response from the LLM chat proxy."""

    content: str


class SessionCreate(BaseModel):
    """Request body for creating a new session."""

    user_id: str
    feedback_config_name: str


class SessionResponse(BaseModel):
    """Response after creating a session."""

    session_id: str
    created_at: datetime


class MessageSave(BaseModel):
    """Request body for saving a chat message."""

    user_id: str
    session_id: str
    index: int
    role: str
    content: Any
    bot_ids: list[str] = []
    feedback: list[str] = []
    timestamp: datetime


class BotInfo(BaseModel):
    """Public bot information (no secrets)."""

    name: str


class DefaultsResponse(BaseModel):
    """Default URL parameter values."""

    config: str = "default"
    log: bool = False


class ConfigResponse(BaseModel):
    """Response for configuration retrieval."""

    name: str
    bots: list[BotInfo]
    main_preference_feedback: Optional[str] = ""
    additional_categories: list[str] = []
    access_key: Optional[str] = None
    defaults: DefaultsResponse = DefaultsResponse()
