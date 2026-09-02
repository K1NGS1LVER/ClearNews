"""Tests for the Multi-Tier Resilient LLM Router (backend/pipeline/agent_llm.py)."""

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from pipeline.agent_llm import (
    _create_llm_for_tier,
    call_pipeline_llm,
    check_model_support,
    get_tiers,
)


def test_get_tiers_configuration(monkeypatch):
    monkeypatch.setenv("PIPELINE_GROQ_MODEL", "custom-groq-1")
    monkeypatch.setenv("PIPELINE_GROQ_FALLBACK_MODEL", "custom-groq-2")
    monkeypatch.setenv("OLLAMA_MODEL", "custom-ollama")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")

    tiers = get_tiers()
    assert len(tiers) == 3
    assert tiers[0] == {"tier": 1, "provider": "groq", "model": "custom-groq-1"}
    assert tiers[1] == {"tier": 2, "provider": "groq", "model": "custom-groq-2"}
    assert tiers[2] == {
        "tier": 3,
        "provider": "ollama",
        "model": "custom-ollama",
        "base_url": "http://localhost:11434/v1",
    }


def test_successful_tier_1_invocation(monkeypatch):
    mock_llm_1 = MagicMock()
    mock_llm_1.invoke.return_value = AIMessage(content="Headline from Tier 1")

    calls = []

    def fake_create_llm(tier, json_mode=False):
        calls.append(tier["tier"])
        if tier["tier"] == 1:
            return mock_llm_1
        raise AssertionError("Should not invoke fallback tiers when Tier 1 succeeds")

    monkeypatch.setattr("pipeline.agent_llm._create_llm_for_tier", fake_create_llm)

    result = call_pipeline_llm(
        prompt="Generate a headline",
        system="You are an editor",
    )

    assert result == "Headline from Tier 1"
    assert calls == [1]
    mock_llm_1.invoke.assert_called_once()
    sent_messages = mock_llm_1.invoke.call_args[0][0]
    assert sent_messages[0].content == "You are an editor"
    assert sent_messages[1].content == "Generate a headline"


def test_fallback_to_tier_2_on_rate_limit(monkeypatch):
    mock_llm_2 = MagicMock()
    mock_llm_2.invoke.return_value = AIMessage(content="Headline from Tier 2")

    calls = []

    def fake_create_llm(tier, json_mode=False):
        calls.append(tier["tier"])
        if tier["tier"] == 1:
            mock_fail = MagicMock()
            mock_fail.invoke.side_effect = Exception("Rate limit reached (429: Too Many Requests)")
            return mock_fail
        elif tier["tier"] == 2:
            return mock_llm_2
        raise AssertionError("Should not invoke Tier 3 when Tier 2 succeeds")

    monkeypatch.setattr("pipeline.agent_llm._create_llm_for_tier", fake_create_llm)

    result = call_pipeline_llm(prompt="Generate a headline")
    assert result == "Headline from Tier 2"
    assert calls == [1, 2]
    mock_llm_2.invoke.assert_called_once()


def test_fallback_to_tier_3_on_tier_2_failure(monkeypatch):
    mock_llm_3 = MagicMock()
    mock_llm_3.invoke.return_value = AIMessage(content='{"headline": "Local Ollama Result"}')

    calls = []

    def fake_create_llm(tier, json_mode=False):
        calls.append(tier["tier"])
        mock = MagicMock()
        if tier["tier"] == 1:
            mock.invoke.side_effect = Exception("Groq 429 rate limit")
            return mock
        elif tier["tier"] == 2:
            mock.invoke.side_effect = Exception("Groq 503 service unavailable")
            return mock
        elif tier["tier"] == 3:
            return mock_llm_3
        raise AssertionError("Unexpected tier")

    monkeypatch.setattr("pipeline.agent_llm._create_llm_for_tier", fake_create_llm)

    result = call_pipeline_llm(prompt="Generate a headline", json_mode=True)
    assert result == '{"headline": "Local Ollama Result"}'
    assert calls == [1, 2, 3]
    mock_llm_3.invoke.assert_called_once()


def test_all_tiers_fail_raises_runtime_error(monkeypatch):
    def fake_create_llm(tier, json_mode=False):
        mock = MagicMock()
        mock.invoke.side_effect = Exception(f"Tier {tier['tier']} down")
        return mock

    monkeypatch.setattr("pipeline.agent_llm._create_llm_for_tier", fake_create_llm)

    with pytest.raises(RuntimeError, match="All pipeline LLM tiers failed"):
        call_pipeline_llm(prompt="Will fail everywhere")


def test_json_mode_ensures_json_keyword(monkeypatch):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(content='{"score": 0.95}')

    def fake_create_llm(tier, json_mode=False):
        assert json_mode is True
        return mock_llm

    monkeypatch.setattr("pipeline.agent_llm._create_llm_for_tier", fake_create_llm)

    call_pipeline_llm(prompt="Score this text", system="Score evaluator", json_mode=True)
    sent_messages = mock_llm.invoke.call_args[0][0]
    assert "json" in sent_messages[0].content.lower()


def test_create_llm_groq_missing_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(ValueError, match="GROQ_API_KEY environment variable is not set"):
        _create_llm_for_tier({"tier": 1, "provider": "groq", "model": "llama-3.1-8b-instant"})


def test_create_llm_ollama(monkeypatch):
    llm = _create_llm_for_tier(
        {"tier": 3, "provider": "ollama", "model": "qwen2.5:1.5b", "base_url": "http://localhost:11434/v1"}
    )
    assert llm.model_name == "qwen2.5:1.5b"


def test_check_model_support_groq(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "dummy-key")

    mock_model = MagicMock()
    mock_model.id = "llama-3.1-8b-instant"

    mock_client = MagicMock()
    mock_client.models.list.return_value.data = [mock_model]

    with patch("groq.Groq", return_value=mock_client):
        assert check_model_support("groq", "llama-3.1-8b-instant") is True
        assert check_model_support("groq", "non-existent-model") is False

    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert check_model_support("groq", "llama-3.1-8b-instant") is False


def test_check_model_support_ollama(monkeypatch):
    with patch("httpx.get") as mock_get:
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"models": [{"name": "qwen2.5:1.5b"}, {"name": "llama3:latest"}]},
        )
        assert check_model_support("ollama", "qwen2.5:1.5b") is True
        assert check_model_support("ollama", "llama3") is True
        assert check_model_support("ollama", "unsupported-model") is False

    with patch("httpx.get", side_effect=Exception("Connection refused")):
        assert check_model_support("ollama", "qwen2.5:1.5b") is False
