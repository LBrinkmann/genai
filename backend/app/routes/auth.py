"""Authentication endpoints."""

import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])


class ValidateKeyRequest(BaseModel):
    """Request body for key validation."""

    key: str


class ValidateKeyResponse(BaseModel):
    """Response for key validation."""

    valid: bool


@router.post(
    "/validate-key",
    response_model=ValidateKeyResponse,
)
async def validate_key(
    body: ValidateKeyRequest,
) -> ValidateKeyResponse:
    """Check whether the provided key matches ACCESS_KEY."""
    access_key = os.environ.get("ACCESS_KEY", "")
    return ValidateKeyResponse(
        valid=bool(access_key and body.key == access_key)
    )
