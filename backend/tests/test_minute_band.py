"""Which 15-minute band a goal minute falls in."""

from app.api.v1.public import minute_band


def test_bands():
    assert [minute_band(m) for m in (1, 15, 16, 30, 31, 45, 47)] == [0, 0, 1, 1, 2, 2, 3]
    assert [minute_band(m) for m in (60, 61, 75, 76, 90, 95)] == [3, 4, 4, 5, 5, 5]
    assert minute_band(0) == 0
