"""Check what is stored against what it should be.

    python -m scripts.audit

Reads only. Every check answers a question that would otherwise be answered by
squinting at a page: are there duplicate clubs, do the tables add up, does a
match point at teams that belong to its league.
"""

from __future__ import annotations

import asyncio
from collections import Counter, defaultdict

from sqlalchemy import text

from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.scraper import naming

problems: list[str] = []
notes: list[str] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    if ok:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}{(': ' + detail) if detail else ''}")
        problems.append(f"{label}{(': ' + detail) if detail else ''}")


async def main() -> int:
    use_utf8_stdout()
    async with SessionLocal() as db:

        async def rows(sql: str):
            return (await db.execute(text(sql))).all()

        async def one(sql: str):
            return (await db.execute(text(sql))).scalar()

        print("\n── Σύνολα ──")
        for table in (
            "associations", "seasons", "leagues", "teams", "fields",
            "matches", "standings", "league_teams", "scrape_runs",
        ):
            print(f"  {table:14} {await one(f'select count(*) from {table}')}")

        # ---------------------------------------------------------------
        print("\n── Διπλότυπα ──")

        dup_leagues = await rows("""
            select season_id, external_id, count(*) c
            from leagues where external_id is not null
            group by season_id, external_id having count(*) > 1
        """)
        check(not dup_leagues, "καμία διοργάνωση διπλή ανά περίοδο", str(len(dup_leagues)))

        dup_slug = await rows("""
            select season_id, slug, count(*) c from leagues
            group by season_id, slug having count(*) > 1
        """)
        check(not dup_slug, "κανένα slug διοργάνωσης διπλό στην ίδια περίοδο", str(len(dup_slug)))

        dup_team_slug = await rows("""
            select association_id, slug, count(*) from teams
            group by association_id, slug having count(*) > 1
        """)
        check(not dup_team_slug, "κανένα slug σωματείου διπλό", str(len(dup_team_slug)))

        dup_team_ext = await rows("""
            select association_id, external_id, count(*) from teams
            where external_id is not null
            group by association_id, external_id having count(*) > 1
        """)
        check(not dup_team_ext, "κανένα external_id σωματείου διπλό", str(len(dup_team_ext)))

        # Two rows that normalise to one name are the duplicate-club failure
        # the whole naming module exists to prevent.
        teams = await rows("select id, association_id, name from teams")
        by_key: dict[tuple[int, str], list[str]] = defaultdict(list)
        for _id, assoc, name in teams:
            by_key[(assoc, naming.normalize(name))].append(name)
        collisions = {k: v for k, v in by_key.items() if len(v) > 1}
        check(
            not collisions,
            "κανένα σωματείο διπλό μετά από κανονικοποίηση",
            "; ".join(" = ".join(v) for v in list(collisions.values())[:5]),
        )

        dup_match = await rows("""
            select league_id, matchday, home_team_id, away_team_id, count(*) c
            from matches
            group by league_id, matchday, home_team_id, away_team_id
            having count(*) > 1
        """)
        check(not dup_match, "κανένας αγώνας διπλός", str(len(dup_match)))

        dup_ext_match = await rows("""
            select external_id, count(*) from matches
            where external_id is not null
            group by external_id having count(*) > 1
        """)
        check(not dup_ext_match, "κανένα game_id διπλό", str(len(dup_ext_match)))

        dup_standing = await rows("""
            select league_id, team_id, count(*) from standings
            group by league_id, team_id having count(*) > 1
        """)
        check(not dup_standing, "καμία διπλή γραμμή βαθμολογίας", str(len(dup_standing)))

        dup_field = await rows("""
            select association_id, external_id, count(*) from fields
            where external_id is not null
            group by association_id, external_id having count(*) > 1
        """)
        check(not dup_field, "κανένα external_id γηπέδου διπλό", str(len(dup_field)))

        # ---------------------------------------------------------------
        print("\n── Συνοχή ──")

        self_play = await one(
            "select count(*) from matches where home_team_id = away_team_id"
        )
        check(self_play == 0, "καμία ομάδα δεν παίζει με τον εαυτό της", str(self_play))

        cross = await one("""
            select count(*) from matches m
            join leagues l on l.id = m.league_id
            join teams h on h.id = m.home_team_id
            join teams a on a.id = m.away_team_id
            where h.association_id <> l.association_id
               or a.association_id <> l.association_id
        """)
        check(cross == 0, "καμία διαρροή μεταξύ ενώσεων", str(cross))

        not_entered = await one("""
            select count(*) from matches m
            where not exists (
                select 1 from league_teams lt
                where lt.league_id = m.league_id and lt.team_id = m.home_team_id)
               or not exists (
                select 1 from league_teams lt
                where lt.league_id = m.league_id and lt.team_id = m.away_team_id)
        """)
        check(not_entered == 0, "κάθε ομάδα αγώνα είναι δηλωμένη στη διοργάνωση", str(not_entered))

        half_score = await one("""
            select count(*) from matches
            where (home_score is null) <> (away_score is null)
        """)
        check(half_score == 0, "κανένα μισό σκορ", str(half_score))

        bad_score = await one("""
            select count(*) from matches
            where home_score < 0 or away_score < 0
               or home_score > 30 or away_score > 30
        """)
        check(bad_score == 0, "κανένα απίθανο σκορ", str(bad_score))

        finished_no_score = await one("""
            select count(*) from matches
            where status in ('finished','awarded') and home_score is null
        """)
        check(finished_no_score == 0, "κάθε τελειωμένος αγώνας έχει σκορ", str(finished_no_score))

        scored_not_finished = await one("""
            select count(*) from matches
            where home_score is not null and status = 'scheduled'
        """)
        check(scored_not_finished == 0, "κανένα σκορ σε απρογραμμάτιστο", str(scored_not_finished))

        # ---------------------------------------------------------------
        print("\n── Βαθμολογίες ──")

        # Goals for across a league must equal goals against: every goal is
        # scored by one side and conceded by the other.
        goals = await rows("""
            select l.id, l.name, sum(s.goals_for), sum(s.goals_against)
            from standings s join leagues l on l.id = s.league_id
            group by l.id, l.name
            having sum(s.goals_for) <> sum(s.goals_against)
        """)
        check(not goals, "τα τέρματα υπέρ ισούνται με τα κατά", str(len(goals)))

        wins = await rows("""
            select l.id, l.name, sum(s.won), sum(s.lost)
            from standings s join leagues l on l.id = s.league_id
            group by l.id, l.name having sum(s.won) <> sum(s.lost)
        """)
        check(not wins, "οι νίκες ισούνται με τις ήττες", str(len(wins)))

        draws = await rows("""
            select l.id, l.name from standings s join leagues l on l.id = s.league_id
            group by l.id, l.name having sum(s.drawn) % 2 <> 0
        """)
        check(not draws, "οι ισοπαλίες είναι ζυγές", str(len(draws)))

        wdl = await one("""
            select count(*) from standings where played <> won + drawn + lost
        """)
        check(wdl == 0, "αγώνες = νίκες + ισοπαλίες + ήττες", str(wdl))

        # played across a league must be twice the number of played matches.
        mismatch = await rows("""
            with played as (
              select league_id, count(*) n from matches
              where home_score is not null group by league_id
            )
            select l.id, l.name, coalesce(p.n,0) * 2, sum(s.played)
            from standings s
            join leagues l on l.id = s.league_id
            left join played p on p.league_id = l.id
            group by l.id, l.name, p.n
            having sum(s.played) <> coalesce(p.n,0) * 2
        """)
        check(
            not mismatch,
            "οι αγώνες της βαθμολογίας συμφωνούν με τους αγώνες",
            f"{len(mismatch)} διοργανώσεις",
        )

        gaps = await rows("""
            select l.id, l.name, count(*) from standings s
            join leagues l on l.id = s.league_id
            group by l.id, l.name
            having count(*) <> max(s.position) or min(s.position) <> 1
        """)
        check(not gaps, "οι θέσεις είναι 1..N χωρίς κενά", str(len(gaps)))

        # ---------------------------------------------------------------
        print("\n── Ετικέτες ──")

        dup_label = await rows("""
            select season_id, short_name, count(*) from leagues
            where short_name is not null
            group by season_id, short_name having count(*) > 1
        """)
        check(not dup_label, "καμία διπλή ετικέτα καρτέλας ανά περίοδο", str(len(dup_label)))

        no_label = await one("select count(*) from leagues where short_name is null")
        check(no_label == 0, "κάθε διοργάνωση έχει ετικέτα", str(no_label))

        no_mono = await one("select count(*) from teams where initials is null")
        check(no_mono == 0, "κάθε σωματείο έχει μονόγραμμα", str(no_mono))

        mono = Counter(
            m for (m,) in await rows("select initials from teams where initials is not null")
        )
        worst = mono.most_common(1)[0]
        notes.append(
            f"το συχνότερο μονόγραμμα {worst[0]!r} σε {worst[1]} σωματεία"
        )

        # ---------------------------------------------------------------
        print("\n── Αξίζει να ξέρεις ──")

        orphan_teams = await one("""
            select count(*) from teams t
            where not exists (select 1 from league_teams lt where lt.team_id = t.id)
        """)
        notes.append(f"σωματεία χωρίς καμία συμμετοχή: {orphan_teams}")

        no_field = await one("select count(*) from matches where field_id is null")
        no_kick = await one("select count(*) from matches where kickoff_at is null")
        no_ref = await one("select count(*) from matches where referee is null")
        total = await one("select count(*) from matches")
        notes.append(f"αγώνες χωρίς γήπεδο: {no_field}/{total}")
        notes.append(f"αγώνες χωρίς ημερομηνία: {no_kick}/{total}")
        notes.append(f"αγώνες χωρίς διαιτητή: {no_ref}/{total}")

        midnight = await one("""
            select count(*) from matches
            where kickoff_at is not null
              and extract(hour from kickoff_at at time zone 'Europe/Athens') = 0
              and extract(minute from kickoff_at at time zone 'Europe/Athens') = 0
        """)
        notes.append(f"αγώνες στις 00:00 Αθήνας (χωρίς ώρα στην πηγή): {midnight}")

        for note in notes:
            print(f"  · {note}")

        # ---------------------------------------------------------------
        print("\n── Σύνοψη ──")
        if problems:
            print(f"  {len(problems)} ευρήματα:")
            for p in problems:
                print(f"    ✗ {p}")
        else:
            print("  Κανένα εύρημα.")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
