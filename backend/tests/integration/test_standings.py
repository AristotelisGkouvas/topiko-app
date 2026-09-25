"""The table, rebuilt from real rows.

Both cases here were found by recomputing the table by hand from the API's
own results and comparing: once in a review, never by a test, because the
tie-break and the stale-live rule only show with several matches in a real
database.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import LeagueTeam, Match, Team
from app.models.enums import MatchStatus
from app.services.standings import project_live_standings, recompute_standings

from .conftest import World

pytestmark = pytest.mark.asyncio

LONG_AGO = datetime.now(UTC) - timedelta(days=10)


async def _club(db, world: World, slug: str) -> Team:
    team = Team(association_id=world.a.association.id, slug=slug, name=slug.upper())
    db.add(team)
    await db.flush()
    db.add(LeagueTeam(league_id=world.a.league.id, team_id=team.id))
    return team


def _result(world: World, day: int, home: Team, away: Team, hs: int, as_: int, **kw) -> Match:
    return Match(
        league_id=world.a.league.id,
        matchday=day,
        home_team_id=home.id,
        away_team_id=away.id,
        kickoff_at=kw.pop("kickoff_at", LONG_AGO),
        status=kw.pop("status", MatchStatus.FINISHED),
        home_score=hs,
        away_score=as_,
        **kw,
    )


async def test_a_three_way_tie_is_broken_head_to_head(db, world: World) -> None:
    # Level on points; goal difference says K < D < A, head-to-head says the
    # opposite: K beat both, D beat A. The table must follow head-to-head.
    k = await _club(db, world, "konitsa")
    d = await _club(db, world, "dodoni")
    a = await _club(db, world, "anatoli")
    x = await _club(db, world, "xeni")
    db.add_all(
        [
            _result(world, 2, k, a, 3, 1),
            _result(world, 3, k, d, 3, 2),
            _result(world, 4, d, a, 5, 3),
            # A and D to 6 points too, padding their goal difference so that
            # it would order them D (+7), A (+6), K (+3).
            _result(world, 7, a, x, 9, 0),
            _result(world, 9, x, a, 0, 1),
            _result(world, 8, d, x, 6, 0),
        ]
    )
    await db.commit()

    table = await recompute_standings(db, world.a.league)
    order = [row.team_id for row in table if row.team_id in {k.id, d.id, a.id}]
    assert order == [k.id, d.id, a.id]


async def test_a_match_left_live_counts_once_its_window_closes(db, world: World) -> None:
    # The source set LIVE and never sent the final whistle. The page shows it
    # as ΤΕΛΙΚΟ after three hours; the table has to agree with the page.
    world.a.match.status = MatchStatus.LIVE
    world.a.match.is_live = True
    world.a.match.home_score, world.a.match.away_score = 2, 0
    world.a.match.kickoff_at = datetime.now(UTC) - timedelta(hours=5)
    db.add(world.a.match)
    await db.commit()

    table = await recompute_standings(db, world.a.league)
    points = {row.team_id: row.points for row in table}
    assert points[world.a.home.id] == 3

    _, running = await project_live_standings(db, world.a.league)
    assert running == 0
