import subprocess
import sys
from pathlib import Path

from pipeline.predict import FEATURE_NAMES, story_features
from pipeline.topics import categorize_centroid

BACKEND = Path(__file__).parent.parent


def test_model_selftest_in_subprocess():
    # xgboost and torch cannot share a process on macOS (conflicting OpenMP
    # runtimes), and other tests load torch - so the fit runs isolated
    result = subprocess.run(
        [sys.executable, "-m", "pipeline.predict", "selftest"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "selftest ok" in result.stdout


def test_story_features_on_live_story():
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Story

    with SessionLocal() as session:
        story = session.execute(select(Story).limit(1)).scalar_one()
        feats = story_features(story)
    assert len(feats) == len(FEATURE_NAMES)
    assert all(isinstance(f, float) for f in feats)
    assert feats[1] >= 1  # outlet diversity


def test_categorize_centroid():
    from pipeline.nlp import _embedder

    texts = {
        "sports": "Celtics trade star forward to the 76ers before playoffs",
        "disaster": "Earthquake levels buildings as survivors search rubble",
        "economy": "Inflation cools as central bank holds interest rates steady",
    }
    for expected, text in texts.items():
        vec = _embedder().encode(text)
        assert categorize_centroid(vec) == expected
