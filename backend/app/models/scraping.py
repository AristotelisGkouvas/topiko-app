from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, str_enum
from app.models.enums import ScrapeRunStatus

if TYPE_CHECKING:
    from app.models.association import Association
    from app.models.club import Team
    from app.models.league import League
    from app.models.user import User


class ScrapeRun(Base):
    """One execution of the scraper, successful or not.

    Exists to answer "why is the site showing stale data?" — a question that is
    otherwise unanswerable, because a scraper that quietly fails looks exactly
    like a federation that has not published anything.
    """

    __tablename__ = "scrape_runs"
    __table_args__ = (
        Index("ix_scrape_runs_association_started", "association_id", "started_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Null for a run that covered the whole association.
    league_id: Mapped[int | None] = mapped_column(
        ForeignKey("leagues.id", ondelete="SET NULL")
    )
    source_key: Mapped[str] = mapped_column(String(40), nullable=False)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[ScrapeRunStatus] = mapped_column(
        str_enum(ScrapeRunStatus, 16), nullable=False, default=ScrapeRunStatus.RUNNING
    )

    http_requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    matches_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    matches_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    matches_unchanged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Rows the scraper deliberately declined to touch because a newer manual
    # edit outranked it.
    matches_deferred: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    teams_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    conflicts_opened: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Non-fatal problems: an unresolvable club, a row that would not split, a
    # table that disagreed with the results.
    warnings: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    error: Mapped[str | None] = mapped_column(Text)

    association: Mapped[Association] = relationship()
    league: Mapped[League | None] = relationship()

    @property
    def duration_seconds(self) -> float | None:
        if self.finished_at is None:
            return None
        return (self.finished_at - self.started_at).total_seconds()

    def __repr__(self) -> str:
        return f"<ScrapeRun {self.source_key} {self.status}>"


class TeamAlias(Base, TimestampMixin):
    """An extra name that resolves to a club.

    The escape hatch for the day a source writes a club differently enough that
    normalisation misses it. Without it the only outcomes are a duplicate club
    or a match that silently never imports, and both are worse than a row a
    human can add in ten seconds.
    """

    __tablename__ = "team_aliases"
    __table_args__ = (
        # One normalised form cannot point at two clubs in the same association,
        # which is exactly the ambiguity the alias is there to remove.
        UniqueConstraint(
            "association_id", "normalized", name="uq_team_aliases_assoc_normalized"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )

    #: The name exactly as the source wrote it, kept for the audit trail.
    alias: Mapped[str] = mapped_column(String(160), nullable=False)
    #: Output of naming.normalize(alias) — what lookups actually compare.
    normalized: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    #: Which source this spelling came from, or null if a human typed it.
    source_key: Mapped[str | None] = mapped_column(String(40))

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    association: Mapped[Association] = relationship()
    team: Mapped[Team] = relationship()
    created_by: Mapped[User | None] = relationship()

    def __repr__(self) -> str:
        return f"<TeamAlias {self.alias!r} -> team={self.team_id}>"
