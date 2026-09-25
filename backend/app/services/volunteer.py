"""Issuing and checking club codes.

See `app.models.volunteer` for what a code is and why it looks the way it does.
"""

from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models import ClubAccessCode, Team
from app.models.volunteer import LOCKOUT_MINUTES, MAX_FAILURES

#: Six digits. See the module docstring on the model for why not four.
DIGITS = 6

#: Shared with the short-name derivation: the same Latin lookalikes that break
#: a club's name also break a code typed on an English keyboard layout.
from app.services.greek import (  # noqa: E402
    LATIN_LOOKALIKE as _LOOKALIKE,
    upper_bare as _upper_bare,
    words as _words,
)


#: Every dash a phone keyboard offers: an iPhone turns "--" into an en or em
#: dash, and a pasted code may carry a minus sign or a non-breaking hyphen.
_DASHES = str.maketrans({c: "-" for c in "‐‑‒–—―−_"})


def normalise(raw: str) -> str:
    """What the reader typed, as the code was issued.

    Case, accents, spaces, the Latin lookalikes, the kind of dash — and the
    dash itself — are all forgiven. None of them is the secret, and every one
    of them is a way to be told your correct code is wrong.
    """
    cleaned = raw.strip().replace(" ", "").translate(_DASHES).translate(_LOOKALIKE)
    cleaned = _upper_bare(cleaned)
    if "-" not in cleaned and len(cleaned) > DIGITS:
        # "ΚΟΝ313887": the code always ends in DIGITS digits, so that is where
        # the dash goes — which also keeps a numbered prefix ("ΚΟΝ2") whole.
        cleaned = f"{cleaned[:-DIGITS]}-{cleaned[-DIGITS:]}"
    return cleaned


def _candidates(name: str) -> list[str]:
    """Prefixes to try for a club, best first.

    The first word of four letters or more, because that is what people call
    the club: "Α.Ε. ΓΙΑΝΝΕΝΑ 2004" is Γιάννενα, not ΑΕΓ. Initial-only forms
    like Α.Ε. and Π.Α.Ο. are shared by dozens of clubs and identify none.
    """
    # Without accents: "Κόνιτσας" gives ΚΟΝ, not ΚΌΝ. A capital with a tonos
    # takes three taps on a phone and half the people holding the card do not
    # know it can be typed at all.
    letters = [_upper_bare(w) for w in _words(name)]
    long_enough = [w for w in letters if len(w) >= 4]

    out: list[str] = []
    for word in long_enough or letters:
        if len(word) >= 3:
            out.append(word[:3])
    for word in long_enough:
        if len(word) >= 4:
            out.append(word[:4])
    # Last resort, so this never returns nothing for an oddly-named club.
    joined = "".join(letters)
    if len(joined) >= 3:
        out.append(joined[:3])
    return list(dict.fromkeys(out)) or ["ΟΜΑ"]


async def pick_prefix(db: AsyncSession, *, association_id: int, team: Team) -> str:
    """A prefix for this club that nobody else in the federation holds."""
    # Compared bare, because codes issued before accents were dropped still
    # carry them, and ΚΌΝ and ΚΟΝ are the same prefix to the person typing.
    taken = {
        _upper_bare(p)
        for p in (
            await db.execute(
                select(ClubAccessCode.prefix).where(
                    ClubAccessCode.association_id == association_id
                )
            )
        )
        .scalars()
        .all()
    }

    for candidate in _candidates(team.name):
        if candidate not in taken:
            return candidate
        for suffix in range(2, 10):
            numbered = f"{candidate}{suffix}"
            if numbered not in taken:
                return numbered
    # Unreachable in practice; a federation would need thousands of clubs
    # sharing one name. Better than raising on a Sunday.
    return f"ΟΜΑ{secrets.randbelow(900) + 100}"


def generate(prefix: str) -> str:
    """A fresh code for this prefix. The only time the plaintext exists."""
    digits = "".join(str(secrets.randbelow(10)) for _ in range(DIGITS))
    return f"{prefix}-{digits}"


async def issue(
    db: AsyncSession,
    *,
    association_id: int,
    team: Team,
    label: str | None,
    created_by_id: int | None,
) -> tuple[ClubAccessCode, str]:
    """Create a code for a club. Returns the row and the plaintext, once.

    Any code the club already had is deactivated rather than deleted: the
    events it authored keep pointing at it, and "who reported this" has to
    stay answerable after the paper is reissued.
    """
    existing = (
        await db.execute(
            select(ClubAccessCode).where(
                ClubAccessCode.association_id == association_id,
                ClubAccessCode.team_id == team.id,
                ClubAccessCode.is_active.is_(True),
            )
        )
    ).scalars()
    prefix: str | None = None
    for old in existing:
        old.is_active = False
        # Reuse the club's own prefix, so a reissued card reads the same.
        prefix = old.prefix

    if prefix is None:
        prefix = await pick_prefix(db, association_id=association_id, team=team)
    else:
        # Flushed before the new row is added. The unit of work emits inserts
        # ahead of updates, so without this the new code hits the partial
        # unique index while the old one is still marked live.
        await db.flush()

    plaintext = generate(prefix)
    # Argon2 is deliberately slow; run inline it would stall every other
    # request on the event loop for as long as it takes.
    code_hash = await asyncio.to_thread(hash_password, plaintext)
    code = ClubAccessCode(
        association_id=association_id,
        team_id=team.id,
        prefix=prefix,
        code_hash=code_hash,
        label=label,
        created_by_id=created_by_id,
    )
    db.add(code)
    await db.flush()
    return code, plaintext


async def authenticate(
    db: AsyncSession, *, association_id: int, raw: str
) -> ClubAccessCode | None:
    """The club this code belongs to, or None.

    None for every kind of failure — unknown prefix, wrong digits, deactivated,
    locked. The caller says "λάθος κωδικός" and nothing else: a message that
    distinguishes "no such club" from "wrong number" tells a guesser which half
    to keep working on.
    """
    cleaned = normalise(raw)
    prefix, _, rest = cleaned.partition("-")
    if not prefix or not rest:
        return None

    # Matched bare in Python rather than in SQL: codes issued before accents
    # were dropped are stored as "ΚΌΝ", and a federation has a few hundred
    # active codes at most.
    active = (
        await db.execute(
            select(ClubAccessCode).where(
                ClubAccessCode.association_id == association_id,
                ClubAccessCode.is_active.is_(True),
            )
        )
    ).scalars()
    code = next((c for c in active if _upper_bare(c.prefix) == prefix), None)
    if code is None:
        return None
    # The hash covers the prefix exactly as it was issued.
    cleaned = f"{code.prefix}-{rest}"

    now = datetime.now(UTC)
    if code.locked_until is not None and code.locked_until > now:
        return None

    if not await asyncio.to_thread(verify_password, cleaned, code.code_hash):
        code.failures += 1
        if code.failures >= MAX_FAILURES:
            code.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            # Counted from zero again, so the next lockout needs a fresh run
            # of wrong tries rather than one more after the wait.
            code.failures = 0
        return None

    code.failures = 0
    code.locked_until = None
    code.last_used_at = now
    return code
