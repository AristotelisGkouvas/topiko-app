"""Which weekend "this weekend" means, by day of the week."""

from datetime import date

from app.api.v1.public import weekend_around

FRI, MON = date(2026, 9, 25), date(2026, 9, 28)


def test_midweek_looks_ahead():
    assert weekend_around(date(2026, 9, 22)) == (FRI, MON)  # Tuesday
    assert weekend_around(date(2026, 9, 24)) == (FRI, MON)  # Thursday


def test_weekend_and_monday_mean_the_one_under_way():
    for day in (25, 26, 27, 28):
        assert weekend_around(date(2026, 9, day)) == (FRI, MON)
