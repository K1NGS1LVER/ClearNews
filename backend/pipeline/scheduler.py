"""Continuous pipeline scheduling.

- every 15 min: pull the latest GDELT GKG file
- hourly: poll DOC 2.0 for any countries users have selected, NLP-enrich new
  articles, recluster stories, refresh metrics (so new-country stories -
  or any new stories - become feed-ready within about an hour, not just at
  the nightly run)
- nightly: categories, death-risk training + scoring

Run: uv run python -m pipeline.scheduler
"""

import subprocess
import sys

from apscheduler.schedulers.blocking import BlockingScheduler

from app.db import SessionLocal
from pipeline.cluster import run_clustering
from pipeline.fetch_content import run_backfill_story_images, run_fetch
from pipeline.gdelt_doc import active_countries, poll_countries
from pipeline.ingest import ingest_latest
from pipeline.metrics import run_metrics
from pipeline.nlp_worker import run_once as nlp_run_once
from pipeline.topics import run_topics


def poll_active_countries() -> dict:
    """Demand-driven: only countries at least one user has actually selected
    get polled - see pipeline/gdelt_doc.py. No country is ever hardcoded."""
    with SessionLocal() as session:
        codes = active_countries(session)
    if not codes:
        return {}
    return poll_countries(codes)


def hourly() -> None:
    print(poll_active_countries())
    print(run_fetch())  # full text first so NLP works on content, not titles
    print(run_backfill_story_images())  # keep filling in story thumbnails
    # Drain the NLP queue: process all pending articles in batches
    total = 0
    while n := nlp_run_once():
        total += n
        print(f"nlp_worker: processed {total} from queue")
    print(f"hourly: NLP done ({total} articles)")
    with SessionLocal() as session:
        print(run_clustering(session))
    print(run_metrics())


def nightly() -> None:
    print(run_topics())
    # xgboost and torch cannot share a process on macOS (conflicting OpenMP
    # runtimes), so death prediction runs in its own process
    for cmd in ("train", "score"):
        subprocess.run([sys.executable, "-m", "pipeline.predict", cmd], check=False)


def check_single_openmp() -> None:
    """Refuse to run with multiple OpenMP runtimes; that segfaults eventually.

    torch and sklearn wheels each bundle a libomp.dylib; `uv sync` restores
    them. scripts/unify_libomp.py symlinks them to one file.
    """
    from pathlib import Path

    site = Path(__file__).parent.parent / ".venv/lib/python3.12/site-packages"
    inodes = {p.stat().st_ino for p in site.rglob("libomp.dylib")}
    if len(inodes) > 1:
        raise SystemExit(
            f"{len(inodes)} distinct OpenMP runtimes in the venv - this process "
            "will eventually segfault. Run: uv run python scripts/unify_libomp.py"
        )


def main() -> None:
    check_single_openmp()
    scheduler = BlockingScheduler()
    scheduler.add_job(ingest_latest, "interval", minutes=15)
    scheduler.add_job(hourly, "interval", hours=1)
    scheduler.add_job(nightly, "cron", hour=3, minute=30)
    ingest_latest()  # run once at startup; interval jobs follow
    hourly()
    scheduler.start()


if __name__ == "__main__":
    main()
