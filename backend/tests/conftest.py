"""Auto-skip tests marked `dev_db` when the database has no clustered
stories yet (e.g. a fresh CI database that only ran migrations).

Tests that need real pipeline output stay honest about that dependency
instead of failing with a confusing assertion error."""

import pytest
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Story


def _dev_db_has_stories() -> bool:
    with SessionLocal() as db:
        return db.execute(select(func.count()).select_from(Story)).scalar_one() > 0


def pytest_collection_modifyitems(items):
    if _dev_db_has_stories():
        return
    skip = pytest.mark.skip(reason="needs a populated dev database (run the pipeline first)")
    for item in items:
        if "dev_db" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Clean Redis rate-limit counters between tests to avoid cross-test
    interference. No-op when Redis is unavailable."""
    from app.cache import _client as _redis_client

    r = _redis_client()
    if r is not None:
        try:
            keys = r.keys("ratelimit:*")
            if keys:
                r.delete(*keys)
        except Exception:
            pass
    yield


class _FakeRedis:
    """Minimal in-memory stand-in for the redis client's incr/expire calls,
    so rate-limit enforcement tests exercise the real counting logic in
    app.ratelimit without needing a live Redis/Valkey instance in CI."""

    def __init__(self):
        self._counts: dict[str, int] = {}

    def incr(self, key: str) -> int:
        self._counts[key] = self._counts.get(key, 0) + 1
        return self._counts[key]

    def expire(self, key: str, seconds: int) -> None:
        pass


@pytest.fixture
def fake_redis(monkeypatch):
    """Opt-in fixture: patches app.ratelimit's Redis client with an in-memory
    fake so tests can assert real rate-limit enforcement deterministically."""
    fake = _FakeRedis()
    monkeypatch.setattr("app.ratelimit._redis_client", lambda: fake)
    return fake
