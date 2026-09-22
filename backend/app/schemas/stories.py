"""Schemas for the pages built out of the archive rather than out of this week.

Thirteen seasons of results answer questions the federation's own site never
asks: how these two clubs stand after sixty-five meetings, what happened on
this date, which scoreline nobody has beaten.
"""

from datetime import date

from app.schemas.catalog import TeamRef
from app.schemas.common import ORMModel
from app.schemas.match import MatchOut


class HeadToHeadOut(ORMModel):
    """The record between two clubs, across every season on file."""

    home: TeamRef
    away: TeamRef
    #: Wins for `home`, wherever the match was played.
    home_wins: int = 0
    away_wins: int = 0
    draws: int = 0
    home_goals: int = 0
    away_goals: int = 0
    played: int = 0
    first_meeting: date | None = None
    last_meeting: date | None = None
    #: Newest first, capped — the point is the record, not a full archive.
    matches: list[MatchOut] = []


class OnThisDayOut(ORMModel):
    day: int
    month: int
    matches: list[MatchOut] = []


class RecordMatchOut(ORMModel):
    """A match that holds a record, with the number that earned it."""

    match: MatchOut
    value: int


class TopScorerAllTimeOut(ORMModel):
    player_id: int
    player_slug: str
    player_name: str
    goals: int
    seasons: int


class RecordsOut(ORMModel):
    biggest_wins: list[RecordMatchOut] = []
    highest_scoring: list[RecordMatchOut] = []
    top_scorers: list[TopScorerAllTimeOut] = []
    total_matches: int = 0
    total_goals: int = 0
    seasons_covered: int = 0
