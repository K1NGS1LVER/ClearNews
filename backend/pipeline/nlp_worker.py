"""NLP worker that consumes article IDs from a Redis queue and enriches them.

This decouples ingestion from NLP enrichment: pipeline/ingest.py pushes newly
inserted article IDs to a Redis list (nlp:pending), and this worker picks them
up, processes them in batches, and writes the results back to PostgreSQL.

Run: uv run python -m pipeline.nlp_worker [batch_size] [poll_interval]
     uv run python -m pipeline.nlp_worker --once [batch_size]
"""

import sys
import time

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.cache import nlp_queue_pop, nlp_queue_length
from app.db import SessionLocal
from app.models import Article
from pipeline.nlp import _enrich, _text_of

BATCH_SIZE = 256
POLL_INTERVAL = 5.0  # seconds between polls when queue is empty


def process_ids(session: Session, article_ids: list[int]) -> int:
    """Enrich the given articles in bulk. Returns count processed."""
    articles = (
        session.execute(
            select(Article)
            .where(
                Article.id.in_(article_ids),
                Article.embedding.is_(None),
                or_(Article.content.isnot(None), Article.title.isnot(None)),
            )
            .order_by(Article.id)
        )
        .scalars()
        .all()
    )
    todo = [(a, _text_of(a)) for a in articles]
    todo = [(a, t) for a, t in todo if t]
    if not todo:
        return 0
    return _enrich(session, todo)


def run(batch_size: int = BATCH_SIZE, poll_interval: float = POLL_INTERVAL) -> None:
    """Poll the Redis queue in a loop, processing batches as they arrive."""
    idle_count = 0
    while True:
        ids = nlp_queue_pop(batch_size)
        if not ids:
            idle_count += 1
            if idle_count % 12 == 0:  # log every ~60s
                print(f"nlp_worker: queue empty, sleeping {poll_interval}s")
            time.sleep(poll_interval)
            continue
        idle_count = 0
        with SessionLocal() as session:
            n = process_ids(session, ids)
        remaining = nlp_queue_length()
        print(f"nlp_worker: processed {n}, {remaining} remaining in queue")


def run_once(batch_size: int = BATCH_SIZE) -> tuple[int, int]:
    """Pop one batch from the queue, process it.

    Returns (popped, processed). `processed` can be less than `popped` (even
    zero) when popped articles are already embedded or have no text - callers
    that want to know whether the queue is drained should check `popped`, not
    `processed`.
    """
    ids = nlp_queue_pop(batch_size)
    if not ids:
        return 0, 0
    with SessionLocal() as session:
        return len(ids), process_ids(session, ids)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--once":
        size = int(args[1]) if len(args) > 1 else BATCH_SIZE
        _, processed = run_once(size)
        print(f"done: {processed} articles enriched")
    else:
        size = int(args[0]) if args else BATCH_SIZE
        poll = float(args[1]) if len(args) > 1 else POLL_INTERVAL
        run(size, poll)
