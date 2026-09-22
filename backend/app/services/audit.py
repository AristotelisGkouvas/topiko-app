"""Recording who changed what.

Append-only, and written in the same transaction as the change it describes.
Logging afterwards in a second commit means a crash between the two produces
an edit nobody made, which is precisely the case the log exists to answer.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Association, AuditLog, User


def changed_fields(
    before: dict[str, Any], after: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Only what actually moved.

    An editor who opens a match, changes one score and saves sends every field
    back. Storing all of them would bury the one that changed among fifteen
    that did not, and "I did not enter that score" is answered by a diff.
    """
    keys = [k for k in after if before.get(k) != after.get(k)]
    return {k: before.get(k) for k in keys}, {k: after[k] for k in keys}


def record(
    db: AsyncSession,
    *,
    user: User,
    association: Association | None,
    action: str,
    entity_type: str,
    entity_id: int | None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditLog:
    """Add a log row to the current transaction. Does not commit."""
    entry = AuditLog(
        user_id=user.id,
        # Copied, not just referenced: the row survives the account being
        # deleted, and a user_id pointing at nothing names nobody.
        user_email=user.email,
        association_id=association.id if association else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=before,
        new_value=after,
        ip_address=_client_ip(request),
        user_agent=(request.headers.get("user-agent", "")[:255] or None)
        if request
        else None,
    )
    db.add(entry)
    return entry


def _client_ip(request: Request | None) -> str | None:
    """The caller's address, honouring one proxy hop.

    Behind the compose setup the socket address is the proxy's, so every entry
    would otherwise read as the same container. Only the first hop of
    X-Forwarded-For is trusted; the rest is client-supplied and means nothing.
    """
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45] or None
    return request.client.host[:45] if request.client else None
