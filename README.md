# ClearNews

[![CI](https://github.com/K1NGS1LVER/ClearNews/actions/workflows/ci.yml/badge.svg)](https://github.com/K1NGS1LVER/ClearNews/actions/workflows/ci.yml)

**A headline is one frame of a moving picture.** News aggregators show today's
articles with no memory of yesterday. ClearNews follows a story across its
whole life instead: how coverage was born, how its political framing drifted
left or right day by day, and when it quietly died — built from
[GDELT](https://www.gdeltproject.org/), the largest open news dataset on
earth, refreshed every 15 minutes.

It also ships a RAG research agent that answers questions about the archive
(and, optionally, the live web) with every claim resolving to a real,
clickable citation.

![ClearNews landing page](docs/screenshots/landing.png)

## What it tracks

- **Story lifecycle** — active / fading / dead status, first/last seen, a
  coverage-volume sparkline with a short-horizon forecast.
- **Political lean, measured not assumed** — every article is scored
  left/center/right by a fine-tuned BERT classifier at ingest time; an
  outlet's lean is the average of what it actually published, not a static
  label.
- **Narrative drift** — daily article embeddings are projected to 2D; the
  drift map traces how a story's *meaning*, not just its headlines, moved
  over time. A straight line is stable framing; a bend is a pivot.
- **Death-risk forecasting** — an XGBoost model predicts whether a story will
  still be covered in 30 days, once enough history exists to train it.
- **Explainable bias** — SHAP-powered token-level explanations show *why* the
  classifier labelled an article left, center, or right, with per-story
  aggregate word importance breakdowns.
- **A chat agent that cites its sources** — LangGraph + Groq, with hybrid
  (semantic + keyword) retrieval over the archive and an optional live-web
  search tool, kept visually distinct from archive citations in the UI.
- **Voice input & text-to-speech** — talk to the agent with your mic
  (Whisper STT via VAD), and it reads answers back (Kokoro TTS).
- **Personalised "For You" feed** — signed-in users get a ranked,
  category-aware feed with feedback-driven re-ranking.

## Screenshots

| Story lifecycle | Charts, sentiment & drift map |
|---|---|
| ![Story page](docs/screenshots/story-top.png) | ![Story charts](docs/screenshots/story-charts.png) |

![Ask the agent](docs/screenshots/agent-sidebar.png)

## Architecture

```
GDELT GKG (every 15 min)
        │
        ▼
 pipeline.ingest ──► pipeline.fetch_content (httpx + trafilatura, parallel)
        │
        ▼
 pipeline.nlp   MiniLM embeddings · VADER sentiment · spaCy NER
                politicalBiasBERT left/center/right
        │
        ▼
 pipeline.cluster (HDBSCAN)  ──►  pipeline.metrics (drift, death-risk)
        │                                   │
        └───────────────┬───────────────────┘
                         ▼
              PostgreSQL 17 + pgvector
                         │
                         ▼
                     FastAPI  ──────────────►  React 19 UI (Vite)
                         │
                         ▼
              LangGraph agent (Groq)
               ├─ hybrid retrieval (vector + full-text, RRF-fused)
               └─ optional live-web search ──► SearXNG (self-hosted)
```

`pipeline.scheduler` runs the ingest → NLP → cluster → metrics chain
continuously (15-min ingest, hourly enrichment, nightly metrics/death-risk).
Every stage is also idempotent and safe to run by hand — see
[Data pipeline](#data-pipeline).

## Stack

- **Frontend** — React 19, Vite 8, Tailwind 4, Recharts, D3, React Query,
  React Router, Playwright for e2e tests.
- **Backend** — FastAPI, SQLAlchemy, Alembic migrations, PostgreSQL 17 with
  the `pgvector` extension, Redis/Valkey for caching and rate limiting.
- **NLP/ML** — sentence-transformers (MiniLM), VADER, spaCy, a fine-tuned
  BERT bias classifier, HDBSCAN, UMAP, XGBoost, SHAP.
- **Agent** — LangGraph + Groq (`meta-llama/llama-4-scout-17b-16e-instruct`),
  hybrid (vector + Postgres full-text, RRF-fused) retrieval, optional
  SearXNG/Tavily/Brave live-web search.
- **Voice** — faster-whisper (STT), Kokoro (TTS), @ricky0123/vad-web
  (browser-side voice activity detection).
- **Auth** — cookie-based sessions, argon2 password hashing, Redis session
  store.

## Pages & features

| Route | Page | Description |
|---|---|---|
| `/` | Landing | Marketing page for signed-out users; redirects to For You if signed in |
| `/foryou` | For You | Personalised feed — category, keyword, and bias-preference aware ranking with feedback buttons |
| `/stories` | Feed | All tracked stories with infinite scroll, filterable by status and country |
| `/story/:id` | Story | Full story arc — coverage charts, sentiment, bias breakdown, outlet table, drift map, forecast, milestones, SHAP explainability, ask sidebar |
| `/article/:id` | Article | Single article reader — extracted full text, bias chip, sentiment, link to original |
| `/search` | Search | Semantic search across the archive with story-grouped results |
| `/analytics` | Analytics | Global outlet bias landscape |
| `/chat` | Chat | Standalone chat with the research agent (global scope) |
| `/login` | Login | Email + password auth |
| `/signup` | Signup | Account creation |
| `/forgot-password` | Forgot Password | Password reset request |
| `/reset-password` | Reset Password | Token-based password reset |
| `/welcome` | Welcome | Post-signup onboarding — pick categories, bias preference, keywords |

## API reference

All endpoints are prefixed with `/api`. Interactive docs are auto-generated at
`/docs` (Swagger UI) and `/redoc` when the backend is running.

### Health & monitoring

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness + readiness probe — verifies DB and Redis connectivity, returns `200` or `503` |

### Stories & feed

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/stories` | no | Paginated story list, filterable by `status`, `source_country`, `about_country` |
| `GET` | `/feed` | no | Alias for `/stories` |
| `GET` | `/foryou` | yes | Personalised ranked feed |
| `GET` | `/stories/{id}` | no | Story detail |
| `GET` | `/stories/{id}/arc` | no | Full story arc: metrics, articles, forecast, milestones |
| `GET` | `/stories/{id}/outlets` | no | Per-outlet breakdown for a story |
| `GET` | `/stories/{id}/drift` | no | 2D UMAP drift projection |
| `GET` | `/stories/{id}/explanation` | no | SHAP bias explanation for a story's articles |
| `POST` | `/stories/{id}/explanation/step` | no | Trigger incremental SHAP computation |
| `POST` | `/stories/{id}/feedback` | yes | "More like this" / "Less like this" signal |
| `GET` | `/stories/search?q=` | no | Semantic story search |
| `POST` | `/summarise/{id}` | no | One-shot LLM summary (rate limited: 5/min) |

### Articles & search

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/articles/{id}` | Full article with extracted text |
| `GET` | `/search?q=` | Semantic article search |

### Chat agent

| Method | Endpoint | Auth | Rate limit | Description |
|---|---|---|---|---|
| `GET` | `/chat/sessions` | yes | — | List user's chat sessions |
| `POST` | `/chat/sessions` | yes | — | Create a new chat session |
| `GET` | `/chat/sessions/{id}` | yes | — | Get session with message history |
| `PATCH` | `/chat/sessions/{id}` | yes | — | Update session title |
| `DELETE` | `/chat/sessions/{id}` | yes | — | Delete session |
| `POST` | `/chat` | yes | 20/min | Stream a message (SSE) |
| `GET` | `/suggest` | — | 10/min | Suggested follow-up questions |

### Voice

| Method | Endpoint | Auth | Rate limit | Description |
|---|---|---|---|---|
| `POST` | `/voice/transcribe` | yes | 20/min | Upload audio for Whisper STT |
| `POST` | `/voice/speak` | yes | 60/min | Text-to-speech via Kokoro |

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/signup` | Create account |
| `POST` | `/auth/login` | Log in (sets session cookie) |
| `POST` | `/auth/logout` | Log out (clears session) |
| `POST` | `/auth/forgot-password` | Request password reset email |
| `POST` | `/auth/reset-password` | Reset password with token |
| `GET` | `/me` | Current user profile |
| `PUT` | `/me/preferences` | Update display name, categories, bias pref, keywords, countries |

### Analytics & geo

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/analytics` | Global outlet stats |
| `GET` | `/outlets/map` | Outlet bias landscape data |
| `GET` | `/countries` | Supported countries with article/story counts |

## Prerequisites

The fastest way to run ClearNews needs only **Docker** — see [Docker](#docker)
below and skip straight there. For active development with hot reload, you'll
want everything natively:

- **Python 3.12** — no separate install needed; `uv` downloads it for you.
- **Node.js 20.19+** (22 LTS recommended — matches CI and the Docker image)
  with `pnpm`.
- **PostgreSQL 17** with the **pgvector** extension.
- **Redis or Valkey** — required, not optional: rate limiting on the LLM and
  voice endpoints fails *closed* (503) without it, to avoid silently exposing
  a paid Groq quota and CPU-bound local inference to unlimited requests if the
  store goes down. Search/for-you/session caching degrade gracefully without
  it, but the rate-limited endpoints won't work at all.

<details>
<summary><strong>Installing uv (all platforms)</strong></summary>

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

`uv` provisions the pinned Python 3.12 itself on first `uv sync` — you don't
need a system Python install.
</details>

<details>
<summary><strong>Installing Node.js + pnpm</strong></summary>

Any of these work; pick whichever fits how you already manage Node:

```bash
# nvm (distro-agnostic, recommended if you don't already have Node 20+)
# see https://github.com/nvm-sh/nvm for the current install script, then:
nvm install 22

# Debian / Ubuntu
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Fedora / RHEL / Rocky
sudo dnf module install -y nodejs:22

# Arch
sudo pacman -S nodejs npm

# macOS
brew install node@22
```

Then enable pnpm via Corepack (bundled with Node 16.9+, works everywhere
above):

```bash
corepack enable
corepack prepare pnpm@latest --activate
```
</details>

<details>
<summary><strong>Installing PostgreSQL 17 + pgvector</strong></summary>

Package availability shifts between distro releases, so treat these as a
strong starting point and cross-check against the linked official docs if a
command below doesn't match what your package manager offers.

```bash
# Debian / Ubuntu — via the official PostgreSQL (PGDG) apt repo, which is
# the reliable way to get PG17 + a matching pgvector build
# (full instructions: https://www.postgresql.org/download/linux/ubuntu/)
sudo apt install -y curl ca-certificates postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt install -y postgresql-17 postgresql-17-pgvector
sudo systemctl enable --now postgresql

# Fedora / RHEL / Rocky — via the official PostgreSQL (PGDG) yum repo
# (exact repo RPM URL for your release: https://www.postgresql.org/download/linux/redhat/)
sudo dnf install -y postgresql17-server postgresql17-contrib pgvector_17
sudo /usr/pgsql-17/bin/postgresql-17-setup --initdb
sudo systemctl enable --now postgresql-17

# Arch — postgresql is current in the official repos; pgvector usually needs
# an AUR helper (check `pacman -Ss pgvector` first, packaging does move)
sudo pacman -S postgresql
yay -S pgvector   # or your AUR helper of choice
sudo -iu postgres initdb -D /var/lib/postgres/data
sudo systemctl enable --now postgresql

# macOS
brew install postgresql@17 pgvector
brew services start postgresql@17
```

Then create the database. On Linux, first make your OS user a Postgres role
(Homebrew's Postgres on macOS already runs as you, so skip this line there):

```bash
sudo -u postgres createuser -s $(whoami)   # Linux only
createdb clearnews
```
</details>

<details>
<summary><strong>Installing Redis or Valkey</strong></summary>

Either works — Valkey is the open-source fork Docker Compose uses; Redis
itself is a drop-in replacement for local dev.

```bash
# Debian / Ubuntu
sudo apt install -y redis-server
sudo systemctl enable --now redis-server

# Fedora / RHEL / Rocky
sudo dnf install -y redis
sudo systemctl enable --now redis

# Arch
sudo pacman -S redis
sudo systemctl enable --now redis

# macOS
brew install redis
brew services start redis
```

No password needed for local dev — `backend/.env.example`'s default
`REDIS_URL=redis://localhost:6379/0` assumes an unauthenticated local
instance. Docker Compose's `valkey` service does set a password (see
`docker-compose.yml`); that's only relevant if you're running the Docker path.
</details>

## Docker

The simplest way to run the whole stack — Postgres, Valkey, the API, the
scheduler, the frontend, and a self-hosted SearXNG instance for live-web
search — with one command and no package-manager setup at all:

```bash
cp backend/.env.example backend/.env   # add your GROQ_API_KEY (free at console.groq.com)
docker compose up --build
```

Then open **http://localhost:5173**. The API auto-bootstraps GDELT data on
first boot against an empty database (ingest → fetch → NLP → cluster →
metrics), so the feed fills in within a minute or two. `docker-compose.yml`
also wires `WEB_SEARCH_PROVIDER=searxng` automatically, so the chat agent's
live-web tool works out of the box against the bundled SearXNG container —
no extra setup needed for that either.

The backend's Docker healthcheck verifies DB and Redis connectivity via
`/api/health`, not just that the process is alive.

To backfill more history than the automatic bootstrap pulls:

```bash
docker compose run --rm backend uv run python -m pipeline.backfill 45 2
```

## Local development

Once Postgres and Redis/Valkey are installed and running (see
[Prerequisites](#prerequisites) for your OS), one command does the rest -
checks everything's in place, creates the `clearnews` database, copies the
env file, installs backend + frontend deps, and runs migrations. Safe to
re-run any time; every step skips cleanly if already done:

```bash
./setup.sh
```

Then add your `GROQ_API_KEY` to `backend/.env` (free at
[console.groq.com](https://console.groq.com)) and start both servers:

```bash
./dev.sh   # API on :8000, UI on :5173, Ctrl-C stops both
```

On first launch the backend detects an empty database and runs the full
bootstrap pipeline automatically, same as the Docker path above.

<details>
<summary><strong>What setup.sh runs, if you'd rather do it by hand (or it fails partway)</strong></summary>

```bash
# 1. database + Redis/Valkey - see the Prerequisites section above for your OS
createdb clearnews   # if you haven't already
# (start your Redis/Valkey service if it isn't already running)

# 2. backend
cd backend
cp .env.example .env          # add your GROQ_API_KEY for chat/summaries
uv sync
uv run python scripts/unify_libomp.py   # macOS only - see note below
uv run alembic upgrade head             # create/upgrade schema

# 3. frontend
cd ../frontend
pnpm install
```

> **macOS only:** torch, scikit-learn, and xgboost each bundle their own
> `libomp.dylib`; having two OpenMP runtimes loaded in one process segfaults
> under load. Run `uv run python scripts/unify_libomp.py` after every
> `uv sync`. Not needed on Linux, Windows, or Docker.
</details>

## Configuration

All variables live in `backend/.env` (copy from `backend/.env.example`).

### Core

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string |
| `REDIS_URL` | yes | `redis://localhost:6379/0` | Redis/Valkey connection string — rate limiting fails closed (503) without it |
| `ENV` | production only | — | set to `production` to mark the session cookie `Secure` |
| `FRONTEND_ORIGIN` | production only | — | comma-separated; enables CORS when the frontend isn't behind the Docker/Vercel proxy |

### LLM / agent

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GROQ_API_KEY` | for chat/summaries/suggestions | — | free key at [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL` | no | `meta-llama/llama-4-scout-17b-16e-instruct` | chat agent model |
| `SUGGEST_MODEL` | no | `openai/gpt-oss-20b` | separate small model for suggested follow-ups, so Groq's per-model free-tier rate limit doesn't starve chat |
| `LLM_PROVIDER` | no | `groq` | chat LLM backend: `groq`, `ollama`, `openrouter`, or `openai` |
| `PIPELINE_GROQ_MODEL` | no | `openai/gpt-oss-20b` | pipeline LLM primary tier |
| `PIPELINE_GROQ_FALLBACK_MODEL` | no | `openai/gpt-oss-120b` | pipeline LLM fallback tier |
| `CHAT_RECURSION_LIMIT` | no | `12` | max agent tool-call rounds per reply |

### Web search

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `WEB_SEARCH_PROVIDER` | no | `searxng` | `searxng`, `tavily`, or `brave` |
| `SEARXNG_URL` | no | `http://searxng:8080` | only used when the provider is `searxng` |
| `TAVILY_API_KEY` | only if provider is `tavily` | — | quota-limited free tier |
| `BRAVE_SEARCH_API_KEY` | only if provider is `brave` | — | quota-limited free tier |

### Ollama / OpenRouter / OpenAI (alternative LLM providers)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OLLAMA_MODEL` | no | `qwen2.5:1.5b` | model name when `LLM_PROVIDER=ollama` |
| `OLLAMA_BASE_URL` | no | `http://localhost:11434/v1` | Ollama server URL |
| `OPENROUTER_MODEL` | no | `meta-llama/llama-4-scout-17b-16e-instruct` | model when `LLM_PROVIDER=openrouter` |
| `OPENROUTER_API_KEY` | if using openrouter | — | OpenRouter API key |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | model when `LLM_PROVIDER=openai` |
| `OPENAI_API_KEY` | if using openai | — | OpenAI API key |

Outside Docker, `WEB_SEARCH_PROVIDER` defaults to `searxng` but there's no
SearXNG instance to talk to unless you run one yourself — the tool just
returns no results in that case, it doesn't error.

> **Note:** The older Llama 3.x models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`)
> were deprecated on Groq in August 2026. The defaults now use `meta-llama/llama-4-scout-17b-16e-instruct`
> for chat and `openai/gpt-oss-20b` for suggestions.

## Data pipeline

Runs automatically via `pipeline.scheduler`, but every stage is idempotent
and safe to invoke by hand.

```bash
cd backend

# one-shot: ingest + fetch + NLP + cluster + metrics
uv run python -m pipeline.bootstrap

# or individually
uv run python -m pipeline.ingest           # pull the latest 15-min GDELT file
uv run python -m pipeline.fetch_content 500  # fetch article text + hero images (parallel)
uv run python -m pipeline.nlp              # embeddings, sentiment, bias, NER
uv run python -m pipeline.cluster          # HDBSCAN story clustering
uv run python -m pipeline.metrics          # daily metrics, drift, story status
uv run python -m pipeline.topics           # zero-shot topic assignment

# backfill: pull historical GDELT files for multi-day trend data
uv run python -m pipeline.backfill 7 2     # 7 days back, 2 samples/day, dedupes by URL

# continuous scheduler: 15-min ingest, hourly enrichment, nightly metrics/death-risk
uv run python -m pipeline.scheduler
```

### Pipeline stages

| Stage | Schedule | What it does |
|---|---|---|
| `ingest` | Every 15 min | Pulls the latest GDELT GKG file, dedupes by URL |
| `fetch_content` | After ingest | Extracts full article text via trafilatura, fetches hero images |
| `nlp` | After fetch | MiniLM embeddings, VADER sentiment, spaCy NER, politicalBiasBERT classification |
| `cluster` | Hourly | HDBSCAN clustering to group articles into stories |
| `metrics` | Nightly | Daily story metrics, narrative drift (UMAP), story status transitions |
| `topics` | After cluster | Zero-shot topic assignment per story |
| `predict` | Nightly | XGBoost death-risk forecasting (requires training data) |
| `explain` | On-demand | SHAP token-level bias explanations |

## Tests

```bash
# backend
cd backend && uv run pytest -q

# frontend - typecheck + build, lint
cd frontend && pnpm build && pnpm lint

# frontend - end-to-end (Playwright; spins up the backend and Vite dev server for you)
# needs a Redis/Valkey instance running locally (see Prerequisites) - rate
# limiting fails closed, so auth/chat/voice requests 503 without one
pnpm test
```

## Deploying to production

Free-tier walkthrough for Vercel (frontend) + Render (API + scheduler) +
Supabase (Postgres/pgvector): see [docs/DEPLOY.md](docs/DEPLOY.md).

## Project layout

```
setup.sh             one-shot local dev setup (deps, DB, env file, migrations)
dev.sh               runs backend + frontend together, hot reload
docker-compose.yml   full stack: Postgres, Valkey, backend, scheduler, SearXNG, frontend
render.yaml          Render deployment blueprint

backend/
├── app/
│   ├── main.py      FastAPI app — all endpoints, health check
│   ├── models.py    SQLAlchemy ORM models (Story, Article, Outlet, User, etc.)
│   ├── auth.py      cookie-based session auth, argon2 hashing
│   ├── cache.py     Redis-backed caching, session store, NLP queue
│   ├── retrieval.py hybrid (vector + full-text) search with RRF fusion
│   ├── ratelimit.py per-endpoint rate limiting via Redis
│   ├── voice.py     Whisper STT + Kokoro TTS
│   └── db.py        SQLAlchemy engine and session factory
├── agent/
│   ├── chat.py      LangGraph ReAct agent, streaming, fallback logic
│   └── tools.py     search_corpus, search_story, web_search, get_story_arc
├── pipeline/
│   ├── scheduler.py continuous pipeline orchestrator
│   ├── ingest.py    GDELT GKG fetcher
│   ├── fetch_content.py  article text extraction (httpx + trafilatura)
│   ├── nlp.py       embeddings, sentiment, bias, NER
│   ├── cluster.py   HDBSCAN story clustering
│   ├── metrics.py   daily story metrics, drift, status transitions
│   ├── predict.py   XGBoost death-risk forecasting
│   ├── explain.py   SHAP bias explanations
│   ├── agent_llm.py multi-tier LLM router (Groq → Ollama fallback)
│   └── topics.py    zero-shot topic classification
├── alembic/         schema migrations
├── scripts/         post-install utilities (macOS OpenMP fix)
└── tests/           pytest suite

frontend/
├── src/
│   ├── api.ts       centralized API client — all fetch calls, TypeScript types
│   ├── auth.ts      useMe hook (React Query)
│   ├── theme.ts     dark/light mode toggle
│   ├── pages/       Feed, Story, Article, Search, Analytics, Chat, ForYou, etc.
│   ├── components/  ChatPanel, BiasChip, DriftMap, FilterBar, ErrorBoundary, etc.
│   └── lib/         tts.ts, vad.ts, wav.ts, filters.ts
├── e2e/             Playwright end-to-end tests
└── public/          static assets

searxng/             settings for the self-hosted live-web search container
docs/                demo script, deploy guide, design research, screenshots
```

## Demo

A ~5 minute walkthrough script (feed → story arc → drift map → agent → search)
is in [docs/DEMO.md](docs/DEMO.md).
