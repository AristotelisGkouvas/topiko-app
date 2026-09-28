import json

import httpx
import pytest

from app.core.config import settings
from app.services import indexnow


@pytest.fixture
def captured(monkeypatch):
    """Route the service's client through a mock that records each request."""
    requests: list[httpx.Request] = []
    status = {"code": 202}

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status["code"])

    real = httpx.AsyncClient
    monkeypatch.setattr(
        indexnow.httpx,
        "AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
    )
    monkeypatch.setattr(settings, "indexnow_key", "abc123def456")
    monkeypatch.setattr(settings, "site_url", "https://pamesentra.gr/")
    return requests, status


@pytest.mark.asyncio
async def test_sends_absolute_urls_with_key_and_location(captured):
    requests, _ = captured
    sent = await indexnow.submit(["/agones/7", "/somateia/atlas", "/agones/7"])

    assert sent == 2
    body = json.loads(requests[0].content)
    assert body == {
        "host": "pamesentra.gr",
        "key": "abc123def456",
        "keyLocation": "https://pamesentra.gr/indexnow.txt",
        "urlList": ["https://pamesentra.gr/agones/7", "https://pamesentra.gr/somateia/atlas"],
    }


@pytest.mark.asyncio
async def test_off_without_key(captured, monkeypatch):
    requests, _ = captured
    monkeypatch.setattr(settings, "indexnow_key", None)
    assert await indexnow.submit(["/agones/7"]) == 0
    assert requests == []


@pytest.mark.asyncio
async def test_nothing_changed_sends_nothing(captured):
    requests, _ = captured
    assert await indexnow.submit([]) == 0
    assert requests == []


@pytest.mark.asyncio
async def test_rejection_is_logged_not_raised(captured):
    _, status = captured
    status["code"] = 403
    assert await indexnow.submit(["/agones/7"]) == 0
