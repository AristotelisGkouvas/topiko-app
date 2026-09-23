"""The name a club is actually called.

The register holds "Α.Ε.ΚΛΗΜΑΤΙΑΣ" and "Π.Α.Ο.ΚΟΝΙΤΣΑΣ". Nobody says that. In a
list of fourteen rows on a 360px screen, the first six characters of half of
them are "Α.Ε." or "Π.Α.Ο." — initials shared by dozens of clubs, identifying
none, eating the width the distinctive word needed.

So every club gets a short name: "ΚΛΗΜΑΤΙΑΣ", "ΚΟΝΙΤΣΑΣ". The official name stays
on the club's own page, where there is room and where it is the right thing to
show.

Computed over the whole register at once, not one name at a time. Stripping the
legal form is only safe if what is left is still unique: this federation has an
Α.Ο.ΓΙΑΝΝΙΝΑ *and* a Π.Α.Σ.ΓΙΑΝΝΙΝΑ, and shortening both to "ΓΙΑΝΝΙΝΑ" would put
two identical rows in a table — worse than the long names it was fixing.
"""

from __future__ import annotations

import re

from app.services.greek import words

#: A founding year. Four digits beginning 19 or 20, not any number: "95" is an
#: abbreviation of one and "2" is a squad number.
_YEAR = re.compile(r"(?<!\d)(?:19|20)\d{2}(?!\d)")

#: Words that are never the name of the club, only its legal form. Whole words
#: only: "ΑΟ" is a form, "ΑΟΥΣΤΡΙΑ" is a name.
_FORMS = {
    "ΑΕ", "ΑΟ", "ΑΣ", "ΠΑΟ", "ΓΣ", "ΑΠΣ", "ΜΑΣ", "ΑΓΣ", "ΑΕΔ", "ΣΦ",
    "ΠΑΕ", "ΑΠΟ", "ΑΕΠ", "ΠΑΣ", "ΕΠΣ", "ΟΜΙΛΟΣ", "ΣΥΛΛΟΓΟΣ", "ΕΝΩΣΗ",
    "ΑΘΛΗΤΙΚΟΣ", "ΠΟΔΟΣΦΑΙΡΙΚΟΣ", "ΓΥΜΝΑΣΤΙΚΟΣ", "ΜΟΡΦΩΤΙΚΟΣ",
    "ΕΚΠΟΛΙΤΙΣΤΙΚΟΣ",
}

#: Short words that are part of the name rather than a form.
_KEEP = {"ΝΕΟΙ", "ΝΕΑ", "ΝΕΟΣ", "ΑΝΩ", "ΚΑΤΩ", "ΑΓ", "ΑΓΙΟΣ", "ΑΓΙΑ", "ΟΙ"}


def _is_form(word: str) -> bool:
    return word in _FORMS or (len(word) <= 3 and word not in _KEEP)


def _trim(official: str) -> str | None:
    """The name with its leading legal form removed, ignoring uniqueness.

    None when nothing is left — a club registered as nothing but initials, like
    "Α.Π.Ο.Ε.Λ.", has no shorter name to offer.

    Left upper-case on purpose, and this is the one place the result falls short
    of the mock-ups, which show "Κληματιά". Two things separate "ΚΛΗΜΑΤΙΑΣ" from
    "Κληματιά" and neither can be derived: Greek upper-case correctly carries no
    accents, so lower-casing cannot put them back ("Κληματιας" is misspelled,
    and a missing accent in Greek is an error rather than a style); and the
    register writes place names in the genitive, so the nominative is a
    grammatical case change needing a lexicon — the rule that turns "ΖΙΤΣΑΣ"
    into "Ζίτσα" turns "ΒΕΛΙΣΣΑΡΙΟΥ" into nonsense.

    So: shortened and correct rather than prettier and wrong. The column is
    editable, and the nice forms are 177 rows of human input or a lexicon.
    """
    parts = words(official)
    if not parts:
        return None

    # Only from the front. A form in the middle is usually part of a compound,
    # and "ΑΕΤΟΣ ΑΟ" should keep its name.
    while parts and _is_form(parts[0]):
        parts.pop(0)

    if not parts:
        return None

    short = " ".join(parts)

    # The founding year goes back on: it is often the only thing separating two
    # clubs from the same village.
    year = _YEAR.search(official)
    if year and year.group(0) not in short:
        short = f"{short} {year.group(0)}"
    return short


def short_names(officials: list[str]) -> dict[str, str | None]:
    """A short name per official name, or None to keep the official one.

    Three passes, each less aggressive than the last:

    1. Strip the legal form. Most clubs are done here.
    2. For any short name now shared by more than one club, put the form back —
       it *is* the distinguishing part for those, however ugly.
    3. Anything still colliding keeps its official name. There is nothing left
       to tell them apart with, and two identical rows would be a lie about the
       register rather than a shortening of it.
    """
    trimmed = {name: _trim(name) for name in officials}

    taken: dict[str, list[str]] = {}
    for name, short in trimmed.items():
        if short is not None:
            taken.setdefault(short, []).append(name)

    result: dict[str, str | None] = {}
    for name, short in trimmed.items():
        if short is None or len(taken[short]) == 1:
            result[name] = short
            continue

        # Colliding: put the form back, compacted. "Π.Α.Σ.ΓΙΑΝΝΙΝΑ" becomes
        # "ΠΑΣ ΓΙΑΝΝΙΝΑ" — still shorter than the dotted original, and still
        # distinct from "ΑΟ ΓΙΑΝΝΙΝΑ".
        #
        # The *whole* leading run, joined without spaces: the dots split "Α.Ο."
        # into two one-letter words, and taking only the first of them produces
        # "Α ΓΙΑΝΝΙΝΑ", which is not a club's name in any sense.
        parts = words(name)
        lead: list[str] = []
        for part in parts:
            if not _is_form(part):
                break
            lead.append(part)
        result[name] = f"{''.join(lead)} {short}" if lead else short

    # Pass three: whatever is still shared gives up and keeps the official name.
    counts: dict[str, int] = {}
    for short in result.values():
        if short is not None:
            counts[short] = counts.get(short, 0) + 1

    return {
        name: (short if short is None or counts[short] == 1 else None)
        for name, short in result.items()
    }
