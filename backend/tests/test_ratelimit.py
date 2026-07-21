"""Unit tests for app.ratelimit's per-limiter bucket isolation.

Regression coverage for a bug where every `_make_limiter()` closure shared
one bucket keyed only by client IP, so exhausting one endpoint's budget
(e.g. rate_limit_auth) could also block an unrelated endpoint's budget
(e.g. rate_limit_chat) for the same IP - contradicting the module's own
docstring promise of independent per-endpoint buckets. The Redis-backed
limiter fixes this by keying counters as f"ratelimit:{name}:{ip}"; these
tests run against the fake_redis fixture (see conftest.py) to exercise that
logic deterministically without a live Redis/Valkey instance.
"""

import pytest
import redis as _redis
from fastapi import HTTPException

from app.ratelimit import _make_limiter

# fake_redis (conftest.py) is autouse, so every test here already runs
# against a working in-memory Redis stand-in.


class _FakeClient:
    def __init__(self, host):
        self.host = host


class _FakeRequest:
    """Minimal stand-in for fastapi.Request - _check only reads request.client.host."""

    def __init__(self, host="203.0.113.1"):
        self.client = _FakeClient(host)


def test_limiters_have_independent_buckets_for_the_same_ip():
    limiter_a = _make_limiter("a", 2, 60)
    limiter_b = _make_limiter("b", 2, 60)
    request = _FakeRequest()

    # Exhaust limiter_a's budget for this IP.
    limiter_a(request)
    limiter_a(request)
    with pytest.raises(HTTPException) as exc_info:
        limiter_a(request)
    assert exc_info.value.status_code == 429

    # limiter_b must still have its own full budget for the same IP - this
    # is exactly what the shared-bucket bug broke.
    limiter_b(request)
    limiter_b(request)
    with pytest.raises(HTTPException) as exc_info:
        limiter_b(request)
    assert exc_info.value.status_code == 429


def test_limiter_still_enforces_its_own_limit_and_window():
    limiter = _make_limiter("solo", 1, 60)
    request = _FakeRequest()

    limiter(request)
    with pytest.raises(HTTPException) as exc_info:
        limiter(request)
    assert exc_info.value.status_code == 429


def test_buckets_stay_independent_per_ip_within_the_same_limiter():
    limiter = _make_limiter("shared", 1, 60)
    request_a = _FakeRequest("203.0.113.1")
    request_b = _FakeRequest("203.0.113.2")

    limiter(request_a)
    with pytest.raises(HTTPException):
        limiter(request_a)

    # A different IP hitting the same limiter is unaffected.
    limiter(request_b)


def test_fails_closed_when_redis_is_unreachable(monkeypatch):
    """Rate limiting protects a paid LLM quota and CPU-bound voice inference,
    so a Redis outage must reject requests (503), not silently let them
    through - the opposite policy from app.cache's caches, which fail open."""
    monkeypatch.setattr("app.ratelimit._redis_client", lambda: None)
    limiter = _make_limiter("down", 10, 60)
    request = _FakeRequest()

    with pytest.raises(HTTPException) as exc_info:
        limiter(request)
    assert exc_info.value.status_code == 503


def test_fails_closed_on_transient_redis_error(monkeypatch):
    class _BrokenRedis:
        def incr(self, key):
            raise _redis.ConnectionError("boom")

    monkeypatch.setattr("app.ratelimit._redis_client", lambda: _BrokenRedis())
    limiter = _make_limiter("flaky", 10, 60)
    request = _FakeRequest()

    with pytest.raises(HTTPException) as exc_info:
        limiter(request)
    assert exc_info.value.status_code == 503
