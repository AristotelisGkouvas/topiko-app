"""Reading a competition's name into the parts a reader needs.

The federation publishes one long string per competition, carrying the sponsor,
the age group, the section and the season all at once:

    "ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ10 Γ"
    "MAISON Ε.Π.Σ.ΗΠ. Β Κατηγορια Α Ομιλος 2016-17"

Storing only the heading it sits under ("Κ 10") is what made four tabs read
identically. What tells them apart — the section letter — is in the name, so it
is pulled out here and kept in its own columns.

Every pattern below was written against the 237 competitions the ΕΠΣ Ηπείρου
site has published since 2014, spelling variants and all: "Κ10 Α", "Κ 10 Α",
"Κ10Α" are the same thing written three ways in three seasons.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.enums import LeagueKind
from app.scraper.naming import strip_accents

#: Sponsors and the federation's own name. They lead most titles and identify
#: nothing — two competitions in the same season carry the same sponsor.
_NOISE = re.compile(
    r"ΣΤΕΦΑΝΟΣ\s+ΓΕΡΑΣΗ[ΣΝ]|HALL\s+OF\s+BRANDS|MAISON|ΙΕΚ\s+ΔΕΛΤΑ|ΔΩΔΩΝΗ"
    r"|Ε\.?Π\.?Σ\.?\s*ΗΠ\.?|ΠΡΩΤΑΘΛΗΜΑ|ΑΓΩΝΕΣ|ΠΕΡΙΟΔΟΥ|ΔΙΕΞΑΓΩΓΗ"
)

#: "2016-17", "2021-2022".
_SEASON = re.compile(r"\b\d{4}\s*-\s*\d{2,4}\b")

#: "Κ10", "Κ 10", "K16" — the Latin K is used interchangeably with the Greek Κ.
#: The section is captured here as well because it is sometimes glued on
#: ("Κ10Α"): between "0" and "Α" there is no word boundary for the trailing
#: pattern below to find.
_AGE_NUMBER = re.compile(r"\b[ΚK]\s*(\d{1,2})\s*([ΑΒΓΔΕΖ]\d?)?\b")

#: Age groups the site names in words rather than numbers.
_AGE_WORDS = (
    ("ΠΡΟΤΖΟΥΝΙΟΡ", "Προτζούνιορς"),
    ("ΠΡΟΠΑΙΔΩΝ", "Προπαίδων"),
    ("ΤΖΟΥΝΙΟΡ", "Τζούνιορς"),
    ("ΜΠΑΜΠΙΝΙ", "Μπαμπίνι"),
    ("ΠΑΙΔΩΝ", "Παίδων"),
    ("ΝΕΩΝ", "Νέων"),
)

#: "Α Ομιλος", "Β Όμιλου", "1ος Όμιλος", "Α ΓΚΡΟΥΠ", "Α ΦΑΣΗ".
_GROUP = re.compile(r"\b(?:([ΑΒΓΔΕ])|(\d))(?:ΟΣ|ΟΥ)?\s+(?:ΟΜΙΛΟ[ΣΥ]|ΓΚΡΟΥΠ)\b")
#: A trailing section letter, as the youth competitions write it: "Κ10 Γ".
_TRAILING = re.compile(r"\b([ΑΒΓΔΕΖ]\d?)\s*$")

#: "Β φάσης Α Ομίλου" — a second stage played after the group stage, which is a
#: different competition from the group of the same letter.
_PHASE = re.compile(r"\b([ΑΒΓ])\s+ΦΑΣΗ\w*")

_TIERS = {"Α": 1, "Β": 2, "Γ": 3, "Δ": 4}
#: Genitive included — "PLAY OUT Β ΚΑΤΗΓΟΡΙΑΣ" names its tier that way.
_CATEGORY = re.compile(r"\b([ΑΒΓΔ])\s+(?:ΕΡΑΣΙΤΕΧΝΙΚ\w*|ΚΑΤΗΓΟΡΙΑ\w*)")

#: Knock-out rounds, most specific first. A season runs the final, the
#: third-place match and the barrage of one age group all at once, so folding
#: them into a single "Play-off" would put three identical tabs side by side.
_KNOCKOUT = (
    (re.compile(r"ΜΙΚΡΟΣ\s+ΤΕΛΙΚΟΣ"), "Μικρός τελικός"),
    (re.compile(r"ΗΜΙΤΕΛΙΚ"), "Ημιτελικοί"),
    (re.compile(r"ΜΠΑΡΑΖ"), "Μπαράζ"),
    (re.compile(r"PLAY\s*OUT|ΠΑΡΑΜΟΝΗ|ΥΠΟΒΙΒΑΣΜΟΥ"), "Play-out"),
    (re.compile(r"ΤΕΛΙΚΟΣ|ΤΕΛΙΚΟ\b"), "Τελικός"),
    (re.compile(r"PLAY\s*OFF|ΠΛΕΙ\s*ΟΦ|ΑΝΟΔΟΥ|ΚΑΤΑΤΑΞΗΣ|ΔΙΑΒΑΘΜΙΣΗΣ"), "Play-off"),
)
_WOMEN = re.compile(r"ΓΥΝΑΙΚΕΙΟ|ΓΥΝΑΙΚΩΝ")


@dataclass(frozen=True, slots=True)
class LeagueLabel:
    #: Short and, within one season, unique — this is what the tabs show.
    label: str
    kind: LeagueKind
    #: "Κ10", "Παίδων", … or None for the open-age divisions.
    age_group: str | None
    #: "Α", "Β" … the section within a category or age group.
    group_name: str | None
    #: 1 for Α Κατηγορία, 2 for Β, 3 for Γ. None outside the ladder.
    tier: int | None


def _clean(name: str) -> str:
    text = strip_accents(name).upper()
    text = _SEASON.sub(" ", text)
    text = _NOISE.sub(" ", text)
    # Quotes around a sponsor's name, and the punctuation left behind.
    text = re.sub(r"[\"'«»¨]", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-")


def describe_league(name: str) -> LeagueLabel:
    """Split one published title into label, age group, section and tier."""
    text = _clean(name)

    age_group: str | None = None
    glued_section: str | None = None
    if m := _AGE_NUMBER.search(text):
        age_group = f"Κ{int(m.group(1))}"
        glued_section = m.group(2)
    else:
        for needle, pretty in _AGE_WORDS:
            if needle in text:
                age_group = pretty
                break

    tier = None
    if m := _CATEGORY.search(text):
        tier = _TIERS.get(m.group(1))

    group_name = None
    if m := _GROUP.search(text):
        group_name = m.group(1) or m.group(2)
    else:
        # No explicit "Όμιλος": the youth competitions just append the letter.
        # Guard against eating the category letter of a name like "PLAY OFF Α".
        rest = _CATEGORY.sub(" ", text) if tier else text
        if m := _TRAILING.search(rest.strip()):
            group_name = m.group(1)
        else:
            group_name = glued_section

    knockout = next((word for rx, word in _KNOCKOUT if rx.search(text)), None)

    if knockout:
        kind, stem = LeagueKind.PLAYOFF, knockout
    elif _WOMEN.search(text):
        kind, stem = LeagueKind.CHAMPIONSHIP, "Γυναικών"
    elif age_group:
        kind, stem = LeagueKind.CHAMPIONSHIP, age_group
    elif tier:
        kind, stem = LeagueKind.CHAMPIONSHIP, f"{'ΑΒΓΔ'[tier - 1]} Κατηγορία"
    else:
        kind, stem = LeagueKind.CHAMPIONSHIP, None

    if stem is None:
        # Nothing recognised. Better a truncated real title than a wrong guess.
        label = name.strip()[:28]
    elif knockout:
        # Name whose competition it decides, or "Τελικός" alone would repeat.
        label = stem
        if age_group:
            label += f" {age_group}"
        elif tier:
            # "Play-out Β Κατ." rather than "Play-out Β", which reads as a typo.
            label += f" {'ΑΒΓΔ'[tier - 1]} Κατ."
        if group_name and group_name != age_group:
            label += f" {group_name}"
    else:
        label = stem
        # The phase comes before the section: "Παίδων Β' φάση Α" is the Α group
        # of the second stage, not the Α group of the first.
        if (m := _PHASE.search(text)) and m.group(1) != group_name:
            label += f" {m.group(1)}' φάση"
        if group_name:
            label += f" {group_name}"

    return LeagueLabel(
        label=label,
        kind=kind,
        age_group=age_group,
        group_name=group_name,
        tier=tier,
    )


def unique_label(label: str, used: set[str]) -> str:
    """Keep one label per competition per season.

    The source sometimes publishes two competitions under one title —
    "ΔΩΔΩΝΗ - ΠΡΟΤΖΟΥΝΙΟΡΣ 2015-16" names five of them — and no reading of the
    name can tell those apart. A numeral is honest about that, where two
    identical tabs are not.
    """
    if label not in used:
        return label
    n = 2
    while f"{label} ({n})" in used:
        n += 1
    return f"{label} ({n})"
