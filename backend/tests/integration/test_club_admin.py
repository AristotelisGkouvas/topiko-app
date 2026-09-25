"""A club's look: who may change it, what an upload becomes, what the public sees."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from app.core.config import settings

from .conftest import SAME_SITE, World, session_for

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _media(tmp_path, monkeypatch) -> Path:
    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    return tmp_path


def png(size=(800, 600), mode="RGBA", exif: bytes | None = None, fmt="PNG") -> bytes:
    buffer = io.BytesIO()
    # A crest with transparent corners, as real ones have: a fully opaque
    # RGBA would rightly be stored without its alpha channel.
    image = Image.new(mode, size, (200, 30, 30, 0) if mode == "RGBA" else (200, 30, 30))
    if mode == "RGBA":
        image.paste((200, 30, 30, 255), (size[0] // 4, size[1] // 4, size[0] * 3 // 4, size[1] * 3 // 4))
    image.save(buffer, fmt, **({"exif": exif} if exif else {}))
    return buffer.getvalue()


def on_disk(media: Path, url: str) -> Path:
    return media / url.removeprefix(f"{settings.media_url}/")


def read(media: Path, url: str) -> Image.Image:
    """Decoded and closed: an open handle stops Windows deleting the file."""
    with Image.open(on_disk(media, url)) as image:
        image.load()
        image.info["_format"] = image.format
        return image.copy()


def base(world: World) -> str:
    return f"/api/v1/alpha/editor/teams/{world.a.home.slug}"


async def test_only_an_admin_may_change_a_club(client, world: World) -> None:
    denied = await client.patch(
        base(world),
        json={"primary_color": "#123456"},
        cookies=session_for(world.editor),
        headers=SAME_SITE,
    )
    assert denied.status_code == 403

    allowed = await client.patch(
        base(world),
        json={"primary_color": "#ABCDEF"},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert allowed.status_code == 200
    assert allowed.json()["team"]["primary_color"] == "#abcdef"


async def test_a_colour_must_be_a_hex_triplet(client, world: World) -> None:
    response = await client.patch(
        base(world),
        json={"primary_color": "red; background:url(x)"},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 422


async def test_another_federations_club_is_not_found(client, world: World) -> None:
    response = await client.patch(
        f"/api/v1/alpha/editor/teams/{world.b.home.slug}",
        json={"primary_color": "#123456"},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 404


async def test_a_logo_is_reencoded_and_shown_everywhere(client, world: World, _media: Path) -> None:
    response = await client.put(
        f"{base(world)}/logo",
        files={"file": ("crest.png", png(size=(2000, 1000)), "image/png")},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 200, response.text
    url = response.json()["team"]["logo_url"]
    assert url.startswith(f"{settings.media_url}/teams/") and url.endswith(".webp")

    stored = read(_media, url)
    assert stored.info["_format"] == "WEBP"
    assert max(stored.size) == 512
    assert stored.mode == "RGBA"  # a crest keeps its transparent corners

    team = (await client.get(f"/api/v1/alpha/teams/{world.a.home.slug}")).json()
    assert team["logo_url"] == url
    match = (await client.get(f"/api/v1/alpha/matches/{world.a.match.id}")).json()
    assert match["match"]["home_team"]["logo_url"] == url


async def test_replacing_a_logo_deletes_the_old_file(client, world: World, _media: Path) -> None:
    upload = lambda: client.put(  # noqa: E731
        f"{base(world)}/logo",
        files={"file": ("crest.png", png(), "image/png")},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    first = (await upload()).json()["team"]["logo_url"]
    second = (await upload()).json()["team"]["logo_url"]
    assert first != second
    assert not on_disk(_media, first).exists()
    assert on_disk(_media, second).exists()


async def test_something_that_is_not_an_image_is_refused(client, world: World, _media: Path) -> None:
    response = await client.put(
        f"{base(world)}/logo",
        files={"file": ("crest.png", b"<svg onload=alert(1)>", "image/png")},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 422
    assert not any(_media.rglob("*.webp"))


async def test_a_photo_loses_its_exif_and_gains_a_thumbnail(client, world: World, _media: Path) -> None:
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make; stands in for the GPS block
    response = await client.post(
        f"{base(world)}/photos",
        files={"file": ("pitch.jpg", png(size=(4000, 3000), mode="RGB", exif=exif.tobytes(), fmt="JPEG"), "image/jpeg")},
        data={"caption": "  Πρώτη προπόνηση  "},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 201, response.text
    [photo] = response.json()["photos"]
    assert photo["caption"] == "Πρώτη προπόνηση"
    assert (photo["width"], photo["height"]) == (1600, 1200)

    assert not read(_media, photo["url"]).getexif()
    assert max(read(_media, photo["thumb_url"]).size) == 480

    deleted = await client.delete(
        f"{base(world)}/photos/{photo['id']}",
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert deleted.json()["photos"] == []
    assert not on_disk(_media, photo["url"]).exists()
    assert not on_disk(_media, photo["thumb_url"]).exists()


async def test_the_newest_photo_leads(client, world: World) -> None:
    for caption in ("πρώτη", "δεύτερη"):
        await client.post(
            f"{base(world)}/photos",
            files={"file": ("p.png", png(mode="RGB"), "image/png")},
            data={"caption": caption},
            cookies=session_for(world.admin),
            headers=SAME_SITE,
        )
    team = (await client.get(f"/api/v1/alpha/teams/{world.a.home.slug}")).json()
    assert [p["caption"] for p in team["photos"]] == ["δεύτερη", "πρώτη"]


async def test_a_sponsor_link_must_be_a_web_address(client, world: World) -> None:
    response = await client.post(
        f"{base(world)}/sponsors",
        data={"name": "Φούρνος", "website_url": "javascript:alert(1)"},
        cookies=session_for(world.admin),
        headers=SAME_SITE,
    )
    assert response.status_code == 422


async def test_sponsors_in_order_and_only_the_active_ones_in_public(client, world: World) -> None:
    admin = {"cookies": session_for(world.admin), "headers": SAME_SITE}
    for name in ("Φούρνος Παπαδόπουλου", "Καφέ Πλατεία", "Συνεργείο"):
        await client.post(
            f"{base(world)}/sponsors",
            data={"name": name, "website_url": "https://example.gr"},
            files={"file": ("logo.png", png(size=(300, 120)), "image/png")},
            **admin,
        )
    look = (await client.get(base(world), **admin)).json()
    ids = [s["id"] for s in look["sponsors"]]
    assert [s["name"] for s in look["sponsors"]] == ["Φούρνος Παπαδόπουλου", "Καφέ Πλατεία", "Συνεργείο"]
    assert all(s["logo_url"] for s in look["sponsors"])

    await client.patch(f"{base(world)}/sponsors/{ids[1]}", json={"is_active": False}, **admin)
    reordered = await client.put(
        f"{base(world)}/sponsors/order", json={"ids": [ids[2], ids[0], ids[1]]}, **admin
    )
    assert reordered.status_code == 200

    team = (await client.get(f"/api/v1/alpha/teams/{world.a.home.slug}")).json()
    assert [s["name"] for s in team["sponsors"]] == ["Συνεργείο", "Φούρνος Παπαδόπουλου"]

    match = (await client.get(f"/api/v1/alpha/matches/{world.a.match.id}")).json()
    assert [s["name"] for s in match["home_sponsors"]] == ["Συνεργείο", "Φούρνος Παπαδόπουλου"]
    assert match["away_sponsors"] == []


async def test_a_stale_order_is_refused(client, world: World) -> None:
    admin = {"cookies": session_for(world.admin), "headers": SAME_SITE}
    await client.post(f"{base(world)}/sponsors", data={"name": "Α"}, **admin)
    response = await client.put(f"{base(world)}/sponsors/order", json={"ids": [999]}, **admin)
    assert response.status_code == 409


async def test_every_change_is_in_the_audit_log(client, world: World) -> None:
    admin = {"cookies": session_for(world.admin), "headers": SAME_SITE}
    await client.patch(base(world), json={"primary_color": "#112233"}, **admin)
    await client.post(f"{base(world)}/sponsors", data={"name": "Α"}, **admin)
    log = (await client.get("/api/v1/alpha/editor/audit", **admin)).json()
    assert {"team.colours", "sponsor.add"} <= {entry["action"] for entry in log}
