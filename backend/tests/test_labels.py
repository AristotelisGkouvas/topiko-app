"""Turning published competition titles into tab labels.

Every input here is a real title from epsip.gr. The bar to clear is that two
competitions running in the same season never come out with the same label —
that is the bug this exists to fix, where four tabs all read "Κ 10".
"""

from __future__ import annotations

import pytest

from app.models.enums import LeagueKind
from app.scraper.labels import describe_league


class TestOpenAge:
    def test_plain_category(self):
        got = describe_league("Α ΕΡΑΣΙΤΕΧΝΙΚΗ ΚΑΤΗΓΟΡΙΑ 2025-2026")
        assert got.label == "Α Κατηγορία"
        assert got.tier == 1
        assert got.age_group is None

    def test_sponsor_is_dropped(self):
        got = describe_league("Hall of Brands Ε.Π.Σ.ΗΠ. Α Κατηγορια 2016-17")
        assert got.label == "Α Κατηγορία"
        assert got.tier == 1

    def test_two_groups_of_one_category_differ(self):
        a = describe_league("Γ ΕΡΑΣΙΤΕΧΝΙΚΗ ΚΑΤΗΓΟΡΙΑ Α ΟΜΙΛΟΣ 2025-2026")
        b = describe_league("Γ ΕΡΑΣΙΤΕΧΝΙΚΗ ΚΑΤΗΓΟΡΙΑ Β ΟΜΙΛΟΣ 2025-2026")
        assert (a.label, b.label) == ("Γ Κατηγορία Α", "Γ Κατηγορία Β")
        assert a.tier == b.tier == 3

    def test_numbered_groups(self):
        got = describe_league("Β Κατηγορία 1ος Όμιλος")
        assert got.label == "Β Κατηγορία 1"

    def test_maison_with_lowercase_omilos(self):
        got = describe_league("MAISON Ε.Π.Σ.ΗΠ. Β Κατηγορια Α ομιλος 2018-19")
        assert got.label == "Β Κατηγορία Α"


class TestYouth:
    @pytest.mark.parametrize(
        "name, label",
        [
            # The same competition, spelled three ways across three seasons.
            ("ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ10 Α", "Κ10 Α"),
            ("ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ 10 Α", "Κ10 Α"),
            ("ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ10Α", "Κ10 Α"),
            ("ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ12 Δ", "Κ12 Δ"),
            ("ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ13", "Κ13"),
            # Latin K, and an accent the site puts on capitals.
            ("ΤΕΛΙΚΌΣ K16 ΠΕΡΙΌΔΟΥ 2021-2022", "Τελικός Κ16"),
        ],
    )
    def test_age_and_section(self, name, label):
        assert describe_league(name).label == label

    def test_four_k10_groups_are_four_labels(self):
        names = [f"ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ10 {g}" for g in "ΑΒΓΔ"]
        labels = [describe_league(n).label for n in names]
        assert labels == ["Κ10 Α", "Κ10 Β", "Κ10 Γ", "Κ10 Δ"]
        assert len(set(labels)) == 4

    def test_age_group_in_words(self):
        got = describe_league('Πρωταθλημα Προπαιδων Β "Στέφανος Γεράσης"')
        assert got.age_group == "Προπαίδων"
        assert got.label == "Προπαίδων Β"

    def test_juniors(self):
        assert describe_league("Κατηγορια Τζουνιορς Γ 2016-17").label == "Τζούνιορς Γ"

    def test_phase_is_part_of_the_identity(self):
        """"Κ14 Β ΦΑΣΗ Α ΓΚΡΟΥΠ" is the Α group of the *second* stage.
        Calling it "Κ14 Α" would collide with the Α group of the first."""
        got = describe_league("ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ ΑΓΩΝΕΣ Κ14 Β ΦΑΣΗ Α ΓΚΡΟΥΠ")
        assert got.age_group == "Κ14"
        assert got.label == "Κ14 Β' φάση Α"

    def test_youth_is_not_given_a_tier(self):
        """Κ10 Β must not be read as "Β Κατηγορία"."""
        assert describe_league("ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ10 Β").tier is None


class TestPlayoffs:
    def test_play_off(self):
        got = describe_league("PLAY OFF Α ΚΑΤΗΓΟΡΙΑΣ")
        assert got.kind is LeagueKind.PLAYOFF
        assert got.label.startswith("Play-off")

    def test_play_out_keeps_its_group(self):
        got = describe_league("PLAY OUT Β ΚΑΤΗΓΟΡΙΑΣ Β ΟΜΙΛΟΥ 2021-22")
        assert got.kind is LeagueKind.PLAYOFF
        assert got.label == "Play-out Β Κατ. Β"

    def test_promotion_playoff_in_greek(self):
        got = describe_league("Πλει οφ ανοδου Β ερασιτεχνικης Α ομίλου")
        assert got.kind is LeagueKind.PLAYOFF

    def test_one_age_group_can_run_three_knockouts_at_once(self):
        """Κ16 played a final, a third-place match and a barrage in 2021-22.
        Folding all three into "Play-off" put three identical tabs in a row."""
        names = [
            "Αγωνας μπαραζ κατηγοριας Κ16",
            "ΜΙΚΡΌΣ ΤΕΛΙΚΌΣ K16 ΠΕΡΙΌΔΟΥ 2021-2022",
            "ΤΕΛΙΚΌΣ K16 ΠΕΡΙΌΔΟΥ 2021-2022",
        ]
        labels = [describe_league(n).label for n in names]
        assert labels == ["Μπαράζ Κ16", "Μικρός τελικός Κ16", "Τελικός Κ16"]
        assert len(set(labels)) == 3


class TestWomen:
    def test_women(self):
        assert describe_league("Γυναικείο Πρωτάθλημα").label == "Γυναικών"


def test_an_unrecognised_title_keeps_its_own_words():
    """Never invent a label: a truncated real title beats a wrong guess."""
    got = describe_league("Κάτι εντελώς αλλιώτικο")
    assert got.label.startswith("Κάτι")
