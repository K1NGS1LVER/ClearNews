"""Fast initial data load: ingest + parallel fetch + NLP + cluster + metrics.

Runs all pipeline stages with parallelism where possible so a fresh DB
is populated in under a minute instead of 30+.

Run: uv run python -m pipeline.bootstrap
"""

import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from app.db import SessionLocal, engine
from app.models import Base
from pipeline.cluster import run_clustering
from pipeline.fetch_content import DEFAULT_WORKERS, run_fetch_parallel, run_backfill_story_images
from pipeline.ingest import ingest_latest
from pipeline.metrics import run_metrics
from pipeline.nlp import _embedder, process_all
from pipeline.topics import run_topics


def _ensure_db():
    Base.metadata.create_all(engine)


def bootstrap() -> dict:
    _ensure_db()

    # 1. ingest latest GDELT file
    print("ingesting latest GDELT data...")
    n_articles = ingest_latest()
    print(f"inserted {n_articles} new articles")

    if n_articles == 0:
        with SessionLocal() as session:
            from sqlalchemy import func, select
            from app.models import Article

            total = session.execute(select(func.count(Article.id))).scalar()
            if total == 0:
                return {"error": "no articles available"}
            print(f"using {total} existing articles")

    # 2. warm the embedder in background while we fetch content
    print("warming NLP models in background...")
    with ThreadPoolExecutor(max_workers=1) as pool:
        model_future = pool.submit(_embedder)

        # 3. parallel content fetch (I/O-bound, overlaps with model loading)
        print(f"fetching article content ({DEFAULT_WORKERS} workers)...")
        fetch_result = run_fetch_parallel(limit=500, workers=DEFAULT_WORKERS)
        print(f"fetched: {fetch_result}")

    model_future.result()  # ensure model is ready

    # 4. NLP enrichment (CPU-bound: embeddings, sentiment, bias, NER)
    print("running NLP enrichment...")
    nlp_result = process_all()
    print(f"enriched {nlp_result} articles")

    # 5. cluster articles into stories
    print("clustering into stories...")
    with SessionLocal() as session:
        cluster_result = run_clustering(session)
    print(f"clustering: {cluster_result}")

    # 6. metrics + topics (needs stories to exist)
    print("computing metrics and topics...")
    metrics_result = run_metrics()
    print(f"metrics: {metrics_result}")
    topics_result = run_topics()
    print(f"topics: {topics_result}")

    # 7. backfill story hero images (articles fetched above may not all have images)
    print("backfilling story images...")
    images_result = run_backfill_story_images(limit=200)
    print(f"images: {images_result}")

    # 7. backfill historical data (optional, in background)
    print("backfilling 7 days of history (background)...")
    subprocess.Popen(
        [sys.executable, "-m", "pipeline.backfill", "7", "2"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    return {
        "articles_inserted": n_articles,
        "fetch": fetch_result,
        "nlp": nlp_result,
        "clustering": cluster_result,
        "metrics": metrics_result,
        "topics": topics_result,
    }


if __name__ == "__main__":
    result = bootstrap()
    print(f"\nbootstrap complete: {result}")
