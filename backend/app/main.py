"""ClearNews REST API.

Run: uv run uvicorn app.main:app --reload
"""

import json
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Article, Outlet, Story

@asynccontextmanager
async def lifespan(_: FastAPI):
    # this process loads torch (search, agent) and sklearn (drift PCA);
    # two bundled OpenMP runtimes would segfault it under load
    from pipeline.scheduler import check_single_openmp

    check_single_openmp()
    yield


app = FastAPI(title="ClearNews API", lifespan=lifespan)


def get_db():
    with SessionLocal() as session:
        yield session


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


class StoryArc(BaseModel):
    id: int
    title: str
    status: str
    summary: str | None
    metrics: list[DailyMetric]
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


@app.get("/api/stories", response_model=list[StoryCard])
def list_stories(status: str | None = None, db: Session = Depends(get_db)):
    q = select(Story)
    if status:
        q = q.where(Story.status == status)
    stories = db.execute(q.order_by(Story.last_seen.desc())).scalars().all()

    cards = []
    for s in stories:
        metrics = sorted(s.daily_metrics, key=lambda m: m.day)
        if not metrics:
            continue
        total = sum(m.article_count for m in metrics)
        # bias shares weighted by daily volume
        weight = lambda attr: (
            sum((getattr(m, attr) or 0) * m.article_count for m in metrics) / total
            if total
            else None
        )
        cards.append(
            StoryCard(
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
            )
        )
    cards.sort(key=lambda c: c.article_count, reverse=True)
    return cards


@app.get("/api/stories/{story_id}/arc", response_model=StoryArc)
def story_arc(story_id: int, db: Session = Depends(get_db)):
    story = db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "story not found")
    metrics = sorted(story.daily_metrics, key=lambda m: m.day)
    articles = sorted(story.articles, key=lambda a: a.published_at)
    return StoryArc(
        id=story.id,
        title=story.title,
        status=story.status,
        summary=story.summary,
        metrics=[DailyMetric.model_validate(m, from_attributes=True) for m in metrics],
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
