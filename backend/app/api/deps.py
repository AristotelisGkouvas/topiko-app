from typing import Annotated

from fastapi import Depends, HTTPException, Path, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Association, League, Season

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_association(
    association_slug: Annotated[str, Path(description="π.χ. epsip-ipeirou")],
    db: DbSession,
) -> Association:
    """Resolve the tenant from the URL.

    Every public route depends on this. Nothing below it is reachable without a
    tenant, which is what keeps "show data from the wrong association" from
    being expressible in the first place.
    """
    result = await db.execute(
        select(Association).where(
            Association.slug == association_slug,
            Association.is_active.is_(True),
        )
    )
    association = result.scalar_one_or_none()
    if association is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε ένωση με slug '{association_slug}'.",
        )
    return association


CurrentAssociation = Annotated[Association, Depends(get_association)]


async def get_season(
    association: CurrentAssociation,
    db: DbSession,
    season: Annotated[
        str | None,
        Query(description="Slug περιόδου, π.χ. 2025-2026. Default: τρέχουσα."),
    ] = None,
) -> Season:
    stmt = select(Season).where(Season.association_id == association.id)
    stmt = (
        stmt.where(Season.slug == season)
        if season
        else stmt.where(Season.is_current.is_(True))
    )
    found = (await db.execute(stmt)).scalar_one_or_none()
    if found is None:
        detail = (
            f"Δεν βρέθηκε περίοδος '{season}'."
            if season
            else "Δεν έχει οριστεί τρέχουσα περίοδος για αυτή την ένωση."
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return found


CurrentSeason = Annotated[Season, Depends(get_season)]


async def get_league(
    league_slug: Annotated[str, Path(description="π.χ. a-katigoria")],
    association: CurrentAssociation,
    season: CurrentSeason,
    db: DbSession,
) -> League:
    result = await db.execute(
        select(League).where(
            League.association_id == association.id,
            League.season_id == season.id,
            League.slug == league_slug,
        )
    )
    league = result.scalar_one_or_none()
    if league is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Δεν βρέθηκε πρωτάθλημα '{league_slug}' "
                f"στην περίοδο {season.slug}."
            ),
        )
    return league


CurrentLeague = Annotated[League, Depends(get_league)]
