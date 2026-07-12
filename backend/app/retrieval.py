"""Hybrid archive retrieval shared by HTTP search and agent tools."""

from collections.abc import Callable

from sqlalchemy import func, select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session, defer, joinedload

from app.models import Article

VECTOR_CANDIDATES = 30
FTS_CANDIDATES = 30
RRF_K = 60


def rrf_fuse(*rankings: list[int], limit: int, k: int = RRF_K) -> list[int]:
    """Return ids ordered by reciprocal-rank fusion (one-based ranks)."""
    scores: dict[int, float] = {}
    best_rank: dict[int, int] = {}
    for ranking in rankings:
        for rank, article_id in enumerate(ranking, start=1):
            scores[article_id] = scores.get(article_id, 0.0) + 1.0 / (k + rank)
            best_rank[article_id] = min(best_rank.get(article_id, rank), rank)
    return sorted(scores, key=lambda article_id: (-scores[article_id], best_rank[article_id], article_id))[:limit]


def hybrid_search(
    db: Session,
    query: str,
    *,
    limit: int = 20,
    story_id: int | None = None,
    embed: Callable[[str], object] | None = None,
) -> list[Article]:
    """Fuse semantic and lexical rankings with reciprocal-rank fusion.

    A candidate may come from either ranking, which preserves exact keyword
    recovery without throwing away semantic-only matches.
    """
    cleaned = query.strip()
    if not cleaned or limit <= 0:
        return []
    filters = []
    if story_id is not None:
        filters.append(Article.story_id == story_id)

    if embed is None:
        from pipeline.nlp import _embedder
        embed = _embedder().encode
    vec = embed(cleaned)
    vector_rows = db.execute(
        select(Article.id)
        .where(Article.embedding.isnot(None), *filters)
        .order_by(Article.embedding.cosine_distance(vec), Article.id)
        .limit(VECTOR_CANDIDATES)
    ).scalars().all()

    tsquery = func.websearch_to_tsquery("simple", cleaned)
    document = Article.search_document
    try:
        text_rows = db.execute(
            select(Article.id)
            .where(document.op("@@")(tsquery), *filters)
            .order_by(func.ts_rank_cd(document, tsquery).desc(), Article.id)
            .limit(FTS_CANDIDATES)
        ).scalars().all()
    except ProgrammingError as exc:
        # Useful during a rolling deploy where an old worker sees the new code
        # before Alembic has added the generated column. Normal deployments use
        # the indexed branch above; this compatibility branch is not indexed.
        if "search_document" not in str(exc):
            raise
        db.rollback()
        document = func.to_tsvector(
            "simple", func.coalesce(Article.title, "") + " " + func.coalesce(Article.content, "")
        )
        text_rows = db.execute(
            select(Article.id)
            .where(document.op("@@")(tsquery), *filters)
            .order_by(func.ts_rank_cd(document, tsquery).desc(), Article.id)
            .limit(FTS_CANDIDATES)
        ).scalars().all()

    ids = rrf_fuse(vector_rows, text_rows, limit=limit)
    if not ids:
        return []
    rows = db.execute(
        select(Article).options(defer(Article.search_document), joinedload(Article.outlet)).where(Article.id.in_(ids))
    ).scalars().all()
    by_id = {article.id: article for article in rows}
    return [by_id[article_id] for article_id in ids if article_id in by_id]
