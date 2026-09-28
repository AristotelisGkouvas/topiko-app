"""The federation's own sponsors, and how often any sponsor is seen.

Club sponsors (app.models.club.Sponsor) pay one club and appear on its page
and matches. These pay the platform — the association — and appear across it,
in the places they bought, between two dates.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

#: Where a platform sponsor can be shown. Bought one by one.
PLACEMENTS = ("site", "home", "match", "share")

#: What a sponsor sells, as far as where it may appear is concerned.
CATEGORIES = ("general", "betting", "alcohol", "tobacco")
#: Never beside children's football: not on a youth league's matches, and not
#: in the site-wide or home placements, which sit around every league.
RESTRICTED = frozenset({"betting", "alcohol", "tobacco"})


class PlatformSponsor(Base, TimestampMixin):
    """A sponsor of the whole platform, live between `starts_on` and `ends_on`.

    The dates do the work nobody remembers to do: the sponsor appears on the
    first day and disappears after the last, and an expired one stays in the
    table — for the history, and so a renewal is two new dates rather than a
    logo hunted down and uploaded again.
    """

    __tablename__ = "platform_sponsors"
    __table_args__ = (
        Index("ix_platform_sponsors_association_dates", "association_id", "ends_on"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    website_url: Mapped[str | None] = mapped_column(String(255))
    #: WebP, for pages.
    logo_url: Mapped[str | None] = mapped_column(String(255))
    #: PNG, for the share images: the image renderer reads PNG and JPEG only.
    logo_png_url: Mapped[str | None] = mapped_column(String(255))
    #: Null: from the day it is saved.
    starts_on: Mapped[date | None] = mapped_column(Date)
    #: Null: until switched off. Inclusive — the last day it is shown.
    ends_on: Mapped[date | None] = mapped_column(Date)
    #: A subset of PLACEMENTS.
    placements: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    #: Lower first. Ties go to the older contract.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: A pause switch, independent of the dates.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    #: For the office: contact, amount, invoice number. Never shown publicly.
    note: Mapped[str | None] = mapped_column(String(500))
    #: One of CATEGORIES. RESTRICTED ones are kept off youth football.
    category: Mapped[str] = mapped_column(
        String(16), nullable=False, default="general", server_default="general"
    )
    #: The private link to this sponsor's numbers (/xorigos/<token>): made on
    #: first request from the dashboard, unguessable, and the only way in.
    report_token: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)


class SponsorDailyStat(Base):
    """Views and clicks of one sponsor on one day.

    A counter per day, not a row per event: what a sponsor is shown at renewal
    is "12,000 views in October", and a row per view would be a table that
    grows by the page view to answer a question asked once a season. No
    cookies and no reader id — a view is a sponsor on a screen, nothing more.
    """

    __tablename__ = "sponsor_daily_stats"
    __table_args__ = (
        UniqueConstraint("kind", "ref_id", "day", name="uq_sponsor_daily_stats"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: "platform" or "club".
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    #: PlatformSponsor.id or Sponsor.id, by kind. No foreign key: a deleted
    #: sponsor's history is worth keeping, and the stats are never joined back.
    ref_id: Mapped[int] = mapped_column(Integer, nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    views: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    clicks: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


#: What an inquiry is about.
INQUIRY_KINDS = ("platform", "club", "other")


class SponsorInquiry(Base, TimestampMixin):
    """Somebody who filled in "Γίνε χορηγός": a business that wants to be seen
    on the site, or a club that wants its sponsors shown. Read in the admin,
    marked handled once somebody has called back. Never shown publicly."""

    __tablename__ = "sponsor_inquiries"

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: One of INQUIRY_KINDS.
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    business: Mapped[str | None] = mapped_column(String(160))
    #: Phone or email, as typed: whichever the person prefers to be reached on.
    contact: Mapped[str] = mapped_column(String(160), nullable=False)
    #: For a club inquiry, which club (free text: they may not be on the site).
    club: Mapped[str | None] = mapped_column(String(160))
    message: Mapped[str | None] = mapped_column(Text)
    handled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
