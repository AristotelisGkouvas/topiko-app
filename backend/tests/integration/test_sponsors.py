"""Platform sponsors and the sponsor counters: who may edit them, when they
show, and that a counter anybody can post to only counts real sponsors."""

from __future__ import annotations

import io
from datetime import timedelta
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import select

from app.core.config import settings
from app.models import Sponsor, SponsorDailyStat
from app.services import sponsorship

from .conftest import SAME_SITE, World, session_for

pytestmark = pytest.mark.asyncio

ADMIN = "/api/v1/alpha/editor/platform-sponsors"


@pytest.fixture(autouse=True)
def _media(tmp_path, monkeypatch) -> Path:
    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    return tmp_path


def logo() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", (600, 200), (20, 90, 170, 255)).save(buffer, "PNG")
    return buffer.getvalue()


async def add(client, world: World, name: str, **form) -> dict:
    response = await client.post(
        ADMIN,
        data={"name": name, **{k: str(v) for k, v in form.items()}},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 201, response.text
    return next(s for s in response.json() if s["name"] == name)


async def test_only_an_admin_manages_platform_sponsors(client, world: World) -> None:
    for method, kwargs in (("get", {}), ("post", {"data": {"name": "X"}})):
        denied = await getattr(client, method)(
            ADMIN, cookies=session_for(world.editor), headers=SAME_SITE, **kwargs
        )
        assert denied.status_code == 403


async def test_a_logo_is_kept_as_webp_and_png(client, world: World, _media: Path) -> None:
    response = await client.post(
        ADMIN,
        data={"name": "ERGO", "placements": "site,share"},
        files={"file": ("ergo.png", logo(), "image/png")},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 201, response.text
    sponsor = response.json()[0]
    assert sponsor["logo_url"].endswith(".webp")
    assert sponsor["logo_png_url"].endswith(".png")
    assert sponsor["placements"] == ["site", "share"]
    png = _media / sponsor["logo_png_url"].removeprefix(f"{settings.media_url}/")
    with Image.open(png) as image:
        assert image.format == "PNG" and max(image.size) <= 512


async def test_the_dates_and_placements_decide_what_is_public(client, world: World) -> None:
    today = sponsorship.today()
    await add(client, world, "Τώρα", placements="site")
    await add(client, world, "Έληξε", ends_on=today - timedelta(days=1))
    await add(client, world, "Αύριο", starts_on=today + timedelta(days=1))
    await add(client, world, "Σήμερα τελευταία", ends_on=today, placements="home")

    everywhere = {s["name"] for s in (await client.get("/api/v1/alpha/sponsors")).json()}
    assert everywhere == {"Τώρα", "Σήμερα τελευταία"}

    home = {s["name"] for s in (await client.get("/api/v1/alpha/sponsors?placement=home")).json()}
    assert home == {"Σήμερα τελευταία"}

    # And the other federation sees none of them.
    assert (await client.get("/api/v1/beta/sponsors")).json() == []


async def test_the_dashboard_says_which_are_ending(client, world: World) -> None:
    today = sponsorship.today()
    await add(client, world, "Λήγει", ends_on=today + timedelta(days=3))
    await add(client, world, "Έληξε", ends_on=today - timedelta(days=1))
    rows = (await client.get(ADMIN, cookies=session_for(world.admin), headers=SAME_SITE)).json()
    assert {r["name"]: r["status"] for r in rows} == {"Λήγει": "ending", "Έληξε": "ended"}


async def test_an_end_before_the_start_is_refused(client, world: World) -> None:
    today = sponsorship.today()
    response = await client.post(
        ADMIN,
        data={"name": "X", "starts_on": str(today), "ends_on": str(today - timedelta(days=1))},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 422


async def test_views_count_only_this_federations_sponsors(client, world: World, db) -> None:
    ours = await add(client, world, "Δικός μας")
    response = await client.post(
        "/api/v1/alpha/sponsors/views", json={"platform": [ours["id"], 99999]}
    )
    assert response.status_code == 204
    # Beta has no such sponsor: counting it from there must do nothing.
    await client.post("/api/v1/beta/sponsors/views", json={"platform": [ours["id"]]})

    rows = (await db.execute(select(SponsorDailyStat))).scalars().all()
    assert [(r.ref_id, r.views) for r in rows] == [(ours["id"], 1)]

    listed = (await client.get(ADMIN, cookies=session_for(world.admin), headers=SAME_SITE)).json()
    assert listed[0]["views_30d"] == 1


async def test_a_click_is_counted_and_sent_on(client, world: World) -> None:
    ours = await add(client, world, "Με site", website_url="https://example.com/")
    response = await client.get(f"/api/v1/alpha/sponsors/go/platform/{ours['id']}")
    assert response.status_code == 302
    assert response.headers["location"] == "https://example.com/"

    # Not beta's sponsor, and not one without a site.
    assert (await client.get(f"/api/v1/beta/sponsors/go/platform/{ours['id']}")).status_code == 404
    bare = await add(client, world, "Χωρίς site")
    assert (await client.get(f"/api/v1/alpha/sponsors/go/platform/{bare['id']}")).status_code == 404

    listed = (await client.get(ADMIN, cookies=session_for(world.admin), headers=SAME_SITE)).json()
    assert next(s for s in listed if s["name"] == "Με site")["clicks_30d"] == 1


async def test_a_lapsed_club_sponsor_leaves_the_club_page(client, world: World, db) -> None:
    today = sponsorship.today()
    db.add_all(
        [
            Sponsor(team_id=world.a.home.id, name="Ισχύει", position=0, is_active=True),
            Sponsor(
                team_id=world.a.home.id, name="Έληξε", position=1, is_active=True,
                ends_on=today - timedelta(days=1),
            ),
        ]
    )
    await db.commit()
    page = (await client.get(f"/api/v1/alpha/teams/{world.a.home.slug}")).json()
    assert [s["name"] for s in page["sponsors"]] == ["Ισχύει"]


async def test_views_only_from_our_own_pages(client, world: World, db) -> None:
    ours = await add(client, world, "Προστασία")
    url = "/api/v1/alpha/sponsors/views"
    body = f'{{"platform": [{ours["id"]}]}}'

    # A foreign page's typeless beacon: no Content-Type, so no preflight.
    assert (await client.post(url, content=body)).status_code == 415
    # JSON, but announced from somebody else's site.
    foreign = await client.post(url, json={"platform": [ours["id"]]}, headers={"Origin": "https://evil.example"})
    assert foreign.status_code == 403

    assert (await client.post(url, json={"platform": [ours["id"]]}, headers=SAME_SITE)).status_code == 204
    rows = (await db.execute(select(SponsorDailyStat))).scalars().all()
    assert [r.views for r in rows] == [1]


async def test_a_repeat_from_one_address_counts_once(client, world: World) -> None:
    ours = await add(client, world, "Επανάληψη")
    for _ in range(5):
        await client.post("/api/v1/alpha/sponsors/views", json={"platform": [ours["id"]]})
    await client.get(f"/api/v1/alpha/sponsors/go/platform/{ours['id']}")
    listed = (await client.get(ADMIN, cookies=session_for(world.admin), headers=SAME_SITE)).json()
    row = next(s for s in listed if s["name"] == "Επανάληψη")
    assert (row["views_30d"], row["clicks_30d"]) == (1, 0)


async def test_a_sponsor_off_the_air_is_not_counted(client, world: World) -> None:
    today = sponsorship.today()
    later = await add(
        client, world, "Αργότερα", website_url="https://example.com/", starts_on=today + timedelta(days=3)
    )
    await client.post("/api/v1/alpha/sponsors/views", json={"platform": [later["id"]]})
    # The link still works — a page opened yesterday may carry it — but no click is billed.
    assert (await client.get(f"/api/v1/alpha/sponsors/go/platform/{later['id']}")).status_code == 302
    listed = (await client.get(ADMIN, cookies=session_for(world.admin), headers=SAME_SITE)).json()
    row = next(s for s in listed if s["name"] == "Αργότερα")
    assert (row["views_30d"], row["clicks_30d"]) == (0, 0)


async def test_the_office_note_stays_out_of_the_trail(client, world: World) -> None:
    ours = await add(client, world, "Σημείωση")
    await client.patch(
        f"{ADMIN}/{ours['id']}",
        json={"note": "Πλήρωσε 800€"},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    trail = (
        await client.get("/api/v1/alpha/editor/audit", cookies=session_for(world.admin), headers=SAME_SITE)
    ).json()
    assert "800" not in str(trail)
    assert any(e["action"] == "platform_sponsor.edit" for e in trail)

    # And an editor sees none of the platform-sponsor entries at all.
    editor_trail = (
        await client.get("/api/v1/alpha/editor/audit", cookies=session_for(world.editor), headers=SAME_SITE)
    ).json()
    assert not any(e["entity_type"] == "platform_sponsor" for e in editor_trail)


async def test_betting_alcohol_tobacco_stay_off_youth_football(client, world: World, db) -> None:
    sponsor = await add(client, world, "Στοίχημα", placements="match,share")
    edit = await client.patch(
        f"{ADMIN}/{sponsor['id']}",
        json={"category": "betting"},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert edit.status_code == 200, edit.text

    # On an adult match, yes; on a youth one, and in the untargeted list, no.
    match = {s["name"] for s in (await client.get("/api/v1/alpha/sponsors?placement=match")).json()}
    assert match == {"Στοίχημα"}
    youth = (await client.get("/api/v1/alpha/sponsors?placement=match&youth=true")).json()
    assert youth == []
    assert (await client.get("/api/v1/alpha/sponsors")).json() == []

    # And it can never take the placements that sit around every league.
    refused = await client.patch(
        f"{ADMIN}/{sponsor['id']}",
        json={"placements": ["site", "match"]},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert refused.status_code == 422


async def test_a_restricted_club_sponsor_is_off_the_clubs_youth_matches(
    client, world: World, db
) -> None:
    db.add_all(
        [
            Sponsor(team_id=world.a.home.id, name="Φούρνος", position=0, is_active=True),
            Sponsor(
                team_id=world.a.home.id, name="Ποτοποιία", position=1, is_active=True,
                category="alcohol",
            ),
        ]
    )
    await db.commit()
    url = f"/api/v1/alpha/matches/{world.a.match.id}"

    adult = (await client.get(url)).json()
    assert [s["name"] for s in adult["home_sponsors"]] == ["Φούρνος", "Ποτοποιία"]

    league = await db.get(type(world.a.league), world.a.league.id)
    assert league is not None
    league.age_group = "Κ16"
    await db.commit()
    youth = (await client.get(url)).json()
    assert [s["name"] for s in youth["home_sponsors"]] == ["Φούρνος"]


async def test_a_sponsor_report_opens_only_by_its_own_link(client, world: World, db) -> None:
    sponsor = await add(client, world, "Φούρνος Λάμπρου", placements="site,share")
    await sponsorship.bump(db, association_id=world.a.association.id, kind="platform", ids=[sponsor["id"]], field="views")
    await sponsorship.bump(db, association_id=world.a.association.id, kind="platform", ids=[sponsor["id"]], field="clicks")
    await db.commit()

    # Only an admin makes the link, and asking twice gives the same one.
    denied = await client.post(
        f"{ADMIN}/{sponsor['id']}/report-link", cookies=session_for(world.editor), headers=SAME_SITE
    )
    assert denied.status_code == 403
    first = await client.post(
        f"{ADMIN}/{sponsor['id']}/report-link", cookies=session_for(world.admin), headers=SAME_SITE
    )
    again = await client.post(
        f"{ADMIN}/{sponsor['id']}/report-link", cookies=session_for(world.admin), headers=SAME_SITE
    )
    token = first.json()["token"]
    assert token == again.json()["token"] and len(token) >= 16

    report = (await client.get(f"/api/v1/alpha/sponsor-report/{token}")).json()
    assert report["name"] == "Φούρνος Λάμπρου"
    assert report["kind"] == "platform"
    assert len(report["months"]) == 12
    assert report["months"][-1]["views"] == 1 and report["months"][-1]["clicks"] == 1
    assert (report["views_total"], report["clicks_total"]) == (1, 1)

    # A made-up token, or the right one on the other federation, opens nothing.
    assert (await client.get("/api/v1/alpha/sponsor-report/xxxxxxxxxxxxxxxxxxxxxxxx")).status_code == 404
    assert (await client.get(f"/api/v1/beta/sponsor-report/{token}")).status_code == 404


async def test_a_club_sponsor_has_a_report_too(client, world: World, db) -> None:
    db.add(Sponsor(team_id=world.a.home.id, name="Συνεργείο", position=0, is_active=True))
    await db.commit()
    sponsor = (await db.execute(select(Sponsor).where(Sponsor.name == "Συνεργείο"))).scalar_one()
    link = await client.post(
        f"/api/v1/alpha/editor/teams/{world.a.home.slug}/sponsors/{sponsor.id}/report-link",
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert link.status_code == 200, link.text
    report = (await client.get(f"/api/v1/alpha/sponsor-report/{link.json()['token']}")).json()
    assert (report["kind"], report["club_name"]) == ("club", world.a.home.name)
