"""Turning a log of events into a scoreline.

The one place in this feature where a mistake is not a missing row but a wrong
result on the page — and a wrong result typed by "the club secretary" carries
more weight with a reader than a wrong one scraped off a website.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.models.enums import MatchEventKind, MatchStatus
from app.services.match_events import (
    apply_events,
    halftime_score_from_events,
    score_from_events,
    status_from_events,
)

HOME, AWAY = 1, 2


def match() -> SimpleNamespace:
    return SimpleNamespace(
        home_team_id=HOME,
        away_team_id=AWAY,
        home_score=None,
        away_score=None,
        home_score_ht=None,
        away_score_ht=None,
        status=MatchStatus.SCHEDULED,
        is_live=False,
        minute=None,
    )


def event(kind: MatchEventKind, team: int | None = None, minute: int | None = None):
    return SimpleNamespace(kind=kind, team_id=team, minute=minute)


def goal(team: int, minute: int | None = None):
    return event(MatchEventKind.GOAL, team, minute)


# --- the score ------------------------------------------------------------


def test_no_events_is_no_score() -> None:
    assert score_from_events(match(), []) == (0, 0)


def test_goals_count_for_the_side_that_scored() -> None:
    log = [goal(HOME), goal(AWAY), goal(HOME)]
    assert score_from_events(match(), log) == (2, 1)


def test_a_penalty_counts_like_any_other_goal() -> None:
    log = [event(MatchEventKind.PENALTY_GOAL, HOME)]
    assert score_from_events(match(), log) == (1, 0)


def test_an_own_goal_counts_for_the_other_side() -> None:
    # Recorded against the side that put it in. The single mapping here that
    # is not the obvious one.
    log = [event(MatchEventKind.OWN_GOAL, HOME)]
    assert score_from_events(match(), log) == (0, 1)


def test_a_missed_penalty_is_not_a_goal() -> None:
    log = [event(MatchEventKind.PENALTY_MISS, HOME)]
    assert score_from_events(match(), log) == (0, 0)


@pytest.mark.parametrize(
    "kind",
    [
        MatchEventKind.YELLOW,
        MatchEventKind.RED,
        MatchEventKind.SUBSTITUTION,
        MatchEventKind.NOTE,
    ],
)
def test_nothing_else_touches_the_score(kind: MatchEventKind) -> None:
    assert score_from_events(match(), [event(kind, HOME)]) == (0, 0)


def test_an_event_for_neither_team_is_ignored() -> None:
    # Kickoff and the final whistle carry no team.
    assert score_from_events(match(), [event(MatchEventKind.KICKOFF)]) == (0, 0)


# --- half time ------------------------------------------------------------


def test_no_halftime_marker_means_no_halftime_score() -> None:
    assert halftime_score_from_events(match(), [goal(HOME)]) is None


def test_the_halftime_score_is_what_stood_at_the_whistle() -> None:
    log = [
        goal(HOME, 10),
        goal(AWAY, 30),
        event(MatchEventKind.HALFTIME, minute=45),
        goal(HOME, 70),
    ]
    assert halftime_score_from_events(match(), log) == (1, 1)


def test_halftime_is_read_from_the_marker_not_the_minute() -> None:
    # Minutes are optional and injury time is ordinary: a whistle at 47 is
    # still half time, and a goal at 44 entered without a minute still counts.
    log = [goal(HOME), event(MatchEventKind.HALFTIME, minute=47), goal(AWAY)]
    assert halftime_score_from_events(match(), log) == (1, 0)


# --- state ----------------------------------------------------------------


def test_a_goal_says_nothing_about_whether_the_whistle_has_gone() -> None:
    assert status_from_events([goal(HOME, 80)]) is None


def test_the_last_marker_wins() -> None:
    log = [
        event(MatchEventKind.KICKOFF),
        event(MatchEventKind.HALFTIME),
        event(MatchEventKind.SECOND_HALF),
    ]
    assert status_from_events(log) is MatchStatus.LIVE


def test_the_final_whistle_finishes_it() -> None:
    log = [event(MatchEventKind.KICKOFF), event(MatchEventKind.FULLTIME)]
    assert status_from_events(log) is MatchStatus.FINISHED


# --- applying it to the row -----------------------------------------------


def test_applying_a_log_fills_in_the_row() -> None:
    m = match()
    apply_events(
        m,
        [
            event(MatchEventKind.KICKOFF, minute=0),
            goal(HOME, 12),
            event(MatchEventKind.HALFTIME, minute=45),
            goal(AWAY, 67),
        ],
    )
    assert (m.home_score, m.away_score) == (1, 1)
    assert (m.home_score_ht, m.away_score_ht) == (1, 0)
    assert m.status is MatchStatus.HALFTIME
    assert m.is_live is True
    assert m.minute == 67


def test_undoing_the_whole_log_clears_the_result() -> None:
    # Otherwise a score is left behind that no event accounts for, which is
    # exactly the state the log exists to prevent.
    m = match()
    apply_events(m, [goal(HOME, 12)])
    assert m.home_score == 1
    apply_events(m, [])
    assert m.home_score is None and m.away_score is None
    assert m.is_live is False


def test_the_minute_is_dropped_once_the_match_is_over() -> None:
    m = match()
    apply_events(
        m, [event(MatchEventKind.KICKOFF), goal(HOME, 88), event(MatchEventKind.FULLTIME)]
    )
    assert m.status is MatchStatus.FINISHED
    assert m.minute is None
