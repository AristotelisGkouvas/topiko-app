"""Squad letters, the one distinction fuzzy matching destroys.

In the youth categories a club enters several teams — "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ Β",
"ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ Γ" — and they play each other. Those names score 93% against
the parent club, so the near-miss guard that protects against misspellings reads
them as the same team and refuses the fixture. A whole division's results go
missing that way: in the 2015-16 Προπαίδων Β όμιλος the published table counted
22 matches per club where the fixtures we could attribute came to 6.
"""

from __future__ import annotations

import pytest

from app.scraper import naming


@pytest.mark.parametrize(
    "name, expected",
    [
        ("ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ Β", "Β"),
        ("Π.Α.Σ.ΓΙΑΝΝΙΝΑ Δ", "Δ"),
        ("ΑΠΣ ΟΙ ΤΙΓΡΕΙΣ Γ", "Γ"),
        # Greek numbers the sixth squad ΣΤ, with two characters.
        ("ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ ΣΤ", "ΣΤ"),
        ("ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ Ζ", "Ζ"),
        # A dot separates it just as well as a space.
        ("ΜΠΑΣ Α.ΕΛΠΙΔΕΣ ΙΩΑΝ. Β", "Β"),
        # Accents are irrelevant to the marker.
        ("Θύελλα Κατσικάς β", "Β"),
        # No marker at all.
        ("ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ", None),
        ("Α.Ο.ΖΩΟΔΟΧΟΣ", None),
        # A founding year is not a squad letter.
        ("Α.Ε. ΓΙΑΝΝΕΝΑ 2004", None),
        # Nor is the tail of a word.
        ("ΠΙΝΔΟΣ ΚΟΝΙΤΣΑΣ", None),
    ],
)
def test_squad_letter(name, expected):
    assert naming.squad(name) == expected


class TestSameSquad:
    def test_a_reserve_team_is_not_its_parent(self):
        assert not naming.same_squad("ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ Β", "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ")

    def test_two_reserve_teams_are_not_each_other(self):
        assert not naming.same_squad("ΘΥΕΛΛΑ ΕΛΕΟΥΣΑΣ Β", "ΘΥΕΛΛΑ ΕΛΕΟΥΣΑΣ Γ")

    def test_the_sixth_squad_is_not_its_parent(self):
        assert not naming.same_squad("ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ ΣΤ", "ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ")

    def test_the_sixth_squad_is_not_the_fifth(self):
        assert not naming.same_squad("ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ ΣΤ", "ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ Ε")

    def test_the_same_squad_of_the_same_club(self):
        assert naming.same_squad("ΑΣΤΕΡΑΣ ΙΩΑΝΝΙΝΩΝ Β", "ΑΣΤΕΡΑΣ ΙΩΑΝΝΙΝΩΝ  Β")

    def test_a_spelling_variant_stays_a_spelling_variant(self):
        """The guard must still catch what it was built for."""
        assert naming.same_squad("ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ", "Α.Ο.Ν.ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ")

    def test_two_unrelated_clubs_are_still_a_question_for_a_human(self):
        """ΑΙΑΣ and ΑΤΛΑΣ score 89%; neither carries a squad letter, so this
        stays a refusal rather than becoming a silent new club."""
        assert naming.same_squad("ΑΙΑΣ ΙΩΑΝΝΙΝΩΝ", "ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ")
