"""Agent tool tests — retrieval only, no LLM calls."""

import json

from langchain_core.messages import ToolMessage

from agent.chat import _collect_sources
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


def test_collect_sources_dedupes():
    src = {"article_id": 1, "url": "http://x", "title": "t"}
    msgs = [
        ToolMessage(content=json.dumps([src, src]), tool_call_id="a"),
        ToolMessage(content=json.dumps([{**src, "article_id": 2}]), tool_call_id="b"),
        ToolMessage(content="not json", tool_call_id="c"),
    ]
    sources = _collect_sources(msgs)
    assert sorted(s["article_id"] for s in sources) == [1, 2]
