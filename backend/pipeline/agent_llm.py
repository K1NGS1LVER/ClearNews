"""Multi-tier resilient LLM router for pipeline agents.

Cascades gracefully across Groq and local Ollama.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)

DEFAULT_TIERS: list[dict[str, Any]] = [
    {"provider": "groq", "model": os.getenv("PIPELINE_GROQ_MODEL", "openai/gpt-oss-20b")},
    {"provider": "groq", "model": os.getenv("PIPELINE_GROQ_FALLBACK_MODEL", "openai/gpt-oss-120b")},
    {"provider": "ollama", "model": os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")},
]


def parse_llm_json(raw: str) -> dict[str, Any]:
    """Extract and parse JSON object from an LLM response string."""
    text = raw.strip()
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start : end + 1])
    return json.loads(text)


def _build_client(tier: dict[str, Any], json_mode: bool = False):
    prov = tier.get("provider", "").lower()
    model = tier.get("model", "")
    timeout = float(os.getenv("PIPELINE_LLM_TIMEOUT", "30.0"))
    kwargs = {"response_format": {"type": "json_object"}} if json_mode else {}

    if prov == "groq":
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise ValueError("GROQ_API_KEY is not set")
        return ChatGroq(model=model, api_key=key, temperature=0.2, request_timeout=timeout, model_kwargs=kwargs)
    if prov == "ollama":
        base_url = tier.get("base_url") or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        return ChatOpenAI(model=model, base_url=base_url, api_key="ollama", temperature=0.2, timeout=timeout, model_kwargs=kwargs)
    raise ValueError(f"Unsupported provider: {prov}")


def call_pipeline_llm(
    prompt: str,
    system: str | None = None,
    json_mode: bool = False,
    tiers: list[dict[str, Any]] | None = None,
) -> str:
    """Invoke LLM with cascading multi-tier fallback across Groq and Ollama."""
    active_tiers = tiers if tiers is not None else DEFAULT_TIERS
    last_error: Exception | None = None

    sys_text = system or ""
    p_text = prompt
    if json_mode and "json" not in f"{sys_text} {p_text}".lower():
        sys_text = f"{sys_text}\nRespond in valid JSON format.".strip()

    messages = ([SystemMessage(content=sys_text)] if sys_text else []) + [HumanMessage(content=p_text)]

    for cfg in active_tiers:
        try:
            llm = _build_client(cfg, json_mode=json_mode)
            res = llm.invoke(messages)
            return "".join(p if isinstance(p, str) else p.get("text", "") for p in res.content) if isinstance(res.content, list) else str(res.content)
        except Exception as exc:
            last_error = exc
            logger.warning("Pipeline LLM %s:%s failed (%s); cascading...", cfg.get("provider"), cfg.get("model"), exc)

    raise RuntimeError(f"All pipeline LLM tiers failed. Last error: {last_error}") from last_error
