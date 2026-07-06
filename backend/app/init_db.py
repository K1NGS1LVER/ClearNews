"""Schema is managed by Alembic. Run: uv run alembic upgrade head

Kept as a thin wrapper so old muscle-memory (`uv run python -m app.init_db`)
still works.
"""

import subprocess
import sys


def init_db() -> None:
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)


if __name__ == "__main__":
    init_db()
