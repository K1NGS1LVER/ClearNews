"""Tests for the Multi-Tier Resilient LLM Router (backend/pipeline/agent_llm.py)."""

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from pipeline.agent_llm import (
    _build_client,
    call_pipeline_llm,
    parse_llm_json,
)


def test_tier_1_success(monkeypatch):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(content="Tier 1 response")

    monkeypatch.setattr("pipeline.agent_llm._build_client", lambda tier, json_mode=False: mock_llm)

    result = call_pipeline_llm(prompt="Hello", system="Test system")
    assert result == "Tier 1 response"
    assert mock_llm.invoke.call_count == 1


def test_tier_1_fails_cascades_to_tier_2(monkeypatch):
    mock_tier1 = MagicMock()
    mock_tier1.invoke.side_effect = Exception("429 Rate limit exceeded")

    mock_tier2 = MagicMock()
    mock_tier2.invoke.return_value = AIMessage(content="Tier 2 fallback response")

    call_count = 0

    def fake_build_client(tier, json_mode=False):
        nonlocal call_count
        call_count += 1
        return mock_tier1 if call_count == 1 else mock_tier2

    monkeypatch.setattr("pipeline.agent_llm._build_client", fake_build_client)

    result = call_pipeline_llm(prompt="Generate headline")
    assert result == "Tier 2 fallback response"
    assert call_count == 2


def test_tier_1_and_2_fail_cascades_to_tier_3_ollama(monkeypatch):
    call_count = 0

    def fake_build_client(tier, json_mode=False):
        nonlocal call_count
        call_count += 1
        llm = MagicMock()
        if call_count < 3:
            llm.invoke.side_effect = Exception(f"Tier {call_count} failure")
        else:
            llm.invoke.return_value = AIMessage(content="Local Ollama fallback response")
        return llm

    monkeypatch.setattr("pipeline.agent_llm._build_client", fake_build_client)

    result = call_pipeline_llm(prompt="Evaluate cluster")
    assert result == "Local Ollama fallback response"
    assert call_count == 3


def test_all_tiers_fail_raises_runtime_error(monkeypatch):
    def failing_build_client(tier, json_mode=False):
        llm = MagicMock()
        llm.invoke.side_effect = Exception("Service unavailable")
        return llm

    monkeypatch.setattr("pipeline.agent_llm._build_client", failing_build_client)

    with pytest.raises(RuntimeError, match="All pipeline LLM tiers failed"):
        call_pipeline_llm(prompt="Test failure")


def test_json_mode_adds_instruction(monkeypatch):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(content='{"headline": "Neutral Title"}')

    monkeypatch.setattr("pipeline.agent_llm._build_client", lambda tier, json_mode=False: mock_llm)

    call_pipeline_llm(prompt="Score this text", system="Score evaluator", json_mode=True)
    sent_messages = mock_llm.invoke.call_args[0][0]
    assert "json" in sent_messages[0].content.lower()


def test_parse_llm_json():
    # Direct valid JSON
    assert parse_llm_json('{"key": "value"}') == {"key": "value"}
    # Markdown code fence JSON
    assert parse_llm_json('```json\n{"status": "ok"}\n```') == {"status": "ok"}
    # Embedded JSON with extra chat text
    assert parse_llm_json('Here is the data: {"result": 42} Hope this helps!') == {"result": 42}


def test_build_client_groq_missing_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(ValueError, match="GROQ_API_KEY is not set"):
        _build_client({"provider": "groq", "model": "llama-3.1-8b-instant"})


def test_build_client_ollama(monkeypatch):
    llm = _build_client(
        {"provider": "ollama", "model": "qwen2.5:1.5b", "base_url": "http://localhost:11434/v1"}
    )
    assert llm.model_name == "qwen2.5:1.5b"
