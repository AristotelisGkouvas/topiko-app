"""Greek text as it actually arrives, rather than as it should.

Two problems keep recurring and both belong in one place.

**Latin lookalikes.** Half the Greek alphabet is drawn identically to a Latin
letter, and the register is full of names typed with a mixture — "ΠΑΣ ΠΗΓΩΝ
ΛΟΥΡOY" ends in a Latin O and Y. To a person it is one word; to a regular
expression over Greek letters it is two, and the second half disappears. The
same thing happens when somebody types a club code on an English layout.

**Accents.** Greek upper case carries none, lower case requires them, and
readers on a phone type neither. Anything that compares two Greek strings has to
fold them first.
"""

from __future__ import annotations

import re

#: Latin letters drawn identically to a Greek one, and what they should be.
#: Only the identical ones: "L" is not "Λ" and folding it would corrupt genuine
#: Latin words like the "CLUB" in "ΓΙΑΝΝΕΝΑ CLUB 2014".
LATIN_LOOKALIKE = str.maketrans(
    "ABEZHIKMNOPTYXabeikmnoptyx",
    "ΑΒΕΖΗΙΚΜΝΟΡΤΥΧαβεικμνορτυχ",
)

#: Accented forms and their bare equivalents, plus final sigma. Used when two
#: strings have to compare equal regardless of how carefully they were typed.
ACCENTED = "άέήίόύώϊϋΐΰς"
PLAIN = "αεηιουωιυιυσ"
assert len(ACCENTED) == len(PLAIN), "ο πίνακας πτυχώσεως ξέφυγε"

_FOLD = str.maketrans(ACCENTED, PLAIN)

#: Anything that is not a Greek letter separates words. The dots matter:
#: "Α.Ε.Δ.ΠΩΓΩΝΑΤΟΣ" is one run of characters and four words.
NOT_GREEK = re.compile(r"[^Α-ΩΆΈΉΊΌΎΏΪΫα-ωάέήίόύώϊϋΐΰς]+")


#: One run of letters, Greek or Latin, as a unit to judge.
_RUN = re.compile(r"[A-Za-zΑ-ΩΆΈΉΊΌΎΏΪΫα-ωάέήίόύώϊϋΐΰς]+")
_HAS_GREEK = re.compile(r"[Α-ΩΆΈΉΊΌΎΏΪΫα-ωάέήίόύώϊϋΐΰς]")


def latin_to_greek(text: str) -> str:
    """Repair the letters that were typed on the wrong keyboard.

    Only inside a word that already contains Greek. Blanket translation would
    turn the "CLUB" of "ΓΙΑΝΝΕΝΑ CLUB 2014" into "CLUΒ" and leave a stray Greek
    Β behind as if it were a squad letter — mangling a genuine Latin word to fix
    a mistyped Greek one.

    A word of pure Latin is left exactly as it is; callers that only want Greek
    drop it anyway.
    """

    def repair(match: re.Match[str]) -> str:
        run = match.group(0)
        return run.translate(LATIN_LOOKALIKE) if _HAS_GREEK.search(run) else run

    return _RUN.sub(repair, text)


def fold(text: str) -> str:
    """Lower-cased, unaccented, final sigma normalised — for comparison only."""
    return text.lower().translate(_FOLD)


def words(name: str) -> list[str]:
    """The Greek words in a name, upper-cased, punctuation dropped.

    Latin lookalikes are repaired first, or a name with one in the middle comes
    back cut in half.
    """
    return [w for w in NOT_GREEK.split(latin_to_greek(name).upper()) if w]
