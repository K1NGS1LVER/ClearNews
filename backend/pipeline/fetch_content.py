"""Fetch and extract full article text with trafilatura.

Fills `articles.content` so the app can show readable articles and the
NLP pipeline can work on full text instead of titles.

Run: uv run python -m pipeline.fetch_content [limit]
"""

import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Article

DEFAULT_BATCH = 50  # politeness cap per run; hourly job catches up over time


def extract_from_url(url: str) -> str | None:
    import trafilatura

    html = trafilatura.fetch_url(url)
    if not html:
        return None
    return trafilatura.extract(html, include_comments=False, favor_precision=True)


def fetch_article(session, article: Article) -> bool:
    """Fetch one article's text. Marks failures with '' so they are not retried."""
    text = None
    try:
        text = extract_from_url(article.url)
    except Exception as exc:  # network/parse errors: skip, don't crash the batch
        print(f"fetch failed for {article.url}: {exc}")
    article.content = text or ""
    session.commit()
    return bool(text)


def run_fetch(limit: int = DEFAULT_BATCH) -> dict:
    with SessionLocal() as session:
        articles = (
            session.execute(
                select(Article)
                .where(Article.content.is_(None), Article.story_id.isnot(None))
                .order_by(Article.published_at.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )
        ok = sum(fetch_article(session, a) for a in articles)
        return {"attempted": len(articles), "extracted": ok}


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BATCH
    print(run_fetch(n))
