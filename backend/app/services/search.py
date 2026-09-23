"""Finding a club, a player or a ground by name.

The whole problem here is Greek. Somebody looking for the Ολυμπιακός of their
village types "ολυμπιακος" — no accent, because phone keyboards make accents
work and nobody bothers — and the database holds "Ολυμπιακός". A plain ILIKE
finds nothing, and the reader concludes the club is not on the site.

So both sides get folded to the same shape before comparing: lowercased, accents
removed, final sigma turned into an ordinary one. The fold is defined once, as a
pair of strings, and used by Python and by Postgres alike — if the two ever drift
the search silently stops matching, which is exactly the kind of bug that never
gets reported.

No index backs this: translate() on every row defeats one. That is a deliberate
trade at this size — a federation has a couple of hundred clubs and a few
thousand players, and a sequential scan over that is faster than the round trip
that carried the request. It stops being true somewhere around a million rows,
at which point the fold belongs in a stored generated column with an index on it.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import ColumnElement, Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Field, League, LeagueTeam, Player, PlayerStat, Team

#: Characters that differ only by decoration, and what they become. Kept as two
#: parallel strings because that is the shape translate() wants; the assert
#: below is what keeps them parallel.
_ACCENTED = "άέήίόύώϊϋΐΰς"
_PLAIN = "αεηιουωιυιυσ"
assert len(_ACCENTED) == len(_PLAIN), "ο πίνακας πτυχώσεως ξέφυγε"

_FOLD = str.maketrans(_ACCENTED, _PLAIN)

#: Below this a search matches most of the alphabet and tells the reader
#: nothing. Two letters is enough to mean something in Greek ("ΑΟ", "ΠΑΟ").
MIN_QUERY = 2

#: Per category. A phone screen shows about this many before scrolling stops
#: feeling like browsing, and anybody who needs more should narrow the words.
LIMIT = 8


def fold(text: str) -> str:
    """The Python half of the fold. Must agree with :func:`folded`."""
    return text.lower().translate(_FOLD)


def folded(column: ColumnElement[str]) -> ColumnElement[str]:
    """The SQL half. Must agree with :func:`fold`."""
    return func.translate(func.lower(column), _ACCENTED, _PLAIN)


@dataclass(frozen=True, slots=True)
class Hit:
    kind: str
    slug: str
    name: str
    subtitle: str | None = None
    logo_url: str | None = None


def _ranked(stmt: Select, name_column: ColumnElement[str], needle: str) -> Select:
    """Order by how well the name matches, then alphabetically.

    A name that *starts* with what was typed comes first. Searching "ολυ" should
    put Ολυμπιακός above Νέος Ολυμπιακός, because somebody typing the first
    letters of a word is almost always naming the thing they want rather than
    describing it.
    """
    target = folded(name_column)
    rank = case((target.startswith(needle), 0), else_=1)
    return (
        stmt.where(target.contains(needle))
        .order_by(rank, name_column)
        .limit(LIMIT)
    )


async def search_teams(
    db: AsyncSession, *, association_id: int, needle: str
) -> list[Hit]:
    """Clubs, captioned with the division they play in.

    The obvious caption would be the town, and `teams.city` exists for it — but
    the source never fills it in, so a city subtitle would be blank on every
    single row. The division is populated for 175 of 177 clubs and is what a
    reader actually uses to tell two similarly-named clubs apart.
    """
    rows = list(
        (
            await db.execute(
                _ranked(
                    select(Team)
                    .where(Team.association_id == association_id)
                    .options(
                        selectinload(Team.league_entries).selectinload(
                            LeagueTeam.league
                        )
                    ),
                    Team.name,
                    needle,
                )
            )
        ).scalars()
    )
    return [
        Hit(
            kind="team",
            # Shown short, matched long: somebody types "κληματ" and the query
            # runs against "Α.Ε.ΚΛΗΜΑΤΙΑΣ", but the row that comes back reads
            # "ΚΛΗΜΑΤΙΑΣ" like every other list on the site.
            slug=t.slug,
            name=t.short_name or t.name,
            subtitle=_latest_league(t),
            logo_url=t.logo_url,
        )
        for t in rows
    ]


def _latest_league(team: Team) -> str | None:
    """The division from the most recent entry we hold.

    Highest league id wins: leagues are created season by season as they are
    scraped, so the newest row is the current one. A club that has moved up
    should read as its new division, not the one it was promoted out of.
    """
    entries = sorted(team.league_entries, key=lambda e: e.league_id, reverse=True)
    for entry in entries:
        league: League | None = entry.league
        if league is not None:
            return league.short_name or league.name
    return None


async def search_fields(
    db: AsyncSession, *, association_id: int, needle: str
) -> list[Hit]:
    """Grounds, captioned with whose home they are.

    Same reasoning as the clubs: `fields.city` is empty for all 114 of them.
    Who plays there is known for most, and is how people refer to a ground
    anyway — "the Anatoli pitch" is the pitch Anatoli plays on.
    """
    rows = list(
        (
            await db.execute(
                _ranked(
                    select(Field)
                    .where(Field.association_id == association_id)
                    .options(selectinload(Field.home_teams)),
                    Field.name,
                    needle,
                )
            )
        ).scalars()
    )

    hits = []
    for field in rows:
        tenants = sorted(t.name for t in field.home_teams)
        if not tenants:
            subtitle = None
        elif len(tenants) == 1:
            subtitle = f"Έδρα {tenants[0]}"
        else:
            # Several clubs share a municipal ground, which is the norm here.
            # Naming them all turns a one-line caption into a paragraph.
            subtitle = f"Έδρα {tenants[0]} +{len(tenants) - 1}"
        hits.append(Hit(kind="field", slug=field.slug, name=field.name, subtitle=subtitle))
    return hits


async def search_players(
    db: AsyncSession, *, association_id: int, needle: str
) -> list[Hit]:
    """Players, captioned with their club or, failing that, their year of birth.

    Without a caption a list of Παπαδόπουλος is unusable: the name repeats
    across a federation and there are two ΠΑΠΑΔΟΠΟΥΛΟΣ ΑΛΕΞΑΝΔΡΟΣ in this one.

    The club would be ideal but is known for about a tenth of them — most
    players here come from the registration list rather than from a match
    report, and that list carries no club. It does carry a birth year, for
    nearly every one of them, and a year is enough to tell two namesakes apart.
    """
    rows = list(
        (
            await db.execute(
                _ranked(
                    select(Player)
                    .where(Player.association_id == association_id)
                    .options(
                        selectinload(Player.stats).selectinload(PlayerStat.team)
                    ),
                    Player.name,
                    needle,
                )
            )
        ).scalars()
    )

    hits = []
    for player in rows:
        club = next(
            (
                stat.team.name
                for stat in sorted(player.stats, key=lambda s: s.id, reverse=True)
                if stat.team is not None
            ),
            None,
        )
        subtitle = club or (f"γενν. {player.birth_year}" if player.birth_year else None)
        hits.append(
            Hit(kind="player", slug=player.slug, name=player.name, subtitle=subtitle)
        )
    return hits
