"""Pydantic request/response schemas for the API."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Request body for the LLM chat proxy."""

    bot_name: str
    messages: list[dict]
    timeout: int = 60
    stream: bool = False


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
    selected: Optional[int] = None
    timestamp: datetime


class BotInfo(BaseModel):
    """Public bot information (no secrets)."""

    name: str
    display_name: str = ""


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
    visible_limit: int = 3
    context_limit: Optional[int] = None
    defaults: DefaultsResponse = DefaultsResponse()


class BotOverridePatch(BaseModel):
    """Single bot's override block — only ``system_message`` for now."""

    system_message: Optional[str] = None


class AdminConfigPatch(BaseModel):
    """PATCH body for ``/api/admin/config``.

    All fields are optional; only present keys update the stored
    overrides. ``None`` for ``context_limit`` is meaningful (unlimited).
    Sending ``None`` for other top-level fields acts as a per-key reset.
    """

    visible_limit: Optional[int] = Field(default=None, ge=1)
    context_limit: Optional[int] = Field(default=None, ge=1)
    active_feedback_config: Optional[str] = None
    bot_overrides: Optional[dict[str, BotOverridePatch]] = None

    # Marker so callers can distinguish "context_limit explicitly null"
    # from "context_limit not in patch". Populated in the route from
    # the raw JSON body, NOT from this Pydantic shape.
    model_config = {"extra": "forbid"}


class AdminConfigResponse(BaseModel):
    """GET/PATCH/DELETE response shape for ``/api/admin/config``."""

    merged: dict
    overrides: dict
    available_feedback_configs: list[str]
    available_bots: list[str]
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
