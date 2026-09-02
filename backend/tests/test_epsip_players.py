"""Parsing the register, the leaderboards and the suspension list.

Fixtures are real pages from epsip.gr: page 1 of the player register, and the
statistics and suspensions of the 2025-26 Α Κατηγορία.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.scraper.sources import get_source

FIXTURES = Path(__file__).parent / "fixtures" / "epsip"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def source():
    return get_source("epsip")


@pytest.fixture(scope="module")
def players(source):
    return source.parse_players(read("players_page1.html"))


@pytest.fixture(scope="module")
def stats(source):
    return source.parse_stats(read("display_stats_300.html"))


@pytest.fixture(scope="module")
def suspensions(source):
    return source.parse_forfeits(read("display_forfeits_300.html"))


class TestRegister:
    def test_a_full_page_is_read(self, players):
        assert len(players) == 300

    def test_every_player_carries_the_source_id(self, players):
        assert all(p.external_id.isdigit() for p in players)

    def test_ids_are_unique_within_a_page(self, players):
        assert len({p.external_id for p in players}) == len(players)

    def test_names_and_birth_years(self, players):
        first = players[0]
        assert first.name == "ABDARAMAN ABDALLAH"
        assert first.birth_year == 1986
        assert first.external_id == "11034"

    def test_the_page_count_comes_from_the_pager(self, source):
        assert source.parse_player_pages(read("players_page1.html")) == 50

    def test_a_page_without_a_pager_is_the_only_page(self, source):
        assert source.parse_player_pages("<html></html>") == 1


class TestLeaderboards:
    def test_the_five_boards_merge_into_one_row_per_player(self, stats):
        assert len(stats) == 41
        assert len({s.player_external_id for s in stats}) == len(stats)

    def test_the_top_scorer(self, stats):
        top = max(stats, key=lambda s: s.goals or 0)
        assert top.player_name == "ΣΚΑΝΔΑΛΗΣ ΧΡΗΣΤΟΣ"
        assert top.goals == 23
        assert top.team_name == "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ"
        # Both ids are printed, so neither club nor player needs name matching.
        assert top.player_external_id == "7905"
        assert top.team_external_id == "91"

    def test_a_player_placing_in_two_boards_keeps_both(self, stats):
        angelis = next(s for s in stats if s.player_external_id == "11672")
        assert (angelis.goals, angelis.yellow_cards) == (20, 7)

    def test_minutes_lose_their_apostrophe(self, stats):
        assert any(s.minutes == 1980 for s in stats)

    def test_absence_from_a_board_is_unknown_not_zero(self, stats):
        """The boards are top-ten lists. A scorer missing from the card table
        may have no cards, or fewer than the tenth-placed player — and those
        are different facts."""
        veltsistas = next(s for s in stats if s.player_external_id == "656")
        assert veltsistas.goals == 13
        assert veltsistas.yellow_cards is None
        assert veltsistas.red_cards is None

    def test_own_goals_are_read_separately_from_goals(self, stats):
        geoldasis = next(s for s in stats if s.player_external_id == "928")
        assert geoldasis.own_goals == 1
        assert geoldasis.goals is None


class TestSuspensions:
    def test_every_row_is_read(self, suspensions):
        assert len(suspensions) == 49

    def test_a_ban_carries_its_match(self, suspensions):
        first = suspensions[0]
        assert first.player_name == "ΝΑΘΑΝΑΗΛ ΝΙΚΗΤΑΣ"
        assert first.player_external_id == "5808"
        assert first.matches == 1
        assert first.matchday == 25
        assert first.decided_on == date(2026, 5, 10)
        # The game_id ties the ban to a fixture we already hold.
        assert first.match_external_id == "24541"

    def test_matchdays_lose_their_ending(self, suspensions):
        assert all(
            s.matchday is None or 1 <= s.matchday <= 40 for s in suspensions
        )

    def test_dates_are_two_digit_years_read_as_this_century(self, suspensions):
        assert all(
            s.decided_on is None or s.decided_on.year >= 2000
            for s in suspensions
        )

    def test_one_player_can_be_banned_more_than_once(self, suspensions):
        """The list is per offence, not per player, so ids repeat."""
        ids = [s.player_external_id for s in suspensions]
        assert len(ids) > len(set(ids))


def test_the_suspension_index_lists_one_link_per_competition(source):
    html = read("forfeits_index.html")
    assert "display_player_forfeits.php?league_id=328" in html
