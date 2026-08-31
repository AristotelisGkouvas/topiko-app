from datetime import date
from decimal import Decimal

from app.models.enums import FieldSurface, LeagueKind
from app.schemas.common import ORMModel


class AssociationOut(ORMModel):
    id: int
    slug: str
    name: str
    short_name: str | None = None
    region: str | None = None
    source_url: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None


class SeasonOut(ORMModel):
    id: int
    slug: str
    name: str
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool


class FieldRef(ORMModel):
    """Just enough to render the venue line on a match card."""

    id: int
    slug: str
    name: str
    short_name: str | None = None
    city: str | None = None


class FieldOut(FieldRef):
    address: str | None = None
    postal_code: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    surface: FieldSurface | None = None
    capacity: int | None = None
    has_floodlights: bool | None = None
    notes: str | None = None


class TeamRef(ORMModel):
    """Team as it appears inside a match card or a standings row."""

    id: int
    slug: str
    name: str
    short_name: str | None = None
    initials: str | None = None
    logo_url: str | None = None


class TeamOut(TeamRef):
    founded_year: int | None = None
    city: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    home_field: FieldRef | None = None


class TeamDetailOut(TeamOut):
    """One club, with the seasons it actually played in.

    A club that folded in 2019 has ten years of matches and none this season,
    so a page pinned to the current one is blank for half the register. The
    list is only computed for a single club — doing it for all 172 would be a
    query per row.
    """

    seasons: list[str] = []


class LeagueOut(ORMModel):
    id: int
    slug: str
    name: str
    short_name: str | None = None
    kind: LeagueKind
    tier: int | None = None
    #: "Κ10", "Παίδων", … Absent for the open-age divisions, which is how the
    #: reader tells a club championship from an academy one.
    age_group: str | None = None
    group_name: str | None = None
    total_matchdays: int | None = None
    current_matchday: int | None = None
    zones: dict = {}
    season: SeasonOut
