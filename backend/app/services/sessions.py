"""Ending a session before its token expires."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RevokedToken


async def revoke(db: AsyncSession, claims: dict[str, Any] | None) -> None:
    """Put this token's id on the list. A token without one (or an invalid
    token) has nothing to revoke. The caller commits."""
    if not claims or not claims.get("jti") or not claims.get("exp"):
        return
    now = datetime.now(UTC)
    # Swept here rather than on a schedule: logouts are rare, and each one
    # clearing what has expired keeps the table at a few rows.
    await db.execute(delete(RevokedToken).where(RevokedToken.expires_at < now))
    await db.execute(
        insert(RevokedToken)
        .values(
            jti=str(claims["jti"]),
            expires_at=datetime.fromtimestamp(int(claims["exp"]), UTC),
        )
        .on_conflict_do_nothing()
    )


async def is_revoked(db: AsyncSession, claims: dict[str, Any]) -> bool:
    jti = claims.get("jti")
    if not jti:
        return False
    found = await db.scalar(select(RevokedToken.jti).where(RevokedToken.jti == str(jti)))
    return found is not None
