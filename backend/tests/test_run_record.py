"""What survives a scrape that failed.

A scraper that dies quietly looks exactly like a federation that has published
nothing, so the run record is the only answer to "why is the site stale?". It
therefore has to be written on the way out of a failure — and writing it must
never become a second, louder failure that hides the first.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.models import ScrapeRun
from app.models.enums import ScrapeRunStatus
from app.scraper.sync import Syncer


class FakeSession:
    """Records the order of rollback and commit, and can fail on demand.

    A stub rather than a database: the behaviour under test is which call
    happens when, and a real session would only make that harder to see.
    """

    def __init__(self, commit_error: Exception | None = None):
        self.calls: list[str] = []
        self._commit_error = commit_error

    async def rollback(self) -> None:
        self.calls.append("rollback")

    async def commit(self) -> None:
        self.calls.append("commit")
        if self._commit_error is not None:
            raise self._commit_error


def _syncer(db: FakeSession) -> Syncer:
    return Syncer(
        db=db,
        association=SimpleNamespace(id=1, scraper_config={}),
        source=SimpleNamespace(key="epsip"),
        fetcher=SimpleNamespace(request_count=7),
    )


def _run() -> ScrapeRun:
    return ScrapeRun(
        association_id=1,
        source_key="epsip",
        started_at=datetime.now(timezone.utc),
        status=ScrapeRunStatus.RUNNING,
    )


TALLY = {"status": ScrapeRunStatus.FAILED, "error": "FetchError: boom"}


@pytest.mark.asyncio
async def test_the_partial_season_goes_before_the_record_is_written():
    """Order matters twice over: it discards the half-written season, and a
    session broken by a database error refuses everything until it happens."""
    db = FakeSession()
    run = _run()

    await _syncer(db)._record_failure(run, TALLY, dry_run=False)

    assert db.calls == ["rollback", "commit"]
    assert run.status is ScrapeRunStatus.FAILED
    assert run.error == "FetchError: boom"


@pytest.mark.asyncio
async def test_a_write_that_fails_does_not_replace_the_error_that_caused_it():
    """The bug this covers: bookkeeping in a `finally` raising
    PendingRollbackError, which supersedes the exception already in flight and
    leaves the caller reading about the session instead of the scrape."""
    db = FakeSession(commit_error=RuntimeError("session is unusable"))

    # No raise. The caller re-raises the failure that actually ended the run.
    await _syncer(db)._record_failure(_run(), TALLY, dry_run=False)

    assert db.calls == ["rollback", "commit"]


@pytest.mark.asyncio
async def test_a_rollback_that_fails_is_swallowed_too():
    db = FakeSession()

    async def boom() -> None:
        db.calls.append("rollback")
        raise RuntimeError("connection gone")

    db.rollback = boom  # type: ignore[method-assign]

    await _syncer(db)._record_failure(_run(), TALLY, dry_run=False)

    assert db.calls == ["rollback"]


@pytest.mark.asyncio
async def test_a_dry_run_that_fails_still_writes_nothing():
    db = FakeSession()
    run = _run()

    await _syncer(db)._record_failure(run, TALLY, dry_run=True)

    assert db.calls == ["rollback"]
    assert run.status is ScrapeRunStatus.RUNNING
