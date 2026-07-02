"""Agent tool tests — retrieval only, no LLM calls."""

import asyncio
import json

from langchain_core.messages import ToolMessage
from langgraph.errors import GraphRecursionError

import agent.chat as chat_mod
from agent.chat import _collect_sources, stream_chat
from agent.tools import get_story_arc, list_stories, make_search_story, search_corpus


def test_search_corpus_returns_sources():
    results = search_corpus.invoke({"query": "economy and manufacturing"})
    assert results
    for r in results:
        assert {"article_id", "title", "url", "outlet", "bias_label"} <= set(r)


def test_search_story_is_scoped():
    stories = list_stories.invoke({})
    story_id = max(stories, key=lambda s: s["articles"])["story_id"]

    tool = make_search_story(story_id)
    results = tool.invoke({"query": "what happened"})
    assert results

    from app.db import SessionLocal
    from app.models import Article

    with SessionLocal() as session:
        for r in results:
            assert session.get(Article, r["article_id"]).story_id == story_id


def test_get_story_arc():
    stories = list_stories.invoke({})
    arc = get_story_arc.invoke({"story_id": stories[0]["story_id"]})
    assert arc["daily_metrics"]
    day = arc["daily_metrics"][0]
    assert {"articles", "outlets", "left_share", "right_share"} <= set(day)
    assert get_story_arc.invoke({"story_id": 999999}) == {"error": "no story with id 999999"}


def test_runaway_tool_loop_terminates_with_error(monkeypatch):
    """A no-match query makes the model loop tool calls until GraphRecursionError.
    stream_chat must catch it and end with a terminal error event, not hang or
    raise mid-SSE."""

    class LoopingAgent:
        async def astream(self, *_args, **_kwargs):
            for _ in ():  # empty: an async generator that yields nothing
                yield
            raise GraphRecursionError("Recursion limit reached")

    monkeypatch.setattr(chat_mod, "build_agent", lambda _sid: LoopingAgent())

    async def collect():
        return [ev async for ev in stream_chat([{"role": "user", "content": "x"}], None)]

    events = asyncio.run(collect())

    assert events, "stream must emit at least one event"
    assert events[-1]["type"] == "error"
    assert "relevant coverage" in events[-1]["message"]
    assert all(e["type"] != "token" for e in events)


def test_empty_completion_yields_error(monkeypatch):
    """The agent can finish normally but emit only a sources event (no answer
    text). stream_chat must fall back to the no-coverage message instead of
    leaving the user with a blank reply."""

    async def fake_stream_once(_agent, _state):
        yield {"type": "sources", "sources": []}

    monkeypatch.setattr(chat_mod, "build_agent", lambda _sid: object())
    monkeypatch.setattr(chat_mod, "_stream_once", fake_stream_once)

    async def collect():
        return [ev async for ev in stream_chat([{"role": "user", "content": "x"}], None)]

    events = asyncio.run(collect())

    assert [e["type"] for e in events] == ["sources", "error"]
    assert "relevant coverage" in events[-1]["message"]


def test_answer_does_not_trigger_fallback(monkeypatch):
    """When the model produces answer tokens, no fallback error is appended."""

    async def fake_stream_once(_agent, _state):
        yield {"type": "token", "content": "Here is the answer."}
        yield {"type": "sources", "sources": []}

    monkeypatch.setattr(chat_mod, "build_agent", lambda _sid: object())
    monkeypatch.setattr(chat_mod, "_stream_once", fake_stream_once)

    async def collect():
        return [ev async for ev in stream_chat([{"role": "user", "content": "x"}], None)]

    events = asyncio.run(collect())

    assert [e["type"] for e in events] == ["token", "sources"]
    assert all(e["type"] != "error" for e in events)


def test_collect_sources_dedupes():
    src = {"article_id": 1, "url": "http://x", "title": "t"}
    msgs = [
        ToolMessage(content=json.dumps([src, src]), tool_call_id="a"),
        ToolMessage(content=json.dumps([{**src, "article_id": 2}]), tool_call_id="b"),
        ToolMessage(content="not json", tool_call_id="c"),
    ]
    sources = _collect_sources(msgs)
    assert sorted(s["article_id"] for s in sources) == [1, 2]
