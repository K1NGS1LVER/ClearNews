"""Fetch article text and hero image with trafilatura.

Fills `articles.content` so the app can show readable articles and the
NLP pipeline can work on full text instead of titles. The same fetch also
pulls the page's og:image into `articles.image_url` for story thumbnails.

Run: uv run python -m pipeline.fetch_content [limit]
     uv run python -m pipeline.fetch_content images [story_limit]
"""

import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Article, Story

DEFAULT_BATCH = 50  # politeness cap per run; hourly job catches up over time
IMAGE_TRIES_PER_STORY = 3  # newest articles to try before giving up on a story


def extract_content_and_image(url: str) -> tuple[str | None, str | None]:
    import trafilatura

    html = trafilatura.fetch_url(url)
    if not html:
        return None, None
    text = trafilatura.extract(html, include_comments=False, favor_precision=True)
    meta = trafilatura.extract_metadata(html, default_url=url)
    return text, (meta.image if meta else None)


def fetch_article(session, article: Article) -> bool:
    """Fetch one article's text + image. Content failures are marked with ''
    so they are not retried; image_url is only set once, from whichever
    fetch first turns one up."""
    text = image = None
    try:
        text, image = extract_content_and_image(article.url)
    except Exception as exc:  # network/parse errors: skip, don't crash the batch
        print(f"fetch failed for {article.url}: {exc}")
    if article.content is None:
        article.content = text or ""
    if image and not article.image_url:
        article.image_url = image
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


def run_backfill_story_images(limit: int = DEFAULT_BATCH) -> dict:
    """Give every story a hero image, independent of the content backfill's
    pace: try a story's newest articles (skipping ones content already
    failed on) until one has an og:image, then move on."""
    with SessionLocal() as session:
        stories = (
            session.execute(
                select(Story)
                .where(~Story.articles.any(Article.image_url.isnot(None)))
                .order_by(Story.last_seen.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )
        found = 0
        for story in stories:
            candidates = sorted(story.articles, key=lambda a: a.published_at, reverse=True)
            for article in candidates[:IMAGE_TRIES_PER_STORY]:
                fetch_article(session, article)
                if article.image_url:
                    found += 1
                    break
        return {"stories_checked": len(stories), "images_found": found}


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "images":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_BATCH
        print(run_backfill_story_images(n))
    else:
        n = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BATCH
        print(run_fetch(n))
