"""Match reports into the database: which matches are read, what is written,
and that a report is not asked for again every run."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import Match, MatchLineup, MatchSheetEvent, Player
from app.models.enums import MatchStatus
from app.scraper.sources.epsip import EpsipSource
from app.scraper.sync import Syncer

from .conftest import World

pytestmark = pytest.mark.asyncio

FIXTURES = Path(__file__).parent.parent / "fixtures" / "epsip"


class FakeFetcher:
    """Serves saved reports by game id and counts what was asked for."""

    def __init__(self) -> None:
        self.request_count = 0
        self.paths: list[str] = []

    async def get(self, path: str) -> str:
        self.request_count += 1
        self.paths.append(path)
        game_id = path.rsplit("=", 1)[-1]
        return (FIXTURES / f"display_game_{game_id}.html").read_text(
            encoding="utf-8", errors="replace"
        )


async def finished(db, world: World, external_id: str) -> Match:
    match = await db.get(Match, world.a.match.id)
    assert match is not None
    match.external_id = external_id
    match.home_score, match.away_score = 2, 0
    match.status = MatchStatus.FINISHED
    await db.commit()
    return match


def syncer(db, world: World, fetcher: FakeFetcher) -> Syncer:
    return Syncer(db, world.a.association, EpsipSource(), fetcher)  # type: ignore[arg-type]


async def test_a_report_writes_the_timeline_line_ups_and_officials(client, world: World, db) -> None:
    match = await finished(db, world, "24372")
    fetcher = FakeFetcher()
    run = syncer(db, world, fetcher)
    await run._sync_sheets(10)
    await db.commit()

    events = list(
        (await db.execute(
            select(MatchSheetEvent).where(MatchSheetEvent.match_id == match.id).order_by(MatchSheetEvent.position)
        )).scalars()
    )
    goals = [e for e in events if e.kind == "goal"]
    assert [(e.minute, e.score, e.team_id) for e in goals] == [
        (15, "1-0", world.a.home.id),
        (48, "2-0", world.a.home.id),
    ]
    lineups = (await db.execute(
        select(func.count()).select_from(MatchLineup).where(MatchLineup.match_id == match.id)
    )).scalar_one()
    assert lineups == 36

    # Every named player is now in the register, by the federation's id.
    scorer = (await db.execute(select(Player).where(Player.external_id == "12366"))).scalar_one()
    assert scorer.name == "ΠΑΝΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ"
    assert goals[0].player_id == scorer.id

    await db.refresh(match)
    assert match.referee == "ΔΑΔΑΝΗΣ ΑΠΟΣΤΟΛΟΣ"
    assert match.officials and match.officials["Α' Βοηθός Διαιτητή"] == "ΚΑΤΣΟΥΛΙΔΟΥ ΠΟΛΥΞΕΝΗ"
    assert match.sheet_fetched_at is not None


async def test_a_report_read_today_is_not_read_again(client, world: World, db) -> None:
    await finished(db, world, "24372")
    first = FakeFetcher()
    await syncer(db, world, first)._sync_sheets(10)
    await db.commit()
    again = FakeFetcher()
    await syncer(db, world, again)._sync_sheets(10)
    assert first.request_count == 1
    assert again.request_count == 0


async def test_reading_twice_replaces_rather_than_adds(client, world: World, db) -> None:
    match = await finished(db, world, "24372")
    await syncer(db, world, FakeFetcher())._sync_sheets(10)
    await db.commit()
    # A day later the federation might have corrected it; force a re-read.
    match.sheet_fetched_at = datetime.now(UTC) - timedelta(days=1)
    await db.commit()
    await syncer(db, world, FakeFetcher())._sync_sheets(10)
    await db.commit()
    count = (await db.execute(
        select(func.count()).select_from(MatchLineup).where(MatchLineup.match_id == match.id)
    )).scalar_one()
    assert count == 36


async def test_an_empty_report_for_an_old_match_is_not_asked_for_again(client, world: World, db) -> None:
    match = await finished(db, world, "18000")
    match.kickoff_at = datetime.now(UTC) - timedelta(days=30)
    await db.commit()
    await syncer(db, world, FakeFetcher())._sync_sheets(10)
    await db.commit()
    await db.refresh(match)
    assert match.sheet_fetched_at is not None
    assert (await db.execute(
        select(func.count()).select_from(MatchSheetEvent).where(MatchSheetEvent.match_id == match.id)
    )).scalar_one() == 0


async def test_unplayed_and_just_finished_matches_wait(client, world: World, db) -> None:
    match = await db.get(Match, world.a.match.id)
    assert match is not None
    match.external_id = "24372"
    await db.commit()  # no score yet
    fetcher = FakeFetcher()
    await syncer(db, world, fetcher)._sync_sheets(10)
    assert fetcher.request_count == 0

    match.home_score, match.away_score = 2, 0
    match.kickoff_at = datetime.now(UTC) - timedelta(minutes=30)
    await db.commit()  # scored, but the report is not written up yet
    await syncer(db, world, fetcher)._sync_sheets(10)
    assert fetcher.request_count == 0
