"""ClearNews chat agent: LangGraph ReAct agent over Groq.

Two grounding modes:
- per-story (story_id set): tools limited to that story's articles + its arc
- global: whole-corpus semantic search + story listing

The agent must cite retrieved articles as [article_id]; the API layer turns
tool outputs into a citation map for the frontend.
"""

import json
import os
from functools import lru_cache

from langchain_core.messages import AIMessageChunk, ToolMessage
from langgraph.prebuilt import create_react_agent

from agent.tools import get_story_arc, list_stories, make_search_story, search_corpus

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

SYSTEM = """You are the ClearNews research assistant. You answer questions
about news stories using ONLY what your tools return: article search,
story lifecycle data (coverage volume, sentiment, narrative drift, and
left/center/right coverage shares).

Rules:
- Ground every factual claim in retrieved articles and cite them inline as
  [article_id], e.g. "Coverage spiked after the strikes [123][456]."
- When asked to summarize, cover: what happened, how coverage evolved
  (volume, sentiment, framing drift, political lean), and what remains
  unresolved.
- If the tools return nothing relevant, say so plainly. Never invent
  articles, outlets, or citation ids.
- Keep answers compact and analytical."""


@lru_cache(maxsize=1)
def _llm():
    from langchain_groq import ChatGroq

    return ChatGroq(model=MODEL, temperature=0.2)


def build_agent(story_id: int | None):
    if story_id is not None:
        tools = [make_search_story(story_id), get_story_arc]
        prompt = (
            SYSTEM
            + f"\n\nYou are chatting inside story {story_id}. Use search_story "
            f"for content questions and get_story_arc({story_id}) for coverage "
            "analytics."
        )
    else:
        tools = [search_corpus, list_stories, get_story_arc]
        prompt = SYSTEM
    return create_react_agent(_llm(), tools, prompt=prompt)


def _collect_sources(messages) -> list[dict]:
    """Pull every article the agent retrieved out of its tool messages."""
    sources: dict[int, dict] = {}
    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue
        try:
            payload = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
        except (json.JSONDecodeError, TypeError):
            continue
        items = payload if isinstance(payload, list) else [payload]
        for item in items:
            if isinstance(item, dict) and "article_id" in item and "url" in item:
                sources[item["article_id"]] = item
    return list(sources.values())


async def stream_chat(messages: list[dict], story_id: int | None):
    """Yield SSE-ready events: token deltas, then citations."""
    agent = build_agent(story_id)
    state = {"messages": [(m["role"], m["content"]) for m in messages]}

    final_messages = []
    async for event, chunk in agent.astream(
        state, stream_mode=["messages", "values"]
    ):
        if event == "messages":
            msg, _meta = chunk
            if isinstance(msg, AIMessageChunk) and msg.content:
                yield {"type": "token", "content": msg.content}
        else:  # values: full state snapshots; keep the last one
            final_messages = chunk["messages"]

    yield {"type": "sources", "sources": _collect_sources(final_messages)}


def suggest_questions(context: str) -> list[str]:
    """Three follow-up questions for the given story/answer context."""
    resp = _llm().invoke(
        [
            (
                "system",
                "Suggest exactly 3 short, distinct follow-up questions a reader "
                "might ask next. Return them as a JSON array of strings, nothing else.",
            ),
            ("user", context[:6000]),
        ]
    )
    try:
        questions = json.loads(resp.content)
        return [q for q in questions if isinstance(q, str)][:3]
    except (json.JSONDecodeError, TypeError):
        return []
