"""What every response carries, and what every request is checked for."""

from __future__ import annotations

import pytest

from app.core.config import settings

from .conftest import SAME_SITE, World, session_for

pytestmark = pytest.mark.asyncio


async def test_security_headers_and_request_id(client, world: World) -> None:
    response = await client.get("/api/v1/alpha/meta")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in response.headers["content-security-policy"]
    assert len(response.headers["x-request-id"]) >= 8


async def test_a_sane_request_id_is_kept(client, world: World) -> None:
    response = await client.get("/api/v1/alpha/meta", headers={"X-Request-ID": "abc123def456"})
    assert response.headers["x-request-id"] == "abc123def456"


async def test_a_cookie_write_from_another_site_is_refused(client, world: World) -> None:
    response = await client.patch(
        f"/api/v1/alpha/editor/matches/{world.a.match.id}",
        json={"home_score": 1, "away_score": 0},
        cookies=session_for(world.editor),
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403


async def test_a_write_without_a_cookie_is_not_an_origin_matter(client, world: World) -> None:
    # A vote from anywhere carries no session to forge; the throttle handles it.
    response = await client.post(
        f"/api/v1/alpha/matches/{world.a.match.id}/prognostiko",
        json={"choice": "home", "voter": "abcdefgh12345678"},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code != 403


async def test_logout_revokes_the_token(client, world: World) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": world.editor.email, "password": "correct horse battery"},
        headers=SAME_SITE,
    )
    assert login.status_code == 200
    token = client.cookies.get(settings.session_cookie)
    assert (await client.get("/api/v1/auth/me")).status_code == 200

    await client.post("/api/v1/auth/logout", headers=SAME_SITE)
    client.cookies.set(settings.session_cookie, token)
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_login_is_throttled(client, world: World) -> None:
    codes = [
        (
            await client.post(
                "/api/v1/auth/login",
                json={"email": world.editor.email, "password": "wrong password"},
                headers=SAME_SITE,
            )
        ).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


async def test_the_live_strip_is_briefly_cacheable(client, world: World) -> None:
    response = await client.get("/api/v1/alpha/matches/live")
    assert "s-maxage=10" in response.headers["cache-control"]


async def test_a_logged_in_feed_is_never_shared(client, world: World) -> None:
    response = await client.get(
        f"/api/v1/alpha/ethelontis/matches/{world.a.match.id}/feed",
        cookies={f"{settings.session_cookie}_ethelontis": "x"},
    )
    # 401 here, but nothing about a personal request may be marked public.
    assert "public" not in response.headers.get("cache-control", "")


async def test_json_is_compressed_for_clients_that_ask(client, world: World) -> None:
    response = await client.get(
        "/api/v1/alpha/leagues/a-katigoria/matches", headers={"Accept-Encoding": "gzip"}
    )
    # Two fixtures is under the threshold; the openapi-sized answer is not.
    big = await client.get("/api/v1/associations", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == big.status_code == 200
    large = await client.get("/openapi.json", headers={"Accept-Encoding": "gzip"})
    assert large.headers.get("content-encoding") == "gzip"
