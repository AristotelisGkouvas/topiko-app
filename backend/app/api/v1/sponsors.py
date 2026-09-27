"""Platform sponsors, and counting what every sponsor gets for its money.

Public: the live sponsors for a placement, a views counter, and a redirect
that counts the click on the way out. Admin: the platform sponsors themselves.
Club sponsors are edited in club_admin.py; they share the counters here.
"""

from __future__ import annotations

import time

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from sqlalchemy import func, select

from app.api.auth_deps import CurrentAdmin, EditableAssociation
from app.api.deps import CurrentAssociation, DbSession
from app.core.config import settings
from app.core.ratelimit import RateLimit
from app.models import PLACEMENTS, Association, PlatformSponsor, Sponsor, SponsorDailyStat, Team, User
from app.schemas.catalog import PlatformSponsorAdminOut, PlatformSponsorOut
from app.schemas.editor import OrderIn, PlatformSponsorEdit
from app.services import media
from app.services import sponsorship as sp
from app.services.audit import changed_fields, record

router = APIRouter(prefix="/api/v1", tags=["sponsors"])

#: One page view reports its sponsors once, so a reader browsing briskly sends
#: a few a minute. It exists to stop a loop inflating a sponsor's numbers.
view_limit = RateLimit("sponsor-views", limit=30, window=60)
click_limit = RateLimit("sponsor-clicks", limit=30, window=60)


class _Once:
    """Remembers (address, kind, id) for `window` seconds, so the same sponsor
    is counted at most once in that time from one address.

    The rate limit alone let a script count one sponsor ~170,000 times a day
    from one address. With this, a loop gets one view per sponsor per window.
    The cost is some undercounting where many readers share an address (a
    stadium's mobile NAT) — the right way round for numbers a sponsor pays by.
    In memory, per process: good enough for one API process; a restart only
    forgets who was counted in the last few minutes.
    """

    def __init__(self, window: float) -> None:
        self.window = window
        self._seen: dict[tuple[str, str, int], float] = {}
        self._swept = time.monotonic()

    def first(self, address: str, kind: str, ids: list[int]) -> list[int]:
        now = time.monotonic()
        if now - self._swept > 60:
            self._swept = now
            self._seen = {k: t for k, t in self._seen.items() if now - t < self.window}
        fresh = []
        for i in ids:
            key = (address, kind, i)
            if now - self._seen.get(key, -self.window - 1) >= self.window:
                self._seen[key] = now
                fresh.append(i)
        return fresh


view_once = _Once(window=120)
click_once = _Once(window=600)


def _address(request: Request) -> str:
    return request.client.host if request.client else "unknown"

Kind = Literal["platform", "club"]


# --- Public ------------------------------------------------------------------


@router.get("/{association_slug}/sponsors", response_model=list[PlatformSponsorOut])
async def live_sponsors(
    association: CurrentAssociation,
    db: DbSession,
    placement: Literal["site", "home", "match", "share"] | None = None,
) -> list[PlatformSponsor]:
    """The platform sponsors live today, optionally only those that bought
    `placement`, in their order."""
    stmt = select(PlatformSponsor).where(
        PlatformSponsor.association_id == association.id,
        sp.live(PlatformSponsor, sp.today()),
    )
    if placement:
        stmt = stmt.where(PlatformSponsor.placements.contains([placement]))
    rows = await db.execute(stmt.order_by(PlatformSponsor.position, PlatformSponsor.id))
    return list(rows.scalars())


class ViewsIn(BaseModel):
    """Which sponsors were on screen. Ids, deduplicated by the client."""

    platform: list[int] = Field(default=[], max_length=50)
    club: list[int] = Field(default=[], max_length=50)


async def _owned(db: DbSession, association_id: int, kind: Kind, ids: list[int]) -> list[int]:
    """The ids that really are this association's sponsors, and live today — a
    counter anybody can post to must not create rows for numbers somebody made
    up, nor bill a sponsor for days it was not paying for."""
    if not ids:
        return []
    today = sp.today()
    if kind == "platform":
        stmt = select(PlatformSponsor.id).where(
            PlatformSponsor.association_id == association_id,
            PlatformSponsor.id.in_(ids),
            sp.live(PlatformSponsor, today),
        )
    else:
        stmt = (
            select(Sponsor.id)
            .join(Team, Sponsor.team_id == Team.id)
            .where(
                Team.association_id == association_id,
                Sponsor.id.in_(ids),
                sp.live(Sponsor, today),
            )
        )
    return sorted(set((await db.execute(stmt)).scalars()))


