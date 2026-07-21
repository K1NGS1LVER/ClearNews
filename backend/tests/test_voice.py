"""Voice STT + TTS tests.

Unit tests for app.voice mock WhisperModel/KPipeline entirely (no real model
load/download - that's what tests/test_voice_deps.py's opt-in `real_model`
marker is for). Integration tests for POST /api/voice/transcribe and
POST /api/voice/speak mock the respective singleton the same way and drive
the endpoint through TestClient.
"""

import threading
from uuid import uuid4

import numpy as np
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
    monkeypatch.setattr(voice_mod, "_pipeline", None)
    monkeypatch.setattr(voice_mod, "_tts_load_failed", False)
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


def test_transcribe_endpoint_returns_422_for_undecodable_audio(monkeypatch):
    """A corrupt/non-audio upload makes faster-whisper's PyAV decode step
    raise av.error.FFmpegError; the endpoint must map that to a 422 client
    error, not let it propagate as an opaque 500."""
    from av.error import InvalidDataError

    def _boom(_path):
        raise InvalidDataError(-1, "invalid data found when processing input")

    monkeypatch.setattr(voice_mod, "transcribe", _boom)
    c, email = _authed_client()
    try:
        resp = c.post(
            "/api/voice/transcribe",
            files={"file": ("clip.webm", b"not actually audio", "audio/webm")},
        )
        assert resp.status_code == 422
    finally:
        _cleanup(email)


def test_transcribe_endpoint_rate_limited_after_configured_requests(monkeypatch):
    monkeypatch.setattr(voice_mod, "transcribe", lambda path: {"transcript": "ok"})
    c, email = _authed_client()
    try:
        # rate_limit_voice_transcribe has its own independent bucket, so the
        # signup call above (which goes through rate_limit_auth) doesn't
        # count against this endpoint's 20/min window.
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


# ---------------------------------------------------------------------------
# app.voice: TTS lazy singleton + synthesize_stream(), KPipeline mocked
# ---------------------------------------------------------------------------

class _FakeKPipeline:
    """Stands in for kokoro.KPipeline. Yields one (graphemes, phonemes, audio)
    segment per call, with a non-empty float32 array so callers can tell
    real chunks apart from empty ones."""

    def __call__(self, text, voice):
        yield ("graphemes", "phonemes", np.array([0.1, -0.2, 0.3], dtype=np.float32))


class _FailingSentenceKPipeline:
    """Raises for any sentence containing 'boom', otherwise behaves like
    _FakeKPipeline -- used to test per-sentence failure resilience."""

    def __call__(self, text, voice):
        if "boom" in text:
            raise RuntimeError("G2P choked on this sentence")
        yield ("graphemes", "phonemes", np.array([0.1, -0.2, 0.3], dtype=np.float32))


