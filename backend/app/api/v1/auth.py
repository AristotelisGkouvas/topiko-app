"""Login, logout, and who am I.

Not tenant-scoped, unlike everything in `public.py`: an account is a person,
and a person can hold grants in more than one association. Which associations
they may touch comes back from /me rather than from the URL.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.auth_deps import CurrentUser, read_token
from app.api.deps import DbSession
from app.core.config import settings
from app.core.ratelimit import login_limit
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.models import Association, User
from app.services.sessions import revoke

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

#: Verifying a hash that does not exist still has to take about as long as
#: verifying one that does, or the response time answers "is this an account?"
#: for anyone who asks twice. Hashing a throwaway password is the honest way to
#: spend the same work.
_DUMMY_HASH = hash_password("not-a-real-password")


class LoginIn(BaseModel):
    """What the login form sends.

    `email` is a plain string on purpose. Validating the format here would
    answer "is this even an address?" with a 422 while a wrong password gets a
    401 — the same distinction the single error message below exists to hide.
    It also rejects perfectly good internal domains. The address is only ever
    compared against a stored one, so its shape is not this endpoint's problem.
    """

    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)


class AssociationGrant(BaseModel):
    slug: str
    name: str
    can_edit_live: bool


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: str
    associations: list[AssociationGrant]


async def _describe(user: User, db: DbSession) -> UserOut:
    """The account as the dashboard needs it, grants resolved to names."""
    if user.is_admin:
        # Admins hold no rows in user_associations — their scope is the role.
        rows = (
            await db.execute(
                select(Association)
                .where(Association.is_active.is_(True))
                .order_by(Association.slug)
            )
        ).scalars()
        grants = [
            AssociationGrant(slug=a.slug, name=a.name, can_edit_live=True) for a in rows
        ]
    else:
        ids = [g.association_id for g in user.associations]
        by_id = {
            a.id: a
            for a in (
                await db.execute(select(Association).where(Association.id.in_(ids)))
            ).scalars()
        }
        grants = [
            AssociationGrant(
                slug=by_id[g.association_id].slug,
                name=by_id[g.association_id].name,
                can_edit_live=g.can_edit_live,
            )
            for g in user.associations
            if g.association_id in by_id
        ]

    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        associations=grants,
    )


@router.post(
    "/login", response_model=UserOut, dependencies=[Depends(login_limit)]
)
async def login(
    payload: LoginIn,
    response: Response,
    db: DbSession,
) -> UserOut:
    user = (
        await db.execute(
            select(User)
            .where(User.email == payload.email.lower())
            .options(selectinload(User.associations))
        )
    ).scalar_one_or_none()

    # Same work and the same answer whether the account is missing, disabled or
    # simply given the wrong password.
    stored = user.password_hash if user is not None else _DUMMY_HASH
    ok = await asyncio.to_thread(verify_password, payload.password, stored)

    if user is None or not user.is_active or not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Λάθος email ή κωδικός.",
        )

    # Argon2 parameters move over time; login is the only moment the plaintext
    # is available to re-hash with the current ones.
    if needs_rehash(user.password_hash):
        user.password_hash = await asyncio.to_thread(hash_password, payload.password)

    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user, ["associations"])

    token, expires_at = create_access_token(user.id, user.email, user.role.value)
    response.set_cookie(
        key=settings.session_cookie,
        value=token,
        # Unreachable from scripts on the page, so an XSS hole does not become
        # a stolen session.
        httponly=True,
        secure=settings.cookie_secure,
        # Lax, not Strict: the dashboard is reached by following links, and
        # Strict would present a logged-in user with a login form.
        samesite="lax",
        max_age=int((expires_at - datetime.now(UTC)).total_seconds()),
        path="/",
    )
    return await _describe(user, db)


# response_model=None is load-bearing: FastAPI reads the return annotation when
# none is given, `-> None` resolves to NoneType, and a truthy response model on
# a 204 trips an assertion at import time.
@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def logout(request: Request, response: Response, db: DbSession) -> None:
    # Revoked first: deleting the cookie only asks this browser to forget it,
    # and a copy of the token would otherwise stay valid until it expires.
    token = read_token(request)
    await revoke(db, decode_access_token(token) if token else None)
    await db.commit()
    # Deleted by matching attributes, not just name: a cookie set with a path
    # and dropped without one survives, and the user stays logged in.
    response.delete_cookie(
        key=settings.session_cookie,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser, db: DbSession) -> UserOut:
    return await _describe(user, db)
