"""In-process fixed-window rate limiter.

Good enough for single-instance deployments. A multi-worker/replica setup
would need a shared store (e.g. Redis) instead.
"""

import time
from collections import defaultdict

from fastapi import HTTPException, Request

_buckets: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))


def _make_limiter(limit: int, window: int):
    """Return a FastAPI dependency that enforces `limit` requests per `window`
    seconds, keyed by client IP. Each endpoint gets its own independent bucket
    so a burst of chat requests doesn't consume the auth rate limit."""

    def _check(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        bucket = _buckets[ip]
        # Drop timestamps older than the window to implement fixed-window sliding
        bucket["ts"] = [t for t in bucket["ts"] if now - t < window]
        if len(bucket["ts"]) >= limit:
            raise HTTPException(429, "too many requests, try again shortly")
        bucket["ts"].append(now)

    return _check


# Auth endpoints: 10 attempts/min/IP
rate_limit_auth = _make_limiter(10, 60)

# LLM-powered endpoints: 20 chat, 10 suggest, 5 summarise per minute
rate_limit_chat = _make_limiter(20, 60)
rate_limit_suggest = _make_limiter(10, 60)
rate_limit_summarise = _make_limiter(5, 60)
