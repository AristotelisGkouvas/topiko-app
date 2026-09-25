"""A club's code: its own matches, around kickoff, and nothing else."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import settings

from .conftest import SAME_SITE, World

pytestmark = pytest.mark.asyncio

COOKIE = f"{settings.session_cookie}_ethelontis"


async def login(client, world: World) -> None:
    response = await client.post(
        "/api/v1/alpha/ethelontis/login",
        json={"code": world.code_plaintext},
        headers=SAME_SITE,
    )
    assert response.status_code == 200, response.text


async def test_a_code_reports_its_own_match_around_kickoff(client, db, world: World) -> None:
    world.a.match.kickoff_at = datetime.now(UTC) - timedelta(minutes=30)
    db.add(world.a.match)
    await db.commit()
    await login(client, world)

    response = await client.post(
        f"/api/v1/alpha/ethelontis/matches/{world.a.match.id}/events",
        json={"kind": "goal", "team_id": world.a.home.id, "minute": 12},
        headers=SAME_SITE,
    )
    assert response.status_code == 201, response.text
    assert response.json()["home_score"] == 1


async def test_not_outside_the_window(client, world: World) -> None:
    # Seeded two days ago: history, not a match in progress.
    await login(client, world)
    response = await client.post(
        f"/api/v1/alpha/ethelontis/matches/{world.a.match.id}/events",
        json={"kind": "goal", "team_id": world.a.home.id},
        headers=SAME_SITE,
    )
    assert response.status_code == 409


async def test_not_another_federations_match(client, world: World) -> None:
    await login(client, world)
    response = await client.post(
        f"/api/v1/alpha/ethelontis/matches/{world.b.match.id}/events",
        json={"kind": "goal", "team_id": world.b.home.id},
        headers=SAME_SITE,
    )
    assert response.status_code == 404


async def test_a_wrong_code_is_refused(client, world: World) -> None:
    response = await client.post(
        "/api/v1/alpha/ethelontis/login", json={"code": "ΓΗΠ-000000"}, headers=SAME_SITE
    )
    assert response.status_code == 401


async def test_logging_out_ends_the_session_everywhere(client, world: World) -> None:
    await login(client, world)
    stolen = client.cookies.get(COOKIE)
    assert (await client.get("/api/v1/alpha/ethelontis/me")).status_code == 200

    await client.post("/api/v1/alpha/ethelontis/logout", headers=SAME_SITE)
    client.cookies.set(COOKIE, stolen)
    assert (await client.get("/api/v1/alpha/ethelontis/me")).status_code == 401


async def test_me_without_a_cookie_is_not_an_error(client, world: World) -> None:
    """A first visit asks "who am I?" and is told "nobody", not 401."""
    response = await client.get("/api/v1/alpha/ethelontis/me")
    assert response.status_code == 200
    assert response.json() is None


async def _live(db, world: World) -> str:
    world.a.match.kickoff_at = datetime.now(UTC) - timedelta(minutes=30)
    db.add(world.a.match)
    await db.commit()
    return f"/api/v1/alpha/ethelontis/matches/{world.a.match.id}/events"


async def test_undo_last_takes_back_the_last_entry_not_the_kickoff(client, db, world) -> None:
    # Kickoff pressed with no minute, then a goal: the goal is what "last" means.
    url = await _live(db, world)
    await login(client, world)
    await client.post(url, json={"kind": "kickoff"}, headers=SAME_SITE)
    feed = (
        await client.post(
            url, json={"kind": "goal", "team_id": world.a.home.id}, headers=SAME_SITE
        )
    ).json()
    kinds = [e["kind"] for e in feed["events"]]
    assert kinds == ["kickoff", "goal"]


async def test_a_code_cannot_undo_another_clubs_entry(client, db, world, sessionmaker) -> None:
    from app.models import MatchEvent
    from app.models.enums import MatchEventKind

    url = await _live(db, world)
    # Somebody else's goal: entered by the dashboard, not by this code.
    db.add(MatchEvent(match_id=world.a.match.id, kind=MatchEventKind.GOAL, team_id=world.a.away.id))
    await db.commit()
    await login(client, world)
    feed = (await client.get(f"/api/v1/alpha/ethelontis/matches/{world.a.match.id}/feed")).json()
    theirs = feed["events"][0]["id"]
    response = await client.delete(f"{url}/{theirs}", headers=SAME_SITE)
    assert response.status_code == 403


async def test_a_code_cannot_undo_its_own_entry_minutes_later(client, db, world) -> None:
    from sqlalchemy import update

    from app.models import MatchEvent

    url = await _live(db, world)
    await login(client, world)
    feed = (
        await client.post(
            url, json={"kind": "goal", "team_id": world.a.home.id, "minute": 5}, headers=SAME_SITE
        )
    ).json()
    mine = feed["events"][0]["id"]
    await db.execute(
        update(MatchEvent)
        .where(MatchEvent.id == mine)
        .values(created_at=datetime.now(UTC) - timedelta(minutes=5))
    )
    await db.commit()
    response = await client.delete(f"{url}/{mine}", headers=SAME_SITE)
    assert response.status_code == 409
