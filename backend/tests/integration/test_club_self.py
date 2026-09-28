"""A club editing its own page with its code: colours and logo go straight
on; a sponsor it proposes waits for the federation's approval."""

from __future__ import annotations

import pytest

from .conftest import SAME_SITE, World, session_for
from .test_volunteer import login

pytestmark = pytest.mark.asyncio

BASE = "/api/v1/alpha/ethelontis/club"


async def test_without_a_code_nothing_opens(client, world: World) -> None:
    assert (await client.get(BASE)).status_code == 401


async def test_a_club_sets_its_own_colours(client, world: World) -> None:
    await login(client, world)
    page = await client.patch(BASE, json={"primary_color": "#1A7F3C"}, headers=SAME_SITE)
    assert page.status_code == 200, page.text
    assert page.json()["team"]["primary_color"] == "#1a7f3c"
    # It is the code's own club, whatever the path might suggest.
    assert page.json()["team"]["slug"] == world.a.home.slug


async def test_a_proposed_sponsor_waits_for_the_admin(client, world: World) -> None:
    await login(client, world)
    added = await client.post(f"{BASE}/sponsors", data={"name": "Φούρνος Νίκου"}, headers=SAME_SITE)
    assert added.status_code == 201, added.text
    proposed = added.json()["sponsors"][0]
    assert proposed["pending_approval"] is True and proposed["is_active"] is False

    public = (await client.get(f"/api/v1/alpha/teams/{world.a.home.slug}")).json()
    assert public["sponsors"] == []

    approved = await client.patch(
        f"/api/v1/alpha/editor/teams/{world.a.home.slug}/sponsors/{proposed['id']}",
        json={"is_active": True},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert approved.status_code == 200, approved.text
    row = next(s for s in approved.json()["sponsors"] if s["id"] == proposed["id"])
    assert row["pending_approval"] is False
    public = (await client.get(f"/api/v1/alpha/teams/{world.a.home.slug}")).json()
    assert [s["name"] for s in public["sponsors"]] == ["Φούρνος Νίκου"]
