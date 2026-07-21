"""In-process fixed-window rate limiter.

Good enough for single-instance deployments. A multi-worker/replica setup
would need a shared store (e.g. Redis) instead.
"""

import itertools
import time
from collections import defaultdict

from fastapi import HTTPException, Request

# Keyed by (limiter_id, client IP) so each _make_limiter() call gets its own
# independent bucket per IP - see _make_limiter's docstring.
_buckets: dict[tuple[int, str], list[float]] = defaultdict(list)

_limiter_ids = itertools.count()


def _make_limiter(limit: int, window: int):
    """Return a FastAPI dependency that enforces `limit` requests per `window`
    seconds, keyed by client IP. Each endpoint gets its own independent bucket
    so a burst of chat requests doesn't consume the auth rate limit."""

    limiter_id = next(_limiter_ids)

    def _check(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        bucket = _buckets[(limiter_id, ip)]
        # Drop timestamps older than the window to implement fixed-window sliding
        bucket[:] = [t for t in bucket if now - t < window]
        if len(bucket) >= limit:
            raise HTTPException(429, "too many requests, try again shortly")
        bucket.append(now)

    return _check


# Auth endpoints: 10 attempts/min/IP
rate_limit_auth = _make_limiter(10, 60)

# LLM-powered endpoints: 20 chat, 10 suggest, 5 summarise per minute
rate_limit_chat = _make_limiter(20, 60)
rate_limit_suggest = _make_limiter(10, 60)
rate_limit_summarise = _make_limiter(5, 60)

# Voice transcription: CPU-bound local inference, same order as chat
rate_limit_voice_transcribe = _make_limiter(20, 60)
