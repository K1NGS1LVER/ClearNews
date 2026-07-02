"""Continuous ingestion: pull the latest GDELT GKG file every 15 minutes.

Run: uv run python -m pipeline.scheduler
"""

from apscheduler.schedulers.blocking import BlockingScheduler

from pipeline.ingest import ingest_latest


def main() -> None:
    scheduler = BlockingScheduler()
    scheduler.add_job(ingest_latest, "interval", minutes=15)
    ingest_latest()  # run once at startup; interval job fires 15 min later
    scheduler.start()


if __name__ == "__main__":
    main()
