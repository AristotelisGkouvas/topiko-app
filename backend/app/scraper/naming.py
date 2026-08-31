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
from collections import Counter
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


def _significant_words(name: str) -> list[str]:
    """The words in a club name that could stand for it on a crest.

    Three letters or more skips the Α, Ο, Σ left by "Α.Ο.Σ."; requiring a
    letter skips a founding year such as "2004".
    """
    return [
        w
        for w in _WORD_SPLIT.split(strip_accents(name).upper())
        if len(w) >= 3 and any(c.isalpha() for c in w)
    ]


def monogram(name: str) -> str:
    """Two letters for the crest, from the most identifying word.

    Club names lead with abbreviations ("Α.Ο.", "Π.Α.Σ.") shared by half the
    league and often trail a founding year, so what tells two clubs apart is
    the last real word — usually the village. A squad letter is appended rather
    than folded in: "ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ Β" and "… Γ" play each other, and two
    identical badges on one match card say nothing.
    """
    letter = squad(name)
    stem = name
    if letter:
        stem = _SQUAD.sub("", strip_accents(name).upper())
    words = _significant_words(stem)
    word = words[-1] if words else stem.replace(".", "").strip()
    base = word[:2] or "??"
    # letter[0]: the crest is 22px at its smallest and holds three characters,
    # not four, so the sixth squad is "Σ" here rather than "ΣΤ".
    return f"{base}{letter[0]}" if letter else base


def assign_monograms(names: list[str]) -> dict[str, str]:
    """Monograms for a whole association at once, avoiding repeats.

    "ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ", "ΑΣΤΕΡΑΣ ΙΩΑΝΝΙΝΩΝ" and "ΕΛΠΙΔΕΣ ΙΩΑΝΝΙΝΩΝ" all end in
    the city every club here is from, so the last-word rule alone gave 28 clubs
    the badge "ΙΩ". Where that happens the earlier words are tried instead,
    which is exactly where those three differ.
    """
    # Squads of one club must share a base — "ΑΤΛΑΣ ΙΩΑΝΝΙΝΩΝ Β" and "… Γ" are
    # the same club — so bases are assigned per club, not per team.
    stems: dict[str, list[str]] = {}
    for name in names:
        letter = squad(name)
        stem = _SQUAD.sub("", strip_accents(name).upper()) if letter else name
        stems.setdefault(stem, []).append(name)

    # How many clubs each word appears in. "ΙΩΑΝΝΙΝΩΝ" is in 28 of them and so
    # identifies none; a village name in one identifies that one exactly. This
    # is the whole heuristic: the rarest word is the club's own.
    frequency = Counter(w for s in stems for w in set(_significant_words(s)))

    bases: dict[str, str] = {}
    used: set[str] = set()
    # Fewest alternatives first: a one-word club can only ever claim its own two
    # letters, so let it take them before a longer name does.
    for stem in sorted(stems, key=lambda s: (len(_significant_words(s)), s)):
        words = _significant_words(stem)
        # Rarest word first, later words winning a tie — a club is named for its
        # village more often than for the word that opens the title.
        ranked = sorted(
            range(len(words)), key=lambda i: (frequency[words[i]], -i)
        )
        distinctive = [words[i][:2] for i in ranked if frequency[words[i]] < 3]
        generic = [words[i][:2] for i in ranked if frequency[words[i]] >= 3]
        combo = (
            [words[0][:1] + words[-1][:1]] if len(words) >= 2 else []
        )
        # A word shared by three clubs or more is worse than an initialism: it
        # would put the same two letters on several crests. So the club's own
        # words come first, then its initials, and only then the shared word.
        candidates = distinctive + combo + generic
        candidates.append(monogram(stem))
        base = next(
            (c for c in candidates if c and c not in used), candidates[0] or "??"
        )
        used.add(base)
        bases[stem] = base

    out: dict[str, str] = {}
    for stem, group in stems.items():
        for name in group:
            letter = squad(name)
            out[name] = f"{bases[stem]}{letter[0]}" if letter else bases[stem]
    return out


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
