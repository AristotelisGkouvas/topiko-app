"""Writing the live log, and everything that follows from one entry.

Shared by the dashboard (`api/v1/events.py`) and by a club's own
representative (`api/v1/volunteer.py`). The two differ in who may call and how
the author is written down; the rest — idempotency, the score, the table, the
audit row, the notification — is one piece of work, and lives here so that
neither router reaches into the other.

The caller has already established that the author may touch the match.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.lookups import match_in
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
from app.schemas.catalog import TeamRef
from app.schemas.events import EventIn, EventOut, MatchFeedOut
from app.services.audit import record
from app.services.live import effective
from app.services.match_events import apply_events
from app.services.notify_prefs import group_for
from app.services.push import notify_team
from app.services.standings import recompute_standings

logger = logging.getLogger(__name__)

#: Events that belong to the match rather than to either side.
_MATCH_WIDE = (
    MatchEventKind.KICKOFF,
    MatchEventKind.HALFTIME,
    MatchEventKind.SECOND_HALF,
    MatchEventKind.FULLTIME,
    MatchEventKind.POSTPONED,
    MatchEventKind.ABANDONED,
    MatchEventKind.NOTE,
)


#: How long a club code may take back its own entry. The screen's own limit
#: is a minute; the rest is for a request that took its time to arrive.
CODE_UNDO_WINDOW = timedelta(seconds=90)

#: Entries that belong at the very end of the log and need no minute to sort
#: there.
_LAST = (MatchEventKind.FULLTIME, MatchEventKind.POSTPONED, MatchEventKind.ABANDONED)


def _minute_for(payload: EventIn, match: Match) -> int | None:
    """The minute to file an entry under when nobody typed one.

    The log is ordered by minute, nulls last. A kickoff pressed before the
    clock started had no minute, so it sorted after every goal — and "undo
    last" took back the kickoff instead of the goal just entered. So:

    - a kickoff is minute 0, always first;
    - full time, a postponement or an abandonment stays unminuted: last is
      where they belong;
    - anything else goes in at the latest minute already recorded, which is
      where it happened — after everything logged so far.
    """
    if payload.minute is not None:
        return payload.minute
    if payload.kind is MatchEventKind.KICKOFF:
        return 0
    if payload.kind in _LAST:
        return None
    return max((e.minute for e in match.events if e.minute is not None), default=None)


async def load_match(association_id: int, match_id: int, db: AsyncSession) -> Match:
    """The match with its whole log, teams included, inside the tenant."""
    return await match_in(
        db,
        association_id,
        match_id,
        selectinload(Match.events).selectinload(MatchEvent.team),
    )


def feed_of(match: Match) -> MatchFeedOut:
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
                reported_by=(
                    "club"
                    if e.created_by_code_id is not None
                    else "association"
                    if e.created_by_id is not None
                    else None
                ),
            )
            for e in match.events
        ],
    )


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
            return feed_of(match)

    event = MatchEvent(
        match_id=match.id,
        client_id=payload.client_id,
        kind=payload.kind,
        team_id=payload.team_id,
        minute=_minute_for(payload, match),
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
    fresh = await load_match(association.id, match.id, db)
    # After the commit, so a failed push cannot roll back the goal.
    await _announce(fresh, event, db)
    # Reloaded rather than refreshed: the commit expired everything, and a
    # refresh brings back the events without their teams — which _feed then
    # lazy-loads, outside the greenlet asyncpg needs.
    return feed_of(fresh)


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
    if code is not None:
        # A club code takes back only its own entry, and only straight away.
        # Both clubs can hold a code for the same match; without this either
        # could delete the other's goals for as long as the window is open.
        # The screen offers undo for a minute; the server allows a little
        # more for a slow network. After that, it is the federation's call.
        if event.created_by_code_id != code.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Μπορείς να αναιρέσεις μόνο δικές σου καταχωρίσεις.",
            )
        if datetime.now(UTC) - event.created_at > CODE_UNDO_WINDOW:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Πέρασε το λεπτό για αναίρεση. Για διόρθωση, ενημέρωσε την ένωση.",
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
    return feed_of(await load_match(association.id, match.id, db))


def _actor(user: User | None, code: ClubAccessCode | None) -> str | None:
    """What to write in the trail when there is no account behind the change."""
    if user is not None:
        return None
    if code is not None:
        return f"{code.prefix} · {code.team.name}"
    return None


#: Which events can produce a notification at all.
#:
#: Was a fixed four. Now it is "anything a reader has a switch for", and the
#: switch decides — cards are off by default and can be turned on, which is the
#: same outcome for somebody who never opens the settings and a better one for
#: somebody who wants them. See `app.services.notify_prefs`.


def replaces_typed_score(before: dict[str, int | None], events: list[MatchEvent]) -> bool:
    """Whether this entry is the one that makes the log the score.

    Once a match has a sheet, the sheet is the score — including when somebody
    had already typed one in. That typed score is not wrong to replace (the
    person at the ground knows better than the dashboard), but it is worth
    recording that it happened: the first event on a scored match.
    """
    return len(events) == 1 and (
        before["home_score"] is not None or before["away_score"] is not None
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
    replaced = replaces_typed_score(before, match.events)

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
        after={
            "home_score": match.home_score,
            "away_score": match.away_score,
            # Said outright, so the trail shows a typed result being replaced
            # rather than a score that silently went from 3–4 to 0–1.
            **({"replaced_typed_score": True} if replaced else {}),
        },
        request=request,
    )

    league = await db.get(League, match.league_id)
    if league is not None:
        await recompute_standings(db, league)
    await db.commit()


async def _announce(match: Match, event: MatchEvent, db: AsyncSession) -> None:
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
    elif event.kind is MatchEventKind.POSTPONED:
        title = "Αναβολή"
    elif event.kind is MatchEventKind.ABANDONED:
        title = "Διακοπή"
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
