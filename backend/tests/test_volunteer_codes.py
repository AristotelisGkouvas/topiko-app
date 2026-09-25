"""Club codes have to survive being typed on a phone.

The prefix comes from the club's name, and Python's upper() keeps the tonos:
"Κόνιτσας" became "ΚΌΝ", and ΚΟΝ, κον and KON were all told "λάθος κωδικός".
"""

from app.services.volunteer import _candidates, normalise


def test_prefix_has_no_accent():
    assert _candidates("Α.Ο. Κόνιτσας")[0] == "ΚΟΝ"
    assert _candidates("Α.Ο. Λούρου")[0] == "ΛΟΥ"


def test_every_way_of_typing_it_reads_the_same():
    for typed in ("ΚΌΝ-349746", "κόν-349746", "ΚΟΝ-349746", "κον-349746", "KON-349746", " kon - 349746 "):
        assert normalise(typed) == "ΚΟΝ-349746", typed


def test_any_dash_or_none_at_all():
    for typed in ("ΚΟΝ–349746", "ΚΟΝ—349746", "ΚΟΝ349746", "kon349746", "ΚΟΝ‑349746"):
        assert normalise(typed) == "ΚΟΝ-349746", typed


def test_a_numbered_prefix_keeps_its_digit_only_before_the_dash():
    # ΚΟΝ2 exists when two clubs collide; with a dash it is unambiguous.
    assert normalise("κον2-123456") == "ΚΟΝ2-123456"


def test_a_numbered_prefix_without_a_dash():
    assert normalise("κον2123456") == "ΚΟΝ2-123456"
