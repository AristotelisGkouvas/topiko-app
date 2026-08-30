"""Create the ΕΠΣ Ηπείρου tenant with no demo data, ready for the scraper."""
import asyncio
from sqlalchemy import delete, select
from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.models import Association, League, Match

async def main():
    async with SessionLocal() as db:
        existing = (await db.execute(
            select(Association).where(Association.slug == "epsip-ipeirou")
        )).scalar_one_or_none()
        if existing:
            await db.execute(delete(Match).where(Match.league_id.in_(
                select(League.id).where(League.association_id == existing.id))))
            await db.delete(existing)
            await db.flush()
        db.add(Association(
            slug="epsip-ipeirou",
            name="Ε.Π.Σ. Ηπείρου",
            short_name="ΕΠΣ Ηπείρου",
            region="Ήπειρος",
            source_url="https://epsip.gr",
            primary_color="#003C71",
            scraper_config={
                "source": "epsip",
                "base_url": "https://epsip.gr",
                "period_id": "12",
                "request_delay_seconds": 2,
                "league_ids": ["300", "301"],
                # Hosted on epsip.gr but not competitions of this federation:
                # the entrants are Superleague clubs, and importing them would
                # file Ολυμπιακός and ΠΑΟΚ among the clubs of ΕΠΣ Ηπείρου.
                # Matched case-insensitively against heading and name.
                "exclude_categories": ["υποδομών", "υποδομων", "προεπιλογής", "προεπιλογης"],
            },
            is_active=True,
        ))
        await db.commit()
        print("Έτοιμη η ένωση epsip-ipeirou, χωρίς δεδομένα.")

use_utf8_stdout()
asyncio.run(main())
