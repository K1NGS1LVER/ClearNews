# 0001-project-flow-and-decisions

**Date:** 2026-08-22  
**Lesson:** 0001-project-architecture.html  
**Status:** captured

## Key insights

### 1. Data enters every 15 minutes from GDELT GKG, not from a live stream

GDELT publishes a fresh CSV every 15 minutes. ClearNews downloads it (with 5 retries and back-off to the previous 15-min slot on 404), parses ~140k rows, deduplicates on URL, upserts outlets, inserts new articles, and pushes their IDs to a Redis queue. It's near-real-time but polling-based, not streaming. The HTTPS cert has a hostname mismatch so `verify=False` is set with a TODO to re-enable.

**Why it matters:** The 15-minute cadence is a deliberate trade-off between freshness and operational simplicity. A streaming approach (Kafka, websocket) would be more complex and isn't justified by the GDELT publication cadence.

### 2. NLP enrichment is batched on a queue, not inline

The models (MiniLM, VADER, spaCy, BERT bias) are heavy. Running them inline during the 15-min ingest window would stall ingestion. Pushing IDs to a work-first Redis list (LPUSH/BRPOP) decouples ingestion from compute. Batches amortize model loading via lru_cache singletons.

**Why it matters:** This is the classic ingest vs. enrich decoupling. The trade-off is latency — an article might sit unprocessed for a bit — but that's acceptable for a news system where "enriched within a few minutes" is good enough.

### 3. Clustering is HDBSCAN over a 3-day sliding window, reconciled by article overlap

A full recluster of the window each run, with existing story IDs preserved by counting which story each member already belongs to. This keeps story IDs stable across runs (important for citations and the frontend), while still letting new stories emerge and old ones absorb new articles.

**Why it matters:** HDBSCAN doesn't need a pre-specified cluster count — stories emerge from density. The 3-day window keeps it tractable. The reconciliation step is what makes the system feel stable to users — a story doesn't randomly renumber.

### 4. Political bias is empirical, not asserted

Each article gets a BERT-based left/center/right label and a signed score (P(right) - P(left)). Outlet mean bias is computed as the average of what the outlet actually published — `func.avg(Article.bias_score)` — not a static label. The bias changes as the outlet's coverage changes.

**Why it matters:** This is a philosophical choice about what "bias" means in this system — it's what the outlet *did*, not what a media watchdog *says*. It's more honest but also more contingent (an outlet's mean bias shifts as its coverage shifts).

### 5. Hybrid search fuses semantic and lexical, cached 5 minutes

RRF fusion (k=60) of vector cosine-distance ranking and PostgreSQL full-text ranking. Cache keyed by (query, limit, story_id). The `simple` collation is deliberately basic for multilingual safety — no stemming, no language dictionary — which loses some English recall but handles non-English text without breaking.

**Why it matters:** Semantic search catches meaning matches; FTS catches exact keyword recovery. Fusing both is simple (no training, just RRF) and effective. The 5-min cache matters because the same query gets asked multiple times in a chat session.

### 6. Caches fail open; rate limiters fail closed

Feed cache, UMAP cache, search cache, session cache — all fail open (recompute, skip caching) when Redis is unreachable. Rate limiters (chat, auth, summarise, voice) fail closed (503) because they guard paid LLM quota and CPU-bound inference. An outage of enforcement must not leak paid resources.

**Why it matters:** This is a deliberate security/financial posture. Losing the feed cache costs latency; losing the rate limiter could cost money. The asymmetry is intentional and documented in the code comments.

### 7. The chat agent is ReAct with a recursion cap and provider fallbacks

LangGraph ReAct agent with 4 tools (search_corpus, search_story, get_story_arc, web_search), a recursion limit (default 12) to prevent runaway tool loops, and a provider fallback chain (Groq → Ollama SLM → OpenRouter → OpenAI). The most recent commit added pluggable provider support with 429 rate-limit fallback.

**Why it matters:** The recursion cap is the key guard — without it, a query with no on-topic coverage sends the model into repeated searches until LangGraph's default 25 super-steps. The provider fallback means the agent keeps working if one provider is down, but the fallback model (Qwen 2.5 1.5B) is much weaker than the primary, so answers degrade.

### 8. Death prediction is a 30-day horizon XGBoost classifier

Features from the first 7 days of metrics (velocity, outlet diversity, sentiment volatility, drift, entity density, geo spread, category one-hot). Training needs stories with known outcomes (first_seen >= 30 days ago), minimum 50 stories. On a young database, scoring is skipped.

**Why it matters:** The system can't predict death until it has enough history. That's a fundamental constraint of supervised learning — you need labeled outcomes. The log-linear forecast (3-day projection) is simpler and works immediately, but the death-risk classifier needs training data.

## Open questions

- The English-only filter at GDELT ingest: is this intentional forever, or a placeholder until non-English processing is added?
- The ts_vector uses `simple` collation deliberately for multilingual safety, but does that actually work for non-Latin scripts?
- What's the planned path for the full-text fetcher (NewsAPI/RSS) — is the title-only bias/sentiment a known temporary state?
