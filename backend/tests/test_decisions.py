"""The reconciliation rule, tested with plain objects and a fixed clock.

This is the one piece of the scraper that can quietly ruin data: get it wrong in
one direction and live scores are stamped over by a stale federation page, get
it wrong in the other and the site never converges on the official result.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models import Match
from app.models.enums import DataSource, MatchStatus
from app.models.match import MANUAL_PRIORITY_WINDOW
from app.scraper.decisions import Action, plan_match

NOW = datetime(2026, 3, 1, 18, 0, tzinfo=timezone.utc)


def match(**kwargs) -> Match:
    """A Match that was never persisted — enough for the rule to read."""
    defaults = dict(
        league_id=1,
        home_team_id=1,
        away_team_id=2,
        matchday=5,
        kickoff_at=NOW - timedelta(hours=2),
        status=MatchStatus.SCHEDULED,
        home_score=None,
        away_score=None,
        is_live=False,
        minute=None,
        referee=None,
        note=None,
        field_id=None,
        external_id=None,
        data_source=DataSource.SCRAPER,
        last_manual_edit_at=None,
        last_scraped_at=None,
    )
    return Match(**{**defaults, **kwargs})


def result(home: int, away: int, status=MatchStatus.FINISHED) -> dict:
    return {"home_score": home, "away_score": away, "status": status}


class TestFreshRows:
    def test_missing_match_is_created(self):
        plan = plan_match(None, result(2, 1), NOW)
        assert plan.action is Action.CREATE
        assert plan.changes["home_score"] == 2

    def test_untouched_match_takes_the_scraped_result(self):
        plan = plan_match(match(), result(2, 1), NOW)
        assert plan.action is Action.UPDATE
        assert plan.changes["home_score"] == 2
        assert plan.changes["status"] is MatchStatus.FINISHED
        assert plan.deferred is False

    def test_identical_result_changes_nothing(self):
        existing = match(home_score=2, away_score=1, status=MatchStatus.FINISHED)
        plan = plan_match(existing, result(2, 1), NOW)
        assert plan.action is Action.UNCHANGED
        assert plan.changes == {}


class TestManualEditWins:
    def test_recent_manual_edit_is_not_overwritten(self):
        existing = match(
            home_score=2,
            away_score=1,
            status=MatchStatus.LIVE,
            is_live=True,
            minute=67,
            data_source=DataSource.MANUAL_LIVE,
            last_manual_edit_at=NOW - timedelta(minutes=1),
        )
        plan = plan_match(existing, result(1, 1), NOW)
        assert plan.deferred is True
        assert "home_score" not in plan.changes
        assert plan.conflict is not None
        assert plan.conflict["scraped"]["home_score"] == 1
        assert plan.conflict["current"]["home_score"] == 2

    def test_scraper_wins_once_the_window_has_passed(self):
        # The clock runs from the *edit*, not from kickoff, so the fixture has
        # to be old enough that the edit itself is outside the window.
        kickoff = NOW - MANUAL_PRIORITY_WINDOW - timedelta(days=1)
        edited_at = kickoff + timedelta(minutes=90)
        assert NOW - edited_at > MANUAL_PRIORITY_WINDOW
        existing = match(
            kickoff_at=kickoff,
            home_score=2,
            away_score=1,
            status=MatchStatus.FINISHED,
            data_source=DataSource.MANUAL_LIVE,
            last_manual_edit_at=edited_at,
        )
        plan = plan_match(existing, result(1, 1), NOW)
        assert plan.deferred is False
        assert plan.changes["home_score"] == 1
        assert plan.changes["is_live"] is False
        assert plan.changes["minute"] is None

    def test_window_restarts_from_a_later_edit(self):
        """An editor correcting a score days later gets the full window again.

        Measuring only from kickoff would let the next scrape undo them minutes
        after they typed it.
        """
        kickoff = NOW - MANUAL_PRIORITY_WINDOW - timedelta(days=3)
        existing = match(
            kickoff_at=kickoff,
            home_score=3,
            away_score=1,
            status=MatchStatus.FINISHED,
            data_source=DataSource.MANUAL_CONFIRMED,
            last_manual_edit_at=NOW - timedelta(minutes=10),
        )
        plan = plan_match(existing, result(1, 1), NOW)
        assert plan.deferred is True
        assert "home_score" not in plan.changes

    def test_repeated_scrapes_do_not_wear_down_the_protection(self):
        """last_scraped_at must not feed the rule.

        It is bumped every run whether or not anything was written, so a rule
        that consulted it would let the very next scrape overrule the editor.
        """
        existing = match(
            home_score=2,
            away_score=1,
            status=MatchStatus.LIVE,
            is_live=True,
            data_source=DataSource.MANUAL_LIVE,
            last_manual_edit_at=NOW - timedelta(minutes=5),
            last_scraped_at=NOW - timedelta(seconds=1),
        )
        plan = plan_match(existing, result(1, 1), NOW)
        assert plan.deferred is True


class TestScraperSilence:
    def test_an_empty_result_never_erases_a_live_score(self):
        existing = match(
            home_score=2,
            away_score=0,
            status=MatchStatus.LIVE,
            is_live=True,
            minute=70,
            data_source=DataSource.MANUAL_LIVE,
            last_manual_edit_at=NOW - timedelta(minutes=2),
        )
        plan = plan_match(existing, {"status": MatchStatus.SCHEDULED}, NOW)
        assert plan.action is Action.UNCHANGED
        assert plan.deferred is False
        assert plan.conflict is None

    def test_an_empty_result_never_erases_a_finished_score(self):
        """Even with nobody protecting it, silence is not a correction."""
        existing = match(
            home_score=3, away_score=0, status=MatchStatus.FINISHED
        )
        plan = plan_match(existing, {"status": MatchStatus.SCHEDULED}, NOW)
        assert plan.changes == {}

    def test_postponement_is_a_statement_and_applies(self):
        existing = match(status=MatchStatus.SCHEDULED)
        plan = plan_match(
            existing,
            {"status": MatchStatus.POSTPONED, "note": "Αναβολή λόγω καιρού"},
            NOW,
        )
        assert plan.changes["status"] is MatchStatus.POSTPONED
        assert plan.changes["note"] == "Αναβολή λόγω καιρού"


class TestUncontestedFields:
    def test_venue_and_kickoff_update_even_while_a_score_is_protected(self):
        existing = match(
            home_score=2,
            away_score=1,
            status=MatchStatus.LIVE,
            is_live=True,
            data_source=DataSource.MANUAL_LIVE,
            last_manual_edit_at=NOW - timedelta(minutes=1),
            field_id=None,
        )
        plan = plan_match(existing, {**result(1, 1), "field_id": 9}, NOW)
        assert plan.deferred is True
        assert plan.changes == {"field_id": 9}

    def test_a_missing_value_does_not_blank_a_known_one(self):
        """Walkover rows omit the venue; that is not news that the venue is gone."""
        existing = match(field_id=9, referee="ΠΑΠΠΑΣ Κ.")
        plan = plan_match(
            existing,
            {"field_id": None, "referee": None, "status": MatchStatus.SCHEDULED},
            NOW,
        )
        assert plan.changes == {}


class TestConflictReporting:
    def test_no_conflict_when_the_scraper_is_merely_ahead(self):
        """A protected row with no score yet is lag, not disagreement."""
        existing = match(
            status=MatchStatus.SCHEDULED,
            data_source=DataSource.MANUAL_LIVE,
            last_manual_edit_at=NOW - timedelta(minutes=1),
        )
        plan = plan_match(existing, result(2, 1), NOW)
        assert plan.deferred is True
        assert plan.conflict is None

    def test_conflict_records_both_sides(self):
        existing = match(
            home_score=0,
            away_score=0,
            status=MatchStatus.FINISHED,
            data_source=DataSource.MANUAL_CONFIRMED,
            last_manual_edit_at=NOW - timedelta(minutes=30),
        )
        plan = plan_match(existing, result(3, 0), NOW)
        assert plan.conflict == {
            "scraped": {"home_score": 3, "away_score": 0, "status": "finished"},
            "current": {
                "home_score": 0,
                "away_score": 0,
                "status": "finished",
                "data_source": "manual_confirmed",
                "last_manual_edit_at": (NOW - timedelta(minutes=30)).isoformat(),
            },
        }


@pytest.mark.parametrize(
    "kickoff_at", [None], ids=["undated fixture"]
)
def test_undated_fixture_stays_protected_forever(kickoff_at):
    """With no kickoff there is nothing to age out from, so the human keeps it."""
    existing = match(
        kickoff_at=kickoff_at,
        home_score=1,
        away_score=1,
        status=MatchStatus.FINISHED,
        last_manual_edit_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    plan = plan_match(existing, result(2, 2), NOW)
    assert plan.deferred is True
