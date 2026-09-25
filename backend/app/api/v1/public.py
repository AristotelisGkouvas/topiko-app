"""Public, read-only, tenant-scoped API.

Everything here hangs off /api/v1/{association_slug}. The write side lives in
separate /editor and /admin routers (phase 3) so that "can this request change
data?" is answerable from the URL alone.
"""

import dataclasses
from datetime import date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import (
    CurrentAssociation,
    CurrentLeague,
    CurrentSeason,
    DbSession,
)
from app.api.lookups import MATCH_LOADS, match_in, team_in
from app.models import (
    Association,
    Field,
    League,
    LeagueTeam,
    Match,
    MatchEvent,
    Player,
    PlayerStat,
    PlayerSuspension,
    ScrapeRun,
    Season,
    Standing,
    Team,
)
from app.models.enums import MatchEventKind, MatchStatus, ScrapeRunStatus
from app.services import search as search_service
from app.services.live import LIVE_WINDOW
from app.services.standings import project_live_standings
from app.schemas import (
    AssociationOut,
    FieldDetailOut,
    FieldOut,
    LeagueOut,
    LiveStandingOut,
    LiveTableOut,
    MatchDetailOut,
    MatchOut,
    Meta,
    LiveScorerOut,
    RosterRowOut,
    ScorerOut,
    SearchHitOut,
    SearchOut,
    SeasonOut,
    StandingOut,
    TeamDetailOut,
    TeamOut,
    TeamRef,
    TeamStandingOut,
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
        .options(*MATCH_LOADS)
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


@router.get("/{association_slug}/matches/live", response_model=list[MatchOut])
async def list_live_matches(
    association: CurrentAssociation, db: DbSession
) -> list[Match]:
    """Feeds the "ΤΩΡΑ ΖΩΝΤΑΝΑ" strip. Polled every 15-20s by the client, so it
    stays a single indexed query across the tenant rather than one per league."""
    result = await db.execute(
        select(Match)
        .options(*MATCH_LOADS)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            or_(
                Match.is_live.is_(True),
                Match.status.in_([MatchStatus.LIVE, MatchStatus.HALFTIME]),
            ),
            # The clock, not just the flag. Without this a stale claim keeps a
            # finished match in the live strip until the next scrape, and a
            # wrong one keeps a future fixture there for ever.
            Match.kickoff_at.is_not(None),
            Match.kickoff_at <= func.now(),
            Match.kickoff_at > func.now() - LIVE_WINDOW,
        )
        .order_by(Match.kickoff_at.nulls_last(), Match.id)
    )
    return list(result.scalars())


def weekend_around(today: date) -> tuple[date, date]:
    """Friday to Monday of the weekend a reader means by "this weekend".

    Tuesday to Thursday look ahead to the coming one; Friday to Monday mean
    the one under way — a Monday reader wants yesterday's results, not the
    fixtures five days out.
    """
    weekday = today.weekday()  # Monday 0 … Sunday 6
    if weekday == 0:
        friday = today - timedelta(days=3)
    elif weekday >= 4:
        friday = today - timedelta(days=weekday - 4)
    else:
        friday = today + timedelta(days=4 - weekday)
    return friday, friday + timedelta(days=3)


@router.get("/{association_slug}/matches/weekend", response_model=list[MatchOut])
async def list_weekend_matches(
    association: CurrentAssociation,
    season: CurrentSeason,
    db: DbSession,
    day: Annotated[date | None, Query(description="Οποιαδήποτε μέρα του Σαββατοκύριακου")] = None,
) -> list[Match]:
    """Every division's matches for one weekend, on one screen.

    With fifteen divisions, a reporter putting together Sunday's results used
    to open fifteen pages. Ordered by division, then kickoff, so the client
    can group without sorting again.
    """
    athens = ZoneInfo("Europe/Athens")
    start, end = weekend_around(day or datetime.now(athens).date())
    lo = datetime.combine(start, time.min, tzinfo=athens)
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=athens)
    result = await db.execute(
        select(Match)
        .options(*MATCH_LOADS)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            League.season_id == season.id,
            Match.kickoff_at >= lo,
            Match.kickoff_at < hi,
        )
        .order_by(League.tier.nulls_last(), League.name, Match.kickoff_at, Match.id)
    )
    return list(result.scalars())


@router.get("/{association_slug}/teams/{team_slug}/roster", response_model=list[RosterRowOut])
async def team_roster(
    association: CurrentAssociation,
    season: CurrentSeason,
    team_slug: str,
    db: DbSession,
) -> list[RosterRowOut]:
    """Who plays for this club this season, and who may be banned.

    Built from the published stat lines, like the volunteer's scorer picker.
    A coach reading the opponent wants two things from it: who scores, and
    who is out on Sunday.
    """
    team = await team_in(db, association.id, team_slug)
    rows = (
        await db.execute(
            select(Player, PlayerStat)
            .join(PlayerStat, PlayerStat.player_id == Player.id)
            .join(League, PlayerStat.league_id == League.id)
            .where(
                League.association_id == association.id,
                League.season_id == season.id,
                PlayerStat.team_id == team.id,
            )
            .order_by(PlayerStat.goals.desc().nulls_last(), Player.name)
        )
    ).all()

    out: dict[int, RosterRowOut] = {}
    for player, stat in rows:
        if player.id in out:
            continue
        out[player.id] = RosterRowOut(
            player=player,
            goals=stat.goals or 0,
            yellow_cards=stat.yellow_cards,
            red_cards=stat.red_cards,
        )
    if not out:
        return []

    bans = (
        await db.execute(
            select(PlayerSuspension, League.current_matchday)
            .join(League, PlayerSuspension.league_id == League.id)
            .where(
                League.season_id == season.id,
                PlayerSuspension.player_id.in_(out.keys()),
            )
            .order_by(PlayerSuspension.matchday.desc().nulls_last())
        )
    ).all()
    for ban, current in bans:
        row = out[ban.player_id]
        if row.banned_matches is not None or ban.matchday is None:
            continue
        served = max(0, (current or ban.matchday) - ban.matchday)
        if ban.matches > served:
            row.banned_matches = ban.matches
            row.banned_after_matchday = ban.matchday
    return list(out.values())


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
    """The club row with its ground. Shared by the club page and its fixture
    list, which want the same lookup and different things around it."""
    return await team_in(db, association.id, team_slug, selectinload(Team.home_field))


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


