from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import DataSource, MatchStatus, StandingZone
from app.schemas.catalog import FieldRef, LeagueOut, TeamRef
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


class MatchDetailOut(ORMModel):
    """One match, with the context a reader wants once they stop scanning a list.

    A card in a fixture list answers "what is the score". Opening it asks
    different questions — which division is this, how have these two done
    against each other, where do they stand — so the extra queries happen here
    rather than being loaded for every row of every list.
    """

    match: MatchOut
    league: LeagueOut
    #: Earlier meetings of the same two clubs, newest first, across seasons.
    #: Home and away are as played, not as in this fixture.
    head_to_head: list[MatchOut] = []
    home_standing: StandingOut | None = None
    away_standing: StandingOut | None = None


class LiveStandingOut(StandingOut):
    """A projected row.

    `actual_position` is where the official table has the club, so the client
    can draw the movement without asking for the real table as well — and
    without inferring it from a previous poll, which would show a club moving
    every time somebody else scored.
    """

    actual_position: int | None = None


class LiveTableOut(ORMModel):
    rows: list[LiveStandingOut] = []
    #: How many matches in this competition are being played right now. Zero
    #: means the projection equals the real table, and the client says so
    #: rather than implying something is happening.
    live_matches: int = 0


class MatchDayOut(BaseModel):
    """One day of football across the whole federation.

    Carries its neighbours with it. The client needs to know which way it may
    step before it draws the arrows, and "the next day with a match" is a
    question only the database can answer — guessing "+1 day" walks a reader
    through an empty week in July one tap at a time.
    """

    date: date
    matches: list[MatchOut] = []
    #: Nearest earlier day that has a match, or null at the start of the record.
    previous_date: date | None = None
    next_date: date | None = None
