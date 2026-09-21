"""Password hashing and session tokens.

The reason these get tests and most helpers do not: every failure here is
silent. A token that verifies when it should not still returns 200, a hash
comparison that always succeeds still logs people in, and nothing in the app
looks different until somebody is inside an account that is not theirs.
"""

from __future__ import annotations

from datetime import timedelta

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_a_hash_does_not_contain_the_password() -> None:
    hashed = hash_password("συνθηματικό-με-ελληνικά")
    assert "συνθηματικό" not in hashed
    assert hashed.startswith("$argon2")


def test_the_same_password_hashes_differently_each_time() -> None:
    # Per-hash salt. Equal hashes would mean two users with the same password
    # are visibly the same in a database dump.
    assert hash_password("same-password") != hash_password("same-password")


def test_the_right_password_verifies() -> None:
    assert verify_password("correct horse", hash_password("correct horse"))


def test_the_wrong_password_does_not() -> None:
    assert not verify_password("wrong horse", hash_password("correct horse"))


@pytest.mark.parametrize(
    "rubbish",
    ["", "not-a-hash", "$argon2id$v=19$truncated", "$2b$12$bcryptshapedthing"],
)
def test_a_malformed_stored_hash_is_a_failed_login_not_a_crash(rubbish: str) -> None:
    # A 500 here would single out the one account whose row is damaged.
    assert verify_password("anything", rubbish) is False


def test_a_fresh_token_carries_who_it_is_for() -> None:
    token, _ = create_access_token(7, "a@b.gr", "editor")
    claims = decode_access_token(token)
    assert claims is not None
    assert claims["sub"] == "7"
    assert claims["email"] == "a@b.gr"
    assert claims["role"] == "editor"


def test_two_tokens_for_the_same_user_are_distinct() -> None:
    # The jti is what lets one session be revoked without ending the others.
    first, _ = create_access_token(7, "a@b.gr", "editor")
    second, _ = create_access_token(7, "a@b.gr", "editor")
    assert decode_access_token(first)["jti"] != decode_access_token(second)["jti"]


def test_an_expired_token_is_refused() -> None:
    token, _ = create_access_token(
        7, "a@b.gr", "editor", expires_delta=timedelta(seconds=-1)
    )
    assert decode_access_token(token) is None


def test_a_token_signed_with_another_key_is_refused() -> None:
    forged = jwt.encode(
        {"sub": "1", "role": "admin"}, "a-different-secret", algorithm=ALGORITHM
    )
    assert decode_access_token(forged) is None


def test_an_unsigned_token_is_refused() -> None:
    # The classic JWT attack: take a real token, swap alg to "none", keep the
    # claims. Refused because decode pins the algorithm instead of reading it
    # out of the token's own header.
    forged = jwt.encode({"sub": "1", "role": "admin"}, key="", algorithm="none")
    assert decode_access_token(forged) is None


def test_a_tampered_payload_is_refused() -> None:
    token, _ = create_access_token(7, "a@b.gr", "editor")
    header, payload, signature = token.split(".")
    # Same signature, different body.
    other, _ = create_access_token(8, "b@c.gr", "admin")
    assert decode_access_token(f"{header}.{other.split('.')[1]}.{signature}") is None


def test_the_expiry_comes_back_with_the_token() -> None:
    # The cookie is given the same lifetime; a mismatch either logs somebody
    # out with no explanation or throws away a session that was still good.
    token, expires_at = create_access_token(7, "a@b.gr", "editor")
    assert decode_access_token(token)["exp"] == int(expires_at.timestamp())


def test_the_default_lifetime_comes_from_settings() -> None:
    _, expires_at = create_access_token(7, "a@b.gr", "editor")
    from datetime import UTC, datetime

    minutes = (expires_at - datetime.now(UTC)).total_seconds() / 60
    assert abs(minutes - settings.access_token_ttl_minutes) < 1
