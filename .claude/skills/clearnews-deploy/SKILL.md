---
name: clearnews-deploy
description: Deploy ClearNews to Vercel (frontend) + Render (API + scheduler) + Supabase (Postgres/pgvector). Use when the user wants to deploy, host, ship, or go live with ClearNews, or asks about render.yaml / vercel.json / Supabase connection strings for this project.
---

# ClearNews deploy

Full walkthrough lives in [docs/DEPLOY.md](../../../docs/DEPLOY.md) - read it before acting, it has the exact click-paths for each account.
This is a manual, account-by-account process; nothing here can be done non-interactively since each step needs the user's own logins.

Order of operations: Supabase (DB) -> Render (API + scheduler, reads `render.yaml`) -> Vercel (frontend, reads `frontend/vercel.json`) -> optionally wire `FRONTEND_ORIGIN` back on Render.

Known sharp edges to flag proactively:

- Supabase: use the **session pooler** or **direct connection** string, not the transaction pooler - SQLAlchemy's long-lived connections and psycopg prepared statements don't work with transaction-mode pgbouncer. Rewrite the scheme to `postgresql+psycopg://`.
- `frontend/vercel.json`'s rewrite destination is static config (not templated from env vars) - it must be hand-edited to the real Render URL, committed, and pushed before it takes effect.
- Render's worker service (the scheduler) has no free tier; it's the one paid piece of this stack.
- Groq free tier has per-model token/rate limits (see the `GROQ_MODEL` config in `backend/agent/`) - heavy chat use can hit them in production.
- SSE chat streaming through Vercel's rewrite proxy is unverified - if tokens arrive batched instead of streamed, check Vercel's proxy buffering for `text/event-stream`.
- This stack has been build-tested with Docker/Compose locally but not actually deployed end-to-end - expect account-specific quirks (pooler modes, Render cold starts) on the first real pass.
