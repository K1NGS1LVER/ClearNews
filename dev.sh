#!/usr/bin/env bash
# Run backend (FastAPI :8000) and frontend (Vite :5173) together.
# Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")"

trap 'kill 0' EXIT

# ponytail: auto-rebuild venv if shebangs are stale (e.g. after moving the project dir)
if ! (cd backend && uv run --directory . python -c "" >/dev/null 2>&1); then
  echo "[dev] stale venv detected - rebuilding..."
  (cd backend && rm -rf .venv && uv sync && uv run python scripts/unify_libomp.py)
fi

# ponytail: start local services if not already running
pg_isready -q 2>/dev/null || brew services start postgresql@17 >/dev/null 2>&1
lsof -ti:6379 >/dev/null 2>&1 || valkey-server --port 6379 --requirepass clearnews-dev-redis-change-me --appendonly yes --daemonize yes >/dev/null 2>&1

lsof -ti:8000 | xargs kill -9 2>/dev/null || true  # ponytail: kills orphaned uvicorn workers from a prior unclean exit, not a real port conflict

tag() {
  local label=$1; shift
  sed "s/^/[$label] /"
}

(cd backend && uv run uvicorn app.main:app --reload --port 8000 2>&1 | tag backend) &
(cd frontend && pnpm dev 2>&1 | tag frontend) &

wait
