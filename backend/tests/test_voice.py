"""Voice STT tests.

Unit tests for app.voice mock WhisperModel entirely (no real model load/
download - that's what tests/test_voice_deps.py's opt-in `real_model` marker
is for). Integration tests for POST /api/voice/transcribe mock the STT
singleton the same way and drive the endpoint through TestClient.
"""

import threading
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import app.main as main_mod
import app.voice as voice_mod
from app.db import SessionLocal
from app.main import app
from app.models import User

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_voice_singleton(monkeypatch):
    """Each test starts from a clean lazy-singleton state, regardless of what
    an earlier test left behind."""
    monkeypatch.setattr(voice_mod, "_model", None)
    monkeypatch.setattr(voice_mod, "_load_failed", False)
    yield


def _authed_client():
    email = f"voice{uuid4().hex}@test.local"
    c = TestClient(app)
    resp = c.post(
        "/api/auth/signup",
        json={"email": email, "password": "correcthorse", "display_name": "Voice Tester"},
    )
    assert resp.status_code == 200
    return c, email


def _cleanup(email: str):
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user:
            db.delete(user)
            db.commit()


# ---------------------------------------------------------------------------
# app.voice: lazy singleton + transcribe(), WhisperModel mocked
# ---------------------------------------------------------------------------

class _FakeSegment:
    def __init__(self, text):
        self.text = text


class _FakeInfo:
    def __init__(self, language="en", duration=1.23):
        self.language = language
        self.duration = duration


class _FakeWhisperModel:
    """Stands in for faster_whisper.WhisperModel."""

    def transcribe(self, _audio_path, beam_size=5):
        return [_FakeSegment("hello "), _FakeSegment("world")], _FakeInfo()


def test_get_model_loads_once_under_concurrent_callers():
    """Two requests racing to first-use the model must not both construct it."""
    calls = []

    def fake_loader():
        calls.append(1)
        return _FakeWhisperModel()

    results = []
    threads = [
        threading.Thread(target=lambda: results.append(voice_mod._get_model(fake_loader)))
        for _ in range(8)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(calls) == 1
    assert len({id(r) for r in results}) == 1


def test_load_failure_short_circuits_without_retry():
    """A load failure (corrupt cache, OOM, ...) must not be retried on every call."""
    calls = []

    def failing_loader():
        calls.append(1)
        raise RuntimeError("corrupt cache")

    assert voice_mod._get_model(failing_loader) is None
    assert voice_mod._get_model(failing_loader) is None
    assert len(calls) == 1


def test_is_available_true_once_loaded(monkeypatch):
    monkeypatch.setattr(voice_mod, "_model", _FakeWhisperModel())
    assert voice_mod.is_available() is True


def test_is_available_false_when_load_failed(monkeypatch):
    monkeypatch.setattr(voice_mod, "_load_failed", True)
    assert voice_mod.is_available() is False


def test_transcribe_returns_transcript_language_duration(monkeypatch):
    monkeypatch.setattr(voice_mod, "_model", _FakeWhisperModel())
    result = voice_mod.transcribe("irrelevant/path.wav")
    assert result == {"transcript": "hello world", "language": "en", "duration": 1.23}


def test_transcribe_returns_none_when_model_unavailable(monkeypatch):
    monkeypatch.setattr(voice_mod, "_load_failed", True)
    assert voice_mod.transcribe("irrelevant/path.wav") is None


# ---------------------------------------------------------------------------
# POST /api/voice/transcribe, STT singleton mocked via app.voice.transcribe
# ---------------------------------------------------------------------------

def test_transcribe_endpoint_returns_200_with_transcript(monkeypatch):
    monkeypatch.setattr(
        voice_mod, "transcribe",
        lambda path: {"transcript": "hello world", "language": "en", "duration": 1.5},
    )
    c, email = _authed_client()
    try:
        resp = c.post(
            "/api/voice/transcribe",
            files={"file": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["transcript"] == "hello world"
        assert body["language"] == "en"
    finally:
        _cleanup(email)


def test_transcribe_endpoint_requires_auth(monkeypatch):
    monkeypatch.setattr(voice_mod, "transcribe", lambda path: {"transcript": "hello"})
    fresh = TestClient(app)
    resp = fresh.post(
        "/api/voice/transcribe",
        files={"file": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
    )
    assert resp.status_code == 401


def test_transcribe_endpoint_rejects_oversized_upload(monkeypatch):
    # Shrink the limit rather than uploading a real 10MB body, so the test
    # stays fast; the endpoint reads in 1MB chunks so this exercises the
    # same code path a real oversized clip would hit.
    monkeypatch.setattr(main_mod, "MAX_UPLOAD_BYTES", 10)
    monkeypatch.setattr(voice_mod, "transcribe", lambda path: {"transcript": "should not run"})
    c, email = _authed_client()
    try:
        resp = c.post(
            "/api/voice/transcribe",
            files={"file": ("clip.webm", b"x" * 1000, "audio/webm")},
        )
        assert resp.status_code == 413
    finally:
        _cleanup(email)


def test_transcribe_endpoint_rejects_empty_upload(monkeypatch):
    monkeypatch.setattr(voice_mod, "transcribe", lambda path: {"transcript": "should not run"})
    c, email = _authed_client()
    try:
        resp = c.post(
            "/api/voice/transcribe",
            files={"file": ("clip.webm", b"", "audio/webm")},
        )
        assert resp.status_code == 400
    finally:
        _cleanup(email)


def test_transcribe_endpoint_returns_503_when_model_unavailable(monkeypatch):
    monkeypatch.setattr(voice_mod, "transcribe", lambda path: None)
    c, email = _authed_client()
    try:
        resp = c.post(
            "/api/voice/transcribe",
            files={"file": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
        )
        assert resp.status_code == 503
    finally:
        _cleanup(email)


def test_transcribe_endpoint_rate_limited_after_configured_requests(monkeypatch):
    from app.ratelimit import _buckets

    monkeypatch.setattr(voice_mod, "transcribe", lambda path: {"transcript": "ok"})
    c, email = _authed_client()
    try:
        # ratelimit.py's fixed-window bucket is keyed by IP only (not by
        # which limiter is checking it - see concern in task-1-report.md),
        # so the signup call above shares this client's bucket. Clear it so
        # this test measures rate_limit_voice_transcribe's own 20/min window,
        # not window state left over from authenticating.
        _buckets.clear()
        statuses = [
            c.post(
                "/api/voice/transcribe",
                files={"file": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
            ).status_code
            for _ in range(21)
        ]
        assert statuses[:20] == [200] * 20
        assert statuses[20] == 429
    finally:
        _cleanup(email)
