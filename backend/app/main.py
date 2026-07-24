"""ClearNews REST API.

Run: uv run uvicorn app.main:app --reload
"""

import json
import os
import tempfile
import threading
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.auth import current_user
from app.auth import router as auth_router
from app.cache import (
    bump_foryou_version, delete_key, foryou_key, foryou_version,
    get_json, set_json, umap_key,
)
from app.countries import SUPPORTED_COUNTRIES
from app.db import get_db
from app.models import (
    Article, ChatMessage as StoredChatMessage, ChatSession, Outlet, Story,
    StoryDailyMetric, StoryFeedback, User,
)
from app.ratelimit import (
    rate_limit_chat, rate_limit_suggest, rate_limit_summarise, rate_limit_voice_speak,
    rate_limit_voice_transcribe,
)  # protect LLM/voice endpoints from quota abuse
from app.retrieval import hybrid_search
from app.stock_images import pick_stock_image

# Several-second voice clip: generous headroom while still bounding the
# per-request temp file / memory use.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# /api/voice/speak is always called with a single sentence from a frontend
# sentence-buffer, never a whole answer, so this is a generous cap.
MAX_SPEAK_CHARS = 500

@asynccontextmanager
async def lifespan(_: FastAPI):
    # this process loads torch (search, agent) and sklearn (drift PCA);
    # two bundled OpenMP runtimes would segfault it under load
    from pipeline.scheduler import check_single_openmp
    from pipeline.nlp import _embedder

    from app.db import SessionLocal, engine
    from app.models import Article, Base

    Base.metadata.create_all(engine)
    check_single_openmp()

    # auto-bootstrap: if the DB has no articles, run the full pipeline
    with SessionLocal() as session:
        empty = session.execute(select(func.count(Article.id))).scalar() == 0
    if empty:
        import logging
        logging.getLogger("uvicorn").info("empty database detected, running bootstrap...")
        from pipeline.bootstrap import bootstrap
        bootstrap()

    threading.Thread(target=_embedder, daemon=True).start()
    yield


app = FastAPI(title="ClearNews API", lifespan=lifespan)
app.include_router(auth_router)

# Only needed when the frontend is served from a different origin than the
# API (e.g. static host + separate API host). The docker-compose setup and
# local dev (vite proxy) are same-origin and need none of this. Cookie auth
# requires allow_credentials plus an explicit origin list - "*" can't be
# combined with credentials per the CORS spec.
_frontend_origins = [o for o in os.getenv("FRONTEND_ORIGIN", "").split(",") if o]
if _frontend_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_frontend_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


class StoryCard(BaseModel):
    id: int
    title: str
    status: str
    first_seen: date
    last_seen: date
    article_count: int
    bias_left_share: float | None
    bias_center_share: float | None
    bias_right_share: float | None
    daily_counts: list[int]  # lifecycle sparkline
    image_url: str | None


class DailyMetric(BaseModel):
    day: date
    article_count: int
    unique_outlets: int
    sentiment_mean: float | None
    drift_score: float | None
    bias_left_share: float | None
    bias_center_share: float | None
    bias_right_share: float | None


class ArticleOut(BaseModel):
    id: int
    url: str
    title: str | None
    outlet: str
    published_at: date
    sentiment: float | None
    bias_label: str | None
    bias_score: float | None


class ForecastDay(BaseModel):
    day: date
    predicted_count: int  # integer: you cannot publish a fraction of an article


class StoryArc(BaseModel):
    id: int
    title: str
    status: str
    summary: str | None
    metrics: list[DailyMetric]
    forecast: list[ForecastDay]
    articles: list[ArticleOut]


class OutletRow(BaseModel):
    domain: str
    article_count: int
    sentiment_mean: float | None
    bias_mean: float | None
    outlet_overall_bias: float | None


class CountryInfo(BaseModel):
    code: str
    name: str
    source_article_count: int  # articles from outlets based in this country
    story_count: int  # stories about this country (Story.about_countries)


class FeedbackRequest(BaseModel):
    direction: str  # more | less


def _article_out(a: Article) -> ArticleOut:
    return ArticleOut(
        id=a.id,
        url=a.url,
        title=a.title,
        outlet=a.outlet.domain,
        published_at=a.published_at.date(),
        sentiment=a.sentiment,
        bias_label=a.bias_label,
        bias_score=a.bias_score,
    )


