"""A match as the federation's report records it: the timeline and the line-ups.

Read from epsip.gr's match report (display_game.php) after the final whistle.
Kept apart from MatchEvent on purpose: those are typed from the touchline while
the match is on, these are the official record afterwards, and the two answer
different questions — "what is happening" and "what happened". Rows are
replaced whole each time a report is read, so a correction on the federation's
side comes through as it is.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.player import Player

#: What a timeline line can be.
SHEET_KINDS = (
    "goal",
    "penalty_goal",
    "own_goal",
    "yellow",
    "second_yellow",
    "red",
    "sub_in",
    "sub_out",
)


class MatchSheetEvent(Base):
    """One line of the report's timeline."""

    __tablename__ = "match_sheet_events"
    __table_args__ = (Index("ix_match_sheet_events_match", "match_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    #: Order as printed, which is the order it happened in.
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    #: The side the player is listed under. For an own goal, the scorer's own
    #: club: the goal counts for the other one.
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"))
    #: One of SHEET_KINDS.
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    minute: Mapped[int | None] = mapped_column(Integer)
    #: Added time: 2 for "90+2'".
    stoppage: Mapped[int | None] = mapped_column(Integer)
    player_id: Mapped[int | None] = mapped_column(
        ForeignKey("players.id", ondelete="SET NULL"), index=True
    )
    #: As printed, for a player the register does not know.
    player_name: Mapped[str | None] = mapped_column(String(160))
    #: The score just after a goal ("2-0").
    score: Mapped[str | None] = mapped_column(String(9))

    player: Mapped[Player | None] = relationship()


class MatchLineup(Base):
    """A player named in the report: in the starting eleven or on the bench."""

    __tablename__ = "match_lineups"
    __table_args__ = (Index("ix_match_lineups_match", "match_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"))
    player_id: Mapped[int | None] = mapped_column(
        ForeignKey("players.id", ondelete="SET NULL"), index=True
    )
    player_name: Mapped[str] = mapped_column(String(160), nullable=False)
    birth_year: Mapped[int | None] = mapped_column(Integer)
    starter: Mapped[bool] = mapped_column(Boolean, nullable=False)

    player: Mapped[Player | None] = relationship()
