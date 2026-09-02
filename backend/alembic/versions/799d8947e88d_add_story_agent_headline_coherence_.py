"""add story agent headline coherence score milestones

Revision ID: 799d8947e88d
Revises: c3d8e2f1a0b5
Create Date: 2026-09-02 23:40:05.964529

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '799d8947e88d'
down_revision: Union[str, Sequence[str], None] = 'c3d8e2f1a0b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('stories', sa.Column('agent_headline', sa.Text(), nullable=True))
    op.add_column('stories', sa.Column('coherence_score', sa.Float(), nullable=True))
    op.add_column('stories', sa.Column('milestones', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('stories', 'milestones')
    op.drop_column('stories', 'coherence_score')
    op.drop_column('stories', 'agent_headline')
