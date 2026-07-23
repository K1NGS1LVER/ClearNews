"""Redis-backed cache for search results, For You feed, and UMAP projections.

Fail-open: if Redis is unreachable all operations silently become no-ops,
returning None from get_json. This keeps tests and local dev working without
a running valkey instance.
"""

import hashlib
import json
import logging
import os
import time
from typing import Any

import redis as _redis

_log = logging.getLogger(__name__)
_redis_instance: _redis.Redis | None = None
_redis_down_at: float | None = None  # timestamp of last failure; None = never failed
_RETRY_AFTER = 30  # seconds before retrying a failed connection


def _client() -> _redis.Redis | None:
    global _redis_instance, _redis_down_at
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    if _redis_instance is not None:
        return _redis_instance

    # If we failed recently, wait before retrying to avoid retry storms
    if _redis_down_at is not None:
        if time.monotonic() - _redis_down_at < _RETRY_AFTER:
            return None
        _log.info("retrying Redis connection at %s", url)

    try:
        _redis_instance = _redis.from_url(url, decode_responses=True)
        _redis_instance.ping()
        _redis_down_at = None
        _log.info("Redis connected at %s", url)
    except _redis.RedisError:
        _log.warning("Redis unavailable at %s, will retry in %ds", url, _RETRY_AFTER)
        _redis_instance = None
        _redis_down_at = time.monotonic()
        return None

    return _redis_instance


def _key(*parts: str) -> str:
    return ":".join(parts)


def _reset_client() -> None:
    """Mark Redis as unavailable so the next _client() call retries."""
    global _redis_instance, _redis_down_at
    _redis_instance = None
    _redis_down_at = time.monotonic()


def get_json(key: str) -> Any | None:
    c = _client()
    if c is None:
        return None
    try:
        val = c.get(key)
        return json.loads(val) if val else None
    except _redis.RedisError:
        _reset_client()
        return None


def set_json(key: str, value: Any, ttl: int) -> None:
    c = _client()
    if c is None:
        return
    try:
        c.setex(key, ttl, json.dumps(value, default=str))
    except _redis.RedisError:
        _reset_client()


def delete_key(key: str) -> None:
    c = _client()
    if c is None:
        return
    try:
        c.delete(key)
    except _redis.RedisError:
        _reset_client()


def search_key(query: str, limit: int, story_id: int | None) -> str:
    raw = f"{query}:{limit}:{story_id}"
    h = hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()
    return _key("search", h)


def foryou_key(user_id: int) -> str:
    return _key("foryou", str(user_id))


FORYOU_VERSION_KEY = "foryou:version"


def foryou_version() -> int:
    """Current ForYou generation counter. Bumped by clustering when new
    stories are created so per-user ForYou caches are recomputed."""
    v = get_json(FORYOU_VERSION_KEY)
    return int(v) if v is not None else 0


def bump_foryou_version() -> None:
    """Increment the ForYou generation counter."""
    c = _client()
    if c is None:
        return
    try:
        c.incr(FORYOU_VERSION_KEY)
    except _redis.RedisError:
        _reset_client()


def umap_key(story_id: int) -> str:
    return _key("umap", str(story_id))


def session_key(token: str) -> str:
    return _key("session", token)


def get_session_user_id(token: str) -> int | None:
    """Return user_id from Redis if the session exists and is fresh."""
    val = get_json(session_key(token))
    return val if val is None else int(val)


def set_session(token: str, user_id: int, ttl: int) -> None:
    set_json(session_key(token), user_id, ttl)


def delete_session(token: str) -> None:
    delete_key(session_key(token))


# -- NLP pipeline queue (Tier 3) --

NLP_QUEUE_KEY = "nlp:pending"

def nlp_queue_push(article_ids: list[int]) -> None:
    """Push article IDs to the NLP processing queue (RPUSH for FIFO)."""
    r = _client()
    if r is None:
        return
    try:
        if article_ids:
            r.rpush(NLP_QUEUE_KEY, *[str(i) for i in article_ids])
    except _redis.RedisError:
        _reset_client()


def nlp_queue_pop(batch_size: int = 256) -> list[int]:
    """Pop up to batch_size article IDs from the NLP queue (LPOP, non-blocking)."""
    r = _client()
    if r is None:
        return []
    try:
        results = r.lpop(NLP_QUEUE_KEY, batch_size)
        return [int(v) for v in results] if results else []
    except _redis.RedisError:
        _reset_client()
        return []


def nlp_queue_length() -> int:
    r = _client()
    if r is None:
        return 0
    try:
        return r.llen(NLP_QUEUE_KEY) or 0
    except _redis.RedisError:
        _reset_client()
        return 0
