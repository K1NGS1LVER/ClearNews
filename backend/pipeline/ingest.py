"""Load GDELT GKG records into Postgres.

Run: uv run python -m pipeline.ingest            # fetch + load latest 15-min file
     uv run python -m pipeline.ingest <file.csv> # load a local CSV (testing)
"""

import sys
from pathlib import Path
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Article, Outlet
from pipeline.gdelt import GkgRecord, download_gkg, fetch_latest_gkg_url, parse_gkg


def _get_outlet_ids(
    session: Session, domains: set[str], country: str | None = None
) -> dict[str, int]:
    """Ensure an outlets row per domain, return domain -> id.

    `country` (ISO-2) is set on new rows and backfilled onto existing rows
    that don't have one yet - COALESCE means an outlet's country is never
    overwritten once known, and callers that don't know a country (e.g. the
    GKG firehose) can safely omit it without clobbering earlier tagging from
    pipeline/gdelt_doc.py.
    """
    if not domains:
        return {}
    stmt = pg_insert(Outlet).values([{"domain": d, "country": country} for d in domains])
    stmt = stmt.on_conflict_do_update(
        index_elements=["domain"],
        set_={"country": func.coalesce(Outlet.country, stmt.excluded.country)},
    )
    session.execute(stmt)
    rows = session.execute(
        select(Outlet.domain, Outlet.id).where(Outlet.domain.in_(domains))
    ).all()
    return dict(rows)


def load_records(
    session: Session, records: Iterable[GkgRecord], country: str | None = None
) -> int:
    """Insert records, deduplicating on URL. Returns number of new articles."""
    batch = list(records)
    if not batch:
        return 0

    # a URL can appear twice within one 15-min file; keep the first occurrence
    seen: dict[str, GkgRecord] = {}
    for r in batch:
        seen.setdefault(r.url, r)
    batch = list(seen.values())

    outlet_ids = _get_outlet_ids(session, {r.domain for r in batch}, country=country)
    result = session.execute(
        pg_insert(Article)
        .values(
            [
                {
                    "url": r.url,
                    "title": r.title,
                    "source": "gdelt",
                    "published_at": r.published_at,
                    "outlet_id": outlet_ids[r.domain],
                    "gdelt_tone": r.tone,
                    "themes": r.themes,
                    "mentioned_countries": r.mentioned_countries,
                }
                for r in batch
            ]
        )
        .on_conflict_do_nothing(index_elements=["url"])
        .returning(Article.id)
    )
    inserted = len(result.fetchall())
    session.commit()
    return inserted


import datetime as dt
import re
import httpx


def ingest_latest() -> int:
    url = fetch_latest_gkg_url()
    csv_text = None
    for _ in range(5):
        print(f"downloading {url}")
        try:
            csv_text = download_gkg(url)
            break
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                print(f"URL {url} returned 404, trying previous 15-minute slot...")
                match = re.search(r"(\d{14})\.gkg\.csv\.zip", url)
                if match:
                    ts_str = match.group(1)
                    ts = dt.datetime.strptime(ts_str, "%Y%m%d%H%M%S")
                    prev_ts = ts - dt.timedelta(minutes=15)
                    prev_ts_str = prev_ts.strftime("%Y%m%d%H%M%S")
                    url = url.replace(ts_str, prev_ts_str)
                    continue
            raise e

    if not csv_text:
        raise ValueError("Could not download any recent GKG files.")

    with SessionLocal() as session:
        n = load_records(session, parse_gkg(csv_text))
    return n


def ingest_file(path: Path) -> int:
    csv_text = path.read_text(encoding="utf-8", errors="replace")
    with SessionLocal() as session:
        n = load_records(session, parse_gkg(csv_text))
    return n


if __name__ == "__main__":
    if len(sys.argv) > 1:
        count = ingest_file(Path(sys.argv[1]))
    else:
        count = ingest_latest()
    print(f"inserted {count} new articles")
