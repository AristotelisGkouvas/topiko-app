from datetime import datetime

from app.models.enums import DataSource, MatchStatus, StandingZone
from app.schemas.catalog import FieldRef, TeamRef
from app.schemas.common import ORMModel


class MatchOut(ORMModel):
    id: int
    league_id: int
    matchday: int | None = None
    kickoff_at: datetime | None = None
    status: MatchStatus
    is_live: bool
    minute: int | None = None

    home_team: TeamRef
    away_team: TeamRef
    home_score: int | None = None
    away_score: int | None = None
    home_score_ht: int | None = None
    away_score_ht: int | None = None

    field: FieldRef | None = None
    referee: str | None = None
    note: str | None = None

    # Exposed publicly on purpose: a live score typed in by an editor is not the
    # same claim as one lifted from the federation site, and the card says so.
    data_source: DataSource
    updated_at: datetime


class StandingOut(ORMModel):
    team: TeamRef
    position: int
    previous_position: int | None = None
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int
    form: str | None = None
    zone: StandingZone | None = None
