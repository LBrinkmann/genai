"""Shared authentication utilities."""

import os

from fastapi import Header, HTTPException


async def require_access_key(
    authorization: str = Header(None),
) -> None:
    """Validate Bearer token against ACCESS_KEY env var."""
    access_key = os.environ.get("ACCESS_KEY", "")
    if not authorization or authorization != f"Bearer {access_key}":
        raise HTTPException(status_code=401, detail="Unauthorized")
