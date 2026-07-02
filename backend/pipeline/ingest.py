"""Load GDELT GKG records into Postgres.

Run: uv run python -m pipeline.ingest            # fetch + load latest 15-min file
     uv run python -m pipeline.ingest <file.csv> # load a local CSV (testing)
"""

import sys
from pathlib import Path
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Article, Outlet
from pipeline.gdelt import GkgRecord, download_gkg, fetch_latest_gkg_url, parse_gkg


def _get_outlet_ids(session: Session, domains: set[str]) -> dict[str, int]:
    """Ensure an outlets row per domain, return domain -> id."""
    if not domains:
        return {}
    session.execute(
        pg_insert(Outlet)
        .values([{"domain": d} for d in domains])
        .on_conflict_do_nothing(index_elements=["domain"])
    )
    rows = session.execute(
        select(Outlet.domain, Outlet.id).where(Outlet.domain.in_(domains))
    ).all()
    return dict(rows)


def load_records(session: Session, records: Iterable[GkgRecord]) -> int:
    """Insert records, deduplicating on URL. Returns number of new articles."""
    batch = list(records)
    if not batch:
        return 0

    # a URL can appear twice within one 15-min file; keep the first occurrence
    seen: dict[str, GkgRecord] = {}
    for r in batch:
        seen.setdefault(r.url, r)
    batch = list(seen.values())

    outlet_ids = _get_outlet_ids(session, {r.domain for r in batch})
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


def ingest_latest() -> int:
    url = fetch_latest_gkg_url()
    print(f"downloading {url}")
    csv_text = download_gkg(url)
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
