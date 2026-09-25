"""Who is asking, and what they are allowed to touch.

Separate from `deps.py` because those resolve *what* a request is about — the
association, the season, the league — and these resolve *who* is making it.
Mixing them would put an optional-auth import in the path of every public read.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentAssociation, DbSession
from app.core.config import settings
from app.core.security import decode_access_token
from app.models import Association, User, UserAssociation
from app.services.sessions import is_revoked

#: One message for every way authentication can fail. Telling the caller
#: whether the account exists, is disabled or simply mistyped its password
#: turns the login form into a way to enumerate editors.
_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Απαιτείται σύνδεση.",
)


def read_token(request: Request) -> str | None:
    """The session token, from the cookie or an Authorization header.

    The cookie is what the dashboard uses — httpOnly, so a script that manages
    to run on the page still cannot read it. The header is for curl and for
    tests, and is checked second so a stale header cannot shadow a live login.
    """
    cookie = request.cookies.get(settings.session_cookie)
    if cookie:
        return cookie
    header = request.headers.get("Authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() == "bearer" and value:
        return value
    return None


async def get_current_user(request: Request, db: DbSession) -> User:
    token = read_token(request)
    if token is None:
        raise _UNAUTHENTICATED

    claims = decode_access_token(token)
    if claims is None or await is_revoked(db, claims):
        raise _UNAUTHENTICATED

    try:
        user_id = int(claims["sub"])
    except (KeyError, TypeError, ValueError):
        raise _UNAUTHENTICATED from None

    user = (
        await db.execute(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.associations))
        )
    ).scalar_one_or_none()

    # Re-read the account on every request rather than trusting the claims.
    # A token stays valid for hours; revoking access has to take effect before
    # it expires, or "remove this editor" means "remove them by tomorrow".
    if user is None or not user.is_active:
        raise _UNAUTHENTICATED
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Απαιτούνται δικαιώματα διαχειριστή.",
        )
    return user


CurrentAdmin = Annotated[User, Depends(get_current_admin)]


def _grant_for(user: User, association_id: int) -> UserAssociation | None:
    for grant in user.associations:
        if grant.association_id == association_id:
            return grant
    return None


def may_access(user: User, association: Association) -> bool:
    """Admins are global; editors reach only what they were granted."""
    return user.is_admin or _grant_for(user, association.id) is not None


def may_edit_live(user: User, association: Association) -> bool:
    """Whether this user may change a score while the match is being played.

    Deliberately narrower than access: seeing the dashboard for an association
    and being trusted to type a score mid-match are different amounts of trust,
    and the reconciliation rules let a live edit outrank the official source
    for 48 hours.
    """
    if user.is_admin:
        return True
    grant = _grant_for(user, association.id)
    return grant is not None and grant.can_edit_live


async def require_association_access(
    user: CurrentUser,
    association: CurrentAssociation,
) -> Association:
    if not may_access(user, association):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Δεν έχεις πρόσβαση στην ένωση '{association.slug}'.",
        )
    return association


EditableAssociation = Annotated[Association, Depends(require_association_access)]
