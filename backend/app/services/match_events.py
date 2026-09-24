"""Turning a list of events into a scoreline.

The events are the record; the score on the match row is a summary of them.
Keeping the summary derived rather than typed is what makes "↶ Αναίρεση" a
single delete instead of a delete and a subtraction that can disagree with it.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.models import Match, MatchEvent
from app.models.enums import MatchEventKind, MatchStatus

#: Events that put a goal on the board.
SCORING = (MatchEventKind.GOAL, MatchEventKind.PENALTY_GOAL)

#: Which half each marker moves the match into.
_STATUS_MARKERS = {
    MatchEventKind.KICKOFF: MatchStatus.LIVE,
    MatchEventKind.HALFTIME: MatchStatus.HALFTIME,
    MatchEventKind.SECOND_HALF: MatchStatus.LIVE,
    MatchEventKind.FULLTIME: MatchStatus.FINISHED,
    # A match that was called off is not a match with no score — the
    # difference is the whole reason somebody walked to the ground.
    MatchEventKind.POSTPONED: MatchStatus.POSTPONED,
    # Abandoned mid-play. The federation decides afterwards whether it is
    # replayed or awarded; until then it is not finished.
    MatchEventKind.ABANDONED: MatchStatus.POSTPONED,
}


def score_from_events(match: Match, events: Iterable[MatchEvent]) -> tuple[int, int]:
    """(home, away) from the log.

    An own goal is credited to the opposing side. It is the one mapping here
    that is not the obvious one, and the only one whose mistake shows up as a
    wrong scoreline rather than a missing row.
    """
    home = away = 0
    for event in events:
        if event.team_id is None:
            continue
        if event.kind in SCORING:
            if event.team_id == match.home_team_id:
                home += 1
            elif event.team_id == match.away_team_id:
                away += 1
        elif event.kind is MatchEventKind.OWN_GOAL:
            # Recorded against the side that put it in, counted for the other.
            if event.team_id == match.home_team_id:
                away += 1
            elif event.team_id == match.away_team_id:
                home += 1
    return home, away


def halftime_score_from_events(
    match: Match, events: Iterable[MatchEvent]
) -> tuple[int, int] | None:
    """(home, away) at the interval, or None if half time was never marked.

    Read from the log's own marker rather than from the minute, because the
    minute is optional here and a match that ran to 47 before the whistle is
    ordinary.
    """
    ordered = list(events)
    for index, event in enumerate(ordered):
        if event.kind is MatchEventKind.HALFTIME:
            return score_from_events(match, ordered[:index])
    return None


def status_from_events(events: Iterable[MatchEvent]) -> MatchStatus | None:
    """The match state implied by the last marker in the log.

    Only markers count. A goal in the 80th minute says nothing about whether
    the whistle has gone.
    """
    status = None
    for event in events:
        marker = _STATUS_MARKERS.get(event.kind)
        if marker is not None:
            status = marker
    return status


def apply_events(match: Match, events: Iterable[MatchEvent]) -> None:
    """Bring the match row in line with its log.

    Called after every add and every undo, so the two can never drift. The
    caller owns the transaction.
    """
    ordered = list(events)

    match.home_score, match.away_score = score_from_events(match, ordered)

    interval = halftime_score_from_events(match, ordered)
    if interval is not None:
        match.home_score_ht, match.away_score_ht = interval

    status = status_from_events(ordered)
    if status is not None:
        match.status = status
        match.is_live = status in (MatchStatus.LIVE, MatchStatus.HALFTIME)

    if not ordered:
        # The whole log was undone. Leaving a score behind would leave a
        # result nobody can point at an event for.
        match.home_score = match.away_score = None
        match.is_live = False

    # The last minute anybody recorded, which is what the badge shows.
    minutes = [e.minute for e in ordered if e.minute is not None]
    match.minute = max(minutes) if minutes and match.is_live else None
