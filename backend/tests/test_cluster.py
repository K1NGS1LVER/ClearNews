import numpy as np

from pipeline.cluster import central_index, cluster_embeddings
from pipeline.metrics import daily_drift


def test_cluster_embeddings_finds_two_groups():
    rng = np.random.default_rng(42)
    a = rng.normal(loc=0.0, scale=0.01, size=(10, 8)) + np.eye(8)[0]
    b = rng.normal(loc=0.0, scale=0.01, size=(10, 8)) + np.eye(8)[4]
    labels = cluster_embeddings(np.vstack([a, b]), min_cluster_size=3)

    group_a, group_b = set(labels[:10]), set(labels[10:])
    assert len(group_a) == 1 and len(group_b) == 1
    assert group_a != group_b
    assert -1 not in group_a | group_b


def test_central_index():
    emb = np.array([[0.0, 0.0], [1.0, 1.0], [0.4, 0.4]])
    assert central_index(emb) == 2  # closest to mean (0.47, 0.47)


def test_daily_drift():
    drift = daily_drift(
        {
            1: np.array([[0.0, 0.0]]),
            2: np.array([[3.0, 4.0]]),  # distance 5 from day 1
        }
    )
    assert drift == {2: 5.0}
