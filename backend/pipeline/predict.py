"""Story death prediction: will a story still have coverage at day 30?

Feature extraction is pure (testable with synthetic data). Training needs
stories whose outcome is known, i.e. first_seen at least 30 days ago; with a
young database `train` reports "not enough history" and scoring is skipped.

Run: uv run python -m pipeline.predict train   # fit + save model
     uv run python -m pipeline.predict score   # death_risk for active stories
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Story

MODEL_PATH = Path(__file__).parent / "data" / "death_model.json"
HORIZON_DAYS = 30
MIN_TRAIN_STORIES = 50
CATEGORIES = [
    "politics", "conflict", "disaster", "crime",
    "health", "economy", "sports", "science_tech", "general",
]

FEATURE_NAMES = [
    "velocity_7d",        # slope of daily article counts, first 7 days
    "outlet_diversity",   # unique outlets at day 7 (or last known day)
    "sentiment_volatility",
    "drift_first_week",   # mean drift score, first 7 days
    "entity_density",     # unique people+orgs per article
    "geo_spread",         # unique locations mentioned
    *[f"cat_{c}" for c in CATEGORIES],
]


def story_features(story: Story) -> list[float]:
    metrics = sorted(story.daily_metrics, key=lambda m: m.day)[:7]
    counts = [m.article_count for m in metrics]
    velocity = float(np.polyfit(range(len(counts)), counts, 1)[0]) if len(counts) > 1 else 0.0
    diversity = float(metrics[-1].unique_outlets) if metrics else 0.0
    sentiments = [m.sentiment_mean for m in metrics if m.sentiment_mean is not None]
    volatility = float(np.std(sentiments)) if len(sentiments) > 1 else 0.0
    drifts = [m.drift_score for m in metrics if m.drift_score is not None]
    drift = float(np.mean(drifts)) if drifts else 0.0

    people, orgs, locations = set(), set(), set()
    for a in story.articles:
        ents = a.entities or {}
        people.update(ents.get("people", []))
        orgs.update(ents.get("orgs", []))
        locations.update(ents.get("locations", []))
    n_articles = max(len(story.articles), 1)
    entity_density = (len(people) + len(orgs)) / n_articles

    one_hot = [1.0 if story.category == c else 0.0 for c in CATEGORIES]
    return [velocity, diversity, volatility, drift, entity_density, float(len(locations)), *one_hot]


def label(story: Story) -> int:
    """1 = still alive at the horizon: coverage continued past day 30."""
    return int((story.last_seen - story.first_seen) >= timedelta(days=HORIZON_DAYS))


def fit_model(X: np.ndarray, y: np.ndarray):
    from xgboost import XGBClassifier

    model = XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.1, eval_metric="logloss"
    )
    model.fit(X, y)
    return model


def train() -> str:
    cutoff = datetime.now(UTC) - timedelta(days=HORIZON_DAYS)
    with SessionLocal() as session:
        stories = (
            session.execute(select(Story).where(Story.first_seen <= cutoff))
            .scalars()
            .all()
        )
        if len(stories) < MIN_TRAIN_STORIES:
            return (
                f"not enough history: {len(stories)} stories older than "
                f"{HORIZON_DAYS} days (need {MIN_TRAIN_STORIES})"
            )
        X = np.array([story_features(s) for s in stories])
        y = np.array([label(s) for s in stories])
        model = fit_model(X, y)
        MODEL_PATH.parent.mkdir(exist_ok=True)
        model.save_model(MODEL_PATH)
        return f"trained on {len(stories)} stories, saved to {MODEL_PATH}"


def score() -> str:
    if not MODEL_PATH.exists():
        return "no trained model yet; run train first"
    from xgboost import XGBClassifier

    model = XGBClassifier()
    model.load_model(MODEL_PATH)
    with SessionLocal() as session:
        stories = (
            session.execute(select(Story).where(Story.status != "dead"))
            .scalars()
            .all()
        )
        X = np.array([story_features(s) for s in stories])
        # P(dead by day 30) = 1 - P(alive)
        risks = 1.0 - model.predict_proba(X)[:, 1]
        for story, risk in zip(stories, risks):
            story.death_risk = float(risk)
        session.commit()
        return f"scored {len(stories)} stories"


def selftest() -> str:
    """Prove the model pipeline learns, on synthetic separable data."""
    rng = np.random.default_rng(7)
    n = 300
    X = rng.normal(size=(n, len(FEATURE_NAMES)))
    y = ((X[:, 0] + X[:, 1]) > 0).astype(int)
    model = fit_model(X[:200], y[:200])
    accuracy = (model.predict(X[200:]) == y[200:]).mean()
    assert accuracy > 0.85, f"synthetic accuracy too low: {accuracy:.2f}"
    return f"selftest ok, accuracy {accuracy:.2f}"


if __name__ == "__main__":
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "score"
    print({"train": train, "score": score, "selftest": selftest}[cmd]())
