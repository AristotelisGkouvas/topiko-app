from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, str_enum
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.association import Association


class User(Base, TimestampMixin):
    """Admin or editor. There is no public sign-up: accounts are created by the
    admin, because write access to live results is only ever handed to a small
    number of trusted people."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(160))

    role: Mapped[UserRole] = mapped_column(
        str_enum(UserRole, 16), nullable=False, default=UserRole.EDITOR
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    associations: Mapped[list[UserAssociation]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN

    def __repr__(self) -> str:
        return f"<User {self.email} {self.role}>"


class UserAssociation(Base, TimestampMixin):
    """Which associations an editor may touch, and how far.

    Admins are global and need no rows here — their scope comes from the role,
    not from this table.
    """

    __tablename__ = "user_associations"
    __table_args__ = (
        UniqueConstraint("user_id", "association_id", name="uq_user_associations_pair"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    association_id: Mapped[int] = mapped_column(
        ForeignKey("associations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Separate from plain access: someone may be allowed to see the dashboard
    # for an association without being trusted to change a score mid-match.
    can_edit_live: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped[User] = relationship(back_populates="associations")
    association: Mapped[Association] = relationship()

    def __repr__(self) -> str:
        return f"<UserAssociation user={self.user_id} assoc={self.association_id}>"


class AuditLog(Base):
    """Who changed what, and when.

    Not optional once third parties can write: it is the only answer to
    "I did not enter that score". Append-only — nothing in the app updates or
    deletes these rows.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_entity", "entity_type", "entity_id"),
        Index("ix_audit_log_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Kept even if the account is later deleted, so the trail survives.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    user_email: Mapped[str | None] = mapped_column(String(255))
    association_id: Mapped[int | None] = mapped_column(
        ForeignKey("associations.id", ondelete="SET NULL"), index=True
    )

    action: Mapped[str] = mapped_column(String(64), nullable=False)  # match.update_score
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[int | None] = mapped_column()

    old_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    new_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped[User | None] = relationship()

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} {self.entity_type}#{self.entity_id}>"
