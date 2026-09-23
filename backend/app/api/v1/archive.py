"""Pages built out of thirteen seasons rather than out of this week.

Split from `public.py` because the questions are different in kind. That file
answers "what is happening": standings, fixtures, live scores — everything the
federation's own site also answers. This one answers "what has happened", which
is the part nobody else keeps: who these two clubs are to each other after
sixty-five meetings, who scored on this date, which scoreline still stands.

Read-only and tenant-scoped, exactly like public.py.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import case, extract, func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentAssociation, DbSession
from app.core.config import settings
from app.models.enums import LeagueKind
from app.models import (
    Announcement,
    Association,
    League,
    Match,
    Player,
    PlayerStat,
    PlayerSuspension,
    Season,
    Standing,
    Team,
)
from app.services.icalendar import build_calendar
from app.schemas import (
    AnnouncementOut,
    ComparedSideOut,
    ComparisonOut,
    HeadToHeadOut,
    MatchOut,
    OnThisDayOut,
    PlayerDetailOut,
    PlayerRef,
    PlayerSearchOut,
    PlayerSeasonOut,
    RecordMatchOut,
    RecordsOut,
    SuspensionOut,
    TeamRef,
    TopScorerAllTimeOut,
)

#: Kickoffs are stored UTC; "σαν σήμερα" is a question about the Greek
#: calendar, so the comparison has to happen in Greek local time.
_ATHENS = ZoneInfo("Europe/Athens")

router = APIRouter(prefix="/api/v1", tags=["archive"])

_MATCH_LOADS = (
    selectinload(Match.home_team),
    selectinload(Match.away_team),
    selectinload(Match.field),
)

#: A decided match with both scores on it. Every question here is about results
#: that happened, so this filter opens nearly every query below.
def _played() -> object:
    return Match.home_score.is_not(None) & Match.away_score.is_not(None)


# ---------------------------------------------------------------------------
#  Players
# ---------------------------------------------------------------------------


@router.get("/{association_slug}/players", response_model=list[PlayerSearchOut])
async def search_players(
    association: CurrentAssociation,
    db: DbSession,
    q: Annotated[str | None, Query(min_length=2, description="Αναζήτηση ονόματος")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[PlayerSearchOut]:
    """Find a footballer by name.

    Requires a query. The register holds fifteen thousand people and listing
    them in slug order serves nobody — a name is how anybody arrives here.

    Each hit carries its club and goal total. Names are not identities here:
    there are three men called ΘΑΝΑΣΗΣ ΚΩΝΣΤΑΝΤΙΝΟΣ on this register and one of
    them has scored 225 goals, so a list of bare names makes the reader pick
    blind. Ordered by goals so the one being looked for is usually first.
    """
    if not q:
        return []

    hits = (
        await db.execute(
            select(
                Player,
                func.coalesce(func.sum(PlayerStat.goals), 0).label("goals"),
            )
            .outerjoin(PlayerStat, PlayerStat.player_id == Player.id)
            .where(
                Player.association_id == association.id,
                Player.name.ilike(f"%{q}%"),
            )
            .group_by(Player.id)
            .order_by(func.coalesce(func.sum(PlayerStat.goals), 0).desc(), Player.name)
            .limit(limit)
        )
    ).all()

    if not hits:
        return []

    # One query for every hit's latest club rather than one per hit.
    ids = [player.id for player, _ in hits]
    latest: dict[int, Team] = {}
    rows = (
        await db.execute(
            select(PlayerStat.player_id, Team, Season.slug)
            .join(League, PlayerStat.league_id == League.id)
            .join(Season, League.season_id == Season.id)
            .join(Team, PlayerStat.team_id == Team.id)
            .where(PlayerStat.player_id.in_(ids))
            .order_by(Season.slug.desc())
        )
    ).all()
    for player_id, team, _slug in rows:
        latest.setdefault(player_id, team)

    return [
        PlayerSearchOut(
            id=player.id,
            slug=player.slug,
            name=player.name,
            birth_year=player.birth_year,
            last_team=(
                TeamRef.model_validate(latest[player.id])
                if player.id in latest
                else None
            ),
            total_goals=int(goals or 0),
        )
        for player, goals in hits
    ]


@router.get(
    "/{association_slug}/players/{player_slug}", response_model=PlayerDetailOut
)
async def get_player(
    association: CurrentAssociation, player_slug: str, db: DbSession
) -> PlayerDetailOut:
    player = (
        await db.execute(
            select(Player).where(
                Player.association_id == association.id,
                Player.slug == player_slug,
            )
        )
    ).scalar_one_or_none()

    if player is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε παίκτης '{player_slug}'.",
        )

    rows = (
        await db.execute(
            select(PlayerStat, League, Season)
            .options(selectinload(PlayerStat.team))
            .join(League, PlayerStat.league_id == League.id)
            .join(Season, League.season_id == Season.id)
            .where(PlayerStat.player_id == player.id)
            .order_by(Season.slug.desc(), League.slug)
        )
    ).all()

    seasons = [
        PlayerSeasonOut(
            season=season,
            league_slug=league.slug,
            league_name=league.short_name or league.name,
            team=TeamRef.model_validate(stat.team) if stat.team else None,
            goals=stat.goals,
            own_goals=stat.own_goals,
            yellow_cards=stat.yellow_cards,
            red_cards=stat.red_cards,
        )
        for stat, league, season in rows
    ]

    # Clubs in the order the career ran, newest first, without repeats — a
    # player who spent four seasons at one club should appear there once.
    clubs: list[TeamRef] = []
    seen: set[int] = set()
    for line in seasons:
        if line.team and line.team.id not in seen:
            seen.add(line.team.id)
            clubs.append(line.team)

    return PlayerDetailOut(
        id=player.id,
        slug=player.slug,
        name=player.name,
        birth_year=player.birth_year,
        seasons=seasons,
        total_goals=sum(line.goals or 0 for line in seasons),
        seasons_scored=len({line.season.slug for line in seasons if line.goals}),
        clubs=clubs,
    )


# ---------------------------------------------------------------------------
#  Head to head
# ---------------------------------------------------------------------------


@router.get(
    "/{association_slug}/kontra/{home_slug}/{away_slug}",
    response_model=HeadToHeadOut,
)
async def head_to_head(
    association: CurrentAssociation,
    home_slug: str,
    away_slug: str,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> HeadToHeadOut:
    """The record between two clubs across every season on file.

    Counted from the first club's point of view whichever ground each match was
    played on: the pair is the subject, not the fixture, so a run of away wins
    has to read as wins.
    """
    home = await _team_or_404(association, home_slug, db)
    away = await _team_or_404(association, away_slug, db)

    if home.id == away.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Χρειάζονται δύο διαφορετικά σωματεία.",
        )

    pair = (home.id, away.id)
    base = (
        select(Match)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            Match.home_team_id.in_(pair),
            Match.away_team_id.in_(pair),
            _played(),
        )
    )

    # Goals and outcomes are re-pointed at `home` in SQL rather than in Python,
    # so the totals do not depend on having fetched every row.
    was_home = Match.home_team_id == home.id
    home_goals = case((was_home, Match.home_score), else_=Match.away_score)
    away_goals = case((was_home, Match.away_score), else_=Match.home_score)

    totals = (
        await db.execute(
            base.with_only_columns(
                func.count(),
                func.sum(case((home_goals > away_goals, 1), else_=0)),
                func.sum(case((home_goals < away_goals, 1), else_=0)),
                func.sum(case((home_goals == away_goals, 1), else_=0)),
                func.sum(home_goals),
                func.sum(away_goals),
                func.min(Match.kickoff_at),
                func.max(Match.kickoff_at),
            )
        )
    ).one()

    played, wins, losses, draws, gf, ga, first, last = totals

    matches = list(
        (
            await db.execute(
                base.options(*_MATCH_LOADS)
                .order_by(Match.kickoff_at.desc().nulls_last(), Match.id.desc())
                .limit(limit)
            )
        ).scalars()
    )

    return HeadToHeadOut(
        home=TeamRef.model_validate(home),
        away=TeamRef.model_validate(away),
        played=played or 0,
        home_wins=wins or 0,
        away_wins=losses or 0,
        draws=draws or 0,
        home_goals=gf or 0,
        away_goals=ga or 0,
        first_meeting=first.date() if first else None,
        last_meeting=last.date() if last else None,
        matches=[MatchOut.model_validate(m) for m in matches],
    )


async def _team_or_404(association: Association, slug: str, db: DbSession) -> Team:
    team = (
        await db.execute(
            select(Team).where(
                Team.association_id == association.id, Team.slug == slug
            )
        )
    ).scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε σωματείο '{slug}'.",
        )
    return team


# ---------------------------------------------------------------------------
#  On this day
# ---------------------------------------------------------------------------


@router.get("/{association_slug}/san-simera", response_model=OnThisDayOut)
async def on_this_day(
    association: CurrentAssociation,
    db: DbSession,
    day: Annotated[int | None, Query(ge=1, le=31)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
) -> OnThisDayOut:
    """Matches played on this calendar date in earlier years.

    The date is compared in Greek local time, not UTC. Kickoffs are stored in
    UTC, and a 17:00 August kickoff is 14:00 UTC — which is still the same day,
    but an evening kickoff in a country three hours ahead need not be, and a
    match filed under yesterday is the one thing this page must not do.
    """
    today = datetime.now(UTC).astimezone(_ATHENS).date()
    day = day or today.day
    month = month or today.month

    local_kickoff = func.timezone("Europe/Athens", Match.kickoff_at)

    result = await db.execute(
        select(Match)
        .options(*_MATCH_LOADS)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            Match.kickoff_at.is_not(None),
            extract("day", local_kickoff) == day,
            extract("month", local_kickoff) == month,
            _played(),
        )
        # Biggest first: with a dozen slots, a 7-0 earns one before a goalless
        # draw from the same afternoon.
        .order_by(
            func.abs(Match.home_score - Match.away_score).desc(),
            Match.kickoff_at.desc(),
        )
        .limit(limit)
    )

    return OnThisDayOut(
        day=day,
        month=month,
        matches=[MatchOut.model_validate(m) for m in result.scalars()],
    )


# ---------------------------------------------------------------------------
#  Announcements
# ---------------------------------------------------------------------------


@router.get("/{association_slug}/anakoinoseis", response_model=list[AnnouncementOut])
async def list_announcements(
    association: CurrentAssociation,
    db: DbSession,
    q: Annotated[str | None, Query(description="Αναζήτηση στον τίτλο")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[Announcement]:
    """The federation's notice board, newest first.

    Mirrored rather than linked: epsip.gr publishes these on one page with no
    feed and no per-item address, so there is nothing to link a reader to.
    """
    stmt = (
        select(Announcement)
        .where(Announcement.association_id == association.id)
        .order_by(Announcement.published_at.desc().nulls_last(), Announcement.id.desc())
        .limit(limit)
    )
    if q:
        stmt = stmt.where(Announcement.title.ilike(f"%{q}%"))
    return list((await db.execute(stmt)).scalars())


# ---------------------------------------------------------------------------
#  Comparison
# ---------------------------------------------------------------------------


async def _side(
    association: Association, team: Team, season: str | None, db: DbSession
) -> ComparedSideOut:
    """A club's line in whichever table it is in this season.

    A club can appear in more than one competition — a cup run alongside the
    league. The league table is the one being compared, so the championship is
    preferred and the rest ignored rather than summed, which would double a
    club's goals for no reason a reader could follow.
    """
    stmt = (
        select(Standing, League)
        .join(League, Standing.league_id == League.id)
        .join(Season, League.season_id == Season.id)
        .where(
            League.association_id == association.id,
            Standing.team_id == team.id,
            Season.slug == season if season else Season.is_current.is_(True),
        )
        .order_by(
            (League.kind != LeagueKind.CHAMPIONSHIP),
            League.tier.nulls_last(),
        )
    )
    row = (await db.execute(stmt)).first()

    if row is None:
        return ComparedSideOut(team=TeamRef.model_validate(team))

    standing, league = row
    return ComparedSideOut(
        team=TeamRef.model_validate(team),
        league_slug=league.slug,
        league_name=league.short_name or league.name,
        position=standing.position,
        played=standing.played,
        won=standing.won,
        drawn=standing.drawn,
        lost=standing.lost,
        goals_for=standing.goals_for,
        goals_against=standing.goals_against,
        goal_difference=standing.goal_difference,
        points=standing.points,
        form=standing.form,
    )


@router.get(
    "/{association_slug}/sygkrisi/{left_slug}/{right_slug}",
    response_model=ComparisonOut,
)
async def compare_teams(
    association: CurrentAssociation,
    left_slug: str,
    right_slug: str,
    db: DbSession,
    season: Annotated[str | None, Query(description="Slug περιόδου. Default: τρέχουσα.")] = None,
) -> ComparisonOut:
    """Two clubs side by side, this season, plus their record against each other."""
    left = await _team_or_404(association, left_slug, db)
    right = await _team_or_404(association, right_slug, db)

    if left.id == right.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Χρειάζονται δύο διαφορετικά σωματεία.",
        )

    resolved_season = season
    if resolved_season is None:
        current = (
            await db.execute(
                select(Season.slug).where(
                    Season.association_id == association.id,
                    Season.is_current.is_(True),
                )
            )
        ).scalar_one_or_none()
        resolved_season = current or ""

    record = await head_to_head(association, left_slug, right_slug, db, limit=5)

    return ComparisonOut(
        season=resolved_season,
        left=await _side(association, left, season, db),
        right=await _side(association, right, season, db),
        record=record if record.played else None,
    )


# ---------------------------------------------------------------------------
#  Calendar feed
# ---------------------------------------------------------------------------


@router.get(
    "/{association_slug}/teams/{team_slug}/imerologio.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}},
)
async def team_calendar(
    association: CurrentAssociation,
    team_slug: str,
    db: DbSession,
    season: Annotated[
        str | None,
        Query(description="Slug περιόδου, ή 'all'. Default: τρέχουσα."),
    ] = None,
) -> Response:
    """A club's fixtures as a subscribable calendar.

    Subscribed once, not downloaded: the URL is stable and clients re-poll it,
    so a postponement reaches somebody's phone without them visiting the site.
    That is the whole point, and it is why UID and SEQUENCE matter more here
    than anything visible.

    The current season only, unless asked otherwise. The archive runs to
    thirteen seasons and 1.187 fixtures for a long-established club — a third
    of a megabyte of 2014 kickoffs, re-fetched every six hours into a phone
    calendar nobody wants them in.
    """
    team = await _team_or_404(association, team_slug, db)

    stmt = (
        select(Match)
        .options(*_MATCH_LOADS)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            Match.kickoff_at.is_not(None),
            (Match.home_team_id == team.id) | (Match.away_team_id == team.id),
        )
        .order_by(Match.kickoff_at)
    )
    if season != "all":
        stmt = stmt.join(Season, League.season_id == Season.id).where(
            Season.slug == season if season else Season.is_current.is_(True)
        )

    matches = list((await db.execute(stmt)).scalars())
    body = build_calendar(
        team,
        matches,
        association_slug=association.slug,
        site_url=settings.site_url,
    )

    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            # Named so a downloaded copy is identifiable; subscribing ignores it.
            "Content-Disposition": f'inline; filename="{team.slug}.ics"',
            "Cache-Control": "public, max-age=1800",
        },
    )


# ---------------------------------------------------------------------------
#  Suspensions
# ---------------------------------------------------------------------------


@router.get("/{association_slug}/poines", response_model=list[SuspensionOut])
async def list_suspensions(
    association: CurrentAssociation,
    db: DbSession,
    season: Annotated[str | None, Query(description="Slug περιόδου. Default: τρέχουσα.")] = None,
    league: Annotated[str | None, Query(description="Slug πρωταθλήματος.")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[SuspensionOut]:
    """Who is banned, and for how many matches.

    The club is reached through the player's line in the same competition:
    a suspension row names a player and a fixture, never a club, so without
    that join the page would list fifteen names and no way to tell whose they
    are. It is a left join because a banned player need not appear in any
    published leaderboard.
    """
    season_filter = (
        Season.slug == season if season else Season.is_current.is_(True)
    )

    stmt = (
        select(PlayerSuspension, Player, League, Team)
        .join(Player, PlayerSuspension.player_id == Player.id)
        .join(League, PlayerSuspension.league_id == League.id)
        .join(Season, League.season_id == Season.id)
        .outerjoin(
            PlayerStat,
            (PlayerStat.player_id == PlayerSuspension.player_id)
            & (PlayerStat.league_id == PlayerSuspension.league_id),
        )
        .outerjoin(Team, PlayerStat.team_id == Team.id)
        .where(League.association_id == association.id, season_filter)
        # Newest decision first: this page is read to find out who misses the
        # coming weekend, not to audit the season.
        .order_by(
            PlayerSuspension.decided_on.desc().nulls_last(),
            PlayerSuspension.matchday.desc().nulls_last(),
            Player.name,
        )
        .limit(limit)
    )
    if league:
        stmt = stmt.where(League.slug == league)

    rows = (await db.execute(stmt)).all()

    return [
        SuspensionOut(
            id=ban.id,
            player=PlayerRef.model_validate(player),
            team=TeamRef.model_validate(team) if team else None,
            league_slug=comp.slug,
            league_name=comp.short_name or comp.name,
            matchday=ban.matchday,
            decided_on=ban.decided_on,
            matches=ban.matches,
            fixture=ban.fixture,
            match_id=ban.match_id,
        )
        for ban, player, comp, team in rows
    ]


# ---------------------------------------------------------------------------
#  Records
# ---------------------------------------------------------------------------


@router.get("/{association_slug}/rekor", response_model=RecordsOut)
async def records(
    association: CurrentAssociation,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> RecordsOut:
    """The extremes of the archive."""
    scoped = (
        select(Match)
        .join(League, Match.league_id == League.id)
        .where(League.association_id == association.id, _played())
    )

    margin = func.abs(Match.home_score - Match.away_score)
    total = Match.home_score + Match.away_score

    biggest = (
        await db.execute(
            scoped.options(*_MATCH_LOADS).order_by(margin.desc(), Match.id).limit(limit)
        )
    ).scalars()

    highest = (
        await db.execute(
            scoped.options(*_MATCH_LOADS).order_by(total.desc(), Match.id).limit(limit)
        )
    ).scalars()

    scorers = (
        await db.execute(
            select(
                Player.id,
                Player.slug,
                Player.name,
                func.sum(PlayerStat.goals).label("goals"),
                func.count(func.distinct(Season.id)).label("seasons"),
            )
            .select_from(PlayerStat)
            .join(Player, PlayerStat.player_id == Player.id)
            .join(League, PlayerStat.league_id == League.id)
            .join(Season, League.season_id == Season.id)
            .where(
                Player.association_id == association.id,
                PlayerStat.goals.is_not(None),
            )
            .group_by(Player.id, Player.slug, Player.name)
            .order_by(func.sum(PlayerStat.goals).desc())
            .limit(limit)
        )
    ).all()

    counts = (
        await db.execute(
            scoped.with_only_columns(
                func.count(),
                func.sum(Match.home_score + Match.away_score),
                func.count(func.distinct(League.season_id)),
            )
        )
    ).one()

    return RecordsOut(
        biggest_wins=[
            RecordMatchOut(
                match=MatchOut.model_validate(m),
                value=abs((m.home_score or 0) - (m.away_score or 0)),
            )
            for m in biggest
        ],
        highest_scoring=[
            RecordMatchOut(
                match=MatchOut.model_validate(m),
                value=(m.home_score or 0) + (m.away_score or 0),
            )
            for m in highest
        ],
        top_scorers=[
            TopScorerAllTimeOut(
                player_id=pid,
                player_slug=slug,
                player_name=name,
                goals=int(goals or 0),
                seasons=int(seasons or 0),
            )
            for pid, slug, name, goals, seasons in scorers
        ],
        total_matches=counts[0] or 0,
        total_goals=int(counts[1] or 0),
        seasons_covered=counts[2] or 0,
    )
