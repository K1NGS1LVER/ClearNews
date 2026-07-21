"""NLP enrichment pipeline: embeddings, sentiment, NER, political bias.

Processes articles whose `embedding` is null, in batches.
Run: uv run python -m pipeline.nlp [batch_size]

Text basis is `content` when the full-text fetcher has filled it,
falling back to `title`.
"""

# ponytail: runs on titles until the NewsAPI/RSS full-text fetcher lands;
# swap point is `_text_of` only.

import sys
import threading
from functools import lru_cache

import torch
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Article
from pipeline.country_codes import gdelt_name_to_iso2

BIAS_MODEL = "bucketresearch/politicalBiasBERT"
BIAS_LABELS = ["left", "center", "right"]
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

_embedder_lock = threading.Lock()
_embedder_instance = None


def _load_embed_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBED_MODEL)


def _embedder(loader=_load_embed_model):
    # ponytail: lru_cache doesn't dedupe concurrent misses, so the startup
    # warm thread and a first search request could both load the ~9s model.
    # Lock around construction, cache on a module var, check twice.
    global _embedder_instance
    if _embedder_instance is not None:
        return _embedder_instance
    with _embedder_lock:
        if _embedder_instance is None:
            _embedder_instance = loader()
    return _embedder_instance


@lru_cache(maxsize=1)
def _vader():
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

    return SentimentIntensityAnalyzer()


@lru_cache(maxsize=1)
def _spacy():
    import en_core_web_sm

    return en_core_web_sm.load(disable=["parser", "lemmatizer"])


@lru_cache(maxsize=1)
def _bias_pipeline():
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained("bert-base-cased")
    model = AutoModelForSequenceClassification.from_pretrained(BIAS_MODEL)
    model.eval()
    return tokenizer, model


def _text_of(article: Article) -> str | None:
    return article.content or article.title


def score_bias(texts: list[str]) -> list[tuple[str, float]]:
    """Return (label, signed_score) per text. Score: -1 left .. +1 right."""
    tokenizer, model = _bias_pipeline()
    enc = tokenizer(
        texts, return_tensors="pt", truncation=True, max_length=512, padding=True
    )
    with torch.no_grad():
        probs = torch.softmax(model(**enc).logits, dim=-1)
    out = []
    for p in probs:
        label = BIAS_LABELS[int(p.argmax())]
        out.append((label, float(p[2] - p[0])))  # P(right) - P(left)
    return out


def _entities_from_doc(doc) -> dict[str, list[str]]:
    ents: dict[str, list[str]] = {"people": [], "orgs": [], "locations": []}
    kind = {"PERSON": "people", "ORG": "orgs", "GPE": "locations", "LOC": "locations"}
    for ent in doc.ents:
        key = kind.get(ent.label_)
        if key and ent.text not in ents[key]:
            ents[key].append(ent.text)
    return ents


def extract_entities(text: str) -> dict[str, list[str]]:
    return _entities_from_doc(_spacy()(text))


def extract_mentioned_countries(doc) -> list[str]:
    """Country-level GPE entities mapped to ISO-2 - a coarse fallback for
    articles GKG's V2Locations didn't tag (e.g. DOC-API-sourced ones).
    City/region GPEs ("Mumbai") don't resolve; that's an accepted gap, not
    a bug - country-level mentions are what this is for."""
    codes = {gdelt_name_to_iso2(ent.text) for ent in doc.ents if ent.label_ == "GPE"}
    return sorted(c for c in codes if c)


def _enrich(session: Session, todo: list[tuple[Article, str]]) -> int:
    """Embed, score, and tag a batch of (article, text) pairs; commits.

    Shared by pipeline.nlp's batch sweep and pipeline.nlp_worker's
    queue-driven path - same per-article work, different article selection.
    """
    texts = [t for _, t in todo]
    embeddings = _embedder().encode(texts, batch_size=64)
    biases = score_bias(texts)
    vader = _vader()

    for (article, text), emb, (bias_label, bias_score) in zip(todo, embeddings, biases):
        doc = _spacy()(text)
        article.embedding = emb
        article.sentiment = vader.polarity_scores(text)["compound"]
        article.bias_label = bias_label
        article.bias_score = bias_score
        article.entities = _entities_from_doc(doc)
        if not article.mentioned_countries:
            # GKG's V2Locations already populated this for firehose-sourced
            # articles (pipeline/gdelt.py); this is the fallback for the rest
            article.mentioned_countries = extract_mentioned_countries(doc)

    session.commit()
    return len(todo)


def process_batch(session: Session, batch_size: int = 256) -> int:
    """Enrich one batch of unprocessed articles. Returns rows processed."""
    articles = (
        session.execute(
            select(Article)
            .where(
                Article.embedding.is_(None),
                # rows with no text at all would loop forever if selected
                or_(Article.content.isnot(None), Article.title.isnot(None)),
            )
            .order_by(Article.id)
            .limit(batch_size)
        )
        .scalars()
        .all()
    )
    todo = [(a, _text_of(a)) for a in articles]
    todo = [(a, t) for a, t in todo if t]
    if not todo:
        return 0
    return _enrich(session, todo)


def process_all(batch_size: int = 256) -> int:
    total = 0
    with SessionLocal() as session:
        while n := process_batch(session, batch_size):
            total += n
            print(f"processed {total}")
    return total


if __name__ == "__main__":
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 256
    print(f"done: {process_all(size)} articles enriched")
