"""Fixed-window rate limiter backed by Redis atomic counters.

Works across workers/replicas. Falls back to a permissive no-op when Redis
is unavailable so the app keeps working in dev / test without a running instance.
"""

import redis as _redis
from fastapi import HTTPException, Request

from app.cache import _client as _redis_client


def _make_limiter(name: str, limit: int, window: int):
    """Return a FastAPI dependency that enforces `limit` requests per `window`
    seconds, keyed by client IP. Each endpoint gets its own independent bucket
    so a burst of chat requests doesn't consume the auth rate limit."""

    def _check(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{name}:{ip}"
        r = _redis_client()
        if r is None:
            return  # fail-open
        try:
            n = r.incr(key)
            if n == 1:
                r.expire(key, window)
        except _redis.RedisError:
            return  # fail-open on transient Redis errors
        if n > limit:
            raise HTTPException(429, "too many requests, try again shortly")

    return _check


# Auth endpoints: 10 attempts/min/IP
rate_limit_auth = _make_limiter("auth", 10, 60)

# LLM-powered endpoints: 20 chat, 10 suggest, 5 summarise per minute
rate_limit_chat = _make_limiter("chat", 20, 60)
rate_limit_suggest = _make_limiter("suggest", 10, 60)
rate_limit_summarise = _make_limiter("summarise", 5, 60)

# Voice transcription: CPU-bound local inference, same order as chat
rate_limit_voice_transcribe = _make_limiter("voice_transcribe", 20, 60)

# Voice synthesis: higher ceiling than transcribe because one assistant
# answer fans out into multiple /api/voice/speak calls, one per sentence of
# the reply, so a single voice turn with a multi-sentence answer already
# costs several calls.
rate_limit_voice_speak = _make_limiter("voice_speak", 60, 60)
