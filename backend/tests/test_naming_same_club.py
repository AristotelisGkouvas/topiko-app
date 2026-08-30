"""The two spelling differences that are safe to resolve without a human.

Measured cost of not doing so: in the 2017-18 Γ Κατηγορία Β Όμιλος the schedule
page lists 156 fixtures, and 46 of them involved a club whose name was written
one way in the register and another in the fixture list. They were dropped.
"""

from __future__ import annotations

import pytest

from app.scraper import naming


class TestWordOrder:
    def test_prefix_moved_to_the_end(self):
        assert naming.same_club("Α.Σ.ΑΧΕΡΩΝ ΡΩΜΑΝΟΥ", "ΑΧΕΡΩΝ ΡΩΜΑΝΟΥ Α.Σ.")

    def test_spacing_and_dots_do_not_matter(self):
        assert naming.same_club("Α.Ε. ΚΡΑΝΟΥΛΑΣ", "Α.Ε.ΚΡΑΝΟΥΛΑ")


class TestMissingPrefix:
    def test_club_type_prefix_dropped(self):
        assert naming.same_club("ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ", "Α.Ο.Ν.ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ")

    def test_a_bare_prefix_matches_nothing(self):
        """Α.Ο. and Α.Ε. share their Α and differ only in single letters, but
        nothing substantive is common, so they are not the same club."""
        assert not naming.same_club("Α.Ο.", "Α.Ε.")

    def test_two_clubs_of_one_village_are_still_distinct(self):
        """Α.Ο. and Α.Ε. Ζίτσας differ only in single letters, exactly like the
        dropped-prefix case. What separates them is that neither name contains
        the other: the letters are swapped, not omitted."""
        assert not naming.same_club("Α.Ο.ΖΙΤΣΑΣ", "Α.Ε.ΖΙΤΣΑΣ")

    def test_a_swap_is_not_an_omission_even_with_a_long_prefix(self):
        assert not naming.same_club("Π.Α.Σ.ΚΑΣΤΡΟΥ", "Α.Ο.ΚΑΣΤΡΟΥ")

    def test_a_different_word_is_a_different_club(self):
        assert not naming.same_club("ΑΙΑΣ ΙΩΑΝΝΙΝΩΝ", "ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ")

    def test_same_first_word_different_village(self):
        assert not naming.same_club("ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ", "ΘΥΕΛΛΑ ΕΛΕΟΥΣΑΣ")


class TestSquadLettersAreNeverCrossed:
    def test_a_reserve_side_is_not_absorbed_into_its_parent(self):
        assert not naming.same_club("ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ Β", "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ")

    def test_two_reserve_sides_stay_apart(self):
        assert not naming.same_club("ΑΠΣ ΟΙ ΤΙΓΡΕΙΣ Β", "ΑΠΣ ΟΙ ΤΙΓΡΕΙΣ Γ")

    def test_the_rules_still_apply_within_one_squad(self):
        """A prefix may be dropped from a B side too, as long as both are B."""
        assert naming.same_club("ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ Β", "Α.Ο.Ν.ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ Β")


@pytest.mark.parametrize("name", ["", "   ", "."])
def test_empty_names_match_nothing(name):
    assert not naming.same_club(name, "Α.Ο.ΖΩΟΔΟΧΟΣ")
