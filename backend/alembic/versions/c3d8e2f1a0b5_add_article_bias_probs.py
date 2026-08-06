"""add article bias_probs column

Stores the full {left, center, right} softmax probability vector from
politicalBiasBERT per article. max(bias_probs.values()) gives the model's
confidence; values below 0.60 indicate the classifier is uncertain (commonly
labelled 'center' even when not genuinely centrist). Existing rows get NULL
- the API derives a proxy confidence from |bias_score| for legacy articles.

Revision ID: c3d8e2f1a0b5
Revises: 926a0a0b755d
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d8e2f1a0b5"
down_revision: Union[str, None] = "86be3af0d628"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD COLUMN IF NOT EXISTS is idempotent - safe to run twice
    op.execute(
        "ALTER TABLE articles ADD COLUMN IF NOT EXISTS bias_probs JSONB"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE articles DROP COLUMN IF EXISTS bias_probs"
    )
