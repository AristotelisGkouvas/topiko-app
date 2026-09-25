"""When an edit counts as happening during the match.

This is the line between two permissions. Inside it an editor needs
`can_edit_live`, because a live edit outranks the federation's own result for
48 hours; outside it, correcting last month's typo needs only access. Getting
the boundary wrong either locks out the person at the ground or hands a
stranger the live score.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.api.v1.editor import _is_live_window
from app.models.enums import MatchStatus

NOW = datetime(2026, 9, 27, 14, 0, tzinfo=UTC)


def match(**kwargs) -> SimpleNamespace:
    fields = {"is_live": False, "status": MatchStatus.SCHEDULED, "kickoff_at": NOW}
    return SimpleNamespace(**{**fields, **kwargs})


def test_a_match_flagged_live_is_live_whatever_the_clock_says() -> None:
    # The flag is set by whoever is at the ground; the kickoff time can be
    # wrong, and the person watching it is not.
    assert _is_live_window(match(is_live=True, kickoff_at=None), NOW)


@pytest.mark.parametrize("status", [MatchStatus.LIVE, MatchStatus.HALFTIME])
def test_a_running_status_is_live(status: MatchStatus) -> None:
    assert _is_live_window(match(status=status, kickoff_at=None), NOW)


def test_half_an_hour_before_kickoff_counts() -> None:
    # A last-minute postponement is typed in before anyone kicks off.
    assert _is_live_window(match(kickoff_at=NOW + timedelta(minutes=29)), NOW)


def test_an_hour_before_kickoff_does_not() -> None:
    assert not _is_live_window(match(kickoff_at=NOW + timedelta(hours=1)), NOW)


def test_two_hours_after_kickoff_still_counts() -> None:
    assert _is_live_window(match(kickoff_at=NOW - timedelta(hours=2)), NOW)


def test_a_day_later_is_an_ordinary_correction() -> None:
    assert not _is_live_window(match(kickoff_at=NOW - timedelta(days=1)), NOW)


def test_a_fixture_with_no_date_is_not_live() -> None:
    # Nothing to be in the middle of. The alternative — treating an undated
    # fixture as live — would put every one of them behind the stricter
    # permission for no reason.
    assert not _is_live_window(match(kickoff_at=None), NOW)


# --- the status a typed score implies --------------------------------------

from app.api.v1.editor import _implied_status  # noqa: E402


def scored(**kwargs) -> SimpleNamespace:
    fields = {
        "status": MatchStatus.SCHEDULED,
        "kickoff_at": NOW - timedelta(days=1),
        "home_score": 2,
        "away_score": 1,
    }
    return SimpleNamespace(**{**fields, **kwargs})


def test_a_score_on_a_played_fixture_finishes_it() -> None:
    # Otherwise the table, which reads only finished matches, never sees it.
    assert _implied_status(scored(), {"home_score": 2}, NOW) is MatchStatus.FINISHED


def test_a_score_during_the_match_is_a_live_score() -> None:
    m = scored(kickoff_at=NOW - timedelta(minutes=40))
    assert _implied_status(m, {"home_score": 2}, NOW) is MatchStatus.LIVE


def test_an_explicit_status_is_left_alone() -> None:
    assert _implied_status(scored(), {"status": MatchStatus.AWARDED}, NOW) is None


def test_half_a_score_is_not_a_result() -> None:
    assert _implied_status(scored(away_score=None), {"home_score": 2}, NOW) is None


def test_only_a_scheduled_match_is_promoted() -> None:
    m = scored(status=MatchStatus.POSTPONED)
    assert _implied_status(m, {"home_score": 2}, NOW) is None
