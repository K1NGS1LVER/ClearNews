# ClearNews

News story lifecycle and narrative drift intelligence platform.
Tracks stories as living entities: how coverage was born, how framing and political lean shifted, and when the story died.
Includes an agentic RAG research assistant that answers questions with article citations.

## Stack

React 19 + Vite + Recharts frontend.
FastAPI + PostgreSQL/pgvector backend.
GDELT GKG ingestion every 15 minutes.
NLP pipeline: MiniLM embeddings, VADER sentiment, spaCy NER, politicalBiasBERT left/center/right scoring.
HDBSCAN story clustering, daily analytics, LangGraph + Groq chat agent.

## Prerequisites

- **macOS**: `brew` package manager
- **Python 3.12** (managed by `uv`)
- **Node.js 20+** with `pnpm`
- **PostgreSQL 17** with `pgvector` extension

## Local setup

### 1. Database

```bash
brew install postgresql@17 pgvector
brew services start postgresql@17
createdb clearnews
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # add your GROQ_API_KEY for chat/summaries

uv sync
uv run python scripts/unify_libomp.py   # REQUIRED after every uv sync on macOS
                                          # torch + sklearn bundle different OpenMP
                                          # runtimes; two in one process segfaults

uv run python -m app.init_db            # create tables + pgvector extension
```

### 3. Frontend

```bash
cd frontend
pnpm install
cd ..
```

### 4. Run

```bash
./dev.sh   # starts API :8000 and UI :5173 together, Ctrl-C stops both
```

On first launch, the backend detects an empty database and runs the full
bootstrap pipeline automatically (GDELT ingest, parallel content fetch,
NLP enrichment, clustering, metrics). The UI shows stories within a minute.

### 5. Tests

```bash
cd backend && uv run pytest
```

## Data pipeline

The pipeline runs automatically, but you can also invoke each stage manually.

### Quick start (single command)

```bash
cd backend
uv run python -m pipeline.bootstrap   # ingest + fetch + NLP + cluster + metrics
```

### Individual stages

```bash
cd backend

# pull latest 15-min GDELT file
uv run python -m pipeline.ingest

# fetch article full text + hero images (parallel, 8 workers by default)
uv run python -m pipeline.fetch_content 500

# NLP enrichment: embeddings, sentiment, political bias, NER
uv run python -m pipeline.nlp

# cluster articles into stories (HDBSCAN)
uv run python -m pipeline.cluster

# daily metrics, drift, story status, outlet bias
uv run python -m pipeline.metrics

# zero-shot topic assignment (politics, economy, sports, etc.)
uv run python -m pipeline.topics
```

### Backfill historical data

Pull historical GDELT GKG files so stories have multi-day volume history,
sentiment trends, and drift series:

```bash
cd backend
uv run python -m pipeline.backfill 7 2   # 7 days back, 2 samples per day
```

Each run is idempotent (duplicate URLs are skipped). More samples per day
gives denser trend data but takes longer. The bootstrap command runs this
automatically in the background.

### Continuous scheduler

For a persistent pipeline (ingests every 15 min, enriches hourly, metrics nightly):

```bash
cd backend
uv run python -m pipeline.scheduler
```

## Layout

```
backend/app/         FastAPI app, SQLAlchemy models, auth
backend/pipeline/    ingestion, NLP, clustering, analytics jobs
backend/agent/       LangGraph chat agent and retrieval tools
backend/scripts/     post-install utilities (OpenMP fix)
frontend/src/        Feed, Story, Chat pages
```
