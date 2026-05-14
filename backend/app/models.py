"""SQLAlchemy 2.x async ORM models for the GenAI platform."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
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
