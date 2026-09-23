"""Where to send a notification.

Readers have no accounts, so there is nobody to attach this to. A subscription
is a browser: the endpoint the push service gave it, the keys that let us
encrypt to it, and which club it asked about.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PushSubscription(Base, TimestampMixin):
    """One browser, one club."""

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        # The same browser following two clubs is two rows; the same browser
        # subscribing twice to one club is not.
        UniqueConstraint("endpoint", "team_slug", name="uq_push_endpoint_team"),
        Index("ix_push_team", "association_id", "team_slug"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    #: Given by the browser's push service. Long, and unique to this
    #: installation — it is the address, not an identifier we chose.
    endpoint: Mapped[str] = mapped_column(String(600), nullable=False)
    #: The browser's public key and auth secret, for encrypting the payload.
    #: Without both, a push can be sent but not read.
    p256dh: Mapped[str] = mapped_column(String(200), nullable=False)
    auth: Mapped[str] = mapped_column(String(100), nullable=False)

    #: Which club this subscription is about. A slug rather than an id because
    #: that is what the browser knows — it followed a club from its page.
    team_slug: Mapped[str] = mapped_column(String(120), nullable=False)

    #: Set when the push service last told us this endpoint is gone. Kept
    #: rather than deleted immediately so a transient 404 during an outage
    #: does not quietly unsubscribe everybody.
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failures: Mapped[int] = mapped_column(default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<PushSubscription {self.team_slug} {self.endpoint[:32]}…>"
