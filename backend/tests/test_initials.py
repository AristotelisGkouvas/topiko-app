"""Crest monograms.

Two letters is all the crest has room for, and in this federation almost every
club name opens with the same handful of abbreviations. Getting this wrong is
not cosmetic: a table where nine crests read "ΑΕ" is unreadable.
"""

from __future__ import annotations

import pytest

from app.scraper.sync import _initials


@pytest.mark.parametrize(
    "name, expected",
    [
        # The abbreviation is shared; the village is not.
        ("Α.Ε.Δ.ΠΩΓΩΝΑΤΟΣ", "ΠΩ"),
        ("Α.Ο.ΖΩΟΔΟΧΟΣ", "ΖΩ"),
        ("Π.Α.Σ.ΜΕΤΣΟΒΟΥ", "ΜΕ"),
        ("Α.Ο.Ν.ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ", "ΣΥ"),
        # A founding year identifies nobody.
        ("Α.Ε. ΓΙΑΝΝΕΝΑ 2004", "ΓΙ"),
        ("ΗΦΑΙΣΤΟΣ ΑΒΓΟΥ 2020", "ΑΒ"),
        ("Α.Ο.ΣΤΑΥΡΑΚΙΟΥ 2009", "ΣΤ"),
        # Two clubs called ΘΥΕΛΛΑ: only the second word separates them.
        ("ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ", "ΚΑ"),
        ("ΘΥΕΛΛΑ ΕΛΕΟΥΣΑΣ", "ΕΛ"),
        # A plain one-word name is its own monogram.
        ("ΑΤΛΑΣ", "ΑΤ"),
        # Accents are dropped, because the crest is set in capitals.
        ("Πίνδος Κόνιτσας", "ΚΟ"),
    ],
)
def test_monogram(name, expected):
    assert _initials(name) == expected


def test_a_name_of_nothing_but_abbreviations_still_yields_something():
    """No word survives the filter, so fall back rather than return ''."""
    assert _initials("Α.Ο.") == "ΑΟ"


def test_the_monogram_is_never_empty():
    assert _initials("") == "??"
