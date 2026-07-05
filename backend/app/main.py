"""ClearNews REST API.

Run: uv run uvicorn app.main:app --reload
"""

import json
import threading
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.auth import router as auth_router
from app.db import get_db
from app.models import Article, Outlet, Story, User

@asynccontextmanager
async def lifespan(_: FastAPI):
    # this process loads torch (search, agent) and sklearn (drift PCA);
    # two bundled OpenMP runtimes would segfault it under load
    from pipeline.scheduler import check_single_openmp
    from pipeline.nlp import _embedder

    check_single_openmp()
    threading.Thread(target=_embedder, daemon=True).start()
    yield


app = FastAPI(title="ClearNews API", lifespan=lifespan)
app.include_router(auth_router)


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
    predicted_count: float


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


def _story_card(s: Story) -> StoryCard | None:
    metrics = sorted(s.daily_metrics, key=lambda m: m.day)
    if not metrics:
        return None
    total = sum(m.article_count for m in metrics)
    # bias shares weighted by daily volume
    weight = lambda attr: (
        sum((getattr(m, attr) or 0) * m.article_count for m in metrics) / total
        if total
        else None
    )
    imaged = sorted(
        (a for a in s.articles if a.image_url), key=lambda a: a.published_at, reverse=True
    )
    return StoryCard(
        id=s.id,
        title=s.title,
        status=s.status,
        first_seen=s.first_seen.date(),
        last_seen=s.last_seen.date(),
        article_count=total,
        bias_left_share=weight("bias_left_share"),
        bias_center_share=weight("bias_center_share"),
        bias_right_share=weight("bias_right_share"),
        daily_counts=[m.article_count for m in metrics],
        image_url=imaged[0].image_url if imaged else None,
    )


@app.get("/api/stories", response_model=list[StoryCard])
def list_stories(status: str | None = None, db: Session = Depends(get_db)):
    q = select(Story)
    if status:
        q = q.where(Story.status == status)
    stories = db.execute(q.order_by(Story.last_seen.desc())).scalars().all()

    cards = [c for s in stories if (c := _story_card(s)) is not None]
    cards.sort(key=lambda c: c.article_count, reverse=True)
    return cards


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
) -> tuple[float, list[str]]:
    """Pure ranking score for a story card given a user's preferences.

    Returns (score, matched_keywords).
    """
    score = 0.0
    if category and category == favourite_category:
        score += 3.0
    elif category and category in categories:
        score += 1.5

    matched = [kw for kw in keywords if kw.lower() in haystack]
    score += min(2.0, 1.0 * len(matched))

    score += 2.0 / (1 + max(days_since_seen, 0))

    if status == "active":
        score += 0.5

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
def for_you(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    stories = db.execute(select(Story)).scalars().all()

    favourite_category = user.favourite_category
    categories = user.categories or []
    keywords = [k.lower() for k in (user.keywords or [])]
    bias_pref = user.bias_pref

    scored: list[tuple[float, list[str], Story, StoryCard]] = []
    for s in stories:
        card = _story_card(s)
        if card is None:
            continue
        haystack_parts = [s.title.lower()]
        for a in s.articles:
            if a.entities:
                haystack_parts.append(json.dumps(a.entities).lower())
            if a.themes:
                haystack_parts.append(json.dumps(a.themes).lower())
        haystack = " ".join(haystack_parts)
        days_since_seen = (now - s.last_seen).total_seconds() / 86400.0

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

    for score, matched, s, card in blended:
        if s.id == best_favourite_id or score >= 3.5:
            size = "hero"
        elif score >= 1.5:
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
    return cards


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
    from pipeline.nlp import _embedder

    query_vec = _embedder().encode(q)
    articles = (
        db.execute(
            select(Article)
            .where(Article.embedding.isnot(None))
            .order_by(Article.embedding.cosine_distance(query_vec))
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return [_article_out(a) for a in articles]


@app.get("/api/articles", response_model=list[ArticleOut])
def latest_articles(limit: int = 50, db: Session = Depends(get_db)):
    """Newest articles with titles, for the Latest reading feed."""
    articles = (
        db.execute(
            select(Article)
            .where(Article.title.isnot(None))
            .order_by(Article.published_at.desc(), Article.id.desc())
            .limit(min(limit, 200))
        )
        .scalars()
        .all()
    )
    return [_article_out(a) for a in articles]


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
    return {
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


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    story_id: int | None = None


@app.post("/api/chat")
async def chat(req: ChatRequest):
    from agent.chat import stream_chat

    async def sse():
        async for event in stream_chat([m.model_dump() for m in req.messages], req.story_id):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")


@app.get("/api/suggest")
def suggest(story_id: int | None = None, context: str = "", db: Session = Depends(get_db)):
    from agent.chat import suggest_questions

    if story_id and not context:
        story = db.get(Story, story_id)
        if not story:
            raise HTTPException(404, "story not found")
        titles = "\n".join(a.title or "" for a in story.articles[:30])
        context = f"News story: {story.title}\nArticles:\n{titles}"
    return {"questions": suggest_questions(context) if context else []}


@app.post("/api/summarise/{story_id}")
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
