"""DB-persisted runtime overrides on top of the YAML baseline.

The YAML config is immutable at runtime; this module layers a sparse
dict (loaded from the ``config_overrides_v1`` singleton row) on top so
admins can adjust limits and bot personas without a redeploy.

Override semantics (sparse — only present keys override):
  - ``visible_limit`` (int)         → patched on every feedback_config
  - ``context_limit`` (int | None)  → patched on every feedback_config
  - ``active_feedback_config`` (str)→ pinned to ``AppConfig.defaults.config``
  - ``bot_overrides`` (mapping)     → ``{<bot>: {"system_message": str}}``
    replaces the matching bot's ``system_message``.

We keep a small in-memory cache (TTL 5s) keyed by
``(updated_at_iso, overrides_json)`` plus the wall-clock fetch time so
hot read paths don't hit the DB on every chat request.
"""

import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AppConfig, get_config
from app.models import ConfigOverride

_CACHE_TTL_SECONDS = 5.0

# Mutable module-level cache. Replaced wholesale on refresh; safe for
# concurrent reads on CPython without a lock (dict assignment is atomic).
_cache: dict = {
    "overrides": None,  # type: Optional[dict]
    "updated_at": None,  # type: Optional[str]
    "expires_at": 0.0,
}


def reset_cache() -> None:
    """Drop the in-memory cache. Used by tests and DELETE flows."""
    _cache["overrides"] = None
    _cache["updated_at"] = None
    _cache["expires_at"] = 0.0


async def load_overrides(session: AsyncSession) -> dict:
    """Return the singleton overrides dict (or ``{}`` if no row)."""
    row = (
        await session.execute(
            select(ConfigOverride).where(ConfigOverride.id == 1)
        )
    ).scalar_one_or_none()
    if row is None:
        return {}
    # SQLAlchemy hands back the stored dict directly; defensive copy.
    return dict(row.overrides or {})


async def load_override_record(
    session: AsyncSession,
) -> Optional[ConfigOverride]:
    """Return the singleton ConfigOverride row, or None if missing."""
    return (
        await session.execute(
            select(ConfigOverride).where(ConfigOverride.id == 1)
        )
    ).scalar_one_or_none()


def merge_into_config(yaml_config: AppConfig, overrides: dict) -> AppConfig:
    """Return a new AppConfig with the override dict applied.

    Pure function (no side effects). Uses ``model_copy(deep=True)``
    so the YAML singleton stays untouched.
    """
    if not overrides:
        return yaml_config

    merged = yaml_config.model_copy(deep=True)

    visible = overrides.get("visible_limit")
    context_present = "context_limit" in overrides
    context = overrides.get("context_limit") if context_present else None

    if visible is not None or context_present:
        for fc in merged.feedback_configs:
            if visible is not None:
                fc.visible_limit = int(visible)
            if context_present:
                fc.context_limit = None if context is None else int(context)

    active = overrides.get("active_feedback_config")
    if active:
        merged.defaults.config = str(active)

    bot_overrides = overrides.get("bot_overrides") or {}
    if bot_overrides:
        bot_map = {b.name: b for b in merged.bots}
        for bot_name, patch in bot_overrides.items():
            bot = bot_map.get(bot_name)
            if bot is None or not isinstance(patch, dict):
                continue
            new_msg = patch.get("system_message")
            if isinstance(new_msg, str):
                bot.system_message = new_msg

    return merged


async def get_merged_config(session: AsyncSession) -> AppConfig:
    """Return the YAML config with DB overrides merged in (cached).

    The cache is keyed off the override row's ``updated_at`` so a write
    on another worker would still be picked up at next request — but
    within a 5s window we trust the cached merged config.
    """
    yaml_config = get_config()

    record = await load_override_record(session)
    if record is None:
        # Even with no row, cache the empty-override path briefly.
        if (
            _cache["overrides"] == {}
            and time.monotonic() < _cache["expires_at"]
        ):
            return yaml_config
        _cache["overrides"] = {}
        _cache["updated_at"] = None
        _cache["expires_at"] = time.monotonic() + _CACHE_TTL_SECONDS
        return yaml_config

    overrides = dict(record.overrides or {})
    updated_at_iso = (
        record.updated_at.isoformat() if record.updated_at else None
    )

    cached_ok = (
        _cache["overrides"] == overrides
        and _cache["updated_at"] == updated_at_iso
        and time.monotonic() < _cache["expires_at"]
    )
    if cached_ok:
        return merge_into_config(yaml_config, overrides)

    _cache["overrides"] = overrides
    _cache["updated_at"] = updated_at_iso
    _cache["expires_at"] = time.monotonic() + _CACHE_TTL_SECONDS
    return merge_into_config(yaml_config, overrides)