def _bulk_metrics(db: Session, story_ids: list[int]) -> dict[int, dict]:
    """Aggregate each story's daily metrics in one query instead of lazily
    loading the `daily_metrics` relationship per story (N+1 at feed scale)."""
    if not story_ids:
        return {}
    rows = db.execute(
        select(
            StoryDailyMetric.story_id,
            StoryDailyMetric.day,
            StoryDailyMetric.article_count,
            StoryDailyMetric.bias_left_share,
            StoryDailyMetric.bias_center_share,
            StoryDailyMetric.bias_right_share,
        )
        .where(StoryDailyMetric.story_id.in_(story_ids))
        .order_by(StoryDailyMetric.story_id, StoryDailyMetric.day)
    ).all()

    by_story: dict[int, list] = {}
    for row in rows:
        by_story.setdefault(row.story_id, []).append(row)

    out = {}
    for story_id, story_rows in by_story.items():
        total = sum(r.article_count for r in story_rows)
        # bias shares weighted by daily volume
        weight = lambda attr, rows=story_rows, total=total: (
            sum((getattr(r, attr) or 0) * r.article_count for r in rows) / total
            if total
            else None
        )
        out[story_id] = {
            "article_count": total,
            "daily_counts": [r.article_count for r in story_rows],
            "bias_left_share": weight("bias_left_share"),
            "bias_center_share": weight("bias_center_share"),
            "bias_right_share": weight("bias_right_share"),
        }
    return out


def _bulk_images(db: Session, story_ids: list[int]) -> dict[int, str]:
    """Most recent article image per story in one query (postgres DISTINCT
    ON), instead of loading every article per story to find one."""
    if not story_ids:
        return {}
    rows = db.execute(
        select(Article.story_id, Article.image_url)
        .where(Article.story_id.in_(story_ids), Article.image_url.isnot(None))
        .order_by(Article.story_id, Article.published_at.desc())
        .distinct(Article.story_id)
    ).all()
    return {row.story_id: row.image_url for row in rows}


def _bulk_source_countries(db: Session, story_ids: list[int]) -> dict[int, set[str]]:
    """Distinct outlet countries (published-from) per story, one query."""
    if not story_ids:
        return {}
    rows = db.execute(
        select(Article.story_id, Outlet.country)
        .join(Outlet, Article.outlet_id == Outlet.id)
        .where(Article.story_id.in_(story_ids), Outlet.country.isnot(None))
        .distinct()
    ).all()
    out: dict[int, set[str]] = defaultdict(set)
    for row in rows:
        out[row.story_id].add(row.country)
    return out


def _source_country_filter(country: str):
    """Stories with >=1 article from an outlet based in `country`."""
    return Story.id.in_(
        select(Article.story_id)
        .join(Outlet, Article.outlet_id == Outlet.id)
        .where(Outlet.country == country)
    )


@app.get("/api/countries", response_model=list[CountryInfo])
def list_countries(db: Session = Depends(get_db)):
    """Every supported country plus how much data actually exists for it -
    the frontend uses this to populate selectors and drive the empty-state
    message for countries with little/no coverage yet."""
    source_counts = dict(
        db.execute(
            select(Outlet.country, func.count(Article.id))
            .join(Article, Article.outlet_id == Outlet.id)
            .where(Outlet.country.isnot(None))
            .group_by(Outlet.country)
        ).all()
    )
    about_counts: dict[str, int] = defaultdict(int)
    rows = db.execute(
        select(Story.about_countries).where(Story.about_countries.isnot(None))
    ).all()
    for (about,) in rows:
        for code in about or []:
            about_counts[code] += 1

    return [
        CountryInfo(
            code=code,
            name=name,
            source_article_count=source_counts.get(code, 0),
            story_count=about_counts.get(code, 0),
        )
        for code, name in sorted(SUPPORTED_COUNTRIES.items(), key=lambda kv: kv[1])
    ]


