"""Configuration retrieval endpoint."""

import os

from fastapi import APIRouter, HTTPException

from app.config import get_config
from app.schemas import BotInfo, ConfigResponse, DefaultsResponse

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config/{name}", response_model=ConfigResponse)
async def get_feedback_config(name: str) -> ConfigResponse:
    """Return feedback config by name with bot details."""
    cfg = get_config()
    for fc in cfg.feedback_configs:
        if fc.name == name:
            bots = [BotInfo(name=b) for b in fc.bots]
            defaults = DefaultsResponse(
                config=cfg.defaults.config,
                log=cfg.defaults.log,
            )
            return ConfigResponse(
                name=fc.name,
                bots=bots,
                main_preference_feedback=(fc.main_preference_feedback),
                additional_categories=(fc.additional_categories),
                access_key=os.environ.get("ACCESS_KEY"),
                defaults=defaults,
            )
    raise HTTPException(
        status_code=404,
        detail=f"Config '{name}' not found",
    )
