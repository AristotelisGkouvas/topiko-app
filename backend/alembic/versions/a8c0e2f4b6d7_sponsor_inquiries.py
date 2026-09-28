"""sponsor inquiries: the "Γίνε χορηγός" form

Revision ID: a8c0e2f4b6d7
Revises: f7b9d1c3e5a6
Create Date: 2026-09-28 22:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a8c0e2f4b6d7'
down_revision: str | None = 'f7b9d1c3e5a6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'sponsor_inquiries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('association_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('business', sa.String(length=160), nullable=True),
        sa.Column('contact', sa.String(length=160), nullable=False),
        sa.Column('club', sa.String(length=160), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('handled', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['association_id'], ['associations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sponsor_inquiries_association_id'), 'sponsor_inquiries', ['association_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_sponsor_inquiries_association_id'), table_name='sponsor_inquiries')
    op.drop_table('sponsor_inquiries')