@app.get("/api/stories", response_model=list[StoryCard])
def list_stories(
    status: str | None = None,
    source_country: str | None = None,
    about_country: str | None = None,
    limit: int = 60,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = select(Story.id, Story.title, Story.status, Story.first_seen, Story.last_seen, Story.category)
    if status:
        q = q.where(Story.status == status)
    if source_country:
        q = q.where(_source_country_filter(source_country))
    if about_country:
        q = q.where(Story.about_countries.contains([about_country]))
    stories = db.execute(q).all()

    story_ids = [s.id for s in stories]
    metrics = _bulk_metrics(db, story_ids)
    images = _bulk_images(db, story_ids)

    cards = []
    for s in stories:
        m = metrics.get(s.id)
        if m is None:  # no daily metrics computed yet - not feed-ready
            continue
        cards.append(
            StoryCard(
                id=s.id,
                title=s.title,
                status=s.status,
                first_seen=s.first_seen.date(),
                last_seen=s.last_seen.date(),
                article_count=m["article_count"],
                bias_left_share=m["bias_left_share"],
                bias_center_share=m["bias_center_share"],
                bias_right_share=m["bias_right_share"],
                daily_counts=m["daily_counts"],
                image_url=images.get(s.id) or pick_stock_image(s.id, s.category),
            )
        )
    cards.sort(key=lambda c: c.article_count, reverse=True)
    # ponytail: paginating the already-sorted list, not the SQL query - the
    # metrics bulk-fetch above still runs for the full matched set. Fine at
    # today's story counts; move the sort/limit into SQL if this endpoint
    # becomes a bottleneck.
    return cards[offset : offset + limit]


class ForYouCard(StoryCard):
    category: str | None
    size: str  # hero | standard | compact
    matched: list[str]


def score_story(
    *,
    category: str | None,
    status: str,
    days_since_seen: float,
    bias_left_share: float | None,
    bias_right_share: float | None,
    haystack: str,
    favourite_category: str | None,
    categories: list[str],
    keywords: list[str],
    bias_pref: str,
    category_weights: dict[str, float] | None = None,
    story_countries: set[str] | None = None,
    user_countries: set[str] | None = None,
) -> tuple[float, list[str]]:
    """Pure ranking score for a story card given a user's preferences.

    Returns (score, matched_keywords).
    """
    score = 0.0
    if category and category == favourite_category:
        score += 3.0
    elif category and category in categories:
        score += 1.5

    # nudge from the For You 3-dot "more/less like this" menu (main.py's
    # story_feedback endpoint), independent of the coarse onboarding pick above
    if category_weights and category:
        score += category_weights.get(category, 0.0)

    matched = [kw for kw in keywords if kw.lower() in haystack]
    score += min(2.0, 1.0 * len(matched))

    score += 2.0 / (1 + max(days_since_seen, 0))

    if status == "active":
        score += 0.5

    # story_countries covers both source (published-from) and about
    # (content-about) countries - either kind of match counts
    if user_countries and story_countries and (story_countries & user_countries):
        score += 1.5

    left = bias_left_share or 0.0
    right = bias_right_share or 0.0
    skew = abs(left - right)
    if bias_pref == "balanced":
        score += 0.75 * (1 - skew)
    elif bias_pref == "challenge":
        score += 0.75 * skew
    # "everything": no bias adjustment

    return score, matched


@app.get("/api/foryou", response_model=list[ForYouCard])
def for_you(
    source_country: str | None = None,
    about_country: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    cache_key = f"{foryou_key(user.id)}:v{foryou_version()}"
    cached = get_json(cache_key)
    if cached is not None:
        return [ForYouCard(**c) for c in cached]

    from datetime import UTC, datetime

    now = datetime.now(UTC)
    q = select(
        Story.id,
        Story.title,
        Story.status,
        Story.first_seen,
        Story.last_seen,
        Story.category,
        Story.keyword_haystack,
        Story.about_countries,
    )
    if source_country:
        q = q.where(_source_country_filter(source_country))
    if about_country:
        q = q.where(Story.about_countries.contains([about_country]))

    hidden_ids = set(
        db.execute(
            select(StoryFeedback.story_id).where(
                StoryFeedback.user_id == user.id, StoryFeedback.direction == "less"
            )
        )
        .scalars()
        .all()
    )
    if hidden_ids:
        q = q.where(Story.id.notin_(hidden_ids))

    stories = db.execute(q).all()

    favourite_category = user.favourite_category
    categories = user.categories or []
    keywords = [k.lower() for k in (user.keywords or [])]
    bias_pref = user.bias_pref
    category_weights = user.category_weights or {}
    user_countries = set(user.countries or [])

    story_ids = [s.id for s in stories]
    metrics = _bulk_metrics(db, story_ids)
    images = _bulk_images(db, story_ids)
    source_countries = _bulk_source_countries(db, story_ids)

    scored: list[tuple[float, list[str], Any, StoryCard]] = []
    for s in stories:
        m = metrics.get(s.id)
        if m is None:  # no daily metrics computed yet - not feed-ready
            continue
        card = StoryCard(
            id=s.id,
            title=s.title,
            status=s.status,
            first_seen=s.first_seen.date(),
            last_seen=s.last_seen.date(),
            article_count=m["article_count"],
            bias_left_share=m["bias_left_share"],
            bias_center_share=m["bias_center_share"],
            bias_right_share=m["bias_right_share"],
            daily_counts=m["daily_counts"],
            image_url=images.get(s.id) or pick_stock_image(s.id, s.category),
        )
        # kept current by pipeline/metrics.py; falls back to just the title
        # until the next metrics run if a story predates that column
        haystack = s.keyword_haystack or s.title.lower()
        days_since_seen = (now - s.last_seen).total_seconds() / 86400.0
        story_countries = source_countries.get(s.id, set()) | set(s.about_countries or [])

        score, matched = score_story(
            category=s.category,
            status=s.status,
            days_since_seen=days_since_seen,
            bias_left_share=card.bias_left_share,
            bias_right_share=card.bias_right_share,
            haystack=haystack,
            favourite_category=favourite_category,
            categories=categories,
            keywords=keywords,
            bias_pref=bias_pref,
            category_weights=category_weights,
            story_countries=story_countries,
            user_countries=user_countries,
        )
        scored.append((score, matched, s, card))

    scored.sort(key=lambda t: t[0], reverse=True)

    followed = set(categories)
    top = scored[:25]
    top_ids = {s.id for _, _, s, _ in top}
    # ponytail: fixed 25+5 blend, tune if bubbly
    outside = [t for t in scored if t[2].id not in top_ids and t[2].category not in followed][:5]
    blended = top + outside

    cards = []
    best_favourite_id = None
    if favourite_category:
        favourite_hits = [t for t in blended if t[2].category == favourite_category]
        if favourite_hits:
            best_favourite_id = max(favourite_hits, key=lambda t: t[0])[2].id

    # rank-based, not absolute-score-based: score_story's max achievable score
    # for a user with no favourite_category is ~3.25, below the old >=3.5 hero
    # cutoff, so every cold/new user's grid rendered as a single flat tier.
    # blended is already score-sorted (top, then outside), so position is a
    # reliable proxy and always yields real hero/standard/compact variety.
    for idx, (score, matched, s, card) in enumerate(blended):
        if s.id == best_favourite_id or idx < 3:
            size = "hero"
        elif idx < 10:
            size = "standard"
        else:
            size = "compact"
        cards.append(
            ForYouCard(
                **card.model_dump(),
                category=s.category,
                size=size,
                matched=matched,
            )
        )
    set_json(cache_key, [c.model_dump() for c in cards], 600)
    return cards


@app.post("/api/stories/{story_id}/feedback")
def story_feedback(
    story_id: int,
    req: FeedbackRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """'More/less like this' from the For You 3-dot menu: 'less' hides the
    story from this user's feed immediately (see the hidden_ids filter in
    for_you above); both directions nudge the story's category weight,
    a later 'more' un-hiding a previously-'less'd story via upsert."""
    if req.direction not in ("more", "less"):
        raise HTTPException(400, "invalid direction")
    story = db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "story not found")

    stmt = pg_insert(StoryFeedback).values(
        user_id=user.id, story_id=story_id, direction=req.direction
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "story_id"],
        set_={"direction": stmt.excluded.direction, "created_at": func.now()},
    )
    db.execute(stmt)

    if story.category:
        weights = dict(user.category_weights or {})
        delta = 0.5 if req.direction == "more" else -0.5
        weights[story.category] = max(
            -2.0, min(2.0, weights.get(story.category, 0.0) + delta)
        )
        user.category_weights = weights

    db.commit()
    # Invalidate this user's ForYou cache (version key includes the current
    # generation, so deleting the versioned key is sufficient).
    delete_key(f"{foryou_key(user.id)}:v{foryou_version()}")
    return {"ok": True}


@app.get("/api/stories/{story_id}/arc", response_model=StoryArc)
def story_arc(story_id: int, db: Session = Depends(get_db)):
    from datetime import timedelta

    from pipeline.metrics import forecast_volume

    story = db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "story not found")
    metrics = sorted(story.daily_metrics, key=lambda m: m.day)
    articles = sorted(story.articles, key=lambda a: a.published_at)

    predicted = forecast_volume([m.article_count for m in metrics])
    last_day = metrics[-1].day if metrics else None
    forecast = [
        ForecastDay(day=last_day + timedelta(days=i + 1), predicted_count=p)
        for i, p in enumerate(predicted)
    ]

    return StoryArc(
        id=story.id,
        title=story.title,
        status=story.status,
        summary=story.summary,
        metrics=[DailyMetric.model_validate(m, from_attributes=True) for m in metrics],
        forecast=forecast,
        articles=[_article_out(a) for a in articles],
    )


