"""Configuration retrieval endpoint."""

from fastapi import APIRouter, HTTPException

from app.config import get_config
from app.schemas import BotInfo, ConfigResponse

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config/{name}", response_model=ConfigResponse)
async def get_feedback_config(name: str) -> ConfigResponse:
    """Return feedback config by name with bot details."""
    cfg = get_config()
    for fc in cfg.feedback_configs:
        if fc.name == name:
            bots = [BotInfo(name=b) for b in fc.bots]
            return ConfigResponse(
                name=fc.name,
                bots=bots,
                main_preference_feedback=(fc.main_preference_feedback),
                additional_categories=(fc.additional_categories),
            )
    raise HTTPException(
        status_code=404,
        detail=f"Config '{name}' not found",
    )
