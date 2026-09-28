"""Reading the federation's match reports back: a match's sheet, and a
player's record built from every sheet they appear on.

Minutes are worked out rather than read: the report says who started, who came
on and went off and when, and who was sent off. A starter plays from 0, a
substitute from the minute they came on; either stops at the minute they went
off or were sent off, otherwise at 90. Added time is left out, as the
federation's own minute totals leave it out.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import League, Match, MatchLineup, MatchSheetEvent, Season

FULL_TIME = 90
_GOALS = ("goal", "penalty_goal")
_OFF = ("sub_out", "red", "second_yellow")


@dataclass(slots=True)
class Line:
    """One player on one sheet, with what the timeline says they did."""

    lineup: MatchLineup
    on: int | None
    off: int | None
    goals: int = 0
    penalties: int = 0
    own_goals: int = 0
    yellow: int = 0
    red: bool = False

    @property
    def played(self) -> bool:
        return self.on is not None

    @property
    def minutes(self) -> int:
        if self.on is None:
            return 0
        return max(0, (self.off if self.off is not None else FULL_TIME) - self.on)


def lines(lineups: list[MatchLineup], events: list[MatchSheetEvent]) -> list[Line]:
    """Each named player's line: when they were on the pitch and what they did.

    Events are matched to a player by register id when both have one, by name
    within the same club otherwise (a player missing from the register still
    has a name on the report)."""

    def key(team_id: int | None, player_id: int | None, name: str | None) -> tuple:
        return ("id", player_id) if player_id else ("name", team_id, (name or "").strip())

    by_key: dict[tuple, list[MatchSheetEvent]] = defaultdict(list)
    for e in events:
        by_key[key(e.team_id, e.player_id, e.player_name)].append(e)

    out: list[Line] = []
    for row in lineups:
        mine = by_key.get(key(row.team_id, row.player_id, row.player_name), [])
        came_on = next((e.minute for e in mine if e.kind == "sub_in"), None)
        on = 0 if row.starter else came_on
        off = next((e.minute for e in mine if e.kind in _OFF), None)
        if on is None and not row.starter and any(e.kind != "sub_in" for e in mine):
            # Booked or scored from the bench without a recorded substitution:
            # they played, from an unknown minute. Counted as an appearance.
            on = off if off is not None else FULL_TIME
        line = Line(lineup=row, on=on, off=off)
        for e in mine:
            if e.kind in _GOALS:
                line.goals += 1
                line.penalties += e.kind == "penalty_goal"
            elif e.kind == "own_goal":
                line.own_goals += 1
            elif e.kind == "yellow":
                line.yellow += 1
            elif e.kind == "second_yellow":
                line.yellow += 1
                line.red = True
            elif e.kind == "red":
                line.red = True
        out.append(line)
    return out


async def match_sheet(
    db: AsyncSession, match_id: int
) -> tuple[list[MatchSheetEvent], list[Line]] | None:
    """The sheet of one match, or None when no report has been read for it."""
    events = list(
        (
            await db.execute(
                select(MatchSheetEvent)
                .options(selectinload(MatchSheetEvent.player))
                .where(MatchSheetEvent.match_id == match_id)
                .order_by(MatchSheetEvent.position)
            )
        ).scalars()
    )
    lineups = list(
        (
            await db.execute(
                select(MatchLineup)
                .options(selectinload(MatchLineup.player))
                .where(MatchLineup.match_id == match_id)
                .order_by(MatchLineup.position)
            )
        ).scalars()
    )
    if not events and not lineups:
        return None
    return events, lines(lineups, events)


@dataclass(slots=True)
class Appearance:
    match: Match
    league: League
    season: Season
    line: Line


@dataclass(slots=True)
class SeasonLine:
    season: Season
    league: League
    team_id: int | None
    apps: int = 0
    starts: int = 0
    minutes: int = 0
    goals: int = 0
    own_goals: int = 0
    yellow: int = 0
    red: int = 0
    matches: list[int] = field(default_factory=list)


async def player_record(db: AsyncSession, player_id: int) -> list[Appearance]:
    """Every match a player took the field in, newest first."""
    match_ids = [
        mid
        for (mid,) in (
            await db.execute(
                select(MatchLineup.match_id).where(MatchLineup.player_id == player_id).distinct()
            )
        ).all()
    ]
    if not match_ids:
        return []
    matches = {
        m.id: m
        for m in (
            await db.execute(
                select(Match)
                .options(
                    selectinload(Match.home_team),
                    selectinload(Match.away_team),
                    selectinload(Match.league).selectinload(League.season),
                )
                .where(Match.id.in_(match_ids))
            )
        ).scalars()
    }
    lineups: dict[int, list[MatchLineup]] = defaultdict(list)
    for row in (
        await db.execute(select(MatchLineup).where(MatchLineup.match_id.in_(match_ids)))
    ).scalars():
        lineups[row.match_id].append(row)
    events: dict[int, list[MatchSheetEvent]] = defaultdict(list)
    for e in (
        await db.execute(select(MatchSheetEvent).where(MatchSheetEvent.match_id.in_(match_ids)))
    ).scalars():
        events[e.match_id].append(e)

    out: list[Appearance] = []
    for mid, match in matches.items():
        for line in lines(lineups[mid], events[mid]):
            if line.lineup.player_id == player_id and line.played:
                out.append(Appearance(match, match.league, match.league.season, line))
    out.sort(key=lambda a: a.match.kickoff_at.timestamp() if a.match.kickoff_at else 0.0, reverse=True)
    return out


def by_season(appearances: list[Appearance]) -> list[SeasonLine]:
    """A player's appearances summed per season, competition and club, in the
    order of the appearances (newest first)."""
    table: dict[tuple[int, int, int | None], SeasonLine] = {}
    for a in appearances:
        k = (a.season.id, a.league.id, a.line.lineup.team_id)
        row = table.get(k)
        if row is None:
            row = table[k] = SeasonLine(a.season, a.league, a.line.lineup.team_id)
        row.apps += 1
        row.starts += a.line.lineup.starter
        row.minutes += a.line.minutes
        row.goals += a.line.goals
        row.own_goals += a.line.own_goals
        row.yellow += a.line.yellow
        row.red += a.line.red
        row.matches.append(a.match.id)
    return list(table.values())
