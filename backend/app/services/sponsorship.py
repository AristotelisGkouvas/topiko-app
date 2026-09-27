"""When a sponsor is live, and counting how often one is seen or clicked."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PlatformSponsor, Sponsor, SponsorDailyStat

_ATHENS = ZoneInfo("Europe/Athens")

#: How close to its end a deal is flagged in the dashboard.
EXPIRY_WARNING_DAYS = 14


def today() -> date:
    """The Greek calendar day. A deal "until 31/10" ends at midnight in Ioannina,
    not at 03:00 when UTC gets there."""
    return datetime.now(_ATHENS).date()


def live(model: type[PlatformSponsor] | type[Sponsor], on: date) -> ColumnElement[bool]:
    """Switched on, started, and not yet ended — both dates inclusive."""
    return and_(
        model.is_active.is_(True),
        or_(model.starts_on.is_(None), model.starts_on <= on),
        or_(model.ends_on.is_(None), model.ends_on >= on),
    )


def status(sponsor: PlatformSponsor | Sponsor, on: date) -> str:
    """One word for the dashboard: paused, scheduled, live, ending, ended."""
    if not sponsor.is_active:
        return "paused"
    if sponsor.starts_on and sponsor.starts_on > on:
        return "scheduled"
    if sponsor.ends_on and sponsor.ends_on < on:
        return "ended"
    if sponsor.ends_on and sponsor.ends_on <= on + timedelta(days=EXPIRY_WARNING_DAYS):
        return "ending"
    return "live"


async def bump(
    db: AsyncSession,
    *,
    association_id: int,
    kind: str,
    ids: list[int],
    field: str,
) -> None:
    """Add one view (or click) to each sponsor for today, in one statement.

    An upsert, so two readers counting the same sponsor at the same moment
    both land — a read-then-write would lose one of them.
    """
    if not ids:
        return
    day = today()
    rows = [
        {"association_id": association_id, "kind": kind, "ref_id": i, "day": day, field: 1}
        for i in ids
    ]
    stmt = insert(SponsorDailyStat).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_sponsor_daily_stats",
        set_={field: getattr(SponsorDailyStat, field) + 1},
    )
    await db.execute(stmt)


async def totals(
    db: AsyncSession, *, kind: str, ids: list[int], days: int = 30
) -> dict[int, tuple[int, int]]:
    """(views, clicks) per sponsor over the last `days` days, today included."""
    if not ids:
        return {}
    since = today() - timedelta(days=days - 1)
    rows = (
        await db.execute(
            select(
                SponsorDailyStat.ref_id,
                func.coalesce(func.sum(SponsorDailyStat.views), 0),
                func.coalesce(func.sum(SponsorDailyStat.clicks), 0),
            )
            .where(
                SponsorDailyStat.kind == kind,
                SponsorDailyStat.ref_id.in_(ids),
                SponsorDailyStat.day >= since,
            )
            .group_by(SponsorDailyStat.ref_id)
        )
    ).all()
    return {ref: (int(v), int(c)) for ref, v, c in rows}
