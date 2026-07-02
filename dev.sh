#!/usr/bin/env bash
# Run backend (FastAPI :8000) and frontend (Vite :5173) together.
# Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")"

trap 'kill 0' EXIT

lsof -ti:8000 | xargs kill -9 2>/dev/null || true  # ponytail: kills orphaned uvicorn workers from a prior unclean exit, not a real port conflict

(cd backend && uv run uvicorn app.main:app --reload --port 8000) &
(cd frontend && pnpm dev) &

wait
