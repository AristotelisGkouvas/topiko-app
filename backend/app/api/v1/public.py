"""Public, read-only, tenant-scoped API.

Everything here hangs off /api/v1/{association_slug}. The write side lives in
separate /editor and /admin routers (phase 3) so that "can this request change
data?" is answerable from the URL alone.
"""

import dataclasses
from datetime import UTC, datetime, time, timedelta
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
    Player,
    PlayerStat,
    Season,
    Standing,
    Team,
)
from app.models.enums import MatchStatus
from app.services import search as search_service
from app.services.standings import project_live_standings
from app.schemas import (
    AssociationOut,
    FieldDetailOut,
    FieldOut,
    LeagueOut,
    LiveStandingOut,
    LiveTableOut,
    MatchDayOut,
    MatchDetailOut,
    MatchOut,
    Meta,
    ScorerOut,
    SearchHitOut,
    SearchOut,
    SeasonOut,
    StandingOut,
    TeamDetailOut,
    TeamOut,
    TeamRef,
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


@router.get(
    "/{association_slug}/leagues/{league_slug}/standings/live",
    response_model=LiveTableOut,
)
async def live_standings(
    league: CurrentLeague, db: DbSession
) -> LiveTableOut:
    """The table as it would stand if every match in progress ended now.

    Computed, never stored. Writing a hypothetical would leave the real table
    wrong the moment somebody scored — and wrong permanently if the process
    died before the final whistle.
    """
    rows, live = await project_live_standings(db, league)
    teams = {
        team.id: team
        for team in (
            await db.execute(
                select(Team).where(Team.id.in_([r.team_id for r in rows]))
            )
        ).scalars()
    }
    return LiveTableOut(
        live_matches=live,
        rows=[
            LiveStandingOut(
                team=TeamRef.model_validate(teams[row.team_id]),
                position=row.position,
                actual_position=row.actual_position,
                previous_position=None,
                played=row.played,
                won=row.won,
                drawn=row.drawn,
                lost=row.lost,
                goals_for=row.goals_for,
                goals_against=row.goals_against,
                goal_difference=row.goal_difference,
                points=row.points,
                form=row.form,
                zone=row.zone,
            )
            for row in rows
            if row.team_id in teams
        ],
    )


@router.get("/{association_slug}/matches/day", response_model=MatchDayOut)
async def list_matches_on_day(
    association: CurrentAssociation,
    db: DbSession,
    date: Annotated[
        str | None, Query(description="Ημερομηνία ΥΥΥΥ-ΜΜ-ΗΗ. Χωρίς αυτό, σήμερα.")
    ] = None,
) -> MatchDayOut:
    """Everything played across the federation on one day.

    The tab this feeds does not separate fixtures from results, because a
    Sunday does not: the same list read in the morning is the programme and read
    in the evening is the scoreboard. Splitting them into two pages made the
    reader pick the right one before they were allowed to look.

    Neighbouring days come back with it — the nearest day either side that
    actually has football. Stepping one calendar day at a time through a
    Wednesday in July is eleven taps of nothing.
    """
    try:
        day = (
            datetime.strptime(date, "%Y-%m-%d").date()
            if date
            else datetime.now(UTC).date()
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Η ημερομηνία θέλει μορφή ΥΥΥΥ-ΜΜ-ΗΗ.",
        ) from None

    # Half-open on purpose: `kickoff_at < day + 1` keeps a 23:30 kickoff on its
    # own day, which BETWEEN with a date cast would round away.
    start = datetime.combine(day, time.min, tzinfo=UTC)
    end = start + timedelta(days=1)

    scoped_matches = (
        select(Match)
        .join(League, Match.league_id == League.id)
        .where(League.association_id == association.id)
    )

    result = await db.execute(
        scoped_matches.options(*_MATCH_LOADS)
        .where(Match.kickoff_at >= start, Match.kickoff_at < end)
        .order_by(Match.kickoff_at.nulls_last(), Match.id)
    )
    matches = list(result.scalars())

    previous = (
        await db.execute(
            select(func.max(func.date(Match.kickoff_at)))
            .select_from(Match)
            .join(League, Match.league_id == League.id)
            .where(League.association_id == association.id, Match.kickoff_at < start)
        )
    ).scalar_one_or_none()
    next_day = (
        await db.execute(
            select(func.min(func.date(Match.kickoff_at)))
            .select_from(Match)
            .join(League, Match.league_id == League.id)
            .where(League.association_id == association.id, Match.kickoff_at >= end)
        )
    ).scalar_one_or_none()

    return MatchDayOut(
        date=day,
        matches=[MatchOut.model_validate(m) for m in matches],
        previous_date=previous,
        next_date=next_day,
    )


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


@router.get("/{association_slug}/search", response_model=SearchOut)
async def search(
    association: CurrentAssociation,
    db: DbSession,
    q: Annotated[str, Query(description="Τι ψάχνουμε", max_length=80)] = "",
) -> SearchOut:
    """One box over clubs, players and grounds.

    Accent-blind and case-blind, because that is how the words arrive from a
    phone keyboard. See `app.services.search` for what "blind" means exactly.

    A query shorter than two characters returns nothing rather than an error:
    the box is searched as it is typed, and the first keystroke is not a
    mistake to be scolded for.
    """
    needle = search_service.fold(q.strip())
    if len(needle) < search_service.MIN_QUERY:
        return SearchOut(query=q)

    teams, players, fields = (
        await search_service.search_teams(
            db, association_id=association.id, needle=needle
        ),
        await search_service.search_players(
            db, association_id=association.id, needle=needle
        ),
        await search_service.search_fields(
            db, association_id=association.id, needle=needle
        ),
    )

    def out(hits: list[search_service.Hit]) -> list[SearchHitOut]:
        return [SearchHitOut(**dataclasses.asdict(h)) for h in hits]

    return SearchOut(
        query=q, teams=out(teams), players=out(players), fields=out(fields)
    )


@router.get(
    "/{association_slug}/fields/{field_slug}", response_model=FieldDetailOut
)
async def get_field(
    association: CurrentAssociation, field_slug: str, db: DbSession
) -> Field:
    field = await _load_field(association, field_slug, db)
    return field


@router.get(
    "/{association_slug}/fields/{field_slug}/matches",
    response_model=list[MatchOut],
)
async def list_field_matches(
    association: CurrentAssociation,
    field_slug: str,
    season: CurrentSeason,
    db: DbSession,
) -> list[Match]:
    """Everything played at this ground this season.

    Both fixtures and results, in kickoff order, because the two questions a
    reader has standing outside a pitch — "what is on here" and "what happened
    here" — are the same list read from different ends.
    """
    field = await _load_field(association, field_slug, db)
    result = await db.execute(
        select(Match)
        .options(*_MATCH_LOADS)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            League.season_id == season.id,
            Match.field_id == field.id,
        )
        .order_by(Match.kickoff_at.nulls_last(), Match.id)
    )
    return list(result.scalars())


