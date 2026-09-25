"""integrity constraints

One current season per association, one row per pairing per round, an index
for squad lookups, and the boolean index on matches.is_live dropped (two
values; the planner never chose it).

Revision ID: a1c3e5f7b9d2
Revises: 65bae4f07b7b
Create Date: 2026-09-24 18:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c3e5f7b9d2'
down_revision: str | None = '65bae4f07b7b'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        'uq_seasons_one_current',
        'seasons',
        ['association_id'],
        unique=True,
        postgresql_where=sa.text('is_current'),
    )
    op.create_unique_constraint(
        'uq_matches_league_round_pairing',
        'matches',
        ['league_id', 'matchday', 'home_team_id', 'away_team_id'],
    )
    op.drop_index('ix_matches_live', table_name='matches')
    op.create_index(
        op.f('ix_player_stats_team_id'), 'player_stats', ['team_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_player_stats_team_id'), table_name='player_stats')
    op.create_index('ix_matches_live', 'matches', ['is_live'], unique=False)
    op.drop_constraint('uq_matches_league_round_pairing', 'matches', type_='unique')
    op.drop_index('uq_seasons_one_current', table_name='seasons')
