#!/usr/bin/env bash
# Run backend (FastAPI :8000) and frontend (Vite :5173) together.
# Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")"

trap 'kill 0' EXIT

# ANSI Color Codes
CLR_RESET=$(printf '\033[0m')
CLR_SETUP=$(printf '\033[1;36m')    # Cyan for setup / system notices
CLR_BACKEND=$(printf '\033[1;35m')  # Magenta for backend
CLR_FRONTEND=$(printf '\033[1;32m') # Green for frontend
CLR_ERROR=$(printf '\033[1;31m')    # Red for errors & exceptions

info() {
  printf '%s[setup]%s %s\n' "$CLR_SETUP" "$CLR_RESET" "$1"
}

# ponytail: auto-rebuild venv if shebangs are stale (e.g. after moving the project dir)
if ! (cd backend && uv run --directory . python -c "" >/dev/null 2>&1); then
  info "stale venv detected - rebuilding..."
  (cd backend && (mv .venv "$HOME/.Trash/.venv-$(date +%s)" 2>/dev/null || true) && uv sync && uv run python scripts/unify_libomp.py)
fi

# ponytail: start local services if not already running
pg_isready -q 2>/dev/null || { info "starting PostgreSQL..."; brew services start postgresql@17 >/dev/null 2>&1; }
lsof -ti:6379 >/dev/null 2>&1 || { info "starting Valkey/Redis..."; valkey-server --port 6379 --requirepass clearnews-dev-redis-change-me --appendonly yes --daemonize yes >/dev/null 2>&1; }

lsof -ti:8000 | xargs kill -9 2>/dev/null || true  # ponytail: kills orphaned uvicorn workers

tag() {
  local label=$1 color=$2
  while IFS= read -r line; do
    if [[ "$line" =~ (ERROR|Error|error|FATAL|Fatal|Traceback|Exception) ]]; then
      printf '%s[%s]%s %s%s%s\n' "$color" "$label" "$CLR_RESET" "$CLR_ERROR" "$line" "$CLR_RESET"
    else
      printf '%s[%s]%s %s\n' "$color" "$label" "$CLR_RESET" "$line"
    fi
  done
}

info "starting backend on :8000 (magenta) and frontend on :5173 (green)..."
(cd backend && uv run uvicorn app.main:app --reload --port 8000 2>&1 | tag backend "$CLR_BACKEND") &
(cd frontend && pnpm dev 2>&1 | tag frontend "$CLR_FRONTEND") &

wait
