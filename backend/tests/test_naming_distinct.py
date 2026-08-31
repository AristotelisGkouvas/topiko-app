"""Telling two clubs apart from one club misspelt.

Whole-name similarity is the wrong measure when clubs share a word. In a
federation where nearly every club is named for the same city, two unrelated
sides score 89% on a word neither is named after — and the guard against typos
then refuses both. That cost 37 of 237 competitions part of their fixtures.
"""

from __future__ import annotations

import pytest

from app.scraper import naming


@pytest.mark.parametrize(
    "a, b",
    [
        # ΑΙΑ vs ΑΤΛΑ is 57%; the 89% comes from ΙΩΑΝΝΙΝΩΝ, shared by 28 clubs.
        ("ΑΙΑΣ ΙΩΑΝΝΙΝΩΝ", "ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ"),
        # ΕΡΜΗ vs ΑΣΤΕΡΑ is 40%.
        ("Α.Σ.ΕΡΜΗΣ ΙΩΑΝΝΙΝΩΝ", "ΑΣΤΕΡΑΣ ΙΩΑΝΝΙΝΩΝ"),
    ],
)
def test_different_words_mean_different_clubs(a, b):
    assert naming.distinct_clubs(a, b)


class TestRefusalsThatMustSurvive:
    def test_a_misspelling_stays_a_question_for_a_human(self):
        """ΘΥΕΛΑ against ΘΥΕΛΛΑ is 91% — one letter, not another club."""
        assert not naming.distinct_clubs("ΘΥΕΛΑ ΚΑΤΣΙΚΑΣ", "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ")

    def test_a_spelled_out_abbreviation_is_undecidable(self):
        """One name may be spelling out what the other abbreviates, or they may
        be two clubs from one village. Nothing in the text says which."""
        assert not naming.distinct_clubs("ΑΙΑΣ ΠΕΡΙΒΛΕΠΤΟΥ", "Π.Α.Σ.ΠΕΡΙΒΛΕΠΤΟΥ")

    def test_a_dropped_prefix_is_not_a_second_club(self):
        assert not naming.distinct_clubs("ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ", "Α.Ο.Ν.ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ")

    def test_word_order_is_not_a_second_club(self):
        assert not naming.distinct_clubs("Α.Σ.ΑΧΕΡΩΝ ΡΩΜΑΝΟΥ", "ΑΧΕΡΩΝ ΡΩΜΑΝΟΥ Α.Σ.")

    def test_two_villages_under_one_first_word(self):
        """ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ and ΘΥΕΛΛΑ ΕΛΕΟΥΣΑΣ are already distinct clubs, and
        naming them so is right — they differ by a whole village."""
        assert naming.distinct_clubs("ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ", "ΘΥΕΛΛΑ ΕΛΕΟΥΣΑΣ")
