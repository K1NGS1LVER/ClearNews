"""Assign a coarse category to each story, zero-shot via embeddings.

Each story's centroid (mean of its article embeddings, which the NLP
pipeline already computed) is compared to embedded category descriptions;
closest wins. No extra models, no training data.

Run: uv run python -m pipeline.topics
"""

from collections import Counter
from functools import lru_cache

import numpy as np
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Story

CATEGORY_PROMPTS = {
    "politics": "government, elections, legislation, political parties and policy debates",
    "conflict": "war, armed conflict, military strikes, terrorism and ceasefire negotiations",
    "disaster": "natural disasters: earthquakes, floods, wildfires, hurricanes and rescue efforts",
    "crime": "crime, arrests, murder trials, corruption investigations and policing",
    "health": "health, disease outbreaks, medicine, hospitals and public health policy",
    "economy": "the economy, markets, inflation, trade, companies and financial results",
    "sports": "sports, matches, tournaments, player transfers and championships",
    "science_tech": "science, technology, space exploration, artificial intelligence and research",
    "culture": "entertainment, celebrities, music, film, festivals and lifestyle",
}


@lru_cache(maxsize=1)
def _category_vectors() -> tuple[list[str], np.ndarray]:
    from pipeline.nlp import _embedder

    names = list(CATEGORY_PROMPTS)
    vecs = _embedder().encode([f"news about {CATEGORY_PROMPTS[n]}" for n in names])
    vecs = vecs / np.linalg.norm(vecs, axis=1, keepdims=True)
    return names, vecs


def categorize_centroid(centroid: np.ndarray) -> str:
    names, vecs = _category_vectors()
    c = centroid / np.linalg.norm(centroid)
    return names[int(np.argmax(vecs @ c))]


def run_topics() -> dict:
    with SessionLocal() as session:
        stories = session.execute(select(Story)).scalars().all()
        for story in stories:
            embs = [a.embedding for a in story.articles if a.embedding is not None]
            story.category = (
                categorize_centroid(np.mean(np.array(embs), axis=0))
                if embs
                else "general"
            )
        session.commit()
        return dict(Counter(s.category for s in stories))


if __name__ == "__main__":
    print(run_topics())
