"""Issuing and checking club codes.

See `app.models.volunteer` for what a code is and why it looks the way it does.
"""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models import ClubAccessCode, Team
from app.models.volunteer import LOCKOUT_MINUTES, MAX_FAILURES

#: Six digits. See the module docstring on the model for why not four.
DIGITS = 6

#: Anything that is not a Greek letter separates words. The dots matter:
#: "Α.Ε.Δ.ΠΩΓΩΝΑΤΟΣ" is one run of characters and four words, and treating
#: it as one word yields ΑΕΔ — the initials the rule exists to avoid.
_NOT_GREEK = re.compile(r"[^Α-ΩΆΈΉΊΌΎΏΪΫ]+")

#: Latin letters that are drawn identically to Greek ones. Somebody with an
#: English keyboard layout typing what is printed on their card produces these
#: without noticing, and the login would fail for a code they typed correctly.
_LOOKALIKE = str.maketrans(
    "ABEZHIKMNOPTYX",
    "ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ",
)


def normalise(raw: str) -> str:
    """What the reader typed, as the code was issued.

    Case, spaces and the Latin lookalikes are all forgiven — none of them is
    the secret, and every one of them is a way to be told your correct code is
    wrong.
    """
    cleaned = raw.strip().upper().replace(" ", "")
    return cleaned.translate(_LOOKALIKE)


def _candidates(name: str) -> list[str]:
    """Prefixes to try for a club, best first.

    The first word of four letters or more, because that is what people call
    the club: "Α.Ε. ΓΙΑΝΝΕΝΑ 2004" is Γιάννενα, not ΑΕΓ. Initial-only forms
    like Α.Ε. and Π.Α.Ο. are shared by dozens of clubs and identify none.
    """
    letters = [w for w in _NOT_GREEK.split(name.upper()) if w]
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
    taken = set(
        (
            await db.execute(
                select(ClubAccessCode.prefix).where(
                    ClubAccessCode.association_id == association_id
                )
            )
        )
        .scalars()
        .all()
    )

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
    code = ClubAccessCode(
        association_id=association_id,
        team_id=team.id,
        prefix=prefix,
        code_hash=hash_password(plaintext),
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
    prefix, _, _rest = cleaned.partition("-")
    if not prefix or not _rest:
        return None

    code = (
        await db.execute(
            select(ClubAccessCode).where(
                ClubAccessCode.association_id == association_id,
                ClubAccessCode.prefix == prefix,
                ClubAccessCode.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if code is None:
        return None

    now = datetime.now(UTC)
    if code.locked_until is not None and code.locked_until > now:
        return None

    if not verify_password(cleaned, code.code_hash):
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