@app.get("/api/stories/{story_id}/outlets", response_model=list[OutletRow])
def story_outlets(story_id: int, db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            Outlet.domain,
            func.count(Article.id),
            func.avg(Article.sentiment),
            func.avg(Article.bias_score),
            Outlet.mean_bias,
        )
        .join(Article, Article.outlet_id == Outlet.id)
        .where(Article.story_id == story_id)
        .group_by(Outlet.domain, Outlet.mean_bias)
        .order_by(func.count(Article.id).desc())
    ).all()
    return [
        OutletRow(
            domain=d,
            article_count=n,
            sentiment_mean=s,
            bias_mean=b,
            outlet_overall_bias=ob,
        )
        for d, n, s, b, ob in rows
    ]


class ExplanationArticle(BaseModel):
    id: int
    title: str | None
    outlet: str
    bias_label: str | None
    explained: bool
    probs: dict[str, float] | None = None
    predicted: str | None = None
    tokens: list[str] | None = None
    values: list[list[float]] | None = None


class TopWord(BaseModel):
    word: str
    value: float
    articles: int


class ExplanationAggregate(BaseModel):
    label_counts: dict[str, int]
    probs: dict[str, float]
    top_words: dict[str, list[TopWord]]


class StoryExplanationOut(BaseModel):
    status: str  # none | partial | complete
    eligible: int
    total: int
    analyzed: int
    as_of: str | None
    stale: bool
    articles: list[ExplanationArticle]
    aggregate: ExplanationAggregate | None


