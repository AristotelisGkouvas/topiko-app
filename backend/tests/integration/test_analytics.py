"""Anonymous statistics: what is counted, what is refused, who may read it."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AnalyticsEvent, PageView

from .conftest import SAME_SITE, World, session_for

pytestmark = pytest.mark.asyncio

READER = {**SAME_SITE, "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1"}
VIEW = "/api/v1/alpha/analytics/view"


async def test_a_view_is_stored_without_the_address(client, world: World, db) -> None:
    response = await client.post(
        VIEW,
        json={"url": f"/agones/{world.a.match.id}?utm_source=viber", "referrer": "https://m.facebook.com/x", "dark": True},
        headers=READER,
    )
    assert response.status_code == 200 and response.json()["id"]
    row = (await db.execute(select(PageView))).scalar_one()
    assert (row.route, row.entity) == ("/agones/[id]", f"match:{world.a.match.id}")
    assert (row.device, row.browser, row.os) == ("mobile", "Safari", "iOS")
    assert (row.referrer_host, row.utm_source, row.dark) == ("Facebook", "viber", True)
    assert len(row.visitor) == 16 and "127.0.0.1" not in str(vars(row))

    left = await client.post(
        "/api/v1/alpha/analytics/leave",
        json={"id": row.id, "duration_ms": 42000, "scroll_pct": 80},
        headers=READER,
    )
    assert left.status_code == 204
    await db.refresh(row)
    assert (row.duration_ms, row.scroll_pct) == (42000, 80)


async def test_bots_gpc_admin_and_foreign_pages_are_not_counted(client, world: World, db) -> None:
    bot = {**SAME_SITE, "User-Agent": "Mozilla/5.0 HeadlessChrome/120"}
    assert (await client.post(VIEW, json={"url": "/"}, headers=bot)).json()["id"] is None
    assert (await client.post(VIEW, json={"url": "/"}, headers={**READER, "Sec-GPC": "1"})).json()["id"] is None
    assert (await client.post(VIEW, json={"url": "/admin"}, headers=READER)).json()["id"] is None
    foreign = await client.post(VIEW, json={"url": "/"}, headers={**READER, "Origin": "https://evil.example"})
    assert foreign.status_code == 403
    assert (await db.execute(select(PageView))).scalars().all() == []


async def test_only_known_events_are_kept(client, world: World, db) -> None:
    url = "/api/v1/alpha/analytics/event"
    assert (await client.post(url, json={"name": "search", "props": {"q": "δαφνούλα"}}, headers=READER)).status_code == 204
    assert (await client.post(url, json={"name": "anything"}, headers=READER)).status_code == 422
    rows = (await db.execute(select(AnalyticsEvent))).scalars().all()
    assert [(r.name, r.props) for r in rows] == [("search", {"q": "δαφνούλα"})]


async def test_the_summary_is_for_the_admin_alone(client, world: World) -> None:
    await client.post(VIEW, json={"url": f"/somateia/{world.a.home.slug}"}, headers=READER)
    await client.post(VIEW, json={"url": "/vathmologia?liga=a-katigoria"}, headers=READER)
    await client.post(
        "/api/v1/alpha/analytics/event", json={"name": "search", "props": {"q": "γήπεδο"}}, headers=READER
    )
    url = "/api/v1/alpha/editor/analytics?days=7"
    assert (await client.get(url, cookies=session_for(world.editor), headers=SAME_SITE)).status_code == 403
    data = (await client.get(url, cookies=session_for(world.admin), headers=SAME_SITE)).json()
    assert data["totals"]["views"] == 2 and data["totals"]["visitors"] == 1
    assert data["teams"][0]["label"] == world.a.home.name
    assert data["leagues"][0]["key"] == "league:a-katigoria"
    assert data["searches"][0]["key"] == "γήπεδο"
    assert len(data["per_day"]) == 7 and sum(data["hours"]) == 2


async def test_vitals_and_errors_are_summarised(client, world: World) -> None:
    url = "/api/v1/alpha/analytics/event"
    for value in (1200, 1800, 2600):
        await client.post(url, json={"name": "vital", "props": {"name": "LCP", "value": value}}, headers=READER)
    await client.post(url, json={"name": "vital", "props": {"name": "CLS", "value": 0.05}}, headers=READER)
    await client.post(url, json={"name": "js_error", "props": {"message": "x is undefined"}}, headers=READER)
    data = (
        await client.get("/api/v1/alpha/editor/analytics", cookies=session_for(world.admin), headers=SAME_SITE)
    ).json()
    vitals = {v["name"]: v for v in data["vitals"]}
    assert vitals["LCP"]["count"] == 3 and 1800 <= vitals["LCP"]["p75"] <= 2600
    assert vitals["CLS"]["p75"] == pytest.approx(0.05)
    assert data["errors"][0]["key"] == "x is undefined"
