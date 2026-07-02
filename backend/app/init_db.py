"""Create the pgvector extension and all tables. Run: uv run python -m app.init_db"""

from sqlalchemy import text

from app.db import engine
from app.models import Base


def init_db() -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(engine)


if __name__ == "__main__":
    init_db()
    print(f"Tables created: {', '.join(Base.metadata.tables)}")
