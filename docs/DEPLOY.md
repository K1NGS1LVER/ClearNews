# Deploying ClearNews (Vercel + Render + Supabase)

Three accounts, all free-tier to start (Render's worker service is the one exception - see step 2).
This doc is the manual walkthrough; nothing here can be run for you since each step needs your own account login.

## 1. Database - Supabase

1. Create a project at supabase.com.
2. Settings -> Database -> enable the `vector` extension (or skip this - the app's first migration runs `CREATE EXTENSION IF NOT EXISTS vector` itself).
3. Settings -> Database -> Connection string. Use the **Session pooler** or **direct connection** string, not the **Transaction pooler** - SQLAlchemy holds long-lived connections and psycopg's prepared statements don't play well with transaction-mode pgbouncer.
4. Rewrite it to the `postgresql+psycopg://` scheme this app expects, e.g.:
   `postgresql+psycopg://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres`

## 2. API + scheduler - Render

1. New -> Blueprint, point it at this repo. Render reads `render.yaml` from the root and creates two services:
   - `clearnews-api` (web) - runs `alembic upgrade head` then serves FastAPI. Migrations run automatically on every deploy.
   - `clearnews-scheduler` (worker) - runs `pipeline.scheduler` continuously (15-min ingest, hourly NLP/clustering, nightly metrics/death-risk). Render worker services have no free tier; this is the one paid piece.
2. Fill in the env vars Render prompts for on each service: `DATABASE_URL` (from step 1), `GROQ_API_KEY` (console.groq.com). Leave `FRONTEND_ORIGIN` blank for now.
3. Deploy. Note the `clearnews-api` public URL (`https://clearnews-api-xxxx.onrender.com`).

## 3. Frontend - Vercel

1. New Project, import this repo, set **Root Directory** to `frontend`.
2. Edit `frontend/vercel.json` in the repo: replace the placeholder in `destination` with the Render API URL from step 2, e.g. `https://clearnews-api-xxxx.onrender.com/api/:path*`. Commit and push - Vercel rewrites are static config, not templated from env vars.
3. Deploy. This is also what makes cookie auth work with zero CORS config: the browser only ever talks to the Vercel domain, and Vercel proxies `/api/*` server-side, so the session cookie is set on Vercel's origin, not Render's.

## 4. Wire the origin back (optional, defence in depth)

Set `FRONTEND_ORIGIN` on the Render `clearnews-api` service to your Vercel URL and redeploy.
Not required for the rewrite-proxy setup above, but makes the API usable directly (bypassing the Vercel rewrite) without breaking CORS if you ever need that.

## 5. Seed data

The scheduler starts collecting from the moment it boots, but stories/analytics/death-risk need calendar time to build up (see [docs/DEMO.md](DEMO.md)).
To backfill history immediately instead of waiting: run `uv run python -m pipeline.backfill 45 2` from your machine with `DATABASE_URL` pointed at the Supabase connection string, then `pipeline.nlp`, `pipeline.cluster`, `pipeline.metrics`, `pipeline.topics` the same way (see the backfill section of the main [README](../README.md#docker) for the docker-compose equivalent).

## Known rough edges

- The Groq free tier has per-model token/rate limits (see the LangGraph agent config); heavy chat use can hit them.
- SSE chat streaming through Vercel's rewrite proxy hasn't been verified in production - if tokens arrive batched instead of streamed, it's worth checking Vercel's proxy buffering behavior for `text/event-stream` responses.
- This was build-tested with Docker/Compose locally, not actually deployed to these three services - expect to debug real account-specific quirks (Supabase pooler modes, Render cold starts) on the first pass.