async def _load_field(association, field_slug: str, db) -> Field:
    result = await db.execute(
        select(Field)
        .options(selectinload(Field.home_teams))
        .where(Field.association_id == association.id, Field.slug == field_slug)
    )
    field = result.scalar_one_or_none()
    if field is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε γήπεδο '{field_slug}'.",
        )
    return field


@router.get(
    "/{association_slug}/leagues/{league_slug}/scorers",
    response_model=list[ScorerOut],
)
async def list_scorers(
    league: CurrentLeague,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[PlayerStat]:
    """The σκόρερ table for one competition.

    Ordered by goals with the name as the tie-break, so a table that is mostly
    ties does not reshuffle between two requests — a list that reorders itself
    on refresh reads as though something changed.

    Rows with no goals recorded are left out rather than shown as zero: the
    source publishes the head of the list, so their absence from it is not
    evidence that the player did not score.
    """
    result = await db.execute(
        select(PlayerStat)
        .options(
            selectinload(PlayerStat.player),
            selectinload(PlayerStat.team),
        )
        .join(Player, PlayerStat.player_id == Player.id)
        .where(
            PlayerStat.league_id == league.id,
            PlayerStat.goals.is_not(None),
            PlayerStat.goals > 0,
        )
        .order_by(PlayerStat.goals.desc(), Player.name)
        .limit(limit)
    )
    return list(result.scalars())


@router.get("/{association_slug}/matches/{match_id}", response_model=MatchDetailOut)
async def get_match(
    association: CurrentAssociation,
    match_id: int,
    db: DbSession,
) -> MatchDetailOut:
    """One match with its context.

    The association is joined rather than trusted from the id: match ids are
    sequential across every tenant, so without it /epsa/matches/17 would answer
    with a fixture from another federation.
    """
    match = (
        await db.execute(
            select(Match)
            .options(*_MATCH_LOADS, selectinload(Match.league).selectinload(League.season))
            .join(League, Match.league_id == League.id)
            .where(Match.id == match_id, League.association_id == association.id)
        )
    ).scalar_one_or_none()

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε αγώνας με id {match_id}.",
        )

    # Earlier meetings, either way round, this fixture excluded.
    pair = (match.home_team_id, match.away_team_id)
    history = list(
        (
            await db.execute(
                select(Match)
                .options(*_MATCH_LOADS)
                .join(League, Match.league_id == League.id)
                .where(
                    League.association_id == association.id,
                    Match.id != match.id,
                    Match.home_team_id.in_(pair),
                    Match.away_team_id.in_(pair),
                    Match.home_score.is_not(None),
                )
                .order_by(Match.kickoff_at.desc().nulls_last(), Match.id.desc())
                .limit(5)
            )
        ).scalars()
    )

    standings = {
        row.team_id: row
        for row in (
            await db.execute(
                select(Standing)
                .options(selectinload(Standing.team))
                .where(
                    Standing.league_id == match.league_id,
                    Standing.team_id.in_(pair),
                )
            )
        ).scalars()
    }

    return MatchDetailOut(
        match=MatchOut.model_validate(match),
        league=LeagueOut.model_validate(match.league),
        head_to_head=[MatchOut.model_validate(m) for m in history],
        home_standing=(
            StandingOut.model_validate(standings[match.home_team_id])
            if match.home_team_id in standings
            else None
        ),
        away_standing=(
            StandingOut.model_validate(standings[match.away_team_id])
            if match.away_team_id in standings
            else None
        ),
    )


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
