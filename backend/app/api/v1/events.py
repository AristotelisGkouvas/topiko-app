"""The live log: reading it, and writing it from the touchline.

Both halves live here because they are one feature. The read side is public
and unauthenticated — a ticker nobody can see is pointless — and the write side
needs `can_edit_live`, the permission that already means "trusted with a score
while the match is being played".

A per-club secretary role would be narrower still, and is the obvious next
step; it needs a grant table keyed on club rather than association, which
`user_associations` is not.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.auth_deps import CurrentUser, EditableAssociation, may_edit_live
from app.api.deps import CurrentAssociation, DbSession
from app.models import League, Match, MatchEvent
from app.models.enums import DataSource, MatchEventKind
from app.schemas import TeamRef
from app.services.audit import record
from app.services.match_events import apply_events
from app.services.standings import recompute_standings

router = APIRouter(prefix="/api/v1", tags=["events"])


class EventOut(BaseModel):
    id: int
    kind: MatchEventKind
    minute: int | None = None
    team: TeamRef | None = None
    player_name: str | None = None
    note: str | None = None
    created_at: datetime


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
    #: Which side. Required for anything that belongs to a team and refused
    #: for the markers that belong to the match, so a kickoff cannot be filed
    #: against ΑΤΛΑΣ.
    team_id: int | None = None
    minute: int | None = Field(default=None, ge=0, le=130)
    player_name: str | None = Field(default=None, max_length=160)
    note: str | None = None


#: Events that belong to the match rather than to either side.
_MATCH_WIDE = (
    MatchEventKind.KICKOFF,
    MatchEventKind.HALFTIME,
    MatchEventKind.SECOND_HALF,
    MatchEventKind.FULLTIME,
    MatchEventKind.NOTE,
)


async def _load(association_id: int, match_id: int, db: DbSession) -> Match:
    match = (
        await db.execute(
            select(Match)
            .options(selectinload(Match.events).selectinload(MatchEvent.team))
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


def _feed(match: Match) -> MatchFeedOut:
    return MatchFeedOut(
        match_id=match.id,
        home_score=match.home_score,
        away_score=match.away_score,
        minute=match.minute,
        is_live=match.is_live,
        status=match.status.value,
        events=[
            EventOut(
                id=e.id,
                kind=e.kind,
                minute=e.minute,
                team=TeamRef.model_validate(e.team) if e.team else None,
                player_name=e.player_name,
                note=e.note,
                created_at=e.created_at,
            )
            for e in match.events
        ],
    )


@router.get("/{association_slug}/matches/{match_id}/feed", response_model=MatchFeedOut)
async def match_feed(
    association: CurrentAssociation, match_id: int, db: DbSession
) -> MatchFeedOut:
    """The ticker. Public, and polled while a match is running."""
    return _feed(await _load(association.id, match_id, db))


@router.post(
    "/{association_slug}/editor/matches/{match_id}/events",
    response_model=MatchFeedOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_event(
    association: EditableAssociation,
    user: CurrentUser,
    match_id: int,
    payload: EventIn,
    request: Request,
    db: DbSession,
) -> MatchFeedOut:
    if not may_edit_live(user, association):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Δεν έχεις δικαίωμα καταγραφής ζωντανού αγώνα.",
        )

    match = await _load(association.id, match_id, db)

    if payload.kind in _MATCH_WIDE:
        if payload.team_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Αυτό το γεγονός δεν ανήκει σε ομάδα.",
            )
    else:
        if payload.team_id not in (match.home_team_id, match.away_team_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Η ομάδα δεν συμμετέχει σε αυτόν τον αγώνα.",
            )

    event = MatchEvent(
        match_id=match.id,
        kind=payload.kind,
        team_id=payload.team_id,
        minute=payload.minute,
        player_name=(payload.player_name or "").strip() or None,
        note=payload.note,
        created_by_id=user.id,
    )
    db.add(event)
    await db.flush()
    await db.refresh(match, ["events"])

    await _settle(match, user, association, request, db)
    # Reloaded rather than refreshed: the commit expired everything, and a
    # refresh brings back the events without their teams — which _feed then
    # lazy-loads, outside the greenlet asyncpg needs.
    return _feed(await _load(association.id, match_id, db))


@router.delete(
    "/{association_slug}/editor/matches/{match_id}/events/{event_id}",
    response_model=MatchFeedOut,
)
async def undo_event(
    association: EditableAssociation,
    user: CurrentUser,
    match_id: int,
    event_id: int,
    request: Request,
    db: DbSession,
) -> MatchFeedOut:
    """Take one event back.

    The score is recomputed rather than decremented, so an undo cannot leave
    the board disagreeing with the log it is supposed to summarise.
    """
    if not may_edit_live(user, association):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Δεν έχεις δικαίωμα καταγραφής ζωντανού αγώνα.",
        )

    match = await _load(association.id, match_id, db)
    event = next((e for e in match.events if e.id == event_id), None)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Δεν βρέθηκε το γεγονός σε αυτόν τον αγώνα.",
        )

    await db.delete(event)
    await db.flush()
    await db.refresh(match, ["events"])

    await _settle(match, user, association, request, db)
    # Reloaded rather than refreshed: the commit expired everything, and a
    # refresh brings back the events without their teams — which _feed then
    # lazy-loads, outside the greenlet asyncpg needs.
    return _feed(await _load(association.id, match_id, db))


async def _settle(
    match: Match,
    user: CurrentUser,
    association: EditableAssociation,
    request: Request,
    db: DbSession,
) -> None:
    """Bring the match row, the table and the audit trail in line with the log."""
    before = {"home_score": match.home_score, "away_score": match.away_score}

    apply_events(match, match.events)

    # Marked exactly like a typed-in score, so the reconciliation rules treat a
    # logged match the same way and the scraper defers to it for its window.
    match.last_manual_edit_at = datetime.now(UTC)
    match.data_source = DataSource.MANUAL_LIVE

    record(
        db,
        user=user,
        association=association,
        action="match.event",
        entity_type="match",
        entity_id=match.id,
        before=before,
        after={"home_score": match.home_score, "away_score": match.away_score},
        request=request,
    )

    league = await db.get(League, match.league_id)
    if league is not None:
        await recompute_standings(db, league)
    await db.commit()


@router.get("/{association_slug}/feed", response_model=list[MatchFeedOut])
async def association_feed(
    association: CurrentAssociation,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=30)] = 10,
) -> list[MatchFeedOut]:
    """Every match being played right now, with its log. Backs the matchday
    ticker, which is one request rather than one per match."""
    matches = (
        await db.execute(
            select(Match)
            .options(selectinload(Match.events).selectinload(MatchEvent.team))
            .join(League, Match.league_id == League.id)
            .where(League.association_id == association.id, Match.is_live.is_(True))
            .order_by(Match.kickoff_at.nulls_last(), Match.id)
            .limit(limit)
        )
    ).scalars()
    return [_feed(m) for m in matches]
