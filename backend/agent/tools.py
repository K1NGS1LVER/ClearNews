"""Retrieval tools for the ClearNews chat agent.

Every article-returning tool emits the same source dict shape so the API
layer can build one citation map from whatever the agent retrieved.
"""

from langchain_core.tools import tool
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Article, Story


def _source(a: Article) -> dict:
    return {
        "article_id": a.id,
        "story_id": a.story_id,
        "title": a.title,
        "url": a.url,
        "outlet": a.outlet.domain,
        "published_at": a.published_at.date().isoformat(),
        "bias_label": a.bias_label,
        "sentiment": a.sentiment,
    }


def _semantic_search(query: str, story_id: int | None, limit: int) -> list[dict]:
    from pipeline.nlp import _embedder

    vec = _embedder().encode(query)
    with SessionLocal() as session:
        q = (
            select(Article)
            .where(Article.embedding.isnot(None))
            .order_by(Article.embedding.cosine_distance(vec))
            .limit(limit)
        )
        if story_id is not None:
            q = q.where(Article.story_id == story_id)
        return [_source(a) for a in session.execute(q).scalars().all()]


def make_search_story(story_id: int):
    """Story-scoped search tool, bound to one story id."""

    @tool
    def search_story(query: str) -> list[dict]:
        """Search this story's articles by meaning. Returns matching articles
        with article_id, title, url, outlet, date, bias label and sentiment.
        Cite articles as [article_id]."""
        return _semantic_search(query, story_id, limit=8)

    return search_story


@tool
def search_corpus(query: str) -> list[dict]:
    """Semantic search across ALL news articles in the archive. Returns
    matching articles with article_id, title, url, outlet, date, bias label
    and sentiment. Cite articles as [article_id]."""
    return _semantic_search(query, None, limit=8)


@tool
def get_story_arc(story_id: int) -> dict:
    """Get a story's structured lifecycle data: status, daily article counts,
    outlet diversity, mean sentiment, narrative drift score and left/center/
    right coverage shares per day. Use for analytical questions about how
    coverage evolved."""
    with SessionLocal() as session:
        story = session.get(Story, story_id)
        if not story:
            return {"error": f"no story with id {story_id}"}
        return {
            "story_id": story.id,
            "title": story.title,
            "status": story.status,
            "first_seen": story.first_seen.date().isoformat(),
            "last_seen": story.last_seen.date().isoformat(),
            "daily_metrics": [
                {
                    "day": m.day.isoformat(),
                    "articles": m.article_count,
                    "outlets": m.unique_outlets,
                    "sentiment": m.sentiment_mean,
                    "drift": m.drift_score,
                    "left_share": m.bias_left_share,
                    "center_share": m.bias_center_share,
                    "right_share": m.bias_right_share,
                }
                for m in sorted(story.daily_metrics, key=lambda m: m.day)
            ],
        }


@tool
def list_stories(limit: int = 20) -> list[dict]:
    """List the biggest tracked stories (by coverage volume) with id, title,
    status, category and article count. Use to find a story id before calling
    get_story_arc. For a specific topic, prefer search_corpus - its results
    include each article's story_id."""
    # capped: dumping every story once blew Groq's per-request token limit
    limit = min(limit, 30)
    with SessionLocal() as session:
        rows = session.execute(
            select(
                Story.id, Story.title, Story.status, Story.category,
                func.count(Article.id).label("n"),
            )
            .join(Article, Article.story_id == Story.id)
            .group_by(Story.id)
            .order_by(func.count(Article.id).desc())
            .limit(limit)
        ).all()
        return [
            {
                "story_id": sid,
                "title": title,
                "status": status,
                "category": category,
                "articles": n,
            }
            for sid, title, status, category, n in rows
        ]
