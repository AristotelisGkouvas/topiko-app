"""Kickoff times land in UTC from Greek wall-clock.

Worth its own test because the failure is invisible: an hour is a plausible
kickoff time, so a wrong offset reads as a real fixture rather than as a bug,
and the reader only finds out at the ground.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone

import pytest

from app.scraper.sync import _to_utc


@pytest.mark.parametrize(
    "day, clock, expected",
    [
        # Winter, +02:00. The whole middle of the season sits here.
        (date(2025, 11, 23), time(15, 0), datetime(2025, 11, 23, 13, 0)),
        # Summer time, +03:00 — the opening weeks of a season and the closing
        # ones both fall inside it, which a fixed offset got wrong by an hour.
        (date(2025, 9, 21), time(17, 0), datetime(2025, 9, 21, 14, 0)),
        (date(2026, 4, 12), time(17, 0), datetime(2026, 4, 12, 14, 0)),
        # The last weekend on summer time, and the first off it.
        (date(2025, 10, 25), time(16, 0), datetime(2025, 10, 25, 13, 0)),
        (date(2025, 10, 26), time(16, 0), datetime(2025, 10, 26, 14, 0)),
    ],
)
def test_greek_wall_clock_becomes_utc(day, clock, expected):
    assert _to_utc(day, clock) == expected.replace(tzinfo=timezone.utc)


def test_a_fixture_with_no_time_is_dated_midnight_local():
    assert _to_utc(date(2025, 11, 23), None) == datetime(
        2025, 11, 22, 22, 0, tzinfo=timezone.utc
    )


def test_a_fixture_with_no_date_has_no_kickoff():
    assert _to_utc(None, time(17, 0)) is None
