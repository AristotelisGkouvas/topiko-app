"""Public, read-only, tenant-scoped API.

Everything here hangs off /api/v1/{association_slug}. The write side lives in
separate /editor and /admin routers (phase 3) so that "can this request change
data?" is answerable from the URL alone.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import (
    CurrentAssociation,
    CurrentLeague,
    CurrentSeason,
    DbSession,
)
from app.models import (
    Association,
    Field,
    League,
    LeagueTeam,
    Match,
    Season,
    Standing,
    Team,
)
from app.models.enums import MatchStatus
from app.schemas import (
    AssociationOut,
    FieldOut,
    LeagueOut,
    MatchOut,
    Meta,
    SeasonOut,
    StandingOut,
    TeamDetailOut,
    TeamOut,
)

# Loader options reused by every match query — a match card is useless without
# both teams and the venue, so they are never left to lazy-load.
_MATCH_LOADS = (
    selectinload(Match.home_team),
    selectinload(Match.away_team),
    selectinload(Match.field),
)

router = APIRouter(prefix="/api/v1", tags=["public"])


@router.get("/associations", response_model=list[AssociationOut])
async def list_associations(db: DbSession) -> list[Association]:
    """Active tenants. The only route that is not tenant-scoped, because it is
    the one that tells you which tenants exist."""
    result = await db.execute(
        select(Association)
        .where(Association.is_active.is_(True))
        .order_by(Association.name)
    )
    return list(result.scalars())


@router.get("/{association_slug}", response_model=AssociationOut)
async def get_association_detail(association: CurrentAssociation) -> Association:
    return association


@router.get("/{association_slug}/seasons", response_model=list[SeasonOut])
async def list_seasons(
    association: CurrentAssociation, db: DbSession
) -> list[Season]:
    result = await db.execute(
        select(Season)
        .where(Season.association_id == association.id)
        .order_by(Season.slug.desc())
    )
    return list(result.scalars())


@router.get("/{association_slug}/leagues", response_model=list[LeagueOut])
async def list_leagues(
    association: CurrentAssociation, season: CurrentSeason, db: DbSession
) -> list[League]:
    result = await db.execute(
        select(League)
        .options(selectinload(League.season))
        .where(
            League.association_id == association.id,
            League.season_id == season.id,
            League.is_active.is_(True),
        )
        .order_by(League.sort_order, League.tier, League.name)
    )
    return list(result.scalars())


@router.get("/{association_slug}/leagues/{league_slug}", response_model=LeagueOut)
async def get_league_detail(league: CurrentLeague, db: DbSession) -> League:
    await db.refresh(league, ["season"])
    return league


@router.get(
    "/{association_slug}/leagues/{league_slug}/standings",
    response_model=list[StandingOut],
)
async def get_standings(league: CurrentLeague, db: DbSession) -> list[Standing]:
    result = await db.execute(
        select(Standing)
        .options(selectinload(Standing.team))
        .where(Standing.league_id == league.id)
        .order_by(Standing.position)
    )
    return list(result.scalars())


@router.get(
    "/{association_slug}/leagues/{league_slug}/matches",
    response_model=list[MatchOut],
)
async def list_league_matches(
    league: CurrentLeague,
    db: DbSession,
    matchday: Annotated[int | None, Query(ge=1, description="Αγωνιστική")] = None,
    match_status: Annotated[MatchStatus | None, Query(alias="status")] = None,
) -> list[Match]:
    stmt = (
        select(Match)
        .options(*_MATCH_LOADS)
        .where(Match.league_id == league.id)
    )
    if matchday is not None:
        stmt = stmt.where(Match.matchday == matchday)
    if match_status is not None:
        stmt = stmt.where(Match.status == match_status)
    # NULLS LAST so a fixture with no date yet sinks to the bottom rather than
    # opening the list.
    stmt = stmt.order_by(Match.matchday, Match.kickoff_at.nulls_last(), Match.id)
    result = await db.execute(stmt)
    return list(result.scalars())


@router.get("/{association_slug}/matches/live", response_model=list[MatchOut])
async def list_live_matches(
    association: CurrentAssociation, db: DbSession
) -> list[Match]:
    """Feeds the "ΤΩΡΑ ΖΩΝΤΑΝΑ" strip. Polled every 15-20s by the client, so it
    stays a single indexed query across the tenant rather than one per league."""
    result = await db.execute(
        select(Match)
        .options(*_MATCH_LOADS)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            or_(
                Match.is_live.is_(True),
                Match.status.in_([MatchStatus.LIVE, MatchStatus.HALFTIME]),
            ),
        )
        .order_by(Match.kickoff_at.nulls_last(), Match.id)
    )
    return list(result.scalars())


@router.get("/{association_slug}/teams", response_model=list[TeamOut])
async def list_teams(
    association: CurrentAssociation,
    db: DbSession,
    q: Annotated[str | None, Query(description="Αναζήτηση ονόματος")] = None,
) -> list[Team]:
    stmt = (
        select(Team)
        .options(selectinload(Team.home_field))
        .where(Team.association_id == association.id, Team.is_active.is_(True))
    )
    if q:
        stmt = stmt.where(Team.name.ilike(f"%{q}%"))
    result = await db.execute(stmt.order_by(Team.name))
    return list(result.scalars())


async def _load_team(
    association: Association, team_slug: str, db: DbSession
) -> Team:
    """The club row, or a 404. Shared by the club page and its fixture list,
    which want the same lookup and different things around it."""
    result = await db.execute(
        select(Team)
        .options(selectinload(Team.home_field))
        .where(Team.association_id == association.id, Team.slug == team_slug)
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε ομάδα '{team_slug}'.",
        )
    return team


@router.get("/{association_slug}/teams/{team_slug}", response_model=TeamDetailOut)
async def get_team(
    association: CurrentAssociation, team_slug: str, db: DbSession
) -> TeamDetailOut:
    team = await _load_team(association, team_slug, db)

    # Newest first: a club page opens on the last season it played, which for
    # a club that has folded is the only way its history is reachable at all.
    seasons = (
        await db.execute(
            select(Season.slug)
            .join(League, League.season_id == Season.id)
            .join(LeagueTeam, LeagueTeam.league_id == League.id)
            .where(LeagueTeam.team_id == team.id)
            .distinct()
            .order_by(Season.slug.desc())
        )
    ).scalars().all()

    return TeamDetailOut.model_validate(
        {**TeamOut.model_validate(team).model_dump(), "seasons": list(seasons)}
    )


@router.get("/{association_slug}/teams/{team_slug}/matches", response_model=list[MatchOut])
async def list_team_matches(
    association: CurrentAssociation,
    team_slug: str,
    season: CurrentSeason,
    db: DbSession,
) -> list[Match]:
    team = await _load_team(association, team_slug, db)
    result = await db.execute(
        select(Match)
        .options(*_MATCH_LOADS)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            League.season_id == season.id,
            or_(Match.home_team_id == team.id, Match.away_team_id == team.id),
        )
        .order_by(Match.kickoff_at.nulls_last(), Match.id)
    )
    return list(result.scalars())


@router.get("/{association_slug}/fields", response_model=list[FieldOut])
async def list_fields(
    association: CurrentAssociation,
    db: DbSession,
    q: Annotated[str | None, Query(description="Αναζήτηση γηπέδου")] = None,
) -> list[Field]:
    stmt = select(Field).where(Field.association_id == association.id)
    if q:
        stmt = stmt.where(
            or_(Field.name.ilike(f"%{q}%"), Field.city.ilike(f"%{q}%"))
        )
    result = await db.execute(stmt.order_by(Field.name))
    return list(result.scalars())


@router.get("/{association_slug}/fields/{field_slug}", response_model=FieldOut)
async def get_field(
    association: CurrentAssociation, field_slug: str, db: DbSession
) -> Field:
    result = await db.execute(
        select(Field).where(
            Field.association_id == association.id, Field.slug == field_slug
        )
    )
    field = result.scalar_one_or_none()
    if field is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε γήπεδο '{field_slug}'.",
        )
    return field


@router.get("/{association_slug}/meta", response_model=Meta)
async def get_meta(association: CurrentAssociation, db: DbSession) -> Meta:
    """Backs the "Ενημερώθηκε πριν X λεπτά" line and the offline dot."""
    last_scrape = await db.scalar(
        select(func.max(Match.last_scraped_at))
        .join(League, Match.league_id == League.id)
        .where(League.association_id == association.id)
    )
    live_count = await db.scalar(
        select(func.count(Match.id))
        .join(League, Match.league_id == League.id)
        .where(League.association_id == association.id, Match.is_live.is_(True))
    )
    return Meta(
        association=association.slug,
        source_url=association.source_url,
        last_scraped_at=last_scrape,
        live_matches=live_count or 0,
    )
