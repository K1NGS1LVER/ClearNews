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
- **A chat agent that cites its sources** — LangGraph + Groq, with hybrid
  (semantic + keyword) retrieval over the archive and an optional live-web
  search tool, kept visibly distinct from archive citations in the UI.

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

- **Frontend** — React 19, Vite, Tailwind, Recharts, Playwright for e2e tests.
- **Backend** — FastAPI, SQLAlchemy, Alembic migrations, PostgreSQL 17 with
  the `pgvector` extension.
- **NLP/ML** — sentence-transformers (MiniLM), VADER, spaCy, a fine-tuned
  BERT bias classifier, HDBSCAN, UMAP, XGBoost, SHAP.
- **Agent** — LangGraph + Groq, hybrid (vector + Postgres full-text, RRF-fused)
  retrieval, optional SearXNG/Tavily/Brave live-web search.

## Prerequisites

The fastest way to run ClearNews needs only **Docker** — see [Docker](#docker)
below and skip straight there. For active development with hot reload, you'll
want everything natively:

- **Python 3.12** — no separate install needed; `uv` downloads it for you.
- **Node.js 20.19+** (22 LTS recommended — matches CI and the Docker image)
  with `pnpm`.
- **PostgreSQL 17** with the **pgvector** extension.

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

## Docker

The simplest way to run the whole stack — Postgres, the API, the scheduler,
the frontend, and a self-hosted SearXNG instance for live-web search — with
one command and no package-manager setup at all:

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

To backfill more history than the automatic bootstrap pulls:

```bash
docker compose run --rm backend uv run python -m pipeline.backfill 45 2
```

## Local development

```bash
# 1. database - see the Prerequisites section above for your OS
createdb clearnews   # if you haven't already

# 2. backend
cd backend
cp .env.example .env          # add your GROQ_API_KEY for chat/summaries
uv sync
uv run python scripts/unify_libomp.py   # macOS only - see note below
uv run alembic upgrade head             # create/upgrade schema

# 3. frontend
cd ../frontend
pnpm install

# 4. run both together
cd ..
./dev.sh   # API on :8000, UI on :5173, Ctrl-C stops both
```

On first launch the backend detects an empty database and runs the full
bootstrap pipeline automatically, same as the Docker path above.

> **macOS only:** torch, scikit-learn, and xgboost each bundle their own
> `libomp.dylib`; having two OpenMP runtimes loaded in one process segfaults
> under load. Run `uv run python scripts/unify_libomp.py` after every
> `uv sync`. Not needed on Linux, Windows, or Docker.

## Configuration

All variables live in `backend/.env` (copy from `backend/.env.example`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string |
| `GROQ_API_KEY` | for chat/summaries/suggestions | — | free key at [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL` | no | `openai/gpt-oss-120b` | chat agent model |
| `SUGGEST_MODEL` | no | `llama-3.1-8b-instant` | separate small model for suggested follow-ups, so Groq's per-model free-tier rate limit doesn't starve chat |
| `CHAT_RECURSION_LIMIT` | no | `12` | max agent tool-call rounds per reply |
| `WEB_SEARCH_PROVIDER` | no | `searxng` | `searxng`, `tavily`, or `brave` |
| `SEARXNG_URL` | no | `http://searxng:8080` | only used when the provider is `searxng` |
| `TAVILY_API_KEY` | only if provider is `tavily` | — | quota-limited free tier |
| `BRAVE_SEARCH_API_KEY` | only if provider is `brave` | — | quota-limited free tier |
| `ENV` | production only | — | set to `production` to mark the session cookie `Secure` |
| `FRONTEND_ORIGIN` | production only | — | comma-separated; enables CORS when the frontend isn't behind the Docker/Vercel proxy |

Outside Docker, `WEB_SEARCH_PROVIDER` defaults to `searxng` but there's no
SearXNG instance to talk to unless you run one yourself — the tool just
returns no results in that case, it doesn't error.

> Don't switch `GROQ_MODEL` to `llama-3.3-70b-versatile` — it emits malformed
> tool calls on Groq and the agent will fail with "tool call validation
> failed". `openai/gpt-oss-120b` is the default because it tool-calls reliably.

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

## Tests

```bash
# backend
cd backend && uv run pytest -q

# frontend - typecheck + build, lint
cd frontend && pnpm build && pnpm lint

# frontend - end-to-end (Playwright; spins up the backend and Vite dev server for you)
pnpm test
```

## Deploying to production

Free-tier walkthrough for Vercel (frontend) + Render (API + scheduler) +
Supabase (Postgres/pgvector): see [docs/DEPLOY.md](docs/DEPLOY.md).

## Project layout

```
backend/app/         FastAPI app, SQLAlchemy models, auth
backend/alembic/     schema migrations
backend/pipeline/    ingestion, NLP, clustering, analytics jobs
backend/agent/       LangGraph chat agent + hybrid retrieval + live-web search tool
backend/scripts/     post-install utilities (macOS OpenMP fix)
frontend/src/        Feed, Story, Search, Analytics, Chat pages
frontend/e2e/        Playwright end-to-end tests
searxng/             settings for the self-hosted live-web search container
docs/                demo script, deploy guide, design research, screenshots
```

## Demo

A ~5 minute walkthrough script (feed → story arc → drift map → agent → search)
is in [docs/DEMO.md](docs/DEMO.md).
