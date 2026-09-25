"""A club's look: logo, colours, gallery, sponsors.

Admin only. Editors are trusted with scores; what a club's page looks like to
the public, and whose names appear on it for money, is the federation's call.

Files and rows move together: a new image is written first, the row is
committed, and only then is the file it replaced deleted. A failed commit
deletes the new file instead, so neither outcome leaves a row pointing at
nothing.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.orm import selectinload

from app.api.auth_deps import CurrentAdmin, EditableAssociation
from app.api.deps import DbSession
from app.api.lookups import team_in
from app.models import Association, Sponsor, Team, TeamPhoto, User
from app.schemas.catalog import SponsorAdminOut, TeamOut, TeamPhotoOut
from app.schemas.common import ORMModel
from app.schemas.editor import OrderIn, PhotoEdit, SponsorEdit, TeamLookEdit
from app.services import media
from app.services.audit import changed_fields, record

router = APIRouter(prefix="/api/v1", tags=["editor"])

BASE = "/{association_slug}/editor/teams/{team_slug}"


class TeamLookOut(ORMModel):
    """Everything the dashboard's club screen edits, in one response."""

    team: TeamOut
    photos: list[TeamPhotoOut]
    sponsors: list[SponsorAdminOut]


async def _team(db: DbSession, association: Association | int, slug: str) -> Team:
    return await team_in(
        db,
        association if isinstance(association, int) else association.id,
        slug,
        selectinload(Team.home_field),
        selectinload(Team.photos),
        selectinload(Team.sponsors),
    )


def _look(team: Team) -> TeamLookOut:
    return TeamLookOut(
        team=TeamOut.model_validate(team),
        photos=[TeamPhotoOut.model_validate(p) for p in team.photos],
        sponsors=[SponsorAdminOut.model_validate(s) for s in team.sponsors],
    )


async def _commit(db: DbSession, *, written: tuple[str | None, ...], replaced: tuple[str | None, ...] = ()) -> None:
    try:
        await db.commit()
    except Exception:
        media.discard(*written)
        raise
    media.discard(*replaced)


async def _reload(db: DbSession, association: Association, slug: str) -> TeamLookOut:
    # A fresh query rather than a refresh: the collections have to come back
    # in their configured order, and a refresh of the parent does not reorder
    # a list that was appended to in Python.
    # The id is read first: expiring everything expires the association too,
    # and reading an expired attribute is a lazy load an async session cannot do.
    association_id = association.id
    db.expire_all()
    return _look(await _team(db, association_id, slug))


