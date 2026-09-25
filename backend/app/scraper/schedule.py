"""Scheduled scraping.

    python -m app.scraper.schedule

Runs the same sync as ``app.scraper.run``, over and over, on a cadence taken
from the fixture list rather than from a fixed number. Without this the site
polls for live scores that only ever change when somebody remembers to run the
CLI, which is most of the way to not having live scores at all.

Deliberately a process of its own rather than a task inside FastAPI: uvicorn
under any worker count above one would otherwise start a scraper per worker,
and two of them writing the same match is exactly the race the reconciliation
rules exist to avoid.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select

from app.core.config import settings
from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.models import Association, League, Match, ScrapeRun
from app.models.enums import MatchStatus, ScrapeRunStatus
from app.scraper.run import run_one

logger = logging.getLogger("scraper.schedule")

#: Statuses a fixture can hold and still be worth watching. A cancelled or
#: postponed match has no score coming, so it must not hold the fast cadence
#: open for the three hours after a kickoff that will not happen.
LIVE_CANDIDATE_STATUSES = (
    MatchStatus.SCHEDULED,
    MatchStatus.LIVE,
    MatchStatus.HALFTIME,
)


async def active_association_slugs() -> list[str]:
    async with SessionLocal() as db:
        rows = await db.execute(
            select(Association.slug)
            .where(Association.is_active.is_(True))
            .order_by(Association.slug)
        )
        return [slug for (slug,) in rows.all()]


async def leagues_in_window(slugs: list[str], now: datetime) -> list[str]:
    """Slugs of the competitions with a fixture inside its kickoff window.

    The list, not just a count, because it is also the answer to *what to
    fetch*. A full sweep of this federation is around sixty requests; repeating
    that every five minutes on a Sunday would keep a small site busy half the
    afternoon to re-read divisions that are not playing.
    """
    if not slugs:
        return []

    earliest = now - timedelta(hours=settings.scraper_match_window_hours)
    latest = now + timedelta(minutes=settings.scraper_lead_minutes)

    async with SessionLocal() as db:
        rows = await db.execute(
            select(League.slug)
            .distinct()
            .select_from(Match)
            .join(League, Match.league_id == League.id)
            .join(Association, League.association_id == Association.id)
            .where(
                Association.slug.in_(slugs),
                Match.kickoff_at.is_not(None),
                Match.kickoff_at >= earliest,
                Match.kickoff_at <= latest,
                Match.status.in_(LIVE_CANDIDATE_STATUSES),
                # A final score already on the row means this one is answered,
                # whatever the status column still says.
                or_(Match.home_score.is_(None), Match.away_score.is_(None)),
            )
        )
        return [slug for (slug,) in rows.all()]


def summarise(slug: str, run: ScrapeRun) -> str:
    parts = [
        f"{run.matches_created} νέοι",
        f"{run.matches_updated} ενημερώθηκαν",
        f"{run.matches_unchanged} αμετάβλητοι",
    ]
    if run.matches_deferred:
        parts.append(f"{run.matches_deferred} δεν πειράχτηκαν")
    if run.conflicts_opened:
        parts.append(f"{run.conflicts_opened} συγκρούσεις")
    detail = ", ".join(parts)
    return f"{slug} [{run.status.value}] {detail} σε {run.http_requests} αιτήματα"


def choose_delay(pending: int, failures: int) -> tuple[float, str]:
    """How long to wait before the next run, and why.

    Pure, and separate from the query that feeds it, because this is the part
    with a decision in it: everything else is a count.

    Backoff outranks a match in progress. That looks backwards — the live
    window is exactly when the data matters — but a run only fails when the
    source is unreachable or broken, and asking a struggling federation site
    every five minutes is how a scraper turns an outage into an outage plus a
    complaint.
    """
    if failures:
        # Exponential from the live interval, so a brief blip during a match
        # afternoon still recovers in minutes rather than hours.
        delay = min(
            settings.scraper_live_interval_seconds * 2**failures,
            settings.scraper_max_backoff_seconds,
        )
        return float(delay), f"backoff μετά από {failures} αποτυχίες"
    if pending:
        return (
            float(settings.scraper_live_interval_seconds),
            f"{pending} αγώνες σε εξέλιξη",
        )
    return float(settings.scraper_idle_interval_seconds), "καμία σέντρα τώρα"


async def scrape_once(slugs: list[str], league_slugs: list[str] | None = None) -> bool:
    """Sync every association in turn. True if all of them succeeded.

    `league_slugs` narrows a live-window pass to the divisions being played.
    None means the full sweep, which is what the idle cadence wants: that is
    when a new season, a rescheduled fixture or a late correction shows up.
    """
    ok = True
    for slug in slugs:
        try:
            run = await run_one(slug, league_slugs=league_slugs, dry_run=False)
        except Exception:
            # One federation being down must not stop the others, and must not
            # stop the loop either — the next tick tries again.
            logger.exception("%s — η συλλογή απέτυχε", slug)
            ok = False
            continue

        if run is None:
            # run_one has already said why on stderr.
            ok = False
            continue

        logger.info("%s", summarise(slug, run))
        if run.status is ScrapeRunStatus.FAILED:
            ok = False
    return ok


class Scheduler:
    def __init__(self, once: bool = False) -> None:
        self.once = once
        self.stopping = asyncio.Event()
        self.failures = 0
        #: Competitions being played right now. Empty means the next pass is a
        #: full sweep.
        self.live_leagues: list[str] = []

    def request_stop(self) -> None:
        if not self.stopping.is_set():
            logger.info("Λήφθηκε σήμα τερματισμού· ολοκλήρωση τρέχοντος κύκλου.")
            self.stopping.set()

    async def next_delay(self, slugs: list[str]) -> tuple[float, str]:
        """Seconds to wait before the next run, and why."""
        if self.failures:
            return choose_delay(0, self.failures)
        return choose_delay(len(self.live_leagues), 0)

    async def refresh_live_leagues(self, slugs: list[str]) -> None:
        self.live_leagues = await leagues_in_window(slugs, datetime.now(UTC))

    async def sleep(self, seconds: float) -> None:
        """Wait, but wake immediately on shutdown."""
        try:
            await asyncio.wait_for(self.stopping.wait(), timeout=seconds)
        except TimeoutError:
            pass

    async def run(self) -> int:
        slugs = await active_association_slugs()
        if not slugs:
            logger.error("Καμία ενεργή ένωση — δεν υπάρχει τίποτα να προγραμματιστεί.")
            return 1

        logger.info(
            "Έναρξη για: %s (ζωντανά κάθε %ds, αλλιώς κάθε %ds)",
            ", ".join(slugs),
            settings.scraper_live_interval_seconds,
            settings.scraper_idle_interval_seconds,
        )

        while not self.stopping.is_set():
            started = datetime.now(UTC)
            # Decided before the pass, not after: what is in its kickoff window
            # now is what this pass should go and read.
            await self.refresh_live_leagues(slugs)
            narrowed = self.live_leagues or None
            if narrowed:
                logger.info("Ζωντανές κατηγορίες: %s", ", ".join(narrowed))

            ok = await scrape_once(slugs, narrowed)
            self.failures = 0 if ok else self.failures + 1

            if self.once or self.stopping.is_set():
                break

            delay, reason = await self.next_delay(slugs)
            elapsed = (datetime.now(UTC) - started).total_seconds()
            # Measure the gap from the start of the run, so a slow sync does not
            # add its own duration on top of the interval.
            remaining = max(0.0, delay - elapsed)
            logger.info("Επόμενος κύκλος σε %.0fs (%s)", remaining, reason)
            await self.sleep(remaining)

        logger.info("Τερματισμός.")
        return 0 if self.failures == 0 else 1


def install_signal_handlers(scheduler: Scheduler) -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, scheduler.request_stop)
        except NotImplementedError:
            # Windows has no add_signal_handler for SIGTERM; Ctrl+C still
            # arrives as KeyboardInterrupt and is handled in main().
            signal.signal(sig, lambda *_: scheduler.request_stop())


async def main_async(args: argparse.Namespace) -> int:
    scheduler = Scheduler(once=args.once)
    install_signal_handlers(scheduler)
    return await scheduler.run()


def main() -> int:
    use_utf8_stdout()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--once",
        action="store_true",
        help="Ένας κύκλος και έξοδος. Για cron ή για έλεγχο της ρύθμισης.",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    try:
        return asyncio.run(main_async(args))
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
