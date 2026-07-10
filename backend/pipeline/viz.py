"""2D projections for visualisation: story drift trajectories, outlet map."""

import threading

import numpy as np

# UMAP's numba-jitted internals use the default "workqueue" threading layer,
# which is not safe to enter from multiple threads at once. FastAPI runs each
# sync endpoint in its own threadpool thread, so two concurrent /drift or
# /outlets/map requests both hitting UMAP crash the whole process. Serialize
# instead of chasing a threading-layer swap (e.g. TBB) - this endpoint is not
# hot enough for the lock to matter.
_umap_lock = threading.Lock()


def umap_2d(embeddings: np.ndarray, seed: int = 42) -> np.ndarray:
    """Project embeddings to 2D. Falls back to PCA when too few points for UMAP."""
    n = len(embeddings)
    if n < 5:
        from sklearn.decomposition import PCA

        return PCA(n_components=2).fit_transform(embeddings) if n > 1 else np.zeros((n, 2))

    from umap import UMAP

    with _umap_lock:
        return UMAP(
            n_components=2, n_neighbors=min(15, n - 1), random_state=seed, n_jobs=1
        ).fit_transform(embeddings)


def daily_centroids(days: list, coords: np.ndarray) -> list[dict]:
    """Mean 2D position per day, ordered by day. Trajectory of the narrative."""
    out = []
    for day in sorted(set(days)):
        idx = [i for i, d in enumerate(days) if d == day]
        c = coords[idx].mean(axis=0)
        out.append({"day": day.isoformat(), "x": float(c[0]), "y": float(c[1])})
    return out
