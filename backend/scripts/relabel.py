"""Recompute the derived labels on rows that are already stored.

    python -m scripts.relabel [--dry-run]

Competition labels and club monograms are read out of names, so improving how
they are read should improve what a reader sees. Re-scraping would do it, but
that is twenty minutes of somebody else's bandwidth to recompute two strings
that need no network at all.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import Counter

from sqlalchemy import select

from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.models import Association, League, Season, Team
from app.scraper.labels import describe_league
from app.scraper.naming import assign_monograms
from app.scraper.sync import _sort_order


async def relabel_leagues(db, association: Association, dry_run: bool) -> int:
    seasons = (
        await db.execute(
            select(Season).where(Season.association_id == association.id)
        )
    ).scalars().all()

    changed = 0
    for season in seasons:
        leagues = (
            await db.execute(
                select(League)
                .where(League.season_id == season.id)
                .order_by(League.id)
            )
        ).scalars().all()

        used: set[str] = set()
        for league in leagues:
            described = describe_league(league.name)
            label = described.label
            if label in used:
                # The source publishes some titles twice over; a numeral is
                # honest about that where two identical tabs are not.
                n = 2
                while f"{label} ({n})" in used:
                    n += 1
                label = f"{label} ({n})"
            used.add(label)

            before = (
                league.short_name, league.kind, league.tier,
                league.age_group, league.group_name, league.sort_order,
            )
            league.short_name = label
            league.kind = described.kind
            league.tier = described.tier
            league.age_group = described.age_group
            league.group_name = described.group_name
            league.sort_order = _sort_order(described)
            after = (
                league.short_name, league.kind, league.tier,
                league.age_group, league.group_name, league.sort_order,
            )
            if before != after:
                changed += 1
    return changed


async def remonogram(db, association: Association, dry_run: bool) -> int:
    teams = (
        await db.execute(
            select(Team).where(Team.association_id == association.id)
        )
    ).scalars().all()

    assigned = assign_monograms([t.name for t in teams])
    changed = 0
    for team in teams:
        new = assigned.get(team.name)
        if new and team.initials != new:
            team.initials = new
            changed += 1

    counts = Counter(assigned.values())
    worst = counts.most_common(1)[0] if counts else ("—", 0)
    print(
        f"  μονογράμματα: {len(set(assigned.values()))} μοναδικά για "
        f"{len(teams)} σωματεία· το συχνότερο {worst[0]!r} σε {worst[1]}"
    )
    return changed


async def main(args: argparse.Namespace) -> int:
    use_utf8_stdout()
    async with SessionLocal() as db:
        associations = (
            await db.execute(select(Association).order_by(Association.id))
        ).scalars().all()
        if not associations:
            print("Καμία ένωση.", file=sys.stderr)
            return 1

        for association in associations:
            print(f"\n{association.slug}")
            leagues = await relabel_leagues(db, association, args.dry_run)
            teams = await remonogram(db, association, args.dry_run)
            print(f"  διοργανώσεις που άλλαξαν: {leagues}")
            print(f"  σωματεία που άλλαξαν:     {teams}")

        if args.dry_run:
            await db.rollback()
            print("\nDry run — τίποτα δεν γράφτηκε.")
        else:
            await db.commit()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
