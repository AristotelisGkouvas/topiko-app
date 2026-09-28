"""sponsor report token: a private link to a sponsor's monthly numbers

Revision ID: f7b9d1c3e5a6
Revises: e5a7c9b1d3f4
Create Date: 2026-09-28 21:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'f7b9d1c3e5a6'
down_revision: str | None = 'e5a7c9b1d3f4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ('platform_sponsors', 'sponsors'):
        op.add_column(table, sa.Column('report_token', sa.String(length=32), nullable=True))
        op.create_index(f'ix_{table}_report_token', table, ['report_token'], unique=True)


def downgrade() -> None:
    for table in ('platform_sponsors', 'sponsors'):
        op.drop_index(f'ix_{table}_report_token', table_name=table)
        op.drop_column(table, 'report_token')
