"""add hybrid archive search and saved chat sessions

Revision ID: a4d7b36c1f20
Revises: 926a0a0b755d
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a4d7b36c1f20"
down_revision: Union[str, Sequence[str], None] = "926a0a0b755d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE articles ADD COLUMN search_document tsvector "
        "GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED"
    )
    op.execute("CREATE INDEX ix_articles_search_document ON articles USING gin (search_document)")

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("story_id", sa.Integer(), sa.ForeignKey("stories.id"), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False, server_default="New conversation"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])
    op.create_index("ix_chat_sessions_story_id", "chat_sessions", ["story_id"])
    op.create_index("ix_chat_sessions_updated_at", "chat_sessions", ["updated_at"])
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("chat_sessions.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("session_id", "position"),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.execute("DROP INDEX ix_articles_search_document")
    op.execute("ALTER TABLE articles DROP COLUMN search_document")
