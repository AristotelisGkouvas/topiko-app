"""The live log on the wire."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import MatchEventKind
from app.schemas.catalog import TeamRef


class EventOut(BaseModel):
    id: int
    kind: MatchEventKind
    minute: int | None = None
    team: TeamRef | None = None
    player_name: str | None = None
    note: str | None = None
    created_at: datetime
    #: Who typed it, as a kind rather than a person: the club's volunteer
    #: or the federation's desk. Readers quote a live score and need to know
    #: which of the two they are quoting.
    reported_by: Literal["club", "association"] | None = None


class MatchFeedOut(BaseModel):
    match_id: int
    home_score: int | None = None
    away_score: int | None = None
    minute: int | None = None
    is_live: bool = False
    status: str
    #: Newest last, the order they happened in.
    events: list[EventOut] = []


class EventIn(BaseModel):
    kind: MatchEventKind
    #: Named by the device before sending. A phone at a ground with no signal
    #: queues events and flushes them later; without this, a request that
    #: arrived but whose reply was lost would be retried and put the goal on
    #: the board twice.
    client_id: str | None = Field(default=None, min_length=8, max_length=64)
    #: Which side. Required for anything that belongs to a team and refused
    #: for the markers that belong to the match, so a kickoff cannot be filed
    #: against ΑΤΛΑΣ.
    team_id: int | None = None
    minute: int | None = Field(default=None, ge=0, le=130)
    player_name: str | None = Field(default=None, max_length=160)
    note: str | None = None
