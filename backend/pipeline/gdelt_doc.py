"""GDELT DOC 2.0 API ingestion - targeted per-country pulls.

The GKG firehose (pipeline/gdelt.py) is global with no country filter, but
its volume naturally skews toward whatever GDELT's English-language crawl
sees most of (large US/UK wire outlets). The DOC 2.0 API's `sourcecountry:`
query lets us pull a country's coverage on demand instead of hoping the
firehose sample happens to include enough of it - and every DOC 2.0 result
comes back tagged with its actual source country, which we use to backfill
Outlet.country (see pipeline/ingest.py's country-aware outlet upsert).

This module never hardcodes a country: every function takes one as an
argument. Which countries actually get polled is decided by the scheduler,
from the countries users have selected (see pipeline/scheduler.py).

Run: uv run python -m pipeline.gdelt_doc <iso2> [<iso2> ...]
"""

import sys
import time
from datetime import UTC, datetime
from typing import Iterator

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from pipeline.country_codes import COUNTRY_NAMES, gdelt_name_to_iso2, iso2_to_gdelt_query
from pipeline.gdelt import GkgRecord

DOC_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
MAX_RECORDS = 250  # DOC 2.0's per-request cap
# GDELT asks for at least 5s between requests; polling several countries in
# one scheduler cycle needs to serialize with a gap, not fire concurrently.
MIN_REQUEST_GAP_SECONDS = 5.0


def fetch_country(
    iso2: str,
    client: httpx.Client | None = None,
    timespan: str = "1d",
    maxrecords: int = MAX_RECORDS,
) -> Iterator[GkgRecord]:
    """Query DOC 2.0 for English-language articles published from `iso2`."""
    query_term = iso2_to_gdelt_query(iso2)
    if not query_term:
        raise ValueError(f"no GDELT query name known for country code {iso2!r}")

    c = client or httpx.Client(timeout=60, follow_redirects=True)
    resp = c.get(
        DOC_API_URL,
        params={
            "query": f"sourcelang:english sourcecountry:{query_term}",
            "mode": "artlist",
            "format": "json",
            "maxrecords": str(maxrecords),
            "sort": "datedesc",
            "timespan": timespan,
        },
        headers={"User-Agent": "ClearNews/1.0 (research; see repo for contact)"},
    )
    resp.raise_for_status()
    try:
        data = resp.json()
    except ValueError:
        # DOC API returns a plain-text rate-limit notice (not JSON) when
        # requests come in faster than ~1/5s - surface it, don't crash parsing.
        raise RuntimeError(f"DOC API did not return JSON for {iso2}: {resp.text[:200]}")

    for row in data.get("articles", []):
        url = row.get("url")
        domain = row.get("domain")
        if not url or not domain:
            continue

        seendate = row.get("seendate")
        try:
            published_at = datetime.strptime(seendate, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
        except (TypeError, ValueError):
            continue

        # trust the code we queried with over re-parsing the echoed name -
        # gdelt_name_to_iso2 is a safety check for callers that don't already
        # know the country, not needed on the request/response round trip.
        row_country = row.get("sourcecountry")
        if row_country and gdelt_name_to_iso2(row_country) != iso2:
            continue  # DOC API occasionally returns a stray cross-country hit

        yield GkgRecord(
            url=url,
            domain=domain,
            title=row.get("title") or None,
            published_at=published_at,
            tone=None,
            themes=[],
        )


def run(iso2: str) -> int:
    from pipeline.ingest import load_records
    from app.db import SessionLocal

    with SessionLocal() as session:
        return load_records(session, fetch_country(iso2), country=iso2)


def active_countries(session: Session) -> list[str]:
    """Countries at least one user has selected - the demand-driven poll set.

    Small table (one row per user), so unioning in Python is simpler and
    plenty fast; no need for a Postgres jsonb_array_elements/unnest query.
    """
    from app.models import User

    codes: set[str] = set()
    for (countries,) in session.execute(select(User.countries)):
        codes.update(countries or [])
    return sorted(codes)


def poll_countries(iso2_codes: list[str]) -> dict[str, int]:
    """Fetch each country in turn, respecting GDELT's rate limit between calls."""
    results: dict[str, int] = {}
    for i, code in enumerate(iso2_codes):
        if i > 0:
            time.sleep(MIN_REQUEST_GAP_SECONDS)
        try:
            results[code] = run(code)
        except Exception as exc:  # one bad country shouldn't abort the rest
            print(f"gdelt_doc: {code} failed: {exc}")
            results[code] = 0
    return results


if __name__ == "__main__":
    codes = [c.upper() for c in sys.argv[1:]]
    if not codes:
        raise SystemExit(f"usage: {sys.argv[0]} <iso2> [<iso2> ...]")
    unknown = [c for c in codes if c not in COUNTRY_NAMES]
    if unknown:
        raise SystemExit(f"unknown country code(s): {unknown}")
    print(poll_countries(codes))
