# Both stages share one base image so the venv's interpreter path is valid
# in the final image too - uv venvs are not portable across Python builds.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# dependencies first for layer caching, then the source (torch/transformers
# are large; this keeps a `COPY . .`-only change from re-downloading them)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
COPY . .
RUN uv sync --frozen --no-dev

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app /app
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:8000/docs || exit 1

# migrate then serve; `exec` so uvicorn becomes PID 1 and gets SIGTERM directly
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
