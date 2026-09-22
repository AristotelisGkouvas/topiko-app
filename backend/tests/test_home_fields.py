"""Which ground a club is said to play at.

Worth a test because being wrong here is quiet and specific: the club page
simply shows another village's ground, with its surface and its capacity, and
reads as authoritative while doing it.
"""

from __future__ import annotations

from app.services.home_fields import MAJORITY, pick_home_field


def test_a_club_that_always_plays_at_one_ground() -> None:
    assert pick_home_field([7, 7, 7, 7]) == 7


def test_the_odd_fixture_elsewhere_does_not_move_it() -> None:
    # A postponed match played on a neighbour's pitch is normal.
    assert pick_home_field([7, 7, 7, 7, 7, 9]) == 7


def test_a_club_split_between_two_grounds_gets_none() -> None:
    # Naming either would put a wrong address on the page.
    assert pick_home_field([7, 7, 9, 9]) is None


def test_a_plurality_short_of_a_majority_is_not_enough() -> None:
    assert pick_home_field([7, 7, 9, 11, 13]) is None


def test_exactly_a_majority_counts() -> None:
    assert MAJORITY == 0.5
    assert pick_home_field([7, 7, 9, 11]) == 7


def test_no_fixtures_means_no_answer() -> None:
    assert pick_home_field([]) is None


def test_a_single_fixture_is_taken_at_face_value() -> None:
    # A newly promoted club has one home match on file and it is still the
    # best answer available; the alternative is showing nothing all season.
    assert pick_home_field([7]) == 7
