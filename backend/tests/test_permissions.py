"""Who may touch which association, and how far.

These are plain functions over already-loaded rows, which is the point: the
answer must not depend on a query that could be written differently at a
second call site.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.api.auth_deps import may_access, may_edit_live, read_token
from app.core.config import settings
from app.models.enums import UserRole


def user(role: UserRole, *grants: tuple[int, bool]) -> SimpleNamespace:
    return SimpleNamespace(
        role=role,
        is_admin=role is UserRole.ADMIN,
        associations=[
            SimpleNamespace(association_id=aid, can_edit_live=live)
            for aid, live in grants
        ],
    )


IPEIROU = SimpleNamespace(id=1, slug="epsip-ipeirou")
ATTIKIS = SimpleNamespace(id=2, slug="epsa")


def test_an_admin_reaches_an_association_with_no_grant_row() -> None:
    # Admin scope comes from the role; user_associations is empty for them by
    # design, and reading access off that table alone would lock them out.
    assert may_access(user(UserRole.ADMIN), IPEIROU)


def test_an_editor_reaches_only_what_was_granted() -> None:
    editor = user(UserRole.EDITOR, (IPEIROU.id, False))
    assert may_access(editor, IPEIROU)
    assert not may_access(editor, ATTIKIS)


def test_an_editor_with_no_grants_reaches_nothing() -> None:
    assert not may_access(user(UserRole.EDITOR), IPEIROU)


def test_access_is_not_permission_to_edit_a_live_score() -> None:
    # The two are separate columns because they are separate amounts of trust:
    # a live edit outranks the official source for 48 hours.
    editor = user(UserRole.EDITOR, (IPEIROU.id, False))
    assert may_access(editor, IPEIROU)
    assert not may_edit_live(editor, IPEIROU)


def test_a_granted_editor_may_edit_live() -> None:
    assert may_edit_live(user(UserRole.EDITOR, (IPEIROU.id, True)), IPEIROU)


def test_live_permission_does_not_leak_across_associations() -> None:
    editor = user(UserRole.EDITOR, (IPEIROU.id, True), (ATTIKIS.id, False))
    assert may_edit_live(editor, IPEIROU)
    assert not may_edit_live(editor, ATTIKIS)


def test_an_admin_may_always_edit_live() -> None:
    assert may_edit_live(user(UserRole.ADMIN), ATTIKIS)


# --- where the token is read from ------------------------------------------


def request(cookies: dict[str, str], headers: dict[str, str]) -> SimpleNamespace:
    return SimpleNamespace(cookies=cookies, headers=headers)


def test_the_cookie_is_read() -> None:
    assert read_token(request({settings.session_cookie: "tok"}, {})) == "tok"


def test_a_bearer_header_is_read() -> None:
    assert read_token(request({}, {"Authorization": "Bearer tok"})) == "tok"


def test_the_scheme_is_matched_case_insensitively() -> None:
    assert read_token(request({}, {"Authorization": "bearer tok"})) == "tok"


def test_the_cookie_wins_over_a_header() -> None:
    # A stale header left in a client must not shadow a live login.
    got = read_token(
        request({settings.session_cookie: "fresh"}, {"Authorization": "Bearer stale"})
    )
    assert got == "fresh"


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": ""}, {"Authorization": "Bearer"}, {"Authorization": "Basic x"}],
)
def test_nothing_usable_reads_as_no_token(headers: dict[str, str]) -> None:
    assert read_token(request({}, headers)) is None
