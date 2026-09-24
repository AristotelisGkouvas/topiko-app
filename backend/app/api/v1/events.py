"""The live log: reading it, and writing it from the touchline.

Both halves live here because they are one feature. The read side is public
and unauthenticated — a ticker nobody can see is pointless — and the write side
needs `can_edit_live`, the permission that already means "trusted with a score
while the match is being played".

The narrower per-club role now exists too, in `volunteer.py`: a code instead
of an account, good for one club's matches and nothing else. It writes through
`record_event` below, so both kinds of author land in the same log under the
same rules.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth_deps import CurrentUser, EditableAssociation, may_edit_live
from app.api.deps import CurrentAssociation, DbSession
from app.models import (
    Association,
    ClubAccessCode,
    League,
    Match,
    MatchEvent,
    Team,
    User,
)
from app.models.enums import DataSource, MatchEventKind
from app.schemas import TeamRef
from app.services.audit import record
from app.services.live import LIVE_WINDOW, effective
from app.services.notify_prefs import group_for
from app.services.match_events import apply_events
from app.services.push import notify_team
from app.services.standings import recompute_standings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["events"])

#: Which events can produce a notification at all.
#:
#: Was a fixed four. Now it is "anything a reader has a switch for", and the
#: switch decides — cards are off by default and can be turned on, which is the
#: same outcome for somebody who never opens the settings and a better one for
#: somebody who wants them. See `app.services.notify_prefs`.


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
    # Through the same clock check as every other view of a match. This builds
    # its payload by hand rather than from MatchOut, so it would otherwise be
    # the one place still reporting a stale live flag.
    status, is_live = effective(
        status=match.status,
        is_live=match.is_live,
        kickoff_at=match.kickoff_at,
        home_score=match.home_score,
        away_score=match.away_score,
    )
    return MatchFeedOut(
        match_id=match.id,
        home_score=match.home_score,
        away_score=match.away_score,
        minute=match.minute,
        is_live=is_live,
        status=status.value,
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


async def record_event(
    match: Match,
    payload: EventIn,
    *,
    association: Association,
    request: Request,
    db: AsyncSession,
    user: User | None = None,
    code: ClubAccessCode | None = None,
) -> MatchFeedOut:
    """Put one event in the log and bring everything else in line with it.

    Shared by the dashboard and by a club's own representative. The two differ
    in who may call it and in how the author is written down; everything after
    that — the idempotency check, the score, the table, the audit row and the
    notification — is the same work, and a second copy of it would be a second
    place for the score to come out differently.

    The caller has already established that this author may touch this match.
    """
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

    if payload.client_id:
        already = next(
            (e for e in match.events if e.client_id == payload.client_id), None
        )
        if already is not None:
            # A replay of something already recorded. Answering with the feed
            # rather than an error is what lets the phone retry blindly until
            # it gets through.
            return _feed(match)

    event = MatchEvent(
        match_id=match.id,
        client_id=payload.client_id,
        kind=payload.kind,
        team_id=payload.team_id,
        minute=payload.minute,
        player_name=(payload.player_name or "").strip() or None,
        note=payload.note,
        created_by_id=user.id if user else None,
        created_by_code_id=code.id if code else None,
    )
    db.add(event)
    await db.flush()
    await db.refresh(match, ["events"])

    await _settle(
        match,
        association=association,
        request=request,
        db=db,
        user=user,
        actor=_actor(user, code),
    )
    fresh = await _load(association.id, match.id, db)
    # After the commit, so a failed push cannot roll back the goal.
    await _announce(fresh, event, db)
    # Reloaded rather than refreshed: the commit expired everything, and a
    # refresh brings back the events without their teams — which _feed then
    # lazy-loads, outside the greenlet asyncpg needs.
    return _feed(fresh)


async def remove_event(
    match: Match,
    event_id: int,
    *,
    association: Association,
    request: Request,
    db: AsyncSession,
    user: User | None = None,
    code: ClubAccessCode | None = None,
) -> MatchFeedOut:
    """Take one event back, recomputing from what is left.

    The score is recomputed rather than decremented, so an undo cannot leave
    the board disagreeing with the log it is supposed to summarise.
    """
    event = next((e for e in match.events if e.id == event_id), None)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Δεν βρέθηκε το γεγονός σε αυτόν τον αγώνα.",
        )

    await db.delete(event)
    await db.flush()
    await db.refresh(match, ["events"])

    await _settle(
        match,
        association=association,
        request=request,
        db=db,
        user=user,
        actor=_actor(user, code),
    )
    # Reloaded rather than refreshed, for the same reason as above.
    return _feed(await _load(association.id, match.id, db))


def _actor(user: User | None, code: ClubAccessCode | None) -> str | None:
    """What to write in the trail when there is no account behind the change."""
    if user is not None:
        return None
    if code is not None:
        return f"{code.prefix} · {code.team.name}"
    return None


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

    match = await _load(association.id, match_id, db)
    return await remove_event(
        match, event_id, association=association, request=request, db=db, user=user
    )


async def _settle(
    match: Match,
    *,
    association: Association,
    request: Request,
    db: AsyncSession,
    user: User | None = None,
    actor: str | None = None,
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
        actor=actor,
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


async def _announce(match: Match, event: MatchEvent, db: DbSession) -> None:
    """Tell the people following either club.

    Both sides, because a goal is news to whoever follows either of them — and
    only for the events somebody would want their phone to buzz for. A card in
    the 23rd minute is not one of them.
    """
    if group_for(event.kind) is None:
        return

    home = await db.get(Team, match.home_team_id)
    away = await db.get(Team, match.away_team_id)
    if home is None or away is None:
        return

    league = await db.get(League, match.league_id)
    if league is None:
        return

    if event.kind is MatchEventKind.FULLTIME:
        title = "Τελικό"
    else:
        title = "ΓΚΟΛ"

    body = (
        f"{home.short_name or home.name} {match.home_score or 0}"
        f"–{match.away_score or 0} {away.short_name or away.name}"
    )
    if event.minute is not None and event.kind is not MatchEventKind.FULLTIME:
        body += f"  ({event.minute}′)"

    try:
        await notify_team(
            db,
            association_id=league.association_id,
            team_slugs=[home.slug, away.slug],
            title=title,
            body=body,
            url=f"/agones/{match.id}",
            # So a reader who turned cards off does not get one anyway.
            kind=event.kind,
        )
        await db.commit()
    except Exception:  # noqa: BLE001
        # A push service being down must not undo a goal that was recorded.
        logger.exception("Αποτυχία ειδοποιήσεων για τον αγώνα %s", match.id)


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
    return [_feed(m) for m in matches]
