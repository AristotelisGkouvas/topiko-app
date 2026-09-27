"""The desk's side of the MVP vote: what it may open, and closing one."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import Player, Team

from .conftest import SAME_SITE, World, session_for

pytestmark = pytest.mark.asyncio

URL = "/api/v1/alpha/editor/mvp"


async def _players(db, world: World) -> None:
    db.add_all(
        [
            Player(association_id=world.a.association.id, slug="p1", name="ΠΑΙΚΤΗΣ ΕΝΑ"),
            Player(association_id=world.a.association.id, slug="p2", name="ΠΑΙΚΤΗΣ ΔΥΟ"),
        ]
    )
    await db.commit()


def poll(world: World, **extra) -> dict:
    return {
        "league_slug": "a-katigoria",
        "matchday": 1,
        "candidates": [
            {"player_slug": "p1", "team_slug": world.a.home.slug},
            {"player_slug": "p2", "team_slug": world.a.away.slug},
        ],
        **extra,
    }


async def test_a_poll_that_is_already_closed_is_refused(client, db, world: World) -> None:
    await _players(db, world)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    response = await client.post(
        URL, json=poll(world, closes_at=past), cookies=session_for(world.admin), headers=SAME_SITE
    )
    assert response.status_code == 422


async def test_a_candidate_from_another_division_is_refused(client, db, world: World) -> None:
    await _players(db, world)
    db.add(Team(association_id=world.a.association.id, slug="elsewhere", name="ΑΛΛΟΥ"))
    await db.commit()
    body = poll(world)
    body["candidates"][1]["team_slug"] = "elsewhere"
    response = await client.post(URL, json=body, cookies=session_for(world.admin), headers=SAME_SITE)
    assert response.status_code == 422


async def test_close_keeps_the_votes_and_delete_removes_it(client, db, world: World) -> None:
    await _players(db, world)
    created = await client.post(URL, json=poll(world), cookies=session_for(world.admin), headers=SAME_SITE)
    assert created.status_code == 201, created.text
    poll_id = created.json()["id"]

    ballot = (await client.get("/api/v1/alpha/mvp")).json()
    await client.post(
        f"/api/v1/alpha/mvp/{poll_id}/vote",
        json={"candidate_id": ballot["candidates"][0]["id"], "voter_token": "x" * 32},
    )

    closed = await client.post(f"{URL}/{poll_id}/close", cookies=session_for(world.admin), headers=SAME_SITE)
    assert closed.status_code == 200
    row = closed.json()[0]
    assert row["open"] is False and row["total_votes"] == 1

    gone = await client.delete(f"{URL}/{poll_id}", cookies=session_for(world.admin), headers=SAME_SITE)
    assert gone.json() == []
