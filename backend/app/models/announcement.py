"""Notices the federation posts.

Read rather than written here: epsip.gr publishes them on one page and nowhere
else — no feed, no per-item link — so a reader who wants to know whether a
matchday has been moved has to go and look. Mirroring them puts that next to
the fixtures it affects.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.association import Association


class Announcement(Base, TimestampMixin):
    """One notice."""

    __tablename__ = "announcements"
    __table_args__ = (
        # The source gives no id, so identity is what it does give. A notice
        # edited in place keeps its title and time and updates here rather
        # than appearing twice.
        UniqueConstraint(
            "association_id",
            "published_at",
            "title",
            name="uq_announcements_identity",
        ),
        Index("ix_announcements_published", "association_id", "published_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    #: As published. Null when the source printed no date, which happens.
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Plain text. The source's markup is a table layout from 2009 and carries
    #: no meaning worth keeping; what a reader needs is the words.
    body: Mapped[str | None] = mapped_column(Text)
    #: The little icon the source puts beside each one, kept as an absolute
    #: URL so the page does not have to know where it came from.
    image_url: Mapped[str | None] = mapped_column(String(500))

    association: Mapped[Association] = relationship()

    def __repr__(self) -> str:
        return f"<Announcement {self.title[:40]!r}>"