def _explanation_state(story: Story) -> StoryExplanationOut:
    from datetime import datetime as dt

    from pipeline.explain import EXPLANATION_VERSION
    from pipeline.explain import aggregate as aggregate_words

    eligible_articles = [a for a in story.articles if a.bias_label]
    eligible = len(eligible_articles)

    selection = story.bias_explanation
    if not selection or selection.get("version") != EXPLANATION_VERSION:
        return StoryExplanationOut(
            status="none", eligible=eligible, total=0, analyzed=0,
            as_of=None, stale=False, articles=[], aggregate=None,
        )

    id_order = {aid: i for i, aid in enumerate(selection["article_ids"])}
    selected = sorted(
        (a for a in eligible_articles if a.id in id_order), key=lambda a: id_order[a.id]
    )

    payloads = []
    out_articles = []
    for a in selected:
        payload = a.bias_explanation
        if payload and payload.get("version") != EXPLANATION_VERSION:
            payload = None
        if payload:
            payloads.append(payload)
        out_articles.append(
            ExplanationArticle(
                id=a.id,
                title=a.title,
                outlet=a.outlet.domain,
                bias_label=a.bias_label,
                explained=payload is not None,
                probs=payload["probs"] if payload else None,
                predicted=payload["predicted"] if payload else None,
                tokens=payload["tokens"] if payload else None,
                values=payload["values"] if payload else None,
            )
        )

    total = len(selected)
    analyzed = len(payloads)
    status = "complete" if total and analyzed == total else "partial"

    as_of_dt = dt.fromisoformat(selection["as_of"])
    stale = any(
        a.id not in id_order and a.published_at > as_of_dt for a in eligible_articles
    )

    return StoryExplanationOut(
        status=status,
        eligible=eligible,
        total=total,
        analyzed=analyzed,
        as_of=selection["as_of"],
        stale=stale,
        articles=out_articles,
        aggregate=ExplanationAggregate(**aggregate_words(payloads)) if payloads else None,
    )


@app.get("/api/stories/{story_id}/explanation", response_model=StoryExplanationOut)
def story_explanation(story_id: int, db: Session = Depends(get_db)):
    story = db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "story not found")
    return _explanation_state(story)


class ExplainStepRequest(BaseModel):
    refresh: bool = False


@app.post("/api/stories/{story_id}/explanation/step", response_model=StoryExplanationOut)
def story_explanation_step(
    story_id: int, req: ExplainStepRequest = ExplainStepRequest(), db: Session = Depends(get_db)
):
    """Explain one article toward this story's lean summary. Call repeatedly
    until status is "complete" - each call does at most one SHAP compute
    (~15-60s) so it stays inside a normal HTTP timeout."""
    from datetime import UTC, datetime as dt

    from pipeline.explain import EXPLANATION_VERSION, compute_lock, explain_text, select_articles
    from pipeline.nlp import _text_of

    story = db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "story not found")

    eligible_articles = [a for a in story.articles if a.bias_label]
    if not eligible_articles:
        raise HTTPException(409, "story has no labeled articles to explain")

    selection = story.bias_explanation
    if req.refresh or not selection or selection.get("version") != EXPLANATION_VERSION:
        selected = select_articles(story)
        story.bias_explanation = {
            "version": EXPLANATION_VERSION,
            "article_ids": [a.id for a in selected],
            "as_of": dt.now(UTC).isoformat(),
        }
        db.commit()
    else:
        id_order = {aid: i for i, aid in enumerate(selection["article_ids"])}
        selected = sorted(
            (a for a in eligible_articles if a.id in id_order), key=lambda a: id_order[a.id]
        )

    pending = next(
        (
            a
            for a in selected
            if not a.bias_explanation or a.bias_explanation.get("version") != EXPLANATION_VERSION
        ),
        None,
    )
    if pending is not None:
        text = _text_of(pending)
        with compute_lock:
            db.refresh(pending)
            already_done = (
                pending.bias_explanation
                and pending.bias_explanation.get("version") == EXPLANATION_VERSION
            )
            if not already_done:
                pending.bias_explanation = explain_text(text)
                db.commit()

    db.refresh(story)
    return _explanation_state(story)


