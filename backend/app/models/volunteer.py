"""Codes that let a club's own people report its matches.

The federation has a handful of editors and two hundred clubs. Waiting for an
editor to hear a Sunday result and type it in is why the site is hours behind
the pitch. A club representative standing on the touchline can report it in
seconds — but they are not getting an account, an email address and a password
for four Sundays a year.

So: a code per club, handed out on paper, typed into a phone. It buys exactly
one thing — reporting that club's own matches — and nothing else on the site.

On the code itself
------------------
The mock-up shows ΑΤΛ-4827. The letters identify the club and are not a secret
(they are its initials), which leaves four digits, or ten thousand guesses, to
report scores as somebody else. That is a weekend's work for a script.

So the digits are six rather than four. ΑΤΛ-482719 is no harder to read off a
piece of paper and read out over the phone, and it is a hundred times the
space. On top of that the code locks itself for a quarter of an hour after ten
wrong tries, which puts a full search past any timescale that matters.

Stored hashed, like a password, because it is one. It is shown once, when it
is generated, and never again — if it is lost, a new one is issued.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.association import Association
    from app.models.club import Team

#: Wrong tries before the code stops answering.
MAX_FAILURES = 10

#: How long it stays shut. Short on purpose: a lockout keyed to the code can
#: be triggered by anybody who knows the club's initials, so it has to heal by
#: itself rather than needing an editor on a Sunday afternoon.
LOCKOUT_MINUTES = 15


class ClubAccessCode(Base, TimestampMixin):
    """One code, for one club."""

    __tablename__ = "club_access_codes"
    __table_args__ = (
        # The prefix is how a login finds the row without hashing against every
        # code in the federation, so at most one *live* code may hold it.
        #
        # Only the live ones: a reissued card keeps the club's prefix, and the
        # code it replaces stays in the table so the events it authored still
        # name who reported them. A plain unique constraint would make the
        # second issue fail.
        Index(
            "uq_club_code_prefix",
            "association_id",
            "prefix",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )

    #: The readable half — the club's initials. Public by nature.
    prefix: Mapped[str] = mapped_column(String(12), nullable=False)
    #: Argon2 over the whole code, prefix included.
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    #: Who holds the paper. "Γιώργος, έφορος" is worth more in six months than
    #: a row that only says a code exists.
    label: Mapped[str | None] = mapped_column(String(120))

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    failures: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    association: Mapped[Association] = relationship()
    team: Mapped[Team] = relationship()

    def __repr__(self) -> str:
        return f"<ClubAccessCode {self.prefix} team={self.team_id}>"
