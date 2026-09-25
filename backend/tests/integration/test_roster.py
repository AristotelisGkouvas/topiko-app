"""A club's public roster, with the players who may still be banned."""

from __future__ import annotations

import pytest

from app.models import Player, PlayerStat, PlayerSuspension

from .conftest import World

pytestmark = pytest.mark.asyncio


async def test_roster_orders_by_goals_and_flags_a_running_ban(client, db, world: World) -> None:
    a = world.a
    a.league.current_matchday = 5
    scorer = Player(association_id=a.association.id, slug="kostas", name="ΚΩΣΤΑΣ")
    banned = Player(association_id=a.association.id, slug="petros", name="ΠΕΤΡΟΣ")
    served = Player(association_id=a.association.id, slug="giannis", name="ΓΙΑΝΝΗΣ")
    db.add_all([a.league, scorer, banned, served])
    await db.flush()
    db.add_all(
        [
            PlayerStat(player_id=scorer.id, league_id=a.league.id, team_id=a.home.id, goals=7),
            PlayerStat(player_id=banned.id, league_id=a.league.id, team_id=a.home.id, goals=1),
            PlayerStat(player_id=served.id, league_id=a.league.id, team_id=a.home.id, goals=0),
            # Round 4 + 3 matches: still running at round 5.
            PlayerSuspension(league_id=a.league.id, player_id=banned.id, matchday=4, matches=3),
            # Round 1 + 1 match: long served.
            PlayerSuspension(league_id=a.league.id, player_id=served.id, matchday=1, matches=1),
        ]
    )
    await db.commit()

    rows = (await client.get("/api/v1/alpha/teams/home-alpha/roster")).json()
    assert [r["player"]["slug"] for r in rows] == ["kostas", "petros", "giannis"]
    by = {r["player"]["slug"]: r for r in rows}
    assert by["petros"]["banned_matches"] == 3
    assert by["petros"]["banned_after_matchday"] == 4
    assert by["giannis"]["banned_matches"] is None

    assert (await client.get("/api/v1/beta/teams/home-alpha/roster")).status_code == 404
