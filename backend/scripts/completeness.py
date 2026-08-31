"""Compare every stored competition against the page it came from.

    python -m scripts.completeness [--prune]

Re-reads each schedule and matches it fixture by fixture against what we hold.
Answers the two questions the database cannot answer on its own: is anything
missing, and is anything here that the source never published.

The second catches mis-attribution, which no internal check can see. When a
club name is resolved to the wrong club and later to the right one, both rows
survive: the duplicate is invisible to a uniqueness check because the team ids
differ. --prune deletes those, never touching a row a human has edited.
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import text

from app.core.config import settings
from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.scraper import naming
from app.scraper.http import Fetcher
from app.scraper.sources import get_source


async def main(args: argparse.Namespace) -> int:
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

    # One index of the association's clubs, plus the aliases a human has added,
    # so a source name is resolved here exactly as the scraper resolves it.
    async with SessionLocal() as db:
        teams = (await db.execute(text(
            "select id, name from teams"
        ))).all()
        aliases = (await db.execute(text(
            "select normalized, team_id from team_aliases"
        ))).all()
    index = naming.index({name: tid for tid, name in teams})
    by_id = {tid: name for tid, name in teams}
    index.update({normalized: tid for normalized, tid in aliases})

    def resolve(name: str) -> int | None:
        found = naming.find(name, index)
        if found is None:
            return None
        if found.exact:
            return found.value
        return found.value if naming.same_club(name, by_id[found.value]) else None

    print(f"{len(leagues)} διοργανώσεις προς έλεγχο\n")
    short: list[str] = []
    orphaned: list[str] = []
    to_delete: list[int] = []
    protected = 0
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
            # Resolve the source's names to club ids the way the scraper does,
            # and compare ids. Comparing normalised names instead is wrong and
            # dangerous: the scraper deliberately accepts "Α.Σ.ΑΧΕΡΩΝ ΡΩΜΑΝΟΥ"
            # as "ΑΧΕΡΩΝ ΡΩΜΑΝΟΥ Α.Σ.", and those two do not normalise alike,
            # so every correctly-resolved fixture would look like an orphan.
            published: set[tuple[int | None, int, int]] = set()
            unresolved = 0
            for m in parsed:
                home = resolve(m.home_team)
                away = resolve(m.away_team)
                if home is None or away is None or home == away:
                    unresolved += 1
                    continue
                published.add((m.matchday, home, away))
            if stored < len(published):
                short.append(f"{season} {label}: {stored}/{len(published)}")

            async with SessionLocal() as db:
                rows = (await db.execute(text("""
                    select m.id, m.matchday, m.home_team_id, m.away_team_id,
                           m.last_manual_edit_at is not null
                    from matches m where m.league_id = :lid
                """), {"lid": league_id})).all()

            unknown = (
                [r for r in rows if (r[1], r[2], r[3]) not in published]
                # A name the resolver cannot place means the published set is
                # incomplete, and anything measured against it would be a
                # guess. Report, never delete.
                if unresolved == 0
                else []
            )
            if unresolved:
                orphaned.append(
                    f"{season} {label}: {unresolved} γραμμές πηγής χωρίς "
                    "αντιστοίχιση — δεν ελέγχθηκε"
                )
            if unknown:
                keep = [r for r in unknown if r[4]]
                protected += len(keep)
                to_delete.extend(r[0] for r in unknown if not r[4])
                orphaned.append(
                    f"{season} {label}: {len(unknown)} άγνωστοι στην πηγή"
                    + (f" ({len(keep)} με χειροκίνητη αλλαγή, μένουν)" if keep else "")
                )

    print(f"\nελέγχθηκαν: {checked}")
    print(f"λείπουν αγώνες σε {len(short)} διοργανώσεις")
    for line in short:
        print(f"  − {line}")
    print(f"αγώνες που δεν υπάρχουν στην πηγή, σε {len(orphaned)} διοργανώσεις")
    for line in orphaned:
        print(f"  + {line}")
    print(f"\nπρος διαγραφή: {len(to_delete)}  |  προστατευμένοι: {protected}")

    if to_delete and args.prune:
        async with SessionLocal() as db:
            await db.execute(
                text("delete from matches where id = any(:ids)"),
                {"ids": to_delete},
            )
            await db.commit()
        print("διαγράφηκαν.")
    elif to_delete:
        print("(--prune για να διαγραφούν)")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prune", action="store_true")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
