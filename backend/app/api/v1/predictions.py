"""Προγνωστικά — what the village thinks, with nothing riding on it.

No money, no accounts, no odds. A reader picks a side before kickoff and finds
out afterwards whether they were with the majority. The whole prize is being
able to say so.

Public, like the read side, but it writes — which is why it lives here rather
than in public.py: that file is read-only by design and its docstring says so.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import CurrentAssociation, DbSession
from app.models import League, Match, MatchPrediction
from app.models.enums import MatchStatus, PredictionChoice

router = APIRouter(prefix="/api/v1", tags=["predictions"])

#: Statuses that mean the question is settled and voting is pointless.
_CLOSED_STATUSES = (
    MatchStatus.LIVE,
    MatchStatus.HALFTIME,
    MatchStatus.FINISHED,
    MatchStatus.AWARDED,
    MatchStatus.CANCELLED,
)


class VoteIn(BaseModel):
    choice: PredictionChoice
    #: Generated and kept by the browser. Not an account, and deliberately not
    #: an IP: a village shares a handful of those, and two neighbours on one
    #: connection are two opinions.
    voter: str = Field(min_length=8, max_length=64)


class PollOut(BaseModel):
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


async def _match_or_404(association_id: int, match_id: int, db: DbSession) -> Match:
    match = (
        await db.execute(
            select(Match)
            .join(League, Match.league_id == League.id)
            .where(Match.id == match_id, League.association_id == association_id)
        )
    ).scalar_one_or_none()
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε αγώνας με id {match_id}.",
        )
    return match


def _is_open(match: Match, now: datetime) -> bool:
    """Voting closes at kickoff.

    Both conditions are needed. The status is the reliable signal once somebody
    is watching, and the clock covers the common case where nobody has marked
    the match live and it has been going for an hour.
    """
    if match.status in _CLOSED_STATUSES or match.is_live:
        return False
    if match.kickoff_at is None:
        # An undated fixture cannot have started, so the vote stays open.
        return True
    return now < match.kickoff_at


async def _tally(match: Match, voter: str | None, db: DbSession) -> PollOut:
    rows = (
        await db.execute(
            select(MatchPrediction.choice, func.count())
            .where(MatchPrediction.match_id == match.id)
            .group_by(MatchPrediction.choice)
        )
    ).all()
    counts = {choice: int(n) for choice, n in rows}

    mine = None
    if voter:
        mine = (
            await db.execute(
                select(MatchPrediction.choice).where(
                    MatchPrediction.match_id == match.id,
                    MatchPrediction.voter_token == voter,
                )
            )
        ).scalar_one_or_none()

    now = datetime.now(UTC)
    is_open = _is_open(match, now)
    revealed = mine is not None or not is_open

    return PollOut(
        match_id=match.id,
        open=is_open,
        # Zeroed until revealed, so the numbers cannot be read off the wire
        # before the reader has committed to an answer.
        total=sum(counts.values()) if revealed else 0,
        home=counts.get(PredictionChoice.HOME, 0) if revealed else 0,
        draw=counts.get(PredictionChoice.DRAW, 0) if revealed else 0,
        away=counts.get(PredictionChoice.AWAY, 0) if revealed else 0,
        mine=mine,
        revealed=revealed,
    )


@router.get(
    "/{association_slug}/matches/{match_id}/prognostiko", response_model=PollOut
)
async def get_poll(
    association: CurrentAssociation,
    match_id: int,
    db: DbSession,
    voter: Annotated[str | None, Query(max_length=64)] = None,
) -> PollOut:
    match = await _match_or_404(association.id, match_id, db)
    return await _tally(match, voter, db)


@router.post(
    "/{association_slug}/matches/{match_id}/prognostiko", response_model=PollOut
)
async def cast_vote(
    association: CurrentAssociation,
    match_id: int,
    payload: VoteIn,
    db: DbSession,
) -> PollOut:
    match = await _match_or_404(association.id, match_id, db)

    if not _is_open(match, datetime.now(UTC)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Η ψηφοφορία έκλεισε με τη σέντρα.",
        )

    # Upsert rather than read-then-write: changing your mind is one statement,
    # and two tabs voting at once cannot produce a duplicate-key error.
    await db.execute(
        insert(MatchPrediction)
        .values(
            match_id=match.id,
            voter_token=payload.voter,
            choice=payload.choice,
        )
        .on_conflict_do_update(
            constraint="uq_match_predictions",
            set_={"choice": payload.choice},
        )
    )
    await db.commit()

    return await _tally(match, payload.voter, db)
