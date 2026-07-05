"""SHAP explanation unit checks. Uses the same real model as test_nlp.py."""

from datetime import UTC, datetime, timedelta

from pipeline.explain import (
    BIAS_LABELS,
    EXPLANATION_VERSION,
    _model_window,
    aggregate,
    explain_text,
    select_articles,
)
from pipeline.nlp import _bias_pipeline


def test_explain_text_payload():
    text = (
        "The radical left-wing mob stormed the capitol demanding socialist "
        "policies and open borders."
    )
    payload = explain_text(text, max_evals=64)

    assert payload["version"] == EXPLANATION_VERSION
    assert payload["predicted"] in BIAS_LABELS
    assert abs(sum(payload["probs"].values()) - 1) < 1e-3
    assert len(payload["tokens"]) == len(payload["values"])
    assert all(len(row) == 3 for row in payload["values"])
    # tokens must reconstruct exactly what was analyzed, so the frontend can
    # render them as adjacent highlighted spans without gaps
    assert "".join(payload["tokens"]) == text

    for i, label in enumerate(BIAS_LABELS):
        additive = payload["base_values"][label] + sum(row[i] for row in payload["values"])
        assert abs(additive - payload["probs"][label]) < 0.05


def test_model_window_truncates():
    long_text = "word " * 5000
    windowed = _model_window(long_text)
    assert long_text.startswith(windowed)

    tokenizer, _ = _bias_pipeline()
    assert len(tokenizer(windowed)["input_ids"]) <= 512


class _FakeArticle:
    def __init__(self, id, bias_label, content, days_ago):
        self.id = id
        self.bias_label = bias_label
        self.content = content
        self.published_at = datetime.now(UTC) - timedelta(days=days_ago)


class _FakeStory:
    def __init__(self, articles):
        self.articles = articles


def test_select_articles_stratified():
    articles = [
        _FakeArticle(1, "left", "full text", 1),
        _FakeArticle(2, "left", None, 0),
        _FakeArticle(3, "left", "full text", 3),
        _FakeArticle(4, "center", "full text", 2),
        _FakeArticle(5, "right", None, 0),
        _FakeArticle(6, "right", "full text", 1),
        _FakeArticle(7, None, "full text", 0),
    ]
    story = _FakeStory(articles)

    selected = select_articles(story, cap=5)

    assert len(selected) == 5
    labels = {a.bias_label for a in selected}
    assert labels == {"left", "center", "right"}
    # within the left group, content-bearing + more recent should be preferred
    left_ids = [a.id for a in selected if a.bias_label == "left"]
    assert left_ids[0] == 1


def test_select_articles_respects_small_cap():
    articles = [_FakeArticle(i, "left", "text", i) for i in range(10)]
    story = _FakeStory(articles)
    selected = select_articles(story, cap=3)
    assert len(selected) == 3


def _payload(predicted, probs, tokens_values):
    return {
        "predicted": predicted,
        "probs": probs,
        "tokens": [t for t, _ in tokens_values],
        "values": [v for _, v in tokens_values],
    }


def test_aggregate():
    payloads = [
        _payload(
            "left",
            {"left": 0.7, "center": 0.2, "right": 0.1},
            [
                ("healthcare", [0.3, 0.0, -0.1]),
                ("the", [0.1, 0.1, 0.1]),  # stopword, dropped
                ("ok", [0.2, 0.0, 0.0]),  # too short, dropped
            ],
        ),
        _payload(
            "right",
            {"left": 0.1, "center": 0.2, "right": 0.7},
            [
                ("healthcare", [0.1, 0.0, -0.05]),
                ("borders", [-0.05, 0.0, 0.4]),
            ],
        ),
    ]

    result = aggregate(payloads)

    assert result["label_counts"] == {"left": 1, "right": 1}
    assert abs(result["probs"]["left"] - 0.4) < 1e-6
    assert abs(result["probs"]["right"] - 0.4) < 1e-6

    left_words = {w["word"]: w for w in result["top_words"]["left"]}
    assert "healthcare" in left_words
    assert left_words["healthcare"]["value"] == 0.4
    assert left_words["healthcare"]["articles"] == 2
    assert "the" not in left_words
    assert "ok" not in left_words

    right_words = {w["word"]: w for w in result["top_words"]["right"]}
    assert "borders" in right_words
