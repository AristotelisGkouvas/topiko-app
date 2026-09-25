"""Nothing from one federation is reachable through another's URL.

Match and team ids are sequential across every tenant, so the only thing
between /alpha/matches/17 and beta's fixture is the join on the association.
Every route that takes an id or a slug is asked for the other tenant's.
"""

from __future__ import annotations

import pytest

from .conftest import SAME_SITE, World, session_for

pytestmark = pytest.mark.asyncio


PUBLIC = [
    "/api/v1/alpha/matches/{match}",
    "/api/v1/alpha/matches/{match}/feed",
    "/api/v1/alpha/matches/{match}/prognostiko",
    "/api/v1/alpha/teams/{team}",
    "/api/v1/alpha/teams/{team}/matches",
    "/api/v1/alpha/teams/{team}/standing",
    "/api/v1/alpha/teams/{team}/imerologio.ics",
    "/api/v1/alpha/kontra/{team}/home-alpha",
]


@pytest.mark.parametrize("template", PUBLIC)
async def test_public_reads_do_not_cross_tenants(client, world: World, template: str) -> None:
    url = template.format(match=world.b.match.id, team=world.b.home.slug)
    response = await client.get(url)
    assert response.status_code == 404, url


async def test_the_same_id_answers_in_its_own_tenant(client, world: World) -> None:
    # The negative above means something only if the positive holds.
    response = await client.get(f"/api/v1/beta/matches/{world.b.match.id}")
    assert response.status_code == 200


async def test_an_admin_cannot_edit_across_tenants_through_the_url(client, world: World) -> None:
    # Admins reach every association, so this is purely the URL join at work.
    response = await client.patch(
        f"/api/v1/alpha/editor/matches/{world.b.match.id}",
        json={"home_score": 1, "away_score": 0},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 404


async def test_events_cannot_be_filed_across_tenants(client, world: World) -> None:
    response = await client.post(
        f"/api/v1/alpha/editor/matches/{world.b.match.id}/events",
        json={"kind": "kickoff"},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 404
