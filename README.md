# ClearNews

News story lifecycle and narrative drift intelligence platform.
Tracks stories as living entities: how coverage was born, how framing and political lean shifted, and when the story died.
Includes an agentic RAG research assistant that answers questions with article citations.

<p align="center">
  <img src="docs/screenshots/landing.png" alt="ClearNews landing page" width="700">
</p>

## Stack

React 19 + Vite + Recharts frontend (dark and light themes).
FastAPI + PostgreSQL/pgvector backend.
GDELT GKG ingestion every 15 minutes.
NLP pipeline: MiniLM embeddings, VADER sentiment, spaCy NER, politicalBiasBERT left/center/right scoring.
HDBSCAN story clustering, daily analytics, LangGraph + Groq chat agent.

## Pages

**Story** — headline, bias bar, article coverage list, and lifecycle status.

<p align="center">
  <img src="docs/screenshots/story-top.png" alt="Story page with headline, bias bar, coverage list" width="700">
</p>

**Charts** — coverage volume timeline with forecast, lean share by day, VADER sentiment, narrative drift map, and drift score.

<p align="center">
  <img src="docs/screenshots/story-charts.png" alt="Story charts: lifecycle volume, lean, sentiment, drift map" width="700">
</p>

**Agent sidebar** — RAG chat scoped to the story with suggested questions and cited answers.

<p align="center">
  <img src="docs/screenshots/agent-sidebar.png" alt="Agent sidebar with suggested questions on a story page" width="700">
</p>

## Local setup

```bash
# database
brew install postgresql@17 pgvector
brew services start postgresql@17
createdb clearnews

# backend
cd backend
cp .env.example .env          # add your GROQ_API_KEY for chat/summaries
uv sync
uv run python scripts/unify_libomp.py  # REQUIRED after every uv sync (macOS):
                                       # torch + sklearn each bundle an OpenMP
                                       # runtime; two in one process segfault
uv run alembic upgrade head            # creates the vector extension, tables, indexes

# data (each step is idempotent)
uv run python -m pipeline.ingest      # pull latest 15-min GDELT file
uv run python -m pipeline.nlp         # embed + sentiment + NER + bias
uv run python -m pipeline.cluster     # group articles into stories
uv run python -m pipeline.metrics     # daily metrics, drift, status
uv run python -m pipeline.scheduler   # or: continuous 15-min ingestion

# run
cd ../frontend && pnpm install && cd ..
./dev.sh   # starts API :8000 and UI :5173 together, Ctrl-C stops both

# tests
cd backend && uv run pytest
```

## Layout

```
backend/app/       FastAPI app, SQLAlchemy models
backend/pipeline/  ingestion, NLP, clustering, analytics jobs
backend/agent/     LangGraph chat agent and retrieval tools
frontend/src/      Feed, Story, Chat, Analytics pages
```
