"""GET /api/countries, country-filtered /api/stories + /api/foryou, and the
3-dot 'more/less like this' feedback endpoint."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.countries import SUPPORTED_COUNTRIES
from app.db import SessionLocal
from app.main import app
from app.models import Story, User

client = TestClient(app)

pytestmark = pytest.mark.dev_db


@pytest.fixture(scope="module")
def logged_in_user():
    """One signup shared by every feedback test in this module - auth's
    rate limiter (10 signup/login attempts/min, see auth.py) can't absorb a
    fresh signup per test once several test files run in the same process."""
    email = f"t{uuid4().hex}@test.local"
    resp = client.post(
        "/api/auth/signup",
        json={"email": email, "password": "correcthorse", "display_name": "Test"},
    )
    assert resp.status_code == 200
    yield email
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user:
            db.delete(user)
            db.commit()


def test_list_countries_covers_full_taxonomy():
    resp = client.get("/api/countries")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == len(SUPPORTED_COUNTRIES)
    codes = {r["code"] for r in rows}
    assert codes == set(SUPPORTED_COUNTRIES)
    for r in rows:
        assert r["source_article_count"] >= 0
        assert r["story_count"] >= 0


def test_stories_source_country_filter_unknown_country_is_empty():
    # no outlet is actually tagged with this ISO-2 code (dev db predates
    # country tagging) - filtering by it should return zero, not error
    resp = client.get("/api/stories", params={"source_country": "AQ"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_stories_about_country_filter_unknown_country_is_empty():
    resp = client.get("/api/stories", params={"about_country": "AQ"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_feedback_requires_auth():
    fresh = TestClient(app)
    story_id = client.get("/api/stories").json()[0]["id"]
    resp = fresh.post(f"/api/stories/{story_id}/feedback", json={"direction": "more"})
    assert resp.status_code == 401


def test_feedback_full_flow(logged_in_user):
    """404 / bad-direction / hide-unhide / category-weight nudging, all
    against the one shared logged-in user - see the `logged_in_user` fixture."""
    resp = client.post("/api/stories/999999/feedback", json={"direction": "more"})
    assert resp.status_code == 404

    story_id = client.get("/api/stories").json()[0]["id"]
    bad = client.post(f"/api/stories/{story_id}/feedback", json={"direction": "sideways"})
    assert bad.status_code == 400

    cards = client.get("/api/foryou").json()
    assert cards, "expected stories in dev db"
    target_id = cards[0]["id"]

    less = client.post(f"/api/stories/{target_id}/feedback", json={"direction": "less"})
    assert less.status_code == 200
    after_less = client.get("/api/foryou").json()
    assert target_id not in {c["id"] for c in after_less}

    more = client.post(f"/api/stories/{target_id}/feedback", json={"direction": "more"})
    assert more.status_code == 200
    after_more = client.get("/api/foryou").json()
    assert target_id in {c["id"] for c in after_more}  # upsert un-hid it

    with SessionLocal() as db:
        story = db.execute(select(Story).where(Story.category.isnot(None))).scalars().first()
    if story is None:
        pytest.skip("no categorized story in dev db")

    client.post(f"/api/stories/{story.id}/feedback", json={"direction": "more"})
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == logged_in_user)).scalar_one()
        weights = user.category_weights or {}
        assert weights.get(story.category) == pytest.approx(0.5)

    client.post(f"/api/stories/{story.id}/feedback", json={"direction": "less"})
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == logged_in_user)).scalar_one()
        weights = user.category_weights or {}
        # second call nudges the same category back down, doesn't add on top
        assert weights.get(story.category) == pytest.approx(0.0)
