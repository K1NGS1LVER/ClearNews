# ClearNews

News story lifecycle and narrative drift intelligence platform (GDELT ingestion -> NLP/bias/clustering -> analytics -> React UI + RAG chat agent).
Full stack and setup: [README.md](README.md).
Architecture diagram: [README.md#architecture](README.md#architecture).

## Layout

```
backend/app/       FastAPI app, SQLAlchemy models (read-only API; no enrichment on the request path)
backend/pipeline/  ingestion, NLP, clustering, analytics jobs - each step is idempotent, safe to run by hand
backend/agent/     LangGraph chat agent and retrieval tools (Groq)
frontend/src/      Feed, Story, Chat, Analytics pages (React 19 + Vite + Recharts)
```

## Environment gotchas (not obvious from the code)

- **macOS OpenMP**: torch, sklearn, and xgboost each bundle their own `libomp.dylib`; two runtimes in one process segfault under load.
  Run `uv run python scripts/unify_libomp.py` after every `uv sync`. Guarded at API/scheduler startup and in `tests/test_openmp.py`, but re-run it yourself after touching deps. Not needed on Linux/Windows/Docker.
- **Postgres 17**, not 16 - the Homebrew `pgvector` formula only supports 17/18.
- **Python 3.12 pinned** via `uv` (repo default toolchain is newer; ML wheels lag). `numpy` pinned `<2.4` for numba/umap-learn compat.
- **Groq model choice**: `llama-3.3-70b-versatile` emits malformed tool calls on Groq (rejected with "tool call validation failed"). The agent defaults to `openai/gpt-oss-120b` (`GROQ_MODEL` env var), which tool-calls reliably. `suggest_questions` uses `llama-3.1-8b-instant` deliberately - Groq free tier is 8000 tokens/min *per model*, so splitting models avoids one feature starving another's budget.

## Commands

```bash
# backend
cd backend && uv sync && uv run python scripts/unify_libomp.py  # macOS only, after every sync
uv run alembic upgrade head
uv run pytest -q

# pipeline (idempotent, run any subset by hand)
uv run python -m pipeline.ingest
uv run python -m pipeline.nlp
uv run python -m pipeline.cluster
uv run python -m pipeline.metrics

# frontend
cd frontend && pnpm install && pnpm dev

# both together
./dev.sh
```

## Skills

- Deploying to Vercel/Render/Supabase -> use the `clearnews-deploy` skill.
- Prepping or walking through the product demo -> use the `clearnews-demo` skill.
- Frontend/UI design decisions -> use the `clearnews-design` skill for prior competitive research and stealable patterns.
