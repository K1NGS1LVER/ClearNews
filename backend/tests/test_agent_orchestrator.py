"""Unit tests for the Adaptive Ingestion Orchestrator Agent and API integration."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import Article, Outlet, Story
from pipeline.agent_orchestrator import (
    analyze_velocity,
    get_country_counts,
    prioritize_with_llm,
    run_adaptive_orchestration,
)

client = TestClient(app)
pytestmark = pytest.mark.dev_db


@pytest.fixture
def orchestrator_test_data():
    """Create isolated test outlets and articles with distinct ingestion times."""
    tag = uuid4().hex[:8]
    now = datetime.now(UTC)

    with SessionLocal() as db:
        # Create test outlets for UA (bursting), FR (ambiguous), and US (baseline normal)
        outlet_ua = Outlet(
            domain=f"burst-ua-{tag}.com",
            name=f"Ukraine News {tag}",
            country="UA",
        )
        outlet_fr = Outlet(
            domain=f"ambig-fr-{tag}.com",
            name=f"France News {tag}",
            country="FR",
        )
        outlet_us = Outlet(
            domain=f"baseline-us-{tag}.com",
            name=f"US News {tag}",
            country="US",
        )
        db.add_all([outlet_ua, outlet_fr, outlet_us])
        db.flush()

        articles = []
        # UA: 6 articles in the last 1 hour, none in prior 23 hours -> clear burst spike!
        for i in range(6):
            articles.append(
                Article(
                    url=f"https://burst-ua-{tag}.com/art-{i}",
                    title=f"Ukraine breaking update {i}",
                    source="gdelt",
                    outlet_id=outlet_ua.id,
                    published_at=now - timedelta(minutes=10 * (i + 1)),
                    ingested_at=now - timedelta(minutes=10 * (i + 1)),
                )
            )

        # FR: 3 articles in recent 2 hours, 2 articles in prior hours -> ambiguous elevated rate
        for i in range(3):
            articles.append(
                Article(
                    url=f"https://ambig-fr-{tag}.com/art-rec-{i}",
                    title=f"France recent update {i}",
                    source="gdelt",
                    outlet_id=outlet_fr.id,
                    published_at=now - timedelta(minutes=30 * (i + 1)),
                    ingested_at=now - timedelta(minutes=30 * (i + 1)),
                )
            )
        for i in range(2):
            articles.append(
                Article(
                    url=f"https://ambig-fr-{tag}.com/art-base-{i}",
                    title=f"France older update {i}",
                    source="gdelt",
                    outlet_id=outlet_fr.id,
                    published_at=now - timedelta(hours=10 + i),
                    ingested_at=now - timedelta(hours=10 + i),
                )
            )

        # US: 1 article recent, 20 articles baseline -> steady / low recent velocity
        articles.append(
            Article(
                url=f"https://baseline-us-{tag}.com/art-rec-0",
                title="US single article",
                source="gdelt",
                outlet_id=outlet_us.id,
                published_at=now - timedelta(minutes=45),
                ingested_at=now - timedelta(minutes=45),
            )
        )
        for i in range(10):
            articles.append(
                Article(
                    url=f"https://baseline-us-{tag}.com/art-base-{i}",
                    title=f"US older update {i}",
                    source="gdelt",
                    outlet_id=outlet_us.id,
                    published_at=now - timedelta(hours=8 + i),
                    ingested_at=now - timedelta(hours=8 + i),
                )
            )

        db.add_all(articles)
        db.commit()

        yield {
            "tag": tag,
            "now": now,
            "outlet_ua_id": outlet_ua.id,
            "outlet_fr_id": outlet_fr.id,
            "outlet_us_id": outlet_us.id,
            "article_urls": [a.url for a in articles],
        }

        # Cleanup
        for url in [a.url for a in articles]:
            art = db.execute(Article.__table__.delete().where(Article.url == url))
        db.execute(Outlet.__table__.delete().where(Outlet.id.in_([outlet_ua.id, outlet_fr.id, outlet_us.id])))
        db.commit()


def test_velocity_spike_detection(orchestrator_test_data):
    """Test that burst spikes and ambiguous velocity signals are correctly categorized."""
    now = orchestrator_test_data["now"]
    with SessionLocal() as db:
        clear_spikes, ambiguous = analyze_velocity(
            session=db,
            recent_hours=3,
            baseline_hours=24,
            spike_threshold=2.0,
            ambiguous_threshold=1.3,
            min_recent_articles=4,
            now=now,
        )

        spike_countries = [s["country"] for s in clear_spikes]
        assert "UA" in spike_countries, f"Expected UA to be flagged as clear spike, got {clear_spikes}"

        ua_spike = next(s for s in clear_spikes if s["country"] == "UA")
        assert ua_spike["recent_count"] >= 6
        assert ua_spike["velocity_ratio"] >= 2.0


def test_prioritize_with_llm_json_parsing():
    """Test that prioritize_with_llm evaluates candidates and parses LLM recommendations."""
    clear_spikes = [
        {"country": "UA", "recent_count": 8, "velocity_ratio": 3.2},
        {"country": "IL", "recent_count": 6, "velocity_ratio": 2.5},
    ]
    ambiguous = [
        {"country": "FR", "recent_count": 3, "velocity_ratio": 1.6},
    ]

    mock_llm_reply = '{"prioritized_countries": ["UA", "FR"], "reasoning": "Breaking events in both nations"}'

    with patch("pipeline.agent_orchestrator.call_pipeline_llm", return_value=mock_llm_reply) as mock_llm:
        selected = prioritize_with_llm(clear_spikes, ambiguous, max_count=2)
        assert mock_llm.called
        assert selected == ["UA", "FR"]


def test_prioritize_with_llm_fallback_on_error():
    """Test graceful heuristic fallback if the LLM provider fails."""
    clear_spikes = [
        {"country": "UA", "recent_count": 8, "velocity_ratio": 3.2},
    ]
    ambiguous = [
        {"country": "FR", "recent_count": 3, "velocity_ratio": 1.6},
    ]

    with patch("pipeline.agent_orchestrator.call_pipeline_llm", side_effect=RuntimeError("All LLM tiers failed")):
        selected = prioritize_with_llm(clear_spikes, ambiguous, max_count=2)
        # Fallback should take clear spikes first, then ambiguous
        assert "UA" in selected


def test_run_adaptive_orchestration_triggers_pull(orchestrator_test_data):
    """Test full orchestration run dynamically triggering targeted DOC 2.0 pulls."""
    now = orchestrator_test_data["now"]
    mock_poller = MagicMock(return_value={"UA": 15})

    with patch("pipeline.agent_orchestrator.call_pipeline_llm", return_value='{"prioritized_countries": ["UA"]}'):
        with SessionLocal() as db:
            result = run_adaptive_orchestration(
                session=db,
                poll_func=mock_poller,
                now=now,
            )

            assert result["status"] == "triggered"
            assert "UA" in result["selected_countries"]
            mock_poller.assert_called_once()
            assert result["pull_results"] == {"UA": 15}


def test_run_adaptive_orchestration_idle_when_no_data():
    """Test orchestration returns idle and makes no pulls when no bursts occur."""
    mock_poller = MagicMock()
    # Mock analyze_velocity returning empty lists
    with patch("pipeline.agent_orchestrator.analyze_velocity", return_value=([], [])):
        with SessionLocal() as db:
            result = run_adaptive_orchestration(
                session=db,
                poll_func=mock_poller,
            )
            assert result["status"] == "idle"
            assert result["selected_countries"] == []
            mock_poller.assert_not_called()


def test_api_story_card_and_detail_agent_headline():
    """Verify StoryCard and StoryDetail schemas expose agent_headline, coherence_score, and milestones."""
    tag = uuid4().hex[:8]
    with SessionLocal() as db:
        story = Story(
            title=f"Raw Centroid Title {tag}",
            agent_headline=f"Neutral Agent Synthesized Headline {tag}",
            status="active",
            category="world",
            first_seen=datetime.now(UTC),
            last_seen=datetime.now(UTC),
            summary="A test story summary",
            coherence_score=0.92,
            milestones=[{"day": "2026-09-02", "description": "Key event occured"}],
        )
        db.add(story)
        db.commit()
        story_id = story.id

    try:
        # Test /api/stories/{story_id} (StoryDetail endpoint)
        resp = client.get(f"/api/stories/{story_id}")
        assert resp.status_code == 200
        detail = resp.json()
        assert detail["id"] == story_id
        assert detail["title"] == f"Raw Centroid Title {tag}"
        assert detail["agent_headline"] == f"Neutral Agent Synthesized Headline {tag}"
        assert detail["coherence_score"] == 0.92
        assert len(detail["milestones"]) == 1

        # Test /api/stories/{story_id}/arc also returns StoryDetail fields
        resp_arc = client.get(f"/api/stories/{story_id}/arc")
        assert resp_arc.status_code == 200
        arc = resp_arc.json()
        assert arc["agent_headline"] == f"Neutral Agent Synthesized Headline {tag}"
        assert arc["coherence_score"] == 0.92

        # Test /api/feed endpoint exists and returns cards
        resp_feed = client.get("/api/feed")
        assert resp_feed.status_code == 200
        assert isinstance(resp_feed.json(), list)

    finally:
        with SessionLocal() as db:
            s = db.get(Story, story_id)
            if s:
                db.delete(s)
                db.commit()