def _audit(
    db: DbSession,
    request: Request,
    user: User,
    association: Association,
    action: str,
    entity_type: str,
    entity_id: int | None,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    record(
        db,
        user=user,
        association=association,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        request=request,
    )


# --- The club itself ---------------------------------------------------------


@router.get(BASE, response_model=TeamLookOut)
async def get_look(
    association: EditableAssociation, _: CurrentAdmin, team_slug: str, db: DbSession
) -> TeamLookOut:
    return _look(await _team(db, association, team_slug))


@router.patch(BASE, response_model=TeamLookOut)
async def edit_colours(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    payload: TeamLookEdit,
    request: Request,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    keys = ("primary_color", "secondary_color")
    before = {k: getattr(team, k) for k in keys}
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(team, key, value.lower() if isinstance(value, str) else value)
    old, new = changed_fields(before, {k: getattr(team, k) for k in keys})
    if old or new:
        _audit(db, request, user, association, "team.colours", "team", team.id, old, new)
        await db.commit()
    return await _reload(db, association, team_slug)


@router.put(f"{BASE}/logo", response_model=TeamLookOut)
async def set_logo(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    file: Annotated[UploadFile, File()],
    request: Request,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    stored = await media.store(file, f"teams/{team.id}", media.Kind.LOGO)
    previous = team.logo_url
    team.logo_url = stored.url
    _audit(
        db, request, user, association, "team.logo", "team", team.id,
        {"logo_url": previous}, {"logo_url": stored.url},
    )
    await _commit(db, written=(stored.url,), replaced=(previous,))
    return await _reload(db, association, team_slug)


@router.delete(f"{BASE}/logo", response_model=TeamLookOut)
async def remove_logo(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    request: Request,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    previous = team.logo_url
    if previous is not None:
        team.logo_url = None
        _audit(
            db, request, user, association, "team.logo", "team", team.id,
            {"logo_url": previous}, {"logo_url": None},
        )
        await _commit(db, written=(), replaced=(previous,))
    return await _reload(db, association, team_slug)


# --- Gallery -----------------------------------------------------------------


async def _photo(db: DbSession, team: Team, photo_id: int) -> TeamPhoto:
    photo = next((p for p in team.photos if p.id == photo_id), None)
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Δεν βρέθηκε η φωτογραφία.")
    return photo


@router.post(f"{BASE}/photos", response_model=TeamLookOut, status_code=status.HTTP_201_CREATED)
async def add_photo(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    file: Annotated[UploadFile, File()],
    request: Request,
    db: DbSession,
    caption: Annotated[str | None, Form(max_length=200)] = None,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    stored = await media.store(file, f"teams/{team.id}/photos", media.Kind.PHOTO)
    assert stored.thumb_url is not None
    # In front of the rest: the newest photo leads until somebody reorders.
    for existing in team.photos:
        existing.position += 1
    photo = TeamPhoto(
        team_id=team.id,
        url=stored.url,
        thumb_url=stored.thumb_url,
        width=stored.width,
        height=stored.height,
        caption=(caption or "").strip() or None,
        position=0,
    )
    db.add(photo)
    await db.flush()
    _audit(db, request, user, association, "team.photo.add", "team_photo", photo.id, None, {"url": photo.url})
    await _commit(db, written=(stored.url, stored.thumb_url))
    return await _reload(db, association, team_slug)


@router.patch(f"{BASE}/photos/{{photo_id}}", response_model=TeamLookOut)
async def edit_photo(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    photo_id: int,
    payload: PhotoEdit,
    request: Request,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    photo = await _photo(db, team, photo_id)
    before = photo.caption
    photo.caption = (payload.caption or "").strip() or None
    if photo.caption != before:
        _audit(
            db, request, user, association, "team.photo.edit", "team_photo", photo.id,
            {"caption": before}, {"caption": photo.caption},
        )
        await db.commit()
    return await _reload(db, association, team_slug)


@router.delete(f"{BASE}/photos/{{photo_id}}", response_model=TeamLookOut)
async def remove_photo(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    photo_id: int,
    request: Request,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    photo = await _photo(db, team, photo_id)
    files = (photo.url, photo.thumb_url)
    _audit(db, request, user, association, "team.photo.remove", "team_photo", photo.id, {"url": photo.url}, None)
    await db.delete(photo)
    await _commit(db, written=(), replaced=files)
    return await _reload(db, association, team_slug)


@router.put(f"{BASE}/photos/order", response_model=TeamLookOut)
async def order_photos(
    association: EditableAssociation,
    _: CurrentAdmin,
    team_slug: str,
    payload: OrderIn,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    _reorder(team.photos, payload.ids)
    await db.commit()
    return await _reload(db, association, team_slug)


def _reorder(rows: list[TeamPhoto] | list[Sponsor], ids: list[int]) -> None:
    by_id = {row.id: row for row in rows}
    if sorted(ids) != sorted(by_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Η λίστα άλλαξε στο μεταξύ. Φόρτωσε ξανά τη σελίδα.",
        )
    for position, row_id in enumerate(ids):
        by_id[row_id].position = position


# --- Sponsors ----------------------------------------------------------------


_SPONSOR_FIELDS = TypeAdapter(SponsorEdit)


def _checked(name: str | None, website_url: str | None) -> SponsorEdit:
    """The multipart form's fields, through the same rules as the JSON edit."""
    try:
        return _SPONSOR_FIELDS.validate_python(
            {"name": (name or "").strip() or None, "website_url": (website_url or "").strip() or None}
        )
    except ValidationError as error:
        field = error.errors()[0]["loc"][-1]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Ο σύνδεσμος πρέπει να ξεκινά με http:// ή https://."
                if field == "website_url"
                else "Το όνομα του χορηγού είναι υποχρεωτικό."
            ),
        ) from error


def _sponsor(team: Team, sponsor_id: int) -> Sponsor:
    sponsor = next((s for s in team.sponsors if s.id == sponsor_id), None)
    if sponsor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Δεν βρέθηκε ο χορηγός.")
    return sponsor


@router.post(f"{BASE}/sponsors", response_model=TeamLookOut, status_code=status.HTTP_201_CREATED)
async def add_sponsor(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    name: Annotated[str, Form()],
    request: Request,
    db: DbSession,
    website_url: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    fields = _checked(name, website_url)
    if fields.name is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Το όνομα του χορηγού είναι υποχρεωτικό.")
    stored = (
        await media.store(file, f"teams/{team.id}/sponsors", media.Kind.LOGO)
        if file is not None and file.filename
        else None
    )
    sponsor = Sponsor(
        team_id=team.id,
        name=fields.name,
        website_url=fields.website_url,
        logo_url=stored.url if stored else None,
        # At the end: the first one added is usually the main one.
        position=len(team.sponsors),
        is_active=True,
    )
    db.add(sponsor)
    await db.flush()
    _audit(
        db, request, user, association, "sponsor.add", "sponsor", sponsor.id,
        None, {"name": sponsor.name, "website_url": sponsor.website_url},
    )
    await _commit(db, written=(stored.url if stored else None,))
    return await _reload(db, association, team_slug)


@router.patch(f"{BASE}/sponsors/{{sponsor_id}}", response_model=TeamLookOut)
async def edit_sponsor(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    sponsor_id: int,
    payload: SponsorEdit,
    request: Request,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    sponsor = _sponsor(team, sponsor_id)
    keys = ("name", "website_url", "is_active")
    before = {k: getattr(sponsor, k) for k in keys}
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Το όνομα του χορηγού είναι υποχρεωτικό.")
    if "is_active" in changes and changes["is_active"] is None:
        del changes["is_active"]
    for key, value in changes.items():
        setattr(sponsor, key, value.strip() if isinstance(value, str) else value)
    old, new = changed_fields(before, {k: getattr(sponsor, k) for k in keys})
    if old or new:
        _audit(db, request, user, association, "sponsor.edit", "sponsor", sponsor.id, old, new)
        await db.commit()
    return await _reload(db, association, team_slug)


@router.put(f"{BASE}/sponsors/{{sponsor_id}}/logo", response_model=TeamLookOut)
async def set_sponsor_logo(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    sponsor_id: int,
    file: Annotated[UploadFile, File()],
    request: Request,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    sponsor = _sponsor(team, sponsor_id)
    stored = await media.store(file, f"teams/{team.id}/sponsors", media.Kind.LOGO)
    previous = sponsor.logo_url
    sponsor.logo_url = stored.url
    _audit(
        db, request, user, association, "sponsor.logo", "sponsor", sponsor.id,
        {"logo_url": previous}, {"logo_url": stored.url},
    )
    await _commit(db, written=(stored.url,), replaced=(previous,))
    return await _reload(db, association, team_slug)


@router.delete(f"{BASE}/sponsors/{{sponsor_id}}", response_model=TeamLookOut)
async def remove_sponsor(
    association: EditableAssociation,
    user: CurrentAdmin,
    team_slug: str,
    sponsor_id: int,
    request: Request,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    sponsor = _sponsor(team, sponsor_id)
    logo = sponsor.logo_url
    _audit(
        db, request, user, association, "sponsor.remove", "sponsor", sponsor.id,
        {"name": sponsor.name}, None,
    )
    await db.delete(sponsor)
    await _commit(db, written=(), replaced=(logo,))
    return await _reload(db, association, team_slug)


@router.put(f"{BASE}/sponsors/order", response_model=TeamLookOut)
async def order_sponsors(
    association: EditableAssociation,
    _: CurrentAdmin,
    team_slug: str,
    payload: OrderIn,
    db: DbSession,
) -> TeamLookOut:
    team = await _team(db, association, team_slug)
    _reorder(team.sponsors, payload.ids)
    await db.commit()
    return await _reload(db, association, team_slug)

