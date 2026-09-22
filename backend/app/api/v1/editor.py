"""The write side.

Everything here hangs off /api/v1/{association_slug}/editor, so "can this
request change data?" is answerable from the URL alone — which is what
public.py's own docstring promised phase 3 would do.

Two gates, not one. Reaching an association at all is `require_association_access`.
Changing a score while the match is being played needs `can_edit_live` on top,
because a live edit outranks the federation's own result for 48 hours under the
reconciliation rules, and that is a different amount of trust from correcting
last month's typo.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.auth_deps import CurrentUser, EditableAssociation, may_edit_live
from app.api.deps import DbSession
from app.models import AuditLog, Field, League, Match, Team
from app.models.enums import DataSource, FieldSurface, MatchStatus
from app.schemas import FieldOut, MatchOut
from app.services.audit import changed_fields, record
from app.services.standings import recompute_standings

router = APIRouter(prefix="/api/v1", tags=["editor"])

#: How close to kickoff an edit counts as "live". Wider than the match itself,
#: because the minutes before kickoff are when a postponement gets typed in.
LIVE_WINDOW_BEFORE = timedelta(minutes=30)
LIVE_WINDOW_AFTER = timedelta(hours=3)


class MatchEdit(BaseModel):
    """What an editor may change on a match.

    Every field is optional and `None` is a real value — clearing a score is
    how a result entered by mistake is taken back — so the difference between
    "leave alone" and "set to nothing" is whether the key was sent at all.
    """

    home_score: int | None = PydanticField(default=None, ge=0, le=99)
    away_score: int | None = PydanticField(default=None, ge=0, le=99)
    home_score_ht: int | None = PydanticField(default=None, ge=0, le=99)
    away_score_ht: int | None = PydanticField(default=None, ge=0, le=99)
    status: MatchStatus | None = None
    minute: int | None = PydanticField(default=None, ge=0, le=130)
    referee: str | None = PydanticField(default=None, max_length=120)
    note: str | None = None
    #: True while the match is being played. Drives the LIVE badge.
    is_live: bool | None = None
    #: Marks the score as checked against the official sheet, which ends the
    #: scraper's 48-hour deference early.
    confirmed: bool | None = None


class FieldEdit(BaseModel):
    """Venue details. The federation publishes almost none of this, and
    coordinates not at all — a ground gets a map only if somebody types one."""

    address: str | None = PydanticField(default=None, max_length=255)
    city: str | None = PydanticField(default=None, max_length=120)
    postal_code: str | None = PydanticField(default=None, max_length=16)
    latitude: float | None = PydanticField(default=None, ge=-90, le=90)
    longitude: float | None = PydanticField(default=None, ge=-180, le=180)
    surface: FieldSurface | None = None
    capacity: int | None = PydanticField(default=None, ge=0, le=200_000)
    has_floodlights: bool | None = None
    notes: str | None = None


class AuditEntryOut(BaseModel):
    id: int
    user_email: str | None
    action: str
    entity_type: str
    entity_id: int | None
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    created_at: datetime


def _is_live_window(match: Match, now: datetime) -> bool:
    if match.is_live or match.status in (MatchStatus.LIVE, MatchStatus.HALFTIME):
        return True
    if match.kickoff_at is None:
        return False
    return (
        match.kickoff_at - LIVE_WINDOW_BEFORE
        <= now
        <= match.kickoff_at + LIVE_WINDOW_AFTER
    )


def _snapshot(match: Match) -> dict[str, Any]:
    return {
        "home_score": match.home_score,
        "away_score": match.away_score,
        "home_score_ht": match.home_score_ht,
        "away_score_ht": match.away_score_ht,
        "status": match.status.value,
        "minute": match.minute,
        "referee": match.referee,
        "note": match.note,
        "is_live": match.is_live,
        "data_source": match.data_source.value,
    }


@router.get(
    "/{association_slug}/editor/matches", response_model=list[MatchOut]
)
async def list_editable_matches(
    association: EditableAssociation,
    db: DbSession,
    days: Annotated[int, Query(ge=1, le=30)] = 3,
    limit: Annotated[int, Query(ge=1, le=200)] = 60,
) -> list[Match]:
    """The matches worth looking at right now: the last few days and the next
    few. An editor opens this to type in a weekend, not to browse the archive.
    """
    now = datetime.now(UTC)
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
            Match.kickoff_at.is_not(None),
            Match.kickoff_at >= now - timedelta(days=days),
            Match.kickoff_at <= now + timedelta(days=days),
        )
        .order_by(Match.kickoff_at, Match.id)
        .limit(limit)
    )
    return list(result.scalars())


@router.patch(
    "/{association_slug}/editor/matches/{match_id}", response_model=MatchOut
)
async def edit_match(
    association: EditableAssociation,
    user: CurrentUser,
    match_id: int,
    payload: MatchEdit,
    request: Request,
    db: DbSession,
) -> Match:
    match = (
        await db.execute(
            select(Match)
            .options(
                selectinload(Match.home_team),
                selectinload(Match.away_team),
                selectinload(Match.field),
            )
            .join(League, Match.league_id == League.id)
            .where(Match.id == match_id, League.association_id == association.id)
        )
    ).scalar_one_or_none()

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε αγώνας με id {match_id}.",
        )

    now = datetime.now(UTC)
    if _is_live_window(match, now) and not may_edit_live(user, association):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Δεν έχεις δικαίωμα διόρθωσης σκορ σε αγώνα που παίζεται. "
                "Ζήτησέ το από διαχειριστή."
            ),
        )

    before = _snapshot(match)
    # exclude_unset, not exclude_none: an editor clearing a score sends null on
    # purpose, and treating that as "no change" would make a mistyped result
    # impossible to take back.
    changes = payload.model_dump(exclude_unset=True)
    confirmed = changes.pop("confirmed", None)

    scores_touched = any(
        key in changes
        for key in ("home_score", "away_score", "home_score_ht", "away_score_ht")
    )

    for key, value in changes.items():
        setattr(match, key, value)

    if scores_touched or confirmed is not None:
        match.last_manual_edit_at = now
        # A live edit is a claim in progress; a confirmed one has been checked
        # against the sheet. The scraper defers to both, but only until the
        # window in Match.scraper_may_overwrite runs out.
        match.data_source = (
            DataSource.MANUAL_CONFIRMED
            if confirmed
            else DataSource.MANUAL_LIVE
            if _is_live_window(match, now)
            else DataSource.MANUAL_CONFIRMED
        )

    old, new = changed_fields(before, _snapshot(match))
    if not old and not new:
        return match

    record(
        db,
        user=user,
        association=association,
        action="match.edit",
        entity_type="match",
        entity_id=match.id,
        before=old,
        after=new,
        request=request,
    )

    # The table is derived, never typed, so it is rebuilt from the fixtures
    # rather than adjusted by hand.
    if scores_touched:
        league = await db.get(League, match.league_id)
        if league is not None:
            await recompute_standings(db, league)

    await db.commit()
    await db.refresh(match)
    return match


@router.patch(
    "/{association_slug}/editor/fields/{field_slug}", response_model=FieldOut
)
async def edit_field(
    association: EditableAssociation,
    user: CurrentUser,
    field_slug: str,
    payload: FieldEdit,
    request: Request,
    db: DbSession,
) -> Field:
    """Fill in a ground.

    This is the only route by which a venue gets coordinates: the federation
    publishes a surface and a floodlight flag and nothing that locates the
    place, so the map link falls back to searching its name until a human puts
    a pin on it.
    """
    venue = (
        await db.execute(
            select(Field).where(
                Field.association_id == association.id, Field.slug == field_slug
            )
        )
    ).scalar_one_or_none()

    if venue is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε γήπεδο '{field_slug}'.",
        )

    tracked = (
        "address",
        "city",
        "postal_code",
        "latitude",
        "longitude",
        "surface",
        "capacity",
        "has_floodlights",
        "notes",
    )
    snapshot = lambda: {  # noqa: E731
        key: (
            value.value
            if isinstance(value := getattr(venue, key), FieldSurface)
            else float(value)
            if key in ("latitude", "longitude") and value is not None
            else value
        )
        for key in tracked
    }

    before = snapshot()
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(venue, key, value)

    old, new = changed_fields(before, snapshot())
    if not old and not new:
        return venue

    record(
        db,
        user=user,
        association=association,
        action="field.edit",
        entity_type="field",
        entity_id=venue.id,
        before=old,
        after=new,
        request=request,
    )
    await db.commit()
    await db.refresh(venue)
    return venue


@router.get(
    "/{association_slug}/editor/audit", response_model=list[AuditEntryOut]
)
async def list_audit(
    association: EditableAssociation,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AuditLog]:
    """Recent changes. Visible to every editor of the association, not just
    admins: a shared log is only a deterrent if the people sharing it can
    read it."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.association_id == association.id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    return list(result.scalars())
