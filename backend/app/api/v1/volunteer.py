"""The club representative's own small corner of the site.

A different kind of caller from everything in `editor.py`. An editor has an
account and reaches the whole federation; a representative has a piece of paper
with a code on it and reaches exactly one club's matches. Keeping them in
separate routers is what makes "can this request touch another club?"
answerable by reading the file rather than by tracing a permission flag.

The session is a separate cookie too, not the editor's. One browser could hold
both, and a volunteer logging out should not sign the editor out of the
dashboard.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentAssociation, CurrentSeason, DbSession
from app.core.config import settings
from app.core.security import create_access_token, decode_access_token
from app.models import ClubAccessCode, League, Match
from app.api.v1.events import (
    EventIn,
    MatchFeedOut,
    _feed,
    _load,
    record_event,
    remove_event,
)
from app.schemas import MatchOut
from app.services import volunteer as service

router = APIRouter(prefix="/api/v1", tags=["volunteer"])

#: Its own cookie. See the module docstring.
COOKIE = f"{settings.session_cookie}_ethelontis"

#: Marks a token as a club code rather than an account, so a token from one
#: side can never be mistaken for the other even if the cookies were swapped.
SCOPE = "club"

#: How long before kickoff a representative may start reporting, and how long
#: after it they may still be doing so. Outside this they are looking at
#: history, and a live log written over a finished match replaces the official
#: score with whatever the log happens to contain — which for an empty log is
#: no score at all.
REPORT_FROM = timedelta(hours=3)
REPORT_UNTIL = timedelta(hours=6)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Χρειάζεται κωδικός σωματείου.",
)


class CodeIn(BaseModel):
    code: str = Field(min_length=4, max_length=40)


class VolunteerOut(BaseModel):
    team_slug: str
    team_name: str
    label: str | None = None


@router.post("/{association_slug}/ethelontis/login", response_model=VolunteerOut)
async def login(
    association: CurrentAssociation,
    payload: CodeIn,
    response: Response,
    db: DbSession,
) -> VolunteerOut:
    code = await service.authenticate(
        db, association_id=association.id, raw=payload.code
    )
    # Committed either way: a failed attempt has to leave its mark on the
    # counter, or the lockout never arrives.
    if code is None:
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Λάθος κωδικός.",
        )

    # Read before the commit expires the instance, and eagerly, because the
    # team is wanted after it.
    code_id = code.id
    await db.commit()

    fresh = (
        await db.execute(
            select(ClubAccessCode)
            .where(ClubAccessCode.id == code_id)
            .options(selectinload(ClubAccessCode.team))
        )
    ).scalar_one()

    token, expires_at = create_access_token(
        fresh.id, f"{fresh.prefix}@{association.slug}", SCOPE
    )
    response.set_cookie(
        key=COOKIE,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=int((expires_at - datetime.now(UTC)).total_seconds()),
        path="/",
    )
    return VolunteerOut(
        team_slug=fresh.team.slug, team_name=fresh.team.name, label=fresh.label
    )


@router.post(
    "/{association_slug}/ethelontis/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def logout(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


async def get_current_code(
    request: Request, association: CurrentAssociation, db: DbSession
) -> ClubAccessCode:
    """The club this request is acting as, from its own cookie."""
    token = request.cookies.get(COOKIE)
    if not token:
        raise _UNAUTHENTICATED

    claims = decode_access_token(token)
    # The role claim is checked, not assumed: a token minted for an account
    # must not open this door even if it arrives in this cookie.
    if claims is None or claims.get("role") != SCOPE:
        raise _UNAUTHENTICATED

    try:
        code_id = int(claims["sub"])
    except (KeyError, TypeError, ValueError):
        raise _UNAUTHENTICATED from None

    code = (
        await db.execute(
            select(ClubAccessCode)
            .where(
                ClubAccessCode.id == code_id,
                ClubAccessCode.association_id == association.id,
            )
            .options(selectinload(ClubAccessCode.team))
        )
    ).scalar_one_or_none()

    # Re-read every request rather than trusting the token: a code that has
    # been withdrawn has to stop working now, not when the session expires.
    if code is None or not code.is_active:
        raise _UNAUTHENTICATED
    return code


CurrentCode = Annotated[ClubAccessCode, Depends(get_current_code)]


@router.get("/{association_slug}/ethelontis/me", response_model=VolunteerOut)
async def me(code: CurrentCode) -> VolunteerOut:
    return VolunteerOut(
        team_slug=code.team.slug, team_name=code.team.name, label=code.label
    )


@router.get(
    "/{association_slug}/ethelontis/matches", response_model=list[MatchOut]
)
async def my_matches(
    association: CurrentAssociation,
    code: CurrentCode,
    season: CurrentSeason,
    db: DbSession,
) -> list[Match]:
    """This club's matches, and no others.

    The filter is on the code's own team_id rather than on anything the caller
    sent. There is no parameter here to get wrong.
    """
    result = await db.execute(
        select(Match)
        .options(
            selectinload(Match.home_team),
            selectinload(Match.away_team),
            selectinload(Match.field),
        )
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            League.season_id == season.id,
            or_(
                Match.home_team_id == code.team_id,
                Match.away_team_id == code.team_id,
            ),
        )
        .order_by(Match.kickoff_at.nulls_last(), Match.id)
    )
    return list(result.scalars())


async def _own_match(
    association_id: int, code: ClubAccessCode, match_id: int, db: DbSession
) -> Match:
    """The match, if it is this club's. A 404 otherwise, not a 403.

    Deliberately the same answer as for a match that does not exist: telling a
    code holder that some other match id is real, just not theirs, hands them a
    way to enumerate the federation's fixtures from a club code.
    """
    match = await _load(association_id, match_id, db)
    if code.team_id not in (match.home_team_id, match.away_team_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε αγώνας με id {match_id}.",
        )
    return match


def _within_window(match: Match) -> None:
    """Refuse to report on a match that is not happening around now.

    A club reports its own game from the touchline. Letting the same code reach
    a fixture from last November means one mistyped id can wipe a recorded
    result — the live log becomes the score, and a log with nothing in it is no
    score. An editor can still fix anything, at any time; that is what the
    account is for.
    """
    if match.kickoff_at is None:
        # No kickoff time means no window to be inside. The editor handles it.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ο αγώνας δεν έχει ώρα έναρξης. Μίλα με την ένωση.",
        )

    now = datetime.now(UTC)
    if now < match.kickoff_at - REPORT_FROM:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ο αγώνας δεν έχει ξεκινήσει ακόμη.",
        )
    if now > match.kickoff_at + REPORT_UNTIL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Πέρασε η ώρα του αγώνα. Για διόρθωση, μίλα με την ένωση.",
        )


@router.get(
    "/{association_slug}/ethelontis/matches/{match_id}/feed",
    response_model=MatchFeedOut,
)
async def my_feed(
    association: CurrentAssociation,
    code: CurrentCode,
    match_id: int,
    db: DbSession,
) -> MatchFeedOut:
    return _feed(await _own_match(association.id, code, match_id, db))


@router.post(
    "/{association_slug}/ethelontis/matches/{match_id}/events",
    response_model=MatchFeedOut,
    status_code=status.HTTP_201_CREATED,
)
async def report_event(
    association: CurrentAssociation,
    code: CurrentCode,
    match_id: int,
    payload: EventIn,
    request: Request,
    db: DbSession,
) -> MatchFeedOut:
    """Report something from this club's match.

    Both sides' goals, not only this club's: a scoreline with one team's goals
    in it is not a scoreline. What the code restricts is which *matches* can be
    touched, which is the thing that matters.
    """
    match = await _own_match(association.id, code, match_id, db)
    _within_window(match)
    return await record_event(
        match, payload, association=association, request=request, db=db, code=code
    )


@router.delete(
    "/{association_slug}/ethelontis/matches/{match_id}/events/{event_id}",
    response_model=MatchFeedOut,
)
async def undo_report(
    association: CurrentAssociation,
    code: CurrentCode,
    match_id: int,
    event_id: int,
    request: Request,
    db: DbSession,
) -> MatchFeedOut:
    match = await _own_match(association.id, code, match_id, db)
    _within_window(match)
    return await remove_event(
        match, event_id, association=association, request=request, db=db, code=code
    )


__all__ = ["router", "CurrentCode", "get_current_code", "COOKIE", "SCOPE"]
