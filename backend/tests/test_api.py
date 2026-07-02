"""API smoke tests against the dev database (needs prior pipeline runs)."""

from fastapi.testclient import TestClient

from app.main import app

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
