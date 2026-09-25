"""The live log: reading it, and writing it from the touchline.

Both halves live here because they are one feature. The read side is public
and unauthenticated — a ticker nobody can see is pointless — and the write side
needs `can_edit_live`, the permission that already means "trusted with a score
while the match is being played".

The narrower per-club role now exists too, in `volunteer.py`: a code instead
of an account, good for one club's matches and nothing else. Both write
through `app.services.events`, so both kinds of author land in the same log
under the same rules.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.auth_deps import CurrentUser, EditableAssociation, may_edit_live
from app.api.deps import CurrentAssociation, DbSession
from app.models import League, Match, MatchEvent
from app.schemas.events import EventIn, MatchFeedOut
from app.services.events import feed_of, load_match, record_event, remove_event
from app.services.live import LIVE_WINDOW

router = APIRouter(prefix="/api/v1", tags=["events"])


@router.get("/{association_slug}/matches/{match_id}/feed", response_model=MatchFeedOut)
async def matchfeed_of(
    association: CurrentAssociation, match_id: int, db: DbSession
) -> MatchFeedOut:
    """The ticker. Public, and polled while a match is running."""
    return feed_of(await load_match(association.id, match_id, db))


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

    match = await load_match(association.id, match_id, db)
    return await record_event(
        match, payload, association=association, request=request, db=db, user=user
    )


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
    if not may_edit_live(user, association):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Δεν έχεις δικαίωμα καταγραφής ζωντανού αγώνα.",
        )

    match = await load_match(association.id, match_id, db)
    return await remove_event(
        match, event_id, association=association, request=request, db=db, user=user
    )


@router.get("/{association_slug}/feed", response_model=list[MatchFeedOut])
async def associationfeed_of(
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
            .where(
                League.association_id == association.id,
                Match.is_live.is_(True),
                # Same window as the public strip. A ticker and a strip that
                # disagree about what is live is worse than either being wrong.
                Match.kickoff_at.is_not(None),
                Match.kickoff_at <= func.now(),
                Match.kickoff_at > func.now() - LIVE_WINDOW,
            )
            .order_by(Match.kickoff_at.nulls_last(), Match.id)
            .limit(limit)
        )
    ).scalars()
    return [feed_of(m) for m in matches]
