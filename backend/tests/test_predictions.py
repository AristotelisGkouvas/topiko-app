"""When a prediction can still be made.

The rule is "before kickoff", and both halves of the check matter: the status
is what a person watching sets, and the clock covers the ordinary case where
nobody marked the match live and it has been running for an hour. Getting it
wrong lets somebody vote on a result they already know.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.api.v1.predictions import _is_open
from app.models.enums import MatchStatus

NOW = datetime(2026, 9, 27, 14, 0, tzinfo=UTC)


def match(**kwargs) -> SimpleNamespace:
    fields = {
        "status": MatchStatus.SCHEDULED,
        "is_live": False,
        "kickoff_at": NOW + timedelta(hours=2),
    }
    return SimpleNamespace(**{**fields, **kwargs})


def test_open_before_kickoff() -> None:
    assert _is_open(match(), NOW)


def test_closed_once_kickoff_has_passed() -> None:
    assert not _is_open(match(kickoff_at=NOW - timedelta(minutes=1)), NOW)


def test_closed_exactly_at_kickoff() -> None:
    # The whistle is the deadline, not a second after it.
    assert not _is_open(match(kickoff_at=NOW), NOW)


@pytest.mark.parametrize(
    "status",
    [
        MatchStatus.LIVE,
        MatchStatus.HALFTIME,
        MatchStatus.FINISHED,
        MatchStatus.AWARDED,
        MatchStatus.CANCELLED,
    ],
)
def test_a_settled_or_running_match_is_closed(status: MatchStatus) -> None:
    # Even with a kickoff time still in the future: a status set by somebody
    # watching beats a published time that turned out to be wrong.
    assert not _is_open(match(status=status), NOW)


def test_the_live_flag_closes_it_too() -> None:
    assert not _is_open(match(is_live=True), NOW)


def test_a_postponement_stays_open() -> None:
    # It has not been played, so there is still something to predict — and the
    # new date is usually days away.
    assert _is_open(match(status=MatchStatus.POSTPONED), NOW)


def test_an_undated_fixture_stays_open() -> None:
    # Nothing to have started. Closing it would silently disable the feature
    # for every fixture the federation has not scheduled yet.
    assert _is_open(match(kickoff_at=None), NOW)
