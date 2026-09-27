"""Anonymous site statistics: page views and reader actions.

No cookies and nothing that identifies a person. There is no IP address and
no user agent in these tables: the server reads both to derive a *daily*
visitor hash — HMAC(secret, date + IP + UA), cut to 16 hex characters — and a
device/browser/OS family, and throws the originals away. Tomorrow the same
reader hashes to something else, so nobody can be followed across days, and
the hash cannot be turned back into an address. That is what lets the site
count without a consent banner.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PageView(Base):
    """One page shown to one reader."""

    __tablename__ = "page_views"
    __table_args__ = (
        Index("ix_page_views_association_at", "association_id", "at"),
        Index("ix_page_views_route", "association_id", "route"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False
    )
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    #: The path as visited, without the query string ("/agones/52455").
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    #: The page kind ("/agones/[id]"), for "which pages" rather than "which URLs".
    route: Mapped[str] = mapped_column(String(80), nullable=False)
    #: What the page is about, when it is about one thing: "match:52455",
    #: "team:a-e-dafnoulas", "league:b-katigoria", "player:…", "field:…".
    entity: Mapped[str | None] = mapped_column(String(160))
    #: Daily visitor hash — see the module docstring.
    visitor: Mapped[str] = mapped_column(String(16), nullable=False)
    referrer_host: Mapped[str | None] = mapped_column(String(120))
    utm_source: Mapped[str | None] = mapped_column(String(80))
    utm_medium: Mapped[str | None] = mapped_column(String(80))
    utm_campaign: Mapped[str | None] = mapped_column(String(120))
    device: Mapped[str | None] = mapped_column(String(10))  # mobile / tablet / desktop
    browser: Mapped[str | None] = mapped_column(String(24))
    os: Mapped[str | None] = mapped_column(String(24))
    lang: Mapped[str | None] = mapped_column(String(12))
    viewport_width: Mapped[int | None] = mapped_column(SmallInteger)
    dark: Mapped[bool | None] = mapped_column(Boolean)
    #: Opened from the home screen as an installed app.
    installed: Mapped[bool | None] = mapped_column(Boolean)
    #: Filled in when the reader leaves the page.
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    scroll_pct: Mapped[int | None] = mapped_column(SmallInteger)


class AnalyticsEvent(Base):
    """Something a reader did: shared, searched, followed, voted, got an error."""

    __tablename__ = "analytics_events"
    __table_args__ = (Index("ix_analytics_events_association_at", "association_id", "at", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False
    )
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    path: Mapped[str | None] = mapped_column(String(255))
    visitor: Mapped[str] = mapped_column(String(16), nullable=False)
    props: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