@app.get("/api/search", response_model=list[ArticleOut])
def semantic_search(q: str, limit: int = 20, db: Session = Depends(get_db)):
    return [_article_out(a) for a in hybrid_search(db, q, limit=min(max(limit, 1), 100))]


class ArticleDetail(ArticleOut):
    content: str | None
    story_id: int | None
    story_title: str | None


@app.get("/api/articles/{article_id}", response_model=ArticleDetail)
def article_detail(article_id: int, db: Session = Depends(get_db)):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(404, "article not found")

    if article.content is None:  # not fetched yet; '' means fetch failed before
        from pipeline.fetch_content import fetch_article

        fetch_article(db, article)

    return ArticleDetail(
        **_article_out(article).model_dump(),
        content=article.content or None,
        story_id=article.story_id,
        story_title=article.story.title if article.story else None,
    )


@app.get("/api/stories/{story_id}/drift")
def story_drift(story_id: int, db: Session = Depends(get_db)):
    """Article positions in 2D embedding space + daily centroid trajectory."""
    ck = umap_key(story_id)
    cached = get_json(ck)
    if cached is not None:
        return cached

    import numpy as np

    from pipeline.viz import daily_centroids, umap_2d

    story = db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "story not found")
    articles = [a for a in story.articles if a.embedding is not None]
    if len(articles) < 2:
        return {"points": [], "trajectory": []}

    coords = umap_2d(np.array([a.embedding for a in articles]))
    days = [a.published_at.date() for a in articles]
    result = {
        "points": [
            {
                "article_id": a.id,
                "title": a.title,
                "outlet": a.outlet.domain,
                "day": d.isoformat(),
                "bias_label": a.bias_label,
                "x": float(x),
                "y": float(y),
            }
            for a, d, (x, y) in zip(articles, days, coords)
        ],
        "trajectory": daily_centroids(days, coords),
    }
    set_json(ck, result, 3600)
    return result


@app.get("/api/outlets/map")
def outlet_map(min_articles: int = 3, db: Session = Depends(get_db)):
    """Outlets projected by their mean article embedding, with bias and volume."""
    import numpy as np

    from pipeline.viz import umap_2d

    rows = db.execute(
        select(
            Outlet.id, Outlet.domain, Outlet.mean_bias, func.count(Article.id)
        )
        .join(Article, Article.outlet_id == Outlet.id)
        .where(Article.embedding.isnot(None))
        .group_by(Outlet.id)
        .having(func.count(Article.id) >= min_articles)
    ).all()
    if len(rows) < 2:
        return {"outlets": []}

    centroids = []
    for outlet_id, *_ in rows:
        embs = db.execute(
            select(Article.embedding).where(
                Article.outlet_id == outlet_id, Article.embedding.isnot(None)
            )
        ).scalars().all()
        centroids.append(np.mean(np.array(embs), axis=0))

    coords = umap_2d(np.array(centroids))
    return {
        "outlets": [
            {
                "domain": domain,
                "mean_bias": bias,
                "articles": n,
                "x": float(x),
                "y": float(y),
            }
            for (_, domain, bias, n), (x, y) in zip(rows, coords)
        ]
    }


class ChatRequest(BaseModel):
    session_id: int
    content: str


class CreateChatSessionRequest(BaseModel):
    story_id: int | None = None
    title: str | None = None


class RenameChatSessionRequest(BaseModel):
    title: str


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    citations: list | None
    created_at: str


class ChatSessionOut(BaseModel):
    id: int
    story_id: int | None
    title: str
    created_at: str
    updated_at: str
    messages: list[ChatMessageOut] | None = None


def _chat_session(db: Session, session_id: int, user_id: int) -> ChatSession:
    session = db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
    ).scalar_one_or_none()
    if not session:
        # Deliberately do not reveal whether another user's id exists.
        raise HTTPException(404, "chat session not found")
    return session


def _chat_session_out(session: ChatSession, include_messages: bool = False) -> ChatSessionOut:
    return ChatSessionOut(
        id=session.id, story_id=session.story_id, title=session.title,
        created_at=session.created_at.isoformat(), updated_at=session.updated_at.isoformat(),
        messages=[ChatMessageOut(id=m.id, role=m.role, content=m.content, citations=m.citations,
                                 created_at=m.created_at.isoformat()) for m in session.messages]
        if include_messages else None,
    )


