"""The division calendar and the results feed."""

from __future__ import annotations

import pytest

from app.models.enums import MatchStatus

from .conftest import World

pytestmark = pytest.mark.asyncio


async def test_a_division_calendar_lists_its_fixtures(client, world: World) -> None:
    response = await client.get("/api/v1/alpha/leagues/a-katigoria/imerologio.ics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    body = response.text
    assert "X-WR-CALNAME:Α΄ Κατηγορία" in body
    assert f"UID:match-{world.a.match.id}@pamesentra" in body


async def test_the_feed_carries_final_scores_only(client, db, world: World) -> None:
    empty = await client.get("/api/v1/alpha/apotelesmata.rss")
    assert empty.status_code == 200
    assert "<item>" not in empty.text

    world.a.match.home_score, world.a.match.away_score = 2, 1
    world.a.match.status = MatchStatus.FINISHED
    db.add(world.a.match)
    await db.commit()

    feed = (await client.get("/api/v1/alpha/apotelesmata.rss")).text
    assert "ΓΗΠΕΔΟΥΧΟΣ alpha - ΦΙΛΟΞΕΝΟΥΜΕΝΗ alpha 2-1" in feed
    # The other federation's result is not in this one's feed.
    assert "beta" not in feed


async def test_search_finds_matches_by_referee(client, db, world: World) -> None:
    world.a.match.referee = "ΡΑΠΤΗΣ Γ."
    db.add(world.a.match)
    await db.commit()

    # Accent- and case-blind, and greeklish, like every other search.
    # "rapt", not "raptis": greeklish cannot tell ι from η (see search.greeklish).
    for q in ("ράπτης", "rapt"):
        body = (await client.get(f"/api/v1/alpha/search?q={q}")).json()
        assert [h["slug"] for h in body["matches"]] == [str(world.a.match.id)], q
        assert body["matches"][0]["subtitle"].startswith("Διαιτ. ΡΑΠΤΗΣ")

    # Not across federations.
    assert (await client.get("/api/v1/beta/search?q=rapt")).json()["matches"] == []
