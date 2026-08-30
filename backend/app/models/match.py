from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, str_enum
from app.models.enums import ConflictStatus, DataSource, MatchStatus, StandingZone

if TYPE_CHECKING:
    from app.models.club import Field, Team
    from app.models.league import League
    from app.models.user import User

# How long a manual edit outranks the scraper. Once a match is this far past
# kickoff the official result on the federation site is treated as final and the
# scraper may overwrite again without asking anyone.
MANUAL_PRIORITY_WINDOW = timedelta(hours=48)


class Match(Base, TimestampMixin):
    """Αναμέτρηση.

    Two writers can touch this row: the scraper and a human editor. The
    reconciliation fields below decide who wins; see `scraper_may_overwrite`.
    """

    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint("home_team_id <> away_team_id", name="teams_differ"),
        UniqueConstraint("league_id", "external_id", name="uq_matches_league_external"),
        Index("ix_matches_league_matchday", "league_id", "matchday"),
        Index("ix_matches_kickoff", "kickoff_at"),
        Index("ix_matches_live", "is_live"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    league_id: Mapped[int] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"), nullable=False, index=True
    )

    matchday: Mapped[int | None] = mapped_column(Integer)  # αγωνιστική
    home_team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    away_team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    field_id: Mapped[int | None] = mapped_column(
        ForeignKey("fields.id", ondelete="SET NULL")
    )

    kickoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[MatchStatus] = mapped_column(
        str_enum(MatchStatus, 20), nullable=False, default=MatchStatus.SCHEDULED
    )

    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    home_score_ht: Mapped[int | None] = mapped_column(Integer)
    away_score_ht: Mapped[int | None] = mapped_column(Integer)
    # Minute shown on the live badge. Null unless the match is running.
    minute: Mapped[int | None] = mapped_column(Integer)

    referee: Mapped[str | None] = mapped_column(String(120))
    # Free text shown on the card, e.g. a weather postponement notice.
    note: Mapped[str | None] = mapped_column(Text)

    # --- reconciliation -------------------------------------------------
    data_source: Mapped[DataSource] = mapped_column(
        str_enum(DataSource, 20), nullable=False, default=DataSource.SCRAPER
    )
    is_live: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_manual_edit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_scraped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    external_id: Mapped[str | None] = mapped_column(String(64))

    league: Mapped[League] = relationship(back_populates="matches")
    home_team: Mapped[Team] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped[Team] = relationship(foreign_keys=[away_team_id])
    field: Mapped[Field | None] = relationship()
    conflicts: Mapped[list[ScrapeConflict]] = relationship(
        back_populates="match", cascade="all, delete-orphan", passive_deletes=True
    )

    def scraper_may_overwrite(self, now: datetime | None = None) -> bool:
        """True when the scraper is allowed to replace this row's scores.

        A manual edit outranks the scraper, but not forever: once the match is
        MANUAL_PRIORITY_WINDOW past kickoff *and* nobody has touched it since,
        the official result wins again. Without that expiry every live-edited
        match would need a human to bless it before it could ever agree with the
        federation site.

        The window runs from whichever came last, kickoff or the edit — an
        editor correcting a score on day three has to be given three more days,
        or the next scrape would undo them immediately.

        `last_scraped_at` deliberately plays no part. It is bumped on every run
        whether or not anything was written, so any rule consulting it would let
        the very next scrape overrule a manual edit.
        """
        if self.last_manual_edit_at is None:
            return True
        now = now or datetime.now(timezone.utc)
        if self.kickoff_at is None:
            # No date to age out from: a human touched it, so leave it alone
            # until someone fills in when it was actually played.
            return False
        protected_until = max(self.kickoff_at, self.last_manual_edit_at)
        return now - protected_until > MANUAL_PRIORITY_WINDOW

    def __repr__(self) -> str:
        return f"<Match {self.home_team_id}-{self.away_team_id} {self.status}>"


class Standing(Base, TimestampMixin):
    """A row of the βαθμολογία. Derived data — recomputed, never hand-edited."""

    __tablename__ = "standings"
    __table_args__ = (
        UniqueConstraint("league_id", "team_id", name="uq_standings_league_team"),
        Index("ix_standings_league_position", "league_id", "position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    league_id: Mapped[int] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )

    position: Mapped[int] = mapped_column(Integer, nullable=False)
    previous_position: Mapped[int | None] = mapped_column(Integer)

    played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    won: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    drawn: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    goals_for: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    goals_against: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    goal_difference: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Last five results, newest last, as a string of Ν/Ι/Η — the form pills.
    form: Mapped[str | None] = mapped_column(String(10))
    zone: Mapped[StandingZone | None] = mapped_column(str_enum(StandingZone, 24))

    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    league: Mapped[League] = relationship(back_populates="standings")
    team: Mapped[Team] = relationship()

    def __repr__(self) -> str:
        return f"<Standing league={self.league_id} #{self.position}>"


class ScrapeConflict(Base, TimestampMixin):
    """Logged when the scraper found a value disagreeing with a newer manual
    edit. The scraper never resolves these itself — it records and moves on."""

    __tablename__ = "scrape_conflicts"
    __table_args__ = (Index("ix_scrape_conflicts_status", "status", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )

    scraped_value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    current_value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    status: Mapped[ConflictStatus] = mapped_column(
        str_enum(ConflictStatus, 24), nullable=False, default=ConflictStatus.OPEN
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    match: Mapped[Match] = relationship(back_populates="conflicts")
    resolved_by: Mapped[User | None] = relationship()

    def __repr__(self) -> str:
        return f"<ScrapeConflict match={self.match_id} {self.status}>"
