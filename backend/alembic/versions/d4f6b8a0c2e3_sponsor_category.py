"""sponsor category, club sponsor png logo

Revision ID: d4f6b8a0c2e3
Revises: c826575a73c3
Create Date: 2026-09-28 18:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'd4f6b8a0c2e3'
down_revision: str | None = 'c826575a73c3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ('platform_sponsors', 'sponsors'):
        op.add_column(
            table,
            sa.Column('category', sa.String(16), nullable=False, server_default='general'),
        )
    # A PNG copy of a club sponsor's logo, for the share images (the image
    # renderer reads PNG and JPEG, not WebP). Platform sponsors already had one.
    op.add_column('sponsors', sa.Column('logo_png_url', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('sponsors', 'logo_png_url')
    for table in ('platform_sponsors', 'sponsors'):
        op.drop_column(table, 'category')
