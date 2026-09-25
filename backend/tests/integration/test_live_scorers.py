"""Goals logged at the ground, counted per player, apart from the official table."""

from __future__ import annotations

import pytest

from app.models import MatchEvent, Player
from app.models.enums import MatchEventKind

from .conftest import World

pytestmark = pytest.mark.asyncio


async def test_logged_goals_count_for_the_named_player(client, db, world: World) -> None:
    a = world.a
    scorer = Player(association_id=a.association.id, slug="nikos", name="ΝΙΚΟΣ Π.")
    db.add(scorer)
    await db.flush()
    db.add_all(
        [
            MatchEvent(match_id=a.match.id, kind=MatchEventKind.GOAL, team_id=a.home.id, player_id=scorer.id),
            MatchEvent(match_id=a.match.id, kind=MatchEventKind.PENALTY_GOAL, team_id=a.home.id, player_id=scorer.id),
            # Not his: an own goal, and one nobody could name.
            MatchEvent(match_id=a.match.id, kind=MatchEventKind.OWN_GOAL, team_id=a.away.id, player_id=scorer.id),
            MatchEvent(match_id=a.match.id, kind=MatchEventKind.GOAL, team_id=a.home.id),
        ]
    )
    await db.commit()

    rows = (await client.get("/api/v1/alpha/leagues/a-katigoria/scorers/live")).json()
    assert [(r["player"]["slug"], r["team"]["slug"], r["goals"]) for r in rows] == [
        ("nikos", "home-alpha", 2)
    ]

    # The other federation's league of the same slug sees none of it.
    assert (await client.get("/api/v1/beta/leagues/a-katigoria/scorers/live")).json() == []
