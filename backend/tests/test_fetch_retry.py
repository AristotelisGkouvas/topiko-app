"""Retrying a page, and the pauses between the tries.

The delay is this scraper's whole politeness budget, so it matters both that it
happens between attempts and that it does not happen after the last one, where
nothing follows it and the only thing it holds up is the error report.
"""

from __future__ import annotations

import httpx
import pytest

from app.scraper.http import MAX_ATTEMPTS, FetchError, Fetcher


@pytest.fixture
def slept(monkeypatch):
    """Record every pause instead of taking it, so the tests run instantly."""
    calls: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        calls.append(seconds)

    monkeypatch.setattr("app.scraper.http.asyncio.sleep", fake_sleep)
    return calls


def _fetcher(*responses: httpx.Response | Exception) -> Fetcher:
    """A fetcher wired to a scripted server, one entry per request."""
    remaining = list(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        answer = remaining.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    fetcher = Fetcher(
        base_url="https://example.org", user_agent="Bot/0.1", delay_seconds=2.0
    )
    # Built by hand rather than through __aenter__, which would go and fetch a
    # real robots.txt. A fetcher that has parsed none is allowed everywhere,
    # which is the state these tests want.
    fetcher._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    # Left on its first request, so the between-pages pause never fires and
    # every pause the tests count is a retry.
    return fetcher


@pytest.mark.asyncio
async def test_a_page_that_answers_is_never_waited_on(slept):
    fetcher = _fetcher(httpx.Response(200, text="<html/>"))
    assert await fetcher.get("/results/ranking.php") == "<html/>"
    assert fetcher.request_count == 1
    assert slept == []


@pytest.mark.asyncio
async def test_a_flaky_page_is_retried_with_a_growing_pause(slept):
    fetcher = _fetcher(
        httpx.Response(503),
        httpx.Response(503),
        httpx.Response(200, text="<html/>"),
    )
    assert await fetcher.get("/results/ranking.php") == "<html/>"
    assert fetcher.request_count == 3
    assert slept == [2.0, 4.0]


@pytest.mark.asyncio
async def test_the_last_attempt_is_not_followed_by_a_pause(slept):
    """The bug this covers: giving up used to sleep first, for nobody."""
    fetcher = _fetcher(*[httpx.Response(503)] * MAX_ATTEMPTS)
    with pytest.raises(FetchError, match="Giving up"):
        await fetcher.get("/results/ranking.php")
    assert fetcher.request_count == MAX_ATTEMPTS
    assert len(slept) == MAX_ATTEMPTS - 1


@pytest.mark.asyncio
async def test_a_connection_that_never_opens_gives_up_just_as_quickly(slept):
    fetcher = _fetcher(*[httpx.ConnectError("no route")] * MAX_ATTEMPTS)
    with pytest.raises(FetchError, match="Giving up"):
        await fetcher.get("/results/ranking.php")
    assert len(slept) == MAX_ATTEMPTS - 1


@pytest.mark.asyncio
async def test_a_page_that_is_simply_missing_is_not_retried(slept):
    """A 404 is an answer. Asking twice more is noise on somebody's server."""
    fetcher = _fetcher(httpx.Response(404))
    with pytest.raises(FetchError, match="HTTP 404"):
        await fetcher.get("/results/ranking.php")
    assert fetcher.request_count == 1
    assert slept == []
