"""What happened during a match, as it happened.

The difference between mirroring the federation and being a source. Everything
else here is read from epsip.gr hours or days late; these rows are typed in
from the touchline by somebody watching, and they are the only record of the
minute a goal was scored that exists anywhere.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, str_enum
from app.models.enums import MatchEventKind

if TYPE_CHECKING:
    from app.models.club import Team
    from app.models.match import Match
    from app.models.player import Player
    from app.models.user import User


class MatchEvent(Base, TimestampMixin):
    """One thing that happened, at one minute."""

    __tablename__ = "match_events"
    __table_args__ = (
        Index("ix_match_events_match_minute", "match_id", "minute"),
        # What makes recording safe without signal. The phone names each event
        # before sending it, so a request that succeeded but whose reply never
        # came back can be retried without putting the goal on the board twice.
        UniqueConstraint("client_id", name="uq_match_events_client_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    #: Chosen by the device that recorded it, before it was sent. Null for
    #: anything entered straight from a desk, where there was never a queue.
    client_id: Mapped[str | None] = mapped_column(String(64))
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[MatchEventKind] = mapped_column(
        str_enum(MatchEventKind, 20), nullable=False
    )

    #: Which side. Null for events that belong to the match rather than a team
    #: — kickoff, half time, the final whistle.
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL")
    )

    #: Minute as shown on the badge. Null is allowed and expected: the person
    #: entering this is standing up in a crowd, and a goal recorded without a
    #: minute is still a goal.
    minute: Mapped[int | None] = mapped_column(Integer)

    #: Filled in later, from the register, if at all. The mock-up is explicit
    #: that the scorer is added afterwards rather than on the spot — asking for
    #: it in the moment is how the goal itself goes unrecorded.
    player_id: Mapped[int | None] = mapped_column(
        ForeignKey("players.id", ondelete="SET NULL")
    )
    #: What was typed, when nobody picked a player from the register. Kept
    #: because a name somebody wrote is worth more than an empty column.
    player_name: Mapped[str | None] = mapped_column(String(160))
    #: The other half of a substitution.
    related_player_id: Mapped[int | None] = mapped_column(
        ForeignKey("players.id", ondelete="SET NULL")
    )

    note: Mapped[str | None] = mapped_column(Text)

    #: Who typed it. Not nullable in spirit — an event with no author cannot be
    #: questioned — but ON DELETE SET NULL, so removing an account does not
    #: delete the record of the match.
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    match: Mapped[Match] = relationship(back_populates="events")
    team: Mapped[Team | None] = relationship()
    player: Mapped[Player | None] = relationship(foreign_keys=[player_id])
    related_player: Mapped[Player | None] = relationship(
        foreign_keys=[related_player_id]
    )
    created_by: Mapped[User | None] = relationship()

    def __repr__(self) -> str:
        return f"<MatchEvent {self.kind} match={self.match_id} {self.minute}'>"
