#!/usr/bin/env bash
# One-shot local dev setup: checks prerequisites, creates the DB, installs
# deps, runs migrations. Safe to re-run (every step is idempotent).
#
# What this does NOT do: install Postgres/Redis/Node themselves - those are
# OS-specific and already covered in README.md's Prerequisites section. This
# script assumes they're installed and just wires the project up against them.
#
# Run: ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

red() { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

missing=0
need() {
  # need <binary> <hint>
  if ! command -v "$1" >/dev/null 2>&1; then
    red "missing: $1 - $2"
    missing=1
  fi
}

step "Checking prerequisites"
need uv "install: curl -LsSf https://astral.sh/uv/install.sh | sh"
need pnpm "install: corepack enable && corepack prepare pnpm@latest --activate"
need createdb "install PostgreSQL 17 + pgvector - see README.md#prerequisites"
need pg_isready "install PostgreSQL 17 + pgvector - see README.md#prerequisites"

if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -q; then
  red "Postgres isn't running - start it, then re-run this script."
  missing=1
fi

if ! command -v redis-cli >/dev/null 2>&1 && ! command -v valkey-cli >/dev/null 2>&1; then
  red "missing: redis-server or valkey - install: see README.md#prerequisites"
  missing=1
fi

if [ "$missing" -eq 1 ]; then
  echo
  red "Fix the above, then re-run ./setup.sh"
  exit 1
fi
green "all prerequisites found"

step "Database"
if createdb clearnews 2>/dev/null; then
  green "created database 'clearnews'"
else
  green "database 'clearnews' already exists, skipping"
fi

step "Backend: env file"
if [ -f backend/.env ]; then
  green "backend/.env already exists, skipping"
else
  cp backend/.env.example backend/.env
  green "created backend/.env - add your GROQ_API_KEY (free at https://console.groq.com) to enable chat/summaries"
fi

step "Backend: Python deps (uv sync)"
(cd backend && uv sync)

if [[ "$(uname)" == "Darwin" ]]; then
  step "Backend: unifying OpenMP runtimes (macOS only)"
  (cd backend && uv run python scripts/unify_libomp.py)
fi

step "Backend: schema migrations"
(cd backend && uv run alembic upgrade head)

step "Frontend: Node deps (pnpm install)"
(cd frontend && pnpm install)

echo
green "Setup complete."
cat <<'EOF'

Next steps:
  1. Add GROQ_API_KEY to backend/.env if you haven't (free: https://console.groq.com)
  2. Make sure Redis/Valkey is running (e.g. `brew services start valkey`)
  3. ./dev.sh

First launch auto-bootstraps GDELT data into the empty database - the feed
fills in within a minute or two.
EOF
