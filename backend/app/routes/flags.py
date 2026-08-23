"""Admin-only response flags.

An operator watching a session can flag a single bot response and
attach a free-text comment to it. Flags are keyed logically on
``(session_id, message_index, response_index)`` rather than on a FK to
``chat_messages_v1.id`` — ``POST /api/messages`` re-saves a turn by
delete-then-insert, so row ids are not stable, while that triple is.

All routes are gated by ``require_admin_session``; flags are never
visible to participants.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit_event, client_ip
from app.auth import require_admin_session
from app.database import get_session
from app.models import ChatMessage, ResponseFlag, Session
from app.schemas import (
    FlagContextMessage,
    FlagContextResponse,
    FlagCreate,
    FlagPatch,
    FlagResponse,
    FlagSessionInfo,
)

router = APIRouter(prefix="/api/admin/flags", tags=["flags"])

STATUSES = {"all", "open", "resolved"}
MAX_LIMIT = 500


async def _get_flag(db: AsyncSession, flag_id: int) -> ResponseFlag:
    """Load a flag by id or raise 404."""
    flag = await db.get(ResponseFlag, flag_id)
    if flag is None:
        raise HTTPException(
            status_code=404,
            detail=f"Flag {flag_id} not found",
        )
    return flag


@router.post("", response_model=FlagResponse)
async def upsert_flag(
    body: FlagCreate,
    request: Request,
    user: str = Depends(require_admin_session),
    db: AsyncSession = Depends(get_session),
) -> ResponseFlag:
    """Create or update the flag on one response.

    Re-flagging the same ``(session_id, message_index,
    response_index)`` updates the existing row — the comment and the
    snapshot — instead of creating a duplicate. ``created_by`` keeps
    the admin who first flagged it.
    """
    result = await db.execute(
        select(ResponseFlag).where(
            ResponseFlag.session_id == body.session_id,
            ResponseFlag.message_index == body.message_index,
            ResponseFlag.response_index == body.response_index,
        )
    )
    flag = result.scalar_one_or_none()

    created = flag is None
    if flag is None:
        flag = ResponseFlag(
            session_id=body.session_id,
            message_index=body.message_index,
            response_index=body.response_index,
            created_by=user,
        )
        db.add(flag)

    flag.comment = body.comment
    flag.bot_name = body.bot_name
    flag.response_text = body.response_text
    flag.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(flag)

    audit_event(
        "admin.flags.upsert",
        ok=True,
        user=user,
        ip=client_ip(request),
        extra={
            "flag_id": flag.id,
            "session_id": flag.session_id,
            "created": created,
        },
    )
    return flag


@router.get("", response_model=list[FlagResponse])
async def list_flags(
    status: str = "all",
    session_id: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    user: str = Depends(require_admin_session),
    db: AsyncSession = Depends(get_session),
) -> list[ResponseFlag]:
    """List flags newest first, optionally filtered."""
    if status not in STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of {sorted(STATUSES)}",
        )

    stmt = select(ResponseFlag)
    if status == "open":
        stmt = stmt.where(ResponseFlag.resolved.is_(False))
    elif status == "resolved":
        stmt = stmt.where(ResponseFlag.resolved.is_(True))
    if session_id is not None:
        stmt = stmt.where(ResponseFlag.session_id == session_id)

    stmt = stmt.order_by(
        ResponseFlag.created_at.desc(),
        ResponseFlag.id.desc(),
    )
    stmt = stmt.limit(max(0, min(limit, MAX_LIMIT))).offset(max(0, offset))

    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.patch("/{flag_id}", response_model=FlagResponse)
async def patch_flag(
    flag_id: int,
    body: FlagPatch,
    request: Request,
    user: str = Depends(require_admin_session),
    db: AsyncSession = Depends(get_session),
) -> ResponseFlag:
    """Update a flag's comment and/or resolved state."""
    flag = await _get_flag(db, flag_id)

    fields = body.model_dump(exclude_unset=True)
    if "comment" in fields and fields["comment"] is not None:
        flag.comment = fields["comment"]
    if "resolved" in fields and fields["resolved"] is not None:
        flag.resolved = fields["resolved"]
    flag.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(flag)

    audit_event(
        "admin.flags.patch",
        ok=True,
        user=user,
        ip=client_ip(request),
        payload_keys=list(fields.keys()),
        extra={"flag_id": flag.id},
    )
    return flag


@router.get("/{flag_id}/context", response_model=FlagContextResponse)
async def get_flag_context(
    flag_id: int,
    user: str = Depends(require_admin_session),
    db: AsyncSession = Depends(get_session),
) -> FlagContextResponse:
    """Return a flag with its session metadata and full transcript.

    ``session`` is ``None`` and ``messages`` empty when the session was
    never logged — the flag's snapshot is then all that survives.
    """
    flag = await _get_flag(db, flag_id)

    session_row = (
        await db.execute(
            select(Session).where(Session.session_id == flag.session_id)
        )
    ).scalar_one_or_none()

    messages = (
        (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == flag.session_id)
                .order_by(ChatMessage.index.asc())
            )
        )
        .scalars()
        .all()
    )

    return FlagContextResponse(
        flag=FlagResponse.model_validate(flag),
        session=(
            FlagSessionInfo.model_validate(session_row)
            if session_row is not None
            else None
        ),
        messages=[FlagContextMessage.model_validate(m) for m in messages],
    )
