#!/usr/bin/env bash
# Run backend (FastAPI :8000) and frontend (Vite :5173) together.
# Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")"

trap 'kill 0' EXIT

lsof -ti:8000 | xargs kill -9 2>/dev/null || true  # ponytail: kills orphaned uvicorn workers from a prior unclean exit, not a real port conflict

tag() {
  local label=$1; shift
  sed "s/^/[$label] /"
}

(cd backend && uv run uvicorn app.main:app --reload --port 8000 2>&1 | tag backend) &
(cd frontend && pnpm dev 2>&1 | tag frontend) &

wait