def _from_our_site(request: Request) -> None:
    """Only the site's own pages may report views.

    A foreign page could otherwise post from its visitors' browsers: a body
    with no Content-Type is a "simple" request that needs no CORS preflight,
    and every visitor brings a fresh address past the rate limit. Requiring
    JSON forces the preflight, which our CORS answers only for our origins;
    the Origin check catches anything that sends one anyway.
    """
    if not request.headers.get("content-type", "").startswith("application/json"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Μόνο JSON.")
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Άλλος ιστότοπος.")


@router.post(
    "/{association_slug}/sponsors/views",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(view_limit)],
)
async def count_views(
    association: CurrentAssociation, payload: ViewsIn, request: Request, db: DbSession
) -> Response:
    _from_our_site(request)
    for kind, ids in (("platform", payload.platform), ("club", payload.club)):
        owned = await _owned(db, association.id, kind, ids)  # type: ignore[arg-type]
        fresh = view_once.first(_address(request), kind, owned)
        await sp.bump(db, association_id=association.id, kind=kind, ids=fresh, field="views")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{association_slug}/sponsors/go/{kind}/{sponsor_id}",
    dependencies=[Depends(click_limit)],
)
async def follow(
    association: CurrentAssociation, kind: Kind, sponsor_id: int, request: Request, db: DbSession
) -> RedirectResponse:
    """Count the click, then send the reader to the sponsor's site."""
    if kind == "platform":
        stmt = select(PlatformSponsor.website_url).where(
            PlatformSponsor.association_id == association.id, PlatformSponsor.id == sponsor_id
        )
    else:
        stmt = (
            select(Sponsor.website_url)
            .join(Team, Sponsor.team_id == Team.id)
            .where(Team.association_id == association.id, Sponsor.id == sponsor_id)
        )
    url = (await db.execute(stmt)).scalar_one_or_none()
    if not url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Δεν βρέθηκε ο χορηγός.")
    # Sent on either way — a stale link in an open page still reaches the
    # sponsor — but counted only while the deal is live, and once a window.
    counted = click_once.first(
        _address(request), kind, await _owned(db, association.id, kind, [sponsor_id])
    )
    await sp.bump(db, association_id=association.id, kind=kind, ids=counted, field="clicks")
    await db.commit()
    # 302, not 301: a permanent redirect is cached by the browser, and the
    # second click would go straight to the sponsor without being counted.
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND)


# --- Admin -------------------------------------------------------------------

ADMIN = "/{association_slug}/editor/platform-sponsors"
_FIELDS = TypeAdapter(PlatformSponsorEdit)


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def _check_dates(starts_on: date | None, ends_on: date | None) -> None:
    if starts_on and ends_on and ends_on < starts_on:
        raise _bad("Η λήξη είναι πριν από την έναρξη.")


async def _rows(db: DbSession, association_id: int) -> list[PlatformSponsorAdminOut]:
    sponsors = list(
        (
            await db.execute(
                select(PlatformSponsor)
                .where(PlatformSponsor.association_id == association_id)
                .order_by(PlatformSponsor.position, PlatformSponsor.id)
            )
        ).scalars()
    )
    ids = [s.id for s in sponsors]
    recent = await sp.totals(db, kind="platform", ids=ids)
    ever = (
        {
            ref: (int(v), int(c))
            for ref, v, c in (
                await db.execute(
                    select(
                        SponsorDailyStat.ref_id,
                        func.coalesce(func.sum(SponsorDailyStat.views), 0),
                        func.coalesce(func.sum(SponsorDailyStat.clicks), 0),
                    )
                    .where(SponsorDailyStat.kind == "platform", SponsorDailyStat.ref_id.in_(ids))
                    .group_by(SponsorDailyStat.ref_id)
                )
            ).all()
        }
        if ids
        else {}
    )
    today = sp.today()
    return [
        PlatformSponsorAdminOut.model_validate(s).model_copy(
            update={
                "status": sp.status(s, today),
                "views_30d": recent.get(s.id, (0, 0))[0],
                "clicks_30d": recent.get(s.id, (0, 0))[1],
                "views_total": ever.get(s.id, (0, 0))[0],
                "clicks_total": ever.get(s.id, (0, 0))[1],
            }
        )
        for s in sponsors
    ]


