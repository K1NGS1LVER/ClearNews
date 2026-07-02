"""Create the pgvector extension and all tables. Run: uv run python -m app.init_db"""

from sqlalchemy import text

from app.db import engine
from app.models import Base


def init_db() -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(engine)
    with engine.connect() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_articles_embedding_hnsw "
                "ON articles USING hnsw (embedding vector_cosine_ops)"
            )
        )
        conn.commit()


if __name__ == "__main__":
    init_db()
    print(f"Tables created: {', '.join(Base.metadata.tables)}")
