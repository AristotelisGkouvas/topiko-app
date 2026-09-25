"""The throttle in front of the logins and the polls.

Driven by a fake clock, so the window is tested exactly rather than by
sleeping through it.
"""

from __future__ import annotations

from app.core.ratelimit import RateLimit


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_calls_under_the_limit_pass() -> None:
    limit = RateLimit("t", limit=3, window=60, clock=Clock())
    assert [limit.hit("a") for _ in range(3)] == [None, None, None]


def test_the_call_over_the_limit_is_told_how_long_to_wait() -> None:
    clock = Clock()
    limit = RateLimit("t", limit=2, window=60, clock=clock)
    limit.hit("a")
    clock.now += 10
    limit.hit("a")
    clock.now += 5
    # The oldest hit leaves the window 60s after it happened: 45s from now.
    assert limit.hit("a") == 45


def test_the_window_slides() -> None:
    clock = Clock()
    limit = RateLimit("t", limit=1, window=60, clock=clock)
    assert limit.hit("a") is None
    clock.now += 60
    assert limit.hit("a") is None


def test_addresses_are_counted_apart() -> None:
    limit = RateLimit("t", limit=1, window=60, clock=Clock())
    assert limit.hit("a") is None
    assert limit.hit("b") is None
    assert limit.hit("a") is not None


def test_refused_calls_do_not_extend_the_wait() -> None:
    # Otherwise a client that keeps retrying is locked out for ever.
    clock = Clock()
    limit = RateLimit("t", limit=1, window=60, clock=clock)
    limit.hit("a")
    for _ in range(10):
        clock.now += 5
        limit.hit("a")
    clock.now = 1060
    assert limit.hit("a") is None


def test_idle_addresses_are_forgotten() -> None:
    clock = Clock()
    limit = RateLimit("t", limit=5, window=60, clock=clock)
    limit.hit("a")
    clock.now += 120
    limit.hit("b")
    assert "a" not in limit._hits


def test_it_works_as_a_fastapi_dependency() -> None:
    # Wired through FastAPI rather than called directly: a postponed `Request`
    # annotation once turned the parameter into a required query field, and
    # every limited route answered 422 without the unit tests noticing.
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    limit = RateLimit("t", limit=2, window=60)

    @app.post("/x", dependencies=[Depends(limit)])
    async def endpoint() -> dict[str, bool]:
        return {"ok": True}

    client = TestClient(app)
    codes = [client.post("/x").status_code for _ in range(3)]
    assert codes == [200, 200, 429]
