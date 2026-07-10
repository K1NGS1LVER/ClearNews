---
name: clearnews-demo
description: Prep for or walk through the ~5 minute ClearNews product demo. Use when the user wants to rehearse, run, or prepare the demo, or asks what to show/say for a ClearNews presentation.
---

# ClearNews demo

Full script (narrative beats, timing, likely questions) lives in [docs/DEMO.md](../../../docs/DEMO.md) - read it before presenting or rehearsing.

Before the demo, verify the environment is actually ready rather than assuming it:

1. Postgres running (`brew services list` or equivalent), backend up (`uv run uvicorn app.main:app`), frontend up (`pnpm dev`).
2. Pipeline ran recently enough to have data: `uv run python -m pipeline.ingest && uv run python -m pipeline.nlp && uv run python -m pipeline.cluster && uv run python -m pipeline.metrics && uv run python -m pipeline.topics`.
3. http://localhost:5173 loads a populated feed, not an empty state.

The script's five beats: the problem, Feed, Story arc (charts + drift map), Ask the agent, Analytics, Search - see docs/DEMO.md for the exact talking points and timing per beat.
