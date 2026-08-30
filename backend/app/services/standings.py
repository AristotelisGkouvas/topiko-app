"""Recompute a league table from its matches.

Standings are derived, never hand-edited: an editor fixes a score and the table
follows. Recomputing the whole league is cheap at this scale (a category is
~10 teams, ~90 matches) and removes a whole class of drift bugs that incremental
updates invite.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import League, LeagueTeam, Match, Standing
from app.models.enums import MatchStatus, StandingZone

# Results that count towards the table. A postponed or cancelled match
# contributes nothing until it is actually played (or awarded).
COUNTED_STATUSES = (MatchStatus.FINISHED, MatchStatus.AWARDED)

# Result letters as shown on the form pills: Νίκη / Ισοπαλία / Ήττα.
WIN, DRAW, LOSS = "Ν", "Ι", "Η"


@dataclass
class _Row:
    team_id: int
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    points: int = 0
    deduction: int = 0
    # Newest last; trimmed to the last five when written out.
    form: list[str] = field(default_factory=list)

    @property
    def goal_difference(self) -> int:
        return self.goals_for - self.goals_against

    @property
    def final_points(self) -> int:
        return self.points - self.deduction


def _zone_for(position: int, zones: dict) -> StandingZone | None:
    """Map a finishing position onto a coloured rail.

    `zones` comes straight from the league row, e.g.
    {"promotion": [1], "promotion_playoff": [2, 3], "relegation": [9, 10]}.
    """
    for name, positions in zones.items():
        if position in (positions or []):
            try:
                return StandingZone(name)
            except ValueError:
                # Unknown key in the config — ignore rather than fail the whole
                # recompute over a typo in a JSON blob.
                continue
    return None


async def recompute_standings(db: AsyncSession, league: League) -> list[Standing]:
    """Rebuild every Standing row for `league` and return them, ordered."""
    entries = list(
        (
            await db.execute(
                select(LeagueTeam).where(LeagueTeam.league_id == league.id)
            )
        ).scalars()
    )
    rows: dict[int, _Row] = {
        e.team_id: _Row(team_id=e.team_id, deduction=e.points_deduction)
        for e in entries
    }

    matches = list(
        (
            await db.execute(
                select(Match)
                .where(
                    Match.league_id == league.id,
                    Match.status.in_(COUNTED_STATUSES),
                    Match.home_score.is_not(None),
                    Match.away_score.is_not(None),
                )
                .order_by(Match.kickoff_at.nulls_last(), Match.id)
            )
        ).scalars()
    )

    # Head-to-head points, used only to break ties (ΕΠΟ rule: teams level on
    # points are separated by their results against each other first, not by
    # goal difference).
    h2h: dict[tuple[int, int], int] = defaultdict(int)

    for m in matches:
        home, away = rows.get(m.home_team_id), rows.get(m.away_team_id)
        if home is None or away is None:
            # A match against a team not registered in this league is a data
            # error, not something to silently fold into the table.
            continue

        home.played += 1
        away.played += 1
        home.goals_for += m.home_score
        home.goals_against += m.away_score
        away.goals_for += m.away_score
        away.goals_against += m.home_score

        if m.home_score > m.away_score:
            winner, loser = home, away
        elif m.away_score > m.home_score:
            winner, loser = away, home
        else:
            winner = loser = None

        if winner is None:
            home.drawn += 1
            away.drawn += 1
            home.points += league.points_per_draw
            away.points += league.points_per_draw
            home.form.append(DRAW)
            away.form.append(DRAW)
            h2h[(home.team_id, away.team_id)] += league.points_per_draw
            h2h[(away.team_id, home.team_id)] += league.points_per_draw
        else:
            winner.won += 1
            loser.lost += 1
            winner.points += league.points_per_win
            winner.form.append(WIN)
            loser.form.append(LOSS)
            h2h[(winner.team_id, loser.team_id)] += league.points_per_win

    def _mini_league_points(row: _Row, tied: list[_Row]) -> int:
        return sum(h2h[(row.team_id, other.team_id)] for other in tied if other is not row)

    ordered = sorted(
        rows.values(),
        key=lambda r: (-r.final_points, -r.goal_difference, -r.goals_for),
    )

    # Second pass: within each block of equal points, re-sort by head-to-head.
    resolved: list[_Row] = []
    i = 0
    while i < len(ordered):
        j = i
        while j + 1 < len(ordered) and ordered[j + 1].final_points == ordered[i].final_points:
            j += 1
        block = ordered[i : j + 1]
        if len(block) > 1:
            block.sort(
                key=lambda r: (
                    -_mini_league_points(r, block),
                    -r.goal_difference,
                    -r.goals_for,
                )
            )
        resolved.extend(block)
        i = j + 1

    existing = {
        s.team_id: s
        for s in (
            await db.execute(select(Standing).where(Standing.league_id == league.id))
        ).scalars()
    }
    now = datetime.now(timezone.utc)
    out: list[Standing] = []

    for position, row in enumerate(resolved, start=1):
        standing = existing.get(row.team_id)
        if standing is None:
            standing = Standing(league_id=league.id, team_id=row.team_id)
            db.add(standing)
        elif standing.position != position:
            standing.previous_position = standing.position

        standing.position = position
        standing.played = row.played
        standing.won = row.won
        standing.drawn = row.drawn
        standing.lost = row.lost
        standing.goals_for = row.goals_for
        standing.goals_against = row.goals_against
        standing.goal_difference = row.goal_difference
        standing.points = row.final_points
        standing.form = "".join(row.form[-5:]) or None
        standing.zone = _zone_for(position, league.zones or {})
        standing.computed_at = now
        out.append(standing)

    # A team removed from the league should not keep a ghost row.
    for team_id, standing in existing.items():
        if team_id not in rows:
            await db.delete(standing)

    await db.flush()
    return out
