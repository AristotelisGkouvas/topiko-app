"""The two kinds of vote a reader can cast: a match prediction and the player
of the matchday. Named apart — two schemas both called `PollOut` come out of
the OpenAPI document as module-path names nobody can read."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import PredictionChoice


# --- Match prediction -----------------------------------------------------

class PredictionVoteIn(BaseModel):
    choice: PredictionChoice
    #: Generated and kept by the browser. Not an account, and deliberately not
    #: an IP: a village shares a handful of those, and two neighbours on one
    #: connection are two opinions.
    voter: str = Field(min_length=8, max_length=64)


class PredictionPollOut(BaseModel):
    match_id: int
    open: bool
    total: int = 0
    home: int = 0
    draw: int = 0
    away: int = 0
    #: What this browser picked, if anything.
    mine: PredictionChoice | None = None
    #: False until this reader has voted or the match has started. Showing the
    #: split first turns a prediction into a poll about the poll.
    revealed: bool = False


# --- Player of the matchday ----------------------------------------------

class MvpCandidateOut(BaseModel):
    id: int
    player_slug: str
    player_name: str
    team_name: str | None = None
    team_slug: str | None = None
    reason: str | None = None
    #: Null until the reader has voted. The design shows the tally afterwards,
    #: and only afterwards: a ballot that displays a running count is a ballot
    #: that tells the undecided what to pick.
    votes: int | None = None


class MvpPollOut(BaseModel):
    id: int
    league_slug: str
    league_name: str
    matchday: int
    closes_at: datetime | None = None
    open: bool
    candidates: list[MvpCandidateOut] = []
    #: Which candidate this browser chose, if any.
    my_vote: int | None = None
    total_votes: int | None = None


class MvpVoteIn(BaseModel):
    candidate_id: int
    #: Generated and kept by the browser. Long enough not to collide, opaque
    #: enough to mean nothing to anybody who sees it.
    voter_token: str = Field(min_length=16, max_length=64)


# --- Opening a ballot (editor) --------------------------------------------

class MvpCandidateIn(BaseModel):
    player_slug: str = Field(min_length=1, max_length=140)
    team_slug: str | None = Field(default=None, max_length=120)
    #: Why they are on the list — "3 γκολ", "κράτησε το μηδέν".
    reason: str | None = Field(default=None, max_length=120)


class MvpPollIn(BaseModel):
    league_slug: str = Field(min_length=1, max_length=120)
    matchday: int = Field(ge=1, le=60)
    closes_at: datetime | None = None
    candidates: list[MvpCandidateIn] = Field(min_length=2, max_length=12)


class MvpPollCreatedOut(BaseModel):
    id: int
    league_slug: str
    matchday: int
    closes_at: datetime | None = None
    candidates: int