@app.get("/api/chat/sessions", response_model=list[ChatSessionOut])
def list_chat_sessions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    sessions = db.execute(
        select(ChatSession).where(ChatSession.user_id == user.id).order_by(ChatSession.updated_at.desc())
    ).scalars().all()
    return [_chat_session_out(session) for session in sessions]


@app.post("/api/chat/sessions", response_model=ChatSessionOut, status_code=201)
def create_chat_session(req: CreateChatSessionRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if req.story_id is not None and not db.get(Story, req.story_id):
        raise HTTPException(404, "story not found")
    title = (req.title or "New conversation").strip()[:200] or "New conversation"
    session = ChatSession(user_id=user.id, story_id=req.story_id, title=title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return _chat_session_out(session)


@app.get("/api/chat/sessions/{session_id}", response_model=ChatSessionOut)
def read_chat_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    session = _chat_session(db, session_id, user.id)
    # relationship's defined ordering keeps the transcript deterministic.
    _ = session.messages
    return _chat_session_out(session, include_messages=True)


@app.patch("/api/chat/sessions/{session_id}", response_model=ChatSessionOut)
def rename_chat_session(session_id: int, req: RenameChatSessionRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    title = req.title.strip()[:200]
    if not title:
        raise HTTPException(400, "title is required")
    session = _chat_session(db, session_id, user.id)
    session.title = title
    db.commit()
    db.refresh(session)
    return _chat_session_out(session)


@app.delete("/api/chat/sessions/{session_id}")
def delete_chat_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    session = _chat_session(db, session_id, user.id)
    db.delete(session)
    db.commit()
    return {"ok": True}


@app.post("/api/chat", dependencies=[Depends(rate_limit_chat)])  # 20 req/min - protects Groq API quota
async def chat(req: ChatRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from agent.chat import stream_chat

    content = req.content.strip()
    if not content:
        raise HTTPException(400, "message is required")
    session = _chat_session(db, req.session_id, user.id)
    position = len(session.messages)
    db.add(StoredChatMessage(session_id=session.id, position=position, role="user", content=content))
    if session.title == "New conversation":
        session.title = content[:200]
    db.commit()
    # Build context only from this user's persisted session; client-provided
    # history cannot smuggle messages from another session into the prompt.
    history = [
        {"role": message.role, "content": message.content}
        for message in session.messages
    ]

    async def sse():
        answer: list[str] = []
        citations: list[dict] = []
        async for event in stream_chat(history, session.story_id):
            if event["type"] == "token":
                answer.append(event["content"])
            elif event["type"] == "sources":
                citations = event["sources"]
            elif event["type"] == "error":
                answer.append(("\n\n" if answer else "") + event["message"])
            yield f"data: {json.dumps(event)}\n\n"
        final = "".join(answer)
        if final:
            # The request dependency is closed after StreamingResponse returns;
            # use a short-lived session to persist the completed answer.
            from app.db import SessionLocal
            with SessionLocal() as write_db:
                write_db.add(StoredChatMessage(
                    session_id=req.session_id, position=position + 1, role="assistant",
                    content=final, citations=citations or None,
                ))
                stored = write_db.get(ChatSession, req.session_id)
                if stored:
                    from datetime import UTC, datetime
                    stored.updated_at = datetime.now(UTC)
                write_db.commit()
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")


@app.post("/api/voice/transcribe", dependencies=[Depends(rate_limit_voice_transcribe)])  # 20 req/min
async def transcribe_voice(file: UploadFile = File(...), user: User = Depends(current_user)):
    from av.error import FFmpegError

    from app import voice

    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        total = 0
        # Stream in chunks rather than `await file.read()`, so an oversized
        # upload is rejected without ever buffering the whole thing in memory.
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    413, f"audio too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)"
                )
            tmp.write(chunk)
        tmp.close()
        if total == 0:
            raise HTTPException(400, "empty audio upload")

        try:
            result = await run_in_threadpool(voice.transcribe, tmp.name)
        except FFmpegError:
            # Corrupt/non-audio upload: faster-whisper's PyAV decode step
            # raises av.error.FFmpegError (e.g. InvalidDataError) rather than
            # producing a transcript. The request itself was well-formed, so
            # this is a client error (422), not an opaque unhandled 500.
            import logging

            logging.getLogger("uvicorn").warning(
                "voice transcribe: upload could not be decoded as audio", exc_info=True
            )
            raise HTTPException(422, "could not process audio (corrupt or unsupported format)")
    finally:
        tmp.close()  # no-op if already closed above
        try:
            os.remove(tmp.name)
        except OSError:
            pass

    if result is None:
        raise HTTPException(503, "speech-to-text model unavailable")
    return result


class SpeakRequest(BaseModel):
    text: str
    voice: str | None = None


@app.post("/api/voice/speak", dependencies=[Depends(rate_limit_voice_speak)])  # 60 req/min
async def speak(req: SpeakRequest, user: User = Depends(current_user)):
    """Synthesize `req.text` to speech, streaming raw PCM as it's produced.

    Mono float32 samples at `voice.TTS_SAMPLE_RATE`, no container/header.
    Streaming (rather than a single buffered response) is the point of this
    endpoint: it lets playback start after the first sentence's audio is
    ready instead of waiting for the whole request to finish synthesizing.
    """
    from app import voice

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "text is required")
    if len(text) > MAX_SPEAK_CHARS:
        raise HTTPException(400, f"text too long (max {MAX_SPEAK_CHARS} characters)")

    if not await run_in_threadpool(voice.tts_is_available):
        raise HTTPException(503, "text-to-speech model unavailable")

    voice_id = req.voice or voice.TTS_VOICE

    # synthesize_stream()'s model inference is blocking CPU work per sentence;
    # StreamingResponse already runs a plain sync generator's next() calls
    # through iterate_in_threadpool internally, so each sentence's synthesis
    # never blocks the event loop while still streaming chunks out as
    # they're produced - no need to wrap it ourselves.
    return StreamingResponse(voice.synthesize_stream(text, voice_id), media_type="application/octet-stream")


@app.get("/api/suggest", dependencies=[Depends(rate_limit_suggest)])  # 10 req/min
def suggest(story_id: int | None = None, context: str = "", db: Session = Depends(get_db)):
    from agent.chat import suggest_questions

    if story_id and not context:
        story = db.get(Story, story_id)
        if not story:
            raise HTTPException(404, "story not found")
        titles = "\n".join(a.title or "" for a in story.articles[:30])
        context = f"News story: {story.title}\nArticles:\n{titles}"
    return {"questions": suggest_questions(context) if context else []}


@app.post("/api/summarise/{story_id}", dependencies=[Depends(rate_limit_summarise)])  # 5 req/min - most expensive call
async def summarise(story_id: int, db: Session = Depends(get_db)):
    from agent.chat import stream_chat

    story = db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "story not found")

    parts: list[str] = []
    async for event in stream_chat(
        [{"role": "user", "content": "Summarize this story's full arc."}], story_id
    ):
        if event["type"] == "token":
            parts.append(event["content"])
    summary = "".join(parts)
    story.summary = summary
    db.commit()
    return {"story_id": story_id, "summary": summary}


@app.get("/api/analytics")
def analytics(db: Session = Depends(get_db)):
    status_counts = dict(
        db.execute(select(Story.status, func.count()).group_by(Story.status)).all()
    )
    bias_counts = dict(
        db.execute(
            select(Article.bias_label, func.count())
            .where(Article.bias_label.isnot(None))
            .group_by(Article.bias_label)
        ).all()
    )
    lifespans = db.execute(
        select(
            func.avg(
                func.extract("epoch", Story.last_seen - Story.first_seen) / 86400.0
            )
        )
    ).scalar()
    by_category = db.execute(
        select(
            Story.category,
            func.count(),
            func.avg(
                func.extract("epoch", Story.last_seen - Story.first_seen) / 86400.0
            ),
        ).group_by(Story.category)
    ).all()
    at_risk = db.execute(
        select(Story.id, Story.title, Story.death_risk)
        .where(Story.death_risk.isnot(None))
        .order_by(Story.death_risk.desc())
        .limit(10)
    ).all()
    top_outlets = db.execute(
        select(Outlet.domain, func.count(Article.id), Outlet.mean_bias)
        .join(Article, Article.outlet_id == Outlet.id)
        .group_by(Outlet.domain, Outlet.mean_bias)
        .order_by(func.count(Article.id).desc())
        .limit(15)
    ).all()
    return {
        "stories_by_status": status_counts,
        "articles_by_bias": bias_counts,
        "avg_story_lifespan_days": lifespans,
        "by_category": [
            {"category": c or "general", "stories": n, "avg_lifespan_days": float(d or 0)}
            for c, n, d in by_category
        ],
        "top_death_risk": [
            {"story_id": i, "title": t, "death_risk": r} for i, t, r in at_risk
        ],
        "top_outlets": [
            {"domain": d, "articles": n, "mean_bias": b} for d, n, b in top_outlets
        ],
    }
