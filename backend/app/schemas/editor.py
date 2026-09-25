"""What the dashboard sends and receives."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import FieldSurface, MatchStatus, ScrapeRunStatus


class MatchEdit(BaseModel):
    """What an editor may change on a match.

    Every field is optional and `None` is a real value — clearing a score is
    how a result entered by mistake is taken back — so the difference between
    "leave alone" and "set to nothing" is whether the key was sent at all.
    """

    home_score: int | None = Field(default=None, ge=0, le=99)
    away_score: int | None = Field(default=None, ge=0, le=99)
    home_score_ht: int | None = Field(default=None, ge=0, le=99)
    away_score_ht: int | None = Field(default=None, ge=0, le=99)
    status: MatchStatus | None = None
    minute: int | None = Field(default=None, ge=0, le=130)
    referee: str | None = Field(default=None, max_length=120)
    note: str | None = None
    #: True while the match is being played. Drives the LIVE badge.
    is_live: bool | None = None
    #: Marks the score as checked against the official sheet, which ends the
    #: scraper's 48-hour deference early.
    confirmed: bool | None = None
    #: A new date and ground, for a postponement. Held against the scraper for
    #: the manual window, so the federation's stale page does not undo it.
    kickoff_at: datetime | None = None
    field_id: int | None = None


class FieldEdit(BaseModel):
    """Venue details. The federation publishes almost none of this, and
    coordinates not at all — a ground gets a map only if somebody types one."""

    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    postal_code: str | None = Field(default=None, max_length=16)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    surface: FieldSurface | None = None
    capacity: int | None = Field(default=None, ge=0, le=200_000)
    has_floodlights: bool | None = None
    notes: str | None = None
    #: The federation's spelling is often "ΔΗΜ. ΓΗΠΕΔΟ ..." in capitals; the
    #: secretary can give it the name people use.
    name: str | None = Field(default=None, min_length=2, max_length=160)
    short_name: str | None = Field(default=None, max_length=60)


#: #RRGGBB, as <input type="color"> sends it. Stored lower-case so the same
#: colour is never two strings.
HEX_COLOR = r"^#[0-9a-fA-F]{6}$"
#: Only web links: a sponsor row is rendered as a link on a public page, and
#: "javascript:" in an href is a script with the site's origin.
WEB_URL = r"^https?://[^\s]+$"


class TeamLookEdit(BaseModel):
    """A club's colours. `None` clears one; a key not sent is left alone."""

    primary_color: str | None = Field(default=None, pattern=HEX_COLOR)
    secondary_color: str | None = Field(default=None, pattern=HEX_COLOR)


class PhotoEdit(BaseModel):
    caption: str | None = Field(default=None, max_length=200)


class SponsorEdit(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    website_url: str | None = Field(default=None, max_length=255, pattern=WEB_URL)
    is_active: bool | None = None


class OrderIn(BaseModel):
    """Every id of the list, in the new order. The whole list rather than one
    move, so two tabs reordering at once end in one of their orders and not in
    a mixture of both."""

    ids: list[int] = Field(max_length=200)


class AuditEntryOut(BaseModel):
    id: int
    user_email: str | None
    action: str
    entity_type: str
    entity_id: int | None
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    created_at: datetime


class ClubCodeOut(BaseModel):
    """A code as the dashboard lists it. Never the code itself."""

    id: int
    team_slug: str
    team_name: str
    prefix: str
    label: str | None = None
    is_active: bool
    last_used_at: datetime | None = None
    created_at: datetime


class IssuedCodeOut(ClubCodeOut):
    #: The plaintext, returned exactly once — at the moment it is created and
    #: never again. It is stored hashed, so there is nowhere to read it back
    #: from. Write it on the card before closing the dialog.
    code: str


class IssueCodeIn(BaseModel):
    team_slug: str = Field(min_length=1, max_length=120)
    #: Who is getting the paper. Worth more in six months than a row that only
    #: says a code exists.
    label: str | None = Field(default=None, max_length=120)


class ScrapeRunOut(BaseModel):
    """One scraper run, as the dashboard's "Ενημερώσεις" tab lists it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    source_key: str
    status: ScrapeRunStatus
    started_at: datetime
    finished_at: datetime | None = None
    http_requests: int
    matches_created: int
    matches_updated: int
    matches_deferred: int
    conflicts_opened: int
    warnings: list[Any] = []
    error: str | None = None
