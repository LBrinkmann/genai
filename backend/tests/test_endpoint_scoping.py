"""managed_bots() must be scoped to the bots actually in play.

Waking an endpoint costs money, so a visitor on the single-bot public
default must never spin up the GPU behind a bot they cannot reach.
"""

import textwrap
from pathlib import Path

import pytest

from app.config import init_config
from app.services import endpoint_control
from app.services.config_overrides import merge_into_config

CONFIG_YAML = textwrap.dedent(
    """\
    defaults:
      config: "default"
    bots:
      - name: "v1"
        model: "m1"
        api_url: "https://example.invalid/v1/chat/completions"
        api_key: ""
        llm_endpoint:
          provider: "hf"
          namespace: "ns"
          name: "ep-v1"
      - name: "v2"
        model: "m2"
        api_url: "https://example.invalid/v1/chat/completions"
        api_key: ""
        llm_endpoint:
          provider: "hf"
          namespace: "ns"
          name: "ep-v2"
    feedback_configs:
      - name: "default"
        bots: ["v1"]
      - name: "comparison"
        bots: ["v1", "v2"]
    """
)


@pytest.fixture()
def cfg(tmp_path: Path):
    path = tmp_path / "experiment.yml"
    path.write_text(CONFIG_YAML, encoding="utf-8")
    return init_config(str(path))


def names(bots):
    return [b.name for b in bots]


def test_public_default_only_exposes_v1(cfg):
    """The v1-only default must not pull v2's endpoint into play."""
    assert names(endpoint_control.managed_bots(cfg)) == ["v1"]


def test_pinning_comparison_brings_both_into_play(cfg):
    merged = merge_into_config(
        cfg, {"active_feedback_config": "comparison"}
    )
    assert names(endpoint_control.managed_bots(merged)) == ["v1", "v2"]


def test_selecting_v2_puts_only_v2_in_play(cfg):
    """The admin 'v2' preset: pin the wide config, narrow to v2."""
    merged = merge_into_config(
        cfg,
        {
            "active_feedback_config": "comparison",
            "active_bots": ["v2"],
        },
    )
    assert names(endpoint_control.managed_bots(merged)) == ["v2"]


def test_selecting_v1_leaves_v2_asleep(cfg):
    merged = merge_into_config(
        cfg,
        {
            "active_feedback_config": "comparison",
            "active_bots": ["v1"],
        },
    )
    in_play = names(endpoint_control.managed_bots(merged))
    assert in_play == ["v1"]
    assert "v2" not in in_play


def test_falls_back_to_yaml_singleton_without_arg(cfg):
    """No merged config passed → still scoped, not every bot."""
    assert names(endpoint_control.managed_bots()) == ["v1"]
