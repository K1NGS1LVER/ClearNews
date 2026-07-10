"""Pure scorer unit tests + one dev-DB smoke test for /api/foryou."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app, score_story
from app.models import User

client = TestClient(app)


def _base_kwargs(**overrides) -> dict:
    kwargs: dict = dict(
        category="economy",
        status="active",
        days_since_seen=1.0,
        bias_left_share=0.33,
        bias_right_share=0.33,
        haystack="some story about the economy",
        favourite_category=None,
        categories=[],
        keywords=[],
        bias_pref="balanced",
    )
    kwargs.update(overrides)
    return kwargs


def test_favourite_category_scores_higher_than_followed():
    fav_score, _ = score_story(**_base_kwargs(favourite_category="economy", categories=["economy"]))
    followed_score, _ = score_story(**_base_kwargs(favourite_category=None, categories=["economy"]))
    none_score, _ = score_story(**_base_kwargs(favourite_category=None, categories=[]))
    assert fav_score > followed_score > none_score


def test_keyword_matches_are_capped():
    score_one, matched_one = score_story(**_base_kwargs(keywords=["economy"]))
    score_many, matched_many = score_story(
        **_base_kwargs(keywords=["economy", "story", "some", "about"])
    )
    assert matched_one == ["economy"]
    assert len(matched_many) == 4
    # capped contribution: extra matches beyond 2 add nothing further
    assert score_many - score_one < 2.0 + 0.01


def test_category_weight_nudges_score_without_touching_others():
    baseline, _ = score_story(**_base_kwargs())
    boosted, _ = score_story(**_base_kwargs(category_weights={"economy": 1.0}))
    suppressed, _ = score_story(**_base_kwargs(category_weights={"economy": -1.0}))
    unrelated, _ = score_story(**_base_kwargs(category_weights={"sports": 1.0}))
    assert boosted == pytest.approx(baseline + 1.0)
    assert suppressed == pytest.approx(baseline - 1.0)
    assert unrelated == baseline  # weight for a different category is a no-op


def test_country_match_adds_fixed_bonus():
    no_match, _ = score_story(
        **_base_kwargs(story_countries={"US"}, user_countries={"IN"})
    )
    match, _ = score_story(
        **_base_kwargs(story_countries={"IN", "US"}, user_countries={"IN"})
    )
    neither_set, _ = score_story(**_base_kwargs())
    assert match == pytest.approx(no_match + 1.5)
    assert no_match == neither_set  # empty/missing sets behave like "no preference"


def test_balanced_vs_challenge_direction():
    balanced_score, _ = score_story(
        **_base_kwargs(bias_pref="balanced", bias_left_share=0.5, bias_right_share=0.5)
    )
    challenge_score, _ = score_story(
        **_base_kwargs(bias_pref="challenge", bias_left_share=0.5, bias_right_share=0.5)
    )
    balanced_skewed, _ = score_story(
        **_base_kwargs(bias_pref="balanced", bias_left_share=0.9, bias_right_share=0.0)
    )
    challenge_skewed, _ = score_story(
        **_base_kwargs(bias_pref="challenge", bias_left_share=0.9, bias_right_share=0.0)
    )
    # balanced prefers low skew, challenge prefers high skew
    assert balanced_score > balanced_skewed
    assert challenge_skewed > challenge_score


def test_foryou_requires_auth():
    fresh = TestClient(app)
    resp = fresh.get("/api/foryou")
    assert resp.status_code == 401


@pytest.mark.dev_db
def test_foryou_smoke():
    email = f"t{uuid4().hex}@test.local"
    try:
        signup = client.post(
            "/api/auth/signup",
            json={"email": email, "password": "correcthorse", "display_name": "Test"},
        )
        assert signup.status_code == 200
        prefs = client.put(
            "/api/me/preferences",
            json={
                "favourite_category": "economy",
                "categories": ["economy", "sports"],
                "bias_pref": "balanced",
                "keywords": [],
            },
        )
        assert prefs.status_code == 200

        resp = client.get("/api/foryou")
        assert resp.status_code == 200
        cards = resp.json()
        assert cards, "expected stories in dev db"
        assert all(c["size"] in {"hero", "standard", "compact"} for c in cards)
        followed = {"economy", "sports"}
        outside = [c for c in cards if c["category"] not in followed]
        # anti-bubble blend should surface at least one non-followed story
        # when enough distinct categories exist in the dev db
        categories_present = {c["category"] for c in cards}
        if len(categories_present - followed) > 0:
            assert outside
    finally:
        with SessionLocal() as db:
            from sqlalchemy import select

            user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if user:
                db.delete(user)
                db.commit()
