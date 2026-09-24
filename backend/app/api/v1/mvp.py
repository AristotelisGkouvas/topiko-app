"""Παίκτης της αγωνιστικής — reading the ballot and casting a vote.

Public and unauthenticated, like the match predictions. See `app.models.mvp`
for why a vote is tied to a browser token rather than to an account, and what
that costs.

The federation's side — opening a poll and choosing who is on it — lives in
`editor.py`, behind the same login as everything else that writes.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentAssociation, DbSession
from app.models import League, MvpCandidate, MvpPoll, MvpVote

router = APIRouter(prefix="/api/v1", tags=["mvp"])


class CandidateOut(BaseModel):
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


class PollOut(BaseModel):
    id: int
    league_slug: str
    league_name: str
    matchday: int
    closes_at: datetime | None = None
    open: bool
    candidates: list[CandidateOut] = []
    #: Which candidate this browser chose, if any.
    my_vote: int | None = None
    total_votes: int | None = None


class VoteIn(BaseModel):
    candidate_id: int
    #: Generated and kept by the browser. Long enough not to collide, opaque
    #: enough to mean nothing to anybody who sees it.
    voter_token: str = Field(min_length=16, max_length=64)


async def _latest_poll(association_id: int, db: DbSession) -> MvpPoll | None:
    return (
        await db.execute(
            select(MvpPoll)
            .join(League, MvpPoll.league_id == League.id)
            .where(MvpPoll.association_id == association_id)
            .options(
                selectinload(MvpPoll.league),
                selectinload(MvpPoll.candidates).selectinload(MvpCandidate.player),
                selectinload(MvpPoll.candidates).selectinload(MvpCandidate.team),
            )
            # Newest round first, and newest poll within it — a federation that
            # opens two in a week means the second.
            .order_by(MvpPoll.matchday.desc(), MvpPoll.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _describe(
    poll: MvpPoll, db: DbSession, voter_token: str | None
) -> PollOut:
    is_open = poll.closes_at is None or poll.closes_at > datetime.now(UTC)

    mine: int | None = None
    if voter_token:
        mine = (
            await db.execute(
                select(MvpVote.candidate_id).where(
                    MvpVote.poll_id == poll.id,
                    MvpVote.voter_token == voter_token,
                )
            )
        ).scalar_one_or_none()

    # Counts are attached only once this reader has had their say, or once the
    # poll has closed and there is nothing left to influence.
    show_counts = mine is not None or not is_open
    counts: dict[int, int] = {}
    total: int | None = None
    if show_counts:
        rows = (
            await db.execute(
                select(MvpVote.candidate_id, func.count(MvpVote.id))
                .where(MvpVote.poll_id == poll.id)
                .group_by(MvpVote.candidate_id)
            )
        ).all()
        counts = {candidate_id: n for candidate_id, n in rows}
        total = sum(counts.values())

    return PollOut(
        id=poll.id,
        league_slug=poll.league.slug,
        league_name=poll.league.short_name or poll.league.name,
        matchday=poll.matchday,
        closes_at=poll.closes_at,
        open=is_open,
        my_vote=mine,
        total_votes=total,
        candidates=[
            CandidateOut(
                id=c.id,
                player_slug=c.player.slug,
                player_name=c.player.name,
                team_name=(c.team.short_name or c.team.name) if c.team else None,
                team_slug=c.team.slug if c.team else None,
                reason=c.reason,
                votes=counts.get(c.id, 0) if show_counts else None,
            )
            for c in poll.candidates
        ],
    )


@router.get("/{association_slug}/mvp", response_model=PollOut | None)
async def current_poll(
    association: CurrentAssociation,
    db: DbSession,
    voter_token: str | None = None,
) -> PollOut | None:
    """The most recent ballot, or null when the federation has opened none."""
    poll = await _latest_poll(association.id, db)
    if poll is None:
        return None
    return await _describe(poll, db, voter_token)


@router.post("/{association_slug}/mvp/{poll_id}/vote", response_model=PollOut)
async def vote(
    association: CurrentAssociation,
    poll_id: int,
    payload: VoteIn,
    db: DbSession,
) -> PollOut:
    """Cast or change a vote.

    Changing is allowed until the poll closes. A ballot nobody can correct
    turns a mistap into a complaint, and there is nothing at stake here that
    makes finality worth that.
    """
    poll = (
        await db.execute(
            select(MvpPoll)
            .where(MvpPoll.id == poll_id, MvpPoll.association_id == association.id)
            .options(
                selectinload(MvpPoll.league),
                selectinload(MvpPoll.candidates).selectinload(MvpCandidate.player),
                selectinload(MvpPoll.candidates).selectinload(MvpCandidate.team),
            )
        )
    ).scalar_one_or_none()
    if poll is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Δεν βρέθηκε ψηφοφορία."
        )

    if poll.closes_at is not None and poll.closes_at <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Η ψηφοφορία έκλεισε."
        )

    if not any(c.id == payload.candidate_id for c in poll.candidates):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ο παίκτης δεν είναι υποψήφιος σε αυτή την ψηφοφορία.",
        )

    await db.execute(
        insert(MvpVote)
        .values(
            poll_id=poll.id,
            candidate_id=payload.candidate_id,
            voter_token=payload.voter_token,
        )
        .on_conflict_do_update(
            constraint="uq_mvp_vote",
            set_={"candidate_id": payload.candidate_id},
        )
    )
    await db.commit()

    return await _describe(poll, db, payload.voter_token)
