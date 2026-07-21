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
