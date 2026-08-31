from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, str_enum
from app.models.enums import LeagueKind

if TYPE_CHECKING:
    from app.models.association import Association, Season
    from app.models.club import Team
    from app.models.match import Match, Standing


class League(Base, TimestampMixin):
    """Πρωτάθλημα/διοργάνωση for one association in one season.

    association_id is denormalised onto the league (rather than reached through
    the season) because every public query filters by tenant first; carrying it
    here keeps that filter one join shorter and makes the scope impossible to
    forget.
    """

    __tablename__ = "leagues"
    __table_args__ = (
        UniqueConstraint(
            "association_id", "season_id", "slug", name="uq_leagues_assoc_season_slug"
        ),
        Index("ix_leagues_association_season", "association_id", "season_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False, index=True
    )

    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(60))
    kind: Mapped[LeagueKind] = mapped_column(
        str_enum(LeagueKind, 20), nullable=False, default=LeagueKind.CHAMPIONSHIP
    )
    # 1 = Α΄ Κατηγορία, 2 = Β΄ Κατηγορία, ...
    tier: Mapped[int | None] = mapped_column(Integer)
    group_name: Mapped[str | None] = mapped_column(String(60))  # "1ος Όμιλος"
    #: "Κ10", "Παίδων", … or NULL for the open-age divisions. Kept apart
    #: from tier because a youth competition has no rung on the ladder,
    #: and the reader wants the two groups listed separately.
    age_group: Mapped[str | None] = mapped_column(String(24))

    total_matchdays: Mapped[int | None] = mapped_column(Integer)
    current_matchday: Mapped[int | None] = mapped_column(Integer)
    points_per_win: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    points_per_draw: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Standings zone bands, e.g.
    # {"promotion": [1], "promotion_playoff": [2, 3], "relegation": [9, 10]}
    # Drives the coloured rails on the standings table in the UI kit.
    zones: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    external_id: Mapped[str | None] = mapped_column(String(64), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    association: Mapped[Association] = relationship(back_populates="leagues")
    season: Mapped[Season] = relationship(back_populates="leagues")
    entries: Mapped[list[LeagueTeam]] = relationship(
        back_populates="league", cascade="all, delete-orphan", passive_deletes=True
    )
    matches: Mapped[list[Match]] = relationship(
        back_populates="league", cascade="all, delete-orphan", passive_deletes=True
    )
    standings: Mapped[list[Standing]] = relationship(
        back_populates="league", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<League {self.slug} season={self.season_id}>"


class LeagueTeam(Base, TimestampMixin):
    """Participation of a team in a league. Also the place to record a mid-season
    withdrawal or an administrative points deduction, both common in amateur
    football and both otherwise impossible to represent."""

    __tablename__ = "league_teams"
    __table_args__ = (
        UniqueConstraint("league_id", "team_id", name="uq_league_teams_league_team"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    league_id: Mapped[int] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )

    points_deduction: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    has_withdrawn: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    league: Mapped[League] = relationship(back_populates="entries")
    team: Mapped[Team] = relationship(back_populates="league_entries")

    def __repr__(self) -> str:
        return f"<LeagueTeam league={self.league_id} team={self.team_id}>"
