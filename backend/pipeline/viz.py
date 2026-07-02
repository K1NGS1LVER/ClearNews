"""2D projections for visualisation: story drift trajectories, outlet map."""

import numpy as np


def umap_2d(embeddings: np.ndarray, seed: int = 42) -> np.ndarray:
    """Project embeddings to 2D. Falls back to PCA when too few points for UMAP."""
    n = len(embeddings)
    if n < 5:
        from sklearn.decomposition import PCA

        return PCA(n_components=2).fit_transform(embeddings) if n > 1 else np.zeros((n, 2))

    from umap import UMAP

    return UMAP(
        n_components=2, n_neighbors=min(15, n - 1), random_state=seed
    ).fit_transform(embeddings)


def daily_centroids(days: list, coords: np.ndarray) -> list[dict]:
    """Mean 2D position per day, ordered by day. Trajectory of the narrative."""
    out = []
    for day in sorted(set(days)):
        idx = [i for i, d in enumerate(days) if d == day]
        c = coords[idx].mean(axis=0)
        out.append({"day": day.isoformat(), "x": float(c[0]), "y": float(c[1])})
    return out
