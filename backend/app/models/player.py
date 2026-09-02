"""Players, what the federation publishes about them, and their bans."""

from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Player(Base, TimestampMixin):
    """One footballer on an association's register.

    Identity is the federation's own player_id. Names repeat — a register of
    fifteen thousand holds several ΓΕΩΡΓΙΟΥ ΓΕΩΡΓΙΟΣ — so unlike clubs, whose
    names are nearly unique, matching players by name is never safe.
    """

    __tablename__ = "players"
    __table_args__ = (
        UniqueConstraint("association_id", "slug", name="uq_players_slug"),
        UniqueConstraint(
            "association_id", "external_id", name="uq_players_external"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str] = mapped_column(String(140), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    birth_year: Mapped[int | None] = mapped_column(Integer)
    external_id: Mapped[str | None] = mapped_column(String(64), index=True)

    stats: Mapped[list[PlayerStat]] = relationship(
        back_populates="player", cascade="all, delete-orphan",
        passive_deletes=True,
    )
    suspensions: Mapped[list[PlayerSuspension]] = relationship(
        back_populates="player", cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PlayerStat(Base, TimestampMixin):
    """A player's line in one competition's published leaderboards.

    Every count is nullable and NULL means *unknown*. The source publishes only
    the head of each list — ten scorers, twenty for minutes — so a player who
    does not appear in the yellow-card table may have none, or may have fewer
    than the tenth-placed player. Storing a zero would assert the first, and
    the site never says it.
    """

    __tablename__ = "player_stats"
    __table_args__ = (
        UniqueConstraint("league_id", "player_id", name="uq_player_stats"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    league_id: Mapped[int] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"), index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), index=True
    )
    #: The club the player is listed under in this competition.
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL")
    )

    goals: Mapped[int | None] = mapped_column(Integer)
    own_goals: Mapped[int | None] = mapped_column(Integer)
    red_cards: Mapped[int | None] = mapped_column(Integer)
    yellow_cards: Mapped[int | None] = mapped_column(Integer)
    minutes: Mapped[int | None] = mapped_column(Integer)

    player: Mapped[Player] = relationship(back_populates="stats")
    league: Mapped["League"] = relationship()  # noqa: F821
    team: Mapped["Team | None"] = relationship()  # noqa: F821


class PlayerSuspension(Base, TimestampMixin):
    """One disciplinary ban.

    Keyed by the match it followed, because a player can be banned more than
    once in a season and the federation lists one row per offence.
    """

    __tablename__ = "player_suspensions"
    __table_args__ = (
        UniqueConstraint(
            "league_id",
            "player_id",
            "matchday",
            "decided_on",
            name="uq_player_suspensions",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    league_id: Mapped[int] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"), index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), index=True
    )
    #: The fixture it followed, when the federation printed a game_id we hold.
    match_id: Mapped[int | None] = mapped_column(
        ForeignKey("matches.id", ondelete="SET NULL")
    )

    matchday: Mapped[int | None] = mapped_column(Integer)
    decided_on: Mapped[date | None] = mapped_column(Date)
    #: How many matches the ban runs for.
    matches: Mapped[int] = mapped_column(Integer, nullable=False)
    #: The pairing as printed, kept for the rows whose game_id we cannot place.
    fixture: Mapped[str | None] = mapped_column(String(200))

    player: Mapped[Player] = relationship(back_populates="suspensions")
    league: Mapped["League"] = relationship()  # noqa: F821
    match: Mapped["Match | None"] = relationship()  # noqa: F821
