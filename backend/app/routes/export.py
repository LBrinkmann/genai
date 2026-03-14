"""CSV export endpoints."""

import csv
import io
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_access_key
from app.database import get_session
from app.models import ChatMessage, Session

router = APIRouter(prefix="/api/export", tags=["export"])

MSG_COLUMNS = [
    "id",
    "bot_ids",
    "user_id",
    "session_id",
    "index",
    "role",
    "content",
    "feedback",
    "selected",
    "timestamp",
]


def _row_to_csv_line(row: list) -> str:
    """Serialize one row to a CSV line string."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(row)
    return buf.getvalue()


def _msg_to_row(msg: ChatMessage) -> list:
    """Convert a ChatMessage to a list of values."""
    return [
        msg.id,
        msg.bot_ids,
        msg.user_id,
        msg.session_id,
        msg.index,
        msg.role,
        msg.content,
        msg.feedback,
        msg.selected,
        msg.timestamp.isoformat() if msg.timestamp else "",
    ]


async def _stream_messages(
    db: AsyncSession,
    session_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Yield CSV rows for messages."""
    yield _row_to_csv_line(MSG_COLUMNS)

    stmt = select(ChatMessage).order_by(
        ChatMessage.session_id, ChatMessage.index
    )
    if session_id is not None:
        stmt = stmt.where(ChatMessage.session_id == session_id)

    result = await db.stream(stmt)
    async for row in result.scalars():
        yield _row_to_csv_line(_msg_to_row(row))


@router.get(
    "/messages",
    dependencies=[Depends(require_access_key)],
)
async def export_all_messages(
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream all messages as CSV."""
    return StreamingResponse(
        _stream_messages(db),
        media_type="text/csv",
        headers={"Content-Disposition": ("attachment; filename=messages.csv")},
    )


@router.get(
    "/messages/{session_id}",
    dependencies=[Depends(require_access_key)],
)
async def export_session_messages(
    session_id: str,
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream messages for a single session."""
    return StreamingResponse(
        _stream_messages(db, session_id=session_id),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                "attachment; " f"filename=messages_{session_id}.csv"
            )
        },
    )


SESSION_COLUMNS = [
    "session_id",
    "user_id",
    "feedback_config_name",
    "created_at",
    "message_count",
]


async def _stream_sessions(
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """Yield CSV rows for session summary."""
    yield _row_to_csv_line(SESSION_COLUMNS)

    stmt = (
        select(
            Session.session_id,
            Session.user_id,
            Session.feedback_config_name,
            Session.created_at,
            func.count(ChatMessage.id).label("message_count"),
        )
        .outerjoin(
            ChatMessage,
            Session.session_id == ChatMessage.session_id,
        )
        .group_by(Session.id)
        .order_by(Session.created_at)
    )

    result = await db.execute(stmt)
    for row in result.all():
        yield _row_to_csv_line(
            [
                row.session_id,
                row.user_id,
                row.feedback_config_name,
                row.created_at.isoformat() if row.created_at else "",
                row.message_count,
            ]
        )


@router.get(
    "/sessions",
    dependencies=[Depends(require_access_key)],
)
async def export_sessions(
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream session summary as CSV."""
    return StreamingResponse(
        _stream_sessions(db),
        media_type="text/csv",
        headers={"Content-Disposition": ("attachment; filename=sessions.csv")},
    )
