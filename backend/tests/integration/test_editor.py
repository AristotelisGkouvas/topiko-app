"""The dashboard's write path: who may, and what an edit sets in motion."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import ScrapeRun
from app.models.enums import ScrapeRunStatus

from .conftest import SAME_SITE, World, session_for

pytestmark = pytest.mark.asyncio


def edit_url(world: World, match_id: int | None = None) -> str:
    return f"/api/v1/alpha/editor/matches/{match_id or world.a.match.id}"


async def test_no_session_no_edit(client, world: World) -> None:
    response = await client.patch(edit_url(world), json={"home_score": 1}, headers=SAME_SITE)
    assert response.status_code == 401


async def test_an_editor_is_confined_to_their_association(client, world: World) -> None:
    response = await client.patch(
        f"/api/v1/beta/editor/matches/{world.b.match.id}",
        json={"home_score": 1},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    assert response.status_code == 403


async def test_a_live_edit_needs_the_live_permission(client, db, world: World) -> None:
    world.a.match.kickoff_at = datetime.now(UTC) - timedelta(minutes=20)
    db.add(world.a.match)
    await db.commit()

    denied = await client.patch(
        edit_url(world),
        json={"home_score": 1, "away_score": 0},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    assert denied.status_code == 403

    allowed = await client.patch(
        edit_url(world),
        json={"home_score": 1, "away_score": 0},
        cookies=session_for(world.live_editor),
        headers=SAME_SITE,
    )
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "live"


async def test_a_result_finishes_the_match_and_moves_the_table(client, world: World) -> None:
    response = await client.patch(
        edit_url(world),
        json={"home_score": 2, "away_score": 1},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "finished"

    table = (await client.get("/api/v1/alpha/leagues/a-katigoria/standings")).json()
    points = {row["team"]["slug"]: row["points"] for row in table}
    assert points == {"home-alpha": 3, "away-alpha": 0}


async def test_a_status_change_alone_moves_the_table(client, world: World) -> None:
    await client.patch(
        edit_url(world),
        json={"home_score": 2, "away_score": 1},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    response = await client.patch(
        edit_url(world),
        json={"status": "postponed"},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    assert response.status_code == 200

    table = (await client.get("/api/v1/alpha/leagues/a-katigoria/standings")).json()
    assert all(row["points"] == 0 for row in table)


async def test_no_score_before_kickoff(client, db, world: World) -> None:
    world.a.match.kickoff_at = datetime.now(UTC) + timedelta(days=3)
    db.add(world.a.match)
    await db.commit()
    response = await client.patch(
        edit_url(world),
        json={"home_score": 1, "away_score": 0},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    assert response.status_code == 400


async def test_a_logged_match_refuses_a_typed_score(client, world: World) -> None:
    await client.post(
        f"{edit_url(world)}/events",
        json={"kind": "goal", "team_id": world.a.home.id, "minute": 10},
        cookies=session_for(world.live_editor),
        headers=SAME_SITE,
    )
    response = await client.patch(
        edit_url(world),
        json={"home_score": 5, "away_score": 0},
        cookies=session_for(world.live_editor),
        headers=SAME_SITE,
    )
    assert response.status_code == 409


async def test_the_first_event_on_a_typed_score_is_on_record(client, world: World) -> None:
    await client.patch(
        edit_url(world),
        json={"home_score": 3, "away_score": 4},
        cookies=session_for(world.live_editor),
        headers=SAME_SITE,
    )
    feed = await client.post(
        f"{edit_url(world)}/events",
        json={"kind": "goal", "team_id": world.a.away.id, "minute": 5},
        cookies=session_for(world.live_editor),
        headers=SAME_SITE,
    )
    assert feed.status_code == 201
    assert (feed.json()["home_score"], feed.json()["away_score"]) == (0, 1)

    audit = (
        await client.get("/api/v1/alpha/editor/audit", cookies=session_for(world.admin))
    ).json()
    event_rows = [row for row in audit if row["action"] == "match.event"]
    assert event_rows[0]["new_value"]["replaced_typed_score"] is True
    assert event_rows[0]["old_value"] == {"home_score": 3, "away_score": 4}


async def test_scrape_runs_are_listed_per_association(client, db, world: World) -> None:
    db.add_all(
        [
            ScrapeRun(
                association_id=world.a.association.id,
                source_key="epsip",
                status=ScrapeRunStatus.FAILED,
                error="timeout",
            ),
            ScrapeRun(
                association_id=world.b.association.id,
                source_key="epsip",
                status=ScrapeRunStatus.SUCCESS,
            ),
        ]
    )
    await db.commit()
    runs = (
        await client.get("/api/v1/alpha/editor/scrape-runs", cookies=session_for(world.editor))
    ).json()
    assert [(r["status"], r["error"]) for r in runs] == [("failed", "timeout")]

    meta = (await client.get("/api/v1/alpha/meta")).json()
    assert meta["last_run_status"] == "failed"


async def test_a_postponement_moves_date_and_ground(client, db, world: World) -> None:
    from app.models import Field

    venue = Field(association_id=world.a.association.id, slug="neo-gipedo", name="ΝΕΟ ΓΗΠΕΔΟ")
    other = Field(association_id=world.b.association.id, slug="xeno", name="ΞΕΝΟ")
    db.add_all([venue, other])
    await db.commit()

    new_kickoff = (datetime.now(UTC) + timedelta(days=7)).replace(microsecond=0)
    response = await client.patch(
        edit_url(world),
        json={"kickoff_at": new_kickoff.isoformat(), "field_id": venue.id, "status": "scheduled"},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["field"]["slug"] == "neo-gipedo"
    assert datetime.fromisoformat(body["kickoff_at"]) == new_kickoff

    # Another association's ground is not on offer.
    foreign = await client.patch(
        edit_url(world),
        json={"field_id": other.id},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    assert foreign.status_code == 404


async def test_the_match_list_filters_by_club(client, world: World) -> None:
    url = "/api/v1/alpha/editor/matches?days=7"
    everything = await client.get(url, cookies=session_for(world.editor))
    assert len(everything.json()) == 1

    # Accent-blind, like the public search.
    found = await client.get(f"{url}&q=γηπεδούχος", cookies=session_for(world.editor))
    assert [m["id"] for m in found.json()] == [world.a.match.id]

    none = await client.get(f"{url}&q=κανενας", cookies=session_for(world.editor))
    assert none.json() == []
