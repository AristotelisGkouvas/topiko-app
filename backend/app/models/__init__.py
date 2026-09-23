"""SQLAlchemy models.

Everything is imported here so that `Base.metadata` is complete by the time
Alembic autogenerate looks at it — a model that is never imported is a table
that silently never gets a migration.
"""

from app.models.association import Association, Season
from app.models.base import Base, TimestampMixin
from app.models.announcement import Announcement
from app.models.club import Field, Team
from app.models.event import MatchEvent
from app.models.enums import (
    ConflictStatus,
    DataSource,
    FieldSurface,
    LeagueKind,
    MatchEventKind,
    MatchStatus,
    PredictionChoice,
    ScrapeRunStatus,
    StandingZone,
    UserRole,
)
from app.models.league import League, LeagueTeam
from app.models.match import (
    MANUAL_PRIORITY_WINDOW,
    Match,
    ScrapeConflict,
    Standing,
)
from app.models.player import Player, PlayerStat, PlayerSuspension
from app.models.prediction import MatchPrediction
from app.models.push import PushSubscription
from app.models.volunteer import ClubAccessCode
from app.models.scraping import ScrapeRun, TeamAlias
from app.models.user import AuditLog, User, UserAssociation

__all__ = [
    "Announcement",
    "MANUAL_PRIORITY_WINDOW",
    "Association",
    "AuditLog",
    "Base",
    "ConflictStatus",
    "DataSource",
    "Field",
    "FieldSurface",
    "League",
    "LeagueKind",
    "LeagueTeam",
    "Match",
    "MatchEvent",
    "MatchEventKind",
    "MatchPrediction",
    "MatchStatus",
    "Player",
    "PlayerStat",
    "PlayerSuspension",
    "ScrapeConflict",
    "PredictionChoice",
    "PushSubscription",
    "ClubAccessCode",
    "ScrapeRun",
    "ScrapeRunStatus",
    "Season",
    "Standing",
    "StandingZone",
    "Team",
    "TeamAlias",
    "TimestampMixin",
    "User",
    "UserAssociation",
    "UserRole",
]
