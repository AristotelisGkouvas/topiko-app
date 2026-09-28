"""sponsor pending approval: a sponsor a club proposed itself

Revision ID: b9d1f3a5c7e8
Revises: a8c0e2f4b6d7
Create Date: 2026-09-28 23:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b9d1f3a5c7e8'
down_revision: str | None = 'a8c0e2f4b6d7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'sponsors',
        sa.Column('pending_approval', sa.Boolean(), server_default='false', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('sponsors', 'pending_approval')
