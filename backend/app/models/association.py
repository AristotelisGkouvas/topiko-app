from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Date, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.club import Field, Team
    from app.models.league import League


class Association(Base, TimestampMixin):
    """A tenant: one ΕΠΣ (Ένωση Ποδοσφαιρικών Σωματείων).

    Every other domain row hangs off exactly one association, directly or
    through its league. There is no such thing as a global query.
    """

    __tablename__ = "associations"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(40))
    region: Mapped[str | None] = mapped_column(String(80))

    source_url: Mapped[str | None] = mapped_column(String(255))
    # Per-tenant scraper knobs (selectors, league ids, request headers).
    # Adding association #2 should mean editing this, not editing code.
    scraper_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    logo_url: Mapped[str | None] = mapped_column(String(255))
    primary_color: Mapped[str | None] = mapped_column(String(9))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    seasons: Mapped[list[Season]] = relationship(
        back_populates="association",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    leagues: Mapped[list[League]] = relationship(
        back_populates="association", passive_deletes=True
    )
    teams: Mapped[list[Team]] = relationship(
        back_populates="association", passive_deletes=True
    )
    fields: Mapped[list[Field]] = relationship(
        back_populates="association", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<Association {self.slug}>"


class Season(Base, TimestampMixin):
    """A football season inside one association, e.g. "2025-2026".

    Scoped per association rather than global: unions do not always start and
    end their season on the same dates.
    """

    __tablename__ = "seasons"
    __table_args__ = (
        UniqueConstraint("association_id", "slug", name="uq_seasons_association_slug"),
        Index("ix_seasons_association_current", "association_id", "is_current"),
        # One current season per association. Everything that says "this
        # season" resolves through it, and two would make that a coin toss.
        Index(
            "uq_seasons_one_current",
            "association_id",
            unique=True,
            postgresql_where=text("is_current"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(32), nullable=False)   # "2025-2026"
    name: Mapped[str] = mapped_column(String(64), nullable=False)   # "Περίοδος 2025-2026"
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    association: Mapped[Association] = relationship(back_populates="seasons")
    leagues: Mapped[list[League]] = relationship(
        back_populates="season", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<Season {self.slug} assoc={self.association_id}>"
