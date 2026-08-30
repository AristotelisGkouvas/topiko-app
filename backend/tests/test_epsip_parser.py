"""Parser tests against real pages saved from epsip.gr.

Fixtures rather than the live site: the parser must be testable offline, and
these files are also the tripwire for the day the site changes shape.
"""

from __future__ import annotations

from datetime import date, time
from pathlib import Path

import pytest

from app.models.enums import MatchStatus
from app.scraper.sources.epsip import EpsipSource

FIXTURES = Path(__file__).parent / "fixtures" / "epsip"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def source() -> EpsipSource:
    return EpsipSource()


@pytest.fixture(scope="module")
def schedule(source: EpsipSource):
    return source.parse_schedule(fixture("display_schedule_300.html"))


class TestSchedule:
    def test_reads_the_whole_season(self, schedule):
        # 14 clubs, double round robin: 26 matchdays of 7 fixtures.
        assert len(schedule) == 182
        assert {m.matchday for m in schedule} == set(range(1, 27))

    def test_first_fixture(self, schedule):
        first = schedule[0]
        assert first.matchday == 1
        assert first.home_team == "Α.Ο. ΑΝΑΤΟΛΗΣ"
        assert first.away_team == "Α.Ε. ΚΡΑΝΟΥΛΑΣ"
        assert first.venue == "ΑΝΑΤΟΛΗΣ"
        assert first.kickoff_date == date(2025, 9, 20)
        assert first.kickoff_time == time(17, 0)
        assert (first.home_score, first.away_score) == (2, 0)
        assert first.status is MatchStatus.FINISHED
        assert first.referee is not None and "ΔΑΔΑΝΗΣ" in first.referee

    def test_walkovers_are_awarded_not_finished(self, schedule):
        awarded = [m for m in schedule if m.status is MatchStatus.AWARDED]
        # "3-0 α.α." — the withdrawn club forfeits the rest of its season.
        assert len(awarded) == 15
        assert all(
            {m.home_score, m.away_score} == {0, 3} for m in awarded
        )

    def test_every_fixture_names_two_distinct_clubs(self, schedule):
        assert all(m.home_team and m.away_team for m in schedule)
        assert all(m.home_team != m.away_team for m in schedule)

    def test_no_club_name_carries_a_corrupt_character(self, schedule):
        # The cross-table headers split names mid-UTF-8 sequence; the schedule
        # page must not, or team resolution would silently break.
        names = {m.home_team for m in schedule} | {m.away_team for m in schedule}
        assert not [n for n in names if "�" in n]
        assert len(names) == 14

    def test_fixture_keys_are_unique(self, schedule):
        assert len({m.key for m in schedule}) == len(schedule)

    def test_external_ids_are_partial_but_unique(self, schedule):
        """game_id is enrichment, not identity.

        The site links a fixture only once a match report exists behind it, so
        a quarter of rows have no id. Anything keyed on game_id alone would
        silently drop those matches.
        """
        ids = [m.external_id for m in schedule if m.external_id]
        assert 0 < len(ids) < len(schedule)
        # Whatever ids do appear must be unique, or they are worthless as keys.
        assert len(set(ids)) == len(ids)

    def test_unlinked_fixtures_still_parse_completely(self, schedule):
        """A row with no anchor must yield the same data as a linked one."""
        unlinked = [m for m in schedule if m.external_id is None]
        assert unlinked, "fixture file no longer exercises the unlinked case"
        assert all(m.home_team and m.away_team for m in unlinked)
        assert all(m.kickoff_date is not None for m in unlinked)
        assert all(m.is_played for m in unlinked)

    def test_venue_ids_are_captured(self, schedule):
        """field_id is how a venue is resolved; the printed name is a label."""
        played = [m for m in schedule if m.status is not MatchStatus.AWARDED]
        assert all(m.venue for m in played)
        assert all(m.venue_external_id for m in played)

    def test_walkovers_have_no_venue(self, schedule):
        """A forfeited match was never assigned a ground, and the site leaves
        the cell empty. Inventing one would put a fixture on a pitch where
        nobody turned up."""
        awarded = [m for m in schedule if m.status is MatchStatus.AWARDED]
        assert sum(1 for m in awarded if m.venue is None) == 13


