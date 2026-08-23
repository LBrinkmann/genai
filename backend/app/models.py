"""SQLAlchemy 2.x async ORM models for the GenAI platform."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    pass


class ChatMessage(Base):
    """Stores every message exchanged in the system."""

    __tablename__ = "chat_messages_v1"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "index",
            name="uq_session_index",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    bot_ids: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    user_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    session_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    feedback: Mapped[list | None] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    selected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Session(Base):
    """Tracks individual conversation sessions."""

    __tablename__ = "sessions_v1"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    session_id: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    feedback_config_name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ConfigOverride(Base):
    """Singleton row of YAML-config overrides applied at runtime.

    A sparse JSON blob layered on top of the immutable YAML baseline.
    Keys (all optional):
      - ``visible_limit`` (int)
      - ``context_limit`` (int | null)
      - ``active_feedback_config`` (str)
      - ``bot_overrides`` (mapping of bot name → {"system_message": str})
      - ``test_mode`` (bool) — parallel debug mode, no preference selection
      - ``active_bots`` (list[str]) — subset of bots that answer
    """

    __tablename__ = "config_overrides_v1"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    overrides: Mapped[dict] = mapped_column(
        JSON, default=dict, server_default="{}", nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_by: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )


class ResponseFlag(Base):
    """An admin-authored flag on a single bot response.

    Identified logically by ``(session_id, message_index,
    response_index)`` rather than by a FK to ``chat_messages_v1.id``:
    ``POST /api/messages`` re-saves a turn by delete-then-insert, so
    row ids are not stable across a selection or feedback update,
    while the ``(session_id, index)`` pair is.

    ``response_index`` is the position inside an assistant turn:
      * comparison / parallel turns — the index into the ``content``
        array (i.e. which bot's answer);
      * single-bot turns — always ``0``.

    ``response_text`` is a snapshot taken at flag time so the admin
    list renders without joining the transcript, and still shows
    something if logging was off when the turn happened.
    """

    __tablename__ = "response_flags_v1"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "message_index",
            "response_index",
            name="uq_flag_session_message_response",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    session_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    message_index: Mapped[int] = mapped_column(Integer, nullable=False)
    response_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    bot_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    response_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    resolved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_by: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
