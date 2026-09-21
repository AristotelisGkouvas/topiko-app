"""Password hashing and session tokens.

Kept apart from the routes because these are the two decisions that are
expensive to change later: a password hash format has to be migrated user by
user as people log in, and a token format has to stay readable by every
deployment that still holds one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

#: Argon2id at the library defaults, which track the OWASP guidance. Tuning
#: these changes the hash parameters, not the format — `needs_rehash` below is
#: what moves existing users onto new settings.
_hasher = PasswordHasher()

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Whether the password matches.

    Every failure mode collapses to False on purpose. A malformed hash in the
    database is a bug worth fixing, but raising here would tell whoever is at
    the login form that this particular account is interesting.
    """
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """True when the stored hash predates the current Argon2 parameters.

    Only checkable while the plaintext is in hand, which is at login — so the
    caller rehashes there or not at all.
    """
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def create_access_token(
    user_id: int,
    email: str,
    role: str,
    expires_delta: timedelta | None = None,
) -> tuple[str, datetime]:
    """Sign a session token. Returns the token and when it stops being valid.

    The expiry comes back with it so the caller can put the same lifetime on
    the cookie: a cookie that outlives its token logs somebody out with no
    explanation, and one that dies first throws away a good session.
    """
    now = datetime.now(UTC)
    expires_at = now + (
        expires_delta or timedelta(minutes=settings.access_token_ttl_minutes)
    )
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        # Identifies this token specifically, so a single session can be
        # revoked later without invalidating everyone's.
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
    return token, expires_at


def decode_access_token(token: str) -> dict[str, Any] | None:
    """The token's claims, or None if it is expired, forged or malformed.

    `algorithms` is pinned to the one we sign with. Accepting whatever the
    token's own header asks for is how a signed token gets swapped for an
    unsigned one.
    """
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
