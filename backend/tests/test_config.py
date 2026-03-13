"""Tests for YAML config loading and validation."""

import os
import textwrap
from pathlib import Path

import pytest

from app.config import AppConfig, load_config


@pytest.fixture()
def valid_yaml(tmp_path: Path) -> Path:
    """Write a minimal valid config and return its path."""
    cfg = tmp_path / "config.yaml"
    cfg.write_text(
        textwrap.dedent(
            """\
            bots:
              - name: "bot-a"
                model: "gpt-4"
                api_url: "https://api.example.com/v1"
                api_key: "sk-test"
                system_message: "Hello"
              - name: "bot-b"
                model: "llama-3"
                api_url: "http://localhost:8080/v1"
                api_key: ""
                system_message: ""
            feedback_configs:
              - name: "compare"
                bots: ["bot-a", "bot-b"]
                main_preference_feedback: "I prefer this"
                additional_categories:
                  - "More helpful"
        """
        )
    )
    return cfg


def test_load_valid_config(valid_yaml: Path) -> None:
    cfg = load_config(str(valid_yaml))
    assert isinstance(cfg, AppConfig)
    assert len(cfg.bots) == 2
    assert cfg.bots[0].name == "bot-a"
    assert len(cfg.feedback_configs) == 1
    assert cfg.feedback_configs[0].bots == [
        "bot-a",
        "bot-b",
    ]


def test_env_var_interpolation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MY_API_KEY", "secret-123")
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(
        textwrap.dedent(
            """\
            bots:
              - name: "bot-a"
                model: "m"
                api_url: "http://localhost"
                api_key: "${MY_API_KEY}"
            feedback_configs:
              - name: "fc"
                bots: ["bot-a"]
        """
        )
    )
    cfg = load_config(str(cfg_file))
    assert cfg.bots[0].api_key == "secret-123"


def test_missing_env_var(tmp_path: Path) -> None:
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(
        textwrap.dedent(
            """\
            bots:
              - name: "bot-a"
                model: "m"
                api_url: "http://localhost"
                api_key: "${NONEXISTENT_VAR_XYZ}"
            feedback_configs:
              - name: "fc"
                bots: ["bot-a"]
        """
        )
    )
    # Remove the var if it somehow exists
    os.environ.pop("NONEXISTENT_VAR_XYZ", None)
    with pytest.raises(ValueError, match="not set"):
        load_config(str(cfg_file))


def test_duplicate_bot_names(tmp_path: Path) -> None:
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(
        textwrap.dedent(
            """\
            bots:
              - name: "dup"
                model: "m"
                api_url: "http://localhost"
              - name: "dup"
                model: "m"
                api_url: "http://localhost"
            feedback_configs:
              - name: "fc"
                bots: ["dup"]
        """
        )
    )
    with pytest.raises(ValueError, match="Duplicate bot names"):
        load_config(str(cfg_file))


def test_duplicate_feedback_config_names(
    tmp_path: Path,
) -> None:
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(
        textwrap.dedent(
            """\
            bots:
              - name: "bot-a"
                model: "m"
                api_url: "http://localhost"
            feedback_configs:
              - name: "fc"
                bots: ["bot-a"]
              - name: "fc"
                bots: ["bot-a"]
        """
        )
    )
    with pytest.raises(ValueError, match="Duplicate feedback config"):
        load_config(str(cfg_file))


def test_feedback_references_unknown_bot(
    tmp_path: Path,
) -> None:
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(
        textwrap.dedent(
            """\
            bots:
              - name: "bot-a"
                model: "m"
                api_url: "http://localhost"
            feedback_configs:
              - name: "fc"
                bots: ["bot-a", "ghost"]
        """
        )
    )
    with pytest.raises(ValueError, match="unknown bot 'ghost'"):
        load_config(str(cfg_file))


def test_empty_bot_list_in_feedback(
    tmp_path: Path,
) -> None:
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(
        textwrap.dedent(
            """\
            bots:
              - name: "bot-a"
                model: "m"
                api_url: "http://localhost"
            feedback_configs:
              - name: "fc"
                bots: []
        """
        )
    )
    with pytest.raises(ValueError, match="empty bot list"):
        load_config(str(cfg_file))


def test_missing_required_fields(tmp_path: Path) -> None:
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(
        textwrap.dedent(
            """\
            bots:
              - name: "bot-a"
            feedback_configs:
              - name: "fc"
                bots: ["bot-a"]
        """
        )
    )
    with pytest.raises(Exception):
        load_config(str(cfg_file))
