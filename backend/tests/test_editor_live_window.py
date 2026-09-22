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
