"""NLP worker that consumes article IDs from a Redis queue and enriches them.

This decouples ingestion from NLP enrichment: pipeline/ingest.py pushes newly
inserted article IDs to a Redis list (nlp:pending), and this worker picks them
up, processes them in batches, and writes the results back to PostgreSQL.

Run: uv run python -m pipeline.nlp_worker [batch_size] [poll_interval]
     uv run python -m pipeline.nlp_worker --once [batch_size]
"""

import sys
import time
from functools import lru_cache

import torch
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.cache import nlp_queue_pop, nlp_queue_length
from app.db import SessionLocal
from app.models import Article
from pipeline.country_codes import gdelt_name_to_iso2
from pipeline.nlp import (
    _bias_pipeline,
    _embedder,
    _spacy,
    _vader,
    BIAS_LABELS,
    _entities_from_doc,
    extract_mentioned_countries,
)

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
    todo = [(a, (a.content or a.title)) for a in articles if (a.content or a.title)]
    if not todo:
        return 0

    texts = [t for _, t in todo]
    embeddings = _embedder().encode(texts, batch_size=64)
    biases = score_bias(texts)
    vader = _vader()

    for (article, text), emb, (bias_label, bias_score) in zip(todo, embeddings, biases):
        doc = _spacy()(text)
        article.embedding = emb
        article.sentiment = vader.polarity_scores(text)["compound"]
        article.bias_label = bias_label
        article.bias_score = bias_score
        article.entities = _entities_from_doc(doc)
        if not article.mentioned_countries:
            article.mentioned_countries = extract_mentioned_countries(doc)

    session.commit()
    return len(todo)


def score_bias(texts: list[str]) -> list[tuple[str, float]]:
    tokenizer, model = _bias_pipeline()
    enc = tokenizer(
        texts, return_tensors="pt", truncation=True, max_length=512, padding=True
    )
    with torch.no_grad():
        probs = torch.softmax(model(**enc).logits, dim=-1)
    out = []
    for p in probs:
        label = BIAS_LABELS[int(p.argmax())]
        out.append((label, float(p[2] - p[0])))
    return out


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
