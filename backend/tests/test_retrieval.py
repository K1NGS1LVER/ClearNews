from app.retrieval import rrf_fuse


def test_rrf_rewards_agreement_between_lexical_and_semantic_results():
    # id 2 is not first in either ranker, but is strongly corroborated by both.
    assert rrf_fuse([1, 2, 3], [4, 2, 5], limit=5)[0] == 2


def test_rrf_preserves_semantic_only_and_keyword_only_candidates():
    assert rrf_fuse([10], [20], limit=5) == [10, 20]
