"""How often the scheduler looks, and why.

Worth testing because both ways of getting it wrong are silent. Too slow and
the live scores on the site are simply late, which reads as the federation
being slow to publish. Too fast and nothing visibly breaks at all — the cost
lands on somebody else's server, and the first signal is a federation blocking
the user agent.
"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.scraper.schedule import choose_delay


def test_quiet_week_waits_the_long_interval() -> None:
    delay, reason = choose_delay(pending=0, failures=0)
    assert delay == settings.scraper_idle_interval_seconds
    assert "καμία σέντρα" in reason


def test_a_fixture_in_its_window_switches_to_the_short_interval() -> None:
    delay, reason = choose_delay(pending=1, failures=0)
    assert delay == settings.scraper_live_interval_seconds
    assert "1 αγώνες" in reason


def test_the_live_interval_does_not_scale_with_how_many_are_playing() -> None:
    # Twenty kickoffs at three o'clock are one page fetch, not twenty.
    assert choose_delay(1, 0)[0] == choose_delay(20, 0)[0]


@pytest.mark.parametrize("failures, expected_multiplier", [(1, 2), (2, 4), (3, 8)])
def test_backoff_doubles_per_failure(failures: int, expected_multiplier: int) -> None:
    delay, reason = choose_delay(pending=0, failures=failures)
    assert delay == settings.scraper_live_interval_seconds * expected_multiplier
    assert "backoff" in reason


def test_backoff_stops_at_the_ceiling() -> None:
    # Unbounded doubling reaches days, and a source that was down for an hour
    # would then stay unread for the rest of the season.
    assert choose_delay(0, 40)[0] == settings.scraper_max_backoff_seconds


def test_backoff_outranks_a_match_in_progress() -> None:
    # The tempting mistake: matches are on, so keep polling fast. But a failed
    # run means the source is unreachable or broken, and the fast cadence then
    # turns one outage into a few hundred requests against it.
    live, _ = choose_delay(pending=5, failures=0)
    failing, reason = choose_delay(pending=5, failures=2)
    assert failing > live
    assert "backoff" in reason
