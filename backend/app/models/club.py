from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, str_enum
from app.models.enums import FieldSurface

if TYPE_CHECKING:
    from app.models.association import Association
    from app.models.league import LeagueTeam


class Field(Base, TimestampMixin):
    """Γήπεδο. Feeds the map screen (pin + info card) and match venue lines."""

    __tablename__ = "fields"
    __table_args__ = (
        UniqueConstraint("association_id", "slug", name="uq_fields_association_slug"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(60))

    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120))
    postal_code: Mapped[str | None] = mapped_column(String(16))
    # WGS84. Numeric (not float) so coordinates round-trip exactly.
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))

    surface: Mapped[FieldSurface | None] = mapped_column(str_enum(FieldSurface, 20))
    capacity: Mapped[int | None] = mapped_column(Integer)
    has_floodlights: Mapped[bool | None] = mapped_column(Boolean)
    notes: Mapped[str | None] = mapped_column(Text)

    external_id: Mapped[str | None] = mapped_column(String(64), index=True)

    association: Mapped[Association] = relationship(back_populates="fields")
    home_teams: Mapped[list[Team]] = relationship(back_populates="home_field")

    def __repr__(self) -> str:
        return f"<Field {self.slug}>"


class Team(Base, TimestampMixin):
    """Σωματείο. Belongs to an association, not to a league — the same club
    plays in different leagues across seasons (see LeagueTeam)."""

    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint("association_id", "slug", name="uq_teams_association_slug"),
        Index("ix_teams_association_name", "association_id", "name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(60))
    # Two-letter monogram used by the badge component in the UI kit (ΖΙ, ΔΩ).
    initials: Mapped[str | None] = mapped_column(String(4))

    founded_year: Mapped[int | None] = mapped_column(Integer)
    city: Mapped[str | None] = mapped_column(String(120))
    logo_url: Mapped[str | None] = mapped_column(String(255))
    primary_color: Mapped[str | None] = mapped_column(String(9))
    secondary_color: Mapped[str | None] = mapped_column(String(9))

    home_field_id: Mapped[int | None] = mapped_column(
        ForeignKey("fields.id", ondelete="SET NULL")
    )
    external_id: Mapped[str | None] = mapped_column(String(64), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    association: Mapped[Association] = relationship(back_populates="teams")
    home_field: Mapped[Field | None] = relationship(back_populates="home_teams")
    league_entries: Mapped[list[LeagueTeam]] = relationship(
        back_populates="team", cascade="all, delete-orphan", passive_deletes=True
    )
    photos: Mapped[list[TeamPhoto]] = relationship(
        back_populates="team",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(TeamPhoto.position, TeamPhoto.id.desc())",
    )
    sponsors: Mapped[list[Sponsor]] = relationship(
        back_populates="team",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(Sponsor.position, Sponsor.id)",
    )

    def __repr__(self) -> str:
        return f"<Team {self.slug}>"


class TeamPhoto(Base, TimestampMixin):
    """One picture in a club's gallery.

    Two files: the full image and a thumbnail for the grid, both WebPs written
    by app.services.media. Width and height are kept so the page can reserve
    the space before the image arrives, instead of jumping as it loads.
    """

    __tablename__ = "team_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(255), nullable=False)
    thumb_url: Mapped[str] = mapped_column(String(255), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    caption: Mapped[str | None] = mapped_column(String(200))
    #: Lower first. New photos go in at 0, so the newest leads until someone
    #: puts another first on purpose.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    team: Mapped[Team] = relationship(back_populates="photos")


class Sponsor(Base, TimestampMixin):
    """A club's sponsor, shown on the club's page and on its matches.

    Per club, not per federation: in the regional divisions a sponsor is the
    bakery on the square, and it pays one club, not the league.
    """

    __tablename__ = "sponsors"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    website_url: Mapped[str | None] = mapped_column(String(255))
    logo_url: Mapped[str | None] = mapped_column(String(255))
    #: Lower first — the main sponsor at the top.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Off rather than deleted when a deal lapses, so it can come back next
    #: season without the logo being found and uploaded again.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    team: Mapped[Team] = relationship(back_populates="sponsors")
