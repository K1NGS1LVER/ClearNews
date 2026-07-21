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


_shared_fake_redis = _FakeRedis()


@pytest.fixture(scope="session", autouse=True)
def _patch_ratelimit_redis():
    """Session-scoped so the patch is live before ANY fixture's setup code
    runs - pytest sets up broader-scope fixtures before narrower ones, so a
    function-scoped patch alone would apply too late for module/session-scoped
    fixtures that make a request through a rate limiter (e.g.
    test_countries.py's module-scoped `logged_in_user`, which signs up before
    the per-test `fake_redis` fixture below would otherwise take effect)."""
    mp = pytest.MonkeyPatch()
    mp.setattr("app.ratelimit._redis_client", lambda: _shared_fake_redis)
    yield
    mp.undo()


@pytest.fixture(autouse=True)
def fake_redis():
    """Rate limiting fails closed (503) when Redis is unreachable - see
    app.ratelimit - so every test needs a working backing store, not just the
    ones that specifically assert 429 enforcement. Resets the shared fake's
    counters before each test for isolation (the patch itself is applied once
    per session by _patch_ratelimit_redis above, not per test)."""
    _shared_fake_redis._counts.clear()
    return _shared_fake_redis
