"""A club's own page, edited by the club, with the code it already uses for
live scores.

What a club may change by itself: its logo and colours, which are its own
identity and harm nobody if wrong. What it may not: whose names appear on the
site for money. A sponsor a club adds arrives switched off and marked pending;
the federation's admin approves it (club_admin, "Έγκριση") before it is shown.
That keeps the rule club_admin was written with, that paid names on the site
are the federation's call, while sparing the office the typing.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentAssociation, DbSession
from app.api.v1.volunteer import CurrentCode
from app.models import Association, ClubAccessCode, Sponsor, Team
from app.schemas.catalog import TeamOut
from app.schemas.editor import TeamLookEdit
from app.services import media
from app.services.audit import record

router = APIRouter(prefix="/api/v1", tags=["volunteer"])

BASE = "/{association_slug}/ethelontis/club"


class ClubSponsorOut(BaseModel):
    id: int
    name: str
    website_url: str | None = None
    logo_url: str | None = None
    is_active: bool
    pending_approval: bool


class ClubSelfOut(BaseModel):
    team: TeamOut
    sponsors: list[ClubSponsorOut]


async def _team(db: DbSession, team_id: int) -> Team:
    team = (
        await db.execute(
            select(Team)
            .options(selectinload(Team.home_field), selectinload(Team.sponsors))
            .where(Team.id == team_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return team


def _out(team: Team) -> ClubSelfOut:
    return ClubSelfOut(
        team=TeamOut.model_validate(team),
        sponsors=[
            ClubSponsorOut(
                id=s.id,
                name=s.name,
                website_url=s.website_url,
                logo_url=s.logo_url,
                is_active=s.is_active,
                pending_approval=s.pending_approval,
            )
            for s in team.sponsors
        ],
    )


def _audit(
    db: DbSession,
    request: Request,
    association: Association,
    code: ClubAccessCode,
    action: str,
    entity_type: str,
    entity_id: int | None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    """In the same trail as the admin's edits, signed by the club's code."""
    record(
        db,
        actor=f"κωδικός σωματείου #{code.id}",
        association=association,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        request=request,
    )


@router.get(BASE, response_model=ClubSelfOut)
async def get_club(association: CurrentAssociation, code: CurrentCode, db: DbSession) -> ClubSelfOut:
    return _out(await _team(db, code.team_id))


@router.patch(BASE, response_model=ClubSelfOut)
async def set_colours(
    association: CurrentAssociation,
    code: CurrentCode,
    payload: TeamLookEdit,
    request: Request,
    db: DbSession,
) -> ClubSelfOut:
    team = await _team(db, code.team_id)
    before = {"primary_color": team.primary_color, "secondary_color": team.secondary_color}
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(team, key, value.lower() if isinstance(value, str) else value)
    _audit(db, request, association, code, "team.colours", "team", team.id, before,
           {"primary_color": team.primary_color, "secondary_color": team.secondary_color})
    await db.commit()
    return _out(await _team(db, code.team_id))


@router.put(f"{BASE}/logo", response_model=ClubSelfOut)
async def set_logo(
    association: CurrentAssociation,
    code: CurrentCode,
    file: Annotated[UploadFile, File()],
    request: Request,
    db: DbSession,
) -> ClubSelfOut:
    team = await _team(db, code.team_id)
    stored = await media.store(file, f"teams/{team.id}", media.Kind.LOGO)
    previous = team.logo_url
    team.logo_url = stored.url
    _audit(db, request, association, code, "team.logo", "team", team.id, {"logo_url": previous}, {"logo_url": stored.url})
    try:
        await db.commit()
    except Exception:
        media.discard(stored.url)
        raise
    media.discard(previous)
    return _out(await _team(db, code.team_id))


@router.post(f"{BASE}/sponsors", response_model=ClubSelfOut, status_code=status.HTTP_201_CREATED)
async def propose_sponsor(
    association: CurrentAssociation,
    code: CurrentCode,
    request: Request,
    db: DbSession,
    name: Annotated[str, Form()],
    website_url: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> ClubSelfOut:
    """A sponsor the club wants shown. Stored off and pending: the admin
    approves it, and only then does it appear."""
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Το όνομα του χορηγού είναι υποχρεωτικό.")
    url = (website_url or "").strip() or None
    if url and not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    team = await _team(db, code.team_id)
    pending = sum(1 for s in team.sponsors if s.pending_approval)
    if pending >= 10:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Υπάρχουν ήδη δέκα χορηγοί σε αναμονή έγκρισης.",
        )
    stored = (
        await media.store(file, f"teams/{team.id}/sponsors", media.Kind.LOGO, png=True)
        if file is not None and file.filename
        else None
    )
    sponsor = Sponsor(
        team_id=team.id,
        name=name[:120],
        website_url=url[:255] if url else None,
        logo_url=stored.url if stored else None,
        logo_png_url=stored.png_url if stored else None,
        position=len(team.sponsors),
        is_active=False,
        pending_approval=True,
    )
    db.add(sponsor)
    await db.flush()
    _audit(db, request, association, code, "sponsor.propose", "sponsor", sponsor.id, None, {"name": sponsor.name})
    try:
        await db.commit()
    except Exception:
        media.discard(stored.url if stored else None, stored.png_url if stored else None)
        raise
    return _out(await _team(db, code.team_id))
