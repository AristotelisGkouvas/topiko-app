"""Matching a scraped club name to a club already in the database.

The same club is written several ways on one site, let alone across sites:
"Α.Ε. ΚΡΑΝΟΥΛΑΣ" in the fixture list, "Α.Ε.ΚΡΑΝΟΥΛΑΣ" in the cross-table.
Nothing carries a stable id, so the name is the only handle there is — and a bad
match silently creates a duplicate club or attaches a result to the wrong team.

The rule here is deliberately conservative: normalise hard, accept an exact
normalised hit, and treat anything fuzzier as a suggestion for a human rather
than something to act on.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

# The replacement character. epsip.gr emits it in its rotated column headers,
# where it splits team names with <br /> in the middle of a UTF-8 sequence, so a
# name containing one is corrupt at the source and must never be matched on.
REPLACEMENT = "�"

_STRIP = re.compile(r"[.\s\-_'\"()·]+")

# Fuzzy hits at or above this are worth showing a human; nothing fuzzy is ever
# applied automatically.
SUGGEST_THRESHOLD = 0.86


def strip_accents(value: str) -> str:
    """Remove tonos and dialytika. 'ΆΝΩ' -> 'ΑΝΩ', 'ϊ' -> 'ι'."""
    decomposed = unicodedata.normalize("NFD", value)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def normalize(name: str) -> str:
    """Collapse a club name to a comparison key.

    Uppercases, drops accents, folds final sigma, and removes the punctuation
    and spacing that the sources use inconsistently. "Α.Ε. ΚΡΑΝΟΥΛΑΣ" and
    "Α.Ε.ΚΡΑΝΟΥΛΑΣ" both become "ΑΕΚΡΑΝΟΥΛΑ".
    """
    text = strip_accents(name).upper()
    text = _STRIP.sub("", text)
    # Drop one trailing sigma: club names alternate between nominative and
    # genitive ("ΚΑΤΣΙΚΑ" / "ΚΑΤΣΙΚΑΣ") from one page to the next. removesuffix,
    # not rstrip, so a name genuinely ending in two sigmas keeps one.
    text = text.removesuffix("Σ")
    return text


def is_corrupt(name: str) -> bool:
    return REPLACEMENT in name or not name.strip()


@dataclass(frozen=True, slots=True)
class Match:
    value: str
    score: float
    exact: bool


def find(name: str, candidates: dict[str, str]) -> Match | None:
    """Look `name` up among `candidates`, a mapping of normalised key -> value.

    Returns an exact match when the normalised keys agree, otherwise the best
    fuzzy candidate above SUGGEST_THRESHOLD with `exact=False`. Callers are
    expected to act only on exact hits.
    """
    if is_corrupt(name):
        return None

    key = normalize(name)
    if not key:
        return None
    if key in candidates:
        return Match(candidates[key], 1.0, exact=True)

    best: Match | None = None
    for candidate_key, value in candidates.items():
        score = SequenceMatcher(None, key, candidate_key).ratio()
        if score >= SUGGEST_THRESHOLD and (best is None or score > best.score):
            best = Match(value, score, exact=False)
    return best


#: A trailing standalone capital marks which squad of a club this is:
#: "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ Β" is the club's second team in the youth divisions, and it
#: plays its own fixtures against its own siblings.
#:
#: ΣΤ is spelled out because Greek counts Α Β Γ Δ Ε ΣΤ Ζ Η Θ Ι — the sixth is
#: two characters, and a pattern of single letters silently reads "ΑΤΛΑΣ
#: ΙΩΑΝΝΙΝΩΝ ΣΤ" as a misspelling of the parent club.
_SQUAD = re.compile(r"[\s.]+(ΣΤ|[Α-ΩA-Z])\s*$")


def squad(name: str) -> str | None:
    """The squad letter a club name ends with, if any."""
    m = _SQUAD.search(strip_accents(name).upper())
    return m.group(1) if m else None


def same_squad(a: str, b: str) -> bool:
    """Whether two names refer to the same squad of a club.

    This is the one place where fuzzy matching is actively dangerous rather than
    merely unhelpful. "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ Β" and "ΘΥΕΛΛΑ ΚΑΤΣΙΚΑΣ" score 93%, so a
    similarity test reads them as the same club spelled two ways — but they are
    two different teams, and in the youth categories they play each other. The
    single character that a ratio discounts is precisely the one that matters.
    """
    return squad(a) == squad(b)


def _tokens(name: str) -> list[str]:
    """A club name split into comparable words.

    Dots separate as firmly as spaces here: "Α.Σ.ΑΧΕΡΩΝ" is three words written
    without room to breathe. Final sigma is folded per token for the same reason
    normalize() folds it — the sources alternate nominative and genitive — but
    never on a single letter, where the sigma *is* the word ("Α.Σ.").
    """
    out = []
    for tok in _WORD_SPLIT.split(strip_accents(name).upper()):
        if not tok:
            continue
        out.append(tok if len(tok) == 1 else tok.removesuffix("Σ"))
    return out


_WORD_SPLIT = re.compile(r"[.\s\-_'\"()·]+")

#: A word this short is an initial from a club-type prefix — the Α, Ο, Σ of
#: "Α.Ο.Σ." — and carries no identity of its own.
_INITIAL_LEN = 1


def same_club(a: str, b: str) -> bool:
    """Whether two spellings name the same club.

    Beyond the exact normalised hit, two differences are safe to resolve
    automatically because neither changes which club is meant:

    * word order — "Α.Σ.ΑΧΕΡΩΝ ΡΩΜΑΝΟΥ" and "ΑΧΕΡΩΝ ΡΩΜΑΝΟΥ Α.Σ." are the same
      words with the prefix moved to the end;
    * a missing club-type prefix — "ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ" against
      "Α.Ο.Ν.ΣΤΑΥΡ.ΣΥΡΡΑΚΟΥ", where one name is the other with its initials
      dropped.

    The second is a *subset*, never a swap, and that distinction is the whole
    safety of it: "Α.Ο.ΖΙΤΣΑΣ" and "Α.Ε.ΖΙΤΣΑΣ" also differ only in single
    letters, but they are two clubs from one village, and neither name contains
    the other. It also needs a floor, or "Α.Ο." and "Α.Ε." would qualify on
    their shared Α — the words the names agree on must include a real one.
    Neither rule may cross a squad letter, so that check comes first.
    """
    if not same_squad(a, b):
        return False

    ta, tb = _tokens(a), _tokens(b)
    if squad(a) is not None:
        # Compare the clubs, not the squad marker both names carry.
        ta, tb = ta[:-1], tb[:-1]
    if not ta or not tb:
        return False
    if sorted(ta) == sorted(tb):
        return True

    sa, sb = set(ta), set(tb)
    smaller, larger = (sa, sb) if len(sa) < len(sb) else (sb, sa)
    if not smaller < larger:
        return False
    if any(len(t) > _INITIAL_LEN for t in larger - smaller):
        return False
    return any(len(t) > _INITIAL_LEN for t in smaller)


def index(values: dict[str, str]) -> dict[str, str]:
    """Build a lookup keyed by normalised name.

    Collisions are dropped rather than silently resolved: if two clubs in one
    association normalise to the same key, no automatic match on that key can be
    trusted, and an alias has to settle it.
    """
    result: dict[str, str] = {}
    collided: set[str] = set()
    for name, value in values.items():
        key = normalize(name)
        if not key:
            continue
        if key in result and result[key] != value:
            collided.add(key)
        result[key] = value
    for key in collided:
        del result[key]
    return result


# Greek -> Latin for URL slugs. Not a transliteration standard, just a stable,
# readable mapping: slugs are identifiers, and the display name is always the
# original Greek.
_TRANSLIT = {
    "Α": "a", "Β": "v", "Γ": "g", "Δ": "d", "Ε": "e", "Ζ": "z", "Η": "i",
    "Θ": "th", "Ι": "i", "Κ": "k", "Λ": "l", "Μ": "m", "Ν": "n", "Ξ": "x",
    "Ο": "o", "Π": "p", "Ρ": "r", "Σ": "s", "Τ": "t", "Υ": "y", "Φ": "f",
    "Χ": "ch", "Ψ": "ps", "Ω": "o",
}
_SLUG_CLEAN = re.compile(r"[^a-z0-9]+")


def slugify(name: str, fallback: str = "item") -> str:
    """URL-safe slug from a Greek (or Latin) name.

    "Α.Ε. ΚΡΑΝΟΥΛΑΣ" -> "ae-kranoula". Digraphs are handled where they change
    the reading: ΟΥ is "ou", not "oy".
    """
    text = strip_accents(name).upper().replace("ΟΥ", "OU")
    out = [_TRANSLIT.get(ch, ch) for ch in text]
    slug = _SLUG_CLEAN.sub("-", "".join(out).lower()).strip("-")
    return slug or fallback


def unique_slug(base: str, taken: set[str]) -> str:
    """Append -2, -3 … until the slug is free.

    Two clubs in one association can share a normalised name; they cannot share
    a URL.
    """
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"
