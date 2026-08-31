"""Compare every stored competition against the page it came from.

    python -m scripts.completeness

Re-reads each schedule and counts what the source publishes against what we
hold. Answers the only question the database cannot answer on its own: is
anything missing.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.core.config import settings
from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.scraper import naming
from app.scraper.http import Fetcher
from app.scraper.sources import get_source


async def main() -> int:
    use_utf8_stdout()
    source = get_source("epsip")

    async with SessionLocal() as db:
        leagues = (await db.execute(text("""
            select l.id, l.external_id, s.slug, l.short_name, count(m.id)
            from leagues l
            join seasons s on s.id = l.season_id
            left join matches m on m.league_id = l.id
            where l.external_id is not null
            group by l.id, l.external_id, s.slug, l.short_name
            order by s.slug desc, l.sort_order
        """))).all()

    print(f"{len(leagues)} διοργανώσεις προς έλεγχο\n")
    short: list[str] = []
    extra: list[str] = []
    checked = 0

    async with Fetcher(
        base_url="https://epsip.gr",
        user_agent=settings.scraper_user_agent,
        delay_seconds=2.0,
    ) as fetcher:
        for league_id, ext, season, label, stored in leagues:
            try:
                html = await fetcher.get(source.schedule_path(ext))
                parsed = source.parse_schedule(html)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! {season} {label}: {type(exc).__name__}")
                continue
            checked += 1
            # Distinct keys: the source repeats rows on some pages, and one
            # fixture is one fixture however many times it is printed.
            unique = len({m.key for m in parsed})
            if stored < unique:
                short.append(f"{season} {label}: {stored}/{unique}")
            elif stored > unique:
                extra.append(f"{season} {label}: {stored} έναντι {unique}")

    print(f"\nελέγχθηκαν: {checked}")
    print(f"λείπουν αγώνες σε {len(short)} διοργανώσεις")
    for line in short:
        print(f"  − {line}")
    print(f"περισσεύουν σε {len(extra)} διοργανώσεις")
    for line in extra:
        print(f"  + {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
