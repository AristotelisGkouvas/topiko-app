"""Search is folded before comparing; greeklish is read as Greek."""

from app.services.search import fold


def test_accents_and_case():
    assert fold("Ζίτσας") == "ζιτσασ"


def test_greeklish():
    assert fold("zitsa") == "ζιτσα"
    assert fold("Konitsa") == "κονιτσα"
    assert fold("lourou") == "λουρου"
    assert fold("thesprotia") == "θεσπροτια"


def test_mixed_text_left_alone():
    assert fold("ΑΟ zitsa") == "αο zitsa"
