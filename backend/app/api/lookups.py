"""Fetching one row inside a tenant, or a 404.

Every router needs "the match with this id, but only if it is this
association's" — ids are sequential across every federation, so the join is
what keeps /epsa/matches/17 from answering with somebody else's fixture. One
copy of that query is one place for the tenant check to be right.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.interfaces import LoaderOption

from app.models import League, Match, Season, Team

#: A match card is useless without both teams and the venue, so no match query
#: leaves them to lazy-load — which under asyncpg would fail outright.
MATCH_LOADS: tuple[LoaderOption, ...] = (
    selectinload(Match.home_team),
    selectinload(Match.away_team),
    selectinload(Match.field),
)


async def match_in(
    db: AsyncSession,
    association_id: int,
    match_id: int,
    *options: LoaderOption,
) -> Match:
    """The match, if it belongs to this association. A 404 otherwise."""
    match = (
        await db.execute(
            select(Match)
            .options(*options)
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


async def team_in(
    db: AsyncSession,
    association_id: int,
    slug: str,
    *options: LoaderOption,
) -> Team:
    """The club, if it belongs to this association. A 404 otherwise."""
    team = (
        await db.execute(
            select(Team)
            .options(*options)
            .where(Team.association_id == association_id, Team.slug == slug)
        )
    ).scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε σωματείο '{slug}'.",
        )
    return team


async def recent_season_ids(db: AsyncSession, association_id: int) -> list[int]:
    """The current season and the one before it — the window a club or a
    player counts as active in. Empty when no season is marked current.

    Two, not one: in September the new season has a handful of divisions and
    a handful of published stat lines, and a one-season window would call
    most of the register inactive for the first months of every year.
    """
    current = (
        await db.execute(
            select(Season.slug).where(
                Season.association_id == association_id,
                Season.is_current.is_(True),
            )
        )
    ).scalar_one_or_none()
    if current is None:
        return []
    return list(
        (
            await db.execute(
                select(Season.id)
                .where(
                    Season.association_id == association_id,
                    Season.slug <= current,
                )
                .order_by(Season.slug.desc())
                .limit(2)
            )
        ).scalars()
    )
