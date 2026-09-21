"""Development seed for ΕΠΣ Ηπείρου.

WARNING — the club, field and city names here are real, but every score, date,
standing and referee is invented for local development. Nothing produced by this
script is a real result and none of it should ever reach a production database.

Run:  python -m scripts.seed [--reset]

Without --reset the script refuses to touch an association that already exists,
so it can never quietly wipe data someone entered by hand.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.models import (
    Association,
    Field,
    League,
    LeagueTeam,
    Match,
    Season,
    Team,
)
from app.models.enums import DataSource, FieldSurface, LeagueKind, MatchStatus
from app.services.standings import recompute_standings

ASSOCIATION_SLUG = "epsip-ipeirou"

# Kickoffs are laid out backwards from "now" so that matchday 14 is always the
# one in progress. The calendar is nonsense, but it means the live-score UI has
# something to show the moment you start the app.
CURRENT_MATCHDAY = 14
TOTAL_MATCHDAYS = 18

# name, initials, city, founded, field slug
CLUBS: list[tuple[str, str, str, int, str]] = [
    ("Α.Ο. Ζίτσας", "ΖΙ", "Ζίτσα", 1978, "dimotiko-stadio-zitsas"),
    ("Α.Ε. Δωδώνης", "ΔΩ", "Δωδώνη", 1965, "gipedo-dodonis"),
    ("ΠΑΣ Θεσπρωτός", "ΘΕ", "Ηγουμενίτσα", 1970, "gipedo-igoumenitsas"),
    ("Α.Ο. Κόνιτσας", "ΚΟ", "Κόνιτσα", 1959, "dimotiko-stadio-konitsas"),
    ("Ένωση Πωγωνίου", "ΠΩ", "Καλπάκι", 1982, "gipedo-kalpakiou"),
    ("Α.Ε. Μετσόβου", "ΜΕ", "Μέτσοβο", 1974, "gipedo-metsovou"),
    ("Α.Ο. Λούρου", "ΛΟ", "Λούρος", 1968, "gipedo-lourou"),
    ("Α.Ο. Φιλιππιάδας", "ΦΙ", "Φιλιππιάδα", 1961, "gipedo-filippiadas"),
    ("Α.Ε. Πρέβεζας", "ΠΡ", "Πρέβεζα", 1955, "gipedo-prevezas"),
    ("Α.Ο. Ανατολής", "ΑΝ", "Ιωάννινα", 1980, "gipedo-anatolis"),
]

# slug, name, city, lat, lon, surface, capacity, floodlights
FIELDS: list[tuple[str, str, str, float, float, FieldSurface, int, bool]] = [
    ("dimotiko-stadio-zitsas", "Δημοτικό Στάδιο Ζίτσας", "Ζίτσα", 39.7433, 20.6472, FieldSurface.GRASS, 800, True),
    ("gipedo-dodonis", "Γήπεδο Δωδώνης", "Δωδώνη", 39.5461, 20.7877, FieldSurface.ARTIFICIAL, 500, False),
    ("gipedo-igoumenitsas", "Γήπεδο Ηγουμενίτσας", "Ηγουμενίτσα", 39.5036, 20.2661, FieldSurface.GRASS, 1500, True),
    ("dimotiko-stadio-konitsas", "Δημοτικό Στάδιο Κόνιτσας", "Κόνιτσα", 40.0475, 20.7503, FieldSurface.GRASS, 1000, True),
    ("gipedo-kalpakiou", "Γήπεδο Καλπακίου", "Καλπάκι", 39.8814, 20.6222, FieldSurface.ARTIFICIAL, 400, False),
    ("gipedo-metsovou", "Γήπεδο Μετσόβου", "Μέτσοβο", 39.7708, 21.1806, FieldSurface.ARTIFICIAL, 600, True),
    ("gipedo-lourou", "Γήπεδο Λούρου", "Λούρος", 39.1364, 20.8156, FieldSurface.GRASS, 500, False),
    ("gipedo-filippiadas", "Γήπεδο Φιλιππιάδας", "Φιλιππιάδα", 39.2042, 20.8869, FieldSurface.GRASS, 900, True),
    ("gipedo-prevezas", "Γήπεδο Πρέβεζας", "Πρέβεζα", 38.9575, 20.7517, FieldSurface.GRASS, 2000, True),
    ("gipedo-anatolis", "Γήπεδο Ανατολής", "Ιωάννινα", 39.6683, 20.8619, FieldSurface.ARTIFICIAL, 700, True),
]

REFEREES = [
    "Παππάς Κ.", "Γεωργίου Α.", "Τζίμας Ν.", "Ράπτης Δ.", "Μπέκας Σ.",
]


def season_slug_for(now: datetime) -> str:
    """Greek seasons run summer to summer, so July flips to the next one."""
    start = now.year if now.month >= 7 else now.year - 1
    return f"{start}-{start + 1}"


def round_robin(team_ids: list[int]) -> list[list[tuple[int, int]]]:
    """Circle method: n-1 matchdays where every team plays once per day."""
    ids = list(team_ids)
    if len(ids) % 2:
        ids.append(-1)  # bye
    half = len(ids) // 2
    rounds: list[list[tuple[int, int]]] = []
    for r in range(len(ids) - 1):
        pairs = []
        for i in range(half):
            a, b = ids[i], ids[-1 - i]
            if a != -1 and b != -1:
                # Alternate venue by round so home games stay balanced.
                pairs.append((a, b) if r % 2 == 0 else (b, a))
        rounds.append(pairs)
        ids = [ids[0]] + [ids[-1]] + ids[1:-1]
    return rounds


def invent_score(rng: random.Random) -> tuple[int, int]:
    goals = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5]
    return rng.choice(goals), rng.choice(goals)


async def seed(reset: bool) -> int:
    rng = random.Random(1978)
    now = datetime.now(timezone.utc)

    async with SessionLocal() as db:
        existing = (
            await db.execute(
                select(Association).where(Association.slug == ASSOCIATION_SLUG)
            )
        ).scalar_one_or_none()

        if existing is not None:
            if not reset:
                print(
                    f"Η ένωση '{ASSOCIATION_SLUG}' υπάρχει ήδη. "
                    "Τρέξε με --reset για να τη σβήσεις και να ξαναφτιαχτεί.",
                    file=sys.stderr,
                )
                return 1
            print(f"Διαγραφή υπάρχουσας ένωσης '{ASSOCIATION_SLUG}'…")
            # Matches point at teams with ondelete=RESTRICT, so they go first.
            await db.execute(
                delete(Match).where(
                    Match.league_id.in_(
                        select(League.id).where(
                            League.association_id == existing.id
                        )
                    )
                )
            )
            await db.delete(existing)
            await db.flush()

        association = Association(
            slug=ASSOCIATION_SLUG,
            name="Ε.Π.Σ. Ηπείρου",
            short_name="ΕΠΣ Ηπείρου",
            region="Ήπειρος",
            source_url="https://epsip.gr",
            scraper_config={
                # Names the adapter in app/scraper/sources, plus its parameters.
                # It never carries selectors: parsing is code, not config.
                "source": "epsip",
                "base_url": "https://epsip.gr",
                # No period_id: it is the source's id for one season, and
                # pinning it freezes the scraper on that season for good.
                "request_delay_seconds": 2,
            },
            primary_color="#1D4A33",
            is_active=True,
        )
        db.add(association)
        await db.flush()

        season = Season(
            association_id=association.id,
            slug=season_slug_for(now),
            name=f"Περίοδος {season_slug_for(now)}",
            is_current=True,
        )
        db.add(season)
        await db.flush()

        fields: dict[str, Field] = {}
        for slug, name, city, lat, lon, surface, capacity, lights in FIELDS:
            f = Field(
                association_id=association.id,
                slug=slug,
                name=name,
                city=city,
                latitude=lat,
                longitude=lon,
                surface=surface,
                capacity=capacity,
                has_floodlights=lights,
            )
            db.add(f)
            fields[slug] = f
        await db.flush()

        teams: list[Team] = []
        for name, initials, city, founded, field_slug in CLUBS:
            t = Team(
                association_id=association.id,
                slug=field_slug.replace("gipedo-", "").replace("dimotiko-stadio-", "")
                + "-fc",
                name=name,
                short_name=name.split(". ")[-1],
                initials=initials,
                city=city,
                founded_year=founded,
                home_field_id=fields[field_slug].id,
            )
            db.add(t)
            teams.append(t)
        await db.flush()

        league = League(
            association_id=association.id,
            season_id=season.id,
            slug="a-katigoria",
            name="Α΄ Κατηγορία",
            short_name="Α΄ Κατ.",
            kind=LeagueKind.CHAMPIONSHIP,
            tier=1,
            total_matchdays=TOTAL_MATCHDAYS,
            current_matchday=CURRENT_MATCHDAY,
            zones={
                "promotion": [1],
                "promotion_playoff": [2, 3],
                "relegation": [9, 10],
            },
            sort_order=1,
        )
        db.add(league)
        await db.flush()

        for t in teams:
            db.add(LeagueTeam(league_id=league.id, team_id=t.id))
        await db.flush()

        by_id = {t.id: t for t in teams}
        first_leg = round_robin([t.id for t in teams])
        # Second leg is the first with home and away swapped.
        schedule = first_leg + [[(b, a) for a, b in day] for day in first_leg]
        schedule = schedule[:TOTAL_MATCHDAYS]

        # Matchday 14 kicks off "today"; everything else steps a week either way.
        anchor = now.replace(minute=0, second=0, microsecond=0)

        created = 0
        for index, pairs in enumerate(schedule, start=1):
            offset_weeks = index - CURRENT_MATCHDAY
            for slot, (home_id, away_id) in enumerate(pairs):
                kickoff = anchor + timedelta(weeks=offset_weeks)
                if offset_weeks == 0:
                    # Spread today's fixtures around the current hour so some are
                    # running, some are done and some have not started.
                    kickoff = anchor + timedelta(hours=slot - 2)
                else:
                    kickoff = kickoff.replace(hour=13)

                home = by_id[home_id]
                match = Match(
                    league_id=league.id,
                    matchday=index,
                    home_team_id=home_id,
                    away_team_id=away_id,
                    field_id=home.home_field_id,
                    kickoff_at=kickoff,
                    referee=rng.choice(REFEREES),
                    external_id=f"md{index}-{home_id}v{away_id}",
                    last_scraped_at=now - timedelta(minutes=4),
                )

                if index < CURRENT_MATCHDAY:
                    match.status = MatchStatus.FINISHED
                    match.home_score, match.away_score = invent_score(rng)
                    match.data_source = DataSource.SCRAPER
                elif index == CURRENT_MATCHDAY:
                    if kickoff <= now - timedelta(hours=2):
                        match.status = MatchStatus.FINISHED
                        match.home_score, match.away_score = invent_score(rng)
                    elif kickoff <= now:
                        match.status = MatchStatus.LIVE
                        match.is_live = True
                        match.minute = int((now - kickoff).total_seconds() // 60) + 1
                        match.home_score, match.away_score = invent_score(rng)
                        # Live scores in this seed pretend to come from an editor
                        # in the stand, which is what the reconciliation rule is
                        # there to protect.
                        match.data_source = DataSource.MANUAL_LIVE
                        match.last_manual_edit_at = now - timedelta(minutes=1)
                    else:
                        match.status = MatchStatus.SCHEDULED
                else:
                    match.status = MatchStatus.SCHEDULED

                db.add(match)
                created += 1

        # One postponement, so the ΑΝΑΒΟΛΗ card state has something to render.
        await db.flush()
        postponed = (
            await db.execute(
                select(Match)
                .where(Match.league_id == league.id, Match.matchday == CURRENT_MATCHDAY)
                .order_by(Match.id.desc())
                .limit(1)
            )
        ).scalar_one()
        postponed.status = MatchStatus.POSTPONED
        postponed.is_live = False
        postponed.home_score = postponed.away_score = None
        postponed.note = "Αναβολή λόγω καιρικών συνθηκών. Νέα ημερομηνία σύντομα."

        await db.flush()
        standings = await recompute_standings(db, league)
        await db.commit()

        print(f"Ένωση:      {association.name} ({association.slug})")
        print(f"Περίοδος:   {season.slug}")
        print(f"Πρωτάθλημα: {league.name} — {len(teams)} ομάδες")
        print(f"Γήπεδα:     {len(fields)}")
        print(f"Αγώνες:     {created}")
        print(f"Βαθμολογία: {len(standings)} γραμμές")
        print()
        print("ΠΡΟΣΟΧΗ: τα σκορ και οι ημερομηνίες είναι πλασματικά (dev data).")
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
    return asyncio.run(seed(args.reset))


if __name__ == "__main__":
    raise SystemExit(main())
