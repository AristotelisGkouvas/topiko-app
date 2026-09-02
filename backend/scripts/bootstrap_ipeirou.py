"""Create the ΕΠΣ Ηπείρου tenant with no demo data, ready for the scraper.

    python -m scripts.bootstrap_ipeirou [--reset]

Without --reset the script refuses to touch an association that already exists,
the same rule scripts/seed.py follows. Recreating the tenant cascades into every
league, club, ground and match under it, which is a season of scraping to get
back — not something to do because a command was run twice.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import delete, select

from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.models import Association, League, Match

SLUG = "epsip-ipeirou"

CONFIG = {
    "source": "epsip",
    "base_url": "https://epsip.gr",
    "period_id": "12",
    "request_delay_seconds": 2,
    "league_ids": ["300", "301"],
    # Hosted on epsip.gr but not competitions of this federation: the entrants
    # are Superleague clubs, and importing them would file Ολυμπιακός and ΠΑΟΚ
    # among the clubs of ΕΠΣ Ηπείρου. Matched case-insensitively against
    # heading and name.
    "exclude_categories": [
        "υποδομών",
        "υποδομων",
        "προεπιλογής",
        "προεπιλογης",
    ],
}


async def bootstrap(reset: bool) -> int:
    async with SessionLocal() as db:
        existing = (
            await db.execute(select(Association).where(Association.slug == SLUG))
        ).scalar_one_or_none()

        if existing is not None:
            if not reset:
                print(
                    f"Η ένωση '{SLUG}' υπάρχει ήδη. Τρέξε με --reset για να τη "
                    "σβήσεις και να ξαναφτιαχτεί — μαζί της φεύγουν όλα τα "
                    "πρωταθλήματα, σωματεία, γήπεδα και αποτελέσματά της.",
                    file=sys.stderr,
                )
                return 1
            await db.execute(
                delete(Match).where(
                    Match.league_id.in_(
                        select(League.id).where(League.association_id == existing.id)
                    )
                )
            )
            await db.delete(existing)
            await db.flush()

        db.add(
            Association(
                slug=SLUG,
                name="Ε.Π.Σ. Ηπείρου",
                short_name="ΕΠΣ Ηπείρου",
                region="Ήπειρος",
                source_url="https://epsip.gr",
                primary_color="#003C71",
                scraper_config=CONFIG,
                is_active=True,
            )
        )
        await db.commit()

    print(f"Έτοιμη η ένωση {SLUG}, χωρίς δεδομένα.")
    print("Επόμενο: python -m app.scraper.run --association epsip-ipeirou --dry-run")
    return 0


def main() -> int:
    use_utf8_stdout()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Σβήσε την υπάρχουσα ένωση και ξαναδημιούργησέ την.",
    )
    args = parser.parse_args()
    return asyncio.run(bootstrap(args.reset))


# Without this guard the script ran on import — and it is the destructive one,
# so anything that so much as imported the module wiped the tenant.
if __name__ == "__main__":
    raise SystemExit(main())
