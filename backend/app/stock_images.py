"""Category-matched stock photo fallback for stories with no real article image.

Not a substitute for real ingestion - a generic "storm damage" photo next to a
specific headline is still a placeholder, not reportage. Picked deterministically
per story id so the same story always shows the same photo across reloads, and
the pool is refreshed daily rather than per-request.

Fails open like app.cache: no API key, network error, or empty pool all fall
through to no image, matching the existing "hide the slot" behaviour in the
frontend's Thumb component - a missing photo is safe, a wrong photo would not be.
"""

import logging
import os

import httpx

from app.cache import get_json, set_json

_log = logging.getLogger(__name__)

PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
POOL_SIZE = 15
POOL_TTL = 86400  # 24h - a fixed daily set, not refetched per request

CATEGORY_QUERIES = {
    "politics": "government building",
    "conflict": "military",
    "disaster": "storm damage",
    "crime": "police lights",
    "health": "hospital medicine",
    "economy": "stock market finance",
    "sports": "stadium sports",
    "science_tech": "technology laboratory",
    "culture": "concert crowd",
}
DEFAULT_QUERY = "newspaper city skyline"


def _fetch_pool(query: str) -> list[str]:
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key:
        return []
    try:
        resp = httpx.get(
            PEXELS_SEARCH_URL,
            params={"query": query, "per_page": POOL_SIZE, "orientation": "landscape"},
            headers={"Authorization": api_key},
            timeout=10,
        )
        resp.raise_for_status()
        photos = resp.json().get("photos", [])
        return [p["src"]["large"] for p in photos if p.get("src", {}).get("large")]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        _log.warning("Pexels fetch failed for query %r: %s", query, exc)
        return []


def _category_pool(category: str | None) -> list[str]:
    query = CATEGORY_QUERIES.get(category or "", DEFAULT_QUERY)
    cache_key = f"stock_images:{category or 'default'}"
    cached = get_json(cache_key)
    if cached is not None:
        return cached
    pool = _fetch_pool(query)
    if pool:  # don't cache an empty pool - let the next request retry
        set_json(cache_key, pool, POOL_TTL)
    return pool


def pick_stock_image(story_id: int, category: str | None) -> str | None:
    pool = _category_pool(category)
    if not pool:
        return None
    return pool[story_id % len(pool)]
