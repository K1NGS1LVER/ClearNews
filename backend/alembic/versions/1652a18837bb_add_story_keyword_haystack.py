"""add story keyword haystack

Revision ID: 1652a18837bb
Revises: b833fc22e7a8
Create Date: 2026-07-06 07:51:44.096589

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1652a18837bb'
down_revision: Union[str, Sequence[str], None] = 'b833fc22e7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # note: autogenerate also proposed dropping ix_articles_embedding_hnsw -
    # that index isn't represented in SQLAlchemy metadata (it's raw SQL in
    # the initial migration, see pgvector's lack of an Index construct here),
    # not an actual schema drift. Left out on purpose.
    op.add_column('stories', sa.Column('keyword_haystack', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('stories', 'keyword_haystack')
