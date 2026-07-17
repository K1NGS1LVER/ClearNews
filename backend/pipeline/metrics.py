"""Nightly analytics: per-story daily metrics, drift, outlet mean bias, status.

Run: uv run python -m pipeline.metrics
"""

import json
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Sequence

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Article, Outlet, Story, StoryDailyMetric

FADING_AFTER = timedelta(days=2)
DEAD_AFTER = timedelta(days=5)
# a country must be mentioned by at least this share of a story's articles to
# count as what the story is "about" - filters out one outlet's passing
# mention of a country that isn't actually the story's subject
ABOUT_COUNTRY_THRESHOLD = 0.3


def compute_about_countries(articles: Sequence[Article]) -> list[str]:
    if not articles:
        return []
    counts: defaultdict[str, int] = defaultdict(int)
    for a in articles:
        for code in a.mentioned_countries or []:
            counts[code] += 1
    threshold = ABOUT_COUNTRY_THRESHOLD * len(articles)
    return sorted(code for code, n in counts.items() if n >= threshold)


def daily_drift(day_embeddings: dict) -> dict:
    """Distance between consecutive daily centroids. day -> drift score."""
    days = sorted(day_embeddings)
    centroids = {d: np.mean(day_embeddings[d], axis=0) for d in days}
    return {
        d: float(np.linalg.norm(centroids[d] - centroids[prev]))
        for prev, d in zip(days, days[1:])
    }


def compute_story_metrics(session: Session, story: Story) -> None:
    articles = (
        session.execute(select(Article).where(Article.story_id == story.id))
        .scalars()
        .all()
    )
    by_day = defaultdict(list)
    for a in articles:
        by_day[a.published_at.date()].append(a)

    haystack_parts = [story.title.lower()]
    for a in articles:
        if a.entities:
            haystack_parts.append(json.dumps(a.entities).lower())
        if a.themes:
            haystack_parts.append(json.dumps(a.themes).lower())
    story.keyword_haystack = " ".join(haystack_parts)
    story.about_countries = compute_about_countries(articles)

    day_embeddings = {
        d: np.array([a.embedding for a in arts if a.embedding is not None])
        for d, arts in by_day.items()
    }
    drift = daily_drift({d: e for d, e in day_embeddings.items() if len(e)})

    rows = []
    for day, arts in by_day.items():
        sentiments = [a.sentiment for a in arts if a.sentiment is not None]
        labels = [a.bias_label for a in arts if a.bias_label]
        n_labels = len(labels) or 1
        rows.append(
            {
                "story_id": story.id,
                "day": day,
                "article_count": len(arts),
                "unique_outlets": len({a.outlet_id for a in arts}),
                "sentiment_mean": float(np.mean(sentiments)) if sentiments else None,
                "drift_score": drift.get(day),
                "bias_left_share": labels.count("left") / n_labels,
                "bias_center_share": labels.count("center") / n_labels,
                "bias_right_share": labels.count("right") / n_labels,
            }
        )
    if rows:
        stmt = pg_insert(StoryDailyMetric).values(rows)
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=["story_id", "day"],
                set_={
                    c: stmt.excluded[c]
                    for c in rows[0]
                    if c not in ("story_id", "day")
                },
            )
        )


def forecast_volume(counts: list[int], horizon: int = 3) -> list[int]:
    """Project daily article counts `horizon` days ahead.

    Log-linear trend fit over the last week of counts - news volume decays
    (or grows) roughly exponentially, so a line in log space is the honest
    minimal model. Needs 2+ days; clips at zero. Returns integers because
    you cannot publish a fraction of an article.
    """
    if len(counts) < 2:
        return []
    recent = counts[-7:]  # cap at one week to avoid stale trends dominating
    x = np.arange(len(recent))
    slope, intercept = np.polyfit(x, np.log1p(recent), 1)  # log-linear fit
    future = np.arange(len(recent), len(recent) + horizon)
    predicted = np.expm1(slope * future + intercept)  # back to linear space
    return [max(0, int(round(p))) for p in predicted]  # round to whole articles, floor at zero


def update_story_status(story: Story, now: datetime) -> None:
    age = now - story.last_seen
    story.status = (
        "dead" if age > DEAD_AFTER else "fading" if age > FADING_AFTER else "active"
    )


def run_metrics() -> dict:
    now = datetime.now(UTC)
    with SessionLocal() as session:
        stories = session.execute(select(Story)).scalars().all()
        for story in stories:
            compute_story_metrics(session, story)
            update_story_status(story, now)

        # outlet mean bias across all scored articles
        session.execute(
            Outlet.__table__.update().values(
                mean_bias=select(func.avg(Article.bias_score))
                .where(Article.outlet_id == Outlet.id, Article.bias_score.isnot(None))
                .scalar_subquery()
            )
        )
        session.commit()
        return {"stories": len(stories)}


if __name__ == "__main__":
    print(run_metrics())