class TestStandings:
    @pytest.fixture(scope="class")
    def standings(self, source: EpsipSource):
        return source.parse_standings(fixture("display_ranking_300.html"))

    def test_reads_every_club_in_order(self, standings):
        assert len(standings) == 14
        assert [s.position for s in standings] == list(range(1, 15))
        assert standings[0].team == "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ"
        assert standings[0].points == 63

    def test_negative_points_survive(self, standings):
        """A withdrawn club is published with its penalty already applied."""
        last = standings[-1]
        assert last.team == "Π.Α.Σ.ΜΕΤΣΟΒΟΥ"
        assert last.points == -9
        assert (last.won, last.drawn, last.lost) == (0, 0, 26)

    def test_implied_points_expose_the_deduction(self, standings):
        last = standings[-1]
        # 0 points earned on the pitch, -9 published: a 9-point deduction that
        # the site never states outright.
        assert last.implied_points == 0
        assert last.points - last.implied_points == -9

    def test_results_and_table_agree(self, source, standings, schedule):
        """The scraped table must match what the scraped results imply.

        This is the check that catches a parser reading the wrong column: two
        independent pages have to tell the same story.
        """
        played = [m for m in schedule if m.is_played]
        goals_for: dict[str, int] = {}
        goals_against: dict[str, int] = {}
        for m in played:
            goals_for[m.home_team] = goals_for.get(m.home_team, 0) + m.home_score
            goals_for[m.away_team] = goals_for.get(m.away_team, 0) + m.away_score
            goals_against[m.home_team] = (
                goals_against.get(m.home_team, 0) + m.away_score
            )
            goals_against[m.away_team] = (
                goals_against.get(m.away_team, 0) + m.home_score
            )

        from app.scraper.naming import normalize

        by_key = {normalize(k): v for k, v in goals_for.items()}
        against_by_key = {normalize(k): v for k, v in goals_against.items()}
        for row in standings:
            key = normalize(row.team)
            assert by_key[key] == row.goals_for, row.team
            assert against_by_key[key] == row.goals_against, row.team


class TestDiscovery:
    def test_league_index_lists_competitions_with_categories(self, source):
        leagues = source.parse_league_index(fixture("ranking_index.html"))
        by_id = {l.external_id: l for l in leagues}
        assert "300" in by_id
        assert by_id["300"].category == "Α Κατηγορία"
        assert "Α ΕΡΑΣΙΤΕΧΝΙΚΗ" in by_id["300"].name
        # Youth competitions are listed alongside the senior ones.
        assert {l.category for l in leagues} >= {"Α Κατηγορία", "Β Κατηγορία"}

    def test_periods_map_season_to_id(self, source):
        periods = source.parse_periods(fixture("ranking_index.html"))
        assert periods["2025-2026"] == "12"
        assert periods["2014-2015"] == "1"

    def test_teams_carry_stable_ids(self, source):
        teams = source.parse_teams(fixture("teams.html"))
        assert len(teams) > 50
        assert teams["204"] == "Α.Ε. ΚΡΑΝΟΥΛΑΣ"

    def test_fields_carry_stable_ids(self, source):
        fields = source.parse_fields(fixture("fields_map.html"))
        assert fields
        assert all(k.isdigit() for k in fields)


class TestScheduleTeamsResolveAgainstCatalog:
    def test_every_scheduled_club_matches_a_catalogued_club(
        self, source, schedule
    ):
        """The names in the fixture list must resolve to teams.php entries.

        If this fails, the scraper would be inventing clubs on every run.
        """
        from app.scraper.naming import find, index

        catalog = index(
            {name: team_id for team_id, name in source.parse_teams(fixture("teams.html")).items()}
        )
        names = {m.home_team for m in schedule} | {m.away_team for m in schedule}
        unresolved = [n for n in names if (r := find(n, catalog)) is None or not r.exact]
        assert unresolved == []
