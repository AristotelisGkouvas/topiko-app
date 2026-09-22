"""Work out where each club plays.

The federation's club register does not say. It publishes a venue per fixture
and nothing that ties a club to a ground, so `teams.home_field_id` was null for
all 177 clubs and the ground card on every club page rendered as nothing at
all — while the page had been built to show it.

It is derivable: a club plays its home fixtures at its home ground. Not always,
which is why this takes a majority rather than the first row it finds, and not
forever, which is why it only looks at recent fixtures.
"""

from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Association, League, Match, Team

#: How many of a club's most recent home fixtures to weigh. Long enough for a
#: majority to mean something, short enough that a club which moved ground two
#: seasons ago is filed at the new one.
WINDOW = 12

#: Below this share the club has no obvious home. Several here genuinely play
#: across two municipal grounds, and guessing between them would put a wrong
#: address on the page, which is worse than none.
MAJORITY = 0.5


async def infer_home_fields(db: AsyncSession, association: Association) -> int:
    """Set `home_field_id` where the fixtures make it clear. Returns how many
    clubs were changed."""
    rows = (
        await db.execute(
            select(Match.home_team_id, Match.field_id)
            .join(League, Match.league_id == League.id)
            .where(
                League.association_id == association.id,
                Match.field_id.is_not(None),
                Match.kickoff_at.is_not(None),
            )
            # Newest first, so taking the first WINDOW per club is a window on
            # the present rather than a sample of the archive.
            .order_by(Match.kickoff_at.desc())
        )
    ).all()

    recent: dict[int, list[int]] = {}
    for team_id, field_id in rows:
        seen = recent.setdefault(team_id, [])
        if len(seen) < WINDOW:
            seen.append(field_id)

    teams = {
        team.id: team
        for team in (
            await db.execute(
                select(Team).where(Team.association_id == association.id)
            )
        ).scalars()
    }

    changed = 0
    for team_id, fields in recent.items():
        team = teams.get(team_id)
        if team is None:
            continue
        field_id = pick_home_field(fields)
        if field_id is None or team.home_field_id == field_id:
            continue
        team.home_field_id = field_id
        changed += 1

    return changed


def pick_home_field(fields: list[int]) -> int | None:
    """The ground a club plays at, or None if the fixtures do not agree.

    Separate from the query because this is the judgement: everything above is
    fetching. A club that splits its season between two municipal grounds has
    no home ground to state, and printing the more frequent of two near-equal
    venues would put a wrong address on its page — worse than printing none.
    """
    if not fields:
        return None

    ranked = Counter(fields).most_common()
    field_id, count = ranked[0]

    # Two grounds level on count is not a home ground, whatever order the
    # counter happened to put them in. A club really does sometimes split a
    # season between two municipal pitches.
    if len(ranked) > 1 and ranked[1][1] == count:
        return None

    return field_id if count / len(fields) >= MAJORITY else None
