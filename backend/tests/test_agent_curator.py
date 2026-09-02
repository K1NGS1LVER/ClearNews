"""Tests for Story Curator Agent and Narrative Evolution Agent."""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest

from app.models import Article, Outlet, Story, StoryDailyMetric
from pipeline.agent_curator import (
    audit_cluster,
    clean_headline_candidate,
    curate_story,
    curate_touched_stories,
    heuristic_curate,
)
from pipeline.agent_narrative import (
    detect_and_record_story_milestones,
    record_story_milestone,
    summarize_milestone_with_llm,
)


def test_clean_headline_candidate():
    assert clean_headline_candidate("Major Policy Shift Announced - Reuters") == "Major Policy Shift Announced"
    assert clean_headline_candidate("Global Summit Concludes | BBC News") == "Global Summit Concludes"
    assert clean_headline_candidate("Short") == "Short"


def test_audit_cluster_success():
    mock_json = '{"headline": "Tech Giants Agree on AI Safety Standards", "coherence_score": 0.95, "summary": "Key industry leaders reached consensus on evaluation frameworks."}'
    with patch("pipeline.agent_curator.call_pipeline_llm", return_value=mock_json):
        res = audit_cluster([
            {"title": "Tech Leaders Meet on AI Safety", "domain": "reuters.com", "themes": ["TECH"]},
            {"title": "New AI Standards Signed", "domain": "bbc.com", "themes": ["TECH"]},
        ])
        assert res["headline"] == "Tech Giants Agree on AI Safety Standards"
        assert res["coherence_score"] == 0.95
        assert "Key industry leaders" in res["summary"]


def test_audit_cluster_score_clamping():
    mock_json = '{"headline": "Test Headline", "coherence_score": 1.4, "summary": "Test summary."}'
    with patch("pipeline.agent_curator.call_pipeline_llm", return_value=mock_json):
        res = audit_cluster([{"title": "Test Title"}])
        assert res["coherence_score"] == 1.0

    mock_json_low = '{"headline": "Test Headline", "coherence_score": -0.5, "summary": "Test summary."}'
    with patch("pipeline.agent_curator.call_pipeline_llm", return_value=mock_json_low):
        res = audit_cluster([{"title": "Test Title"}])
        assert res["coherence_score"] == 0.0


def test_audit_cluster_fallback_on_llm_failure():
    with patch("pipeline.agent_curator.call_pipeline_llm", side_effect=RuntimeError("Groq 429")):
        res = audit_cluster(
            [{"title": "Central Bank Raises Rates - Financial Times", "domain": "ft.com"}],
            fallback_title="Central Bank Policy",
        )
        assert res["headline"] == "Central Bank Raises Rates"
        assert 0.0 <= res["coherence_score"] <= 1.0
        assert res["summary"]


def test_audit_cluster_empty_articles():
    res = audit_cluster([], fallback_title="Fallback Title")
    assert res["headline"] == "Fallback Title"
    assert res["coherence_score"] == 0.5


def test_curate_story():
    session = MagicMock()
    story = Story(
        id=42,
        title="Initial Story Title",
        first_seen=datetime.now(UTC),
        last_seen=datetime.now(UTC),
        summary=None,
    )
    story.agent_headline = None
    story.coherence_score = None

    outlet = Outlet(id=1, domain="reuters.com")
    article = Article(id=101, story_id=42, title="Article Headline - Reuters", url="https://reuters.com/1", outlet=outlet)

    session.get.return_value = story
    session.execute.return_value.scalars.return_value.all.return_value = [article]

    mock_json = '{"headline": "Objective Synthetic Headline", "coherence_score": 0.92, "summary": "A concise objective summary."}'
    with patch("pipeline.agent_curator.call_pipeline_llm", return_value=mock_json):
        res = curate_story(session, 42)
        assert res["headline"] == "Objective Synthetic Headline"
        assert story.agent_headline == "Objective Synthetic Headline"
        assert story.coherence_score == 0.92
        assert story.summary == "A concise objective summary."
        session.flush.assert_called_once()


def test_curate_story_preserves_existing_summary():
    session = MagicMock()
    story = Story(
        id=43,
        title="Story Title",
        first_seen=datetime.now(UTC),
        last_seen=datetime.now(UTC),
        summary="Existing human-edited summary.",
    )
    session.get.return_value = story
    session.execute.return_value.scalars.return_value.all.return_value = []

    mock_json = '{"headline": "New Headline", "coherence_score": 0.88, "summary": "Different summary."}'
    with patch("pipeline.agent_curator.call_pipeline_llm", return_value=mock_json):
        curate_story(session, 43)
        assert story.summary == "Existing human-edited summary."


def test_curate_touched_stories():
    session = MagicMock()
    with patch("pipeline.agent_curator.curate_story", side_effect=lambda s, sid: {"headline": f"H{sid}"} if sid != 99 else {}):
        count = curate_touched_stories(session, {1, 2, 99})
        assert count == 2
        session.commit.assert_called_once()


def test_record_story_milestone():
    session = MagicMock()
    story = Story(
        id=10,
        title="Trade Negotiations Ongoing",
        first_seen=datetime.now(UTC),
        last_seen=datetime.now(UTC),
        milestones=[],
    )
    session.get.return_value = story

    mock_json = '{"date": "2026-08-01", "event": "Treaty draft revealed", "narrative_shift": "Shifted focus from tariffs to IP rights."}'
    with patch("pipeline.agent_narrative.call_pipeline_llm", return_value=mock_json):
        milestone = record_story_milestone(session, 10, "2026-08-01", "Tariff discussion moved to intellectual property")
        assert milestone["date"] == "2026-08-01"
        assert milestone["event"] == "Treaty draft revealed"
        assert milestone["narrative_shift"] == "Shifted focus from tariffs to IP rights."
        assert len(story.milestones) == 1
        assert story.milestones[0]["event"] == "Treaty draft revealed"


def test_detect_and_record_story_milestones():
    session = MagicMock()
    story = Story(
        id=20,
        title="Space Exploration Mission",
        first_seen=datetime.now(UTC),
        last_seen=datetime.now(UTC),
        milestones=[],
    )
    session.get.return_value = story

    m1 = StoryDailyMetric(story_id=20, day=datetime(2026, 8, 1, tzinfo=UTC).date(), drift_score=0.1)
    m2 = StoryDailyMetric(story_id=20, day=datetime(2026, 8, 2, tzinfo=UTC).date(), drift_score=0.65)
    session.execute.return_value.scalars.return_value.all.side_effect = [
        [m1, m2],
        [Article(story_id=20, title="Lunar Lander Touches Down", published_at=datetime(2026, 8, 2, tzinfo=UTC))],
    ]

    mock_json = '{"date": "2026-08-02", "event": "Spacecraft lands on Moon", "narrative_shift": "Coverage switched from transit to surface science."}'
    with patch("pipeline.agent_narrative.call_pipeline_llm", return_value=mock_json):
        recorded = detect_and_record_story_milestones(session, 20, threshold=0.45)
        assert len(recorded) == 1
        assert recorded[0]["date"] == "2026-08-02"
        assert recorded[0]["event"] == "Spacecraft lands on Moon"
