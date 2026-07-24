"""Auth flow tests against the dev database."""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.main import app
from app.models import PasswordResetToken, User

client = TestClient(app)


def _signup():
    email = f"t{uuid4().hex}@test.local"
    resp = client.post(
        "/api/auth/signup",
        json={"email": email, "password": "correcthorse", "display_name": "Test User"},
    )
    return email, resp


def _cleanup(email: str):
    with SessionLocal() as db:
        user = db.execute(
            select(User).where(User.email == email)
        ).scalar_one_or_none()
        if user:
            db.delete(user)
            db.commit()


def test_signup_sets_cookie_and_me_works():
    email, resp = _signup()
    try:
        assert resp.status_code == 200
        assert "session" in resp.cookies
        body = resp.json()
        assert body["email"] == email
        assert body["display_name"] == "Test User"

        me = client.get("/api/me")
        assert me.status_code == 200
        assert me.json()["email"] == email
    finally:
        _cleanup(email)


def test_me_without_cookie_is_401():
    fresh = TestClient(app)
    resp = fresh.get("/api/me")
    assert resp.status_code == 401


def test_login_wrong_password_is_401():
    email, signup_resp = _signup()
    try:
        assert signup_resp.status_code == 200
        fresh = TestClient(app)
        resp = fresh.post(
            "/api/auth/login", json={"email": email, "password": "wrongpassword"}
        )
        assert resp.status_code == 401
    finally:
        _cleanup(email)


def test_login_unknown_email_is_401():
    fresh = TestClient(app)
    resp = fresh.post(
        "/api/auth/login",
        json={"email": "nobody-here@test.local", "password": "whatever1"},
    )
    assert resp.status_code == 401


def test_signup_duplicate_email_is_409():
    email, first = _signup()
    try:
        assert first.status_code == 200
        second = client.post(
            "/api/auth/signup",
            json={"email": email, "password": "anotherpass", "display_name": "Dupe"},
        )
        assert second.status_code == 409
    finally:
        _cleanup(email)


def test_preferences_round_trip_and_validation():
    email, resp = _signup()
    try:
        assert resp.status_code == 200
        put = client.put(
            "/api/me/preferences",
            json={
                "favourite_category": "science_tech",
                "categories": ["science_tech", "economy"],
                "bias_pref": "challenge",
                "keywords": ["ai", "climate"],
            },
        )
        assert put.status_code == 200
        body = put.json()
        assert body["favourite_category"] == "science_tech"
        assert set(body["categories"]) == {"science_tech", "economy"}
        assert body["bias_pref"] == "challenge"
        assert body["keywords"] == ["ai", "climate"]

        me = client.get("/api/me").json()
        assert me["favourite_category"] == "science_tech"

        bad = client.put(
            "/api/me/preferences",
            json={"categories": ["not_a_real_category"], "bias_pref": "balanced"},
        )
        assert bad.status_code == 400
    finally:
        _cleanup(email)


def test_preferences_countries_round_trip_validation_and_default():
    # one signup covering three phases, to stay well under auth's rate limit
    # (10 signup/login attempts per minute - see auth.py's rate_limit)
    email, resp = _signup()
    try:
        assert resp.status_code == 200

        # countries omitted entirely - request model defaults it, doesn't 422
        defaulted = client.put(
            "/api/me/preferences",
            json={"categories": [], "bias_pref": "balanced"},
        )
        assert defaulted.status_code == 200
        assert defaulted.json()["countries"] == []

        put = client.put(
            "/api/me/preferences",
            json={
                "favourite_category": None,
                "categories": [],
                "bias_pref": "balanced",
                "keywords": [],
                "countries": ["IN", "BR"],
            },
        )
        assert put.status_code == 200
        assert set(put.json()["countries"]) == {"IN", "BR"}

        me = client.get("/api/me").json()
        assert set(me["countries"]) == {"IN", "BR"}

        bad = client.put(
            "/api/me/preferences",
            json={"categories": [], "bias_pref": "balanced", "countries": ["ZZ"]},
        )
        assert bad.status_code == 400
    finally:
        _cleanup(email)


def test_logout_clears_session():
    email, resp = _signup()
    try:
        assert resp.status_code == 200
        out = client.post("/api/auth/logout")
        assert out.status_code == 200
        me = client.get("/api/me")
        assert me.status_code == 401
    finally:
        _cleanup(email)


def test_forgot_password_is_always_ok_even_for_unknown_email():
    # generic response regardless of whether the email is registered, so this
    # endpoint can't be used to enumerate accounts
    resp = client.post(
        "/api/auth/forgot-password", json={"email": "nobody-here@test.local"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_reset_password_full_flow():
    # one signup covering the whole flow, to stay under the password_reset
    # rate limit (10/min/IP - see ratelimit.py)
    email, resp = _signup()
    try:
        assert resp.status_code == 200

        forgot = client.post("/api/auth/forgot-password", json={"email": email})
        assert forgot.status_code == 200

        with SessionLocal() as db:
            user = db.execute(
                select(User).where(User.email == email)
            ).scalar_one()
            token_row = db.execute(
                select(PasswordResetToken).where(
                    PasswordResetToken.user_id == user.id
                )
            ).scalar_one()
            token = token_row.token

        too_short = client.post(
            "/api/auth/reset-password", json={"token": token, "password": "short"}
        )
        assert too_short.status_code == 400

        bad_token = client.post(
            "/api/auth/reset-password",
            json={"token": "not-a-real-token", "password": "newcorrecthorse"},
        )
        assert bad_token.status_code == 400

        reset = client.post(
            "/api/auth/reset-password",
            json={"token": token, "password": "newcorrecthorse"},
        )
        assert reset.status_code == 200

        # token is single-use
        reused = client.post(
            "/api/auth/reset-password",
            json={"token": token, "password": "yetanotherpass"},
        )
        assert reused.status_code == 400

        # old password no longer works, new password does
        fresh = TestClient(app)
        old_login = fresh.post(
            "/api/auth/login", json={"email": email, "password": "correcthorse"}
        )
        assert old_login.status_code == 401
        new_login = fresh.post(
            "/api/auth/login", json={"email": email, "password": "newcorrecthorse"}
        )
        assert new_login.status_code == 200

        # the reset also invalidated the session from signup
        stale_session_check = client.get("/api/me")
        assert stale_session_check.status_code == 401
    finally:
        _cleanup(email)
