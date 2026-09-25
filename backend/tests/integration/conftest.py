"""Integration tests: the real app, a real Postgres, over HTTP.

The unit tests cover pure functions. Everything that lives in a router — the
tenant join, the auth gates, the wiring from an edit to the table — only runs
here. They need a database of their own, named by TEST_DATABASE_URL, which is
wiped before every test; without the variable the whole directory is skipped,
so `pytest` on a laptop with no Postgres still runs the unit suite.

    TEST_DATABASE_URL=postgresql+asyncpg://pamesentra:pamesentra@127.0.0.1:5432/pamesentra_test

127.0.0.1 rather than localhost: on Windows localhost tries IPv6 first and
every connection waits two seconds for it to fail.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

if not TEST_DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL δεν έχει οριστεί", allow_module_level=True)

from app.core import ratelimit  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.db import get_db  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Association,
    Base,
    ClubAccessCode,
    League,
    LeagueTeam,
    Match,
    Season,
    Team,
    User,
    UserAssociation,
)
from app.models.enums import MatchStatus, UserRole  # noqa: E402
from app.services import volunteer as volunteer_service  # noqa: E402

SITE = settings.cors_origins[0]


def _sync_url(url: str) -> str:
    return url.replace("+asyncpg", "+psycopg2")


@pytest.fixture(scope="session", autouse=True)
def _schema() -> None:
    """Built once from the models. The migrations are checked separately
    (`alembic upgrade head && alembic check` in CI)."""
    engine = create_engine(_sync_url(TEST_DATABASE_URL), poolclass=NullPool)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    Base.metadata.create_all(engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean() -> None:
    engine = create_engine(_sync_url(TEST_DATABASE_URL), poolclass=NullPool)
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    engine.dispose()
    # The throttles are process-wide; one test's logins must not starve the next.
    for limit in (ratelimit.login_limit, ratelimit.code_login_limit, ratelimit.vote_limit):
        limit._hits.clear()


@pytest_asyncio.fixture
async def sessionmaker() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app.dependency_overrides[get_db] = override
    yield maker
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


@pytest_asyncio.fixture
async def db(sessionmaker: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        yield session


@pytest_asyncio.fixture
async def client(sessionmaker: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@dataclass
class Tenant:
    association: Association
    season: Season
    league: League
    home: Team
    away: Team
    match: Match


@dataclass
class World:
    a: Tenant
    b: Tenant
    admin: User
    editor: User  # access to A, not trusted with live scores
    live_editor: User  # access to A, trusted with live scores
    code: ClubAccessCode  # A's home club
    code_plaintext: str


async def _tenant(db: AsyncSession, slug: str) -> Tenant:
    association = Association(slug=slug, name=f"ΕΠΣ {slug}")
    db.add(association)
    await db.flush()
    season = Season(association_id=association.id, slug="2025-2026", name="2025-2026", is_current=True)
    db.add(season)
    await db.flush()
    # Same league slug in both tenants on purpose: only the tenant join tells
    # them apart.
    league = League(
        association_id=association.id,
        season_id=season.id,
        slug="a-katigoria",
        name="Α΄ Κατηγορία",
        tier=1,
        total_matchdays=10,
        current_matchday=1,
    )
    home = Team(association_id=association.id, slug=f"home-{slug}", name=f"ΓΗΠΕΔΟΥΧΟΣ {slug}")
    away = Team(association_id=association.id, slug=f"away-{slug}", name=f"ΦΙΛΟΞΕΝΟΥΜΕΝΗ {slug}")
    db.add_all([league, home, away])
    await db.flush()
    db.add_all(
        [
            LeagueTeam(league_id=league.id, team_id=home.id),
            LeagueTeam(league_id=league.id, team_id=away.id),
        ]
    )
    match = Match(
        league_id=league.id,
        matchday=1,
        home_team_id=home.id,
        away_team_id=away.id,
        kickoff_at=datetime.now(UTC) - timedelta(days=2),
        status=MatchStatus.SCHEDULED,
    )
    db.add(match)
    await db.flush()
    return Tenant(association, season, league, home, away, match)


@pytest_asyncio.fixture
async def world(db: AsyncSession) -> World:
    a = await _tenant(db, "alpha")
    b = await _tenant(db, "beta")

    password = hash_password("correct horse battery")
    admin = User(email="admin@example.gr", password_hash=password, role=UserRole.ADMIN)
    editor = User(email="editor@example.gr", password_hash=password, role=UserRole.EDITOR)
    live_editor = User(email="live@example.gr", password_hash=password, role=UserRole.EDITOR)
    db.add_all([admin, editor, live_editor])
    await db.flush()
    db.add_all(
        [
            UserAssociation(user_id=editor.id, association_id=a.association.id),
            UserAssociation(
                user_id=live_editor.id, association_id=a.association.id, can_edit_live=True
            ),
        ]
    )
    code, plaintext = await volunteer_service.issue(
        db, association_id=a.association.id, team=a.home, label=None, created_by_id=admin.id
    )
    await db.commit()
    return World(a, b, admin, editor, live_editor, code, plaintext)


def session_for(user: User) -> dict[str, str]:
    """Cookies for a logged-in user, without going through the login form."""
    token, _ = create_access_token(user.id, user.email, user.role.value)
    return {settings.session_cookie: token}


#: Sent on every write, as a browser on the site itself would.
SAME_SITE = {"Origin": SITE}
