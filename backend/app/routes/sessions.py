"""Session and message endpoints."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import ChatMessage, Session
from app.schemas import MessageSave, SessionCreate, SessionResponse

router = APIRouter(prefix="/api", tags=["sessions"])


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_session),
) -> SessionResponse:
    """Create a new conversation session."""
    session_id = str(uuid.uuid4())
    session = Session(
        session_id=session_id,
        user_id=body.user_id,
        feedback_config_name=body.feedback_config_name,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionResponse(
        session_id=session.session_id,
        created_at=session.created_at,
    )


@router.post("/messages", status_code=201)
async def save_message(
    body: MessageSave,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Save a chat message, replacing duplicates."""
    await db.execute(
        delete(ChatMessage).where(
            ChatMessage.session_id == body.session_id,
            ChatMessage.index == body.index,
        )
    )

    msg = ChatMessage(
        user_id=body.user_id,
        session_id=body.session_id,
        index=body.index,
        role=body.role,
        content=body.content,
        bot_ids=body.bot_ids,
        feedback=body.feedback,
        selected=body.selected,
        timestamp=body.timestamp,
    )
    db.add(msg)
    await db.commit()
    return {"status": "ok"}
