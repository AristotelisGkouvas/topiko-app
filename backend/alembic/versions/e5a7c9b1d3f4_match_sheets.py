"""match sheets: timeline and line-ups from the federation's report

Revision ID: e5a7c9b1d3f4
Revises: d4f6b8a0c2e3
Create Date: 2026-09-28 20:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e5a7c9b1d3f4'
down_revision: str | None = 'd4f6b8a0c2e3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('sheet_fetched_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('matches', sa.Column('officials', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.create_table(
        'match_sheet_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('match_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('team_id', sa.Integer(), nullable=True),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('minute', sa.Integer(), nullable=True),
        sa.Column('stoppage', sa.Integer(), nullable=True),
        sa.Column('player_id', sa.Integer(), nullable=True),
        sa.Column('player_name', sa.String(length=160), nullable=True),
        sa.Column('score', sa.String(length=9), nullable=True),
        sa.ForeignKeyConstraint(['match_id'], ['matches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_match_sheet_events_match', 'match_sheet_events', ['match_id', 'position'])
    op.create_index(op.f('ix_match_sheet_events_player_id'), 'match_sheet_events', ['player_id'])

    op.create_table(
        'match_lineups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('match_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('team_id', sa.Integer(), nullable=True),
        sa.Column('player_id', sa.Integer(), nullable=True),
        sa.Column('player_name', sa.String(length=160), nullable=False),
        sa.Column('birth_year', sa.Integer(), nullable=True),
        sa.Column('starter', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['match_id'], ['matches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_match_lineups_match', 'match_lineups', ['match_id', 'position'])
    op.create_index(op.f('ix_match_lineups_player_id'), 'match_lineups', ['player_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_match_lineups_player_id'), table_name='match_lineups')
    op.drop_index('ix_match_lineups_match', table_name='match_lineups')
    op.drop_table('match_lineups')
    op.drop_index(op.f('ix_match_sheet_events_player_id'), table_name='match_sheet_events')
    op.drop_index('ix_match_sheet_events_match', table_name='match_sheet_events')
    op.drop_table('match_sheet_events')
    op.drop_column('matches', 'officials')
    op.drop_column('matches', 'sheet_fetched_at')
