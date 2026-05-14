"""YAML configuration loader with env var interpolation."""

import os
import re
from pathlib import Path
from typing import Literal, Optional

import yaml
from pydantic import BaseModel, model_validator


class LLMEndpointConfig(BaseModel):
    """Optional per-bot block describing a managed inference endpoint.

    Bots that include this block surface a Start/Stop control in the
    admin UI; bots without it are unmanaged.
    """

    provider: Literal["hf"]
    namespace: str
    name: str


class BotConfig(BaseModel):
    """Configuration for a single LLM bot."""

    name: str
    model: str
    api_url: str
    api_key: Optional[str] = ""
    system_message: Optional[str] = ""
    display_name: Optional[str] = ""
    # Optional managed-endpoint block. Internal: not exposed via the
    # public /api/config response. Admin routes consult this directly.
    llm_endpoint: Optional[LLMEndpointConfig] = None


class FeedbackConfig(BaseModel):
    """Configuration for a feedback/experiment scheme."""

    name: str
    bots: list[str]
    main_preference_feedback: Optional[str] = ""
    additional_categories: list[str] = []
    visible_limit: int = 3
    context_limit: Optional[int] = None


class DefaultsConfig(BaseModel):
    """Default values for URL parameters."""

    config: str = "default"
    log: bool = False


class AppConfig(BaseModel):
    """Top-level application configuration."""

    bots: list[BotConfig]
    feedback_configs: list[FeedbackConfig]
    defaults: DefaultsConfig = DefaultsConfig()

    @model_validator(mode="after")
    def validate_config(self) -> "AppConfig":
        """Validate uniqueness and cross-references."""
        bot_names = [b.name for b in self.bots]
        dupes = [n for n in bot_names if bot_names.count(n) > 1]
        if dupes:
            raise ValueError(f"Duplicate bot names: {set(dupes)}")

        fc_names = [fc.name for fc in self.feedback_configs]
        fc_dupes = [n for n in fc_names if fc_names.count(n) > 1]
        if fc_dupes:
            raise ValueError(
                "Duplicate feedback config names: " f"{set(fc_dupes)}"
            )

        bot_name_set = set(bot_names)
        for fc in self.feedback_configs:
            if not fc.bots:
                raise ValueError(
                    f"Feedback config '{fc.name}' has " "an empty bot list"
                )
            for bot_ref in fc.bots:
                if bot_ref not in bot_name_set:
                    raise ValueError(
                        f"Feedback config '{fc.name}' "
                        f"references unknown bot "
                        f"'{bot_ref}'"
                    )
        return self


def _interpolate_env_vars(value: str) -> str:
    """Replace ${VAR} patterns with environment values."""

    def _replace(match: re.Match) -> str:
        var_name = match.group(1)
        env_val = os.environ.get(var_name)
        if env_val is None:
            raise ValueError(
                f"Environment variable '{var_name}' " "is not set"
            )
        return env_val

    return re.sub(r"\$\{(\w+)\}", _replace, value)


def _walk_and_interpolate(obj: object) -> object:
    """Recursively interpolate env vars in data."""
    if isinstance(obj, str):
        return _interpolate_env_vars(obj)
    if isinstance(obj, dict):
        return {k: _walk_and_interpolate(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_walk_and_interpolate(i) for i in obj]
    return obj


def load_config(path: str) -> AppConfig:
    """Load and validate YAML config from *path*.

    Resolves ``${ENV_VAR}`` patterns from the process
    environment before Pydantic validation.
    """
    raw = Path(path).read_text(encoding="utf-8")
    data = yaml.safe_load(raw)
    data = _walk_and_interpolate(data)
    return AppConfig(**data)


# Module-level singleton — populated by calling
# ``init_config`` at application startup.
_config: Optional[AppConfig] = None


def init_config(path: str) -> AppConfig:
    """Load config and store as module singleton."""
    global _config
    _config = load_config(path)
    return _config


def get_config() -> AppConfig:
    """Return the loaded config singleton.

    Raises ``RuntimeError`` if config has not been loaded.
    """
    if _config is None:
        raise RuntimeError(
            "Configuration not loaded. " "Call init_config() first."
        )
    return _config
