"""Crest monograms.

Two letters is all the crest has room for, and in this federation almost every
club name opens with the same handful of abbreviations. Getting this wrong is
not cosmetic: a table where nine crests read "ΑΕ" is unreadable.
"""

from __future__ import annotations

import pytest

from app.scraper.naming import monogram


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
        # Squads of one club play each other, so one badge cannot serve both.
        ("ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ Β", "ΙΩΒ"),
        ("ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ ΣΤ", "ΙΩΣ"),
    ],
)
def test_monogram(name, expected):
    assert monogram(name) == expected


def test_a_name_of_nothing_but_abbreviations_still_yields_something():
    """No word survives the filter, so fall back rather than return ''."""
    assert monogram("Α.Ο.") == "ΑΟ"


def test_the_monogram_is_never_empty():
    assert monogram("") == "??"
