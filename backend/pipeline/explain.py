"""SHAP explanations for the political-bias classifier.

Per-article Shapley values come from a partition explainer over the same
politicalBiasBERT model used in `pipeline.nlp`. Story-level explanations
select a handful of representative articles, explain each one (cached on
the article), and roll the per-word contributions up into a summary.
"""

import re
import threading
from collections import Counter, defaultdict
from functools import lru_cache

import numpy as np
import torch

from app.models import Article, Story
from pipeline.nlp import BIAS_LABELS, BIAS_MODEL, _bias_pipeline

EXPLANATION_VERSION = 1
MAX_EVALS = 400
BATCH_SIZE = 32
ARTICLE_CAP = 5

# SHAP saturates the CPU on its own; one compute at a time also lets the
# caller re-check the DB cache under the lock to dedupe concurrent requests.
compute_lock = threading.Lock()

_WORD_RE = re.compile(r"^[a-z]+$")


def _predict_proba(texts: list[str]) -> np.ndarray:
    tokenizer, model = _bias_pipeline()
    enc = tokenizer(
        list(texts), return_tensors="pt", truncation=True, max_length=512, padding=True
    )
    with torch.no_grad():
        return torch.softmax(model(**enc).logits, dim=-1).numpy()


@lru_cache(maxsize=1)
def _explainer():
    import shap

    # Word-level regex masker: whole-word spans aggregate cleanly across
    # articles and are cheaper to evaluate than 512 wordpiece spans.
    return shap.Explainer(_predict_proba, shap.maskers.Text(r"\W+"), output_names=BIAS_LABELS)


def _model_window(text: str) -> str:
    """Slice text to exactly what the model sees (its 512-token window)."""
    tokenizer, _ = _bias_pipeline()
    enc = tokenizer(text, truncation=True, max_length=512, return_offsets_mapping=True)
    offsets = enc["offset_mapping"]
    if not offsets:
        return text
    return text[: max(end for _, end in offsets)]


def explain_text(text: str, max_evals: int = MAX_EVALS) -> dict:
    """Return SHAP token attributions + class probabilities for one text."""
    analyzed = _model_window(text)
    probs = _predict_proba([analyzed])[0]
    exp = _explainer()([analyzed], max_evals=max_evals, batch_size=BATCH_SIZE, silent=True)

    tokens = list(exp.data[0])
    values = [[float(v) for v in row] for row in exp.values[0]]
    # the regex masker drops trailing punctuation/whitespace after the last
    # word; pad it back on as a neutral token so tokens reconstruct `analyzed`
    leftover = analyzed[len("".join(tokens)) :]
    if leftover:
        tokens.append(leftover)
        values.append([0.0, 0.0, 0.0])

    return {
        "version": EXPLANATION_VERSION,
        "model": BIAS_MODEL,
        "max_evals": max_evals,
        "probs": {label: round(float(p), 4) for label, p in zip(BIAS_LABELS, probs)},
        "predicted": BIAS_LABELS[int(probs.argmax())],
        "base_values": {
            label: round(float(b), 4) for label, b in zip(BIAS_LABELS, exp.base_values[0])
        },
        "tokens": tokens,
        "values": values,
    }


def select_articles(story: Story, cap: int = ARTICLE_CAP) -> list[Article]:
    """Pick up to `cap` articles, round-robin across labels present, so the
    summary covers every lean the story actually has (not just the majority)."""
    by_label: dict[str, list[Article]] = defaultdict(list)
    for a in story.articles:
        if a.bias_label:
            by_label[a.bias_label].append(a)
    for label in by_label:
        by_label[label].sort(key=lambda a: (a.content is None, -a.published_at.timestamp()))

    labels = [l for l in BIAS_LABELS if by_label.get(l)]
    queues = {l: iter(by_label[l]) for l in labels}
    selected: list[Article] = []
    while len(selected) < cap and queues:
        for label in list(labels):
            if label not in queues:
                continue
            article = next(queues[label], None)
            if article is None:
                del queues[label]
                continue
            selected.append(article)
            if len(selected) >= cap:
                break
    return selected


def aggregate(payloads: list[dict]) -> dict:
    """Roll per-article SHAP payloads up into a story-level summary."""
    mean_probs = {label: 0.0 for label in BIAS_LABELS}
    label_counts: Counter[str] = Counter()
    word_values: dict[str, dict[str, float]] = {label: defaultdict(float) for label in BIAS_LABELS}
    word_articles: dict[str, dict[str, set[int]]] = {
        label: defaultdict(set) for label in BIAS_LABELS
    }

    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

    for i, payload in enumerate(payloads):
        label_counts[payload["predicted"]] += 1
        for label in BIAS_LABELS:
            mean_probs[label] += payload["probs"][label]
        for token, values in zip(payload["tokens"], payload["values"]):
            word = token.strip().lower()
            if not _WORD_RE.match(word) or len(word) < 3 or word in ENGLISH_STOP_WORDS:
                continue
            for j, label in enumerate(BIAS_LABELS):
                word_values[label][word] += values[j]
                word_articles[label][word].add(i)

    n = len(payloads) or 1
    top_words = {}
    for label in BIAS_LABELS:
        ranked = sorted(word_values[label].items(), key=lambda kv: kv[1], reverse=True)
        top_words[label] = [
            {"word": word, "value": round(value, 4), "articles": len(word_articles[label][word])}
            for word, value in ranked[:10]
            if value > 0
        ]

    return {
        "label_counts": dict(label_counts),
        "probs": {label: round(mean_probs[label] / n, 4) for label in BIAS_LABELS},
        "top_words": top_words,
    }
