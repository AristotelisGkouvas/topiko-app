"""Set the promotion and relegation rails on one league's table.

    python -m scripts.set_zones --league a-erasitechniki-katigoria-2025-2026 \
        --promotion 1 --relegation 13,14

Which positions go up and which go down is a decision of the federation's
regulations, not something that can be read off the results page — the site
publishes the table, never the rule behind it. So it is entered by hand here
rather than guessed, and the standings are recomputed straight away.

This is the stopgap until the admin screens exist; the column it writes,
`leagues.zones`, is the same one those will edit.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.models import League, Season
from app.models.enums import StandingZone
from app.services.standings import recompute_standings


def _positions(raw: str | None) -> list[int]:
    if not raw:
        return []
    return [int(p) for p in raw.replace(" ", "").split(",") if p]


async def main(args: argparse.Namespace) -> int:
    use_utf8_stdout()
    async with SessionLocal() as db:
        stmt = (
            select(League)
            .join(Season, Season.id == League.season_id)
            .where(League.slug == args.league)
        )
        if args.season:
            stmt = stmt.where(Season.slug == args.season)
        leagues = (await db.execute(stmt)).scalars().all()

        if not leagues:
            print(f"Δεν βρέθηκε πρωτάθλημα '{args.league}'.", file=sys.stderr)
            return 1
        if len(leagues) > 1 and not args.season:
            print(
                f"Το slug '{args.league}' υπάρχει σε {len(leagues)} περιόδους· "
                "όρισε --season.",
                file=sys.stderr,
            )
            return 1

        zones = {
            StandingZone.PROMOTION.value: _positions(args.promotion),
            StandingZone.PROMOTION_PLAYOFF.value: _positions(args.promotion_playoff),
            StandingZone.RELEGATION_PLAYOFF.value: _positions(args.relegation_playoff),
            StandingZone.RELEGATION.value: _positions(args.relegation),
        }
        zones = {k: v for k, v in zones.items() if v}

        league = leagues[0]
        league.zones = zones
        await db.flush()
        await recompute_standings(db, league)
        await db.commit()

        print(f"{league.name}: {zones or 'καμία ζώνη'}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", required=True, help="slug πρωταθλήματος")
    parser.add_argument("--season", help="slug περιόδου, π.χ. 2025-2026")
    parser.add_argument("--promotion", help="θέσεις ανόδου, π.χ. 1")
    parser.add_argument("--promotion-playoff", help="π.χ. 2,3")
    parser.add_argument("--relegation-playoff", help="π.χ. 12")
    parser.add_argument("--relegation", help="π.χ. 13,14")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
