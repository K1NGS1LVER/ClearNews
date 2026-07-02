"""Group articles into stories with HDBSCAN over their embeddings.

Runs over a sliding window of recent articles (default 3 days), reclusters
the window, then reconciles clusters with existing stories by article
overlap so story ids stay stable across runs.

Run: uv run python -m pipeline.cluster
"""

# ponytail: full recluster of the window each run; incremental assignment
# (approximate_predict) if the window outgrows a few hundred thousand rows.

from collections import Counter
from datetime import UTC, datetime, timedelta

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Article, Story

WINDOW_DAYS = 3
MIN_CLUSTER_SIZE = 3


def cluster_embeddings(embeddings: np.ndarray, min_cluster_size: int = MIN_CLUSTER_SIZE) -> np.ndarray:
    """L2-normalize and cluster; returns HDBSCAN labels (-1 = noise)."""
    import hdbscan

    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    normalized = embeddings / np.clip(norms, 1e-12, None)
    clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean")
    return clusterer.fit_predict(normalized)


def central_index(embeddings: np.ndarray) -> int:
    """Index of the member closest to the cluster centroid."""
    centroid = embeddings.mean(axis=0)
    return int(np.linalg.norm(embeddings - centroid, axis=1).argmin())


def run_clustering(session: Session, window_days: int = WINDOW_DAYS) -> dict:
    since = datetime.now(UTC) - timedelta(days=window_days)
    articles = (
        session.execute(
            select(Article)
            .where(Article.embedding.isnot(None), Article.published_at >= since)
            .order_by(Article.id)
        )
        .scalars()
        .all()
    )
    if len(articles) < MIN_CLUSTER_SIZE:
        return {"articles": len(articles), "stories_created": 0, "assigned": 0}

    embeddings = np.array([a.embedding for a in articles])
    labels = cluster_embeddings(embeddings)

    created = 0
    assigned = 0
    for label in sorted(set(labels)):
        if label == -1:
            continue
        idx = np.where(labels == label)[0]
        members = [articles[i] for i in idx]

        # reuse the story most members already belong to, else create one
        existing = Counter(a.story_id for a in members if a.story_id is not None)
        if existing:
            story = session.get(Story, existing.most_common(1)[0][0])
        else:
            title_article = members[central_index(embeddings[idx])]
            story = Story(
                title=title_article.title or title_article.url,
                first_seen=min(a.published_at for a in members),
                last_seen=max(a.published_at for a in members),
            )
            session.add(story)
            session.flush()
            created += 1

        for a in members:
            if a.story_id != story.id:
                a.story_id = story.id
                assigned += 1
        story.first_seen = min(story.first_seen, min(a.published_at for a in members))
        story.last_seen = max(story.last_seen, max(a.published_at for a in members))

    session.commit()
    return {"articles": len(articles), "stories_created": created, "assigned": assigned}


if __name__ == "__main__":
    with SessionLocal() as s:
        print(run_clustering(s))
