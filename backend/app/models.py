"""SQLAlchemy 2.x async ORM models for the GenAI platform."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
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
    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
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
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