def test_get_pipeline_loads_once_under_concurrent_callers():
    """Two requests racing to first-use the pipeline must not both construct it."""
    calls = []

    def fake_loader():
        calls.append(1)
        return _FakeKPipeline()

    results = []
    threads = [
        threading.Thread(target=lambda: results.append(voice_mod._get_pipeline(fake_loader)))
        for _ in range(8)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(calls) == 1
    assert len({id(r) for r in results}) == 1


def test_tts_load_failure_short_circuits_without_retry():
    """A load failure (corrupt cache, OOM, ...) must not be retried on every call."""
    calls = []

    def failing_loader():
        calls.append(1)
        raise RuntimeError("corrupt cache")

    assert voice_mod._get_pipeline(failing_loader) is None
    assert voice_mod._get_pipeline(failing_loader) is None
    assert len(calls) == 1


def test_tts_is_available_true_once_loaded(monkeypatch):
    monkeypatch.setattr(voice_mod, "_pipeline", _FakeKPipeline())
    assert voice_mod.tts_is_available() is True


def test_tts_is_available_false_when_load_failed(monkeypatch):
    monkeypatch.setattr(voice_mod, "_tts_load_failed", True)
    assert voice_mod.tts_is_available() is False


def test_synthesize_stream_yields_one_chunk_per_sentence(monkeypatch):
    monkeypatch.setattr(voice_mod, "_pipeline", _FakeKPipeline())
    chunks = list(voice_mod.synthesize_stream("Hello there. How are you? Great news!"))
    assert len(chunks) == 3
    assert all(isinstance(c, bytes) and len(c) > 0 for c in chunks)


def test_synthesize_stream_skips_failing_sentence_but_continues(monkeypatch):
    """One sentence's synthesis failure must not abort the whole stream."""
    monkeypatch.setattr(voice_mod, "_pipeline", _FailingSentenceKPipeline())
    chunks = list(
        voice_mod.synthesize_stream("This one is fine. This will go boom badly. This one is fine too.")
    )
    assert len(chunks) == 2


def test_synthesize_stream_empty_text_yields_nothing(monkeypatch):
    monkeypatch.setattr(voice_mod, "_pipeline", _FakeKPipeline())
    assert list(voice_mod.synthesize_stream("   ")) == []


def test_synthesize_stream_yields_nothing_when_pipeline_unavailable(monkeypatch):
    monkeypatch.setattr(voice_mod, "_tts_load_failed", True)
    assert list(voice_mod.synthesize_stream("Hello there.")) == []


# ---------------------------------------------------------------------------
# POST /api/voice/speak, TTS singleton mocked via app.voice functions
# ---------------------------------------------------------------------------

def test_speak_endpoint_returns_200_with_streamed_audio(monkeypatch):
    monkeypatch.setattr(voice_mod, "tts_is_available", lambda: True)
    monkeypatch.setattr(
        voice_mod, "synthesize_stream",
        lambda text, voice: iter([b"\x00\x01\x02\x03", b"\x04\x05\x06\x07"]),
    )
    c, email = _authed_client()
    try:
        resp = c.post("/api/voice/speak", json={"text": "Hello there."})
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/octet-stream"
        assert resp.content == b"\x00\x01\x02\x03\x04\x05\x06\x07"
    finally:
        _cleanup(email)


def test_speak_endpoint_rejects_empty_text(monkeypatch):
    monkeypatch.setattr(voice_mod, "tts_is_available", lambda: True)
    c, email = _authed_client()
    try:
        resp = c.post("/api/voice/speak", json={"text": "   "})
        assert resp.status_code == 400
    finally:
        _cleanup(email)


def test_speak_endpoint_rejects_text_over_length_cap(monkeypatch):
    monkeypatch.setattr(voice_mod, "tts_is_available", lambda: True)
    c, email = _authed_client()
    try:
        resp = c.post("/api/voice/speak", json={"text": "x" * 501})
        assert resp.status_code == 400
    finally:
        _cleanup(email)


def test_speak_endpoint_requires_auth(monkeypatch):
    monkeypatch.setattr(voice_mod, "tts_is_available", lambda: True)
    fresh = TestClient(app)
    resp = fresh.post("/api/voice/speak", json={"text": "Hello there."})
    assert resp.status_code == 401


def test_speak_endpoint_returns_503_when_model_unavailable(monkeypatch):
    monkeypatch.setattr(voice_mod, "tts_is_available", lambda: False)
    c, email = _authed_client()
    try:
        resp = c.post("/api/voice/speak", json={"text": "Hello there."})
        assert resp.status_code == 503
    finally:
        _cleanup(email)


def test_speak_endpoint_rate_limited_after_configured_requests(monkeypatch):
    monkeypatch.setattr(voice_mod, "tts_is_available", lambda: True)
    monkeypatch.setattr(voice_mod, "synthesize_stream", lambda text, voice: iter([b"\x00\x01"]))
    c, email = _authed_client()
    try:
        # rate_limit_voice_speak has its own independent bucket, so the
        # signup call above (which goes through rate_limit_auth) doesn't
        # count against this endpoint's 60/min window.
        statuses = [
            c.post("/api/voice/speak", json={"text": "Hello there."}).status_code
            for _ in range(61)
        ]
        assert statuses[:60] == [200] * 60
        assert statuses[60] == 429
    finally:
        _cleanup(email)
