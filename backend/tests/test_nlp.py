"""NLP unit checks. First run downloads models (~600MB), then cached."""

from pipeline.nlp import BIAS_LABELS, extract_entities, score_bias


def test_score_bias_known_leans():
    left_text = (
        "We must expand universal healthcare, tax the billionaire class, "
        "and fight systemic racism with bold progressive climate action."
    )
    right_text = (
        "We must secure the border, cut taxes, defend gun rights and "
        "religious liberty, and stop the radical socialist agenda."
    )
    results = score_bias([left_text, right_text])
    assert all(label in BIAS_LABELS for label, _ in results)
    assert all(-1 <= score <= 1 for _, score in results)

    (left_label, left_score), (right_label, right_score) = results
    # signed score must at least order the two correctly
    assert left_score < right_score
    assert left_label == "left"
    assert right_label == "right"


def test_extract_entities():
    ents = extract_entities("Joe Biden met Google executives in Washington.")
    assert "Joe Biden" in ents["people"]
    assert "Google" in ents["orgs"]
    assert "Washington" in ents["locations"]
