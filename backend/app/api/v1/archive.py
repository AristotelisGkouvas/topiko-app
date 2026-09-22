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

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case, extract, func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentAssociation, DbSession
from app.models import (
    Association,
    League,
    Match,
    Player,
    PlayerStat,
    Season,
    Team,
)
from app.schemas import (
    HeadToHeadOut,
    MatchOut,
    OnThisDayOut,
    PlayerDetailOut,
    PlayerSearchOut,
    PlayerSeasonOut,
    RecordMatchOut,
    RecordsOut,
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
