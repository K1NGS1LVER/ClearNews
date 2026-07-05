"""API smoke tests against the dev database (needs prior pipeline runs)."""

from fastapi.testclient import TestClient
from sqlalchemy import select

import pipeline.explain as explain_mod
from app.db import SessionLocal
from app.main import app
from app.models import Article, Story

client = TestClient(app)


def test_list_stories():
    resp = client.get("/api/stories")
    assert resp.status_code == 200
    cards = resp.json()
    assert cards, "expected clustered stories in dev db"
    top = cards[0]
    assert top["article_count"] >= 1
    assert top["daily_counts"]
    shares = [
        top["bias_left_share"],
        top["bias_center_share"],
        top["bias_right_share"],
    ]
    assert all(s is None or 0 <= s <= 1 for s in shares)


def test_story_arc():
    story_id = client.get("/api/stories").json()[0]["id"]
    resp = client.get(f"/api/stories/{story_id}/arc")
    assert resp.status_code == 200
    arc = resp.json()
    assert arc["metrics"] and arc["articles"]
    assert client.get("/api/stories/999999/arc").status_code == 404


def test_story_outlets():
    story_id = client.get("/api/stories").json()[0]["id"]
    rows = client.get(f"/api/stories/{story_id}/outlets").json()
    assert rows and rows[0]["article_count"] >= 1


def test_semantic_search():
    resp = client.get("/api/search", params={"q": "economy and manufacturing"})
    assert resp.status_code == 200
    results = resp.json()
    assert results
    assert any(
        "econom" in (r["title"] or "").lower() or "manufactur" in (r["title"] or "").lower()
        for r in results[:10]
    )


def test_analytics():
    data = client.get("/api/analytics").json()
    assert data["stories_by_status"]
    assert set(data["articles_by_bias"]) <= {"left", "center", "right"}


def _fake_explanation(text, max_evals=explain_mod.MAX_EVALS):
    return {
        "version": explain_mod.EXPLANATION_VERSION,
        "model": "fake-model",
        "max_evals": max_evals,
        "probs": {"left": 0.3, "center": 0.3, "right": 0.4},
        "predicted": "right",
        "base_values": {"left": 0.1, "center": 0.1, "right": 0.1},
        "tokens": ["fake", " ", "text"],
        "values": [[0.1, 0.0, 0.1], [0.0, 0.0, 0.0], [0.1, 0.0, 0.1]],
    }


def test_story_explanation_step_and_cache(monkeypatch):
    story_id = client.get("/api/stories").json()[0]["id"]

    with SessionLocal() as db:
        story = db.get(Story, story_id)
        original_story_explanation = story.bias_explanation
        touched_ids = [a.id for a in story.articles if a.bias_label]
        original_article_explanations = {
            a.id: a.bias_explanation
            for a in db.execute(select(Article).where(Article.id.in_(touched_ids))).scalars()
        }
        # start from "none" so the test is deterministic regardless of prior runs
        story.bias_explanation = None
        for a in db.execute(select(Article).where(Article.id.in_(touched_ids))).scalars():
            a.bias_explanation = None
        db.commit()

    calls = []

    def counting_fake(text, max_evals=explain_mod.MAX_EVALS):
        calls.append(text)
        return _fake_explanation(text, max_evals)

    monkeypatch.setattr(explain_mod, "explain_text", counting_fake)

    try:
        state = client.get(f"/api/stories/{story_id}/explanation").json()
        assert state["status"] == "none"
        assert state["eligible"] >= 1

        state = None
        for _ in range(10):
            resp = client.post(f"/api/stories/{story_id}/explanation/step")
            assert resp.status_code == 200
            state = resp.json()
            if state["status"] == "complete":
                break
        assert state["status"] == "complete"
        assert state["analyzed"] == state["total"] > 0
        assert len(calls) == state["total"]
        assert state["aggregate"] is not None
        assert all(w["value"] >= 0 for words in state["aggregate"]["top_words"].values() for w in words)

        # further steps are pure cache hits, no new SHAP computes
        resp = client.post(f"/api/stories/{story_id}/explanation/step")
        assert resp.json()["status"] == "complete"
        assert len(calls) == state["total"]

        get_state = client.get(f"/api/stories/{story_id}/explanation").json()
        assert get_state["status"] == "complete"
        assert get_state["as_of"] is not None
    finally:
        with SessionLocal() as db:
            story = db.get(Story, story_id)
            story.bias_explanation = original_story_explanation
            for a in db.execute(select(Article).where(Article.id.in_(touched_ids))).scalars():
                a.bias_explanation = original_article_explanations[a.id]
            db.commit()


def test_story_explanation_404():
    assert client.get("/api/stories/999999/explanation").status_code == 404
    assert client.post("/api/stories/999999/explanation/step").status_code == 404
