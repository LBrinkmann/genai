"""Configuration retrieval endpoint."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas import BotInfo, ConfigResponse, DefaultsResponse
from app.services.config_overrides import get_merged_config

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config/{name}", response_model=ConfigResponse)
async def get_feedback_config(
    name: str,
    session: AsyncSession = Depends(get_session),
) -> ConfigResponse:
    """Return feedback config by name with bot details (overrides applied)."""
    cfg = await get_merged_config(session)
    for fc in cfg.feedback_configs:
        if fc.name == name:
            bot_map = {b.name: b for b in cfg.bots}
            bots = [
                BotInfo(
                    name=b,
                    display_name=bot_map[b].display_name or b,
                )
                for b in fc.bots
            ]
            defaults = DefaultsResponse(
                config=cfg.defaults.config,
                log=cfg.defaults.log,
            )
            return ConfigResponse(
                name=fc.name,
                bots=bots,
                main_preference_feedback=(fc.main_preference_feedback),
                additional_categories=(fc.additional_categories),
                visible_limit=fc.visible_limit,
                context_limit=fc.context_limit,
                defaults=defaults,
            )
    raise HTTPException(
        status_code=404,
        detail=f"Config '{name}' not found",
    )
