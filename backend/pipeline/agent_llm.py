"""Multi-tier resilient LLM router for pipeline agents.

Cascades gracefully through 3 tiers:
- Tier 1: Primary Groq model (os.getenv("PIPELINE_GROQ_MODEL", "llama-3.1-8b-instant"))
- Tier 2: Alternate Groq model (os.getenv("PIPELINE_GROQ_FALLBACK_MODEL", "openai/gpt-oss-120b"))
- Tier 3: Local Ollama fallback (base_url="http://localhost:11434/v1", model=os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b"))
"""

import logging
import os
from typing import Any

import httpx
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)


def get_tiers() -> list[dict[str, Any]]:
    """Return the ordered list of LLM tier configurations."""
    return [
        {
            "tier": 1,
            "provider": "groq",
            "model": os.getenv("PIPELINE_GROQ_MODEL", "llama-3.1-8b-instant"),
        },
        {
            "tier": 2,
            "provider": "groq",
            "model": os.getenv("PIPELINE_GROQ_FALLBACK_MODEL", "openai/gpt-oss-120b"),
        },
        {
            "tier": 3,
            "provider": "ollama",
            "model": os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b"),
            "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        },
    ]


def _create_llm_for_tier(tier: dict[str, Any], json_mode: bool = False) -> BaseChatModel:
    provider = tier.get("provider", "").lower()
    model = tier.get("model", "")
    timeout = float(os.getenv("PIPELINE_LLM_TIMEOUT", "30.0"))
    model_kwargs = {"response_format": {"type": "json_object"}} if json_mode else {}

    if provider == "groq":
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY environment variable is not set")
        return ChatGroq(
            model=model,
            api_key=api_key,
            temperature=0.2,
            request_timeout=timeout,
            model_kwargs=model_kwargs,
        )
    elif provider == "ollama":
        base_url = tier.get("base_url") or os.getenv(
            "OLLAMA_BASE_URL", "http://localhost:11434/v1"
        )
        return ChatOpenAI(
            model=model,
            base_url=base_url,
            api_key="ollama",
            temperature=0.2,
            timeout=timeout,
            model_kwargs=model_kwargs,
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


def call_pipeline_llm(
    prompt: str,
    system: str | None = None,
    json_mode: bool = False,
    tiers: list[dict[str, Any]] | None = None,
) -> str:
    """Invoke LLM with multi-tier fallback across Groq and Ollama.

    Cascades on rate limits (429), timeouts, unavailable models, or connection failures.
    """
    active_tiers = tiers if tiers is not None else get_tiers()
    last_error: Exception | None = None

    # Groq json_object mode requires the word 'json' in the prompt/system message
    effective_prompt = prompt
    effective_system = system
    if json_mode:
        combined = f"{effective_system or ''} {effective_prompt}".lower()
        if "json" not in combined:
            if effective_system:
                effective_system = f"{effective_system}\nRespond in valid JSON format."
            else:
                effective_prompt = f"{effective_prompt}\nRespond in valid JSON format."

    messages = []
    if effective_system:
        messages.append(SystemMessage(content=effective_system))
    messages.append(HumanMessage(content=effective_prompt))

    for tier_cfg in active_tiers:
        tier_num = tier_cfg.get("tier", "?")
        provider = tier_cfg.get("provider", "unknown")
        model = tier_cfg.get("model", "unknown")

        try:
            llm = _create_llm_for_tier(tier_cfg, json_mode=json_mode)
            response = llm.invoke(messages)
            content = response.content
            if isinstance(content, list):
                return "".join(
                    part if isinstance(part, str) else part.get("text", "")
                    for part in content
                )
            return str(content)
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Pipeline LLM Tier %s (%s:%s) failed: %s. Cascading to next tier...",
                tier_num,
                provider,
                model,
                exc,
            )
            continue

    raise RuntimeError(
        f"All pipeline LLM tiers failed. Last error: {last_error}"
    ) from last_error


def check_model_support(provider: str, model: str) -> bool:
    """Inspect whether a given provider supports or has the requested model available."""
    prov = provider.lower()
    if prov == "groq":
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return False
        try:
            import groq

            client = groq.Groq(api_key=api_key)
            models = [m.id for m in client.models.list().data]
            return model in models
        except Exception as exc:
            logger.warning("Failed to check Groq model support for %s: %s", model, exc)
            return False
    elif prov == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        root_url = base_url.removesuffix("/v1").rstrip("/")
        try:
            resp = httpx.get(f"{root_url}/api/tags", timeout=3.0)
            if resp.status_code == 200:
                models = [m.get("name", "") for m in resp.json().get("models", [])]
                return any(model == m or m.startswith(f"{model}:") for m in models)
            return False
        except Exception as exc:
            logger.warning("Failed to check Ollama model support for %s: %s", model, exc)
            return False
    return False