async def _one(db: DbSession, association_id: int, sponsor_id: int) -> PlatformSponsor:
    sponsor = (
        await db.execute(
            select(PlatformSponsor).where(
                PlatformSponsor.association_id == association_id,
                PlatformSponsor.id == sponsor_id,
            )
        )
    ).scalar_one_or_none()
    if sponsor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Δεν βρέθηκε ο χορηγός.")
    return sponsor


def _audit(db, request: Request, user: User, association: Association, action: str, entity_id, before=None, after=None) -> None:
    record(
        db, user=user, association=association, action=action,
        entity_type="platform_sponsor", entity_id=entity_id,
        before=before, after=after, request=request,
    )


@router.get(ADMIN, response_model=list[PlatformSponsorAdminOut])
async def list_platform_sponsors(
    association: EditableAssociation, _: CurrentAdmin, db: DbSession
) -> list[PlatformSponsorAdminOut]:
    return await _rows(db, association.id)


@router.post(ADMIN, response_model=list[PlatformSponsorAdminOut], status_code=status.HTTP_201_CREATED)
async def add_platform_sponsor(
    association: EditableAssociation,
    user: CurrentAdmin,
    request: Request,
    db: DbSession,
    name: Annotated[str, Form()],
    website_url: Annotated[str | None, Form()] = None,
    starts_on: Annotated[str | None, Form()] = None,
    ends_on: Annotated[str | None, Form()] = None,
    #: Comma-separated: "site,share".
    placements: Annotated[str | None, Form()] = None,
    note: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> list[PlatformSponsorAdminOut]:
    try:
        fields = _FIELDS.validate_python(
            {
                "name": (name or "").strip() or None,
                "website_url": (website_url or "").strip() or None,
                "starts_on": starts_on or None,
                "ends_on": ends_on or None,
                "placements": [p for p in (placements or "").split(",") if p] or list(PLACEMENTS),
                "note": (note or "").strip() or None,
            }
        )
    except ValidationError as error:
        loc = error.errors()[0]["loc"][-1]
        raise _bad(
            {
                "website_url": "Ο σύνδεσμος πρέπει να ξεκινά με http:// ή https://.",
                "starts_on": "Μη έγκυρη ημερομηνία έναρξης.",
                "ends_on": "Μη έγκυρη ημερομηνία λήξης.",
            }.get(str(loc), "Έλεγξε τα στοιχεία του χορηγού.")
        ) from error
    if not fields.name:
        raise _bad("Το όνομα του χορηγού είναι υποχρεωτικό.")
    _check_dates(fields.starts_on, fields.ends_on)

    stored = (
        await media.store(file, f"platform/{association.id}/sponsors", media.Kind.LOGO, png=True)
        if file is not None and file.filename
        else None
    )
    count = await db.scalar(
        select(func.count()).select_from(PlatformSponsor).where(PlatformSponsor.association_id == association.id)
    )
    sponsor = PlatformSponsor(
        association_id=association.id,
        name=fields.name,
        website_url=fields.website_url,
        logo_url=stored.url if stored else None,
        logo_png_url=stored.png_url if stored else None,
        starts_on=fields.starts_on,
        ends_on=fields.ends_on,
        placements=fields.placements or [],
        note=fields.note,
        position=count or 0,
        is_active=True,
    )
    db.add(sponsor)
    await db.flush()
    _audit(
        db, request, user, association, "platform_sponsor.add", sponsor.id, None,
        {
            "name": sponsor.name,
            "starts_on": sponsor.starts_on.isoformat() if sponsor.starts_on else None,
            "ends_on": sponsor.ends_on.isoformat() if sponsor.ends_on else None,
        },
    )
    try:
        await db.commit()
    except Exception:
        media.discard(stored.url if stored else None, stored.png_url if stored else None)
        raise
    return await _rows(db, association.id)


@router.patch(f"{ADMIN}/{{sponsor_id}}", response_model=list[PlatformSponsorAdminOut])
async def edit_platform_sponsor(
    association: EditableAssociation,
    user: CurrentAdmin,
    sponsor_id: int,
    payload: PlatformSponsorEdit,
    request: Request,
    db: DbSession,
) -> list[PlatformSponsorAdminOut]:
    sponsor = await _one(db, association.id, sponsor_id)
    keys = ("name", "website_url", "is_active", "starts_on", "ends_on", "placements", "note")
    before = {k: getattr(sponsor, k) for k in keys}
    changes = payload.model_dump(exclude_unset=True)
    for required in ("name", "is_active", "placements"):
        if required in changes and changes[required] is None:
            del changes[required]
    for key, value in changes.items():
        setattr(sponsor, key, (value.strip() or None) if isinstance(value, str) else value)
    _check_dates(sponsor.starts_on, sponsor.ends_on)
    if not sponsor.name:
        raise _bad("Το όνομα του χορηγού είναι υποχρεωτικό.")
    after = {k: getattr(sponsor, k) for k in keys}
    old, new = changed_fields(
        {k: str(v) if isinstance(v, date) else v for k, v in before.items()},
        {k: str(v) if isinstance(v, date) else v for k, v in after.items()},
    )
    # The office note can hold an amount or a phone number: the trail records
    # that it changed, never what it says.
    for side in (old, new):
        if side and "note" in side:
            side["note"] = "(άλλαξε)"
    if old or new:
        _audit(db, request, user, association, "platform_sponsor.edit", sponsor.id, old, new)
        await db.commit()
    return await _rows(db, association.id)


@router.put(f"{ADMIN}/{{sponsor_id}}/logo", response_model=list[PlatformSponsorAdminOut])
async def set_platform_sponsor_logo(
    association: EditableAssociation,
    user: CurrentAdmin,
    sponsor_id: int,
    file: Annotated[UploadFile, File()],
    request: Request,
    db: DbSession,
) -> list[PlatformSponsorAdminOut]:
    sponsor = await _one(db, association.id, sponsor_id)
    stored = await media.store(file, f"platform/{association.id}/sponsors", media.Kind.LOGO, png=True)
    previous = (sponsor.logo_url, sponsor.logo_png_url)
    sponsor.logo_url, sponsor.logo_png_url = stored.url, stored.png_url
    _audit(
        db, request, user, association, "platform_sponsor.logo", sponsor.id,
        {"logo_url": previous[0]}, {"logo_url": stored.url},
    )
    try:
        await db.commit()
    except Exception:
        media.discard(stored.url, stored.png_url)
        raise
    media.discard(*previous)
    return await _rows(db, association.id)


@router.delete(f"{ADMIN}/{{sponsor_id}}", response_model=list[PlatformSponsorAdminOut])
async def remove_platform_sponsor(
    association: EditableAssociation,
    user: CurrentAdmin,
    sponsor_id: int,
    request: Request,
    db: DbSession,
) -> list[PlatformSponsorAdminOut]:
    sponsor = await _one(db, association.id, sponsor_id)
    files = (sponsor.logo_url, sponsor.logo_png_url)
    _audit(db, request, user, association, "platform_sponsor.remove", sponsor.id, {"name": sponsor.name}, None)
    await db.delete(sponsor)
    await db.commit()
    media.discard(*files)
    return await _rows(db, association.id)


@router.put(f"{ADMIN}/order", response_model=list[PlatformSponsorAdminOut])
async def order_platform_sponsors(
    association: EditableAssociation, _: CurrentAdmin, payload: OrderIn, db: DbSession
) -> list[PlatformSponsorAdminOut]:
    rows = list(
        (
            await db.execute(
                select(PlatformSponsor).where(PlatformSponsor.association_id == association.id)
            )
        ).scalars()
    )
    by_id = {r.id: r for r in rows}
    if sorted(payload.ids) != sorted(by_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Η λίστα άλλαξε στο μεταξύ. Φόρτωσε ξανά τη σελίδα.",
        )
    for position, row_id in enumerate(payload.ids):
        by_id[row_id].position = position
    await db.commit()
    return await _rows(db, association.id)
