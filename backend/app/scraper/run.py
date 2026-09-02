"""Scraper entry point.

    python -m app.scraper.run --association epsip-ipeirou [--dry-run]

Reads every target from the database: which associations are active, which
adapter each one uses, and with what parameters. Adding a federation is a row,
not a deployment.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.models import Association, ScrapeRun
from app.models.enums import ScrapeRunStatus
from app.scraper.http import DEFAULT_DELAY_SECONDS, Fetcher
from app.scraper.sources import get_source
from app.scraper.sync import sync_association

logger = logging.getLogger("scraper")


async def run_one(
    slug: str,
    league_slugs: list[str] | None,
    dry_run: bool,
    seasons: list[str] | None = None,
    all_seasons: bool = False,
) -> ScrapeRun | None:
    async with SessionLocal() as db:
        association = (
            await db.execute(select(Association).where(Association.slug == slug))
        ).scalar_one_or_none()

        if association is None:
            print(f"Δεν βρέθηκε ένωση '{slug}'.", file=sys.stderr)
            return None
        if not association.is_active:
            print(f"Η ένωση '{slug}' είναι ανενεργή· παραλείπεται.", file=sys.stderr)
            return None

        config = association.scraper_config or {}
        source_key = config.get("source")
        base_url = config.get("base_url") or association.source_url
        if not source_key or not base_url:
            print(
                f"Η ένωση '{slug}' δεν έχει ρυθμισμένο scraper "
                "(χρειάζεται scraper_config.source και base_url).",
                file=sys.stderr,
            )
            return None

        source = get_source(source_key)
        if "CHANGE-ME" in settings.scraper_user_agent:
            print(
                "ΠΡΟΣΟΧΗ: το SCRAPER_USER_AGENT δεν έχει πραγματική διεύθυνση "
                "επικοινωνίας. Βάλε μία πριν τρέξεις σε ζωντανό site.",
                file=sys.stderr,
            )

        async with Fetcher(
            base_url=base_url,
            user_agent=settings.scraper_user_agent,
            delay_seconds=float(
                config.get("request_delay_seconds", DEFAULT_DELAY_SECONDS)
            ),
        ) as fetcher:
            return await sync_association(
                db,
                association,
                source,
                fetcher,
                league_slugs=league_slugs,
                dry_run=dry_run,
                seasons=seasons,
                all_seasons=all_seasons,
            )


def report(slug: str, run: ScrapeRun, dry_run: bool) -> None:
    label = {
        ScrapeRunStatus.SUCCESS: "OK",
        ScrapeRunStatus.PARTIAL: "ΜΕΡΙΚΩΣ",
        ScrapeRunStatus.FAILED: "ΑΠΕΤΥΧΕ",
        ScrapeRunStatus.RUNNING: "ΕΚΚΡΕΜΕΙ",
    }[run.status]

    print(f"\n{slug} — {label}{' (dry run)' if dry_run else ''}")
    print(f"  Αιτήματα HTTP:  {run.http_requests}")
    if run.duration_seconds:
        print(f"  Διάρκεια:       {run.duration_seconds:.1f}s")
    print(f"  Νέοι αγώνες:    {run.matches_created}")
    print(f"  Ενημερώθηκαν:   {run.matches_updated}")
    print(f"  Αμετάβλητοι:    {run.matches_unchanged}")
    print(f"  Νέα σωματεία:   {run.teams_created}")
    if run.players_created:
        print(f"  Νέοι παίκτες:    {run.players_created}")
    if run.stats_rows:
        print(f"  Στατιστικά:    {run.stats_rows}")
    if run.suspensions:
        print(f"  Ποινές:        {run.suspensions}")
    if run.matches_deferred:
        print(
            f"  Δεν πειράχτηκαν: {run.matches_deferred} "
            "(νεότερη χειροκίνητη αλλαγή)"
        )
    if run.conflicts_opened:
        print(f"  Νέες συγκρούσεις: {run.conflicts_opened} — χρειάζονται έλεγχο")
    if run.error:
        print(f"  Σφάλμα: {run.error}")
    for warning in run.warnings:
        print(f"  · {warning}")


async def main_async(args: argparse.Namespace) -> int:
    async with SessionLocal() as db:
        if args.association:
            slugs = [args.association]
        else:
            slugs = [
                slug
                for (slug,) in (
                    await db.execute(
                        select(Association.slug).where(Association.is_active.is_(True))
                    )
                ).all()
            ]

    if not slugs:
        print("Καμία ενεργή ένωση.", file=sys.stderr)
        return 1

    worst = 0
    for slug in slugs:
        try:
            run = await run_one(
                slug, args.league, args.dry_run, args.season, args.all_seasons
            )
        except Exception as exc:  # noqa: BLE001
            # One federation being down must not stop the others.
            print(f"\n{slug} — ΑΠΕΤΥΧΕ: {type(exc).__name__}: {exc}", file=sys.stderr)
            worst = 1
            continue
        if run is None:
            worst = 1
            continue
        report(slug, run, args.dry_run)
        if run.status is ScrapeRunStatus.FAILED:
            worst = 1
    return worst


def main() -> int:
    use_utf8_stdout()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--association",
        help="Slug ένωσης. Χωρίς αυτό τρέχουν όλες οι ενεργές.",
    )
    parser.add_argument(
        "--league",
        action="append",
        help="Περιόρισε σε συγκεκριμένο πρωτάθλημα (slug). Επαναλαμβανόμενο.",
    )
    parser.add_argument(
        "--season",
        action="append",
        help=(
            "Συγκεκριμένη περίοδος, όπως τη γράφει η πηγή (π.χ. 2019-2020). "
            "Επαναλαμβανόμενο."
        ),
    )
    parser.add_argument(
        "--all-seasons",
        action="store_true",
        help=(
            "Κατέβασε κάθε περίοδο και κάθε κατηγορία που δημοσιεύει η πηγή. "
            "Για αρχικό γέμισμα, όχι για προγραμματισμένο τρέξιμο."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Κατέβασε και ανάλυσε χωρίς να γραφτεί τίποτα.",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
