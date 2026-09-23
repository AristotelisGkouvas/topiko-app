"""Fill in `teams.short_name` for a federation.

    python -m scripts.backfill_short_names --association epsip-ipeirou
    python -m scripts.backfill_short_names --association epsip-ipeirou --write

Prints what it would do and changes nothing until `--write`. The derivation is
in `app.services.shortname`; see its docstring for what it can and cannot do —
in particular, the result is upper-case, because the accented mixed-case forms
the mock-ups show cannot be derived from an all-caps register.

Only ever fills a blank. A short name somebody has typed by hand is better than
anything this produces, and is never overwritten; `--force` exists for the case
where the derivation itself has been corrected.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.console import use_utf8_stdout  # noqa: E402
from app.core.db import SessionLocal  # noqa: E402
from app.models import Association, Team  # noqa: E402
from app.services.shortname import short_names  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--association", required=True, help="Slug ένωσης.")
    parser.add_argument(
        "--write", action="store_true", help="Γράψε. Χωρίς αυτό, μόνο δείχνει."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ξαναγράψε και όσα έχουν ήδη σύντομο όνομα.",
    )
    args = parser.parse_args()

    async with SessionLocal() as db:
        association = (
            await db.execute(
                select(Association).where(Association.slug == args.association)
            )
        ).scalar_one_or_none()
        if association is None:
            print(f"Δεν βρέθηκε ένωση '{args.association}'.")
            return 1

        teams = list(
            (
                await db.execute(
                    select(Team)
                    .where(Team.association_id == association.id)
                    .order_by(Team.name)
                )
            ).scalars()
        )
        if not teams:
            print("Η ένωση δεν έχει σωματεία.")
            return 1

        # Computed over the whole register at once — the uniqueness rules need
        # to see every name to know which shortenings are safe.
        proposed = short_names([t.name for t in teams])

        changed, kept, skipped = [], [], []
        for team in teams:
            short = proposed[team.name]
            if team.short_name and not args.force:
                skipped.append(team)
            elif short is None:
                kept.append(team)
            elif short != team.short_name:
                changed.append((team, short))

        for team, short in changed:
            print(f"  {team.name[:36]:36} → {short}")
        if kept:
            print(f"\n  {len(kept)} κρατούν το επίσημο όνομα (δεν υπάρχει πιο σύντομο):")
            for team in kept:
                print(f"     {team.name}")
        if skipped:
            print(f"\n  {len(skipped)} έχουν ήδη σύντομο όνομα (--force για αντικατάσταση)")

        print(f"\n{len(changed)} αλλαγές από {len(teams)} σωματεία.")

        if not args.write:
            print("Δεν γράφτηκε τίποτα. Ξανατρέξε με --write.")
            return 0

        for team, short in changed:
            team.short_name = short
        await db.commit()
        print("Γράφτηκαν.")
        return 0


if __name__ == "__main__":
    use_utf8_stdout()
    raise SystemExit(asyncio.run(main()))
