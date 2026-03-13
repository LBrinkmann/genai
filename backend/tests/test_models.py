"""Tests for SQLAlchemy ORM models using async SQLite."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.models import Base, ChatMessage, Session


@pytest.fixture()
async def db_session():
    """Create an in-memory SQLite database and yield a session."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


async def test_table_creation(db_session: AsyncSession) -> None:
    """Tables should exist after create_all."""
    # If we got a session the tables were created.
    result = await db_session.execute(select(Session))
    assert result.all() == []


async def test_create_session(
    db_session: AsyncSession,
) -> None:
    s = Session(
        session_id="sess-001",
        user_id="user-1",
        feedback_config_name="compare",
    )
    db_session.add(s)
    await db_session.commit()

    row = (
        await db_session.execute(
            select(Session).where(Session.session_id == "sess-001")
        )
    ).scalar_one()
    assert row.user_id == "user-1"
    assert isinstance(row.created_at, datetime)


async def test_create_chat_message(
    db_session: AsyncSession,
) -> None:
    msg = ChatMessage(
        bot_ids=["bot-a"],
        user_id="user-1",
        session_id="sess-001",
        index=0,
        role="user",
        content={"text": "Hello"},
        feedback=[],
        timestamp=datetime.now(timezone.utc),
    )
    db_session.add(msg)
    await db_session.commit()

    row = (await db_session.execute(select(ChatMessage))).scalar_one()
    assert row.role == "user"
    assert row.content == {"text": "Hello"}


async def test_duplicate_session_index_rejected(
    db_session: AsyncSession,
) -> None:
    """Two messages with same session_id+index violate uniqueness."""
    msg1 = ChatMessage(
        bot_ids=["bot-a"],
        user_id="user-1",
        session_id="sess-001",
        index=0,
        role="user",
        content={"text": "first"},
    )
    db_session.add(msg1)
    await db_session.commit()

    msg2 = ChatMessage(
        bot_ids=["bot-a"],
        user_id="user-1",
        session_id="sess-001",
        index=0,
        role="user",
        content={"text": "duplicate"},
    )
    db_session.add(msg2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
