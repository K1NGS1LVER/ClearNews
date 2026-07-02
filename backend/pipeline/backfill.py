"""Backfill historical GDELT GKG files so stories have multi-day history.

GDELT archives a file every 15 minutes at a predictable URL. Pulling a
few samples per day for the past N days gives real day-over-day volume,
sentiment and drift series without ingesting the whole firehose.

Run: uv run python -m pipeline.backfill [days] [files_per_day]
"""

import sys
from datetime import UTC, datetime, timedelta

import httpx

from app.db import SessionLocal
from pipeline.gdelt import download_gkg, parse_gkg
from pipeline.ingest import load_records

URL_TEMPLATE = "http://data.gdeltproject.org/gdeltv2/{ts}.gkg.csv.zip"


def sample_timestamps(days: int, files_per_day: int) -> list[str]:
    """Evenly spaced 15-min-aligned timestamps per day, newest day first."""
    now = datetime.now(UTC)
    out = []
    for d in range(1, days + 1):
        day = (now - timedelta(days=d)).date()
        for i in range(files_per_day):
            hour = int(i * 24 / files_per_day)
            out.append(f"{day:%Y%m%d}{hour:02d}0000")
    return out


def run_backfill(days: int = 7, files_per_day: int = 2) -> dict:
    client = httpx.Client(timeout=60)
    inserted = 0
    fetched = 0
    with SessionLocal() as session:
        for ts in sample_timestamps(days, files_per_day):
            url = URL_TEMPLATE.format(ts=ts)
            try:
                csv_text = download_gkg(url, client)
            except httpx.HTTPError as exc:
                print(f"skip {ts}: {exc}")
                continue
            n = load_records(session, parse_gkg(csv_text))
            inserted += n
            fetched += 1
            print(f"{ts}: +{n} articles")
    return {"files": fetched, "inserted": inserted}


if __name__ == "__main__":
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    per_day = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    print(run_backfill(days, per_day))
