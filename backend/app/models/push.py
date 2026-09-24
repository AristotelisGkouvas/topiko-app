"""Where to send a notification.

Readers have no accounts, so there is nobody to attach this to. A subscription
is a browser: the endpoint the push service gave it, the keys that let us
encrypt to it, and which club it asked about.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
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

    #: Which events this browser wants for *this* club, as {kind: bool}.
    #:
    #: A dict rather than five columns: the set of things worth a notification
    #: is a product decision that has already changed twice, and a migration
    #: per change is how a feature stops being adjusted. Missing keys mean the
    #: default, so an older row keeps working when a new kind is added.
    prefs: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    #: When not to send, as hours in the browser's own local time. Stored on
    #: every row this browser owns and written together, because it is a
    #: property of the phone and not of the club — the alternative is a second
    #: table joined on an endpoint string.
    #:
    #: Null means no quiet hours. The pair is only meaningful together, and a
    #: window that wraps midnight (23→8) is the normal case rather than the
    #: exception.
    quiet_from: Mapped[int | None] = mapped_column(SmallInteger)
    quiet_to: Mapped[int | None] = mapped_column(SmallInteger)
    #: Minutes east of UTC, as the browser reports them. Without it "23:00" is
    #: 23:00 on the server, which is a different hour in the reader's evening.
    utc_offset: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )

    #: Set when the push service last told us this endpoint is gone. Kept
    #: rather than deleted immediately so a transient 404 during an outage
    #: does not quietly unsubscribe everybody.
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failures: Mapped[int] = mapped_column(default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<PushSubscription {self.team_slug} {self.endpoint[:32]}…>"