@router.get(
    "/{association_slug}/teams/{team_slug}/standing",
    response_model=TeamStandingOut | None,
)
async def get_team_standing(
    association: CurrentAssociation,
    team_slug: str,
    season: CurrentSeason,
    db: DbSession,
) -> TeamStandingOut | None:
    """The club's row in the season's table, and which table it is. Null if
    the club has none — a youth-only club, or a season with no table yet.

    A club can appear in more than one division; the first in the site's own
    league order wins, the same order the league picker shows.
    """
    team = await _load_team(association, team_slug, db)
    row = (
        await db.execute(
            select(Standing, League)
            .join(League, Standing.league_id == League.id)
            .options(selectinload(Standing.team), selectinload(League.season))
            .where(
                League.association_id == association.id,
                League.season_id == season.id,
                League.is_active.is_(True),
                Standing.team_id == team.id,
            )
            .order_by(League.sort_order, League.tier, League.name)
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    standing, league = row
    return TeamStandingOut(
        league=LeagueOut.model_validate(league),
        standing=StandingOut.model_validate(standing),
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
        .options(*MATCH_LOADS)
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
    matches = await search_service.search_referee_matches(
        db, association_id=association.id, needle=needle
    )

    def out(hits: list[search_service.Hit]) -> list[SearchHitOut]:
        return [SearchHitOut(**dataclasses.asdict(h)) for h in hits]

    return SearchOut(
        query=q,
        teams=out(teams),
        players=out(players),
        fields=out(fields),
        matches=out(matches),
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
        .options(*MATCH_LOADS)
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


@router.get(
    "/{association_slug}/leagues/{league_slug}/scorers/live",
    response_model=list[LiveScorerOut],
)
async def list_live_scorers(
    league: CurrentLeague,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[LiveScorerOut]:
    """Goals logged at the ground this season, per named player.

    Only events tied to a player from the register count: a goal filed as
    "Άγνωστος", or with a name typed free-hand, cannot be put against anybody.
    Own goals are left out — they are not the scorer's.
    """
    goals = func.count(MatchEvent.id).label("goals")
    rows = (
        await db.execute(
            select(MatchEvent.player_id, MatchEvent.team_id, goals)
            .join(Match, MatchEvent.match_id == Match.id)
            .where(
                Match.league_id == league.id,
                MatchEvent.player_id.is_not(None),
                MatchEvent.kind.in_((MatchEventKind.GOAL, MatchEventKind.PENALTY_GOAL)),
            )
            .group_by(MatchEvent.player_id, MatchEvent.team_id)
            .order_by(goals.desc())
            .limit(limit)
        )
    ).all()
    if not rows:
        return []

    players = {
        p.id: p
        for p in (
            await db.execute(select(Player).where(Player.id.in_({r.player_id for r in rows})))
        ).scalars()
    }
    team_ids = {r.team_id for r in rows if r.team_id is not None}
    teams = {
        t.id: t
        for t in (await db.execute(select(Team).where(Team.id.in_(team_ids)))).scalars()
    } if team_ids else {}

    out = [
        LiveScorerOut(
            player=players[r.player_id],
            team=teams.get(r.team_id),
            goals=r.goals,
        )
        for r in rows
        if r.player_id in players
    ]
    # Same tie-break as the official table, so equal rows do not reshuffle.
    out.sort(key=lambda row: (-row.goals, row.player.name))
    return out


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
    match = await match_in(
        db,
        association.id,
        match_id,
        *MATCH_LOADS,
        selectinload(Match.league).selectinload(League.season),
    )

    # Earlier meetings, either way round, this fixture excluded.
    pair = (match.home_team_id, match.away_team_id)
    history = list(
        (
            await db.execute(
                select(Match)
                .options(*MATCH_LOADS)
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
        .where(
            League.association_id == association.id,
            Match.is_live.is_(True),
            # Counted the same way the strip is filtered, or the badge promises
            # live matches the strip then does not show.
            Match.kickoff_at.is_not(None),
            Match.kickoff_at <= func.now(),
            Match.kickoff_at > func.now() - LIVE_WINDOW,
        )
    )
    last_run = (
        await db.execute(
            select(ScrapeRun.status, ScrapeRun.finished_at)
            .where(
                ScrapeRun.association_id == association.id,
                ScrapeRun.status != ScrapeRunStatus.RUNNING,
            )
            .order_by(ScrapeRun.started_at.desc())
            .limit(1)
        )
    ).first()
    return Meta(
        association=association.slug,
        source_url=association.source_url,
        last_scraped_at=last_scrape,
        live_matches=live_count or 0,
        last_run_status=last_run.status.value if last_run else None,
        last_run_at=last_run.finished_at if last_run else None,
    )
