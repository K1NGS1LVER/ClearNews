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
def _reset_auth_rate_limit():
    """auth.py's signup/login rate limiter is a plain in-process dict keyed
    by client IP, so it persists across the whole pytest session - many test
    files each doing a couple of signups/logins can otherwise trip each
    other's window well before hitting any real limit. Reset it per test."""
    from app.auth import _attempts

    _attempts.clear()
    yield
