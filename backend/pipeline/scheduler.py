"""Continuous pipeline scheduling.

- every 15 min: pull the latest GDELT GKG file
- hourly: NLP-enrich new articles, recluster stories
- nightly: metrics, categories, death-risk training + scoring

Run: uv run python -m pipeline.scheduler
"""

import subprocess
import sys

from apscheduler.schedulers.blocking import BlockingScheduler

from app.db import SessionLocal
from pipeline.cluster import run_clustering
from pipeline.ingest import ingest_latest
from pipeline.metrics import run_metrics
from pipeline.nlp import process_all
from pipeline.topics import run_topics


def hourly() -> None:
    process_all()
    with SessionLocal() as session:
        print(run_clustering(session))


def nightly() -> None:
    print(run_metrics())
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
